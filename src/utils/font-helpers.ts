import type { Document, Font } from "indesign";
import { forEachCollectionItem, getCollectionLength } from "./collection-helpers";
import { getInDesignModule } from "./indesign-runtime";

export const FONT_STATUS_VALUES = {
  INSTALLED: 1718831470,
  NOT_AVAILABLE: 1718832705,
  FAUXED: 1718830689,
  SUBSTITUTED: 1718834037,
  UNKNOWN: 1433299822,
} as const;

export interface UsedFontInfo {
  font: Font;
  source: string;
}

interface TextRangeLike {
  appliedFont?: Font | string;
  length?: number;
  isValid?: boolean;
}

interface StoryLike {
  isValid?: boolean;
  textStyleRanges?: unknown;
  paragraphs?: unknown;
  tables?: unknown;
}

interface StyleLike {
  appliedFont?: Font | string;
  isValid?: boolean;
}

function numericEnum(source: unknown, keys: string[], fallback: number): number {
  if (!source || typeof source !== "object") return fallback;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value && typeof value === "object") {
      const inner = (value as { value?: unknown }).value;
      if (typeof inner === "number" && Number.isFinite(inner)) return inner;
    }
  }
  return fallback;
}

function resolveFontStatusConstants(): Record<keyof typeof FONT_STATUS_VALUES, number> {
  try {
    const { FontStatus } = getInDesignModule() as { FontStatus?: unknown };
    return {
      INSTALLED: numericEnum(FontStatus, ["INSTALLED", "installed"], FONT_STATUS_VALUES.INSTALLED),
      NOT_AVAILABLE: numericEnum(
        FontStatus,
        ["NOT_AVAILABLE", "notAvailable", "NOTAVAILABLE"],
        FONT_STATUS_VALUES.NOT_AVAILABLE
      ),
      FAUXED: numericEnum(FontStatus, ["FAUXED", "fauxed"], FONT_STATUS_VALUES.FAUXED),
      SUBSTITUTED: numericEnum(
        FontStatus,
        ["SUBSTITUTED", "substituted"],
        FONT_STATUS_VALUES.SUBSTITUTED
      ),
      UNKNOWN: numericEnum(FontStatus, ["UNKNOWN", "unknown"], FONT_STATUS_VALUES.UNKNOWN),
    };
  } catch {
    return FONT_STATUS_VALUES;
  }
}

function fourChar(code: number): string {
  return [24, 16, 8, 0]
    .map((shift) => {
      const charCode = (code >>> shift) & 255;
      return charCode >= 32 && charCode < 127 ? String.fromCharCode(charCode) : "";
    })
    .join("");
}

function statusLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 255) {
    return fourChar(value);
  }
  if (value && typeof value === "object") {
    const rec = value as { name?: unknown };
    if (typeof rec.name === "string") return rec.name;
    try {
      const text = String(value);
      if (text && text !== "[object Object]") return text;
    } catch {
      // ignore
    }
  }
  return "";
}

function unwrapStatus(status: unknown): { code: number | null; label: string } {
  if (typeof status === "number" && Number.isFinite(status)) {
    return { code: status, label: statusLabel(status) };
  }
  if (typeof status === "string") {
    const asNumber = Number(status);
    if (Number.isFinite(asNumber) && status.trim() !== "") {
      return { code: asNumber, label: statusLabel(asNumber) };
    }
    return { code: null, label: status };
  }
  if (status && typeof status === "object") {
    const rec = status as { value?: unknown; name?: unknown };
    const code = typeof rec.value === "number" && Number.isFinite(rec.value) ? rec.value : null;
    const label = statusLabel(status) || (code != null ? statusLabel(code) : "");
    return { code, label };
  }
  return { code: null, label: "" };
}

export function getFontStatus(font: Font): unknown {
  try {
    const status = font.status;
    if (status != null) return status;
  } catch {
    // ignore
  }
  try {
    const status = (font as Font & { properties?: { status?: unknown } }).properties?.status;
    if (status != null) return status;
  } catch {
    // ignore
  }
  try {
    if (font.isValid === false) return FONT_STATUS_VALUES.NOT_AVAILABLE;
  } catch {
    // ignore
  }
  return FONT_STATUS_VALUES.UNKNOWN;
}

function statusKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

export function isFontMissing(status: unknown): boolean {
  const constants = resolveFontStatusConstants();
  const { code, label } = unwrapStatus(status);
  if (code === constants.NOT_AVAILABLE || code === FONT_STATUS_VALUES.NOT_AVAILABLE) return true;
  const key = statusKey(label);
  return (
    key.includes("notavailable") ||
    key.includes("nava") ||
    key === "fsna" ||
    key.includes("missing") ||
    key.includes("ausente") ||
    key.includes("unavailable") ||
    key.includes("naodisponivel") ||
    key.includes("indisponivel")
  );
}

export function isFontSubstituted(status: unknown): boolean {
  const constants = resolveFontStatusConstants();
  const { code, label } = unwrapStatus(status);
  if (code === constants.SUBSTITUTED || code === FONT_STATUS_VALUES.SUBSTITUTED) return true;
  const key = statusKey(label);
  return key.includes("substitut") || key === "fssu";
}

function normalizeFontName(value: string): string {
  return value.replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
}

export function fontDisplayName(font: Font): string {
  const read = (getter: () => unknown): string => {
    try {
      const value = getter();
      return typeof value === "string" ? normalizeFontName(value) : "";
    } catch {
      return "";
    }
  };

  return (
    read(() => font.name) ||
    read(() => font.fullName) ||
    normalizeFontName(`${read(() => font.fontFamily)} ${read(() => font.fontStyleName)}`)
  );
}

function isSpecialFontName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return (
    normalized === "[no font]" ||
    normalized === "[sem fonte]" ||
    normalized === "[none]" ||
    normalized === "[nenhuma]"
  );
}

function missingFontStub(name: string): Font {
  return {
    name,
    fontFamily: name,
    fontStyleName: "",
    fullName: name,
    status: FONT_STATUS_VALUES.NOT_AVAILABLE,
    isValid: false,
  } as Font;
}

function resolveAppliedFont(doc: Document, applied: Font | string | null | undefined): Font | null {
  if (!applied) return null;

  if (typeof applied === "string") {
    const name = normalizeFontName(applied);
    if (!name || isSpecialFontName(name)) return null;
    try {
      const font = doc.fonts.itemByName(applied);
      if (font) return font;
    } catch {
      // fonte ausente: itemByName falha
    }
    try {
      const font = doc.fonts.itemByName(applied.replace(/ /g, "\t"));
      if (font) return font;
    } catch {
      // ignore
    }
    return missingFontStub(name);
  }

  try {
    const name = fontDisplayName(applied);
    if (isSpecialFontName(name)) return null;
    return applied;
  } catch {
    return null;
  }
}

function registerFont(
  doc: Document,
  applied: Font | string | null | undefined,
  source: string,
  seen: Set<string>,
  result: UsedFontInfo[]
): void {
  const font = resolveAppliedFont(doc, applied);
  if (!font) return;
  pushUsedFont(font, source, seen, result);
}

function pushUsedFont(font: Font, source: string, seen: Set<string>, result: UsedFontInfo[]): void {
  const name = fontDisplayName(font);
  if (isSpecialFontName(name)) return;

  const key = (name || font.fontFamily || "").toLowerCase();
  if (key) {
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ font, source });
    return;
  }

  try {
    if (font.isValid === false || isFontMissing(getFontStatus(font))) {
      const fallback = `fonte-ausente:${result.length}`;
      if (seen.has(fallback)) return;
      seen.add(fallback);
      result.push({ font, source });
    }
  } catch {
    // ignore
  }
}

function collectFontsFromTextRanges(
  doc: Document,
  ranges: unknown,
  source: string,
  seen: Set<string>,
  result: UsedFontInfo[]
): void {
  forEachCollectionItem<TextRangeLike>(ranges, (range) => {
    try {
      if (range.isValid === false) return;
      registerFont(doc, range.appliedFont, source, seen, result);
    } catch {
      // ignore invalid ranges
    }
  });
}

function collectFontsFromStory(
  doc: Document,
  story: StoryLike,
  storyIndex: number,
  seen: Set<string>,
  result: UsedFontInfo[]
): void {
  if (!story || story.isValid === false) return;

  const source = `Story ${storyIndex + 1}`;

  try {
    collectFontsFromTextRanges(doc, story.textStyleRanges, source, seen, result);
  } catch {
    // fallback abaixo
  }

  try {
    forEachCollectionItem<{ appliedFont?: Font | string; isValid?: boolean }>(
      story.paragraphs,
      (paragraph) => {
        if (paragraph.isValid === false) return;
        registerFont(doc, paragraph.appliedFont, source, seen, result);
      }
    );
  } catch {
    // ignore
  }

  try {
    forEachCollectionItem<{ cells?: unknown; isValid?: boolean }>(story.tables, (table) => {
      if (table.isValid === false) return;
      forEachCollectionItem<{ textStyleRanges?: unknown; paragraphs?: unknown }>(table.cells, (cell) => {
        collectFontsFromTextRanges(doc, cell.textStyleRanges, source, seen, result);
        collectFontsFromTextRanges(doc, cell.paragraphs, source, seen, result);
      });
    });
  } catch {
    // ignore
  }
}

function collectFontsFromStyles(doc: Document, seen: Set<string>, result: UsedFontInfo[]): void {
  try {
    forEachCollectionItem<StyleLike>(doc.paragraphStyles, (style) => {
      if (style.isValid === false) return;
      registerFont(doc, style.appliedFont, "Estilo de parágrafo", seen, result);
    });
  } catch {
    // ignore
  }

  try {
    forEachCollectionItem<StyleLike>(doc.characterStyles, (style) => {
      if (style.isValid === false) return;
      registerFont(doc, style.appliedFont, "Estilo de caractere", seen, result);
    });
  } catch {
    // ignore
  }
}

function collectFontsFromDocumentList(doc: Document, seen: Set<string>, result: UsedFontInfo[]): void {
  const push = (font: Font | null | undefined): void => {
    if (!font) return;
    pushUsedFont(font, "Documento", seen, result);
  };

  try {
    forEachCollectionItem<Font>(doc.fonts, push);
  } catch {
    // fallback por índice
  }

  try {
    const length = getCollectionLength(doc.fonts);
    for (let i = 0; i < length; i++) {
      try {
        push(doc.fonts.item(i));
      } catch {
        // índice de fonte ausente pode lançar no UXP
      }
    }
  } catch {
    // ignore
  }

  try {
    const elements = (
      doc.fonts as FontsWithEveryItem
    ).everyItem?.().getElements?.();
    if (Array.isArray(elements)) {
      for (const font of elements) push(font);
    }
  } catch {
    // ignore
  }
}

type FontsWithEveryItem = {
  everyItem?: () => { getElements?: () => Font[] };
};

/**
 * Mesma base da comprovação do InDesign: `document.fonts`.
 * Estilos, stories e tabelas entram como reforço (nome aplicado em string / override).
 */
export function collectUsedFonts(doc: Document): UsedFontInfo[] {
  const seen = new Set<string>();
  const result: UsedFontInfo[] = [];

  collectFontsFromDocumentList(doc, seen, result);
  collectFontsFromStyles(doc, seen, result);

  try {
    forEachCollectionItem<StoryLike>(doc.stories, (story, index) => {
      collectFontsFromStory(doc, story, index, seen, result);
    });
  } catch {
    // ignore
  }

  return result;
}

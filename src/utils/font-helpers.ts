import type { Document, Font } from "indesign";
import { getCollectionLength } from "./collection-helpers";
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

function unwrapStatus(status: unknown): { code: number | null; label: string } {
  if (typeof status === "number" && Number.isFinite(status)) {
    return { code: status, label: fourChar(status) };
  }
  if (typeof status === "string") {
    return { code: null, label: status };
  }
  if (status && typeof status === "object") {
    const rec = status as { value?: unknown; name?: unknown };
    const code = typeof rec.value === "number" && Number.isFinite(rec.value) ? rec.value : null;
    const label = typeof rec.name === "string" ? rec.name : code != null ? fourChar(code) : "";
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
  return FONT_STATUS_VALUES.UNKNOWN;
}

function statusKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function matchesStatus(
  status: unknown,
  codes: number[],
  labels: string[]
): boolean {
  const { code, label } = unwrapStatus(status);
  if (code != null && codes.includes(code)) return true;
  const key = statusKey(label);
  return labels.includes(key);
}

export function isFontMissing(status: unknown): boolean {
  const constants = resolveFontStatusConstants();
  return matchesStatus(
    status,
    [constants.NOT_AVAILABLE, FONT_STATUS_VALUES.NOT_AVAILABLE],
    ["notavailable", "fsna", "nava", "missing", "ausente"]
  );
}

export function isFontSubstituted(status: unknown): boolean {
  const constants = resolveFontStatusConstants();
  return matchesStatus(
    status,
    [constants.SUBSTITUTED, FONT_STATUS_VALUES.SUBSTITUTED],
    ["substituted", "fssu", "substituta", "substituto"]
  );
}

function normalizeFontName(value: string): string {
  return value.replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
}

function readFontString(getter: () => unknown): string {
  try {
    const value = getter();
    return typeof value === "string" ? normalizeFontName(value) : "";
  } catch {
    return "";
  }
}

function tidyFontName(name: string, family: string, style: string): string {
  let out = normalizeFontName(name);
  if (family && style) {
    const glued = `${family}${style}`;
    const compact = (value: string) => value.replace(/\s+/g, "").toLowerCase();
    if (compact(out) === compact(glued) || out.toLowerCase() === glued.toLowerCase()) {
      out = family.toLowerCase().endsWith(style.toLowerCase()) ? family : `${family} ${style}`;
    }
  }
  const parts = out.split(/\s+/).filter(Boolean);
  while (
    parts.length >= 2 &&
    parts[parts.length - 1].toLowerCase() === parts[parts.length - 2].toLowerCase()
  ) {
    parts.pop();
  }
  return parts.join(" ");
}

export function fontDisplayName(font: Font): string {
  const name = readFontString(() => font.name);
  const family = readFontString(() => font.fontFamily);
  const style = readFontString(() => font.fontStyleName);
  const full = readFontString(() => font.fullName);
  const primary = name || full;
  if (primary) return tidyFontName(primary, family, style);
  if (family && style) {
    return family.toLowerCase().endsWith(style.toLowerCase()) ? family : `${family} ${style}`;
  }
  return family || style;
}

/**
 * Mesma lista do painel Comprovação / Localizar fonte: `document.fonts`.
 * Não infere ausência a partir de nome aplicado em story/estilo.
 */
export function collectUsedFonts(doc: Document): UsedFontInfo[] {
  const seen = new Set<string>();
  const result: UsedFontInfo[] = [];

  const push = (font: Font | null | undefined): void => {
    if (!font) return;
    const name = fontDisplayName(font);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ font, source: "Documento" });
  };

  try {
    const length = getCollectionLength(doc.fonts);
    for (let i = 0; i < length; i++) {
      try {
        push(doc.fonts.item(i));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return result;
}

function readFontPath(font: Font): string {
  const extra = font as Font & { filePath?: unknown };
  const getters: Array<() => unknown> = [
    () => font.location,
    () => font.fontFilePath,
    () => extra.filePath,
  ];
  for (const getter of getters) {
    try {
      const value = getter();
      if (typeof value === "string" && value.trim()) return value.trim();
      if (value && typeof value === "object") {
        const rec = value as { nativePath?: string; fsName?: string; name?: string };
        if (typeof rec.nativePath === "string" && rec.nativePath) return rec.nativePath;
        if (typeof rec.fsName === "string" && rec.fsName) return rec.fsName;
        if (typeof rec.name === "string" && rec.name) return rec.name;
      }
    } catch {
      // tenta o próximo
    }
  }
  return "";
}

function fileExtension(path: string): string {
  const base = path.split(/[\\/]/).pop() || path;
  const clean = base.split("?")[0];
  const dot = clean.lastIndexOf(".");
  if (dot < 0 || dot === clean.length - 1) return "";
  return clean.slice(dot + 1).toLowerCase();
}

function readFontType(font: Font): unknown {
  try {
    if (font.fontType != null) return font.fontType;
  } catch {
    // ignore
  }
  try {
    const type = (font as Font & { properties?: { fontType?: unknown } }).properties?.fontType;
    if (type != null) return type;
  } catch {
    // ignore
  }
  return null;
}

function resolveFontTypeConstants(): {
  TRUE_TYPE: number;
  OPEN_TYPE_TT: number;
  OPEN_TYPE_CFF: number;
  OPEN_TYPE_CID: number;
} {
  try {
    const { FontTypes } = getInDesignModule() as { FontTypes?: unknown };
    return {
      TRUE_TYPE: numericEnum(FontTypes, ["TRUE_TYPE", "trueType", "TRUETYPE"], 1953653108),
      OPEN_TYPE_TT: numericEnum(FontTypes, ["OPEN_TYPE_TT", "openTypeTT", "OPENTYPETT"], 1868983924),
      OPEN_TYPE_CFF: numericEnum(FontTypes, ["OPEN_TYPE_CFF", "openTypeCFF", "OPENTYPECFF"], 1868983910),
      OPEN_TYPE_CID: numericEnum(FontTypes, ["OPEN_TYPE_CID", "openTypeCID", "OPENTYPECID"], 1868983913),
    };
  } catch {
    return {
      TRUE_TYPE: 1953653108,
      OPEN_TYPE_TT: 1868983924,
      OPEN_TYPE_CFF: 1868983910,
      OPEN_TYPE_CID: 1868983913,
    };
  }
}

function isPluginUtilityFont(font: Font): boolean {
  const family = readFontString(() => font.fontFamily).toLowerCase();
  const name = fontDisplayName(font).toLowerCase();
  return family === "calibri" || name.startsWith("calibri");
}

/** True se a fonte aplicada é TrueType (.TTF/.TTC), não OpenType CFF (.OTF). */
export function isTrueTypeAppliedFont(font: Font): boolean {
  if (isPluginUtilityFont(font)) return false;

  const ext = fileExtension(readFontPath(font));
  if (ext === "otf") return false;
  if (ext === "ttf" || ext === "ttc" || ext === "tte") return true;

  const type = readFontType(font);
  const constants = resolveFontTypeConstants();
  if (
    matchesStatus(type, [constants.OPEN_TYPE_CFF, constants.OPEN_TYPE_CID], [
      "opentypecff",
      "opentypecid",
      "otcf",
      "otff",
    ])
  ) {
    return false;
  }
  return matchesStatus(
    type,
    [constants.TRUE_TYPE, constants.OPEN_TYPE_TT],
    ["truetype", "truet", "opentypett", "ottt"]
  );
}

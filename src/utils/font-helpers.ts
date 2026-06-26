import type { Document, Font } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
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
  words?: unknown;
}

function resolveFontStatusConstants(): Record<keyof typeof FONT_STATUS_VALUES, number> {
  try {
    const { FontStatus } = getInDesignModule() as {
      FontStatus: Record<string, number>;
    };

    return {
      INSTALLED: FontStatus.INSTALLED ?? FontStatus.installed ?? FONT_STATUS_VALUES.INSTALLED,
      NOT_AVAILABLE:
        FontStatus.NOT_AVAILABLE ??
        FontStatus.notAvailable ??
        FONT_STATUS_VALUES.NOT_AVAILABLE,
      FAUXED: FontStatus.FAUXED ?? FontStatus.fauxed ?? FONT_STATUS_VALUES.FAUXED,
      SUBSTITUTED:
        FontStatus.SUBSTITUTED ?? FontStatus.substituted ?? FONT_STATUS_VALUES.SUBSTITUTED,
      UNKNOWN: FontStatus.UNKNOWN ?? FontStatus.unknown ?? FONT_STATUS_VALUES.UNKNOWN,
    };
  } catch {
    return FONT_STATUS_VALUES;
  }
}

export function getFontStatus(font: Font): number {
  try {
    return font.status;
  } catch {
    return FONT_STATUS_VALUES.UNKNOWN;
  }
}

export function isFontMissing(status: number): boolean {
  const constants = resolveFontStatusConstants();
  return status === constants.NOT_AVAILABLE;
}

export function isFontSubstituted(status: number): boolean {
  const constants = resolveFontStatusConstants();
  return status === constants.SUBSTITUTED;
}

function isSpecialFontName(name: string): boolean {
  const normalized = name.toLowerCase().trim();
  return (
    !normalized ||
    normalized === "[no font]" ||
    normalized === "[sem fonte]" ||
    normalized === "[none]"
  );
}

function resolveAppliedFont(doc: Document, applied: Font | string | null | undefined): Font | null {
  if (!applied) return null;

  if (typeof applied === "string") {
    if (isSpecialFontName(applied)) return null;
    try {
      const font = doc.fonts.itemByName(applied);
      return font && font.isValid ? font : null;
    } catch {
      return null;
    }
  }

  try {
    if (!applied.isValid) return null;
    if (isSpecialFontName(applied.name)) return null;
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

  const key = font.name || font.fontFamily;
  if (!key || seen.has(key)) return;

  seen.add(key);
  result.push({ font, source });
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
      if (typeof range.length === "number" && range.length === 0) return;
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
    // ignore paragraph traversal errors
  }
}

/**
 * Coleta fontes efetivamente aplicadas no conteúdo textual do documento.
 * Usa textStyleRanges (principal) e paragraphs (fallback), sem percorrer tabelas
 * diretamente — o conteúdo de tabelas já está nas stories.
 */
export function collectUsedFonts(doc: Document): UsedFontInfo[] {
  const seen = new Set<string>();
  const result: UsedFontInfo[] = [];

  try {
    forEachCollectionItem<StoryLike>(doc.stories, (story, index) => {
      collectFontsFromStory(doc, story, index, seen, result);
    });
  } catch {
    return result;
  }

  return result;
}

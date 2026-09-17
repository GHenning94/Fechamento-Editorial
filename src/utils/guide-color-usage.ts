import type { PageItem, ParagraphStyle } from "indesign";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "./collection-helpers";
import {
  isGraphicLineItem,
  isNoneSwatchName,
  itemHasFillOverprint,
  itemHasStrokeOverprint,
  readFillOverprintState,
  readStrokeOverprintState,
  readStrokeWeightPt,
  readTintPercent,
  skipGuideOverprintContainer,
  styleHasOverprintFill,
  swatchNameOf,
} from "./color-model";
import {
  isTextFrameItem,
  readEffectiveFillColor,
  textFillHasOverprint,
  textFrameFillLeaksFromContents,
} from "./fill-color";

export interface GuideColorUse {
  fillName: string;
  strokeName: string;
  fillOverprint: boolean;
  strokeOverprint: boolean;
}

type TextRun = {
  fillColor?: unknown;
  strokeColor?: unknown;
  overprintFill?: unknown;
  fillOverprint?: unknown;
  overprintStroke?: unknown;
  strokeOverprint?: unknown;
  properties?: Record<string, unknown>;
  characters?: unknown;
  appliedCharacterStyle?: { name?: string; fillColor?: unknown; overprintFill?: boolean };
  appliedParagraphStyle?: ParagraphStyle & { fillColor?: unknown };
};

function readSwatchName(getter: () => unknown): string {
  try {
    return swatchNameOf(getter() as { name?: string; isValid?: boolean } | string | null | undefined);
  } catch {
    return "";
  }
}

function hasPaintableFill(item: PageItem, fillName: string): boolean {
  if (!fillName || isNoneSwatchName(fillName)) return false;
  if (isGraphicLineItem(item)) return false;
  if (readTintPercent(() => item.fillTint) <= 0.5) return false;
  return true;
}

function hasPaintableStroke(item: PageItem, strokeName: string): boolean {
  if (!strokeName || isNoneSwatchName(strokeName)) return false;
  if (readStrokeWeightPt(item) <= 0) return false;
  try {
    if (readTintPercent(() => (item as PageItem & { strokeTint?: number }).strokeTint) <= 0.5) {
      return false;
    }
  } catch {
    // tint ilegível: o traço ainda pode pintar
  }
  return true;
}

function textContentsHaveOverprintFill(item: PageItem): boolean {
  if (textFillHasOverprint(item)) return true;

  const collections: unknown[] = [];
  try {
    collections.push((item as PageItem & { texts?: unknown }).texts);
  } catch {
    // ignore
  }
  try {
    collections.push((item as PageItem & { textStyleRanges?: unknown }).textStyleRanges);
  } catch {
    // ignore
  }

  for (const collection of collections) {
    const length = Math.min(getCollectionLength(collection), 16);
    for (let i = 0; i < length; i++) {
      const entry = getCollectionItem<{ overprintFill?: boolean; fillOverprint?: boolean }>(collection, i);
      if (entry && textFillHasOverprint(entry)) return true;
    }
  }
  return false;
}

function namedFill(value: unknown): string {
  const name = swatchNameOf(value as { name?: string } | string | null | undefined);
  if (!name || isNoneSwatchName(name)) return "";
  return name;
}

function textRunFillName(run: TextRun): string {
  const direct = namedFill(run.fillColor) || namedFill(run.properties?.fillColor);
  if (direct) return direct;
  return namedFill(readEffectiveFillColor(run as Parameters<typeof readEffectiveFillColor>[0]));
}

function textRunStrokeName(run: TextRun): string {
  return namedFill(run.strokeColor) || namedFill(run.properties?.strokeColor);
}

function inheritedFillOverprint(run: TextRun): boolean {
  try {
    const character = run.appliedCharacterStyle;
    if (character && styleHasOverprintFill(character as ParagraphStyle)) return true;
  } catch {
    // ignore
  }
  try {
    if (run.appliedParagraphStyle && styleHasOverprintFill(run.appliedParagraphStyle)) return true;
  } catch {
    // ignore
  }
  return false;
}

function textRunHasFillOverprint(run: TextRun): boolean {
  const local = readFillOverprintState(run);
  if (local != null) return local;
  try {
    const first = getCollectionItem<TextRun>(run.characters, 0);
    const nested = readFillOverprintState(first);
    if (nested != null) return nested;
  } catch {
    // ignore
  }
  return inheritedFillOverprint(run);
}

function textRunHasStrokeOverprint(run: TextRun): boolean {
  const local = readStrokeOverprintState(run);
  if (local != null) return local;
  try {
    const first = getCollectionItem<TextRun>(run.characters, 0);
    const nested = readStrokeOverprintState(first);
    if (nested != null) return nested;
  } catch {
    // ignore
  }
  return false;
}

function visitTextRuns(collection: unknown, visit: (run: TextRun) => void): void {
  const length = getCollectionLength(collection);
  for (let i = 0; i < length; i++) {
    const run = getCollectionItem<TextRun>(collection, i);
    if (run) visit(run);
  }
}

function visitItemTextRuns(item: PageItem, visit: (run: TextRun) => void): void {
  try {
    visitTextRuns((item as PageItem & { textStyleRanges?: unknown }).textStyleRanges, visit);
  } catch {
    // ignore
  }
  try {
    visitTextRuns((item as PageItem & { texts?: unknown }).texts, visit);
  } catch {
    // ignore
  }
  try {
    const tables = (item as PageItem & { tables?: unknown }).tables;
    forEachCollectionItem<{ cells?: unknown }>(tables, (table) => {
      if (!table) return;
      forEachCollectionItem<{ textStyleRanges?: unknown; texts?: unknown }>(table.cells, (cell) => {
        if (!cell) return;
        visitTextRuns(cell.textStyleRanges, visit);
        visitTextRuns(cell.texts, visit);
      });
    });
  } catch {
    // ignore
  }
}

/**
 * CorProf/GUIAS no texto (preenchimento do caractere), não no fundo da caixa.
 */
export function collectGuideTextColorUseFromItem(
  item: PageItem,
  isGuide: (name: string) => boolean
): GuideColorUse[] {
  if (skipGuideOverprintContainer(item)) return [];

  const byColor = new Map<string, GuideColorUse>();

  const touch = (kind: "fill" | "stroke", colorName: string, hasOverprint: boolean): void => {
    if (!colorName || !isGuide(colorName)) return;
    const key = `${kind}:${colorName}`;
    const current = byColor.get(key);
    if (!current) {
      byColor.set(key, {
        fillName: kind === "fill" ? colorName : "",
        strokeName: kind === "stroke" ? colorName : "",
        fillOverprint: kind === "fill" ? hasOverprint : false,
        strokeOverprint: kind === "stroke" ? hasOverprint : false,
      });
      return;
    }
    if (kind === "fill" && !hasOverprint) current.fillOverprint = false;
    if (kind === "stroke" && !hasOverprint) current.strokeOverprint = false;
  };

  visitItemTextRuns(item, (run) => {
    try {
      const fillName = textRunFillName(run);
      if (fillName) touch("fill", fillName, textRunHasFillOverprint(run));
    } catch {
      // ignore
    }
    try {
      const strokeName = textRunStrokeName(run);
      if (strokeName && !isNoneSwatchName(strokeName)) {
        touch("stroke", strokeName, textRunHasStrokeOverprint(run));
      }
    } catch {
      // ignore
    }
  });

  return Array.from(byColor.values());
}

/**
 * Lê fill/stroke que realmente pintam neste objeto.
 * Ignora grupo, imagem colocada, linha (fill), traço 0 pt e fundo de caixa copiado do texto.
 */
export function readGuideColorUse(
  item: PageItem,
  isGuide?: (name: string) => boolean
): GuideColorUse | null {
  if (skipGuideOverprintContainer(item)) return null;

  const fillNameRaw = readSwatchName(() => item.fillColor);
  const strokeNameRaw = readSwatchName(() => item.strokeColor);
  const fillName = hasPaintableFill(item, fillNameRaw) ? fillNameRaw : "";
  const strokeName = hasPaintableStroke(item, strokeNameRaw) ? strokeNameRaw : "";
  if (!fillName && !strokeName) return null;

  const match = isGuide ?? (() => true);
  let fillOverprint = false;
  if (fillName && match(fillName)) {
    fillOverprint = itemHasFillOverprint(item);
    if (
      !fillOverprint &&
      isTextFrameItem(item) &&
      textFrameFillLeaksFromContents(item) &&
      textContentsHaveOverprintFill(item)
    ) {
      fillOverprint = true;
    }
  }

  return {
    fillName,
    strokeName,
    fillOverprint,
    strokeOverprint: strokeName && match(strokeName) ? itemHasStrokeOverprint(item) : false,
  };
}

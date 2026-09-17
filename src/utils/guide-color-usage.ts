import type { PageItem } from "indesign";
import { getCollectionItem, getCollectionLength } from "./collection-helpers";
import {
  isGraphicLineItem,
  isNoneSwatchName,
  itemHasFillOverprint,
  itemHasStrokeOverprint,
  readStrokeWeightPt,
  readTintPercent,
  skipGuideOverprintContainer,
  swatchNameOf,
} from "./color-model";
import { isTextFrameItem, textFillHasOverprint, textFrameFillLeaksFromContents } from "./fill-color";

export interface GuideColorUse {
  fillName: string;
  strokeName: string;
  fillOverprint: boolean;
  strokeOverprint: boolean;
}

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

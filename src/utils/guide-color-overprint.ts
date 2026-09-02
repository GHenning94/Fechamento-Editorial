import type { Color, Document, ParagraphStyle } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
import {
  itemHasFillOverprint,
  itemHasStrokeOverprint,
  readColorOverprintFill,
  styleHasOverprintFill,
  swatchNameOf,
} from "./color-model";
import { walkDirectPageItems } from "./indesign-helpers";

export function colorOverprintSatisfied(
  doc: Document,
  color: Color,
  matchesName: (name: string) => boolean
): boolean {
  if (readColorOverprintFill(color) === true) return true;
  return !guideColorUsageMissingOverprint(doc, matchesName);
}

export function guideColorUsageMissingOverprint(
  doc: Document,
  matchesName: (name: string) => boolean
): boolean {
  let foundUsage = false;
  let missing = false;

  walkDirectPageItems(doc, (item) => {
    if (missing) return;
    try {
      if (matchesName(swatchNameOf(item.fillColor))) {
        foundUsage = true;
        if (!itemHasFillOverprint(item)) missing = true;
      }
    } catch {
      // ignore
    }
    try {
      if (matchesName(swatchNameOf(item.strokeColor))) {
        foundUsage = true;
        if (!itemHasStrokeOverprint(item)) missing = true;
      }
    } catch {
      // ignore
    }
  });

  if (missing) return true;

  forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
    if (missing || !style?.isValid) return;
    try {
      if (!matchesName(swatchNameOf(style.fillColor))) return;
      foundUsage = true;
      if (!styleHasOverprintFill(style)) missing = true;
    } catch {
      // ignore
    }
  });

  return foundUsage ? missing : false;
}

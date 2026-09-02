import type { Color, Document, ParagraphStyle } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
import {
  itemHasFillOverprint,
  itemHasStrokeOverprint,
  readColorOverprintFill,
  styleHasOverprintFill,
  swatchNameOf,
} from "./color-model";
import { getValidationScan } from "../core/validation-cache";
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

  const cached = getValidationScan()?.getColorUsage();
  if (cached) {
    for (const snap of cached) {
      if (snap.fillName && matchesName(snap.fillName)) {
        foundUsage = true;
        if (!snap.fillOverprint) return true;
      }
      if (snap.strokeName && matchesName(snap.strokeName)) {
        foundUsage = true;
        if (!snap.strokeOverprint) return true;
      }
    }
  } else {
    walkDirectPageItems(doc, (item) => {
      try {
        const fillName = swatchNameOf(item.fillColor);
        if (fillName && matchesName(fillName)) {
          foundUsage = true;
          if (!itemHasFillOverprint(item)) {
            missing = true;
            return false;
          }
        }
      } catch {
        // ignore
      }
      try {
        const strokeName = swatchNameOf(item.strokeColor);
        if (strokeName && matchesName(strokeName)) {
          foundUsage = true;
          if (!itemHasStrokeOverprint(item)) {
            missing = true;
            return false;
          }
        }
      } catch {
        // ignore
      }
    });
    if (missing) return true;
  }

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

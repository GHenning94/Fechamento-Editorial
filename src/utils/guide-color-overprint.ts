import type { Color, Document, ParagraphStyle } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
import { readColorOverprintFill, styleHasOverprintFill, swatchNameOf } from "./color-model";
import { getValidationScan } from "../core/validation-cache";
import { readGuideColorUse, collectGuideTextColorUseFromItem } from "./guide-color-usage";
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
      const uses = [
        readGuideColorUse(item, matchesName),
        ...collectGuideTextColorUseFromItem(item, matchesName),
      ];
      for (const use of uses) {
        if (!use) continue;
        try {
          if (use.fillName && matchesName(use.fillName)) {
            foundUsage = true;
            if (!use.fillOverprint) {
              missing = true;
              return false;
            }
          }
        } catch {
          // ignore
        }
        try {
          if (use.strokeName && matchesName(use.strokeName)) {
            foundUsage = true;
            if (!use.strokeOverprint) {
              missing = true;
              return false;
            }
          }
        } catch {
          // ignore
        }
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

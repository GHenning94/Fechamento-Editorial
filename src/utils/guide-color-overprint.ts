import type { Document, PageItem } from "indesign";
import type { ValidationIssue } from "../models/validation-result";
import { getValidationScan } from "../core/validation-cache";
import { collectGuideTextColorUseFromItem, readGuideColorUse } from "./guide-color-usage";
import { getPageItemDisplayName, walkDirectPageItems } from "./indesign-helpers";
import { readPageItemId } from "./page-item-reveal";

export function collectMissingColorOverprintIssues(
  doc: Document,
  matchesName: (name: string) => boolean
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const report = (
    pageName: string,
    objectName: string,
    kind: "Fill" | "Stroke",
    colorName: string,
    item?: PageItem | null
  ): void => {
    issues.push({
      message: `Objeto sem ${kind} Overprint`,
      page: pageName,
      object: objectName || "Objeto",
      details: `Cor aplicada: ${colorName}`,
      itemId: readPageItemId(item),
    });
  };

  const objectLabel = (item: PageItem, fallback: string): string => {
    if (fallback) return fallback;
    return getPageItemDisplayName(item);
  };

  const cached = getValidationScan()?.getColorUsage();
  if (cached) {
    for (const snap of cached) {
      if (snap.fillName && matchesName(snap.fillName) && !snap.fillOverprint) {
        report(snap.pageName, objectLabel(snap.item, snap.objectName), "Fill", snap.fillName, snap.item);
      }
      if (snap.strokeName && matchesName(snap.strokeName) && !snap.strokeOverprint) {
        report(snap.pageName, objectLabel(snap.item, snap.objectName), "Stroke", snap.strokeName, snap.item);
      }
    }
    return issues;
  }

  walkDirectPageItems(doc, (item, _page, pageName) => {
    const uses = [
      readGuideColorUse(item, matchesName),
      ...collectGuideTextColorUseFromItem(item, matchesName),
    ];
    for (const use of uses) {
      if (!use) continue;
      try {
        if (use.fillName && matchesName(use.fillName) && !use.fillOverprint) {
          report(pageName, getPageItemDisplayName(item), "Fill", use.fillName, item);
        }
      } catch {
        // ignore
      }
      try {
        if (use.strokeName && matchesName(use.strokeName) && !use.strokeOverprint) {
          report(pageName, getPageItemDisplayName(item), "Stroke", use.strokeName, item);
        }
      } catch {
        // ignore
      }
    }
  });

  return issues;
}

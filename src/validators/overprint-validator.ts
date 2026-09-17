import type { Document, PageItem } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { COLOR_GUIAS_DELETAR, LAYER_GUIAS_DELETAR, VALIDATOR_IDS } from "../utils/constants";
import { isGuiasDeletarColorName } from "../utils/editorial-color";
import { readGuideColorUse } from "../utils/guide-color-usage";
import { getPageItemDisplayName, isGuideColor, walkDirectPageItems } from "../utils/indesign-helpers";
import { readPageItemId } from "../utils/page-item-reveal";
import { getValidationScan } from "../core/validation-cache";

export class OverprintValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.OVERPRINT;
  readonly name = "Overprint em Objetos Guia";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      let guiasMissingOverprint = false;

      const report = (
        pageName: string,
        objectName: string,
        kind: "Fill" | "Stroke",
        colorName: string,
        item?: PageItem | null
      ): void => {
        if (isGuiasDeletarColorName(colorName)) {
          guiasMissingOverprint = true;
          return;
        }
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
          if (snap.fillName && isGuideColor(snap.fillName) && !snap.fillOverprint) {
            report(snap.pageName, objectLabel(snap.item, snap.objectName), "Fill", snap.fillName, snap.item);
          }
          if (snap.strokeName && isGuideColor(snap.strokeName) && !snap.strokeOverprint) {
            report(snap.pageName, objectLabel(snap.item, snap.objectName), "Stroke", snap.strokeName, snap.item);
          }
        }
      } else {
        walkDirectPageItems(doc, (item, _page, pageName) => {
          const use = readGuideColorUse(item, isGuideColor);
          if (!use) return;
          try {
            if (use.fillName && isGuideColor(use.fillName) && !use.fillOverprint) {
              report(pageName, getPageItemDisplayName(item), "Fill", use.fillName, item);
            }
          } catch {
            // ignore
          }
          try {
            if (use.strokeName && isGuideColor(use.strokeName) && !use.strokeOverprint) {
              report(pageName, getPageItemDisplayName(item), "Stroke", use.strokeName, item);
            }
          } catch {
            // ignore
          }
        });
      }

      if (guiasMissingOverprint) {
        issues.push({
          message: `Overprint não aplicado na layer ${LAYER_GUIAS_DELETAR}`,
          details: `Objetos com a cor ${COLOR_GUIAS_DELETAR} precisam de Overprint Fill no preenchimento e Overprint Stroke no traço, quando esses canais existirem. Revise todas as páginas.`,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

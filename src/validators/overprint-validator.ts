import type { Document, PageItem } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { LAYER_GUIAS_DELETAR, VALIDATOR_IDS } from "../utils/constants";
import {
  itemHasFillOverprint,
  itemHasStrokeOverprint,
  swatchNameOf,
} from "../utils/color-model";
import { isGuiasDeletarColorName } from "../utils/editorial-color";
import { getPageItemDisplayName, isGuideColor, walkDirectPageItems } from "../utils/indesign-helpers";
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
        colorName: string
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
            report(snap.pageName, objectLabel(snap.item, snap.objectName), "Fill", snap.fillName);
          }
          if (snap.strokeName && isGuideColor(snap.strokeName) && !snap.strokeOverprint) {
            report(snap.pageName, objectLabel(snap.item, snap.objectName), "Stroke", snap.strokeName);
          }
        }
      } else {
        walkDirectPageItems(doc, (item, _page, pageName) => {
          try {
            const fillName = swatchNameOf(item.fillColor);
            if (isGuideColor(fillName) && !itemHasFillOverprint(item)) {
              report(pageName, getPageItemDisplayName(item), "Fill", fillName);
            }
          } catch {
            // ignore
          }
          try {
            const strokeName = swatchNameOf(item.strokeColor);
            if (isGuideColor(strokeName) && !itemHasStrokeOverprint(item)) {
              report(pageName, getPageItemDisplayName(item), "Stroke", strokeName);
            }
          } catch {
            // ignore
          }
        });
      }

      if (guiasMissingOverprint) {
        issues.push({
          message: `Overprint não aplicado na layer ${LAYER_GUIAS_DELETAR}`,
          details: `Tudo dentro da layer ${LAYER_GUIAS_DELETAR} deve ter Fill e Stroke Overprint, em todas as páginas. Revise o documento.`,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

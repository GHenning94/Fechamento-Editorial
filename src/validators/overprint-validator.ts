import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import {
  itemHasFillOverprint,
  itemHasStrokeOverprint,
  swatchNameOf,
} from "../utils/color-model";
import {
  getPageItemDisplayName,
  isGuideColor,
  walkDirectPageItems,
} from "../utils/indesign-helpers";

export class OverprintValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.OVERPRINT;
  readonly name = "Overprint em Objetos Guia";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      walkDirectPageItems(doc, (item, _page, pageName) => {
        try {
          const fillName = swatchNameOf(item.fillColor);
          if (isGuideColor(fillName) && !itemHasFillOverprint(item)) {
            issues.push({
              message: "Objeto sem Fill Overprint",
              page: pageName,
              object: getPageItemDisplayName(item),
              details: `Cor aplicada: ${fillName}`,
            });
          }
        } catch {
          // ignore
        }

        try {
          const strokeName = swatchNameOf(item.strokeColor);
          if (isGuideColor(strokeName) && !itemHasStrokeOverprint(item)) {
            issues.push({
              message: "Objeto sem Stroke Overprint",
              page: pageName,
              object: getPageItemDisplayName(item),
              details: `Cor aplicada: ${strokeName}`,
            });
          }
        } catch {
          // ignore
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import {
  getPageItemDisplayName,
  getSwatchName,
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
          const swatchName = getSwatchName(item);
          if (!isGuideColor(swatchName)) return;

          if (!item.fillOverprint) {
            issues.push({
              message: "Objeto sem Fill Overprint",
              page: pageName,
              object: getPageItemDisplayName(item),
              details: `Cor aplicada: ${swatchName}`,
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

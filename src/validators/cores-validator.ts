import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { isSpotExceptionColor } from "../utils/indesign-helpers";
import { forEachCollectionItem } from "../utils/collection-helpers";
import type { Color } from "indesign";

function isBuiltInSwatch(name: string): boolean {
  const trimmed = (name || "").trim();
  return trimmed.startsWith("[") || trimmed === "";
}

function hasCorPrefix(name: string): boolean {
  return (name || "").trim().toUpperCase().startsWith("COR_");
}

export class CoresValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CORES;
  readonly name = "Cores";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      forEachCollectionItem<Color>(doc.colors, (color) => {
        if (!color || !color.isValid) return;

        const name = (color.name || "").trim();
        if (isBuiltInSwatch(name) || isSpotExceptionColor(name)) {
          return;
        }

        if (!hasCorPrefix(name)) {
          issues.push({
            message: "Nomenclatura inválida",
            object: name,
            details: 'O nome da cor deve começar com "COR_".',
          });
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { normalizeFontFamily } from "../utils/indesign-helpers";

export class FontesDuplicadasValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.FONTES_DUPLICADAS;
  readonly name = "Fontes Duplicadas";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const families = new Map<string, string[]>();

      for (let i = 0; i < doc.fonts.length; i++) {
        const font = doc.fonts.item(i);
        if (!font || !font.isValid) continue;

        const family = font.fontFamily || font.name;
        const normalized = normalizeFontFamily(family);

        if (!normalized) continue;

        const list = families.get(normalized) || [];
        if (list.indexOf(family) === -1) {
          list.push(family);
        }
        families.set(normalized, list);
      }

      const issues: ValidationIssue[] = [];

      families.forEach((variants, key) => {
        if (variants.length > 1) {
          issues.push({
            message: "Família potencialmente duplicada",
            object: variants.join(" / "),
            details: `Base normalizada: ${key}`,
          });
        }
      });

      return createResult(this.id, this.name, issues, "warning");
    });
  }
}

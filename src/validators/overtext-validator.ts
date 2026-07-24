import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import {
  getPageItemDisplayName,
  walkDirectPageItems,
} from "../utils/indesign-helpers";

function isTextFrame(item: { constructor?: { name?: string } }): boolean {
  return (item.constructor?.name || "") === "TextFrame";
}

/**
 * Valida overset em caixas de texto reais (como o Preflight do InDesign),
 * e não em Stories genéricas — evita falsos positivos e IDs inúteis.
 */
export class OvertextValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.OVERTEXT;
  readonly name = "Overset Text";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const seen = new Set<string>();

      walkDirectPageItems(doc, (item, _page, pageName) => {
        try {
          if (!isTextFrame(item)) return;
          if (item.overflows !== true) return;

          const objectName = getPageItemDisplayName(item);
          const key = `${pageName}::${objectName}::${(item.geometricBounds || []).join(",")}`;
          if (seen.has(key)) return;
          seen.add(key);

          issues.push({
            message: "Texto em excesso (overset)",
            page: pageName,
            object: objectName,
            details: "A caixa de texto possui conteúdo que não cabe no quadro.",
          });
        } catch {
          // ignora frame inválido
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

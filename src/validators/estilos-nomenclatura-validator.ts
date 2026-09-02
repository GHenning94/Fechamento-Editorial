import type { Document, ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { shouldSkipParagraphStyleValidation } from "../utils/indesign-helpers";
import {
  classifyParagraphStyleNomenclature,
  isParagraphStyleNomenclatureSkipped,
} from "../utils/paleta-estilos";

export class EstilosNomenclaturaValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.ESTILOS_NOMENCLATURA;
  readonly name = "Estilos de Parágrafo - Nomenclatura";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
        if (!style || !style.isValid) return;

        const name = (style.name || "").trim();
        if (shouldSkipParagraphStyleValidation(name) || isParagraphStyleNomenclatureSkipped(name)) {
          return;
        }

        const verdict = classifyParagraphStyleNomenclature(name);
        if (verdict.kind === "valid") return;

        if (verdict.kind === "invalid-format") {
          issues.push({
            message: "O tronco deve ser número_palavra da paleta (ex.: 02_texto, 05_legenda).",
            object: name,
            severity: "error",
          });
          return;
        }

        if (verdict.kind === "typo") {
          issues.push({
            message: "O tronco deve ser número_palavra da paleta (ex.: 02_texto, 05_legenda).",
            object: name,
            details: `Use "${verdict.suggestion}" em vez de "${verdict.trunk}".`,
            severity: "error",
          });
          return;
        }

        issues.push({
          message: "Estilo não está presente na paleta",
          object: name,
          details: `O tronco "${verdict.trunk}" não está na paleta. Valide manualmente.`,
          severity: "warning",
        });
      });

      const severity = issues.some((issue) => (issue.severity || "error") === "error")
        ? "error"
        : issues.length > 0
          ? "warning"
          : "success";

      return createResult(this.id, this.name, issues, severity);
    });
  }
}

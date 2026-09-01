import type { Document, ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { shouldSkipParagraphStyleValidation } from "../utils/indesign-helpers";
import {
  buildParagraphStyleSuggestion,
  containsInvalidSpaces,
  isParagraphStyleNomenclatureSkipped,
  isValidParagraphStyleName,
} from "../utils/paleta-estilos";

function nomenclatureDetails(name: string): string {
  const suggestion = buildParagraphStyleSuggestion(name);
  if (containsInvalidSpaces(name) && suggestion) {
    return `Remova os espaços. Use: ${suggestion}`;
  }
  if (containsInvalidSpaces(name)) {
    return "Remova os espaços do nome (use _).";
  }
  if (suggestion) {
    return `Use: ${suggestion}`;
  }
  return "O tronco deve coincidir com a paleta (ex.: 02_texto_geral).";
}

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

        if (isValidParagraphStyleName(name)) return;

        issues.push({
          message: "Tronco fora da paleta",
          object: name,
          details: nomenclatureDetails(name),
        });
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

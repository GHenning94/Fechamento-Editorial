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
  PARAGRAPH_STYLE_NOMENCLATURE_EXAMPLES,
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

        if (isValidParagraphStyleName(name)) return;

        const suggestion = buildParagraphStyleSuggestion(name);
        const suggestionText = suggestion ? ` Sugestão: ${suggestion}.` : "";
        const spaceHint = containsInvalidSpaces(name)
          ? " Não use espaços: substitua por _ ou, antes de número final, remova o espaço."
          : "";

        issues.push({
          message: "Nomenclatura inválida",
          object: name,
          details: `O tronco do estilo deve corresponder à paleta padrão (sem espaços; sufixo numérico permitido, ex.: 05_legenda_proporcao2). Exemplos: ${PARAGRAPH_STYLE_NOMENCLATURE_EXAMPLES}.${spaceHint}${suggestionText}`,
        });
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

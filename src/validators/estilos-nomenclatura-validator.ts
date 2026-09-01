import type { Document, ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { shouldSkipParagraphStyleValidation } from "../utils/indesign-helpers";
import {
  isParagraphStyleNomenclatureSkipped,
  isValidParagraphStyleName,
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

        issues.push({
          message: "O tronco deve ser número_palavra da paleta (ex.: 02_texto, 05_legenda).",
          object: name,
        });
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

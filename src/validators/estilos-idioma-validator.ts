import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { ACCEPTED_LANGUAGES, VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import type { ParagraphStyle } from "indesign";

function normalizeLanguageName(name: string): string {
  return name.trim().replace(/\s*:\s*/g, ": ");
}

function isAcceptedLanguage(languageName: string): boolean {
  const normalized = normalizeLanguageName(languageName).toLowerCase();
  return ACCEPTED_LANGUAGES.some(
    (accepted) => normalizeLanguageName(accepted).toLowerCase() === normalized
  );
}

export class EstilosIdiomaValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.ESTILOS_IDIOMA;
  readonly name = "Estilos de Parágrafo - Idioma";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
        if (!style || !style.isValid) return;

        try {
          const language = style.appliedLanguage;
          const languageName = language && language.name ? language.name : "";

          if (!isAcceptedLanguage(languageName)) {
            issues.push({
              message: "idioma diferente",
              object: style.name,
              value: languageName || "Não definido",
              details: `Esperado: ${ACCEPTED_LANGUAGES.join(" ou ")}`,
            });
          }
        } catch {
          issues.push({
            message: "idioma diferente",
            object: style.name,
            details: "Não foi possível ler o idioma do estilo",
          });
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

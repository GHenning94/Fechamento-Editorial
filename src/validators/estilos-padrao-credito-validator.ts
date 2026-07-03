import type { Document, ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import {
  compareCreditoStyle,
  CREDITO_STYLE_NAME,
} from "../utils/estilos-padrao-credito";

function collectParagraphStyleNames(doc: Document): Set<string> {
  const names = new Set<string>();

  forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
    if (!style || !style.isValid) return;
    const name = (style.name || "").trim();
    if (name) names.add(name);
  });

  return names;
}

export class EstilosPadraoCreditoValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.ESTILOS_PADRAO_CREDITO;
  readonly name = "Estilos Padrão — Crédito";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const presentStyles = collectParagraphStyleNames(doc);

      if (!presentStyles.has(CREDITO_STYLE_NAME)) {
        issues.push({
          message: "Estilo obrigatório ausente",
          object: CREDITO_STYLE_NAME,
          details: "Este estilo deve estar presente em todos os projetos.",
        });
      }

      forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
        if (!style || !style.isValid) return;
        if (style.name !== CREDITO_STYLE_NAME) return;

        for (const issue of compareCreditoStyle(style)) {
          issues.push({
            message: "Configuração divergente",
            object: CREDITO_STYLE_NAME,
            details: `${issue.property}: esperado ${issue.expected}, encontrado ${issue.actual}.`,
          });
        }
      });

      const severity = issues.length > 0 ? "error" : "success";

      return createResult(this.id, this.name, issues, severity);
    });
  }
}

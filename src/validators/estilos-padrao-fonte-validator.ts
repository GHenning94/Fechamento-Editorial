import type { Document, ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import {
  compareFonteStyle,
  FONTE_STANDARD_STYLE_NAMES,
} from "../utils/estilos-padrao-fonte";
import {
  detectMaterialFromFileName,
  readDocumentFileName,
} from "../utils/material-type";

const FONTE_STYLE_SET = new Set<string>(FONTE_STANDARD_STYLE_NAMES);

function collectParagraphStyleNames(doc: Document): Set<string> {
  const names = new Set<string>();

  forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
    if (!style || !style.isValid) return;
    const name = (style.name || "").trim();
    if (name) names.add(name);
  });

  return names;
}

export class EstilosPadraoFonteValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.ESTILOS_PADRAO_FONTE;
  readonly name = "Estilos Padrão — Fonte";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const fileName = readDocumentFileName(doc);
      const material = detectMaterialFromFileName(fileName);
      const presentStyles = collectParagraphStyleNames(doc);

      if (!material.segment) {
        issues.push({
          message: "Segmento não identificado",
          object: fileName || "Documento não salvo",
          details:
            "Não foi possível identificar EF1/EFAI, EF2/EFAF, EM ou PV/Prevest pelo nome do arquivo. A validação de tamanho foi ignorada.",
        });
      }

      for (const styleName of FONTE_STANDARD_STYLE_NAMES) {
        if (presentStyles.has(styleName)) continue;

        issues.push({
          message: "Estilo obrigatório ausente",
          object: styleName,
          details: "Este estilo deve estar presente em todos os projetos.",
        });
      }

      forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
        if (!style || !style.isValid) return;
        if (!FONTE_STYLE_SET.has(style.name)) return;

        for (const issue of compareFonteStyle(style, {
          segment: material.segment,
          validateSize: material.segment !== null,
        })) {
          issues.push({
            message: "Configuração divergente",
            object: style.name,
            details: `${issue.property}: esperado ${issue.expected}, encontrado ${issue.actual}.`,
          });
        }
      });

      const hasError = issues.some(
        (issue) =>
          issue.message === "Configuração divergente" ||
          issue.message === "Estilo obrigatório ausente"
      );

      return createResult(this.id, this.name, issues, hasError ? "error" : "warning");
    });
  }
}

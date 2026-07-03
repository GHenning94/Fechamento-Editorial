import type { Document, ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import {
  compareProfessorStyle,
  getEfAiSizeHint,
  PROFESSOR_STANDARD_STYLE_NAMES,
} from "../utils/estilos-padrao-professor";
import {
  detectMaterialFromFileName,
  readDocumentFileName,
} from "../utils/material-type";

const PROFESSOR_STYLE_SET = new Set<string>(PROFESSOR_STANDARD_STYLE_NAMES);

export class EstilosPadraoProfessorValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.ESTILOS_PADRAO_PROFESSOR;
  readonly name = "Estilos Padrão — Professor";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const fileName = readDocumentFileName(doc);
      const material = detectMaterialFromFileName(fileName);

      if (!material.segment) {
        issues.push({
          message: "Segmento não identificado",
          object: fileName || "Documento não salvo",
          details:
            "Não foi possível identificar EF1/EFAI, EF2/EFAF, EM ou PV/Prevest pelo nome do arquivo. A validação de tamanho foi ignorada.",
        });
      }

      forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
        if (!style || !style.isValid) return;
        if (!PROFESSOR_STYLE_SET.has(style.name)) return;

        const propertyIssues = compareProfessorStyle(style, {
          segment: material.segment,
          validateSize: material.segment !== null,
        });

        for (const issue of propertyIssues) {
          const isFontSizeIssue = issue.property === "Tamanho";
          const ef1Hint =
            isFontSizeIssue && material.segment === "EF1" ? getEfAiSizeHint(style.name) : "";

          issues.push({
            message: "Configuração divergente",
            object: style.name,
            details: `${issue.property}: esperado ${issue.expected}, encontrado ${issue.actual}.${ef1Hint}`,
          });
        }
      });

      const severity = issues.some((issue) => issue.message === "Configuração divergente")
        ? "error"
        : "warning";

      return createResult(this.id, this.name, issues, severity);
    });
  }
}

import type { Document, ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { isCreditoStyleName } from "../utils/estilos-padrao-credito";
import { shouldSkipParagraphStyleValidation } from "../utils/indesign-helpers";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { isStandardParagraphStyle } from "../utils/paleta-estilos";
import {
  isLeftJustifiedAlignment,
  readParagraphJustification,
} from "../utils/style-property-compare";

export class HifenizacaoValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.HIFENIZACAO;
  readonly name = "Hifenização";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
        if (!style || !style.isValid) return;
        if (shouldSkipParagraphStyleValidation(style.name)) return;
        if (isStandardParagraphStyle(style.name) || isCreditoStyleName(style.name)) return;

        try {
          if (!style.hyphenation) return;

          const justification = readParagraphJustification(style);
          if (justification == null) return;
          if (isLeftJustifiedAlignment(justification)) return;

          issues.push({
            message: "Alinhamento incompatível com hifenização",
            object: style.name,
            details:
              "Com hifenização ativa, use Justificado à esquerda. Sem hifenização, qualquer alinhamento é aceito.",
          });
        } catch {
          // Sem leitura confiável, não marca falso positivo.
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

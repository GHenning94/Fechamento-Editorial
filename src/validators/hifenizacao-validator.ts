import type { Document } from "indesign";
import { getInDesignModule } from "../utils/indesign-runtime";
import { forEachCollectionItem } from "../utils/collection-helpers";
import type { ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";

export class HifenizacaoValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.HIFENIZACAO;
  readonly name = "Hifenização";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      const { Justification } = getInDesignModule();
      const J = Justification as {
        LEFT_JUSTIFIED: number;
        LEFT_ALIGN: number;
      };

      forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
        if (!style || !style.isValid) return;

        try {
          const hyphenation = style.hyphenation;
          const justification = style.justification;

          if (hyphenation) {
            if (justification !== J.LEFT_JUSTIFIED) {
              issues.push({
                message: "divergência",
                object: style.name,
                details: "Com hifenização ativa, Justification deve ser Left Justified",
                value: String(justification),
              });
            }
          } else if (justification !== J.LEFT_ALIGN) {
            issues.push({
              message: "divergência",
              object: style.name,
              details: "Sem hifenização, Alignment deve ser Left Align",
              value: String(justification),
            });
          }
        } catch {
          issues.push({
            message: "divergência",
            object: style.name,
            details: "Não foi possível validar hifenização/alinhamento",
          });
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

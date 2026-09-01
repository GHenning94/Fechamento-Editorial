import type { Document, ParagraphStyle } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { shouldSkipParagraphStyleValidation } from "../utils/indesign-helpers";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { getInDesignModule } from "../utils/indesign-runtime";

function isLeftJustified(justification: number): boolean {
  try {
    const { Justification } = getInDesignModule() as {
      Justification?: { LEFT_JUSTIFIED?: number; leftJustified?: number };
    };
    const J = Justification || {};
    if (typeof J.LEFT_JUSTIFIED === "number" && justification === J.LEFT_JUSTIFIED) return true;
    if (typeof J.leftJustified === "number" && justification === J.leftJustified) return true;
  } catch {
    // host sem enum
  }
  return false;
}

export class HifenizacaoValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.HIFENIZACAO;
  readonly name = "Hifenização";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      forEachCollectionItem<ParagraphStyle>(doc.paragraphStyles, (style) => {
        if (!style || !style.isValid) return;
        if (shouldSkipParagraphStyleValidation(style.name)) return;

        try {
          if (!style.hyphenation) return;

          if (!isLeftJustified(style.justification)) {
            issues.push({
              message: "Alinhamento incompatível com hifenização",
              object: style.name,
              details:
                "Com hifenização ativa, o alinhamento deve ser Justificado à esquerda (Left Justified). Sem hifenização, qualquer alinhamento é aceito.",
            });
          }
        } catch {
          issues.push({
            message: "Não foi possível validar hifenização/alinhamento",
            object: style.name,
          });
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

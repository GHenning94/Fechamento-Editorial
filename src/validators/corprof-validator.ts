import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { COLOR_CORPROF, VALIDATOR_IDS } from "../utils/constants";
import { findCorProfColor, isCorProfColorName } from "../utils/editorial-color";
import { isSpotColor } from "../utils/color-model";
import { colorOverprintSatisfied } from "../utils/guide-color-overprint";

export class CorProfValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CORPROF;
  readonly name = "Cor CorProf";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const match = findCorProfColor(doc);

      if (!match) {
        issues.push({
          message: "Cor CorProf inexistente",
          details: `Crie a amostra "${COLOR_CORPROF}" (Spot Color com Overprint Fill).`,
        });
        return createResult(this.id, this.name, issues, "error");
      }

      if (!match.exactName) {
        issues.push({
          message: "Nomenclatura incorreta da cor",
          object: match.foundName,
          details: `Renomeie "${match.foundName}" para "${COLOR_CORPROF}".`,
        });
      }

      if (!isSpotColor(match.color)) {
        issues.push({
          message: "CorProf deve ser Spot Color",
          object: match.foundName,
        });
      }

      if (!colorOverprintSatisfied(doc, match.color, isCorProfColorName)) {
        issues.push({
          message: "CorProf sem Overprint Fill ativo",
          object: match.foundName,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

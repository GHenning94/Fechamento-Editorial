import type { Document } from "indesign";
import { getInDesignModule } from "../utils/indesign-runtime";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { COLOR_GUIAS_DELETAR, VALIDATOR_IDS } from "../utils/constants";
import { findGuiasDeletarColor } from "../utils/editorial-color";

export class GuiasColorValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.GUIAS_COLOR;
  readonly name = "Cor GUIAS_DELETAR";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const match = findGuiasDeletarColor(doc);

      const { ColorModel } = getInDesignModule();
      const CM = ColorModel as { SPOT: number };

      if (!match) {
        issues.push({
          message: "Cor GUIAS_DELETAR inexistente",
          details: `Crie a amostra "${COLOR_GUIAS_DELETAR}" (Spot Color com Overprint Fill).`,
        });
        return createResult(this.id, this.name, issues, "error");
      }

      if (!match.exactName) {
        issues.push({
          message: "Nomenclatura incorreta da cor",
          object: match.foundName,
          details: `Renomeie "${match.foundName}" para "${COLOR_GUIAS_DELETAR}".`,
        });
      }

      if (match.color.model !== CM.SPOT) {
        issues.push({
          message: "GUIAS_DELETAR deve ser Spot Color",
          object: match.foundName,
        });
      }

      if (!match.color.overprintFill) {
        issues.push({
          message: "GUIAS_DELETAR sem Overprint Fill ativo",
          object: match.foundName,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

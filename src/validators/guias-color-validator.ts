import type { Document } from "indesign";
import { getInDesignModule } from "../utils/indesign-runtime";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { COLOR_GUIAS_DELETAR, VALIDATOR_IDS } from "../utils/constants";
import { colorExists } from "../utils/indesign-helpers";

export class GuiasColorValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.GUIAS_COLOR;
  readonly name = "Cor GUIAS_DELETAR";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];
      const color = colorExists(doc, COLOR_GUIAS_DELETAR);

      const { ColorModel } = getInDesignModule();
      const CM = ColorModel as { SPOT: number };

      if (!color) {
        issues.push({ message: "GUIAS_DELETAR não existe" });
      } else {
        if (color.model !== CM.SPOT) {
          issues.push({
            message: "GUIAS_DELETAR deve ser Spot Color",
            object: COLOR_GUIAS_DELETAR,
          });
        }
        if (!color.overprintFill) {
          issues.push({
            message: "GUIAS_DELETAR sem Overprint Fill ativo",
            object: COLOR_GUIAS_DELETAR,
          });
        }
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

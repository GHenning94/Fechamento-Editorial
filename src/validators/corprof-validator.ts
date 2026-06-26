import type { Document } from "indesign";
import { getInDesignModule } from "../utils/indesign-runtime";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { COLOR_CORPROF, VALIDATOR_IDS } from "../utils/constants";
import { colorExists } from "../utils/indesign-helpers";

export class CorProfValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CORPROF;
  readonly name = "Cor CorProf";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];
      const color = colorExists(doc, COLOR_CORPROF);

      const { ColorModel } = getInDesignModule();
      const CM = ColorModel as { SPOT: number };

      if (!color) {
        issues.push({ message: "CorProf não existe" });
      } else {
        if (color.model !== CM.SPOT) {
          issues.push({ message: "CorProf deve ser Spot Color", object: COLOR_CORPROF });
        }
        if (!color.overprintFill) {
          issues.push({ message: "CorProf sem Overprint Fill ativo", object: COLOR_CORPROF });
        }
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

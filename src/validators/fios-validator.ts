import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { MIN_STROKE_WEIGHT, VALIDATOR_IDS } from "../utils/constants";
import { collectStrokedItems } from "../utils/indesign-helpers";

export class FiosValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.FIOS;
  readonly name = "Espessura de Fios";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];
      const strokes = collectStrokedItems(doc);

      for (const stroke of strokes) {
        if (stroke.weight < MIN_STROKE_WEIGHT) {
          issues.push({
            message: "abaixo de 0.3 pt",
            page: stroke.pageName,
            object: stroke.objectName,
            value: `${stroke.weight} pt`,
          });
        }
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

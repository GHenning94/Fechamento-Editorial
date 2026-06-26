import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import {
  collectUsedFonts,
  getFontStatus,
  isFontMissing,
  isFontSubstituted,
} from "../utils/font-helpers";

export class FontesValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.FONTES;
  readonly name = "Fontes";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];
      const usedFonts = collectUsedFonts(doc);

      for (const { font } of usedFonts) {
        const status = getFontStatus(font);

        if (isFontMissing(status)) {
          issues.push({
            message: "Fonte ausente",
            object: font.name,
            details: font.fontFamily,
          });
          continue;
        }

        if (isFontSubstituted(status)) {
          issues.push({
            message: "Fonte substituída",
            object: font.name,
            details: font.fontFamily,
          });
        }
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

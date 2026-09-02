import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import {
  collectUsedFonts,
  fontDisplayName,
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
        const name = fontDisplayName(font) || font.fontFamily || "Fonte";

        if (isFontMissing(status)) {
          issues.push({
            message: "Fonte ausente",
            object: name,
            details: "A fonte não está instalada. Instale-a ou substitua no texto.",
          });
          continue;
        }

        if (isFontSubstituted(status)) {
          issues.push({
            message: "Fonte substituída",
            object: name,
            details: "O InDesign está usando uma fonte substituta. Instale a fonte original.",
          });
        }
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

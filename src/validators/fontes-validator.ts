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
      const seen = new Set<string>();

      for (const { font } of usedFonts) {
        const status = getFontStatus(font);
        const name = fontDisplayName(font) || "Fonte";
        const key = name.toLowerCase();
        if (seen.has(key)) continue;

        if (isFontMissing(status) || isFontSubstituted(status)) {
          seen.add(key);
          issues.push({
            message: isFontMissing(status) ? "Fonte ausente" : "Fonte substituída",
            object: name,
            details: isFontMissing(status)
              ? "A fonte não está instalada. Instale-a ou substitua no texto."
              : "O InDesign está usando uma fonte substituta. Instale a fonte original.",
          });
        }
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

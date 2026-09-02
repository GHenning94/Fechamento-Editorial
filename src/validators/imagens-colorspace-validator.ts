import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { collectGraphics } from "../utils/indesign-helpers";

export class ImagensColorspaceValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.IMAGENS_COLORSPACE;
  readonly name = "Imagens - Color Space";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];
      const graphics = collectGraphics(doc);

      for (const graphic of graphics) {
        if (graphic.colorSpace === "CMYK" || graphic.colorSpace === "Desconhecido") {
          continue;
        }

        issues.push({
          message: `${graphic.colorSpace} encontrado`,
          page: graphic.pageName,
          object: graphic.imageName,
          value: graphic.colorSpace,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

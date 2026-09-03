import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { MIN_IMAGE_DPI, VALIDATOR_IDS } from "../utils/constants";
import { collectGraphics } from "../utils/indesign-helpers";
import { readPageItemId } from "../utils/page-item-reveal";

export class ResolucaoValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.RESOLUCAO;
  readonly name = "Resolução de Imagens";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];
      const graphics = collectGraphics(doc);

      for (const graphic of graphics) {
        const name = graphic.fileName || graphic.imageName || "";
        if (/\.(eps|pdf|ai|svg)$/i.test(name)) continue;
        if (graphic.dpi > 0 && graphic.dpi < MIN_IMAGE_DPI) {
          issues.push({
            message: "abaixo de 300 dpi",
            page: graphic.pageName,
            object: graphic.imageName,
            value: `${Math.round(graphic.dpi)} dpi`,
            itemId: readPageItemId(graphic.pageItem),
          });
        }
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

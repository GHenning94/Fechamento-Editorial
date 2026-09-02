import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { collectGraphics } from "../utils/indesign-helpers";

function fileNameOf(graphic: { imageName: string; fileName?: string }): string {
  return graphic.fileName || graphic.imageName || "";
}

function isEpsOrPsd(name: string): boolean {
  return /\.(eps|psd)$/i.test(name);
}

export class ImagensColorspaceValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.IMAGENS_COLORSPACE;
  readonly name = "Imagens - Color Space";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];
      const graphics = collectGraphics(doc);

      for (const graphic of graphics) {
        const name = fileNameOf(graphic);
        const requiresProfile = isEpsOrPsd(name);

        if (graphic.colorSpace === "CMYK") continue;
        if (graphic.colorSpace === "Desconhecido" && !requiresProfile) continue;

        issues.push({
          message:
            graphic.colorSpace === "Desconhecido"
              ? "Espaço de cor não identificado"
              : `${graphic.colorSpace} encontrado`,
          page: graphic.pageName,
          object: graphic.imageName,
          value: graphic.colorSpace,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

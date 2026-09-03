import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { collectGraphics } from "../utils/indesign-helpers";
import { readPageItemId } from "../utils/page-item-reveal";

export class ImagensColorspaceValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.IMAGENS_COLORSPACE;
  readonly name = "Imagens - Color Space";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const graphics = collectGraphics(doc);
      const seenFiles = new Set<string>();

      for (const graphic of graphics) {
        const name = graphic.fileName || graphic.imageName || "";
        const fileKey = name.toLowerCase();
        if (fileKey && seenFiles.has(fileKey)) continue;
        if (fileKey) seenFiles.add(fileKey);

        if (graphic.colorSpace === "CMYK" || graphic.colorSpace === "Desconhecido") continue;

        issues.push({
          message: `${graphic.colorSpace} encontrado`,
          page: graphic.pageName,
          object: graphic.imageName,
          value: graphic.colorSpace,
          severity: "error",
          itemId: readPageItemId(graphic.pageItem),
        });
      }

      const severity = issues.some((issue) => (issue.severity || "error") === "error")
        ? "error"
        : issues.length > 0
          ? "warning"
          : "success";

      return createResult(this.id, this.name, issues, severity);
    });
  }
}

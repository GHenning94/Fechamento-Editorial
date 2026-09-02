import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { GRAPHIC_FORMAT_FIX, graphicFormatError } from "../utils/graphic-format";
import { collectPlacedLinks, getLinkDetails } from "../utils/link-helpers";

export class ImagensFormatoValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.IMAGENS_FORMATO;
  readonly name = "Imagens - Formato";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const seen = new Set<string>();

      try {
        for (const { link, pageName, objectName } of collectPlacedLinks(doc)) {
          const name = link.name || objectName || "";
          const path = getLinkDetails(link);
          const linkType = (() => {
            try {
              return link.linkType || "";
            } catch {
              return "";
            }
          })();

          const message = graphicFormatError(name, path, linkType);
          if (!message) continue;

          const key = `${name}::${path}::${message}`;
          if (seen.has(key)) continue;
          seen.add(key);

          issues.push({
            message,
            page: pageName,
            object: name || objectName,
            details: GRAPHIC_FORMAT_FIX,
          });
        }
      } catch {
        // Falha na leitura de links não deve derrubar o checklist
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

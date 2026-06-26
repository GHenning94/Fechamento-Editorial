import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import {
  getPageItemDedupKey,
  getPageItemDisplayName,
  isFullyOutsideAllPages,
  walkPasteboardItems,
} from "../utils/indesign-helpers";

export class PasteboardValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.PASTEBOARD;
  readonly name = "Objetos no Pasteboard";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const seen = new Set<string>();

      walkPasteboardItems(doc, (item, spreadPages, pageName) => {
        try {
          const objectName = getPageItemDisplayName(item);
          const itemKey = getPageItemDedupKey(item);
          if (seen.has(itemKey)) return;

          if (isFullyOutsideAllPages(item, spreadPages, doc)) {
            seen.add(itemKey);
            issues.push({
              message: "Objeto totalmente fora da área da página",
              page: pageName,
              object: objectName,
              details:
                "O objeto está 100% fora da página (incluindo sangria). Objetos parcialmente dentro da página não são erro.",
            });
          }
        } catch {
          // ignora item inválido
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

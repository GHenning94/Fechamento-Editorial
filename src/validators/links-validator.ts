import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import {
  collectPlacedLinks,
  getLinkDetails,
  getLinkFixSuggestion,
  getLinkStatus,
  isLinkInaccessible,
  isLinkMissing,
  isLinkModified,
  isRemoteLink,
} from "../utils/link-helpers";

export class LinksValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.LINKS;
  readonly name = "Links";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];

      try {
        const placedLinks = collectPlacedLinks(doc);

        for (const { link, pageName, objectName } of placedLinks) {
          const status = getLinkStatus(link);

          if (isLinkMissing(status)) {
            issues.push({
              message: "Link ausente/quebrado",
              page: pageName,
              object: objectName,
              details: `${getLinkDetails(link)} — ${getLinkFixSuggestion(status, link)}`,
            });
            continue;
          }

          if (isLinkModified(status)) {
            issues.push({
              message: "Link modificado",
              page: pageName,
              object: objectName,
              details: `${getLinkDetails(link)} — ${getLinkFixSuggestion(status, link)}`,
            });
            continue;
          }

          if (isLinkInaccessible(status) && isRemoteLink(link)) {
            issues.push({
              message: "Link inacessível",
              page: pageName,
              object: objectName,
              details: `${getLinkDetails(link)} — ${getLinkFixSuggestion(status, link)}`,
            });
          }
        }
      } catch {
        // Falha na leitura de links não deve derrubar o checklist inteiro
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

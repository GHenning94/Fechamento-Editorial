import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { isGuiasDeletarColorName } from "../utils/editorial-color";
import { collectMissingColorOverprintIssues } from "../utils/guide-color-overprint";

export class OverprintValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.OVERPRINT;
  readonly name = "Overprint em Objetos Guia";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = collectMissingColorOverprintIssues(doc, isGuiasDeletarColorName);
      return createResult(this.id, this.name, issues, "error");
    });
  }
}

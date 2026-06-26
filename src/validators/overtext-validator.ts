import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";

export class OvertextValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.OVERTEXT;
  readonly name = "Overset Text";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];

      for (let i = 0; i < doc.stories.length; i++) {
        const story = doc.stories.item(i);
        if (!story || !story.isValid) continue;

        if (story.overflows) {
          issues.push({
            message: "Overset text detectado",
            object: `Story ${i + 1}`,
          });
        }
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

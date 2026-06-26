import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";

export class LayersBloqueadasValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.LAYERS_BLOQUEADAS;
  readonly name = "Layers Bloqueadas";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];

      for (let i = 0; i < doc.layers.length; i++) {
        const layer = doc.layers.item(i);
        if (!layer || !layer.isValid) continue;

        if (layer.locked) {
          issues.push({
            message: "Layer bloqueada",
            object: layer.name,
          });
        }
      }

      return createResult(this.id, this.name, issues, "warning");
    });
  }
}

import type { Document, PageItem } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { LAYER_MEMORIAL, VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { findEditorialLayer } from "../utils/editorial-layer";

export class MemorialDescritivoValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.MEMORIAL_DESCRITIVO;
  readonly name = "Memorial Descritivo";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const layer = findEditorialLayer(doc);
      if (!layer) {
        return createResult(
          this.id,
          this.name,
          [{ message: "Layer sem conteúdo", details: `Layer ${LAYER_MEMORIAL} inexistente` }],
          "error"
        );
      }

      let hasContent = false;

      const scan = (container: unknown): void => {
        forEachCollectionItem<PageItem>(container, (item) => {
          if (!item || !item.isValid || hasContent) return;

          // layer.pageItems reúne objetos de todas as páginas mesmo com a layer invisível.
          hasContent = true;
          if (item.pageItems && item.pageItems.length > 0) {
            scan(item.pageItems);
          }
        });
      };

      scan(layer.pageItems);

      if (!hasContent) {
        return createResult(
          this.id,
          this.name,
          [{
            message: "Layer sem conteúdo",
            details: `${layer.name} deve conter ao menos um objeto em qualquer página`,
          }],
          "error"
        );
      }

      return createResult(this.id, this.name, [], "success");
    });
  }
}

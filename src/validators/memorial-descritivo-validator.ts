import type { Document, Layer, PageItem } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import {
  LAYER_ESTILOS_ALT,
  LAYER_MEMORIAL,
  VALIDATOR_IDS,
} from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { layerExists } from "../utils/indesign-helpers";

function resolveMemorialLayer(doc: Document): Layer | null {
  return (
    layerExists(doc, LAYER_MEMORIAL) ||
    layerExists(doc, LAYER_ESTILOS_ALT) ||
    null
  );
}

export class MemorialDescritivoValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.MEMORIAL_DESCRITIVO;
  readonly name = "Memorial Descritivo";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const layer = resolveMemorialLayer(doc);
      if (!layer) {
        return createResult(
          this.id,
          this.name,
          [{ message: "Layer sem conteúdo", details: `Layer ${LAYER_MEMORIAL} inexistente` }],
          "error"
        );
      }

      let hasText = false;
      let hasRectangle = false;
      let hasGroup = false;
      let hasImage = false;

      const scan = (container: unknown): void => {
        forEachCollectionItem<PageItem>(container, (item) => {
          if (!item || !item.isValid) return;

          const typeName = item.constructor.name;
          if (typeName === "TextFrame") hasText = true;
          if (typeName === "Rectangle" || typeName === "Oval" || typeName === "Polygon") {
            hasRectangle = true;
          }
          if (typeName === "Group") hasGroup = true;
          if (
            typeName === "Image" ||
            (item.graphics && item.graphics.length > 0) ||
            (item.images && item.images.length > 0)
          ) {
            hasImage = true;
          }

          if (item.pageItems && item.pageItems.length > 0) {
            scan(item.pageItems);
          }
        });
      };

      scan(layer.pageItems);

      if (!hasText && !hasRectangle && !hasGroup && !hasImage) {
        return createResult(
          this.id,
          this.name,
          [{
            message: "Layer sem conteúdo",
            details: `${layer.name} deve conter textos, retângulos, grupos ou imagens`,
          }],
          "error"
        );
      }

      return createResult(this.id, this.name, [], "success");
    });
  }
}

import type { Document, Layer } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import {
  LAYER_ESTILOS_ALT,
  LAYER_GUIAS_ALT,
  LAYER_GUIAS_DELETAR,
  LAYER_MEMORIAL,
  VALIDATOR_IDS,
} from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { layerExists } from "../utils/indesign-helpers";

function findLayerCaseInsensitive(doc: Document, targetName: string): Layer | null {
  const exact = layerExists(doc, targetName);
  if (exact) return exact;

  const target = targetName.toLowerCase();
  let found: Layer | null = null;

  forEachCollectionItem<Layer>(doc.layers, (layer) => {
    if (!layer || !layer.isValid || found) return;
    if ((layer.name || "").toLowerCase() === target) {
      found = layer;
    }
  });

  return found;
}

function hasExactLayer(doc: Document, name: string): boolean {
  return layerExists(doc, name) !== null;
}

export class LayersObrigatoriasValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.LAYERS_OBRIGATORIAS;
  readonly name = "Layers Obrigatórias";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];

      const memorial = findLayerCaseInsensitive(doc, LAYER_MEMORIAL);
      const estilos = findLayerCaseInsensitive(doc, LAYER_ESTILOS_ALT);

      if (!memorial && !estilos) {
        issues.push({
          message: `Layer "${LAYER_MEMORIAL}" inexistente`,
          details: "Crie a layer MEMORIAL no documento.",
        });
      }

      const guiasDeletar = findLayerCaseInsensitive(doc, LAYER_GUIAS_DELETAR);
      const guias = findLayerCaseInsensitive(doc, LAYER_GUIAS_ALT);

      if (!guiasDeletar && !guias) {
        issues.push({
          message: `Layer "${LAYER_GUIAS_DELETAR}" inexistente`,
          details: "Crie a layer GUIAS_DELETAR no documento.",
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

export class LayersNomenclaturaValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.LAYERS_NOMENCLATURA;
  readonly name = "Layers — Nomenclatura";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];

      if (!hasExactLayer(doc, LAYER_MEMORIAL) && hasExactLayer(doc, LAYER_ESTILOS_ALT)) {
        issues.push({
          message: "Nomenclatura incorreta de layer",
          object: LAYER_ESTILOS_ALT,
          details: `Renomeie "${LAYER_ESTILOS_ALT}" para "${LAYER_MEMORIAL}".`,
        });
      }

      if (!hasExactLayer(doc, LAYER_GUIAS_DELETAR) && hasExactLayer(doc, LAYER_GUIAS_ALT)) {
        issues.push({
          message: "Nomenclatura incorreta de layer",
          object: LAYER_GUIAS_ALT,
          details: `Renomeie "${LAYER_GUIAS_ALT}" para "${LAYER_GUIAS_DELETAR}".`,
        });
      }

      return createResult(this.id, this.name, issues, "warning");
    });
  }
}

import type { Document, Layer } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import {
  LAYER_GUIAS_ALT,
  LAYER_GUIAS_DELETAR,
  LAYER_MEMORIAL_DESCRITIVO,
  LAYER_RENDIMENTO,
  VALIDATOR_IDS,
} from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { findEditorialLayer, findRendimentoLayer, normalizeLayerName } from "../utils/editorial-layer";
import { layerExists } from "../utils/indesign-helpers";

function findLayerByNormalizedKeys(doc: Document, keys: string[]): Layer | null {
  const keySet = new Set(keys.map(normalizeLayerName));
  let found: Layer | null = null;

  forEachCollectionItem<Layer>(doc.layers, (layer) => {
    if (found || !layer?.isValid) return;
    if (keySet.has(normalizeLayerName(layer.name || ""))) {
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
      const issues: ValidationIssue[] = [];

      if (!findEditorialLayer(doc)) {
        issues.push({
          message: `Layer "${LAYER_MEMORIAL_DESCRITIVO}" inexistente`,
          details: `Crie a layer "${LAYER_MEMORIAL_DESCRITIVO}" no documento.`,
        });
      }

      if (!findRendimentoLayer(doc)) {
        issues.push({
          message: `Layer "${LAYER_RENDIMENTO}" inexistente`,
          details: `Crie a layer "${LAYER_RENDIMENTO}" no documento.`,
        });
      }

      const guias = findLayerByNormalizedKeys(doc, [LAYER_GUIAS_DELETAR, LAYER_GUIAS_ALT]);
      if (!guias) {
        issues.push({
          message: `Layer "${LAYER_GUIAS_DELETAR}" inexistente`,
          details: `Crie a layer "${LAYER_GUIAS_DELETAR}" no documento.`,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

export class LayersNomenclaturaValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.LAYERS_NOMENCLATURA;
  readonly name = "Layers - Nomenclatura";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      const editorial = findEditorialLayer(doc);
      if (editorial && !hasExactLayer(doc, LAYER_MEMORIAL_DESCRITIVO)) {
        issues.push({
          message: "Nomenclatura incorreta de layer",
          object: editorial.name,
          details: `Renomeie "${editorial.name}" para "${LAYER_MEMORIAL_DESCRITIVO}".`,
        });
      }

      const rendimento = findRendimentoLayer(doc);
      if (rendimento && !hasExactLayer(doc, LAYER_RENDIMENTO)) {
        issues.push({
          message: "Nomenclatura incorreta de layer",
          object: rendimento.name,
          details: `Renomeie "${rendimento.name}" para "${LAYER_RENDIMENTO}".`,
        });
      }

      const guias = findLayerByNormalizedKeys(doc, [LAYER_GUIAS_DELETAR, LAYER_GUIAS_ALT]);
      if (guias && !hasExactLayer(doc, LAYER_GUIAS_DELETAR)) {
        issues.push({
          message: "Nomenclatura incorreta de layer",
          object: guias.name,
          details: `Renomeie "${guias.name}" para "${LAYER_GUIAS_DELETAR}".`,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

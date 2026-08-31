import type { Document, Layer } from "indesign";
import { LAYER_MEMORIAL_DESCRITIVO } from "./constants";
import { forEachCollectionItem } from "./collection-helpers";

const EDITORIAL_LAYER_NAMES = new Set([
  "estilos",
  "memorial",
  "memorial descritivo",
  "memoral descritivo",
]);

/** Normaliza somente caixa, espaços e underline, conforme as nomenclaturas aceitas. */
export function normalizeLayerName(name: string): string {
  return (name || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

export function isEditorialLayerName(name: string): boolean {
  return EDITORIAL_LAYER_NAMES.has(normalizeLayerName(name));
}

export function isRendimentoLayerName(name: string): boolean {
  return normalizeLayerName(name) === "rendimento";
}

/** Localiza a layer de estilos/memorial sem depender de visibilidade ou caixa. */
export function findEditorialLayer(doc: Document): Layer | null {
  let exact: Layer | null = null;
  let alias: Layer | null = null;

  forEachCollectionItem<Layer>(doc.layers, (layer) => {
    if (!layer?.isValid) return;
    if (layer.name === LAYER_MEMORIAL_DESCRITIVO) {
      exact = layer;
      return;
    }
    if (!alias && isEditorialLayerName(layer.name)) {
      alias = layer;
    }
  });

  return exact || alias;
}

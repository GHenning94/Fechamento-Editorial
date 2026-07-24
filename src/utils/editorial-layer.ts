import type { Document, Layer } from "indesign";
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

/** Localiza a layer de estilos/memorial sem depender de visibilidade ou caixa. */
export function findEditorialLayer(doc: Document): Layer | null {
  let found: Layer | null = null;

  forEachCollectionItem<Layer>(doc.layers, (layer) => {
    if (found || !layer?.isValid) return;
    if (isEditorialLayerName(layer.name)) {
      found = layer;
    }
  });

  return found;
}

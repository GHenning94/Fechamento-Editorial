import type { Document, Layer, PageItem } from "indesign";
import { LAYER_MEMORIAL_DESCRITIVO, LAYER_RENDIMENTO } from "./constants";
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

export function isGuiasLayerName(name: string): boolean {
  const key = normalizeLayerName(name);
  return key === "guias" || key === "guias deletar";
}

/** Layers de memorial, rendimento e guias — ignoradas em validações de conteúdo de arte. */
export function isPluginUtilityLayerName(name: string): boolean {
  return isEditorialLayerName(name) || isRendimentoLayerName(name) || isGuiasLayerName(name);
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

/** Localiza a layer de rendimento sem depender de visibilidade ou caixa. */
export function findRendimentoLayer(doc: Document): Layer | null {
  let exact: Layer | null = null;
  let alias: Layer | null = null;

  forEachCollectionItem<Layer>(doc.layers, (layer) => {
    if (!layer?.isValid) return;
    if (layer.name === LAYER_RENDIMENTO) {
      exact = layer;
      return;
    }
    if (!alias && isRendimentoLayerName(layer.name)) {
      alias = layer;
    }
  });

  return exact || alias;
}

/** Conteúdo da layer, independente de visibilidade ou cadeado. */
export function layerHasContent(layer: Layer | null): boolean {
  if (!layer?.isValid) return false;
  try {
    if (layer.pageItems && layer.pageItems.length > 0) return true;
  } catch {
    // fallback abaixo
  }
  let found = false;
  try {
    forEachCollectionItem<PageItem>(layer.pageItems, (item) => {
      if (found || !item?.isValid) return;
      found = true;
    });
  } catch {
    return false;
  }
  return found;
}

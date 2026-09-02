import type { Document, Layer, PageItem } from "indesign";
import { LAYER_MEMORIAL_DESCRITIVO, LAYER_RENDIMENTO } from "./constants";
import { forEachCollectionItem, getCollectionItem } from "./collection-helpers";
import { getInDesignModule } from "./indesign-runtime";

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

function readItemLabel(item: { label?: string; name?: string } | null | undefined): string {
  try {
    return (item?.label || "").trim();
  } catch {
    return "";
  }
}

function readItemName(item: { name?: string } | null | undefined): string {
  try {
    return (item?.name || "").trim();
  } catch {
    return "";
  }
}

/** Tags do memorial descritivo / rendimento e qualquer objeto nessas layers. */
export function isPluginGeneratedItem(item: PageItem | null | undefined): boolean {
  let current: { label?: string; name?: string; itemLayer?: { name?: string }; parent?: unknown } | null | undefined =
    item;
  for (let depth = 0; depth < 8 && current; depth++) {
    try {
      if (isPluginUtilityLayerName(current.itemLayer?.name || "")) return true;
    } catch {
      // ignore
    }
    const label = readItemLabel(current).toLowerCase();
    const name = readItemName(current);
    if (
      label === "eac-style-tag" ||
      label === "eac-rendimento-tag" ||
      name.startsWith("EAC_TAG_") ||
      name.startsWith("EAC_REND_")
    ) {
      return true;
    }
    current = current.parent as typeof current;
  }
  return false;
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

function unlockLayerForStack(layer: Layer): void {
  try {
    layer.visible = true;
    layer.locked = false;
  } catch {
    // ignore
  }
}

function moveLayerToTop(doc: Document, layer: Layer | null): void {
  if (!layer?.isValid) return;
  unlockLayerForStack(layer);

  const { LocationOptions } = getInDesignModule() as {
    LocationOptions?: { AT_BEGINNING?: number; BEFORE?: number };
  };

  try {
    if (LocationOptions?.AT_BEGINNING != null) {
      layer.move?.(LocationOptions.AT_BEGINNING);
      return;
    }
  } catch {
    // tenta BEFORE
  }

  try {
    const top = getCollectionItem<Layer>(doc.layers, 0);
    if (top?.isValid && top !== layer && LocationOptions?.BEFORE != null) {
      layer.move?.(LocationOptions.BEFORE, top);
    }
  } catch {
    // ignore
  }
}

/** Memorial e rendimento acima da arte. Rendimento fica no topo da pilha. */
export function bringPluginTagLayersToFront(doc: Document): void {
  moveLayerToTop(doc, findEditorialLayer(doc));
  moveLayerToTop(doc, findRendimentoLayer(doc));
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

import type { Document, Layer } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";

export interface LayerLockSnapshot {
  name: string;
  locked: boolean;
}

export function snapshotLayerLocks(doc: Document): LayerLockSnapshot[] {
  const snapshot: LayerLockSnapshot[] = [];
  forEachCollectionItem<Layer>(doc.layers, (layer) => {
    if (!layer?.isValid) return;
    try {
      snapshot.push({ name: layer.name || "", locked: Boolean(layer.locked) });
    } catch {
      // ignore
    }
  });
  return snapshot;
}

export function unlockAllLayers(doc: Document): void {
  forEachCollectionItem<Layer>(doc.layers, (layer) => {
    if (!layer?.isValid) return;
    try {
      if (layer.locked) layer.locked = false;
    } catch {
      // ignore
    }
  });
}

export function restoreLayerLocks(doc: Document, snapshot: LayerLockSnapshot[]): void {
  for (const entry of snapshot) {
    if (!entry.name) continue;
    try {
      const layer = doc.layers.itemByName(entry.name);
      if (layer?.isValid) layer.locked = entry.locked;
    } catch {
      // ignore
    }
  }
}

export function withLayersUnlockedForValidation<T>(doc: Document, fn: () => T): T {
  const snapshot = snapshotLayerLocks(doc);
  unlockAllLayers(doc);
  try {
    return fn();
  } finally {
    restoreLayerLocks(doc, snapshot);
  }
}

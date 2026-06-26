/**
 * Acesso seguro a coleções do InDesign UXP.
 * Algumas coleções usam .item(n), outras suportam apenas [n] ou são arrays.
 */
export function getCollectionLength(collection: unknown): number {
  if (!collection) return 0;

  try {
    const value = collection as { length?: number };
    if (typeof value.length === "number" && value.length >= 0) {
      return value.length;
    }
  } catch {
    return 0;
  }

  return Array.isArray(collection) ? collection.length : 0;
}

export function getCollectionItem<T>(collection: unknown, index: number): T | null {
  if (!collection || index < 0) return null;

  try {
    const coll = collection as {
      item?: (i: number) => T;
      [key: number]: T;
    };

    if (typeof coll.item === "function") {
      const item = coll.item(index);
      return item ?? null;
    }

    if (Array.isArray(coll)) {
      return coll[index] ?? null;
    }

    const bracketItem = coll[index];
    return bracketItem ?? null;
  } catch {
    return null;
  }
}

export function forEachCollectionItem<T>(
  collection: unknown,
  callback: (item: T, index: number) => void
): void {
  const length = getCollectionLength(collection);
  for (let i = 0; i < length; i++) {
    const item = getCollectionItem<T>(collection, i);
    if (item) {
      callback(item, i);
    }
  }
}

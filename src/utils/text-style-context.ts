import type { CharacterStyle, Document, ParagraphStyle } from "indesign";

function itemByName<T extends { isValid?: boolean }>(
  collection: { itemByName?: (name: string) => T } | undefined,
  names: string[]
): T | null {
  if (typeof collection?.itemByName !== "function") return null;
  for (const name of names) {
    try {
      const item = collection.itemByName(name);
      if (item && item.isValid !== false) return item;
    } catch {
      // tenta o próximo nome localizado
    }
  }
  return null;
}

export function findNoParagraphStyle(doc: Document): ParagraphStyle | null {
  return itemByName(doc.paragraphStyles, [
    "[No Paragraph Style]",
    "[Sem estilo de parágrafo]",
    "$ID/NormalParagraphStyle",
  ]);
}

export function findNoneCharacterStyle(doc: Document): CharacterStyle | null {
  return itemByName(doc.characterStyles, ["[None]", "[Nenhum]", "$ID/[None]"]);
}

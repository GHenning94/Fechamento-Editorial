import type { CharacterStyle, Document, PageItem, ParagraphStyle, Text } from "indesign";
import { getCollectionItem } from "./collection-helpers";
import { clearInDesignSelection, getInDesignApp } from "./indesign-runtime";

type TextStyleTarget = {
  appliedParagraphStyle?: unknown;
  appliedCharacterStyle?: unknown;
};

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
  const named = itemByName(doc.paragraphStyles, [
    "[No Paragraph Style]",
    "[Sem estilo de parágrafo]",
    "$ID/NormalParagraphStyle",
  ]);
  if (named) return named;
  return getCollectionItem<ParagraphStyle>(doc.paragraphStyles, 0);
}

export function findNoneCharacterStyle(doc: Document): CharacterStyle | null {
  const named = itemByName(doc.characterStyles, [
    "[None]",
    "[Nenhum]",
    "$ID/[None]",
    "[Sem estilo de caractere]",
  ]);
  if (named) return named;
  return getCollectionItem<CharacterStyle>(doc.characterStyles, 0);
}

function assignStyle(target: TextStyleTarget | null | undefined, paragraph: unknown, character: unknown): void {
  if (!target) return;
  if (paragraph) {
    try {
      target.appliedParagraphStyle = paragraph;
    } catch {
      // ignore
    }
  }
  if (character) {
    try {
      target.appliedCharacterStyle = character;
    } catch {
      // ignore
    }
  }
}

function applyNoneToText(text: Text | null | undefined, nonePara: ParagraphStyle | null, noneChar: CharacterStyle | null): void {
  if (!text) return;
  assignStyle(text, nonePara, noneChar);
  try {
    const chars = (text as Text & { characters?: { everyItem?: () => TextStyleTarget } }).characters;
    const every = chars?.everyItem?.();
    if (every) assignStyle(every, nonePara, noneChar);
  } catch {
    // ignore
  }
  try {
    (text as Text & { clearOverrides?: () => void }).clearOverrides?.();
  } catch {
    // ignore
  }
  assignStyle(text, nonePara, noneChar);
}

export function applyNoneCharacterStyle(text: Text | null | undefined, noneChar: CharacterStyle | null): void {
  if (!text || !noneChar) return;
  applyNoneToText(text, null, noneChar);
}

/**
 * Coloca o documento em [Sem estilo de parágrafo] + [Nenhum] caractere
 * (painel de estilos e textDefaults). Não grava app.textDefaults (isso fecha o InDesign).
 */
export function activateNoneTextStyles(doc: Document): void {
  const nonePara = findNoParagraphStyle(doc);
  const noneChar = findNoneCharacterStyle(doc);
  if (!nonePara && !noneChar) {
    clearInDesignSelection();
    return;
  }

  clearInDesignSelection();

  try {
    const defaults = (doc as Document & { textDefaults?: TextStyleTarget }).textDefaults;
    assignStyle(defaults, nonePara, noneChar);
  } catch {
    // ignore
  }

  let dummy: PageItem | null = null;
  try {
    const page = getCollectionItem<{ textFrames?: { add?: () => PageItem } }>(doc.pages, 0);
    dummy = page?.textFrames?.add?.() ?? null;
    if (!dummy?.isValid) return;
    dummy.geometricBounds = [-8000, -5000, -7988, -4880];
    dummy.contents = " ";
    applyNoneToText(getCollectionItem<Text>(dummy.texts, 0), nonePara, noneChar);
    try {
      const app = getInDesignApp() as { select?: (value: unknown) => void };
      app.select?.(dummy);
    } catch {
      // ignore
    }
    try {
      const defaults = (doc as Document & { textDefaults?: TextStyleTarget }).textDefaults;
      assignStyle(defaults, nonePara, noneChar);
    } catch {
      // ignore
    }
  } catch {
    // ignore
  } finally {
    try {
      dummy?.remove?.();
    } catch {
      // ignore
    }
    clearInDesignSelection();
  }
}

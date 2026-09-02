import type { CharacterStyle, Document, ParagraphStyle } from "indesign";
import { clearInDesignSelection, getInDesignApp, getInDesignModule } from "./indesign-runtime";

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
  return itemByName(doc.paragraphStyles, [
    "[No Paragraph Style]",
    "[Sem estilo de parágrafo]",
    "$ID/NormalParagraphStyle",
  ]);
}

export function findNoneCharacterStyle(doc: Document): CharacterStyle | null {
  return itemByName(doc.characterStyles, ["[None]", "[Nenhum]", "$ID/[None]"]);
}

function readApplied(target: TextStyleTarget | null | undefined): {
  paragraph?: unknown;
  character?: unknown;
} {
  if (!target) return {};
  try {
    return {
      paragraph: target.appliedParagraphStyle,
      character: target.appliedCharacterStyle,
    };
  } catch {
    return {};
  }
}

function applyApplied(
  target: TextStyleTarget | null | undefined,
  paragraph: unknown,
  character: unknown
): void {
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

function getDocTextDefaults(doc: Document): TextStyleTarget | null {
  try {
    const defaults = (doc as Document & { textDefaults?: TextStyleTarget }).textDefaults;
    if (defaults) return defaults;
  } catch {
    // ignore
  }
  return null;
}

function getAppTextDefaults(): TextStyleTarget | null {
  try {
    const defaults = (getInDesignApp() as { textDefaults?: TextStyleTarget }).textDefaults;
    if (defaults) return defaults;
  } catch {
    // ignore
  }
  return null;
}

function clearDocumentSelection(doc: Document): void {
  clearInDesignSelection();
  try {
    const { NothingEnum } = getInDesignModule() as { NothingEnum?: { NOTHING?: unknown } };
    const select = (doc as Document & { select?: (value: unknown) => void }).select;
    if (NothingEnum && "NOTHING" in NothingEnum && typeof select === "function") {
      select(NothingEnum.NOTHING);
    }
  } catch {
    // ignore
  }
}

/**
 * Tira o cursor/seleção e aplica [Sem estilo de parágrafo] + [Nenhum] caractere
 * nos padrões de texto. Assim `paragraphStyles.add()` não herda o estilo ativo no painel.
 */
export async function withNeutralTextStyleContext<T>(
  doc: Document,
  fn: () => Promise<T>
): Promise<T> {
  const docDefaults = getDocTextDefaults(doc);
  const appDefaults = getAppTextDefaults();
  const previousDoc = readApplied(docDefaults);
  const previousApp = readApplied(appDefaults);
  const nonePara = findNoParagraphStyle(doc);
  const noneChar = findNoneCharacterStyle(doc);

  clearDocumentSelection(doc);
  applyApplied(docDefaults, nonePara, noneChar);
  applyApplied(appDefaults, nonePara, noneChar);

  try {
    return await fn();
  } finally {
    applyApplied(docDefaults, previousDoc.paragraph, previousDoc.character);
    applyApplied(appDefaults, previousApp.paragraph, previousApp.character);
  }
}

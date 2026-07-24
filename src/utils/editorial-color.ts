import type { Color, Document } from "indesign";
import { COLOR_CORPROF, COLOR_GUIAS_DELETAR } from "./constants";
import { forEachCollectionItem } from "./collection-helpers";

export interface EditorialColorMatch {
  color: Color;
  /** true quando o nome da amostra é exatamente o canônico esperado */
  exactName: boolean;
  foundName: string;
}

/** Normaliza caixa, espaços e underline para comparar nomenclaturas. */
export function normalizeColorName(name: string): string {
  return (name || "")
    .trim()
    .toLocaleLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

const GUIAS_COLOR_KEYS = new Set(["guias deletar", "guias"]);
const CORPROF_COLOR_KEYS = new Set(["corprof", "cor prof"]);

function colorByExactName(doc: Document, colorName: string): Color | null {
  try {
    const color = doc.colors.itemByName(colorName);
    if (color && color.isValid) {
      return color;
    }
  } catch {
    return null;
  }
  return null;
}

function findColorByKeys(
  doc: Document,
  canonicalName: string,
  aliasKeys: Set<string>
): EditorialColorMatch | null {
  const exact = colorByExactName(doc, canonicalName);
  if (exact) {
    return {
      color: exact,
      exactName: true,
      foundName: exact.name || canonicalName,
    };
  }

  const canonicalKey = normalizeColorName(canonicalName);
  const matches: Color[] = [];

  forEachCollectionItem<Color>(doc.colors, (color) => {
    if (!color?.isValid) return;
    const key = normalizeColorName(color.name || "");
    if (key === canonicalKey || aliasKeys.has(key)) {
      matches.push(color);
    }
  });

  const found = matches[0];
  if (!found) {
    return null;
  }

  const foundName = found.name || "";
  return {
    color: found,
    exactName: foundName === canonicalName,
    foundName,
  };
}

export function findGuiasDeletarColor(doc: Document): EditorialColorMatch | null {
  return findColorByKeys(doc, COLOR_GUIAS_DELETAR, GUIAS_COLOR_KEYS);
}

export function findCorProfColor(doc: Document): EditorialColorMatch | null {
  return findColorByKeys(doc, COLOR_CORPROF, CORPROF_COLOR_KEYS);
}

export function isGuiasDeletarColorName(name: string): boolean {
  const key = normalizeColorName(name);
  return key === normalizeColorName(COLOR_GUIAS_DELETAR) || GUIAS_COLOR_KEYS.has(key);
}

export function isCorProfColorName(name: string): boolean {
  const key = normalizeColorName(name);
  return key === normalizeColorName(COLOR_CORPROF) || CORPROF_COLOR_KEYS.has(key);
}

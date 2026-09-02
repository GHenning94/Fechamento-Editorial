import type { Color, Document, Swatch } from "indesign";
import { COLOR_CORPROF, COLOR_GUIAS_DELETAR } from "./constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "./collection-helpers";

const PLUGIN_BLACK_ALIASES = ["EAC_INK", "EAC_TAG_INK", "EAC_RENDIMENTO_FILL"] as const;

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

export function findSwatchByName(doc: Document, names: string[]): Swatch | Color | null {
  for (const name of names) {
    try {
      const swatch = doc.swatches?.itemByName(name);
      if (swatch?.isValid) return swatch;
    } catch {
      // ignore
    }
    try {
      const color = doc.colors.itemByName(name);
      if (color?.isValid) return color;
    } catch {
      // ignore
    }
  }
  return null;
}

function isBuiltInBlackName(name: string): boolean {
  const key = (name || "")
    .trim()
    .replace(/^\$id\//i, "")
    .replace(/^\[|\]$/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
  return key === "black" || key === "preto";
}

export function findDocumentBlack(doc: Document): Swatch | Color | null {
  const named = findSwatchByName(doc, ["Black", "Preto", "[Black]", "[Preto]", "$ID/Black", "$ID/Preto"]);
  if (named) return named;

  const source = doc.swatches ?? doc.colors;
  const length = getCollectionLength(source);
  for (let i = 0; i < length; i++) {
    const item = getCollectionItem<Swatch | Color>(source, i);
    if (!item?.isValid) continue;
    try {
      if (isBuiltInBlackName(item.name || "")) return item;
    } catch {
      // ignore
    }
  }
  return null;
}

function tryRemoveColor(color: Color): void {
  try {
    color.remove();
  } catch {
    // ainda em uso
  }
}

function discardPluginBlackSwatches(doc: Document): void {
  for (const name of PLUGIN_BLACK_ALIASES) {
    const extra = colorByExactName(doc, name);
    if (extra) tryRemoveColor(extra);
  }
}

/** Usa o [Preto] do documento. Não cria amostra de preto. */
export function ensurePluginInk(doc: Document): Swatch | Color | null {
  const black = findDocumentBlack(doc);
  discardPluginBlackSwatches(doc);
  return black;
}

export function findPluginInk(doc: Document): Swatch | Color | null {
  return findDocumentBlack(doc);
}

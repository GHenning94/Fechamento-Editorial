import type { Color, PageItem, Swatch } from "indesign";
import { getCollectionItem, forEachCollectionItem } from "./collection-helpers";
import { getImageColorSpaceLabel, swatchNameOf } from "./color-model";

const VALUE_EPS = 1.25;

function approx(a: number, b: number, eps = VALUE_EPS): boolean {
  return Math.abs(a - b) <= eps;
}

export function normalizeSwatchKey(name: string): string {
  return (name || "")
    .trim()
    .replace(/^\$id\//i, "")
    .replace(/^\[|\]$/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function isNoneKey(key: string): boolean {
  return key === "none" || key === "nenhuma" || key === "nenhum";
}

function isNoneStyleName(name: string): boolean {
  const key = normalizeSwatchKey(name);
  return (
    !key ||
    isNoneKey(key) ||
    key === "no character style" ||
    key === "sem estilo de caractere" ||
    key === "no paragraph style" ||
    key === "sem estilo de paragrafo"
  );
}

function isPaperKey(key: string): boolean {
  return key === "paper" || key === "papel";
}

function isBlackKey(key: string): boolean {
  return key === "black" || key === "preto";
}

function isGrayNameKey(key: string): boolean {
  return key.includes("cinza") || key.includes("gray") || key.includes("grey");
}

function normalizeTintPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 100;
  if (value > 0 && value < 1) return value * 100;
  return value;
}

function readRawFillTint(target: { fillTint?: number; properties?: { fillTint?: number } } | null | undefined): number | null {
  if (!target) return null;
  try {
    const tint = target.fillTint;
    if (typeof tint === "number" && tint >= 0) return normalizeTintPercent(tint);
  } catch {
    // ignore
  }
  try {
    const tint = target.properties?.fillTint;
    if (typeof tint === "number" && tint >= 0) return normalizeTintPercent(tint);
  } catch {
    // ignore
  }
  try {
    const tintValue = (target as { tintValue?: number }).tintValue;
    if (typeof tintValue === "number" && tintValue >= 0) return normalizeTintPercent(tintValue);
  } catch {
    // ignore
  }
  return null;
}

export function readFillTint(target: { fillTint?: number } | null | undefined): number {
  const tint = readRawFillTint(target);
  return tint == null ? 100 : tint;
}

export function readEffectiveFillTint(target: {
  fillTint?: number;
  properties?: { fillTint?: number };
  appliedCharacterStyle?: { name?: string; fillTint?: number };
  appliedParagraphStyle?: { name?: string; fillTint?: number };
} | null | undefined): number {
  const local = readRawFillTint(target);
  if (local != null) return local;

  try {
    const characterStyle = target?.appliedCharacterStyle;
    if (characterStyle && !isNoneStyleName(characterStyle.name || "")) {
      const fromChar = readRawFillTint(characterStyle);
      if (fromChar != null) return fromChar;
    }
  } catch {
    // ignore
  }

  try {
    const paragraphStyle = target?.appliedParagraphStyle;
    if (paragraphStyle && !isNoneStyleName(paragraphStyle.name || "")) {
      const fromPara = readRawFillTint(paragraphStyle);
      if (fromPara != null) return fromPara;
    }
  } catch {
    // ignore
  }

  return 100;
}

export function readEffectiveFillColor(target: {
  fillColor?: Swatch | Color | string;
  properties?: { fillColor?: Swatch | Color | string };
  appliedCharacterStyle?: { name?: string; fillColor?: Swatch | Color | string };
  appliedParagraphStyle?: { name?: string; fillColor?: Swatch | Color | string };
} | null | undefined): Swatch | Color | string | null {
  if (!target) return null;

  const tryFill = (source: unknown): Swatch | Color | string | null => {
    if (source == null) return null;
    if (typeof source === "string") return source.trim() ? source : null;
    return source as Swatch | Color;
  };

  try {
    const fill = tryFill(target.fillColor);
    if (fill) return fill;
  } catch {
    // ignore
  }
  try {
    const fill = tryFill(target.properties?.fillColor);
    if (fill) return fill;
  } catch {
    // ignore
  }
  try {
    const characterStyle = target.appliedCharacterStyle;
    if (characterStyle && !isNoneStyleName(characterStyle.name || "")) {
      const fill = tryFill(characterStyle.fillColor);
      if (fill) return fill;
    }
  } catch {
    // ignore
  }
  try {
    const paragraphStyle = target.appliedParagraphStyle;
    if (paragraphStyle && !isNoneStyleName(paragraphStyle.name || "")) {
      const fill = tryFill(paragraphStyle.fillColor);
      if (fill) return fill;
    }
  } catch {
    // ignore
  }
  return null;
}

function readColorValues(fill: Swatch | Color | null | undefined): number[] {
  try {
    const values = (fill as Color | null)?.colorValue;
    if (Array.isArray(values)) {
      return values.map((item) => Number(item)).filter((value) => Number.isFinite(value));
    }
  } catch {
    // ignore
  }

  try {
    const base = (fill as { baseColor?: Color } | null)?.baseColor;
    const values = base?.colorValue;
    if (Array.isArray(values)) {
      return values.map((item) => Number(item)).filter((value) => Number.isFinite(value));
    }
  } catch {
    // ignore
  }

  return [];
}

function readSpaceLabel(fill: Swatch | Color | null | undefined): string {
  try {
    const space = (fill as Color | null)?.space;
    if (space != null) return getImageColorSpaceLabel(space);
  } catch {
    // ignore
  }
  return "";
}

function scaleChannel(value: number, tint: number): number {
  return (value * tint) / 100;
}

export function isNoneOrPaperFill(fill: Swatch | Color | string | null | undefined): boolean {
  if (fill == null) return true;
  if (typeof fill === "string") {
    const key = normalizeSwatchKey(fill);
    return isNoneKey(key) || isPaperKey(key);
  }
  const key = normalizeSwatchKey(swatchNameOf(fill));
  return isNoneKey(key) || isPaperKey(key);
}

export function isWhiteFill(fill: Swatch | Color | string | null | undefined, tint = 100): boolean {
  if (typeof fill === "string") {
    const key = normalizeSwatchKey(fill);
    return isPaperKey(key);
  }
  if (isNoneOrPaperFill(fill)) return true;

  const values = readColorValues(fill);
  const space = readSpaceLabel(fill);
  const t = tint < 0 ? 100 : tint;

  if (space === "CMYK" && values.length >= 4) {
    return (
      approx(scaleChannel(values[0], t), 0) &&
      approx(scaleChannel(values[1], t), 0) &&
      approx(scaleChannel(values[2], t), 0) &&
      approx(scaleChannel(values[3], t), 0)
    );
  }

  if (space === "RGB" && values.length >= 3) {
    return (
      approx(scaleChannel(values[0], t), 255, 3) &&
      approx(scaleChannel(values[1], t), 255, 3) &&
      approx(scaleChannel(values[2], t), 255, 3)
    );
  }

  return false;
}

function fillNameKey(fill: Swatch | Color | string | null | undefined): string {
  if (typeof fill === "string") return normalizeSwatchKey(fill);
  return normalizeSwatchKey(swatchNameOf(fill));
}

/**
 * Tom de cinza: tinta Black com tint < 100, K-only abaixo de 100%,
 * RGB acromático, ou amostra cujo nome indica cinza.
 */
export function isGrayFill(fill: Swatch | Color | string | null | undefined, tint = 100): boolean {
  if (fill == null) return false;

  const key = fillNameKey(fill);
  if (isNoneKey(key) || isPaperKey(key)) return false;

  let t = tint < 0 ? 100 : tint;
  if (typeof fill !== "string") {
    try {
      const typeName = (fill as { constructor?: { name?: string } }).constructor?.name || "";
      if (typeName === "Tint") {
        const swatchTint = (fill as { tintValue?: number }).tintValue;
        if (typeof swatchTint === "number" && swatchTint >= 0 && swatchTint <= 100) {
          t = (t * normalizeTintPercent(swatchTint)) / 100;
        }
      }
    } catch {
      // ignore
    }
  }
  if (t <= 0.5) return false;

  if (isGrayNameKey(key)) return true;

  if (isBlackKey(key)) {
    return t < 99.5;
  }
  if ((key.includes("black") || key.includes("preto")) && t < 99.5) {
    return true;
  }
  if ((key.includes("black") || key.includes("preto")) && /\d/.test(key) && !/(^|[^0-9])100([^0-9]|$)/.test(key)) {
    return true;
  }

  const values = typeof fill === "string" ? [] : readColorValues(fill);
  const space = typeof fill === "string" ? "" : readSpaceLabel(fill);

  if ((space === "CMYK" || (!space && values.length >= 4)) && values.length >= 4) {
    const c = scaleChannel(values[0], t);
    const m = scaleChannel(values[1], t);
    const y = scaleChannel(values[2], t);
    const k = scaleChannel(values[3], t);
    const cmyEqual = approx(c, m, 4) && approx(m, y, 4);
    if (approx(c, 0) && approx(m, 0) && approx(y, 0)) {
      return k > 0.5 && k < 99.5;
    }
    if (cmyEqual && !approx(c, 0)) {
      return k < 99.5;
    }
  }

  if (space === "RGB" && values.length >= 3) {
    const r = scaleChannel(values[0], t);
    const g = scaleChannel(values[1], t);
    const b = scaleChannel(values[2], t);
    if (approx(r, g, 8) && approx(g, b, 8)) {
      return r > 2 && r < 253;
    }
  }

  if (space === "Gray" && values.length >= 1) {
    const gray = scaleChannel(values[0], t);
    return gray > 0.5 && gray < 99.5;
  }

  return false;
}

export function isColoredBackgroundFill(fill: Swatch | Color | string | null | undefined, tint = 100): boolean {
  if (isNoneOrPaperFill(fill)) return false;
  if (isWhiteFill(fill, tint)) return false;
  return true;
}

export function itemHasPlacedGraphic(item: PageItem, depth = 0): boolean {
  const extra = item as PageItem & { allGraphics?: unknown; epss?: unknown; pdfs?: unknown };
  const collections = [extra.allGraphics, item.graphics, item.images, extra.epss, extra.pdfs];
  for (const collection of collections) {
    let found = false;
    try {
      forEachCollectionItem(collection, (graphic) => {
        if (found || !graphic) return;
        found = true;
      });
    } catch {
      // ignore
    }
    if (found) return true;
    try {
      if (getCollectionItem(collection, 0)) return true;
    } catch {
      // ignore
    }
  }

  const typeName = item.constructor?.name || "";
  if (
    typeName === "Image" ||
    typeName === "EPS" ||
    typeName === "PDF" ||
    typeName === "ImportedPage" ||
    typeName === "PICT" ||
    typeName === "WMF"
  ) {
    return true;
  }

  if (depth >= 2) return false;
  try {
    let nested = false;
    forEachCollectionItem<PageItem>(item.pageItems, (child) => {
      if (nested || !child?.isValid) return;
      if (itemHasPlacedGraphic(child, depth + 1)) nested = true;
    });
    if (nested) return true;
  } catch {
    // ignore
  }

  return false;
}

export function geometricBoundsOverlap(a: number[], b: number[]): boolean {
  if (!a || a.length < 4 || !b || b.length < 4) return false;
  const top = Math.max(Number(a[0]), Number(b[0]));
  const left = Math.max(Number(a[1]), Number(b[1]));
  const bottom = Math.min(Number(a[2]), Number(b[2]));
  const right = Math.min(Number(a[3]), Number(b[3]));
  return bottom > top && right > left;
}

export function textFillHasOverprint(target: {
  overprintFill?: boolean;
  fillOverprint?: boolean;
  properties?: { overprintFill?: boolean; fillOverprint?: boolean };
} | null | undefined): boolean {
  if (!target) return false;

  try {
    if (target.overprintFill === true) return true;
  } catch {
    // ignore
  }
  try {
    if (target.fillOverprint === true) return true;
  } catch {
    // ignore
  }
  try {
    if (target.properties?.overprintFill === true) return true;
  } catch {
    // ignore
  }
  try {
    if (target.properties?.fillOverprint === true) return true;
  } catch {
    // ignore
  }
  return false;
}

export function readItemFill(item: PageItem): Swatch | Color | null {
  try {
    return item.fillColor || null;
  } catch {
    return null;
  }
}

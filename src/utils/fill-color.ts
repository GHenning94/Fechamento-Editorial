import type { Color, PageItem, Swatch } from "indesign";
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
  return !key || key === "none" || key === "nenhuma" || key === "nenhum";
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

export function readFillTint(target: { fillTint?: number } | null | undefined): number {
  try {
    const tint = target?.fillTint;
    if (typeof tint === "number" && tint >= 0) return tint;
  } catch {
    // ignore
  }
  try {
    const tintValue = (target as { tintValue?: number } | null)?.tintValue;
    if (typeof tintValue === "number" && tintValue >= 0) return tintValue;
  } catch {
    // ignore
  }
  return 100;
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

export function isNoneOrPaperFill(fill: Swatch | Color | null | undefined): boolean {
  const key = normalizeSwatchKey(swatchNameOf(fill));
  return isNoneKey(key) || isPaperKey(key);
}

export function isWhiteFill(fill: Swatch | Color | null | undefined, tint = 100): boolean {
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

/**
 * Tom de cinza: tinta Black com tint < 100, K-only abaixo de 100%,
 * RGB acromático, ou amostra cujo nome indica cinza.
 */
export function isGrayFill(fill: Swatch | Color | null | undefined, tint = 100): boolean {
  if (!fill) return false;

  const key = normalizeSwatchKey(swatchNameOf(fill));
  if (isNoneKey(key) || isPaperKey(key)) return false;

  let t = tint < 0 ? 100 : tint;
  try {
    const typeName = (fill as { constructor?: { name?: string } }).constructor?.name || "";
    if (typeName === "Tint") {
      const swatchTint = (fill as { tintValue?: number }).tintValue;
      if (typeof swatchTint === "number" && swatchTint >= 0 && swatchTint <= 100) {
        t = (t * swatchTint) / 100;
      }
    }
  } catch {
    // ignore
  }
  if (t <= 0.5) return false;

  if (isGrayNameKey(key)) return true;

  if (isBlackKey(key)) {
    return t < 99.5;
  }

  const values = readColorValues(fill);
  const space = readSpaceLabel(fill);

  if ((space === "CMYK" || (!space && values.length >= 4)) && values.length >= 4) {
    const c = scaleChannel(values[0], t);
    const m = scaleChannel(values[1], t);
    const y = scaleChannel(values[2], t);
    const k = scaleChannel(values[3], t);
    const cmyEqual = approx(c, m) && approx(m, y);
    if (approx(c, 0) && approx(m, 0) && approx(y, 0)) {
      return k > 0.5 && k < 99.5;
    }
    if (cmyEqual && approx(c, 0) === false) {
      return k < 99.5;
    }
  }

  if (space === "RGB" && values.length >= 3) {
    const r = scaleChannel(values[0], t);
    const g = scaleChannel(values[1], t);
    const b = scaleChannel(values[2], t);
    if (approx(r, g, 3) && approx(g, b, 3)) {
      return r > 2 && r < 253;
    }
  }

  if (space === "Gray" && values.length >= 1) {
    const gray = scaleChannel(values[0], t);
    return gray > 0.5 && gray < 99.5;
  }

  return false;
}

export function isColoredBackgroundFill(fill: Swatch | Color | null | undefined, tint = 100): boolean {
  if (isNoneOrPaperFill(fill)) return false;
  if (isWhiteFill(fill, tint)) return false;
  return true;
}

export function itemHasPlacedGraphic(item: PageItem): boolean {
  const extra = item as PageItem & { allGraphics?: { length?: number }; epss?: { length?: number }; pdfs?: unknown };
  const collections = [extra.allGraphics, item.graphics, item.images, extra.epss, extra.pdfs];
  for (const collection of collections) {
    try {
      if (collection && typeof (collection as { length?: number }).length === "number") {
        if ((collection as { length: number }).length > 0) return true;
      }
    } catch {
      // ignore
    }
  }

  const typeName = item.constructor?.name || "";
  return (
    typeName === "Image" ||
    typeName === "EPS" ||
    typeName === "PDF" ||
    typeName === "ImportedPage" ||
    typeName === "PICT" ||
    typeName === "WMF"
  );
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
  appliedParagraphStyle?: { overprintFill?: boolean };
  appliedCharacterStyle?: { overprintFill?: boolean };
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
    if (target.appliedCharacterStyle?.overprintFill === true) return true;
  } catch {
    // ignore
  }
  try {
    if (target.appliedParagraphStyle?.overprintFill === true) return true;
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

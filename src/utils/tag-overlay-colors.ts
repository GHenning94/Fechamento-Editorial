import type { Color, Document, Page, PageItem, Swatch } from "indesign";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "./collection-helpers";
import { getImageColorSpaceLabel } from "./color-model";
import { findCorProfColor, isCorProfColorName, normalizeColorName } from "./editorial-color";
import { isPluginUtilityLayerName } from "./editorial-layer";

export interface TagOverlayPair {
  para: number[];
  char: number[];
}

type Rgb = [number, number, number];

/** Pares claros originais — texto preto, leitura estável. */
const FALLBACK_PARA = [0, 28, 52, 0];
const FALLBACK_CHAR = [52, 18, 0, 0];

/** Candidatas claras (luminância alta) para sempre usar texto preto. */
const CANDIDATES: number[][] = [
  [0, 28, 52, 0],
  [52, 18, 0, 0],
  [0, 12, 90, 0],
  [0, 48, 85, 0],
  [50, 0, 30, 0],
  [70, 8, 0, 0],
  [0, 0, 85, 0],
  [0, 62, 42, 0],
  [32, 32, 0, 0],
  [45, 0, 55, 0],
  [15, 0, 70, 0],
  [60, 0, 8, 0],
];

const MAX_SWATCHES = 120;
const MAX_PAGE_SAMPLES = 180;
const MAX_PAGES = 12;
const MAX_ITEMS_PER_PAGE = 50;

function cmykToRgb(cmyk: number[]): Rgb {
  const c = Math.min(1, Math.max(0, (Number(cmyk[0]) || 0) / 100));
  const m = Math.min(1, Math.max(0, (Number(cmyk[1]) || 0) / 100));
  const y = Math.min(1, Math.max(0, (Number(cmyk[2]) || 0) / 100));
  const k = Math.min(1, Math.max(0, (Number(cmyk[3]) || 0) / 100));
  return [
    1 - Math.min(1, c * (1 - k) + k),
    1 - Math.min(1, m * (1 - k) + k),
    1 - Math.min(1, y * (1 - k) + k),
  ];
}

function rgbDist(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function skipSwatchName(name: string): boolean {
  if (!name || name.startsWith("EAC_")) return true;
  const key = normalizeColorName(name)
    .replace(/^\[|\]$/g, "")
    .replace(/^\$id\//, "");
  if (
    key === "none" ||
    key === "nenhum" ||
    key === "nenhuma" ||
    key === "paper" ||
    key === "papel" ||
    key === "black" ||
    key === "preto" ||
    key === "registration" ||
    key === "registro" ||
    key === "cmyk" ||
    key === "rgb"
  ) {
    return true;
  }
  return false;
}

function readColorValues(fill: Color | Swatch | null | undefined): number[] {
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

function readSpaceLabel(fill: Color | Swatch | null | undefined): string {
  try {
    const space = (fill as Color | null)?.space;
    if (space != null) return getImageColorSpaceLabel(space);
  } catch {
    // ignore
  }
  return "";
}

function fillToRgb(fill: Color | Swatch | null | undefined): Rgb | null {
  if (!fill) return null;
  const values = readColorValues(fill);
  if (!values.length) return null;
  const space = readSpaceLabel(fill);

  if (space === "RGB" && values.length >= 3) {
    const scale = values[0] > 1.5 || values[1] > 1.5 || values[2] > 1.5 ? 255 : 1;
    return [
      Math.min(1, Math.max(0, values[0] / scale)),
      Math.min(1, Math.max(0, values[1] / scale)),
      Math.min(1, Math.max(0, values[2] / scale)),
    ];
  }

  if (values.length >= 4) return cmykToRgb(values);
  if (values.length >= 3 && space !== "LAB") {
    const scale = values[0] > 1.5 || values[1] > 1.5 || values[2] > 1.5 ? 255 : 1;
    return [
      Math.min(1, Math.max(0, values[0] / scale)),
      Math.min(1, Math.max(0, values[1] / scale)),
      Math.min(1, Math.max(0, values[2] / scale)),
    ];
  }
  return null;
}

function pushRgb(bucket: Rgb[], rgb: Rgb | null): void {
  if (!rgb) return;
  if (rgbDist(rgb, [1, 1, 1]) < 0.08) return;
  if (rgbDist(rgb, [0, 0, 0]) < 0.08) return;
  bucket.push(rgb);
}

function collectSwatchColors(doc: Document, bucket: Rgb[]): void {
  let count = 0;
  forEachCollectionItem<Color>(doc.colors, (color) => {
    if (count >= MAX_SWATCHES || !color?.isValid) return;
    let name = "";
    try {
      name = color.name || "";
    } catch {
      name = "";
    }
    if (skipSwatchName(name) && !isCorProfColorName(name)) return;
    pushRgb(bucket, fillToRgb(color));
    count += 1;
  });
}

function collectItemFill(item: PageItem, bucket: Rgb[]): void {
  try {
    const layer = item.itemLayer;
    if (layer?.isValid && isPluginUtilityLayerName(layer.name || "")) return;
  } catch {
    // ignore
  }
  try {
    pushRgb(bucket, fillToRgb(item.fillColor as Color | Swatch));
  } catch {
    // ignore
  }
  try {
    pushRgb(bucket, fillToRgb(item.strokeColor as Color | Swatch));
  } catch {
    // ignore
  }
}

function collectPageColors(page: Page | null, bucket: Rgb[]): void {
  if (!page?.isValid || bucket.length >= MAX_PAGE_SAMPLES) return;
  let seen = 0;
  forEachCollectionItem<PageItem>(page.pageItems, (item) => {
    if (!item?.isValid || seen >= MAX_ITEMS_PER_PAGE || bucket.length >= MAX_PAGE_SAMPLES) return;
    collectItemFill(item, bucket);
    seen += 1;
  });
}

function minDistToOccupied(rgb: Rgb, occupied: Rgb[]): number {
  if (!occupied.length) return 1;
  let min = Infinity;
  for (const other of occupied) {
    const d = rgbDist(rgb, other);
    if (d < min) min = d;
  }
  return min;
}

function pickBest(candidates: number[][], occupied: Rgb[], avoid: Rgb | null): number[] {
  let best = candidates[0] || FALLBACK_PARA;
  let bestScore = -1;
  for (const cmyk of candidates) {
    const rgb = cmykToRgb(cmyk);
    let score = minDistToOccupied(rgb, occupied);
    if (avoid) score = Math.min(score, rgbDist(rgb, avoid) * 1.15);
    if (score > bestScore) {
      bestScore = score;
      best = cmyk;
    }
  }
  return best;
}

export function pickTagOverlayColors(doc: Document): TagOverlayPair {
  const occupied: Rgb[] = [];
  occupied.push(cmykToRgb([0, 100, 0, 0]));
  occupied.push(cmykToRgb([15, 100, 0, 0]));

  const corProf = findCorProfColor(doc);
  if (corProf?.color) pushRgb(occupied, fillToRgb(corProf.color));

  collectSwatchColors(doc, occupied);

  const pageCount = getCollectionLength(doc.pages);
  const step = Math.max(1, Math.floor(pageCount / MAX_PAGES));
  for (let i = 0; i < pageCount && occupied.length < MAX_PAGE_SAMPLES; i += step) {
    collectPageColors(getCollectionItem<Page>(doc.pages, i), occupied);
  }

  const para = pickBest(CANDIDATES, occupied, null);
  const char = pickBest(
    CANDIDATES.filter((cmyk) => cmyk !== para),
    occupied,
    cmykToRgb(para)
  );

  if (rgbDist(cmykToRgb(para), cmykToRgb(char)) < 0.28) {
    return { para: FALLBACK_PARA.slice(), char: FALLBACK_CHAR.slice() };
  }

  return { para: para.slice(), char: char.slice() };
}

import type { Color, Document, Swatch } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
import { findCorProfColor, isCorProfColorName, normalizeColorName } from "./editorial-color";
import { getImageColorSpaceLabel } from "./color-model";

export interface TagOverlayPair {
  para: number[];
  char: number[];
}

type Rgb = [number, number, number];

const FALLBACK_PARA = [0, 28, 52, 0];
const FALLBACK_CHAR = [52, 18, 0, 0];

/** Fundos claros, sem magenta/rosa (CorProf). Texto das tags é sempre preto. */
const CANDIDATES: number[][] = [
  [0, 28, 52, 0],
  [52, 18, 0, 0],
  [0, 12, 90, 0],
  [0, 48, 85, 0],
  [50, 0, 30, 0],
  [70, 8, 0, 0],
  [0, 0, 85, 0],
];

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

function isMagentaFamily(cmyk: number[]): boolean {
  const c = Number(cmyk[0]) || 0;
  const m = Number(cmyk[1]) || 0;
  const y = Number(cmyk[2]) || 0;
  const k = Number(cmyk[3]) || 0;
  return m >= 40 && c <= 35 && y <= 48 && k < 25;
}

function fillToRgb(fill: Color | Swatch | null | undefined): Rgb | null {
  if (!fill) return null;
  try {
    const values = (fill as Color).colorValue;
    if (!Array.isArray(values) || !values.length) return null;
    const nums = values.map((item) => Number(item)).filter((value) => Number.isFinite(value));
    if (nums.length >= 4) return cmykToRgb(nums);
    if (nums.length >= 3) {
      const space = getImageColorSpaceLabel((fill as Color).space);
      if (space === "RGB" || nums.length === 3) {
        const scale = nums[0] > 1.5 || nums[1] > 1.5 || nums[2] > 1.5 ? 255 : 1;
        return [
          Math.min(1, Math.max(0, nums[0] / scale)),
          Math.min(1, Math.max(0, nums[1] / scale)),
          Math.min(1, Math.max(0, nums[2] / scale)),
        ];
      }
    }
  } catch {
    // ignore
  }
  return null;
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
    if (isMagentaFamily(cmyk)) continue;
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
  const occupied: Rgb[] = [cmykToRgb([0, 100, 0, 0]), cmykToRgb([15, 100, 0, 0])];
  const corProf = findCorProfColor(doc);
  if (corProf?.color) {
    const rgb = fillToRgb(corProf.color);
    if (rgb) occupied.push(rgb);
  }

  let count = 0;
  forEachCollectionItem<Color>(doc.colors, (color) => {
    if (count >= 40 || !color?.isValid) return;
    let name = "";
    try {
      name = color.name || "";
    } catch {
      name = "";
    }
    if (!name || name.startsWith("EAC_")) return;
    const key = normalizeColorName(name).replace(/^\[|\]$/g, "");
    if (key === "none" || key === "paper" || key === "papel" || key === "black" || key === "preto") return;
    if (!isCorProfColorName(name) && (key === "nenhum" || key === "nenhuma")) return;
    const rgb = fillToRgb(color);
    if (rgb) occupied.push(rgb);
    count += 1;
  });

  const para = pickBest(CANDIDATES, occupied, null);
  const char = pickBest(
    CANDIDATES.filter((cmyk) => cmyk !== para),
    occupied,
    cmykToRgb(para)
  );

  if (isMagentaFamily(para) || isMagentaFamily(char) || rgbDist(cmykToRgb(para), cmykToRgb(char)) < 0.22) {
    return { para: FALLBACK_PARA.slice(), char: FALLBACK_CHAR.slice() };
  }

  return { para: para.slice(), char: char.slice() };
}

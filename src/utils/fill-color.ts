import type { Color, PageItem, Swatch } from "indesign";
import { getCollectionItem, getCollectionLength, forEachCollectionItem } from "./collection-helpers";
import { getImageColorSpaceLabel, swatchNameOf } from "./color-model";

const VALUE_EPS = 1.25;
/** Preto sólido de impressão. 80% preto é cinza e precisa de overprint sobre cor. */
export const SOLID_PRINT_BLACK_TINT = 90;

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

function unwrapNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const inner = (value as { value?: unknown }).value;
    if (typeof inner === "number" && Number.isFinite(inner)) return inner;
  }
  return null;
}

function unwrapBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value && typeof value === "object") {
    const inner = (value as { value?: unknown }).value;
    if (typeof inner === "boolean") return inner;
  }
  return null;
}

function normalizeTintPercent(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) return null;
  // UXP às vezes devolve 0–1 (1 = 100%). 1% real de tinta é irrelevante para este check.
  if (value > 0 && value <= 1) return value * 100;
  if (value > 100.5) return null;
  return value;
}

function readRawFillTint(target: { fillTint?: number; properties?: { fillTint?: number } } | null | undefined): number | null {
  if (!target) return null;
  const candidates: unknown[] = [];
  try {
    candidates.push(target.fillTint);
  } catch {
    // ignore
  }
  try {
    candidates.push(target.properties?.fillTint);
  } catch {
    // ignore
  }
  try {
    candidates.push((target as { tintValue?: number }).tintValue);
  } catch {
    // ignore
  }
  for (const candidate of candidates) {
    const tint = unwrapNumber(candidate);
    if (tint == null) continue;
    const normalized = normalizeTintPercent(tint);
    if (normalized != null) return normalized;
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

export function readLocalFillColor(target: {
  fillColor?: Swatch | Color | string;
  properties?: { fillColor?: Swatch | Color | string };
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
  return null;
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

function parseUnnamedColor(name: string): { space: string; values: number[] } | null {
  const cmyk = name.match(
    /C\s*=\s*([\d.,]+)\s*M\s*=\s*([\d.,]+)\s*Y\s*=\s*([\d.,]+)\s*K\s*=\s*([\d.,]+)/i
  );
  if (cmyk) {
    return {
      space: "CMYK",
      values: cmyk.slice(1, 5).map((item) => Number(String(item).replace(",", "."))),
    };
  }
  const rgb = name.match(/R\s*=\s*([\d.,]+)\s*G\s*=\s*([\d.,]+)\s*B\s*=\s*([\d.,]+)/i);
  if (rgb) {
    return {
      space: "RGB",
      values: rgb.slice(1, 4).map((item) => Number(String(item).replace(",", "."))),
    };
  }
  return null;
}

function toUnitScale(values: number[]): { scale: "percent" | "unit"; values: number[] } {
  const max = Math.max(...values.map((value) => Math.abs(value)));
  if (max <= 1.0001) {
    return { scale: "unit", values: values.map((value) => value * 100) };
  }
  return { scale: "percent", values };
}

/**
 * Cinza de impressão: Black com tint, K-only, CMY neutro (C≈M≈Y) ou RGB acromático.
 * C45 M45 Y0 K34 (cor de apoio) não é cinza — o croma entre canais é alto.
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
        const swatchTint = unwrapNumber((fill as { tintValue?: number }).tintValue);
        if (swatchTint != null) {
          const normalized = normalizeTintPercent(swatchTint);
          if (normalized != null) t = (t * normalized) / 100;
        }
      }
    } catch {
      // ignore
    }
  }
  if (t <= 0.5) return false;
  if (isSolidPrintBlack(fill, t)) return false;
  if (isChromaticFill(fill, t)) return false;

  if (isBlackKey(key)) {
    return t < SOLID_PRINT_BLACK_TINT;
  }
  if ((key.includes("black") || key.includes("preto")) && t < SOLID_PRINT_BLACK_TINT) {
    return true;
  }
  if ((key.includes("black") || key.includes("preto")) && /\d/.test(key) && !/(^|[^0-9])100([^0-9]|$)/.test(key)) {
    return true;
  }

  let values = typeof fill === "string" ? [] : readColorValues(fill);
  let space = typeof fill === "string" ? "" : readSpaceLabel(fill);
  const parsed = parseUnnamedColor(typeof fill === "string" ? fill : swatchNameOf(fill));
  if (parsed) {
    if (!values.length) values = parsed.values;
    if (!space) space = parsed.space;
  }
  if (!values.length) return isGrayNameKey(key);

  const scaled = toUnitScale(values);
  const channels = scaledChannels(scaled.values, t);

  if ((space === "CMYK" || (!space && channels.length >= 4)) && channels.length >= 4) {
    return isCmykPrintGray(channels[0], channels[1], channels[2], channels[3]);
  }

  if (space === "RGB" && channels.length >= 3) {
    const rgbScale = toRgb255(values, t);
    const chroma = Math.max(rgbScale[0], rgbScale[1], rgbScale[2]) - Math.min(rgbScale[0], rgbScale[1], rgbScale[2]);
    if (chroma > 12) return false;
    const tone = (rgbScale[0] + rgbScale[1] + rgbScale[2]) / 3;
    return tone > 18 && tone < 230;
  }

  if (space === "Gray" && channels.length >= 1) {
    const gray = channels[0];
    return gray > 8 && gray < 90;
  }

  return false;
}

/** Preto de impressão (K alto, [Preto], RGB quase 0). Não entra como cinza de arte. */
export function isSolidPrintBlack(fill: Swatch | Color | string | null | undefined, tint = 100): boolean {
  if (fill == null) return false;
  const key = fillNameKey(fill);
  if (isNoneKey(key) || isPaperKey(key)) return false;
  const t = tint < 0 ? 100 : tint;
  if (t < SOLID_PRINT_BLACK_TINT) return false;
  if (isBlackKey(key)) return true;
  if ((key.includes("black") || key.includes("preto")) && !/\d/.test(key)) return true;

  const channels = resolveCmykChannels(fill, t);
  if (channels && channels.length >= 4) {
    const chroma = cmykChroma(channels[0], channels[1], channels[2]);
    if (chroma <= 4 && channels[3] >= SOLID_PRINT_BLACK_TINT) return true;
  }

  const space = typeof fill === "string" ? "" : readSpaceLabel(fill);
  if (space === "RGB") {
    const values = typeof fill === "string" ? [] : readColorValues(fill);
    if (values.length >= 3) {
      const rgb = toRgb255(values, t);
      return rgb[0] <= 18 && rgb[1] <= 18 && rgb[2] <= 18;
    }
  }
  if (space === "Gray" && channels && channels.length >= 1) {
    return channels[0] <= 8;
  }
  return false;
}

function scaledChannels(values: number[], tint: number): number[] {
  return values.map((value) => scaleChannel(value, tint));
}

function toRgb255(values: number[], tint: number): number[] {
  const max = Math.max(...values.slice(0, 3).map((value) => Math.abs(value)));
  const raw = values.slice(0, 3).map((value) => scaleChannel(value, tint));
  if (max <= 1.0001) return raw.map((value) => value * 255);
  if (max <= 100.5) return raw.map((value) => (value / 100) * 255);
  return raw;
}

function isCmykPrintGray(c: number, m: number, y: number, k: number): boolean {
  const chroma = Math.max(c, m, y) - Math.min(c, m, y);
  if (chroma > 4) return false;
  const cmy = (c + m + y) / 3;
  if (cmy <= 4) return k > 0.5 && k < SOLID_PRINT_BLACK_TINT;
  return k < SOLID_PRINT_BLACK_TINT;
}

function cmykChroma(c: number, m: number, y: number): number {
  return Math.max(c, m, y) - Math.min(c, m, y);
}

function resolveCmykChannels(
  fill: Swatch | Color | string | null | undefined,
  tint: number
): number[] | null {
  let values = typeof fill === "string" ? [] : readColorValues(fill);
  let space = typeof fill === "string" ? "" : readSpaceLabel(fill);
  const parsed = parseUnnamedColor(typeof fill === "string" ? fill : swatchNameOf(fill));
  if (parsed) {
    if (!values.length) values = parsed.values;
    if (!space) space = parsed.space;
  }
  if (!values.length) return null;
  const t = tint < 0 ? 100 : tint;
  const scaled = toUnitScale(values);
  const channels = scaledChannels(scaled.values, t);
  return channels.length ? channels : null;
}

/** Cor com croma (não é cinza de impressão). C45 M45 Y0 K34 entra aqui. */
export function isChromaticFill(fill: Swatch | Color | string | null | undefined, tint = 100): boolean {
  if (fill == null) return false;
  const key = fillNameKey(fill);
  if (isNoneKey(key) || isPaperKey(key)) return false;

  const channels = resolveCmykChannels(fill, tint);
  if (!channels) return false;
  const space = typeof fill === "string" ? "" : readSpaceLabel(fill);

  if (channels.length >= 4 && (space === "CMYK" || space === "Desconhecido" || !space)) {
    return cmykChroma(channels[0], channels[1], channels[2]) > 4;
  }
  if (space === "RGB" || (channels.length === 3 && space !== "Gray")) {
    const values = typeof fill === "string" ? [] : readColorValues(fill);
    if (values.length >= 3) {
      const rgbScale = toRgb255(values, tint < 0 ? 100 : tint);
      return Math.max(rgbScale[0], rgbScale[1], rgbScale[2]) - Math.min(rgbScale[0], rgbScale[1], rgbScale[2]) > 12;
    }
  }
  return false;
}

export function fillsLookSame(
  a: Swatch | Color | string | null | undefined,
  b: Swatch | Color | string | null | undefined
): boolean {
  if (a == null || b == null) return false;
  const ka = fillNameKey(a);
  const kb = fillNameKey(b);
  if (ka && kb && ka === kb) return true;
  const va = typeof a === "string" ? [] : readColorValues(a);
  const vb = typeof b === "string" ? [] : readColorValues(b);
  if (va.length >= 3 && va.length === vb.length) {
    const na = toUnitScale(va).values;
    const nb = toUnitScale(vb).values;
    return na.every((value, index) => approx(value, nb[index], 1.5));
  }
  return false;
}

export function isColoredBackgroundFill(fill: Swatch | Color | string | null | undefined, tint = 100): boolean {
  if (isNoneOrPaperFill(fill)) return false;
  if (isWhiteFill(fill, tint)) return false;
  if (isGrayFill(fill, tint)) return false;
  return isChromaticFill(fill, tint);
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

  const candidates: unknown[] = [];
  try {
    candidates.push(target.overprintFill);
  } catch {
    // ignore
  }
  try {
    candidates.push(target.fillOverprint);
  } catch {
    // ignore
  }
  try {
    candidates.push(target.properties?.overprintFill);
  } catch {
    // ignore
  }
  try {
    candidates.push(target.properties?.fillOverprint);
  } catch {
    // ignore
  }

  return candidates.some((value) => unwrapBoolean(value) === true);
}

export function readItemFill(item: PageItem): Swatch | Color | null {
  try {
    return item.fillColor || null;
  } catch {
    return null;
  }
}

export function isTextFrameItem(item: PageItem | null | undefined): boolean {
  if (!item) return false;
  try {
    return /textframe/i.test(item.constructor?.name || "");
  } catch {
    return false;
  }
}

/**
 * O UXP costuma copiar a cor do primeiro texto para o preenchimento da caixa.
 * Isso não é fundo colorido (ex.: título APOIO_GERAL_3 em caixa com fundo papel).
 */
export function textFrameFillLeaksFromContents(item: PageItem): boolean {
  if (!isTextFrameItem(item)) return false;
  const frameFill = readItemFill(item);
  if (!frameFill || !isColoredBackgroundFill(frameFill, readFillTint(item))) return false;

  const matchesFrame = (fill: Swatch | Color | string | null | undefined): boolean =>
    Boolean(fill) && fillsLookSame(frameFill, fill);

  try {
    const chars = (item as PageItem & { characters?: unknown }).characters;
    const length = getCollectionLength(chars);
    const last = Math.min(length, 48);
    for (let i = 0; i < last; i++) {
      const character = getCollectionItem<{ fillColor?: Swatch | Color }>(chars, i);
      if (!character) continue;
      if (matchesFrame(readLocalFillColor(character))) return true;
    }
  } catch {
    // ignore
  }

  try {
    const ranges = (item as PageItem & { textStyleRanges?: unknown }).textStyleRanges;
    const length = Math.min(getCollectionLength(ranges), 24);
    for (let i = 0; i < length; i++) {
      const run = getCollectionItem<{ fillColor?: Swatch | Color }>(ranges, i);
      if (!run) continue;
      if (matchesFrame(readLocalFillColor(run))) return true;
    }
  } catch {
    // ignore
  }

  return false;
}

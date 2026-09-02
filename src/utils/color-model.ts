import type { Color, PageItem, ParagraphStyle } from "indesign";
import { getInDesignModule } from "./indesign-runtime";

const COLOR_MODEL_SPOT = 1936748404;
const COLOR_MODEL_PROCESS = 1685089399;
const IMAGE_SPACE_CMYK = 1129142603;
const IMAGE_SPACE_RGB = 1666336578;
const IMAGE_SPACE_GRAY = 1197755634;
const IMAGE_SPACE_LAB = 1281450528;

function enumValue(source: unknown, keys: string[]): number | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

function labelOf(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function isSpotColor(color: Color): boolean {
  try {
    const model = color.model as unknown;
    const { ColorModel } = getInDesignModule() as {
      ColorModel?: { SPOT?: number; spot?: number };
    };
    const spot = enumValue(ColorModel, ["SPOT", "spot"]);
    if (spot != null && model === spot) return true;
    if (model === COLOR_MODEL_SPOT) return true;
    const label = labelOf(model);
    return label === "spot" || label === "spotcolor";
  } catch {
    return false;
  }
}

export function isProcessColorModel(color: Color): boolean {
  try {
    const model = color.model as unknown;
    const { ColorModel } = getInDesignModule() as {
      ColorModel?: { PROCESS?: number; process?: number };
    };
    const process = enumValue(ColorModel, ["PROCESS", "process"]);
    if (process != null && model === process) return true;
    if (model === COLOR_MODEL_PROCESS) return true;
    const label = labelOf(model);
    return label === "process" || label === "processcolor";
  } catch {
    return false;
  }
}

export function readColorOverprintFill(color: Color): boolean | null {
  try {
    const value = color.overprintFill;
    if (typeof value === "boolean") return value;
  } catch {
    // Color.overprintFill não existe no DOM clássico do InDesign
  }
  return null;
}

export function getImageColorSpaceLabel(space: unknown): string {
  if (space == null) return "Desconhecido";

  try {
    const { ImageColorSpace, ColorSpace } = getInDesignModule() as {
      ImageColorSpace?: { CMYK?: number; RGB?: number; LAB?: number; GRAY?: number };
      ColorSpace?: { CMYK?: number; RGB?: number; LAB?: number; HSB?: number };
    };

    const icsCmyk = enumValue(ImageColorSpace, ["CMYK", "cmyk"]);
    const icsRgb = enumValue(ImageColorSpace, ["RGB", "rgb"]);
    const icsLab = enumValue(ImageColorSpace, ["LAB", "lab"]);
    const icsGray = enumValue(ImageColorSpace, ["GRAY", "gray"]);
    const csCmyk = enumValue(ColorSpace, ["CMYK", "cmyk"]);
    const csRgb = enumValue(ColorSpace, ["RGB", "rgb"]);
    const csLab = enumValue(ColorSpace, ["LAB", "lab"]);
    const csHsb = enumValue(ColorSpace, ["HSB", "hsb"]);

    if (space === icsCmyk || space === csCmyk || space === IMAGE_SPACE_CMYK) return "CMYK";
    if (space === icsRgb || space === csRgb || space === IMAGE_SPACE_RGB) return "RGB";
    if (space === icsLab || space === csLab || space === IMAGE_SPACE_LAB) return "LAB";
    if (space === icsGray || space === IMAGE_SPACE_GRAY) return "Gray";
    if (space === csHsb) return "HSB";
  } catch {
    // fallback por rótulo
  }

  const label = labelOf(space);
  if (label.includes("cmyk")) return "CMYK";
  if (label.includes("rgb")) return "RGB";
  if (label.includes("lab")) return "LAB";
  if (label.includes("gray") || label.includes("grey")) return "Gray";
  if (label.includes("hsb")) return "HSB";
  return "Desconhecido";
}

export function itemHasFillOverprint(item: PageItem): boolean {
  try {
    if (item.fillOverprint === true) return true;
  } catch {
    // ignore
  }
  try {
    if ((item as PageItem & { overprintFill?: boolean }).overprintFill === true) return true;
  } catch {
    // ignore
  }
  return false;
}

export function itemHasStrokeOverprint(item: PageItem): boolean {
  try {
    if (item.strokeOverprint === true) return true;
  } catch {
    // ignore
  }
  try {
    if ((item as PageItem & { overprintStroke?: boolean }).overprintStroke === true) return true;
  } catch {
    // ignore
  }
  return false;
}

export function styleHasOverprintFill(style: ParagraphStyle): boolean {
  try {
    return style.overprintFill === true;
  } catch {
    return false;
  }
}

export function swatchNameOf(value: { name?: string; isValid?: boolean } | null | undefined): string {
  try {
    if (value && value.isValid !== false) return value.name || "";
  } catch {
    // ignore
  }
  return "";
}

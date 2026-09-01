import type { Color, Document, Layer, Page, PageItem, ParagraphStyle, Swatch, Text } from "indesign";
import { LAYER_RENDIMENTO } from "../utils/constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import {
  findRendimentoLayer,
  isEditorialLayerName,
  isRendimentoLayerName,
} from "../utils/editorial-layer";
import { getActiveDocument, getInDesignModule } from "../utils/indesign-runtime";
import { yieldToHost } from "../utils/yield-to-host";

const TAG_LABEL = "eac-rendimento-tag";
const STYLE_NAME = "EAC_RendimentoLabel";
const COLOR_FILL = "EAC_RENDIMENTO_FILL";
const TAG_HEIGHT = 18;
const TAG_INSET_X = 6;
const TAG_MARGIN = 10;

export interface RendimentoTagsResult {
  layerName: string;
  pages: number;
}

function isTextFrameItem(item: PageItem): boolean {
  try {
    return /textframe/i.test(item.constructor?.name || "");
  } catch {
    return false;
  }
}

function isOnSkipLayer(item: PageItem): boolean {
  try {
    const layer = item.itemLayer;
    if (!layer?.isValid) return false;
    const name = layer.name || "";
    return isEditorialLayerName(name) || isRendimentoLayerName(name);
  } catch {
    return false;
  }
}

function isOwnTag(item: PageItem): boolean {
  try {
    if (item.label === TAG_LABEL) return true;
    if ((item.name || "").startsWith("EAC_REND_")) return true;
  } catch {
    // ignore
  }
  return false;
}

function countFrameCharacters(frame: PageItem): number {
  try {
    const chars = (frame as { characters?: unknown }).characters;
    if (chars) return getCollectionLength(chars);
  } catch {
    // fallback
  }
  try {
    return String((frame as { contents?: unknown }).contents || "").length;
  } catch {
    return 0;
  }
}

function countPageCharacters(page: Page): number {
  let total = 0;
  forEachCollectionItem<PageItem>(page.allPageItems, (item) => {
    if (!item?.isValid) return;
    if (!isTextFrameItem(item)) return;
    if (isOwnTag(item) || isOnSkipLayer(item)) return;
    total += countFrameCharacters(item);
  });
  return total;
}

async function withPointUnitsAsync<T>(doc: Document, fn: () => Promise<T>): Promise<T> {
  const { MeasurementUnits } = getInDesignModule() as {
    MeasurementUnits?: { POINTS?: number };
  };
  const points = MeasurementUnits?.POINTS;
  const prefs = doc.viewPreferences;
  if (!prefs || points == null) return fn();

  const previousH = prefs.horizontalMeasurementUnits;
  const previousV = prefs.verticalMeasurementUnits;
  try {
    prefs.horizontalMeasurementUnits = points;
    prefs.verticalMeasurementUnits = points;
    return await fn();
  } finally {
    try {
      prefs.horizontalMeasurementUnits = previousH;
      prefs.verticalMeasurementUnits = previousV;
    } catch {
      // ignore
    }
  }
}

function swatchByName(doc: Document, names: string[]): Swatch | Color | null {
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

function colorByName(doc: Document, name: string): Color | null {
  try {
    const color = doc.colors.itemByName(name);
    return color?.isValid ? color : null;
  } catch {
    return null;
  }
}

function ensureProcessColor(doc: Document, name: string, cmyk: number[]): void {
  const { ColorModel, ColorSpace } = getInDesignModule() as {
    ColorModel?: { PROCESS?: number };
    ColorSpace?: { CMYK?: number };
  };
  if (ColorModel?.PROCESS == null || ColorSpace?.CMYK == null) return;

  let exists = false;
  try {
    exists = Boolean(doc.colors.itemByName(name)?.isValid);
  } catch {
    exists = false;
  }
  if (exists) return;

  try {
    doc.colors.add({
      name,
      model: ColorModel.PROCESS,
      space: ColorSpace.CMYK,
      colorValue: cmyk,
    });
  } catch {
    // ignore
  }
}

function unlockLayer(layer: Layer): void {
  try {
    layer.visible = true;
    layer.locked = false;
  } catch {
    // ignore
  }
}

function layerByExactName(doc: Document, name: string): Layer | null {
  try {
    const layer = doc.layers.itemByName(name);
    return layer?.isValid ? layer : null;
  } catch {
    return null;
  }
}

function activateLayerByIndex(doc: Document, name: string): void {
  const length = getCollectionLength(doc.layers);
  for (let i = 0; i < length; i++) {
    const layer = getCollectionItem<Layer>(doc.layers, i);
    if (!layer?.isValid || layer.name !== name) continue;
    try {
      layer.visible = true;
      layer.locked = false;
    } catch {
      // ignore
    }
    try {
      doc.activeLayer = doc.layers.item(i);
    } catch {
      // ignore
    }
    return;
  }
}

function ensureRendimentoLayer(doc: Document): string {
  const target = LAYER_RENDIMENTO;
  const exact = layerByExactName(doc, target);
  if (exact) {
    unlockLayer(exact);
    activateLayerByIndex(doc, target);
    return target;
  }

  const existing = findRendimentoLayer(doc);
  if (existing?.isValid) {
    unlockLayer(existing);
    try {
      existing.name = target;
      activateLayerByIndex(doc, target);
      return target;
    } catch {
      activateLayerByIndex(doc, existing.name);
      return existing.name;
    }
  }

  try {
    doc.layers.add({ name: target });
  } catch {
    // pode já existir
  }
  activateLayerByIndex(doc, target);
  return target;
}

function collectTagItems(collection: unknown, doomed: PageItem[]): void {
  forEachCollectionItem<PageItem>(collection, (item) => {
    if (!item?.isValid) return;
    if (isOwnTag(item)) doomed.push(item);
  });
}

function deletePreviousTags(doc: Document): void {
  const doomed: PageItem[] = [];

  const collectFromSpreads = (spreads: unknown): void => {
    forEachCollectionItem<{ pageItems?: unknown; allPageItems?: unknown; pages?: unknown; isValid?: boolean }>(
      spreads,
      (spread) => {
        if (!spread?.isValid) return;
        collectTagItems(spread.allPageItems, doomed);
        collectTagItems(spread.pageItems, doomed);
        forEachCollectionItem<Page>(spread.pages, (page) => {
          if (!page?.isValid) return;
          collectTagItems(page.allPageItems, doomed);
          collectTagItems(page.pageItems, doomed);
        });
      }
    );
  };

  collectFromSpreads(doc.spreads);

  const rendimento = findRendimentoLayer(doc);
  if (rendimento?.isValid) {
    unlockLayer(rendimento);
    collectTagItems(rendimento.pageItems, doomed);
  }

  for (let i = doomed.length - 1; i >= 0; i--) {
    const item = doomed[i];
    try {
      const layer = item.itemLayer;
      if (layer?.isValid) layer.locked = false;
    } catch {
      // ignore
    }
    try {
      item.remove?.();
    } catch {
      // ignore
    }
  }
}

function ensureTagParagraphStyle(doc: Document): ParagraphStyle | null {
  try {
    const existing = doc.paragraphStyles.itemByName(STYLE_NAME);
    if (existing?.isValid) return existing;
  } catch {
    // cria abaixo
  }
  try {
    return doc.paragraphStyles.add({ name: STYLE_NAME });
  } catch {
    return null;
  }
}

function applyCalibriBold(target: { appliedFont?: unknown; fontStyle?: string }): void {
  try {
    (target as { appliedFont: string }).appliedFont = "Calibri";
  } catch {
    // ignore
  }
  try {
    target.fontStyle = "Bold";
  } catch {
    // ignore
  }
}

function styleTagParagraph(style: ParagraphStyle, paper: Swatch | Color | null): void {
  applyCalibriBold(style);
  try {
    style.pointSize = 13;
  } catch {
    // ignore
  }
  try {
    style.leading = 14;
  } catch {
    // ignore
  }
  try {
    style.hyphenation = false;
  } catch {
    // ignore
  }
  const { Justification } = getInDesignModule() as { Justification?: { CENTER_ALIGN?: number } };
  if (Justification?.CENTER_ALIGN != null) {
    try {
      style.justification = Justification.CENTER_ALIGN;
    } catch {
      // ignore
    }
  }
  if (paper) {
    try {
      style.fillColor = paper;
    } catch {
      // ignore
    }
  }
}

function applyNoStroke(item: PageItem, none: Swatch | Color | null): void {
  try {
    item.strokeWeight = 0;
  } catch {
    // ignore
  }
  if (!none) return;
  try {
    item.strokeColor = none;
  } catch {
    // ignore
  }
}

function applyPillCorners(item: PageItem): void {
  const { CornerOptions } = getInDesignModule() as { CornerOptions?: { ROUNDED_CORNER?: number } };
  const rounded = CornerOptions?.ROUNDED_CORNER;
  if (rounded == null) return;
  const radius = TAG_HEIGHT / 2;
  try {
    item.topLeftCornerOption = rounded;
    item.topRightCornerOption = rounded;
    item.bottomLeftCornerOption = rounded;
    item.bottomRightCornerOption = rounded;
    item.topLeftCornerRadius = radius;
    item.topRightCornerRadius = radius;
    item.bottomLeftCornerRadius = radius;
    item.bottomRightCornerRadius = radius;
  } catch {
    // ignore
  }
}

function assignItemLayer(item: PageItem, layer: Layer | null): void {
  if (!layer?.isValid) return;
  try {
    item.itemLayer = layer;
  } catch {
    // ignore
  }
}

function lockTagText(
  frame: PageItem,
  paraStyle: ParagraphStyle | null,
  paper: Swatch | Color | null
): void {
  const text = getCollectionItem<Text>(frame.texts, 0);
  if (!text) return;

  if (paraStyle) {
    try {
      text.appliedParagraphStyle = paraStyle;
    } catch {
      // ignore
    }
  }
  try {
    text.hyphenation = false;
  } catch {
    // ignore
  }
  try {
    text.noBreak = true;
  } catch {
    // ignore
  }
  applyCalibriBold(text);
  try {
    text.pointSize = 13;
  } catch {
    // ignore
  }
  try {
    (text as Text & { leading?: number }).leading = 14;
  } catch {
    // ignore
  }
  if (paper) {
    try {
      text.fillColor = paper;
    } catch {
      // ignore
    }
  }
}

function estimateTagWidth(value: string): number {
  const digits = Math.max(1, value.length);
  return TAG_INSET_X * 2 + digits * 8 + 4;
}

function placeTag(
  page: Page,
  count: number,
  fill: Color | Swatch | null,
  none: Swatch | Color | null,
  paper: Swatch | Color | null,
  paraStyle: ParagraphStyle | null,
  layer: Layer | null
): void {
  const bounds = page.bounds;
  if (!bounds || bounds.length < 4) return;

  const label = String(count);
  const width = estimateTagWidth(label);
  const top = bounds[0] + TAG_MARGIN;
  const right = bounds[3] - TAG_MARGIN;
  const left = right - width;
  const bottom = top + TAG_HEIGHT;

  const frame = page.textFrames?.add();
  if (!frame?.isValid) return;

  frame.geometricBounds = [top, left, bottom, right];
  frame.label = TAG_LABEL;
  frame.name = `EAC_REND_${page.name || "p"}`.slice(0, 80);
  if (fill) {
    try {
      frame.fillColor = fill;
    } catch {
      // ignore
    }
  }
  applyNoStroke(frame, none);
  applyPillCorners(frame);
  assignItemLayer(frame, layer);
  try {
    if (frame.textFramePreferences) {
      const prefs = frame.textFramePreferences as typeof frame.textFramePreferences & {
        verticalJustification?: number;
      };
      prefs.insetSpacing = [1.5, TAG_INSET_X, 1.5, TAG_INSET_X];
      const { VerticalJustification } = getInDesignModule() as {
        VerticalJustification?: { CENTER_ALIGN?: number };
      };
      if (VerticalJustification?.CENTER_ALIGN != null) {
        prefs.verticalJustification = VerticalJustification.CENTER_ALIGN;
      }
    }
  } catch {
    // ignore
  }
  frame.contents = label;
  lockTagText(frame, paraStyle, paper);
}

export async function createRendimentoTags(
  onProgress?: (percent: number, label: string) => void
): Promise<RendimentoTagsResult> {
  const doc = getActiveDocument();

  return withPointUnitsAsync(doc, async () => {
    onProgress?.(15, "Preparando layer RENDIMENTO…");
    await yieldToHost(20);

    const layerName = ensureRendimentoLayer(doc);
    const layer = layerByExactName(doc, layerName) || findRendimentoLayer(doc);
    deletePreviousTags(doc);
    ensureProcessColor(doc, COLOR_FILL, [0, 0, 0, 100]);
    const fill = colorByName(doc, COLOR_FILL) || swatchByName(doc, ["Black", "Preto"]);
    const none = swatchByName(doc, ["None", "Nenhum", "Nenhuma"]);
    const paper = swatchByName(doc, ["Paper", "Papel"]);
    const paraStyle = ensureTagParagraphStyle(doc);
    if (paraStyle) styleTagParagraph(paraStyle, paper);

    onProgress?.(40, "Contando caracteres…");
    await yieldToHost(20);

    const pageCount = getCollectionLength(doc.pages);
    let created = 0;

    for (let i = 0; i < pageCount; i++) {
      const page = getCollectionItem<Page>(doc.pages, i);
      if (!page?.isValid) continue;
      const count = countPageCharacters(page);
      placeTag(page, count, fill, none, paper, paraStyle, layer);
      created += 1;

      if ((i + 1) % 4 === 0 || i === pageCount - 1) {
        const percent = 40 + Math.round(((i + 1) / Math.max(1, pageCount)) * 55);
        onProgress?.(percent, `Criando tags… ${i + 1}/${pageCount}`);
        await yieldToHost(12);
      }
    }

    return { layerName, pages: created };
  });
}

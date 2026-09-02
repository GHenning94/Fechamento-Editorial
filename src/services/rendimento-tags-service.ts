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
const TAG_HEIGHT = 28;
const TAG_INSET_X = 10;
const TAG_POINT_SIZE = 15;
const TAG_LEADING = 16;
const TAG_MARGIN = 12;

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

function normalizeKey(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function isPaginationName(value: string): boolean {
  const key = normalizeKey(value);
  if (!key) return false;
  return /pagin|folio|page\s*num|num(ero)?\s*(da\s*)?pag/.test(key);
}

function isRodabracoName(value: string): boolean {
  const key = normalizeKey(value);
  if (!key) return false;
  return /rodabrac|roda\s*brac|canhoto|lombada|running\s*(head|title)/.test(key);
}

function readRotation(item: PageItem): number {
  const typed = item as PageItem & { absoluteRotationAngle?: number; rotationAngle?: number };
  let raw = 0;
  try {
    raw = Number(typed.absoluteRotationAngle);
  } catch {
    raw = 0;
  }
  if (!Number.isFinite(raw) || raw === 0) {
    try {
      raw = Number(typed.rotationAngle);
    } catch {
      raw = 0;
    }
  }
  if (!Number.isFinite(raw)) return 0;
  let angle = Math.abs(raw) % 180;
  if (angle > 90) angle = 180 - angle;
  return angle;
}

function isVerticallyRotated(item: PageItem): boolean {
  return Math.abs(readRotation(item) - 90) <= 25;
}

function isOnSideMargin(item: PageItem, page: Page): boolean {
  try {
    const geo = item.geometricBounds;
    const bounds = page.bounds;
    if (!geo || geo.length < 4 || !bounds || bounds.length < 4) return false;
    const pageW = Math.abs(bounds[3] - bounds[1]);
    const strip = Math.max(36, pageW * 0.14);
    const centerX = (geo[1] + geo[3]) / 2;
    return Math.abs(centerX - bounds[1]) < strip || Math.abs(bounds[3] - centerX) < strip;
  } catch {
    return false;
  }
}

function isNarrowVerticalFrame(item: PageItem): boolean {
  try {
    const geo = item.geometricBounds;
    if (!geo || geo.length < 4) return false;
    const width = Math.abs(geo[3] - geo[1]);
    const height = Math.abs(geo[2] - geo[0]);
    return height > width * 1.4 && width < 56;
  } catch {
    return false;
  }
}

function isRodabracoFrame(item: PageItem, page: Page): boolean {
  try {
    if (isRodabracoName(item.name || "")) return true;
  } catch {
    // ignore
  }
  try {
    if (isRodabracoName(item.itemLayer?.name || "")) return true;
  } catch {
    // ignore
  }
  try {
    const paras = (item as PageItem & { paragraphs?: unknown }).paragraphs;
    const para = getCollectionItem<{ appliedParagraphStyle?: { name?: string } }>(paras, 0);
    if (isRodabracoName(para?.appliedParagraphStyle?.name || "")) return true;
  } catch {
    // ignore
  }
  if (isVerticallyRotated(item) && isOnSideMargin(item, page)) return true;
  if (isOnSideMargin(item, page) && isNarrowVerticalFrame(item)) return true;
  return false;
}

function isIgnoredContentFrame(item: PageItem, page: Page): boolean {
  return isPaginationFrame(item, page) || isRodabracoFrame(item, page);
}

function itemId(item: PageItem): string {
  try {
    const id = (item as PageItem & { id?: number }).id;
    if (typeof id === "number") return `id:${id}`;
  } catch {
    // ignore
  }
  try {
    const geo = item.geometricBounds;
    if (geo && geo.length >= 4) return `geo:${geo.map((n) => Number(n).toFixed(2)).join(",")}`;
  } catch {
    // ignore
  }
  return "";
}

function isVisibleItem(item: PageItem): boolean {
  try {
    if ((item as PageItem & { visible?: boolean }).visible === false) return false;
  } catch {
    // ignore
  }
  try {
    const layer = item.itemLayer;
    if (layer?.isValid && layer.visible === false) return false;
  } catch {
    // ignore
  }
  try {
    if ((item as PageItem & { nonprinting?: boolean }).nonprinting) return false;
  } catch {
    // ignore
  }
  return true;
}

function boundsOverlap(a: number[], b: number[]): boolean {
  if (!a || a.length < 4 || !b || b.length < 4) return true;
  const ay1 = Math.min(a[0], a[2]);
  const ay2 = Math.max(a[0], a[2]);
  const ax1 = Math.min(a[1], a[3]);
  const ax2 = Math.max(a[1], a[3]);
  const by1 = Math.min(b[0], b[2]);
  const by2 = Math.max(b[0], b[2]);
  const bx1 = Math.min(b[1], b[3]);
  const bx2 = Math.max(b[1], b[3]);
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

function isOnPageArea(item: PageItem, pageBounds: number[] | null): boolean {
  if (!pageBounds) return true;
  try {
    const geo = item.geometricBounds;
    if (!geo || geo.length < 4) return true;
    return boundsOverlap(geo, pageBounds);
  } catch {
    return true;
  }
}

let cachedPageNumberSpecials: Set<unknown> | null = null;

function pageNumberSpecials(): Set<unknown> {
  if (cachedPageNumberSpecials) return cachedPageNumberSpecials;
  const { SpecialCharacters } = getInDesignModule() as {
    SpecialCharacters?: {
      AUTO_PAGE_NUMBER?: unknown;
      NEXT_PAGE_NUMBER?: unknown;
      PREVIOUS_PAGE_NUMBER?: unknown;
      SECTION_MARKER?: unknown;
    };
  };
  cachedPageNumberSpecials = new Set(
    [
      SpecialCharacters?.AUTO_PAGE_NUMBER,
      SpecialCharacters?.NEXT_PAGE_NUMBER,
      SpecialCharacters?.PREVIOUS_PAGE_NUMBER,
      SpecialCharacters?.SECTION_MARKER,
    ].filter((value) => value != null)
  );
  return cachedPageNumberSpecials;
}

function isPaginationFrame(item: PageItem, page: Page): boolean {
  try {
    if (isPaginationName(item.name || "")) return true;
  } catch {
    // ignore
  }
  try {
    if (isPaginationName(item.itemLayer?.name || "")) return true;
  } catch {
    // ignore
  }
  try {
    const paras = (item as PageItem & { paragraphs?: unknown }).paragraphs;
    const para = getCollectionItem<{ appliedParagraphStyle?: { name?: string } }>(paras, 0);
    if (isPaginationName(para?.appliedParagraphStyle?.name || "")) return true;
  } catch {
    // ignore
  }

  let raw = "";
  try {
    raw = String((item as { contents?: unknown }).contents || "").replace(/\s+/g, "");
  } catch {
    raw = "";
  }
  if (!raw) return false;

  const pageName = String(page.name || "").replace(/\s+/g, "");
  if (pageName && raw === pageName) return true;
  try {
    const offset = (page as Page & { documentOffset?: number }).documentOffset;
    if (typeof offset === "number" && raw === String(offset + 1)) return true;
  } catch {
    // ignore
  }
  return false;
}

function isCountableCharacter(ch: { contents?: unknown; appliedParagraphStyle?: { name?: string } }): boolean {
  const specials = pageNumberSpecials();
  const contents = ch?.contents;
  if (contents == null) return false;
  if (specials.has(contents)) return false;
  try {
    if (isPaginationName(ch.appliedParagraphStyle?.name || "")) return false;
  } catch {
    // ignore
  }
  if (typeof contents === "string") {
    if (!contents || contents === "\r" || contents === "\n" || contents === "\u0003" || contents === "\u0007") {
      return false;
    }
  }
  return true;
}

function countFrameCharacters(frame: PageItem, page: Page): number {
  if (isPaginationFrame(frame, page)) return 0;

  try {
    const lines = (frame as PageItem & { lines?: unknown }).lines;
    const lineCount = getCollectionLength(lines);
    if (lineCount > 0) {
      let total = 0;
      forEachCollectionItem<{ characters?: unknown }>(lines, (line) => {
        forEachCollectionItem<{ contents?: unknown; appliedParagraphStyle?: { name?: string } }>(
          line.characters,
          (ch) => {
            if (isCountableCharacter(ch)) total += 1;
          }
        );
      });
      return total;
    }
  } catch {
    // fallback
  }

  try {
    const chars = (frame as { characters?: unknown }).characters;
    if (chars) {
      let total = 0;
      forEachCollectionItem<{ contents?: unknown; appliedParagraphStyle?: { name?: string } }>(chars, (ch) => {
        if (isCountableCharacter(ch)) total += 1;
      });
      return total;
    }
  } catch {
    // fallback
  }

  try {
    const raw = String((frame as { contents?: unknown }).contents || "");
    return raw.replace(/[\r\n\u0003]/g, "").length;
  } catch {
    return 0;
  }
}

function isUsableMaster(master: { isValid?: boolean } | null | undefined): boolean {
  if (!master) return false;
  try {
    if ((master as { isValid?: boolean }).isValid === false) return false;
  } catch {
    return false;
  }
  try {
    const name = String(master);
    if (/nothing/i.test(name)) return false;
  } catch {
    // ignore
  }
  return true;
}

function matchingMasterPage(page: Page): Page | null {
  let master: { pages?: unknown; isValid?: boolean } | null = null;
  try {
    master = (page as Page & { appliedMaster?: { pages?: unknown; isValid?: boolean } }).appliedMaster || null;
  } catch {
    return null;
  }
  if (!master) return null;
  if (!isUsableMaster(master)) return null;
  const masterSpread = master;

  const length = getCollectionLength(masterSpread.pages);
  if (length <= 0) return null;
  if (length === 1) return getCollectionItem<Page>(masterSpread.pages, 0);

  let matched: Page | null = null;
  try {
    const side = (page as Page & { side?: unknown }).side;
    forEachCollectionItem<Page>(masterSpread.pages, (masterPage) => {
      if (matched || !masterPage?.isValid) return;
      try {
        if (side != null && (masterPage as Page & { side?: unknown }).side === side) {
          matched = masterPage;
        }
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
  if (matched) return matched;

  try {
    const parent = (page as Page & { parent?: { pages?: unknown } }).parent;
    let found = -1;
    forEachCollectionItem<Page>(parent?.pages, (spreadPage, index) => {
      if (found >= 0 || !spreadPage?.isValid) return;
      try {
        if (
          (spreadPage as Page & { id?: number }).id === (page as Page & { id?: number }).id
        ) {
          found = index;
        }
      } catch {
        // ignore
      }
    });
    if (found >= 0 && found < length) {
      return getCollectionItem<Page>(masterSpread.pages, found);
    }
  } catch {
    // ignore
  }

  return null;
}

function collectTextFrames(page: Page): PageItem[] {
  const frames: PageItem[] = [];
  const seen = new Set<string>();
  const pageBounds = page.bounds || null;

  const addFrom = (collection: unknown): void => {
    forEachCollectionItem<PageItem>(collection, (item) => {
      if (!item?.isValid) return;
      if (!isTextFrameItem(item)) return;
      if (isOwnTag(item) || isOnSkipLayer(item)) return;
      if (isIgnoredContentFrame(item, page)) return;
      if (!isVisibleItem(item)) return;
      if (!isOnPageArea(item, pageBounds)) return;
      const keys: string[] = [];
      const id = itemId(item);
      if (id) keys.push(id);
      try {
        const geo = item.geometricBounds;
        if (geo && geo.length >= 4) {
          keys.push(`geo:${geo.map((n) => Number(n).toFixed(1)).join(",")}`);
        }
      } catch {
        // ignore
      }
      if (keys.length > 0 && keys.some((key) => seen.has(key))) return;
      keys.forEach((key) => seen.add(key));
      frames.push(item);
    });
  };

  addFrom(page.allPageItems);
  addFrom(page.pageItems);

  try {
    const masterItems = (page as Page & { masterPageItems?: unknown }).masterPageItems;
    addFrom(masterItems);
  } catch {
    // ignore
  }

  const masterPage = matchingMasterPage(page);
  if (masterPage?.isValid) {
    addFrom(masterPage.allPageItems);
    addFrom(masterPage.pageItems);
  }

  return frames;
}

function countPageCharacters(page: Page): number {
  let total = 0;
  for (const frame of collectTextFrames(page)) {
    total += countFrameCharacters(frame, page);
  }
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
    style.pointSize = TAG_POINT_SIZE;
  } catch {
    // ignore
  }
  try {
    style.leading = TAG_LEADING;
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
    text.pointSize = TAG_POINT_SIZE;
  } catch {
    // ignore
  }
  try {
    (text as Text & { leading?: number }).leading = TAG_LEADING;
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
  return TAG_INSET_X * 2 + digits * 10 + 8;
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
  const centerX = (bounds[1] + bounds[3]) / 2;
  const top = bounds[0] + TAG_MARGIN;
  const bottom = top + TAG_HEIGHT;
  const left = centerX - width / 2;
  const right = centerX + width / 2;

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
      if (count <= 0) continue;
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

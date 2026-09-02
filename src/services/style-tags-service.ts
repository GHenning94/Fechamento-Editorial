import type { CharacterStyle, Color, Document, Layer, Page, PageItem, ParagraphStyle, Story, Swatch, Text } from "indesign";
import { ACCEPTED_LANGUAGES, LAYER_MEMORIAL_DESCRITIVO } from "../utils/constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import {
  bringPluginTagLayersToFront,
  findEditorialLayer,
  isEditorialLayerName,
  isRendimentoLayerName,
} from "../utils/editorial-layer";
import { ensurePluginInk, ensureProcessTagColor, findDocumentBlack, findSwatchByName } from "../utils/editorial-color";
import { pickTagOverlayColors } from "../utils/tag-overlay-colors";
import { getActiveDocument, getInDesignApp, getInDesignModule, clearInDesignSelection } from "../utils/indesign-runtime";
import { findNoneCharacterStyle, findNoParagraphStyle } from "../utils/text-style-context";
import { yieldToHost } from "../utils/yield-to-host";
import { throwIfAborted } from "../core/checklist-runner";

const TAG_LABEL = "eac-style-tag";
const COLOR_PARA = "EAC_TAG_PARAGRAFO";
const COLOR_CHAR = "EAC_TAG_CARACTERE";
const TAG_HEIGHT = 18;
const TAG_PADDING_X = 8;
const TAG_PAGE_INSET = 2;
const TAG_BATCH = 6;

export interface StyleTagsResult {
  layerName: string;
  paragraph: number;
  character: number;
  total: number;
}

type StyleKind = "paragraph" | "character";

interface StyleHit {
  name: string;
  kind: StyleKind;
  pageIndex: number;
  pageName: string;
  pageKey: string;
  onMaster: boolean;
  x: number;
  y: number;
}

function isIgnoredStyleName(name: string, kind: StyleKind): boolean {
  const value = (name || "").trim();
  if (!value) return true;
  if (value.startsWith("[")) return true;
  if (value.startsWith("EAC_")) return true;
  if (kind === "character") {
    const key = value.toLocaleLowerCase();
    if (key === "none" || key === "nenhum" || key === "normal") return true;
  }
  return false;
}

function isTagRelated(item: { label?: string; name?: string; parent?: unknown } | null): boolean {
  if (!item) return false;
  try {
    if (item.label === TAG_LABEL) return true;
    if ((item.name || "").startsWith("EAC_TAG_")) return true;
  } catch {
    // ignore
  }
  try {
    const parent = item.parent as { label?: string; name?: string } | undefined;
    if (parent?.label === TAG_LABEL) return true;
    if ((parent?.name || "").startsWith("EAC_TAG_")) return true;
  } catch {
    // ignore
  }
  return false;
}

function isOnEditorialLayer(item: { itemLayer?: { isValid?: boolean; name?: string } } | null): boolean {
  try {
    const layer = item?.itemLayer;
    return Boolean(layer?.isValid && isEditorialLayerName(layer.name || ""));
  } catch {
    return false;
  }
}

function isOnRendimentoLayer(item: { itemLayer?: { isValid?: boolean; name?: string } } | null): boolean {
  try {
    const layer = item?.itemLayer;
    return Boolean(layer?.isValid && isRendimentoLayerName(layer.name || ""));
  } catch {
    return false;
  }
}

function shouldSkipStyleTagSource(item: { itemLayer?: { isValid?: boolean; name?: string } } | null): boolean {
  return isOnEditorialLayer(item) || isOnRendimentoLayer(item);
}

function isMasterPage(page: Page | null): boolean {
  if (!page?.isValid) return false;
  try {
    const parent = page.parent as { constructor?: { name?: string } } | undefined;
    return /master/i.test(parent?.constructor?.name || "");
  } catch {
    return false;
  }
}

function pageKeyOf(page: Page, onMaster: boolean, pageIndex: number, pageName: string): string {
  return onMaster ? `m:${pageName || page.name || pageIndex}` : `d:${pageIndex}`;
}

function getPageIndex(page: Page): number {
  try {
    if (typeof page.documentOffset === "number") return page.documentOffset;
  } catch {
    // ignore
  }
  return 0;
}

function getAnchorFromText(text: Text | null): Omit<StyleHit, "name" | "kind"> | null {
  if (!text) return null;

  try {
    const chars = text.characters;
    if (!chars || getCollectionLength(chars) < 1) return null;
    const character = getCollectionItem<Text>(chars, 0);
    if (!character) return null;

    const frames = character.parentTextFrames as
      | { item?: (i: number) => PageItem; length?: number }
      | PageItem[]
      | undefined;
    let frame: PageItem | null = null;
    if (Array.isArray(frames) && frames[0]) {
      frame = frames[0];
    } else if (frames) {
      frame = getCollectionItem<PageItem>(frames, 0);
    }
    if (!frame?.isValid || shouldSkipStyleTagSource(frame) || isTagRelated(frame)) return null;

    const page = frame.parentPage;
    if (!page || typeof page === "number" || !page.isValid) {
      return null;
    }

    const x = Number(character.horizontalOffset);
    const y = Number(character.baseline);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const onMaster = isMasterPage(page);
    const pageIndex = getPageIndex(page);
    const pageName = page.name || "";
    return {
      pageIndex,
      pageName,
      pageKey: pageKeyOf(page, onMaster, pageIndex, pageName),
      onMaster,
      x,
      y,
    };
  } catch {
    return null;
  }
}

function considerHit(hits: Map<string, StyleHit>, name: string, kind: StyleKind, source: Text | null): void {
  if (isIgnoredStyleName(name, kind)) return;
  const key = `${kind}:${name}`;
  if (hits.has(key)) return;
  const anchor = getAnchorFromText(source);
  if (!anchor) return;
  hits.set(key, { name, kind, ...anchor });
}

function scanParagraphs(collection: unknown, hits: Map<string, StyleHit>): void {
  forEachCollectionItem<Text>(collection, (paragraph) => {
    if (!paragraph?.isValid) return;
    try {
      const style = paragraph.appliedParagraphStyle as ParagraphStyle | undefined;
      if (!style?.isValid) return;
      considerHit(hits, style.name, "paragraph", paragraph);
    } catch {
      // ignore
    }
  });
}

function scanCharacterRanges(collection: unknown, hits: Map<string, StyleHit>): void {
  forEachCollectionItem<Text>(collection, (range) => {
    if (!range?.isValid) return;
    try {
      const style = range.appliedCharacterStyle as CharacterStyle | undefined;
      if (!style?.isValid) return;
      considerHit(hits, style.name, "character", range);
    } catch {
      // ignore
    }
  });
}

function scanTextFrameStory(frame: PageItem, hits: Map<string, StyleHit>): void {
  if (!frame?.isValid || shouldSkipStyleTagSource(frame) || isTagRelated(frame)) return;
  try {
    const story = frame.parentStory;
    if (!story?.isValid) return;
    scanParagraphs(story.paragraphs, hits);
    scanCharacterRanges(story.textStyleRanges, hits);
  } catch {
    // ignore
  }
}

function scanSpreadPages(spreads: unknown, hits: Map<string, StyleHit>): void {
  forEachCollectionItem<{ pages?: unknown; isValid?: boolean }>(spreads, (spread) => {
    if (!spread?.isValid) return;
    forEachCollectionItem<Page>(spread.pages, (page) => {
      if (!page?.isValid) return;
      forEachCollectionItem<PageItem>(page.allPageItems || page.pageItems, (item) => {
        if (!item?.isValid) return;
        try {
          if (item.parentStory) scanTextFrameStory(item, hits);
        } catch {
          // ignore
        }
      });
    });
  });
}

function scanStories(doc: Document): StyleHit[] {
  const hits = new Map<string, StyleHit>();
  scanSpreadPages(doc.masterSpreads, hits);
  scanSpreadPages(doc.spreads, hits);
  forEachCollectionItem<Story>(doc.stories, (story) => {
    if (!story?.isValid) return;
    scanParagraphs(story.paragraphs, hits);
    scanCharacterRanges(story.textStyleRanges, hits);
  });
  return Array.from(hits.values());
}

function estimateTagWidth(name: string): number {
  return Math.max(48, name.length * 8.4 + TAG_PADDING_X * 2 + 8);
}

function readPageBounds(page: Page): number[] | null {
  try {
    const bounds = page.bounds;
    if (!bounds || bounds.length < 4) return null;
    const top = Number(bounds[0]);
    const left = Number(bounds[1]);
    const bottom = Number(bounds[2]);
    const right = Number(bounds[3]);
    if (![top, left, bottom, right].every(Number.isFinite)) return null;
    if (right - left < 8 || bottom - top < 8) return null;
    return [top, left, bottom, right];
  } catch {
    return null;
  }
}

function clampTagBounds(rect: number[], pageBounds: number[] | null): number[] {
  const [top, left, bottom, right] = rect;
  if (!pageBounds || pageBounds.length < 4) {
    return [top, left, bottom, right];
  }

  const pTop = pageBounds[0] + TAG_PAGE_INSET;
  const pLeft = pageBounds[1] + TAG_PAGE_INSET;
  const pBottom = pageBounds[2] - TAG_PAGE_INSET;
  const pRight = pageBounds[3] - TAG_PAGE_INSET;
  const maxW = Math.max(12, pRight - pLeft);
  const maxH = Math.max(TAG_HEIGHT, pBottom - pTop);

  let width = Math.min(Math.max(12, right - left), maxW);
  let height = Math.min(Math.max(TAG_HEIGHT, bottom - top), maxH);
  let nextLeft = left;
  let nextRight = left + width;
  let nextTop = top;
  let nextBottom = top + height;

  if (nextRight > pRight) {
    nextLeft = pRight - width;
    nextRight = pRight;
  }
  if (nextLeft < pLeft) {
    nextLeft = pLeft;
    nextRight = Math.min(pRight, nextLeft + width);
  }

  if (nextBottom > pBottom) {
    nextTop = pBottom - height;
    nextBottom = pBottom;
  }
  if (nextTop < pTop) {
    nextTop = pTop;
    nextBottom = Math.min(pBottom, nextTop + height);
  }

  return [nextTop, nextLeft, nextBottom, nextRight];
}

function preferredTagRect(hit: StyleHit, y: number, pageBounds: number[] | null): number[] {
  const width = estimateTagWidth(hit.name);
  const left = hit.x + 2;
  return clampTagBounds([y - TAG_HEIGHT + 3, left, y + 4, left + width], pageBounds);
}

function rectsOverlap(a: number[], b: number[]): boolean {
  return !(a[3] < b[1] || a[1] > b[3] || a[2] < b[0] || a[0] > b[2]);
}

function layoutTagRect(
  hit: StyleHit,
  placed: Array<{ pageKey: string; bounds: number[] }>,
  pageBounds: number[] | null
): number[] {
  let y = hit.y;
  for (let guard = 0; guard < 12; guard++) {
    const candidate = preferredTagRect(hit, y, pageBounds);
    const collides = placed.some(
      (item) => item.pageKey === hit.pageKey && rectsOverlap(candidate, item.bounds)
    );
    if (!collides) return candidate;
    y += TAG_HEIGHT + 2;
  }
  return preferredTagRect(hit, y, pageBounds);
}

function clampFrameToPage(frame: PageItem, pageBounds: number[] | null): void {
  if (!pageBounds) return;
  try {
    const bounds = frame.geometricBounds;
    if (!bounds || bounds.length < 4) return;
    const current = [Number(bounds[0]), Number(bounds[1]), Number(bounds[2]), Number(bounds[3])];
    const clamped = clampTagBounds(current, pageBounds);
    if (clamped.some((value, index) => Math.abs(value - current[index]) > 0.2)) {
      frame.geometricBounds = clamped;
    }
  } catch {
    // ignore
  }
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

function colorByName(doc: Document, name: string): Color | null {
  try {
    const color = doc.colors.itemByName(name);
    return color?.isValid ? color : null;
  } catch {
    return null;
  }
}

function applyNoneObjectStyle(doc: Document, item: PageItem): void {
  const styles = (
    doc as Document & {
      objectStyles?: { itemByName?: (name: string) => { isValid?: boolean } };
    }
  ).objectStyles;
  if (typeof styles?.itemByName !== "function") return;

  for (const name of ["[None]", "[Nenhum]", "[Normal]", "None"]) {
    try {
      const style = styles.itemByName(name);
      if (style && style.isValid !== false) {
        (item as PageItem & { appliedObjectStyle?: unknown }).appliedObjectStyle = style;
        return;
      }
    } catch {
      // tenta o próximo
    }
  }
}

function forceOpaqueNormal(item: PageItem): void {
  try {
    const blending = (
      item as {
        transparencySettings?: { blendingSettings?: { blendMode?: number; opacity?: number } };
      }
    ).transparencySettings?.blendingSettings;
    if (!blending) return;
    const { BlendMode } = getInDesignModule() as { BlendMode?: { NORMAL?: number } };
    if (BlendMode?.NORMAL != null) blending.blendMode = BlendMode.NORMAL;
    blending.opacity = 100;
  } catch {
    // ignore
  }
}

function applySolidFill(item: PageItem, fill: Color | Swatch | null): void {
  if (!fill) return;
  try {
    item.fillColor = fill;
  } catch {
    // ignore
  }
  try {
    item.fillTint = 100;
  } catch {
    // ignore
  }
  try {
    item.fillOverprint = false;
  } catch {
    // ignore
  }
  try {
    (item as PageItem & { overprintFill?: boolean }).overprintFill = false;
  } catch {
    // ignore
  }
}

function ensureTagParagraphStyle(doc: Document): ParagraphStyle | null {
  try {
    const existing = doc.paragraphStyles.itemByName("EAC_TagLabel");
    if (existing?.isValid) return existing;
  } catch {
    // cria abaixo
  }

  try {
    return doc.paragraphStyles.add({ name: "EAC_TagLabel" });
  } catch {
    return null;
  }
}

function removeStyleCollection(collection: unknown): void {
  if (!collection) return;
  try {
    const every = (collection as { everyItem?: () => { remove?: () => void } }).everyItem;
    if (typeof every === "function") {
      every.call(collection).remove?.();
      return;
    }
  } catch {
    // fallback por índice
  }
  const length = getCollectionLength(collection);
  for (let i = length - 1; i >= 0; i--) {
    try {
      getCollectionItem<{ remove?: () => void }>(collection, i)?.remove?.();
    } catch {
      // ignore
    }
  }
}

function detachTagParagraphStyle(doc: Document, style: ParagraphStyle): void {
  const base = findNoParagraphStyle(doc);
  if (base) {
    try {
      style.basedOn = base;
      return;
    } catch {
      // ignore
    }
  }
  try {
    (style as ParagraphStyle & { basedOn?: string }).basedOn = "[No Paragraph Style]";
  } catch {
    // ignore
  }
}

function applyCalibriRegular(target: { appliedFont?: unknown; fontStyle?: string }): void {
  try {
    (target as { appliedFont: string }).appliedFont = "Calibri";
  } catch {
    // ignore
  }
  try {
    target.fontStyle = "Regular";
  } catch {
    // ignore
  }
}

function styleTagParagraph(
  doc: Document,
  style: ParagraphStyle,
  textColor: Swatch | Color | null,
  none: Swatch | Color | null
): void {
  detachTagParagraphStyle(doc, style);
  const nested = style as ParagraphStyle & {
    nestedGrepStyles?: unknown;
    nestedStyles?: unknown;
    nestedLineStyles?: unknown;
    underline?: boolean;
    strikeThru?: boolean;
    ruleAboveLineWeight?: number;
    ruleBelowLineWeight?: number;
    paragraphShadingOn?: boolean;
    paragraphBorderOn?: boolean;
  };
  removeStyleCollection(nested.nestedGrepStyles);
  removeStyleCollection(nested.nestedStyles);
  removeStyleCollection(nested.nestedLineStyles);
  try {
    nested.underline = false;
  } catch {
    // ignore
  }
  try {
    nested.strikeThru = false;
  } catch {
    // ignore
  }
  try {
    nested.ruleAboveLineWeight = 0;
  } catch {
    // ignore
  }
  try {
    nested.ruleBelowLineWeight = 0;
  } catch {
    // ignore
  }
  try {
    nested.paragraphShadingOn = false;
  } catch {
    // ignore
  }
  try {
    nested.paragraphBorderOn = false;
  } catch {
    // ignore
  }
  applyCalibriRegular(style);
  try {
    (style as ParagraphStyle & { pointSize?: number }).pointSize = 12;
  } catch {
    // ignore
  }
  if (textColor) {
    try {
      (style as ParagraphStyle & { fillColor?: Swatch | Color }).fillColor = textColor;
    } catch {
      // ignore
    }
  }
  try {
    (style as ParagraphStyle & { fillTint?: number }).fillTint = 100;
  } catch {
    // ignore
  }
  try {
    (style as ParagraphStyle & { fillOverprint?: boolean }).fillOverprint = false;
  } catch {
    // ignore
  }
  try {
    (style as ParagraphStyle & { strokeWeight?: number }).strokeWeight = 0;
  } catch {
    // ignore
  }
  if (none) {
    try {
      (style as ParagraphStyle & { strokeColor?: Swatch | Color }).strokeColor = none;
    } catch {
      // ignore
    }
  }
  try {
    (style as ParagraphStyle & { strokeOverprint?: boolean }).strokeOverprint = false;
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
      (style as ParagraphStyle & { justification?: number }).justification = Justification.CENTER_ALIGN;
    } catch {
      // ignore
    }
  }
  applyBrazilianPortuguese(style);
}

function languageNameLooksBrazilian(name: string): boolean {
  const key = (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return key.includes("portugu") && key.includes("brasil");
}

function applyBrazilianPortuguese(style: ParagraphStyle): void {
  const names = [
    ...ACCEPTED_LANGUAGES,
    "Portuguese: Brazilian: 2009 Reforms",
    "Português: Brasileiro: Reformas de 2009",
  ];

  try {
    const langs = getInDesignApp().languagesWithVendors;
    if (!langs) return;

    for (const name of names) {
      try {
        const lang = langs.itemByName(name);
        if (lang && (lang.isValid === undefined || lang.isValid)) {
          style.appliedLanguage = lang;
          return;
        }
      } catch {
        // tenta o próximo nome
      }
    }

    forEachCollectionItem<{ name?: string; isValid?: boolean }>(langs, (lang) => {
      if (!lang || (lang.isValid === false)) return;
      if (languageNameLooksBrazilian(lang.name || "")) {
        try {
          style.appliedLanguage = lang as ParagraphStyle["appliedLanguage"];
        } catch {
          // ignore
        }
      }
    });
  } catch {
    // idioma indisponível neste host
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

function ensureMemorialLayer(doc: Document): string {
  const target = LAYER_MEMORIAL_DESCRITIVO;
  const exact = layerByExactName(doc, target);
  if (exact) {
    unlockLayer(exact);
    activateLayerByIndex(doc, target);
    return target;
  }

  const existing = findEditorialLayer(doc);
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
      // UXP às vezes recusa o proxy Layer — tags ainda recebem label
    }
    return;
  }
}

function isDirectTag(item: PageItem): boolean {
  try {
    if (item.label === TAG_LABEL) return true;
    if ((item.name || "").startsWith("EAC_TAG_")) return true;
  } catch {
    // ignore
  }
  return false;
}

function groupContainsTag(item: PageItem): boolean {
  try {
    const children = item.pageItems;
    if (!children) return false;
    let found = false;
    forEachCollectionItem<PageItem>(children, (child) => {
      if (found || !child?.isValid) return;
      if (isDirectTag(child) || groupContainsTag(child)) found = true;
    });
    return found;
  } catch {
    return false;
  }
}

function collectTagItems(collection: unknown, doomed: PageItem[]): void {
  forEachCollectionItem<PageItem>(collection, (item) => {
    if (!item?.isValid) return;
    if (isDirectTag(item) || groupContainsTag(item)) doomed.push(item);
  });
}

function unlockForRemoval(item: PageItem): void {
  try {
    const layer = item.itemLayer;
    if (layer?.isValid) layer.locked = false;
  } catch {
    // ignore
  }
  try {
    (item as PageItem & { locked?: boolean }).locked = false;
  } catch {
    // ignore
  }
}

function deletePreviousTags(doc: Document): void {
  const doomed: PageItem[] = [];

  const collectFromSpreads = (spreads: unknown): void => {
    forEachCollectionItem<{
      pageItems?: unknown;
      allPageItems?: unknown;
      pages?: unknown;
      isValid?: boolean;
    }>(spreads, (spread) => {
      if (!spread?.isValid) return;
      collectTagItems(spread.allPageItems, doomed);
      collectTagItems(spread.pageItems, doomed);
      forEachCollectionItem<Page>(spread.pages, (page) => {
        if (!page?.isValid) return;
        collectTagItems(page.allPageItems, doomed);
        collectTagItems(page.pageItems, doomed);
        collectTagItems(page.polygons, doomed);
      });
    });
  };

  collectFromSpreads(doc.masterSpreads);
  collectFromSpreads(doc.spreads);

  const editorial = findEditorialLayer(doc);
  if (editorial?.isValid) {
    try {
      editorial.visible = true;
      editorial.locked = false;
    } catch {
      // ignore
    }
    collectTagItems(editorial.pageItems, doomed);
  }

  for (let i = doomed.length - 1; i >= 0; i--) {
    const item = doomed[i];
    unlockForRemoval(item);
    try {
      item.remove?.();
    } catch {
      // ignore
    }
  }
}

function resolveMasterPage(doc: Document, hit: StyleHit): Page | null {
  let found: Page | null = null;
  forEachCollectionItem<{ pages?: unknown; isValid?: boolean }>(doc.masterSpreads, (spread) => {
    if (found || !spread?.isValid) return;
    forEachCollectionItem<Page>(spread.pages, (page) => {
      if (found || !page?.isValid) return;
      if (hit.pageName && page.name === hit.pageName) {
        found = page;
      }
    });
  });
  return found;
}

function resolvePage(doc: Document, hit: StyleHit): Page | null {
  if (hit.onMaster) {
    const masterPage = resolveMasterPage(doc, hit);
    if (masterPage?.isValid) return masterPage;
  }
  try {
    if (hit.pageName) {
      const named = doc.pages.itemByName?.(hit.pageName);
      if (named?.isValid) return named;
    }
  } catch {
    // ignore
  }
  try {
    const page = getCollectionItem<Page>(doc.pages, hit.pageIndex);
    if (page?.isValid) return page;
  } catch {
    // ignore
  }
  return null;
}

function applyNoStroke(item: PageItem, none: Swatch | Color | null): void {
  try {
    item.strokeWeight = 0;
  } catch {
    // ignore
  }
  try {
    (item as PageItem & { strokeTint?: number }).strokeTint = 0;
  } catch {
    // ignore
  }
  if (none) {
    try {
      item.strokeColor = none;
    } catch {
      // ignore
    }
    try {
      (item as PageItem & { gapColor?: Swatch | Color }).gapColor = none;
    } catch {
      // ignore
    }
  }
  try {
    item.strokeOverprint = false;
  } catch {
    // ignore
  }
}

function applyRoundedCorners(item: PageItem): void {
  const { CornerOptions } = getInDesignModule() as { CornerOptions?: { ROUNDED_CORNER?: number } };
  const rounded = CornerOptions?.ROUNDED_CORNER;
  if (rounded == null) return;
  try {
    item.topLeftCornerOption = rounded;
    item.topRightCornerOption = rounded;
    item.bottomLeftCornerOption = rounded;
    item.bottomRightCornerOption = rounded;
    item.topLeftCornerRadius = 3;
    item.topRightCornerRadius = 3;
    item.bottomLeftCornerRadius = 3;
    item.bottomRightCornerRadius = 3;
  } catch {
    // ignore
  }
}

function lockTagText(
  frame: PageItem,
  paraStyle: ParagraphStyle | null,
  textColor: Swatch | Color | null,
  none: Swatch | Color | null,
  noneChar: CharacterStyle | null
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
  if (noneChar) {
    try {
      text.appliedCharacterStyle = noneChar;
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
  applyCalibriRegular(text);
  try {
    text.pointSize = 12;
  } catch {
    // ignore
  }
  if (textColor) {
    try {
      text.fillColor = textColor;
    } catch {
      // ignore
    }
  }
  try {
    (text as Text & { fillTint?: number }).fillTint = 100;
  } catch {
    // ignore
  }
  try {
    text.fillOverprint = false;
  } catch {
    // ignore
  }
  try {
    (text as Text & { strokeWeight?: number }).strokeWeight = 0;
  } catch {
    // ignore
  }
  if (none) {
    try {
      (text as Text & { strokeColor?: Swatch | Color }).strokeColor = none;
    } catch {
      // ignore
    }
  }
}

function fitTagFrame(frame: PageItem, pageBounds: number[] | null): void {
  const prefs = frame.textFramePreferences;
  const mod = getInDesignModule() as {
    AutoSizingTypeEnum?: { WIDTH_ONLY?: number; HEIGHT_AND_WIDTH?: number; OFF?: number };
    AutoSizingReferencePointEnum?: {
      LEFT_CENTER_POINT?: number;
      RIGHT_CENTER_POINT?: number;
      TOP_LEFT_POINT?: number;
      TOP_RIGHT_POINT?: number;
    };
  };

  let growFromRight = false;
  try {
    const bounds = frame.geometricBounds;
    if (pageBounds && bounds && bounds.length >= 4) {
      growFromRight = Number(bounds[3]) >= pageBounds[3] - TAG_PAGE_INSET - 0.5;
    }
  } catch {
    growFromRight = false;
  }

  try {
    if (prefs) {
      const widthOnly = mod.AutoSizingTypeEnum?.WIDTH_ONLY ?? mod.AutoSizingTypeEnum?.HEIGHT_AND_WIDTH;
      const anchor = growFromRight
        ? mod.AutoSizingReferencePointEnum?.RIGHT_CENTER_POINT ??
          mod.AutoSizingReferencePointEnum?.TOP_RIGHT_POINT ??
          mod.AutoSizingReferencePointEnum?.LEFT_CENTER_POINT
        : mod.AutoSizingReferencePointEnum?.LEFT_CENTER_POINT ?? mod.AutoSizingReferencePointEnum?.TOP_LEFT_POINT;
      if (anchor != null) prefs.autoSizingReferencePoint = anchor;
      if (widthOnly != null) prefs.autoSizingType = widthOnly;
    }
  } catch {
    // fallback abaixo
  }

  try {
    const pageLeft = pageBounds ? pageBounds[1] + TAG_PAGE_INSET : Number.NEGATIVE_INFINITY;
    const pageRight = pageBounds ? pageBounds[3] - TAG_PAGE_INSET : Number.POSITIVE_INFINITY;
    const pageBottom = pageBounds ? pageBounds[2] - TAG_PAGE_INSET : Number.POSITIVE_INFINITY;
    const pageTop = pageBounds ? pageBounds[0] + TAG_PAGE_INSET : Number.NEGATIVE_INFINITY;

    for (let i = 0; i < 30 && frame.overflows === true; i++) {
      const bounds = frame.geometricBounds;
      if (!bounds || bounds.length < 4) break;
      if (growFromRight && Number(bounds[1]) - 12 >= pageLeft) {
        bounds[1] = Number(bounds[1]) - 12;
      } else if (Number(bounds[3]) + 12 <= pageRight) {
        bounds[3] = Number(bounds[3]) + 12;
      } else if (Number(bounds[1]) - 12 >= pageLeft) {
        bounds[1] = Number(bounds[1]) - 12;
      } else {
        break;
      }
      frame.geometricBounds = bounds;
    }
    for (let i = 0; i < 8 && frame.overflows === true; i++) {
      const bounds = frame.geometricBounds;
      if (!bounds || bounds.length < 4) break;
      if (Number(bounds[2]) + 3 <= pageBottom) {
        bounds[2] = Number(bounds[2]) + 3;
      } else if (Number(bounds[0]) - 3 >= pageTop) {
        bounds[0] = Number(bounds[0]) - 3;
      } else {
        break;
      }
      frame.geometricBounds = bounds;
    }
  } catch {
    // ignore
  }

  try {
    const off = mod.AutoSizingTypeEnum?.OFF;
    if (prefs && off != null) prefs.autoSizingType = off;
  } catch {
    // ignore
  }

  clampFrameToPage(frame, pageBounds);
}

function assignItemLayer(item: PageItem, layer: Layer | null): void {
  if (!layer?.isValid) return;
  try {
    item.itemLayer = layer;
  } catch {
    // ignore
  }
  try {
    item.bringToFront?.();
  } catch {
    // ignore
  }
}

function placeTag(
  doc: Document,
  page: Page,
  hit: StyleHit,
  rect: number[],
  fill: Color | null,
  textColor: Swatch | Color | null,
  none: Swatch | Color | null,
  paraStyle: ParagraphStyle | null,
  noneChar: CharacterStyle | null,
  pageBounds: number[] | null,
  layer: Layer | null
): void {
  const frame = page.textFrames?.add();
  if (!frame?.isValid) return;

  frame.geometricBounds = rect;
  frame.label = TAG_LABEL;
  frame.name = `EAC_TAG_${hit.kind === "character" ? "C" : "P"}_${hit.name}`.slice(0, 80);
  applyNoneObjectStyle(doc, frame);
  if (paraStyle) {
    try {
      (frame as PageItem & { appliedParagraphStyle?: ParagraphStyle }).appliedParagraphStyle = paraStyle;
    } catch {
      // ignore
    }
  }
  assignItemLayer(frame, layer);
  applyNoStroke(frame, none);
  forceOpaqueNormal(frame);
  applyRoundedCorners(frame);
  try {
    if (frame.textFramePreferences) {
      frame.textFramePreferences.insetSpacing = [1.5, 4, 1.5, 4];
    }
  } catch {
    // ignore
  }
  frame.contents = hit.name;
  lockTagText(frame, paraStyle, textColor, none, noneChar);
  applySolidFill(frame, fill);
  applyNoStroke(frame, none);
  forceOpaqueNormal(frame);
  fitTagFrame(frame, pageBounds);
  applySolidFill(frame, fill);
  applyNoStroke(frame, none);
  assignItemLayer(frame, layer);
}

export async function createMemorialStyleTags(
  onProgress?: (percent: number, label: string) => void,
  signal?: AbortSignal
): Promise<StyleTagsResult> {
  const doc = getActiveDocument();

  return withPointUnitsAsync(doc, async () => {
    clearInDesignSelection();
    throwIfAborted(signal);
    onProgress?.(10, "Localizando estilos…");
    await yieldToHost(20);
    throwIfAborted(signal);

    const hits = scanStories(doc);
    if (!hits.length) {
      throw new Error("Nenhum estilo de parágrafo ou caractere em uso neste documento.");
    }

    onProgress?.(25, "Removendo tags anteriores…");
    await yieldToHost(20);
    throwIfAborted(signal);
    const layerName = ensureMemorialLayer(doc);
    bringPluginTagLayersToFront(doc);
    deletePreviousTags(doc);
    const palette = pickTagOverlayColors(doc);
    ensureProcessTagColor(doc, COLOR_PARA, palette.para);
    ensureProcessTagColor(doc, COLOR_CHAR, palette.char);
    const none = findSwatchByName(doc, ["None", "Nenhum", "Nenhuma", "[None]", "[Nenhum]", "$ID/None"]);
    const noneChar = findNoneCharacterStyle(doc);
    const ink = findDocumentBlack(doc);
    const paraFill = colorByName(doc, COLOR_PARA);
    const charFill = colorByName(doc, COLOR_CHAR);
    const paraStyle = ensureTagParagraphStyle(doc);
    if (paraStyle) styleTagParagraph(doc, paraStyle, ink, none);
    ensurePluginInk(doc);
    const layer = layerByExactName(doc, layerName) || findEditorialLayer(doc);

    onProgress?.(40, "Criando tags…");
    await yieldToHost(20);
    throwIfAborted(signal);

    const placed: Array<{ pageKey: string; bounds: number[] }> = [];
    let paragraph = 0;
    let character = 0;

    for (let i = 0; i < hits.length; i++) {
      throwIfAborted(signal);
      const hit = hits[i];
      const page = resolvePage(doc, hit);
      if (!page?.isValid) continue;

      const pageBounds = readPageBounds(page);
      const rect = layoutTagRect(hit, placed, pageBounds);
      placed.push({ pageKey: hit.pageKey, bounds: rect });

      placeTag(
        doc,
        page,
        hit,
        rect,
        hit.kind === "character" ? charFill : paraFill,
        ink,
        none,
        paraStyle,
        noneChar,
        pageBounds,
        layer
      );

      if (hit.kind === "character") character += 1;
      else paragraph += 1;

      if ((i + 1) % TAG_BATCH === 0) {
        const percent = 40 + Math.round(((i + 1) / hits.length) * 55);
        onProgress?.(percent, `Criando tags… ${i + 1}/${hits.length}`);
        await yieldToHost(40);
        throwIfAborted(signal);
      }
    }

    bringPluginTagLayersToFront(doc);

    return {
      layerName,
      paragraph,
      character,
      total: paragraph + character,
    };
  });
}

import type { CharacterStyle, Color, Document, Layer, Page, PageItem, ParagraphStyle, Story, Swatch, Text } from "indesign";
import { ACCEPTED_LANGUAGES, LAYER_MEMORIAL_DESCRITIVO } from "../utils/constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { findEditorialLayer, isEditorialLayerName, isRendimentoLayerName } from "../utils/editorial-layer";
import { getActiveDocument, getInDesignApp, getInDesignModule } from "../utils/indesign-runtime";
import { yieldToHost } from "../utils/yield-to-host";

const TAG_LABEL = "eac-style-tag";
const COLOR_PARA = "EAC_TAG_PARAGRAFO";
const COLOR_CHAR = "EAC_TAG_CARACTERE";
const PARA_CMYK = [0, 28, 52, 0];
const CHAR_CMYK = [52, 18, 0, 0];
const TAG_HEIGHT = 18;
const TAG_PADDING_X = 8;
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

function shiftIfCollision(hit: StyleHit, placed: Array<{ pageKey: string; bounds: number[] }>): number {
  let y = hit.y;
  for (let guard = 0; guard < 12; guard++) {
    const top = y - TAG_HEIGHT + 3;
    const bottom = y + 4;
    const left = hit.x + 2;
    const right = left + estimateTagWidth(hit.name);
    const collides = placed.some((item) => {
      if (item.pageKey !== hit.pageKey) return false;
      const [t, l, b, r] = item.bounds;
      return !(right < l || left > r || bottom < t || top > b);
    });
    if (!collides) return y;
    y += TAG_HEIGHT + 2;
  }
  return y;
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

function colorByName(doc: Document, name: string): Color | null {
  try {
    const color = doc.colors.itemByName(name);
    return color?.isValid ? color : null;
  } catch {
    return null;
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

function styleTagParagraph(style: ParagraphStyle, doc: Document): void {
  const ink = colorByName(doc, "EAC_TAG_INK") || swatchByName(doc, ["Black", "Preto"]);
  const none = swatchByName(doc, ["None", "Nenhum", "Nenhuma"]);
  try {
    style.appliedFont = "Minion Pro";
  } catch {
    // ignore
  }
  try {
    (style as ParagraphStyle & { fontStyle?: string }).fontStyle = "Medium";
  } catch {
    // ignore
  }
  try {
    (style as ParagraphStyle & { pointSize?: number }).pointSize = 12;
  } catch {
    // ignore
  }
  try {
    if (ink) (style as ParagraphStyle & { fillColor?: Swatch | Color }).fillColor = ink;
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
  if (!none) return;
  try {
    item.strokeColor = none;
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

function lockTagText(frame: PageItem, paraStyle: ParagraphStyle | null, doc: Document): void {
  const text = getCollectionItem<Text>(frame.texts, 0);
  if (!text) return;

  if (paraStyle) {
    try {
      text.appliedParagraphStyle = paraStyle;
    } catch {
      // ignore
    }
  }

  const noneChar =
    (() => {
      try {
        const style = doc.characterStyles.itemByName("[None]");
        if (style?.isValid) return style;
      } catch {
        // ignore
      }
      try {
        const style = doc.characterStyles.itemByName("[Nenhum]");
        if (style?.isValid) return style;
      } catch {
        // ignore
      }
      return null;
    })();
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
  try {
    text.appliedFont = "Minion Pro";
  } catch {
    // ignore
  }
  try {
    text.fontStyle = "Medium";
  } catch {
    // ignore
  }
  try {
    text.pointSize = 12;
  } catch {
    // ignore
  }
  const ink = colorByName(doc, "EAC_TAG_INK") || swatchByName(doc, ["Black", "Preto"]);
  if (ink) {
    try {
      text.fillColor = ink;
    } catch {
      // ignore
    }
  }
}

function fitTagFrame(frame: PageItem): void {
  const prefs = frame.textFramePreferences;
  const mod = getInDesignModule() as {
    AutoSizingTypeEnum?: { WIDTH_ONLY?: number; HEIGHT_AND_WIDTH?: number };
    AutoSizingReferencePointEnum?: { LEFT_CENTER_POINT?: number; TOP_LEFT_POINT?: number };
  };

  try {
    if (prefs) {
      const widthOnly = mod.AutoSizingTypeEnum?.WIDTH_ONLY ?? mod.AutoSizingTypeEnum?.HEIGHT_AND_WIDTH;
      const anchor = mod.AutoSizingReferencePointEnum?.LEFT_CENTER_POINT ?? mod.AutoSizingReferencePointEnum?.TOP_LEFT_POINT;
      if (anchor != null) prefs.autoSizingReferencePoint = anchor;
      if (widthOnly != null) prefs.autoSizingType = widthOnly;
    }
  } catch {
    // fallback abaixo
  }

  try {
    for (let i = 0; i < 30 && frame.overflows === true; i++) {
      const bounds = frame.geometricBounds;
      if (!bounds || bounds.length < 4) break;
      bounds[3] += 12;
      frame.geometricBounds = bounds;
    }
    for (let i = 0; i < 8 && frame.overflows === true; i++) {
      const bounds = frame.geometricBounds;
      if (!bounds || bounds.length < 4) break;
      bounds[2] += 3;
      frame.geometricBounds = bounds;
    }
  } catch {
    // ignore
  }
}

function placeTag(
  doc: Document,
  page: Page,
  hit: StyleHit,
  top: number,
  left: number,
  bottom: number,
  right: number,
  fill: Color | null,
  none: Swatch | Color | null,
  paraStyle: ParagraphStyle | null
): void {
  const frame = page.textFrames?.add();
  if (!frame?.isValid) return;

  frame.geometricBounds = [top, left, bottom, right];
  frame.label = TAG_LABEL;
  frame.name = `EAC_TAG_${hit.kind === "character" ? "C" : "P"}_${hit.name}`.slice(0, 80);
  if (fill) {
    try {
      frame.fillColor = fill;
    } catch {
      // ignore
    }
  }
  applyNoStroke(frame, none);
  applyRoundedCorners(frame);
  try {
    if (frame.textFramePreferences) {
      frame.textFramePreferences.insetSpacing = [1.5, 4, 1.5, 4];
    }
  } catch {
    // ignore
  }
  frame.contents = hit.name;
  lockTagText(frame, paraStyle, doc);
  fitTagFrame(frame);
}

export async function createMemorialStyleTags(
  onProgress?: (percent: number, label: string) => void
): Promise<StyleTagsResult> {
  const doc = getActiveDocument();

  return withPointUnitsAsync(doc, async () => {
    onProgress?.(10, "Localizando estilos…");
    await yieldToHost(20);

    const hits = scanStories(doc);
    if (!hits.length) {
      throw new Error("Nenhum estilo de parágrafo ou caractere em uso neste documento.");
    }

    onProgress?.(25, "Removendo tags anteriores…");
    await yieldToHost(20);
    const layerName = ensureMemorialLayer(doc);
    deletePreviousTags(doc);
    ensureProcessColor(doc, "EAC_TAG_INK", [0, 0, 0, 100]);
    ensureProcessColor(doc, COLOR_PARA, PARA_CMYK);
    ensureProcessColor(doc, COLOR_CHAR, CHAR_CMYK);
    const paraStyle = ensureTagParagraphStyle(doc);
    if (paraStyle) styleTagParagraph(paraStyle, doc);
    const none = swatchByName(doc, ["None", "Nenhum", "Nenhuma"]);
    const paraFill = colorByName(doc, COLOR_PARA);
    const charFill = colorByName(doc, COLOR_CHAR);

    onProgress?.(40, "Criando tags…");
    await yieldToHost(20);

    const placed: Array<{ pageKey: string; bounds: number[] }> = [];
    let paragraph = 0;
    let character = 0;

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const page = resolvePage(doc, hit);
      if (!page?.isValid) continue;

      const y = shiftIfCollision(hit, placed);
      const width = estimateTagWidth(hit.name);
      const top = y - TAG_HEIGHT + 3;
      const bottom = y + 4;
      const left = hit.x + 2;
      const right = left + width;
      placed.push({ pageKey: hit.pageKey, bounds: [top, left, bottom, right] });

      placeTag(
        doc,
        page,
        hit,
        top,
        left,
        bottom,
        right,
        hit.kind === "character" ? charFill : paraFill,
        none,
        paraStyle
      );

      if (hit.kind === "character") character += 1;
      else paragraph += 1;

      if ((i + 1) % TAG_BATCH === 0) {
        const percent = 40 + Math.round(((i + 1) / hits.length) * 55);
        onProgress?.(percent, `Criando tags… ${i + 1}/${hits.length}`);
        await yieldToHost(16);
      }
    }

    return {
      layerName,
      paragraph,
      character,
      total: paragraph + character,
    };
  });
}

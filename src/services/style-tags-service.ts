import type {
  CharacterStyle,
  Color,
  Document,
  Layer,
  Page,
  PageItem,
  ParagraphStyle,
  Story,
  Swatch,
  Text,
} from "indesign";
import { LAYER_MEMORIAL_DESCRITIVO } from "../utils/constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { findEditorialLayer, isEditorialLayerName } from "../utils/editorial-layer";
import {
  getActiveDocument,
  getInDesignModule,
  runInDesignMutation,
} from "../utils/indesign-runtime";

const TAG_LABEL = "eac-style-tag";
const COLOR_PARA = "EAC_TAG_PARAGRAFO";
const COLOR_CHAR = "EAC_TAG_CARACTERE";
const TAG_HEIGHT = 16;
const TAG_PADDING_X = 5;
const POINTER_W = 5;

const PARA_CANDIDATES: number[][] = [
  [0, 28, 52, 0],
  [0, 45, 70, 0],
  [8, 0, 72, 0],
];

const CHAR_CANDIDATES: number[][] = [
  [52, 18, 0, 0],
  [35, 55, 0, 0],
  [60, 0, 35, 0],
];

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
  page: Page;
  pageIndex: number;
  x: number;
  y: number;
}

function isIgnoredStyleName(name: string, kind: StyleKind): boolean {
  const value = (name || "").trim();
  if (!value) return true;
  if (value.startsWith("[")) return true;
  if (kind === "character") {
    const key = value.toLocaleLowerCase();
    if (key === "none" || key === "nenhum" || key === "normal") return true;
  }
  return false;
}

function isOnEditorialLayer(item: { itemLayer?: Layer } | null): boolean {
  try {
    const layer = item?.itemLayer;
    return Boolean(layer?.isValid && isEditorialLayerName(layer.name));
  } catch {
    return false;
  }
}

function isMasterPage(page: Page | null): boolean {
  if (!page?.isValid) return true;
  try {
    const parent = page.parent as { constructor?: { name?: string } } | undefined;
    const name = parent?.constructor?.name || "";
    return /master/i.test(name);
  } catch {
    return false;
  }
}

function getPageIndex(page: Page): number {
  try {
    if (typeof page.documentOffset === "number") {
      return page.documentOffset;
    }
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

    const frames = character.parentTextFrames as { item?: (i: number) => PageItem; length?: number } | PageItem[] | undefined;
    let frame: PageItem | null = null;
    if (Array.isArray(frames) && frames[0]) {
      frame = frames[0];
    } else if (frames) {
      frame = getCollectionItem<PageItem>(frames, 0);
    }
    if (!frame?.isValid || isOnEditorialLayer(frame)) return null;

    const page = frame.parentPage;
    if (!page || typeof page === "number" || !page.isValid || isMasterPage(page)) {
      return null;
    }

    const x = Number(character.horizontalOffset);
    const y = Number(character.baseline);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return { page, pageIndex: getPageIndex(page), x, y };
  } catch {
    return null;
  }
}

function considerHit(
  hits: Map<string, StyleHit>,
  name: string,
  kind: StyleKind,
  source: Text | null
): void {
  if (isIgnoredStyleName(name, kind)) return;
  const key = `${kind}:${name}`;
  const anchor = getAnchorFromText(source);
  if (!anchor) return;

  const existing = hits.get(key);
  if (!existing) {
    hits.set(key, { name, kind, ...anchor });
    return;
  }

  if (
    anchor.pageIndex < existing.pageIndex ||
    (anchor.pageIndex === existing.pageIndex &&
      (anchor.y < existing.y - 0.5 || (Math.abs(anchor.y - existing.y) <= 0.5 && anchor.x < existing.x)))
  ) {
    hits.set(key, { name, kind, ...anchor });
  }
}

function scanParagraphs(collection: unknown, hits: Map<string, StyleHit>): void {
  forEachCollectionItem<Text>(collection, (paragraph) => {
    if (!paragraph?.isValid) return;
    try {
      const style = paragraph.appliedParagraphStyle;
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

function scanStories(doc: Document): StyleHit[] {
  const hits = new Map<string, StyleHit>();

  forEachCollectionItem<Story>(doc.stories, (story) => {
    if (!story?.isValid || isOnEditorialLayer(story)) return;
    scanParagraphs(story.paragraphs, hits);
    scanCharacterRanges(story.textStyleRanges, hits);

    forEachCollectionItem<{ cells?: unknown; isValid?: boolean }>(story.tables, (table) => {
      if (!table?.isValid) return;
      forEachCollectionItem<{ paragraphs?: unknown; textStyleRanges?: unknown; isValid?: boolean }>(
        table.cells,
        (cell) => {
          if (!cell?.isValid) return;
          scanParagraphs(cell.paragraphs, hits);
          scanCharacterRanges(cell.textStyleRanges, hits);
        }
      );
    });
  });

  return Array.from(hits.values()).sort((a, b) => {
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });
}

function collectUsedCmyk(doc: Document): number[][] {
  const used: number[][] = [];
  const { ColorSpace } = getInDesignModule() as { ColorSpace?: { CMYK?: number } };
  const cmyk = ColorSpace?.CMYK;

  forEachCollectionItem<Color>(doc.colors, (color) => {
    if (!color?.isValid) return;
    try {
      const name = color.name || "";
      if (/^(none|paper|black|registration|eac_tag_)/i.test(name) || name.startsWith("[")) {
        return;
      }
      if (cmyk != null && color.space !== cmyk) return;
      const value = color.colorValue;
      if (value && value.length >= 4) {
        used.push([value[0], value[1], value[2], value[3]]);
      }
    } catch {
      // ignore
    }
  });

  return used;
}

function cmykDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const delta = (a[i] || 0) - (b[i] || 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function minDistanceToUsed(candidate: number[], used: number[][]): number {
  if (!used.length) return 999;
  let min = Infinity;
  for (const color of used) {
    min = Math.min(min, cmykDistance(candidate, color));
  }
  return min;
}

function pickContrastingColors(used: number[][]): { paragraph: number[]; character: number[] } {
  const para = [...PARA_CANDIDATES].sort(
    (a, b) => minDistanceToUsed(b, used) - minDistanceToUsed(a, used)
  )[0];
  const char = [...CHAR_CANDIDATES]
    .filter((candidate) => cmykDistance(candidate, para) > 20)
    .sort((a, b) => minDistanceToUsed(b, used) - minDistanceToUsed(a, used))[0] || CHAR_CANDIDATES[0];

  return { paragraph: para, character: char };
}

function ensureProcessColor(doc: Document, name: string, cmyk: number[]): Color {
  const { ColorModel, ColorSpace } = getInDesignModule() as {
    ColorModel: { PROCESS: number };
    ColorSpace: { CMYK: number };
  };

  let color: Color | null = null;
  try {
    const existing = doc.colors.itemByName(name);
    if (existing?.isValid) {
      color = existing;
    }
  } catch {
    color = null;
  }

  if (!color) {
    color = doc.colors.add({
      name,
      model: ColorModel.PROCESS,
      space: ColorSpace.CMYK,
      colorValue: cmyk,
    });
  } else {
    try {
      color.model = ColorModel.PROCESS;
      color.space = ColorSpace.CMYK;
      color.colorValue = cmyk;
    } catch {
      // mantém a cor existente
    }
  }

  return color;
}

function swatchByName(doc: Document, name: string): Swatch | Color | null {
  try {
    const item = doc.swatches?.itemByName(name);
    if (item?.isValid) return item;
  } catch {
    // ignore
  }
  try {
    const item = doc.colors.itemByName(name);
    if (item?.isValid) return item;
  } catch {
    // ignore
  }
  return null;
}

function applyMinionRegular(text: Text): void {
  const attempts = ["Minion Pro\tRegular", "Minion Pro", "MinionPro-Regular"];
  for (const name of attempts) {
    try {
      text.appliedFont = name;
      break;
    } catch {
      // tenta o próximo
    }
  }
  try {
    text.fontStyle = "Regular";
  } catch {
    // ignore
  }
  text.pointSize = 12;
}

function applyRoundedCorners(item: PageItem, radius: number): void {
  const { CornerOptions } = getInDesignModule() as { CornerOptions?: { ROUNDED_CORNER?: number } };
  const rounded = CornerOptions?.ROUNDED_CORNER;
  if (rounded == null) return;

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

function deletePreviousTags(layer: Layer): void {
  const items: PageItem[] = [];
  forEachCollectionItem<PageItem>(layer.pageItems, (item) => {
    if (!item?.isValid) return;
    try {
      if (item.label === TAG_LABEL || (item.name || "").startsWith("EAC_TAG_")) {
        items.push(item);
      }
    } catch {
      // ignore
    }
  });

  for (let i = items.length - 1; i >= 0; i--) {
    try {
      items[i].remove?.();
    } catch {
      // ignore
    }
  }
}

function ensureMemorialLayer(doc: Document): Layer {
  const existing = findEditorialLayer(doc);
  if (existing?.isValid) {
    existing.visible = true;
    existing.locked = false;
    return existing;
  }

  return doc.layers.add({ name: LAYER_MEMORIAL_DESCRITIVO });
}

function estimateTagWidth(name: string): number {
  return Math.max(36, name.length * 6.2 + TAG_PADDING_X * 2);
}

function shiftIfCollision(hit: StyleHit, placed: Array<{ pageIndex: number; bounds: number[] }>): number {
  let y = hit.y;
  for (let guard = 0; guard < 12; guard++) {
    const top = y - TAG_HEIGHT + 3;
    const bottom = y + 4;
    const left = hit.x + 2;
    const right = left + POINTER_W + estimateTagWidth(hit.name);
    const collides = placed.some((item) => {
      if (item.pageIndex !== hit.pageIndex) return false;
      const [t, l, b, r] = item.bounds;
      return !(right < l || left > r || bottom < t || top > b);
    });
    if (!collides) return y;
    y += TAG_HEIGHT + 2;
  }
  return y;
}

function createTag(
  doc: Document,
  layer: Layer,
  hit: StyleHit,
  fill: Color,
  ink: Swatch | Color,
  none: Swatch | Color | null,
  placed: Array<{ pageIndex: number; bounds: number[] }>
): void {
  const { Justification } = getInDesignModule() as {
    Justification?: { CENTER_ALIGN?: number };
  };

  const width = estimateTagWidth(hit.name);
  const y = shiftIfCollision(hit, placed);
  const top = y - TAG_HEIGHT + 3;
  const bottom = y + 4;
  const left = hit.x + 2;
  const frameLeft = left + POINTER_W;
  const right = frameLeft + width;
  const midY = (top + bottom) / 2;

  const frame = hit.page.textFrames?.add();
  if (!frame) {
    throw new Error("Não foi possível criar o quadro da tag.");
  }

  frame.itemLayer = layer;
  frame.geometricBounds = [top, frameLeft, bottom, right];
  frame.contents = hit.name;
  frame.name = `EAC_TAG_${hit.kind === "character" ? "C" : "P"}_${hit.name}`.slice(0, 80);
  frame.label = TAG_LABEL;
  frame.fillColor = fill;
  if (none) {
    frame.strokeColor = none;
  }
  frame.strokeWeight = 0;
  applyRoundedCorners(frame, 3);

  try {
    if (frame.textFramePreferences) {
      frame.textFramePreferences.insetSpacing = [1, 3, 1, 3];
    }
  } catch {
    // ignore
  }

  const text = getCollectionItem<Text>(frame.texts, 0);
  if (text) {
    applyMinionRegular(text);
    text.fillColor = ink;
    if (Justification?.CENTER_ALIGN != null) {
      try {
        text.justification = Justification.CENTER_ALIGN;
      } catch {
        // ignore
      }
    }
  }

  try {
    const pointer = hit.page.polygons?.add();
    if (pointer) {
      pointer.itemLayer = layer;
      pointer.label = TAG_LABEL;
      pointer.name = `${frame.name}_p`;
      pointer.fillColor = fill;
      if (none) pointer.strokeColor = none;
      pointer.strokeWeight = 0;
      const path = getCollectionItem<{ entirePath: number[][] }>(pointer.paths, 0);
      if (path) {
        path.entirePath = [
          [left, midY],
          [frameLeft + 0.4, top + 3],
          [frameLeft + 0.4, bottom - 3],
        ];
      }
      hit.page.groups?.add([pointer, frame]);
    }
  } catch {
    // tag sem ponteiro ainda é útil
  }

  placed.push({ pageIndex: hit.pageIndex, bounds: [top, left, bottom, right] });
}

function withPointUnits<T>(doc: Document, fn: () => T): T {
  const { MeasurementUnits } = getInDesignModule() as {
    MeasurementUnits?: { POINTS?: number };
  };
  const points = MeasurementUnits?.POINTS;
  const prefs = doc.viewPreferences;
  if (!prefs || points == null) {
    return fn();
  }

  const previousH = prefs.horizontalMeasurementUnits;
  const previousV = prefs.verticalMeasurementUnits;
  try {
    prefs.horizontalMeasurementUnits = points;
    prefs.verticalMeasurementUnits = points;
    return fn();
  } finally {
    try {
      prefs.horizontalMeasurementUnits = previousH;
      prefs.verticalMeasurementUnits = previousV;
    } catch {
      // ignore
    }
  }
}

export function createMemorialStyleTags(): StyleTagsResult {
  return runInDesignMutation("EDITORIAL AUTOCLOSE — Criar estilos", () => {
    const doc = getActiveDocument();

    return withPointUnits(doc, () => {
      const layer = ensureMemorialLayer(doc);
      layer.visible = true;
      layer.locked = false;
      deletePreviousTags(layer);

      const hits = scanStories(doc);
      if (!hits.length) {
        throw new Error("Nenhum estilo de parágrafo ou caractere em uso neste documento.");
      }

      const palette = pickContrastingColors(collectUsedCmyk(doc));
      const paraColor = ensureProcessColor(doc, COLOR_PARA, palette.paragraph);
      const charColor = ensureProcessColor(doc, COLOR_CHAR, palette.character);
      const black = swatchByName(doc, "Black") || swatchByName(doc, "Preto");
      const none = swatchByName(doc, "None") || swatchByName(doc, "Nenhum");
      if (!black) {
        throw new Error("Swatch Black não encontrado no documento.");
      }

      const placed: Array<{ pageIndex: number; bounds: number[] }> = [];
      let paragraph = 0;
      let character = 0;

      for (const hit of hits) {
        const fill = hit.kind === "character" ? charColor : paraColor;
        createTag(doc, layer, hit, fill, black, none, placed);
        if (hit.kind === "character") character += 1;
        else paragraph += 1;
      }

      return {
        layerName: layer.name,
        paragraph,
        character,
        total: paragraph + character,
      };
    });
  });
}

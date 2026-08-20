import type { CharacterStyle, Document, Page, PageItem, ParagraphStyle, Story, Text } from "indesign";
import { LAYER_MEMORIAL_DESCRITIVO } from "../utils/constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { findEditorialLayer, isEditorialLayerName } from "../utils/editorial-layer";
import { getActiveDocument, getInDesignApp, getInDesignModule } from "../utils/indesign-runtime";

const TAG_LABEL = "eac-style-tag";
const COLOR_PARA = "EAC_TAG_PARAGRAFO";
const COLOR_CHAR = "EAC_TAG_CARACTERE";
const PARA_CMYK = [0, 28, 52, 0];
const CHAR_CMYK = [52, 18, 0, 0];
const TAG_HEIGHT = 16;
const TAG_PADDING_X = 5;
const POINTER_W = 5;

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
  x: number;
  y: number;
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function runExtendScript(source: string): unknown {
  const app = getInDesignApp();
  const mod = getInDesignModule();
  if (typeof app.doScript !== "function") {
    throw new Error("doScript indisponível para criar estilos no InDesign.");
  }
  const undoMode = mod.UndoModes?.FAST_ENTIRE_SCRIPT ?? mod.UndoModes?.ENTIRE_SCRIPT;
  return app.doScript(source, mod.ScriptLanguage?.JAVASCRIPT, [], undoMode, "EDITORIAL AUTOCLOSE — Criar estilos");
}

function parseResult(raw: unknown): StyleTagsResult {
  const text = typeof raw === "string" ? raw : raw != null ? JSON.stringify(raw) : "";
  if (!text) {
    throw new Error("O InDesign não retornou o resultado da criação de estilos.");
  }
  const parsed = JSON.parse(text) as StyleTagsResult & { error?: string };
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  if (typeof parsed.total !== "number") {
    throw new Error("Nenhum estilo de parágrafo ou caractere em uso neste documento.");
  }
  return parsed;
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
    if (parent) {
      if (parent.label === TAG_LABEL) return true;
      if ((parent.name || "").startsWith("EAC_TAG_")) return true;
    }
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

function isMasterPage(page: Page | null): boolean {
  if (!page?.isValid) return true;
  try {
    const parent = page.parent as { constructor?: { name?: string } } | undefined;
    return /master/i.test(parent?.constructor?.name || "");
  } catch {
    return true;
  }
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
    if (!frame?.isValid || isOnEditorialLayer(frame) || isTagRelated(frame)) return null;

    const page = frame.parentPage;
    if (!page || typeof page === "number" || !page.isValid || isMasterPage(page)) {
      return null;
    }

    const x = Number(character.horizontalOffset);
    const y = Number(character.baseline);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    return { pageIndex: getPageIndex(page), pageName: page.name || "", x, y };
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

function scanStories(doc: Document): StyleHit[] {
  const hits = new Map<string, StyleHit>();

  forEachCollectionItem<Story>(doc.stories, (story) => {
    if (!story?.isValid) return;
    try {
      if ((story as Story & { length?: number }).length === 0) return;
    } catch {
      // segue
    }
    scanParagraphs(story.paragraphs, hits);
    scanCharacterRanges(story.textStyleRanges, hits);
  });

  return Array.from(hits.values());
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

function withPointUnits<T>(doc: Document, fn: () => T): T {
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

function buildPlaceScript(layerName: string, hits: StyleHit[]): string {
  const placed: Array<{ pageIndex: number; bounds: number[] }> = [];
  const payload = hits.map((hit) => {
    const y = shiftIfCollision(hit, placed);
    const width = estimateTagWidth(hit.name);
    const top = y - TAG_HEIGHT + 3;
    const bottom = y + 4;
    const left = hit.x + 2;
    const frameLeft = left + POINTER_W;
    const right = frameLeft + width;
    placed.push({ pageIndex: hit.pageIndex, bounds: [top, left, bottom, right] });
    return (
      `{k:${quote(hit.kind === "character" ? "c" : "p")},` +
      `n:${quote(hit.name)},` +
      `i:${hit.pageIndex},` +
      `g:${quote(hit.pageName)},` +
      `t:${top.toFixed(3)},l:${left.toFixed(3)},b:${bottom.toFixed(3)},r:${right.toFixed(3)},` +
      `fl:${frameLeft.toFixed(3)}}`
    );
  });

  return `
(function () {
  var TAG_LABEL = ${quote(TAG_LABEL)};
  var LAYER_NAME = ${quote(layerName)};
  var COLOR_PARA = ${quote(COLOR_PARA)};
  var COLOR_CHAR = ${quote(COLOR_CHAR)};
  var tags = [${payload.join(",")}];
  var doc = app.activeDocument;
  var vp = doc.viewPreferences;
  var oldH = vp.horizontalMeasurementUnits;
  var oldV = vp.verticalMeasurementUnits;
  vp.horizontalMeasurementUnits = MeasurementUnits.POINTS;
  vp.verticalMeasurementUnits = MeasurementUnits.POINTS;

  function alive(obj) {
    try { return !!(obj && obj.isValid); } catch (e) { return false; }
  }
  function findNamed(collection, names) {
    for (var i = 0; i < names.length; i++) {
      try {
        var item = collection.itemByName(names[i]);
        if (alive(item)) return item;
      } catch (e) {}
    }
    return null;
  }
  function isTag(item) {
    try {
      if (item.label === TAG_LABEL) return true;
      if (String(item.name || "").indexOf("EAC_TAG_") === 0) return true;
    } catch (e) {}
    try {
      var kids = item.pageItems;
      if (kids && kids.length) {
        for (var k = 0; k < kids.length; k++) {
          if (isTag(kids.item(k))) return true;
        }
      }
    } catch (e) {}
    return false;
  }
  function deleteFrom(container) {
    if (!container || !container.pageItems) return;
    var items = container.pageItems;
    for (var i = items.length - 1; i >= 0; i--) {
      try {
        var it = items.item(i);
        if (alive(it) && isTag(it)) it.remove();
      } catch (e) {}
    }
  }
  function ensureColor(name, cmyk) {
    var color = null;
    try {
      color = doc.colors.itemByName(name);
      if (!alive(color)) color = null;
    } catch (e) { color = null; }
    if (!color) {
      color = doc.colors.add({
        name: name,
        model: ColorModel.PROCESS,
        space: ColorSpace.CMYK,
        colorValue: cmyk
      });
    }
    return color;
  }
  function ensureLayer() {
    var layers = doc.layers;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers.item(i);
      if (!alive(layer)) continue;
      var n = String(layer.name || "").toLowerCase().replace(/_/g, " ");
      while (n.indexOf("  ") >= 0) n = n.replace("  ", " ");
      n = n.replace(/^\\s+|\\s+$/g, "");
      if (n === "estilos" || n === "memorial" || n === "memorial descritivo" || n === "memoral descritivo") {
        return layer;
      }
    }
    try {
      var named = doc.layers.itemByName(LAYER_NAME);
      if (alive(named)) return named;
    } catch (e) {}
    return doc.layers.add({ name: LAYER_NAME });
  }
  function ensurePara(ink, noneSwatch) {
    var style = null;
    try {
      style = doc.paragraphStyles.itemByName("EAC_TagLabel");
      if (!alive(style)) style = null;
    } catch (e) { style = null; }
    if (!style) style = doc.paragraphStyles.add({ name: "EAC_TagLabel" });
    var base = findNamed(doc.paragraphStyles, ["[No Paragraph Style]", "[Sem estilo de parágrafo]"]);
    if (base) { try { style.basedOn = base; } catch (e) {} }
    try { style.appliedFont = "Minion Pro"; } catch (e) {}
    try { style.fontStyle = "Regular"; } catch (e) {}
    try { style.pointSize = 12; } catch (e) {}
    try { style.leading = 14; } catch (e) {}
    try { style.fillColor = ink; } catch (e) {}
    try { style.strokeWeight = 0; } catch (e) {}
    if (noneSwatch) { try { style.strokeColor = noneSwatch; } catch (e) {} }
    try { style.justification = Justification.CENTER_ALIGN; } catch (e) {}
    return style;
  }
  function resolvePage(index, name) {
    try {
      if (name) {
        var byName = doc.pages.itemByName(String(name));
        if (alive(byName)) return byName;
      }
    } catch (e) {}
    try {
      var byIndex = doc.pages.item(index);
      if (alive(byIndex)) return byIndex;
    } catch (e2) {}
    return null;
  }
  function roundFrame(tf) {
    try {
      tf.topLeftCornerOption = CornerOptions.ROUNDED_CORNER;
      tf.topRightCornerOption = CornerOptions.ROUNDED_CORNER;
      tf.bottomLeftCornerOption = CornerOptions.ROUNDED_CORNER;
      tf.bottomRightCornerOption = CornerOptions.ROUNDED_CORNER;
      tf.topLeftCornerRadius = 3;
      tf.topRightCornerRadius = 3;
      tf.bottomLeftCornerRadius = 3;
      tf.bottomRightCornerRadius = 3;
    } catch (e) {}
  }

  try {
    var spreads = doc.spreads;
    for (var s = 0; s < spreads.length; s++) deleteFrom(spreads.item(s));
    try {
      var masters = doc.masterSpreads;
      if (masters) {
        for (var m = 0; m < masters.length; m++) deleteFrom(masters.item(m));
      }
    } catch (e) {}

    var layer = ensureLayer();
    try { layer.visible = true; layer.locked = false; } catch (e) {}
    try { doc.activeLayer = layer; } catch (e) {}

    var noneSwatch = findNamed(doc.swatches, ["None", "Nenhum", "Nenhuma"]);
    var noneChar = findNamed(doc.characterStyles, ["[None]", "[Nenhum]", "[Nenhuma]"]);
    var ink = ensureColor("EAC_TAG_INK", [0, 0, 0, 100]);
    var paraStyle = ensurePara(ink, noneSwatch);
    var paraFill = ensureColor(COLOR_PARA, [${PARA_CMYK.join(", ")}]);
    var charFill = ensureColor(COLOR_CHAR, [${CHAR_CMYK.join(", ")}]);

    var paragraph = 0;
    var character = 0;
    for (var t = 0; t < tags.length; t++) {
      try {
        var hit = tags[t];
        var page = resolvePage(hit.i, hit.g);
        if (!page) continue;
        var fill = hit.k === "c" ? charFill : paraFill;
        var midY = (hit.t + hit.b) / 2;
        var tf = page.textFrames.add();
        if (!alive(tf)) continue;
        tf.geometricBounds = [hit.t, hit.fl, hit.b, hit.r];
        try { tf.fillColor = fill; } catch (e) {}
        try { tf.strokeWeight = 0; } catch (e) {}
        if (noneSwatch) { try { tf.strokeColor = noneSwatch; } catch (e) {} }
        tf.label = TAG_LABEL;
        tf.name = ("EAC_TAG_" + hit.k + "_" + hit.n).substring(0, 80);
        roundFrame(tf);
        try { tf.textFramePreferences.insetSpacing = [1, 3, 1, 3]; } catch (e) {}
        tf.contents = hit.n;
        try { tf.texts.item(0).appliedParagraphStyle = paraStyle; } catch (e) {}
        if (noneChar) { try { tf.texts.item(0).appliedCharacterStyle = noneChar; } catch (e) {} }
        try {
          var pointer = page.polygons.add();
          if (alive(pointer)) {
            try { pointer.fillColor = fill; } catch (e) {}
            try { pointer.strokeWeight = 0; } catch (e) {}
            if (noneSwatch) { try { pointer.strokeColor = noneSwatch; } catch (e) {} }
            pointer.label = TAG_LABEL;
            pointer.name = tf.name + "_p";
            pointer.paths.item(0).entirePath = [[hit.l, midY], [hit.fl + 0.4, hit.t + 3], [hit.fl + 0.4, hit.b - 3]];
            try {
              var grp = page.groups.add([pointer, tf]);
              if (alive(grp)) {
                grp.label = TAG_LABEL;
                grp.name = tf.name;
              }
            } catch (e) {}
          }
        } catch (e) {}
        if (hit.k === "c") character++;
        else paragraph++;
      } catch (e) {}
    }

    if (paragraph + character === 0) {
      return '{"error":"Nenhum estilo de parágrafo ou caractere em uso neste documento."}';
    }
    return '{"layerName":"' + String(layer.name).replace(/"/g, '\\\\"') + '","paragraph":' + paragraph + ',"character":' + character + ',"total":' + (paragraph + character) + '}';
  } catch (err) {
    var msg = err && err.message ? err.message : String(err);
    return '{"error":"' + String(msg).replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"') + '"}';
  } finally {
    try {
      vp.horizontalMeasurementUnits = oldH;
      vp.verticalMeasurementUnits = oldV;
    } catch (e) {}
  }
})();
`;
}

export function createMemorialStyleTags(): StyleTagsResult {
  const doc = getActiveDocument();

  return withPointUnits(doc, () => {
    const existing = findEditorialLayer(doc);
    const layerName = existing?.isValid ? existing.name : LAYER_MEMORIAL_DESCRITIVO;
    const hits = scanStories(doc);
    if (!hits.length) {
      throw new Error("Nenhum estilo de parágrafo ou caractere em uso neste documento.");
    }

    return parseResult(runExtendScript(buildPlaceScript(layerName, hits)));
  });
}

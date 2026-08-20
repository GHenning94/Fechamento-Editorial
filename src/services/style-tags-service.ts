import { LAYER_MEMORIAL_DESCRITIVO } from "../utils/constants";
import { getActiveDocument, getInDesignApp, getInDesignModule } from "../utils/indesign-runtime";

const TAG_LABEL = "eac-style-tag";
const COLOR_PARA = "EAC_TAG_PARAGRAFO";
const COLOR_CHAR = "EAC_TAG_CARACTERE";
const PARA_CMYK = [0, 28, 52, 0];
const CHAR_CMYK = [52, 18, 0, 0];

export interface StyleTagsResult {
  layerName: string;
  paragraph: number;
  character: number;
  total: number;
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

/**
 * Varredura + criação num único script nativo (sem ponte UXP por parágrafo).
 * Sem polígonos/grupos: só um text frame por estilo, primeira ocorrência.
 */
function buildCreateTagsScript(): string {
  return `
(function () {
  var TAG_LABEL = ${quote(TAG_LABEL)};
  var LAYER_NAME = ${quote(LAYER_MEMORIAL_DESCRITIVO)};
  var COLOR_PARA = ${quote(COLOR_PARA)};
  var COLOR_CHAR = ${quote(COLOR_CHAR)};
  var PARA_CMYK = [${PARA_CMYK.join(", ")}];
  var CHAR_CMYK = [${CHAR_CMYK.join(", ")}];
  var TAG_H = 16;
  var PAD_X = 5;

  var doc = app.activeDocument;
  var prefs = app.scriptPreferences;
  var oldRedraw = true;
  var oldInteract = prefs.userInteractionLevel;
  var vp = doc.viewPreferences;
  var oldH = vp.horizontalMeasurementUnits;
  var oldV = vp.verticalMeasurementUnits;
  var oldLayer = "";
  try { oldLayer = doc.activeLayer.name; } catch (e) {}
  try { oldRedraw = prefs.enableRedraw; } catch (e) {}
  try { prefs.enableRedraw = false; } catch (e) {}
  try { prefs.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT; } catch (e) {}
  vp.horizontalMeasurementUnits = MeasurementUnits.POINTS;
  vp.verticalMeasurementUnits = MeasurementUnits.POINTS;

  function trimName(name) {
    return String(name || "").replace(/^\\s+|\\s+$/g, "");
  }
  function normLayer(name) {
    var n = trimName(name).toLowerCase().replace(/_/g, " ");
    while (n.indexOf("  ") >= 0) n = n.replace("  ", " ");
    return n;
  }
  function isEditorial(name) {
    var n = normLayer(name);
    return n === "estilos" || n === "memorial" || n === "memorial descritivo" || n === "memoral descritivo";
  }
  function ignored(name, kind) {
    var value = trimName(name);
    if (!value) return true;
    if (value.charAt(0) === "[") return true;
    if (value.indexOf("EAC_") === 0) return true;
    if (kind === "character") {
      var key = value.toLowerCase();
      if (key === "none" || key === "nenhum" || key === "normal") return true;
    }
    return false;
  }
  function findNamed(collection, names) {
    for (var i = 0; i < names.length; i++) {
      try {
        var item = collection.itemByName(names[i]);
        if (item.isValid) return item;
      } catch (e) {}
    }
    return null;
  }
  function ensureColor(name, cmyk) {
    var color = doc.colors.itemByName(name);
    if (!color.isValid) {
      color = doc.colors.add({
        name: name,
        model: ColorModel.PROCESS,
        space: ColorSpace.CMYK,
        colorValue: cmyk
      });
    } else {
      try {
        color.model = ColorModel.PROCESS;
        color.space = ColorSpace.CMYK;
        color.colorValue = cmyk;
      } catch (e) {}
    }
    return color;
  }
  function ensureLayer() {
    var layers = doc.layers;
    for (var i = 0; i < layers.length; i++) {
      var layer = layers.item(i);
      if (layer.isValid && isEditorial(layer.name)) return layer;
    }
    return doc.layers.add({ name: LAYER_NAME });
  }
  function ensureInk() {
    var ink = doc.colors.itemByName("EAC_TAG_INK");
    if (!ink.isValid) {
      ink = doc.colors.add({
        name: "EAC_TAG_INK",
        model: ColorModel.PROCESS,
        space: ColorSpace.CMYK,
        colorValue: [0, 0, 0, 100]
      });
    }
    return ink;
  }
  function ensurePara(ink, noneSwatch) {
    var style = doc.paragraphStyles.itemByName("EAC_TagLabel");
    if (!style.isValid) style = doc.paragraphStyles.add({ name: "EAC_TagLabel" });
    var base = findNamed(doc.paragraphStyles, ["[No Paragraph Style]", "[Sem estilo de parágrafo]"]);
    if (base) { try { style.basedOn = base; } catch (e) {} }
    try { style.appliedFont = app.fonts.item("Minion Pro\\tRegular"); } catch (e) {
      try { style.appliedFont = "Minion Pro"; } catch (e2) {}
    }
    try { style.fontStyle = "Regular"; } catch (e) {}
    style.pointSize = 12;
    try { style.leading = 14; } catch (e) {}
    try { style.fillColor = ink; } catch (e) {}
    try { style.strokeWeight = 0; } catch (e) {}
    if (noneSwatch) { try { style.strokeColor = noneSwatch; } catch (e) {} }
    try { style.justification = Justification.CENTER_ALIGN; } catch (e) {}
    try { style.hyphenation = false; } catch (e) {}
    return style;
  }
  function isMaster(page) {
    try {
      return String(page.parent.constructor.name).toLowerCase().indexOf("master") >= 0;
    } catch (e) {
      return true;
    }
  }
  function anchorOf(text) {
    try {
      var ch = text.characters.item(0);
      var frames = ch.parentTextFrames;
      var frame = frames && frames.length ? frames[0] : null;
      if (!frame) return null;
      if (isEditorial(frame.itemLayer.name)) return null;
      var page = frame.parentPage;
      if (!page || page === NothingEnum.NOTHING) return null;
      if (isMaster(page)) return null;
      var x = Number(ch.horizontalOffset);
      var y = Number(ch.baseline);
      if (isNaN(x) || isNaN(y)) return null;
      return { page: page, pageIndex: page.documentOffset, x: x, y: y };
    } catch (e) {
      return null;
    }
  }
  function widthOf(name) {
    var w = name.length * 6.2 + PAD_X * 2;
    return w < 36 ? 36 : w;
  }

  var placed = [];
  var hits = [];
  function shiftY(pageIndex, x, y, width) {
    var guard, i, item, top, bottom, left, right, collides;
    for (guard = 0; guard < 10; guard++) {
      top = y - TAG_H + 3;
      bottom = y + 4;
      left = x + 2;
      right = left + width;
      collides = false;
      for (i = 0; i < placed.length; i++) {
        item = placed[i];
        if (item.p !== pageIndex) continue;
        if (!(right < item.l || left > item.r || bottom < item.t || top > item.b)) {
          collides = true;
          break;
        }
      }
      if (!collides) return y;
      y += TAG_H + 2;
    }
    return y;
  }
  function placeTag(info, name, fill, noneSwatch, paraStyle, noneChar) {
    var width = widthOf(name);
    var y = shiftY(info.pageIndex, info.x, info.y, width);
    var top = y - TAG_H + 3;
    var bottom = y + 4;
    var left = info.x + 2;
    var right = left + width;
    var page = doc.pages.item(info.pageIndex);
    var tf = page.textFrames.add();
    tf.geometricBounds = [top, left, bottom, right];
    tf.fillColor = fill;
    tf.strokeWeight = 0;
    if (noneSwatch) tf.strokeColor = noneSwatch;
    tf.label = TAG_LABEL;
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
    try { tf.textFramePreferences.insetSpacing = [1, 3, 1, 3]; } catch (e) {}
    tf.contents = name;
    try { tf.parentStory.appliedParagraphStyle = paraStyle; } catch (e) {}
    if (noneChar) { try { tf.parentStory.appliedCharacterStyle = noneChar; } catch (e) {} }
    placed.push({ p: info.pageIndex, t: top, l: left, b: bottom, r: right });
  }
  function deleteOld(layer) {
    var items = layer.pageItems;
    for (var i = items.length - 1; i >= 0; i--) {
      try {
        var item = items.item(i);
        if (item.label === TAG_LABEL) item.remove();
      } catch (e) {}
    }
  }

  try {
    var layer = ensureLayer();
    layer.visible = true;
    layer.locked = false;
    doc.activeLayer = layer;
    deleteOld(layer);

    var noneSwatch = findNamed(doc.swatches, ["None", "Nenhum", "Nenhuma"]) || doc.swatches.item(0);
    var noneChar = findNamed(doc.characterStyles, ["[None]", "[Nenhum]", "[Nenhuma]"]);
    var ink = ensureInk();
    var paraStyle = ensurePara(ink, noneSwatch);
    var paraFill = ensureColor(COLOR_PARA, PARA_CMYK);
    var charFill = ensureColor(COLOR_CHAR, CHAR_CMYK);

    var seen = {};
    var paragraph = 0;
    var character = 0;
    var stories = doc.stories;
    for (var s = 0; s < stories.length; s++) {
      var story = stories.item(s);
      if (!story.isValid) continue;
      try { if (story.length < 1) continue; } catch (e0) {}
      try { if (isEditorial(story.itemLayer.name)) continue; } catch (e) {}
      var paras = story.paragraphs;
      var pLen = paras.length;
      for (var p = 0; p < pLen; p++) {
        var para = paras.item(p);
        var st;
        try { st = para.appliedParagraphStyle; } catch (e2) { continue; }
        if (!st || !st.isValid) continue;
        var pname = st.name;
        if (ignored(pname, "paragraph") || seen["p:" + pname]) continue;
        var info = anchorOf(para);
        if (!info) continue;
        seen["p:" + pname] = true;
        hits.push({ kind: "paragraph", name: pname, pageIndex: info.pageIndex, x: info.x, y: info.y });
        paragraph++;
      }

      var ranges = story.textStyleRanges;
      var rLen = ranges.length;
      if (rLen > 8000) rLen = 8000;
      for (var r = 0; r < rLen; r++) {
        var range = ranges.item(r);
        var cs;
        try { cs = range.appliedCharacterStyle; } catch (e3) { continue; }
        if (!cs || !cs.isValid) continue;
        var cname = cs.name;
        if (ignored(cname, "character") || seen["c:" + cname]) continue;
        var cinfo = anchorOf(range);
        if (!cinfo) continue;
        seen["c:" + cname] = true;
        hits.push({ kind: "character", name: cname, pageIndex: cinfo.pageIndex, x: cinfo.x, y: cinfo.y });
        character++;
      }
    }

    if (paragraph + character === 0) {
      throw new Error("Nenhum estilo de parágrafo ou caractere em uso neste documento.");
    }

    for (var h = 0; h < hits.length; h++) {
      var hit = hits[h];
      placeTag(hit, hit.name, hit.kind === "character" ? charFill : paraFill, noneSwatch, paraStyle, noneChar);
    }

    return '{"layerName":"' + String(layer.name).replace(/"/g, '\\\\"') + '","paragraph":' + paragraph + ',"character":' + character + ',"total":' + (paragraph + character) + '}';
  } finally {
    try { vp.horizontalMeasurementUnits = oldH; vp.verticalMeasurementUnits = oldV; } catch (e) {}
    try { prefs.enableRedraw = oldRedraw; } catch (e) {}
    try { prefs.userInteractionLevel = oldInteract; } catch (e) {}
    if (oldLayer) {
      try { doc.activeLayer = doc.layers.itemByName(oldLayer); } catch (e) {}
    }
  }
})();
`;
}

export function createMemorialStyleTags(): StyleTagsResult {
  getActiveDocument();
  return parseResult(runExtendScript(buildCreateTagsScript()));
}

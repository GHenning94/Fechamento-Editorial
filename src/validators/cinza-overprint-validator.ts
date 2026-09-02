import type { Cell, Document, PageItem, Story, Text, TextStyleRange } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { isPluginGeneratedItem, isPluginUtilityLayerName } from "../utils/editorial-layer";
import {
  geometricBoundsOverlap,
  isColoredBackgroundFill,
  isGrayFill,
  isTextFrameItem,
  itemHasPlacedGraphic,
  readEffectiveFillColor,
  readFillTint,
  readItemFill,
  readLocalFillColor,
  textFillHasOverprint,
  textFrameFillLeaksFromContents,
} from "../utils/fill-color";
import { collectGraphics, walkDirectPageItems } from "../utils/indesign-helpers";

const FIX_DETAILS =
  "Aplique overprint no preenchimento do texto cinza. Preferência: preto 100%.";

interface ItemSnap {
  item: PageItem;
  pageName: string;
  bounds: number[];
  utility: boolean;
  coloredFill: boolean;
  hasGraphic: boolean;
}

function readBounds(item: PageItem): number[] {
  try {
    const bounds = item.geometricBounds;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      return bounds.map((value) => Number(value));
    }
  } catch {
    // tenta visibleBounds
  }
  try {
    const visible = (item as PageItem & { visibleBounds?: number[] }).visibleBounds;
    if (Array.isArray(visible) && visible.length >= 4) {
      return visible.map((value) => Number(value));
    }
  } catch {
    // ignore
  }
  return [];
}

function readNumber(getter: () => unknown): number | null {
  try {
    const value = getter();
    if (typeof value === "number" && Number.isFinite(value)) return value;
  } catch {
    // ignore
  }
  return null;
}

function unionBounds(a: number[], b: number[]): number[] {
  if (!a.length) return b.slice();
  if (!b.length) return a.slice();
  return [
    Math.min(Number(a[0]), Number(b[0])),
    Math.min(Number(a[1]), Number(b[1])),
    Math.max(Number(a[2]), Number(b[2])),
    Math.max(Number(a[3]), Number(b[3])),
  ];
}

function probeGlyph(target: Text | null | undefined): number[] {
  if (!target) return [];
  const left = readNumber(() => target.horizontalOffset);
  const baseline = readNumber(() => target.baseline);
  if (left == null || baseline == null) return [];
  const size = readNumber(() => target.pointSize) || 12;
  const rawRight = readNumber(() => target.endHorizontalOffset);
  const right = rawRight != null && rawRight > left ? rawRight : left + size * 0.55;
  const top = baseline - (readNumber(() => target.ascent) ?? size * 0.8);
  const bottom = baseline + (readNumber(() => target.descent) ?? size * 0.25);
  if (bottom <= top) return [];
  return [top, Math.min(left, right), bottom, Math.max(left, right)];
}

function characterLooksEmpty(character: Text | null | undefined): boolean {
  if (!character) return true;
  try {
    const contents = (character as { contents?: string }).contents;
    if (typeof contents === "string") return contents.trim() === "";
  } catch {
    // UXP às vezes não expõe contents
  }
  return false;
}

function readSpanInkBounds(span: Text | TextStyleRange): number[] {
  const text = span as Text;
  let union: number[] = [];
  try {
    const chars = text.characters;
    const length = getCollectionLength(chars);
    if (length > 0) {
      const indexes =
        length <= 24
          ? Array.from({ length }, (_, index) => index)
          : [0, 1, Math.floor(length / 4), Math.floor(length / 2), length - 2, length - 1];
      const seen = new Set<number>();
      for (const index of indexes) {
        if (index < 0 || index >= length || seen.has(index)) continue;
        seen.add(index);
        const character = chars?.item?.(index) as Text | null;
        if (characterLooksEmpty(character)) continue;
        union = unionBounds(union, probeGlyph(character));
      }
      if (union.length >= 4) return union;
    }
  } catch {
    // fallback no próprio trecho
  }
  return probeGlyph(text);
}

function overlapArea(a: number[], b: number[]): number {
  if (!a || a.length < 4 || !b || b.length < 4) return 0;
  const top = Math.max(Number(a[0]), Number(b[0]));
  const left = Math.max(Number(a[1]), Number(b[1]));
  const bottom = Math.min(Number(a[2]), Number(b[2]));
  const right = Math.min(Number(a[3]), Number(b[3]));
  if (bottom <= top || right <= left) return 0;
  return (bottom - top) * (right - left);
}

function boundsContainPoint(bounds: number[], y: number, x: number): boolean {
  if (!bounds || bounds.length < 4) return false;
  return y >= Number(bounds[0]) && y <= Number(bounds[2]) && x >= Number(bounds[1]) && x <= Number(bounds[3]);
}

function inkSitsOnColor(ink: number[], background: number[]): boolean {
  const area = overlapArea(ink, background);
  if (area <= 0.35) return false;
  const inkW = Math.abs(Number(ink[3]) - Number(ink[1]));
  const inkH = Math.abs(Number(ink[2]) - Number(ink[0]));
  const inkArea = Math.max(0.35, inkW * inkH);
  if (area / inkArea < 0.45) return false;
  const cy = (Number(ink[0]) + Number(ink[2])) / 2;
  const cx = (Number(ink[1]) + Number(ink[3])) / 2;
  return boundsContainPoint(background, cy, cx);
}

function forEachCollectionRun(collection: unknown, onRun: (run: TextStyleRange | Text) => void): void {
  const length = getCollectionLength(collection);
  if (length > 0) {
    forEachCollectionItem<TextStyleRange | Text>(collection, (run) => {
      if (run) onRun(run);
    });
    return;
  }

  try {
    const coll = collection as { item?: (index: number) => TextStyleRange | Text };
    if (typeof coll.item !== "function") return;
    for (let i = 0; i < 20000; i++) {
      let run: TextStyleRange | Text | null = null;
      try {
        run = coll.item(i);
      } catch {
        break;
      }
      if (!run) break;
      try {
        if ((run as { isValid?: boolean }).isValid === false) break;
      } catch {
        break;
      }
      onRun(run);
    }
  } catch {
    // ignore
  }
}

function rangeLooksEmpty(range: TextStyleRange | Text): boolean {
  try {
    const contents = (range as { contents?: string }).contents;
    if (typeof contents === "string") return contents.trim() === "";
  } catch {
    // UXP muitas vezes não expõe contents
  }
  return false;
}

function snippetOf(range: TextStyleRange | Text): string {
  try {
    const contents = String((range as { contents?: string }).contents || "")
      .replace(/\s+/g, " ")
      .trim();
    if (contents) return contents.slice(0, 52);
  } catch {
    // ignore
  }
  return "";
}

function fillOf(target: TextStyleRange | Text): ReturnType<typeof readLocalFillColor> {
  return readLocalFillColor(target) || readEffectiveFillColor(target);
}

function targetIsGrayWithoutOverprint(target: TextStyleRange | Text): boolean {
  if (rangeLooksEmpty(target)) return false;
  const fill = fillOf(target);
  if (!fill) return false;
  const tint = readFillTint(target);
  if (!isGrayFill(fill, tint)) return false;
  return !textFillHasOverprint(target);
}

function collectParentFrames(range: TextStyleRange | Text): PageItem[] {
  const frames: PageItem[] = [];
  const seen = new Set<PageItem>();
  const push = (item: PageItem | null | undefined): void => {
    if (!item) return;
    try {
      if (item.isValid === false) return;
    } catch {
      return;
    }
    if (seen.has(item)) return;
    seen.add(item);
    frames.push(item);
  };

  try {
    forEachCollectionRun((range as Text).parentTextFrames, (item) => push(item as PageItem));
  } catch {
    // ignore
  }

  try {
    const containers = (range as Text & { parentTextFrames?: unknown }).parentTextFrames;
    if (Array.isArray(containers)) {
      for (const item of containers) push(item as PageItem);
    }
  } catch {
    // ignore
  }

  return frames;
}

function boundsClose(a: number[], b: number[]): boolean {
  if (!a || a.length < 4 || !b || b.length < 4) return false;
  return a.every((value, index) => Math.abs(Number(value) - Number(b[index])) < 0.5);
}

function resolveFramePageName(frame: PageItem, snaps: ItemSnap[]): string {
  try {
    const parentPage = frame.parentPage;
    if (parentPage && typeof parentPage === "object" && parentPage.name) {
      return parentPage.name;
    }
  } catch {
    // ignore
  }

  const bounds = readBounds(frame);
  const byIdentity = snaps.find((item) => item.item === frame);
  if (byIdentity?.pageName) return byIdentity.pageName;

  const byBounds = snaps.find((item) => item.pageName && boundsClose(item.bounds, bounds));
  if (byBounds?.pageName) return byBounds.pageName;

  if (bounds.length >= 4) {
    const overlapping = snaps.find(
      (item) => item.pageName && (item.coloredFill || item.hasGraphic) && geometricBoundsOverlap(bounds, item.bounds)
    );
    if (overlapping?.pageName) return overlapping.pageName;
  }

  return "";
}

function isFilledShape(item: PageItem): boolean {
  try {
    const typeName = item.constructor?.name || "";
    return /rectangle|oval|polygon|graphicline/i.test(typeName);
  } catch {
    return false;
  }
}

function findParentCell(range: TextStyleRange | Text): Cell | null {
  let current: unknown = range;
  for (let depth = 0; depth < 12; depth++) {
    if (!current || typeof current !== "object") return null;
    try {
      const typeName = (current as { constructor?: { name?: string } }).constructor?.name || "";
      if (/^cell$/i.test(typeName)) return current as Cell;
    } catch {
      return null;
    }
    try {
      current = (current as { parent?: unknown }).parent;
    } catch {
      return null;
    }
  }
  return null;
}

function cellIsChromaticBackground(cell: Cell | null): boolean {
  if (!cell) return false;
  try {
    return isColoredBackgroundFill(cell.fillColor, readFillTint(cell));
  } catch {
    return false;
  }
}

function frameIsChromaticBox(frame: PageItem): boolean {
  if (!isTextFrameItem(frame)) return false;
  if (isPluginGeneratedItem(frame)) return false;
  if (textFrameFillLeaksFromContents(frame)) return false;
  const fill = readItemFill(frame);
  return isColoredBackgroundFill(fill, readFillTint(frame));
}

function forEachLineInk(
  range: TextStyleRange | Text,
  onLine: (ink: number[], sample: Text) => void
): void {
  try {
    const lines = (range as Text & { lines?: unknown }).lines;
    const count = getCollectionLength(lines);
    if (count > 0) {
      let used = false;
      forEachCollectionItem<Text>(lines, (line) => {
        if (!line || rangeLooksEmpty(line)) return;
        const ink = readSpanInkBounds(line);
        if (ink.length < 4) return;
        used = true;
        onLine(ink, line);
      });
      if (used) return;
    }
  } catch {
    // agrupa por baseline
  }

  try {
    const chars = (range as Text).characters;
    const length = getCollectionLength(chars);
    let group: Text[] = [];
    let baselineKey: number | null = null;

    const flush = (): void => {
      if (!group.length) return;
      let ink: number[] = [];
      for (const glyph of group) ink = unionBounds(ink, probeGlyph(glyph));
      if (ink.length >= 4) onLine(ink, group[0]);
      group = [];
    };

    for (let i = 0; i < length; i++) {
      const character = chars?.item?.(i) as Text | null;
      if (!character || characterLooksEmpty(character)) continue;
      const baseline = readNumber(() => character.baseline);
      if (baseline == null) continue;
      const key = Math.round(baseline);
      if (baselineKey != null && Math.abs(key - baselineKey) > 2) flush();
      baselineKey = key;
      group.push(character);
    }
    flush();
  } catch {
    // sem geometria de glifo — não denuncia o bloco inteiro
  }
}

function grayInkSitsOnColoredElement(
  ink: number[],
  frames: PageItem[],
  snaps: ItemSnap[],
  pageName: string
): boolean {
  if (ink.length < 4) return false;

  for (const other of snaps) {
    if (other.utility) continue;
    if (!other.coloredFill && !other.hasGraphic) continue;
    if (isTextFrameItem(other.item) && !other.hasGraphic) continue;
    if (frames.some((frame) => other.item === frame)) continue;
    if (pageName && other.pageName && other.pageName !== pageName) continue;
    if (inkSitsOnColor(ink, other.bounds)) return true;
  }

  return false;
}

export class CinzaOverprintValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CINZA_OVERPRINT;
  readonly name = "Cinza sobre fundo colorido";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const snaps: ItemSnap[] = [];

      walkDirectPageItems(doc, (item, _page, pageName) => {
        if (!item?.isValid) return;
        const fill = readItemFill(item);
        const leaked = textFrameFillLeaksFromContents(item);
        const shape = isFilledShape(item);
        snaps.push({
          item,
          pageName,
          bounds: readBounds(item),
          utility: isPluginGeneratedItem(item),
          coloredFill: (shape || (!isTextFrameItem(item) && !leaked)) && isColoredBackgroundFill(fill, readFillTint(item)),
          hasGraphic: itemHasPlacedGraphic(item),
        });
      });

      try {
        for (const graphic of collectGraphics(doc)) {
          const pageItem = graphic.pageItem;
          if (!pageItem?.isValid) continue;
          const bounds = readBounds(pageItem);
          if (bounds.length < 4) continue;
          snaps.push({
            item: pageItem,
            pageName: graphic.pageName,
            bounds,
            utility: isPluginGeneratedItem(pageItem),
            coloredFill: false,
            hasGraphic: true,
          });
        }
      } catch {
        // collectGraphics pode falhar em documentos corrompidos
      }

      const seen = new Set<string>();

      const reportSpan = (span: Text, pageName: string): void => {
        const preview = snippetOf(span);
        const ink = readSpanInkBounds(span);
        const key = `${pageName}::${preview}::${ink.map((value) => value.toFixed(1)).join(",")}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({
          message: "Cinza sobre fundo colorido sem overprint",
          page: pageName,
          object: preview ? `Texto (“${preview}”)` : "Texto cinza",
          details: FIX_DETAILS,
        });
      };

      forEachCollectionItem<Story>(doc.stories, (story) => {
        if (!story?.isValid) return;
        try {
          if (isPluginUtilityLayerName(story.itemLayer?.name || "")) return;
        } catch {
          // ignore
        }

        forEachCollectionRun(story.textStyleRanges, (run) => {
          if (!targetIsGrayWithoutOverprint(run)) return;
          const frames = collectParentFrames(run).filter((frame) => !isPluginGeneratedItem(frame));
          if (!frames.length && !findParentCell(run)) return;

          let pageName = "";
          for (const frame of frames) {
            pageName = resolveFramePageName(frame, snaps);
            if (pageName) break;
          }

          if (frames.some((frame) => frameIsChromaticBox(frame)) || cellIsChromaticBackground(findParentCell(run))) {
            reportSpan(run as Text, pageName);
            return;
          }

          forEachLineInk(run, (ink, span) => {
            if (!targetIsGrayWithoutOverprint(span)) return;
            const spanFrames = collectParentFrames(span);
            const parents = spanFrames.length ? spanFrames : frames;
            const spanPage = parents.reduce((found, frame) => found || resolveFramePageName(frame, snaps), pageName);
            if (grayInkSitsOnColoredElement(ink, parents, snaps, spanPage)) {
              reportSpan(span, spanPage);
            }
          });
        });
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

import type { Cell, Color, Document, Page, PageItem, Story, Swatch, Text, TextStyleRange } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { isPluginGeneratedItem, isPluginUtilityLayerName } from "../utils/editorial-layer";
import { readPageItemId } from "../utils/page-item-reveal";
import {
  fillsLookSame,
  isColoredBackgroundFill,
  isGrayFill,
  isNoneOrPaperFill,
  isTextFrameItem,
  isWhiteFill,
  readEffectiveFillTint,
  readFillTint,
  readItemFill,
  readLocalFillColor,
  textFillHasOverprint,
  textFrameFillLeaksFromContents,
} from "../utils/fill-color";
import { walkDirectPageItems } from "../utils/indesign-helpers";

const FIX_DETAILS =
  "Valide manualmente: se o cinza estiver sobre fundo colorido, aplique overprint. Preferência: preto 100%.";

interface FillSnap {
  bounds: number[];
  itemId: number | null;
  area: number;
  color: boolean;
}

function readBounds(item: PageItem): number[] {
  try {
    const bounds = item.geometricBounds;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      return bounds.map((value) => Number(value));
    }
  } catch {
    // ignore
  }
  return [];
}

function boundsArea(bounds: number[]): number {
  if (bounds.length < 4) return 0;
  return Math.abs(Number(bounds[2]) - Number(bounds[0])) * Math.abs(Number(bounds[3]) - Number(bounds[1]));
}

function readPageBounds(page: Page | null): number[] {
  if (!page) return [];
  try {
    const bounds = page.bounds;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      return bounds.map((value) => Number(value));
    }
  } catch {
    // ignore
  }
  return [];
}

function isPageSized(bounds: number[], page: Page | null): boolean {
  const pageArea = boundsArea(readPageBounds(page));
  const itemArea = boundsArea(bounds);
  return pageArea > 0 && itemArea / pageArea >= 0.5;
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

function itemIdOf(item: PageItem | null): number | null {
  if (!item) return null;
  try {
    const id = item.id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

function typeNameOf(item: PageItem): string {
  try {
    return item.constructor?.name || "";
  } catch {
    return "";
  }
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

function inkSitsOnFill(ink: number[], background: number[]): boolean {
  const area = overlapArea(ink, background);
  if (area <= 0.5) return false;
  const inkW = Math.abs(Number(ink[3]) - Number(ink[1]));
  const inkH = Math.abs(Number(ink[2]) - Number(ink[0]));
  const inkArea = Math.max(0.5, inkW * inkH);
  if (area / inkArea < 0.7) return false;
  const cy = (Number(ink[0]) + Number(ink[2])) / 2;
  const cx = (Number(ink[1]) + Number(ink[3])) / 2;
  return (
    cy >= Number(background[0]) &&
    cy <= Number(background[2]) &&
    cx >= Number(background[1]) &&
    cx <= Number(background[3])
  );
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

function probeRangeEnds(range: TextStyleRange | Text): number[][] {
  const probes: number[][] = [];
  try {
    const chars = (range as Text).characters;
    const length = getCollectionLength(chars);
    if (length <= 0) return probes;
    const first = getCollectionItem<Text>(chars, 0);
    const last = length > 1 ? getCollectionItem<Text>(chars, length - 1) : first;
    const a = probeGlyph(first);
    const b = length > 1 ? probeGlyph(last) : [];
    if (a.length >= 4) probes.push(a);
    if (b.length >= 4) probes.push(b);
  } catch {
    // ignore
  }
  return probes;
}

function sampleInkFill(target: TextStyleRange | Text): {
  fill: ReturnType<typeof readLocalFillColor>;
  tint: number;
} {
  try {
    const chars = (target as Text).characters;
    const length = getCollectionLength(chars);
    if (length > 0) {
      const first = getCollectionItem<Text>(chars, 0);
      const last = length > 1 ? getCollectionItem<Text>(chars, length - 1) : first;
      for (const character of [first, last]) {
        if (!character) continue;
        const fill = readLocalFillColor(character);
        if (fill) return { fill, tint: readEffectiveFillTint(character) };
      }
    }
  } catch {
    // ignore
  }
  return { fill: readLocalFillColor(target), tint: readEffectiveFillTint(target) };
}

function targetIsGrayWithoutOverprint(target: TextStyleRange | Text): boolean {
  const sampled = sampleInkFill(target);
  if (!sampled.fill) return false;
  const tint = sampled.tint < 0 ? 100 : sampled.tint;
  if (!isGrayFill(sampled.fill, tint)) return false;
  if (textFillHasOverprint(target)) return false;
  try {
    const first = getCollectionItem<Text>((target as Text).characters, 0);
    if (first && textFillHasOverprint(first)) return false;
  } catch {
    // ignore
  }
  return true;
}

function firstParentFrame(range: TextStyleRange | Text): PageItem | null {
  try {
    const item = getCollectionItem<PageItem>((range as Text).parentTextFrames, 0);
    if (item?.isValid) return item;
  } catch {
    // ignore
  }
  try {
    const frames = (range as Text & { parentTextFrames?: unknown }).parentTextFrames;
    if (Array.isArray(frames) && frames[0]) return frames[0] as PageItem;
  } catch {
    // ignore
  }
  return null;
}

function pageNameOf(frame: PageItem | null): string {
  if (!frame) return "";
  try {
    const parentPage = frame.parentPage;
    if (parentPage && typeof parentPage === "object" && parentPage.name) {
      return parentPage.name;
    }
  } catch {
    // ignore
  }
  return "";
}

function findParentCell(range: TextStyleRange | Text): Cell | null {
  let current: unknown = range;
  for (let depth = 0; depth < 8; depth++) {
    if (!current || typeof current !== "object") return null;
    try {
      if (/^cell$/i.test((current as { constructor?: { name?: string } }).constructor?.name || "")) {
        return current as Cell;
      }
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

function snippetOf(range: TextStyleRange | Text): string {
  try {
    const raw = String((range as { contents?: string }).contents || "")
      .replace(/\s+/g, " ")
      .trim();
    return raw.slice(0, 52);
  } catch {
    return "";
  }
}

function readStrokeWeight(item: PageItem): number {
  try {
    const weight = Number(item.strokeWeight);
    return Number.isFinite(weight) ? weight : 0;
  } catch {
    return 0;
  }
}

function readStrokeFill(item: PageItem): Swatch | Color | null {
  try {
    return item.strokeColor || null;
  } catch {
    return null;
  }
}

function isPlacedGraphic(item: PageItem): boolean {
  return /image|eps|pdf|pict|wmf|importedpage/i.test(typeNameOf(item));
}

function isFilledShape(item: PageItem): boolean {
  return /rectangle|oval|polygon/i.test(typeNameOf(item));
}

function isStrokeCopiedAsFill(item: PageItem, fill: Swatch | Color | string | null): boolean {
  if (readStrokeWeight(item) <= 0.05) return false;
  const stroke = readStrokeFill(item);
  if (!stroke || isNoneOrPaperFill(stroke)) return false;
  return fillsLookSame(fill, stroke);
}

type FillKind = "none" | "white" | "color";

function classifyItemFill(item: PageItem, bounds: number[], page: Page | null): FillKind {
  if (isPlacedGraphic(item)) return "color";
  if (isTextFrameItem(item) && textFrameFillLeaksFromContents(item)) return "none";

  const fill = readItemFill(item);
  const tint = readFillTint(item);
  if (tint <= 0.5 || isNoneOrPaperFill(fill)) return "none";
  if (isWhiteFill(fill, tint)) return "white";
  if (!isColoredBackgroundFill(fill, tint)) return "none";
  if (isPageSized(bounds, page) && isStrokeCopiedAsFill(item, fill)) return "none";
  return "color";
}

function innermostCover(ink: number[], snaps: FillSnap[]): FillSnap | null {
  let best: FillSnap | null = null;
  for (const snap of snaps) {
    if (!inkSitsOnFill(ink, snap.bounds)) continue;
    if (!best || snap.area < best.area) best = snap;
  }
  return best;
}

function glyphSitsOnColor(probes: number[][], snaps: FillSnap[]): boolean {
  return probes.some((ink) => innermostCover(ink, snaps)?.color === true);
}

function pushFill(bucket: FillSnap[], item: PageItem, page: Page | null): void {
  if (!item?.isValid || isPluginGeneratedItem(item)) return;
  if (!isPlacedGraphic(item) && !isFilledShape(item) && !isTextFrameItem(item)) return;
  const bounds = readBounds(item);
  if (bounds.length < 4) return;
  const kind = classifyItemFill(item, bounds, page);
  if (kind === "none") return;
  bucket.push({
    bounds,
    itemId: itemIdOf(item),
    area: boundsArea(bounds),
    color: kind === "color",
  });
}

function collectFillsByPage(doc: Document): Map<string, FillSnap[]> {
  const byPage = new Map<string, FillSnap[]>();
  walkDirectPageItems(doc, (item, page, pageName) => {
    if (!pageName) return;
    let list = byPage.get(pageName);
    if (!list) {
      list = [];
      byPage.set(pageName, list);
    }
    pushFill(list, item, page);
  });
  return byPage;
}

function pushIssue(
  issues: ValidationIssue[],
  seen: Set<string>,
  key: string,
  page: string,
  preview: string,
  item?: { id?: number } | null
): void {
  if (seen.has(key)) return;
  seen.add(key);
  issues.push({
    message: "Cinza sobre fundo colorido sem overprint",
    page,
    object: preview ? `Texto (“${preview}”)` : "Texto cinza",
    details: FIX_DETAILS,
    severity: "warning",
    itemId: readPageItemId(item),
  });
}

export class CinzaOverprintValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CINZA_OVERPRINT;
  readonly name = "Cinza sobre fundo colorido";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const fillsByPage = collectFillsByPage(doc);
      const seen = new Set<string>();

      forEachCollectionItem<Story>(doc.stories, (story) => {
        if (!story?.isValid) return;
        try {
          if (isPluginUtilityLayerName(story.itemLayer?.name || "")) return;
        } catch {
          // ignore
        }

        const ranges = story.textStyleRanges;
        const rangeCount = getCollectionLength(ranges);
        for (let i = 0; i < rangeCount; i++) {
          const run = getCollectionItem<TextStyleRange | Text>(ranges, i);
          if (!run || !targetIsGrayWithoutOverprint(run)) continue;

          const preview = snippetOf(run);
          if (!preview) continue;

          const cell = findParentCell(run);
          if (cell) {
            try {
              if (isColoredBackgroundFill(cell.fillColor, readFillTint(cell))) {
                const pageName = pageNameOf(firstParentFrame(run));
                pushIssue(issues, seen, `cell::${pageName}::${preview}`, pageName, preview, firstParentFrame(run));
              }
            } catch {
              // ignore
            }
            continue;
          }

          const frame = firstParentFrame(run);
          if (!frame || isPluginGeneratedItem(frame)) continue;
          const pageName = pageNameOf(frame);
          const snaps = fillsByPage.get(pageName);
          if (!snaps?.length) continue;

          const probes = probeRangeEnds(run);
          if (!probes.length) continue;
          if (!glyphSitsOnColor(probes, snaps)) continue;

          pushIssue(issues, seen, `${pageName}::${preview}`, pageName, preview, frame);
        }
      });

      return createResult(this.id, this.name, issues, "warning");
    });
  }
}

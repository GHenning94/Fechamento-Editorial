import type { Cell, Document, PageItem, Story, Text, TextStyleRange } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { isPluginGeneratedItem, isPluginUtilityLayerName } from "../utils/editorial-layer";
import {
  geometricBoundsOverlap,
  isColoredBackgroundFill,
  isGrayFill,
  isTextFrameItem,
  readEffectiveFillTint,
  readFillTint,
  readItemFill,
  readLocalFillColor,
  textFillHasOverprint,
  textFrameFillLeaksFromContents,
} from "../utils/fill-color";
import { walkDirectPageItems } from "../utils/indesign-helpers";

const FIX_DETAILS =
  "Aplique overprint no preenchimento do texto cinza. Preferência: preto 100%.";

interface ColoredSnap {
  bounds: number[];
  itemId: number | null;
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

function inkSitsOnColor(ink: number[], background: number[]): boolean {
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

function itemHasRealColorFill(item: PageItem): boolean {
  const fill = readItemFill(item);
  const tint = readFillTint(item);
  if (!isColoredBackgroundFill(fill, tint)) return false;
  if (isTextFrameItem(item) && textFrameFillLeaksFromContents(item)) return false;
  return true;
}

function isPlacedGraphic(item: PageItem): boolean {
  return /image|eps|pdf|pict|wmf|importedpage/i.test(typeNameOf(item));
}

function isFilledShape(item: PageItem): boolean {
  return /rectangle|oval|polygon/i.test(typeNameOf(item));
}

function pushColored(bucket: ColoredSnap[], item: PageItem): void {
  if (!item?.isValid || isPluginGeneratedItem(item)) return;
  const bounds = readBounds(item);
  if (bounds.length < 4) return;
  if (isPlacedGraphic(item)) {
    bucket.push({ bounds, itemId: itemIdOf(item) });
    return;
  }
  if (!isFilledShape(item) && !isTextFrameItem(item)) return;
  if (!itemHasRealColorFill(item)) return;
  bucket.push({ bounds, itemId: itemIdOf(item) });
}

function collectColoredByPage(doc: Document): Map<string, ColoredSnap[]> {
  const byPage = new Map<string, ColoredSnap[]>();
  walkDirectPageItems(doc, (item, _page, pageName) => {
    if (!pageName) return;
    let list = byPage.get(pageName);
    if (!list) {
      list = [];
      byPage.set(pageName, list);
    }
    pushColored(list, item);
  });
  return byPage;
}

function pushIssue(
  issues: ValidationIssue[],
  seen: Set<string>,
  key: string,
  page: string,
  preview: string
): void {
  if (seen.has(key)) return;
  seen.add(key);
  issues.push({
    message: "Cinza sobre fundo colorido sem overprint",
    page,
    object: preview ? `Texto (“${preview}”)` : "Texto cinza",
    details: FIX_DETAILS,
  });
}

export class CinzaOverprintValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CINZA_OVERPRINT;
  readonly name = "Cinza sobre fundo colorido";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const coloredByPage = collectColoredByPage(doc);
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
                pushIssue(issues, seen, `cell::${pageName}::${preview}`, pageName, preview);
              }
            } catch {
              // ignore
            }
            continue;
          }

          const frame = firstParentFrame(run);
          if (!frame || isPluginGeneratedItem(frame)) continue;
          const pageName = pageNameOf(frame);

          if (itemHasRealColorFill(frame)) {
            pushIssue(issues, seen, `box::${pageName}::${preview}`, pageName, preview);
            continue;
          }

          const snaps = coloredByPage.get(pageName);
          if (!snaps?.length) continue;
          const frameBounds = readBounds(frame);
          if (frameBounds.length < 4) continue;
          const frameId = itemIdOf(frame);
          const nearby = snaps.filter(
            (snap) => snap.itemId !== frameId && geometricBoundsOverlap(frameBounds, snap.bounds)
          );
          if (!nearby.length) continue;

          const probes = probeRangeEnds(run);
          if (!probes.length) continue;
          if (!probes.some((ink) => nearby.some((snap) => inkSitsOnColor(ink, snap.bounds)))) continue;

          pushIssue(issues, seen, `${pageName}::${preview}`, pageName, preview);
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

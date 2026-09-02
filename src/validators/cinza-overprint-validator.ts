import type { Cell, Document, Page, PageItem, Story, Text, TextStyleRange } from "indesign";
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
  readFillTint,
  readItemFill,
  readLocalFillColor,
  textFillHasOverprint,
  textFrameFillLeaksFromContents,
} from "../utils/fill-color";
import { forEachPage } from "../utils/indesign-helpers";

const FIX_DETAILS =
  "Aplique overprint no preenchimento do texto cinza. Preferência: preto 100%.";

interface ColoredSnap {
  bounds: number[];
  pageName: string;
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
  if (area <= 0.35) return false;
  const inkW = Math.abs(Number(ink[3]) - Number(ink[1]));
  const inkH = Math.abs(Number(ink[2]) - Number(ink[0]));
  const inkArea = Math.max(0.35, inkW * inkH);
  if (area / inkArea < 0.45) return false;
  const cy = (Number(ink[0]) + Number(ink[2])) / 2;
  const cx = (Number(ink[1]) + Number(ink[3])) / 2;
  return (
    cy >= Number(background[0]) &&
    cy <= Number(background[2]) &&
    cx >= Number(background[1]) &&
    cx <= Number(background[3])
  );
}

function typeNameOf(item: PageItem): string {
  try {
    return item.constructor?.name || "";
  } catch {
    return "";
  }
}

function isFilledShape(item: PageItem): boolean {
  return /rectangle|oval|polygon/i.test(typeNameOf(item));
}

function isPlacedGraphic(item: PageItem): boolean {
  return /image|eps|pdf|pict|wmf|importedpage/i.test(typeNameOf(item));
}

function fillNameKey(fill: { name?: string } | string | null | undefined): string {
  try {
    const name = typeof fill === "string" ? fill : fill?.name || "";
    return name
      .trim()
      .replace(/^\$id\//i, "")
      .replace(/^\[|\]$/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  } catch {
    return "";
  }
}

function targetIsGrayWithoutOverprint(target: TextStyleRange | Text): boolean {
  const fill = readLocalFillColor(target);
  if (!fill) return false;
  const tintRaw = readFillTint(target);
  const tint = tintRaw < 0 ? 100 : tintRaw;
  const key = fillNameKey(fill);
  if (!key || key === "none" || key === "nenhum" || key === "nenhuma" || key === "paper" || key === "papel") {
    return false;
  }
  if ((key === "black" || key === "preto") && tint >= 99.5) return false;
  if (!isGrayFill(fill, tint)) return false;
  return !textFillHasOverprint(target);
}

function firstParentFrame(range: TextStyleRange | Text): PageItem | null {
  try {
    const frames = (range as Text).parentTextFrames;
    const item = getCollectionItem<PageItem>(frames, 0);
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

function frameIsChromaticBox(frame: PageItem | null): boolean {
  if (!frame || !isTextFrameItem(frame) || isPluginGeneratedItem(frame)) return false;
  if (textFrameFillLeaksFromContents(frame)) return false;
  return isColoredBackgroundFill(readItemFill(frame), readFillTint(frame));
}

function snippetOf(range: TextStyleRange | Text): string {
  try {
    const chars = (range as Text).characters;
    const length = Math.min(getCollectionLength(chars), 36);
    let out = "";
    for (let i = 0; i < length; i++) {
      const character = chars?.item?.(i);
      if (!character) continue;
      try {
        const piece = (character as { contents?: string }).contents;
        if (typeof piece === "string") out += piece;
      } catch {
        // ignore
      }
      if (out.length >= 52) break;
    }
    return out.replace(/\s+/g, " ").trim().slice(0, 52);
  } catch {
    return "";
  }
}

function probeRangeEnds(range: TextStyleRange | Text): number[][] {
  const probes: number[][] = [];
  try {
    const chars = (range as Text).characters;
    const length = getCollectionLength(chars);
    if (length <= 0) return probes;
    const first = getCollectionItem<Text>(chars, 0);
    const last = getCollectionItem<Text>(chars, length - 1);
    const a = probeGlyph(first);
    const b = length > 1 ? probeGlyph(last) : [];
    if (a.length >= 4) probes.push(a);
    if (b.length >= 4) probes.push(b);
  } catch {
    // ignore
  }
  return probes;
}

function pushColored(bucket: ColoredSnap[], item: PageItem, pageName: string): void {
  if (!item?.isValid || isPluginGeneratedItem(item) || isTextFrameItem(item)) return;
  const bounds = readBounds(item);
  if (bounds.length < 4) return;
  if (isFilledShape(item) && isColoredBackgroundFill(readItemFill(item), readFillTint(item))) {
    bucket.push({ bounds, pageName });
    return;
  }
  if (isPlacedGraphic(item)) {
    bucket.push({ bounds, pageName });
  }
}

function collectColoredByPage(doc: Document): Map<string, ColoredSnap[]> {
  const byPage = new Map<string, ColoredSnap[]>();

  const add = (item: PageItem, pageName: string): void => {
    if (!pageName) return;
    let list = byPage.get(pageName);
    if (!list) {
      list = [];
      byPage.set(pageName, list);
    }
    pushColored(list, item, pageName);
    try {
      const children = item.pageItems;
      const n = Math.min(getCollectionLength(children), 40);
      for (let i = 0; i < n; i++) {
        const child = getCollectionItem<PageItem>(children, i);
        if (child) pushColored(list, child, pageName);
      }
    } catch {
      // ignore
    }
  };

  forEachPage(doc, (page: Page, pageName: string) => {
    forEachCollectionItem<PageItem>(page.pageItems, (item) => add(item, pageName));
    try {
      forEachCollectionItem<PageItem>((page as Page & { masterPageItems?: unknown }).masterPageItems, (item) =>
        add(item, pageName)
      );
    } catch {
      // ignore
    }
  });

  return byPage;
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

          const cell = findParentCell(run);
          if (cell) {
            try {
              if (isColoredBackgroundFill(cell.fillColor, readFillTint(cell))) {
                const preview = snippetOf(run);
                const key = `cell::${pageNameOf(firstParentFrame(run))}::${preview}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  issues.push({
                    message: "Cinza sobre fundo colorido sem overprint",
                    page: pageNameOf(firstParentFrame(run)),
                    object: preview ? `Texto (“${preview}”)` : "Texto cinza",
                    details: FIX_DETAILS,
                  });
                }
              }
            } catch {
              // ignore
            }
            continue;
          }

          const frame = firstParentFrame(run);
          if (!frame || isPluginGeneratedItem(frame)) continue;
          const pageName = pageNameOf(frame);

          if (frameIsChromaticBox(frame)) {
            const preview = snippetOf(run);
            const key = `box::${pageName}::${preview}`;
            if (seen.has(key)) continue;
            seen.add(key);
            issues.push({
              message: "Cinza sobre fundo colorido sem overprint",
              page: pageName,
              object: preview ? `Texto (“${preview}”)` : "Texto cinza",
              details: FIX_DETAILS,
            });
            continue;
          }

          const snaps = coloredByPage.get(pageName);
          if (!snaps?.length) continue;
          const frameBounds = readBounds(frame);
          if (frameBounds.length < 4) continue;
          const nearby = snaps.filter((snap) => geometricBoundsOverlap(frameBounds, snap.bounds));
          if (!nearby.length) continue;

          const probes = probeRangeEnds(run);
          const hits = probes.some((ink) => nearby.some((snap) => inkSitsOnColor(ink, snap.bounds)));
          if (!hits) continue;

          const preview = snippetOf(run);
          const key = `${pageName}::${preview}`;
          if (seen.has(key)) continue;
          seen.add(key);
          issues.push({
            message: "Cinza sobre fundo colorido sem overprint",
            page: pageName,
            object: preview ? `Texto (“${preview}”)` : "Texto cinza",
            details: FIX_DETAILS,
          });
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

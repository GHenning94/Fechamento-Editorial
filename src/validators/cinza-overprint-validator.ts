import type { Document, PageItem, Story, Text, TextStyleRange } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { isPluginGeneratedItem, isPluginUtilityLayerName } from "../utils/editorial-layer";
import {
  fillsLookSame,
  geometricBoundsOverlap,
  isChromaticFill,
  isColoredBackgroundFill,
  isGrayFill,
  itemHasPlacedGraphic,
  readFillTint,
  readItemFill,
  readLocalFillColor,
  textFillHasOverprint,
} from "../utils/fill-color";
import { collectGraphics, getPageItemDisplayName, walkDirectPageItems } from "../utils/indesign-helpers";

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

function isUtilityItem(item: PageItem): boolean {
  return isPluginGeneratedItem(item);
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

function readTextInkBounds(range: TextStyleRange | Text): number[] {
  const text = range as Text;
  const left = readNumber(() => text.horizontalOffset);
  const right = readNumber(() => text.endHorizontalOffset);
  const baseline = readNumber(() => text.baseline);
  const endBaseline = readNumber(() => text.endBaseline) ?? baseline;
  const pointSize = readNumber(() => text.pointSize) || 12;
  const ascent = readNumber(() => text.ascent) ?? pointSize * 0.8;
  const descent = readNumber(() => text.descent) ?? pointSize * 0.25;

  if (left != null && right != null && baseline != null && Math.abs(right - left) > 0.2) {
    const top = Math.min(baseline, endBaseline ?? baseline) - ascent;
    const bottom = Math.max(baseline, endBaseline ?? baseline) + descent;
    if (bottom > top) return [top, Math.min(left, right), bottom, Math.max(left, right)];
  }

  try {
    const chars = text.characters;
    const length = getCollectionLength(chars);
    if (length <= 0) return [];
    const first = chars?.item?.(0);
    const last = chars?.item?.(length - 1);
    const x1 = readNumber(() => (first as Text)?.horizontalOffset);
    const x2 = readNumber(() => (last as Text)?.endHorizontalOffset) ?? readNumber(() => (last as Text)?.horizontalOffset);
    const y = readNumber(() => (first as Text)?.baseline);
    const size = readNumber(() => (first as Text)?.pointSize) || pointSize;
    if (x1 != null && y != null) {
      const rightEdge = x2 != null && Math.abs(x2 - x1) > 0.2 ? Math.max(x1, x2) : x1 + size * Math.min(length, 24) * 0.5;
      return [y - size, Math.min(x1, rightEdge), y + size * 0.35, Math.max(x1, rightEdge)];
    }
  } catch {
    // sem fallback no quadro inteiro — isso gerava falso positivo
  }

  return [];
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
  if (area <= 0.5) return false;
  const inkW = Math.abs(Number(ink[3]) - Number(ink[1]));
  const inkH = Math.abs(Number(ink[2]) - Number(ink[0]));
  const inkArea = Math.max(0.5, inkW * inkH);
  if (area / inkArea < 0.5) return false;
  const cy = (Number(ink[0]) + Number(ink[2])) / 2;
  const cx = (Number(ink[1]) + Number(ink[3])) / 2;
  return boundsContainPoint(background, cy, cx);
}

function forEachTextRun(collection: unknown, onRun: (run: TextStyleRange | Text) => void): void {
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
    if (typeof contents === "string") {
      return contents.trim() === "";
    }
  } catch {
    // UXP muitas vezes não expõe contents
  }
  return false;
}

function sampleLocalFills(range: TextStyleRange | Text): Array<{ fill: ReturnType<typeof readLocalFillColor>; tint: number }> {
  const samples: Array<{ fill: ReturnType<typeof readLocalFillColor>; tint: number }> = [];
  const seen = new Set<string>();
  const push = (fill: ReturnType<typeof readLocalFillColor>, tint: number): void => {
    if (!fill) return;
    const key = `${String((fill as { name?: string }).name || fill)}::${tint}`;
    if (seen.has(key)) return;
    seen.add(key);
    samples.push({ fill, tint });
  };

  try {
    const chars = (range as Text).characters;
    const length = Math.min(getCollectionLength(chars), 16);
    for (let i = 0; i < length; i++) {
      const character = chars?.item?.(i);
      if (!character) continue;
      push(readLocalFillColor(character), readFillTint(character));
    }
  } catch {
    // ignore
  }

  push(readLocalFillColor(range), readFillTint(range));
  return samples;
}

function rangeIsGrayWithoutOverprint(range: TextStyleRange | Text): boolean {
  if (rangeLooksEmpty(range)) return false;

  try {
    const samples = sampleLocalFills(range);
    if (!samples.length) return false;
    if (samples.some((sample) => sample.fill && isChromaticFill(sample.fill, sample.tint))) {
      return false;
    }
    if (!samples.some((sample) => sample.fill && isGrayFill(sample.fill, sample.tint))) {
      return false;
    }
    return !textFillHasOverprint(range);
  } catch {
    return false;
  }
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
    forEachTextRun((range as Text).parentTextFrames, (item) => push(item as PageItem));
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

function isLikelyIcon(bounds: number[]): boolean {
  if (!bounds || bounds.length < 4) return false;
  const width = Math.abs(Number(bounds[3]) - Number(bounds[1]));
  const height = Math.abs(Number(bounds[2]) - Number(bounds[0]));
  return width < 36 && height < 36;
}

function grayTextSitsOnColoredBackground(
  range: TextStyleRange | Text,
  frame: PageItem,
  snaps: ItemSnap[],
  pageName: string
): boolean {
  if (isUtilityItem(frame)) return false;

  const samples = sampleLocalFills(range);
  const frameFill = readItemFill(frame);
  const frameTint = readFillTint(frame);
  const frameMatchesText = samples.some((sample) => sample.fill && fillsLookSame(frameFill, sample.fill));
  if (isColoredBackgroundFill(frameFill, frameTint) && !frameMatchesText) {
    return true;
  }

  const ink = readTextInkBounds(range);
  if (ink.length < 4) return false;

  for (const other of snaps) {
    if (other.item === frame) continue;
    if (other.utility) continue;
    if (!other.coloredFill && !other.hasGraphic) continue;
    if (isLikelyIcon(other.bounds)) continue;
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
        snaps.push({
          item,
          pageName,
          bounds: readBounds(item),
          utility: isUtilityItem(item),
          coloredFill: isColoredBackgroundFill(fill, readFillTint(item)),
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
            utility: isUtilityItem(pageItem),
            coloredFill: false,
            hasGraphic: true,
          });
        }
      } catch {
        // collectGraphics pode falhar em documentos corrompidos
      }

      const seen = new Set<string>();

      const reportFrame = (frame: PageItem): void => {
        if (isUtilityItem(frame)) return;
        const pageName = resolveFramePageName(frame, snaps);
        const objectName = getPageItemDisplayName(frame);
        const bounds = readBounds(frame);
        const key = `${pageName}::${objectName}::${bounds.join(",")}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({
          message: "Cinza sobre fundo colorido sem overprint",
          page: pageName,
          object: objectName,
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

        const consider = (run: TextStyleRange | Text): void => {
          if (!rangeIsGrayWithoutOverprint(run)) return;
          const frames = collectParentFrames(run);
          if (frames.length === 0) return;
          for (const frame of frames) {
            const pageName = resolveFramePageName(frame, snaps);
            if (grayTextSitsOnColoredBackground(run, frame, snaps, pageName)) {
              reportFrame(frame);
            }
          }
        };

        try {
          forEachTextRun(story.textStyleRanges, consider);
        } catch {
          // ignore
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

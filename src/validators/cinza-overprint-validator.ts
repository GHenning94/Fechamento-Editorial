import type { Document, PageItem, Story, Text, TextStyleRange } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { isPluginGeneratedItem, isPluginUtilityLayerName } from "../utils/editorial-layer";
import {
  geometricBoundsOverlap,
  isColoredBackgroundFill,
  isGrayFill,
  itemHasPlacedGraphic,
  readEffectiveFillColor,
  readEffectiveFillTint,
  readFillTint,
  readItemFill,
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

function readTextInkBounds(range: TextStyleRange | Text, frame: PageItem): number[] {
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
    const first = text.characters?.item?.(0);
    const length = getCollectionLength(text.characters);
    const last = length > 0 ? text.characters?.item?.(length - 1) : first;
    const x1 = readNumber(() => (first as Text)?.horizontalOffset);
    const x2 = readNumber(() => (last as Text)?.horizontalOffset);
    const y = readNumber(() => (first as Text)?.baseline);
    const size = readNumber(() => (first as Text)?.pointSize) || pointSize;
    if (x1 != null && y != null) {
      const rightEdge = x2 != null && x2 >= x1 ? x2 + size * 0.5 : x1 + size;
      return [y - size, x1, y + size * 0.3, rightEdge];
    }
  } catch {
    // fallback no quadro
  }

  return readBounds(frame);
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
  return area / inkArea >= 0.35;
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
    if (typeof contents === "string" && contents.length > 0) {
      return contents.trim() === "";
    }
  } catch {
    // UXP muitas vezes não expõe contents
  }
  return false;
}

function rangeIsGrayWithoutOverprint(range: TextStyleRange | Text): boolean {
  if (rangeLooksEmpty(range)) return false;

  try {
    const targets: Array<TextStyleRange | Text | { fillColor?: unknown; fillTint?: number }> = [range];
    try {
      const first = (range as Text).characters?.item?.(0);
      if (first) targets.unshift(first);
    } catch {
      // ignore
    }

    const isGray = targets.some((target) =>
      isGrayFill(readEffectiveFillColor(target as Text), readEffectiveFillTint(target as Text))
    );
    if (!isGray) return false;
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

function grayTextSitsOnColoredBackground(
  range: TextStyleRange | Text,
  frame: PageItem,
  snaps: ItemSnap[]
): boolean {
  if (isUtilityItem(frame)) return false;

  const fill = readItemFill(frame);
  if (isColoredBackgroundFill(fill, readFillTint(frame))) return true;

  const ink = readTextInkBounds(range, frame);
  if (ink.length < 4) return false;

  for (const other of snaps) {
    if (other.item === frame) continue;
    if (other.utility) continue;
    if (!other.coloredFill && !other.hasGraphic) continue;
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
            if (grayTextSitsOnColoredBackground(run, frame, snaps)) {
              reportFrame(frame);
            }
          }
        };

        try {
          forEachTextRun(story.textStyleRanges, consider);
        } catch {
          // ignore
        }
        try {
          forEachTextRun(story.paragraphs, consider);
        } catch {
          // ignore
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

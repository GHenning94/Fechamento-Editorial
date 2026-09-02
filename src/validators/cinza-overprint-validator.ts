import type { Document, PageItem, Story, Text, TextStyleRange } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { isPluginUtilityLayerName } from "../utils/editorial-layer";
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
  try {
    return isPluginUtilityLayerName(item.itemLayer?.name || "");
  } catch {
    return false;
  }
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

function collectParentFrames(range: TextStyleRange | Text, story: Story): PageItem[] {
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

  if (frames.length === 0) {
    try {
      forEachTextRun(story.textContainers, (item) => push(item as PageItem));
    } catch {
      // ignore
    }
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

function frameIsOnColoredBackground(frame: PageItem, snaps: ItemSnap[]): boolean {
  const fill = readItemFill(frame);
  if (isColoredBackgroundFill(fill, readFillTint(frame))) return true;

  const bounds = readBounds(frame);
  if (bounds.length < 4) return false;

  for (const other of snaps) {
    if (other.item === frame) continue;
    if (other.utility) continue;
    if (!other.coloredFill && !other.hasGraphic) continue;
    if (geometricBoundsOverlap(bounds, other.bounds)) return true;
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
          const frames = collectParentFrames(run, story);
          if (frames.length === 0) return;
          for (const frame of frames) {
            if (frameIsOnColoredBackground(frame, snaps)) {
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

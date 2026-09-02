import type { Cell, Document, PageItem, Story, Table, Text, TextStyleRange } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { isPluginUtilityLayerName } from "../utils/editorial-layer";
import {
  geometricBoundsOverlap,
  isColoredBackgroundFill,
  isGrayFill,
  itemHasPlacedGraphic,
  readFillTint,
  readItemFill,
  textFillHasOverprint,
} from "../utils/fill-color";
import { getPageItemDisplayName, walkDirectPageItems } from "../utils/indesign-helpers";

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

function itemHasText(item: PageItem): boolean {
  try {
    const texts = item.texts;
    if (texts && typeof texts.length === "number" && texts.length > 0) return true;
  } catch {
    // ignore
  }
  const typeName = item.constructor?.name || "";
  return typeName === "TextFrame" || typeName === "TextPath";
}

function rangeIsGrayWithoutOverprint(range: TextStyleRange | Text): boolean {
  try {
    const contents = String((range as { contents?: string }).contents || "").trim();
    if (!contents) return false;
  } catch {
    return false;
  }

  try {
    const fill = (range as { fillColor?: TextStyleRange["fillColor"] }).fillColor;
    const tint = readFillTint(range);
    if (!isGrayFill(fill, tint)) return false;
    return !textFillHasOverprint(range);
  } catch {
    return false;
  }
}

function rangesHaveGrayWithoutOverprint(collection: unknown): boolean {
  let found = false;
  forEachCollectionItem<TextStyleRange | Text>(collection, (range) => {
    if (found || !range) return;
    if (rangeIsGrayWithoutOverprint(range)) found = true;
  });
  return found;
}

function cellHasColoredFill(cell: Cell): boolean {
  try {
    return isColoredBackgroundFill(cell.fillColor, readFillTint(cell));
  } catch {
    return false;
  }
}

function itemHasGrayWithoutOverprint(item: PageItem, frameOnColoredBg: boolean): boolean {
  let found = false;

  const consider = (collection: unknown, colored: boolean): void => {
    if (found || !colored) return;
    if (rangesHaveGrayWithoutOverprint(collection)) found = true;
  };

  try {
    forEachCollectionItem<Text>(item.texts, (text) => {
      if (found || !text) return;
      consider(text.textStyleRanges, frameOnColoredBg);
      if (found) return;
      consider(text.paragraphs, frameOnColoredBg);
    });
  } catch {
    // ignore
  }

  try {
    const story = item.parentStory as Story | undefined;
    if (!story?.isValid) return found;

    forEachCollectionItem<Table>(story.tables, (table) => {
      if (found || !table?.isValid) return;
      forEachCollectionItem<Cell>(table.cells, (cell) => {
        if (found || !cell?.isValid) return;
        const colored = frameOnColoredBg || cellHasColoredFill(cell);
        consider(cell.textStyleRanges, colored);
        if (found) return;
        consider(cell.texts, colored);
        if (found) return;
        consider(cell.paragraphs, colored);
      });
    });
  } catch {
    // ignore
  }

  return found;
}

function isOnColoredBackground(snap: ItemSnap, others: ItemSnap[]): boolean {
  if (snap.coloredFill) return true;

  for (const other of others) {
    if (other.item === snap.item) continue;
    if (other.pageName !== snap.pageName) continue;
    if (other.utility) continue;
    if (!other.coloredFill && !other.hasGraphic) continue;
    if (geometricBoundsOverlap(snap.bounds, other.bounds)) return true;
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

      const seen = new Set<string>();

      for (const snap of snaps) {
        if (snap.utility) continue;
        if (!itemHasText(snap.item)) continue;

        const onColored = isOnColoredBackground(snap, snaps);
        if (!itemHasGrayWithoutOverprint(snap.item, onColored)) continue;

        const objectName = getPageItemDisplayName(snap.item);
        const key = `${snap.pageName}::${objectName}::${snap.bounds.join(",")}`;
        if (seen.has(key)) continue;
        seen.add(key);

        issues.push({
          message: "Cinza sobre fundo colorido sem overprint",
          page: snap.pageName,
          object: objectName,
          details: FIX_DETAILS,
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

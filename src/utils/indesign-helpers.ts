import type { Document, Layer, Page, PageItem, Color, Spread } from "indesign";
import { BLEED_MM } from "./constants";
import { PageItemCallback, GraphicInfo, StrokeInfo } from "../models/validator";
import {
  COLOR_CORPROF,
  COLOR_GUIAS_DELETAR,
  SPOT_COLOR_EXCEPTIONS,
} from "./constants";
import { forEachCollectionItem } from "./collection-helpers";
import { getValidationScan } from "../core/validation-cache";
import { getInDesignModule } from "./indesign-runtime";

export { getActiveDocument } from "./indesign-runtime";

export function layerExists(doc: Document, layerName: string): Layer | null {
  try {
    const layer = doc.layers.itemByName(layerName);
    if (layer && layer.isValid) {
      return layer;
    }
  } catch {
    return null;
  }
  return null;
}

export function colorExists(doc: Document, colorName: string): Color | null {
  try {
    const color = doc.colors.itemByName(colorName);
    if (color && color.isValid) {
      return color;
    }
  } catch {
    return null;
  }
  return null;
}

export function getLayerItemCount(layer: Layer): number {
  try {
    return layer.pageItems.length;
  } catch {
    return 0;
  }
}

export function getColorSpaceLabel(space: number): string {
  const { ColorSpace } = getInDesignModule();
  const CS = ColorSpace as { CMYK: number; RGB: number; LAB: number; HSB: number };
  if (space === CS.CMYK) return "CMYK";
  if (space === CS.RGB) return "RGB";
  if (space === CS.LAB) return "LAB";
  if (space === CS.HSB) return "HSB";
  return "Desconhecido";
}

export function getImageColorSpaceLabel(space: number): string {
  const { ImageColorSpace } = getInDesignModule();
  const ICS = ImageColorSpace as { CMYK: number; RGB: number; LAB: number; GRAY: number };
  if (space === ICS.CMYK) return "CMYK";
  if (space === ICS.RGB) return "RGB";
  if (space === ICS.LAB) return "LAB";
  if (space === ICS.GRAY) return "Gray";
  return "Desconhecido";
}

export function isSpotExceptionColor(name: string): boolean {
  const normalized = (name || "").trim().toLowerCase();
  return SPOT_COLOR_EXCEPTIONS.some((exception) => exception.toLowerCase() === normalized);
}

export function isGuideColor(name: string): boolean {
  const normalized = (name || "").trim().toLowerCase();
  return (
    normalized === COLOR_CORPROF.toLowerCase() ||
    normalized === COLOR_GUIAS_DELETAR.toLowerCase()
  );
}

export function getSwatchName(item: PageItem): string {
  try {
    const fill = item.fillColor;
    if (fill && fill.isValid && fill.name) {
      return fill.name;
    }
  } catch {
    // ignore
  }
  return "";
}

export function forEachPage(doc: Document, callback: (page: Page, pageName: string) => void): void {
  forEachCollectionItem<Page>(doc.pages, (page, index) => {
    if (!page || !page.isValid) return;
    const pageName = page.name || `Página ${index + 1}`;
    callback(page, pageName);
  });
}

export function forEachPageItem(
  container: unknown,
  page: Page | null,
  pageName: string,
  callback: PageItemCallback
): void {
  forEachCollectionItem<PageItem>(container, (item) => {
    if (!item || !item.isValid) return;

    callback(item, page, pageName);

    if (item.pageItems && item.pageItems.length > 0) {
      forEachPageItem(item.pageItems, page, pageName, callback);
    }
  });
}

export function walkAllPageItems(doc: Document, callback: PageItemCallback): void {
  forEachPage(doc, (page, pageName) => {
    const items = page.allPageItems || page.pageItems;
    if (items) {
      forEachPageItem(items, page, pageName, callback);
    }
  });
}

/** Percorre apenas objetos pertencentes à página (não inclui itens de outras páginas do spread). */
export function walkDirectPageItems(doc: Document, callback: PageItemCallback): void {
  forEachPage(doc, (page, pageName) => {
    const items = page.pageItems;
    if (items) {
      forEachPageItem(items, page, pageName, callback);
    }
  });
}

export function isItemOnPage(item: PageItem, page: Page): boolean {
  try {
    const parentPage = item.parentPage;
    if (parentPage == null) {
      return false;
    }
    if (typeof parentPage === "number") {
      const { NothingEnum } = getInDesignModule();
      const NOTHING = (NothingEnum as { NOTHING: number }).NOTHING;
      if (parentPage === NOTHING) {
        return false;
      }
      return false;
    }
    if (typeof parentPage.equals === "function") {
      return parentPage.equals(page);
    }
    return parentPage === page;
  } catch {
    return true;
  }
}

function isLeftHandPage(page: Page): boolean {
  try {
    const { PageSideOptions } = getInDesignModule() as {
      PageSideOptions: { LEFT_HAND: number };
    };
    return page.side === PageSideOptions.LEFT_HAND;
  } catch {
    return false;
  }
}

export function isOnPasteboard(item: PageItem): boolean {
  try {
    const { NothingEnum } = getInDesignModule();
    const NOTHING = (NothingEnum as { NOTHING: number }).NOTHING;
    const parentPage = item.parentPage;

    if (typeof parentPage === "object" && parentPage !== null && parentPage.isValid) {
      return false;
    }
    if (parentPage === NOTHING) {
      return true;
    }
    if (typeof parentPage === "number") {
      return parentPage === NOTHING;
    }

    return false;
  } catch {
    return false;
  }
}

export function isTopLevelSpreadItem(item: PageItem): boolean {
  try {
    const parent = item.parent as Spread | PageItem | undefined;
    if (!parent) {
      return true;
    }
    return "pages" in parent;
  } catch {
    return false;
  }
}

export function isOnHiddenLayer(item: PageItem): boolean {
  try {
    const layer = item.itemLayer;
    return Boolean(layer && layer.isValid && layer.visible === false);
  } catch {
    return false;
  }
}

export function hasMeasurableBounds(item: PageItem): boolean {
  try {
    const geo = item.geometricBounds;
    if (!geo || geo.length < 4) {
      return false;
    }
    const epsilon = 0.01;
    return Math.abs(geo[2] - geo[0]) > epsilon && Math.abs(geo[3] - geo[1]) > epsilon;
  } catch {
    return false;
  }
}

function getSpreadPages(spread: Spread): Page[] {
  const pages: Page[] = [];
  forEachCollectionItem<Page>(spread.pages, (page) => {
    if (page?.isValid) {
      pages.push(page);
    }
  });
  return pages;
}

function getSpreadPageItems(spread: Spread): PageItem[] {
  const items: PageItem[] = [];
  const direct = spread.allPageItems ?? spread.pageItems;
  if (direct) {
    forEachCollectionItem<PageItem>(direct, (item) => {
      if (item?.isValid) {
        items.push(item);
      }
    });
    return items;
  }

  forEachCollectionItem<Page>(spread.pages, (page) => {
    if (!page?.isValid) return;
    const pageItems = page.allPageItems ?? page.pageItems;
    if (!pageItems) return;
    forEachCollectionItem<PageItem>(pageItems, (item) => {
      if (item?.isValid) {
        items.push(item);
      }
    });
  });

  return items;
}

function resolveNearestPageName(item: PageItem, pages: Page[]): string {
  try {
    const geo = item.geometricBounds;
    if (!geo || geo.length < 4 || pages.length === 0) {
      return "Pasteboard";
    }

    const centerY = (geo[0] + geo[2]) / 2;
    const centerX = (geo[1] + geo[3]) / 2;
    let nearest = pages[0];
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const page of pages) {
      const bounds = page.bounds;
      if (!bounds || bounds.length < 4) continue;
      const pageCenterY = (bounds[0] + bounds[2]) / 2;
      const pageCenterX = (bounds[1] + bounds[3]) / 2;
      const distance = Math.hypot(centerY - pageCenterY, centerX - pageCenterX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = page;
      }
    }

    return nearest.name || "Pasteboard";
  } catch {
    return "Pasteboard";
  }
}

export function getPageItemDisplayName(item: PageItem): string {
  try {
    if (item.name) {
      return item.name;
    }
    return item.constructor?.name || "Objeto";
  } catch {
    return "Objeto";
  }
}

/** Percorre apenas objetos realmente no pasteboard (parentPage = NOTHING), no nível do spread. */
export function walkPasteboardItems(
  doc: Document,
  callback: (item: PageItem, spreadPages: Page[], pageName: string) => void
): void {
  const seen = new Set<string>();

  forEachCollectionItem<Spread>(doc.spreads, (spread) => {
    if (!spread?.isValid) return;

    const spreadPages = getSpreadPages(spread);
    const spreadItems = getSpreadPageItems(spread);

    for (const item of spreadItems) {
      if (!item.isValid || !isOnPasteboard(item) || !isTopLevelSpreadItem(item)) {
        continue;
      }
      if (isOnHiddenLayer(item) || !hasMeasurableBounds(item)) {
        continue;
      }

      const key = getPageItemDedupKey(item);
      if (seen.has(key)) continue;
      seen.add(key);

      callback(item, spreadPages, resolveNearestPageName(item, spreadPages));
    }
  });
}

export function isFullyOutsideAllPages(item: PageItem, pages: Page[], doc: Document): boolean {
  if (pages.length === 0) {
    return false;
  }
  return pages.every((page) => isFullyOutsidePageBounds(item, page, doc));
}

export function getPageItemDedupKey(item: PageItem): string {
  try {
    const geo = item.geometricBounds;
    const name = item.name || item.constructor?.name || "Objeto";
    if (geo && geo.length >= 4) {
      return `${name}:${geo.map((value) => value.toFixed(2)).join(",")}`;
    }
    return name;
  } catch {
    return "unknown";
  }
}

export function collectGraphics(doc: Document): GraphicInfo[] {
  const cached = getValidationScan()?.getGraphics();
  if (cached) {
    return cached;
  }

  const graphics: GraphicInfo[] = [];

  walkDirectPageItems(doc, (item, _page, pageName) => {
    try {
      forEachCollectionItem<{ itemLink: import("indesign").Link | null; isValid: boolean; space: number; effectiveResolution: number; actualPpi: number[] }>(
        item.graphics,
        (graphic) => {
          if (!graphic || !graphic.isValid) return;

          const link = graphic.itemLink;
          const imageName = link && link.isValid ? link.name : item.name || "Imagem";
          const dpi = getGraphicDpi(graphic);
          const colorSpace = getImageColorSpaceLabel(graphic.space);

          graphics.push({
            pageName,
            imageName,
            dpi,
            colorSpace,
            pageItem: item,
          });
        }
      );

      forEachCollectionItem<{ itemLink: import("indesign").Link | null; isValid: boolean; space: number; effectiveResolution: number; actualPpi: number[] }>(
        item.images,
        (image) => {
          if (!image || !image.isValid) return;

          const link = image.itemLink;
          const imageName = link && link.isValid ? link.name : item.name || "Imagem";
          const dpi = getGraphicDpi(image);
          const colorSpace = getImageColorSpaceLabel(image.space);

          graphics.push({
            pageName,
            imageName,
            dpi,
            colorSpace,
            pageItem: item,
          });
        }
      );
    } catch {
      // ignore invalid items
    }
  });

  return graphics;
}

function getGraphicDpi(graphic: { effectiveResolution: number; actualPpi: number[] }): number {
  try {
    if (graphic.actualPpi && graphic.actualPpi.length >= 2) {
      return Math.min(graphic.actualPpi[0], graphic.actualPpi[1]);
    }
    if (graphic.effectiveResolution) {
      return graphic.effectiveResolution;
    }
  } catch {
    // ignore
  }
  return 0;
}

export function collectStrokedItems(doc: Document): StrokeInfo[] {
  const cached = getValidationScan()?.getStrokes();
  if (cached) {
    return cached;
  }

  const strokes: StrokeInfo[] = [];

  walkDirectPageItems(doc, (item, _page, pageName) => {
    try {
      const weight = item.strokeWeight;
      if (weight > 0) {
        strokes.push({
          pageName,
          objectName: item.name || item.constructor.name || "Objeto",
          weight,
          pageItem: item,
        });
      }
    } catch {
      // ignore
    }
  });

  return strokes;
}

function millimetersToPoints(mm: number): number {
  return mm * 2.834645669;
}

function readBleedOffset(doc: Document, side: "top" | "bottom" | "inside" | "outside"): number {
  try {
    const prefs = doc.documentPreferences as {
      documentBleedTopOffset?: number;
      documentBleedBottomOffset?: number;
      documentBleedInsideOrLeftOffset?: number;
      documentBleedOutsideOrRightOffset?: number;
      documentBleedInsideOffset?: number;
      documentBleedOutsideOffset?: number;
    };

    if (side === "top" && prefs.documentBleedTopOffset != null) {
      return prefs.documentBleedTopOffset;
    }
    if (side === "bottom" && prefs.documentBleedBottomOffset != null) {
      return prefs.documentBleedBottomOffset;
    }
    if (side === "inside") {
      return (
        prefs.documentBleedInsideOrLeftOffset ??
        prefs.documentBleedInsideOffset ??
        millimetersToPoints(BLEED_MM)
      );
    }
    return (
      prefs.documentBleedOutsideOrRightOffset ??
      prefs.documentBleedOutsideOffset ??
      millimetersToPoints(BLEED_MM)
    );
  } catch {
    return millimetersToPoints(BLEED_MM);
  }
}

export function getPageBoundsWithBleed(page: Page, doc: Document): number[] {
  const bounds = page.bounds;
  if (!bounds || bounds.length < 4) {
    return bounds;
  }

  const bleedTop = readBleedOffset(doc, "top");
  const bleedBottom = readBleedOffset(doc, "bottom");
  const bleedInside = readBleedOffset(doc, "inside");
  const bleedOutside = readBleedOffset(doc, "outside");
  const leftHand = isLeftHandPage(page);
  const bleedLeft = leftHand ? bleedOutside : bleedInside;
  const bleedRight = leftHand ? bleedInside : bleedOutside;

  return [
    bounds[0] - bleedTop,
    bounds[1] - bleedLeft,
    bounds[2] + bleedBottom,
    bounds[3] + bleedRight,
  ];
}

export function isFullyOutsidePageBounds(item: PageItem, page: Page, doc: Document): boolean {
  try {
    const bounds = getPageBoundsWithBleed(page, doc);
    const geo = item.geometricBounds;
    if (!bounds || !geo || bounds.length < 4 || geo.length < 4) {
      return false;
    }

    const pageTop = bounds[0];
    const pageLeft = bounds[1];
    const pageBottom = bounds[2];
    const pageRight = bounds[3];

    const itemTop = geo[0];
    const itemLeft = geo[1];
    const itemBottom = geo[2];
    const itemRight = geo[3];

    const separatedVertically = itemBottom <= pageTop || itemTop >= pageBottom;
    const separatedHorizontally = itemRight <= pageLeft || itemLeft >= pageRight;

    return separatedVertically || separatedHorizontally;
  } catch {
    return false;
  }
}

export function normalizeFontFamily(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(lt|std|pro|mt|cond|compressed|extended|narrow|bold|italic|regular|medium|light|black|heavy|ultra|thin|book|demi|semibold|extrabold)\b/gi, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function isDefaultParagraphStyle(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "[sem estilo de parágrafo]" || lower === "[no paragraph style]";
}

export function isMixedInkColor(color: Color): boolean {
  try {
    const { ColorModel } = getInDesignModule();
    const CM = ColorModel as { PROCESS: number; SPOT: number; REGISTRATION: number };
    return color.model !== CM.PROCESS && color.model !== CM.SPOT && color.model !== CM.REGISTRATION;
  } catch {
    return false;
  }
}

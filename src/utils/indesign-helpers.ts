import type { Document, Layer, Page, PageItem, Color, Spread, Link } from "indesign";
import { BLEED_MM } from "./constants";
import { PageItemCallback, GraphicInfo, StrokeInfo } from "../models/validator";
import { SPOT_COLOR_EXCEPTIONS } from "./constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "./collection-helpers";
import { getValidationScan } from "../core/validation-cache";
import { getInDesignModule } from "./indesign-runtime";
import {
  isCorProfColorName,
  isGuiasDeletarColorName,
  normalizeColorName,
} from "./editorial-color";
import { coerceFilePath, resolveGraphicColorSpace } from "./file-color-space";
import { isPluginGeneratedItem } from "./editorial-layer";

export { getActiveDocument } from "./indesign-runtime";
export { getImageColorSpaceLabel } from "./color-model";

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

export function isSpotExceptionColor(name: string): boolean {
  if (isCorProfColorName(name) || isGuiasDeletarColorName(name)) {
    return true;
  }
  const key = normalizeColorName(name);
  return SPOT_COLOR_EXCEPTIONS.some((exception) => normalizeColorName(exception) === key);
}

export function isGuideColor(name: string): boolean {
  return isCorProfColorName(name) || isGuiasDeletarColorName(name);
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

function pageItemId(item: PageItem): number | null {
  try {
    const id = item.id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

export function forEachPageItem(
  container: unknown,
  page: Page | null,
  pageName: string,
  callback: PageItemCallback,
  depth = 0
): boolean {
  if (depth > 8) return true;
  const length = getCollectionLength(container);
  for (let i = 0; i < length; i++) {
    const item = getCollectionItem<PageItem>(container, i);
    if (!item?.isValid) continue;
    if (callback(item, page, pageName) === false) return false;
    try {
      const children = item.pageItems;
      if (!getCollectionItem<PageItem>(children, 0)) continue;
      if (!forEachPageItem(children, page, pageName, callback, depth + 1)) return false;
    } catch {
      // ignora grupo inválido
    }
  }
  return true;
}

export function walkAllPageItems(doc: Document, callback: PageItemCallback): void {
  forEachPage(doc, (page, pageName) => {
    const items = page.allPageItems || page.pageItems;
    if (items) {
      forEachPageItem(items, page, pageName, callback);
    }
  });
}

/**
 * Percorre cada objeto uma vez: páginas, pasteboard do spread e masters.
 * Não rewalka masterPageItems em cada página (isso multiplicava o custo pelo número de páginas).
 * O callback pode retornar false para interromper.
 */
export function walkDirectPageItems(doc: Document, callback: PageItemCallback): void {
  const seen = new Set<number>();
  let aborted = false;

  const visit: PageItemCallback = (item, page, pageName) => {
    if (aborted) return false;
    const id = pageItemId(item);
    if (id != null) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    if (callback(item, page, pageName) === false) {
      aborted = true;
      return false;
    }
  };

  const walkFlat = (container: unknown, page: Page | null, pageName: string): boolean => {
    const length = getCollectionLength(container);
    for (let i = 0; i < length; i++) {
      if (aborted) return false;
      const item = getCollectionItem<PageItem>(container, i);
      if (!item?.isValid) continue;
      if (visit(item, page, pageName) === false) return false;
    }
    return true;
  };

  const walkPageCollection = (page: Page, pageName: string, recursiveFallback: unknown): void => {
    if (aborted) return;
    try {
      const flat = page.allPageItems;
      if (getCollectionLength(flat) > 0) {
        if (!walkFlat(flat, page, pageName)) aborted = true;
        return;
      }
    } catch {
      // coleção plana indisponível
    }
    if (!forEachPageItem(recursiveFallback, page, pageName, visit)) aborted = true;
  };

  forEachPage(doc, (page, pageName) => {
    walkPageCollection(page, pageName, page.pageItems);
  });

  if (!aborted) {
    try {
      forEachCollectionItem<Spread>(doc.spreads, (spread) => {
        if (aborted || !spread?.isValid) return;
        const spreadPages = getSpreadPages(spread);
        if (!spread.pageItems) return;
        const page = spreadPages[0] || null;
        forEachCollectionItem<PageItem>(spread.pageItems, (item) => {
          if (aborted || !item?.isValid) return;
          const pageName = resolveNearestPageName(item, spreadPages);
          if (visit(item, page, pageName) === false) return;
          try {
            if (!getCollectionItem<PageItem>(item.pageItems, 0)) return;
            if (!forEachPageItem(item.pageItems, page, pageName, visit, 1)) aborted = true;
          } catch {
            // ignore
          }
        });
      });
    } catch {
      // ignore
    }
  }

  if (aborted) return;

  try {
    forEachCollectionItem<Spread>(doc.masterSpreads, (spread) => {
      if (aborted || !spread?.isValid) return;
      forEachCollectionItem<Page>(spread.pages, (page, index) => {
        if (aborted || !page?.isValid) return;
        const pageName = `Página-mestra ${page.name || index + 1}`.trim();
        walkPageCollection(page, pageName, page.pageItems);
      });
    });
  } catch {
    // ignore
  }
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
    const geo = readItemBounds(item);
    if (!geo || geo.length < 4) {
      return false;
    }
    const epsilon = 0.01;
    return Math.abs(geo[2] - geo[0]) > epsilon && Math.abs(geo[3] - geo[1]) > epsilon;
  } catch {
    return false;
  }
}

function readItemBounds(item: PageItem): number[] | null {
  try {
    const geo = item.geometricBounds;
    if (geo && geo.length >= 4) return geo;
  } catch {
    // tenta visibleBounds
  }
  try {
    const visible = (item as PageItem & { visibleBounds?: number[] }).visibleBounds;
    if (visible && visible.length >= 4) return visible;
  } catch {
    // ignore
  }
  return null;
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

function resolveNearestPageName(item: PageItem, pages: Page[]): string {
  try {
    const geo = readItemBounds(item);
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

function getTextFramePreview(item: PageItem): string {
  try {
    const raw = String(item.contents || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "";
    return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
  } catch {
    return "";
  }
}

/** Nome legível do objeto para reports — nunca usar índices internos (Story 98, etc.). */
export function getPageItemDisplayName(item: PageItem): string {
  try {
    const named = (item.name || "").trim();
    if (named) {
      return named;
    }

    const typeName = item.constructor?.name || "Objeto";
    if (typeName === "TextFrame") {
      const preview = getTextFramePreview(item);
      return preview ? `Caixa de texto (“${preview}”)` : "Caixa de texto";
    }

    const labels: Record<string, string> = {
      Rectangle: "Retângulo",
      Oval: "Elipse",
      Polygon: "Polígono",
      Group: "Grupo",
      GraphicLine: "Linha",
      Image: "Imagem",
    };

    return labels[typeName] || typeName;
  } catch {
    return "Objeto";
  }
}

/**
 * Percorre objetos do spread (página + pasteboard) e reporta os que estão
 * 100% fora de todas as páginas, inclusive os que o InDesign ainda associa
 * a uma parentPage (caso típico de box no pasteboard).
 */
export function walkPasteboardItems(
  doc: Document,
  callback: (item: PageItem, spreadPages: Page[], pageName: string) => void
): void {
  const seen = new Set<string>();

  forEachCollectionItem<Spread>(doc.spreads, (spread) => {
    if (!spread?.isValid) return;

    const spreadPages = getSpreadPages(spread);

    const visit = (item: PageItem, depth: number): void => {
      if (!item?.isValid || depth > 8) return;
      if (isOnHiddenLayer(item) || !hasMeasurableBounds(item)) return;

        if (isFullyOutsideAllPages(item, spreadPages, doc)) {
          const key = getPageItemDedupKey(item);
          if (seen.has(key)) return;
          seen.add(key);
          callback(item, spreadPages, resolveNearestPageName(item, spreadPages));
          return;
        }

        try {
          if (!getCollectionItem<PageItem>(item.pageItems, 0)) return;
          forEachCollectionItem<PageItem>(item.pageItems, (child) => {
            visit(child, depth + 1);
          });
        } catch {
          // ignora grupo inválido
        }
    };

    const roots: PageItem[] = [];
    if (spread.pageItems) {
      forEachCollectionItem<PageItem>(spread.pageItems, (item) => {
        if (item?.isValid) roots.push(item);
      });
    }
    for (const page of spreadPages) {
      if (!page.pageItems) continue;
      forEachCollectionItem<PageItem>(page.pageItems, (item) => {
        if (item?.isValid) roots.push(item);
      });
    }

    for (const item of roots) {
      visit(item, 0);
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

function isUsableSpaceValue(value: unknown): boolean {
  if (value == null || value === 0 || value === "0") return false;
  if (typeof value === "string" && !value.trim()) return false;
  return true;
}

function readGraphicSpace(graphic: GraphicLike): unknown {
  const candidate = graphic as GraphicLike & {
    imageColorSpace?: unknown;
    colorSpace?: unknown;
    profile?: unknown;
    imageTypeName?: unknown;
    properties?: { space?: unknown; imageColorSpace?: unknown; colorSpace?: unknown; profile?: unknown };
    parent?: GraphicLike & { space?: unknown; images?: unknown };
  };

  const tryValue = (getter: () => unknown): unknown => {
    try {
      const value = getter();
      return isUsableSpaceValue(value) ? value : undefined;
    } catch {
      return undefined;
    }
  };

  return (
    tryValue(() => graphic.space) ||
    tryValue(() => candidate.imageColorSpace) ||
    tryValue(() => candidate.colorSpace) ||
    tryValue(() => candidate.properties?.space) ||
    tryValue(() => candidate.properties?.imageColorSpace) ||
    tryValue(() => candidate.properties?.colorSpace) ||
    tryValue(() => candidate.parent?.space) ||
    tryValue(() => {
      const images = (candidate.parent as { images?: { item?: (i: number) => GraphicLike } } | undefined)?.images;
      return images?.item?.(0)?.space;
    }) ||
    (() => {
      try {
        const profile = String(candidate.profile || candidate.properties?.profile || "");
        if (/cmyk|fogra|gracol|swop|japan color|coated|uncoated/i.test(profile)) return "CMYK";
        if (/srgb|adobe rgb|display p3|apple rgb/i.test(profile)) return "RGB";
        if (/gray|grey|dot gain|black.?white/i.test(profile)) return "Gray";
      } catch {
        // ignore
      }
      return null;
    })()
  );
}

function basenameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  const base = index >= 0 ? normalized.slice(index + 1) : normalized;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
}

function readItemLink(source: unknown): import("indesign").Link | null {
  if (!source || typeof source !== "object") return null;
  try {
    const link = (source as { itemLink?: import("indesign").Link | null }).itemLink;
    if (link && link.isValid) return link;
  } catch {
    // ignore
  }
  return null;
}

function readLinkMeta(
  graphic: GraphicLike,
  item?: PageItem
): { name: string; filePath: string; filePaths: string[]; linkId: number | null } {
  const parents: unknown[] = [graphic, item];
  try {
    parents.push((graphic as GraphicLike & { parent?: unknown }).parent);
  } catch {
    // ignore
  }
  try {
    if (item) parents.push((item as PageItem & { parent?: unknown }).parent);
  } catch {
    // ignore
  }

  let link: import("indesign").Link | null = null;
  for (const source of parents) {
    link = readItemLink(source);
    if (link) break;
  }

  if (!link) {
    return { name: "", filePath: "", filePaths: [], linkId: null };
  }

  const filePath = coerceFilePath(link.filePath) || coerceFilePath(link.linkResourceURI);
  const uri = coerceFilePath(link.linkResourceURI);
  const filePaths = [filePath, uri].filter((value, index, all) => value && all.indexOf(value) === index);
  const name = link.name || basenameFromPath(filePath) || "";
  return {
    name,
    filePath,
    filePaths,
    linkId: typeof link.id === "number" ? link.id : null,
  };
}

type GraphicLike = {
  itemLink: import("indesign").Link | null;
  isValid: boolean;
  space: unknown;
  effectivePpi?: number[];
  effectiveResolution?: number;
  actualPpi?: number[];
};

function minPositive(values: number[] | undefined): number {
  if (!values || values.length < 1) return 0;
  const nums = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (nums.length === 0) return 0;
  return Math.min(...nums);
}

/** PPI original do arquivo (actualPpi), sem considerar escala no layout. */
export function getGraphicDpi(graphic: GraphicLike): number {
  try {
    const raw = graphic.actualPpi as unknown;
    if (typeof raw === "number" && raw > 0) return raw;
    const actual = minPositive(graphic.actualPpi);
    if (actual > 0) return actual;
  } catch {
    // ignore
  }
  return 0;
}

function graphicIdentity(graphic: GraphicLike, item: PageItem): string {
  const meta = readLinkMeta(graphic, item);
  if (meta.linkId != null) return `link:${meta.linkId}`;
  if (meta.name) return `name:${meta.name}`;
  try {
    const link = graphic.itemLink;
    if (link && link.isValid && typeof link.id === "number") {
      return `link:${link.id}`;
    }
  } catch {
    // ignore
  }
  return `item:${item.name || "Imagem"}`;
}

export function collectGraphicsFromItem(
  item: PageItem,
  pageName: string,
  graphics: GraphicInfo[],
  seen = new Set<string>()
): void {
  const pushGraphic = (graphic: GraphicLike): void => {
    if (!graphic?.isValid) return;
    const key = graphicIdentity(graphic, item);
    if (seen.has(key)) return;
    seen.add(key);

    const meta = readLinkMeta(graphic, item);
    const imageName = meta.name || item.name || "Imagem";

    graphics.push({
      pageName,
      imageName,
      dpi: getGraphicDpi(graphic),
      colorSpace: resolveGraphicColorSpace({
        space: readGraphicSpace(graphic),
        fileName: imageName,
        filePath: meta.filePath,
        filePaths: meta.filePaths,
        linkId: meta.linkId,
      }),
      pageItem: item,
      fileName: imageName,
      filePath: meta.filePath || undefined,
      linkId: meta.linkId ?? undefined,
    });
  };

  const collections: unknown[] = [
    item.graphics,
    item.images,
    (item as PageItem & { epss?: unknown }).epss,
    (item as PageItem & { pdfs?: unknown }).pdfs,
  ];

  for (const collection of collections) {
    try {
      forEachCollectionItem<GraphicLike>(collection, pushGraphic);
    } catch {
      // ignore
    }
  }
}

export function collectGraphicsFromLinks(
  doc: Document,
  graphics: GraphicInfo[],
  seen: Set<string>
): void {
  forEachCollectionItem<Link>(doc.links, (link) => {
    if (!link?.isValid) return;
    const graphic = (link as Link & { parent?: GraphicLike }).parent;
    if (!graphic?.isValid) return;

    let pageItem: PageItem | null = null;
    try {
      pageItem = (graphic as GraphicLike & { parent?: PageItem }).parent || null;
    } catch {
      pageItem = null;
    }

    let pageName = "Página-mestra";
    try {
      const parentPage = pageItem?.parentPage;
      if (parentPage && typeof parentPage === "object" && parentPage.name) {
        pageName = parentPage.name;
      }
    } catch {
      // ignore
    }

    const filePath = coerceFilePath(link.filePath) || coerceFilePath(link.linkResourceURI);
    const uri = coerceFilePath(link.linkResourceURI);
    const imageName = link.name || basenameFromPath(filePath) || "Imagem";
    const key = `link:${link.id}`;
    if (seen.has(key)) return;
    seen.add(key);

    graphics.push({
      pageName,
      imageName,
      dpi: getGraphicDpi(graphic),
      colorSpace: resolveGraphicColorSpace({
        space: readGraphicSpace(graphic),
        fileName: imageName,
        filePath,
        filePaths: [filePath, uri].filter(Boolean),
        linkId: link.id,
      }),
      pageItem: pageItem || (graphic as unknown as PageItem),
      fileName: imageName,
      filePath: filePath || undefined,
      linkId: link.id,
    });
  });
}

export function collectGraphics(doc: Document): GraphicInfo[] {
  const cached = getValidationScan()?.getGraphics();
  if (cached) {
    return cached;
  }

  const graphics: GraphicInfo[] = [];
  const seen = new Set<string>();

  walkDirectPageItems(doc, (item, _page, pageName) => {
    try {
      collectGraphicsFromItem(item, pageName, graphics, seen);
    } catch {
      // ignore invalid items
    }
  });

  try {
    collectGraphicsFromLinks(doc, graphics, seen);
  } catch {
    // painel Links pode falhar em documentos corrompidos
  }

  return graphics;
}

export function collectStrokedItems(doc: Document): StrokeInfo[] {
  const cached = getValidationScan()?.getStrokes();
  if (cached) {
    return cached;
  }

  const strokes: StrokeInfo[] = [];

  walkDirectPageItems(doc, (item, _page, pageName) => {
    try {
      if (isPluginGeneratedItem(item)) return;
      const weight = item.strokeWeight;
      if (typeof weight !== "number" || !(weight > 0)) return;
      try {
        const strokeName = (item.strokeColor?.name || "").replace(/^\[|\]$/g, "").trim().toLowerCase();
        if (!strokeName || strokeName === "none" || strokeName === "nenhum" || strokeName === "nenhuma") return;
      } catch {
        // sem nome de traço, segue
      }
      strokes.push({
        pageName,
        objectName: "",
        weight,
        pageItem: item,
      });
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
    const geo = readItemBounds(item);
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
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "[sem estilo de parágrafo]" ||
    normalized === "[no paragraph style]" ||
    normalized === "[parágrafo básico]" ||
    normalized === "[basic paragraph]"
  );
}

/** Estilos do InDesign ou prefixo 00_ — ignorados em todas as validações de parágrafo. */
export function shouldSkipParagraphStyleValidation(name: string): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  if (isDefaultParagraphStyle(trimmed)) return true;
  if (trimmed.startsWith("00_") || trimmed.toUpperCase().startsWith("EAC_")) return true;
  return false;
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

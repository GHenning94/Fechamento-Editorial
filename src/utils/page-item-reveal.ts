import type { Document, Link, Page, PageItem } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
import { getActiveDocument, getInDesignApp, getInDesignModule } from "./indesign-runtime";

type IdCollection = {
  itemByID?: (id: number) => PageItem;
  itemById?: (id: number) => PageItem;
};

const NESTED_LINK_PARENTS = /^(Link|Image|PDF|EPS|Graphic|ImportedPage|HTML|Movie|Sound)/i;

export function readPageItemId(item: { id?: number } | null | undefined): number | undefined {
  try {
    const id = item?.id;
    return typeof id === "number" && Number.isFinite(id) && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Sobe do vínculo até o quadro (PageItem), como o painel Links do InDesign. */
export function readLinkPageItemId(link: Link | null | undefined): number | undefined {
  if (!link) return undefined;
  try {
    let current: unknown = link.parent;
    let nestedId: number | undefined;
    for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
      const typeName = (current as { constructor?: { name?: string } }).constructor?.name || "";
      const id = readPageItemId(current as PageItem);
      if (id != null) {
        if (!NESTED_LINK_PARENTS.test(typeName)) return id;
        if (nestedId == null) nestedId = id;
      }
      current = (current as { parent?: unknown }).parent;
    }
    return nestedId;
  } catch {
    return undefined;
  }
}

function pickById(collection: IdCollection | undefined, itemId: number): PageItem | null {
  if (!collection) return null;
  try {
    const getter = collection.itemByID ?? collection.itemById;
    const item = getter?.(itemId);
    return item?.isValid ? item : null;
  } catch {
    return null;
  }
}

function itemById(doc: Document, itemId: number): PageItem | null {
  const extra = doc as Document & {
    rectangles?: IdCollection;
    ovals?: IdCollection;
    polygons?: IdCollection;
    groups?: IdCollection;
    graphicLines?: IdCollection;
    allGraphics?: IdCollection;
    images?: IdCollection;
    pdfs?: IdCollection;
    epss?: IdCollection;
  };

  const direct = [
    doc.pageItems,
    doc.textFrames as IdCollection | undefined,
    extra.rectangles,
    extra.ovals,
    extra.polygons,
    extra.groups,
    extra.graphicLines,
    extra.allGraphics,
    extra.images,
    extra.pdfs,
    extra.epss,
  ];
  for (const collection of direct) {
    const hit = pickById(collection, itemId);
    if (hit) return hit;
  }

  let found: PageItem | null = null;
  const scanPage = (page: Page | null | undefined): void => {
    if (found || !page?.isValid) return;
    found =
      pickById(page.pageItems, itemId) ||
      pickById(page.allPageItems, itemId) ||
      pickById(page.textFrames as IdCollection | undefined, itemId);
  };

  try {
    forEachCollectionItem<Page>(doc.pages, scanPage);
  } catch {
    // ignore
  }
  if (found) return found;

  try {
    forEachCollectionItem<{ pages?: { length: number; item(index: number): Page }; isValid?: boolean }>(
      doc.masterSpreads,
      (spread) => {
        if (found || !spread?.isValid) return;
        forEachCollectionItem<Page>(spread.pages, scanPage);
      }
    );
  } catch {
    // ignore
  }

  return found;
}

function showItem(item: PageItem): boolean {
  try {
    const layer = item.itemLayer;
    if (layer?.isValid && !layer.visible) {
      layer.visible = true;
    }
  } catch {
    // ignore
  }

  const app = getInDesignApp() as ReturnType<typeof getInDesignApp> & {
    select?: (value: unknown, options?: unknown) => void;
    activeWindow?: {
      activePage?: Page;
      zoom?: (to: unknown) => void;
      select?: (value: unknown) => void;
    };
  };
  const doc = getActiveDocument() as Document & { select?: (value: unknown) => void };
  const mod = getInDesignModule() as {
    SelectionOptions?: { REPLACE_WITH?: unknown; replaceWith?: unknown };
    ZoomOptions?: { FIT_SELECTION?: unknown; fitSelection?: unknown; SHOW_SELECTION?: unknown };
  };

  try {
    const parentPage = item.parentPage;
    if (parentPage && typeof parentPage === "object" && app.activeWindow) {
      app.activeWindow.activePage = parentPage;
    }
  } catch {
    // pasteboard / mestra
  }

  const replace = mod.SelectionOptions?.REPLACE_WITH ?? mod.SelectionOptions?.replaceWith;
  let selected = false;
  const trySelect = (fn: () => void): void => {
    if (selected) return;
    try {
      fn();
      selected = true;
    } catch {
      // ignore
    }
  };

  trySelect(() => {
    if (typeof app.select !== "function") throw new Error("no app.select");
    if (replace != null) app.select(item, replace);
    else app.select(item);
  });
  trySelect(() => {
    const selectable = item as PageItem & { select?: () => void };
    if (typeof selectable.select !== "function") throw new Error("no item.select");
    selectable.select();
  });
  trySelect(() => {
    if (typeof doc.select !== "function") throw new Error("no doc.select");
    doc.select(item);
  });
  trySelect(() => {
    if (typeof app.activeWindow?.select !== "function") throw new Error("no window.select");
    app.activeWindow.select(item);
  });
  trySelect(() => {
    app.selection = [item];
  });

  if (!selected) return false;

  try {
    const fit =
      mod.ZoomOptions?.FIT_SELECTION ?? mod.ZoomOptions?.fitSelection ?? mod.ZoomOptions?.SHOW_SELECTION;
    if (fit != null) app.activeWindow?.zoom?.(fit);
  } catch {
    // a seleção já leva o viewport na maioria das versões
  }

  return true;
}

/** Seleciona o objeto no documento, como “Ir para o vínculo” no painel Links. */
export function revealPageItemById(itemId: number): boolean {
  if (!Number.isFinite(itemId) || itemId <= 0) return false;
  const doc = getActiveDocument();
  const item = itemById(doc, itemId);
  if (!item?.isValid) return false;
  return showItem(item);
}

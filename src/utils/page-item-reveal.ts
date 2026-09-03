import type { Document, Link, Page, PageItem } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
import { getActiveDocument, getInDesignApp } from "./indesign-runtime";

const SKIP_TO_FRAME = /^(Link|Image|PDF|EPS|Graphic|ImportedPage|HTML|Movie|Sound)$/i;
const STOP_AT = /^(Document|Spread|MasterSpread|Page|Application)$/i;

export function readPageItemId(item: { id?: number } | null | undefined): number | undefined {
  try {
    const id = item?.id;
    return typeof id === "number" && Number.isFinite(id) && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Sobe do vínculo até o quadro, como o painel Links do InDesign. */
export function readLinkPageItemId(link: Link | null | undefined): number | undefined {
  if (!link) return undefined;
  try {
    let current: unknown = link.parent;
    let fallback: number | undefined;
    for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
      const typeName = (current as { constructor?: { name?: string } }).constructor?.name || "";
      if (STOP_AT.test(typeName)) break;
      const id = readPageItemId(current as PageItem);
      if (id != null) {
        if (typeName && !SKIP_TO_FRAME.test(typeName)) return id;
        fallback = id;
      }
      current = (current as { parent?: unknown }).parent;
    }
    return fallback;
  } catch {
    return undefined;
  }
}

function scanForId(collection: unknown, itemId: number): PageItem | null {
  let found: PageItem | null = null;
  try {
    forEachCollectionItem<PageItem>(collection, (item) => {
      if (found) return;
      if (readPageItemId(item) === itemId) found = item;
    });
  } catch {
    // ignore
  }
  return found;
}

function findOnPage(page: Page | null | undefined, itemId: number): PageItem | null {
  if (!page) return null;
  return scanForId(page.allPageItems, itemId) || scanForId(page.pageItems, itemId);
}

function pageNameMatches(page: Page, pageName: string): boolean {
  try {
    return page.name === pageName;
  } catch {
    return false;
  }
}

function findPageItem(doc: Document, itemId: number, pageName?: string): PageItem | null {
  let found: PageItem | null = null;

  const visit = (page: Page | null | undefined): void => {
    if (found || !page) return;
    if (pageName && !pageNameMatches(page, pageName)) return;
    found = findOnPage(page, itemId);
  };

  try {
    forEachCollectionItem<Page>(doc.pages, visit);
  } catch {
    // ignore
  }
  if (found) return found;

  try {
    forEachCollectionItem<{ pages?: unknown; isValid?: boolean }>(doc.masterSpreads, (spread) => {
      if (found || !spread?.isValid) return;
      forEachCollectionItem<Page>(spread.pages, visit);
    });
  } catch {
    // ignore
  }
  return found;
}

/** Seleciona o objeto no documento, como “Ir para o vínculo” no painel Links. */
export function revealPageItemById(itemId: number, pageName?: string): boolean {
  if (!Number.isFinite(itemId) || itemId <= 0) return false;

  try {
    const item = findPageItem(getActiveDocument(), itemId, pageName);
    if (!item) return false;

    const app = getInDesignApp() as { select?: (value: unknown) => void };
    if (typeof app.select !== "function") return false;
    app.select(item);
    return true;
  } catch {
    return false;
  }
}

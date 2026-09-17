import type { Document, Link, Page, PageItem } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
import { getActiveDocument, getInDesignApp } from "./indesign-runtime";

const SKIP_TO_FRAME = /^(Link|Image|PDF|EPS|Graphic|ImportedPage|HTML|Movie|Sound)$/i;
const STOP_AT = /^(Document|Spread|MasterSpread|Page|Application)$/i;

type HostObject = {
  constructor?: { name?: string };
  name?: string;
  parent?: unknown;
  parentPage?: Page | number;
  isValid?: boolean;
  pages?: unknown;
  pageItems?: unknown;
  allPageItems?: unknown;
};

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
      const typeName = typeNameOf(current);
      if (STOP_AT.test(typeName)) break;
      const id = readPageItemId(current as PageItem);
      if (id != null) {
        if (typeName && !SKIP_TO_FRAME.test(typeName)) return id;
        fallback = id;
      }
      current = (current as HostObject).parent;
    }
    return fallback;
  } catch {
    return undefined;
  }
}

function typeNameOf(value: unknown): string {
  try {
    return (value as HostObject)?.constructor?.name || "";
  } catch {
    return "";
  }
}

function readName(value: unknown): string {
  try {
    return String((value as HostObject)?.name || "").trim();
  } catch {
    return "";
  }
}

function stripMasterDecorators(name: string): string {
  return name
    .trim()
    .replace(/^página[\s\-–—]*mestra\s+/i, "")
    .replace(/^pagina[\s\-–—]*mestra\s+/i, "")
    .replace(/[\s\-–—]+(página|pagina)[\s\-]*mestra$/i, "")
    .replace(/[\s\-–—]+master$/i, "")
    .replace(/^master[\s\-–—]+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(actual: string, expected: string): boolean {
  if (!expected) return true;
  if (!actual) return false;
  if (actual === expected) return true;
  const a = stripMasterDecorators(actual).toLocaleLowerCase();
  const b = stripMasterDecorators(expected).toLocaleLowerCase();
  return Boolean(a && b && a === b);
}

function looksLikeMasterPageName(pageName?: string): boolean {
  if (!pageName) return false;
  return /mestra|master/i.test(pageName);
}

function pageOrSpreadMatches(target: unknown, pageName?: string): boolean {
  if (!pageName) return true;
  if (namesMatch(readName(target), pageName)) return true;
  try {
    const parent = (target as HostObject).parent;
    if (parent && namesMatch(readName(parent), pageName)) return true;
  } catch {
    // ignore
  }
  return false;
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

function findOnSpread(spread: HostObject | null | undefined, itemId: number): PageItem | null {
  if (!spread) return null;
  return scanForId(spread.allPageItems, itemId) || scanForId(spread.pageItems, itemId);
}

function selectableFrame(item: PageItem): PageItem {
  let current: unknown = item;
  let last = item;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth++) {
    const typeName = typeNameOf(current);
    if (STOP_AT.test(typeName)) break;
    const asItem = current as PageItem;
    last = asItem;
    if (typeName && !SKIP_TO_FRAME.test(typeName)) return asItem;
    current = (current as HostObject).parent;
  }
  return last;
}

function resolveParentPage(item: PageItem): Page | null {
  try {
    const parentPage = item.parentPage;
    if (parentPage && typeof parentPage === "object") return parentPage;
  } catch {
    // ignore
  }
  let current: unknown = item;
  for (let depth = 0; depth < 12 && current && typeof current === "object"; depth++) {
    if (typeNameOf(current) === "Page") return current as Page;
    current = (current as HostObject).parent;
  }
  return null;
}

function resolveSpread(item: PageItem): HostObject | null {
  const page = resolveParentPage(item);
  let current: unknown = page || item;
  for (let depth = 0; depth < 12 && current && typeof current === "object"; depth++) {
    const typeName = typeNameOf(current);
    if (/^(MasterSpread|Spread)$/i.test(typeName)) return current as HostObject;
    current = (current as HostObject).parent;
  }
  return null;
}

function isMasterSpread(value: unknown): boolean {
  return /master/i.test(typeNameOf(value));
}

function getLayoutWindow(): {
  activePage?: Page;
  activeSpread?: unknown;
} | null {
  const app = getInDesignApp();
  if (app.activeWindow) return app.activeWindow;
  try {
    const windows = getActiveDocument().layoutWindows;
    if (windows && typeof windows.item === "function" && windows.length > 0) {
      return windows.item(0);
    }
  } catch {
    // ignore
  }
  return null;
}

/** Abre a página ou a página-mestra na janela, como o painel Links. */
function activateItemLocation(item: PageItem): void {
  const window = getLayoutWindow();
  if (!window) return;

  const page = resolveParentPage(item);
  const spread = resolveSpread(item);

  if (spread && isMasterSpread(spread)) {
    try {
      window.activeSpread = spread;
    } catch {
      // ignore
    }
  }

  if (page) {
    try {
      window.activePage = page;
    } catch {
      // ignore
    }
  } else if (spread) {
    try {
      window.activeSpread = spread;
    } catch {
      // ignore
    }
  }
}

function searchDocumentPages(doc: Document, itemId: number, pageName?: string): PageItem | null {
  let found: PageItem | null = null;
  try {
    forEachCollectionItem<Page>(doc.pages, (page) => {
      if (found || !page) return;
      if (!pageOrSpreadMatches(page, pageName)) return;
      found = findOnPage(page, itemId);
    });
  } catch {
    // ignore
  }
  return found;
}

function searchMasterSpreads(doc: Document, itemId: number, pageName?: string): PageItem | null {
  let found: PageItem | null = null;
  try {
    forEachCollectionItem<HostObject>(doc.masterSpreads, (spread) => {
      if (found || !spread?.isValid) return;
      const spreadMatches = pageOrSpreadMatches(spread, pageName);
      try {
        forEachCollectionItem<Page>(spread.pages, (page) => {
          if (found || !page) return;
          if (pageName && !spreadMatches && !pageOrSpreadMatches(page, pageName)) return;
          found = findOnPage(page, itemId);
        });
      } catch {
        // ignore
      }
      if (!found && (!pageName || spreadMatches)) {
        found = findOnSpread(spread, itemId);
      }
    });
  } catch {
    // ignore
  }
  return found;
}

function findPageItem(doc: Document, itemId: number, pageName?: string): PageItem | null {
  const preferMaster = looksLikeMasterPageName(pageName);

  const search = (name?: string): PageItem | null => {
    if (preferMaster) {
      return searchMasterSpreads(doc, itemId, name) || searchDocumentPages(doc, itemId, name);
    }
    return searchDocumentPages(doc, itemId, name) || searchMasterSpreads(doc, itemId, name);
  };

  return search(pageName) || (pageName ? search(undefined) : null);
}

/** Seleciona o objeto no documento, como “Ir para o vínculo” no painel Links. */
export function revealPageItemById(itemId: number, pageName?: string): boolean {
  if (!Number.isFinite(itemId) || itemId <= 0) return false;

  try {
    const item = findPageItem(getActiveDocument(), itemId, pageName);
    if (!item) return false;

    const target = selectableFrame(item);
    activateItemLocation(target);

    const app = getInDesignApp() as { select?: (value: unknown) => void };
    if (typeof app.select !== "function") return false;
    app.select(target);
    return true;
  } catch {
    return false;
  }
}

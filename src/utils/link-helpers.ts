import type { Document, Link, Page, PageItem } from "indesign";
import { forEachCollectionItem, getCollectionItem } from "./collection-helpers";
import { getInDesignModule } from "./indesign-runtime";
import { readLinkPageItemId } from "./page-item-reveal";

export const LINK_STATUS_VALUES = {
  NORMAL: 1852797549,
  LINK_OUT_OF_DATE: 1819242340,
  LINK_MISSING: 1819109747,
  LINK_EMBEDDED: 1282237028,
  LINK_INACCESSIBLE: 1818848865,
} as const;

export interface PlacedLinkInfo {
  link: Link;
  pageName: string;
  objectName: string;
  itemId?: number;
}

function resolveLinkStatusConstants(): Record<keyof typeof LINK_STATUS_VALUES, number> {
  try {
    const { LinkStatus } = getInDesignModule() as {
      LinkStatus: Record<string, number>;
    };

    return {
      NORMAL: LinkStatus.NORMAL ?? LinkStatus.normal ?? LINK_STATUS_VALUES.NORMAL,
      LINK_OUT_OF_DATE:
        LinkStatus.LINK_OUT_OF_DATE ??
        LinkStatus.linkOutOfDate ??
        LINK_STATUS_VALUES.LINK_OUT_OF_DATE,
      LINK_MISSING:
        LinkStatus.LINK_MISSING ??
        LinkStatus.linkMissing ??
        LINK_STATUS_VALUES.LINK_MISSING,
      LINK_EMBEDDED:
        LinkStatus.LINK_EMBEDDED ??
        LinkStatus.linkEmbedded ??
        LINK_STATUS_VALUES.LINK_EMBEDDED,
      LINK_INACCESSIBLE:
        LinkStatus.LINK_INACCESSIBLE ??
        LinkStatus.linkInaccessible ??
        LINK_STATUS_VALUES.LINK_INACCESSIBLE,
    };
  } catch {
    return LINK_STATUS_VALUES;
  }
}

function statusLabel(status: unknown): string {
  return String(status || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function getLinkStatus(link: Link): unknown {
  try {
    return link.status;
  } catch {
    return LINK_STATUS_VALUES.NORMAL;
  }
}

export function isLinkMissing(status: unknown): boolean {
  const constants = resolveLinkStatusConstants();
  if (status === constants.LINK_MISSING || status === LINK_STATUS_VALUES.LINK_MISSING) {
    return true;
  }
  const label = statusLabel(status);
  return label.includes("missing") || label.includes("ausente") || label.includes("quebrado");
}

export function isLinkModified(status: unknown): boolean {
  const constants = resolveLinkStatusConstants();
  if (status === constants.LINK_OUT_OF_DATE || status === LINK_STATUS_VALUES.LINK_OUT_OF_DATE) {
    return true;
  }
  const label = statusLabel(status);
  return (
    label.includes("outofdate") ||
    label.includes("modified") ||
    label.includes("modificado") ||
    label.includes("lodt")
  );
}

export function isLinkInaccessible(status: unknown): boolean {
  const constants = resolveLinkStatusConstants();
  if (status === constants.LINK_INACCESSIBLE || status === LINK_STATUS_VALUES.LINK_INACCESSIBLE) {
    return true;
  }
  const label = statusLabel(status);
  return label.includes("inaccessible") || label.includes("inacessivel");
}

export function isLinkEmbedded(status: unknown): boolean {
  const constants = resolveLinkStatusConstants();
  if (status === constants.LINK_EMBEDDED || status === LINK_STATUS_VALUES.LINK_EMBEDDED) {
    return true;
  }
  const label = statusLabel(status);
  return label.includes("embedded") || label.includes("incorporado");
}

export function isRemoteLink(link: Link): boolean {
  try {
    const uri = (link.linkResourceURI || link.filePath || "").toLowerCase();
    return uri.startsWith("http://") || uri.startsWith("https://");
  } catch {
    return false;
  }
}

function resolveLinkPageName(link: Link): string {
  try {
    let current: { parent?: unknown; parentPage?: Page | number; name?: string; constructor?: { name?: string } } | null =
      (link as Link & { parent?: unknown }).parent as {
        parent?: unknown;
        parentPage?: Page | number;
        name?: string;
        constructor?: { name?: string };
      } | null;

    for (let depth = 0; depth < 8 && current; depth++) {
      const typeName = current.constructor?.name || "";
      if (typeName === "MasterSpread" || typeName === "Spread") {
        return current.name ? `Página-mestra ${current.name}` : "Página-mestra";
      }

      const parentPage = current.parentPage;
      if (parentPage && typeof parentPage === "object" && parentPage.name) {
        return parentPage.name;
      }

      current = (current.parent as typeof current) || null;
    }
  } catch {
    // ignore
  }
  return "Página-mestra";
}

/**
 * Coleta os mesmos vínculos do painel Links / comprovação do InDesign,
 * inclusive os posicionados em página-mestra.
 */
export function collectPlacedLinks(doc: Document): PlacedLinkInfo[] {
  const seen = new Set<number>();
  const result: PlacedLinkInfo[] = [];

  const pushLink = (link: Link, pageName: string, objectName: string): void => {
    if (!link?.isValid) return;
    if (seen.has(link.id)) return;
    seen.add(link.id);
    result.push({
      link,
      pageName,
      objectName: link.name || objectName,
      itemId: readLinkPageItemId(link),
    });

    try {
      forEachCollectionItem<Link>(link.links, (child) => {
        pushLink(child, pageName, child.name || objectName);
      });
    } catch {
      // ignore nested
    }
  };

  try {
    forEachCollectionItem<Link>(doc.links, (link) => {
      pushLink(link, resolveLinkPageName(link), link.name || "Link");
    });
  } catch {
    // fallback abaixo
  }

  if (result.length > 0) {
    return result;
  }

  const walkItems = (container: unknown, pageName: string, recurse: boolean): void => {
    forEachCollectionItem<PageItem>(container, (item) => {
      if (!item || !item.isValid) return;
      const extra = item as PageItem & { epss?: unknown; pdfs?: unknown };

      for (const collection of [item.graphics, item.images, extra.epss, extra.pdfs]) {
        forEachCollectionItem<{ itemLink: Link | null; isValid: boolean }>(collection, (graphic) => {
          if (!graphic?.isValid || !graphic.itemLink) return;
          pushLink(graphic.itemLink, pageName, graphic.itemLink.name || "Link");
        });
      }

      if (!recurse) return;
      try {
        if (!getCollectionItem<PageItem>(item.pageItems, 0)) return;
        walkItems(item.pageItems, pageName, true);
      } catch {
        // ignore
      }
    });
  };

  try {
    forEachCollectionItem<Page>(doc.pages, (page, index) => {
      if (!page || !page.isValid) return;
      const pageName = page.name || `Página ${index + 1}`;
      try {
        const flat = page.allPageItems;
        if (flat) {
          walkItems(flat, pageName, false);
          return;
        }
      } catch {
        // fallback abaixo
      }
      walkItems(page.pageItems, pageName, true);
    });
  } catch {
    return result;
  }

  return result;
}

export function getLinkDetails(link: Link): string {
  try {
    return link.filePath || link.linkResourceURI || "";
  } catch {
    return "";
  }
}

export function getLinkFixSuggestion(status: unknown, link: Link): string {
  const path = getLinkDetails(link);

  if (isLinkMissing(status)) {
    return `Correção: Painel Links → selecione "${link.name || path}" → Relink → escolha o arquivo original no disco.`;
  }

  if (isLinkModified(status)) {
    return `Correção: Painel Links → selecione "${link.name || path}" → Atualizar (o arquivo no disco foi alterado).`;
  }

  if (isLinkInaccessible(status)) {
    return `Correção: Verifique a conexão de rede ou faça Relink para uma cópia local de "${link.name || path}".`;
  }

  return "";
}

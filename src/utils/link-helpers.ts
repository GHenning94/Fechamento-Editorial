import type { Document, Link, Page, PageItem } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";
import { getInDesignModule } from "./indesign-runtime";

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

export function getLinkStatus(link: Link): number {
  try {
    return link.status;
  } catch {
    return LINK_STATUS_VALUES.NORMAL;
  }
}

export function isLinkMissing(status: number): boolean {
  const constants = resolveLinkStatusConstants();
  return status === constants.LINK_MISSING;
}

export function isLinkModified(status: number): boolean {
  const constants = resolveLinkStatusConstants();
  return status === constants.LINK_OUT_OF_DATE;
}

export function isLinkInaccessible(status: number): boolean {
  const constants = resolveLinkStatusConstants();
  return status === constants.LINK_INACCESSIBLE;
}

export function isLinkEmbedded(status: number): boolean {
  const constants = resolveLinkStatusConstants();
  return status === constants.LINK_EMBEDDED;
}

export function isRemoteLink(link: Link): boolean {
  try {
    const uri = (link.linkResourceURI || link.filePath || "").toLowerCase();
    return uri.startsWith("http://") || uri.startsWith("https://");
  } catch {
    return false;
  }
}

function collectLinkTree(link: Link, bucket: Link[], seen: Set<number>): void {
  if (!link || !link.isValid) return;

  const linkId = link.id;
  if (seen.has(linkId)) return;
  seen.add(linkId);
  bucket.push(link);

  try {
    forEachCollectionItem<Link>(link.links, (child) => {
      collectLinkTree(child, bucket, seen);
    });
  } catch {
    // ignore nested link traversal errors
  }
}

function collectLinksFromContainer(
  container: unknown,
  pageName: string,
  objectName: string,
  seen: Set<number>,
  result: PlacedLinkInfo[]
): void {
  forEachCollectionItem<{ itemLink: Link | null; isValid: boolean }>(container, (item) => {
    if (!item || !item.isValid) return;

    const links: Link[] = [];
    if (item.itemLink && item.itemLink.isValid) {
      collectLinkTree(item.itemLink, links, new Set<number>());
    }

    for (const link of links) {
      if (seen.has(link.id)) continue;
      seen.add(link.id);

      result.push({
        link,
        pageName,
        objectName: link.name || objectName,
      });
    }
  });
}

/**
 * Coleta apenas links efetivamente posicionados no layout (via graphics/images),
 * alinhado ao comportamento do preflight nativo do InDesign.
 */
export function collectPlacedLinks(doc: Document): PlacedLinkInfo[] {
  const seen = new Set<number>();
  const result: PlacedLinkInfo[] = [];

  const walkItems = (container: unknown, pageName: string, parentName: string): void => {
    forEachCollectionItem<PageItem>(container, (item) => {
      if (!item || !item.isValid) return;

      const objectName = item.name || parentName || item.constructor.name || "Objeto";

      collectLinksFromContainer(item.graphics, pageName, objectName, seen, result);
      collectLinksFromContainer(item.images, pageName, objectName, seen, result);

      if (item.pageItems && item.pageItems.length > 0) {
        walkItems(item.pageItems, pageName, objectName);
      }
    });
  };

  try {
    forEachCollectionItem<Page>(doc.pages, (page, index) => {
      if (!page || !page.isValid) return;

      const pageName = page.name || `Página ${index + 1}`;
      const items = page.allPageItems || page.pageItems;
      if (!items) return;

      walkItems(items, pageName, "Objeto");
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

export function getLinkFixSuggestion(status: number, link: Link): string {
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

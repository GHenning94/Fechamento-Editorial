import type { Document, Page, Spread } from "indesign";
import { forEachCollectionItem } from "./collection-helpers";

/**
 * Lombada: páginas do mesmo spread lado a lado.
 * Espiral: páginas uma abaixo da outra (cada uma no próprio spread).
 */
export function coverShouldExportReaderSpreads(doc: Document): boolean {
  let sideBySide = false;

  forEachCollectionItem<Spread>(doc.spreads, (spread) => {
    if (sideBySide || !spread?.isValid) return;

    const centers: Array<{ x: number; y: number }> = [];
    forEachCollectionItem<Page>(spread.pages, (page) => {
      if (!page?.isValid) return;
      try {
        const bounds = page.bounds as number[];
        if (!bounds || bounds.length < 4) return;
        const top = Number(bounds[0]);
        const left = Number(bounds[1]);
        const bottom = Number(bounds[2]);
        const right = Number(bounds[3]);
        if ([top, left, bottom, right].some((value) => Number.isNaN(value))) return;
        centers.push({ x: (left + right) / 2, y: (top + bottom) / 2 });
      } catch {
        // ignora página sem bounds
      }
    });

    if (centers.length < 2) return;

    let minX = centers[0].x;
    let maxX = centers[0].x;
    let minY = centers[0].y;
    let maxY = centers[0].y;
    for (const center of centers) {
      minX = Math.min(minX, center.x);
      maxX = Math.max(maxX, center.x);
      minY = Math.min(minY, center.y);
      maxY = Math.max(maxY, center.y);
    }

    if (maxX - minX > maxY - minY) {
      sideBySide = true;
    }
  });

  return sideBySide;
}

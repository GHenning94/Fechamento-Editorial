import type { Document } from "indesign";
import { GraphicInfo, StrokeInfo } from "../models/validator";
import {
  collectGraphicsFromItem,
  getPageItemDisplayName,
  walkDirectPageItems,
} from "../utils/indesign-helpers";

export class DocumentScan {
  private graphicsCache: GraphicInfo[] | null = null;
  private strokesCache: StrokeInfo[] | null = null;

  constructor(private readonly doc: Document) {}

  getGraphics(): GraphicInfo[] {
    this.ensurePageItemCaches();
    return this.graphicsCache ?? [];
  }

  getStrokes(): StrokeInfo[] {
    this.ensurePageItemCaches();
    return this.strokesCache ?? [];
  }

  private ensurePageItemCaches(): void {
    if (this.graphicsCache && this.strokesCache) {
      return;
    }

    const graphics: GraphicInfo[] = [];
    const strokes: StrokeInfo[] = [];
    const graphicSeen = new Set<string>();

    walkDirectPageItems(this.doc, (item, _page, pageName) => {
      try {
        const weight = item.strokeWeight;
        if (weight > 0) {
          strokes.push({
            pageName,
            objectName: getPageItemDisplayName(item),
            weight,
            pageItem: item,
          });
        }

        collectGraphicsFromItem(item, pageName, graphics, graphicSeen);
      } catch {
        // ignora item inválido
      }
    });

    this.graphicsCache = graphics;
    this.strokesCache = strokes;
  }
}

import type { Document } from "indesign";
import { GraphicInfo, StrokeInfo } from "../models/validator";
import {
  getImageColorSpaceLabel,
  getPageItemDisplayName,
  walkDirectPageItems,
} from "../utils/indesign-helpers";
import { forEachCollectionItem } from "../utils/collection-helpers";

type GraphicLike = {
  itemLink: import("indesign").Link | null;
  isValid: boolean;
  space: number;
  effectiveResolution: number;
  actualPpi: number[];
};

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

        this.collectGraphicsFromItem(item, pageName, graphics);
      } catch {
        // ignora item inválido
      }
    });

    this.graphicsCache = graphics;
    this.strokesCache = strokes;
  }

  private collectGraphicsFromItem(
    item: import("indesign").PageItem,
    pageName: string,
    graphics: GraphicInfo[]
  ): void {
    forEachCollectionItem<GraphicLike>(item.graphics, (graphic) => {
      if (!graphic?.isValid) return;

      const link = graphic.itemLink;
      const imageName = link && link.isValid ? link.name : item.name || "Imagem";

      graphics.push({
        pageName,
        imageName,
        dpi: getGraphicDpi(graphic),
        colorSpace: getImageColorSpaceLabel(graphic.space),
        pageItem: item,
      });
    });

    forEachCollectionItem<GraphicLike>(item.images, (image) => {
      if (!image?.isValid) return;

      const link = image.itemLink;
      const imageName = link && link.isValid ? link.name : item.name || "Imagem";

      graphics.push({
        pageName,
        imageName,
        dpi: getGraphicDpi(image),
        colorSpace: getImageColorSpaceLabel(image.space),
        pageItem: item,
      });
    });
  }
}

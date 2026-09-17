import type { Document, PageItem } from "indesign";
import { GraphicInfo, StrokeInfo } from "../models/validator";
import {
  collectGraphicsFromItem,
  collectGraphicsFromLinks,
  walkDirectPageItems,
} from "../utils/indesign-helpers";
import { isCorProfColorName, isGuiasDeletarColorName } from "../utils/editorial-color";
import { isPluginGeneratedItem } from "../utils/editorial-layer";
import { isNoneSwatchName, swatchNameOf } from "../utils/color-model";
import { collectGuideTextColorUseFromItem, readGuideColorUse } from "../utils/guide-color-usage";
import { readPageItemId } from "../utils/page-item-reveal";

export interface ColorUseSnap {
  item: PageItem;
  pageName: string;
  objectName: string;
  fillName: string;
  strokeName: string;
  fillOverprint: boolean;
  strokeOverprint: boolean;
}

function isGuideSwatch(name: string): boolean {
  return Boolean(name) && (isCorProfColorName(name) || isGuiasDeletarColorName(name));
}

function mergeColorUsage(usage: ColorUseSnap[]): ColorUseSnap[] {
  const merged = new Map<string, ColorUseSnap>();
  for (const snap of usage) {
    const id = readPageItemId(snap.item) || 0;
    const key = `${id}|${snap.pageName}|${snap.fillName}|${snap.strokeName}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...snap });
      continue;
    }
    if (snap.fillName && !snap.fillOverprint) previous.fillOverprint = false;
    if (snap.strokeName && !snap.strokeOverprint) previous.strokeOverprint = false;
  }
  return Array.from(merged.values());
}

function cheapPageItemName(item: PageItem): string {
  try {
    const named = String(item.name || "").trim();
    if (named) return named;
  } catch {
    // ignore
  }
  try {
    const typeName = item.constructor?.name || "";
    if (typeName === "TextFrame") return "Caixa de texto";
    if (typeName === "Rectangle") return "Retângulo";
    if (typeName === "Oval") return "Elipse";
    if (typeName === "Polygon") return "Polígono";
    if (typeName === "Group") return "Grupo";
    if (typeName === "GraphicLine") return "Linha";
    if (typeName === "Image") return "Imagem";
    return typeName || "Objeto";
  } catch {
    return "Objeto";
  }
}

export class DocumentScan {
  private graphicsCache: GraphicInfo[] | null = null;
  private strokesCache: StrokeInfo[] | null = null;
  private colorUsageCache: ColorUseSnap[] | null = null;

  constructor(private readonly doc: Document) {}

  getGraphics(): GraphicInfo[] {
    this.ensurePageItemCaches();
    return this.graphicsCache ?? [];
  }

  getStrokes(): StrokeInfo[] {
    this.ensurePageItemCaches();
    return this.strokesCache ?? [];
  }

  getColorUsage(): ColorUseSnap[] {
    if (this.colorUsageCache) return this.colorUsageCache;

    const usage: ColorUseSnap[] = [];
    const pushUse = (
      item: PageItem,
      pageName: string,
      objectName: string,
      fillName: string,
      strokeName: string,
      fillOverprint: boolean,
      strokeOverprint: boolean
    ): void => {
      const fillIsGuide = isGuideSwatch(fillName);
      const strokeIsGuide = isGuideSwatch(strokeName);
      if (!fillIsGuide && !strokeIsGuide) return;
      usage.push({
        item,
        pageName,
        objectName,
        fillName: fillIsGuide ? fillName : "",
        strokeName: strokeIsGuide ? strokeName : "",
        fillOverprint,
        strokeOverprint,
      });
    };

    walkDirectPageItems(this.doc, (item, _page, pageName) => {
      const objectName = cheapPageItemName(item);
      const use = readGuideColorUse(item, isGuideSwatch);
      if (use) {
        pushUse(
          item,
          pageName,
          objectName,
          use.fillName,
          use.strokeName,
          use.fillOverprint,
          use.strokeOverprint
        );
      }
      for (const textUse of collectGuideTextColorUseFromItem(item, isGuideSwatch)) {
        pushUse(
          item,
          pageName,
          objectName,
          textUse.fillName,
          textUse.strokeName,
          textUse.fillOverprint,
          textUse.strokeOverprint
        );
      }
    });
    this.colorUsageCache = mergeColorUsage(usage);
    return this.colorUsageCache;
  }

  private ensurePageItemCaches(): void {
    if (this.graphicsCache && this.strokesCache) return;

    const graphics: GraphicInfo[] = [];
    const strokes: StrokeInfo[] = [];
    const graphicSeen = new Set<string>();

    walkDirectPageItems(this.doc, (item, _page, pageName) => {
      try {
        if (!isPluginGeneratedItem(item)) {
          const weight = item.strokeWeight;
          if (typeof weight === "number" && weight > 0) {
            let skipStroke = false;
            try {
              skipStroke = isNoneSwatchName(swatchNameOf(item.strokeColor));
            } catch {
              skipStroke = false;
            }
            if (!skipStroke) {
              strokes.push({
                pageName,
                objectName: "",
                weight,
                pageItem: item,
              });
            }
          }
        }
      } catch {
        // ignora traço ilegível
      }
      try {
        collectGraphicsFromItem(item, pageName, graphics, graphicSeen);
      } catch {
        // ignora item inválido
      }
    });

    try {
      collectGraphicsFromLinks(this.doc, graphics, graphicSeen);
    } catch {
      // painel Links pode falhar em documentos corrompidos
    }

    this.graphicsCache = graphics;
    this.strokesCache = strokes;
  }
}

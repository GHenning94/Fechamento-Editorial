import type { Document, PageItem } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult } from "../models/validation-result";
import { MIN_STROKE_WEIGHT, STROKE_WEIGHT_TOLERANCE_PT, VALIDATOR_IDS } from "../utils/constants";
import { isPluginGeneratedItem } from "../utils/editorial-layer";
import { collectStrokedItems, getPageItemDisplayName } from "../utils/indesign-helpers";
import { getInDesignModule } from "../utils/indesign-runtime";

function unitLooksLikeMillimeters(units: unknown): boolean {
  try {
    const { MeasurementUnits } = getInDesignModule() as {
      MeasurementUnits?: { MILLIMETERS?: number; millimeters?: number };
    };
    const mm = MeasurementUnits?.MILLIMETERS ?? MeasurementUnits?.millimeters;
    if (typeof mm === "number" && units === mm) return true;
    if (units && typeof units === "object") {
      const rec = units as { value?: unknown; name?: unknown };
      if (typeof mm === "number" && rec.value === mm) return true;
      const name = String(rec.name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (name.includes("millimeter") || name.includes("milimetro") || name === "mm") return true;
    }
  } catch {
    // ignore
  }
  const label = String(units || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return label.includes("millimeter") || label.includes("milimetro") || label === "mm";
}

function strokeWeightInPoints(weight: number, doc: Document): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  try {
    const prefs = doc.viewPreferences;
    const units = prefs?.strokeMeasurementUnits ?? prefs?.horizontalMeasurementUnits;
    if (unitLooksLikeMillimeters(units)) {
      return weight * (72 / 25.4);
    }
  } catch {
    // assume pontos
  }
  return weight;
}

function isStrokeTooThin(weightPt: number): boolean {
  return weightPt < MIN_STROKE_WEIGHT - STROKE_WEIGHT_TOLERANCE_PT;
}

function formatStrokePt(weightPt: number): string {
  const rounded = Math.round(weightPt * 1000) / 1000;
  return `${String(rounded).replace(".", ",")} pt`;
}

function strokeIsNone(item: PageItem): boolean {
  try {
    const name = (item.strokeColor?.name || "")
      .replace(/^\[|\]$/g, "")
      .trim()
      .toLowerCase();
    return !name || name === "none" || name === "nenhum" || name === "nenhuma";
  } catch {
    return false;
  }
}

export class FiosValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.FIOS;
  readonly name = "Espessura de Fios";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues = [];
      const strokes = collectStrokedItems(doc);
      const seen = new Set<string>();

      for (const stroke of strokes) {
        if (isPluginGeneratedItem(stroke.pageItem)) continue;
        if (strokeIsNone(stroke.pageItem)) continue;

        const weightPt = strokeWeightInPoints(stroke.weight, doc);
        if (!isStrokeTooThin(weightPt)) continue;

        const objectName = getPageItemDisplayName(stroke.pageItem) || stroke.objectName || "Objeto";
        const key = `${stroke.pageName}::${objectName}::${weightPt.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        issues.push({
          message: "abaixo de 0.3 pt",
          page: stroke.pageName,
          object: objectName,
          value: formatStrokePt(weightPt),
        });
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

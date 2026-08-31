import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { isSpotExceptionColor } from "../utils/indesign-helpers";
import { forEachCollectionItem } from "../utils/collection-helpers";
import type { Color, ColorGroup, ColorGroupSwatch } from "indesign";

const BUILT_IN_SWATCH_NAMES = new Set([
  "none",
  "registration",
  "paper",
  "black",
  "nenhuma",
  "nenhum",
  "registro",
  "papel",
  "preto",
]);

function normalizeBuiltInSwatchName(name: string): string {
  return (name || "")
    .trim()
    .replace(/^\$id\//i, "")
    .replace(/^\[|\]$/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function isBuiltInSwatch(name: string): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  return BUILT_IN_SWATCH_NAMES.has(normalizeBuiltInSwatchName(trimmed));
}

const COR_PREFIX = "Cor";
const COR_NOMENCLATURE_EXAMPLES = "CorAzul, Cor1, CorCMYK";

function isMemorialTagColor(name: string): boolean {
  return (name || "").toUpperCase().startsWith("EAC_TAG");
}

function isRootColorGroupName(name: string): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  // Grupo raiz do InDesign costuma vir entre colchetes / sem nome útil
  return /^\[.*\]$/.test(trimmed);
}

/**
 * Cores dentro de pastas (Color Groups) nomeadas — tipicamente RGB/CMYK
 * puxadas de ilustrações, não criadas para o material editorial.
 */
function collectFolderColorNames(doc: Document): Set<string> {
  const names = new Set<string>();
  const groups = doc.colorGroups;
  if (!groups) return names;

  forEachCollectionItem<ColorGroup>(groups, (group) => {
    if (!group || !group.isValid) return;
    if (isRootColorGroupName(group.name || "")) return;

    forEachCollectionItem<ColorGroupSwatch>(group.colorGroupSwatches, (entry) => {
      if (!entry || !entry.isValid) return;
      try {
        const ref = entry.swatchItemRef;
        const swatchName = (ref?.name || "").trim();
        if (swatchName) names.add(swatchName);
      } catch {
        // ignora entrada inválida
      }
    });
  });

  return names;
}

function isColorInNamedFolder(color: Color, folderNames: Set<string>): boolean {
  const name = (color.name || "").trim();
  if (name && folderNames.has(name)) return true;

  try {
    const group = color.parentColorGroup;
    if (group && group.isValid && !isRootColorGroupName(group.name || "")) {
      return true;
    }
  } catch {
    // parentColorGroup pode falhar em alguns hosts
  }

  return false;
}

export class CoresValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CORES;
  readonly name = "Cores";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const folderColorNames = collectFolderColorNames(doc);

      forEachCollectionItem<Color>(doc.colors, (color) => {
        if (!color || !color.isValid) return;

        const name = (color.name || "").trim();
        if (isBuiltInSwatch(name) || isSpotExceptionColor(name) || isMemorialTagColor(name)) {
          return;
        }

        if (isColorInNamedFolder(color, folderColorNames)) {
          return;
        }

        if (!name.startsWith(COR_PREFIX)) {
          issues.push({
            message: "Nomenclatura inválida",
            object: name,
            details: `O nome da cor deve começar com "Cor" (exatamente assim). Exemplos corretos: ${COR_NOMENCLATURE_EXAMPLES}.`,
            severity: "error",
          });
        }
      });

      const hasError = issues.some((issue) => (issue.severity || "error") === "error");
      return createResult(this.id, this.name, issues, hasError ? "error" : "warning");
    });
  }
}

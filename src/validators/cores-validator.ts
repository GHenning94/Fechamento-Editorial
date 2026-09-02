import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { isSpotExceptionColor } from "../utils/indesign-helpers";
import { forEachCollectionItem } from "../utils/collection-helpers";
import type { Color, ColorGroup, ColorGroupSwatch, Swatch } from "indesign";

const BUILT_IN_SWATCH_NAMES = new Set([
  "none",
  "registration",
  "paper",
  "black",
  "cyan",
  "magenta",
  "yellow",
  "nenhuma",
  "nenhum",
  "registro",
  "papel",
  "preto",
  "ciano",
  "amarelo",
]);

/** Padrão: começa com "Cor_" ou "Cor" (ex.: Cor_texto, CorAzul). */
const COR_PREFIX = "Cor";
const COR_NOMENCLATURE_EXAMPLES = "Cor_texto, CorAzul, Cor1";

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

function isUnnamedColor(name: string): boolean {
  const key = normalizeBuiltInSwatchName(name);
  return (
    !key ||
    key.includes("unnamed") ||
    key.includes("sem nome") ||
    key.includes("semnome") ||
    /^swatch\s*\d+$/.test(key)
  );
}

/** Cores geradas por texto colado do Word — costumam existir em document.colors, não no painel Amostras. */
function isWordImportColor(name: string): boolean {
  return normalizeBuiltInSwatchName(name).startsWith("word");
}

function isPluginTagColor(name: string): boolean {
  return (name || "").toUpperCase().startsWith("EAC_");
}

function isSpotOrSpecialName(name: string): boolean {
  if (isSpotExceptionColor(name)) return true;
  const key = normalizeBuiltInSwatchName(name);
  if (key === "faca" || key === "verniz") return true;
  if (key.startsWith("pantone")) return true;
  return false;
}

function hasStandardColorName(name: string): boolean {
  const trimmed = (name || "").trim();
  return trimmed.startsWith(COR_PREFIX) && trimmed.length > COR_PREFIX.length;
}

function isRootColorGroupName(name: string): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  if (/^\[.*\]$/.test(trimmed)) return true;
  return /^(root|raiz|ungrouped|sem grupo)/i.test(trimmed);
}

function collectUserFolderColorNames(doc: Document): Set<string> {
  const names = new Set<string>();
  const groups = doc.colorGroups;
  if (!groups) return names;

  forEachCollectionItem<ColorGroup>(groups, (group, index) => {
    if (!group || !group.isValid) return;
    if (index === 0) return;
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

function isColorInUserFolder(color: Color, folderNames: Set<string>): boolean {
  const name = (color.name || "").trim();
  return Boolean(name && folderNames.has(name));
}

function isGradientOrMixedInk(item: Swatch | Color): boolean {
  try {
    const typeName = (item as { constructor?: { name?: string } }).constructor?.name || "";
    return /gradient|mixedink/i.test(typeName);
  } catch {
    return false;
  }
}

/**
 * Amostras visíveis no painel Amostras.
 * `document.colors` inclui tintas padrão (Cyan/Magenta/Yellow) e cores
 * sem amostra (ex.: Word_R234_G241_B221 de texto colado) — essas não devem
 * entrar na checagem de nomenclatura.
 */
function eachVisibleColorSwatch(doc: Document, callback: (color: Color) => void): void {
  const source = doc.swatches ?? doc.colors;
  forEachCollectionItem<Swatch | Color>(source, (item) => {
    if (!item || !item.isValid) return;
    if (isGradientOrMixedInk(item)) return;
    callback(item as Color);
  });
}

export class CoresValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CORES;
  readonly name = "Cores";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const folderColorNames = collectUserFolderColorNames(doc);

      eachVisibleColorSwatch(doc, (color) => {
        try {
          const name = (color.name || "").trim();
          if (
            isBuiltInSwatch(name) ||
            isUnnamedColor(name) ||
            isWordImportColor(name) ||
            isSpotOrSpecialName(name) ||
            isPluginTagColor(name)
          ) {
            return;
          }

          if (isColorInUserFolder(color, folderColorNames)) {
            return;
          }

          if (!hasStandardColorName(name)) {
            issues.push({
              message: "Nomenclatura inválida",
              object: name,
              details: `O nome da cor deve começar com "Cor" ou "Cor_" seguido de qualquer texto. Exemplos corretos: ${COR_NOMENCLATURE_EXAMPLES}.`,
              severity: "error",
            });
          }
        } catch {
          // amostra ilegível
        }
      });

      const hasError = issues.some((issue) => (issue.severity || "error") === "error");
      return createResult(this.id, this.name, issues, hasError ? "error" : "warning");
    });
  }
}

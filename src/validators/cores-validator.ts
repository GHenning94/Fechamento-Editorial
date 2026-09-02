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

const COR_PREFIX = "Cor";
const COR_NOMENCLATURE_EXAMPLES = "CorAzul, Cor1, CorCMYK";

/** Cores das tags do memorial descritivo (EAC_TAG_PARAGRAFO, EAC_TAG_CARACTERE, EAC_TAG_INK). */
function isMemorialTagColor(name: string): boolean {
  return (name || "").toUpperCase().startsWith("EAC_");
}

function isRootColorGroupName(name: string): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  return /^\[.*\]$/.test(trimmed);
}

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

function isProcessColorSwatch(item: Swatch | Color): item is Color {
  const color = item as Color;
  return color.model != null || typeof color.space === "number";
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
    if (!isProcessColorSwatch(item)) return;
    callback(item);
  });
}

export class CoresValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CORES;
  readonly name = "Cores";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const folderColorNames = collectFolderColorNames(doc);

      eachVisibleColorSwatch(doc, (color) => {
        const name = (color.name || "").trim();
        if (
          isBuiltInSwatch(name) ||
          isUnnamedColor(name) ||
          isWordImportColor(name) ||
          isSpotExceptionColor(name) ||
          isMemorialTagColor(name)
        ) {
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

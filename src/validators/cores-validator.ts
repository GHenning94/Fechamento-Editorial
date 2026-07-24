import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { isSpotExceptionColor } from "../utils/indesign-helpers";
import { forEachCollectionItem } from "../utils/collection-helpers";
import type { Color } from "indesign";

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

function isValidCorNomenclature(name: string): boolean {
  const trimmed = (name || "").trim();
  return trimmed.startsWith(COR_PREFIX);
}

export class CoresValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CORES;
  readonly name = "Cores";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];

      forEachCollectionItem<Color>(doc.colors, (color) => {
        if (!color || !color.isValid) return;

        const name = (color.name || "").trim();
        if (isBuiltInSwatch(name) || isSpotExceptionColor(name)) {
          return;
        }

        if (!isValidCorNomenclature(name)) {
          issues.push({
            message: "Nomenclatura inválida",
            object: name,
            details: `O nome da cor deve começar com "Cor" (exatamente assim). Exemplos corretos: ${COR_NOMENCLATURE_EXAMPLES}.`,
          });
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

import type { Document } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";

interface StyleGroupLike {
  name?: string;
  isValid?: boolean;
  paragraphStyleGroups?: unknown;
  characterStyleGroups?: unknown;
}

function isRootGroupName(name: string): boolean {
  const trimmed = (name || "").trim();
  if (!trimmed) return true;
  return /^\[.*\]$/.test(trimmed);
}

function collectGroupNames(collection: unknown, nestedKey: "paragraphStyleGroups" | "characterStyleGroups"): string[] {
  const names: string[] = [];

  const walk = (groups: unknown, prefix: string, depth: number): void => {
    if (depth > 8) return;
    forEachCollectionItem<StyleGroupLike>(groups, (group) => {
      if (!group || group.isValid === false) return;
      const name = (group.name || "").trim();
      if (isRootGroupName(name)) {
        walk(group[nestedKey], prefix, depth + 1);
        return;
      }

      const label = prefix ? `${prefix}/${name}` : name;
      names.push(label);
      walk(group[nestedKey], label, depth + 1);
    });
  };

  walk(collection, "", 0);
  return names;
}

export class EstilosPastasValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.ESTILOS_PASTAS;
  readonly name = "Pastas de Estilos";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const seen = new Set<string>();

      const push = (kind: string, folderName: string): void => {
        const key = `${kind}::${folderName}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({
          message: "Pasta de estilos não permitida",
          object: `${kind}: ${folderName}`,
          details: "Remova a pasta e deixe os estilos na raiz do painel.",
        });
      };

      try {
        for (const name of collectGroupNames(doc.paragraphStyleGroups, "paragraphStyleGroups")) {
          push("Parágrafo", name);
        }
      } catch {
        // coleção ausente em alguns hosts
      }

      try {
        for (const name of collectGroupNames(doc.characterStyleGroups, "characterStyleGroups")) {
          push("Caractere", name);
        }
      } catch {
        // coleção ausente em alguns hosts
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

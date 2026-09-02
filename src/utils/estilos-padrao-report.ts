import type { ValidationIssue } from "../models/validation-result";
import type { StylePropertyIssue } from "./style-property-compare";

const IGNORED_PROPERTIES = new Set([
  "Alinhamento",
  "Justificação",
  "Justification",
  "justification",
]);

/**
 * Um erro por estilo fora da paleta. Alinhamento é ignorado.
 * Nos estilos de professor, tamanho/peso diferente vira alerta.
 */
export function reportStandardStyleIssues(
  styleName: string,
  propertyIssues: StylePropertyIssue[],
  options?: { sizeAsWarning?: boolean }
): ValidationIssue[] {
  const relevant = propertyIssues.filter((issue) => !IGNORED_PROPERTIES.has(issue.property));
  const out: ValidationIssue[] = [];

  if (options?.sizeAsWarning) {
    const hasSize = relevant.some((issue) => issue.property === "Tamanho");
    if (hasSize) {
      out.push({
        message: "Peso diferente do padrão da paleta",
        object: styleName,
        details: "Peso de fonte diferente do original. Validar.",
        severity: "warning",
      });
    }
  }

  const forError = options?.sizeAsWarning
    ? relevant.filter((issue) => issue.property !== "Tamanho")
    : relevant;

  if (forError.length > 0) {
    out.push({
      message: "Estilo padrão fora da paleta",
      object: styleName,
      details: "Puxe o original da paleta de estilos.",
      severity: "error",
    });
  }

  return out;
}

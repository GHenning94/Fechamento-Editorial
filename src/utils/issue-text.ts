import type { ValidationIssue } from "../models/validation-result";

function includesIgnoreCase(haystack: string, needle: string): boolean {
  const token = (needle || "").trim();
  if (!token) return false;
  return haystack.toLowerCase().includes(token.toLowerCase());
}

/** Não acrescenta um trecho que já está no texto (evita "NOME ... - NOME"). */
export function appendUniqueSegment(base: string, extra: string, separator: string): string {
  const left = (base || "").trim();
  const right = (extra || "").trim();
  if (!right) return left;
  if (!left) return right;
  if (includesIgnoreCase(left, right)) return left;
  return `${left}${separator}${right}`;
}

export function formatIssueLine(
  issue: ValidationIssue,
  options?: {
    kind?: string;
    separator?: string;
    objectPrefix?: string;
    includeDetails?: boolean;
  }
): string {
  const sep = options?.separator ?? " — ";
  let line = (issue.message || "").trim();
  if (options?.kind) {
    line = `${options.kind}: ${line}`;
  }

  if (issue.page) {
    const page = issue.page.trim();
    if (page && !includesIgnoreCase(line, page)) {
      const pageLabel = sep.includes("—") ? `Pág: ${page}` : `pág. ${page}`;
      line = appendUniqueSegment(line, pageLabel, sep);
    }
  }

  if (issue.object) {
    const object = issue.object.trim();
    if (object && !includesIgnoreCase(line, object)) {
      const label = options?.objectPrefix ? `${options.objectPrefix}${object}` : object;
      line = appendUniqueSegment(line, label, sep);
    }
  }

  if (issue.value) {
    line = appendUniqueSegment(line, issue.value.trim(), sep);
  }

  if (options?.includeDetails && issue.details) {
    const details = issue.details.trim();
    if (details && !includesIgnoreCase(line, details)) {
      line = appendUniqueSegment(line, details, sep);
    }
  }

  return line;
}

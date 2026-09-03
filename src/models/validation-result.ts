export type ValidationSeverity = "success" | "warning" | "error";

export interface ValidationIssue {
  message: string;
  details?: string;
  page?: string;
  object?: string;
  value?: string;
  /** ID do PageItem no InDesign. Se existir, a UI mostra “Ir até o item”. */
  itemId?: number;
  severity?: ValidationSeverity;
}

export interface ValidationResult {
  validatorId: string;
  validatorName: string;
  severity: ValidationSeverity;
  issues: ValidationIssue[];
}

export interface ValidationSummary {
  errors: number;
  warnings: number;
  approved: number;
  results: ValidationResult[];
}

export function createSuccessResult(
  validatorId: string,
  validatorName: string,
  message?: string
): ValidationResult {
  return {
    validatorId,
    validatorName,
    severity: "success",
    issues: message ? [{ message }] : [],
  };
}

export function createResult(
  validatorId: string,
  validatorName: string,
  issues: ValidationIssue[],
  severity: ValidationSeverity
): ValidationResult {
  return {
    validatorId,
    validatorName,
    severity: issues.length === 0 ? "success" : severity,
    issues,
  };
}

export function getIssueSeverity(
  result: ValidationResult,
  issue: ValidationIssue
): ValidationSeverity {
  return issue.severity || result.severity;
}

export function makeIssueKey(
  result: ValidationResult,
  issue: ValidationIssue,
  index: number
): string {
  return [
    result.validatorId,
    index,
    issue.message,
    issue.object || "",
    issue.page || "",
    issue.details || "",
    issue.value || "",
  ].join("::");
}

export function summarizeResults(results: ValidationResult[]): ValidationSummary {
  let errors = 0;
  let warnings = 0;
  let approved = 0;

  for (const result of results) {
    if (result.severity === "success" || !result.issues || result.issues.length === 0) {
      if (result.severity === "success") {
        approved += 1;
      } else if (result.severity === "warning") {
        warnings += 1;
      } else if (result.severity === "error") {
        errors += 1;
      }
      continue;
    }

    let hasError = false;
    let hasWarning = false;
    for (const issue of result.issues) {
      const severity = getIssueSeverity(result, issue);
      if (severity === "error") hasError = true;
      if (severity === "warning") hasWarning = true;
    }

    if (hasError) errors += 1;
    if (hasWarning) warnings += 1;
    if (!hasError && !hasWarning) approved += 1;
  }

  return { errors, warnings, approved, results };
}

/** Remove avisos ignorados e recalcula totais. */
export function filterIgnoredWarnings(
  summary: ValidationSummary,
  ignoredKeys: Set<string>
): ValidationSummary {
  const results: ValidationResult[] = summary.results.map((result) => {
    if (!result.issues || result.issues.length === 0) {
      return result;
    }

    const issues = result.issues.filter((issue, index) => {
      const severity = getIssueSeverity(result, issue);
      if (severity !== "warning") return true;
      return !ignoredKeys.has(makeIssueKey(result, issue, index));
    });

    if (issues.length === 0) {
      return {
        ...result,
        severity: "success" as const,
        issues: [],
      };
    }

    const severity = issues.some((issue) => getIssueSeverity(result, issue) === "error")
      ? ("error" as const)
      : issues.some((issue) => getIssueSeverity(result, issue) === "warning")
        ? ("warning" as const)
        : ("success" as const);

    return { ...result, issues, severity };
  });

  return summarizeResults(results);
}

export function hasBlockingErrors(summary: ValidationSummary): boolean {
  return summary.errors > 0;
}

export type ValidationSeverity = "success" | "warning" | "error";

export interface ValidationIssue {
  message: string;
  details?: string;
  page?: string;
  object?: string;
  value?: string;
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

export function summarizeResults(results: ValidationResult[]): ValidationSummary {
  let errors = 0;
  let warnings = 0;
  let approved = 0;

  for (const result of results) {
    if (result.severity === "error") {
      errors += 1;
    } else if (result.severity === "warning") {
      warnings += 1;
    } else {
      approved += 1;
    }
  }

  return { errors, warnings, approved, results };
}

export function hasBlockingErrors(summary: ValidationSummary): boolean {
  return summary.errors > 0;
}

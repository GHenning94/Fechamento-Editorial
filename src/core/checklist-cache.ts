import { ValidationSummary } from "../models/validation-result";

interface ChecklistCacheEntry {
  documentName: string;
  documentPath: string;
  summary: ValidationSummary;
  validatedAt: string;
}

let cachedChecklist: ChecklistCacheEntry | null = null;

export function storeChecklistResult(
  documentName: string,
  documentPath: string,
  summary: ValidationSummary
): void {
  cachedChecklist = {
    documentName,
    documentPath,
    summary,
    validatedAt: new Date().toISOString(),
  };
}

export function getCachedChecklistResult(
  documentName: string,
  documentPath: string
): ValidationSummary | null {
  if (!cachedChecklist) {
    return null;
  }

  if (
    cachedChecklist.documentName !== documentName ||
    cachedChecklist.documentPath !== documentPath
  ) {
    return null;
  }

  return cachedChecklist.summary;
}

export function clearChecklistCache(): void {
  cachedChecklist = null;
}

export function hasCachedChecklist(documentName: string, documentPath: string): boolean {
  return getCachedChecklistResult(documentName, documentPath) !== null;
}

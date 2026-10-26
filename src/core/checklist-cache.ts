import { ValidationSummary } from "../models/validation-result";

interface ChecklistCacheEntry {
  documentName: string;
  documentPath: string;
  summary: ValidationSummary;
  validatedAt: string;
}

const cachedChecklists = new Map<string, ChecklistCacheEntry>();

function cacheKey(profile: string, documentName: string, documentPath: string): string {
  return `${profile}\n${documentName}\n${documentPath}`;
}

export function storeChecklistResult(
  profile: string,
  documentName: string,
  documentPath: string,
  summary: ValidationSummary
): void {
  cachedChecklists.set(cacheKey(profile, documentName, documentPath), {
    documentName,
    documentPath,
    summary,
    validatedAt: new Date().toISOString(),
  });
}

export function getCachedChecklistResult(
  profile: string,
  documentName: string,
  documentPath: string
): ValidationSummary | null {
  const cachedChecklist = cachedChecklists.get(cacheKey(profile, documentName, documentPath));
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

export function clearChecklistCache(profile?: string): void {
  if (!profile) {
    cachedChecklists.clear();
    return;
  }
  const prefix = `${profile}\n`;
  Array.from(cachedChecklists.keys()).forEach((key) => {
    if (key.startsWith(prefix)) cachedChecklists.delete(key);
  });
}

export function hasCachedChecklist(
  profile: string,
  documentName: string,
  documentPath: string
): boolean {
  return getCachedChecklistResult(profile, documentName, documentPath) !== null;
}

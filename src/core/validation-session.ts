import type { Document } from "indesign";
import { DocumentScan } from "./document-scan";
import { getValidationScan, setValidationScan } from "./validation-cache";

let retained = false;

export function retainValidationScan(doc: Document): DocumentScan {
  retained = true;
  let scan = getValidationScan();
  if (!scan) {
    scan = new DocumentScan(doc);
    setValidationScan(scan);
  }
  return scan;
}

export function releaseValidationScan(): void {
  retained = false;
  setValidationScan(null);
}

export function withValidationSession<T>(doc: Document, fn: () => T): T {
  const existing = getValidationScan();
  if (existing) return fn();

  setValidationScan(new DocumentScan(doc));
  try {
    return fn();
  } finally {
    if (!retained) setValidationScan(null);
  }
}

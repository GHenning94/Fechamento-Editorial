import type { Document } from "indesign";
import { DocumentScan } from "./document-scan";
import { setValidationScan } from "./validation-cache";

export function withValidationSession<T>(doc: Document, fn: () => T): T {
  setValidationScan(new DocumentScan(doc));
  try {
    return fn();
  } finally {
    setValidationScan(null);
  }
}

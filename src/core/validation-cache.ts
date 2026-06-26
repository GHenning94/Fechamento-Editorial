import { DocumentScan } from "./document-scan";

let activeScan: DocumentScan | null = null;

export function setValidationScan(scan: DocumentScan | null): void {
  activeScan = scan;
}

export function getValidationScan(): DocumentScan | null {
  return activeScan;
}

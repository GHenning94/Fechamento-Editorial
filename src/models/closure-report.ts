import { ValidationSummary } from "./validation-result";

export interface ExportPaths {
  packageRoot: string;
  reportPath: string;
}

export interface ExportArtifacts {
  packageGenerated: boolean;
  idmlGenerated: boolean;
  pdfArteGenerated: boolean;
  pdfEstilosGenerated: boolean;
  pdfPresetMissing: boolean;
  pdfMemorialLayerMissing: boolean;
  paths: ExportPaths;
  inddPath?: string;
  idmlPath?: string;
  pdfArtePath?: string;
  pdfEstilosPath?: string;
  pdfWarnings?: string[];
}

export interface ClosureReport {
  date: string;
  user: string;
  documentName: string;
  documentPath: string;
  checklist: ValidationSummary | null;
  reportGenerated: boolean;
  artifacts: ExportArtifacts;
  blocked: boolean;
  blockReason?: string;
}

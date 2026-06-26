import type { Document } from "indesign";
import { ExportArtifacts, ExportPaths } from "../models/closure-report";
import { exportPdfArte, exportPdfEstilos } from "./pdf-export-service";
import {
  ensureFolder,
  joinPath,
  sanitizeFileName,
} from "../utils/file-system";

export class PackageService {
  async buildPackageStructure(documentName: string, destinationFolder: string): Promise<ExportPaths> {
    const docBaseName = sanitizeFileName(documentName.replace(/\.indd$/i, ""));
    const packageRoot = await ensureFolder(destinationFolder, docBaseName);

    return {
      packageRoot,
      reportPath: joinPath(packageRoot, "Relatorio_Fechamento.html"),
    };
  }

  runPackageForPrint(doc: Document, paths: ExportPaths): void {
    doc.packageForPrint(
      paths.packageRoot,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      false,
      "",
      true,
      "EDITORIAL AUTOCLOSE",
      true
    );
  }
}

export type PackageExportResult = Pick<
  ExportArtifacts,
  "packageGenerated" | "idmlGenerated" | "paths" | "inddPath" | "idmlPath"
>;

export type PdfExportArtifacts = Pick<
  ExportArtifacts,
  | "pdfArteGenerated"
  | "pdfEstilosGenerated"
  | "pdfPresetMissing"
  | "pdfMemorialLayerMissing"
  | "pdfArtePath"
  | "pdfEstilosPath"
  | "pdfWarnings"
>;

export class ExportService {
  readonly packageService = new PackageService();

  runPackage(doc: Document, paths: ExportPaths): PackageExportResult {
    const docBaseName = sanitizeFileName(doc.name.replace(/\.indd$/i, ""));
    const inddPath = joinPath(paths.packageRoot, `${docBaseName}.indd`);
    const idmlPath = joinPath(paths.packageRoot, `${docBaseName}.idml`);

    let packageGenerated = false;

    try {
      this.packageService.runPackageForPrint(doc, paths);
      packageGenerated = true;
    } catch {
      packageGenerated = false;
    }

    return {
      packageGenerated,
      idmlGenerated: packageGenerated,
      paths,
      inddPath: packageGenerated ? inddPath : undefined,
      idmlPath: packageGenerated ? idmlPath : undefined,
    };
  }

  runPdfArte(doc: Document, paths: ExportPaths): PdfExportArtifacts {
    const docBaseName = sanitizeFileName(doc.name.replace(/\.indd$/i, ""));
    const arte = exportPdfArte(doc, paths.packageRoot, docBaseName);

    return {
      pdfArteGenerated: arte.arteGenerated,
      pdfEstilosGenerated: false,
      pdfPresetMissing: arte.presetMissing,
      pdfMemorialLayerMissing: false,
      pdfArtePath: arte.artePath,
      pdfWarnings: arte.warnings.length > 0 ? arte.warnings : undefined,
    };
  }

  runPdfEstilos(doc: Document, paths: ExportPaths): PdfExportArtifacts {
    const docBaseName = sanitizeFileName(doc.name.replace(/\.indd$/i, ""));
    const estilos = exportPdfEstilos(doc, paths.packageRoot, docBaseName);

    return {
      pdfArteGenerated: false,
      pdfEstilosGenerated: estilos.estilosGenerated,
      pdfPresetMissing: false,
      pdfMemorialLayerMissing: estilos.memorialLayerMissing,
      pdfEstilosPath: estilos.estilosPath,
      pdfWarnings: estilos.warnings.length > 0 ? estilos.warnings : undefined,
    };
  }

  mergeArtifacts(
    packageResult: PackageExportResult,
    pdfArte: PdfExportArtifacts,
    pdfEstilos: PdfExportArtifacts
  ): ExportArtifacts {
    const pdfWarnings = [...(pdfArte.pdfWarnings ?? []), ...(pdfEstilos.pdfWarnings ?? [])];

    return {
      ...packageResult,
      pdfArteGenerated: pdfArte.pdfArteGenerated,
      pdfEstilosGenerated: pdfEstilos.pdfEstilosGenerated,
      pdfPresetMissing: pdfArte.pdfPresetMissing,
      pdfMemorialLayerMissing: pdfEstilos.pdfMemorialLayerMissing,
      pdfArtePath: pdfArte.pdfArtePath,
      pdfEstilosPath: pdfEstilos.pdfEstilosPath,
      pdfWarnings: pdfWarnings.length > 0 ? pdfWarnings : undefined,
    };
  }
}

import { ExportService, PdfExportArtifacts } from "../services/export-service";
import { ReportService } from "../services/report-service";
import { ClosureReport } from "../models/closure-report";
import { ValidationSummary, hasBlockingErrors } from "../models/validation-result";
import {
  clearInDesignSelection,
  getActiveDocument,
  runInDesignHeavyMutation,
  runInDesignReadOnly,
} from "../utils/indesign-runtime";
import {
  ensureDocumentSaved,
  PackageCancelledError,
} from "../utils/file-system";
import { findEditorialLayer, findRendimentoLayer } from "../utils/editorial-layer";
import { yieldForUi, yieldToHost } from "../utils/yield-to-host";
import {
  getCachedChecklistResult,
  storeChecklistResult,
} from "./checklist-cache";
import { ChecklistRunner, ProgressCallback } from "./checklist-runner";

const HEAVY_STEP_PAUSE_MS = 1000;
const FINAL_PAUSE_MS = 800;

export class ClosureOrchestrator {
  private checklistRunner = new ChecklistRunner();
  private exportService = new ExportService();
  private reportService = new ReportService();

  async runChecklist(onProgress?: ProgressCallback, signal?: AbortSignal): Promise<ValidationSummary> {
    const summary = await this.checklistRunner.runAsync(onProgress, signal);
    this.cacheCurrentDocumentChecklist(summary);
    return summary;
  }

  async exportChecklistReport(summary: ValidationSummary, filePath: string, userName: string): Promise<string> {
    const docInfo = runInDesignReadOnly("EDITORIAL AUTOCLOSE — Documento (relatório)", () => {
      const doc = getActiveDocument();
      return {
        name: doc.name,
        path: this.readDocumentPath(doc),
      };
    });

    return this.reportService.generateChecklistReport(
      {
        date: new Date().toLocaleDateString("pt-BR"),
        user: userName,
        documentName: docInfo.name,
        documentPath: docInfo.path,
        checklist: summary,
      },
      filePath
    );
  }

  getCurrentDocumentInfo(): { name: string; path: string } {
    return runInDesignReadOnly("EDITORIAL AUTOCLOSE — Documento", () => {
      const doc = getActiveDocument();
      return {
        name: doc.name,
        path: this.readDocumentPath(doc),
      };
    });
  }

  hasMemorialLayer(): boolean {
    return runInDesignReadOnly("EDITORIAL AUTOCLOSE — Layer memorial", () =>
      Boolean(findEditorialLayer(getActiveDocument()))
    );
  }

  hasRendimentoLayer(): boolean {
    return runInDesignReadOnly("EDITORIAL AUTOCLOSE — Layer rendimento", () =>
      Boolean(findRendimentoLayer(getActiveDocument()))
    );
  }

  cacheCurrentDocumentChecklist(summary: ValidationSummary): void {
    const docInfo = runInDesignReadOnly("EDITORIAL AUTOCLOSE — Cache Checklist", () => {
      const doc = getActiveDocument();
      return {
        name: doc.name,
        path: this.readDocumentPath(doc),
      };
    });
    storeChecklistResult(docInfo.name, docInfo.path, summary);
  }

  async closeMaterial(
    userName: string,
    destinationFolder: string,
    onProgress?: ProgressCallback
  ): Promise<ClosureReport> {
    const totalSteps = 6;
    clearInDesignSelection();

    onProgress?.(1, totalSteps, "Salvando documento...");
    await yieldForUi();
    await ensureDocumentSaved();
    await yieldToHost(HEAVY_STEP_PAUSE_MS);

    const docInfo = runInDesignReadOnly("EDITORIAL AUTOCLOSE — Documento", () => {
      const doc = getActiveDocument();
      return {
        name: doc.name,
        path: this.readDocumentPath(doc),
      };
    });

    const cachedChecklist = getCachedChecklistResult(docInfo.name, docInfo.path);

    const paths = await this.exportService.packageService.buildPackageStructure(
      docInfo.name,
      destinationFolder
    );
    await yieldToHost(300);

    onProgress?.(2, totalSteps, "Gerando package InDesign...");
    await yieldForUi();
    const packageResult = runInDesignHeavyMutation("EDITORIAL AUTOCLOSE — Package", () =>
      this.exportService.runPackage(getActiveDocument(), paths)
    );
    clearInDesignSelection();
    await yieldToHost(HEAVY_STEP_PAUSE_MS);

    onProgress?.(3, totalSteps, "Exportando PDF páginas simples (sem memorial)...");
    await yieldForUi();
    const pdfArteResult = runInDesignHeavyMutation("EDITORIAL AUTOCLOSE — PDF Arte", () =>
      this.exportService.runPdfArte(getActiveDocument(), paths)
    );
    clearInDesignSelection();
    await yieldToHost(HEAVY_STEP_PAUSE_MS);

    const skipEstilosPdf = pdfArteResult.pdfPresetMissing;
    let pdfEstilosResult: PdfExportArtifacts = {
      pdfArteGenerated: false,
      pdfEstilosGenerated: false,
      pdfPresetMissing: false,
      pdfMemorialLayerMissing: false,
    };

    if (!skipEstilosPdf) {
      onProgress?.(4, totalSteps, "Exportando PDF spreads (com memorial)...");
      await yieldForUi();
      pdfEstilosResult = runInDesignHeavyMutation("EDITORIAL AUTOCLOSE — PDF Estilos", () =>
        this.exportService.runPdfEstilos(getActiveDocument(), paths)
      );
      clearInDesignSelection();
      await yieldToHost(HEAVY_STEP_PAUSE_MS);
    }

    const artifacts = this.exportService.mergeArtifacts(packageResult, pdfArteResult, pdfEstilosResult);

    const pdfWarnings = artifacts.pdfWarnings ?? [];
    const hasValidationErrors = cachedChecklist ? hasBlockingErrors(cachedChecklist) : false;
    const closureWarnings = [
      hasValidationErrors
        ? "Package gerado com avisos: foram encontrados erros no checklist (veja o relatório)."
        : undefined,
      ...pdfWarnings,
    ].filter(Boolean);

    let reportGenerated = false;

    if (cachedChecklist) {
      onProgress?.(5, totalSteps, "Gerando relatório...");
      await yieldToHost(400);

      const report: ClosureReport = {
        date: new Date().toLocaleDateString("pt-BR"),
        user: userName,
        documentName: docInfo.name,
        documentPath: docInfo.path,
        checklist: cachedChecklist,
        reportGenerated: false,
        artifacts,
        blocked: false,
        blockReason: closureWarnings.length > 0 ? closureWarnings.join(" ") : undefined,
      };

      try {
        await this.reportService.generate(report);
        reportGenerated = true;
        report.reportGenerated = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.blockReason = `Package gerado, mas relatório HTML falhou: ${message}`;
      }

      onProgress?.(6, totalSteps, "Fechamento concluído");
      clearInDesignSelection();
      await yieldToHost(FINAL_PAUSE_MS);
      return report;
    }

    onProgress?.(5, totalSteps, "Finalizando...");
    await yieldToHost(FINAL_PAUSE_MS);
    onProgress?.(6, totalSteps, "Fechamento concluído");
    clearInDesignSelection();

    return {
      date: new Date().toLocaleDateString("pt-BR"),
      user: userName,
      documentName: docInfo.name,
      documentPath: docInfo.path,
      checklist: null,
      reportGenerated,
      artifacts,
      blocked: false,
      blockReason:
        closureWarnings.length > 0
          ? closureWarnings.join(" ")
          : "Relatório não gerado: execute VALIDAR CHECKLIST antes do fechamento.",
    };
  }

  private readDocumentPath(doc: import("indesign").Document): string {
    try {
      const fullName = doc.fullName as unknown;
      if (typeof fullName === "string" && fullName) {
        return fullName;
      }
      if (fullName && typeof fullName === "object") {
        const file = fullName as { fsName?: string; nativePath?: string };
        if (file.fsName) return file.fsName;
        if (file.nativePath) return file.nativePath;
      }
    } catch {
      // ignore
    }

    try {
      const filePath = doc.filePath as unknown;
      if (typeof filePath === "string" && filePath) {
        return filePath;
      }
    } catch {
      // ignore
    }

    return "Não salvo";
  }
}

export { PackageCancelledError };

import { ClosureReport } from "../models/closure-report";
import { ValidationResult, ValidationSummary } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { PackageCancelledError, promptPackageFolder } from "../utils/file-system";
import { yieldToHost } from "../utils/yield-to-host";
import { getDefaultReportUserName } from "../utils/indesign-runtime";
import { onActionActivate, setActionDisabled } from "./action-control";
import { promptUserNameDialog } from "./user-name-dialog";

export type ProgressHandler = (percent: number, label: string) => void;

export class PanelController {
  private btnChecklist: HTMLElement | null;
  private btnDownloadReport: HTMLElement | null;
  private btnClose: HTMLElement | null;
  private progressBar: HTMLProgressElement | null;
  private progressLabel: HTMLElement | null;
  private countErrors: HTMLElement | null;
  private countWarnings: HTMLElement | null;
  private countApproved: HTMLElement | null;
  private listApproved: HTMLElement | null;
  private listWarnings: HTMLElement | null;
  private listErrors: HTMLElement | null;
  private statusMessage: HTMLElement | null;
  private reportDownloadAllowed = false;

  constructor(private root: HTMLElement) {
    this.btnChecklist = root.querySelector("#btn-checklist");
    this.btnDownloadReport = root.querySelector("#btn-download-report");
    this.btnClose = root.querySelector("#btn-close");
    this.progressBar = root.querySelector("#progress-bar");
    this.progressLabel = root.querySelector("#progress-label");
    this.countErrors = root.querySelector("#count-errors");
    this.countWarnings = root.querySelector("#count-warnings");
    this.countApproved = root.querySelector("#count-approved");
    this.listApproved = root.querySelector("#list-approved");
    this.listWarnings = root.querySelector("#list-warnings");
    this.listErrors = root.querySelector("#list-errors");
    this.statusMessage = root.querySelector("#status-message");
  }

  isReady(): boolean {
    return Boolean(
      this.btnChecklist &&
      this.btnDownloadReport &&
      this.btnClose &&
      this.progressBar &&
      this.progressLabel &&
      this.statusMessage
    );
  }

  bindHandlers(handlers: {
    onChecklist: () => Promise<void>;
    onDownloadReport: () => Promise<void>;
    onClose: (userName: string, destinationFolder: string) => Promise<ClosureReport>;
  }): void {
    if (!this.isReady()) return;

    onActionActivate(this.btnChecklist, () => {
      void this.runAction(handlers.onChecklist);
    });
    onActionActivate(this.btnDownloadReport, () => {
      void this.runAction(handlers.onDownloadReport);
    });
    onActionActivate(this.btnClose, () => {
      void this.runClose(handlers.onClose);
    });
  }

  private async runClose(
    onClose: (userName: string, destinationFolder: string) => Promise<ClosureReport>
  ): Promise<void> {
    let userName: string;
    try {
      userName = await promptUserNameDialog(getDefaultReportUserName());
    } catch (error) {
      if (error instanceof PackageCancelledError) {
        this.setStatus(error.message, "info");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, "error");
      return;
    }

    this.setStatus("Selecione a pasta de destino do package...", "info");
    await yieldToHost(0);

    let destinationFolder: string;
    try {
      destinationFolder = await promptPackageFolder();
    } catch (error) {
      if (error instanceof PackageCancelledError) {
        this.setStatus(error.message, "info");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, "error");
      return;
    }

    let report: ClosureReport | undefined;
    await this.runAction(async () => {
      report = await onClose(userName, destinationFolder);
    });

    if (!report) {
      return;
    }

    const closureReport = report;
    await yieldToHost(500);
    this.setProgress(
      100,
      closureReport.blockReason ? "Fechamento concluído com avisos" : "Fechamento concluído"
    );
    await yieldToHost(150);
    this.renderClosureReport(closureReport);
  }

  private async runAction(action: () => Promise<void>): Promise<void> {
    this.setBusy(true);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, "error");
    } finally {
      this.setBusy(false);
    }
  }

  setBusy(busy: boolean): void {
    setActionDisabled(this.btnChecklist, busy);
    setActionDisabled(this.btnClose, busy);
    setActionDisabled(this.btnDownloadReport, busy || !this.reportDownloadAllowed);
  }

  setReportDownloadEnabled(enabled: boolean): void {
    this.reportDownloadAllowed = enabled;
    if (!this.btnDownloadReport) return;

    if (enabled) {
      this.btnDownloadReport.classList.remove("hidden");
      setActionDisabled(this.btnDownloadReport, false);
    } else {
      this.btnDownloadReport.classList.add("hidden");
      setActionDisabled(this.btnDownloadReport, true);
    }
  }

  setLocked(locked: boolean): void {
    this.setBusy(locked);
  }

  setProgress(percent: number, label: string): void {
    if (this.progressBar) this.progressBar.value = percent;
    if (this.progressLabel) this.progressLabel.textContent = label;
  }

  resetProgress(): void {
    if (this.progressBar) this.progressBar.value = 0;
    if (this.progressLabel) this.progressLabel.textContent = "Aguardando…";
  }

  renderSummary(summary: ValidationSummary, title: string): void {
    const safe = this.normalizeSummary(summary);

    if (this.countErrors) this.countErrors.textContent = String(safe.errors);
    if (this.countWarnings) this.countWarnings.textContent = String(safe.warnings);
    if (this.countApproved) this.countApproved.textContent = String(safe.approved);

    if (this.listApproved) {
      this.listApproved.innerHTML = this.renderResultList(safe.results, "success");
    }
    if (this.listWarnings) {
      this.listWarnings.innerHTML = this.renderResultList(safe.results, "warning");
    }
    if (this.listErrors) {
      this.listErrors.innerHTML = this.renderResultList(safe.results, "error");
    }

    this.setStatus(
      `${title} concluído.`,
      safe.errors > 0 ? "error" : safe.warnings > 0 ? "warning" : "success"
    );
  }

  renderClosureReport(report: ClosureReport): void {
    if (report.checklist) {
      const checklist = this.normalizeSummary(report.checklist);

      if (this.countErrors) this.countErrors.textContent = String(checklist.errors);
      if (this.countWarnings) this.countWarnings.textContent = String(checklist.warnings);
      if (this.countApproved) this.countApproved.textContent = String(checklist.approved);

      const allResults = checklist.results;
      if (this.listApproved) {
        this.listApproved.innerHTML = this.renderResultList(allResults, "success");
      }
      if (this.listWarnings) {
        this.listWarnings.innerHTML = this.renderResultList(allResults, "warning");
      }
      if (this.listErrors) {
        this.listErrors.innerHTML = this.renderResultList(allResults, "error");
      }
    }

    const hasValidationErrors = report.checklist ? this.normalizeSummary(report.checklist).errors > 0 : false;

    if (report.blocked) {
      this.setStatus(report.blockReason || "Fechamento bloqueado devido a erros.", "error");
      return;
    }

    const details = [
      report.artifacts.packageGenerated ? "Package InDesign gerado" : "Falha ao gerar package",
      report.artifacts.idmlGenerated ? "IDML incluído" : null,
      report.artifacts.pdfArteGenerated ? "PDF arte gerado" : null,
      report.artifacts.pdfEstilosGenerated ? "PDF _ESTILOS gerado" : null,
      report.artifacts.pdfWarnings?.length ? report.artifacts.pdfWarnings.join(" ") : null,
      report.reportGenerated ? `Relatório: ${report.artifacts.paths.reportPath}` : "Sem relatório (checklist não validado)",
    ]
      .filter(Boolean)
      .join(" | ");

    const statusType = !report.artifacts.packageGenerated
      ? "error"
      : hasValidationErrors || report.blockReason
        ? "warning"
        : "success";

    const prefix = hasValidationErrors
      ? "Fechamento concluído com avisos no checklist."
      : report.reportGenerated
        ? "Fechamento concluído."
        : "Fechamento concluído (sem relatório).";

    this.setStatus(`${prefix} ${details}`, statusType);
  }

  private normalizeSummary(summary: ValidationSummary | null | undefined): ValidationSummary {
    if (!summary) {
      return { errors: 0, warnings: 0, approved: 0, results: [] };
    }

    return {
      errors: summary.errors ?? 0,
      warnings: summary.warnings ?? 0,
      approved: summary.approved ?? 0,
      results: Array.isArray(summary.results) ? summary.results : [],
    };
  }

  private shouldHideFromApproved(result: ValidationResult): boolean {
    return result.validatorId === VALIDATOR_IDS.CORES && result.severity === "success";
  }

  private renderResultList(results: ValidationResult[] | null | undefined, severity: string): string {
    const safeResults = Array.isArray(results) ? results : [];
    const filtered = safeResults.filter((r) => {
      if (severity === "success" && this.shouldHideFromApproved(r)) {
        return false;
      }
      return r.severity === severity;
    });

    if (filtered.length === 0) {
      return '<li class="empty-item">Nenhum item</li>';
    }

    return filtered
      .map((result) => {
        if (!result.issues || result.issues.length === 0) {
          return `<li><span class="item-title">${this.escape(result.validatorName)}</span> — OK</li>`;
        }

        const issues = result.issues
          .map((issue) => {
            const parts = [issue.message];
            if (issue.page) parts.push(`Pág: ${issue.page}`);
            if (issue.object) parts.push(`Objeto: ${issue.object}`);
            if (issue.value) parts.push(issue.value);
            let line = `<div class="issue-line">${this.escape(parts.join(" — "))}</div>`;
            if (issue.details) {
              line += `<div class="issue-detail">${this.escape(issue.details)}</div>`;
            }
            return line;
          })
          .join("");

        return `<li><span class="item-title">${this.escape(result.validatorName)}</span>${issues}</li>`;
      })
      .join("");
  }

  setStatus(message: string, type: "success" | "warning" | "error" | "info" = "info"): void {
    if (!this.statusMessage) return;
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message status-${type}`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

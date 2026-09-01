import { ClosureReport } from "../models/closure-report";
import {
  filterIgnoredWarnings,
  getIssueSeverity,
  makeIssueKey,
  ValidationIssue,
  ValidationResult,
  ValidationSummary,
} from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { PackageCancelledError, promptPackageFolder } from "../utils/file-system";
import { yieldToHost } from "../utils/yield-to-host";
import { getDefaultReportUserName } from "../utils/indesign-runtime";
import { onActionActivate, setActionDisabled } from "./action-control";
import { promptConfirmDialog } from "./confirm-dialog";
import { promptUserNameDialog } from "./user-name-dialog";
import { showResultsDetailDialog } from "./results-detail-dialog";
import { bindResultGroupToggles } from "./result-group-toggle";
import { tryExpandPanelToHostHeight } from "./panel-expand";

export type ProgressHandler = (percent: number, label: string) => void;

export class PanelController {
  private btnChecklist: HTMLElement | null;
  private btnCreateStyles: HTMLElement | null;
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
  private rawSummary: ValidationSummary | null = null;
  private ignoredWarningKeys = new Set<string>();
  private onSummaryFiltered: ((summary: ValidationSummary) => void) | null = null;

  constructor(private root: HTMLElement) {
    this.btnChecklist = root.querySelector("#btn-checklist");
    this.btnCreateStyles = root.querySelector("#btn-create-styles");
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
    this.bindResultExpanders();
  }

  private bindResultExpanders(): void {
    const results = this.root.querySelector(".results") as HTMLElement | null;
    if (!results) return;

    const mapping: Array<{
      listId: string;
      title: string;
      kind: "approved" | "warning" | "error";
    }> = [
      { listId: "list-approved", title: "Aprovados", kind: "approved" },
      { listId: "list-warnings", title: "Alertas", kind: "warning" },
      { listId: "list-errors", title: "Erros", kind: "error" },
    ];

    const expanders = results.querySelectorAll<HTMLElement>(".result-expand");
    expanders.forEach((expander, index) => {
      const entry = mapping[index];
      if (!entry) return;

      onActionActivate(expander, () => {
    void this.openResultDetailModal(entry.listId, entry.title, entry.kind);
      });
    });
  }

  private openResultDetailModal(
    listId: string,
    title: string,
    kind: "approved" | "warning" | "error"
  ): void {
    const list = this.root.querySelector(`#${listId}`) as HTMLElement | null;
    const html = list?.innerHTML || '<li class="empty-item">Nenhum item</li>';

    showResultsDetailDialog({
      title,
      kind,
      html,
      onIgnore:
        kind === "warning"
          ? (key: string) => {
              this.ignoredWarningKeys.add(key);
              this.refreshSummaryUi();
              this.setStatus("Aviso ignorado. Ele não sairá no relatório.", "info");
            }
          : undefined,
    });
  }

  isReady(): boolean {
    return Boolean(
      this.btnChecklist &&
      this.btnCreateStyles &&
      this.btnDownloadReport &&
      this.btnClose &&
      this.progressBar &&
      this.progressLabel &&
      this.statusMessage
    );
  }

  setSummaryFilterListener(listener: (summary: ValidationSummary) => void): void {
    this.onSummaryFiltered = listener;
  }

  /** Resumo com avisos ignorados já removidos (para relatório/cache). */
  getSummaryForReport(): ValidationSummary | null {
    if (!this.rawSummary) return null;
    return filterIgnoredWarnings(this.rawSummary, this.ignoredWarningKeys);
  }

  bindHandlers(handlers: {
    onChecklist: () => Promise<void>;
    onCreateStyles: () => Promise<void>;
    onDownloadReport: () => Promise<void>;
    onClose: (userName: string, destinationFolder: string) => Promise<ClosureReport>;
    hasMemorialLayer: () => boolean;
  }): void {
    if (!this.isReady()) return;

    onActionActivate(this.btnChecklist, () => {
      void this.runAction(handlers.onChecklist);
    });
    onActionActivate(this.btnCreateStyles, () => {
      void this.runAction(handlers.onCreateStyles);
    });
    onActionActivate(this.btnDownloadReport, () => {
      void this.runAction(handlers.onDownloadReport);
    });
    onActionActivate(this.btnClose, () => {
      void this.runClose(handlers.onClose, handlers.hasMemorialLayer);
    });
  }

  private async runClose(
    onClose: (userName: string, destinationFolder: string) => Promise<ClosureReport>,
    hasMemorialLayer: () => boolean
  ): Promise<void> {
    try {
      if (!hasMemorialLayer()) {
        const proceed = await promptConfirmDialog();
        if (!proceed) {
          this.setStatus("Fechamento cancelado.", "info");
          return;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, "error");
      return;
    }

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
    setActionDisabled(this.btnCreateStyles, busy);
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
    this.rawSummary = this.normalizeSummary(summary);
    this.ignoredWarningKeys.clear();
    this.root.classList.add("has-results");
    this.refreshSummaryUi(`${title} concluído.`);
    tryExpandPanelToHostHeight();
    window.setTimeout(() => tryExpandPanelToHostHeight(), 120);
  }

  private refreshSummaryUi(statusMessage?: string): void {
    const safe = this.getSummaryForReport() || {
      errors: 0,
      warnings: 0,
      approved: 0,
      results: [],
    };

    if (this.countErrors) this.countErrors.textContent = String(safe.errors);
    if (this.countWarnings) this.countWarnings.textContent = String(safe.warnings);
    if (this.countApproved) this.countApproved.textContent = String(safe.approved);

    if (this.listApproved) {
      this.listApproved.innerHTML = this.renderResultList(safe.results, "success");
    }
    if (this.listWarnings) {
      this.listWarnings.innerHTML = this.renderResultList(this.rawSummary?.results || [], "warning", true);
      this.bindIgnoreButtons();
      bindResultGroupToggles(this.listWarnings);
    }
    if (this.listErrors) {
      this.listErrors.innerHTML = this.renderResultList(safe.results, "error");
      bindResultGroupToggles(this.listErrors);
    }

    if (statusMessage) {
      this.setStatus(
        statusMessage,
        safe.errors > 0 ? "error" : safe.warnings > 0 ? "warning" : "success"
      );
    }

    this.onSummaryFiltered?.(safe);
  }

  private bindIgnoreButtons(): void {
    if (!this.listWarnings) return;

    const buttons = this.listWarnings.querySelectorAll<HTMLElement>("[data-ignore-key]");
    buttons.forEach((button) => {
      const key = button.getAttribute("data-ignore-key");
      if (!key) return;

      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.ignoredWarningKeys.add(key);
        this.refreshSummaryUi();
        this.setStatus("Aviso ignorado. Ele não sairá no relatório.", "info");
      };
    });
  }

  renderClosureReport(report: ClosureReport): void {
    if (report.checklist) {
      this.rawSummary = this.normalizeSummary(report.checklist);
      this.ignoredWarningKeys.clear();
      this.refreshSummaryUi();
    }

    const hasValidationErrors = report.checklist
      ? this.normalizeSummary(report.checklist).errors > 0
      : false;

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
      report.reportGenerated
        ? `Relatório: ${report.artifacts.paths.reportPath}`
        : "Sem relatório (checklist não validado)",
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

  private collectIssuesBySeverity(
    results: ValidationResult[],
    severity: "success" | "warning" | "error"
  ): Array<{ result: ValidationResult; issue: ValidationIssue; index: number }> {
    const items: Array<{ result: ValidationResult; issue: ValidationIssue; index: number }> = [];

    for (const result of results) {
      if (severity === "success") {
        if (this.shouldHideFromApproved(result)) continue;
        if (result.severity === "success") {
          items.push({
            result,
            issue: { message: "OK" },
            index: -1,
          });
        }
        continue;
      }

      const issues = Array.isArray(result.issues) ? result.issues : [];
      issues.forEach((issue, index) => {
        if (getIssueSeverity(result, issue) !== severity) return;
        if (severity === "warning" && this.ignoredWarningKeys.has(makeIssueKey(result, issue, index))) {
          return;
        }
        items.push({ result, issue, index });
      });
    }

    return items;
  }

  private renderResultList(
    results: ValidationResult[] | null | undefined,
    severity: "success" | "warning" | "error",
    withIgnore = false
  ): string {
    const safeResults = Array.isArray(results) ? results : [];

    if (severity === "success") {
      const approved = safeResults.filter(
        (result) => result.severity === "success" && !this.shouldHideFromApproved(result)
      );
      if (approved.length === 0) {
        return '<li class="empty-item">Nenhum item</li>';
      }
      return approved
        .map(
          (result) =>
            `<li><span class="item-title">${this.escape(result.validatorName)}</span> — OK</li>`
        )
        .join("");
    }

    const grouped = new Map<string, Array<{ result: ValidationResult; issue: ValidationIssue; index: number }>>();
    for (const item of this.collectIssuesBySeverity(safeResults, severity)) {
      const key = item.result.validatorId;
      const list = grouped.get(key) || [];
      list.push(item);
      grouped.set(key, list);
    }

    if (grouped.size === 0) {
      return '<li class="empty-item">Nenhum item</li>';
    }

    return Array.from(grouped.values())
      .map((entries) => {
        const validatorName = entries[0].result.validatorName;
        const count = entries.length;
        const issuesHtml = entries
          .map(({ result, issue, index }) => {
            const parts = [issue.message];
            if (issue.page) parts.push(`Pág: ${issue.page}`);
            if (issue.object) parts.push(`Objeto: ${issue.object}`);
            if (issue.value) parts.push(issue.value);

            const ignoreKey = makeIssueKey(result, issue, index);
            const ignoreBtn =
              withIgnore && severity === "warning"
                ? `<span class="issue-ignore" data-ignore-key="${this.escape(ignoreKey)}" role="button" tabindex="0">Ignorar</span>`
                : "";

            let line = `<div class="issue-line-row"><div class="issue-line">${this.escape(parts.join(" — "))}</div>${ignoreBtn}</div>`;
            if (issue.details) {
              line += `<div class="issue-detail">${this.escape(issue.details)}</div>`;
            }
            return `<div class="result-group-issue">${line}</div>`;
          })
          .join("");

        return `
          <li class="result-group">
            <div
              class="result-group-toggle"
              data-result-group-toggle
              role="button"
              tabindex="0"
              aria-expanded="false"
            >
              <span class="result-group-chevron">▸</span>
              <span class="item-title">${this.escape(validatorName)}</span>
              <span class="result-group-count">${count}</span>
            </div>
            <div class="result-group-body">${issuesHtml}</div>
          </li>
        `;
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
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

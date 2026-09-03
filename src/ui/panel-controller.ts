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
import { isChecklistCancelled } from "../core/checklist-runner";
import { onActionActivate, setActionDisabled } from "./action-control";
import { promptConfirmDialog } from "./confirm-dialog";
import { promptUserNameDialog } from "./user-name-dialog";
import { showResultsDetailDialog, updateOpenResultsDetailDialogs } from "./results-detail-dialog";
import { bindResultGroupToggles } from "./result-group-toggle";
import { tryExpandPanelToHostHeight } from "./panel-expand";
import { formatIssueLine } from "../utils/issue-text";
import { getValidatorSuccessText } from "../utils/validator-success-text";
import { boostElementWheelScroll } from "./fast-scroll";
import { bindIssueGoTo } from "./issue-goto";
import { revealPageItemById } from "../utils/page-item-reveal";

export type ProgressHandler = (percent: number, label: string) => void;

export class PanelController {
  private btnChecklist: HTMLElement | null;
  private btnCreateStyles: HTMLElement | null;
  private btnCreateRendimento: HTMLElement | null;
  private btnDownloadReport: HTMLElement | null;
  private btnClose: HTMLElement | null;
  private progressBar: HTMLProgressElement | null;
  private progressLabel: HTMLElement | null;
  private btnCancelChecklist: HTMLElement | null;
  private actionAbort: AbortController | null = null;
  private cancelling = false;
  private countErrors: HTMLElement | null;
  private countWarnings: HTMLElement | null;
  private countApproved: HTMLElement | null;
  private listApproved: HTMLElement | null;
  private listWarnings: HTMLElement | null;
  private listErrors: HTMLElement | null;
  private statusMessage: HTMLElement | null;
  private statusText: HTMLElement | null;
  private btnIgnoreAllWarnings: HTMLElement | null;
  private reportDownloadAllowed = false;
  private rawSummary: ValidationSummary | null = null;
  private ignoredWarningKeys = new Set<string>();
  private onSummaryFiltered: ((summary: ValidationSummary) => void) | null = null;

  constructor(private root: HTMLElement) {
    this.btnChecklist = root.querySelector("#btn-checklist");
    this.btnCreateStyles = root.querySelector("#btn-create-styles");
    this.btnCreateRendimento = root.querySelector("#btn-create-rendimento");
    this.btnDownloadReport = root.querySelector("#btn-download-report");
    this.btnClose = root.querySelector("#btn-close");
    this.progressBar = root.querySelector("#progress-bar");
    this.progressLabel = root.querySelector("#progress-label");
    this.btnCancelChecklist = root.querySelector("#btn-cancel-checklist");
    this.countErrors = root.querySelector("#count-errors");
    this.countWarnings = root.querySelector("#count-warnings");
    this.countApproved = root.querySelector("#count-approved");
    this.listApproved = root.querySelector("#list-approved");
    this.listWarnings = root.querySelector("#list-warnings");
    this.listErrors = root.querySelector("#list-errors");
    this.statusMessage = root.querySelector("#status-message");
    this.statusText = root.querySelector("#status-message-text");
    this.btnIgnoreAllWarnings = root.querySelector("#btn-ignore-all-warnings");
    this.bindResultExpanders();
    [this.listApproved, this.listWarnings, this.listErrors].forEach((list) => {
      if (list) boostElementWheelScroll(list);
    });
    if (this.listWarnings) bindIssueGoTo(this.listWarnings, (itemId) => this.goToIssueItem(itemId));
    if (this.listErrors) bindIssueGoTo(this.listErrors, (itemId) => this.goToIssueItem(itemId));
    if (this.btnIgnoreAllWarnings) {
      onActionActivate(this.btnIgnoreAllWarnings, () => this.ignoreAllWarnings());
    }
    if (this.btnCancelChecklist) {
      const onCancel = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        this.cancelRunningAction();
      };
      this.btnCancelChecklist.addEventListener("pointerdown", onCancel, true);
      this.btnCancelChecklist.addEventListener("mousedown", onCancel, true);
      this.btnCancelChecklist.addEventListener("click", onCancel);
    }
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
      onIgnoreAll: kind === "warning" ? () => this.ignoreAllWarnings() : undefined,
      onGoTo: kind === "approved" ? undefined : (itemId) => this.goToIssueItem(itemId),
    });
  }

  isReady(): boolean {
    return Boolean(
      this.btnChecklist &&
      this.btnCreateStyles &&
      this.btnCreateRendimento &&
      this.btnDownloadReport &&
      this.btnClose &&
      this.progressBar &&
      this.progressLabel &&
      this.statusMessage &&
      this.statusText
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
    onCreateRendimento: () => Promise<void>;
    onDownloadReport: () => Promise<void>;
    onClose: (userName: string, destinationFolder: string) => Promise<ClosureReport>;
    hasMemorialLayer: () => boolean;
    hasRendimentoLayer: () => boolean;
  }): void {
    if (!this.isReady()) return;

    onActionActivate(this.btnChecklist, () => {
      void this.runAction(handlers.onChecklist);
    });
    onActionActivate(this.btnCreateStyles, () => {
      void this.runAction(handlers.onCreateStyles);
    });
    if (this.btnCreateRendimento) {
      onActionActivate(this.btnCreateRendimento, () => {
        void this.runAction(handlers.onCreateRendimento);
      });
    }
    onActionActivate(this.btnDownloadReport, () => {
      void this.runAction(handlers.onDownloadReport);
    });
    onActionActivate(this.btnClose, () => {
      void this.runClose(handlers.onClose, handlers.hasMemorialLayer, handlers.hasRendimentoLayer);
    });
  }

  private async runClose(
    onClose: (userName: string, destinationFolder: string) => Promise<ClosureReport>,
    hasMemorialLayer: () => boolean,
    hasRendimentoLayer: () => boolean
  ): Promise<void> {
    try {
      const hasMemorial = hasMemorialLayer();
      const hasRendimento = hasRendimentoLayer();
      if (!hasMemorial && !hasRendimento) {
        const proceed = await promptConfirmDialog(
          [
            "Não existem a layer de memorial descritivo e a layer de rendimento neste documento.",
            "Os PDFs serão gerados mesmo assim, sem essas layers.",
            "Deseja fechar o material mesmo assim?",
          ].join("\n"),
          "Layers de memorial e rendimento"
        );
        if (!proceed) {
          this.setStatus("Fechamento cancelado.", "info");
          return;
        }
      } else if (!hasMemorial || !hasRendimento) {
        const lines: string[] = [];
        if (!hasMemorial) {
          lines.push("Não existe a layer de memorial descritivo neste documento.");
        }
        if (!hasRendimento) {
          lines.push("Não existe a layer de rendimento neste documento.");
        }
        lines.push("Os PDFs serão gerados mesmo assim, sem essa layer.");
        lines.push("Deseja fechar o material mesmo assim?");
        const title = !hasMemorial
          ? "Layer de memorial descritivo"
          : "Layer de rendimento";
        const proceed = await promptConfirmDialog(lines.join("\n"), title);
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
      if (isChecklistCancelled(error)) {
        this.resetProgress();
        this.setStatus("Operação cancelada.", "info");
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, "error");
    } finally {
      this.finishCancellableAction();
      this.setBusy(false);
    }
  }

  setBusy(busy: boolean): void {
    this.root.classList.toggle("is-working", busy);
    setActionDisabled(this.btnChecklist, busy);
    setActionDisabled(this.btnCreateStyles, busy);
    setActionDisabled(this.btnCreateRendimento, busy);
    setActionDisabled(this.btnClose, busy);
    setActionDisabled(this.btnDownloadReport, busy || !this.reportDownloadAllowed);
  }

  startCancellableAction(): AbortSignal {
    this.actionAbort = new AbortController();
    this.cancelling = false;
    this.setCancelVisible(true);
    return this.actionAbort.signal;
  }

  /** @deprecated Use startCancellableAction */
  startChecklistSignal(): AbortSignal {
    return this.startCancellableAction();
  }

  finishCancellableAction(): void {
    this.actionAbort = null;
    this.cancelling = false;
    this.setCancelVisible(false);
  }

  /** @deprecated Use finishCancellableAction */
  finishChecklistRun(): void {
    this.finishCancellableAction();
  }

  isCancelling(): boolean {
    return this.cancelling;
  }

  private cancelRunningAction(): void {
    if (!this.actionAbort || this.cancelling) return;
    this.cancelling = true;
    this.actionAbort.abort();
    setActionDisabled(this.btnCancelChecklist, true);
    this.resetProgress();
  }

  private setCancelVisible(visible: boolean): void {
    this.btnCancelChecklist?.classList.toggle("hidden", !visible);
    if (visible) {
      setActionDisabled(this.btnCancelChecklist, false);
    }
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
    if (this.cancelling) return;
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
      bindResultGroupToggles(this.listApproved);
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

    if (this.btnIgnoreAllWarnings) {
      this.btnIgnoreAllWarnings.classList.toggle("hidden", safe.warnings === 0);
    }

    this.syncOpenResultWindows();

    if (statusMessage) {
      this.setStatus(statusMessage, "success");
    }

    this.onSummaryFiltered?.(safe);
  }

  private syncOpenResultWindows(): void {
    updateOpenResultsDetailDialogs(
      {
        approved: this.listApproved?.innerHTML || '<li class="empty-item">Nenhum item</li>',
        warning: this.listWarnings?.innerHTML || '<li class="empty-item">Nenhum item</li>',
        error: this.listErrors?.innerHTML || '<li class="empty-item">Nenhum item</li>',
      },
      {
        onIgnore: (key: string) => {
          this.ignoredWarningKeys.add(key);
          this.refreshSummaryUi();
          this.setStatus("Aviso ignorado. Ele não sairá no relatório.", "info");
        },
        onIgnoreAll: () => this.ignoreAllWarnings(),
        onGoTo: (itemId) => this.goToIssueItem(itemId),
      }
    );
  }

  private goToIssueItem(itemId: number): void {
    try {
      const found = revealPageItemById(itemId);
      this.setStatus(
        found ? "Item selecionado no InDesign." : "Não foi possível localizar o item. Ele pode ter sido removido.",
        found ? "success" : "warning"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus(message, "error");
    }
  }

  private ignoreAllWarnings(): void {
    const items = this.collectIssuesBySeverity(this.rawSummary?.results || [], "warning");
    if (items.length === 0) return;
    for (const { result, issue, index } of items) {
      this.ignoredWarningKeys.add(makeIssueKey(result, issue, index));
    }
    this.refreshSummaryUi();
    this.setStatus("Todos os avisos foram ignorados. Eles não sairão no relatório.", "info");
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
        .map((result) => {
          const description = getValidatorSuccessText(result.validatorId, result.validatorName);
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
              <span class="item-title">${this.escape(result.validatorName)}</span>
            </div>
            <div class="result-group-body">
              <div class="result-group-issue">
                <div class="issue-line-row">
                  <div class="issue-line">${this.escape(description)}</div>
                </div>
              </div>
            </div>
          </li>
        `;
        })
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
            const partsLine = formatIssueLine(issue, { objectPrefix: "Objeto: " });

            const ignoreKey = makeIssueKey(result, issue, index);
            const ignoreBtn =
              withIgnore && severity === "warning"
                ? `<span class="issue-ignore" data-ignore-key="${this.escape(ignoreKey)}" role="button" tabindex="0">Ignorar</span>`
                : "";
            const gotoBtn =
              typeof issue.itemId === "number" && issue.itemId > 0
                ? `<span class="issue-goto" data-goto-id="${issue.itemId}" role="button" tabindex="0" title="Selecionar no InDesign">Ir até o item</span>`
                : "";
            const actions =
              gotoBtn || ignoreBtn ? `<div class="issue-line-actions">${gotoBtn}${ignoreBtn}</div>` : "";

            let line = `<div class="issue-line-row"><div class="issue-line">${this.escape(partsLine)}</div>${actions}</div>`;
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
              <span class="result-group-count result-group-count-${severity}">${count}</span>
            </div>
            <div class="result-group-body">${issuesHtml}</div>
          </li>
        `;
      })
      .join("");
  }

  setStatus(message: string, type: "success" | "warning" | "error" | "info" = "info"): void {
    if (this.statusMessage) {
      this.statusMessage.className = `status-message status-${type}`;
    }
    if (this.statusText) {
      this.statusText.textContent = message;
    }
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}

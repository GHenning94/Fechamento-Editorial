import "./ui/styles.css";
import { ClosureOrchestrator } from "./core/closure-orchestrator";
import { ChecklistCancelledError, isChecklistCancelled } from "./core/checklist-runner";
import { LICENSE_DEV_ALLOW_RESET } from "./licensing/license-config";
import { deactivateLicense, isLicenseActive } from "./licensing/license-service";
import { ValidationSummary } from "./models/validation-result";
import { PanelController } from "./ui/panel-controller";
import { isLicensePromptOpen, promptLicenseActivation } from "./ui/license-dialog";
import { promptUserNameDialog } from "./ui/user-name-dialog";
import {
  clearPanelContainer,
  markPanelInitialized,
  mountPanelRoot,
  removeStrayPanelRoots,
  resetPanelInitialization,
  showLicenseGate,
} from "./ui/panel-mount";
import { PackageCancelledError, promptChecklistReportFile } from "./utils/file-system";
import { ensureInDesignReady, getDefaultReportUserName } from "./utils/indesign-runtime";
import { yieldToHost } from "./utils/yield-to-host";
import { createMemorialStyleTags } from "./services/style-tags-service";
import { createRendimentoTags } from "./services/rendimento-tags-service";
import { bindUpdateBanner } from "./update/update-banner";

const { entrypoints } = require("uxp");

const orchestrator = new ClosureOrchestrator();
let activeController: PanelController | null = null;
let lastChecklistSummary: ValidationSummary | null = null;
let panelInitInFlight = false;

async function handleLicenseReset(container: HTMLElement): Promise<void> {
  const removed = await deactivateLicense();
  resetPanelInitialization();
  activeController = null;
  lastChecklistSummary = null;
  clearPanelContainer(container);

  if (!removed) {
    showLicenseGate(container, () => {
      void retryActivation(container);
    });
    return;
  }

  const stillLicensed = await isLicenseActive();
  if (stillLicensed) {
    showLicenseGate(container, () => {
      void retryActivation(container);
    });
    return;
  }

  await initPanel(container);
}

function bindDevLicenseReset(container: HTMLElement, root: HTMLElement): void {
  const resetButton = root.querySelector("#btn-license-reset") as HTMLElement | null;
  if (!resetButton) {
    return;
  }

  if (!LICENSE_DEV_ALLOW_RESET) {
    resetButton.classList.add("hidden");
    return;
  }

  resetButton.classList.remove("hidden");
  const onReset = (): void => {
    void handleLicenseReset(container);
  };
  resetButton.onclick = onReset;
  resetButton.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onReset();
    }
  };
}

async function mountLicensedPanel(container: HTMLElement): Promise<void> {
  await yieldToHost(50);

  try {
    await ensureInDesignReady();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    container.innerHTML = `
      <div class="panel license-gate">
        <p class="license-gate-text">${message}</p>
      </div>
    `;
    return;
  }

  const root = mountPanelRoot(container, true);
  if (!root) {
    return;
  }

  const controller = new PanelController(root);
  if (!controller.isReady()) {
    return;
  }

  activeController = controller;
  markPanelInitialized();
  bindDevLicenseReset(container, root);
  bindUpdateBanner(root);

  controller.bindHandlers({
    onChecklist: async () => {
      controller.resetProgress();
      controller.setStatus("Executando checklist editorial...", "info");
      await yieldToHost(40);
      const signal = controller.startCancellableAction();

      try {
        const summary = await orchestrator.runChecklist((current, total, label) => {
          if (controller.isCancelling()) return;
          const percent = Math.round((current / total) * 100);
          controller.setProgress(percent, `Checklist: ${label}`);
        }, signal);

        lastChecklistSummary = summary;
        controller.setReportDownloadEnabled(true);
        controller.setProgress(100, "Checklist concluído");
        controller.setSummaryFilterListener((filtered) => {
          lastChecklistSummary = filtered;
          orchestrator.cacheCurrentDocumentChecklist(filtered);
        });
        controller.renderSummary(summary, "Checklist");
      } catch (error) {
        if (isChecklistCancelled(error) || error instanceof ChecklistCancelledError) {
          controller.resetProgress();
          controller.setStatus(controller.isCancelling() ? "Operação cancelada." : "Checklist cancelado.", "info");
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        controller.setProgress(100, "Checklist interrompido");
        controller.setStatus(message, "error");
        throw error;
      }
    },

    onCreateStyles: async () => {
      controller.resetProgress();
      controller.setStatus("Criando tags de estilos…", "info");
      await yieldToHost(40);
      const signal = controller.startCancellableAction();
      try {
        const result = await createMemorialStyleTags((percent, label) => {
          if (controller.isCancelling()) return;
          controller.setProgress(percent, label);
        }, signal);
        controller.setProgress(100, "Estilos criados");
        controller.setStatus(
          `Layer "${result.layerName}": ${result.total} tags (${result.paragraph} parágrafo, ${result.character} caractere).`,
          "success"
        );
      } catch (error) {
        if (isChecklistCancelled(error) || error instanceof ChecklistCancelledError) {
          controller.resetProgress();
          controller.setStatus("Operação cancelada.", "info");
          return;
        }
        throw error;
      }
    },

    onCreateRendimento: async () => {
      controller.resetProgress();
      controller.setStatus("Criando tags de rendimento…", "info");
      await yieldToHost(40);
      const signal = controller.startCancellableAction();
      try {
        const result = await createRendimentoTags((percent, label) => {
          if (controller.isCancelling()) return;
          controller.setProgress(percent, label);
        }, signal);
        controller.setProgress(100, "Rendimento criado");
        controller.setStatus(
          `Layer "${result.layerName}": ${result.pages} tag(s) de caracteres por página.`,
          "success"
        );
      } catch (error) {
        if (isChecklistCancelled(error) || error instanceof ChecklistCancelledError) {
          controller.resetProgress();
          controller.setStatus("Operação cancelada.", "info");
          return;
        }
        throw error;
      }
    },

    onDownloadReport: async () => {
      const reportSummary = controller.getSummaryForReport() || lastChecklistSummary;
      if (!reportSummary) {
        controller.setStatus("Execute o checklist antes de baixar o relatório.", "warning");
        return;
      }

      let docName = "documento";
      try {
        docName = orchestrator.getCurrentDocumentInfo().name;
      } catch {
        // usa nome genérico
      }

      const filePath = await promptChecklistReportFile(docName);
      if (!filePath) {
        controller.setStatus("Download cancelado.", "info");
        return;
      }

      let userName: string;
      try {
        userName = await promptUserNameDialog(getDefaultReportUserName());
      } catch (error) {
        if (error instanceof PackageCancelledError) {
          controller.setStatus(error.message, "info");
          return;
        }
        throw error;
      }

      controller.setStatus("Gerando relatório...", "info");
      const savedPath = await orchestrator.exportChecklistReport(
        reportSummary,
        filePath,
        userName
      );
      controller.setStatus(`Relatório salvo: ${savedPath}`, "success");
    },

    onClose: async (userName: string, destinationFolder: string) => {
      controller.resetProgress();
      controller.setStatus("Iniciando fechamento...", "info");
      return orchestrator.closeMaterial(userName, destinationFolder, (step, total, label) => {
        const percent = Math.round((step / total) * 100);
        controller.setProgress(percent, label);
      });
    },
    hasMemorialLayer: () => orchestrator.hasMemorialLayer(),
    hasRendimentoLayer: () => orchestrator.hasRendimentoLayer(),
  });

  controller.setStatus("Pronto.", "info");
}

async function requestActivation(container: HTMLElement): Promise<boolean> {
  return promptLicenseActivation(container);
}

async function initPanel(container?: HTMLElement | null): Promise<void> {
  const target = container || document.body;
  if (!target) {
    return;
  }

  if (panelInitInFlight || isLicensePromptOpen()) {
    return;
  }
  panelInitInFlight = true;

  try {
    removeStrayPanelRoots(target);

    const licensed = await isLicenseActive();
    if (!licensed) {
      resetPanelInitialization();
      activeController = null;
      showLicenseGate(target, () => {
        void retryActivation(target);
      });

      const activated = await requestActivation(target);
      if (!activated) {
        return;
      }
    }

    if (activeController?.isReady() && target.querySelector("#root #btn-checklist")) {
      bindDevLicenseReset(target, target.querySelector("#root") as HTMLElement);
      return;
    }

    resetPanelInitialization();
    activeController = null;
    lastChecklistSummary = null;
    await mountLicensedPanel(target);
  } finally {
    panelInitInFlight = false;
  }
}

async function retryActivation(container: HTMLElement): Promise<void> {
  if (isLicensePromptOpen()) {
    return;
  }

  const activated = await requestActivation(container);
  if (!activated) {
    showLicenseGate(container, () => {
      void retryActivation(container);
    });
    return;
  }

  resetPanelInitialization();
  activeController = null;
  lastChecklistSummary = null;
  await mountLicensedPanel(container);
}

entrypoints.setup({
  panels: {
    editorialAutoclosePanel: {
      show(node: HTMLElement) {
        void initPanel(node);
      },
    },
  },
});

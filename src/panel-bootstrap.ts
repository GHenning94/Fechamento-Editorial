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
  queryUi,
  resetPanelInitialization,
  showLicenseGate,
  type PanelProfile,
} from "./ui/panel-mount";
import { PackageCancelledError, promptChecklistReportFile } from "./utils/file-system";
import { ensureInDesignReady, getDefaultReportUserName } from "./utils/indesign-runtime";
import { yieldToHost } from "./utils/yield-to-host";
import { createMemorialStyleTags } from "./services/style-tags-service";
import { createRendimentoTags } from "./services/rendimento-tags-service";
import { bindUpdateBanner } from "./update/update-banner";
import { runCoverCodeScript } from "./services/cover-scripts";

export type { PanelProfile };

interface PanelSession {
  profile: PanelProfile;
  orchestrator: ClosureOrchestrator;
  controller: PanelController | null;
  lastChecklistSummary: ValidationSummary | null;
  initInFlight: boolean;
  generation: number;
}

function createSession(profile: PanelProfile): PanelSession {
  return {
    profile,
    orchestrator: new ClosureOrchestrator(profile),
    controller: null,
    lastChecklistSummary: null,
    initInFlight: false,
    generation: 0,
  };
}

function isMountable(value: unknown): value is HTMLElement {
  if (!value || typeof value !== "object") return false;
  const node = value as HTMLElement;
  return typeof node.appendChild === "function" || "innerHTML" in node;
}

function resolvePanelNode(value: unknown): HTMLElement | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { node?: unknown };
  if (isMountable(record.node) && record.node !== value) return record.node;
  return isMountable(value) ? value : null;
}

function claimHost(raw: unknown, profile: PanelProfile): HTMLElement | null {
  const resolved = resolvePanelNode(raw);
  const target = resolved || document.body;
  if (!target) return null;

  const owner = target.getAttribute("data-panel-owner");
  if (owner && owner !== profile) {
    const owned = document.querySelector(`[data-panel-owner="${profile}"]`);
    return owned instanceof HTMLElement ? owned : null;
  }

  target.setAttribute("data-panel-owner", profile);
  return target;
}

function attachPanel(session: PanelSession): {
  create(node: unknown): void;
  show(node: unknown): void;
} {
  const profile = session.profile;

  async function handleLicenseReset(container: HTMLElement): Promise<void> {
    const removed = await deactivateLicense();
    resetPanelInitialization();
    session.controller = null;
    session.lastChecklistSummary = null;
    clearPanelContainer(container);

    if (!removed) {
      showLicenseGate(container, () => {
        void retryActivation(container);
      }, profile);
      return;
    }

    const stillLicensed = await isLicenseActive();
    if (stillLicensed) {
      showLicenseGate(container, () => {
        void retryActivation(container);
      }, profile);
      return;
    }

    await initPanel(container);
  }

  function bindDevLicenseReset(container: HTMLElement, root: HTMLElement): void {
    const resetButton = queryUi(root, "license-reset");
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

    const root = mountPanelRoot(container, true, profile);
    if (!root) {
      return;
    }

    const controller = new PanelController(root);
    if (!controller.isReady()) {
      return;
    }

    session.controller = controller;
    markPanelInitialized();
    bindDevLicenseReset(container, root);
    bindUpdateBanner(root, (message, type) => controller.setStatus(message, type));

    controller.bindHandlers({
      onChecklist: async () => {
        controller.resetProgress();
        controller.setStatus("Validação em andamento...", "info");
        await yieldToHost(40);
        const signal = controller.startCancellableAction();

        try {
          const summary = await session.orchestrator.runChecklist((current, total, label) => {
            if (controller.isCancelling()) return;
            const percent = Math.round((current / total) * 100);
            controller.setProgress(percent, `Checklist: ${label}`);
          }, signal);

          session.lastChecklistSummary = summary;
          controller.setReportDownloadEnabled(true);
          controller.setProgress(100, "Checklist concluído");
          controller.setSummaryFilterListener((filtered) => {
            session.lastChecklistSummary = filtered;
            session.orchestrator.cacheCurrentDocumentChecklist(filtered);
          });
          controller.renderSummary(summary, "Checklist");
        } catch (error) {
          if (isChecklistCancelled(error) || error instanceof ChecklistCancelledError) {
            controller.resetProgress();
            controller.setStatus("Operação cancelada.", "info");
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
        controller.setStatus("Criação de memorial em andamento...", "info");
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
        controller.setStatus("Criação de rendimento em andamento...", "info");
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
        const reportSummary = controller.getSummaryForReport() || session.lastChecklistSummary;
        if (!reportSummary) {
          controller.setStatus("Execute o checklist antes de baixar o relatório.", "warning");
          return;
        }

        let docName = "documento";
        try {
          docName = session.orchestrator.getCurrentDocumentInfo().name;
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

        controller.setStatus("Geração de relatório em andamento...", "info");
        const savedPath = await session.orchestrator.exportChecklistReport(
          reportSummary,
          filePath,
          userName
        );
        controller.setStatus(`Relatório salvo: ${savedPath}`, "success");
      },

      onClose: async (userName: string, destinationFolder: string) => {
        controller.resetProgress();
        controller.setStatus("Fechamento em andamento...", "info");
        return session.orchestrator.closeMaterial(userName, destinationFolder, (step, total, label) => {
          const percent = Math.round((step / total) * 100);
          controller.setProgress(percent, label);
        });
      },
      hasMemorialLayer: () => session.orchestrator.hasMemorialLayer(),
      hasRendimentoLayer: () => session.orchestrator.hasRendimentoLayer(),
      skipUtilityLayers: profile === "cover",
      onScriptCodigo:
        profile === "cover"
          ? async () => {
              controller.setStatus("Script código...", "info");
              try {
                const result = await runCoverCodeScript();
                controller.setStatus(
                  result === "cancelled" ? "Script cancelado." : "Script concluído.",
                  result === "cancelled" ? "info" : "success"
                );
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                controller.setStatus(message, "error");
              }
            }
          : undefined,
    });

    controller.setStatus("Pronto.", "info");
  }

  async function requestActivation(container: HTMLElement): Promise<boolean> {
    return promptLicenseActivation(container);
  }

  async function initPanel(raw: unknown): Promise<void> {
    const target = claimHost(raw, profile);
    if (!target) return;

    const readyName = profile === "cover" ? "script-codigo" : "create-styles";
    if (session.controller?.isReady() && queryUi(target, readyName)) {
      return;
    }

    session.generation += 1;
    const generation = session.generation;
    mountPanelRoot(target, true, profile);

    if (isLicensePromptOpen()) return;

    session.initInFlight = true;
    try {
      const licensed = await isLicenseActive();
      if (session.generation !== generation) return;

      if (!licensed) {
        session.controller = null;
        showLicenseGate(target, () => {
          void retryActivation(target);
        }, profile);
        const activated = await requestActivation(target);
        if (!activated || session.generation !== generation) return;
        mountPanelRoot(target, true, profile);
      }

      if (session.generation !== generation) return;
      resetPanelInitialization();
      session.controller = null;
      session.lastChecklistSummary = null;
      await mountLicensedPanel(target);
    } finally {
      if (session.generation === generation) {
        session.initInFlight = false;
      }
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
      }, profile);
      return;
    }

    resetPanelInitialization();
    session.controller = null;
    session.lastChecklistSummary = null;
    await mountLicensedPanel(container);
  }

  return {
    create(node: unknown) {
      void initPanel(node);
    },
    show(node: unknown) {
      void initPanel(node);
    },
  };
}

const SETUP_FLAG = "__editorialAutoclosePanelSetup";

/** Um único entrypoints.setup registra os dois painéis. O InDesign ignora HTML separado. */
export function bootstrapPanels(): void {
  const scope = globalThis as typeof globalThis & { [SETUP_FLAG]?: boolean };
  if (scope[SETUP_FLAG]) return;

  const { entrypoints } = require("uxp");
  entrypoints.setup({
    panels: {
      editorialAutoclosePanel: attachPanel(createSession("editorial")),
      capasAutoclosePanel: attachPanel(createSession("cover")),
    },
  });
  scope[SETUP_FLAG] = true;
}

export function bootstrapPanel(_profile: PanelProfile, _panelId: string): void {
  bootstrapPanels();
}

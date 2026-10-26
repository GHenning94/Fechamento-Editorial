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
import { openPluginPanel, removeStalePluginMenus } from "./ui/open-panel";

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

function hostById(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found instanceof HTMLElement) return found;
  const host = document.createElement("div");
  host.id = id;
  document.body.appendChild(host);
  return host;
}

function rootFromEvent(raw: unknown): HTMLElement | null {
  const node = resolvePanelNode(raw);
  if (!node || node === document.documentElement || node === document.body) return null;
  if (node.id === "editorial-host" || node.id === "cover-host") return null;
  return node;
}

function attachPanel(session: PanelSession): {
  mount(container: HTMLElement): void;
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
    const root = mountPanelRoot(container, true, profile);
    if (!root) {
      return;
    }

    let controller: PanelController;
    try {
      controller = new PanelController(root);
    } catch (error) {
      const status = root.querySelector("[data-ui='status-text']");
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
      return;
    }

    if (!controller.isReady()) {
      const status = root.querySelector("[data-ui='status-text']");
      if (status) status.textContent = "Controles do painel não foram encontrados.";
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

    root.dataset.bound = "1";
    controller.setStatus("Pronto.", "info");

    try {
      await ensureInDesignReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      controller.setStatus(message, "error");
    }
  }

  async function requestActivation(container: HTMLElement): Promise<boolean> {
    return promptLicenseActivation(container);
  }

  async function initPanel(target: HTMLElement): Promise<void> {
    if (!target || target === document.body || target === document.documentElement) return;
    if (target.querySelector(`.panel[data-profile="${profile}"][data-bound="1"]`)) return;
    if (isLicensePromptOpen()) return;

    session.generation += 1;
    const generation = session.generation;
    session.initInFlight = true;
    try {
      resetPanelInitialization();
      session.controller = null;
      session.lastChecklistSummary = null;
      await mountLicensedPanel(target);
      if (session.generation !== generation) return;

      const licensed = await isLicenseActive();
      if (session.generation !== generation) return;
      if (licensed) return;

      session.controller = null;
      showLicenseGate(target, () => {
        void retryActivation(target);
      }, profile);
      const activated = await requestActivation(target);
      if (!activated || session.generation !== generation) return;
      await mountLicensedPanel(target);
    } catch (error) {
      const status = target.querySelector("[data-ui='status-text']");
      if (status) status.textContent = error instanceof Error ? error.message : String(error);
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
    mount(container: HTMLElement) {
      void initPanel(container);
    },
  };
}

const SETUP_FLAG = "__editorialAutoclosePanelSetup";

function stretch(node: HTMLElement): void {
  node.style.height = "100%";
  node.style.width = "100%";
  node.style.display = "flex";
  node.style.flexDirection = "column";
  node.style.minHeight = "0";
  node.style.backgroundColor = "#17171a";
}

/** O InDesign só mostra a capa se o HTML dela for inserido no root que o show() entrega. */
export function bootstrapPanels(): void {
  const scope = globalThis as typeof globalThis & { [SETUP_FLAG]?: boolean };
  if (scope[SETUP_FLAG]) return;

  const mounts = {
    editorial: attachPanel(createSession("editorial")),
    cover: attachPanel(createSession("cover")),
  };
  const editorialHost = hostById("editorial-host");
  const coverHost = hostById("cover-host");
  let editorialRoot: HTMLElement | null = null;

  const showEditorial = (raw: unknown): void => {
    const root = rootFromEvent(raw);
    if (
      root &&
      editorialRoot &&
      root !== editorialRoot &&
      !editorialRoot.contains(root) &&
      !root.contains(editorialRoot) &&
      !root.contains(editorialHost)
    ) {
      showCover(root);
      return;
    }
    if (root && !root.contains(coverHost)) editorialRoot = root;
    mounts.editorial.mount(editorialHost);
  };

  const showCover = (raw: unknown): void => {
    const root = rootFromEvent(raw) || (raw instanceof HTMLElement ? raw : null);
    if (root && root !== coverHost && !coverHost.contains(root) && !root.contains(editorialHost)) {
      stretch(root);
      if (!root.contains(coverHost)) root.appendChild(coverHost);
    }
    if (coverHost.parentElement && coverHost.parentElement !== document.body) {
      coverHost.classList.add("is-placed");
    }
    mounts.cover.mount(coverHost);
  };

  const { entrypoints } = require("uxp");
  entrypoints.setup({
    plugin: {
      create() {
        removeStalePluginMenus(false);
        openPluginPanel("capasAutoclosePanel");
        window.setTimeout(() => {
          removeStalePluginMenus(false);
          openPluginPanel("capasAutoclosePanel");
        }, 400);
      },
      destroy() {
        removeStalePluginMenus(true);
      },
    },
    commands: {
      openCapasAutoclose: {
        run() {
          openPluginPanel("capasAutoclosePanel");
        },
      },
    },
    panels: {
      editorialAutoclosePanel: {
        create(node: unknown) {
          showEditorial(node);
        },
        show(node: unknown) {
          showEditorial(node);
        },
      },
      capasAutoclosePanel: {
        create(node: unknown) {
          showCover(node);
        },
        show(node: unknown) {
          showCover(node);
        },
      },
    },
  });

  mounts.editorial.mount(editorialHost);
  mounts.cover.mount(coverHost);
  removeStalePluginMenus(false);
  openPluginPanel("capasAutoclosePanel");

  const claimCoverShell = (node: HTMLElement): void => {
    const tag = node.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "link") return;
    if (node === editorialHost || node === coverHost) return;
    if (editorialHost.contains(node) || coverHost.contains(node) || node.contains(editorialHost)) return;
    const panelId = node.getAttribute("panelid") || node.getAttribute("panelId") || node.id;
    const coverShell =
      panelId === "capasAutoclosePanel" ||
      tag === "uxp-panel" ||
      (node.parentElement === document.body && node.childElementCount === 0);
    if (!coverShell) return;
    showCover(node);
  };

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) claimCoverShell(node);
      });
    });
  });
  const scanShells = (): void => {
    document.querySelectorAll("uxp-panel, [panelid='capasAutoclosePanel'], [panelId='capasAutoclosePanel']").forEach((node) => {
      if (node instanceof HTMLElement) claimCoverShell(node);
    });
  };

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
    scanShells();
    const timer = window.setInterval(scanShells, 400);
    window.setTimeout(() => window.clearInterval(timer), 20000);
  }

  scope[SETUP_FLAG] = true;
}

export function bootstrapPanel(_profile: PanelProfile, _panelId: string): void {
  bootstrapPanels();
}

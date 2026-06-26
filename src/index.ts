import "./ui/styles.css";
import { ClosureOrchestrator } from "./core/closure-orchestrator";
import { LICENSE_DEV_ALLOW_RESET } from "./licensing/license-config";
import { deactivateLicense, isLicenseActive } from "./licensing/license-service";
import { PanelController } from "./ui/panel-controller";
import { promptLicenseActivation } from "./ui/license-dialog";
import {
  clearPanelContainer,
  markPanelInitialized,
  mountPanelRoot,
  removeStrayPanelRoots,
  resetPanelInitialization,
  showLicenseGate,
} from "./ui/panel-mount";

const { entrypoints } = require("uxp");

const orchestrator = new ClosureOrchestrator();
let activeController: PanelController | null = null;

async function handleLicenseReset(container: HTMLElement): Promise<void> {
  const removed = await deactivateLicense();
  resetPanelInitialization();
  activeController = null;
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
  const resetButton = root.querySelector("#btn-license-reset") as HTMLButtonElement | null;
  if (!resetButton) {
    return;
  }

  if (!LICENSE_DEV_ALLOW_RESET) {
    resetButton.classList.add("hidden");
    return;
  }

  resetButton.classList.remove("hidden");
  resetButton.onclick = () => {
    void handleLicenseReset(container);
  };
}

async function mountLicensedPanel(container: HTMLElement): Promise<void> {
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

  controller.bindHandlers({
    onChecklist: async () => {
      controller.resetProgress();
      controller.setStatus("Executando checklist editorial...", "info");

      const summary = await orchestrator.runChecklist((current, total, label) => {
        const percent = Math.round((current / total) * 100);
        controller.setProgress(percent, `Checklist: ${label}`);
      });

      controller.setProgress(100, "Checklist concluído");
      controller.renderSummary(summary, "Checklist");
    },

    onClose: async (userName: string, destinationFolder: string) => {
      controller.resetProgress();
      controller.setStatus("Iniciando fechamento...", "info");
      return orchestrator.closeMaterial(userName, destinationFolder, (step, total, label) => {
        const percent = Math.round((step / total) * 100);
        controller.setProgress(percent, label);
      });
    },
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

  removeStrayPanelRoots(target);

  const licensed = await isLicenseActive();
  if (!licensed) {
    resetPanelInitialization();
    activeController = null;

    const activated = await requestActivation(target);
    if (!activated) {
      showLicenseGate(target, () => {
        void retryActivation(target);
      });
      return;
    }
  }

  if (activeController?.isReady() && target.querySelector("#root #btn-license-reset")) {
    bindDevLicenseReset(target, target.querySelector("#root") as HTMLElement);
    return;
  }

  resetPanelInitialization();
  activeController = null;
  await mountLicensedPanel(target);
}

async function retryActivation(container: HTMLElement): Promise<void> {
  const activated = await requestActivation(container);
  if (!activated) {
    showLicenseGate(container, () => {
      void retryActivation(container);
    });
    return;
  }

  resetPanelInitialization();
  activeController = null;
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

import { onActionActivate, setActionDisabled } from "../ui/action-control";
import { applyPluginUpdate, reloadPluginPanel } from "./update-apply";
import { checkForPluginUpdate, dismissUpdateVersion, PluginUpdateInfo } from "./update-check";

function showBanner(root: HTMLElement, update: PluginUpdateInfo): void {
  const banner = root.querySelector("#update-banner") as HTMLElement | null;
  const versionEl = root.querySelector("#update-banner-version") as HTMLElement | null;
  const statusEl = root.querySelector("#update-banner-status") as HTMLElement | null;
  const btnOpen = root.querySelector("#btn-update-open") as HTMLElement | null;
  const btnDismiss = root.querySelector("#btn-update-dismiss") as HTMLElement | null;

  if (!banner || !btnOpen) {
    return;
  }

  if (versionEl) {
    versionEl.textContent = update.version;
  }

  if (statusEl) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
  }

  banner.classList.remove("hidden");

  const setStatus = (message: string, kind: "info" | "error" | "success"): void => {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `update-banner-status update-banner-status-${kind}`;
    statusEl.classList.toggle("hidden", !message);
  };

  onActionActivate(btnOpen, () => {
    void (async () => {
      setActionDisabled(btnOpen, true);
      btnOpen.textContent = "Atualizando...";
      setStatus("Baixando e instalando a nova versão...", "info");

      try {
        await applyPluginUpdate();
        dismissUpdateVersion(update.version);
        setStatus("Atualizado. Recarregando o painel...", "success");
        btnOpen.textContent = "Atualizado";
        window.setTimeout(() => {
          reloadPluginPanel();
        }, 400);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha na atualização.";
        setStatus(message, "error");
        btnOpen.textContent = "Tentar de novo";
        setActionDisabled(btnOpen, false);
      }
    })();
  });

  if (btnDismiss) {
    onActionActivate(btnDismiss, () => {
      dismissUpdateVersion(update.version);
      banner.classList.add("hidden");
    });
  }
}

export function bindUpdateBanner(root: HTMLElement): void {
  void checkForPluginUpdate().then((update) => {
    if (update) {
      showBanner(root, update);
    }
  });
}

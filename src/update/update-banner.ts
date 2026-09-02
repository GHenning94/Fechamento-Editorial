import { PLUGIN_RELEASE_NOTES, PLUGIN_RELEASE_TITLE } from "./plugin-notes";
import { PLUGIN_VERSION } from "./plugin-version";
import { onActionActivate, setActionDisabled } from "../ui/action-control";
import { applyPluginUpdate, reloadPluginPanel } from "./update-apply";
import { checkForPluginUpdate, getVersionNotes, PluginUpdateInfo } from "./update-check";

type StatusFn = (message: string, type: "success" | "warning" | "error" | "info") => void;

function formatVersionLabel(version: string): string {
  const clean = String(version || "").replace(/^v\.?/i, "");
  return `v.${clean}`;
}

function bindVersionTag(root: HTMLElement): void {
  const tag = root.querySelector("#plugin-version-tag");
  if (tag) {
    tag.textContent = formatVersionLabel(PLUGIN_VERSION);
  }
}

function closeNotes(card: HTMLElement | null): void {
  card?.classList.add("hidden");
}

function bindNotesButton(root: HTMLElement): void {
  const button = root.querySelector("#btn-version-info") as HTMLElement | null;
  const card = root.querySelector("#version-notes-card") as HTMLElement | null;
  const titleEl = root.querySelector("#version-notes-title") as HTMLElement | null;
  const bodyEl = root.querySelector("#version-notes-body") as HTMLElement | null;
  if (!button || !card || !titleEl || !bodyEl) {
    return;
  }

  const render = (title: string, notes: string): void => {
    titleEl.textContent = title;
    bodyEl.textContent = notes || "Não há descrição para esta versão.";
  };

  onActionActivate(button, () => {
    if (!card.classList.contains("hidden")) {
      closeNotes(card);
      return;
    }

    titleEl.textContent = PLUGIN_RELEASE_TITLE || "Carregando...";
    bodyEl.textContent = PLUGIN_RELEASE_NOTES || "";
    card.classList.remove("hidden");

    void getVersionNotes(PLUGIN_VERSION).then((notes) => {
      render(notes.title, notes.notes);
    });
  });

  root.addEventListener("pointerdown", (event) => {
    const target = event.target as Node | null;
    if (!target) return;
    if (card.contains(target) || button.contains(target)) return;
    closeNotes(card);
  });
}

function bindUpdateButton(root: HTMLElement, update: PluginUpdateInfo, setStatus?: StatusFn): void {
  const button = root.querySelector("#btn-plugin-update") as HTMLElement | null;
  if (!button) {
    return;
  }

  button.classList.remove("hidden");
  button.setAttribute("title", `Atualizar para ${formatVersionLabel(update.version)}`);
  button.setAttribute("aria-label", `Atualizar para ${formatVersionLabel(update.version)}`);

  onActionActivate(button, () => {
    void (async () => {
      setActionDisabled(button, true);
      button.classList.add("is-updating");
      root.classList.add("is-working");
      setStatus?.("Atualização em andamento...", "info");

      try {
        const result = await applyPluginUpdate(update.version);
        if (result === "installer") {
          setStatus?.(
            "Instalador aberto. Confirme no Creative Cloud e reabra o painel.",
            "success"
          );
          button.classList.remove("is-updating");
          setActionDisabled(button, false);
          root.classList.remove("is-working");
          return;
        }

        setStatus?.("Atualizado. Recarregando o painel...", "success");
        window.setTimeout(() => {
          reloadPluginPanel();
        }, 400);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha na atualização.";
        setStatus?.(message, "error");
        button.classList.remove("is-updating");
        setActionDisabled(button, false);
        root.classList.remove("is-working");
      }
    })();
  });
}

export function bindUpdateBanner(root: HTMLElement, setStatus?: StatusFn): void {
  bindVersionTag(root);
  bindNotesButton(root);

  void checkForPluginUpdate().then((update) => {
    if (update) {
      bindUpdateButton(root, update, setStatus);
    }
  });
}

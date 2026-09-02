import { PLUGIN_VERSION } from "./plugin-version";
import { onActionActivate, setActionDisabled } from "../ui/action-control";
import { applyPluginUpdate, reloadPluginPanel } from "./update-apply";
import { checkForPluginUpdate, getVersionNotes, PluginUpdateInfo, VersionNotes } from "./update-check";

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

function notesElements(root: HTMLElement): {
  button: HTMLElement | null;
  card: HTMLElement | null;
  titleEl: HTMLElement | null;
  bodyEl: HTMLElement | null;
} {
  return {
    button: root.querySelector("#btn-version-info") as HTMLElement | null,
    card: root.querySelector("#version-notes-card") as HTMLElement | null,
    titleEl: root.querySelector("#version-notes-title") as HTMLElement | null,
    bodyEl: root.querySelector("#version-notes-body") as HTMLElement | null,
  };
}

function closeNotes(card: HTMLElement | null): void {
  card?.classList.add("hidden");
}

function renderNotes(root: HTMLElement, notes: VersionNotes): void {
  const { card, titleEl, bodyEl } = notesElements(root);
  if (!card || !titleEl || !bodyEl) return;
  titleEl.textContent = notes.title;
  bodyEl.textContent = notes.notes || "Não há descrição para esta versão.";
  card.classList.remove("hidden");
}

async function showRemoteNotes(root: HTMLElement, version: string = PLUGIN_VERSION): Promise<void> {
  const { card, titleEl, bodyEl } = notesElements(root);
  if (!card || !titleEl || !bodyEl) return;
  titleEl.textContent = "Carregando...";
  bodyEl.textContent = "";
  card.classList.remove("hidden");
  const notes = await getVersionNotes(version);
  renderNotes(root, notes);
}

function bindNotesButton(root: HTMLElement): void {
  const { button, card } = notesElements(root);
  if (!button || !card) return;

  onActionActivate(button, () => {
    if (!card.classList.contains("hidden")) {
      closeNotes(card);
      return;
    }
    void showRemoteNotes(root);
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
        if (result === "current") {
          await showRemoteNotes(root, update.version);
          setStatus?.("Esta versão já está instalada. Notas atualizadas do GitHub.", "info");
          button.classList.remove("is-updating");
          setActionDisabled(button, false);
          root.classList.remove("is-working");
          return;
        }

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

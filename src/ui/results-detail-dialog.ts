import { onActionActivate } from "./action-control";

type UxpDialog = HTMLDialogElement & {
  uxpShowModal?(options: {
    title: string;
    resize?: "none" | "both" | "horizontal" | "vertical";
    size?: { width: number; height: number };
    minSize?: { width: number; height: number };
    maxSize?: { width: number; height: number };
  }): Promise<unknown>;
  close(returnValue?: string): void;
};

export type ResultDetailKind = "approved" | "warning" | "error";

export interface ResultDetailOptions {
  title: string;
  kind: ResultDetailKind;
  html: string;
  onIgnore?: (key: string) => void;
}

const MIN_WIDTH = 520;
const MIN_HEIGHT = 380;
const MAX_WIDTH = 920;
const MAX_HEIGHT = 880;
const DEFAULT_WIDTH = 720;

function countListItems(html: string): number {
  return (html.match(/<li\b/gi) || []).length;
}

/** Estima um tamanho inicial onde a lista caiba sem precisar redimensionar. */
function computeDialogSize(html: string): { width: number; height: number } {
  const items = Math.max(1, countListItems(html));
  const headerAndPadding = 88;
  const estimatedItemHeight = 96;
  const height = Math.min(
    MAX_HEIGHT,
    Math.max(MIN_HEIGHT, headerAndPadding + items * estimatedItemHeight)
  );

  return {
    width: DEFAULT_WIDTH,
    height,
  };
}

function waitForDialogClose(dialog: UxpDialog): Promise<void> {
  return new Promise((resolve) => {
    const onClose = (): void => {
      dialog.removeEventListener("close", onClose);
      resolve();
    };
    dialog.addEventListener("close", onClose);
  });
}

function bindIgnoreHandlers(
  listEl: HTMLElement,
  onIgnore: (key: string) => void
): void {
  const buttons = listEl.querySelectorAll<HTMLElement>("[data-ignore-key]");
  buttons.forEach((button) => {
    const key = button.getAttribute("data-ignore-key");
    if (!key) return;
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      onIgnore(key);
      button.closest("li")?.remove();
      if (!listEl.querySelector("li")) {
        listEl.innerHTML = '<li class="empty-item">Nenhum item</li>';
      }
    };
  });
}

export async function showResultsDetailDialog(options: ResultDetailOptions): Promise<void> {
  const existing = document.getElementById("editorial-results-detail-dialog");
  if (existing) {
    existing.remove();
  }

  const size = computeDialogSize(options.html || "");
  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-results-detail-dialog";

  // form com width explícito: no UXP, sem isso o diálogo colapsa (largura ~0).
  dialog.innerHTML = `
    <form method="dialog" class="results-detail-dialog-form">
      <div class="results-detail-dialog-content" data-kind="${options.kind}">
        <div class="results-detail-dialog-header">
          <h2 id="results-detail-title" class="results-detail-dialog-heading"></h2>
          <div id="results-detail-close" class="btn btn-secondary results-detail-close" role="button" tabindex="0">
            Fechar
          </div>
        </div>
        <ul id="results-detail-list" class="results-detail-list result-list"></ul>
      </div>
    </form>
  `;

  const form = dialog.querySelector(".results-detail-dialog-form") as HTMLFormElement;
  const content = dialog.querySelector(".results-detail-dialog-content") as HTMLElement;
  const titleEl = dialog.querySelector("#results-detail-title") as HTMLElement;
  const listEl = dialog.querySelector("#results-detail-list") as HTMLElement;
  const closeBtn = dialog.querySelector("#results-detail-close") as HTMLElement;

  titleEl.textContent = options.title;
  listEl.innerHTML = options.html || '<li class="empty-item">Nenhum item</li>';

  if (options.onIgnore) {
    bindIgnoreHandlers(listEl, options.onIgnore);
  }

  onActionActivate(closeBtn, () => {
    dialog.close();
  });

  document.body.appendChild(dialog);

  try {
    if (typeof dialog.uxpShowModal === "function") {
      // Janela nativa: tamanho via API. Conteúdo em 100% para acompanhar resize.
      form.style.width = "100%";
      form.style.height = "100%";
      form.style.minWidth = `${MIN_WIDTH}px`;
      form.style.minHeight = `${MIN_HEIGHT}px`;
      content.style.width = "100%";
      content.style.height = "100%";

      await dialog.uxpShowModal({
        title: options.title,
        resize: "both",
        size: { width: size.width, height: size.height },
        minSize: { width: MIN_WIDTH, height: MIN_HEIGHT },
        maxSize: { width: MAX_WIDTH, height: MAX_HEIGHT },
      });
      return;
    }

    // Fallback InDesign (showModal): o tamanho vem do form em px.
    form.style.width = `${size.width}px`;
    form.style.height = `${size.height}px`;
    form.style.minWidth = `${MIN_WIDTH}px`;
    form.style.minHeight = `${MIN_HEIGHT}px`;
    content.style.width = "100%";
    content.style.height = "100%";

    dialog.showModal();
    await waitForDialogClose(dialog);
  } catch {
    // usuário fechou / host cancelou
  } finally {
    dialog.remove();
  }
}

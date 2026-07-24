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

/** Janela = área preta (sem faixa cinza extra). */
const DIALOG_WIDTH = 700;
const DIALOG_HEIGHT = 480;
const HEADER_HEIGHT = 52;
const LIST_HEIGHT = DIALOG_HEIGHT - HEADER_HEIGHT;
const BG = "#232329";
const BG_HEADER = "#2a2a30";
const BORDER = "#3a3a42";

const KIND_TITLE_COLOR: Record<ResultDetailKind, string> = {
  approved: "#5ecf8e",
  warning: "#e6c35c",
  error: "#e87474",
};

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

/**
 * Tamanho nativo travado no conteúdo (size = min = max).
 * Assim a janela não reaproveita altura antiga nem deixa faixa cinza.
 */
export async function showResultsDetailDialog(options: ResultDetailOptions): Promise<void> {
  const existing = document.getElementById("editorial-results-detail-dialog");
  if (existing) {
    existing.remove();
  }

  const titleColor = KIND_TITLE_COLOR[options.kind];
  const size = { width: DIALOG_WIDTH, height: DIALOG_HEIGHT };

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-results-detail-dialog";
  dialog.style.padding = "0";
  dialog.style.margin = "0";
  dialog.style.border = "none";
  dialog.style.backgroundColor = BG;
  dialog.style.color = "#f2f0ec";
  dialog.style.overflow = "hidden";
  dialog.style.width = `${DIALOG_WIDTH}px`;
  dialog.style.height = `${DIALOG_HEIGHT}px`;

  const styleEl = document.createElement("style");
  styleEl.textContent = `
    #editorial-results-detail-dialog {
      padding: 0 !important;
      margin: 0 !important;
      border: none !important;
      width: ${DIALOG_WIDTH}px !important;
      height: ${DIALOG_HEIGHT}px !important;
      background-color: ${BG} !important;
      color: #f2f0ec !important;
      overflow: hidden !important;
    }
    #editorial-results-detail-dialog > .results-detail-dialog-content {
      display: flex !important;
      flex-direction: column !important;
      width: ${DIALOG_WIDTH}px !important;
      height: ${DIALOG_HEIGHT}px !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      background-color: ${BG} !important;
    }
    #editorial-results-detail-dialog .results-detail-dialog-header {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: space-between !important;
      flex-shrink: 0 !important;
      width: ${DIALOG_WIDTH}px !important;
      height: ${HEADER_HEIGHT}px !important;
      padding: 10px 16px !important;
      box-sizing: border-box !important;
      border-bottom: 1px solid ${BORDER} !important;
      background-color: ${BG_HEADER} !important;
    }
    #editorial-results-detail-dialog .results-detail-dialog-heading {
      flex: 1 1 auto !important;
      min-width: 0 !important;
      margin: 0 12px 0 0 !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      letter-spacing: 0.04em !important;
      overflow: hidden !important;
      white-space: nowrap !important;
      text-overflow: ellipsis !important;
    }
    #editorial-results-detail-dialog #results-detail-close {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 0 0 88px !important;
      width: 88px !important;
      min-width: 88px !important;
      max-width: 88px !important;
      height: 32px !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      border: 1px solid ${BORDER} !important;
      border-radius: 6px !important;
      background-color: #2c2c34 !important;
      color: #f2f0ec !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
    }
    #editorial-results-detail-dialog .results-detail-list {
      flex: 0 0 ${LIST_HEIGHT}px !important;
      width: ${DIALOG_WIDTH}px !important;
      height: ${LIST_HEIGHT}px !important;
      max-height: ${LIST_HEIGHT}px !important;
      margin: 0 !important;
      padding: 12px 16px !important;
      list-style: none !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
      overflow-y: scroll !important;
      background-color: ${BG} !important;
    }
  `;

  const root = document.createElement("div");
  root.className = "results-detail-dialog-content";
  root.setAttribute("data-kind", options.kind);

  const header = document.createElement("div");
  header.className = "results-detail-dialog-header";

  const titleEl = document.createElement("h2");
  titleEl.id = "results-detail-title";
  titleEl.className = "results-detail-dialog-heading";
  titleEl.textContent = options.title;
  titleEl.style.color = titleColor;

  const closeBtn = document.createElement("div");
  closeBtn.id = "results-detail-close";
  closeBtn.setAttribute("role", "button");
  closeBtn.tabIndex = 0;
  closeBtn.textContent = "Fechar";

  const listEl = document.createElement("ul");
  listEl.id = "results-detail-list";
  listEl.className = "results-detail-list result-list";
  listEl.innerHTML = options.html || '<li class="empty-item">Nenhum item</li>';

  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  root.appendChild(header);
  root.appendChild(listEl);
  dialog.appendChild(styleEl);
  dialog.appendChild(root);
  document.body.appendChild(dialog);

  if (options.onIgnore) {
    bindIgnoreHandlers(listEl, options.onIgnore);
  }

  onActionActivate(closeBtn, () => {
    dialog.close();
  });

  try {
    if (typeof dialog.uxpShowModal === "function") {
      // size = min = max → impede a janela de abrir maior (faixa cinza)
      await dialog.uxpShowModal({
        title: options.title,
        resize: "none",
        size,
        minSize: size,
        maxSize: size,
      });
      return;
    }

    dialog.showModal();
    await waitForDialogClose(dialog);
  } catch {
    // usuário fechou / host cancelou
  } finally {
    dialog.remove();
  }
}

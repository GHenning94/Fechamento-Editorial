import { onActionActivate } from "./action-control";
import { bindResultGroupToggles } from "./result-group-toggle";

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

const DIALOG_WIDTH = 700;
const DIALOG_HEIGHT = 520;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 380;
const MAX_WIDTH = 960;
const MAX_HEIGHT = 780;
const HEADER_HEIGHT = 52;
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

/** Estilos fixos: conteúdo em 100% da janela nativa (fundo preto inteiro). */
function applyStaticStyles(
  dialog: HTMLElement,
  root: HTMLElement,
  header: HTMLElement,
  titleEl: HTMLElement,
  closeBtn: HTMLElement,
  listEl: HTMLElement,
  titleColor: string
): void {
  dialog.style.cssText = [
    "padding:0",
    "margin:0",
    "border:none",
    "width:100%",
    "height:100%",
    `background-color:${BG}`,
    "color:#f2f0ec",
    "overflow:hidden",
    "box-sizing:border-box",
  ].join(";");

  root.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "width:100%",
    "height:100%",
    "margin:0",
    "padding:0",
    "box-sizing:border-box",
    "overflow:hidden",
    `background-color:${BG}`,
  ].join(";");

  header.style.cssText = [
    "display:flex",
    "flex-direction:row",
    "align-items:center",
    "justify-content:space-between",
    "flex-shrink:0",
    "width:100%",
    `height:${HEADER_HEIGHT}px`,
    "padding:10px 16px",
    "box-sizing:border-box",
    `border-bottom:1px solid ${BORDER}`,
    `background-color:${BG_HEADER}`,
  ].join(";");

  titleEl.style.cssText = [
    "flex:1 1 auto",
    "min-width:0",
    "margin:0 12px 0 0",
    "font-size:14px",
    "font-weight:700",
    "letter-spacing:0.04em",
    `color:${titleColor}`,
    "overflow:hidden",
    "white-space:nowrap",
    "text-overflow:ellipsis",
  ].join(";");

  // Sem classe .btn (width:100% quebrava o cabeçalho)
  closeBtn.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "flex:0 0 88px",
    "width:88px",
    "min-width:88px",
    "max-width:88px",
    "height:32px",
    "margin:0",
    "padding:0",
    "box-sizing:border-box",
    `border:1px solid ${BORDER}`,
    "border-radius:6px",
    "background-color:#2c2c34",
    "color:#f2f0ec",
    "font-size:12px",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");

  listEl.style.cssText = [
    "flex:1 1 auto",
    "width:100%",
    "min-height:0",
    "margin:0",
    "padding:12px 16px",
    "list-style:none",
    "box-sizing:border-box",
    "overflow-x:hidden",
    "overflow-y:scroll",
    `background-color:${BG}`,
  ].join(";");
}

/**
 * Altura da lista em px: no UXP o scroll só funciona com altura explícita,
 * então acompanhamos a janela nativa conforme o usuário redimensiona.
 */
function syncListHeight(root: HTMLElement, listEl: HTMLElement): number {
  const rootHeight = root.clientHeight || DIALOG_HEIGHT;
  const listHeight = Math.max(120, rootHeight - HEADER_HEIGHT);
  listEl.style.height = `${listHeight}px`;
  listEl.style.maxHeight = `${listHeight}px`;
  return listHeight;
}

export async function showResultsDetailDialog(options: ResultDetailOptions): Promise<void> {
  document.querySelectorAll("[id^='editorial-results-detail-dialog']").forEach((el) => {
    el.remove();
  });

  const titleColor = KIND_TITLE_COLOR[options.kind];

  // ID único: evita o InDesign reaproveitar geometria antiga da janela
  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = `editorial-results-detail-dialog-${Date.now()}`;

  const root = document.createElement("div");
  root.className = "results-detail-dialog-content";
  root.setAttribute("data-kind", options.kind);

  const header = document.createElement("div");
  header.className = "results-detail-dialog-header";

  const titleEl = document.createElement("h2");
  titleEl.className = "results-detail-dialog-heading";
  titleEl.textContent = options.title;

  const closeBtn = document.createElement("div");
  closeBtn.setAttribute("role", "button");
  closeBtn.tabIndex = 0;
  closeBtn.textContent = "Fechar";

  const listEl = document.createElement("ul");
  listEl.className = "results-detail-list result-list";
  listEl.innerHTML = options.html || '<li class="empty-item">Nenhum item</li>';

  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  root.appendChild(header);
  root.appendChild(listEl);
  dialog.appendChild(root);
  document.body.appendChild(dialog);

  applyStaticStyles(dialog, root, header, titleEl, closeBtn, listEl, titleColor);
  syncListHeight(root, listEl);

  if (options.onIgnore) {
    bindIgnoreHandlers(listEl, options.onIgnore);
  }

  bindResultGroupToggles(listEl);

  onActionActivate(closeBtn, () => {
    dialog.close();
  });

  // UXP não emite resize confiável: acompanha a janela por polling leve
  let closed = false;
  let lastListHeight = 0;
  const resizePoll = window.setInterval(() => {
    if (closed) {
      window.clearInterval(resizePoll);
      return;
    }
    const rootHeight = root.clientHeight || DIALOG_HEIGHT;
    const target = Math.max(120, rootHeight - HEADER_HEIGHT);
    if (target !== lastListHeight) {
      lastListHeight = syncListHeight(root, listEl);
    }
  }, 150);

  try {
    if (typeof dialog.uxpShowModal === "function") {
      const showPromise = dialog.uxpShowModal({
        title: options.title,
        resize: "both",
        size: { width: DIALOG_WIDTH, height: DIALOG_HEIGHT },
        minSize: { width: MIN_WIDTH, height: MIN_HEIGHT },
        maxSize: { width: MAX_WIDTH, height: MAX_HEIGHT },
      });

      window.setTimeout(() => {
        if (!closed) lastListHeight = syncListHeight(root, listEl);
      }, 60);

      await showPromise;
      return;
    }

    dialog.style.width = `${DIALOG_WIDTH}px`;
    dialog.style.height = `${DIALOG_HEIGHT}px`;
    dialog.showModal();
    lastListHeight = syncListHeight(root, listEl);
    await waitForDialogClose(dialog);
  } catch {
    // usuário fechou / host cancelou
  } finally {
    closed = true;
    window.clearInterval(resizePoll);
    dialog.remove();
  }
}

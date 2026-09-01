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
  uxpShow?(options: {
    title: string;
    resize?: "none" | "both" | "horizontal" | "vertical";
    size?: { width: number; height: number };
    minSize?: { width: number; height: number };
    maxSize?: { width: number; height: number };
  }): Promise<unknown>;
  show(options?: unknown): unknown;
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
      const issueEl = button.closest(".result-group-issue");
      const group = button.closest(".result-group");
      onIgnore(key);
      issueEl?.remove();
      if (group && !group.querySelector(".result-group-issue")) {
        group.remove();
      }
      if (!listEl.querySelector("li:not(.results-scroll-spacer)")) {
        listEl.innerHTML = '<li class="empty-item">Nenhum item</li>';
      }
      ensureScrollSpacer(listEl);
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
    "padding:12px 16px 88px 16px",
    "list-style:none",
    "box-sizing:border-box",
    "overflow-x:hidden",
    "overflow-y:auto",
    `background-color:${BG}`,
  ].join(";");
}

function ensureScrollSpacer(listEl: HTMLElement): void {
  listEl.querySelector(".results-scroll-spacer")?.remove();
  const spacer = document.createElement("li");
  spacer.className = "results-scroll-spacer";
  spacer.setAttribute("aria-hidden", "true");
  listEl.appendChild(spacer);
}

/**
 * Altura da lista em px: no UXP o scroll só funciona com altura explícita,
 * então acompanhamos a janela nativa conforme o usuário redimensiona.
 */
function syncListHeight(root: HTMLElement, header: HTMLElement, listEl: HTMLElement): number {
  const rootHeight = root.clientHeight || DIALOG_HEIGHT;
  const headerH = header.offsetHeight || HEADER_HEIGHT;
  const listHeight = Math.max(120, rootHeight - headerH - 20);
  listEl.style.height = `${listHeight}px`;
  listEl.style.maxHeight = `${listHeight}px`;
  return listHeight;
}

export function showResultsDetailDialog(options: ResultDetailOptions): void {
  document.querySelectorAll(`[data-results-kind="${options.kind}"]`).forEach((el) => {
    try {
      (el as UxpDialog).close();
    } catch {
      el.remove();
    }
  });

  const titleColor = KIND_TITLE_COLOR[options.kind];

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = `editorial-results-detail-dialog-${options.kind}`;
  dialog.setAttribute("data-results-kind", options.kind);

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
  ensureScrollSpacer(listEl);
  syncListHeight(root, header, listEl);

  if (options.onIgnore) {
    bindIgnoreHandlers(listEl, options.onIgnore);
  }

  bindResultGroupToggles(listEl);

  let closed = false;
  let lastListHeight = 0;
  const resizePoll = window.setInterval(() => {
    if (closed) {
      window.clearInterval(resizePoll);
      return;
    }
    const target = Math.max(120, (root.clientHeight || DIALOG_HEIGHT) - (header.offsetHeight || HEADER_HEIGHT) - 20);
    if (target !== lastListHeight) {
      lastListHeight = syncListHeight(root, header, listEl);
    }
  }, 150);

  onActionActivate(closeBtn, () => {
    dialog.close();
  });

  const teardown = (): void => {
    if (closed) return;
    closed = true;
    window.clearInterval(resizePoll);
    dialog.removeEventListener("close", teardown);
    dialog.remove();
  };

  dialog.addEventListener("close", teardown);

  const windowOpts = {
    title: options.title,
    resize: "both" as const,
    size: { width: DIALOG_WIDTH, height: DIALOG_HEIGHT },
    minSize: { width: MIN_WIDTH, height: MIN_HEIGHT },
    maxSize: { width: MAX_WIDTH, height: MAX_HEIGHT },
  };

  const opened = openModelessDialog(dialog, windowOpts);
  window.setTimeout(() => {
    if (!closed) lastListHeight = syncListHeight(root, header, listEl);
  }, 60);

  if (!opened) {
    dialog.style.width = `${DIALOG_WIDTH}px`;
    dialog.style.height = `${DIALOG_HEIGHT}px`;
    dialog.show();
  }
}

function openModelessDialog(
  dialog: UxpDialog,
  options: {
    title: string;
    resize: "both";
    size: { width: number; height: number };
    minSize: { width: number; height: number };
    maxSize: { width: number; height: number };
  }
): boolean {
  try {
    if (typeof dialog.uxpShow === "function") {
      void dialog.uxpShow(options);
      return true;
    }
  } catch {
    // tenta show()
  }

  try {
    const result = dialog.show(options);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      void (result as Promise<unknown>);
    }
    return true;
  } catch {
    return false;
  }
}

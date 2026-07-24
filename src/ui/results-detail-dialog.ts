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

/** Tamanho único para Aprovados / Alertas / Erros — a janela acompanha esta área. */
const DIALOG_WIDTH = 720;
const DIALOG_HEIGHT = 520;
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

/** Modal fixo: a janela nativa e o conteúdo usam exatamente o mesmo tamanho. */
export async function showResultsDetailDialog(options: ResultDetailOptions): Promise<void> {
  const existing = document.getElementById("editorial-results-detail-dialog");
  if (existing) {
    existing.remove();
  }

  const titleColor = KIND_TITLE_COLOR[options.kind];

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-results-detail-dialog";
  dialog.style.padding = "0";
  dialog.style.margin = "0";
  dialog.style.border = "none";
  dialog.style.backgroundColor = BG;
  dialog.style.color = "#f2f0ec";
  dialog.style.overflow = "hidden";

  const root = document.createElement("div");
  root.className = "results-detail-dialog-content";
  root.setAttribute("data-kind", options.kind);
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.width = `${DIALOG_WIDTH}px`;
  root.style.height = `${DIALOG_HEIGHT}px`;
  root.style.margin = "0";
  root.style.padding = "0";
  root.style.boxSizing = "border-box";
  root.style.overflow = "hidden";
  root.style.backgroundColor = BG;

  const header = document.createElement("div");
  header.className = "results-detail-dialog-header";
  header.style.display = "flex";
  header.style.flexDirection = "row";
  header.style.alignItems = "center";
  header.style.flexShrink = "0";
  header.style.position = "relative";
  header.style.width = `${DIALOG_WIDTH}px`;
  header.style.height = `${HEADER_HEIGHT}px`;
  header.style.paddingTop = "10px";
  header.style.paddingBottom = "10px";
  header.style.paddingLeft = "16px";
  header.style.paddingRight = "16px";
  header.style.boxSizing = "border-box";
  header.style.borderBottom = `1px solid ${BORDER}`;
  header.style.backgroundColor = BG_HEADER;

  const titleEl = document.createElement("h2");
  titleEl.id = "results-detail-title";
  titleEl.className = "results-detail-dialog-heading";
  titleEl.textContent = options.title;
  titleEl.style.margin = "0";
  titleEl.style.marginRight = "16px";
  titleEl.style.width = "580px";
  titleEl.style.minWidth = "580px";
  titleEl.style.fontSize = "14px";
  titleEl.style.fontWeight = "700";
  titleEl.style.letterSpacing = "0.04em";
  titleEl.style.color = titleColor;
  titleEl.style.overflow = "hidden";
  titleEl.style.whiteSpace = "nowrap";
  titleEl.style.textOverflow = "ellipsis";

  const closeBtn = document.createElement("div");
  closeBtn.id = "results-detail-close";
  closeBtn.className = "btn btn-secondary results-detail-close";
  closeBtn.setAttribute("role", "button");
  closeBtn.tabIndex = 0;
  closeBtn.textContent = "Fechar";
  closeBtn.style.display = "flex";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "10px";
  closeBtn.style.right = "16px";
  closeBtn.style.alignItems = "center";
  closeBtn.style.justifyContent = "center";
  closeBtn.style.flexShrink = "0";
  closeBtn.style.boxSizing = "border-box";
  closeBtn.style.width = "88px";
  closeBtn.style.minWidth = "88px";
  closeBtn.style.height = "32px";
  closeBtn.style.padding = "0";
  closeBtn.style.margin = "0";
  closeBtn.style.border = `1px solid ${BORDER}`;
  closeBtn.style.borderRadius = "6px";
  closeBtn.style.backgroundColor = "#2c2c34";
  closeBtn.style.color = "#f2f0ec";
  closeBtn.style.fontSize = "12px";
  closeBtn.style.fontWeight = "600";
  closeBtn.style.cursor = "pointer";

  const listEl = document.createElement("ul");
  listEl.id = "results-detail-list";
  listEl.className = "results-detail-list result-list";
  listEl.style.listStyle = "none";
  listEl.style.margin = "0";
  listEl.style.paddingTop = "12px";
  listEl.style.paddingBottom = "12px";
  listEl.style.paddingLeft = "16px";
  listEl.style.paddingRight = "16px";
  listEl.style.width = `${DIALOG_WIDTH}px`;
  listEl.style.height = `${LIST_HEIGHT}px`;
  listEl.style.maxHeight = `${LIST_HEIGHT}px`;
  listEl.style.boxSizing = "border-box";
  listEl.style.overflowX = "hidden";
  listEl.style.overflowY = "scroll";
  listEl.style.flexShrink = "0";
  listEl.style.backgroundColor = BG;
  listEl.innerHTML = options.html || '<li class="empty-item">Nenhum item</li>';

  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  root.appendChild(header);
  root.appendChild(listEl);
  dialog.appendChild(root);
  document.body.appendChild(dialog);

  if (options.onIgnore) {
    bindIgnoreHandlers(listEl, options.onIgnore);
  }

  onActionActivate(closeBtn, () => {
    dialog.close();
  });

  try {
    // No InDesign 20.x, uxpShowModal pode ignorar size e reutilizar a janela
    // anterior. showModal dimensiona pelo filho direto, como na receita oficial.
    dialog.showModal();
    await waitForDialogClose(dialog);
  } catch {
    // usuário fechou / host cancelou
  } finally {
    dialog.remove();
  }
}

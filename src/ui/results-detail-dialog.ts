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

const MIN_WIDTH = 560;
const MIN_HEIGHT = 400;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 720;
const DEFAULT_WIDTH = 640;
const HEADER_HEIGHT = 52;

const KIND_TITLE_COLOR: Record<ResultDetailKind, string> = {
  approved: "#5ecf8e",
  warning: "#e6c35c",
  error: "#e87474",
};

function countListItems(html: string): number {
  return (html.match(/<li\b/gi) || []).length;
}

function computeDialogSize(html: string): { width: number; height: number } {
  const items = Math.max(1, countListItems(html));
  const idealHeight = HEADER_HEIGHT + 24 + items * 72;

  return {
    width: DEFAULT_WIDTH,
    height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, idealHeight)),
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

/**
 * Modal de detalhes — no UXP/InDesign o tamanho vem do filho direto em px
 * (igual à receita oficial). Evitar position:absolute / width:100% (colapsa).
 */
export async function showResultsDetailDialog(options: ResultDetailOptions): Promise<void> {
  const existing = document.getElementById("editorial-results-detail-dialog");
  if (existing) {
    existing.remove();
  }

  const size = computeDialogSize(options.html || "");
  const listHeight = Math.max(200, size.height - HEADER_HEIGHT);
  const titleColor = KIND_TITLE_COLOR[options.kind];

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-results-detail-dialog";
  dialog.style.padding = "0";
  dialog.style.margin = "0";
  dialog.style.border = "1px solid #4a4a54";
  dialog.style.backgroundColor = "#232329";
  dialog.style.color = "#f2f0ec";
  dialog.style.overflow = "hidden";

  const root = document.createElement("div");
  root.className = "results-detail-dialog-content";
  root.setAttribute("data-kind", options.kind);
  // Dimensões em px no filho direto — o host dimensiona a janela por isso
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.width = `${size.width}px`;
  root.style.minWidth = `${size.width}px`;
  root.style.height = `${size.height}px`;
  root.style.minHeight = `${size.height}px`;
  root.style.margin = "0";
  root.style.padding = "0";
  root.style.boxSizing = "border-box";
  root.style.overflow = "hidden";
  root.style.backgroundColor = "#232329";

  const header = document.createElement("div");
  header.className = "results-detail-dialog-header";
  header.style.display = "flex";
  header.style.flexDirection = "row";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.flexShrink = "0";
  header.style.height = `${HEADER_HEIGHT}px`;
  header.style.paddingTop = "10px";
  header.style.paddingBottom = "10px";
  header.style.paddingLeft = "16px";
  header.style.paddingRight = "16px";
  header.style.boxSizing = "border-box";
  header.style.borderBottom = "1px solid #3a3a42";
  header.style.backgroundColor = "#2a2a30";

  const titleEl = document.createElement("h2");
  titleEl.id = "results-detail-title";
  titleEl.className = "results-detail-dialog-heading";
  titleEl.textContent = options.title;
  titleEl.style.margin = "0";
  titleEl.style.marginRight = "12px";
  titleEl.style.flex = "1";
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
  closeBtn.style.flexShrink = "0";
  closeBtn.style.width = "auto";
  closeBtn.style.minWidth = "72px";

  const listEl = document.createElement("ul");
  listEl.id = "results-detail-list";
  listEl.className = "results-detail-list result-list";
  listEl.style.listStyle = "none";
  listEl.style.margin = "0";
  listEl.style.paddingTop = "12px";
  listEl.style.paddingBottom = "12px";
  listEl.style.paddingLeft = "16px";
  listEl.style.paddingRight = "16px";
  listEl.style.width = `${size.width}px`;
  listEl.style.height = `${listHeight}px`;
  listEl.style.maxHeight = `${listHeight}px`;
  listEl.style.boxSizing = "border-box";
  listEl.style.overflowX = "hidden";
  listEl.style.overflowY = "scroll";
  listEl.style.flexShrink = "0";
  listEl.style.backgroundColor = "#232329";
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
    if (typeof dialog.uxpShowModal === "function") {
      await dialog.uxpShowModal({
        title: options.title,
        resize: "both",
        size: { width: size.width, height: size.height },
        minSize: { width: MIN_WIDTH, height: MIN_HEIGHT },
        maxSize: { width: MAX_WIDTH, height: MAX_HEIGHT },
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

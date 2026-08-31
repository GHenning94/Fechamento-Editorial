import { onActionActivate } from "./action-control";

type UxpDialog = HTMLDialogElement & {
  uxpShowModal?(options: {
    title: string;
    resize?: "none" | "both" | "horizontal" | "vertical";
    size?: { width: number; height: number };
    minSize?: { width: number; height: number };
    maxSize?: { width: number; height: number };
  }): Promise<unknown>;
  returnValue: string;
};

export interface ConfirmDialogOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
}

const CONFIRM_VALUE = "confirm";
const DIALOG_WIDTH = 440;
const DIALOG_HEIGHT = 360;
const BG = "#232329";
const ACCENT = "#d4923a";
const TEXT = "#f2f0ec";
const MUTED = "#9c9891";
const BORDER = "#4a4a54";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Quebra o texto em linhas curtas — o UXP dimensiona a janela pelo comprimento intrínseco. */
function wrapPlainText(text: string, width = 40): string {
  const paragraphs = text.replace(/\r/g, "").split(/\n+/);
  const html: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > width && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    html.push(lines.map(escapeHtml).join("<br>"));
  }

  return html.join("<br><br>");
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

const DIALOG_SIZE = { width: DIALOG_WIDTH, height: DIALOG_HEIGHT };

/** Retorna true se o usuário confirmou; false se cancelou. */
export async function promptConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-confirm-dialog";
  dialog.innerHTML = `
    <div class="confirm-dialog-root">
      <div class="confirm-dialog-sizer"></div>
      <h2 class="confirm-dialog-heading"></h2>
      <p class="confirm-dialog-body"></p>
      <div class="confirm-dialog-actions">
        <div id="uxp-confirm-cancel" class="btn btn-secondary confirm-dialog-btn" role="button" tabindex="0"></div>
        <div id="uxp-confirm-ok" class="btn btn-primary confirm-dialog-btn" role="button" tabindex="0"></div>
      </div>
    </div>
  `;

  const root = dialog.querySelector(".confirm-dialog-root") as HTMLElement;
  const sizer = dialog.querySelector(".confirm-dialog-sizer") as HTMLElement;
  const heading = dialog.querySelector(".confirm-dialog-heading") as HTMLElement;
  const body = dialog.querySelector(".confirm-dialog-body") as HTMLElement;
  const actions = dialog.querySelector(".confirm-dialog-actions") as HTMLElement;
  const btnConfirm = dialog.querySelector("#uxp-confirm-ok") as HTMLElement;
  const btnCancel = dialog.querySelector("#uxp-confirm-cancel") as HTMLElement;

  heading.textContent = options.title;
  body.innerHTML = wrapPlainText(options.body);
  btnConfirm.textContent = options.confirmLabel;
  btnCancel.textContent = options.cancelLabel || "Cancelar";
  dialog.returnValue = "";

  dialog.style.cssText = [
    "padding:0",
    "margin:0",
    "border:none",
    "width:100%",
    "height:100%",
    `background-color:${BG}`,
    `color:${TEXT}`,
    "overflow:hidden",
    "box-sizing:border-box",
  ].join(";");

  root.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "width:100%",
    "height:100%",
    "margin:0",
    "padding:22px 22px 20px",
    "box-sizing:border-box",
    `background-color:${BG}`,
  ].join(";");

  sizer.style.cssText = [
    `width:${DIALOG_WIDTH - 44}px`,
    "height:0",
    "overflow:hidden",
    "flex-shrink:0",
  ].join(";");

  heading.style.cssText = [
    "margin:0 0 12px 0",
    "font-size:14px",
    "font-weight:700",
    "letter-spacing:0.04em",
    `color:${ACCENT}`,
    "flex-shrink:0",
  ].join(";");

  body.style.cssText = [
    "margin:0",
    "flex:1 1 auto",
    "min-height:0",
    `color:${MUTED}`,
    "line-height:1.5",
    "font-size:12px",
    "white-space:normal",
    "overflow-wrap:break-word",
    "word-wrap:break-word",
  ].join(";");

  actions.style.cssText = [
    "display:flex",
    "flex-direction:row",
    "justify-content:flex-end",
    "align-items:center",
    "flex-shrink:0",
    "margin:24px 0 0 0",
    "padding-top:4px",
    "gap:8px",
  ].join(";");

  const btnBase = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:auto",
    "flex:0 0 auto",
    "min-width:110px",
    "height:34px",
    "padding:0 14px",
    "margin:0",
    "box-sizing:border-box",
    "border-radius:6px",
    "font-size:11px",
    "font-weight:600",
    "letter-spacing:0.04em",
    "text-transform:uppercase",
    "cursor:pointer",
  ].join(";");

  btnCancel.style.cssText =
    btnBase +
    `;border:1px solid ${BORDER};background-color:${BG};color:${TEXT};`;
  btnConfirm.style.cssText =
    btnBase + ";border:1px solid #b87a2c;background-color:#d4923a;color:#1a140c;";

  document.body.appendChild(dialog);

  onActionActivate(btnConfirm, () => {
    dialog.close(CONFIRM_VALUE);
  });
  onActionActivate(btnCancel, () => {
    dialog.close("");
  });

  const modalOptions = {
    title: options.title,
    resize: "none" as const,
    size: DIALOG_SIZE,
    minSize: DIALOG_SIZE,
    maxSize: DIALOG_SIZE,
  };

  try {
    if (typeof dialog.uxpShowModal === "function") {
      await dialog.uxpShowModal(modalOptions);
    } else {
      dialog.showModal();
      await waitForDialogClose(dialog);
    }
  } catch {
    dialog.remove();
    return false;
  }

  const confirmed = String(dialog.returnValue || "") === CONFIRM_VALUE;
  dialog.remove();
  return confirmed;
}

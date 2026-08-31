import { onActionActivate } from "./action-control";

type UxpDialog = HTMLDialogElement & {
  uxpShowModal?(options: {
    title: string;
    resize?: "none" | "both" | "horizontal" | "vertical";
    size?: { width: number; height: number };
  }): Promise<unknown>;
  returnValue: string;
};

const DIALOG_WIDTH = 420;
const DIALOG_HEIGHT = 280;

export interface ConfirmDialogOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
}

const CONFIRM_VALUE = "confirm";

let dialogInstance: UxpDialog | null = null;

function getConfirmDialog(): UxpDialog {
  if (dialogInstance) {
    return dialogInstance;
  }

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-confirm-dialog";
  dialog.innerHTML = `
    <div class="user-name-dialog-content confirm-dialog-content">
      <h2 id="uxp-confirm-heading" class="user-name-dialog-heading"></h2>
      <p id="uxp-confirm-body" class="user-name-dialog-body"></p>
      <div class="user-name-dialog-actions confirm-dialog-actions">
        <div id="uxp-confirm-cancel" class="btn btn-secondary" role="button" tabindex="0">Cancelar</div>
        <div id="uxp-confirm-ok" class="btn btn-primary" role="button" tabindex="0">Continuar</div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const btnConfirm = dialog.querySelector("#uxp-confirm-ok") as HTMLElement;
  const btnCancel = dialog.querySelector("#uxp-confirm-cancel") as HTMLElement;

  onActionActivate(btnConfirm, () => {
    dialog.close(CONFIRM_VALUE);
  });
  onActionActivate(btnCancel, () => {
    dialog.close("");
  });

  dialogInstance = dialog;
  return dialog;
}

/** Retorna true se o usuário confirmou; false se cancelou. */
export async function promptConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  const dialog = getConfirmDialog();
  const heading = dialog.querySelector("#uxp-confirm-heading") as HTMLElement;
  const body = dialog.querySelector("#uxp-confirm-body") as HTMLElement;
  const btnConfirm = dialog.querySelector("#uxp-confirm-ok") as HTMLElement;
  const btnCancel = dialog.querySelector("#uxp-confirm-cancel") as HTMLElement;

  heading.textContent = options.title;
  body.textContent = options.body;
  btnConfirm.textContent = options.confirmLabel;
  btnCancel.textContent = options.cancelLabel || "Cancelar";
  dialog.returnValue = "";

  const showPromise =
    typeof dialog.uxpShowModal === "function"
      ? dialog.uxpShowModal({
          title: options.title,
          resize: "none",
          size: { width: DIALOG_WIDTH, height: DIALOG_HEIGHT },
        })
      : dialog.showModal();

  try {
    await showPromise;
  } catch {
    return false;
  }

  return String(dialog.returnValue || "") === CONFIRM_VALUE;
}

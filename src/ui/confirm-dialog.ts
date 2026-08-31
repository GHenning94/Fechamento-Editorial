import { onActionActivate } from "./action-control";

type UxpDialog = HTMLDialogElement & {
  uxpShowModal?(options: { title: string }): Promise<unknown>;
  returnValue: string;
};

const CONFIRM_VALUE = "confirm";

let dialogInstance: UxpDialog | null = null;

function getConfirmDialog(): UxpDialog {
  if (dialogInstance) {
    return dialogInstance;
  }

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-confirm-dialog";
  dialog.innerHTML = `
    <div class="user-name-dialog-content">
      <h2 class="user-name-dialog-heading">Layer de memorial descritivo</h2>
      <p class="user-name-dialog-body">
        Não existe a layer de memorial descritivo
        neste documento.
      </p>
      <p class="user-name-dialog-body">
        Os PDFs serão gerados mesmo assim,
        sem essa layer.
      </p>
      <p class="user-name-dialog-body">
        Deseja fechar o material mesmo assim?
      </p>
      <div class="user-name-dialog-actions">
        <div id="uxp-confirm-cancel" class="btn btn-secondary" role="button" tabindex="0">Cancelar</div>
        <div id="uxp-confirm-ok" class="btn btn-primary" role="button" tabindex="0">Fechar mesmo assim</div>
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
export async function promptConfirmDialog(): Promise<boolean> {
  const dialog = getConfirmDialog();
  dialog.returnValue = "";

  const showPromise =
    typeof dialog.uxpShowModal === "function"
      ? dialog.uxpShowModal({ title: "Layer de memorial descritivo" })
      : dialog.showModal();

  try {
    await showPromise;
  } catch {
    return false;
  }

  return String(dialog.returnValue || "") === CONFIRM_VALUE;
}

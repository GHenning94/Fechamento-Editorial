import { PackageCancelledError } from "../utils/file-system";
import { onActionActivate } from "./action-control";

interface UxpTextField extends HTMLInputElement {}

type UxpDialog = HTMLDialogElement & {
  uxpShowModal?(options: { title: string }): Promise<unknown>;
  returnValue: string;
};

type ModalMode = "name" | "confirm";

const CONFIRM_VALUE = "__eac_confirm__";

let dialogInstance: UxpDialog | null = null;
let modalMode: ModalMode = "name";

function getAppModalDialog(): UxpDialog {
  if (dialogInstance) {
    return dialogInstance;
  }

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-user-name-dialog";
  dialog.innerHTML = `
    <div class="user-name-dialog-content">
      <h2 id="uxp-modal-heading" class="user-name-dialog-heading">Nome para o relatório</h2>
      <div id="uxp-confirm-fields" class="hidden">
        <p class="user-name-dialog-body">
          Não existe a layer de memorial descritivo neste documento.
        </p>
        <p class="user-name-dialog-body">
          Os PDFs serão gerados mesmo assim, sem essa layer.
        </p>
        <p class="user-name-dialog-body">
          Deseja fechar o material mesmo assim?
        </p>
      </div>
      <div id="uxp-name-fields">
        <p class="user-name-dialog-body">
          Informe seu nome para constar no relatório de fechamento.
        </p>
        <label class="user-name-dialog-label" for="uxp-user-name-input">Nome</label>
        <input id="uxp-user-name-input" class="user-name-dialog-native-input" type="text" size="32" />
        <p id="uxp-user-name-error" class="user-name-dialog-error hidden">
          Informe um nome para continuar.
        </p>
      </div>
      <div class="user-name-dialog-actions">
        <div id="uxp-user-name-cancel" class="btn btn-secondary" role="button" tabindex="0">Cancelar</div>
        <div id="uxp-user-name-confirm" class="btn btn-primary" role="button" tabindex="0">Continuar</div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = dialog.querySelector("#uxp-user-name-input") as UxpTextField;
  const errorEl = dialog.querySelector("#uxp-user-name-error") as HTMLElement;
  const btnConfirm = dialog.querySelector("#uxp-user-name-confirm") as HTMLElement;
  const btnCancel = dialog.querySelector("#uxp-user-name-cancel") as HTMLElement;

  const hideError = (): void => {
    errorEl.classList.add("hidden");
  };

  const showError = (): void => {
    errorEl.classList.remove("hidden");
  };

  const confirm = (): void => {
    if (modalMode === "confirm") {
      hideError();
      dialog.close(CONFIRM_VALUE);
      return;
    }

    const trimmed = String(input.value || "").trim();
    if (!trimmed) {
      showError();
      input.focus();
      return;
    }
    hideError();
    dialog.close(trimmed);
  };

  const cancel = (): void => {
    hideError();
    dialog.close("");
  };

  onActionActivate(btnConfirm, confirm);
  onActionActivate(btnCancel, cancel);
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirm();
    }
  });

  dialogInstance = dialog;
  return dialog;
}

function applyModalMode(mode: ModalMode): void {
  const dialog = getAppModalDialog();
  const heading = dialog.querySelector("#uxp-modal-heading") as HTMLElement;
  const nameFields = dialog.querySelector("#uxp-name-fields") as HTMLElement;
  const confirmFields = dialog.querySelector("#uxp-confirm-fields") as HTMLElement;
  const btnConfirm = dialog.querySelector("#uxp-user-name-confirm") as HTMLElement;
  const errorEl = dialog.querySelector("#uxp-user-name-error") as HTMLElement;
  const content = dialog.querySelector(".user-name-dialog-content") as HTMLElement;

  modalMode = mode;
  errorEl.classList.add("hidden");
  content.classList.toggle("is-confirm-mode", mode === "confirm");

  if (mode === "confirm") {
    heading.textContent = "Layer de memorial descritivo";
    confirmFields.classList.remove("hidden");
    nameFields.classList.add("hidden");
    btnConfirm.textContent = "Fechar mesmo assim";
  } else {
    heading.textContent = "Nome para o relatório";
    confirmFields.classList.add("hidden");
    nameFields.classList.remove("hidden");
    btnConfirm.textContent = "Continuar";
  }
}

export async function promptUserNameDialog(defaultName: string): Promise<string> {
  const dialog = getAppModalDialog();
  const input = dialog.querySelector("#uxp-user-name-input") as UxpTextField;

  applyModalMode("name");
  input.value = defaultName;
  dialog.returnValue = "";

  const showPromise =
    typeof dialog.uxpShowModal === "function"
      ? dialog.uxpShowModal({ title: "Nome para o relatório" })
      : dialog.showModal();

  window.setTimeout(() => {
    try {
      input.focus();
    } catch {
      // ignora falha de foco no UXP
    }
  }, 120);

  try {
    await showPromise;
  } catch {
    throw new PackageCancelledError("Fechamento cancelado.");
  }

  const result = String(dialog.returnValue || "").trim();
  if (!result || result === CONFIRM_VALUE) {
    throw new PackageCancelledError("Fechamento cancelado.");
  }

  return result;
}

/** Retorna true se o usuário confirmou; false se cancelou. */
export async function promptConfirmDialog(): Promise<boolean> {
  const dialog = getAppModalDialog();
  applyModalMode("confirm");
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

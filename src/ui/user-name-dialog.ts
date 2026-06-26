import { PackageCancelledError } from "../utils/file-system";

interface UxpTextField extends HTMLInputElement {}

type UxpDialog = HTMLDialogElement & {
  uxpShowModal?(options: { title: string }): Promise<unknown>;
  returnValue: string;
};

let dialogInstance: UxpDialog | null = null;

function getUserNameDialog(): UxpDialog {
  if (dialogInstance) {
    return dialogInstance;
  }

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-user-name-dialog";
  dialog.innerHTML = `
    <div class="user-name-dialog-content">
      <h2 class="user-name-dialog-heading">Nome para o relatório</h2>
      <p class="user-name-dialog-body">
        Informe seu nome para constar no relatório de fechamento.
      </p>
      <label class="user-name-dialog-label" for="uxp-user-name-input">Nome</label>
      <input id="uxp-user-name-input" class="user-name-dialog-native-input" type="text" />
      <p id="uxp-user-name-error" class="user-name-dialog-error hidden">
        Informe um nome para continuar.
      </p>
      <div class="user-name-dialog-actions">
        <button id="uxp-user-name-cancel" class="btn btn-secondary" type="button">Cancelar</button>
        <button id="uxp-user-name-confirm" class="btn btn-primary" type="button">Continuar</button>
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

  btnConfirm.addEventListener("click", confirm);
  btnCancel.addEventListener("click", cancel);
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirm();
    }
  });

  dialogInstance = dialog;
  return dialog;
}

export async function promptUserNameDialog(defaultName: string): Promise<string> {
  const dialog = getUserNameDialog();
  const input = dialog.querySelector("#uxp-user-name-input") as UxpTextField;

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
  if (!result) {
    throw new PackageCancelledError("Fechamento cancelado.");
  }

  return result;
}

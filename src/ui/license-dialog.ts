import { LicenseError } from "../licensing/license-types";
import { activateLicense, isLicenseActive } from "../licensing/license-service";
import { normalizeSerialInput } from "../licensing/license-crypto";
import { onActionActivate, setActionDisabled } from "./action-control";

export interface LicenseActivationCallbacks {
  onSuccess: () => void;
  onCancel: () => void;
}

type UxpDialog = HTMLDialogElement & {
  uxpShowModal?(options: { title: string }): Promise<unknown>;
  returnValue: string;
};

let dialogInstance: UxpDialog | null = null;
let typedSerial = "";
let licensePromptOpen = false;
let licensePromptInFlight: Promise<boolean> | null = null;

export function isLicensePromptOpen(): boolean {
  return licensePromptOpen || licensePromptInFlight !== null;
}

async function readClipboardText(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const clip = require("clipboard") as { readText?: () => string | Promise<string> };
    if (typeof clip?.readText === "function") {
      return String((await clip.readText()) || "");
    }
  } catch {
    // módulo clipboard indisponível
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // permissão ou API ausente
  }

  return "";
}

function getLicenseDialog(): UxpDialog {
  if (dialogInstance) {
    return dialogInstance;
  }

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-license-dialog";
  dialog.innerHTML = `
    <div class="user-name-dialog-content">
      <h2 class="user-name-dialog-heading">Ativação do plugin</h2>
      <p class="user-name-dialog-body">
        Informe o serial (EAC1-XXXX-XXXX-XXXX-XXXX). Depois de ativar, este computador
        não pede o código de novo, só em caso de reinstalação.
      </p>
      <label class="user-name-dialog-label" for="uxp-license-input">Serial</label>
      <input
        id="uxp-license-input"
        class="user-name-dialog-native-input license-serial-input"
        type="text"
        spellcheck="false"
        autocomplete="off"
      />
      <p id="uxp-license-error" class="user-name-dialog-error hidden"></p>
      <div class="user-name-dialog-actions license-dialog-actions">
        <div id="uxp-license-paste" class="btn btn-secondary" role="button" tabindex="0">Colar</div>
        <div id="uxp-license-cancel" class="btn btn-secondary" role="button" tabindex="0">Cancelar</div>
        <div id="uxp-license-confirm" class="btn btn-primary" role="button" tabindex="0">Ativar</div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const input = dialog.querySelector("#uxp-license-input") as HTMLInputElement;
  const errorEl = dialog.querySelector("#uxp-license-error") as HTMLElement;
  const btnConfirm = dialog.querySelector("#uxp-license-confirm") as HTMLElement;
  const btnCancel = dialog.querySelector("#uxp-license-cancel") as HTMLElement;
  const btnPaste = dialog.querySelector("#uxp-license-paste") as HTMLElement;

  const hideError = (): void => {
    errorEl.classList.add("hidden");
    errorEl.textContent = "";
  };

  const showError = (message: string): void => {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  };

  const currentSerial = (): string => {
    const fromInput = String(input.value || "").trim();
    return normalizeSerialInput(fromInput || typedSerial);
  };

  const applySerial = (value: string): void => {
    const normalized = normalizeSerialInput(value);
    typedSerial = normalized;
    input.value = normalized;
  };

  input.addEventListener("input", () => {
    typedSerial = String(input.value || "");
    hideError();
  });
  input.addEventListener("change", () => {
    typedSerial = String(input.value || "");
  });

  const onCancel = (): void => {
    hideError();
    dialog.close("");
  };

  const onPaste = async (): Promise<void> => {
    hideError();
    const text = await readClipboardText();
    if (!text.trim()) {
      showError("Não foi possível ler a área de transferência. Cole com Cmd+V no campo.");
      input.focus();
      return;
    }
    applySerial(text);
    input.focus();
  };

  const onConfirm = async (): Promise<void> => {
    const serial = currentSerial();
    if (!serial) {
      showError("Informe o serial para continuar.");
      input.focus();
      return;
    }

    hideError();
    setActionDisabled(btnConfirm, true);
    btnConfirm.textContent = "Ativando...";

    try {
      await activateLicense(serial);
      dialog.close("activated");
    } catch (error) {
      let message = "Falha na ativação.";
      if (error instanceof LicenseError) {
        message = error.message;
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }
      showError(message);
    } finally {
      setActionDisabled(btnConfirm, false);
      btnConfirm.textContent = "Ativar";
    }
  };

  onActionActivate(btnConfirm, () => {
    void onConfirm();
  });
  onActionActivate(btnCancel, onCancel);
  onActionActivate(btnPaste, () => {
    void onPaste();
  });
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void onConfirm();
    }
  });

  dialogInstance = dialog;
  return dialog;
}

export async function promptLicenseActivation(_container?: HTMLElement): Promise<boolean> {
  if (await isLicenseActive()) {
    return true;
  }

  if (licensePromptInFlight) {
    return licensePromptInFlight;
  }

  licensePromptOpen = true;
  licensePromptInFlight = (async () => {
    try {
      const dialog = getLicenseDialog();
      const input = dialog.querySelector("#uxp-license-input") as HTMLInputElement;
      const errorEl = dialog.querySelector("#uxp-license-error") as HTMLElement;

      typedSerial = "";
      input.value = "";
      errorEl.classList.add("hidden");
      errorEl.textContent = "";
      dialog.returnValue = "";

      try {
        const clip = await readClipboardText();
        const fromClip = normalizeSerialInput(clip);
        if (fromClip.startsWith("EAC1-")) {
          typedSerial = fromClip;
          input.value = fromClip;
        }
      } catch {
        // segue com campo vazio
      }

      const showPromise =
        typeof dialog.uxpShowModal === "function"
          ? dialog.uxpShowModal({ title: "Ativação do plugin" })
          : dialog.showModal();

      window.setTimeout(() => {
        try {
          input.focus();
        } catch {
          // ignora falha de foco no UXP
        }
      }, 80);

      try {
        await showPromise;
      } catch {
        return false;
      }

      return dialog.returnValue === "activated" || (await isLicenseActive());
    } finally {
      licensePromptOpen = false;
      licensePromptInFlight = null;
    }
  })();

  return licensePromptInFlight;
}

export function showLicenseActivationForm(
  container: HTMLElement,
  callbacks: LicenseActivationCallbacks
): void {
  void promptLicenseActivation(container).then((ok) => {
    if (ok) {
      callbacks.onSuccess();
    } else {
      callbacks.onCancel();
    }
  });
}

/** @deprecated Use promptLicenseActivation */
export async function ensureLicenseActivated(host?: HTMLElement): Promise<boolean> {
  return promptLicenseActivation(host);
}

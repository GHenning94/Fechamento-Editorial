import { LicenseError } from "../licensing/license-types";
import { activateLicense, isLicenseActive } from "../licensing/license-service";

export interface LicenseActivationCallbacks {
  onSuccess: () => void;
  onCancel: () => void;
}

const FORM_ID = "license-activation-panel";

export function showLicenseActivationForm(
  container: HTMLElement,
  callbacks: LicenseActivationCallbacks
): void {
  container.innerHTML = `
    <div id="${FORM_ID}" class="panel license-activation-panel">
      <header class="panel-header">
        <h1 class="panel-title">EDITORIAL AUTOCLOSE</h1>
        <p class="panel-subtitle">Ativação do plugin</p>
      </header>

      <div class="license-activation-body">
        <p class="license-activation-text">
          Informe o serial fornecido pelo titular (formato EAC1-XXXX-XXXX-XXXX-XXXX).
          Cada código vale para uma instalação.
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

        <div class="license-activation-actions">
          <button id="uxp-license-cancel" class="btn btn-secondary" type="button">Cancelar</button>
          <button id="uxp-license-confirm" class="btn btn-primary" type="button">Ativar</button>
        </div>
      </div>
    </div>
  `;

  const input = container.querySelector("#uxp-license-input") as HTMLInputElement;
  const errorEl = container.querySelector("#uxp-license-error") as HTMLElement;
  const btnConfirm = container.querySelector("#uxp-license-confirm") as HTMLButtonElement;
  const btnCancel = container.querySelector("#uxp-license-cancel") as HTMLButtonElement;

  const hideError = (): void => {
    errorEl.classList.add("hidden");
    errorEl.textContent = "";
  };

  const showError = (message: string): void => {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  };

  const onCancel = (): void => {
    hideError();
    callbacks.onCancel();
  };

  const onConfirm = async (): Promise<void> => {
    const trimmed = String(input.value || "").trim();
    if (!trimmed) {
      showError("Informe o serial para continuar.");
      input.focus();
      return;
    }

    hideError();
    btnConfirm.disabled = true;
    btnConfirm.textContent = "Ativando...";

    try {
      await activateLicense(trimmed);
      callbacks.onSuccess();
    } catch (error) {
      let message = "Falha na ativação.";
      if (error instanceof LicenseError) {
        message = error.message;
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }
      showError(message);
    } finally {
      btnConfirm.disabled = false;
      btnConfirm.textContent = "Ativar";
    }
  };

  btnConfirm.addEventListener("click", () => {
    void onConfirm();
  });
  btnCancel.addEventListener("click", onCancel);
  input.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void onConfirm();
    }
  });

  window.setTimeout(() => {
    try {
      input.focus();
    } catch {
      // ignore
    }
  }, 80);
}

export async function promptLicenseActivation(container: HTMLElement): Promise<boolean> {
  if (await isLicenseActive()) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    showLicenseActivationForm(container, {
      onSuccess: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

/** @deprecated Use promptLicenseActivation */
export async function ensureLicenseActivated(host?: HTMLElement): Promise<boolean> {
  const target = host || document.body;
  return promptLicenseActivation(target);
}

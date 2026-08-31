import { LicenseError } from "../licensing/license-types";
import { activateLicense, isLicenseActive } from "../licensing/license-service";
import { normalizeSerialInput } from "../licensing/license-crypto";
import { showNativeAlert, showNativePrompt } from "./native-indesign-dialog";

export interface LicenseActivationCallbacks {
  onSuccess: () => void;
  onCancel: () => void;
}

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

async function defaultSerialValue(): Promise<string> {
  try {
    const clip = await readClipboardText();
    const fromClip = normalizeSerialInput(clip);
    if (fromClip.startsWith("EAC1-")) {
      return fromClip;
    }
  } catch {
    // segue vazio
  }
  return "";
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
      let lastValue = await defaultSerialValue();

      while (true) {
        const entered = showNativePrompt(
          "Informe o serial (EAC1-XXXX-XXXX-XXXX-XXXX).\nDepois de ativar, este computador não pede o código de novo, só em caso de reinstalação.",
          lastValue,
          "Ativação do plugin"
        );

        if (entered === null) {
          return false;
        }

        const serial = normalizeSerialInput(entered);
        lastValue = serial;

        if (!serial) {
          showNativeAlert("Informe o serial para continuar.", "Ativação do plugin");
          continue;
        }

        try {
          await activateLicense(serial);
          return true;
        } catch (error) {
          let message = "Falha na ativação.";
          if (error instanceof LicenseError) {
            message = error.message;
          } else if (error instanceof Error && error.message) {
            message = error.message;
          }
          showNativeAlert(message, "Ativação do plugin");
        }
      }
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

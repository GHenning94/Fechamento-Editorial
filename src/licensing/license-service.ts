import { LICENSE_ACTIVATION_URL } from "./license-config";
import { normalizeSerialInput, verifyLicenseSerial } from "./license-crypto";
import { ensureInstallId, readInstallId } from "./install-id";
import { getMachineId } from "./machine-id";
import { LicenseError, LicensePayload, StoredLicense } from "./license-types";
import { clearStoredLicense, readStoredLicense, writeStoredLicense } from "./license-storage";

function activationUrl(): string {
  return LICENSE_ACTIVATION_URL.trim().replace(/\/$/, "");
}

function readErrorMessage(raw: string, contentType: string, fallback: string): string {
  try {
    if (contentType.includes("application/json")) {
      const body = JSON.parse(raw) as { error?: string };
      if (body.error) {
        return body.error;
      }
    }
  } catch {
    // ignore
  }
  return fallback;
}

async function activateOnServer(
  serial: string,
  licenseId: string,
  machineId: string,
  installId: string
): Promise<void> {
  const baseUrl = activationUrl();
  if (!baseUrl) {
    throw new LicenseError(
      "Servidor de ativação não configurado. Cada serial só pode ser usado uma vez."
    );
  }

  const url = `${baseUrl}/activate`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial, jti: licenseId, machineId, installId }),
    });
  } catch {
    const hint = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")
      ? " Inicie com: npm run license:server"
      : " Verifique a internet e tente de novo.";
    throw new LicenseError(
      `Não foi possível contactar o servidor de ativação.${hint}`
    );
  }

  if (response.status === 409) {
    let message =
      "Este serial já foi usado. Desinstalar ou reinstalar o plugin exige um serial novo.";
    try {
      const raw = await response.text();
      message = readErrorMessage(raw, response.headers.get("content-type") || "", message);
    } catch {
      // ignore
    }
    throw new LicenseError(message);
  }

  if (!response.ok) {
    let message = "Ativação recusada pelo servidor.";
    try {
      const raw = await response.text();
      message = readErrorMessage(raw, response.headers.get("content-type") || "", message);
    } catch {
      // ignore
    }
    throw new LicenseError(message);
  }
}

export async function isLicenseActive(): Promise<boolean> {
  const stored = await readStoredLicense();
  if (!stored) {
    return false;
  }

  try {
    const installId = await readInstallId();
    const machineId = getMachineId();
    if (!installId || stored.installId !== installId) {
      return false;
    }
    if (!stored.machineId || stored.machineId !== machineId) {
      return false;
    }

    const payload = await verifyLicenseSerial(stored.serial);
    return payload.id === stored.licenseId;
  } catch {
    return false;
  }
}

export async function activateLicense(serial: string): Promise<StoredLicense> {
  const normalized = normalizeSerialInput(serial);
  const payload = await verifyLicenseSerial(normalized);
  const machineId = getMachineId();
  let installId: string;

  try {
    installId = await ensureInstallId();
  } catch (error) {
    throw new LicenseError(
      error instanceof Error
        ? error.message
        : "Não foi possível prender a licença nesta instalação do plugin."
    );
  }

  await activateOnServer(normalized, payload.id, machineId, installId);

  const stored: StoredLicense = {
    serial: normalized,
    licenseId: payload.id,
    machineId,
    installId,
    activatedAt: new Date().toISOString(),
  };

  try {
    await writeStoredLicense(stored);
  } catch (error) {
    throw new LicenseError(
      error instanceof Error
        ? error.message
        : "Serial válido, mas a licença não pôde ser salva neste computador."
    );
  }

  return stored;
}

/** Remove licença salva (para testes ou troca de serial). Retorna true se removeu. */
export async function deactivateLicense(): Promise<boolean> {
  return clearStoredLicense();
}

export type { LicensePayload };

import { LICENSE_ACTIVATION_URL } from "./license-config";
import { normalizeSerialInput, verifyLicenseSerial } from "./license-crypto";
import { LicenseError, LicensePayload, StoredLicense } from "./license-types";
import { clearStoredLicense, readStoredLicense, writeStoredLicense } from "./license-storage";

async function activateOnServer(serial: string, licenseId: string): Promise<void> {
  const baseUrl = LICENSE_ACTIVATION_URL.trim();
  if (!baseUrl) {
    return;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/activate`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial, jti: licenseId }),
    });
  } catch {
    const hint = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")
      ? " Inicie com: npm run license:server"
      : "";
    throw new LicenseError(
      `Não foi possível contactar o servidor de ativação.${hint}`
    );
  }

  if (!response.ok && response.status !== 409) {
    let message = "Ativação recusada pelo servidor.";
    try {
      const raw = await response.text();
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = JSON.parse(raw) as { error?: string };
        if (body.error) {
          message = body.error;
        }
      }
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
    const payload = await verifyLicenseSerial(stored.serial);
    return payload.id === stored.licenseId;
  } catch {
    return false;
  }
}

export async function activateLicense(serial: string): Promise<StoredLicense> {
  const normalized = normalizeSerialInput(serial);
  const payload = await verifyLicenseSerial(normalized);

  await activateOnServer(normalized, payload.id);

  const stored: StoredLicense = {
    serial: normalized,
    licenseId: payload.id,
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

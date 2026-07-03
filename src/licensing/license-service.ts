import { sha256Hex } from "../utils/sha256";
import { LICENSE_ACTIVATION_URL } from "./license-config";
import { verifyLicenseSerial } from "./license-crypto";
import { LicenseError, LicensePayload, StoredLicense } from "./license-types";
import { clearStoredLicense, readStoredLicense, writeStoredLicense } from "./license-storage";

export function getMachineId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { userInfo } = require("os") as {
      userInfo: () => { username?: string; hostname?: string };
    };
    const info = userInfo();
    const raw = `${info.hostname || "host"}|${info.username || "user"}|editorial-autoclose`;
    return sha256Hex(raw).slice(0, 32);
  } catch {
    return sha256Hex("editorial-autoclose|unknown-machine").slice(0, 32);
  }
}

async function activateOnServer(serial: string, machineId: string, licenseId: string): Promise<void> {
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
      body: JSON.stringify({ serial, machineId, jti: licenseId }),
    });
  } catch {
    const hint = baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")
      ? " Inicie com: npm run license:server"
      : "";
    throw new LicenseError(
      `Não foi possível contactar o servidor de ativação.${hint} Para testes locais sem servidor, deixe LICENSE_ACTIVATION_URL vazio em license-config.ts.`
    );
  }

  if (response.status === 409) {
    throw new LicenseError(
      "Este serial já foi utilizado. Solicite um novo código ao titular."
    );
  }

  if (!response.ok) {
    let message = "Ativação recusada pelo servidor.";
    const contentType = response.headers.get("content-type") || "";

    if (response.status === 503 || response.status === 502) {
      message =
        "Servidor de ativação indisponível. Para testes locais, deixe LICENSE_ACTIVATION_URL vazio em license-config.ts, rode npm run build e Unload/Load no UDT.";
    }

    try {
      const raw = await response.text();
      if (contentType.includes("application/json")) {
        const body = JSON.parse(raw) as { error?: string };
        if (body.error) {
          message = body.error;
        }
      } else if (/suspended|indispon/i.test(raw)) {
        message =
          "Servidor de ativação suspenso ou offline. Para testes locais, deixe LICENSE_ACTIVATION_URL vazio em license-config.ts, rode npm run build e Unload/Load no UDT.";
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
    if (payload.id !== stored.licenseId) {
      return false;
    }
    return stored.machineId === getMachineId();
  } catch {
    return false;
  }
}

export async function activateLicense(serial: string): Promise<StoredLicense> {
  const normalized = normalizeSerialDisplay(serial);
  const payload = await verifyLicenseSerial(normalized);
  const machineId = getMachineId();

  await activateOnServer(normalized, machineId, payload.id);

  const stored: StoredLicense = {
    serial: normalized,
    licenseId: payload.id,
    machineId,
    activatedAt: new Date().toISOString(),
  };

  await writeStoredLicense(stored);
  return stored;
}

/** Remove licença salva (para testes ou troca de serial). Retorna true se removeu. */
export async function deactivateLicense(): Promise<boolean> {
  return clearStoredLicense();
}

function normalizeSerialDisplay(serial: string): string {
  return serial.trim().replace(/\s+/g, "").toUpperCase();
}

export type { LicensePayload };

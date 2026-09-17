import { verifyEd25519 } from "./ed25519-verify";
import {
  SERIAL_PREFIX,
  base64ToBytes,
  compactSerial,
  formatSerial,
  parseCompactSerial,
  signedPayloadBytes,
} from "./license-codec";
import { LICENSE_PUBLIC_KEY_B64 } from "./license-public-key";
import { LicenseError, LicensePayload } from "./license-types";

let publicKeyBytes: Uint8Array | null = null;

function getPublicKey(): Uint8Array {
  if (!publicKeyBytes) {
    const decoded = base64ToBytes(LICENSE_PUBLIC_KEY_B64);
    publicKeyBytes = decoded.length > 32 ? decoded.subarray(decoded.length - 32) : decoded;
  }

  if (publicKeyBytes.length !== 32) {
    throw new LicenseError("Chave pública de licença inválida neste plugin.");
  }

  return publicKeyBytes;
}

/** Aceita cola com espaços, hífens unicode ou o bloco inteiro do terminal. */
export function normalizeSerialInput(input: string): string {
  const compact = compactSerial(input);
  if (!compact.startsWith(SERIAL_PREFIX)) {
    return compact;
  }
  return formatSerial(compact);
}

export function parseLicenseSerial(serial: string): LicensePayload {
  const normalized = normalizeSerialInput(serial);
  const compact = compactSerial(normalized);

  let parts: { licenseId: string; signature: Uint8Array };
  try {
    parts = parseCompactSerial(compact);
  } catch (error) {
    throw new LicenseError(
      error instanceof Error
        ? error.message
        : `Serial inválido. Formato esperado: ${SERIAL_PREFIX}-XXXX-... (cole o código completo).`
    );
  }

  const ok = verifyEd25519(signedPayloadBytes(parts.licenseId), parts.signature, getPublicKey());
  if (!ok) {
    throw new LicenseError("Serial não reconhecido. Solicite um código ao titular.");
  }

  return { id: parts.licenseId };
}

export async function verifyLicenseSerial(serial: string): Promise<LicensePayload> {
  return parseLicenseSerial(serial);
}

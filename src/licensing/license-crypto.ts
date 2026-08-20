import { hexToBytes, hmacSha256Hex } from "../utils/sha256";
import { LICENSE_VERIFY_SECRET_HEX } from "./license-verify-secret";
import { LicenseError, LicensePayload } from "./license-types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let secretBytes: Uint8Array | null = null;

function getSecretBytes(): Uint8Array {
  if (!secretBytes) {
    secretBytes = hexToBytes(LICENSE_VERIFY_SECRET_HEX);
  }
  return secretBytes;
}

const UNICODE_HYPHENS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043\uFE58\uFE63\uFF0D]/g;
const SERIAL_EXTRACT = /EAC1-?[A-Z0-9]{4}-?[A-Z0-9]{4}-?[A-Z0-9]{4}-?[A-Z0-9]{4}/;

/** Aceita cola com espaços, hífens unicode ou o bloco inteiro do terminal. */
export function normalizeSerialInput(input: string): string {
  const cleaned = String(input || "")
    .replace(UNICODE_HYPHENS, "-")
    .replace(/[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g, "")
    .toUpperCase();

  const match = cleaned.match(SERIAL_EXTRACT);
  if (!match) {
    return cleaned;
  }

  const compact = match[0].replace(/-/g, "");
  return [
    compact.slice(0, 4),
    compact.slice(4, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
  ].join("-");
}

function computeChecksum(licenseId: string): string {
  return hmacSha256Hex(getSecretBytes(), licenseId).slice(0, 4).toUpperCase();
}

function isValidLicenseId(value: string): boolean {
  if (value.length !== 12) {
    return false;
  }
  for (const char of value) {
    if (!CODE_CHARS.includes(char)) {
      return false;
    }
  }
  return true;
}

export function parseLicenseSerial(serial: string): LicensePayload {
  const normalized = normalizeSerialInput(serial);
  const match = normalized.match(/^EAC1-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);

  if (!match) {
    throw new LicenseError(
      "Serial inválido. Formato esperado: EAC1-XXXX-XXXX-XXXX-XXXX"
    );
  }

  const licenseId = `${match[1]}${match[2]}${match[3]}`;
  const checksum = match[4];

  if (!isValidLicenseId(licenseId)) {
    throw new LicenseError("Serial inválido.");
  }

  const expected = computeChecksum(licenseId);
  if (checksum !== expected) {
    throw new LicenseError("Serial não reconhecido. Solicite um código ao titular.");
  }

  return { id: licenseId };
}

export async function verifyLicenseSerial(serial: string): Promise<LicensePayload> {
  return parseLicenseSerial(serial);
}

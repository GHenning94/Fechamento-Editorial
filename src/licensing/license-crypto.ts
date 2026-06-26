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

export function normalizeSerialInput(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
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

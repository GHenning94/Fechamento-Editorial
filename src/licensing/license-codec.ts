/** Alfabeto sem I, L, O, 0 e 1 (mais seguro para colar / reler). */
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SERIAL_PREFIX = "EAC2";
export const LICENSE_ID_LENGTH = 12;
export const SIGNATURE_BYTES = 64;
export const SIGNATURE_BASE32_LENGTH = 103;
export const COMPACT_SERIAL_LENGTH =
  SERIAL_PREFIX.length + LICENSE_ID_LENGTH + SIGNATURE_BASE32_LENGTH;

const UNICODE_HYPHENS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043\uFE58\uFE63\uFF0D]/g;
const WHITESPACE = /[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g;
const SERIAL_EXTRACT = new RegExp(
  `${SERIAL_PREFIX}[A-Z0-9]{${COMPACT_SERIAL_LENGTH - SERIAL_PREFIX.length}}`
);

export function signedPayloadBytes(licenseId: string): Uint8Array {
  const payload = `${SERIAL_PREFIX}:${licenseId}`;
  const bytes = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) {
    bytes[i] = payload.charCodeAt(i);
  }
  return bytes;
}

export function isCodeCharString(value: string): boolean {
  if (!value) {
    return false;
  }
  for (const char of value) {
    if (!CODE_CHARS.includes(char)) {
      return false;
    }
  }
  return true;
}

export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = "";

  for (let i = 0; i < bytes.length; i++) {
    acc = (acc << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += CODE_CHARS[(acc >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    out += CODE_CHARS[(acc << (5 - bits)) & 31];
  }

  return out;
}

export function decodeBase32(text: string): Uint8Array {
  let bits = 0;
  let acc = 0;
  const out: number[] = [];

  for (const char of text) {
    const idx = CODE_CHARS.indexOf(char);
    if (idx < 0) {
      throw new Error("Serial inválido.");
    }
    acc = (acc << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
}

export function compactSerial(input: string): string {
  const cleaned = String(input || "")
    .replace(UNICODE_HYPHENS, "-")
    .replace(WHITESPACE, "")
    .toUpperCase()
    .replace(/-/g, "");

  const match = cleaned.match(SERIAL_EXTRACT);
  return match ? match[0] : cleaned;
}

export function formatSerial(compact: string): string {
  if (!compact.startsWith(SERIAL_PREFIX) || compact.length !== COMPACT_SERIAL_LENGTH) {
    const groups = compact.match(/.{1,4}/g);
    return groups ? groups.join("-") : compact;
  }

  const licenseId = compact.slice(SERIAL_PREFIX.length, SERIAL_PREFIX.length + LICENSE_ID_LENGTH);
  const signatureText = compact.slice(SERIAL_PREFIX.length + LICENSE_ID_LENGTH);
  return `${SERIAL_PREFIX}-${licenseId.slice(0, 4)}-${licenseId.slice(4, 8)}-${licenseId.slice(8, 12)}-${signatureText}`;
}

export function parseCompactSerial(compact: string): { licenseId: string; signature: Uint8Array } {
  if (!compact.startsWith(SERIAL_PREFIX) || compact.length !== COMPACT_SERIAL_LENGTH) {
    throw new Error(`Serial inválido. Formato esperado: ${SERIAL_PREFIX}-XXXX-... (cole o código completo).`);
  }

  const licenseId = compact.slice(SERIAL_PREFIX.length, SERIAL_PREFIX.length + LICENSE_ID_LENGTH);
  const signatureText = compact.slice(SERIAL_PREFIX.length + LICENSE_ID_LENGTH);

  if (!isCodeCharString(licenseId) || licenseId.length !== LICENSE_ID_LENGTH) {
    throw new Error("Serial inválido.");
  }

  if (!isCodeCharString(signatureText) || signatureText.length !== SIGNATURE_BASE32_LENGTH) {
    throw new Error("Serial inválido.");
  }

  const signature = decodeBase32(signatureText);
  if (signature.length !== SIGNATURE_BYTES) {
    throw new Error("Serial inválido.");
  }

  return { licenseId, signature };
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function base64ToBytes(value: string): Uint8Array {
  const cleaned = String(value || "").replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  let bits = 0;
  let acc = 0;

  for (const char of cleaned) {
    const idx = BASE64_CHARS.indexOf(char);
    if (idx < 0) {
      continue;
    }
    acc = (acc << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      out.push((acc >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
}

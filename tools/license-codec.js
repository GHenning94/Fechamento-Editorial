#!/usr/bin/env node
"use strict";

/** Alfabeto sem I, L, O, 0 e 1 (mais seguro para colar / reler). */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PREFIX = "EAC2";
const LICENSE_ID_LENGTH = 12;
const SIGNATURE_BYTES = 64;
const SIGNATURE_BASE32_LENGTH = 103;
const COMPACT_LENGTH = PREFIX.length + LICENSE_ID_LENGTH + SIGNATURE_BASE32_LENGTH;
const UNICODE_HYPHENS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\u2043\uFE58\uFE63\uFF0D]/g;
const WHITESPACE = /[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g;
const EXTRACT = new RegExp(`${PREFIX}[A-Z0-9]{${COMPACT_LENGTH - PREFIX.length}}`);

function signedPayload(licenseId) {
  return Buffer.from(`${PREFIX}:${licenseId}`, "utf8");
}

function isCodeCharString(value) {
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

function encodeBase32(bytes) {
  let bits = 0;
  let acc = 0;
  let out = "";

  for (const byte of bytes) {
    acc = (acc << 8) | byte;
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

function decodeBase32(text) {
  let bits = 0;
  let acc = 0;
  const out = [];

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

  return Buffer.from(out);
}

function compactSerial(input) {
  const cleaned = String(input || "")
    .replace(UNICODE_HYPHENS, "-")
    .replace(WHITESPACE, "")
    .toUpperCase()
    .replace(/-/g, "");

  const match = cleaned.match(EXTRACT);
  return match ? match[0] : cleaned;
}

function formatSerial(compact) {
  const body = String(compact || "");
  if (!body.startsWith(PREFIX) || body.length !== COMPACT_LENGTH) {
    const groups = body.match(/.{1,4}/g);
    return groups ? groups.join("-") : body;
  }

  const licenseId = body.slice(PREFIX.length, PREFIX.length + LICENSE_ID_LENGTH);
  const signatureText = body.slice(PREFIX.length + LICENSE_ID_LENGTH);
  return `${PREFIX}-${licenseId.slice(0, 4)}-${licenseId.slice(4, 8)}-${licenseId.slice(8, 12)}-${signatureText}`;
}

function parseCompact(compact) {
  if (!compact.startsWith(PREFIX) || compact.length !== COMPACT_LENGTH) {
    throw new Error(`Serial inválido. Formato esperado: ${PREFIX}-XXXX-... (cole o código completo).`);
  }

  const licenseId = compact.slice(PREFIX.length, PREFIX.length + LICENSE_ID_LENGTH);
  const signatureText = compact.slice(PREFIX.length + LICENSE_ID_LENGTH);

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

function publicKeyFromAnyBase64(value) {
  const raw = Buffer.from(String(value || "").trim(), "base64");
  if (raw.length === 32) {
    return raw;
  }
  if (raw.length >= 44) {
    return raw.subarray(raw.length - 32);
  }
  throw new Error("Chave pública Ed25519 inválida.");
}

module.exports = {
  CODE_CHARS,
  PREFIX,
  LICENSE_ID_LENGTH,
  SIGNATURE_BYTES,
  SIGNATURE_BASE32_LENGTH,
  COMPACT_LENGTH,
  signedPayload,
  isCodeCharString,
  encodeBase32,
  decodeBase32,
  compactSerial,
  formatSerial,
  parseCompact,
  publicKeyFromAnyBase64,
};

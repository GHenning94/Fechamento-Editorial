"use strict";

const crypto = require("crypto");
const {
  compactSerial,
  formatSerial,
  parseCompact,
  publicKeyFromAnyBase64,
  signedPayload,
} = require("../license-codec");
const { LICENSE_PUBLIC_KEY_B64 } = require("../license-public");
const { loadUsed, saveUsed, persistentStoreConfigured } = require("./store");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function loadPublicKeyRaw() {
  const fromEnv = process.env.LICENSE_PUBLIC_KEY_B64?.trim();
  if (fromEnv) {
    return publicKeyFromAnyBase64(fromEnv);
  }
  return publicKeyFromAnyBase64(LICENSE_PUBLIC_KEY_B64);
}

function hasPublicKeyConfigured() {
  try {
    loadPublicKeyRaw();
    return true;
  } catch {
    return false;
  }
}

function publicKeyObject(raw32) {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw32]);
  return crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
}

function verifySerial(serial) {
  const compact = compactSerial(serial);
  const { licenseId, signature } = parseCompact(compact);
  const payload = signedPayload(licenseId);
  const publicKey = publicKeyObject(loadPublicKeyRaw());

  if (!crypto.verify(null, payload, publicKey, signature)) {
    throw httpError(400, "Assinatura inválida.");
  }

  return { licenseId, serial: formatSerial(compact) };
}

async function activateUnique(licenseId, serial, machineId, installId) {
  const machine = String(machineId || "").trim();
  const install = String(installId || "").trim().toLowerCase();
  if (machine.length < 16 || !/^[a-f0-9]{32}$/.test(install)) {
    throw httpError(400, "Identificador da instalação ausente.");
  }

  if (process.env.VERCEL && !persistentStoreConfigured()) {
    throw httpError(
      503,
      "Configure o Redis (Upstash) no Vercel. Sem isso o uso único não funciona."
    );
  }

  const used = await loadUsed();
  const existing = used[licenseId];

  if (existing?.machineId || existing?.installId) {
    const sameMachine = existing.machineId === machine;
    const sameInstall = String(existing.installId || "").toLowerCase() === install;
    if (!sameMachine || !sameInstall) {
      throw httpError(
        409,
        "Este serial já foi usado. Desinstalar ou reinstalar o plugin exige um serial novo."
      );
    }
  }

  const now = new Date().toISOString();
  used[licenseId] = {
    machineId: machine,
    installId: install,
    activatedAt: existing?.activatedAt || now,
    lastActivatedAt: now,
    serial,
    activations: (existing?.activations || 0) + 1,
  };
  await saveUsed(used);

  return { licenseId, reused: Boolean(existing?.installId) };
}

async function releaseLicense(serial) {
  const { licenseId } = verifySerial(serial);
  const used = await loadUsed();
  const existed = Boolean(used[licenseId]);
  delete used[licenseId];
  await saveUsed(used);
  return { licenseId, released: existed };
}

function adminSecretConfigured() {
  return Boolean(process.env.LICENSE_ADMIN_SECRET?.trim());
}

function isAdminRequest(headers, body) {
  const secret = process.env.LICENSE_ADMIN_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const provided = String(headers["x-admin-secret"] || body?.adminSecret || "");
  const left = crypto.createHash("sha256").update(secret).digest();
  const right = crypto.createHash("sha256").update(provided).digest();
  return crypto.timingSafeEqual(left, right) && provided === secret;
}

let storeQueue = Promise.resolve();

function withStore(fn) {
  const run = storeQueue.then(() => fn(), () => fn());
  storeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function activateFromBody(body) {
  const { licenseId, serial } = verifySerial(body.serial);
  return withStore(() => activateUnique(licenseId, serial, body.machineId, body.installId));
}

function healthPayload() {
  return {
    ok: true,
    service: "editorial-autoclose-activation",
    publicKeyConfigured: hasPublicKeyConfigured(),
    uniqueUse: !process.env.VERCEL || persistentStoreConfigured(),
    store: persistentStoreConfigured() ? "kv" : "file",
  };
}

module.exports = {
  corsHeaders,
  httpError,
  verifySerial,
  activateFromBody,
  releaseLicense,
  adminSecretConfigured,
  isAdminRequest,
  hasPublicKeyConfigured,
  persistentStoreConfigured,
  healthPayload,
  withStore,
};

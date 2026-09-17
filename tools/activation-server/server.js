#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { compactSerial, formatSerial, parseCompact, publicKeyFromAnyBase64, signedPayload } = require("../license-codec");

const PORT = Number(process.env.PORT || process.env.LICENSE_SERVER_PORT || 3921);
const HOST = "0.0.0.0";
const PUBLIC_B64_PATH = path.join(__dirname, "..", "license-public.b64");
const PUBLIC_TS_PATH = path.join(__dirname, "..", "..", "src", "licensing", "license-public-key.ts");
const DATA_DIR = fs.existsSync("/var/data") ? "/var/data" : __dirname;
const USED_PATH = process.env.USED_SERIALS_PATH || path.join(DATA_DIR, "used-serials.json");

function getPathname(url) {
  return String(url || "/").split("?")[0];
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
  };
}

function readEmbeddedPublicKeyB64() {
  if (!fs.existsSync(PUBLIC_TS_PATH)) {
    return "";
  }
  const embedded = fs.readFileSync(PUBLIC_TS_PATH, "utf8");
  const match = embedded.match(/LICENSE_PUBLIC_KEY_B64\s*=\s*"([^"]+)"/);
  return match ? match[1] : "";
}

function loadPublicKeyRaw() {
  const fromEnv = process.env.LICENSE_PUBLIC_KEY_B64?.trim();
  if (fromEnv) {
    return publicKeyFromAnyBase64(fromEnv);
  }

  if (fs.existsSync(PUBLIC_B64_PATH)) {
    return publicKeyFromAnyBase64(fs.readFileSync(PUBLIC_B64_PATH, "utf8"));
  }

  const fromTs = readEmbeddedPublicKeyB64();
  if (fromTs) {
    return publicKeyFromAnyBase64(fromTs);
  }

  throw new Error(
    "Chave pública ausente. Defina LICENSE_PUBLIC_KEY_B64 ou execute npm run license:keys."
  );
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

function loadUsed() {
  if (!fs.existsSync(USED_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(USED_PATH, "utf8"));
}

function saveUsed(data) {
  const folder = path.dirname(USED_PATH);
  fs.mkdirSync(folder, { recursive: true });
  const tmp = `${USED_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, USED_PATH);
}

function verifySerial(serial) {
  const compact = compactSerial(serial);
  const { licenseId, signature } = parseCompact(compact);
  const payload = signedPayload(licenseId);
  const publicKey = publicKeyObject(loadPublicKeyRaw());

  if (!crypto.verify(null, payload, publicKey, signature)) {
    throw Object.assign(new Error("Assinatura inválida."), { statusCode: 400 });
  }

  return { licenseId, serial: formatSerial(compact) };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function activateUnique(licenseId, serial, machineId, installId) {
  const machine = String(machineId || "").trim();
  const install = String(installId || "").trim().toLowerCase();
  if (machine.length < 16 || !/^[a-f0-9]{32}$/.test(install)) {
    throw httpError(400, "Identificador da instalação ausente.");
  }

  const used = loadUsed();
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
  saveUsed(used);

  return { licenseId, reused: Boolean(existing?.installId) };
}

function releaseLicense(serial) {
  const { licenseId } = verifySerial(serial);
  const used = loadUsed();
  const existed = Boolean(used[licenseId]);
  delete used[licenseId];
  saveUsed(used);
  return { licenseId, released: existed };
}

function adminSecretConfigured() {
  return Boolean(process.env.LICENSE_ADMIN_SECRET?.trim());
}

function isAdminRequest(req, body) {
  const secret = process.env.LICENSE_ADMIN_SECRET?.trim();
  if (!secret) {
    return false;
  }

  const provided = String(
    req.headers["x-admin-secret"] || body?.adminSecret || ""
  );
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Payload grande demais."));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const pathname = getPathname(req.url);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (req.method === "GET" && (pathname === "/health" || pathname === "/")) {
    sendJson(res, 200, {
      ok: true,
      service: "editorial-autoclose-activation",
      publicKeyConfigured: hasPublicKeyConfigured(),
      uniqueUse: true,
    });
    return;
  }

  try {
    if (req.method === "POST" && pathname === "/activate") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const { licenseId, serial } = verifySerial(body.serial);
      const result = await withStore(() =>
        activateUnique(licenseId, serial, body.machineId, body.installId)
      );
      sendJson(res, 200, { ok: true, licenseId, reused: result.reused });
      return;
    }

    if (req.method === "POST" && pathname === "/release") {
      if (!adminSecretConfigured()) {
        sendJson(res, 404, { error: "Rota não encontrada." });
        return;
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      if (!isAdminRequest(req, body)) {
        sendJson(res, 401, { error: "Não autorizado." });
        return;
      }

      const result = await withStore(() => releaseLicense(body.serial));
      sendJson(res, 200, { ok: true, ...result });
      return;
    }
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: error.message || "Falha na ativação." });
    return;
  }

  sendJson(res, 404, { error: "Rota não encontrada." });
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor de ativação em http://${HOST}:${PORT}`);
  console.log(`Chave pública configurada: ${hasPublicKeyConfigured() ? "sim" : "nao"}`);
  console.log(`Uso único por máquina: sim (${USED_PATH})`);
  console.log("GET  /health");
  console.log("POST /activate  { serial, machineId, installId }");
  console.log("POST /release   { serial }  (admin)");
});

server.on("error", (error) => {
  console.error("Falha ao iniciar servidor:", error);
  process.exit(1);
});

#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || process.env.LICENSE_SERVER_PORT || 3921);
const HOST = "0.0.0.0";
const SECRET_PATH = path.join(__dirname, "..", ".license-secret");
const USED_PATH = path.join(__dirname, "used-serials.json");
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function getPathname(url) {
  return String(url || "/").split("?")[0];
}

function loadSecret() {
  const fromEnv = process.env.LICENSE_SECRET_HEX?.trim();
  if (fromEnv) {
    return Buffer.from(fromEnv, "hex");
  }

  if (!fs.existsSync(SECRET_PATH)) {
    throw new Error(
      "Segredo ausente. Defina LICENSE_SECRET_HEX no Render ou execute npm run license:secret localmente."
    );
  }
  return Buffer.from(fs.readFileSync(SECRET_PATH, "utf8").trim(), "hex");
}

function hasSecretConfigured() {
  if (process.env.LICENSE_SECRET_HEX?.trim()) {
    return true;
  }
  return fs.existsSync(SECRET_PATH);
}

function loadUsed() {
  if (!fs.existsSync(USED_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(USED_PATH, "utf8"));
}

function saveUsed(data) {
  fs.writeFileSync(USED_PATH, JSON.stringify(data, null, 2));
}

function normalizeSerial(serial) {
  return String(serial || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function computeChecksum(secret, licenseId) {
  return crypto.createHmac("sha256", secret).update(licenseId, "utf8").digest("hex").slice(0, 4).toUpperCase();
}

function verifySerial(serial) {
  const normalized = normalizeSerial(serial);
  const match = normalized.match(/^EAC1-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})-([A-Z0-9]{4})$/);
  if (!match) {
    throw new Error("Serial inválido.");
  }

  const licenseId = `${match[1]}${match[2]}${match[3]}`;
  const checksum = match[4];

  for (const char of licenseId) {
    if (!CODE_CHARS.includes(char)) {
      throw new Error("Serial inválido.");
    }
  }

  const secret = loadSecret();
  const expected = computeChecksum(secret, licenseId);
  if (checksum !== expected) {
    throw new Error("Assinatura inválida.");
  }

  return { licenseId, serial: normalized };
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
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const pathname = getPathname(req.url);

  if (req.method === "GET" && (pathname === "/health" || pathname === "/")) {
    sendJson(res, 200, {
      ok: true,
      service: "editorial-autoclose-activation",
      secretConfigured: hasSecretConfigured(),
    });
    return;
  }

  if (req.method !== "POST" || pathname !== "/activate") {
    sendJson(res, 404, { error: "Rota não encontrada." });
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const { licenseId, serial } = verifySerial(body.serial);
    const machineId = body.machineId || "unknown";
    const used = loadUsed();
    const key = body.jti || licenseId;

    used[key] = {
      machineId,
      activatedAt: new Date().toISOString(),
      serial,
      activations: (used[key]?.activations || 0) + 1,
    };
    saveUsed(used);

    sendJson(res, 200, { ok: true, licenseId });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Falha na ativação." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor de ativação em http://${HOST}:${PORT}`);
  console.log(`Segredo configurado: ${hasSecretConfigured() ? "sim" : "nao"}`);
  console.log("GET  /health");
  console.log("POST /activate  { serial, machineId }");
});

server.on("error", (error) => {
  console.error("Falha ao iniciar servidor:", error);
  process.exit(1);
});

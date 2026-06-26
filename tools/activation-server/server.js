#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.LICENSE_SERVER_PORT || process.env.PORT || 3921);
const HOST = process.env.LICENSE_SERVER_HOST || "127.0.0.1";
const SECRET_PATH = path.join(__dirname, "..", ".license-secret");
const USED_PATH = path.join(__dirname, "used-serials.json");
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function loadSecret() {
  if (!fs.existsSync(SECRET_PATH)) {
    throw new Error("Segredo ausente. Execute npm run license:secret");
  }
  return Buffer.from(fs.readFileSync(SECRET_PATH, "utf8").trim(), "hex");
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

const server = http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/activate") {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Rota não encontrada." }));
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw || "{}");
    const { licenseId, serial } = verifySerial(body.serial);
    const machineId = body.machineId || "unknown";
    const used = loadUsed();

    const key = body.jti || licenseId;
    if (used[key]) {
      res.writeHead(409);
      res.end(JSON.stringify({ error: "Serial já utilizado." }));
      return;
    }

    used[key] = {
      machineId,
      activatedAt: new Date().toISOString(),
      serial,
    };
    saveUsed(used);

    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, licenseId }));
  } catch (error) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: error.message || "Falha na ativação." }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Servidor de ativação em http://${HOST}:${PORT}`);
  console.log("POST /activate  { serial, machineId }");
  console.log("GET  /health");
});

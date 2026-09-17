#!/usr/bin/env node
"use strict";

const http = require("http");
const {
  corsHeaders,
  activateFromBody,
  releaseLicense,
  adminSecretConfigured,
  isAdminRequest,
  healthPayload,
  withStore,
} = require("./logic");

const PORT = Number(process.env.PORT || process.env.LICENSE_SERVER_PORT || 3921);
const HOST = "0.0.0.0";

function getPathname(url) {
  return String(url || "/").split("?")[0];
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
    sendJson(res, 200, healthPayload());
    return;
  }

  try {
    if (req.method === "POST" && pathname === "/activate") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const result = await activateFromBody(body);
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && pathname === "/release") {
      if (!adminSecretConfigured()) {
        sendJson(res, 404, { error: "Rota não encontrada." });
        return;
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      if (!isAdminRequest(req.headers, body)) {
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
  const health = healthPayload();
  console.log(`Servidor local de teste em http://${HOST}:${PORT}`);
  console.log(`Chave pública: ${health.publicKeyConfigured ? "sim" : "nao"} | store: ${health.store}`);
});

server.on("error", (error) => {
  console.error("Falha ao iniciar servidor:", error);
  process.exit(1);
});

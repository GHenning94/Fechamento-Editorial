"use strict";

const {
  corsHeaders,
  releaseLicense,
  adminSecretConfigured,
  isAdminRequest,
  withStore,
} = require("../tools/activation-server/logic");

function applyCors(res) {
  const headers = corsHeaders();
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

module.exports = async (req, res) => {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  if (!adminSecretConfigured()) {
    res.status(404).json({ error: "Rota não encontrada." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (!isAdminRequest(req.headers, body)) {
      res.status(401).json({ error: "Não autorizado." });
      return;
    }
    const result = await withStore(() => releaseLicense(body.serial));
    res.status(200).json({ ok: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Falha na ativação." });
  }
};

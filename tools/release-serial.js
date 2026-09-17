#!/usr/bin/env node
"use strict";

const serial = process.argv.slice(2).join(" ").trim();
const baseUrl = (process.env.LICENSE_ACTIVATION_URL || "https://fechamento-editorial.vercel.app").replace(/\/$/, "");
const secret = process.env.LICENSE_ADMIN_SECRET?.trim();

if (!serial) {
  console.error("Uso: npm run license:release -- \"EAC2-...\"");
  process.exit(1);
}

if (!secret) {
  console.error("Defina LICENSE_ADMIN_SECRET no ambiente (o mesmo do Vercel).");
  process.exit(1);
}

async function main() {
  const response = await fetch(`${baseUrl}/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Secret": secret,
    },
    body: JSON.stringify({ serial }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(body.error || `Falha HTTP ${response.status}`);
    process.exit(1);
  }
  console.log(body.released ? "Serial liberado. Pode ativar em outro computador." : "Serial não estava em uso.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TOOLS_DIR = __dirname;
const SECRET_PATH = path.join(TOOLS_DIR, ".license-secret");
const LEDGER_PATH = path.join(TOOLS_DIR, "issued-serials.json");
const PREFIX = "EAC1";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function loadSecret() {
  if (!fs.existsSync(SECRET_PATH)) {
    console.error("Segredo não encontrado. Execute primeiro:");
    console.error("  npm run license:secret");
    process.exit(1);
  }

  const secretHex = fs.readFileSync(SECRET_PATH, "utf8").trim();
  const secretTsPath = path.join(TOOLS_DIR, "..", "src", "licensing", "license-verify-secret.ts");
  if (fs.existsSync(secretTsPath)) {
    const embedded = fs.readFileSync(secretTsPath, "utf8");
    if (!embedded.includes(secretHex)) {
      console.error("O segredo em tools/.license-secret não é o mesmo embutido no plugin.");
      console.error("Execute: npm run license:secret && npm run build");
      process.exit(1);
    }
  }

  return Buffer.from(secretHex, "hex");
}

function randomLicenseId(length = 12) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return out;
}

function computeChecksum(secret, licenseId) {
  return crypto.createHmac("sha256", secret).update(licenseId, "utf8").digest("hex").slice(0, 4).toUpperCase();
}

function formatSerial(licenseId, checksum) {
  return `${PREFIX}-${licenseId.slice(0, 4)}-${licenseId.slice(4, 8)}-${licenseId.slice(8, 12)}-${checksum}`;
}

function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
}

function saveLedger(entries) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(entries, null, 2));
}

function generateSerial(note) {
  const secret = loadSecret();
  const licenseId = randomLicenseId(12);
  const checksum = computeChecksum(secret, licenseId);
  const serial = formatSerial(licenseId, checksum);

  const ledger = loadLedger();
  ledger.push({
    serial,
    licenseId,
    issuedAt: new Date().toISOString(),
    note: note || "",
    status: "pending",
  });
  saveLedger(ledger);

  return { serial, licenseId };
}

const note = process.argv.slice(2).join(" ") || "";
const { serial, licenseId } = generateSerial(note);

try {
  require("child_process").execSync("pbcopy", { input: serial });
} catch {
  // área de transferência indisponível
}

console.log("");
console.log("Serial gerado:");
console.log("");
console.log(serial);
console.log("");
console.log(`ID interno: ${licenseId}`);
if (note) {
  console.log(`Observação: ${note}`);
}
console.log("");
console.log(`Registrado em: ${LEDGER_PATH}`);
console.log("Este serial vale em qualquer máquina e também após reinstalação.");
console.log("Depois de ativar, o plugin não pede o código de novo neste computador.");
console.log("O serial foi copiado. No InDesign, abra o painel e clique em Ativar (ou Colar).");

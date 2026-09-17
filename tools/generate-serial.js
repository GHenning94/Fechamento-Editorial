#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  CODE_CHARS,
  LICENSE_ID_LENGTH,
  encodeBase32,
  formatSerial,
  parseCompact,
  signedPayload,
  publicKeyFromAnyBase64,
} = require("./license-codec");

const TOOLS_DIR = __dirname;
const PRIVATE_PATH = path.join(TOOLS_DIR, ".license-private.pem");
const PUBLIC_TS_PATH = path.join(TOOLS_DIR, "..", "src", "licensing", "license-public-key.ts");
const LEDGER_PATH = path.join(TOOLS_DIR, "issued-serials.json");

function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_PATH)) {
    console.error("Chave privada não encontrada. Execute primeiro:");
    console.error("  npm run license:keys");
    process.exit(1);
  }
  return crypto.createPrivateKey(fs.readFileSync(PRIVATE_PATH, "utf8"));
}

function loadEmbeddedPublicKey() {
  if (!fs.existsSync(PUBLIC_TS_PATH)) {
    console.error("Chave pública do plugin ausente. Execute:");
    console.error("  npm run license:keys && npm run build");
    process.exit(1);
  }

  const embedded = fs.readFileSync(PUBLIC_TS_PATH, "utf8");
  const match = embedded.match(/LICENSE_PUBLIC_KEY_B64\s*=\s*"([^"]+)"/);
  if (!match) {
    console.error("Não foi possível ler LICENSE_PUBLIC_KEY_B64.");
    process.exit(1);
  }
  return publicKeyFromAnyBase64(match[1]);
}

function assertKeyPair(privateKey, embeddedPublic) {
  const derived = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const raw = Buffer.from(derived.subarray(derived.length - 32));
  if (!raw.equals(embeddedPublic)) {
    console.error("A chave privada em tools/.license-private.pem não corresponde à pública do plugin.");
    console.error("Execute: npm run license:keys && npm run build");
    process.exit(1);
  }
}

function randomLicenseId(length = LICENSE_ID_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return out;
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
  const privateKey = loadPrivateKey();
  const embeddedPublic = loadEmbeddedPublicKey();
  assertKeyPair(privateKey, embeddedPublic);

  const licenseId = randomLicenseId();
  const payload = signedPayload(licenseId);
  const signature = crypto.sign(null, payload, privateKey);
  const compact = `EAC2${licenseId}${encodeBase32(signature)}`;
  parseCompact(compact);

  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), embeddedPublic]);
  const publicKey = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  if (!crypto.verify(null, payload, publicKey, signature)) {
    console.error("Falha ao verificar o serial recém-assinado.");
    process.exit(1);
  }

  const serial = formatSerial(compact);
  const ledger = loadLedger();
  ledger.push({
    serial,
    licenseId,
    issuedAt: new Date().toISOString(),
    note: note || "",
    status: "pending",
    algorithm: "ed25519",
  });
  saveLedger(ledger);

  return { serial, licenseId, compact };
}

const note = process.argv.slice(2).join(" ") || "";
const { serial, licenseId } = generateSerial(note);

try {
  require("child_process").execSync("pbcopy", { input: serial });
} catch {
  // área de transferência indisponível
}

console.log("");
console.log("Serial gerado (cole o código inteiro no InDesign):");
console.log("");
console.log(serial);
console.log("");
console.log(`ID interno: ${licenseId}`);
if (note) {
  console.log(`Observação: ${note}`);
}
console.log("");
console.log(`Registrado em: ${LEDGER_PATH}`);
console.log("No dia a dia você só gera o serial. Não precisa ligar servidor.");
console.log("Uso único: vale uma vez, neste computador e nesta instalação.");
console.log("Desinstalar ou reinstalar o plugin exige um serial novo.");
console.log("O serial foi copiado. No InDesign, abra o painel e clique em Ativar.");

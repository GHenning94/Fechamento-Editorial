#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TOOLS_DIR = __dirname;
const PRIVATE_PATH = path.join(TOOLS_DIR, ".license-private.pem");
const PUBLIC_B64_PATH = path.join(TOOLS_DIR, "license-public.b64");
const PUBLIC_TS_PATH = path.join(TOOLS_DIR, "..", "src", "licensing", "license-public-key.ts");
const FORCE = process.argv.includes("--force");

function rawPublicFromKey(keyObject) {
  const spki = crypto.createPublicKey(keyObject).export({ type: "spki", format: "der" });
  return Buffer.from(spki.subarray(spki.length - 32));
}

function writePublicFiles(privateKey) {
  const publicKey = crypto.createPublicKey(privateKey);
  const spkiDer = publicKey.export({ type: "spki", format: "der" });
  const rawPublic = Buffer.from(spkiDer.subarray(spkiDer.length - 32));

  fs.writeFileSync(PUBLIC_B64_PATH, spkiDer.toString("base64") + "\n");

  const ts = `/**
 * Chave pública Ed25519 (32 bytes raw, Base64).
 * Pode ficar no GitHub público. A privada está em tools/.license-private.pem (gitignored).
 * Gerado com: npm run license:keys
 */
export const LICENSE_PUBLIC_KEY_B64 =
  "${rawPublic.toString("base64")}";
`;
  fs.writeFileSync(PUBLIC_TS_PATH, ts);

  return rawPublic;
}

function loadOrCreatePrivateKey() {
  if (fs.existsSync(PRIVATE_PATH) && !FORCE) {
    const pem = fs.readFileSync(PRIVATE_PATH, "utf8");
    return { privateKey: crypto.createPrivateKey(pem), created: false };
  }

  if (fs.existsSync(PRIVATE_PATH) && FORCE) {
    console.warn("Gerando um NOVO par de chaves (--force).");
    console.warn("Seriais já emitidos deixam de funcionar. Redistribua o plugin e gere códigos novos.");
  }

  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(PRIVATE_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
  return { privateKey, created: true };
}

function selfCheck(privateKey, rawPublic) {
  const message = Buffer.from("EAC2:SELFCHECKOK1", "utf8");
  const signature = crypto.sign(null, message, privateKey);
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawPublic]);
  const publicKey = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  if (!crypto.verify(null, message, publicKey, signature)) {
    throw new Error("Falha no teste de assinatura Ed25519.");
  }
}

function main() {
  const { privateKey, created } = loadOrCreatePrivateKey();
  const rawPublic = writePublicFiles(privateKey);
  selfCheck(privateKey, rawPublic);

  console.log(created ? "Par de chaves Ed25519 gerado." : "Chave pública sincronizada a partir da privada existente.");
  console.log(`  Privada (NÃO compartilhe, faça backup): ${PRIVATE_PATH}`);
  console.log(`  Pública (SPKI, pode ir ao GitHub): ${PUBLIC_B64_PATH}`);
  console.log(`  Embutida no plugin: ${PUBLIC_TS_PATH}`);
  console.log("Execute npm run build após gerar ou sincronizar as chaves.");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { main, rawPublicFromKey };

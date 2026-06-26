#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TOOLS_DIR = __dirname;
const SECRET_PATH = path.join(TOOLS_DIR, ".license-secret");
const SECRET_TS_PATH = path.join(TOOLS_DIR, "..", "src", "licensing", "license-verify-secret.ts");

function main() {
  const secretHex = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(SECRET_PATH, secretHex + "\n", { mode: 0o600 });

  const ts = `/** Segredo HMAC (hex). Gerado com: npm run license:secret */
export const LICENSE_VERIFY_SECRET_HEX =
  "${secretHex}";
`;

  fs.writeFileSync(SECRET_TS_PATH, ts);

  console.log("Segredo de licença gerado.");
  console.log(`  Arquivo local (NÃO compartilhe): ${SECRET_PATH}`);
  console.log(`  Embutido no plugin: ${SECRET_TS_PATH}`);
  console.log("Execute npm run build após gerar o segredo.");
}

main();

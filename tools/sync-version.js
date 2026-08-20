#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VERSION_PATH = path.join(ROOT, "VERSION");

function readVersion() {
  if (!fs.existsSync(VERSION_PATH)) {
    throw new Error("Arquivo VERSION não encontrado.");
  }

  const version = fs.readFileSync(VERSION_PATH, "utf8").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`VERSION inválida: "${version}". Use o formato 1.0.1`);
  }

  return version;
}

function writeJson(filePath, updater) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  updater(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function main() {
  const version = readVersion();

  writeJson(path.join(ROOT, "package.json"), (pkg) => {
    pkg.version = version;
  });

  writeJson(path.join(ROOT, "manifest.json"), (manifest) => {
    manifest.version = version;
  });

  fs.writeFileSync(
    path.join(ROOT, "src", "update", "plugin-version.ts"),
    `/** Versão instalada neste build. Gerada a partir do arquivo VERSION. */\nexport const PLUGIN_VERSION = "${version}";\n`
  );

  fs.writeFileSync(
    path.join(ROOT, "update.json"),
    JSON.stringify(
      {
        version,
        downloadUrl: "https://github.com/GHenning94/Fechamento-Editorial",
        notes: "",
      },
      null,
      2
    ) + "\n"
  );

  console.log("Versão sincronizada:", version);
}

main();

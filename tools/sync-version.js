#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VERSION_PATH = path.join(ROOT, "VERSION");
const CHANGELOG_PATH = path.join(ROOT, "changelog.json");
const UPDATE_JSON_PATH = path.join(ROOT, "update.json");

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readJsonOptional(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function notesFor(version) {
  const changelog = readJsonOptional(CHANGELOG_PATH, {});
  const entry = changelog[version] || {};
  const previous = readJsonOptional(UPDATE_JSON_PATH, {});
  return {
    title: String(entry.title || previous.title || "").trim(),
    notes: String(entry.notes || previous.notes || "").trim(),
  };
}

function writeTsConstant(filePath, contents) {
  fs.writeFileSync(filePath, contents);
}

function main() {
  const version = readVersion();
  const { title, notes } = notesFor(version);

  const pkg = readJson(path.join(ROOT, "package.json"));
  pkg.version = version;
  writeJson(path.join(ROOT, "package.json"), pkg);

  const manifest = readJson(path.join(ROOT, "manifest.json"));
  manifest.version = version;
  writeJson(path.join(ROOT, "manifest.json"), manifest);

  writeTsConstant(
    path.join(ROOT, "src", "update", "plugin-version.ts"),
    `/** Versão instalada neste build. Gerada a partir do arquivo VERSION. */\nexport const PLUGIN_VERSION = "${version}";\n`
  );

  writeTsConstant(
    path.join(ROOT, "src", "update", "plugin-notes.ts"),
    `/** Notas da versão instalada neste build. Gerada a partir de changelog.json. */\nexport const PLUGIN_RELEASE_TITLE = ${JSON.stringify(
      title || `Versão ${version}`
    )};\nexport const PLUGIN_RELEASE_NOTES = ${JSON.stringify(notes)};\n`
  );

  writeJson(UPDATE_JSON_PATH, {
    version,
    downloadUrl: "https://github.com/GHenning94/Fechamento-Editorial",
    title,
    notes,
  });

  console.log("Versão sincronizada:", version);
}

main();

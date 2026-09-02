#!/usr/bin/env node
"use strict";

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CHANGELOG_PATH = path.join(ROOT, "changelog.json");
const VERSION_PATH = path.join(ROOT, "VERSION");
const UPDATE_JSON_PATH = path.join(ROOT, "update.json");
const REPO = "GHenning94/Fechamento-Editorial";

function readVersion() {
  return fs.readFileSync(VERSION_PATH, "utf8").trim();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseCommitMessage(raw) {
  const lines = String(raw || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n");
  const title = (lines.shift() || "").trim();
  const notes = lines.join("\n").replace(/^\n+/, "").trim();
  return { title, notes };
}

function commitMessage() {
  try {
    return execSync("git log -1 --pretty=%B", { encoding: "utf8" });
  } catch {
    return "";
  }
}

async function fetchRemoteChangelog() {
  const url = `https://raw.githubusercontent.com/${REPO}/plugin-dist/changelog.json`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return {};
    const body = await response.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

function writeGithubEnv(version, title, notes) {
  const envFile = process.env.GITHUB_ENV;
  if (!envFile) return;

  const block = (key, value) => `${key}<<EOF\n${value}\nEOF\n`;
  fs.appendFileSync(
    envFile,
    `PLUGIN_VERSION=${version}\n${block("PLUGIN_TITLE", title)}${block("PLUGIN_NOTES", notes)}`
  );
}

async function main() {
  const version = readVersion();
  const local = readJson(CHANGELOG_PATH, {});
  const remote = await fetchRemoteChangelog();
  const { title: commitTitle, notes: commitNotes } = parseCommitMessage(commitMessage());
  const title = commitTitle || `Versão ${version}`;
  const notes = commitNotes;

  const changelog = {
    ...remote,
    ...local,
    [version]: {
      title,
      notes,
    },
  };

  fs.writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + "\n");

  const previousUpdate = readJson(UPDATE_JSON_PATH, {});
  fs.writeFileSync(
    UPDATE_JSON_PATH,
    JSON.stringify(
      {
        version,
        downloadUrl: previousUpdate.downloadUrl || `https://github.com/${REPO}`,
        title,
        notes,
      },
      null,
      2
    ) + "\n"
  );

  writeGithubEnv(version, title, notes);
  console.log("Changelog atualizado:", version, title);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

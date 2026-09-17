"use strict";

const fs = require("fs");
const path = require("path");

const FILE_PATH =
  process.env.USED_SERIALS_PATH ||
  path.join(__dirname, "used-serials.json");
const KV_KEY = "eac-used-serials";

function kvUrl() {
  return (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
}

function kvToken() {
  return process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
}

function persistentStoreConfigured() {
  return Boolean(kvUrl() && kvToken());
}

async function kvGet() {
  const response = await fetch(`${kvUrl()}/get/${encodeURIComponent(KV_KEY)}`, {
    headers: { Authorization: `Bearer ${kvToken()}` },
  });
  if (!response.ok) {
    throw new Error("Não foi possível ler a lista de seriais usados.");
  }
  const payload = await response.json();
  if (payload.result == null || payload.result === "") {
    return {};
  }
  if (typeof payload.result === "object") {
    return payload.result;
  }
  try {
    return JSON.parse(payload.result);
  } catch {
    return {};
  }
}

async function kvSet(data) {
  const response = await fetch(`${kvUrl()}/set/${encodeURIComponent(KV_KEY)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${kvToken()}` },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Não foi possível gravar a lista de seriais usados.");
  }
}

function fileGet() {
  if (!fs.existsSync(FILE_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
}

function fileSet(data) {
  const folder = path.dirname(FILE_PATH);
  fs.mkdirSync(folder, { recursive: true });
  const tmp = `${FILE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE_PATH);
}

async function loadUsed() {
  if (persistentStoreConfigured()) {
    return kvGet();
  }
  return fileGet();
}

async function saveUsed(data) {
  if (persistentStoreConfigured()) {
    await kvSet(data);
    return;
  }
  fileSet(data);
}

module.exports = {
  persistentStoreConfigured,
  loadUsed,
  saveUsed,
};

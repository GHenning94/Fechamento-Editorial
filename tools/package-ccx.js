#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const OUT_DIR = path.join(ROOT, "release");
const CCX_NAME = "EditorialAutoClose.ccx";

function requireDist() {
  const manifest = path.join(DIST, "manifest.json");
  if (!fs.existsSync(manifest)) {
    throw new Error("A pasta dist/ não existe. Rode npm run build antes de gerar o .ccx.");
  }
}

function zipWithPython(src, dest) {
  const script = `
import zipfile
from pathlib import Path
src = Path(${JSON.stringify(src)})
dest = Path(${JSON.stringify(dest)})
with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as archive:
    for item in src.rglob("*"):
        if not item.is_file():
            continue
        if item.suffix == ".map":
            continue
        archive.write(item, item.relative_to(src).as_posix())
print(dest)
`;
  execFileSync("python3", ["-c", script], { stdio: "inherit" });
}

function main() {
  requireDist();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const dest = path.join(OUT_DIR, CCX_NAME);
  if (fs.existsSync(dest)) {
    fs.unlinkSync(dest);
  }
  zipWithPython(DIST, dest);
  console.log("CCX gerado:", dest);
}

main();

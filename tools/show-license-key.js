#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const pem = path.join(__dirname, ".license-private.pem");

if (!fs.existsSync(pem)) {
  console.error("A chave privada ainda não existe. No Terminal, rode:");
  console.error("  npm run license:keys");
  process.exit(1);
}

console.log("");
console.log("A chave existe, mas o Finder esconde arquivos que começam com ponto.");
console.log("Caminho completo:");
console.log(pem);
console.log("");

try {
  execFileSync("open", ["-R", pem]);
  console.log("O Finder abriu com o arquivo selecionado.");
  console.log("Se ainda não aparecer a lista, pressione Command + Shift + ponto (.)");
  console.log("Copie esse arquivo para um pendrive ou pasta com senha. Não envie no GitHub.");
} catch {
  console.log("Abra o Finder, vá até a pasta tools e pressione Command + Shift + ponto (.)");
  console.log("O arquivo .license-private.pem deve aparecer.");
}
console.log("");

import { sha256Hex } from "../utils/sha256";

type NodeOs = {
  arch?: () => string;
  cpus?: () => Array<{ model?: string }>;
  homedir?: () => string;
  hostname?: () => string;
  platform?: () => string;
  userInfo?: () => { username?: string };
};

function readText(fn: () => string): string {
  try {
    return String(fn() || "").trim();
  } catch {
    return "";
  }
}

function loadOs(): NodeOs | null {
  try {
    return require("os") as NodeOs;
  } catch {
    return null;
  }
}

/** Identificador estável desta máquina + usuário (hash). Não envia nome nem caminho ao servidor. */
export function getMachineId(): string {
  const os = loadOs();
  const platform = readText(() => os?.platform?.() || "");
  const arch = readText(() => os?.arch?.() || "");
  const hostname = readText(() => os?.hostname?.() || "");
  const homedir = readText(() => os?.homedir?.() || "");
  const username = readText(() => os?.userInfo?.()?.username || "");
  const cpu = readText(() => os?.cpus?.()?.[0]?.model || "");
  return sha256Hex(`eac-machine|${platform}|${arch}|${hostname}|${username}|${homedir}|${cpu}`);
}

import { PLUGIN_VERSION } from "./plugin-version";
import { GITHUB_SOURCE_BRANCH, githubRawUrl } from "./update-config";

export interface PluginUpdateInfo {
  version: string;
}

const DISMISS_KEY = "editorial-autoclose-dismissed-update";

function parseVersion(value: string): number[] {
  return String(value || "")
    .replace(/^v/i, "")
    .split(".")
    .map((part) => parseInt(part.replace(/\D/g, ""), 10) || 0);
}

export function isRemoteVersionNewer(remote: string, local: string = PLUGIN_VERSION): boolean {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  const length = Math.max(a.length, b.length, 3);

  for (let i = 0; i < length; i++) {
    const left = a[i] || 0;
    const right = b[i] || 0;
    if (left > right) return true;
    if (left < right) return false;
  }

  return false;
}

function readDismissedVersion(): string {
  try {
    return String(
      (globalThis as { localStorage?: { getItem(key: string): string | null } }).localStorage?.getItem(
        DISMISS_KEY
      ) || ""
    );
  } catch {
    return "";
  }
}

export function dismissUpdateVersion(version: string): void {
  try {
    (globalThis as { localStorage?: { setItem(key: string, value: string): void } }).localStorage?.setItem(
      DISMISS_KEY,
      version
    );
  } catch {
    // ignora
  }
}

async function fetchText(url: string): Promise<string | null> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  return (await response.text()).trim();
}

export async function checkForPluginUpdate(): Promise<PluginUpdateInfo | null> {
  try {
    const remoteVersion =
      (await fetchText(githubRawUrl(GITHUB_SOURCE_BRANCH, "VERSION"))) ||
      (await fetchJsonVersion(githubRawUrl(GITHUB_SOURCE_BRANCH, "update.json")));

    if (!remoteVersion || !isRemoteVersionNewer(remoteVersion)) {
      return null;
    }

    if (readDismissedVersion() === remoteVersion) {
      return null;
    }

    return { version: remoteVersion };
  } catch {
    return null;
  }
}

async function fetchJsonVersion(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { version?: string };
    return String(body.version || "").replace(/^v/i, "") || null;
  } catch {
    return null;
  }
}

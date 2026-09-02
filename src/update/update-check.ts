import { PLUGIN_RELEASE_NOTES, PLUGIN_RELEASE_TITLE } from "./plugin-notes";
import { PLUGIN_VERSION } from "./plugin-version";
import {
  GITHUB_DIST_BRANCH,
  GITHUB_SOURCE_BRANCH,
  UPDATE_DEV_FORCE_BANNER,
  githubApiUrl,
  githubRawUrl,
} from "./update-config";

export interface PluginUpdateInfo {
  version: string;
}

export interface VersionNotes {
  title: string;
  notes: string;
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

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "editorial-autoclose",
        "Cache-Control": "no-cache",
      },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function cleanVersion(value: string): string {
  return String(value || "").replace(/^v\.?/i, "").trim();
}

function notesFromUnknown(value: unknown, fallbackVersion: string): VersionNotes | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { title?: string; name?: string; notes?: string; body?: string };
  const title = String(record.title || record.name || "").trim();
  const notes = String(record.notes || record.body || "").trim();
  if (!title && !notes) {
    return null;
  }
  return {
    title: title || `Versão ${fallbackVersion}`,
    notes,
  };
}

function notesFromCommitMessage(message: string, fallbackVersion: string): VersionNotes | null {
  const lines = String(message || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n");
  const title = (lines.shift() || "").trim();
  const notes = lines.join("\n").replace(/^\n+/, "").trim();
  if (!title) return null;
  return { title: title || `Versão ${fallbackVersion}`, notes };
}

async function fetchGithubRaw(branch: string, filePath: string): Promise<string | null> {
  try {
    const response = await fetch(githubApiUrl(`/contents/${filePath}?ref=${encodeURIComponent(branch)}`), {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github.raw",
        "User-Agent": "editorial-autoclose",
        "Cache-Control": "no-cache",
      },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.text()).trim();
  } catch {
    return null;
  }
}

export async function getVersionNotes(version: string = PLUGIN_VERSION): Promise<VersionNotes> {
  const key = cleanVersion(version);
  const bundled: VersionNotes = {
    title: PLUGIN_RELEASE_TITLE || `Versão ${key}`,
    notes: PLUGIN_RELEASE_NOTES || "",
  };

  const commit = await fetchJson<{ commit?: { message?: string } }>(
    githubApiUrl(`/commits/${GITHUB_SOURCE_BRANCH}`)
  );
  const fromCommit = notesFromCommitMessage(commit?.commit?.message || "", key);
  if (fromCommit) {
    return fromCommit;
  }

  const latest = await fetchJson<{ name?: string; body?: string; tag_name?: string }>(
    githubApiUrl("/releases/latest")
  );
  const fromLatest = notesFromUnknown(latest, key);
  if (fromLatest) {
    return fromLatest;
  }

  const release = await fetchJson<{ name?: string; body?: string }>(githubApiUrl(`/releases/tags/v${key}`));
  const fromRelease = notesFromUnknown(release, key);
  if (fromRelease) {
    return fromRelease;
  }

  const distRaw = await fetchGithubRaw(GITHUB_DIST_BRANCH, "changelog.json");
  if (distRaw) {
    try {
      const changelog = JSON.parse(distRaw) as Record<string, unknown>;
      const fromDist = notesFromUnknown(changelog[key] || changelog[version], key);
      if (fromDist) {
        return fromDist;
      }
    } catch {
      // ignore
    }
  }

  if (bundled.title || bundled.notes) {
    return bundled;
  }

  return {
    title: `Versão ${key}`,
    notes: "As notas desta versão ainda não foram publicadas.",
  };
}

export async function checkForPluginUpdate(): Promise<PluginUpdateInfo | null> {
  try {
    const remoteVersion =
      (await fetchGithubRaw(GITHUB_SOURCE_BRANCH, "VERSION")) ||
      (await fetchText(githubRawUrl(GITHUB_SOURCE_BRANCH, "VERSION"))) ||
      (await fetchJsonVersion(githubRawUrl(GITHUB_SOURCE_BRANCH, "update.json")));

    if (UPDATE_DEV_FORCE_BANNER) {
      return { version: remoteVersion || "99.0.0" };
    }

    if (!remoteVersion || !isRemoteVersionNewer(remoteVersion)) {
      return null;
    }

    if (readDismissedVersion() === remoteVersion) {
      return null;
    }

    return { version: remoteVersion };
  } catch {
    if (UPDATE_DEV_FORCE_BANNER) {
      return { version: "99.0.0" };
    }
    return null;
  }
}

async function fetchJsonVersion(url: string): Promise<string | null> {
  const body = await fetchJson<{ version?: string }>(url);
  return cleanVersion(body?.version || "") || null;
}

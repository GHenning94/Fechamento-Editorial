export const GITHUB_REPO = "GHenning94/Fechamento-Editorial";
export const GITHUB_SOURCE_BRANCH = "main";
export const GITHUB_DIST_BRANCH = "plugin-dist";
export const PLUGIN_ID = "com.editorial.autoclose";
export const CCX_FILE_NAME = "EditorialAutoClose.ccx";

/**
 * Força o ícone verde de atualização mesmo com a versão já atualizada.
 * Deixe false antes de distribuir a .ccx.
 */
export const UPDATE_DEV_FORCE_BANNER = true;

export const PLUGIN_UPDATE_FILES: Array<{ path: string; binary: boolean; optional?: boolean }> = [
  { path: "index.js", binary: false },
  { path: "index.html", binary: false },
  { path: "styles.css", binary: false },
  { path: "manifest.json", binary: false, optional: true },
  { path: "VERSION", binary: false, optional: true },
  { path: "changelog.json", binary: false, optional: true },
  { path: "icons/icon.png", binary: true, optional: true },
  { path: "icons/work-spinner.gif", binary: true, optional: true },
];

export function githubRawUrl(branch: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${GITHUB_REPO}/${branch}/${filePath}`;
}

export function githubReleaseCcxUrl(version: string): string {
  const clean = String(version || "").replace(/^v/i, "");
  return `https://github.com/${GITHUB_REPO}/releases/download/v${clean}/${CCX_FILE_NAME}`;
}

export function githubLatestCcxUrl(): string {
  return `https://github.com/${GITHUB_REPO}/releases/latest/download/${CCX_FILE_NAME}`;
}

export function githubApiUrl(pathname: string): string {
  return `https://api.github.com/repos/${GITHUB_REPO}${pathname}`;
}

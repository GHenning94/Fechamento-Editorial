export const GITHUB_REPO = "GHenning94/Fechamento-Editorial";
export const GITHUB_SOURCE_BRANCH = "main";
export const GITHUB_DIST_BRANCH = "plugin-dist";

/**
 * Força o aviso verde mesmo com a versão já atualizada.
 * Deixe false antes de distribuir a .ccx.
 */
export const UPDATE_DEV_FORCE_BANNER = true;

export const PLUGIN_UPDATE_FILES: Array<{ path: string; binary: boolean; optional?: boolean }> = [
  { path: "index.js", binary: false },
  { path: "index.html", binary: false },
  { path: "styles.css", binary: false },
  { path: "manifest.json", binary: false },
  { path: "VERSION", binary: false, optional: true },
  { path: "icons/icon.png", binary: true, optional: true },
];

export function githubRawUrl(branch: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${GITHUB_REPO}/${branch}/${filePath}`;
}

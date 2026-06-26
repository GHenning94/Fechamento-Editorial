/** Converte caminho POSIX para o formato aceito pelo exportFile do InDesign. */
export function toPdfExportTarget(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^file:\/\//, "");
  if (normalized.startsWith("/")) {
    return normalized;
  }
  return `/${normalized}`;
}

import { ALLOWED_GRAPHIC_EXTENSIONS } from "./constants";

const ALLOWED_EXTENSIONS = new Set<string>(ALLOWED_GRAPHIC_EXTENSIONS);

const ALLOWED_TYPE_KEYS = new Set([
  "tiff",
  "tif",
  "jpeg",
  "jpg",
  "photoshop",
  "photoshopdocument",
  "eps",
  "epsf",
  "encapsulatedpostscript",
]);

function typeKey(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function fileExtensionOf(name: string, filePath = ""): string {
  const source = (name || filePath).trim();
  if (!source) return "";
  const base = source.split(/[/\\]/).pop() || source;
  const match = base.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

export function isStoryOrInCopyLink(name: string, linkType: string): boolean {
  if (/\.(icml|incx|incd)$/i.test(name || "")) return true;
  const key = typeKey(linkType);
  return key.includes("incopy");
}

export function isAllowedGraphicExtension(extension: string): boolean {
  return ALLOWED_EXTENSIONS.has((extension || "").toLowerCase());
}

export function isAllowedGraphicLinkType(linkType: string): boolean {
  const key = typeKey(linkType);
  if (!key) return false;
  if (ALLOWED_TYPE_KEYS.has(key)) return true;
  if (key.includes("photoshop")) return true;
  if (key.includes("tiff") || key.includes("jpeg")) return true;
  if (key === "eps" || key.includes("encapsulatedpostscript")) return true;
  return false;
}

export const ALLOWED_GRAPHIC_FORMAT_LABEL = "TIFF, JPG, JPEG, PSD ou EPS";

/** Mensagem de erro se o formato não for TIFF, JPG, JPEG, PSD ou EPS. */
export function graphicFormatError(name: string, filePath = "", linkType = ""): string | null {
  if (isStoryOrInCopyLink(name, linkType)) return null;

  const extension = fileExtensionOf(name, filePath);
  if (extension) {
    if (isAllowedGraphicExtension(extension)) return null;
    return `Formato .${extension} não permitido`;
  }

  if (linkType && isAllowedGraphicLinkType(linkType)) return null;
  if (linkType) return `Formato ${linkType} não permitido`;
  return null;
}

export const GRAPHIC_FORMAT_FIX =
  `Correção: converta o arquivo para ${ALLOWED_GRAPHIC_FORMAT_LABEL} e faça Relink.`;

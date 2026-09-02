import { getImageColorSpaceLabel } from "./color-model";
import { toFileUrl } from "./file-system";
import { yieldForUi } from "./yield-to-host";

const uxp = require("uxp") as {
  storage: {
    localFileSystem: {
      getEntryWithUrl(url: string): Promise<{
        read?(options?: { format?: string }): Promise<string | ArrayBuffer | Uint8Array>;
      }>;
    };
    formats: { utf8: string; binary?: string };
  };
};

const cacheByLinkId = new Map<number, string>();
const cacheByName = new Map<string, string>();
const HEAD_BYTES = 524288;

export function clearFileColorSpaceCache(): void {
  cacheByLinkId.clear();
  cacheByName.clear();
}

export function rememberFileColorSpace(linkId: number | null, fileName: string, space: string): void {
  if (space === "Desconhecido") return;
  if (linkId != null) cacheByLinkId.set(linkId, space);
  const key = (fileName || "").toLowerCase();
  if (key) cacheByName.set(key, space);
}

export function lookupFileColorSpace(linkId: number | null, fileName: string): string | null {
  if (linkId != null && cacheByLinkId.has(linkId)) {
    return cacheByLinkId.get(linkId) || null;
  }
  const key = (fileName || "").toLowerCase();
  if (key && cacheByName.has(key)) {
    return cacheByName.get(key) || null;
  }
  return null;
}

function nativePathFrom(filePath: string): string {
  const raw = (filePath || "").trim();
  if (!raw || raw.startsWith("http://") || raw.startsWith("https://")) return "";
  if (raw.startsWith("file:")) {
    try {
      const withoutScheme = raw.replace(/^file:\/\//, "");
      const decoded = decodeURIComponent(withoutScheme);
      return decoded.startsWith("/") ? decoded : `/${decoded}`;
    } catch {
      return raw.replace(/^file:\/\//, "");
    }
  }
  return raw;
}

function asBytes(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

function readFileSliceSync(filePath: string, offset: number, maxBytes: number): Uint8Array | null {
  const path = nativePathFrom(filePath);
  if (!path) return null;
  try {
    const fs = require("fs") as {
      openSync?: (p: string, flags: string) => number;
      readSync?: (
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number
      ) => number;
      closeSync?: (fd: number) => void;
      readFileSync?: (p: string) => { length: number; [i: number]: number };
    };
    if (typeof fs.openSync === "function" && typeof fs.readSync === "function") {
      const fd = fs.openSync(path, "r");
      try {
        const out = new Uint8Array(maxBytes);
        const n = fs.readSync(fd, out, 0, maxBytes, offset);
        return n > 0 ? out.subarray(0, n) : null;
      } finally {
        fs.closeSync?.(fd);
      }
    }
    if (typeof fs.readFileSync === "function") {
      const buf = fs.readFileSync(path);
      const start = Math.min(Math.max(0, offset), buf.length);
      const length = Math.min(buf.length - start, maxBytes);
      if (length <= 0) return null;
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) out[i] = buf[start + i];
      return out;
    }
  } catch {
    return null;
  }
  return null;
}

function readEpsPayloadSync(filePath: string): Uint8Array | null {
  const header = readFileSliceSync(filePath, 0, 32);
  if (!header) return null;
  if (header.length >= 32 && header[0] === 0xc5 && header[1] === 0xd0 && header[2] === 0xd3 && header[3] === 0xc6) {
    const psStart = header[4] | (header[5] << 8) | (header[6] << 16) | (header[7] << 24);
    const psLen = header[8] | (header[9] << 8) | (header[10] << 16) | (header[11] << 24);
    const length = Math.min(psLen > 0 ? psLen : HEAD_BYTES, HEAD_BYTES);
    return readFileSliceSync(filePath, Math.max(0, psStart), length);
  }
  return readFileSliceSync(filePath, 0, HEAD_BYTES);
}

async function readFileHeadAsync(filePath: string, maxBytes: number): Promise<Uint8Array | null> {
  const fromFs = readFileSliceSync(filePath, 0, maxBytes);
  if (fromFs) return fromFs;
  try {
    const entry = await uxp.storage.localFileSystem.getEntryWithUrl(toFileUrl(nativePathFrom(filePath) || filePath));
    const format = uxp.storage.formats.binary || uxp.storage.formats.utf8;
    const raw = await entry.read?.({ format });
    const bytes = asBytes(raw);
    if (bytes) return bytes.subarray(0, Math.min(bytes.length, maxBytes));
    if (typeof raw === "string") {
      const length = Math.min(raw.length, maxBytes);
      const out = new Uint8Array(length);
      for (let i = 0; i < length; i++) out[i] = raw.charCodeAt(i) & 0xff;
      return out;
    }
  } catch {
    // ignore
  }
  return null;
}

function latin1(bytes: Uint8Array): string {
  let out = "";
  const length = Math.min(bytes.length, 400000);
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function detectJpeg(bytes: Uint8Array): string | null {
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  let adobeTransform: number | null = null;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const size = (bytes[i + 2] << 8) | bytes[i + 3];
    if (size < 2) break;
    if (marker === 0xee && size >= 14) {
      adobeTransform = bytes[i + 2 + 11];
    }
    if (marker >= 0xc0 && marker <= 0xc3 && i + 9 < bytes.length) {
      const components = bytes[i + 9];
      if (adobeTransform === 2 || adobeTransform === 0) return "CMYK";
      if (components === 4) return "CMYK";
      if (components === 1) return "Gray";
      if (components === 3) return "RGB";
      return null;
    }
    i += 2 + size;
  }
  return null;
}

function detectPng(bytes: Uint8Array): string | null {
  if (bytes.length < 26) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const colorType = bytes[25];
  if (colorType === 0 || colorType === 4) return "Gray";
  return "RGB";
}

function detectPsd(bytes: Uint8Array): string | null {
  if (bytes.length < 26) return null;
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "8BPS") return null;
  const mode = (bytes[24] << 8) | bytes[25];
  if (mode === 4) return "CMYK";
  if (mode === 1 || mode === 0 || mode === 8) return "Gray";
  if (mode === 9) return "LAB";
  if (mode === 3 || mode === 2) return "RGB";
  return null;
}

function detectTiff(bytes: Uint8Array): string | null {
  if (bytes.length < 16) return null;
  const le = bytes[0] === 0x49 && bytes[1] === 0x49;
  const be = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!le && !be) return null;
  const u16 = (offset: number): number =>
    le ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];
  const u32 = (offset: number): number =>
    le
      ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
      : (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  const ifd = u32(4);
  if (ifd + 2 > bytes.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > bytes.length) break;
    const tag = u16(entry);
    if (tag !== 262) continue;
    const type = u16(entry + 2);
    const valueOffset = entry + 8;
    const photometric = type === 3 || type === 4 ? u32(valueOffset) : u16(valueOffset);
    if (photometric === 5) return "CMYK";
    if (photometric === 0 || photometric === 1) return "Gray";
    if (photometric === 2 || photometric === 6) return "RGB";
    if (photometric === 8) return "LAB";
    return null;
  }
  return null;
}

function detectPdf(bytes: Uint8Array): string | null {
  const text = latin1(bytes).toLowerCase();
  if (!text.includes("%pdf")) return null;
  const cmyk = (text.match(/\/devicecmyk/g) || []).length;
  const rgb = (text.match(/\/devicergb/g) || []).length;
  const gray = (text.match(/\/devicegray/g) || []).length;
  if (cmyk > rgb && cmyk >= gray) return "CMYK";
  if (rgb > cmyk && rgb >= gray) return "RGB";
  if (gray > 0 && rgb === 0 && cmyk === 0) return "Gray";
  if (cmyk > 0) return "CMYK";
  if (rgb > 0) return "RGB";
  return null;
}

function detectEps(bytes: Uint8Array): string | null {
  let start = 0;
  if (bytes.length >= 32 && bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6) {
    start = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    if (start < 0 || start >= bytes.length) start = 0;
  }
  const slice = start > 0 ? bytes.subarray(start) : bytes;
  const pdf = detectPdf(slice);
  if (pdf) return pdf;

  const raw = latin1(slice).slice(0, 400000);
  const text = raw.toLowerCase();
  const looksLikePs =
    text.includes("%!") ||
    text.includes("ps-adobe") ||
    text.includes("boundingbox") ||
    text.includes("epsf");
  if (!looksLikePs) {
    return detectPsd(bytes) || detectPsd(slice);
  }

  const imageData = text.match(/%imagedata:\s+\d+\s+\d+\s+\d+\s+(\d+)/);
  if (imageData) {
    const channels = Number(imageData[1]);
    if (channels === 4) return "CMYK";
    if (channels === 3) return "RGB";
    if (channels === 1) return "Gray";
  }

  const process = text.match(/%%documentprocesscolors:\s*([^\r\n]*)/);
  if (process) {
    const colors = process[1];
    if (colors.includes("cyan") || colors.includes("magenta") || colors.includes("yellow") || colors.includes("black")) {
      return "CMYK";
    }
    if (colors.includes("red") || colors.includes("green") || colors.includes("blue")) return "RGB";
  }

  if (
    text.includes("%%cmykcustomcolor") ||
    text.includes("%%aicmykcolor") ||
    text.includes("color(cmyk)") ||
    text.includes("/devicecmyk") ||
    text.includes("cmykcustomcolor") ||
    text.includes("setcmykcolor")
  ) {
    return "CMYK";
  }
  if (text.includes("%%rgbcustomcolor") || text.includes("/devicergb") || text.includes("setrgbcolor")) {
    return "RGB";
  }
  if (text.includes("/devicegray") || text.includes("setgray")) return "Gray";

  const psdAt = raw.indexOf("8BPS");
  if (psdAt >= 0) {
    const psd = detectPsd(slice.subarray(psdAt));
    if (psd) return psd;
  }

  return detectPsd(bytes);
}

export function detectColorSpaceFromBytes(fileName: string, bytes: Uint8Array): string | null {
  const ext = (fileName || "").toLowerCase();
  if (ext.endsWith(".eps") || ext.endsWith(".ai") || bytes[0] === 0x25 || (bytes[0] === 0xc5 && bytes[1] === 0xd0)) {
    const eps = detectEps(bytes);
    if (eps) return eps;
  }
  if (ext.endsWith(".psd") || ext.endsWith(".psb")) {
    const psd = detectPsd(bytes);
    if (psd) return psd;
  }
  if (ext.endsWith(".png")) {
    const png = detectPng(bytes);
    if (png) return png;
  }
  if (ext.endsWith(".jpg") || ext.endsWith(".jpeg") || ext.endsWith(".jpe")) {
    const jpeg = detectJpeg(bytes);
    if (jpeg) return jpeg;
  }
  if (ext.endsWith(".tif") || ext.endsWith(".tiff")) {
    const tiff = detectTiff(bytes);
    if (tiff) return tiff;
  }
  if (ext.endsWith(".pdf") || ext.endsWith(".ai")) {
    const pdf = detectPdf(bytes);
    if (pdf) return pdf;
  }

  return detectPsd(bytes) || detectPng(bytes) || detectJpeg(bytes) || detectTiff(bytes) || detectEps(bytes);
}

export function detectColorSpaceFromPathSync(filePath: string, fileName: string): string | null {
  const ext = (fileName || filePath || "").toLowerCase();
  const bytes =
    ext.endsWith(".eps") || ext.endsWith(".ai")
      ? readEpsPayloadSync(filePath)
      : readFileSliceSync(filePath, 0, HEAD_BYTES);
  if (!bytes) return null;
  return detectColorSpaceFromBytes(fileName || filePath, bytes);
}

export async function detectColorSpaceFromPath(filePath: string, fileName: string): Promise<string | null> {
  const ext = (fileName || filePath || "").toLowerCase();
  if (ext.endsWith(".eps") || ext.endsWith(".ai")) {
    const fromEps = readEpsPayloadSync(filePath);
    if (fromEps) return detectColorSpaceFromBytes(fileName || filePath, fromEps);
  }
  const bytes = await readFileHeadAsync(filePath, HEAD_BYTES);
  if (!bytes) return detectColorSpaceFromPathSync(filePath, fileName);
  return detectColorSpaceFromBytes(fileName || filePath, bytes);
}

export async function prefetchColorSpacesFromLinks(
  links: Array<{ id: number; name: string; filePath: string }>,
  signal?: AbortSignal
): Promise<void> {
  for (let i = 0; i < links.length; i++) {
    if (signal?.aborted) return;
    const link = links[i];
    if (!link.filePath) continue;
    try {
      const space = await detectColorSpaceFromPath(link.filePath, link.name);
      if (space) rememberFileColorSpace(link.id, link.name, space);
    } catch {
      // ignore arquivo inacessível
    }
    if (i % 2 === 1) await yieldForUi();
  }
}

export function resolveGraphicColorSpace(options: {
  space: unknown;
  fileName: string;
  filePath?: string;
  linkId?: number | null;
}): string {
  const fileName = options.fileName || "";
  const preferFile = /\.(eps|ai|psd|psb)$/i.test(fileName);

  const fromFileCacheOrDisk = (): string | null => {
    const cached = lookupFileColorSpace(options.linkId ?? null, fileName);
    if (cached) return cached;
    if (options.filePath) {
      const fromFile = detectColorSpaceFromPathSync(options.filePath, fileName);
      if (fromFile) {
        rememberFileColorSpace(options.linkId ?? null, fileName, fromFile);
        return fromFile;
      }
    }
    return null;
  };

  if (preferFile) {
    const fromFile = fromFileCacheOrDisk();
    if (fromFile) return fromFile;
  }

  const fromHost = getImageColorSpaceLabel(options.space);
  if (fromHost && fromHost !== "Desconhecido") return fromHost;

  if (!preferFile) {
    const fromFile = fromFileCacheOrDisk();
    if (fromFile) return fromFile;
  }

  return "Desconhecido";
}

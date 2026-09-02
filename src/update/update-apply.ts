import { PLUGIN_VERSION } from "./plugin-version";
import { isRemoteVersionNewer } from "./update-check";
import { toFileUrl } from "../utils/file-system";
import {
  CCX_FILE_NAME,
  GITHUB_DIST_BRANCH,
  PLUGIN_ID,
  PLUGIN_UPDATE_FILES,
  githubLatestCcxUrl,
  githubRawUrl,
  githubReleaseCcxUrl,
} from "./update-config";

const uxp = require("uxp") as {
  shell?: {
    openPath?(target: string): Promise<void> | void;
    openExternal(target: string | { url: string }): Promise<void> | void;
  };
  storage: {
    localFileSystem: {
      getPluginFolder?(): Promise<PluginFolder>;
      getDataFolder?(): Promise<PluginFolder>;
      getEntryWithUrl(url: string): Promise<PluginFolder>;
    };
    formats: { utf8: string; binary?: string };
  };
};

interface PluginFolder {
  nativePath?: string;
  url?: string;
  getEntry(name: string): Promise<PluginFile>;
  createFolder(name: string): Promise<PluginFolder>;
  createFile?(name: string, options?: { overwrite?: boolean }): Promise<PluginFile>;
}

interface PluginFile {
  nativePath?: string;
  write(content: string | ArrayBuffer, options?: { format?: string }): Promise<void>;
}

type DownloadedFile = {
  path: string;
  binary: boolean;
  optional?: boolean;
  content: string | ArrayBuffer;
};

type NodeFs = {
  existsSync?(p: string): boolean;
  mkdirSync?(p: string, options: { recursive: boolean }): void;
  writeFileSync?(p: string, data: string | Uint8Array, encoding?: string): void;
  readdirSync?(p: string): string[];
  statSync?(p: string): { isDirectory(): boolean; isFile(): boolean };
};

type NodeOs = {
  homedir?: () => string;
};

export type UpdateApplyResult = "files" | "installer" | "current";

function nodeFs(): NodeFs | null {
  try {
    return require("fs") as NodeFs;
  } catch {
    return null;
  }
}

function nodeOs(): NodeOs | null {
  try {
    return require("os") as NodeOs;
  } catch {
    return null;
  }
}

function joinPath(root: string, relativePath: string): string {
  const windows = /\\/.test(root) || /^[A-Za-z]:/.test(root);
  const sep = windows ? "\\" : "/";
  const cleaned = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return [root.replace(/[\\/]+$/, ""), ...cleaned].join(sep);
}

function asBytes(content: string | ArrayBuffer): Uint8Array {
  if (typeof content === "string") {
    const encoded = new TextEncoder().encode(content);
    return encoded;
  }
  return new Uint8Array(content);
}

function tryNodeWrite(root: string, relativePath: string, content: string | ArrayBuffer, binary: boolean): boolean {
  const fs = nodeFs();
  if (!fs?.writeFileSync || !root) {
    return false;
  }

  try {
    const full = joinPath(root, relativePath);
    const folder = full.replace(/[\\/][^\\/]+$/, "");
    fs.mkdirSync?.(folder, { recursive: true });
    if (binary) {
      try {
        fs.writeFileSync(full, asBytes(content));
      } catch {
        const BufferImpl = (globalThis as { Buffer?: { from: (data: Uint8Array) => Uint8Array } }).Buffer;
        if (!BufferImpl) {
          return false;
        }
        fs.writeFileSync(full, BufferImpl.from(asBytes(content)));
      }
    } else {
      fs.writeFileSync(full, String(content), "utf8");
    }
    return true;
  } catch {
    return false;
  }
}

function listNodeDirs(root: string): string[] {
  const fs = nodeFs();
  if (!fs?.readdirSync || !fs.existsSync?.(root)) {
    return [];
  }
  try {
    return fs.readdirSync(root).map((name) => joinPath(root, name));
  } catch {
    return [];
  }
}

function resolveInstallDir(root: string): string {
  const fs = nodeFs();
  if (!fs?.existsSync) {
    return root;
  }
  if (fs.existsSync(joinPath(root, "index.js"))) {
    return root;
  }
  for (const child of listNodeDirs(root)) {
    try {
      if (fs.statSync?.(child)?.isDirectory() && fs.existsSync(joinPath(child, "index.js"))) {
        return child;
      }
    } catch {
      // ignore
    }
  }
  return root;
}

function homePluginDirs(): string[] {
  const home = nodeOs()?.homedir?.();
  if (!home) {
    return [];
  }

  return [
    joinPath(home, `Library/Application Support/Adobe/UXP/Plugins/External/${PLUGIN_ID}`),
    joinPath(home, `Library/Application Support/Adobe/UXP/PluginsInstalled/${PLUGIN_ID}`),
    joinPath(home, `AppData/Roaming/Adobe/UXP/Plugins/External/${PLUGIN_ID}`),
    joinPath(home, `AppData/Roaming/Adobe/UXP/PluginsInstalled/${PLUGIN_ID}`),
  ];
}

async function getPluginFolderHint(): Promise<PluginFolder | null> {
  const fs = uxp.storage.localFileSystem;
  if (typeof fs.getPluginFolder !== "function") {
    return null;
  }

  try {
    const pluginFolder = await fs.getPluginFolder();
    const nativePath = pluginFolder.nativePath;
    if (!nativePath) {
      return pluginFolder;
    }
    try {
      return await fs.getEntryWithUrl(toFileUrl(nativePath));
    } catch {
      return pluginFolder;
    }
  } catch {
    return null;
  }
}

function collectWriteRoots(hintPath?: string): string[] {
  const roots = new Set<string>();
  if (hintPath) {
    roots.add(resolveInstallDir(hintPath));
  }
  for (const dir of homePluginDirs()) {
    roots.add(resolveInstallDir(dir));
  }
  return Array.from(roots).filter(Boolean);
}

async function ensureChildFolder(parent: PluginFolder, name: string): Promise<PluginFolder> {
  try {
    const existing = await parent.getEntry(name);
    return existing as unknown as PluginFolder;
  } catch {
    return parent.createFolder(name);
  }
}

async function writeUxpFile(
  folder: PluginFolder,
  fileName: string,
  content: string | ArrayBuffer,
  binary: boolean
): Promise<void> {
  let file: PluginFile;
  try {
    file = await folder.getEntry(fileName);
  } catch {
    if (typeof folder.createFile !== "function") {
      throw new Error("A pasta do plugin não permite gravar arquivos.");
    }
    file = await folder.createFile(fileName, { overwrite: true });
  }

  const format = binary
    ? uxp.storage.formats.binary || uxp.storage.formats.utf8
    : uxp.storage.formats.utf8;

  await file.write(content, { format });
}

async function writeRelativeUxp(
  root: PluginFolder,
  relativePath: string,
  content: string | ArrayBuffer,
  binary: boolean
): Promise<void> {
  const parts = relativePath.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) {
    throw new Error("Caminho de arquivo inválido.");
  }

  let folder = root;
  for (const part of parts) {
    folder = await ensureChildFolder(folder, part);
  }

  await writeUxpFile(folder, fileName, content, binary);
}

async function downloadUpdateFile(filePath: string, binary: boolean): Promise<string | ArrayBuffer> {
  const response = await fetch(githubRawUrl(GITHUB_DIST_BRANCH, filePath), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Falha ao baixar ${filePath}.`);
  }
  if (binary) {
    return response.arrayBuffer();
  }
  return response.text();
}

async function downloadAllFiles(): Promise<DownloadedFile[]> {
  const downloaded: DownloadedFile[] = [];
  const errors: string[] = [];

  for (const file of PLUGIN_UPDATE_FILES) {
    try {
      const content = await downloadUpdateFile(file.path, file.binary);
      downloaded.push({ ...file, content });
    } catch (error) {
      if (file.optional) {
        continue;
      }
      errors.push(error instanceof Error ? error.message : file.path);
    }
  }

  if (errors.length) {
    throw new Error("Não foi possível baixar os arquivos da atualização. Confira a conexão e o GitHub Actions.");
  }

  return downloaded;
}

async function writeAllUxp(folder: PluginFolder, files: DownloadedFile[]): Promise<boolean> {
  try {
    for (const file of files) {
      try {
        await writeRelativeUxp(folder, file.path, file.content, file.binary);
      } catch (error) {
        if (!file.optional) {
          throw error;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function writeAllNode(root: string, files: DownloadedFile[]): boolean {
  for (const file of files) {
    const written = tryNodeWrite(root, file.path, file.content, file.binary);
    if (!written && !file.optional) {
      return false;
    }
  }
  return true;
}

async function writeDownloadedFiles(files: DownloadedFile[]): Promise<boolean> {
  const folder = await getPluginFolderHint();
  if (folder && (await writeAllUxp(folder, files))) {
    return true;
  }

  for (const root of collectWriteRoots(folder?.nativePath)) {
    if (writeAllNode(root, files)) {
      return true;
    }
  }

  return false;
}

async function downloadCcxBuffer(version: string): Promise<ArrayBuffer> {
  const urls = [githubReleaseCcxUrl(version), githubLatestCcxUrl()];
  let lastError = "Falha ao baixar o instalador .ccx.";

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = `Falha ao baixar ${CCX_FILE_NAME}.`;
        continue;
      }
      return await response.arrayBuffer();
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }

  throw new Error(lastError);
}

async function saveCcxFile(buffer: ArrayBuffer): Promise<string> {
  const fs = uxp.storage.localFileSystem;
  if (typeof fs.getDataFolder !== "function") {
    throw new Error("Não foi possível salvar o instalador da atualização.");
  }

  const folder = await fs.getDataFolder();
  let file: PluginFile;
  try {
    file = await folder.getEntry(CCX_FILE_NAME);
  } catch {
    if (typeof folder.createFile !== "function") {
      throw new Error("Não foi possível salvar o instalador da atualização.");
    }
    file = await folder.createFile(CCX_FILE_NAME, { overwrite: true });
  }

  await file.write(buffer, { format: uxp.storage.formats.binary || uxp.storage.formats.utf8 });
  if (!file.nativePath) {
    throw new Error("Instalador salvo, mas o caminho do arquivo não está disponível.");
  }
  return file.nativePath;
}

async function openInstaller(nativePath: string): Promise<void> {
  const shell = uxp.shell;
  if (typeof shell?.openPath === "function") {
    try {
      await shell.openPath(nativePath);
      return;
    } catch {
      // tenta o próximo método
    }
  }
  if (typeof shell?.openExternal === "function") {
    const fileUrl = toFileUrl(nativePath);
    try {
      await shell.openExternal(fileUrl);
      return;
    } catch {
      // tenta o formato com objeto
    }
    try {
      await shell.openExternal({ url: fileUrl });
      return;
    } catch {
      // cai no erro com o caminho
    }
  }
  throw new Error(`Instalador salvo em ${nativePath}. Abra o arquivo para concluir.`);
}

export async function applyPluginUpdate(version: string): Promise<UpdateApplyResult> {
  if (!isRemoteVersionNewer(version, PLUGIN_VERSION)) {
    return "current";
  }

  const files = await downloadAllFiles();
  const wroteFiles = await writeDownloadedFiles(files);
  if (wroteFiles) {
    return "files";
  }

  const ccx = await downloadCcxBuffer(version);
  const savedPath = await saveCcxFile(ccx);
  await openInstaller(savedPath);
  return "installer";
}

export function reloadPluginPanel(): void {
  try {
    window.location.reload();
  } catch {
    // o usuário reabre o painel
  }
}

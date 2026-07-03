// eslint-disable-next-line @typescript-eslint/no-var-requires
const uxp = require("uxp") as {
  storage: {
    localFileSystem: {
      getEntryWithUrl(url: string): Promise<FileSystemEntry>;
      getFolder(): Promise<FileSystemFolder | null>;
      getFileForSaving?(name: string): Promise<FileSystemEntry | null>;
    };
    formats: { utf8: string };
  };
};

import { runInDesignMutation, runInDesignReadOnly, getActiveDocument } from "./indesign-runtime";

interface FileSystemEntry {
  name: string;
  nativePath: string;
  url: string;
  getEntry(name: string): Promise<FileSystemEntry>;
  createFolder(name: string): Promise<FileSystemFolder>;
  createFile?(name: string, options?: { overwrite?: boolean }): Promise<FileSystemEntry>;
  write(content: string, options?: { format?: string }): Promise<void>;
  copyTo(destFolder: FileSystemFolder, options?: { overwrite?: boolean }): Promise<FileSystemEntry>;
  rename(newName: string): Promise<void>;
}

interface FileSystemFolder extends FileSystemEntry {
  createFolder(name: string): Promise<FileSystemFolder>;
  getEntry(name: string): Promise<FileSystemEntry>;
}

const fs = uxp.storage.localFileSystem;
const formats = uxp.storage.formats;

export class PackageCancelledError extends Error {
  constructor(message = "Operação cancelada pelo usuário.") {
    super(message);
    this.name = "PackageCancelledError";
  }
}

export function toFileUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("file://")) {
    return normalized;
  }
  if (normalized.startsWith("file:")) {
    return normalized.startsWith("file:///") ? normalized : `file://${normalized.slice(5)}`;
  }
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

export function entryNativePath(entry: FileSystemEntry): string {
  if (entry.nativePath) {
    return entry.nativePath.replace(/\\/g, "/");
  }
  const url = entry.url || "";
  return url.replace(/^file:\/\//, "/").replace(/^file:/, "").replace(/\\/g, "/");
}

export async function getDocumentFolderPath(docPath: string): Promise<string> {
  const normalized = docPath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    return normalized;
  }
  return normalized.substring(0, lastSlash);
}

export async function ensureFolder(parentPath: string, folderName: string): Promise<string> {
  const parent = (await fs.getEntryWithUrl(toFileUrl(parentPath))) as FileSystemFolder;
  let folder: FileSystemEntry;

  try {
    folder = await parent.getEntry(folderName);
  } catch {
    folder = await parent.createFolder(folderName);
  }

  return entryNativePath(folder);
}

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash === -1) {
    throw new Error(`Caminho de arquivo inválido: ${filePath}`);
  }

  const dirPath = normalized.substring(0, lastSlash);
  const fileName = normalized.substring(lastSlash + 1);
  const folder = (await fs.getEntryWithUrl(toFileUrl(dirPath))) as FileSystemFolder;

  let file: FileSystemEntry;
  try {
    file = await folder.getEntry(fileName);
  } catch {
    if (typeof folder.createFile === "function") {
      file = await folder.createFile(fileName, { overwrite: true });
    } else {
      throw new Error(`Não foi possível criar o arquivo: ${fileName}`);
    }
  }

  await file.write(content, { format: formats.utf8 });
}

export async function copyFileToFolder(sourcePath: string, destFolderPath: string, fileName: string): Promise<string> {
  const source = await fs.getEntryWithUrl(toFileUrl(sourcePath));
  const destFolder = (await fs.getEntryWithUrl(toFileUrl(destFolderPath))) as FileSystemFolder;
  const copied = await source.copyTo(destFolder, { overwrite: true });
  const targetName = fileName || source.name;
  if (copied.name !== targetName) {
    await copied.rename(targetName);
  }
  return joinPath(destFolderPath, targetName);
}

export function joinPath(base: string, ...parts: string[]): string {
  let result = base.replace(/\\/g, "/").replace(/\/$/, "");
  for (const part of parts) {
    result += "/" + part.replace(/^\/+/, "");
  }
  return result;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_");
}

export async function promptChecklistReportFile(documentName: string): Promise<string | null> {
  const baseName = sanitizeFileName(documentName.replace(/\.indd$/i, "") || "documento");
  const suggestedName = `Relatorio_Checklist_${baseName}.html`;

  const file = await fs.getFileForSaving?.(suggestedName);
  if (!file) {
    return null;
  }

  return entryNativePath(file);
}

export async function promptPackageFolder(): Promise<string> {
  const folder = await fs.getFolder();
  if (!folder) {
    throw new PackageCancelledError();
  }
  return entryNativePath(folder);
}

export async function ensureDocumentSaved(): Promise<void> {
  const isSaved = runInDesignReadOnly("EDITORIAL AUTOCLOSE — Verificar salvamento", () => {
    return getActiveDocument().saved;
  });

  if (isSaved) {
    return;
  }

  const suggestedName = runInDesignReadOnly("EDITORIAL AUTOCLOSE — Nome do documento", () => {
    const doc = getActiveDocument();
    return doc.name && doc.name.toLowerCase().endsWith(".indd")
      ? doc.name
      : `${doc.name || "documento"}.indd`;
  });

  const file = await fs.getFileForSaving?.(suggestedName);
  if (!file) {
    throw new PackageCancelledError("Salve o documento para continuar o fechamento.");
  }

  const targetPath = entryNativePath(file);
  runInDesignMutation("EDITORIAL AUTOCLOSE — Salvar documento", () => {
    getActiveDocument().save(targetPath);
    return true;
  });
}

export async function resolveDocumentBasePath(doc: import("indesign").Document): Promise<string> {
  try {
    const fullName = await doc.fullName;
    if (fullName) {
      const path = typeof fullName === "string" ? fullName : fullName.fsName || fullName.nativePath;
      if (path) {
        return await getDocumentFolderPath(path);
      }
    }
  } catch {
    // fallback below
  }

  try {
    const filePath = await doc.filePath;
    if (filePath) {
      return await getDocumentFolderPath(filePath);
    }
  } catch {
    // ignore
  }

  const folder = await fs.getFolder();
  if (!folder) {
    throw new Error("Não foi possível determinar a pasta do documento.");
  }
  return entryNativePath(folder);
}

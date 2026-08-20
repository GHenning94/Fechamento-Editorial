import { toFileUrl } from "../utils/file-system";
import { GITHUB_DIST_BRANCH, PLUGIN_UPDATE_FILES, githubRawUrl } from "./update-config";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const uxp = require("uxp") as {
  storage: {
    localFileSystem: {
      getPluginFolder?(): Promise<PluginFolder>;
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
  write(content: string | ArrayBuffer, options?: { format?: string }): Promise<void>;
}

async function getWritablePluginFolder(): Promise<PluginFolder> {
  const fs = uxp.storage.localFileSystem;
  if (typeof fs.getPluginFolder !== "function") {
    throw new Error("Não foi possível localizar a pasta do plugin.");
  }

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
}

async function ensureChildFolder(parent: PluginFolder, name: string): Promise<PluginFolder> {
  try {
    const existing = await parent.getEntry(name);
    return existing as unknown as PluginFolder;
  } catch {
    return parent.createFolder(name);
  }
}

async function writeFile(
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

async function writeRelativePath(
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

  await writeFile(folder, fileName, content, binary);
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

export async function applyPluginUpdate(): Promise<void> {
  const folder = await getWritablePluginFolder();
  const errors: string[] = [];

  for (const file of PLUGIN_UPDATE_FILES) {
    try {
      const content = await downloadUpdateFile(file.path, file.binary);
      await writeRelativePath(folder, file.path, content, file.binary);
    } catch (error) {
      if (file.optional) {
        continue;
      }
      errors.push(error instanceof Error ? error.message : file.path);
    }
  }

  if (errors.length) {
    throw new Error(
      "Não foi possível instalar a atualização automaticamente. Verifique se o plugin está carregado pelo UXP (Load) e se o GitHub Actions publicou a pasta dist."
    );
  }
}

export function reloadPluginPanel(): void {
  try {
    window.location.reload();
  } catch {
    // o usuário reabre o painel
  }
}

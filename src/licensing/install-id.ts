import { bytesToHex } from "../utils/sha256";
import { toFileUrl } from "../utils/file-system";

const INSTALL_FILE = ".license-install";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const uxp = require("uxp") as {
  storage: {
    localFileSystem: {
      getPluginFolder?(): Promise<PluginFolder>;
      getEntryWithUrl?(url: string): Promise<PluginFolder>;
    };
    formats: { utf8: string };
  };
};

interface PluginFolder {
  nativePath?: string;
  getEntry(name: string): Promise<PluginFile>;
  createFile?(name: string, options?: { overwrite?: boolean }): Promise<PluginFile>;
}

interface PluginFile {
  nativePath?: string;
  read?(options?: { format?: string }): Promise<string>;
  write?(content: string, options?: { format?: string }): Promise<void>;
}

type NodeFs = {
  existsSync?(p: string): boolean;
  readFileSync?(p: string, encoding: string): string;
  writeFileSync?(p: string, data: string, encoding: string): void;
};

function nodeFs(): NodeFs | null {
  try {
    return require("fs") as NodeFs;
  } catch {
    return null;
  }
}

function joinPath(root: string, name: string): string {
  const windows = /\\/.test(root) || /^[A-Za-z]:/.test(root);
  const sep = windows ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${sep}${name}`;
}

function isInstallId(value: string): boolean {
  return /^[a-f0-9]{32}$/i.test(value.trim());
}

function randomInstallId(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = globalThis.crypto as { getRandomValues?: (buffer: Uint8Array) => Uint8Array } | undefined;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(bytes);
}

async function getPluginFolder(): Promise<PluginFolder | null> {
  const fs = uxp.storage.localFileSystem;
  if (typeof fs.getPluginFolder !== "function") {
    return null;
  }

  try {
    const folder = await fs.getPluginFolder();
    if (!folder.nativePath || typeof fs.getEntryWithUrl !== "function") {
      return folder;
    }
    try {
      return await fs.getEntryWithUrl(toFileUrl(folder.nativePath));
    } catch {
      return folder;
    }
  } catch {
    return null;
  }
}

function readFromDisk(folderPath?: string): string | null {
  const fs = nodeFs();
  if (!fs?.readFileSync || !folderPath) {
    return null;
  }
  try {
    const raw = fs.readFileSync(joinPath(folderPath, INSTALL_FILE), "utf8").trim();
    return isInstallId(raw) ? raw.toLowerCase() : null;
  } catch {
    return null;
  }
}

function writeToDisk(folderPath: string | undefined, installId: string): boolean {
  const fs = nodeFs();
  if (!fs?.writeFileSync || !folderPath) {
    return false;
  }
  try {
    fs.writeFileSync(joinPath(folderPath, INSTALL_FILE), `${installId}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function readFromUxp(folder: PluginFolder): Promise<string | null> {
  try {
    const file = await folder.getEntry(INSTALL_FILE);
    const raw = (await file.read?.({ format: uxp.storage.formats.utf8 }))?.trim() || "";
    return isInstallId(raw) ? raw.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function writeToUxp(folder: PluginFolder, installId: string): Promise<boolean> {
  try {
    let file: PluginFile;
    try {
      file = await folder.getEntry(INSTALL_FILE);
    } catch {
      if (typeof folder.createFile !== "function") {
        return false;
      }
      file = await folder.createFile(INSTALL_FILE, { overwrite: true });
    }
    await file.write?.(installId, { format: uxp.storage.formats.utf8 });
    return true;
  } catch {
    return false;
  }
}

/** Lê o selo desta instalação. Some se o plugin for desinstalado. */
export async function readInstallId(): Promise<string | null> {
  const folder = await getPluginFolder();
  const fromDisk = readFromDisk(folder?.nativePath);
  if (fromDisk) {
    return fromDisk;
  }
  if (folder) {
    return readFromUxp(folder);
  }
  return null;
}

/** Garante um selo nesta pasta do plugin. Atualização in-place mantém o mesmo selo. */
export async function ensureInstallId(): Promise<string> {
  const existing = await readInstallId();
  if (existing) {
    return existing;
  }

  const folder = await getPluginFolder();
  const installId = randomInstallId();
  const wroteDisk = writeToDisk(folder?.nativePath, installId);
  const wroteUxp = folder ? await writeToUxp(folder, installId) : false;

  if (!wroteDisk && !wroteUxp) {
    throw new Error("Não foi possível prender a licença nesta instalação do plugin.");
  }

  const confirmed = await readInstallId();
  if (!confirmed) {
    throw new Error("Não foi possível confirmar o selo desta instalação.");
  }
  return confirmed;
}

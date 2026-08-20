// eslint-disable-next-line @typescript-eslint/no-var-requires
const uxp = require("uxp") as {
  storage: {
    localFileSystem: {
      getDataFolder(): Promise<DataFolder>;
    };
    formats: { utf8: string };
    secureStorage?: {
      getItem(key: string): Promise<string | ArrayBuffer | Uint8Array | null | undefined>;
      setItem(key: string, value: string | Uint8Array): Promise<void>;
      removeItem?(key: string): Promise<void>;
    };
  };
};

import { StoredLicense } from "./license-types";
import { bytesToUtf8, utf8ToBytes } from "../utils/utf8-bytes";

interface DataFolder {
  getEntry(name: string): Promise<DataFile>;
  createFile(name: string, options?: { overwrite?: boolean }): Promise<DataFile>;
}

interface DataFile {
  read(options?: { format?: string }): Promise<string>;
  write(content: string, options?: { format?: string }): Promise<void>;
  delete?(): Promise<void>;
}

const LICENSE_FILE = "license.json";
const STORAGE_KEY = "editorial-autoclose-license";

function parseLicense(raw: string | null | undefined): StoredLicense | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredLicense & { jti?: string };
    const licenseId = parsed.licenseId || parsed.jti;
    if (!parsed?.serial || !licenseId) {
      return null;
    }
    return {
      serial: parsed.serial,
      licenseId,
      machineId: parsed.machineId,
      activatedAt: parsed.activatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function decodeSecureValue(value: string | ArrayBuffer | Uint8Array): string {
  if (typeof value === "string") {
    return value;
  }
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return bytesToUtf8(bytes);
}

function readLocalStorage(): StoredLicense | null {
  try {
    const storage = (globalThis as { localStorage?: { getItem(key: string): string | null } }).localStorage;
    return parseLicense(storage?.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeLocalStorage(json: string): void {
  try {
    const storage = (globalThis as { localStorage?: { setItem(key: string, value: string): void } }).localStorage;
    storage?.setItem(STORAGE_KEY, json);
  } catch {
    // UXP sem localStorage
  }
}

function clearLocalStorage(): void {
  try {
    const storage = (globalThis as { localStorage?: { removeItem(key: string): void } }).localStorage;
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
}

async function readSecureStorage(): Promise<StoredLicense | null> {
  try {
    const value = await uxp.storage.secureStorage?.getItem(STORAGE_KEY);
    if (!value) {
      return null;
    }
    return parseLicense(decodeSecureValue(value));
  } catch {
    return null;
  }
}

async function writeSecureStorage(json: string): Promise<void> {
  const secure = uxp.storage.secureStorage;
  if (!secure?.setItem) {
    return;
  }

  try {
    await secure.setItem(STORAGE_KEY, json);
  } catch {
    try {
      await secure.setItem(STORAGE_KEY, utf8ToBytes(json));
    } catch {
      // ignora
    }
  }
}

async function clearSecureStorage(): Promise<void> {
  try {
    await uxp.storage.secureStorage?.removeItem?.(STORAGE_KEY);
  } catch {
    try {
      await uxp.storage.secureStorage?.setItem(STORAGE_KEY, "");
    } catch {
      // ignora
    }
  }
}

async function readLicenseFile(): Promise<StoredLicense | null> {
  try {
    const folder = await uxp.storage.localFileSystem.getDataFolder();
    const file = await folder.getEntry(LICENSE_FILE);
    const raw = (await file.read({ format: uxp.storage.formats.utf8 })).trim();
    return parseLicense(raw);
  } catch {
    return null;
  }
}

async function writeLicenseFile(json: string): Promise<void> {
  const folder = await uxp.storage.localFileSystem.getDataFolder();
  let file: DataFile;

  try {
    file = await folder.getEntry(LICENSE_FILE);
  } catch {
    file = await folder.createFile(LICENSE_FILE, { overwrite: true });
  }

  await file.write(json, { format: uxp.storage.formats.utf8 });
}

async function clearLicenseFile(): Promise<boolean> {
  try {
    const folder = await uxp.storage.localFileSystem.getDataFolder();
    const file = await folder.getEntry(LICENSE_FILE);

    if (typeof file.delete === "function") {
      await file.delete();
      return true;
    }

    await file.write("{}", { format: uxp.storage.formats.utf8 });
    return true;
  } catch {
    return false;
  }
}

export async function readStoredLicense(): Promise<StoredLicense | null> {
  const fromFile = await readLicenseFile();
  if (fromFile) {
    return fromFile;
  }

  const fromSecure = await readSecureStorage();
  if (fromSecure) {
    return fromSecure;
  }

  return readLocalStorage();
}

export async function writeStoredLicense(license: StoredLicense): Promise<void> {
  const json = JSON.stringify(license, null, 2);
  const errors: string[] = [];

  try {
    await writeLicenseFile(json);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "arquivo");
  }

  await writeSecureStorage(json);
  writeLocalStorage(json);

  const stored = await readStoredLicense();
  if (!stored || stored.serial !== license.serial || stored.licenseId !== license.licenseId) {
    throw new Error(
      errors.length
        ? `Não foi possível salvar a licença neste computador (${errors.join(", ")}).`
        : "Não foi possível confirmar o salvamento da licença neste computador."
    );
  }
}

export async function clearStoredLicense(): Promise<boolean> {
  const removedFile = await clearLicenseFile();
  await clearSecureStorage();
  clearLocalStorage();
  return removedFile || true;
}

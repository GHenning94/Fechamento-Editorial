// eslint-disable-next-line @typescript-eslint/no-var-requires
const uxp = require("uxp") as {
  storage: {
    localFileSystem: {
      getDataFolder(): Promise<DataFolder>;
    };
    formats: { utf8: string };
  };
};

import { StoredLicense } from "./license-types";

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

export async function readStoredLicense(): Promise<StoredLicense | null> {
  try {
    const folder = await uxp.storage.localFileSystem.getDataFolder();
    const file = await folder.getEntry(LICENSE_FILE);
    const raw = (await file.read({ format: uxp.storage.formats.utf8 })).trim();
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredLicense & { jti?: string };
    const licenseId = parsed.licenseId || parsed.jti;
    if (!parsed?.serial || !licenseId || !parsed?.machineId) {
      return null;
    }
    return { ...parsed, licenseId };
  } catch {
    return null;
  }
}

export async function writeStoredLicense(license: StoredLicense): Promise<void> {
  const folder = await uxp.storage.localFileSystem.getDataFolder();
  let file: DataFile;

  try {
    file = await folder.getEntry(LICENSE_FILE);
  } catch {
    file = await folder.createFile(LICENSE_FILE, { overwrite: true });
  }

  await file.write(JSON.stringify(license, null, 2), { format: uxp.storage.formats.utf8 });
}

export async function clearStoredLicense(): Promise<boolean> {
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

declare module "uxp" {
  export const entrypoints: {
    setup(config: {
      panels?: Record<
        string,
        {
          show?: (node: HTMLElement) => void;
          hide?: () => void;
          destroy?: () => void;
        }
      >;
      commands?: Record<string, { run: () => void }>;
    }): void;
  };

  export const shell: {
    openExternal(target: string | { url: string }): Promise<void> | void;
  };

  export const storage: {
    localFileSystem: {
      getEntryWithUrl(url: string): Promise<FileSystemEntry>;
      getFolder(): Promise<FileSystemFolder | null>;
      getDataFolder(): Promise<FileSystemFolder>;
      getPluginFolder?(): Promise<FileSystemFolder>;
    };
    formats: {
      utf8: string;
      binary?: string;
    };
    secureStorage?: {
      getItem(key: string): Promise<string | ArrayBuffer | Uint8Array | null | undefined>;
      setItem(key: string, value: string | Uint8Array): Promise<void>;
      removeItem?(key: string): Promise<void>;
    };
  };

  export interface FileSystemEntry {
    name: string;
    nativePath: string;
    url: string;
    getEntry(name: string): Promise<FileSystemEntry>;
    createFolder(name: string): Promise<FileSystemFolder>;
    createFile?(name: string, options?: { overwrite?: boolean }): Promise<FileSystemEntry>;
    read?(options?: { format?: string }): Promise<string>;
    write(content: string | ArrayBuffer, options?: { format?: string }): Promise<void>;
    copyTo(
      destFolder: FileSystemFolder,
      options?: { overwrite?: boolean }
    ): Promise<FileSystemEntry>;
    rename(newName: string): Promise<void>;
  }

  export interface FileSystemFolder extends FileSystemEntry {
    createFolder(name: string): Promise<FileSystemFolder>;
    getEntry(name: string): Promise<FileSystemEntry>;
  }
}

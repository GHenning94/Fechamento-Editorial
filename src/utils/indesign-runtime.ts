import type { Application, Document } from "indesign";

type InDesignModule = Record<string, unknown> & {
  app?: Application;
  default?: { app?: Application };
  ScriptLanguage?: { JAVASCRIPT?: unknown };
  UndoModes?: { FAST_ENTIRE_SCRIPT?: unknown; ENTIRE_SCRIPT?: unknown };
};

function loadModule(moduleId: string): InDesignModule | null {
  try {
    if (typeof __non_webpack_require__ === "function") {
      return __non_webpack_require__(moduleId) as InDesignModule;
    }
  } catch {
    // tenta fallback abaixo
  }

  try {
    switch (moduleId) {
      case "indesign":
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require("indesign") as InDesignModule;
      case "indesign-20.0":
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require("indesign-20.0") as InDesignModule;
      case "indesign-19.0":
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require("indesign-19.0") as InDesignModule;
      case "indesign-18.5":
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require("indesign-18.5") as InDesignModule;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function isAppLike(value: unknown): value is Application {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Application;
  return (
    typeof candidate.doScript === "function" ||
    "activeDocument" in candidate ||
    "documents" in candidate
  );
}

function resolveAppFromModule(mod: InDesignModule): Application | null {
  if (mod.app && isAppLike(mod.app)) {
    return mod.app;
  }

  if (mod.default?.app && isAppLike(mod.default.app)) {
    return mod.default.app;
  }

  if (isAppLike(mod)) {
    return mod as unknown as Application;
  }

  return null;
}

function loadInDesignModule(): InDesignModule {
  const moduleIds = ["indesign", "indesign-20.0", "indesign-19.0", "indesign-18.5"];

  for (const moduleId of moduleIds) {
    const mod = loadModule(moduleId);
    if (mod && typeof mod === "object") {
      return mod;
    }
  }

  throw new Error("Módulo indesign não disponível neste contexto.");
}

export function getInDesignModule(): InDesignModule {
  return loadInDesignModule();
}

export function getInDesignApp(): Application {
  const moduleIds = ["indesign", "indesign-20.0", "indesign-19.0", "indesign-18.5"];

  for (const moduleId of moduleIds) {
    const mod = loadModule(moduleId);
    if (!mod) continue;

    const app = resolveAppFromModule(mod);
    if (app) {
      return app;
    }
  }

  throw new Error(
    "Não foi possível acessar o InDesign. Feche e reabra o painel do plugin ou recarregue no UDT (Unload → Load)."
  );
}

/** Garante ponte com o InDesign após troca de tela (ex.: ativação de licença). */
export async function ensureInDesignReady(maxAttempts = 6, delayMs = 200): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      runInDesignReadOnly("EDITORIAL AUTOCLOSE — Inicializar painel", () => true);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError ?? new Error("Não foi possível conectar ao InDesign.");
}

export function getActiveDocument(): Document {
  const app = getInDesignApp();
  const doc = app.activeDocument;
  if (!doc) {
    throw new Error("Nenhum documento ativo. Abra um arquivo InDesign.");
  }
  return doc;
}

/** Limpa seleção de objetos (handles) e cursor de texto. */
export function clearInDesignSelection(): void {
  const app = getInDesignApp() as Application & {
    select?: (value: unknown) => void;
    selection?: unknown;
  };
  const { NothingEnum } = getInDesignModule() as {
    NothingEnum?: { NOTHING?: unknown; nothing?: unknown };
  };
  const nothing = NothingEnum?.NOTHING ?? NothingEnum?.nothing ?? 1851876446;

  const selectNothing = (target: { select?: (value: unknown) => void } | null | undefined): void => {
    if (!target || typeof target.select !== "function") return;
    target.select(nothing);
  };

  try {
    selectNothing(app);
  } catch {
    // ignore
  }

  try {
    selectNothing(app.activeDocument as Document & { select?: (value: unknown) => void });
  } catch {
    // ignore
  }

  try {
    app.selection = [];
  } catch {
    // ignore
  }
}

export function getInDesignUserName(): string {
  try {
    return getInDesignApp().userName || "Usuário";
  } catch {
    return "Usuário";
  }
}

export function getDefaultReportUserName(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { userInfo } = require("os") as { userInfo: () => { username?: string } };
    return userInfo().username || getInDesignUserName();
  } catch {
    return getInDesignUserName();
  }
}

function runWithDoScriptJson<T>(commandName: string, fn: () => T): T {
  const app = getInDesignApp();

  if (typeof app.doScript !== "function") {
    return fn();
  }

  const mod = getInDesignModule();
  const undoMode = mod.UndoModes?.FAST_ENTIRE_SCRIPT ?? mod.UndoModes?.ENTIRE_SCRIPT;

  const raw = app.doScript(
    () => JSON.stringify(fn()),
    mod.ScriptLanguage?.JAVASCRIPT,
    [],
    undoMode,
    commandName
  );

  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("O InDesign não retornou dados da operação.");
  }

  return JSON.parse(raw) as T;
}

/**
 * Validações/leituras via doScript com retorno JSON (painel UXP não recebe objetos DOM).
 */
export function runInDesignReadOnly<T>(commandName: string, fn: () => T): T {
  return runWithDoScriptJson(commandName, fn);
}

/**
 * Mutações no documento (package, save) via doScript, com retorno serializado.
 */
export function runInDesignMutation<T>(commandName: string, fn: () => T): T {
  return runWithDoScriptJson(commandName, fn);
}

/**
 * Operações longas (exportação PDF) executadas diretamente no contexto UXP.
 * doScript + exportFile costuma travar/fechar o InDesign em documentos grandes.
 */
export function runInDesignHeavyMutation<T>(commandName: string, fn: () => T): T {
  try {
    const app = getInDesignApp();
    const doc = app.activeDocument;
    if (doc?.isValid) {
      return fn();
    }
  } catch {
    // tenta fallback abaixo
  }

  return runWithDoScriptJson(commandName, fn);
}

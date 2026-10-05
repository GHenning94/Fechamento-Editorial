import { UserInteractionLevels } from "indesign";
import { getInDesignApp, getInDesignModule } from "../utils/indesign-runtime";

const SCRIPT_FILES = {
  1: "script_remocao-substituicao.jsx",
  2: "script_insercao_cae_isbn.jsx",
  3: "script_infos_disciplina_caderno.jsx",
} as const;

const MENU_SCRIPT = `
var dlg = new Window("dialog", "Script código");
dlg.alignChildren = "fill";
dlg.add("statictext", undefined, "Escolha o script:");
var grupo = dlg.add("panel");
grupo.alignChildren = "left";
var opRemocao = grupo.add("radiobutton", undefined, "1. Remoção / substituição de código de barras");
var opCae = grupo.add("radiobutton", undefined, "2. Inserção CAE / ISBN");
var opInfos = grupo.add("radiobutton", undefined, "3. Caderno e disciplina");
opRemocao.value = true;
var botoes = dlg.add("group");
botoes.alignment = "center";
botoes.add("button", undefined, "Iniciar", { name: "ok" });
botoes.add("button", undefined, "Cancelar", { name: "cancel" });
if (dlg.show() !== 1) {
  0;
} else if (opCae.value) {
  2;
} else if (opInfos.value) {
  3;
} else {
  1;
}
`;

type PluginFile = {
  read(options?: { format?: string }): Promise<string>;
};

type PluginFolder = {
  getEntry(name: string): Promise<PluginFile & PluginFolder>;
};

function uxpStorage(): {
  localFileSystem: { getPluginFolder(): Promise<PluginFolder> };
  formats: { utf8: string };
} {
  return (require("uxp") as {
    storage: {
      localFileSystem: { getPluginFolder(): Promise<PluginFolder> };
      formats: { utf8: string };
    };
  }).storage;
}

function runHostScript(source: string): unknown {
  const app = getInDesignApp();
  const saved = app.scriptPreferences.userInteractionLevel;
  const interact = UserInteractionLevels.INTERACT_WITH_ALL;

  try {
    if (interact != null) {
      app.scriptPreferences.userInteractionLevel = interact;
    }
    const language = getInDesignModule().ScriptLanguage?.JAVASCRIPT;
    const run = app.doScript;
    if (typeof run !== "function") {
      throw new Error("Não foi possível executar o script neste InDesign.");
    }
    if (language != null) {
      return run.call(app, source, language);
    }
    return run.call(app, source);
  } finally {
    try {
      app.scriptPreferences.userInteractionLevel = saved;
    } catch {
      // ignore
    }
  }
}

async function readCoverScript(fileName: string): Promise<string> {
  const storage = uxpStorage();
  const plugin = await storage.localFileSystem.getPluginFolder();
  const folder = await plugin.getEntry("scripts");
  const file = await folder.getEntry(fileName);
  return file.read({ format: storage.formats.utf8 });
}

function choiceNumber(value: unknown): 0 | 1 | 2 | 3 {
  const number = Number(value);
  if (number === 1 || number === 2 || number === 3) return number;
  return 0;
}

/** Abre o menu e executa um dos três scripts originais, sem alterar o conteúdo deles. */
export async function runCoverCodeScript(): Promise<"cancelled" | "done"> {
  const choice = choiceNumber(runHostScript(MENU_SCRIPT));
  if (!choice) return "cancelled";

  const source = await readCoverScript(SCRIPT_FILES[choice]);
  runHostScript(source);
  return "done";
}

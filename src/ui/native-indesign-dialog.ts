import { UserInteractionLevels } from "indesign";
import { getInDesignApp, getInDesignModule } from "../utils/indesign-runtime";

const LABEL_WIDTH = 380;

function withUserInteraction<T>(fn: () => T): T {
  const app = getInDesignApp();
  const saved = app.scriptPreferences.userInteractionLevel;

  try {
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.INTERACT_WITH_ALL;
    return fn();
  } finally {
    try {
      app.scriptPreferences.userInteractionLevel = saved;
    } catch {
      // ignore
    }
  }
}

function runHostScript(source: string): unknown {
  const app = getInDesignApp();
  if (typeof app.doScript !== "function") {
    throw new Error("doScript indisponível");
  }

  const language = getInDesignModule().ScriptLanguage?.JAVASCRIPT;
  if (language != null) {
    return app.doScript(source, language);
  }
  return app.doScript(source);
}

function isHostConfirm(value: unknown): boolean {
  return value === true || value === 1 || value === "true";
}

function addMessageLines(
  column: { staticTexts: { add(): { staticLabel: string; minWidth?: number } } },
  message: string
): void {
  for (const line of message.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const text = column.staticTexts.add();
    text.staticLabel = trimmed;
    try {
      text.minWidth = LABEL_WIDTH;
    } catch {
      // ignore
    }
  }
}

function dialogsAlert(message: string, title: string): void {
  const dialog = getInDesignApp().dialogs.add();
  try {
    dialog.name = title;
    dialog.canCancel = false;
    addMessageLines(dialog.dialogColumns.add(), message);
    dialog.show();
  } finally {
    dialog.destroy();
  }
}

function dialogsConfirm(message: string, title: string): boolean {
  const dialog = getInDesignApp().dialogs.add();
  try {
    dialog.name = title;
    dialog.canCancel = true;
    addMessageLines(dialog.dialogColumns.add(), message);
    return Boolean(dialog.show());
  } finally {
    dialog.destroy();
  }
}

function dialogsPrompt(message: string, defaultValue: string, title: string): string | null {
  const dialog = getInDesignApp().dialogs.add();
  try {
    dialog.name = title;
    dialog.canCancel = true;
    const column = dialog.dialogColumns.add();
    addMessageLines(column, message);
    const edit = column.textEditboxes.add();
    edit.editContents = defaultValue || "";
    try {
      edit.minWidth = LABEL_WIDTH;
    } catch {
      // ignore
    }
    if (!dialog.show()) {
      return null;
    }
    return String(edit.editContents || "");
  } finally {
    dialog.destroy();
  }
}

/**
 * Alerta nativo do InDesign (botões embaixo, como exclusão de layer).
 * confirm/alert via doScript; app.dialogs só como fallback.
 */
export function showNativeAlert(message: string, title = "EDITORIAL AUTOCLOSE"): void {
  withUserInteraction(() => {
    try {
      runHostScript(`alert(${JSON.stringify(message)})`);
    } catch {
      dialogsAlert(message, title);
    }
  });
}

/** Confirmação nativa (OK / Cancelar embaixo). */
export function showNativeConfirm(message: string, title = "EDITORIAL AUTOCLOSE"): boolean {
  return withUserInteraction(() => {
    try {
      return isHostConfirm(runHostScript(`confirm(${JSON.stringify(message)})`));
    } catch {
      return dialogsConfirm(message, title);
    }
  });
}

/** Campo de texto nativo (OK / Cancelar embaixo). Null se cancelar. */
export function showNativePrompt(
  message: string,
  defaultValue: string,
  title = "EDITORIAL AUTOCLOSE"
): string | null {
  return withUserInteraction(() => {
    try {
      const raw = runHostScript(
        `prompt(${JSON.stringify(message)}, ${JSON.stringify(defaultValue || "")})`
      );
      if (raw == null || raw === false) {
        return null;
      }
      return String(raw);
    } catch {
      return dialogsPrompt(message, defaultValue, title);
    }
  });
}

import { UserInteractionLevels } from "indesign";
import { getInDesignApp } from "../utils/indesign-runtime";

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

function addMessageLines(column: { staticTexts: { add(): { staticLabel: string; minWidth?: number } } }, message: string): void {
  const lines = message.split(/\n+/);
  for (const line of lines) {
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

/** Alerta nativo do InDesign (botão OK). */
export function showNativeAlert(message: string, title = "EDITORIAL AUTOCLOSE"): void {
  withUserInteraction(() => {
    const dialog = getInDesignApp().dialogs.add();
    try {
      dialog.name = title;
      dialog.canCancel = false;
      addMessageLines(dialog.dialogColumns.add(), message);
      dialog.show();
    } finally {
      dialog.destroy();
    }
  });
}

/** Confirmação nativa do InDesign (OK / Cancelar). */
export function showNativeConfirm(message: string, title = "EDITORIAL AUTOCLOSE"): boolean {
  return withUserInteraction(() => {
    const dialog = getInDesignApp().dialogs.add();
    try {
      dialog.name = title;
      dialog.canCancel = true;
      addMessageLines(dialog.dialogColumns.add(), message);
      return Boolean(dialog.show());
    } finally {
      dialog.destroy();
    }
  });
}

/** Campo de texto nativo do InDesign (OK / Cancelar). Null se cancelar. */
export function showNativePrompt(
  message: string,
  defaultValue: string,
  title = "EDITORIAL AUTOCLOSE"
): string | null {
  return withUserInteraction(() => {
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
  });
}

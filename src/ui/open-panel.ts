const PLUGIN_ID = "com.editorial.autoclose";

type PluginRecord = {
  id?: string;
  showPanel?: (panelId: string) => void;
};

export function openPluginPanel(panelId: string): void {
  try {
    const uxp = require("uxp") as {
      pluginManager?: { plugins?: Iterable<PluginRecord> };
    };
    const plugins = uxp.pluginManager?.plugins;
    if (!plugins) return;
    const mine = Array.from(plugins).find((plugin) => plugin.id === PLUGIN_ID);
    mine?.showPanel?.(panelId);
  } catch {
    // sem permissão ipc o painel não abre por aqui
  }
}

type MenuNode = {
  isValid?: boolean;
  submenus?: MenuBag;
  menuItems?: MenuBag;
  remove?: () => void;
  addEventListener?: (event: string, handler: () => void) => void;
};

type MenuBag = {
  itemByName?: (name: string) => MenuNode;
  item?: (name: string) => MenuNode;
  add?: (value: unknown) => MenuNode;
};

function real(node: MenuNode | null | undefined): node is MenuNode {
  return Boolean(node && node.isValid === true);
}

function findMenu(bag: MenuBag | undefined, names: string[]): MenuNode | null {
  if (!bag) return null;
  for (const name of names) {
    try {
      const byName = bag.itemByName?.(name);
      if (real(byName)) return byName;
    } catch {
      // nome inexistente
    }
    try {
      const byItem = bag.item?.(name);
      if (real(byItem)) return byItem;
    } catch {
      // nome inexistente
    }
  }
  return null;
}

const STALE_ACTIONS = ["CAPAS AUTOCLOSE", "EDITORIAL AUTOCLOSE", "Abrir CAPAS AUTOCLOSE"];

type ListenerList = {
  length?: number;
  item?: (index: number) => { remove?: () => void };
  everyItem?: () => { remove?: () => void };
  [index: number]: { remove?: () => void } | undefined;
};

/** O listener do menu de script morre no reload e o InDesign mostra “Script context is not available anymore”. */
export function removeStaleScriptActions(): void {
  try {
    const { getInDesignApp } = require("../utils/indesign-runtime") as {
      getInDesignApp: () => { scriptMenuActions: MenuBag };
    };
    const actions = getInDesignApp().scriptMenuActions;
    STALE_ACTIONS.forEach((name) => {
      const action = findMenu(actions, [name]) as (MenuNode & { eventListeners?: ListenerList }) | null;
      if (!action) return;
      const listeners = action.eventListeners;
      try {
        listeners?.everyItem?.().remove?.();
      } catch {
        // remove um a um abaixo
      }
      const count = listeners?.length || 0;
      for (let index = count - 1; index >= 0; index -= 1) {
        try {
          (listeners?.item?.(index) || listeners?.[index])?.remove?.();
        } catch {
          // listener já removido
        }
      }
      try {
        action.remove?.();
      } catch {
        // a ação sai junto com o listener
      }
    });
  } catch {
    // menu ainda não está pronto
  }
}

const PLUGIN_ID = "com.editorial.autoclose";
const PLUGIN_MENU = "EDITORIAL AUTOCLOSE";

type PluginRecord = {
  id?: string;
  showPanel?: (panelId: string) => void;
};

type MenuNode = {
  isValid?: boolean;
  name?: string;
  title?: string;
  label?: string;
  id?: string | number;
  submenus?: MenuBag;
  menuItems?: MenuBag;
  associatedMenuAction?: MenuNode;
  eventListeners?: ListenerList;
  remove?: () => void;
};

type MenuBag = {
  length?: number | (() => number);
  itemByName?: (name: string) => MenuNode;
  item?: (index: string | number) => MenuNode;
  [index: number]: MenuNode | undefined;
};

type ListenerList = {
  length?: number;
  item?: (index: number) => { remove?: () => void };
  everyItem?: () => { remove?: () => void };
  [index: number]: { remove?: () => void } | undefined;
};

type InDesignMenus = {
  menus: MenuBag;
  scriptMenuActions: MenuBag;
};

export function openPluginPanel(panelId: string): void {
  try {
    const uxp = require("uxp") as {
      entrypoints?: { _pluginInfo?: { id?: string } };
      pluginManager?: { plugins?: Iterable<PluginRecord> };
    };
    const plugins = uxp.pluginManager?.plugins;
    if (!plugins) return;
    const pluginId = uxp.entrypoints?._pluginInfo?.id || PLUGIN_ID;
    const mine = Array.from(plugins).find((plugin) => plugin.id === pluginId);
    mine?.showPanel?.(panelId);
  } catch {
    // sem permissão ipc o painel não abre por aqui
  }
}

function real(node: MenuNode | null | undefined): node is MenuNode {
  return Boolean(node && node.isValid !== false);
}

function menuText(node: MenuNode | null | undefined): string {
  if (!node) return "";
  return [node.name, node.title, node.label, node.id].filter((part) => part != null).join("\n");
}

function lengthOf(bag: MenuBag | undefined): number {
  if (!bag) return 0;
  try {
    const value = typeof bag.length === "function" ? bag.length() : bag.length;
    return typeof value === "number" ? value : 0;
  } catch {
    return 0;
  }
}

function at(bag: MenuBag | undefined, index: number): MenuNode | null {
  if (!bag) return null;
  try {
    const byItem = bag.item?.(index);
    if (byItem) return byItem;
  } catch {
    // índice inválido
  }
  return bag[index] || null;
}

function findNamed(bag: MenuBag | undefined, names: string[]): MenuNode | null {
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

function appMenus(): InDesignMenus | null {
  try {
    const { getInDesignApp } = require("../utils/indesign-runtime") as {
      getInDesignApp: () => InDesignMenus;
    };
    return getInDesignApp();
  } catch {
    return null;
  }
}

function pluginsMenu(app: InDesignMenus): MenuNode | null {
  const main = findNamed(app.menus, ["$ID/Main", "Main"]);
  return findNamed(main?.submenus, ["$ID/Plug-Ins", "Plug-Ins", "Plug-ins", "Plugins"]);
}

function isPluginSubmenu(node: MenuNode): boolean {
  return menuText(node).toLowerCase().includes(PLUGIN_MENU.toLowerCase());
}

function containsCommand(submenu: MenuNode): boolean {
  const items = submenu.menuItems;
  const count = lengthOf(items);
  for (let index = 0; index < count; index += 1) {
    const item = at(items, index);
    const blob = `${menuText(item)}\n${menuText(item?.associatedMenuAction)}`;
    if (/Abrir CAPAS|openCapasAutoclose/i.test(blob)) return true;
  }
  return false;
}

function isBrokenCoverItem(item: MenuNode): boolean {
  const blob = `${menuText(item)}\n${menuText(item.associatedMenuAction)}`;
  if (/Abrir CAPAS|openCapasAutoclose/i.test(blob)) return false;
  if (/capasAutoclosePanel/i.test(blob)) return true;
  const visible = String(item.name || item.title || item.label || "").trim();
  return visible === "CAPAS AUTOCLOSE";
}

function removeNode(node: MenuNode | null | undefined): void {
  try {
    node?.remove?.();
  } catch {
    // item já saiu do menu
  }
}

function listenerCount(listeners: ListenerList | undefined): number {
  return typeof listeners?.length === "number" ? listeners.length : 0;
}

function removeDeadActions(actions: MenuBag): void {
  ["CAPAS AUTOCLOSE", "EDITORIAL AUTOCLOSE"].forEach((name) => {
    const action = findNamed(actions, [name]);
    const listeners = action?.eventListeners;
    const count = listenerCount(listeners);
    if (!action || count <= 0) return;
    try {
      listeners?.everyItem?.().remove?.();
    } catch {
      // remove um a um abaixo
    }
    for (let index = count - 1; index >= 0; index -= 1) {
      try {
        (listeners?.item?.(index) || listeners?.[index])?.remove?.();
      } catch {
        // listener já removido
      }
    }
    removeNode(action);
  });
}

function pluginSubmenus(plugins: MenuNode | null): MenuNode[] {
  const submenus = plugins?.submenus;
  const found: MenuNode[] = [];
  const count = lengthOf(submenus);
  for (let index = 0; index < count; index += 1) {
    const submenu = at(submenus, index);
    if (submenu && real(submenu) && isPluginSubmenu(submenu)) found.push(submenu);
  }
  return found;
}

function removeBrokenCoverItems(submenu: MenuNode): void {
  const items = submenu.menuItems;
  const count = lengthOf(items);
  for (let index = count - 1; index >= 0; index -= 1) {
    const item = at(items, index);
    if (item && isBrokenCoverItem(item)) removeNode(item);
  }
}

/**
 * O submenu criado por script permanece depois do Unload e abre a capa vazia.
 * No Load fica só o menu do UXP. No Unload esse menu também é removido.
 */
export function removeStalePluginMenus(removeAll: boolean): void {
  const app = appMenus();
  if (!app) return;
  const matches = pluginSubmenus(pluginsMenu(app));
  if (removeAll) {
    matches.forEach(removeNode);
  } else {
    const official = matches.filter(containsCommand);
    if (official.length > 0) {
      matches.filter((submenu) => !containsCommand(submenu)).forEach(removeNode);
      official.forEach(removeBrokenCoverItems);
    } else if (matches.length > 1) {
      matches.slice(0, -1).forEach(removeNode);
      removeBrokenCoverItems(matches[matches.length - 1]);
    } else if (matches.length === 1) {
      removeBrokenCoverItems(matches[0]);
    }
  }
  removeDeadActions(app.scriptMenuActions);
}

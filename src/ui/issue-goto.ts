const LAST_CLASS = "is-last";

let lastItemId = 0;
let lastPage = "";

export function isLastIssueGoTo(itemId: number, pageName?: string): boolean {
  return lastItemId > 0 && lastItemId === itemId && lastPage === (pageName || "");
}

function forEachGoToButton(scope: ParentNode, callback: (button: HTMLElement) => void): void {
  let buttons: NodeListOf<Element> | HTMLCollectionOf<Element> | null = null;
  try {
    buttons = scope.querySelectorAll("[data-goto-id]");
  } catch {
    buttons = null;
  }
  if (!buttons) return;
  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i] as HTMLElement;
    if (button) callback(button);
  }
}

function paintGoToButton(button: HTMLElement, active: boolean): void {
  if (active) {
    button.classList.add(LAST_CLASS);
    button.setAttribute("aria-pressed", "true");
    return;
  }
  button.classList.remove(LAST_CLASS);
  button.setAttribute("aria-pressed", "false");
}

function applyLastIssueGoToHighlight(scope: ParentNode | null | undefined): void {
  if (!scope) return;
  forEachGoToButton(scope, (button) => {
    const itemId = Number(button.getAttribute("data-goto-id"));
    const pageName = button.getAttribute("data-goto-page") || "";
    paintGoToButton(button, isLastIssueGoTo(itemId, pageName));
  });
}

function rememberIssueGoTo(button: HTMLElement): void {
  lastItemId = Number(button.getAttribute("data-goto-id"));
  lastPage = button.getAttribute("data-goto-page") || "";
  const doc = button.ownerDocument;
  applyLastIssueGoToHighlight(doc);
  if (typeof document !== "undefined" && document !== doc) {
    applyLastIssueGoToHighlight(document);
  }
}

export function bindIssueGoTo(
  root: HTMLElement,
  onGoTo: (itemId: number, pageName?: string) => void
): void {
  const marked = root as HTMLElement & { __issueGoToBound?: boolean };
  if (marked.__issueGoToBound) return;
  marked.__issueGoToBound = true;

  const activate = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    let button: HTMLElement | null = null;
    if (target && typeof target.closest === "function") {
      button = target.closest("[data-goto-id]");
    } else {
      let current: HTMLElement | null = target;
      while (current) {
        if (current.getAttribute?.("data-goto-id")) {
          button = current;
          break;
        }
        current = current.parentElement;
      }
    }
    if (!button || !root.contains(button)) return;
    if (event.type === "keydown") {
      const key = (event as KeyboardEvent).key;
      if (key !== "Enter" && key !== " ") return;
    }
    event.preventDefault();
    event.stopPropagation();
    const itemId = Number(button.getAttribute("data-goto-id"));
    if (!Number.isFinite(itemId) || itemId <= 0) return;
    const pageName = button.getAttribute("data-goto-page") || undefined;
    rememberIssueGoTo(button);
    onGoTo(itemId, pageName);
  };

  root.addEventListener("click", activate);
  root.addEventListener("keydown", activate);
}

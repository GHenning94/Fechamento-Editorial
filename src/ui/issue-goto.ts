export function bindIssueGoTo(
  root: HTMLElement,
  onGoTo: (itemId: number) => void
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
    onGoTo(itemId);
  };

  root.addEventListener("click", activate);
  root.addEventListener("keydown", activate);
}
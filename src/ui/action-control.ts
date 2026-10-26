/** Botões customizados em div — evita o focus ring retangular nativo do UXP em <button>. */

export function isActionDisabled(el: HTMLElement | null): boolean {
  if (!el) return true;
  return el.classList.contains("is-disabled") || el.getAttribute("aria-disabled") === "true";
}

export function setActionDisabled(el: HTMLElement | null, disabled: boolean): void {
  if (!el) return;
  if (disabled) {
    el.classList.add("is-disabled");
    el.setAttribute("aria-disabled", "true");
    el.setAttribute("tabindex", "-1");
  } else {
    el.classList.remove("is-disabled");
    el.setAttribute("aria-disabled", "false");
    el.setAttribute("tabindex", "0");
  }
}

export function onActionActivate(
  el: HTMLElement | null,
  handler: () => void
): void {
  if (!el || el.dataset.actionBound === "1") return;
  el.dataset.actionBound = "1";
  let lastRun = 0;

  const run = (event: Event): void => {
    event.preventDefault();
    if (isActionDisabled(el)) return;
    const now = Date.now();
    if (now - lastRun < 400) return;
    lastRun = now;
    handler();
  };

  el.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    run(event);
  });
  el.addEventListener("click", run);

  el.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (isActionDisabled(el)) return;
    handler();
  });
}

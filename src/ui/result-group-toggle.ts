/** Dropdowns de grupos (Cores, CorProf, etc.) nos boxes de Alertas/Erros. */

export function bindResultGroupToggles(container: HTMLElement | null): void {
  if (!container) return;

  const toggles = container.querySelectorAll<HTMLElement>("[data-result-group-toggle]");
  toggles.forEach((toggle) => {
    const group = toggle.parentElement;
    if (!group || !group.classList.contains("result-group")) return;

    const activate = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      const open = group.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };

    toggle.onclick = activate;
    toggle.onkeydown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        activate(event);
      }
    };
  });
}

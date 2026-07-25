/**
 * Expande a altura do painel após o checklist.
 *
 * O UXP não expõe API oficial de resize de painel. Em painéis flutuantes do
 * InDesign/macOS, a janela costuma acompanhar a altura mínima do documento —
 * por isso forçamos min-height no html/body/root após validar.
 */
export function tryExpandPanelToHostHeight(): void {
  const screenHeight =
    typeof window.screen?.availHeight === "number" && window.screen.availHeight > 0
      ? window.screen.availHeight
      : typeof window.innerHeight === "number"
        ? window.innerHeight
        : 900;

  // Quase a altura útil da tela (menu InDesign + dock)
  const targetHeight = Math.max(720, Math.round(screenHeight - 60));

  const applyMinHeight = (height: number): void => {
    const px = `${height}px`;
    document.documentElement.style.minHeight = px;
    document.documentElement.style.height = px;
    document.body.style.minHeight = px;
    document.body.style.height = px;
    document.body.style.overflow = "hidden";

    const root = document.getElementById("root");
    if (root) {
      root.style.minHeight = px;
      root.style.height = px;
      root.classList.add("has-results");
    }
  };

  applyMinHeight(targetHeight);

  // Best-effort: alguns hosts respeitam resizeTo em janela flutuante
  try {
    const width = Math.max(
      280,
      Math.min(
        420,
        typeof window.outerWidth === "number" && window.outerWidth > 0
          ? window.outerWidth
          : typeof window.innerWidth === "number"
            ? window.innerWidth
            : 300
      )
    );
    if (typeof window.resizeTo === "function") {
      window.resizeTo(width, targetHeight);
    }
    if (typeof window.resizeBy === "function") {
      const current =
        (typeof window.outerHeight === "number" && window.outerHeight > 0
          ? window.outerHeight
          : window.innerHeight) || targetHeight;
      const delta = targetHeight - current;
      if (Math.abs(delta) > 40) {
        window.resizeBy(0, delta);
      }
    }
  } catch {
    // ignora — min-height do documento já foi aplicado
  }

  // Reaplica após o host estabilizar o layout
  window.setTimeout(() => applyMinHeight(targetHeight), 50);
  window.setTimeout(() => applyMinHeight(targetHeight), 200);
}

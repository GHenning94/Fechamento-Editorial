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
}

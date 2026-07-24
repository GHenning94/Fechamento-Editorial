/**
 * Libera o event loop do painel UXP e dá tempo ao InDesign de redesenhar.
 * Double rAF garante que a UI (progresso/status) pinte antes da próxima etapa pesada.
 */
export function yieldToHost(delayMs = 50): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      setTimeout(resolve, Math.max(0, delayMs));
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        requestAnimationFrame(finish);
      });
      return;
    }

    finish();
  });
}

/** Yield curto só para a UI atualizar (barra de progresso, status). */
export function yieldForUi(): Promise<void> {
  return yieldToHost(24);
}

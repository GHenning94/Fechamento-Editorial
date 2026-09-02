/**
 * Libera o event loop do painel UXP e dá tempo ao InDesign de redesenhar.
 */
export function yieldToHost(delayMs = 50): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      setTimeout(() => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        } else {
          resolve();
        }
      }, 0);
    }, Math.max(0, delayMs));
  });
}

/** Yield curto só para a UI atualizar (barra de progresso, status). */
export function yieldForUi(): Promise<void> {
  return yieldToHost(40);
}

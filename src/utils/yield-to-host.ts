/** Libera o event loop do painel UXP entre etapas pesadas do InDesign. */
export function yieldToHost(delayMs = 50): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

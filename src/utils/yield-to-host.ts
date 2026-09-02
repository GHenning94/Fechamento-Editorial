/**
 * Libera o event loop do painel UXP e dá tempo ao InDesign de redesenhar.
 * Ordem: timers (cliques/cancelar) → segundo timeout (handlers) → double rAF (pintura).
 */

type IdleHook = () => void;
const idleHooks: IdleHook[] = [];

export function addUiIdleHook(hook: IdleHook): () => void {
  idleHooks.push(hook);
  return () => {
    const index = idleHooks.indexOf(hook);
    if (index >= 0) idleHooks.splice(index, 1);
  };
}

function runIdleHooks(): void {
  for (const hook of idleHooks) {
    try {
      hook();
    } catch {
      // ignore
    }
  }
}

export function yieldToHost(delayMs = 50): Promise<void> {
  return new Promise((resolve) => {
    const paintAndFinish = (): void => {
      runIdleHooks();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
        return;
      }
      resolve();
    };

    setTimeout(() => {
      runIdleHooks();
      setTimeout(paintAndFinish, 0);
    }, Math.max(0, delayMs));
  });
}

/** Yield curto só para a UI atualizar (barra de progresso, status, cancelar). */
export function yieldForUi(): Promise<void> {
  return yieldToHost(40);
}

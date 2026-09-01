const PANEL_HTML = `
<div id="root" class="panel">
  <header class="panel-header">
    <div class="panel-header-row">
      <div class="panel-brand">
        <div class="panel-title">EDITORIAL AUTOCLOSE</div>
        <div class="panel-subtitle">Fechamento editorial automatizado</div>
      </div>
      <div class="panel-header-aside">
        <span class="panel-beta-tag">Beta</span>
        <div id="btn-license-reset" class="license-dev-reset hidden" role="button" tabindex="0">
          Resetar licença
        </div>
      </div>
    </div>
  </header>

  <section id="update-banner" class="update-banner hidden">
    <div class="update-banner-row">
      <p class="update-banner-text">
        Atualização <span id="update-banner-version"></span> disponível
      </p>
      <div id="btn-update-open" class="update-banner-btn" role="button" tabindex="0">Atualizar</div>
    </div>
    <p id="update-banner-status" class="update-banner-status hidden"></p>
  </section>

  <section class="actions">
    <div class="actions-row">
      <div id="btn-create-styles" class="btn btn-create-styles" role="button" tabindex="0">Criar Memorial</div>
      <div id="btn-create-rendimento" class="btn btn-create-rendimento" role="button" tabindex="0">Criar Rendimento</div>
    </div>
    <div id="btn-checklist" class="btn btn-primary" role="button" tabindex="0">Validar checklist</div>
    <div id="btn-download-report" class="btn btn-download-report hidden" role="button" tabindex="0">
      Baixar relatório
    </div>
    <div id="btn-close" class="btn btn-close-material" role="button" tabindex="0">Fechar material</div>
  </section>

  <section class="counters">
    <div class="counter counter-approved">
      <span class="counter-label">Aprovados</span>
      <span id="count-approved" class="counter-value">0</span>
    </div>
    <div class="counter counter-warnings">
      <span class="counter-label">Alertas</span>
      <span id="count-warnings" class="counter-value">0</span>
    </div>
    <div class="counter counter-errors">
      <span class="counter-label">Erros</span>
      <span id="count-errors" class="counter-value">0</span>
    </div>
  </section>

  <section class="progress-section">
    <span id="progress-label" class="progress-label">Aguardando…</span>
    <progress id="progress-bar" max="100" value="0"></progress>
  </section>

  <section class="results">
    <div class="result-block">
      <div class="result-header">
        <span class="result-header-label"><span class="approved-icon">✓</span> Aprovados</span>
        <span class="result-expand" role="button" tabindex="0" title="Abrir Aprovados em janela">⛶</span>
      </div>
      <ul id="list-approved" class="result-list"></ul>
    </div>
    <div class="result-block">
      <div class="result-header">
        <span class="result-header-label"><span class="warning-icon">!</span> Alertas</span>
        <div class="result-header-actions">
          <span id="btn-ignore-all-warnings" class="result-ignore-all hidden" role="button" tabindex="0">Ignorar todos</span>
          <span class="result-expand" role="button" tabindex="0" title="Abrir Alertas em janela">⛶</span>
        </div>
      </div>
      <ul id="list-warnings" class="result-list"></ul>
    </div>
    <div class="result-block">
      <div class="result-header">
        <span class="result-header-label"><span class="error-icon">×</span> Erros</span>
        <span class="result-expand" role="button" tabindex="0" title="Abrir Erros em janela">⛶</span>
      </div>
      <ul id="list-errors" class="result-list"></ul>
    </div>
  </section>

  <footer class="panel-footer">
    <div id="status-message" class="status-message status-info">Pronto.</div>
  </footer>
</div>
`;

let initialized = false;

export function mountPanelRoot(container: HTMLElement, force = false): HTMLElement | null {
  if (force) {
    container.innerHTML = "";
  }

  const existing = container.querySelector("#root");
  if (existing instanceof HTMLElement && !force) {
    return existing;
  }

  container.innerHTML = PANEL_HTML;
  return container.querySelector("#root") as HTMLElement | null;
}

export function isPanelInitialized(): boolean {
  return initialized;
}

export function markPanelInitialized(): void {
  initialized = true;
}

export function resetPanelInitialization(): void {
  initialized = false;
}

export function clearPanelContainer(container: HTMLElement): void {
  container.innerHTML = "";
  resetPanelInitialization();
}

export function showLicenseGate(container: HTMLElement, onEnterSerial: () => void): void {
  container.innerHTML = `
    <div id="license-gate" class="panel license-gate">
      <header class="panel-header">
        <h1 class="panel-title">EDITORIAL AUTOCLOSE</h1>
        <p class="panel-subtitle">Ativação necessária</p>
      </header>
      <p class="license-gate-text">
        Este plugin só funciona após ativação com serial válido.
        Depois de ativar, o código fica salvo neste computador.
      </p>
      <div id="btn-license-enter" class="btn btn-primary license-gate-btn" role="button" tabindex="0">
        Incluir serial
      </div>
    </div>
  `;

  const button = container.querySelector("#btn-license-enter") as HTMLElement | null;
  if (!button) return;

  const activate = (): void => onEnterSerial();
  button.addEventListener("click", activate);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  });
}

/** Remove painel pré-renderizado fora do container UXP (legado / index.html antigo). */
export function removeStrayPanelRoots(container: HTMLElement): void {
  const roots = document.querySelectorAll("#root");
  roots.forEach((node) => {
    if (!container.contains(node)) {
      node.remove();
    }
  });
}

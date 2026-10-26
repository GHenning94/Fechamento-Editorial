export type PanelProfile = "editorial" | "cover";

export function queryUi<T extends Element = HTMLElement>(root: ParentNode, name: string): T | null {
  const selector = `[data-ui="${name}"]`;
  if (root instanceof Element) {
    return root.querySelector(`:scope ${selector}`);
  }
  return root.querySelector(selector);
}

function buildPanelHtml(profile: PanelProfile): string {
  const cover = profile === "cover";
  const rootId = cover ? "cover-root" : "root";
  const title = cover ? "CAPAS AUTOCLOSE" : "EDITORIAL AUTOCLOSE";
  const subtitle = cover ? "Fechamento de capas" : "Fechamento editorial automatizado";
  const actions = cover
    ? `<div class="actions-row">
      <div id="btn-checklist" data-ui="checklist" class="btn btn-primary" role="button" tabindex="0">Validar Checklist</div>
      <div id="btn-script-codigo" data-ui="script-codigo" class="btn btn-script-codigo" role="button" tabindex="0">Script código</div>
    </div>`
    : `<div class="actions-row">
      <div id="btn-create-styles" data-ui="create-styles" class="btn btn-create-styles" role="button" tabindex="0">Criar Memorial</div>
      <div id="btn-create-rendimento" data-ui="create-rendimento" class="btn btn-create-rendimento" role="button" tabindex="0">Criar Rendimento</div>
    </div>
    <div id="btn-checklist" data-ui="checklist" class="btn btn-primary" role="button" tabindex="0">Validar Checklist</div>`;

  const markup = `
<div id="${rootId}" class="panel" data-profile="${profile}">
  <header class="panel-header">
    <div class="panel-header-row">
      <div class="panel-brand">
        <div class="panel-title">${title}</div>
        <div class="panel-subtitle">${subtitle}</div>
      </div>
      <div class="panel-header-aside">
        <div class="panel-version-cluster">
          <div class="panel-version-wrap">
            <span id="plugin-version-tag" data-ui="version-tag" class="panel-version-tag">v.1.0.0</span>
            <div id="btn-version-info" data-ui="version-info" class="panel-version-info" role="button" tabindex="0" title="O que há nesta versão">i</div>
          </div>
          <div id="btn-plugin-update" data-ui="plugin-update" class="panel-update-btn hidden" role="button" tabindex="0" title="Atualizar plugin">
            <img class="panel-update-img" src="icons/update-download.png" width="22" height="22" alt="" />
          </div>
        </div>
        <div id="btn-license-reset" data-ui="license-reset" class="license-dev-reset hidden" role="button" tabindex="0">
          Resetar licença
        </div>
      </div>
    </div>
    <div id="version-notes-card" data-ui="version-notes-card" class="version-notes-card hidden">
      <div id="version-notes-title" data-ui="version-notes-title" class="version-notes-title"></div>
      <div id="version-notes-body" data-ui="version-notes-body" class="version-notes-body"></div>
    </div>
  </header>

  <section class="actions">
    ${actions}
    <div id="btn-download-report" data-ui="download-report" class="btn btn-download-report hidden" role="button" tabindex="0">
      Baixar Relatório
    </div>
    <div id="btn-close" data-ui="close" class="btn btn-close-material" role="button" tabindex="0">Fechar Material</div>
  </section>

  <section class="counters">
    <div class="counter counter-approved">
      <span class="counter-label">Aprovados</span>
      <span id="count-approved" data-ui="count-approved" class="counter-value">0</span>
    </div>
    <div class="counter counter-warnings">
      <span class="counter-label">Alertas</span>
      <span id="count-warnings" data-ui="count-warnings" class="counter-value">0</span>
    </div>
    <div class="counter counter-errors">
      <span class="counter-label">Erros</span>
      <span id="count-errors" data-ui="count-errors" class="counter-value">0</span>
    </div>
  </section>

  <section class="progress-section">
    <div class="progress-row">
      <span id="progress-label" data-ui="progress-label" class="progress-label">Aguardando…</span>
      <div id="btn-cancel-checklist" data-ui="cancel-checklist" class="btn btn-cancel-checklist hidden" role="button" tabindex="0">Cancelar</div>
    </div>
    <progress id="progress-bar" data-ui="progress-bar" max="100" value="0"></progress>
  </section>

  <section class="results">
    <div class="result-block">
      <div class="result-header">
        <span class="result-header-label"><span class="approved-icon">✓</span> Aprovados</span>
        <span class="result-expand" role="button" tabindex="0" title="Abrir Aprovados em janela">⛶</span>
      </div>
      <ul id="list-approved" data-ui="list-approved" class="result-list"></ul>
    </div>
    <div class="result-block">
      <div class="result-header">
        <span class="result-header-label"><span class="warning-icon">!</span> Alertas</span>
        <div class="result-header-actions">
          <span id="btn-ignore-all-warnings" data-ui="ignore-all-warnings" class="result-ignore-all hidden" role="button" tabindex="0">Ignorar todos</span>
          <span class="result-expand" role="button" tabindex="0" title="Abrir Alertas em janela">⛶</span>
        </div>
      </div>
      <ul id="list-warnings" data-ui="list-warnings" class="result-list"></ul>
    </div>
    <div class="result-block">
      <div class="result-header">
        <span class="result-header-label"><span class="error-icon">×</span> Erros</span>
        <span class="result-expand" role="button" tabindex="0" title="Abrir Erros em janela">⛶</span>
      </div>
      <ul id="list-errors" data-ui="list-errors" class="result-list"></ul>
    </div>
  </section>

  <footer class="panel-footer">
    <div id="status-message" data-ui="status-message" class="status-message status-info">
      <img class="work-spinner" src="data:image/gif;base64,R0lGODlhIAAgAPIAACMjKff07tbSyrCspIqGfG5qZFBMSDc0OiH/C05FVFNDQVBFMi4wAwEAAAAh+QQEBQAAACwAAAAAIAAgAAADSQi63P4wykkDsDTr7SwGAshlYThO5amu0eCy8OkOcW3fOEDoec/sO59w6CsYiTljAcmEHJ4QA0A6eh4U16tCSuVYo9NYtkkuJwAAIfkEBAUAAAAsAAAAACAAIAAAA0kIutz+MMpJq72YBrDz3J0XgWJpOkJ6rlgqsHAsswNQz/hS33nvQ4egh0D8PYKHYdHIPAofBUA0g1QYAFdFdIqpQqWra7ZJbiYAACH5BAQFAAAALAAAAAAgACAAAANJCLrc/jDKSau9OOvNu/9NIIIkJQZlqq6YALjMAciqTG8uzO48dPyagbD3+N0uwgFxCTE4IQRANOM0KAoArCI6xVSh0g9WyywzEwAh+QQEBQAAACwAAAAAIAAgAAADSQi63P4wykmrvTjrzbt/R/g54TE25amubEsFAMyYJkt3sOzuPGT8GoGw9/gZgkOi8lFoQgYAaKZZUBAAVwVUiqE+o59rdkleJgAAIfkEBAUAAAAsAAAAACAAIAAAA0kIutz+MMpJq734aFz14ZQHjqRIQubppGrrvnDcGAAt07as7/xT/KCAsAf5FYJDojJCaEIEACinSVAMAFcFVIqhPqOta3ZJLgMSACH5BAQFAAAALAAAAAAgACAAAANNCLrc/jDKSQ+wNOt9+rLY5nShKJFmqi5Gu0at8ULxbN94rkMF0O+9325ILD4ISOMQSVA6i4MoJACgmqIDhQCwVVCtIuy0att2n+g0IAEAIfkEBAUAAAAsAAAAACAAIAAAA0kIutz+MMpJD7A06236stglbkBnRCBZelCqvlEhw5Jc0PGM73zv/xkCQAgcGovIpBIyaC6RzcFzqhRYkVaBIgDg8rJTrpdKLgMSACH5BAQFAAAALAAAAAAgACAAAANKCLrc/jDKSQ2wNOtd+rIYcIib0hXROJZnSpbwRMzxYUMzEcs0bK+7oHBILC4GAKTxmFw6n1CYYBqtTgXVrFYR6EK7ga93Sy6bGwkAIfkEBAUAAAAsAAAAACAAIAAAA0kIutz+MMpJC7A06036shhgiJvSEdE4lmdKlvA0zPFhQ/MQyzRsH7ugcEgUAoEMAUBZTC6NAGRzSiUGrtUs4xrQer/gsHhMLj8SACH5BAQFAAAALAAAAAAgACAAAANJCLrc/jDKSQmwNOs9+rIYUIib0g3ROJZnSpbwJMyxYUOzEMs0bBu7oHBIFB4AR0YAsCwqmUakc0qtxg5Yq1aBTW6/4LB4TC5rEgAh+QQEBQAAACwAAAAAIAAgAAADSQi63P4wykkHsDTrLfqyGECIm9IJ0TiWZ0qW8BTMcWFDcxDLNGwXu6BwSBQaAMeicnJMLp/QKOVAlVqpB6tWmc1Cu1HwdkweJwAAIfkEBAUAAAAsAAAAACAAIAAAA0kIutz+MMpJBbA06x36shgwiJvSBdE4lmdKlnCsEbRs3wBN4Hzv/44CQAgsNoREo3LJNDiZRqcBSr0dAFfcNYvtFrc8cHVMViQAADs=" width="16" height="16" alt="" />
      <span id="status-message-text" data-ui="status-text">Pronto.</span>
    </div>
  </footer>
</div>
`;
  const prefix = cover ? "cv" : "ed";
  return markup.replace(/\sid="([^"]+)"/g, (_match, id: string) => ` id="${prefix}-${id}"`);
}

let initialized = false;

export function mountPanelRoot(
  container: HTMLElement,
  force = false,
  profile: PanelProfile = "editorial"
): HTMLElement | null {
  const selector = `.panel[data-profile="${profile}"]`;
  const existing = container.querySelector(selector);
  if (existing instanceof HTMLElement && !force) {
    return existing;
  }

  container.innerHTML = buildPanelHtml(profile);
  const root = container.querySelector(selector);
  return root instanceof HTMLElement ? root : null;
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

export function showLicenseGate(
  container: HTMLElement,
  onEnterSerial: () => void,
  profile: PanelProfile = "editorial"
): void {
  const title = profile === "cover" ? "CAPAS AUTOCLOSE" : "EDITORIAL AUTOCLOSE";
  container.innerHTML = `
    <div id="license-gate" class="panel license-gate" data-profile="${profile}">
      <header class="panel-header">
        <h1 class="panel-title">${title}</h1>
        <p class="panel-subtitle">Ativação necessária</p>
      </header>
      <p class="license-gate-text">
        Este plugin só funciona após ativação com serial válido.
        Cada código vale uma vez neste computador. Se desinstalar, será preciso um serial novo.
      </p>
      <div id="btn-license-enter" data-ui="license-enter" class="btn btn-primary license-gate-btn" role="button" tabindex="0">
        Incluir serial
      </div>
    </div>
  `;

  const button = queryUi(container, "license-enter");
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
  document.querySelectorAll(".panel[data-profile]").forEach((node) => {
    if (!container.contains(node)) {
      node.remove();
    }
  });
}

import { getInDesignUserName } from "../utils/indesign-runtime";
import { userInfo } from "os";
import { ClosureReport } from "../models/closure-report";
import { ValidationResult, ValidationSummary } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { writeTextFile } from "../utils/file-system";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderIssues(results: ValidationResult[], severity: string): string {
  const filtered = results.filter((r) => {
    if (severity === "success" && r.validatorId === VALIDATOR_IDS.CORES) {
      return false;
    }
    return r.severity === severity;
  });
  if (filtered.length === 0) {
    return "<p class=\"empty\">Nenhum item.</p>";
  }

  let html = "<ul>";
  for (const result of filtered) {
    html += `<li><strong>${escapeHtml(result.validatorName)}</strong>`;
    if (result.issues.length === 0) {
      html += " — Aprovado";
    } else {
      html += "<ul>";
      for (const issue of result.issues) {
        html += "<li>";
        html += escapeHtml(issue.message);
        if (issue.page) html += ` | Página: ${escapeHtml(issue.page)}`;
        if (issue.object) html += ` | Objeto: ${escapeHtml(issue.object)}`;
        if (issue.value) html += ` | Valor: ${escapeHtml(issue.value)}`;
        if (issue.details) html += ` | ${escapeHtml(issue.details)}`;
        html += "</li>";
      }
      html += "</ul>";
    }
    html += "</li>";
  }
  html += "</ul>";
  return html;
}

function renderSummaryBlock(title: string, summary: ValidationSummary): string {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <div class="stats">
        <span class="approved">Aprovados: ${summary.approved}</span>
        <span class="warning">Alertas: ${summary.warnings}</span>
        <span class="error">Erros: ${summary.errors}</span>
      </div>
      <h3>Itens Aprovados</h3>
      ${renderIssues(summary.results, "success")}
      <h3>Alertas</h3>
      ${renderIssues(summary.results, "warning")}
      <h3>Erros</h3>
      ${renderIssues(summary.results, "error")}
    </section>
  `;
}

export class ReportService {
  async generate(report: ClosureReport): Promise<string> {
    const user = report.user || this.getUserName();
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório de Fechamento — ${escapeHtml(report.documentName)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #1a1a1a; background: #f7f7f7; }
    .container { max-width: 960px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    h1 { margin-top: 0; color: #b45309; }
    h2 { border-bottom: 2px solid #eee; padding-bottom: 8px; margin-top: 32px; }
    h3 { margin-top: 20px; color: #444; }
    .meta p { margin: 6px 0; }
    .stats { display: flex; gap: 16px; margin: 12px 0 20px; flex-wrap: wrap; }
    .stats span { padding: 8px 12px; border-radius: 6px; font-weight: 600; }
    .approved { background: #dcfce7; color: #166534; }
    .warning { background: #fef9c3; color: #854d0e; }
    .error { background: #fee2e2; color: #991b1b; }
    ul { line-height: 1.6; }
    .artifacts li { margin-bottom: 6px; }
    .blocked { background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 6px; font-weight: 600; }
    .warning-banner { background: #fef9c3; color: #854d0e; padding: 12px; border-radius: 6px; font-weight: 600; }
    .success-banner { background: #dcfce7; color: #166534; padding: 12px; border-radius: 6px; font-weight: 600; }
    .empty { color: #666; font-style: italic; }
  </style>
</head>
<body>
  <div class="container">
    <h1>EDITORIAL AUTOCLOSE — Relatório de Fechamento</h1>
    <section class="meta">
      <p><strong>Data:</strong> ${escapeHtml(report.date)}</p>
      <p><strong>Usuário:</strong> ${escapeHtml(user)}</p>
      <p><strong>Documento:</strong> ${escapeHtml(report.documentName)}</p>
      <p><strong>Caminho:</strong> ${escapeHtml(report.documentPath)}</p>
    </section>

    ${report.blockReason
      ? `<p class="warning-banner">${escapeHtml(report.blockReason)}</p>`
      : `<p class="success-banner">Fechamento concluído com sucesso.</p>`}

    ${report.checklist ? renderSummaryBlock("Checklist Editorial", report.checklist) : ""}

    <section>
      <h2>Artefatos Gerados (padrão InDesign)</h2>
      <ul class="artifacts">
        <li>Package: ${report.artifacts.packageGenerated ? "Sim" : "Não"} — ${escapeHtml(report.artifacts.paths.packageRoot)}</li>
        ${report.artifacts.inddPath ? `<li>INDD: ${escapeHtml(report.artifacts.inddPath)}</li>` : ""}
        <li>IDML: ${report.artifacts.idmlGenerated ? "Sim" : "Não"}${report.artifacts.idmlPath ? ` — ${escapeHtml(report.artifacts.idmlPath)}` : ""}</li>
        <li>PDF (arte, páginas simples, sem MEMORIAL): ${report.artifacts.pdfArteGenerated ? "Sim" : "Não"}${report.artifacts.pdfArtePath ? ` — ${escapeHtml(report.artifacts.pdfArtePath)}` : ""}</li>
        <li>PDF (_ESTILOS, páginas espelhadas, com MEMORIAL): ${report.artifacts.pdfEstilosGenerated ? "Sim" : "Não"}${report.artifacts.pdfEstilosPath ? ` — ${escapeHtml(report.artifacts.pdfEstilosPath)}` : ""}</li>
        ${report.artifacts.pdfWarnings?.length
          ? `<li>Avisos PDF: ${escapeHtml(report.artifacts.pdfWarnings.join(" "))}</li>`
          : ""}
        <li>Pastas: Document fonts, Links</li>
        <li>Relatório do plugin: ${escapeHtml(report.artifacts.paths.reportPath)}</li>
      </ul>
    </section>
  </div>
</body>
</html>`;

    await writeTextFile(report.artifacts.paths.reportPath, html);
    return report.artifacts.paths.reportPath;
  }

  private getUserName(): string {
    try {
      return userInfo().username || getInDesignUserName();
    } catch {
      return getInDesignUserName();
    }
  }
}

import { getInDesignUserName } from "../utils/indesign-runtime";
import { userInfo } from "os";
import { ClosureReport } from "../models/closure-report";
import {
  getIssueSeverity,
  ValidationResult,
  ValidationSummary,
} from "../models/validation-result";
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
  if (severity === "success") {
    const approved = results.filter(
      (result) => result.severity === "success" && result.validatorId !== VALIDATOR_IDS.CORES
    );
    if (approved.length === 0) {
      return "<p class=\"empty\">Nenhum item.</p>";
    }
    let html = "<ul>";
    for (const result of approved) {
      html += `<li><strong>${escapeHtml(result.validatorName)}</strong> — Aprovado</li>`;
    }
    html += "</ul>";
    return html;
  }

  const grouped = new Map<string, { name: string; lines: string[] }>();

  for (const result of results) {
    const issues = Array.isArray(result.issues) ? result.issues : [];
    for (const issue of issues) {
      if (getIssueSeverity(result, issue) !== severity) continue;
      const entry = grouped.get(result.validatorId) || {
        name: result.validatorName,
        lines: [],
      };
      let line = escapeHtml(issue.message);
      if (issue.page) line += ` | Página: ${escapeHtml(issue.page)}`;
      if (issue.object) line += ` | Objeto: ${escapeHtml(issue.object)}`;
      if (issue.value) line += ` | Valor: ${escapeHtml(issue.value)}`;
      if (issue.details) line += ` | ${escapeHtml(issue.details)}`;
      entry.lines.push(line);
      grouped.set(result.validatorId, entry);
    }
  }

  if (grouped.size === 0) {
    return "<p class=\"empty\">Nenhum item.</p>";
  }

  let html = "<ul>";
  for (const entry of grouped.values()) {
    html += `<li><strong>${escapeHtml(entry.name)}</strong><ul>`;
    for (const line of entry.lines) {
      html += `<li>${line}</li>`;
    }
    html += "</ul></li>";
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

export interface ChecklistReportInput {
  date: string;
  user: string;
  documentName: string;
  documentPath: string;
  checklist: ValidationSummary;
}

export class ReportService {
  async generateChecklistReport(input: ChecklistReportInput, filePath: string): Promise<string> {
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relatório de Checklist — ${escapeHtml(input.documentName)}</title>
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
    .empty { color: #666; font-style: italic; }
  </style>
</head>
<body>
  <div class="container">
    <h1>EDITORIAL AUTOCLOSE — Relatório de Checklist</h1>
    <section class="meta">
      <p><strong>Data:</strong> ${escapeHtml(input.date)}</p>
      <p><strong>Usuário:</strong> ${escapeHtml(input.user)}</p>
      <p><strong>Documento:</strong> ${escapeHtml(input.documentName)}</p>
      <p><strong>Caminho:</strong> ${escapeHtml(input.documentPath)}</p>
    </section>
    ${renderSummaryBlock("Checklist Editorial", input.checklist)}
  </div>
</body>
</html>`;

    await writeTextFile(filePath, html);
    return filePath;
  }

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

import { getInDesignUserName } from "../utils/indesign-runtime";
import { userInfo } from "os";
import { ClosureReport } from "../models/closure-report";
import { ValidationSummary } from "../models/validation-result";
import { writeBinaryFile } from "../utils/file-system";
import { buildChecklistPdf } from "./checklist-pdf";
import { mapOriginalChecklist } from "./original-checklist";

function toPdfPath(filePath: string): string {
  return filePath.replace(/\.html?$/i, ".pdf");
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
    const target = toPdfPath(filePath);
    const bytes = buildChecklistPdf({
      documentName: input.documentName,
      user: input.user,
      date: input.date,
      items: mapOriginalChecklist(input.checklist),
    });
    await writeBinaryFile(target, bytes);
    return target;
  }

  async generate(report: ClosureReport): Promise<string> {
    const user = report.user || this.getUserName();
    const target = toPdfPath(report.artifacts.paths.reportPath);
    report.artifacts.paths.reportPath = target;

    const notes: string[] = [];
    notes.push(`Package: ${report.artifacts.packageGenerated ? "Sim" : "Não"}`);
    notes.push(`IDML: ${report.artifacts.idmlGenerated ? "Sim" : "Não"}`);
    notes.push(`PDF arte: ${report.artifacts.pdfArteGenerated ? "Sim" : "Não"}`);
    notes.push(`PDF ESTILOS: ${report.artifacts.pdfEstilosGenerated ? "Sim" : "Não"}`);
    if (report.blockReason) {
      notes.push(report.blockReason);
    }

    const bytes = buildChecklistPdf({
      documentName: report.documentName,
      user,
      date: report.date,
      items: mapOriginalChecklist(report.checklist, report.artifacts),
      notes,
    });
    await writeBinaryFile(target, bytes);
    return target;
  }

  private getUserName(): string {
    try {
      return userInfo().username || getInDesignUserName();
    } catch {
      return getInDesignUserName();
    }
  }
}

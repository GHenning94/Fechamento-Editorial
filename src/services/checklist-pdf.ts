/** Gerador mínimo de PDF 1.4 (Helvetica WinAnsi) — sem dependências. */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 42;
const MAGENTA = "0.847 0.200 0.380";
const MAGENTA_LIGHT = "0.957 0.769 0.824";
const GRAY = "0.361 0.361 0.361";
const GRAY_BOX = "0.910 0.910 0.910";
const BLACK = "0 0 0";
const WHITE = "1 1 1";

export interface ChecklistPdfItem {
  label: string;
  checked: boolean;
}

export interface ChecklistPdfInput {
  documentName: string;
  user: string;
  date: string;
  items: ChecklistPdfItem[];
  notes?: string[];
}

function pdfString(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const mapped = code <= 255 ? code : 63;
    if (mapped === 40 || mapped === 41 || mapped === 92) {
      out += `\\${String.fromCharCode(mapped)}`;
    } else if (mapped < 32 || mapped > 126) {
      out += `\\${mapped.toString(8).padStart(3, "0")}`;
    } else {
      out += String.fromCharCode(mapped);
    }
  }
  return `(${out})`;
}

function circlePath(cx: number, cy: number, r: number): string {
  const k = 0.5522847498 * r;
  return [
    `${(cx - r).toFixed(2)} ${cy.toFixed(2)} m`,
    `${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c`,
    `${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c`,
    `${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c`,
    `${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c`,
  ].join(" ");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function textAt(x: number, y: number, size: number, font: "F1" | "F2", color: string, value: string): string {
  return `BT /${font} ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`;
}

function rect(x: number, y: number, w: number, h: number, fill: string): string {
  return `${fill} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`;
}

function checkbox(x: number, y: number, checked: boolean): string {
  const r = 6;
  const cx = x + r;
  const cy = y + 3;
  if (!checked) {
    return `${MAGENTA_LIGHT} rg ${circlePath(cx, cy, r)} h f`;
  }
  return [
    `${MAGENTA} rg ${circlePath(cx, cy, r)} h f`,
    `${WHITE} RG 1.4 w 1 J 1 j`,
    `${(cx - 2.6).toFixed(2)} ${(cy - 0.2).toFixed(2)} m`,
    `${(cx - 0.6).toFixed(2)} ${(cy - 2.4).toFixed(2)} l`,
    `${(cx + 3.1).toFixed(2)} ${(cy + 2.3).toFixed(2)} l S`,
  ].join(" ");
}

function buildPageContent(input: ChecklistPdfInput): string[] {
  const pages: string[] = [];
  const cmds: string[] = [];
  let y = PAGE_H - 52;
  const contentWidth = PAGE_W - MARGIN_X * 2;

  const flushPage = (): void => {
    pages.push(cmds.join("\n"));
    cmds.length = 0;
  };

  const ensureSpace = (need: number): void => {
    if (y - need < 56) {
      flushPage();
      y = PAGE_H - 48;
    }
  };

  cmds.push(`${MAGENTA} rg ${circlePath(PAGE_W + 8, PAGE_H - 28, 78)} h f`);
  cmds.push(textAt(MARGIN_X, y, 20, "F2", MAGENTA, "CHECKLIST DESIGN"));
  y -= 28;

  cmds.push(textAt(MARGIN_X, y, 9, "F2", MAGENTA, "INSTRUÇÕES DE PREENCHIMENTO E UTILIZAÇÃO"));
  y -= 16;
  const instructions = [
    "Esta checklist é gerada automaticamente pelo EDITORIAL AUTOCLOSE após a validação.",
    "Itens aprovados aparecem marcados. Erros e alertas permanecem sem marcação.",
    "Este documento deve acompanhar o material em todos os processos.",
  ];
  for (const line of instructions) {
    cmds.push(textAt(MARGIN_X + 10, y, 8, "F1", GRAY, `- ${line}`));
    y -= 12;
  }
  y -= 10;

  cmds.push(textAt(MARGIN_X, y, 9, "F2", MAGENTA, "TÍTULO DA OBRA"));
  y -= 8;
  cmds.push(rect(MARGIN_X, y - 16, contentWidth, 22, GRAY_BOX));
  cmds.push(textAt(MARGIN_X + 8, y - 8, 10, "F1", BLACK, input.documentName || "-"));
  y -= 36;

  for (const item of input.items) {
    const lines = wrapText(item.label, 86);
    ensureSpace(14 + (lines.length - 1) * 11);
    cmds.push(checkbox(MARGIN_X, y - 4, item.checked));
    cmds.push(textAt(MARGIN_X + 20, y, 9, "F1", GRAY, lines[0]));
    y -= 14;
    for (let i = 1; i < lines.length; i++) {
      cmds.push(textAt(MARGIN_X + 20, y, 8, "F1", GRAY, lines[i]));
      y -= 11;
    }
  }

  if (input.notes && input.notes.length > 0) {
    y -= 8;
    ensureSpace(20 + input.notes.length * 12);
    cmds.push(textAt(MARGIN_X, y, 9, "F2", MAGENTA, "ARTEFATOS"));
    y -= 14;
    for (const note of input.notes) {
      ensureSpace(12);
      cmds.push(textAt(MARGIN_X, y, 8, "F1", GRAY, note));
      y -= 12;
    }
  }

  ensureSpace(70);
  if (y > 90) y = 88;
  const colW = (contentWidth - 16) / 3;
  const boxH = 22;
  const labels = ["Designer responsável", "Fechado por", "Data"];
  const values = [input.user, input.user, input.date];
  for (let i = 0; i < 3; i++) {
    const x = MARGIN_X + i * (colW + 8);
    cmds.push(textAt(x, y, 8, "F1", GRAY, labels[i]));
    cmds.push(rect(x, y - 28, colW, boxH, GRAY_BOX));
    cmds.push(textAt(x + 6, y - 20, 8, "F1", BLACK, values[i] || ""));
  }

  flushPage();
  return pages;
}

function asciiBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

export function buildChecklistPdf(input: ChecklistPdfInput): Uint8Array {
  const pageContents = buildPageContent(input);
  const n = pageContents.length;
  const contentId = (i: number) => 3 + i;
  const pageId = (i: number) => 3 + n + i;
  const pagesId = 3 + 2 * n;
  const catalogId = pagesId + 1;

  const chunks: string[] = [];
  const offsets: number[] = new Array(catalogId + 1).fill(0);
  let pos = 0;

  const write = (s: string): void => {
    chunks.push(s);
    pos += s.length;
  };

  const obj = (id: number, body: string): void => {
    offsets[id] = pos;
    write(`${id} 0 obj\n${body}\nendobj\n`);
  };

  write("%PDF-1.4\n");
  obj(1, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  obj(2, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  for (let i = 0; i < n; i++) {
    const stream = pageContents[i];
    obj(contentId(i), `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  const kids = pageContents.map((_, i) => `${pageId(i)} 0 R`).join(" ");
  for (let i = 0; i < n; i++) {
    obj(
      pageId(i),
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId(i)} 0 R /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> >>`
    );
  }

  obj(pagesId, `<< /Type /Pages /Count ${n} /Kids [${kids}] >>`);
  obj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const xrefStart = pos;
  let xref = `xref\n0 ${catalogId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= catalogId; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  write(xref);
  write(`trailer\n<< /Size ${catalogId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return asciiBytes(chunks.join(""));
}

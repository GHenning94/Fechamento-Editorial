/** Gerador mínimo de PDF 1.4 (Helvetica WinAnsi) — sem dependências. */

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 42;
const MAGENTA = "0.847 0.200 0.380";
const MAGENTA_LIGHT = "0.957 0.769 0.824";
const GRAY = "0.361 0.361 0.361";
const GRAY_SOFT = "0.48 0.48 0.48";
const BLACK = "0 0 0";
const WHITE = "1 1 1";
const RULE = "0.85 0.85 0.85";

export interface ChecklistPdfItem {
  label: string;
  checked: boolean;
  details?: string[];
}

export interface ChecklistPdfInput {
  documentName: string;
  user: string;
  date: string;
  items: ChecklistPdfItem[];
  notes?: string[];
}

interface OutlineNode {
  title: string;
  pageIndex: number;
  y: number;
  children: OutlineNode[];
}

const WINANSI_EXTRA: Record<number, number> = {
  0x2013: 150,
  0x2014: 151,
  0x2018: 145,
  0x2019: 146,
  0x201c: 147,
  0x201d: 148,
  0x2022: 149,
  0x2026: 133,
};

function pdfString(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const mapped = code <= 255 ? code : WINANSI_EXTRA[code] ?? 63;
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

function chevron(x: number, y: number): string {
  return [
    `${MAGENTA} rg`,
    `${x.toFixed(2)} ${(y + 6).toFixed(2)} m`,
    `${(x + 6).toFixed(2)} ${(y + 6).toFixed(2)} l`,
    `${(x + 3).toFixed(2)} ${(y + 1.5).toFixed(2)} l`,
    "h f",
  ].join(" ");
}

function somosLogo(): string {
  const cx = PAGE_W / 2;
  const markCy = PAGE_H - 32;
  const r = 9.2;
  const somosW = 48;
  const educW = 36;
  const somosX = cx - somosW / 2;
  const educX = somosX + somosW - educW;
  return [
    `${MAGENTA} rg ${circlePath(cx, markCy, r)} h f`,
    `${WHITE} rg ${circlePath(cx + 3.4, markCy + 3.1, 5.1)} h f`,
    textAt(somosX, PAGE_H - 56, 13, "F2", BLACK, "SOMOS"),
    textAt(educX, PAGE_H - 66, 6.5, "F1", BLACK, "EDUCAÇÃO"),
  ].join("\n");
}

function buildPageContent(input: ChecklistPdfInput): { pages: string[]; outlines: OutlineNode[] } {
  const pages: string[] = [];
  const cmds: string[] = [];
  const outlines: OutlineNode[] = [];
  let y = PAGE_H - 84;

  const flushPage = (): void => {
    pages.push(cmds.join("\n"));
    cmds.length = 0;
  };

  const ensureSpace = (need: number): void => {
    if (y - need < 52) {
      flushPage();
      y = PAGE_H - 48;
    }
  };

  cmds.push(`${MAGENTA} rg ${circlePath(PAGE_W + 8, PAGE_H - 28, 78)} h f`);
  cmds.push(somosLogo());

  cmds.push(textAt(MARGIN_X, y, 18, "F2", MAGENTA, "CHECKLIST DESIGN"));
  y -= 26;

  cmds.push(textAt(MARGIN_X, y, 9, "F2", MAGENTA, "INSTRUÇÕES DE PREENCHIMENTO E UTILIZAÇÃO"));
  y -= 15;
  const instructions = [
    "Esta checklist é gerada automaticamente pelo EDITORIAL AUTOCLOSE após a validação.",
    "Itens aprovados aparecem marcados. Erros e alertas permanecem sem marcação.",
    "Abra os detalhes abaixo de cada item (ou o painel de marcadores do PDF).",
  ];
  for (const line of instructions) {
    cmds.push(textAt(MARGIN_X, y, 8, "F1", GRAY, line));
    y -= 11;
  }
  y -= 12;

  cmds.push(textAt(MARGIN_X, y, 8, "F1", MAGENTA, "TÍTULO DA OBRA"));
  y -= 14;
  cmds.push(textAt(MARGIN_X, y, 11, "F2", BLACK, input.documentName || "-"));
  y -= 8;
  cmds.push(`${RULE} RG 0.4 w ${MARGIN_X.toFixed(2)} ${y.toFixed(2)} m ${(PAGE_W - MARGIN_X).toFixed(2)} ${y.toFixed(2)} l S`);
  y -= 18;

  for (const item of input.items) {
    const details = (item.details || []).slice(0, 12);
    const titleLines = wrapText(item.label, 78);
    const detailBlocks = details.flatMap((line) => wrapText(line, 82));
    ensureSpace(16 + (titleLines.length - 1) * 11 + detailBlocks.length * 10 + 8);

    const itemY = y;
    const children: OutlineNode[] = [];
    cmds.push(checkbox(MARGIN_X, y - 4, item.checked));
    cmds.push(textAt(MARGIN_X + 20, y, 9, "F2", GRAY, titleLines[0]));
    cmds.push(chevron(PAGE_W - MARGIN_X - 8, y - 1));
    y -= 13;
    for (let i = 1; i < titleLines.length; i++) {
      cmds.push(textAt(MARGIN_X + 20, y, 8, "F1", GRAY, titleLines[i]));
      y -= 11;
    }

    for (let d = 0; d < detailBlocks.length; d++) {
      const line = detailBlocks[d];
      children.push({
        title: line.slice(0, 90),
        pageIndex: pages.length,
        y,
        children: [],
      });
      cmds.push(textAt(MARGIN_X + 28, y, 7.5, "F1", GRAY_SOFT, `- ${line}`));
      y -= 10;
    }
    outlines.push({
      title: item.label,
      pageIndex: pages.length,
      y: itemY,
      children,
    });
    y -= 6;
  }

  if (input.notes && input.notes.length > 0) {
    y -= 4;
    ensureSpace(20 + input.notes.length * 12);
    cmds.push(textAt(MARGIN_X, y, 9, "F2", MAGENTA, "ARTEFATOS"));
    y -= 14;
    for (const note of input.notes) {
      ensureSpace(12);
      cmds.push(textAt(MARGIN_X, y, 8, "F1", GRAY, note));
      y -= 12;
    }
  }

  ensureSpace(48);
  y -= 8;
  cmds.push(`${RULE} RG 0.4 w ${MARGIN_X.toFixed(2)} ${y.toFixed(2)} m ${(PAGE_W - MARGIN_X).toFixed(2)} ${y.toFixed(2)} l S`);
  y -= 16;
  const colW = (PAGE_W - MARGIN_X * 2) / 3;
  const labels = ["Designer responsável", "Fechado por", "Data"];
  const values = [input.user, input.user, input.date];
  for (let i = 0; i < 3; i++) {
    const x = MARGIN_X + i * colW;
    cmds.push(textAt(x, y, 7.5, "F1", GRAY, labels[i]));
    cmds.push(textAt(x, y - 13, 9, "F2", BLACK, values[i] || ""));
  }

  flushPage();
  return { pages, outlines };
}

interface AssignedOutline {
  id: number;
  title: string;
  pageIndex: number;
  y: number;
  parentId: number;
  childIds: number[];
}

function assignOutlineIds(nodes: OutlineNode[], parentId: number, nextId: { n: number }): AssignedOutline[] {
  const assigned: AssignedOutline[] = [];
  for (const node of nodes) {
    const id = nextId.n++;
    const children = assignOutlineIds(node.children || [], id, nextId);
    assigned.push({
      id,
      title: node.title,
      pageIndex: node.pageIndex,
      y: node.y,
      parentId,
      childIds: children.filter((child) => child.parentId === id).map((child) => child.id),
    });
    assigned.push(...children);
  }
  return assigned;
}

function asciiBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

export function buildChecklistPdf(input: ChecklistPdfInput): Uint8Array {
  const { pages: pageContents, outlines } = buildPageContent(input);
  const n = pageContents.length;
  const contentId = (i: number) => 3 + i;
  const pageId = (i: number) => 3 + n + i;
  const pagesId = 3 + 2 * n;
  const catalogId = pagesId + 1;
  const outlineRootId = catalogId + 1;
  const firstOutlineItemId = outlineRootId + 1;
  const assignedOutlines =
    outlines.length > 0 ? assignOutlineIds(outlines, outlineRootId, { n: firstOutlineItemId }) : [];
  const lastObjId = assignedOutlines.length > 0 ? assignedOutlines[assignedOutlines.length - 1].id : catalogId;

  const chunks: string[] = [];
  const offsets: number[] = new Array(lastObjId + 1).fill(0);
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

  const catalogExtras =
    assignedOutlines.length > 0 ? ` /Outlines ${outlineRootId} 0 R /PageMode /UseOutlines` : "";
  obj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${catalogExtras} >>`);

  if (assignedOutlines.length > 0) {
    const topLevel = assignedOutlines.filter((entry) => entry.parentId === outlineRootId);
    obj(
      outlineRootId,
      `<< /Type /Outlines /First ${topLevel[0].id} 0 R /Last ${topLevel[topLevel.length - 1].id} 0 R /Count ${topLevel.length} >>`
    );

    const byParent = new Map<number, AssignedOutline[]>();
    for (const entry of assignedOutlines) {
      const siblings = byParent.get(entry.parentId) || [];
      siblings.push(entry);
      byParent.set(entry.parentId, siblings);
    }

    for (const entry of assignedOutlines) {
      const siblings = byParent.get(entry.parentId) || [];
      const index = siblings.findIndex((item) => item.id === entry.id);
      const parts = [`/Title ${pdfString(entry.title)}`, `/Parent ${entry.parentId} 0 R`];
      if (index > 0) parts.push(`/Prev ${siblings[index - 1].id} 0 R`);
      if (index < siblings.length - 1) parts.push(`/Next ${siblings[index + 1].id} 0 R`);
      if (entry.childIds.length > 0) {
        parts.push(`/First ${entry.childIds[0]} 0 R`);
        parts.push(`/Last ${entry.childIds[entry.childIds.length - 1]} 0 R`);
        parts.push(`/Count ${-entry.childIds.length}`);
      }
      const destPage = pageId(Math.min(entry.pageIndex, n - 1));
      parts.push(`/Dest [${destPage} 0 R /XYZ ${MARGIN_X} ${entry.y.toFixed(2)} 0]`);
      obj(entry.id, `<< ${parts.join(" ")} >>`);
    }
  }

  const xrefStart = pos;
  let xref = `xref\n0 ${lastObjId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= lastObjId; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  write(xref);
  write(`trailer\n<< /Size ${lastObjId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return asciiBytes(chunks.join(""));
}

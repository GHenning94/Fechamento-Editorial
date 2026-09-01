/** Gerador mínimo de PDF 1.4 (Helvetica WinAnsi + logo JPEG + combos AcroForm). */

import { SOMOS_LOGO_JPEG_B64 } from "../assets/somos-logo-data";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 42;
const MAGENTA = "0.847 0.200 0.380";
const MAGENTA_LIGHT = "0.957 0.769 0.824";
const GRAY = "0.361 0.361 0.361";
const BLACK = "0 0 0";
const WHITE = "1 1 1";
const RULE = "0.85 0.85 0.85";
const COMBO_W = 168;
const COMBO_H = 14;

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

interface ComboField {
  name: string;
  pageIndex: number;
  x: number;
  y: number;
  options: string[];
  value: string;
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

function asciiBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

function decodeBase64(b64: string): Uint8Array {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const padded = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    const a = table.indexOf(padded[i]);
    const b = table.indexOf(padded[i + 1] || "A");
    const cChar = padded[i + 2];
    const dChar = padded[i + 3];
    const c = !cChar || cChar === "=" ? -1 : table.indexOf(cChar);
    const d = !dChar || dChar === "=" ? -1 : table.indexOf(dChar);
    const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    out.push((n >> 16) & 255);
    if (c >= 0) out.push((n >> 8) & 255);
    if (d >= 0) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

function jpegSize(bytes: Uint8Array): { w: number; h: number } {
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return {
        h: (bytes[i + 5] << 8) | bytes[i + 6],
        w: (bytes[i + 7] << 8) | bytes[i + 8],
      };
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    i += 2 + len;
  }
  return { w: 555, h: 313 };
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

export function displayDocumentTitle(name: string): string {
  const trimmed = (name || "").trim();
  return trimmed.replace(/\.indd$/i, "") || "-";
}

function comboAppearanceStream(width: number, height: number, label: string): string {
  const clipped = label.length > 28 ? `${label.slice(0, 27)}…` : label;
  const chevronX = width - 10;
  const midY = height / 2;
  return [
    "q",
    `${WHITE} rg 0 0 ${width.toFixed(2)} ${height.toFixed(2)} re f`,
    `${MAGENTA} RG 0.7 w 0.4 0.4 ${(width - 0.8).toFixed(2)} ${(height - 0.8).toFixed(2)} re S`,
    textAt(5, 3.5, 7.5, "F1", GRAY, clipped),
    `${MAGENTA} rg`,
    `${chevronX.toFixed(2)} ${(midY + 2.2).toFixed(2)} m`,
    `${(chevronX + 6).toFixed(2)} ${(midY + 2.2).toFixed(2)} l`,
    `${(chevronX + 3).toFixed(2)} ${(midY - 2.2).toFixed(2)} l`,
    "h f",
    "Q",
  ].join("\n");
}

function buildPageContent(
  input: ChecklistPdfInput,
  logo: { bytes: Uint8Array; w: number; h: number }
): { pages: string[]; combos: ComboField[] } {
  const pages: string[] = [];
  const cmds: string[] = [];
  const combos: ComboField[] = [];
  const logoW = 78;
  const logoH = (logoW * logo.h) / logo.w;
  const logoX = (PAGE_W - logoW) / 2;
  const logoY = PAGE_H - 14 - logoH;
  let y = logoY - 22;

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
  cmds.push(`q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /ImLogo Do Q`);

  cmds.push(textAt(MARGIN_X, y, 18, "F2", MAGENTA, "CHECKLIST DESIGN"));
  y -= 26;

  cmds.push(textAt(MARGIN_X, y, 9, "F2", MAGENTA, "INSTRUÇÕES DE PREENCHIMENTO E UTILIZAÇÃO"));
  y -= 15;
  const instructions = [
    "Esta checklist é gerada automaticamente pelo EDITORIAL AUTOCLOSE após a validação.",
    "Itens aprovados aparecem marcados. Nos demais, abra o menu à direita para ver os detalhes.",
  ];
  for (const line of instructions) {
    cmds.push(textAt(MARGIN_X, y, 8, "F1", GRAY, line));
    y -= 11;
  }
  y -= 12;

  cmds.push(textAt(MARGIN_X, y, 8, "F1", MAGENTA, "TÍTULO DA OBRA"));
  y -= 14;
  cmds.push(textAt(MARGIN_X, y, 11, "F2", BLACK, displayDocumentTitle(input.documentName)));
  y -= 8;
  cmds.push(`${RULE} RG 0.4 w ${MARGIN_X.toFixed(2)} ${y.toFixed(2)} m ${(PAGE_W - MARGIN_X).toFixed(2)} ${y.toFixed(2)} l S`);
  y -= 20;

  for (const item of input.items) {
    const details = (item.details || []).filter((line) => line.trim());
    const titleLines = wrapText(item.label, item.checked ? 62 : 52);
    ensureSpace(16 + (titleLines.length - 1) * 11 + 8);

    cmds.push(checkbox(MARGIN_X, y - 4, item.checked));
    cmds.push(textAt(MARGIN_X + 20, y, 9, "F2", GRAY, titleLines[0]));

    if (item.checked) {
      cmds.push(textAt(PAGE_W - MARGIN_X - 52, y, 8, "F1", GRAY, "Aprovado"));
    } else if (details.length > 0) {
      combos.push({
        name: `chk_${combos.length + 1}`,
        pageIndex: pages.length,
        x: PAGE_W - MARGIN_X - COMBO_W,
        y: y - 3,
        options: details.map((line) => line.slice(0, 140)),
        value: "ver detalhes",
      });
    }

    y -= 13;
    for (let i = 1; i < titleLines.length; i++) {
      cmds.push(textAt(MARGIN_X + 20, y, 8, "F1", GRAY, titleLines[i]));
      y -= 11;
    }
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
  return { pages, combos };
}

export function buildChecklistPdf(input: ChecklistPdfInput, logoJpeg?: Uint8Array): Uint8Array {
  const logoBytes = logoJpeg && logoJpeg.length > 0 ? logoJpeg : decodeBase64(SOMOS_LOGO_JPEG_B64);
  const size = jpegSize(logoBytes);
  const { pages: pageContents, combos } = buildPageContent(input, { bytes: logoBytes, ...size });
  const n = pageContents.length;
  const k = combos.length;

  const font1 = 1;
  const font2 = 2;
  const imageId = 3;
  const contentId = (i: number) => 4 + i;
  const pageId = (i: number) => 4 + n + i;
  const pagesId = 4 + 2 * n;
  const apId = (i: number) => pagesId + 1 + i;
  const widgetId = (i: number) => pagesId + 1 + k + i;
  const acroId = k > 0 ? pagesId + 1 + 2 * k : -1;
  const catalogId = k > 0 ? acroId + 1 : pagesId + 1;
  const lastObjId = catalogId;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = new Array(lastObjId + 1).fill(0);
  let pos = 0;

  const write = (chunk: string | Uint8Array): void => {
    const bytes = typeof chunk === "string" ? asciiBytes(chunk) : chunk;
    chunks.push(bytes);
    pos += bytes.length;
  };

  const obj = (id: number, body: string): void => {
    offsets[id] = pos;
    write(`${id} 0 obj\n${body}\nendobj\n`);
  };

  write("%PDF-1.4\n%\x80\x81\x82\x83\n");
  obj(font1, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  obj(font2, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  offsets[imageId] = pos;
  write(
    `${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${size.w} /Height ${size.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`
  );
  write(logoBytes);
  write("\nendstream\nendobj\n");

  for (let i = 0; i < n; i++) {
    const stream = pageContents[i];
    obj(contentId(i), `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  const annotsByPage = pageContents.map(() => [] as number[]);
  for (let i = 0; i < k; i++) {
    annotsByPage[combos[i].pageIndex]?.push(widgetId(i));
  }

  for (let i = 0; i < n; i++) {
    const annots = annotsByPage[i];
    const annotsPart =
      annots.length > 0 ? ` /Annots [${annots.map((id) => `${id} 0 R`).join(" ")}]` : "";
    obj(
      pageId(i),
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId(i)} 0 R /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> /XObject << /ImLogo ${imageId} 0 R >> >>${annotsPart} >>`
    );
  }

  const kids = pageContents.map((_, i) => `${pageId(i)} 0 R`).join(" ");
  obj(pagesId, `<< /Type /Pages /Count ${n} /Kids [${kids}] >>`);

  for (let i = 0; i < k; i++) {
    const field = combos[i];
    const stream = comboAppearanceStream(COMBO_W, COMBO_H, field.value);
    obj(
      apId(i),
      `<< /Type /XObject /Subtype /Form /BBox [0 0 ${COMBO_W} ${COMBO_H}] /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    );
  }

  const COMBO_FLAGS = 131072;
  for (let i = 0; i < k; i++) {
    const field = combos[i];
    const destPage = pageId(Math.min(field.pageIndex, n - 1));
    const opt = field.options.map((line) => pdfString(line)).join(" ");
    obj(
      widgetId(i),
      `<< /Type /Annot /Subtype /Widget /FT /Ch /T ${pdfString(field.name)} /Ff ${COMBO_FLAGS} /Rect [${field.x.toFixed(2)} ${field.y.toFixed(2)} ${(field.x + COMBO_W).toFixed(2)} ${(field.y + COMBO_H).toFixed(2)}] /F 4 /P ${destPage} 0 R /V ${pdfString(field.value)} /DV ${pdfString(field.value)} /Opt [${opt}] /DA (/F1 8 Tf 0.36 0.36 0.36 rg) /MK << /BG [1 1 1] /BC [0.847 0.200 0.380] >> /AP << /N ${apId(i)} 0 R >> >>`
    );
  }

  if (k > 0) {
    const fields = combos.map((_, i) => `${widgetId(i)} 0 R`).join(" ");
    obj(
      acroId,
      `<< /Fields [${fields}] /NeedAppearances true /DA (/F1 8 Tf 0 g) /DR << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> >>`
    );
    obj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R /AcroForm ${acroId} 0 R >>`);
  } else {
    obj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  }

  const xrefStart = pos;
  let xref = `xref\n0 ${lastObjId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= lastObjId; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  write(xref);
  write(`trailer\n<< /Size ${lastObjId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

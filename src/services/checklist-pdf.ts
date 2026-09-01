/** Gerador mínimo de PDF 1.4 — logo JPEG, Helvetica, AcroForm e comentários. */

import { SOMOS_LOGO_JPEG_B64 } from "../assets/somos-logo-data";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 36;
const MAGENTA = "0.847 0.200 0.380";
const MAGENTA_LIGHT = "0.957 0.769 0.824";
const GRAY = "0.361 0.361 0.361";
const BLACK = "0 0 0";
const WHITE = "1 1 1";
const RULE = "0.82 0.82 0.82";
const FOOTER_H = 50;
const BOTTOM_MARGIN = 32;
const CHECK_SIZE = 11;
const INSTRUCTIONS = [
  "Esta checklist deve ser preenchida inicialmente pelo(s) responsável(eis) do projeto e completada por qualquer um do time que venha a finalizar o processo.",
  "Será o documento de referência para atestar a qualidade e cercar possíveis erros que possam ser escalonados durante o processo de produção de arte.",
  "Este documento deve acompanhar o material em todos seus processos, inclusive depois do direcionado aos usuários finais.",
];

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

interface CommentAnnot {
  title: string;
  contents: string;
  pageIndex: number;
  x: number;
  y: number;
}

interface CheckboxField {
  name: string;
  pageIndex: number;
  x: number;
  y: number;
  size: number;
  checked: boolean;
}

function sanitizePdfText(text: string): string {
  return (text || "")
    .replace(/[\u2013\u2014\u2212]/g, " - ")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ");
}

/** Literal PDF WinAnsi. Travessões viram hífen ASCII para não quebrar no Acrobat/Preview. */
function pdfString(text: string): string {
  const value = sanitizePdfText(text);
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
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

function helveticaWidth(text: string, fontSize: number): number {
  let units = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    if (code === 32) units += 278;
    else if ("ijltfI!.,:;|'".includes(ch)) units += 278;
    else if ("()[]-–—/".includes(ch)) units += 333;
    else if ("mwMW@%".includes(ch)) units += 833;
    else if (code >= 65 && code <= 90) units += 667;
    else units += 556;
  }
  return (units * fontSize) / 1000;
}

function wrapTextToWidth(text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const fits = (value: string): boolean => helveticaWidth(value, fontSize) <= maxWidth;

  const pushWord = (word: string): void => {
    if (!fits(word) && word.length > 1) {
      if (current) {
        lines.push(current);
        current = "";
      }
      let chunk = "";
      for (const ch of word) {
        if (chunk && !fits(chunk + ch)) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
      return;
    }
    const next = current ? `${current} ${word}` : word;
    if (current && !fits(next)) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  };

  for (const word of words) pushWord(word);
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function textAt(x: number, y: number, size: number, font: "F1" | "F2", color: string, value: string): string {
  return `BT /${font} ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`;
}

function checkboxAppearanceStream(size: number, checked: boolean): string {
  const r = size / 2 - 0.55;
  const cx = size / 2;
  const cy = size / 2;
  if (!checked) {
    return `${MAGENTA_LIGHT} rg ${circlePath(cx, cy, r)} h f`;
  }
  return [
    `${MAGENTA} rg ${circlePath(cx, cy, r)} h f`,
    `${WHITE} RG 1.25 w 1 J 1 j`,
    `${(cx - 2.2).toFixed(2)} ${(cy - 0.15).toFixed(2)} m`,
    `${(cx - 0.4).toFixed(2)} ${(cy - 2.1).toFixed(2)} l`,
    `${(cx + 2.6).toFixed(2)} ${(cy + 2.0).toFixed(2)} l S`,
  ].join(" ");
}

function checkboxOnPage(x: number, y: number, size: number, checked: boolean): string {
  return `q 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} cm ${checkboxAppearanceStream(size, checked)} Q`;
}

export function displayDocumentTitle(name: string): string {
  const trimmed = (name || "").trim();
  return trimmed.replace(/\.indd$/i, "") || "-";
}

export function formatChecklistDate(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = trimmed.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (br) return br[1];
  return trimmed.replace(/[T,]\s*\d{1,2}:\d{2}(:\d{2})?.*$/, "").replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, "").trim();
}

function buildPageContent(
  input: ChecklistPdfInput,
  logo: { bytes: Uint8Array; w: number; h: number }
): { pages: string[]; outlines: OutlineNode[]; comments: CommentAnnot[]; checkboxes: CheckboxField[] } {
  const pages: string[] = [];
  const cmds: string[] = [];
  const outlines: OutlineNode[] = [];
  const comments: CommentAnnot[] = [];
  const checkboxes: CheckboxField[] = [];
  const logoW = 92;
  const logoH = (logoW * logo.h) / logo.w;
  const logoX = (PAGE_W - logoW) / 2;
  const logoY = PAGE_H - 22 - logoH;
  let y = logoY - 26;
  const contentW = PAGE_W - MARGIN_X * 2;
  const textX = MARGIN_X + 18;
  const itemWidth = PAGE_W - MARGIN_X - textX;
  const itemSize = 9.5;
  const itemLead = 12;
  const reviewSize = 8;
  const reviewLead = 10;

  cmds.push(`${MAGENTA} rg ${circlePath(PAGE_W + 8, PAGE_H - 28, 78)} h f`);
  cmds.push(`q ${logoW.toFixed(2)} 0 0 ${logoH.toFixed(2)} ${logoX.toFixed(2)} ${logoY.toFixed(2)} cm /ImLogo Do Q`);

  cmds.push(textAt(MARGIN_X, y, 16, "F2", MAGENTA, "CHECKLIST DESIGN"));
  y -= 20;

  cmds.push(textAt(MARGIN_X, y, 7.5, "F2", MAGENTA, "INSTRUÇÕES DE PREENCHIMENTO E UTILIZAÇÃO"));
  y -= 12;
  for (const instruction of INSTRUCTIONS) {
    const lines = wrapTextToWidth(`- ${instruction}`, 8, contentW);
    for (const line of lines) {
      cmds.push(textAt(MARGIN_X, y, 8, "F1", GRAY, line));
      y -= 10;
    }
    y -= 1;
  }
  y -= 16;

  const title = displayDocumentTitle(input.documentName);
  cmds.push(`${MAGENTA} rg ${MARGIN_X.toFixed(2)} ${(y - 22).toFixed(2)} 2.2 30 re f`);
  cmds.push(textAt(MARGIN_X + 10, y, 6.5, "F2", MAGENTA, "TÍTULO DA OBRA"));
  y -= 13;
  cmds.push(textAt(MARGIN_X + 10, y, 11, "F2", BLACK, title));
  y -= 10;
  cmds.push(`${MAGENTA} RG 1.2 w ${MARGIN_X.toFixed(2)} ${y.toFixed(2)} m ${(MARGIN_X + 64).toFixed(2)} ${y.toFixed(2)} l S`);
  cmds.push(
    `${RULE} RG 0.35 w ${(MARGIN_X + 70).toFixed(2)} ${y.toFixed(2)} m ${(PAGE_W - MARGIN_X).toFixed(2)} ${y.toFixed(2)} l S`
  );
  y -= 22;

  const itemContentHeight = (item: ChecklistPdfItem): number => {
    const details = (item.details || []).filter((line) => line.trim());
    const hasReview = !item.checked && details.length > 0;
    const titleLines = wrapTextToWidth(item.label, itemSize, itemWidth);
    return itemLead + (titleLines.length - 1) * itemLead + (hasReview ? reviewLead : 0);
  };

  const notes = input.notes && input.notes.length > 0 ? input.notes : [];
  const notesH = notes.length > 0 ? 14 + notes.length * 10 : 0;
  const contentHeights = input.items.map(itemContentHeight);
  const available = y - FOOTER_H - BOTTOM_MARGIN - notesH;
  const minGap = 5;
  const maxGap = 10;
  const minTotal =
    contentHeights.reduce((sum, height) => sum + height, 0) + minGap * Math.max(0, input.items.length - 1);
  let itemGap = minGap;
  if (input.items.length > 1 && available > minTotal) {
    itemGap = Math.min(maxGap, minGap + (available - minTotal) / (input.items.length - 1));
  }

  input.items.forEach((item, index) => {
    const details = (item.details || []).filter((line) => line.trim()).slice(0, 40);
    const hasReview = !item.checked && details.length > 0;
    const titleLines = wrapTextToWidth(item.label, itemSize, itemWidth);
    const isLast = index === input.items.length - 1;

    const checkX = MARGIN_X;
    const checkY = y - 2;
    checkboxes.push({
      name: `Item${String(index + 1).padStart(2, "0")}`,
      pageIndex: 0,
      x: checkX,
      y: checkY,
      size: CHECK_SIZE,
      checked: item.checked,
    });
    cmds.push(checkboxOnPage(checkX, checkY, CHECK_SIZE, item.checked));

    const itemY = y;
    cmds.push(textAt(textX, y, itemSize, "F1", GRAY, titleLines[0]));
    y -= itemLead;
    for (let i = 1; i < titleLines.length; i++) {
      cmds.push(textAt(textX, y, itemSize, "F1", GRAY, titleLines[i]));
      y -= itemLead;
    }
    if (hasReview) {
      cmds.push(textAt(textX, y, reviewSize, "F2", MAGENTA, "Há conteúdo a ser avaliado"));
      y -= reviewLead;
    }

    if (hasReview) {
      outlines.push({
        title: item.label.slice(0, 80),
        pageIndex: 0,
        y: itemY,
        children: details.map((line) => ({
          title: line.slice(0, 120),
          pageIndex: 0,
          y: itemY,
          children: [],
        })),
      });
      comments.push({
        title: item.label.slice(0, 60),
        contents: details.join("\n\n"),
        pageIndex: 0,
        x: PAGE_W - MARGIN_X - 16,
        y: itemY - 2,
      });
    }

    if (!isLast) y -= itemGap;
  });

  if (notes.length > 0 && y - notesH - FOOTER_H > BOTTOM_MARGIN + 8) {
    y -= 4;
    cmds.push(textAt(MARGIN_X, y, 7.5, "F2", MAGENTA, "ARTEFATOS"));
    y -= 12;
    for (const note of notes) {
      cmds.push(textAt(MARGIN_X, y, 8, "F1", GRAY, note));
      y -= 10;
    }
  }

  const bandH = 44;
  const bandBottom = BOTTOM_MARGIN;
  const bandTop = bandBottom + bandH;
  const innerW = PAGE_W - MARGIN_X * 2;
  cmds.push(`0.965 0.945 0.950 rg ${MARGIN_X.toFixed(2)} ${bandBottom.toFixed(2)} ${innerW.toFixed(2)} ${bandH.toFixed(2)} re f`);
  cmds.push(`${MAGENTA} RG 1.1 w ${MARGIN_X.toFixed(2)} ${bandTop.toFixed(2)} m ${(PAGE_W - MARGIN_X).toFixed(2)} ${bandTop.toFixed(2)} l S`);

  const colW = innerW / 3;
  const labels = ["Designer responsável", "Fechado por", "Data"];
  const values = [input.user, input.user, formatChecklistDate(input.date)];
  for (let i = 0; i < 3; i++) {
    const x = MARGIN_X + 10 + i * colW;
    if (i > 0) {
      const vx = MARGIN_X + i * colW;
      cmds.push(`${MAGENTA_LIGHT} RG 0.6 w ${vx.toFixed(2)} ${(bandBottom + 8).toFixed(2)} m ${vx.toFixed(2)} ${(bandTop - 6).toFixed(2)} l S`);
    }
    cmds.push(textAt(x, bandTop - 13, 6.5, "F2", MAGENTA, labels[i]));
    cmds.push(textAt(x, bandTop - 28, 9, "F2", BLACK, values[i] || ""));
  }

  pages.push(cmds.join("\n"));
  return { pages, outlines, comments, checkboxes };
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

function formXObject(id: number, size: number, stream: string): string {
  return `${id} 0 obj\n<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 ${size} ${size}] /Matrix [1 0 0 1 0 0] /Resources << /ProcSet [/PDF] >> /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
}

export function buildChecklistPdf(input: ChecklistPdfInput, logoJpeg?: Uint8Array): Uint8Array {
  const logoBytes = logoJpeg && logoJpeg.length > 0 ? logoJpeg : decodeBase64(SOMOS_LOGO_JPEG_B64);
  const size = jpegSize(logoBytes);
  const { pages: pageContents, outlines, comments, checkboxes } = buildPageContent(input, {
    bytes: logoBytes,
    ...size,
  });
  const n = pageContents.length;
  const c = comments.length;
  const k = checkboxes.length;

  let nextId = 1;
  const font1 = nextId++;
  const font2 = nextId++;
  const imageId = nextId++;
  const contentIds = Array.from({ length: n }, () => nextId++);
  const pageIds = Array.from({ length: n }, () => nextId++);
  const pagesId = nextId++;
  const commentIds = Array.from({ length: c }, () => nextId++);
  const apOffId = nextId++;
  const apYesId = nextId++;
  const widgetIds = Array.from({ length: k }, () => nextId++);
  const acroFormId = nextId++;
  const outlineRootId = outlines.length > 0 ? nextId++ : -1;
  const assignedOutlines =
    outlines.length > 0 ? assignOutlineIds(outlines, outlineRootId, { n: nextId }) : [];
  if (assignedOutlines.length > 0) {
    nextId = assignedOutlines[assignedOutlines.length - 1].id + 1;
  }
  const catalogId = nextId;
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
    obj(contentIds[i], `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  offsets[apOffId] = pos;
  write(formXObject(apOffId, CHECK_SIZE, checkboxAppearanceStream(CHECK_SIZE, false)));
  offsets[apYesId] = pos;
  write(formXObject(apYesId, CHECK_SIZE, checkboxAppearanceStream(CHECK_SIZE, true)));

  const annotsByPage = pageContents.map(() => [] as number[]);
  for (let i = 0; i < c; i++) {
    annotsByPage[comments[i].pageIndex]?.push(commentIds[i]);
  }
  for (let i = 0; i < k; i++) {
    annotsByPage[checkboxes[i].pageIndex]?.push(widgetIds[i]);
  }

  for (let i = 0; i < n; i++) {
    const annots = annotsByPage[i];
    const annotsPart =
      annots.length > 0 ? ` /Annots [${annots.map((id) => `${id} 0 R`).join(" ")}]` : "";
    obj(
      pageIds[i],
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> /XObject << /ImLogo ${imageId} 0 R >> >>${annotsPart} >>`
    );
  }

  const kids = pageContents.map((_, i) => `${pageIds[i]} 0 R`).join(" ");
  obj(pagesId, `<< /Type /Pages /Count ${n} /Kids [${kids}] >>`);

  for (let i = 0; i < c; i++) {
    const note = comments[i];
    const destPage = pageIds[Math.min(note.pageIndex, n - 1)];
    obj(
      commentIds[i],
      `<< /Type /Annot /Subtype /Text /Name /Comment /Open false /F 4 /C [0.847 0.200 0.380] /Rect [${note.x.toFixed(2)} ${note.y.toFixed(2)} ${(note.x + 14).toFixed(2)} ${(note.y + 14).toFixed(2)}] /P ${destPage} 0 R /T ${pdfString(note.title)} /Contents ${pdfString(note.contents)} >>`
    );
  }

  for (let i = 0; i < k; i++) {
    const field = checkboxes[i];
    const destPage = pageIds[Math.min(field.pageIndex, n - 1)];
    const nAp = field.checked ? apYesId : apOffId;
    obj(
      widgetIds[i],
      `<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T ${pdfString(field.name)} /H /N /F 4 /P ${destPage} 0 R /Rect [${field.x.toFixed(2)} ${field.y.toFixed(2)} ${(field.x + field.size).toFixed(2)} ${(field.y + field.size).toFixed(2)}] /BS << /W 0 >> /MK << /BC [] /BG [] /CA () >> /AP << /N ${nAp} 0 R /D ${nAp} 0 R /R ${nAp} 0 R >> >>`
    );
  }

  const fieldRefs = widgetIds.map((id) => `${id} 0 R`).join(" ");
  obj(
    acroFormId,
    `<< /Fields [${fieldRefs}] /NeedAppearances false /DR << /Font << /Helv ${font1} 0 R /HeBo ${font2} 0 R >> >> >>`
  );

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
      const destPage = pageIds[Math.min(entry.pageIndex, n - 1)];
      parts.push(`/Dest [${destPage} 0 R /XYZ ${MARGIN_X} ${entry.y.toFixed(2)} 0]`);
      obj(entry.id, `<< ${parts.join(" ")} >>`);
    }
  }

  const outlinePart =
    assignedOutlines.length > 0 ? ` /Outlines ${outlineRootId} 0 R /PageMode /UseOutlines` : "";
  obj(
    catalogId,
    `<< /Type /Catalog /Pages ${pagesId} 0 R /AcroForm ${acroFormId} 0 R${outlinePart} >>`
  );

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

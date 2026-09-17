/** Gerador de PDF da checklist — layout Somos/Saber, checks clicáveis, campo manual e comentários. */

import { CHECKLIST_HEADER_JPEG_B64 } from "../assets/checklist-header-data";

const PAGE_W = 595.276;
const PAGE_H = 841.89;
const MARGIN_X = 56.693;
const HEADER_H = 132;
const CHECK_SIZE = 8.504;
const BAR_H = 14.173;
const BAR_W = 481.89;
const TITLE_DARK = "0.301 0.302 0.31";
const HEAD_GRAY = "0.475 0.482 0.492";
const TEXT_GRAY = "0.447 0.453 0.463";
const MUTED = "0.388 0.392 0.401";
const BAR_FILL = "0.862 0.866 0.871";
const MANUAL_FILL = "0.93 0.72 0.76";
const CORPROF = "0.932 0.239 0.589";
const FACA_CYAN = "0 0.702 0.942";
const CHECK_FILL = "0.810 0.816 0.823";
const LIMPAR_RECT = { x: 56.6929, y: 752.989, w: 43.2284, h: 47.518 };
const REVIEW_LINE = "Há conteúdo a ser avaliado";
const FIELD_GAP = 26;
const INSTRUCTIONS = [
  "Esta checklist deve ser preenchida inicialmente pelo(s) responsável(eis) do projeto e completada por qualquer um do time que venha a finalizar o processo.",
  "Será o documento de referência para atestar a qualidade e cercar possíveis erros que possam ser escalonados durante o processo de produção de arte.",
  "Este documento deve acompanhar o material em todos seus processos, inclusive depois do direcionado aos usuários finais.",
];

export interface ChecklistPdfItem {
  id?: string;
  section?: "GERAL" | "PROJETO GRÁFICO" | "CAPAS";
  label: string;
  checked: boolean;
  details?: string[];
  reviewKind?: "error" | "warning";
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
  warning: boolean;
}

interface CheckboxField {
  name: string;
  pageIndex: number;
  x: number;
  y: number;
  size: number;
  checked: boolean;
}

interface TextField {
  name: string;
  pageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PushButton {
  name: string;
  pageIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function sanitizePdfText(text: string): string {
  return (text || "")
    .replace(/[\u2013\u2014\u2212]/g, "-")
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

function textAt(x: number, y: number, size: number, font: "F1" | "F2" | "F3", color: string, value: string): string {
  return `BT /${font} ${size} Tf ${color} rg ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`;
}

function drawLabelLine(
  x: number,
  y: number,
  size: number,
  line: string,
  itemId: string | undefined,
  isFirst: boolean
): string {
  if (isFirst && (itemId === "corprof" || itemId === "faca")) {
    const parts = line.split(/(\s+)/);
    const first = parts[0] || "";
    const rest = parts.slice(1).join("");
    const color = itemId === "corprof" ? CORPROF : FACA_CYAN;
    const cmds = [textAt(x, y, size, "F1", color, first)];
    if (rest) {
      cmds.push(textAt(x + helveticaWidth(first, size), y, size, "F1", TEXT_GRAY, rest));
    }
    return cmds.join("\n");
  }
  return textAt(x, y, size, "F1", TEXT_GRAY, line);
}

function checkboxAppearanceStream(size: number, checked: boolean): string {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 0.15;
  const circle = `${CHECK_FILL} rg ${circlePath(cx, cy, r)} h f`;
  if (!checked) return circle;
  return [
    circle,
    `0.22 0.22 0.22 RG 1.35 w 1 J 1 j`,
    `${(cx - 2.15).toFixed(2)} ${(cy - 0.15).toFixed(2)} m`,
    `${(cx - 0.35).toFixed(2)} ${(cy - 2.05).toFixed(2)} l`,
    `${(cx + 2.45).toFixed(2)} ${(cy + 1.95).toFixed(2)} l S`,
  ].join(" ");
}

function formXObject(id: number, size: number, stream: string): string {
  return `${id} 0 obj\n<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 ${size} ${size}] /Matrix [1 0 0 1 0 0] /Resources << /ProcSet [/PDF] >> /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
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

function reviewDetails(item: ChecklistPdfItem): string[] {
  const details = (item.details || []).filter((line) => line.trim());
  if (item.checked || details.length === 0) return [];
  return details;
}

function itemBlockHeight(item: ChecklistPdfItem, itemWidth: number): number {
  const titleLines = wrapTextToWidth(item.label, 9, itemWidth);
  const hasReview = reviewDetails(item).length > 0;
  return titleLines.length * 11 + (hasReview ? 10 : 0) + 8;
}

function drawBackgroundCircles(): string {
  const xs = [14.173, 60.945, 107.716, 153.988, 201.553, 247.679, 295.512];
  const baseR = [19.84, 18.43, 17.01, 15.59, 14.17, 11.34, 8.5];
  const topY = 685.824;
  const stepY = 47.17;
  const rows = 8;
  const cmds: string[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < xs.length; col++) {
      const y = topY - row * stepY;
      if (y < 160) continue;
      const diag = (col / (xs.length - 1)) * 0.38 + (row / Math.max(rows - 1, 1)) * 0.72;
      const r = baseR[col] * (1 - row * 0.06);
      if (r < 5.5) continue;
      const gray = 0.948 + diag * 0.05;
      if (gray >= 0.992) continue;
      const g = gray.toFixed(3);
      cmds.push(`${g} ${g} ${g} rg ${circlePath(xs[col], y, r)} h f`);
    }
  }
  return cmds.join("\n");
}

function drawFooter(user: string, date: string): string {
  const cmds: string[] = [];
  const labels = ["Designer responsável", "Fechado por", "Data"];
  const values = [user || "", user || "", formatChecklistDate(date)];
  const xs = [56.693, 191.339, 325.984];
  cmds.push(textAt(xs[0], 80.286, 10, "F1", MUTED, labels[0]));
  cmds.push(textAt(xs[1], 80.286, 10, "F1", MUTED, labels[1]));
  cmds.push(textAt(xs[2], 80.286, 10, "F1", MUTED, labels[2]));
  for (let i = 0; i < 3; i++) {
    cmds.push(`0.862 0.866 0.871 rg ${xs[i].toFixed(3)} 57.226 127.043 14.173 re f`);
    cmds.push(textAt(xs[i] + 3, 61.2, 9, "F2", TITLE_DARK, values[i]));
  }
  return cmds.join("\n");
}

function buildPageContent(input: ChecklistPdfInput): {
  pages: string[];
  outlines: OutlineNode[];
  comments: CommentAnnot[];
  checkboxes: CheckboxField[];
  textFields: TextField[];
  buttons: PushButton[];
} {
  const pages: string[][] = [];
  const outlines: OutlineNode[] = [];
  const comments: CommentAnnot[] = [];
  const checkboxes: CheckboxField[] = [];
  const textFields: TextField[] = [];
  const buttons: PushButton[] = [];
  const textX = MARGIN_X + 13;
  const itemWidth = PAGE_W - textX - 36;
  let pageIndex = 0;
  let y = 694.66;

  const bottomLimit = (index: number): number => (index === 0 ? 36 : 108);

  const startPage = (index: number): string[] => {
    const cmds: string[] = [];
    if (index === 0) {
      cmds.push(drawBackgroundCircles());
      cmds.push(
        `q ${PAGE_W.toFixed(3)} 0 0 ${HEADER_H.toFixed(2)} 0 ${(PAGE_H - HEADER_H).toFixed(2)} cm /ImHeader Do Q`
      );
      buttons.push({
        name: "LimparFormulario",
        pageIndex: 0,
        x: LIMPAR_RECT.x,
        y: LIMPAR_RECT.y,
        w: LIMPAR_RECT.w,
        h: LIMPAR_RECT.h,
      });
    }
    return cmds;
  };

  pages.push(startPage(0));

  const currentCmds = (): string[] => pages[pageIndex];

  const newPage = (): void => {
    pageIndex += 1;
    pages.push(startPage(pageIndex));
    y = PAGE_H - 56;
  };

  const ensureSpace = (height: number): void => {
    if (y - height < bottomLimit(pageIndex)) newPage();
  };

  currentCmds().push(textAt(MARGIN_X, y, 13, "F2", TITLE_DARK, "CHECKLIST DESIGN"));
  y -= 28.2;
  currentCmds().push(textAt(MARGIN_X, y, 11, "F2", HEAD_GRAY, "INSTRUÇÕES DE PREENCHIMENTO E UTILIZAÇÃO"));
  y -= 14;
  for (const instruction of INSTRUCTIONS) {
    const lines = wrapTextToWidth(instruction, 9, PAGE_W - MARGIN_X * 2 - 12);
    currentCmds().push(textAt(MARGIN_X, y, 9, "F1", TEXT_GRAY, `${String.fromCharCode(149)} ${lines[0]}`));
    y -= 11;
    for (let i = 1; i < lines.length; i++) {
      currentCmds().push(textAt(MARGIN_X + 9, y, 9, "F1", TEXT_GRAY, lines[i]));
      y -= 11;
    }
    y -= 1.5;
  }

  y -= 8;
  currentCmds().push(textAt(MARGIN_X, y, 9, "F2", HEAD_GRAY, "TÍTULO DA OBRA"));
  y -= FIELD_GAP;
  currentCmds().push(`${BAR_FILL} rg ${MARGIN_X.toFixed(3)} ${y.toFixed(3)} ${BAR_W.toFixed(2)} ${BAR_H.toFixed(3)} re f`);
  const title = displayDocumentTitle(input.documentName);
  currentCmds().push(textAt(MARGIN_X + 3, y + 3.6, 9, "F2", TITLE_DARK, title));
  y -= 20;

  currentCmds().push(textAt(textX, y, 9, "F1", TEXT_GRAY, "Nomenclatura dos arquivos"));
  y -= 11;
  const nomenLines = wrapTextToWidth(
    "(CAE/Tipo de produto/Selo/Segmento/Ano/Caderno/Obra/Disciplina/Modulo/CAouMP) sempre nesta ordem e CAb.",
    9,
    PAGE_W - textX - MARGIN_X
  );
  for (const line of nomenLines) {
    currentCmds().push(textAt(textX, y, 9, "F1", TEXT_GRAY, line));
    y -= 11;
  }
  currentCmds().push(
    textAt(
      textX,
      y,
      9,
      "F1",
      MUTED,
      "Ex.: 987654_PG_AtEFAI1_APIS_HGC_PR; 987654_Capa_AnEM2C1_FGB_Geo_CA, etc"
    )
  );
  y -= FIELD_GAP;
  currentCmds().push(`${MANUAL_FILL} rg ${MARGIN_X.toFixed(3)} ${y.toFixed(3)} ${BAR_W.toFixed(2)} ${BAR_H.toFixed(3)} re f`);
  textFields.push({
    name: "NomenclaturaArquivos",
    pageIndex,
    x: MARGIN_X,
    y,
    w: BAR_W,
    h: BAR_H,
  });
  y -= 26;

  let lastSection = "";
  input.items.forEach((item, index) => {
    const section = item.section || "";
    if (section === "CAPAS" && pageIndex === 0) {
      newPage();
    }

    let blockH = itemBlockHeight(item, itemWidth);
    if (section && section !== lastSection) blockH += 22;
    ensureSpace(blockH);

    if (section && section !== lastSection) {
      y -= 4;
      currentCmds().push(textAt(MARGIN_X, y, 9, "F2", HEAD_GRAY, section));
      y -= 18;
      lastSection = section;
    }

    const details = reviewDetails(item);
    const titleLines = wrapTextToWidth(item.label, 9, itemWidth);
    const checkY = y - 1.2;
    checkboxes.push({
      name: `Item${String(index + 1).padStart(2, "0")}`,
      pageIndex,
      x: MARGIN_X,
      y: checkY,
      size: CHECK_SIZE,
      checked: item.checked,
    });

    const itemY = y;
    titleLines.forEach((line, lineIndex) => {
      currentCmds().push(drawLabelLine(textX, y, 9, line, item.id, lineIndex === 0));
      y -= 11;
    });

    if (details.length > 0) {
      currentCmds().push(textAt(textX, y, 7.5, "F2", CORPROF, REVIEW_LINE));
      y -= 10;
      outlines.push({
        title: item.label.slice(0, 80),
        pageIndex,
        y: itemY,
        children: details.map((line) => ({
          title: line.slice(0, 120),
          pageIndex,
          y: itemY,
          children: [],
        })),
      });
      comments.push({
        title: item.label.slice(0, 60),
        contents: details.join("\n\n"),
        pageIndex,
        x: PAGE_W - MARGIN_X - 16,
        y: itemY - 2,
        warning: item.reviewKind !== "error",
      });
    }

    y -= 6;
  });

  currentCmds().push(drawFooter(input.user, input.date));

  return {
    pages: pages.map((cmds) => cmds.join("\n")),
    outlines,
    comments,
    checkboxes,
    textFields,
    buttons,
  };
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

function jpegImageObj(id: number, bytes: Uint8Array, size: { w: number; h: number }): string {
  return `${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${size.w} /Height ${size.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`;
}

export function buildChecklistPdf(input: ChecklistPdfInput): Uint8Array {
  const headerBytes = decodeBase64(CHECKLIST_HEADER_JPEG_B64);
  const headerSize = jpegSize(headerBytes);
  const { pages: pageContents, outlines, comments, checkboxes, textFields, buttons } = buildPageContent(input);
  const n = pageContents.length;
  const c = comments.length;
  const k = checkboxes.length;
  const t = textFields.length;
  const b = buttons.length;

  let nextId = 1;
  const font1 = nextId++;
  const font2 = nextId++;
  const headerImageId = nextId++;
  const limparFormId = nextId++;
  const contentIds = Array.from({ length: n }, () => nextId++);
  const pageIds = Array.from({ length: n }, () => nextId++);
  const pagesId = nextId++;
  const commentIds = Array.from({ length: c }, () => nextId++);
  const apOffId = nextId++;
  const apYesId = nextId++;
  const widgetIds = Array.from({ length: k }, () => nextId++);
  const textWidgetIds = Array.from({ length: t }, () => nextId++);
  const buttonWidgetIds = Array.from({ length: b }, () => nextId++);
  const resetActionId = nextId++;
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

  offsets[headerImageId] = pos;
  write(jpegImageObj(headerImageId, headerBytes, headerSize));
  write(headerBytes);
  write("\nendstream\nendobj\n");

  const limparStream = "q Q";
  offsets[limparFormId] = pos;
  write(
    `${limparFormId} 0 obj\n<< /Type /XObject /Subtype /Form /FormType 1 /BBox [0 0 ${LIMPAR_RECT.w.toFixed(4)} ${LIMPAR_RECT.h.toFixed(3)}] /Resources << /ProcSet [/PDF] >> /Length ${limparStream.length} >>\nstream\n${limparStream}\nendstream\nendobj\n`
  );

  for (let i = 0; i < n; i++) {
    const stream = pageContents[i];
    obj(contentIds[i], `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  offsets[apOffId] = pos;
  write(formXObject(apOffId, CHECK_SIZE, checkboxAppearanceStream(CHECK_SIZE, false)));
  offsets[apYesId] = pos;
  write(formXObject(apYesId, CHECK_SIZE, checkboxAppearanceStream(CHECK_SIZE, true)));

  const annotsByPage = pageContents.map(() => [] as number[]);
  for (let i = 0; i < c; i++) annotsByPage[comments[i].pageIndex]?.push(commentIds[i]);
  for (let i = 0; i < k; i++) annotsByPage[checkboxes[i].pageIndex]?.push(widgetIds[i]);
  for (let i = 0; i < t; i++) annotsByPage[textFields[i].pageIndex]?.push(textWidgetIds[i]);
  for (let i = 0; i < b; i++) annotsByPage[buttons[i].pageIndex]?.push(buttonWidgetIds[i]);

  for (let i = 0; i < n; i++) {
    const annots = annotsByPage[i];
    const annotsPart = annots.length > 0 ? ` /Annots [${annots.map((id) => `${id} 0 R`).join(" ")}]` : "";
    const xobjects =
      i === 0
        ? `/XObject << /ImHeader ${headerImageId} 0 R >>`
        : "/XObject << >>";
    obj(
      pageIds[i],
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> ${xobjects} >>${annotsPart} >>`
    );
  }

  const kids = pageContents.map((_, i) => `${pageIds[i]} 0 R`).join(" ");
  obj(pagesId, `<< /Type /Pages /Count ${n} /Kids [${kids}] >>`);

  for (let i = 0; i < c; i++) {
    const note = comments[i];
    const destPage = pageIds[Math.min(note.pageIndex, n - 1)];
    obj(
      commentIds[i],
      `<< /Type /Annot /Subtype /Text /Name /Comment /Open false /F 4 /C [${note.warning ? "0.95 0.72 0.18" : "0.847 0.200 0.380"}] /Rect [${note.x.toFixed(2)} ${note.y.toFixed(2)} ${(note.x + 14).toFixed(2)} ${(note.y + 14).toFixed(2)}] /P ${destPage} 0 R /T ${pdfString(note.title)} /Contents ${pdfString(note.contents)} >>`
    );
  }

  for (let i = 0; i < k; i++) {
    const field = checkboxes[i];
    const destPage = pageIds[Math.min(field.pageIndex, n - 1)];
    const state = field.checked ? "/Yes" : "/Off";
    obj(
      widgetIds[i],
      `<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 0 /T ${pdfString(field.name)} /V ${state} /DV /Off /AS ${state} /H /P /F 4 /P ${destPage} 0 R /Rect [${field.x.toFixed(2)} ${field.y.toFixed(2)} ${(field.x + field.size).toFixed(2)} ${(field.y + field.size).toFixed(2)}] /MK << /BG [0.81 0.816 0.823] /BC [] /CA () >> /BS << /W 0 /S /S >> /AP << /N << /Yes ${apYesId} 0 R /Off ${apOffId} 0 R >> /D << /Yes ${apYesId} 0 R /Off ${apOffId} 0 R >> >> >>`
    );
  }

  for (let i = 0; i < t; i++) {
    const field = textFields[i];
    const destPage = pageIds[Math.min(field.pageIndex, n - 1)];
    obj(
      textWidgetIds[i],
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T ${pdfString(field.name)} /V () /DV () /F 4 /Ff 0 /Q 0 /DA (/Helv 9 Tf 0.278 0.281 0.277 rg) /MK << /BG [0.93 0.72 0.76] /BC [] >> /BS << /W 0 /S /S >> /P ${destPage} 0 R /Rect [${field.x.toFixed(2)} ${field.y.toFixed(2)} ${(field.x + field.w).toFixed(2)} ${(field.y + field.h).toFixed(2)}] >>`
    );
  }

  obj(resetActionId, "<< /Type /Action /S /ResetForm /Flags 1 /Fields [] >>");

  for (let i = 0; i < b; i++) {
    const field = buttons[i];
    const destPage = pageIds[Math.min(field.pageIndex, n - 1)];
    obj(
      buttonWidgetIds[i],
      `<< /Type /Annot /Subtype /Widget /FT /Btn /Ff 65536 /T ${pdfString(field.name)} /H /N /F 4 /P ${destPage} 0 R /A ${resetActionId} 0 R /Rect [${field.x.toFixed(2)} ${field.y.toFixed(2)} ${(field.x + field.w).toFixed(2)} ${(field.y + field.h).toFixed(2)}] /MK << /BC [] /BG [] /TP 1 >> /Border [0 0 0] /AP << /N ${limparFormId} 0 R >> >>`
    );
  }

  const fieldRefs = [
    ...widgetIds,
    ...textWidgetIds,
    ...buttonWidgetIds,
  ]
    .map((id) => `${id} 0 R`)
    .join(" ");
  obj(
    acroFormId,
    `<< /Fields [${fieldRefs}] /NeedAppearances true /DR << /Font << /Helv ${font1} 0 R /HeBo ${font2} 0 R >> >> >>`
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
  obj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R /AcroForm ${acroFormId} 0 R${outlinePart} >>`);

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

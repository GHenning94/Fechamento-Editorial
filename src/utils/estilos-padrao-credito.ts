import type { ParagraphStyle } from "indesign";
import { ACCEPTED_PROFESSOR_LANGUAGES } from "./constants";
import { getInDesignModule } from "./indesign-runtime";

export const CREDITO_STYLE_NAME = "05_Credito";

const MM_TO_PT = 72 / 25.4;

const CREDITO_PROFILE = {
  fontFamily: "Univers LT Std",
  fontStyleIncludes: "45 Light",
  pointSizePt: 5,
  autoLeadingPct: 115,
  hyphenationZonePt: 7.408 * MM_TO_PT,
  spaceBeforePt: 0,
  spaceAfterPt: 4.233 * MM_TO_PT,
  leftIndentPt: 0,
  acceptedLanguages: ACCEPTED_PROFESSOR_LANGUAGES,
} as const;

const SIZE_TOLERANCE_PT = 0.25;
const SPACING_TOLERANCE_PT = 0.35;

export interface StylePropertyIssue {
  property: string;
  expected: string;
  actual: string;
}

function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function normalizeLanguageName(name: string): string {
  return name.trim().replace(/\s*:\s*/g, ": ");
}

function isAcceptedLanguage(languageName: string): boolean {
  const normalized = normalizeLanguageName(languageName).toLowerCase();
  return CREDITO_PROFILE.acceptedLanguages.some(
    (entry) => normalizeLanguageName(entry).toLowerCase() === normalized
  );
}

function isObliqueFontStyle(fontStyle: string): boolean {
  return /oblique|itálico|italico|italic/i.test(fontStyle);
}

function readFontInfo(style: ParagraphStyle): { fontFamily: string; fontStyle: string } {
  try {
    const font = style.appliedFont;
    if (!font || typeof font !== "object") {
      return { fontFamily: String(font || ""), fontStyle: "" };
    }
    return {
      fontFamily: font.fontFamily || font.name || "",
      fontStyle: font.fontStyleName || font.name || "",
    };
  } catch {
    return { fontFamily: "", fontStyle: "" };
  }
}

function isAutoLeadingValue(leading: number): boolean {
  try {
    const { Leading } = getInDesignModule();
    const L = Leading as { AUTO?: number };
    if (typeof L.AUTO === "number" && leading === L.AUTO) return true;
  } catch {
    // ignore
  }
  return leading === 1635019116;
}

function isCenterAlign(justification: number): boolean {
  try {
    const { Justification } = getInDesignModule();
    const J = Justification as { CENTER_ALIGN?: number; CENTER_JUSTIFIED?: number };
    if (typeof J.CENTER_ALIGN === "number" && justification === J.CENTER_ALIGN) return true;
    if (typeof J.CENTER_JUSTIFIED === "number" && justification === J.CENTER_JUSTIFIED) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function readNumberProperty(
  style: ParagraphStyle,
  property: keyof ParagraphStyle,
  label: string
): { value: number | null; issue: StylePropertyIssue | null } {
  try {
    const raw = style[property];
    if (typeof raw !== "number" || Number.isNaN(raw)) {
      return {
        value: null,
        issue: { property: label, expected: "Valor numérico", actual: "Não foi possível ler" },
      };
    }
    return { value: raw, issue: null };
  } catch {
    return {
      value: null,
      issue: { property: label, expected: "Valor numérico", actual: "Não foi possível ler" },
    };
  }
}

function pushIssue(issues: StylePropertyIssue[], issue: StylePropertyIssue | null): void {
  if (issue) issues.push(issue);
}

export function compareCreditoStyle(style: ParagraphStyle): StylePropertyIssue[] {
  const issues: StylePropertyIssue[] = [];
  const { fontFamily, fontStyle } = readFontInfo(style);

  if (!fontFamily.includes(CREDITO_PROFILE.fontFamily)) {
    issues.push({
      property: "Fonte",
      expected: CREDITO_PROFILE.fontFamily,
      actual: fontFamily || "Não definida",
    });
  }

  if (!fontStyle.includes(CREDITO_PROFILE.fontStyleIncludes)) {
    issues.push({
      property: "Estilo da fonte",
      expected: CREDITO_PROFILE.fontStyleIncludes,
      actual: fontStyle || "Não definido",
    });
  } else if (isObliqueFontStyle(fontStyle)) {
    issues.push({
      property: "Estilo da fonte",
      expected: CREDITO_PROFILE.fontStyleIncludes,
      actual: fontStyle,
    });
  }

  const pointSize = readNumberProperty(style, "pointSize", "Tamanho");
  pushIssue(issues, pointSize.issue);
  if (
    pointSize.value !== null &&
    !approxEqual(pointSize.value, CREDITO_PROFILE.pointSizePt, SIZE_TOLERANCE_PT)
  ) {
    issues.push({
      property: "Tamanho",
      expected: `${CREDITO_PROFILE.pointSizePt} pt`,
      actual: `${pointSize.value} pt`,
    });
  }

  const leading = readNumberProperty(style, "leading", "Entrelinha");
  pushIssue(issues, leading.issue);
  if (leading.value !== null && !isAutoLeadingValue(leading.value)) {
    issues.push({
      property: "Entrelinha",
      expected: "Automática",
      actual: `${leading.value} pt`,
    });
  }

  const autoLeading = readNumberProperty(style, "autoLeading", "Entrelinha automática");
  pushIssue(issues, autoLeading.issue);
  if (
    autoLeading.value !== null &&
    !approxEqual(autoLeading.value, CREDITO_PROFILE.autoLeadingPct, 1)
  ) {
    issues.push({
      property: "Entrelinha automática",
      expected: `${CREDITO_PROFILE.autoLeadingPct}%`,
      actual: `${autoLeading.value}%`,
    });
  }

  try {
    if (!isCenterAlign(style.justification)) {
      issues.push({
        property: "Alinhamento",
        expected: "Centralizado",
        actual: String(style.justification),
      });
    }
  } catch {
    issues.push({
      property: "Alinhamento",
      expected: "Centralizado",
      actual: "Não foi possível ler",
    });
  }

  const leftIndent = readNumberProperty(style, "leftIndent", "Recuo à esquerda");
  pushIssue(issues, leftIndent.issue);
  if (
    leftIndent.value !== null &&
    !approxEqual(leftIndent.value, CREDITO_PROFILE.leftIndentPt, SPACING_TOLERANCE_PT)
  ) {
    issues.push({
      property: "Recuo à esquerda",
      expected: "0 mm",
      actual: `${leftIndent.value}`,
    });
  }

  try {
    const languageName = style.appliedLanguage?.name || "";
    if (!isAcceptedLanguage(languageName)) {
      issues.push({
        property: "Idioma",
        expected: CREDITO_PROFILE.acceptedLanguages.join(" ou "),
        actual: languageName || "Não definido",
      });
    }
  } catch {
    issues.push({
      property: "Idioma",
      expected: CREDITO_PROFILE.acceptedLanguages.join(" ou "),
      actual: "Não foi possível ler",
    });
  }

  const hyphenationZone = readNumberProperty(style, "hyphenationZone", "Zona de hifenização");
  pushIssue(issues, hyphenationZone.issue);
  if (
    hyphenationZone.value !== null &&
    !approxEqual(hyphenationZone.value, CREDITO_PROFILE.hyphenationZonePt, SPACING_TOLERANCE_PT)
  ) {
    issues.push({
      property: "Zona de hifenização",
      expected: "7,408 mm",
      actual: `${hyphenationZone.value}`,
    });
  }

  const spaceBefore = readNumberProperty(style, "spaceBefore", "Espaço anterior");
  pushIssue(issues, spaceBefore.issue);
  if (
    spaceBefore.value !== null &&
    !approxEqual(spaceBefore.value, CREDITO_PROFILE.spaceBeforePt, SPACING_TOLERANCE_PT)
  ) {
    issues.push({
      property: "Espaço anterior",
      expected: "0 mm",
      actual: `${spaceBefore.value}`,
    });
  }

  const spaceAfter = readNumberProperty(style, "spaceAfter", "Espaço posterior");
  pushIssue(issues, spaceAfter.issue);
  if (
    spaceAfter.value !== null &&
    !approxEqual(spaceAfter.value, CREDITO_PROFILE.spaceAfterPt, SPACING_TOLERANCE_PT)
  ) {
    issues.push({
      property: "Espaço posterior",
      expected: "4,233 mm",
      actual: `${spaceAfter.value}`,
    });
  }

  return issues;
}

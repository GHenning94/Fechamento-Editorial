import type { ParagraphStyle } from "indesign";
import { ACCEPTED_PROFESSOR_LANGUAGES } from "./constants";
import { getInDesignModule } from "./indesign-runtime";
import type { MaterialSegment } from "./material-type";

export const FONTE_STANDARD_STYLE_NAMES = [
  "05_grafico_fonte",
  "05_mapa_fonte",
  "08_tabela_fonte",
] as const;

const MM_TO_PT = 72 / 25.4;

type JustificationExpectation = "right";

interface FonteStyleProfile {
  fontFamily: string;
  fontStyleIncludes: string;
  leadingPt: number;
  autoLeadingPct: number;
  hyphenationZonePt: number;
  spaceBeforePt?: number;
  spaceAfterPt: number;
  leftIndentPt: number;
  leftIndentLabel: string;
  justification?: JustificationExpectation;
  acceptedLanguages: readonly string[];
}

const SHARED_FONTE_BASE = {
  fontFamily: "Univers LT Std",
  fontStyleIncludes: "45 Light",
  leadingPt: 7,
  autoLeadingPct: 115,
  hyphenationZonePt: 7.408 * MM_TO_PT,
  acceptedLanguages: ACCEPTED_PROFESSOR_LANGUAGES,
} as const;

const FONTE_STYLE_PROFILES: Record<(typeof FONTE_STANDARD_STYLE_NAMES)[number], FonteStyleProfile> = {
  "05_grafico_fonte": {
    ...SHARED_FONTE_BASE,
    spaceBeforePt: 2.117 * MM_TO_PT,
    spaceAfterPt: 4.233 * MM_TO_PT,
    leftIndentPt: 0,
    leftIndentLabel: "0 mm",
    justification: "right",
  },
  "05_mapa_fonte": {
    ...SHARED_FONTE_BASE,
    spaceBeforePt: 2.117 * MM_TO_PT,
    spaceAfterPt: 3.528 * MM_TO_PT,
    leftIndentPt: 0,
    leftIndentLabel: "0 mm",
    justification: "right",
  },
  "08_tabela_fonte": {
    ...SHARED_FONTE_BASE,
    spaceAfterPt: 4.233 * MM_TO_PT,
    leftIndentPt: 99.907 * MM_TO_PT,
    leftIndentLabel: "99,907 mm",
  },
};

const SEGMENT_POINT_SIZE_PT: Record<MaterialSegment, readonly number[]> = {
  EM: [6, 7],
  EF2: [7, 8],
  EF1: [8, 9],
  PV: [6, 7],
};

const SEGMENT_SIZE_LABEL: Record<MaterialSegment, string> = {
  EM: "6 pt ou 7 pt",
  EF2: "7 pt ou 8 pt",
  EF1: "8 pt ou 9 pt",
  PV: "6 pt ou 7 pt",
};

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

function isAcceptedPointSize(segment: MaterialSegment, pointSize: number): boolean {
  return SEGMENT_POINT_SIZE_PT[segment].some((size) =>
    approxEqual(pointSize, size, SIZE_TOLERANCE_PT)
  );
}

export function getExpectedFontePointSizeLabel(segment: MaterialSegment): string {
  return SEGMENT_SIZE_LABEL[segment];
}

function normalizeLanguageName(name: string): string {
  return name.trim().replace(/\s*:\s*/g, ": ");
}

function isAcceptedLanguage(languageName: string, accepted: readonly string[]): boolean {
  const normalized = normalizeLanguageName(languageName).toLowerCase();
  return accepted.some((entry) => normalizeLanguageName(entry).toLowerCase() === normalized);
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

function isRightAlign(justification: number): boolean {
  try {
    const { Justification } = getInDesignModule();
    const J = Justification as { RIGHT_ALIGN?: number; RIGHT_JUSTIFIED?: number };
    if (typeof J.RIGHT_ALIGN === "number" && justification === J.RIGHT_ALIGN) return true;
    if (typeof J.RIGHT_JUSTIFIED === "number" && justification === J.RIGHT_JUSTIFIED) return true;
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

export function compareFonteStyle(
  style: ParagraphStyle,
  options: { segment: MaterialSegment | null; validateSize: boolean }
): StylePropertyIssue[] {
  const styleName = style.name as (typeof FONTE_STANDARD_STYLE_NAMES)[number];
  const profile = FONTE_STYLE_PROFILES[styleName];
  if (!profile) return [];

  const issues: StylePropertyIssue[] = [];
  const { fontFamily, fontStyle } = readFontInfo(style);

  if (!fontFamily.includes(profile.fontFamily)) {
    issues.push({
      property: "Fonte",
      expected: profile.fontFamily,
      actual: fontFamily || "Não definida",
    });
  }

  if (!fontStyle.includes(profile.fontStyleIncludes)) {
    issues.push({
      property: "Estilo da fonte",
      expected: profile.fontStyleIncludes,
      actual: fontStyle || "Não definido",
    });
  } else if (isObliqueFontStyle(fontStyle)) {
    issues.push({
      property: "Estilo da fonte",
      expected: profile.fontStyleIncludes,
      actual: fontStyle,
    });
  }

  if (options.validateSize && options.segment) {
    const pointSize = readNumberProperty(style, "pointSize", "Tamanho");
    pushIssue(issues, pointSize.issue);
    if (
      pointSize.value !== null &&
      !isAcceptedPointSize(options.segment, pointSize.value)
    ) {
      issues.push({
        property: "Tamanho",
        expected: getExpectedFontePointSizeLabel(options.segment),
        actual: `${pointSize.value} pt`,
      });
    }
  }

  const leading = readNumberProperty(style, "leading", "Entrelinha");
  pushIssue(issues, leading.issue);
  if (leading.value !== null && !approxEqual(leading.value, profile.leadingPt, SIZE_TOLERANCE_PT)) {
    issues.push({
      property: "Entrelinha",
      expected: `${profile.leadingPt} pt`,
      actual: `${leading.value} pt`,
    });
  }

  const autoLeading = readNumberProperty(style, "autoLeading", "Entrelinha automática");
  pushIssue(issues, autoLeading.issue);
  if (
    autoLeading.value !== null &&
    !approxEqual(autoLeading.value, profile.autoLeadingPct, 1)
  ) {
    issues.push({
      property: "Entrelinha automática",
      expected: `${profile.autoLeadingPct}%`,
      actual: `${autoLeading.value}%`,
    });
  }

  if (profile.justification === "right") {
    try {
      if (!isRightAlign(style.justification)) {
        issues.push({
          property: "Alinhamento",
          expected: "À direita",
          actual: String(style.justification),
        });
      }
    } catch {
      issues.push({
        property: "Alinhamento",
        expected: "À direita",
        actual: "Não foi possível ler",
      });
    }
  }

  const leftIndent = readNumberProperty(style, "leftIndent", "Recuo à esquerda");
  pushIssue(issues, leftIndent.issue);
  if (
    leftIndent.value !== null &&
    !approxEqual(leftIndent.value, profile.leftIndentPt, SPACING_TOLERANCE_PT)
  ) {
    issues.push({
      property: "Recuo à esquerda",
      expected: profile.leftIndentLabel,
      actual: `${leftIndent.value}`,
    });
  }

  try {
    const languageName = style.appliedLanguage?.name || "";
    if (!isAcceptedLanguage(languageName, profile.acceptedLanguages)) {
      issues.push({
        property: "Idioma",
        expected: profile.acceptedLanguages.join(" ou "),
        actual: languageName || "Não definido",
      });
    }
  } catch {
    issues.push({
      property: "Idioma",
      expected: profile.acceptedLanguages.join(" ou "),
      actual: "Não foi possível ler",
    });
  }

  const hyphenationZone = readNumberProperty(style, "hyphenationZone", "Zona de hifenização");
  pushIssue(issues, hyphenationZone.issue);
  if (
    hyphenationZone.value !== null &&
    !approxEqual(hyphenationZone.value, profile.hyphenationZonePt, SPACING_TOLERANCE_PT)
  ) {
    issues.push({
      property: "Zona de hifenização",
      expected: "7,408 mm",
      actual: `${hyphenationZone.value}`,
    });
  }

  if (profile.spaceBeforePt !== undefined) {
    const spaceBefore = readNumberProperty(style, "spaceBefore", "Espaço anterior");
    pushIssue(issues, spaceBefore.issue);
    if (
      spaceBefore.value !== null &&
      !approxEqual(spaceBefore.value, profile.spaceBeforePt, SPACING_TOLERANCE_PT)
    ) {
      issues.push({
        property: "Espaço anterior",
        expected: "2,117 mm",
        actual: `${spaceBefore.value}`,
      });
    }
  }

  const spaceAfter = readNumberProperty(style, "spaceAfter", "Espaço posterior");
  pushIssue(issues, spaceAfter.issue);
  if (
    spaceAfter.value !== null &&
    !approxEqual(spaceAfter.value, profile.spaceAfterPt, SPACING_TOLERANCE_PT)
  ) {
    const expectedAfter =
      styleName === "05_mapa_fonte" ? "3,528 mm" : "4,233 mm";
    issues.push({
      property: "Espaço posterior",
      expected: expectedAfter,
      actual: `${spaceAfter.value}`,
    });
  }

  return issues;
}

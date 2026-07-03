import type { ParagraphStyle } from "indesign";
import { ACCEPTED_PROFESSOR_LANGUAGES, COLOR_CORPROF } from "./constants";
import { getInDesignModule } from "./indesign-runtime";
import type { MaterialSegment } from "./material-type";

export const PROFESSOR_STANDARD_STYLE_NAMES = [
  "04_professor_resposta",
  "04_professor_comentario",
  "04_professor_roteiroCD",
  "04_proposta_didatica",
  "04_proposta_didatica_citado",
  "04_proposta_citado_fonte",
] as const;

export const PROFESSOR_REQUIRED_STYLE_NAME = "04_professor_resposta";

const MM_TO_PT = 72 / 25.4;

type LeadingMode = "fixed" | "auto";
type JustificationExpectation = "right";

const EFAI_POINT_SIZE_PT = 12;

interface ProfessorStyleProfile {
  fontFamily: string;
  fontStyleIncludes?: string;
  oblique?: boolean;
  pointSizeEfAfPt: number;
  leadingMode: LeadingMode;
  leadingPt?: number;
  autoLeadingPct: number;
  leftIndentPt: number;
  leftIndentLabel: string;
  fillColor: string;
  justification?: JustificationExpectation;
  hyphenationZonePt: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  overprintFill: boolean;
  acceptedLanguages: readonly string[];
}

const SHARED_SPACING = {
  autoLeadingPct: 115,
  hyphenationZonePt: 7.408 * MM_TO_PT,
  spaceBeforePt: 2.117 * MM_TO_PT,
  spaceAfterPt: 3.528 * MM_TO_PT,
} as const;

const DEFAULT_PROFESSOR_PROFILE: ProfessorStyleProfile = {
  fontFamily: "Univers LT Std",
  fontStyleIncludes: "45 Light",
  pointSizeEfAfPt: 8,
  leadingMode: "fixed",
  leadingPt: 9.2,
  autoLeadingPct: SHARED_SPACING.autoLeadingPct,
  leftIndentPt: 0,
  leftIndentLabel: "0 mm",
  fillColor: COLOR_CORPROF,
  hyphenationZonePt: SHARED_SPACING.hyphenationZonePt,
  spaceBeforePt: SHARED_SPACING.spaceBeforePt,
  spaceAfterPt: SHARED_SPACING.spaceAfterPt,
  overprintFill: true,
  acceptedLanguages: ACCEPTED_PROFESSOR_LANGUAGES,
};

const PROFESSOR_STYLE_PROFILES: Record<string, Partial<ProfessorStyleProfile>> = {
  "04_professor_roteiroCD": {
    fontStyleIncludes: "45 Light Oblique",
    oblique: true,
    pointSizeEfAfPt: 9,
    leadingMode: "auto",
    leadingPt: undefined,
  },
  "04_proposta_didatica_citado": {
    fontFamily: "ITC Garamond Std",
    fontStyleIncludes: undefined,
    leadingMode: "auto",
    leadingPt: undefined,
    leftIndentPt: 12.506 * MM_TO_PT,
    leftIndentLabel: "12,506 mm",
  },
  "04_proposta_citado_fonte": {
    fontFamily: "ITC Garamond Std",
    fontStyleIncludes: undefined,
    pointSizeEfAfPt: 7,
    leadingMode: "auto",
    leadingPt: undefined,
    justification: "right",
  },
};

const SIZE_TOLERANCE_PT = 0.25;
const SPACING_TOLERANCE_PT = 0.35;

export interface StylePropertyIssue {
  property: string;
  expected: string;
  actual: string;
}

function getStyleProfile(styleName: string): ProfessorStyleProfile {
  const override = PROFESSOR_STYLE_PROFILES[styleName];
  if (!override) return DEFAULT_PROFESSOR_PROFILE;
  return { ...DEFAULT_PROFESSOR_PROFILE, ...override };
}

export function getExpectedProfessorPointSize(
  styleName: string,
  segment: MaterialSegment
): number {
  if (segment === "EF1") return EFAI_POINT_SIZE_PT;
  return getStyleProfile(styleName).pointSizeEfAfPt;
}

function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
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

function readFillColorName(style: ParagraphStyle): string {
  try {
    const fill = style.fillColor;
    return fill && fill.isValid ? fill.name || "" : "";
  } catch {
    return "";
  }
}

function isOpticalKerning(value: number): boolean {
  try {
    const { KerningMethod } = getInDesignModule();
    const KM = KerningMethod as { OPTICAL?: number };
    if (typeof KM.OPTICAL === "number" && value === KM.OPTICAL) {
      return true;
    }
  } catch {
    // ignore
  }

  return value === 1851876449;
}

function isAutoLeadingValue(leading: number): boolean {
  try {
    const { Leading } = getInDesignModule();
    const L = Leading as { AUTO?: number };
    if (typeof L.AUTO === "number" && leading === L.AUTO) {
      return true;
    }
  } catch {
    // ignore
  }

  return leading === 1635019116;
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
        issue: {
          property: label,
          expected: "Valor numérico",
          actual: "Não foi possível ler",
        },
      };
    }
    return { value: raw, issue: null };
  } catch {
    return {
      value: null,
      issue: {
        property: label,
        expected: "Valor numérico",
        actual: "Não foi possível ler",
      },
    };
  }
}

function validateFontStyle(
  profile: ProfessorStyleProfile,
  fontStyle: string
): StylePropertyIssue | null {
  if (!profile.fontStyleIncludes) return null;

  if (profile.oblique) {
    if (!fontStyle.includes(profile.fontStyleIncludes) || !isObliqueFontStyle(fontStyle)) {
      return {
        property: "Estilo da fonte",
        expected: profile.fontStyleIncludes,
        actual: fontStyle || "Não definido",
      };
    }
    return null;
  }

  if (!fontStyle.includes(profile.fontStyleIncludes)) {
    return {
      property: "Estilo da fonte",
      expected: profile.fontStyleIncludes,
      actual: fontStyle || "Não definido",
    };
  }

  if (isObliqueFontStyle(fontStyle)) {
    return {
      property: "Estilo da fonte",
      expected: profile.fontStyleIncludes,
      actual: fontStyle,
    };
  }

  return null;
}

function pushIssue(issues: StylePropertyIssue[], issue: StylePropertyIssue | null): void {
  if (issue) issues.push(issue);
}

export function compareProfessorStyle(
  style: ParagraphStyle,
  options: { segment: MaterialSegment | null; validateSize: boolean }
): StylePropertyIssue[] {
  const issues: StylePropertyIssue[] = [];
  const profile = getStyleProfile(style.name);
  const { fontFamily, fontStyle } = readFontInfo(style);

  if (!fontFamily.includes(profile.fontFamily)) {
    issues.push({
      property: "Fonte",
      expected: profile.fontFamily,
      actual: fontFamily || "Não definida",
    });
  }

  pushIssue(issues, validateFontStyle(profile, fontStyle));

  if (options.validateSize && options.segment) {
    const expectedPointSize = getExpectedProfessorPointSize(style.name, options.segment);
    const pointSize = readNumberProperty(style, "pointSize", "Tamanho");
    pushIssue(issues, pointSize.issue);
    if (pointSize.value !== null && !approxEqual(pointSize.value, expectedPointSize, SIZE_TOLERANCE_PT)) {
      issues.push({
        property: "Tamanho",
        expected: `${expectedPointSize} pt`,
        actual: `${pointSize.value} pt`,
      });
    }
  }

  const leading = readNumberProperty(style, "leading", "Entrelinha");
  pushIssue(issues, leading.issue);
  if (leading.value !== null) {
    if (profile.leadingMode === "fixed") {
      const expectedLeading = profile.leadingPt ?? DEFAULT_PROFESSOR_PROFILE.leadingPt!;
      if (!approxEqual(leading.value, expectedLeading, SIZE_TOLERANCE_PT)) {
        issues.push({
          property: "Entrelinha",
          expected: `${expectedLeading} pt`,
          actual: `${leading.value} pt`,
        });
      }
    } else if (!isAutoLeadingValue(leading.value)) {
      issues.push({
        property: "Entrelinha",
        expected: "Automática",
        actual: `${leading.value} pt`,
      });
    }
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

  const fillColorName = readFillColorName(style);
  if (fillColorName !== profile.fillColor) {
    issues.push({
      property: "Cor",
      expected: profile.fillColor,
      actual: fillColorName || "Não definida",
    });
  }

  try {
    if (!isOpticalKerning(style.kerningMethod)) {
      issues.push({
        property: "Kerning",
        expected: "Óptico",
        actual: String(style.kerningMethod),
      });
    }
  } catch {
    issues.push({
      property: "Kerning",
      expected: "Óptico",
      actual: "Não foi possível ler",
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

  const spaceAfter = readNumberProperty(style, "spaceAfter", "Espaço posterior");
  pushIssue(issues, spaceAfter.issue);
  if (
    spaceAfter.value !== null &&
    !approxEqual(spaceAfter.value, profile.spaceAfterPt, SPACING_TOLERANCE_PT)
  ) {
    issues.push({
      property: "Espaço posterior",
      expected: "3,528 mm",
      actual: `${spaceAfter.value}`,
    });
  }

  try {
    if (style.overprintFill !== profile.overprintFill) {
      issues.push({
        property: "Superimposição",
        expected: "Ativada",
        actual: style.overprintFill ? "Ativada" : "Desativada",
      });
    }
  } catch {
    issues.push({
      property: "Superimposição",
      expected: "Ativada",
      actual: "Não foi possível ler",
    });
  }

  return issues;
}

export function getEfAiSizeHint(_styleName: string): string {
  return ` Para EF1/EFAI, o corpo deve ser ${EFAI_POINT_SIZE_PT} pt.`;
}

/** Lista das propriedades validadas em todo estilo padrão de professor. */
export const PROFESSOR_VALIDATED_PROPERTIES = [
  "Fonte",
  "Estilo da fonte",
  "Tamanho",
  "Entrelinha",
  "Entrelinha automática",
  "Recuo à esquerda",
  "Cor",
  "Kerning",
  "Alinhamento",
  "Idioma",
  "Zona de hifenização",
  "Espaço anterior",
  "Espaço posterior",
  "Superimposição",
] as const;

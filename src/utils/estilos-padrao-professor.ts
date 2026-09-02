import type { ParagraphStyle } from "indesign";
import { ACCEPTED_PROFESSOR_LANGUAGES, COLOR_CORPROF } from "./constants";
import type { MaterialSegment } from "./material-type";
import {
  SIZE_TOLERANCE_PT,
  StylePropertyIssue,
  approxEqual,
  compareSpacingMm,
  formatLeadingActual,
  formatMm,
  isAcceptedLanguage,
  isAutoLeadingValue,
  isObliqueFontStyle,
  isOpticalKerning,
  pushIssue,
  readFontInfo,
  readNumberProperty,
} from "./style-property-compare";

export type { StylePropertyIssue };

export const PROFESSOR_STANDARD_STYLE_NAMES = [
  "04_professor_resposta",
  "04_professor_comentario",
  "04_professor_roteiroCD",
  "04_proposta_didatica",
  "04_proposta_didatica_citado",
  "04_proposta_citado_fonte",
] as const;

export const PROFESSOR_REQUIRED_STYLE_NAME = "04_professor_resposta";

const EFAI_POINT_SIZE_PT = 12;

type LeadingMode = "fixed" | "auto";

interface ProfessorStyleProfile {
  fontFamily: string;
  fontStyleIncludes?: string;
  oblique?: boolean;
  pointSizeEfAfPt: number;
  leadingMode: LeadingMode;
  leadingPt?: number;
  autoLeadingPct: number;
  leftIndentMm: number;
  leftIndentLabel: string;
  fillColor: string;
  hyphenationZoneMm: number;
  spaceBeforeMm: number;
  spaceAfterMm: number;
  overprintFill: boolean;
  acceptedLanguages: readonly string[];
}

const SHARED_SPACING = {
  autoLeadingPct: 115,
  hyphenationZoneMm: 7.408,
  spaceBeforeMm: 2.117,
  spaceAfterMm: 3.528,
} as const;

const DEFAULT_PROFESSOR_PROFILE: ProfessorStyleProfile = {
  fontFamily: "Univers LT Std",
  fontStyleIncludes: "45 Light",
  pointSizeEfAfPt: 8,
  leadingMode: "fixed",
  leadingPt: 9.2,
  autoLeadingPct: SHARED_SPACING.autoLeadingPct,
  leftIndentMm: 0,
  leftIndentLabel: "0 mm",
  fillColor: COLOR_CORPROF,
  hyphenationZoneMm: SHARED_SPACING.hyphenationZoneMm,
  spaceBeforeMm: SHARED_SPACING.spaceBeforeMm,
  spaceAfterMm: SHARED_SPACING.spaceAfterMm,
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
    leftIndentMm: 12.506,
    leftIndentLabel: "12,506 mm",
  },
  "04_proposta_citado_fonte": {
    fontFamily: "ITC Garamond Std",
    fontStyleIncludes: undefined,
    pointSizeEfAfPt: 7,
    leadingMode: "auto",
    leadingPt: undefined,
  },
};

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

function readFillColorName(style: ParagraphStyle): string {
  try {
    const fill = style.fillColor;
    return fill && fill.isValid ? fill.name || "" : "";
  } catch {
    return "";
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

export function compareProfessorStyle(
  style: ParagraphStyle,
  options: { segment: MaterialSegment | null; validateSize: boolean }
): StylePropertyIssue[] {
  const issues: StylePropertyIssue[] = [];
  const profile = getStyleProfile(style.name);
  const { fontFamily, fontStyle } = readFontInfo(style);

  if (!fontFamily.toLowerCase().includes(profile.fontFamily.toLowerCase())) {
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
    if (
      pointSize.value !== null &&
      !approxEqual(pointSize.value, expectedPointSize, SIZE_TOLERANCE_PT)
    ) {
      issues.push({
        property: "Tamanho",
        expected: `${expectedPointSize} pt`,
        actual: `${pointSize.value} pt`,
      });
    }
  }

  const leading = readNumberProperty(style, "leading", "Entrelinha");
  if (leading.value !== null) {
    if (profile.leadingMode === "fixed") {
      const expectedLeading = profile.leadingPt ?? DEFAULT_PROFESSOR_PROFILE.leadingPt!;
      if (isAutoLeadingValue(leading.value) || !approxEqual(leading.value, expectedLeading, SIZE_TOLERANCE_PT)) {
        issues.push({
          property: "Entrelinha",
          expected: `${expectedLeading} pt`,
          actual: formatLeadingActual(leading.value),
        });
      }
    } else if (!isAutoLeadingValue(leading.value)) {
      issues.push({
        property: "Entrelinha",
        expected: "Automática",
        actual: formatLeadingActual(leading.value),
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
  compareSpacingMm(
    issues,
    "Recuo à esquerda",
    leftIndent.value,
    profile.leftIndentMm,
    profile.leftIndentLabel
  );

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
  compareSpacingMm(
    issues,
    "Zona de hifenização",
    hyphenationZone.value,
    profile.hyphenationZoneMm,
    formatMm(profile.hyphenationZoneMm)
  );

  const spaceBefore = readNumberProperty(style, "spaceBefore", "Espaço anterior");
  pushIssue(issues, spaceBefore.issue);
  compareSpacingMm(
    issues,
    "Espaço anterior",
    spaceBefore.value,
    profile.spaceBeforeMm,
    formatMm(profile.spaceBeforeMm)
  );

  const spaceAfter = readNumberProperty(style, "spaceAfter", "Espaço posterior");
  pushIssue(issues, spaceAfter.issue);
  compareSpacingMm(
    issues,
    "Espaço posterior",
    spaceAfter.value,
    profile.spaceAfterMm,
    formatMm(profile.spaceAfterMm)
  );

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

export const PROFESSOR_VALIDATED_PROPERTIES = [
  "Fonte",
  "Estilo da fonte",
  "Tamanho",
  "Entrelinha",
  "Entrelinha automática",
  "Recuo à esquerda",
  "Cor",
  "Kerning",
  "Idioma",
  "Zona de hifenização",
  "Espaço anterior",
  "Espaço posterior",
  "Superimposição",
] as const;

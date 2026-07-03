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

const MM_TO_PT = 72 / 25.4;

const SHARED_STYLE_SETTINGS = {
  fontFamily: "Univers LT Std",
  fillColor: COLOR_CORPROF,
  autoLeadingPct: 115,
  hyphenationZonePt: 7.408 * MM_TO_PT,
  spaceBeforePt: 2.117 * MM_TO_PT,
  spaceAfterPt: 3.528 * MM_TO_PT,
  overprintFill: true,
} as const;

interface ProfessorStyleProfile {
  fontStyleIncludes: string;
  oblique?: boolean;
  pointSizeEfAfPt: number;
  pointSizeEfAiPt: number;
  leadingPt?: number;
  acceptedLanguages: readonly string[];
}

const DEFAULT_PROFESSOR_PROFILE: ProfessorStyleProfile = {
  fontStyleIncludes: "45 Light",
  pointSizeEfAfPt: 8,
  pointSizeEfAiPt: 12,
  leadingPt: 9.2,
  acceptedLanguages: ACCEPTED_PROFESSOR_LANGUAGES,
};

const PROFESSOR_STYLE_PROFILES: Record<string, Partial<ProfessorStyleProfile>> = {
  "04_professor_roteiroCD": {
    fontStyleIncludes: "45 Light Oblique",
    oblique: true,
    pointSizeEfAfPt: 9,
    pointSizeEfAiPt: 12,
    leadingPt: undefined,
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
  const profile = getStyleProfile(styleName);
  return segment === "EF1" ? profile.pointSizeEfAiPt : profile.pointSizeEfAfPt;
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

export function compareProfessorStyle(
  style: ParagraphStyle,
  options: { segment: MaterialSegment | null; validateSize: boolean }
): StylePropertyIssue[] {
  const issues: StylePropertyIssue[] = [];
  const profile = getStyleProfile(style.name);
  const { fontFamily, fontStyle } = readFontInfo(style);

  if (!fontFamily.includes(SHARED_STYLE_SETTINGS.fontFamily)) {
    issues.push({
      property: "Fonte",
      expected: SHARED_STYLE_SETTINGS.fontFamily,
      actual: fontFamily || "Não definida",
    });
  }

  if (profile.oblique) {
    if (!fontStyle.includes(profile.fontStyleIncludes) || !isObliqueFontStyle(fontStyle)) {
      issues.push({
        property: "Estilo da fonte",
        expected: profile.fontStyleIncludes,
        actual: fontStyle || "Não definido",
      });
    }
  } else if (!fontStyle.includes(profile.fontStyleIncludes)) {
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
    const expectedPointSize = getExpectedProfessorPointSize(style.name, options.segment);
    try {
      if (!approxEqual(style.pointSize, expectedPointSize, SIZE_TOLERANCE_PT)) {
        issues.push({
          property: "Tamanho",
          expected: `${expectedPointSize} pt`,
          actual: `${style.pointSize} pt`,
        });
      }
    } catch {
      issues.push({
        property: "Tamanho",
        expected: `${expectedPointSize} pt`,
        actual: "Não foi possível ler",
      });
    }
  }

  if (profile.leadingPt !== undefined) {
    try {
      if (!approxEqual(style.leading, profile.leadingPt, SIZE_TOLERANCE_PT)) {
        issues.push({
          property: "Entrelinha",
          expected: `${profile.leadingPt} pt`,
          actual: `${style.leading} pt`,
        });
      }
    } catch {
      // ignore unreadable leading
    }
  }

  const fillColorName = readFillColorName(style);
  if (fillColorName !== SHARED_STYLE_SETTINGS.fillColor) {
    issues.push({
      property: "Cor",
      expected: SHARED_STYLE_SETTINGS.fillColor,
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
    // ignore
  }

  try {
    if (!approxEqual(style.autoLeading, SHARED_STYLE_SETTINGS.autoLeadingPct, 1)) {
      issues.push({
        property: "Entrelinha automática",
        expected: `${SHARED_STYLE_SETTINGS.autoLeadingPct}%`,
        actual: `${style.autoLeading}%`,
      });
    }
  } catch {
    // ignore
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
    // ignore
  }

  try {
    if (
      !approxEqual(
        style.hyphenationZone,
        SHARED_STYLE_SETTINGS.hyphenationZonePt,
        SPACING_TOLERANCE_PT
      )
    ) {
      issues.push({
        property: "Zona de hifenização",
        expected: "7,408 mm",
        actual: `${style.hyphenationZone}`,
      });
    }
  } catch {
    // ignore
  }

  try {
    if (
      !approxEqual(style.spaceBefore, SHARED_STYLE_SETTINGS.spaceBeforePt, SPACING_TOLERANCE_PT)
    ) {
      issues.push({
        property: "Espaço anterior",
        expected: "2,117 mm",
        actual: `${style.spaceBefore}`,
      });
    }
  } catch {
    // ignore
  }

  try {
    if (
      !approxEqual(style.spaceAfter, SHARED_STYLE_SETTINGS.spaceAfterPt, SPACING_TOLERANCE_PT)
    ) {
      issues.push({
        property: "Espaço posterior",
        expected: "3,528 mm",
        actual: `${style.spaceAfter}`,
      });
    }
  } catch {
    // ignore
  }

  try {
    if (style.overprintFill !== SHARED_STYLE_SETTINGS.overprintFill) {
      issues.push({
        property: "Superimposição",
        expected: "Ativada",
        actual: style.overprintFill ? "Ativada" : "Desativada",
      });
    }
  } catch {
    // ignore
  }

  return issues;
}

export function getEfAiSizeHint(styleName: string): string {
  const profile = getStyleProfile(styleName);
  return ` Para EF1/EFAI, o corpo deve ser ${profile.pointSizeEfAiPt} pt.`;
}

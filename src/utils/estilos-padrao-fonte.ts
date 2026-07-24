import type { ParagraphStyle } from "indesign";
import { ACCEPTED_PROFESSOR_LANGUAGES } from "./constants";
import type { MaterialSegment } from "./material-type";
import {
  SIZE_TOLERANCE_PT,
  StylePropertyIssue,
  approxEqual,
  compareSpacingMm,
  formatMm,
  isAcceptedLanguage,
  isObliqueFontStyle,
  isRightAlign,
  pushIssue,
  readFontInfo,
  readNumberProperty,
} from "./style-property-compare";

export type { StylePropertyIssue };

export const FONTE_STANDARD_STYLE_NAMES = [
  "05_grafico_fonte",
  "05_mapa_fonte",
  "08_tabela_fonte",
] as const;

type JustificationExpectation = "right";

interface FonteStyleProfile {
  fontFamily: string;
  fontStyleIncludes: string;
  leadingPt: number;
  autoLeadingPct: number;
  hyphenationZoneMm: number;
  spaceBeforeMm?: number;
  spaceAfterMm: number;
  leftIndentMm: number;
  leftIndentLabel: string;
  justification?: JustificationExpectation;
  acceptedLanguages: readonly string[];
}

const SHARED_FONTE_BASE = {
  fontFamily: "Univers LT Std",
  fontStyleIncludes: "45 Light",
  leadingPt: 7,
  autoLeadingPct: 115,
  hyphenationZoneMm: 7.408,
  acceptedLanguages: ACCEPTED_PROFESSOR_LANGUAGES,
} as const;

const FONTE_STYLE_PROFILES: Record<(typeof FONTE_STANDARD_STYLE_NAMES)[number], FonteStyleProfile> = {
  "05_grafico_fonte": {
    ...SHARED_FONTE_BASE,
    spaceBeforeMm: 2.117,
    spaceAfterMm: 4.233,
    leftIndentMm: 0,
    leftIndentLabel: "0 mm",
    justification: "right",
  },
  "05_mapa_fonte": {
    ...SHARED_FONTE_BASE,
    spaceBeforeMm: 2.117,
    spaceAfterMm: 3.528,
    leftIndentMm: 0,
    leftIndentLabel: "0 mm",
    justification: "right",
  },
  "08_tabela_fonte": {
    ...SHARED_FONTE_BASE,
    spaceAfterMm: 4.233,
    leftIndentMm: 99.907,
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

function isAcceptedPointSize(segment: MaterialSegment, pointSize: number): boolean {
  return SEGMENT_POINT_SIZE_PT[segment].some((size) =>
    approxEqual(pointSize, size, SIZE_TOLERANCE_PT)
  );
}

export function getExpectedFontePointSizeLabel(segment: MaterialSegment): string {
  return SEGMENT_SIZE_LABEL[segment];
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

  if (!fontFamily.toLowerCase().includes(profile.fontFamily.toLowerCase())) {
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
    if (pointSize.value !== null && !isAcceptedPointSize(options.segment, pointSize.value)) {
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
  compareSpacingMm(
    issues,
    "Recuo à esquerda",
    leftIndent.value,
    profile.leftIndentMm,
    profile.leftIndentLabel
  );

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

  if (profile.spaceBeforeMm !== undefined) {
    const spaceBefore = readNumberProperty(style, "spaceBefore", "Espaço anterior");
    pushIssue(issues, spaceBefore.issue);
    compareSpacingMm(
      issues,
      "Espaço anterior",
      spaceBefore.value,
      profile.spaceBeforeMm,
      formatMm(profile.spaceBeforeMm)
    );
  }

  const spaceAfter = readNumberProperty(style, "spaceAfter", "Espaço posterior");
  pushIssue(issues, spaceAfter.issue);
  compareSpacingMm(
    issues,
    "Espaço posterior",
    spaceAfter.value,
    profile.spaceAfterMm,
    formatMm(profile.spaceAfterMm)
  );

  return issues;
}

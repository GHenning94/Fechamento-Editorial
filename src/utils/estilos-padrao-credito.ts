import type { ParagraphStyle } from "indesign";
import { ACCEPTED_PROFESSOR_LANGUAGES } from "./constants";
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
  pushIssue,
  readFontInfo,
  readNumberProperty,
} from "./style-property-compare";

export type { StylePropertyIssue };

export const CREDITO_STYLE_NAME = "05_Credito";

const CREDITO_STYLE_PATTERN = /^05_creditos?$/i;

export function isCreditoStyleName(name: string): boolean {
  return CREDITO_STYLE_PATTERN.test((name || "").trim());
}

const CREDITO_PROFILE = {
  fontFamily: "Univers LT Std",
  fontStyleIncludes: "45 Light",
  pointSizePt: 5,
  autoLeadingPct: 115,
  hyphenationZoneMm: 7.408,
  spaceBeforeMm: 0,
  spaceAfterMm: 4.233,
  leftIndentMm: 0,
  acceptedLanguages: ACCEPTED_PROFESSOR_LANGUAGES,
} as const;

export function compareCreditoStyle(style: ParagraphStyle): StylePropertyIssue[] {
  const issues: StylePropertyIssue[] = [];
  const { fontFamily, fontStyle } = readFontInfo(style);

  if (!fontFamily.toLowerCase().includes(CREDITO_PROFILE.fontFamily.toLowerCase())) {
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
  if (leading.value !== null && !isAutoLeadingValue(leading.value)) {
    issues.push({
      property: "Entrelinha",
      expected: "Automática",
      actual: formatLeadingActual(leading.value),
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

  const leftIndent = readNumberProperty(style, "leftIndent", "Recuo à esquerda");
  pushIssue(issues, leftIndent.issue);
  compareSpacingMm(issues, "Recuo à esquerda", leftIndent.value, CREDITO_PROFILE.leftIndentMm, "0 mm");

  try {
    const languageName = style.appliedLanguage?.name || "";
    if (!isAcceptedLanguage(languageName, CREDITO_PROFILE.acceptedLanguages)) {
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
  compareSpacingMm(
    issues,
    "Zona de hifenização",
    hyphenationZone.value,
    CREDITO_PROFILE.hyphenationZoneMm,
    formatMm(CREDITO_PROFILE.hyphenationZoneMm)
  );

  const spaceBefore = readNumberProperty(style, "spaceBefore", "Espaço anterior");
  pushIssue(issues, spaceBefore.issue);
  compareSpacingMm(
    issues,
    "Espaço anterior",
    spaceBefore.value,
    CREDITO_PROFILE.spaceBeforeMm,
    "0 mm"
  );

  const spaceAfter = readNumberProperty(style, "spaceAfter", "Espaço posterior");
  pushIssue(issues, spaceAfter.issue);
  compareSpacingMm(
    issues,
    "Espaço posterior",
    spaceAfter.value,
    CREDITO_PROFILE.spaceAfterMm,
    formatMm(CREDITO_PROFILE.spaceAfterMm)
  );

  return issues;
}

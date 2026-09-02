import type { ParagraphStyle } from "indesign";
import { getInDesignModule } from "./indesign-runtime";

export interface StylePropertyIssue {
  property: string;
  expected: string;
  actual: string;
}

export const MM_TO_PT = 72 / 25.4;
export const SIZE_TOLERANCE_PT = 0.25;
export const SPACING_TOLERANCE_MM = 0.05;

export function approxEqual(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** Compara valor vindo do InDesign (pt ou mm) com um esperado em mm. */
export function matchesExpectedMm(
  actual: number,
  expectedMm: number,
  toleranceMm = SPACING_TOLERANCE_MM
): boolean {
  const asMm = actual;
  const fromPoints = actual / MM_TO_PT;
  return (
    approxEqual(asMm, expectedMm, toleranceMm) ||
    approxEqual(fromPoints, expectedMm, toleranceMm)
  );
}

export function formatMm(valueMm: number): string {
  return `${String(valueMm).replace(".", ",")} mm`;
}

export function formatFoundMeasurement(actual: number, expectedMm: number): string {
  if (approxEqual(actual, expectedMm, SPACING_TOLERANCE_MM * 4)) {
    return formatMm(actual);
  }
  const asMm = actual / MM_TO_PT;
  if (approxEqual(asMm, expectedMm, SPACING_TOLERANCE_MM * 4)) {
    return formatMm(asMm);
  }
  return String(actual);
}

type StyleWithInheritance = ParagraphStyle & {
  basedOn?: unknown;
  properties?: Record<string, unknown>;
};

const LEADING_AUTO = 1635019116;
const NOTHING_ENUM = 1851876449;

function tryRead(getter: () => unknown): unknown {
  try {
    return getter();
  } catch {
    return undefined;
  }
}

function isNothingNumeric(value: unknown): boolean {
  return typeof value === "number" && value === NOTHING_ENUM;
}

function leadingLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const rec = value as { name?: unknown };
    if (typeof rec.name === "string") return rec.name;
    try {
      const text = String(value);
      if (text && text !== "[object Object]") return text;
    } catch {
      // ignore
    }
  }
  return "";
}

function looksLikeAutoLeading(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") {
    try {
      const { Leading } = getInDesignModule();
      const L = Leading as { AUTO?: number; auto?: number };
      if (typeof L.AUTO === "number" && value === L.AUTO) return true;
      if (typeof L.auto === "number" && value === L.auto) return true;
    } catch {
      // ignore
    }
    return value === LEADING_AUTO;
  }

  const label = leadingLabel(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
  if (label === "auto" || label === "automatica" || label === "automatic" || label.includes("auto")) {
    return true;
  }

  if (value && typeof value === "object") {
    const rec = value as { value?: unknown };
    if (rec.value !== value && looksLikeAutoLeading(rec.value)) return true;
  }
  return false;
}

function coerceStyleNumber(raw: unknown, property: keyof ParagraphStyle): number | null {
  if (raw == null) return null;
  if (property === "leading" && looksLikeAutoLeading(raw)) return LEADING_AUTO;

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || isNothingNumeric(raw)) return null;
    return raw;
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    if (property === "leading" && looksLikeAutoLeading(trimmed)) return LEADING_AUTO;
    const parsed = Number(trimmed.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
    return null;
  }

  if (typeof raw === "object") {
    const rec = raw as { value?: unknown; numberValue?: unknown };
    if (typeof rec.value === "number" && Number.isFinite(rec.value) && !isNothingNumeric(rec.value)) {
      if (property === "leading" && looksLikeAutoLeading(rec.value)) return LEADING_AUTO;
      return rec.value;
    }
    if (typeof rec.numberValue === "number" && Number.isFinite(rec.numberValue)) {
      return rec.numberValue;
    }
    const coerced = Number(raw);
    if (Number.isFinite(coerced) && coerced > 1000) return coerced;
  }

  return null;
}

function isEmptyStyleRaw(value: unknown): boolean {
  if (value == null) return true;
  return isNothingNumeric(value);
}

function readInheritedRaw(style: ParagraphStyle, property: keyof ParagraphStyle): unknown {
  const seen = new Set<unknown>();
  let current: unknown = style;

  for (let depth = 0; depth < 12; depth++) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    const candidate = current as StyleWithInheritance;

    for (let attempt = 0; attempt < 2; attempt++) {
      const direct = tryRead(() => candidate[property]);
      if (!isEmptyStyleRaw(direct)) return direct;

      const fromProps = tryRead(() => candidate.properties?.[property as string]);
      if (!isEmptyStyleRaw(fromProps)) return fromProps;
    }

    current = tryRead(() => candidate.basedOn);
  }

  return undefined;
}

/**
 * Lê número do estilo com fallbacks do UXP (enum object, properties, basedOn).
 * Falha de leitura não vira erro: o valor intermitente do host gerava falso positivo.
 */
export function readNumberProperty(
  style: ParagraphStyle,
  property: keyof ParagraphStyle,
  _label: string
): { value: number | null; issue: StylePropertyIssue | null } {
  const raw = readInheritedRaw(style, property);
  const value = coerceStyleNumber(raw, property);
  return { value, issue: null };
}

export function formatLeadingActual(value: number): string {
  return isAutoLeadingValue(value) ? "Automática" : `${value} pt`;
}

export function pushIssue(
  issues: StylePropertyIssue[],
  issue: StylePropertyIssue | null
): void {
  if (issue) issues.push(issue);
}

/** Lê família/estilo com fallbacks do UXP (objeto Font, string "Família\\tEstilo", name completo). */
export function readFontInfo(style: ParagraphStyle): {
  fontFamily: string;
  fontStyle: string;
} {
  const parseFontString = (value: string): { fontFamily: string; fontStyle: string } => {
    const parts = value.split(/\t|\|/).map((part) => part.trim()).filter(Boolean);
    return {
      fontFamily: parts[0] || value.trim(),
      fontStyle: parts[1] || "",
    };
  };

  try {
    const font = style.appliedFont as unknown;

    if (typeof font === "string" && font.trim()) {
      return parseFontString(font);
    }

    if (font && typeof font === "object") {
      const typed = font as {
        fontFamily?: string;
        fontStyleName?: string;
        name?: string;
        fullName?: string;
      };

      try {
        const family = String(typed.fontFamily || "").trim();
        const styleName = String(typed.fontStyleName || "").trim();
        if (family || styleName) {
          return { fontFamily: family, fontStyle: styleName };
        }
      } catch {
        // continua nos fallbacks
      }

      for (const key of ["fullName", "name"] as const) {
        try {
          const full = String(typed[key] || "").trim();
          if (full) return parseFontString(full);
        } catch {
          // tenta próxima chave
        }
      }
    }
  } catch {
    // ignore
  }

  try {
    const props = (style as ParagraphStyle & { properties?: Record<string, unknown> }).properties;
    const applied = props?.appliedFont;
    if (typeof applied === "string" && applied.trim()) {
      return parseFontString(applied);
    }
  } catch {
    // ignore
  }

  return { fontFamily: "", fontStyle: "" };
}

export function isOpticalKerning(value: unknown): boolean {
  if (typeof value === "string") {
    return /óptic|optic/i.test(value);
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    return false;
  }

  try {
    const { KerningMethod } = getInDesignModule();
    const KM = KerningMethod as { OPTICAL?: number; optical?: number };
    if (typeof KM.OPTICAL === "number" && value === KM.OPTICAL) return true;
    if (typeof KM.optical === "number" && value === KM.optical) return true;
  } catch {
    // ignore
  }

  // Constantes conhecidas do enum KerningMethod.OPTICAL no InDesign
  return value === 1851876449 || value === 1332764527;
}

export function isAutoLeadingValue(leading: unknown): boolean {
  return looksLikeAutoLeading(leading);
}

export function isCenterAlign(justification: number): boolean {
  try {
    const { Justification } = getInDesignModule();
    const J = Justification as {
      CENTER_ALIGN?: number;
      CENTER_JUSTIFIED?: number;
      centerAlign?: number;
    };
    if (typeof J.CENTER_ALIGN === "number" && justification === J.CENTER_ALIGN) return true;
    if (typeof J.CENTER_JUSTIFIED === "number" && justification === J.CENTER_JUSTIFIED) {
      return true;
    }
    if (typeof J.centerAlign === "number" && justification === J.centerAlign) return true;
  } catch {
    // ignore
  }
  return false;
}

export function isRightAlign(justification: number): boolean {
  try {
    const { Justification } = getInDesignModule();
    const J = Justification as {
      RIGHT_ALIGN?: number;
      RIGHT_JUSTIFIED?: number;
      rightAlign?: number;
    };
    if (typeof J.RIGHT_ALIGN === "number" && justification === J.RIGHT_ALIGN) return true;
    if (typeof J.RIGHT_JUSTIFIED === "number" && justification === J.RIGHT_JUSTIFIED) return true;
    if (typeof J.rightAlign === "number" && justification === J.rightAlign) return true;
  } catch {
    // ignore
  }
  return false;
}

/** Códigos de 4 chars do InDesign (Justification). */
const JUSTIFICATION_LEFT_ALIGN = 1818584692; // left
const JUSTIFICATION_LEFT_JUSTIFIED = 1818915700; // ljst

function justificationNumeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  if (value && typeof value === "object") {
    const rec = value as { value?: unknown };
    if (typeof rec.value === "number" && Number.isFinite(rec.value)) return rec.value;
    try {
      const coerced = Number(value);
      if (Number.isFinite(coerced) && coerced > 1000) return coerced;
    } catch {
      // ignore
    }
  }
  return null;
}

function justificationLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const rec = value as { name?: unknown };
    if (typeof rec.name === "string") return rec.name;
    try {
      const text = String(value);
      if (text && text !== "[object Object]") return text;
    } catch {
      // ignore
    }
  }
  return "";
}

function isNothingStyleValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return value === 0 || value === NOTHING_ENUM;
  return false;
}

/**
 * Com hifenização ativa: Justificado à esquerda (Left Justified) ou Esquerda.
 * O UXP às vezes devolve string, objeto enum ou o código de 4 chars — sem o fallback
 * o estilo 02_texto_geral (já correto) era marcado como erro.
 */
export function isLeftJustifiedAlignment(value: unknown): boolean {
  const label = justificationLabel(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (label) {
    if (/leftjustified|ljst|justificadoa?esquerda/.test(label)) return true;
    if (/leftalign|^left$|^esquerda$/.test(label)) return true;
  }

  const code = justificationNumeric(value);
  if (code == null || isNothingStyleValue(code)) return false;

  try {
    const { Justification } = getInDesignModule() as {
      Justification?: {
        LEFT_JUSTIFIED?: number;
        LEFT_ALIGN?: number;
        leftJustified?: number;
        leftAlign?: number;
      };
    };
    const J = Justification || {};
    const accepted = [J.LEFT_JUSTIFIED, J.LEFT_ALIGN, J.leftJustified, J.leftAlign].filter(
      (item): item is number => typeof item === "number"
    );
    if (accepted.includes(code)) return true;
  } catch {
    // host sem enum
  }

  return code === JUSTIFICATION_LEFT_JUSTIFIED || code === JUSTIFICATION_LEFT_ALIGN;
}

export function readParagraphJustification(style: ParagraphStyle): unknown {
  const seen = new Set<unknown>();
  let current: unknown = style;

  for (let i = 0; i < 12; i++) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    const candidate = current as ParagraphStyle & {
      basedOn?: unknown;
      properties?: { justification?: unknown };
    };

    try {
      const value = candidate.justification;
      if (!isNothingStyleValue(value)) return value;
    } catch {
      // tenta properties / basedOn
    }

    try {
      const fromProps = candidate.properties?.justification;
      if (!isNothingStyleValue(fromProps)) return fromProps;
    } catch {
      // ignore
    }

    current = candidate.basedOn;
  }

  return undefined;
}

export function isLeftAlign(justification: number): boolean {
  return isLeftJustifiedAlignment(justification);
}

export function normalizeLanguageName(name: string): string {
  return name.trim().replace(/\s*:\s*/g, ": ");
}

export function isAcceptedLanguage(
  languageName: string,
  accepted: readonly string[]
): boolean {
  const normalized = normalizeLanguageName(languageName).toLowerCase();
  return accepted.some(
    (entry) => normalizeLanguageName(entry).toLowerCase() === normalized
  );
}

export function isObliqueFontStyle(fontStyle: string): boolean {
  return /oblique|itálico|italico|italic/i.test(fontStyle);
}

export function compareSpacingMm(
  issues: StylePropertyIssue[],
  label: string,
  actual: number | null,
  expectedMm: number,
  expectedLabel?: string
): void {
  if (actual === null) return;
  if (matchesExpectedMm(actual, expectedMm)) return;

  issues.push({
    property: label,
    expected: expectedLabel || formatMm(expectedMm),
    actual: formatFoundMeasurement(actual, expectedMm),
  });
}

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

export function readNumberProperty(
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

export function isAutoLeadingValue(leading: number): boolean {
  try {
    const { Leading } = getInDesignModule();
    const L = Leading as { AUTO?: number; auto?: number };
    if (typeof L.AUTO === "number" && leading === L.AUTO) return true;
    if (typeof L.auto === "number" && leading === L.auto) return true;
  } catch {
    // ignore
  }
  return leading === 1635019116;
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

export function isLeftAlign(justification: number): boolean {
  try {
    const { Justification } = getInDesignModule();
    const J = Justification as {
      LEFT_ALIGN?: number;
      LEFT_JUSTIFIED?: number;
      leftAlign?: number;
    };
    if (typeof J.LEFT_ALIGN === "number" && justification === J.LEFT_ALIGN) return true;
    if (typeof J.LEFT_JUSTIFIED === "number" && justification === J.LEFT_JUSTIFIED) return true;
    if (typeof J.leftAlign === "number" && justification === J.leftAlign) return true;
  } catch {
    // ignore
  }
  return false;
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

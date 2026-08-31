import type { Document, Layer, PDFExportPreset } from "indesign";
import { ExportFormat, UserInteractionLevels } from "indesign";
import { LAYER_MEMORIAL, PDF_PRESET_FALLBACK_NAMES, PDF_PRESET_NAME } from "../utils/constants";
import { joinPath } from "../utils/file-system";
import { getInDesignApp, getInDesignModule } from "../utils/indesign-runtime";
import { findEditorialLayer } from "../utils/editorial-layer";
import { toPdfExportTarget } from "../utils/pdf-export-path";
import { withPresetSpreadSettings, PdfSpreadSettings } from "../utils/pdf-preset-session";

export interface PdfExportOutcome {
  presetMissing: boolean;
  memorialLayerMissing: boolean;
  arteGenerated: boolean;
  estilosGenerated: boolean;
  artePath?: string;
  estilosPath?: string;
  warnings: string[];
}

function findMemorialLayer(doc: Document): Layer | null {
  return findEditorialLayer(doc);
}

export function findPdfPreset(): PDFExportPreset | null {
  const presets = getInDesignApp().pdfExportPresets;

  for (const name of PDF_PRESET_FALLBACK_NAMES) {
    try {
      const preset = presets.itemByName(name);
      if (preset?.isValid) {
        return preset;
      }
    } catch {
      // tenta próximo nome
    }
  }

  return null;
}

function withSuppressedUi<T>(fn: () => T): T {
  const app = getInDesignApp();
  const saved = app.scriptPreferences.userInteractionLevel;

  try {
    app.scriptPreferences.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
    return fn();
  } finally {
    app.scriptPreferences.userInteractionLevel = saved;
  }
}

function forceAllPagesRange(doc: Document): void {
  const prefs = getInDesignApp().pdfExportPreferences as { pageRange?: unknown };
  const mod = getInDesignModule() as { PageRange?: { ALL_PAGES?: unknown } };

  try {
    if (mod.PageRange?.ALL_PAGES != null) {
      prefs.pageRange = mod.PageRange.ALL_PAGES;
      return;
    }
  } catch {
    // tenta string
  }

  try {
    const count = doc.pages.length;
    if (count > 0) {
      const first = doc.pages.item(0).name;
      const last = doc.pages.item(count - 1).name;
      if (first && last) {
        prefs.pageRange = first === last ? String(first) : `${first}-${last}`;
        return;
      }
    }
  } catch {
    // tenta vazio = todas
  }

  try {
    prefs.pageRange = "";
  } catch {
    // ignore
  }
}

function exportPdf(
  doc: Document,
  preset: PDFExportPreset,
  outputPath: string,
  settings: PdfSpreadSettings
): void {
  const target = toPdfExportTarget(outputPath);

  withPresetSpreadSettings(preset, settings, () => {
    withSuppressedUi(() => {
      forceAllPagesRange(doc);
      doc.exportFile(ExportFormat.PDF_TYPE, target, false, preset);
    });
  });
}

function setMemorialVisibility(memorial: Layer | null, visible: boolean): void {
  if (memorial?.isValid) {
    memorial.visible = visible;
  }
}

export function exportPdfArte(
  doc: Document,
  packageRoot: string,
  docBaseName: string
): Pick<PdfExportOutcome, "presetMissing" | "arteGenerated" | "artePath" | "warnings"> {
  const warnings: string[] = [];
  const preset = findPdfPreset();
  if (!preset) {
    return {
      presetMissing: true,
      arteGenerated: false,
      warnings: [`Preset PDF "${PDF_PRESET_NAME}" não encontrado. Nenhum PDF foi exportado.`],
    };
  }

  const memorial = findMemorialLayer(doc);
  const memorialWasVisible = memorial?.visible ?? null;
  const artePath = joinPath(packageRoot, `${docBaseName}.pdf`);

  try {
    setMemorialVisibility(memorial, false);
    exportPdf(doc, preset, artePath, { exportReaderSpreads: false });
    return {
      presetMissing: false,
      arteGenerated: true,
      artePath,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Falha ao exportar PDF principal: ${message}`);
    return {
      presetMissing: false,
      arteGenerated: false,
      warnings,
    };
  } finally {
    if (memorial && memorialWasVisible !== null) {
      memorial.visible = memorialWasVisible;
    }
  }
}

export function exportPdfEstilos(
  doc: Document,
  packageRoot: string,
  docBaseName: string
): Pick<PdfExportOutcome, "memorialLayerMissing" | "estilosGenerated" | "estilosPath" | "warnings"> {
  const warnings: string[] = [];
  const preset = findPdfPreset();
  if (!preset) {
    return {
      memorialLayerMissing: false,
      estilosGenerated: false,
      warnings: [`Preset PDF "${PDF_PRESET_NAME}" não encontrado. PDF _ESTILOS não foi exportado.`],
    };
  }

  const memorial = findMemorialLayer(doc);
  if (!memorial) {
    return {
      memorialLayerMissing: true,
      estilosGenerated: false,
      warnings: [
        `Layer "${LAYER_MEMORIAL}" inexistente. PDF "${docBaseName}_ESTILOS.pdf" não foi exportado.`,
      ],
    };
  }

  const memorialWasVisible = memorial.visible;
  const estilosPath = joinPath(packageRoot, `${docBaseName}_ESTILOS.pdf`);

  try {
    setMemorialVisibility(memorial, true);
    exportPdf(doc, preset, estilosPath, { exportReaderSpreads: true });
    return {
      memorialLayerMissing: false,
      estilosGenerated: true,
      estilosPath,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Falha ao exportar PDF _ESTILOS: ${message}`);
    return {
      memorialLayerMissing: false,
      estilosGenerated: false,
      warnings,
    };
  } finally {
    memorial.visible = memorialWasVisible;
  }
}

export function exportPackagePdfs(
  doc: Document,
  packageRoot: string,
  docBaseName: string
): PdfExportOutcome {
  const arte = exportPdfArte(doc, packageRoot, docBaseName);
  if (arte.presetMissing) {
    return {
      presetMissing: true,
      memorialLayerMissing: false,
      arteGenerated: false,
      estilosGenerated: false,
      warnings: arte.warnings,
    };
  }

  const estilos = exportPdfEstilos(doc, packageRoot, docBaseName);

  return {
    presetMissing: false,
    memorialLayerMissing: estilos.memorialLayerMissing,
    arteGenerated: arte.arteGenerated,
    estilosGenerated: estilos.estilosGenerated,
    artePath: arte.artePath,
    estilosPath: estilos.estilosPath,
    warnings: [...arte.warnings, ...estilos.warnings],
  };
}

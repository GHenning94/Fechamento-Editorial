import type { Document, Layer, PDFExportPreset } from "indesign";
import { ExportFormat, UserInteractionLevels } from "indesign";
import { LAYER_MEMORIAL_DESCRITIVO, PDF_PRESET_FALLBACK_NAMES, PDF_PRESET_NAME } from "../utils/constants";
import { joinPath } from "../utils/file-system";
import { getInDesignApp, getInDesignModule } from "../utils/indesign-runtime";
import { findEditorialLayer, findRendimentoLayer } from "../utils/editorial-layer";
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

interface LayerSnapshot {
  layer: Layer;
  visible: boolean;
  locked: boolean;
}

function snapshotLayer(layer: Layer | null): LayerSnapshot | null {
  if (!layer?.isValid) return null;
  try {
    return {
      layer,
      visible: Boolean(layer.visible),
      locked: Boolean(layer.locked),
    };
  } catch {
    return null;
  }
}

function setLayerVisible(snapshot: LayerSnapshot | null, visible: boolean): void {
  if (!snapshot?.layer?.isValid) return;
  try {
    snapshot.layer.locked = false;
  } catch {
    // ignore
  }
  try {
    if (snapshot.layer.visible !== visible) {
      snapshot.layer.visible = visible;
    }
  } catch {
    // ignore
  }
}

function restoreLayer(snapshot: LayerSnapshot | null): void {
  if (!snapshot?.layer?.isValid) return;
  try {
    snapshot.layer.visible = snapshot.visible;
  } catch {
    // ignore
  }
  try {
    snapshot.layer.locked = snapshot.locked;
  } catch {
    // ignore
  }
}

/**
 * PDF é pesado: sem redraw, sem diálogos, preflight desligado.
 * O InDesign continua ocupado no exportFile — isso é o motor, não o painel.
 */
function withQuietExport<T>(doc: Document, fn: () => T): T {
  const app = getInDesignApp();
  const prefs = app.scriptPreferences as {
    userInteractionLevel: unknown;
    enableRedraw?: boolean;
  };
  const savedUi = prefs.userInteractionLevel;
  let savedRedraw: boolean | undefined;
  let savedPreflight: boolean | undefined;

  try {
    savedRedraw = prefs.enableRedraw;
  } catch {
    savedRedraw = undefined;
  }
  try {
    savedPreflight = doc.preflightOptions?.preflightOff;
  } catch {
    savedPreflight = undefined;
  }

  try {
    try {
      prefs.enableRedraw = false;
    } catch {
      // host sem enableRedraw
    }
    prefs.userInteractionLevel = UserInteractionLevels.NEVER_INTERACT;
    try {
      if (doc.preflightOptions) doc.preflightOptions.preflightOff = true;
    } catch {
      // ignore
    }
    return fn();
  } finally {
    try {
      if (savedRedraw !== undefined) prefs.enableRedraw = savedRedraw;
    } catch {
      // ignore
    }
    try {
      prefs.userInteractionLevel = savedUi;
    } catch {
      // ignore
    }
    try {
      if (savedPreflight !== undefined && doc.preflightOptions) {
        doc.preflightOptions.preflightOff = savedPreflight;
      }
    } catch {
      // ignore
    }
  }
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

/**
 * Dois PDFs por fechamento:
 * - arte: páginas simples, memorial e rendimento ocultos
 * - _ESTILOS: spreads, memorial e rendimento visíveis
 */
function exportPdf(
  doc: Document,
  preset: PDFExportPreset,
  outputPath: string,
  settings: PdfSpreadSettings
): void {
  const target = toPdfExportTarget(outputPath);

  withQuietExport(doc, () => {
    withPresetSpreadSettings(preset, settings, () => {
      forceAllPagesRange(doc);
      doc.exportFile(ExportFormat.PDF_TYPE, target, false, preset);
    });
  });
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

  const memorial = snapshotLayer(findEditorialLayer(doc));
  const rendimento = snapshotLayer(findRendimentoLayer(doc));
  const artePath = joinPath(packageRoot, `${docBaseName}.pdf`);

  try {
    setLayerVisible(memorial, false);
    setLayerVisible(rendimento, false);
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
    restoreLayer(memorial);
    restoreLayer(rendimento);
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

  const memorial = snapshotLayer(findEditorialLayer(doc));
  const rendimento = snapshotLayer(findRendimentoLayer(doc));
  const estilosPath = joinPath(packageRoot, `${docBaseName}_ESTILOS.pdf`);

  try {
    setLayerVisible(memorial, true);
    setLayerVisible(rendimento, true);
    exportPdf(doc, preset, estilosPath, { exportReaderSpreads: true });
    if (!memorial) {
      warnings.push(
        `Layer "${LAYER_MEMORIAL_DESCRITIVO}" inexistente. PDF _ESTILOS gerado em spreads sem memorial.`
      );
    }
    return {
      memorialLayerMissing: !memorial,
      estilosGenerated: true,
      estilosPath,
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Falha ao exportar PDF _ESTILOS: ${message}`);
    return {
      memorialLayerMissing: !memorial,
      estilosGenerated: false,
      warnings,
    };
  } finally {
    restoreLayer(memorial);
    restoreLayer(rendimento);
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

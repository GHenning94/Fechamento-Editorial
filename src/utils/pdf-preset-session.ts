import type { PDFExportPreset } from "indesign";
import { getInDesignApp, getInDesignModule } from "./indesign-runtime";

export interface PdfSpreadSettings {
  exportReaderSpreads: boolean;
}

type MutablePreset = PDFExportPreset & {
  exportReaderSpreads?: boolean;
  exportAsSinglePages?: boolean;
  pageRange?: unknown;
};

type MutablePrefs = {
  exportReaderSpreads: boolean;
  exportAsSinglePages: boolean;
  pageRange?: unknown;
  viewPDF?: boolean;
};

function allPagesToken(): unknown {
  const mod = getInDesignModule() as { PageRange?: { ALL_PAGES?: unknown } };
  if (mod.PageRange?.ALL_PAGES != null) {
    return mod.PageRange.ALL_PAGES;
  }
  return "";
}

function applyPageRange(target: { pageRange?: unknown }, value: unknown): void {
  try {
    target.pageRange = value;
  } catch {
    try {
      target.pageRange = "";
    } catch {
      // ignore
    }
  }
}

/**
 * Um único PDF por exportação: páginas simples ou spreads.
 * Nunca ativa exportAsSinglePages (gera 1 arquivo por página).
 */
export function withPresetSpreadSettings(
  preset: PDFExportPreset,
  settings: PdfSpreadSettings,
  fn: () => void
): void {
  const mutable = preset as MutablePreset;
  const appPrefs = getInDesignApp().pdfExportPreferences as MutablePrefs;
  const pagesToken = allPagesToken();

  const saved = {
    directSpreads: mutable.exportReaderSpreads,
    directSingle: mutable.exportAsSinglePages,
    directRange: mutable.pageRange,
    propsSpreads: preset.properties.exportReaderSpreads,
    propsSingle: preset.properties.exportAsSinglePages,
    appSpreads: appPrefs.exportReaderSpreads,
    appSingle: appPrefs.exportAsSinglePages,
    appRange: appPrefs.pageRange,
    appViewPdf: appPrefs.viewPDF,
  };

  mutable.exportReaderSpreads = settings.exportReaderSpreads;
  try {
    mutable.exportAsSinglePages = false;
  } catch {
    // ignore
  }
  applyPageRange(mutable, pagesToken);
  preset.properties.exportReaderSpreads = settings.exportReaderSpreads;
  try {
    preset.properties.exportAsSinglePages = false;
  } catch {
    // ignore
  }
  appPrefs.exportReaderSpreads = settings.exportReaderSpreads;
  try {
    appPrefs.exportAsSinglePages = false;
  } catch {
    // ignore
  }
  applyPageRange(appPrefs, pagesToken);
  try {
    appPrefs.viewPDF = false;
  } catch {
    // ignore
  }

  try {
    applyPageRange(appPrefs, pagesToken);
    fn();
  } finally {
    if (saved.directSpreads !== undefined) {
      mutable.exportReaderSpreads = saved.directSpreads;
    }
    if (saved.directSingle !== undefined) {
      try {
        mutable.exportAsSinglePages = saved.directSingle;
      } catch {
        // ignore
      }
    }
    if (saved.directRange !== undefined) {
      applyPageRange(mutable, saved.directRange);
    }
    preset.properties.exportReaderSpreads = saved.propsSpreads;
    if (saved.propsSingle !== undefined) {
      try {
        preset.properties.exportAsSinglePages = saved.propsSingle;
      } catch {
        // ignore
      }
    }
    appPrefs.exportReaderSpreads = saved.appSpreads;
    try {
      appPrefs.exportAsSinglePages = saved.appSingle;
    } catch {
      // ignore
    }
    if (saved.appRange !== undefined) {
      applyPageRange(appPrefs, saved.appRange);
    }
    if (saved.appViewPdf !== undefined) {
      try {
        appPrefs.viewPDF = saved.appViewPdf;
      } catch {
        // ignore
      }
    }
  }
}

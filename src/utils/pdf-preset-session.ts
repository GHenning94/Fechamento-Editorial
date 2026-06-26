import type { PDFExportPreset } from "indesign";
import { getInDesignApp } from "./indesign-runtime";

export interface PdfSpreadSettings {
  exportReaderSpreads: boolean;
}

type MutablePreset = PDFExportPreset & {
  exportReaderSpreads?: boolean;
  exportAsSinglePages?: boolean;
};

/** Aplica spreads no preset, nas properties e nas prefs da sessão — restaura tudo ao final. */
export function withPresetSpreadSettings(
  preset: PDFExportPreset,
  settings: PdfSpreadSettings,
  fn: () => void
): void {
  const mutable = preset as MutablePreset;
  const appPrefs = getInDesignApp().pdfExportPreferences;

  const saved = {
    directSpreads: mutable.exportReaderSpreads,
    directSingle: mutable.exportAsSinglePages,
    propsSpreads: preset.properties.exportReaderSpreads,
    propsSingle: preset.properties.exportAsSinglePages,
    appSpreads: appPrefs.exportReaderSpreads,
    appSingle: appPrefs.exportAsSinglePages,
  };

  mutable.exportReaderSpreads = settings.exportReaderSpreads;
  mutable.exportAsSinglePages = false;
  preset.properties.exportReaderSpreads = settings.exportReaderSpreads;
  preset.properties.exportAsSinglePages = false;
  appPrefs.exportReaderSpreads = settings.exportReaderSpreads;
  appPrefs.exportAsSinglePages = false;

  try {
    fn();
  } finally {
    if (saved.directSpreads !== undefined) {
      mutable.exportReaderSpreads = saved.directSpreads;
    }
    if (saved.directSingle !== undefined) {
      mutable.exportAsSinglePages = saved.directSingle;
    }
    preset.properties.exportReaderSpreads = saved.propsSpreads;
    if (saved.propsSingle !== undefined) {
      preset.properties.exportAsSinglePages = saved.propsSingle;
    }
    appPrefs.exportReaderSpreads = saved.appSpreads;
    appPrefs.exportAsSinglePages = saved.appSingle;
  }
}

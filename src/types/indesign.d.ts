declare module "indesign" {
  export const app: Application;

  export const ExportFormat: {
    PDF_TYPE: string;
    INDESIGN_MARKUP: string;
    PNG_FORMAT: string;
  };

  export const MeasurementUnits: {
    POINTS: number;
    MILLIMETERS: number;
    INCHES: number;
  };

  export const CornerOptions: {
    ROUNDED_CORNER: number;
    NONE: number;
  };

  export const LocationOptions: {
    AT_BEGINNING: number;
    AT_END: number;
    UNKNOWN: number;
  };

  export const ColorModel: {
    PROCESS: number;
    SPOT: number;
    REGISTRATION: number;
  };

  export const ColorSpace: {
    CMYK: number;
    RGB: number;
    LAB: number;
    HSB: number;
  };

  export const LinkStatus: {
    NORMAL: number;
    LINK_OUT_OF_DATE: number;
    LINK_MISSING: number;
    LINK_EMBEDDED: number;
    LINK_INACCESSIBLE: number;
  };

  export const FontStatus: {
    INSTALLED: number;
    NOT_AVAILABLE: number;
    FAUXED: number;
    SUBSTITUTED: number;
    UNKNOWN: number;
  };

  export const Justification: {
    LEFT_ALIGN: number;
    LEFT_JUSTIFIED: number;
    CENTER_ALIGN: number;
    RIGHT_ALIGN: number;
    RIGHT_JUSTIFIED: number;
    CENTER_JUSTIFIED: number;
    FULLY_JUSTIFIED: number;
  };

  export const ImageColorSpace: {
    CMYK: number;
    RGB: number;
    LAB: number;
    GRAY: number;
  };

  export const PNGColorSpaceEnum: {
    RGB: number;
    GRAY: number;
    CMYK: number;
  };

  export const NothingEnum: {
    NOTHING: number;
  };

  export interface ScriptPreferences {
    userInteractionLevel: number;
  }

  export const UserInteractionLevels: {
    NEVER_INTERACT: number;
    INTERACT_WITH_ALL: number;
  };

  export interface Application {
    activeDocument: Document | null;
    documents: Documents;
    pdfExportPresets: PDFExportPresets;
    pdfExportPreferences: PDFExportPreferences;
    pngExportPreferences: PNGExportPreferences;
    preflightProcesses: PreflightProcesses;
    preflightProfiles: PreflightProfiles;
    scriptPreferences: ScriptPreferences;
    userName: string;
    selection: unknown;
    doScript?(
      script: (() => unknown) | string,
      language?: unknown,
      args?: unknown[],
      undoMode?: unknown,
      commandName?: string
    ): unknown;
  }

  export interface ViewPreferences {
    horizontalMeasurementUnits: number;
    verticalMeasurementUnits: number;
  }

  export interface Swatches {
    length: number;
    item(index: number): Swatch;
    itemByName(name: string): Swatch;
  }

  export interface Documents {
    length: number;
    item(index: number): Document;
  }

  export interface DocumentPreferences {
    documentBleedTopOffset?: number;
    documentBleedBottomOffset?: number;
    documentBleedInsideOrLeftOffset?: number;
    documentBleedOutsideOrRightOffset?: number;
    documentBleedInsideOffset?: number;
    documentBleedOutsideOffset?: number;
  }

  export interface Document {
    name: string;
    isValid: boolean;
    fullName: Promise<File | string>;
    filePath: Promise<string>;
    saved: boolean;
    layers: Layers;
    colors: Colors;
    colorGroups: ColorGroups;
    paragraphStyles: ParagraphStyles;
    characterStyles: CharacterStyles;
    links: Links;
    fonts: Fonts;
    pages: Pages;
    stories: Stories;
    spreads: Spreads;
    preflightOptions: PreflightOption;
    preflightProfiles: PreflightProfiles;
    documentPreferences: DocumentPreferences;
    viewPreferences?: ViewPreferences;
    textFrames?: TextFrames;
    swatches?: Swatches;
    activeLayer?: Layer;
    save(file?: File | string): void;
    saveACopy(file: File | string): void;
    exportFile(
      format: string,
      to: File | string,
      showingOptions?: boolean,
      using?: PDFExportPreset,
      versionComments?: string,
      forceSave?: boolean
    ): void;
    packageForPrint(
      to: File | string,
      copyingFonts?: boolean,
      copyingLinkedGraphics?: boolean,
      copyingProfiles?: boolean,
      updatingGraphics?: boolean,
      includingHiddenLayers?: boolean,
      ignorePreflightErrors?: boolean,
      creatingReport?: boolean,
      includeIdml?: boolean,
      includePdf?: boolean,
      pdfStyle?: string,
      useDocumentHyphenationExceptionsOnly?: boolean,
      versionComments?: string,
      forceSave?: boolean
    ): boolean;
  }

  export interface Layers {
    length: number;
    item(index: number): Layer;
    itemByName(name: string): Layer;
    add(properties?: object): Layer;
  }

  export interface Layer {
    name: string;
    visible: boolean;
    locked: boolean;
    pageItems: PageItems;
    isValid: boolean;
  }

  export interface PageItems {
    length: number;
    item(index: number): PageItem;
    everyItem?(): { remove(): void };
  }

  export interface PageItem {
    constructor: { name: string };
    name: string;
    label?: string;
    fillColor: Swatch | Color;
    strokeColor: Swatch | Color;
    strokeWeight: number;
    fillOverprint: boolean;
    strokeOverprint: boolean;
    geometricBounds: number[];
    parentPage: Page | number;
    pageItems?: PageItems;
    allPageItems?: PageItems;
    isValid: boolean;
    itemLayer: Layer;
    contents?: string;
    appliedParagraphStyle?: ParagraphStyle;
    overflows?: boolean;
    parent?: PageItem | Spread;
    graphics?: Graphics;
    images?: Images;
    remove?(): void;
    texts?: Texts;
    textFramePreferences?: TextFramePreferences;
    topLeftCornerOption?: number;
    topRightCornerOption?: number;
    bottomLeftCornerOption?: number;
    bottomRightCornerOption?: number;
    topLeftCornerRadius?: number;
    topRightCornerRadius?: number;
    bottomLeftCornerRadius?: number;
    bottomRightCornerRadius?: number;
    paths?: Paths;
  }

  export interface Paths {
    length: number;
    item(index: number): Path;
  }

  export interface Path {
    entirePath: number[][] | number[][][];
  }

  export interface TextFramePreferences {
    insetSpacing?: number | number[];
    autoSizingType?: number;
    autoSizingReferencePoint?: number;
  }

  export interface TextFrames {
    length: number;
    item(index: number): PageItem;
    add(properties?: object): PageItem;
  }

  export interface Polygons {
    length: number;
    item(index: number): PageItem;
    add(properties?: object): PageItem;
  }

  export interface Groups {
    add(pageItems: PageItem[], at?: unknown, reference?: unknown): PageItem;
  }

  export interface Graphics {
    length: number;
    item(index: number): Graphic;
  }

  export interface Images {
    length: number;
    item(index: number): Image;
  }

  export interface Graphic {
    itemLink: Link | null;
    space: number;
    effectiveResolution: number;
    actualPpi: number[];
    parent: PageItem;
    isValid: boolean;
  }

  export interface Image {
    itemLink: Link | null;
    space: number;
    effectiveResolution: number;
    actualPpi: number[];
    parent: PageItem;
    isValid: boolean;
  }

  export interface Colors {
    length: number;
    item(index: number): Color;
    itemByName(name: string): Color;
    add(properties?: object): Color;
  }

  export interface Color {
    name: string;
    model: number;
    space: number;
    overprintFill: boolean;
    overprintStroke: boolean;
    parentColorGroup?: ColorGroup | null;
    colorValue?: number[];
    isValid: boolean;
  }

  export interface ColorGroups {
    length: number;
    item(index: number): ColorGroup;
    itemByName(name: string): ColorGroup;
  }

  export interface ColorGroup {
    name: string;
    isValid: boolean;
    colorGroupSwatches: ColorGroupSwatches;
  }

  export interface ColorGroupSwatches {
    length: number;
    item(index: number): ColorGroupSwatch;
  }

  export interface ColorGroupSwatch {
    swatchItemRef: Swatch | Color;
    isValid: boolean;
  }

  export interface Swatch {
    name: string;
    isValid: boolean;
  }

  export interface ParagraphStyles {
    length: number;
    item(index: number): ParagraphStyle;
    itemByName(name: string): ParagraphStyle;
  }

  export interface ParagraphStyle {
    name: string;
    hyphenation: boolean;
    justification: number;
    appliedLanguage: Language;
    isValid: boolean;
    pointSize: number;
    leading: number;
    autoLeading: number;
    appliedFont: Font | string;
    fillColor: Swatch | Color;
    kerningMethod: number;
    hyphenationZone: number;
    spaceBefore: number;
    spaceAfter: number;
    leftIndent: number;
    overprintFill: boolean;
  }

  export interface Language {
    name: string;
  }

  export interface CharacterStyles {
    length: number;
    item(index: number): CharacterStyle;
    itemByName(name: string): CharacterStyle;
  }

  export interface CharacterStyle {
    name: string;
    isValid: boolean;
  }

  export interface Links {
    length: number;
    item(index: number): Link;
  }

  export interface Link {
    name: string;
    status: number;
    filePath: string;
    linkResourceURI: string;
    linkType: string;
    id: number;
    links: Links;
    isValid: boolean;
  }

  export interface Fonts {
    length: number;
    item(index: number): Font;
    itemByName(name: string): Font;
  }

  export interface Font {
    name: string;
    fontFamily: string;
    fontStyleName?: string;
    fullName?: string;
    status: number;
    isValid: boolean;
  }

  export interface Story {
    overflows: boolean;
    isValid: boolean;
    textStyleRanges: TextStyleRanges;
    tables: Tables;
    paragraphs?: Paragraphs;
    characters?: Characters;
    itemLayer?: Layer;
  }

  export interface Paragraphs {
    length: number;
    item(index: number): Text;
  }

  export interface Characters {
    length: number;
    item(index: number): Text;
  }

  export interface TextStyleRanges {
    length: number;
    item(index: number): TextStyleRange;
  }

  export interface TextStyleRange {
    appliedFont: Font | string;
    appliedParagraphStyle?: ParagraphStyle;
    appliedCharacterStyle?: CharacterStyle;
    characters?: Characters;
    length: number;
    isValid: boolean;
  }

  export interface Tables {
    length: number;
    item(index: number): Table;
  }

  export interface Table {
    cells: Cells;
    isValid: boolean;
  }

  export interface Cells {
    length: number;
    item(index: number): Cell;
  }

  export interface Cell {
    texts: Texts;
    textStyleRanges?: TextStyleRanges;
    paragraphs?: Paragraphs;
    isValid: boolean;
  }

  export interface Texts {
    length: number;
    item(index: number): Text;
  }

  export interface Text {
    textStyleRanges?: TextStyleRanges;
    paragraphs?: Paragraphs;
    characters?: Characters;
    appliedParagraphStyle?: ParagraphStyle;
    appliedCharacterStyle?: CharacterStyle;
    appliedFont?: Font | string;
    fontStyle?: string;
    pointSize?: number;
    fillColor?: Swatch | Color;
    justification?: number;
    contents?: string;
    horizontalOffset?: number;
    baseline?: number;
    parentTextFrames?: PageItems | PageItem[];
    isValid: boolean;
  }

  export interface Pages {
    length: number;
    item(index: number): Page;
  }

  export const PageSideOptions: {
    LEFT_HAND: number;
    RIGHT_HAND: number;
    UNKNOWN: number;
  };

  export interface Page {
    name: string;
    bounds: number[];
    side?: number;
    documentOffset?: number;
    parent?: Spread | unknown;
    pageItems: PageItems;
    allPageItems: PageItems;
    equals(other: Page): boolean;
    exportFile(format: string, to: File | string, showingOptions?: boolean): void;
    textFrames?: TextFrames;
    polygons?: Polygons;
    groups?: Groups;
    isValid: boolean;
  }

  export interface Spreads {
    length: number;
    item(index: number): Spread;
  }

  export interface Spread {
    pages: Pages;
    pageItems?: PageItems;
    allPageItems?: PageItems;
    isValid: boolean;
  }

  export interface Stories {
    length: number;
    item(index: number): Story;
  }

  export interface PDFExportPresets {
    length: number;
    item(index: number): PDFExportPreset;
    itemByName(name: string): PDFExportPreset;
    add(properties?: object): PDFExportPreset;
  }

  export interface PDFExportPreset {
    name: string;
    isValid: boolean;
    exportReaderSpreads?: boolean;
    exportAsSinglePages?: boolean;
    properties: PDFExportPresetProperties;
    remove(): void;
  }

  export interface PDFExportPreferences {
    exportReaderSpreads: boolean;
    exportAsSinglePages: boolean;
  }

  export interface PDFExportPresetProperties {
    pageMarksOffset: number;
    bleedTop: number;
    bleedBottom: number;
    bleedInside: number;
    bleedOutside: number;
    colorSpace: string;
    pdfColorSpace: string;
    pdfDestinationProfile: string;
    pdfExportCropMarks: boolean;
    pdfExportBleedMarks: boolean;
    pdfExportRegistrationMarks: boolean;
    pdfExportColorBars: boolean;
    pdfExportPageInformation: boolean;
    pdfCompressionType: string;
    pdfJPEGQuality: string;
    pdfMonochromeCompression: string;
    standAlone: boolean;
    optimizePDF: boolean;
    viewPDF: boolean;
    exportLayers: boolean;
    exportGuidesAndGrids: boolean;
    exportNonprintingObjects: boolean;
    exportReaderSpreads: boolean;
    exportAsSinglePages?: boolean;
    createAcrobatLayers: boolean;
    acrobatCompatibility: string;
    pdfMarkType: string;
    useDocumentBleedWithPDF: boolean;
    includeBookmarks: boolean;
    includeHyperlinks: boolean;
    includeICCProfiles: boolean;
    pdfColorConversion: string;
    pdfColorConversionStrategy: string;
  }

  export interface PNGExportPreferences {
    exportResolution: number;
    pngColorSpace: number;
    pngQuality: number;
    transparentBackground: boolean;
    exportAntiAlias: boolean;
  }

  export interface File {
    fsName: string;
    name: string;
    nativePath: string;
  }

  export interface PreflightOption {
    preflightOff: boolean;
    preflightWorkingProfile: PreflightProfile | string;
    preflightScope?: string | number;
    preflightWhichLayers?: number;
    preflightIncludeObjectsOnPasteboard?: boolean;
    preflightIncludeNonprintingObjects?: boolean;
  }

  export interface PreflightProfile {
    name: string;
    isValid: boolean;
  }

  export interface PreflightProfiles {
    length: number;
    item(index: number): PreflightProfile;
    itemByName(name: string): PreflightProfile;
  }

  export interface PreflightProcesses {
    add(
      targetObject: Document,
      appliedProfile: PreflightProfile,
      preflightOptions?: PreflightOption
    ): PreflightProcess;
  }

  export interface PreflightProcess {
    aggregatedResults: unknown;
    processResults: string;
    waitForProcess(waitTime?: number): boolean;
    remove(): void;
    isValid: boolean;
  }
}

declare module "os" {
  export function userInfo(): { username: string };
}

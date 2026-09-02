import type { Cell, Document, Page, PageItem, Story, Text, TextStyleRange } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem, getCollectionItem, getCollectionLength } from "../utils/collection-helpers";
import { isPluginGeneratedItem, isPluginUtilityLayerName } from "../utils/editorial-layer";
import {
  fillsLookSame,
  geometricBoundsOverlap,
  isColoredBackgroundFill,
  isGrayFill,
  isNoneOrPaperFill,
  isSolidPrintBlack,
  isTextFrameItem,
  itemHasPlacedGraphic,
  readFillTint,
  readItemFill,
  readLocalFillColor,
  textFillHasOverprint,
  textFrameFillLeaksFromContents,
} from "../utils/fill-color";
import { walkDirectPageItems } from "../utils/indesign-helpers";

const FIX_DETAILS =
  "Aplique overprint no preenchimento do texto cinza. Preferência: preto 100%.";

interface ColoredSnap {
  bounds: number[];
  pageName: string;
  graphic: boolean;
}

function readBounds(item: PageItem): number[] {
  try {
    const bounds = item.geometricBounds;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      return bounds.map((value) => Number(value));
    }
  } catch {
    // ignore
  }
  return [];
}

function readNumber(getter: () => unknown): number | null {
  try {
    const value = getter();
    if (typeof value === "number" && Number.isFinite(value)) return value;
  } catch {
    // ignore
  }
  return null;
}

function probeGlyph(target: Text | null | undefined): number[] {
  if (!target) return [];
  const left = readNumber(() => target.horizontalOffset);
  const baseline = readNumber(() => target.baseline);
  if (left == null || baseline == null) return [];
  const size = readNumber(() => target.pointSize) || 12;
  const rawRight = readNumber(() => target.endHorizontalOffset);
  const right = rawRight != null && rawRight > left ? rawRight : left + size * 0.55;
  const top = baseline - (readNumber(() => target.ascent) ?? size * 0.8);
  const bottom = baseline + (readNumber(() => target.descent) ?? size * 0.25);
  if (bottom <= top) return [];
  return [top, Math.min(left, right), bottom, Math.max(left, right)];
}

function overlapArea(a: number[], b: number[]): number {
  if (!a || a.length < 4 || !b || b.length < 4) return 0;
  const top = Math.max(Number(a[0]), Number(b[0]));
  const left = Math.max(Number(a[1]), Number(b[1]));
  const bottom = Math.min(Number(a[2]), Number(b[2]));
  const right = Math.min(Number(a[3]), Number(b[3]));
  if (bottom <= top || right <= left) return 0;
  return (bottom - top) * (right - left);
}

function inkSitsOnColor(ink: number[], background: number[]): boolean {
  const area = overlapArea(ink, background);
  if (area <= 0.5) return false;
  const inkW = Math.abs(Number(ink[3]) - Number(ink[1]));
  const inkH = Math.abs(Number(ink[2]) - Number(ink[0]));
  const inkArea = Math.max(0.5, inkW * inkH);
  if (area / inkArea < 0.7) return false;
  const cy = (Number(ink[0]) + Number(ink[2])) / 2;
  const cx = (Number(ink[1]) + Number(ink[3])) / 2;
  return (
    cy >= Number(background[0]) &&
    cy <= Number(background[2]) &&
    cx >= Number(background[1]) &&
    cx <= Number(background[3])
  );
}

function typeNameOf(item: PageItem): string {
  try {
    return item.constructor?.name || "";
  } catch {
    return "";
  }
}

function isFilledShape(item: PageItem): boolean {
  return /rectangle|oval|polygon/i.test(typeNameOf(item));
}

function isPlacedGraphic(item: PageItem): boolean {
  return /image|eps|pdf|pict|wmf|importedpage/i.test(typeNameOf(item));
}

function fillNameKey(fill: { name?: string } | string | null | undefined): string {
  try {
    const name = typeof fill === "string" ? fill : fill?.name || "";
    return name
      .trim()
      .replace(/^\$id\//i, "")
      .replace(/^\[|\]$/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  } catch {
    return "";
  }
}

function normalizeSnippet(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FOLIO_CORE =
  "zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento";
const WRITTEN_FOLIO_RE = new RegExp(`^(${FOLIO_CORE})(\\s+e\\s+(${FOLIO_CORE}))?$`);

function isWrittenFolio(snippet: string): boolean {
  const key = normalizeSnippet(snippet);
  if (!key || key.length > 40) return false;
  return WRITTEN_FOLIO_RE.test(key);
}

function sampleInkFill(target: TextStyleRange | Text): {
  fill: ReturnType<typeof readLocalFillColor>;
  tint: number;
} {
  try {
    const chars = (target as Text).characters;
    const length = getCollectionLength(chars);
    if (length > 0) {
      const first = getCollectionItem<Text>(chars, 0);
      const last = length > 1 ? getCollectionItem<Text>(chars, length - 1) : first;
      for (const character of [first, last]) {
        if (!character) continue;
        const fill = readLocalFillColor(character);
        if (fill) return { fill, tint: readFillTint(character) };
      }
    }
  } catch {
    // cai no preenchimento do range
  }
  return { fill: readLocalFillColor(target), tint: readFillTint(target) };
}

function targetIsGrayWithoutOverprint(target: TextStyleRange | Text): boolean {
  const sampled = sampleInkFill(target);
  const fill = sampled.fill;
  if (!fill) return false;
  const tint = sampled.tint < 0 ? 100 : sampled.tint;
  const key = fillNameKey(fill);
  if (!key || key === "none" || key === "nenhum" || key === "nenhuma" || key === "paper" || key === "papel") {
    return false;
  }
  if (isSolidPrintBlack(fill, tint)) return false;
  if (!isGrayFill(fill, tint)) return false;
  if (textFillHasOverprint(target)) return false;
  try {
    const chars = (target as Text).characters;
    const first = getCollectionItem<Text>(chars, 0);
    if (first && textFillHasOverprint(first)) return false;
  } catch {
    // ignore
  }
  return true;
}

function firstParentFrame(range: TextStyleRange | Text): PageItem | null {
  try {
    const frames = (range as Text).parentTextFrames;
    const item = getCollectionItem<PageItem>(frames, 0);
    if (item?.isValid) return item;
  } catch {
    // ignore
  }
  try {
    const frames = (range as Text & { parentTextFrames?: unknown }).parentTextFrames;
    if (Array.isArray(frames) && frames[0]) return frames[0] as PageItem;
  } catch {
    // ignore
  }
  return null;
}

function pageNameOf(frame: PageItem | null): string {
  if (!frame) return "";
  try {
    const parentPage = frame.parentPage;
    if (parentPage && typeof parentPage === "object" && parentPage.name) {
      return parentPage.name;
    }
  } catch {
    // ignore
  }
  return "";
}

function findParentCell(range: TextStyleRange | Text): Cell | null {
  let current: unknown = range;
  for (let depth = 0; depth < 8; depth++) {
    if (!current || typeof current !== "object") return null;
    try {
      if (/^cell$/i.test((current as { constructor?: { name?: string } }).constructor?.name || "")) {
        return current as Cell;
      }
    } catch {
      return null;
    }
    try {
      current = (current as { parent?: unknown }).parent;
    } catch {
      return null;
    }
  }
  return null;
}

function frameFillLeaksFromStyle(frame: PageItem): boolean {
  const frameFill = readItemFill(frame);
  if (!frameFill) return false;
  try {
    const text = getCollectionItem<Text>(frame.texts, 0);
    if (!text) return false;
    const para = (
      text as Text & { appliedParagraphStyle?: { fillColor?: unknown; name?: string } }
    ).appliedParagraphStyle;
    if (para?.fillColor && fillsLookSame(frameFill, para.fillColor as never)) return true;
    const character = (
      text as Text & { appliedCharacterStyle?: { fillColor?: unknown; name?: string } }
    ).appliedCharacterStyle;
    if (character?.fillColor && fillsLookSame(frameFill, character.fillColor as never)) return true;
  } catch {
    // ignore
  }
  return false;
}

function frameIsChromaticBox(frame: PageItem | null): boolean {
  if (!frame || !isTextFrameItem(frame) || isPluginGeneratedItem(frame)) return false;
  if (textFrameFillLeaksFromContents(frame) || frameFillLeaksFromStyle(frame)) return false;
  const fill = readItemFill(frame);
  if (isNoneOrPaperFill(fill)) return false;
  if (isPagePlate(readBounds(frame), parentPageOf(frame))) return false;
  try {
    const tint = readFillTint(frame);
    if (tint <= 0.5) return false;
  } catch {
    // ignore
  }
  return isColoredBackgroundFill(fill, readFillTint(frame));
}

function snippetOf(range: TextStyleRange | Text): string {
  try {
    const raw = String((range as { contents?: string }).contents || "")
      .replace(/\s+/g, " ")
      .trim();
    return raw.slice(0, 52);
  } catch {
    return "";
  }
}

function probeRangeEnds(range: TextStyleRange | Text): number[][] {
  const probes: number[][] = [];
  try {
    const chars = (range as Text).characters;
    const length = getCollectionLength(chars);
    if (length <= 0) return probes;
    const first = getCollectionItem<Text>(chars, 0);
    const last = getCollectionItem<Text>(chars, length - 1);
    const a = probeGlyph(first);
    const b = length > 1 ? probeGlyph(last) : [];
    if (a.length >= 4) probes.push(a);
    if (b.length >= 4) probes.push(b);
  } catch {
    // ignore
  }
  return probes;
}

function readPageBounds(page: Page | null): number[] {
  if (!page) return [];
  try {
    const bounds = page.bounds;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      return bounds.map((value) => Number(value));
    }
  } catch {
    // ignore
  }
  return [];
}

function boundsArea(bounds: number[]): number {
  if (bounds.length < 4) return 0;
  return Math.abs(Number(bounds[2]) - Number(bounds[0])) * Math.abs(Number(bounds[3]) - Number(bounds[1]));
}

function isPagePlate(bounds: number[], page: Page | null): boolean {
  const pageArea = boundsArea(readPageBounds(page));
  const itemArea = boundsArea(bounds);
  return pageArea > 0 && itemArea / pageArea >= 0.55;
}

function parentPageOf(frame: PageItem | null): Page | null {
  if (!frame) return null;
  try {
    const parentPage = frame.parentPage;
    if (parentPage && typeof parentPage === "object") return parentPage as Page;
  } catch {
    // ignore
  }
  return null;
}

function pushColored(bucket: ColoredSnap[], item: PageItem, pageName: string, page: Page | null): void {
  if (!item?.isValid || isPluginGeneratedItem(item) || isTextFrameItem(item)) return;
  const bounds = readBounds(item);
  if (bounds.length < 4) return;
  const graphic = isPlacedGraphic(item) || itemHasPlacedGraphic(item);
  if (graphic) {
    bucket.push({ bounds, pageName, graphic: true });
    return;
  }
  if (isPagePlate(bounds, page)) return;
  if (isFilledShape(item) && isColoredBackgroundFill(readItemFill(item), readFillTint(item))) {
    bucket.push({ bounds, pageName, graphic: false });
  }
}

function probeBelongsToFrame(probe: number[], frameBounds: number[]): boolean {
  if (probe.length < 4 || frameBounds.length < 4) return false;
  return overlapArea(probe, frameBounds) > 0 && inkSitsOnColor(probe, frameBounds);
}

function collectColoredByPage(doc: Document): Map<string, ColoredSnap[]> {
  const byPage = new Map<string, ColoredSnap[]>();

  walkDirectPageItems(doc, (item, page, pageName) => {
    if (!pageName) return;
    let list = byPage.get(pageName);
    if (!list) {
      list = [];
      byPage.set(pageName, list);
    }
    pushColored(list, item, pageName, page);
  });

  return byPage;
}

function pushIssue(
  issues: ValidationIssue[],
  seen: Set<string>,
  key: string,
  page: string,
  preview: string
): void {
  if (seen.has(key)) return;
  seen.add(key);
  issues.push({
    message: "Cinza sobre fundo colorido sem overprint",
    page,
    object: preview ? `Texto (“${preview}”)` : "Texto cinza",
    details: FIX_DETAILS,
  });
}

export class CinzaOverprintValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.CINZA_OVERPRINT;
  readonly name = "Cinza sobre fundo colorido";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const coloredByPage = collectColoredByPage(doc);
      const seen = new Set<string>();

      forEachCollectionItem<Story>(doc.stories, (story) => {
        if (!story?.isValid) return;
        try {
          if (isPluginUtilityLayerName(story.itemLayer?.name || "")) return;
        } catch {
          // ignore
        }

        const ranges = story.textStyleRanges;
        const rangeCount = getCollectionLength(ranges);
        for (let i = 0; i < rangeCount; i++) {
          const run = getCollectionItem<TextStyleRange | Text>(ranges, i);
          if (!run || !targetIsGrayWithoutOverprint(run)) continue;

          const preview = snippetOf(run);
          const folio = isWrittenFolio(preview);
          const cell = findParentCell(run);
          if (cell) {
            try {
              if (isColoredBackgroundFill(cell.fillColor, readFillTint(cell))) {
                pushIssue(issues, seen, `cell::${pageNameOf(firstParentFrame(run))}::${preview}`, pageNameOf(firstParentFrame(run)), preview);
              }
            } catch {
              // ignore
            }
            continue;
          }

          const frame = firstParentFrame(run);
          if (!frame || isPluginGeneratedItem(frame)) continue;
          const pageName = pageNameOf(frame);
          const frameBounds = readBounds(frame);

          if (!folio && frameIsChromaticBox(frame)) {
            pushIssue(issues, seen, `box::${pageName}::${preview}`, pageName, preview);
            continue;
          }

          const snaps = coloredByPage.get(pageName);
          if (!snaps?.length) continue;
          if (frameBounds.length < 4) continue;
          const nearby = snaps.filter((snap) => geometricBoundsOverlap(frameBounds, snap.bounds));
          if (!nearby.length) continue;

          const probes = probeRangeEnds(run).filter((ink) => probeBelongsToFrame(ink, frameBounds));
          if (!probes.length) continue;

          const under = nearby.filter((snap) => probes.some((ink) => inkSitsOnColor(ink, snap.bounds)));
          if (!under.length) continue;
          if (folio && !under.some((snap) => snap.graphic)) continue;

          pushIssue(issues, seen, `${pageName}::${preview}`, pageName, preview);
        }
      });

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

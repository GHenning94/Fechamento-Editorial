import type { Document, Link } from "indesign";
import { createAllValidators } from "../validators";
import { IValidator } from "../models/validator";
import { summarizeResults, ValidationResult, ValidationSummary } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import {
  clearFileColorSpaceCache,
  coerceFilePath,
  prefetchColorSpacesFromLinks,
} from "../utils/file-color-space";
import {
  clearInDesignSelection,
  getActiveDocument,
  runInDesignHeavyMutation,
  runInDesignReadOnly,
} from "../utils/indesign-runtime";
import { yieldForUi, yieldToHost } from "../utils/yield-to-host";
import { withValidationSession } from "./validation-session";
import {
  restoreLayerLocks,
  snapshotLayerLocks,
  unlockAllLayers,
  withLayersUnlockedForValidation,
  type LayerLockSnapshot,
} from "../utils/layer-lock";

export type ProgressCallback = (current: number, total: number, label: string) => void;

export class ChecklistCancelledError extends Error {
  constructor(message = "Checklist cancelado.") {
    super(message);
    this.name = "ChecklistCancelledError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ChecklistCancelledError();
  }
}

function folderOf(path: string): string {
  const normalized = coerceFilePath(path).replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "";
}

function linkPathCandidates(link: Link, docDir: string): string[] {
  const name = link.name || "";
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (value: unknown): void => {
    const path = coerceFilePath(value);
    if (!path || seen.has(path)) return;
    seen.add(path);
    out.push(path);
  };
  push(link.filePath);
  push(link.linkResourceURI);
  if (docDir && name) {
    push(`${docDir}/${name}`);
    push(`${docDir}/Links/${name}`);
    push(`${docDir}/links/${name}`);
  }
  return out;
}

function collectLinkColorTargets(): Array<{ id: number; name: string; filePaths: string[] }> {
  const doc = getActiveDocument();
  let docDir = "";
  try {
    docDir = folderOf(coerceFilePath((doc as Document & { filePath?: unknown }).filePath));
  } catch {
    // ignore
  }
  if (!docDir) {
    try {
      docDir = folderOf(coerceFilePath((doc as Document & { fullName?: unknown }).fullName));
    } catch {
      // ignore
    }
  }
  const links: Array<{ id: number; name: string; filePaths: string[] }> = [];
  forEachCollectionItem<Link>(doc.links, (link) => {
    if (!link?.isValid) return;
    const filePaths = linkPathCandidates(link, docDir);
    if (filePaths.length === 0) return;
    links.push({
      id: link.id,
      name: link.name || "",
      filePaths,
    });
  });
  return links;
}

export function isChecklistCancelled(error: unknown): boolean {
  return (
    error instanceof ChecklistCancelledError ||
    (error instanceof Error && error.name === "ChecklistCancelledError")
  );
}

const BETWEEN_VALIDATOR_MS = 100;
const AFTER_HEAVY_VALIDATOR_MS = 180;

const GRAPHICS_VALIDATOR_IDS = new Set<string>([
  VALIDATOR_IDS.IMAGENS_COLORSPACE,
  VALIDATOR_IDS.RESOLUCAO,
  VALIDATOR_IDS.IMAGENS_FORMATO,
]);

const HEAVY_VALIDATOR_IDS = new Set<string>([
  VALIDATOR_IDS.IMAGENS_COLORSPACE,
  VALIDATOR_IDS.RESOLUCAO,
  VALIDATOR_IDS.OVERPRINT,
  VALIDATOR_IDS.CINZA_OVERPRINT,
  VALIDATOR_IDS.LINKS,
  VALIDATOR_IDS.IMAGENS_FORMATO,
  VALIDATOR_IDS.FIOS,
  VALIDATOR_IDS.PASTEBOARD,
  VALIDATOR_IDS.OVERTEXT,
]);

const DIRECT_VALIDATOR_IDS = new Set<string>([
  VALIDATOR_IDS.OVERTEXT,
  VALIDATOR_IDS.PASTEBOARD,
]);

function shouldBatchValidators(current: IValidator, next?: IValidator): boolean {
  if (!next) return false;
  return GRAPHICS_VALIDATOR_IDS.has(current.id) && GRAPHICS_VALIDATOR_IDS.has(next.id);
}

function failedResult(validator: IValidator, error: unknown): ValidationResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    validatorId: validator.id,
    validatorName: validator.name,
    severity: "error",
    issues: [{ message: `Falha na validação: ${message}` }],
  };
}

function runValidatorsOnDoc(doc: Document, batch: IValidator[]): ValidationResult[] {
  return withValidationSession(doc, () =>
    batch.map((item) => {
      try {
        return item.validate(doc);
      } catch (error) {
        return failedResult(item, error);
      }
    })
  );
}

function prepareLayerAccess(): LayerLockSnapshot[] {
  const doc = getActiveDocument();
  const snapshot = snapshotLayerLocks(doc);
  unlockAllLayers(doc);
  return snapshot;
}

function restoreLayerAccess(snapshot: LayerLockSnapshot[]): void {
  try {
    restoreLayerLocks(getActiveDocument(), snapshot);
  } catch {
    // ignore
  }
}

export class ChecklistRunner {
  run(doc: Document, onProgress?: ProgressCallback): ValidationSummary {
    return withLayersUnlockedForValidation(doc, () =>
      withValidationSession(doc, () => {
        const validators = createAllValidators();
        const results: ValidationResult[] = [];
        const total = validators.length;

        for (let i = 0; i < validators.length; i++) {
          const validator = validators[i];
          onProgress?.(i + 1, total, validator.name);
          try {
            results.push(validator.validate(doc));
          } catch (error) {
            results.push(failedResult(validator, error));
          }
        }

        return summarizeResults(results);
      })
    );
  }

  async runAsync(onProgress?: ProgressCallback, signal?: AbortSignal): Promise<ValidationSummary> {
    throwIfAborted(signal);
    clearFileColorSpaceCache();
    const validators = createAllValidators();
    const results: ValidationResult[] = [];
    const total = validators.length;

    clearInDesignSelection();
    await yieldForUi();
    throwIfAborted(signal);

    try {
      const linkTargets = runInDesignReadOnly("EDITORIAL AUTOCLOSE - Links para espaço de cor", () =>
        collectLinkColorTargets()
      );
      onProgress?.(0, total, "Lendo perfil de cor dos arquivos");
      await prefetchColorSpacesFromLinks(linkTargets, signal);
    } catch (error) {
      if (error instanceof ChecklistCancelledError) throw error;
      // segue a validação mesmo se a leitura de arquivo falhar
    }

    throwIfAborted(signal);

    let lockSnapshot: LayerLockSnapshot[] = [];
    try {
      lockSnapshot = runInDesignReadOnly("EDITORIAL AUTOCLOSE - Liberar layers", () =>
        prepareLayerAccess()
      );
    } catch {
      lockSnapshot = [];
    }

    try {
      for (let index = 0; index < validators.length; index++) {
        throwIfAborted(signal);
        const validator = validators[index];
        const nextValidator = validators[index + 1];
        const batch = shouldBatchValidators(validator, nextValidator)
          ? [validator, nextValidator]
          : [validator];

        if (batch.length === 2) {
          index += 1;
        }

        const label = batch.map((item) => item.name).join(" + ");
        onProgress?.(index + 1, total, label);
        await yieldForUi();
        throwIfAborted(signal);

        const useDirect = batch.some((item) => DIRECT_VALIDATOR_IDS.has(item.id));
        try {
          const batchResults = useDirect
            ? runInDesignHeavyMutation(`EDITORIAL AUTOCLOSE - ${batch[0].id}`, () => {
                const doc = getActiveDocument();
                return runValidatorsOnDoc(doc, batch);
              })
            : runInDesignReadOnly(`EDITORIAL AUTOCLOSE - ${batch[0].id}`, () => {
                const doc = getActiveDocument();
                return runValidatorsOnDoc(doc, batch);
              });
          results.push(...batchResults);
        } catch (error) {
          for (const item of batch) {
            results.push(failedResult(item, error));
          }
        }

        const isHeavy = batch.some((item) => HEAVY_VALIDATOR_IDS.has(item.id));
        await yieldToHost(isHeavy ? AFTER_HEAVY_VALIDATOR_MS : BETWEEN_VALIDATOR_MS);
        throwIfAborted(signal);
      }
    } finally {
      try {
        runInDesignReadOnly("EDITORIAL AUTOCLOSE - Restaurar layers", () => {
          restoreLayerAccess(lockSnapshot);
          return true;
        });
      } catch {
        try {
          restoreLayerAccess(lockSnapshot);
        } catch {
          // ignore
        }
      }
    }

    onProgress?.(total, total, "Finalizando");
    await yieldForUi();
    throwIfAborted(signal);
    return summarizeResults(results);
  }

  runForClosure(onProgress?: ProgressCallback): ValidationSummary {
    onProgress?.(1, 1, "Checklist editorial");
    clearInDesignSelection();
    const summary = runInDesignReadOnly("EDITORIAL AUTOCLOSE - Checklist Fechamento", () =>
      this.run(getActiveDocument())
    );
    return summary;
  }
}

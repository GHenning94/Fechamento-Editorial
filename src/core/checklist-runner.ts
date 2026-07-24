import type { Document } from "indesign";
import { createAllValidators } from "../validators";
import { IValidator } from "../models/validator";
import { summarizeResults, ValidationResult, ValidationSummary } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import {
  clearInDesignSelection,
  getActiveDocument,
  runInDesignReadOnly,
} from "../utils/indesign-runtime";
import { yieldForUi, yieldToHost } from "../utils/yield-to-host";
import { withValidationSession } from "./validation-session";

export type ProgressCallback = (current: number, total: number, label: string) => void;

/** Pausas maiores entre etapas — evita travar o InDesign em máquinas mais lentas. */
const BETWEEN_VALIDATOR_MS = 120;
const AFTER_HEAVY_VALIDATOR_MS = 220;

const GRAPHICS_VALIDATOR_IDS = new Set<string>([
  VALIDATOR_IDS.IMAGENS_COLORSPACE,
  VALIDATOR_IDS.RESOLUCAO,
]);

const HEAVY_VALIDATOR_IDS = new Set<string>([
  VALIDATOR_IDS.IMAGENS_COLORSPACE,
  VALIDATOR_IDS.RESOLUCAO,
  VALIDATOR_IDS.OVERPRINT,
  VALIDATOR_IDS.LINKS,
  VALIDATOR_IDS.FIOS,
  VALIDATOR_IDS.PASTEBOARD,
  VALIDATOR_IDS.OVERTEXT,
  VALIDATOR_IDS.MEMORIAL_DESCRITIVO,
]);

function shouldBatchValidators(current: IValidator, next?: IValidator): boolean {
  if (!next) {
    return false;
  }
  return GRAPHICS_VALIDATOR_IDS.has(current.id) && GRAPHICS_VALIDATOR_IDS.has(next.id);
}

export class ChecklistRunner {
  run(doc: Document, onProgress?: ProgressCallback): ValidationSummary {
    return withValidationSession(doc, () => {
      const validators = createAllValidators();
      const results: ValidationResult[] = [];
      const total = validators.length;

      for (let i = 0; i < validators.length; i++) {
        const validator = validators[i];
        if (onProgress) {
          onProgress(i + 1, total, validator.name);
        }
        results.push(validator.validate(doc));
      }

      return summarizeResults(results);
    });
  }

  async runAsync(onProgress?: ProgressCallback): Promise<ValidationSummary> {
    const validators = createAllValidators();
    const results: ValidationResult[] = [];
    const total = validators.length;

    clearInDesignSelection();
    await yieldForUi();

    for (let index = 0; index < validators.length; index++) {
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

      // Atualiza a UI antes do doScript (que bloqueia o host)
      await yieldForUi();

      const batchResults = runInDesignReadOnly(`EDITORIAL AUTOCLOSE — ${batch[0].id}`, () => {
        const doc = getActiveDocument();
        return withValidationSession(doc, () => batch.map((item) => item.validate(doc)));
      });

      results.push(...batchResults);

      const isHeavy = batch.some((item) => HEAVY_VALIDATOR_IDS.has(item.id));
      await yieldToHost(isHeavy ? AFTER_HEAVY_VALIDATOR_MS : BETWEEN_VALIDATOR_MS);
    }

    clearInDesignSelection();
    await yieldForUi();

    return summarizeResults(results);
  }

  /** Um único doScript no fechamento — reduz instabilidade do InDesign. */
  runForClosure(onProgress?: ProgressCallback): ValidationSummary {
    onProgress?.(1, 1, "Checklist editorial");
    clearInDesignSelection();
    const summary = runInDesignReadOnly("EDITORIAL AUTOCLOSE — Checklist Fechamento", () =>
      this.run(getActiveDocument())
    );
    clearInDesignSelection();
    return summary;
  }
}

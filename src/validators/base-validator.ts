import type { Document } from "indesign";
import { IValidator } from "../models/validator";
import { ValidationResult } from "../models/validation-result";

export abstract class BaseValidator implements IValidator {
  abstract readonly id: string;
  abstract readonly name: string;

  abstract validate(doc: Document): ValidationResult;

  protected safeValidate(doc: Document, fn: () => ValidationResult): ValidationResult {
    try {
      return fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        validatorId: this.id,
        validatorName: this.name,
        severity: "error",
        issues: [{ message: `Falha na validação: ${message}` }],
      };
    }
  }
}

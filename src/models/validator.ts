import type { Document, Page, PageItem } from "indesign";
import { ValidationResult } from "../models/validation-result";

export interface IValidator {
  readonly id: string;
  readonly name: string;
  validate(doc: Document): ValidationResult;
}

export type PageItemCallback = (item: PageItem, page: Page | null, pageName: string) => void | boolean;

export interface GraphicInfo {
  pageName: string;
  imageName: string;
  dpi: number;
  colorSpace: string;
  pageItem: PageItem;
  fileName?: string;
  filePath?: string;
  linkId?: number;
}

export interface StrokeInfo {
  pageName: string;
  objectName: string;
  weight: number;
  pageItem: PageItem;
}

import type { Document, PageItem, Story } from "indesign";
import { BaseValidator } from "./base-validator";
import { createResult, ValidationIssue } from "../models/validation-result";
import { VALIDATOR_IDS } from "../utils/constants";
import { forEachCollectionItem } from "../utils/collection-helpers";
import { forEachPage, getPageItemDisplayName } from "../utils/indesign-helpers";

function isTruthyOverflow(value: unknown): boolean {
  return value === true || value === 1;
}

function readOverflows(item: { overflows?: unknown; properties?: { overflows?: unknown } }): boolean {
  try {
    if (isTruthyOverflow(item.overflows)) return true;
  } catch {
    // ignore
  }
  try {
    if (isTruthyOverflow(item.properties?.overflows)) return true;
  } catch {
    // ignore
  }
  return false;
}

function storyPreview(story: Story): string {
  try {
    const raw = String((story as Story & { contents?: string }).contents || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "Texto";
    return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
  } catch {
    return "Texto";
  }
}

function itemPageName(item: PageItem): string {
  try {
    const parentPage = item.parentPage;
    if (parentPage && typeof parentPage === "object" && parentPage.name) {
      return parentPage.name;
    }
  } catch {
    // ignore
  }
  return "Documento";
}

export class OvertextValidator extends BaseValidator {
  readonly id = VALIDATOR_IDS.OVERTEXT;
  readonly name = "Overset Text";

  validate(doc: Document) {
    return this.safeValidate(doc, () => {
      const issues: ValidationIssue[] = [];
      const seen = new Set<string>();

      const pushIssue = (pageName: string, objectName: string, extraKey = ""): void => {
        const key = `${pageName}::${objectName}::${extraKey}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({
          message: "Texto em excesso (overset)",
          page: pageName,
          object: objectName,
          details: "A caixa de texto possui conteúdo que não cabe no quadro.",
        });
      };

      const considerItem = (item: PageItem | null | undefined, pageName: string): void => {
        if (!item?.isValid) return;
        if (!readOverflows(item)) return;
        const objectName = getPageItemDisplayName(item);
        const bounds = (item.geometricBounds || []).join(",");
        pushIssue(pageName, objectName, bounds);
      };

      forEachPage(doc, (page, pageName) => {
        try {
          forEachCollectionItem<PageItem>(page.textFrames, (frame) => {
            considerItem(frame, pageName);
          });
        } catch {
          // ignore
        }
      });

      try {
        forEachCollectionItem<Story>(doc.stories, (story) => {
          if (!story || !readOverflows(story)) return;

          const containers = (story as Story & { textContainers?: unknown }).textContainers;
          let reported = false;

          if (containers) {
            try {
              forEachCollectionItem<PageItem>(containers, (frame) => {
                if (!frame?.isValid) return;
                considerItem(frame, itemPageName(frame));
                reported = true;
              });
            } catch {
              // ignore
            }
          }

          if (!reported) {
            pushIssue("Documento", `Caixa de texto (“${storyPreview(story)}”)`, "story");
          }
        });
      } catch {
        // ignore
      }

      return createResult(this.id, this.name, issues, "error");
    });
  }
}

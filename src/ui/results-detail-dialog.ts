import { onActionActivate } from "./action-control";

type UxpDialog = HTMLDialogElement & {
  uxpShowModal?(options: { title: string }): Promise<unknown>;
  close(returnValue?: string): void;
};

export type ResultDetailKind = "approved" | "warning" | "error";

export interface ResultDetailOptions {
  title: string;
  kind: ResultDetailKind;
  html: string;
  onIgnore?: (key: string) => void;
}

let dialogInstance: UxpDialog | null = null;

function getResultsDetailDialog(): UxpDialog {
  if (dialogInstance) {
    return dialogInstance;
  }

  const dialog = document.createElement("dialog") as UxpDialog;
  dialog.id = "editorial-results-detail-dialog";
  dialog.innerHTML = `
    <div class="results-detail-dialog-content">
      <div class="results-detail-dialog-header">
        <h2 id="results-detail-title" class="results-detail-dialog-heading"></h2>
        <div id="results-detail-close" class="btn btn-secondary results-detail-close" role="button" tabindex="0">
          Fechar
        </div>
      </div>
      <ul id="results-detail-list" class="results-detail-list result-list"></ul>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeBtn = dialog.querySelector("#results-detail-close") as HTMLElement;
  onActionActivate(closeBtn, () => {
    dialog.close();
  });

  dialogInstance = dialog;
  return dialog;
}

export async function showResultsDetailDialog(options: ResultDetailOptions): Promise<void> {
  const dialog = getResultsDetailDialog();
  const titleEl = dialog.querySelector("#results-detail-title") as HTMLElement;
  const listEl = dialog.querySelector("#results-detail-list") as HTMLElement;
  const content = dialog.querySelector(".results-detail-dialog-content") as HTMLElement;

  titleEl.textContent = options.title;
  listEl.innerHTML = options.html || '<li class="empty-item">Nenhum item</li>';
  content.setAttribute("data-kind", options.kind);

  if (options.onIgnore) {
    const buttons = listEl.querySelectorAll<HTMLElement>("[data-ignore-key]");
    buttons.forEach((button) => {
      const key = button.getAttribute("data-ignore-key");
      if (!key) return;
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onIgnore?.(key);
        button.closest("li")?.remove();
        if (!listEl.querySelector("li")) {
          listEl.innerHTML = '<li class="empty-item">Nenhum item</li>';
        }
      };
    });
  }

  try {
    if (typeof dialog.uxpShowModal === "function") {
      await dialog.uxpShowModal({ title: options.title });
    } else {
      dialog.showModal();
      await new Promise<void>((resolve) => {
        const onClose = (): void => {
          dialog.removeEventListener("close", onClose);
          resolve();
        };
        dialog.addEventListener("close", onClose);
      });
    }
  } catch {
    // usuário fechou / host cancelou
  }
}

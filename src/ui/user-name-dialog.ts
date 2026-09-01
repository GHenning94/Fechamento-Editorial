import { PackageCancelledError } from "../utils/file-system";
import { showNativeConfirm, showNativePrompt } from "./native-indesign-dialog";

export async function promptUserNameDialog(defaultName: string): Promise<string> {
  const result = showNativePrompt(
    "Informe seu nome para constar no relatório de fechamento.",
    defaultName,
    "Nome para o relatório"
  );

  const trimmed = String(result || "").trim();
  if (!trimmed) {
    throw new PackageCancelledError("Fechamento cancelado.");
  }

  return trimmed;
}

export async function promptConfirmDialog(
  message?: string,
  title?: string
): Promise<boolean> {
  return showNativeConfirm(
    message ||
      [
        "Não existe a layer de memorial descritivo neste documento.",
        "Os PDFs serão gerados mesmo assim, sem essa layer.",
        "Deseja fechar o material mesmo assim?",
      ].join("\n"),
    title || "Layer de memorial descritivo"
  );
}

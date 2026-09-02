import { getIssueSeverity, ValidationIssue, ValidationSummary } from "../models/validation-result";
import { VALIDATOR_IDS as V } from "../utils/constants";
import { formatIssueLine } from "../utils/issue-text";
import type { ChecklistPdfItem } from "./checklist-pdf";

export const ORIGINAL_CHECKLIST_INSTRUCTIONS = [
  "Esta checklist deve ser preenchida inicialmente pelo(s) responsável(eis) do projeto e completada por qualquer um do time que venha a finalizar o processo.",
  "Será o documento de referência para atestar a qualidade e cercar possíveis erros que possam ser escalonados durante o processo de produção de arte.",
  "Este documento deve acompanhar o material em todos seus processos, inclusive depois do direcionado aos usuários finais.",
];

export interface ChecklistArtifacts {
  packageGenerated?: boolean;
  idmlGenerated?: boolean;
  pdfArteGenerated?: boolean;
  pdfEstilosGenerated?: boolean;
}

interface OriginalRowSpec {
  id: string;
  label: string;
  validatorIds?: string[];
  issueFilter?: (issue: ValidationIssue, validatorId: string) => boolean;
  packageArtifacts?: boolean;
}

function blob(issue: ValidationIssue): string {
  return `${issue.message} ${issue.object || ""} ${issue.details || ""}`.toLowerCase();
}

function mentionsGuias(issue: ValidationIssue): boolean {
  return /guias/.test(blob(issue));
}

function mentionsRendimento(issue: ValidationIssue): boolean {
  return /rendimento/.test(blob(issue));
}

const ORIGINAL_ROWS: OriginalRowSpec[] = [
  {
    id: "nomenclatura-arquivos",
    label:
      "Nomenclatura dos arquivos (CAE/Tipo de produto/Selo/Segmento/Ano/Caderno/Obra/Disciplina/Modulo/CAouMP) sempre nesta ordem. Ex.: 987654_PG_AtEFAI1_APIS_HGC_PR; 987654_Capa_AnEM2C1_FGB_Geo_CA, etc",
  },
  {
    id: "formato-arquivo",
    label: "Verificar formato do arquivo",
  },
  {
    id: "layer-memorial",
    label: "Criar layer do memorial descritivo (ESTILOS)",
    validatorIds: [V.LAYERS_OBRIGATORIAS, V.LAYERS_NOMENCLATURA],
    issueFilter: (issue, validatorId) => {
      if (validatorId === V.LAYERS_OBRIGATORIAS || validatorId === V.LAYERS_NOMENCLATURA) {
        return !mentionsGuias(issue) && !mentionsRendimento(issue);
      }
      return true;
    },
  },
  {
    id: "layer-guias",
    label: "Criar layer e aplicar marcação de espiral e mancha (GUIAS)",
    validatorIds: [V.LAYERS_OBRIGATORIAS, V.LAYERS_NOMENCLATURA, V.GUIAS_COLOR, V.OVERPRINT],
    issueFilter: (issue, validatorId) => {
      if (validatorId === V.LAYERS_OBRIGATORIAS || validatorId === V.LAYERS_NOMENCLATURA) {
        return mentionsGuias(issue);
      }
      return true;
    },
  },
  {
    id: "paginas-mestras",
    label: "Organizar páginas mestras",
  },
  {
    id: "swatches",
    label:
      "Swatches - Aplicar nomenclatura padrão (CorX, CorProf, FACA, VERNIZ, PANTONE), verificar se todos estão em CMYK (converter e/ou apagar cores RGB e outras não utilizadas. Cor spot apenas CorProf e FACA)",
    validatorIds: [V.CORES],
  },
  {
    id: "cinza-overprint",
    label: "Usar cinza nos textos sobre fundo colorido somente com overprint. Preferência por preto 100%",
  },
  {
    id: "corprof",
    label: "CorProf em magenta 100% spot com overprint (usar nomenclatura em destaque)",
    validatorIds: [V.CORPROF],
  },
  {
    id: "faca",
    label: "FACA cor spot 100% com overprint (usar nomenclatura em destaque)",
  },
  {
    id: "estilos-paleta",
    label: "Verificar se os estilos estão de acordo com a paleta padrão da editora",
    validatorIds: [
      V.ESTILOS_NOMENCLATURA,
      V.ESTILOS_IDIOMA,
      V.ESTILOS_PADRAO_PROFESSOR,
      V.ESTILOS_PADRAO_CREDITO,
      V.ESTILOS_PADRAO_FONTE,
      V.HIFENIZACAO,
      V.OVERTEXT,
    ],
  },
  {
    id: "fios",
    label: "Padronizar cores e espessuras dos fios 0.3 pt mínimo e overprint (resposta; mapa; gráficos; grafismos; etc)",
    validatorIds: [V.FIOS],
  },
  {
    id: "texturas",
    label:
      "Texturas e elementos gráficos aplicar como imagem (TIFF, JPG, PSD, EPS). Evitar aplicar diretamente no INDD para que os arquivos não fiquem muito pesados",
    validatorIds: [V.RESOLUCAO],
  },
  {
    id: "links-cmyk",
    label: "Links do projeto todos em CMYK, incluindo máscaras e outros itens de acabamento",
    validatorIds: [V.LINKS, V.IMAGENS_COLORSPACE],
  },
  {
    id: "fontes",
    label: "Pasta de fontes com a família completa (não repetir fonte similares. Ex.: Univers e UniversLT)",
    validatorIds: [V.FONTES, V.FONTES_DUPLICADAS],
  },
  {
    id: "pasteboard",
    label: "Limpar pasteboard",
    validatorIds: [V.PASTEBOARD],
  },
  {
    id: "package",
    label:
      "Package contendo IDML, INDD, pasta de links, pasta de fontes, PDF (CTP Arte com sangria 20mm), memorial descritivo e imagem da primeira capa (PNG, Max, RGB Color, 300dpi, overprint), primeira capa simples pra banca.",
    packageArtifacts: true,
  },
  {
    id: "pasta-abertos",
    label:
      "Direcionar pasta do arquivo aberto para a produção de arte ou AGM em ARTES-PROD na pasta ABERTOS do material",
  },
  {
    id: "onedrive",
    label:
      "Disponibilizar cópia do PDF da PV, Memorial, Capas, PNG e/ou outros na pasta de design no OneDrive do ano de produção vigente",
  },
];

function formatIssue(summary: ValidationSummary, issue: ValidationIssue, validatorId: string): string {
  const result = (summary.results || []).find((item) => item.validatorId === validatorId);
  const text = `${issue.message || ""} ${issue.value || ""}`.toLowerCase();
  const unidentified =
    text.includes("não identificado") ||
    text.includes("nao identificado") ||
    (issue.value || "").trim().toLowerCase() === "desconhecido";
  const kind =
    issue.severity === "warning" || unidentified
      ? "Alerta"
      : result && getIssueSeverity(result, issue) === "warning"
        ? "Alerta"
        : "Erro";
  return formatIssueLine(issue, {
    kind,
    separator: " - ",
    includeDetails: true,
  });
}

export function mapOriginalChecklist(
  summary: ValidationSummary | null,
  artifacts?: ChecklistArtifacts
): ChecklistPdfItem[] {
  const results = summary?.results || [];

  return ORIGINAL_ROWS.map((row) => {
    if (row.packageArtifacts) {
      const ready = Boolean(
        artifacts?.packageGenerated && artifacts?.idmlGenerated && artifacts?.pdfArteGenerated
      );
      return {
        label: row.label,
        checked: ready,
        details: ready
          ? []
          : artifacts
            ? ["Package, IDML ou PDF arte ainda nao gerados neste fechamento."]
            : [],
      };
    }

    if (!row.validatorIds || row.validatorIds.length === 0) {
      return { label: row.label, checked: false, details: [] };
    }

    const details: string[] = [];
    const ranIds = new Set<string>();
    for (const result of results) {
      if (!row.validatorIds.includes(result.validatorId)) continue;
      ranIds.add(result.validatorId);
      const issues = Array.isArray(result.issues) ? result.issues : [];
      for (const issue of issues) {
        if (row.issueFilter && !row.issueFilter(issue, result.validatorId)) continue;
        details.push(formatIssue(summary as ValidationSummary, issue, result.validatorId));
      }
    }

    const allRan = row.validatorIds.every((id) => ranIds.has(id));
    const hasError = details.some((line) => line.startsWith("Erro:"));
    return {
      label: row.label,
      checked: allRan && details.length === 0,
      details,
      reviewKind: details.length === 0 ? undefined : hasError ? "error" : "warning",
    };
  });
}

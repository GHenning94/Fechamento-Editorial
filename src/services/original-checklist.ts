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
  section: ChecklistPdfItem["section"];
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
    id: "formato-arquivo",
    section: "GERAL",
    label: "Verificar formato do arquivo de acordo com o pedido fornecido no início do projeto.",
  },
  {
    id: "swatches",
    section: "GERAL",
    label:
      "Swatches - Aplicar nomenclatura padrão (CorPrincipal, CorApoio, CorSecundaria, CorProf, FACA, VERNIZ, PANTONE), verificar se todos estão em CMYK (converter e/ou apagar cores RGB e outras não utilizadas. Cor spot apenas CorProf e FACA)",
    validatorIds: [V.CORES],
  },
  {
    id: "corprof",
    section: "GERAL",
    label: "CorProf em magenta 100% spot com overprint (usar nomenclatura em destaque)",
    validatorIds: [V.CORPROF],
  },
  {
    id: "faca",
    section: "GERAL",
    label: "FACA cor spot 100% com overprint (usar nomenclatura em destaque)",
  },
  {
    id: "cinza-overprint",
    section: "GERAL",
    label: "Usar cinza nos textos sobre fundo colorido somente com overprint. Preferência por preto 100%",
    validatorIds: [V.CINZA_OVERPRINT],
  },
  {
    id: "fios",
    section: "GERAL",
    label: "Padronizar cores e espessuras dos fios 0.3 pt mínimo e overprint (resposta; mapa; gráficos; grafismos; etc)",
    validatorIds: [V.FIOS],
  },
  {
    id: "texturas",
    section: "GERAL",
    label:
      "Texturas e elementos gráficos aplicar como imagem (TIFF, JPG, PSD, EPS). Evitar aplicar diretamente no INDD para que os arquivos não fiquem muito pesados",
    validatorIds: [V.RESOLUCAO, V.IMAGENS_FORMATO],
  },
  {
    id: "links-cmyk",
    section: "GERAL",
    label: "Links do projeto todos em CMYK, incluindo máscaras e outros itens de acabamento",
    validatorIds: [V.LINKS, V.IMAGENS_COLORSPACE],
  },
  {
    id: "fontes",
    section: "GERAL",
    label:
      "Pasta de fontes com as variações usadas no projeto (não repetir fonte similares. Ex.: Univers e UniversLT)",
    validatorIds: [V.FONTES, V.FONTES_DUPLICADAS],
  },
  {
    id: "pasteboard",
    section: "GERAL",
    label: "Limpar pasteboard",
    validatorIds: [V.PASTEBOARD],
  },
  {
    id: "package",
    section: "GERAL",
    label:
      "Package contendo IDML, INDD, pasta de links, pasta de fontes, PDF (CTP Arte com sangri 20mm), memorial descritivo e imagem da primeira capa (PNG, Max, RGB Color, 300dpi, overprint), primeira capa simples pra banca.",
    packageArtifacts: true,
  },
  {
    id: "layer-guias",
    section: "PROJETO GRÁFICO",
    label: "Criar layer e aplicar marcação de espiral e mancha (GUIAS).",
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
    section: "PROJETO GRÁFICO",
    label: "Organizar páginas mestras",
  },
  {
    id: "estilos-paleta",
    section: "PROJETO GRÁFICO",
    label: "Verificar se os estilos estão de acordo com a paleta padrão da editora",
    validatorIds: [
      V.ESTILOS_NOMENCLATURA,
      V.ESTILOS_PASTAS,
      V.ESTILOS_IDIOMA,
      V.ESTILOS_PADRAO_PROFESSOR,
      V.ESTILOS_PADRAO_CREDITO,
      V.ESTILOS_PADRAO_FONTE,
      V.HIFENIZACAO,
      V.OVERTEXT,
      V.LAYERS_OBRIGATORIAS,
      V.LAYERS_NOMENCLATURA,
    ],
    issueFilter: (issue, validatorId) => {
      if (validatorId === V.LAYERS_OBRIGATORIAS || validatorId === V.LAYERS_NOMENCLATURA) {
        return !mentionsGuias(issue) && !mentionsRendimento(issue);
      }
      return true;
    },
  },
  {
    id: "onedrive",
    section: "PROJETO GRÁFICO",
    label:
      "Disponibilizar cópia do PDF da PV, Memorial, Capas, PNG e/ou outros na pasta de design no OneDrive do ano de produção vigente",
  },
  {
    id: "pantone-espiral",
    section: "CAPAS",
    label: "Código do PANTONE de espiral caso haja.",
  },
  {
    id: "lombada",
    section: "CAPAS",
    label: "Em caso de brochura, indicar o valor em milímetros da espessura da lombada.",
  },
  {
    id: "creditos-fotoweb",
    section: "CAPAS",
    label: "Créditos de imagens e ilustrações de acordo com o Fotoweb.",
  },
  {
    id: "pasta-abertos",
    section: "CAPAS",
    label:
      "Direcionar pasta do arquivo aberto para a produção de arte ou AGM em ARTES-PROD na pasta ABERTOS do material",
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
  _artifacts?: ChecklistArtifacts,
  options?: { markPackage?: boolean }
): ChecklistPdfItem[] {
  const results = summary?.results || [];

  return ORIGINAL_ROWS.map((row) => {
    if (row.packageArtifacts) {
      const mark = Boolean(options?.markPackage);
      return {
        id: row.id,
        section: row.section,
        label: row.label,
        checked: mark,
        details: [],
      };
    }

    if (!row.validatorIds || row.validatorIds.length === 0) {
      return { id: row.id, section: row.section, label: row.label, checked: false, details: [] };
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
      id: row.id,
      section: row.section,
      label: row.label,
      checked: allRan && details.length === 0,
      details,
      reviewKind: details.length === 0 ? undefined : hasError ? "error" : "warning",
    };
  });
}

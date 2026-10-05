import { ValidationSummary } from "../models/validation-result";
import { VALIDATOR_IDS as V } from "../utils/constants";
import {
  ChecklistArtifacts,
  mapChecklistRows,
  OriginalRowSpec,
} from "./original-checklist";
import type { ChecklistPdfItem } from "./checklist-pdf";

const COVER_ROWS: OriginalRowSpec[] = [
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
    validatorIds: [V.GUIAS_COLOR, V.OVERPRINT],
  },
  {
    id: "paginas-mestras",
    section: "PROJETO GRÁFICO",
    label: "Organizar páginas mestras",
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

export function mapCoverChecklist(
  summary: ValidationSummary | null,
  artifacts?: ChecklistArtifacts,
  options?: { markPackage?: boolean }
): ChecklistPdfItem[] {
  return mapChecklistRows(COVER_ROWS, summary, artifacts, options);
}

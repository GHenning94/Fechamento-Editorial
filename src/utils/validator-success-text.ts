import { VALIDATOR_IDS } from "./constants";

const SUCCESS_TEXT: Record<string, string> = {
  [VALIDATOR_IDS.LAYERS_OBRIGATORIAS]:
    "As layers obrigatórias (MEMORIAL_DESCRITIVO, RENDIMENTO e GUIAS_DELETAR) estão presentes no documento.",
  [VALIDATOR_IDS.LAYERS_NOMENCLATURA]:
    "As layers de memorial, rendimento e guias estão com a nomenclatura correta.",
  [VALIDATOR_IDS.MEMORIAL_DESCRITIVO]:
    "A layer MEMORIAL_DESCRITIVO existe e contém conteúdo.",
  [VALIDATOR_IDS.CORES]:
    "As amostras de cor estão em CMYK, com nomenclatura padrão. Spot apenas nas exceções permitidas.",
  [VALIDATOR_IDS.ESTILOS_PADRAO_PROFESSOR]:
    "Os estilos padrão de professor existem e estão com os atributos corretos para o segmento.",
  [VALIDATOR_IDS.ESTILOS_PADRAO_CREDITO]:
    "O estilo padrão de crédito existe e está com os atributos corretos.",
  [VALIDATOR_IDS.ESTILOS_PADRAO_FONTE]:
    "Os estilos padrão de fonte existem e estão com os atributos corretos para o segmento.",
  [VALIDATOR_IDS.CORPROF]:
    "CorProf está em magenta 100% spot, com overprint.",
  [VALIDATOR_IDS.GUIAS_COLOR]:
    "A cor GUIAS_DELETAR está aplicada corretamente na layer de guias.",
  [VALIDATOR_IDS.OVERPRINT]:
    "Não há overprint indevido em objetos da layer de guias.",
  [VALIDATOR_IDS.ESTILOS_IDIOMA]:
    "Os estilos de parágrafo estão com o idioma Português: Brasileiro.",
  [VALIDATOR_IDS.HIFENIZACAO]:
    "Estilos com hifenização estão justificados à esquerda. Sem hifenização, o alinhamento está aceito.",
  [VALIDATOR_IDS.ESTILOS_NOMENCLATURA]:
    "Os estilos de parágrafo seguem o tronco número_palavra da paleta (ex.: 02_texto, 05_legenda).",
  [VALIDATOR_IDS.FONTES]:
    "Todas as fontes em uso estão instaladas e sem substituição.",
  [VALIDATOR_IDS.FONTES_DUPLICADAS]:
    "Não há fontes duplicadas em uso no documento.",
  [VALIDATOR_IDS.LINKS]:
    "Todos os links de imagens e arquivos estão atualizados e acessíveis.",
  [VALIDATOR_IDS.IMAGENS_COLORSPACE]:
    "As imagens estão no espaço de cor esperado (CMYK ou os casos permitidos).",
  [VALIDATOR_IDS.RESOLUCAO]:
    "As imagens atendem a resolução mínima de 300 dpi.",
  [VALIDATOR_IDS.FIOS]:
    "Todos os fios estão com espessura mínima de 0,3 pt.",
  [VALIDATOR_IDS.PASTEBOARD]:
    "Não há objetos no pasteboard fora das páginas.",
  [VALIDATOR_IDS.LAYERS_BLOQUEADAS]:
    "Nenhuma layer está bloqueada.",
  [VALIDATOR_IDS.OVERTEXT]:
    "Não há texto em overflow nas caixas de texto.",
};

export function getValidatorSuccessText(validatorId: string, validatorName: string): string {
  return SUCCESS_TEXT[validatorId] || `${validatorName} está correto neste documento.`;
}

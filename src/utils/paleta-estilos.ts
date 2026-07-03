/**
 * Troncos de estilos de parágrafo da paleta padrão (modelo_padrao-estilos.pdf).
 * Nomenclatura exata — maiúsculas/minúsculas como no PDF, sem espaços (usar _).
 * Estilos derivados mantêm o tronco (ex.: 02_texto_geral_recuo, 05_legenda_proporcao2).
 * Estilos 00_ existem na paleta, mas são ignorados na validação de nomenclatura.
 */

export const PARAGRAPH_STYLE_TRUNKS = [
  // 01 — Títulos
  "01_TITULO_UNID",
  "01_titulo_cap",
  "01_titulo1",
  "01_titulo2",
  "01_titulo3",
  "01_titulo4",
  // 02 — Texto geral
  "02_texto_geral",
  "02_texto_citado_titulo",
  "02_texto_citado",
  "02_texto_citado_fonte",
  "02_texto_gloss_titulo",
  "02_texto_gloss",
  "02_texto_vocabulario",
  "02_texto_bullets",
  "02_texto_exemplo",
  "02_texto_geral_exercicio",
  "02_texto_dialogo",
  "02_texto_definicao1",
  "02_texto_definicao2",
  "02_texto_destaque1",
  "02_texto_destaque2",
  "02_texto_manuscrito",
  // 03 — Exercício
  "03_exercicio_enunciado",
  "03_exercicio_item_texto",
  "03_exercicio_itens",
  "03_exercicio_item_romano",
  "03_exercicio_bullets",
  "03_exercicio_resolvido",
  "03_exercicio_citado_titulo",
  "03_exercicio_citado",
  "03_exercicio_citado_fonte",
  // 04 — Professor
  "04_professor_resposta",
  "04_professor_comentario",
  "04_professor_roteiroCD",
  "04_proposta_didatica",
  "04_proposta_didatica_citado",
  "04_proposta_citado_fonte",
  // 05 — Diversos
  "05_Credito",
  "05_legenda",
  "05_legenda_proporcao",
  "05_nota_rodape_texto",
  "05_nota_rodape_chamada",
  "05_grafico_titulo",
  "05_grafico_texto",
  "05_grafico_fonte",
  "05_cota_titulo",
  "05_cota_texto",
  "05_mapa_titulo",
  "05_mapa_fonte",
  "05_BALAO_DE_FALA",
  // 06 — Boxe
  "06_boxe_titulo1",
  "06_boxe_titulo2",
  "06_boxe_titulo3",
  "06_boxe_texto",
  "06_boxe_exercicio",
  "06_boxe_item",
  "06_boxe_texto_citado",
  "06_boxe_citado_fonte",
  // 07 — Seção
  "07_secao_titulo1",
  "07_secao_titulo2",
  "07_secao_titulo3",
  "07_secao_texto",
  "07_secao_texto_citado",
  "07_secao_citado_fonte",
  "07_secao_exercicio",
  "07_secao_exercicio_bullets",
  // 08 — Tabela
  "08_tabela_gravata1",
  "08_tabela_gravata2",
  "08_tabela_gravata3",
  "08_tabela_texto_geral",
  "08_tabela_fonte",
  // 09 — Iniciais
  "09_iniciais_titulo1",
  "09_iniciais_texto_geral",
  "09_iniciais_titulo2",
  "09_iniciais_titulo3",
  "09_iniciais_titulo4",
  // 10 — Finais
  "10_finais_titulo1",
  "10_finais_titulo2",
  "10_finais_texto_geral",
] as const;

const TRUNKS_BY_LENGTH = [...PARAGRAPH_STYLE_TRUNKS].sort((a, b) => b.length - a.length);

/** Espaços não são permitidos em nomes de estilo. */
export function containsInvalidSpaces(name: string): boolean {
  return /\s/.test(name);
}

/**
 * Corrige espaços: demais ocorrências viram _; antes de número final, remove o espaço sem _.
 * Ex.: "05_legenda proporcao" → "05_legenda_proporcao"; "02_texto_definicao 1" → "02_texto_definicao1"
 */
export function fixSpacesInStyleName(name: string): string {
  return name
    .trim()
    .replace(/\s+(\d+)\s*$/g, "$1")
    .replace(/\s+/g, "_");
}

function normalizeForSuggestion(name: string): string {
  return fixSpacesInStyleName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/_+/g, "_");
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

export function isParagraphStyleNomenclatureSkipped(name: string): boolean {
  return name.trim().startsWith("00_");
}

export function styleMatchesTrunk(styleName: string, trunk: string): boolean {
  if (containsInvalidSpaces(styleName)) return false;
  if (styleName === trunk) return true;
  if (styleName.startsWith(`${trunk}_`)) return true;

  if (!/\d$/.test(trunk) && styleName.startsWith(trunk) && styleName.length > trunk.length) {
    const remainder = styleName.slice(trunk.length);
    if (/^\d+$/.test(remainder)) return true;
  }

  return false;
}

export function findParagraphStyleTrunk(styleName: string): string | null {
  const trimmed = styleName.trim();
  if (containsInvalidSpaces(trimmed)) return null;

  for (const trunk of TRUNKS_BY_LENGTH) {
    if (styleMatchesTrunk(trimmed, trunk)) {
      return trunk;
    }
  }
  return null;
}

export function isValidParagraphStyleName(styleName: string): boolean {
  return findParagraphStyleTrunk(styleName) !== null;
}

/**
 * Sugere a nomenclatura correta quando o tronco não bate exatamente com a paleta.
 */
export function suggestParagraphStyleName(styleName: string): string | null {
  const trimmed = fixSpacesInStyleName(styleName.trim());
  if (isValidParagraphStyleName(trimmed)) return trimmed;

  const normalizedStyle = normalizeForSuggestion(trimmed);
  let bestName = "";
  let bestScore = Infinity;

  const consider = (candidate: string, distance: number, trunk: string) => {
    const stylePrefix = normalizedStyle.slice(0, 3);
    const trunkPrefix = normalizeForSuggestion(trunk).slice(0, 3);
    const score = distance + (stylePrefix === trunkPrefix ? 0 : 0.5);

    if (score < bestScore) {
      bestScore = score;
      bestName = candidate;
    }
  };

  for (const trunk of TRUNKS_BY_LENGTH) {
    const normTrunk = normalizeForSuggestion(trunk);

    if (normalizedStyle === normTrunk) {
      return trunk;
    }

    if (normalizedStyle.startsWith(`${normTrunk}_`)) {
      return trunk + normalizedStyle.slice(normTrunk.length);
    }

    if (!/\d$/.test(normTrunk) && normalizedStyle.startsWith(normTrunk) && normalizedStyle.length > normTrunk.length) {
      const remainder = normalizedStyle.slice(normTrunk.length);
      if (/^\d+$/.test(remainder)) {
        return trunk + remainder;
      }
    }

    consider(trunk, levenshtein(normalizedStyle, normTrunk), trunk);

    if (normalizedStyle.length > normTrunk.length) {
      const suffix = normalizedStyle.slice(normTrunk.length);
      if (suffix.startsWith("_")) {
        const prefix = normalizedStyle.slice(0, normTrunk.length);
        consider(trunk + suffix, levenshtein(prefix, normTrunk), trunk);
      }
    }
  }

  const maxDistance = Math.max(4, Math.ceil(normalizedStyle.length * 0.35));
  if (!bestName || bestScore > maxDistance) {
    return null;
  }

  return bestName;
}

export function buildParagraphStyleSuggestion(styleName: string): string | null {
  const trimmed = styleName.trim();
  if (isValidParagraphStyleName(trimmed)) return null;
  return suggestParagraphStyleName(trimmed);
}

export const PARAGRAPH_STYLE_NOMENCLATURE_EXAMPLES =
  "01_TITULO_UNID, 02_texto_geral, 05_legenda_proporcao, 05_legenda_proporcao2";

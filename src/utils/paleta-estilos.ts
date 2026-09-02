/**
 * Paleta padrão (modelo_padrao-estilos.pdf).
 * O tronco é número + _ + primeira palavra (ex.: 02_texto, 07_secao, 05_grafico).
 * Tudo depois da primeira palavra é ignorado (ex.: 05_grafico/mapa_fonte → 05_grafico).
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

/** Tronco = número + _ + primeira palavra. Para em /, _, espaço e demais sinais. */
export function extractStyleTrunk(name: string): string | null {
  const match = name.trim().match(/^(\d+_[A-Za-zÀ-ÿ]+)/);
  return match ? match[1] : null;
}

export function hasParagraphStyleTrunkFormat(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || containsInvalidSpaces(trimmed)) return false;
  return extractStyleTrunk(trimmed) !== null;
}

function normalizeTrunkKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const PALETTE_SHORT_TRUNKS: string[] = (() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of PARAGRAPH_STYLE_TRUNKS) {
    const trunk = extractStyleTrunk(name);
    if (!trunk) continue;
    const key = normalizeTrunkKey(trunk);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trunk);
  }
  return out;
})();

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
  const styleTrunk = extractStyleTrunk(styleName);
  const palTrunk = extractStyleTrunk(trunk) || trunk;
  if (!styleTrunk) return false;
  return normalizeTrunkKey(styleTrunk) === normalizeTrunkKey(palTrunk);
}

export function findParagraphStyleTrunk(styleName: string): string | null {
  const trimmed = styleName.trim();
  if (containsInvalidSpaces(trimmed)) return null;
  const styleTrunk = extractStyleTrunk(trimmed);
  if (!styleTrunk) return null;
  const key = normalizeTrunkKey(styleTrunk);
  return PALETTE_SHORT_TRUNKS.find((item) => normalizeTrunkKey(item) === key) || null;
}

export function isValidParagraphStyleName(styleName: string): boolean {
  return findParagraphStyleTrunk(styleName) !== null;
}

/** Estilo da paleta padrão — alinhamento livre; demais atributos devem seguir o original. */
export function isStandardParagraphStyle(styleName: string): boolean {
  return isValidParagraphStyleName(styleName);
}

/**
 * Sugere a nomenclatura correta quando o tronco (número_palavra) não está na paleta.
 */
export function suggestParagraphStyleName(styleName: string): string | null {
  const trimmed = fixSpacesInStyleName(styleName.trim());
  if (isValidParagraphStyleName(trimmed)) return trimmed;

  const short = extractStyleTrunk(trimmed);
  if (!short) return null;

  const prefix = (short.match(/^\d+/) || [""])[0];
  const word = short.slice(short.indexOf("_") + 1);
  const rest = trimmed.slice(short.length);
  const wordKey = normalizeTrunkKey(word);
  const candidates = PALETTE_SHORT_TRUNKS.filter((item) =>
    normalizeTrunkKey(item).startsWith(`${prefix}_`)
  );
  const pool = candidates.length > 0 ? candidates : PALETTE_SHORT_TRUNKS;

  let best = "";
  let bestScore = Infinity;
  for (const candidate of pool) {
    const candWord = candidate.slice(candidate.indexOf("_") + 1);
    const score = levenshtein(wordKey, normalizeTrunkKey(candWord));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  const maxDistance = Math.max(3, Math.ceil(word.length * 0.5));
  if (!best || bestScore > maxDistance) return null;
  return best + rest;
}

export function buildParagraphStyleSuggestion(styleName: string): string | null {
  const trimmed = styleName.trim();
  if (isValidParagraphStyleName(trimmed)) return null;
  return suggestParagraphStyleName(trimmed);
}

export const PARAGRAPH_STYLE_NOMENCLATURE_EXAMPLES = "02_texto, 05_legenda, 07_secao";

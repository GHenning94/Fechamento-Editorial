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
  if (!trimmed) return false;
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
  const styleTrunk = extractStyleTrunk(styleName);
  const palTrunk = extractStyleTrunk(trunk) || trunk;
  if (!styleTrunk) return false;
  return normalizeTrunkKey(styleTrunk) === normalizeTrunkKey(palTrunk);
}

export function findParagraphStyleTrunk(styleName: string): string | null {
  const styleTrunk = extractStyleTrunk(styleName.trim());
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

function splitTrunk(trunk: string): { num: string; word: string } {
  const index = trunk.indexOf("_");
  return {
    num: trunk.slice(0, index),
    word: normalizeTrunkKey(trunk.slice(index + 1)),
  };
}

function wordTypoScore(a: string, b: string): number | null {
  if (a === b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const minLen = Math.min(a.length, b.length);
  if (dist <= 1) return dist;
  if (maxLen >= 6 && dist <= 2) return dist;
  if ((a.startsWith(b) || b.startsWith(a)) && maxLen - minLen <= 2) return maxLen - minLen;
  return null;
}

export type NomenclatureVerdict =
  | { kind: "valid" }
  | { kind: "invalid-format" }
  | { kind: "typo"; trunk: string; suggestion: string }
  | { kind: "unknown"; trunk: string };

/**
 * Distingue nomenclatura errada (perto da paleta) de tronco inexistente (alerta).
 * 06_box → 06_boxe; 06_secao → 07_secao; 05_selo → alerta.
 */
export function classifyParagraphStyleNomenclature(styleName: string): NomenclatureVerdict {
  const trimmed = styleName.trim();
  if (!hasParagraphStyleTrunkFormat(trimmed)) return { kind: "invalid-format" };
  if (isValidParagraphStyleName(trimmed)) return { kind: "valid" };

  const trunk = extractStyleTrunk(trimmed);
  if (!trunk) return { kind: "invalid-format" };

  const { num, word } = splitTrunk(trunk);
  const parsed = PALETTE_SHORT_TRUNKS.map((item) => ({ trunk: item, ...splitTrunk(item) }));

  const exactWord = parsed.filter((item) => item.word === word);
  if (exactWord.length > 0) {
    exactWord.sort(
      (a, b) => Math.abs(Number(a.num) - Number(num)) - Math.abs(Number(b.num) - Number(num))
    );
    return { kind: "typo", trunk, suggestion: exactWord[0].trunk };
  }

  let best: { trunk: string; score: number } | null = null;
  for (const item of parsed) {
    if (item.num !== num) continue;
    const score = wordTypoScore(word, item.word);
    if (score == null) continue;
    if (!best || score < best.score) best = { trunk: item.trunk, score };
  }
  if (best) return { kind: "typo", trunk, suggestion: best.trunk };

  return { kind: "unknown", trunk };
}

/**
 * Sugere a nomenclatura correta quando o tronco (número_palavra) não está na paleta.
 */
export function suggestParagraphStyleName(styleName: string): string | null {
  const verdict = classifyParagraphStyleNomenclature(styleName);
  if (verdict.kind === "typo") return verdict.suggestion;
  return null;
}

export function buildParagraphStyleSuggestion(styleName: string): string | null {
  const trimmed = styleName.trim();
  if (isValidParagraphStyleName(trimmed)) return null;
  return suggestParagraphStyleName(trimmed);
}

export const PARAGRAPH_STYLE_NOMENCLATURE_EXAMPLES = "02_texto, 05_legenda, 07_secao";

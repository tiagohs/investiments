/**
 * leitura-chave.js - 29/10/2026 (camada de leitura no Cloudflare, docs/arquitetura-leitura-cloudflare.md).
 * A chave canônica de uma tela publicada: a ação + os parâmetros em ordem alfabética (vazios ficam de fora).
 * O MESMO formato em três lugares: aqui (site e Worker importam este arquivo) e no Apps Script (Publicacao.gs!chaveLeitura_).
 * tests/worker-leitura.test.js confere que os dois lados geram a mesma chave.
 */
export function chaveLeitura(acao, params = {}) {
  const nomes = Object.keys(params || {}).filter((n) => params[n] !== undefined && params[n] !== null && params[n] !== '').sort();
  if (!nomes.length) return String(acao);
  return `${acao}?${nomes.map((n) => `${encodeURIComponent(n)}=${encodeURIComponent(String(params[n]))}`).join('&')}`;
}

/** Ação válida: letras, números e "_" (as mesmas do Router.gs). */
export const ACAO_VALIDA = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Instante (ms) de uma geração da planilha: "<versão do código>.<Date.now()><4 letras>" (Planilha.gs!carimboEscritaPlanilha_).
 * Só o instante ordena as gerações; geração sem instante (planilha nunca gravada pelo site) vale 0.
 */
export function instanteDaGeracao(geracao) {
  const m = String(geracao || '').match(/\.(\d{10,})[a-z0-9]*$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Ações que o Apps Script publica (Publicacao.gs!familiasLeitura_ - testado que é a mesma lista) e que o site lê do Worker.
 * Todas são lidas do Worker (ACOES_LIDAS_DO_WORKER, abaixo).
 */
export const ACOES_PUBLICADAS = Object.freeze(['home', 'transacoes', 'aportesPendentes', 'despesas', 'gastos', 'distribuicoesMetas',
  'carteirasHome', 'carteirasAcoes', 'carteirasFiis', 'carteirasAcoesEua', 'carteirasRendaFixa', 'metas', 'patrimonio', 'macro',
  'proventos', 'inflacaoPessoal', 'salario', 'metasHistorico', 'syncHistorico', 'syncStatus']);
/** 29/10/2026: telas que só valem do Worker se a cópia for recente (o Registro de Controle muda a cada sincronização). */
export const IDADE_MAXIMA_LEITURA_MS = Object.freeze({ syncHistorico: 10 * 60 * 1000, syncStatus: 10 * 60 * 1000 });
// 29/10/2026 (Tiago: "Transações e Organização ainda lentas no Atualizar"): agora TODAS as telas publicadas são lidas do
// Worker - inclusive Transações, o carrinho e os gastos. Depois de uma gravação, a geração mínima (api-client.js) recusa a
// cópia anterior à gravação e a leitura cai no Apps Script até a nova publicação chegar.
/**
 * 29/10/2026: telas publicadas POR ATIVO (Publicacao.gs!LEITURA_POR_ATIVO_): 'ativoBase?ref=TICKER' (renda variável, sem a
 * posição de hoje - api-client.js!getAtivo junta a linha da Carteira) e 'ativo?ref=rf:...&semIndices=1' (renda fixa).
 * Ativo ainda não publicado: o Worker responde 404 e a leitura vai ao Apps Script.
 */
export const ACOES_PUBLICADAS_POR_ATIVO = Object.freeze(['ativo', 'ativoBase']);
export const ACOES_LIDAS_DO_WORKER = Object.freeze([...ACOES_PUBLICADAS, ...ACOES_PUBLICADAS_POR_ATIVO]);

/**
 * 29/10/2026: telas com cotação (Publicacao.gs!familiasLeitura_ com `cotacao: true` - testado que é a mesma lista). Ao ler
 * uma delas do Worker com mais de IDADE_MAXIMA_COTACAO_MS no pregão, o site pede a publicação das cotações e se atualiza.
 */
export const ACOES_COM_COTACAO = Object.freeze(['home', 'transacoes', 'distribuicoesMetas', 'carteirasHome', 'carteirasAcoes', 'carteirasFiis',
  'carteirasAcoesEua', 'carteirasRendaFixa', 'metas', 'patrimonio', 'macro']);
export const IDADE_MAXIMA_COTACAO_MS = 5 * 60 * 1000;

/** Pregão da B3 visto do aparelho (seg-sex, 10:00-18:30 em São Paulo). Feriado quem confere é o Apps Script. */
export function talvezNoPregao(agoraMs = Date.now()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(agoraMs)).map((p) => [p.type, p.value]));
  if (partes.weekday === 'Sat' || partes.weekday === 'Sun') return false;
  const min = Number(partes.hour) * 60 + Number(partes.minute);
  return min >= 10 * 60 && min <= 18 * 60 + 30;
}

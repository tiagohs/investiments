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
 * transacoes e aportesPendentes ficam de fora por enquanto (carrinho e aportes mudam a cada clique - leem do Apps Script).
 */
export const ACOES_PUBLICADAS = Object.freeze(['home', 'distribuicoesMetas', 'carteirasHome', 'carteirasAcoes', 'carteirasFiis',
  'carteirasAcoesEua', 'carteirasRendaFixa', 'metas', 'patrimonio', 'transacoes', 'macro', 'proventos', 'aportesPendentes', 'despesas',
  'inflacaoPessoal', 'salario', 'metasHistorico']);
export const ACOES_LIDAS_DO_WORKER = Object.freeze(ACOES_PUBLICADAS.filter((a) => a !== 'transacoes' && a !== 'aportesPendentes'));

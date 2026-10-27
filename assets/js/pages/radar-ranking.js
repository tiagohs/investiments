/**
 * radar-ranking.js - 27/10/2026 (Tiago: "a forma que está hoje para ser atualizado é muito difícil pra mim. Eu preciso
 * clicar em editar e edito individualmente. Seria melhor editar o ranking dos ativos (em Acompanhamento) simplesmente
 * arrastando o item pra cima ou pra baixo. Isso atualiza automaticamente o número: se coloco em primeiro, o item é o 1").
 *
 * Conta PURA (sem DOM): a nova ordem depois de mover um item e o ranking 1..N que sai dela - só as linhas que mudam vão
 * pra planilha (doPost action=salvarRankingRadar, PosicoesEncerradas.gs). Posição encerrada (fora do ranking) fica
 * depois de todos (N+1...), pra nunca empatar com um ativo. Testes: tests/radar-ranking.test.js.
 */

/** Ordem do ranking (crescente; sem número vai pro fim, mantendo a ordem de chegada). */
export function ordemDoRanking(itens) {
  return [...(itens || [])].map((it, i) => ({ it, i })).sort((a, b) => {
    const ra = typeof a.it.ranking === 'number' && a.it.ranking > 0 ? a.it.ranking : Infinity;
    const rb = typeof b.it.ranking === 'number' && b.it.ranking > 0 ? b.it.ranking : Infinity;
    return ra === rb ? a.i - b.i : ra - rb;
  }).map((x) => x.it);
}

/** A lista com o item da posição `de` movido pra posição `para` (índices da lista). */
export function mover(lista, de, para) {
  const out = [...lista];
  if (de < 0 || de >= out.length) return out;
  const alvo = Math.max(0, Math.min(out.length - 1, para));
  const [it] = out.splice(de, 1);
  out.splice(alvo, 0, it);
  return out;
}

/**
 * Rankings novos a partir da ordem dos ativos (1..N) e das encerradas (N+1...). Devolve só o que muda:
 * [{ linha, ativo, ranking, de }].
 */
export function rankingsDaOrdem(ativosNaOrdem, encerradas = []) {
  const mudancas = [];
  [...ativosNaOrdem, ...ordemDoRanking(encerradas)].forEach((it, i) => {
    const novo = i + 1;
    if (it.ranking !== novo) mudancas.push({ linha: it.linha, ativo: it.ativo, ranking: novo, de: typeof it.ranking === 'number' ? it.ranking : null });
  });
  return mudancas;
}

/** Índice de destino ao soltar na altura `y`: `meios` = o meio (em y) de cada item na tela, de cima pra baixo. */
export function indiceNaAltura(meios, y, de) {
  let idx = meios.findIndex((m) => y < m);
  if (idx === -1) idx = meios.length;
  // tirando o item da posição `de`, quem estava depois dele sobe uma posição
  return idx > de ? idx - 1 : idx;
}

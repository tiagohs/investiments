/**
 * carteiras-cache.js — cache leve em sessionStorage pras 5 páginas de
 * Carteiras (Visão geral + 4 classes).
 *
 * 19/09/2026: Carteiras é um HTML de entrada PRÓPRIO (carteiras/index.html),
 * separado de index.html/distribuicoes-metas.html — ao contrário daquelas
 * duas abas (que só buscam dado 1x por carga de página, porque nunca saem
 * do mesmo documento, ver router.js), ir de Início pra Carteiras e voltar
 * É uma navegação de página cheia do navegador, que perde todo estado.
 * Sem isso, toda volta pra Carteiras mostraria o skeleton de novo e
 * esperaria a chamada no Apps Script (2-5s) antes de mostrar qualquer
 * número — pedido do Tiago foi "cache pra performance".
 *
 * Padrão stale-while-revalidate: cada page module (ver
 * pages/carteiras-*.js) tenta ler o cache primeiro e já desenha com ele
 * (dado "velho" mas instantâneo) enquanto busca o dado fresco por trás -
 * quando o fresco chega, redesenha e regrava o cache. Nunca é a ÚNICA
 * fonte de dado (sempre busca fresco também) - só evita a tela vazia
 * entre trocar de página e o fetch responder.
 *
 * TTL curto (5 min, mesmo intervalo do refresh automático das outras
 * páginas - ver shell.js!mountRefreshControl) só pra descartar cache
 * claramente velho (ex.: sessão de ontem) antes mesmo de tentar
 * desenhar com ele - não é o mecanismo principal de "atualização", que
 * continua sendo sempre buscar fresco a cada mount().
 */

export function lerCacheCarteiras(chave, ttlMs = 5 * 60 * 1000) {
  try {
    const bruto = globalThis.sessionStorage.getItem(chave);
    if (!bruto) return null;
    const registro = JSON.parse(bruto);
    if (!registro || typeof registro.ts !== 'number') return null;
    if (Date.now() - registro.ts > ttlMs) return null;
    return registro.dados;
  } catch (error) {
    return null;
  }
}

export function gravarCacheCarteiras(chave, dados) {
  try {
    globalThis.sessionStorage.setItem(chave, JSON.stringify({ ts: Date.now(), dados }));
  } catch (error) {
    // sessionStorage indisponível (modo privado, quota cheia etc.) - cache é só
    // conveniência de performance, nunca a fonte de verdade, então falha calada.
  }
}

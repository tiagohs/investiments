/**
 * cache-dados.js — cache das respostas do Apps Script no navegador, pra
 * TODAS as páginas (Início, Distribuições e Metas, Carteiras, Proventos).
 *
 * 25/09/2026 (Tiago: "sinto que está demorando muito pra carregar a
 * tela"). O que acontecia antes:
 *  - Início e Distribuições não tinham cache nenhum: toda abertura
 *    esperava o Apps Script (vários segundos) com o esqueleto na tela;
 *  - Carteiras guardava no sessionStorage cada subpágina JUNTO com o
 *    histórico da Início (~1,7 MB) - 5 cópias passavam do limite de ~5 MB
 *    do navegador, a gravação falhava calada e o cache simplesmente não
 *    existia a partir da 2ª/3ª subpágina;
 *  - cada subpágina de Carteiras pedia a Início inteira de novo.
 *
 * Agora: IndexedDB (sem o limite de 5 MB, sobrevive a fechar a aba), com a
 * resposta da Início guardada UMA vez (chave "home") e reaproveitada por
 * todo mundo. Padrão stale-while-revalidate: a página desenha na hora com o
 * que está guardado e SEMPRE busca o dado novo por trás - o cache nunca é a
 * fonte de verdade, só evita a tela vazia. Sem IndexedDB (navegador antigo,
 * testes em Node) não cacheia nada - os testes que querem cache passam um
 * Map com usarMemoriaNoCacheDados(). (25/09/2026: antes caía pro
 * sessionStorage, mas o Node 25 tem sessionStorage global - o cache de um
 * teste vazava pro seguinte e 2 testes de "estado de erro" quebravam no
 * pre-commit do Tiago.)
 * Tudo aqui engole erro: cache é conveniência, nunca pode quebrar a página.
 */

const NOME_BANCO = 'patrimonio-cache';
const LOJA = 'respostas';
const IDADE_MAXIMA_PADRAO = 7 * 24 * 60 * 60 * 1000; // uma semana: mais velho que isso nem desenha
let bancoPromessa = null;
let memoriaTeste = null;

/** Só testes: guarda o cache num Map (null volta ao normal). */
export function usarMemoriaNoCacheDados(mapa) {
  memoriaTeste = mapa || null;
}

function abrirBanco() {
  if (typeof indexedDB === 'undefined' || !indexedDB) return Promise.resolve(null);
  if (!bancoPromessa) {
    bancoPromessa = new Promise((resolve) => {
      try {
        const req = indexedDB.open(NOME_BANCO, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(LOJA); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }
  return bancoPromessa;
}

function operar(banco, modo, fn) {
  return new Promise((resolve) => {
    try {
      const tx = banco.transaction(LOJA, modo);
      const req = fn(tx.objectStore(LOJA));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

/** { dados, ts } guardado pra essa chave, ou null (nunca gravado, velho demais, ou sem armazenamento). */
export async function lerCacheDados(chave, { maxIdadeMs = IDADE_MAXIMA_PADRAO } = {}) {
  let registro = null;
  try {
    if (memoriaTeste) registro = memoriaTeste.has(chave) ? JSON.parse(memoriaTeste.get(chave)) : null;
    else {
      const banco = await abrirBanco();
      if (banco) registro = await operar(banco, 'readonly', (loja) => loja.get(chave));
    }
  } catch (e) {
    registro = null;
  }
  if (!registro || typeof registro.ts !== 'number' || registro.dados == null) return null;
  if (Date.now() - registro.ts > maxIdadeMs) return null;
  return registro;
}

export async function gravarCacheDados(chave, dados) {
  const registro = { ts: Date.now(), dados };
  try {
    if (memoriaTeste) { memoriaTeste.set(chave, JSON.stringify(registro)); return; }
    const banco = await abrirBanco();
    if (banco) await operar(banco, 'readwrite', (loja) => loja.put(registro, chave));
  } catch (e) {
    // quota, modo privado etc. - segue sem cache
  }
}

/** Apaga tudo (ex.: ao sair da conta). */
export async function limparCacheDados() {
  try {
    if (memoriaTeste) { memoriaTeste.clear(); return; }
    const banco = await abrirBanco();
    if (banco) await operar(banco, 'readwrite', (loja) => loja.clear());
  } catch (e) { /* nada */ }
}

/**
 * getHome compartilhado pelas páginas do MESMO documento (Carteiras monta
 * até 5 subpáginas, e cada uma precisa do histórico da Início): chamadas
 * dentro de `validadeMs` reaproveitam a mesma resposta (ou a mesma chamada
 * ainda em andamento) em vez de pedir a Início inteira de novo. Resposta
 * boa também vai pro cache "home" (a Início abre instantânea depois).
 */
export function criarGetHomeCompartilhado(getHomeImpl, { validadeMs = 30 * 1000, agora = () => Date.now() } = {}) {
  let promessa = null;
  let desde = 0;
  return function getHomeCompartilhado(token) {
    if (promessa && agora() - desde < validadeMs) return promessa;
    desde = agora();
    promessa = Promise.resolve(getHomeImpl(token)).then((resposta) => {
      if (resposta && resposta.ok) gravarCacheDados('home', resposta);
      else promessa = null; // erro não fica guardado
      return resposta;
    }, (erro) => { promessa = null; throw erro; });
    return promessa;
  };
}

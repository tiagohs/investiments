// tests/cotacao-tela.test.js - 29/10/2026 (Tiago: "quando eu entro no site, o valor da cotação naquele momento tem que ser o
// último disponível"): o "Atualizar dados" diz DE QUANDO são as cotações da tela (não só quando buscou) e, quando a
// publicação das cotações novas chega (evento do api-client), busca de novo sozinho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountRefreshControl } from '../assets/js/shell.js';
import { getHome, getGastos, esquecerRespostasGuardadas, EVENTO_LEITURA_ATUALIZADA } from '../assets/js/api-client.js';
import { usarMemoriaNoCacheDados } from '../assets/js/cache-dados.js';
import { LEITURA_URL } from '../assets/js/config.js';

const S1 = 's1.eyJlbWFpbCI6ImFAYi50ZXN0In0.assinatura';
const memoria = new Map();
globalThis.localStorage = { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k) };
function resposta(status, corpo, cab = {}) {
  const h = new Map(Object.entries(cab).map(([k, v]) => [k.toLowerCase(), v]));
  return { status, headers: { get: (k) => (h.has(k.toLowerCase()) ? h.get(k.toLowerCase()) : null) }, text: async () => JSON.stringify(corpo), json: async () => corpo };
}

test('"Cotações de HH:MM" quando a tela mostra uma publicação de mais de 2 min; "Atualizado às" quando é de agora ou não tem cotação; o evento de cotações novas atualiza a tela', async (t) => {
  memoria.clear(); esquecerRespostasGuardadas(); usarMemoriaNoCacheDados(new Map());
  const agoraFixo = new Date(2026, 9, 29, 14, 40);
  const geracaoMs = new Date(2026, 9, 29, 14, 10).getTime();
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).startsWith(LEITURA_URL)) return resposta(200, { ok: true }, { ETag: '"H"', 'X-Geracao': `20261029a.${geracaoMs}pub` });
    return resposta(200, { ok: true, publicacao: { publicadas: 0 } });
  });
  const dom = new JSDOM('<div id="c"></div>', { url: 'https://exemplo.test/' });
  const doc = dom.window.document;
  let qual = 'home';
  let chamadas = 0;
  const ctl = mountRefreshControl(doc, doc.getElementById('c'), async () => { chamadas++; if (qual === 'home') await getHome(S1); else await getGastos(S1); }, { intervaloMs: 0, agora: () => agoraFixo });
  await ctl.atualizar();
  const status = doc.querySelector('.refresh-status');
  assert.equal(status.textContent, 'Cotações de 14:10');
  qual = 'gastos';
  dom.window.dispatchEvent(new dom.window.CustomEvent(EVENTO_LEITURA_ATUALIZADA, { detail: { familias: 'cotacao' } }));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(chamadas, 2, 'cotações novas publicadas: a tela buscou de novo sozinha');
  assert.equal(status.textContent, 'Atualizado às 14:40', 'tela sem cotação: hora da busca');
});

// 07/10/2026 (Tiago: "já cliquei umas 2 vezes e o aviso 'Consolidação necessária' não sai"): a consolidação
// rodava e limpava o pendente no servidor, mas o header voltava a pintar o aviso a partir do resumo guardado
// no navegador (localStorage 'investiments_sync_resumo', 15 min - A-43). Agora: limpar o cache local tira o
// resumo, e qualquer POST (gravação) esquece o resumo pra próxima carga buscar o estado novo.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function memoria(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const RESUMO = JSON.stringify({ ts: Date.now(), consolidacao: { pendente: true, ativos: ['SIRI', 'VNOM'] } });

test('limparCacheLocalNavegador tira o resumo de sincronização/consolidação guardado', async () => {
  const { limparCacheLocalNavegador } = await import('../assets/js/shell.js');
  const st = memoria({ investiments_sync_resumo: RESUMO, investiments_theme: 'escuro' });
  await limparCacheLocalNavegador({ limparCacheDadosImpl: async () => {}, cachesImpl: undefined, storage: st });
  assert.equal(st.getItem('investiments_sync_resumo'), null);
  assert.equal(st.getItem('investiments_theme'), 'escuro', 'preferências continuam');
});

test('consolidar (POST) esquece o resumo guardado; GET não mexe', async () => {
  const st = memoria({ investiments_sync_resumo: RESUMO });
  const fetchAntes = globalThis.fetch;
  const lsAntes = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: st, configurable: true, writable: true });
  globalThis.fetch = async () => ({ json: async () => ({ ok: true, resultado: { status: 'concluido', continuar: false, feito: ['Nada pendente - tudo já estava consolidado.'], consolidacao: { pendente: false } } }) });
  try {
    const api = await import('../assets/js/api-client.js');
    const r = await api.consolidar('tok');
    assert.equal(r.ok, true);
    assert.equal(st.getItem('investiments_sync_resumo'), null, 'POST limpa o resumo');
  } finally {
    globalThis.fetch = fetchAntes;
    if (lsAntes) Object.defineProperty(globalThis, 'localStorage', lsAntes); else delete globalThis.localStorage;
  }
});

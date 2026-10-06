// tests/organizacao-gastos-janela.test.js
//
// 05/10/2026 (auditoria A-35): a seção Gastos pede só os últimos 12 meses (+1) e
// busca o histórico completo só quando a tela precisa ("Tudo", voltar de mês,
// calendário em data antiga). Servidor falso que respeita { de }; tudo inventado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const mesesDe = (ini, n) => Array.from({ length: n }, (_, i) => { const t = Number(ini.slice(0, 4)) * 12 + Number(ini.slice(5, 7)) - 1 + i; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; });
const COLUNAS = ['mes', 'data', 'origem', 'fonte', 'descricao', 'categoria', 'valor', 'tipo', 'parcela', 'arquivo'];

/** 30 meses (2024-01..2026-06) com 2 compras por mês. `semJanela`: o servidor antigo, que devolve tudo e não manda `janela`. */
function servidorFalso({ semJanela = false } = {}) {
  const meses = mesesDe('2024-01', 30);
  const todos = [];
  meses.forEach((m) => { for (let i = 0; i < 2; i += 1) todos.push([m, `${m}-0${i + 3}`, 'cartao', 'nubank-cartao', `LOJA ${m} ${i}`, 'compras', 100 + i, 'compra', '', 'a1']); });
  const chamadas = [];
  const getGastos = async (j) => {
    chamadas.push(j || {});
    const arquivos = [{ id: 'a1', nome: 'x.pdf', caminho: 'Cartão', fonte: 'nubank-cartao', meses }];
    if (semJanela) return { ok: true, colunas: COLUNAS, lancamentos: todos, arquivos, regras: [] };
    const de = j && j.de === 'tudo' ? '' : '2025-06';
    const lancs = todos.filter((l) => !de || l[0] >= de);
    return { ok: true, colunas: COLUNAS, lancamentos: lancs, arquivos, regras: [], janela: { de, ate: '', primeiroMes: '2024-01', ultimoMes: '2026-06', completo: !de, total: todos.length, devolvidos: lancs.length }, meses: meses.map((m) => [m, 2]) };
  };
  return { getGastos, chamadas, meses };
}

async function montar(srv, opcoes = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="g"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const { montarSecaoGastos } = await import('../assets/js/pages/organizacao-gastos.js');
  const api = {
    getGastos: srv.getGastos,
    getArquivosGastos: async () => ({ ok: true, configurado: true, arquivos: [] }),
    getArquivoGastos: async () => ({ ok: true }), salvarImportacaoGastos: async () => ({ ok: true }), salvarRegraGastos: async () => ({ ok: true, regras: [] }), excluirArquivoGastos: async () => ({ ok: true }),
    ...opcoes.api,
  };
  const m = new Map();
  const secao = montarSecaoGastos(doc.getElementById('g'), { api, hoje: '2026-07-05', storage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }, ...opcoes.secao });
  await secao.pronto;
  return { w: dom.window, el: doc.getElementById('g'), secao };
}
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const esperar = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function ate(cond, ms = 2000) { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tempo esgotado'); await esperar(5); } }

test('A-35: abre com a janela padrão (1 chamada, sem parâmetro) e o período 12M não busca mais nada', async () => {
  const srv = servidorFalso();
  const { secao } = await montar(srv);
  await esperar(30);
  assert.equal(srv.chamadas.length, 1);
  assert.deepEqual(srv.chamadas[0], {});
  assert.equal(secao.dados.lancs.length, 13 * 2, '13 meses carregados');
  assert.equal(secao.resumo.vazio, false);
  assert.equal(secao.resumo.ultimo, '2026-06');
  assert.equal(secao.resumo.primeiroMes, '2024-01', 'a tela sabe até onde pode voltar');
});

test('A-35: "Tudo" busca o histórico completo 1 vez e o resumo passa a cobrir os 30 meses', async () => {
  const srv = servidorFalso();
  const { w, el, secao } = await montar(srv);
  clique(w, el.querySelector('[data-periodo="tudo"]'));
  await ate(() => srv.chamadas.length === 2 && secao.dados.lancs.length === 60);
  assert.deepEqual(srv.chamadas[1], { de: 'tudo' });
  assert.equal(secao.resumo.meses[0], '2024-01');
  assert.equal(secao.resumo.intervalo.inicio, '2024-01');
  assert.equal(secao.resumo.porMes.length, 30);
  // mudar de período de novo não busca outra vez
  clique(w, el.querySelector('[data-periodo="6m"]'));
  clique(w, el.querySelector('[data-periodo="tudo"]'));
  await esperar(30);
  assert.equal(srv.chamadas.length, 2);
});

test('A-35: voltar de mês além da margem da média busca o histórico completo antes de mostrar o mês', async () => {
  const srv = servidorFalso();
  const { w, el, secao } = await montar(srv);
  clique(w, el.querySelector('[data-periodo="mes"]'));
  await esperar(10);
  assert.equal(srv.chamadas.length, 1, 'o mês atual cabe na janela (a média usa os 12 anteriores)');
  assert.ok(!el.querySelector('[data-acao="mes-ant"]').disabled, 'dá pra voltar: o histórico é maior que a janela');
  clique(w, el.querySelector('[data-acao="mes-ant"]'));
  await ate(() => srv.chamadas.length === 2 && secao.resumo && secao.resumo.mesRef === '2026-05');
  assert.deepEqual(srv.chamadas[1], { de: 'tudo' });
  // depois de ampliado, voltar mais não chama de novo
  clique(w, el.querySelector('[data-acao="mes-ant"]'));
  await ate(() => secao.resumo.mesRef === '2026-04');
  assert.equal(srv.chamadas.length, 2);
});

test('A-35: depois de ampliar, recarregar (ex.: depois de importar) continua pedindo o histórico completo', async () => {
  const srv = servidorFalso();
  const { w, el, secao } = await montar(srv);
  clique(w, el.querySelector('[data-periodo="tudo"]'));
  await ate(() => secao.dados.lancs.length === 60);
  await secao.recarregar();
  assert.deepEqual(srv.chamadas[srv.chamadas.length - 1], { de: 'tudo' });
  assert.equal(secao.dados.lancs.length, 60);
});

test('A-35: servidor antigo (sem `janela`) = tudo já carregado: "Tudo" e voltar de mês não pedem nada de novo', async () => {
  const srv = servidorFalso({ semJanela: true });
  const { w, el, secao } = await montar(srv);
  clique(w, el.querySelector('[data-periodo="tudo"]'));
  await esperar(30);
  clique(w, el.querySelector('[data-periodo="mes"]'));
  clique(w, el.querySelector('[data-acao="mes-ant"]'));
  await esperar(30);
  assert.equal(srv.chamadas.length, 1);
  assert.equal(secao.resumo.meses[0], '2024-01');
});

test('A-35: se a busca do histórico falhar, segue com o que tem (sem travar a tela)', async () => {
  const srv = servidorFalso();
  let falhar = false;
  const { w, el, secao } = await montar(srv, { api: { getGastos: async (j) => { if (falhar && j && j.de === 'tudo') return { ok: false, erro: 'rede' }; return srv.getGastos(j); } }, secao: { token: '' } });
  falhar = true;
  clique(w, el.querySelector('[data-periodo="tudo"]'));
  await esperar(40);
  assert.equal(secao.dados.lancs.length, 26, 'continua com a janela');
  assert.equal(el.querySelector('#gsPainel').textContent.includes('Carregando o histórico completo'), false, 'o aviso sai');
  assert.ok(el.querySelector('#gsHero').textContent.length > 0);
});

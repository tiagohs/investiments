// 06/10/2026 (A-78): IPCA da Renda e taxas do simulador vêm do contexto de mercado (Macro.gs) quando disponível;
// o valor fixo só entra como fallback e é rotulado "premissa". Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IPCA_MENSAL, mesclarIpcaMacro, rotuloOrigemIpca, ultimoMesIpca, ipca12m } from '../assets/js/pages/renda-calc.js';
import { parametrosPadrao, PADROES } from '../assets/js/pages/simulador-dividas-calc.js';

test('mesclarIpcaMacro: sem a resposta de macro fica a tabela fixa, rotulada premissa', () => {
  for (const macro of [null, {}, { juros: {} }, { juros: { ipcaMensal: [] } }]) {
    const r = mesclarIpcaMacro(IPCA_MENSAL, macro);
    assert.equal(r.origem, 'premissa');
    assert.equal(r.tabela, IPCA_MENSAL);
  }
  assert.match(rotuloOrigemIpca('premissa', '2026-08'), /premissa.*08\/2026/);
  assert.equal(rotuloOrigemIpca('macro'), '');
  assert.equal(rotuloOrigemIpca('bcb'), '');
});

test('mesclarIpcaMacro: os meses da macro entram por cima e estendem a tabela (sem mexer na original)', () => {
  const base = { 2026: [0.1, 0.2] };
  const r = mesclarIpcaMacro(base, { juros: { ipcaMensal: [{ mes: '2026-02', valor: 0.5 }, { mes: '2026-03', valor: 0.3 }, { mes: 'lixo', valor: 1 }, { mes: '2026-04', valor: 'x' }] } });
  assert.equal(r.origem, 'macro');
  assert.deepEqual(r.tabela[2026], [0.1, 0.5, 0.3]);
  assert.equal(r.ate, '2026-03');
  assert.deepEqual(base[2026], [0.1, 0.2], 'tabela de entrada intacta');
  // com a tabela real: um mês novo muda o último mês e o IPCA 12m
  const ult = ultimoMesIpca(IPCA_MENSAL);
  const [a, m] = ult.split('-').map(Number);
  const prox = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  const r2 = mesclarIpcaMacro(IPCA_MENSAL, { juros: { ipcaMensal: [{ mes: prox, valor: 0.4 }] } });
  assert.equal(r2.ate, prox);
  assert.ok(ipca12m(prox, r2.tabela));
});

test('parametrosPadrao: CDI/IPCA do contexto > macro > PADROES (premissa), com a origem de cada taxa', () => {
  const semNada = parametrosPadrao({ d: { hoje: '2026-10-06' } });
  assert.deepEqual(semNada.origemTaxas, { cdi: 'premissa', ipca: 'premissa', trMensal: 'premissa' });
  assert.equal(semNada.taxas.cdi, undefined, 'sem número: o calc usa PADROES (premissa)');
  const macro = { juros: { selic: 0.1475, ipca12m: 0.0388 } };
  const m = parametrosPadrao({ d: { hoje: '2026-10-06' }, macro });
  assert.equal(m.taxas.cdi, 0.1465);
  assert.equal(m.taxas.ipca, 0.0388);
  assert.deepEqual(m.origemTaxas, { cdi: 'macro', ipca: 'macro', trMensal: 'premissa' });
  const dados = parametrosPadrao({ d: { hoje: '2026-10-06', cdi: 0.14, ipca: 0.05, trMensal: 0.001 }, macro });
  assert.deepEqual(dados.taxas, { cdi: 0.14, ipca: 0.05, trMensal: 0.001 });
  assert.deepEqual(dados.origemTaxas, { cdi: 'dados', ipca: 'dados', trMensal: 'dados' });
  const macroAninhada = parametrosPadrao({ d: { hoje: '2026-10-06' }, macro: { ok: true, macro } });
  assert.equal(macroAninhada.taxas.ipca, 0.0388);
  assert.ok(PADROES.cdi > 0);
});

// ---- simulador montado (jsdom): rótulo "premissa" some quando a taxa vem de outra fonte ----
import { JSDOM } from 'jsdom';
const CTX = {
  d: { hoje: '2025-03-10', metas: { salarioLiquido: 8340 }, investimentos: { reserva: 35000 }, despesas: { totalComFolga: 5000 } },
  cfg: { financiamento: { saldo: 210000, dataSaldo: '2025-01-05', taxaAnual: 0.09, amortizacao: 1000, prazoRestante: 210, seguroTaxas: 70, indexador: 'TR' } },
  b: { liquido: 100000 }, fgts: null,
};
async function montar(opcoes) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="s"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const { montarSimuladorDividas } = await import('../assets/js/pages/organizacao-simulador.js');
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  const el = dom.window.document.getElementById('s');
  const sec = montarSimuladorDividas(el, { ctx: CTX, doc: dom.window.document, storage, ...opcoes });
  return { el, sec, dom };
}
const resumo = (el) => el.querySelector('.sd-prem summary').textContent.replace(/\s+/g, ' ');

test('simulador: sem CDI/IPCA do site as taxas aparecem como "(premissa)"; com a macro (getMacro) o rótulo some e vale o número da macro', async () => {
  const sem = await montar({});
  assert.match(resumo(sem.el), /CDI .*\(premissa\).*IPCA .*\(premissa\)/);
  assert.match(sem.el.textContent, /marcadas "premissa"/);
  sem.dom.window.close();
  const com = await montar({ getMacro: async () => ({ ok: true, macro: { juros: { selic: 0.1475, ipca12m: 0.0388 } } }) });
  assert.match(resumo(com.el), /\(premissa\)/, 'antes da resposta ainda é premissa');
  await new Promise((r) => setTimeout(r, 20));
  assert.doesNotMatch(resumo(com.el).replace(/TR [\d,.]+%\/mês \(premissa\)/, ''), /\(premissa\)/);
  assert.equal(com.sec.params.taxas.cdi, 0.1465);
  assert.equal(com.sec.params.taxas.ipca, 0.0388);
  com.sec.atualizar({ ...CTX }); // um novo contexto do patrimônio não perde a macro
  assert.equal(com.sec.params.taxas.ipca, 0.0388);
  com.dom.window.close();
  const falha = await montar({ getMacro: async () => { throw new Error('sem rede'); } });
  await new Promise((r) => setTimeout(r, 20));
  assert.match(resumo(falha.el), /\(premissa\)/);
  falha.dom.window.close();
});

// ---- Renda montada (jsdom): IPCA da macro e rótulo "premissa" ----
test('Renda: a tabela fixa de IPCA aparece rotulada "premissa"; com a macro o rótulo some e o IPCA novo entra', async () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="r"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const { montarSecaoRenda } = await import('../assets/js/pages/organizacao-renda.js');
  const { ultimoMesIpca: ultimo } = await import('../assets/js/pages/renda-calc.js');
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  const raiz = doc.getElementById('r');
  const sal = { ok: true, base: { liquido: 6800, percentualInvestir: 0.25, aporteMeta: 1700 }, pagamentos: [], mensal: [] };
  const pat = { ok: true, hoje: '2026-10-02', pastaIrConfigurada: false, config: { ir: { anos: [] }, carreira: { contratos: [] }, fgts: { contas: [] } }, atualizado: {} };
  const proximo = (() => { const [a, mm] = ultimo(IPCA_MENSAL).split('-').map(Number); return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`; })();
  const secao = montarSecaoRenda(raiz, { doc, hoje: '2026-10-02', buscarIpca: false, storage, patrimonio: pat, salario: sal, secoes: ['salario'], getMacro: async () => ({ ok: true, macro: { juros: { ipcaMensal: [{ mes: proximo, valor: 0.4 }] } } }) });
  const nota = raiz.querySelector('#rdNotaIpca');
  assert.ok(nota && !nota.hidden && /premissa/.test(nota.textContent), 'antes da macro: rotulado premissa');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(raiz.querySelector('#rdNotaIpca').hidden, true, 'com a macro: sem rótulo');
  assert.equal(secao.resumo.ipcaAte, proximo);
  dom.window.close();
});

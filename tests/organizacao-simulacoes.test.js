// tests/organizacao-simulacoes.test.js
//
// 03/10/2026: aba "Simulações" (organizacao-simulacoes.js) - Tiago: "No topo
// dessa aba, um hero com os valores de simulação do patrimônio ('Ritmo atual
// e quando chego ao primeiro milhão', viés entre investir vs amortizar, e
// algo a mais que seja importante ali)". Números do herói (resumoHeroi) e a
// montagem num DOM de verdade. Tudo inventado (o repositório é público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { contextoPatrimonio } from '../assets/js/pages/organizacao-patrimonio.js';
import { parametrosPadrao, simular, projetarMarco } from '../assets/js/pages/simulador-dividas-calc.js';
import { resumoHeroi, htmlHeroi, montarAbaSimulacoes } from '../assets/js/pages/organizacao-simulacoes.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
function memoria() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }

const D = {
  hoje: '2025-09-15',
  config: {
    imovel: { nome: 'Apê teste', cidade: 'Cidade X', valorCompra: 300000, dataCompra: '2023-06', entrada: 60000, metodo: 'compra' },
    financiamento: { banco: 'Banco Z', sistema: 'SAC', saldo: 230000, dataSaldo: '2025-06-20', taxaAnual: 0.09, amortizacao: 700, seguroTaxas: 80, parcela: 2500, dataInicio: '2023-06', valorFinanciado: 240000, indexador: 'TR' },
    fies: { saldo: 20000, dataSaldo: '2025-06-10', parcela: 300, taxaMensal: 0.0025, fim: '2031-12' },
    carreira: { nascimento: '1990-03-01', contratos: [{ empregador: 'EMPRESA TESTE', inicio: '2020-01-01', salarios: [{ data: '2024-01-01', valor: 6500 }] }] },
  },
  investimentos: { total: 120000, longoPrazo: 100000, reserva: 20000 },
  historicoMensal: [
    { mes: '2024-09', patrimonio: 90000, aporte: 1500, aporteLongoPrazo: 1500 },
    { mes: '2024-12', patrimonio: 95000, aporte: 1500, aporteLongoPrazo: 1500 },
    { mes: '2025-06', patrimonio: 110000, aporte: 2000, aporteLongoPrazo: 2000 },
    { mes: '2025-08', patrimonio: 118000, aporte: 2000, aporteLongoPrazo: 2000 },
    { mes: '2025-09', patrimonio: 120000, aporte: 500, aporteLongoPrazo: 500 },
  ],
  despesas: { folga: 0.1, totalReal: 6000, totalComFolga: 6600, itens: [{ nome: 'Parcela do apê', valor: 2500 }, { nome: 'FIES', valor: 300 }, { nome: 'Mercado', valor: 3200 }] },
  metas: { extra: 1000, reinvestimento: 0.2, rendimento: 0.06, aporteMeta: 2500, reservaMeta: 30000, salarioLiquido: 7000 },
  cdi: 0.12,
};

function cenario(d = D) {
  const ctx = contextoPatrimonio(clone(d), {});
  const p = parametrosPadrao(ctx);
  return { ctx, p, sim: simular(p) };
}

test('resumoHeroi: ritmo (crescimento do patrimônio e aporte médio), primeiro milhão, viés e quitação', () => {
  const { ctx, p, sim } = cenario();
  const h = resumoHeroi(ctx, sim, p);
  // ritmo: o mesmo "de onde veio" da aba Patrimônio, por mês
  assert.equal(h.ritmo.aporte, ctx.ritmo);
  assert.ok(h.ritmo.aporteDoRitmo);
  const c = h.ritmo.crescimento;
  assert.equal(c.total, ctx.origem.total);
  assert.equal(c.meses, 12);
  assert.ok(Math.abs(c.porMes * 12 - c.total) < 1e-6);
  assert.ok(Math.abs(c.porAno - c.total) < 1e-6);
  // primeiro milhão: igual à projeção do calc, e chegar antes com o extra (amortizando ou investindo)
  assert.equal(h.marco.alvo, 1e6);
  const direto = projetarMarco({
    liquido: ctx.b.liquido, investido: 120000, aporte: ctx.ritmo, rendimentoReal: ctx.rendimento, ipca: sim.premissas.ipca,
    liberacoes: ctx.libs.map((l) => ({ ...l, mes: sim.resumo.quitacao[l.id].base })), base: sim.cenarios.base.linhas, alvo: 1e6,
  });
  assert.equal(h.marco.ritmo.m, direto.meses);
  assert.ok(h.marco.ritmo.m > 0);
  assert.equal(h.marco.ritmo.idade, Math.floor(ctx.idadeHoje + h.marco.ritmo.m / 12));
  assert.ok(h.marco.amortizar.m < h.marco.ritmo.m);
  assert.ok(h.marco.investir.m < h.marco.ritmo.m);
  assert.ok(h.marco.aposentadoria && h.marco.coast);
  // viés
  assert.ok(['amortizar', 'investir', 'empate'].includes(h.vies.melhor));
  assert.equal(h.vies.alvo, 'financiamento');
  assert.equal(h.vies.valor, p.valorMinimo.valor);
  assert.ok(Math.abs(h.vies.cdiLiquidoHoje - 0.12 * 0.85) < 1e-9);
  // quitação: o apê adianta com o padrão; o FIES (mais barato que a inflação) fica no prazo
  const ape = h.dividas.find((x) => x.id === 'financiamento');
  const fies = h.dividas.find((x) => x.id === 'fies');
  assert.ok(ape.adiantados > 0 && ape.novoMes < ape.baseMes);
  assert.equal(fies.adiantados, 0);
  assert.equal(fies.abaixoInflacao, true);
  // HTML
  const html = htmlHeroi(h);
  assert.equal((html.match(/class="card sm-tile/g) || []).length, 4);
  assert.match(html, /Primeiro R\$ 1 milhão/);
  assert.match(html, /não antecipe/);
});

test('já passou de R$ 1 milhão: o marco vira o próximo; sem dívida: viés sem comparação', () => {
  const rico = clone(D);
  rico.investimentos = { total: 1300000, longoPrazo: 1250000, reserva: 50000 };
  const a = cenario(rico);
  const h = resumoHeroi(a.ctx, a.sim, a.p);
  assert.equal(h.marco.alvo, 2e6);
  assert.match(htmlHeroi(h), /Próximo marco: R\$ 2 milhões/);
  const sem = clone(D);
  delete sem.config.financiamento; delete sem.config.fies;
  const b = cenario(sem);
  const hb = resumoHeroi(b.ctx, b.sim, b.p);
  assert.equal(hb.vies.melhor, null);
  assert.equal(hb.marco.amortizar, null);
  assert.match(htmlHeroi(hb), /Sem dívida pra amortizar/);
  assert.match(htmlHeroi(hb), /Sem financiamento nem FIES cadastrados/);
});

test('montarAbaSimulacoes: herói em cima, simulador embaixo; mudar o formulário redesenha o herói', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="h"></div><div id="s"></div></body></html>', { url: 'https://exemplo.test/organizacao/despesas.html', pretendToBeVisual: true });
  const doc = dom.window.document;
  const { ctx } = cenario();
  const aba = montarAbaSimulacoes({ hero: doc.getElementById('h'), simulador: doc.getElementById('s') }, { ctx, doc, storage: memoria() });
  assert.equal(doc.querySelectorAll('#h .sm-tile').length, 4);
  assert.ok(aba.resumo && aba.simulador.simulacao);
  const valorAntes = aba.resumo.vies.valor;
  aba.simulador.aplicar({ valor: 500 });
  assert.equal(aba.resumo.vies.valor, 500);
  assert.notEqual(valorAntes, 500);
  assert.match(txt(doc.querySelector('#h .sm-marco')), /\+ R\$ 500\/mês amortizando o apê/);
  aba.atualizar(ctx);
  assert.equal(aba.resumo.vies.valor, 500, 'a escolha do Tiago fica (manual)');
});

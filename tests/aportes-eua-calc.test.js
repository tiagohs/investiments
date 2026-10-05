// tests/aportes-eua-calc.test.js
//
// 05/10/2026: fluxo das Ações EUA em 2 etapas - estimativa da Remessa Online
// (calibrada pela cotação real do Tiago: R$ 350,00 -> US$ 68,76 com dólar
// comercial R$ 4,9783 e VET R$ 5,0902), caixa em dólar e sugestão de divisão.
// Ativos inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PADROES_REMESSA, taxasValidas, vetRemessa, remessaPorReais, remessaPorDolares, caixaValido, necessidadeDeDolares, sugerirDivisaoCaixa,
  lerTaxasRemessa, gravarTaxasRemessa,
} from '../assets/js/pages/aportes-eua-calc.js';

const perto = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} deveria estar a ${tol} de ${b}`);

test('remessa: padrões calibrados pela cotação real (R$ 350 a 4,9783 -> ~US$ 68,76, VET ~5,09, tarifa ~R$ 0,11/US$)', () => {
  assert.deepEqual(PADROES_REMESSA, { conversao: 0.0113, encargos: 0.011 });
  perto(vetRemessa(4.9783, PADROES_REMESSA), 5.0902, 0.001);
  const r = remessaPorReais(350, 4.9783, PADROES_REMESSA);
  perto(r.usd, 68.76, 0.03);
  perto(r.tarifaPorUsd, 0.1119, 0.002);
  perto(r.conversaoBrl, 3.88, 0.05);
  perto(r.encargosBrl, 3.81, 0.05);
  assert.equal(r.reais, 350);
});

test('remessa: caminho inverso (US$ que quero -> R$ a enviar) volta ao mesmo valor', () => {
  const ida = remessaPorReais(1000, 5, PADROES_REMESSA);
  const volta = remessaPorDolares(ida.usd, 5, PADROES_REMESSA);
  perto(volta.reais, 1000, 0.1);
  assert.equal(remessaPorDolares(0, 5, PADROES_REMESSA), null);
  assert.equal(remessaPorReais(100, 0, PADROES_REMESSA), null, 'sem cotação não estima');
  const sem = remessaPorDolares(100, 5, { conversao: 0, encargos: 0 });
  assert.equal(sem.reais, 500);
});

test('taxas editáveis: valor estranho volta pro padrão; as do Tiago ficam guardadas (e vêm do último envio)', () => {
  assert.deepEqual(taxasValidas({ conversao: 0.5, encargos: -1 }), PADROES_REMESSA);
  const mem = {}; const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
  assert.deepEqual(lerTaxasRemessa(storage, { conversao: 0.012, encargos: 0.011 }), { conversao: 0.012, encargos: 0.011 }, 'sem as do navegador, usa o último envio');
  gravarTaxasRemessa({ conversao: 0.009, encargos: 0.0038 }, storage);
  assert.deepEqual(lerTaxasRemessa(storage, { conversao: 0.012, encargos: 0.011 }), { conversao: 0.009, encargos: 0.0038 });
  assert.deepEqual(lerTaxasRemessa(null, null), PADROES_REMESSA, 'sem localStorage também funciona');
});

test('caixa em dólar e necessidade: faltam quantos US$ e quantos R$ enviar', () => {
  const c = caixaValido({ movimentos: [{ id: 'a', usd: 100 }, { id: 'b', usd: -30.5 }] });
  assert.equal(c.saldoUsd, 69.5);
  assert.equal(caixaValido(null).saldoUsd, 0);
  const n = necessidadeDeDolares(120, 69.5, 5, PADROES_REMESSA);
  assert.deepEqual([n.precisa, n.caixa, n.falta, n.sobra], [120, 69.5, 50.5, 0]);
  perto(n.enviar.reais, 50.5 * vetRemessa(5, PADROES_REMESSA), 0.01);
  const sobra = necessidadeDeDolares(20, 69.5, 5, PADROES_REMESSA);
  assert.deepEqual([sobra.falta, sobra.sobra, sobra.enviar], [0, 49.5, null]);
});

const A = (ticker, preco, desejado, atual, extra = {}) => ({ ticker, precoAtual: preco, moeda: 'USD', quantidade: 1, totalAtualizado: 100, vies: 'Comprar', precoTeto: preco * 1.2, radar: { percentualDesejado: desejado, percentualAtual: atual }, ...extra });

test('sugestão: divide o caixa pelo quanto cada ação está abaixo do alvo, em ações inteiras, e usa o troco', () => {
  const s = sugerirDivisaoCaixa([A('AAA', 10, 0.5, 0.2), A('BBB', 20, 0.3, 0.2), A('CCC', 15, 0.2, 0.2)], 200, { hoje: '2026-10-05', cambio: 5 });
  const porTicker = Object.fromEntries(s.itens.map((i) => [i.ticker, i.qtd]));
  assert.equal(porTicker.CCC, undefined, 'quem está no alvo não entra');
  assert.ok(porTicker.AAA > porTicker.BBB, 'a mais abaixo do alvo recebe mais');
  assert.ok(s.usado <= 200 && s.sobra >= 0);
  assert.equal(Math.round((s.usado + s.sobra) * 100) / 100, 200);
  assert.ok(s.sobra < 10, 'o troco foi reaproveitado: sobra menos que a ação mais barata');
  assert.match(s.itens.find((i) => i.ticker === 'AAA').motivo, /20,0% de 50,0% desejado/);
});

test('sugestão: sem caixa ou sem preço não sugere nada; caixa pequeno demais pra uma ação inteira', () => {
  assert.deepEqual(sugerirDivisaoCaixa([A('AAA', 10, 0.5, 0.2)], 0), { itens: [], sobra: 0, usado: 0 });
  assert.deepEqual(sugerirDivisaoCaixa([], 100).itens, []);
  assert.deepEqual(sugerirDivisaoCaixa([A('AAA', 500, 0.5, 0.2)], 100).itens, []);
  assert.equal(sugerirDivisaoCaixa([A('AAA', 500, 0.5, 0.2)], 100).sobra, 100);
});

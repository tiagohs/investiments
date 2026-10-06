// tests/charts-anel-centro.test.js - 06/10/2026: texto do centro do anel que não cabe é reduzido/abreviado e o detalhe vai pro "i".
// Dados 100% inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente } from './charts-helper.mjs';
import { criarAnel } from '../assets/js/charts/anel.js';

const fatias = [{ nome: 'Alfa', valor: 600 }, { nome: 'Beta', valor: 400 }];

test('centro com parênteses ("US$ x (R$ y)"): o centro mostra só o valor e o "i" guarda o equivalente; tooltip do gráfico no foco', () => {
  const amb = criarAmbiente({ reduzido: true });
  criarAnel(amb.novo(), { fatias, tamanho: 200, formatarValor: () => 'US$ 1.000,00 (R$ 5.000,00)' });
  const centro = amb.doc.querySelector('.chart-anel-valor').textContent;
  assert.equal(centro, 'US$ 1.000,00');
  const info = amb.doc.querySelector('.chart-anel-info');
  assert.equal(info.hidden, false);
  assert.match(info.getAttribute('aria-label'), /US\$ 1\.000,00 \(R\$ 5\.000,00\)/);
  assert.equal(info.getAttribute('title'), null); // sem tooltip nativo (não duplica o do gráfico)
  info.dispatchEvent(new amb.win.Event('focus'));
  assert.match(amb.doc.querySelector('.chart-tip').textContent, /R\$ 5\.000,00/);
  assert.ok(amb.doc.querySelector('.chart-tip').classList.contains('is-on'));
});

test('centro simples que cabe: sem "i"; valor grande demais é abreviado e o texto completo vai pro "i"', () => {
  const amb = criarAmbiente({ reduzido: true });
  criarAnel(amb.novo(), { fatias, tamanho: 200, formatarValor: () => 'R$ 10,00' });
  assert.equal(amb.doc.querySelector('.chart-anel-info').hidden, true);
  const amb2 = criarAmbiente({ reduzido: true });
  criarAnel(amb2.novo(), { fatias, tamanho: 120, formatarValor: () => 'R$ 1.234.567.890,12' });
  assert.equal(amb2.doc.querySelector('.chart-anel-valor').textContent, 'R$ 1,2 bi');
  assert.equal(amb2.doc.querySelector('.chart-anel-info').hidden, false);
  assert.match(amb2.doc.querySelector('.chart-anel-info').getAttribute('aria-label'), /1\.234\.567\.890,12/);
});

test('hover numa fatia troca o centro por "%" e esconde o "i"; sair volta', () => {
  const amb = criarAmbiente({ reduzido: true });
  const anel = criarAnel(amb.novo(), { fatias, tamanho: 200, formatarValor: () => 'US$ 1.000,00 (R$ 5.000,00)' });
  anel.selecionar('Alfa');
  assert.equal(amb.doc.querySelector('.chart-anel-info').hidden, true);
  anel.selecionar(null);
  assert.equal(amb.doc.querySelector('.chart-anel-info').hidden, false);
  assert.equal(amb.doc.querySelector('.chart-anel-valor').textContent, 'US$ 1.000,00');
});

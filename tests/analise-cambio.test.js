// Testes de assets/js/analise-cambio.js + regrasCambioJanelas de analise-grafico.js (07/10/2026 - Tiago: "Inclua na lista
// de análises essas quedas por causa de câmbio"). Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decomporCambio, itemCambio } from '../assets/js/analise-cambio.js';
import { analisarSerie } from '../assets/js/analise-grafico.js';

const aprox = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} !~ ${b}`);

test('decomporCambio(): R$ = US$ x câmbio (deduz o preço em dólar do resultado em reais e do dólar)', () => {
  const d = decomporCambio({ retornoBrl: -0.053, variacaoCambio: 4.95 / 5.22 - 1 });
  aprox(d.retornoUsd, (1 - 0.053) / (4.95 / 5.22) - 1);
  assert.ok(Math.abs(d.retornoUsd) < 0.003); // em dólar, quase estável
  assert.ok(d.parteCambio > 0.9);
  assert.equal(d.dominante, 'cambio');
  // e na ordem inversa: com o preço em US$ conhecido
  const d2 = decomporCambio({ retornoUsd: 0.01, variacaoCambio: -0.02 });
  aprox(d2.retornoBrl, 1.01 * 0.98 - 1);
});

test('decomporCambio(): limiar de 60%, sinais opostos e ruído do dia a dia', () => {
  // dólar +3,5% e preço +2%: o câmbio responde por ~63% do log-retorno; com +2,5% (~56%) o preço ainda pesa mais
  assert.equal(decomporCambio({ retornoUsd: 0.02, variacaoCambio: 0.035, minimoCambio: 0.003 }).dominante, 'cambio');
  assert.equal(decomporCambio({ retornoUsd: 0.02, variacaoCambio: 0.025, minimoCambio: 0.003 }).dominante, 'preco');
  // preço manda: +8% em dólar, dólar +1%
  assert.equal(decomporCambio({ retornoUsd: 0.08, variacaoCambio: 0.01, minimoCambio: 0.003 }).dominante, 'preco');
  // sinais opostos: +3% em dólar, dólar -4% => R$ negativo
  const op = decomporCambio({ retornoUsd: 0.03, variacaoCambio: -0.04, minimoCambio: 0.01 });
  assert.equal(op.dominante, 'cambio'); // câmbio é a causa do sinal em R$ (parte > 100%)
  assert.ok(op.parteCambio > 1);
  // sinais opostos com R$ de sinal igual ao do preço, mas dólar relevante contra: 'oposto'
  const op2 = decomporCambio({ retornoUsd: 0.06, variacaoCambio: -0.03, minimoCambio: 0.01 });
  assert.equal(op2.dominante, 'oposto');
  // dólar parado (abaixo do mínimo): nada a dizer
  assert.equal(decomporCambio({ retornoUsd: 0.01, variacaoCambio: 0.001, minimoCambio: 0.003 }).dominante, null);
  assert.equal(decomporCambio({ retornoBrl: 0.01 }), null);
});

test('itemCambio(): texto da queda por causa do dólar e da alta (inverso)', () => {
  const queda = itemCambio({
    d: decomporCambio({ retornoUsd: 0.001, variacaoCambio: 4.95 / 5.22 - 1, minimoCambio: 0.003 }),
    janela: 'dia', rotulo: 'hoje', nivelIni: 5.22, nivelFim: 4.95,
  });
  assert.match(queda.texto, /^Queda de 5,\d% hoje/);
  assert.match(queda.texto, /quase toda pelo dólar \(−5,2%: R\$\s5,22 → R\$\s4,95\)/);
  assert.match(queda.texto, /em dólar as ações subiram 0,1%/);
  assert.match(queda.texto, /Os preços não caíram/);
  assert.equal(queda.tom, 'neutro');
  assert.equal(queda.tipo, 'cambio-dia');

  const alta = itemCambio({ d: decomporCambio({ retornoUsd: -0.001, variacaoCambio: 0.04, minimoCambio: 0.01 }), janela: 'mes', nivelIni: 5, nivelFim: 5.2 });
  assert.match(alta.texto, /^Alta de 3,9% no mês, quase toda pelo dólar \(\+4,0%: R\$\s5,00 → R\$\s5,20\); em dólar as ações caíram 0,1%/);
  assert.match(alta.texto, /Não é valorização dos preços/);

  const oposto = itemCambio({ d: decomporCambio({ retornoUsd: 0.06, variacaoCambio: -0.03, minimoCambio: 0.01 }), janela: 'periodo', rotulo: 'de 02/09 a 06/10', sujeito: { texto: 'o ativo', plural: false } });
  assert.match(oposto.texto, /em dólar o ativo subiu 6,0% \(\+6,0%\), mas o dólar caiu 3,0%/);
  assert.match(oposto.texto, /em reais, alta de 2,\d%/);

  assert.equal(itemCambio({ d: decomporCambio({ retornoUsd: 0.08, variacaoCambio: 0.01, minimoCambio: 0.003 }) }), null);
});

/** 40 dias; preço em US$ quase parado; o dólar despenca no último dia (5,22 -> 4,95). */
function cenarioQuedaDolar() {
  const ds = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10)); // 01/09 .. 10/10
  const cambio = ds.map((data, i) => ({ data, valor: i === ds.length - 1 ? 4.95 : 5.22 + 0.002 * Math.sin(i) }));
  cambio[ds.length - 2].valor = 5.22;
  const usd = ds.map((_, i) => 1000 * (1 + 0.0004 * i + (i === ds.length - 1 ? 0.001 : 0)));
  const brl = ds.map((_, i) => usd[i] * cambio[i].valor);
  let f = 1;
  const serie = ds.map((data, i) => { if (i > 0) f *= brl[i] / brl[i - 1]; return { data, retorno: (f - 1) * 100, valor: brl[i], fluxo: 0 }; });
  return { ds, cambio, serie };
}

test('analisarSerie(): ações EUA em reais - a queda do dia por causa do dólar vira item de análise', () => {
  const { ds, cambio, serie } = cenarioQuedaDolar();
  const hoje = ds[ds.length - 1];
  const a = analisarSerie({ serie, indices: {}, cambio, periodo: '30d', classe: 'eua', nome: 'A carteira internacional', hoje });
  const dia = a.pontos.find((p) => p.tipo === 'cambio-dia');
  assert.ok(dia, `pontos: ${a.pontos.map((p) => p.tipo)}`);
  assert.match(dia.texto, /^Queda de 5,\d% hoje, quase toda pelo dólar \(−5,2%: R\$\s5,22 → R\$\s4,95\); em dólar as ações subiram 0,\d%/);
  assert.ok(a.criterios.includes('efeito_cambio'));
  // o resumo do card cita o dólar
  assert.match(a.resumo, /pelo dólar/);
  // sem `hoje` (ou outro dia), o rótulo vira a data
  const b = analisarSerie({ serie, indices: {}, cambio, periodo: '30d', classe: 'eua', hoje: '2030-01-01' });
  assert.match(b.pontos.find((p) => p.tipo === 'cambio-dia').texto, /^Queda de [\d,]+% em 10\/10,/);
});

test('analisarSerie(): em dólar (moeda USD) e fora de ações EUA não gera item de câmbio', () => {
  const { cambio, serie } = cenarioQuedaDolar();
  const usd = analisarSerie({ serie, indices: {}, cambio, periodo: '30d', classe: 'eua', moeda: 'USD' });
  assert.ok(!usd.pontos.some((p) => /^cambio/.test(p.tipo)));
  const acoes = analisarSerie({ serie, indices: {}, cambio, periodo: '30d', classe: 'acoes' });
  assert.ok(!acoes.pontos.some((p) => /^cambio/.test(p.tipo)));
});

test('analisarSerie(): dólar parado não gera item de dia', () => {
  const { ds, serie } = cenarioQuedaDolar();
  const cambio = ds.map((data) => ({ data, valor: 5.2 }));
  const a = analisarSerie({ serie, indices: {}, cambio, periodo: '30d', classe: 'eua' });
  assert.ok(!a.pontos.some((p) => p.tipo === 'cambio-dia'));
});

test('itemCambio(): "estável" concorda com o sujeito', () => {
  const d = decomporCambio({ retornoUsd: 0.0001, variacaoCambio: -0.03, minimoCambio: 0.003 });
  assert.match(itemCambio({ d, janela: 'dia', rotulo: 'hoje' }).texto, /as ações ficaram estáveis/);
  assert.match(itemCambio({ d, janela: 'dia', rotulo: 'hoje', sujeito: { texto: 'o ativo', plural: false } }).texto, /o ativo ficou estável/);
});

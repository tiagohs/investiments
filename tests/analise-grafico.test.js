// Testes de assets/js/analise-grafico.js (02/10/2026 - card de Análise,
// pedido C do Tiago). Séries inventadas cobrindo cada regra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { analisarSerie, descreverPeriodo, curvaDaSerie, renderAnalise, htmlAnalise } from '../assets/js/analise-grafico.js';

/** n dias corridos a partir de `inicio`, todos pregão. */
function datas(n, inicio = '2026-01-01') {
  const [a, m, d] = inicio.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10));
}
/** Série de retorno acumulado (%) a partir de retornos diários (fração). */
function serieDeRetornos(ds, diarios) {
  let f = 1;
  return ds.map((data, i) => { if (i > 0) f *= 1 + diarios[i]; return { data, retorno: (f - 1) * 100 }; });
}
const ruido = (i, amp = 0.004) => amp * Math.sin(i * 1.7) * Math.cos(i * 0.37);
const linear = (ds, totalPct) => ds.map((data, i) => ({ data, retorno: (totalPct * i) / (ds.length - 1) }));
const tipos = (a) => a.pontos.map((p) => p.tipo);
const ponto = (a, tipo) => a.pontos.find((p) => p.tipo === tipo);

test('descreverPeriodo(): presets e personalizado', () => {
  assert.equal(descreverPeriodo('mes'), 'no mês');
  assert.equal(descreverPeriodo('tudo'), 'desde o início');
  assert.equal(descreverPeriodo({ inicio: '2026-10-02', fim: '2026-10-24' }), 'de 02/10 a 24/10');
  assert.equal(descreverPeriodo({ inicio: '2025-12-20', fim: '2026-01-10' }), 'de 20/12/2025 a 10/01/2026');
});

test('curvaDaSerie(): sem `retorno`, calcula o retorno ponderado no tempo descontando o fluxo', () => {
  const c = curvaDaSerie([
    { data: '2026-01-01', valor: 1000 },
    { data: '2026-01-02', valor: 1010 },
    { data: '2026-01-03', valor: 2010, fluxo: 1000 }, // aporte: não é rendimento
    { data: '2026-01-04', valor: 2030.1 },
  ]);
  assert.ok(Math.abs(c[2].f - 1.01) < 1e-9);
  assert.ok(Math.abs(c[3].f - 1.01 * (2030.1 / 2010)) < 1e-9);
});

test('regra comparacao: acima do CDI com "% do CDI" e tom bom', () => {
  const ds = datas(30);
  const a = analisarSerie({ serie: linear(ds, 2), indices: { CDI: linear(ds, 1) }, periodo: '30d', nome: 'A carteira' });
  const p = ponto(a, 'comparacao');
  assert.equal(p.tom, 'bom');
  assert.match(p.texto, /A carteira rendeu \+2,00% em 30 dias — 1,00 p\.p\. acima do CDI \(200% do CDI\)/);
  assert.equal(a.pontos[0], p, 'a comparação abre a lista');
  assert.match(a.resumo, /^\+2,00% em 30 dias, acima do CDI/);
});

test('regra comparacao: abaixo de todos os índices = atenção; misto = neutro; empate', () => {
  const ds = datas(30);
  const abaixo = analisarSerie({ serie: linear(ds, 0.5), indices: { CDI: linear(ds, 1), Ibovespa: linear(ds, 3) }, periodo: 'mes' });
  assert.equal(ponto(abaixo, 'comparacao').tom, 'atencao');
  assert.match(ponto(abaixo, 'comparacao').texto, /0,50 p\.p\. abaixo do CDI .*2,50 p\.p\. abaixo do Ibovespa/);
  const misto = analisarSerie({ serie: linear(ds, 2), indices: { CDI: linear(ds, 1), Ibovespa: linear(ds, 3) }, periodo: 'mes' });
  assert.equal(ponto(misto, 'comparacao').tom, 'neutro');
  assert.match(misto.resumo, /acima do CDI e abaixo do Ibovespa/);
  const empate = analisarSerie({ serie: linear(ds, 1), indices: { CDI: linear(ds, 1.02), IPCA: linear(ds, 0.99) }, periodo: 'mes' });
  assert.match(ponto(empate, 'comparacao').texto, /praticamente empatado com o CDI e o IPCA/);
});

test('regra movimento: queda brusca nos últimos 3 pregões, acompanhando o mercado e puxada por um componente', () => {
  const ds = datas(80);
  const diarios = ds.map((_, i) => (i === 0 ? 0 : (i >= 77 ? -0.02 : ruido(i))));
  const ibov = ds.map((_, i) => (i === 0 ? 0 : (i >= 77 ? -0.018 : ruido(i + 3))));
  const serie = serieDeRetornos(ds, diarios);
  const componentes = {
    'Ações': ds.map((data, i) => ({ data, valor: i >= 77 ? 1000 - (i - 76) * 300 : 1000, fluxo: 0 })),
    'Renda Fixa': ds.map((data) => ({ data, valor: 5000, fluxo: 0 })),
  };
  const a = analisarSerie({ serie, indices: { Ibovespa: serieDeRetornos(ds, ibov) }, periodo: '30d', componentes });
  const p = ponto(a, 'movimento');
  assert.ok(p, `deveria detectar a queda (pontos: ${tipos(a)})`);
  assert.equal(p.tom, 'atencao');
  assert.match(p.texto, /Nos últimos 3 pregões \(\d\d\/03 a 21\/03\) caiu 5,88%/);
  assert.match(p.texto, /Acompanhou o mercado: o Ibovespa caiu/);
  assert.match(p.texto, /A maior parte veio de Ações \(−R\$/);
  assert.equal(a.tom, 'atencao');
  assert.match(a.resumo, /queda forte nos últimos dias/);
});

test('regra movimento: o mercado não explica (índice parado) e alta brusca vira tom bom', () => {
  const ds = datas(60);
  const diarios = ds.map((_, i) => (i === 0 ? 0 : (i >= 57 ? 0.025 : ruido(i))));
  const ibov = ds.map((_, i) => (i === 0 ? 0 : ruido(i + 5)));
  const a = analisarSerie({ serie: serieDeRetornos(ds, diarios), indices: { Ibovespa: serieDeRetornos(ds, ibov) }, periodo: '6m' });
  const p = ponto(a, 'movimento');
  assert.equal(p.tom, 'bom');
  assert.match(p.texto, /subiu/);
  assert.match(p.texto, /O mercado não explica/);
});

test('regra movimento: renda fixa só com índices de taxa - aponta marcação a mercado; oscilação normal não vira ponto', () => {
  const ds = datas(60);
  const diarios = ds.map((_, i) => (i === 0 ? 0 : (i >= 57 ? -0.006 : 0.0004 + ruido(i, 0.0002))));
  const cdi = linear(ds, 2.4);
  const a = analisarSerie({ serie: serieDeRetornos(ds, diarios), indices: { CDI: cdi, IPCA: linear(ds, 1) }, periodo: '30d', nome: 'A renda fixa' });
  assert.match(ponto(a, 'movimento').texto, /marcação a mercado/);
  const calmo = analisarSerie({ serie: serieDeRetornos(ds, ds.map((_, i) => (i ? ruido(i) : 0))), indices: { CDI: cdi }, periodo: '30d' });
  assert.equal(ponto(calmo, 'movimento'), undefined);
});

test('regra movimento usa o contexto (série mais longa) quando o período é curto demais', () => {
  const ds = datas(70);
  const diarios = ds.map((_, i) => (i === 0 ? 0 : (i >= 67 ? -0.02 : ruido(i))));
  const longa = serieDeRetornos(ds, diarios);
  const curta = longa.slice(-3).map((p, i, arr) => ({ data: p.data, retorno: ((1 + p.retorno / 100) / (1 + arr[0].retorno / 100) - 1) * 100 }));
  assert.equal(ponto(analisarSerie({ serie: curta, periodo: 'mes' }), 'movimento'), undefined, 'sem contexto não dá pra medir');
  assert.ok(ponto(analisarSerie({ serie: curta, periodo: 'mes', contexto: { serie: longa } }), 'movimento'));
});

test('regra fluxos: aporte explica a maior parte do aumento do valor', () => {
  const ds = datas(30);
  const serie = ds.map((data, i) => ({ data, valor: 10000 + i * 10 + (i >= 15 ? 5000 : 0), fluxo: i === 15 ? 5000 : 0 }));
  const a = analisarSerie({ serie, periodo: 'mes' });
  const p = ponto(a, 'fluxos');
  assert.ok(p);
  assert.match(p.texto, /Do aumento de R\$\s5\.290,00 no valor no mês, R\$\s5\.000,00 foram aportes — o ganho de mercado foi \+R\$\s290,00/);
  const resgate = analisarSerie({ serie: ds.map((data, i) => ({ data, valor: 10000 + i * 10 - (i >= 15 ? 4000 : 0), fluxo: i === 15 ? -4000 : 0 })), periodo: 'mes' });
  assert.match(ponto(resgate, 'fluxos').texto, /mas R\$\s4\.000,00 foram resgates\/saídas — descontando isso, o resultado foi \+R\$\s290,00/);
});

test('regra fluxoRecente: aporte grande nos últimos dias de um período longo', () => {
  const ds = datas(90);
  const serie = ds.map((data, i) => ({ data, valor: 20000 + i * 5 + (i >= 88 ? 3000 : 0), fluxo: i === 88 ? 3000 : 0 }));
  const p = ponto(analisarSerie({ serie, periodo: '6m' }), 'fluxoRecente');
  assert.ok(p);
  assert.match(p.texto, /Em 30\/03 entrou um aporte de R\$\s3\.000,00 — o salto no valor desse dia não é rendimento/);
});

test('regra queda: maior queda do período recuperada x ainda abaixo do pico', () => {
  const ds = datas(40);
  const recuperada = ds.map((data, i) => ({ data, retorno: i < 10 ? i : (i < 20 ? 10 - (i - 10) : (i < 30 ? (i - 20) * 1.2 : 12 + (i - 30) * 0.1)) }));
  const a = analisarSerie({ serie: recuperada, periodo: '30d' });
  const p = ponto(a, 'queda');
  assert.equal(p.tom, 'neutro');
  assert.match(p.texto, /Maior queda em 30 dias: −9,09% \(de 11\/01 a 21\/01\), já recuperada em 30\/01/);
  const aberta = ds.map((data, i) => ({ data, retorno: i < 10 ? i : (i < 20 ? 10 - (i - 10) * 0.8 : 2 + (i - 20) * 0.1) }));
  const q = ponto(analisarSerie({ serie: aberta, periodo: '30d' }), 'queda');
  assert.equal(q.tom, 'atencao');
  assert.match(q.texto, /ainda está .*% abaixo dele/);
});

test('regra tendencia: à frente do CDI no ano, mas atrás nos últimos 3 meses', () => {
  const ds = datas(365, '2025-10-01');
  const port = ds.map((data, i) => ({ data, retorno: i < 270 ? i * 0.06 : 16.2 - (i - 270) * 0.01 }));
  const a = analisarSerie({ serie: port, indices: { CDI: linear(ds, 13) }, periodo: '12m' });
  const p = ponto(a, 'tendencia');
  assert.ok(p, `pontos: ${tipos(a)}`);
  assert.equal(p.tom, 'atencao');
  assert.match(p.texto, /Perdeu fôlego: nos últimos 3 meses ficou .* abaixo do CDI, apesar de estar .* acima dele no período inteiro/);
  assert.equal(ponto(analisarSerie({ serie: linear(ds.slice(0, 90), 3), indices: { CDI: linear(ds.slice(0, 90), 1) }, periodo: '30d' }), 'tendencia'), undefined, 'período curto: sem tendência');
});

test('regra concentracao: resultado quase todo de um componente, e forças opostas', () => {
  const ds = datas(20);
  const comp = (fim) => ds.map((data, i) => ({ data, valor: 1000 + (fim * i) / 19, fluxo: 0 }));
  const serie = ds.map((data, i) => ({ data, valor: 3000 + (110 * i) / 19 }));
  const a = analisarSerie({ serie, periodo: 'mes', componentes: { 'Ações': comp(100), FIIs: comp(5), 'Renda Fixa': comp(5) } });
  assert.match(ponto(a, 'concentracao').texto, /O resultado no mês veio quase todo de Ações \(\+R\$\s100,00 de \+R\$\s110,00\)/);
  const b = analisarSerie({ serie, periodo: 'mes', componentes: { 'Ações EUA': comp(-1000), FIIs: comp(600), 'Renda Fixa': comp(500) } });
  assert.match(ponto(b, 'concentracao').texto, /Ações EUA puxou para baixo \(−R\$\s1\.000,00\) no mês, enquanto FIIs e Renda Fixa compensaram em parte \(\+R\$\s1\.100,00\)/);
});

test('analisarSerie(): no máximo 4 pontos, série curta demais não tem análise', () => {
  const ds = datas(365, '2025-10-01');
  const serie = ds.map((data, i) => ({ data, valor: 10000 + i * 40 + (i > 200 ? 20000 : 0) - (i > 330 && i < 345 ? 1500 : 0), fluxo: i === 201 ? 20000 : (i === 362 ? 4000 : 0) }));
  serie.forEach((p, i) => { if (i >= 362) p.valor += 4000; });
  const a = analisarSerie({ serie, indices: { CDI: linear(ds, 12) }, periodo: '12m' });
  assert.ok(a.pontos.length <= 4);
  assert.equal(a.pontos[0].tipo, 'comparacao');
  assert.deepEqual(analisarSerie({ serie: serie.slice(0, 1) }).pontos, []);
});

test('renderAnalise(): card colapsável com 1 linha de resumo, lembra se estava aberto, some sem análise', () => {
  const doc = new JSDOM('<!doctype html><html><head></head><body><div id="c"></div></body></html>').window.document;
  const c = doc.getElementById('c');
  const ds = datas(30);
  const a = analisarSerie({ serie: linear(ds, 2), indices: { CDI: linear(ds, 1) }, periodo: '30d' });
  renderAnalise(doc, c, a);
  const det = c.querySelector('details.ag');
  assert.ok(det && !det.open);
  assert.ok(det.classList.contains('ag-tom-bom'));
  assert.match(c.querySelector('.ag-resumo').textContent, /acima do CDI/);
  assert.match(c.querySelector('.ag-ver').textContent, /Ver análise/);
  assert.equal(c.querySelectorAll('.ag-ponto').length, a.pontos.length);
  det.open = true;
  det.dispatchEvent(new doc.defaultView.Event('toggle'));
  renderAnalise(doc, c, a);
  assert.ok(c.querySelector('details.ag').open, 'continua aberto depois de redesenhar');
  renderAnalise(doc, c, null);
  assert.equal(c.innerHTML, '');
  assert.equal(c.hidden, true);
  assert.equal(htmlAnalise({ pontos: [] }), '');
  assert.ok(!htmlAnalise({ tom: 'neutro', resumo: '<b>', pontos: [{ tom: 'neutro', texto: '<script>' }] }).includes('<script>'), 'escapa o texto');
});

test('regra queda: quando o fim do período é o fundo, diz isso (sem repetir a mesma %)', () => {
  const ds = datas(20);
  const serie = ds.map((data, i) => ({ data, retorno: i < 10 ? i * 0.5 : 5 - (i - 9) * 0.6 }));
  const p = ponto(analisarSerie({ serie, periodo: 'mes' }), 'queda');
  assert.match(p.texto, /desde o pico de 10\/01, e o fim do período é o ponto mais baixo\./);
});

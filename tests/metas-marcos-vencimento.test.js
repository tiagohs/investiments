// tests/metas-marcos-vencimento.test.js
//
// 05/10/2026 (pedido do Tiago): (1) toda simulação de meta em milhões (aposentadoria/
// patrimônio) diz "com isso, sua meta de X chega em ..., o 1º milhão em ..., o 2º ..." e a
// velocidade entre os marcos; (2) reserva com título de renda fixa que vence: IR cobrado, dinheiro
// cai na conta, a reserva continua (ou não) acima do mínimo, marcador na projeção.
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  calcularMeta, marcosProjecao, fraseMarcos, velocidadeEntreMarcos, resumoMarcos, velocidadeMeta, dicasAcelerar,
  cenariosRendaMenor, analisarProjecaoMeta, serieProjecao, eventosVencimento,
} from '../assets/js/pages/metas-calc.js';
import { opcoesProjecao } from '../assets/js/pages/metas-graficos.js';
import { montarPaginaMetas, TEMPLATE_METAS, cardMetaHtml } from '../assets/js/pages/metas.js';

const HOJE = '2026-10-05';
const CTX = { ativos: [], cambio: { USD: { valor: 5, fonte: 'teste' } }, hoje: HOJE, referencias: {} };
const clone = (o) => JSON.parse(JSON.stringify(o));
const espera = () => new Promise((r) => setTimeout(r, 0));
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

// aposentadoria de R$ 3,2 mi, R$ 300 mil guardados, R$ 6 mil por mês a 8% ao ano
const APOS = { id: 'ap', tipo: 'aposentadoria', nome: 'Apos Teste', dataAlvo: '2056-10', rendimentoAnual: 0.08, aporteMensal: 6000, valorInicial: 300000, valorAlvo: 3400000, especificos: { modoAlvo: 'montante' }, vinculos: [], status: 'ativa' };

test('marcos: frase "Com isso, sua meta de R$ X chega em mês/ano; o 1º milhão em AAAA, o 2º em AAAA, o 3º em AAAA"', () => {
  const c = calcularMeta(APOS, CTX);
  const marcos = marcosProjecao(c, { hoje: HOJE });
  assert.deepEqual(marcos.map((m) => m.rotulo), ['1º milhão', '2º milhão', '3º milhão', 'Alvo']);
  const f = fraseMarcos(marcos, { alvo: c.alvoBRL });
  assert.match(f, /^Com isso, sua meta de R\$\s3\.400\.000 chega em [a-z]{3}\/20\d\d; o 1º milhão em 20\d\d, o 2º em 20\d\d, o 3º em 20\d\d\.$/);
  assert.ok(marcos[0].ano < marcos[1].ano && marcos[1].ano < marcos[2].ano);
  // alvo pequeno (sem milhões): sem frase
  assert.equal(resumoMarcos({ alvoBRL: 100000, atualRitmo: 0, aporteAtual: 1000, taxa: 0 }).frase, '');
});

test('marcos: marco que já passou vira "já foi"; que não chega vira "não chega"', () => {
  const c = calcularMeta({ ...APOS, valorInicial: 1500000, aporteMensal: 0, rendimentoAnual: 0 }, CTX);
  const f = fraseMarcos(marcosProjecao(c, { hoje: HOJE }), { alvo: c.alvoBRL });
  assert.match(f, /o 1º milhão já foi, o 2º não chega, o 3º não chega/);
  assert.match(f, /não chega em 60 anos/);
});

test('velocidade entre marcos: do 1º pro 2º milhão, do 2º pro 3º - os juros compostos aceleram', () => {
  const c = calcularMeta(APOS, CTX);
  const marcos = marcosProjecao(c, { hoje: HOJE });
  const v = velocidadeEntreMarcos(marcos);
  assert.match(v, /^do 1º pro 2º milhão: .+; do 2º pro 3º: .+; do 3º milhão à meta: .+ - os juros compostos aceleram/);
  const d12 = marcos[1].meses - marcos[0].meses; const d23 = marcos[2].meses - marcos[1].meses;
  assert.ok(d23 < d12, 'cada milhão vem mais rápido');
  // sem rendimento não "acelera"
  const c0 = calcularMeta({ ...APOS, rendimentoAnual: 0 }, CTX);
  assert.doesNotMatch(velocidadeEntreMarcos(marcosProjecao(c0, { hoje: HOJE })), /aceleram/);
});

test('simulações trazem a frase: 75%/50% do tempo, dicas, renda -10%/-20%, projeção (necessário) e resumo', () => {
  const meta = { ...APOS, aporteMensal: 4000, valorAlvo: 3400000 };
  const c = calcularMeta(meta, CTX);
  const vel = velocidadeMeta(c, { hoje: HOJE });
  assert.equal(vel.cenarios.length, 3);
  vel.cenarios.forEach((x) => assert.match(x.comIsso, /^Com isso, sua meta de R\$\s3\.400\.000 chega em .+; o 1º milhão em \d{4}/));
  const [base, v75, v50] = vel.cenarios;
  assert.ok(v50.aporte > v75.aporte && v75.aporte > base.aporte - 1);
  // em 50% do tempo, a meta chega no mês do cenário
  assert.match(v50.comIsso, new RegExp(`chega em ${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(v50.data.slice(5, 7)) - 1]}/${v50.data.slice(0, 4)}`));
  const dicas = dicasAcelerar(c, meta, { hoje: HOJE });
  assert.ok(dicas.find((d) => d.id === 'aporte').comIsso.startsWith('Com isso, sua meta de R$ 3.400.000'));
  const cen = cenariosRendaMenor(c, { hoje: HOJE });
  assert.match(cen[0].comIsso, /sua meta de R\$\s3\.060\.000 chega em/);
  assert.match(cen[1].comIsso, /sua meta de R\$\s2\.720\.000 chega em/);
  // análise: a velocidade entre os marcos entra na explicação; o aporte necessário traz a frase
  const cPrazo = calcularMeta({ ...meta, dataAlvo: '2040-10' }, CTX);
  const pontos = serieProjecao(cPrazo, { hoje: HOJE, meses: 120 });
  const an = analisarProjecaoMeta(cPrazo, { pontos, marcos: marcosProjecao(cPrazo, { hoje: HOJE }), hoje: HOJE });
  const txt = an.pontos.map((p) => p.texto).join(' | ');
  assert.match(txt, /Velocidade: do 1º pro 2º milhão/);
  assert.match(txt, /Com isso, sua meta de R\$\s3\.400\.000 chega em/);
});

test('calc: marcoProximo (1 linha do card) só com alvo em milhões', () => {
  const c = calcularMeta(APOS, CTX);
  assert.equal(c.marcoProximo.rotulo, '1º milhão');
  assert.ok(c.marcoProximo.ano >= 2026);
  const pequeno = calcularMeta({ ...APOS, valorAlvo: 100000 }, CTX);
  assert.equal(pequeno.marcoProximo, null);
  assert.match(cardMetaHtml(APOS, c), /1º milhão em <b>\d{4}<\/b>/);
});

// ---------------------------------------------------------------------------
// Reserva com título que vence
// ---------------------------------------------------------------------------
const TESOURO = { id: 'rf:Tesouro Selic 2027|Banco Y@emergencial', ref: 'rf:Tesouro Selic 2027|Banco Y', nome: 'Tesouro Selic 2027 · 01/2027', classe: 'rf', marca: 'emergencial', instituicao: 'Banco Y', indexador: 'SELIC', vencimento: '01/2027', valorBRL: 20000, irResgate: { ir: 600, iof: 0, liquido: 19400, isento: false, vencimento: { mes: '2027-01', dias: 100, aliquota: 0.175, principal: 17000 } } };
const CDB = { id: 'rf:CDB K|Banco Y@emergencial', ref: 'rf:CDB K|Banco Y', nome: 'CDB K', classe: 'rf', marca: 'emergencial', instituicao: 'Banco Y', indexador: 'CDI', valorBRL: 10000, irResgate: { ir: 100, iof: 0, liquido: 9900 } };
const RESERVA = { id: 'r1', tipo: 'reservaEmergencia', nome: 'Reserva Teste', rendimentoAnual: 0.12, especificos: { meses: 6, margem: 0, usarDespesasPlanilha: false, despesaMensal: 4800 }, vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }], status: 'ativa' };

test('vencimento: projeta IR e líquido que cai na conta; reserva abaixo do mínimo sem reaplicar = atenção e quanto falta', () => {
  // mínimo 28.800 (6 x 4.800); líquido hoje 29.300 (acima); sem o Tesouro cai pra 9.900 (faltam 18.900)
  const c = calcularMeta(RESERVA, { ...CTX, ativos: [TESOURO, CDB] });
  assert.equal(c.alvoBRL, 28800);
  assert.equal(c.atualLiquidoBRL, 29300);
  const v = c.vencimentos;
  assert.equal(v.eventos.length, 1);
  const e = v.eventos[0];
  assert.equal(e.mes, '2027-01');
  assert.equal(e.em, 3);
  // bruto projetado: 20.000 x (1+taxa)^3; IR = (bruto - principal 17.000) x 17,5%
  const bruto = 20000 * Math.pow(1.12, 3 / 12);
  assert.ok(Math.abs(e.bruto - Math.round(bruto * 100) / 100) < 0.02);
  assert.ok(Math.abs(e.ir - (bruto - 17000) * 0.175) < 0.02);
  assert.ok(Math.abs(e.liquido - (bruto - (bruto - 17000) * 0.175)) < 0.03);
  assert.equal(e.acimaMinimo, false);
  assert.equal(e.reservaSemReaplicar, 9900);
  assert.equal(e.falta, 18900);
  assert.equal(e.acimaReaplicando, true);
  assert.equal(e.tom, 'atencao');
  assert.ok(e.perdeMes > 0);
  assert.match(e.texto, /^Em jan\/2027 vence Tesouro Selic 2027: entram R\$\s19\.\d{3} líquidos \(IR R\$\s\d+\)\./);
  assert.match(e.texto, /continua acima do mínimo\? Não: .*faltam R\$\s18\.900/);
  assert.match(e.texto, /Reaplique em um Tesouro Selic com o vencimento mais longo disponível \(liquidez diária/);
  assert.match(e.texto, /para de render/);
  assert.equal(v.temAtencao, true);
});

test('vencimento: reserva folgada continua acima do mínimo ("Sim"); LCI/LCA isenta não paga IR; título já vencido/sem vencimento é ignorado', () => {
  const folgada = { ...RESERVA, especificos: { ...RESERVA.especificos, despesaMensal: 1000 } }; // mínimo 6.000
  const lci = { ...CDB, id: 'rf:LCI|B@emergencial', nome: 'LCI X', vencimento: '06/2027', irResgate: { ir: 0, iof: 0, isento: true } };
  const passado = { ...CDB, id: 'rf:Velho|B@emergencial', nome: 'Velho', vencimento: '05/2026' };
  const c = calcularMeta(folgada, { ...CTX, ativos: [TESOURO, lci, passado, CDB] });
  const ev = c.vencimentos.eventos;
  assert.deepEqual(ev.map((e) => e.mes), ['2027-01', '2027-06']);
  assert.equal(ev[0].acimaMinimo, true);
  assert.match(ev[0].texto, /continua acima do mínimo\? Sim/);
  assert.equal(ev[0].tom, 'neutro');
  assert.equal(ev[1].ir, 0, 'LCI/LCA isentas');
  assert.equal(calcularMeta(RESERVA, { ...CTX, ativos: [CDB] }).vencimentos, null, 'sem vencimento nos dados');
  // fora da reserva não projeta
  assert.equal(calcularMeta({ ...APOS, vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }] }, { ...CTX, ativos: [TESOURO] }).vencimentos, null);
});

test('vencimento sem dados de IR do .gs: estima com 15% sobre o que ainda vai render (estimado)', () => {
  const t = { ...TESOURO, irResgate: { ir: 600, iof: 0, liquido: 19400 } };
  const c = calcularMeta(RESERVA, { ...CTX, ativos: [t] });
  const e = c.vencimentos.eventos[0];
  assert.equal(e.titulos[0].estimado, true);
  assert.ok(e.ir > 600 && e.ir < 700, `IR ${e.ir}`);
  assert.match(e.texto, /estimado/);
});

test('vencimento: marcador no gráfico da projeção e horizonte vai até o vencimento', () => {
  const c = calcularMeta(RESERVA, { ...CTX, ativos: [TESOURO, CDB] });
  const pontos = serieProjecao(c, { hoje: HOJE });
  assert.ok(pontos.length > 3, 'horizonte chega a jan/2027');
  assert.ok(pontos.some((p) => p.mes === '2027-01'));
  // 06/10/2026 (Onda 3): o vencimento aparece no título do tooltip do mês (biblioteca de gráficos) e nas notas
  const o = opcoesProjecao(c, { pontos: pontos, hoje: HOJE });
  assert.ok(o.notas.vencimentos.length >= 1, 'vencimento marcado');
  assert.ok(o.eixoX.some((e) => /vence Tesouro Selic 2027/.test(e.titulo)), 'tooltip do mês do vencimento');
});

async function montarTela(base, metas, hash) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="metas"><main>${TEMPLATE_METAS}</main></body></html>`, { url: `https://exemplo.test/metas.html${hash}`, pretendToBeVisual: true });
  const w = dom.window; w.confirm = () => true; w.alert = () => {};
  const servidor = { ok: true, hoje: HOJE, arquivadas: [], cambio: CTX.cambio, referencias: {}, proventos12m: { porTicker: {} }, ativos: base, metas: clone(metas) };
  await montarPaginaMetas('tk', {
    doc: w.document, win: w, usarCache: false,
    getMetasImpl: async () => clone(servidor), salvarMetaImpl: async () => ({ ok: true }), excluirMetaImpl: async () => ({ ok: true }),
    getMetasHistoricoImpl: async () => ({ ok: true, hoje: HOJE, metas: {}, indices: [] }), carregarDadosViagemImpl: async () => ({ paises: [], cidades: [], taxas: {} }),
  });
  await espera(); await espera();
  return { doc: w.document, w };
}

test('tela da reserva: bloco "Títulos que vencem" com a frase, status de atenção, marcador no gráfico e linha no card da lista', async () => {
  const { doc } = await montarTela([TESOURO, CDB], [RESERVA], '#meta=r1');
  const bloco = doc.getElementById('mtVencimentos');
  assert.ok(bloco);
  assert.match(bloco.textContent, /Em jan\/2027 vence Tesouro Selic 2027/);
  assert.match(bloco.textContent, /Atenção/);
  assert.match(bloco.textContent, /Reserva sem reaplicar/);
  assert.match(bloco.textContent, /Falta pro mínimo/);
  assert.ok(doc.querySelector('#mtGrafico svg.chart-svg'), 'gráfico da projeção (biblioteca)');
  assert.match(doc.getElementById('mtGraficoNotas').textContent, /vence Tesouro Selic 2027/, 'nota do vencimento sob o gráfico');
  assert.match(doc.getElementById('mtTela').textContent, /vence Tesouro Selic 2027 em jan\/2027/);
  const lista = await montarTela([TESOURO, CDB], [RESERVA], '');
  assert.match(lista.doc.querySelector('.mt-card-marco.atencao').textContent, /Tesouro Selic 2027 vence em jan\/2027/);
});

test('tela da aposentadoria: frases dos milhões na velocidade, nos marcos, na renda menor e no simulador', async () => {
  const { doc, w } = await montarTela([], [{ ...APOS, aporteMensal: 4000, valorAlvo: 3400000 }], '#meta=ap');
  const t = doc.getElementById('mtTela');
  assert.match(t.querySelector('.mt-comisso').textContent, /No seu ritmo:.*Com isso, sua meta de R\$\s3\.400\.000 chega em .*o 1º milhão em \d{4}, o 2º em \d{4}, o 3º em \d{4}/);
  assert.match(t.querySelector('.mt-comisso').textContent, /Em 75% do tempo:/);
  assert.match(t.textContent, /Velocidade: do 1º pro 2º milhão/);
  assert.match(t.textContent, /Com o aporte necessário/);
  assert.match(t.textContent, /sua meta de R\$\s3\.060\.000 chega em/);
  // simulador "com um aporte"
  clique(w, t.querySelector('[data-sim-modo="aporte"]'));
  const res = doc.querySelector('.mt-sim-resultado');
  assert.match(res.textContent, /Com isso, sua meta de R\$\s3\.400\.000 chega em .*o 1º milhão em \d{4}/);
  assert.match(res.textContent, /do 1º pro 2º milhão/);
  // cartão da lista
  const lista = await montarTela([], [APOS], '');
  assert.match(lista.doc.querySelector('.mt-card-marco').textContent, /1º milhão em \d{4}/);
});

test('eventosVencimento: sem calc/sem vínculos devolve null', () => {
  assert.equal(eventosVencimento(null), null);
  assert.equal(eventosVencimento({ vinculos: [] }, { hoje: HOJE }), null);
});

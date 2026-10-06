// tests/metas-o5.test.js - 06/10/2026 (revisão do Tiago, seção "Metas"): semântica de cor (verde/amarelo/cinza), títulos que
// vencem (alerta só < 12 meses), excedente da reserva (resgate com IR, sem baixar da meta), aposentadoria x reserva podendo
// contar os mesmos ativos + "ignorar este aviso", custo total da viagem e a janela de 12 meses fechados. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularMeta, eventosVencimento, excedenteReserva, alocarMetas, ativosSobrecomprometidos, ignoraAvisoSobreposicao,
  LIMITE_ALERTA_VENCIMENTO_MESES,
} from '../assets/js/pages/metas-calc.js';
import { STATUS_META, tomProgresso, classeStatusVisual, ultimoMesFechadoMetas } from '../assets/js/pages/metas-calc-nucleo.js';
import { ultimoMesFechado } from '../assets/js/pages/proventos-calc.js';
import { analisarRendaMensal } from '../assets/js/pages/metas-calc-analise.js';
import { heroiHtml, excedenteHtml, fraseRitmo, anelProgressoHtml } from '../assets/js/pages/metas.js';
import { statusPillHtml } from '../assets/js/metas-card.js';

const HOJE = '2026-10-05';
const rf = (id, nome, valor, ir, venc, extra = {}) => ({ id: `rf:${id}@emergencial`, ref: `rf:${id}`, nome, classe: 'rf', marca: 'emergencial', valorBRL: valor, vencimento: venc, irResgate: { ir, iof: 0, precisao: 'exata' }, ...extra });
const RESERVA = { id: 'r', tipo: 'reservaEmergencia', nome: 'Reserva', status: 'ativa', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }], especificos: { meses: 6, margem: 0, despesaMensal: 5000, usarDespesasPlanilha: false }, rendimentoAnual: 0 };

test('semântica de cor: concluída verde, quase lá (90%+) amarelo, em progresso cinza; atrasada amarela; nada de vermelho de meta', () => {
  assert.equal(tomProgresso(1), 'bom');
  assert.equal(tomProgresso(0.95), 'quase');
  assert.equal(tomProgresso(0.89), 'neutro');
  assert.equal(tomProgresso(0.3, { atingida: true }), 'bom');
  assert.equal(STATUS_META.concluida.classe, 'good');
  assert.equal(STATUS_META['saldo-ideal'].classe, 'good');
  assert.equal(STATUS_META['no-ritmo'].classe, 'na', 'em progresso = cinza');
  assert.equal(STATUS_META['ideal-bruto'].classe, 'warn', 'quase lá = amarelo');
  assert.equal(STATUS_META.atrasada.classe, 'warn');
  assert.equal(STATUS_META.vencida.classe, 'warn');
  Object.values(STATUS_META).forEach((s) => assert.notEqual(s.classe, 'bad', 'vermelho só pra erro/grave'));
  assert.equal(classeStatusVisual('no-ritmo', 0.93), 'warn', 'em progresso com 93% vira "quase lá"');
  assert.equal(classeStatusVisual('abaixo', 0.4), 'na');
  assert.match(statusPillHtml('abaixo', null, 0.95), /mt-status warn/);
});

test('"Nesse ritmo você chega em…" não é mais faixa vermelha: atraso = amarelo (atencao), no prazo = verde', () => {
  const base = { aporteAtual: 1000, aporteOrigem: 'informado', status: 'atrasada', alvoBRL: 100000, dataEstimada: '2059-07', mesesEstimados: 393, mesesRestantes: 206 };
  const f = fraseRitmo({ tipo: 'aposentadoria' }, base);
  assert.equal(f.tom, 'atencao');
  assert.match(f.html, /depois do prazo/);
  assert.ok(!/mt-ruim/.test(f.html));
  assert.equal(fraseRitmo({ tipo: 'aposentadoria' }, { ...base, mesesRestantes: 400 }).tom, 'bom');
  assert.equal(fraseRitmo({ tipo: 'aposentadoria' }, { ...base, dataEstimada: null, ritmoSemAporte: true, aporteReal: 0 }).tom, 'atencao');
});

test('títulos que vencem: alerta SÓ se vence em menos de 12 meses e a reserva cai abaixo do mínimo; os demais são informação (neutro)', () => {
  const ativos = [rf('a', 'Selic 2027', 40000, 500, '03/2027'), rf('b', 'Selic 2029', 40000, 500, '03/2029')];
  const c = calcularMeta(RESERVA, { ativos, cambio: {}, hoje: HOJE, referencias: {} }); // mínimo 30.000 (líquido hoje 79.000)
  assert.equal(c.alvoBRL, 30000);
  // mínimo alto: a reserva cai abaixo em qualquer vencimento
  const ev = eventosVencimento({ ...c, alvoBRL: 70000 }, { hoje: HOJE });
  assert.equal(LIMITE_ALERTA_VENCIMENTO_MESES, 12);
  const [e1, e2] = ev.eventos;
  assert.equal(e1.em, 5);
  assert.equal(e1.acimaMinimo, false);
  assert.equal(e1.tom, 'atencao', 'vence em 5 meses e derruba a reserva: alerta');
  assert.equal(e2.acimaMinimo, false);
  assert.equal(e2.tom, 'neutro', 'vence em 29 meses: só informação, mesmo abaixo do mínimo');
  assert.equal(eventosVencimento(c, { hoje: HOJE }).temAtencao, false, 'reserva folgada: sem alerta');
});

test('excedente da reserva: líquido que passou do saldo ideal, tirando primeiro o título de menor imposto, sem baixar da meta', () => {
  const ativos = [
    rf('novo', 'CDB novo', 20000, 900, '2030-01'), // 4,5% de imposto sobre o valor
    rf('antigo', 'Selic antigo', 20000, 300, '2031-03'), // 1,5%
    rf('lci', 'LCI isenta', 10000, 0, '2029-06', { irResgate: { ir: 0, iof: 0, isento: true } }),
  ];
  const c = calcularMeta({ ...RESERVA, especificos: { ...RESERVA.especificos, despesaMensal: 5000, meses: 6 } }, { ativos, cambio: {}, hoje: HOJE, referencias: {} });
  assert.equal(c.alvoBRL, 30000);
  assert.equal(c.atualLiquidoBRL, 48800);
  const ex = c.excedente;
  assert.equal(ex.excedenteLiquido, 18800);
  assert.equal(ex.titulos[0].nome, 'LCI isenta', 'isento primeiro (imposto zero)');
  assert.equal(ex.titulos[0].total, true);
  assert.equal(ex.titulos[1].nome, 'Selic antigo', 'depois o de menor imposto');
  assert.equal(ex.liquidoLiberado, 18800);
  assert.ok(ex.reservaDepois >= c.alvoBRL - 0.01, 'a reserva líquida nunca fica abaixo da meta');
  assert.equal(ex.reservaDepois, 30000);
  assert.ok(ex.brutoResgatar > ex.liquidoLiberado, 'bruto = líquido + imposto');
  assert.ok(Math.abs(ex.brutoResgatar - ex.liquidoLiberado - ex.imposto) < 0.02);
  assert.equal(ex.titulos.find((t) => t.nome === 'CDB novo'), undefined, 'o título mais caro de resgatar nem entra');
  // sem excedente: nada
  assert.equal(calcularMeta({ ...RESERVA, especificos: { ...RESERVA.especificos, despesaMensal: 9000 } }, { ativos, cambio: {}, hoje: HOJE, referencias: {} }).excedente, null);
  // html: valores e links pro Radar / Aportes
  const html = excedenteHtml(RESERVA, c, { raizSite: 'https://exemplo.test/site/' });
  assert.match(html, /Excedente da reserva/);
  assert.match(html, /Resgatar \(bruto\)/);
  assert.match(html, /IR\/IOF estimado/);
  assert.match(html, /Líquido liberado/);
  assert.match(html, /LCI isenta/);
  assert.match(html, /href="https:\/\/exemplo\.test\/site\/distribuicoes-metas\.html"/);
  assert.match(html, /transacoes\/index\.html#aportes/);
  assert.equal(excedenteHtml({ tipo: 'acumulo' }, c), '');
});

test('excedente: sem título de renda fixa vinculado, só informa o valor (sem sugestão); IR proporcional no resgate parcial', () => {
  const calc = { alvoBRL: 1000, atualLiquidoBRL: 3000, vinculos: [{ base: 5000, valorBRL: 5000, ativos: [{ id: 'x', classe: 'acoes', valorBRL: 5000 }] }] };
  const ex = excedenteReserva(calc);
  assert.equal(ex.semTitulos, true);
  assert.equal(ex.excedenteLiquido, 2000);
  const parcial = excedenteReserva({ alvoBRL: 1000, atualLiquidoBRL: 3000, vinculos: [{ base: 4000, valorBRL: 4000, ativos: [rf('p', 'T', 4000, 400, '2030-01')] }] });
  assert.equal(parcial.titulos[0].total, false);
  assert.equal(parcial.liquidoLiberado, 2000);
  assert.equal(parcial.imposto, 222.22); // 400/3600 do líquido tirado (2000 líq. = 2222,22 bruto)
  assert.equal(parcial.brutoResgatar, 2222.22);
});

test('reserva e aposentadoria PODEM contar os mesmos ativos; "ignorar este aviso" persiste na meta', () => {
  const ativos = [rf('t', 'Selic', 8000, 100, '2030-01'), { id: 'FFFF11', ref: 'FFFF11', nome: 'FFFF11', classe: 'fiis', valorBRL: 10000 }];
  const apos = { id: 'a', tipo: 'aposentadoria', nome: 'Apos', status: 'ativa', valorAlvo: 1e6, dataAlvo: '2050-01', rendimentoAnual: 0.06, especificos: { modoAlvo: 'montante' },
    vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }, { tipo: 'classe', classe: 'fiis', modo: 'total' }] };
  const renda = { id: 'p', tipo: 'rendaPassiva', nome: 'Renda', status: 'ativa', especificos: { rendaMensal: 100, dyAnual: 0.1 }, vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'total' }] };
  const metas = [apos, renda, RESERVA];
  const aloc = alocarMetas(metas, ativos, {});
  const ctx = { ativos, cambio: {}, hoje: HOJE, referencias: {}, ocupadoPorMeta: aloc.ocupadoPorMeta };
  assert.equal(calcularMeta(RESERVA, ctx).valorVinculado, 8000);
  assert.equal(calcularMeta(apos, ctx).valorVinculado, 8000, 'a aposentadoria conta o título da reserva (os FIIs são da renda passiva)');
  assert.equal(aloc.totalAlocado, 18000, 'o título conta uma vez só no total alocado');
  // renda passiva continua exclusiva: o aviso fala dos FIIs e some quando a meta manda ignorar
  const sob = ativosSobrecomprometidos(metas, ativos);
  assert.deepEqual(sob.map((x) => x.id), ['FFFF11'], 'reserva x aposentadoria no título não é sobreposição');
  const ign = { ...apos, ignorarAvisos: ['sobreposicao'] };
  assert.equal(ignoraAvisoSobreposicao(ign), true);
  assert.equal(ativosSobrecomprometidos([ign, renda, RESERVA], ativos).length, 0);
  assert.ok(calcularMeta(apos, ctx).sobreposicao);
  assert.equal(calcularMeta(ign, ctx).sobreposicao, null);
  const h = heroiHtml(apos, calcularMeta(apos, ctx));
  assert.match(h, /data-ignorar-sobreposicao/);
  assert.match(h, /Ignorar este aviso/);
  assert.ok(!/congelado|difere/.test(h));
});

test('aposentadoria: sem avisos "congelado"/"difere da planilha"; o valor salvo na meta manda sobre a planilha', () => {
  const refs = { reserva: { custoDeVida: 4000 }, patrimonio: { extra: 1000, reinvestimento: 0.25, rendimento: 0.06, desejado: 3000000 } };
  const apos = { id: 'a', tipo: 'aposentadoria', nome: 'Apos', status: 'ativa', atualizadoEm: '2026-10-03T10:00:00Z', dataAlvo: '2050-01', rendimentoAnual: 0.06, vinculos: [],
    especificos: { modoAlvo: 'calculado', taxaRetirada: 0.065, extra: 1000, reinvestimento: 0.25, usarDespesasPlanilha: true } };
  const c = calcularMeta(apos, { ativos: [], cambio: {}, hoje: HOJE, referencias: refs });
  assert.equal(c.aposentadoria.taxa, 0.065, 'taxa do site (6,5%), não a da planilha (6%)');
  assert.deepEqual(c.avisos, []);
  assert.ok(!c.avisos.some((a) => /congelado|planilha/.test(a)));
});

test('viagem: "Custo total da viagem" = compras já feitas + já guardado + falta guardar', () => {
  const viagem = { id: 'v', tipo: 'viagemInternacional', nome: 'Europa', status: 'ativa', moeda: 'EUR', dataAlvo: '2027-05', rendimentoAnual: 0, valorInicial: 1000,
    especificos: { dataViagem: '2027-05', margem: 0, destinos: [{ id: 'd', pais: 'Itália', cidade: 'Roma', moeda: 'EUR', dias: 10, gastos: { alimentacao: 100, transporte: 0, passeios: 0, compras: 0, outros: 0 }, extras: 0 }],
      fixos: [{ id: 'f1', nome: 'Passagem', valor: 6000, moeda: 'BRL', parcelas: 6, inicio: '2026-09', parte: 1, forma: 'cartao', confirmado: false }, { id: 'f2', nome: 'Hotel', valor: 2000, moeda: 'BRL', parcelas: 1, inicio: '2026-09', parte: 1, forma: 'pago' }] } };
  const c = calcularMeta(viagem, { ativos: [], cambio: { EUR: { valor: 6, fonte: 't' } }, hoje: HOJE, referencias: {} });
  const ct = c.custoTotal;
  assert.equal(ct.comprasBRL, 8000);
  assert.equal(ct.guardadoBRL, 1000);
  assert.equal(ct.aJuntarBRL, 6000, '10 dias x 100 EUR x 6');
  assert.equal(ct.faltaBRL, 5000);
  assert.equal(ct.totalBRL, 14000, '8.000 + 1.000 + 5.000');
  const h = heroiHtml(viagem, c);
  assert.match(h, /Custo total da viagem/);
  assert.match(h, /mt-hnum principal/);
  assert.match(h, /Já guardado/);
  assert.match(h, /Falta juntar/);
  assert.match(h, /A pagar \(já comprado\)/);
  assert.match(h, /data-dica="[^"]*compras já feitas[^"]*"/i);
});

test('anel da reserva: um anel só, na cor do estado; o bruto vira texto secundário', () => {
  const ativos = [rf('t', 'Selic', 29000, 1500, '2030-01')]; // líquido 27.500 de 30.000 = 91,7% (quase lá), bruto 96,7%
  const c = calcularMeta(RESERVA, { ativos, cambio: {}, hoje: HOJE, referencias: {} });
  const h = heroiHtml(RESERVA, c);
  assert.equal((h.match(/class="mt-anel /g) || []).length, 1);
  assert.ok(!/data-anel2/.test(h), 'sem anel interno do bruto');
  assert.match(h, /class="mt-anel quase"/);
  assert.match(h, /bruto \(antes do IR\/IOF\) 97%/);
  assert.match(anelProgressoHtml(1), /mt-anel bom/);
  assert.match(anelProgressoHtml(0.4), /mt-anel neutro/);
  assert.match(anelProgressoHtml(0.4), /width:148px/, 'anel maior (o número ficou menor via CSS)');
});

test('Renda passiva: 12 meses terminando no último mês fechado; o mês de hoje conta no seu último dia (front = Apps Script)', () => {
  const casos = [['2026-10-04', '2026-09'], ['2026-10-01', '2026-09'], ['2026-10-30', '2026-09'], ['2026-10-31', '2026-10'], ['2026-02-28', '2026-02'],
    ['2028-02-28', '2028-01'], ['2028-02-29', '2028-02'], ['2026-12-31', '2026-12'], ['2027-01-01', '2026-12'], ['2026-11-30', '2026-11']];
  casos.forEach(([hoje, esperado]) => {
    assert.equal(ultimoMesFechadoMetas(hoje), esperado, hoje);
    assert.equal(ultimoMesFechado(hoje), esperado, `proventos-calc ${hoje}`);
  });
  const renda = ['2026-08', '2026-09', '2026-10'].map((mes, i) => ({ mes, valor: 100 * (i + 1) }));
  const noMeio = analisarRendaMensal(renda, null, { hoje: '2026-10-30' });
  const noUltimo = analisarRendaMensal(renda, null, { hoje: '2026-10-31' });
  assert.match(noMeio.pontos[0].texto, /últimos 2 meses/);
  assert.match(noUltimo.pontos[0].texto, /últimos 3 meses/, 'no dia 31 outubro já conta');
});

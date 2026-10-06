// tests/metas-alocacao.test.js - 05/10/2026 (auditoria A-11, A-12, A-14, A-15): alocação exclusiva por
// prioridade (cada ativo conta numa meta só), "patrimônio alocado" nunca maior que o vinculável, vínculos
// órfãos/alias de ticker, valores congelados da planilha e ritmo sem aporte. Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverVinculos, alocarMetas, ordemDeAlocacao, ativosSobrecomprometidos, vinculosOrfaos, resumoMetas, calcularMeta, metaPadrao,
} from '../assets/js/pages/metas-calc.js';
import { contextoMetas } from '../assets/js/metas-card.js';
import { avisosSobrecomprometimento } from '../assets/js/carrinho-global.js';

const ATIVOS = [
  { id: 'AAAA11', ref: 'AAAA11', nome: 'AAAA11', classe: 'fiis', valorBRL: 10000 },
  { id: 'BBBB11', ref: 'BBBB11', nome: 'BBBB11', classe: 'fiis', valorBRL: 5000 },
  { id: 'CCCC3', ref: 'CCCC3', nome: 'CCCC3', classe: 'acoes', valorBRL: 20000 },
  { id: 'rf:Selic 2029|Banco X@emergencial', ref: 'rf:Selic 2029|Banco X', nome: 'Selic 2029', classe: 'rf', marca: 'emergencial', valorBRL: 8000, irResgate: { ir: 200, iof: 0 } },
  { id: 'rf:Selic 2031|Banco X@longo-prazo', ref: 'rf:Selic 2031|Banco X', nome: 'Selic 2031', classe: 'rf', marca: 'longo-prazo', valorBRL: 12000 },
];
const TOTAL = ATIVOS.reduce((s, a) => s + a.valorBRL, 0); // 55.000

const reserva = { id: 'r', tipo: 'reservaEmergencia', nome: 'Reserva', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }], especificos: { meses: 6, margem: 0, despesaMensal: 2000, usarDespesasPlanilha: false }, status: 'ativa' };
const renda = { id: 'p', tipo: 'rendaPassiva', nome: 'Renda', vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'total' }], especificos: { rendaMensal: 500, dyAnual: 0.1 }, status: 'ativa' };
const apos = { id: 'a', tipo: 'aposentadoria', nome: 'Aposentadoria', valorAlvo: 500000, especificos: { modoAlvo: 'montante' }, dataAlvo: '2050-01', rendimentoAnual: 0.06,
  vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }, { tipo: 'marca', marca: 'longo-prazo', modo: 'total' }, { tipo: 'classe', classe: 'fiis', modo: 'total' }, { tipo: 'classe', classe: 'acoes', modo: 'total' }, { tipo: 'ativo', id: 'CCCC3', modo: 'total' }], status: 'ativa' };

test('resolverVinculos: o mesmo ativo em 2 vínculos da mesma meta conta uma vez (maior fração vence)', () => {
  const r = resolverVinculos([{ tipo: 'classe', classe: 'acoes', modo: 'total' }, { tipo: 'ativo', id: 'CCCC3', modo: 'fracao', fracao: 0.5 }], ATIVOS);
  assert.equal(r.total, 20000, 'classe (100%) vence o ativo direto (50%): 20.000, não 30.000');
  assert.equal(r.itens[0].valorBRL, 20000);
  assert.equal(r.itens[1].valorBRL, 0);
  assert.ok(r.cortadoBRL > 0);
  // fração maior no ativo direto vence a da classe
  const r2 = resolverVinculos([{ tipo: 'classe', classe: 'acoes', modo: 'fracao', fracao: 0.3 }, { tipo: 'ativo', id: 'CCCC3', modo: 'fracao', fracao: 0.8 }], ATIVOS);
  assert.equal(r2.total, 16000);
});

test('alocarMetas: reserva -> renda passiva -> aposentadoria; cada ativo conta uma vez e a soma nunca passa do patrimônio', () => {
  assert.deepEqual(ordemDeAlocacao([apos, renda, reserva]).map((m) => m.id), ['r', 'p', 'a']);
  const metas = [apos, renda, reserva];
  const aloc = alocarMetas(metas, ATIVOS, {});
  assert.equal(aloc.patrimonioVinculavel, TOTAL);
  assert.ok(aloc.totalAlocado <= TOTAL + 0.01);
  const ctx = { ativos: ATIVOS, cambio: {}, referencias: {}, hoje: '2026-10-05', ocupadoPorMeta: aloc.ocupadoPorMeta };
  const cr = calcularMeta(reserva, ctx);
  const cp = calcularMeta(renda, ctx);
  const ca = calcularMeta(apos, ctx);
  assert.equal(cr.valorVinculado, 8000, 'reserva: o título emergencial');
  assert.equal(cp.valorVinculado, 15000, 'renda passiva: os FIIs');
  assert.equal(ca.valorVinculado, 32000, 'aposentadoria: só o que sobrou (longo prazo + ações)');
  assert.ok(cr.valorVinculado + cp.valorVinculado + ca.valorVinculado <= TOTAL + 0.01);
  assert.ok(ca.avisos.some((a) => /já está em/.test(a) && /Reserva/.test(a)), 'aviso dentro da meta diz quem ficou com o dinheiro');
  // sem a alocação (antes), a aposentadoria via 100% do patrimônio
  assert.equal(calcularMeta(apos, { ...ctx, ocupadoPorMeta: {} }).valorVinculado, TOTAL);
});

test('líquido de IR/IOF segue a fração que a meta realmente conta do ativo', () => {
  const ctx = { ativos: ATIVOS, cambio: {}, referencias: {}, hoje: '2026-10-05', ocupadoPorMeta: alocarMetas([reserva, apos], ATIVOS, {}).ocupadoPorMeta };
  assert.equal(calcularMeta(reserva, ctx).liquido.ir, 200, 'reserva paga o IR do título inteiro');
  assert.equal(calcularMeta(apos, ctx).liquido.ir, 0, 'aposentadoria não conta o título da reserva, então não conta o IR dele');
});

test('resumoMetas: "patrimônio alocado" nunca maior que o patrimônio vinculável', () => {
  const metas = [reserva, renda, apos];
  const aloc = alocarMetas(metas, ATIVOS, {});
  const ctx = { ativos: ATIVOS, cambio: {}, referencias: {}, hoje: '2026-10-05', ocupadoPorMeta: aloc.ocupadoPorMeta };
  const calcs = metas.map((m) => calcularMeta({ ...m, valorAlvo: m.valorAlvo || 1e6 }, ctx));
  const res = resumoMetas(calcs, { patrimonioVinculavel: aloc.patrimonioVinculavel });
  assert.ok(res.atual <= TOTAL + 0.01, `atual ${res.atual} <= ${TOTAL}`);
  // trava final: mesmo que algo conte a mais, o teto segura (cálculos forjados)
  const forjado = [{ alvoBRL: 1e6, atualBRL: 40000, valorAtivosVinculados: 40000, aporteAtual: 0 }, { alvoBRL: 1e6, atualBRL: 40000, valorAtivosVinculados: 40000, aporteAtual: 0 }];
  assert.equal(resumoMetas(forjado, { patrimonioVinculavel: 55000 }).atual, 55000);
  assert.equal(resumoMetas(forjado).atual, 80000, 'sem o teto, a soma bruta (comportamento antigo)');
});

test('ativosSobrecomprometidos: avisa só quando o ativo é pedido por mais de uma meta', () => {
  const sobre = ativosSobrecomprometidos([renda, apos], ATIVOS);
  assert.ok(sobre.some((x) => x.id === 'AAAA11' && x.metas.includes('Renda') && x.metas.includes('Aposentadoria')));
  assert.deepEqual(ativosSobrecomprometidos([reserva, renda], ATIVOS), []);
  // dois vínculos da MESMA meta já não geram aviso (contam uma vez)
  assert.deepEqual(ativosSobrecomprometidos([{ ...apos, vinculos: [{ tipo: 'classe', classe: 'acoes', modo: 'total' }, { tipo: 'ativo', id: 'CCCC3', modo: 'total' }] }], ATIVOS), []);
});

test('A-14: vínculo a ticker antigo acha o ativo atual pelo alias; sem alias vira "órfão" com aviso (não some calado)', () => {
  const m = { id: 'x', tipo: 'acumulo', nome: 'Meta velha', valorAlvo: 50000, vinculos: [{ tipo: 'ativo', id: 'ANTG3', modo: 'total' }, { tipo: 'ativo', id: 'SUMIU4', modo: 'total' }], status: 'ativa' };
  const ativos = [{ id: 'NOVO3', ref: 'NOVO3', nome: 'NOVO3', classe: 'acoes', valorBRL: 1000 }];
  const sem = resolverVinculos(m.vinculos, ativos, {});
  assert.equal(sem.total, 0);
  const com = resolverVinculos(m.vinculos, ativos, {}, { aliases: { ANTG3: 'NOVO3' } });
  assert.equal(com.total, 1000);
  assert.equal(com.itens[0].id, 'NOVO3', 'o item já sai com o id atual (o motor do carrinho casa por ele)');
  const orfaos = vinculosOrfaos([m], ativos, {}, { ANTG3: 'NOVO3' });
  assert.deepEqual(orfaos.map((o) => o.id), ['SUMIU4']);
  const c = calcularMeta(m, { ativos, cambio: {}, hoje: '2026-10-05', aliases: { ANTG3: 'NOVO3' } });
  assert.ok(c.avisos.some((a) => /SUMIU4/.test(a) && /não está mais/.test(a)));
  assert.ok(!c.avisos.some((a) => /ANTG3/.test(a)));
  const ctx = contextoMetas({ ok: true, ativos, cambio: {}, metas: [m], aliasesTicker: { ANTG3: 'NOVO3' }, hoje: '2026-10-05' });
  assert.deepEqual(ctx.aliases, { ANTG3: 'NOVO3' });
});

test('A-12: meta nova segue a planilha (nada congelado); cópia antiga que difere da planilha avisa "congelado em dd/mm"', () => {
  const ref = { reserva: { custoDeVida: 2000, meses: 6, sobra: 0.1 }, patrimonio: { extra: 4000, reinvestimento: 0.25, rendimento: 0.05, desejado: 1000000 } };
  const nova = metaPadrao('reservaEmergencia', { referencias: ref, hoje: '2026-10-05' });
  assert.equal(nova.especificos.meses, null);
  assert.equal(nova.especificos.margem, null);
  assert.equal(metaPadrao('aposentadoria', { referencias: ref, hoje: '2026-10-05' }).especificos.taxaRetirada, null);
  const ctx = { ativos: [], cambio: {}, hoje: '2026-10-05', referencias: ref };
  const c1 = calcularMeta({ ...nova, nome: 'R' }, ctx);
  assert.equal(c1.alvoBRL, 13200);
  assert.deepEqual(c1.congelados, []);
  // a planilha muda: a meta nova acompanha sozinha
  assert.equal(calcularMeta({ ...nova, nome: 'R' }, { ...ctx, referencias: { ...ref, reserva: { ...ref.reserva, meses: 8 } } }).alvoBRL, 17600);
  // cópia antiga congelada
  const velha = { ...nova, nome: 'R', atualizadoEm: '2026-09-20T10:00:00.000Z', especificos: { ...nova.especificos, meses: 6 } };
  const c2 = calcularMeta(velha, { ...ctx, referencias: { ...ref, reserva: { ...ref.reserva, meses: 8 } } });
  assert.equal(c2.congelados.length, 1);
  assert.ok(c2.avisos.some((a) => /congelado em 20\/09/.test(a) && /6/.test(a) && /8/.test(a)));
  // aposentadoria: alvo da planilha x alvo da meta, com a taxa de retirada exposta
  const ap = metaPadrao('aposentadoria', { referencias: ref, hoje: '2026-10-05' });
  const ca = calcularMeta({ ...ap, nome: 'A', especificos: { ...ap.especificos, taxaRetirada: 0.04 } }, ctx);
  assert.equal(ca.taxaRetirada, 0.04);
  assert.ok(ca.avisos.some((a) => /difere do patrimônio desejado da planilha/.test(a)));
});

test('A-15: ritmo de aporte <= 0 tem sinal próprio (não vira "nunca" calado)', () => {
  const m = { id: 'z', tipo: 'acumulo', nome: 'Z', valorAlvo: 100000, dataAlvo: '2030-01', rendimentoAnual: 0, vinculos: [], valorInicial: 1000, status: 'ativa' };
  const ctx = { ativos: [], cambio: {}, hoje: '2026-10-05', historico: { z: { aporteMedio: 0, aporte3m: 0, mesesBase: 12 } } };
  const c = calcularMeta(m, ctx);
  assert.equal(c.ritmoSemAporte, true);
  assert.equal(c.dataEstimada, null);
  assert.equal(calcularMeta({ ...m, aporteMensal: 500 }, ctx).ritmoSemAporte, false, 'aporte informado manda');
  assert.equal(calcularMeta(m, { ...ctx, historico: { z: { aporteMedio: 300, mesesBase: 12 } } }).ritmoSemAporte, false);
});

test('carrinho: avisosSobrecomprometimento diz em que metas o ativo está e onde o aporte conta', () => {
  const metas = [reserva, renda, apos];
  const ctx = contextoMetas({ ok: true, ativos: ATIVOS, cambio: {}, metas, hoje: '2026-10-05' });
  const comCalc = metas.map((m) => ({ ...m, calc: calcularMeta(m, ctx) }));
  const carrinho = { itens: { 'fiis:AAAA11': { classe: 'fiis', ativo: 'AAAA11', moeda: 'BRL', qtd: 1, preco: 100 }, 'acoes:CCCC3': { classe: 'acoes', ativo: 'CCCC3', moeda: 'BRL', qtd: 1, preco: 10 } } };
  const av = avisosSobrecomprometimento(carrinho, comCalc);
  assert.equal(av.length, 1, 'CCCC3 só está na aposentadoria');
  assert.equal(av[0].ativo, 'AAAA11');
  assert.equal(av[0].dona, 'Renda');
  assert.deepEqual(av[0].metas.sort(), ['Aposentadoria', 'Renda']);
  assert.deepEqual(avisosSobrecomprometimento(carrinho, []), []);
});

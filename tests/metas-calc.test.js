// tests/metas-calc.test.js
//
// 02/10/2026: contas da tela Metas e Objetivos (assets/js/pages/metas-calc.js)
// - aporte necessário, prazo, câmbio, progresso com investimentos vinculados,
// reserva ideal, renda passiva, conta mensal, pagamento recorrente, projeção.
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  taxaMensal, valorFuturo, aporteNecessario, prazoParaAlvo, simular, cotacao, paraBRL, resolverVinculos,
  ativosSobrecomprometidos, reservaIdeal, parcelasPagas, calcularMeta, serieProjecao, resumoMetas, metaPadrao,
  sugestoesMetas, mesesEntre, somarMeses, rotuloMes, rotuloDuracao, aparenciaMeta,
  taxaTuristicaDestino, expandirEntradas, estimativa13, estimativaFgts, entradaPadrao, valorFuturoEntradas, trajetoriaMensal,
  acharPais, acharPaisPelaCidade, cidadesDoPais, caminhoBandeira, normalizarUrl, ehLinkWanderlog, sugestaoTaxaTuristica, migrarMetaViagem,
} from '../assets/js/pages/metas-calc.js';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const perto = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const ATIVOS = [
  { id: 'AAAA11', ref: 'AAAA11', nome: 'AAAA11', classe: 'fiis', valorBRL: 10000 },
  { id: 'BBBB11', ref: 'BBBB11', nome: 'BBBB11', classe: 'fiis', valorBRL: 5000 },
  { id: 'CCCC3', ref: 'CCCC3', nome: 'CCCC3', classe: 'acoes', valorBRL: 3000 },
  { id: 'rf:Tesouro X|Banco Y@emergencial', ref: 'rf:Tesouro X|Banco Y', nome: 'Tesouro X', classe: 'rf', marca: 'emergencial', valorBRL: 8000 },
  { id: 'rf:CDB Z|Banco Y@longo-prazo', ref: 'rf:CDB Z|Banco Y', nome: 'CDB Z', classe: 'rf', marca: 'longo-prazo', valorBRL: 20000 },
];
const CAMBIO = { EUR: { valor: 6, fonte: 'teste' }, USD: 5 };
const CTX = {
  ativos: ATIVOS, cambio: CAMBIO, hoje: '2026-10-02',
  referencias: { reserva: { custoDeVida: 2000, meses: 6, sobra: 0.1 }, rendaPassiva: { media12m: 300, metaPlanilha: 1000 }, patrimonio: { rendimento: 0.08 } },
  proventos12m: { porTicker: { AAAA11: 1200, BBBB11: 600, CCCC3: 240 } },
};

test('datas: meses entre, somar meses, rótulos', () => {
  assert.equal(mesesEntre('2026-10', '2027-07'), 9);
  assert.equal(mesesEntre('2026-10-02', '2026-10'), 0);
  assert.equal(mesesEntre('2026-10', '2026-08'), -2);
  assert.equal(somarMeses('2026-11', 3), '2027-02');
  assert.equal(rotuloMes('2027-03'), 'mar/2027');
  assert.equal(rotuloDuracao(27), '2 anos e 3 meses');
  assert.equal(rotuloDuracao(1), '1 mês');
  assert.equal(rotuloDuracao(0), 'agora');
});

test('aporte necessário: sem rendimento é a divisão simples; com rendimento fecha no alvo exato', () => {
  assert.equal(aporteNecessario({ alvo: 12000, atual: 0, meses: 12, taxa: 0 }), 1000);
  assert.equal(aporteNecessario({ alvo: 12000, atual: 12000, meses: 12, taxa: 0 }), 0, 'já alcançou');
  assert.equal(aporteNecessario({ alvo: 12000, atual: 2000, meses: 0 }), 10000, 'prazo vencido: falta tudo agora');
  assert.equal(aporteNecessario({ alvo: 12000, atual: 0, meses: null }), null, 'sem data');
  const i = taxaMensal(0.1);
  assert.ok(perto(Math.pow(1 + i, 12), 1.1, 1e-9), 'taxa mensal equivalente');
  const pmt = aporteNecessario({ alvo: 30000, atual: 5000, meses: 24, taxa: i });
  assert.ok(perto(valorFuturo({ atual: 5000, aporte: pmt, meses: 24, taxa: i }), 30000, 0.001), 'o aporte fecha no alvo');
  assert.ok(pmt < (30000 - 5000) / 24, 'rendimento reduz o aporte');
  assert.equal(aporteNecessario({ alvo: 1000, atual: 990, meses: 24, taxa: taxaMensal(0.1) }), 0, 'só o rendimento já chega');
});

test('prazo: inverso do aporte necessário; nunca chega = Infinity', () => {
  const i = taxaMensal(0.12);
  const pmt = aporteNecessario({ alvo: 50000, atual: 1000, meses: 36, taxa: i });
  assert.ok(perto(prazoParaAlvo({ alvo: 50000, atual: 1000, aporte: pmt, taxa: i }), 36, 1e-6));
  assert.equal(prazoParaAlvo({ alvo: 1200, atual: 0, aporte: 100, taxa: 0 }), 12);
  assert.equal(prazoParaAlvo({ alvo: 1200, atual: 0, aporte: 0, taxa: 0 }), Infinity);
  assert.equal(prazoParaAlvo({ alvo: 1200, atual: 1500, aporte: 0, taxa: 0 }), 0);
});

test('simulador: "5.000 euros até o mês X com rendimento Y%, aporte Z" e o inverso', () => {
  const alvo = paraBRL(5000, 'EUR', CAMBIO);
  assert.equal(alvo, 30000);
  const ida = simular({ alvo, atual: 0, rendimentoAnual: 0.1, meses: 10 });
  assert.ok(ida.aporte > 2800 && ida.aporte < 3000);
  assert.ok(perto(ida.totalAportado + ida.rendimento, 30000, 0.01));
  const volta = simular({ alvo, atual: 0, rendimentoAnual: 0.1, aporte: ida.aporte });
  assert.ok(perto(volta.mesesAteAlvo, 10, 1e-6));
});

test('câmbio: aceita número ou {valor}; BRL = 1; sem cotação = null', () => {
  assert.equal(cotacao('BRL', {}), 1);
  assert.equal(cotacao('EUR', CAMBIO), 6);
  assert.equal(cotacao('USD', CAMBIO), 5);
  assert.equal(cotacao('GBP', CAMBIO), null);
  assert.equal(paraBRL(10, 'USD', CAMBIO), 50);
  assert.equal(paraBRL(10, 'GBP', CAMBIO), null);
});

test('vínculos: ativo (total, fração, valor fixo limitado), classe inteira e marca da Renda Fixa', () => {
  const r = resolverVinculos([
    { tipo: 'ativo', id: 'AAAA11', modo: 'fracao', fracao: 0.25 },
    { tipo: 'ativo', id: 'CCCC3', modo: 'valor', valor: 99999 },
    { tipo: 'marca', marca: 'emergencial', modo: 'total' },
    { tipo: 'ativo', id: 'SUMIU11', modo: 'total' },
  ], ATIVOS);
  assert.deepEqual(r.itens.map((v) => v.valorBRL), [2500, 3000, 8000, 0]);
  assert.equal(r.total, 13500);
  assert.equal(r.itens[3].encontrado, false);
  assert.equal(resolverVinculos([{ tipo: 'classe', classe: 'fiis', modo: 'total' }], ATIVOS).total, 15000);
  assert.equal(resolverVinculos([{ tipo: 'classe', classe: 'rf', modo: 'fracao', fracao: 0.5 }], ATIVOS).total, 14000);
});

test('sobrecomprometido: o mesmo ativo em 2 metas passando de 100%', () => {
  const metas = [
    { nome: 'A', vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'total' }] },
    { nome: 'B', vinculos: [{ tipo: 'ativo', id: 'AAAA11', modo: 'fracao', fracao: 0.5 }] },
    { nome: 'C', vinculos: [{ tipo: 'ativo', id: 'CCCC3', modo: 'fracao', fracao: 0.5 }, { tipo: 'ativo', id: 'CDB Z', modo: 'total' }] },
    { nome: 'D', status: 'arquivada', vinculos: [{ tipo: 'ativo', id: 'CCCC3', modo: 'total' }] },
  ];
  const s = ativosSobrecomprometidos(metas, ATIVOS);
  assert.deepEqual(s.map((x) => [x.id, x.comprometido, x.metas]), [['AAAA11', 15000, ['A', 'B']]]);
});

test('reserva ideal = meses x despesa x (1 + sobra); meta de reserva usa o custo de vida das Despesas', () => {
  assert.equal(reservaIdeal({ despesaMensal: 2000, meses: 6, margem: 0.1 }), 13200);
  assert.equal(reservaIdeal({ despesaMensal: 0, meses: 6 }), null);
  const meta = metaPadrao('reservaEmergencia', { referencias: CTX.referencias, hoje: CTX.hoje });
  let c = calcularMeta({ ...meta, nome: 'Reserva' }, CTX);
  assert.equal(c.alvoBRL, 13200);
  assert.equal(c.atualBRL, 8000, 'títulos marcados Renda Emergencial');
  assert.equal(c.falta, 5200);
  assert.equal(c.status, 'abaixo');
  assert.equal(c.dataAlvo, null, 'reserva não tem data');
  c = calcularMeta({ ...meta, especificos: { ...meta.especificos, usarDespesasPlanilha: false, despesaMensal: 1000, meses: 4, margem: 0 } }, CTX);
  assert.equal(c.alvoBRL, 4000);
  assert.equal(c.status, 'saldo-ideal');
});

test('acúmulo em euro com sub-itens, item pago, guardado fora e vínculo: alvo, falta, aporte, status', () => {
  // 04/10/2026: era uma viagem - na viagem a conta mensal virou "a pagar" (fora do aporte, ver o teste
  // da viagem em 2 partes); a regra antiga (conta mensal soma no aporte) continua valendo pros outros tipos
  const meta = {
    id: 'm1', tipo: 'acumulo', nome: 'Viagem', moeda: 'EUR', dataAlvo: '2027-07', valorInicial: 1000, aporteMensal: 500, rendimentoAnual: 0,
    itens: [{ nome: 'Comida', valor: 1000, moeda: 'EUR' }, { nome: 'Compras', valor: 500, moeda: 'EUR' }, { nome: 'Seguro', valor: 300, moeda: 'BRL', concluido: true }],
    vinculos: [{ tipo: 'ativo', id: 'BBBB11', modo: 'valor', valor: 2000 }],
    contaMensal: { descricao: 'Passagens', valor: 400, meses: 5, inicio: '2026-08' },
  };
  const c = calcularMeta(meta, CTX);
  assert.equal(c.alvoBRL, 9300, '1.500 € x 6 + R$ 300');
  assert.equal(c.alvoMoeda, 1550);
  assert.equal(c.atualBRL, 3300, 'vínculo 2.000 + guardado 1.000 + item pago 300');
  assert.equal(c.falta, 6000);
  assert.equal(c.faltaMoeda, 1000);
  assert.equal(c.mesesRestantes, 9);
  assert.ok(perto(c.aporteNecessario, 6000 / 9));
  assert.deepEqual([c.conta.pagas, c.conta.valorTotal, c.conta.valorPago], [3, 2000, 1200], 'ago, set, out pagas');
  assert.ok(perto(c.aporteNecessarioTotal, 6000 / 9 + 400), 'soma a conta mensal enquanto ela corre');
  assert.equal(c.status, 'atrasada');
  assert.equal(calcularMeta({ ...meta, aporteMensal: 700 }, CTX).status, 'no-ritmo');
  assert.ok(perto(c.percentual, (3300 + 1200) / (9300 + 2000)));
});

test('sem câmbio da moeda: avisa e não inventa número', () => {
  const c = calcularMeta({ tipo: 'acumulo', nome: 'x', moeda: 'GBP', valorAlvo: 1000, dataAlvo: '2027-01' }, CTX);
  assert.equal(c.alvoBRL, null);
  assert.match(c.avisos.join(' '), /GBP/);
});

test('casa (entrada + custos), carro à vista, aposentadoria pela regra dos 4%', () => {
  const casa = calcularMeta({ tipo: 'casa', nome: 'Casa', dataAlvo: '2031-10', especificos: { valorImovel: 500000, entradaPct: 0.2, custosPct: 0.05 } }, CTX);
  assert.equal(casa.alvoBRL, 125000);
  assert.equal(casa.mesesRestantes, 60);
  const carro = calcularMeta({ tipo: 'carro', nome: 'Carro', dataAlvo: '2027-10', especificos: { valorCarro: 80000, entradaPct: 1 }, vinculos: [{ tipo: 'ativo', id: 'rf:CDB Z|Banco Y@longo-prazo', modo: 'total' }] }, CTX);
  assert.equal(carro.alvoBRL, 80000);
  assert.equal(carro.atualBRL, 20000);
  const apos = calcularMeta({ tipo: 'aposentadoria', nome: 'Apos', dataAlvo: '2050-01', especificos: { rendaDesejada: 10000, taxaRetirada: 0.04 } }, CTX);
  assert.equal(apos.alvoBRL, 3000000);
});

test('renda passiva: renda dos vinculados (proventos 12m / 12, na fração do vínculo) e patrimônio necessário pelo DY', () => {
  const meta = { tipo: 'rendaPassiva', nome: 'Renda', dataAlvo: '2036-10', aporteMensal: 1000, rendimentoAnual: 0.1, especificos: { rendaMensal: 1000, dyAnual: 0.1 },
    vinculos: [{ tipo: 'classe', classe: 'fiis', modo: 'total' }, { tipo: 'ativo', id: 'CCCC3', modo: 'fracao', fracao: 0.5 }] };
  const c = calcularMeta(meta, CTX);
  assert.ok(perto(c.renda.atual, (1200 + 600 + 120) / 12), 'FIIs inteiros + metade dos proventos de CCCC3');
  assert.equal(c.alvoBRL, 120000, 'R$ 1.000 x 12 / 10%');
  assert.equal(c.atualBRL, 16500);
  assert.ok(perto(c.percentual, 160 / 1000));
  const semVinculo = calcularMeta({ ...meta, vinculos: [] }, CTX);
  assert.equal(semVinculo.renda.atual, 300, 'sem vínculos: média da carteira toda (a da Distribuição e Metas)');
  assert.equal(semVinculo.renda.origem, 'carteira');
});

test('pagamento recorrente: parcelas pagas pelos meses desde a 1ª (ou informadas)', () => {
  assert.equal(parcelasPagas({ totalParcelas: 12, inicio: '2026-08' }, '2026-10-02'), 3);
  assert.equal(parcelasPagas({ totalParcelas: 2, inicio: '2026-01' }, '2026-10-02'), 2);
  assert.equal(parcelasPagas({ totalParcelas: 12, parcelasPagas: 5, inicio: '2026-08' }, '2026-10-02'), 5);
  const c = calcularMeta({ tipo: 'acumulo', categoria: 'assinaturas', nome: 'Licença', contribuicao: 'recorrente', recorrente: { parcela: 100, totalParcelas: 12, inicio: '2026-08' } }, CTX);
  assert.deepEqual([c.alvoBRL, c.atualBRL, c.aporteNecessario, c.recorrente.fim, c.dataAlvo, c.status], [1200, 300, 100, '2027-07', '2027-07', 'no-ritmo']);
});

test('projeção: começa no "já tenho", a curva necessária termina no alvo, a do ritmo segue o aporte atual', () => {
  const c = calcularMeta({ tipo: 'acumulo', nome: 'x', valorAlvo: 12000, dataAlvo: '2027-10', valorInicial: 0, aporteMensal: 500, rendimentoAnual: 0 }, CTX);
  const s = serieProjecao(c, { hoje: CTX.hoje });
  assert.equal(s.length, 13);
  assert.equal(s[0].mes, '2026-10');
  assert.equal(s[12].necessaria, 12000);
  assert.equal(s[12].ritmo, 6000);
  assert.equal(c.dataEstimada, '2028-10', 'no ritmo de R$ 500 leva 24 meses');
  const r = resumoMetas([c, calcularMeta({ tipo: 'acumulo', nome: 'y', valorAlvo: 100, valorInicial: 100 }, CTX)]);
  assert.deepEqual([r.quantidade, r.alvo, r.atual, r.noRitmo, r.atrasadas], [2, 12100, 100, 1, 1]);
});

test('padrões e sugestões usam a planilha (meses da reserva, meta de renda passiva) e não repetem tipo que já existe', () => {
  const rp = metaPadrao('rendaPassiva', { referencias: CTX.referencias, hoje: CTX.hoje });
  assert.equal(rp.especificos.rendaMensal, 1000);
  assert.equal(rp.especificos.dyAnual, 0.08);
  assert.equal(metaPadrao('viagemInternacional', { hoje: CTX.hoje }).moeda, 'EUR');
  const sug = sugestoesMetas({ referencias: CTX.referencias, hoje: CTX.hoje, existentes: [{ tipo: 'rendaPassiva' }] });
  assert.ok(sug.some((s) => s.meta.tipo === 'reservaEmergencia'));
  assert.ok(!sug.some((s) => s.meta.tipo === 'rendaPassiva'));
  assert.equal(aparenciaMeta({ tipo: 'acumulo', categoria: 'pets' }).rotulo, 'Pets');
});

// ---------------------------------------------------------------------------
// 03/10/2026: Metas v2 (dados inventados)
// ---------------------------------------------------------------------------
import {
  contaAposentadoria, calcularViagem, velocidadeMeta, dicasAcelerar, marcosProjecao, cenariosRendaMenor, avaliarVinculos,
  analisarHistoricoMeta, analisarProjecaoMeta, analisarRendaMensal, explicarStatus, STATUS_META, EXPLICACOES,
  chaveSugestaoInvestimento, SUGESTOES_INVESTIMENTO, metaDaPlanilha,
} from '../assets/js/pages/metas-calc.js';

const ATIVOS_IR = [
  { id: 'rf:Tesouro Selic 2030|Banco Y@emergencial', ref: 'rf:Tesouro Selic 2030|Banco Y', nome: 'Tesouro Selic 2030', classe: 'rf', marca: 'emergencial', indexador: 'SELIC', vencimento: '03/2030', valorBRL: 10000, irResgate: { ir: 150, iof: 0 } },
  { id: 'rf:CDB K|Banco Y@emergencial', ref: 'rf:CDB K|Banco Y', nome: 'CDB K', classe: 'rf', marca: 'emergencial', indexador: 'CDI', valorBRL: 3500, irResgate: { ir: 40, iof: 10 } },
];

test('reserva: status pelo LÍQUIDO (IR/IOF se resgatasse hoje); ideal só no bruto; atualLiquidoBRL e faltaLiquida', () => {
  const base = { id: 'r1', tipo: 'reservaEmergencia', nome: 'R', especificos: { meses: 6, margem: 0, usarDespesasPlanilha: false, despesaMensal: 2200 }, vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }] };
  const ctx = { ...CTX, ativos: ATIVOS_IR };
  let c = calcularMeta(base, ctx); // alvo 13.200; bruto 13.500; líquido 13.300
  assert.deepEqual([c.alvoBRL, c.atualBRL, c.atualLiquidoBRL, c.liquido.impostoBRL, c.liquido.ir, c.liquido.iof], [13200, 13500, 13300, 200, 190, 10]);
  assert.equal(c.status, 'saldo-ideal');
  assert.equal(c.faltaLiquida, 0);
  c = calcularMeta({ ...base, especificos: { ...base.especificos, despesaMensal: 2240 } }, ctx); // alvo 13.440: bruto passa, líquido não
  assert.equal(c.status, 'ideal-bruto');
  assert.equal(c.faltaLiquida, 140);
  assert.equal(c.falta, 140, 'a falta da reserva é pelo líquido');
  assert.ok(perto(c.percentual, 13300 / 13440), 'progresso pelo líquido');
  assert.ok(perto(c.percentualBruto, 1));
  c = calcularMeta({ ...base, especificos: { ...base.especificos, despesaMensal: 3000 } }, ctx);
  assert.equal(c.status, 'abaixo');
  assert.equal(c.faltaLiquida, 18000 - 13300);
  assert.ok(STATUS_META['ideal-bruto'].explicacao.length > 20);
});

test('saldo em conta: moeda x câmbio do dia entra no "já tenho"; sem câmbio avisa', () => {
  const meta = { id: 'v', tipo: 'acumulo', nome: 'x', valorAlvo: 10000, dataAlvo: '2027-10', vinculos: [{ tipo: 'saldo', id: 's1', instituicao: 'Conta X', moeda: 'EUR', saldo: 500 }, { tipo: 'saldo', id: 's2', instituicao: 'Conta Z', moeda: 'GBP', saldo: 10 }] };
  const c = calcularMeta(meta, CTX);
  assert.equal(c.atualBRL, 3000, '€ 500 x 6; GBP sem câmbio não soma');
  assert.match(c.avisos.join(' '), /GBP/);
  assert.equal(c.vinculos[0].valorBRL, 3000);
  assert.equal(c.atualLiquidoBRL, 3000, 'saldo em conta não paga IR');
});

test('aporte real do histórico (ctx.historico) vale quando não há aporte informado; informado tem prioridade', () => {
  const meta = { id: 'a1', tipo: 'acumulo', nome: 'x', valorAlvo: 12000, dataAlvo: '2027-10', rendimentoAnual: 0 };
  const ctx = { ...CTX, historico: { a1: { aporteMedio: 1000, aporte3m: 1200, mesesBase: 12 } } };
  let c = calcularMeta(meta, ctx);
  assert.deepEqual([c.aporteAtual, c.aporteOrigem, c.aporteReal, c.status, c.dataEstimada], [1000, 'historico', 1000, 'no-ritmo', '2027-10']);
  c = calcularMeta({ ...meta, aporteMensal: 500 }, ctx);
  assert.deepEqual([c.aporteAtual, c.aporteOrigem, c.status], [500, 'informado', 'atrasada']);
  c = calcularMeta(meta, { ...CTX, historico: { a1: { aporteMedio: -300 } } });
  assert.deepEqual([c.aporteAtual, c.aporteOrigem, c.aporteReal], [0, 'historico', -300], 'resgate líquido: aporte 0, mas o real fica visível');
});

test('aposentadoria: conta da planilha (despesas + extra + % reinvestimento = renda ideal; montante = renda x 12 / taxa), editável', () => {
  const ref = { reserva: { custoDeVida: 5000 }, patrimonio: { extra: 1000, reinvestimento: 0.2, rendimento: 0.06, desejado: 1440000 } };
  const meta = { id: 'p', tipo: 'aposentadoria', nome: 'A', dataAlvo: '2050-12', rendimentoAnual: 0.06, especificos: { modoAlvo: 'calculado', usarDespesasPlanilha: true } };
  const ct = contaAposentadoria(meta, ref);
  assert.deepEqual([ct.despesa, ct.extra, ct.base, ct.reinvestimento, ct.renda, ct.montante], [5000, 1000, 6000, 1200, 7200, 1440000]);
  const c = calcularMeta(meta, { ...CTX, referencias: ref });
  assert.equal(c.alvoBRL, 1440000);
  assert.deepEqual(c.partes.map((p) => p.chave), ['despesa', 'extra', 'base', 'reinvestimento', 'renda', 'taxa']);
  // tudo editável: extra, %, taxa, despesa própria
  const ed = contaAposentadoria({ ...meta, especificos: { modoAlvo: 'calculado', usarDespesasPlanilha: false, despesaMensal: 4000, extra: 2000, reinvestimento: 0.25, taxaRetirada: 0.05 } }, ref);
  assert.deepEqual([ed.base, ed.renda, ed.montante], [6000, 7500, 1800000]);
  // sem casas no meio do caminho (a planilha não arredonda)
  assert.equal(contaAposentadoria({ especificos: { modoAlvo: 'calculado', extra: 1000.004, reinvestimento: 0.25, taxaRetirada: 0.06 } }, { reserva: { custoDeVida: 3000.003 } }).montante, 1000001.75);
  // meta antiga com o alvo = patrimônio desejado da planilha vira "calculado"; outro valor = montante digitado
  assert.equal(contaAposentadoria({ valorAlvo: 1440000, especificos: {} }, ref).modo, 'calculado');
  assert.equal(contaAposentadoria({ valorAlvo: 999, especificos: {} }, ref).modo, 'montante');
  const nova = metaDaPlanilha('aposentadoria', { referencias: ref, hoje: '2026-10-02' });
  assert.equal(calcularMeta(nova, { ...CTX, referencias: ref }).alvoBRL, 1440000, 'a sugestão chega no mesmo montante da planilha, pela conta');
  assert.ok(nova.dataAlvo, 'tem prazo (editável)');
});

test('marcos de milhão até o alvo (ano e idade) e "se a renda fosse 10%/20% menor"', () => {
  const meta = { id: 'p', tipo: 'aposentadoria', nome: 'A', dataAlvo: '2050-12', rendimentoAnual: 0, aporteMensal: 10000, especificos: { modoAlvo: 'montante' }, valorAlvo: 3500000 };
  const c = calcularMeta(meta, { ...CTX, ativos: [], referencias: {} });
  const m = marcosProjecao(c, { hoje: '2026-10-02', anoNascimento: 1990 });
  assert.deepEqual(m.map((x) => x.rotulo), ['1º milhão', '2º milhão', '3º milhão', 'Alvo']);
  assert.deepEqual(m.map((x) => x.meses), [100, 200, 300, 350], 'R$ 10 mil/mês sem rendimento');
  assert.equal(m[0].mes, '2035-02');
  assert.equal(m[0].idade, 2035 - 1990);
  const peq = marcosProjecao(calcularMeta({ ...meta, valorAlvo: 100000 }, { ...CTX, ativos: [] }), { hoje: '2026-10-02' });
  assert.deepEqual(peq.map((x) => x.rotulo), ['25% do alvo', '50% do alvo', '75% do alvo', 'Alvo'], 'alvo pequeno: quartos');
  const cen = cenariosRendaMenor(c, { hoje: '2026-10-02' });
  assert.deepEqual(cen.map((x) => [x.reducao, x.montante, x.economia]), [[0.1, 3150000, 350000], [0.2, 2800000, 700000]]);
  assert.equal(cen[0].mesesAMenos, 35);
});

test('velocidade: no ritmo, 75% e 50% do tempo com o aporte que fecha em cada prazo; dicas com números', () => {
  const meta = { id: 'q', tipo: 'acumulo', nome: 'x', valorAlvo: 24000, aporteMensal: 1000, rendimentoAnual: 0 };
  const c = calcularMeta(meta, CTX);
  const v = velocidadeMeta(c, { hoje: '2026-10-02' });
  assert.equal(v.origem, 'ritmo');
  assert.deepEqual(v.cenarios.map((x) => [x.fracao, x.meses, x.aporte]), [[1, 24, 1000], [0.75, 18, 1333.33], [0.5, 12, 2000]]);
  assert.equal(v.cenarios[2].data, '2027-10');
  assert.equal(v.cenarios[2].aMais, 1000);
  const dicas = dicasAcelerar(c, meta, { hoje: '2026-10-02' });
  assert.ok(dicas.some((d) => d.id === 'aporte' && /R\$\s100 a mais/.test(d.texto) && d.mesesAMenos === 2), 'R$ 100 a mais: 22 em vez de 24 meses');
  assert.ok(dicas.some((d) => d.id === 'unico' && d.mesesAMenos === 1));
  // sem ritmo: a base é o prazo
  const semRitmo = calcularMeta({ ...meta, aporteMensal: 0, dataAlvo: '2028-10' }, CTX);
  assert.equal(velocidadeMeta(semRitmo, { hoje: '2026-10-02' }).origem, 'prazo');
  assert.equal(velocidadeMeta(calcularMeta({ ...meta, valorInicial: 30000 }, CTX)).chegou, true);
});

test('viagem por destinos: dias x gasto diário por moeda + margem, saldo na moeda abate, itens fixos parcelados com a sua parte', () => {
  const meta = {
    id: 'vg', tipo: 'viagemInternacional', nome: 'V', moeda: 'EUR', dataAlvo: '2027-06', rendimentoAnual: 0,
    especificos: {
      margem: 0.1,
      destinos: [
        { id: 'a', cidade: 'Cidade A', pais: 'País A', moeda: 'EUR', dias: 4, gastos: { alimentacao: 50, transporte: 10, passeios: 20, compras: 20 }, extras: 100 },
        { id: 'b', cidade: 'Cidade B', pais: 'País B', moeda: 'EUR', dias: 2, gastos: { alimentacao: 50 } },
        { id: 'c', cidade: 'Cidade C', pais: 'País C', moeda: 'USD', dias: 3, gastos: { alimentacao: 100 } },
      ],
      fixos: [
        { id: 'f1', nome: 'Passagem', valor: 4000, moeda: 'BRL', parcelas: 10, inicio: '2026-08', parte: 1 },
        { id: 'f2', nome: 'Hotel', valor: 3000, moeda: 'BRL', parcelas: 6, inicio: '2026-10', parte: 0.5 },
        { id: 'f3', nome: 'Ingresso', valor: 20, moeda: 'EUR', parcelas: 1, pago: true },
      ],
    },
    vinculos: [{ tipo: 'saldo', id: 'w', instituicao: 'Conta X', moeda: 'EUR', saldo: 200 }],
  };
  const v = calcularViagem(meta, { cambio: CAMBIO, hoje: '2026-10-02' });
  assert.deepEqual(v.destinos.map((d) => [d.diaria, d.totalMoeda]), [[100, 500], [50, 100], [100, 300]]);
  assert.deepEqual([v.porMoeda.EUR.total, v.porMoeda.EUR.comMargem, v.porMoeda.EUR.guardado, v.porMoeda.EUR.falta, v.porMoeda.EUR.faltaBRL], [600, 660, 200, 460, 2760]);
  assert.deepEqual([v.porMoeda.USD.comMargem, v.porMoeda.USD.comMargemBRL], [330, 1650]);
  assert.equal(v.gastoBRL, 660 * 6 + 1650);
  // 04/10/2026: o que está no cartão conta como PAGO de antemão - parcela "confirmada" quando o mês da fatura passa
  assert.deepEqual(v.fixos.map((f) => [f.forma, f.totalBRL, f.pagas, f.pendenteBRL, f.status]), [['cartao', 4000, 2, 3200, 'pendente'], ['cartao', 1500, 0, 1500, 'pendente'], ['pago', 120, 1, 0, 'confirmado']]);
  assert.equal(v.parcelaMensal, 400 + 250, 'fatura de out: passagem + hotel');
  assert.deepEqual([v.aPagar.totalBRL, v.aPagar.pendenteBRL, v.aPagar.mesAtualBRL], [5620, 4700, 650]);
  const c = calcularMeta(meta, CTX);
  assert.equal(c.alvoBRL, 5610, 'só o a juntar');
  assert.equal(c.atualBRL, 1200, '€ 200 no saldo');
  assert.equal(c.total, 5610, 'o já comprado não entra no total a juntar');
  assert.equal(c.ja, 1200);
  assert.ok(perto(c.aporteNecessarioTotal, (5610 - 1200) / 8), 'aporte só do a juntar (as parcelas são pagas à parte)');
  assert.equal(c.parcelasCorrendo, 650);
});

test('avaliação dos vínculos (liquidez x prazo, risco x horizonte, moeda) e a sugestão certa por tipo', () => {
  const ativos = [
    ...ATIVOS_IR,
    { id: 'rf:Tesouro IPCA+ 2045|B@longo-prazo', nome: 'Tesouro IPCA+ 2045', classe: 'rf', marca: 'longo-prazo', indexador: 'IPCA', vencimento: '05/2045', valorBRL: 1000 },
    { id: 'FFFF11', ref: 'FFFF11', nome: 'FFFF11', classe: 'fiis', valorBRL: 2000 },
  ];
  const reserva = { id: 'r', tipo: 'reservaEmergencia', nome: 'R', especificos: { meses: 6 }, vinculos: [{ tipo: 'ativo', id: ativos[0].id }, { tipo: 'ativo', id: ativos[2].id }, { tipo: 'ativo', id: 'FFFF11' }] };
  const av = avaliarVinculos(reserva, calcularMeta(reserva, { ...CTX, ativos }));
  const por = Object.fromEntries(av.itens.map((x) => [x.nome, x.veredito]));
  assert.deepEqual(por, { 'Tesouro Selic 2030': 'bom', 'Tesouro IPCA+ 2045': 'ruim', FFFF11: 'ruim' });
  assert.equal(av.resumo.ruim, 2);
  const apos = { id: 'a', tipo: 'aposentadoria', nome: 'A', dataAlvo: '2050-01', especificos: { modoAlvo: 'montante' }, valorAlvo: 1e6, vinculos: [{ tipo: 'ativo', id: ativos[2].id }, { tipo: 'ativo', id: 'FFFF11' }] };
  assert.ok(avaliarVinculos(apos, calcularMeta(apos, { ...CTX, ativos })).itens.every((x) => x.veredito === 'bom'));
  const viagem = { id: 'v', tipo: 'viagemInternacional', nome: 'V', moeda: 'EUR', valorAlvo: 1000, dataAlvo: '2027-06', vinculos: [{ tipo: 'saldo', id: 's', instituicao: 'Conta X', moeda: 'EUR', saldo: 100 }, { tipo: 'saldo', id: 't', instituicao: 'Conta Y', moeda: 'USD', saldo: 100 }] };
  const avV = avaliarVinculos(viagem, calcularMeta(viagem, CTX));
  assert.deepEqual(avV.itens.map((x) => x.veredito).sort(), ['atencao', 'bom']);
  assert.equal(chaveSugestaoInvestimento(reserva, null), 'reserva');
  assert.equal(chaveSugestaoInvestimento(viagem, calcularMeta(viagem, CTX)), 'viagemExterior');
  assert.ok(Object.values(SUGESTOES_INVESTIMENTO).every((s) => s.fontes.length >= 2 && s.fontes.every((f) => /^https:\/\//.test(f.url))), 'toda sugestão cita fontes');
});

test('análises: histórico (aportes x rendimento x CDI), projeção (ritmo x prazo) e renda mensal; explicações', () => {
  const meses = [{ mes: '2026-06', valor: 1000, fluxo: 0 }, { mes: '2026-07', valor: 1600, fluxo: 500 }, { mes: '2026-08', valor: 2210, fluxo: 500 }, { mes: '2026-09', valor: 2800, fluxo: 500 }];
  const a = analisarHistoricoMeta({ meses, indices: [{ mes: '2026-06', cdi: 100 }, { mes: '2026-09', cdi: 103 }] });
  assert.match(a.pontos[0].texto, /R\$\s1\.500 vieram de aportes/);
  assert.ok(a.pontos.some((p) => p.tipo === 'rendimento' && /CDI/.test(p.texto)));
  assert.ok(a.resumo.length > 5);
  const c = calcularMeta({ id: 'x', tipo: 'acumulo', nome: 'x', valorAlvo: 12000, dataAlvo: '2027-10', aporteMensal: 500, rendimentoAnual: 0 }, CTX);
  const p = analisarProjecaoMeta(c, { pontos: [{ mes: '2026-10', ritmo: 0 }, { mes: '2026-11', ritmo: 500 }], hoje: '2026-10-02' });
  assert.ok(p.pontos.some((x) => x.tipo === 'ritmo' && /depois do prazo/.test(x.texto)));
  assert.equal(p.tom, 'atencao');
  const renda = Array.from({ length: 26 }, (_, i) => ({ mes: `20${24 + Math.floor((i + 8) / 12)}-${String(((i + 8) % 12) + 1).padStart(2, '0')}`, valor: 100 + i * 5 }));
  const r = analisarRendaMensal(renda, { renda: { alvo: 500 } }, { hoje: '2026-10-02' });
  assert.ok(r.pontos.some((x) => x.tipo === 'crescimento' && x.tom === 'bom'));
  assert.match(explicarStatus('atrasada', { tipo: 'rendaPassiva' }), /patrimônio que gera a renda/);
  assert.ok(EXPLICACOES.liquido && EXPLICACOES.aporteReal);
});

// ---------------------------------------------------------------------------
// 04/10/2026: Metas › Viagem v3 (dados inventados) - entradas programadas,
// a pagar x a juntar, taxa turística, países/migração, Wanderlog
// ---------------------------------------------------------------------------
const lerJson = (nome) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../assets/data/${nome}`, import.meta.url)), 'utf8'));
const PAISES = lerJson('paises.json').paises;
const CIDADES = lerJson('cidades.json').cidades;
const TAXAS = lerJson('taxas-turisticas.json');
const REF_SAL = { salario: { liquido: 6000, holerite: { salarioBase: 8000, totalVencimentos: 8000, inss: 900, irrf: 700, liquido: 6400 }, extras: [] } };
const HOJE = '2026-10-04';

test('13º: 1ª parcela (nov) = metade do bruto sem descontos; 2ª (dez) = metade - INSS - IR; só entra o que cai ANTES da data', () => {
  const est = estimativa13(REF_SAL, 2026);
  assert.deepEqual([est.p1.mes, est.p1.valor, est.p2.mes, est.p2.valor], ['2026-11', 4000, '2026-12', 2400]);
  const meta = { entradas: [entradaPadrao('decimo13')] }; // 90%
  const ate = (d) => expandirEntradas(meta, { referencias: REF_SAL, hoje: HOJE, ate: d }).map((e) => [e.mes, e.valor]);
  assert.deepEqual(ate('2027-06'), [['2026-11', 3600], ['2026-12', 2160]]);
  assert.deepEqual(ate('2026-12'), [['2026-11', 3600]], 'a 2ª parcela cai em dez: não conta numa meta que fecha em dez');
  assert.deepEqual(ate('2026-11'), [], 'nem a 1ª: cai no mês da data, não antes');
  assert.equal(ate('2028-06').length, 4, 'meta mais longa: o 13º de 2027 também');
  // lançado na aba Salário vale o lançado
  const ref2 = { salario: { ...REF_SAL.salario, extras: [{ mes: '2026-12', tipo: '13º (2ª parcela)', status: 'Previsto', liquido: 2500 }] } };
  assert.equal(expandirEntradas(meta, { referencias: ref2, hoje: HOJE, ate: '2027-06' })[1].valor, 2250);
  // sem holerite: só o líquido = metade em cada parcela (aproximado)
  const aprox = estimativa13({ salario: { liquido: 5000 } }, 2026);
  assert.deepEqual([aprox.p1.valor, aprox.p2.valor, aprox.p1.origem], [2500, 2500, 'aproximado']);
  // sem nenhum dado: não inventa
  assert.equal(estimativa13({}, 2026), null);
  const sem = expandirEntradas(meta, { referencias: {}, hoje: HOJE, ate: '2027-06' });
  assert.deepEqual(sem.map((e) => e.valor), [0, 0]);
  assert.match(sem[0].nota, /informe o valor/);
});

test('FGTS aniversário: mês do aniversário e valor da aba Patrimônio (resumoFgts); editável (valor e mês); % padrão 90', () => {
  const ref = { fgts: {
    contas: [{ empregador: 'X', admissao: '2019-03-01', afastamento: null, saldo: 30000, dataSaldo: '2026-09-01', saques: { aniversario: 900 }, saquesAniversario: [{ data: '2026-03-10', valor: 900 }] }],
    nascimento: '1990-03-15', carreira: { contratos: [{ empregador: 'X', salarios: [{ data: '2024-01-01', valor: 8000 }] }] },
  } };
  const est = estimativaFgts(ref, HOJE);
  assert.equal(est.mes, '2027-03');
  assert.ok(est.valor > 3000 && est.valor < 9000, `saque estimado ${est.valor}`);
  assert.equal(est.ativo, true);
  const meta = { entradas: [entradaPadrao('fgts')] };
  const [e] = expandirEntradas(meta, { referencias: ref, hoje: HOJE, ate: '2027-06' });
  assert.equal(e.mes, '2027-03');
  assert.ok(perto(e.valor, est.valor * 0.9, 0.02), '90% do que vai receber');
  // data antes do aniversário: não entra
  assert.deepEqual(expandirEntradas(meta, { referencias: ref, hoje: HOJE, ate: '2027-03' }), []);
  // valor e mês informados valem mais que a estimativa
  const edit = { entradas: [entradaPadrao('fgts', { valor: 4000, mes: '2027-01', pct: 0.5 })] };
  const [e2] = expandirEntradas(edit, { referencias: ref, hoje: HOJE, ate: '2027-06' });
  assert.deepEqual([e2.mes, e2.valor, e2.origem], ['2027-01', 2000, 'informado']);
  // sem dados do FGTS: avisa o que falta
  const [e3] = expandirEntradas(meta, { referencias: {}, hoje: HOJE, ate: '2027-06' }) .concat([null]);
  assert.equal(e3, null, 'sem mês do aniversário não há como saber quando cai');
});

test('PLR/outra entrada: uma vez ou recorrente; desligada não conta', () => {
  const meta = { entradas: [
    entradaPadrao('plr', { valor: 3000, mes: '2027-02', pct: 1 }),
    entradaPadrao('outra', { nome: 'Venda do notebook', valor: 800, mes: '2026-12', pct: 0.5 }),
    entradaPadrao('outra', { nome: 'Desligada', valor: 999, mes: '2026-12', ativo: false }),
    entradaPadrao('outra', { nome: 'Mensal', valor: 100, mes: '2026-11', recorrencia: 'mensal' }),
  ] };
  const r = expandirEntradas(meta, { referencias: {}, hoje: HOJE, ate: '2027-02' });
  assert.deepEqual(r.map((e) => [e.rotulo, e.mes, e.valor]), [['Mensal', '2026-11', 100], ['Venda do notebook', '2026-12', 400], ['Mensal', '2026-12', 100], ['Mensal', '2027-01', 100]]);
});

test('aporte com entradas: (falta - entradas até a data) / meses; com rendimento as entradas rendem até a data; degraus na projeção', () => {
  const base = { id: 'g', tipo: 'acumulo', nome: 'Meta', moeda: 'BRL', valorAlvo: 20000, dataAlvo: '2027-06', rendimentoAnual: 0, status: 'ativa', vinculos: [], itens: [], valorInicial: 2000, especificos: {}, entradas: [] };
  const ctx = { ativos: [], cambio: {}, hoje: HOJE, referencias: REF_SAL, historico: {} };
  const sem = calcularMeta(base, ctx);
  assert.equal(sem.mesesRestantes, 8);
  assert.equal(sem.aporteNecessario, (20000 - 2000) / 8);
  const com = calcularMeta({ ...base, entradas: [entradaPadrao('decimo13'), entradaPadrao('outra', { valor: 1000, mes: '2027-03', pct: 1 })] }, ctx);
  assert.equal(com.entradasTotal, 3600 + 2160 + 1000);
  assert.equal(com.aporteNecessario, (20000 - 2000 - 6760) / 8);
  assert.deepEqual([com.decomposicao.falta, com.decomposicao.totalEntradas, com.decomposicao.restante, com.decomposicao.meses], [18000, 6760, 11240, 8]);
  // com rendimento: o aporte fecha EXATAMENTE no alvo (entradas rendem a partir do mês em que caem)
  const rend = calcularMeta({ ...base, rendimentoAnual: 0.12, entradas: [entradaPadrao('outra', { valor: 5000, mes: '2026-12', pct: 1 })] }, ctx);
  const taxa = rend.taxa;
  const fvEntradas = valorFuturoEntradas(rend.entradasFluxo, 8, taxa);
  assert.ok(fvEntradas > 5000);
  const traj = trajetoriaMensal({ atual: 2000, aporte: rend.aporteNecessario, taxa, entradas: rend.entradasFluxo, meses: 8 });
  assert.ok(perto(traj[traj.length - 1], 20000, 0.5), `fecha no alvo: ${traj[traj.length - 1]}`);
  // degrau no mês da entrada (k = 2: dezembro)
  const k = rend.entradasFluxo[0].k;
  assert.ok(traj[k] - traj[k - 1] > 5000 + rend.aporteNecessario - 1, 'a curva sobe em degrau');
  const serie = serieProjecao(com, { hoje: HOJE });
  assert.ok(serie.length >= 8 && serie.some((p) => p.necessaria != null));
  // o ritmo atual também enxerga as entradas: prazo menor
  const ritmo = calcularMeta({ ...base, aporteMensal: 1000, entradas: [entradaPadrao('outra', { valor: 6000, mes: '2026-12', pct: 1 })] }, ctx);
  const semE = calcularMeta({ ...base, aporteMensal: 1000 }, ctx);
  assert.ok(ritmo.mesesEstimados < semE.mesesEstimados);
});

test('viagem: "A pagar" (cartão) fica FORA do aporte; "A juntar" (diárias, taxa, margem, itens não pagos) menos o guardado e as entradas', () => {
  const base = {
    id: 'vg', tipo: 'viagemInternacional', nome: 'V', moeda: 'EUR', dataAlvo: '2027-06', rendimentoAnual: 0, status: 'ativa', itens: [],
    especificos: { margem: 0.1, pessoas: 2, destinos: [
      { id: 'a', cidade: 'Paris', paisCodigo: 'FR', moeda: 'EUR', dias: 5, gastos: { alimentacao: 100 }, extras: 0, taxaTuristica: 5, taxaNoites: null, taxaPessoas: null },
      { id: 'b', cidade: 'Zurique', paisCodigo: 'CH', moeda: 'CHF', dias: 2, gastos: { alimentacao: 100 }, extras: 0 },
    ], fixos: [] },
    vinculos: [{ tipo: 'saldo', id: 'w', instituicao: 'Wise', moeda: 'EUR', saldo: 300 }],
    entradas: [],
  };
  const cambio = { EUR: { valor: 6 }, CHF: { valor: 7 } };
  const ctx = { ativos: [], cambio, hoje: HOJE, referencias: {}, historico: {} };
  const sem = calcularMeta(base, ctx);
  // EUR: 5 x 100 = 500 + 10% = 550 + taxa 5 x 5 noites x 2 pessoas = 50 -> 600 (guardado 300); CHF: 200 + 10% = 220
  assert.deepEqual([sem.viagem.porMoeda.EUR.comMargem, sem.viagem.porMoeda.EUR.taxa, sem.viagem.porMoeda.CHF.comMargem], [600, 50, 220]);
  assert.equal(sem.alvoBRL, 600 * 6 + 220 * 7);
  assert.equal(sem.atualBRL, 1800);
  assert.equal(sem.falta, 600 * 6 + 220 * 7 - 1800);
  const aporte0 = sem.aporteNecessario;
  assert.equal(aporte0, sem.falta / 8);
  // compra no cartão (já feita): NÃO muda o aporte nem o status; aparece só em "A pagar"
  const comCartao = { ...base, especificos: { ...base.especificos, fixos: [
    { id: 'f1', nome: 'Passagem', valor: 6000, moeda: 'BRL', parcelas: 6, inicio: '2026-08', parte: 1, forma: 'cartao', cartao: 'Cartão X' },
    { id: 'f2', nome: 'Seguro', valor: 500, moeda: 'BRL', parcelas: 1, forma: 'pago' },
  ] } };
  const c1 = calcularMeta(comCartao, ctx);
  assert.equal(c1.aporteNecessario, aporte0, 'o cartão não entra no aporte');
  assert.equal(c1.alvoBRL, sem.alvoBRL);
  assert.equal(c1.status, sem.status);
  const ap = c1.viagem.aPagar;
  assert.equal(ap.totalBRL, 6500);
  // 6 parcelas de 1.000 de ago a jan; hoje é out: ago/set já passaram (confirmadas), out-jan pendentes
  assert.deepEqual(ap.cronograma.map((x) => [x.mes, x.total, x.pendente]), [['2026-08', 1000, 0], ['2026-09', 1000, 0], ['2026-10', 1000, 1000], ['2026-11', 1000, 1000], ['2026-12', 1000, 1000], ['2027-01', 1000, 1000]]);
  assert.equal(ap.mesAtualBRL, 1000);
  assert.equal(ap.pendenteBRL, 4000);
  assert.equal(ap.confirmadoBRL, 2500, 'ago+set do cartão + o seguro à vista');
  assert.equal(ap.ultimoMes, '2027-01');
  assert.deepEqual(ap.itens.map((f) => [f.nome, f.status]), [['Passagem', 'pendente'], ['Seguro', 'confirmado']]);
  assert.equal(ap.cronograma[0].porCartao['Cartão X'], 1000);
  // marcar como confirmado (fatura paga): tudo vira confirmado
  const conf = calcularViagem({ ...comCartao, especificos: { ...comCartao.especificos, fixos: [{ ...comCartao.especificos.fixos[0], confirmado: true }] } }, { cambio, hoje: HOJE });
  assert.equal(conf.aPagar.pendenteBRL, 0);
  assert.equal(conf.fixos[0].status, 'confirmado');
  // item "ainda vou pagar" ENTRA no a juntar (e no aporte)
  const comJuntar = { ...base, especificos: { ...base.especificos, fixos: [{ id: 'f3', nome: 'Trem', valor: 100, moeda: 'CHF', parcelas: 1, forma: 'juntar' }] } };
  const c2 = calcularMeta(comJuntar, ctx);
  assert.equal(c2.alvoBRL, sem.alvoBRL + 700);
  assert.ok(c2.aporteNecessario > aporte0);
  assert.equal(c2.viagem.aPagar.itens.length, 0);
  // entradas (13º 90%) reduzem o aporte; decomposição explica
  const c3 = calcularMeta({ ...comCartao, entradas: [entradaPadrao('decimo13', { pct: 0.3 })] }, { ...ctx, referencias: REF_SAL });
  assert.equal(c3.entradasTotal, 1920);
  assert.equal(c3.aporteNecessario, (sem.falta - 1920) / 8);
  assert.equal(c3.decomposicao.restante, sem.falta - 1920);
  // entradas maiores que a falta: nada a aportar (nunca negativo)
  assert.equal(calcularMeta({ ...comCartao, entradas: [entradaPadrao('decimo13')] }, { ...ctx, referencias: REF_SAL }).aporteNecessario, 0);
  // status só pelo a juntar: aporte informado cobrindo o necessário = no ritmo, mesmo com muita parcela no cartão
  const cr = calcularMeta({ ...comCartao, aporteMensal: Math.ceil(aporte0) }, ctx);
  assert.equal(cr.status, 'no-ritmo');
  assert.equal(calcularMeta({ ...comCartao, aporteMensal: 10 }, ctx).status, 'atrasada');
});

test('conta mensal antiga da viagem vira item no cartão (aporte não muda)', () => {
  const meta = { id: 'v', tipo: 'viagemNacional', nome: 'V', moeda: 'BRL', valorAlvo: 3000, dataAlvo: '2027-06', rendimentoAnual: 0, status: 'ativa', vinculos: [], itens: [], especificos: {}, contaMensal: { descricao: 'Hotel', valor: 500, meses: 6, inicio: '2026-09' } };
  const c = calcularMeta(meta, { ativos: [], cambio: {}, hoje: HOJE, referencias: {}, historico: {} });
  assert.equal(c.viagem.aPagar.totalBRL, 3000);
  assert.equal(c.viagem.aPagar.mesAtualBRL, 500);
  assert.equal(c.aporteNecessario, 3000 / 8, 'só o valor pra gastar lá');
});

test('taxa turística: por pessoa por noite x noites (padrão = dias; máximo da cidade) x pessoas (padrão = as da viagem)', () => {
  assert.deepEqual(taxaTuristicaDestino({ dias: 5, taxaTuristica: 5.53 }, { pessoasPadrao: 2 }), { valor: 5.53, noites: 5, pessoas: 2, max: null, total: 55.3 });
  assert.equal(taxaTuristicaDestino({ dias: 10, taxaTuristica: 7, taxaMaxNoites: 7 }, { pessoasPadrao: 1 }).total, 49, 'Barcelona: no máximo 7 noites');
  assert.equal(taxaTuristicaDestino({ dias: 4, taxaTuristica: 3, taxaNoites: 2, taxaPessoas: 3 }).total, 18, 'noites e pessoas editáveis');
  assert.equal(taxaTuristicaDestino({ dias: 4 }).total, 0, 'nem toda cidade cobra');
  // entra no "a juntar" sem margem
  const v = calcularViagem({ especificos: { margem: 0.5, destinos: [{ moeda: 'EUR', dias: 2, gastos: { alimentacao: 100 }, taxaTuristica: 10 }] } }, { cambio: { EUR: 6 }, hoje: HOJE });
  assert.equal(v.porMoeda.EUR.comMargem, 200 * 1.5 + 20);
  assert.equal(v.taxaBRL, 120);
});

test('sugestão de taxa turística (taxas-turisticas.json): só valor com fonte e ano; percentual/sem fonte = informe manualmente', () => {
  const paris = sugestaoTaxaTuristica({ cidade: 'Paris', paisCodigo: 'FR' }, TAXAS);
  assert.equal(paris.tipo, 'fixa');
  assert.ok(paris.valor > 0 && paris.moeda === 'EUR' && paris.ano >= 2025 && /^https:\/\//.test(paris.fonte.url));
  assert.equal(sugestaoTaxaTuristica({ cidade: 'barcelona' }, TAXAS).maxNoites, 7);
  assert.equal(sugestaoTaxaTuristica({ cidade: 'Amsterdã', paisCodigo: 'NL' }, TAXAS).tipo, 'percentual');
  assert.equal(sugestaoTaxaTuristica({ cidade: 'Lugar Nenhum' }, TAXAS), null);
  assert.equal(sugestaoTaxaTuristica({ cidade: 'Paris', paisCodigo: 'PT' }, TAXAS), null, 'o país tem que bater');
  TAXAS.cidades.forEach((t) => {
    assert.ok(['fixa', 'percentual', 'nao-cobra'].includes(t.tipo), t.cidade);
    assert.ok(t.fonte && /^https:\/\//.test(t.fonte.url) && t.fonte.nome && t.ano, `fonte e ano de ${t.cidade}`);
    if (t.tipo === 'fixa') assert.ok(t.valor > 0 && t.moeda, t.cidade);
    if (t.tipo === 'percentual') assert.ok(t.valor == null, `${t.cidade}: percentual não vira valor fixo`);
  });
  ['Paris', 'Barcelona', 'Roma', 'Veneza', 'Amsterdã', 'Lisboa', 'Porto', 'Viena', 'Praga', 'Budapeste', 'Berlim', 'Zurique'].forEach((c) => {
    assert.ok(TAXAS.cidades.some((t) => t.cidade === c), `${c} está na lista`);
  });
});

test('países: nome em português, sinônimos, ISO, bandeira local e cidades por país', () => {
  assert.equal(PAISES.length > 190, true);
  PAISES.forEach((p) => {
    assert.match(p.codigo, /^[A-Z]{2}$/);
    assert.match(p.moeda || '', /^[A-Z]{3}$/, p.nome);
    assert.ok(fs.existsSync(fileURLToPath(new URL(`../${caminhoBandeira(p.codigo)}`, import.meta.url))), `bandeira de ${p.nome}`);
  });
  Object.keys(CIDADES).forEach((cod) => assert.ok(PAISES.some((p) => p.codigo === cod), `cidades de ${cod} sem país`));
  const cod = (t) => (acharPais(t, PAISES) || {}).codigo;
  assert.deepEqual(['Suiça', 'Suíça', 'switzerland', 'SUIÇA', ' ch '].map(cod), ['CH', 'CH', 'CH', 'CH', 'CH']);
  assert.deepEqual(['Inglaterra', 'Reino Unido', 'UK', 'Escócia', 'Great Britain'].map(cod).slice(0, 2), ['GB', 'GB']);
  assert.deepEqual(['Holanda', 'Países Baixos', 'Espanha', 'França', 'Estados Unidos', 'EUA', 'Brasil', 'Republica Tcheca', 'Tchéquia'].map(cod).slice(0, 7), ['NL', 'NL', 'ES', 'FR', 'US', 'US', 'BR']);
  assert.equal(cod('Narnia'), undefined);
  assert.equal(acharPais('Suíça', PAISES).moeda, 'CHF');
  assert.equal(acharPais('Brasil', PAISES).moeda, 'BRL');
  assert.equal(caminhoBandeira('CH'), 'assets/imgs/flags/ch.svg');
  assert.equal(caminhoBandeira('xx1'), null);
  assert.ok(cidadesDoPais(CIDADES, 'FR').some((c) => c.nome === 'Paris'));
  assert.equal(acharPaisPelaCidade('Interlaken', CIDADES, PAISES).codigo, 'CH');
  assert.equal(acharPaisPelaCidade('Madrid', CIDADES, PAISES).codigo, 'ES', 'sinônimo da cidade');
});

test('Wanderlog: normaliza o link (https:// se faltar), recusa o que não é http(s), reconhece o domínio', () => {
  assert.equal(normalizarUrl('wanderlog.com/plan/abc'), 'https://wanderlog.com/plan/abc');
  assert.equal(normalizarUrl('  https://wanderlog.com/plan/abc?x=1 '), 'https://wanderlog.com/plan/abc?x=1');
  assert.equal(normalizarUrl(''), '');
  assert.equal(normalizarUrl('javascript:alert(1)'), null);
  assert.equal(normalizarUrl('isso nao e link'), null);
  assert.equal(ehLinkWanderlog('https://wanderlog.com/plan/abc'), true);
  assert.equal(ehLinkWanderlog('https://www.wanderlog.com/view/xyz'), true);
  assert.equal(ehLinkWanderlog('https://exemplo.com/wanderlog.com'), false);
});

test('migração da viagem antiga: país digitado -> ISO, itens fixos -> "A pagar", conta mensal -> item no cartão, entradas padrão, "revise" no que não mapear', () => {
  const antiga = {
    id: 'v', tipo: 'viagemInternacional', nome: 'Antiga', moeda: 'EUR', dataAlvo: '2027-06', rendimentoAnual: 0.1, status: 'ativa', vinculos: [], itens: [],
    contaMensal: { descricao: 'Hotel parcelado', valor: 300, meses: 4, inicio: '2026-09' },
    especificos: { destino: 'Europa', margem: 0.1, destinos: [
      { id: 'd1', pais: 'Suiça', cidade: 'Zurique', moeda: 'CHF', dias: 3, gastos: { alimentacao: 100 } },
      { id: 'd2', pais: 'Inglaterra', cidade: 'Londres', moeda: 'GBP', dias: 2, gastos: {} },
      { id: 'd3', pais: 'switzerland', cidade: 'Lucerna', moeda: 'EUR', dias: 1, gastos: {} },
      { id: 'd4', pais: '', cidade: 'Interlaken', moeda: 'CHF', dias: 1, gastos: {} },
      { id: 'd5', pais: 'Atlântida', cidade: 'Cidade Perdida', moeda: 'EUR', dias: 1, gastos: {} },
    ], fixos: [
      { id: 'f1', nome: 'Passagem', valor: 5000, moeda: 'BRL', parcelas: 10, inicio: '2026-08', parte: 1, pago: false },
      { id: 'f2', nome: 'Ingresso', valor: 100, moeda: 'EUR', parcelas: 1, pago: true },
      { id: 'f3', nome: 'Hotel sem mês', valor: 800, moeda: 'BRL', parcelas: 4, parte: 1 },
    ] },
  };
  const original = JSON.stringify(antiga);
  const { meta: m, revisar, mudou } = migrarMetaViagem(antiga, { paises: PAISES, cidades: CIDADES });
  assert.equal(JSON.stringify(antiga), original, 'não altera a meta de entrada');
  assert.equal(mudou, true);
  const d = m.especificos.destinos;
  assert.deepEqual(d.map((x) => [x.paisCodigo, x.pais]), [['CH', 'Suíça'], ['GB', 'Reino Unido'], ['CH', 'Suíça'], ['CH', 'Suíça'], [undefined, 'Atlântida']]);
  assert.equal(d[0].paisDigitado, 'Suiça', 'guarda o que foi digitado');
  assert.deepEqual(d.map((x) => x.cidade), ['Zurique', 'Londres', 'Lucerna', 'Interlaken', 'Cidade Perdida'], 'nada se perde');
  assert.equal(d[0].gastos.alimentacao, 100);
  assert.deepEqual(m.especificos.fixos.map((f) => [f.nome, f.forma]).slice(0, 3), [['Passagem', 'cartao'], ['Ingresso', 'pago'], ['Hotel sem mês', 'cartao']]);
  const hotel = m.especificos.fixos.find((f) => f.nome === 'Hotel parcelado');
  assert.deepEqual([hotel.valor, hotel.parcelas, hotel.inicio, hotel.forma], [1200, 4, '2026-09', 'cartao']);
  assert.equal(m.contaMensal, null);
  assert.deepEqual(m.entradas.map((e) => [e.tipo, e.pct]), [['decimo13', 0.9], ['fgts', 0.9]]);
  assert.equal(m._entradasPadrao, true);
  const campos = revisar.map((r) => `${r.campo}:${r.destinoId || r.fixoId}`);
  assert.ok(campos.includes('país:d5'), '"Atlântida" não mapeia');
  assert.ok(campos.includes('país:d4'), 'país deduzido pela cidade: confira');
  assert.ok(campos.includes('moeda:d3'), 'Suíça em euro: confira a moeda');
  assert.ok(campos.some((c) => c.startsWith('mês da 1ª fatura:f3')));
  assert.ok(!campos.includes('país:d1') && !campos.includes('país:d2'));
  // idempotente: migrar de novo não duplica nada
  const de2 = migrarMetaViagem(m, { paises: PAISES, cidades: CIDADES });
  assert.equal(de2.meta.especificos.fixos.length, m.especificos.fixos.length);
  assert.equal(de2.meta.entradas.length, 2);
  // o aporte da migrada = o do "a juntar" (os itens antigos não entram)
  const ctx = { ativos: [], cambio: { EUR: 6, CHF: 7, GBP: 8 }, hoje: HOJE, referencias: {}, historico: {} };
  const c = calcularMeta(de2.meta, ctx);
  assert.equal(c.viagem.aPagar.totalBRL, 5000 + 600 + 800 + 1200);
  assert.ok(c.aporteNecessario > 0);
  // sem lista de países carregada: migra o resto e não chuta país
  const sp = migrarMetaViagem(antiga, { paises: [] });
  assert.equal(sp.meta.especificos.destinos[0].paisCodigo, undefined);
  assert.equal(sp.meta.especificos.fixos[0].forma, 'cartao');
  // não é viagem: devolve igual
  assert.equal(migrarMetaViagem({ tipo: 'casa' }, { paises: PAISES }).mudou, false);
});

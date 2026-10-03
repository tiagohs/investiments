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
} from '../assets/js/pages/metas-calc.js';

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
  const meta = {
    id: 'm1', tipo: 'viagemInternacional', nome: 'Viagem', moeda: 'EUR', dataAlvo: '2027-07', valorInicial: 1000, aporteMensal: 500, rendimentoAnual: 0,
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

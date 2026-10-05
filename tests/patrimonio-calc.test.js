// tests/patrimonio-calc.test.js
//
// 27/09/2026: contas da aba Patrimônio (patrimonio-calc.js). Dados
// inventados (o repositório é público - nunca números reais).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  difMeses, somarMeses, pontoAte, fatorIndice, valorImovel, saldoFinanciamento, extrasFinanciamento, saldoFies, mesesRestantesFies,
  cronogramaDivida, amortizarOuInvestir, parametrosDivida, usosMoradiaFgts, saldoFgtsEm, resumoFgts, projetarFgts, linhaSalarios,
  crescimentoSalario, balanco, historicoAnual, metaAposentadoria, aporteMedio, projetarAposentadoria, coastFi, liberacoesDividas, idadeEm,
} from '../assets/js/pages/patrimonio-calc.js';

const perto = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

test('meses: diferença, soma e ponto da série até um mês', () => {
  assert.equal(difMeses('2024-11-15', '2025-02'), 3);
  assert.equal(somarMeses('2024-11', 3), '2025-02');
  assert.equal(somarMeses('2025-01', -1), '2024-12');
  assert.deepEqual(pontoAte([['2024-01', 1], ['2024-03', 3]], '2024-02'), ['2024-01', 1]);
  assert.equal(pontoAte([['2024-01', 1]], '2023-12'), null);
});

const INDICES = { fipezap: [['2023-01', 100], ['2024-01', 110], ['2025-01', 121]], ivgr: [['2023-01', 50], ['2024-01', 52], ['2024-06', 55]] };

test('valorImovel: corrige o valor de compra pelos índices (média, FipeZap, IVG-R), manual e antes da compra', () => {
  const imo = { valorCompra: 200000, dataCompra: '2023-01' };
  const v = valorImovel(imo, INDICES, '2025-01');
  assert.ok(perto(v.fipezap.valor, 242000));
  assert.ok(perto(v.ivgr.valor, 220000), 'IVG-R usa o último mês que tem (jun/24)');
  assert.equal(v.ivgr.ate, '2024-06');
  assert.equal(v.metodo, 'media');
  assert.ok(perto(v.valor, 231000));
  assert.ok(perto(v.valorizacao, 0.155));
  assert.equal(valorImovel({ ...imo, metodo: 'fipezap' }, INDICES, '2025-01').valor, 242000);
  assert.equal(valorImovel({ ...imo, metodo: 'manual', valorManual: 250000, dataValorManual: '2024-12-01' }, INDICES, '2025-01').valor, 250000);
  assert.ok(perto(valorImovel({ ...imo, metodo: 'manual', valorManual: 250000, dataValorManual: '2024-12-01' }, INDICES, '2024-01').valor, (220000 + 208000) / 2), 'antes da data do valor manual, índice');
  assert.equal(valorImovel(imo, INDICES, '2022-12').valor, 0);
  assert.equal(valorImovel(imo, {}, '2025-01').metodo, 'compra', 'sem índice: valor de compra');
  assert.equal(fatorIndice([], '2023-01', '2024-01'), null);
});

const FIN = {
  saldo: 180000, dataSaldo: '2025-06-20', taxaAnual: 0.09, amortizacao: 500, seguroTaxas: 100,
  dataInicio: '2023-01', valorFinanciado: 200000, saldosConhecidos: [{ data: '2023-12-31', saldo: 198000 }],
};

test('saldoFinanciamento: âncoras (financiado, saldos conhecidos, extrato), extra como degrau e SAC depois do extrato', () => {
  const fgts = { contas: [{ usosMoradia: [{ data: '2022-12-10', valor: 30000 }, { data: '2024-12-05', valor: 10000 }] }] };
  const extras = extrasFinanciamento(FIN, fgts);
  assert.deepEqual(extras, [{ data: '2024-12-05', valor: 10000, origem: 'fgts' }], 'o uso do FGTS na entrada (antes do início) não é amortização extra');
  assert.equal(saldoFinanciamento(FIN, '2022-12', extras), 0, 'antes do financiamento');
  assert.equal(saldoFinanciamento(FIN, '2023-01', extras), 200000);
  assert.equal(saldoFinanciamento(FIN, '2023-12', extras), 198000);
  // de dez/23 (198.000) a jun/25 (180.000): 18 meses, 8.000 de amortização normal + 10.000 extra em dez/24
  assert.ok(perto(saldoFinanciamento(FIN, '2024-11', extras), 198000 - (8000 * 11) / 18));
  assert.ok(perto(saldoFinanciamento(FIN, '2024-12', extras), 198000 - (8000 * 12) / 18 - 10000));
  assert.equal(saldoFinanciamento(FIN, '2025-06', extras), 180000);
  assert.equal(saldoFinanciamento(FIN, '2025-12', extras), 177000, '6 meses de SAC a 500');
  assert.equal(saldoFinanciamento(FIN, '2060-01', extras), 0);
  assert.deepEqual(extrasFinanciamento({ ...FIN, usarFgtsComoExtra: false }, fgts), []);
});

const FIES = { saldo: 30000, dataSaldo: '2025-06-10', parcela: 400, taxaMensal: 0.003, inicioAmortizacao: '2020-01', contratacao: '2015-02', fim: '2032-06' };

test('saldoFies (Price): pra frente e pra trás na mesma conta; antes da amortização fica parado', () => {
  const i = 0.003;
  const frente = 30000 * (1 + i) ** 6 - 400 * (((1 + i) ** 6 - 1) / i);
  assert.ok(perto(saldoFies(FIES, '2025-12'), frente));
  const tras = (30000 + 400 * (((1 + i) ** 12 - 1) / i)) / (1 + i) ** 12;
  assert.ok(perto(saldoFies(FIES, '2024-06'), tras));
  assert.equal(saldoFies(FIES, '2019-05'), saldoFies(FIES, '2020-01'), 'carência: saldo do início da amortização');
  assert.equal(saldoFies(FIES, '2015-01'), 0);
  assert.equal(mesesRestantesFies(FIES, '2025-06-15'), 84);
  assert.equal(mesesRestantesFies({ saldo: 1000, parcela: 100, taxaMensal: 0 }, null), null);
});

test('cronogramaDivida: SAC termina no prazo; extra com "prazo" termina antes, com "parcela" baixa a parcela', () => {
  const base = cronogramaDivida({ sistema: 'SAC', saldo: 12000, taxaMensal: 0.01, meses: 12 });
  assert.equal(base.length, 12);
  assert.ok(perto(base[0].pagamento, 1000 + 120));
  const prazo = cronogramaDivida({ sistema: 'SAC', saldo: 12000, taxaMensal: 0.01, meses: 12, extras: { 0: 3000 } });
  assert.equal(prazo.length, 9);
  const parcela = cronogramaDivida({ sistema: 'SAC', saldo: 12000, taxaMensal: 0.01, meses: 12, extras: { 0: 3000 }, modo: 'parcela' });
  assert.equal(parcela.length, 12);
  assert.ok(perto(parcela[0].amortizacao, 750));
  const price = cronogramaDivida({ sistema: 'Price', saldo: 10000, taxaMensal: 0.01, meses: 24 });
  assert.equal(price.length, 24);
  assert.ok(price[23].saldo < 0.01);
});

test('amortizarOuInvestir: dívida cara -> amortizar ganha; dívida barata -> investir ganha; taxa de empate perto do juro da dívida', () => {
  const cara = { sistema: 'SAC', saldo: 100000, taxaMensal: 0.12 / 12, meses: 120 };
  const a = amortizarOuInvestir(cara, { valor: 10000, rendimentoAnual: 0.06 });
  assert.equal(a.melhor, 'amortizar');
  assert.ok(a.mesesAMenos > 0);
  assert.ok(a.jurosEconomizados > 0);
  const b = amortizarOuInvestir(cara, { valor: 10000, rendimentoAnual: 0.2 });
  assert.equal(b.melhor, 'investir');
  assert.ok(a.taxaEmpate > 0.1 && a.taxaEmpate < 0.14, `empate ${a.taxaEmpate}`);
  const m = amortizarOuInvestir(cara, { mensal: 500, rendimentoAnual: 0.06 });
  assert.equal(m.melhor, 'amortizar');
  assert.equal(amortizarOuInvestir({ saldo: 0, meses: 10 }, { valor: 1 }), null);
});

test('parametrosDivida: financiamento (SAC, taxa anual/12) e FIES (Price) a partir do que está salvo', () => {
  const f = parametrosDivida('financiamento', FIN, '2025-06-25');
  assert.equal(f.sistema, 'SAC');
  assert.equal(f.saldo, 180000);
  assert.equal(f.meses, 360);
  assert.equal(f.taxaMensal, 0.0075);
  const p = parametrosDivida('fies', FIES, '2025-06-25');
  assert.equal(p.sistema, 'Price');
  assert.equal(p.parcela, 400);
});

const FGTS = {
  contas: [
    { empregador: 'A', admissao: '2018-01-01', afastamento: '2020-12-31', saldo: 0, dataSaldo: '2021-01-10', mensal: [['2019-12', 3000], ['2020-12', 5000], ['2021-01', 0]], depositos: 5000, jam: 100, lucros: 0, saques: { rescisao: 5100 }, usosMoradia: [] },
    { empregador: 'B', admissao: '2021-02-01', saldo: 4000, dataSaldo: '2025-06-10', mensal: [['2024-12', 3000], ['2025-01', 500], ['2025-06', 4000]], depositos: 9000, jam: 300, lucros: 50, saques: { aniversario: 1000, moradia: 4350 }, usosMoradia: [{ data: '2025-01-15', valor: 4350 }] },
  ],
};

test('FGTS: saldo em cada mês (soma das contas), resumo, próxima amortização (2 anos depois do último uso) e projeção', () => {
  assert.equal(saldoFgtsEm(FGTS, '2020-06'), 3000);
  assert.equal(saldoFgtsEm(FGTS, '2024-12'), 3000);
  assert.equal(saldoFgtsEm(FGTS, '2025-09'), 4000);
  assert.equal(saldoFgtsEm({ contas: [] }, '2025-01'), null);
  const r = resumoFgts(FGTS, '2025-09-01');
  assert.equal(r.saldo, 4000);
  assert.equal(r.depositos, 14000);
  assert.equal(r.totalSacado, 10450);
  assert.equal(r.usadoMoradia, 4350);
  assert.equal(r.proximaAmortizacao, '2027-01');
  assert.equal(r.contaAtiva.empregador, 'B');
  assert.equal(r.desde, '2018-01-01');
  assert.deepEqual(usosMoradiaFgts({ contas: [{ usosMoradia: [{ data: '2024-01-02', valor: 1 }] }, { usosMoradia: [{ data: '2024-01-20', valor: 2 }] }] }), [{ data: '2024-01-02', valor: 3 }], 'mesmo mês em contas diferentes = um uso');
  assert.equal(projetarFgts(1000, 100, 2, 0), 1200);
});

test('carreira: linha de salários e crescimento médio ao ano', () => {
  const car = { contratos: [{ empregador: 'A', salarios: [{ data: '2020-01-01', valor: 5000 }] }, { empregador: 'B', salarios: [{ data: '2023-01-01', valor: 8000 }, { data: '2025-01-01', valor: 10000 }] }] };
  assert.deepEqual(linhaSalarios(car).map((s) => s.valor), [5000, 8000, 10000]);
  const c = crescimentoSalario(car, '2025-06-01', 5);
  assert.equal(c.antes, 5000);
  assert.ok(perto(c.taxa, 2 ** (1 / 5) - 1, 1e-9));
  assert.equal(crescimentoSalario({ contratos: [] }, '2025-06-01'), null);
});

const DADOS = {
  hoje: '2025-06-25',
  config: {
    imovel: { valorCompra: 200000, dataCompra: '2023-01', metodo: 'media' },
    financiamento: FIN, fies: FIES, fgts: FGTS,
    ir: { anos: [
      { ano: 2023, bens: 60000, grupos: { '01': { atual: 20000 }, '04': { atual: 40000 } }, tributaveis: 100000 },
      { ano: 2024, bens: 90000, grupos: { '01': { atual: 25000 }, '04': { atual: 65000 } }, tributaveis: 120000 },
    ] },
    outros: [{ id: 'x', nome: 'Carro', tipo: 'bem', valor: 30000 }, { id: 'y', nome: 'Empréstimo', tipo: 'divida', valor: 2000 }],
  },
  indices: INDICES,
  investimentos: { total: 100000, longoPrazo: 80000, reserva: 20000 },
  historicoMensal: [{ mes: '2022-12', patrimonio: 30000 }, { mes: '2025-04', aporteLongoPrazo: 1000 }, { mes: '2025-05', aporteLongoPrazo: 2000 }, { mes: '2025-06', aporteLongoPrazo: 9000 }],
  despesas: { folga: 0.1, totalComFolga: 5500, itens: [{ nome: 'FIES', valor: 400 }, { nome: 'Parcela Apartamento', valor: 1600 }, { nome: 'Mercado', valor: 2000 }, { nome: 'Seguro', valor: 12000, frequencia: 'Anual' }] },
  metas: { extra: 1000, reinvestimento: 0.2, rendimento: 0.06 },
};

test('balanco: o que tem − o que deve, apê pelo índice, FGTS, outros bens e dívidas, quanto do apê já é seu', () => {
  const b = balanco(DADOS);
  const ids = b.ativos.map((a) => a.id);
  assert.deepEqual(ids, ['investimentos', 'reserva', 'imovel', 'fgts', 'outro:x']);
  assert.deepEqual(b.dividas.map((a) => a.id), ['financiamento', 'fies', 'outro:y']);
  const imo = b.ativos.find((a) => a.id === 'imovel').valor;
  assert.ok(perto(b.totalAtivos, 80000 + 20000 + imo + 4000 + 30000));
  assert.ok(perto(b.liquido, b.totalAtivos - b.totalDividas));
  assert.equal(b.imovel.saldo, 180000);
  assert.ok(perto(b.imovel.seu, imo - 180000));
});

test('historicoAnual: IR (sem o imóvel, que no IR é o valor pago) + apê pelo índice + FGTS − dívidas; site quando não tem IR; hoje no fim', () => {
  const h = historicoAnual(DADOS);
  assert.deepEqual(h.map((l) => l.rotulo), ['2022', '2023', '2024', 'hoje']);
  assert.equal(h[0].fonte, 's');
  assert.equal(h[0].investimentos, 30000);
  assert.equal(h[1].investimentos, 40000, '60.000 do IR menos os 20.000 do imóvel');
  assert.equal(h[1].financiamento, 198000);
  assert.equal(h[1].fgts, 0, 'a conta B só tem pontos a partir de dez/24');
  assert.equal(h[1].imovel, 200000, 'índices de dez/23 ainda no nível de jan/23');
  assert.ok(h[2].imovel > 200000);
  assert.ok(perto(h[1].liquido, h[1].investimentos + h[1].imovel + h[1].fgts - h[1].financiamento - h[1].fies));
  assert.ok(perto(h[2].noAno, h[2].liquido - h[1].liquido));
  assert.ok(perto(h[2].convertido, h[2].noAno / 120000));
  const hoje = h[3];
  assert.equal(hoje.hoje, true);
  assert.equal(hoje.investimentos, 80000 + 20000 + 30000);
  assert.equal(hoje.outrasDividas, 2000);
});

test('metaAposentadoria: desconta as parcelas das dívidas (FIES + apê) da renda da DM, deixa claro quanto', () => {
  const m = metaAposentadoria(DADOS);
  assert.deepEqual(m.itens.filter((i) => i.descontar).map((i) => i.nome), ['FIES', 'Parcela Apartamento']);
  assert.equal(m.parcelas, 2000);
  assert.equal(m.rendaDM, (5500 + 1000) * 1.2);
  assert.ok(perto(m.rendaSem, (5500 - 2000 * 1.1 + 1000) * 1.2));
  assert.ok(perto(m.patrimonioSem, (m.rendaSem * 12) / 0.06));
  assert.equal(m.itens.find((i) => i.nome === 'Seguro').mensal, 1000, 'anual vira /12');
  const so = metaAposentadoria(DADOS, { descontar: ['FIES'], taxaSaque: 0.04 });
  assert.equal(so.parcelas, 400);
  assert.equal(so.taxa, 0.04);
});

test('aporteMedio, projeção (com parcelas que viram aporte), Coast FI e idade', () => {
  assert.equal(aporteMedio(DADOS.historicoMensal, DADOS.hoje, 12), 1500, 'o mês de hoje (parcial) fica de fora');
  const p = projetarAposentadoria({ inicial: 1000, aporte: 100, rendimentoReal: 0, alvo: 2000 });
  assert.equal(p.chegou, 10);
  const lib = projetarAposentadoria({ inicial: 1000, aporte: 100, rendimentoReal: 0, alvo: 2000, liberacoes: [{ mes: 2, valor: 100 }] });
  assert.equal(lib.chegou, 6, '2 meses a 100 + 4 a 200');
  assert.equal(projetarAposentadoria({ inicial: 5000, alvo: 2000 }).chegou, 0);
  assert.ok(perto(coastFi(1000000, 0.05, 20), 1000000 / 1.05 ** 20));
  assert.equal(idadeEm('1990-06', '2025-06-25'), 35);
  const libs = liberacoesDividas(DADOS, metaAposentadoria(DADOS));
  assert.deepEqual(libs.map((l) => [l.id, l.valor]), [['fies', 400], ['financiamento', 1600]]);
  assert.equal(libs[0].mes, 84);
  // 05/10/2026: o apê já conta com o FGTS amortizando no prazo a cada 2 anos (o FGTS de teste tem saldo)
  assert.equal(libs[1].semFgts, 360);
  assert.ok(libs[1].usosFgts.length >= 1 && libs[1].mes < 360, `${libs[1].mes}`);
});

test('apê com o FGTS amortizando no prazo a cada 2 anos (regra da Caixa), com o saque-aniversário descontado', async () => {
  const { projetarApeComFgts } = await import('../assets/js/pages/patrimonio-calc.js');
  // financiamento inventado: saldo 120 mil, 120 parcelas de R$ 1.000 de amortização, 0,8% ao mês
  const fin = { saldo: 120000, dataSaldo: '2025-06-10', taxaAnual: 0.096, amortizacao: 1000, dataInicio: '2020-01' };
  const fgts = { contas: [{ saldo: 20000, dataSaldo: '2025-06-10', mensal: [['2025-06', 20000]], usosMoradia: [{ data: '2024-01-10', valor: 5000 }] }] };
  const cfg = { financiamento: fin, fgts };
  const r = projetarApeComFgts(cfg, '2025-06-25', { salario: 5000 });
  assert.equal(r.semFgts, 120);
  assert.ok(r.usos.length >= 2 && r.meses < 120);
  // intervalo mínimo de 2 anos entre usos (SFH)
  for (let k = 1; k < r.usos.length; k += 1) assert.ok(r.usos[k].mes - r.usos[k - 1].mes >= 24, 'a cada 2 anos no mínimo');
  // o 1º uso: 24 meses depois do último (jan/2024) = jan/2026 = a 7ª parcela daqui
  assert.equal(r.usos[0].mes, 7);
  // sem FGTS ou com os usos desligados: o prazo do contrato
  assert.equal(projetarApeComFgts({ financiamento: fin }, '2025-06-25').meses, 120);
  assert.equal(projetarApeComFgts({ ...cfg, financiamento: { ...fin, usarFgtsComoExtra: false } }, '2025-06-25').meses, 120);
  // saque-aniversário ativo (saque nos últimos 13 meses): o saldo que sobra pro apê é menor
  const comSaque = { contas: [{ ...fgts.contas[0], saquesAniversario: [{ data: '2025-02-10', valor: 3000 }], saques: { aniversario: 3000 } }] };
  const r2s = projetarApeComFgts({ financiamento: fin, fgts: comSaque }, '2025-06-25', { salario: 5000, nascimento: '1990-10' });
  assert.ok(r2s.usos[0].valor < r.usos[0].valor, 'o saque-aniversário já saiu do FGTS');
});

test('FGTS usado na amortização do apê aparece como transferência (não é perda) em "pra onde foi" e no histórico anual', async () => {
  const { origemCrescimento, usosFgtsNoApe } = await import('../assets/js/pages/patrimonio-calc.js');
  const fin = { saldo: 90000, dataSaldo: '2026-06-10', taxaAnual: 0.09, amortizacao: 1000, dataInicio: '2024-01', valorFinanciado: 120000, saldosConhecidos: [{ data: '2025-12-31', saldo: 100000 }] };
  const fgts = { contas: [{ saldo: 2000, dataSaldo: '2026-06-10', mensal: [['2025-12', 12000], ['2026-01', 2100], ['2026-06', 2600]], usosMoradia: [{ data: '2026-01-15', valor: 10000 }] }] };
  const d = {
    hoje: '2026-06-25',
    config: { financiamento: fin, fgts, imovel: { valorCompra: 200000, dataCompra: '2024-01' } },
    historicoMensal: [{ mes: '2025-12', patrimonio: 50000, aporte: 0 }, { mes: '2026-06', patrimonio: 56000, aporte: 4000 }],
  };
  assert.deepEqual(usosFgtsNoApe(d.config, '2025-12', '2026-06').map((u) => u.valor), [10000]);
  const o = origemCrescimento(d, 6);
  assert.equal(o.transferencias.length, 1);
  assert.equal(o.transferencias[0].nome, 'FGTS usado na amortização do apê');
  assert.equal(o.transferencias[0].valor, 10000);
  const v = Object.fromEntries(o.itens.map((i) => [i.id, i.valor]));
  assert.ok(v.fgts > 0, 'sem o uso, o FGTS só cresceu (depósitos e juros): nada de perda de R$ 10 mil');
  // o total não muda: a transferência sai de um lado e entra no outro
  perto(o.total, o.itens.reduce((a, i) => a + i.valor, 0), 0.01);
  const h = historicoAnual(d);
  assert.equal(h.find((l) => l.hoje).fgtsNoApe, 10000);
});

test('projeção com aporte crescendo e origem do crescimento (aportes, rendimento, dívidas, apê, FGTS)', async () => {
  const { origemCrescimento } = await import('../assets/js/pages/patrimonio-calc.js');
  const fixo = projetarAposentadoria({ inicial: 0, aporte: 100, rendimentoReal: 0, alvo: 10000 });
  const cresce = projetarAposentadoria({ inicial: 0, aporte: 100, rendimentoReal: 0, alvo: 10000, crescimentoAporte: 0.1 });
  assert.ok(cresce.chegou < fixo.chegou);
  const d = {
    ...DADOS,
    historicoMensal: [{ mes: '2024-06', patrimonio: 50000, aporte: 0 }, { mes: '2024-12', patrimonio: 60000, aporte: 6000 }, { mes: '2025-06', patrimonio: 70000, aporte: 6000 }],
  };
  const o = origemCrescimento(d, 12);
  assert.equal(o.de, '2024-06');
  assert.equal(o.ate, '2025-06');
  const v = Object.fromEntries(o.itens.map((i) => [i.id, i.valor]));
  assert.equal(v.aportes, 12000);
  assert.equal(v.rendimento, 8000);
  assert.ok(v.dividas > 0, 'o saldo das dívidas caiu');
  assert.equal(origemCrescimento({ ...d, historicoMensal: [] }), null);
});

test('historicoAnual: a entrada paga com FGTS antes da escritura já conta como apê naquele 31/12', () => {
  const d = {
    ...DADOS,
    config: { ...DADOS.config, imovel: { valorCompra: 200000, dataCompra: '2024-01' }, financiamento: null, fies: null, fgts: { contas: [{ usosMoradia: [{ data: '2023-11-10', valor: 40000 }], mensal: [] }] } },
    historicoMensal: [{ mes: '2023-12', patrimonio: 10000 }],
  };
  const h = historicoAnual(d);
  const l23 = h.find((l) => l.ano === 2023);
  assert.equal(l23.imovel, 40000);
  assert.equal(l23.entradaImovel, true);
});

test('saque-aniversário: tabela da lei (alíquota + parcela adicional), projeção com o saque no mês do aniversário e resumo', async () => {
  const { saqueAniversario, projetarFgtsMensal, FAIXAS_SAQUE_ANIVERSARIO } = await import('../assets/js/pages/patrimonio-calc.js');
  assert.equal(FAIXAS_SAQUE_ANIVERSARIO.length, 7);
  assert.deepEqual(saqueAniversario(400), { valor: 200, aliquota: 0.5, adicional: 0 });
  assert.equal(saqueAniversario(500).valor, 250, 'até R$ 500 inclusive: 50%');
  assert.equal(saqueAniversario(800).valor, 370);
  assert.equal(saqueAniversario(3000).valor, 1050);
  assert.equal(saqueAniversario(8000).valor, 2250);
  assert.equal(saqueAniversario(12000).valor, 2950);
  assert.equal(saqueAniversario(15000).valor, 3400, 'R$ 15.000 ainda é 15% + R$ 1.150');
  assert.equal(saqueAniversario(15000.01).valor, 3400, '15.000,01: 10% + R$ 1.900');
  assert.equal(saqueAniversario(30000).valor, 4400);
  assert.equal(saqueAniversario(0).valor, 0);
  const p = projetarFgtsMensal(10000, 1000, '2025-01', '2025-04', { mesAniversario: 3, jamMensal: 0 });
  // fev: +1000 (11.000); mar: saque 15%+1150 = 2800 -> 8.200, +1000 = 9.200; abr: fim
  assert.deepEqual(p.saques.map((x) => [x.mes, x.valor]), [['2025-03', 2800]]);
  assert.equal(p.saldo, 9200);
  const fgts = { contas: [{ saldo: 9000, dataSaldo: '2025-06-20', mensal: [['2025-06', 9000]], saques: { aniversario: 500 }, saquesAniversario: [{ data: '2024-11-02', valor: 500 }] }] };
  const r = resumoFgts(fgts, '2025-06-25', { nascimento: '1990-11', depositoMensal: 500 });
  assert.equal(r.aniversario.ativo, true);
  assert.equal(r.aniversario.proximo, '2025-11');
  assert.equal(r.aniversario.ate, '2026-01');
  assert.equal(r.aniversario.comSaldoDeHoje.valor, 2450, '20% de 9.000 + 650');
  assert.ok(r.aniversario.estimado.saldo > 9000, 'até novembro entram depósitos');
  const velho = resumoFgts({ contas: [{ saldo: 100, saquesAniversario: [{ data: '2020-11-02', valor: 50 }] }] }, '2025-06-25');
  assert.equal(velho.aniversario.ativo, false, 'último saque há anos: saiu da modalidade');
});

// tests/renda-calc.test.js
//
// 02/10/2026: contas da seção Renda (aba "Renda e Orçamentos") -
// renda-calc.js. Tudo inventado (o repositório é público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IPCA_MENSAL, mesclarIpca, fatorIpca, ipcaDoAno, ipca12m, ultimoMesIpca, salarioCtpsNoMes, mesesTrabalhados, rendaDaDeclaracao,
  serieRendaAnual, recortarAnos, linhaInflacao, cagrSalario, salarioAtual, investimentoDoSalario, recortarMeses, contasDoIr, documentosRenda,
  FATOR_ANO_CLT, analisarSalario,
} from '../assets/js/pages/renda-calc.js';

const perto = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
// IPCA de mentira: 1% ao mês em 2020, 0,5% em 2021, 2022 até março
const IPCA = { 2020: Array(12).fill(1), 2021: Array(12).fill(0.5), 2022: [0.5, 0.5, 0.5] };

const CARREIRA = {
  contratos: [
    { empregador: 'EMPRESA A', inicio: '2020-03-01', fim: '2021-06-30', salarios: [{ data: '2020-03-01', valor: 3000 }, { data: '2021-01-01', valor: 3300 }] },
    { empregador: 'EMPRESA B', inicio: '2021-07-01', fim: null, salarios: [{ data: '2021-07-01', valor: 5000 }] },
  ],
};

test('IPCA: fator entre meses, ano (completo e parcial), 12 meses e atualização pela resposta do Banco Central', () => {
  assert.ok(perto(fatorIpca('2020-12', '2021-12', IPCA), 1.005 ** 12));
  assert.equal(fatorIpca('2021-12', '2022-05', IPCA), null, 'falta abril/maio');
  assert.ok(perto(ipcaDoAno(2020, IPCA).taxa, 1.01 ** 12 - 1));
  assert.deepEqual({ ...ipcaDoAno(2022, IPCA), taxa: undefined }, { taxa: undefined, meses: 3, completo: false });
  assert.equal(ultimoMesIpca(IPCA), '2022-03');
  const i = ipca12m('2022-08', IPCA);
  assert.equal(i.ate, '2022-03', 'usa o último mês divulgado');
  const novo = mesclarIpca(IPCA, [{ data: '01/04/2022', valor: '0.25' }, { data: '01/05/2022', valor: '-0.10' }, { data: 'x', valor: '1' }]);
  assert.deepEqual(novo[2022], [0.5, 0.5, 0.5, 0.25, -0.1]);
  assert.deepEqual(IPCA[2022], [0.5, 0.5, 0.5], 'não mexe na tabela original');
  assert.ok(IPCA_MENSAL[2024].length === 12);
});

test('CTPS: salário vigente no mês e meses trabalhados no ano', () => {
  assert.equal(salarioCtpsNoMes(CARREIRA, '2020-02'), null);
  assert.equal(salarioCtpsNoMes(CARREIRA, '2020-12').valor, 3000);
  assert.equal(salarioCtpsNoMes(CARREIRA, '2021-03').valor, 3300);
  assert.equal(salarioCtpsNoMes(CARREIRA, '2021-07').empregador, 'EMPRESA B');
  assert.equal(mesesTrabalhados(CARREIRA, 2020), 10);
  assert.equal(mesesTrabalhados(CARREIRA, 2022, '2022-03'), 3);
});

test('Declaração: soma das fontes, carga do mês a mês e do ano (com o ajuste e o IR do 13º); sem detalhe usa o resumo', () => {
  const d = rendaDaDeclaracao({
    ano: 2021, impostoDevido: 9000, restituir: 500, pagar: 0,
    rendimentosPj: [{ fonte: 'A', anual: 40000, inss: 3000, irrf: 6000, decimoTerceiro: 3000, irrf13: 300 }, { fonte: 'B', anual: 20000, inss: 1500, irrf: 3500, decimoTerceiro: 2000, irrf13: 200 }],
    exclusivosItens: [{ tipo: 'plr', valor: 1000 }],
  });
  assert.equal(d.anual, 60000);
  assert.equal(d.decimoTerceiro, 5000);
  assert.equal(d.bruto, 65000);
  assert.equal(d.plr, 1000);
  assert.equal(d.inss, 4500);
  assert.equal(d.ir, 9500, 'devido no ajuste + IR do 13º');
  assert.ok(perto(d.cargaMensal, (4500 + 9500) / 60000));
  assert.ok(perto(d.carga, (4500 + 9500) / 65000));
  assert.equal(d.ajuste, 500);
  const s = rendaDaDeclaracao({ ano: 2019, tributaveis: 12000, exclusivosItens: [{ tipo: 'decimoTerceiro', valor: 1000 }] });
  assert.equal(s.detalhado, false);
  assert.equal(s.bruto, 13000);
  assert.equal(s.carga, null);
  assert.equal(rendaDaDeclaracao({ ano: 2018, tributaveis: 0 }), null);
});

test('Série anual: holerite > CTPS > IR, líquido estimado pela carga do IR, crescimento nominal e real', () => {
  const pagamentos = [
    { mes: '2022-01', tipo: 'Mensal', status: 'Recebido', totalVencimentos: 5500, liquido: 4300, inss: 600, irrf: 600 },
    { mes: '2022-02', tipo: 'Mensal', status: 'Recebido', totalVencimentos: 5500, liquido: 4300, inss: 600, irrf: 600 },
    { mes: '2022-03', tipo: 'Mensal', status: 'Previsto', totalVencimentos: 9999, liquido: 9999 },
    { mes: '2022-02', tipo: '13º (1ª parcela)', status: 'Recebido', totalVencimentos: 2000, liquido: 2000 },
  ];
  const irAnos = [
    { ano: 2019, tributaveis: 26000, exclusivosItens: [] },
    { ano: 2021, impostoDevido: 4000, rendimentosPj: [{ fonte: 'A', anual: 50000, inss: 4000, irrf: 4500, decimoTerceiro: 4000, irrf13: 300 }] },
  ];
  const l = serieRendaAnual({ carreira: CARREIRA, pagamentos, irAnos, hoje: '2022-03-15', ipca: IPCA });
  assert.deepEqual(l.map((x) => [x.ano, x.fonte]), [[2019, 'ir'], [2020, 'ctps'], [2021, 'ctps'], [2022, 'holerite']]);
  const [a19, a20, a21, a22] = l;
  assert.ok(perto(a19.brutoMensal, Math.round((26000 / FATOR_ANO_CLT) * 100) / 100), 'sem CTPS: 12 meses × 13,33/12');
  assert.equal(a20.brutoMensal, 3000);
  assert.equal(a20.meses, 10);
  assert.equal(a21.brutoMensal, Math.round(((6 * 3300 + 6 * 5000) / 12) * 100) / 100);
  assert.equal(a21.brutoAnual, 54000, 'total do ano vem da declaração');
  assert.ok(perto(a21.liquidoMensal, Math.round(a21.brutoMensal * (1 - 8500 / 50000) * 100) / 100, 0.01));
  assert.equal(a21.liquidoEstimado, false, 'carga do próprio ano');
  assert.equal(a20.liquidoEstimado, true, 'carga emprestada do ano mais perto');
  assert.equal(a22.brutoMensal, 5500);
  assert.equal(a22.liquidoMensal, 4300);
  assert.equal(a22.parcial, true);
  assert.equal(a22.holerites, 2, 'só holerite mensal recebido');
  assert.equal(a19.nominal, null, 'primeiro ano: sem crescimento');
  assert.ok(perto(a20.nominal, 3000 / a19.brutoMensal - 1));
  assert.ok(perto(a20.real, (1 + a20.nominal) / (1.01 ** 12) - 1));
  assert.ok(perto(a22.real, (5500 / a21.brutoMensal) / (1.005 ** 3) - 1), '2022: IPCA até março');
});

test('Recorte por anos, linha da inflação (mesma escala) e CAGR nominal/real', () => {
  const linhas = [2019, 2020, 2021, 2022].map((ano, k) => ({ ano, brutoMensal: 1000 * (1 + 0.1 * k), parcial: ano === 2022 }));
  assert.deepEqual(recortarAnos(linhas, '2a', 2022).map((l) => l.ano), [2021, 2022]);
  assert.deepEqual(recortarAnos(linhas, { inicio: '2020-01-01', fim: '2021-12-31' }).map((l) => l.ano), [2020, 2021]);
  assert.equal(recortarAnos(linhas, 'tudo').length, 4);
  const inf = linhaInflacao(linhas.slice(0, 3), IPCA);
  assert.equal(inf[0].valor, 1000);
  assert.ok(perto(inf[2].fator, 1.01 ** 12 * 1.005 ** 12));
  const c = cagrSalario(linhas.slice(0, 3), IPCA);
  assert.equal(c.anos, 2);
  assert.ok(perto(c.nominal, 1.2 ** 0.5 - 1));
  assert.ok(perto(c.acimaInflacao, 1.2 / (1.01 ** 12 * 1.005 ** 12) - 1));
  assert.equal(cagrSalario(linhas.slice(0, 1)), null);
});

test('Salário atual: holerite recente; sem holerite, a CTPS (líquido estimado pela proporção do ano); 12 meses antes e real', () => {
  const pagamentos = [
    { mes: '2021-02', tipo: 'Mensal', status: 'Recebido', totalVencimentos: 3300, liquido: 2900, inss: 250, irrf: 150 },
    { mes: '2022-02', tipo: 'Mensal', status: 'Recebido', totalVencimentos: 5500, liquido: 4300, inss: 600, irrf: 600 },
  ];
  const a = salarioAtual({ carreira: CARREIRA, pagamentos, hoje: '2022-03-20', ipca: IPCA });
  assert.equal(a.fonte, 'holerite');
  assert.equal(a.bruto, 5500);
  assert.equal(a.antes.fonte, 'holerite');
  assert.ok(perto(a.nominal12m, 5500 / 3300 - 1));
  assert.ok(perto(a.ipca12m, ipca12m('2022-02', IPCA).taxa));
  assert.ok(perto(a.cargaAtual, 1200 / 5500));
  const linhas = [{ ano: 2022, brutoMensal: 5000, liquidoMensal: 4000 }];
  const b = salarioAtual({ carreira: CARREIRA, pagamentos: [], linhas, hoje: '2022-03-20', ipca: IPCA });
  assert.equal(b.fonte, 'ctps');
  assert.equal(b.bruto, 5000);
  assert.equal(b.liquido, 4000);
  assert.equal(b.antes.bruto, 3300, 'CTPS de 12 meses antes');
  assert.equal(salarioAtual({}), null);
});

test('Investimento do salário: % do líquido (holerite do mês ou base), médias 6/12 de meses fechados, tendência e meta', () => {
  const mensal = [];
  for (let k = 0; k < 13; k += 1) mensal.push({ mes: `2021-${String(k + 1).padStart(2, '0')}`.replace('2021-13', '2022-01'), total: 1000 + 100 * k, longoPrazo: 900, proventos: 50, parcial: k === 12 });
  const pagamentos = [{ mes: '2021-12', tipo: 'Mensal', status: 'Recebido', totalVencimentos: 10000, liquido: 8000 }];
  const r = investimentoDoSalario({ mensal, pagamentos, base: { liquido: 5000, percentualInvestir: 0.25 } });
  assert.equal(r.meses.length, 13);
  assert.equal(r.meses[0].pct, 1000 / 5000);
  assert.equal(r.meses[11].liquido, 8000);
  assert.equal(r.meses[11].fonteLiquido, 'holerite');
  assert.equal(r.media12.n, 12, 'o mês em andamento fica de fora');
  const somaV = mensal.slice(0, 12).reduce((s, m) => s + m.total, 0);
  assert.ok(perto(r.media12.pct, somaV / (11 * 5000 + 8000)));
  assert.equal(r.media6.n, 6);
  assert.equal(r.meta, 0.25);
  assert.equal(r.metaValor, 1250);
  assert.equal(r.tendencia.sentido, 'subindo');
  assert.equal(r.atual.mes, '2022-01');
  const sem = investimentoDoSalario({ mensal, base: { liquido: 5000 }, opcoes: { descontarProventos: true } });
  assert.equal(sem.meses[0].valor, 950);
  assert.equal(sem.meta, null);
  assert.equal(recortarMeses(r.meses, '6m').length, 6);
  assert.deepEqual(recortarMeses(r.meses, { inicio: '2021-11-01', fim: '2021-12-31' }).map((m) => m.mes), ['2021-11', '2021-12']);
});

test('Contas pela última declaração; as que sumiram vão pra "antigas"; declarações sem o campo pedem pra reler', () => {
  const irAnos = [
    { ano: 2022, contasBancarias: [{ banco: '237', agencia: '1', conta: '9', saldoAtual: 5 }, { banco: '260', agencia: '0001', conta: '12-3', saldoAtual: 10 }] },
    { ano: 2023, exercicio: 2024, contasBancarias: [{ banco: '260', agencia: '0001', conta: '123', saldoAtual: 50 }, { banco: '001', agencia: '2', conta: '7', saldoAtual: 80 }] },
  ];
  const c = contasDoIr(irAnos);
  assert.equal(c.ano, 2023);
  assert.equal(c.exercicio, 2024);
  assert.deepEqual(c.contas.map((x) => x.banco), ['001', '260'], 'maior saldo primeiro');
  assert.deepEqual(c.antigas.map((x) => [x.banco, x.ano]), [['237', 2022]], 'a do Nubank é a mesma (sem pontuação)');
  assert.equal(c.total, 130);
  assert.equal(contasDoIr([{ ano: 2020, bens: 1 }]).semDados, true);
  assert.equal(contasDoIr([]).semDados, false);
});

test('Documentos: automático x manual, último recebido, próximo esperado e alertas', () => {
  const patrimonio = {
    pastaIrConfigurada: true,
    config: {
      ir: { anos: [{ ano: 2024, exercicio: 2025, rendimentosPj: [] }] },
      carreira: { contratos: [{ empregador: 'X', inicio: '2023-01-01', fim: null, salarios: [{ data: '2023-01-01', valor: 9000 }] }] },
      fgts: { contas: [{ dataSaldo: '2025-12-10' }] },
    },
    atualizado: { carreira: '2025-01-10T00:00:00Z' },
  };
  const salario = {
    pagamentos: [{ mes: '2026-08', tipo: 'Mensal', status: 'Recebido', salarioBase: 9500, totalVencimentos: 9500, liquido: 7000, dataCredito: '2026-09-05' }],
    mensal: [{ mes: '2026-08', total: 2000 }, { mes: '2026-09', total: 0 }],
  };
  const d = Object.fromEntries(documentosRenda({ patrimonio, salario, hoje: '2026-10-02' }).map((x) => [x.id, x]));
  assert.equal(d.ir.automatico, true);
  assert.equal(d.ir.estado, 'atrasado', 'em outubro já devia ter a de 2026');
  assert.equal(d.ir.acao, 'ler-ir-drive');
  assert.equal(d.holerite.automatico, false);
  assert.equal(d.holerite.ultimo, 'ago/2026');
  assert.equal(d.holerite.estado, 'ok', 'o de setembro cai por volta de 05/10');
  assert.match(d.holerite.proximo, /05\/10\/2026/);
  assert.equal(d.investimentos.automatico, true);
  assert.equal(d.investimentos.ultimo, 'ago/2026');
  assert.equal(d.ctps.estado, 'atencao', 'holerite com salário-base diferente da Carteira');
  assert.equal(d.fgts.estado, 'atrasado', '10 meses sem extrato');
  const tarde = Object.fromEntries(documentosRenda({ patrimonio, salario, hoje: '2026-10-20' }).map((x) => [x.id, x]));
  assert.equal(tarde.holerite.estado, 'atrasado', 'passou 10 dias da data esperada');
  const velho = { ...patrimonio, config: { ...patrimonio.config, ir: { anos: [{ ano: 2025, exercicio: 2026, bens: 1 }] } } };
  const v = Object.fromEntries(documentosRenda({ patrimonio: velho, salario, hoje: '2026-10-02' }).map((x) => [x.id, x]));
  assert.equal(v.ir.estado, 'atencao', 'declarações de antes desta tela: ler de novo');
  assert.match(v.ir.proximo, /leia de novo/);
  const nada = documentosRenda({ hoje: '2026-10-02' });
  assert.deepEqual(nada.filter((x) => x.estado === 'falta').map((x) => x.id), ['ir', 'holerite', 'ctps', 'fgts']);
});


// 03/10/2026 (revisão do pedido "card de análise embaixo de todos os gráficos
// de crescimento"): leitura do gráfico do salário x IPCA.
test('analisarSalario: ganho real no período, último ano, anos abaixo da inflação e ano em andamento', () => {
  const ipca = { 2019: Array(12).fill(0.4), 2020: Array(12).fill(0.4), 2021: Array(12).fill(0.4), 2022: [0.4, 0.4, 0.4] };
  const ip = (ano) => ipcaDoAno(ano, ipca);
  const linhas = [
    { ano: 2019, brutoMensal: 4000 },
    { ano: 2020, brutoMensal: 4100 },
    { ano: 2021, brutoMensal: 6000 },
    { ano: 2022, brutoMensal: 6300, parcial: true },
  ].map((l, k, arr) => {
    const ant = arr[k - 1];
    const nominal = ant ? l.brutoMensal / ant.brutoMensal - 1 : null;
    return { ...l, ipca: ip(l.ano), nominal, real: ant ? (1 + nominal) / (1 + ip(l.ano).taxa) - 1 : null };
  });
  const a = analisarSalario(linhas, ipca);
  assert.equal(a.tom, 'bom');
  assert.match(a.resumo, /ao ano de 2019 a 2022, acima do IPCA/);
  const tipos = a.pontos.map((p) => p.tipo);
  assert.ok(tipos.includes('comparacao') && tipos.includes('ultimoAno') && tipos.includes('perdas') && tipos.includes('parcial'));
  assert.ok(a.pontos.length <= 4);
  const perdas = a.pontos.find((p) => p.tipo === 'perdas');
  assert.equal(perdas.tom, 'atencao');
  assert.match(perdas.texto, /2020/, '2020: +2,5% com IPCA ~4,9% = perdeu pra inflação');
  assert.match(a.pontos.find((p) => p.tipo === 'ultimoAno').texto, /Em 2021 o salário subiu 46,3%/);
  assert.equal(analisarSalario(linhas.slice(0, 1), ipca), null, '1 ano só: sem análise');
});

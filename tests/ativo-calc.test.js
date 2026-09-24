// tests/ativo-calc.test.js - 25/09/2026: contas da tela Detalhe do ativo
// (assets/js/pages/ativo-calc.js) com um ativo inventado, conta feita à mão:
// histórico no formato do motor de gráficos, rentabilidade (TWR com
// proventos) e ganho em R$, mês a mês, extrato, proventos, faixa de preço,
// renda fixa (PEPS, cupom, ajuste de marcação), IR por classe e o endereço
// da tela (link-ativo.js). Valores sintéticos: nenhum número real aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  montarHistoricoAtivo, aplicadoAcumulado, historicoMensal, montarExtrato, resumoProventosAtivo, faixaDePreco,
  resumoPosicao, eventosDoAtivo, tipoMovimentacaoRf, irDaClasse, ordenarTeses, valorAtualBrl, percentualNaCarteira,
} from '../assets/js/pages/ativo-calc.js';
import { calcularResumoRentabilidade, filtrarHistoricoPorPeriodo } from '../assets/js/pages/inicio.js';
import { refAtivo, urlAtivo, urlAtivoTicker, refDaUrl } from '../assets/js/link-ativo.js';

const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

/** Ação inventada: compra 10 a R$ 10 em 05/01, mais 10 a R$ 12 em 02/02, R$ 5 de dividendo em 15/02. */
function respostaAcao() {
  return {
    ok: true, hoje: '2026-03-10', tipo: 'rv', ticker: 'TEST3', classe: 'acoes', moeda: 'BRL',
    ativo: { ticker: 'TEST3', nome: 'Teste S.A.', quantidade: 20, precoAtual: 13.5, precoMedio: 11, precoTeto: 15, vies: 'Comprar',
      totalComprado: 220, totalAtualizado: 270, proventosTotais: 5, variacaoDia: 0.01 },
    serie: [
      { data: '2026-01-05', cotas: 10, preco: 10, valor: 100, cambio: null, valorBrl: 100 },
      { data: '2026-01-06', cotas: 10, preco: 11, valor: 110, cambio: null, valorBrl: 110 },
      { data: '2026-01-30', cotas: 10, preco: 12, valor: 120, cambio: null, valorBrl: 120 },
      { data: '2026-02-02', cotas: 20, preco: 12, valor: 240, cambio: null, valorBrl: 240 },
      { data: '2026-02-27', cotas: 20, preco: 12.5, valor: 250, cambio: null, valorBrl: 250 },
      { data: '2026-03-09', cotas: 20, preco: 13, valor: 260, cambio: null, valorBrl: 260 },
    ],
    transacoes: [
      { data: '2026-02-02', tipo: 'Compra', preco: 12, quantidade: 10, taxa: 0, total: 120, totalBrl: 120, lucro: null },
      { data: '2026-01-05', tipo: 'Compra', preco: 10, quantidade: 10, taxa: 0, total: 100, totalBrl: 100, lucro: null },
    ],
    proventos: [{ dataCom: '2026-02-05', dataPagamento: '2026-02-15', tipo: 'Dividendo', quantidade: 20, valorPorCota: 0.25, liquido: 5, moeda: 'BRL', cambio: null, valor: 5 }],
    aReceber: [{ ticker: 'TEST3', tipo: 'JCP', dataPagamento: '2026-04-20', valor: 3, fonte: 'B3' }],
    pagosNaoLancados: [],
    faixa52: null,
    indices: [
      { data: '2026-01-02', cdi: 100, ipca: 50, ibovespa: 1000, ifix: 300, sp500: 40, cambioUsd: 5, patrimonio: 1000 },
      { data: '2026-01-30', cdi: 101, ipca: 50.5, ibovespa: 1010, ifix: 301, sp500: 41, cambioUsd: 5, patrimonio: 1200 },
      { data: '2026-02-27', cdi: 102, ipca: 51, ibovespa: 1020, ifix: 302, sp500: 42, cambioUsd: 5, patrimonio: 1250 },
      { data: '2026-03-09', cdi: 102.5, ipca: 51, ibovespa: 1030, ifix: 303, sp500: 43, cambioUsd: 5, patrimonio: 1350 },
    ],
  };
}

test('histórico do ativo: dias da série + hoje ao vivo; compra/venda/provento no dia certo (o provento de um dia sem ponto vai pro próximo)', () => {
  const h = montarHistoricoAtivo(respostaAcao());
  assert.deepEqual(h.map((p) => p.data), ['2026-01-05', '2026-01-06', '2026-01-30', '2026-02-02', '2026-02-27', '2026-03-09', '2026-03-10']);
  assert.equal(h.at(-1).ativo, 270, 'hoje = Total atualizado da tabela de Carteiras');
  assert.equal(h[0].fluxoCaixaAtivo, 100);
  assert.equal(h[3].fluxoCaixaAtivo, 120);
  assert.equal(h[4].fluxoCaixaAtivo, -5, 'provento conta como ganho (fluxo negativo)');
  assert.equal(h[4].proventosAtivo, 5);
  assert.equal(h[4].fluxoAplicadoAtivo, 0, 'provento nunca mexe no Valor aplicado');
  assert.deepEqual(aplicadoAcumulado(h), [100, 100, 100, 220, 220, 220, 220]);
  // índices do dia, repetindo o último conhecido
  assert.equal(h[1].indiceCdi, 100);
  assert.equal(h[2].ibovespa, 1010);
  assert.equal(h.at(-1).ibovespa, 1030);
  perto(percentualNaCarteira(h), 270 / 1350);
});

test('rentabilidade do ativo (mesmo motor das Carteiras): TWR com o provento, e o ganho em R$ = resultado + proventos', () => {
  const h = montarHistoricoAtivo(respostaAcao());
  const r = calcularResumoRentabilidade(null, h, { visaoId: 'ativoAcoes', periodoId: 'tudo' });
  const esperado = (110 / 100) * (120 / 110) * ((240 - 120) / 120) * ((250 + 5) / 240) * (260 / 250) * (270 / 260) - 1;
  perto(r.percentual, esperado * 100, 1e-9);
  perto(r.ganhoReais, (270 - 220) + 5, 1e-9);
  const mes = calcularResumoRentabilidade(null, h, { visaoId: 'ativoAcoes', periodoId: 'mes' });
  perto(mes.percentual, (270 / 250 - 1) * 100, 1e-9);
  assert.equal(filtrarHistoricoPorPeriodo(h, 'mes')[0].data, '2026-02-27', 'o mês começa no fechamento do mês anterior');
});

test('mês a mês (mais recente primeiro): saldo, quantidade, rentabilidade, índice e CDI do mês, % do patrimônio, proventos e aplicado', () => {
  const m = historicoMensal(montarHistoricoAtivo(respostaAcao()), { campoIndice: 'ibovespa' });
  assert.deepEqual(m.map((x) => x.mes), ['2026-03', '2026-02', '2026-01']);
  const [mar, fev, jan] = m;
  assert.equal(mar.saldo, 270);
  assert.equal(mar.cotas, 20);
  perto(mar.rentabilidade, (270 / 250 - 1) * 100, 1e-9);
  perto(fev.rentabilidade, (255 / 240 - 1) * 100, 1e-9);
  perto(jan.rentabilidade, (120 / 100 - 1) * 100, 1e-9);
  perto(mar.indice, (1030 / 1020 - 1) * 100, 1e-9);
  perto(fev.cdi, (102 / 101 - 1) * 100, 1e-9);
  assert.equal(jan.indice, null, '1º mês sem base');
  assert.equal(fev.proventos, 5);
  assert.equal(fev.aplicado, 220);
  perto(mar.percentualCarteira, 270 / 1350);
});

test('extrato: compras e proventos juntos, do mais recente pro mais antigo', () => {
  const e = montarExtrato(respostaAcao());
  assert.deepEqual(e.map((x) => [x.data, x.tipo, x.grupo]), [
    ['2026-02-15', 'Dividendo', 'provento'], ['2026-02-02', 'Compra', 'movimentacao'], ['2026-01-05', 'Compra', 'movimentacao'],
  ]);
  assert.equal(e[0].preco, 0.25);
  assert.equal(e[0].dataCom, '2026-02-05');
});

test('proventos: total, 12 meses fechados, mês atual, yield on cost sobre o aplicado, 24 meses pro gráfico e a receber', () => {
  const p = resumoProventosAtivo(respostaAcao(), { aplicadoHoje: 220 });
  assert.equal(p.total, 5);
  assert.equal(p.ultimos12, 5);
  assert.equal(p.mesAtual, 0);
  perto(p.yieldOnCost12, 5 / 220);
  assert.equal(p.porMes.length, 24);
  assert.equal(p.porMes.at(-1).mes, '2026-03');
  assert.deepEqual(p.porMes.find((x) => x.mes === '2026-02'), { mes: '2026-02', valor: 5, tipos: ['Dividendo'] });
  assert.deepEqual(p.porAno, [{ ano: '2026', valor: 5 }]);
  assert.equal(p.totalAReceber, 3);
  assert.equal(p.primeiroPagamento, '2026-02-15');
});

test('cotação x preço-teto: mínimo/máximo pela série (parcial com menos de 1 ano), margem até o teto; FIIs usam o 52 semanas da planilha', () => {
  const f = faixaDePreco(respostaAcao());
  assert.equal(f.min, 10);
  assert.equal(f.max, 13.5, 'a cotação de hoje entra no máximo');
  assert.equal(f.parcial, true);
  assert.equal(f.fonte, 'serie');
  perto(f.margemTeto, (15 - 13.5) / 15);
  assert.equal(f.posicoes.min, 0);
  assert.equal(f.posicoes.teto, 1);
  const fii = faixaDePreco({ ...respostaAcao(), classe: 'fiis', faixa52: { min: 9, max: 14, fonte: 'Carteira FIIs' } });
  assert.equal(fii.fonte, 'planilha');
  assert.equal(fii.min, 9);
  assert.equal(faixaDePreco({ ...respostaAcao(), tipo: 'rf' }), null);
});

test('posição: saldo, aplicado, resultado (+ com proventos) e rentabilidade sobre o preço médio', () => {
  const r = respostaAcao();
  const p = resumoPosicao(r, montarHistoricoAtivo(r));
  assert.equal(p.resultado, 50);
  perto(p.percentual, 50 / 220);
  assert.equal(p.resultadoComProventos, 55);
  perto(p.rentabilidadeSobrePm, 13.5 / 11 - 1);
  assert.equal(p.aplicadoHistorico, 220);
});

test('venda: sai o CUSTO MÉDIO da parte vendida do aplicado (o recebido vai pro fluxo); sobra < 2% fecha a posição', () => {
  const base = { ok: true, tipo: 'rv', moeda: 'BRL', proventos: [] };
  const ev = eventosDoAtivo({ ...base, transacoes: [
    { data: '2026-01-02', tipo: 'Compra', quantidade: 10, total: 100, totalBrl: 100 },
    { data: '2026-01-03', tipo: 'Compra', quantidade: 10, total: 200, totalBrl: 200 },
    { data: '2026-01-04', tipo: 'Venda', quantidade: 5, total: 90, totalBrl: 90 },
  ] });
  assert.deepEqual(ev.map((e) => [e.caixa, e.aplicado]), [[100, 100], [200, 200], [-90, -75]]);
  const fecha = eventosDoAtivo({ ...base, transacoes: [
    { data: '2026-01-02', tipo: 'Compra', quantidade: 100, total: 1000, totalBrl: 1000 },
    { data: '2026-01-03', tipo: 'Venda', quantidade: 99, total: 1200, totalBrl: 1200 },
  ] });
  assert.equal(fecha[1].aplicado, -1000);
  // ação EUA: o total em reais vem pronto do Apps Script (câmbio do dia)
  const usd = eventosDoAtivo({ ...base, moeda: 'USD', transacoes: [{ data: '2026-01-02', tipo: 'Compra', quantidade: 1, total: 10, totalBrl: 52 }] });
  assert.equal(usd[0].caixa, 52);
  assert.equal(valorAtualBrl({ moeda: 'USD', ativo: { totalAtualizado: 12 }, indices: [{ cambioUsd: 5 }] }), 60);
});

test('posição zerada: a venda depois do último dia da série vira um ponto com saldo 0 (o TWR não soma o valor da venda por cima do saldo)', () => {
  const r = {
    ok: true, hoje: '2026-01-20', tipo: 'rv', moeda: 'BRL', ativo: null, proventos: [], indices: [],
    serie: [{ data: '2026-01-05', cotas: 10, preco: 10, valor: 100, valorBrl: 100 }, { data: '2026-01-06', cotas: 10, preco: 11, valor: 110, valorBrl: 110 }],
    transacoes: [{ data: '2026-01-05', tipo: 'Compra', quantidade: 10, total: 100, totalBrl: 100 }, { data: '2026-01-08', tipo: 'Venda', quantidade: 10, total: 115, totalBrl: 115 }],
  };
  const h = montarHistoricoAtivo(r);
  assert.deepEqual(h.map((p) => [p.data, p.ativo, p.fluxoCaixaAtivo]), [['2026-01-05', 100, 100], ['2026-01-06', 110, 0], ['2026-01-08', 0, -115]]);
  const tudo = calcularResumoRentabilidade(null, h, { visaoId: 'ativoAcoes', periodoId: 'tudo' });
  perto(tudo.ganhoReais, 15, 1e-9);
});

test('renda fixa: aplicação/resgate por PEPS, juros semestrais contam como provento, e a diferença histórico x valor da Carteira é ajuste (não rendimento)', () => {
  assert.equal(tipoMovimentacaoRf({ tipo: 'APLICAÇÃO' }), 'compra');
  assert.equal(tipoMovimentacaoRf({ tipo: 'Resgate' }), 'venda');
  assert.equal(tipoMovimentacaoRf({ tipo: 'Juros' }), 'juros');
  assert.equal(tipoMovimentacaoRf({ tipo: 'Transferência', entradaSaida: 'Credito' }), 'transfEntrada');
  assert.equal(tipoMovimentacaoRf({ tipo: 'Transferência', entradaSaida: 'Debito' }), 'transfSaida');
  const r = {
    ok: true, hoje: '2026-01-10', tipo: 'rf', classe: 'rendaFixa', moeda: 'BRL', proventos: [], indices: [],
    ativo: { totalAtualizado: 310, totalInvestido: 200 },
    serie: [{ data: '2026-01-02', valor: 100 }, { data: '2026-01-03', valor: 300 }, { data: '2026-01-09', valor: 300 }],
    transacoes: [
      { data: '2026-01-02', tipo: 'Compra', quantidade: 1, total: 100 },
      { data: '2026-01-03', tipo: 'Compra', quantidade: 1, total: 200 },
      { data: '2026-01-05', tipo: 'Venda', quantidade: 1, total: 110 },
      { data: '2026-01-06', tipo: 'Juros', quantidade: 0, total: 4 },
    ],
  };
  const ev = eventosDoAtivo(r);
  assert.deepEqual(ev.map((e) => [e.caixa, e.aplicado, e.provento]), [[100, 100, 0], [200, 200, 0], [-110, -100, 0], [-4, 0, 4]]);
  const h = montarHistoricoAtivo(r);
  const hoje = h.at(-1);
  assert.equal(hoje.data, '2026-01-10');
  assert.equal(hoje.ativo, 310);
  assert.equal(hoje.ajusteMarcacao, 10, 'R$ 310 da Carteira contra R$ 300 do histórico');
  assert.equal(hoje.fluxoCaixaAtivo, 10);
  assert.equal(h.find((p) => p.data === '2026-01-09').fluxoCaixaAtivo, -114, 'venda + juros entram no próximo dia com ponto');
  const e = montarExtrato(r);
  assert.deepEqual(e.map((x) => x.tipo), ['Juros (cupom)', 'Resgate', 'Aplicação', 'Aplicação']);
  assert.equal(e[0].grupo, 'provento');
});

test('IR: só as regras, proventos, DARF e informes da classe do ativo', () => {
  const ir = {
    aviso: 'a', atualizadoEm: '2026-09',
    classes: { acoes: { titulo: 'Ações', regras: [{ titulo: 'r1' }] }, fiis: { titulo: 'FIIs', regras: [] } },
    proventos: [{ titulo: 'JCP', classes: ['acoes'] }, { titulo: 'Rendimentos', classes: ['fiis'] }],
    darf: [{ titulo: '6015', classes: ['acoes', 'fiis'] }],
    declaracao: [{ titulo: 'Bens' }],
    ondeBaixar: [{ nome: 'B3', classes: ['acoes', 'fiis'] }, { nome: 'Corretora EUA', classes: ['acoesEua'] }],
    avisos: ['x'],
  };
  const a = irDaClasse(ir, 'acoes');
  assert.equal(a.classe.titulo, 'Ações');
  assert.deepEqual(a.proventos.map((p) => p.titulo), ['JCP']);
  assert.deepEqual(a.ondeBaixar.map((p) => p.nome), ['B3']);
  assert.equal(a.darf.length, 1);
  assert.equal(irDaClasse(null, 'acoes'), null);
});

test('teses: mais nova primeiro, marcada', () => {
  const t = ordenarTeses([{ data: '2025-01-02' }, { data: '2026-08-21' }, { data: '2026-01-10' }]);
  assert.deepEqual(t.map((x) => [x.data, x.maisRecente]), [['2026-08-21', true], ['2026-01-10', false], ['2025-01-02', false]]);
});

test('endereço da tela do ativo: ticker ou rf:<título>|<instituição>, absoluto a partir da raiz do site', () => {
  assert.equal(refAtivo({ classe: 'acoes', ticker: 'test3' }), 'TEST3');
  assert.equal(refAtivo({ classe: 'rf', nome: 'Tesouro Selic 2029', instituicao: 'CORRETORA X' }), 'rf:Tesouro Selic 2029|CORRETORA X');
  assert.equal(refAtivo({ classe: 'rf', nomePersonalizado: 'LCI - BANCO', tipoInvestimento: 'LCI', instituicao: 'BANCO' }), 'rf:LCI - BANCO|BANCO');
  const raizSite = 'https://exemplo.test/repo/';
  assert.equal(urlAtivoTicker('test3', { raizSite }), 'https://exemplo.test/repo/ativo/index.html?ref=TEST3');
  const u = urlAtivo('rf:Tesouro IPCA+ 2029|XP', { raizSite });
  assert.equal(refDaUrl(u), 'rf:Tesouro IPCA+ 2029|XP', 'o "+" e o "|" sobrevivem à ida e volta');
  assert.equal(refDaUrl('nao é url'), '');
});

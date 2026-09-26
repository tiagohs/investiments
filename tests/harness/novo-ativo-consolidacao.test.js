// tests/harness/novo-ativo-consolidacao.test.js
//
// 26/09/2026: cadastro de ativo (NovoAtivo.gs), endereços achados pelo rótulo
// (Planilha.gs), consolidação (Consolidacao.gs), Carteira Renda Fixa com o
// preço do Tesouro (CarteiraRendaFixaSync.gs), "momento de aporte"
// (Aportes.gs + aportes-calc.js) e o fluxo inteiro: cadastra o ativo ->
// planeja o aporte -> conclui -> importa o extrato -> consolida -> confere
// histórico, carteira de renda fixa e a tela. Todos os .gs carregados de
// verdade (planilha-falsa.mjs); dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, AbaFalsa, sandboxGas, D, iso, plain } from './planilha-falsa.mjs';
import { momentoAporte } from '../../assets/js/pages/aportes-calc.js';

const AGORA = new Date(2026, 8, 26, 12, 0, 0);
const cab = (n) => Array.from({ length: n }, () => ['']);
const DIAS_UTEIS = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
const CSV_TESOURO = [
  'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
  'Tesouro Selic;01/03/2029;24/09/2026;0,05;0,06;17010,00;17000,00;17000,00',
  'Tesouro IPCA+;15/05/2035;24/09/2026;7,62;7,74;2610,00;2600,00;2600,00',
  'Tesouro IPCA+ com Juros Semestrais;15/05/2035;24/09/2026;7,40;7,52;4300,00;4290,00;4290,00',
  'Tesouro IPCA+;15/05/2035;23/09/2026;7,50;7,60;2590,00;2580,00;2580,00',
  'Tesouro Selic;01/03/2029;23/09/2026;0,05;0,06;16990,00;16980,00;16980,00',
].join('\n');

function linhaCarteira(sb, r, ticker, nome, tipo, setor) {
  return [ticker, nome, tipo, setor, 'Sub', 'Seg',
    { r1c1: '=SUMIF(Transações!C1,RC1,Transações!C11)', f: `=SUMIF(Transações!A:A,A${r},Transações!K:K)`, v: 10 },
    { r1c1: '=GOOGLEFINANCE(RC1)', f: `=GOOGLEFINANCE(A${r})`, v: 20 },
    { r1c1: '=RC[-2]*RC[-1]', f: `=G${r}*H${r}`, v: 200 }];
}

function linhaAux(r, classe, ticker, nome, moeda, preco, qtd, pm, teto, vies, total) {
  return [classe, ticker,
    { f: `=VLOOKUP(B${r},'Carteira X'!A:B,2,0)`, v: nome }, '', moeda,
    { f: `=GOOGLEFINANCE(B${r})`, v: preco }, 0.01,
    { f: `=SUMIF(Transações!A:A,B${r},Transações!K:K)`, v: qtd },
    { f: `=IFERROR(AVERAGEIF(Transações!A:A,$B${r},Transações!D:D),0)`, v: pm },
    { f: `=VLOOKUP($B${r},'Distribuição e Metas'!C:E,3,0)`, v: teto }, vies, '', '', '', '', '', '', '', total, total];
}

function radar(ranking, ticker, formulaLinhaCarteira, aba, teto, extra) {
  return ['', ranking, ticker, { r1c1: `='${aba}'!R${formulaLinhaCarteira}C8`, v: 20 }, teto, 'Comprar', 18, ...extra];
}

/** Planilha inteira (datas no "realm" do vm). */
function montar() {
  const ss = planilhaFalsa({});
  const ctx = sandboxGas(ss, {
    agora: AGORA,
    urlFetch: () => ({ getResponseCode: () => 200, getContentText: () => CSV_TESOURO }),
  });
  const { sb } = ctx;
  const d = (s, h = 0, m = 0) => D(sb, s, h, m);
  const add = (nome, linhas) => { ss.abas[nome] = new AbaFalsa(nome, linhas); };

  add('Carteira Ações', [...cab(7), ['Ticker', 'Nome', 'Tipo', 'Setor', 'Subsetor', 'Segmento', 'Qtd', 'Cotação', 'Total'], [''],
    linhaCarteira(sb, 10, 'ABCD3', 'Empresa ABCD', 'Dividendos', 'Energia'), linhaCarteira(sb, 11, 'EFGH3', 'Empresa EFGH', 'Dividendos', 'Bancos')]);
  add('Carteira FIIs', [...cab(7), ['Ticker', 'Nome', 'Tipo', 'Segmento'], ['TEST11', 'Fundo Teste', 'Tijolo', 'Logística', { r1c1: '=SUMIF(Transações!C1,RC1,Transações!C11)', v: 2 }]]);
  add('Carteira Ações USA', [...cab(7), ['Ticker'], ['AAA', 'Aaa Corp', 'Ações Internacionais', 'Tech', 'Sub', 'Seg', { r1c1: "=SUMIF('Transações - USA'!C1,RC1,'Transações - USA'!C11)", v: 2 }]]);

  const dm = [...cab(9),
    ['', 'Tipo', 'Distribuição desejada', '% atual', 'Carteira atual', 'Nova carteira', 'R$ investir'],
    ['', 'Ações Nacionais e Internacionais', 0.5, 0.55, 5500, 5500, 0, '', '', '', 5000, 6],
    ['', 'FIIs', 0.4, 0.35, 3500, 4000, 500],
    ['', 'Renda Fixa', 0.1, 0.1, 1000, 1000, 0],
    ...cab(5),
    ['', 'Renda Emergencial', 0.9, 0.95, 950, 950, 0],
    ['', 'Renda Fixa', 0.1, 0.05, 50, 100, 50],
    ...cab(13),
    ['', 'Dividendos', 0.6, 0.64, 3500, 3500, 0],
    ['', 'Ações Internacionais', 0.4, 0.36, 2000, 2200, 200],
    ...cab(4),
    ['', 'Ranking', 'Ativo', 'Preço Atual', 'Preço teto'], // 40
    radar(1, 'ABCD3', 10, 'Carteira Ações', 25, [1.2, 6, '120%', '15% (2% acima - retorno em 6 anos)', 0.1, 0.05, 200, -0.05, 200, 1000, 0.1, 800]), // 41
    radar(2, 'EFGH3', 11, 'Carteira Ações', 18, [0.9, 12, '90%', '8% (5% abaixo - retorno em 12 anos)', 0.1, 0.2, 200, 0.1, 200, 1000, 0.1, 0]), // 42
    ['', '', '', '', '', '', '', '', '', '', '', '', 'Total:', 400], // 43
    ...cab(6),
    ['', '', '', '', '', '', '', '', '', 'Cotação do dólar hoje:', 5.2], // 50
    ['', '', '⋘ Carteira Recomendada Internacional'], // 51
    ['', 'Ranking', 'Ativo'], // 52
    radar(1, 'AAA', 9, 'Carteira Ações USA', 12, [2, '', '200%', 0.2, 0.1, 100, 110, -0.1, 100, 10]), // 53
    [''], // 54 total
    ...cab(5),
    ['', 'Tipo', '% desejado'], // 60
    ['', 'Tijolo', 0.5, 0.6, 2100, 2100, 0],
    ['', 'Papel', 0.3, 0.2, 700, 1200, 500],
    ['', 'Híbrido', 0.2, 0.2, 700, 700, 0],
    [''], [''],
    ['', '', '⋘ Carteira Recomendada FIIs'], // 66
    [''],
    ['', 'Ranking', 'Ativo'], // 68
    radar(1, 'TEST11', 9, 'Carteira FIIs', 110, [0.92, '', '92%', 0.3, 0.25, 200, 210, -0.05, 200, 10, '', 'Tijolo']), // 69
    [''], // 70
  ];
  add('Distribuição e Metas', dm);

  add('Auxiliar_ativos', [['Classe', 'Ticker'],
    linhaAux(2, 'Ações', 'ABCD3', 'Empresa ABCD', 'R$', 20, 10, 18, 25, 'Comprar', 200),
    linhaAux(3, 'Ações', 'EFGH3', 'Empresa EFGH', 'R$', 20, 10, 15, 18, 'Aguardar', 200),
    linhaAux(4, 'FIIs', 'TEST11', 'Fundo Teste', 'R$', 100, 2, 100, 110, 'Comprar', 200),
    linhaAux(5, 'Ações EUA', 'AAA', 'Aaa Corp', 'US$', 10, 2, 8.28, 12, 'Comprar', 20)]);

  const k = (qtd, tipo = 'Compra') => (tipo === 'Venda' ? -qtd : qtd);
  const tx = (t, data, tipo, preco, qtd) => [t, d(data), tipo, preco, qtd, '', '', '', '', '', k(qtd, tipo)];
  add('Transações', [...cab(5), ['Ticker', 'Data', 'Tipo', 'Preço', 'Qtd.', 'Taxa'],
    tx('ABCD3', '2026-08-10', 'Compra', 18, 10), tx('EFGH3', '2026-08-11', 'Compra', 15, 10), tx('TEST11', '2026-08-12', 'Compra', 100, 2)]);
  add('Transações - USA', [...cab(5), ['Ticker'], tx('AAA', '2026-04-09', 'Compra', 8.28, 2)]);
  add('Transações Renda Fixa', [...cab(5), ['Produto', 'Data', 'Movimentação', 'Entrada/Saída', 'Instituição', 'Quantidade', 'Preço', 'Valor'],
    ['Tesouro Selic 2029', d('2025-01-06'), 'Compra', 'Credito', 'XP INVESTIMENTOS CCTVM S/A.', 0.1, 15000, 1500]]);
  add('Proventos', [...cab(6), ['Data Com']]);
  add('Proventos - USA', [...cab(6), ['Data Com']]);
  add('Carteira Renda Fixa', [...cab(7), ['Código', 'Marca', 'Nome', 'Tipo', 'Indexador', 'Instituição', 'Quantidade', 'PU', 'Valor Investido', 'Emissão', 'Vencimento', 'Valor Atualizado'],
    ['BRSTN0001', 'Renda Emergencial', '\t\nTesouro Selic 2029', 'Tesouro Selic (LFT)', 'SELIC', 'XP INVESTIMENTOS CCTVM S/A.', 0.1, '', 1500, '', d('2029-03-01'), 1600, { r1c1: '=R[0]C[-1]', v: 1 }],
    ['', '', '', '', '', '', '', '', '', '', '', '', { r1c1: '=R[0]C[-1]', v: 0 }]]);
  add('RF Contratada - Resumo', [['Título', 'Instituição', 'Índice', 'Lotes', 'Valor', 'Spread', 'Texto'],
    ['Tesouro IPCA+ 2035', 'XP INVESTIMENTOS CCTVM S/A.', 'IPCA', 1, 1000, 0.065, 'IPCA + 6,5%']]);
  add('RF Contratada - Lotes', [['Título']]);

  const hist = [['Data', 'Ticker', 'Classe', 'Cotas', 'Preço', 'Valor', 'Câmbio', 'Valor BRL']];
  DIAS_UTEIS.forEach((dia) => {
    hist.push([d(dia, 16, 56), 'ABCD3', 'BR', 10, 20, 200, '', 200]);
    hist.push([d(dia, 16, 56), 'EFGH3', 'BR', 10, 20, 200, '', 200]);
    hist.push([d(dia, 16, 0), 'AAA', 'USA', 2, 10, 20, 5, 100]);
  });
  add('aux_historico-patrimonio', hist);
  add('aux_historico-renda-fixa', [['Data', 'Produto', 'Instituição', 'Indexador', 'Classificação', 'Valor'], [d('2026-09-25'), 'Tesouro Selic 2029', 'XP', 'SELIC', 'Renda Emergencial', 1690]]);
  add('aux_historico-indices', [['Data', 'Índice', 'Valor']]);
  add('Registro de Controle', [['Timestamp', 'Origem', 'Status', 'Detalhe']]);

  // o que a planilha de verdade faz sozinha: coluna K (qtd com sinal) de cada linha de transação
  const recalcularK = () => ['Transações', 'Transações - USA'].forEach((n) => {
    const aba = ss.aba(n);
    for (let r = 7; r <= aba.getLastRow(); r += 1) {
      const t = aba.valores(r);
      if (t[0]) aba.c(r, 11).v = /venda/i.test(t[2]) ? -Number(t[4]) : Number(t[4]);
    }
  });
  // GOOGLEFINANCE falso: preço fixo por ticker em todo dia útil do intervalo
  const precosFalsos = { NOVO3: 8, ABCD3: 20, EFGH3: 20, AAA: 10, 'CURRENCY:USDBRL': 5 };
  ctx.buscas = [];
  sb.buscarPrecoHistorico_ = (ticker, classe, inicio, fim) => {
    ctx.buscas.push([ticker, iso(inicio), iso(fim)]);
    const precos = [];
    for (let dt = new sb.Date(inicio.getTime()); dt <= fim; dt = new sb.Date(dt.getTime() + 86400000)) {
      if (dt.getDay() === 0 || dt.getDay() === 6) continue;
      precos.push({ data: new sb.Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), classe === 'USA' ? 16 : 16, classe === 'USA' ? 0 : 56), preco: precosFalsos[ticker] || 1 });
    }
    return { precos, completo: true, lacunas: [] };
  };
  ctx.backfillsRf = 0;
  sb.executarBackfillRendaFixa_ = () => { ctx.backfillsRf += 1; return { linhasGravadas: 7 }; };
  sb.classesDaCarteiraParaProventos_ = () => ({ ABCD3: 'acoes', EFGH3: 'acoes', TEST11: 'fiis', AAA: 'acoesEua', NOVO3: 'acoes' });
  sb.mapasDoPatrimonioParaProventos_ = () => ({ mapaCambioUsd: { '2026-04-01': 5 } });
  sb.cambioUsdParaData_ = () => 5;
  return { ss, ...ctx, d, recalcularK };
}

const histDe = (ss, ticker) => {
  const aba = ss.aba('aux_historico-patrimonio');
  const out = [];
  for (let r = 2; r <= aba.getLastRow(); r += 1) {
    const l = aba.valores(r);
    if (l[1] === ticker) out.push({ dia: iso(l[0]), cotas: l[3], preco: l[4], valor: l[5], cambio: l[6], brl: l[7] });
  }
  return out;
};

test('Planilha.gs: blocos da Distribuição e Metas achados pelo rótulo (e quando uma linha entra no Radar)', () => {
  const { ss, sb } = montar();
  const dm = ss.aba('Distribuição e Metas');
  assert.deepEqual(plain(sb.localDistribuicaoMetas_(dm)), { radarAcoes: 41, radarUsa: 53, radarFiis: 69, dolar: 'K50', linkUsa: 'C51', linkFiis: 'C66', objetivosFiis: 61 });
  assert.equal(sb.cotacaoDolarHoje_(ss), 5.2);
  dm.insertRowBefore(42);
  sb.esquecerLocalDistribuicaoMetas_();
  assert.deepEqual(plain(sb.localDistribuicaoMetas_(dm)), { radarAcoes: 41, radarUsa: 54, radarFiis: 70, dolar: 'K51', linkUsa: 'C52', linkFiis: 'C67', objetivosFiis: 62 });
  assert.equal(sb.cotacaoDolarHoje_(ss), 5.2, 'o dólar desceu uma linha e continua sendo achado');
  sb._listasTickersCarregadas_ = false;
  sb.carregarListasTickersDaPlanilha_(ss);
  assert.ok(sb.TICKERS_BR.includes('ABCD3') && sb.TICKERS_USA.includes('AAA'), 'tickers de Auxiliar_ativos entram na sincronização');
});

test('NovoAtivo.gs: confere, simula, cadastra nas 3 abas com as fórmulas certas e desfaz', () => {
  const { ss, sb, props } = montar();
  const info = plain(sb.infoNovoAtivo_('acoes', 'abcd3'));
  assert.deepEqual(info.existe, ['Carteira Ações', 'Auxiliar_ativos', 'Radar de oportunidades']);
  assert.deepEqual(info.opcoes.tipoCarteira, ['Dividendos']);
  assert.deepEqual(info.opcoes.setor, ['Bancos', 'Energia']);
  assert.equal(plain(sb.infoNovoAtivo_('acoes', 'NOVO3F')).ticker, 'NOVO3', 'fracionário vira o ticker cheio');
  assert.throws(() => sb.adicionarAtivo_({ classe: 'acoes', ticker: 'NOVO3', nome: 'Nova' }), /preço-teto/);
  assert.throws(() => sb.adicionarAtivo_({ classe: 'fiis', ticker: 'NOVO3', nome: 'Nova', precoTeto: 1 }), /ticker inválido/);
  assert.throws(() => sb.adicionarAtivo_({ classe: 'acoes', ticker: 'ABCD3', nome: 'X', precoTeto: 1 }), /já está cadastrado/);

  const dados = { classe: 'acoes', ticker: 'novo3', nome: 'Nova Empresa', setor: 'Saúde', precoTeto: 9.5, percentualDesejado: 0.05 };
  const plano = plain(sb.adicionarAtivo_(dados, { simular: true }));
  assert.deepEqual(plano, { ticker: 'NOVO3', classe: 'acoes', carteira: { aba: 'Carteira Ações', linha: 12, modelo: 11 }, radar: { linha: 42, modelo: 43, ranking: 3 }, auxiliar: { linha: 6, modelo: 3 } });
  assert.equal(ss.aba('Carteira Ações').getLastRow(), 11, 'simular não escreve nada');

  const r = plain(sb.adicionarAtivo_(dados));
  const ca = ss.aba('Carteira Ações');
  assert.deepEqual(ca.valores(12).slice(0, 6), ['NOVO3', 'Nova Empresa', 'Dividendos', 'Saúde', '', '']);
  assert.equal(ca.peek(12, 7).r1c1, '=SUMIF(Transações!C1,RC1,Transações!C11)', 'fórmulas da linha de cima (R1C1 = mesmo "copiar e colar")');
  assert.equal(ca.peek(12, 9).r1c1, '=RC[-2]*RC[-1]');

  const dm = ss.aba('Distribuição e Metas');
  assert.deepEqual(dm.valores(42).slice(1, 5), [3, 'NOVO3', '', 9.5]);
  assert.equal(dm.peek(42, 4).r1c1, "='Carteira Ações'!R12C8", 'a cotação do Radar aponta pra linha NOVA da Carteira');
  assert.equal(dm.valor('L42'), 0.05);
  assert.equal(dm.valor('C43'), 'EFGH3', 'o último ativo desceu uma linha');
  assert.equal(dm.valor('K51'), 5.2);

  const aux = ss.aba('Auxiliar_ativos');
  assert.deepEqual(aux.valores(6).slice(0, 2), ['Ações', 'NOVO3']);
  assert.equal(aux.peek(6, 6).f, '=GOOGLEFINANCE(B6)');
  assert.equal(aux.peek(6, 10).f, "=VLOOKUP($B6,'Distribuição e Metas'!C:E,3,0)");
  assert.equal(aux.peek(6, 8).f, '=SUMIF(Transações!A:A,B6,Transações!K:K)', 'só a referência à própria linha muda');
  assert.equal(aux.valor('E6'), 'R$');

  assert.deepEqual(r.consolidacao.ativos, ['NOVO3']);
  assert.ok(props.has('consolidacaoPendente_v1'));
  assert.deepEqual(plain(sb.infoNovoAtivo_('acoes', 'NOVO3')).existe, ['Carteira Ações', 'Auxiliar_ativos', 'Radar de oportunidades']);

  const rem = plain(sb.removerAtivo_('acoes', 'NOVO3'));
  assert.deepEqual(rem.removidas, ['Radar linha 42', 'Auxiliar_ativos linha 6', 'Carteira Ações linha 12']);
  assert.equal(dm.valor('C42'), 'EFGH3');
  assert.equal(ca.getLastRow(), 11);
  assert.equal(aux.getLastRow(), 5);
  assert.throws(() => sb.removerAtivo_('acoes', 'ABCD3'), /tem transações/);
});

test('Consolidacao.gs: pendência junta a menor data por ativo; recalcula só dali pra frente; refaz o ativo com transação anterior ao histórico', () => {
  const { ss, sb, props, recalcularK } = montar();
  sb.marcarConsolidacao_({ ativos: [{ ticker: 'ABCD3', classe: 'BR', desde: '2026-09-23' }], motivo: 'um' });
  sb.marcarConsolidacao_({ ativos: [{ ticker: 'abcd3', classe: 'BR', desde: '2026-09-22' }, { ticker: 'AAA', classe: 'USA', desde: '2026-09-23' }], rf: { desde: '2026-09-20' }, motivo: 'dois' });
  let est = plain(sb.resumoConsolidacao_());
  assert.deepEqual([est.pendente, est.ativos, est.rf, est.motivos.map((m) => m.texto)], [true, ['AAA', 'ABCD3'], true, ['dois', 'um']]);
  assert.equal(JSON.parse(props.get('consolidacaoPendente_v1')).ativos.ABCD3.desde, '2026-09-22');

  // compra nova de ABCD3 em 22/09 e de AAA em 23/09; EFGH3 ganha uma compra ANTIGA (antes do 1º dia do histórico)
  const t = ss.aba('Transações');
  t.getRange(10, 1, 2, 6).setValues([['ABCD3', D(sb, '2026-09-22'), 'Compra', 19.5, 5, ''], ['EFGH3', D(sb, '2026-06-01'), 'Compra', 14, 4, '']]);
  ss.aba('Transações - USA').getRange(8, 1, 1, 6).setValues([['AAA', D(sb, '2026-09-23'), 'Compra', 10, 1, '']]);
  recalcularK();
  sb.marcarConsolidacao_({ ativos: [{ ticker: 'EFGH3', classe: 'BR', desde: '2026-06-01' }] });

  const r1 = plain(sb.consolidar_({}));
  assert.equal(r1.status, 'parcial', 'rodada 1: recalculou e montou o histórico refeito; falta a renda fixa');
  const abcd = histDe(ss, 'ABCD3');
  assert.deepEqual(abcd.map((x) => x.cotas), [10, 10, 10, 10, 10, 10, 15, 15, 15, 15]);
  assert.deepEqual(abcd.slice(-1)[0], { dia: '2026-09-25', cotas: 15, preco: 20, valor: 300, cambio: '', brl: 300 });
  const aaa = histDe(ss, 'AAA');
  assert.deepEqual(aaa.slice(6).map((x) => [x.cotas, x.valor, x.brl]), [[2, 20, 100], [3, 30, 150], [3, 30, 150], [3, 30, 150]], 'EUA: Valor BRL = valor x câmbio do dia já gravado');
  const efgh = histDe(ss, 'EFGH3');
  assert.equal(efgh[0].dia, '2026-06-01', 'EFGH3 refeito do zero a partir da compra antiga');
  assert.equal(efgh.find((x) => x.dia === '2026-06-15').cotas, 4);
  assert.equal(efgh.find((x) => x.dia === '2026-09-25').cotas, 14);
  assert.equal(histDe(ss, 'ABCD3').length, 10, 'os outros ativos não foram mexidos');

  const r2 = plain(sb.consolidar_({}));
  assert.equal(r2.status, 'concluido');
  assert.equal(r2.consolidacao.pendente, false);
  assert.ok(!props.has('consolidacaoPendente_v1'), 'pendência apagada');
  est = plain(sb.consolidar_({}));
  assert.match(est.feito[0], /Nada pendente/);
});

test('CarteiraRendaFixaSync.gs: preço do Tesouro do último dia, quantidade/custo PEPS, título novo, zerado só sai na consolidação, linha duplicada não mexe', () => {
  const { ss, sb, d } = montar();
  const precos = plain(sb.precosTesouroDireto_({ textoCsv: CSV_TESOURO }));
  assert.deepEqual(precos['TESOURO SELIC|2029'], { tipo: 'Tesouro Selic', vencimento: '2029-03-01', dataBase: '2026-09-24', taxaCompra: 0.05, taxaVenda: 0.06, puCompra: 17010, puVenda: 17000 });
  assert.equal(Object.keys(precos).length, 3, 'só o último dia publicado');
  assert.equal(sb.chaveTesouro_('\t\nTesouro IPCA+ com Juros Semestrais 2035'), 'TESOURO IPCA+ COM JUROS SEMESTRAIS|2035');

  const rf = ss.aba('Transações Renda Fixa');
  rf.getRange(8, 1, 3, 8).setValues([
    ['Tesouro IPCA+ 2035', d('2026-09-22'), 'Compra', 'Credito', 'XP INVESTIMENTOS CCTVM S/A.', 0.4, 2500, 1000],
    ['Tesouro Selic 2029', d('2026-09-23'), 'Venda', 'Debito', 'XP INVESTIMENTOS CCTVM S/A.', 0.1, 16900, 1690],
    ['LCI - 26I000001', d('2026-09-01'), 'APLICAÇÃO', 'Credito', 'BANCO INTER S/A', 1, 500, 500]]);
  let r = plain(sb.sincronizarCarteiraRendaFixa_({ simular: true }));
  assert.deepEqual(r.novas.map((n) => n.nome).sort(), ['LCI - 26I000001', 'Tesouro IPCA+ 2035']);
  const novaIpca = r.novas.find((n) => n.nome === 'Tesouro IPCA+ 2035');
  assert.deepEqual(novaIpca.valores.slice(0, 9), ['Tesouro IPCA+ 2035', 'Renda Fixa', 'Tesouro IPCA+ 2035', 'Tesouro IPCA+', 'IPCA', 'XP INVESTIMENTOS CCTVM S/A.', 0.4, '', 1000]);
  assert.equal(novaIpca.valores[11], 1040, '0,4 x PU de venda 2.600');
  assert.match(r.avisos.join(' | '), /Tesouro Selic 2029 está zerado/);
  assert.equal(r.removidas.length, 0, 'sem opcoes.remover (gatilho diário) nunca apaga');

  r = plain(sb.sincronizarCarteiraRendaFixa_({ remover: true }));
  const c = ss.aba('Carteira Renda Fixa');
  assert.deepEqual(r.removidas.map((x) => x.nome), ['Tesouro Selic 2029']);
  const linhaIpca = [9, 10].find((l) => c.valores(l)[2] === 'Tesouro IPCA+ 2035');
  const linhaLci = [9, 10].find((l) => c.valores(l)[2] === 'LCI - 26I000001');
  assert.deepEqual(c.valores(linhaIpca).slice(0, 7), ['Tesouro IPCA+ 2035', 'Renda Fixa', 'Tesouro IPCA+ 2035', 'Tesouro IPCA+', 'IPCA', 'XP INVESTIMENTOS CCTVM S/A.', 0.4]);
  assert.equal(iso(c.valores(linhaIpca)[10]), '2035-05-15', 'vencimento do CSV');
  assert.deepEqual(c.valores(linhaLci).slice(3, 9), ['LCI / LCA Pós-fixada', 'CDI', 'BANCO INTER S/A', '', '', 500], 'LCI: sem quantidade, instituição como nas Transações');
  assert.equal(c.peek(9, 13).r1c1, '=R[0]C[-1]', 'a linha nova ficou com as fórmulas do fim da tabela');

  // duas linhas do mesmo título na mesma instituição: não divide sozinho
  c.getRange(11, 1, 1, 12).setValues([['X', 'Renda Emergencial', 'Tesouro IPCA+ 2035', 'Tesouro IPCA+', 'IPCA', 'XP INVESTIMENTOS CCTVM S/A.', 0.1, '', 250, '', '', 260]]);
  r = plain(sb.sincronizarCarteiraRendaFixa_({}));
  assert.match(r.avisos.join(' | '), /mais de uma linha/);
  assert.equal(c.valores(11)[6], 0.1);
});

test('Fluxo inteiro: cadastra ativo -> aporte -> conclui -> importa extrato -> Consolidação necessária -> consolida -> tudo atualizado', () => {
  const { ss, sb, registro, recalcularK, buscas, cache } = montar();
  // 1. ativo novo
  sb.adicionarAtivo_({ classe: 'acoes', ticker: 'NOVO3', nome: 'Nova Empresa', setor: 'Saúde', precoTeto: 9.5, percentualDesejado: 0.05 });
  // 2. carrinho -> aguardando -> concluído
  const id = sb.salvarAporte_({ data: '2026-09-22', status: 'aguardando', itens: [
    { classe: 'acoes', ativo: 'ABCD3', qtdPlanejada: 5, precoPlanejado: 20, valorPlanejado: 100 },
    { classe: 'acoes', ativo: 'NOVO3', qtdPlanejada: 10, precoPlanejado: 8, valorPlanejado: 80 },
    { classe: 'rendaFixa', ativo: 'Tesouro IPCA+ 2035', instituicao: 'XP INVESTIMENTOS CCTVM S/A.', valorPlanejado: 1000 }] });
  sb.salvarAporte_({ id, data: '2026-09-22', status: 'concluido', itens: [
    { classe: 'acoes', ativo: 'ABCD3', qtdPlanejada: 5, precoPlanejado: 20, valorPlanejado: 100, qtdFinal: 5, precoFinal: 19.5, valorFinal: 97.5 },
    { classe: 'acoes', ativo: 'NOVO3', qtdPlanejada: 10, precoPlanejado: 8, valorPlanejado: 80, qtdFinal: 10, precoFinal: 8, valorFinal: 80 },
    { classe: 'rendaFixa', ativo: 'Tesouro IPCA+ 2035', instituicao: 'XP INVESTIMENTOS CCTVM S/A.', valorPlanejado: 1000, valorFinal: 1000 }] });
  assert.equal(plain(sb.lerAportes_(ss))[0].status, 'concluido');

  // 3. extrato do dia seguinte (o que lancamentos-parse.js tira da B3)
  const itens = [
    { destino: 'transacoes', ticker: 'ABCD3', data: '2026-09-22', tipo: 'Compra', preco: 19.5, qtd: 5, taxa: 0 },
    { destino: 'transacoes', ticker: 'NOVO3', data: '2026-09-22', tipo: 'Compra', preco: 8, qtd: 10, taxa: 0 },
    { destino: 'transacoes', ticker: 'ABCD3', data: '2026-08-10', tipo: 'Compra', preco: 18, qtd: 10, taxa: 0 },
    { destino: 'transacoes', ticker: 'ZZZZ3', data: '2026-09-22', tipo: 'Compra', preco: 1, qtd: 1, taxa: 0 },
    { destino: 'rendaFixa', produto: 'Tesouro IPCA+ 2035', data: '2026-09-22', movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: 'XP INVESTIMENTOS CCTVM S/A.', qtd: 0.4, preco: 2500, valor: 1000 },
  ];
  const sim = plain(sb.importarLancamentos_(itens, { simular: true }));
  assert.deepEqual(sim.itens.map((c) => c.situacao), ['novo', 'novo', 'lancado', 'bloqueado', 'novo']);
  assert.match(sim.itens[3].motivo, /Adicionar ativo/);
  const gr = plain(sb.importarLancamentos_(itens.filter((_, i) => i !== 3), { simular: false, origem: 'Teste' }));
  assert.deepEqual(gr.gravados, { transacoes: 2, rendaFixa: 1 });
  recalcularK();

  // 4. aviso de consolidação
  const pend = plain(sb.resumoConsolidacao_());
  assert.deepEqual([pend.pendente, pend.ativos, pend.rf], [true, ['ABCD3', 'NOVO3'], true]);
  assert.deepEqual(pend.motivos.map((m) => m.texto), ['Teste: 2 transação(ões) de ABCD3, NOVO3 e 1 movimentação(ões) de Renda Fixa', 'Ativo novo: NOVO3']);
  assert.deepEqual(gr.consolidacao.ativos, pend.ativos, 'a resposta da importação já leva o aviso pro site');

  // 5. consolida em rodadas (como o botão faz)
  const rodadas = [];
  let r;
  do { r = plain(sb.consolidar_({})); rodadas.push(r); } while (r.continuar && rodadas.length < 5);
  assert.equal(r.status, 'concluido');
  assert.equal(rodadas.length, 2, 'rodada 1: histórico + preços do ativo novo; rodada 2: renda fixa');
  assert.deepEqual(buscas, [['NOVO3', '2026-09-22', '2026-09-25']], 'só o ativo novo foi ao GOOGLEFINANCE, e só desde a 1ª compra');
  assert.deepEqual(histDe(ss, 'NOVO3').map((x) => [x.dia, x.cotas, x.valor]), [['2026-09-22', 10, 80], ['2026-09-23', 10, 80], ['2026-09-24', 10, 80], ['2026-09-25', 10, 80]]);
  assert.deepEqual(histDe(ss, 'ABCD3').map((x) => x.cotas), [10, 10, 10, 10, 10, 10, 15, 15, 15, 15]);
  assert.deepEqual(histDe(ss, 'EFGH3').map((x) => x.cotas), Array(10).fill(10), 'quem não teve transação nova ficou igual');

  const c = ss.aba('Carteira Renda Fixa');
  assert.deepEqual([c.valores(9)[6], c.valores(9)[8], c.valores(9)[11]], [0.1, 1500, 1700], 'Selic 2029: 0,1 x 17.000');
  assert.deepEqual([c.valores(10)[2], c.valores(10)[6], c.valores(10)[8], c.valores(10)[11]], ['Tesouro IPCA+ 2035', 0.4, 1000, 1040]);
  const ultimo = registro[registro.length - 1];
  assert.equal(ultimo[1], 'Consolidação');
  assert.match(ultimo[2], /Histórico do patrimônio: 4 dia\(s\) recalculado\(s\) em ABCD3/);
  assert.match(ultimo[2], /Carteira Renda Fixa: 1 título\(s\) atualizado\(s\), 1 novo\(s\)/);
  assert.ok([...cache.keys()].some((k) => k === 'tesouro_precos_v1'), 'preços do Tesouro ficam em cache');

  // 6. a tela de aportes enxerga tudo, com o "momento de aporte"
  const tela = plain(sb.montarTelaTransacoes_());
  const novo = tela.classes.acoes.find((a) => a.ticker === 'NOVO3');
  assert.ok(novo, 'ativo novo na prateleira');
  const abcd = tela.classes.acoes.find((a) => a.ticker === 'ABCD3');
  assert.deepEqual(abcd.radar, { ranking: 1, pvp: 1.2, pl: 6, descontoPl: '15% (2% acima - retorno em 6 anos)', percentualDesejado: 0.1, percentualAtual: 0.05, valorInvestir: 800, tipo: null });
  assert.deepEqual(tela.metas.acoes, { desejado: 0.6, atual: 0.64, carteiraAtual: 3500, novaCarteira: 3500, valorInvestir: 0 });
  assert.deepEqual(tela.metas.reserva, { gastoMensal: 5000, meses: 6, alvo: 30000 });
  assert.equal(tela.classes.fiis[0].radar.tipo, 'Tijolo');
  const ipca = tela.classes.rendaFixa.find((t) => t.titulo === 'Tesouro IPCA+ 2035');
  assert.deepEqual(ipca.taxaHoje, { taxa: 0.0762, pu: 2610, data: '2026-09-24' });
  assert.equal(ipca.taxaContratada.taxa, 0.065);
  const m = momentoAporte(abcd, 'acoes', tela.metas, tela.hoje);
  assert.equal(m.nivel, 'bom');
  assert.match(m.sinais[0].texto, /Abaixo do preço-teto/);
  const mi = momentoAporte(ipca, 'rendaFixa', tela.metas, tela.hoje);
  assert.match(mi.sinais.map((s) => s.texto).join(' | '), /Taxa de hoje \(IPCA \+ 7,62%\) maior que a sua média \(IPCA \+ 6,50%\)/);
  const efgh = tela.classes.acoes.find((a) => a.ticker === 'EFGH3');
  assert.equal(momentoAporte(efgh, 'acoes', tela.metas, tela.hoje).nivel, 'esperar', 'acima do teto e acima da meta');
});

test('Consolidacao.gs: "Recalcular histórico" (tudo=1) conserta dias gravados com quantidade errada, sem buscar preço', () => {
  const { ss, sb, props, buscas } = montar();
  // o dia 17/09 de EFGH3 ficou gravado com 7 cotas (transação corrigida depois, direto na planilha)
  const aba = ss.aba('aux_historico-patrimonio');
  for (let r = 2; r <= aba.getLastRow(); r += 1) {
    const l = aba.valores(r);
    if (l[1] === 'EFGH3' && iso(l[0]) === '2026-09-17') { aba.c(r, 4).v = 7; aba.c(r, 6).v = 140; aba.c(r, 8).v = 140; }
  }
  const resp = sb.handleConsolidar({ parameter: { tudo: '1' } });
  assert.equal(resp.ok, true);
  const est = JSON.parse(props.get('consolidacaoPendente_v1') || '{}');
  assert.deepEqual(Object.keys(est.ativos || {}), [], 'rodada 1 já recalculou todos');
  assert.match(resp.resultado.feito[0], /1 dia\(s\) recalculado\(s\) em ABCD3, EFGH3, AAA/);
  assert.deepEqual(histDe(ss, 'EFGH3').map((x) => x.cotas), Array(10).fill(10));
  assert.deepEqual(buscas, [], 'nada de GOOGLEFINANCE');
  const r2 = plain(sb.consolidar_({}));
  assert.equal(r2.status, 'concluido', 'rodada 2: renda fixa');
});

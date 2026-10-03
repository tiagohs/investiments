// tests/harness/fundamentos.test.js
//
// 03/10/2026: Fundamentos.gs (Tiago: "Tenha um largo banco de dados de
// critérios, para no site ser dinâmico as decisões e análises"). Testa os
// parsers de cada fonte com trechos INVENTADOS que imitam o formato real
// (conferido com curl em 03/10/2026: Fundamentus, Yahoo chart/timeseries,
// SEC companyfacts, CSVs da CVM), a sanidade, a coleta inteira com
// UrlFetchApp FALSO (cache 1x/dia, limite de tempo, retomada) e a leitura do
// contrato (resposta.fundamentos / Radar) - inclusive passando pelo motor de
// critérios do front. Nenhum dado real do Tiago.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';
import { avaliarAtivo } from '../../assets/js/criterios/motor.js';

const AGORA = new Date('2026-10-03T15:00:00Z'); // 12h de SP

/** Página de detalhes no formato do Fundamentus (célula label com o "?" de ajuda + célula data). */
function paginaFundamentus(pares) {
  const tds = pares.map(([r, v]) => (r === null
    ? `<td class="label"><span class="txt">${v}</span></td><td class="data"><span class="oscil"><font color="#306EFF">1,0%</font></span></td>`
    : `<td class="label w15"><span class="help tips" title="ajuda">?</span><span class="txt">${r}</span></td>\n<td class="data w35"><span class="txt">${v}</span></td>`));
  return `<html><head><title>FUNDAMENTUS - X</title></head><body><table class="w728"><tr>${tds.join('</tr><tr>')}</tr></table></body></html>`;
}

const PARES_ACAO = [
  ['Papel', 'ZZZZ3'], ['Cotação', '12,50'], ['Tipo', 'ON NM'], ['Data últ cot', '02/10/2026'], ['Empresa', 'ZETA ENERGIA ON'],
  ['Min 52 sem', '9,80'], ['Setor', 'Energia Elétrica'], ['Max 52 sem', '15,20'], ['Subsetor', 'Energia Elétrica'],
  ['Vol $ méd (2m)', '35.400.000'], ['Valor de mercado', '10.000.000.000'], ['Últ balanço processado', '30/06/2026'],
  ['Valor da firma', '14.000.000.000'], ['Nro. Ações', '800.000.000'], [null, 'Dia'],
  ['P/L', '8,00'], ['LPA', '1,56'], ['P/VP', '1,25'], ['VPA', '10,00'], ['P/EBIT', '6,67'], ['Marg. Bruta', '40,0%'],
  ['PSR', '2,00'], ['Marg. EBIT', '30,0%'], ['Marg. Líquida', '25,0%'], ['Div. Yield', '6,4%'], ['ROE', '15,6%'],
  ['EV / EBITDA', '7,00'], ['Liquidez Corr', '1,50'], ['EV / EBIT', '9,33'], ['Dív Líq / Patrim', '0,50'],
  ['Cres. Rec (5a)', '8,2%'], ['ROIC', '-'], ['Ativo', '20.000.000.000'], ['Dív. Bruta', '5.000.000.000'],
  ['Dív. Líquida', '4.000.000.000'], ['Patrim. Líq', '8.000.000.000'],
  ['Receita Líquida', '5.000.000.000'], ['Receita Líquida', '1.300.000.000'], ['EBIT', '1.500.000.000'], ['EBIT', '390.000.000'],
  ['Lucro Líquido', '1.250.000.000'], ['Lucro Líquido', '300.000.000'],
];
const PARES_BANCO = [
  ['Papel', 'BANC3'], ['Cotação', '20,00'], ['Setor', 'Intermediários Financeiros'], ['Subsetor', 'Bancos'],
  ['Valor da firma', '-'], ['P/L', '7,00'], ['P/VP', '0,90'], ['Marg. Bruta', '-'], ['Marg. Líquida', '0,0%'], ['EV / EBITDA', '-'],
  ['ROE', '13,0%'], ['Div. Yield', '8,0%'], ['LPA', '2,86'], ['Ativo', '1.000.000.000.000'], ['Result Int Financ', '50.000.000.000'],
  ['Lucro Líquido', '10.000.000.000'], ['Patrim. Líq', '80.000.000.000'],
];
const PARES_FII = [
  ['FII', 'ZZZZ11'], ['Cotação', '95,00'], ['Nome', 'ZETA LOGÍSTICA FII'], ['Mandato', 'Renda'], ['Min 52 sem', '88,00'],
  ['Segmento', 'Logística'], ['Max 52 sem', '101,00'], ['Gestão', 'Ativa'], ['Vol $ méd (2m)', '2.500.000'],
  ['Valor de mercado', '950.000.000'], ['Nro. Cotas', '10.000.000'], ['Relatório', '31/08/2026'], [null, 'Dia'],
  ['FFO Yield', '7,10%'], ['FFO/Cota', '6,74'], ['Div. Yield', '10,1%'], ['Dividendo/cota', '9,60'], ['P/VP', '0,95'], ['VP/Cota', '100,00'],
  ['Receita', '110.000.000'], ['Receita', '28.000.000'], ['FFO', '67.000.000'], ['FFO', '17.000.000'],
  ['Rend. Distribuído', '96.000.000'], ['Rend. Distribuído', '24.000.000'], ['Ativos', '1.050.000.000'],
  ['Patrim Líquido', '1.000.000.000'], ['Qtd imóveis', '12'], ['Cap Rate', '8,5%'], ['Vacância Média', '4,5%'],
];

function paginaProventosAcao(linhas) {
  const trs = linhas.map(([data, valor, tipo, pag, por]) => `<tr class=""><td>${data}</td>\t<td>${valor}</td>\n<td>${tipo}</td>\n<td>${pag}\t</td>\n<td>${por}</td></tr>`);
  return `<table id="resultado"><thead><tr><th>Data</th><th>Valor</th><th>Tipo</th><th>Data de Pagamento</th><th>Por quantas ações</th></tr></thead><tbody>${trs.join('\n')}</tbody></table>`;
}
const PROVENTOS_ACAO = [
  ['10/08/2026', '0,5000', 'DIVIDENDO', '20/12/2026', '1'],
  ['10/03/2026', '0,4000', 'JRS CAP PROPRIO', '20/05/2026', '1'],
  ['10/08/2025', '0,8000', 'DIVIDENDO', '20/09/2025', '1'],
  ['10/03/2025', '0,2000', 'JRS CAP PROPRIO', '20/05/2025', '1'],
  ['10/05/2024', '0,9000', 'DIVIDENDO', '20/06/2024', '1'],
  ['10/05/2023', '0,7000', 'DIVIDENDO', '20/06/2023', '1'],
  ['10/05/2022', '1,0000', 'DIVIDENDO', '20/06/2022', '1'],
  ['10/04/2021', '50,0000', 'DIVIDENDO', '20/06/2021', '100'],
];
function paginaProventosFii(linhas) {
  const trs = linhas.map(([data, valor]) => `<tr class=""><td>${data}</td><td>Rendimento</td><td>${data}</td><td>${valor}</td></tr>`);
  return `<table id="resultado"><thead><tr><th>Última Data Com</th><th>Tipo</th><th>Data de Pagamento</th><th>Valor</th></tr></thead><tbody>${trs.join('')}</tbody></table>`;
}

// --- CVM: CSVs ";" como os de dados.cvm.gov.br (valores inventados) --------
const CNPJ_FII = '12.345.678/0001-90';
const csv = (cab, linhas) => [cab.join(';'), ...linhas.map((l) => l.join(';'))].join('\r\n');
const MENSAL_COMP = csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Total_Numero_Cotistas', 'Patrimonio_Liquido', 'Valor_Patrimonial_Cotas', 'Percentual_Despesas_Taxa_Administracao'],
  [
    ['99.999.999/0001-99', '2026-08-01', '1', '10', '100', '10', '0.001'],
    [CNPJ_FII, '2026-07-01', '1', '40000', '990000000', '99.0', '0.0008'],
    [CNPJ_FII, '2026-08-01', '1', '41000', '1000000000', '100.5', '0.0008'],
    [CNPJ_FII, '2026-08-01', '2', '42000', '1000000000', '100.0', '0.0008'], // versão 2 substitui a 1
  ],
);
const MENSAL_AP = csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Total_Necessidades_Liquidez', 'Rendimentos_Distribuir', 'Taxa_Administracao_Pagar', 'Taxa_Performance_Pagar', 'Total_Passivo'],
  [[CNPJ_FII, '2026-08-01', '2', '50000000', '8000000', '1000000', '0', '109000000']],
);
const MENSAL_GERAL = csv(
  ['Tipo_Fundo_Classe', 'CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Nome_Fundo_Classe', 'Mandato', 'Segmento_Atuacao', 'Tipo_Gestao', 'Mercado_Negociacao_Bolsa'],
  [['Classe', CNPJ_FII, '2026-08-01', '2', '"ZETA; LOGISTICA FII"', 'Renda', 'Logística', 'Ativa', 'S']],
);
const MENSAL_2025 = csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Total_Numero_Cotistas', 'Patrimonio_Liquido', 'Valor_Patrimonial_Cotas', 'Percentual_Despesas_Taxa_Administracao'],
  [[CNPJ_FII, '2025-08-01', '1', '35000', '950000000', '95.0', '0.0008']],
);
const TRI_IMOVEL = csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Classe', 'Nome_Imovel', 'Endereco', 'Area', 'Numero_Unidades', 'Outras_Caracteristicas_Relevantes', 'Percentual_Vacancia', 'Percentual_Inadimplencia', 'Percentual_Receitas_FII'],
  [
    [CNPJ_FII, '2026-06-30', '1', 'Imóveis para renda acabados', 'Galpão A', '"Rua X, 1; Cidade"', '30000', '1', '', '0', '0', '0.6'],
    [CNPJ_FII, '2026-06-30', '1', 'Imóveis para renda acabados', 'Galpão B', 'Rua Y', '10000', '1', '', '0.2', '0.05', '0.4'],
    [CNPJ_FII, '2026-06-30', '1', 'Imóveis para renda em construção', 'Galpão C', 'Rua Z', '5000', '1', '', '', '', ''],
    [CNPJ_FII, '2026-03-31', '1', 'Imóveis para renda acabados', 'Antigo', 'Rua W', '1000', '1', '', '1', '1', '1'],
  ],
);
const TRI_RES = csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Total_Receitas_Despesas_Financeiro', 'Resultado_Trimestral_Liquido_Financeiro', 'Resultado_Financeiro_Liquido_Acumulado', 'Rendimentos_Declarados', 'Percentual_Resultado_Financeiro_Liquido_Declarado'],
  [[CNPJ_FII, '2026-06-30', '1', '-2000000', '23000000', '45000000', '48000000', '1.0667']],
);
const TRI_COMP = csv(
  ['CNPJ_Fundo_Classe', 'Data_Referencia', 'Versao', 'Percentual_Vencimento_Receita_FII_Faixa_Ate_3Meses', 'Percentual_Vencimento_Receita_FII_Faixa_3a6Meses', 'Percentual_Vencimento_Receita_FII_Faixa_6a9Meses', 'Percentual_Vencimento_Receita_FII_Faixa_9a12Meses', 'Percentual_Indexador_Receita_FII_IGPM', 'Percentual_Indexador_Receita_FII_IPCA'],
  [[CNPJ_FII, '2026-06-30', '1', '0.02', '0', '0.03', '0.01', '0.25', '0.7']],
);
const FCA_VM = csv(
  ['CNPJ_Companhia', 'Data_Referencia', 'Versao', 'ID_Documento', 'Nome_Empresarial', 'Valor_Mobiliario', 'Sigla_Classe_Acao_Preferencial', 'Classe_Acao_Preferencial', 'Codigo_Negociacao', 'Composicao_BDR_Unit', 'Mercado', 'Sigla_Entidade_Administradora', 'Entidade_Administradora', 'Data_Inicio_Negociacao', 'Data_Fim_Negociacao', 'Segmento'],
  [['11.111.111/0001-11', '2026-01-01', '2', '1', 'ZETA ENERGIA S.A.', 'Ações Ordinárias', '', '', 'ZZZZ3', '', 'Bolsa', 'B3', 'B3', '2010-01-01', '', 'Nível 1 de Governança Corporativa']],
);
const FCA_GERAL = csv(
  ['CNPJ_Companhia', 'Data_Referencia', 'Versao', 'ID_Documento', 'Nome_Empresarial', 'Setor_Atividade', 'Especie_Controle_Acionario'],
  [['11.111.111/0001-11', '2026-01-01', '2', '1', 'ZETA ENERGIA S.A.', 'Energia Elétrica', 'Estatal Holding']],
);

// --- Yahoo / SEC (JSON no formato real, números inventados) ---------------
const ts = (iso) => Math.floor(Date.parse(`${iso}T14:30:00Z`) / 1000);
function yahooChart({ bolsa = 'NYQ', nome = 'NYSE', preco = 50 } = {}) {
  const meses = []; const vols = [];
  for (let i = 0; i < 6; i++) { meses.push(ts(`2026-${String(5 + i).padStart(2, '0')}-01`)); vols.push(i === 5 ? 999 : 2100000); }
  const divs = {};
  [['2026-08-10', 0.5], ['2026-02-10', 0.5], ['2025-08-10', 0.45], ['2025-02-10', 0.45], ['2024-05-10', 0.8], ['2023-05-10', 0.7]]
    .forEach(([d, a]) => { divs[String(ts(d))] = { amount: a, date: ts(d) }; });
  return { chart: { result: [{ meta: { currency: 'USD', exchangeName: bolsa, fullExchangeName: nome, regularMarketPrice: preco, fiftyTwoWeekHigh: 60, fiftyTwoWeekLow: 40 }, timestamp: meses, events: { dividends: divs }, indicators: { quote: [{ volume: vols }] } }], error: null } };
}
function yahooTimeseries(v) {
  return { timeseries: { result: Object.entries(v).map(([tipo, valor]) => ({ meta: { symbol: ['ZZZZ'], type: [tipo] }, timestamp: [1], [tipo]: [{ asOfDate: '2026-03-31', reportedValue: { raw: valor * 0.5 } }, { asOfDate: '2026-06-30', reportedValue: { raw: valor } }, null] })), error: null } };
}
const TS_ZZZZ = {
  trailingPeRatio: 12.5, trailingPbRatio: 2.0, trailingMarketCap: 5000000000, trailingTotalRevenue: 2000000000, trailingNetIncome: 400000000,
  trailingEBITDA: 700000000, trailingEBIT: 500000000, trailingGrossProfit: 900000000, trailingFreeCashFlow: 300000000,
  trailingCashDividendsPaid: -120000000, trailingRepurchaseOfCapitalStock: -80000000, trailingInterestExpense: 100000000, trailingDilutedEPS: 4.0,
  quarterlyStockholdersEquity: 2500000000, quarterlyNetDebt: 1400000000, quarterlyCurrentAssets: 600000000, quarterlyCurrentLiabilities: 400000000,
  quarterlyTotalAssets: 8000000000, quarterlyOrdinarySharesNumber: 100000000,
};
const fy = (ano, val, filed = `${ano + 1}-02-20`) => ({ start: `${ano}-01-01`, end: `${ano}-12-31`, val, fy: ano, fp: 'FY', form: '10-K', filed });
function secFacts() {
  const rec = [2020, 2021, 2022, 2023, 2024, 2025].map((a, i) => fy(a, 1000 * (1.1 ** i)));
  rec.push({ start: '2025-01-01', end: '2025-06-30', val: 500, form: '10-Q', filed: '2025-08-01' });
  rec.push({ start: '2026-01-01', end: '2026-06-30', val: 600, form: '10-Q', filed: '2026-08-01' });
  rec.push({ start: '2026-04-01', end: '2026-06-30', val: 310, form: '10-Q', filed: '2026-08-01' });
  const ll = [fy(2021, -10), fy(2022, 50), fy(2023, 60), fy(2024, 70), fy(2025, 80), fy(2020, 40)];
  ll.push({ start: '2025-01-01', end: '2025-06-30', val: 35, form: '10-Q', filed: '2025-08-01' });
  ll.push({ start: '2026-01-01', end: '2026-06-30', val: 45, form: '10-Q', filed: '2026-08-01' });
  return {
    cik: 123, entityName: 'ZETA CORP',
    facts: { 'us-gaap': {
      Revenues: { units: { USD: rec } },
      NetIncomeLoss: { units: { USD: ll } },
      StockholdersEquity: { units: { USD: [{ end: '2025-12-31', val: 800, filed: '2026-02-20' }, { end: '2026-06-30', val: 900, filed: '2026-08-01' }] } },
      EarningsPerShareDiluted: { units: { 'USD/shares': [fy(2025, 1.2)] } },
    } },
  };
}

// --- sandbox / planilha falsa ---------------------------------------------
function montar({ ativos = null, agora = AGORA } = {}) {
  const ss = planilhaFalsa({
    Auxiliar_ativos: [
      ['Classe', 'Ticker', 'Nome', 'Tipo', 'Moeda', 'Preço Atual', 'Variação dia', 'Quantidade', 'Preço Médio', 'Preço Teto', 'Viés', 'P/VP', 'Desconto P/VP', 'P/L', 'Desconto P/L', 'Setor/Segmento', 'DY (%)'],
      ...(ativos || [
        ['Ações', 'ZZZZ3', 'Zeta Energia', '', 'R$', 12.5, 0, 100, 10, 14, 'Comprar', 1.25, '', 8, '', 'Utilidade Pública', 0.064],
        ['Ações', 'ZZZZ15G', 'Zeta Energia', '', 'R$', 0, 0, 0, 0, 0, '', '', '', '', '', 'Utilidade Pública', ''],
        ['FIIs', 'ZZZZ11', 'Zeta Log', '', 'R$', 95, 0, 10, 90, 100, 'Comprar', 0.95, '', '', '', 'Logística', 0.101],
        ['Ações EUA', 'ZZZZ', 'Zeta Corp', '', 'US$', 50, 0, 2, 40, 60, '', '#DIV/0!', '', 304, '', 'Energia', 0.019],
      ]),
    ],
    'aux_fii-cnpj': [['Ticker', 'CNPJ', 'Origem', 'Atualizado em'], ['ZZZZ11', CNPJ_FII, 'Manual', '']],
  });
  // o RangeFalso do harness não tem setFormulas (plural) - só pra este teste
  const proto = Object.getPrototypeOf(ss.insertSheet('_tmp').getRange(1, 1));
  if (!proto.setFormulas) proto.setFormulas = function (fs2) { fs2.forEach((l, i) => l.forEach((f, j) => { const x = this.aba.c(this.r + i, this.c + j); x.f = f; x.v = ''; })); return this; };
  const chamadas = [];
  const zips = {
    'inf_mensal_fii_2026.zip': { 'inf_mensal_fii_complemento_2026.csv': MENSAL_COMP, 'inf_mensal_fii_ativo_passivo_2026.csv': MENSAL_AP, 'inf_mensal_fii_geral_2026.csv': MENSAL_GERAL },
    'inf_mensal_fii_2025.zip': { 'inf_mensal_fii_complemento_2025.csv': MENSAL_2025 },
    'inf_trimestral_fii_2026.zip': { 'inf_trimestral_fii_imovel_2026.csv': TRI_IMOVEL, 'inf_trimestral_fii_resultado_contabil_financeiro_2026.csv': TRI_RES, 'inf_trimestral_fii_complemento_2026.csv': TRI_COMP, 'inf_trimestral_fii_imovel_desempenho_2026.csv': 'lixo' },
    'fca_cia_aberta_2026.zip': { 'fca_cia_aberta_valor_mobiliario_2026.csv': FCA_VM, 'fca_cia_aberta_geral_2026.csv': FCA_GERAL, 'fca_cia_aberta_dri_2026.csv': 'x' },
  };
  const resp = (code, texto, zip = null) => ({ getResponseCode: () => code, getContentText: () => texto, getBlob: () => ({ zip, setContentType() {} }) });
  const urlFetch = (url) => {
    chamadas.push(url);
    if (/fundamentus.*detalhes\.php\?papel=ZZZZ3/.test(url)) return resp(200, paginaFundamentus(PARES_ACAO));
    if (/fundamentus.*detalhes\.php\?papel=ZZZZ11/.test(url)) return resp(200, paginaFundamentus(PARES_FII));
    if (/fundamentus.*\/proventos\.php\?papel=ZZZZ3/.test(url)) return resp(200, paginaProventosAcao(PROVENTOS_ACAO));
    if (/fundamentus.*fii_proventos\.php\?papel=ZZZZ11/.test(url)) return resp(200, paginaProventosFii([['15/09/2026', '0,80'], ['14/08/2026', '0,80']]));
    if (/dados\.cvm\.gov\.br/.test(url)) { const z = zips[url.replace(/^.*\//, '')]; return z ? resp(200, '', z) : resp(404, 'não achou'); }
    if (/finance\/chart\/ZZZZ\?/.test(url)) return resp(200, JSON.stringify(yahooChart()));
    if (/timeseries\/ZZZZ\?/.test(url)) return resp(200, JSON.stringify(yahooTimeseries(TS_ZZZZ)));
    if (/sec\.gov\/files\/company_tickers\.json/.test(url)) return resp(200, JSON.stringify({ 0: { cik_str: 123, ticker: 'ZZZZ', title: 'ZETA CORP' } }));
    if (/companyfacts\/CIK0000000123\.json/.test(url)) return resp(200, JSON.stringify(secFacts()));
    return resp(404, '');
  };
  const { sb } = sandboxGas(ss, { urlFetch, agora });
  sb.UrlFetchApp.fetch = (url, opcoes) => { if (/sec\.gov/.test(url)) assert.match(opcoes.headers['User-Agent'], /contato@exemplo\.com/, 'SEC exige User-Agent genérico com contato'); return urlFetch(url); };
  sb.Utilities.unzip = (blob) => Object.entries(blob.zip || {}).map(([nome, texto]) => ({ getName: () => nome, getDataAsString: () => texto }));
  return { sb, ss, chamadas };
}

// ---------------------------------------------------------------------------

test('Fundamentos: números pt-BR e de planilha (vírgula decimal, milhar, %, "-", "#DIV/0!")', () => {
  const { sb } = montar();
  assert.equal(sb.fundNumeroBr_('1.279.020.000'), 1279020000);
  assert.equal(sb.fundNumeroBr_('1,37'), 1.37);
  assert.equal(sb.fundNumeroBr_('50,6%'), 0.506);
  assert.equal(sb.fundNumeroBr_('-2,3%'), -0.023);
  assert.equal(sb.fundNumeroBr_('3.481'), 3481, 'ponto com 3 dígitos = milhar');
  assert.equal(sb.fundNumeroBr_('1.37'), 1.37, 'ponto sozinho sem 3 dígitos = decimal');
  assert.equal(sb.fundNumeroBr_('-'), null);
  assert.equal(sb.fundNumeroBr_(''), null);
  assert.equal(sb.fundNumeroBr_('#DIV/0!'), null);
  assert.equal(sb.fundNumero_('2.5E-05'), 0.000025, 'CSV da CVM: notação científica');
  assert.equal(sb.fundNumero_('7815435852.95'), 7815435852.95);
  assert.equal(sb.fundNumero_('#N/A'), null);
  assert.equal(sb.fundNumero_(0.0804), 0.0804);
});

test('Fundamentos: sanidade descarta P/VP > 50, P/L fora de ±200, "#DIV/0!" e % que veio inteiro, com aviso', () => {
  const { sb } = montar();
  const avisos = [];
  const v = sb.fundSanidade_({ pvp: 60, pl: 304, dy: 8.5, roe: 0.2, payout: '#DIV/0!', pl2: 5, x: NaN }, avisos);
  assert.deepEqual(plain(v), { roe: 0.2, pl2: 5 });
  assert.equal(avisos.length, 5);
  assert.ok(avisos.some((a) => /P\/L fora de ±200/.test(a)));
  assert.ok(avisos.some((a) => /#DIV\/0!/.test(a)));
  const v2 = sb.fundSanidade_({ pl: -150, pvp: 31 }, []);
  assert.deepEqual(plain(v2), { pl: -150, pvp: 31 }, 'dentro dos limites do pedido: fica (o motor tem a régua dele)');
});

test('Fundamentus (ação): rótulos -> chaves do contrato, 1ª ocorrência = 12 meses, EBITDA derivado do EV, banco e página vazia', () => {
  const { sb } = montar();
  const c = sb.fundParseFundamentusDetalhes_(paginaFundamentus(PARES_ACAO));
  assert.equal(c['Receita Líquida'], '5.000.000.000');
  assert.equal(c['Receita Líquida (3m)'], '1.300.000.000');
  const v = plain(sb.fundMapearFundamentusAcao_(c));
  assert.equal(v.pl, 8); assert.equal(v.pvp, 1.25); assert.equal(v.dy, 0.064); assert.equal(v.roe, 0.156);
  assert.equal(v.margemLiquida, 0.25); assert.equal(v.cagrReceita5a, 0.082); assert.equal(v.volumeMedio2m, 35400000);
  assert.equal(v.receitaLiquida12m, 5000000000); assert.equal(v.lucroLiquido12m, 1250000000);
  assert.equal(v.ebitda12m, 2000000000, 'valor da firma ÷ EV/EBITDA');
  assert.equal(v.margemEbitda, 0.4); assert.equal(v.dividaLiquidaEbitda, 2); assert.equal(v.roa, 0.0625); assert.equal(v.earningsYield, 0.125);
  assert.equal(v.roic, undefined, '"-" não vira zero');
  assert.equal(v.setor, 'Energia Elétrica');
  const b = plain(sb.fundMapearFundamentusAcao_(sb.fundParseFundamentusDetalhes_(paginaFundamentus(PARES_BANCO))));
  assert.equal(b.margemLiquida, undefined, 'banco: margem "0,0%" não tem sentido');
  assert.equal(b.evEbitda, undefined);
  assert.equal(b.roe, 0.13); assert.equal(b.pl, 7); assert.equal(b.subsetor, 'Bancos');
  assert.equal(sb.fundParseFundamentusDetalhes_('<html><body>Nenhum papel encontrado</body></html>'), null);
});

test('Fundamentus (FII): P/VP, VP/cota, DY, vacância, gestão; segmento só como texto (a régua fica com a planilha)', () => {
  const { sb } = montar();
  const v = plain(sb.fundMapearFundamentusFii_(sb.fundParseFundamentusDetalhes_(paginaFundamentus(PARES_FII))));
  assert.equal(v.pvp, 0.95); assert.equal(v.vpCota, 100); assert.equal(v.dy12m, 0.101); assert.equal(v.rendimentoMedio12m, 0.8);
  assert.equal(v.vacanciaFisica, 0.045); assert.equal(v.numeroImoveis, 12); assert.equal(v.capRate, 0.085);
  assert.equal(v.tipoGestao, 'ativa'); assert.equal(v.liquidezDiaria, 2500000); assert.equal(v.distribuicaoSobreFfo, 1.4328);
  assert.equal(v.segmentoFonte, 'Logística');
  assert.equal(v.segmento, undefined, '"Multicategoria" da fonte não pode sobrescrever o segmento da planilha no motor');
});

test('Fundamentus (proventos): por ação (÷ "por quantas ações"), anos pagando/aumentando até o ano passado, soma 12m', () => {
  const { sb } = montar();
  const lista = plain(sb.fundParseFundamentusProventos_(paginaProventosAcao(PROVENTOS_ACAO)));
  assert.equal(lista.length, 8);
  assert.deepEqual(lista[7], { dataCom: '2021-04-10', valor: 0.5, tipo: 'DIVIDENDO' });
  const r = plain(sb.fundResumoProventos_(lista, '2026-10-03'));
  assert.equal(r.anosPagando, 5, '2025, 2024, 2023, 2022, 2021');
  assert.equal(r.anosAumentando, 2, '2025 > 2024 > 2023, mas 2023 < 2022');
  assert.equal(r.soma12m, 0.9);
  const fii = plain(sb.fundParseFundamentusProventos_(paginaProventosFii([['15/09/2026', '0,81'], ['14/08/2026', '0,80']])));
  assert.deepEqual(fii.map((p) => p.valor), [0.81, 0.8]);
  assert.equal(sb.fundResumoProventos_(fii, '2026-10-03').ultimo, 0.81);
});

test('Yahoo: chart (bolsa OTC/NYSE/NASDAQ, 52s, dividendos, volume 2m) e timeseries (ADR sem LPA/VPA)', () => {
  const { sb } = montar();
  const c = plain(sb.fundMapearYahooChart_(yahooChart({ bolsa: 'PNK', nome: 'OTC Markets OTCPK', preco: 20 }), '2026-10-03'));
  assert.equal(c.bolsa, 'OTC'); assert.equal(c.maxima52s, 60); assert.equal(c.minima52s, 40);
  assert.equal(c.anosPagandoDividendos, 3); assert.equal(c.anosAumentandoDividendos, 2, '0,9 (2025) > 0,8 (2024) > 0,7 (2023)');
  assert.equal(c.dpa12m, 1); assert.equal(c.dy, 0.05);
  assert.equal(c.volumeMedio2m, Math.round((2100000 * 2) / 42 * 20), 'mês corrente (incompleto) fica de fora');
  assert.equal(sb.fundBolsaYahoo_('NMS', 'NasdaqGS'), 'NASDAQ');
  assert.equal(sb.fundBolsaYahoo_('NYQ', 'NYSE'), 'NYSE');
  assert.throws(() => sb.fundMapearYahooChart_({ chart: { result: null, error: { description: 'No data found' } } }, '2026-10-03'), /No data found/);
  const t = plain(sb.fundMapearYahooTimeseries_(yahooTimeseries(TS_ZZZZ), null));
  assert.equal(t.pl, 12.5, 'usa o ponto mais recente'); assert.equal(t.pvp, 2); assert.equal(t.roe, 0.16); assert.equal(t.margemBruta, 0.45);
  assert.equal(t.margemEbit, 0.25); assert.equal(t.dividaLiquidaEbitda, 2); assert.equal(t.coberturaJuros, 5); assert.equal(t.liquidezCorrente, 1.5);
  assert.equal(t.dividendosPagos12m, 120000000); assert.equal(t.recompras12m, 80000000); assert.equal(t.payout, 0.3); assert.equal(t.fcfYield, 0.06);
  assert.equal(t.lpa, 4); assert.equal(t.vpa, 25);
  const adr = plain(sb.fundMapearYahooTimeseries_(yahooTimeseries(TS_ZZZZ), { adr: true }));
  assert.equal(adr.lpa, undefined, 'ADR: LPA é por ação ordinária, não por ADR');
  assert.equal(adr.vpa, undefined);
  assert.equal(adr.pl, 12.5, 'a razão do Yahoo já é por ADR');
});

test('SEC companyfacts: últimos 12 meses (anual + acumulado do ano - acumulado do ano passado), CAGR 5a, anos com lucro', () => {
  const { sb } = montar();
  const r = plain(sb.fundMapearSec_(secFacts(), '2026-10-03'));
  const rec2025 = 1000 * 1.1 ** 5;
  assert.ok(Math.abs(r.valores.receitaLiquida12m - (rec2025 + 600 - 500)) < 1e-6, 'TTM = 2025 + 1º sem/26 - 1º sem/25');
  assert.equal(r.valores.lucroLiquido12m, 90);
  assert.equal(r.valores.roe, 0.1, 'lucro TTM ÷ patrimônio mais recente');
  assert.equal(r.valores.cagrReceita5a, 0.1);
  assert.equal(r.valores.cagrLucro5a, 0.1487, '(80/40)^(1/5) - 1');
  assert.equal(r.valores.anosComLucro, 4, 'dos últimos 5 anos, 2021 deu prejuízo');
  assert.equal(r.dataRef, '2026-06-30');
  assert.deepEqual(plain(sb.fundMapaCiksSec_({ 0: { cik_str: 320193, ticker: 'aapl' } })), { AAPL: 320193 });
});

test('CVM: CSV com aspas e ";" dentro, só as linhas dos CNPJs pedidos, maior versão por mês', () => {
  const { sb } = montar();
  const linhas = plain(sb.fundFiltrarCsv_(MENSAL_GERAL, [CNPJ_FII]));
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].Nome_Fundo_Classe, 'ZETA; LOGISTICA FII');
  assert.deepEqual(plain(sb.fundLinhaCsv_('a;"b;""c""";d')), ['a', 'b;"c"', 'd']);
  const comp = sb.fundFiltrarCsv_(MENSAL_COMP, [CNPJ_FII]);
  const vers = plain(sb.fundUltimasVersoesCvm_(comp, CNPJ_FII));
  assert.deepEqual(vers.map((x) => [x.data, x.linhas[0].Versao]), [['2026-07-01', '1'], ['2026-08-01', '2']]);
  assert.equal(sb.fundCnpjCvm_('12345678000190'), CNPJ_FII);
});

test('CVM (FII): cotistas, VP/cota mês a mês, taxa de adm. a.a., caixa, alavancagem, vacância por área, inadimplência por receita, resultado', () => {
  const { sb } = montar();
  const f = (t) => sb.fundFiltrarCsv_(t, [CNPJ_FII]);
  const mensal = { inf_mensal_fii_complemento: f(MENSAL_COMP).concat(f(MENSAL_2025)), inf_mensal_fii_ativo_passivo: f(MENSAL_AP), inf_mensal_fii_geral: f(MENSAL_GERAL) };
  const tri = { inf_trimestral_fii_imovel: f(TRI_IMOVEL), inf_trimestral_fii_resultado_contabil_financeiro: f(TRI_RES), inf_trimestral_fii_complemento: f(TRI_COMP) };
  const r = plain(sb.fundMapearCvmFii_(mensal, tri, CNPJ_FII));
  const v = r.valores;
  assert.equal(v.numeroCotistas, 42000, 'versão 2 do mês');
  assert.equal(v.vpCota, 100);
  assert.deepEqual(r.historico.vpCota, [{ data: '2025-08', valor: 95 }, { data: '2026-07', valor: 99 }, { data: '2026-08', valor: 100 }]);
  assert.equal(v.taxaAdministracao, 0.0096, '0,08% ao mês -> 0,96% ao ano');
  assert.equal(v.pctCaixa, 0.05);
  assert.equal(v.alavancagem, 0.1, '(109 - 8 de rendimentos - 1 de taxa) ÷ 1.000');
  assert.equal(v.numeroImoveis, 3, 'só o trimestre mais recente');
  assert.equal(v.vacanciaFisica, 0.05, 'ponderada pela área: 10 mil m² de 40 mil a 20%');
  assert.equal(v.inadimplencia, 0.02, 'ponderada pela receita: 40% x 5%');
  assert.equal(v.distribuicaoSobreResultado, 1.0667);
  assert.equal(v.resultadoAcumulado, -3000000, 'distribuiu 3 mi a mais do que gerou no semestre');
  assert.equal(v.custoRelativo, 0.08, '2 de despesas ÷ 25 de receitas');
  assert.equal(v.vencimentos12mPct, 0.06);
  assert.equal(v.indexadorPrincipal, 'ipca');
  assert.equal(v.tipoGestao, 'ativa'); assert.equal(v.isencaoIr, true); assert.equal(v.segmentoFonte, 'Logística');
  assert.equal(sb.fundMapearCvmFii_(mensal, tri, '00.000.000/0000-00'), null);
});

test('CVM (FCA): segmento de listagem, tag along, controle estatal', () => {
  const { sb } = montar();
  const vm = sb.fundFiltrarCsv_(FCA_VM, [';ZZZZ3;']);
  const geral = sb.fundFiltrarCsv_(FCA_GERAL, ['11.111.111/0001-11']);
  const r = plain(sb.fundMapearFca_(vm, geral, 'ZZZZ3'));
  assert.deepEqual(r.valores, { segmentoListagem: 'N1', tagAlong: 0.8, estatal: true, setorCvm: 'Energia Elétrica' });
  assert.equal(sb.fundMapearFca_(vm, geral, 'XXXX3'), null);
});

test('Coleta inteira: grava aux_fundamentos (ticker | fonte | json | data), 1x por dia, e o contrato sai certo na tela e no Radar', () => {
  const { sb, ss, chamadas } = montar();
  const r = plain(sb.atualizarFundamentos_('Manual', {}));
  assert.equal(r.status, 'Sucesso', r.detalhe);
  assert.ok(!chamadas.some((u) => /ZZZZ15G/.test(u)), 'direito de subscrição fica de fora');
  const aba = ss.getSheetByName('aux_fundamentos');
  const linhas = aba.getRange(1, 1, aba.getLastRow(), 4).getValues();
  assert.deepEqual(linhas[0], ['Ticker', 'Fonte', 'JSON', 'Atualizado em']);
  assert.deepEqual(linhas.slice(1).map((l) => `${l[0]}|${l[1]}`).sort(),
    ['ZZZZ11|cvm', 'ZZZZ11|fundamentus', 'ZZZZ3|cvm', 'ZZZZ3|fundamentus', 'ZZZZ|sec', 'ZZZZ|yahoo']);
  linhas.slice(1).forEach((l) => { JSON.parse(l[2]); assert.ok(l[3] instanceof sb.Date); });
  // fórmulas GOOGLEFINANCE escritas (o Sheets calcula depois)
  const gf = ss.getSheetByName('aux_fundamentos-gf');
  assert.equal(gf.formula('C2'), '=IFERROR(GOOGLEFINANCE($B2;"pe");"")');
  assert.equal(gf.valor('B2'), 'BVMF:ZZZZ3');
  assert.equal(gf.formula('C3'), '', 'FII: sem P/L do GOOGLEFINANCE');
  assert.equal(gf.valor('B4'), 'ZZZZ');

  // 2ª execução no mesmo dia: nada vai pra internet
  const n = chamadas.length;
  const r2 = plain(sb.atualizarFundamentos_('Automático', {}));
  assert.equal(chamadas.length, n, 'cache: no máximo 1x por dia');
  assert.equal(r2.status, 'Sucesso');

  // tela do ativo (contrato)
  const acao = plain(sb.lerFundamentosDoAtivo_(ss, 'ZZZZ3', 'acoes', null));
  assert.deepEqual(acao.fonte, ['fundamentus', 'cvm']);
  assert.equal(acao.atualizadoEm, '2026-10-03');
  assert.equal(acao.valores.pl, 8); assert.equal(acao.valores.segmentoListagem, 'N1'); assert.equal(acao.valores.estatal, true);
  assert.equal(acao.valores.anosPagandoDividendos, 5); assert.equal(acao.valores.payout, 0.5769); assert.equal(acao.valores.dividendosPagos12m, 720000000);
  assert.equal(acao.valores.bolsa, 'B3');
  assert.ok(Array.isArray(acao.avisos));
  assert.deepEqual(acao.historico, { pl: [{ data: '2026-10', valor: 8 }], pvp: [{ data: '2026-10', valor: 1.25 }], dy: [{ data: '2026-10', valor: 0.064 }] }, 'foto mensal da Auxiliar_ativos');

  const serie = [{ data: '2025-08-28', preco: 90 }, { data: '2025-08-29', preco: 92 }, { data: '2026-07-31', preco: 97 }, { data: '2026-08-31', preco: 94 }];
  const fii = plain(sb.lerFundamentosDoAtivo_(ss, 'ZZZZ11', 'fiis', serie));
  assert.deepEqual(fii.fonte, ['cvm', 'fundamentus']);
  assert.equal(fii.valores.vpCota, 100, 'CVM vem antes do Fundamentus nos FIIs');
  assert.equal(fii.valores.pvp, 0.95); assert.equal(fii.valores.dy12m, 0.101); assert.equal(fii.valores.numeroCotistas, 42000);
  assert.equal(fii.valores.ultimoRendimento, 0.8);
  assert.deepEqual(fii.historico.vpCota.map((p) => p.data), ['2025-08', '2026-07', '2026-08', '2026-10'], 'CVM + a foto deste mês');
  assert.deepEqual(fii.historico.pvp, [{ data: '2025-08', valor: 0.9684 }, { data: '2026-07', valor: 0.9798 }, { data: '2026-08', valor: 0.94 }, { data: '2026-10', valor: 0.95 }],
    'P/VP mês a mês = último preço do mês ÷ VP/cota da CVM (+ a foto deste mês)');
  assert.deepEqual(fii.historico.dy12m, [{ data: '2026-10', valor: 0.101 }]);

  const eua = plain(sb.lerFundamentosDoAtivo_(ss, 'ZZZZ', 'acoesEua', null));
  assert.deepEqual(eua.fonte, ['yahoo', 'sec']);
  assert.equal(eua.valores.pl, 12.5, 'Yahoo antes da SEC');
  assert.equal(eua.valores.cagrReceita5a, 0.1, 'o que só a SEC tem completa');
  assert.equal(eua.valores.anosPagandoDividendos, 3);
  assert.deepEqual(eua.historico.pl, [{ data: '2026-10', valor: 12.5 }], 'foto mensal: P/L 304 da planilha é descartado e o do Yahoo entra');
  assert.equal(eua.historico.pvp[0].valor, 2, '"#DIV/0!" da planilha também');
  assert.equal(sb.lerFundamentosDoAtivo_(ss, 'NADA3', 'acoes', null), null);

  // Radar: resumo por item
  const grupos = [{ classe: 'acoes', itens: [{ ativo: 'ZZZZ3' }, { ativo: 'SEMD3' }] }, { classe: 'fiis', itens: [{ ativo: 'ZZZZ11' }] }];
  sb.anexarFundamentosAoRadar_(ss, grupos);
  assert.equal(grupos[0].itens[0].fundamentos.valores.roe, 0.156);
  assert.equal(grupos[0].itens[0].fundamentos.historico, undefined);
  assert.equal(grupos[0].itens[1].fundamentos, undefined);
  assert.equal(grupos[1].itens[0].fundamentos.valores.vacanciaFisica, 0.05);
});

test('Coleta: sem tempo, nada é buscado e tudo fica pendente (a agenda tenta de novo); fonte fora do ar vira "Atenção" sem perder o resto', () => {
  const a = montar();
  const r = plain(a.sb.atualizarFundamentos_('Automático', { limiteMs: 1 }));
  assert.equal(r.porTempo, true);
  assert.equal(a.chamadas.length, 0);
  assert.ok(r.pendentes.includes('ZZZZ3|fundamentus') && r.pendentes.includes('ZZZZ|sec') && r.pendentes.includes('ZZZZ11|cvm'));

  const b = montar();
  const fetchOrig = b.sb.UrlFetchApp.fetch;
  b.sb.UrlFetchApp.fetch = (url, o) => (/yahoo/.test(url) ? { getResponseCode: () => 429, getContentText: () => 'Too Many Requests' } : fetchOrig(url, o));
  const r2 = plain(b.sb.atualizarFundamentos_('Automático', {}));
  assert.equal(r2.status, 'Atenção');
  assert.match(r2.detalhe, /ZZZZ\|yahoo \(.*HTTP 429/);
  const eua = plain(b.sb.lerFundamentosDoAtivo_(b.ss, 'ZZZZ', 'acoesEua', null));
  assert.equal(eua.fonte, 'sec', 'SEC segura quando o Yahoo bloqueia');
  assert.equal(eua.valores.roe, 0.1);
});

test('Validade: Fundamentus/Yahoo 1 dia, SEC 7 dias, CVM até virar o mês', () => {
  const { sb } = montar();
  const d = (s) => new sb.Date(s);
  const agora = d('2026-10-03T15:00:00Z');
  assert.equal(sb.fundEstaFresco_('fundamentus', d('2026-10-03T10:00:00Z'), agora), true);
  assert.equal(sb.fundEstaFresco_('fundamentus', d('2026-10-02T20:00:00Z'), agora), false);
  assert.equal(sb.fundEstaFresco_('sec', d('2026-09-28T15:00:00Z'), agora), true);
  assert.equal(sb.fundEstaFresco_('sec', d('2026-09-25T15:00:00Z'), agora), false);
  assert.equal(sb.fundEstaFresco_('cvm', d('2026-10-01T12:00:00Z'), agora), true);
  assert.equal(sb.fundEstaFresco_('cvm', d('2026-09-30T12:00:00Z'), agora), false);
  assert.equal(sb.fundEstaFresco_('cvm', null, agora), false);
});

test('GOOGLEFINANCE (planilha): lê o bloco já calculado como reserva', () => {
  const { sb, ss } = montar();
  sb.atualizarFundamentos_('Manual', {});
  const gf = ss.getSheetByName('aux_fundamentos-gf');
  gf.getRange(2, 3, 1, 6).setValues([[8.1, 15.2, 9.8, 0.85, 1000000, 10000000000]]); // o que o Sheets calcularia
  const dados = plain(sb.fundColetarPlanilhaGf_(ss, sb.fundAtivosDaCarteira_(ss)));
  assert.deepEqual(dados.ZZZZ3.valores, { pl: 8.1, maxima52s: 15.2, minima52s: 9.8, beta: 0.85, valorMercado: 10000000000, volumeMedio2m: 12500000 });
});

test('Contrato no motor de critérios: com fundamentos a análise avalia mais critérios do que só com a planilha', () => {
  const { sb, ss } = montar();
  sb.atualizarFundamentos_('Manual', {});
  const fundamentos = plain(sb.lerFundamentosDoAtivo_(ss, 'ZZZZ3', 'acoes', null));
  const base = { classe: 'acoes', ticker: 'ZZZZ3', nome: 'Zeta Energia', setor: 'Utilidade Pública', moeda: 'BRL', hoje: '2026-10-03',
    indicadores: { precoAtual: 12.5, precoTeto: 14, precoMedio: 10, dy: 0.064, pvp: 1.25, pl: 8, proventos: [] }, historicoPreco: [], indices: [], referencias: {}, carteira: {} };
  const sem = avaliarAtivo({ ...base, fundamentos: null });
  const com = avaliarAtivo({ ...base, fundamentos });
  assert.ok(com.cobertura.avaliados > sem.cobertura.avaliados + 5, `${sem.cobertura.avaliados} -> ${com.cobertura.avaliados}`);
  assert.equal(avaliarAtivo({ ...base, fundamentos: undefined }).cobertura.avaliados, sem.cobertura.avaliados, 'sem o campo: não quebra');
});

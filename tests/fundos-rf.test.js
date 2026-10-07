// tests/fundos-rf.test.js - 07/10/2026 (Tiago: fundo DI "Trend DI FC RF Simples RL" guardado pra comprar a chácara). Parte pura do front:
// casar o título com o fundo (nome/apelido/CNPJ), logo, dados públicos (assets/data/fundos.json x índice do fundos-rf.js), rentabilidade mensal
// x CDI, cotas e "cota real x estimativa". Posição/valores do investidor: INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FUNDOS_INDEX, normalizarNomeFundo, ehFundoRf, casarFundo, logoDoFundo, comporPercentuais, tabelaRentabilidadeFundo,
  cotasDasMovimentacoes, cotaMaisRecente, compararCota, montarFundoRf,
} from '../assets/js/fundos-rf.js';
import { definirCotaFundoRf } from '../assets/js/api-client.js';
import { numeroDaCota } from '../assets/js/pages/ativo-fundo.js';

const RAIZ = new URL('../', import.meta.url);
const FUNDOS = JSON.parse(fs.readFileSync(new URL('assets/data/fundos.json', RAIZ), 'utf8'));
const TREND = FUNDOS.fundos[0];

test('dados públicos: o índice do fundos-rf.js (usado pelas listas) bate com o assets/data/fundos.json, e o logo existe', () => {
  assert.equal(FUNDOS.fundos.length, FUNDOS_INDEX.length);
  FUNDOS_INDEX.forEach((idx) => {
    const f = FUNDOS.fundos.find((x) => x.chave === idx.chave);
    assert.ok(f, `${idx.chave} no JSON`);
    assert.equal(f.cnpj, idx.cnpj);
    assert.equal(f.logo, idx.logo);
    assert.deepEqual(f.apelidos, idx.apelidos);
    assert.ok(fs.existsSync(new URL(f.logo, RAIZ)), 'arquivo do logo');
  });
  assert.equal(TREND.cnpj, '45.278.833/0001-57');
  assert.equal(TREND.administrador, 'Modal DTVM');
  assert.equal(TREND.gestora, 'XP Vista Asset Management LTDA');
  assert.equal(TREND.taxaAdministracao, 0);
  assert.equal(TREND.taxaAdministracaoMaxima, 0.02);
  assert.equal(TREND.ultimaCota.valor, 1.65430189);
  assert.equal(TREND.ultimaCota.data, '2026-10-07');
  // só dado público do fundo: nada de posição/valores do investidor
  assert.doesNotMatch(JSON.stringify(FUNDOS.fundos), /quantidade|totalAtualizado|minhas cotas|valorInvestido/i);
});

test('rentabilidade do JSON é coerente: meses compõem o ano (±0,06) e os anos compõem a acumulada da lâmina (±0,05)', () => {
  const m = TREND.rentabilidadeMensal;
  for (const ano of ['2024', '2025', '2026']) {
    const composto = comporPercentuais(m[ano]);
    assert.ok(Math.abs(composto - TREND.rentabilidadeAno[ano]) <= 0.06, `${ano}: ${composto} x ${TREND.rentabilidadeAno[ano]}`);
  }
  assert.equal(m['2026'].length, 9, 'janeiro a setembro');
  assert.equal(m['2025'].length, 12);
  const tab = tabelaRentabilidadeFundo(TREND, {});
  for (const l of tab.filter((x) => !x.acumuladaCalculada)) {
    const encadeada = comporPercentuais(tab.filter((x) => x.ano <= l.ano).map((x) => x.pctAno));
    assert.ok(Math.abs(encadeada - l.acumulada) <= 0.05, `${l.ano}: acumulada ${encadeada} x ${l.acumulada}`);
  }
});

test('casarFundo: apelidos (sem acento/maiúscula/pontuação), CNPJ, palavras inteiras; Tesouro/CDB/LCI e fundo desconhecido não casam', () => {
  ['Trend DI FC RF Simples RL', 'TREND DI FIC RF SIMPLES RL', 'trend di fc rf simples', 'Trend-DI FC RF Simples RL', 'Trend DI'].forEach((t) => assert.equal(casarFundo(t).chave, 'trend-di-fic-rf-simples-rl', t));
  assert.equal(casarFundo(['Outro nome', 'CNPJ 45.278.833/0001-57']).chave, 'trend-di-fic-rf-simples-rl', 'pelo CNPJ');
  assert.equal(casarFundo('45278833000157').chave, 'trend-di-fic-rf-simples-rl');
  ['Trend Dinâmico', 'Tesouro Selic 2029', 'LCI - BANCO INTER S/A', 'CDB Banco X', 'Fundo Qualquer FIC RF', '', null, undefined].forEach((t) => assert.equal(casarFundo(t), null, String(t)));
  assert.equal(normalizarNomeFundo('  Trend-DI  FÇ '), 'trend di fc');
  assert.equal(casarFundo('Trend DI FC RF Simples RL', FUNDOS.fundos).chave, 'trend-di-fic-rf-simples-rl', 'também na lista do JSON');
});

test('logoDoFundo: qualquer formato de item das listas (carteira, aporte, lançamento, histórico) acha o logo do fundo', () => {
  const logo = 'assets/imgs/fundos/TrendDIFCRFSimplesRL.png';
  assert.equal(logoDoFundo({ nomePersonalizado: 'Trend DI FC RF Simples RL', tipoInvestimento: 'Fundo de Investimento', instituicao: 'Rico' }), logo, 'Carteiras › Renda Fixa');
  assert.equal(logoDoFundo({ tipoInvestimento: 'Trend DI FC RF Simples RL', indexador: '', instituicao: 'Rico' }), logo, 'Aportes/Lançamentos passam o nome em tipoInvestimento');
  assert.equal(logoDoFundo({ ticker: 'Trend DI FC RF Simples RL' }), logo, 'Meus ativos');
  assert.equal(logoDoFundo({ ativo: 'Trend DI FC RF Simples RL' }), logo);
  assert.equal(logoDoFundo({ nomePersonalizado: 'Tesouro Selic 2029', indexador: 'SELIC' }), null);
  assert.equal(logoDoFundo(null), null);
  assert.equal(logoDoFundo({}), null);
});

test('ehFundoRf: reconhece fundo pelo nome (FIC/FC/FI/RF Simples), nunca Tesouro/CDB/LCI', () => {
  ['Trend DI FC RF Simples RL', 'Fundo Exemplo FIC RF', 'XP Selic FI RF'].forEach((n) => assert.equal(ehFundoRf(n), true, n));
  ['Tesouro Selic 2029', 'LCI - BANCO INTER S/A', 'CDB Banco FI', 'Renda Fixa', '', null].forEach((n) => assert.equal(ehFundoRf(n), false, String(n)));
});

test('tabelaRentabilidadeFundo: anos do mais novo pro mais antigo, % do CDI por mês e por ano, ano de início sem comparação, acumulada calculada quando a lâmina não traz', () => {
  // CDI INVENTADO: 1,00% em todos os meses de 2025 e 2026 (jan-set); sem CDI em 2024
  const cdi = {};
  for (let m = 1; m <= 12; m++) cdi[`2025-${String(m).padStart(2, '0')}`] = 1;
  for (let m = 1; m <= 9; m++) cdi[`2026-${String(m).padStart(2, '0')}`] = 1;
  const tab = tabelaRentabilidadeFundo(TREND, cdi);
  assert.deepEqual(tab.map((l) => l.ano), [2026, 2025, 2024, 2023, 2022]);
  const a26 = tab[0];
  assert.equal(a26.mesesComDado, 9);
  assert.equal(a26.parcial, true);
  assert.equal(a26.meses[0].pct, 1.18);
  assert.equal(a26.meses[0].pctCdi, 118, '1,18 / 1,00');
  assert.equal(a26.meses[9].pct, null, 'outubro ainda não saiu');
  assert.equal(a26.pctAno, 10.54);
  assert.equal(a26.cdiAno, comporPercentuais(Array(9).fill(1)));
  assert.equal(a26.pctCdiAno, Math.round((10.54 / comporPercentuais(Array(9).fill(1))) * 100));
  assert.equal(a26.acumulada, 65.02);
  assert.equal(a26.acumuladaCalculada, false);
  assert.equal(tab[2].pctCdiAno, null, '2024 sem CDI na massa de teste: sem comparação');
  const a22 = tab[4];
  assert.equal(a22.pctAno, 3.9);
  assert.equal(a22.pctCdiAno, null, 'o ano de início é parcial (setembro): sem comparação');
  assert.equal(a22.acumulada, 3.9);
  assert.equal(a22.acumuladaCalculada, true);
  assert.equal(tab[3].acumulada, comporPercentuais([3.9, 13.13]), '2023: encadeada pelos anos');
  assert.deepEqual(tabelaRentabilidadeFundo(null), []);
});

test('cotas: aplicações menos resgates (crédito/débito, tipo), 8 casas', () => {
  assert.equal(cotasDasMovimentacoes([
    { tipo: 'Compra', entradaSaida: 'Credito', quantidade: 100.12345678 },
    { tipo: 'Compra', entradaSaida: 'Credito', quantidade: 50 },
    { tipo: 'Resgate', entradaSaida: 'Debito', quantidade: 20.1 },
  ]), 130.02345678);
  assert.equal(cotasDasMovimentacoes([{ tipo: 'Resgate', entradaSaida: '', quantidade: 5 }, { tipo: 'APLICAÇÃO', quantidade: 8 }]), 3);
  assert.equal(cotasDasMovimentacoes([]), 0);
  assert.equal(cotasDasMovimentacoes(null), 0);
});

test('cota mais recente: a informada vale se for da mesma data ou mais nova que a pública; senão a pública', () => {
  const pub = { ultimaCota: { valor: 2, data: '2026-10-07' } };
  assert.deepEqual(cotaMaisRecente(pub, null), { cota: 2, data: '2026-10-07', origem: 'publica' });
  assert.deepEqual(cotaMaisRecente(pub, { cota: 2.1, data: '2026-10-07' }), { cota: 2.1, data: '2026-10-07', origem: 'informada' });
  assert.deepEqual(cotaMaisRecente(pub, { cota: 2.2, data: '2026-10-09' }), { cota: 2.2, data: '2026-10-09', origem: 'informada' });
  assert.deepEqual(cotaMaisRecente(pub, { cota: 1.9, data: '2026-10-01' }), { cota: 2, data: '2026-10-07', origem: 'publica' });
  assert.deepEqual(cotaMaisRecente(null, { cota: 1.9, data: '2026-10-01' }), { cota: 1.9, data: '2026-10-01', origem: 'informada' });
  assert.equal(cotaMaisRecente(null, null), null);
});

test('compararCota: valor pela cota x estimativa e a diferença; sem cotas ou cota = null', () => {
  const c = compararCota({ cotas: 130, cota: { cota: 2.1, data: '2026-10-07', origem: 'informada' }, valorEstimado: 270, dataEstimado: '2026-10-07', valorTitulo: 270 });
  assert.equal(c.valorPelaCota, 273);
  assert.equal(c.valorEstimado, 270);
  assert.equal(c.diferenca, 3);
  assert.ok(Math.abs(c.diferencaPct - 3 / 270) < 1e-12);
  // sem a série estimada: compara com o valor do título
  assert.equal(compararCota({ cotas: 10, cota: { cota: 2, data: 'x', origem: 'publica' }, valorTitulo: 19 }).diferenca, 1);
  assert.equal(compararCota({ cotas: 0, cota: { cota: 2 } }), null);
  assert.equal(compararCota({ cotas: 5, cota: null }), null);
});

test('montarFundoRf: junta ficha pública, cota mais recente, cotas e comparação; título que não é fundo = null', () => {
  const resposta = {
    tipo: 'rf', ticker: 'Trend DI FC RF Simples RL',
    ativo: { nomePersonalizado: 'Trend DI FC RF Simples RL', tipoInvestimento: 'Fundo de Investimento', totalAtualizado: 400 },
    serie: [{ data: '2026-10-06', valor: 399 }, { data: '2026-10-07', valor: 400 }],
    transacoes: [{ tipo: 'Compra', entradaSaida: 'Credito', quantidade: 200 }, { tipo: 'Compra', entradaSaida: 'Credito', quantidade: 40 }],
    fundo: { cotaInformada: null, cdiMensal: { '2026-09': 1.05 } },
  };
  const f = montarFundoRf(resposta, FUNDOS);
  assert.equal(f.info.cnpj, '45.278.833/0001-57');
  assert.equal(f.cotas, 240);
  assert.equal(f.cota.origem, 'publica');
  assert.equal(f.comparacao.valorPelaCota, Math.round(240 * 1.65430189 * 100) / 100);
  assert.equal(f.comparacao.valorEstimado, 400);
  assert.deepEqual(f.cdiMensal, { '2026-09': 1.05 });
  // com cota informada mais nova
  const g = montarFundoRf({ ...resposta, fundo: { cotaInformada: { cota: 1.7, data: '2026-10-09' }, cdiMensal: {} } }, FUNDOS);
  assert.equal(g.cota.origem, 'informada');
  assert.equal(g.comparacao.valorPelaCota, 408);
  // sem o fundos.json: o Apps Script marcou como fundo, a ficha pública não aparece mas a cota funciona
  const h = montarFundoRf({ ...resposta, ativo: { nomePersonalizado: 'Fundo Desconhecido FIC RF' }, ticker: 'Fundo Desconhecido FIC RF', fundo: { cotaInformada: { cota: 2, data: '2026-10-01' }, cdiMensal: {} } }, null);
  assert.equal(h.info, null);
  assert.equal(h.comparacao.valorPelaCota, 480);
  // não é fundo
  assert.equal(montarFundoRf({ tipo: 'rf', ticker: 'Tesouro Selic 2029', ativo: { nomePersonalizado: 'Tesouro Selic 2029' }, serie: [], transacoes: [] }, FUNDOS), null);
  assert.equal(montarFundoRf({ tipo: 'rv', ticker: 'TEST3' }, FUNDOS), null);
});

test('numeroDaCota e api-client: cota com vírgula/ponto; definirCotaFundoRf faz POST com título, cota e data', async (t) => {
  assert.equal(numeroDaCota('1,65430189'), 1.65430189);
  assert.equal(numeroDaCota('R$ 1.234,5'), 1234.5);
  assert.equal(numeroDaCota('1.65430189'), 1.65430189);
  assert.ok(Number.isNaN(numeroDaCota('abc')));
  let corpo; let metodo;
  t.mock.method(globalThis, 'fetch', async (url, opts) => { corpo = opts.body; metodo = opts.method; return { json: async () => ({ ok: true }) }; });
  await definirCotaFundoRf('tok', { titulo: 'Fundo X', cota: '1,65', data: '2026-10-07' });
  assert.equal(metodo, 'POST');
  assert.equal(corpo.get('action'), 'definirCotaFundoRf');
  assert.equal(corpo.get('titulo'), 'Fundo X');
  assert.equal(corpo.get('cota'), '1,65');
  assert.equal(corpo.get('data'), '2026-10-07');
});

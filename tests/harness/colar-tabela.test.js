// tests/harness/colar-tabela.test.js - 07/10/2026 (Tiago: tabela colada do fundo guardado pra chácara). Lado do Apps Script:
// os itens que vêm da tela "Colar uma tabela" (origem 'Colado') gravam em "Transações Renda Fixa" (+ lote de RF Contratada com a taxa),
// reimportar não duplica, e o título NOVO ganha a linha na "Carteira Renda Fixa" com o destino certo na COLUNA B. Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, plain } from './planilha-falsa.mjs';
import { lerTabelaColada, itensRendaFixaDaTabela } from '../../assets/js/pages/colar-tabela-parse.js';

const brancas = (n) => Array.from({ length: n }, () => ['']);
const INST = 'CORRETORA X S/A';
const TABELA = [
  ['Data', 'Tipo', 'Quantidade', 'Preço', 'Custos Op.', 'Valor total', 'Origem'],
  ['05/10/2026', 'Compra', '100,50000000', 'R$ 2,00000000', 'R$ 0,00', 'R$ 201,00', 'Manual'],
  ['01/10/2026', 'Compra', '50,25000000', 'R$ 2,00000000', 'R$ 0,00', 'R$ 100,50', 'Manual'],
  ['15/09/2026', 'Compra', '10,00000000', 'R$ 1,99000000', 'R$ 0,00', 'R$ 19,90', 'Manual'],
  ['20/09/2026', 'Resgate', '5,00000000', 'R$ 1,99000000', 'R$ 0,00', 'R$ 9,95', 'Manual'],
].map((l) => l.join('\t')).join('\n');

function montar(carteiraRf = []) {
  const ss = planilhaFalsa({
    'Transações': [...brancas(5), ['Ticker', 'Data', 'Tipo', 'Preço', 'Qtd.', 'Taxa']],
    'Transações - USA': [...brancas(5), ['Ticker']],
    'Transações Renda Fixa': [...brancas(5), ['Produto']],
    'Proventos': [...brancas(7), ['Data Com']],
    'Proventos - USA': [...brancas(7), ['Data Com']],
    'RF Contratada - Lotes': [['Título']],
    'Carteira Ações': [['Ticker']], 'Carteira FIIs': [['Ticker']],
    'Auxiliar_ativos': [['Classe', 'Ticker']],
    'Carteira Renda Fixa': [...brancas(7), ['Código', 'Marca', 'Título', 'Tipo', 'Indexador', 'Instituição'], ...carteiraRf],
  });
  const { sb } = sandboxGas(ss);
  return { ss, sb };
}

const itens = (extra = {}) => itensRendaFixaDaTabela(lerTabelaColada(TABELA).linhas, { produto: 'Fundo DI Teste', instituicao: INST, taxaContratada: '100% do CDI', ...extra });
const gravado = (ss) => ss.abas['Transações Renda Fixa'].l.slice(6).map((l) => l.map((c) => c.v)).filter((l) => l[0]);
const dia = (v) => (v && typeof v.getFullYear === 'function' ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : v);

test('colado: conferência (simular) marca tudo novo e não grava nada', () => {
  const { ss, sb } = montar();
  const r = plain(sb.importarLancamentos_(itens({ destinoRf: 'objetivo' }), { simular: true, origem: 'Colado' }));
  assert.deepEqual(r.itens.map((c) => c.situacao), ['novo', 'novo', 'novo', 'novo']);
  assert.equal(gravado(ss).length, 0);
  assert.equal(ss.abas['Carteira Renda Fixa'].getLastRow(), 8, 'a Carteira não muda na simulação');
});

test('colado: grava em Transações Renda Fixa (compra = Credito, resgate = Debito, 8 casas), cria o lote com a taxa e reimportar não duplica', () => {
  const { ss, sb } = montar();
  const r1 = plain(sb.importarLancamentos_(itens(), { simular: false, origem: 'Colado' }));
  assert.equal(r1.gravados.rendaFixa, 4);
  assert.equal(r1.lotesRf, 3, 'um lote por compra (o resgate não tem)');
  const linhas = gravado(ss).map((l) => [l[0], dia(l[1]), l[2], l[3], l[4], l[5], l[6], l[7]]);
  assert.deepEqual(linhas, [
    ['Fundo DI Teste', '2026-09-15', 'Compra', 'Credito', INST, 10, 1.99, 19.9],
    ['Fundo DI Teste', '2026-09-20', 'Resgate', 'Debito', INST, 5, 1.99, 9.95],
    ['Fundo DI Teste', '2026-10-01', 'Compra', 'Credito', INST, 50.25, 2, 100.5],
    ['Fundo DI Teste', '2026-10-05', 'Compra', 'Credito', INST, 100.5, 2, 201],
  ]);
  const lotes = ss.abas['RF Contratada - Lotes'].l.slice(1).map((l) => l.map((c) => c.v)).filter((l) => l[0]);
  assert.equal(lotes.length, 3);
  assert.equal(lotes[0][6], 'CDI');
  assert.equal(lotes[0][7], '', '"100% do CDI" não é spread');
  assert.equal(lotes[0][8], '100% do CDI');
  // reimportar a MESMA tabela: tudo "já lançado", nada duplica (nem as linhas, nem os lotes)
  const sim = plain(sb.importarLancamentos_(itens(), { simular: true, origem: 'Colado' }));
  assert.deepEqual(sim.itens.map((c) => c.situacao), ['lancado', 'lancado', 'lancado', 'lancado']);
  const r2 = plain(sb.importarLancamentos_(itens(), { simular: false, origem: 'Colado' }));
  assert.equal(r2.gravadas, 0);
  assert.equal(r2.lotesRf, 0);
  assert.equal(gravado(ss).length, 4);
  assert.equal(ss.abas['RF Contratada - Lotes'].l.slice(1).filter((l) => l[0] && l[0].v).length, 3);
  // 'Colado' nunca força: mesmo com forcar=true a linha já lançada não entra de novo
  const r3 = plain(sb.importarLancamentos_(itens().map((i) => ({ ...i, forcar: true })), { simular: false, origem: 'Colado' }));
  assert.equal(r3.gravadas, 0);
  assert.equal(gravado(ss).length, 4);
});

test('colado: compra nova depois (lançada à mão na tabela) entra sozinha; só a nova é gravada', () => {
  const { ss, sb } = montar();
  sb.importarLancamentos_(itens(), { simular: false, origem: 'Colado' });
  const mais = lerTabelaColada(`${TABELA}\n08/10/2026\tCompra\t60,00000000\tR$ 2,00000000\tR$ 0,00\tR$ 120,00\tManual`);
  const r = plain(sb.importarLancamentos_(itensRendaFixaDaTabela(mais.linhas, { produto: 'Fundo DI Teste', instituicao: INST, taxaContratada: '100% do CDI' }), { simular: false, origem: 'Colado' }));
  assert.equal(r.gravadas, 1);
  assert.equal(gravado(ss).length, 5);
});

test('título NOVO com destino Objetivo: a Carteira Renda Fixa ganha a linha com "Objetivo" na coluna B (e o título cadastrado não é mexido)', () => {
  const existente = ['COD1', 'Renda Emergencial', 'Tesouro Selic 2029', 'Tesouro Selic (LFT)', 'SELIC', INST, 1, '', 1000, '', '', 1300];
  const { ss, sb } = montar([existente]);
  const r = plain(sb.importarLancamentos_(itens({ destinoRf: 'objetivo' }), { simular: false, origem: 'Colado' }));
  assert.equal(r.titulosRfCriados.length, 1);
  assert.deepEqual(r.titulosRfCriados[0], { titulo: 'Fundo DI Teste', instituicao: INST, destino: 'objetivo', linha: 10 });
  const cart = ss.abas['Carteira Renda Fixa'];
  assert.deepEqual(cart.valores(10).slice(0, 6), ['Fundo DI Teste', 'Objetivo', 'Fundo DI Teste', 'Renda Fixa', 'CDI', INST]);
  assert.equal(cart.valor('I10'), 321.4, 'valor aplicado das compras (a sincronização refaz pelo PEPS)');
  assert.equal(sb.destinoRendaFixa_(cart.valor('B10')), 'objetivo');
  assert.equal(cart.valor('B9'), 'Renda Emergencial', 'a linha que já existia não muda');
  assert.equal(cart.getLastRow(), 10);
  // segunda importação (já lançado): nada é criado de novo
  const r2 = plain(sb.importarLancamentos_(itens({ destinoRf: 'objetivo' }), { simular: false, origem: 'Colado' }));
  assert.equal((r2.titulosRfCriados || []).length, 0);
  assert.equal(cart.getLastRow(), 10);
});

test('destino do título novo: Renda Emergencial e Longo prazo gravam o texto certo; título que já existe nunca é reclassificado', () => {
  for (const [destino, texto] of [['emergencial', 'Renda Emergencial'], ['longo-prazo', 'Renda Fixa']]) {
    const { ss, sb } = montar();
    sb.importarLancamentos_(itens({ destinoRf: destino }), { simular: false, origem: 'Colado' });
    assert.equal(ss.abas['Carteira Renda Fixa'].valor('B9'), texto, destino);
  }
  const { ss, sb } = montar([['COD2', 'Renda Fixa', 'Fundo DI Teste', 'Renda Fixa', 'CDI', INST, '', '', 50, '', '', 60]]);
  const r = plain(sb.importarLancamentos_(itens({ destinoRf: 'objetivo' }), { simular: false, origem: 'Colado' }));
  assert.equal((r.titulosRfCriados || []).length, 0);
  assert.equal(ss.abas['Carteira Renda Fixa'].valor('B9'), 'Renda Fixa', 'já cadastrado: a coluna B fica como está');
  assert.equal(ss.abas['Carteira Renda Fixa'].getLastRow(), 9);
});

test('sem destinoRf (ou inválido) a Carteira não é tocada; resgate sozinho nunca cria título', () => {
  const { ss, sb } = montar();
  sb.importarLancamentos_(itens(), { simular: false, origem: 'Colado' });
  assert.equal(ss.abas['Carteira Renda Fixa'].getLastRow(), 8);
  const { ss: ss2, sb: sb2 } = montar();
  sb2.importarLancamentos_(itens({ destinoRf: 'qualquer' }), { simular: false, origem: 'Colado' });
  assert.equal(ss2.abas['Carteira Renda Fixa'].getLastRow(), 8);
  const { ss: ss3, sb: sb3 } = montar();
  const soResgate = itens({ destinoRf: 'objetivo' }).filter((i) => i.movimentacao === 'Resgate');
  sb3.importarLancamentos_(soResgate, { simular: false, origem: 'Colado' });
  assert.equal(ss3.abas['Carteira Renda Fixa'].getLastRow(), 8);
});

test('só o valor (sem quantidade/preço) também grava, com "-" nas colunas que faltam', () => {
  const { ss, sb } = montar();
  const l = lerTabelaColada('Data\tTipo\tValor total\n05/10/2026\tCompra\tR$ 500,00');
  const r = plain(sb.importarLancamentos_(itensRendaFixaDaTabela(l.linhas, { produto: 'Fundo DI Teste', instituicao: INST }), { simular: false, origem: 'Colado' }));
  assert.equal(r.gravados.rendaFixa, 1);
  assert.deepEqual(gravado(ss)[0].slice(5), ['-', '-', 500]);
});

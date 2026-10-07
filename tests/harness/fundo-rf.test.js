// tests/harness/fundo-rf.test.js - 07/10/2026 (Tiago: fundo DI guardado pra comprar a chácara). Lado do Apps Script:
//  - a linha da Carteira Renda Fixa que ficou INCOMPLETA (só o nome e a coluna B) é completada pela sincronização (instituição, tipo, indexador,
//    cotas, valor investido e valor atualizado) sem trocar o que já está preenchido nem a coluna B, sem duplicar a linha e de forma idempotente;
//  - tipo "Fundo de Investimento" pro título novo (Lançamentos e sincronização) e a linha existente sem instituição não é recriada;
//  - cota informada (cota + data): guarda, vale pro valor do título (cotas x cota x CDI desde a data), recusa cota velha/inválida;
//  - o seletor de destino ("Reservado para objetivos") funciona com a linha incompleta e com a completa;
//  - o espelho do front (fundos-rf.js!ehFundoRf) bate com o do Apps Script. Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, AbaFalsa, sandboxGas, D, plain } from './planilha-falsa.mjs';
import fs from 'node:fs';
import { ehFundoRf } from '../../assets/js/fundos-rf.js';

const AGORA = new Date(2026, 9, 7, 12, 0, 0);
const cab = (n) => Array.from({ length: n }, () => ['']);
const NOME = 'Fundo Teste DI FIC RF Simples';
const INST = 'CORRETORA X S/A';

function montar({ carteira = null, instituicoes = [INST, INST, INST], cdi = true } = {}) {
  const ss = planilhaFalsa({});
  const ctx = sandboxGas(ss, { agora: AGORA, urlFetch: () => { throw new Error('sem rede'); } });
  const { sb } = ctx;
  const d = (s, h = 0, m = 0) => D(sb, s, h, m);
  const add = (nome, linhas) => { ss.abas[nome] = new AbaFalsa(nome, linhas); };
  add('Transações Renda Fixa', [...cab(5), ['Produto', 'Data', 'Movimentação', 'Entrada/Saída', 'Instituição', 'Quantidade', 'Preço', 'Valor'],
    [NOME, d('2026-09-01'), 'Compra', 'Credito', instituicoes[0], 100, 2, 200],
    [NOME, d('2026-09-10'), 'Compra', 'Credito', instituicoes[1], 50, 2.02, 101],
    [NOME, d('2026-09-20'), 'Resgate', 'Debito', instituicoes[2], 20, 2.05, 41]]);
  add('Carteira Renda Fixa', [...cab(7), ['Código', 'Marca', 'Nome', 'Tipo', 'Indexador', 'Instituição', 'Quantidade', 'PU', 'Valor Investido', 'Emissão', 'Vencimento', 'Valor Atualizado'],
    ...(carteira || [[NOME, 'Objetivo', NOME]])]);
  add('aux_historico-renda-fixa', [['Data', 'Produto', 'Instituição', 'Indexador', 'Classificação', 'Valor'], [d('2026-10-07'), NOME, INST, 'CDI', 'Renda Fixa', 270]]);
  add('aux_historico-indices', [['Data', 'Índice', 'Valor'],
    ...(cdi ? [[d('2026-09-30'), 'CDI', 0.05], [d('2026-10-01'), 'CDI', 0.05], [d('2026-10-05'), 'CDI', 0.05], [d('2026-10-06'), 'CDI', 0.05], [d('2026-10-07'), 'CDI', 0.05]] : [])]);
  add('RF Contratada - Resumo', [['Título']]);
  add('RF Contratada - Lotes', [['Título', 'Instituição', 'Data']]);
  add('Carteira Ações', [['Ticker']]); add('Carteira FIIs', [['Ticker']]); add('Auxiliar_ativos', [['Classe', 'Ticker']]);
  add('Transações', [...cab(5), ['Ticker', 'Data']]); add('Transações - USA', [...cab(5), ['Ticker', 'Data']]);
  return { ss, sb, ...ctx };
}

const carteira = (ss) => ss.abas['Carteira Renda Fixa'];
const linha = (ss, r) => carteira(ss).valores(r).slice(0, 12);

test('ehFundoRf_: fundos sim; Tesouro, CDB, LCI/LCA e títulos comuns não - e o espelho do front dá a mesma resposta', () => {
  const { sb } = montar();
  const sim = ['Trend DI FC RF Simples RL', 'Fundo Exemplo FIC RF', 'XP Selic FI RF', 'Banco X FIRF Crédito Privado', 'Referenciado DI Teste', NOME];
  const nao = ['Tesouro Selic 2029', 'LCI - BANCO INTER S/A', 'CDB Banco FI', 'LCA Banco X', 'Renda Fixa', '', null, 'CDB FIBRA'];
  sim.forEach((n) => assert.equal(sb.ehFundoRf_(n), true, n));
  nao.forEach((n) => assert.equal(sb.ehFundoRf_(n), false, String(n)));
  [...sim, ...nao].forEach((n) => assert.equal(ehFundoRf(n), sb.ehFundoRf_(n), `front x Apps Script: ${n}`));
  assert.equal(sb.tipoInvestimentoRf_(NOME), 'Fundo de Investimento');
  assert.equal(sb.tipoInvestimentoRf_('Tesouro Selic 2029'), 'Tesouro Selic (LFT)', 'os outros tipos não mudam');
  assert.equal(sb.tipoInvestimentoRf_('LCI - X'), 'LCI / LCA Pós-fixada');
});

test('sincronização: completa a linha INCOMPLETA (instituição, tipo, indexador, cotas, investido, atualizado), sem duplicar nem mexer na coluna B; 2ª rodada não muda nada', () => {
  const { ss, sb } = montar();
  const sim = plain(sb.completarTitulosRendaFixaDireto({ simular: true }));
  assert.equal(sim.novas.length, 0, 'sem a instituição a chave não casava e o 3º passo criaria uma linha em duplicidade: agora a linha existente é a dona');
  assert.equal(sim.atualizadas.length, 1);
  assert.deepEqual(linha(ss, 9).slice(3, 12).filter((v) => v !== '' && v != null), [], 'simular não grava');

  const r = plain(sb.completarTitulosRendaFixaDireto());
  assert.equal(r.novas.length, 0);
  assert.equal(carteira(ss).getLastRow(), 9, 'nenhuma linha nova');
  const l = linha(ss, 9);
  assert.equal(l[0], NOME);
  assert.equal(l[1], 'Objetivo', 'a coluna B (destino) nunca é trocada pela sincronização');
  assert.deepEqual(l.slice(2, 6), [NOME, 'Fundo de Investimento', 'CDI', INST], 'tipo, indexador e instituição (como nas Transações)');
  assert.equal(l[6], 130, 'cotas = aplicações menos resgates');
  assert.equal(l[8], 261, 'valor investido = custo PEPS do que ficou');
  assert.equal(l[11], 270, 'valor atualizado = último do histórico (estimativa 100% do CDI)');
  assert.equal(sb.destinoRendaFixa_(l[1]), 'objetivo');
  // idempotente
  const r2 = plain(sb.completarTitulosRendaFixaDireto());
  assert.equal(r2.atualizadas.length, 0);
  assert.equal(r2.novas.length, 0);
  assert.deepEqual(linha(ss, 9), l);
});

test('sincronização: nunca sobrescreve o que o Tiago preencheu (tipo, indexador) e só completa a instituição vazia', () => {
  const { ss, sb } = montar({ carteira: [['COD1', 'Renda Emergencial', NOME, 'Meu tipo', 'SELIC', '']] });
  sb.completarTitulosRendaFixaDireto();
  const l = linha(ss, 9);
  assert.deepEqual(l.slice(0, 6), ['COD1', 'Renda Emergencial', NOME, 'Meu tipo', 'SELIC', INST]);
});

test('sincronização: nome com 2 instituições nas Transações e linha sem instituição - não adivinha, avisa', () => {
  const { ss, sb } = montar({ instituicoes: [INST, 'OUTRA CORRETORA S/A', INST] });
  const r = plain(sb.completarTitulosRendaFixaDireto());
  assert.match(r.avisos.join(' | '), /sem instituição e as Transações têm mais de uma/);
  assert.ok(!linha(ss, 9)[5], 'instituição continua vazia');
});

test('Lançamentos: título cadastrado SEM instituição não é recriado; título novo sai completo (tipo de fundo, cotas)', () => {
  // linha incompleta já existe: o lançamento do mesmo fundo não cria outra
  const a = montar();
  const novoItem = (extra = {}) => ({ destino: 'rendaFixa', produto: NOME, data: '2026-10-07', movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: INST, qtd: 10, preco: 2, valor: 20, taxaContratada: '100% do CDI', destinoRf: 'objetivo', ...extra });
  const r = plain(a.sb.importarLancamentos_([novoItem()], { simular: false, origem: 'Colado' }));
  assert.equal((r.titulosRfCriados || []).length, 0);
  assert.equal(carteira(a.ss).getLastRow(), 9);
  // título novo: linha completa
  const b = montar({ carteira: [['COD0', 'Renda Emergencial', 'Tesouro Selic 2029', 'Tesouro Selic (LFT)', 'SELIC', INST, 1, '', 1000, '', '', 1300]] });
  const r2 = plain(b.sb.importarLancamentos_([novoItem({ produto: 'Outro Fundo Teste FIC RF' })], { simular: false, origem: 'Colado' }));
  assert.equal(r2.titulosRfCriados.length, 1);
  assert.deepEqual(linha(b.ss, 10).slice(0, 9), ['Outro Fundo Teste FIC RF', 'Objetivo', 'Outro Fundo Teste FIC RF', 'Fundo de Investimento', 'CDI', INST, 10, '', 20]);
});

test('cota informada: guarda (cota + data), vira o valor do título (cotas x cota x CDI desde a data) e a mais nova vale', () => {
  const { ss, sb, props } = montar();
  sb.completarTitulosRendaFixaDireto();
  assert.equal(carteira(ss).valor('L9'), 270, 'sem cota informada: a estimativa do histórico');
  const r = plain(sb.definirCotaFundoRf_(ss, { titulo: NOME, cota: '2,10', data: '2026-10-05' }));
  assert.equal(r.cota, 2.1);
  assert.equal(r.data, '2026-10-05');
  const guardado = JSON.parse(props.get('COTAS_FUNDOS_RF'));
  assert.equal(guardado[NOME.toUpperCase()].cota, 2.1);
  // 130 cotas x 2,10 = 273,00; o CDI dos dias DEPOIS de 05/10 (06 e 07): 0,05% cada
  assert.equal(carteira(ss).valor('L9'), Math.round(130 * 2.1 * 1.0005 * 1.0005 * 100) / 100);
  assert.equal(carteira(ss).valor('L9'), 273.27);
  assert.equal(sb.cotaInformadaFundoRf_(NOME).cota, 2.1);
  // outra cota, mais nova: substitui; mais velha: recusa
  sb.definirCotaFundoRf_(ss, { titulo: NOME, cota: '2,12', data: '2026-10-07' });
  assert.equal(carteira(ss).valor('L9'), 275.6, '130 x 2,12 no próprio dia (sem CDI depois)');
  assert.throws(() => sb.definirCotaFundoRf_(ss, { titulo: NOME, cota: '2,00', data: '2026-10-01' }), /já existe uma cota mais recente \(07\/10\/2026\)/);
  assert.equal(sb.cotaInformadaFundoRf_(NOME).cota, 2.12, 'a recusada não grava');
});

test('cota informada: valida cota e data; não mexe em título que não é o fundo', () => {
  const { ss, sb } = montar();
  for (const cota of ['', '0', '-1', 'abc', '2000000']) assert.throws(() => sb.definirCotaFundoRf_(ss, { titulo: NOME, cota, data: '2026-10-05' }), /cota inválida/, cota);
  assert.throws(() => sb.definirCotaFundoRf_(ss, { titulo: NOME, cota: '2', data: '2027-01-01' }), /futuro/);
  assert.throws(() => sb.definirCotaFundoRf_(ss, { titulo: NOME, cota: '2', data: '05/10/2026' }), /data inválida/);
  assert.throws(() => sb.definirCotaFundoRf_(ss, { titulo: '', cota: '2', data: '2026-10-05' }), /título não informado/);
  assert.equal(sb.numeroDaCotaRf_('R$ 1.234,5678'), 1234.5678);
  assert.equal(sb.numeroDaCotaRf_('1,65430189'), 1.65430189);
  assert.equal(sb.numeroDaCotaRf_('1.65430189'), 1.65430189);
  assert.equal(sb.cotaInformadaFundoRf_('Tesouro Selic 2029'), null);
  assert.equal(sb.cotaInformadaFundoRf_(NOME), null, 'nada informado ainda');
});

test('Router: a ação definirCotaFundoRf existe e a resposta da tela do título traz a cota informada e o CDI mensal do fundo', () => {
  const { ss, sb } = montar();
  assert.match(fs.readFileSync(new URL('../../apps-script/Router.gs', import.meta.url), 'utf8'), /action === 'definirCotaFundoRf'[\s\S]{0,200}handleDefinirCotaFundoRf\(e\)/);
  assert.equal(typeof sb.handleDefinirCotaFundoRf, 'function');
  sb.completarTitulosRendaFixaDireto();
  sb.definirCotaFundoRf_(ss, { titulo: NOME, cota: '2,10', data: '2026-10-05' });
  const tela = plain(sb.montarTelaAtivoRendaFixa_(`${NOME}|${INST}`));
  assert.equal(tela.ok, true);
  assert.equal(tela.fundo.cotaInformada.cota, 2.1);
  assert.equal(tela.fundo.cotaInformada.data, '2026-10-05');
  assert.ok(Object.keys(tela.fundo.cdiMensal).includes('2026-09'), 'mês completo');
  assert.ok(!Object.keys(tela.fundo.cdiMensal).includes('2026-10'), 'o mês de hoje não entra (incompleto)');
  assert.equal(tela.fundo.cdiMensal['2026-09'], 0.05, 'um dia de 0,05% em setembro (na massa de teste)');
  assert.equal(tela.ativo.totalAtualizado, 273.27, 'o valor do título que a tela mostra já é pela cota');
  assert.equal(tela.transacoes.length, 3, 'a linha completa casa com as movimentações (extrato do título)');
  // título que não é fundo: sem o bloco
  const outro = montar({ carteira: [['COD0', 'Renda Emergencial', 'Tesouro Selic 2029', 'Tesouro Selic (LFT)', 'SELIC', INST, 1, '', 1000, '', '', 1300]] });
  assert.equal(plain(outro.sb.montarTelaAtivoRendaFixa_(`Tesouro Selic 2029|${INST}`)).fundo, null);
});

test('destino "Reservado para objetivos": o seletor grava a coluna B com a linha incompleta (sem instituição) e com a completa', () => {
  const { ss, sb } = montar({ carteira: [[NOME, 'Renda Fixa', NOME]] });
  let r = plain(sb.definirDestinoRendaFixa_(ss, { titulo: NOME, instituicao: '', destino: 'objetivo' }));
  assert.equal(r.coluna, 'Objetivo');
  assert.equal(carteira(ss).valor('B9'), 'Objetivo');
  sb.completarTitulosRendaFixaDireto();
  assert.equal(carteira(ss).valor('F9'), INST);
  assert.equal(carteira(ss).valor('B9'), 'Objetivo', 'completar não desfaz o destino escolhido');
  r = plain(sb.definirDestinoRendaFixa_(ss, { titulo: NOME, instituicao: INST, destino: 'longo-prazo' }));
  assert.equal(carteira(ss).valor('B9'), 'Renda Fixa');
  r = plain(sb.definirDestinoRendaFixa_(ss, { titulo: NOME, instituicao: INST, destino: 'objetivo' }));
  assert.equal(carteira(ss).valor('B9'), 'Objetivo');
  assert.equal(sb.destinoRendaFixa_(carteira(ss).valor('B9')), 'objetivo');
});

test('Carteiras RF: o fundo completo mostra tipo, indexador, cotas e valor, e vai pro destino Objetivo', () => {
  const { ss, sb } = montar();
  sb.completarTitulosRendaFixaDireto();
  const c = plain(sb.montarCarteirasRendaFixa_());
  const a = c.ativos.find((x) => x.nomePersonalizado === NOME);
  assert.equal(a.tipoInvestimento, 'Fundo de Investimento');
  assert.equal(a.instituicao, INST);
  assert.equal(a.quantidade, 130);
  assert.equal(a.totalAtualizado, 270);
  assert.equal(a.tipoCarteira, 'objetivo');
  assert.equal(c.resumo.totalAtualizado, 270);
});

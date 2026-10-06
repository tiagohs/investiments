// tests/harness/deduplicacao.test.js
//
// 06/10/2026: apps-script/Deduplicacao.gs - módulo único de idempotência das gravações de movimentação
// (Tiago: "garanta que se eu reimportar novas transações, movimentações, etc, não se repita na planilha,
// não importa o ativo"). Planilha falsa, valores e instituições INVENTADOS.
//  - reimportar o mesmo arquivo 2x não muda nada (Brasil, EUA, Renda Fixa + lote de RF, proventos);
//  - "S/A" x "S/A." (x "S.A." x tab/quebra) é a mesma instituição;
//  - 2 compras idênticas legítimas no arquivo entram as 2; 3 no arquivo e 1 na planilha grava 2;
//  - o mesmo extrato em 2 arquivos do mesmo lote vale 1 vez só; forcar só vale no lançamento Manual;
//  - importação B3 antiga (importarTransacoesB3_), Gastos, Aportes concluídos e Caixa em dólar;
//  - relatorioDuplicadasPlanilha só LISTA (aba/linha), não apaga.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planilhaFalsa, sandboxGas, D, plain } from './planilha-falsa.mjs';

const brancas = (n) => Array.from({ length: n }, () => ['']);
const RF_INST = 'XP INVESTIMENTOS CCTVM S/A';

function montar() {
  const ss = planilhaFalsa({
    'Transações': [...brancas(5), ['Ticker', 'Data', 'Tipo', 'Preço', 'Qtd.', 'Taxa']],
    'Transações - USA': [...brancas(5), ['Ticker']],
    'Transações Renda Fixa': [...brancas(5), ['Produto']],
    'Proventos': [...brancas(7), ['Data Com']],
    'Proventos - USA': [...brancas(7), ['Data Com']],
    'RF Contratada - Lotes': [['Título']],
    'Carteira Ações': [['Ticker'], ['ABCD3']],
    'Carteira FIIs': [['Ticker'], ['TEST11']],
    'Auxiliar_ativos': [['Classe', 'Ticker'], ['Ações EUA', 'AAA']],
  });
  const { sb, registro } = sandboxGas(ss);
  const d = (s) => D(sb, s, 12);
  return { ss, sb, registro, d };
}

const tudo = (ss) => JSON.stringify(Object.keys(ss.abas).filter((n) => !n.startsWith('aux_')).sort().map((n) => [n, ss.abas[n].l.map((r) => r.map((x) => (x && x.v instanceof Date ? x.v.getTime() : x && x.v)))]));
const linhasDe = (ss, aba, primeira) => ss.abas[aba].l.slice(primeira - 1).filter((r) => r && r[0] && r[0].v !== '' || (r && r[2] && r[2].v !== ''));

const compra = (o = {}) => ({ destino: 'transacoes', ticker: 'ABCD3', data: '2026-08-10', tipo: 'Compra', preco: 20, qtd: 10, taxa: 0, arquivo: 'neg.xlsx', ...o });
const compraEua = (o = {}) => ({ destino: 'transacoesUsa', ticker: 'AAA', data: '2026-04-09', tipo: 'Compra', preco: 8.28, qtd: 2, taxa: 0, arquivo: 'ibkr.csv', ...o });
const tesouro = (o = {}) => ({ destino: 'rendaFixa', produto: 'Tesouro Selic 2029', data: '2026-09-02', movimentacao: 'Compra', entradaSaida: 'Credito', instituicao: RF_INST, qtd: 0.5, preco: 15000, valor: 7500, taxaContratada: 'SELIC + 0,05%', arquivo: 'mov.xlsx', ...o });
const provento = (o = {}) => ({ destino: 'proventos', ticker: 'TEST11', dataCom: '2026-08-20', dataPagamento: '2026-08-25', tipo: 'Rendimento', qtd: 10, valorPorCota: 0.8, valor: 8, arquivo: 'prov.xlsx', ...o });

test('chave canônica: S/A = S/A. = S.A. = SA (com tab/quebra/espaços), alias de ticker e arredondamento', () => {
  const { sb } = montar();
  const k = (inst) => sb.chaveDedup_('rendaFixa', { produto: 'Tesouro Selic 2029', data: '2026-09-02', movimentacao: 'Compra', instituicao: inst, qtd: 0.5, preco: 15000, valor: 7500 });
  const base = k('BANCO ALFA S/A');
  ['BANCO ALFA S/A.', 'BANCO ALFA S.A.', 'banco alfa sa', '\t\nBANCO  ALFA S/A \n'].forEach((v) => assert.equal(k(v), base, JSON.stringify(v)));
  assert.notEqual(k('BANCO BETA S/A'), base);
  assert.equal(k(RF_INST), k('XP INVESTIMENTOS CCTVM S/A.'));
  const t = (o) => sb.chaveDedup_('transacoes', { ticker: 'ABCD3', data: '2026-08-10', tipo: 'Compra', qtd: 10, preco: 20, ...o });
  assert.equal(t({ preco: 20.000001 }), t({}), 'preço ao centavo');
  assert.equal(t({ qtd: '10,0000001' }), t({}), 'quantidade na precisão da aba');
  assert.equal(t({ ticker: 'elet3' }), t({ ticker: 'AXIA3' }), 'ticker pelo alias (renomeação)');
  assert.notEqual(t({ preco: 20.01 }), t({}));
  assert.notEqual(sb.chaveDedup_('transacoesUsa', { ticker: 'ABCD3', data: '2026-08-10', tipo: 'Compra', qtd: 10, preco: 20 }), t({}), 'conta/moeda separa Brasil de EUA');
});

test('reimportar o mesmo arquivo 2x não muda nada (Brasil, EUA, Renda Fixa + lote, proventos) e a resposta conta as ignoradas', () => {
  const { ss, sb, registro } = montar();
  const itens = () => [compra(), compra({ ticker: 'TEST11', preco: 100, qtd: 1 }), compraEua(), tesouro(), provento()];
  const r1 = plain(sb.importarLancamentos_(itens(), { simular: false, origem: 'Teste' }));
  assert.equal(r1.gravadas, 5);
  assert.equal(r1.lotesRf, 1);
  assert.equal(r1.ignoradasDuplicadas, 0);
  const depois1 = tudo(ss);
  const r2 = plain(sb.importarLancamentos_(itens(), { simular: false, origem: 'Teste' }));
  assert.equal(tudo(ss), depois1, 'a 2ª vez não escreve nada');
  assert.deepEqual([r2.gravadas, r2.total, r2.lotesRf, r2.ignoradasDuplicadas], [0, 0, 0, 5]);
  assert.equal(r2.exemplos.length, 5);
  assert.match(r2.exemplos.join('|'), /ABCD3 · Compra · 10\/08\/2026 · 10 × R\$ 20,00/);
  assert.match(r2.exemplos.join('|'), /AAA · Compra · 09\/04\/2026 · 2 × US\$ 8,28/);
  assert.ok(r2.itens.every((c) => c.situacao === 'lancado'));
  // simular também conta
  const r3 = plain(sb.importarLancamentos_(itens(), { simular: true }));
  assert.equal(r3.ignoradasDuplicadas, 5);
  assert.equal(registro.length, 1, 'só a 1ª vez grava no Registro de Controle');
});

test('Tesouro: "S/A" x "S/A." é a mesma instituição - nas Transações RF e no lote de RF Contratada', () => {
  const { ss, sb, d } = montar();
  // a planilha já tem a compra (instituição com ponto) e o lote
  ss.abas['Transações Renda Fixa'].getRange(7, 1, 1, 8).setValues([['Tesouro Selic 2029', d('2026-09-02'), 'Compra', 'Credito', 'XP INVESTIMENTOS CCTVM S/A.', 0.5, 15000, 7500]]);
  ss.abas['RF Contratada - Lotes'].getRange(2, 1, 1, 9).setValues([['Tesouro Selic 2029', 'XP INVESTIMENTOS CCTVM S/A.', d('2026-09-02'), 0.5, 15000, 7500, 'SELIC', 0.0005, 'SELIC + 0,05%']]);
  const antes = tudo(ss);
  const r = plain(sb.importarLancamentos_([tesouro({ instituicao: 'XP INVESTIMENTOS CCTVM S/A' })], { simular: false, origem: 'Teste' }));
  assert.deepEqual([r.gravadas, r.lotesRf, r.ignoradasDuplicadas], [0, 0, 1]);
  assert.equal(tudo(ss), antes);
  // lote já existe mas a compra é nova na aba de Transações (ex.: linha apagada): o lote não vira 2
  const { ss: ss2, sb: sb2, d: d2 } = montar();
  ss2.abas['RF Contratada - Lotes'].getRange(2, 1, 1, 9).setValues([['Tesouro Selic 2029', '\tXP INVESTIMENTOS CCTVM S/A.\n', d2('2026-09-02'), 0.5, 15000, 7500, 'SELIC', 0.0005, 'SELIC + 0,05%']]);
  const r2 = plain(sb2.importarLancamentos_([tesouro()], { simular: false, origem: 'Teste' }));
  assert.deepEqual([r2.gravados.rendaFixa, r2.lotesRf, r2.ignoradasDuplicadas], [1, 0, 1]);
  assert.match(r2.exemplos.join('|'), /Lote de RF Contratada: Tesouro Selic 2029/);
  assert.equal(ss2.abas['RF Contratada - Lotes'].getLastRow(), 2);
});

test('compras idênticas legítimas: 2 no arquivo entram as 2; 3 no arquivo e 1 na planilha grava só 2', () => {
  const { ss, sb } = montar();
  const r = plain(sb.importarLancamentos_([compra(), compra()], { simular: false, origem: 'Teste' }));
  assert.deepEqual([r.gravadas, r.ignoradasDuplicadas], [2, 0]);
  assert.equal(linhasDe(ss, 'Transações', 7).length, 2);
  // reimportar as mesmas 2: nada
  assert.equal(plain(sb.importarLancamentos_([compra(), compra()], { simular: false, origem: 'Teste' })).gravadas, 0);
  // agora 3 iguais num arquivo novo, planilha com as 2 -> grava 1
  const r3 = plain(sb.importarLancamentos_([compra(), compra(), compra()], { simular: false, origem: 'Teste' }));
  assert.deepEqual([r3.gravadas, r3.ignoradasDuplicadas], [1, 2]);
  assert.equal(linhasDe(ss, 'Transações', 7).length, 3);
  // outra planilha: 1 existente, 3 no arquivo -> grava 2
  const m = montar();
  m.sb.importarLancamentos_([compra()], { simular: false, origem: 'Teste' });
  const rr = plain(m.sb.importarLancamentos_([compra(), compra(), compra()], { simular: false, origem: 'Teste' }));
  assert.deepEqual([rr.gravadas, rr.ignoradasDuplicadas], [2, 1]);
  assert.equal(linhasDe(m.ss, 'Transações', 7).length, 3);
  assert.deepEqual(rr.itens.map((c) => c.situacao), ['lancado', 'gravado', 'gravado']);
});

test('preço diferente no mesmo dia é outra compra; o mesmo extrato em 2 arquivos do lote vale 1 vez; 2 iguais em cada arquivo = 2', () => {
  const { ss, sb } = montar();
  const r = plain(sb.importarLancamentos_([
    compra({ arquivo: 'negociacao.xlsx' }), compra({ arquivo: 'movimentacao.xlsx' }),
    compra({ preco: 20.5, arquivo: 'negociacao.xlsx' }),
    compra({ ticker: 'TEST11', preco: 100, qtd: 1, arquivo: 'negociacao.xlsx' }), compra({ ticker: 'TEST11', preco: 100, qtd: 1, arquivo: 'negociacao.xlsx' }),
    compra({ ticker: 'TEST11', preco: 100, qtd: 1, arquivo: 'movimentacao.xlsx' }), compra({ ticker: 'TEST11', preco: 100, qtd: 1, arquivo: 'movimentacao.xlsx' }),
  ], { simular: false, origem: 'Teste' }));
  assert.equal(r.gravadas, 4, '1 + 1 (preço outro) + 2 (as 2 legítimas, vistas nos 2 arquivos)');
  assert.deepEqual(r.itens.map((c) => c.situacao), ['gravado', 'lancado', 'gravado', 'gravado', 'gravado', 'lancado', 'lancado']);
  assert.match(r.itens[1].motivo, /outro arquivo/);
  assert.equal(linhasDe(ss, 'Transações', 7).length, 4);
});

test('forcar: no arquivo nunca grava repetida; no lançamento Manual grava a 2ª operação idêntica (e o lote de RF também)', () => {
  const { ss, sb } = montar();
  sb.importarLancamentos_([compra(), tesouro()], { simular: false, origem: 'Teste' });
  let r = plain(sb.importarLancamentos_([compra({ forcar: true }), tesouro({ forcar: true })], { simular: false, origem: 'Importação' }));
  assert.deepEqual([r.gravadas, r.lotesRf, r.ignoradasDuplicadas], [0, 0, 2]);
  r = plain(sb.importarLancamentos_([compra({ forcar: true })], { simular: false, origem: 'Manual' }));
  assert.equal(r.gravadas, 1);
  assert.equal(linhasDe(ss, 'Transações', 7).length, 2);
  r = plain(sb.importarLancamentos_([tesouro({ forcar: true })], { simular: false, origem: 'Manual' }));
  assert.deepEqual([r.gravadas, r.lotesRf], [1, 1]);
  assert.equal(ss.abas['RF Contratada - Lotes'].getLastRow(), 3);
});

test('importação B3 antiga (importarTransacoesB3_): reimportar não repete, lote com 3 iguais e 1 na aba grava 2', () => {
  const { ss, sb } = montar();
  const lote = (n) => ({ transacoes: JSON.stringify(Array.from({ length: n }, () => ({ ticker: 'ABCD3', data: '2026-09-02', tipo: 'Compra', preco: 22.08, qtd: 50, taxa: 1.9 }))) });
  let r = plain(sb.importarTransacoesB3_(lote(1), null));
  assert.deepEqual([r.gravadas.length, r.ignoradasDuplicadas], [1, 0]);
  r = plain(sb.importarTransacoesB3_(lote(1), null));
  assert.deepEqual([r.gravadas.length, r.ignoradasDuplicadas], [0, 1]);
  assert.match(r.exemplos[0], /ABCD3 · Compra · 02\/09\/2026 · 50 × R\$ 22,08/);
  r = plain(sb.importarTransacoesB3_(lote(3), null));
  assert.deepEqual([r.gravadas.length, r.ignoradasDuplicadas], [2, 1]);
  assert.equal(linhasDe(ss, 'Transações', 7).length, 3);
  // rejeitada continua rejeitada (não conta como duplicada)
  r = plain(sb.importarTransacoesB3_({ transacoes: JSON.stringify([{ ticker: 'ZZZZ3', data: '2026-09-02', tipo: 'Compra', preco: 1, qtd: 1 }]) }, null));
  assert.deepEqual([r.rejeitadas.length, r.ignoradasDuplicadas], [1, 0]);
});

test('proventos: o mesmo provento não entra de novo (EUA também), sem quantidade na planilha ("-") continua igual', () => {
  const { ss, sb } = montar();
  const itens = () => [provento(), { destino: 'proventosUsa', ticker: 'AAA', dataCom: '', dataPagamento: '2026-06-01', tipo: 'Dividendo', qtd: 0, valorPorCota: 0, valor: 1.5, arquivo: 'ibkr.csv' }];
  sb.importarLancamentos_([compraEua(), compra({ ticker: 'TEST11' }), ...itens()], { simular: false, origem: 'Teste' });
  const antes = tudo(ss);
  const r = plain(sb.importarLancamentos_(itens(), { simular: false, origem: 'Teste' }));
  assert.deepEqual([r.gravadas, r.ignoradasDuplicadas], [0, 2]);
  assert.equal(tudo(ss), antes);
  // lançado à mão sem quantidade ("-") e o extrato traz quantidade: continua o mesmo provento
  const r2 = plain(sb.importarLancamentos_([provento({ qtd: 12 })], { simular: false, origem: 'Teste' }));
  assert.equal(r2.gravadas, 0);
});

test('Gastos: o mesmo lançamento em outro arquivo (sem chave ou com chave diferente) não entra; repetido legítimo no arquivo entra', () => {
  const { ss, sb } = montar();
  sb.SpreadsheetApp.flush = () => {};
  const agora = new sb.Date(2026, 9, 6);
  const l = (o) => ({ mes: '2026-09', data: '2026-09-10', origem: 'cartao', fonte: 'ourocard', descricao: 'LOJA INVENTADA', categoria: 'compras', valor: 10, tipo: 'compra', parcela: '', ...o });
  const a = plain(sb.salvarImportacaoGastos_(ss, { id: 'A', nome: 'a.pdf', fonte: 'ourocard', meses: ['2026-09'] }, [l({ chaveDedup: 'k1' }), l({ chaveDedup: 'k1b' })], agora));
  assert.deepEqual([a.gravados, a.pulados, a.gravadas, a.ignoradasDuplicadas], [2, 0, 2, 0], '2 compras iguais no mesmo arquivo: as 2');
  const b = plain(sb.salvarImportacaoGastos_(ss, { id: 'B', nome: 'b.pdf', fonte: 'ourocard', meses: ['2026-09'] }, [l({}), l({ chaveDedup: 'outra-versao' }), l({ chaveDedup: 'k9', valor: 11 })], agora));
  assert.deepEqual([b.gravados, b.pulados, b.ignoradasDuplicadas], [1, 2, 2]);
  assert.match(b.exemplos[0], /LOJA INVENTADA · 10\/09\/2026 · R\$ 10,00/);
  const c = plain(sb.salvarImportacaoGastos_(ss, { id: 'C', nome: 'c.pdf', fonte: 'ourocard', meses: ['2026-09'] }, [l({ chaveDedup: 'z', descricao: 'OUTRA' }), l({ chaveDedup: 'z', descricao: 'OUTRA', data: '2026-09-11' })], agora));
  assert.equal(c.gravados, 1, 'mesma chave 2x no mesmo lote entra 1x');
  // reimportar o mesmo arquivo (mesmo id) substitui, não repete
  sb.salvarImportacaoGastos_(ss, { id: 'A', nome: 'a.pdf', fonte: 'ourocard', meses: ['2026-09'] }, [l({ chaveDedup: 'k1' }), l({ chaveDedup: 'k1b' })], agora);
  assert.equal(plain(sb.lerGastos_(ss)).lancamentos.length, 2 + 1 + 1);
});

test('Aportes concluídos e Caixa em dólar: o mesmo clique 2x não duplica (forcar deixa passar)', () => {
  const { ss, sb } = montar();
  const aporte = (o = {}) => ({ data: '2026-09-05', status: 'concluido', observacao: '', itens: [{ classe: 'acoes', ativo: 'ABCD3', instituicao: 'Corretora Alfa', qtdFinal: 10, precoFinal: 20, valorFinal: 200 }], ...o });
  const id1 = sb.salvarAporte_(aporte());
  const id2 = sb.salvarAporte_(aporte());
  assert.equal(id2, id1, 'devolve o aporte que já existe');
  assert.equal(plain(sb.lerAportes_(ss)).length, 1);
  assert.equal(plain(sb.handleSalvarAporte({ parameter: { aporte: JSON.stringify(aporte()) } })).ignoradasDuplicadas, 1);
  sb.salvarAporte_(aporte({ forcar: true }));
  assert.equal(plain(sb.lerAportes_(ss)).length, 2);
  const outro = aporte({ data: '2026-09-06' });
  sb.salvarAporte_(outro);
  assert.equal(plain(sb.lerAportes_(ss)).length, 3);

  const mov = (o = {}) => ({ tipo: 'envio', data: '2026-09-05', usd: 500, reais: 2600, ...o });
  const c1 = sb.salvarMovimentoCaixaDolar_(mov());
  assert.equal(sb.salvarMovimentoCaixaDolar_(mov()), c1);
  const resp = plain(sb.handleSalvarCaixaDolar({ parameter: { mov: JSON.stringify(mov()) } }));
  assert.deepEqual([resp.gravadas, resp.ignoradasDuplicadas], [0, 1]);
  assert.equal(plain(sb.lerCaixaDolar_(ss)).movimentos.length, 1);
  sb.salvarMovimentoCaixaDolar_(mov({ forcar: true }));
  assert.equal(plain(sb.lerCaixaDolar_(ss)).movimentos.length, 2);
});

test('relatorioDuplicadasPlanilha: só lista (aba e linha), não apaga, grava no Registro de Controle', () => {
  const { ss, sb, registro, d } = montar();
  const T = ss.abas['Transações'];
  T.getRange(7, 1, 3, 6).setValues([
    ['ABCD3', d('2026-08-10'), 'Compra', 20, 10, ''], ['TEST11', d('2026-08-10'), 'Compra', 100, 1, ''], ['ABCD3', d('2026-08-10'), 'Compra', 20, 10, 1.9],
  ]);
  ss.abas['Transações Renda Fixa'].getRange(7, 1, 2, 8).setValues([
    ['Tesouro Selic 2029', d('2026-09-02'), 'Compra', 'Credito', 'XP INVESTIMENTOS CCTVM S/A', 0.5, 15000, 7500],
    ['Tesouro Selic 2029', d('2026-09-02'), 'Compra', 'Credito', 'XP INVESTIMENTOS CCTVM S/A.', 0.5, 15000, 7500],
  ]);
  const antes = tudo(ss);
  const rel = plain(sb.relatorioDuplicadasPlanilha());
  assert.equal(tudo(ss), antes, 'não apaga nem muda nada');
  assert.equal(rel.total, 2);
  assert.deepEqual(rel.grupos.map((g) => [g.aba, g.linhas]), [['Transações', [7, 9]], ['Transações Renda Fixa', [7, 8]]]);
  assert.match(rel.grupos[0].descricao, /ABCD3 · Compra · 10\/08\/2026/);
  const reg = registro.filter((r) => r[1] === 'Duplicadas');
  assert.equal(reg.length, 1);
  assert.equal(reg[0][0], 'Atenção');
  assert.match(reg[0][2], /Transações linhas 7, 9 \(2x\)/);
  // sem repetição: avisa que está limpo
  const limpa = montar();
  assert.equal(plain(limpa.sb.relatorioDuplicadasPlanilha()).total, 0);
  assert.equal(limpa.registro.filter((r) => r[1] === 'Duplicadas')[0][0], 'Sucesso');
});

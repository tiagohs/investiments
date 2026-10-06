// tests/harness/qualidade-dados-checagens.test.js
//
// 06/10/2026 (A-81): as checagens novas de qualidade-dados.mjs (lote RF duplicado, P/VP/P/L fora da faixa, ticker "Erro" em
// Proventos, aporte "Concluído" sem lançamento, Atenção/Erro por fonte no Registro de Controle) provadas com planilha
// INVENTADA - sem fixtures.json, rodam em qualquer máquina. Provam que a checagem pega o problema E que não acusa o normal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECAGENS_QUALIDADE } from './qualidade-dados.mjs';

const checagem = (id) => CHECAGENS_QUALIDADE.find((c) => c.id === id);
const D = (iso) => ({ __date__: `${iso}T00:00:00` });
const abaRf = (linhasDados) => ({ linhas: [[], [], [], [], [], ['Produto', 'Data', 'Movimentação'], ...linhasDados] });
// Transações Renda Fixa: [produto, data, movimentação, entrada/saída, instituição, qtd, preço, valor]
const rf = (produto, dia, mov, valor, inst = 'XP') => [produto, D(dia), mov, 'Credito', inst, 1, valor, valor];

test('A-81 lote RF duplicado: pega mesmo título + mesmo valor a até 3 dias (mesmo com a instituição grafada diferente) e não acusa compras normais', () => {
  const duplicado = { 'Transações Renda Fixa': abaRf([
    rf('Tesouro Selic 2030', '2026-03-10', 'Compra', 100, 'XP INVESTIMENTOS S/A'),
    rf('Tesouro Selic 2030', '2026-03-12', 'Compra', 100, 'XP INVESTIMENTOS S/A.'), // 2 dias depois, valor igual
    rf('Tesouro Selic 2030', '2026-03-12', 'Compra', 150), // valor diferente: ok
    rf('Tesouro Selic 2030', '2026-04-10', 'Compra', 100), // 1 mês depois: ok
    rf('Tesouro IPCA+ 2035', '2026-03-10', 'Compra', 100), // outro título: ok
    rf('Tesouro Selic 2030', '2026-03-11', 'Resgate', 100), // outra movimentação: ok
  ]) };
  const msgs = checagem('loteRfDuplicado').rodar({ fixtures: duplicado });
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Transações Renda Fixa.*linhas 7 e 8.*tesouro selic 2030/);
  const lotes = { 'RF Contratada - Lotes': { linhas: [['Título'], ['Tesouro X', 'XP', D('2026-01-05'), 1, 50, 50], ['Tesouro X', 'XP', D('2026-01-05'), 1, 50, 50], ['Tesouro X', 'XP', D('2026-01-20'), 1, 50, 50]] } };
  const msgsLotes = checagem('loteRfDuplicado').rodar({ fixtures: lotes });
  assert.equal(msgsLotes.length, 1);
  assert.match(msgsLotes[0], /RF Contratada - Lotes.*linhas 2 e 3/);
  assert.deepEqual(checagem('loteRfDuplicado').rodar({ fixtures: {} }), []);
});

test('A-81 P/VP e P/L: pega valor absurdo e fontes discordando mais de 3x; aceita fontes na mesma ordem de grandeza', () => {
  const json = (v) => JSON.stringify({ valores: v });
  const fixtures = {
    aux_fundamentos: { linhas: [['Ticker', 'Fonte', 'JSON', 'Atualizado em'],
      ['AAAA3', 'yahoo', json({ pl: 10, pvp: 1.2 })], ['AAAA3', 'planilha', json({ pl: 14 })], // 1,4x: ok
      ['BBBB3', 'yahoo', json({ pl: 10.6, pvp: 1.9 })],
      ['CCCC3', 'yahoo', json({ pl: -8 })], // prejuízo: P/L negativo não é erro
    ] },
    Auxiliar_ativos: { linhas: [['Classe', 'Ticker'],
      ['Ações', 'AAAA3', '', '', '', '', '', '', '', '', '', 1.5, '', 12],
      ['Ações', 'BBBB3', '', '', '', '', '', '', '', '', '', 31.3, '', 302.9], // as duas fora da faixa e discordando
    ] },
  };
  const msgs = checagem('fundamentosFaixa').rodar({ fixtures });
  assert.equal(msgs.length, 2);
  assert.ok(msgs.some((m) => /^BBBB3 P\/VP: .*Auxiliar_ativos 31.3.*acima de 25.*discordam/.test(m)));
  assert.ok(msgs.some((m) => /^BBBB3 P\/L: .*Auxiliar_ativos 302.9.*acima de 200/.test(m)));
});

test('A-81 ticker "Erro" em Proventos: aponta a linha, a data e o valor (cabeçalho e linhas de cima ficam de fora)', () => {
  const linha = (ticker) => ['', D('2026-05-15'), ticker, 'Dividendo', 10, 1, 13.9];
  const fixtures = { Proventos: { linhas: [[], [], [], [], [], [], ['Data Com', 'Data do pagamento', 'Ticker'], linha('PETR4'), linha('Erro'), linha(' erro ')] } };
  const msgs = checagem('tickerErroProventos').rodar({ fixtures });
  assert.equal(msgs.length, 2);
  assert.match(msgs[0], /"Proventos": linha 9 com pagamento em 15\/05\/2026 \(R\$ 13\.90\) com Ticker "Erro"/);
  assert.match(msgs[1], /linha 10/);
  assert.deepEqual(checagem('tickerErroProventos').rodar({ fixtures: {} }), []);
});

test('A-81 aporte "Concluído" sem lançamento: só reprova depois de 10 dias (contados do dia da exportação)', () => {
  const pendente = (data) => ({ data, ativo: 'Tesouro Selic 2031', destino: 'rendaFixa', inst: 'XP', valor: 500, qtd: null });
  const rodar = (datas) => checagem('aporteSemLancamento').rodar({
    fixtures: { _meta: { extraidoEm: '2026-10-05T20:00:00+00:00' } },
    sandbox: { SpreadsheetApp: { getActiveSpreadsheet: () => ({}) }, lancamentosAConfirmarDaPlanilha_: () => datas.map(pendente) },
  });
  assert.deepEqual(rodar(['2026-10-04', '2026-09-26']), [], '1 e 9 dias: a importação ainda pode trazer');
  const msgs = rodar(['2026-09-20']);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Aporte de 20\/09\/2026 concluído sem lançamento: Tesouro Selic 2031 \(XP\), R\$ 500/);
});

test('A-81 Registro de Controle: conta Atenção/Erro por fonte nos últimos 7 dias (3+ execuções sem sucesso, ou 3+ Erro) e ignora fonte saudável e trava de execução simultânea', () => {
  const R = (dia, status, detalhe) => [{ __date__: `${dia}T09:00:00` }, 'Automático', status, detalhe];
  const fixtures = { 'Registro de Controle': { linhas: [['Timestamp', 'Origem', 'Status', 'Detalhe'],
    R('2026-10-05', 'Erro', 'YouTube: 0 vídeo(s) — falharam: x (Error: feed HTTP 404)'),
    R('2026-10-04', 'Erro', 'YouTube: 0 vídeo(s) — falharam: x (Error: feed HTTP 404)'),
    R('2026-10-03', 'Erro', 'YouTube: 0 vídeo(s) — falharam: x (Error: feed HTTP 404)'),
    R('2026-10-05', 'Atenção', 'FNet: 2 documento(s) — ficou pra próxima'),
    R('2026-10-04', 'Atenção', 'FNet: 2 documento(s) — ficou pra próxima'),
    R('2026-10-03', 'Sucesso', 'FNet: 9 documento(s)'), // tem sucesso: não reprova
    R('2026-10-05', 'Atenção', 'Já existe uma sincronização de preços rodando'),
    R('2026-10-04', 'Atenção', 'Já existe uma sincronização de preços rodando'),
    R('2026-10-03', 'Atenção', 'Já existe uma sincronização de preços rodando'),
    R('2026-09-20', 'Erro', 'Agenda: erro antigo'), R('2026-09-19', 'Erro', 'Agenda: erro antigo'), R('2026-09-18', 'Erro', 'Agenda: erro antigo'), // fora dos 7 dias
    R('2026-10-05', 'Sucesso', 'Renda Fixa: 33 linha(s)'), R('2026-10-04', 'Erro', 'Renda Fixa falhou: DNS'), R('2026-10-03', 'Erro', 'Renda Fixa falhou: DNS'), R('2026-10-02', 'Erro', 'Renda Fixa falhou: DNS'),
  ] } };
  const msgs = checagem('registroFontesComProblema').rodar({ fixtures });
  assert.equal(msgs.length, 2);
  assert.match(msgs.find((m) => m.startsWith('YouTube')), /3 execução\(ões\).*0 sucesso, 0 atenção, 3 erro \(nenhuma deu certo\)/);
  assert.match(msgs.find((m) => m.startsWith('Renda Fixa')), /4 execução\(ões\).*1 sucesso, 0 atenção, 3 erro\./);
  assert.deepEqual(checagem('registroFontesComProblema').rodar({ fixtures: {} }), []);
});

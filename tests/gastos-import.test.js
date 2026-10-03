// tests/gastos-import.test.js
//
// 02/10/2026: leitores de fatura/extrato da seção Gastos (gastos-import.js).
// Linhas INVENTADAS que imitam o que o pdf.js entrega (colunas separadas por
// 2 espaços) - nada de dado real (o repositório é público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  valorBR, limparDescricao, parcelaDe, identificarDocumentoGasto, lerFaturaNubank, lerFaturaOurocard, lerExtratoNubank,
  lerExtratoBradesco, lerCsvGastos, lerOfxGastos, lerDocumentoGasto, mesesDoDocumento, mesmoNome, tipoMovimentoConta,
} from '../assets/js/pages/gastos-import.js';

const FATURA_NU = [
  'Olá, Fulano.', 'Esta é a sua fatura de', 'março, no valor de', 'R$ 410,00', 'Data de vencimento: 10 MAR 2025',
  'FULANO DE TAL', 'FATURA 10 MAR 2025  EMISSÃO E ENVIO 01 MAR 2025', 'RESUMO DA FATURA ATUAL',
  'Fatura anterior  R$ 300,00', 'Pagamento recebido  -R$ 300,00', 'Total de compras de todos os cartões, 01 FEV a 01 MAR  R$ 430,00',
  'Outros Lançamentos  -R$ 20,00', 'Total a pagar  R$ 410,00',
  'TRANSAÇÕES  DE 01 FEV A 01 MAR',
  '28 JAN  Loja Inventada - Parcela 2/4  R$ 100,00',
  '03 FEV  Mercado Exemplo  R$ 150,00',
  '05 FEV  Pagamento em 05 FEV  -R$ 300,00',
  '10 FEV  Streaming Teste*123456789  R$ 40,00',
  '12 FEV  Estorno de "Mercado Exemplo"  -R$ 20,00',
  '20 FEV  Site Gringo  R$ 140,00', 'USD 25,00',
  '1 de 3',
];

test('Nubank cartão: vencimento, ano das compras de dezembro/janeiro, parcela, pagamento, estorno, USD e soma que confere', () => {
  assert.equal(identificarDocumentoGasto(FATURA_NU), 'nubank-cartao');
  const f = lerFaturaNubank(FATURA_NU);
  assert.equal(f.mes, '2025-03');
  assert.equal(f.vencimento, '2025-03-10');
  assert.equal(f.lancamentos.length, 6);
  const [parc, merc, pag, stream, est, usd] = f.lancamentos;
  assert.equal(parc.data, '2025-01-28');
  assert.equal(parc.parcela, '2/4');
  assert.equal(merc.mes, '2025-03', 'competência = mês do vencimento');
  assert.equal(pag.tipo, 'pagamento_fatura');
  assert.equal(pag.valor, -300);
  assert.equal(stream.descricao, 'Streaming Teste*', 'código longo sai da descrição');
  assert.equal(est.tipo, 'estorno');
  assert.equal(usd.moeda, 'USD');
  assert.equal(usd.valorOriginal, 25);
  assert.equal(f.conferencia.ok, true, JSON.stringify(f.conferencia));
  assert.equal(f.total, 410);
});

test('Nubank cartão: soma que não bate vira aviso na conferência', () => {
  const f = lerFaturaNubank(FATURA_NU.filter((l) => !l.startsWith('10 FEV')));
  assert.equal(f.conferencia.ok, false);
  assert.equal(f.conferencia.diferenca, -40);
});

const OUROCARD = [
  'OUROCARD VISA INVENTADO', 'BANCO DO BRASIL', 'Vencimento  15/10/2025', 'Total desta fatura  R$ 1.134,00',
  'Saldo fatura anterior  R$ 900,00',
  'Data  Descrição  País  Valor em R$  Valor em US$',
  '08/09  PGTO DEBITO CONTA 1234 000000123456  BR  -900,00  0,00',
  '01/09  SUPERMERCADO INVENTADO  SAO PAULO  BR  R$ 234,00',
  '12/09  LOJA DE MOVEIS PARC 03/10  SAO PAULO  BR  R$ 500,00',
  '20/09  SERVICO NA NUVEM  SEATTLE  US  R$ 480,00  US$ 90,00',
  '21/09  IOF COMPRA NO EXTERIOR  16,80',
  '25/08  ESTORNO LOJA X  -96,80',
  'SUBTOTAL  1.134,00',
];

test('OuroCard: colunas do pdf.js, cidade/país fora da descrição, pagamento, parcela, US$, IOF, estorno e conferência pelo saldo anterior', () => {
  assert.equal(identificarDocumentoGasto(OUROCARD), 'ourocard');
  const f = lerFaturaOurocard(OUROCARD);
  assert.equal(f.mes, '2025-10');
  assert.equal(f.lancamentos.length, 6);
  const por = Object.fromEntries(f.lancamentos.map((l) => [l.tipo + (l.parcela ? '-p' : ''), l]));
  assert.equal(por.pagamento_fatura.valor, -900);
  assert.doesNotMatch(por.pagamento_fatura.descricao, /\d{6,}|1234/, 'número de conta sai');
  assert.equal(por['compra-p'].parcela, '3/10');
  assert.equal(por['compra-p'].descricao, 'LOJA DE MOVEIS PARC 03/10');
  assert.equal(por.iof.valor, 16.8);
  assert.equal(por.estorno.valor, -96.8);
  const nuvem = f.lancamentos.find((l) => /NUVEM/.test(l.descricao));
  assert.equal(nuvem.descricao, 'SERVICO NA NUVEM');
  assert.equal(nuvem.moeda, 'USD');
  assert.equal(nuvem.valor, 480);
  const sup = f.lancamentos.find((l) => /SUPERMERCADO/.test(l.descricao));
  assert.equal(sup.data, '2025-09-01');
  assert.equal(f.lancamentos.find((l) => l.tipo === 'estorno').data, '2025-08-25');
  assert.equal(f.conferencia.ok, true, JSON.stringify(f.conferencia));
});

test('OuroCard: sem colunas (texto corrido) e sem saldo anterior - confere contra o total sem os pagamentos', () => {
  const f = lerFaturaOurocard([
    'Ourocard - fatura', 'Vencimento: 05/01/2026', 'Total da fatura R$ 150,00',
    '10/12 PAGAMENTO DE FATURA -99,00', '15/12 PAG*PADARIA EXEMPLO 50,00', '02/01 ANUIDADE DIFERENCIADA PARC 01/12 100,00',
  ]);
  assert.equal(f.lancamentos.length, 3);
  assert.equal(f.lancamentos[0].data, '2025-12-10');
  assert.equal(f.lancamentos[1].tipo, 'compra', 'PAG* não é pagamento da fatura');
  assert.equal(f.lancamentos[2].tipo, 'anuidade');
  assert.equal(f.conferencia.ok, true);
});

const EXTRATO_NU = [
  'Fulano de Tal Exemplo', 'CPF  •••.111.222-••  Agência  0001  Conta', '1234567-8',
  '01 DE MARÇO DE 2025  a  31 DE MARÇO DE 2025  VALORES EM R$',
  'Saldo inicial  1.000,00', 'Rendimento líquido  +0,50', 'Saldo final do período', 'Total de entradas  +3.000,00', 'R$ 500,50', 'Total de saídas  -3.500,00',
  'Movimentações',
  '03 MAR 2025  Total de entradas  + 3.000,00',
  'Transferência recebida pelo Pix  EMPRESA PAGADORA LTDA - 12.345.678/0001-90 -  3.000,00', 'BANCO X (0001) Agência: 1 Conta: 12345-6',
  'Total de saídas  - 1.700,00',
  'Pagamento de fatura  1.000,00',
  'Transferência enviada pelo Pix  FULANO DE TAL EXEMPLO - •••.111.222-•• - BANCO Y  500,00', 'S.A. (0002) Agência: 9 Conta: 999-1',
  'Transferência enviada pelo Pix  Beltrana Diarista Silva - •••.333.444-•• -  200,00', 'NU PAGAMENTOS - IP (0260) Agência: 1 Conta:', '55555-5',
  'Tem alguma dúvida? Mande uma mensagem', 'Extrato gerado dia 01 de abril de 2025 às 10:00  1 de 2',
  'Fulano de Tal Exemplo', 'CPF  •••.111.222-••  Agência  0001  Conta', '1234567-8', '01 DE MARÇO DE 2025  a  31 DE MARÇO DE 2025  VALORES EM R$',
  '10 MAR 2025  Total de saídas  - 1.800,00',
  'Pagamento de boleto efetuado CONDOMINIO INVENTADO  900,00',
  'Aplicação RDB  800,00',
  'Compra no débito  PADARIA DA RUA  100,00',
];

test('Nubank conta: só saídas (entradas viram total), pagamento de fatura e Pix pra si mesmo marcados, aplicação, boleto, dados bancários fora, soma confere', () => {
  assert.equal(identificarDocumentoGasto(EXTRATO_NU), 'nubank-conta');
  const e = lerExtratoNubank(EXTRATO_NU);
  assert.deepEqual(e.meses, ['2025-03']);
  assert.equal(e.total, 3500);
  assert.equal(e.entradas, 3000);
  assert.equal(e.lancamentos.length, 6);
  const tipos = e.lancamentos.map((l) => l.tipo);
  assert.deepEqual(tipos, ['pagamento_fatura', 'transferencia_propria', 'transferencia', 'boleto', 'investimento', 'compra']);
  const diarista = e.lancamentos[2];
  assert.equal(diarista.descricao, 'Pix enviado · Beltrana Diarista Silva');
  assert.equal(diarista.data, '2025-03-03');
  assert.equal(e.lancamentos[3].data, '2025-03-10');
  assert.match(e.lancamentos[3].descricao, /CONDOMINIO INVENTADO/);
  e.lancamentos.forEach((l) => assert.doesNotMatch(l.descricao, /•|Agência|Conta:|\d{5,}/));
  assert.equal(e.conferencia.ok, true, JSON.stringify(e.conferencia));
});

const BRADESCO = [
  'Bradesco Celular', 'Data: 01/01/2026 - 10h00', 'Nome: FULANO DE TAL EXEMPLO',
  'Extrato de: Agência: 1111 | Conta: 22222-3 | Movimentação entre: 01/01/2025 e 31/03/2025  Folha: 1/2',
  'Data  Histórico  Docto.  Crédito (R$)  Débito (R$)  Saldo (R$)',
  '30/12/2024  COD. LANC. 0  0,00  100,00',
  'PIX RECEBIDO', '05/01/2025  1111111  1.000,00  1.100,00', 'REM: Fulano De Tal Exem 05/01',
  'TRANSF AUTORIZ ENTRE AGS', '0222222  800,00  300,00', 'IMOBILIARIA INVENTADA LTDA',
  'COMPRA CARTAO VISA', '10/01/2025  0333333  50,00  250,00', 'PADARIA DO BAIRRO',
  'Bradesco Celular', 'Data: 01/01/2026 - 10h00', 'Nome: FULANO DE TAL EXEMPLO',
  'Extrato de: Agência: 1111 | Conta: 22222-3 | Movimentação entre: 01/01/2025 e 31/03/2025  Folha: 2/2',
  'Data  Histórico  Docto.  Crédito (R$)  Débito (R$)  Saldo (R$)',
  'TARIFA BANCARIA', '15/02/2025  0444444  30,00  220,00', 'CESTA EXEMPLO',
  'PIX ENVIADO', '0555555  20,00  200,00', 'DES: Fulano De Tal Exem 15/02',
  'Total  1.000,00  900,00  200,00',
];

test('Bradesco: crédito x débito pelo saldo, histórico + complemento, Pix pra si mesmo, entradas fora', () => {
  assert.equal(identificarDocumentoGasto(BRADESCO), 'bradesco');
  const b = lerExtratoBradesco(BRADESCO);
  assert.deepEqual(b.meses, ['2025-01', '2025-02', '2025-03']);
  assert.equal(b.lancamentos.length, 4);
  assert.deepEqual(b.lancamentos.map((l) => [l.data, l.tipo, l.valor]), [
    ['2025-01-05', 'transferencia', 800], ['2025-01-10', 'compra', 50], ['2025-02-15', 'tarifa', 30], ['2025-02-15', 'transferencia_propria', 20],
  ]);
  assert.match(b.lancamentos[0].descricao, /IMOBILIARIA INVENTADA/);
  assert.equal(b.lancamentos[1].descricao, 'PADARIA DO BAIRRO');
  assert.equal(b.entradas, 1000);
  assert.equal(b.total, 900);
  assert.equal(b.conferencia.ok, true);
});

test('CSV do Nubank (cartão e conta) e OFX', () => {
  const c = lerCsvGastos('date,title,amount\n2025-02-03,Mercado Exemplo,150.00\n2025-02-05,Pagamento recebido,-300.00\n2025-02-10,Loja - Parcela 1/3,33.33\n', { nome: 'Nubank_2025-03-10.csv' });
  assert.equal(c.fonte, 'nubank-cartao');
  assert.equal(c.mes, '2025-03');
  assert.deepEqual(c.lancamentos.map((l) => l.tipo), ['compra', 'pagamento_fatura', 'compra']);
  assert.equal(c.lancamentos[2].parcela, '1/3');
  const k = lerCsvGastos('Data,Valor,Identificador,Descrição\n03/02/2025,-175.00,abc,Transferência enviada pelo Pix - Beltrana Exemplo - •••.333.444-•• - NU PAGAMENTOS\n04/02/2025,500.00,def,Transferência recebida pelo Pix - Empresa\n');
  assert.equal(k.fonte, 'nubank-conta');
  assert.equal(k.lancamentos.length, 1);
  assert.equal(k.lancamentos[0].valor, 175);
  assert.equal(k.lancamentos[0].descricao, 'Pix enviado · Beltrana Exemplo');
  const o = lerOfxGastos('<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250203120000<TRNAMT>-42.50<MEMO>FARMACIA EXEMPLO</STMTTRN><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250204<TRNAMT>100.00<MEMO>SALARIO</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
  assert.equal(o.lancamentos.length, 1);
  assert.equal(o.lancamentos[0].valor, 42.5);
  assert.deepEqual(mesesDoDocumento(o), ['2025-02']);
});

test('auxiliares: valor BR, limpeza de descrição, parcela, mesmo nome, tipo de movimento, documento desconhecido', () => {
  assert.equal(valorBR('-R$ 1.234,56'), -1234.56);
  assert.equal(valorBR('- 15,00'), -15);
  assert.equal(valorBR('+7,00'), 7);
  assert.equal(valorBR('abc'), null);
  assert.equal(limparDescricao('Pix  EMPRESA X - 12.345.678/0001-90 - BANCO (0341) Agência: 12 Conta: 3456-7'), 'Pix EMPRESA X - BANCO');
  assert.equal(limparDescricao('CONTA DE LUZ · ENEL'), 'CONTA DE LUZ · ENEL', '"conta" sem número fica');
  assert.equal(limparDescricao('LOJA 4111111111111111 X'), 'LOJA X');
  assert.equal(parcelaDe('Amazon - Parcela 1/2'), '1/2');
  assert.equal(parcelaDe('LOJA PARC.03 DE 10'), '3/10');
  assert.equal(parcelaDe('DIA 25/12'), '', 'data não é parcela');
  assert.ok(mesmoNome('Fulano De Tal Exem', 'FULANO DE TAL EXEMPLO'));
  assert.ok(!mesmoNome('Fulano', 'FULANO DE TAL EXEMPLO'), 'nome curto demais não conta');
  assert.equal(tipoMovimentoConta('Resgate RDB', 'entrada'), 'resgate');
  assert.equal(tipoMovimentoConta('PAGTO CARTAO CREDITO', 'saida'), 'pagamento_fatura');
  assert.ok(lerDocumentoGasto(['qualquer coisa']).erro);
  assert.equal(identificarDocumentoGasto(['nada aqui'], { origem: 'cartao', banco: 'OuroCard' }), 'ourocard', 'a pasta do Drive ajuda');
});

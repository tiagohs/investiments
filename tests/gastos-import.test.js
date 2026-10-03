// tests/gastos-import.test.js
//
// 02/10/2026: leitores de fatura/extrato da seção Gastos (gastos-import.js).
// Linhas INVENTADAS que imitam o que o pdf.js entrega (colunas separadas por
// 2 espaços) - nada de dado real (o repositório é público).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  valorBR, limparDescricao, parcelaDe, identificarDocumentoGasto, lerFaturaNubank, lerFaturaOurocard, lerExtratoNubank,
  lerExtratoBradesco, lerCsvGastos, lerOfxGastos, lerDocumentoGasto, mesesDoDocumento, mesmoNome, tipoMovimentoConta, linhasDeItens,
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

// ---------------------------------------------------------------------------
// 03/10/2026: formatos reais que falhavam (linhas INVENTADAS no mesmo formato)
// ---------------------------------------------------------------------------

// Nubank até 2023: sem "R$", pagamento POSITIVO ("Pagamento em ..."), parcela "- 2/3"
const FATURA_NU_ANTIGA = [
  'Olá, Fulano!', 'Esta é a sua fatura de', 'abril, no valor de', 'R$ 300,00', 'Data do vencimento: 11 ABR 2023',
  'FULANO DE TAL', 'FATURA  11 ABR 2023  EMISSÃO E ENVIO  04 ABR 2023',
  'RESUMO DA FATURA ATUAL  VALORES EM R$', 'Fatura anterior  100,00', 'Pagamentos recebidos  250,00', 'Total de compras, 04 MAR a 04 ABR  450,00', 'Total a pagar  R$ 300,00',
  '3 de 5', 'FULANO DE TAL', 'FATURA  11 ABR 2023  EMISSÃO E ENVIO  04 ABR 2023',
  'TRANSAÇÕES  DE 04 MAR A 04 ABR  VALORES EM R$',
  '04 MAR  Loja Inventada - 2/3  150,00',
  '04 MAR  Pagamento em 04 MAR  100,00',
  '15 MAR  Pagamento em 15 MAR  150,00',
  '28 MAR  Mercado Exemplo  200,00',
  '4 de 5', 'FULANO DE TAL', 'FATURA  11 ABR 2023  EMISSÃO E ENVIO  04 ABR 2023', 'TRANSAÇÕES  DE 04 MAR A 04 ABR  VALORES EM R$',
  '02 ABR  Streaming Teste  100,00',
  '5 de 5',
];

test('Nubank cartão (formato até 2023): sem "R$", pagamento positivo vira crédito, parcela "- 2/3", soma confere', () => {
  assert.equal(identificarDocumentoGasto(FATURA_NU_ANTIGA), 'nubank-cartao');
  const f = lerFaturaNubank(FATURA_NU_ANTIGA);
  assert.deepEqual([f.mes, f.vencimento, f.total], ['2023-04', '2023-04-11', 300]);
  assert.equal(f.lancamentos.length, 5, JSON.stringify(f.avisos));
  const pags = f.lancamentos.filter((l) => l.tipo === 'pagamento_fatura');
  assert.deepEqual(pags.map((l) => l.valor), [-100, -150]);
  assert.equal(f.lancamentos[0].parcela, '2/3');
  assert.equal(f.lancamentos[0].data, '2023-03-04');
  assert.equal(f.conferencia.ok, true, JSON.stringify(f.conferencia));
});

// Nubank atual: "−R$", "•••• 1234", data numa linha e o resto na de baixo,
// compra em dólar com a descrição ACIMA da linha "data  valor", subtotal por
// titular, IOF de compras internacionais no resumo e a seção "Pagamentos".
const FATURA_NU_ATUAL = [
  'Olá, Fulano. Esta é a sua fatura de setembro, no valor de R$ 1.000,00', 'Data de vencimento: 11 SET 2026',
  'Parcelar em 6 meses', 'Total a pagar  R$ 1.500,00  R$ 1.600,00',
  'FULANO DE TAL', 'FATURA 11 SET 2026 EMISSÃO E ENVIO 04 SET 2026',
  'RESUMO DA FATURA ATUAL', 'Fatura anterior  R$ 500,00', 'Pagamento recebido  −R$ 500,00',
  'Total de compras de todos os cartões, 04 AGO a 04 SET  R$ 1.110,00', 'IOF de compras internacionais  -R$ 0,50', 'Outros lançamentos  −R$ 109,55',
  'Total a pagar  R$ 999,95', '4 de 8',
  'FULANO DE TAL', 'FATURA 11 SET 2026 EMISSÃO E ENVIO 04 SET 2026',
  'TRANSAÇÕES DE 04 AGO A 04 SET', 'Fulano De Tal  R$ 1.000,00',
  '04 AGO', '•••• 1111 Loja Inventada - Parcela 3/4  R$ 100,00',
  '04 AGO  Ajuste a crédito  −R$ 10,00',
  '05 AGO', 'Mercado Exemplo - NuPay  R$ 200,00',
  '•••• 1111 Site Gringo',
  '11 AGO  R$ 527,00',
  'USD 100.00  Conversão: USD 1 = R$ 5,27',
  '11 AGO  IOF de "Site Gringo"  R$ 18,45',
  '11 AGO  Crédito de "Site Gringo"  −R$ 117,95',
  '20 AGO  •••• 2222 Restaurante Teste  R$ 282,95',
  '5 de 8', 'FULANO DE TAL', 'FATURA 11 SET 2026 EMISSÃO E ENVIO 04 SET 2026', 'TRANSAÇÕES DE 04 AGO A 04 SET',
  '03 SET  IOF de volta de Site Gringo  −R$ 0,50',
  'Pagamentos  -R$ 500,00', '05 AGO  Pagamento em 05 AGO  −R$ 500,00',
  'Em cumprimento à regulação do Banco Central, as suas operações de crédito...',
];

test('Nubank cartão (formato atual): menos tipográfico, final do cartão fora, data em linha separada, dólar, subtotal do titular ignorado, soma confere', () => {
  const f = lerFaturaNubank(FATURA_NU_ATUAL);
  assert.equal(f.total, 999.95, 'o "Total a pagar" do resumo, não o da simulação de parcelamento');
  assert.equal(f.lancamentos.length, 9, JSON.stringify(f.lancamentos.map((l) => l.descricao)));
  const por = (re) => f.lancamentos.find((l) => re.test(l.descricao));
  assert.equal(por(/Loja Inventada/).descricao, 'Loja Inventada - Parcela 3/4', 'sem o "•••• 1111"');
  assert.equal(por(/Loja Inventada/).parcela, '3/4');
  assert.equal(por(/Ajuste/).valor, -10);
  assert.equal(por(/Mercado/).data, '2026-08-05');
  const gringo = por(/^Site Gringo$/);
  assert.deepEqual([gringo.valor, gringo.moeda, gringo.valorOriginal, gringo.data], [527, 'USD', 100, '2026-08-11']);
  assert.equal(por(/^Pagamento em/).valor, -500);
  assert.ok(!f.lancamentos.some((l) => /Fulano/i.test(l.descricao)), 'subtotal do titular não é lançamento');
  assert.equal(f.conferencia.ok, true, JSON.stringify(f.conferencia));
});

/**
 * Itens "do pdf.js" (com posição) de uma fatura no layout do BB, INVENTADA:
 * cada letra é um item separado (a fonte que o pdf.js quebra), a caixa
 * "Vencimento:" tem a data EMBAIXO, e o "Detalhamento da Fatura" tem 2
 * painéis lado a lado (as linhas da esquerda e da direita na mesma altura).
 */
function faturaBbItens() {
  const L = 3; // largura de cada letra
  const itens1 = []; const itens2 = []; const itens3 = [];
  const txt = (lista, x, y, s) => { [...s].forEach((ch, k) => lista.push({ s: ch, x: x + k * L, y, w: L })); };
  const dir = (lista, x, y, s) => txt(lista, x - s.length * L, y, s); // alinhado à direita
  // página 1
  txt(itens1, 300, 780, 'Cartão: Smiles Visa / N° 0000 **** **** 0000');
  txt(itens1, 320, 755, 'Vencimento:'); txt(itens1, 440, 756, 'Melhor data de compra: 23/01/2026');
  txt(itens1, 340, 738, '05/01/2026'); txt(itens1, 440, 744, 'Sua próxima fatura fechará no dia:');
  txt(itens1, 480, 730, '22/01/2026');
  txt(itens1, 310, 712, 'R$'); txt(itens1, 340, 712, 'Valor Total:');
  dir(itens1, 400, 695, '262,00');
  txt(itens1, 40, 640, 'Resumo em Real');
  txt(itens1, 40, 625, 'Saldo anterior'); dir(itens1, 185, 625, '300,00');
  txt(itens1, 40, 615, 'Pagamentos/Créditos'); txt(itens1, 150, 615, '-'); dir(itens1, 185, 615, '300,00');
  txt(itens1, 40, 605, 'Compras/Débitos'); dir(itens1, 185, 605, '262,00');
  txt(itens1, 40, 585, 'Valor Total - R$'); dir(itens1, 185, 585, '262,00');
  txt(itens1, 250, 285, 'Data de Vencimento'); txt(itens1, 40, 277, '0000000000'); txt(itens1, 250, 277, '05/01/2026');
  // página 2: 2 painéis (x 20 e x 400)
  const lin = (lista, x0, y, d, desc, cidade, pais, moeda, valor) => {
    txt(lista, x0, y, d); txt(lista, x0 + 25, y, desc); if (cidade) txt(lista, x0 + 160, y, cidade);
    if (pais) txt(lista, x0 + 260, y, pais); txt(lista, x0 + 280, y, moeda); dir(lista, x0 + 360, y, valor);
  };
  [20, 400].forEach((x0) => { txt(itens2, x0, 760, 'Detalhamento da Fatura'); txt(itens2, x0, 748, 'Data'); txt(itens2, x0 + 25, 748, 'Transações'); txt(itens2, x0 + 280, 748, 'Moeda'); });
  txt(itens2, 45, 736, '01- FULANO DE TAL'); txt(itens2, 150, 736, 'Cartao N. 0000');
  txt(itens2, 45, 727, 'Pagamentos');
  lin(itens2, 20, 718, '26/11', 'PGTO. CASH AG. 1234 000099999 200', '', '10', 'R$', '300,00 -');
  txt(itens2, 45, 709, 'Restaurantes');
  lin(itens2, 20, 700, '23/11', 'RESTAURANTE INVENTADO', 'CIDADE A', 'BR', 'R$', '100,00');
  lin(itens2, 20, 691, '08/12', 'ifood  *ifood', 'Vila Teste', 'BR', 'R$', '40,00');
  // painel da direita, nas MESMAS alturas
  txt(itens2, 425, 736, 'Compras/Pgto Contas Parc');
  lin(itens2, 400, 727, '27/03', 'LOJA TESTE', 'PARC 09/12 CIDADE B', 'BR', 'R$', '70,00');
  txt(itens2, 425, 718, 'Anuidades');
  lin(itens2, 400, 709, '20/12', 'ANUIDADE DIFERENCIADA TIT-PARC 02/12', '', 'BR', 'R$', '52,00');
  txt(itens2, 580, 700, 'Subtotal'); txt(itens2, 680, 700, 'R$'); dir(itens2, 760, 700, '262,00');
  txt(itens2, 680, 691, 'US$'); dir(itens2, 760, 691, '0,00');
  // página 3: parcelamentos da PRÓXIMA fatura (não entram)
  [20, 400].forEach((x0) => txt(itens3, x0, 760, 'Detalhamento da Fatura'));
  txt(itens3, 45, 740, 'Parcelamentos Próxima Fatura');
  lin(itens3, 20, 731, '27/03', 'LOJA TESTE PARC 10/12', 'CIDADE B', '', 'R$', '70,00');
  txt(itens3, 120, 722, 'Total parcelado para próxima fatura'); txt(itens3, 300, 722, 'R$'); dir(itens3, 380, 722, '70,00');
  return [{ itens: itens1 }, { itens: itens2 }, { itens: itens3 }];
}

test('posição do pdf.js: letras soltas viram palavras e os 2 painéis do BB viram linhas separadas', () => {
  const pags = faturaBbItens();
  const simples = linhasDeItens(pags);
  assert.ok(simples.includes('Vencimento:  Melhor data de compra: 23/01/2026'), simples.slice(0, 6).join(' | '));
  // sem separar os painéis, um lançamento gruda no outro
  assert.ok(simples.some((l) => /^23\/11 .*100,00\s+08\/12|^26\/11 .*300,00 -\s+20\/12/.test(l)) || simples.some((l) => /RESTAURANTE INVENTADO.*Subtotal/.test(l)));
  const col = linhasDeItens(pags, { colunas: true });
  assert.ok(col.some((l) => /^23\/11  RESTAURANTE INVENTADO  CIDADE A  BR  R\$  100,00$/.test(l)), col.join('\n'));
  assert.ok(col.indexOf('Anuidades') > col.findIndex((l) => /^08\/12/.test(l)), 'o painel da direita vem depois do da esquerda');
  // duas cópias do mesmo texto no mesmo lugar ("negrito" desenhado 2x) contam uma vez
  assert.deepEqual(linhasDeItens([{ itens: [{ s: 'Total', x: 10, y: 5, w: 15 }, { s: 'Total', x: 10.2, y: 5, w: 15 }] }]), ['Total']);
});

test('OuroCard (layout real do BB, inventado): vencimento embaixo do rótulo, painéis lado a lado, menos depois do valor, próxima fatura fora, soma confere', () => {
  const f = lerDocumentoGasto({ paginas: faturaBbItens() }, { banco: 'OuroCard', origem: 'cartao', nome: '01-2026.pdf' });
  assert.equal(f.fonte, 'ourocard');
  assert.deepEqual([f.vencimento, f.mes, f.total], ['2026-01-05', '2026-01', 262]);
  assert.deepEqual(f.avisos, []);
  assert.equal(f.lancamentos.length, 5, f.lancamentos.map((l) => l.descricao).join(' | '));
  const por = (re) => f.lancamentos.find((l) => re.test(l.descricao));
  const pg = por(/PGTO/);
  assert.deepEqual([pg.tipo, pg.valor, pg.data], ['pagamento_fatura', -300, '2025-11-26']);
  assert.doesNotMatch(pg.descricao, /1234|000099999/, 'agência e número saem');
  assert.equal(por(/RESTAURANTE/).descricao, 'RESTAURANTE INVENTADO', 'cidade e país fora');
  assert.equal(por(/ifood/).descricao, 'ifood *ifood');
  const parc = por(/LOJA TESTE/);
  assert.deepEqual([parc.descricao, parc.parcela, parc.data], ['LOJA TESTE PARC 09/12', '9/12', '2025-03-27']);
  assert.equal(por(/ANUIDADE/).tipo, 'anuidade');
  assert.ok(!f.lancamentos.some((l) => /10\/12/.test(l.descricao)), 'parcela da próxima fatura não entra');
  assert.equal(f.conferencia.ok, true, JSON.stringify(f.conferencia));
  // só texto juntado pela altura (como antes): o vencimento letra a letra não era achado
  const antes = lerFaturaOurocard(faturaBbItens().flatMap((p) => {
    const g = {}; p.itens.forEach((it) => { (g[it.y] = g[it.y] || []).push(it); });
    return Object.keys(g).sort((a, b) => b - a).map((y) => g[y].sort((a, b) => a.x - b.x).map((i) => i.s).join('  '));
  }));
  assert.deepEqual(antes.avisos, ['Não achei a data de vencimento da fatura.']);
  // PDF sem texto (imagem)
  assert.match(lerDocumentoGasto({ paginas: [{ itens: [] }] }).erro, /não tem texto/);
  // sem vencimento nenhum, o nome do arquivo (mm-aaaa) salva o mês - com aviso
  const semVenc = lerFaturaOurocard(['OUROCARD', '23/11  RESTAURANTE INVENTADO  CIDADE A  BR  R$  100,00'], { nome: '12-2025.pdf' });
  assert.equal(semVenc.mes, '2025-12');
  assert.match(semVenc.avisos[0], /nome do arquivo/);
});

test('valores: menos tipográfico e menos depois do valor (BB)', () => {
  assert.equal(valorBR('−R$ 105,29'), -105.29);
  assert.equal(valorBR('200,00 -'), -200);
  assert.equal(valorBR('6.556,55-'), -6556.55);
  assert.equal(limparDescricao('•••• 7777 Loja Teste'), 'Loja Teste');
  assert.equal(parcelaDe('Loja Teste - 2/3'), '2/3');
});

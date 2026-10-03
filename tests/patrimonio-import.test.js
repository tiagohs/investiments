// tests/patrimonio-import.test.js
//
// 27/09/2026: leitores dos PDFs da aba Patrimônio (patrimonio-import.js).
// As linhas imitam o que o pdf.js devolve (itens da mesma altura juntados com
// 2 espaços). TUDO INVENTADO - nomes, empresas, valores e datas (o
// repositório é público): nunca colar trecho de documento real aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identificarDocumento, lerDeclaracaoIr, lerExtratoFgts, lerCtps, lerExtratoCaixaHabitacao, lerExtratoFies, tipoLancamentoFgts, contaFgtsParaSalvar, dataIso,
} from '../assets/js/pages/patrimonio-import.js';

const IR_NOVO = [
  'NOME:', 'FULANO DE TAL CPF:', '000.000.000-00 IMPOSTO SOBRE A RENDA - PESSOA FÍSICA DECLARAÇÃO DE AJUSTE ANUAL',
  'EXERCÍCIO 2025 ANO-CALENDÁRIO 2024 IDENTIFICAÇÃO DO CONTRIBUINTE',
  'Nome: FULANO DE TAL CPF: 000.000.000-00 Data de Nascimento: 15/03/1990',
  'DECLARAÇÃO DE BENS E DIREITOS (Valores em Reais)',
  'GRUPO  CÓDIGO  DISCRIMINAÇÃO  SITUAÇÃO EM', '31/12/2023  31/12/2024',
  '01  11  RUA INVENTADA, 10, APTO 5, TR 23, CIDADE Y,  0,00  40.000,00',
  'VALOR DA VENDA: 300.000,00. PAGO R$ 1.234,56 EM MEDIA',
  '105 - Brasil',
  'Controle: 123', 'Página 4 de 9 Data/Hora da Entrega: 01/04/2025', 'NOME:', 'EXERCÍCIO 2025 ANO-CALENDÁRIO 2024 DECLARAÇÃO DE BENS E DIREITOS (Valores em Reais)',
  'GRUPO  CÓDIGO  DISCRIMINAÇÃO', 'SITUAÇÃO EM', '31/12/2023  31/12/2024',
  'Área Total: 70,5 m² Data de Aquisição: 10/01/2024',
  '03  01  10 COTAS EMPRESA ALFA - ACAO  1.000,00  1.200,00',
  '105 - Brasil',
  'Bem ou direito pertencente ao: Titular CPF: 000.000.000-00 CNPJ: 00.000.000/0001-00',
  'Código de Negociação: ALFA3  04  02  TESOURO INVENTADO', '2.000,00  3.500,50',
  '105 - Brasil',
  '06  01  CONTA CORRENTE BANCO BETA  10,00  99,50',
  '105 - Brasil',
  'Banco: 999 Agência: 0001 Conta: 12345-6 Conta Pagamento? Não',
  '07  03  5 COTAS FUNDO GAMA - FII  500,00  600,00',
  '105 - Brasil',
  'TOTAL  3.510,00  45.400,00 DÍVIDAS E ÔNUS REAIS', 'Sem Informações',
  'RESUMO', 'TOTAL DE RENDIMENTOS TRIBUTÁVEIS 100.000,00 Desconto Simplificado 16.754,34',
  'Total do imposto devido 15.000,00', 'Total do imposto pago 16.000,00', 'IMPOSTO A RESTITUIR 1.000,00 SALDO IMPOSTO A PAGAR 0,00',
  'EVOLUÇÃO PATRIMONIAL',
  'Bens e direitos em 31/12/2023  3.510,00  Bens e direitos em 31/12/2024  45.400,00',
  'Dívidas e ônus reais em 31/12/2023  0,00  Dívidas e ônus reais em 31/12/2024  0,00',
  'Rendimentos isentos e não tributáveis 2.000,00 Rendimentos sujeitos à tributação exclusiva/definitiva 3.000,00',
];

test('IR (layout novo): totais da evolução patrimonial, bens por grupo (confere com o total), rendimentos e imposto', () => {
  assert.equal(identificarDocumento(IR_NOVO), 'ir');
  const r = lerDeclaracaoIr(IR_NOVO);
  assert.equal(r.exercicio, 2025);
  assert.equal(r.ano, 2024);
  assert.equal(r.bens, 45400);
  assert.equal(r.bensAnterior, 3510);
  assert.equal(r.dividas, 0);
  assert.deepEqual(r.grupos['01'], { anterior: 0, atual: 40000, qtd: 1 });
  assert.deepEqual(r.grupos['03'], { anterior: 1000, atual: 1200, qtd: 1 });
  assert.deepEqual(r.grupos['04'], { anterior: 2000, atual: 3500.5, qtd: 1 });
  assert.deepEqual(r.grupos['06'], { anterior: 10, atual: 99.5, qtd: 1 });
  assert.deepEqual(r.grupos['07'], { anterior: 500, atual: 600, qtd: 1 });
  assert.equal(r.conferido, true);
  assert.equal(r.grupos.nd, undefined);
  assert.equal(r.tributaveis, 100000);
  assert.equal(r.isentos, 2000);
  assert.equal(r.exclusivos, 3000);
  assert.equal(r.impostoDevido, 15000);
  assert.equal(r.restituir, 1000);
  assert.equal(r.nascimento, '1990-03');
});

test('IR (layout antigo, código de 2 dígitos): grupo pelo 1º dígito; o que não fecha vai pra "nd"', () => {
  const l = [
    'IMPOSTO SOBRE A RENDA - PESSOA FÍSICA DECLARAÇÃO DE AJUSTE ANUAL', 'EXERCÍCIO 2020 ANO-CALENDÁRIO 2019',
    'DECLARAÇÃO DE BENS E DIREITOS (Valores em Reais)', 'CÓDIGO DISCRIMINAÇÃO SITUAÇÃO EM', '31/12/2018 31/12/2019',
    '61 BANCO DELTA 300,00 150,00', '105 - Brasil Bem ou direito pertencente ao: Titular CNPJ: 00.000.000/0001-00',
    '45 APLICACAO EPSILON 1.000,00 2.000,00', '105 - Brasil',
    'TOTAL 1.300,00 2.500,00 DÍVIDAS E ÔNUS REAIS',
    'Bens e direitos em 31/12/2018 1.300,00 Bens e direitos em 31/12/2019 2.500,00 Dívidas e ônus reais em 31/12/2018 0,00 Dívidas e ônus reais em 31/12/2019 0,00',
  ];
  const r = lerDeclaracaoIr(l);
  assert.equal(r.ano, 2019);
  assert.equal(r.grupos['06'].atual, 150);
  assert.equal(r.grupos['04'].atual, 2000);
  assert.equal(r.grupos.nd.atual, 350, '2.500 - (150 + 2.000)');
  assert.equal(r.conferido, false);
  assert.throws(() => lerDeclaracaoIr(['um PDF qualquer']), /Cópia da Declaração/);
});

const FGTS = [
  'FULANO DE TAL',
  'EMPREGADOR  DATA DE ADMISSÃO  PIS/PASEP',
  'EMPRESA INVENTADA LTDA  01/02/2021  000.00000.00-0',
  'DATA DE OPÇÃO  DATA E CÓDIGO DE AFASTAMENTO  CATEGORIA',
  '01/02/2021  30/06/2023  1',
  'Histórico de Movimentações  JANEIRO/2023 - DEZEMBRO/2023',
  'DATA  LANÇAMENTO  VALOR  TOTAL',
  'SALDO ANTERIOR  0,00  0,00',
  '05/01/2023  115-DEPOSITO DEZEMBRO 2022  R$   800,00  R$  800,00',
  '10/01/2023  CREDITO DE JAM 0,003000  R$   2,40  R$  802,40',
  '05/02/2023  115-DEPOSITO JANEIRO 2023  R$   800,00  R$  1.602,40',
  '01/03/2023  SAQUE DEP - COD 60  R$ - 300,00  R$  1.302,40',
  '15/03/2023  SAQUE DEP COD 91 123456789012345  R$ - 1.000,00  R$  302,40',
  '15/03/2023  SAQUE JAM COD 91 123456789012345  R$ - 2,40  R$  300,00',
  '20/07/2023  AC CRED DIST RESULTADO ANO BASE 12/2022  R$   5,00  R$  305,00',
  '01/08/2023  DEP RESCISORIO X  R$   100,00  R$  405,00',
  '02/08/2023  SAQUE DEP - COD 01M  R$ - 405,00  R$  0,00',
];

test('FGTS: empregador, admissão/afastamento, saldo, saldo por mês, totais e saques por motivo (sem número de protocolo)', () => {
  assert.equal(identificarDocumento(FGTS), 'fgts');
  const r = lerExtratoFgts(FGTS);
  assert.equal(r.empregador, 'EMPRESA INVENTADA LTDA');
  assert.equal(r.admissao, '2021-02-01');
  assert.equal(r.afastamento, '2023-06-30');
  assert.equal(r.saldo, 0);
  assert.equal(r.dataSaldo, '2023-08-02');
  assert.equal(r.depositos, 1700);
  assert.equal(r.jam, 2.4);
  assert.equal(r.lucros, 5);
  assert.deepEqual(r.saques, { aniversario: 300, moradia: 1002.4, rescisao: 405, emergencial: 0, outros: 0 });
  assert.deepEqual(r.usosMoradia, [{ data: '2023-03-15', valor: 1002.4 }]);
  assert.deepEqual(r.saquesAniversario, [{ data: '2023-03-01', valor: 300 }]);
  assert.deepEqual(contaFgtsParaSalvar(r).saquesAniversario, r.saquesAniversario);
  assert.deepEqual(r.mensal, [['2023-01', 802.4], ['2023-02', 1602.4], ['2023-03', 300], ['2023-07', 305], ['2023-08', 0]]);
  assert.ok(r.movimentos.every((m) => !/\d{10,}/.test(m.descricao)), 'sem o número do protocolo');
  const salvar = contaFgtsParaSalvar(r);
  assert.equal(salvar.movimentos, undefined, 'os lançamentos um a um não vão pra planilha');
  assert.equal(tipoLancamentoFgts('SAQUE DEP - COD 50').motivo, 'emergencial');
  assert.equal(tipoLancamentoFgts('TRANSFERENCIA RECEBIDA - DEP SP').tipo, 'transfEntrada');
});

test('CTPS: contratos em ordem, salários (usa a data "com efeito a partir de", mesmo quebrada em 2 linhas) e cargos', () => {
  const l = [
    'Carteira de Trabalho Digital', 'Data de emissão: 01/01/2019', 'Dados Pessoais', 'CPF  Sexo  Data de nascimento  Nacionalidade', '000.000.000-00  Masculino  15/03/1990  Brasileiro',
    'Contratos de trabalho', '01/02/2021 - Aberto', 'Empregador', 'EMPRESA NOVA SA', 'CNPJ RAIZ: 00.000.000',
    'Salário contratual', 'R$ 9.000,00 por mês',
    'ANOTAÇÕES', '01/05/2023 - Salário definido para R$ 9.000,00 Por mês , com efeito a partir de', '10/05/2023',
    '01/02/2021 - Salário definido para R$ 7.000,00 Por mês',
    '01/03/2022 a (atual) - Cargo exercido de DEV PLENO', '01/02/2021 a 28/02/2022 - Cargo exercido de DEV JUNIOR',
    'Página 1', 'Documento assinado digitalmente pela Dataprev em 01/01/2026.', 'Carteira de Trabalho Digital', 'Data de emissão: 01/01/2019',
    '10/01/2018 - 20/12/2020', 'Empregador', 'EMPRESA VELHA LTDA', 'Salário contratual', 'R$ 3.000,00 por mês', 'ANOTAÇÕES', '20/12/2020 - Rescisão Contratual',
  ];
  assert.equal(identificarDocumento(l), 'ctps');
  const r = lerCtps(l);
  assert.equal(r.nascimento, '1990-03');
  assert.deepEqual(r.contratos.map((c) => [c.empregador, c.inicio, c.fim]), [['EMPRESA VELHA LTDA', '2018-01-10', '2020-12-20'], ['EMPRESA NOVA SA', '2021-02-01', null]]);
  assert.deepEqual(r.contratos[1].salarios, [{ data: '2021-02-01', valor: 7000 }, { data: '2023-05-10', valor: 9000 }]);
  assert.deepEqual(r.contratos[0].salarios, [{ data: '2018-01-10', valor: 3000 }], 'sem anotação de salário: usa o contratual no início');
  assert.deepEqual(r.contratos[1].cargos.map((c) => c.cargo), ['DEV JUNIOR', 'DEV PLENO']);
  assert.equal(r.contratos[1].cargos[1].fim, null);
});

test('Caixa (Demonstrativo de Evolução - Habitação): saldo, taxa, prazo, amortização e parcelas', () => {
  const l = [
    'Demonstrativo de Evolução - Habitação',
    'DADOS DO CLIENTE / DADOS DO IMÓVEL  DATA GERAÇÃO:  01/02/2026  EXTRATO DE EVOLUÇÃO DO SALDO',
    'Contrato  000000000000-0  Saldo Devedor Teórico em  20/01/26',
    'Nome  FULANO DE TAL  Valor  R$ 200.000,00',
    'CPF/CGC  000.000.000-00  Juros/Correção do Mês  R$ 1.500,00',
    'Endereço  RUA INVENTADA 1  Amortização do Mês  R$ 800,00', 'Indexador do Saldo  TR',
    'Prazo do Financiamento  360 meses  Saldo Anterior  R$ 0,00', 'Prazo Remanescente  250 meses',
    'Taxa de Juros Contratual Nominal  9,00%', 'Taxa de Juros Nominal com Relacionamento  8,50%', 'Sistema de Amortização  SAC',
    '20/01/2026  20/01/2026  2  310  2.300,00  90,00  25,00  0,00  0,00  0 /  0,00  0,00  2.415,00  2.415,00  0,00',
    '20/12/2025  21/12/2025  1  310  2.310,00  90,00  25,00  0,00  0,00  0 /  0,00  0,00  2.425,00  2.425,00  0,00',
    'ENCARGOS GERADOS E EM ABERTO (15 ÚLTIMAS PRESTAÇÕES)', '20/02/2026  3  1.0  2.290,00  90,00  25,00  0,00  0,00  3 /  0,00  0,00  2.405,00',
    'QUANTIDADE DE ENCARGOS EM ABERTO: 1  TOTAL A PAGAR R$ 2.405,00',
  ];
  assert.equal(identificarDocumento(l), 'caixa');
  const r = lerExtratoCaixaHabitacao(l);
  assert.equal(r.saldo, 200000);
  assert.equal(r.dataSaldo, '2026-01-20');
  assert.equal(r.amortizacao, 800);
  assert.equal(r.jurosMes, 1500);
  assert.equal(r.taxaAnual, 0.085, 'a taxa com relacionamento');
  assert.equal(r.prazoTotal, 360);
  assert.equal(r.prazoRestante, 250);
  assert.equal(r.sistema, 'SAC');
  assert.equal(r.parcela, 2415, 'a parcela mais recente');
  assert.equal(r.seguroTaxas, 115);
  assert.deepEqual(r.proximaParcela, { vencimento: '2026-02-20', valor: 2405 });
  assert.equal(r.parcelas.length, 2);
});

test('FIES (SISBB): saldo, parcela, prazo e a taxa pelo crescimento da amortização (Price)', () => {
  const l = [
    'SISBB - SISTEMA DE INFORMACOES BANCO DO BRASIL', 'Nome  FULANO DE TAL', 'Operação  12345678', 'Dia o débito  10',
    'Data da contratação  01.02.2012', 'Valor do crédito global  50.000,00', 'Valor do saldo devedor  30.000,00',
    'Início da fase  10.01.2018', 'Fim da fase  10.12.2032', 'Lançamentos em Ser  80',
    'Lanç.Data  Valor  Cap.  Juros  Enc.',
    '1  10.10.2025  400,00  300,00  100,00  0,00',
    '2  10.11.2025  400,00  301,00  99,00  0,00',
    '3  10.12.2025  400,00  302,00  98,00  0,00',
  ];
  assert.equal(identificarDocumento(l), 'fies');
  const r = lerExtratoFies(l);
  assert.equal(r.saldo, 30000);
  assert.equal(r.dataSaldo, '2025-12-10');
  assert.equal(r.parcela, 400);
  assert.equal(r.restantes, 80);
  assert.equal(r.fim, '2032-12');
  assert.equal(r.inicioAmortizacao, '2018-01');
  assert.equal(r.valorContratado, 50000);
  assert.ok(Math.abs(r.taxaMensal - (302 / 301 - 1)) < 1e-6 || Math.abs(r.taxaMensal - (301 / 300 - 1)) < 1e-6);
});

test('dataIso aceita dd/mm/aaaa, dd.mm.aaaa e dd/mm/aa', () => {
  assert.equal(dataIso('05/01/2023'), '2023-01-05');
  assert.equal(dataIso('05.01.2023'), '2023-01-05');
  assert.equal(dataIso('20/09/26'), '2026-09-20');
  assert.equal(dataIso('x'), null);
});

test('pdf.js de verdade: letra acentuada vem como item separado ("Hist  ó  rico") - os leitores juntam de volta', async () => {
  const { juntarAcentos } = await import('../assets/js/pages/patrimonio-import.js');
  assert.deepEqual(juntarAcentos(['Hist  ó  rico de Movimenta  ç  õ  es  OUTUBRO/2024', 'DATA DE ADMISS  Ã  O  PIS/PASEP', 'R$ -  2.778,81  R$  9.109,95']),
    ['Histórico de Movimentações  OUTUBRO/2024', 'DATA DE ADMISSÃO  PIS/PASEP', 'R$ -  2.778,81  R$  9.109,95']);
  const linhas = FGTS.map((l) => l
    .replace('ADMISSÃO', 'ADMISS  Ã  O').replace('OPÇÃO', 'OP  ÇÃ  O').replace('CÓDIGO', 'C  Ó  DIGO')
    .replace('Histórico de Movimentações', 'Hist  ó  rico de Movimenta  ç  õ  es').replace('LANÇAMENTO', 'LAN  Ç  AMENTO'));
  assert.equal(identificarDocumento(linhas), 'fgts');
  const r = lerExtratoFgts(linhas);
  assert.equal(r.empregador, 'EMPRESA INVENTADA LTDA');
  assert.equal(r.afastamento, '2023-06-30');
  assert.equal(r.depositos, 1700);
});

// 02/10/2026 (aba Renda e Orçamentos): salário por fonte pagadora, contas
// bancárias e o detalhe dos isentos/exclusivos. Tudo inventado.
const IR_RENDA = [
  'NOME:', 'FULANO DE TAL CPF:', '000.000.000-00 IMPOSTO SOBRE A RENDA - PESSOA FÍSICA DECLARAÇÃO DE AJUSTE ANUAL',
  'EXERCÍCIO 2025 ANO-CALENDÁRIO 2024 IDENTIFICAÇÃO DO CONTRIBUINTE',
  'RENDIMENTOS TRIBUTÁVEIS RECEBIDOS DE PESSOA JURÍDICA PELO TITULAR (Valores em Reais)',
  'NOME DA FONTE PAGADORA  CNPJ/CPF DA FONTE PAGADORA  RENDIMENTOS RECEBIDOS DE PESSOA JURÍDICA  CONTRIBUIÇÃO PREVIDENCIÁRIA OFICIAL  IMPOSTO RETIDO NA FONTE  13º SALÁRIO  IRRF SOBRE O 13º SALÁRIO',
  'EMPRESA ALFA LTDA  11.111.111/0001-11  60.000,00  5.000,00  9.000,00  5.000,00  600,00',
  'Controle: 123', 'Página 2 de 9 Data/Hora da Entrega: 01/04/2025 às 10:00:00', 'NOME:', 'FULANO DE TAL CPF:',
  '000.000.000-00 IMPOSTO SOBRE A RENDA - PESSOA FÍSICA DECLARAÇÃO DE AJUSTE ANUAL', 'EXERCÍCIO 2025 ANO-CALENDÁRIO 2024',
  '22.222.222/0001-22  EMPRESA BETA 2 TECNOLOGIA S.A.  40.000,00  3.500,00  6.000,00  3.000,00  350,00',
  'TOTAL  100.000,00  8.500,00  15.000,00  8.000,00  950,00',
  'RENDIMENTOS ISENTOS E NÃO TRIBUTÁVEIS (Valores em Reais)',
  '04. Indenizações por rescisão de contrato de trabalho, inclusive a título de PDV, e por acidente de trabalho; e FGTS 1.234,56',
  '09. Lucros e dividendos recebidos 300,00', '12. Rendimentos de cadernetas de poupança, letras hipotecárias, LCA e LCI 150,50',
  'RENDIMENTOS SUJEITOS À TRIBUTAÇÃO EXCLUSIVA/DEFINITIVA (Valores em Reais)',
  '01. 13º salário 8.000,00', '06. Rendimentos de aplicações financeiras 2.000,00', '10. Juros sobre capital próprio 45,00',
  'DECLARAÇÃO DE BENS E DIREITOS (Valores em Reais)',
  'GRUPO  CÓDIGO  DISCRIMINAÇÃO', 'SITUAÇÃO EM', '31/12/2023  31/12/2024',
  '06  01  CONTA CORRENTE BANCO INVENTADO', '100,00  2.500,00', '105 - Brasil',
  'Bem ou direito pertencente ao: Titular CPF: 000.000.000-00 CNPJ: 99.999.999/0001-99',
  'Banco: 260 Agência: 0001 Conta: 1234567-8 Conta Pagamento? Não',
  '04  02  TESOURO INVENTADO', '1.000,00  1.500,00', '105 - Brasil',
  'Bem ou direito pertencente ao: Titular CPF: 000.000.000-00 CNPJ: 99.999.999/0001-99',
  '06  01  DEP. A VISTA OUTRO BANCO', '50,00  0,00', '105 - Brasil',
  'Bem ou direito pertencente ao: Titular CPF: 000.000.000-00 CNPJ: 99.999.999/0001-99',
  'Banco: 999 Agência: 4321-0 Conta: 0099887-1 Conta Pagamento? Sim',
  'TOTAL  1.150,00  4.000,00 DÍVIDAS E ÔNUS REAIS', 'Sem Informações',
  'RESUMO', 'Recebidos de Pessoa Jurídica pelo Titular 100.000,00 Recebidos de Pessoa Jurídica pelos Dependentes 0,00',
  'TOTAL DE RENDIMENTOS TRIBUTÁVEIS 100.000,00', 'Total do imposto devido 14.000,00', 'Total do imposto pago 15.000,00',
  'IMPOSTO A RESTITUIR 1.000,00 SALDO IMPOSTO A PAGAR 0,00',
  'Bens e direitos em 31/12/2023  1.150,00  Bens e direitos em 31/12/2024  4.000,00',
  'Dívidas e ônus reais em 31/12/2023  0,00  Dívidas e ônus reais em 31/12/2024  0,00',
];

test('IR (renda): fontes pagadoras com nome antes/depois do CNPJ e quebra de página, só a raiz do CNPJ', () => {
  const r = lerDeclaracaoIr(IR_RENDA);
  assert.equal(r.recebidosPj, 100000);
  assert.deepEqual(r.rendimentosPj, [
    { fonte: 'EMPRESA ALFA LTDA', cnpjRaiz: '11.111.111', anual: 60000, inss: 5000, irrf: 9000, decimoTerceiro: 5000, irrf13: 600 },
    { fonte: 'EMPRESA BETA 2 TECNOLOGIA S.A.', cnpjRaiz: '22.222.222', anual: 40000, inss: 3500, irrf: 6000, decimoTerceiro: 3000, irrf13: 350 },
  ]);
  assert.ok(!JSON.stringify(r).includes('000.000.000-00'), 'nada de CPF');
  assert.equal(r.bens, 4000);
  assert.equal(r.conferido, true, 'os bens por grupo continuam fechando');
});

test('IR (renda): isentos e exclusivos item a item, com o tipo pelo nome', () => {
  const r = lerDeclaracaoIr(IR_RENDA);
  assert.deepEqual(r.isentosItens.map((i) => [i.codigo, i.tipo, i.valor]), [['04', 'fgtsRescisao', 1234.56], ['09', 'dividendos', 300], ['12', 'lciLcaPoupanca', 150.5]]);
  assert.deepEqual(r.exclusivosItens.map((i) => [i.codigo, i.tipo, i.valor]), [['01', 'decimoTerceiro', 8000], ['06', 'aplicacoes', 2000], ['10', 'jcp', 45]]);
});

test('IR (renda): contas bancárias com banco (código + nome), agência, conta e saldos; aplicação sem banco fica fora', async () => {
  const { nomeBanco } = await import('../assets/js/pages/patrimonio-import.js');
  const r = lerDeclaracaoIr(IR_RENDA);
  assert.deepEqual(r.contasBancarias.map(({ descricao, ...c }) => c), [
    { banco: '260', bancoNome: 'Nubank', agencia: '0001', conta: '1234567-8', tipo: 'corrente', grupo: '06', saldoAnterior: 100, saldoAtual: 2500 },
    { banco: '999', bancoNome: 'Banco 999', agencia: '4321-0', conta: '0099887-1', tipo: 'pagamento', grupo: '06', saldoAnterior: 50, saldoAtual: 0 },
  ]);
  assert.equal(r.contasBancarias[0].descricao, 'CONTA CORRENTE BANCO INVENTADO');
  assert.equal(nomeBanco('1'), 'Banco do Brasil');
  assert.equal(nomeBanco('341'), 'Itaú');
  assert.equal(nomeBanco('104'), 'Caixa');
});

test('IR (renda, layout antigo): banco/agência/conta na linha do país; o resumo sem as seções novas devolve listas vazias', () => {
  const l = [
    'IMPOSTO SOBRE A RENDA - PESSOA FÍSICA DECLARAÇÃO DE AJUSTE ANUAL', 'EXERCÍCIO 2020 ANO-CALENDÁRIO 2019',
    'DECLARAÇÃO DE BENS E DIREITOS (Valores em Reais)', 'CÓDIGO DISCRIMINAÇÃO SITUAÇÃO EM', '31/12/2018 31/12/2019',
    '61 BANCO DELTA 300,00 150,00', '105 - Brasil Bem ou direito pertencente ao: Titular CPF: 000.000.000-00 CNPJ: 00.000.000/0001-00',
    'Banco: 237 Agência: 1111 Conta: 0001112-3',
    '41 CAIXA ECONOMICA 10,00 20,00', '105 - Brasil Bem ou direito pertencente ao: Titular CNPJ: 00.000.000/0001-00', 'Banco: 104 Agência: 2222 Conta: 0002223-4',
    '45 APLICACAO EPSILON 1.000,00 2.000,00', '105 - Brasil',
    'TOTAL 1.310,00 2.170,00 DÍVIDAS E ÔNUS REAIS',
    'Bens e direitos em 31/12/2018 1.310,00 Bens e direitos em 31/12/2019 2.170,00 Dívidas e ônus reais em 31/12/2018 0,00 Dívidas e ônus reais em 31/12/2019 0,00',
  ];
  const r = lerDeclaracaoIr(l);
  assert.deepEqual(r.contasBancarias.map((c) => [c.banco, c.bancoNome, c.agencia, c.conta, c.tipo, c.saldoAtual]), [
    ['237', 'Bradesco', '1111', '0001112-3', 'corrente', 150], ['104', 'Caixa', '2222', '0002223-4', 'poupanca', 20],
  ]);
  assert.deepEqual(r.rendimentosPj, []);
  assert.deepEqual(r.isentosItens, []);
  assert.equal(r.recebidosPj, null);
});

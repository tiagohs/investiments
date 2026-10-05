// tests/transacoes.test.js
//
// 26/09/2026: tela Transações montada num DOM de verdade (JSDOM): abas,
// carrinho de aportes (pôr quantidade, confirmar -> aguardando valores
// finais -> concluir; cancelar; excluir; repetir), importar extratos
// (conferência com a planilha antes de gravar) e lançar manualmente.
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const DADOS = {
  ok: true, hoje: '2026-09-26', cambio: 5,
  classes: {
    acoes: [
      { ticker: 'ABCD3', nome: 'Empresa ABCD', moeda: 'BRL', precoAtual: 20, variacaoDia: 0.01, quantidade: 100, precoTeto: 25, vies: 'Comprar', totalAtualizado: 2000, peso: 0.8, ultimoPago: { preco: 21, data: '2026-08-12', origem: 'transacao' },
        radar: { ranking: 1, pvp: 1.2, pl: 6, descontoPl: '15% (2% acima - retorno em 6 anos)', percentualDesejado: 0.1, percentualAtual: 0.04, valorInvestir: 1500, tipo: null } },
      { ticker: 'EFGH3', nome: 'Empresa EFGH', moeda: 'BRL', precoAtual: 10, variacaoDia: -0.02, quantidade: 50, precoTeto: 8, vies: 'Aguardar', totalAtualizado: 500, peso: 0.2, ultimoPago: null,
        radar: { ranking: 2, pvp: 0.9, pl: 12, descontoPl: '8% (5% abaixo - retorno em 12 anos)', percentualDesejado: 0.05, percentualAtual: 0.2, valorInvestir: 0, tipo: null } },
    ],
    fiis: [{ ticker: 'TEST11', nome: 'Fundo Teste', moeda: 'BRL', precoAtual: 100, quantidade: 10, precoTeto: 110, vies: 'Comprar', totalAtualizado: 1000, peso: 1, ultimoPago: { preco: 98, data: '2026-09-01', origem: 'transacao' } }],
    acoesEua: [{ ticker: 'AAA', nome: 'Aaa Corp', moeda: 'USD', precoAtual: 10, quantidade: 5, precoTeto: 12, vies: 'Comprar', totalAtualizado: 50, peso: 1, ultimoPago: null }],
    rendaFixa: [{ titulo: 'Tesouro Selic 2029', instituicao: 'CORRETORA X', categoria: 'Renda Emergencial', tipo: 'Tesouro Selic (LFT)', indexador: 'SELIC', vencimento: '2029-03-01', valorAtualizado: 1000, ultimoPago: { valor: 300, data: '2026-01-10', origem: 'transacao' } },
      { titulo: 'Tesouro IPCA+ 2035', instituicao: 'CORRETORA X', categoria: 'Renda Fixa', tipo: 'Tesouro IPCA+', indexador: 'IPCA', vencimento: '2035-05-15', valorAtualizado: 800, ultimoPago: null,
        taxaHoje: { taxa: 0.0762, pu: 2610, data: '2026-09-24' }, taxaContratada: { indice: 'IPCA', taxa: 0.065, texto: 'IPCA + 6,5%' } }],
  },
  metas: {
    acoes: { desejado: 0.6, atual: 0.64, valorInvestir: 0 }, acoesEua: { desejado: 0.4, atual: 0.36, valorInvestir: 200 }, fiis: { desejado: 0.4, atual: 0.35, valorInvestir: 500 },
    rendaFixa: { desejado: 0.1, atual: 0.1 }, rfEmergencial: { desejado: 0.9, atual: 0.95, valorInvestir: 0 }, rfLongoPrazo: { desejado: 0.1, atual: 0.05, valorInvestir: 50 },
  },
  aportes: [
    { id: 'AP-OLD', data: '2026-08-05', status: 'concluido', observacao: '', criadoEm: '', atualizadoEm: '', itens: [{ classe: 'fiis', ativo: 'TEST11', instituicao: '', moeda: 'BRL', qtdPlanejada: 2, precoPlanejado: 99, valorPlanejado: 198, qtdFinal: 2, precoFinal: 98, valorFinal: 196 }] },
  ],
  resumo: { '2026-09': { acoes: 200, fiis: 300, acoesEua: 50, acoesEuaUsd: 10, rendaFixa: 0, total: 550 }, '2026-08': { fiis: 196, total: 196 } },
  lancamentos: [
    { destino: 'transacoes', data: '2026-09-01', ativo: 'TEST11', tipo: 'Compra', qtd: 1, preco: 98, valor: 98, moeda: 'BRL' },
    { destino: 'proventos', data: '2026-08-25', ativo: 'TEST11', tipo: 'Rendimento', qtd: 10, preco: 0.8, valor: 8, moeda: 'BRL' },
    { destino: 'transacoesUsa', data: '2025-12-01', ativo: 'AAA', tipo: 'Compra', qtd: 1, preco: 10, valor: 10, moeda: 'USD', cambio: 5, valorBRL: 50 },
  ],
};

function montarDom(hash = '') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="transacoes">
    <div id="refreshControlTransacoes"></div>
    <div id="transacoesLoading"></div><div id="transacoesErro" hidden></div><div id="transacoesConteudo" hidden></div></body></html>`, { url: `https://exemplo.test/transacoes/index.html${hash}`, pretendToBeVisual: true });
  const w = dom.window;
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.localStorage = w.localStorage;
  w.localStorage.clear();
  return { dom, doc: w.document, w };
}
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const digitar = (w, el, valor, tipo = 'input') => { el.value = valor; el.dispatchEvent(new w.Event(tipo, { bubbles: true })); };
const esperar = () => new Promise((r) => setTimeout(r, 0));
// texto como a gente lê: um espaço entre elementos (textContent cola "TEST112 × ...")
const txt = (el) => {
  const partes = [];
  const w = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};

async function montar(extra = {}, hash = '') {
  const { dom, doc, w } = montarDom(hash);
  const { montarPaginaTransacoes } = await import('../assets/js/pages/transacoes.js');
  const chamadas = { salvar: [], excluir: [], importar: [] };
  const estadoServidor = { aportes: structuredClone(DADOS.aportes) };
  await montarPaginaTransacoes('tk', {
    doc,
    getTransacoesImpl: async () => ({ ...structuredClone(DADOS), aportes: structuredClone(estadoServidor.aportes) }),
    salvarAporteImpl: async (t, ap) => {
      chamadas.salvar.push(structuredClone(ap));
      const id = ap.id || `AP-${chamadas.salvar.length}`;
      estadoServidor.aportes = [{ ...ap, id, criadoEm: '', atualizadoEm: '', itens: ap.itens.filter((i) => ap.status !== 'concluido' || i.valorFinal > 0) }, ...estadoServidor.aportes.filter((a) => a.id !== id)];
      return { ok: true, id, aportes: structuredClone(estadoServidor.aportes) };
    },
    excluirAporteImpl: async (t, id) => {
      chamadas.excluir.push(id);
      estadoServidor.aportes = estadoServidor.aportes.filter((a) => a.id !== id);
      return { ok: true, aportes: structuredClone(estadoServidor.aportes) };
    },
    ...extra,
  });
  return { dom, doc, w, chamadas };
}

test('transações: abre em Aportes com as etapas, prateleira de Ações e o investido por mês; troca de aba e lembra pelo #', async () => {
  const { doc, w } = await montar();
  assert.equal(doc.getElementById('transacoesConteudo').hidden, false);
  assert.ok(doc.querySelector('[data-aba="aportes"]').classList.contains('active'));
  assert.equal(doc.querySelectorAll('.tx-etapa').length, 3);
  const linhas = [...doc.querySelectorAll('.tx-prateleira tbody tr[data-linha]')];
  assert.equal(linhas.length, 2, 'ações da carteira, maior posição primeiro');
  assert.match(txt(linhas[0]), /ABCD3.*R\$ 20,00.*R\$ 21,00.*12\/08.*-4,8%.*Comprar/);
  // 26/09/2026: "momento de aporte" logo abaixo de cada ativo
  const momentos = [...doc.querySelectorAll('.tx-prateleira tbody tr.tx-momento-tr')];
  assert.equal(momentos.length, 2);
  assert.equal(linhas[0].nextElementSibling, momentos[0], 'fica logo embaixo do ativo');
  assert.match(txt(momentos[0]), /^Bom momento Abaixo do preço-teto \(R\$ 25,00\): margem de 25,0% Abaixo do % desejado no Radar \(4,0% de 10,0%\): faltam R\$ 1\.500/);
  assert.ok(momentos[0].querySelector('.momento.nivel-bom'));
  assert.match(txt(momentos[1]), /^Melhor esperar Acima do preço-teto \(R\$ 8,00\) em 25,0% Acima do % desejado no Radar \(20,0% de 5,0%\)/);
  assert.ok(momentos[1].querySelector('.momento-mais'), 'o resto dos sinais fica recolhido');
  assert.match(txt(doc.querySelector('.tx-momento-nota')), /Não é recomendação/);
  assert.match(txt(doc.querySelector('.tx-mes-detalhe')), /Investido em setembro de 2026 R\$ 550,00/);
  clique(w, doc.querySelector('[data-aba="lancamentos"]'));
  assert.equal(doc.getElementById('txPainel-aportes').hidden, true);
  assert.ok(doc.querySelector('#txDrop'));
  assert.equal(doc.querySelectorAll('.tx-lista-mes').length, 3, 'agrupado por mês');
  assert.equal(doc.querySelectorAll('.tx-lista-linha').length, 2, 'as 2 compras (TEST11 e AAA)');
  assert.equal(doc.querySelectorAll('.tx-lista-provs').length, 1, 'o provento entra recolhido');
  assert.equal(w.location.hash, '#lancamentos');
});

test('aportes: carrinho - stepper e digitação, EUA em dólar, renda fixa por valor, título novo; fica guardado no navegador', async () => {
  const { doc, w } = await montar();
  const passo = (ticker, n) => clique(w, doc.querySelector(`[data-stepper="acoes:${ticker}"] [data-passo="${n}"]`));
  passo('ABCD3', 1); passo('ABCD3', 1);
  assert.equal(doc.querySelector('[data-qtd="acoes:ABCD3"]').value, '2');
  assert.match(txt(doc.querySelector('[data-subtotal="acoes:ABCD3"]')), /R\$ 40,00/);
  digitar(w, doc.querySelector('[data-qtd="acoes:ABCD3"]'), '10');
  assert.match(txt(doc.querySelector('.tx-recibo-total')), /R\$ 200,00/);
  assert.equal(doc.querySelector('[data-conta-classe="acoes"]').textContent, '1');
  clique(w, doc.querySelector('[data-classe="acoesEua"]'));
  digitar(w, doc.querySelector('[data-qtd="acoesEua:AAA"]'), '1,5');
  assert.match(txt(doc.querySelector('#txCarrinho')), /US\$ 15,00/);
  assert.match(txt(doc.querySelector('.tx-recibo-total')), /R\$ 275,00/, '15 dólares × 5');
  clique(w, doc.querySelector('[data-classe="rendaFixa"]'));
  digitar(w, doc.querySelector('[data-rf]'), '300');
  doc.getElementById('txRfNovoTitulo').value = 'Tesouro IPCA+ 2035';
  doc.getElementById('txRfNovoInst').value = 'CORRETORA X';
  doc.getElementById('txRfNovoValor').value = '100,50';
  doc.getElementById('txRfNovo').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  // 05/10/2026: Tesouro (tem PU de hoje na lista): 100,50 / 2.610 = 0,03 título -> R$ 78,30 de verdade
  assert.match(txt(doc.querySelector('.tx-recibo-total')), /R\$ 653,30/);
  assert.match(txt(doc.querySelector('#txCarrinho')), /0,03 título × R\$ 2\.610,00/);
  const guardado = JSON.parse(w.localStorage.getItem('transacoes.carrinho.v1'));
  assert.equal(Object.keys(guardado.itens).length, 4);
  clique(w, doc.querySelector('[data-tirar="acoesEua:AAA"]'));
  assert.match(txt(doc.querySelector('.tx-recibo-total')), /R\$ 578,30/);
});

test('aportes: confirmar -> aguardando valores finais -> ajustar preço -> concluir; quantidade 0 sai', async () => {
  const { doc, w, chamadas } = await montar();
  digitar(w, doc.querySelector('[data-qtd="acoes:ABCD3"]'), '10');
  digitar(w, doc.querySelector('[data-qtd="acoes:EFGH3"]'), '5');
  clique(w, doc.querySelector('[data-acao="confirmar-carrinho"]'));
  await esperar();
  assert.equal(chamadas.salvar.length, 1);
  assert.equal(chamadas.salvar[0].status, 'aguardando');
  assert.deepEqual(chamadas.salvar[0].itens.map((i) => [i.ativo, i.qtdPlanejada, i.precoPlanejado]), [['ABCD3', 10, 20], ['EFGH3', 5, 10]]);
  assert.equal(doc.querySelectorAll('.tx-recibo-linha').length, 0, 'carrinho esvaziou');
  const card = doc.querySelector('.tx-andamento');
  assert.ok(card, 'aparece em "Aguardando valores finais"');
  assert.match(txt(doc.querySelector('[data-aba="aportes"]')), /1/);
  digitar(w, card.querySelector('[data-final="preco"][data-i="0"]'), '19,50');
  digitar(w, card.querySelector('[data-final="qtd"][data-i="1"]'), '0');
  assert.match(txt(card.querySelector('.tx-andamento-totais')), /Planejado R\$ 250,00 → Pago R\$ 195,00 −R\$ 55,00/);
  clique(w, card.querySelector('[data-acao="concluir"]'));
  await esperar();
  const conc = chamadas.salvar[1];
  assert.equal(conc.status, 'concluido');
  assert.equal(conc.id, 'AP-1');
  assert.deepEqual(conc.itens.map((i) => [i.ativo, i.qtdFinal, i.precoFinal, i.valorFinal]), [['ABCD3', 10, 19.5, 195], ['EFGH3', 0, 10, 0]]);
  assert.equal(doc.querySelector('.tx-andamento'), null);
  assert.match(txt(doc.querySelector('#txHistorico')), /26\/09.*R\$ 195,00/);
});

test('aportes: cancelar pede confirmação na própria tela; excluir concluído; repetir no carrinho; editar no carrinho regrava o mesmo id', async () => {
  const { doc, w, chamadas } = await montar();
  digitar(w, doc.querySelector('[data-qtd="acoes:ABCD3"]'), '1');
  clique(w, doc.querySelector('[data-acao="confirmar-carrinho"]'));
  await esperar();
  clique(w, doc.querySelector('.tx-andamento [data-acao="editar"]'));
  assert.match(txt(doc.querySelector('.tx-recibo-editando')), /Editando o aporte de 26\/09\/2026/);
  digitar(w, doc.querySelector('[data-qtd="acoes:ABCD3"]'), '4');
  clique(w, doc.querySelector('[data-acao="confirmar-carrinho"]'));
  await esperar();
  assert.equal(chamadas.salvar[1].id, 'AP-1');
  assert.equal(chamadas.salvar[1].itens[0].qtdPlanejada, 4);
  clique(w, doc.querySelector('.tx-andamento [data-acao="cancelar"]'));
  assert.match(txt(doc.querySelector('.tx-confirmar')), /Cancelar este aporte\?/);
  assert.equal(chamadas.excluir.length, 0, 'só depois de confirmar');
  clique(w, doc.querySelector('[data-acao="cancelar-sim"]'));
  await esperar();
  assert.deepEqual(chamadas.excluir, ['AP-1']);
  assert.equal(doc.querySelector('.tx-andamento'), null);
  clique(w, doc.querySelector('[data-acao="repetir"][data-id="AP-OLD"]'));
  assert.equal(doc.querySelectorAll('.tx-recibo-linha').length, 1);
  assert.match(txt(doc.querySelector('.tx-recibo-linha')), /TEST11 2 × R\$ 100,00/);
  clique(w, doc.querySelector('[data-acao="excluir"][data-id="AP-OLD"]'));
  clique(w, doc.querySelector('[data-acao="excluir-sim"]'));
  await esperar();
  assert.deepEqual(chamadas.excluir, ['AP-1', 'AP-OLD']);
  assert.match(txt(doc.querySelector('#txHistorico')), /Nenhum aporte concluído/);
});

test('lançamentos: soltar o extrato -> conferência com a planilha -> só os novos marcados -> lança; lançar manualmente e "mesmo assim"', async () => {
  const csv = [
    'Statement,Header,Nome do campo,Valor do campo',
    'Operações,Header,DataDiscriminator,Categoria de ativos,Moeda,Símbolo,Data/hora,Quantidade,Preço Neg.,Preço Fch.,Rendimentos,Corr/Taxa,Base,P&L realizados,P&L MTM,Código',
    'Operações,Data,Order,Ações,USD,AAA,"2025-12-01, 10:00:00",1,10,10,-10,-0.1,10.1,0,0,O',
    'Operações,Data,Order,Ações,USD,AAA,"2026-09-20, 10:00:00",2,11,11,-22,-0.2,22.2,0,0,O',
  ].join('\n');
  const importar = [];
  const importarImpl = async (t, itens, opcoes) => {
    importar.push({ itens: structuredClone(itens), opcoes });
    if (opcoes.simular) return { ok: true, resultado: { itens: itens.map((it) => ({ uid: it.uid, situacao: it.data === '2025-12-01' ? 'lancado' : 'novo', motivo: '' })) } };
    if (opcoes.origem === 'Manual' && !itens[0].forcar) return { ok: true, resultado: { itens: [{ uid: 0, situacao: 'parecido', motivo: 'Já tem parecido.' }], gravados: {}, total: 0 } };
    return { ok: true, resultado: { itens: itens.map((it) => ({ uid: it.uid, situacao: 'gravado' })), gravados: { transacoesUsa: itens.length }, total: itens.length } };
  };
  const { doc, w } = await montar({ importarImpl }, '#lancamentos');
  const drop = doc.getElementById('txDrop');
  const ev = new w.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { files: [new w.File([csv], 'extrato.csv', { type: 'text/csv' })] };
  drop.dispatchEvent(ev);
  for (let i = 0; i < 10 && !doc.querySelector('.tx-tabela-rev'); i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.equal(importar[0].opcoes.simular, true);
  assert.match(txt(doc.querySelector('.tx-arqs')), /extrato\.csv Interactive Brokers · Extrato · 2 linhas/);
  assert.equal(doc.querySelectorAll('.tx-tabela-rev tbody tr').length, 1, 'o já lançado fica escondido');
  assert.match(txt(doc.querySelector('.tx-rev-chips')), /1 novos 1 já lançados/);
  clique(w, doc.querySelector('[data-mostrar-lancados="transacoesUsa"]'));
  assert.equal(doc.querySelectorAll('.tx-tabela-rev tbody tr').length, 2);
  clique(w, doc.querySelector('[data-lanc="gravar"]'));
  for (let i = 0; i < 10 && importar.length < 2; i += 1) await new Promise((r) => setTimeout(r, 5));
  await esperar();
  assert.equal(importar[1].opcoes.simular, false);
  assert.deepEqual(importar[1].itens.map((i) => [i.ticker, i.data, i.forcar]), [['AAA', '2026-09-20', false]]);
  assert.match(txt(doc.querySelector('.tx-revisao')), /Lançado: 1 em Transações - USA/);

  // manual
  clique(w, doc.querySelector('[data-manual-destino="transacoesUsa"]'));
  const form = doc.getElementById('txFormManual');
  form.querySelector('[name="ticker"]').value = 'aaa';
  form.querySelector('[name="qtd"]').value = '1';
  form.querySelector('[name="preco"]').value = '10,5';
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 10 && !doc.querySelector('[data-lanc="forcar-manual"]'); i += 1) await new Promise((r) => setTimeout(r, 5));
  const manual = importar[importar.length - 1];
  assert.equal(manual.opcoes.origem, 'Manual');
  assert.deepEqual([manual.itens[0].ticker, manual.itens[0].preco, manual.itens[0].data], ['AAA', 10.5, '2026-09-26']);
  assert.match(txt(doc.querySelector('.tx-form-manual .tx-aviso')), /Já tem parecido/);
  clique(w, doc.querySelector('[data-lanc="forcar-manual"]'));
  for (let i = 0; i < 10 && importar[importar.length - 1].itens[0].forcar !== true; i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.equal(importar[importar.length - 1].itens[0].forcar, true);
});

test('lançamentos: lista com filtro de onde/ano/ativo, busca, proventos recolhidos e CSV', async () => {
  const { doc, w } = await montar({}, '#lancamentos');
  clique(w, doc.querySelector('[data-lista-filtro="proventos"]'));
  assert.equal(doc.querySelectorAll('.tx-lista-provs').length, 1);
  assert.equal(doc.querySelectorAll('.tx-lista-linha').length, 0, 'recolhido por padrão');
  clique(w, doc.querySelector('[data-provs-toggle="2026-08"]'));
  assert.equal(doc.querySelectorAll('.tx-lista-linha').length, 1, 'expandiu o provento');
  clique(w, doc.querySelector('[data-lista-filtro="todos"]'));
  digitar(w, doc.getElementById('txListaAno'), '2025', 'change');
  assert.equal(doc.querySelectorAll('.tx-lista-linha').length, 1);
  const { csvLancamentos, filtrarLista } = await import('../assets/js/pages/lancamentos.js');
  const csv = csvLancamentos(filtrarLista(DADOS.lancamentos, { filtro: 'todos', busca: 'test' })).replace('﻿', '').split('\r\n');
  assert.equal(csv[0], 'Data;Onde;Ativo;Tipo;Quantidade;Preço;Valor;Moeda;Instituição');
  assert.equal(csv[1], '01/09/2026;Transações · Brasil;TEST11;Compra;1;98;98;BRL;');
});

test('aportes: momento de aporte na Renda Fixa (taxa de hoje x a sua média, metas) e ordenar por "Melhor momento"', async () => {
  const { doc, w } = await montar();
  clique(w, doc.querySelector('[data-classe="rendaFixa"]'));
  const momentos = [...doc.querySelectorAll('.tx-prateleira-rf tr.tx-momento-tr')];
  assert.equal(momentos.length, 2);
  const ipca = momentos.find((m) => /IPCA/.test(txt(m)));
  assert.match(txt(ipca), /^Bom momento Taxa de hoje \(IPCA \+ 7,62%\) maior que a sua média \(IPCA \+ 6,50%\)/);
  const selic = momentos.find((m) => /Selic/.test(txt(m)));
  assert.match(txt(selic), /Melhor esperar .*Reserva de emergência já acima da meta \(95,0% de 90%\)/);
  const ordem = doc.getElementById('txOrdem');
  ordem.value = 'momento';
  ordem.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.match(txt(doc.querySelector('.tx-prateleira-rf tbody tr[data-linha]')), /Tesouro IPCA\+ 2035/, 'melhor momento primeiro');
});

test('lançamentos: ativo sem cadastro -> atalho pro cadastro em Carteiras, "Conferir de novo"; depois de lançar, avisa "Consolidação necessária"', async () => {
  const csv = [
    'Statement,Header,Nome do campo,Valor do campo',
    'Operações,Header,DataDiscriminator,Categoria de ativos,Moeda,Símbolo,Data/hora,Quantidade,Preço Neg.,Preço Fch.,Rendimentos,Corr/Taxa,Base,P&L realizados,P&L MTM,Código',
    'Operações,Data,Order,Ações,USD,NOVA,"2026-09-20, 10:00:00",2,11,11,-22,-0.2,22.2,0,0,O',
  ].join('\n');
  let cadastrado = false;
  const importar = [];
  const consolidacao = { pendente: true, ativos: ['NOVA'], precos: [], rf: false, motivos: [{ texto: 'Importação: 1 transação(ões) de NOVA' }] };
  const importarImpl = async (t, itens, opcoes) => {
    importar.push({ itens: structuredClone(itens), opcoes });
    if (opcoes.simular) {
      return { ok: true, resultado: { itens: itens.map((it) => (cadastrado ? { uid: it.uid, situacao: 'novo', motivo: '' }
        : { uid: it.uid, situacao: 'bloqueado', motivo: 'NOVA ainda não está cadastrado em Ações EUA: adicione o ativo em Carteiras (Adicionar ativo) antes de importar.' })) } };
    }
    return { ok: true, resultado: { itens: itens.map((it) => ({ uid: it.uid, situacao: 'gravado' })), gravados: { transacoesUsa: 1 }, total: 1, consolidacao } };
  };
  const { doc, w } = await montar({ importarImpl }, '#lancamentos');
  const eventos = [];
  w.addEventListener('consolidacao:pendente', (e) => eventos.push(['pendente', e.detail]));
  w.addEventListener('consolidacao:abrir', () => eventos.push(['abrir']));
  const ev = new w.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { files: [new w.File([csv], 'extrato.csv', { type: 'text/csv' })] };
  doc.getElementById('txDrop').dispatchEvent(ev);
  for (let i = 0; i < 20 && !doc.querySelector('.tx-tabela-rev'); i += 1) await new Promise((r) => setTimeout(r, 5));
  const link = doc.querySelector('.tx-link-novo');
  assert.ok(link, 'atalho pro cadastro');
  assert.equal(link.getAttribute('href'), '../carteiras/index.html?novoAtivo=NOVA&classe=acoesEua#acoes-eua');
  assert.equal(link.getAttribute('target'), '_blank');
  assert.ok(doc.querySelector('[data-lanc="gravar"]').disabled, 'nada marcado');

  cadastrado = true; // cadastrou em Carteiras, voltou
  clique(w, doc.querySelector('[data-lanc="reconferir"]'));
  for (let i = 0; i < 20 && !doc.querySelector('.tx-rev-novo'); i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.equal(importar.length, 2);
  assert.equal(importar[1].opcoes.simular, true);
  assert.ok(!doc.querySelector('.tx-link-novo'));
  assert.equal(doc.querySelector('[data-lanc="gravar"]').disabled, false, 'virou novo e já vem marcado');

  clique(w, doc.querySelector('[data-lanc="gravar"]'));
  for (let i = 0; i < 20 && !doc.querySelector('.tx-consol'); i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.match(txt(doc.querySelector('.tx-consol')), /Consolidação necessária/);
  assert.deepEqual(eventos[0], ['pendente', consolidacao], 'o topo do site é avisado na hora');
  clique(w, doc.querySelector('[data-lanc="consolidar"]'));
  assert.deepEqual(eventos[1], ['abrir']);
});

test('aportes: mapa de compras - quadrado com preço e ×qtd, clicar abre o detalhe ao lado, fora fecha, repetir no carrinho', async () => {
  const { doc, w } = await montar();
  const secao = doc.getElementById('txMapaCompras');
  assert.ok(secao, 'Aportes realizados fica na aba Aportes');
  // 05/10/2026: "Aportes realizados" vai pra BAIXO de "Novo aporte" (ocupa muito espaço)
  assert.ok(doc.getElementById('txNovoAporte').compareDocumentPosition(secao) & 4, 'abaixo de "Novo aporte"');
  assert.ok(doc.querySelector('[data-mapa-classe="fiis"]').classList.contains('active'));
  assert.match(txt(secao.querySelector('thead')), /set\/26 em andamento/);
  const cel = doc.querySelector('[data-mapa-cel="TEST11|2026-09"]');
  assert.match(txt(cel), /R\$ 98,00 ×1/);
  assert.match(cel.getAttribute('title').replace(/\s+/g, ' '), /TEST11 em set\/26: 01\/09 1 × R\$ 98,00/);
  const pop = doc.getElementById('txMapaPop');
  assert.equal(pop.hidden, true);
  clique(w, cel);
  assert.equal(pop.hidden, false);
  assert.ok(cel.classList.contains('sel'));
  assert.match(txt(pop), /FIIs TEST11 set\/26/);
  assert.match(txt(pop), /01\/09 ×1 R\$ 98,00 R\$ 98,00/);
  assert.match(txt(pop), /vs cotação de hoje R\$ 100,00 \+2,0%/);
  clique(w, doc.querySelector('.tx-etapas'));
  assert.equal(pop.hidden, true, 'clicar fora fecha');
  assert.ok(!cel.classList.contains('sel'));
  clique(w, cel);
  clique(w, pop.querySelector('[data-mapa-repetir]'));
  const guardado = JSON.parse(w.localStorage.getItem('transacoes.carrinho.v1'));
  assert.deepEqual([guardado.itens['fiis:TEST11'].qtd, guardado.itens['fiis:TEST11'].preco], [1, 100]);
  assert.match(txt(doc.querySelector('.tx-aviso')), /TEST11 foi pro carrinho: 1 × R\$ 100,00/);
  assert.ok(doc.querySelector('[data-classe="fiis"]').classList.contains('active'), 'a prateleira troca pra classe do ativo');
  clique(w, doc.querySelector('[data-mapa-classe="acoesEua"]'));
  assert.match(txt(doc.querySelector('#txMapaCompras tfoot')), /Total em R\$/);
  assert.match(txt(doc.querySelector('#txMapaCompras .tx-mapa-ult')), /Última/);
});

test('lançamentos: tipo em tag, ativo com a classe, "Em reais" nas compras em dólar; o botão do mapa abre o gráfico do ativo', async () => {
  const historico = [];
  const { doc, w } = await montar({ getHistoricoAtivoImpl: async (t, ticker) => { historico.push(ticker); return { ok: true, resultado: { ticker, serie: [{ data: '2025-10-01', preco: 95 }, { data: '2026-06-01', preco: 97 }, { data: '2026-09-25', preco: 100 }] } }; } });
  clique(w, doc.querySelector('[data-mapa-cel="TEST11|2026-09"]'));
  clique(w, doc.querySelector('#txMapaPop [data-mapa-grafico]'));
  for (let i = 0; i < 20 && !doc.querySelector('#txListaGrafico svg'); i += 1) await new Promise((r) => setTimeout(r, 5));
  assert.equal(doc.getElementById('txPainel-lancamentos').hidden, false, 'foi pra aba Lançamentos');
  assert.deepEqual(historico, ['TEST11']);
  assert.equal(doc.getElementById('txListaAtivo').value, 'TEST11');
  assert.ok(doc.querySelector('#txListaGrafico svg.ag-chart'));
  assert.equal(doc.querySelectorAll('#txListaGrafico .ag-ponto').length, 1, 'a compra de 01/09 vira um ponto');
  assert.match(txt(doc.querySelector('.ag-stats')), /Compras no período: 1/);
  const linha = doc.querySelector('.tx-lista-linha');
  assert.ok(linha.querySelector('.tx-tipo-compra'));
  assert.match(txt(linha), /TEST11 FIIs Compra ×1 R\$ 98,00 R\$ 98,00/);
  digitar(w, doc.getElementById('txListaAtivo'), '', 'change');
  const usa = [...doc.querySelectorAll('.tx-lista-linha')].find((l) => /AAA/.test(txt(l)));
  assert.match(txt(usa), /AAA Ações EUA Compra ×1 US\$ 10,00 US\$ 10,00 R\$ 50,00 câmbio 5,00/);
});

// ---------------------------------------------------------------------------
// 05/10/2026: Renda Fixa por valor/quantidade, carrinho em merge, expiração e o fluxo das Ações EUA
// ---------------------------------------------------------------------------

const dadosRf = () => {
  const d = structuredClone(DADOS);
  d.classes.rendaFixa[0].valorInvestido = 600;
  d.classes.rendaFixa[1].valorInvestido = 700;
  d.classes.rendaFixa[1].cotacao = { pu: 2610, puVenda: 2600, data: '2026-09-24' };
  d.tesouro = [{ nome: 'Tesouro Selic 2032', pu: 20142, puVenda: 20100, data: '2026-09-24' }, { nome: 'Tesouro IPCA+ 2035', pu: 2610, data: '2026-09-24' }];
  return d;
};

test('renda fixa: tabela como as outras classes - tipo junto da instituição, Cotação (PU), Na classe (investido e %), CDB sem PU', async () => {
  const { doc, w } = await montar({ getTransacoesImpl: async () => dadosRf() });
  clique(w, doc.querySelector('[data-classe="rendaFixa"]'));
  const cab = [...doc.querySelectorAll('.tx-prateleira-rf thead th')].map((th) => th.textContent);
  assert.deepEqual(cab, ['Título', 'Cotação', 'Na classe', 'Último aporte', 'Vencimento', 'Aplicar']);
  const linhas = [...doc.querySelectorAll('.tx-prateleira-rf tbody tr[data-linha]')];
  const selic = linhas.find((l) => /Selic 2029/.test(l.textContent));
  const ipca = linhas.find((l) => /IPCA\+ 2035/.test(l.textContent));
  assert.match(txt(selic.querySelector('td.esq')), /Tesouro Selic 2029 CORRETORA X Renda emergencial/);
  assert.ok(selic.querySelector('.tx-tipo-rf.emergencial'));
  assert.match(txt(ipca.querySelector('td.esq')), /CORRETORA X Renda fixa/);
  assert.match(txt(ipca.querySelector('[data-rot="Cotação"]')).replace(/ /g, ' '), /R\$ 2\.610,00 PU · 24\/09/);
  assert.match(txt(selic.querySelector('[data-rot="Cotação"]')).replace(/ /g, ' '), /^— atualizado R\$ 1\.000,00/, 'sem PU: traço e o valor atualizado');
  // % da classe pelo valor atualizado (1000 de 1800 = 55,6%), embaixo do valor investido
  assert.match(txt(selic.querySelector('[data-rot="Na classe"]')).replace(/ /g, ' '), /^R\$ 600,00 55,6%/);
  assert.match(txt(ipca.querySelector('[data-rot="Na classe"]')).replace(/ /g, ' '), /^R\$ 700,00 44,4%/);
  assert.equal(selic.querySelector('[data-rf-qtd]'), null, 'CDB/sem PU: só valor, livre');
});

test('renda fixa: Tesouro por valor OU por quantidade (2 casas), mostra o mínimo do dia (1% do PU) e avisa abaixo dele', async () => {
  const { doc, w } = await montar({ getTransacoesImpl: async () => dadosRf() });
  clique(w, doc.querySelector('[data-classe="rendaFixa"]'));
  const k = 'rendaFixa:Tesouro IPCA+ 2035|CORRETORA X';
  const valor = doc.querySelector(`[data-rf="${k}"]`);
  const qtd = doc.querySelector(`[data-rf-qtd="${k}"]`);
  const info = () => txt(doc.querySelector(`[data-rf-info="${k}"]`)).replace(/ /g, ' ');
  assert.equal(info(), 'mínimo hoje R$ 26,10 (1% do PU de R$ 2.610,00)');
  digitar(w, valor, '500');
  assert.equal(qtd.value, '0,19', 'valor ÷ PU, 2 casas pra baixo');
  assert.match(info(), /= 0,19 título · R\$ 495,90 \(sobram R\$ 4,10/);
  assert.match(txt(doc.querySelector('#txCarrinho')).replace(/ /g, ' '), /Tesouro IPCA\+ 2035 0,19 título × R\$ 2\.610,00/);
  assert.match(txt(doc.querySelector('.tx-recibo-total')).replace(/ /g, ' '), /R\$ 495,90/, 'o carrinho leva o que o Tesouro cobra de verdade');
  digitar(w, qtd, '0,02');
  assert.equal(valor.value, '52,20', 'quantidade × PU');
  assert.match(txt(doc.querySelector('.tx-recibo-total')).replace(/ /g, ' '), /R\$ 52,20/);
  digitar(w, valor, '20');
  assert.match(info(), /abaixo do mínimo de R\$ 26,10/);
  assert.equal(doc.querySelectorAll('.tx-recibo-linha').length, 0, 'abaixo do mínimo não vai pro carrinho');
  const guardado = JSON.parse(w.localStorage.getItem('transacoes.carrinho.v1'));
  assert.deepEqual(guardado.itens, {});
  digitar(w, valor, '26,10');
  assert.equal(qtd.value, '0,01', 'exatamente o mínimo');
  const g2 = JSON.parse(w.localStorage.getItem('transacoes.carrinho.v1'));
  assert.deepEqual(g2.itens[k], { classe: 'rendaFixa', ativo: 'Tesouro IPCA+ 2035', instituicao: 'CORRETORA X', moeda: 'BRL', valor: 26.1, qtd: 0.01, pu: 2610 });
});

test('renda fixa: título novo do Tesouro pela lista de hoje (mínimo R$ 201,42 = 1% de R$ 20.142) e confirmar guarda quantidade e PU', async () => {
  const { doc, w, chamadas } = await montar({ getTransacoesImpl: async () => dadosRf() });
  clique(w, doc.querySelector('[data-classe="rendaFixa"]'));
  assert.ok([...doc.querySelectorAll('#txTitulosNovos option')].some((o) => o.value === 'Tesouro Selic 2032'), 'o que o Tesouro vende hoje entra nas sugestões');
  const novo = doc.getElementById('txRfNovo');
  const info = () => txt(doc.getElementById('txRfNovoInfo')).replace(/ /g, ' ');
  digitar(w, doc.getElementById('txRfNovoTitulo'), 'tesouro selic 2032');
  assert.equal(info(), 'mínimo hoje R$ 201,42 (1% do PU de R$ 20.142,00)');
  doc.getElementById('txRfNovoInst').value = 'XP';
  digitar(w, doc.getElementById('txRfNovoValor'), '150');
  assert.match(info(), /abaixo do mínimo de R\$ 201,42/);
  novo.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(doc.querySelectorAll('.tx-recibo-linha').length, 0, 'abaixo do mínimo não entra');
  digitar(w, doc.getElementById('txRfNovoValor'), '410');
  novo.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  assert.match(txt(doc.querySelector('#txCarrinho')).replace(/ /g, ' '), /Tesouro Selic 2032 0,02 títulos? × R\$ 20\.142,00 · XP R\$ 402,84/);
  clique(w, doc.querySelector('[data-acao="confirmar-carrinho"]'));
  await esperar();
  assert.deepEqual(chamadas.salvar[0].itens, [{ classe: 'rendaFixa', ativo: 'Tesouro Selic 2032', instituicao: 'XP', moeda: 'BRL', valorPlanejado: 402.84, qtdPlanejada: 0.02, precoPlanejado: 20142 }]);
});

test('carrinho: "Aportes realizados" fica abaixo de "Novo aporte"; mudar o carrinho guarda o dólar e avisa o header (carrinho:mudou)', async () => {
  const { doc, w } = await montar();
  const ordem = [...doc.querySelectorAll('#txPainel-aportes > section')].map((s) => s.id);
  assert.ok(ordem.indexOf('txNovoAporte') < ordem.indexOf('txMapaCompras'));
  const eventos = [];
  w.addEventListener('carrinho:mudou', (ev) => eventos.push(ev.detail.origem));
  digitar(w, doc.querySelector('[data-qtd="acoes:ABCD3"]'), '3');
  assert.deepEqual(eventos, ['pagina']);
  const guardado = JSON.parse(w.localStorage.getItem('transacoes.carrinho.v1'));
  assert.equal(guardado.cambio, 5, 'o header precisa do dólar pra somar o que está em US$');
});

test('carrinho: o header descarta ("Não comprei") e a tela esvazia o carrinho; "#carrinho" abre o carrinho; carrinho de dia passado não ganha cotação nova', async () => {
  const { doc, w } = await montar();
  digitar(w, doc.querySelector('[data-qtd="acoes:ABCD3"]'), '3');
  assert.equal(doc.querySelectorAll('.tx-recibo-linha').length, 1);
  w.localStorage.removeItem('transacoes.carrinho.v1');
  w.dispatchEvent(new w.CustomEvent('carrinho:mudou', { detail: { origem: 'header' } }));
  assert.equal(doc.querySelectorAll('.tx-recibo-linha').length, 0);
  assert.equal(doc.querySelector('[data-qtd="acoes:ABCD3"]').value, '');
  // "Ir para Transações" do header: abre o carrinho na tela
  w.dispatchEvent(new w.CustomEvent('carrinho:abrir'));
  assert.ok(doc.getElementById('txCarrinho').classList.contains('aberto'));
});

test('carrinho: abrir com "#carrinho" e com carrinho de ontem (preços congelados no dia dele, confirma com a data dele)', async () => {
  const ontem = { editandoId: null, data: '2026-09-25', observacao: '', perguntadoEm: '2026-09-26', itens: { 'acoes:ABCD3': { classe: 'acoes', ativo: 'ABCD3', moeda: 'BRL', qtd: 5, preco: 19 } } };
  const { dom, doc, w } = montarDom('#carrinho');
  const { montarPaginaTransacoes } = await import('../assets/js/pages/transacoes.js');
  w.localStorage.setItem('transacoes.carrinho.v1', JSON.stringify(ontem));
  const salvos = [];
  await montarPaginaTransacoes('tk', { doc, getTransacoesImpl: async () => structuredClone(DADOS), salvarAporteImpl: async (t, ap) => { salvos.push(ap); return { ok: true, id: 'AP-9', aportes: [{ ...ap, id: 'AP-9', itens: ap.itens }] }; } });
  assert.ok(doc.getElementById('txCarrinho').classList.contains('aberto'), '#carrinho abre o carrinho');
  assert.match(txt(doc.querySelector('.tx-recibo-linha')).replace(/ /g, ' '), /ABCD3 5 × R\$ 19,00/, 'a cotação de hoje (R$ 20,00) não troca o preço do dia dele');
  assert.equal(doc.getElementById('txDataAporte').value, '2026-09-25');
  clique(w, doc.querySelector('[data-acao="confirmar-carrinho"]'));
  await esperar();
  assert.equal(salvos[0].data, '2026-09-25');
  assert.equal(salvos[0].itens[0].precoPlanejado, 19);
  dom.window.close();
});

test('carrinho: outro carrinho no MESMO dia soma no aporte que já está aguardando (sem duplicar o confirmado); Editar continua', async () => {
  const { doc, w, chamadas } = await montar();
  digitar(w, doc.querySelector('[data-qtd="acoes:ABCD3"]'), '10');
  digitar(w, doc.querySelector('[data-qtd="acoes:EFGH3"]'), '5');
  clique(w, doc.querySelector('[data-acao="confirmar-carrinho"]'));
  await esperar();
  assert.equal(doc.querySelectorAll('.tx-andamento').length, 1);
  // segundo carrinho do mesmo dia: mais ABCD3 (mesmo ativo) e um FII novo
  digitar(w, doc.querySelector('[data-qtd="acoes:ABCD3"]'), '2');
  clique(w, doc.querySelector('[data-classe="fiis"]'));
  digitar(w, doc.querySelector('[data-qtd="fiis:TEST11"]'), '1');
  assert.match(txt(doc.querySelector('.tx-recibo-mescla')), /Já existe um aporte de 26\/09\/2026 aguardando valores finais.*somado a ele, sem duplicar/);
  assert.match(txt(doc.querySelector('[data-acao="confirmar-carrinho"]')), /Somar ao aporte do dia/);
  assert.ok(doc.querySelector('.tx-recibo-mescla [data-acao="editar"]'), 'o botão Editar do aporte existente continua');
  clique(w, doc.querySelector('[data-acao="confirmar-carrinho"]'));
  await esperar();
  const m = chamadas.salvar[1];
  assert.equal(m.id, 'AP-1', 'regrava o mesmo aporte');
  assert.equal(m.status, 'aguardando');
  assert.deepEqual(m.itens.map((i) => [i.ativo, i.qtdPlanejada, i.valorPlanejado]), [['ABCD3', 12, 240], ['EFGH3', 5, 50], ['TEST11', 1, 100]]);
  assert.deepEqual(chamadas.excluir, [], 'ninguém foi apagado');
  assert.equal(doc.querySelectorAll('.tx-andamento').length, 1, 'continua um card só lá em cima');
  assert.match(txt(doc.querySelector('.tx-aviso')), /somado.*aporte de 26\/09\/2026/);
});

test('carrinho: dois aportes aguardando no mesmo dia (já duplicados) -> "Juntar" num só', async () => {
  const d = structuredClone(DADOS);
  d.aportes = [
    { id: 'AP-B', data: '2026-09-26', status: 'aguardando', observacao: 'segundo', criadoEm: '2026-09-26T15:00:00Z', atualizadoEm: '', itens: [{ classe: 'acoes', ativo: 'ABCD3', instituicao: '', moeda: 'BRL', qtdPlanejada: 2, precoPlanejado: 20, valorPlanejado: 40 }, { classe: 'fiis', ativo: 'TEST11', instituicao: '', moeda: 'BRL', qtdPlanejada: 1, precoPlanejado: 100, valorPlanejado: 100 }] },
    { id: 'AP-A', data: '2026-09-26', status: 'aguardando', observacao: 'primeiro', criadoEm: '2026-09-26T13:00:00Z', atualizadoEm: '', itens: [{ classe: 'acoes', ativo: 'ABCD3', instituicao: '', moeda: 'BRL', qtdPlanejada: 10, precoPlanejado: 20, valorPlanejado: 200 }] },
    ...d.aportes,
  ];
  const { doc, w, chamadas } = await montar({ getTransacoesImpl: async () => structuredClone(d) });
  assert.match(txt(doc.querySelector('.tx-aviso-juntar')), /Há 2 aportes de 26\/09\/2026 aguardando valores finais/);
  clique(w, doc.querySelector('[data-acao="juntar-dia"]'));
  await esperar();
  assert.equal(chamadas.salvar.length, 1);
  assert.equal(chamadas.salvar[0].id, 'AP-A', 'junta no mais antigo');
  assert.deepEqual(chamadas.salvar[0].itens.map((i) => [i.ativo, i.qtdPlanejada, i.valorPlanejado]), [['ABCD3', 12, 240], ['TEST11', 1, 100]]);
  assert.equal(chamadas.salvar[0].observacao, 'primeiro · segundo');
  assert.deepEqual(chamadas.excluir, ['AP-B']);
  assert.equal(doc.querySelectorAll('.tx-andamento').length, 1);
  assert.equal(doc.querySelector('.tx-aviso-juntar'), null);
});

test('ações EUA: etapa 1 estima os dólares da Remessa (R$ -> US$ e o inverso) com taxas editáveis; registrar manda o envio pro caixa', async () => {
  const caixa = { saldoUsd: 0, movimentos: [] };
  const envios = [];
  const { doc, w } = await montar({
    getTransacoesImpl: async () => ({ ...structuredClone(DADOS), caixaDolar: structuredClone(caixa) }),
    salvarCaixaDolarImpl: async (t, mov) => {
      envios.push(mov);
      caixa.movimentos.unshift({ id: `CX-${envios.length}`, aporteId: '', observacao: '', ...mov });
      caixa.saldoUsd += mov.usd;
      return { ok: true, id: `CX-${envios.length}`, caixaDolar: structuredClone(caixa) };
    },
    excluirCaixaDolarImpl: async (t, id) => {
      const i = caixa.movimentos.findIndex((m) => m.id === id);
      caixa.saldoUsd -= caixa.movimentos[i].usd;
      caixa.movimentos.splice(i, 1);
      return { ok: true, caixaDolar: structuredClone(caixa) };
    },
  });
  clique(w, doc.querySelector('[data-classe="acoesEua"]'));
  assert.match(txt(doc.getElementById('txEuaFluxo')), /2 etapas.*1 Enviar dólares.*2 Comprar ações/);
  assert.match(txt(doc.getElementById('txEuaComprar')).replace(/ /g, ' '), /Caixa em dólar aguardando compra US\$ 0,00/);
  digitar(w, doc.getElementById('txRemValor'), '350');
  const res = () => txt(doc.getElementById('txRemResultado')).replace(/ /g, ' ');
  // dólar comercial do site: R$ 5,00; taxa de conversão 1,13% e encargos 1,10% (padrões)
  assert.match(res(), /Você envia R\$ 350,00 Chegam US\$ 68,46 Dólar comercial R\$ 5,0000 Taxa de conversão \(1,13%\) R\$ 3,87/);
  assert.match(res(), /Valor efetivo por US\$ \(VET\) R\$ 5,1121/);
  // taxas editáveis
  digitar(w, doc.getElementById('txRemConv'), '0,5');
  digitar(w, doc.getElementById('txRemEnc'), '0');
  assert.match(res(), /Chegam US\$ 69,65/);
  assert.deepEqual(JSON.parse(w.localStorage.getItem('transacoes.remessa.v1')), { conversao: 0.005, encargos: 0 }, 'as taxas do Tiago ficam guardadas');
  digitar(w, doc.getElementById('txRemCom'), '5,10');
  assert.match(res(), /Dólar comercial R\$ 5,1000/);
  // caminho inverso: quero US$ 100 -> quantos R$ enviar
  clique(w, doc.querySelector('[data-rem-modo="dolares"]'));
  digitar(w, doc.getElementById('txRemValor'), '100');
  assert.match(res(), /Você precisa enviar R\$ 512,55 Você recebe US\$ 100,00/);
  clique(w, doc.querySelector('[data-acao="rem-registrar"]'));
  await esperar();
  assert.equal(envios.length, 1);
  assert.deepEqual([envios[0].tipo, envios[0].usd, envios[0].reais, envios[0].data, envios[0].comercial], ['envio', 100, 512.55, '2026-09-26', 5.1]);
  assert.match(txt(doc.getElementById('txEuaComprar')).replace(/ /g, ' '), /Caixa em dólar aguardando compra US\$ 100,00/);
  assert.match(txt(doc.querySelector('.tx-eua-movs')).replace(/ /g, ' '), /Envio 26\/09\/2026 · R\$ 512,55 · Remessa Online \(estimativa\) \+US\$ 100,00/);
  assert.match(txt(doc.querySelector('.tx-aviso')), /Envio registrado: US\$ 100,00 no caixa em dólar/);
  clique(w, doc.querySelector('[data-acao="rem-excluir"]'));
  await esperar();
  assert.match(txt(doc.getElementById('txEuaComprar')).replace(/ /g, ' '), /Caixa em dólar aguardando compra US\$ 0,00/);
});

test('ações EUA: etapa 2 sugere a divisão do caixa pelos alvos e põe no carrinho; escolher as ações mostra quantos US$ faltam e leva pro envio', async () => {
  const d = structuredClone(DADOS);
  d.classes.acoesEua = [
    { ticker: 'AAA', nome: 'Aaa Corp', moeda: 'USD', precoAtual: 10, quantidade: 5, precoTeto: 12, vies: 'Comprar', totalAtualizado: 50, peso: 0.5, ultimoPago: null, radar: { percentualDesejado: 0.5, percentualAtual: 0.2 } },
    { ticker: 'BBB', nome: 'Bbb Corp', moeda: 'USD', precoAtual: 25, quantidade: 2, precoTeto: 30, vies: 'Comprar', totalAtualizado: 50, peso: 0.5, ultimoPago: null, radar: { percentualDesejado: 0.3, percentualAtual: 0.3 } },
  ];
  d.caixaDolar = { saldoUsd: 100, movimentos: [{ id: 'CX-1', data: '2026-09-25', tipo: 'envio', usd: 100, reais: 520, aporteId: '', observacao: '' }] };
  const { doc, w } = await montar({ getTransacoesImpl: async () => structuredClone(d) });
  clique(w, doc.querySelector('[data-classe="acoesEua"]'));
  clique(w, doc.querySelector('[data-acao="eua-sugerir"]'));
  assert.equal(doc.querySelector('[data-qtd="acoesEua:AAA"]').value, '10', 'só a que está abaixo do alvo recebe: US$ 100 em ações de US$ 10');
  assert.equal(doc.querySelector('[data-qtd="acoesEua:BBB"]').value, '');
  assert.match(txt(doc.getElementById('txEuaSugestao')).replace(/ /g, ' '), /Divisão sugerida.*AAA 10 × US\$ 10,00 = US\$ 100,00 20,0% de 50,0% desejado no Radar.*Usa US\$ 100,00; sobra US\$ 0,00/);
  assert.match(txt(doc.getElementById('txEuaNecessidade')).replace(/ /g, ' '), /O caixa cobre: sobram US\$ 0,00/);
  // caminho inverso: quero mais ações do que o caixa cobre
  digitar(w, doc.querySelector('[data-qtd="acoesEua:BBB"]'), '2');
  const nec = txt(doc.getElementById('txEuaNecessidade')).replace(/ /g, ' ');
  assert.match(nec, /Ações no carrinho: US\$ 150,00 · caixa em dólar: US\$ 100,00 Faltam US\$ 50,00 no caixa → enviar ≈ R\$ 255,61 \(VET 5,1121\)/);
  assert.match(txt(doc.querySelector('#txCarrinho .tx-eua-necessidade')).replace(/ /g, ' '), /Faltam US\$ 50,00/, 'também no carrinho');
  clique(w, doc.querySelector('#txEuaNecessidade [data-acao="eua-preparar-envio"]'));
  assert.equal(doc.getElementById('txRemValor').value, '50,00');
  assert.ok(doc.querySelector('[data-rem-modo="dolares"]').classList.contains('active'));
  assert.match(txt(doc.getElementById('txRemResultado')).replace(/ /g, ' '), /Você precisa enviar R\$ 255,61 Você recebe US\$ 50,00/);
});

test('ações EUA: o ajuste de saldo manda a diferença como "ajuste"', async () => {
  const d = structuredClone(DADOS);
  d.caixaDolar = { saldoUsd: 30, movimentos: [{ id: 'CX-1', data: '2026-09-25', tipo: 'envio', usd: 30, reais: 150, aporteId: '', observacao: '' }] };
  const movs = [];
  const { doc, w } = await montar({
    getTransacoesImpl: async () => structuredClone(d),
    salvarCaixaDolarImpl: async (t, mov) => { movs.push(mov); return { ok: true, id: 'CX-2', caixaDolar: { saldoUsd: 75, movimentos: [{ id: 'CX-2', aporteId: '', observacao: '', ...mov }, ...d.caixaDolar.movimentos] } }; },
  });
  clique(w, doc.querySelector('[data-classe="acoesEua"]'));
  doc.getElementById('txEuaAjusteValor').value = '75';
  doc.getElementById('txEuaAjuste').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await esperar();
  assert.deepEqual([movs[0].tipo, movs[0].usd], ['ajuste', 45]);
  assert.match(txt(doc.getElementById('txEuaComprar')).replace(/ /g, ' '), /Caixa em dólar aguardando compra US\$ 75,00/);
});

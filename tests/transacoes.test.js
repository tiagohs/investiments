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
    { destino: 'transacoesUsa', data: '2025-12-01', ativo: 'AAA', tipo: 'Compra', qtd: 1, preco: 10, valor: 10, moeda: 'USD' },
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
  assert.equal(doc.querySelectorAll('.tx-tabela-lista tbody tr').length, 3);
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
  assert.match(txt(doc.querySelector('.tx-recibo-total')), /R\$ 675,50/);
  const guardado = JSON.parse(w.localStorage.getItem('transacoes.carrinho.v1'));
  assert.equal(Object.keys(guardado.itens).length, 4);
  clique(w, doc.querySelector('[data-tirar="acoesEua:AAA"]'));
  assert.match(txt(doc.querySelector('.tx-recibo-total')), /R\$ 600,50/);
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

test('lançamentos: lista com filtro de onde/ano, busca e CSV', async () => {
  const { doc, w } = await montar({}, '#lancamentos');
  clique(w, doc.querySelector('[data-lista-filtro="proventos"]'));
  assert.equal(doc.querySelectorAll('.tx-tabela-lista tbody tr').length, 1);
  clique(w, doc.querySelector('[data-lista-filtro="todos"]'));
  digitar(w, doc.getElementById('txListaAno'), '2025', 'change');
  assert.equal(doc.querySelectorAll('.tx-tabela-lista tbody tr').length, 1);
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

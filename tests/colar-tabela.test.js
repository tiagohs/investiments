// tests/colar-tabela.test.js - 07/10/2026: "Colar uma tabela" na tela Transações › Lançamentos, num DOM de verdade (JSDOM).
// Colar -> revisão com N itens (mesma conferência da importação de arquivo) -> lançar chama importar com destino rendaFixa e os campos
// certos (origem "Colado"). Dados INVENTADOS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const DADOS = {
  ok: true, hoje: '2026-10-07', cambio: 5,
  classes: {
    acoes: [{ ticker: 'ABCD3', nome: 'Empresa ABCD', moeda: 'BRL', precoAtual: 20, quantidade: 100, totalAtualizado: 2000, peso: 1, ultimoPago: null }],
    fiis: [], acoesEua: [],
    rendaFixa: [
      { titulo: 'Tesouro Selic 2029', instituicao: 'CORRETORA X', categoria: 'Renda Emergencial', destino: 'emergencial', tipo: 'Tesouro Selic (LFT)', indexador: 'SELIC', vencimento: '2029-03-01', valorAtualizado: 1000, ultimoPago: null },
      { titulo: 'Fundo DI Antigo', instituicao: 'CORRETORA Y', categoria: 'Objetivo', destino: 'objetivo', tipo: 'Renda Fixa', indexador: 'CDI', vencimento: '', valorAtualizado: 500, ultimoPago: null },
    ],
  },
  metas: {},
  aportes: [],
  resumo: {},
  lancamentos: [],
};

const TABELA = [
  ['Data', 'Tipo', 'Quantidade', 'Preço', 'Custos Op.', 'Valor total', 'Origem'],
  ['05/10/2026', 'Compra', '100,50000000', 'R$ 2,00000000', 'R$ 0,00', 'R$ 201,00', 'Manual'],
  ['01/10/2026', 'Compra', '50,25000000', 'R$ 2,00000000', 'R$ 0,00', 'R$ 100,50', 'Manual'],
  ['20/09/2026', 'Resgate', '5,00000000', 'R$ 2,00000000', 'R$ 0,00', 'R$ 10,00', 'Manual'],
  ['03/10/2026', 'Compra', '10,00000000', 'R$ 2,00000000', 'R$ 0,00', 'R$ 99,00', 'Manual'],
  ['31/02/2026', 'Compra', '1', 'R$ 1,00', 'R$ 0,00', 'R$ 1,00', 'Manual'],
  ['Total', '', '', '', '', 'R$ 410,50', ''],
].map((l) => l.join('\t')).join('\n');

function montarDom() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="transacoes">
    <div id="refreshControlTransacoes"></div>
    <div id="transacoesLoading"></div><div id="transacoesErro" hidden></div><div id="transacoesConteudo" hidden></div></body></html>`, { url: 'https://exemplo.test/transacoes/index.html#lancamentos', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.localStorage = w.localStorage;
  w.localStorage.clear();
  return { dom, doc: w.document, w };
}
const clique = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const digitar = (w, el, valor, tipo = 'input') => { el.value = valor; el.dispatchEvent(new w.Event(tipo, { bubbles: true })); };
const esperar = async (cond, vezes = 30) => { for (let i = 0; i < vezes && !cond(); i += 1) await new Promise((r) => setTimeout(r, 5)); };
const txt = (el) => {
  const partes = [];
  const w = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};

async function montar(importarImpl) {
  const { doc, w } = montarDom();
  const { montarPaginaTransacoes } = await import('../assets/js/pages/transacoes.js');
  await montarPaginaTransacoes('tk', { doc, getTransacoesImpl: async () => structuredClone(DADOS), importarImpl });
  return { doc, w };
}

/** Servidor falso: tudo "novo", menos o que o teste marcar como já lançado; guarda as chamadas. */
function servidor({ lancados = [] } = {}) {
  const chamadas = [];
  const impl = async (t, itens, opcoes) => {
    chamadas.push({ itens: structuredClone(itens), opcoes: { ...opcoes } });
    if (opcoes.simular) return { ok: true, resultado: { itens: itens.map((it) => ({ uid: it.uid, situacao: lancados.includes(it.data) ? 'lancado' : 'novo', motivo: lancados.includes(it.data) ? 'Já está na planilha.' : '' })) } };
    return { ok: true, resultado: { itens: itens.map((it) => ({ uid: it.uid, situacao: 'gravado' })), gravados: { rendaFixa: itens.length }, total: itens.length, lotesRf: itens.filter((i) => i.taxaContratada && i.movimentacao === 'Compra').length,
      titulosRfCriados: itens.some((i) => i.destinoRf) ? [{ titulo: itens[0].produto, instituicao: itens[0].instituicao, destino: itens.find((i) => i.destinoRf).destinoRf, linha: 11 }] : [] } };
  };
  return { chamadas, impl };
}

test('painel: botão "Colar uma tabela" ao lado de importar arquivo abre e fecha o painel com caixa de texto e "Pra onde vai"', async () => {
  const { impl } = servidor();
  const { doc, w } = await montar(impl);
  const botao = doc.querySelector('[data-lanc="colar-abrir"]');
  assert.ok(botao);
  assert.match(botao.textContent, /Colar uma tabela/);
  assert.equal(doc.getElementById('txColarTexto'), null, 'fechado por padrão');
  assert.ok(doc.getElementById('txDrop'), 'importar arquivo continua lá');
  clique(w, botao);
  assert.equal(botao.getAttribute('aria-expanded'), 'true');
  assert.ok(doc.getElementById('txColarTexto'));
  assert.match(txt(doc.querySelector('.tx-colar')), /Cole aqui as linhas \(copie a tabela do site da corretora, do Gorila, do Excel\.\.\.\)/);
  assert.deepEqual([...doc.querySelectorAll('#txColarDestino option')].map((o) => o.value), ['rendaFixa', 'acoes']);
  clique(w, doc.querySelector('[data-lanc="colar-fechar"]'));
  assert.equal(doc.getElementById('txColarTexto'), null);
});

test('colar: prévia das linhas; título NOVO avisa, oferece destino e sugere 100% do CDI; título que existe mostra o destino dele', async () => {
  const { impl } = servidor();
  const { doc, w } = await montar(impl);
  clique(w, doc.querySelector('[data-lanc="colar-abrir"]'));
  digitar(w, doc.getElementById('txColarTexto'), TABELA);
  assert.match(txt(doc.getElementById('txColarPrevia')), /4 linhas reconhecidas · 3 compras e 1 resgate · 1 não entendida/);
  assert.equal(doc.getElementById('txColarNovo').children.length, 0, 'sem título ainda');
  digitar(w, doc.getElementById('txColarTitulo'), 'Fundo DI Chácara');
  const novo = txt(doc.getElementById('txColarNovo'));
  assert.match(novo, /Título novo\. Ele ainda não está em Carteiras › Renda Fixa\. Ao lançar, o site cria o título lá/);
  assert.match(novo, /Fundo DI: cadastre como pós-fixado, 100% do CDI \(aproximação: a taxa de administração e o come-cotas não entram na conta\)/);
  assert.deepEqual([...doc.querySelectorAll('#txColarDestinoRf option')].map((o) => o.textContent), ['Renda Emergencial', 'Renda Fixa de longo prazo', 'Reservado para objetivos']);
  assert.equal(doc.getElementById('txColarTaxa').value, '100% do CDI');
  // título que já existe: mostra o destino cadastrado e puxa a instituição
  digitar(w, doc.getElementById('txColarTitulo'), 'fundo di antigo');
  assert.match(txt(doc.getElementById('txColarNovo')), /Título já cadastrado em Carteiras › Renda Fixa: Reservado para objetivos/);
  assert.equal(doc.getElementById('txColarInst').value, 'CORRETORA Y');
  assert.equal(doc.getElementById('txColarTaxa').value, '', 'a sugestão some quando o título existe');
  assert.ok(!doc.getElementById('txColarDestinoRf'));
});

test('colar -> revisão com N itens -> lançar chama importar com destino rendaFixa, origem Colado e os campos certos (título novo)', async () => {
  const srv = servidor({ lancados: ['2026-09-20'] });
  const { doc, w } = await montar(srv.impl);
  clique(w, doc.querySelector('[data-lanc="colar-abrir"]'));
  digitar(w, doc.getElementById('txColarTexto'), TABELA);
  digitar(w, doc.getElementById('txColarTitulo'), 'Fundo DI Chácara');
  digitar(w, doc.getElementById('txColarInst'), 'CORRETORA Z');
  digitar(w, doc.getElementById('txColarDestinoRf'), 'objetivo', 'change');
  clique(w, doc.querySelector('[data-lanc="colar-conferir"]'));
  await esperar(() => doc.querySelector('.tx-tabela-rev'));
  // nada gravado antes da revisão: só a conferência (simular) com a origem
  assert.equal(srv.chamadas.length, 1);
  assert.equal(srv.chamadas[0].opcoes.simular, true);
  assert.equal(srv.chamadas[0].opcoes.origem, 'Colado');
  assert.equal(srv.chamadas[0].itens.length, 4);
  assert.equal(doc.getElementById('txColarTexto'), null, 'o painel fecha');
  const rev = doc.querySelector('.tx-revisao');
  assert.match(txt(rev.querySelector('.tx-arqs')), /Fundo DI Chácara Tabela colada · 4 linhas/);
  assert.match(txt(rev.querySelector('.tx-rev-chips')), /3 novos 1 já lançados/);
  assert.match(txt(rev.querySelector('.tx-rev-grupo-cab')), /Renda Fixa 3 novos · 4 na tabela/);
  assert.equal(doc.querySelectorAll('.tx-tabela-rev tbody tr').length, 3, 'o já lançado fica escondido');
  assert.match(txt(doc.querySelector('.tx-tabela-rev')), /Quantidade × preço dá 20,00, mas o valor total é 99,00/, 'divergência vira aviso da linha');
  assert.match(txt(rev.querySelector('.tx-ignorados')), /1 linha da tabela não vira lançamento/);
  assert.match(txt(rev.querySelector('.tx-ignorados')), /Linha 6 .*data.*válida/i);
  assert.match(txt(rev.querySelector('.tx-tabela-rev')), /Compra/);
  // desmarca a de divergência e lança
  const cbs = [...doc.querySelectorAll('.tx-tabela-rev [data-marcar]')];
  assert.equal(cbs.length, 3);
  assert.ok(cbs.every((c) => c.checked));
  const divergente = doc.querySelector('.tx-tabela-rev .tx-aviso-linha').closest('tr').querySelector('[data-marcar]');
  divergente.checked = false;
  divergente.dispatchEvent(new w.Event('change', { bubbles: true }));
  const botaoLancar = doc.querySelector('[data-lanc="gravar"]');
  assert.match(botaoLancar.textContent, /Lançar 2 na planilha/);
  clique(w, botaoLancar);
  await esperar(() => srv.chamadas.length >= 2);
  await esperar(() => /Lançado/.test(doc.querySelector('.tx-revisao').textContent));
  const g = srv.chamadas[1];
  assert.equal(g.opcoes.simular, false);
  assert.equal(g.opcoes.origem, 'Colado');
  assert.deepEqual(g.itens.map((i) => [i.destino, i.produto, i.instituicao, i.data, i.movimentacao, i.entradaSaida, i.qtd, i.preco, i.valor, i.taxaContratada, i.destinoRf, i.forcar]), [
    ['rendaFixa', 'Fundo DI Chácara', 'CORRETORA Z', '2026-10-05', 'Compra', 'Credito', 100.5, 2, 201, '100% do CDI', 'objetivo', false],
    ['rendaFixa', 'Fundo DI Chácara', 'CORRETORA Z', '2026-10-01', 'Compra', 'Credito', 50.25, 2, 100.5, '100% do CDI', 'objetivo', false],
  ]);
  assert.match(txt(doc.querySelector('.tx-revisao')), /Lançado: 2 em Transações Renda Fixa/);
  assert.match(txt(doc.querySelector('.tx-revisao')), /Título criado em Carteiras › Renda Fixa: Fundo DI Chácara \(Reservado para objetivos\)/);
});

test('colar com título que já existe: usa o nome cadastrado, não manda destinoRf nem cria nada; sem tabela ou sem título mostra o erro', async () => {
  const srv = servidor();
  const { doc, w } = await montar(srv.impl);
  clique(w, doc.querySelector('[data-lanc="colar-abrir"]'));
  clique(w, doc.querySelector('[data-lanc="colar-conferir"]'));
  assert.match(txt(doc.querySelector('.tx-colar .tx-aviso.erro')), /Cole as linhas da tabela primeiro/);
  digitar(w, doc.getElementById('txColarTexto'), '05/10/2026\tCompra\t10\tR$ 2,00\tR$ 0,00\tR$ 20,00\tManual');
  clique(w, doc.querySelector('[data-lanc="colar-conferir"]'));
  assert.match(txt(doc.querySelector('.tx-colar .tx-aviso.erro')), /Informe o título ou fundo/);
  assert.equal(srv.chamadas.length, 0, 'nada vai ao servidor sem título');
  digitar(w, doc.getElementById('txColarTitulo'), 'FUNDO DI ANTIGO');
  clique(w, doc.querySelector('[data-lanc="colar-conferir"]'));
  await esperar(() => doc.querySelector('.tx-tabela-rev'));
  assert.equal(srv.chamadas.length, 1);
  const it = srv.chamadas[0].itens[0];
  assert.deepEqual([it.produto, it.instituicao, it.destinoRf, it.taxaContratada], ['Fundo DI Antigo', 'CORRETORA Y', undefined, undefined]);
  // descartar a revisão limpa o texto colado
  clique(w, doc.querySelector('[data-lanc="descartar"]'));
  await esperar(() => doc.querySelector('.dialogo'));
  const confirma = doc.querySelector('.dialogo [data-acao="confirmar"]');
  if (confirma) clique(w, confirma);
  await esperar(() => !doc.querySelector('.tx-revisao'));
  clique(w, doc.querySelector('[data-lanc="colar-abrir"]'));
  assert.equal(doc.getElementById('txColarTexto').value, '');
});

test('colar para Ações e FIIs: tabela com ticker vira itens de transações; a sugestão do destino aparece sozinha', async () => {
  const srv = servidor();
  const { doc, w } = await montar(srv.impl);
  clique(w, doc.querySelector('[data-lanc="colar-abrir"]'));
  digitar(w, doc.getElementById('txColarTexto'), ['Data\tTicker\tTipo\tQuantidade\tPreço\tCustos\tValor total', '05/10/2026\tabcd3\tCompra\t10\tR$ 20,00\tR$ 1,00\tR$ 201,00'].join('\n'));
  assert.equal(doc.getElementById('txColarDestino').value, 'acoes', 'a coluna de ticker troca o destino sozinha');
  assert.ok(!doc.getElementById('txColarTitulo'));
  clique(w, doc.querySelector('[data-lanc="colar-conferir"]'));
  await esperar(() => srv.chamadas.length >= 1);
  assert.deepEqual(srv.chamadas[0].itens.map((i) => [i.destino, i.ticker, i.tipo, i.qtd, i.preco, i.taxa]), [['transacoes', 'ABCD3', 'Compra', 10, 20, 1]]);
  assert.equal(srv.chamadas[0].opcoes.origem, 'Colado');
});

test('importar arquivo continua sem origem (só simular) e o painel colar não interfere', async () => {
  const srv = servidor();
  const { doc, w } = await montar(srv.impl);
  const csv = ['Statement,Header,Nome do campo,Valor do campo',
    'Operações,Header,DataDiscriminator,Categoria de ativos,Moeda,Símbolo,Data/hora,Quantidade,Preço Neg.,Preço Fch.,Rendimentos,Corr/Taxa,Base,P&L realizados,P&L MTM,Código',
    'Operações,Data,Order,Ações,USD,AAA,"2026-09-20, 10:00:00",2,11,11,-22,-0.2,22.2,0,0,O'].join('\n');
  const ev = new w.Event('drop', { bubbles: true, cancelable: true });
  ev.dataTransfer = { files: [new w.File([csv], 'extrato.csv', { type: 'text/csv' })] };
  doc.getElementById('txDrop').dispatchEvent(ev);
  await esperar(() => doc.querySelector('.tx-tabela-rev'));
  assert.deepEqual(srv.chamadas[0].opcoes, { simular: true });
  assert.match(txt(doc.querySelector('.tx-rev-grupo-cab')), /1 no arquivo/);
});

// 07/10/2026 (Tiago: lançamento da B3 deixou linha pela metade - a validação da planilha recusou a Movimentação): o que o
// Apps Script recusar volta como 'recusado' com o motivo; a revisão diz o que NÃO entrou em vez de "Lançado" só.
test('lançar: linha recusada pela validação da planilha aparece como "Não lançado" com o motivo, e o resumo conta', async () => {
  const chamadas = [];
  const MOTIVO = '"Juros" não é aceito em "Movimentação" da aba Transações Renda Fixa (a planilha só aceita: Compra, Venda)';
  const impl = async (t, itens, opcoes) => {
    chamadas.push({ itens: structuredClone(itens), opcoes: { ...opcoes } });
    if (opcoes.simular) return { ok: true, resultado: { itens: itens.map((it) => ({ uid: it.uid, situacao: 'novo', motivo: '' })) } };
    const [primeiro, ...resto] = itens;
    return { ok: true, resultado: {
      itens: [{ uid: primeiro.uid, situacao: 'recusado', motivo: MOTIVO }, ...resto.map((it) => ({ uid: it.uid, situacao: 'gravado' }))],
      gravados: { rendaFixa: resto.length }, total: resto.length, lotesRf: 0, titulosRfCriados: [],
      recusadas: [{ destino: 'rendaFixa', ativo: primeiro.produto, data: primeiro.data, motivo: MOTIVO }],
    } };
  };
  const { doc, w } = await montar(impl);
  clique(w, doc.querySelector('[data-lanc="colar-abrir"]'));
  digitar(w, doc.getElementById('txColarTexto'), TABELA);
  digitar(w, doc.getElementById('txColarTitulo'), 'Fundo DI Teste');
  digitar(w, doc.getElementById('txColarInst'), 'CORRETORA Z');
  digitar(w, doc.getElementById('txColarDestinoRf'), 'objetivo', 'change');
  clique(w, doc.querySelector('[data-lanc="colar-conferir"]'));
  await esperar(() => doc.querySelector('.tx-tabela-rev'));
  clique(w, doc.querySelector('[data-lanc="gravar"]'));
  const textoRev = () => (doc.querySelector('.tx-revisao') ? txt(doc.querySelector('.tx-revisao')) : '');
  await esperar(() => chamadas.length >= 2 && /não foi lançada/.test(textoRev()));
  const rev = textoRev();
  assert.match(rev, /1 não foi lançada \(a planilha recusou: "Juros" não é aceito em "Movimentação"/);
  assert.match(rev, /Não lançado/);
});

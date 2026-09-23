// tests/inicio-favoritos.test.js
//
// 23/09/2026 - Favoritos da Início (assets/js/pages/inicio-favoritos.js) e o
// novo layout da Rentabilidade (Total; Longo Prazo | Nacional; Ações
// Internacionais | Renda Emergencial). Dados 100% fictícios (tickers
// inventados) - roda sem fixtures.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  idFavoritoDoAtivo, alternarFavorito, moverFavorito, resolverFavoritos,
} from '../assets/js/pages/inicio-favoritos.js';
import { montarPaginaInicio, criarAtivoCard, renderMeusAtivos } from '../assets/js/pages/inicio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_HTML = fs.readFileSync(path.join(__dirname, '..', 'assets', 'partials', 'pages.html'), 'utf8');

const ATIVOS = [
  { classe: 'acoes', ticker: 'AAAA3', precoAtual: 10, variacaoDia: 0.01 },
  { classe: 'fiis', ticker: 'BBBB11', precoAtual: 100, variacaoDia: -0.002 },
  { classe: 'usa', ticker: 'CCCC', precoAtual: 50, precoAtualBRL: 260, variacaoDia: 0 },
  { classe: 'rf', ticker: 'Tesouro Teste 2030', codigo: 'BRSTNTESTE01', valorAtualizado: 1000, indexador: 'SELIC' },
];

function paginaInicio() {
  const dom = new JSDOM(`<!doctype html><html><body>${PAGES_HTML}</body></html>`, { url: 'https://exemplo.test/' });
  const doc = dom.window.document;
  doc.body.append(doc.getElementById('page-inicio-template').content.cloneNode(true));
  return { dom, doc };
}

function homeFake(favoritos = []) {
  return {
    ok: true,
    patrimonio: { total: 3000, longoPrazo: 2000, nacional: 1500, rendaEmergencial: 1000, porClasse: { acoes: 800, fiis: 700, acoesEua: 500, rendaFixa: 1000 } },
    historico: [
      { data: '2026-08-31', patrimonio: 2900, longoPrazo: 1950, nacional: 1480, rendaEmergencial: 950, acoesEua: 470, sp500: 100, ibovespa: 100, indiceCdi: 100, indiceSelic: 100, pregao: true },
      { data: '2026-09-01', patrimonio: 3000, longoPrazo: 2000, nacional: 1500, rendaEmergencial: 1000, acoesEua: 500, sp500: 101, ibovespa: 99, indiceCdi: 100.05, indiceSelic: 100.05, pregao: true },
    ],
    indices: { ibovespa: { valor: 100, variacaoDia: 0.1 } },
    cambio: { usd: 5.2, eur: 6 },
    ativos: ATIVOS,
    favoritos,
  };
}

async function montar({ favoritos = [], salvarImpl, opcoesFavoritos } = {}) {
  const { dom, doc } = paginaInicio();
  const chamadas = [];
  const salvar = salvarImpl || (async (_t, ids) => { chamadas.push(ids); return { ok: true, favoritos: ids }; });
  await montarPaginaInicio('token-fake', { doc, getHomeImpl: async () => homeFake(favoritos), salvarFavoritosImpl: salvar, opcoesFavoritos });
  const secao = doc.getElementById('favoritosSecao');
  return { dom, doc, secao, ctrl: secao._favoritos, chamadas, grid: doc.getElementById('favoritosGrid'), meus: doc.getElementById('meusAtivosGrid') };
}
const evento = (dom, tipo, extra = {}) => new dom.window.MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0, ...extra });
const tickersNaArea = (grid) => [...grid.querySelectorAll('.ativo-card .ativo-ticker')].map((e) => e.textContent);

// --- funções puras ---
test('favoritos: id "classe:ref" (código do título na Renda Fixa), alternar, mover e resolver na ordem salva', () => {
  assert.equal(idFavoritoDoAtivo(ATIVOS[0]), 'acoes:AAAA3');
  assert.equal(idFavoritoDoAtivo(ATIVOS[3]), 'rf:BRSTNTESTE01');
  assert.deepEqual(alternarFavorito(['a:1'], 'b:2'), ['a:1', 'b:2']);
  assert.deepEqual(alternarFavorito(['a:1', 'b:2'], 'a:1'), ['b:2']);
  assert.deepEqual(moverFavorito(['a', 'b', 'c'], 'a', 2), ['b', 'c', 'a']);
  assert.deepEqual(moverFavorito(['a', 'b', 'c'], 'c', -5), ['c', 'a', 'b']);
  assert.deepEqual(moverFavorito(['a', 'b'], 'x', 0), ['a', 'b']);
  // id sem ativo (vendido) some da tela mas a ordem dos outros se mantém
  assert.deepEqual(resolverFavoritos(['usa:CCCC', 'acoes:VENDIDO3', 'acoes:AAAA3'], ATIVOS).map((a) => a.ticker), ['CCCC', 'AAAA3']);
});

// --- layout ---
test('Início: Favoritos fica logo abaixo de "Índices & câmbio" e acima da Rentabilidade; Rentabilidade = Total, depois Longo Prazo | Nacional, depois Ações Internacionais | Renda Emergencial', () => {
  const { doc } = paginaInicio();
  const ordem = [...doc.querySelectorAll('#indicesCambioGrid, #favoritosSecao, #resumoPatrimonio, #periodoTabs')].map((e) => e.id);
  assert.deepEqual(ordem, ['indicesCambioGrid', 'favoritosSecao', 'resumoPatrimonio', 'periodoTabs']);
  const cards = [...doc.querySelectorAll('.rentab-grid > .rentab-card')];
  assert.deepEqual(cards.map((c) => c.querySelector('.rentab-card-info').id), ['rentabInfoTotal', 'rentabInfoLongoPrazo', 'rentabInfoNacional', 'rentabInfoInternacional', 'rentabInfoRendaEmergencial']);
  assert.deepEqual(cards.map((c) => c.classList.contains('rentab-card-full')), [true, false, false, false, false], 'só o Total ocupa a linha inteira; os outros 4 ficam 2 a 2');
});

test('Início: painel "Ações Internacionais" desenha com valor = Ações EUA em reais e legenda S&P 500 + Ibovespa', async () => {
  const { doc } = await montar();
  const info = doc.getElementById('rentabInfoInternacional');
  assert.match(info.textContent, /Ações Internacionais/);
  assert.match(info.querySelector('.rentab-card-value').textContent.replace(/\s/g, ''), /R\$500,00/);
  assert.match(info.querySelector('.rentab-card-delta').textContent, /\+R\$\s*30,00\s+\+6,38% no período/);
  assert.ok(doc.getElementById('rentabChartInternacional').querySelector('svg'));
  const legenda = doc.getElementById('rentabLegendaInternacional').textContent;
  assert.match(legenda, /S&P 500/);
  assert.match(legenda, /Ibovespa/);
});

// --- estrela ---
test('Meus ativos: estrela em todo card; clicar favorita sem navegar, aparece na área, salva a lista; clicar de novo desfavorita', async () => {
  const { dom, doc, grid, meus, chamadas, ctrl } = await montar();
  assert.equal(meus.querySelectorAll('.ativo-card .ativo-fav-btn').length, ATIVOS.length);
  assert.equal(doc.getElementById('favoritosSecao').hidden, false);
  assert.match(grid.textContent, /Toque na estrela/);

  const estrela = meus.querySelector('.ativo-fav-btn[data-fav-id="fiis:BBBB11"]');
  const ev = evento(dom, 'click');
  estrela.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true, 'a estrela fica dentro do <a> do card - não pode navegar');
  await ctrl.aguardarGravacoes();
  assert.deepEqual(chamadas, [['fiis:BBBB11']]);
  assert.deepEqual(tickersNaArea(grid), ['BBBB11']);
  assert.equal(meus.querySelector('.ativo-fav-btn[data-fav-id="fiis:BBBB11"]').getAttribute('aria-pressed'), 'true');

  // desfavoritar pela estrela do card da própria área
  grid.querySelector('.ativo-fav-btn').dispatchEvent(evento(dom, 'click'));
  await ctrl.aguardarGravacoes();
  assert.deepEqual(chamadas[1], []);
  assert.equal(tickersNaArea(grid).length, 0);
  assert.equal(meus.querySelector('.ativo-fav-btn[data-fav-id="fiis:BBBB11"]').getAttribute('aria-pressed'), 'false');
});

test('Meus ativos: trocar a aba de classe mantém a estrela acesa dos favoritos', async () => {
  const { dom, doc, meus } = await montar({ favoritos: ['fiis:BBBB11'] });
  doc.querySelector('#filtroAtivosTabs .filter-tab[data-classe="fiis"]').dispatchEvent(evento(dom, 'click'));
  assert.equal(meus.querySelectorAll('.ativo-card').length, 1);
  assert.equal(meus.querySelector('.ativo-fav-btn').getAttribute('aria-pressed'), 'true');
});

test('Favoritos: a lista salva vem da Início, na ordem salva; favorito de ativo vendido não aparece', async () => {
  const { grid } = await montar({ favoritos: ['usa:CCCC', 'acoes:VENDIDO3', 'rf:BRSTNTESTE01', 'acoes:AAAA3'] });
  assert.deepEqual(tickersNaArea(grid), ['CCCC', 'Tesouro Teste 2030', 'AAAA3']);
});

// --- edição / arrastar ---
test('Favoritos: fora do modo edição o card é link (nada arrastável); o lápis só aparece com 2+ favoritos', async () => {
  const um = await montar({ favoritos: ['acoes:AAAA3'] });
  assert.equal(um.doc.getElementById('favoritosEditar').hidden, true);

  const { dom, doc, grid } = await montar({ favoritos: ['acoes:AAAA3', 'fiis:BBBB11'] });
  const botao = doc.getElementById('favoritosEditar');
  assert.equal(botao.hidden, false);
  assert.match(botao.textContent, /Editar/);
  const clique = evento(dom, 'click');
  grid.querySelector('.ativo-card').dispatchEvent(clique);
  assert.equal(clique.defaultPrevented, false, 'fora da edição, clicar no card navega normalmente');
  // arrastar fora do modo edição não muda nada
  const [a, b] = grid.querySelectorAll('.ativo-card');
  a.dispatchEvent(evento(dom, 'pointerdown', { clientX: 0, clientY: 0 }));
  grid.dispatchEvent(evento(dom, 'pointermove', { clientX: 200, clientY: 0 }));
  grid.dispatchEvent(evento(dom, 'pointerup', { clientX: 200, clientY: 0 }));
  assert.deepEqual(tickersNaArea(grid), ['AAAA3', 'BBBB11']);
  assert.equal(grid.classList.contains('editando'), false);
});

test('Favoritos: Editar -> arrastar muda a ordem na hora -> Concluir salva a ordem nova (uma gravação só)', async () => {
  // JSDOM não tem layout: o "card debaixo do dedo" vem de um stub
  let alvo = null;
  const { dom, doc, grid, chamadas, ctrl } = await montar({
    favoritos: ['acoes:AAAA3', 'fiis:BBBB11', 'usa:CCCC'],
    opcoesFavoritos: { acharCardNoPonto: () => alvo },
  });
  doc.getElementById('favoritosEditar').dispatchEvent(evento(dom, 'click'));
  assert.equal(grid.classList.contains('editando'), true);
  assert.equal(doc.getElementById('favoritosDica').hidden, false);

  // no modo edição, clicar no card NÃO navega
  const clique = evento(dom, 'click');
  grid.querySelector('.ativo-card').dispatchEvent(clique);
  assert.equal(clique.defaultPrevented, true);

  // arrasta AAAA3 até o CCCC (3º) -> vai pro fim
  const cards = [...grid.querySelectorAll('.ativo-card')];
  cards[0].dispatchEvent(evento(dom, 'pointerdown', { clientX: 10, clientY: 10 }));
  alvo = cards[2];
  grid.dispatchEvent(evento(dom, 'pointermove', { clientX: 300, clientY: 10 }));
  assert.ok(cards[0].classList.contains('arrastando'));
  assert.deepEqual(tickersNaArea(grid), ['BBBB11', 'CCCC', 'AAAA3'], 'a ordem muda enquanto arrasta');
  // e volta pra frente do BBBB11
  alvo = grid.querySelectorAll('.ativo-card')[0];
  grid.dispatchEvent(evento(dom, 'pointermove', { clientX: 5, clientY: 10 }));
  assert.deepEqual(tickersNaArea(grid), ['AAAA3', 'BBBB11', 'CCCC']);
  alvo = grid.querySelectorAll('.ativo-card')[1];
  grid.dispatchEvent(evento(dom, 'pointermove', { clientX: 150, clientY: 10 }));
  grid.dispatchEvent(evento(dom, 'pointerup', { clientX: 150, clientY: 10 }));
  assert.deepEqual(ctrl.ids, ['fiis:BBBB11', 'acoes:AAAA3', 'usa:CCCC']);
  assert.equal(chamadas.length, 0, 'só grava no Concluir');

  doc.getElementById('favoritosEditar').dispatchEvent(evento(dom, 'click'));
  await ctrl.aguardarGravacoes();
  assert.deepEqual(chamadas, [['fiis:BBBB11', 'acoes:AAAA3', 'usa:CCCC']]);
  assert.equal(grid.classList.contains('editando'), false);
});

test('Favoritos: arraste cancelado pelo sistema (pointercancel) devolve a ordem de antes', async () => {
  let alvo = null;
  const { dom, grid, ctrl } = await montar({ favoritos: ['acoes:AAAA3', 'fiis:BBBB11'], opcoesFavoritos: { acharCardNoPonto: () => alvo } });
  ctrl.entrarEdicao();
  const cards = [...grid.querySelectorAll('.ativo-card')];
  cards[0].dispatchEvent(evento(dom, 'pointerdown', { clientX: 0, clientY: 0 }));
  alvo = cards[1];
  grid.dispatchEvent(evento(dom, 'pointermove', { clientX: 200, clientY: 0 }));
  grid.dispatchEvent(evento(dom, 'pointercancel', {}));
  assert.deepEqual(ctrl.ids, ['acoes:AAAA3', 'fiis:BBBB11']);
  assert.deepEqual(tickersNaArea(grid), ['AAAA3', 'BBBB11']);
});

test('Favoritos: no modo edição as setas do teclado movem o card focado; Esc desfaz tudo', async () => {
  const { dom, grid, ctrl, chamadas } = await montar({ favoritos: ['acoes:AAAA3', 'fiis:BBBB11', 'usa:CCCC'] });
  ctrl.entrarEdicao();
  grid.querySelector('.ativo-card').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  assert.deepEqual(ctrl.ids, ['fiis:BBBB11', 'acoes:AAAA3', 'usa:CCCC']);
  grid.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.deepEqual(ctrl.ids, ['acoes:AAAA3', 'fiis:BBBB11', 'usa:CCCC']);
  assert.equal(ctrl.editando, false);
  assert.equal(chamadas.length, 0);
});

test('Favoritos: Concluir sem mudar a ordem não grava nada', async () => {
  const { doc, dom, chamadas, ctrl } = await montar({ favoritos: ['acoes:AAAA3', 'fiis:BBBB11'] });
  const botao = doc.getElementById('favoritosEditar');
  botao.dispatchEvent(evento(dom, 'click'));
  assert.match(botao.textContent, /Concluir/);
  botao.dispatchEvent(evento(dom, 'click'));
  await ctrl.aguardarGravacoes();
  assert.equal(chamadas.length, 0);
});

test('Favoritos: se a gravação falhar, volta pro último estado salvo e avisa', async () => {
  const { dom, doc, meus, grid, ctrl } = await montar({
    favoritos: ['acoes:AAAA3'],
    salvarImpl: async () => ({ ok: false, erro: 'planilha fora do ar' }),
  });
  meus.querySelector('.ativo-fav-btn[data-fav-id="usa:CCCC"]').dispatchEvent(evento(dom, 'click'));
  assert.deepEqual(tickersNaArea(grid), ['AAAA3', 'CCCC'], 'muda na hora (otimista)');
  await ctrl.aguardarGravacoes();
  assert.deepEqual(tickersNaArea(grid), ['AAAA3']);
  assert.equal(meus.querySelector('.ativo-fav-btn[data-fav-id="usa:CCCC"]').getAttribute('aria-pressed'), 'false');
  assert.match(doc.getElementById('favoritosStatus').textContent, /Não deu pra salvar.*planilha fora do ar/);
});

test('Favoritos: recarregar os dados da Início (a cada 5 min) não atropela uma edição aberta', async () => {
  const { grid, ctrl } = await montar({ favoritos: ['acoes:AAAA3', 'fiis:BBBB11'] });
  ctrl.entrarEdicao();
  ctrl.atualizar({ ativos: ATIVOS, favoritos: ['usa:CCCC'] });
  assert.deepEqual(tickersNaArea(grid), ['AAAA3', 'BBBB11']);
  await ctrl.sairEdicao();
  ctrl.atualizar({ ativos: ATIVOS, favoritos: ['usa:CCCC'] });
  assert.deepEqual(tickersNaArea(grid), ['CCCC']);
});

test('criarAtivoCard: estrela com rótulo acessível e estado', () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  const doc = dom.window.document;
  const apagada = criarAtivoCard(doc, ATIVOS[0]).querySelector('.ativo-fav-btn');
  assert.equal(apagada.getAttribute('aria-label'), 'Adicionar aos favoritos');
  assert.equal(apagada.getAttribute('role'), 'button');
  const acesa = criarAtivoCard(doc, ATIVOS[0], { favorito: true }).querySelector('.ativo-fav-btn');
  assert.equal(acesa.getAttribute('aria-pressed'), 'true');
  assert.equal(acesa.getAttribute('aria-label'), 'Remover dos favoritos');
  const grid = doc.createElement('div');
  grid._favoritosIds = new Set(['acoes:AAAA3']);
  renderMeusAtivos(doc, grid, ATIVOS, 'todos');
  assert.deepEqual([...grid.querySelectorAll('.ativo-fav-btn')].map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false', 'false']);
});

test('Favoritos: estrela pelo teclado (Enter/Espaço) favorita; Tab passa direto sem ser bloqueado', async () => {
  const { dom, meus, ctrl } = await montar();
  const estrela = meus.querySelector('.ativo-fav-btn[data-fav-id="acoes:AAAA3"]');
  const tab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  estrela.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false);
  assert.deepEqual(ctrl.ids, []);
  estrela.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.deepEqual(ctrl.ids, ['acoes:AAAA3']);
  await ctrl.aguardarGravacoes();
});

test('Favoritos: no modo edição o card não pode ser arrastado como LINK pelo navegador (senão o arraste nativo cancela o nosso)', async () => {
  const { dom, grid, ctrl } = await montar({ favoritos: ['acoes:AAAA3', 'fiis:BBBB11'] });
  ctrl.entrarEdicao();
  const card = grid.querySelector('.ativo-card');
  assert.equal(card.getAttribute('draggable'), 'false');
  const ds = new dom.window.Event('dragstart', { bubbles: true, cancelable: true });
  card.dispatchEvent(ds);
  assert.equal(ds.defaultPrevented, true);
  await ctrl.sairEdicao();
  assert.equal(grid.querySelector('.ativo-card').getAttribute('draggable'), null, 'fora da edição o card volta a ser um link normal');
});

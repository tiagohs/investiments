// tests/carrinho-header.test.js
//
// 05/10/2026: carrinho em andamento no header de todas as telas (ícone +
// contagem, popover com os itens e o botão "Ir para Transações") e o aviso
// "Você comprou?" quando o carrinho passou do dia/horário do pregão. Usa o
// shell.html de verdade num DOM (JSDOM). Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { parseShellPartial, injectShell } from '../assets/js/shell.js';
import { setupCarrinhoHeader } from '../assets/js/carrinho-header.js';

const HTML = fs.readFileSync(new URL('../assets/partials/shell.html', import.meta.url), 'utf8');
const brt = (s) => new Date(`${s.replace(' ', 'T')}:00-03:00`);
// texto como a gente lê: um espaço entre elementos
const txt = (el) => {
  const partes = [];
  const w = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t) partes.push(t); }
  return partes.join(' ');
};

const CARRINHO = {
  editandoId: null, data: '2026-10-05', observacao: '', cambio: 5,
  itens: {
    'acoes:ABCD3': { classe: 'acoes', ativo: 'ABCD3', moeda: 'BRL', qtd: 10, preco: 20 },
    'acoesEua:AAA': { classe: 'acoesEua', ativo: 'AAA', moeda: 'USD', qtd: 2, preco: 10 },
    'rendaFixa:Tesouro Selic 2029|XP': { classe: 'rendaFixa', ativo: 'Tesouro Selic 2029', instituicao: 'XP', moeda: 'BRL', valor: 399.6, qtd: 0.02, pu: 19980 },
  },
};

function montar({ carrinho = CARRINHO, agora = brt('2026-10-05 11:00'), secao = 'inicio' } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body data-section="${secao}"><div id="shell-header"></div><div id="shell-footer"></div></body></html>`, { url: 'https://exemplo.test/', pretendToBeVisual: true });
  const w = dom.window;
  const doc = w.document;
  injectShell(doc, parseShellPartial(HTML, doc));
  doc.querySelectorAll('#mainnav .nav-link').forEach((a) => a.setAttribute('href', `https://exemplo.test/${a.getAttribute('href')}`));
  const guardado = {};
  if (carrinho) guardado['transacoes.carrinho.v1'] = JSON.stringify(carrinho);
  const storage = { getItem: (k) => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); }, removeItem: (k) => { delete guardado[k]; } };
  const navegou = [];
  const eventos = [];
  const win = {
    addEventListener: (...a) => w.addEventListener(...a), dispatchEvent: (e) => { eventos.push(e.type + (e.detail && e.detail.origem ? `:${e.detail.origem}` : '')); return w.dispatchEvent(e); },
    CustomEvent: w.CustomEvent, location: { set href(v) { navegou.push(v); }, get href() { return ''; } },
  };
  let relogio = agora;
  const h = setupCarrinhoHeader(doc, { win, agora: () => relogio, storage, setIntervalImpl: null });
  return { doc, w, h, guardado, navegou, eventos, mudarHora: (d) => { relogio = d; h.atualizar(); } };
}

test('carrinho no header: ícone com a contagem, valor (dólar pelo câmbio guardado) e popover com os itens e o botão pra Transações', () => {
  const { doc } = montar();
  const wrap = doc.getElementById('carrinhoWrap');
  assert.equal(wrap.hidden, false);
  assert.equal(doc.getElementById('carrinhoBadge').textContent, '3');
  assert.match(doc.getElementById('carrinhoTotal').textContent.replace(/ /g, ' '), /R\$ 699,60/, '200 + 2 × US$ 10 × 5 + 399,60');
  const painel = txt(doc.getElementById('carrinhoPanelConteudo')).replace(/ /g, ' ');
  assert.match(painel, /ABCD3 10 × R\$ 20,00 · Ações R\$ 200,00/);
  assert.match(painel, /AAA 2 × US\$ 10,00 · Ações EUA US\$ 20,00 ≈ R\$ 100,00/);
  assert.match(painel, /Tesouro Selic 2029 0,02 título × R\$ 19\.980,00 · Renda Fixa R\$ 399,60/);
  assert.match(painel, /Total estimado R\$ 699,60/);
  const ir = doc.querySelector('#carrinhoPanelConteudo a.carrinho-ir');
  assert.equal(ir.textContent, 'Ir para Transações');
  assert.equal(ir.getAttribute('href'), 'https://exemplo.test/transacoes/index.html#carrinho');
  assert.equal(doc.getElementById('carrinhoAviso').hidden, true, 'carrinho do dia, antes do pregão fechar: sem aviso');
  assert.equal(doc.getElementById('carrinhoBtn').getAttribute('data-toggle-panel'), 'carrinhoPanel', 'abre pelo mesmo mecanismo do popover de sincronização');
});

test('carrinho no header: sem carrinho (ou vazio) o ícone some', () => {
  assert.equal(montar({ carrinho: null }).doc.getElementById('carrinhoWrap').hidden, true);
  assert.equal(montar({ carrinho: { ...CARRINHO, itens: {} } }).doc.getElementById('carrinhoWrap').hidden, true);
});

test('carrinho no header: o aviso aparece quando o relógio passa do fechamento da B3/EUA (17h no horário de verão americano)', () => {
  const semTesouro = { ...CARRINHO, itens: { 'acoes:ABCD3': CARRINHO.itens['acoes:ABCD3'], 'acoesEua:AAA': CARRINHO.itens['acoesEua:AAA'] } };
  const t = montar({ carrinho: semTesouro, agora: brt('2026-10-05 16:59') });
  assert.equal(t.doc.getElementById('carrinhoAviso').hidden, true);
  t.mudarHora(brt('2026-10-05 17:00'));
  assert.equal(t.doc.getElementById('carrinhoAviso').hidden, false);
  assert.match(txt(t.doc.getElementById('carrinhoAviso')), /O horário de compra de hoje \(a B3 e a bolsa dos EUA\) terminou às 17h \(Brasília\)/);
});

test('"Você comprou?": Tesouro no carrinho segura o aviso até as 18h; depois pergunta', () => {
  const t = montar({ agora: brt('2026-10-05 17:30') });
  assert.equal(t.doc.getElementById('carrinhoAviso').hidden, true, 'ainda dá pra comprar o Tesouro');
  t.mudarHora(brt('2026-10-05 18:01'));
  const aviso = t.doc.getElementById('carrinhoAviso');
  assert.equal(aviso.hidden, false);
  assert.match(txt(aviso).replace(/ /g, ' '), /Você comprou\? Seu carrinho \(3 itens · R\$ 699,60\) ficou aberto\. O horário de compra de hoje \(o Tesouro Direto\) terminou às 18h \(Brasília\)/);
  assert.ok(t.doc.getElementById('carrinhoWrap').classList.contains('pendente'));
});

test('"Você comprou?" - Não: descarta o carrinho e avisa as telas', () => {
  const t = montar({ carrinho: { ...CARRINHO, data: '2026-10-03' }, agora: brt('2026-10-05 09:00') });
  const aviso = t.doc.getElementById('carrinhoAviso');
  assert.equal(aviso.hidden, false);
  assert.match(txt(aviso), /Esse carrinho é de 03\/10 e o dia já passou/);
  aviso.querySelector('[data-carrinho-resp="nao"]').click();
  assert.equal(t.guardado['transacoes.carrinho.v1'], undefined);
  assert.equal(t.doc.getElementById('carrinhoWrap').hidden, true);
  assert.equal(aviso.hidden, true);
  assert.ok(t.eventos.includes('carrinho:mudou:header'));
  assert.deepEqual(t.navegou, []);
});

test('"Você comprou?" - Sim: leva pra Transações (#carrinho) pra confirmar e não pergunta de novo hoje', () => {
  const t = montar({ carrinho: { ...CARRINHO, data: '2026-10-03' }, agora: brt('2026-10-05 09:00') });
  t.doc.querySelector('[data-carrinho-resp="sim"]').click();
  assert.deepEqual(t.navegou, ['https://exemplo.test/transacoes/index.html#carrinho']);
  const guardado = JSON.parse(t.guardado['transacoes.carrinho.v1']);
  assert.equal(guardado.perguntadoEm, '2026-10-05');
  assert.equal(guardado.data, '2026-10-03', 'o carrinho continua com a data da compra');
  assert.equal(t.doc.getElementById('carrinhoAviso').hidden, true, 'não repete a pergunta');
  assert.equal(t.doc.getElementById('carrinhoWrap').hidden, false, 'e o carrinho segue visível, em âmbar');
  assert.ok(t.doc.getElementById('carrinhoWrap').classList.contains('pendente'));
  assert.match(txt(t.doc.getElementById('carrinhoPanelConteudo')), /aguardando você confirmar/);
  t.mudarHora(brt('2026-10-06 09:00'));
  assert.equal(t.doc.getElementById('carrinhoAviso').hidden, false, 'no dia seguinte pergunta outra vez');
});

test('na própria tela Transações o botão abre o carrinho dela (não navega)', () => {
  const t = montar({ secao: 'transacoes' });
  const abrir = t.doc.querySelector('#carrinhoPanelConteudo [data-carrinho-abrir]');
  assert.ok(abrir, 'botão "Abrir o carrinho" no lugar do link');
  assert.equal(t.doc.querySelector('#carrinhoPanelConteudo a.carrinho-ir'), null);
  abrir.click();
  assert.ok(t.eventos.includes('carrinho:abrir'));
  assert.deepEqual(t.navegou, []);
});

// assets/js/carrinho-header.js
//
// 05/10/2026: carrinho em andamento no header de TODAS as telas (Tiago: "ao
// mudar de tela, mostrar no header que há um carrinho em andamento; clicar
// mostra o conteúdo e um botão pra Transações - inspiração marketplace
// (Americanas/Amazon); cuidar do mobile"):
//  - ícone de carrinho com a contagem de itens (e o valor, em telas largas);
//  - clicar abre um popover (no celular, uma folha presa embaixo) com os itens,
//    o total e o botão "Ir para Transações";
//  - o carrinho vem do localStorage (o mesmo que a aba Aportes grava) e o
//    header se atualiza sozinho (evento carrinho:mudou, outras abas e a cada
//    minuto);
//  - EXPIRAÇÃO: se o dia do carrinho passou, ou o horário em que fecham os
//    mercados dos itens (B3 17h/18h, EUA, Tesouro 18h - ver carrinho-global.js),
//    aparece o aviso "Você comprou?": Sim (vai pra Transações confirmar) / Não
//    (descarta). O "Sim" não repete a pergunta no mesmo dia.

import {
  CHAVE_CARRINHO, EVENTO_CARRINHO, EVENTO_ABRIR_CARRINHO, NOME_CLASSE_CARRINHO,
  lerCarrinhoLocal, carrinhoValido, totaisCarrinho, itensDoCarrinho, situacaoCarrinho, dataBRT, horaTxt,
} from './carrinho-global.js';
import { formatBRL, formatNumeroBR } from './format.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dma = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}` : '');
const qtdTxt = (q) => formatNumeroBR(q, q % 1 ? 4 : 0);
const precoTxt = (v, moeda) => `${moeda === 'USD' ? 'US$' : 'R$'} ${formatNumeroBR(v)}`;

function detalheItem(it) {
  if (it.classe === 'rendaFixa') {
    return it.qtd > 0 && it.pu > 0
      ? `${formatNumeroBR(it.qtd, 2)} título${it.qtd > 1 ? 's' : ''} × ${formatBRL(it.pu)}`
      : (it.instituicao || 'aplicação');
  }
  return `${qtdTxt(it.qtd)} × ${precoTxt(it.preco, it.moeda)}`;
}

/** HTML do conteúdo do popover. */
export function carrinhoPanelHtml(carrinho, sit, { hoje, hrefTransacoes = '#', naTransacoes = false } = {}) {
  const itens = itensDoCarrinho(carrinho);
  const t = totaisCarrinho(carrinho, carrinho.cambio || 0);
  const semCambio = t.totalUsd > 0 && !(carrinho.cambio > 0);
  const aviso = sit && sit.expirado
    ? `<p class="carrinho-pendente">Carrinho de ${dma(carrinho.data)} <b>aguardando você confirmar</b>: o horário de compra já passou.</p>`
    : (carrinho.editandoId ? '<p class="carrinho-pendente">Você está editando um aporte já confirmado.</p>' : '');
  const linhas = itens.map((it) => `
    <li class="carrinho-item">
      <span class="carrinho-item-nome"><b>${esc(it.ativo)}</b><small>${esc(detalheItem(it))} · ${NOME_CLASSE_CARRINHO[it.classe] || ''}</small></span>
      <span class="carrinho-item-valor">${it.moeda === 'USD' ? `US$ ${formatNumeroBR(it.subtotal)}` : formatBRL(it.subtotal)}${it.moeda === 'USD' && carrinho.cambio > 0 ? `<small>≈ ${formatBRL(it.subtotal * carrinho.cambio)}</small>` : ''}</span>
    </li>`).join('');
  const botao = naTransacoes
    ? '<button type="button" class="btn btn-primary carrinho-ir" data-carrinho-abrir>Abrir o carrinho</button>'
    : `<a class="btn btn-primary carrinho-ir" href="${esc(hrefTransacoes)}">Ir para Transações</a>`;
  return `
    <div class="carrinho-cab"><h3>Carrinho em andamento</h3><small>aporte de ${dma(carrinho.data || hoje)}</small></div>
    ${aviso}
    <ul class="carrinho-itens">${linhas}</ul>
    <div class="carrinho-total"><span>Total${t.totalUsd > 0 ? ' estimado' : ''}</span><b>${formatBRL(t.totalBrl)}</b></div>
    ${semCambio ? '<p class="carrinho-nota">Os itens em dólar ainda não têm cotação aqui: o total real aparece em Transações.</p>' : ''}
    ${botao}`;
}

/** HTML do aviso "Você comprou?". */
export function carrinhoAvisoHtml(carrinho, sit) {
  const t = totaisCarrinho(carrinho, carrinho.cambio || 0);
  const quando = sit.motivo === 'dia'
    ? `Esse carrinho é de <b>${dma(carrinho.data)}</b> e o dia já passou`
    : (sit.mercado === 'o dia'
      ? 'O dia de hoje terminou'
      : `O horário de compra de hoje (${sit.mercado}) terminou às <b>${horaTxt(sit.fechamento)}</b> (Brasília)`);
  return `
    <div class="carrinho-aviso-card">
      <b class="carrinho-aviso-titulo">Você comprou?</b>
      <p>Seu carrinho (${t.n} ite${t.n === 1 ? 'm' : 'ns'} · ${formatBRL(t.totalBrl)}) ficou aberto. ${quando}; como os preços mudam de um dia pro outro, ele não vale mais.</p>
      <div class="carrinho-aviso-botoes">
        <button type="button" class="btn btn-primary" data-carrinho-resp="sim">Sim, comprei — ir confirmar</button>
        <button type="button" class="btn btn-ghost" data-carrinho-resp="nao">Não, descartar</button>
      </div>
    </div>`;
}

/**
 * Liga o ícone, o popover e o aviso (elementos do shell.html). Tudo opcional:
 * se a página não tiver os elementos, não faz nada.
 */
export function setupCarrinhoHeader(doc, {
  win = doc.defaultView, agora = () => new Date(), storage = (typeof globalThis !== 'undefined' ? globalThis.localStorage : null),
  setIntervalImpl = typeof setInterval !== 'undefined' ? setInterval : null,
} = {}) {
  const wrap = doc.getElementById('carrinhoWrap');
  const aviso = doc.getElementById('carrinhoAviso');
  if (!wrap) return null;
  const badge = doc.getElementById('carrinhoBadge');
  const totalEl = doc.getElementById('carrinhoTotal');
  const conteudo = doc.getElementById('carrinhoPanelConteudo');
  const naTransacoes = (doc.body && doc.body.dataset && doc.body.dataset.section) === 'transacoes';

  const hrefTransacoes = () => {
    const a = doc.querySelector('#mainnav .nav-link[data-section="transacoes"]');
    const base = a ? (a.href || a.getAttribute('href') || '') : '';
    return `${String(base).split('#')[0]}#carrinho`;
  };
  const lerCarrinho = () => {
    const bruto = lerCarrinhoLocal(storage);
    return bruto ? carrinhoValido(bruto, dataBRT(agora())) : null;
  };
  const fecharPopovers = () => {
    doc.querySelectorAll('.overlay-panel.open').forEach((p) => p.classList.remove('open'));
    const bd = doc.getElementById('shell-backdrop');
    if (bd) bd.classList.remove('open');
    doc.querySelectorAll('[data-toggle-panel]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  };
  const avisar = () => {
    if (win && typeof win.CustomEvent === 'function' && typeof win.dispatchEvent === 'function') win.dispatchEvent(new win.CustomEvent(EVENTO_CARRINHO, { detail: { origem: 'header' } }));
  };

  function atualizar() {
    const c = lerCarrinho();
    const sit = c ? situacaoCarrinho(c, agora()) : { vazio: true };
    if (!c || sit.vazio) {
      wrap.hidden = true;
      if (aviso) { aviso.hidden = true; aviso.innerHTML = ''; }
      return;
    }
    const t = totaisCarrinho(c, c.cambio || 0);
    wrap.hidden = false;
    wrap.classList.toggle('pendente', !!sit.expirado);
    if (badge) badge.textContent = String(t.n);
    if (totalEl) totalEl.textContent = formatBRL(t.totalBrl);
    const btn = doc.getElementById('carrinhoBtn');
    if (btn) btn.setAttribute('aria-label', `Carrinho em andamento: ${t.n} ite${t.n === 1 ? 'm' : 'ns'}, ${formatBRL(t.totalBrl)}`);
    if (conteudo) conteudo.innerHTML = carrinhoPanelHtml(c, sit, { hoje: dataBRT(agora()), hrefTransacoes: hrefTransacoes(), naTransacoes });
    if (aviso) {
      if (sit.expirado && !sit.perguntado) { aviso.innerHTML = carrinhoAvisoHtml(c, sit); aviso.hidden = false; } else { aviso.hidden = true; aviso.innerHTML = ''; }
    }
  }

  function responder(resp) {
    const c = lerCarrinho();
    if (!c) { atualizar(); return; }
    if (resp === 'nao') {
      try { storage.removeItem(CHAVE_CARRINHO); } catch (e) { /* só conveniência */ }
      avisar();
      atualizar();
      return;
    }
    // "Sim": segue pra Transações pra confirmar (com os preços do dia do carrinho); não pergunta de novo hoje
    try { storage.setItem(CHAVE_CARRINHO, JSON.stringify({ ...c, perguntadoEm: dataBRT(agora()) })); } catch (e) { /* só conveniência */ }
    avisar();
    atualizar();
    if (naTransacoes) { win.dispatchEvent(new win.CustomEvent(EVENTO_ABRIR_CARRINHO)); return; }
    const href = hrefTransacoes();
    if (win && win.location) win.location.href = href;
  }

  if (aviso) {
    aviso.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-carrinho-resp]');
      if (b) responder(b.getAttribute('data-carrinho-resp'));
    });
  }
  if (conteudo) {
    conteudo.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-carrinho-abrir]')) return;
      fecharPopovers();
      win.dispatchEvent(new win.CustomEvent(EVENTO_ABRIR_CARRINHO));
    });
  }
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener(EVENTO_CARRINHO, atualizar);
    win.addEventListener('storage', (ev) => { if (!ev.key || ev.key === CHAVE_CARRINHO) atualizar(); });
    win.addEventListener('focus', atualizar);
  }
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) atualizar(); });
  if (setIntervalImpl) {
    const timer = setIntervalImpl(atualizar, 60000);
    if (timer && typeof timer.unref === 'function') timer.unref(); // não segura o processo em testes
  }
  atualizar();
  return { atualizar, responder };
}

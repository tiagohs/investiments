// assets/js/pages/aportes-historico.js
//
// 06/10/2026: desenho de "Transações > Aportes concluídos" refletindo o "Investido por mês" (Tiago, print 13: só aparecia 1 mês;
// "converter os meses que investi antes do site... cuidado com a visualização (muitos meses): inclua filtros e controle").
// Contas em aportes-historico-calc.js; aqui só HTML e eventos. Controles: período (canônicos de PERIODOS + "Escolher período"),
// classe, origem (site x histórico) e busca por ticker; meses recolhidos com o total no cabeçalho (só o mês atual aberto);
// "Carregar mais" traz um ano por vez. O cartão dos aportes do site vem de aportes.js (`cartaoSite`), com repetir/excluir.

import { formatBRL, formatNumeroBR, formatUSD as usd, formatDM } from '../format.js';
import { esc } from '../util/html.js';
import { logoAtivoHtml, logoRendaFixaHtml } from './carteiras-pecas.js';
import { CLASSES_APORTE, NOME_CLASSE_APORTE, MESES_LONGOS } from './aportes-calc.js';
import { ic, corClasse, estadoVazioHtml, secaoHtml } from './transacoes-ui.js';
import { ligarFiltroPeriodo, botoesSegmentadoHtml, ehPeriodoPersonalizado } from '../periodo-personalizado.js';
import {
  PERIODOS_HISTORICO, estadoInicialHistorico, mesesDoHistorico, paginaPorAno, limitesDoHistorico,
} from './aportes-historico-calc.js';

export { estadoInicialHistorico };

const dotHtml = (classe) => `<span class="tx-dot" style="background:var(${corClasse(classe)})"></span>`;
const qtdTxt = (q) => (typeof q === 'number' && q > 0 ? formatNumeroBR(q, q % 1 ? 4 : 0) : '');

/** Item de uma compra derivada da planilha: logo, ativo, "qtd × preço médio" e o valor (EUA com a conversão). */
function itemHistoricoHtml(it, classe) {
  const rf = classe === 'rendaFixa';
  const logo = rf
    ? logoRendaFixaHtml({ indexador: /selic/i.test(it.ativo) ? 'SELIC' : (/ipca/i.test(it.ativo) ? 'IPCA' : ''), tipoInvestimento: it.ativo, instituicao: it.inst })
    : logoAtivoHtml(it.ativo);
  const eua = classe === 'acoesEua';
  const unit = it.qtd > 0 ? (eua ? it.usd : it.valor) / it.qtd : 0;
  const sub = rf ? esc(it.inst || 'Renda Fixa') : `${qtdTxt(it.qtd)} × ${eua ? usd(unit) : formatBRL(unit)}`;
  const valor = eua ? `${usd(it.usd)}<small class="tx-brl">${formatBRL(it.valor)} <span class="tx-fraco">câmbio do dia</span></small>` : formatBRL(it.valor);
  return `<li>${logo}<span><b>${esc(it.ativo)}</b><small>${sub}</small></span><b class="tx-mono">${valor}</b></li>`;
}

function cartaoHistoricoHtml(c, estado) {
  const id = `h|${c.data}|${c.classe}`;
  const aberto = estado.itensAbertos[id] ? ' open' : '';
  return `
      <details class="tx-hist tx-hist-planilha"${aberto} data-hist-item="${esc(id)}">
        <summary>
          <span class="tx-hist-data"><b>${formatDM(c.data)}</b><small>${c.data.slice(0, 4)}</small></span>
          <span class="tx-hist-info"><span class="tx-classes">${dotHtml(c.classe)}${NOME_CLASSE_APORTE[c.classe]}<span class="chip chip-tonal tx-origem" title="Derivado das abas de transações da planilha">Histórico</span></span><small>${c.itens.length} ativo${c.itens.length > 1 ? 's' : ''}${c.itens.length <= 3 ? ` · ${c.itens.map((i) => esc(i.ativo)).join(', ')}` : ''}</small></span>
          <span class="tx-hist-valor"><b>${formatBRL(c.valor)}</b>${c.classe === 'acoesEua' && c.usd > 0 ? `<small>${usd(c.usd)}</small>` : ''}</span>
          ${ic('expand-more', 'ico tx-sec-seta')}
        </summary>
        <div class="tx-hist-corpo"><ul class="tx-hist-itens">${c.itens.map((it) => itemHistoricoHtml(it, c.classe)).join('')}</ul></div>
      </details>`;
}

function mesHtml(m, estado, cartaoSite, mesAtual) {
  const nome = `${MESES_LONGOS[Number(m.chave.slice(5, 7)) - 1]} <small>${m.ano}</small>`;
  const aberto = estado.busca ? true : (m.chave in estado.mesesAbertos ? estado.mesesAbertos[m.chave] : m.chave === mesAtual);
  const partes = [];
  if (m.nHistorico) partes.push(`${m.nHistorico} dia${m.nHistorico > 1 ? 's' : ''} do histórico`);
  if (m.nSite) partes.push(`${m.nSite} do site`);
  if (m.aguardando > 0) partes.push(`+ ${formatBRL(m.aguardando)} aguardando lançamento`);
  const rotuloTotal = m.filtrado ? 'no filtro' : 'investido';
  return `
    <details class="tx-hist-mes tx-hist-mes-d"${aberto ? ' open' : ''} data-hist-mes="${m.chave}">
      <summary>
        <span class="tx-hist-mes-nome"><h3>${nome}</h3><small>${partes.join(' · ') || 'sem compras'}</small></span>
        <span class="tx-hist-mes-total"><b>${formatBRL(m.total)}</b><small>${rotuloTotal}</small></span>
        ${ic('expand-more', 'ico tx-sec-seta')}
      </summary>
      <div class="tx-hist-mes-corpo">${m.cartoes.map((c) => (c.tipo === 'site' ? cartaoSite(c.aporte) : cartaoHistoricoHtml(c, estado))).join('')}</div>
    </details>`;
}

/** Lista de meses (com "Carregar mais") conforme os filtros do estado; é o que se redesenha ao filtrar. */
export function listaHistoricoHtml(estado, dados, cartaoSite) {
  const h = estado.hist;
  const meses = mesesDoHistorico({ aportes: dados.aportes, historicoPlanilha: dados.historicoPlanilha, resumo: dados.resumo, aConfirmar: dados.aConfirmar, hoje: dados.hoje, cambio: dados.cambio }, h);
  if (!meses.length) {
    return estadoVazioHtml({ icone: 'search', titulo: 'Nada neste filtro', texto: 'Mude o período, a classe, a origem ou a busca para ver compras.' });
  }
  const { visiveis, proximo } = paginaPorAno(meses, h.anos);
  const mesAtual = dados.hoje.slice(0, 7);
  const mais = proximo
    ? `<button type="button" class="btn btn-outlined tx-mais" data-hist-mais>Carregar ${proximo.ano} <small>(${proximo.meses} ${proximo.meses > 1 ? 'meses' : 'mês'} · ${formatBRL(proximo.total)})</small></button>`
    : '';
  return `${visiveis.map((m) => mesHtml(m, h, cartaoSite, mesAtual)).join('')}${mais}`;
}

const SEG_CLASSE = [{ id: 'todas', nome: 'Todas' }, ...CLASSES_APORTE.map((c) => ({ id: c.id, nome: c.nome }))];
const SEG_ORIGEM = [{ id: 'todas', nome: 'Todas' }, { id: 'site', nome: 'Pelo site' }, { id: 'historico', nome: 'Histórico' }];
const chips = (atributo, lista, ativo, rotulo) => `<div class="tx-hist-chips" role="group" aria-label="${rotulo}">${lista.map((o) => `<button type="button" class="chip${o.id === ativo ? ' on' : ''}" aria-pressed="${o.id === ativo}" ${atributo}="${o.id}">${o.id !== 'todas' && atributo === 'data-hist-classe' ? dotHtml(o.id) : ''}${o.nome}</button>`).join('')}</div>`;

/** Seção "Aportes concluídos": cabeçalho recolhível + controles + lista. */
export function historicoHtml(estado, dados, cartaoSite) {
  const h = estado.hist;
  const site = dados.aportes.filter((a) => a.status === 'concluido').length;
  const dias = ((dados.historicoPlanilha || {}).dias || []).length;
  const dica = `${site} pelo site · ${dias} dia${dias === 1 ? '' : 's'} do histórico da planilha`;
  const controles = `
      <div class="tx-hist-filtros">
        <div class="tx-periodo" id="txHistPeriodo">${botoesSegmentadoHtml(PERIODOS_HISTORICO, ehPeriodoPersonalizado(h.periodo) ? null : h.periodo)}</div>
        <div class="tx-hist-linha">
          ${chips('data-hist-classe', SEG_CLASSE, h.classe, 'Classe')}
          ${chips('data-hist-origem', SEG_ORIGEM, h.origem, 'Origem')}
          <input type="search" class="input tx-busca" id="txHistBusca" placeholder="Buscar ticker ou título" value="${esc(h.busca)}" aria-label="Buscar ticker ou título nos aportes concluídos" autocomplete="off">
        </div>
      </div>`;
  const vazio = !site && !dias;
  const corpo = vazio
    ? estadoVazioHtml({ icone: 'savings', titulo: 'Nenhum aporte concluído ainda', texto: 'Eles aparecem aqui depois do passo "Concluir compra", junto com o histórico das suas transações.', acao: { rotulo: 'Montar um aporte', atributos: 'data-rolar="txNovoAporte"' } })
    : `${controles}<div class="tx-hist-lista" id="txHistLista">${listaHistoricoHtml(estado, dados, cartaoSite)}</div>`;
  return secaoHtml({ id: 'txHistorico', chave: 'hist', titulo: 'Aportes concluídos', dica, aberta: estado.secoes.hist, corpo });
}

/** Redesenha só a lista (filtrar/buscar/carregar mais não perde o foco da busca nem a rolagem). */
export function redesenharListaHistorico(ctx, cartaoSite) {
  const { el, dados, estado } = ctx;
  const lista = el.querySelector('#txHistLista');
  if (lista) lista.innerHTML = listaHistoricoHtml(estado, dados, cartaoSite);
  el.querySelectorAll('[data-hist-classe]').forEach((b) => { const on = b.getAttribute('data-hist-classe') === estado.hist.classe; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  el.querySelectorAll('[data-hist-origem]').forEach((b) => { const on = b.getAttribute('data-hist-origem') === estado.hist.origem; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
}

/** Liga o seletor de período (a cada desenho da aba, pois a seção é recriada). */
export function montarFiltroPeriodoHistorico(ctx, cartaoSite) {
  const { el, dados, estado, doc } = ctx;
  const host = el.querySelector('#txHistPeriodo');
  if (!host) return;
  ligarFiltroPeriodo(doc, host, {
    periodoInicial: estado.hist.periodo, limites: limitesDoHistorico(dados),
    aoMudar(p) { estado.hist.periodo = p; estado.hist.anos = 1; redesenharListaHistorico(ctx, cartaoSite); },
  });
}

/** Eventos delegados (uma vez por contêiner): classe, origem, busca, "Carregar mais" e o abrir/fechar dos meses. */
export function ligarHistorico(el, cartaoSite) {
  const ctx = () => el._txCtx;
  el.addEventListener('click', (ev) => {
    const alvo = ev.target.closest && ev.target.closest('[data-hist-classe], [data-hist-origem], [data-hist-mais]');
    if (!alvo || !ctx()) return;
    const c = ctx();
    const h = c.estado.hist;
    if (alvo.hasAttribute('data-hist-classe')) { h.classe = alvo.getAttribute('data-hist-classe'); h.anos = h.busca ? 99 : 1; }
    else if (alvo.hasAttribute('data-hist-origem')) { h.origem = alvo.getAttribute('data-hist-origem'); h.anos = h.busca ? 99 : 1; }
    else h.anos += 1;
    redesenharListaHistorico(c, cartaoSite);
  });
  el.addEventListener('input', (ev) => {
    if (!ev.target.matches || !ev.target.matches('#txHistBusca') || !ctx()) return;
    const c = ctx();
    c.estado.hist.busca = ev.target.value.trim();
    c.estado.hist.anos = c.estado.hist.busca ? 99 : 1; // buscando, mostra todos os anos
    redesenharListaHistorico(c, cartaoSite);
  });
  el.addEventListener('toggle', (ev) => {
    const d = ev.target;
    const c = ctx();
    if (!c || !d || !d.matches) return;
    if (d.matches('details[data-hist-mes]') && !c.estado.hist.busca) c.estado.hist.mesesAbertos[d.getAttribute('data-hist-mes')] = d.open;
    if (d.matches('details[data-hist-item]')) c.estado.hist.itensAbertos[d.getAttribute('data-hist-item')] = d.open;
  }, true);
}

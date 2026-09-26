/**
 * organizacao.js - 26/09/2026: tela Organização Financeira (organizacao/despesas.html).
 *
 * Tiago: "quero ter uma relação dos meus gastos, pra me auxiliar na ideia de
 * quantos eu preciso ter na renda emergencial... adicionar novas despesas ou
 * remover, isso influencia na soma e na meta da renda emergencial, tudo tem
 * que estar bem conectado".
 *
 * A tela trabalha num RASCUNHO: editar/adicionar/remover mexe só na tela, e
 * tudo (cartões do topo, conta da meta, categorias, salário) já mostra o
 * efeito na hora - o simulador. "Salvar alterações" grava a lista inteira de
 * uma vez (Despesas.gs, salvarDespesas); a planilha recalcula a média de
 * gastos da Distribuição e Metas, a meta da reserva e o patrimônio desejado.
 * Contas em organizacao-calc.js (sem DOM).
 */
import { getDespesas, salvarDespesas } from '../api-client.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { formatBRL, formatNumeroBR } from '../format.js';
import {
  CATEGORIAS, SEM_CATEGORIA, categoriaSugerida, lerValorBR, mensalDespesa, calcularOrganizacao, rascunhoDoServidor,
  novoItemDespesa, estadoItem, mudancasRascunho, validarRascunho, payloadRascunho, impactoRascunho,
} from './organizacao-calc.js';

const CHAVE_CACHE = 'despesas';
const CHAVE_ORDEM = 'organizacao.ordem';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pct = (f, casas = 1) => (num(f) ? `${formatNumeroBR(f * 100, casas)}%` : '—');
const meses = (m) => (num(m) ? `${formatNumeroBR(m, 1)} ${Math.abs(m - 1) < 0.05 ? 'mês' : 'meses'}` : '—');
const brl = (v) => formatBRL(v);
const sinalBRL = (v) => (num(v) ? `${v > 0 ? '+' : v < 0 ? '−' : '±'}${formatBRL(Math.abs(v))}` : '—');
const dec = (texto) => { // "R$ 9.891,81" -> R$ 9.891<span class="dec">,81</span>
  const m = String(texto).match(/^(.*?)(,\d{2})$/);
  return m ? `${esc(m[1])}<span class="dec">${esc(m[2])}</span>` : esc(texto);
};
const dataBR = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); };

function lerLocal(chave) { try { return globalThis.localStorage ? globalThis.localStorage.getItem(chave) : null; } catch (e) { return null; } }
function gravarLocal(chave, v) { try { if (globalThis.localStorage) globalThis.localStorage.setItem(chave, v); } catch (e) { /* ok */ } }

// ---------------------------------------------------------------------------
// Blocos (HTML puro a partir do cálculo)
// ---------------------------------------------------------------------------

function eraHtml(antes, depois, formatar) {
  if (!num(antes) || !num(depois) || Math.round(antes * 100) === Math.round(depois * 100)) return '';
  return `<span class="og-era" title="Valor na planilha agora">era ${esc(formatar(antes))}</span>`;
}

export function htmlHero(c, base) {
  const escala = Math.max(12, Math.ceil((c.meses || 0) * (1 + (c.sobra || 0)) * 1.5), Math.ceil(c.cobertura || 0));
  const alvoMeses = (c.meses || 0) * (1 + (c.sobra || 0));
  const pAtual = num(c.cobertura) ? Math.min(1, c.cobertura / escala) : 0;
  const pAlvo = Math.min(1, alvoMeses / escala);
  const estadoMeta = c.metaAtingida ? 'good' : 'warn';
  const barra = num(c.atingido) ? Math.min(1, c.atingido) : 0;
  return `
    <article class="og-tile og-tile-custo">
      <span class="og-rotulo">Custo de vida</span>
      <span class="og-grande">${dec(brl(c.totalComFolga))}<small>/mês</small></span>
      ${eraHtml(base.totalComFolga, c.totalComFolga, brl)}
      <span class="og-sub">gasto real <b>${esc(brl(c.totalReal))}</b> + ${esc(pct(c.folga, 0))} de folga · ${c.qtd} ${c.qtd === 1 ? 'despesa' : 'despesas'}</span>
    </article>
    <article class="og-tile og-tile-meta">
      <span class="og-rotulo">Meta da reserva <span class="status-pill ${estadoMeta}">${c.metaAtingida ? 'Meta batida' : `${esc(pct(c.atingido, 0))} da meta`}</span></span>
      <span class="og-grande">${dec(brl(c.meta))}</span>
      ${eraHtml(base.meta, c.meta, brl)}
      <div class="og-progresso ${estadoMeta}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(barra * 100)}" aria-label="Reserva atual sobre a meta"><span style="width:${(barra * 100).toFixed(2)}%"></span></div>
      <span class="og-sub">você tem <b>${esc(brl(c.atual))}</b> · ${c.metaAtingida ? `sobram <b>${esc(brl((c.atual || 0) - c.meta))}</b>` : `faltam <b>${esc(brl(c.falta))}</b>`}</span>
    </article>
    <article class="og-tile og-tile-cobertura">
      <span class="og-rotulo">A reserva cobre</span>
      <span class="og-grande">${esc(meses(c.cobertura))}</span>
      ${num(base.cobertura) && num(c.cobertura) && Math.abs(base.cobertura - c.cobertura) >= 0.05 ? `<span class="og-era">era ${esc(meses(base.cobertura))}</span>` : ''}
      <div class="og-regua" aria-hidden="true">
        <span class="og-regua-fill ${estadoMeta}" style="width:${(pAtual * 100).toFixed(2)}%"></span>
        <span class="og-regua-alvo" style="left:${(pAlvo * 100).toFixed(2)}%"><i></i><em>meta ${esc(formatNumeroBR(alvoMeses, 1))}</em></span>
        <span class="og-regua-escala"><em>0</em><em>${escala} meses</em></span>
      </div>
      <span class="og-sub">do custo com folga · <b>${esc(meses(c.coberturaReal))}</b> do gasto real</span>
    </article>`;
}

/** "De onde vem a meta": a conta da planilha, com folga/meses/sobra editáveis. */
export function htmlConta(r) {
  return `
    <div class="og-conta-cab">
      <h2>De onde vem a meta</h2>
      <span class="hint">a mesma conta da planilha - mude a folga, os meses ou a sobra e veja o efeito</span>
    </div>
    <ol class="og-cadeia">
      <li><span class="og-elo-rot">Gasto real</span><b data-out="totalReal"></b></li>
      <li class="og-op"><span>+</span><label class="og-campo"><input id="ogFolga" inputmode="decimal" value="${esc(formatNumeroBR(r.folga * 100, 0))}" aria-label="Folga em cada despesa (%)"><span>%</span></label><span class="og-elo-rot">folga</span></li>
      <li><span class="og-elo-rot">Custo de vida</span><b data-out="totalComFolga"></b></li>
      <li class="og-op"><span>×</span><label class="og-campo"><input id="ogMeses" inputmode="numeric" value="${esc(formatNumeroBR(r.meses, 0))}" aria-label="Meses de reserva"></label><span class="og-elo-rot">meses</span></li>
      <li><span class="og-elo-rot">Base</span><b data-out="base"></b></li>
      <li class="og-op"><span>+</span><label class="og-campo"><input id="ogSobra" inputmode="decimal" value="${esc(formatNumeroBR(r.sobra * 100, 0))}" aria-label="Sobra na meta (%)"><span>%</span></label><span class="og-elo-rot">sobra</span></li>
      <li class="og-elo-final"><span class="og-elo-rot">Meta da reserva</span><b data-out="meta"></b></li>
    </ol>
    <p class="og-conta-nota" data-out="nota"></p>`;
}

function atualizarConta(el, c) {
  if (!el) return;
  const set = (k, v) => { const o = el.querySelector(`[data-out="${k}"]`); if (o) o.innerHTML = v; };
  set('totalReal', dec(brl(c.totalReal)));
  set('totalComFolga', dec(brl(c.totalComFolga)));
  set('base', dec(brl(c.base)));
  set('meta', dec(brl(c.meta)));
  set('nota', c.totalReal > 0
    ? `As duas margens juntas deixam a meta <b>${esc(pct(c.margemTotal))}</b> acima de ${esc(formatNumeroBR(c.meses, 0))} meses do gasto real (${esc(brl(c.baseReal))}).${num(c.patrimonioDesejado) ? ` O custo de vida também entra no <a href="../distribuicoes-metas.html">Patrimônio desejado</a>: <b>${esc(brl(c.patrimonioDesejado))}</b>.` : ''}`
    : '');
}

function htmlLinhaItem(item, c, { sugestao }) {
  const estado = estadoItem(item);
  const mensal = mensalDespesa(item);
  const comFolga = mensal * (1 + (c.folga || 0));
  const share = c.totalReal > 0 && !item.removida ? mensal / c.totalReal : 0;
  const removida = estado === 'removida';
  return `
    <li class="og-item${estado ? ` ${estado}` : ''}" data-id="${esc(item.id)}" style="--f:${share.toFixed(4)}">
      <span class="og-marca" title="${estado === 'nova' ? 'Nova (ainda não salva)' : estado === 'editada' ? 'Alterada (ainda não salva)' : estado === 'removida' ? 'Vai ser removida ao salvar' : ''}"></span>
      <input class="og-nome" value="${esc(item.nome)}" placeholder="Nome da despesa" aria-label="Nome da despesa" maxlength="80"${removida ? ' disabled' : ''}>
      <span class="og-cat-cel">
        <input class="og-cat" list="ogListaCategorias" value="${esc(item.categoria)}" placeholder="${sugestao ? esc(sugestao) : 'Categoria'}" aria-label="Categoria" maxlength="40"${removida ? ' disabled' : ''}>
        ${!item.categoria && sugestao && !removida ? `<button type="button" class="og-sug" data-sug="${esc(sugestao)}" title="Usar a categoria sugerida">usar</button>` : ''}
      </span>
      <select class="og-freq" aria-label="Frequência"${removida ? ' disabled' : ''}>
        <option value="Mensal"${item.frequencia !== 'Anual' ? ' selected' : ''}>Mensal</option>
        <option value="Anual"${item.frequencia === 'Anual' ? ' selected' : ''}>Anual</option>
      </select>
      <label class="og-valor-cel"><span>R$</span><input class="og-valor" inputmode="decimal" value="${esc(formatNumeroBR(item.valor))}" aria-label="Valor${item.frequencia === 'Anual' ? ' por ano' : ' por mês'}"${removida ? ' disabled' : ''}></label>
      <span class="og-mes" data-out="mes"><b>${dec(brl(comFolga))}</b><small>${item.frequencia === 'Anual' ? `${esc(brl(mensal))}/mês real` : 'c/ folga'}</small></span>
      <span class="og-pct" data-out="pct">${removida ? '' : esc(pct(share, 1))}</span>
      <span class="og-acoes">
        ${removida
    ? '<button type="button" class="og-desfazer tx-link">Desfazer</button>'
    : `${estado === 'editada' ? '<button type="button" class="og-restaurar" title="Voltar ao valor da planilha" aria-label="Voltar ao valor da planilha">↺</button>' : ''}<button type="button" class="og-remover" title="Remover despesa" aria-label="Remover ${esc(item.nome || 'despesa')}">×</button>`}
      </span>
    </li>`;
}

function ordenarItens(itens, ordem) {
  const lista = [...itens];
  if (ordem === 'valor') lista.sort((a, b) => mensalDespesa(b) - mensalDespesa(a));
  if (ordem === 'categoria') {
    const idx = (cat) => { const i = CATEGORIAS.indexOf(cat); return i < 0 ? (cat ? CATEGORIAS.length : CATEGORIAS.length + 1) : i; };
    lista.sort((a, b) => idx(a.categoria.trim()) - idx(b.categoria.trim()) || a.categoria.localeCompare(b.categoria) || mensalDespesa(b) - mensalDespesa(a));
  }
  return lista;
}

export function htmlLista(rascunho, c, ordem) {
  const itens = ordenarItens(rascunho.itens, ordem);
  if (!itens.length) return '<li class="og-vazio hint">Nenhuma despesa. Use "Adicionar despesa".</li>';
  if (ordem !== 'categoria') return itens.map((i) => htmlLinhaItem(i, c, { sugestao: categoriaSugerida(i.nome) })).join('');
  let atual = null;
  return itens.map((i) => {
    const cat = i.categoria.trim() || SEM_CATEGORIA;
    let cab = '';
    if (cat !== atual) {
      atual = cat;
      const g = c.porCategoria.find((p) => p.categoria === cat);
      cab = `<li class="og-grupo"><span>${esc(cat)}</span><b>${g ? esc(brl(g.valor)) : ''}</b><small>${g ? esc(pct(g.pct, 0)) : ''}</small></li>`;
    }
    return cab + htmlLinhaItem(i, c, { sugestao: categoriaSugerida(i.nome) });
  }).join('');
}

export function htmlCategorias(c) {
  if (!c.porCategoria.length) return '';
  const max = c.porCategoria[0].valor || 1;
  const assin = c.porCategoria.find((p) => p.categoria === 'Assinaturas');
  const semCat = c.porCategoria.find((p) => p.categoria === SEM_CATEGORIA);
  return `
    <div class="lateral-cab"><h2>Por categoria</h2><span class="hint">gasto real / mês</span></div>
    <ul class="og-cats">
      ${c.porCategoria.map((p) => `
        <li class="${p.categoria === SEM_CATEGORIA ? 'sem' : ''}" title="${esc(`${p.categoria}: ${brl(p.valor)}/mês · ${brl(p.comFolga)} com folga · ${p.qtd} ${p.qtd === 1 ? 'despesa' : 'despesas'}`)}">
          <span class="og-cat-nome">${esc(p.categoria)}</span>
          <span class="og-cat-valor">${esc(brl(p.valor))}</span>
          <span class="og-cat-barra"><i style="width:${((p.valor / max) * 100).toFixed(2)}%"></i></span>
          <span class="og-cat-pct">${esc(pct(p.pct, 0))}</span>
        </li>`).join('')}
    </ul>
    ${assin ? `<p class="og-nota"><b>Assinaturas</b> somam ${esc(brl(assin.valor))}/mês - <b>${esc(brl(assin.valor * 12))} por ano</b>.</p>` : ''}
    ${semCat ? `<p class="og-nota fraca">${semCat.qtd} ${semCat.qtd === 1 ? 'despesa sem categoria' : 'despesas sem categoria'} - use a sugestão ao lado de cada uma, ou "Categorizar tudo".</p>` : ''}`;
}

export function htmlSalario(c) {
  const s = c.salario;
  if (!s) return '<div class="lateral-cab"><h2>Salário: pra onde vai</h2></div><p class="hint">Sem salário líquido em Distribuição e Metas (N11).</p>';
  const w = (v) => `${Math.max(0, Math.min(100, (v / s.liquido) * 100)).toFixed(2)}%`;
  const estourou = s.livre < 0;
  return `
    <div class="lateral-cab"><h2>Salário: pra onde vai</h2><a class="hint" href="../distribuicoes-metas.html">líquido ${esc(brl(s.liquido))} ›</a></div>
    <div class="og-sal-barra" role="img" aria-label="${esc(`Despesas essenciais ${pct(s.pctEssenciais, 0)}, investir ${pct(s.pctAporte, 0)}, livre ${pct(s.pctLivre, 0)}`)}">
      <span class="ess" style="width:${w(s.essenciais)}"></span><span class="inv" style="width:${w(s.aporte)}"></span>${estourou ? '' : `<span class="liv" style="width:${w(s.livre)}"></span>`}
    </div>
    <ul class="og-sal-leg">
      <li><i class="ess"></i><span>Despesas essenciais</span><b>${esc(brl(s.essenciais))}</b><small>${esc(pct(s.pctEssenciais, 0))}</small></li>
      <li><i class="inv"></i><span>Investir (meta)</span><b>${esc(brl(s.aporte))}</b><small>${esc(pct(s.pctAporte, 0))}</small></li>
      <li class="${estourou ? 'bad' : ''}"><i class="liv"></i><span>${estourou ? 'Falta' : 'Livre'}</span><b>${esc(brl(Math.abs(s.livre)))}</b><small>${estourou ? '' : esc(pct(s.pctLivre, 0))}</small></li>
    </ul>
    <p class="og-nota fraca">${estourou ? 'Despesas + aporte passam do salário.' : 'Usa o gasto real (sem a folga). O aporte é o % pra investir da Distribuição e Metas.'}</p>`;
}

/** Linha do tempo do custo de vida (uma linha por gravação em aux_historico-despesas). */
export function htmlHistorico(historico, c) {
  const pontos = (historico || []).filter((h) => num(h.totalComFolga) && !Number.isNaN(new Date(h.data).getTime()))
    .map((h) => ({ t: new Date(h.data).getTime(), v: h.totalComFolga, real: h.totalReal }));
  const cab = '<div class="lateral-cab"><h2>Custo de vida no tempo</h2><span class="hint">com folga</span></div>';
  if (pontos.length < 2) {
    return `${cab}<p class="og-nota fraca">A linha do tempo começa na primeira vez que você salvar por aqui: cada gravação vira um ponto (o "antes" e o "depois").</p>`;
  }
  const W = 300; const H = 92; const m = { t: 10, r: 8, b: 18, l: 8 };
  const t0 = pontos[0].t; const t1 = Math.max(pontos[pontos.length - 1].t, t0 + 1);
  const vs = pontos.map((p) => p.v);
  let min = Math.min(...vs); let max = Math.max(...vs);
  if (max - min < 1) { min -= 50; max += 50; }
  const x = (t) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (v - min) / (max - min)) * (H - m.t - m.b);
  let d = `M${x(pontos[0].t).toFixed(1)},${y(pontos[0].v).toFixed(1)}`;
  for (let i = 1; i < pontos.length; i += 1) d += `H${x(pontos[i].t).toFixed(1)}V${y(pontos[i].v).toFixed(1)}`;
  const area = `${d}V${H - m.b}H${x(pontos[0].t).toFixed(1)}Z`;
  const ult = pontos[pontos.length - 1];
  const prim = pontos[0];
  const dif = ult.v - prim.v;
  return `${cab}
    <svg class="og-hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Custo de vida de ${brl(prim.v)} em ${dataBR(prim.t)} para ${brl(ult.v)} em ${dataBR(ult.t)}`)}">
      <line class="og-hist-base" x1="${m.l}" x2="${W - m.r}" y1="${H - m.b}" y2="${H - m.b}"/>
      <path class="og-hist-area" d="${area}"/>
      <path class="og-hist-linha" d="${d}"/>
      ${pontos.map((p) => `<circle class="og-hist-ponto" cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.2"><title>${esc(`${dataBR(p.t)}: ${brl(p.v)} com folga (${brl(p.real)} real)`)}</title></circle>`).join('')}
      <text x="${m.l}" y="${H - 4}" class="og-hist-rot">${esc(dataBR(prim.t))}</text>
      <text x="${W - m.r}" y="${H - 4}" class="og-hist-rot" text-anchor="end">${esc(dataBR(ult.t))}</text>
    </svg>
    <p class="og-nota">${esc(brl(prim.v))} → <b>${esc(brl(ult.v))}</b> <span class="${dif > 0 ? 'bad' : dif < 0 ? 'good' : ''}">(${esc(sinalBRL(dif))})</span>${num(c.totalComFolga) && Math.round(c.totalComFolga * 100) !== Math.round(ult.v * 100) ? ` · prévia agora ${esc(brl(c.totalComFolga))}` : ''}</p>`;
}

export function htmlBarra(mud, imp, { erros = [], salvando = false, erro = '', conflito = false } = {}) {
  const partes = [];
  if (mud.novas) partes.push(`${mud.novas} ${mud.novas === 1 ? 'nova' : 'novas'}`);
  if (mud.editadas) partes.push(`${mud.editadas} ${mud.editadas === 1 ? 'alterada' : 'alteradas'}`);
  if (mud.removidas) partes.push(`${mud.removidas} ${mud.removidas === 1 ? 'removida' : 'removidas'}`);
  if (mud.parametros.length) partes.push(mud.parametros.join(', '));
  const chip = (rot, v, fmt, inverso = false) => {
    if (!num(v) || Math.abs(v) < 0.005) return '';
    const ruim = inverso ? v < 0 : v > 0;
    return `<span class="og-imp ${ruim ? 'bad' : 'good'}"><small>${esc(rot)}</small>${esc(fmt(v))}</span>`;
  };
  const cob = num(imp.coberturaAntes) && num(imp.coberturaDepois) && Math.abs(imp.coberturaAntes - imp.coberturaDepois) >= 0.05
    ? `<span class="og-imp ${imp.coberturaDepois < imp.coberturaAntes ? 'bad' : 'good'}"><small>Cobertura</small>${esc(formatNumeroBR(imp.coberturaAntes, 1))} → ${esc(formatNumeroBR(imp.coberturaDepois, 1))} meses</span>` : '';
  const aviso = conflito
    ? `<p class="og-barra-erro">A planilha mudou enquanto você editava. Descarte e recarregue pra não sobrescrever o que mudou lá.</p>`
    : erro ? `<p class="og-barra-erro">${esc(erro)}</p>`
      : erros.length ? `<p class="og-barra-erro">${esc(erros[0])}${erros.length > 1 ? ` (+${erros.length - 1})` : ''}</p>` : '';
  return `
    <div class="og-barra-info">
      <b>${mud.total} ${mud.total === 1 ? 'alteração' : 'alterações'}</b><span class="og-barra-partes">${esc(partes.join(' · '))}</span>
      <span class="og-imps">${chip('Custo de vida', imp.totalComFolga, (v) => `${sinalBRL(v)}/mês`)}${chip('Meta da reserva', imp.meta, sinalBRL)}${chip('Patrimônio desejado', imp.patrimonioDesejado, sinalBRL)}${cob}</span>
      ${aviso}
    </div>
    <div class="og-barra-botoes">
      <button type="button" class="btn btn-ghost" data-acao="descartar"${salvando ? ' disabled' : ''}>${conflito ? 'Descartar e recarregar' : 'Descartar'}</button>
      <button type="button" class="btn btn-primary" data-acao="salvar"${salvando || erros.length || conflito ? ' disabled' : ''}>${salvando ? 'Salvando…' : 'Salvar na planilha'}</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export async function montarPaginaOrganizacao(token, {
  doc = document, getDespesasImpl = getDespesas, salvarDespesasImpl = salvarDespesas, refresh = true,
} = {}) {
  const loadingEl = doc.getElementById('organizacaoLoading');
  const erroEl = doc.getElementById('organizacaoErro');
  const conteudo = doc.getElementById('organizacaoConteudo');
  const refreshEl = doc.getElementById('refreshControlOrganizacao');
  const win = doc.defaultView;

  let dados = null;
  let rascunho = null;
  let calcBase = null;
  let ordem = ['planilha', 'valor', 'categoria'].includes(lerLocal(CHAVE_ORDEM)) ? lerLocal(CHAVE_ORDEM) : 'planilha';
  const ui = { salvando: false, erro: '', conflito: false, salvoEm: null };

  const $ = (sel) => conteudo.querySelector(sel);
  const contexto = () => ({ reserva: dados.reserva, salario: dados.salario, patrimonio: dados.patrimonio });
  const calcular = () => calcularOrganizacao(rascunho, contexto());
  const acharItem = (id) => rascunho.itens.find((i) => i.id === id);

  function montarEsqueleto() {
    conteudo.innerHTML = `
      <section class="og-hero" id="ogHero" aria-live="polite"></section>
      <section class="og-conta" id="ogConta"></section>
      <div class="og-colunas">
        <section class="og-card og-lista-card">
          <div class="og-lista-cab">
            <div><h2>Despesas essenciais</h2><span class="hint" id="ogContador"></span></div>
            <div class="og-lista-ferr">
              <div class="filter-tabs og-ordem" id="ogOrdem" role="group" aria-label="Ordenar">
                <button type="button" class="filter-tab" data-ordem="planilha">Planilha</button>
                <button type="button" class="filter-tab" data-ordem="valor">Maior valor</button>
                <button type="button" class="filter-tab" data-ordem="categoria">Categoria</button>
              </div>
              <button type="button" class="btn btn-ghost og-btn-sm" id="ogCategorizar" hidden>Categorizar tudo</button>
            </div>
          </div>
          <div class="og-colunas-rot" aria-hidden="true"><span></span><span>Despesa</span><span>Categoria</span><span>Frequência</span><span>Valor</span><span>Por mês</span><span>%</span><span></span></div>
          <ul class="og-lista" id="ogLista"></ul>
          <div class="og-lista-rodape">
            <button type="button" class="btn btn-ghost og-btn-sm" id="ogAdicionar">+ Adicionar despesa</button>
            <div class="og-totais" id="ogTotais"></div>
          </div>
        </section>
        <aside class="og-lateral">
          <section class="og-card" id="ogCategorias"></section>
          <section class="og-card" id="ogSalario"></section>
          <section class="og-card" id="ogHistorico"></section>
        </aside>
      </div>
      <div class="og-barra" id="ogBarra" hidden role="region" aria-label="Alterações não salvas"></div>
      <datalist id="ogListaCategorias">${CATEGORIAS.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>`;
    ligarEventos();
  }

  function desenharLista(c) {
    $('#ogLista').innerHTML = htmlLista(rascunho, c, ordem);
    conteudo.querySelectorAll('#ogOrdem [data-ordem]').forEach((b) => {
      const ativo = b.dataset.ordem === ordem;
      b.classList.toggle('active', ativo);
      b.setAttribute('aria-pressed', String(ativo));
    });
  }

  function atualizarResumo({ lista = false } = {}) {
    const c = calcular();
    $('#ogHero').innerHTML = htmlHero(c, calcBase);
    atualizarConta($('#ogConta'), c);
    if (lista) desenharLista(c);
    else {
      // só as células calculadas - os campos em edição ficam intactos (foco/cursor)
      conteudo.querySelectorAll('#ogLista .og-item').forEach((li) => {
        const it = acharItem(li.dataset.id);
        if (!it) return;
        const mensal = mensalDespesa(it);
        const share = c.totalReal > 0 && !it.removida ? mensal / c.totalReal : 0;
        li.style.setProperty('--f', share.toFixed(4));
        li.querySelector('[data-out="mes"]').innerHTML = `<b>${dec(brl(mensal * (1 + c.folga)))}</b><small>${it.frequencia === 'Anual' ? `${esc(brl(mensal))}/mês real` : 'c/ folga'}</small>`;
        li.querySelector('[data-out="pct"]').textContent = it.removida ? '' : pct(share, 1);
        const estado = estadoItem(it);
        li.classList.toggle('nova', estado === 'nova');
        li.classList.toggle('editada', estado === 'editada');
        const acoes = li.querySelector('.og-acoes');
        const temRestaurar = !!acoes.querySelector('.og-restaurar');
        if ((estado === 'editada') !== temRestaurar && !it.removida) {
          acoes.innerHTML = `${estado === 'editada' ? '<button type="button" class="og-restaurar" title="Voltar ao valor da planilha" aria-label="Voltar ao valor da planilha">↺</button>' : ''}<button type="button" class="og-remover" title="Remover despesa" aria-label="Remover ${esc(it.nome || 'despesa')}">×</button>`;
        }
      });
    }
    const semCat = rascunho.itens.filter((i) => !i.removida && !i.categoria.trim() && categoriaSugerida(i.nome)).length;
    const btnCat = $('#ogCategorizar');
    btnCat.hidden = semCat === 0;
    btnCat.textContent = `Categorizar tudo (${semCat})`;
    $('#ogContador').textContent = `${c.qtd} ${c.qtd === 1 ? 'despesa' : 'despesas'} · o que você precisa pagar todo mês, aconteça o que acontecer`;
    $('#ogTotais').innerHTML = `<span>Gasto real <b>${esc(brl(c.totalReal))}</b></span><span>Com ${esc(pct(c.folga, 0))} de folga <b>${esc(brl(c.totalComFolga))}</b></span>`;
    $('#ogCategorias').innerHTML = htmlCategorias(c);
    $('#ogSalario').innerHTML = htmlSalario(c);
    $('#ogHistorico').innerHTML = htmlHistorico(dados.historico, c);
    desenharBarra(c);
  }

  function desenharBarra(c = calcular()) {
    const barra = $('#ogBarra');
    const mud = mudancasRascunho(rascunho);
    const sujo = mud.total > 0;
    if (!sujo && !ui.conflito && !ui.erro) {
      if (ui.salvoEm) {
        barra.hidden = false;
        barra.className = 'og-barra og-barra-ok';
        barra.innerHTML = '<div class="og-barra-info"><b>Salvo na planilha</b><span class="og-barra-partes">Distribuição e Metas já usa a nova média de gastos.</span></div>';
      } else barra.hidden = true;
      return;
    }
    barra.hidden = false;
    barra.className = 'og-barra';
    barra.innerHTML = htmlBarra(mud, impactoRascunho(calcBase, c), {
      erros: validarRascunho(rascunho), salvando: ui.salvando, erro: ui.erro, conflito: ui.conflito,
    });
  }

  function desenharTudo() {
    loadingEl.hidden = true;
    erroEl.hidden = true;
    conteudo.hidden = false;
    if (!$('#ogHero')) montarEsqueleto();
    $('#ogConta').innerHTML = htmlConta(rascunho);
    atualizarResumo({ lista: true });
  }

  function aoMudar({ lista = false } = {}) {
    ui.salvoEm = null;
    ui.erro = '';
    atualizarResumo({ lista });
  }

  function lerParametro(input, { fracao = true } = {}) {
    const v = lerValorBR(input.value);
    input.classList.toggle('invalido', v === null);
    if (v === null) return null;
    return fracao ? v / 100 : v;
  }

  function ligarEventos() {
    const lista = $('#ogLista');
    lista.addEventListener('input', (ev) => {
      const li = ev.target.closest('.og-item');
      const it = li && acharItem(li.dataset.id);
      if (!it) return;
      if (ev.target.classList.contains('og-nome')) it.nome = ev.target.value;
      else if (ev.target.classList.contains('og-cat')) it.categoria = ev.target.value;
      else if (ev.target.classList.contains('og-valor')) {
        const v = lerValorBR(ev.target.value);
        ev.target.classList.toggle('invalido', v === null || v < 0);
        it.valor = v === null ? NaN : v;
      } else return;
      aoMudar();
    });
    lista.addEventListener('change', (ev) => {
      const li = ev.target.closest('.og-item');
      const it = li && acharItem(li.dataset.id);
      if (!it) return;
      if (ev.target.classList.contains('og-freq')) {
        it.frequencia = ev.target.value === 'Anual' ? 'Anual' : 'Mensal';
        aoMudar({ lista: true });
      } else if (ev.target.classList.contains('og-cat')) {
        aoMudar({ lista: ordem === 'categoria' });
      }
    });
    lista.addEventListener('focusout', (ev) => {
      if (!ev.target.classList.contains('og-valor')) return;
      const v = lerValorBR(ev.target.value);
      if (v !== null && v >= 0) ev.target.value = formatNumeroBR(v);
    });
    lista.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
      ev.preventDefault();
      const campos = [...lista.querySelectorAll('input:not([disabled]), select:not([disabled])')];
      const i = campos.indexOf(ev.target);
      if (i >= 0 && campos[i + 1]) campos[i + 1].focus();
    });
    lista.addEventListener('click', (ev) => {
      const li = ev.target.closest('.og-item');
      const it = li && acharItem(li.dataset.id);
      if (!it) return;
      if (ev.target.closest('.og-remover')) {
        if (it.nova) rascunho.itens = rascunho.itens.filter((x) => x !== it);
        else it.removida = true;
        aoMudar({ lista: true });
      } else if (ev.target.closest('.og-desfazer')) {
        it.removida = false;
        aoMudar({ lista: true });
      } else if (ev.target.closest('.og-restaurar')) {
        Object.assign(it, it.original);
        aoMudar({ lista: true });
      } else if (ev.target.closest('.og-sug')) {
        it.categoria = ev.target.closest('.og-sug').dataset.sug;
        aoMudar({ lista: true });
      }
    });

    $('#ogOrdem').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ordem]');
      if (!b) return;
      ordem = b.dataset.ordem;
      gravarLocal(CHAVE_ORDEM, ordem);
      desenharLista(calcular());
    });
    $('#ogCategorizar').addEventListener('click', () => {
      rascunho.itens.forEach((i) => { if (!i.removida && !i.categoria.trim()) i.categoria = categoriaSugerida(i.nome) || ''; });
      aoMudar({ lista: true });
    });
    $('#ogAdicionar').addEventListener('click', () => {
      const novo = novoItemDespesa();
      rascunho.itens.push(novo);
      if (ordem !== 'planilha') { ordem = 'planilha'; gravarLocal(CHAVE_ORDEM, ordem); }
      aoMudar({ lista: true });
      const campo = conteudo.querySelector(`.og-item[data-id="${novo.id}"] .og-nome`);
      if (campo) campo.focus();
    });

    $('#ogConta').addEventListener('input', (ev) => {
      const id = ev.target.id;
      if (id === 'ogFolga') { const v = lerParametro(ev.target); rascunho.folga = v === null ? NaN : v; }
      else if (id === 'ogSobra') { const v = lerParametro(ev.target); rascunho.sobra = v === null ? NaN : v; }
      else if (id === 'ogMeses') { const v = lerParametro(ev.target, { fracao: false }); rascunho.meses = v === null ? NaN : v; }
      else return;
      aoMudar();
    });

    $('#ogBarra').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) return;
      if (b.dataset.acao === 'descartar') {
        const recarregar = ui.conflito;
        ui.conflito = false; ui.erro = ''; ui.salvoEm = null;
        rascunho = rascunhoDoServidor(dados);
        desenharTudo();
        if (recarregar) await carregar();
        return;
      }
      if (b.dataset.acao === 'salvar') await salvar();
    });
  }

  async function salvar() {
    if (ui.salvando || validarRascunho(rascunho).length) return;
    ui.salvando = true; ui.erro = '';
    desenharBarra();
    let r;
    try { r = await salvarDespesasImpl(token, payloadRascunho(rascunho)); } catch (e) { r = { ok: false, erro: String(e) }; }
    ui.salvando = false;
    if (!r || !r.ok) {
      ui.conflito = !!(r && r.conflito);
      ui.erro = ui.conflito ? '' : `Não deu pra salvar: ${(r && r.erro) || 'erro desconhecido'}`;
      desenharBarra();
      return;
    }
    aplicarDados(r, { forcar: true });
    ui.salvoEm = Date.now();
    desenharTudo();
    gravarCacheDados(CHAVE_CACHE, r);
  }

  function aplicarDados(r, { forcar = false } = {}) {
    const sujo = rascunho && mudancasRascunho(rascunho).total > 0;
    dados = r;
    calcBase = calcularOrganizacao(rascunhoDoServidor(r), { reserva: r.reserva, salario: r.salario, patrimonio: r.patrimonio });
    if (!forcar && sujo) {
      if (r.assinatura !== rascunho.assinatura) ui.conflito = true;
      return;
    }
    rascunho = rascunhoDoServidor(r);
  }

  async function carregar() {
    let r;
    try { r = await getDespesasImpl(token); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) {
      loadingEl.hidden = true;
      if (!dados) {
        erroEl.hidden = false;
        erroEl.textContent = `Não deu pra carregar as despesas agora (${(r && r.etapa) || '?'}): ${(r && r.erro) || 'erro desconhecido'}.`;
      }
      return;
    }
    gravarCacheDados(CHAVE_CACHE, r);
    const sujo = rascunho && mudancasRascunho(rascunho).total > 0;
    aplicarDados(r);
    if (sujo) atualizarResumo(); else desenharTudo();
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('beforeunload', (ev) => {
      if (rascunho && mudancasRascunho(rascunho).total > 0) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  const cache = await lerCacheDados(CHAVE_CACHE);
  if (cache && cache.dados && cache.dados.ok) { aplicarDados(cache.dados); desenharTudo(); }
  // 26/09/2026: o botão "Atualizar dados" entra ANTES da 1ª busca (mostra
  // "Atualizando…" enquanto carrega) e fica fora do conteúdo - visível no
  // carregamento e no erro também, que é quando mais se precisa dele.
  if (refresh) await mountRefreshControl(doc, refreshEl, carregar, { setIntervalImpl: null }).atualizar();
  else await carregar();
  return { get rascunho() { return rascunho; }, get dados() { return dados; } };
}

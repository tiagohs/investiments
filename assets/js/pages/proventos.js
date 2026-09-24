// assets/js/pages/proventos.js
//
// 24/09/2026: tela Proventos (menu principal) - Tiago: "Consolidado" e
// "Agenda", com filtro pelo tipo de ativo (Todas / Ações / FIIs / Ações EUA)
// valendo nas 2 abas. As contas ficam em proventos-calc.js (puras, testadas);
// aqui só desenha e liga os cliques.
//
// Gráficos (skill de dataviz): barras empilhadas por mês com 2px de
// respiro entre as partes e ponta de cima arredondada; cores das classes
// (--acoes/--fiis/--usa) ou, por tipo/ativo, a paleta categórica em ordem
// fixa (--cat-1..7, validada; "Outros" é neutro). Toda barra tem tooltip,
// sempre há legenda com o total de cada grupo, e o botão "Tabela" mostra os
// mesmos números em tabela (a paleta tem contraste baixo no tema claro em 3
// cores - a tabela e a legenda cobrem isso).
import { getProventos, importarProventosB3 } from '../api-client.js';
import { formatBRL, formatBRLCompacto, formatNumeroBR } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { logoAtivoHtml } from './carteiras-classe-comum.js';
import { urlAtivoTicker } from '../link-ativo.js'; // 25/09/2026
import {
  CLASSES, NOME_CLASSE, COR_CLASSE, PERIODOS, MESES_CURTOS, MESES_LONGOS,
  resumoConsolidado, historicoMensal, rankingPorAtivo, receitaFutura, rotuloMes,
  itensAgenda, anosDaAgenda, contagemPorMes, filtrarAgenda, previaExportacaoB3,
} from './proventos-calc.js';

const CHAVE_CACHE = 'proventos';
const CHAVE_PREFS = 'proventos.prefs.v1';
const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const LIMITE_RANKING = 10;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dm = (chave) => (chave ? `${chave.slice(8, 10)}/${chave.slice(5, 7)}` : '—');
const dma = (chave) => (chave ? `${chave.slice(8, 10)}/${chave.slice(5, 7)}/${chave.slice(0, 4)}` : '—');
const pct = (v, casas = 2) => (typeof v === 'number' && Number.isFinite(v) ? `${formatNumeroBR(v, casas)}%` : '—');
const qtdTxt = (q) => (typeof q === 'number' && q > 0 ? formatNumeroBR(q, q % 1 ? 4 : 0) : '—');

function lerPrefs() {
  try { return JSON.parse(globalThis.localStorage.getItem(CHAVE_PREFS) || '{}') || {}; } catch (e) { return {}; }
}
function gravarPrefs(estado) {
  try {
    globalThis.localStorage.setItem(CHAVE_PREFS, JSON.stringify({ aba: estado.aba, classe: estado.classe, periodo: estado.periodo, agrupar: estado.agrupar }));
  } catch (e) { /* só conveniência */ }
}

const numeroCota = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const usd = (v) => (typeof v === 'number' && Number.isFinite(v) ? `US$ ${formatNumeroBR(v)}` : '—');
/** Valor compacto pro rótulo do gráfico: "R$ 642" / "R$ 1,2 mil". */
const brlCurto = (v) => (Math.abs(v) >= 1000 ? formatBRLCompacto(v) : `R$ ${formatNumeroBR(Math.round(v), 0)}`);

function valorPorCotaTxt(p) {
  if (!(typeof p.valorPorCota === 'number' && p.valorPorCota > 0)) return '—';
  return `${p.moeda === 'USD' ? 'US$' : 'R$'} ${numeroCota(p.valorPorCota)}`;
}

// ---------------------------------------------------------------------------
// Topo: abas + filtro de classe + importar B3
// ---------------------------------------------------------------------------

/** Botões de um controle segmentado (um grupo só, em vez de várias pílulas soltas). */
function segHtml(itens, ativo, attr, rotulo, extra = '') {
  return `<div class="pv-seg${extra}" role="group" aria-label="${rotulo}">${itens.map((it) => `<button type="button" class="pv-seg-btn${it.id === ativo ? ' active' : ''}" data-${attr}="${it.id}" aria-pressed="${it.id === ativo}">${it.html}</button>`).join('')}</div>`;
}
const rotuloDuplo = (longo, curto) => `<span class="pv-longo">${longo}</span><span class="pv-curto">${curto}</span>`;

/**
 * 25/09/2026 (Tiago: "organize melhor esses filtros, está muito embolado"):
 * linha 1 = abas + importar B3 (ação da página, à direita);
 * linha 2 = carteira à ESQUERDA e os filtros da aba à DIREITA (período no
 * Consolidado; ano e situação na Agenda), cada um num controle segmentado.
 * No celular as 2 partes da linha 2 viram 2 linhas cheias, sem quebrar
 * botão pra linha de baixo (rótulos curtos: "12m", "EUA"...).
 */
function topoHtml(estado, dados) {
  const abas = [['consolidado', 'Consolidado'], ['agenda', 'Agenda']];
  const classes = [
    { id: 'todas', html: 'Todas' },
    ...CLASSES.map((c) => ({ id: c.id, html: `<span class="pv-dot" style="background:var(${c.cor})"></span>${c.id === 'acoesEua' ? rotuloDuplo('Ações EUA', 'EUA') : c.nome}` })),
  ];
  const b3 = dados && dados.atualizadoB3 ? `B3 importada em ${dm(dados.atualizadoB3)}` : '';
  return `
    <div class="pv-topo">
      <div class="pv-abas" role="tablist" aria-label="Proventos">
        ${abas.map(([id, nome]) => `<button type="button" role="tab" class="pv-aba${estado.aba === id ? ' active' : ''}" data-aba="${id}" aria-selected="${estado.aba === id}">${nome}</button>`).join('')}
      </div>
      <div class="pv-importar">
        ${b3 ? `<span class="pv-importar-info">${esc(b3)}</span>` : ''}
        <button type="button" class="pv-importar-btn" id="pvImportarBtn" title="Planilha &quot;Proventos a receber&quot; baixada da Área do Investidor da B3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>
          ${rotuloDuplo('Importar planilha da B3', 'Importar B3')}
        </button>
        <input type="file" id="pvImportarArquivo" accept=".xlsx,.xls" hidden>
      </div>
    </div>
    <div class="pv-importar-status" id="pvImportarStatus" hidden></div>
    <div class="pv-filtros">
      ${segHtml(classes, estado.classe, 'classe', 'Carteira', ' pv-seg-classes')}
      <div class="pv-filtros-dir" id="pvFiltrosDir"></div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Consolidado
// ---------------------------------------------------------------------------

function cardsHtml(r, periodoNome, periodoId, mesNome) {
  const e12 = periodoId === '12m';
  const card = (rotulo, valor, sub, extra = '') => `
    <div class="pv-card${extra}">
      <span class="pv-card-rotulo">${rotulo}</span>
      <span class="pv-card-valor">${valor}</span>
      <span class="pv-card-sub">${sub}</span>
    </div>`;
  return `
    <div class="pv-cards">
      ${card('Valor aplicado', formatBRL(r.aplicado), `Aportes em 12 meses: <b>${formatBRL(r.aportes12m)}</b>`)}
      ${card(`Renda · ${r.primeiroMes === r.ultimoMes ? rotuloMes(r.ultimoMes) : `${rotuloMes(r.primeiroMes)} a ${rotuloMes(r.ultimoMes)}`}`, formatBRL(r.renda), e12 ? `Em ${mesNome}: <b>${formatBRL(r.rendaMes)}</b>` : `12 meses: <b>${formatBRL(r.renda12m)}</b>`, ' pv-card-destaque')}
      ${card('Média mensal', formatBRL(r.media), `${r.mediaInicio === r.mediaFim ? rotuloMes(r.mediaFim) : `${rotuloMes(r.mediaInicio)} a ${rotuloMes(r.mediaFim)}`} · meses fechados${e12 ? '' : ` · 12 meses: <b>${formatBRL(r.media12m)}</b>`}`)}
      ${card('Yield on cost', pct(r.yoc), e12 ? 'renda de 12 meses ÷ valor aplicado' : `12 meses: <b>${pct(r.yoc12m)}</b>`)}
      ${card('A receber', formatBRL(r.aReceber), `Neste mês: <b>${formatBRL(r.aReceberEsteMes)}</b>`)}
    </div>`;
}

function historicoCardHtml(estado) {
  const agrupar = [['classe', 'Classe'], ['tipo', 'Tipo'], ['ativo', 'Ativo']];
  return `
    <section class="pv-bloco" aria-labelledby="pvHistTitulo">
      <div class="pv-bloco-cab">
        <h3 id="pvHistTitulo">Histórico mensal</h3>
        <div class="pv-bloco-ctrl">
          <div class="pv-seg" role="group" aria-label="Agrupar por">
            <span class="pv-seg-rotulo">Agrupar por</span>
            ${agrupar.map(([id, n]) => `<button type="button" class="pv-seg-btn${estado.agrupar === id ? ' active' : ''}" data-agrupar="${id}" aria-pressed="${estado.agrupar === id}">${n}</button>`).join('')}
          </div>
          <div class="pv-seg" role="group" aria-label="Ver como">
            ${[['grafico', 'Gráfico'], ['tabela', 'Tabela']].map(([id, n]) => `<button type="button" class="pv-seg-btn${estado.visao === id ? ' active' : ''}" data-visao="${id}" aria-pressed="${estado.visao === id}">${n}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="pv-hist-corpo" id="pvHistCorpo"></div>
      <div class="pv-legenda" id="pvHistLegenda"></div>
    </section>`;
}

/** Retângulo com os 2 cantos de cima arredondados (ponta de dado). */
function pathTopoArredondado(x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

function passoEixo(max) {
  if (!(max > 0)) return 1;
  const bruto = max / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / pot;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pot;
}

function renderHistoricoGrafico(doc, corpo, hist) {
  const W = Math.max(corpo.clientWidth || 0, 300);
  const H = 230;
  const padL = 62, padR = 8, padT = 18, padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = hist.meses.length;
  const max = Math.max(0, ...hist.totais);
  const passo = passoEixo(max);
  const topo = Math.max(passo, Math.ceil(max / passo) * passo);
  const y = (v) => padT + plotH - (v / topo) * plotH;
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(slot * 0.64, 34));
  const GAP = 2;
  let svg = '';
  for (let v = 0; v <= topo + 1e-9; v += passo) {
    svg += `<line class="gridline${v === 0 ? ' base' : ''}" x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
    svg += `<text class="axislabel" x="${padL - 8}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(brlCurto(v))}</text>`;
  }
  const iMax = hist.totais.indexOf(max);
  const minDistRotulo = 46;
  const cada = Math.max(1, Math.ceil(minDistRotulo / slot));
  hist.meses.forEach((m, i) => {
    const cx = padL + slot * i + slot / 2;
    const x = cx - barW / 2;
    let base = 0;
    const partes = hist.grupos.map((g) => ({ g, v: hist.valores[g.id][i] })).filter((p) => p.v > 0);
    let barra = '';
    partes.forEach((p, k) => {
      const y0 = y(base);
      const y1 = y(base + p.v);
      base += p.v;
      const ultimo = k === partes.length - 1;
      const alto = Math.max(0, y0 - y1 - (ultimo ? 0 : GAP)); // respiro de 2px entre as partes
      const topoY = ultimo ? y1 : y1 + GAP;
      if (alto <= 0.2) return;
      const d = ultimo ? pathTopoArredondado(x, topoY, barW, alto, 4) : `M${x},${topoY + alto}V${topoY}H${x + barW}V${topoY + alto}Z`;
      barra += `<path d="${d}" fill="var(${p.g.cor})"/>`;
    });
    svg += `<g class="pv-barra" data-i="${i}">${barra}</g>`;
    if (i === iMax && max > 0) svg += `<text class="pv-rotulo-max" x="${cx.toFixed(1)}" y="${(y(max) - 5).toFixed(1)}" text-anchor="middle">${esc(brlCurto(max))}</text>`;
    if ((n - 1 - i) % cada === 0) svg += `<text class="axislabel" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(rotuloMes(m))}</text>`;
    svg += `<rect class="pv-hit" data-i="${i}" x="${(padL + slot * i).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${plotH}" fill="transparent"/>`;
  });
  corpo.innerHTML = `
    <div class="pv-grafico">
      <svg class="pv-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Proventos recebidos por mês">${svg}</svg>
      <div class="pv-tooltip" hidden></div>
    </div>`;
  const svgEl = corpo.querySelector('svg');
  const tip = corpo.querySelector('.pv-tooltip');
  const mostrar = (i) => {
    svgEl.querySelectorAll('.pv-barra').forEach((g) => g.classList.toggle('apagada', Number(g.getAttribute('data-i')) !== i));
    const linhas = hist.grupos.map((g) => ({ g, v: hist.valores[g.id][i] })).filter((p) => p.v > 0).reverse();
    tip.innerHTML = `
      <div class="pv-tooltip-titulo">${esc(MESES_LONGOS[Number(hist.meses[i].slice(5, 7)) - 1])} de ${hist.meses[i].slice(0, 4)}</div>
      ${linhas.map((p) => `<div class="pv-tooltip-item"><span class="pv-dot" style="background:var(${p.g.cor})"></span>${esc(p.g.rotulo)}<b>${formatBRL(p.v)}</b></div>`).join('') || '<div class="pv-tooltip-item">Nenhum provento</div>'}
      ${linhas.length > 1 ? `<div class="pv-tooltip-item pv-tooltip-total">Total<b>${formatBRL(hist.totais[i])}</b></div>` : ''}`;
    tip.hidden = false;
    // ao lado da barra (nunca por cima dela)
    const cx = padL + slot * i + slot / 2;
    const larg = tip.offsetWidth || 170;
    const esquerda = cx + barW / 2 + 10 + larg <= W ? cx + barW / 2 + 10 : cx - barW / 2 - 10 - larg;
    tip.style.left = `${Math.max(0, esquerda)}px`;
  };
  const esconder = () => {
    tip.hidden = true;
    svgEl.querySelectorAll('.pv-barra').forEach((g) => g.classList.remove('apagada'));
  };
  svgEl.querySelectorAll('.pv-hit').forEach((r) => {
    const i = Number(r.getAttribute('data-i'));
    r.addEventListener('pointerenter', () => mostrar(i));
    r.addEventListener('pointerdown', () => mostrar(i));
  });
  svgEl.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch') esconder(); });
}

function renderHistoricoTabela(corpo, hist) {
  const linhas = hist.meses.map((m, i) => ({ m, i })).filter(({ i }) => hist.totais[i] > 0).reverse();
  corpo.innerHTML = `
    <div class="pv-tabela-wrap">
      <table class="pv-tabela pv-tabela-hist">
        <thead><tr><th class="esq">Mês</th>${hist.grupos.map((g) => `<th><span class="pv-dot" style="background:var(${g.cor})"></span>${esc(g.rotulo)}</th>`).join('')}<th>Total</th></tr></thead>
        <tbody>${linhas.map(({ m, i }) => `<tr><td class="esq">${esc(rotuloMes(m))}</td>${hist.grupos.map((g) => `<td>${hist.valores[g.id][i] ? formatBRL(hist.valores[g.id][i]) : '<span class="pv-zero">—</span>'}</td>`).join('')}<td><b>${formatBRL(hist.totais[i])}</b></td></tr>`).join('') || `<tr><td colspan="${hist.grupos.length + 2}">Nenhum provento no período.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderLegendaHistorico(legenda, hist) {
  legenda.innerHTML = hist.grupos.map((g) => {
    const total = hist.valores[g.id].reduce((s, v) => s + v, 0);
    return `<span class="pv-legenda-item"><span class="pv-dot" style="background:var(${g.cor})"></span>${esc(g.rotulo)} <b>${formatBRL(total)}</b></span>`;
  }).join('');
}

function rankingHtml(lista, mostrarTodos) {
  if (!lista.length) return '<p class="pv-vazio">Nenhum provento recebido no período.</p>';
  const max = lista[0].total;
  const visiveis = mostrarTodos ? lista : lista.slice(0, LIMITE_RANKING);
  return `
    <ol class="pv-ranking">
      ${visiveis.map((a) => `
        <li class="pv-rank-item" tabindex="0" data-ticker="${esc(a.ticker)}" aria-label="${esc(a.ticker)}: ${formatBRL(a.total)}, ${pct(a.pct, 1)} do total">
          ${logoAtivoHtml(a.ticker)}
          <div class="pv-rank-meio">
            <div class="pv-rank-linha"><b><a class="link-ativo" href="${urlAtivoTicker(a.ticker)}">${esc(a.ticker)}</a></b><span class="pv-rank-valor">${formatBRL(a.total)}<span class="pv-rank-pct">${pct(a.pct, 1)}</span></span></div>
            <div class="pv-rank-trilho"><span style="width:${Math.max(1.5, (a.total / max) * 100).toFixed(1)}%;background:var(${COR_CLASSE[a.classe] || '--ink-faint'})"></span></div>
          </div>
        </li>`).join('')}
    </ol>
    ${lista.length > LIMITE_RANKING ? `<button type="button" class="pv-mais" data-acao="ranking">${mostrarTodos ? 'Mostrar menos' : `Ver todos os ${lista.length}`}</button>` : ''}`;
}

function detalheAtivoHtml(a) {
  const pm = a.precoMedio ? (a.moeda === 'USD' ? usd(a.precoMedio) : formatBRL(a.precoMedio)) : '—';
  const linha = (k, v) => `<div class="tt-row"><span class="tt-k">${k}</span><span class="tt-v">${v}</span></div>`;
  return `
    <div class="tt-head">${logoAtivoHtml(a.ticker)} ${esc(a.ticker)} <span class="tt-cat">${esc(NOME_CLASSE[a.classe] || '')}</span></div>
    ${a.nome ? `<div class="pv-tt-nome">${esc(a.nome)}</div>` : ''}
    ${linha('Recebido no período', `${formatBRL(a.total)} · ${a.pagamentos} pagto${a.pagamentos === 1 ? '' : 's'}`)}
    ${linha('Parte dos proventos', pct(a.pct, 1))}
    ${linha('Quantidade atual', a.naCarteira ? qtdTxt(a.quantidade) : 'vendido')}
    ${linha('Preço médio', pm)}
    ${linha('Yield on cost (12 meses)', pct(a.yoc12m))}
    ${linha('Dividend yield', pct(a.dy))}
    ${linha('Total desde o início', formatBRL(a.totalDesdeInicio))}`;
}

function futuroHtml(f) {
  const tile = (rotulo, v) => `<div class="pv-futuro-tile"><span>${rotulo}</span><b>${formatBRL(v)}</b></div>`;
  const prox = f.proximos.slice(0, 6);
  return `
    <div class="pv-futuro-tiles">
      ${tile('Próximos 30 dias', f.d30)}
      ${tile('Próximos 3 meses', f.d90)}
      ${tile('Próximos 12 meses', f.d365)}
    </div>
    ${f.qtdSemData ? `<p class="pv-nota">+ ${formatBRL(f.semData)} anunciados sem data de pagamento (${f.qtdSemData}).</p>` : ''}
    <p class="pv-subtitulo">Próximos pagamentos</p>
    ${prox.length ? `<ul class="pv-lista-simples">${prox.map((p) => `
      <li><span class="pv-dot" style="background:var(${COR_CLASSE[p.classe] || '--ink-faint'})"></span><b>${esc(p.ticker)}</b><span class="pv-lista-meta">${dm(p.dataPagamento)} · ${esc(p.tipo)}</span><span class="pv-lista-valor">${formatBRL(p.valor)}</span></li>`).join('')}</ul>`
    : '<p class="pv-vazio">Nenhum pagamento anunciado.</p>'}
    <p class="pv-subtitulo">Data com futura</p>
    ${f.datasComFuturas.length ? `<ul class="pv-lista-simples">${f.datasComFuturas.slice(0, 6).map((p) => `
      <li><span class="pv-dot" style="background:var(${COR_CLASSE[p.classe] || '--ink-faint'})"></span><b>${esc(p.ticker)}</b><span class="pv-lista-meta">tenha até ${dm(p.dataCom)} · paga ${dm(p.dataPagamento)}</span><span class="pv-lista-valor">${valorPorCotaTxt(p)}/cota</span></li>`).join('')}</ul>`
    : '<p class="pv-vazio">Nenhuma data com anunciada à frente.</p>'}`;
}

function renderConsolidado(doc, el, dados, estado, redesenhar, filtrosEl) {
  const periodo = PERIODOS.find((p) => p.id === estado.periodo) || PERIODOS[1];
  const r = resumoConsolidado(dados, { classe: estado.classe, periodoId: periodo.id });
  const hist = historicoMensal(dados, { classe: estado.classe, periodoId: periodo.id, agrupar: estado.agrupar });
  const ranking = rankingPorAtivo(dados, { classe: estado.classe, periodoId: periodo.id });
  const futuro = receitaFutura(dados, { classe: estado.classe });
  el.innerHTML = `
    ${cardsHtml(r, periodo.nome, periodo.id, MESES_LONGOS[Number(dados.hoje.slice(5, 7)) - 1])}
    ${historicoCardHtml(estado)}
    <div class="pv-duas">
      <section class="pv-bloco" aria-labelledby="pvRankTitulo">
        <div class="pv-bloco-cab"><h3 id="pvRankTitulo">Por ativo</h3><span class="pv-dica">toque ou passe o mouse pra ver o detalhe</span></div>
        <div id="pvRanking">${rankingHtml(ranking, estado.rankingTodos)}</div>
      </section>
      <section class="pv-bloco" aria-labelledby="pvFutTitulo">
        <div class="pv-bloco-cab"><h3 id="pvFutTitulo">Receita futura</h3><span class="pv-dica">anunciados</span></div>
        ${futuroHtml(futuro)}
      </section>
    </div>`;

  const corpo = el.querySelector('#pvHistCorpo');
  if (estado.visao === 'tabela') renderHistoricoTabela(corpo, hist);
  else renderHistoricoGrafico(doc, corpo, hist);
  renderLegendaHistorico(el.querySelector('#pvHistLegenda'), hist);

  const CURTO = { ano: 'Ano', '12m': '12m', '24m': '24m', '36m': '36m', inicio: 'Início' };
  filtrosEl.innerHTML = segHtml(PERIODOS.map((p) => ({ id: p.id, html: rotuloDuplo(p.nome, CURTO[p.id]) })), periodo.id, 'periodo', 'Período', ' pv-seg-periodos');
  filtrosEl.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => { estado.periodo = b.getAttribute('data-periodo'); redesenhar(); }));
  el.querySelectorAll('[data-agrupar]').forEach((b) => b.addEventListener('click', () => { estado.agrupar = b.getAttribute('data-agrupar'); redesenhar(); }));
  el.querySelectorAll('[data-visao]').forEach((b) => b.addEventListener('click', () => { estado.visao = b.getAttribute('data-visao'); redesenhar(); }));
  const mais = el.querySelector('[data-acao="ranking"]');
  if (mais) mais.addEventListener('click', () => { estado.rankingTodos = !estado.rankingTodos; redesenhar(); });
  ligarTooltipRanking(doc, el.querySelector('#pvRanking'), ranking);
}

function ligarTooltipRanking(doc, lista, ranking) {
  if (!lista) return;
  const porTicker = Object.fromEntries(ranking.map((a) => [a.ticker, a]));
  let tip = doc.getElementById('pvRankTooltip');
  if (!tip) {
    tip = doc.createElement('div');
    tip.id = 'pvRankTooltip';
    tip.className = 'ativo-tooltip pv-rank-tooltip';
    tip.hidden = true;
    doc.body.appendChild(tip);
  }
  let aberto = null;
  const posicionar = (item) => {
    const r = item.getBoundingClientRect();
    const larg = tip.offsetWidth || 240;
    const alt = tip.offsetHeight || 200;
    const vw = doc.defaultView.innerWidth || 1024;
    const vh = doc.defaultView.innerHeight || 768;
    const left = Math.min(Math.max(8, r.left + 40), vw - larg - 8);
    const top = r.bottom + 6 + alt > vh ? Math.max(8, r.top - alt - 6) : r.bottom + 6;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const abrir = (item) => {
    const a = porTicker[item.getAttribute('data-ticker')];
    if (!a) return;
    tip.innerHTML = detalheAtivoHtml(a);
    tip.hidden = false;
    aberto = item;
    posicionar(item);
  };
  const fechar = () => { tip.hidden = true; aberto = null; };
  lista.querySelectorAll('.pv-rank-item').forEach((item) => {
    item.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') abrir(item); });
    item.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') fechar(); });
    item.addEventListener('click', () => { if (aberto === item) fechar(); else abrir(item); });
    item.addEventListener('focus', () => abrir(item));
    item.addEventListener('blur', fechar);
  });
  if (!doc._pvRankFecharLigado) {
    doc._pvRankFecharLigado = true;
    doc.addEventListener('pointerdown', (ev) => {
      const t = doc.getElementById('pvRankTooltip');
      if (t && !t.hidden && !ev.target.closest('.pv-rank-item')) t.hidden = true;
    });
  }
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

const STATUS_PILL = {
  pago: ['Pago', 'pago'],
  naoLancado: ['Pago · não lançado', 'naolancado'],
  aReceber: ['A receber', 'areceber'],
  semData: ['A definir', 'semdata'],
};

function linhaAgendaHtml(p) {
  const [rotulo, classe] = STATUS_PILL[p.status] || ['—', ''];
  const emDolar = p.moeda === 'USD' && typeof p.liquido === 'number';
  const cotas = typeof p.quantidade === 'number' && p.quantidade > 0 && p.valorPorCota > 0 ? `${qtdTxt(p.quantidade)} × ${valorPorCotaTxt(p)}` : '';
  const meta = [p.tipo, cotas, p.dataCom ? `data com ${dm(p.dataCom)}` : ''].filter(Boolean).map(esc).join(' · ');
  return `
    <tr class="pv-ag-linha">
      <td class="esq pv-ag-ativo"><div class="pv-ag-ativo-in">${logoAtivoHtml(p.ticker)}<span><b><a class="link-ativo" href="${urlAtivoTicker(p.ticker)}">${esc(p.ticker)}</a></b><small><span class="pv-dot" style="background:var(${COR_CLASSE[p.classe] || '--ink-faint'})"></span>${esc(NOME_CLASSE[p.classe] || '')}</small></span></div></td>
      <td class="esq pv-ag-texto pv-ag-det">${esc(p.tipo || '—')}</td>
      <td class="pv-ag-det">${valorPorCotaTxt(p)}</td>
      <td class="pv-ag-det">${qtdTxt(p.quantidade)}</td>
      <td class="pv-ag-det">${p.dataCom ? dma(p.dataCom) : '—'}</td>
      <td class="pv-ag-meta">${meta}</td>
      <td class="pv-ag-pag">${p.dataPagamento ? dma(p.dataPagamento) : 'a definir'}</td>
      <td class="pv-ag-sit"><span class="pv-pill ${classe}">${rotulo}</span></td>
      <td class="pv-ag-total"><b>${formatBRL(p.valor)}</b>${emDolar ? `<small>${usd(p.liquido)}${p.cambio ? ` · câmbio ${formatNumeroBR(p.cambio, 4)}` : ''}</small>` : ''}</td>
    </tr>`;
}

function renderAgenda(doc, el, dados, estado, redesenhar, filtrosEl) {
  const itens = itensAgenda(dados, { classe: estado.classe });
  const anos = anosDaAgenda(itens, dados.hoje);
  if (!anos.includes(estado.ano)) estado.ano = anos[0];
  const cont = contagemPorMes(itens, estado.ano, estado.status);
  if (estado.mes === 'semData' && !cont.semData) estado.mes = null;
  const { itens: lista, total } = filtrarAgenda(itens, { ano: estado.ano, mes: estado.mes, status: estado.status });
  const recebido = lista.filter((p) => p.status === 'pago' || p.status === 'naoLancado').reduce((s, p) => s + p.valor, 0);
  const aReceber = total - recebido;
  const iAno = anos.indexOf(estado.ano);
  const titulo = estado.mes === 'semData' ? 'Sem data de pagamento' : (estado.mes ? `${MESES_LONGOS[estado.mes - 1]} de ${estado.ano}` : `Ano de ${estado.ano}`);
  el.innerHTML = `
    <div class="pv-meses${cont.semData ? ' com-sem-data' : ''}" role="group" aria-label="Mês">
      <button type="button" class="pv-mes${estado.mes == null ? ' active' : ''}" data-mes="">${rotuloDuplo('Ano todo', 'Ano')}<small>${cont.meses.reduce((s, v) => s + v, 0)}</small></button>
      ${MESES_CURTOS.map((m, i) => `<button type="button" class="pv-mes${estado.mes === i + 1 ? ' active' : ''}${cont.meses[i] ? '' : ' vazio'}" data-mes="${i + 1}">${m.charAt(0).toUpperCase() + m.slice(1)}<small>${cont.meses[i]}</small></button>`).join('')}
      ${cont.semData ? `<button type="button" class="pv-mes${estado.mes === 'semData' ? ' active' : ''}" data-mes="semData">${rotuloDuplo('A definir', 'S/ data')}<small>${cont.semData}</small></button>` : ''}
    </div>
    <div class="pv-bloco pv-ag-bloco">
      <div class="pv-ag-resumo">
        <h3>${esc(titulo.charAt(0).toUpperCase() + titulo.slice(1))}</h3>
        <span>${lista.length} provento${lista.length === 1 ? '' : 's'} · <b>${formatBRL(total)}</b>${recebido > 0 && aReceber > 0 ? ` <small>(${formatBRL(recebido)} recebido · ${formatBRL(aReceber)} a receber)</small>` : ''}</span>
      </div>
      ${lista.length ? `
      <div class="pv-tabela-wrap">
        <table class="pv-tabela pv-agenda">
          <thead><tr><th class="esq">Ativo</th><th class="esq">Tipo</th><th>Valor por cota</th><th>Qtd</th><th>Data com</th><th class="pv-ag-meta"></th><th>Pagamento</th><th class="pv-th-centro">Situação</th><th>Total</th></tr></thead>
          <tbody>${lista.map(linhaAgendaHtml).join('')}</tbody>
        </table>
      </div>` : '<p class="pv-vazio">Nenhum provento aqui com esses filtros.</p>'}
    </div>`;
  filtrosEl.innerHTML = `
    <div class="pv-ano" role="group" aria-label="Ano">
      <button type="button" class="pv-ano-btn" data-ano="${anos[iAno + 1] || ''}" ${anos[iAno + 1] ? '' : 'disabled'} aria-label="Ano anterior">‹</button>
      <b>${estado.ano}</b>
      <button type="button" class="pv-ano-btn" data-ano="${anos[iAno - 1] || ''}" ${anos[iAno - 1] ? '' : 'disabled'} aria-label="Próximo ano">›</button>
    </div>
    ${segHtml([{ id: 'todos', html: 'Todos' }, { id: 'realizado', html: 'Realizado' }, { id: 'aRealizar', html: 'A realizar' }], estado.status, 'status', 'Situação', ' pv-seg-status')}`;
  filtrosEl.querySelectorAll('[data-ano]').forEach((b) => b.addEventListener('click', () => { const a = Number(b.getAttribute('data-ano')); if (a) { estado.ano = a; estado.mes = null; redesenhar(); } }));
  filtrosEl.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => { estado.status = b.getAttribute('data-status'); redesenhar(); }));
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => {
    const v = b.getAttribute('data-mes');
    estado.mes = v === '' ? null : (v === 'semData' ? 'semData' : Number(v));
    redesenhar();
  }));
}

// ---------------------------------------------------------------------------
// Importar a planilha da B3
// ---------------------------------------------------------------------------

function carregarSheetJs(doc) {
  const win = doc.defaultView;
  if (win.XLSX) return Promise.resolve(win.XLSX);
  return new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = SHEETJS_URL;
    s.onload = () => (win.XLSX ? resolve(win.XLSX) : reject(new Error('leitor de planilha não carregou')));
    s.onerror = () => reject(new Error('sem conexão pra carregar o leitor de planilha'));
    doc.head.appendChild(s);
  });
}

/** Lê o .xlsx no navegador: a aba "Proventos a Receber" (ou a 1ª) como matriz. */
export async function lerArquivoB3(doc, arquivo, { carregarXlsx = carregarSheetJs } = {}) {
  const XLSX = await carregarXlsx(doc);
  const buffer = await arquivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const nome = wb.SheetNames.find((n) => /provento/i.test(n)) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: '' });
}

function ligarImportacao(doc, token, { importarImpl, carregarXlsx, aoImportar }) {
  const btn = doc.getElementById('pvImportarBtn');
  const input = doc.getElementById('pvImportarArquivo');
  const status = doc.getElementById('pvImportarStatus');
  if (!btn || !input || !status) return;
  const mostrar = (html, tipo = '') => { status.hidden = false; status.className = `pv-importar-status ${tipo}`; status.innerHTML = html; };
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const arquivo = input.files && input.files[0];
    input.value = '';
    if (!arquivo) return;
    mostrar('Lendo a planilha…');
    let linhas;
    try {
      linhas = await lerArquivoB3(doc, arquivo, { carregarXlsx });
    } catch (e) {
      mostrar(`Não consegui ler esse arquivo: ${esc(e.message || e)}.`, 'erro');
      return;
    }
    const previa = previaExportacaoB3(linhas);
    if (!previa.ok) {
      mostrar('Esse arquivo não parece a planilha "Proventos a receber" da B3 (não achei as colunas Produto e Valor líquido).', 'erro');
      return;
    }
    mostrar(`
      <span>Encontrei <b>${previa.itens.length} proventos</b> a receber, somando <b>${formatBRL(previa.total)}</b>. Isso substitui a importação anterior.</span>
      <span class="pv-importar-acoes">
        <button type="button" class="btn btn-primary" data-imp="enviar">Enviar pra planilha</button>
        <button type="button" class="btn btn-ghost" data-imp="cancelar">Cancelar</button>
      </span>`);
    status.querySelector('[data-imp="cancelar"]').addEventListener('click', () => { status.hidden = true; });
    status.querySelector('[data-imp="enviar"]').addEventListener('click', async (ev) => {
      ev.currentTarget.disabled = true;
      mostrar('Enviando…');
      const r = await importarImpl(token, linhas);
      if (!r || !r.ok) { mostrar(`Não deu pra importar: ${esc((r && r.erro) || 'erro desconhecido')}.`, 'erro'); return; }
      mostrar(`Importado: ${r.importados} proventos (${formatBRL(r.total)}).`, 'ok');
      await aoImportar();
    });
  });
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function estadoInicialProventos(dados, prefs = {}) {
  const hoje = (dados && dados.hoje) || new Date().toISOString().slice(0, 10);
  return {
    aba: prefs.aba === 'agenda' ? 'agenda' : 'consolidado',
    classe: ['todas', 'acoes', 'fiis', 'acoesEua'].includes(prefs.classe) ? prefs.classe : 'todas',
    periodo: PERIODOS.some((p) => p.id === prefs.periodo) ? prefs.periodo : '12m',
    agrupar: ['classe', 'tipo', 'ativo'].includes(prefs.agrupar) ? prefs.agrupar : 'classe',
    visao: 'grafico',
    rankingTodos: false,
    ano: Number(hoje.slice(0, 4)),
    mes: Number(hoje.slice(5, 7)),
    status: 'todos',
  };
}

export function desenharProventos(doc, conteudo, dados, estado, { token = null, importarImpl = importarProventosB3, carregarXlsx = carregarSheetJs, aoImportar = async () => {} } = {}) {
  const redesenhar = () => desenharProventos(doc, conteudo, dados, estado, { token, importarImpl, carregarXlsx, aoImportar });
  gravarPrefs(estado);
  conteudo.innerHTML = `${topoHtml(estado, dados)}<div class="pv-painel" id="pvPainel"></div>`;
  conteudo.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { estado.aba = b.getAttribute('data-aba'); redesenhar(); }));
  conteudo.querySelectorAll('[data-classe]').forEach((b) => b.addEventListener('click', () => { estado.classe = b.getAttribute('data-classe'); estado.rankingTodos = false; redesenhar(); }));
  const painel = conteudo.querySelector('#pvPainel');
  const filtrosEl = conteudo.querySelector('#pvFiltrosDir');
  if (estado.aba === 'agenda') renderAgenda(doc, painel, dados, estado, redesenhar, filtrosEl);
  else renderConsolidado(doc, painel, dados, estado, redesenhar, filtrosEl);
  ligarImportacao(doc, token, { importarImpl, carregarXlsx, aoImportar });
}

export async function montarPaginaProventos(token, { doc = document, getProventosImpl = getProventos, importarImpl = importarProventosB3, carregarXlsx = carregarSheetJs } = {}) {
  const loadingEl = doc.getElementById('proventosLoading');
  const erroEl = doc.getElementById('proventosErro');
  const conteudo = doc.getElementById('proventosConteudo');
  const refreshEl = doc.getElementById('refreshControlProventos');
  let estado = null;
  let dadosAtuais = null;

  const desenhar = (dados) => {
    dadosAtuais = dados;
    if (!estado) estado = estadoInicialProventos(dados, lerPrefs());
    loadingEl.hidden = true;
    conteudo.hidden = false; // antes de desenhar: o gráfico mede a largura do cartão
    desenharProventos(doc, conteudo, dados, estado, { token, importarImpl, carregarXlsx, aoImportar: carregar });
  };

  async function carregar() {
    const r = await getProventosImpl(token);
    if (!r || !r.ok) {
      loadingEl.hidden = true;
      if (!dadosAtuais) {
        erroEl.hidden = false;
        erroEl.textContent = `Não deu pra carregar os proventos agora (${(r && r.etapa) || '?'}): ${(r && r.erro) || 'erro desconhecido'}.`;
      }
      return;
    }
    erroEl.hidden = true;
    gravarCacheDados(CHAVE_CACHE, r);
    desenhar(r);
  }

  const cache = await lerCacheDados(CHAVE_CACHE);
  if (cache) desenhar(cache.dados);
  await carregar();
  mountRefreshControl(doc, refreshEl, carregar).marcarAtualizado();

  // o gráfico usa a largura real do cartão: redesenha quando a tela muda de tamanho
  const win = doc.defaultView;
  if (win && typeof win.addEventListener === 'function') {
    let t = null;
    let larguraAntes = win.innerWidth;
    win.addEventListener('resize', () => {
      if (win.innerWidth === larguraAntes) return;
      larguraAntes = win.innerWidth;
      clearTimeout(t);
      t = setTimeout(() => { if (dadosAtuais && estado) desenharProventos(doc, conteudo, dadosAtuais, estado, { token, importarImpl, carregarXlsx, aoImportar: carregar }); }, 150);
    });
  }
}

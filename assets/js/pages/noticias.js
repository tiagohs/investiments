// assets/js/pages/noticias.js
//
// 30/10/2026: tela de Notícias (menu principal, depois de Metas) - docs/noticias.md, design no canvas "Tela de Notícias".
// Tudo vem do Worker do Cloudflare (o cron publica as notícias e os vídeos; o gráfico do dia e as cotações vêm do
// Yahoo pelo /v1/intradia; carteira e proventos são as telas que o Apps Script já publica). Nenhuma leitura espera o
// Apps Script. Cada parte desenha quando os dados dela chegam; uma fonte fora do ar esconde só a sua parte (RNF-05).
// As contas (fatores, agenda, feed) moram em noticias-calc.js; aqui só desenha e liga os cliques.
import { forcarNoticias, pedirNoticiasGoogleAgora } from '../noticias-agora.js';
import { getNoticiasMercado, getNoticiasVideos, getNoticiasAtivos, getNoticiasAgenda, getIntradia, getCarteirasAcoes, getCarteirasFiis, getCarteirasAcoesEua, getCarteirasRendaFixa, getProventos } from '../api-client.js';
import { formatBRL, formatUSD, formatNumeroBR, formatPctSinal, formatDM, hojeSP } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { montarCabecalhoPagina } from '../ui/index.js';
import { criarSparkline, garantirEstilosCharts } from '../charts/index.js';
import { valoresIntradia } from './inicio-intradia.js';
import { talvezNoPregao } from '../leitura-chave.js';
import { esc, escAttr } from '../util/html.js';
import { urlAtivoTicker } from '../link-ativo.js';
import {
  INDICES, TERMOMETRO, CLASSES_NOTICIAS, recentes, DIAS_NOTICIA, DIAS_VIDEO, resumoDaSerie, variacaoDoTermometro, possiveisFatores, agenda,
  ativosComNoticias, feedDosAtivos, haQuanto,
} from './noticias-calc.js';

const SECAO = 'Notícias';
const CHAVE_PREFS = 'noticias.prefs.v1';
const ABAS_VIDEOS = [{ id: 'noticias', nome: 'Notícias' }, { id: 'especialistas', nome: 'Especialistas' }, { id: 'meus', nome: 'Meus canais' }];
const INTERVALO_MS = 2 * 60 * 1000; // RF-08: no pregão, a cada 2 min com a tela à vista
const INDICE_DA_CLASSE = { acoes: 'IBOV', fiis: 'IFIX', acoesEua: 'SPX' };
// 30/10/2026 (Tiago: "mostrar as 10 últimas notícias, com uma opção ver mais"): listas com 10 e "Ver mais" (+10, na própria tela)
export const POR_PAGINA = 10;

const pct = (f) => formatPctSinal(f, 2);
const pp = (f) => `${formatNumeroBR(Math.abs(f * 100), 1)} p.p.`;
const fmtValor = (v, moeda) => (moeda === 'USD' ? formatUSD(v) : formatBRL(v));
const tom = (v) => (typeof v === 'number' && v > 0 ? 'sobe' : typeof v === 'number' && v < 0 ? 'cai' : 'neutro');
const ic = (nome) => `<svg class="ico" aria-hidden="true"><use href="#ico-${nome}"/></svg>`;
/** Só links http(s) da fonte; o resto vira '#'. */
export function linkSeguro(u) { return /^https?:\/\//i.test(String(u || '')) ? String(u) : '#'; }
const linkExterno = (u, conteudo, classe = '') => `<a class="${classe}" href="${escAttr(linkSeguro(u))}" target="_blank" rel="noopener noreferrer">${conteudo}</a>`;

function lerPrefs() { try { return JSON.parse(globalThis.localStorage.getItem(CHAVE_PREFS) || '{}') || {}; } catch (e) { return {}; } }
function gravarPrefs(e) { try { globalThis.localStorage.setItem(CHAVE_PREFS, JSON.stringify({ indice: e.indice, aba: e.aba, agenda: e.agenda, ordem: e.ordem })); } catch (err) { /* conveniência */ } }

function valorDoIndice(ind, valor) {
  if (typeof valor !== 'number') return '—';
  return ind.unidade === 'brl' ? `R$ ${formatNumeroBR(valor, 4)}` : `${formatNumeroBR(valor, 0)} pts`;
}
function valorDoTermometro(item, valor) {
  if (typeof valor !== 'number') return '—';
  if (item.unidade === 'taxa') return `${formatNumeroBR(valor, 2)}%`;
  return `US$ ${formatNumeroBR(valor, valor >= 1000 ? 0 : 2)}`;
}

const ESQUELETO = `
  <section class="card nt-mercado" aria-labelledby="ntTituloMercado">
    <div class="nt-mercado-topo">
      <div class="nt-rotulos"><span class="nt-eyebrow">Mercado hoje</span><span class="chip-tonal" id="ntPregao"></span></div>
      <div class="nt-indices" role="tablist" aria-label="Índice" id="ntIndices"></div>
    </div>
    <div class="nt-mercado-grade">
      <div class="nt-mercado-principal">
        <span class="nt-editoria" id="ntEditoria"></span>
        <h2 class="nt-manchete" id="ntTituloMercado"><span class="skel nt-skel-titulo"></span></h2>
        <div class="nt-valor-linha" id="ntValor"></div>
        <figure class="nt-grafico"><div id="ntGrafico" class="nt-grafico-area"></div><figcaption id="ntGraficoLegenda"></figcaption></figure>
        <div class="nt-ohlc" id="ntOhlc"></div>
        <ul class="nt-resumo" id="ntResumo" hidden></ul>
      </div>
      <div class="nt-tempo-real">
        <div class="nt-tr-cab"><h3><span class="nt-ponto-vivo" aria-hidden="true"></span>Tempo real</h3><span class="nt-fonte" id="ntFonteTr"></span></div>
        <ol class="nt-tr-lista" id="ntTempoReal"><li class="skel nt-skel-linha"></li><li class="skel nt-skel-linha"></li><li class="skel nt-skel-linha"></li></ol>
        <p class="nt-aviso" id="ntAvisoMercado" hidden></p>
      </div>
    </div>
  </section>
  <section class="card nt-termo" aria-labelledby="ntTituloTermo">
    <h2 id="ntTituloTermo">O que mexe com a bolsa</h2>
    <div class="nt-termo-lista" id="ntTermo"></div>
  </section>
  <section class="nt-videos" aria-labelledby="ntTituloVideos">
    <div class="nt-sec-cab">
      <div class="nt-sec-titulo"><h2 id="ntTituloVideos">Vídeos</h2><div class="nt-seg" role="tablist" aria-label="Canais" id="ntAbasVideo"></div></div>
      <div class="nt-paginas">
        <span class="nt-pagina-texto" id="ntPaginaTexto"></span>
        <button type="button" class="icon-btn nt-seta" id="ntVoltar" aria-label="Vídeos anteriores">${ic('chevron-left')}</button>
        <button type="button" class="icon-btn nt-seta" id="ntAvancar" aria-label="Próximos vídeos">${ic('chevron-right')}</button>
      </div>
    </div>
    <div class="nt-trilho" id="ntTrilho" tabindex="0" aria-label="Lista de vídeos (role para o lado)"></div>
    <p class="nt-aviso" id="ntAvisoVideos" hidden></p>
  </section>
  <section class="nt-manchetes" aria-labelledby="ntTituloSecao">
    <h2 id="ntTituloSecao" class="nt-sec-h2">Economia e mercado</h2>
    <div class="card nt-principal" id="ntPrincipal"><span class="skel nt-skel-titulo"></span></div>
    <div class="card nt-recentes"><h3>Mais recentes</h3><div id="ntRecentes"></div><button type="button" class="btn btn-text nt-ver-mais" id="ntRecentesMais" hidden>Ver mais</button></div>
    <aside class="card nt-agenda" aria-labelledby="ntTituloAgenda">
      <div class="nt-agenda-cab"><h3 id="ntTituloAgenda">Agenda</h3><div class="nt-seg nt-seg-p" role="tablist" aria-label="Período" id="ntAbasAgenda"></div></div>
      <div id="ntAgenda"><span class="skel nt-skel-linha"></span></div>
    </aside>
  </section>
  <section class="nt-ativos" aria-labelledby="ntTituloAtivos">
    <div class="nt-sec-cab">
      <h2 id="ntTituloAtivos">Notícias dos seus ativos</h2>
      <label class="nt-ordem" for="ntOrdem">Ordenar
        <select id="ntOrdem"><option value="recentes">Mais recentes</option><option value="posicao">Maior posição primeiro</option><option value="variacao">Maior variação hoje</option></select>
      </label>
    </div>
    <div class="nt-chips" role="group" aria-label="Classe" id="ntClasses"></div>
    <div class="nt-chips nt-tickers" role="group" aria-label="Ativo" id="ntTickers"></div>
    <div class="card nt-fatores" id="ntFatores" hidden></div>
    <div class="card nt-feed" id="ntFeed" hidden></div>
    <button type="button" class="btn btn-tonal nt-ver-mais" id="ntFeedMais" hidden>Ver mais notícias</button>
    <p class="nt-vazio" id="ntFeedVazio" hidden></p>
  </section>`;

/**
 * Monta a tela. `apis` troca as leituras nos testes. Devolve { estado, carregar }.
 */
export async function montarPaginaNoticias(token, { doc = document, apis = {}, agora = () => Date.now() } = {}) {
  const api = { getNoticiasMercado, getNoticiasVideos, getNoticiasAtivos, getNoticiasAgenda, forcarNoticias, pedirNoticiasGoogleAgora, getIntradia, getCarteirasAcoes, getCarteirasFiis, getCarteirasAcoesEua, getCarteirasRendaFixa, getProventos, ...apis };
  garantirEstilosCharts(doc);
  const prefs = lerPrefs();
  const estado = {
    indice: INDICES.some((i) => i.id === prefs.indice) ? prefs.indice : 'ibov',
    aba: ABAS_VIDEOS.some((a) => a.id === prefs.aba) ? prefs.aba : 'noticias',
    agenda: prefs.agenda === 'semana' ? 'semana' : 'hoje',
    ordem: ['recentes', 'posicao', 'variacao'].includes(prefs.ordem) ? prefs.ordem : 'recentes',
    classe: 'todos', ticker: null, verRecentes: POR_PAGINA, verFeed: POR_PAGINA,
    mercado: {}, videos: {}, series: {}, carteira: [], noticiasAtivos: {}, proventos: [], proventosLidos: false, vencimentos: [], eventosIbge: [],
    ultimaCarga: 0,
  };

  const cabEl = doc.getElementById('ntCabecalho');
  const conteudo = doc.getElementById('ntConteudo');
  const cab = montarCabecalhoPagina(cabEl, { secao: SECAO, titulo: 'Notícias', subtitulo: 'O mercado de hoje, o que saiu sobre os seus ativos e os vídeos dos canais que você acompanha.', refresh: true, doc });
  conteudo.innerHTML = ESQUELETO;
  const $ = (id) => doc.getElementById(id);
  $('ntOrdem').value = estado.ordem;

  // ---- abas fixas ----
  function segmentado(el, itens, ativo, aoMudar) {
    el.innerHTML = itens.map((i) => `<button type="button" role="tab" class="nt-seg-btn" data-id="${escAttr(i.id)}" aria-selected="${i.id === ativo}" tabindex="${i.id === ativo ? 0 : -1}">${esc(i.nome)}</button>`).join('');
    el.onclick = (ev) => { const b = ev.target.closest('[data-id]'); if (b) aoMudar(b.dataset.id); };
    el.onkeydown = (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const ids = itens.map((i) => i.id); const atual = ids.indexOf(el.querySelector('[aria-selected="true"]').dataset.id);
      const prox = ids[(atual + (ev.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      aoMudar(prox); const b = el.querySelector(`[data-id="${prox}"]`); if (b) b.focus();
    };
  }
  const marcar = (el, id) => el.querySelectorAll('[data-id]').forEach((b) => { const on = b.dataset.id === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });

  function desenharAbasIndice() {
    const el = $('ntIndices');
    el.innerHTML = INDICES.map((ind) => {
      const r = resumoDaSerie(estado.series[ind.chave]);
      const v = r ? r.variacao : null;
      return `<button type="button" role="tab" class="nt-indice-btn" data-id="${ind.id}" aria-selected="${ind.id === estado.indice}" tabindex="${ind.id === estado.indice ? 0 : -1}"><span>${esc(ind.curto)}</span><span class="nt-var nt-${tom(v)}">${v == null ? '' : esc(pct(v))}</span></button>`;
    }).join('');
    el.onclick = (ev) => { const b = ev.target.closest('[data-id]'); if (b) trocarIndice(b.dataset.id); };
    el.onkeydown = (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const i = INDICES.findIndex((x) => x.id === estado.indice);
      const prox = INDICES[(i + (ev.key === 'ArrowRight' ? 1 : INDICES.length - 1)) % INDICES.length].id;
      trocarIndice(prox); const b = el.querySelector(`[data-id="${prox}"]`); if (b) b.focus();
    };
  }
  function trocarIndice(id) {
    if (id === estado.indice) return;
    estado.indice = id; gravarPrefs(estado);
    // o IFIX filtra os FIIs e o Exterior os EUA (RF-07); o Ibovespa mostra tudo
    const ind = INDICES.find((i) => i.id === id);
    if (id !== 'dolar') { estado.classe = ind.classe || 'todos'; estado.ticker = null; estado.verFeed = POR_PAGINA; }
    estado.verRecentes = POR_PAGINA;
    desenharAbasIndice(); desenharMercado(); desenharAtivos();
    if (!estado.mercado[id]) carregarMercado(id).then(desenharMercado);
  }
  segmentado($('ntAbasVideo'), ABAS_VIDEOS, estado.aba, (id) => { estado.aba = id; gravarPrefs(estado); marcar($('ntAbasVideo'), id); desenharVideos(); if (!estado.videos[id]) carregarVideos(id).then(desenharVideos); });
  segmentado($('ntAbasAgenda'), [{ id: 'hoje', nome: 'Hoje' }, { id: 'semana', nome: 'Semana' }], estado.agenda, (id) => { estado.agenda = id; gravarPrefs(estado); marcar($('ntAbasAgenda'), id); desenharAgenda(); });
  $('ntOrdem').addEventListener('change', () => { estado.ordem = $('ntOrdem').value; estado.verFeed = POR_PAGINA; gravarPrefs(estado); desenharAtivos(); });
  $('ntClasses').addEventListener('click', (ev) => { const b = ev.target.closest('[data-classe]'); if (!b) return; estado.classe = b.dataset.classe; estado.ticker = null; estado.verFeed = POR_PAGINA; desenharAtivos(); });
  // tocar de novo no ativo escolhido tira a escolha e volta para "Todos" (Tiago, 30/10/2026)
  $('ntTickers').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ticker]'); if (!b) return;
    if (estado.ticker === b.dataset.ticker) { estado.ticker = null; estado.classe = 'todos'; } else estado.ticker = b.dataset.ticker;
    estado.verFeed = POR_PAGINA;
    desenharAtivos();
  });
  $('ntRecentesMais').addEventListener('click', () => { estado.verRecentes += POR_PAGINA; desenharManchetes(estado.mercado[estado.indice]); });
  $('ntFeedMais').addEventListener('click', () => { estado.verFeed += POR_PAGINA; desenharAtivos(); });

  // ---- 1. Mercado hoje ----
  function desenharMercado() {
    const ind = INDICES.find((i) => i.id === estado.indice);
    const m = estado.mercado[ind.id];
    const r = resumoDaSerie(estado.series[ind.chave]);
    $('ntPregao').textContent = talvezNoPregao(agora()) ? 'Pregão aberto' : 'Pregão fechado';
    $('ntPregao').classList.toggle('chip-good', talvezNoPregao(agora()));
    $('ntEditoria').textContent = ind.editoria;
    $('ntTituloSecao').textContent = ind.secao;
    if (m && m.ok) {
      $('ntTituloMercado').innerHTML = m.manchete ? linkExterno(m.manchete.link, esc(m.manchete.titulo), 'nt-manchete-link') : esc(`${ind.nome} hoje`);
      const resumo = (m.manchete && ind.id === 'ibov' && m.manchete.resumo) || [];
      $('ntResumo').innerHTML = resumo.map((t) => `<li>${esc(t)}</li>`).join('');
      $('ntResumo').hidden = !resumo.length;
      $('ntFonteTr').textContent = `${m.fonteTempoReal || ''}${m.fonteTempoReal ? ' · ' : ''}a cada 5 min`;
      $('ntTempoReal').innerHTML = (m.tempoReal || []).length
        ? m.tempoReal.map((n) => `<li><span class="nt-hora">${esc(n.hora)}</span>${linkExterno(n.link, esc(n.titulo), 'nt-tr-titulo')}</li>`).join('')
        : '<li class="nt-vazio-linha">Sem atualizações por enquanto.</li>';
      const avisos = (m.avisos || []).concat(m._velha ? ['Sem conexão com o servidor de notícias: mostrando a última leitura.'] : []);
      $('ntAvisoMercado').textContent = avisos.join(' ');
      $('ntAvisoMercado').hidden = !avisos.length;
      desenharManchetes(m);
    } else if (m) {
      $('ntTituloMercado').textContent = `${ind.nome} hoje`;
      $('ntTempoReal').innerHTML = '<li class="nt-vazio-linha">Tempo real indisponível agora.</li>';
      $('ntAvisoMercado').hidden = true;
      desenharManchetes(null);
    }
    $('ntValor').innerHTML = r
      ? `<span class="nt-valor-nome">${esc(ind.nome)}</span><span class="nt-valor">${esc(valorDoIndice(ind, r.valor))}</span><span class="chip-tonal nt-var-chip ${r.variacao > 0 ? 'chip-good' : r.variacao < 0 ? 'chip-bad' : ''}">${esc(pct(r.variacao))}</span>`
      : `<span class="nt-valor-nome">${esc(ind.nome)}</span><span class="skel nt-skel-valor"></span>`;
    const area = $('ntGrafico');
    const v = valoresIntradia(estado.series[ind.chave]);
    if (v) {
      const dados = { valores: v.valores, referencia: v.referencia, aria: `${ind.nome} durante o dia, comparado ao fechamento de ontem` };
      if (area._spark) area._spark.atualizar(dados); else { area.textContent = ''; area._spark = criarSparkline(area, { altura: 180, area: true, pontoFinal: true, hover: true, margem: 6, ...dados }); }
      const hoje = hojeSP(new Date(agora()));
      $('ntGraficoLegenda').textContent = r && r.dia && r.dia !== hoje ? `Pregão de ${formatDM(r.dia)} · linha de base = fechamento anterior` : 'Hoje · linha de base = fechamento de ontem';
    } else if (estado.series[ind.chave] === null) {
      if (area._spark) { area._spark.destruir(); area._spark = null; }
      area.innerHTML = '<p class="nt-vazio-linha">Gráfico do dia indisponível agora.</p>';
      $('ntGraficoLegenda').textContent = '';
    }
    $('ntOhlc').innerHTML = r ? [['Abertura', r.abertura], ['Máxima', r.maxima], ['Mínima', r.minima]].map(([n, x]) => `<span>${n} <b>${esc(valorDoIndice(ind, x).replace(' pts', ''))}</b></span>`).join('') : '';
  }

  function desenharTermometro() {
    $('ntTermo').innerHTML = TERMOMETRO.map((item) => {
      const r = variacaoDoTermometro(item, estado.series[item.chave]);
      if (!r) return estado.series[item.chave] === undefined ? `<span class="nt-termo-item"><span>${esc(item.nome)}</span><span class="skel nt-skel-mini"></span></span>` : '';
      const varTxt = item.unidade === 'taxa' ? (r.pp == null ? '' : `${r.pp > 0 ? '+' : r.pp < 0 ? '−' : ''}${formatNumeroBR(Math.abs(r.pp), 2)} p.p.`) : pct(r.variacao);
      const t = tom(item.unidade === 'taxa' ? r.pp : r.variacao);
      return `<span class="nt-termo-item"><span>${esc(item.nome)}</span><b>${esc(valorDoTermometro(item, r.valor))}</b><span class="nt-var nt-${t}">${esc(varTxt)}</span></span>`;
    }).join('') || '<span class="nt-vazio-linha">Cotações indisponíveis agora.</span>';
  }

  // ---- 2. Vídeos ----
  function desenharVideos() {
    const t = estado.videos[estado.aba];
    const trilho = $('ntTrilho');
    if (!t) { trilho.innerHTML = '<span class="skel nt-skel-video"></span>'.repeat(4); return; }
    const lista = t.ok ? recentes(t.videos, 'publicado', DIAS_VIDEO, agora()) : [];
    trilho.innerHTML = lista.length ? lista.map((v) => `
      <article class="nt-video" data-video="${escAttr(v.id)}">
        <button type="button" class="nt-video-capa" aria-label="Assistir: ${escAttr(v.titulo)}">
          <img src="https://i.ytimg.com/vi/${escAttr(v.id)}/mqdefault.jpg" alt="" loading="lazy" decoding="async" width="320" height="180">
          <span class="nt-play" aria-hidden="true">${ic('play-arrow')}</span>
          <span class="nt-selo">${esc(v.canal || '')}</span>
        </button>
        <a class="nt-video-titulo" href="https://www.youtube.com/watch?v=${escAttr(v.id)}" target="_blank" rel="noopener noreferrer">${esc(v.titulo)}</a>
        <span class="nt-meta">${esc(v.canal || '')} · ${esc(haQuanto(v.publicado, agora(), formatDM))}</span>
      </article>`).join('') : `<p class="nt-vazio-linha">${t.ok ? 'Nenhum vídeo desta aba ainda. Os canais ficam na aba aux_videos-canais da planilha.' : 'Vídeos indisponíveis agora.'}</p>`;
    const avisos = (t.avisos || []).concat(t._velha ? ['Mostrando a última leitura.'] : []);
    $('ntAvisoVideos').textContent = avisos.join(' ');
    $('ntAvisoVideos').hidden = !avisos.length;
    trilho.scrollLeft = 0;
    atualizarPaginaVideos();
  }
  function atualizarPaginaVideos() {
    const trilho = $('ntTrilho');
    const cards = trilho.querySelectorAll('.nt-video');
    if (!cards.length) { $('ntPaginaTexto').textContent = ''; return; }
    const larg = cards[0].getBoundingClientRect().width || 1;
    const porPagina = Math.max(1, Math.round((trilho.clientWidth || larg) / larg));
    const primeiro = Math.min(cards.length, Math.round((trilho.scrollLeft || 0) / larg) + 1);
    $('ntPaginaTexto').textContent = `${primeiro}–${Math.min(cards.length, primeiro + porPagina - 1)} de ${cards.length}`;
  }
  const rolar = (dir) => { const t = $('ntTrilho'); if (typeof t.scrollBy === 'function') t.scrollBy({ left: dir * (t.clientWidth || 600), behavior: 'smooth' }); };
  $('ntVoltar').addEventListener('click', () => rolar(-1));
  $('ntAvancar').addEventListener('click', () => rolar(1));
  $('ntTrilho').addEventListener('scroll', () => atualizarPaginaVideos(), { passive: true });
  // o player só carrega ao clicar (RNF-04): troca a capa pelo iframe do youtube-nocookie
  $('ntTrilho').addEventListener('click', (ev) => {
    const capa = ev.target.closest('.nt-video-capa');
    if (!capa) return;
    const id = capa.closest('[data-video]').dataset.video;
    if (!/^[\w-]{6,20}$/.test(id)) return;
    const quadro = doc.createElement('iframe');
    quadro.className = 'nt-video-player';
    quadro.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    quadro.title = capa.getAttribute('aria-label') || 'Vídeo';
    quadro.allow = 'autoplay; encrypted-media; picture-in-picture';
    quadro.setAttribute('allowfullscreen', '');
    capa.replaceWith(quadro);
  });

  // ---- 3. Manchetes + agenda ----
  function desenharManchetes(m) {
    const agoraMs = agora();
    const frescas = m && m.ok ? recentes(m.noticias, 'data', DIAS_NOTICIA, agoraMs) : [];
    const p = frescas.length ? (m.indice === 'ibov' ? frescas[0] : m.manchete) : null;
    $('ntPrincipal').innerHTML = p
      ? `<span class="nt-editoria">${esc(INDICES.find((i) => i.id === estado.indice).editoria)}</span>${linkExterno(p.link, esc(p.titulo), 'nt-principal-titulo')}${p.resumo && (Array.isArray(p.resumo) ? p.resumo.length : p.resumo) ? `<p>${esc(Array.isArray(p.resumo) ? p.resumo[0] : p.resumo)}</p>` : ''}<span class="nt-meta">${esc(p.fonte || '')}${p.data ? ` · ${esc(haQuanto(p.data, agoraMs, formatDM))}` : ''}</span>`
      : '<p class="nt-vazio-linha">Manchetes indisponíveis agora.</p>';
    const todas = frescas.filter((n) => !p || n.titulo !== p.titulo);
    const resto = todas.slice(0, estado.verRecentes);
    $('ntRecentesMais').hidden = todas.length <= resto.length;
    $('ntRecentesMais').textContent = `Ver mais (${todas.length - resto.length})`;
    $('ntRecentes').innerHTML = resto.map((n) => `<a class="nt-recente" href="${escAttr(linkSeguro(n.link))}" target="_blank" rel="noopener noreferrer"><span class="nt-hora">${esc(haQuanto(n.data, agoraMs, formatDM))}</span><span><span class="nt-recente-titulo">${esc(n.titulo)}</span><span class="nt-meta">${esc(n.fonte || '')}</span></span></a>`).join('') || '<p class="nt-vazio-linha">Nada por enquanto.</p>';
  }
  function desenharAgenda() {
    const grupos = agenda({ proventos: estado.proventos, vencimentos: estado.vencimentos, extras: estado.eventosIbge, hojeISO: hojeSP(new Date(agora())), periodo: estado.agenda, fmtDM: (d) => formatDM(d), fmtValor });
    $('ntAgenda').innerHTML = grupos.length ? grupos.map((g) => `<div class="nt-agenda-grupo"><span class="nt-agenda-dia">${esc(g.grupo)}</span>${g.itens.map((e) => `<div class="nt-agenda-item"><span class="nt-hora">${esc(e.quando)}</span><span><span class="nt-agenda-titulo">${esc(e.titulo)}</span><span class="nt-tag nt-tag-${escAttr(e.tag)}">${esc(e.detalhe)}</span></span></div>`).join('')}</div>`).join('')
      : `<p class="nt-vazio-linha">${estado.proventosLidos ? `Nada marcado para ${estado.agenda === 'hoje' ? 'hoje' : 'esta semana'}.` : 'Carregando…'}</p>`;
  }

  // ---- 4. Notícias dos ativos + possíveis fatores ----
  function desenharAtivos() {
    const ativos = ativosComNoticias(estado.carteira, estado.noticiasAtivos, agora());
    $('ntClasses').innerHTML = CLASSES_NOTICIAS.map((c) => `<button type="button" class="chip" data-classe="${c.id}" aria-pressed="${estado.classe === c.id}">${esc(c.nome)}</button>`).join('');
    const daClasse = ativos.filter((a) => estado.classe === 'todos' || a.classe === estado.classe);
    $('ntTickers').innerHTML = daClasse.map((a) => `<button type="button" class="chip nt-ticker" data-ticker="${escAttr(a.ticker)}" aria-pressed="${estado.ticker === a.ticker}"><span>${esc(a.ticker)}</span><span class="nt-var nt-${tom(a.variacaoDia)}">${typeof a.variacaoDia === 'number' ? esc(pct(a.variacaoDia)) : ''}</span>${a.noticias.length ? `<span class="nt-conta" aria-label="${a.noticias.length} notícias">${a.noticias.length}</span>` : ''}</button>`).join('');
    desenharFatores(ativos);
    const tudo = feedDosAtivos(ativos, { classe: estado.classe, ticker: estado.ticker, ordem: estado.ordem, max: 1000 });
    const feed = tudo.slice(0, estado.verFeed);
    const agoraMs = agora();
    // lista (uma notícia por linha, como "Mais recentes"): o ativo, o título, a fonte e há quanto tempo
    $('ntFeed').innerHTML = feed.map((n) => `<a class="nt-noticia" href="${escAttr(linkSeguro(n.link))}" target="_blank" rel="noopener noreferrer"><span class="chip-tonal nt-classe-${escAttr(n.classe)}">${esc(n.ticker)}</span><span class="nt-noticia-corpo"><span class="nt-noticia-titulo">${esc(n.titulo)}</span><span class="nt-meta">${esc(n.fonte || '')}${n.data ? ` · ${esc(haQuanto(n.data, agoraMs, formatDM))}` : ''}</span></span></a>`).join('');
    $('ntFeed').hidden = !feed.length;
    $('ntFeedMais').hidden = tudo.length <= feed.length;
    $('ntFeedMais').textContent = `Ver mais notícias (${tudo.length - feed.length})`;
    const vazio = $('ntFeedVazio');
    vazio.hidden = feed.length > 0 || !estado.carteiraLida;
    vazio.textContent = estado.ticker ? `Nada novo sobre ${estado.ticker} nos últimos 3 dias.` : 'Ainda sem notícias dos ativos: elas chegam com a próxima publicação das cotações (a cada 30 min no pregão).';
  }
  function desenharFatores(ativos) {
    const el = $('ntFatores');
    const a = estado.ticker && ativos.find((x) => x.ticker === estado.ticker);
    if (!a) { el.hidden = true; el.innerHTML = ''; return; }
    const chaveIndice = INDICE_DA_CLASSE[a.classe] || 'IBOV';
    const rIndice = resumoDaSerie(estado.series[chaveIndice]);
    const termometro = {};
    TERMOMETRO.forEach((t) => { const r = resumoDaSerie(estado.series[t.chave]); if (r) termometro[t.chave] = { ...r, nome: t.nome }; });
    const rDolar = resumoDaSerie(estado.series.USD);
    const f = possiveisFatores({
      ativo: a,
      indice: rIndice ? { nome: INDICES.find((i) => i.chave === chaveIndice).nome, variacao: rIndice.variacao } : null,
      termometro, dolar: rDolar ? rDolar.variacao : null, proventos: estado.proventos, noticias: a.noticias,
      hojeISO: hojeSP(new Date(agora())), agoraMs: agora(), fmt: { pct, pp, brl: (v) => fmtValor(v, a.classe === 'acoesEua' ? 'USD' : 'BRL') },
    });
    el.hidden = false;
    if (!f) { el.innerHTML = `<p class="nt-vazio-linha">Sem a variação de hoje de ${esc(a.ticker)} para calcular os fatores.</p>`; return; }
    el.innerHTML = `
      <div class="nt-fatores-resumo">
        <span class="nt-eyebrow nt-eyebrow-neutro">Possíveis fatores hoje</span>
        <a class="nt-fatores-ticker" href="${escAttr(urlAtivoTicker(a.ticker))}">${esc(a.ticker)} <span class="nt-var nt-${tom(a.variacaoDia)}">${esc(pct(a.variacaoDia))}</span></a>
        <p>${esc(f.resumo)}</p>
        <p class="nt-meta">Fatores calculados pelos números do dia e pelas notícias. Não é recomendação nem certeza de causa.</p>
      </div>
      <ol class="nt-fatores-lista">${f.itens.map((x) => `<li><span class="nt-sinal nt-sinal-${x.sinal === '+' ? 'sobe' : x.sinal === '−' ? 'cai' : 'neutro'}" aria-label="${x.sinal === '+' ? 'a favor da alta' : x.sinal === '−' ? 'a favor da queda' : 'neutro'}">${esc(x.sinal)}</span><span><span class="nt-fator-titulo">${x.link ? linkExterno(x.link, esc(x.titulo)) : esc(x.titulo)}</span><span class="nt-meta">${esc(x.detalhe)}</span></span><span class="nt-peso nt-peso-${x.peso === 'médio' ? 'medio' : x.peso}">${esc(x.peso)}</span></li>`).join('')}</ol>`;
  }

  // ---- leituras ----
  async function carregarMercado(id) {
    let r; try { r = await api.getNoticiasMercado(token, id); } catch (e) { r = { ok: false }; }
    estado.mercado[id] = r || { ok: false };
    return estado.mercado[id];
  }
  async function carregarVideos(aba) {
    let r; try { r = await api.getNoticiasVideos(token, aba); } catch (e) { r = { ok: false }; }
    estado.videos[aba] = r || { ok: false };
    return estado.videos[aba];
  }
  async function carregarSeries() {
    const chaves = [...INDICES.map((i) => i.chave), ...TERMOMETRO.map((t) => t.chave)];
    let r; try { r = await api.getIntradia(token, chaves); } catch (e) { r = null; }
    const res = (r && r.ok && r.resultado) || {};
    chaves.forEach((c) => { estado.series[c] = c in res ? res[c] : null; });
    return !!(r && r.ok);
  }
  async function carregarCarteira() {
    const classes = [['acoes', api.getCarteirasAcoes], ['fiis', api.getCarteirasFiis], ['acoesEua', api.getCarteirasAcoesEua]];
    const rs = await Promise.all(classes.map(([, fn]) => fn(token).catch(() => null)));
    const carteira = [];
    rs.forEach((r, i) => { ((r && r.ok && r.carteira && r.carteira.ativos) || []).forEach((a) => { if (a && a.ticker && Number(a.quantidade) > 0) carteira.push({ ...a, ticker: String(a.ticker).toUpperCase(), classe: classes[i][0] }); }); });
    if (carteira.length || !estado.carteira.length) estado.carteira = carteira;
    estado.carteiraLida = true;
  }
  async function carregarNoticiasAtivos() {
    let r; try { r = await api.getNoticiasAtivos(token); } catch (e) { r = null; }
    if (r && r.ok) estado.noticiasAtivos = r.ativos || {};
  }
  async function carregarProventos() {
    let r; try { r = await api.getProventos(token); } catch (e) { r = null; }
    if (r && r.ok) estado.proventos = [...(r.aReceber || []), ...(r.recebidos || []).map((p) => ({ ...p, dataPagamento: p.dataPagamento || p.data }))];
    estado.proventosLidos = true;
  }
  async function carregarAgendaExterna() {
    const [ibge, rf] = await Promise.all([api.getNoticiasAgenda(token).catch(() => null), api.getCarteirasRendaFixa(token).catch(() => null)]);
    if (ibge && ibge.ok) estado.eventosIbge = ibge.eventos || [];
    const titulos = (rf && rf.ok && ((rf.carteira && rf.carteira.ativos) || rf.ativos)) || [];
    if (rf && rf.ok) estado.vencimentos = titulos.filter((t) => t && t.vencimentoData).map((t) => ({ nome: t.nomePersonalizado || t.tipoInvestimento || 'Renda fixa', dia: t.vencimentoData, valor: t.totalAtualizado }));
  }

  async function carregar() {
    const forcar = estado.forcar;
    estado.forcar = false;
    // RF-08: o relógio de 2 min não busca com a aba escondida (o botão sempre busca)
    if (!forcar && doc.visibilityState === 'hidden' && agora() - estado.ultimaCarga < 10 * 60 * 1000) return true;
    estado.ultimaCarga = agora();
    // 30/10/2026 (Tiago: "os vídeos mudam rápido"): clique no "Atualizar" = buscar nas fontes, não só ler o que o cron guardou.
    //  1. o Worker busca agora o tempo real e todos os canais da aba aberta (~1-3 s), e a tela lê em seguida;
    //  2. em segundo plano, o Apps Script busca o Google de novo (manchetes e notícias dos ativos, 1 a cada 5 min) e,
    //     quando publicar, o Worker junta e a tela redesenha essas partes.
    if (forcar) {
      await api.forcarNoticias(token, { aba: estado.aba });
      estado.googleAgora = Promise.resolve(api.pedirNoticiasGoogleAgora(token)).then(async (g) => {
        const pub = g && g.publicacao;
        if (!pub || !(pub.publicadas > 0)) return false;
        await api.forcarNoticias(token, { aba: estado.aba, soGoogle: true });
        await Promise.all([carregarMercado(estado.indice), carregarNoticiasAtivos()]);
        desenharMercado(); desenharAtivos();
        return true;
      }).catch(() => false);
    }
    const partes = await Promise.all([
      carregarMercado(estado.indice).then(() => desenharMercado()).then(() => true),
      carregarSeries().then((ok) => { desenharAbasIndice(); desenharMercado(); desenharTermometro(); desenharAtivos(); return ok; }),
      carregarVideos(estado.aba).then(() => desenharVideos()).then(() => true),
      carregarProventos().then(() => { desenharAgenda(); desenharAtivos(); return true; }),
      carregarAgendaExterna().then(() => { desenharAgenda(); return true; }),
      Promise.all([carregarCarteira(), carregarNoticiasAtivos()]).then(() => { desenharAtivos(); return true; }),
    ]);
    // os outros índices e abas guardados ficam velhos: busca de novo quando forem abertos
    Object.keys(estado.mercado).forEach((k) => { if (k !== estado.indice) delete estado.mercado[k]; });
    Object.keys(estado.videos).forEach((k) => { if (k !== estado.aba) delete estado.videos[k]; });
    return partes.some(Boolean) && !!(estado.mercado[estado.indice] && estado.mercado[estado.indice].ok);
  }

  desenharAbasIndice(); desenharTermometro(); desenharVideos(); desenharAgenda(); desenharAtivos();
  // o clique (não o relógio de 2 min) marca a busca forçada - na captura, antes do "Atualizar dados" chamar carregar()
  if (cab.refreshEl) cab.refreshEl.addEventListener('click', (ev) => { if (ev.target.closest('.refresh-btn')) estado.forcar = true; }, true);
  const controle = mountRefreshControl(doc, cab.refreshEl, carregar, { intervaloMs: INTERVALO_MS });
  await controle.atualizar();
  return { estado, carregar, controle };
}

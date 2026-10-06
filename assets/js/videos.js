/**
 * videos.js - 25/09/2026 (Tiago: "teríamos como incluir uma sessão de vídeos?
 * vindo do youtube? tem canais que gosto e queria filtrar por ativo/carteira").
 *
 * Seção "Vídeos" usada na tela do ativo e nas páginas de cada carteira. Os
 * vídeos vêm da aba aux_videos (apps-script/Videos.gs), já filtrados pelo
 * servidor. A seção só busca quando aparece na tela (IntersectionObserver) -
 * não atrasa a abertura da página. Clicar na miniatura toca o vídeo ali mesmo
 * (youtube-nocookie); o título abre no YouTube.
 *
 * 26/09/2026 (Tiago: "em ações não veio nada.. mas internamente, algumas
 * ações têm vídeos"): a página da carteira agora manda os apelidos de cada
 * ativo (ativos-sobre.json) e o servidor devolve primeiro os vídeos que
 * citam ativos da carteira (com o ticker marcado no cartão, link pra tela
 * do ativo) e depois os do tema da carteira.
 *
 * 02/10/2026 (Tiago: "Canais do YouTube por ativo mostrados na página; a
 * busca de vídeos tem que considerar os canais"): na tela do ativo, o canal
 * oficial (canais-youtube.js) aparece no topo da seção e vai na busca
 * (params.canal); os vídeos dele chegam marcados `oficial` e ganham a
 * etiqueta "Canal oficial", misturados por data com os dos seus canais.
 */

import { getVideos } from './api-client.js';
import { formatRelativeTime } from './format.js';
import { resolveSiteRootUrl } from './shell.js';
import { urlAtivo } from './link-ativo.js';
import { esc } from './util/html.js'; // 05/10/2026 (A-68): escape único


const idValido = (id) => /^[\w-]{11}$/.test(String(id || ''));

const ICONE_YOUTUBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="4.5" width="21" height="15" rx="4.5" class="vd-yt-fundo"/><path d="M10 8.8v6.4l5.6-3.2z" class="vd-yt-play"/></svg>';

/**
 * 02/10/2026 (Tiago: "Canais do YouTube por ativo mostrados na página"):
 * bloco "Canal oficial" (nome + @handle, abre o canal em nova aba). `canal`
 * vem de canais-youtube.js; só link do youtube.com.
 */
export function canalOficialHtml(canal) {
  if (!canal || !/^https:\/\/www\.youtube\.com\//.test(String(canal.url || ''))) return '';
  return `
      <a class="vd-canal-oficial" href="${esc(canal.url)}" target="_blank" rel="noopener" title="Abrir o canal no YouTube (nova aba)">
        <span class="vd-canal-ico">${ICONE_YOUTUBE}</span>
        <span class="vd-canal-texto"><span class="vd-canal-rotulo">Canal oficial</span><span class="vd-canal-nome">${esc(canal.nome || canal.handle)}${canal.handle && canal.nome ? ` <span class="vd-canal-handle">${esc(canal.handle)}</span>` : ''}</span></span>
        <span class="vd-canal-seta" aria-hidden="true">↗</span>
      </a>`;
}

export function secaoVideosHtml(id, { hint = 'dos seus canais: primeiro os que citam ativos da carteira, depois o tema', canal = null } = {}) {
  return `
    <section class="vd-secao" id="${id}" aria-labelledby="${id}Titulo">
      <div class="vd-topo"><h2 id="${id}Titulo">Vídeos</h2><span class="hint">${esc(hint)}</span>${canalOficialHtml(canal)}</div>
      <div class="vd-conteudo">${videosHtml(null)}</div>
    </section>`;
}

/**
 * 05/10/2026 (Tiago): 404 ou lista vazia de um canal = "sem vídeos disponíveis" (não é erro): uma linha por canal
 * (o oficial do ativo e os de aux_videos-canais que a última atualização achou vazios).
 */
export function semVideosCanaisHtml(resposta) {
  const nomes = [];
  const oficial = resposta && resposta.canalOficial;
  if (oficial && oficial.semVideos) nomes.push(`Canal oficial${oficial.nome ? ` (${oficial.nome})` : ''}`);
  ((resposta && resposta.canaisSemVideos) || []).forEach((c) => nomes.push(String(c)));
  return nomes.length ? `<p class="hint vd-sem-videos">${nomes.map((n) => `<span>${esc(n)}: sem vídeos disponíveis</span>`).join(' · ')}</p>` : '';
}

export function videosHtml(resposta, agora = new Date(), pagina = 0) {
  const html = videosHtmlBase(resposta, agora, pagina);
  return resposta && resposta.ok ? html + semVideosCanaisHtml(resposta) : html;
}

function videosHtmlBase(resposta, agora, pagina = 0) {
  if (!resposta) return `<div class="vd-grade">${'<div class="vd-card"><span class="skel vd-thumb"></span><span class="skel" style="height:14px"></span><span class="skel" style="height:14px;width:60%"></span></div>'.repeat(3)}</div>`;
  if (!resposta.ok) return `<p class="hint">Não deu pra buscar os vídeos agora (${esc(resposta.erro || resposta.etapa || 'erro')}).</p>`;
  // 02/10/2026: sem canais cadastrados, mas com vídeos do canal oficial do ativo -> mostra os do oficial
  if (!resposta.configurado && !(resposta.videos || []).some((v) => v && v.oficial)) {
    return '<p class="hint">Nenhum canal cadastrado ainda. Na planilha, rode <code>configurarVideosDireto()</code> no Apps Script, coloque os canais na aba <b>aux_videos-canais</b> (link ou @nome, e opcionalmente as carteiras) e rode <code>rodarVideosDireto()</code>.</p>';
  }
  const lista = (resposta.videos || []).filter((v) => idValido(v.id));
  const ondeAjustar = 'Dá pra acrescentar ou descartar termos na aba <b>aux_videos-termos</b> da planilha.';
  if (!lista.length) {
    const semVideo = resposta.carteira ? 'Nenhum vídeo recente dos seus canais cita ativos desta carteira ou o tema dela.'
      : (resposta.canalOficial ? 'Nenhum vídeo recente dos seus canais nem do canal oficial fala deste ativo.' : 'Nenhum vídeo recente dos seus canais fala deste ativo.');
    return `<p class="hint">${semVideo} ${ondeAjustar}</p>`;
  }
  const cartao = (v) => {
    const ativos = resposta.carteira && Array.isArray(v.ativos) ? v.ativos.filter((t) => /^[A-Z0-9.]{2,12}$/.test(t)) : [];
    return `
      <article class="vd-card">
        <button type="button" class="vd-thumb" data-video="${esc(v.id)}" aria-label="Tocar: ${esc(v.titulo)}">
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy">
          <span class="vd-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>
        </button>
        ${v.oficial ? '<span class="vd-oficial">Canal oficial</span>' : ''}
        ${ativos.length ? `<span class="vd-ativos">${ativos.map((t) => `<a class="vd-ativo" href="${esc(urlAtivo(t))}">${esc(t)}</a>`).join('')}</span>` : ''}
        <a class="vd-titulo" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${esc(v.titulo)}</a>
        <span class="vd-meta">${esc(v.canal)}${v.publicado ? ` · ${formatRelativeTime(v.publicado, agora)}` : ''}</span>
      </article>`;
  };
  const grade = (itens) => `<div class="vd-grade">${itens.map(cartao).join('')}</div>`;
  // 06/10/2026 (Tiago: "os vídeos pegam muito espaço: exibe de 3 em 3, com paginação, carregando aos poucos (performance), e eu conseguir
  // ver a lista inteira"): só a página atual vai pro DOM (miniaturas loading="lazy"; o iframe só nasce no clique), a lista inteira
  // fica navegável pelo paginador. Com 2 grupos (ativos x tema) a ordem é a mesma, o título do grupo aparece na página onde ele entra.
  const doAtivo = lista.filter((v) => v.motivo !== 'tema');
  const doTema = lista.filter((v) => v.motivo === 'tema');
  const agrupar = !!resposta.carteira && doAtivo.length > 0 && doTema.length > 0;
  const ordem = agrupar ? [...doAtivo, ...doTema] : lista;
  const total = ordem.length;
  const paginas = Math.max(1, Math.ceil(total / VIDEOS_POR_PAGINA));
  const atual = Math.min(Math.max(0, Number(pagina) || 0), paginas - 1);
  const ini = atual * VIDEOS_POR_PAGINA;
  const fatia = ordem.slice(ini, ini + VIDEOS_POR_PAGINA);
  let corpo;
  if (!agrupar) corpo = grade(fatia);
  else {
    const noAtivos = fatia.filter((x) => x.motivo !== 'tema');
    const noTema = fatia.filter((x) => x.motivo === 'tema');
    corpo = (noAtivos.length ? `<div class="vd-grupo"><h3 class="vd-grupo-titulo">Citam seus ativos</h3>${grade(noAtivos)}</div>` : '')
      + (noTema.length ? `<div class="vd-grupo"><h3 class="vd-grupo-titulo">Sobre o tema da carteira</h3>${grade(noTema)}</div>` : '');
  }
  return corpo + paginadorHtml(atual, paginas, total);
}

/** Quantos vídeos por página (06/10/2026). */
export const VIDEOS_POR_PAGINA = 3;

/** Páginas visíveis do paginador: todas se couberem; senão a 1ª, a última e a vizinhança da atual (com "…"). */
export function paginasVisiveis(atual, paginas) {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i);
  const set = new Set([0, paginas - 1, atual - 1, atual, atual + 1]);
  const out = [];
  [...set].filter((p) => p >= 0 && p < paginas).sort((x, y) => x - y).forEach((p, i, arr) => { if (i && p - arr[i - 1] > 1) out.push('…'); out.push(p); });
  return out;
}

function paginadorHtml(atual, paginas, total) {
  if (paginas <= 1) return '';
  const de = atual * VIDEOS_POR_PAGINA + 1;
  const ate = Math.min(total, (atual + 1) * VIDEOS_POR_PAGINA);
  const botoes = paginasVisiveis(atual, paginas).map((p) => (p === '…'
    ? '<span class="vd-pag-reticencias" aria-hidden="true">…</span>'
    : `<button type="button" class="vd-pag${p === atual ? ' on' : ''}" data-pagina="${p}" aria-label="Página ${p + 1}"${p === atual ? ' aria-current="page"' : ''}>${p + 1}</button>`)).join('');
  return `
    <nav class="vd-pager" aria-label="Páginas de vídeos">
      <span class="vd-pag-info" aria-live="polite">${de}–${ate} de ${total}</span>
      <span class="vd-pag-botoes">
        <button type="button" class="vd-pag vd-pag-nav" data-pagina="${atual - 1}"${atual === 0 ? ' disabled' : ''}>Anteriores</button>
        ${botoes}
        <button type="button" class="vd-pag vd-pag-nav vd-pag-mais" data-pagina="${atual + 1}"${atual >= paginas - 1 ? ' disabled' : ''}>Mais vídeos</button>
      </span>
    </nav>`;
}

/** Miniatura -> player (delegado; o conteúdo chega depois). */
export function ligarPlayerVideos(raiz) {
  if (!raiz || raiz._videosLigados) return;
  raiz._videosLigados = true;
  raiz.addEventListener('click', (ev) => {
    // 06/10/2026: paginador (3 por vez) - redesenha só a página pedida a partir da resposta guardada em .vd-conteudo
    const pag = ev.target.closest && ev.target.closest('.vd-pag[data-pagina]');
    if (pag && !pag.disabled) {
      const alvo = pag.closest('.vd-conteudo');
      if (alvo && alvo._vdResposta) {
        const n = Number(pag.dataset.pagina);
        alvo.innerHTML = videosHtml(alvo._vdResposta, alvo._vdAgora || new Date(), n);
        const novo = alvo.querySelector(`.vd-pag[data-pagina="${n}"]:not(.vd-pag-nav)`) || alvo.querySelector('.vd-pag.on');
        if (novo && novo.focus) novo.focus({ preventScroll: true });
        const topo = alvo.closest('.vd-secao');
        if (topo && topo.scrollIntoView && topo.getBoundingClientRect().top < 0) topo.scrollIntoView({ block: 'start' });
      }
      return;
    }
    const btn = ev.target.closest && ev.target.closest('.vd-thumb[data-video]');
    if (!btn || !idValido(btn.dataset.video)) return;
    const doc = btn.ownerDocument;
    const iframe = doc.createElement('iframe');
    iframe.className = 'vd-player';
    iframe.src = `https://www.youtube-nocookie.com/embed/${btn.dataset.video}?autoplay=1&rel=0`;
    iframe.title = 'Vídeo do YouTube';
    iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    btn.replaceWith(iframe);
  });
}

/**
 * Busca (uma vez só por página) e desenha quando a seção aparecer na tela.
 * Devolve preencher(secaoEl) - chame de novo depois de cada redesenho da
 * página: reaproveita a resposta já recebida.
 */
export function criarCarregadorVideos(token, params, { getVideosImpl = getVideos, carregarApelidosImpl = carregarApelidosPadrao, agora = () => new Date() } = {}) {
  let promessa = null;
  const buscar = () => {
    if (!promessa) {
      const precisaApelidos = params.carteira && params.carteira !== 'rendaFixa' && !params.apelidos;
      promessa = Promise.resolve(precisaApelidos ? carregarApelidosImpl(params.carteira) : null)
        .catch(() => null)
        .then((apelidos) => getVideosImpl(token, apelidos ? { ...params, apelidos } : params))
        .catch((e) => ({ ok: false, erro: String(e) }));
    }
    return promessa;
  };
  return function preencher(secaoEl) {
    if (!secaoEl) return;
    const alvo = secaoEl.querySelector('.vd-conteudo');
    ligarPlayerVideos(secaoEl);
    const desenhar = () => buscar().then((r) => { if (alvo.isConnected) { alvo._vdResposta = r; alvo._vdAgora = agora(); alvo.innerHTML = videosHtml(r, alvo._vdAgora); } });
    const janela = secaoEl.ownerDocument.defaultView;
    if (promessa) { desenhar(); return; }
    if (!janela || typeof janela.IntersectionObserver !== 'function') return; // sem IO (testes): não busca sozinho
    const io = new janela.IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) { io.disconnect(); desenhar(); }
    }, { rootMargin: '200px' });
    io.observe(secaoEl);
  };
}

/**
 * Apelidos dos ativos de uma carteira ({ PETR4: ['Petrobras'], ... }) a partir
 * de assets/data/ativos-sobre.json - o mesmo que a tela do ativo usa. Nunca
 * lança: sem o arquivo, a busca segue só com os tickers.
 */
let sobreEmCurso = null;
export function carregarApelidosPadrao(carteira, fetchImpl = typeof fetch !== 'undefined' ? fetch : null) {
  if (!fetchImpl) return Promise.resolve(null);
  if (!sobreEmCurso) {
    sobreEmCurso = fetchImpl(new URL('assets/data/ativos-sobre.json', resolveSiteRootUrl()).href)
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }
  return sobreEmCurso.then((sobre) => {
    const out = {};
    Object.entries((sobre && sobre.ativos) || {}).forEach(([t, a]) => {
      if (a && a.classe === carteira && Array.isArray(a.apelidos) && a.apelidos.length) out[t] = a.apelidos;
    });
    return out;
  });
}

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
 */

import { getVideos } from './api-client.js';
import { formatRelativeTime } from './format.js';
import { resolveSiteRootUrl } from './shell.js';
import { urlAtivo } from './link-ativo.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const idValido = (id) => /^[\w-]{11}$/.test(String(id || ''));

export function secaoVideosHtml(id, { hint = 'dos seus canais: primeiro os que citam ativos da carteira, depois o tema' } = {}) {
  return `
    <section class="vd-secao" id="${id}" aria-labelledby="${id}Titulo">
      <div class="vd-topo"><h2 id="${id}Titulo">Vídeos</h2><span class="hint">${esc(hint)}</span></div>
      <div class="vd-conteudo">${videosHtml(null)}</div>
    </section>`;
}

export function videosHtml(resposta, agora = new Date()) {
  if (!resposta) return `<div class="vd-grade">${'<div class="vd-card"><span class="skel vd-thumb"></span><span class="skel" style="height:14px"></span><span class="skel" style="height:14px;width:60%"></span></div>'.repeat(3)}</div>`;
  if (!resposta.ok) return `<p class="hint">Não deu pra buscar os vídeos agora (${esc(resposta.erro || resposta.etapa || 'erro')}).</p>`;
  if (!resposta.configurado) {
    return '<p class="hint">Nenhum canal cadastrado ainda. Na planilha, rode <code>configurarVideosDireto()</code> no Apps Script, coloque os canais na aba <b>aux_videos-canais</b> (link ou @nome, e opcionalmente as carteiras) e rode <code>rodarVideosDireto()</code>.</p>';
  }
  const lista = (resposta.videos || []).filter((v) => idValido(v.id));
  const ondeAjustar = 'Dá pra acrescentar ou descartar termos na aba <b>aux_videos-termos</b> da planilha.';
  if (!lista.length) {
    return `<p class="hint">${resposta.carteira ? 'Nenhum vídeo recente dos seus canais cita ativos desta carteira ou o tema dela.' : 'Nenhum vídeo recente dos seus canais fala deste ativo.'} ${ondeAjustar}</p>`;
  }
  const cartao = (v) => {
    const ativos = resposta.carteira && Array.isArray(v.ativos) ? v.ativos.filter((t) => /^[A-Z0-9.]{2,12}$/.test(t)) : [];
    return `
      <article class="vd-card">
        <button type="button" class="vd-thumb" data-video="${esc(v.id)}" aria-label="Tocar: ${esc(v.titulo)}">
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy">
          <span class="vd-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>
        </button>
        ${ativos.length ? `<span class="vd-ativos">${ativos.map((t) => `<a class="vd-ativo" href="${esc(urlAtivo(t))}">${esc(t)}</a>`).join('')}</span>` : ''}
        <a class="vd-titulo" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${esc(v.titulo)}</a>
        <span class="vd-meta">${esc(v.canal)}${v.publicado ? ` · ${formatRelativeTime(v.publicado, agora)}` : ''}</span>
      </article>`;
  };
  const grade = (itens) => `<div class="vd-grade">${itens.map(cartao).join('')}</div>`;
  const doAtivo = lista.filter((v) => v.motivo !== 'tema');
  const doTema = lista.filter((v) => v.motivo === 'tema');
  if (!resposta.carteira || !doAtivo.length || !doTema.length) return grade(lista);
  return `
    <div class="vd-grupo"><h3 class="vd-grupo-titulo">Citam seus ativos</h3>${grade(doAtivo)}</div>
    <div class="vd-grupo"><h3 class="vd-grupo-titulo">Sobre o tema da carteira</h3>${grade(doTema)}</div>`;
}

/** Miniatura -> player (delegado; o conteúdo chega depois). */
export function ligarPlayerVideos(raiz) {
  if (!raiz || raiz._videosLigados) return;
  raiz._videosLigados = true;
  raiz.addEventListener('click', (ev) => {
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
    const desenhar = () => buscar().then((r) => { if (alvo.isConnected) alvo.innerHTML = videosHtml(r, agora()); });
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

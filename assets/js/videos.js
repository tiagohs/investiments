/**
 * videos.js - 25/09/2026 (Tiago: "teríamos como incluir uma sessão de vídeos?
 * vindo do youtube? tem canais que gosto e queria filtrar por ativo/carteira").
 *
 * Seção "Vídeos" usada na tela do ativo e nas páginas de cada carteira. Os
 * vídeos vêm da aba aux_videos (apps-script/Videos.gs), já filtrados pelo
 * servidor. A seção só busca quando aparece na tela (IntersectionObserver) -
 * não atrasa a abertura da página. Clicar na miniatura toca o vídeo ali mesmo
 * (youtube-nocookie); o título abre no YouTube.
 */

import { getVideos } from './api-client.js';
import { formatRelativeTime } from './format.js';

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const idValido = (id) => /^[\w-]{11}$/.test(String(id || ''));

export function secaoVideosHtml(id, { hint = 'dos canais que você acompanha' } = {}) {
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
  if (!lista.length) return '<p class="hint">Nenhum vídeo recente dos seus canais fala disso.</p>';
  return `<div class="vd-grade">${lista.map((v) => `
      <article class="vd-card">
        <button type="button" class="vd-thumb" data-video="${esc(v.id)}" aria-label="Tocar: ${esc(v.titulo)}">
          <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy">
          <span class="vd-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></span>
        </button>
        <a class="vd-titulo" href="https://www.youtube.com/watch?v=${esc(v.id)}" target="_blank" rel="noopener">${esc(v.titulo)}</a>
        <span class="vd-meta">${esc(v.canal)}${v.publicado ? ` · ${formatRelativeTime(v.publicado, agora)}` : ''}</span>
      </article>`).join('')}
    </div>`;
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
export function criarCarregadorVideos(token, params, { getVideosImpl = getVideos, agora = () => new Date() } = {}) {
  let promessa = null;
  const buscar = () => {
    if (!promessa) promessa = Promise.resolve(getVideosImpl(token, params)).catch((e) => ({ ok: false, erro: String(e) }));
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

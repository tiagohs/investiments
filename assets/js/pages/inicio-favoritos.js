/**
 * assets/js/pages/inicio-favoritos.js — área "Favoritos" da Início
 * (23/09/2026, pedido do Tiago).
 *
 * - Cada card de "Meus ativos" ganha uma estrela (.ativo-fav-btn) que
 *   adiciona/remove o ativo dos favoritos. A estrela fica dentro do <a> do
 *   card, então o clique nela nunca navega (preventDefault+stopPropagation,
 *   mesmo cuidado dos ícones "i" e de gráfico).
 * - Os favoritos aparecem numa área própria logo abaixo de "Índices &
 *   câmbio" (acima da Rentabilidade): cópia dos mesmos cards (criarAtivoCard
 *   de inicio.js), na ordem salva.
 * - Reordenar é por arrastar e soltar, mas só depois de tocar no lápis
 *   ("Editar"): fora do modo edição o card continua sendo link, e nada é
 *   arrastável - sem confusão entre clique e arraste. Pointer Events (mouse
 *   e toque com a mesma API). No teclado: setas movem o card focado.
 *   "Concluir" salva; Esc desfaz.
 * - Onde fica salvo: aba "Auxiliar_favoritos" da planilha (Favoritos.gs).
 *   A Início já recebe a lista em getHome().favoritos; gravar é
 *   salvarFavoritos (POST). A tela muda na hora e, se a gravação falhar,
 *   volta pro último estado salvo e avisa.
 */
import { salvarFavoritos as salvarFavoritosApi } from '../api-client.js';

/** "classe:ref" - ref = código do título em Renda Fixa, ticker no resto
 * (mesma ref do link pro Detalhe do Ativo). */
export function idFavoritoDoAtivo(ativo) {
  if (!ativo) return '';
  const ref = ativo.classe === 'rf' ? (ativo.codigo || ativo.ticker) : ativo.ticker;
  return `${ativo.classe}:${String(ref == null ? '' : ref).trim()}`;
}

/** Adiciona no fim (se não é favorito) ou remove (se já é). Nova lista. */
export function alternarFavorito(ids, id) {
  const lista = Array.isArray(ids) ? ids : [];
  return lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];
}

/** Move `id` pra posição `novoIndice` (limitada à lista). Nova lista. */
export function moverFavorito(ids, id, novoIndice) {
  const lista = [...(ids || [])];
  const de = lista.indexOf(id);
  if (de === -1) return lista;
  lista.splice(de, 1);
  const para = Math.max(0, Math.min(lista.length, novoIndice));
  lista.splice(para, 0, id);
  return lista;
}

/** Ativos favoritos na ordem salva. Id sem ativo correspondente (vendido,
 * ou lista chegou antes dos ativos) fica de fora da TELA, mas continua na
 * lista salva - se o ativo voltar, o favorito volta junto. */
export function resolverFavoritos(ids, ativos) {
  const porId = new Map((ativos || []).map((a) => [idFavoritoDoAtivo(a), a]));
  return (ids || []).map((id) => porId.get(id)).filter(Boolean);
}

const ICONE_ESTRELA_SVG = '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>';
const ICONE_EDITAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICONE_CONCLUIR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

/** HTML da estrela, usado por criarAtivoCard (inicio.js). */
export function htmlBotaoFavorito(ativo, favorito = false) {
  const id = idFavoritoDoAtivo(ativo).replace(/"/g, '&quot;');
  return `<span class="ativo-fav-btn${favorito ? ' ativo' : ''}" role="button" tabindex="0" data-fav-id="${id}" aria-pressed="${favorito ? 'true' : 'false'}" aria-label="${favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" title="${favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">${ICONE_ESTRELA_SVG}</span>`;
}

/** Acende/apaga as estrelas já desenhadas dentro de `container`. */
export function marcarEstrelas(container, idsSet) {
  if (!container) return;
  container.querySelectorAll('.ativo-fav-btn').forEach((btn) => {
    const fav = idsSet.has(btn.dataset.favId);
    btn.classList.toggle('ativo', fav);
    btn.setAttribute('aria-pressed', fav ? 'true' : 'false');
    const rotulo = fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
    btn.setAttribute('aria-label', rotulo);
    btn.setAttribute('title', rotulo);
  });
}

/**
 * Liga a área de favoritos. Idempotente por `secao` (a Início recarrega os
 * dados a cada 5 min / "Atualizar dados" - a 2ª chamada só atualiza os
 * dados, sem religar eventos). Devolve o controlador (também guardado em
 * secao._favoritos).
 *
 * `criarCard(doc, ativo, { favorito })` vem de inicio.js (criarAtivoCard) -
 * passado por parâmetro pra não criar import circular.
 * `acharCardNoPonto(x, y)` só existe pra teste (JSDOM não tem layout);
 * o padrão usa doc.elementFromPoint.
 */
export function montarFavoritos(doc, {
  secao, grid, botaoEditar, dica, status, meusAtivosGrid,
  ativos = [], favoritos = [], token, criarCard,
  salvarImpl = salvarFavoritosApi, acharCardNoPonto = null,
} = {}) {
  if (!secao || !grid) return null;
  if (secao._favoritos) {
    secao._favoritos.atualizar({ ativos, favoritos });
    return secao._favoritos;
  }

  const estado = {
    ids: Array.isArray(favoritos) ? [...favoritos] : [],
    confirmados: Array.isArray(favoritos) ? [...favoritos] : [],
    ativos: ativos || [],
    editando: false,
    idsAntesDaEdicao: null,
    salvando: 0,
    fila: Promise.resolve(),
  };

  function avisar_(texto, tipo = '') {
    if (!status) return;
    status.textContent = texto;
    status.className = `favoritos-status${tipo ? ` ${tipo}` : ''}`;
  }

  function desenhar_() {
    secao.hidden = false;
    const lista = resolverFavoritos(estado.ids, estado.ativos);
    grid.innerHTML = '';
    if (!lista.length) {
      grid.innerHTML = '<p class="hint favoritos-vazio">Toque na estrela de um ativo em "Meus ativos" pra fixá-lo aqui.</p>';
    } else {
      lista.forEach((ativo) => {
        const card = criarCard(doc, ativo, { favorito: true });
        card.dataset.favId = idFavoritoDoAtivo(ativo);
        if (estado.editando) {
          // <a> é arrastável nativamente (arrasta o LINK) - o navegador
          // cancelaria o nosso arraste (pointercancel) no 1º movimento
          card.setAttribute('draggable', 'false');
          card.setAttribute('aria-roledescription', 'card arrastável');
          card.setAttribute('aria-label', `${ativo.ticker}: use as setas pra mudar a posição`);
        }
        grid.appendChild(card);
      });
    }
    grid.classList.toggle('editando', estado.editando);
    if (botaoEditar) {
      botaoEditar.hidden = lista.length < 2 && !estado.editando;
      botaoEditar.classList.toggle('ativo', estado.editando);
      botaoEditar.setAttribute('aria-pressed', estado.editando ? 'true' : 'false');
      botaoEditar.innerHTML = estado.editando
        ? `${ICONE_CONCLUIR_SVG}<span>Concluir</span>`
        : `${ICONE_EDITAR_SVG}<span>Editar</span>`;
      botaoEditar.setAttribute('aria-label', estado.editando ? 'Concluir e salvar a ordem dos favoritos' : 'Editar a ordem dos favoritos');
    }
    if (dica) dica.hidden = !estado.editando;
    const set = new Set(estado.ids);
    if (meusAtivosGrid) {
      meusAtivosGrid._favoritosIds = set; // renderMeusAtivos lê isso (troca de aba de classe)
      marcarEstrelas(meusAtivosGrid, set);
    }
  }

  /** Grava a lista inteira. Em fila (uma gravação por vez, na ordem). */
  function salvar_(ids) {
    estado.salvando += 1;
    avisar_('Salvando…');
    estado.fila = estado.fila.then(async () => {
      let resposta;
      try {
        resposta = await salvarImpl(token, ids);
      } catch (err) {
        resposta = { ok: false, erro: String(err) };
      }
      estado.salvando -= 1;
      if (resposta && resposta.ok) {
        estado.confirmados = Array.isArray(resposta.favoritos) ? resposta.favoritos : ids;
        if (!estado.salvando) avisar_('Favoritos salvos', 'ok');
      } else {
        // volta pro último estado que a planilha confirmou
        estado.ids = [...estado.confirmados];
        if (!estado.editando) desenhar_();
        avisar_(`Não deu pra salvar os favoritos (${(resposta && resposta.erro) || 'erro desconhecido'}). Tente de novo.`, 'erro');
      }
    });
    return estado.fila;
  }

  function alternar_(id) {
    estado.ids = alternarFavorito(estado.ids, id);
    desenhar_();
    return salvar_([...estado.ids]);
  }

  // --- estrela (nos 2 grids) ---
  function aoClicarEstrela_(ev) {
    const btn = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-fav-btn') : null;
    if (!btn) return;
    if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return; // Tab etc. seguem normais
    ev.preventDefault();
    ev.stopPropagation();
    alternar_(btn.dataset.favId);
  }
  [grid, meusAtivosGrid].filter(Boolean).forEach((g) => {
    g.addEventListener('click', aoClicarEstrela_);
    g.addEventListener('keydown', (ev) => { if (ev.target.closest && ev.target.closest('.ativo-fav-btn')) aoClicarEstrela_(ev); });
  });

  // --- modo edição ---
  function entrarEdicao_() {
    estado.editando = true;
    estado.idsAntesDaEdicao = [...estado.ids];
    avisar_('');
    desenhar_();
  }
  function sairEdicao_({ cancelar = false } = {}) {
    const antes = estado.idsAntesDaEdicao || [];
    estado.editando = false;
    estado.idsAntesDaEdicao = null;
    if (cancelar) {
      estado.ids = antes;
      desenhar_();
      avisar_('Ordem desfeita');
      return Promise.resolve();
    }
    desenhar_();
    const mudou = antes.length !== estado.ids.length || antes.some((id, i) => id !== estado.ids[i]);
    return mudou ? salvar_([...estado.ids]) : Promise.resolve();
  }
  if (botaoEditar) {
    botaoEditar.addEventListener('click', () => (estado.editando ? sairEdicao_() : entrarEdicao_()));
  }

  // no modo edição o card não é link
  grid.addEventListener('click', (ev) => {
    if (!estado.editando) return;
    if (ev.target.closest && ev.target.closest('.ativo-fav-btn')) return;
    if (ev.target.closest && ev.target.closest('.ativo-card')) ev.preventDefault();
  }, true);

  /** ids na ordem atual do DOM + os que não estão na tela (sem ativo), no fim. */
  function idsDaOrdemNaTela_() {
    const naTela = [...grid.querySelectorAll('.ativo-card')].map((c) => c.dataset.favId);
    const fora = estado.ids.filter((id) => !naTela.includes(id));
    return [...naTela, ...fora];
  }

  // --- teclado: setas movem o card focado ---
  grid.addEventListener('keydown', (ev) => {
    if (!estado.editando) return;
    const card = ev.target.closest && ev.target.closest('.ativo-card');
    if (ev.key === 'Escape') { ev.preventDefault(); sairEdicao_({ cancelar: true }); return; }
    if (!card) return;
    const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[ev.key];
    if (!delta) return;
    ev.preventDefault();
    const id = card.dataset.favId;
    estado.ids = moverFavorito(estado.ids, id, estado.ids.indexOf(id) + delta);
    desenhar_();
    const foco = grid.querySelector(`.ativo-card[data-fav-id="${CSS_escape_(id)}"]`);
    if (foco) foco.focus();
  });

  // --- arrastar e soltar (Pointer Events: mouse + toque) ---
  let arraste = null;
  const achar = acharCardNoPonto || ((x, y) => {
    const el = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(x, y) : null;
    const card = el && el.closest ? el.closest('.ativo-card') : null;
    return card && grid.contains(card) ? card : null;
  });

  grid.addEventListener('dragstart', (ev) => { if (estado.editando) ev.preventDefault(); });
  grid.addEventListener('pointerdown', (ev) => {
    if (!estado.editando || arraste) return;
    if (ev.button != null && ev.button > 0) return;
    if (ev.target.closest && ev.target.closest('.ativo-fav-btn')) return;
    const card = ev.target.closest && ev.target.closest('.ativo-card');
    if (!card) return;
    arraste = { card, pointerId: ev.pointerId, x0: ev.clientX, y0: ev.clientY, ativo: false, ordemInicial: idsDaOrdemNaTela_() };
    if (typeof grid.setPointerCapture === 'function' && ev.pointerId != null) {
      try { grid.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    }
  });
  grid.addEventListener('pointermove', (ev) => {
    if (!arraste || (ev.pointerId != null && arraste.pointerId != null && ev.pointerId !== arraste.pointerId)) return;
    if (!arraste.ativo) {
      if (Math.hypot(ev.clientX - arraste.x0, ev.clientY - arraste.y0) < 5) return;
      arraste.ativo = true;
      arraste.card.classList.add('arrastando');
    }
    ev.preventDefault();
    const alvo = achar(ev.clientX, ev.clientY);
    if (!alvo || alvo === arraste.card) return;
    const cards = [...grid.querySelectorAll('.ativo-card')];
    const iArrastado = cards.indexOf(arraste.card);
    const iAlvo = cards.indexOf(alvo);
    if (iAlvo === -1) return;
    // troca de posição: indo pra frente entra DEPOIS do alvo, pra trás ANTES
    if (iArrastado < iAlvo) alvo.after(arraste.card);
    else alvo.before(arraste.card);
  });
  function terminarArraste_(ev, cancelado) {
    if (!arraste) return;
    if (ev && ev.pointerId != null && arraste.pointerId != null && ev.pointerId !== arraste.pointerId) return;
    const { card, ativo, ordemInicial } = arraste;
    arraste = null;
    card.classList.remove('arrastando');
    if (!ativo) return;
    estado.ids = cancelado ? ordemInicial : idsDaOrdemNaTela_();
    desenhar_();
  }
  grid.addEventListener('pointerup', (ev) => terminarArraste_(ev, false));
  grid.addEventListener('pointercancel', (ev) => terminarArraste_(ev, true));

  const controlador = {
    atualizar({ ativos: novosAtivos, favoritos: novosFavoritos } = {}) {
      if (Array.isArray(novosAtivos)) estado.ativos = novosAtivos;
      // não atropela o que o Tiago acabou de mexer (gravação em andamento
      // ou modo edição aberto) com a lista que veio do servidor
      if (Array.isArray(novosFavoritos) && !estado.salvando && !estado.editando) {
        estado.ids = [...novosFavoritos];
        estado.confirmados = [...novosFavoritos];
      }
      if (!arraste) desenhar_();
    },
    get ids() { return [...estado.ids]; },
    get editando() { return estado.editando; },
    alternar: alternar_,
    entrarEdicao: entrarEdicao_,
    sairEdicao: sairEdicao_,
    aguardarGravacoes: () => estado.fila,
  };
  secao._favoritos = controlador;
  desenhar_();
  return controlador;
}

function CSS_escape_(texto) {
  return String(texto).replace(/["\\]/g, '\\$&');
}

/**
 * inicio-densidade.js - "cards por linha" da Início (07/10/2026, pedido do Tiago: "Na home, me dê a opção de colocar 4,
 * 5, 6 ou 7 cards por row. Pra ficar mais dinâmico."). Vale pras duas grades de cards: a faixa de Indicadores/mercado e os
 * Favoritos. A lista "Meus ativos" (coluna da direita) não entra: é lista, não grade.
 *
 *  - controle compacto (segmented "4 5 6 7") no cabeçalho da página; só aparece no desktop (> 1024px), onde ele manda;
 *  - a escolha fica em localStorage (try/catch: sem storage, vale o padrão);
 *  - em tablet/celular o limite é automático (máx. 3 colunas em <= 1024px, 2 em <= 600px) - o CSS (inicio.css) repete
 *    esses limites com @media; `colunasEfetivas()` é a mesma regra em JS (testada) pra rótulos/aria;
 *  - o tamanho da fonte/gráfico do card acompanha a largura REAL do bloco (container queries em inicio.css, usando
 *    --cards-por-linha), então o texto não estoura nem com a gaveta de navegação aberta.
 */

export const OPCOES_CARDS_POR_LINHA = [4, 5, 6, 7];
export const PADRAO_CARDS_POR_LINHA = 5; // = a faixa de mercado de antes (5 colunas)
export const CHAVE_CARDS_POR_LINHA = 'investiments_inicio_cards_por_linha';
/** Largura (px) até a qual o limite automático vale. */
export const LARGURA_TABLET_MAX = 1024;
export const LARGURA_CELULAR_MAX = 600;

/** Valor válido (4..7) ou null. Aceita número ou texto. */
export function normalizarCardsPorLinha(valor) {
  const n = typeof valor === 'string' ? Number(valor.trim()) : valor;
  return OPCOES_CARDS_POR_LINHA.includes(n) ? n : null;
}

function storagePadrao_() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
}

export function lerCardsPorLinha(storage = storagePadrao_()) {
  try { return normalizarCardsPorLinha(storage && storage.getItem(CHAVE_CARDS_POR_LINHA)) || PADRAO_CARDS_POR_LINHA; } catch (e) { return PADRAO_CARDS_POR_LINHA; }
}

export function salvarCardsPorLinha(valor, storage = storagePadrao_()) {
  const n = normalizarCardsPorLinha(valor);
  if (!n) return false;
  try { if (storage) storage.setItem(CHAVE_CARDS_POR_LINHA, String(n)); return !!storage; } catch (e) { return false; }
}

/** Colunas que valem de verdade numa largura de tela: a escolha no desktop, no máximo 3 até 1024px e 2 até 600px. */
export function colunasEfetivas(escolha, larguraPx) {
  const n = normalizarCardsPorLinha(escolha) || PADRAO_CARDS_POR_LINHA;
  if (typeof larguraPx !== 'number' || !Number.isFinite(larguraPx)) return n;
  if (larguraPx <= LARGURA_CELULAR_MAX) return Math.min(n, 2);
  if (larguraPx <= LARGURA_TABLET_MAX) return Math.min(n, 3);
  return n;
}

/** Aplica a escolha no contêiner da página: --cards-por-linha + data-cards-por-linha (CSS: inicio.css). */
export function aplicarCardsPorLinha(el, valor) {
  const n = normalizarCardsPorLinha(valor) || PADRAO_CARDS_POR_LINHA;
  if (!el) return n;
  el.style.setProperty('--cards-por-linha', String(n));
  el.setAttribute('data-cards-por-linha', String(n));
  return n;
}

/**
 * Cria o controle (segmented "4 5 6 7") e o devolve (ainda fora da página). `aoMudar(n)` roda depois de salvar.
 * Botões em modo "radio" (role=radio dentro de role=radiogroup), com o rótulo "Cards por linha" visível ao lado.
 */
export function criarControleCardsPorLinha(doc, { valor = PADRAO_CARDS_POR_LINHA, aoMudar = null, storage } = {}) {
  const caixa = doc.createElement('div');
  caixa.className = 'cards-linha';
  caixa.innerHTML = `
    <span class="cards-linha-rotulo" id="cardsLinhaRotulo">Cards por linha</span>
    <div class="segmented cards-linha-seg" role="radiogroup" aria-labelledby="cardsLinhaRotulo">${OPCOES_CARDS_POR_LINHA
    .map((n) => `<button type="button" role="radio" data-cards="${n}" aria-checked="false" title="${n} cards por linha">${n}</button>`).join('')}</div>`;
  const botoes = [...caixa.querySelectorAll('[data-cards]')];
  function marcar(n) {
    botoes.forEach((b) => {
      const on = Number(b.dataset.cards) === n;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('on', on);
      b.tabIndex = on ? 0 : -1;
    });
  }
  marcar(normalizarCardsPorLinha(valor) || PADRAO_CARDS_POR_LINHA);
  botoes.forEach((b, i) => {
    b.addEventListener('click', () => {
      const n = Number(b.dataset.cards);
      marcar(n);
      salvarCardsPorLinha(n, storage);
      if (typeof aoMudar === 'function') aoMudar(n);
    });
    // setas ← → andam entre as opções (padrão de radiogroup)
    b.addEventListener('keydown', (ev) => {
      const passo = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0);
      if (!passo) return;
      ev.preventDefault();
      const alvo = botoes[(i + passo + botoes.length) % botoes.length];
      alvo.focus();
      alvo.click();
    });
  });
  caixa.definirValor = (n) => marcar(normalizarCardsPorLinha(n) || PADRAO_CARDS_POR_LINHA);
  return caixa;
}

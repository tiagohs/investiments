// assets/js/pages/transacoes-ui.js
//
// 06/10/2026 (Onda 3, kit Figma): pedaços de marcação que as duas abas de Transações (aportes*.js, lancamentos.js)
// repetiam - ícone do sprite, célula de ativo do kit, chip tonal, estado vazio, seção recolhível, cores de classe.
// Só HTML/strings (sem estado); os eventos continuam em aportes.js e lancamentos.js.

import { esc } from '../util/html.js';

/** Ícone do sprite (assets/partials/shell.html) como HTML. */
export const ic = (nome, classe = 'ico') => `<svg class="${classe}" aria-hidden="true"><use href="#ico-${nome}"/></svg>`;

/** Cores de classe = a paleta do gráfico (--chart-N), as mesmas do gráfico "Investido por mês". */
export const COR_CHART = { acoes: '--chart-1', fiis: '--chart-2', rendaFixa: '--chart-3', acoesEua: '--chart-4' };
export const corClasse = (id) => COR_CHART[id] || '--md-sys-color-on-surface-variant';
/** Cor (nome da variável, sem var()) de cada "destino" de lançamento. */
export const COR_DESTINO = { transacoes: '--chart-1', transacoesUsa: '--chart-4', rendaFixa: '--chart-3', proventos: '--chart-2', proventosUsa: '--chart-4' };

/** Tonal do kit pelo "tom" antigo (good/warn/bad/na). */
export const chipTom = (tom) => `chip-tonal${tom === 'good' ? ' chip-good' : tom === 'warn' ? ' chip-warn' : tom === 'bad' ? ' chip-bad' : ''}`;

/** Célula de ativo do kit: logo + ticker pequeno em cima + nome embaixo. `linhaTopo` = HTML no lugar do ticker. */
export function ativoCelHtml(logo, ticker, nome, { href = '', linhaTopo = null } = {}) {
  const tag = href ? 'a' : 'span';
  return `<${tag} class="cel-ativo tx-ativo"${href ? ` href="${esc(href)}"` : ''}>${logo}<span class="cel-ativo-textos"><span class="cel-ativo-ticker">${linhaTopo != null ? linhaTopo : esc(ticker)}</span>${nome ? `<span class="cel-ativo-nome" title="${esc(nome)}">${esc(nome)}</span>` : ''}</span></${tag}>`;
}

/** Estado vazio do kit (.estado) com ação opcional: { rotulo, atributos } vira um botão tonal. */
export function estadoVazioHtml({ icone = 'inbox', titulo, texto = '', acao = null }) {
  return `
    <div class="estado tx-estado">
      <span class="estado-ico">${ic(icone, '')}</span>
      <p class="estado-titulo">${esc(titulo)}</p>
      ${texto ? `<p class="estado-texto">${texto}</p>` : ''}
      ${acao ? `<div class="estado-acoes"><button type="button" class="btn btn-tonal" ${acao.atributos}>${esc(acao.rotulo)}</button></div>` : ''}
    </div>`;
}

/** Seção recolhível (<details class="card tx-sec">): título + dica + seta; o estado aberto vem de estado.secoes[chave]. */
export function secaoHtml({ id, chave, titulo, dica = '', aberta = true, corpo, extraCab = '' }) {
  return `
    <details class="card tx-sec" id="${id}" data-secao="${chave}"${aberta ? ' open' : ''}>
      <summary class="tx-sec-cab"><span class="tx-sec-tit"><h2 id="${id}Titulo">${titulo}</h2>${dica ? `<span class="tx-dica">${dica}</span>` : ''}</span>${extraCab}${ic('expand-more', 'ico tx-sec-seta')}</summary>
      <div class="tx-sec-corpo">${corpo}</div>
    </details>`;
}

/** HTML de uma mensagem (com <b>) -> texto puro, pro toast. */
export function textoDeHtml(doc, html) {
  const d = doc.createElement('div');
  d.innerHTML = html;
  return d.textContent.replace(/\s+/g, ' ').trim();
}

/** Seções longas começam fechadas no celular. */
export function ehCelular(win) {
  try { return !!(win && typeof win.matchMedia === 'function' && win.matchMedia('(max-width: 599.98px)').matches); } catch (e) { return false; }
}

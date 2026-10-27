/**
 * radar-encerradas.js - 27/10/2026 (Tiago, depois de vender todo o WIZC3: "não quero que ele seja mais considerado no
 * ranking do Acompanhamento... talvez mudar o layout?").
 *
 * Conta e texto PUROS (sem DOM) das posições encerradas do Radar de oportunidades:
 *   - quem fica no ranking e quem vai pro bloco "Posições encerradas" (item.encerrada vem de PosicoesEncerradas.gs);
 *   - o plano do % desejado: o encerrado vai a 0% e, se as outras ficarem abaixo de 100%, a diferença é redistribuída
 *     na proporção do % de cada uma (se elas já somam 100% ou mais, só zera - redistribuir passaria de 100%);
 *   - o HTML do bloco recolhido e do aviso.
 * Testes: tests/posicoes-encerradas.test.js.
 */
import { esc } from '../util/html.js';
import { formatMoeda, formatNumeroPt } from '../format.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r4 = (v) => Math.round(v * 10000) / 10000;

/** O item saiu do ranking? (encerrado e sem "Voltar a acompanhar"). */
export const foraDoRanking = (item) => !!(item && item.encerrada && item.encerrada.preferencia !== 'acompanhar');

/**
 * Separa um bloco do Radar: { ativos (ficam no ranking - inclui os encerrados que você voltou a acompanhar),
 * encerradas (o bloco recolhido, sem as ocultas), ocultas }.
 */
export function separarEncerradas(itens) {
  const ativos = []; const encerradas = []; const ocultas = [];
  (itens || []).forEach((it) => {
    if (!foraDoRanking(it)) ativos.push(it);
    else if (it.encerrada.preferencia === 'oculta') ocultas.push(it);
    else encerradas.push(it);
  });
  encerradas.sort((a, b) => (a.encerrada.fim < b.encerrada.fim ? 1 : a.encerrada.fim > b.encerrada.fim ? -1 : 0)); // mais recente primeiro
  return { ativos, encerradas, ocultas };
}

/** O radar com cada bloco só com os ativos do ranking (o resto da tela não precisa saber das encerradas). */
export function radarSemEncerradas(radar) {
  if (!radar) return radar;
  const out = { ...radar };
  ['acoesNacionais', 'acoesInternacionais', 'fiis'].forEach((k) => {
    if (radar[k] && Array.isArray(radar[k].itens)) out[k] = { ...radar[k], itens: separarEncerradas(radar[k].itens).ativos };
  });
  return out;
}

/**
 * Plano do % desejado ao encerrar `ticker` num bloco (itens = o bloco inteiro). null se o encerrado já está em 0%.
 * { ticker, liberado, somaOutras, modo: 'zerar' | 'redistribuir', mudancas: [{ linha, ativo, de, para }] } - a 1ª
 * mudança é sempre o encerrado indo a 0.
 */
export function planoPercentualEncerrada(itens, ticker) {
  const lista = itens || [];
  const alvo = lista.find((i) => String(i.ativo).toUpperCase() === String(ticker).toUpperCase());
  const liberado = alvo ? num(alvo.percentualDesejado) || 0 : 0;
  if (!alvo || !(liberado > 0.00005)) return null;
  const outras = lista.filter((i) => i !== alvo && !foraDoRanking(i) && (num(i.percentualDesejado) || 0) > 0);
  const somaOutras = outras.reduce((s, i) => s + i.percentualDesejado, 0);
  const mudancas = [{ linha: alvo.linha, ativo: alvo.ativo, de: liberado, para: 0 }];
  const falta = r4(1 - somaOutras);
  if (falta <= 0.00005 || !outras.length) return { ticker: alvo.ativo, liberado, somaOutras: r4(somaOutras), modo: 'zerar', mudancas };
  // só o que falta pra 100% (nunca mais do que o encerrado tinha), na proporção de cada uma; o arredondamento sobra pra maior
  const distribuir = Math.min(falta, liberado);
  let distribuido = 0;
  const novos = outras.map((i) => {
    const extra = r4(distribuir * (i.percentualDesejado / somaOutras));
    distribuido += extra;
    return { linha: i.linha, ativo: i.ativo, de: i.percentualDesejado, para: r4(i.percentualDesejado + extra) };
  });
  const sobra = r4(distribuir - distribuido);
  if (Math.abs(sobra) > 0) {
    const maior = novos.reduce((m, n) => (n.de > m.de ? n : m), novos[0]);
    maior.para = r4(maior.para + sobra);
  }
  return { ticker: alvo.ativo, liberado, somaOutras: r4(somaOutras), modo: 'redistribuir', distribuido: distribuir, mudancas: mudancas.concat(novos) };
}

const pct = (f, casas = 1) => `${formatNumeroPt(f * 100, { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const dataBr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const dinheiro = (v, moeda) => formatMoeda(v, moeda === 'USD' ? 'USD' : 'BRL', { casas: 2 });
const sinal = (v) => (v > 0.004 ? '+' : v < -0.004 ? '−' : '');
const duracao = (dias) => (dias >= 60 ? `${Math.round(dias / 30.4)} meses` : `${dias} dia${dias === 1 ? '' : 's'}`);

/** Texto do aviso do % desejado (o que o botão principal faz). */
export function textoPlano(plano) {
  if (!plano) return '';
  const base = `${esc(plano.ticker)} foi vendido por completo e ainda tem <b>${pct(plano.liberado)}</b> desejado: a planilha continua sugerindo aporte nele.`;
  if (plano.modo === 'zerar') return `${base} As outras já somam ${pct(plano.somaOutras)}, então basta zerar.`;
  const completa = plano.somaOutras + plano.distribuido >= 0.99995;
  return completa
    ? `${base} Zerando, as outras somam ${pct(plano.somaOutras)}: os ${pct(plano.distribuido)} que faltam pra 100% vão para elas, na proporção de cada uma.`
    : `${base} Zerando, os ${pct(plano.distribuido)} dele vão para as outras, na proporção de cada uma (a soma continua em ${pct(plano.somaOutras + plano.distribuido)}).`;
}

/** Linha (HTML) de uma posição encerrada no bloco recolhido. */
export function linhaEncerradaHtml(item, { oculta = false } = {}) {
  const e = item.encerrada;
  const m = e.moeda;
  const tom = e.resultado > 0.004 ? 'good' : e.resultado < -0.004 ? 'bad' : '';
  const desde = num(e.desdeAVenda);
  const leituraVenda = desde == null ? '' : Math.abs(desde) < 0.005 ? 'no mesmo preço da venda'
    : desde < 0 ? `<span class="good">${pct(-desde)} abaixo da sua venda</span>` : `<span class="bad">${pct(desde)} acima da sua venda</span>`;
  return `<li class="radar-enc-item" data-encerrada="${esc(item.ativo)}">
  <div class="radar-enc-cab"><strong>${esc(item.ativo)}</strong><span class="radar-enc-periodo">${dataBr(e.inicio)} → ${dataBr(e.fim)} · ${duracao(e.dias)}</span>
    <span class="radar-enc-resultado mono ${tom}">${sinal(e.resultado)}${dinheiro(Math.abs(e.resultado), m)}${e.resultadoPct != null ? ` <small>(${sinal(e.resultadoPct)}${pct(Math.abs(e.resultadoPct))})</small>` : ''}</span></div>
  <dl class="radar-enc-nums">
    <div><dt>Comprou</dt><dd class="mono">${dinheiro(e.compras, m)}${e.precoMedioCompra != null ? ` <small>PM ${dinheiro(e.precoMedioCompra, m)}</small>` : ''}</dd></div>
    <div><dt>Vendeu</dt><dd class="mono">${dinheiro(e.vendas, m)}${e.precoMedioVenda != null ? ` <small>a ${dinheiro(e.precoMedioVenda, m)}</small>` : ''}</dd></div>
    <div><dt>Proventos</dt><dd class="mono">${e.proventos > 0.004 ? dinheiro(e.proventos, m) : '—'}</dd></div>
    <div><dt>Hoje</dt><dd class="mono">${num(item.precoAtual) != null ? dinheiro(item.precoAtual, m) : '—'}${leituraVenda ? ` <small>${leituraVenda}</small>` : ''}</dd></div>
  </dl>
  <div class="radar-enc-acoes"><button type="button" class="btn btn-text btn-sm" data-enc-acao="acompanhar">Voltar a acompanhar</button>${oculta ? '<button type="button" class="btn btn-text btn-sm" data-enc-acao="">Mostrar de novo</button>' : '<button type="button" class="btn btn-text btn-sm" data-enc-acao="oculta">Ocultar</button>'}</div>
</li>`;
}

/** Bloco recolhido "Posições encerradas (N)" de um bloco do Radar ('' sem nenhuma). */
export function blocoEncerradasHtml(encerradas, { ocultas = [], mostrarOcultas = false, aberto = false } = {}) {
  if (!encerradas.length && !ocultas.length) return '';
  const total = encerradas.reduce((s, i) => s + (i.encerrada.moeda === 'USD' ? 0 : i.encerrada.resultado), 0);
  const temBrl = encerradas.some((i) => i.encerrada.moeda !== 'USD');
  return `<details class="radar-encerradas"${aberto ? ' open' : ''}><summary><span>Posições encerradas <b>(${encerradas.length})</b></span>${temBrl && encerradas.length > 1 ? `<span class="radar-enc-total mono ${total >= 0 ? 'good' : 'bad'}">resultado ${sinal(total)}${formatMoeda(Math.abs(total), 'BRL', { casas: 2 })}</span>` : ''}</summary>
  <p class="hint">Vendeu tudo: saiu do ranking, das sugestões de aporte e do "X de N". O resultado é do último ciclo (da 1ª compra até a venda que zerou), com os proventos de data-com nesse período.</p>
  ${encerradas.length ? `<ul class="radar-enc-lista">${encerradas.map(linhaEncerradaHtml).join('')}</ul>` : ''}
  ${ocultas.length ? (mostrarOcultas
    ? `<ul class="radar-enc-lista radar-enc-ocultas">${ocultas.map((i) => linhaEncerradaHtml(i, { oculta: true })).join('')}</ul>`
    : `<p class="hint">${ocultas.length} oculta${ocultas.length > 1 ? 's' : ''}. <button type="button" class="btn btn-text btn-sm" data-enc-mostrar-ocultas>Mostrar</button></p>`) : ''}
</details>`;
}

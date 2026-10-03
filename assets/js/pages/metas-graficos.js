/**
 * metas-graficos.js - 03/10/2026: gráficos da tela Metas e Objetivos (SVG
 * puro, como os outros gráficos do site) + a camada de hover/toque.
 *
 * Tiago: "traga gráficos e projeções de como tem sido a meta; no exemplo de
 * renda passiva, como tem sido a evolução mensal; nesses gráficos e no
 * gráfico que está lá, passando o mouse, quero ver o valor mensal".
 *
 *  - graficoProjecaoSvg  evolução projetada (no seu ritmo x necessária x
 *                        alvo), com o prazo e os marcos (1º milhão...)
 *  - graficoHistoricoSvg o valor da meta mês a mês (área) + o aporte de cada
 *                        mês (barras, painel de baixo, escala própria); no
 *                        modo "mês a mês", aporte x rendimento de cada mês
 *  - graficoRendaSvg     proventos de cada mês (barras) + média de 12 meses
 *                        (linha) + a meta (tracejada)
 *  - ligarTooltipGrafico crosshair + balão com os valores do mês: mouse,
 *                        toque (toca e arrasta) e teclado (setas, Esc)
 * Cada SVG leva em data-* a geometria do eixo X (margem, largura, n) - é o
 * que a camada de hover usa pra achar o mês sob o ponteiro.
 */

import { serieProjecao, rotuloMes } from './metas-calc.js';
import { formatMoeda } from '../metas-card.js';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "1,2 mi" / "35 mil" / "820" (eixo Y). */
export function curto(v) {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e7 ? 0 : 1 })} mi`;
  if (a >= 1e3) return `${s}${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e4 ? 0 : 1 })} mil`;
  return `${s}${Math.round(a)}`;
}

/** "mar/27" (eixo X compacto) */
function mesEixo(mes, longo) {
  const m = Number(mes.slice(5, 7));
  return longo ? mes.slice(0, 4) : `${MESES_CURTOS[m - 1]}/${mes.slice(2, 4)}`;
}

/** Topo "redondo" do eixo e os 5 ticks. */
function escala(maxBruto, minBruto = 0) {
  const max = maxBruto > 0 ? maxBruto : 1;
  const min = Math.min(0, minBruto);
  const span = max - min;
  const mag = Math.pow(10, Math.floor(Math.log10(span / 4 || 1)));
  const passo = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p * 4 >= span) || mag * 10;
  const topo = Math.ceil(max / passo) * passo;
  const base = Math.floor(min / passo) * passo;
  const ticks = [];
  for (let v = base; v <= topo + passo / 2; v += passo) ticks.push(v);
  return { topo, base, ticks };
}

function ticksXHtml(pontos, x, H, w) {
  const n = pontos.length;
  if (!n) return '';
  const longo = n > 36;
  const cabe = Math.max(2, Math.floor(w / (longo ? 46 : 62)));
  let passo = Math.max(1, Math.ceil((n - 1) / cabe));
  if (longo) passo = Math.max(12, Math.ceil(passo / 12) * 12);
  const marcas = [];
  for (let i = 0; i < n; i++) {
    const ehJan = pontos[i].mes.slice(5, 7) === '01';
    if (longo ? (ehJan && (Number(pontos[i].mes.slice(0, 4)) % Math.max(1, passo / 12) === 0)) : i % passo === 0) marcas.push(i);
  }
  if (!longo && marcas[marcas.length - 1] !== n - 1) {
    if (marcas.length && x(n - 1) - x(marcas[marcas.length - 1]) < 50) marcas.pop();
    marcas.push(n - 1);
  }
  return marcas.map((i) => {
    const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    return `<text x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="${anchor}" class="mt-g-eixo">${mesEixo(pontos[i].mes, longo)}</text>`;
  }).join('');
}

function gradeY(esc, y, m, L) {
  return esc.ticks.map((v) => `<line x1="${m.e}" x2="${L - m.d}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="mt-g-grade${v === 0 ? ' zero' : ''}"/><text x="${m.e - 7}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" class="mt-g-eixo">${curto(v)}</text>`).join('');
}

function caminho(pontos, campo, x, y) {
  let d = '';
  let aberto = false;
  pontos.forEach((p, i) => {
    const v = p[campo];
    if (v == null || !Number.isFinite(v)) { aberto = false; return; }
    d += `${aberto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    aberto = true;
  });
  return d.trim();
}

function camadaHover(m, L, H, n, rotulo) {
  return `<line class="mt-g-cruz" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" hidden/>`
    + `<rect class="mt-g-hit" x="${m.e}" y="${m.t}" width="${Math.max(1, L - m.e - m.d)}" height="${Math.max(1, H - m.t - m.b)}" fill="transparent" data-rotulo="${rotulo}"/>`;
}

function abreSvg(classe, L, H, m, n, aria) {
  return `<svg class="mt-grafico ${classe}" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}" role="img" tabindex="0" aria-label="${aria}" data-me="${m.e}" data-md="${m.d}" data-l="${L}" data-n="${n}">`;
}

/**
 * Evolução projetada. `pontos` (opcional) = serieProjecao já recortada;
 * `marcos` = metas-calc!marcosProjecao (no ritmo) - viram bolinhas na curva.
 */
export function graficoProjecaoSvg(c, { largura = 640, altura = 230, hoje, pontos = null, marcos = [] } = {}) {
  const pts = pontos || serieProjecao(c, { hoje });
  if (pts.length < 2) return '<p class="hint">Sem dados pra projetar (falta o alvo).</p>';
  const L = Math.max(280, largura); const H = altura;
  const m = { e: 52, d: 12, t: 16, b: 26 };
  const w = L - m.e - m.d; const h = H - m.t - m.b;
  const maxDados = Math.max(...pts.map((p) => Math.max(p.ritmo || 0, p.necessaria || 0)));
  const mostraAlvo = c.alvoBRL && c.alvoBRL <= maxDados * 2.2;
  const esc = escala(Math.max(maxDados, mostraAlvo ? c.alvoBRL : 0) * 1.04);
  const x = (i) => m.e + (i / (pts.length - 1)) * w;
  const y = (v) => m.t + h - ((v - esc.base) / (esc.topo - esc.base)) * h;
  const ultimo = pts[pts.length - 1];
  const area = `${caminho(pts, 'ritmo', x, y)} L${x(pts.length - 1).toFixed(1)},${y(Math.max(0, esc.base)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(0, esc.base)).toFixed(1)} Z`;
  const idxPrazo = c.dataAlvo ? pts.findIndex((p) => p.mes === c.dataAlvo) : -1;
  const prazo = idxPrazo > 0 ? `<line x1="${x(idxPrazo).toFixed(1)}" x2="${x(idxPrazo).toFixed(1)}" y1="${m.t}" y2="${H - m.b}" class="mt-g-prazo"/><text x="${(x(idxPrazo) - 4).toFixed(1)}" y="${m.t + 9}" text-anchor="end" class="mt-g-rot-prazo">prazo ${rotuloMes(c.dataAlvo)}</text>` : '';
  const idxMes = new Map(pts.map((p, i) => [p.mes, i]));
  const bolas = (marcos || []).filter((mc) => !mc.ja && mc.mes && idxMes.has(mc.mes)).map((mc) => {
    const i = idxMes.get(mc.mes);
    const yy = y(pts[i].ritmo);
    return `<g class="mt-g-marco"><circle cx="${x(i).toFixed(1)}" cy="${yy.toFixed(1)}" r="5"/>${mc.rotulo === 'Alvo' ? '' : `<text x="${x(i).toFixed(1)}" y="${(yy - 9).toFixed(1)}" text-anchor="middle">${mc.rotulo.replace(/º milhão/, ' mi').replace(/% do alvo/, '%')}</text>`}</g>`;
  }).join('');
  return `${abreSvg('mt-g-projecao', L, H, m, pts.length, `Evolução projetada: no seu ritmo chega a ${formatMoeda(ultimo.ritmo)} em ${rotuloMes(ultimo.mes)}; alvo ${formatMoeda(c.alvoBRL)}`)}
  ${gradeY(esc, y, m, L)}
  ${ticksXHtml(pts, x, H, w)}
  <path d="${area}" class="mt-g-area"/>
  ${mostraAlvo ? `<line x1="${m.e}" x2="${L - m.d}" y1="${y(c.alvoBRL).toFixed(1)}" y2="${y(c.alvoBRL).toFixed(1)}" class="mt-g-alvo"/><text x="${m.e + 6}" y="${(y(c.alvoBRL) - 6).toFixed(1)}" text-anchor="start" class="mt-g-rot-alvo">alvo ${formatMoeda(c.alvoBRL, 'BRL', { casas: 0 })}</text>` : ''}
  ${prazo}
  ${pts[0].necessaria != null ? `<path d="${caminho(pts, 'necessaria', x, y)}" class="mt-g-necessaria"/>` : ''}
  <path d="${caminho(pts, 'ritmo', x, y)}" class="mt-g-ritmo"/>
  ${bolas}
  <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(ultimo.ritmo).toFixed(1)}" r="3.5" class="mt-g-ponto"/>
  ${camadaHover(m, L, H, pts.length, 'Passe o mouse ou toque para ver cada mês')}
</svg>`;
}

/**
 * Histórico: meses = [{ mes, valor, fluxo }]. modo 'acumulado' (área do
 * valor + barras do aporte embaixo) ou 'mensal' (aporte x rendimento de cada mês).
 */
export function graficoHistoricoSvg(meses, { largura = 640, altura = 250, alvo = null, modo = 'acumulado' } = {}) {
  if (!meses || meses.length < 2) return '<p class="hint">Ainda não há histórico suficiente (precisa de pelo menos 2 meses com valor).</p>';
  const L = Math.max(280, largura); const H = altura;
  const m = { e: 52, d: 12, t: 14, b: 26 };
  const w = L - m.e - m.d;
  const n = meses.length;
  const x = (i) => m.e + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const larg = Math.max(2, Math.min(14, (w / n) * 0.6));
  if (modo === 'mensal') {
    const linhas = meses.map((p, i) => ({ ...p, rend: i === 0 ? 0 : p.valor - meses[i - 1].valor - (p.fluxo || 0) }));
    const vals = linhas.slice(1).flatMap((p) => [p.fluxo || 0, p.rend]);
    const esc = escala(Math.max(0, ...vals) * 1.05, Math.min(0, ...vals) * 1.05);
    const h = H - m.t - m.b;
    const y = (v) => m.t + h - ((v - esc.base) / (esc.topo - esc.base)) * h;
    const y0 = y(0);
    const meia = Math.max(1.5, larg / 2);
    const barras = linhas.slice(1).map((p, k) => {
      const i = k + 1;
      const ba = `<rect class="mt-g-bar-aporte${(p.fluxo || 0) < 0 ? ' neg' : ''}" x="${(x(i) - meia - 1).toFixed(1)}" y="${Math.min(y(p.fluxo || 0), y0).toFixed(1)}" width="${meia.toFixed(1)}" height="${Math.max(0.5, Math.abs(y(p.fluxo || 0) - y0)).toFixed(1)}" rx="1.5"/>`;
      const br = `<rect class="mt-g-bar-rend${p.rend < 0 ? ' neg' : ''}" x="${(x(i) + 1).toFixed(1)}" y="${Math.min(y(p.rend), y0).toFixed(1)}" width="${meia.toFixed(1)}" height="${Math.max(0.5, Math.abs(y(p.rend) - y0)).toFixed(1)}" rx="1.5"/>`;
      return ba + br;
    }).join('');
    return `${abreSvg('mt-g-historico mensal', L, H, m, n, 'Mês a mês: aporte e rendimento de cada mês')}
  ${gradeY(esc, y, m, L)}
  ${ticksXHtml(meses, x, H, w)}
  ${barras}
  ${camadaHover(m, L, H, n, 'Passe o mouse ou toque para ver cada mês')}
</svg>`;
  }
  const hBar = Math.round((H - m.t - m.b) * 0.26);
  const gap = 14;
  const h1 = H - m.t - m.b - hBar - gap;
  const maxV = Math.max(...meses.map((p) => p.valor));
  const mostraAlvo = alvo && alvo <= maxV * 1.6;
  const esc = escala(Math.max(maxV, mostraAlvo ? alvo : 0) * 1.04);
  const y = (v) => m.t + h1 - ((v - esc.base) / (esc.topo - esc.base)) * h1;
  const fl = meses.map((p) => p.fluxo || 0);
  const maxF = Math.max(1, ...fl.map(Math.abs));
  const yb0 = m.t + h1 + gap + hBar / 2;
  const yb = (v) => yb0 - (v / maxF) * (hBar / 2);
  const area = `${caminho(meses, 'valor', x, y)} L${x(n - 1).toFixed(1)},${y(Math.max(0, esc.base)).toFixed(1)} L${x(0).toFixed(1)},${y(Math.max(0, esc.base)).toFixed(1)} Z`;
  const barras = meses.map((p, i) => {
    const v = p.fluxo || 0;
    if (Math.abs(v) < 0.5) return '';
    return `<rect class="mt-g-bar-aporte${v < 0 ? ' neg' : ''}" x="${(x(i) - larg / 2).toFixed(1)}" y="${Math.min(yb(v), yb0).toFixed(1)}" width="${larg.toFixed(1)}" height="${Math.max(0.5, Math.abs(yb(v) - yb0)).toFixed(1)}" rx="1.5"/>`;
  }).join('');
  const ult = meses[n - 1];
  return `${abreSvg('mt-g-historico', L, H, m, n, `Histórico: de ${formatMoeda(meses[0].valor, 'BRL', { casas: 0 })} em ${rotuloMes(meses[0].mes)} a ${formatMoeda(ult.valor, 'BRL', { casas: 0 })} em ${rotuloMes(ult.mes)}`)}
  ${gradeY(esc, y, m, L)}
  ${ticksXHtml(meses, x, H, w)}
  <path d="${area}" class="mt-g-area hist"/>
  ${mostraAlvo ? `<line x1="${m.e}" x2="${L - m.d}" y1="${y(alvo).toFixed(1)}" y2="${y(alvo).toFixed(1)}" class="mt-g-alvo"/><text x="${L - m.d}" y="${(y(alvo) - 6).toFixed(1)}" text-anchor="end" class="mt-g-rot-alvo">alvo ${formatMoeda(alvo, 'BRL', { casas: 0 })}</text>` : ''}
  <path d="${caminho(meses, 'valor', x, y)}" class="mt-g-ritmo hist"/>
  <circle cx="${x(n - 1).toFixed(1)}" cy="${y(ult.valor).toFixed(1)}" r="3.5" class="mt-g-ponto hist"/>
  <line x1="${m.e}" x2="${L - m.d}" y1="${yb0.toFixed(1)}" y2="${yb0.toFixed(1)}" class="mt-g-grade zero"/>
  <text x="${m.e - 7}" y="${(yb0 + 3.5).toFixed(1)}" text-anchor="end" class="mt-g-eixo">aporte</text>
  ${barras}
  ${camadaHover(m, L, H, n, 'Passe o mouse ou toque para ver cada mês')}
</svg>`;
}

/** Renda mensal: renda = [{ mes, valor, media12 }] (o último pode ser parcial). */
export function graficoRendaSvg(renda, { largura = 640, altura = 220, alvo = null, mesAtual = null } = {}) {
  if (!renda || renda.length < 2) return '<p class="hint">Ainda não há proventos suficientes pra montar a evolução mensal.</p>';
  const L = Math.max(280, largura); const H = altura;
  const m = { e: 46, d: 12, t: 14, b: 26 };
  const w = L - m.e - m.d; const h = H - m.t - m.b;
  const n = renda.length;
  const maxV = Math.max(...renda.map((p) => Math.max(p.valor, p.media12 || 0)));
  const mostraAlvo = alvo && alvo <= maxV * 2;
  const esc = escala(Math.max(maxV, mostraAlvo ? alvo : 0) * 1.08);
  const x = (i) => m.e + ((i + 0.5) / n) * w;
  const y = (v) => m.t + h - ((v - esc.base) / (esc.topo - esc.base)) * h;
  const larg = Math.max(2, Math.min(16, (w / n) * 0.62));
  const barras = renda.map((p, i) => `<rect class="mt-g-bar-renda${p.mes === mesAtual ? ' parcial' : ''}" x="${(x(i) - larg / 2).toFixed(1)}" y="${y(Math.max(0, p.valor)).toFixed(1)}" width="${larg.toFixed(1)}" height="${Math.max(0.5, y(0) - y(Math.max(0, p.valor))).toFixed(1)}" rx="2"/>`).join('');
  // eixo X com o x "no meio da barra": reaproveita ticksXHtml com um x deslocado
  const mHover = { ...m };
  return `<svg class="mt-grafico mt-g-renda" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}" role="img" tabindex="0" aria-label="Renda passiva mês a mês" data-me="${m.e}" data-md="${m.d}" data-l="${L}" data-n="${n}" data-barras="1">
  ${gradeY(esc, y, m, L)}
  ${ticksXHtml(renda, x, H, w)}
  ${barras}
  ${mostraAlvo ? `<line x1="${m.e}" x2="${L - m.d}" y1="${y(alvo).toFixed(1)}" y2="${y(alvo).toFixed(1)}" class="mt-g-alvo"/><text x="${L - m.d}" y="${(y(alvo) - 6).toFixed(1)}" text-anchor="end" class="mt-g-rot-alvo">meta ${formatMoeda(alvo, 'BRL', { casas: 0 })}/mês</text>` : ''}
  <path d="${caminho(renda, 'media12', x, y)}" class="mt-g-media"/>
  ${camadaHover(mHover, L, H, n, 'Passe o mouse ou toque para ver cada mês')}
</svg>`;
}

/**
 * Hover/toque/teclado num gráfico desenhado acima. `conteudo(i)` devolve o
 * HTML do balão do mês i. Idempotente por caixa (redesenhar = religar).
 */
export function ligarTooltipGrafico(caixa, conteudo) {
  const svg = caixa && caixa.querySelector('svg.mt-grafico');
  if (!svg) return null;
  const doc = caixa.ownerDocument;
  const n = Number(svg.dataset.n) || 0;
  const me = Number(svg.dataset.me) || 0;
  const md = Number(svg.dataset.md) || 0;
  const L = Number(svg.dataset.l) || 1;
  const barras = svg.dataset.barras === '1';
  let tt = caixa.querySelector('.mt-tt');
  if (!tt) {
    tt = doc.createElement('div');
    tt.className = 'mt-tt';
    tt.setAttribute('role', 'status');
    tt.setAttribute('aria-live', 'polite');
    tt.hidden = true;
    caixa.appendChild(tt);
  }
  const cruz = svg.querySelector('.mt-g-cruz');
  let atual = -1;
  const xDe = (i) => (barras ? me + ((i + 0.5) / n) * (L - me - md) : me + (n <= 1 ? 0 : (i / (n - 1)) * (L - me - md)));
  function mostrar(i) {
    if (i < 0 || i >= n) return;
    atual = i;
    const xv = xDe(i);
    if (cruz) { cruz.setAttribute('x1', xv.toFixed(1)); cruz.setAttribute('x2', xv.toFixed(1)); cruz.removeAttribute('hidden'); }
    tt.innerHTML = conteudo(i);
    tt.hidden = false;
    const larguraCaixa = caixa.clientWidth || L;
    const escalaX = (svg.getBoundingClientRect && svg.getBoundingClientRect().width) ? svg.getBoundingClientRect().width / L : 1;
    const px = xv * escalaX;
    const ttw = tt.offsetWidth || 160;
    let left = px + 12;
    if (left + ttw > larguraCaixa - 4) left = Math.max(4, px - ttw - 12);
    tt.style.left = `${Math.round(left)}px`;
  }
  function esconder() {
    atual = -1;
    tt.hidden = true;
    if (cruz) cruz.setAttribute('hidden', '');
  }
  function indiceDoEvento(ev) {
    const r = svg.getBoundingClientRect();
    if (!r || !r.width) return -1;
    const xv = ((ev.clientX - r.left) / r.width) * L;
    const frac = (xv - me) / (L - me - md);
    const i = barras ? Math.floor(frac * n) : Math.round(frac * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  }
  if (svg._mtTooltip) return svg._mtTooltip;
  svg.addEventListener('pointermove', (ev) => mostrar(indiceDoEvento(ev)));
  svg.addEventListener('pointerdown', (ev) => mostrar(indiceDoEvento(ev)));
  svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType !== 'touch') esconder(); });
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      mostrar(atual < 0 ? n - 1 : Math.max(0, Math.min(n - 1, atual + (ev.key === 'ArrowRight' ? 1 : -1))));
    } else if (ev.key === 'Home') { ev.preventDefault(); mostrar(0); } else if (ev.key === 'End') { ev.preventDefault(); mostrar(n - 1); } else if (ev.key === 'Escape') esconder();
  });
  svg.addEventListener('focus', () => { if (atual < 0) mostrar(n - 1); });
  svg.addEventListener('blur', esconder);
  svg._mtTooltip = { mostrar, esconder };
  return svg._mtTooltip;
}

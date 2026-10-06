/**
 * charts/xy.js - motor dos gráficos de LINHA e de ÁREA (eixo X por índice/valor, eixo Y único):
 *   - linha: 1..N séries; a principal (2-3px) + comparativas pontilhadas finas; área opcional sob a principal;
 *   - área: camadas empilhadas com curvas suaves em tons do mesmo matiz (rampa) ou cores categóricas.
 * Interação: crosshair que "gruda" no ponto mais próximo, tooltip escuro multilinha, ponto com halo (anel de 2px na
 * cor da superfície), hover/legenda destacam a série e esmaecem as outras, setas/Home/End/Esc percorrem os pontos,
 * tabela acessível alternativa. Animação: linha se desenha (stroke-dashoffset 700ms), área sobe da base com fade (500ms),
 * trocar dados MORFA (300ms) em vez de redesenhar; tudo desligado com prefers-reduced-motion.
 * Uso: ver criarGraficoLinha / criarGraficoArea (index.js). 05/10/2026.
 */
import {
  no, atr, esvaziar, uid, reconciliador, lerp, limitar, ehNum, r1,
  escalaLinear, ticksAgradaveis, indicesDeRotulos, caminhoLinha, caminhoSuave, caminhoArea,
  EASE_ENTRADA, EASE_PADRAO, DUR, animar, larguraDe, observarLargura, corSerie, corRampa,
  formatarEixoPadrao, formatarValorPadrao, rotuloDe, textoDoPonto, comPadroes,
} from './base.js';
import { criarCasca, ligarTeclado } from './casca.js';
import { criarCardGrafico } from './card.js';

const PADROES = {
  tipo: 'linha', series: [], eixoX: [], altura: 240, ticksY: 4, zero: false, suave: undefined, area: false, empilhado: true,
  total: false, legenda: 'auto', alternarSeries: true, animar: true, aria: '', largura: 640, maxRotulosX: 0, tabela: true,
};

/** Normaliza as opções (cores estáveis por posição ORIGINAL, flags derivadas). */
function normalizar(op) {
  const o = comPadroes(PADROES, op);
  o.formatarY = o.formatarY || formatarEixoPadrao;
  o.formatarValor = o.formatarValor || (op.formatarY ? op.formatarY : formatarValorPadrao);
  if (o.suave === undefined) o.suave = o.tipo === 'area';
  const unica = o.series.length === 1;
  const temComparativa = o.series.some((s) => s.pontilhada);
  o.series = o.series.map((s, i) => {
    const principal = s.principal ?? (unica || (o.tipo === 'linha' && i === 0 && temComparativa));
    return {
      ...s, id: String(s.id ?? s.nome ?? i), nome: s.nome ?? `Série ${i + 1}`, principal,
      cor: s.cor != null && typeof s.cor === 'string' ? s.cor
        : (o.tipo === 'area' && o.tons !== 'categorica' && o.empilhado ? corRampa(i, o.series.length) : corSerie(s.cor, i)),
      largura: s.largura ?? (s.pontilhada ? 1.5 : (principal && temComparativa ? 3 : 2)),
    };
  });
  return o;
}

const itemX = (op, i) => op.eixoX[i];
const rotuloX = (op, i) => rotuloDe(itemX(op, i));
const valorX = (op, i) => { const it = itemX(op, i); return it && typeof it === 'object' && ehNum(it.valor) ? it.valor : null; };

/** Constrói a geometria (em px) pra largura W; `ocultos` = ids de séries desligadas na legenda. */
export function construirModelo(op, W, ocultos = new Set()) {
  const H = op.altura;
  const visiveis = op.series.filter((s) => !ocultos.has(s.id));
  const n = Math.max(op.eixoX.length, ...op.series.map((s) => (s.valores || []).length), 0);
  const empilha = op.tipo === 'area' && op.empilhado;
  // domínio Y
  let min = Infinity; let max = -Infinity;
  const pilhas = [];
  if (empilha) {
    const acc = new Array(n).fill(0);
    for (const s of visiveis) {
      const topo = []; const base = [];
      for (let i = 0; i < n; i++) { const v = ehNum(s.valores[i]) ? s.valores[i] : 0; base.push(acc[i]); acc[i] += v; topo.push(acc[i]); }
      pilhas.push({ topo, base });
    }
    for (const t of acc) { max = Math.max(max, t); min = Math.min(min, t); }
    min = Math.min(min, 0);
  } else {
    for (const s of visiveis) for (const v of s.valores || []) if (ehNum(v)) { min = Math.min(min, v); max = Math.max(max, v); }
    if (op.tipo === 'area') min = Math.min(min, 0);
  }
  if (!ehNum(min) || !ehNum(max)) { min = 0; max = 1; }
  const zero = op.zero || op.tipo === 'area';
  const tk = ticksAgradaveis(min, max, op.ticksY, { zero });
  const rotY = tk.ticks.map((v) => op.formatarY(v));
  const maxLen = Math.max(...rotY.map((t) => t.length), 1);
  const padL = limitar(Math.round(maxLen * 6.6 + 16), 36, 96);
  const padR = 14; const padT = 12; const padB = 30;
  const plotW = Math.max(W - padL - padR, 10); const plotH = Math.max(H - padT - padB, 10);
  const y = escalaLinear([tk.min, tk.max], [padT + plotH, padT]);
  // X: por valor numérico (datas/timestamps) ou por índice
  const numericoX = n > 0 && Array.from({ length: n }, (_, i) => valorX(op, i)).every(ehNum);
  let xs;
  if (numericoX) {
    const vs = Array.from({ length: n }, (_, i) => valorX(op, i));
    const sx = escalaLinear([Math.min(...vs), Math.max(...vs)], [padL, padL + plotW]);
    xs = vs.map((v) => sx(v));
  } else {
    xs = Array.from({ length: n }, (_, i) => (n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1)));
  }
  const maxRot = op.maxRotulosX || Math.max(2, Math.floor(plotW / 72));
  const comTexto = Array.from({ length: n }, (_, i) => i).filter((i) => rotuloX(op, i) !== '');
  const idxRot = indicesDeRotulos(comTexto.length, maxRot).map((k) => comTexto[k]);
  const ticksX = idxRot.map((i) => ({ i, x: xs[i], rotulo: rotuloX(op, i), ancora: i === 0 && n > 1 ? 'start' : (i === n - 1 && n > 1 ? 'end' : 'middle') }));
  const baseY = y(Math.max(tk.min, Math.min(0, tk.max)));
  const series = visiveis.map((s, k) => {
    const pts = []; let top = null; let base = null;
    if (empilha) {
      top = pilhas[k].topo.map((v, i) => ({ x: xs[i], y: y(v) }));
      base = pilhas[k].base.map((v, i) => ({ x: xs[i], y: y(v) }));
      for (let i = 0; i < n; i++) pts.push(top[i]);
    } else {
      for (let i = 0; i < n; i++) { const v = s.valores[i]; pts.push(ehNum(v) ? { x: xs[i], y: y(v), v } : null); }
    }
    const comArea = op.tipo === 'area' || s.area || (op.area && s.principal);
    // 06/10/2026 (Onda 3, Transações): `marcas` = desenha uma bolinha em cada valor da série (raio opcional em `raios[i]`); `semLinha` esconde o traço (série só de marcas)
    return { id: s.id, nome: s.nome, cor: s.cor, pontilhada: !!s.pontilhada, largura: s.largura, principal: s.principal, pts, top, base, comArea, empilha, marcas: !!s.marcas, raios: s.raios, semLinha: !!s.semLinha };
  });
  return {
    W, H, padL, padR, padT, padB, plotW, plotH, n, xs, baseY, yEsc: y,
    ticksY: tk.ticks.map((v, i) => ({ v, y: y(v), rotulo: rotY[i] })), ticksX, series,
  };
}

/** Reamostra uma polilinha (lista de {x,y}) pra `m` pontos por posição relativa (morfar séries de tamanhos diferentes). */
export function reamostrar(pts, m) {
  if (pts.length === m) return pts;
  if (pts.length === 1) return Array.from({ length: m }, () => ({ ...pts[0] }));
  const r = [];
  for (let j = 0; j < m; j++) {
    const pos = (m === 1 ? 0 : (j * (pts.length - 1)) / (m - 1)); const a = Math.floor(pos); const b = Math.min(a + 1, pts.length - 1); const f = pos - a;
    r.push({ x: lerp(pts[a].x, pts[b].x, f), y: lerp(pts[a].y, pts[b].y, f) });
  }
  return r;
}
const semLacuna = (pts) => pts.length > 0 && pts.every(Boolean);
const lerpPts = (a, b, t) => a.map((p, i) => ({ x: lerp(p.x, b[i].x, t), y: lerp(p.y, b[i].y, t) }));

/**
 * Interpola dois modelos (série a série): devolve [{ ...série, pts, top, base, alfa }] pra desenhar no instante t.
 * Séries novas surgem (alfa 0 -> 1) a partir da linha de base; as que saem esmaecem. Com lacunas não há morfo (troca direta).
 */
export function interpolarSeries(a, b, t) {
  const ida = new Map(a.series.map((s) => [s.id, s]));
  const out = [];
  for (const sb of b.series) {
    const sa = ida.get(sb.id);
    if (!sa) {
      const plano = sb.pts.map((p) => (p ? { x: p.x, y: b.baseY } : null));
      out.push({ ...sb, pts: semLacuna(sb.pts) ? lerpPts(plano, sb.pts, t) : sb.pts, top: sb.top && lerpPts(sb.top.map((p) => ({ x: p.x, y: b.baseY })), sb.top, t), base: sb.base, alfa: t });
      continue;
    }
    if (!semLacuna(sa.pts) || !semLacuna(sb.pts)) { out.push({ ...sb, alfa: 1 }); continue; }
    const m = Math.max(sa.pts.length, sb.pts.length);
    const pts = lerpPts(reamostrar(sa.pts, m), reamostrar(sb.pts, m), t);
    const top = sb.top && sa.top ? lerpPts(reamostrar(sa.top, m), reamostrar(sb.top, m), t) : sb.top;
    const base = sb.base && sa.base ? lerpPts(reamostrar(sa.base, m), reamostrar(sb.base, m), t) : sb.base;
    out.push({ ...sb, pts, top, base, alfa: 1 });
  }
  const idb = new Set(b.series.map((s) => s.id));
  for (const sa of a.series) if (!idb.has(sa.id)) out.push({ ...sa, alfa: 1 - t });
  return out;
}

/** Cria o gráfico XY completo dentro de `el`. */
export function criarXY(el, opcoes) {
  let op = normalizar(opcoes || {});
  const doc = el.ownerDocument; const win = doc.defaultView;
  let cartao = null; let montagem = el;
  if (opcoes && opcoes.card) {
    cartao = criarCardGrafico(el, { altura: op.altura, ...opcoes.card });
    montagem = cartao.corpo;
  }
  const casca = criarCasca(montagem, { tipo: op.tipo, aria: op.aria, legenda: op.legenda === false ? false : 'baixo' });
  const { svg } = casca;
  const clipId = uid('clip');
  const defs = no(doc, 'defs', null, svg);
  const clip = no(doc, 'clipPath', { id: clipId }, defs);
  const clipRect = no(doc, 'rect', { x: 0, y: 0, width: 0, height: 0 }, clip);
  const gEixos = no(doc, 'g', { class: 'chart-eixos' }, svg);
  const gAreas = no(doc, 'g', { class: 'chart-areas' }, svg);
  const gLinhas = no(doc, 'g', { class: 'chart-linhas' }, svg);
  const gMarcas = no(doc, 'g', { class: 'chart-marcas', 'aria-hidden': 'true' }, svg);
  const gHover = no(doc, 'g', { class: 'chart-hover' }, svg);
  const cruz = no(doc, 'line', { class: 'chart-cruz', 'aria-hidden': 'true' }, gHover);
  const areas = reconciliador(gAreas, (id) => no(doc, 'path', { class: 'chart-area', 'data-id': id }));
  const linhas = reconciliador(gLinhas, (id) => no(doc, 'path', { class: 'chart-linha', 'data-id': id, fill: 'none' }));
  const pontos = reconciliador(gHover, (id) => { const g = no(doc, 'g', { class: 'chart-pto', 'data-id': id, 'aria-hidden': 'true' }); no(doc, 'circle', { class: 'chart-pto-halo', r: 10 }, g); no(doc, 'circle', { class: 'chart-pto-core', r: 5 }, g); return g; });

  const ocultos = new Set();
  let modelo = null; let W = larguraDe(montagem, op.largura);
  let anim = null; let animMorfo = null; let eixosSaindo = null; let indiceAtivo = -1; let destruido = false;

  /* ------------------------------ desenho ------------------------------ */
  function desenharEixos(grupo, m) {
    esvaziar(grupo);
    for (const t of m.ticksY) {
      no(doc, 'line', { class: `chart-grade${t.v === 0 ? ' is-zero' : ''}`, x1: m.padL, x2: m.padL + m.plotW, y1: r1(t.y), y2: r1(t.y) }, grupo);
      no(doc, 'text', { class: 'chart-eixo chart-eixo-y', x: m.padL - 8, y: r1(t.y), 'dominant-baseline': 'central', 'text-anchor': 'end', texto: t.rotulo }, grupo);
    }
    for (const t of m.ticksX) {
      no(doc, 'line', { class: 'chart-grade chart-grade-x', x1: r1(t.x), x2: r1(t.x), y1: m.padT, y2: m.padT + m.plotH }, grupo);
      no(doc, 'text', { class: 'chart-eixo chart-eixo-x', x: r1(t.x), y: m.padT + m.plotH + 20, 'text-anchor': t.ancora, texto: t.rotulo }, grupo);
    }
  }

  /** Desenha `lista` (séries já interpoladas) com os progressos de entrada: el = linha/clip, ea = área. */
  function desenharSeries(lista, m, el = 1, ea = 1) {
    const emEntrada = el < 1 || ea < 1;
    const ordenadas = [...lista].sort((a, b) => Number(!!a.principal) - Number(!!b.principal));
    for (const s of lista) {
      const alvoDestaque = casca.destaque === s.id;
      if (s.comArea) {
        const p = areas.obter(s.id);
        const d = s.empilha ? caminhoArea(s.top, s.base, op.suave) : caminhoArea(s.pts.filter(Boolean), s.pts.filter(Boolean).map((q) => ({ x: q.x, y: m.baseY })), op.suave);
        atr(p, { d, fill: s.cor, 'data-ativo': alvoDestaque ? '1' : null, opacity: ea < 1 || s.alfa < 1 ? r1(Math.min(ea, s.alfa) * 100) / 100 : null,
          transform: ea < 1 ? `translate(0 ${r1(m.baseY * (1 - ea))}) scale(1 ${Math.max(ea, 0.001)})` : null });
        p.classList.toggle('chart-area--camada', !!s.empilha);
        p.classList.toggle('chart-area--lavada', !s.empilha);
      }
    }
    for (const s of ordenadas) {
      if (s.semLinha) continue;
      const p = linhas.obter(s.id);
      const d = op.suave ? caminhoSuave(s.pts) : caminhoLinha(s.pts);
      const entrandoSolida = emEntrada && !s.pontilhada;
      atr(p, {
        d, stroke: s.cor, 'stroke-width': s.largura, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        pathLength: entrandoSolida ? 1 : null, 'stroke-dasharray': entrandoSolida ? '1 1' : null, 'stroke-dashoffset': entrandoSolida ? r1((1 - el) * 1000) / 1000 : null,
        opacity: s.alfa < 1 ? r1(s.alfa * 100) / 100 : null, 'clip-path': emEntrada && s.pontilhada ? `url(#${clipId})` : null,
      });
      p.classList.toggle('is-pont', s.pontilhada);
      p.classList.toggle('is-princ', !!s.principal);
      if (s.empilha) p.classList.add('is-camada');
      p.classList.toggle('is-destaque', casca.destaque === s.id);
    }
    areas.limpar();
    linhas.limpar();
    esvaziar(gMarcas);
    for (const s of lista) {
      if (!s.marcas) continue;
      s.pts.forEach((q, i) => {
        if (!q) return;
        no(doc, 'circle', { class: 'chart-marca', cx: r1(q.x), cy: r1(q.y), r: r1(((s.raios && s.raios[i]) || 4) * Math.min(1, 0.4 + el)), style: `--cor:${s.cor}`, opacity: s.alfa < 1 ? r1(s.alfa * 100) / 100 : null }, gMarcas);
      });
    }
    atr(clipRect, { x: 0, y: 0, width: r1(m.W * el), height: m.H });
  }
  /** Aplica a classe de destaque (ids) sem redesenhar. */
  function marcarDestaque() {
    const id = casca.destaque;
    for (const rec of [areas, linhas]) for (const [k, n] of rec.nos()) n.classList.toggle('is-destaque', id != null && k === id);
  }

  function redefinirLegenda() {
    const itens = op.series.map((s) => ({ id: s.id, nome: s.nome, cor: s.cor, tracejado: s.pontilhada, valor: s.valorLegenda, tom: s.tomLegenda })); // 06/10/2026: valorLegenda/tomLegenda = número ao lado do nome (ex.: "−8,6%" vs o benchmark)
    const mostrar = op.legenda === true || (op.legenda === 'auto' && itens.length >= 2);
    casca.legenda.definir(mostrar ? itens : [], { alternavel: op.alternarSeries && itens.length > 1, ocultos });
    casca.legenda.aoAlternar = (id) => {
      if (ocultos.has(id)) ocultos.delete(id);
      else if (op.series.filter((s) => !ocultos.has(s.id)).length > 1) ocultos.add(id);
      else return;
      redefinirLegenda();
      aplicar({ animarMorfo: true });
    };
  }

  function definirTabela() {
    if (!op.tabela) { casca.tabela.definir(null); return; }
    const n = modelo ? modelo.n : 0;
    const linhasT = [];
    for (let i = 0; i < n; i++) linhasT.push([rotuloX(op, i) || String(i + 1), ...op.series.map((s) => (ehNum(s.valores[i]) ? op.formatarValor(s.valores[i]) : '—'))]);
    casca.tabela.definir({ legenda: op.aria || 'Dados do gráfico', colunas: ['', ...op.series.map((s) => s.nome)], linhas: linhasT });
  }

  /* ------------------------------ ciclo de vida ------------------------------ */
  function pararAnim() { if (anim) { anim.terminar(); anim = null; } if (animMorfo) { animMorfo.terminar(); animMorfo = null; } }

  function aplicar({ entrada = false, animarMorfo = false } = {}) {
    if (destruido) return;
    pararAnim();
    const antigo = modelo;
    modelo = construirModelo(op, W, ocultos);
    casca.dimensionar(W, op.altura);
    atr(svg, { 'data-n': modelo.n });
    casca.definirAria(`${op.aria || 'Gráfico'}: ${op.series.length} série${op.series.length === 1 ? '' : 's'}, ${modelo.n} pontos`);
    atr(cruz, { y1: modelo.padT, y2: modelo.padT + modelo.plotH });
    definirTabela();
    const animaOk = op.animar !== false;
    if (entrada && animaOk) {
      desenharEixos(gEixos, modelo);
      anim = animar(win, {
        duracao: DUR.linha,
        aoQuadro: (t) => {
          const el = EASE_ENTRADA(t); const ea = EASE_ENTRADA(limitar((t * DUR.linha) / DUR.area, 0, 1));
          desenharSeries(modelo.series.map((s) => ({ ...s, alfa: 1 })), modelo, el, ea);
          gEixos.setAttribute('opacity', String(r1(limitar(t * 3, 0, 1) * 100) / 100));
        },
        aoFim: () => { anim = null; gEixos.removeAttribute('opacity'); desenharSeries(modelo.series.map((s) => ({ ...s, alfa: 1 })), modelo); },
      });
    } else if (antigo && animarMorfo && animaOk && antigo.series.length) {
      // eixos: o antigo esmaece enquanto o novo surge (as linhas de grade mudam de lugar, então não dá pra interpolar)
      if (eixosSaindo) eixosSaindo.remove();
      eixosSaindo = gEixos.cloneNode(true);
      eixosSaindo.setAttribute('class', 'chart-eixos chart-eixos-saindo');
      svg.insertBefore(eixosSaindo, gEixos);
      desenharEixos(gEixos, modelo);
      animMorfo = animar(win, {
        duracao: DUR.morfar,
        aoQuadro: (t) => {
          const e = EASE_PADRAO(t);
          desenharSeries(interpolarSeries(antigo, modelo, e), modelo);
          gEixos.setAttribute('opacity', String(r1(e * 100) / 100));
          if (eixosSaindo) eixosSaindo.setAttribute('opacity', String(r1((1 - e) * 100) / 100));
        },
        aoFim: () => {
          animMorfo = null; gEixos.removeAttribute('opacity');
          if (eixosSaindo) { eixosSaindo.remove(); eixosSaindo = null; }
          desenharSeries(modelo.series.map((s) => ({ ...s, alfa: 1 })), modelo);
        },
      });
    } else {
      if (eixosSaindo) { eixosSaindo.remove(); eixosSaindo = null; }
      desenharEixos(gEixos, modelo);
      desenharSeries(modelo.series.map((s) => ({ ...s, alfa: 1 })), modelo);
    }
    if (indiceAtivo >= 0) mostrar(Math.min(indiceAtivo, modelo.n - 1), {});
  }

  /* ------------------------------ interação ------------------------------ */
  function conteudoTooltip(i) {
    const linhasT = [];
    for (const s of op.series) {
      if (ocultos.has(s.id)) continue;
      const v = s.valores[i];
      if (!ehNum(v)) continue;
      linhasT.push({ cor: s.cor, tracejado: s.pontilhada, nome: s.nome, valor: op.formatarValor(v), forte: casca.destaque === s.id });
    }
    if (op.tipo === 'area' && op.empilhado && op.total && linhasT.length > 1) {
      const soma = op.series.filter((s) => !ocultos.has(s.id)).reduce((a, s) => a + (ehNum(s.valores[i]) ? s.valores[i] : 0), 0);
      linhasT.push({ nome: 'Total', valor: op.formatarValor(soma), forte: true });
    }
    // 06/10/2026 (Onda 3, páginas): `tooltipExtra(i)` devolve linhas a mais ({ nome, valor, cor? }) - ex.: aporte e % do alvo no histórico de uma meta
    if (op.tooltipExtra) { const extra = op.tooltipExtra(i); if (Array.isArray(extra)) linhasT.push(...extra); }
    const titulo = (op.formatarX ? op.formatarX(itemX(op, i), i) : rotuloX(op, i));
    return { titulo, linhas: linhasT };
  }

  function mostrar(i, { ptrY = null, teclado = false } = {}) {
    if (!modelo || i < 0 || i >= modelo.n) return;
    indiceAtivo = i;
    const x = modelo.xs[i];
    atr(cruz, { x1: r1(x), x2: r1(x) });
    cruz.classList.add('is-on');
    let menorY = Infinity; let melhor = null; let dist = Infinity;
    for (const s of modelo.series) {
      const p = s.pts[i];
      const g = pontos.obter(s.id);
      if (!p) { g.classList.remove('is-on'); continue; }
      g.style.setProperty('--cor', s.cor);
      g.classList.add('is-on');
      atr(g.firstChild, { cx: r1(p.x), cy: r1(p.y) }); atr(g.lastChild, { cx: r1(p.x), cy: r1(p.y) });
      menorY = Math.min(menorY, p.y);
      if (ptrY != null) {
        // empilhada: a camada sob o ponteiro (entre o topo e a base dela); linhas: a mais próxima
        const d = s.empilha && s.base && s.base[i] ? (ptrY >= p.y && ptrY <= s.base[i].y ? 0 : Math.abs(p.y - ptrY) + 999) : Math.abs(p.y - ptrY);
        if (d < dist) { dist = d; melhor = s.id; }
      }
    }
    pontos.limpar(); // some com os pontos de séries que saíram
    if (modelo.series.length > 1 && ptrY != null && !teclado) casca.destacar(dist < 36 ? melhor : null);
    marcarDestaque();
    const c = conteudoTooltip(i);
    casca.tip.mostrar(c, x, Number.isFinite(menorY) ? menorY : modelo.padT, { largura: modelo.W });
    if (teclado) casca.anunciar(textoDoPonto(c.titulo, c.linhas));
    if (op.aoSelecionar) op.aoSelecionar(i);
  }
  function esconder() {
    indiceAtivo = -1;
    cruz.classList.remove('is-on');
    for (const [, g2] of pontos.nos()) g2.classList.remove('is-on');
    casca.tip.ocultar();
    casca.destacar(null);
    marcarDestaque();
  }
  const indiceMaisProximo = (px) => {
    const xs = modelo.xs; let melhor = 0; let d = Infinity;
    for (let k = 0; k < xs.length; k++) { const dd = Math.abs(xs[k] - px); if (dd < d) { d = dd; melhor = k; } }
    return melhor;
  };
  const coordenadas = (e) => {
    const r = svg.getBoundingClientRect();
    const sx = r.width ? modelo.W / r.width : 1; const sy = r.height ? modelo.H / r.height : 1;
    return { px: (e.clientX - r.left) * sx, py: (e.clientY - r.top) * sy };
  };
  const aoPonteiro = (e) => {
    if (!modelo || !modelo.n || casca.tabela.visivel) return;
    const { px, py } = coordenadas(e);
    if (px < modelo.padL - 6 || px > modelo.padL + modelo.plotW + 6) { esconder(); return; }
    mostrar(indiceMaisProximo(px), { ptrY: py });
  };
  casca.ouvir(svg, 'pointermove', aoPonteiro);
  casca.ouvir(svg, 'pointerdown', aoPonteiro);
  casca.ouvir(svg, 'pointerleave', esconder);
  const teclas = ligarTeclado(casca, {
    n: () => (modelo ? modelo.n : 0), atual: () => indiceAtivo,
    ir: (i) => mostrar(i, { teclado: true }), sair: esconder,
  });
  casca.aoDestacar(() => { marcarDestaque(); });
  casca.aoParar(observarLargura(montagem, (w) => { W = Math.round(w); aplicar({}); }));

  const alternarTabela = (forcar) => { const v = casca.tabela.alternar(forcar); if (cartao) cartao.definirEstado('ok'); return v; };
  if (cartao) cartao.adicionarItemMenu({ rotulo: 'Ver como tabela', aoClicar: () => alternarTabela() });
  else if (op.tabela && op.botaoTabela !== false) {
    const b = no(doc, ':button', { type: 'button', class: 'chart-tabbtn', 'aria-pressed': 'false', texto: 'Ver como tabela' }, casca.raiz);
    casca.ouvir(b, 'click', () => { const v = alternarTabela(); b.setAttribute('aria-pressed', String(v)); b.textContent = v ? 'Ver gráfico' : 'Ver como tabela'; });
  }

  redefinirLegenda();
  aplicar({ entrada: true });

  const api = {
    el, casca, card: cartao,
    get opcoes() { return op; },
    /** Troca dados/opções (parcial) e MORFA do estado atual pro novo. `animar:false` em `dados` pula a animação. */
    atualizar(dados = {}) {
      if (destruido) return api;
      const { animar: an, ...resto } = dados;
      op = normalizar({ ...op, ...resto, series: resto.series ?? op.series, card: undefined });
      if (cartao) { if (dados.rotulo !== undefined || dados.valor !== undefined || dados.delta !== undefined) cartao.definirCabecalho(dados); }
      for (const id of [...ocultos]) if (!op.series.some((s) => s.id === id)) ocultos.delete(id);
      redefinirLegenda();
      W = larguraDe(montagem, op.largura);
      aplicar({ animarMorfo: an !== false });
      return api;
    },
    /** Mostra o ponto `i` (como se o ponteiro estivesse nele); sem argumento, esconde. */
    selecionar(i) { if (i == null) esconder(); else mostrar(i, { teclado: true }); },
    alternarTabela,
    destruir() {
      if (destruido) return;
      destruido = true; pararAnim();
      casca.destruir();
      if (cartao) cartao.destruir();
    },
  };
  if (cartao) cartao.grafico = api;
  void teclas;
  return api;
}

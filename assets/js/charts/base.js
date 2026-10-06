/**
 * charts/base.js - 05/10/2026 (Onda 3, kit Figma "Material You"): peças comuns da biblioteca única de gráficos
 * (SVG próprio, sem lib): escalas, ticks "redondos", caminhos (reto e suave), easings M3, animador por quadro
 * (respeita prefers-reduced-motion), reconciliação de nós por chave (morfar sem vazar nó), formatadores
 * (todos de format.js, pt-BR) e a convenção de cores (SÓ variáveis CSS - ver assets/css/charts.css).
 * Funções puras onde dá: os testes (tests/charts-*.test.js) cobrem escala, ticks, caminhos e animador.
 */
import { formatCompacto, formatBRL, formatMinus } from '../format.js';

export const NS_SVG = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ números */
export const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ehNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** Arredonda pra 1 casa (menos bytes no atributo `d`). */
export const r1 = (v) => Math.round(v * 10) / 10;
export const r2 = (v) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ escalas */
/**
 * Escala linear: `dominio` [d0, d1] -> `intervalo` [r0, r1]. `.inverter(px)` volta ao dado. Domínio de largura 0 vira o
 * ponto do meio (evita divisão por zero em série constante).
 */
export function escalaLinear(dominio, intervalo) {
  const [d0, d1] = dominio;
  const [r0, r1v] = intervalo;
  const f = (v) => (d1 === d0 ? (r0 + r1v) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1v - r0));
  f.inverter = (px) => (r1v === r0 ? d0 : d0 + ((px - r0) / (r1v - r0)) * (d1 - d0));
  f.dominio = [d0, d1];
  f.intervalo = [r0, r1v];
  return f;
}

/**
 * Escala de bandas (categorias): `n` categorias em [r0, r1]; `.passo` = largura de cada banda, `.inicio(i)` = começo da
 * banda i, `.centro(i)` = meio. `.indiceDe(px)` = categoria sob o ponteiro (limitada a 0..n-1).
 */
export function escalaBanda(n, intervalo) {
  const [r0, r1v] = intervalo;
  const passo = n > 0 ? (r1v - r0) / n : 0;
  const f = {
    n, passo,
    inicio: (i) => r0 + i * passo,
    centro: (i) => r0 + (i + 0.5) * passo,
    indiceDe: (px) => (n > 0 ? limitar(Math.floor((px - r0) / (passo || 1)), 0, n - 1) : -1),
  };
  return f;
}

/** Passo "redondo" (1, 2, 2.5, 5 × 10^k) pra dividir `faixa` em ~`n` intervalos. */
export function passoAgradavel(faixa, n) {
  if (!(faixa > 0) || !(n > 0)) return 1;
  const bruto = faixa / n;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / pot;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * pot;
}

/**
 * Ticks do eixo Y: estende [min, max] até múltiplos de um passo redondo. `n` = quantidade-alvo de intervalos (não
 * garante exatamente n). `zero:true` força o 0 dentro do domínio (barras/áreas). Série constante ganha uma folga.
 * Devolve { min, max, passo, ticks:[...] } (ticks incluem as pontas).
 */
export function ticksAgradaveis(min, max, n = 4, { zero = false } = {}) {
  if (!ehNum(min) || !ehNum(max)) return { min: 0, max: 1, passo: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  if (zero) { min = Math.min(min, 0); max = Math.max(max, 0); }
  if (min === max) { const f = Math.abs(min) || 1; min -= f * 0.5; max += f * 0.5; if (zero && min > 0) min = 0; }
  const passo = passoAgradavel(max - min, n);
  const a = Math.floor(min / passo + 1e-9) * passo;
  const b = Math.ceil(max / passo - 1e-9) * passo;
  const ticks = [];
  const k0 = Math.round(a / passo);
  const nT = Math.round((b - a) / passo);
  for (let k = 0; k <= nT; k++) { const v = Number(((k0 + k) * passo).toPrecision(12)); ticks.push(v === 0 ? 0 : v); }
  return { min: Number(a.toPrecision(12)), max: Number(b.toPrecision(12)), passo, ticks };
}

/** Índices de rótulos do eixo X: no máximo `max`, espalhados, sempre incluindo o primeiro; o último só se couber. */
export function indicesDeRotulos(n, max) {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const passo = Math.ceil((n - 1) / Math.max(1, max - 1));
  const r = [];
  for (let i = 0; i < n; i += passo) r.push(i);
  return r;
}

/* ------------------------------------------------------------------ caminhos */
/** "M x,y L x,y …" - `pts` com null/undefined quebram a linha (lacuna). */
export function caminhoLinha(pts) {
  let d = '';
  let aberto = false;
  for (const p of pts) {
    if (!p) { aberto = false; continue; }
    d += `${aberto ? 'L' : 'M'}${r1(p.x)},${r1(p.y)}`;
    aberto = true;
  }
  return d;
}

/**
 * Curva suave que NÃO passa por cima dos dados (interpolação monotônica de Fritsch-Carlson, convertida em Béziers
 * cúbicas) - a "curva suave" das áreas do kit sem inventar picos entre os pontos. Lacunas (null) quebram a linha.
 */
export function caminhoSuave(pts) {
  let d = '';
  let seg = [];
  const fecha = () => {
    if (seg.length === 1) d += `M${r1(seg[0].x)},${r1(seg[0].y)}`;
    else if (seg.length > 1) d += segmentoSuave(seg);
    seg = [];
  };
  for (const p of pts) { if (!p) fecha(); else seg.push(p); }
  fecha();
  return d;
}

function segmentoSuave(p) {
  const n = p.length;
  const dx = []; const m = [];
  for (let i = 0; i < n - 1; i++) { dx.push(p[i + 1].x - p[i].x || 1e-6); m.push((p[i + 1].y - p[i].y) / dx[i]); }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i]; const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${r1(p[0].x)},${r1(p[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${r1(p[i].x + h)},${r1(p[i].y + t[i] * h)} ${r1(p[i + 1].x - h)},${r1(p[i + 1].y - t[i + 1] * h)} ${r1(p[i + 1].x)},${r1(p[i + 1].y)}`;
  }
  return d;
}

/** Área entre duas bordas (topo e base, mesmo nº de pontos): topo da esq. pra dir., base da dir. pra esq. */
export function caminhoArea(topo, base, suave = false) {
  if (!topo.length) return '';
  const t = suave ? caminhoSuave(topo) : caminhoLinha(topo);
  const b = [...base].reverse();
  const bd = suave ? caminhoSuave(b) : caminhoLinha(b);
  return `${t}L${bd.slice(1)}Z`;
}

/**
 * Retângulo com cantos arredondados individuais [sup-esq, sup-dir, inf-dir, inf-esq]. Os raios são limitados à
 * metade do menor lado (pílula perfeita quando raio >= lado/2). Altura/largura <= 0 -> ''.
 */
export function retanguloArredondado(x, y, w, h, raios = [0, 0, 0, 0]) {
  if (!(w > 0) || !(h > 0)) return '';
  const lim = Math.min(w, h) / 2;
  const [a, b, c, d] = raios.map((r) => limitar(r, 0, lim));
  return `M${r1(x + a)},${r1(y)}H${r1(x + w - b)}${b ? `A${r1(b)},${r1(b)} 0 0 1 ${r1(x + w)},${r1(y + b)}` : ''}`
    + `V${r1(y + h - c)}${c ? `A${r1(c)},${r1(c)} 0 0 1 ${r1(x + w - c)},${r1(y + h)}` : ''}`
    + `H${r1(x + d)}${d ? `A${r1(d)},${r1(d)} 0 0 1 ${r1(x)},${r1(y + h - d)}` : ''}`
    + `V${r1(y + a)}${a ? `A${r1(a)},${r1(a)} 0 0 1 ${r1(x + a)},${r1(y)}` : ''}Z`;
}

/* ------------------------------------------------------------------ easings (M3 motion) */
/** cubic-bezier(x1,y1,x2,y2) como função t -> progresso (Newton + bisseção, igual ao CSS). */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1; const bx = 3 * (x2 - x1) - cx; const ax = 1 - cx - bx;
  const cy = 3 * y1; const by = 3 * (y2 - y1) - cy; const ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-5) return Y(t); const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0; let hi = 1; t = x;
    for (let i = 0; i < 24; i++) { const e = X(t); if (Math.abs(e - x) < 1e-5) break; if (e < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
/** emphasized-decelerate: desenhar linha / varrer anel / crescer barras (entrada). */
export const EASE_ENTRADA = bezier(0.05, 0.7, 0.1, 1);
/** standard: trocar período/filtro (morfar) e movimentos curtos. */
export const EASE_PADRAO = bezier(0.2, 0, 0, 1);
export const linear = (t) => t;

/** Durações do plano (ms). */
export const DUR = { linha: 700, area: 500, barra: 400, barraEscalonamento: 25, anel: 600, kpi: 400, morfar: 300, tooltip: 150 };

/* ------------------------------------------------------------------ movimento */
/** true quando o usuário pediu menos movimento (ou o ambiente não tem como animar). */
export function movimentoReduzido(win) {
  try {
    if (!win || typeof win.requestAnimationFrame !== 'function') return true;
    return !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch { return true; }
}

/**
 * Animador por quadro. `aoQuadro(t)` recebe o progresso LINEAR 0..1 (quem desenha aplica o easing que quiser, o que
 * deixa cada elemento ter o seu: linha 700ms, área 500ms na mesma passada). Com movimento reduzido (ou sem rAF) chama
 * `aoQuadro(1)` e `aoFim()` na hora, de forma síncrona. Devolve { cancelar(), terminar() }: `terminar()` salta pro
 * final (usado quando chega dado novo no meio de uma animação).
 */
export function animar(win, { duracao, aoQuadro, aoFim = () => {}, forcar = false }) {
  let id = null; let vivo = true;
  const fim = () => { if (!vivo) return; vivo = false; if (id != null) { try { win.cancelAnimationFrame(id); } catch { /* ignora */ } } aoQuadro(1); aoFim(); };
  if (!forcar && (movimentoReduzido(win) || !(duracao > 0))) { fim(); return { cancelar() { vivo = false; }, terminar() {}, get ativo() { return false; } }; }
  let t0 = null;
  const passo = (agora) => {
    if (!vivo) return;
    if (t0 == null) t0 = agora;
    const t = limitar((agora - t0) / duracao, 0, 1);
    if (t >= 1) { fim(); return; }
    aoQuadro(t);
    id = win.requestAnimationFrame(passo);
  };
  aoQuadro(0);
  id = win.requestAnimationFrame(passo);
  return {
    cancelar() { if (!vivo) return; vivo = false; try { win.cancelAnimationFrame(id); } catch { /* ignora */ } },
    terminar: fim,
    get ativo() { return vivo; },
  };
}

/* ------------------------------------------------------------------ DOM / SVG */
/** Cria elemento SVG (ou HTML se `tag` começar com ":") com atributos. Valores null/undefined/false são omitidos. */
export function no(doc, tag, attrs = null, pai = null) {
  const html = tag[0] === ':';
  const el = html ? doc.createElement(tag.slice(1)) : doc.createElementNS(NS_SVG, tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v === null || v === undefined || v === false) continue; if (k === 'texto') el.textContent = v; else el.setAttribute(k, v === true ? '' : String(v)); }
  if (pai) pai.appendChild(el);
  return el;
}
export function atr(el, attrs) { for (const k in attrs) { const v = attrs[k]; if (v === null || v === undefined || v === false) el.removeAttribute(k); else el.setAttribute(k, String(v)); } return el; }
export function esvaziar(el) { while (el.firstChild) el.removeChild(el.firstChild); }

let _uid = 0;
/** Id único pra `clipPath`/`aria-*` (vários gráficos na mesma página). */
export const uid = (prefixo = 'ch') => `${prefixo}${++_uid}`;

/**
 * Reconcilia nós filhos por chave: `obter(chave)` devolve o nó existente ou cria; `limpar()` remove os que não foram
 * pedidos desde o último `limpar()` - assim redesenhar/morfar mexe nos MESMOS nós e nunca acumula lixo.
 */
export function reconciliador(pai, criar) {
  const mapa = new Map();
  let usados = new Set();
  return {
    obter(chave) {
      let n = mapa.get(chave);
      if (!n) { n = criar(chave); mapa.set(chave, n); pai.appendChild(n); }
      usados.add(chave);
      return n;
    },
    limpar() {
      for (const [k, n] of mapa) if (!usados.has(k)) { if (n.parentNode) n.parentNode.removeChild(n); mapa.delete(k); }
      usados = new Set();
    },
    get tamanho() { return mapa.size; },
    chaves() { return [...mapa.keys()]; },
    /** Nós atuais [[chave, nó]] SEM marcar como usados (pra mexer em classe sem interferir no limpar()). */
    nos() { return [...mapa.entries()]; },
  };
}

/** Mede a largura útil do contêiner (jsdom/oculto -> `padrao`). */
export function larguraDe(el, padrao = 640) {
  const w = el && el.clientWidth;
  return w && w > 40 ? Math.round(w) : padrao;
}

/** Observa o tamanho do contêiner; devolve `parar()`. Sem ResizeObserver (jsdom) não faz nada. */
export function observarLargura(el, cb) {
  const win = el.ownerDocument.defaultView;
  if (!win || typeof win.ResizeObserver !== 'function') return () => {};
  let ultimo = el.clientWidth;
  const ro = new win.ResizeObserver(() => { const w = el.clientWidth; if (w && Math.abs(w - ultimo) >= 1) { ultimo = w; cb(w); } });
  ro.observe(el);
  return () => ro.disconnect();
}

/* ------------------------------------------------------------------ cores */
/** Quantidade de cores categóricas (--chart-1 … --chart-8) e de passos da rampa (--chart-ramp-1 … 5). */
export const N_CORES = 8;
export const N_RAMPA = 5;
/**
 * Cor de uma série. `cor` pode ser: número 1..8 (token categórico), string CSS (`var(--chart-3)`, `#abc`, `currentColor`)
 * ou ausente (usa a posição `i`, 0-based, em ordem fixa - nunca cicla além de 8: da 9ª em diante cai no neutro).
 * Devolve SEMPRE `var(--_cN)` (variáveis privadas de charts.css, com os --chart-N e fallbacks por dentro).
 */
export function corSerie(cor, i = 0) {
  if (typeof cor === 'string' && cor) return cor;
  const n = ehNum(cor) ? cor : i + 1;
  return n >= 1 && n <= N_CORES ? `var(--_c${n})` : 'var(--_cn)';
}
/** Tom de preenchimento da rampa (--_t1 = mais forte/de base … --_t5 = quase a cor da superfície). `i` 0-based; passa de 5 repete o último. */
export function corRampa(i, total = N_RAMPA) {
  // com 3 camadas usa 1/3/5 (contraste claro entre vizinhas); com 2: 1 e 4; com 1: 2; senão 1..5.
  const mapa = { 1: [2], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
  const lista = mapa[Math.min(Math.max(total, 1), 5)];
  return `var(--_t${lista[Math.min(i, lista.length - 1)]})`;
}

/* ------------------------------------------------------------------ formatadores (pt-BR, de format.js) */
/** Eixo: número compacto com sinal "−" do site ("12 mil", "−3,5 mi"). */
export function formatarEixoPadrao(v) { return ehNum(v) ? formatMinus(formatCompacto(v)) : '—'; }
/** Tooltip: valor por extenso em reais (padrão do site). */
export function formatarValorPadrao(v) { return ehNum(v) ? formatBRL(v) : '—'; }

/** Texto de um rótulo do eixo X: aceita string/número ou { rotulo }. */
export function rotuloDe(item) {
  if (item == null) return '';
  if (typeof item === 'object') return String(item.rotulo ?? item.label ?? '');
  return String(item);
}

/** Texto único do estado de um ponto (aria-live / tabela): "jan: Ações R$ 10,00; FIIs R$ 5,00". */
export function textoDoPonto(titulo, linhas) {
  return `${titulo}: ${linhas.map((l) => `${l.nome ? `${l.nome} ` : ''}${l.valor}`).join('; ')}`;
}

/** Une opções com padrões, ignorando `undefined` (merge raso). */
export function comPadroes(padroes, op) {
  const r = { ...padroes };
  if (op) for (const k in op) if (op[k] !== undefined) r[k] = op[k];
  return r;
}

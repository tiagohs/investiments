/**
 * charts/anel.js - ANEL (donut) de composição com espaço entre fatias e pontas suavizadas (o kit não tem pizza), e o
 * ANEL DE PROGRESSO (um arco sobre trilho, com valor no meio). Fatias: varrem no sentido horário (600ms), trocar dados
 * morfa por id (300ms), hover/legenda/setas destacam a fatia e trocam o texto do centro. 05/10/2026.
 */
import {
  no, atr, esvaziar, reconciliador, lerp, limitar, ehNum, r1,
  EASE_ENTRADA, EASE_PADRAO, DUR, animar, corSerie, corRampa, formatarValorPadrao, comPadroes, uid, textoDoPonto,
} from './base.js';
import { criarCasca, ligarTeclado } from './casca.js';
import { criarCardGrafico } from './card.js';
import { formatPct } from '../format.js';
import { garantirEstilosCharts } from './estilos.js';

const TAU = Math.PI * 2;
const PADROES = { fatias: [], tamanho: 220, espessura: 26, espaco: 4, canto: 4, legenda: 'direita', animar: true, aria: '', centro: null, tabela: true, alternarSeries: false, tons: 'categorica' };

/** Setor anular com cantos arredondados (preenchimento + traço de mesmo cor com junta redonda). a0<a1 em rad (0 = 12h, horário). */
export function caminhoSetor(cx, cy, rIn, rOut, a0, a1, espaco = 4, canto = 4) {
  const ro = rOut - canto; const ri = rIn + canto;
  if (!(ri > 0) || ro <= ri) return '';
  const dOut = (espaco / 2 + canto) / ro; const dIn = (espaco / 2 + canto) / ri;
  const oa = a0 + dOut; const ob = a1 - dOut; const ia = a0 + dIn; const ib = a1 - dIn;
  if (ob <= oa || ib <= ia) return '';
  const P = (r, a) => `${r1(cx + r * Math.sin(a))},${r1(cy - r * Math.cos(a))}`;
  const grande = (ob - oa) > Math.PI ? 1 : 0;
  return `M${P(ro, oa)}A${r1(ro)},${r1(ro)} 0 ${grande} 1 ${P(ro, ob)}L${P(ri, ib)}A${r1(ri)},${r1(ri)} 0 ${grande} 0 ${P(ri, ia)}Z`;
}

function normalizar(op) {
  const o = comPadroes(PADROES, op);
  o.formatarValor = o.formatarValor || formatarValorPadrao;
  const n = (o.fatias || []).length;
  o.fatias = (o.fatias || []).map((f, i) => ({ ...f, id: String(f.id ?? f.nome ?? i), nome: f.nome ?? `Fatia ${i + 1}`, valor: ehNum(f.valor) && f.valor > 0 ? f.valor : 0,
    cor: typeof f.cor === 'string' ? f.cor : (o.tons === 'rampa' ? corRampa(i, n) : corSerie(f.cor, i)) }));
  return o;
}

/** Frações cumulativas: [{ id, frac, a0, a1 }] em radianos a partir de 12h. */
export function angulos(fatias, ocultos = new Set()) {
  const vis = fatias.filter((f) => !ocultos.has(f.id) && f.valor > 0);
  const total = vis.reduce((s, f) => s + f.valor, 0);
  let acc = 0;
  return { total, itens: vis.map((f) => { const frac = total > 0 ? f.valor / total : 0; const a0 = acc * TAU; acc += frac; return { id: f.id, frac, a0, a1: acc * TAU }; }) };
}

export function criarAnel(el, opcoes) {
  let op = normalizar(opcoes || {});
  const doc = el.ownerDocument; const win = doc.defaultView;
  let cartao = null; let montagem = el;
  if (opcoes && opcoes.card) { cartao = criarCardGrafico(el, opcoes.card); montagem = cartao.corpo; }
  const casca = criarCasca(montagem, { tipo: 'anel', aria: op.aria, legenda: op.legenda === false ? false : op.legenda });
  const { svg } = casca;
  const S = op.tamanho; const cx = S / 2; const cy = S / 2;
  const M = 6; // margem pro "pulo" do hover
  const rOut = S / 2 - M; const rIn = rOut - op.espessura;
  casca.dimensionar(S, S); atr(svg, { width: S, class: 'chart-svg chart-svg--anel' });
  svg.style.maxWidth = '100%'; casca.wrap.style.width = `${S}px`;
  const trilho = no(doc, 'circle', { class: 'chart-anel-trilho', cx, cy, r: (rOut + rIn) / 2, fill: 'none', 'stroke-width': op.espessura }, svg);
  trilho.style.display = 'none';
  const gFatias = no(doc, 'g', { class: 'chart-fatias' }, svg);
  const fatiasRec = reconciliador(gFatias, (id) => no(doc, 'path', { class: 'chart-fatia', 'data-id': id, style: `transform-origin:${cx}px ${cy}px` }));
  const centro = no(doc, 'text', { class: 'chart-anel-centro', x: cx, y: cy, 'text-anchor': 'middle' }, svg);
  const tGrande = no(doc, 'tspan', { class: 'chart-anel-valor', x: cx, dy: '-0.1em' }, centro);
  const tPeq = no(doc, 'tspan', { class: 'chart-anel-rot', x: cx, dy: '1.5em' }, centro);

  const ocultos = new Set();
  let modelo = null; let anim = null; let destruido = false; let ativo = -1;

  function textoCentro(id = null) {
    const f = id ? op.fatias.find((q) => q.id === id) : null;
    if (f && modelo) { const a = modelo.itens.find((q) => q.id === id); tGrande.textContent = formatPct(a ? a.frac : 0, 1); tPeq.textContent = f.nome.length > 18 ? `${f.nome.slice(0, 17)}…` : f.nome; return; }
    const c = op.centro || {};
    tGrande.textContent = c.valor != null ? String(c.valor) : (modelo && modelo.total > 0 ? op.formatarValor(modelo.total) : '—');
    tPeq.textContent = c.rotulo != null ? String(c.rotulo) : 'Total';
  }

  function desenhar(itens, sweep = 1) {
    const lim = sweep * TAU;
    for (const it of itens) {
      const p = fatiasRec.obter(it.id);
      const f = op.fatias.find((q) => q.id === it.id) || it.f;
      if (it.a0 >= lim - 1e-6) { atr(p, { d: '' }); continue; }
      const a1 = Math.min(it.a1, lim);
      const d = caminhoSetor(cx, cy, rIn, rOut, it.a0, a1, op.espaco, op.canto);
      atr(p, { d, fill: f ? f.cor : 'var(--_cn)', stroke: f ? f.cor : 'var(--_cn)', 'stroke-width': op.canto * 2, 'stroke-linejoin': 'round', 'data-id': it.id });
    }
    fatiasRec.limpar();
  }

  function legenda() {
    const itens = op.fatias.map((f) => {
      const a = modelo && modelo.itens.find((q) => q.id === f.id);
      return { id: f.id, nome: f.nome, cor: f.cor, valor: `${op.formatarValor(f.valor)} · ${formatPct(a ? a.frac : 0, 1)}` };
    });
    casca.legenda.definir(op.legenda === false ? [] : itens, { alternavel: op.alternarSeries, ocultos });
    casca.legenda.aoAlternar = (id) => { if (ocultos.has(id)) ocultos.delete(id); else if (op.fatias.filter((f) => !ocultos.has(f.id) && f.valor > 0).length > 1) ocultos.add(id); else return; aplicar({ morfo: true }); };
  }

  function tabela() {
    if (!op.tabela) { casca.tabela.definir(null); return; }
    const tot = op.fatias.reduce((s, f) => s + f.valor, 0);
    casca.tabela.definir({ legenda: op.aria || 'Composição', colunas: ['', 'Valor', '%'], linhas: op.fatias.map((f) => [f.nome, op.formatarValor(f.valor), formatPct(tot > 0 ? f.valor / tot : 0, 1)]) });
  }

  function pararAnim() { if (anim) { anim.terminar(); anim = null; } }
  function aplicar({ entrada = false, morfo = false } = {}) {
    if (destruido) return;
    pararAnim();
    const antigo = modelo;
    modelo = angulos(op.fatias, ocultos);
    casca.definirAria(`${op.aria || 'Composição'}: ${modelo.itens.length} fatias`);
    trilho.style.display = modelo.total > 0 ? 'none' : '';
    legenda(); tabela(); textoCentro(op.fatias[ativo] && ativo >= 0 ? op.fatias[ativo].id : null);
    const final = modelo.itens.map((it) => ({ ...it, f: op.fatias.find((q) => q.id === it.id) }));
    const ok = op.animar !== false;
    if (entrada && ok) {
      anim = animar(win, { duracao: DUR.anel, aoQuadro: (t) => desenhar(final, EASE_ENTRADA(t)), aoFim: () => { anim = null; desenhar(final, 1); } });
    } else if (morfo && ok && antigo && antigo.itens.length) {
      const ida = new Map(antigo.itens.map((i) => [i.id, i])); const idn = new Set(final.map((i) => i.id));
      const velhasF = antigo.itens.filter((i) => !idn.has(i.id));
      anim = animar(win, {
        duracao: DUR.morfar,
        aoQuadro: (t) => {
          const e = EASE_PADRAO(t);
          const fr = [...final.map((i) => ({ id: i.id, f: i.f, frac: lerp(ida.has(i.id) ? ida.get(i.id).frac : 0, i.frac, e) })), ...velhasF.map((i) => ({ id: i.id, f: op.fatias.find((q) => q.id === i.id) || { cor: 'var(--_cn)' }, frac: lerp(i.frac, 0, e) }))];
          let acc = 0;
          desenhar(fr.map((q) => { const a0 = acc * TAU; acc += q.frac; return { id: q.id, f: q.f, frac: q.frac, a0, a1: acc * TAU }; }), 1);
        },
        aoFim: () => { anim = null; desenhar(final, 1); },
      });
    } else desenhar(final, 1);
  }

  /* ---- interação ---- */
  function realcar(id) {
    for (const [k, p] of fatiasRec.nos()) { p.classList.toggle('is-hover', id != null && k === id); p.classList.toggle('is-fora', id != null && k !== id); }
    for (const b of casca.legenda.el ? casca.legenda.el.querySelectorAll('.chart-leg-item') : []) b.classList.toggle('is-hover', id != null && b.getAttribute('data-id') === id);
    textoCentro(id);
  }
  function mostrar(id, { teclado = false } = {}) {
    const a = modelo && modelo.itens.find((q) => q.id === id); const f = op.fatias.find((q) => q.id === id);
    if (!a || !f) return;
    ativo = op.fatias.indexOf(f);
    const am = (a.a0 + a.a1) / 2;
    casca.tip.mostrar({ titulo: f.nome, linhas: [{ cor: f.cor, valor: op.formatarValor(f.valor), nome: formatPct(a.frac, 1), forte: true }] }, cx + (rOut + 2) * Math.sin(am), cy - (rOut + 2) * Math.cos(am), { largura: S });
    realcar(id);
    if (teclado) casca.anunciar(textoDoPonto(f.nome, [{ valor: op.formatarValor(f.valor) }, { valor: formatPct(a.frac, 1) }]));
    if (op.aoSelecionar) op.aoSelecionar(id);
  }
  function esconder() { ativo = -1; casca.tip.ocultar(); realcar(null); }
  const aoPonteiro = (e) => {
    if (!modelo || !modelo.total || casca.tabela.visivel) return;
    const r = svg.getBoundingClientRect(); const k = r.width ? S / r.width : 1;
    const dx = (e.clientX - r.left) * k - cx; const dy = (e.clientY - r.top) * k - cy;
    const d = Math.hypot(dx, dy);
    if (d < rIn - 8 || d > rOut + 10) { esconder(); return; }
    let ang = Math.atan2(dx, -dy); if (ang < 0) ang += TAU;
    const a = modelo.itens.find((q) => ang >= q.a0 && ang < q.a1) || modelo.itens[modelo.itens.length - 1];
    if (a) mostrar(a.id);
  };
  casca.ouvir(svg, 'pointermove', aoPonteiro); casca.ouvir(svg, 'pointerdown', aoPonteiro); casca.ouvir(svg, 'pointerleave', esconder);
  casca.aoDestacar((id) => { if (id != null) { const a = modelo && modelo.itens.find((q) => q.id === id); if (a) realcar(id); } else if (!casca.tip.visivel) realcar(null); });
  ligarTeclado(casca, { n: () => (modelo ? modelo.itens.length : 0), atual: () => ativo, ir: (i) => mostrar(modelo.itens[i].id, { teclado: true }), sair: esconder });

  const alternarTabela = (f) => casca.tabela.alternar(f);
  if (cartao) cartao.adicionarItemMenu({ rotulo: 'Ver como tabela', aoClicar: () => alternarTabela() });
  else if (op.tabela && op.botaoTabela !== false) {
    const b = no(doc, ':button', { type: 'button', class: 'chart-tabbtn', 'aria-pressed': 'false', texto: 'Ver como tabela' }, casca.raiz);
    casca.ouvir(b, 'click', () => { const v = alternarTabela(); b.setAttribute('aria-pressed', String(v)); b.textContent = v ? 'Ver gráfico' : 'Ver como tabela'; });
  }
  aplicar({ entrada: true });

  const api = {
    el, casca, card: cartao,
    get opcoes() { return op; },
    atualizar(dados = {}) {
      if (destruido) return api;
      const { animar: an, ...resto } = dados;
      op = normalizar({ ...op, ...resto, card: undefined });
      if (cartao && (dados.rotulo !== undefined || dados.valor !== undefined)) cartao.definirCabecalho(dados);
      for (const id of [...ocultos]) if (!op.fatias.some((f) => f.id === id)) ocultos.delete(id);
      aplicar({ morfo: an !== false });
      return api;
    },
    selecionar(id) { if (id == null) esconder(); else mostrar(String(id), { teclado: true }); },
    alternarTabela,
    destruir() { if (destruido) return; destruido = true; pararAnim(); casca.destruir(); if (cartao) cartao.destruir(); },
  };
  if (cartao) cartao.grafico = api;
  return api;
}

/* ========================================================================== anel de progresso */
/**
 * Anel de progresso: um arco (pontas redondas) sobre o trilho. `valor` 0..1 (acima de 1 enche e o texto mostra o real);
 * `valor2` (opcional) = arco externo mais fino (ex.: bruto x líquido). Texto: `rotulo` grande + `subrotulo` pequeno.
 */
export function criarAnelProgresso(el, opcoes = {}) {
  const doc = el.ownerDocument; const win = doc.defaultView;
  garantirEstilosCharts(doc);
  let op = { tamanho: 104, espessura: 10, cor: 1, animar: true, formatar: (v) => formatPct(v, 0), ...opcoes };
  esvaziar(el);
  const S = op.tamanho; const c = S / 2;
  const id = uid('anp');
  const raiz = no(doc, ':div', { class: 'chart chart--anel-prog', style: `width:${S}px;max-width:100%` }, el);
  const svg = no(doc, 'svg', { class: 'chart-svg', viewBox: `0 0 ${S} ${S}`, width: S, height: S, role: 'img', 'aria-labelledby': `${id}t` }, raiz);
  const titulo = no(doc, 'title', { id: `${id}t` }, svg);
  const rA = S / 2 - op.espessura / 2 - 1; const rB = rA - op.espessura - 4;
  no(doc, 'circle', { class: 'chart-anel-trilho', cx: c, cy: c, r: rA, fill: 'none', 'stroke-width': op.espessura }, svg);
  const arco = no(doc, 'path', { class: 'chart-anel-arco', fill: 'none', 'stroke-width': op.espessura, 'stroke-linecap': 'round' }, svg);
  let trilho2 = null; let arco2 = null;
  const tx = no(doc, 'text', { class: 'chart-anel-centro', x: c, y: c, 'text-anchor': 'middle' }, svg);
  const tGrande = no(doc, 'tspan', { class: 'chart-anel-valor', x: c, dy: '0.05em' }, tx);
  const tPeq = no(doc, 'tspan', { class: 'chart-anel-rot', x: c, dy: '1.4em' }, tx);
  let anim = null; let atual = { v: 0, v2: 0 }; let destruido = false;

  const arcoPath = (r, f) => {
    const a = limitar(f, 0, 1) * TAU;
    if (a <= 0.001) return '';
    if (a >= TAU - 0.001) return `M${r1(c)},${r1(c - r)}A${r1(r)},${r1(r)} 0 1 1 ${r1(c)},${r1(c + r)}A${r1(r)},${r1(r)} 0 1 1 ${r1(c)},${r1(c - r)}`;
    return `M${r1(c)},${r1(c - r)}A${r1(r)},${r1(r)} 0 ${a > Math.PI ? 1 : 0} 1 ${r1(c + r * Math.sin(a))},${r1(c - r * Math.cos(a))}`;
  };
  function pintar(v, v2) {
    atr(arco, { d: arcoPath(rA, v), stroke: corSerie(op.cor, 0) });
    if (arco2) atr(arco2, { d: arcoPath(rB, v2), stroke: corSerie(op.cor2 || 2, 1) });
    atual = { v, v2 };
  }
  function montar() {
    if (op.valor2 != null && !arco2) {
      trilho2 = no(doc, 'circle', { class: 'chart-anel-trilho chart-anel-trilho--int', cx: c, cy: c, r: rB, fill: 'none', 'stroke-width': Math.max(op.espessura - 4, 4) }, svg);
      arco2 = no(doc, 'path', { class: 'chart-anel-arco chart-anel-arco--int', fill: 'none', 'stroke-width': Math.max(op.espessura - 4, 4), 'stroke-linecap': 'round' }, svg);
    }
    tGrande.textContent = op.rotulo != null ? String(op.rotulo) : op.formatar(op.valor || 0);
    tPeq.textContent = op.subrotulo != null ? String(op.subrotulo) : '';
    titulo.textContent = `${op.aria || ''} ${tGrande.textContent} ${tPeq.textContent}`.trim();
  }
  function ir(entrada) {
    if (destruido) return;
    if (anim) { anim.terminar(); anim = null; }
    montar();
    const alvo = { v: op.valor || 0, v2: op.valor2 || 0 }; const de = entrada ? { v: 0, v2: 0 } : { ...atual };
    anim = animar(win, {
      duracao: op.animar === false ? 0 : (entrada ? DUR.anel : DUR.morfar),
      aoQuadro: (t) => { const e = (entrada ? EASE_ENTRADA : EASE_PADRAO)(op.animar === false ? 1 : t); pintar(lerp(de.v, alvo.v, e), lerp(de.v2, alvo.v2, e)); },
      aoFim: () => { anim = null; pintar(alvo.v, alvo.v2); },
    });
  }
  ir(true);
  return {
    el, atualizar(d = {}) { if (destruido) return; op = { ...op, ...d }; ir(false); },
    destruir() { destruido = true; if (anim) anim.cancelar(); if (raiz.parentNode) raiz.parentNode.removeChild(raiz); },
  };
}

/**
 * charts/barras.js - motor dos gráficos de BARRAS (kit Figma): simples (com uma destacada), agrupadas (topo
 * arredondado), empilhadas (rampa tonal, segmentos separados por 2px de "ar"), horizontais e "pílulas" (barra com as
 * duas pontas totalmente arredondadas e segmentos tonais; com `base` vira faixa flutuante min-max).
 *   modo: 'simples' | 'agrupadas' | 'empilhadas' | 'pilulas'      orientacao: 'vertical' | 'horizontal'
 * Animação: crescem da base com escalonamento (25ms por barra), trocar dados morfa as alturas por chave (300ms).
 * Interação: o hit-target é a COLUNA inteira (não só o pixel da barra): tooltip escuro com todas as séries da categoria,
 * a coluna levanta e as outras esmaecem; nas agrupadas o hover também destaca a série; setas percorrem as categorias.
 * 05/10/2026.
 */
import {
  no, atr, esvaziar, reconciliador, lerp, limitar, ehNum, r1,
  escalaLinear, escalaBanda, ticksAgradaveis, indicesDeRotulos, retanguloArredondado,
  EASE_ENTRADA, EASE_PADRAO, DUR, animar, larguraDe, observarLargura, corSerie, corRampa,
  formatarEixoPadrao, formatarValorPadrao, rotuloDe, textoDoPonto, comPadroes,
} from './base.js';
import { criarCasca, ligarTeclado } from './casca.js';
import { criarCardGrafico } from './card.js';

const PADROES = {
  orientacao: 'vertical', modo: 'simples', categorias: [], series: [], altura: 240, ticksY: 4, legenda: 'auto',
  alternarSeries: true, animar: true, aria: '', largura: 640, tabela: true, destaque: null, corPorSinal: false,
  rotulosValor: undefined, larguraMax: 0, raio: 0, tons: 'auto', base: null, espaco: 2,
};
const GAP = 2; // "ar" entre segmentos empilhados / barras coladas (cor da superfície)

function normalizar(op) {
  const o = comPadroes(PADROES, op);
  o.formatarY = o.formatarY || formatarEixoPadrao;
  o.formatarValor = o.formatarValor || (op.formatarY ? op.formatarY : formatarValorPadrao);
  const empilha = o.modo === 'empilhadas' || o.modo === 'pilulas';
  const rampa = o.tons === 'rampa' || (o.tons === 'auto' && empilha && o.series.length <= 5);
  o.series = o.series.map((s, i) => ({
    ...s, id: String(s.id ?? s.nome ?? i), nome: s.nome ?? `Série ${i + 1}`,
    cor: typeof s.cor === 'string' ? s.cor : (rampa ? corRampa(i, o.series.length) : corSerie(s.cor, i)),
  }));
  return o;
}

/** Pixel -> geometria. `horizontal` troca os eixos; devolve o modelo (barras com `rect`) pra largura W. */
export function construirModeloBarras(op, W, ocultos = new Set()) {
  const H = op.altura;
  const horizontal = op.orientacao === 'horizontal';
  const empilha = op.modo === 'empilhadas' || op.modo === 'pilulas';
  const visiveis = op.series.filter((s) => !ocultos.has(s.id));
  const n = Math.max(op.categorias.length, ...op.series.map((s) => (s.valores || []).length), 0);
  const rotCat = Array.from({ length: n }, (_, i) => rotuloDe(op.categorias[i]));
  // domínio dos valores
  let min = 0; let max = 0;
  for (let i = 0; i < n; i++) {
    let pos = op.base ? (ehNum(op.base[i]) ? op.base[i] : 0) : 0; let neg = 0;
    if (op.base && ehNum(op.base[i])) { min = Math.min(min, op.base[i]); max = Math.max(max, op.base[i]); }
    for (const s of visiveis) {
      const v = ehNum(s.valores[i]) ? s.valores[i] : 0;
      if (empilha) { if (v >= 0) pos += v; else neg += v; max = Math.max(max, pos); min = Math.min(min, neg); }
      else { max = Math.max(max, v); min = Math.min(min, v); }
    }
  }
  const topo = max <= 0 && min >= 0 ? 1 : max;
  let tk = ticksAgradaveis(min, topo, op.ticksY, { zero: true });
  let rotV = tk.ticks.map((v) => op.formatarY(v));
  const maxLenC = Math.max(...rotCat.map((t) => Math.min(t.length, 22)), 1);
  const padR = horizontal ? 56 : 14; const padT = 12; const padB = 30;
  if (horizontal) { // eixo de valores na horizontal: poucos ticks pra os rótulos não se encostarem
    const padLh = limitar(Math.round(maxLenC * 6.4 + 18), 48, 150);
    const larg = Math.max(...rotV.map((t) => t.length), 1) * 6.6 + 28;
    const nMax = Math.max(2, Math.floor((W - padLh - padR) / larg));
    if (tk.ticks.length - 1 > nMax) { tk = ticksAgradaveis(min, topo, nMax, { zero: true }); rotV = tk.ticks.map((v) => op.formatarY(v)); }
  }
  const maxLenV = Math.max(...rotV.map((t) => t.length), 1);
  const padL = horizontal ? limitar(Math.round(maxLenC * 6.4 + 18), 48, 150) : limitar(Math.round(maxLenV * 6.6 + 16), 36, 96);
  const plotW = Math.max(W - padL - padR, 10); const plotH = Math.max(H - padT - padB, 10);
  const val = horizontal ? escalaLinear([tk.min, tk.max], [padL, padL + plotW]) : escalaLinear([tk.min, tk.max], [padT + plotH, padT]);
  const banda = escalaBanda(n, horizontal ? [padT, padT + plotH] : [padL, padL + plotW]);
  const zeroPx = val(0);
  const k = visiveis.length;
  const espessuraMax = op.larguraMax || (op.modo === 'empilhadas' ? 44 : op.modo === 'pilulas' ? 10 : op.modo === 'agrupadas' ? 20 : horizontal ? 16 : 32);
  const barras = [];
  for (let i = 0; i < n; i++) {
    const ini = banda.inicio(i);
    let grupo; let bw; let off0;
    if (op.modo === 'agrupadas') {
      bw = Math.min(espessuraMax, (banda.passo * 0.78 - (k - 1) * GAP) / Math.max(k, 1));
      grupo = bw * k + (k - 1) * GAP;
    } else { bw = Math.min(espessuraMax, banda.passo * (horizontal ? 0.6 : 0.72)); grupo = bw; }
    off0 = ini + (banda.passo - grupo) / 2;
    let pos = op.base && ehNum(op.base[i]) ? op.base[i] : 0; let neg = 0;
    const segs = [];
    visiveis.forEach((s, j) => {
      const v = ehNum(s.valores[i]) ? s.valores[i] : null;
      if (v === null) return;
      let a; let b;
      if (empilha) { if (v >= 0) { a = pos; b = pos + v; pos = b; } else { a = neg; b = neg + v; neg = b; } }
      else { a = 0; b = v; }
      const pa = val(a); const pb = val(b);
      const off = op.modo === 'agrupadas' ? off0 + j * (bw + GAP) : off0;
      segs.push({ s, j, v, a, b, pa, pb, off, positivo: v >= 0 });
    });
    segs.forEach((g, idx) => {
      // dois lados do mesmo sinal: o primeiro encosta na base, o último é a ponta do dado
      const mesmos = segs.filter((q) => q.positivo === g.positivo);
      const pos0 = mesmos.indexOf(g);
      const primeiro = !empilha || pos0 === 0; const ultimo = !empilha || pos0 === mesmos.length - 1;
      const lo = Math.min(g.pa, g.pb); const hi = Math.max(g.pa, g.pb);
      const rect = horizontal ? { x: lo, y: g.off, w: hi - lo, h: bw } : { x: g.off, y: lo, w: bw, h: hi - lo };
      if (empilha && pos0 > 0 && (horizontal ? rect.w : rect.h) > GAP + 2) {
        // 2px de ar no lado que encosta no segmento anterior da pilha
        if (horizontal) { if (g.positivo) { rect.x += GAP; rect.w -= GAP; } else rect.w -= GAP; }
        else if (g.positivo) rect.h -= GAP; else { rect.y += GAP; rect.h -= GAP; }
      }
      barras.push({
        key: `${g.s.id}|${i}`, i, sid: g.s.id, cor: op.corPorSinal && !empilha ? (g.v >= 0 ? 'var(--_up)' : 'var(--_down)') : g.s.cor,
        valor: g.v, rect, positivo: g.positivo, primeiro, ultimo, bw, idx,
      });
    });
  }
  // rótulos/ticks
  const ticksV = tk.ticks.map((v, t) => ({ v, pos: val(v), rotulo: rotV[t] }));
  const passoMin = horizontal ? 18 : Math.max(44, maxLenC * 6.4 + 10);
  const comTexto = Array.from({ length: n }, (_, i) => i).filter((i) => rotCat[i] !== '');
  const idxRot = horizontal ? comTexto : indicesDeRotulos(comTexto.length, Math.max(2, Math.floor(plotW / passoMin))).map((k) => comTexto[k]);
  return { W, H, horizontal, padL, padR, padT, padB, plotW, plotH, n, banda, zeroPx, ticksV, rotCat, idxRot, barras, empilha, val };
}

/** Raios [sup-esq, sup-dir, inf-dir, inf-esq] da barra conforme orientação, sinal e posição na pilha. */
export function raiosDaBarra(m, b, op) {
  const grossura = m.horizontal ? b.rect.h : b.rect.w;
  const pilula = op.modo === 'pilulas';
  const r = op.raio || (pilula || m.horizontal ? Math.min(grossura / 2, 8) : Math.min(4, grossura / 2));
  const fim = (m.empilha ? b.ultimo : true) ? r : 0; const base = pilula && b.primeiro ? r : 0;
  if (!m.horizontal) return b.positivo ? [fim, fim, base, base] : [base, base, fim, fim];
  return b.positivo ? [base, fim, fim, base] : [fim, base, base, fim];
}

/** Retângulo no instante p (0..1) da entrada: encolhe em direção à linha de base. */
function retEm(m, rect, p) {
  if (p >= 1) return rect;
  const z = m.zeroPx;
  if (m.horizontal) { const x0 = z + (rect.x - z) * p; const x1 = z + (rect.x + rect.w - z) * p; return { ...rect, x: x0, w: x1 - x0 }; }
  const y0 = z + (rect.y - z) * p; const y1 = z + (rect.y + rect.h - z) * p;
  return { ...rect, y: y0, h: y1 - y0 };
}

export function criarBarras(el, opcoes) {
  let op = normalizar(opcoes || {});
  const doc = el.ownerDocument; const win = doc.defaultView;
  let cartao = null; let montagem = el;
  if (opcoes && opcoes.card) { cartao = criarCardGrafico(el, { altura: op.altura, ...opcoes.card }); montagem = cartao.corpo; }
  const casca = criarCasca(montagem, { tipo: `barras-${op.modo}`, aria: op.aria, legenda: op.legenda === false ? false : 'baixo' });
  const { svg } = casca;
  const gEixos = no(doc, 'g', { class: 'chart-eixos' }, svg);
  const gBarras = no(doc, 'g', { class: 'chart-barras' }, svg);
  const gRot = no(doc, 'g', { class: 'chart-rotulos-valor' }, svg);
  const barrasRec = reconciliador(gBarras, (k) => no(doc, 'path', { class: 'chart-barra', 'data-k': k }));
  const rotRec = reconciliador(gRot, (k) => no(doc, 'text', { class: 'chart-valor', 'data-k': k }));
  const ocultos = new Set();
  let modelo = null; let W = larguraDe(montagem, op.largura);
  let anim = null; let destruido = false; let ativo = -1; let eixosSaindo = null;

  const rotulosValor = () => (op.rotulosValor !== undefined ? op.rotulosValor : (op.destaque != null ? 'destaque' : (op.orientacao === 'horizontal' && op.modo !== 'empilhadas' && op.modo !== 'pilulas')));

  function desenharEixos(m) {
    esvaziar(gEixos);
    for (const t of m.ticksV) {
      if (m.horizontal) {
        no(doc, 'line', { class: `chart-grade chart-grade-x${t.v === 0 ? ' is-zero' : ''}`, x1: r1(t.pos), x2: r1(t.pos), y1: m.padT, y2: m.padT + m.plotH }, gEixos);
        no(doc, 'text', { class: 'chart-eixo chart-eixo-x', x: r1(t.pos), y: m.padT + m.plotH + 20, 'text-anchor': 'middle', texto: t.rotulo }, gEixos);
      } else {
        no(doc, 'line', { class: `chart-grade${t.v === 0 ? ' is-zero' : ''}`, x1: m.padL, x2: m.padL + m.plotW, y1: r1(t.pos), y2: r1(t.pos) }, gEixos);
        no(doc, 'text', { class: 'chart-eixo chart-eixo-y', x: m.padL - 8, y: r1(t.pos), 'dominant-baseline': 'central', 'text-anchor': 'end', texto: t.rotulo }, gEixos);
      }
    }
    for (const i of m.idxRot) {
      const c = m.banda.centro(i); let t = m.rotCat[i];
      if (m.horizontal) { if (t.length > 22) t = `${t.slice(0, 21)}…`; no(doc, 'text', { class: 'chart-eixo chart-eixo-cat', x: m.padL - 10, y: r1(c), 'dominant-baseline': 'central', 'text-anchor': 'end', texto: t }, gEixos); }
      else no(doc, 'text', { class: 'chart-eixo chart-eixo-x', x: r1(c), y: m.padT + m.plotH + 20, 'text-anchor': 'middle', texto: t }, gEixos);
    }
  }

  /** Desenha as barras (lista com `rect` já interpolado) no progresso de entrada `t` (0..1 linear). */
  function desenhar(lista, m, t = 1) {
    const total = DUR.barra + Math.max(0, m.n - 1) * Math.min(DUR.barraEscalonamento, 400 / Math.max(1, m.n - 1));
    const stag = Math.min(DUR.barraEscalonamento, 400 / Math.max(1, m.n - 1));
    for (const b of lista) {
      const p = t >= 1 ? 1 : EASE_ENTRADA(limitar((t * total - b.i * stag) / DUR.barra, 0, 1));
      const rc = retEm(m, b.rect, p);
      const el2 = barrasRec.obter(b.key);
      atr(el2, { d: retanguloArredondado(rc.x, rc.y, rc.w, rc.h, raiosDaBarra(m, b, op)), fill: b.cor, 'data-i': b.i, 'data-sid': b.sid, opacity: b.alfa != null && b.alfa < 1 ? r1(b.alfa * 100) / 100 : null });
      const atenua = op.destaque != null && op.modo !== 'agrupadas' && b.i !== op.destaque;
      el2.classList.toggle('is-suave', !!atenua);
    }
    barrasRec.limpar();
    // rótulos de valor (só os que cabem; nunca cortados)
    const modoRot = rotulosValor();
    if (modoRot && t >= 1) {
      for (const b of lista) {
        if (m.empilha || b.alfa != null) continue;
        if (modoRot === 'destaque' && b.i !== op.destaque) continue;
        const txt = op.formatarValor(b.valor);
        const larg = txt.length * 6.6 + 4;
        if (!m.horizontal && larg > m.banda.passo + 4 && modoRot !== 'destaque') continue;
        const tn = rotRec.obter(`v${b.key}`);
        if (m.horizontal) {
          const fim = b.positivo ? b.rect.x + b.rect.w : b.rect.x;
          const cabeFora = fim + 6 + larg < m.W;
          atr(tn, { x: r1(cabeFora ? fim + 6 : fim - 6), y: r1(b.rect.y + b.rect.h / 2), 'dominant-baseline': 'central', 'text-anchor': cabeFora ? 'start' : 'end' });
        } else {
          atr(tn, { x: r1(b.rect.x + b.rect.w / 2), y: r1(b.positivo ? b.rect.y - 6 : b.rect.y + b.rect.h + 14), 'text-anchor': 'middle' });
        }
        tn.textContent = txt;
      }
    }
    rotRec.limpar();
  }

  function redefinirLegenda() {
    const itens = op.series.map((s) => ({ id: s.id, nome: s.nome, cor: op.corPorSinal && op.series.length === 1 ? 'var(--_up)' : s.cor }));
    const mostrar = op.legenda === true || (op.legenda === 'auto' && itens.length >= 2);
    casca.legenda.definir(mostrar ? itens : [], { alternavel: op.alternarSeries && itens.length > 1 && op.modo !== 'pilulas', ocultos });
    casca.legenda.aoAlternar = (id) => {
      if (ocultos.has(id)) ocultos.delete(id); else if (op.series.filter((s) => !ocultos.has(s.id)).length > 1) ocultos.add(id); else return;
      redefinirLegenda(); aplicar({ morfo: true });
    };
  }
  function definirTabela() {
    if (!op.tabela) { casca.tabela.definir(null); return; }
    const linhas = []; const n = modelo.n;
    for (let i = 0; i < n; i++) linhas.push([modelo.rotCat[i] || String(i + 1), ...op.series.map((s) => (ehNum(s.valores[i]) ? op.formatarValor(s.valores[i]) : '—'))]);
    casca.tabela.definir({ legenda: op.aria || 'Dados do gráfico', colunas: ['', ...op.series.map((s) => s.nome)], linhas });
  }

  function pararAnim() { if (anim) { anim.terminar(); anim = null; } }
  function aplicar({ entrada = false, morfo = false } = {}) {
    if (destruido) return;
    pararAnim();
    const antigo = modelo;
    modelo = construirModeloBarras(op, W, ocultos);
    casca.dimensionar(W, op.altura);
    casca.definirAria(`${op.aria || 'Gráfico de barras'}: ${op.series.length} série${op.series.length === 1 ? '' : 's'}, ${modelo.n} categorias`);
    definirTabela();
    const final = modelo.barras;
    const ok = op.animar !== false;
    if (entrada && ok) {
      desenharEixos(modelo);
      const dur = DUR.barra + Math.min(400, Math.max(0, modelo.n - 1) * DUR.barraEscalonamento);
      anim = animar(win, { duracao: dur, aoQuadro: (t) => { desenhar(final, modelo, t); gEixos.setAttribute('opacity', String(r1(limitar(t * 4, 0, 1) * 100) / 100)); }, aoFim: () => { anim = null; gEixos.removeAttribute('opacity'); desenhar(final, modelo, 1); } });
    } else if (morfo && ok && antigo && antigo.barras.length) {
      if (eixosSaindo) eixosSaindo.remove();
      eixosSaindo = gEixos.cloneNode(true); eixosSaindo.setAttribute('class', 'chart-eixos chart-eixos-saindo'); svg.insertBefore(eixosSaindo, gEixos);
      desenharEixos(modelo);
      const velhos = new Map(antigo.barras.map((b) => [b.key, b]));
      const novos = new Set(final.map((b) => b.key));
      const colapsa = (b, mm) => retEm(mm, b.rect, 0);
      anim = animar(win, {
        duracao: DUR.morfar,
        aoQuadro: (t) => {
          const e = EASE_PADRAO(t);
          const lista = final.map((b) => {
            const v = velhos.get(b.key);
            const de = v ? v.rect : { ...colapsa(b, modelo) };
            return { ...b, rect: { x: lerp(de.x, b.rect.x, e), y: lerp(de.y, b.rect.y, e), w: lerp(de.w, b.rect.w, e), h: lerp(de.h, b.rect.h, e) }, alfa: v ? null : e };
          });
          for (const v of antigo.barras) if (!novos.has(v.key)) lista.push({ ...v, rect: { ...v.rect, ...(modelo.horizontal ? { w: v.rect.w * (1 - e) } : { y: lerp(v.rect.y, modelo.zeroPx, e), h: v.rect.h * (1 - e) }) }, alfa: 1 - e });
          desenhar(lista, modelo, 1);
          gEixos.setAttribute('opacity', String(r1(e * 100) / 100)); if (eixosSaindo) eixosSaindo.setAttribute('opacity', String(r1((1 - e) * 100) / 100));
        },
        aoFim: () => { anim = null; gEixos.removeAttribute('opacity'); if (eixosSaindo) { eixosSaindo.remove(); eixosSaindo = null; } desenhar(final, modelo, 1); },
      });
    } else {
      if (eixosSaindo) { eixosSaindo.remove(); eixosSaindo = null; }
      desenharEixos(modelo); desenhar(final, modelo, 1);
    }
    if (ativo >= 0) mostrar(Math.min(ativo, modelo.n - 1), {});
  }

  /* ---------------- interação ---------------- */
  function marcarColuna(i, sid) {
    for (const [, nn] of barrasRec.nos()) {
      const ci = Number(nn.getAttribute('data-i'));
      nn.classList.toggle('is-hover', i != null && ci === i && (op.modo !== 'agrupadas' || sid == null || nn.getAttribute('data-sid') === sid));
      nn.classList.toggle('is-fora', i != null && (ci !== i || (op.modo === 'agrupadas' && sid != null && nn.getAttribute('data-sid') !== sid)));
    }
  }
  function mostrar(i, { sid = null, teclado = false } = {}) {
    if (!modelo || i < 0 || i >= modelo.n) return;
    ativo = i;
    const linhas = [];
    let topo = Infinity; let fimX = 0; let cx = modelo.horizontal ? 0 : modelo.banda.centro(i);
    for (const b of modelo.barras) {
      if (b.i !== i) continue;
      const s = op.series.find((q) => q.id === b.sid);
      linhas.push({ cor: b.cor, nome: s.nome, valor: op.formatarValor(b.valor), forte: sid === b.sid });
      if (modelo.horizontal) { fimX = Math.max(fimX, b.rect.x + b.rect.w); topo = modelo.banda.centro(i) - 4; } else topo = Math.min(topo, b.rect.y);
    }
    if (op.modo === 'empilhadas' && linhas.length > 1) linhas.push({ nome: 'Total', valor: op.formatarValor(modelo.barras.filter((b) => b.i === i).reduce((a, b) => a + b.valor, 0)), forte: true });
    if (!Number.isFinite(topo)) topo = modelo.zeroPx;
    // 06/10/2026 (Onda 3, páginas): `formatarX(categoria, i)` troca o título e `tooltipExtra(i)` acrescenta linhas ({ nome, valor, cor? })
    if (op.tooltipExtra) { const extra = op.tooltipExtra(i); if (Array.isArray(extra)) linhas.push(...extra); }
    const titulo = op.formatarX ? op.formatarX(op.categorias[i], i) : modelo.rotCat[i];
    casca.tip.mostrar({ titulo, linhas }, modelo.horizontal ? Math.min(fimX, modelo.W - 40) : cx, topo, { largura: modelo.W });
    marcarColuna(i, sid);
    if (op.modo === 'agrupadas') casca.destacar(sid);
    if (teclado) casca.anunciar(textoDoPonto(titulo, linhas));
    if (op.aoSelecionar) op.aoSelecionar(i);
  }
  function esconder() { ativo = -1; casca.tip.ocultar(); marcarColuna(null); casca.destacar(null); }
  const aoPonteiro = (e) => {
    if (!modelo || !modelo.n || casca.tabela.visivel) return;
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (r.width ? modelo.W / r.width : 1); const py = (e.clientY - r.top) * (r.height ? modelo.H / r.height : 1);
    const dentro = px >= modelo.padL - 4 && px <= modelo.padL + modelo.plotW + (modelo.horizontal ? 60 : 4) && py >= modelo.padT - 4 && py <= modelo.padT + modelo.plotH + 4;
    if (!dentro) { esconder(); return; }
    const i = modelo.banda.indiceDe(modelo.horizontal ? py : px);
    let sid = null;
    if (op.modo === 'agrupadas' && !modelo.horizontal) {
      let d = Infinity;
      for (const b of modelo.barras) if (b.i === i) { const dd = Math.abs(px - (b.rect.x + b.rect.w / 2)); if (dd < d) { d = dd; sid = b.sid; } }
    }
    mostrar(i, { sid });
  };
  casca.ouvir(svg, 'pointermove', aoPonteiro); casca.ouvir(svg, 'pointerdown', aoPonteiro); casca.ouvir(svg, 'pointerleave', esconder);
  ligarTeclado(casca, { n: () => (modelo ? modelo.n : 0), atual: () => ativo, ir: (i) => mostrar(i, { teclado: true }), sair: esconder, vertical: op.orientacao === 'horizontal' });
  casca.aoParar(observarLargura(montagem, (w) => { W = Math.round(w); aplicar({}); }));

  const alternarTabela = (f) => casca.tabela.alternar(f);
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
    atualizar(dados = {}) {
      if (destruido) return api;
      const { animar: an, ...resto } = dados;
      op = normalizar({ ...op, ...resto, card: undefined });
      if (cartao && (dados.rotulo !== undefined || dados.valor !== undefined || dados.delta !== undefined)) cartao.definirCabecalho(dados);
      for (const id of [...ocultos]) if (!op.series.some((s) => s.id === id)) ocultos.delete(id);
      redefinirLegenda(); W = larguraDe(montagem, op.largura);
      aplicar({ morfo: an !== false });
      return api;
    },
    selecionar(i) { if (i == null) esconder(); else mostrar(i, { teclado: true }); },
    alternarTabela,
    destruir() { if (destruido) return; destruido = true; pararAnim(); casca.destruir(); if (cartao) cartao.destruir(); },
  };
  if (cartao) cartao.grafico = api;
  return api;
}

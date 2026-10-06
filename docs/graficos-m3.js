/**
 * docs/graficos-m3.js - catálogo vivo da biblioteca de gráficos (assets/js/charts). Dados 100% inventados (gerador com semente).
 * "Repetir animações" recria tudo; o seletor de tema alterna data-theme; ?tema=escuro|claro abre já no tema (usado nos prints).
 */
import {
  criarGraficoLinha, criarGraficoArea, criarGraficoBarras, criarGraficoPilulas, criarAnel, criarAnelProgresso, criarSparkline,
  sparklineHtml, criarCardGrafico, criarKpi, criarBarraProgresso, criarBarraComposicao,
} from '../assets/js/charts/index.js';
import { iconeSvg } from '../assets/js/charts/icones.js';
import { formatBRL, formatBRL0, formatBRLMil, formatPctSinal, formatCompacto, MESES_CURTOS } from '../assets/js/format.js';

const $main = document.getElementById('catMain');
let vivos = [];

/* ---------- dados inventados ---------- */
function alea(semente) { let s = semente >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function passeio(n, base, vol, semente, deriva = 0) { const r = alea(semente); const out = []; let v = base; for (let i = 0; i < n; i++) { v += (r() - 0.5) * vol + deriva; out.push(Math.round(v * 100) / 100); } return out; }
const meses = (n, fim = 9) => Array.from({ length: n }, (_, i) => MESES_CURTOS[(((fim - n + 1 + i) % 12) + 12) % 12]);
const M12 = meses(12);
const dias = (n) => Array.from({ length: n }, (_, i) => (i % 30 === 0 ? MESES_CURTOS[(i / 30 + 2) % 12] : `${(i % 30) + 1}`));
const mil = (v) => `R$ ${formatCompacto(v)}`;

const PERIODOS = [{ id: '6m', rotulo: '6m' }, { id: '12m', rotulo: '12m' }, { id: '24m', rotulo: '24m' }];
const dadosPatrimonio = { '6m': 6, '12m': 12, '24m': 24 };

/* ---------- montagem ---------- */
function secao(titulo, desc, { classe = '' } = {}) {
  const s = document.createElement('section'); s.className = 'cat-sec';
  const h = document.createElement('h2'); h.textContent = titulo; s.appendChild(h);
  const p = document.createElement('p'); p.textContent = desc; s.appendChild(p);
  const g = document.createElement('div'); g.className = classe || 'cat-grid'; s.appendChild(g);
  $main.appendChild(s);
  return g;
}
function slot(grid, { largo = false } = {}) { const d = document.createElement('div'); if (largo) d.className = 'cat-largo'; grid.appendChild(d); return d; }
const guardar = (x) => { vivos.push(x); return x; };

function construir() {
  for (const x of vivos) { try { x.destruir(); } catch { /* ok */ } }
  vivos = []; $main.textContent = '';

  /* 1. linhas */
  let g = secao('Linha', 'Principal 2-3px; comparativos pontilhados finos; área opcional; crosshair, tooltip escuro multilinha, ponto com halo. Troque o período: a linha MORFA (300ms). Setas ←/→ percorrem os pontos; "•••" abre a tabela acessível.');
  const serieP = (n) => passeio(n, 100, 6, 7, 1.1);
  const linhaPeriodo = guardar(criarGraficoLinha(slot(g), {
    series: [{ id: 'patrimonio', nome: 'Patrimônio', valores: serieP(12).map((v) => v * 2150) }], eixoX: M12, formatarY: mil, formatarValor: formatBRL, area: true, altura: 240,
    card: { rotulo: 'Evolução', valor: formatBRL(268400), periodos: PERIODOS, periodo: '12m', aoMudarPeriodo: (id, gr) => gr.atualizar({ series: [{ id: 'patrimonio', nome: 'Patrimônio', valores: serieP(dadosPatrimonio[id]).map((v) => v * 2150) }], eixoX: meses(dadosPatrimonio[id]) }) },
  }));
  void linhaPeriodo;
  const cmp = (n) => ({ eixoX: dias(n).map((r, i) => (i % 30 === 0 ? r : '')), n });
  const nD = 120;
  const prin = passeio(nD, 100, 2.2, 11, 0.12); const ref1 = passeio(nD, 100, 2.6, 23, 0.02); const ref2 = passeio(nD, 100, 2.4, 31, -0.03);
  guardar(criarGraficoLinha(slot(g), {
    series: [{ id: 'cart', nome: 'Carteira', valores: prin, principal: true }, { id: 'cdi', nome: 'CDI', valores: ref1, pontilhada: true, cor: 2 }, { id: 'ibov', nome: 'Ibovespa', valores: ref2, pontilhada: true, cor: 5 }],
    eixoX: Array.from({ length: nD }, (_, i) => ({ rotulo: i % 30 === 0 ? MESES_CURTOS[(5 + i / 30) % 12] : (i % 30 === 15 ? '' : `${(i % 30) + 1} ${MESES_CURTOS[(5 + Math.floor(i / 30)) % 12]}`) })),
    formatarY: (v) => `${formatCompacto(v)}`, formatarValor: (v) => `${(v - 100).toFixed(1).replace('.', ',')}%`, maxRotulosX: 5, zero: false, altura: 240,
    card: { rotulo: 'Carteira x referências', valor: formatPctSinal(0.142), delta: { texto: '+1,57% no mês', sinal: 1 }, periodos: [{ id: '1m', rotulo: '1m' }, { id: '4m', rotulo: '4m' }], periodo: '4m' },
  }));
  void cmp;
  const nM = 12;
  guardar(criarGraficoLinha(slot(g), {
    series: [
      { id: 'a', nome: 'Ações', valores: passeio(nM, 50, 8, 3, 1) }, { id: 'f', nome: 'FIIs', valores: passeio(nM, 40, 6, 5, 0.7) },
      { id: 'r', nome: 'Renda Fixa', valores: passeio(nM, 30, 3, 9, 0.9) }, { id: 'u', nome: 'EUA', valores: passeio(nM, 20, 9, 13, 0.5) },
    ], eixoX: M12, formatarY: (v) => formatCompacto(v), formatarValor: (v) => formatBRL0(v * 1000), altura: 240,
    card: { rotulo: 'Retorno por classe', valor: 'Multilinhas' },
  }));
  const volatil = passeio(150, 60, 9, 41, -0.25);
  guardar(criarGraficoLinha(slot(g), {
    series: [{ id: 'cripto', nome: 'Cripto', valores: volatil, cor: 'var(--chart-down, #dc2626)' }], eixoX: Array.from({ length: 150 }, (_, i) => (i % 25 === 0 ? MESES_CURTOS[(i / 25) % 12] : '')),
    formatarY: (v) => formatCompacto(v), formatarValor: (v) => `${v.toFixed(0)} pts`, altura: 240, maxRotulosX: 6,
    card: { rotulo: 'Cripto · volátil', valor: formatPctSinal(-0.0102), delta: { texto: '−1,02% hoje', sinal: -1 } },
  }));

  /* 2. áreas */
  g = secao('Área suave', 'Camadas empilhadas em tons do mesmo matiz (rampa) ou cores por classe; curvas suaves monotônicas; sobe da base com fade (500ms).');
  const camadas = (sem) => [{ nome: 'Dividendos', valores: passeio(12, 30, 5, sem, 0.3).map(Math.abs) }, { nome: 'JCP', valores: passeio(12, 20, 4, sem + 1, 0.2).map(Math.abs) }, { nome: 'Rendimentos FII', valores: passeio(12, 14, 3, sem + 2, 0.4).map(Math.abs) }];
  guardar(criarGraficoArea(slot(g), { series: camadas(5), eixoX: M12, formatarY: mil, formatarValor: formatBRL0, total: true, altura: 240, card: { rotulo: 'Proventos', valor: 'Empilhada · rampa tonal' } }));
  guardar(criarGraficoArea(slot(g), {
    series: [{ nome: 'Ações', valores: passeio(12, 40, 6, 17, 1.2).map(Math.abs) }, { nome: 'FIIs', valores: passeio(12, 24, 4, 19, 0.8).map(Math.abs) }, { nome: 'Renda Fixa', valores: passeio(12, 16, 2, 21, 0.6).map(Math.abs) }],
    eixoX: M12, tons: 'categorica', formatarY: mil, formatarValor: formatBRL0, total: true, altura: 240, card: { rotulo: 'Patrimônio por classe', valor: 'Empilhada · cores por classe' },
  }));
  guardar(criarGraficoArea(slot(g), {
    series: [{ nome: 'Patrimônio', valores: passeio(40, 50, 8, 2, 1.1).map(Math.abs) }, { nome: 'Investido', valores: passeio(40, 40, 4, 3, 0.9).map(Math.abs) }], eixoX: Array.from({ length: 40 }, (_, i) => (i % 10 === 0 ? `T${i / 10 + 1}` : '')),
    empilhado: false, suave: true, tons: 'categorica', formatarY: mil, formatarValor: formatBRL0, altura: 220, card: { rotulo: 'Área sobreposta', valor: 'Lavada, sem empilhar' },
  }));

  /* 3. barras */
  g = secao('Barras', 'Simples com 1 destacada · agrupadas com topo arredondado · empilhadas com rampa tonal e 2px de ar entre segmentos. Crescem escalonadas (25ms por barra); a coluna inteira é o alvo do hover.');
  guardar(criarGraficoBarras(slot(g), { modo: 'simples', categorias: M12, series: [{ nome: 'Aportes', valores: [3, 5.5, 4.2, 6, 5, 7.5, 6.2, 8.1, 5.8, 9, 7, 6.4].map((v) => v * 1000), cor: 1 }], destaque: 7, formatarY: mil, formatarValor: formatBRL0, altura: 240, card: { rotulo: 'Aportes por mês', valor: 'Simples · 1 destacada' } }));
  guardar(criarGraficoBarras(slot(g), {
    modo: 'agrupadas', categorias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
    series: [{ nome: 'Ações', valores: [280, 410, 270, 320, 410, 290, 250], cor: 1 }, { nome: 'FIIs', valores: [330, 360, 285, 350, 380, 350, 285], cor: 2 }, { nome: 'Renda Fixa', valores: [250, 320, 240, 260, 390, 270, 250], cor: 3 }],
    formatarY: (v) => formatCompacto(v), formatarValor: formatBRL0, altura: 240, card: { rotulo: 'Cotações por dia', valor: 'Agrupadas · topo arredondado' },
  }));
  const proventosBase = (n, sem) => [{ id: 'div', nome: 'Dividendos', valores: passeio(n, 200, 40, sem, 0).map(Math.abs) }, { id: 'jcp', nome: 'JCP', valores: passeio(n, 120, 30, sem + 1, 0).map(Math.abs) }, { id: 'fii', nome: 'Rendimentos FII', valores: passeio(n, 280, 50, sem + 2, 0).map(Math.abs) }];
  guardar(criarGraficoBarras(slot(g, { largo: true }), {
    modo: 'empilhadas', categorias: M12, series: proventosBase(12, 4), formatarY: mil, formatarValor: formatBRL0, altura: 280,
    card: {
      rotulo: 'Proventos', valor: 'Empilhadas · rampa tonal · morfa ao trocar o período', periodos: PERIODOS.slice(0, 2), periodo: '12m',
      aoMudarPeriodo: (id, gr) => { const n = id === '6m' ? 6 : 12; gr.atualizar({ categorias: meses(n), series: proventosBase(n, id === '6m' ? 8 : 4) }); },
    },
  }));
  guardar(criarGraficoBarras(slot(g), {
    modo: 'empilhadas', tons: 'categorica', categorias: meses(8), series: [{ id: 'a', nome: 'Ações', valores: [4, 3, 5, 2, 4, 6, 3, 5].map((v) => v * 1000), cor: 1 }, { id: 'f', nome: 'FIIs', valores: [2, 3, 2, 4, 3, 2, 4, 2].map((v) => v * 1000), cor: 2 }, { id: 'r', nome: 'Renda Fixa', valores: [3, 2, 2, 3, 5, 3, 2, 3].map((v) => v * 1000), cor: 3 }],
    formatarY: mil, formatarValor: formatBRL0, altura: 240, card: { rotulo: 'Aportes por classe', valor: 'Cores categóricas · clique na legenda' },
  }));
  guardar(criarGraficoBarras(slot(g), {
    modo: 'simples', corPorSinal: true, categorias: M12, series: [{ nome: 'Rentabilidade', valores: [1.8, -0.6, 2.4, 0.9, -1.7, 3.1, 1.2, -0.3, 2.2, 0.4, -2.1, 1.5] }],
    formatarY: (v) => `${formatCompacto(v)}%`, formatarValor: (v) => formatPctSinal(v / 100, 2), altura: 240, card: { rotulo: 'Rentabilidade mensal', valor: 'Alta/baixa pela cor (--chart-up/--chart-down)' },
  }));

  /* 4. horizontais + pílulas */
  g = secao('Barras horizontais e pílulas', 'Horizontais com valor na ponta (só quando cabe) · pílulas de faixa: pontas totalmente arredondadas, segmentos tonais; com `base` viram faixa flutuante (mín-máx).');
  guardar(criarGraficoBarras(slot(g), {
    orientacao: 'horizontal', modo: 'simples', categorias: ['Banco A', 'Varejo B', 'Energia C', 'Mineração D', 'Papel E', 'Saúde F'], series: [{ nome: 'Peso', valores: [18400, 14100, 11800, 9300, 6200, 3900], cor: 1 }],
    formatarY: mil, formatarValor: formatBRL0, altura: 250, card: { rotulo: 'Maiores posições', valor: 'Horizontais · valor na ponta' },
  }));
  guardar(criarGraficoBarras(slot(g), {
    orientacao: 'horizontal', modo: 'empilhadas', categorias: ['Ações', 'FIIs', 'Renda Fixa', 'EUA'], series: [{ nome: 'Meta atingida', valores: [60, 45, 80, 30] }, { nome: 'Falta', valores: [20, 25, 10, 40] }, { nome: 'Excedente', valores: [5, 0, 0, 3] }],
    formatarY: (v) => `${v}%`, formatarValor: (v) => `${v}%`, altura: 220, card: { rotulo: 'Meta por classe', valor: 'Horizontais empilhadas' },
  }));
  guardar(criarGraficoPilulas(slot(g), {
    categorias: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], series: [{ nome: 'Base', valores: [12, 8, 20, 6, 12, 7] }, { nome: 'Meio', valores: [14, 10, 18, 11, 12, 15] }, { nome: 'Topo', valores: [10, 12, 14, 8, 16, 11] }],
    formatarY: (v) => `${v}`, formatarValor: (v) => `${v} pts`, altura: 240, card: { rotulo: 'Pílulas', valor: 'Segmentos tonais' },
  }));
  guardar(criarGraficoPilulas(slot(g), {
    categorias: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'], series: [{ nome: 'Faixa', valores: [12, 18, 9, 22, 14, 16], cor: 1 }], base: [8, 14, 12, 6, 15, 10],
    formatarY: (v) => `${v}`, formatarValor: (v) => `${v} pts`, altura: 240, legenda: false, card: { rotulo: 'Pílulas de faixa', valor: 'Mínimo a máximo' },
  }));

  /* 5. anel */
  g = secao('Anel e progresso', 'Composição da carteira em anel com espaço entre fatias (varre no sentido horário). Hover/legenda/setas destacam a fatia e trocam o centro. Anéis de progresso e barras finas para metas.');
  const classes = (k) => [{ id: 'a', nome: 'Ações', valor: 42000 * k, cor: 1 }, { id: 'f', nome: 'FIIs', valor: 31000, cor: 2 }, { id: 'r', nome: 'Renda Fixa', valor: 56000, cor: 3 }, { id: 'u', nome: 'EUA', valor: 18000, cor: 4 }, { id: 'c', nome: 'Cripto', valor: 6500, cor: 5 }, { id: 'x', nome: 'Caixa/Reserva', valor: 24000, cor: 6 }];
  guardar(criarAnel(slot(g, { largo: false }), { fatias: classes(1), formatarValor: formatBRL0, centro: { rotulo: 'Patrimônio' }, tamanho: 200, aria: 'Composição da carteira', card: { rotulo: 'Composição', valor: 'Anel · legenda à direita', periodos: [{ id: 'a', rotulo: 'Classe' }, { id: 'b', rotulo: 'Ativo' }], periodo: 'a', aoMudarPeriodo: (id, gr) => gr.atualizar({ fatias: id === 'a' ? classes(1) : classes(1).slice(0, 3).map((f, i) => ({ ...f, id: `x${i}`, nome: `Ativo ${i + 1}`, valor: f.valor / 3 })).concat([{ id: 'y', nome: 'Outros', valor: 9000, cor: 8 }]) }) } }));
  const cardProg = slot(g);
  const cp = criarCardGrafico(cardProg, { rotulo: 'Metas', valor: 'Anéis e barras de progresso' });
  guardar(cp);
  const caixa = document.createElement('div'); caixa.className = 'cat-barra-bloco'; cp.corpo.appendChild(caixa);
  const aneis = document.createElement('div'); aneis.className = 'cat-linha-aneis'; caixa.appendChild(aneis);
  const mkAnel = (op) => { const d = document.createElement('div'); aneis.appendChild(d); return guardar(criarAnelProgresso(d, op)); };
  mkAnel({ valor: 0.72, rotulo: '72%', subrotulo: 'da meta', cor: 1 });
  mkAnel({ valor: 0.38, valor2: 0.55, rotulo: '38%', subrotulo: 'líquido', cor: 2, cor2: 6 });
  mkAnel({ valor: 1, rotulo: '100%', subrotulo: 'concluída', cor: 'up' === 'x' ? 1 : 6 });
  const b1 = document.createElement('div'); b1.innerHTML = '<small>Barra de progresso com meta (60%)</small>'; const bp = document.createElement('div'); b1.appendChild(bp); caixa.appendChild(b1);
  guardar(criarBarraProgresso(bp, { valor: 0.42, meta: 0.6, cor: 1, rotulo: 'Reserva de emergência' }));
  const b2 = document.createElement('div'); b2.innerHTML = '<small>Composição (faixa em pílulas)</small>'; const bc = document.createElement('div'); b2.appendChild(bc); caixa.appendChild(b2);
  guardar(criarBarraComposicao(bc, { fatias: classes(1), formatarValor: formatBRL0 }));

  /* 6. sparklines + KPI */
  g = secao('Sparklines e KPIs', 'KPI com contagem rápida (400ms) e sparkline no rodapé colorida pela direção; célula de tabela com `sparklineHtml` (desenho por CSS); sparkline com hover.', { classe: 'cat-kpis' });
  const kpis = [
    { rotulo: 'Patrimônio total', valor: 268400.38, formatar: formatBRL, delta: { texto: '1,57%', sinal: 1 }, spark: { valores: passeio(30, 100, 4, 61, 0.7) }, info: 'Soma de todas as classes' },
    { rotulo: 'Aportes no ano', valor: 36400, formatar: formatBRL0, delta: { texto: '0,02%', sinal: -1 }, spark: { valores: passeio(30, 100, 5, 62, -0.4) }, info: 'Aportes confirmados' },
    { rotulo: 'Proventos (12 meses)', valor: 9870.45, formatar: formatBRL, delta: { texto: '2,11%', sinal: 1 }, spark: { valores: passeio(30, 100, 3, 63, 0.3) }, info: 'Líquido, já recebido' },
    { rotulo: 'Rentabilidade 12m', valor: 0.1142, formatar: (v) => formatPctSinal(v, 2), delta: { texto: 'vs. CDI', sinal: 0 }, spark: { valores: passeio(30, 100, 2, 64, 0.2) }, info: 'Cota ajustada por aportes' },
  ];
  for (const k of kpis) guardar(criarKpi(slot(g), k));
  g = secao('Sparkline em tabela e em card', 'Colorida pela direção (alta/baixa) em qualquer tela; a célula de tabela é uma string de <svg> de tamanho fixo.', { classe: 'cat-grid' });
  const tab = slot(g); const env = document.createElement('div'); env.className = 'cat-rolagem'; tab.appendChild(env);
  const ativos = [['AAAA3', 'Empresa A', 31.2, 0.0157], ['BBBB11', 'Fundo B', 102.4, -0.0042], ['CCCC4', 'Empresa C', 18.9, 0.0211], ['DDDD3', 'Empresa D', 54.1, -0.0136], ['EEEE11', 'Fundo E', 9.35, 0.0033]];
  env.innerHTML = `<table class="cat-tabela"><thead><tr><th>Ativo</th><th class="num">Preço</th><th class="num">Dia</th><th class="num">7 dias</th></tr></thead><tbody>${ativos.map(([t, n, p, v], i) => {
    const s = passeio(24, 100, 3, 70 + i, v > 0 ? 0.5 : -0.5);
    const icone = v > 0 ? 'M3.7 17.7 2.3 16.3 9.8 8.8l4 4L20.6 6H16V4h8v8h-2V7.4l-8.2 8.2-4-4z' : 'M16 20v-2h4.6l-6.8-6.8-4 4-7.5-7.5L3.7 6.3l6.1 6.1 4-4 8.2 8.2V12h2v8z';
    return `<tr><td>${t}<br><small style="font-weight:400;color:var(--md-sys-color-on-surface-variant,#475569)">${n}</small></td><td class="num">${formatBRL(p)}</td><td class="num"><span class="cat-var ${v > 0 ? 'up' : 'down'}"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="${icone}" fill="currentColor"/></svg>${formatPctSinal(v, 2)}</span></td><td class="num">${sparklineHtml(s, { aria: `${t}: ${v > 0 ? 'alta' : 'queda'} em 7 dias` })}</td></tr>`;
  }).join('')}</tbody></table>`;
  const sc = slot(g);
  const csp = criarCardGrafico(sc, { rotulo: 'Dell, Inc.', valor: 'Sparkline com hover', delta: { texto: '1,57%', sinal: 1 } }); guardar(csp);
  guardar(criarSparkline(csp.corpo, { valores: passeio(60, 100, 3, 91, 0.35), altura: 72, hover: true, formatar: (v) => `US$ ${v.toFixed(2).replace('.', ',')}` }));
  const csp2 = criarCardGrafico(slot(g), { rotulo: 'Alphabet, Inc', valor: 'Queda', delta: { texto: '1,57%', sinal: -1 } }); guardar(csp2);
  guardar(criarSparkline(csp2.corpo, { valores: passeio(60, 100, 3, 92, -0.4), altura: 72, hover: true }));

  /* 7. estados */
  g = secao('Estados do card', 'Vazio, carregando (skeleton), erro com "Tentar de novo" e "recarregando" (mantém o gráfico à vista, esmaecido, sem pular o layout).');
  const mk = (rotulo, estado, extra = {}) => { const c = criarCardGrafico(slot(g), { rotulo, valor: estado, altura: 180, estado, ...extra }); return guardar(c); };
  mk('Sem dados', 'vazio', { mensagemVazio: 'Ainda não há aportes neste período.' });
  mk('Carregando', 'carregando');
  mk('Erro', 'erro', { mensagemErro: 'Não deu pra carregar este gráfico agora.', aoTentarNovamente: (c) => { c.definirEstado('carregando'); setTimeout(() => c.definirEstado('vazio'), 900); } });
  const rec = criarCardGrafico(slot(g), { rotulo: 'Recarregando', valor: 'Mantém o quadro' }); guardar(rec);
  const gr = criarGraficoLinha(rec.corpo, { series: [{ nome: 'Valor', valores: passeio(12, 100, 6, 12, 1) }], eixoX: M12, formatarY: (v) => formatCompacto(v), altura: 180 });
  guardar(gr); rec.recarregando(true);
}

/* ---------- tema ---------- */
const raiz = document.documentElement;
const temaBox = document.createElement('div'); temaBox.className = 'chart'; temaBox.style.display = 'inline-block';
const seg = document.getElementById('catTema'); temaBox.appendChild(seg); document.getElementById('catTema') || 0;
document.querySelector('.cat-controles').insertBefore(temaBox, document.querySelector('.cat-controles').firstChild);
const TEMAS = [['auto', 'Auto'], ['light', 'Claro'], ['dark', 'Escuro']];
function pintarTema(atual) {
  seg.textContent = '';
  for (const [id, rot] of TEMAS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chart-seg-btn'; b.setAttribute('aria-pressed', String(id === atual));
    const ck = iconeSvg(document, 'check', 16); ck.classList.add('chart-seg-ck'); b.appendChild(ck); b.appendChild(document.createTextNode(rot));
    b.addEventListener('click', () => { definirTema(id); });
    seg.appendChild(b);
  }
}
function definirTema(id) { if (id === 'auto') raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', id); pintarTema(id); }
const q = new URLSearchParams(location.search).get('tema');
definirTema(q === 'escuro' || q === 'dark' ? 'dark' : q === 'claro' || q === 'light' ? 'light' : 'auto');
document.getElementById('catRepetir').addEventListener('click', construir);
construir();

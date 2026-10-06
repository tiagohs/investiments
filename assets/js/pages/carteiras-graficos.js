/**
 * carteiras-graficos.js — 06/10/2026 (Onda 3, fase 2): gráficos e cards KPI de Carteiras (Visão geral, as 4 classes e a tela
 * do ativo) na biblioteca única assets/js/charts/ (kit Figma "Material You"). Substitui, nessas telas, os SVG feitos à mão
 * (renderGraficoRentabilidade/wireGraficoRentabilidade de inicio.js e renderEvolucao*Carteiras) - a conta continua a MESMA
 * (normalizarSerieRentabilidade, calcularResumoRentabilidade, calcularComparativo... de inicio.js), só o desenho mudou.
 *
 *   criarGraficosCarteira(doc, container, { historico, paineis, ... }) -> { atualizar(), carregando(), vazio(), destruir() }
 *      toolbar (título + seletor de período canônico com "Escolher período") + grade com, por painel,
 *      um card "Rentabilidade" (série do portfólio x índices pontilhados + card de Análise) e um "Evolução" (valor x
 *      valor aplicado + "Ontem era"). UM seletor de período manda em todos os cards do bloco.
 *   montarKpis(doc, container, itens, dono)   cards KPI do kit (contagem animada, tendência com ícone, sparkline, info).
 *   desenharAnelDistribuicao(...)              anel de composição (donut) com legenda.
 *   lembrarGrafico/destruirGraficos(dono)      registro pra liberar observers/ouvintes quando a tela é redesenhada.
 */

import { criarGraficoLinha, criarAnel, criarKpi, criarCardGrafico } from '../charts/index.js';
import {
  formatBRL, formatUSD, formatDateBR, formatDM, formatMesAno, formatPct, formatPercentFromPoints, formatNumeroBR, variacaoNula,
} from '../format.js';
import { ligarFiltroPeriodo, botoesSegmentadoHtml, ehPeriodoPersonalizado } from '../periodo-personalizado.js';
import { renderAnalise } from '../analise-grafico.js';
import { calcularComparativo } from './inicio-comparativo.js';
import {
  filtrarHistoricoPorPeriodo, normalizarSerieRentabilidade, calcularResumoRentabilidade, calcularResumoEvolucao, somarProventosNoPeriodo,
  limitesDoHistorico_, CAMPO_PRINCIPAL_POR_VISAO, CAMPO_FLUXO_POR_VISAO, CAMPO_FLUXO_APLICADO_POR_VISAO, COR_PRINCIPAL_POR_VISAO,
  BENCHMARKS_POR_VISAO, LABEL_POR_VISAO_RENTABILIDADE, primeiroIndiceValidoInicio_, inicioEhAbertura_, ultimoValidoDe_, montarAnaliseRentabilidade_,
} from './inicio.js';

/** Ids dos presets (os que as telas e os cálculos já usam); os rótulos canônicos vêm de periodo-personalizado.js. */
export const PERIODOS_CARTEIRAS = ['mes', '30d', '6m', '12m', '3a', 'tudo'];

// ---------------------------------------------------------------------------
// Registro de gráficos por "dono" (a tela troca o innerHTML várias vezes: cache -> dado novo -> atualizar)
// ---------------------------------------------------------------------------
const REGISTRO = new WeakMap();

/** Guarda `g` (qualquer coisa com destruir()) pra ser liberado em destruirGraficos(dono). Devolve `g`. */
export function lembrarGrafico(dono, g) {
  if (!dono || !g) return g;
  if (!REGISTRO.has(dono)) REGISTRO.set(dono, new Set());
  REGISTRO.get(dono).add(g);
  return g;
}

/** Libera tudo que foi registrado em `dono` (chame antes de trocar o conteúdo dele). */
export function destruirGraficos(dono) {
  const set = dono && REGISTRO.get(dono);
  if (!set) return;
  set.forEach((g) => { try { if (g && typeof g.destruir === 'function') g.destruir(); } catch (e) { /* já saiu do DOM */ } });
  REGISTRO.delete(dono);
}

// ---------------------------------------------------------------------------
// Pequenos auxiliares
// ---------------------------------------------------------------------------
const MAPA_COR = { '--acoes': 1, '--fiis': 2, '--rf': 3, '--usa': 4, '--cripto': 5, '--caixa': 6 };

/** Token legado de cor da classe ('--acoes', 'var(--fiis)'...) -> cor da biblioteca (número 1-8 ou var() do próprio gráfico). */
export function corDoToken(token) {
  if (typeof token === 'number') return token;
  const t = String(token || '').replace(/^var\(/, '').replace(/\)$/, '').trim();
  if (MAPA_COR[t]) return MAPA_COR[t];
  if (t === '--ink-faint' || t === '--ink-muted' || t === '--ink') return 'var(--_axis)';
  return 1;
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const formatadorDe = (moeda) => (moeda === 'USD' ? formatUSD : formatBRL);

function el(doc, tag, props = {}, filhos = []) {
  const e = doc.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === 'class') e.className = v;
    else if (k === 'texto') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  });
  [].concat(filhos).forEach((f) => { if (f != null && f !== false) e.append(f.nodeType ? f : doc.createTextNode(String(f))); });
  return e;
}

const SVG_ICONES = {
  sobe: 'M3.7 17.7 2.3 16.3 9.8 8.8l4 4L20.6 6H16V4h8v8h-2V7.4l-8.2 8.2-4-4z',
  desce: 'M16 20v-2h4.6l-6.8-6.8-4 4-7.5-7.5L3.7 6.3l6.1 6.1 4-4 8.2 8.2V12h2v8z',
  igual: 'M4 11h16v2H4z',
  info: 'M11 17h2v-6h-2zm1-8a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm0 13a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  alerta: 'M1 21 12 2l11 19zm11-3q.425 0 .713-.288T13 17t-.288-.712T12 16t-.712.288T11 17t.288.713T12 18m-1-3h2v-5h-2z',
};
const NS = 'http://www.w3.org/2000/svg';
/** Ícone Material (preenchido, currentColor). */
export function iconeMaterial(doc, nome, tamanho = 16) {
  const s = doc.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(tamanho)); s.setAttribute('height', String(tamanho));
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.setAttribute('class', 'ico');
  const p = doc.createElementNS(NS, 'path'); p.setAttribute('d', SVG_ICONES[nome] || SVG_ICONES.igual); p.setAttribute('fill', 'currentColor');
  s.appendChild(p);
  return s;
}

/** { texto, sinal } do chip de tendência a partir de um número (positivo/negativo/zero). */
export function sinalDe(n) { return !num(n) || Math.abs(n) < 1e-9 ? 0 : (n > 0 ? 1 : -1); }

/** "Tendência" do kit em HTML-DOM: ícone + texto colorido pela direção (nunca só cor). */
export function criarTendencia(doc, texto, sinal) {
  const classe = sinal > 0 ? 'sobe' : sinal < 0 ? 'desce' : 'estavel';
  return el(doc, 'span', { class: `tendencia ${classe}` }, [iconeMaterial(doc, sinal > 0 ? 'sobe' : sinal < 0 ? 'desce' : 'igual', 16), el(doc, 'span', { texto })]);
}

/** Acumula o campo de fluxo "Valor aplicado" diário em `investidoAcumulado` (histórico inteiro, não a janela filtrada). */
export function comHistoricoAcumuladoClasse_(historico, campoFluxo) {
  let acumulado = 0;
  return (historico || []).map((item) => {
    const fluxo = campoFluxo && num(item[campoFluxo]) ? item[campoFluxo] : 0;
    acumulado += fluxo;
    return { ...item, investidoAcumulado: acumulado };
  });
}

function diasEntre(a, b) {
  const x = Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`); const y = Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(x) && Number.isFinite(y) ? Math.round((y - x) / 86400000) : 0;
}

/** Rótulos do eixo X: "dd/mm" em janelas curtas, "mês/aa" nas longas; guarda a data p/ o título do tooltip. */
export function eixoXDe(janela) {
  const longo = janela.length > 1 && diasEntre(janela[0].data, janela[janela.length - 1].data) > 200;
  return janela.map((p) => ({ rotulo: longo ? formatMesAno(p.data) : formatDM(p.data), data: p.data }));
}

const formatarX = (item) => (item && item.data ? formatDateBR(item.data) : '');
const formatarYPct = (v) => formatPct(v / 100, Number.isInteger(v) ? 0 : 1);

// ---------------------------------------------------------------------------
// Cálculo da Rentabilidade (a MESMA conta de renderGraficoRentabilidade, sem DOM)
// ---------------------------------------------------------------------------
export function calcularRentabilidade({ historico, visaoId = 'total', periodoId = '12m', benchmarksExtra = null } = {}) {
  const campoPrincipal = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const campoFluxoPrincipal = CAMPO_FLUXO_POR_VISAO[visaoId] || CAMPO_FLUXO_POR_VISAO.total;
  const benchmarks = [...(BENCHMARKS_POR_VISAO[visaoId] || BENCHMARKS_POR_VISAO.total), ...(Array.isArray(benchmarksExtra) ? benchmarksExtra : [])];
  let janela = filtrarHistoricoPorPeriodo(historico, periodoId, campoPrincipal);
  const idxNasc = primeiroIndiceValidoInicio_(janela, campoPrincipal);
  if (idxNasc > 0) janela = janela.slice(idxNasc);
  if (janela.length < 2) return null;
  const seriePrincipal = normalizarSerieRentabilidade(janela, campoPrincipal, campoFluxoPrincipal, {
    abertura: inicioEhAbertura_(historico, janela, campoPrincipal, campoFluxoPrincipal),
  });
  const seriesBenchmark = benchmarks.map((b) => {
    const valores = normalizarSerieRentabilidade(janela, b.campo);
    return { ...b, valores, delta: ultimoValidoDe_(valores) };
  });
  return { janela, seriePrincipal, seriesBenchmark, campoPrincipal, campoFluxoPrincipal, deltaPrincipal: ultimoValidoDe_(seriePrincipal) };
}

// ---------------------------------------------------------------------------
// Painéis (um card de gráfico + extras embaixo)
// ---------------------------------------------------------------------------
function criarPainelBase(doc, slot, { rotuloInicial = '', altura = 260 } = {}) {
  const p = { slot, grafico: null, card: null, extras: null, destruido: false };
  p.extras = el(doc, 'div', { class: 'cg-extras' });
  p.montarCard = (estado, mensagem) => {
    if (p.grafico) { p.grafico.destruir(); p.grafico = null; }
    if (p.card) { p.card.destruir(); p.card = null; }
    p.card = criarCardGrafico(slot, { rotulo: rotuloInicial, altura, estado: 'carregando', aoTentarNovamente: p.aoTentar ? () => p.aoTentar() : null });
    if (estado && estado !== 'carregando') p.card.definirEstado(estado, mensagem);
    slot.append(p.extras);
    p.extras.replaceChildren();
    return p.card;
  };
  p.carregando = () => { if (p.grafico || !p.card) p.montarCard('carregando'); else p.card.definirEstado('carregando'); };
  p.vazio = (mensagem) => { if (p.grafico || !p.card) p.montarCard('vazio', mensagem); else p.card.definirEstado('vazio', mensagem); p.extras.replaceChildren(); };
  p.erro = (mensagem) => { if (p.grafico || !p.card) p.montarCard('erro', mensagem); else p.card.definirEstado('erro', mensagem); p.extras.replaceChildren(); };
  p.destruir = () => { p.destruido = true; if (p.grafico) p.grafico.destruir(); else if (p.card) p.card.destruir(); p.grafico = null; p.card = null; p.extras.remove(); };
  return p;
}

function notaCard(doc, partes) {
  const n = el(doc, 'p', { class: 'cg-nota' });
  n.append(...[].concat(partes).map((x) => (x && x.nodeType ? x : doc.createTextNode(String(x)))));
  return n;
}

/** Card "Rentabilidade acumulada". cfg: { visaoId, labelInfo, labelPrincipal, moeda, corToken, camposProventos, analise, analiseExtra, benchmarksExtra, nomeAnalise, titulo }. */
function criarPainelRentabilidade(doc, slot, cfg) {
  const visaoId = cfg.visaoId;
  const formatarMoeda = formatadorDe(cfg.moeda);
  const corPrincipal = corDoToken(cfg.corToken || COR_PRINCIPAL_POR_VISAO[visaoId]);
  const labelPrincipal = cfg.labelPrincipal || 'Portfólio';
  const titulo = cfg.titulo || 'Rentabilidade acumulada';
  const rotuloBase = `${titulo} · ${cfg.labelInfo || LABEL_POR_VISAO_RENTABILIDADE[visaoId] || LABEL_POR_VISAO_RENTABILIDADE.total}`;
  const p = criarPainelBase(doc, slot, { rotuloInicial: rotuloBase });
  p.aoTentar = cfg.aoTentar;
  p.analiseEl = el(doc, 'div', { class: 'ag-slot cg-analise' });
  p.montarCard('carregando');

  p.desenhar = (ctx) => {
    const calc = calcularRentabilidade({ historico: ctx.historico, visaoId, periodoId: ctx.periodo, benchmarksExtra: cfg.benchmarksExtra });
    if (!calc) { p.vazio('Ainda não há histórico suficiente neste período. Escolha um período maior.'); if (cfg.analise) renderAnalise(doc, p.analiseEl, null); return; }
    const { janela, seriePrincipal, seriesBenchmark } = calc;
    const resumo = calcularResumoRentabilidade(ctx.patrimonio || null, ctx.historico, { visaoId, periodoId: ctx.periodo });
    const series = [
      { id: 'principal', nome: labelPrincipal, valores: seriePrincipal, principal: true, cor: corPrincipal },
      ...seriesBenchmark.map((b) => ({ id: b.campo, nome: b.label, valores: b.valores, pontilhada: true, cor: corDoToken(b.cor) })),
    ];
    const sinal = sinalDe(resumo.percentual);
    const textoDelta = [
      num(resumo.ganhoReais) ? `${resumo.ganhoReais >= 0 ? '+' : '−'}${formatarMoeda(Math.abs(resumo.ganhoReais))}` : null,
      num(resumo.percentual) ? formatPercentFromPoints(resumo.percentual) : null,
    ].filter(Boolean).join(' · ');
    const cabecalho = {
      rotulo: resumo.dataFim ? `${rotuloBase} · em ${formatDateBR(resumo.dataFim)}` : rotuloBase,
      valor: num(resumo.valorAtual) ? formatarMoeda(resumo.valorAtual) : '—',
      delta: textoDelta ? { texto: `${textoDelta} no período`, sinal } : null,
    };
    const dados = { series, eixoX: eixoXDe(janela), ...cabecalho };
    if (p.grafico) {
      p.card.definirEstado('ok');
      p.grafico.atualizar(dados);
    } else {
      if (p.card) { p.card.destruir(); p.card = null; }
      p.grafico = criarGraficoLinha(slot, {
        ...dados, altura: 260, zero: true, formatarY: formatarYPct, formatarValor: (v) => formatPercentFromPoints(v), formatarX,
        aria: `Rentabilidade acumulada: ${labelPrincipal} e índices`, card: { rotulo: cabecalho.rotulo, valor: cabecalho.valor, delta: cabecalho.delta, altura: 260 },
      });
      p.card = p.grafico.card;
      slot.append(p.extras);
    }
    // extras: "contra o índice", proventos do período, aviso de dados, análise
    p.extras.replaceChildren();
    const vs = seriesBenchmark.filter((b) => num(b.delta) && num(calc.deltaPrincipal));
    if (vs.length) {
      const linha = el(doc, 'div', { class: 'cg-vs', role: 'group', 'aria-label': 'Resultado contra os índices no período' });
      vs.forEach((b) => {
        const rel = calc.deltaPrincipal - b.delta;
        const tom = variacaoNula(rel) ? '' : (rel >= 0 ? 'chip-good' : 'chip-bad');
        const chip = el(doc, 'span', { class: `chip-tonal ${tom}`, title: `${labelPrincipal} menos ${b.label} no período: ${rel >= 0 ? 'acima' : 'abaixo'} do índice` },
          [iconeMaterial(doc, rel > 0.005 ? 'sobe' : rel < -0.005 ? 'desce' : 'igual', 14), `vs ${b.label} ${formatPercentFromPoints(rel)}`]);
        linha.append(chip);
      });
      p.extras.append(linha);
    }
    const proventos = cfg.camposProventos ? somarProventosNoPeriodo(ctx.historico, ctx.periodo, calc.campoPrincipal, cfg.camposProventos) : null;
    if (proventos != null) p.extras.append(notaCard(doc, `Proventos recebidos no período: ${formatarMoeda(proventos)}`));
    if (resumo.diasSuspeitos && resumo.diasSuspeitos.length) {
      const dias = resumo.diasSuspeitos;
      const exemplos = dias.slice(0, 3).map((d) => `${d.data ? formatDateBR(d.data) : '?'} (${formatPercentFromPoints(d.retorno)})`).join(', ');
      p.extras.append(el(doc, 'details', { class: 'cg-aviso' }, [
        el(doc, 'summary', {}, [iconeMaterial(doc, 'alerta', 18), `${dias.length} dia${dias.length === 1 ? '' : 's'} com variação fora do normal nos dados`]),
        el(doc, 'p', { texto: `Dia${dias.length === 1 ? '' : 's'} com variação fora do normal no histórico: ${exemplos}${dias.length > 3 ? '…' : ''}. O % desconsidera ${dias.length === 1 ? 'esse dia' : 'esses dias'}; o ganho em reais não, então os dois podem divergir.` }),
      ]));
    }
    if (cfg.analise) {
      p.extras.append(p.analiseEl);
      const analise = montarAnaliseRentabilidade_({
        historico: ctx.historico, janela, seriePrincipal, seriesBenchmark, visaoId, campoPrincipal: calc.campoPrincipal, campoFluxoPrincipal: calc.campoFluxoPrincipal,
        periodoId: ctx.periodo, nomeAnalise: cfg.nomeAnalise || null, formatarMoeda, analiseExtra: cfg.analiseExtra || null,
      });
      renderAnalise(doc, p.analiseEl, analise);
    }
  };
  return p;
}

/** Faixa "Ontem era / Setembro era..." (dados de calcularComparativo) em elementos DOM. */
export function criarFaixaComparativo(doc, comp, formatarMoeda) {
  if (!comp || !comp.referencia) return null;
  const faixa = el(doc, 'div', { class: 'cg-cmp', 'aria-label': 'Comparativo com dias e meses anteriores' });
  if (!comp.aplica) {
    faixa.append(el(doc, 'span', { class: 'cg-cmp-item', title: '"Ontem era" e os meses anteriores só aparecem em períodos de até 1 mês.' }, [el(doc, 'span', { class: 'cg-cmp-rot', texto: 'Ontem era' }), el(doc, 'b', { texto: '—' })]));
    return faixa;
  }
  if (!comp.ontem && !comp.meses.length) return null;
  const item = (rotulo, i, titulo) => {
    const v = i.variacao;
    const nodes = [el(doc, 'span', { class: 'cg-cmp-rot', texto: rotulo }), el(doc, 'b', { texto: formatarMoeda(i.valor) })];
    if (num(v)) nodes.push(criarTendencia(doc, formatPct(Math.abs(v), 2), v >= 0 ? 1 : -1));
    return el(doc, 'span', { class: 'cg-cmp-item', title: `${titulo}: ${formatarMoeda(i.valor)}` }, nodes);
  };
  const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
  if (comp.ontem) faixa.append(item(comp.ontem.ehOntem ? 'Ontem era' : `Em ${ddmm(comp.ontem.data)} era`, comp.ontem, comp.ontem.data ? `Fechamento de ${ddmm(comp.ontem.data)}` : 'Fechamento do último pregão'));
  comp.meses.forEach((m) => faixa.append(item(`${m.nome} era`, m, `Fechamento de ${m.nome.toLowerCase()} (${ddmm(m.data)})`)));
  return faixa;
}

/** Card "Evolução do patrimônio". cfg: { visaoId, labelInfo, moeda, corToken, comInvestido, labelValor, labelInvestido, comparativo, titulo }. */
function criarPainelEvolucao(doc, slot, cfg) {
  const visaoId = cfg.visaoId;
  const moeda = cfg.moeda === 'USD' ? 'USD' : 'BRL';
  const formatarMoeda = formatadorDe(moeda);
  const campoValor = CAMPO_PRINCIPAL_POR_VISAO[visaoId];
  const corPrincipal = corDoToken(cfg.corToken || COR_PRINCIPAL_POR_VISAO[visaoId]);
  const comInvestido = cfg.comInvestido !== false;
  const labelValor = cfg.labelValor || 'Portfólio';
  const labelInvestido = cfg.labelInvestido || 'Valor aplicado';
  const titulo = cfg.tituloEvolucao || cfg.titulo || 'Evolução do patrimônio';
  const rotuloBase = `${titulo} · ${cfg.labelInfoEvolucao || cfg.labelInfo || 'Patrimônio'}`;
  const p = criarPainelBase(doc, slot, { rotuloInicial: rotuloBase });
  p.aoTentar = cfg.aoTentar;
  p.montarCard('carregando');

  p.desenhar = (ctx) => {
    const historicoAcumulado = comHistoricoAcumuladoClasse_(ctx.historico, CAMPO_FLUXO_APLICADO_POR_VISAO[visaoId]);
    const janela = filtrarHistoricoPorPeriodo(historicoAcumulado, ctx.periodo, campoValor);
    const valores = janela.map((it) => (num(it[campoValor]) ? it[campoValor] : null));
    const investidos = comInvestido ? janela.map((it) => (num(it.investidoAcumulado) ? it.investidoAcumulado : null)) : null;
    const resumo = calcularResumoEvolucao(valores, investidos);
    if (valores.filter((v) => v != null).length < 2 || !resumo) { p.vazio('Ainda não há histórico suficiente neste período. Escolha um período maior.'); return; }
    const series = [{ id: 'valor', nome: labelValor, valores, principal: true, area: true, cor: corPrincipal }];
    if (investidos) series.push({ id: 'investido', nome: labelInvestido, valores: investidos, pontilhada: true, cor: 'var(--_axis)' });
    const ultimoDia = ctx.historico.length ? ctx.historico[ctx.historico.length - 1].data : null;
    const fimJanela = janela.length ? janela[janela.length - 1].data : null;
    const dataFim = fimJanela && ultimoDia && fimJanela < ultimoDia ? fimJanela : null;
    const cabecalho = {
      rotulo: dataFim ? `${rotuloBase} · em ${formatDateBR(dataFim)}` : rotuloBase,
      valor: formatarMoeda(resumo.final),
      delta: { texto: `${resumo.variacao >= 0 ? '+' : '−'}${formatarMoeda(Math.abs(resumo.variacao))} no período`, sinal: sinalDe(resumo.variacao) },
    };
    const dados = { series, eixoX: eixoXDe(janela), ...cabecalho };
    if (p.grafico) {
      p.card.definirEstado('ok');
      p.grafico.atualizar(dados);
    } else {
      if (p.card) { p.card.destruir(); p.card = null; }
      p.grafico = criarGraficoLinha(slot, {
        ...dados, altura: 260, formatarValor: formatarMoeda, formatarX, aria: `Evolução do patrimônio: ${labelValor}${investidos ? ` e ${labelInvestido}` : ''}`,
        card: { rotulo: cabecalho.rotulo, valor: cabecalho.valor, delta: cabecalho.delta, altura: 260 },
      });
      p.card = p.grafico.card;
      slot.append(p.extras);
    }
    p.extras.replaceChildren();
    if (cfg.comparativo) {
      const comp = calcularComparativo(ctx.historico, campoValor, ctx.periodo, { janela, ontemValor: cfg.usarOntem && num(ctx.ontemValor) ? ctx.ontemValor : null });
      const faixa = criarFaixaComparativo(doc, comp, formatarMoeda);
      if (faixa) p.extras.append(faixa);
    }
    if (resumo.aplicado != null) {
      const dif = resumo.diferencaAplicado;
      const pct = resumo.aplicado ? ` (${formatPercentFromPoints((dif / Math.abs(resumo.aplicado)) * 100)})` : '';
      p.extras.append(notaCard(doc, `Com aportes e retiradas. ${labelInvestido}: ${formatarMoeda(resumo.aplicado)} · ${dif >= 0 ? '+' : '−'}${formatarMoeda(Math.abs(dif))}${pct} ${dif >= 0 ? 'acima' : 'abaixo'} do aplicado.`));
    } else if (investidos === null) {
      p.extras.append(notaCard(doc, 'Valor ao longo do tempo, com aportes e retiradas.'));
    }
  };
  return p;
}

// ---------------------------------------------------------------------------
// Bloco de gráficos de uma carteira
// ---------------------------------------------------------------------------
/**
 * Monta, dentro de `container`, a toolbar (título + período) e a grade de cards.
 * op: { historico, patrimonio?, ontem?, paineis:[cfg...], ordem:['rentabilidade','evolucao'], agruparPor:'painel'|'tipo', periodoInicial:'mes',
 *       chavePeriodo, titulo:'Desempenho', semPeriodoPersonalizado }
 *   cfg (por painel): { visaoId, labelInfo, labelInfoEvolucao, moeda, corToken, camposProventos, analise, analiseExtra, benchmarksExtra,
 *       comparativo, usarOntem (usa `ontem` de atualizar()), comInvestido, labelPrincipal, labelValor, labelInvestido, semRentabilidade, semEvolucao }
 * Sem `historico` (ainda carregando / falhou) os cards ficam em "carregando" ou "vazio": use carregando()/vazio(mensagem).
 */
export function criarGraficosCarteira(doc, container, op = {}) {
  destruirGraficos(container);
  const paineisCfg = op.paineis || [];
  const ordem = op.ordem || ['rentabilidade', 'evolucao'];
  container.replaceChildren();
  const secao = el(doc, 'section', { class: 'cg-graficos', 'aria-label': 'Gráficos da carteira' });
  const toolbar = el(doc, 'div', { class: 'cg-toolbar' });
  const seletor = el(doc, 'div', { class: 'filter-tabs cg-periodo', role: 'group', 'aria-label': 'Período dos gráficos' });
  seletor.innerHTML = botoesSegmentadoHtml(PERIODOS_CARTEIRAS, op.periodoInicial || 'mes'); // segmentado do kit; o chip "Escolher período" entra depois
  toolbar.append(el(doc, 'h2', { class: 'cg-titulo', texto: op.titulo || 'Desempenho' }), seletor);
  const grade = el(doc, 'div', { class: 'cg-grade' });
  secao.append(toolbar, grade);
  container.append(secao);

  const ctx = { historico: op.historico || [], patrimonio: op.patrimonio || null, ontemValor: null, periodo: op.periodoInicial || 'mes' };
  const paineis = [];
  const criarUm = (cfg, tipo) => {
    if ((tipo === 'rentabilidade' && cfg.semRentabilidade) || (tipo === 'evolucao' && cfg.semEvolucao)) return;
    const slot = el(doc, 'div', { class: `cg-painel cg-painel-${tipo}${cfg.largo ? ' cg-painel-largo' : ''}` });
    grade.append(slot);
    paineis.push(tipo === 'rentabilidade' ? criarPainelRentabilidade(doc, slot, { ...cfg, aoTentar: op.aoTentar }) : criarPainelEvolucao(doc, slot, { ...cfg, aoTentar: op.aoTentar }));
  };
  // padrão: cada carteira com seu par (rentabilidade | evolução) lado a lado; `agruparPor:'tipo'` (Renda Fixa): primeiro todas as
  // rentabilidades, depois todas as evoluções - o painel com `largo:true` ocupa a linha inteira e os outros dividem a linha de baixo.
  if (op.agruparPor === 'tipo') ordem.forEach((tipo) => paineisCfg.forEach((cfg) => criarUm(cfg, tipo)));
  else paineisCfg.forEach((cfg) => ordem.forEach((tipo) => criarUm(cfg, tipo)));

  let tem = !!(op.historico && op.historico.length);
  const redesenhar = () => { if (!tem) return; paineis.forEach((p) => p.desenhar({ ...ctx, ontemValor: ctx.ontemValor })); };

  const filtro = ligarFiltroPeriodo(doc, seletor, {
    chave: op.chavePeriodo || null, comChip: op.semPeriodoPersonalizado ? false : true, periodoInicial: op.periodoInicial || 'mes',
    limites: limitesDoHistorico_(op.historico), aoMudar: (periodo) => { ctx.periodo = periodo; redesenhar(); },
  });
  if (filtro) ctx.periodo = filtro.periodo;
  if (tem) redesenhar();

  const api = {
    el: secao, filtro, paineis,
    /** Novo histórico (refresh/cache -> dado novo): redesenha no período atual. */
    atualizar({ historico, patrimonio, ontem } = {}) {
      if (historico) { ctx.historico = historico; tem = historico.length > 0; }
      if (patrimonio !== undefined) ctx.patrimonio = patrimonio;
      if (ontem !== undefined) ctx.ontemValor = ontem;
      const lim = limitesDoHistorico_(ctx.historico);
      if (filtro && lim) filtro.definirLimites(lim);
      if (filtro) ctx.periodo = filtro.periodo;
      redesenhar();
    },
    carregando() { paineis.forEach((p) => p.carregando()); },
    vazio(mensagem) { paineis.forEach((p) => p.vazio(mensagem)); },
    /** Falha de carga: card em estado de erro com "Tentar de novo" (op.aoTentar). */
    erro(mensagem) { paineis.forEach((p) => p.erro(mensagem)); },
    destruir() { paineis.forEach((p) => p.destruir()); try { if (filtro && filtro.fechar) filtro.fechar({ devolverFoco: false }); } catch (e) { /* calendário já fechado */ } secao.remove(); },
  };
  lembrarGrafico(container, api);
  return api;
}

// ---------------------------------------------------------------------------
// KPIs e anel
// ---------------------------------------------------------------------------
/**
 * Cards KPI do kit. `itens`: [{ rotulo, valor (número ou texto), formatar, delta:{texto,sinal}, info, spark:{valores,...}, sub (texto),
 * extra (Node), classe }]. O contêiner vira `.grid-kpi`. Devolve a lista de KPIs ({ atualizar, destruir }).
 */
export function montarKpis(doc, container, itens, dono = container) {
  if (!container) return [];
  container.replaceChildren();
  container.classList.add('grid-kpi');
  return itens.filter(Boolean).map((it) => {
    const cartao = el(doc, 'div', { class: `card card-kpi${it.classe ? ` ${it.classe}` : ''}` });
    const host = el(doc, 'div');
    cartao.append(host);
    container.append(cartao);
    const k = criarKpi(host, { rotulo: it.rotulo, valor: it.valor, formatar: it.formatar, delta: it.delta, info: null, spark: it.spark });
    if (it.info) {
      // "i" com tooltip por toque/mouse (o title nativo não aparece no celular) - ver wirePointerTooltipCarteiras_
      const topo = host.querySelector('.chart-kpi-topo');
      if (topo) {
        const i = el(doc, 'span', { class: 'info-alvo kpi-info-alvo', 'data-tooltip': it.info, tabindex: '0', role: 'img', 'aria-label': it.info }, [iconeMaterial(doc, 'info', 18)]);
        topo.append(i);
      }
    }
    if (it.sub) {
      const sub = el(doc, 'div', { class: 'cg-kpi-sub' }, [el(doc, 'span', { texto: it.sub })]);
      if (it.subInfo) sub.append(el(doc, 'span', { class: 'info-alvo kpi-info-alvo', 'data-tooltip': it.subInfo, tabindex: '0', role: 'img', 'aria-label': it.subInfo }, [iconeMaterial(doc, 'info', 16)]));
      host.querySelector('.chart-kpi').append(sub);
    }
    if (it.extra) host.querySelector('.chart-kpi').append(it.extra);
    lembrarGrafico(dono, k);
    return k;
  });
}

/** Anel de composição (donut) dentro de `container`. fatias: [{ nome, valor, cor? (1-8), id? }]. */
export function desenharAnelDistribuicao(doc, container, fatias, { formatarValor = formatBRL, centro = null, aria = 'Composição', tamanho = 200, legenda = 'direita', dono = container } = {}) {
  if (!container) return null;
  const lista = (fatias || []).filter((f) => num(f.valor) && f.valor > 0);
  container.replaceChildren();
  if (!lista.length) { container.append(el(doc, 'p', { class: 'cg-vazio', texto: 'Sem posições para mostrar.' })); return null; }
  const anel = criarAnel(container, { fatias: lista, formatarValor, tamanho, centro: centro || { rotulo: 'Total' }, aria, legenda });
  return lembrarGrafico(dono, anel);
}

export { formatarYPct, num as ehNumero, el as criarEl };

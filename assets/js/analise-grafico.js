/**
 * analise-grafico.js — card "Análise" embaixo dos gráficos de crescimento
 * (02/10/2026, pedido do Tiago: "Em todos os gráficos de análise de
 * crescimento (home, carteiras, outros), embaixo do gráfico um card de
 * análise como o das tabelas: o que está sendo analisado vs os índices do
 * gráfico, possivelmente vários pontos, ex. 'no gráfico de renda fixa, meu
 * índice caiu drasticamente nos últimos dias por tal razão'. Bom algoritmo;
 * design cuidadoso, não invasivo.").
 *
 * 03/10/2026 (Tiago: "Nas análises dos gráficos e métricas dos ativos,
 * considere essas fontes [vídeos de rentabilidade]. Tenha um largo banco de
 * dados de critérios, para no site ser dinâmico as decisões e análises
 * (confio na Suno, principalmente)."): o motor passou a ler o banco de
 * critérios de assets/js/criterios/base-rentabilidade.js - benchmark CERTO
 * por classe, faixas por classe, prazo mínimo pra concluir (abaixo dele o
 * tom fica neutro, "cedo pra concluir"), métricas de risco (volatilidade,
 * maior queda, Sharpe/Sortino, beta/alfa, consistência), rentabilidade real,
 * TIR e "mesmos aportes no índice" (PME), câmbio, impostos, data-ex e
 * marcação a mercado pela duration do título. Sem `classe`, funciona como
 * antes (compara com todos os índices do gráfico).
 *
 * Dois pedaços, sem depender de página nenhuma:
 *  1) analisarSerie(...) - PURO (sem DOM): lê a série e os índices e devolve
 *     uma lista priorizada de pontos (no máximo 4), cada um com tom
 *     'bom' | 'neutro' | 'atencao', + uma linha de resumo, as métricas
 *     (destaques) e os critérios usados;
 *  2) renderAnalise(doc, container, analise) - desenha o card colapsável
 *     ("Ver análise"), mesmo visual do painel "momento de aporte" das
 *     tabelas (Aportes/Radar: selo + sinais com ícone) - CSS em
 *     assets/css/componentes-grafico.css (.ag-*), injetado sozinho se a
 *     página ainda não carregou. Dentro: os pontos, uma linha de números
 *     (volatilidade, maior queda, Sharpe...) e "Critérios usados" com links.
 *
 * API
 *   import { analisarSerie, renderAnalise } from '../analise-grafico.js';
 *
 *   const analise = analisarSerie({
 *     serie: [{ data: '2026-09-30', valor: 1000, retorno: 0, fluxo: 0, pregao: true }, ...],
 *       // valor   = valor bruto (R$) - opcional, habilita aporte/resgate, TIR e PME
 *       // retorno = % ACUMULADO desde a base do período (normalmente 0 no 1º ponto), em pontos (2.1 = +2,1%) - se
 *       //           não vier, é calculado de valor+fluxo (retorno ponderado no tempo)
 *       // fluxo   = dinheiro que entrou (+) ou saiu (−) no dia (aporte/resgate/provento recebido)
 *       // pregao  = opcional; se existir, a volatilidade usa só os dias de pregão
 *     indices: { CDI: [{ data, retorno } | { data, valor }], Ibovespa: [...] },
 *       // os índices DESENHADOS no gráfico - retorno em % acumulado OU valor (nível) - casados pela data
 *     periodo: 'mes' | '30d' | '6m' | '12m' | '3a' | 'tudo' | { inicio, fim },
 *     nome: 'A carteira',                // sujeito das frases
 *     formatarMoeda: formatBRL,          // US$ em Ações EUA
 *     componentes: { 'Ações': [{ data, valor, fluxo }], ... }, // opcional (de onde veio o resultado)
 *     contexto: { serie, indices },      // opcional: série mais longa terminando no mesmo dia,
 *                                        // só pra medir a oscilação típica (quedas/altas bruscas)
 *     indiceReferencia: 'CDI',           // opcional: índice da regra de tendência (sem `classe`)
 *     // --- opcionais novos (03/10/2026) ---
 *     classe: 'carteira' | 'patrimonio' | 'acoes' | 'fiis' | 'eua' | 'rf' | 'reserva' | 'ativo-acao' |
 *             'ativo-fii' | 'ativo-eua' | 'ativo-rf' | 'proventos' | 'salario' | 'meta',
 *     subtipo: 'pos' | 'ipca' | 'pre',  // renda fixa (se não vier, sai do `rf.indexador`)
 *     referencias: { IPCA: [...], CDI: [...], 'S&P 500 com dividendos (IVVB11)': [...] },
 *                                        // índices NÃO desenhados, só pra conta (benchmark certo, real, Sharpe)
 *     cambio: [{ data, valor }],         // USD/BRL do dia (Ações EUA: S&P 500 em R$ e efeito câmbio)
 *     moeda: 'BRL' | 'USD',              // moeda da série
 *     benchmark: 'IFIX',                 // força o benchmark (nome de um índice)
 *     benchmarkComponentes: { 'Ações': 'Ibovespa', 'Ações EUA': ['S&P 500 com dividendos (IVVB11)', 'S&P 500 em R$'], ... },
 *                                        // carteira: benchmark composto pelos pesos de cada dia (1º índice que existir)
 *     proventosAReceber: [{ ticker, dataCom, dataPagamento, valor }], // data-com passou, ainda não pago
 *     rf: { indexador, vencimento, taxa, isento, nome }, // título de renda fixa (duration, IPCA + taxa)
 *   });
 *   // -> { tom, resumo, pontos: [{ tipo, tom, texto, resumo, peso, criterios }], metricas,
 *   //      destaques: [{ rotulo, valor, criterio }], criterios: [ids], benchmark, classe }
 *   renderAnalise(doc, containerEmbaixoDoGrafico, analise);
 *
 * Regras (cada uma vira no máximo 1 ponto; testes em tests/analise-grafico.test.js):
 *  - comparacao:  com `classe`, o benchmark certo da classe (IBOV/IFIX/S&P 500 em R$/CDI/IPCA + taxa/
 *                 carteira de referência) com faixas e prazo mínimo; sem `classe`, vs cada índice;
 *  - movimento:   queda/alta brusca nos últimos 3 pregões vs a oscilação típica (z-score), com a
 *                 causa provável: índice da classe, câmbio, data-ex, duration do título (marcação a
 *                 mercado) ou a própria carteira, e qual componente puxou;
 *  - fluxos / fluxoRecente: quanto foi aporte/resgate e não rendimento;
 *  - queda:       maior queda do período (pico → vale), o índice no mesmo intervalo, quanto falta;
 *  - tendencia:   últimos 3 meses vs o período inteiro, contra o índice de referência;
 *  - concentracao: resultado concentrado num componente (classe/ativo);
 *  - real, risco (vol/queda vs índice, reserva, pós-fixado), sharpe, alfa/beta, consistencia,
 *    tir (TIR + PME), cambio, descolamento, proventosAReceber (data-ex), impostos.
 */
import { formatBRL, formatNumeroBR, formatDateBR, formatNumeroPt, formatPctSinal, formatPctAbs } from './format.js';
import { ehPeriodoPersonalizado, garantirEstilosComponentesGrafico } from './periodo-personalizado.js';
import { BENCHMARK_POR_CLASSE, criterio, familiaDaClasse, classificar, mesesParaJulgar } from './criterios/base-rentabilidade.js';
import { esc } from './util/html.js'; // 05/10/2026 (A-68): escape único
import { aliquotaIrPorDias } from './ir-renda-fixa.js'; // 06/10/2026 (A-82): IR/IOF únicos
import { decomporCambio, itemCambio, MINIMO_CAMBIO_POR_JANELA } from './analise-cambio.js'; // 07/10/2026: quedas/altas por causa do dólar


const num = (v) => typeof v === 'number' && Number.isFinite(v);
const MAX_PONTOS = 4;
const N_RECENTE = 3; // pregões da janela "últimos dias"
const MIN_RETORNOS_BASE = 12;
const INDICES_TAXA = /^(cdi|selic|ipca|poupan|prefixad)/i; // índices "de taxa" (sem oscilação de mercado)
const DIA_MS = 86400000;
/** Dividendos do S&P 500 ao ano (~1,2–1,5% nos últimos anos) - só pra avisar o viés do índice de PREÇO (.INX). */
const DY_SP500 = 0.013;
/** Oscilação anual típica por família (quando a série é curta demais pra medir) - ver volatilidade_anualizada na base. */
const VOL_REF = { acoes: 0.25, fiis: 0.09, eua: 0.18, carteira: 0.10, patrimonio: 0.10, rf: 0.02, 'rf-pos': 0.004, 'rf-ipca': 0.07, reserva: 0.004 };
const RENDA_VARIAVEL = new Set(['acoes', 'fiis', 'eua', 'carteira', 'patrimonio']);
const ROTULO_FAMILIA = {
  carteira: 'uma carteira com várias classes', patrimonio: 'o patrimônio', acoes: 'ações brasileiras', fiis: 'FIIs',
  eua: 'ações dos EUA', rf: 'renda fixa', 'rf-pos': 'renda fixa pós-fixada', 'rf-ipca': 'título atrelado à inflação ou prefixado',
  reserva: 'reserva de emergência',
};

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

function pp(pontos) {
  return `${formatNumeroBR(Math.abs(pontos), Math.abs(pontos) >= 10 ? 1 : 2)} p.p.`;
}
function nr(v, casas = 2) { return `${v < 0 ? '−' : ''}${formatNumeroBR(Math.abs(v), casas)}`; }
function moedaSinal(v, fmt) { return `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`; }
function diaMes(iso) { return typeof iso === 'string' && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—'; }
function diaMesAno(iso, anoDiferente) { return anoDiferente ? formatDateBR(iso) : diaMes(iso); }
function minusculaInicial(t) { return /^(O|A|Os|As) /.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }

/** "no mês", "em 30 dias", "de 02/10 a 24/10"... */
export function descreverPeriodo(periodo) {
  if (ehPeriodoPersonalizado(periodo)) {
    const a = periodo.inicio <= periodo.fim ? periodo.inicio : periodo.fim;
    const b = periodo.inicio <= periodo.fim ? periodo.fim : periodo.inicio;
    const outroAno = a.slice(0, 4) !== b.slice(0, 4);
    return a === b ? `em ${diaMesAno(a, true)}` : `de ${diaMesAno(a, outroAno)} a ${diaMesAno(b, outroAno)}`;
  }
  return ({ mes: 'no mês', '30d': 'em 30 dias', '6m': 'em 6 meses', '12m': 'em 12 meses', '3a': 'em 3 anos', tudo: 'desde o início' })[periodo] || 'no período';
}

/** "12 dias", "5 meses", "2,5 anos" (tamanho do período, pras frases de prazo). */
export function descreverPrazo(dias) {
  if (!num(dias) || dias < 45) return `${Math.max(0, Math.round(dias || 0))} dias`;
  const meses = dias / 30.4375;
  if (meses < 23.5) return `${Math.round(meses)} meses`;
  const anos = dias / 365.25;
  return `${formatNumeroBR(anos, Math.abs(anos - Math.round(anos)) < 0.05 ? 0 : 1)} anos`;
}

function diasEntre(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA_MS); }
function isoMenosDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d - n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
/** '15/05/2045' | '2045-05-15' | Date -> '2045-05-15' (null se não der). */
function paraIso(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-15`;
  return null;
}

// ---------------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------------

/** Curva de crescimento [{ data, f, valor, fluxo, pregao }] (f = 1 no início). */
export function curvaDaSerie(serie) {
  const pts = (serie || []).filter((p) => p && typeof p.data === 'string');
  const temRetorno = pts.some((p) => num(p.retorno));
  const out = [];
  if (temRetorno) {
    pts.forEach((p) => { if (num(p.retorno)) out.push({ data: p.data, f: 1 + p.retorno / 100, valor: num(p.valor) ? p.valor : null, fluxo: num(p.fluxo) ? p.fluxo : 0, ajuste: num(p.ajuste) ? p.ajuste : 0, pregao: p.pregao }); });
    // sem renormalizar: `retorno` já é "% desde a base do período" (que pode
    // não ser 0 no 1º ponto - ex.: rendimento do dia da 1ª compra)
    return out;
  }
  // retorno ponderado no tempo a partir de valor+fluxo (mesma trava de dia
  // implausível de inicio.js!normalizarSerieRentabilidade)
  let f = null;
  let anterior = null;
  pts.forEach((p) => {
    if (!num(p.valor)) return;
    const fluxo = num(p.fluxo) ? p.fluxo : 0;
    if (f == null) {
      if (p.valor === 0) return;
      f = 1;
    } else if (anterior) {
      let r = (p.valor - fluxo) / anterior - 1;
      if (r < -0.5 || r > 1) r = 0;
      f *= 1 + r;
    }
    anterior = p.valor;
    out.push({ data: p.data, f, valor: p.valor, fluxo, ajuste: num(p.ajuste) ? p.ajuste : 0, pregao: p.pregao });
  });
  return out;
}

/** Mapa data -> nível normalizado de um índice. */
function mapaIndice(lista, datasSerie) {
  const m = new Map();
  if (lista instanceof Map) { lista.forEach((v, k) => { if (num(v) && v !== 0) m.set(k, v); }); return m; }
  if (!Array.isArray(lista)) return m;
  lista.forEach((p, i) => {
    if (num(p)) { if (datasSerie && datasSerie[i]) m.set(datasSerie[i], p); return; }
    if (!p || typeof p.data !== 'string') return;
    if (num(p.retorno)) m.set(p.data, 1 + p.retorno / 100);
    else if (num(p.valor) && p.valor !== 0) m.set(p.data, p.valor);
  });
  return m;
}

/** Índice pronto pra conta: { nome, mapa, datas (ordenadas), tipo, desenhado }. */
function criarIndice(nome, lista, datasSerie, extra = {}) {
  const mapa = mapaIndice(lista, datasSerie);
  const datas = [...mapa.keys()].sort();
  const tipo = extra.tipo || (INDICES_TAXA.test(nome) || /^ipca \+/i.test(nome) ? 'taxa' : 'mercado');
  return { nome, mapa, datas, desenhado: false, ...extra, tipo };
}

/** Último nível conhecido do índice até a data (inclusive) - busca binária. */
function nivelEm(idx, data) {
  if (!idx || !idx.datas.length) return null;
  const ds = idx.datas;
  let lo = 0;
  let hi = ds.length - 1;
  let k = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (ds[m] <= data) { k = m; lo = m + 1; } else hi = m - 1;
  }
  return k >= 0 ? idx.mapa.get(ds[k]) : null;
}
/** Nível na data, ou o 1º disponível depois dela (índice que começa depois / dia sem pregão). */
function nivelEmOuDepois(idx, data, limite) {
  const v = idx.mapa.get(data);
  if (num(v)) return v;
  const d = idx.datas.find((x) => x >= data && (!limite || x <= limite));
  return d ? idx.mapa.get(d) : nivelEm(idx, data);
}

function retornoEntre(idx, de, ate) {
  if (!idx || !idx.datas.length) return null;
  const a = nivelEmOuDepois(idx, de, ate);
  const b = nivelEm(idx, ate);
  if (!num(a) || !num(b) || a === 0) return null;
  return b / a - 1;
}

function retornosDiarios(curva) {
  const usarPregao = curva.some((p) => typeof p.pregao === 'boolean');
  const pts = usarPregao ? curva.filter((p, i) => p.pregao !== false || i === curva.length - 1) : curva;
  const r = [];
  for (let i = 1; i < pts.length; i += 1) {
    if (pts[i - 1].f > 0) r.push({ data: pts[i].data, de: pts[i - 1].data, r: pts[i].f / pts[i - 1].f - 1 });
  }
  return r;
}

const media = (l) => l.reduce((s, x) => s + x, 0) / l.length;
/** Série diária (intervalo mediano entre pontos ≤ 4 dias)? Mensal/semanal não usa √252 nem "pregões". */
function ehSerieDiaria(curva) {
  if (!Array.isArray(curva) || curva.length < 3) return true;
  const gaps = [];
  for (let i = 1; i < curva.length; i += 1) gaps.push(diasEntre(curva[i - 1].data, curva[i].data));
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] <= 4;
}
function desvio(lista) {
  if (lista.length < 2) return 0;
  const m = media(lista);
  return Math.sqrt(lista.reduce((s, x) => s + (x - m) ** 2, 0) / (lista.length - 1));
}

function ganhoComponente(lista, de, ate) {
  if (!Array.isArray(lista)) return null;
  let base = null;
  let fim = null;
  let fluxo = 0;
  lista.forEach((p) => {
    if (!p || typeof p.data !== 'string' || !num(p.valor)) return;
    if (p.data <= de) base = p.valor;
    if (p.data > de && p.data <= ate) { fim = p.valor; fluxo += num(p.fluxo) ? p.fluxo : 0; }
  });
  if (base == null) base = 0;
  if (fim == null) return null;
  return fim - base - fluxo;
}

function juntarLista(itens) {
  if (itens.length <= 1) return itens.join('');
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Métricas (puras, exportadas pros testes)
// ---------------------------------------------------------------------------

/** Volatilidade anualizada de retornos diários (fração): desvio × √252. */
export function volatilidadeAnual(retornosDiariosFracao) {
  const l = (retornosDiariosFracao || []).filter(num);
  return l.length >= 2 ? desvio(l) * Math.sqrt(252) : null;
}

/**
 * Maior queda pico → vale de uma curva [{ data, f }]:
 * { dd, pico, vale, recuperou (índice ou -1), distancia (abaixo do pico no fim), altaParaVoltar }.
 */
export function calcularDrawdown(curva) {
  if (!Array.isArray(curva) || curva.length < 2) return null;
  let pico = 0;
  let melhor = { dd: 0, pico: 0, vale: 0 };
  for (let i = 1; i < curva.length; i += 1) {
    if (curva[i].f > curva[pico].f) pico = i;
    const dd = 1 - curva[i].f / curva[pico].f;
    if (dd > melhor.dd) melhor = { dd, pico, vale: i };
  }
  let recuperou = -1;
  for (let i = melhor.vale + 1; i < curva.length; i += 1) if (curva[i].f >= curva[melhor.pico].f) { recuperou = i; break; }
  const distancia = melhor.dd > 0 ? 1 - curva[curva.length - 1].f / curva[melhor.pico].f : 0;
  return { ...melhor, recuperou, distancia: Math.max(0, distancia), altaParaVoltar: distancia > 0 ? 1 / (1 - distancia) - 1 : 0 };
}

/**
 * TIR (XIRR) ao ano: `fluxos` [{ data, valor }] com dinheiro que ENTROU (+) ou SAIU (−) da
 * carteira (o 1º é o valor no começo do período), `valorFinal` na `dataFinal`.
 * Resolve Σ F_j·(1+t)^((fim−d_j)/365) = V_fim por bisseção em [−99%, +1000%]; null se não houver raiz.
 */
export function calcularTir(fluxos, valorFinal, dataFinal) {
  const fl = (fluxos || []).filter((f) => f && num(f.valor) && f.valor !== 0 && typeof f.data === 'string');
  if (!fl.length || !num(valorFinal) || !dataFinal) return null;
  const anos = fl.map((f) => Math.max(0, diasEntre(f.data, dataFinal)) / 365);
  if (Math.max(...anos) <= 0) return null;
  const g = (t) => fl.reduce((s, f, i) => s + f.valor * (1 + t) ** anos[i], 0) - valorFinal;
  let a = -0.99;
  let b = 10;
  let ga = g(a);
  const gb = g(b);
  if (!num(ga) || !num(gb) || Math.sign(ga) === Math.sign(gb)) return null;
  for (let k = 0; k < 200; k += 1) {
    const m = (a + b) / 2;
    const gm = g(m);
    if (Math.abs(gm) < 1e-9 || b - a < 1e-10) return m;
    if (Math.sign(gm) === Math.sign(ga)) { a = m; ga = gm; } else b = m;
  }
  return (a + b) / 2;
}

/**
 * PME (Public Market Equivalent): quanto valeria hoje se cada fluxo tivesse ido pro índice.
 * `nivel(data)` devolve o nível do índice. -> { vIdx, razao (V_fim / vIdx), dif (R$) } ou null.
 */
export function calcularPme(fluxos, valorFinal, dataFinal, nivel) {
  const fim = nivel(dataFinal);
  if (!num(fim) || !num(valorFinal)) return null;
  let vIdx = 0;
  for (const f of fluxos || []) {
    if (!f || !num(f.valor) || f.valor === 0) continue;
    const n = nivel(f.data);
    if (!num(n) || n === 0) return null;
    vIdx += f.valor * (fim / n);
  }
  if (!(vIdx > 0)) return null;
  return { vIdx, razao: valorFinal / vIdx, dif: valorFinal - vIdx };
}

/** Regressão linear simples y = a + b·x: { a, b, epA, tA, n }. */
export function regressaoLinear(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const mx = media(x.slice(0, n));
  const my = media(y.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) { sxx += (x[i] - mx) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  if (sxx <= 0) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i += 1) sse += (y[i] - a - b * x[i]) ** 2;
  const s2 = sse / (n - 2);
  const epA = Math.sqrt(s2 * (1 / n + mx ** 2 / sxx));
  return { a, b, epA, tA: epA > 0 ? a / epA : (a === 0 ? 0 : Infinity * Math.sign(a)), n };
}

/**
 * Sharpe e Sortino com o CDI como livre de risco, de retornos MENSAIS (fração):
 * Sharpe = (R_aa − CDI_aa) / (σ_m·√12); Sortino = (R_aa − CDI_aa) / (√(Σ min(0, r−cdi)² / N)·√12) (N = todos os meses, CFA).
 */
export function calcularSharpeSortino(rp, rcdi) {
  const n = Math.min((rp || []).length, (rcdi || []).length);
  if (n < 6) return null;
  const aa = (l) => l.slice(0, n).reduce((f, r) => f * (1 + r), 1) ** (12 / n) - 1;
  const rAa = aa(rp);
  const cAa = aa(rcdi);
  const vol = desvio(rp.slice(0, n)) * Math.sqrt(12);
  let soma = 0;
  for (let i = 0; i < n; i += 1) soma += Math.min(0, rp[i] - rcdi[i]) ** 2;
  const dd = Math.sqrt(soma / n) * Math.sqrt(12);
  return { sharpe: vol > 0 ? (rAa - cAa) / vol : null, sortino: dd > 0 ? (rAa - cAa) / dd : null, rAa, cAa, vol };
}

/** Pontos de fim de mês da curva (o 1º ponto como base), pulando intervalos menores que 15 dias. */
function amostrasMensais(curva) {
  const out = [curva[0]];
  for (let i = 1; i < curva.length; i += 1) {
    const p = curva[i];
    const prox = curva[i + 1];
    if (prox && prox.data.slice(0, 7) === p.data.slice(0, 7)) continue;
    if (diasEntre(out[out.length - 1].data, p.data) >= 15) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Benchmark e contexto
// ---------------------------------------------------------------------------

/** Família das faixas (base): 'acoes' | 'fiis' | 'eua' | 'rf-pos' | 'rf-ipca' | 'rf' | 'reserva' | 'carteira' | 'patrimonio' | null. */
function familiaAnalise(classe, subtipo, rf) {
  const c = String(classe || '').toLowerCase();
  if (!c || c === 'proventos' || c === 'salario' || c === 'meta') return null;
  let sub = subtipo;
  if (!sub && rf && (c === 'rf' || c === 'ativo-rf')) sub = subtipoRf(rf);
  const f = familiaDaClasse(c, sub);
  return ROTULO_FAMILIA[f] ? f : null;
}
function subtipoRf(rf) {
  const t = `${rf.indexador || ''} ${rf.taxaTexto || ''} ${rf.nome || ''}`.toLowerCase();
  if (/ipca|infla|ntn-?b|renda\+|educa\+/.test(t)) return 'ipca';
  if (/prefix|pré|\bpre\b|ltn|ntn-?f/.test(t)) return 'pre';
  if (/selic|cdi|\bdi\b|pós|pos-?fix|lft/.test(t)) return 'pos';
  return null;
}
/** rf do chamador -> { indexador, subtipo, vencimento (ISO), taxa (fração), isento, nome }. */
function normalizarRf(rf) {
  if (!rf || typeof rf !== 'object') return null;
  let taxa = num(rf.taxa) ? (rf.taxa > 1 ? rf.taxa / 100 : rf.taxa) : null;
  const texto = typeof rf.taxa === 'string' ? rf.taxa : (rf.taxaTexto || '');
  if (taxa == null && texto) {
    const m = String(texto).replace(/\./g, '').match(/(\d+(?:,\d+)?)\s*%/g);
    if (m && m.length) {
      const ultimo = m[m.length - 1];
      const v = Number(ultimo.replace('%', '').replace(',', '.').trim());
      // "110% do CDI" não é taxa de título - só IPCA + x% / prefixado x%
      if (num(v) && !/do\s+cdi|da\s+selic/i.test(texto)) taxa = v / 100;
    }
  }
  const out = { indexador: rf.indexador || '', taxaTexto: texto, vencimento: paraIso(rf.vencimento), taxa, nome: rf.nome || '' };
  out.subtipo = subtipoRf(out);
  out.isento = rf.isento === true || /\b(lci|lca|cri|cra|incentivad)/i.test(`${rf.nome || ''} ${rf.indexador || ''}`);
  return out;
}

/** Monta a lista de índices (desenhados + referências + derivados: S&P em R$, IPCA + taxa, composto). */
function montarIndices({ indices, referencias, datas, cambio, moeda, familia, rf, curva, componentes, benchmarkComponentes }) {
  const lista = [];
  const temNome = (n) => lista.some((i) => i.nome.toLowerCase() === n.toLowerCase());
  Object.entries(indices || {}).forEach(([nome, l]) => lista.push(criarIndice(nome, l, datas, { desenhado: true })));
  Object.entries(referencias || {}).forEach(([nome, l]) => { if (!temNome(nome)) lista.push(criarIndice(nome, l, null)); });
  const cambioIdx = cambio ? criarIndice('Câmbio', cambio, null, { tipo: 'cambio' }) : null;

  const derivar = (nome, base, fn, extra = {}) => {
    const m = new Map();
    base.datas.forEach((d) => { const v = fn(d, base.mapa.get(d)); if (num(v) && v > 0) m.set(d, v); });
    if (m.size >= 2) lista.push(criarIndice(nome, m, null, extra));
  };
  if (cambioIdx && cambioIdx.datas.length && (familia === 'eua' || familia === 'carteira' || familia === 'patrimonio')) {
    const sp = lista.find((i) => /^s&p 500$/i.test(i.nome) || (/^s&p/i.test(i.nome) && !/r\$|us\$|dividend|ivvb/i.test(i.nome)));
    const ivv = lista.find((i) => /ivvb11|com dividendos/i.test(i.nome) && !/us\$/i.test(i.nome));
    if (moeda !== 'USD' && sp && !lista.some((i) => /s&p 500 em r\$/i.test(i.nome))) {
      derivar('S&P 500 em R$', sp, (d, v) => { const c = nivelEm(cambioIdx, d); return num(c) ? v * c : null; }, { precoSo: true });
    }
    if (moeda === 'USD' && ivv && familia === 'eua') derivar('S&P 500 com dividendos (US$)', ivv, (d, v) => { const c = nivelEm(cambioIdx, d); return num(c) ? v / c : null; });
  }
  lista.forEach((i) => { if (/^s&p 500( em r\$)?$/i.test(i.nome) && i.precoSo == null) i.precoSo = true; });

  // título IPCA+/prefixado: a régua justa é a taxa contratada (carrego)
  if (rf && num(rf.taxa) && rf.taxa > 0 && rf.taxa < 0.5 && curva.length) {
    const d0 = curva[0].data;
    const fator = (d) => (1 + rf.taxa) ** (Math.max(0, diasEntre(d0, d)) / 365.25);
    const rot = formatNumeroBR(rf.taxa * 100, 2).replace(/,?0+$/, '').replace(/,$/, '');
    const ipca = lista.find((i) => /^ipca$/i.test(i.nome));
    if (rf.subtipo === 'ipca' && ipca) derivar(`IPCA + ${rot}%`, ipca, (d, v) => v * fator(d), { tipo: 'taxa', contratada: true });
    else if (rf.subtipo === 'pre') {
      const m = new Map(curva.map((p) => [p.data, fator(p.data)]));
      lista.push(criarIndice(`Prefixado ${rot}%`, m, null, { tipo: 'taxa', contratada: true }));
    }
  }

  // carteira: benchmark composto pelos pesos REAIS de cada dia (fallback da base: "peso médio real")
  if (componentes && benchmarkComponentes && curva.length >= 2) {
    const partes = Object.entries(benchmarkComponentes)
      .map(([comp, nomes]) => ({ comp, idx: [].concat(nomes).map((n) => lista.find((i) => i.nome.toLowerCase() === String(n).toLowerCase() && i.datas.length >= 2)).find(Boolean), valores: new Map((componentes[comp] || []).filter((p) => p && num(p.valor)).map((p) => [p.data, p.valor])) }))
      .filter((p) => p.idx && p.valores.size);
    if (partes.length >= 2) {
      const ultimoValor = (mapa, d) => { let v = null; mapa.forEach((x, k) => { if (k <= d) v = x; }); return v; };
      const valorEm = partes.map((p) => {
        const ordem = [...p.valores.keys()].sort();
        return (d) => { let k = -1; let lo = 0; let hi = ordem.length - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (ordem[m] <= d) { k = m; lo = m + 1; } else hi = m - 1; } return k >= 0 ? p.valores.get(ordem[k]) : ultimoValor(p.valores, d); };
      });
      const m = new Map([[curva[0].data, 1]]);
      let nivel = 1;
      for (let i = 1; i < curva.length; i += 1) {
        const d0 = curva[i - 1].data;
        const d1 = curva[i].data;
        let soma = 0;
        const pesos = partes.map((p, k) => { const v = valorEm[k](d0); const w = num(v) && v > 0 ? v : 0; soma += w; return w; });
        if (soma > 0) {
          let r = 0;
          partes.forEach((p, k) => { if (pesos[k] > 0) { const ri = retornoEntre(p.idx, d0, d1); if (num(ri)) r += (pesos[k] / soma) * ri; } });
          nivel *= 1 + r;
        }
        m.set(d1, nivel);
      }
      lista.push(criarIndice('Carteira de referência', m, null, { tipo: 'composto', componentes: partes.map((p) => p.idx.nome) }));
    }
  }
  return { lista, cambioIdx };
}

/** Benchmark certo da família (base BENCHMARK_POR_CLASSE.nomes, em ordem de preferência). */
function escolherBenchmark(lista, familia, moeda, forcado) {
  if (forcado) {
    const f = lista.find((i) => i.nome.toLowerCase() === String(forcado).toLowerCase() && num(i.ret));
    if (f) return f;
  }
  if (!familia) return null;
  const chave = familia === 'eua' && moeda === 'USD' ? 'eua-usd' : familia;
  const def = BENCHMARK_POR_CLASSE[chave] || BENCHMARK_POR_CLASSE[familia.replace(/-.*$/, '')];
  if (familia === 'carteira') {
    const comp = lista.find((i) => i.tipo === 'composto' && num(i.ret));
    if (comp) return comp;
  }
  for (const r of (def && def.nomes) || []) {
    const re = new RegExp(r, 'i');
    const achou = lista.find((i) => re.test(i.nome) && num(i.ret));
    if (achou) return achou;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Regras sem classe (como antes)
// ---------------------------------------------------------------------------

function regraComparacao(ctx) {
  const { R, nome, descPeriodo, retIndices } = ctx;
  const acima = [];
  const abaixo = [];
  const empate = [];
  retIndices.forEach(({ nome: idx, ret }) => {
    const diff = (R - ret) * 100;
    if (Math.abs(diff) < 0.05) { empate.push({ idx }); return; }
    let extra = '';
    if (/^cdi$/i.test(idx) && ret > 0.001 && R > 0) extra = ` (${formatNumeroBR((R / ret) * 100, 0)}% do CDI)`;
    (diff > 0 ? acima : abaixo).push({ idx, txt: `${pp(diff)} ${diff > 0 ? 'acima' : 'abaixo'} do ${idx}${extra}` });
  });
  const partes = [...acima.map((x) => x.txt), ...abaixo.map((x) => x.txt)];
  if (empate.length) partes.push(`praticamente empatado com ${juntarLista(empate.map((x) => `o ${x.idx}`))}`);
  const curtas = [];
  if (acima.length) curtas.push(`acima ${juntarLista(acima.map((x) => `do ${x.idx}`))}`);
  if (abaixo.length) curtas.push(`abaixo ${juntarLista(abaixo.map((x) => `do ${x.idx}`))}`);
  if (empate.length) curtas.push(`empatado com ${juntarLista(empate.map((x) => `o ${x.idx}`))}`);
  const verbo = R >= 0 || formatPctSinal(R, 2) === formatPctSinal(0, 2) ? 'rendeu' : 'recuou';
  const texto = partes.length
    ? `${nome} ${verbo} ${formatPctSinal(R, 2)} ${descPeriodo} — ${juntarLista(partes)}.`
    : `${nome} ${verbo} ${formatPctSinal(R, 2)} ${descPeriodo}.`;
  let tom = 'neutro';
  if (retIndices.length) {
    if (acima.length && !abaixo.length) tom = 'bom';
    else if (abaixo.length && !acima.length) tom = 'atencao';
  } else if (R < -0.01) tom = 'atencao';
  const resumo = `${formatPctSinal(R, 2)} ${descPeriodo}${curtas.length ? `, ${juntarLista(curtas)}` : ''}`;
  return { tipo: 'comparacao', tom, texto, resumo, peso: 60, criterios: ['retorno_twr_cota'] };
}

// ---------------------------------------------------------------------------
// Comparação com o benchmark certo da classe
// ---------------------------------------------------------------------------

const tomDoNivel = (n) => (n === 'bom' ? 'bom' : (n === 'atencao' || n === 'ruim') ? 'atencao' : 'neutro');

/** "o CDI" / "a Selic" / "a carteira de referência". */
function oIdx(nome) { return `${/^(selic|carteira|poupan)/i.test(nome) ? 'a' : 'o'} ${nome}`; }
/** "do CDI" / "da Selic". */
function doIdx(nome) { return `${/^(selic|carteira|poupan)/i.test(nome) ? 'da' : 'do'} ${nome}`; }

function rotuloOutroIndice(ctx, idx) {
  if (ctx.moeda !== 'USD' && ctx.cambioIdx && /^s&p 500$/i.test(idx.nome)) return 'o S&P 500 do gráfico (em dólar, sem o câmbio)';
  return oIdx(idx.nome);
}

function clausulaOutroIndice(ctx, idx) {
  const diff = (ctx.R - idx.ret) * 100;
  const ehCdi = /^cdi$/i.test(idx.nome);
  // "% do CDI" só quando diz algo (renda variável com 12+ meses; abaixo de
  // 10% do CDI - ex.: +0,03% contra +14% - vira "0% do CDI", melhor em p.p.)
  if (ehCdi && !(RENDA_VARIAVEL.has(ctx.familia) && ctx.meses < 12) && ctx.R > 0 && idx.ret > 0.001 && ctx.R / idx.ret >= 0.1) return `${formatNumeroBR((ctx.R / idx.ret) * 100, 0)}% do CDI`;
  if (Math.abs(diff) < 0.05) return 'empatado';
  return `${pp(diff)} ${diff > 0 ? 'acima' : 'abaixo'}`;
}

function regraComparacaoClasse(ctx) {
  const { R, nome, descPeriodo, bench, familia, meses, julgar, m } = ctx;
  if (!bench) return null;
  const Rb = bench.ret;
  const anos = ctx.spanDias / 365.25;
  const exc = (R - Rb) * 100;
  const excAa = anos >= 1 ? (((1 + R) ** (1 / anos)) - ((1 + Rb) ** (1 / anos))) * 100 : null;
  const cedo = meses < julgar;
  const verbo = R >= 0 || formatPctSinal(R, 2) === formatPctSinal(0, 2) ? 'rendeu' : 'recuou';
  const criterios = [];
  let rel;
  let resumoRel;
  let nivel = null;
  const ehTaxaCdi = /^(cdi|selic)$/i.test(bench.nome);

  if (familia === 'patrimonio' && /^ipca$/i.test(bench.nome)) {
    // patrimônio: a régua é o poder de compra
    const real = (1 + R) / (1 + Rb) - 1;
    const realAa = anos >= 1 ? (1 + real) ** (1 / anos) - 1 : null;
    rel = `${real >= 0 ? 'ganho' : 'perda'} real de ${formatPctAbs(real, 2)} (IPCA de ${formatPctSinal(Rb, 2)})${realAa != null ? `, ${formatPctSinal(realAa, 2)} ao ano acima da inflação` : ''}`;
    resumoRel = `${real >= 0 ? 'ganho' : 'perda'} real de ${formatPctAbs(real, 1)}`;
    if (!cedo) nivel = classificar('retorno_real_ipca', (realAa != null ? realAa : real) * 100, 'padrao');
    criterios.push('retorno_real_ipca');
    m.real = real;
  } else if (ehTaxaCdi) {
    const pcBruto = R > 0 && Rb > 0.001 ? (R / Rb) * 100 : null;
    const pc = pcBruto != null && pcBruto >= 10 ? pcBruto : null;
    rel = pc != null ? `${formatNumeroBR(pc, 0)}% ${doIdx(bench.nome)} (${pp(exc)} ${exc >= 0 ? 'acima' : 'abaixo'})` : `${pp(exc)} ${exc >= 0 ? 'acima' : 'abaixo'} ${doIdx(bench.nome)}`;
    resumoRel = pc != null ? `${formatNumeroBR(pc, 0)}% ${doIdx(bench.nome)}` : `${exc >= 0 ? 'acima' : 'abaixo'} ${doIdx(bench.nome)}`;
    if (!cedo) {
      const famLim = familia === 'rf' && ctx.rf && ctx.rf.isento ? 'rf' : familia;
      nivel = pcBruto != null ? classificar('pct_cdi', ctx.rf && ctx.rf.isento ? pcBruto / (1 - aliquotaIr(ctx.spanDias)) : pcBruto, famLim) : 'ruim';
    }
    criterios.push('pct_cdi');
  } else if (bench.contratada) {
    const pc = R > 0 && Rb > 0.001 ? (R / Rb) * 100 : null;
    rel = `${pp(exc)} ${exc >= 0 ? 'acima' : 'abaixo'} do ${bench.nome} (a taxa contratada)`;
    resumoRel = `${exc >= 0 ? 'acima' : 'abaixo'} da taxa contratada`;
    if (!cedo) nivel = pc != null ? classificar('pct_cdi', pc, 'rf-ipca') : 'atencao';
    criterios.push('marcacao_mercado', 'curva_vs_mercado');
  } else {
    // índice de mercado (IBOV/IFIX/S&P) ou carteira de referência
    const igual = Math.abs(exc) < 0.05;
    const nomeB = bench.tipo === 'composto' ? 'a carteira de referência' : `o ${bench.nome}`;
    const doB = bench.tipo === 'composto' ? 'da carteira de referência' : `do ${bench.nome}`;
    rel = igual ? `praticamente igual ${bench.tipo === 'composto' ? 'à carteira de referência' : `ao ${bench.nome}`}` : `${pp(exc)} ${exc > 0 ? 'acima' : 'abaixo'} ${doB}`;
    if (excAa != null && anos >= 2 && !igual) rel += ` (${nr(excAa, 1)} p.p. ao ano)`;
    resumoRel = igual ? `empatado com ${nomeB}` : `${exc > 0 ? 'acima' : 'abaixo'} ${doB}`;
    let valor = excAa != null ? excAa : exc;
    if (bench.precoSo) {
      // índice de PREÇO (sem dividendos) contra carteira que recebe dividendos
      valor -= DY_SP500 * 100;
      criterios.push('total_return_consistencia', 'diag_sp_preco');
    }
    if (!cedo) nivel = classificar('excesso_vs_benchmark', valor, bench.tipo === 'composto' ? 'carteira' : familia);
    criterios.push(bench.tipo === 'composto' ? 'benchmark_composto' : 'excesso_vs_benchmark');
  }

  // honestidade estatística: excesso dentro da margem de sorte (≥ 24 meses)
  let sorte = '';
  if (!cedo && num(m.margem) && num(excAa) && Math.abs(excAa) < m.margem && meses >= 24 && !ehTaxaCdi && familia !== 'patrimonio') {
    if (nivel === 'bom' || nivel === 'atencao' || nivel === 'ruim') nivel = 'neutro';
    sorte = ` A diferença ainda cabe na margem de sorte (±${formatNumeroBR(m.margem, 1)} p.p. ao ano com ${descreverPrazo(ctx.spanDias)} de histórico).`;
    criterios.push('information_ratio', 'diag_alfa_sem_significancia');
  }
  if (bench.precoSo && exc > 0 && exc <= (((1 + DY_SP500) ** Math.max(anos, 1 / 12)) - 1) * 100 && nivel === 'bom') nivel = 'neutro';

  const ref = bench.tipo === 'composto'
    ? `uma carteira passiva com os mesmos pesos (${juntarLista(bench.componentes || [])})`
    : (bench.contratada || ctx.forcado ? '' : `o índice de referência de ${ROTULO_FAMILIA[familia]}`);
  let texto = `${nome} ${verbo} ${formatPctSinal(R, 2)} ${descPeriodo} — ${rel}${ref && bench.tipo !== 'composto' && !ehTaxaCdi && familia !== 'patrimonio' ? `, ${ref}` : ''}.`;
  if (bench.tipo === 'composto') texto = `${nome} ${verbo} ${formatPctSinal(R, 2)} ${descPeriodo} — ${rel}: ${ref}${num(bench.ret) ? `, que rendeu ${formatPctSinal(bench.ret, 2)}` : ''}.`;

  // os outros índices desenhados (a legenda do gráfico)
  const outros = ctx.lista.filter((i) => i !== bench && num(i.ret) && (i.desenhado || (familia === 'carteira' && /^cdi$/i.test(i.nome))) && i.tipo !== 'cambio');
  if (outros.length) texto += ` ${outros.map((i, k) => `${k ? 'contra' : 'Contra'} ${rotuloOutroIndice(ctx, i)}: ${clausulaOutroIndice(ctx, i)}`).join('; ')}.`;
  if (RENDA_VARIAVEL.has(familia) && meses < 12 && outros.some((i) => /^cdi$/i.test(i.nome))) criterios.push('diag_pct_cdi_curto_rv');

  if (bench.precoSo) {
    const bias = ((1 + DY_SP500) ** Math.max(anos, 1 / 12) - 1) * 100;
    texto += exc > 0
      ? ` O ${bench.nome} não inclui dividendos (~${formatNumeroBR(DY_SP500 * 100, 1)}% ao ano): desconte ~${pp(bias)} dessa vantagem.`
      : ` O ${bench.nome} não inclui dividendos (~${formatNumeroBR(DY_SP500 * 100, 1)}% ao ano): com eles, a diferença seria ~${pp(bias)} maior.`;
  }
  if (cedo) {
    const volPropria = num(m.vol) ? m.vol : (num(ctx.volContexto) ? ctx.volContexto : null);
    const vol = num(volPropria) ? volPropria : VOL_REF[familia];
    const volPer = num(vol) ? vol * Math.sqrt(Math.max(ctx.spanDias, 1) / 365.25) : null;
    // a oscilação típica é a da PRÓPRIA série quando dá pra medir (um ativo
    // sozinho oscila bem mais que a classe); senão, a referência da classe
    const normal = num(volPropria) && volPropria > 1.5 * (VOL_REF[familia] || Infinity)
      ? `cabem na oscilação de ${minusculaInicial(nome)} (~${formatPctAbs(volPropria, 0)} ao ano)`
      : `são normais para ${ROTULO_FAMILIA[familia]}`;
    if (RENDA_VARIAVEL.has(familia) && num(volPer) && volPer >= 0.005) {
      texto += ` Com ${descreverPrazo(ctx.spanDias)}, ainda é cedo pra concluir: nesse prazo, oscilações de ±${formatPctAbs(volPer, 1)} ${normal} — compare em ${julgar} meses ou mais.`;
    } else {
      texto += ` Com ${descreverPrazo(ctx.spanDias)}, ainda é cedo pra concluir — para ${ROTULO_FAMILIA[familia]}, compare em ${julgar} meses ou mais.`;
    }
    criterios.push('prazo_curto_ruido');
  } else if (sorte) {
    texto += sorte;
  } else if (nivel === 'neutro' && RENDA_VARIAVEL.has(familia) && bench.tipo !== 'taxa' && familia !== 'patrimonio') {
    texto += ' Andar junto com o índice no longo prazo já é um bom resultado.';
  } else if (nivel === 'atencao') {
    texto += ` Diferença relevante para ${descreverPrazo(ctx.spanDias)} — vale acompanhar.`;
  } else if (nivel === 'ruim') {
    texto += ` Diferença grande para ${descreverPrazo(ctx.spanDias)} — vale olhar o que puxou para baixo.`;
  }
  if (!cedo && familia === 'rf' && ehTaxaCdi && (nivel === 'atencao' || nivel === 'ruim') && ctx.ipca && R > ctx.ipca.ret) {
    texto += ' Se a diferença vem de títulos IPCA+ ou prefixados, a régua deles é a taxa contratada levada até o vencimento — no caminho, oscilam com os juros.';
    criterios.push('marcacao_mercado');
  }
  const tom = cedo ? 'neutro' : tomDoNivel(nivel);
  const resumo = `${formatPctSinal(R, 2)} ${descPeriodo}, ${resumoRel}${cedo ? ' (cedo pra concluir)' : ''}`;
  m.excesso = exc;
  m.excessoAa = excAa;
  m.nivel = nivel;
  return { tipo: 'comparacao', tom, texto, resumo, peso: 60, criterios: ['retorno_twr_cota', ...criterios] };
}

// 06/10/2026 (A-82): a tabela regressiva de IR agora é a do módulo único ir-renda-fixa.js
const aliquotaIr = aliquotaIrPorDias;

// ---------------------------------------------------------------------------
// Movimento brusco (com causa provável)
// ---------------------------------------------------------------------------

function regraMovimento(ctx) {
  const base = ctx.contextoCurva.length >= ctx.curva.length ? ctx.contextoCurva : ctx.curva;
  if (!ehSerieDiaria(base)) return null; // série mensal: "últimos 3 pregões" não existe
  const rets = retornosDiarios(base);
  if (rets.length < MIN_RETORNOS_BASE + N_RECENTE) return null;
  const recentes = rets.slice(-N_RECENTE);
  const anteriores = rets.slice(0, -N_RECENTE).slice(-120).map((x) => x.r);
  const sigma = desvio(anteriores);
  const mov = recentes.reduce((f, x) => f * (1 + x.r), 1) - 1;
  const tipico = sigma * Math.sqrt(N_RECENTE);
  if (Math.abs(mov) < 0.004) return null;
  const z = tipico > 0 ? Math.abs(mov) / tipico : Infinity;
  if (z < 2.5) return null;
  const de = recentes[0].de;
  const ate = recentes[recentes.length - 1].data;
  const caiu = mov < 0;
  const vezes = Number.isFinite(z) ? ` — cerca de ${formatNumeroBR(Math.min(z, 99), 0)}x a oscilação típica (±${formatPctAbs(tipico, 1)} em ${N_RECENTE} pregões)` : ' — fora do padrão da série, que quase não oscila';
  let texto = `Nos últimos ${N_RECENTE} pregões (${diaMes(de)} a ${diaMes(ate)}) ${caiu ? 'caiu' : 'subiu'} ${formatPctAbs(mov, 2)}${vezes}.`;
  const criterios = ['queda_brusca_zscore'];
  let tom = caiu ? 'atencao' : 'bom';
  let causa = '';
  let explicado = false;

  // causa 1: data-ex (provento destacado, ainda não pago)
  if (caiu && Array.isArray(ctx.proventosAReceber) && num(ctx.valorFim) && ctx.valorFim > 0) {
    const janela = isoMenosDias(de, 3);
    const naJanela = ctx.proventosAReceber.filter((p) => p && num(p.valor) && p.dataCom && p.dataCom >= janela && p.dataCom < ate && (!p.dataPagamento || p.dataPagamento > ate));
    const soma = naJanela.reduce((s, p) => s + p.valor, 0);
    if (soma > 0 && soma / ctx.valorFim >= 0.4 * Math.abs(mov)) {
      const pag = naJanela.map((p) => p.dataPagamento).filter(Boolean).sort()[0];
      const quem = [...new Set(naJanela.map((p) => p.ticker).filter(Boolean))];
      causa = ` Coincide com a data-ex${quem.length ? ` de ${juntarLista(quem.slice(0, 3))}${quem.length > 3 ? ' e outros' : ''}` : ''}: a cota desconta ${ctx.formatarMoeda(soma)} em proventos (${formatPctAbs(soma / ctx.valorFim, 2)} da posição), que ${pag ? `caem na conta em ${diaMes(pag)}` : 'entram no pagamento'}. Não é perda.`;
      criterios.push('diag_data_ex');
      explicado = true;
      tom = 'neutro';
    }
  }
  // causa 2: câmbio (Ações EUA em reais)
  if (!explicado && ctx.cambioIdx && ctx.familia === 'eua' && ctx.moeda !== 'USD') {
    const dfx = retornoEntre(ctx.cambioIdx, de, ate);
    if (num(dfx) && Math.sign(dfx) === Math.sign(mov) && Math.abs(dfx) >= 0.5 * Math.abs(mov)) {
      const rUsd = (1 + mov) / (1 + dfx) - 1;
      causa = ` Veio do câmbio: o dólar ${dfx < 0 ? 'caiu' : 'subiu'} ${formatPctAbs(dfx, 2)} no mesmo intervalo; em dólar, a variação foi de ${formatPctSinal(rUsd, 2)}.`;
      criterios.push('efeito_cambio', 'diag_cambio');
      explicado = true;
      tom = 'neutro';
    }
  }
  // causa 3: renda fixa - duration do título (marcação a mercado) ou algo errado
  if (!explicado && ctx.familia && /^(rf|reserva)/.test(ctx.familia) && ctx.rf) {
    const rf = ctx.rf;
    if (rf.subtipo === 'pos' || ctx.familia === 'reserva') {
      if (caiu) {
        causa = ' Para um pós-fixado (duration perto de zero), uma queda assim não vem dos juros — confira o lançamento ou o preço do título nesses dias.';
        criterios.push('diag_rf_queda_sem_juros', 'marcacao_mercado');
        explicado = true;
      }
    } else if (rf.vencimento && (rf.subtipo === 'ipca' || rf.subtipo === 'pre')) {
      const anosVenc = Math.max(0.1, diasEntre(ate, rf.vencimento) / 365.25);
      const taxa = num(rf.taxa) ? rf.taxa : 0.06;
      const dmod = anosVenc / (1 + taxa);
      const dTaxa = (-mov / dmod) * 100; // p.p.
      criterios.push('marcacao_mercado');
      if (Math.abs(dTaxa) <= 1) {
        causa = ` Equivale a uma ${dTaxa > 0 ? 'alta' : 'queda'} de ~${formatNumeroBR(Math.abs(dTaxa), 2)} p.p. na taxa do título (duration de ~${formatNumeroBR(dmod, 1)} anos): é marcação a mercado${caiu ? `, não perda definitiva — levando até ${formatDateBR(rf.vencimento)}, vale a taxa contratada` : ''}.`;
        criterios.push('diag_mam_alta_juros');
        tom = 'neutro';
      } else {
        causa = ` Para explicar isso, os juros do título teriam que ${dTaxa > 0 ? 'subir' : 'cair'} ~${formatNumeroBR(Math.abs(dTaxa), 1)} p.p. em ${N_RECENTE} pregões (duration de ~${formatNumeroBR(dmod, 1)} anos) — bem mais que o normal; confira o lançamento.`;
        criterios.push('diag_rf_queda_sem_juros');
      }
      explicado = true;
    }
  }
  // causa 4: o mercado (índice da classe) andou junto?
  if (!explicado) {
    const benchMercado = ctx.bench && ctx.bench.tipo === 'mercado' ? ctx.bench : null;
    const mercados = benchMercado ? [benchMercado] : ctx.indicesContexto.filter((i) => !INDICES_TAXA.test(i.nome) && i.tipo !== 'cambio');
    const taxas = ctx.indicesContexto.filter((i) => INDICES_TAXA.test(i.nome));
    if (mercados.length) {
      const comMov = mercados.map((i) => ({ nome: i.nome, r: retornoEntre(i, de, ate) })).filter((i) => num(i.r));
      if (comMov.length) {
        comMov.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
        const mi = comMov[0];
        if (Math.sign(mi.r) === Math.sign(mov) && Math.abs(mi.r) >= 0.5 * Math.abs(mov)) causa = ` Acompanhou o mercado: o ${mi.nome} ${mi.r < 0 ? 'caiu' : 'subiu'} ${formatPctAbs(mi.r, 2)} no mesmo intervalo.`;
        else causa = ` O mercado não explica: o ${mi.nome} variou ${formatPctSinal(mi.r, 2)} no mesmo intervalo — o movimento foi da própria carteira.`;
        criterios.push('diag_mercado_vs_proprio');
      }
    } else if (taxas.length) {
      const t = taxas.map((i) => ({ nome: i.nome, r: retornoEntre(i, de, ate) })).find((i) => num(i.r));
      if (t) {
        causa = ` No mesmo intervalo o ${t.nome} ${t.r >= 0 ? 'rendeu' : 'variou'} ${formatPctSinal(t.r, 2)}, então não é o índice: ${caiu ? 'é marcação a mercado dos títulos (preço de venda antecipada), que volta ao longo do tempo se o título for levado ao vencimento' : 'é marcação a mercado favorável dos títulos'}.`;
        criterios.push('marcacao_mercado');
      }
    }
  }
  // qual componente puxou
  let puxou = '';
  if (ctx.componentes) {
    const contrib = Object.entries(ctx.componentes)
      .map(([nomeC, lista]) => ({ nome: nomeC, g: ganhoComponente(lista, de, ate) }))
      .filter((x) => num(x.g));
    const total = contrib.reduce((s, x) => s + x.g, 0);
    const mesmos = contrib.filter((x) => Math.sign(x.g) === Math.sign(mov)).sort((a, b) => Math.abs(b.g) - Math.abs(a.g));
    if (contrib.length >= 2 && mesmos.length && Math.abs(total) > 0 && Math.abs(mesmos[0].g) >= 0.5 * Math.abs(total) && Math.sign(total) === Math.sign(mov)) {
      puxou = ` A maior parte veio de ${mesmos[0].nome} (${moedaSinal(mesmos[0].g, ctx.formatarMoeda)}).`;
      criterios.push('contribuicao_componente');
    }
  }
  texto += causa + puxou;
  return {
    tipo: 'movimento',
    tom,
    texto,
    resumo: `${caiu ? 'queda' : 'alta'} forte nos últimos dias (${formatPctSinal(mov, 2)})${explicado && tom === 'neutro' ? ' explicada' : ''}`,
    peso: 85 + Math.min(15, Number.isFinite(z) ? z : 15),
    dados: { mov, z, sigma, de, ate },
    criterios,
  };
}

// ---------------------------------------------------------------------------
// Fluxos, queda, tendência, concentração (como antes, com o índice certo)
// ---------------------------------------------------------------------------

function regraFluxos(ctx) {
  const c = ctx.curva;
  if (c.length < 2 || !num(c[0].valor) || !num(c[c.length - 1].valor)) return null;
  const delta = c[c.length - 1].valor - c[0].valor;
  const fluxoTotal = c.slice(1).reduce((s, p) => s + (num(p.fluxo) ? p.fluxo : 0), 0);
  // ajuste de marcação (valor da planilha x projeção do histórico) entra no
  // fluxo pra não virar rendimento, mas não é aporte nem resgate
  const ajuste = c.slice(1).reduce((s, p) => s + (num(p.ajuste) ? p.ajuste : 0), 0);
  const fluxo = fluxoTotal - ajuste;
  const ganho = delta - fluxoTotal;
  const ref = Math.max(Math.abs(c[c.length - 1].valor), 1);
  if (Math.abs(fluxo) < 0.01 * ref || Math.abs(fluxo) < 0.3 * Math.max(Math.abs(delta), Math.abs(ganho))) return null;
  const fmt = ctx.formatarMoeda;
  const comAjuste = Math.abs(ajuste) >= 0.005 * ref ? ` (descontado também um ajuste de marcação de ${moedaSinal(ajuste, fmt)} no valor de hoje)` : '';
  let texto;
  if (fluxo > 0 && delta >= 0) texto = `Do aumento de ${fmt(delta)} no valor ${ctx.descPeriodo}, ${fmt(fluxo)} foram aportes — o ganho de mercado foi ${moedaSinal(ganho, fmt)}.`;
  else if (fluxo > 0) texto = `Mesmo com ${fmt(fluxo)} em aportes ${ctx.descPeriodo}, o valor caiu ${fmt(Math.abs(delta))} — o mercado tirou ${fmt(Math.abs(ganho))}.`;
  else if (delta < 0) texto = `O valor caiu ${fmt(Math.abs(delta))} ${ctx.descPeriodo}, mas ${fmt(Math.abs(fluxo))} foram resgates/saídas — descontando isso, o resultado foi ${moedaSinal(ganho, fmt)}.`;
  else texto = `O valor subiu ${fmt(delta)} ${ctx.descPeriodo} mesmo com ${fmt(Math.abs(fluxo))} em resgates/saídas — o resultado de mercado foi ${moedaSinal(ganho, fmt)}.`;
  if (comAjuste) texto = texto.replace(/\.$/, `${comAjuste}.`);
  return { tipo: 'fluxos', tom: 'neutro', texto, resumo: fluxo > 0 ? 'boa parte da variação foi aporte' : 'resgates explicam parte da variação', peso: 66, dados: { delta, fluxo, ganho }, criterios: ['retorno_twr_cota'] };
}

function regraFluxoRecente(ctx) {
  const c = ctx.curva;
  if (ctx.spanDias <= 31 || c.length < 6) return null;
  const ultimos = c.slice(-5);
  let maior = null;
  ultimos.forEach((p) => { if (num(p.fluxo) && (!maior || Math.abs(p.fluxo) > Math.abs(maior.fluxo))) maior = p; });
  if (!maior || !num(maior.valor) || Math.abs(maior.fluxo) < 0.03 * Math.max(Math.abs(maior.valor), 1)) return null;
  if (num(maior.ajuste) && Math.abs(maior.ajuste) >= 0.5 * Math.abs(maior.fluxo)) {
    // não foi dinheiro entrando/saindo: o valor de hoje (planilha/corretora)
    // ficou diferente da projeção do histórico - marcação a mercado
    const aj = maior.ajuste;
    return {
      tipo: 'fluxoRecente',
      tom: 'neutro',
      texto: `Em ${diaMes(maior.data)} o valor atualizado veio ${ctx.formatarMoeda(Math.abs(aj))} ${aj < 0 ? 'abaixo' : 'acima'} do que o histórico projetava (marcação a mercado / preço do dia): o gráfico trata essa diferença como ajuste, não como ${aj < 0 ? 'perda' : 'ganho'} do período.`,
      resumo: `ajuste de marcação de ${ctx.formatarMoeda(Math.abs(aj))}`,
      peso: 52,
      criterios: ['curva_vs_mercado', 'marcacao_mercado'],
    };
  }
  const entrou = maior.fluxo > 0;
  return {
    tipo: 'fluxoRecente',
    tom: 'neutro',
    texto: `Em ${diaMes(maior.data)} ${entrou ? 'entrou um aporte' : 'saiu um resgate'} de ${ctx.formatarMoeda(Math.abs(maior.fluxo))} — o ${entrou ? 'salto' : 'tombo'} no valor desse dia não é ${entrou ? 'rendimento' : 'perda'}.`,
    resumo: `${entrou ? 'aporte' : 'resgate'} recente de ${ctx.formatarMoeda(Math.abs(maior.fluxo))}`,
    peso: 70,
    criterios: ['diag_salto_aporte'],
  };
}

function regraQueda(ctx, movimento) {
  const c = ctx.curva;
  if (c.length < 5) return null;
  const q = ctx.m.drawdown;
  if (!q || q.dd < 0.02) return null;
  // a queda que acabou de acontecer já é o ponto "movimento"
  if (movimento && q.recuperou === -1 && q.vale >= c.length - 1 - N_RECENTE) return null;
  const anoDif = c[q.pico].data.slice(0, 4) !== c[c.length - 1].data.slice(0, 4) || c[0].data.slice(0, 4) !== c[c.length - 1].data.slice(0, 4);
  const dPico = diaMesAno(c[q.pico].data, anoDif);
  const dVale = diaMesAno(c[q.vale].data, anoDif);
  // o índice da classe no mesmo intervalo (pico -> vale)
  let noIndice = '';
  const b = ctx.bench && ctx.bench.tipo !== 'taxa' ? ctx.bench : null;
  const criterios = ['max_drawdown'];
  if (b) {
    const rb = retornoEntre(b, c[q.pico].data, c[q.vale].data);
    if (num(rb)) {
      noIndice = `${b.tipo === 'composto' ? 'a carteira de referência' : `o ${b.nome}`} ${rb <= -0.0005 ? `caiu ${formatPctAbs(rb, 2)}` : (Math.abs(rb) < 0.0005 ? 'ficou estável' : `subiu ${formatPctAbs(rb, 2)}`)} no mesmo intervalo`;
    }
  }
  if (q.recuperou !== -1) {
    const dias = diasEntre(c[q.pico].data, c[q.recuperou].data);
    criterios.push('tempo_recuperacao');
    return {
      tipo: 'queda', tom: 'neutro',
      texto: `Maior queda ${ctx.descPeriodo}: −${formatPctAbs(q.dd, 2)} (de ${dPico} a ${dVale}${noIndice ? `; ${noIndice}` : ''}), já recuperada em ${diaMesAno(c[q.recuperou].data, anoDif)}${dias >= 45 ? ` — ${descreverPrazo(dias)} do pico até voltar a ele` : ''}.`,
      resumo: `queda de −${formatPctAbs(q.dd, 1)} já recuperada`,
      peso: 48 + Math.min(20, q.dd * 100),
      criterios,
    };
  }
  const falta = q.altaParaVoltar >= 0.005 ? ` Precisa subir ${formatPctAbs(q.altaParaVoltar, 1)} pra voltar ao pico.` : '';
  return {
    tipo: 'queda', tom: q.distancia >= 0.01 ? 'atencao' : 'neutro',
    texto: q.vale === c.length - 1
      ? `Maior queda ${ctx.descPeriodo}: −${formatPctAbs(q.dd, 2)} desde o pico de ${dPico}${noIndice ? ` (${noIndice})` : ''}, e o fim do período é o ponto mais baixo.${falta}`
      : `Maior queda ${ctx.descPeriodo}: −${formatPctAbs(q.dd, 2)} desde o pico de ${dPico} (fundo em ${dVale}${noIndice ? `; ${noIndice}` : ''}); ainda está ${formatPctAbs(q.distancia, 2)} abaixo dele.`,
    resumo: `ainda ${formatPctAbs(q.distancia, 1)} abaixo do pico de ${dPico}`,
    peso: 52 + Math.min(25, q.dd * 150),
    criterios,
  };
}

function regraTendencia(ctx) {
  if (ctx.spanDias < 180) return null;
  let ref = null;
  if (ctx.bench) ref = { nome: ctx.bench.tipo === 'composto' ? 'carteira de referência' : ctx.bench.nome, idx: ctx.bench, ret: ctx.bench.ret };
  else {
    const r = ctx.retIndices.find((i) => ctx.indiceReferencia && i.nome.toLowerCase() === ctx.indiceReferencia.toLowerCase())
      || ctx.retIndices.find((i) => /^cdi$/i.test(i.nome)) || ctx.retIndices[0];
    if (r) ref = { nome: r.nome, idx: r, ret: r.ret };
  }
  if (!ref) return null;
  const c = ctx.curva;
  const fim = c[c.length - 1];
  const corte = isoMenosDias(fim.data, 91);
  const p0 = c.find((p) => p.data >= corte);
  if (!p0 || p0 === fim) return null;
  const r3 = fim.f / p0.f - 1;
  const i3 = retornoEntre(ref.idx, p0.data, fim.data);
  if (!num(i3)) return null;
  const ex3 = (r3 - i3) * 100;
  const exT = (ctx.R - ref.ret) * 100;
  const meses = ctx.spanDias / 30.44;
  const ritmo3 = ex3 / 3;
  const ritmoT = exT / meses;
  const idx = ref.nome;
  const da = idx === 'carteira de referência' ? 'da' : 'do';
  const crit = ['excesso_vs_benchmark'];
  if (exT * ex3 < 0 && Math.abs(ex3) >= 0.5) {
    if (ex3 < 0) return { tipo: 'tendencia', tom: 'atencao', texto: `Perdeu fôlego: nos últimos 3 meses ficou ${pp(ex3)} abaixo ${da} ${idx}, apesar de estar ${pp(exT)} acima dele no período inteiro.`, resumo: `atrás ${da} ${idx} nos últimos 3 meses`, peso: 62, criterios: crit };
    return { tipo: 'tendencia', tom: 'bom', texto: `Virou o jogo: nos últimos 3 meses ficou ${pp(ex3)} acima ${da} ${idx}, depois de um período inteiro abaixo dele (${pp(exT)} atrás).`, resumo: `à frente ${da} ${idx} nos últimos 3 meses`, peso: 60, criterios: crit };
  }
  if (ritmo3 - ritmoT >= 0.3 && ex3 > 0) return { tipo: 'tendencia', tom: 'bom', texto: `Acelerou: nos últimos 3 meses abriu ${pp(ex3)} sobre ${da === 'da' ? 'a' : 'o'} ${idx} (≈${pp(ritmo3)} por mês), acima do ritmo do período inteiro (≈${pp(ritmoT)}${ritmoT < 0 ? ' abaixo' : ''} por mês).`, resumo: `acelerando contra ${da === 'da' ? 'a' : 'o'} ${idx}`, peso: 56, criterios: crit };
  if (ritmoT - ritmo3 >= 0.3 && ex3 < 0) return { tipo: 'tendencia', tom: 'atencao', texto: `Piorou: nos últimos 3 meses ficou ${pp(ex3)} abaixo ${da} ${idx} (≈${pp(ritmo3)} por mês), mais que no período inteiro.`, resumo: `piorando contra ${da === 'da' ? 'a' : 'o'} ${idx}`, peso: 58, criterios: crit };
  return null;
}

function regraConcentracao(ctx) {
  if (!ctx.componentes) return null;
  const c = ctx.curva;
  const de = c[0].data;
  const ate = c[c.length - 1].data;
  const contrib = Object.entries(ctx.componentes)
    .map(([nome, lista]) => ({ nome, g: ganhoComponente(lista, de, ate) }))
    .filter((x) => num(x.g) && Math.abs(x.g) >= 0.005);
  if (contrib.length < 2) return null;
  const total = contrib.reduce((s, x) => s + x.g, 0);
  const somaAbs = contrib.reduce((s, x) => s + Math.abs(x.g), 0);
  const ref = Math.max(Math.abs(c[c.length - 1].valor || 0), 1);
  if (somaAbs < 0.002 * ref) return null;
  const fmt = ctx.formatarMoeda;
  const pos = contrib.filter((x) => x.g > 0).sort((a, b) => b.g - a.g);
  const neg = contrib.filter((x) => x.g < 0).sort((a, b) => a.g - b.g);
  const criterios = ['contribuicao_componente'];
  // resultado líquido dominado por um lado só: "veio quase todo de X"
  const lado = total >= 0 ? pos : neg;
  if (lado.length && Math.abs(total) >= 0.5 * somaAbs && lado[0].g / total >= 0.7) {
    return { tipo: 'concentracao', tom: 'neutro', texto: `O resultado ${ctx.descPeriodo} veio quase todo de ${lado[0].nome} (${moedaSinal(lado[0].g, fmt)} de ${moedaSinal(total, fmt)}).`, resumo: `resultado concentrado em ${lado[0].nome}`, peso: 44, criterios };
  }
  // forças opostas: um componente puxou forte pra um lado e os outros compensaram
  if (pos.length && neg.length) {
    const dom = Math.abs(neg[0].g) >= pos[0].g ? neg[0] : pos[0];
    if (Math.abs(dom.g) >= 0.4 * somaAbs) {
      const outros = dom.g < 0 ? pos : neg;
      const somaOutros = outros.reduce((x, o) => x + o.g, 0);
      const nomes = juntarLista(outros.slice(0, 2).map((o) => o.nome)) + (outros.length > 2 ? ' e outros' : '');
      return {
        tipo: 'concentracao', tom: 'neutro',
        texto: `${dom.nome} puxou para ${dom.g < 0 ? 'baixo' : 'cima'} (${moedaSinal(dom.g, fmt)}) ${ctx.descPeriodo}, enquanto ${nomes} ${dom.g < 0 ? 'compensaram em parte' : 'seguraram'} (${moedaSinal(somaOutros, fmt)}).`,
        resumo: `${dom.nome} ${dom.g < 0 ? '↓' : '↑'}`,
        peso: 46,
        criterios,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Regras novas (com classe)
// ---------------------------------------------------------------------------

function regraReal(ctx) {
  const { m, familia } = ctx;
  if (!familia || familia === 'patrimonio' || !num(m.real) || ctx.spanDias < 85) return null;
  const ipcaRet = m.ipca;
  const real = m.real;
  const nomeMin = minusculaInicial(ctx.nome);
  const anos = ctx.spanDias / 365.25;
  const realAa = anos >= 1 ? (1 + real) ** (1 / anos) - 1 : null;
  let tom = 'neutro';
  const criterios = ['retorno_real_ipca'];
  if (ctx.meses >= 12) {
    const fam = familia === 'reserva' ? 'reserva' : (familia === 'carteira' && ctx.meses >= 36 ? 'carteira' : 'padrao');
    tom = tomDoNivel(classificar('retorno_real_ipca', (realAa != null ? realAa : real) * 100, fam));
  }
  let texto = `Descontada a inflação (IPCA de ${formatPctSinal(ipcaRet, 2)} ${ctx.descPeriodo}), ${nomeMin} ${real >= 0 ? 'ganhou' : 'perdeu'} ${formatPctAbs(real, 2)} de poder de compra${realAa != null ? ` (${formatPctSinal(realAa, 2)} ao ano)` : ''}.`;
  const cdi = ctx.cdi;
  if (real < 0 && cdi && num(cdi.ret) && ctx.R >= cdi.ret && cdi.ret < ipcaRet && ctx.meses >= 12) {
    texto += ' O próprio CDI ficou abaixo da inflação no período: juro real negativo, não erro de escolha.';
    tom = 'neutro';
    criterios.push('diag_real_negativo_cdi_positivo');
  }
  const peso = real < 0 && ctx.R > 0 ? 63 : (familia === 'carteira' ? 55 : 50);
  return { tipo: 'real', tom, texto, resumo: `${real >= 0 ? 'ganho' : 'perda'} real de ${formatPctAbs(real, 1)}`, peso, criterios };
}

function regraRisco(ctx) {
  const { m, familia, bench } = ctx;
  if (!familia) return null;
  // renda fixa pós / reserva: a régua é absoluta (não pode oscilar)
  if (familia === 'reserva' || familia === 'rf-pos') {
    const pc = m.pctCdi;
    if (familia === 'reserva' && ctx.meses >= 3 && num(pc)) {
      if (pc >= 97 && (!num(m.vol) || m.vol < 0.005) && (!m.drawdown || m.drawdown.dd < 0.001)) {
        return { tipo: 'risco', tom: 'bom', texto: `A reserva rendeu ${formatNumeroBR(pc, 0)}% do CDI sem oscilar — cumpre o papel (liquidez e estabilidade).`, resumo: 'reserva estável', peso: 55, criterios: ['reserva_adequada'] };
      }
      if (pc < 90) {
        return { tipo: 'risco', tom: 'atencao', texto: `A reserva rendeu ${formatNumeroBR(pc, 0)}% do CDI ${ctx.descPeriodo}; Tesouro Selic ou CDB de liquidez diária pagam perto de 100%.`, resumo: `reserva a ${formatNumeroBR(pc, 0)}% do CDI`, peso: 75, criterios: ['diag_reserva_rendendo_mal', 'reserva_adequada'] };
      }
    }
    if (num(m.mesesNegativos) && m.mesesNegativos > 0 && m.nMeses >= 6) {
      return { tipo: 'risco', tom: 'atencao', texto: `${ctx.nome} teve ${m.mesesNegativos} ${m.mesesNegativos === 1 ? 'mês negativo' : 'meses negativos'} em ${m.nMeses} — inesperado para ${ROTULO_FAMILIA[familia]} (algo marcado a mercado no meio?).`, resumo: 'meses negativos', peso: 64, criterios: ['meses_negativos'] };
    }
    if (num(m.vol) && ctx.meses >= 3 && classificar('volatilidade_anualizada', m.vol * 100, familia) === 'ruim') {
      return { tipo: 'risco', tom: 'atencao', texto: `${ctx.nome} oscila ~${formatPctAbs(m.vol, 1)} ao ano — muito para ${ROTULO_FAMILIA[familia]}, que deveria ficar abaixo de ~0,5%.`, resumo: 'oscilação alta para pós-fixado', peso: 62, criterios: ['volatilidade_anualizada'] };
    }
    return null;
  }
  if (!bench || bench.tipo === 'taxa' || !num(m.vol) || !num(m.volBench) || m.volBench <= 0 || ctx.meses < 6) return null;
  const relVol = m.vol / m.volBench;
  const mdd = m.drawdown ? m.drawdown.dd : 0;
  const relMdd = num(m.mddBench) && m.mddBench > 0.005 ? mdd / m.mddBench : null;
  const nomeB = bench.tipo === 'composto' ? 'a carteira de referência' : `o ${bench.nome}`;
  const excAa = num(m.excessoAa) ? m.excessoAa : m.excesso;
  const criterios = ['volatilidade_anualizada', 'max_drawdown'];
  if (ctx.meses >= 12 && num(excAa) && Math.abs(excAa) <= 2 && relVol <= 0.85 && (relMdd == null || relMdd <= 0.85)) {
    return { tipo: 'risco', tom: 'bom', texto: `${ctx.nome} rendeu parecido com ${nomeB}, mas oscilou ${formatPctAbs(1 - relVol, 0)} menos (${formatPctAbs(m.vol, 1)} contra ${formatPctAbs(m.volBench, 1)} ao ano)${relMdd != null ? ` e caiu menos na pior fase (−${formatPctAbs(mdd, 1)} contra −${formatPctAbs(m.mddBench, 1)})` : ''} — melhor risco-retorno.`, resumo: 'mesmo retorno com menos risco', peso: 62, criterios: [...criterios, 'diag_bate_indice_com_menos_risco'] };
  }
  if (ctx.meses >= 12 && num(excAa) && excAa >= 3 && (relVol >= 1.3 || (relMdd != null && relMdd >= 1.3))) {
    return { tipo: 'risco', tom: 'neutro', texto: `${ctx.nome} ganhou ${bench.tipo === 'composto' ? 'da carteira de referência' : `do ${bench.nome}`}, mas oscilando ${formatPctAbs(relVol - 1, 0)} mais (${formatPctAbs(m.vol, 1)} contra ${formatPctAbs(m.volBench, 1)} ao ano) — o que sobe muito tende a cair mais quando o mercado vira.`, resumo: 'ganhou com mais risco', peso: 64, criterios: [...criterios, 'diag_bate_indice_com_mais_risco'] };
  }
  const relTxt = relVol < 0.9 ? 'menos que' : relVol > 1.1 ? 'mais que' : 'parecido com';
  return {
    tipo: 'risco', tom: 'neutro',
    texto: `${ctx.nome} oscila ~${formatPctAbs(m.vol, 1)} ao ano, ${relTxt} ${nomeB} (${formatPctAbs(m.volBench, 1)})${mdd >= 0.01 && num(m.mddBench) ? `; a maior queda ${ctx.descPeriodo} foi de −${formatPctAbs(mdd, 1)}, contra −${formatPctAbs(m.mddBench, 1)} ${bench.tipo === 'composto' ? 'da carteira de referência' : `do ${bench.nome}`}` : ''}.`,
    resumo: `oscila ${relTxt} ${nomeB}`,
    peso: 46,
    criterios,
  };
}

function regraSharpe(ctx) {
  const { m, bench } = ctx;
  if (ctx.meses < 24 || !num(m.sharpe) || !bench || bench.tipo === 'taxa') return null;
  const s = m.sharpe;
  const sb = m.sharpeBench;
  const nomeB = bench.tipo === 'composto' ? 'a carteira de referência' : `o ${bench.nome}`;
  let tom = tomDoNivel(classificar('sharpe', s, 'padrao'));
  let leitura;
  if (s < 0) { leitura = 'rendeu menos que o CDI, apesar do risco'; tom = 'atencao'; }
  else if (num(sb) && s >= sb + 0.2) { leitura = `mais retorno por unidade de oscilação que ${nomeB} (${nr(sb)})`; tom = 'bom'; }
  else if (num(sb) && s <= sb - 0.2) { leitura = `menos retorno por unidade de oscilação que ${nomeB} (${nr(sb)})`; tom = 'atencao'; }
  else leitura = num(sb) ? `parecido com ${nomeB} (${nr(sb)})` : 'cada ponto de oscilação pagou esse tanto acima do CDI';
  const sortino = num(m.sortino) ? ` Olhando só as quedas (Sortino): ${nr(m.sortino)}.` : '';
  return { tipo: 'sharpe', tom, texto: `Risco x retorno com o CDI como base (Sharpe): ${nr(s)} — ${leitura}.${sortino}`, resumo: `Sharpe ${nr(s)}`, peso: 52, criterios: ['sharpe', ...(num(m.sortino) ? ['sortino'] : [])] };
}

function regraAlfaBeta(ctx) {
  const { m, bench } = ctx;
  if (!bench || bench.tipo !== 'mercado' || !num(m.beta)) return null;
  const excAa = m.excessoAa;
  // diag_beta_explica: o excesso veio do risco (beta), não da seleção
  if (ctx.meses >= 12 && num(excAa) && m.beta > 1.2 && ((excAa > 3 && bench.ret > 0) || (excAa < -3 && bench.ret < 0))) {
    return { tipo: 'alfa', tom: 'neutro', texto: `Boa parte da diferença para o ${bench.nome} vem do beta de ${nr(m.beta)}: ${minusculaInicial(ctx.nome)} amplifica os movimentos do mercado (quando o índice anda 10%, tende a andar ~${formatNumeroBR(m.beta * 10, 0)}%).`, resumo: `beta ${nr(m.beta)}`, peso: 55, criterios: ['beta', 'diag_beta_explica'] };
  }
  if (ctx.meses >= 24 && num(m.alfa) && num(m.tAlfa) && Math.abs(m.tAlfa) >= 2) {
    const bom = m.alfa > 0;
    return { tipo: 'alfa', tom: bom ? 'bom' : 'atencao', texto: `Descontando o risco de mercado (beta ${nr(m.beta)}), ${bom ? 'sobrou' : 'faltou'} um alfa de ${formatPctAbs(m.alfa, 1)} ao ano nos últimos ${m.nMeses} meses — consistente o bastante pra não ser só sorte.`, resumo: `alfa ${formatPctSinal(m.alfa, 1)} a.a.`, peso: 54, criterios: ['alfa_jensen', 'beta'] };
  }
  return null;
}

function regraConsistencia(ctx) {
  const { m, bench, familia } = ctx;
  if (!bench || !num(m.hit) || m.nMesesComparados < 12) return null;
  const nomeB = bench.tipo === 'composto' ? 'da carteira de referência' : `do ${bench.nome}`;
  const fam = familia === 'rf' || familia === 'rf-pos' || familia === 'reserva' ? 'rf' : 'padrao';
  const tom = ctx.meses >= 24 ? tomDoNivel(classificar('consistencia_meses_acima', m.hit * 100, fam)) : 'neutro';
  return { tipo: 'consistencia', tom, texto: `${ctx.nome} ganhou ${nomeB} em ${m.mesesAcima} de ${m.nMesesComparados} meses (${formatNumeroBR(m.hit * 100, 0)}%)${tom === 'bom' ? ' — vantagem recorrente, não de poucos meses' : ''}.`, resumo: `acima ${nomeB} em ${m.mesesAcima} de ${m.nMesesComparados} meses`, peso: 45, criterios: ['consistencia_meses_acima'] };
}

function regraTir(ctx) {
  const { m, bench } = ctx;
  if (!num(m.tir) || !m.fluxosRelevantes) return null;
  const anos = ctx.spanDias / 365.25;
  const twrAa = anos >= 1 ? (1 + ctx.R) ** (1 / anos) - 1 : null;
  const fmt = ctx.formatarMoeda;
  const criterios = ['retorno_mwr_tir'];
  let texto;
  if (anos >= 1) texto = `Considerando quando cada real entrou e saiu, o dinheiro rendeu ${formatPctSinal(m.tir, 1)} ao ano (TIR); na conta "por cota", ${formatPctSinal(twrAa, 1)} ao ano.`;
  else texto = `Considerando quando cada real entrou e saiu, o dinheiro rendeu ${formatPctSinal(m.tirPeriodo, 2)} ${ctx.descPeriodo} (TIR); na conta "por cota", ${formatPctSinal(ctx.R, 2)}.`;
  let tom = 'neutro';
  if (m.pme && bench) {
    const nomeB = bench.tipo === 'composto' ? 'na carteira de referência' : `no ${bench.nome}`;
    texto += ` Se cada aporte tivesse ido ${nomeB}, teria ${fmt(m.pme.vIdx)}; tem ${fmt(ctx.valorFim)} (${moedaSinal(m.pme.dif, fmt)}).`;
    criterios.push('pme_benchmark_equivalente');
    const julgar = /^(rf|reserva)/.test(ctx.familia || '') ? 6 : 12;
    if (ctx.meses >= julgar) {
      const fam = ctx.familia === 'reserva' ? 'reserva' : (/^rf/.test(ctx.familia || '') ? 'rf' : 'padrao');
      tom = tomDoNivel(classificar('pme_benchmark_equivalente', m.pme.razao, fam));
    }
  }
  if (num(twrAa) && anos >= 1) {
    const gap = (m.tir - twrAa) * 100;
    const rv = RENDA_VARIAVEL.has(ctx.familia);
    if (gap >= 1) {
      texto += rv ? ' Os aportes ajudaram: entrou mais dinheiro antes das fases de alta (aportes nas quedas).' : ' A TIR ficou acima porque havia mais dinheiro aplicado quando os juros estavam mais altos.';
      criterios.push('gap_mwr_twr');
    } else if (gap <= -3) {
      texto += rv ? ' Os aportes maiores vieram em fases de preço alto — comum com aportes crescentes num mercado em alta, não é por si erro.' : ' A TIR ficou abaixo porque havia mais dinheiro aplicado quando os juros estavam mais baixos.';
      criterios.push('gap_mwr_twr');
    }
  }
  const rf = /^(rf|reserva)/.test(ctx.familia || '');
  if (rf && tom === 'atencao') tom = 'neutro'; // o % do CDI (comparação) já julga a renda fixa
  return { tipo: 'tir', tom, texto, resumo: `TIR ${formatPctSinal(anos >= 1 ? m.tir : m.tirPeriodo, 1)}${anos >= 1 ? ' a.a.' : ''}`, peso: rf ? 50 : (tom === 'atencao' ? 63 : 58), criterios };
}

function regraCambio(ctx) {
  const { m } = ctx;
  if (ctx.familia !== 'eua' || ctx.moeda === 'USD' || !num(m.dfx)) return null;
  const rUsd = m.rUsd;
  const sp = ctx.lista.find((i) => /^s&p 500$/i.test(i.nome) && num(i.ret));
  const nomeMin = minusculaInicial(ctx.nome);
  const forte = Math.abs(m.dfx) >= 0.02 && Math.abs(m.dfx) >= 0.5 * Math.abs(ctx.R);
  const texto = `Em dólar, ${nomeMin} ${rUsd >= 0 ? 'rendeu' : 'recuou'} ${formatPctSinal(rUsd, 2)}${sp ? ` (S&P 500 em US$: ${formatPctSinal(sp.ret, 2)})` : ''}; o dólar ${m.dfx >= 0 ? 'subiu' : 'caiu'} ${formatPctAbs(m.dfx, 2)} ${ctx.descPeriodo}, levando o resultado em reais para ${formatPctSinal(ctx.R, 2)}${forte ? ' — o câmbio explica boa parte do resultado' : ''}.`;
  return { tipo: 'cambio', tom: 'neutro', texto, resumo: `dólar ${m.dfx >= 0 ? '↑' : '↓'} ${formatPctAbs(m.dfx, 1)}`, peso: forte ? 68 : 52, criterios: ['efeito_cambio'] };
}

/**
 * 07/10/2026 (Tiago: "Inclua na lista de análises essas quedas por causa de
 * câmbio, é uma boa informação"): decompõe a variação em R$ de ativos em dólar
 * em preço em US$ x câmbio no DIA (último intervalo da série, com o câmbio ao
 * vivo no último ponto), no MÊS e no PERÍODO selecionado, e devolve um item por
 * janela em que o dólar explica >= 60% do movimento (ou anda contra o preço).
 * Máximo 2 itens (o dia + a janela mais longa relevante) pra não encher o card.
 * Cálculo puro em analise-cambio.js.
 */
function regrasCambioJanelas(ctx) {
  if (ctx.familia !== 'eua' || ctx.moeda === 'USD' || !ctx.cambioIdx || !ctx.cambioIdx.datas.length) return [];
  const base = ctx.contextoCurva.length >= ctx.curva.length ? ctx.contextoCurva : ctx.curva;
  const sujeito = /^ativo-eua$/i.test(String(ctx.classe || '')) ? { texto: 'o ativo', plural: false } : { texto: 'as ações', plural: true };
  const janela = (id, de, ate, R, rotulo) => {
    const dfx = retornoEntre(ctx.cambioIdx, de, ate);
    if (!num(dfx) || !num(R)) return null;
    const d = decomporCambio({ retornoBrl: R, variacaoCambio: dfx, minimoCambio: MINIMO_CAMBIO_POR_JANELA[id] });
    return itemCambio({ d, janela: id, rotulo, nivelIni: nivelEmOuDepois(ctx.cambioIdx, de, ate), nivelFim: nivelEm(ctx.cambioIdx, ate), sujeito });
  };
  const itens = [];
  const n = base.length;
  const ate = n ? base[n - 1].data : null;
  // dia: os dois últimos pontos da série (hoje ao vivo x último fechamento)
  let deDia = null;
  if (n >= 2 && base[n - 2].f > 0) {
    deDia = base[n - 2].data;
    const rotulo = ctx.hoje && ate === ctx.hoje ? 'hoje' : `em ${diaMes(ate)}`;
    const it = janela('dia', deDia, ate, base[n - 1].f / base[n - 2].f - 1, rotulo);
    if (it) itens.push(it);
  }
  // mês: do último ponto do mês anterior (ou do começo da série) até o fim
  const mesFim = ate ? ate.slice(0, 7) : null;
  let ini = -1;
  for (let i = n - 1; i >= 0; i -= 1) { if (base[i].data.slice(0, 7) < mesFim) { ini = i; break; } }
  if (ini < 0) ini = 0;
  const mesIni = n ? base[ini] : null;
  const longos = [];
  if (mesIni && mesIni.data !== deDia && mesIni.data !== ate && mesIni.f > 0) {
    const it = janela('mes', mesIni.data, ate, base[n - 1].f / mesIni.f - 1, 'no mês');
    if (it) longos.push({ it, de: mesIni.data });
  }
  // período selecionado (a janela do gráfico), se for maior que o mês e o dia
  const de0 = ctx.curva[0].data;
  if (de0 !== deDia && (!mesIni || de0 < mesIni.data)) {
    const it = janela('periodo', de0, ctx.curva[ctx.curva.length - 1].data, ctx.R, ctx.descPeriodo);
    if (it) longos.push({ it, de: de0 });
  }
  longos.sort((a, b) => b.it.peso - a.it.peso);
  if (longos.length) itens.push(longos[0].it);
  return itens;
}

function regraDescolamento(ctx) {
  const { m, bench, familia } = ctx;
  if (!bench || bench.tipo !== 'mercado' || !RENDA_VARIAVEL.has(familia) || !num(m.excesso)) return null;
  const exc = m.excesso;
  if (ctx.meses < 12 && Math.abs(exc) > 10) {
    return { tipo: 'descolamento', tom: 'neutro', texto: `${ctx.nome} está ${pp(exc)} ${exc > 0 ? 'acima' : 'abaixo'} do ${bench.nome} em apenas ${descreverPrazo(ctx.spanDias)}. Distâncias assim, para cima ou para baixo, costumam vir de concentração ou risco maior — e tendem a diminuir.`, resumo: `descolado do ${bench.nome}`, peso: 61, criterios: ['descolamento_benchmark'] };
  }
  const lim = familia === 'fiis' ? 8 : 15;
  if (ctx.meses >= 12 && num(m.excessoAa) && Math.abs(m.excessoAa) > lim) {
    return { tipo: 'descolamento', tom: 'neutro', texto: `${ctx.nome} anda bem longe do ${bench.nome} (${nr(m.excessoAa, 1)} p.p. ao ano): a estratégia é muito diferente do índice — o resultado depende de poucas apostas.`, resumo: `estratégia longe do ${bench.nome}`, peso: 50, criterios: ['descolamento_benchmark'] };
  }
  return null;
}

function regraProventosAReceber(ctx) {
  const lista = Array.isArray(ctx.proventosAReceber) ? ctx.proventosAReceber : null;
  if (!lista || !num(ctx.valorFim) || ctx.valorFim <= 0) return null;
  const fim = ctx.curva[ctx.curva.length - 1].data;
  const ja = lista.filter((p) => p && num(p.valor) && p.valor > 0 && ((p.dataCom && p.dataCom < fim) || (!p.dataCom && p.dataComPassou)) && (!p.dataPagamento || p.dataPagamento > fim));
  const soma = ja.reduce((s, p) => s + p.valor, 0);
  const fracao = soma / ctx.valorFim;
  if (!(fracao >= 0.0015)) return null;
  const pag = ja.map((p) => p.dataPagamento).filter(Boolean).sort();
  const quem = [...new Set(ja.map((p) => p.ticker).filter(Boolean))];
  const texto = `${ctx.formatarMoeda(soma)} em proventos${quem.length ? ` de ${juntarLista(quem.slice(0, 3))}${quem.length > 3 ? ' e outros' : ''}` : ''} já passaram da data-com e só caem na conta ${pag.length ? `a partir de ${diaMes(pag[0])}` : 'no pagamento'}: a cota já descontou esse valor, então o gráfico mostra ~${formatPctAbs(fracao, 2)} a menos até lá.`;
  return { tipo: 'proventosAReceber', tom: 'neutro', texto, resumo: `${formatPctAbs(fracao, 1)} em proventos a receber`, peso: fracao >= 0.005 ? 67 : 54, criterios: ['diag_data_ex', 'total_return_consistencia'] };
}

function regraImpostos(ctx) {
  const { m, familia } = ctx;
  if (familia === 'fiis' && ctx.meses >= 12 && num(m.pctCdi) && m.pctCdi >= 70 && m.pctCdi < 110) {
    const liq = m.pctCdi / 0.85;
    return { tipo: 'impostos', tom: 'neutro', texto: `Contra a renda fixa, compare líquido: os rendimentos de FII são isentos e o CDI paga ~15% de IR em prazos longos, então ${formatNumeroBR(m.pctCdi, 0)}% do CDI bruto equivalem a ~${formatNumeroBR(liq, 0)}% do CDI líquido.`, resumo: 'FII isento vs CDI tributado', peso: 44, criterios: ['ir_acoes_fii_br', 'diag_fii_vs_rf_liquida'] };
  }
  if (/^rf/.test(familia || '') && ctx.rf && ctx.rf.isento && num(m.pctCdi)) {
    const aliq = aliquotaIr(ctx.spanDias);
    return { tipo: 'impostos', tom: 'neutro', texto: `${ctx.rf.nome && /lci|lca|cri|cra/i.test(ctx.rf.nome) ? 'O título' : 'Esse título'} é isento de IR: ${formatNumeroBR(m.pctCdi, 0)}% do CDI equivalem a ~${formatNumeroBR(m.pctCdi / (1 - aliq), 0)}% num CDB tributado no mesmo prazo (IR de ${formatNumeroBR(aliq * 100, 1)}%).`, resumo: 'isento de IR', peso: 48, criterios: ['aliquota_ir_rf'] };
  }
  if (familia === 'eua' && ctx.bench && !ctx.bench.precoSo && ctx.meses >= 12 && num(m.excessoAa) && m.excessoAa < 0 && m.excessoAa > -1.5) {
    return { tipo: 'impostos', tom: 'neutro', texto: 'Os EUA retêm 30% dos dividendos na fonte; só isso deixa uma carteira que replica o índice ~0,4 p.p. por ano atrás dele.', resumo: '30% retidos nos dividendos', peso: 46, criterios: ['ir_exterior'] };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Métricas da série (pra regras e pra linha de números do card)
// ---------------------------------------------------------------------------

function calcularMetricas(ctx) {
  const { curva, bench, cdi, ipca } = ctx;
  const m = { retorno: ctx.R, spanDias: ctx.spanDias };
  const anos = ctx.spanDias / 365.25;
  if (anos >= 1) m.anualizado = (1 + ctx.R) ** (1 / anos) - 1;
  m.drawdown = calcularDrawdown(curva);
  if (cdi && num(cdi.ret) && cdi.ret > 0.001 && ctx.R > 0) m.pctCdi = (ctx.R / cdi.ret) * 100;
  // rentabilidade real: só em reais (IPCA é inflação do real - em dólar não se aplica)
  if (ipca && num(ipca.ret) && ctx.spanDias >= 85 && ctx.moeda !== 'USD') { m.ipca = ipca.ret; m.real = (1 + ctx.R) / (1 + ipca.ret) - 1; }

  // volatilidade (pregões) + o índice na mesma grade de datas
  const grade = ehSerieDiaria(curva) ? retornosDiarios(curva) : [];
  if (grade.length >= 60) {
    m.vol = volatilidadeAnual(grade.map((x) => x.r));
    if (bench && bench.tipo !== 'taxa') {
      const rb = grade.map((x) => { const a = nivelEm(bench, x.de); const b = nivelEm(bench, x.data); return num(a) && num(b) && a > 0 ? b / a - 1 : null; });
      if (rb.filter(num).length >= 40) m.volBench = volatilidadeAnual(rb.filter(num));
    }
  }
  if (bench && bench.tipo !== 'taxa') {
    const cb = curva.map((p) => { const v = nivelEm(bench, p.data); return { data: p.data, f: v }; }).filter((p) => num(p.f) && p.f > 0);
    const ddB = calcularDrawdown(cb);
    if (ddB) m.mddBench = ddB.dd;
  }

  // mensal: Sharpe/Sortino, beta/alfa, consistência, tracking error
  const amostras = amostrasMensais(curva);
  if (amostras.length >= 4) {
    const rp = [];
    const rc = [];
    const rbm = [];
    for (let i = 1; i < amostras.length; i += 1) {
      const a = amostras[i - 1];
      const b = amostras[i];
      rp.push(b.f / a.f - 1);
      rc.push(cdi ? retornoEntre(cdi, a.data, b.data) : null);
      rbm.push(bench ? retornoEntre(bench, a.data, b.data) : null);
    }
    m.nMeses = rp.length;
    m.mesesNegativos = rp.filter((r) => r < -0.0001).length;
    if (bench) {
      const pares = rp.map((r, i) => [r, rbm[i]]).filter(([, b]) => num(b));
      m.nMesesComparados = pares.length;
      m.mesesAcima = pares.filter(([a, b]) => a > b).length;
      if (pares.length) m.hit = m.mesesAcima / pares.length;
      if (pares.length >= 12) {
        const te = desvio(pares.map(([a, b]) => a - b)) * Math.sqrt(12);
        m.te = te;
        if (anos > 0) m.margem = (1.96 * te * 100) / Math.sqrt(Math.max(anos, 1));
      }
    }
    if (cdi && rc.every(num) && rp.length >= 12) {
      const ss = calcularSharpeSortino(rp, rc);
      if (ss) { m.sharpe = ss.sharpe; m.sortino = ss.sortino; }
      if (bench && bench.tipo !== 'taxa' && rbm.every(num)) {
        const sb = calcularSharpeSortino(rbm, rc);
        if (sb) m.sharpeBench = sb.sharpe;
      }
      // beta/alfa (Jensen) mensal, contra o índice de mercado da classe
      if (bench && bench.tipo === 'mercado' && rbm.every(num) && rp.length >= 24) {
        const reg = regressaoLinear(rbm.map((r, i) => r - rc[i]), rp.map((r, i) => r - rc[i]));
        if (reg) { m.beta = reg.b; m.alfa = (1 + reg.a) ** 12 - 1; m.tAlfa = reg.tA; }
      }
    }
  }
  // beta com 12–24 meses: retornos semanais (blocos de 5 pregões) - menos ruído de datas que o diário
  if (!num(m.beta) && bench && bench.tipo === 'mercado' && ctx.meses >= 12 && grade.length >= 120) {
    const xs = [];
    const ys = [];
    for (let i = 5; i < grade.length; i += 5) {
      const de = grade[i - 5].de;
      const ate = grade[i - 1].data;
      const a = curva.find((p) => p.data === de);
      const b = curva.find((p) => p.data === ate);
      const rb = retornoEntre(bench, de, ate);
      if (a && b && num(rb)) { ys.push(b.f / a.f - 1); xs.push(rb); }
    }
    const reg = regressaoLinear(xs, ys);
    if (reg && xs.length >= 20) m.beta = reg.b;
  }

  // TIR e PME (precisa de valor e fluxo)
  const v0 = curva[0].valor;
  const vf = curva[curva.length - 1].valor;
  if (num(v0) && v0 > 0 && num(vf)) {
    const fluxos = [{ data: curva[0].data, valor: v0 }];
    let somaAbs = 0;
    for (let i = 1; i < curva.length; i += 1) if (num(curva[i].fluxo) && curva[i].fluxo !== 0) { fluxos.push({ data: curva[i].data, valor: curva[i].fluxo }); somaAbs += Math.abs(curva[i].fluxo); }
    m.fluxosRelevantes = somaAbs >= 0.1 * Math.max(v0, Math.abs(vf));
    if (m.fluxosRelevantes && ctx.spanDias >= 28) {
      const fim = curva[curva.length - 1].data;
      const tir = calcularTir(fluxos, vf, fim);
      if (num(tir)) { m.tir = tir; m.tirPeriodo = (1 + tir) ** (ctx.spanDias / 365) - 1; }
      if (bench) m.pme = calcularPme(fluxos, vf, fim, (d) => nivelEmOuDepois(bench, d, fim));
    }
  }

  // câmbio
  if (ctx.cambioIdx && ctx.familia === 'eua') {
    const dfx = retornoEntre(ctx.cambioIdx, curva[0].data, curva[curva.length - 1].data);
    if (num(dfx)) {
      m.dfx = dfx;
      m.rUsd = ctx.moeda === 'USD' ? ctx.R : (1 + ctx.R) / (1 + dfx) - 1;
    }
  }
  return m;
}

/** Linha de números do card: só as métricas que já têm prazo pra fazer sentido. */
function montarDestaques(ctx) {
  const { m, bench } = ctx;
  const out = [];
  const push = (rotulo, valor, crit) => { if (valor) out.push({ rotulo, valor, criterio: crit }); };
  if (num(m.anualizado)) push('Ao ano', formatPctSinal(m.anualizado, 1), 'retorno_anualizado');
  if (num(m.real)) push('Real (− IPCA)', formatPctSinal(m.real, 1), 'retorno_real_ipca');
  if (num(m.vol) && ctx.spanDias >= 85) push('Volatilidade', `${formatPctAbs(m.vol, 1)} a.a.`, 'volatilidade_anualizada');
  if (m.drawdown && m.drawdown.dd >= 0.001) push('Maior queda', `−${formatPctAbs(m.drawdown.dd, 1)}`, 'max_drawdown');
  // Sharpe: só com 24+ meses (base: "36 meses, mínimo 24") e fora da renda
  // fixa/reserva - num pós-fixado a oscilação é quase zero e o número explode
  if (num(m.sharpe) && ctx.meses >= 24 && !/^(rf|reserva)/.test(ctx.familia || '')) push('Sharpe', nr(m.sharpe), 'sharpe');
  if (num(m.beta) && bench) push(`Beta (${bench.nome})`, nr(m.beta), 'beta');
  if (num(m.hit) && m.nMesesComparados >= 12 && bench) push(`Meses acima ${bench.tipo === 'composto' ? 'da referência' : `do ${bench.nome}`}`, `${m.mesesAcima}/${m.nMesesComparados}`, 'consistencia_meses_acima');
  if (num(m.tir) && m.fluxosRelevantes) push('TIR', ctx.spanDias >= 365 ? `${formatPctSinal(m.tir, 1)} a.a.` : formatPctSinal(m.tirPeriodo, 1), 'retorno_mwr_tir');
  if (num(m.rUsd) && ctx.moeda !== 'USD') push('Em US$', formatPctSinal(m.rUsd, 1), 'efeito_cambio');
  return out.slice(0, 7);
}

// ---------------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------------

export function analisarSerie({
  serie, indices = {}, periodo = null, nome = 'A carteira', formatarMoeda = formatBRL, componentes = null, contexto = null, indiceReferencia = null,
  classe = null, subtipo = null, referencias = null, cambio = null, moeda = 'BRL', benchmark = null, benchmarkComponentes = null,
  proventosAReceber = null, rf = null, hoje = null,
} = {}) {
  const curva = curvaDaSerie(serie);
  if (curva.length < 2) return { tom: 'neutro', resumo: '', pontos: [], metricas: null, destaques: [], criterios: [] };
  const datas = (serie || []).map((p) => p && p.data);
  const R = curva[curva.length - 1].f - 1;
  const de = curva[0].data;
  const ate = curva[curva.length - 1].data;
  const spanDias = diasEntre(de, ate);
  // meses "cheios" pras regras de prazo: o filtro "12 meses" tem 365 dias (11,99 meses)
  const meses = Math.round(spanDias / 30.4375);
  const rfN = normalizarRf(rf);
  const familia = familiaAnalise(classe, subtipo, rfN);

  const { lista, cambioIdx } = montarIndices({ indices, referencias, datas, cambio, moeda, familia, rf: rfN, curva, componentes, benchmarkComponentes });
  lista.forEach((i) => { i.ret = retornoEntre(i, de, ate); });
  const retIndices = lista.filter((i) => i.desenhado && num(i.ret));
  const bench = familia ? escolherBenchmark(lista, familia, moeda, benchmark) : null;
  const cdi = lista.find((i) => /^cdi$/i.test(i.nome) && num(i.ret)) || null;
  const ipca = lista.find((i) => /^ipca$/i.test(i.nome) && num(i.ret)) || null;

  const ctxContexto = contexto && Array.isArray(contexto.serie) ? contexto : null;
  const datasCtx = ctxContexto ? ctxContexto.serie.map((p) => p && p.data) : datas;
  const indicesContexto = Object.entries((ctxContexto && ctxContexto.indices) || indices || {})
    .map(([nomeI, l]) => criarIndice(nomeI, l, datasCtx));
  const contextoCurva = ctxContexto ? curvaDaSerie(ctxContexto.serie) : [];
  let volContexto = null;
  if (contextoCurva.length > curva.length) {
    const rc = retornosDiarios(contextoCurva);
    if (rc.length >= 40) volContexto = volatilidadeAnual(rc.map((x) => x.r));
  }

  const ctx = {
    curva, R, spanDias, meses, retIndices, indicesContexto, nome, formatarMoeda, componentes, indiceReferencia,
    descPeriodo: descreverPeriodo(periodo), contextoCurva, volContexto,
    familia, classe, lista, bench, cdi, ipca, cambioIdx, moeda, rf: rfN, forcado: benchmark, hoje: typeof hoje === 'string' ? hoje : null,
    julgar: familia ? mesesParaJulgar(familia) : 12,
    // proventos a receber: sem data-com, só conta o que já passou dela com
    // certeza - os "provisionados" da exportação da B3 (fonte 'B3') ou quem
    // vier com dataComPassou:true
    proventosAReceber: Array.isArray(proventosAReceber) ? proventosAReceber.filter(Boolean).map((p) => ({
      ...p, dataCom: paraIso(p.dataCom), dataPagamento: paraIso(p.dataPagamento),
      dataComPassou: p.dataComPassou === true || (!paraIso(p.dataCom) && /^b3$/i.test(String(p.fonte || ''))),
    })) : null,
    valorFim: curva[curva.length - 1].valor,
  };
  ctx.m = calcularMetricas(ctx);

  const comparacao = (familia && bench && regraComparacaoClasse(ctx)) || regraComparacao(ctx);
  if (familia && !bench && comparacao.tom !== 'neutro' && meses < ctx.julgar) comparacao.tom = 'neutro';
  const itensCambio = regrasCambioJanelas(ctx); // 07/10/2026: dólar x preço (dia/mês/período)
  let movimento = regraMovimento(ctx);
  // a queda/alta brusca explicada pelo câmbio vira o item do dia (mais claro), sem repetir
  if (movimento && itensCambio.length && (movimento.criterios || []).includes('diag_cambio')) movimento = null;
  const candidatos = [
    comparacao,
    movimento,
    regraFluxos(ctx),
    regraFluxoRecente(ctx),
    regraQueda(ctx, movimento),
    regraTendencia(ctx),
    regraConcentracao(ctx),
  ];
  if (familia) {
    candidatos.push(regraReal(ctx), regraRisco(ctx), regraSharpe(ctx), regraAlfaBeta(ctx), regraConsistencia(ctx), regraTir(ctx),
      itensCambio.length ? null : regraCambio(ctx), ...itensCambio, regraDescolamento(ctx), regraProventosAReceber(ctx), regraImpostos(ctx));
  }
  const validos = candidatos.filter(Boolean);
  const pontos = validos.sort((a, b) => b.peso - a.peso).slice(0, MAX_PONTOS);
  if (!pontos.includes(comparacao)) pontos[pontos.length - 1] = comparacao;
  // a comparação com os índices abre a lista (é a frase-base do resumo); o resto por importância
  pontos.sort((a, b) => (a === comparacao ? -1 : b === comparacao ? 1 : b.peso - a.peso));

  const alertas = pontos.filter((p) => p !== comparacao && p.tom === 'atencao' && p.peso >= 60);
  const destaque = alertas[0] || pontos.find((p) => p !== comparacao && p.peso >= 80);
  const resumo = destaque ? `${comparacao.resumo} · ${destaque.resumo}` : comparacao.resumo;
  let tom = comparacao.tom;
  if (alertas.length) tom = 'atencao';
  else if (tom === 'atencao' && pontos.some((p) => p.tipo === 'movimento' && p.tom === 'bom')) tom = 'neutro';

  const destaques = familia ? montarDestaques(ctx) : [];
  const usados = [];
  [...pontos.flatMap((p) => p.criterios || []), ...destaques.map((d) => d.criterio)].forEach((id) => { if (id && criterio(id) && !usados.includes(id)) usados.push(id); });

  const m = ctx.m;
  return {
    tom,
    resumo: resumo.charAt(0).toUpperCase() + resumo.slice(1),
    pontos,
    metricas: {
      retorno: R, spanDias, indices: Object.fromEntries(retIndices.map((i) => [i.nome, i.ret])),
      benchmark: bench ? { nome: bench.nome, retorno: bench.ret } : null,
      anualizado: m.anualizado ?? null, excesso: m.excesso ?? null, excessoAa: m.excessoAa ?? null, pctCdi: m.pctCdi ?? null,
      real: m.real ?? null, ipca: m.ipca ?? null, vol: m.vol ?? null, volBench: m.volBench ?? null,
      maxDrawdown: m.drawdown ? m.drawdown.dd : null, mddBench: m.mddBench ?? null,
      sharpe: m.sharpe ?? null, sortino: m.sortino ?? null, sharpeBench: m.sharpeBench ?? null,
      beta: m.beta ?? null, alfa: m.alfa ?? null, tAlfa: m.tAlfa ?? null, te: m.te ?? null, margem: m.margem ?? null,
      mesesAcima: m.mesesAcima ?? null, mesesComparados: m.nMesesComparados ?? null,
      tir: m.tir ?? null, pme: m.pme || null, dfx: m.dfx ?? null, rUsd: m.rUsd ?? null,
    },
    destaques,
    criterios: usados,
    benchmark: bench ? { nome: bench.nome, porQue: (BENCHMARK_POR_CLASSE[familia === 'eua' && moeda === 'USD' ? 'eua-usd' : familia] || BENCHMARK_POR_CLASSE[String(familia).replace(/-.*$/, '')] || {}).porQue || '' } : null,
    classe: classe || null,
  };
}

/**
 * Proventos a receber de home.proventosAnunciados (Proventos.gs!
 * montarProventosAnunciados_) no formato de `proventosAReceber`, só das
 * `classes` pedidas ('acoes' | 'fiis' | 'acoesEua'; sem classes = todas)
 * e/ou de um `ticker`. null quando não há nada.
 */
export function proventosAReceberDe(anunciados, { classes = null, ticker = null } = {}) {
  const lista = anunciados && Array.isArray(anunciados.aReceber) ? anunciados.aReceber : null;
  if (!lista) return null;
  const tk = ticker ? String(ticker).toUpperCase() : null;
  const out = lista
    .filter((p) => p && num(p.valor) && p.valor > 0 && (!classes || classes.includes(p.classe)) && (!tk || String(p.ticker || '').toUpperCase() === tk))
    .map((p) => ({ ticker: p.ticker, dataCom: p.dataCom || '', dataPagamento: p.dataPagamento || '', valor: p.valor, fonte: p.fonte || '' }));
  return out.length ? out : null;
}

// ---------------------------------------------------------------------------
// Renda passiva (proventos mês a mês) - complementa analisarProventosMensais
// ---------------------------------------------------------------------------

/**
 * Pontos de renda passiva (base: renda_passiva_total, renda_passiva_real,
 * renda_por_cota_constante, diag_renda_cresce_so_aporte) a partir dos
 * proventos por mês ('yyyy-MM' -> R$, só o já pago). Compara os 12 meses
 * FECHADOS até o mês passado com os 12 anteriores; `ipca12m` (fração)
 * opcional pra versão real; `porCotaMes` ('yyyy-MM' -> R$ por cota, um
 * ativo) opcional pra separar o que veio de aportes do que veio do
 * próprio ativo pagando mais.
 * -> [{ tipo, tom, texto, resumo, peso, criterios }]
 */
export function analisarRendaPassiva({ porMes = {}, mesAtual, ipca12m = null, porCotaMes = null } = {}) {
  if (!mesAtual || !porMes) return [];
  const somarMes = (ym, k) => { const [a, mm] = ym.split('-').map(Number); const d = new Date(Date.UTC(a, mm - 1 + k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
  const janela = (fim) => Array.from({ length: 12 }, (_, i) => somarMes(fim, -11 + i));
  const ultimo = somarMes(mesAtual, -1);
  const atual = janela(ultimo);
  const anterior = janela(somarMes(ultimo, -12));
  const comDado = Object.keys(porMes).filter((k) => porMes[k] > 0).sort();
  if (!comDado.length || comDado[0] > anterior[0]) return []; // precisa de 24 meses de histórico
  const soma = (ms, mapa) => ms.reduce((s, k) => s + (num(mapa[k]) ? mapa[k] : 0), 0);
  const r12 = soma(atual, porMes);
  const r12a = soma(anterior, porMes);
  if (!(r12a > 0)) return [];
  const g = r12 / r12a - 1;
  const out = [];
  const criterios = ['renda_passiva_total'];
  let tom = g >= 0 ? (num(ipca12m) && g >= ipca12m ? 'bom' : 'neutro') : 'atencao';
  let texto = `Nos últimos 12 meses fechados entraram ${formatBRL(r12)} em proventos — ${formatPctSinal(g, 1)} contra os 12 meses anteriores (${formatBRL(r12a)})`;
  if (num(ipca12m)) {
    const real = (1 + g) / (1 + ipca12m) - 1;
    texto += `; descontado o IPCA (${formatPctSinal(ipca12m, 1)}), ${real >= 0 ? 'crescimento' : 'queda'} real de ${formatPctAbs(real, 1)}`;
    criterios.push('renda_passiva_real');
    if (real < -0.05) tom = 'atencao';
  }
  texto += '.';
  if (porCotaMes) {
    const c12 = soma(atual, porCotaMes);
    const c12a = soma(anterior, porCotaMes);
    if (c12a > 0) {
      const gc = c12 / c12a - 1;
      criterios.push('renda_por_cota_constante');
      texto += ` Por cota, o pagamento foi de ${formatBRL(c12a)} para ${formatBRL(c12)} (${formatPctSinal(gc, 1)})`;
      if (g >= (num(ipca12m) ? ipca12m : 0) && gc < -0.02) {
        texto += ' — a renda subiu só pelos aportes; o próprio ativo está pagando menos.';
        tom = 'atencao';
        criterios.push('diag_renda_cresce_so_aporte');
      } else texto += gc >= 0 ? ' — o ativo também está pagando mais.' : '.';
    }
  }
  out.push({ tipo: 'rendaPassiva', tom, texto, resumo: `renda de 12 meses ${formatPctSinal(g, 0)}`, peso: 59, criterios });
  return out;
}

/**
 * Junta pontos extras (ex.: analisarRendaPassiva) numa análise já pronta,
 * mantendo o 1º ponto e o limite de 4; recalcula os critérios usados.
 */
export function complementarAnalise(analise, extras) {
  if (!analise || !Array.isArray(analise.pontos) || !analise.pontos.length || !Array.isArray(extras) || !extras.length) return analise;
  const [primeiro, ...resto] = analise.pontos;
  const lista = [primeiro, ...[...resto, ...extras].sort((a, b) => (b.peso || 0) - (a.peso || 0))].slice(0, MAX_PONTOS);
  const usados = [...(analise.criterios || [])];
  lista.flatMap((p) => p.criterios || []).forEach((id) => { if (criterio(id) && !usados.includes(id)) usados.push(id); });
  let tom = analise.tom;
  if (extras.some((p) => lista.includes(p) && p.tom === 'atencao' && (p.peso || 0) >= 60) && tom === 'bom') tom = 'neutro';
  return { ...analise, pontos: lista, criterios: usados, tom };
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const ICONE = {
  bom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  atencao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  neutro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
};
const TOM_TEXTO = { bom: 'a favor', atencao: 'atenção', neutro: 'informativo' };

/** Link principal de um critério: a fonte da Suno quando houver (Tiago confia mais nela), senão a 1ª. */
function linkDoCriterio(c) {
  const fontes = (c && c.fontes) || [];
  return fontes.find((f) => /suno\.com\.br/.test(f.url)) || fontes[0] || null;
}

/** HTML do card (string) - pra quem monta a página por innerHTML. */
export function htmlAnalise(analise, { aberto = false, titulo = 'Análise' } = {}) {
  if (!analise || !analise.pontos || !analise.pontos.length) return '';
  const itens = analise.pontos.map((p) => `<li class="ag-ponto ag-${p.tom}"><span class="ag-ico" title="${TOM_TEXTO[p.tom] || ''}">${ICONE[p.tom] || ICONE.neutro}</span><span class="ag-txt">${esc(p.texto)}</span></li>`).join('');
  const destaques = Array.isArray(analise.destaques) && analise.destaques.length
    ? `<dl class="ag-metricas">${analise.destaques.map((d) => { const c = criterio(d.criterio); return `<div class="ag-metrica"${c && c.porQue ? ` title="${esc(c.porQue)}"` : ''}><dt>${esc(d.rotulo)}</dt><dd>${esc(d.valor)}</dd></div>`; }).join('')}</dl>`
    : '';
  const crits = (analise.criterios || []).map((id) => criterio(id)).filter((c) => c && c.curto);
  const vistos = new Set();
  const links = crits.filter((c) => (vistos.has(c.curto) ? false : vistos.add(c.curto))).map((c) => {
    const f = linkDoCriterio(c);
    const titulo = [c.nome, c.porQue].filter(Boolean).join(' — ');
    return f
      ? `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer" title="${esc(titulo)}">${esc(c.curto)}</a>`
      : `<span title="${esc(titulo)}">${esc(c.curto)}</span>`;
  });
  const criteriosHtml = links.length ? `<p class="ag-criterios"><span>Critérios usados:</span> ${links.join('<i aria-hidden="true">·</i>')}</p>` : '';
  return `
    <details class="ag ag-tom-${analise.tom}"${aberto ? ' open' : ''}>
      <summary class="ag-cab">
        <span class="ag-selo"><i aria-hidden="true"></i>${esc(titulo)}</span>
        <span class="ag-resumo">${esc(analise.resumo)}</span>
        <span class="ag-ver" aria-hidden="true"><span class="ag-ver-abrir">Ver análise</span><span class="ag-ver-fechar">Ocultar</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
      </summary>
      <ul class="ag-pontos">${itens}</ul>
      ${destaques}
      ${criteriosHtml}
      <p class="ag-nota">Leitura automática dos números deste gráfico. Não é recomendação.</p>
    </details>`;
}

/**
 * Desenha (ou esvazia, sem análise) o card em `container`. Lembra se estava
 * aberto entre redesenhos (troca de período, "Atualizar dados").
 */
export function renderAnalise(doc, container, analise, opcoes = {}) {
  if (!container) return;
  garantirEstilosComponentesGrafico(doc);
  const html = htmlAnalise(analise, { ...opcoes, aberto: !!container._agAberto });
  container.innerHTML = html;
  container.hidden = !html;
  const det = container.querySelector('details.ag');
  if (det) det.addEventListener('toggle', () => { container._agAberto = det.open; });
}

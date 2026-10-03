/**
 * analise-grafico.js — card "Análise" embaixo dos gráficos de crescimento
 * (02/10/2026, pedido do Tiago: "Em todos os gráficos de análise de
 * crescimento (home, carteiras, outros), embaixo do gráfico um card de
 * análise como o das tabelas: o que está sendo analisado vs os índices do
 * gráfico, possivelmente vários pontos, ex. 'no gráfico de renda fixa, meu
 * índice caiu drasticamente nos últimos dias por tal razão'. Bom algoritmo;
 * design cuidadoso, não invasivo.").
 *
 * Dois pedaços, sem depender de página nenhuma:
 *  1) analisarSerie(...) - PURO (sem DOM): lê a série e os índices e devolve
 *     uma lista priorizada de pontos (no máximo 4), cada um com tom
 *     'bom' | 'neutro' | 'atencao', + uma linha de resumo;
 *  2) renderAnalise(doc, container, analise) - desenha o card colapsável
 *     ("Ver análise"), mesmo visual do painel "momento de aporte" das
 *     tabelas (Aportes/Radar: selo + sinais com ícone) - CSS em
 *     assets/css/componentes-grafico.css (.ag-*), injetado sozinho se a
 *     página ainda não carregou.
 *
 * API
 *   import { analisarSerie, renderAnalise } from '../analise-grafico.js';
 *
 *   const analise = analisarSerie({
 *     serie: [{ data: '2026-09-30', valor: 1000, retorno: 0, fluxo: 0, pregao: true }, ...],
 *       // valor   = valor bruto (R$) - opcional, habilita as regras de aporte/resgate
 *       // retorno = % ACUMULADO desde a base do período (normalmente 0 no 1º ponto), em pontos (2.1 = +2,1%) - se
 *       //           não vier, é calculado de valor+fluxo (retorno ponderado no tempo)
 *       // fluxo   = dinheiro que entrou (+) ou saiu (−) no dia (aporte/resgate)
 *       // pregao  = opcional; se existir, a volatilidade usa só os dias de pregão
 *     indices: { CDI: [{ data, retorno } | { data, valor }], Ibovespa: [...] },
 *       // retorno em % acumulado OU valor (nível do índice) - casados pela data
 *     periodo: 'mes' | '30d' | '6m' | '12m' | '3a' | 'tudo' | { inicio, fim },
 *     nome: 'A carteira',                // sujeito das frases
 *     formatarMoeda: formatBRL,          // US$ em Ações EUA
 *     componentes: { 'Ações': [{ data, valor, fluxo }], ... }, // opcional (de onde veio o resultado)
 *     contexto: { serie, indices },      // opcional: série mais longa terminando no mesmo dia,
 *                                        // só pra medir a oscilação típica (quedas/altas bruscas)
 *     indiceReferencia: 'CDI',           // opcional: índice da regra de tendência
 *   });
 *   // -> { tom, resumo, pontos: [{ tipo, tom, texto, resumo, peso }], metricas }
 *   renderAnalise(doc, containerEmbaixoDoGrafico, analise);
 *
 * Regras (cada uma vira no máximo 1 ponto; testes em tests/analise-grafico.test.js):
 *  - comparacao:  rendimento no período vs cada índice (p.p.; "% do CDI");
 *  - movimento:   queda/alta brusca nos últimos 3 pregões vs a oscilação
 *                 típica (z-score), com causa provável - mercado (índice
 *                 andou junto) x a própria carteira, e qual componente puxou;
 *  - fluxos:      quanto da variação em R$ foi aporte/resgate e não preço;
 *  - fluxoRecente: aporte/resgate grande nos últimos dias (salto que não é rendimento);
 *  - queda:       maior queda do período (pico → vale) e se já recuperou;
 *  - tendencia:   últimos 3 meses vs o período inteiro, contra o índice de referência;
 *  - concentracao: resultado concentrado num componente (classe/ativo).
 */
import { formatBRL, formatNumeroBR, formatDateBR } from './format.js';
import { ehPeriodoPersonalizado, garantirEstilosComponentesGrafico } from './periodo-personalizado.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const MAX_PONTOS = 4;
const N_RECENTE = 3; // pregões da janela "últimos dias"
const MIN_RETORNOS_BASE = 12;
const INDICES_TAXA = /^(cdi|selic|ipca|poupan)/i; // índices "de taxa" (sem oscilação de mercado)

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

function pct(fracao, casas = 2) {
  if (!num(fracao)) return '—';
  const v = fracao * 100;
  const t = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const zero = Math.abs(v) < 0.5 * 10 ** -casas; // "0,00%" sem sinal
  return `${zero ? '' : (v > 0 ? '+' : '−')}${t}%`;
}
function pctAbs(fracao, casas = 2) {
  return `${Math.abs(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}
function pp(pontos) {
  return `${formatNumeroBR(Math.abs(pontos), Math.abs(pontos) >= 10 ? 1 : 2)} p.p.`;
}
function moedaSinal(v, fmt) { return `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`; }
function diaMes(iso) { return typeof iso === 'string' && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—'; }
function diaMesAno(iso, anoDiferente) { return anoDiferente ? formatDateBR(iso) : diaMes(iso); }

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

// ---------------------------------------------------------------------------
// Séries
// ---------------------------------------------------------------------------

/** Curva de crescimento [{ data, f, valor, fluxo, pregao }] (f = 1 no início). */
export function curvaDaSerie(serie) {
  const pts = (serie || []).filter((p) => p && typeof p.data === 'string');
  const temRetorno = pts.some((p) => num(p.retorno));
  const out = [];
  if (temRetorno) {
    pts.forEach((p) => { if (num(p.retorno)) out.push({ data: p.data, f: 1 + p.retorno / 100, valor: num(p.valor) ? p.valor : null, fluxo: num(p.fluxo) ? p.fluxo : 0, pregao: p.pregao }); });
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
    out.push({ data: p.data, f, valor: p.valor, fluxo, pregao: p.pregao });
  });
  return out;
}

/** Mapa data -> nível normalizado de um índice. */
function mapaIndice(lista, datasSerie) {
  const m = new Map();
  if (!Array.isArray(lista)) return m;
  lista.forEach((p, i) => {
    if (num(p)) { if (datasSerie && datasSerie[i]) m.set(datasSerie[i], p); return; }
    if (!p || typeof p.data !== 'string') return;
    if (num(p.retorno)) m.set(p.data, 1 + p.retorno / 100);
    else if (num(p.valor) && p.valor !== 0) m.set(p.data, p.valor);
  });
  return m;
}

/** Último nível conhecido do índice até a data (inclusive). */
function nivelAte(mapa, datasOrdenadas, data) {
  let v = null;
  for (let i = 0; i < datasOrdenadas.length && datasOrdenadas[i] <= data; i += 1) {
    const x = mapa.get(datasOrdenadas[i]);
    if (num(x)) v = x;
  }
  return v;
}

function retornoIndiceEntre(mapa, de, ate) {
  const datas = [...mapa.keys()].sort();
  if (!datas.length) return null;
  let a = mapa.get(de);
  if (!num(a)) {
    // 1º nível disponível a partir de "de" (índice pode começar depois, ex.: Ibovespa sem pregão no dia)
    const d = datas.find((x) => x >= de && x <= ate);
    a = d ? mapa.get(d) : nivelAte(mapa, datas, de);
  }
  const b = nivelAte(mapa, datas, ate);
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

function desvio(lista) {
  if (lista.length < 2) return 0;
  const m = lista.reduce((s, x) => s + x, 0) / lista.length;
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
// Regras
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
  const verbo = R >= 0 || pct(R) === pct(0) ? 'rendeu' : 'recuou';
  const texto = partes.length
    ? `${nome} ${verbo} ${pct(R)} ${descPeriodo} — ${juntarLista(partes)}.`
    : `${nome} ${verbo} ${pct(R)} ${descPeriodo}.`;
  let tom = 'neutro';
  if (retIndices.length) {
    if (acima.length && !abaixo.length) tom = 'bom';
    else if (abaixo.length && !acima.length) tom = 'atencao';
  } else if (R < -0.01) tom = 'atencao';
  const resumo = `${pct(R)} ${descPeriodo}${curtas.length ? `, ${juntarLista(curtas)}` : ''}`;
  return { tipo: 'comparacao', tom, texto, resumo, peso: 60 };
}

function regraMovimento(ctx) {
  const base = ctx.contextoCurva.length >= ctx.curva.length ? ctx.contextoCurva : ctx.curva;
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
  const vezes = Number.isFinite(z) ? ` — cerca de ${formatNumeroBR(Math.min(z, 99), 0)}x a oscilação típica (±${pctAbs(tipico, 1)} em ${N_RECENTE} pregões)` : ' — fora do padrão da série, que quase não oscila';
  let texto = `Nos últimos ${N_RECENTE} pregões (${diaMes(de)} a ${diaMes(ate)}) ${caiu ? 'caiu' : 'subiu'} ${pctAbs(mov)}${vezes}.`;

  // causa provável 1: o mercado andou junto?
  const mercados = ctx.indicesContexto.filter((i) => !INDICES_TAXA.test(i.nome));
  const taxas = ctx.indicesContexto.filter((i) => INDICES_TAXA.test(i.nome));
  let causa = '';
  if (mercados.length) {
    const comMov = mercados.map((i) => ({ nome: i.nome, r: retornoIndiceEntre(i.mapa, de, ate) })).filter((i) => num(i.r));
    if (comMov.length) {
      comMov.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
      const m = comMov[0];
      if (Math.sign(m.r) === Math.sign(mov) && Math.abs(m.r) >= 0.5 * Math.abs(mov)) causa = ` Acompanhou o mercado: o ${m.nome} ${m.r < 0 ? 'caiu' : 'subiu'} ${pctAbs(m.r)} no mesmo intervalo.`;
      else causa = ` O mercado não explica: o ${m.nome} variou ${pct(m.r)} no mesmo intervalo — o movimento foi da própria carteira.`;
    }
  } else if (taxas.length) {
    const t = taxas.map((i) => ({ nome: i.nome, r: retornoIndiceEntre(i.mapa, de, ate) })).find((i) => num(i.r));
    if (t) causa = ` No mesmo intervalo o ${t.nome} ${t.r >= 0 ? 'rendeu' : 'variou'} ${pct(t.r)}, então não é o índice: ${caiu ? 'é marcação a mercado dos títulos (preço de venda antecipada), que volta ao longo do tempo se o título for levado ao vencimento' : 'é marcação a mercado favorável dos títulos'}.`;
  }
  // causa provável 2: qual componente puxou
  let puxou = '';
  if (ctx.componentes) {
    const contrib = Object.entries(ctx.componentes)
      .map(([nomeC, lista]) => ({ nome: nomeC, g: ganhoComponente(lista, de, ate) }))
      .filter((x) => num(x.g));
    const total = contrib.reduce((s, x) => s + x.g, 0);
    const mesmos = contrib.filter((x) => Math.sign(x.g) === Math.sign(mov)).sort((a, b) => Math.abs(b.g) - Math.abs(a.g));
    if (contrib.length >= 2 && mesmos.length && Math.abs(total) > 0 && Math.abs(mesmos[0].g) >= 0.5 * Math.abs(total) && Math.sign(total) === Math.sign(mov)) {
      puxou = ` A maior parte veio de ${mesmos[0].nome} (${moedaSinal(mesmos[0].g, ctx.formatarMoeda)}).`;
    }
  }
  texto += causa + puxou;
  return {
    tipo: 'movimento',
    tom: caiu ? 'atencao' : 'bom',
    texto,
    resumo: `${caiu ? 'queda' : 'alta'} forte nos últimos dias (${pct(mov)})`,
    peso: 85 + Math.min(15, Number.isFinite(z) ? z : 15),
    dados: { mov, z, sigma, de, ate },
  };
}

function regraFluxos(ctx) {
  const c = ctx.curva;
  if (c.length < 2 || !num(c[0].valor) || !num(c[c.length - 1].valor)) return null;
  const delta = c[c.length - 1].valor - c[0].valor;
  const fluxo = c.slice(1).reduce((s, p) => s + (num(p.fluxo) ? p.fluxo : 0), 0);
  const ganho = delta - fluxo;
  const ref = Math.max(Math.abs(c[c.length - 1].valor), 1);
  if (Math.abs(fluxo) < 0.01 * ref || Math.abs(fluxo) < 0.3 * Math.max(Math.abs(delta), Math.abs(ganho))) return null;
  const fmt = ctx.formatarMoeda;
  let texto;
  if (fluxo > 0 && delta >= 0) texto = `Do aumento de ${fmt(delta)} no valor ${ctx.descPeriodo}, ${fmt(fluxo)} foram aportes — o ganho de mercado foi ${moedaSinal(ganho, fmt)}.`;
  else if (fluxo > 0) texto = `Mesmo com ${fmt(fluxo)} em aportes ${ctx.descPeriodo}, o valor caiu ${fmt(Math.abs(delta))} — o mercado tirou ${fmt(Math.abs(ganho))}.`;
  else if (delta < 0) texto = `O valor caiu ${fmt(Math.abs(delta))} ${ctx.descPeriodo}, mas ${fmt(Math.abs(fluxo))} foram resgates/saídas — descontando isso, o resultado foi ${moedaSinal(ganho, fmt)}.`;
  else texto = `O valor subiu ${fmt(delta)} ${ctx.descPeriodo} mesmo com ${fmt(Math.abs(fluxo))} em resgates/saídas — o resultado de mercado foi ${moedaSinal(ganho, fmt)}.`;
  return { tipo: 'fluxos', tom: 'neutro', texto, resumo: fluxo > 0 ? 'boa parte da variação foi aporte' : 'resgates explicam parte da variação', peso: 66, dados: { delta, fluxo, ganho } };
}

function regraFluxoRecente(ctx) {
  const c = ctx.curva;
  if (ctx.spanDias <= 31 || c.length < 6) return null;
  const ultimos = c.slice(-5);
  let maior = null;
  ultimos.forEach((p) => { if (num(p.fluxo) && (!maior || Math.abs(p.fluxo) > Math.abs(maior.fluxo))) maior = p; });
  if (!maior || !num(maior.valor) || Math.abs(maior.fluxo) < 0.03 * Math.max(Math.abs(maior.valor), 1)) return null;
  const entrou = maior.fluxo > 0;
  return {
    tipo: 'fluxoRecente',
    tom: 'neutro',
    texto: `Em ${diaMes(maior.data)} ${entrou ? 'entrou um aporte' : 'saiu um resgate'} de ${ctx.formatarMoeda(Math.abs(maior.fluxo))} — o ${entrou ? 'salto' : 'tombo'} no valor desse dia não é ${entrou ? 'rendimento' : 'perda'}.`,
    resumo: `${entrou ? 'aporte' : 'resgate'} recente de ${ctx.formatarMoeda(Math.abs(maior.fluxo))}`,
    peso: 70,
  };
}

function regraQueda(ctx, movimento) {
  const c = ctx.curva;
  if (c.length < 5) return null;
  let pico = 0;
  let melhor = { dd: 0, pico: 0, vale: 0 };
  for (let i = 1; i < c.length; i += 1) {
    if (c[i].f > c[pico].f) pico = i;
    const dd = 1 - c[i].f / c[pico].f;
    if (dd > melhor.dd) melhor = { dd, pico, vale: i };
  }
  if (melhor.dd < 0.02) return null;
  let recuperou = -1;
  for (let i = melhor.vale + 1; i < c.length; i += 1) if (c[i].f >= c[melhor.pico].f) { recuperou = i; break; }
  const distancia = 1 - c[c.length - 1].f / c[melhor.pico].f;
  // a queda que acabou de acontecer já é o ponto "movimento"
  if (movimento && recuperou === -1 && melhor.vale >= c.length - 1 - N_RECENTE) return null;
  const anoDif = c[melhor.pico].data.slice(0, 4) !== c[c.length - 1].data.slice(0, 4) || c[0].data.slice(0, 4) !== c[c.length - 1].data.slice(0, 4);
  const dPico = diaMesAno(c[melhor.pico].data, anoDif);
  const dVale = diaMesAno(c[melhor.vale].data, anoDif);
  if (recuperou !== -1) {
    return {
      tipo: 'queda', tom: 'neutro',
      texto: `Maior queda ${ctx.descPeriodo}: −${pctAbs(melhor.dd)} (de ${dPico} a ${dVale}), já recuperada em ${diaMesAno(c[recuperou].data, anoDif)}.`,
      resumo: `queda de −${pctAbs(melhor.dd, 1)} já recuperada`,
      peso: 48 + Math.min(20, melhor.dd * 100),
    };
  }
  return {
    tipo: 'queda', tom: distancia >= 0.01 ? 'atencao' : 'neutro',
    texto: melhor.vale === c.length - 1
      ? `Maior queda ${ctx.descPeriodo}: −${pctAbs(melhor.dd)} desde o pico de ${dPico}, e o fim do período é o ponto mais baixo.`
      : `Maior queda ${ctx.descPeriodo}: −${pctAbs(melhor.dd)} desde o pico de ${dPico} (fundo em ${dVale}); ainda está ${pctAbs(distancia)} abaixo dele.`,
    resumo: `ainda ${pctAbs(distancia, 1)} abaixo do pico de ${dPico}`,
    peso: 52 + Math.min(25, melhor.dd * 150),
  };
}

function regraTendencia(ctx) {
  if (ctx.spanDias < 180) return null;
  const ref = ctx.retIndices.find((i) => ctx.indiceReferencia && i.nome.toLowerCase() === ctx.indiceReferencia.toLowerCase())
    || ctx.retIndices.find((i) => /^cdi$/i.test(i.nome)) || ctx.retIndices[0];
  if (!ref) return null;
  const c = ctx.curva;
  const fim = c[c.length - 1];
  const corte = isoMenosDias(fim.data, 91);
  const p0 = c.find((p) => p.data >= corte);
  if (!p0 || p0 === fim) return null;
  const r3 = fim.f / p0.f - 1;
  const i3 = retornoIndiceEntre(ref.mapa, p0.data, fim.data);
  if (!num(i3)) return null;
  const ex3 = (r3 - i3) * 100;
  const exT = (ctx.R - ref.ret) * 100;
  const meses = ctx.spanDias / 30.44;
  const ritmo3 = ex3 / 3;
  const ritmoT = exT / meses;
  const idx = ref.nome;
  if (exT * ex3 < 0 && Math.abs(ex3) >= 0.5) {
    if (ex3 < 0) return { tipo: 'tendencia', tom: 'atencao', texto: `Perdeu fôlego: nos últimos 3 meses ficou ${pp(ex3)} abaixo do ${idx}, apesar de estar ${pp(exT)} acima dele no período inteiro.`, resumo: `atrás do ${idx} nos últimos 3 meses`, peso: 62 };
    return { tipo: 'tendencia', tom: 'bom', texto: `Virou o jogo: nos últimos 3 meses ficou ${pp(ex3)} acima do ${idx}, depois de um período inteiro abaixo dele (${pp(exT)} atrás).`, resumo: `à frente do ${idx} nos últimos 3 meses`, peso: 60 };
  }
  if (ritmo3 - ritmoT >= 0.3 && ex3 > 0) return { tipo: 'tendencia', tom: 'bom', texto: `Acelerou: nos últimos 3 meses abriu ${pp(ex3)} sobre o ${idx} (≈${pp(ritmo3)} por mês), acima do ritmo do período inteiro (≈${pp(ritmoT)}${ritmoT < 0 ? ' abaixo' : ''} por mês).`, resumo: `acelerando contra o ${idx}`, peso: 56 };
  if (ritmoT - ritmo3 >= 0.3 && ex3 < 0) return { tipo: 'tendencia', tom: 'atencao', texto: `Piorou: nos últimos 3 meses ficou ${pp(ex3)} abaixo do ${idx} (≈${pp(ritmo3)} por mês), mais que no período inteiro.`, resumo: `piorando contra o ${idx}`, peso: 58 };
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
  // resultado líquido dominado por um lado só: "veio quase todo de X"
  const lado = total >= 0 ? pos : neg;
  if (lado.length && Math.abs(total) >= 0.5 * somaAbs && lado[0].g / total >= 0.7) {
    return { tipo: 'concentracao', tom: 'neutro', texto: `O resultado ${ctx.descPeriodo} veio quase todo de ${lado[0].nome} (${moedaSinal(lado[0].g, fmt)} de ${moedaSinal(total, fmt)}).`, resumo: `resultado concentrado em ${lado[0].nome}`, peso: 44 };
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
      };
    }
  }
  return null;
}

function isoMenosDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d - n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Análise
// ---------------------------------------------------------------------------

export function analisarSerie({ serie, indices = {}, periodo = null, nome = 'A carteira', formatarMoeda = formatBRL, componentes = null, contexto = null, indiceReferencia = null } = {}) {
  const curva = curvaDaSerie(serie);
  if (curva.length < 2) return { tom: 'neutro', resumo: '', pontos: [], metricas: null };
  const datas = (serie || []).map((p) => p && p.data);
  const R = curva[curva.length - 1].f - 1;
  const de = curva[0].data;
  const ate = curva[curva.length - 1].data;
  const spanDias = Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);
  const retIndices = Object.entries(indices || {})
    .map(([nomeI, lista]) => { const mapa = mapaIndice(lista, datas); return { nome: nomeI, mapa, ret: retornoIndiceEntre(mapa, de, ate) }; })
    .filter((i) => num(i.ret));
  const ctxContexto = contexto && Array.isArray(contexto.serie) ? contexto : null;
  const datasCtx = ctxContexto ? ctxContexto.serie.map((p) => p && p.data) : datas;
  const indicesContexto = Object.entries((ctxContexto && ctxContexto.indices) || indices || {})
    .map(([nomeI, lista]) => ({ nome: nomeI, mapa: mapaIndice(lista, datasCtx) }));
  const ctx = {
    curva, R, spanDias, retIndices, indicesContexto, nome, formatarMoeda, componentes, indiceReferencia,
    descPeriodo: descreverPeriodo(periodo),
    contextoCurva: ctxContexto ? curvaDaSerie(ctxContexto.serie) : [],
  };

  const comparacao = regraComparacao(ctx);
  const movimento = regraMovimento(ctx);
  const candidatos = [
    comparacao,
    movimento,
    regraFluxos(ctx),
    regraFluxoRecente(ctx),
    regraQueda(ctx, movimento),
    regraTendencia(ctx),
    regraConcentracao(ctx),
  ].filter(Boolean);
  const pontos = candidatos.sort((a, b) => b.peso - a.peso).slice(0, MAX_PONTOS);
  if (!pontos.includes(comparacao)) pontos[pontos.length - 1] = comparacao;
  // a comparação com os índices abre a lista (é a frase-base do resumo); o resto por importância
  pontos.sort((a, b) => (a === comparacao ? -1 : b === comparacao ? 1 : b.peso - a.peso));

  const alertas = pontos.filter((p) => p !== comparacao && p.tom === 'atencao' && p.peso >= 60);
  const destaque = alertas[0] || pontos.find((p) => p !== comparacao && p.peso >= 80);
  const resumo = destaque ? `${comparacao.resumo} · ${destaque.resumo}` : comparacao.resumo;
  let tom = comparacao.tom;
  if (alertas.length) tom = 'atencao';
  else if (tom === 'atencao' && pontos.some((p) => p.tipo === 'movimento' && p.tom === 'bom')) tom = 'neutro';

  return {
    tom,
    resumo: resumo.charAt(0).toUpperCase() + resumo.slice(1),
    pontos,
    metricas: { retorno: R, spanDias, indices: Object.fromEntries(retIndices.map((i) => [i.nome, i.ret])) },
  };
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICONE = {
  bom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  atencao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  neutro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
};
const TOM_TEXTO = { bom: 'a favor', atencao: 'atenção', neutro: 'informativo' };

/** HTML do card (string) - pra quem monta a página por innerHTML. */
export function htmlAnalise(analise, { aberto = false, titulo = 'Análise' } = {}) {
  if (!analise || !analise.pontos || !analise.pontos.length) return '';
  const itens = analise.pontos.map((p) => `<li class="ag-ponto ag-${p.tom}"><span class="ag-ico" title="${TOM_TEXTO[p.tom] || ''}">${ICONE[p.tom] || ICONE.neutro}</span><span class="ag-txt">${esc(p.texto)}</span></li>`).join('');
  return `
    <details class="ag ag-tom-${analise.tom}"${aberto ? ' open' : ''}>
      <summary class="ag-cab">
        <span class="ag-selo"><i aria-hidden="true"></i>${esc(titulo)}</span>
        <span class="ag-resumo">${esc(analise.resumo)}</span>
        <span class="ag-ver" aria-hidden="true"><span class="ag-ver-abrir">Ver análise</span><span class="ag-ver-fechar">Ocultar</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>
      </summary>
      <ul class="ag-pontos">${itens}</ul>
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

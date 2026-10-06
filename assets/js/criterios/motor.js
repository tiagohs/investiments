/**
 * criterios/motor.js - 03/10/2026 (Tiago: "Tenha um largo banco de dados de
 * critérios, para no site ser dinâmico as decisões e análises" e "inclua
 * também nas análises quando investir no ativo vai ajudar a chegar à meta...
 * se o preço atual da ação está abaixo do preço médio, é um ponto positivo
 * pra investir; se não, pode ser um ponto neutro").
 *
 * Motor PURO (sem DOM, sem rede): lê a base normalizada (base-acoes.js,
 * base-fiis.js), os indicadores que a planilha já tem, os fundamentos do
 * contrato (opcionais: `fundamentos` ausente = só a planilha + derivados), o
 * histórico de preço e a carteira, e devolve a análise do ativo:
 *
 *   avaliarAtivo({ classe, ticker, nome, setor, segmento, tipoFii, moeda,
 *     indicadores, fundamentos, historicoPreco, indices, referencias,
 *     carteira, metas, valorSugerido, hoje })
 *   -> { nota 0-100 | null, notaPorGrupo, veredito, pontos (por relevância),
 *        eliminatoriosAcionados, dadosFaltantes, avisos, cobertura, ... }
 *
 * Derivados quando falta dado (ROE = P/VP ÷ P/L; payout ≈ DY × P/L;
 * earnings yield = 1/P/L; Graham = P/L × P/VP; distância ao teto;
 * volatilidade/quedas/beta pelo histórico; rendimento por cota dos
 * proventos...) e sanidade: valor absurdo (P/VP 31, P/L 304, "#DIV/0!") é
 * ignorado com aviso. Faixas por setor (ações) e por segmento (FIIs).
 *
 * Também exporta os sinais de carteira que o "momento de aporte" usa
 * (sinalPrecoMedio, sinaisDeMetas) - a mesma conta nas duas telas.
 * Testes: tests/criterios-motor.test.js.
 *
 * 05/10/2026 (Tiago: "reavalie as análises, veja se dá pra ser mais
 * inteligente, considere agora as metas e a classificação de um ativo em
 * alguma meta, considere o macroeconômico... a situação daquele ativo"):
 *  - situação do ativo (grupo 'situacao', ENTRA na nota, peso 1,5-2 de ~60):
 *    lucro por ação e dividendos por ação em 12 meses; "preço caiu com
 *    fundamentos intactos" (oportunidade) x "caiu junto com os fundamentos";
 *  - renda fixa x meta (sinaisRendaFixaMeta): título adequado à meta? reserva
 *    abaixo do ideal, vencendo em < 12 meses, IPCA+ longo pra meta curta...;
 *  - contexto de mercado (macro.js; grupo 'contexto', FORA da nota): juro real,
 *    termômetro da bolsa, prêmio da NTN-B;
 *  - `leitura` ("Para o seu aporte"): metas + preço médio + contexto, com teto
 *    de peso e sem nunca passar por cima de fundamentos fracos/eliminatório.
 */

import { avaliarAtivoParaMeta, mesesEntre as mesesEntreMeta } from '../pages/metas-calc.js';
import { sinaisMacro, LIMITE_PONTOS_MACRO } from './macro.js';

import { CRITERIOS_ACOES, REGRAS_ACOES, SETORES_ACOES, setorDaAcao } from './base-acoes.js';
import { CRITERIOS_FIIS, REGRAS_FIIS, SEGMENTOS_FII, segmentoDoFii, classeDoSegmento } from './base-fiis.js';
import { formatNumeroPt } from '../format.js'; // 05/10/2026 (A-68)

// ---------------------------------------------------------------------------
// Formatação (pt-BR, sem depender de format.js pra ficar puro e testável)
// ---------------------------------------------------------------------------

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const br = (v, casas = 1) => formatNumeroPt(Number(v), { minimumFractionDigits: casas, maximumFractionDigits: casas });
const SIMBOLO = { BRL: 'R$', USD: 'US$' };

/** R$ 1.234,56 / US$ 12,30 (centavos só abaixo de 1.000). */
export function dinheiro(v, moeda = 'BRL') {
  const s = SIMBOLO[moeda] || 'R$';
  return `${s} ${br(v, Math.abs(v) >= 1000 ? 0 : 2)}`;
}

function compacto(v, moeda = 'BRL') {
  const s = SIMBOLO[moeda] || 'R$';
  const a = Math.abs(v);
  if (a >= 1e9) return `${s} ${br(v / 1e9, 1)} bi`;
  if (a >= 1e6) return `${s} ${br(v / 1e6, 1)} mi`;
  if (a >= 1e3) return `${s} ${br(v / 1e3, 0)} mil`;
  return `${s} ${br(v, 0)}`;
}

/** Valor de um critério já com a unidade ("4,9x", "7,5%", "2,3 p.p.", "20% abaixo"). */
export function formatarValor(v, unidade, casas = 1, moeda = 'BRL') {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (unidade) {
    case '%': return `${br(v * 100, casas)}%`;
    case 'pp': return `${br(v * 100, casas)} p.p.`;
    case 'x': return `${br(v, casas)}x`;
    case 'rel': {
      const d = v - 1;
      if (Math.abs(d) < 0.005) return 'em linha com';
      return `${br(Math.abs(d) * 100, 0)}% ${d < 0 ? 'abaixo' : 'acima'}`;
    }
    case 'anos': return `${br(v, casas)} ${Math.abs(v) === 1 ? 'ano' : 'anos'}`;
    case 'n': return br(v, 0);
    case 'R$': return compacto(v, moeda);
    case 'bool': return v ? 'sim' : 'não';
    default: return br(v, casas);
  }
}

function fmtLimite(x, c) {
  switch (c.unidade) {
    case '%': return `${br(x * 100, x * 100 % 1 ? 1 : 0)}%`;
    case 'pp': return `${br(x * 100, x * 100 % 1 ? 1 : 0)} p.p.`;
    case 'x': case 'rel': return `${br(x, x % 1 ? (Math.abs(x * 10 % 1) > 1e-9 ? 2 : 1) : 0)}${c.unidade === 'x' ? 'x' : ''}`;
    case 'R$': return compacto(x);
    case 'anos': return `${br(x, x % 1 ? 1 : 0)} anos`;
    default: return br(x, x % 1 ? 1 : 0);
  }
}

/** "3x a 10x" / "até 1x" / "a partir de 15%" - a faixa "bom" em texto. */
export function faixaTexto(faixas, criterio) {
  const bons = (faixas && faixas.bom) || [];
  if (!bons.length) return '';
  return bons.map(([a0, b]) => {
    const a = a0 != null && a0 > 0 && a0 <= 0.011 && criterio.unidade === 'x' ? null : a0; // 0,01x = "positivo"
    if (criterio.unidade === 'rel') {
      if (a == null && b != null) return b < 1 ? `${br((1 - b) * 100, 0)}% ou mais abaixo` : (b === 1 ? 'abaixo' : `até ${br((b - 1) * 100, 0)}% acima`);
      if (b == null && a != null) return a > 1 ? `${br((a - 1) * 100, 0)}% ou mais acima` : 'acima';
    }
    if (a == null) return `até ${fmtLimite(b, criterio)}`;
    if (b == null) return `a partir de ${fmtLimite(a, criterio)}`;
    return `${fmtLimite(a, criterio)} a ${fmtLimite(b, criterio)}`;
  }).join(' ou ');
}

// ---------------------------------------------------------------------------
// Faixas
// ---------------------------------------------------------------------------

export const TONS = ['bom', 'neutro', 'atencao', 'ruim'];
const PONTUACAO = { bom: 100, neutro: 65, atencao: 35, ruim: 0 };

/** Em qual faixa o valor cai ([min, max), null = aberto). null se em nenhuma. */
export function classificar(valor, faixas) {
  if (valor == null || !faixas) return null;
  for (const tom of TONS) {
    for (const [a, b] of faixas[tom] || []) {
      if ((a == null || valor >= a) && (b == null || valor < b)) return tom;
    }
  }
  return null;
}

export const GRUPOS = Object.freeze({
  valuation: 'Preço (valuation)',
  dividendos: 'Dividendos',
  rentabilidade_empresa: 'Rentabilidade',
  endividamento: 'Endividamento',
  crescimento: 'Crescimento',
  qualidade: 'Qualidade',
  governanca: 'Governança',
  liquidez_risco: 'Liquidez e risco',
  setorial_bancos: 'Bancos',
  setorial_seguradoras: 'Seguradoras',
  setorial_tecnologia: 'Tecnologia',
  internacional: 'Internacional',
  portfolio_fii: 'Imóveis e contratos',
  credito_fii: 'Crédito (CRIs)',
  gestao_fii: 'Gestão e custos',
  desempenho_carteira: 'Desempenho',
  situacao: 'Situação do ativo',
  carteira: 'Sua carteira e metas',
  contexto: 'Contexto de mercado',
});

// ---------------------------------------------------------------------------
// Sanidade: o que está fora disso é erro de dado (planilha com fórmula
// quebrada, cotação/patrimônio desatualizado...) - ignorado com aviso.
// ---------------------------------------------------------------------------

const NOMES_CHAVE = { pvp: 'P/VP', pl: 'P/L', dy: 'DY', dy12m: 'DY', roe: 'ROE', liquidezDiaria: 'liquidez', pctCaixa: '% em caixa', patrimonioLiquido: 'patrimônio', volumeMedio2m: 'liquidez' };
function limiteSanidade(chave, ehFii) {
  switch (chave) {
    case 'pvp': return ehFii ? [0.3, 3] : [0.05, 20];
    case 'pl': return [-100, 100];
    case 'dy': case 'dy12m': return [0, 0.35];
    case 'roe': case 'roic': case 'roa': return [-1, 1.5];
    case 'payout': return [-1, 3];
    case 'pctCaixa': case 'vacanciaFisica': case 'vacanciaFinanceira': case 'inadimplencia': case 'freeFloat': case 'tagAlong':
    case 'maiorInquilinoPct': case 'contratosAtipicosPct': return [0, 1.0001];
    case 'taxaAdministracao': return [0, 0.06];
    case 'liquidezDiaria': case 'volumeMedio2m': case 'patrimonioLiquido': case 'valorMercado': case 'numeroCotistas': case 'numeroImoveis': return [0, Infinity];
    case 'evEbitda': case 'evEbit': return [-100, 200];
    case 'psr': return [0, 200];
    // 03/10/2026: valores em dinheiro do contrato (fundamentos) passam de 1 bi em empresas grandes.
    case 'receitaLiquida12m': case 'lucroLiquido12m': case 'ebitda12m': case 'fcf12m': case 'recompras12m':
    case 'dividendosPagos12m': case 'resultadoAcumulado': return [-Infinity, Infinity];
    case 'margemBruta': case 'margemEbitda': case 'margemEbit': case 'margemLiquida': return [-3, 1];
    default: return [-1e9, 1e9];
  }
}

/** "#DIV/0!", "#N/A", "Indisponivel"... (texto de erro de planilha). */
const ehErroPlanilha = (v) => typeof v === 'string' && /^\s*(#|indispon|n\/?a\b|erro)/i.test(v);

// ---------------------------------------------------------------------------
// Séries (histórico de preço, índices, proventos)
// ---------------------------------------------------------------------------

const dia = (s) => String(s || '').slice(0, 10);
const mesDe = (s) => String(s || '').slice(0, 7);
const tempo = (d) => Date.parse(`${dia(d)}T12:00:00Z`);
const DIA_MS = 86400000;

function serieValida(serie, campo = 'preco') {
  return (serie || [])
    .map((p) => ({ data: dia(p.data), v: num(p[campo]) }))
    .filter((p) => p.data && p.v != null && p.v > 0)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

function desde(serie, hoje, dias) {
  const lim = tempo(hoje) - dias * DIA_MS;
  return serie.filter((p) => tempo(p.data) >= lim);
}

function retornos(serie) {
  const out = [];
  for (let i = 1; i < serie.length; i++) out.push(Math.log(serie[i].v / serie[i - 1].v));
  return out;
}

function desvio(xs) {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Valor da série na data (último ponto até ela). */
function valorEm(serie, data) {
  let r = null;
  for (const p of serie) { if (p.data <= data) r = p; else break; }
  return r;
}

const somarDias = (d, n) => new Date(tempo(d) + n * DIA_MS).toISOString().slice(0, 10);
function somarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Rendimento por cota/ação por mês de pagamento: { 'aaaa-mm': { rend, amort } }. */
function proventosPorMes(proventos) {
  const out = {};
  (proventos || []).forEach((p) => {
    const v = num(p.valorPorCota);
    const m = mesDe(p.dataPagamento || p.data);
    if (v == null || v <= 0 || !/^\d{4}-\d{2}$/.test(m)) return;
    const r = out[m] || (out[m] = { rend: 0, amort: 0 });
    if (/amortiza/i.test(String(p.tipo || ''))) r.amort += v; else r.rend += v;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Valores: planilha -> fundamentos -> derivados
// ---------------------------------------------------------------------------

function montarValores(e, info) {
  const ind = e.indicadores || {};
  const fund = (e.fundamentos && e.fundamentos.valores) || {};
  const hist = (e.fundamentos && e.fundamentos.historico) || {};
  const ehFii = info.ehFii;
  const valores = {};
  const origem = {};
  const extras = {};
  const avisos = [];
  const hoje = dia(e.hoje) || new Date().toISOString().slice(0, 10);
  const moeda = e.moeda === 'USD' ? 'USD' : 'BRL';

  // 1) planilha (o que a tela já mostra) e contrato, com sanidade
  const daPlanilha = {
    pvp: ind.pvp,
    pl: ehFii ? undefined : ind.pl,
    [ehFii ? 'dy12m' : 'dy']: ind.dy,
    [ehFii ? 'liquidezDiaria' : 'volumeMedio2m']: ind.liquidez,
    pctCaixa: ind.caixa,
    patrimonioLiquido: ind.patrimonio,
    maxima52s: ind.max52,
    minima52s: ind.min52,
  };
  const pegar = (chave, candidatos) => {
    for (const [fonte, v] of candidatos) {
      if (v == null || v === '') continue;
      if (ehErroPlanilha(v)) { avisos.push(`${NOMES_CHAVE[chave] || chave} veio como "${String(v).trim()}" da ${fonte} - ignorado na análise.`); continue; }
      const x = typeof v === 'boolean' ? (v ? 1 : 0) : num(v);
      if (x == null) continue;
      const [lo, hi] = limiteSanidade(chave, ehFii);
      if (x < lo || x > hi || (chave === 'pl' && x === 0)) {
        avisos.push(`${NOMES_CHAVE[chave] || chave} de ${br(x, Math.abs(x) >= 100 ? 0 : 2)} (${fonte}) parece erro de dado ou não tem sentido${chave === 'pl' && Math.abs(x) > 100 ? ' (lucro perto de zero)' : ''} - ignorado na análise.`);
        continue;
      }
      valores[chave] = x;
      origem[chave] = fonte;
      return;
    }
  };
  const chaves = new Set([...Object.keys(daPlanilha), ...Object.keys(fund)]);
  chaves.forEach((chave) => {
    if (chave === 'dy' && ehFii) return;
    pegar(chave, [['planilha', daPlanilha[chave]], ['fonte de fundamentos', fund[chave]]]);
  });
  // FII: o contrato pode trazer "dy" também
  if (ehFii && valores.dy12m == null && fund.dy != null) pegar('dy12m', [['fonte de fundamentos', fund.dy]]);
  if (typeof fund.estatal === 'boolean') valores.estatalNum = fund.estatal ? 1 : 0;
  if (typeof fund.isencaoIr === 'boolean') valores.isencaoNum = fund.isencaoIr ? 1 : 0;

  const preco = num(ind.precoAtual);
  if (preco > 0) valores.precoAtual = preco;
  const dyAtual = ehFii ? valores.dy12m : valores.dy;
  const derivado = (chave, v, ex) => {
    if (valores[chave] != null || v == null || !Number.isFinite(v)) return;
    valores[chave] = v;
    origem[chave] = 'derivado';
    if (ex) extras[chave] = ex;
  };

  // 2) derivados simples
  const { pl, pvp } = valores;
  if (pl > 0 && pvp > 0) derivado('roe', pvp / pl);
  if (pl > 0) derivado('earningsYield', 1 / pl);
  if (pl > 0 && dyAtual > 0) derivado('payout', dyAtual * pl);
  if (pl > 0 && pvp > 0) derivado('grahamPlPvp', pl * pvp);
  const dpa = num(ind.dyValor) > 0 ? ind.dyValor : (dyAtual > 0 && preco > 0 ? dyAtual * preco : null);
  if (dpa > 0) valores.dpa12m = dpa;
  const teto = num(ind.precoTeto);
  if (preco > 0 && teto > 0) derivado('precoSobreTeto', preco / teto, { teto: dinheiro(teto, moeda) });
  if (preco > 0 && dpa > 0) derivado('precoSobreBazin', preco / (dpa / 0.06), { teto: dinheiro(dpa / 0.06, moeda) });
  if (info.classeBase === 'acoes_int' && valores.dy > 0) derivado('dyLiquido', valores.dy * 0.7);
  if (valores.cagrLucro5a != null && dyAtual != null && pl > 0) derivado('pegy', ((valores.cagrLucro5a + dyAtual) * 100) / pl);
  if (valores.dividendosPagos12m != null && valores.fcf12m > 0) derivado('payoutFcl', (valores.dividendosPagos12m + (valores.recompras12m || 0)) / valores.fcf12m);
  if (valores.valorMercado > 0 && (valores.dividendosPagos12m != null || valores.recompras12m != null)) {
    derivado('shareholderYield', ((valores.dividendosPagos12m || 0) + (valores.recompras12m || 0)) / valores.valorMercado);
  } else if (valores.valorMercado > 0 && valores.recompras12m != null && dyAtual != null) derivado('shareholderYield', dyAtual + valores.recompras12m / valores.valorMercado);
  if (valores.cagrReceita5a != null && valores.fcf12m != null && valores.receitaLiquida12m > 0) derivado('regra40', valores.cagrReceita5a + valores.fcf12m / valores.receitaLiquida12m);
  if (valores.cagrLucro5a != null && valores.cagrReceita5a != null) derivado('lucroVsReceita', valores.cagrLucro5a - valores.cagrReceita5a);
  if (typeof fund.segmentoListagem === 'string') {
    const p = { 'novo mercado': 3, n2: 2, 'nivel 2': 2, n1: 1, 'nivel 1': 1, tradicional: 0 }[fund.segmentoListagem.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()];
    if (p != null) derivado('pontosListagem', p);
  }
  if (typeof fund.bolsa === 'string') {
    const b = fund.bolsa.toUpperCase();
    derivado('pontosBolsa', /NYSE|NASDAQ/.test(b) ? 3 : (b === 'OTC' ? (fund.adr ? 1 : 0) : null));
  }
  if (!ehFii) derivado('setorPerene', { bancos: 3, seguradoras: 3, eletricas_utilities: 3, saneamento: 3, telecom_cabo: 3, outros: 2, holdings: 2, tecnologia_crescimento: 2, varejo: 1, commodities_ciclicas: 1, petroleo_royalties: 1 }[info.setor]);
  if (ehFii && dyAtual > 0 && num(e.referencias && e.referencias.cdi12m) > 0) {
    const cdi = e.referencias.cdi12m / 100;
    derivado('dySobreCdi', dyAtual / (cdi * 0.85), { cdi: ` (CDI 12m de ${br(cdi * 100, 1)}%, ${br(cdi * 85, 1)}% sem o IR)` });
  }
  if (num(e.referencias && e.referencias.cdi12m) > 0) extras.earningsYield = { cdi: ` (o CDI rendeu ${br(e.referencias.cdi12m, 1)}% em 12 meses)` };

  // carteira
  const cart = e.carteira || {};
  const pm = num(cart.precoMedio) != null ? cart.precoMedio : num(ind.precoMedio);
  if (pm > 0 && dpa > 0 && (num(cart.quantidade) || 0) > 0) derivado('yieldOnCost', dpa / pm);
  if (num(cart.peso) != null && cart.peso > 0) derivado('pesoCarteira', cart.peso);

  // 3) faixa de 52 semanas
  const serie = serieValida(e.historicoPreco);
  if (preco > 0) {
    const max = valores.maxima52s; const min = valores.minima52s;
    if (max > min && min > 0) derivado('posicao52s', Math.max(0, Math.min(1, (preco - min) / (max - min))));
  }

  // 4) histórico de preço: volatilidade, quedas, beta, retorno vs índice
  if (serie.length) {
    const ano = desde(serie, hoje, 366);
    const cobreAno = ano.length >= 120 && tempo(hoje) - tempo(ano[0].data) >= 300 * DIA_MS;
    if (ano.length >= 60) {
      const sd = desvio(retornos(ano));
      if (sd != null) derivado('volatilidade', sd * Math.sqrt(252));
    }
    if (cobreAno && preco > 0) {
      const topo = Math.max(...ano.map((p) => p.v), preco);
      derivado('drawdownAtual', preco / topo - 1);
    }
    const tres = desde(serie, hoje, 3 * 366);
    if (tres.length >= 250) {
      let topo = 0; let pior = 0;
      tres.forEach((p) => { topo = Math.max(topo, p.v); pior = Math.min(pior, p.v / topo - 1); });
      derivado('drawdownMax3a', pior);
    }
    const campoIndice = ehFii ? 'ifix' : (info.classeBase === 'acoes_int' ? 'sp500' : 'ibovespa');
    const nomeIndice = { ifix: 'IFIX', sp500: 'S&P 500', ibovespa: 'Ibovespa' }[campoIndice];
    const idx = serieValida(e.indices, campoIndice);
    if (idx.length && ano.length >= 60) {
      const mapaIdx = new Map(idx.map((p) => [p.data, p.v]));
      const pares = ano.filter((p) => mapaIdx.has(p.data));
      if (pares.length >= 60) {
        const ra = []; const ri = [];
        for (let i = 1; i < pares.length; i++) {
          ra.push(Math.log(pares[i].v / pares[i - 1].v));
          ri.push(Math.log(mapaIdx.get(pares[i].data) / mapaIdx.get(pares[i - 1].data)));
        }
        const ma = media(ra); const mi = media(ri);
        let cov = 0; let vi = 0;
        for (let i = 0; i < ra.length; i++) { cov += (ra[i] - ma) * (ri[i] - mi); vi += (ri[i] - mi) ** 2; }
        if (vi > 0) {
          derivado('beta', cov / vi, { indice: ` (${nomeIndice})` });
          const sda = desvio(ra); const sdi = desvio(ri);
          if (ehFii && sdi > 0) derivado('volatilidadeRelativa', sda / sdi);
        }
      }
      if (ehFii && cobreAno && preco > 0) {
        const inicio = ano[0];
        const i0 = valorEm(idx, inicio.data); const i1 = idx[idx.length - 1];
        const provs = (e.indicadores && e.indicadores.proventos) || [];
        const somaProv = provs.filter((p) => { const d = dia(p.dataPagamento || p.data); return d > inicio.data && d <= hoje; })
          .reduce((s, p) => s + (num(p.valorPorCota) || 0), 0);
        if (i0 && i1 && i0.v > 0) derivado('retornoVsIndice12m', ((preco + somaProv) / inicio.v - 1) - (i1.v / i0.v - 1));
      }
    }
  }
  if (!extras.beta && valores.beta != null) extras.beta = { indice: '' };

  // 5) rendimentos por cota (proventos)
  const porMes = proventosPorMes(ind.proventos);
  const mesesComDado = Object.keys(porMes).sort();
  if (mesesComDado.length) {
    const mesHoje = mesDe(hoje);
    const ultimoFechado = somarMeses(mesHoje, -1);
    const primeiro = mesesComDado[0];
    const janela = (fim, n) => Array.from({ length: n }, (_, i) => somarMeses(fim, -(n - 1 - i))).filter((m) => m >= primeiro);
    const rend = (m) => (porMes[m] ? porMes[m].rend : 0);
    if (ehFii) {
      const j24 = janela(ultimoFechado, 24);
      if (j24.length >= 12) {
        const xs = j24.map(rend);
        const m = media(xs);
        if (m > 0) derivado('cvRendimento', desvio(xs) / m);
        let cortes = 0;
        for (let i = 3; i < xs.length; i++) {
          const ref = media(xs.slice(i - 3, i));
          if (ref > 0 && xs[i] < 0.9 * ref) cortes += 1;
        }
        derivado('cortesRendimento', cortes);
      }
      const j12 = janela(ultimoFechado, 12);
      if (j12.length === 12) {
        const totAm = j12.reduce((s, mm) => s + (porMes[mm] ? porMes[mm].amort : 0), 0);
        const tot = j12.reduce((s, mm) => s + (porMes[mm] ? porMes[mm].rend + porMes[mm].amort : 0), 0);
        if (tot > 0) derivado('pctAmortizacao12m', totAm / tot);
      }
      // crescimento real: 12m de agora x 12m de n anos atrás (n até 3), descontado o IPCA
      const ipca = serieValida(e.indices, 'ipca');
      for (const n of [3, 2, 1]) {
        const fimAntigo = somarMeses(ultimoFechado, -12 * n);
        const jAnt = janela(fimAntigo, 12);
        if (jAnt.length < 12 || j12.length < 12) continue;
        const r1 = j12.reduce((s, mm) => s + rend(mm), 0);
        const r0 = jAnt.reduce((s, mm) => s + rend(mm), 0);
        if (!(r0 > 0) || !(r1 > 0)) continue;
        const a = valorEm(ipca, `${fimAntigo}-28`); const b = valorEm(ipca, `${ultimoFechado}-28`);
        if (!a || !b) continue;
        const inflacao = (b.v / a.v) ** (1 / n) - 1;
        derivado('crescimentoRealRendimento', (r1 / r0) ** (1 / n) - 1 - inflacao);
        break;
      }
    }
    // DY histórico (pela régua dos próprios proventos e do preço da série)
    if (serie.length && dyAtual > 0) {
      const dys = [];
      for (let k = 0; k < 60; k++) {
        const m = somarMeses(ultimoFechado, -k);
        if (somarMeses(m, -11) < primeiro) break;
        const p = valorEm(serie, `${m}-31`);
        if (!p || mesDe(p.data) !== m) continue;
        const soma = janela(m, 12).reduce((s, mm) => s + rend(mm), 0);
        if (soma > 0) dys.push(soma / p.v);
      }
      if (dys.length >= 12) {
        const md = media(dys);
        if (valores.dyMedio5a == null && md > 0) {
          derivado('dySobreMedia', dyAtual / md, { media: `${br(md * 100, 1)}%` });
        }
      }
    }
  }
  if (valores.dyMedio5a > 0 && dyAtual > 0) derivado('dySobreMedia', dyAtual / valores.dyMedio5a, { media: `${br(valores.dyMedio5a * 100, 1)}%` });

  // 6) histórico mensal dos fundamentos (contrato)
  const histMedia = (lista, atual, chave, casas, unidade) => {
    const xs = (lista || []).map((p) => num(p.valor)).filter((x) => x != null && x > 0).slice(-60);
    if (xs.length < 12 || !(atual > 0)) return;
    const [lo, hi] = limiteSanidade(chave, ehFii);
    const ok = xs.filter((x) => x >= lo && x <= hi);
    if (ok.length < 12) return;
    const md = media(ok);
    return { razao: atual / md, media: unidade === '%' ? `${br(md * 100, casas)}%` : br(md, casas) };
  };
  const hpl = histMedia(hist.pl, pl, 'pl', 1);
  if (hpl) derivado('plSobreMedia', hpl.razao, { media: hpl.media });
  const hpvp = histMedia(hist.pvp, pvp, 'pvp', 2);
  if (hpvp) derivado('pvpSobreMedia', hpvp.razao, { media: hpvp.media });
  const hdy = histMedia(hist.dy12m || hist.dy, dyAtual, ehFii ? 'dy12m' : 'dy', 1, '%');
  if (hdy) derivado('dySobreMedia', hdy.razao, { media: hdy.media });
  const varia12 = (lista, f) => {
    const xs = (lista || []).filter((p) => num(p.valor) != null && /^\d{4}-\d{2}/.test(p.data || '')).sort((a, b) => (a.data < b.data ? -1 : 1));
    if (xs.length < 2) return null;
    const ult = xs[xs.length - 1];
    const alvo = somarMeses(mesDe(ult.data), -12);
    const ant = [...xs].reverse().find((p) => mesDe(p.data) <= alvo);
    return ant ? f(ult.valor, ant.valor) : null;
  };
  const vacT = varia12(hist.vacanciaFisica, (a, b) => a - b);
  if (vacT != null) derivado('vacanciaTendencia', vacT);
  const vpT = varia12(hist.vpCota, (a, b) => (b > 0 ? a / b - 1 : null));
  if (vpT != null) derivado('vpCotaTendencia', vpT);

  // 7) 05/10/2026: situação do ativo - o lucro por ação e o dividendo por ação,
  // hoje x 12 meses atrás (só ações; FII já tem rendimento real e VP/cota)
  if (!ehFii) {
    // lucro por ação ≈ preço ÷ P/L: hoje contra o mês de 12 meses atrás (foto mensal do P/L + preço do fim daquele mês)
    const plFotos = (hist.pl || []).filter((p) => num(p.valor) > 0 && /^\d{4}-\d{2}/.test(p.data || '')).sort((a, b) => (a.data < b.data ? -1 : 1));
    const mesAlvo = somarMeses(mesDe(hoje), -12);
    const foto = [...plFotos].reverse().find((p) => mesDe(p.data) <= mesAlvo && mesDe(p.data) >= somarMeses(mesAlvo, -2));
    if (foto && pl > 0 && preco > 0 && serie.length) {
      const mesFoto = mesDe(foto.data);
      const [lo, hi] = limiteSanidade('pl', false);
      const pAnt = valorEm(serie, `${mesFoto}-31`);
      if (pAnt && mesDe(pAnt.data) === mesFoto && foto.valor >= lo && foto.valor <= hi) derivado('lpaTendencia', (preco / pl) / (pAnt.v / foto.valor) - 1, { mes: mesFoto });
    }
    // dividendo por ação: soma dos 12 meses fechados x os 12 anteriores (precisa de 24 meses de histórico)
    const ult = somarMeses(mesDe(hoje), -1);
    const primeiroProv = mesesComDado[0];
    const soma12 = (fim) => {
      const ms = Array.from({ length: 12 }, (_, i) => somarMeses(fim, -i));
      return ms.every((m) => m >= primeiroProv) ? ms.reduce((t, m) => t + (porMes[m] ? porMes[m].rend : 0), 0) : null;
    };
    const d1 = primeiroProv ? soma12(ult) : null;
    const d0 = primeiroProv ? soma12(somarMeses(ult, -12)) : null;
    if (d1 != null && d0 > 0) derivado('dpaTendencia', d1 / d0 - 1);
  }

  return { valores, origem, extras, avisos, moeda };
}

// ---------------------------------------------------------------------------
// Avaliação
// ---------------------------------------------------------------------------

const CLASSE_BASE = { acoes: 'acoes_br', acoesEua: 'acoes_int' };
const RELEVANCIA_TOM = { ruim: 1.3, bom: 1, atencao: 0.9, neutro: 0.35 };

function infoDoAtivo(e) {
  const fund = (e.fundamentos && e.fundamentos.valores) || {};
  if (e.classe === 'fiis') {
    const segmento = segmentoDoFii({ segmento: fund.segmento || e.segmento || '', tipo: e.tipoFii || '', nome: e.nome || '' });
    return { ehFii: true, segmento, setor: null, classeBase: classeDoSegmento(segmento), rotuloRegua: SEGMENTOS_FII[segmento] || '' };
  }
  if (CLASSE_BASE[e.classe]) {
    const setor = setorDaAcao({ setor: fund.setor || e.setor || '', subsetor: fund.subsetor || '', segmento: fund.segmento || '', nome: e.nome || '' });
    return { ehFii: false, setor, segmento: null, classeBase: CLASSE_BASE[e.classe], rotuloRegua: SETORES_ACOES[setor] || '' };
  }
  return null;
}

/** As faixas que valem pra este ativo (setor/segmento > EUA > padrão) e de onde vieram. */
function faixasDoCriterio(c, info) {
  if (info.setor && c.faixasPorSetor && c.faixasPorSetor[info.setor]) return { faixas: c.faixasPorSetor[info.setor], especifica: true };
  if (info.segmento && c.faixasPorSegmento && c.faixasPorSegmento[info.segmento]) return { faixas: c.faixasPorSegmento[info.segmento], especifica: true };
  if (info.classeBase === 'acoes_int' && c.faixasInt) return { faixas: c.faixasInt, especifica: false };
  return { faixas: c.faixas, especifica: false };
}

function aplica(c, info) {
  if (!c.classes.includes(info.classeBase)) return false;
  const chaveRegua = info.setor || info.segmento;
  if (c.aplicaA && !c.aplicaA.includes(chaveRegua)) return false;
  if (c.naoAplicaA && c.naoAplicaA.includes(chaveRegua)) return false;
  return true;
}

const PLACEHOLDER = /\{(\w+)\}/g;
function preencher(modelo, vars) {
  if (!modelo) return null;
  let falhou = false;
  const txt = modelo.replace(PLACEHOLDER, (_, k) => {
    if (vars[k] == null) { falhou = true; return ''; }
    return vars[k];
  });
  return falhou ? null : txt;
}

function fraseGenerica(c, tom, vars) {
  const fim = { bom: 'dentro da faixa boa', neutro: 'na média', atencao: 'pede atenção', ruim: 'fora do ideal' }[tom];
  return `${c.nome}: ${vars.valor} - ${fim}${vars.faixa ? ` (bom: ${vars.faixa}${vars.ref || ''})` : ''}.`;
}

/** O valor está abaixo da faixa boa? (pra escolher a frase do lado certo: P/L negativo x P/L alto) */
export function abaixoDoBom(valor, faixas) {
  const bons = (faixas && faixas.bom) || [];
  const mins = bons.map((i) => i[0]).filter((x) => x != null);
  if (!bons.length || mins.length < bons.length) return false;
  return valor < Math.min(...mins);
}

/**
 * Texto do critério no tom. Abaixo da faixa boa usa a frase "<tom>Baixo"
 * quando existe; atenção sem frase própria usa a de "ruim".
 */
export function fraseDoCriterio(c, tom, vars, { baixo = false } = {}) {
  const f = c.frases || {};
  const modelo = (baixo && f[`${tom}Baixo`]) || (tom === 'atencao' ? (f.atencao || f.ruim) : f[tom]);
  return preencher(modelo, vars) || fraseGenerica(c, tom, vars);
}

/** Base inteira (pra telas de "todos os critérios" e testes). */
export const BASE_CRITERIOS = Object.freeze({ acoes: CRITERIOS_ACOES, fiis: CRITERIOS_FIIS });

function vazio(motivo) {
  return { nota: null, notaPorGrupo: {}, veredito: { nivel: 'sem-analise', rotulo: 'Sem análise', texto: motivo }, pontos: [], eliminatoriosAcionados: [], dadosFaltantes: [], avisos: [], cobertura: { avaliados: 0, total: 0, peso: 0 }, valores: {} };
}

// ---------------------------------------------------------------------------
// 05/10/2026: situação do ativo (Tiago: "a situação daquele ativo") - pontos
// que ENTRAM na nota (peso 1,5 a 2, perto de 3% do total de uma ação)
// ---------------------------------------------------------------------------

const pontoSituacao = (id, nome, tom, texto, peso, valor) => ({
  criterioId: id, nome, grupo: 'situacao', tom, texto, valor: valor == null ? null : valor, valorTexto: valor == null ? '' : `${valor >= 0 ? '+' : '−'}${br(Math.abs(valor) * 100, 0)}%`,
  faixa: '', regua: '', fonte: null, fontes: [], peso, eliminatorio: false, informativo: false, combinacao: true,
});
const pctAbs = (x) => `${br(Math.abs(x) * 100, 0)}%`;

/**
 * Lucro/dividendo em queda, "caiu com fundamentos intactos" (oportunidade) e
 * "caiu junto com os fundamentos" (cuidado). Usa só valores já derivados.
 */
function pontosDeSituacao(valores, ehFii, temEliminatorio) {
  const out = [];
  const lpa = valores.lpaTendencia; const dpa = valores.dpaTendencia;
  if (lpa != null) {
    if (lpa >= 0.1) out.push(pontoSituacao('situacao_lpa', 'Lucro por ação (12 meses)', 'bom', `Lucro por ação cresceu cerca de ${pctAbs(lpa)} em 12 meses (estimado por preço ÷ P/L).`, 1.5, lpa));
    else if (lpa <= -0.15) out.push(pontoSituacao('situacao_lpa', 'Lucro por ação (12 meses)', 'ruim', `Lucro por ação caiu cerca de ${pctAbs(lpa)} em 12 meses (estimado por preço ÷ P/L): o P/L de hoje pode esconder um lucro em queda.`, 1.5, lpa));
    else if (lpa <= -0.05) out.push(pontoSituacao('situacao_lpa', 'Lucro por ação (12 meses)', 'atencao', `Lucro por ação recuou cerca de ${pctAbs(lpa)} em 12 meses (estimado por preço ÷ P/L).`, 1.5, lpa));
  }
  if (dpa != null) {
    if (dpa >= 0.1) out.push(pontoSituacao('situacao_dpa', 'Dividendos por ação (12 meses)', 'bom', `Dividendos por ação ${pctAbs(dpa)} acima dos 12 meses anteriores.`, 1.5, dpa));
    else if (dpa <= -0.15) out.push(pontoSituacao('situacao_dpa', 'Dividendos por ação (12 meses)', 'ruim', `Dividendos por ação ${pctAbs(dpa)} abaixo dos 12 meses anteriores: confira se o corte é pontual ou tendência.`, 1.5, dpa));
    else if (dpa <= -0.05) out.push(pontoSituacao('situacao_dpa', 'Dividendos por ação (12 meses)', 'atencao', `Dividendos por ação ${pctAbs(dpa)} abaixo dos 12 meses anteriores.`, 1.5, dpa));
  }
  const queda = valores.drawdownAtual;
  if (queda != null && queda <= -0.15) {
    // fundamentos "intactos": nenhum sinal de piora nos que a gente mede e sem eliminatório
    const sinaisPiora = ehFii
      ? [valores.vpCotaTendencia != null && valores.vpCotaTendencia < -0.03, valores.cortesRendimento != null && valores.cortesRendimento >= 2, valores.vacanciaTendencia != null && valores.vacanciaTendencia > 0.02]
      : [lpa != null && lpa < -0.05, dpa != null && dpa < -0.05];
    const medidos = ehFii
      ? [valores.vpCotaTendencia, valores.cortesRendimento, valores.vacanciaTendencia].some((x) => x != null)
      : (lpa != null || dpa != null);
    const piorou = sinaisPiora.some(Boolean);
    const fraseQueda = `Preço ${pctAbs(queda)} abaixo da máxima de 12 meses`;
    if (!temEliminatorio && medidos && !piorou) out.push(pontoSituacao('situacao_oportunidade', 'Queda de preço x fundamentos', 'bom', `${fraseQueda} com os fundamentos que medimos intactos (${ehFii ? 'VP por cota, rendimento e vacância' : 'lucro e dividendos'}): possível oportunidade.`, 2, queda));
    else if (piorou) out.push(pontoSituacao('situacao_queda_justificada', 'Queda de preço x fundamentos', 'atencao', `${fraseQueda} e ${ehFii ? 'os fundamentos do fundo também pioraram' : 'o lucro ou os dividendos também caíram'}: o desconto pode ser justificado.`, 1.5, queda));
  } else if (queda != null && queda > -0.03 && valores.posicao52s != null && valores.posicao52s >= 0.9 && lpa != null && lpa <= -0.05) {
    out.push(pontoSituacao('situacao_esticado', 'Preço x lucro', 'atencao', `Preço perto da máxima de 52 semanas enquanto o lucro por ação cai (${pctAbs(lpa)}): o preço anda mais rápido que o lucro.`, 1, lpa));
  }
  return out;
}

/**
 * Análise de um ativo. `classe` = 'acoes' | 'fiis' | 'acoesEua' (renda fixa
 * só ganha os pontos de carteira/metas). Valores em fração (0.085 = 8,5%).
 */
export function avaliarAtivo(entrada = {}) {
  const e = entrada || {};
  const info = infoDoAtivo(e);
  const pontosCarteira = pontosDeCarteira(e);
  if (!info) {
    const r = vazio('Sem critérios de análise para esta classe.');
    pontosCarteira.forEach((p) => { p.relevancia = Math.round(p.peso * (RELEVANCIA_TOM[p.tom] || 0.5) * 80) / 100; });
    r.pontos = pontosCarteira.sort((x, y) => y.relevancia - x.relevancia);
    r.leitura = leituraParaVoce(r.pontos, { ehRf: e.classe === 'rendaFixa' });
    return r;
  }
  const { valores, extras, avisos, moeda, origem } = montarValores(e, info);
  const lista = (info.ehFii ? CRITERIOS_FIIS : CRITERIOS_ACOES).filter((c) => aplica(c, info));
  const resultados = new Map();
  const dadosFaltantes = [];
  lista.forEach((c) => {
    const v = valores[c.chave];
    if (v == null) { if (!c.informativo) dadosFaltantes.push({ criterioId: c.id, nome: c.nome, chave: c.chave, peso: c.peso }); return; }
    const { faixas, especifica } = faixasDoCriterio(c, info);
    const tom = classificar(v, faixas);
    if (!tom) return;
    resultados.set(c.id, { criterio: c, valor: v, tom, faixas, especifica, origem: origem[c.chave] || null });
  });

  // regras de combinação
  const ajustes = new Map();
  const extrasPontos = [];
  const fmt = (v, u, casas) => formatarValor(v, u, casas, moeda);
  const ctx = {
    v: (k) => (valores[k] == null ? null : valores[k]),
    r: (id) => resultados.get(id) || null,
    resultados: () => [...resultados.values()],
    eliminatorios: () => [...resultados.values()].filter((x) => x.criterio.eliminatorio && x.tom === 'ruim'),
    setor: info.setor, segmento: info.segmento, classeBase: info.classeBase, referencias: e.referencias || {},
    fmt, dinheiro: (v) => dinheiro(v, moeda),
    ajustar: (id, tom, texto, fonte) => { if (resultados.has(id)) ajustes.set(id, { tom, texto, fonte }); },
    ponto: (p) => extrasPontos.push(p),
  };
  (info.ehFii ? REGRAS_FIIS : REGRAS_ACOES).forEach((regra) => { try { regra(ctx); } catch (err) { /* regra com dado estranho não derruba a análise */ } });

  // pontos
  const pontos = [];
  resultados.forEach((res, id) => {
    const c = res.criterio;
    const aj = ajustes.get(id);
    const tom = aj ? aj.tom : res.tom;
    const ex = extras[c.chave] || {};
    const vars = {
      valor: formatarValor(res.valor, c.unidade, c.casas, moeda),
      valorAbs: formatarValor(Math.abs(res.valor), c.unidade, c.casas, moeda),
      faixa: faixaTexto(res.faixas, c),
      ref: res.especifica && info.rotuloRegua ? ` (régua de ${info.rotuloRegua})` : '',
      ...ex,
    };
    if (vars.cdi == null) vars.cdi = '';
    if (vars.indice == null) vars.indice = '';
    pontos.push({
      criterioId: id, nome: c.nome, grupo: c.grupo, tom, tomFaixa: res.tom,
      texto: aj ? aj.texto : fraseDoCriterio(c, tom, vars, { baixo: abaixoDoBom(res.valor, res.faixas) }),
      valor: res.valor, valorTexto: vars.valor, faixa: vars.faixa, regua: res.especifica ? info.rotuloRegua : '',
      fonte: (aj && aj.fonte) || c.fontes[0] || null, fontes: c.fontes, peso: c.peso,
      eliminatorio: !!c.eliminatorio, informativo: !!c.informativo, ajustado: !!aj, derivado: res.origem === 'derivado',
      porQue: c.porQue, armadilha: c.armadilha,
    });
  });
  extrasPontos.forEach((p) => pontos.push({
    criterioId: p.id, nome: p.nome, grupo: p.grupo || 'valuation', tom: p.tom, texto: p.texto, valor: null, valorTexto: '', faixa: '', regua: '',
    fonte: p.fonte || null, fontes: p.fonte ? [p.fonte] : [], peso: p.peso || 1, eliminatorio: false, informativo: false, combinacao: true,
  }));
  pontosDeSituacao(valores, info.ehFii, ctx.eliminatorios().length > 0).forEach((p) => pontos.push(p));
  pontosCarteira.forEach((p) => pontos.push(p));

  // nota (ponderada; informativos, carteira e contexto de mercado ficam de fora)
  const contam = pontos.filter((p) => !p.informativo && p.grupo !== 'carteira');
  const somar = (ps) => {
    const peso = ps.reduce((s, p) => s + p.peso, 0);
    return peso > 0 ? Math.round(ps.reduce((s, p) => s + PONTUACAO[p.tom] * p.peso, 0) / peso) : null;
  };
  let nota = somar(contam);
  const notaPorGrupo = {};
  [...new Set(contam.map((p) => p.grupo))].forEach((g) => {
    const ps = contam.filter((p) => p.grupo === g);
    notaPorGrupo[g] = { nota: somar(ps), n: ps.length, nome: GRUPOS[g] || g };
  });
  const eliminatoriosAcionados = pontos.filter((p) => p.eliminatorio && p.tom === 'ruim').map((p) => ({ criterioId: p.criterioId, nome: p.nome, texto: p.texto }));
  if (eliminatoriosAcionados.length && nota != null) nota = Math.min(nota, 40);

  pontos.forEach((p) => {
    p.relevancia = Math.round((p.peso * (RELEVANCIA_TOM[p.tom] || 0.5) + (p.eliminatorio && p.tom === 'ruim' ? 3 : 0)) * (p.informativo ? 0.8 : 1) * 100) / 100;
  });
  pontos.sort((a, b) => b.relevancia - a.relevancia);

  const avaliados = contam.length;
  const pesoAvaliado = contam.reduce((s, p) => s + p.peso, 0);
  const cobertura = { avaliados, total: lista.filter((c) => !c.informativo).length, peso: pesoAvaliado };
  const veredito = vereditoDe(nota, cobertura, eliminatoriosAcionados, pontos);
  dadosFaltantes.sort((a, b) => b.peso - a.peso);
  const leitura = leituraParaVoce(pontos, { nota: veredito.nivel === 'insuficiente' ? null : nota, eliminatorios: eliminatoriosAcionados.length });
  return {
    leitura, nota: veredito.nivel === 'insuficiente' ? null : nota, notaBruta: nota, notaPorGrupo, veredito, pontos, eliminatoriosAcionados, dadosFaltantes, avisos, cobertura,
    valores, classeBase: info.classeBase, setor: info.setor, segmento: info.segmento, regua: info.rotuloRegua,
  };
}

/** Rótulo e texto do veredito. Pouco dado = "Poucos dados" (sem nota). */
export function vereditoDe(nota, cobertura, eliminatorios, pontos) {
  if (eliminatorios.length) {
    return { nivel: 'alerta', rotulo: 'Ponto crítico', texto: `Critério eliminatório no vermelho: ${eliminatorios.map((x) => x.nome).join(', ')}.` };
  }
  if (nota == null || cobertura.avaliados < 3 || cobertura.peso < 6) {
    return { nivel: 'insuficiente', rotulo: 'Poucos dados', texto: `Só ${cobertura.avaliados} critério${cobertura.avaliados === 1 ? '' : 's'} com dado - a nota fica de fora até chegarem mais fundamentos.` };
  }
  const forte = pontos.find((p) => p.tom === 'bom' && !p.informativo && p.grupo !== 'carteira');
  const fraco = pontos.find((p) => (p.tom === 'ruim' || p.tom === 'atencao') && !p.informativo && p.grupo !== 'carteira');
  const resumo = [forte ? `Destaque: ${forte.nome}` : '', fraco ? `atenção: ${fraco.nome}` : ''].filter(Boolean).join(' · ');
  const base = resumo ? `${resumo}.` : `${cobertura.avaliados} critérios avaliados.`;
  if (nota >= 75) return { nivel: 'forte', rotulo: 'Fundamentos fortes', texto: base };
  if (nota >= 55) return { nivel: 'ok', rotulo: 'Fundamentos ok', texto: base };
  if (nota >= 35) return { nivel: 'misto', rotulo: 'Misto', texto: base };
  return { nivel: 'fraco', rotulo: 'Fundamentos fracos', texto: base };
}

// ---------------------------------------------------------------------------
// Carteira: preço x preço médio e metas (Metas e Objetivos)
// ---------------------------------------------------------------------------

/**
 * Preço de hoje x o SEU preço médio (Tiago: "abaixo do preço médio é um
 * ponto positivo pra investir; se não, pode ser um ponto neutro").
 * { tom: 'bom'|'neutro', texto, peso, variacao } ou null sem posição.
 */
export function sinalPrecoMedio({ precoAtual, precoMedio, quantidade, moeda = 'BRL' } = {}) {
  const p = num(precoAtual); const pm = num(precoMedio);
  if (!(p > 0) || !(pm > 0) || !((num(quantidade) || 0) > 0)) return null;
  const v = p / pm - 1;
  const pct = `${br(Math.abs(v) * 100, 1)}%`;
  const ajuda = 'Compara o preço de hoje com o preço médio que você pagou: abaixo dele, um aporte baixa o seu custo médio (ponto a favor, peso 1 a 1,5); acima, é só neutro.';
  if (Math.abs(v) < 0.005) return { tom: 'neutro', peso: 0, variacao: v, ajuda, texto: `Preço ${dinheiro(p, moeda)} praticamente igual ao seu preço médio (${dinheiro(pm, moeda)})` };
  if (v < 0) return { tom: 'bom', peso: v <= -0.1 + 1e-9 ? 1.5 : 1, variacao: v, ajuda, texto: `Preço ${dinheiro(p, moeda)} abaixo do seu preço médio ${dinheiro(pm, moeda)} (−${pct}): aporte baixa seu custo médio` };
  return { tom: 'neutro', peso: 0, variacao: v, ajuda, texto: `Preço ${dinheiro(p, moeda)} acima do seu preço médio ${dinheiro(pm, moeda)} (+${pct}): aporte sobe um pouco seu custo médio` };
}

const CLASSE_META = { acoes: 'acoes', fiis: 'fiis', acoesEua: 'usa', rendaFixa: 'rf' };
const normRef = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();

/** O vínculo da meta pega este ativo? Devolve a fração que conta (0-1) e o vínculo. */
function vinculoDoAtivo(meta, alvo) {
  const vincs = (meta.calc && meta.calc.vinculos && meta.calc.vinculos.length ? meta.calc.vinculos : meta.vinculos) || [];
  for (const v of vincs) {
    let pega = false;
    if (v.tipo === 'classe') pega = v.classe === alvo.classeMeta;
    else if (v.tipo === 'marca') pega = alvo.classeMeta === 'rf' && !!alvo.marca && v.marca === alvo.marca;
    else if (v.tipo === 'ativo' || (!v.tipo && v.id)) {
      // 05/10/2026 (A-14): metas-calc!resolverVinculos já devolve o id com o alias resolvido (ticker antigo -> atual)
      const id = normRef(String(v.id || '').split('@')[0]);
      pega = !!id && (id === normRef(alvo.ticker) || (alvo.ref && id === normRef(alvo.ref)));
    }
    if (!pega) continue;
    // 05/10/2026 (A-11): cada ativo conta numa meta só - se este ativo ficou inteiro com outra meta (ou outro vínculo desta), esta não "ganha" com o aporte
    if (v.fracaoPorId && Array.isArray(v.ativos)) {
      const a = v.ativos.find((x) => (alvo.ref && normRef(x.ref) === normRef(alvo.ref)) || normRef(String(x.id || '').split('@')[0]) === normRef(alvo.ticker) || normRef(x.ref) === normRef(alvo.ticker));
      if (a && !(v.fracaoPorId[a.id] > 0)) continue;
    }
    if (v.modo === 'fracao') return { fator: Math.max(0, Math.min(1, Number(v.fracao) || 0)), vinculo: v };
    if (v.modo === 'valor') return { fator: 1, limite: Math.max(0, (Number(v.valor) || 0) - (Number(v.base) || 0)), vinculo: v };
    return { fator: 1, vinculo: v };
  }
  return null;
}

/** Quanto ainda falta (em reais) - na reserva, o valor LÍQUIDO quando a meta traz. */
function faltaDaMeta(m) {
  const c = m.calc || {};
  if (num(c.faltaLiquida) != null) return c.faltaLiquida;
  const atualLiq = num(c.atualLiquidoBRL) != null ? c.atualLiquidoBRL : (c.liquido && num(c.liquido.atual));
  if (atualLiq != null && num(c.alvoBRL) != null) return Math.max(0, c.alvoBRL - atualLiq);
  return num(c.falta);
}

const pctInt = (x) => `${br(x * 100, 0)}%`;

/**
 * 05/10/2026 (Tiago: "reserva no ideal: neutro e sugerir onde mais faz falta"):
 * a meta ativa, que não seja `excluirId`, onde um aporte novo mais faz falta -
 * atrasada/prazo vencido primeiro, depois a que está mais longe (% do alvo).
 * { meta, nome, falta, status } ou null.
 */
export function outraMetaQueFazFalta(metas, excluirId = null) {
  const candidatas = (metas || []).filter((m) => m && m.calc && m.id !== excluirId && m.status !== 'arquivada' && m.status !== 'pausada' && m.tipo !== 'rendaPassiva')
    .map((m) => ({ m, falta: faltaDaMeta(m), alvo: num(m.calc.alvoBRL) }))
    .filter((x) => x.falta != null && x.falta > 0.5 && x.alvo > 0 && x.m.calc.status !== 'concluida' && x.m.calc.status !== 'saldo-ideal');
  if (!candidatas.length) return null;
  const urgencia = (st) => (st === 'vencida' ? 0 : (st === 'atrasada' ? 1 : (st === 'abaixo' || st === 'ideal-bruto' ? 2 : 3)));
  candidatas.sort((a, b) => urgencia(a.m.calc.status) - urgencia(b.m.calc.status) || (b.falta / b.alvo) - (a.falta / a.alvo));
  const x = candidatas[0];
  const rotulo = { vencida: 'prazo passou', atrasada: 'atrasada', abaixo: 'abaixo do ideal', 'ideal-bruto': 'abaixo do ideal' }[x.m.calc.status] || '';
  return { meta: x.m, nome: String(x.m.nome || 'Meta').trim(), falta: x.falta, status: x.m.calc.status, rotulo };
}

/**
 * Metas (Metas e Objetivos) que este aporte ajuda (Tiago: "falta 800 pra
 * chegar à meta de renda emergencial, e investir mais 800 nesse Tesouro
 * Direto 2032, que está cadastrado como renda emergencial, vai atingir sua
 * meta"). metas = lista com `calc` (metas-card!metasComCalculo).
 * valorSugerido = quanto se pensa aportar (moeda do ativo; USD vira R$ pelo
 * câmbio). dy = DY do ativo (fração) pra conta da renda passiva.
 * Devolve até `max` sinais [{ tom, texto, peso, metaId, metaNome, tipo }].
 */
export function sinaisDeMetas({ classe, ticker = '', ref = '', marca = '', metas = null, valorSugerido = null, moeda = 'BRL', cambio = null, dy = null, max = 2 } = {}) {
  if (!Array.isArray(metas) || !metas.length) return [];
  const alvo = { classeMeta: CLASSE_META[classe] || classe, ticker, ref, marca };
  let sugeridoBrl = num(valorSugerido) > 0 ? valorSugerido : null;
  if (sugeridoBrl && moeda === 'USD') sugeridoBrl = num(cambio) > 0 ? sugeridoBrl * cambio : null;
  const out = [];
  metas.forEach((m) => {
    if (!m || !m.calc || m.status === 'arquivada' || m.status === 'pausada') return;
    const vinc = vinculoDoAtivo(m, alvo);
    if (!vinc || !(vinc.fator > 0)) return;
    const nome = String(m.nome || 'Meta').trim();
    const c = m.calc;
    if (m.tipo === 'rendaPassiva') {
      const r = c.renda;
      if (!r || !(r.alvo > 0) || alvo.classeMeta === 'rf') return;
      if (r.atual >= r.alvo) { out.push({ tom: 'neutro', peso: 0, ordem: 4, tipo: 'atingida', metaId: m.id, metaNome: nome, texto: `Meta "${nome}" já atingida (${dinheiro(r.atual)}/mês) - o próximo aporte pode ir pra outra meta` }); return; }
      // 03/10/2026 (revisão): DY conhecido e ZERO (ex. ação americana que não
      // paga dividendo) - o aporte aqui não aumenta a renda; não usa o DY da meta
      if (num(dy) === 0) { out.push({ tom: 'neutro', peso: 0, ordem: 4, tipo: 'sem-renda', metaId: m.id, metaNome: nome, texto: `Meta "${nome}": este ativo não pagou proventos nos últimos 12 meses - aportar aqui não aumenta a sua renda passiva hoje` }); return; }
      const doAtivo = num(dy) > 0;
      const yieldUsado = doAtivo ? dy : (num(m.especificos && m.especificos.dyAnual) > 0 ? m.especificos.dyAnual : null);
      if (!yieldUsado) return;
      const faltaMes = r.alvo - r.atual;
      const porMil = (1000 * yieldUsado * vinc.fator) / 12;
      const dyTxt = `${doAtivo ? 'DY' : 'DY esperado da meta'} ${br(yieldUsado * 100, 1)}%`;
      const quanto = sugeridoBrl
        ? `investir ${dinheiro(sugeridoBrl)} aqui ≈ +${dinheiro((sugeridoBrl * yieldUsado * vinc.fator) / 12)}/mês`
        : `cada R$ 1.000 aqui ≈ +${dinheiro(porMil)}/mês`;
      out.push({ tom: 'bom', peso: 0.5, ordem: 3, tipo: 'renda', metaId: m.id, metaNome: nome,
        texto: `Meta "${nome}" (faltam ${dinheiro(faltaMes)}/mês): ${quanto} (${dyTxt})` });
      return;
    }
    const falta = faltaDaMeta(m);
    const alvoBrl = num(c.alvoBRL);
    if (falta == null || !(alvoBrl > 0)) return;
    if (falta <= 0.5 || c.status === 'concluida' || c.status === 'saldo-ideal') {
      // 03/10/2026 (revisão): viagem/conta com parcelas ainda correndo - o que faltava JUNTAR está guardado, mas a meta não está concluída
      const soParcelas = c.status !== 'concluida' && num(c.parcelasCorrendo) > 0;
      // 05/10/2026: diz ONDE faz mais falta (a meta mais atrasada)
      const outra = outraMetaQueFazFalta(metas, m.id);
      const onde = outra ? ` (mais falta em "${outra.nome}"${outra.rotulo ? `, ${outra.rotulo}` : ''}: faltam ${dinheiro(outra.falta)})` : '';
      out.push({ tom: 'neutro', peso: 0, ordem: 4, tipo: 'atingida', metaId: m.id, metaNome: nome, outraMeta: outra ? outra.nome : null, texto: soParcelas ? `Meta "${nome}": o que faltava juntar já está guardado (só restam as parcelas) - prefira outra meta pro próximo aporte${onde}` : `Meta "${nome}" já atingida - prefira outra meta pro próximo aporte${onde}` });
      return;
    }
    let paraCompletar = falta / vinc.fator;
    if (vinc.limite != null && vinc.limite < falta) return; // vínculo de valor fixo: aporte novo não entra na meta
    paraCompletar = Math.ceil(paraCompletar * 100) / 100;
    const ja = Math.max(0, alvoBrl - falta) / alvoBrl;
    if (!sugeridoBrl || sugeridoBrl >= paraCompletar) {
      if (!sugeridoBrl && falta > 0.5 * alvoBrl && falta > 2000) {
        out.push({ tom: 'bom', peso: 0.5, ordem: 2, tipo: 'conta', metaId: m.id, metaNome: nome, texto: `Conta pra meta "${nome}" (${pctInt(ja)} atingida; faltam ${dinheiro(falta)})` });
        return;
      }
      out.push({ tom: 'bom', peso: 1.5, ordem: 0, tipo: 'completa', metaId: m.id, metaNome: nome, texto: `Faltam ${dinheiro(falta)} pra meta "${nome}"; investir ${dinheiro(paraCompletar)} aqui completa a meta` });
      return;
    }
    const avanca = (sugeridoBrl * vinc.fator) / alvoBrl;
    out.push({ tom: 'bom', peso: 1, ordem: 1, tipo: 'avanca', metaId: m.id, metaNome: nome,
      texto: `Faltam ${dinheiro(falta)} pra meta "${nome}"; investir ${dinheiro(sugeridoBrl)} aqui avança ${br(avanca * 100, avanca < 0.01 ? 1 : 0)}% (de ${pctInt(ja)} para ${pctInt(Math.min(1, ja + avanca))})` });
  });
  return out.sort((a, b) => a.ordem - b.ordem).slice(0, max).map(({ ordem, ...s }) => ({ ...s, ajuda: AJUDA_META[s.tipo] || '' }));
}

/** 05/10/2026: a explicação de 1 linha de cada tipo de sinal de meta (o "i" do momento e da análise). */
const AJUDA_META = {
  completa: 'Compara o que falta pra meta (líquido de IR, na reserva) com o valor que você pensa aportar: se cobre o que falta, completa a meta. Vale 1,5 ponto no momento e 2,5 na leitura da análise.',
  avanca: 'Mostra quanto do alvo da meta este aporte cobre. Vale 1 ponto no momento de aporte.',
  conta: 'A meta ainda está longe e este ativo está ligado a ela: cada aporte aqui conta pra ela. Peso pequeno (0,5).',
  renda: 'Estima quanto de renda mensal o aporte acrescenta, pelo DY do ativo, para a meta de renda passiva. Peso pequeno (0,5).',
  atingida: 'Meta já cumprida (ou, na reserva, no saldo ideal líquido): aportar mais aqui não aproxima você de nada. Peso zero; o texto diz onde faz mais falta.',
  'sem-renda': 'O ativo não pagou proventos nos últimos 12 meses, então não ajuda a meta de renda passiva.',
};
const AJUDA_RF_META = {
  'rf-adequado': 'Lê o tipo do título (Selic, IPCA+, prefixado, CDI, LCI/LCA), o vencimento e a liquidez contra o prazo da meta. Reserva abaixo do ideal + título de liquidez diária e pouca oscilação = a favor.',
  'rf-atencao': 'IPCA+ e prefixado oscilam com a marcação a mercado: resgatar antes do vencimento pode render menos. Em meta curta ou reserva, isso pesa contra; vencer depois da data da meta também.',
  'rf-vencendo': 'Título vencendo em menos de 12 meses sai da reserva: ela só continua no ideal se você reaplicar o dinheiro (o IR é cobrado no vencimento).',
};

// ---------------------------------------------------------------------------
// 05/10/2026: renda fixa x meta (Tiago: "Tesouro Selic 2032 é positivo investir
// se a renda emergencial estiver abaixo do ideal")
// ---------------------------------------------------------------------------

const indexadorDoTitulo = (t) => {
  const txt = `${t.titulo || ''} ${t.descricao || ''} ${t.indexador || ''}`.toUpperCase();
  if (/SELIC/.test(txt)) return 'SELIC';
  if (/IPCA/.test(txt)) return 'IPCA';
  if (/PREFIXAD|\bPR[EÉ]\b/.test(txt)) return 'PRE';
  if (/CDI|CDB/.test(txt)) return 'CDI';
  return String(t.indexador || '').toUpperCase();
};

const vencimentoEmMeses = (venc, hoje) => {
  const s = String(venc || '');
  let m = s.match(/^(\d{2})\/(\d{4})/);
  const mes = m ? `${m[2]}-${m[1]}` : ((m = s.match(/^(\d{4})-(\d{2})/)) ? `${m[1]}-${m[2]}` : null);
  return mes && hoje ? mesesEntreMeta(String(hoje).slice(0, 7), mes) : null;
};

/**
 * Metas de Metas e Objetivos às quais este TÍTULO está vinculado (pelo título,
 * pela marca Renda Emergencial/longo prazo ou pela classe Renda Fixa) lidas
 * como "este título combina com a meta?": o veredito de metas-calc
 * (avaliarAtivoParaMeta: Selic na reserva = bom; IPCA+/prefixado na reserva ou
 * vencendo depois da meta = atenção/ruim; LCI/LCA sem liquidez...), mais:
 *  - na reserva, título que vence em menos de 12 meses (atenção: sai da reserva);
 *  - reserva abaixo do ideal + título adequado = a favor (o pedido do Tiago).
 * `titulo` = { titulo, descricao, indexador, vencimento ('aaaa-mm-dd' | 'mm/aaaa') }.
 * Devolve [{ tom, texto, peso, metaId, metaNome, tipo: 'rf-adequado'|'rf-atencao'|'rf-vencendo' }].
 */
export function sinaisRendaFixaMeta({ titulo = {}, ref = '', marca = '', metas = null, hoje = '' } = {}) {
  if (!Array.isArray(metas) || !metas.length) return [];
  const nomeTitulo = String(titulo.titulo || '').replace(/\s+/g, ' ').trim();
  const alvo = { classeMeta: 'rf', ticker: nomeTitulo, ref, marca };
  const out = [];
  metas.forEach((m) => {
    if (!m || !m.calc || m.status === 'arquivada' || m.status === 'pausada' || m.tipo === 'rendaPassiva') return;
    const vinc = vinculoDoAtivo(m, alvo);
    if (!vinc || !(vinc.fator > 0)) return;
    const nome = String(m.nome || 'Meta').trim();
    const reserva = m.tipo === 'reservaEmergencia';
    const falta = faltaDaMeta(m);
    const incompleta = falta != null && falta > 0.5 && m.calc.status !== 'concluida' && m.calc.status !== 'saldo-ideal';
    // sem saber o tipo (Selic/IPCA+/prefixado/CDI/LCI/LCA), não opina sobre o encaixe (metas-calc trata "não-pós" como prefixado)
    const tipoConhecido = !!indexadorDoTitulo(titulo) || /\b(LCI|LCA)\b/i.test(`${nomeTitulo} ${titulo.descricao || ''}`);
    const av = tipoConhecido ? avaliarAtivoParaMeta({ classe: 'rf', nome: nomeTitulo, descricao: titulo.descricao || '', indexador: titulo.indexador || '', vencimento: titulo.vencimento || null }, m, m.calc) : { veredito: null, motivo: '' };
    const motivo = String(av.motivo || '').replace(/\.\s*$/, '');
    if (!tipoConhecido) { /* só a checagem de vencimento abaixo */ }
    else if (av.veredito === 'bom') {
      if (incompleta) out.push({ tom: 'bom', peso: reserva ? 1 : 0.5, tipo: 'rf-adequado', metaId: m.id, metaNome: nome, texto: `Meta "${nome}" ${reserva ? 'abaixo do ideal' : 'ainda não completa'} e este título combina com ela: ${motivo}` });
      else out.push({ tom: 'neutro', peso: 0, tipo: 'rf-adequado', metaId: m.id, metaNome: nome, texto: `Meta "${nome}": ${motivo}` });
    } else if (av.veredito === 'atencao') out.push({ tom: 'ruim', peso: -0.5, tipo: 'rf-atencao', metaId: m.id, metaNome: nome, texto: `Atenção com a meta "${nome}": ${motivo}` });
    else out.push({ tom: 'ruim', peso: -1.2, tipo: 'rf-atencao', metaId: m.id, metaNome: nome, texto: `Não combina com a meta "${nome}": ${motivo}` });
    if (reserva) {
      const n = vencimentoEmMeses(titulo.vencimento, hoje);
      if (n != null && n >= 0 && n < 12) {
        out.push({ tom: 'ruim', peso: -0.8, tipo: 'rf-vencendo', metaId: m.id, metaNome: nome, texto: `Atenção: este título da reserva "${nome}" vence em ${n <= 1 ? 'menos de 1 mês' : `${n} meses`} e sai dela; reaplique num Tesouro Selic com vencimento longo para a reserva não encolher` });
      }
    }
  });
  return out.sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso)).map((x) => ({ ...x, ajuda: AJUDA_RF_META[x.tipo] || '' }));
}

/** Pontos de carteira/metas na análise (grupo 'carteira', fora da nota). */
function pontosDeCarteira(e) {
  const ind = e.indicadores || {};
  const cart = e.carteira || {};
  const out = [];
  const pm = sinalPrecoMedio({ precoAtual: ind.precoAtual, precoMedio: num(cart.precoMedio) != null ? cart.precoMedio : ind.precoMedio, quantidade: cart.quantidade, moeda: e.moeda === 'USD' ? 'USD' : 'BRL' });
  if (pm) out.push({ criterioId: 'carteira_preco_medio', nome: 'Preço x seu preço médio', grupo: 'carteira', tom: pm.tom, texto: `${pm.texto}.`, valor: pm.variacao, valorTexto: `${pm.variacao >= 0 ? '+' : '−'}${br(Math.abs(pm.variacao) * 100, 1)}%`, faixa: 'abaixo do preço médio', regua: '', fonte: null, fontes: [], peso: pm.tom === 'bom' ? 1.5 : 0.5, eliminatorio: false, informativo: true, ajuda: pm.ajuda });
  sinaisDeMetas({ classe: e.classe, ticker: e.ticker, ref: e.ref, marca: e.marca, metas: e.metas, valorSugerido: e.valorSugerido, moeda: e.moeda, cambio: e.cambio, dy: e.indicadores && e.indicadores.dy, max: 3 })
    .forEach((s) => out.push({ criterioId: `meta_${s.tipo}`, nome: `Meta: ${s.metaNome}`, grupo: 'carteira', tom: s.tom, texto: `${s.texto}.`, valor: null, valorTexto: '', faixa: '', regua: '', fonte: null, fontes: [], peso: s.tipo === 'completa' ? 2.5 : (s.tom === 'bom' ? 1.5 : 0.5), eliminatorio: false, informativo: true, metaId: s.metaId, ajuda: s.ajuda }));
  if (e.classe === 'rendaFixa') {
    sinaisRendaFixaMeta({ titulo: e.titulo || { titulo: e.ticker, indexador: e.indexador, vencimento: e.vencimento, descricao: e.descricaoRf }, ref: e.ref, marca: e.marca, metas: e.metas, hoje: e.hoje })
      .forEach((s) => out.push({ criterioId: `meta_${s.tipo}`, nome: `Meta: ${s.metaNome}`, grupo: 'carteira', tom: s.tom, texto: `${s.texto}.`, valor: null, valorTexto: '', faixa: '', regua: '', fonte: null, fontes: [], peso: Math.abs(s.peso) >= 1 ? 2 : 1, eliminatorio: false, informativo: true, metaId: s.metaId, ajuda: s.ajuda }));
  }
  // contexto de mercado (macro.js): fora da nota, no máximo 2 linhas, cada uma com o "i"
  if (e.macro) {
    const ind0 = e.classe === 'rendaFixa' ? indexadorDoTitulo({ titulo: e.ticker, descricao: e.descricaoRf, indexador: e.indexador }) : '';
    sinaisMacro(e.macro, e.classe, { indexador: ind0 }).forEach((s) => out.push({
      criterioId: `macro_${s.id}`, nome: 'Contexto de mercado', grupo: 'contexto', tom: s.tom === 'ruim' ? 'atencao' : s.tom, texto: s.texto.replace(/^Contexto de mercado:\s*/, '').replace(/^./, (c) => c.toUpperCase()),
      valor: null, valorTexto: '', faixa: '', regua: '', fonte: null, fontes: [], peso: Math.abs(s.peso), pesoFirmado: s.peso, eliminatorio: false, informativo: true, macro: true, ajuda: s.ajuda,
    }));
  }
  return out;
}

const SINAL_TOM = { bom: 1, neutro: 0, atencao: -1, ruim: -1 };

/**
 * "Para o seu aporte" - leitura que junta as metas, o preço x preço médio e o
 * contexto de mercado SEM mexer na nota de fundamentos:
 *  - metas: soma limitada a [-2, +2,5] (completar uma meta = +2,5);
 *  - preço abaixo do seu médio: +0,5; contexto de mercado: no máximo ±0,5;
 *  - nunca "a favor" com eliminatório ou nota < 55 (renda fixa não tem nota:
 *    vale a meta); nota < 45 limita a "neutro" no máximo.
 * { nivel: 'favoravel'|'neutro'|'cautela', rotulo, texto, pontos, favor[], contra[] } ou null.
 */
export function leituraParaVoce(pontos, { nota = null, eliminatorios = 0, ehRf = false } = {}) {
  const metaPts = pontos.filter((p) => p.grupo === 'carteira' && p.metaId);
  const macroPts = pontos.filter((p) => p.grupo === 'contexto');
  const pm = pontos.find((p) => p.criterioId === 'carteira_preco_medio');
  if (!metaPts.length && !(pm && pm.tom === 'bom')) return null; // só o contexto de mercado não vira leitura (ele já aparece em linhas próprias)
  const firmado = (p) => (SINAL_TOM[p.tom] || 0) * Math.min(p.peso, 2.5);
  const meta = Math.max(-2, Math.min(2.5, metaPts.reduce((t, p) => t + firmado(p), 0)));
  const macro = Math.max(-LIMITE_PONTOS_MACRO, Math.min(LIMITE_PONTOS_MACRO, macroPts.reduce((t, p) => t + (p.pesoFirmado || 0), 0)));
  const preco = pm && pm.tom === 'bom' ? 0.5 : 0;
  const total = Math.round((meta + macro + preco) * 10) / 10;
  const fraco = !ehRf && typeof nota === 'number' && nota < 55;
  let nivel = 'neutro';
  if (eliminatorios > 0) nivel = 'cautela';
  else if (total >= 2 && !fraco && (ehRf || typeof nota === 'number')) nivel = 'favoravel';
  else if (total <= -1) nivel = 'cautela';
  const favor = []; const contra = [];
  metaPts.forEach((p) => { (SINAL_TOM[p.tom] > 0 ? favor : (SINAL_TOM[p.tom] < 0 ? contra : [])).push(p.nome.replace(/^Meta: /, 'meta ')); });
  if (preco) favor.push('preço abaixo do seu médio');
  const liquidoMacro = macroPts.reduce((t, p) => t + (p.pesoFirmado || 0), 0); // soma dos sinais: só o saldo aparece no texto
  if (liquidoMacro > 0.05) favor.push('contexto de mercado'); else if (liquidoMacro < -0.05) contra.push('contexto de mercado');
  const uniq = (xs) => xs.filter((x, i) => xs.indexOf(x) === i);
  const partes = [];
  if (favor.length) partes.push(`A favor: ${uniq(favor).join(', ')}.`);
  if (contra.length) partes.push(`Atenção: ${uniq(contra).join(', ')}.`);
  if (eliminatorios > 0) partes.push('Há critério eliminatório nos fundamentos.');
  else if (fraco && total >= 2) partes.push('Fundamentos abaixo do ideal: as metas sozinhas não bastam.');
  if (!partes.length) partes.push('Metas e contexto sem sinal forte.');
  return { nivel, rotulo: { favoravel: 'Bom momento para o seu aporte', neutro: 'Momento neutro', cautela: 'Melhor esperar' }[nivel], texto: partes.join(' '), pontos: total, favor: uniq(favor), contra: uniq(contra) };
}

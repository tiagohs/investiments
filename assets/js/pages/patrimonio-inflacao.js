/**
 * patrimonio-inflacao.js - 03/10/2026: seção "Patrimônio vs. inflação
 * (rentabilidade real)" da aba Patrimônio da Organização Financeira.
 *
 * Tiago: "Gráfico de linhas sobrepostas comparando o crescimento do
 * patrimônio líquido contra os principais indexadores (CDI e IPCA).
 * Demonstrar se meu patrimônio líquido como um todo está crescendo acima da
 * inflação. Incluir um senso final: se está ou não; se estiver, o porquê e o
 * que continuar fazendo; se não, como melhorar."
 *
 * O patrimônio líquido cresce por APORTES (salário) e não só por rendimento,
 * então a tela mostra duas leituras:
 *  1) Em R$ (com aportes): o patrimônio líquido de cada mês contra "o
 *     patrimônio do início + cada aporte, corrigidos pelo IPCA" (o mínimo pra
 *     manter o poder de compra do que você tinha e colocou) e "... pelo CDI".
 *  2) Rentabilidade (sem aportes): Dietz modificado mês a mês -
 *     retorno = (PLfim − PLini − fluxo) / (PLini + fluxo/2) - encadeado e
 *     comparado com o IPCA e o CDI acumulados.
 *
 * O que é RETORNO em cada mês (o resto da variação do patrimônio é FLUXO):
 *  - investimentos: variação − aporte do mês (compras − vendas − proventos,
 *    o mesmo fluxo do TWR da Início: historicoMensal[].aporte);
 *  - apê: valorização pelo índice (o mês da compra é fluxo, não retorno);
 *  - FGTS: ~JAM do saldo do mês anterior (0,4% ao mês, o mesmo de
 *    projetarFgts) - o depósito do empregador é fluxo (vem do salário);
 *  - dívidas: saldo subindo (juros capitalizados) é retorno negativo; saldo
 *    caindo é amortização = transferência do salário (fluxo), não retorno.
 *
 * Fora da conta: "outros bens/dívidas" (só se sabe o valor de hoje).
 * Datas 'aaaa-mm-dd', meses 'aaaa-mm'. As contas (sem DOM) são exportadas
 * pros testes; montarPatrimonioVsInflacao desenha.
 */
import { formatNumeroBR } from '../format.js';
import { ligarFiltroPeriodo, ehPeriodoPersonalizado } from '../periodo-personalizado.js';
import { analisarSerie, renderAnalise } from '../analise-grafico.js';
import {
  mesDe, valorImovel, saldoFgtsEm, saldoFinanciamento, saldoFies, extrasFinanciamento, aporteMedio,
} from './patrimonio-calc.js';
import { brl0, mil, mesAno, barrasDivergentes } from './patrimonio-graficos.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const soma = (arr, f = (x) => x) => (arr || []).reduce((s, x) => s + (Number(f(x)) || 0), 0);
const f1 = (v) => v.toFixed(1);

/** JAM + TR do FGTS por mês (mesmo valor de projetarFgts em patrimonio-calc.js). */
export const JAM_FGTS_MENSAL = 0.004;
/** Mês com retorno acima disso (em módulo) é tratado como dado ruim e fica de fora do encadeamento. */
const RETORNO_MENSAL_MAX = 0.5;
const DIA = 86400000;

export const PERIODOS_INFLACAO = [
  { id: '12m', rotulo: '12M', dias: 365, desc: 'em 12 meses' },
  { id: '3a', rotulo: '3A', dias: 365 * 3 + 1, desc: 'em 3 anos' },
  { id: '5a', rotulo: '5A', dias: 365 * 5 + 1, desc: 'em 5 anos' },
  { id: 'tudo', rotulo: 'Tudo', dias: null, desc: 'desde o início' },
];

// cores das linhas = as mesmas do CDI e do IPCA nos gráficos de Renda Fixa
// da Início/Carteiras (inicio.js BENCHMARKS_POR_VISAO: CDI --ink-faint,
// IPCA --usa, os dois tracejados "6 4"); patrimônio = a cor da carteira (--acoes)
export const LINHAS_INFLACAO = [
  { id: 'pl', nome: 'Patrimônio líquido', cor: 'var(--acoes)', dash: null, curto: 'Você' },
  { id: 'ipca', nome: 'Aportes + IPCA', nomePct: 'IPCA', cor: 'var(--usa)', dash: '6 4', curto: 'IPCA' },
  { id: 'cdi', nome: 'Aportes + CDI', nomePct: 'CDI', cor: 'var(--ink-faint)', dash: '6 4', curto: 'CDI' },
];

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

function fimDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);
const isoMenosDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * DIA).toISOString().slice(0, 10);
const mesCurto = (m) => { const t = mesAno(m); return t.replace(/\/(\d{2})(\d{2})$/, '/$2'); };

// ---------------------------------------------------------------------------
// Índices mensais (CDI e IPCA) a partir dos níveis base 100 do fim de cada mês
// ---------------------------------------------------------------------------

/**
 * Taxa de cada mês (k ≥ 1: nível_k / nível_{k−1} − 1). Os últimos meses sem
 * índice divulgado (nível igual ao do mês anterior - o IPCA sai ~10 dias
 * depois do fim do mês) recebem a média dos últimos 12 meses divulgados
 * (o mês de hoje, proporcional aos dias corridos) e ficam marcados.
 */
export function taxasMensaisIndice(niveis, meses, hoje) {
  const n = niveis.length;
  const taxas = niveis.map((v, k) => (k === 0 || !num(v) || !num(niveis[k - 1]) || !(niveis[k - 1] > 0) ? null : v / niveis[k - 1] - 1));
  let ult = -1;
  for (let k = 1; k < n; k += 1) if (num(taxas[k]) && taxas[k] !== 0) ult = k;
  if (ult < 0) return { taxas: taxas.map((t, k) => (k === 0 ? null : 0)), estimados: [], ultimo: null, semDados: true, faltando: 0 };
  const divulgadas = taxas.slice(1, ult + 1).filter(num).slice(-12);
  const mediaG = divulgadas.length ? divulgadas.reduce((f, t) => f * (1 + t), 1) ** (1 / divulgadas.length) - 1 : 0;
  const estimados = [];
  const mesHoje = mesDe(hoje);
  for (let k = ult + 1; k < n; k += 1) {
    let frac = 1;
    if (meses[k] === mesHoje && hoje && String(hoje).length >= 10) {
      const dia = Number(String(hoje).slice(8, 10));
      frac = dia / Number(fimDoMes(mesHoje).slice(8, 10));
    }
    taxas[k] = (1 + mediaG) ** frac - 1;
    estimados.push(meses[k]);
  }
  let faltando = 0;
  for (let k = 1; k <= ult; k += 1) if (!num(taxas[k])) { taxas[k] = 0; faltando += 1; }
  return { taxas, estimados, ultimo: meses[ult], semDados: false, faltando };
}

// ---------------------------------------------------------------------------
// Série mensal do patrimônio líquido, com retorno e fluxo de cada mês
// ---------------------------------------------------------------------------

/**
 * Campos usados de `patrimonio` (getPatrimonio): hoje; historicoMensal[]
 * { mes, patrimonio (investimentos + reserva), aporte, indiceCdi, indiceIpca };
 * config { imovel, financiamento, fgts, fies }; indices { fipezap, ivgr }.
 * `ctx` (contextoPatrimonio, opcional): ritmo - aporte médio, usado só se o
 * histórico não trouxer o aporte do mês (aproximação: aporte fixo).
 */
export function seriesReais(patrimonio, { hoje = null, ctx = null } = {}) {
  const d = patrimonio || {};
  const cfg = d.config || {};
  const hj = hoje || d.hoje || '';
  const mesHoje = mesDe(hj) || '9999-12';
  const hm = (d.historicoMensal || [])
    .filter((p) => p && /^\d{4}-\d{2}$/.test(String(p.mes)) && num(p.patrimonio) && p.mes <= mesHoje)
    .sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const avisos = [];
  const temAporte = hm.some((p) => num(p.aporte));
  let aporteFixo = 0;
  if (!temAporte) {
    aporteFixo = ctx && num(ctx.ritmo) ? ctx.ritmo : (aporteMedio(hm, hj, 12) || 0);
    if (hm.length) avisos.push('aportes');
  }
  const meses = hm.map((p) => p.mes);
  const ipca = taxasMensaisIndice(hm.map((p) => p.indiceIpca), meses, hj);
  const cdi = taxasMensaisIndice(hm.map((p) => p.indiceCdi), meses, hj);
  const extras = extrasFinanciamento(cfg.financiamento, cfg.fgts);
  const taxaDivida = {
    fin: cfg.financiamento && num(cfg.financiamento.taxaAnual) ? cfg.financiamento.taxaAnual / 12 : 0,
    fies: cfg.fies && num(cfg.fies.taxaMensal) ? cfg.fies.taxaMensal : 0,
  };
  const comp = hm.map((p) => {
    const imo = cfg.imovel ? valorImovel(cfg.imovel, d.indices, p.mes) : null;
    const imovel = imo && num(imo.valor) ? imo.valor : 0;
    const fgts = saldoFgtsEm(cfg.fgts, p.mes) || 0;
    const fin = saldoFinanciamento(cfg.financiamento, p.mes, extras) || 0;
    const fies = saldoFies(cfg.fies, p.mes) || 0;
    const inv = p.patrimonio;
    return {
      mes: p.mes, data: p.mes === mesHoje && hj.length >= 10 ? hj.slice(0, 10) : fimDoMes(p.mes),
      inv, imovel, fgts, fin, fies, divida: fin + fies, pl: inv + imovel + fgts - fin - fies,
      aporte: temAporte ? (num(p.aporte) ? p.aporte : 0) : aporteFixo,
    };
  });
  const pontos = comp.map((b, k) => {
    const out = { ...b, ipca: ipca.taxas[k], cdi: cdi.taxas[k], ipcaEstimado: ipca.estimados.includes(b.mes), cdiEstimado: cdi.estimados.includes(b.mes) };
    if (k === 0) return { ...out, retorno: null, fluxo: null, partes: null };
    const a = comp[k - 1];
    const rInv = b.inv - a.inv - b.aporte;
    const rImovel = a.imovel > 0 && b.imovel > 0 ? b.imovel - a.imovel : 0;
    const compraImovel = b.imovel - a.imovel - rImovel;
    const rFgts = a.fgts > 0 && b.fgts !== a.fgts ? a.fgts * JAM_FGTS_MENSAL : 0;
    let juros = 0; let nova = 0; let amortizado = 0; let jurosPagos = 0;
    ['fin', 'fies'].forEach((c) => {
      // juros pagos na parcela (estimados pela taxa do contrato, sem TR) - custo
      // de moradia/estudo pago com o salário: fora do retorno, só no "e se"
      const capitalizado = a[c] > 0 && b[c] > a[c] ? b[c] - a[c] : 0;
      if (a[c] > 0) jurosPagos += Math.max(0, a[c] * taxaDivida[c] - capitalizado);
      if (a[c] > 0 && b[c] > a[c]) juros += b[c] - a[c];
      else if (!(a[c] > 0) && b[c] > 0) nova += b[c];
      else if (a[c] > 0 && b[c] < a[c]) amortizado += a[c] - b[c];
    });
    const retorno = rInv + rImovel + rFgts - juros;
    const fluxo = b.pl - a.pl - retorno;
    return {
      ...out, retorno, fluxo, rInv, rImovel, rFgts, juros, jurosPagos,
      partes: { aportes: b.aporte, rendimento: rInv, imovel: rImovel, dividas: amortizado - juros, fgts: b.fgts - a.fgts, compra: compraImovel - nova },
    };
  });
  if (ipca.estimados.length) avisos.push('ipcaEstimado');
  return {
    pontos, avisos, aportesAproximados: !temAporte,
    ipca: { ultimo: ipca.ultimo, estimados: ipca.estimados, semDados: ipca.semDados || !hm.length },
    cdi: { ultimo: cdi.ultimo, estimados: cdi.estimados, semDados: cdi.semDados || !hm.length },
    componentes: {
      imovel: comp.some((c) => c.imovel > 0), fgts: comp.some((c) => c.fgts > 0),
      financiamento: comp.some((c) => c.fin > 0), fies: comp.some((c) => c.fies > 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Dietz modificado
// ---------------------------------------------------------------------------

/**
 * pontos [{ valor, fluxo }] (o 1º é a base): r_k = (V_k − V_{k−1} − F_k) /
 * (V_{k−1} + F_k/2), encadeado. Mês com base ≤ `minBase` (patrimônio
 * zerado/negativo) ou retorno absurdo (> 50% no mês) fica de fora.
 */
export function retornoDietz(pontos, { minBase = 0 } = {}) {
  const mensais = [null];
  const curva = [0];
  let f = 1;
  let semBase = 0;
  for (let k = 1; k < (pontos || []).length; k += 1) {
    const a = pontos[k - 1]; const b = pontos[k];
    const fl = num(b.fluxo) ? b.fluxo : 0;
    const base = a.valor + fl / 2;
    const r = base > minBase ? (b.valor - a.valor - fl) / base : null;
    if (!num(r) || Math.abs(r) > RETORNO_MENSAL_MAX) { semBase += 1; mensais.push(null); curva.push(f - 1); continue; }
    f *= 1 + r;
    mensais.push(r);
    curva.push(f - 1);
  }
  const validos = mensais.filter(num).length;
  return { mensais, curva, acumulado: validos ? f - 1 : null, meses: validos, mesesSemBase: semBase };
}

const anualizar = (acc, dias) => (num(acc) && dias >= 360 ? (1 + acc) ** (365.25 / dias) - 1 : null);
const composto = (taxas) => taxas.reduce((f, t) => f * (1 + (num(t) ? t : 0)), 1) - 1;

// ---------------------------------------------------------------------------
// Janela (período do filtro) e o resumo de tudo que a tela mostra
// ---------------------------------------------------------------------------

/** Índices [i0, i1] da janela: base = último mês fechado antes do início. */
export function janelaDoPeriodo(pontos, periodo, hoje) {
  const n = (pontos || []).length;
  if (n < 2) return null;
  let i0 = 0; let i1 = n - 1;
  if (ehPeriodoPersonalizado(periodo)) {
    const ini = periodo.inicio <= periodo.fim ? periodo.inicio : periodo.fim;
    const fim = periodo.inicio <= periodo.fim ? periodo.fim : periodo.inicio;
    i1 = -1;
    pontos.forEach((p, k) => { if (p.data <= fim || p.mes <= mesDe(fim)) i1 = k; });
    i0 = 0;
    pontos.forEach((p, k) => { if (p.data < ini) i0 = k; });
  } else {
    const def = PERIODOS_INFLACAO.find((x) => x.id === periodo);
    if (def && def.dias) {
      const corte = isoMenosDias(hoje || pontos[n - 1].data, def.dias);
      i0 = 0;
      pontos.forEach((p, k) => { if (p.data <= corte) i0 = k; });
    }
  }
  if (i1 < 0 || i0 >= i1) return null;
  return [i0, i1];
}

/**
 * Tudo que a tela mostra pro período: linhas do gráfico (R$ e %), Dietz do
 * patrimônio e dos investimentos, IPCA/CDI acumulados, quanto a inflação
 * "custou", decomposição do crescimento.
 */
export function resumoPeriodo(base, periodo, { hoje = null } = {}) {
  const todos = (base && base.pontos) || [];
  const jan = janelaDoPeriodo(todos, periodo, hoje);
  if (!jan) return null;
  let W = todos.slice(jan[0], jan[1] + 1);
  const maxAbs = Math.max(...W.map((p) => Math.abs(p.pl)), 1);
  const minBase = Math.max(1000, 0.01 * maxAbs);
  // rentabilidade sobre patrimônio líquido negativo/zerado não tem sentido
  // (ex.: FIES maior que os investimentos): a janela começa depois do último
  // mês assim, e a tela avisa
  let cortadoDe = null;
  let ultimoRuim = -1;
  W.forEach((p, k) => { if (k < W.length - 1 && !(p.pl > minBase)) ultimoRuim = k; });
  if (ultimoRuim >= 0) {
    if (ultimoRuim + 1 >= W.length - 1) return null;
    cortadoDe = W[0].mes;
    W = W.slice(ultimoRuim + 1);
  }
  const p0 = W[0]; const pF = W[W.length - 1];
  const dias = Math.max(1, diasEntre(p0.data, pF.data));
  const anualizado = dias >= 360;
  const dPl = retornoDietz(W.map((p) => ({ valor: p.pl, fluxo: p.fluxo })), { minBase });
  // "e se" os juros pagos nas parcelas contassem como perda: o salário pagou juros + amortização (fluxo), o patrimônio perdeu os juros
  const dPlJ = retornoDietz(W.map((p, k) => ({ valor: p.pl, fluxo: k ? p.fluxo + (p.jurosPagos || 0) : 0 })), { minBase });
  const dInv = retornoDietz(W.map((p) => ({ valor: p.inv, fluxo: p.aporte })), { minBase: Math.max(1000, 0.01 * Math.max(...W.map((p) => Math.abs(p.inv)), 1)) });
  let bI = p0.pl; let bC = p0.pl; let bInvC = p0.inv; let fI = 1; let fC = 1;
  const linhas = W.map((p, k) => {
    if (k > 0) {
      const i = p.ipca || 0; const c = p.cdi || 0;
      bI = bI * (1 + i) + p.fluxo * (1 + i / 2);
      bC = bC * (1 + c) + p.fluxo * (1 + c / 2);
      bInvC = bInvC * (1 + c) + p.aporte * (1 + c / 2);
      fI *= 1 + i; fC *= 1 + c;
    }
    return {
      mes: p.mes, data: p.data, pl: p.pl, ipca: bI, cdi: bC, inv: p.inv,
      pctPl: dPl.curva[k], pctInv: dInv.curva[k], pctIpca: fI - 1, pctCdi: fC - 1,
      fluxo: k ? p.fluxo : null, retorno: k ? p.retorno : null, aporte: k ? p.aporte : null,
      ipcaMes: k ? p.ipca : null, cdiMes: k ? p.cdi : null, ipcaEstimado: k ? p.ipcaEstimado : false,
    };
  });
  const passos = W.slice(1);
  const ipcaAcc = composto(passos.map((p) => p.ipca));
  const cdiAcc = composto(passos.map((p) => p.cdi));
  const fluxos = soma(passos, (p) => p.fluxo);
  const retornos = soma(passos, (p) => p.retorno);
  const partes = {};
  ['aportes', 'rendimento', 'imovel', 'dividas', 'fgts', 'compra'].forEach((c) => { partes[c] = soma(passos, (p) => p.partes[c]); });
  // valorização do apê no período (só os meses em que já era seu)
  const mesesImo = passos.filter((p, k) => W[k].imovel > 0 && p.imovel > 0);
  const imovelAcc = mesesImo.length ? mesesImo.reduce((f, p) => f * (p.imovel / (p.imovel - p.rImovel)), 1) - 1 : null;
  const diasImo = mesesImo.length ? diasEntre(W[passos.indexOf(mesesImo[0])].data, mesesImo[mesesImo.length - 1].data) : 0;
  const nMeses = passos.length;
  const real = (acc) => (num(acc) ? (1 + acc) / (1 + ipcaAcc) - 1 : null);
  return {
    de: p0.mes, ate: pF.mes, dataDe: p0.data, dataAte: pF.data, dias, anualizado, meses: nMeses, cortadoDe,
    periodo, linhas,
    pl: {
      inicio: p0.pl, fim: pF.pl, variacao: pF.pl - p0.pl, variacaoPct: p0.pl > 0 ? pF.pl / p0.pl - 1 : null,
      realPct: p0.pl > 0 ? pF.pl / (1 + ipcaAcc) / p0.pl - 1 : null,
      acumulado: dPl.acumulado, anual: anualizar(dPl.acumulado, dias), real: real(dPl.acumulado), realAnual: anualizar(real(dPl.acumulado), dias),
      pctCdi: num(dPl.acumulado) && cdiAcc > 0.001 ? dPl.acumulado / cdiAcc : null, mesesSemBase: dPl.mesesSemBase,
      comJuros: { acumulado: dPlJ.acumulado, anual: anualizar(dPlJ.acumulado, dias) },
    },
    jurosPagos: soma(passos, (p) => p.jurosPagos),
    inv: {
      inicio: p0.inv, fim: pF.inv, acumulado: dInv.acumulado, anual: anualizar(dInv.acumulado, dias),
      real: real(dInv.acumulado), realAnual: anualizar(real(dInv.acumulado), dias),
      pctCdi: num(dInv.acumulado) && cdiAcc > 0.001 ? dInv.acumulado / cdiAcc : null,
      comCdi: bInvC, faltouCdi: bInvC - pF.inv, mesesSemBase: dInv.mesesSemBase,
    },
    ipca: { acumulado: ipcaAcc, anual: anualizar(ipcaAcc, dias), estimados: passos.filter((p) => p.ipcaEstimado).map((p) => p.mes) },
    cdi: { acumulado: cdiAcc, anual: anualizar(cdiAcc, dias) },
    benchmarks: { ipca: bI, cdi: bC, excessoIpca: pF.pl - bI, excessoCdi: pF.pl - bC },
    fluxos, retornos, custoInflacao: bI - (p0.pl + fluxos), partes,
    imovel: imovelAcc != null ? { acumulado: imovelAcc, anual: anualizar(imovelAcc, diasImo) } : null,
    aporteMensal: nMeses ? partes.aportes / nMeses : null,
    amortizacaoMensal: nMeses ? partes.dividas / nMeses : null,
  };
}

// ---------------------------------------------------------------------------
// Veredito
// ---------------------------------------------------------------------------

const pct = (f, casas = 1) => (num(f) ? `${f > 0.00005 ? '+' : f < -0.00005 ? '−' : ''}${formatNumeroBR(Math.abs(f) * 100, casas)}%` : '—');
const pctAbs = (f, casas = 1) => (num(f) ? `${formatNumeroBR(Math.abs(f) * 100, casas)}%` : '—');
const ppTxt = (v) => `${formatNumeroBR(Math.abs(v), Math.abs(v) >= 10 ? 0 : 1)} p.p.`;
const milAbs = (v) => mil(Math.abs(v || 0));

export const NOMES_PARTES = {
  aportes: 'Aportes nos investimentos', rendimento: 'Rendimento dos investimentos', imovel: 'Valorização do apê',
  dividas: 'Redução das dívidas', fgts: 'FGTS (depósitos + JAM − saques)', compra: 'Compra do apê (entrada)',
};

/**
 * "Está crescendo acima da inflação?" - pela rentabilidade (Dietz, sem os
 * aportes): o p.p. por ano entre ela e o IPCA. Tom 'bom' (≥ 1 p.p. acima e
 * ainda acima do IPCA contando os juros das dívidas como perda) ou 'atencao'. Porquê = decomposição; continuar/melhorar = regras com os números.
 * `opcoes`: { aporteMeta } (meta de aporte mensal da Distribuição e Metas).
 */
export function veredito(r, { aporteMeta = null } = {}) {
  if (!r) return null;
  const aa = r.anualizado ? 'ao ano' : 'no período';
  const twr = r.anualizado ? r.pl.anual : r.pl.acumulado;
  const ipca = r.anualizado ? r.ipca.anual : r.ipca.acumulado;
  const cdi = r.anualizado ? r.cdi.anual : r.cdi.acumulado;
  const itensPorque = Object.entries(r.partes).filter(([, v]) => Math.abs(v) >= 1).map(([id, v]) => ({ id, nome: NOMES_PARTES[id], valor: v }))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const base = { periodoTxt: `${mesAno(r.de)} → ${mesAno(r.ate)}`, itensPorque, continuar: [], melhorar: [] };
  if (!num(twr) || !num(ipca)) {
    return { ...base, sim: null, tom: 'atencao', pp: null, titulo: 'Ainda não dá pra dizer', subtitulo: 'Faltam meses com patrimônio e índices suficientes neste período. Escolha um período maior.' };
  }
  const pp = (twr - ipca) * 100;
  const sim = pp > 0;
  // 'bom' só com folga (≥ 1 p.p.) e sem virar "abaixo do IPCA" quando os juros das dívidas contam como perda (calculado abaixo)
  let tom = sim && pp >= 1 ? 'bom' : 'atencao';
  const unidade = r.anualizado ? 'por ano' : 'no período';
  const titulo = sim
    ? `${pp < 1 ? 'Sim, por pouco' : 'Sim'}: seu patrimônio está crescendo ${ppTxt(pp)} ${unidade} acima da inflação`
    : `Não: seu patrimônio está rendendo ${ppTxt(pp)} ${unidade} abaixo da inflação`;
  const ex = r.benchmarks.excessoIpca;
  const subtitulo = `Descontando os aportes, ele rendeu ${pct(twr)} ${aa}, contra ${pct(ipca)} do IPCA e ${pct(cdi)} do CDI. `
    + `Contando os aportes, você tem ${milAbs(ex)} ${ex >= 0 ? 'a mais' : 'a menos'} do que o necessário só pra manter o poder de compra do que tinha e aportou`
    + ` (a inflação comeu ${milAbs(r.custoInflacao)}; os rendimentos somaram ${r.retornos < 0 ? '−' : ''}${milAbs(r.retornos)}).`;

  // por quê: o que mais moveu o patrimônio
  const cresc = r.pl.variacao;
  const positivos = itensPorque.filter((i) => i.valor > 0 && i.id !== 'compra');
  let porqueTxt = '';
  if (positivos.length && cresc > 0) {
    const top = positivos[0];
    porqueTxt = `O patrimônio cresceu ${milAbs(cresc)} no período. O que mais pesou: ${top.nome.toLowerCase()} (${milAbs(top.valor)}, ${formatNumeroBR(Math.min(999, (top.valor / cresc) * 100), 0)}% do crescimento)`
      + `${positivos[1] ? `, depois ${positivos[1].nome.toLowerCase()} (${milAbs(positivos[1].valor)})` : ''}.`;
  } else if (cresc <= 0) {
    porqueTxt = `O patrimônio ${cresc < 0 ? `caiu ${milAbs(cresc)}` : 'ficou parado'} no período.`;
  }

  // juros das dívidas: fora do retorno (custo de moradia/estudo pago com o salário), mas a conta "e se" fica visível
  let jurosTxt = '';
  const twrJ = r.anualizado ? r.pl.comJuros.anual : r.pl.comJuros.acumulado;
  const ppJ = num(twrJ) ? (twrJ - ipca) * 100 : null;
  if (r.jurosPagos >= 1 && num(ppJ)) {
    jurosTxt = `Os juros das parcelas (~${milAbs(r.jurosPagos)} no período, pela taxa do contrato) ficam de fora, como custo de moradia/estudo pago com o salário. Se contassem como perda, a rentabilidade seria ${pct(twrJ)} ${aa}: ${ppTxt(ppJ)} ${ppJ >= 0 ? 'acima' : 'abaixo'} do IPCA.`;
  }
  if (num(ppJ) && ppJ < 0 && r.jurosPagos >= 1) tom = 'atencao';
  const C = []; const M = [];
  // investimentos
  const inv = r.inv;
  const invT = r.anualizado ? inv.anual : inv.acumulado;
  if (num(invT)) {
    const pctCdiInv = num(inv.pctCdi) ? `${formatNumeroBR(inv.pctCdi * 100, 0)}% do CDI` : null;
    const invPp = (invT - ipca) * 100;
    if (invPp < 0) {
      M.push({ id: 'investimentos', html: `Seus investimentos renderam <b>${esc(pct(invT))} ${aa}</b>, abaixo do IPCA (${esc(pct(ipca))})${inv.faltouCdi > 1 ? `: se tivessem rendido o CDI, você teria <b>${esc(milAbs(inv.faltouCdi))} a mais</b> hoje` : ''}. Tire dinheiro parado de conta/poupança, prefira pós-fixados de 100% do CDI ou mais e, pro longo prazo, títulos IPCA+.` });
    } else if (num(inv.pctCdi) && inv.pctCdi < 0.9 && cdi > 0) {
      M.push({ id: 'investimentos', html: `Seus investimentos bateram a inflação (<b>${esc(pct(invT))} ${aa}</b> contra ${esc(pct(ipca))}), mas ficaram em <b>${esc(pctCdiInv)}</b>${inv.faltouCdi > 1 ? `: o CDI teria dado ${esc(milAbs(inv.faltouCdi))} a mais` : ''}. Confira taxas e dinheiro parado; a renda variável oscila, então julgue ela em 3 a 5 anos.` });
    } else {
      C.push({ id: 'investimentos', html: `Seus investimentos renderam <b>${esc(pct(invT))} ${aa}</b>${pctCdiInv ? ` (${esc(pctCdiInv)})` : ''}, ${esc(ppTxt(invPp))} acima do IPCA. Mantenha a estratégia e o rebalanceamento.` });
    }
  }
  // aportes
  const ap = r.aporteMensal;
  if (num(ap)) {
    const share = cresc > 0 ? r.partes.aportes / cresc : 0;
    if (ap <= 0) {
      M.push({ id: 'aportes', html: `No período saiu mais dinheiro dos investimentos do que entrou (<b>${esc(brl0(ap))}/mês</b> em média). Retomar os aportes é o primeiro passo.` });
    } else {
      if (share >= 0.3) C.push({ id: 'aportes', html: `Os aportes são o motor: <b>${esc(brl0(ap))}/mês</b> em média nos investimentos (${esc(formatNumeroBR(Math.min(999, share * 100), 0))}% do crescimento). Continue aportando: é o que mais move o patrimônio.` });
      if (num(aporteMeta) && aporteMeta > 0 && ap < aporteMeta * 0.9) {
        M.push({ id: 'meta', html: `Sua média de aporte (<b>${esc(brl0(ap))}/mês</b>) está abaixo da meta (${esc(brl0(aporteMeta))}/mês): fechar essa diferença soma <b>${esc(mil((aporteMeta - ap) * 12))} por ano</b>.` });
      }
    }
  }
  // dívidas
  if (r.partes.dividas > 1 && num(r.amortizacaoMensal)) {
    C.push({ id: 'dividas', html: `As parcelas abateram <b>${esc(milAbs(r.partes.dividas))}</b> de dívida (~${esc(brl0(r.amortizacaoMensal))}/mês): isso vira patrimônio todo mês. Siga em dia.` });
  } else if (r.partes.dividas < -1) {
    M.push({ id: 'dividas', html: `O saldo das dívidas <b>subiu ${esc(milAbs(r.partes.dividas))}</b> com os juros. Quitar ou amortizar a mais cara primeiro é retorno garantido.` });
  }
  // imóvel
  if (r.imovel && num(r.imovel.acumulado)) {
    const imoT = r.anualizado && num(r.imovel.anual) ? r.imovel.anual : r.imovel.acumulado;
    const aaImo = r.anualizado && num(r.imovel.anual) ? 'ao ano' : 'no período';
    if (imoT >= ipca) C.push({ id: 'imovel', html: `O apê valorizou <b>${esc(pct(imoT))} ${aaImo}</b>, acima do IPCA (${esc(pct(ipca))}): ele protege essa parte do patrimônio da inflação.` });
    else M.push({ id: 'imovel', html: `O apê valorizou <b>${esc(pct(imoT))} ${aaImo}</b>, abaixo do IPCA (${esc(pct(ipca))}): sozinho ele perde poder de compra, então quem precisa bater a inflação são os investimentos.` });
  }
  if (num(ppJ) && ppJ < 0 && sim && r.jurosPagos >= 1) {
    M.push({ id: 'juros', html: `Contando os juros das dívidas como perda, o patrimônio fica <b>${esc(ppTxt(ppJ))} ${aa === 'ao ano' ? 'por ano' : 'no período'} abaixo do IPCA</b>: a alavancagem do apê ainda custa mais do que ele valoriza. Amortizar a dívida mais cara é retorno garantido; compare no simulador "amortizar ou investir".` });
  }
  return { ...base, sim, tom, pp, ppComJuros: ppJ, titulo, subtitulo, porqueTxt, jurosTxt, continuar: C, melhorar: M };
}

// ---------------------------------------------------------------------------
// Gráfico (SVG puro): três linhas numa escala só
// ---------------------------------------------------------------------------

function passoRedondo(amplitude, n = 4) {
  const bruto = amplitude / n || 1;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((k) => k * pot).find((p) => p >= bruto) || pot * 10;
}
const eixoRs = (v) => (v === 0 ? '0' : `${v < 0 ? '−' : ''}${Math.abs(v) >= 1e6 ? `${formatNumeroBR(Math.abs(v) / 1e6, Math.abs(v) % 1e6 ? 1 : 0)} mi` : `${formatNumeroBR(Math.abs(v) / 1000, 0)} mil`}`);
const eixoPct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatNumeroBR(Math.abs(v) * 100, 0)}%`;

/**
 * linhas: resumoPeriodo().linhas; vista 'rs' (R$, com aportes) ou 'pct'
 * (rentabilidade acumulada, sem aportes). Devolve { svg, xs, ys, W, H }:
 * xs[k] e ys[serie][k] servem pro realce do mês no hover.
 */
export function graficoInflacao(linhas, vista = 'rs', { largura = 720, altura = 270 } = {}) {
  const n = (linhas || []).length;
  if (n < 2) return { svg: '', xs: [], ys: {}, W: 0, H: 0 };
  const W = Math.max(300, Math.round(largura));
  const H = altura;
  const estreito = W < 480;
  const mg = { t: 14, r: estreito ? 38 : 46, b: 24, l: estreito ? 46 : 54 };
  const campo = vista === 'pct' ? { pl: 'pctPl', ipca: 'pctIpca', cdi: 'pctCdi' } : { pl: 'pl', ipca: 'ipca', cdi: 'cdi' };
  const valores = [];
  LINHAS_INFLACAO.forEach((s) => linhas.forEach((l) => { if (num(l[campo[s.id]])) valores.push(l[campo[s.id]]); }));
  let lo = Math.min(...valores); let hi = Math.max(...valores);
  if (vista === 'pct') { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (hi - lo < 1e-9) { hi += vista === 'pct' ? 0.01 : 1000; lo -= vista === 'pct' ? 0 : 1000; }
  const passo = passoRedondo(hi - lo, estreito ? 3 : 4);
  const topo = Math.ceil(hi / passo - 1e-9) * passo;
  const fundo = Math.floor(lo / passo + 1e-9) * passo;
  const x = (k) => mg.l + (k / (n - 1)) * (W - mg.l - mg.r);
  const y = (v) => mg.t + ((topo - v) / (topo - fundo || 1)) * (H - mg.t - mg.b);
  let s = '';
  for (let v = fundo; v <= topo + passo * 1e-6; v += passo) {
    const vv = Math.abs(v) < passo * 1e-6 ? 0 : v;
    s += `<line class="${vv === 0 && vista === 'pct' ? 'pt-zero' : 'pt-grade'}" x1="${mg.l}" x2="${W - mg.r}" y1="${f1(y(vv))}" y2="${f1(y(vv))}"/>`;
    s += `<text class="pt-eixo" x="${mg.l - 7}" y="${f1(y(vv) + 3.5)}" text-anchor="end">${esc(vista === 'pct' ? eixoPct(vv) : eixoRs(vv))}</text>`;
  }
  // eixo X: no máximo ~6 rótulos (4 no celular); de ano em ano em janelas longas
  const maxRot = estreito ? 4 : 6;
  const passoX = [1, 2, 3, 6, 12, 24, 36].find((p) => n / p <= maxRot) || 48;
  linhas.forEach((l, k) => {
    const mm = Number(l.mes.slice(5, 7));
    const marca = passoX >= 12 ? (mm === 1 && (Number(l.mes.slice(0, 4)) % (passoX / 12) === 0)) : ((n - 1 - k) % passoX === 0);
    if (!marca) return;
    s += `<line class="pi-tick" x1="${f1(x(k))}" x2="${f1(x(k))}" y1="${H - mg.b}" y2="${H - mg.b + 4}"/>`;
    s += `<text class="pt-eixo" x="${f1(x(k))}" y="${H - 6}" text-anchor="middle">${esc(passoX >= 12 ? l.mes.slice(0, 4) : mesCurto(l.mes))}</text>`;
  });
  s += `<line class="pi-base" x1="${mg.l}" x2="${W - mg.r}" y1="${H - mg.b}" y2="${H - mg.b}"/>`;
  const ys = {};
  // benchmarks primeiro (embaixo), patrimônio por cima
  [...LINHAS_INFLACAO].reverse().forEach((sr) => {
    const pts = [];
    linhas.forEach((l, k) => { if (num(l[campo[sr.id]])) pts.push([x(k), y(l[campo[sr.id]])]); });
    ys[sr.id] = linhas.map((l) => (num(l[campo[sr.id]]) ? y(l[campo[sr.id]]) : null));
    if (pts.length < 2) return;
    s += `<path class="pi-linha pi-linha-${sr.id}" style="stroke:${sr.cor}"${sr.dash ? ` stroke-dasharray="${sr.dash}"` : ''} d="${pts.map((p, k) => `${k ? 'L' : 'M'}${f1(p[0])},${f1(p[1])}`).join('')}"/>`;
  });
  // rótulos diretos no fim de cada linha (afastados pra não encavalar)
  const fim = LINHAS_INFLACAO.map((sr) => ({ sr, y: ys[sr.id][n - 1] })).filter((e) => num(e.y)).sort((a, b) => a.y - b.y);
  for (let i = 1; i < fim.length; i += 1) if (fim[i].y - fim[i - 1].y < 12) fim[i].y = fim[i - 1].y + 12;
  fim.forEach((e) => { s += `<text class="pi-rot-fim${e.sr.id === 'pl' ? ' forte' : ''}" x="${f1(x(n - 1) + 6)}" y="${f1(Math.min(H - mg.b, e.y) + 3.5)}">${esc(e.sr.curto)}</text>`; });
  s += `<circle class="pi-ponto-fim" cx="${f1(x(n - 1))}" cy="${f1(ys.pl[n - 1])}" r="3.5"/>`;
  // realce do mês (hover/teclado)
  s += `<g class="pi-realce" hidden><line class="pi-guia" x1="0" x2="0" y1="${mg.t}" y2="${H - mg.b}"/>${LINHAS_INFLACAO.map((sr) => `<circle class="pi-realce-pt" data-serie="${sr.id}" r="4.5" style="fill:${sr.cor}"/>`).join('')}</g>`;
  const ult = linhas[n - 1];
  const desc = vista === 'pct'
    ? `Rentabilidade acumulada sem os aportes, de ${mesAno(linhas[0].mes)} a ${mesAno(ult.mes)}: patrimônio ${pct(ult.pctPl)}, IPCA ${pct(ult.pctIpca)}, CDI ${pct(ult.pctCdi)}`
    : `Patrimônio líquido de ${mesAno(linhas[0].mes)} a ${mesAno(ult.mes)}: ${mil(ult.pl)}, contra ${mil(ult.ipca)} (aportes + IPCA) e ${mil(ult.cdi)} (aportes + CDI)`;
  const svg = `<svg class="pt-svg pi-svg" viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="${esc(desc)}">${s}</svg>`;
  return { svg, xs: linhas.map((l, k) => x(k)), ys, W, H };
}

/** HTML do balão do mês k. */
export function dicaMes(l, vista, primeiro = false) {
  const linha = (rot, valor, cls = '') => `<div class="pt-tt-l${cls ? ` ${cls}` : ''}"><span>${esc(rot)}</span><b>${esc(valor)}</b></div>`;
  const marca = (sr) => `<i class="pi-tt-m" style="${sr.dash ? `border-top:2px dashed ${sr.cor}` : `background:${sr.cor}`}"></i>`;
  const [spl, sipca, scdi] = LINHAS_INFLACAO;
  const lin = (sr, rot, valor) => `<div class="pt-tt-l"><span>${marca(sr)}${esc(rot)}</span><b>${esc(valor)}</b></div>`;
  let h = `<b class="pt-tt-t">${esc(mesAno(l.mes))}${primeiro ? ' <small>(base)</small>' : ''}</b>`;
  if (vista === 'pct') {
    h += lin(spl, 'Patrimônio (sem aportes)', pct(l.pctPl)) + lin(sipca, 'IPCA', pct(l.pctIpca)) + lin(scdi, 'CDI', pct(l.pctCdi));
    if (num(l.pctInv)) h += linha('Só os investimentos', pct(l.pctInv), 'pt-tt-total');
  } else {
    h += lin(spl, 'Patrimônio líquido', brl0(l.pl)) + lin(sipca, 'Aportes + IPCA', brl0(l.ipca)) + lin(scdi, 'Aportes + CDI', brl0(l.cdi));
    const dif = l.pl - l.ipca;
    h += linha(dif >= 0 ? 'Acima do IPCA' : 'Abaixo do IPCA', `${dif >= 0 ? '+' : '−'}${brl0(Math.abs(dif))}`, 'pt-tt-total');
  }
  if (!primeiro) {
    if (num(l.fluxo)) h += linha('Entrou no mês', `${l.fluxo >= 0 ? '+' : '−'}${brl0(Math.abs(l.fluxo))}`);
    if (num(l.retorno)) h += linha('Rendeu no mês', `${l.retorno >= 0 ? '+' : '−'}${brl0(Math.abs(l.retorno))}`);
    if (num(l.ipcaMes)) h += `<div class="pt-tt-n">IPCA do mês ${esc(pct(l.ipcaMes, 2))}${l.ipcaEstimado ? ' (estimado)' : ''} · CDI ${esc(pct(l.cdiMes, 2))}</div>`;
  }
  return h;
}

// ---------------------------------------------------------------------------
// HTML (strings) - tiles, legenda, método, veredito
// ---------------------------------------------------------------------------

export function htmlTiles(r) {
  if (!r) return '';
  const aa = r.anualizado ? 'ao ano' : 'no período';
  const tile = (cls, rot, valor, sub, tom = '') => `<div class="pi-tile${cls ? ` ${cls}` : ''}${tom ? ` pi-${tom}` : ''}"><span class="pt-rot">${esc(rot)}</span><b class="pi-tile-v">${valor}</b><small>${sub}</small></div>`;
  const pl = r.pl;
  const ex = r.benchmarks.excessoIpca;
  const real = r.anualizado ? pl.realAnual : pl.real;
  const inv = r.inv;
  const invReal = r.anualizado ? inv.realAnual : inv.real;
  return [
    tile('', 'Crescimento nominal', esc(`${pl.variacao >= 0 ? '+' : '−'}${milAbs(pl.variacao)}`),
      `${num(pl.variacaoPct) ? `${esc(pct(pl.variacaoPct))} ` : ''}de ${esc(mil(pl.inicio))} pra ${esc(mil(pl.fim))}, contando os aportes`),
    tile('dest', 'Crescimento real (acima do IPCA)', esc(`${ex >= 0 ? '+' : '−'}${milAbs(ex)}`),
      `além de repor a inflação sobre o que você tinha e aportou${num(real) ? ` · rentabilidade real ${esc(pct(real))} ${aa}` : ''}`, ex >= 0 ? 'bom' : 'atencao'),
    tile('', 'Retorno real dos investimentos', esc(num(invReal) ? pct(invReal) : '—'),
      num(invReal) ? `${aa}, já sem a inflação (nominal ${esc(pct(r.anualizado ? inv.anual : inv.acumulado))})` : 'sem base suficiente no período', num(invReal) ? (invReal >= 0 ? 'bom' : 'atencao') : ''),
    tile('', '% do CDI', esc(num(pl.pctCdi) ? `${formatNumeroBR(pl.pctCdi * 100, 0)}%` : '—'),
      `patrimônio sem aportes${num(inv.pctCdi) ? ` · investimentos ${esc(formatNumeroBR(inv.pctCdi * 100, 0))}%` : ''} · CDI ${esc(pct(r.anualizado ? r.cdi.anual : r.cdi.acumulado))} ${aa}`),
  ].join('');
}

export function htmlLegenda(r, vista) {
  if (!r) return '';
  const u = r.linhas[r.linhas.length - 1];
  const valor = { pl: vista === 'pct' ? pct(u.pctPl) : mil(u.pl), ipca: vista === 'pct' ? pct(u.pctIpca) : mil(u.ipca), cdi: vista === 'pct' ? pct(u.pctCdi) : mil(u.cdi) };
  return LINHAS_INFLACAO.map((s) => `<span><i class="pi-leg-m${s.dash ? ' tracejado' : ''}" style="${s.dash ? `border-top-color:${s.cor}` : `background:${s.cor}`}"></i>${esc(vista === 'pct' && s.nomePct ? s.nomePct : (vista === 'pct' ? 'Patrimônio (sem aportes)' : s.nome))} <b>${esc(valor[s.id])}</b></span>`).join('');
}

export function htmlMetodo(r, base, vista) {
  if (!r) return '';
  const partes = ['investimentos'];
  if (base.componentes.imovel) partes.push('apê');
  if (base.componentes.fgts) partes.push('FGTS');
  const dividas = [base.componentes.financiamento && 'financiamento', base.componentes.fies && 'FIES'].filter(Boolean);
  const comp = `${partes.join(', ')}${dividas.length ? ` − ${dividas.join(' − ')}` : ''}`;
  const linha = vista === 'pct'
    ? '<b>Como é calculado:</b> Dietz modificado mês a mês, retorno = (patrimônio no fim − no início − aportes) ÷ (início + aportes/2), encadeado; aportes e amortizações são transferências do salário, não rendimento.'
    : '<b>Como é calculado:</b> as linhas tracejadas são o patrimônio do início + cada aporte do mês (investimentos, amortizações, FGTS), corrigidos pelo IPCA (só manter o poder de compra) ou pelo CDI.';
  const notas = [`Patrimônio = ${comp}; outros bens ficam de fora.`];
  if (r.ipca.estimados.length) notas.push(`IPCA de ${r.ipca.estimados.map(mesCurto).join(', ')} ainda não divulgado: usei a média dos últimos 12 meses.`);
  if (base.aportesAproximados) notas.push('Sem o aporte de cada mês no histórico: usei o aporte médio (aproximação).');
  if (r.cortadoDe) notas.push(`Começa em ${mesCurto(r.de)}: antes disso o patrimônio líquido era negativo ou quase zero (dívidas maiores que o que você tinha), e rentabilidade sobre isso não tem sentido.`);
  if (r.pl.mesesSemBase) notas.push(`${r.pl.mesesSemBase} ${r.pl.mesesSemBase === 1 ? 'mês ficou' : 'meses ficaram'} fora da rentabilidade (patrimônio perto de zero ou negativo).`);
  return `${linha} <span class="pi-metodo-n">${esc(notas.join(' '))}</span>`;
}

export function htmlVeredito(v, r) {
  if (!v) return '';
  const lista = (itens, tom) => `<ul class="pi-acoes">${itens.map((i) => `<li class="pi-${tom}"><span class="pi-acao-ico" aria-hidden="true">${tom === 'bom' ? '✓' : '!'}</span><span>${i.html}</span></li>`).join('')}</ul>`;
  const blocos = [];
  if (v.sim === false) {
    if (v.melhorar.length) blocos.push(`<h4>Como melhorar</h4>${lista(v.melhorar, 'atencao')}`);
    if (v.continuar.length) blocos.push(`<h4>O que já está funcionando</h4>${lista(v.continuar, 'bom')}`);
  } else {
    if (v.continuar.length) blocos.push(`<h4>O que continuar fazendo</h4>${lista(v.continuar, 'bom')}`);
    if (v.melhorar.length) blocos.push(`<h4>${v.sim ? 'Pra ir além' : 'O que olhar'}</h4>${lista(v.melhorar, 'atencao')}`);
  }
  const barras = v.itensPorque.length ? barrasDivergentes(v.itensPorque.map((i) => ({ nome: i.nome, valor: i.valor }))) : '';
  const inflacao = r ? `<p class="pt-nota">Inflação no período: <b>${esc(pctAbs(r.ipca.acumulado))}</b>${r.anualizado ? ` (${esc(pctAbs(r.ipca.anual))} ao ano)` : ''}: ela comeu <b>${esc(milAbs(r.custoInflacao))}</b> do poder de compra do que você tinha e aportou.</p>` : '';
  return `
    <div class="pi-ver-cab"><span class="pi-selo"><i aria-hidden="true"></i>${v.sim ? 'Acima da inflação' : v.sim === false ? 'Abaixo da inflação' : 'Sem dados'}</span><span class="pt-hint">${esc(v.periodoTxt)}</span></div>
    <h3 class="pi-ver-titulo">${esc(v.titulo)}</h3>
    <p class="pi-ver-sub">${esc(v.subtitulo)}</p>
    <div class="pi-ver-grade">
      <div class="pi-ver-col"><h4>Por quê</h4>${v.porqueTxt ? `<p class="pi-ver-p">${esc(v.porqueTxt)}</p>` : ''}${barras}${inflacao}${v.jurosTxt ? `<p class="pt-nota">${esc(v.jurosTxt)}</p>` : ''}</div>
      <div class="pi-ver-col">${blocos.join('') || '<p class="pi-ver-p">Sem sugestões pra este período.</p>'}</div>
    </div>`;
}

/** Série e índices no formato do analisarSerie (analise-grafico.js). */
export function dadosAnalise(r, base) {
  const W = base.pontos.filter((p) => p.mes >= r.de && p.mes <= r.ate);
  // pregao:false (menos no último) = pontos mensais: desliga a regra de "últimos 3 pregões"
  const serie = r.linhas.map((l, k) => ({ data: l.data, valor: l.pl, fluxo: k ? l.fluxo : 0, retorno: num(l.pctPl) ? l.pctPl * 100 : 0, pregao: k === r.linhas.length - 1 }));
  const nivel = (campo) => r.linhas.map((l) => ({ data: l.data, valor: 100 * (1 + l[campo]) }));
  // componente: valor e "fluxo" = variação − retorno daquele componente (ganho = o retorno)
  const comp = (valor, ret) => W.map((p, k) => ({ data: p.data, valor: valor(p), fluxo: k ? valor(p) - valor(W[k - 1]) - (ret(p) || 0) : 0 }));
  const componentes = { Investimentos: comp((p) => p.inv, (p) => p.rInv) };
  if (base.componentes.imovel) componentes['Valorização do apê'] = comp((p) => p.imovel, (p) => p.rImovel);
  if (base.componentes.fgts) componentes.FGTS = comp((p) => p.fgts, (p) => p.rFgts);
  if (base.componentes.financiamento || base.componentes.fies) componentes['Juros das dívidas'] = comp((p) => -p.divida, (p) => -(p.juros || 0));
  return { serie, indices: { CDI: nivel('pctCdi'), IPCA: nivel('pctIpca') }, componentes };
}

// ---------------------------------------------------------------------------
// Montador
// ---------------------------------------------------------------------------

/**
 * Desenha a seção dentro de `raiz`.
 *  patrimonio: resposta do getPatrimonio (campos em seriesReais) + metas.aporteMeta;
 *  ctx: contextoPatrimonio (opcional) - ritmo (aporte médio, só se faltar o
 *       aporte mês a mês) e aporteMeta (meta de aporte mensal);
 *  doc: document; hoje: 'aaaa-mm-dd' (padrão: patrimonio.hoje).
 * Devolve { atualizar({ patrimonio, ctx, hoje }), periodo, vista, pronto }.
 */
export function montarPatrimonioVsInflacao(raiz, { patrimonio, ctx = null, doc = null, hoje = null } = {}) {
  const D = doc || (raiz && raiz.ownerDocument);
  if (!raiz || !D) return null;
  const win = D.defaultView;
  const est = { patrimonio, ctx, hoje: hoje || (patrimonio && patrimonio.hoje) || '', vista: 'rs', periodo: '12m', base: null, r: null, g: null };
  raiz.classList.add('pi-raiz');
  raiz.innerHTML = `
    <section class="pt-sec pi-sec">
      <div class="pt-sec-cab"><h2>Patrimônio vs. inflação</h2><span class="pt-hint">rentabilidade real: seu patrimônio líquido contra o IPCA e o CDI</span></div>
      <div class="pt-card pi-card">
        <div class="pi-topo">
          <div class="filter-tabs pi-periodos" role="group" aria-label="Período">${PERIODOS_INFLACAO.map((p) => `<button type="button" class="filter-tab" data-periodo="${p.id}">${p.rotulo}</button>`).join('')}</div>
          <div class="pi-vistas" role="group" aria-label="Ver como">
            <button type="button" class="pi-vista" data-vista="rs" aria-pressed="true">Em R$ <small>com aportes</small></button>
            <button type="button" class="pi-vista" data-vista="pct" aria-pressed="false">Rentabilidade <small>sem aportes</small></button>
          </div>
        </div>
        <div class="pi-corpo">
          <div class="pi-tiles"></div>
          <div class="pi-leg pt-leg"></div>
          <div class="pi-grafico"><div class="pi-svg-box"></div><div class="pt-tt pi-tt" hidden></div></div>
          <p class="pi-metodo pt-nota"></p>
          <div class="pi-analise"></div>
        </div>
        <p class="pi-vazio pt-nota" hidden></p>
      </div>
      <div class="pt-card pi-veredito" aria-live="polite"></div>
    </section>`;
  const $ = (sel) => raiz.querySelector(sel);
  const tabs = $('.pi-periodos');

  function limites() {
    const pts = (est.base && est.base.pontos) || [];
    return pts.length ? { min: `${pts[0].mes}-01`, max: pts[pts.length - 1].data } : null;
  }

  function recalcularBase() {
    est.base = seriesReais(est.patrimonio, { hoje: est.hoje, ctx: est.ctx });
  }

  function vazio(msg) {
    $('.pi-corpo').hidden = true;
    const v = $('.pi-vazio'); v.hidden = false; v.textContent = msg;
    $('.pi-veredito').hidden = true;
  }

  function desenharGrafico() {
    const box = $('.pi-svg-box');
    if (!est.r) { box.innerHTML = ''; return; }
    const largura = box.clientWidth || (raiz.clientWidth ? raiz.clientWidth - 36 : 0) || 720;
    est.g = graficoInflacao(est.r.linhas, est.vista, { largura, altura: largura < 480 ? 250 : 270 });
    box.innerHTML = est.g.svg;
    $('.pi-leg').innerHTML = htmlLegenda(est.r, est.vista);
    $('.pi-metodo').innerHTML = htmlMetodo(est.r, est.base, est.vista);
    esconderRealce();
  }

  function desenhar() {
    const b = est.base;
    if (!b || b.pontos.length < 2) { vazio('Ainda não há meses suficientes no histórico do patrimônio pra comparar com a inflação.'); return; }
    if (b.ipca.semDados) { vazio('A série mensal do IPCA e do CDI não veio do Apps Script. Publique a nova versão do Patrimonio.gs (ela manda os índices de cada mês).'); return; }
    est.r = resumoPeriodo(b, est.periodo, { hoje: est.hoje });
    if (!est.r) { vazio('Sem meses suficientes neste período. Escolha um período maior.'); return; }
    $('.pi-corpo').hidden = false;
    $('.pi-vazio').hidden = true;
    $('.pi-tiles').innerHTML = htmlTiles(est.r);
    desenharGrafico();
    // card de análise (analise-grafico.js) embaixo do gráfico
    try {
      const da = dadosAnalise(est.r, b);
      const periodoAnalise = !est.r.cortadoDe && typeof est.periodo === 'string' && ['12m', '3a', 'tudo'].includes(est.periodo) ? est.periodo : { inicio: est.r.dataDe, fim: est.r.dataAte };
      // 03/10/2026 (base de critérios de rentabilidade): classe 'patrimonio' -
      // a régua é o poder de compra (IPCA), com prazo mínimo pra concluir
      const an = analisarSerie({ serie: da.serie, indices: da.indices, periodo: periodoAnalise, nome: 'O patrimônio líquido (sem aportes)', componentes: da.componentes, indiceReferencia: 'IPCA', classe: 'patrimonio' });
      renderAnalise(D, $('.pi-analise'), an);
    } catch (e) { $('.pi-analise').innerHTML = ''; }
    const metaAporte = est.ctx && num(est.ctx.aporteMeta) ? est.ctx.aporteMeta : (est.patrimonio && est.patrimonio.metas && num(est.patrimonio.metas.aporteMeta) ? est.patrimonio.metas.aporteMeta : null);
    const v = veredito(est.r, { aporteMeta: metaAporte });
    const card = $('.pi-veredito');
    card.hidden = false;
    card.className = `pt-card pi-veredito pi-tom-${v ? v.tom : 'atencao'}`;
    card.innerHTML = htmlVeredito(v, est.r);
  }

  // ---- realce do mês (mouse/toque/teclado) ----
  let idxAtual = null;
  function esconderRealce() {
    idxAtual = null;
    const g = raiz.querySelector('.pi-realce'); if (g) g.setAttribute('hidden', '');
    const tt = $('.pi-tt'); if (tt) tt.hidden = true;
  }
  function realcar(k) {
    if (!est.g || !est.r || !est.g.xs.length) return;
    k = Math.max(0, Math.min(est.r.linhas.length - 1, k));
    idxAtual = k;
    const svg = raiz.querySelector('.pi-svg');
    const g = svg && svg.querySelector('.pi-realce');
    if (!g) return;
    g.removeAttribute('hidden');
    const x = est.g.xs[k];
    const guia = g.querySelector('.pi-guia'); guia.setAttribute('x1', f1(x)); guia.setAttribute('x2', f1(x));
    g.querySelectorAll('.pi-realce-pt').forEach((c) => {
      const yy = est.g.ys[c.dataset.serie] && est.g.ys[c.dataset.serie][k];
      if (num(yy)) { c.setAttribute('cx', f1(x)); c.setAttribute('cy', f1(yy)); c.removeAttribute('hidden'); } else c.setAttribute('hidden', '');
    });
    const tt = $('.pi-tt');
    tt.innerHTML = dicaMes(est.r.linhas[k], est.vista, k === 0);
    tt.hidden = false;
    const box = $('.pi-grafico');
    const bw = box.clientWidth || est.g.W;
    const escala = (svg.getBoundingClientRect().width || est.g.W) / est.g.W;
    const off = svg.getBoundingClientRect().left - box.getBoundingClientRect().left;
    const px = off + x * escala;
    const tw = tt.offsetWidth || 200;
    let left = px + 14;
    if (left + tw > bw - 4) left = px - tw - 14;
    tt.style.left = `${Math.max(4, left)}px`;
    tt.style.top = '8px';
  }
  function indicePorX(clientX) {
    const svg = raiz.querySelector('.pi-svg');
    if (!svg || !est.g) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return null;
    const xv = ((clientX - rect.left) / rect.width) * est.g.W;
    let melhor = 0;
    est.g.xs.forEach((x, k) => { if (Math.abs(x - xv) < Math.abs(est.g.xs[melhor] - xv)) melhor = k; });
    return melhor;
  }
  const box = $('.pi-svg-box');
  box.addEventListener('pointermove', (e) => { const k = indicePorX(e.clientX); if (k != null) realcar(k); });
  box.addEventListener('pointerleave', () => { if (D.activeElement !== raiz.querySelector('.pi-svg')) esconderRealce(); });
  box.addEventListener('focusin', () => realcar(idxAtual == null ? est.r.linhas.length - 1 : idxAtual));
  box.addEventListener('focusout', esconderRealce);
  box.addEventListener('keydown', (e) => {
    if (!est.r) return;
    const k = idxAtual == null ? est.r.linhas.length - 1 : idxAtual;
    if (e.key === 'ArrowLeft') { realcar(k - 1); e.preventDefault(); } else if (e.key === 'ArrowRight') { realcar(k + 1); e.preventDefault(); } else if (e.key === 'Home') { realcar(0); e.preventDefault(); } else if (e.key === 'End') { realcar(est.r.linhas.length - 1); e.preventDefault(); } else if (e.key === 'Escape') esconderRealce();
  });

  // ---- vista ----
  raiz.querySelectorAll('.pi-vista').forEach((b) => b.addEventListener('click', () => {
    est.vista = b.dataset.vista;
    raiz.querySelectorAll('.pi-vista').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    desenharGrafico();
  }));
  raiz.querySelector('.pi-vista[data-vista="rs"]').classList.add('active');

  // ---- período ----
  recalcularBase();
  const filtro = ligarFiltroPeriodo(D, tabs, {
    chave: 'patrimonio.inflacao', periodoInicial: '12m', limites: limites(), comChip: true,
    aoMudar(p) { est.periodo = p; desenhar(); },
  });
  est.periodo = (filtro && filtro.periodo) || '12m';
  desenhar();

  // ---- redimensionar ----
  let timer = null;
  let ultimaLargura = $('.pi-svg-box').clientWidth;
  const aoRedimensionar = () => {
    if (timer) win.clearTimeout(timer);
    timer = win.setTimeout(() => { const w = $('.pi-svg-box').clientWidth; if (w && w !== ultimaLargura) { ultimaLargura = w; desenharGrafico(); } }, 150);
  };
  if (win) win.addEventListener('resize', aoRedimensionar);

  return {
    get periodo() { return est.periodo; },
    get vista() { return est.vista; },
    get resumo() { return est.r; },
    pronto: Promise.resolve(),
    atualizar({ patrimonio: p = est.patrimonio, ctx: c = est.ctx, hoje: h = null } = {}) {
      est.patrimonio = p; est.ctx = c; est.hoje = h || (p && p.hoje) || est.hoje;
      recalcularBase();
      if (filtro) filtro.definirLimites(limites() || { min: null, max: null });
      desenhar();
    },
    destruir() { if (win) win.removeEventListener('resize', aoRedimensionar); raiz.innerHTML = ''; },
  };
}

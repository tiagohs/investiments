/**
 * simulador-dividas-calc.js - 02/10/2026: contas do simulador "amortizar ou
 * investir" da Organização Financeira (sem DOM - organizacao-simulador.js
 * desenha).
 *
 * Tiago: "A área de Simulação me parece muito confusa.. o que eu gostaria de
 * simular, e ter um resultado bem claro quanto a isso: se eu amortizar hoje
 * um valor mensal, ou um valor total no final do ano, quanto eu vou adiantar
 * da dívida (FIES ou Apartamento) ... se eu investir o mesmo valor ... quanto
 * eu vou ter ... considere renda passiva, tipos de investimentos ... por
 * padrão já deixe pronta uma simulação ... leve em consideração o vídeo".
 *
 * Como a conta é feita (mês a mês, até o horizonte e até as dívidas acabarem):
 *  - O MESMO dinheiro sai do bolso em todos os cenários: as parcelas de hoje
 *    (cenário "só as parcelas") + o valor extra (todo mês ou uma vez por ano,
 *    em dezembro). O que um cenário deixa de pagar (parcela menor, dívida
 *    quitada antes) vira investimento (opção "reinvestir a diferença").
 *  - Financiamento: SAC (ou Price) com a TR corrigindo o saldo e a
 *    amortização todo mês (é o que a Caixa faz) + seguro (MIP/DFI + taxa)
 *    proporcional ao saldo. FIES: Price com a taxa fixa do contrato, sem TR.
 *  - FGTS: entra igual em todos os cenários - depósito de 8% do salário,
 *    JAM (3% a.a. + TR), saque-aniversário no mês do aniversário (se ativo) e,
 *    a cada 2 anos, o que sobrou no FGTS amortiza o financiamento (prazo).
 *  - Investimentos: CDI 100%/110% e Tesouro IPCA+ com IR regressivo por
 *    aporte (Lei 11.033/2004: 22,5% até 180 dias ... 15% acima de 720);
 *    Tesouro com a custódia da B3; FIIs com dividend yield isento de IR pra
 *    pessoa física (rendimentos) + valorização da cota (20% de IR sobre o
 *    ganho só se vender), proventos reinvestidos ou gastos.
 *  - O CDI de hoje anda até o "CDI de longo prazo" (IPCA + juro real neutro)
 *    em alguns anos; a TR acompanha (TR ~ 0 com a Selic abaixo de ~8,5% -
 *    vídeo, 04:00), então se o CDI cair o apê também fica mais barato.
 *  - Patrimônio líquido do cenário = o líquido de hoje (contexto) + dívida
 *    abatida + investimentos do experimento (líquidos de IR, como se vendesse)
 *    + o que o FGTS cresceu. O resto (seus aportes normais, valorização do
 *    apê, rendimento do que já tem) é igual nos cenários e fica de fora.
 *
 * Datas: 'aaaa-mm-dd' ou 'aaaa-mm'; meses 'aaaa-mm'; taxas em fração
 * (0,1365 = 13,65%).
 */
import {
  mesDe, somarMeses, saldoFinanciamento, extrasFinanciamento, financiamentoEfetivo, mesDaDivida, saldoFies, mesesRestantesFies, saqueAniversario, salarioEm, saldoFgtsEm,
  projetarAposentadoria, prazoCaixaSac, prazoCaixaSacExato,
} from './patrimonio-calc.js';
import { MESES_CURTOS, formatMesAno, formatBRLMil, formatPct } from '../format.js'; // 05/10/2026 (A-68)

export { prazoCaixaSac, prazoCaixaSacExato };

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;
const mensal = (anual) => (1 + anual) ** (1 / 12) - 1;
const anual = (m) => (1 + m) ** 12 - 1;
const EPS = 0.005;

/**
 * Taxas usadas quando o contexto não traz o número (editáveis na tela).
 * Fontes (consultadas em 02/10/2026): CDI 13,65% a.a. (BCB SGS 4389,
 * 01/10/2026); IPCA 12 meses 4,2% (IBGE, até ago/2026 - BCB SGS 433); TR
 * ~0,165% ao mês (~2% a.a., média de 12 meses - BCB SGS 7811). Tesouro
 * IPCA+ ~7% + IPCA, FIIs DY ~10% e valorização de 2% a.a. são suposições
 * conservadoras - ajuste com a taxa do dia.
 */
export const PADROES = {
  cdi: 0.1365,
  ipca: 0.042,
  trMensal: 0.00165,
  juroNeutro: 0.05, // CDI de longo prazo = IPCA + isso
  anosTransicao: 3, // em quantos anos o CDI chega no de longo prazo
  taxaRealIpca: 0.07,
  custodiaTesouro: 0.002, // B3: 0,20% a.a.
  dyFii: 0.10,
  valorizacaoFii: 0.02,
  jamReal: 0.03, // FGTS: 3% a.a. + TR
  limiteSelicTr: 0.085, // abaixo disso a TR fica ~0
};

export const PERFIS = {
  cdi100: { nome: '100% do CDI', curto: 'CDI 100%', desc: 'Tesouro Selic / CDB de liquidez diária. IR regressivo.' },
  cdi110: { nome: '110% do CDI', curto: 'CDI 110%', desc: 'CDB/LC de banco médio (FGC até R$ 250 mil). IR regressivo.' },
  ipca: { nome: 'Tesouro IPCA+', curto: 'IPCA+', desc: 'Inflação + taxa travada, levado até o vencimento. IR regressivo e custódia da B3.' },
  fii: { nome: 'Fundos imobiliários', curto: 'FIIs', desc: 'Renda mensal isenta de IR; a cota oscila. 20% de IR só sobre o ganho, se vender.' },
};

// ---------------------------------------------------------------------------
// Taxas no tempo
// ---------------------------------------------------------------------------

/** IR regressivo da renda fixa (Lei 11.033/2004, art. 1º) pela idade da aplicação em meses. */
export function aliquotaIr(meses) {
  const dias = meses * 30.4375;
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

/** Percentual do CDI -> taxa ao ano (o percentual incide sobre a taxa diária, 252 dias úteis). */
export function taxaPercentualCdi(cdi, pct) {
  const dia = (1 + cdi) ** (1 / 252) - 1;
  return (1 + dia * pct) ** 252 - 1;
}

/** "Quanto de TR" um CDI gera - só a forma (TR ~ 0 abaixo de ~8,5%), a escala vem da TR de hoje. */
const formaTr = (cdi, limite) => Math.max(0, cdi - limite);

/** Premissas completas (padrões + o que veio). */
export function premissas(p = {}) {
  const t = { ...PADROES, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)) };
  if (!num(t.cdiLongo)) t.cdiLongo = (1 + t.ipca) * (1 + t.juroNeutro) - 1;
  return t;
}

/** CDI ao ano no mês t (1 = próximo mês): vai em linha reta do de hoje ao de longo prazo. */
export function cdiNoMes(t, pr) {
  const n = Math.max(0, pr.anosTransicao * 12);
  if (!n || t >= n) return pr.cdiLongo;
  return pr.cdi + (pr.cdiLongo - pr.cdi) * (t / n);
}

/** TR ao mês no mês t: a de hoje, escalada pelo que o CDI andou. */
export function trNoMes(t, pr) {
  const f0 = formaTr(pr.cdi, pr.limiteSelicTr);
  const ft = formaTr(cdiNoMes(t, pr), pr.limiteSelicTr);
  if (f0 > 0) return pr.trMensal * (ft / f0);
  return ft > 0 ? mensal(ft * 0.4) : 0;
}

/** Rendimento bruto ao mês do perfil no mês t. */
function taxaPerfilMes(perfil, t, pr) {
  const cdi = cdiNoMes(t, pr);
  if (perfil === 'cdi100') return mensal(cdi);
  if (perfil === 'cdi110') return mensal(taxaPercentualCdi(cdi, 1.1));
  if (perfil === 'ipca') return mensal((1 + pr.ipca) * (1 + pr.taxaRealIpca) - 1) - pr.custodiaTesouro / 12;
  return 0;
}

// ---------------------------------------------------------------------------
// Carteira (o dinheiro investido de um cenário)
// ---------------------------------------------------------------------------

/**
 * perfil: cdi100 | cdi110 | ipca | fii | fixa (taxa líquida fixa, sem IR -
 * usada pro ponto de virada). Cada aporte de renda fixa é um "lote" com a
 * sua idade (IR regressivo).
 */
export function novaCarteira(perfil, pr, { taxaFixa = 0, reinvestirProventos = true } = {}) {
  const lotes = [];
  let V = 0; let C = 0; // FIIs / fixa: valor e custo
  let rendaMes = 0;
  let rendaRecebida = 0;
  let aportado = 0;
  const ipcaM = mensal(pr.ipca);
  const rf = perfil === 'cdi100' || perfil === 'cdi110' || perfil === 'ipca';
  return {
    perfil,
    aportar(t, v) {
      if (!(v > 0)) return;
      aportado += v;
      if (rf) lotes.push({ t, aporte: v, valor: v });
      else { V += v; C += v; }
    },
    /** Rende o mês t (sobre o que já estava aplicado no fim do mês anterior). */
    passo(t) {
      if (rf) {
        const i = taxaPerfilMes(perfil, t, pr);
        let bruto = 0;
        lotes.forEach((l) => { const r = l.valor * i; l.valor += r; bruto += r; });
        rendaMes = bruto * 0.85;
      } else if (perfil === 'fii') {
        const prov = V * (pr.dyFii / 12);
        V *= 1 + mensal(pr.valorizacaoFii);
        rendaMes = prov;
        if (reinvestirProventos) { V += prov; C += prov; } else rendaRecebida += prov;
      } else {
        const r = V * mensal(taxaFixa);
        V += r;
        rendaMes = r;
      }
    },
    bruto() { return rf ? lotes.reduce((s, l) => s + l.valor, 0) : V; },
    liquido(t) {
      if (rf) return lotes.reduce((s, l) => s + l.valor - Math.max(0, l.valor - l.aporte) * aliquotaIr(t - l.t), 0);
      if (perfil === 'fii') return V - Math.max(0, V - C) * 0.2;
      return V;
    },
    /** Renda do mês (FII: proventos; renda fixa: rendimento do mês já sem IR de 15%). */
    rendaMensal() { return rendaMes; },
    /** A parte da renda que sobra depois de repor a inflação do que está investido. */
    rendaMensalReal() {
      if (perfil === 'fii') return Math.max(0, rendaMes + V * (mensal(pr.valorizacaoFii) - ipcaM));
      return Math.max(0, rendaMes - this.bruto() * ipcaM);
    },
    get aportado() { return aportado; },
    get rendaRecebida() { return rendaRecebida; },
  };
}

// ---------------------------------------------------------------------------
// Dívidas
// ---------------------------------------------------------------------------

const pmt = (s, i, n) => (n <= 0 ? s : i > 0 ? (s * i) / (1 - (1 + i) ** -n) : s / n);

/** Meses que faltam numa Price (n = −ln(1 − s·i/P) / ln(1 + i)). */
export function nperPrice(s, i, P) {
  if (!(s > EPS)) return 0;
  if (!(i > 0)) return Math.ceil(s / P - 1e-9);
  if (!(P > s * i)) return Infinity;
  return Math.ceil(-Math.log(1 - (s * i) / P) / Math.log(1 + i) - 1e-9);
}

/**
 * d: { id, nome, sistema 'SAC'|'Price', saldo, taxaMensal, amortizacao (SAC),
 * parcela (Price, sem seguro), seguro (R$/mês hoje), tr (true = corrige pela TR) }.
 */
export function novaDivida(d) {
  let s = d.saldo;
  const i = d.taxaMensal || 0;
  let A = d.sistema === 'SAC' ? (num(d.amortizacao) && d.amortizacao > 0 ? d.amortizacao : s / Math.max(1, d.meses || 1)) : null;
  let P = d.sistema === 'Price' ? (num(d.parcela) && d.parcela > 0 ? d.parcela : pmt(s, i, d.meses || 1)) : null;
  const seguroTaxa = d.saldo > 0 && d.seguro > 0 ? d.seguro / d.saldo : 0;
  const st = { id: d.id, juros: 0, seguro: 0, correcao: 0, pago: 0, extras: 0, quitadaEm: s > EPS ? null : 0 };
  const restante = () => (s <= EPS ? 0 : d.sistema === 'SAC' ? Math.ceil(s / A - 1e-9) : nperPrice(s, i, P));
  const quitar = (t) => { if (s <= EPS) { s = 0; if (st.quitadaEm == null) st.quitadaEm = t; } };
  return {
    id: d.id,
    st,
    get saldo() { return s; },
    get ativa() { return s > EPS; },
    /** SAC: a amortização do mês (já com a TR que entrou); Price: a parcela sem seguro. */
    get amortizacao() { return A; },
    get parcela() { return P; },
    restante,
    /** Parcela regular do mês t. trM: TR do mês (só se d.tr). */
    mes(t, trM = 0) {
      if (s <= EPS) return { pagamento: 0, juros: 0, seguro: 0, amortizacao: 0, correcao: 0 };
      let correcao = 0;
      if (d.tr && trM > 0) {
        correcao = s * trM;
        s += correcao;
        if (A != null) A *= 1 + trM; else P *= 1 + trM;
      }
      const juros = s * i;
      const seguro = s * seguroTaxa;
      const amort = Math.min(d.sistema === 'SAC' ? A : Math.max(0, P - juros), s);
      s -= amort;
      const pagamento = juros + amort + seguro;
      st.juros += juros; st.seguro += seguro; st.correcao += correcao; st.pago += pagamento;
      quitar(t);
      return { pagamento, juros, seguro, amortizacao: amort, correcao };
    },
    /**
     * Amortização extra no fim do mês t (depois da parcela).
     * 05/10/2026 (Tiago, prints da Caixa): modo 'prazo' no SAC NÃO deixa a
     * amortização A parada - a Caixa recalcula o prazo pra que a prestação
     * (amortização + juros) não passe da atual: acha o menor prazo n' com
     * s'·(1/n' + i) <= s·(1/n + i) e refaz A = s'/n'. É por isso que ~R$ 440
     * já tiram 1 parcela (e não os ~R$ 1.330 de uma amortização). Na Price
     * (FIES) a parcela fica e o prazo cai (nper). 'parcela' mantém o prazo.
     * dias: dias de juros pro rata desde o vencimento (a Caixa cobra
     * valor × i × dias/30 em cima do valor pago; o resto é a amortização
     * efetiva). Devolve o valor pago que foi usado (inclui esses juros).
     */
    extra(t, valor, modo = 'prazo', { dias = 0 } = {}) {
      if (!(valor > 0) || s <= EPS) return 0;
      const n = restante();
      const f = i > 0 && dias > 0 ? (i * dias) / 30 : 0;
      const quitacao = s * (1 + f);
      const pago = Math.min(valor, quitacao);
      const efetiva = pago >= quitacao - EPS ? s : pago * (1 - f);
      const s0 = s;
      s -= efetiva;
      st.extras += efetiva;
      st.juros += pago - efetiva;
      st.pago += pago;
      if (s > EPS && Number.isFinite(n) && n > 0) {
        if (modo === 'parcela') { if (A != null) A = s / n; else P = pmt(s, i, n); }
        else if (A != null) A = s / prazoCaixaSac(s0, n, i, s);
      }
      quitar(t);
      return pago;
    },
    parcelaAtual(trM = 0) {
      if (s <= EPS) return 0;
      const sc = d.tr ? s * (1 + trM) : s;
      const am = A != null ? A * (d.tr ? 1 + trM : 1) : null;
      return A != null ? Math.min(am, sc) + sc * i + sc * seguroTaxa : P * (d.tr ? 1 + trM : 1) + sc * seguroTaxa;
    },
  };
}

/** Custo efetivo ao ano: juros + TR + seguro (fração do saldo). */
export function custoEfetivo(d, trMensal = 0) {
  if (!d) return null;
  const seg = d.saldo > 0 && d.seguro > 0 ? d.seguro / d.saldo : 0;
  return anual((1 + (d.taxaMensal || 0)) * (1 + (d.tr ? trMensal : 0)) - 1 + seg);
}

// ---------------------------------------------------------------------------
// FGTS (igual em todos os cenários)
// ---------------------------------------------------------------------------

function novoFgts(f, pr) {
  if (!f || !num(f.saldo)) return null;
  let s = f.saldo;
  let saques = 0;
  let proximo = f.proximoUso || null;
  return {
    get saldo() { return s; },
    get saques() { return saques; },
    /** Mês t ('aaaa-mm' = mes): saque-aniversário, juros + depósito, e o uso na moradia (devolve o valor disponível). */
    mes(mes, trM) {
      if (f.mesAniversario && Number(mes.slice(5, 7)) === f.mesAniversario) {
        const sa = saqueAniversario(s).valor;
        s -= sa; saques += sa;
      }
      s = s * ((1 + mensal(pr.jamReal)) * (1 + trM)) + (f.deposito || 0);
      if (f.usar !== false && proximo && mes >= proximo && s > 0) return s;
      return 0;
    },
    usou(mes, v) { s -= v; proximo = somarMeses(mes, f.intervalo || 24); },
  };
}

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------

const ORDEM_DIVIDAS = ['financiamento', 'fies'];

/**
 * Ordem em que o extra vai pras dívidas: a escolhida, ou da mais cara pra
 * mais barata - deixando de fora a que custa menos que a inflação (ex.: um FIES
 * de taxa baixa: em dinheiro de hoje ela encolhe sozinha, antecipar é perder).
 */
export function ordemAlvo(dividas, alvo, trMensal, ipca = 0) {
  const ids = ORDEM_DIVIDAS.filter((id) => dividas[id] && dividas[id].saldo > EPS);
  if (alvo === 'cara') {
    return ids.filter((id) => custoEfetivo(dividas[id], trMensal) >= ipca)
      .sort((a, b) => custoEfetivo(dividas[b], trMensal) - custoEfetivo(dividas[a], trMensal));
  }
  return ids.filter((id) => id === alvo);
}

/**
 * Quanto do extra cai no mês t: todo mês, ou o valor anual em dezembro (no
 * primeiro dezembro, proporcional aos meses desde hoje - assim o total
 * guardado é o mesmo do mensal).
 */
export function extraNoMes(freq, valor, mes, t) {
  if (freq !== 'anual') return valor;
  return mes.slice(5, 7) === '12' ? valor * (Math.min(12, t) / 12) : 0;
}

/**
 * Roda um cenário. fracAmortizar: 0 (só parcelas / investir), 1 (amortizar),
 * 0,5 (metade).
 */
function rodarCenario(p, pr, { valor, fracAmortizar, perfil, taxaFixa = 0, meses, freq = p.frequencia, basePagamentos = null }) {
  const dividas = Object.fromEntries(ORDEM_DIVIDAS.filter((id) => p.dividas[id]).map((id) => [id, novaDivida({ id, ...p.dividas[id] })]));
  const ordem = ordemAlvo(p.dividas, p.alvo, pr.trMensal, pr.ipca);
  const cart = novaCarteira(perfil, pr, { taxaFixa, reinvestirProventos: p.reinvestirProventos !== false });
  const fg = novoFgts(p.fgts, pr);
  const D0 = Object.values(dividas).reduce((s, d) => s + d.saldo, 0);
  const fg0 = fg ? fg.saldo : 0;
  const pagamentos = [];
  const linhas = [{ t: 0, mes: mesDe(p.hoje), dividas: Object.fromEntries(Object.entries(dividas).map(([k, d]) => [k, d.saldo])), totalDividas: D0, investidoBruto: 0, investidoLiquido: 0, aportado: 0, juros: 0, seguro: 0, fgts: fg0, renda: 0, rendaReal: 0, consumido: 0, patrimonio: p.patrimonioBase }];
  let consumido = 0;
  let jurosAcum = 0;
  let seguroAcum = 0;
  let fgtsUsado = 0;
  for (let t = 1; t <= meses; t += 1) {
    const mes = somarMeses(p.hoje, t);
    const trM = trNoMes(t, pr);
    cart.passo(t);
    let pago = 0;
    Object.values(dividas).forEach((d) => {
      const r = d.mes(t, d.id === 'financiamento' ? trM : 0);
      pago += r.pagamento; jurosAcum += r.juros; seguroAcum += r.seguro;
    });
    pagamentos.push(pago);
    if (fg && dividas.financiamento) {
      const disp = fg.mes(mes, trM);
      if (disp > 0 && dividas.financiamento.ativa) { const v = dividas.financiamento.extra(t, disp, 'prazo'); fg.usou(mes, v); fgtsUsado += v; }
    } else if (fg) fg.mes(mes, trM);
    const X = extraNoMes(freq, valor, mes, t);
    let praDivida = X * fracAmortizar;
    for (const id of ordem) {
      if (!(praDivida > EPS)) break;
      praDivida -= dividas[id].extra(t, praDivida, p.modo);
    }
    const base = basePagamentos ? (basePagamentos[t - 1] || 0) : pago;
    const sobra = Math.max(0, base - pago);
    const investe = X * (1 - fracAmortizar) + Math.max(0, praDivida) + (p.reinvestirDiferenca !== false ? sobra : 0);
    if (p.reinvestirDiferenca === false) consumido += sobra;
    cart.aportar(t, investe);
    if (t % 12 === 0 || t === meses) {
      const totalDividas = Object.values(dividas).reduce((s, d) => s + d.saldo, 0);
      const liq = cart.liquido(t);
      const fgAgora = fg ? fg.saldo + fg.saques : fg0;
      linhas.push({
        t, mes,
        dividas: Object.fromEntries(Object.entries(dividas).map(([k, d]) => [k, d.saldo])),
        totalDividas, investidoBruto: cart.bruto(), investidoLiquido: liq, aportado: cart.aportado,
        juros: jurosAcum, seguro: seguroAcum, fgts: fgAgora, renda: cart.rendaMensal(), rendaReal: cart.rendaMensalReal(), consumido,
        rendaRecebida: cart.rendaRecebida,
        patrimonio: p.patrimonioBase + (D0 - totalDividas) + liq + (fgAgora - fg0),
      });
    }
  }
  return {
    linhas, pagamentos, jurosAcum, seguroAcum, fgtsUsado, consumido,
    quitacao: Object.fromEntries(Object.entries(dividas).map(([k, d]) => [k, d.st.quitadaEm])),
    estado: Object.fromEntries(Object.entries(dividas).map(([k, d]) => [k, { ...d.st, saldo: d.saldo }])),
    carteira: cart,
  };
}

/** Linha do cenário no fim do ano k (k = 0 é hoje). */
const noAno = (cen, k) => cen.linhas.find((l) => l.t === k * 12) || cen.linhas[cen.linhas.length - 1];

/** Quantos meses rodar: o horizonte, ou até as dívidas acabarem no cenário base (o que for maior; máx. 50 anos). */
function mesesTotais(p, pr) {
  const ids = ORDEM_DIVIDAS.filter((id) => p.dividas[id]);
  let n = p.horizonteAnos * 12;
  ids.forEach((id) => {
    const d = novaDivida({ id, ...p.dividas[id] });
    let t = 0;
    while (d.ativa && t < 600) { t += 1; d.mes(t, id === 'financiamento' ? trNoMes(t, pr) : 0); }
    n = Math.max(n, t);
  });
  return Math.min(600, n);
}

/**
 * Simulação completa.
 * params: {
 *   hoje, patrimonioBase,
 *   dividas: { financiamento?: {...novaDivida}, fies?: {...} },
 *   fgts?: { saldo, deposito, mesAniversario, proximoUso, intervalo, usar },
 *   valor, frequencia: 'mensal'|'anual', alvo: 'financiamento'|'fies'|'cara',
 *   modo: 'prazo'|'parcela', reinvestirDiferenca, perfil, reinvestirProventos,
 *   horizonteAnos, fracMisto (0,5), taxas: {cdi, ipca, trMensal, ...PADROES},
 *   reserva?: { atual, meta }
 * }
 */
export function simular(params, { leve = false } = {}) {
  const p = {
    frequencia: 'mensal', alvo: 'cara', modo: 'prazo', reinvestirDiferenca: true, perfil: 'cdi100', reinvestirProventos: true,
    horizonteAnos: 10, fracMisto: 0.5, patrimonioBase: 0, valor: 0, dividas: {}, ...params,
  };
  const pr = premissas(p.taxas);
  const temDivida = ORDEM_DIVIDAS.some((id) => p.dividas[id] && p.dividas[id].saldo > EPS);
  const M = mesesTotais(p, pr);
  const H = p.horizonteAnos;
  const base = rodarCenario(p, pr, { valor: 0, fracAmortizar: 0, perfil: p.perfil, meses: M });
  const bp = base.pagamentos;
  const roda = (o) => rodarCenario(p, pr, { meses: M, basePagamentos: bp, perfil: p.perfil, valor: p.valor, ...o });
  const cen = {
    base,
    amortizar: roda({ fracAmortizar: 1 }),
    investir: roda({ fracAmortizar: 0 }),
    misto: roda({ fracAmortizar: p.fracMisto }),
  };
  const anos = [];
  for (let k = 0; k <= H; k += 1) {
    const linha = { k, mes: noAno(base, k).mes, ano: Number(noAno(base, k).mes.slice(0, 4)) };
    Object.entries(cen).forEach(([id, c]) => { linha[id] = noAno(c, k); });
    anos.push(linha);
  }
  const fim = anos[anos.length - 1];
  // quitação e juros (até as dívidas acabarem, não só no horizonte)
  const quitacao = {};
  ORDEM_DIVIDAS.filter((id) => p.dividas[id]).forEach((id) => {
    const qb = base.quitacao[id];
    const q = (c) => c.quitacao[id];
    quitacao[id] = {
      base: qb, baseMes: qb != null ? somarMeses(p.hoje, qb) : null,
      amortizar: q(cen.amortizar), amortizarMes: q(cen.amortizar) != null ? somarMeses(p.hoje, q(cen.amortizar)) : null,
      misto: q(cen.misto), mistoMes: q(cen.misto) != null ? somarMeses(p.hoje, q(cen.misto)) : null,
      mesesAdiantados: qb != null && q(cen.amortizar) != null ? qb - q(cen.amortizar) : null,
      mesesAdiantadosMisto: qb != null && q(cen.misto) != null ? qb - q(cen.misto) : null,
    };
  });
  const custo = (c) => c.jurosAcum + c.seguroAcum;
  const ordem = ordemAlvo(p.dividas, p.alvo, pr.trMensal, pr.ipca);
  const trMedia = (() => { let s = 0; for (let t = 1; t <= H * 12; t += 1) s += trNoMes(t, pr); return s / (H * 12 || 1); })();
  const custos = Object.fromEntries(ORDEM_DIVIDAS.filter((id) => p.dividas[id]).map((id) => [id, { hoje: custoEfetivo(p.dividas[id], pr.trMensal), medio: custoEfetivo(p.dividas[id], trMedia) }]));
  // retorno líquido médio do perfil no horizonte (R$ 1 aplicado hoje, resgatado no fim)
  const retornoLiquido = (perfil) => {
    const c = novaCarteira(perfil, pr, { reinvestirProventos: true });
    c.aportar(0, 1);
    for (let t = 1; t <= H * 12; t += 1) c.passo(t);
    return c.liquido(H * 12) ** (1 / H) - 1;
  };
  // ponto de virada: taxa líquida (sem IR) em que investir empata com amortizar no horizonte
  // 03/10/2026: `leve` (as linhas "matar 2, 3, 4 parcelas" rodam 6 simulações):
  // sem ponto de virada, sem os outros perfis e sem a outra frequência
  const virada = (() => {
    if (leve || !temDivida || !ordem.length || !(p.valor > 0)) return null;
    const dif = (r) => {
      const a = roda({ fracAmortizar: 1, perfil: 'fixa', taxaFixa: r });
      const b = roda({ fracAmortizar: 0, perfil: 'fixa', taxaFixa: r });
      return noAno(a, H).patrimonio - noAno(b, H).patrimonio;
    };
    let lo = -0.02; let hi = 0.4;
    if (dif(lo) <= 0) return { taxa: lo, abaixo: true };
    if (dif(hi) >= 0) return { taxa: hi, acima: true };
    for (let k = 0; k < 40; k += 1) { const m = (lo + hi) / 2; if (dif(m) > 0) lo = m; else hi = m; }
    return { taxa: (lo + hi) / 2 };
  })();
  // os quatro perfis lado a lado (cenário "investir")
  const perfis = (leve ? [p.perfil] : Object.keys(PERFIS)).map((id) => {
    const c = id === p.perfil ? cen.investir : roda({ fracAmortizar: 0, perfil: id });
    const l = noAno(c, H);
    return { id, ...PERFIS[id], patrimonio: l.patrimonio, investidoLiquido: l.investidoLiquido, investidoBruto: l.investidoBruto, renda: l.renda, rendaReal: l.rendaReal, retornoLiquido: retornoLiquido(id) };
  });
  // o vídeo: todo mês x uma vez por ano (mesmo total no ano)
  const outraFreq = p.frequencia === 'anual' ? 'mensal' : 'anual';
  const outra = !leve && p.valor > 0 && temDivida ? rodarCenario(p, pr, { meses: M, basePagamentos: bp, perfil: p.perfil, valor: p.frequencia === 'anual' ? p.valor / 12 : p.valor * 12, fracAmortizar: 1, freq: outraFreq }) : null;
  const frequencias = outra ? {
    atual: p.frequencia, outra: outraFreq,
    economiaAtual: r2(custo(base) - custo(cen.amortizar)),
    economiaOutra: r2(custo(base) - custo(outra)),
    patrimonioOutra: noAno(outra, H).patrimonio,
  } : null;
  // TR x amortização da parcela hoje (vídeo, 07:30)
  const fin = p.dividas.financiamento;
  const trHoje = fin && fin.tr ? {
    correcao: r2(fin.saldo * pr.trMensal),
    amortizacao: fin.sistema === 'SAC' ? r2((fin.amortizacao || 0) * (1 + pr.trMensal)) : null,
  } : null;
  const aportadoHorizonte = (() => { let s = 0; for (let t = 1; t <= H * 12; t += 1) s += extraNoMes(p.frequencia, p.valor, somarMeses(p.hoje, t), t); return s; })();
  const resumo = {
    horizonteAnos: H, mesHorizonte: fim.mes, anoHorizonte: fim.ano,
    patrimonio: { base: fim.base.patrimonio, amortizar: fim.amortizar.patrimonio, investir: fim.investir.patrimonio, misto: fim.misto.patrimonio },
    vantagemInvestir: fim.investir.patrimonio - fim.amortizar.patrimonio,
    diferencaPorAno: anos.map((a) => ({ ano: a.ano, k: a.k, investirMenosAmortizar: a.investir.patrimonio - a.amortizar.patrimonio })),
    jurosEconomizados: r2(base.jurosAcum - cen.amortizar.jurosAcum),
    seguroEconomizado: r2(base.seguroAcum - cen.amortizar.seguroAcum),
    custoEconomizado: r2(custo(base) - custo(cen.amortizar)),
    custoEconomizadoMisto: r2(custo(base) - custo(cen.misto)),
    jurosEconomizadosHorizonte: r2((fim.base.juros + fim.base.seguro) - (fim.amortizar.juros + fim.amortizar.seguro)),
    investidoBruto: fim.investir.investidoBruto,
    investidoLiquido: fim.investir.investidoLiquido,
    irEstimado: fim.investir.investidoBruto - fim.investir.investidoLiquido,
    aportadoInvestir: fim.investir.aportado,
    rendimentoLiquido: fim.investir.investidoLiquido - fim.investir.aportado,
    rendaPassiva: fim.investir.renda,
    rendaPassivaReal: fim.investir.rendaReal,
    rendaPassivaAmortizar: fim.amortizar.renda,
    aportadoHorizonte,
    quitacao, custos, trMedia, ordemAlvo: ordem,
    retornoLiquido: retornoLiquido(p.perfil),
    virada, perfis, frequencias, trHoje,
    melhor: fim.investir.patrimonio > fim.amortizar.patrimonio ? 'investir' : 'amortizar',
    // quitando antes, os depósitos do FGTS ficam parados (rendem 3% + TR) em vez de abater a dívida
    fgtsParado: Math.max(0, fim.amortizar.fgts - fim.base.fgts),
  };
  return { params: p, premissas: pr, meses: M, anos, cenarios: cen, resumo, temDivida };
}

// ---------------------------------------------------------------------------
// "Matar parcelas": quanto amortizar por mês pra tirar k parcelas do fim
// ---------------------------------------------------------------------------

const NOMES_DIVIDA_CURTO = { financiamento: 'Apê', fies: 'FIES' };

/**
 * 03/10/2026 (Tiago: "O valor de amortização mensal default é sempre o mínimo
 * para matar ao menos duas parcelas, se eu amortizar"): quanto pagar a mais
 * no mês que vem, no modo "reduzir prazo", pro contrato perder `k` parcelas
 * do fim.
 *  - SAC (corrigido em 05/10/2026 com os prints da Caixa: R$ 900 tiram 2
 *    parcelas, R$ 860 só 1 - não são k × A): o prazo novo é o menor n' em que
 *    a prestação (amortização + juros) não passa da atual (ver
 *    prazoCaixaSac). Pra n' = n − k a amortização EFETIVA mínima é
 *    s·(1/n' − 1/n)/(1/n' + i) (~R$ 440 por parcela com 261 a pagar); o valor
 *    a pagar soma os juros pro rata dos `dias` desde o vencimento
 *    (valor × i × dias/30, a Caixa desconta isso do valor).
 *  - Price (FIES): o principal das k últimas parcelas = o valor presente
 *    delas hoje: P × [(1+i)^−(n−k) − (1+i)^−n] / i, n = parcelas que faltam
 *    depois da do mês.
 * Conta igual ao simulador: a parcela normal do mês sai antes do extra.
 * divida: formato do simulador (dividasDoContexto); trMensal: a TR do mês que
 * vem (trNoMes(1, premissas)). Devolve { k, exato, valor (arredondado pra
 * cima de `passo` em `passo` reais), porParcela, restantes, saldo, sistema }
 * ou null. Pedir k >= o que falta = quitar (valor = saldo).
 */
export function valorParaMatarParcelas(divida, k = 2, { trMensal = 0, passo = 10, dias = 0 } = {}) {
  if (!divida || !(divida.saldo > EPS) || !(k > 0)) return null;
  const d = novaDivida({ id: divida.id, ...divida });
  d.mes(1, divida.tr ? trMensal : 0);
  if (!d.ativa) return null;
  const n = d.restante();
  if (!Number.isFinite(n) || n <= 0) return null;
  const s = d.saldo;
  const i = divida.taxaMensal || 0;
  const f = i > 0 && dias > 0 ? (i * dias) / 30 : 0;
  const kk = Math.min(k, n);
  let exato;
  if (kk >= n) exato = s * (1 + f);
  else if (divida.sistema === 'SAC') exato = ((s * (1 / (n - kk) - 1 / n)) / (1 / (n - kk) + i)) / (1 - f);
  else exato = i > 0 ? (d.parcela * ((1 + i) ** -(n - kk) - (1 + i) ** -n)) / i / (1 - f) : kk * d.parcela / (1 - f);
  const teto = s * (1 + f);
  exato = Math.min(Math.ceil(exato * 100 - 1e-6) / 100, teto);
  // confere no próprio motor (arredondamento de ponto flutuante na fronteira): sobe de centavo em centavo
  const tira = (v) => { const x = novaDivida({ id: divida.id, ...divida }); x.mes(1, divida.tr ? trMensal : 0); x.extra(1, v, 'prazo', { dias }); return n - x.restante(); };
  for (let k2 = 0; k2 < 5 && exato < teto && tira(exato) < kk; k2 += 1) exato = r2(exato + 0.01);
  exato = r2(exato);
  const valor = passo > 0 ? Math.min(Math.ceil(exato / passo - 1e-9) * passo, Math.ceil(teto)) : exato;
  return { k: kk, exato, valor, porParcela: r2(exato / kk), restantes: n, saldo: r2(s), sistema: divida.sistema };
}

/**
 * O contrário: quantas parcelas (com fração) um extra de `valor` tira do fim
 * no mês que vem. SAC: n − n'(contínuo da regra da Caixa, prazoCaixaSacExato);
 * Price: n(saldo) − n(saldo − valor), com o n contínuo da Price. `dias`:
 * juros pro rata que saem do valor (como em valorParaMatarParcelas).
 */
export function parcelasQueOValorMata(divida, valor, { trMensal = 0, dias = 0 } = {}) {
  if (!divida || !(divida.saldo > EPS) || !(valor > 0)) return 0;
  const d = novaDivida({ id: divida.id, ...divida });
  d.mes(1, divida.tr ? trMensal : 0);
  if (!d.ativa) return 0;
  const s = d.saldo;
  const i = divida.taxaMensal || 0;
  const f = i > 0 && dias > 0 ? (i * dias) / 30 : 0;
  if (valor >= s * (1 + f) - EPS) return d.restante();
  const ef = valor * (1 - f);
  if (divida.sistema === 'SAC') return d.restante() - prazoCaixaSacExato(s, d.restante(), i, s - ef);
  const P = d.parcela;
  if (!(i > 0)) return ef / P;
  const nf = (x) => -Math.log(1 - (x * i) / P) / Math.log(1 + i);
  return nf(s) - nf(s - ef);
}

/** A dívida que o extra paga primeiro (a escolhida, ou a mais cara) e o mínimo pra matar k parcelas nela. */
export function minimoParaMatar(params, k = 2, alvo = params && params.alvo) {
  if (!params || !params.dividas) return null;
  const pr = premissas(params.taxas);
  const id = ordemAlvo(params.dividas, alvo || 'cara', pr.trMensal, pr.ipca)[0];
  if (!id) return null;
  const m = valorParaMatarParcelas(params.dividas[id], k, { trMensal: trNoMes(1, pr) });
  return m ? { id, nome: NOMES_DIVIDA_CURTO[id], ...m } : null;
}

/**
 * "Quanto amortizar pra matar 2, 3 e 4 parcelas por mês", pra cada dívida:
 * o valor mensal, a nova quitação, os juros (+ seguro) economizados e o
 * patrimônio no horizonte amortizando x investindo o mesmo valor (as outras
 * escolhas - perfil, horizonte, taxas, FGTS - vêm de `params`).
 */
export function opcoesMatarParcelas(params, { ks = [2, 3, 4] } = {}) {
  const pr = premissas(params.taxas);
  const tr1 = trNoMes(1, pr);
  return ORDEM_DIVIDAS.filter((id) => params.dividas && params.dividas[id] && params.dividas[id].saldo > EPS).map((id) => {
    const divida = params.dividas[id];
    const custo = custoEfetivo(divida, pr.trMensal);
    const linhas = [];
    ks.forEach((k) => {
      const m = valorParaMatarParcelas(divida, k, { trMensal: tr1 });
      if (!m || linhas.some((l) => l.k === m.k)) return;
      const sim = simular({ ...params, alvo: id, valor: m.valor, frequencia: 'mensal', modo: 'prazo' }, { leve: true });
      const q = sim.resumo.quitacao[id] || {};
      const r = sim.resumo;
      linhas.push({
        ...m, pedido: k,
        baseMes: q.baseMes, quitaMes: q.amortizarMes, mesesAdiantados: q.mesesAdiantados,
        custoEconomizado: r.custoEconomizado,
        patrimonioAmortizar: r.patrimonio.amortizar, patrimonioInvestir: r.patrimonio.investir,
        vantagemInvestir: r.vantagemInvestir, melhor: r.melhor, anoHorizonte: r.anoHorizonte,
      });
    });
    return { id, nome: NOMES_DIVIDA_CURTO[id], sistema: divida.sistema, custo, abaixoInflacao: num(custo) && custo < pr.ipca, linhas };
  });
}

// ---------------------------------------------------------------------------
// Ritmo e "quando chego ao primeiro milhão" (o herói da aba Simulações)
// ---------------------------------------------------------------------------

/** Valor de uma série anual do simulador ([{ t, ...}], t em meses) no mês m (reta entre os pontos; depois do fim, o último). */
export function valorNaLinha(linhas, campo, m) {
  if (!linhas || !linhas.length) return 0;
  const v = (l) => (num(l[campo]) ? l[campo] : 0);
  if (m <= linhas[0].t) return v(linhas[0]);
  for (let k = 1; k < linhas.length; k += 1) {
    const a = linhas[k - 1]; const b = linhas[k];
    if (m <= b.t) return v(a) + ((v(b) - v(a)) * (m - a.t)) / ((b.t - a.t) || 1);
  }
  return v(linhas[linhas.length - 1]);
}

/**
 * 03/10/2026 (Tiago: "Ritmo atual e quando chego ao primeiro milhão"):
 * patrimônio líquido mês a mês, em dinheiro de hoje (como a aba Patrimônio):
 *   apê e outros bens (parados em valor real)
 *   + investimentos (projetarAposentadoria: o aporte do ritmo, o rendimento
 *     real e as parcelas que viram aporte quando as dívidas acabam)
 *   − (dívidas − FGTS) do cenário "só as parcelas" do simulador, descontada
 *     a inflação (a dívida em reais encolhe em dinheiro de hoje)
 *   + o que um cenário do simulador soma a mais (amortizar ou investir o
 *     extra), também descontado.
 * entradas: { liquido, investido, aporte, rendimentoReal, ipca, liberacoes,
 * base (linhas do cenário base), cenario (linhas, opcional), alvo, maxMeses }.
 * Devolve { meses (a partir de hoje; 0 = já tem; null = não chega), serie(m) }.
 */
export function projetarMarco({ liquido = 0, investido = 0, aporte = 0, rendimentoReal = 0.05, ipca = 0, liberacoes = [], base = null, cenario = null, alvo = 1e6, maxMeses = 600 } = {}) {
  const proj = projetarAposentadoria({ inicial: investido, aporte, rendimentoReal, liberacoes, maxMeses });
  const passivo = (m) => (base ? valorNaLinha(base, 'totalDividas', m) - valorNaLinha(base, 'fgts', m) : 0);
  const fixo = liquido - investido + passivo(0);
  const serie = (m) => {
    const defl = (1 + ipca) ** (m / 12);
    const extra = cenario && base ? valorNaLinha(cenario, 'patrimonio', m) - valorNaLinha(base, 'patrimonio', m) : 0;
    return fixo + proj.pontos[Math.min(m, proj.pontos.length - 1)].v - passivo(m) / defl + extra / defl;
  };
  let meses = null;
  for (let m = 0; m <= maxMeses; m += 1) { if (serie(m) >= alvo) { meses = m; break; } }
  return { meses, serie };
}

/** O próximo milhão redondo acima de `v` (R$ 1 mi, 2 mi...). */
export const proximoMilhao = (v) => Math.max(1, Math.floor((num(v) ? v : 0) / 1e6) + 1) * 1e6;

// ---------------------------------------------------------------------------
// Cenário padrão a partir do contexto do patrimônio
// ---------------------------------------------------------------------------

/**
 * Dívidas de hoje no formato do simulador. Usa ctx.cfg (ou ctx.d.config):
 *  - financiamento: saldo, dataSaldo, taxaAnual (nominal), amortizacao,
 *    prazoRestante, seguroTaxas, sistema, parcela, indexador, saldosConhecidos,
 *    amortizacoesExtras, dataInicio, valorFinanciado (+ fgts pros usos já feitos);
 *  - fies: saldo, dataSaldo, parcela, taxaMensal, restantes/fim, inicioAmortizacao.
 */
export function dividasDoContexto(cfg, hoje) {
  const out = {};
  const f = financiamentoEfetivo(cfg);
  if (f && num(f.saldo) && f.saldo > 0) {
    // 05/10/2026 (A-08): saldo de hoje = depois só das parcelas já vencidas (e não do mês cheio)
    const saldo = saldoFinanciamento(f, mesDaDivida(f, hoje), extrasFinanciamento(f, cfg.fgts)) ?? f.saldo;
    const sistema = f.sistema === 'Price' ? 'Price' : 'SAC';
    const A = num(f.amortizacao) && f.amortizacao > 0 ? f.amortizacao : (f.prazoRestante ? f.saldo / f.prazoRestante : null);
    out.financiamento = {
      nome: 'Apartamento', sistema, saldo, taxaMensal: (f.taxaAnual || 0) / 12, amortizacao: A,
      parcela: sistema === 'Price' && num(f.parcela) ? Math.max(0, f.parcela - (f.seguroTaxas || 0)) : null,
      meses: A ? Math.ceil(saldo / A - 1e-9) : f.prazoRestante, seguro: num(f.seguroTaxas) ? f.seguroTaxas * (f.saldo > 0 ? saldo / f.saldo : 1) : 0,
      tr: !f.indexador || /TR/i.test(f.indexador),
    };
  }
  const fi = cfg && cfg.fies;
  if (fi && num(fi.saldo) && fi.saldo > 0) {
    const saldo = saldoFies(fi, mesDaDivida(fi, hoje)) ?? fi.saldo;
    out.fies = {
      nome: 'FIES', sistema: 'Price', saldo, taxaMensal: fi.taxaMensal || 0, parcela: fi.parcela, meses: mesesRestantesFies(fi, hoje), seguro: 0, tr: false,
    };
  }
  return out;
}

const arred = (v, passo) => Math.round(v / passo) * passo;

/**
 * Tudo que o simulador precisa, a partir do contexto da aba Patrimônio
 * (contextoPatrimonio em organizacao-patrimonio.js). Campos usados:
 *  ctx.d.hoje, ctx.d.cdi, ctx.d.ipca?, ctx.d.trMensal?, ctx.d.metas
 *  (salarioLiquido, reservaMeta), ctx.d.investimentos.reserva, ctx.d.despesas
 *  (totalComFolga), ctx.cfg (financiamento, fies, fgts, carreira),
 *  ctx.b.liquido (patrimônio líquido de hoje) e ctx.fgts (resumoFgts:
 *  saldo, proximaAmortizacao, aniversario).
 * Valor padrão (03/10/2026, Tiago: "O valor de amortização mensal default é
 * sempre o mínimo para matar ao menos duas parcelas"): o mínimo que tira 2
 * parcelas por mês da dívida que o simulador escolhe (a mais cara), no modo
 * prazo - valorParaMatarParcelas. Sem dívida pra amortizar, a regra antiga:
 * 10% do salário líquido, redondo (sem o salário: R$ 1.000/mês) - que segue
 * em `valorSalario` (pra reconhecer uma escolha antiga salva no navegador).
 */
export function parametrosPadrao(ctx, hoje = null) {
  const d = (ctx && ctx.d) || {};
  const cfg = (ctx && ctx.cfg) || d.config || {};
  const h = hoje || d.hoje;
  const metas = d.metas || {};
  const sal = num(metas.salarioLiquido) && metas.salarioLiquido > 0 ? metas.salarioLiquido : null;
  const valor = sal ? Math.max(100, arred(sal * 0.1, 100)) : 1000;
  const fg = ctx && ctx.fgts;
  const salario = salarioEm(cfg.carreira, h);
  const mesHoje = mesDe(h);
  let fgts = null;
  if (fg && num(fg.saldo)) {
    const aniv = fg.aniversario || {};
    const saldoHoje = saldoFgtsEm(cfg.fgts, mesHoje);
    fgts = {
      saldo: num(saldoHoje) ? saldoHoje : fg.saldo, deposito: num(salario) ? salario * 0.08 : 0,
      mesAniversario: aniv.ativo ? aniv.mesAniversario : null,
      proximoUso: fg.proximaAmortizacao && fg.proximaAmortizacao > mesHoje ? fg.proximaAmortizacao : somarMeses(mesHoje, 1), intervalo: 24, usar: true,
    };
  }
  const taxas = {};
  if (num(d.cdi) && d.cdi > 0) taxas.cdi = d.cdi;
  if (num(d.ipca)) taxas.ipca = d.ipca;
  if (num(d.trMensal)) taxas.trMensal = d.trMensal;
  const inv = d.investimentos || {};
  const b = (ctx && ctx.b) || {};
  const dividas = dividasDoContexto(cfg, h);
  const minimo = minimoParaMatar({ dividas, taxas }, 2, 'cara');
  return {
    hoje: h, patrimonioBase: num(b.liquido) ? b.liquido : 0,
    dividas, fgts,
    valor: minimo ? minimo.valor : valor, valorSalario: valor, valorMinimo: minimo,
    frequencia: 'mensal', alvo: 'cara', modo: 'prazo', reinvestirDiferenca: true,
    perfil: 'cdi100', reinvestirProventos: true, horizonteAnos: 10, fracMisto: 0.5, taxas,
    reserva: { atual: num(inv.reserva) ? inv.reserva : null, meta: num(metas.reservaMeta) ? metas.reservaMeta : null, custoMensal: d.despesas && num(d.despesas.totalComFolga) ? d.despesas.totalComFolga : null },
    salarioLiquido: sal,
  };
}

// ---------------------------------------------------------------------------
// Veredito (texto)
// ---------------------------------------------------------------------------


const mesAnoTxt = (m) => formatMesAno(m, { anoCurto: false, vazio: '—' });
const pctTxt = (f, c = 1) => formatPct(f, c);
const milTxt = (v) => formatBRLMil(v);
const mesesTxt = (m) => (m == null ? '—' : m >= 24 ? `${(m / 12).toFixed(1).replace('.', ',')} anos` : `${m} ${m === 1 ? 'mês' : 'meses'}`);
const NOME_DIVIDA = { financiamento: 'o apê', fies: 'o FIES' };

/** Veredito em linguagem simples: { titulo, texto, bullets: [{tom, html}] } (html só com <b>). */
export function veredito(sim) {
  const { resumo: r, params: p, premissas: pr } = sim;
  if (!sim.temDivida) return { titulo: 'Sem dívida pra amortizar', texto: 'Cadastre o financiamento ou o FIES na aba Patrimônio pra comparar.', bullets: [] };
  if (!(p.valor > 0)) return { titulo: 'Coloque um valor', texto: 'Digite quanto sobraria por mês (ou por ano) pra comparar os dois caminhos.', bullets: [] };
  const alvo = r.ordemAlvo[0];
  const custoAlvo = alvo ? r.custos[alvo] : null;
  const ganha = r.melhor;
  const dif = Math.abs(r.vantagemInvestir);
  const empate = dif < Math.max(0.02 * r.aportadoHorizonte, 1000);
  const perfil = PERFIS[p.perfil];
  const freqTxt = p.frequencia === 'anual' ? `${milTxt(p.valor)} por ano` : `${milTxt(p.valor)} por mês`;
  let titulo;
  let texto;
  if (!alvo) {
    titulo = 'A dívida escolhida já acabou';
    texto = 'Escolha outra dívida ou "a mais cara primeiro".';
  } else if (empate) {
    titulo = 'Praticamente empate';
    texto = `Com ${freqTxt} por ${r.horizonteAnos} anos, amortizar ${NOME_DIVIDA[alvo]} e investir em ${perfil.nome} dão quase o mesmo patrimônio em ${r.anoHorizonte} (diferença de ${milTxt(dif)}). A dívida custa ~${pctTxt(custoAlvo.medio)} ao ano e o investimento rende ~${pctTxt(r.retornoLiquido)} líquido: quando dá empate, decida pela liquidez e pela tranquilidade.`;
  } else if (ganha === 'investir') {
    titulo = `Investir em ${perfil.curto} rende ${milTxt(dif)} a mais`;
    texto = `Com ${freqTxt} por ${r.horizonteAnos} anos, investir em ${perfil.nome} deixa seu patrimônio ${milTxt(dif)} maior em ${r.anoHorizonte} do que amortizar ${NOME_DIVIDA[alvo]}. O motivo: o investimento rende ~${pctTxt(r.retornoLiquido)} ao ano já sem IR, e a dívida custa ~${pctTxt(custoAlvo.medio)} (juros${p.dividas[alvo].tr ? ' + TR' : ''}${p.dividas[alvo].seguro ? ' + seguro' : ''}).`;
  } else {
    titulo = `Amortizar ${NOME_DIVIDA[alvo]} deixa você ${milTxt(dif)} mais rico`;
    texto = `Com ${freqTxt} por ${r.horizonteAnos} anos, amortizar ${NOME_DIVIDA[alvo]} deixa seu patrimônio ${milTxt(dif)} maior em ${r.anoHorizonte} do que investir em ${perfil.nome}. A dívida custa ~${pctTxt(custoAlvo.medio)} ao ano${p.dividas[alvo].tr ? ' (juros + TR' : ' ('}${p.dividas[alvo].seguro ? ' + seguro)' : ')'} e o investimento rende ~${pctTxt(r.retornoLiquido)} líquido - pagar a dívida é um "rendimento" garantido e sem IR.`;
  }
  if (alvo && r.virada && !r.virada.acima && !r.virada.abaixo) {
    const cdiEq = p.perfil.startsWith('cdi') ? ` (um CDI médio de ~${pctTxt(r.virada.taxa / 0.85 / (p.perfil === 'cdi110' ? 1.1 : 1))})` : '';
    texto += ` A resposta muda se o investimento render ${ganha === 'investir' ? 'menos' : 'mais'} que ${pctTxt(r.virada.taxa)} líquido ao ano${cdiEq}.`;
  }
  const bullets = [];
  const best = [...r.perfis].sort((a, b) => b.patrimonio - a.patrimonio)[0];
  if (best && best.id !== p.perfil && best.patrimonio - r.patrimonio.investir > 1000) {
    bullets.push({ tom: 'info', html: `Entre os tipos de investimento, <b>${best.nome}</b> chegaria mais longe (${milTxt(best.patrimonio)} contra ${milTxt(r.patrimonio.investir)}) - com as taxas destas premissas.${best.id === 'fii' ? ` Mas FII não é renda fixa: o dividend yield (${pctTxt(pr.dyFii, 0)}) não é garantido e a cota oscila.` : ''}` });
  }
  if (r.custos.fies && num(r.custos.fies.hoje) && r.custos.fies.hoje < pr.ipca) {
    bullets.push({ tom: 'good', html: `<b>FIES: não antecipe.</b> Custa ${pctTxt(r.custos.fies.hoje)} ao ano, menos que a inflação (${pctTxt(pr.ipca)}): em dinheiro de hoje, a dívida encolhe sozinha. Qualquer aplicação conservadora rende mais.` });
  }
  if (r.custos.financiamento && p.dividas.financiamento.tr) {
    bullets.push({ tom: 'warn', html: `<b>TR:</b> hoje ela soma ~${pctTxt(anual(pr.trMensal))} ao ano ao saldo do apê${r.trHoje ? ` (~${milTxt(r.trHoje.correcao)} por mês)` : ''}. Se a Selic cair, a TR cai junto e o apê fica mais barato - mas o CDI também rende menos. A conta já supõe o CDI indo a ${pctTxt(pr.cdiLongo)} em ${pr.anosTransicao} anos.` });
  }
  if (p.fgts && p.fgts.usar !== false && r.fgtsParado > 1000) {
    bullets.push({ tom: 'warn', html: `<b>FGTS parado:</b> quitando o apê antes, o FGTS dos anos seguintes não tem mais onde amortizar e fica rendendo ~3% + TR (${milTxt(r.fgtsParado)} a mais parados em ${r.anoHorizonte}). Isso pesa contra amortizar em prazos longos.` });
  }
  const res = p.reserva || {};
  if (num(res.atual) && num(res.meta) && res.atual < res.meta * 0.98) {
    bullets.push({ tom: 'bad', html: `<b>Antes de tudo, a reserva:</b> faltam ${milTxt(res.meta - res.atual)} pra meta. Dinheiro amortizado não volta numa emergência.` });
  } else {
    bullets.push({ tom: 'warn', html: '<b>Liquidez:</b> o que vai pra dívida não volta - numa emergência, só o investido pode ser resgatado. Amortizar é garantido; investir depende de as taxas se manterem e de você não gastar.' });
  }
  if (r.frequencias && r.frequencias.atual === 'anual' && r.frequencias.economiaOutra > r.frequencias.economiaAtual + 100) {
    bullets.push({ tom: 'info', html: `Amortizando o mesmo total <b>todo mês</b> em vez de uma vez por ano, você economizaria mais ${milTxt(r.frequencias.economiaOutra - r.frequencias.economiaAtual)} de juros - pouco perto do total, como o vídeo mostra: escolha pelo que cabe no seu caixa.` });
  } else if (r.frequencias && r.frequencias.atual === 'mensal' && r.frequencias.economiaAtual > r.frequencias.economiaOutra + 100) {
    bullets.push({ tom: 'info', html: `Juntando e amortizando <b>uma vez por ano</b> (dezembro), a economia de juros cai só ${milTxt(r.frequencias.economiaAtual - r.frequencias.economiaOutra)} - o vídeo chega na mesma conclusão: mensal ganha, mas por pouco.` });
  }
  return { titulo, texto, bullets };
}

/** Estratégias do vídeo (BextPlay, "Devo amortizar todo mês ou uma vez por ano - 2025") e onde cada uma está na conta. */
export const ESTRATEGIAS_VIDEO = [
  { min: '02:34', t: 154, titulo: 'A TR corrige o saldo todo mês', video: 'Com a Selic alta a TR voltou (~0,17% ao mês, ~2% ao ano); quase todo financiamento (Caixa, MCMV...) é corrigido por ela. Com a Selic abaixo de ~8,5% ela fica perto de zero.', conta: 'O saldo e a amortização do apê são corrigidos pela TR todo mês; a TR acompanha o CDI quando ele cai.' },
  { min: '07:30', t: 450, titulo: 'Amortize mais do que a TR soma', video: 'Uma amortização pequena só "empata" com a correção da TR; o saldo só cai de verdade quando você paga acima dela.', conta: 'O simulador mostra quanto a TR soma por mês ao saldo hoje e quanto a parcela abate.' },
  { min: '08:36', t: 516, titulo: 'Uma referência de valor: ~3 parcelas por ano', video: 'Como valor "legal" de amortização extra o vídeo sugere juntar algo como 3 parcelas por ano.', conta: 'O valor padrão é o mínimo que tira 2 parcelas por mês do fim do contrato (a seção "matar 2, 3 ou 4 parcelas" mostra os outros); troque à vontade.' },
  { min: '09:12', t: 552, titulo: 'Reduzir o prazo, não a parcela', video: 'Amortizar no prazo é o que mais economiza e quita mais rápido.', conta: 'Modo "reduzir prazo" é o padrão; "reduzir parcela" recalcula a parcela e (opção) investe a diferença.' },
  { min: '10:09', t: 609, titulo: 'Todo mês ou uma vez por ano', video: 'Todo mês economiza mais juros, mas a diferença é pequena no contrato inteiro: escolha pelo seu caixa.', conta: 'Você escolhe mensal ou anual (dezembro); o simulador calcula a outra opção e mostra a diferença.' },
  { min: '10:09', t: 609, titulo: 'Conheça a regra do banco', video: 'Por lei o banco tem que aceitar a amortização antecipada, mas cada banco tem seu valor mínimo.', conta: 'Sem limite mínimo na conta - confira no app/agência da Caixa.' },
  { min: '11:30', t: 690, titulo: 'Na Price a parcela "fixa" sobe com a TR', video: 'Na Price a amortização é pequena no começo; com TR a parcela sobe e o saldo pode até crescer. Lá, amortizar é ainda mais importante.', conta: 'Financiamento Price também é corrigido pela TR. O FIES é Price, mas de taxa fixa e sem TR.' },
  { min: '14:40', t: 880, titulo: 'O importante é amortizar sempre', video: 'Mensal ou anual, sem amortizar as correções só atrasam o contrato.', conta: 'O cenário "Amortizar" põe todo o extra na dívida; "Metade" divide entre dívida e investimento.' },
];

/** Referências que aparecem na tela. */
export const REFERENCIAS = [
  { nome: 'BextPlay (Gaspar Mota) - Devo amortizar todo mês ou uma vez por ano - Atualizado para 2025 (vídeo, jul/2025)', url: 'https://www.youtube.com/watch?v=YSFaETS0yQM' },
  { nome: 'Código de Defesa do Consumidor, art. 52, § 2º - direito de amortizar/liquidar antes com redução dos juros', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm' },
  { nome: 'Banco Central - Calculadora do Cidadão (financiamento com prestações fixas)', url: 'https://www3.bcb.gov.br/CALCIDADAO/publico/exibirFormFinanciamentoPrestacoesFixas.do?method=exibirFormFinanciamentoPrestacoesFixas' },
  { nome: 'Banco Central - SGS: TR mensal (série 7811), CDI (4389), IPCA (433)', url: 'https://www3.bcb.gov.br/sgspub/localizarseries/localizarSeries.do?method=prepararTelaLocalizarSeries' },
  { nome: 'Caixa - Perguntas frequentes de quem tem contrato habitacional (amortização, FGTS)', url: 'https://www.caixa.gov.br/voce/habitacao/perguntas-frequentes-contrato/Paginas/default.aspx' },
  { nome: 'Caixa - Manual FGTS Moradia Própria (uso do FGTS a cada 2 anos)', url: 'https://www.caixa.gov.br/Downloads/fgts-moradia/MANUAL_DA_MORADIA_PROPRIA_02_12_2025_V_035.pdf' },
  { nome: 'Lei 8.036/1990 (FGTS) - art. 20 (moradia) e saque-aniversário (Lei 13.932/2019)', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8036consol.htm' },
  { nome: 'Lei 11.033/2004 - IR regressivo da renda fixa (art. 1º) e isenção dos rendimentos de FII (art. 3º, III)', url: 'https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l11033.htm' },
  { nome: 'Lei 14.754/2023 - requisitos atuais da isenção dos FIIs', url: 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14754.htm' },
  { nome: 'B3 - tarifas do Tesouro Direto (custódia 0,20% a.a.)', url: 'https://www.b3.com.br/pt_br/produtos-e-servicos/tarifas/tarifas-de-tesouro-direto/' },
  { nome: 'Tesouro Direto - preços e taxas do dia (IPCA+)', url: 'https://www.tesourodireto.com.br/titulos/precos-e-taxas.htm' },
  { nome: 'Lei 10.260/2001 (FIES) e Lei 14.024/2020 (suspensão das parcelas na pandemia)', url: 'https://www.planalto.gov.br/ccivil_03/leis/leis_2001/l10260.htm' },
  { nome: 'FGC - garantia de CDB/LC até R$ 250 mil por instituição', url: 'https://www.fgc.org.br/garantia-fgc/sobre-a-garantia-fgc' },
];

export { mesAnoTxt, mesesTxt };

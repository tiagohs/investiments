/**
 * ir-resgate-rf.js - 09/10/2026 (Tiago, depois de perguntar ao Gorila: "quanto de IR eu pagaria se resgatasse meu Tesouro
 * Selic 2027 hoje, e quanto se esperar o vencimento?"). Conta PURA (sem DOM) da tela do título de Renda Fixa.
 *
 *  - Hoje: o IR que o Apps Script já calcula por lote (RendaFixaIR.gs - tabela regressiva por lote, IOF nos 30 primeiros
 *    dias), mais a alíquota EFETIVA (imposto ÷ ganho) - com lotes em faixas diferentes ela fica entre 15% e 22,5%.
 *  - No vencimento: o valor de hoje rende até lá pela taxa do título (Selic/CDI/IPCA esperados + o que foi contratado), cada
 *    lote paga a alíquota que terá NAQUELA data e a taxa de custódia da B3 até lá sai do líquido. É ILUSTRATIVO: a taxa muda.
 *  - Marcos: quando cada lote passa para a próxima faixa e a partir de quando TODA a posição paga 15% ("se precisar do
 *    dinheiro antes, resgatar depois de X já garante 15%").
 *
 * Datas como 'AAAA-MM-DD'. Testes: tests/ir-resgate-rf.test.js.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const DIA = 86400000;

/** Tabela regressiva (Lei 11.033/2004) - a mesma de RendaFixaIR.gs!aliquotaIRRendaFixa_. */
export function aliquotaIR(dias) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.2;
  if (dias <= 720) return 0.175;
  return 0.15;
}

/** IOF regressivo dos 30 primeiros dias (% do rendimento) - RendaFixaIR.gs!aliquotaIofRendaFixa_. */
const TABELA_IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0];
export function aliquotaIof(dias) {
  if (!(dias >= 1)) return dias === 0 ? 0.96 : 0;
  return dias >= 30 ? 0 : TABELA_IOF[dias - 1] / 100;
}

/** Primeiro dia de cada faixa (dias corridos desde a aplicação). */
export const INICIO_FAIXAS = [{ dias: 181, aliquota: 0.2 }, { dias: 361, aliquota: 0.175 }, { dias: 721, aliquota: 0.15 }];
export const TAXA_CUSTODIA_B3 = 0.002; // 0,20% a.a. sobre o valor (o Tesouro Selic é isento até R$ 10 mil)
export const ISENCAO_CUSTODIA_SELIC = 10000;

const ms = (iso) => Date.parse(`${iso}T12:00:00Z`);
export const diasEntre = (a, b) => Math.round((ms(b) - ms(a)) / DIA);
export const somarDias = (iso, n) => new Date(ms(iso) + n * DIA).toISOString().slice(0, 10);

/** 'dd/MM/yyyy' -> 'yyyy-MM-dd' (já ISO passa direto). */
export function dataIso(s) {
  const t = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Data de vencimento: a completa (vencimentoData) ou, só com 'MM/yyyy', o dia 1º (marcada como aproximada). */
export function dataVencimento(ativo) {
  const a = ativo || {};
  if (dataIso(a.vencimentoData)) return { data: dataIso(a.vencimentoData), aproximada: false };
  const m = /^(\d{2})\/(\d{4})$/.exec(String(a.vencimento || '').trim());
  return m ? { data: `${m[2]}-${m[1]}-01`, aproximada: true } : null;
}

const pctTexto = (re, texto) => {
  const m = re.exec(String(texto || ''));
  return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) / 100 : null;
};

/**
 * Taxa anual usada para levar o título até o vencimento: { taxa, base: 'Selic'|'CDI'|'IPCA'|'prefixado', baseValor, extra } ou null.
 * `juros` = criterios/macro.js!analisarJuros (selic, ipcaEsperado, ipca12m, cdi12m), em fração.
 */
export function taxaProjetada({ indexador = '', texto = '', juros = null } = {}) {
  const idx = String(indexador || '').toUpperCase();
  const j = juros || {};
  const t = String(texto || '');
  if (/SELIC/.test(idx) || /SELIC/i.test(t)) {
    if (num(j.selic) == null) return null;
    const extra = pctTexto(/SELIC\s*\+\s*([\d.,]+)\s*%/i, t) || 0;
    return { taxa: (1 + j.selic) * (1 + extra) - 1, base: 'Selic', baseValor: j.selic, extra };
  }
  if (/CDI/.test(idx) || /CDI/i.test(t)) {
    // CDI ≈ Selic − 0,10 p.p. (é o que acontece na prática); sem Selic, o CDI dos últimos 12 meses
    const cdi = num(j.selic) != null ? j.selic - 0.001 : num(j.cdi12m);
    if (cdi == null) return null;
    const pct = pctTexto(/([\d.,]+)\s*%\s*(?:do\s*)?CDI/i, t);
    const mais = pctTexto(/CDI\s*\+\s*([\d.,]+)\s*%/i, t);
    if (mais != null) return { taxa: (1 + cdi) * (1 + mais) - 1, base: 'CDI', baseValor: cdi, extra: mais };
    return { taxa: cdi * (pct != null ? pct : 1), base: 'CDI', baseValor: cdi, extra: pct != null ? pct : 1, percentual: true };
  }
  if (/IPCA/.test(idx) || /IPCA/i.test(t)) {
    const ipca = num(j.ipcaEsperado) != null ? j.ipcaEsperado : num(j.ipca12m);
    const extra = pctTexto(/IPCA\s*\+\s*([\d.,]+)\s*%/i, t);
    if (ipca == null || extra == null) return null;
    return { taxa: (1 + ipca) * (1 + extra) - 1, base: 'IPCA', baseValor: ipca, extra };
  }
  const pre = pctTexto(/^\s*([\d.,]+)\s*%/, t);
  return pre != null ? { taxa: pre, base: 'prefixado', baseValor: pre, extra: 0 } : null;
}

/** Imposto de um lote com `dias` corridos e `ganho` em reais: { iof, ir, imposto, aliquota }. */
function impostoLote(ganho, dias, isento) {
  if (isento || !(ganho > 0)) return { iof: 0, ir: 0, imposto: 0, aliquota: isento ? 0 : aliquotaIR(dias) };
  const iof = ganho * aliquotaIof(dias);
  const aliquota = aliquotaIR(dias);
  const ir = (ganho - iof) * aliquota;
  return { iof, ir, imposto: iof + ir, aliquota };
}

/**
 * A comparação inteira. Entrada: `lotes` = detalhes de irSeResgatasseHoje ({ dataAplicacao, valorInvestido, valorAtual,
 * rendimento?, imposto?, iof?, aliquota? }), `valorAtual` (do título), `hoje`, `vencimento` (ISO, opcional), `taxaAnual`
 * (fração, opcional), `isento`, `custodia` ({ taxa, isencao } ou null). Devolve null sem lote com data e valores.
 */
export function compararResgate({ lotes = [], valorAtual = null, hoje, vencimento = null, taxaAnual = null, isento = false, custodia = null } = {}) {
  const ls = (lotes || []).map((l) => ({
    data: dataIso(l.dataAplicacao || l.data), investido: num(l.valorInvestido), atual: num(l.valorAtual),
    servidor: num(l.imposto) != null ? { imposto: l.imposto, iof: num(l.iof) || 0, aliquota: num(l.aliquota) } : null,
  })).filter((l) => l.data && l.investido != null && l.atual != null);
  if (!ls.length || !hoje) return null;
  const totalLotes = ls.reduce((s, l) => s + l.atual, 0);
  const bruto = num(valorAtual) != null ? valorAtual : totalLotes;

  // ---- hoje ----
  const porLote = ls.map((l) => {
    const dias = diasEntre(l.data, hoje);
    const ganho = Math.max(0, l.atual - l.investido);
    const calc = impostoLote(ganho, dias, isento);
    // o IR de hoje é o do Apps Script (a mesma conta); recalcula só se ele não veio
    const hojeLote = l.servidor ? { imposto: l.servidor.imposto, iof: l.servidor.iof, aliquota: l.servidor.aliquota != null ? l.servidor.aliquota : calc.aliquota } : calc;
    return { data: l.data, investido: l.investido, atual: l.atual, dias, ganho, hoje: hojeLote };
  });
  const somar = (f) => porLote.reduce((s, l) => s + f(l), 0);
  const ganhoHoje = somar((l) => l.ganho);
  const impostoHoje = somar((l) => l.hoje.imposto);
  const resgateHoje = {
    data: hoje, bruto, ganho: ganhoHoje, imposto: impostoHoje, iof: somar((l) => l.hoje.iof || 0),
    aliquotaEfetiva: ganhoHoje > 0 ? impostoHoje / ganhoHoje : null, liquido: bruto - impostoHoje,
  };

  // ---- marcos (antes do vencimento, se houver) ----
  const marcos = [];
  porLote.forEach((l) => INICIO_FAIXAS.forEach((f) => {
    const quando = somarDias(l.data, f.dias);
    if (quando > hoje && (!vencimento || quando <= vencimento)) marcos.push({ data: quando, lote: l.data, aliquota: f.aliquota });
  }));
  marcos.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  const pendentes15 = porLote.filter((l) => l.dias < 721);
  const todos15 = pendentes15.length ? pendentes15.map((l) => somarDias(l.data, 721)).sort().at(-1) : null;

  // ---- no vencimento ----
  let resgateVencimento = null;
  if (vencimento && vencimento > hoje && num(taxaAnual) != null) {
    const diasAte = diasEntre(hoje, vencimento);
    const fator = (1 + taxaAnual) ** (diasAte / 365);
    porLote.forEach((l) => {
      const atualV = l.atual * fator;
      const diasV = diasEntre(l.data, vencimento);
      const ganhoV = Math.max(0, atualV - l.investido);
      l.vencimento = { atual: atualV, dias: diasV, ganho: ganhoV, ...impostoLote(ganhoV, diasV, isento) };
    });
    const brutoV = bruto * fator;
    const ganhoV = somar((l) => l.vencimento.ganho);
    const impostoV = somar((l) => l.vencimento.imposto);
    const baseCustodia = custodia ? Math.max(0, ((bruto + brutoV) / 2) - (custodia.isencao || 0)) : 0;
    const custodiaV = custodia ? baseCustodia * (custodia.taxa || 0) * (diasAte / 365) : 0;
    resgateVencimento = {
      data: vencimento, dias: diasAte, fator, bruto: brutoV, ganho: ganhoV, imposto: impostoV,
      aliquotaEfetiva: ganhoV > 0 ? impostoV / ganhoV : null, custodia: custodiaV, liquido: brutoV - impostoV - custodiaV,
    };
  }

  return {
    lotes: porLote, hoje: resgateHoje, vencimento: resgateVencimento, marcos, todos15,
    jaTudo15: !pendentes15.length,
    diferenca: resgateVencimento ? {
      imposto: resgateVencimento.imposto - resgateHoje.imposto,
      liquido: resgateVencimento.liquido - resgateHoje.liquido,
      rendimento: resgateVencimento.bruto - resgateHoje.bruto,
    } : null,
  };
}

/** Custódia da B3 para o título: Tesouro paga 0,20% a.a.; o Tesouro Selic é isento até R$ 10 mil. null fora do Tesouro. */
export function custodiaDoTitulo(nome, tipo) {
  const t = `${nome || ''} ${tipo || ''}`;
  if (!/tesouro/i.test(t)) return null;
  return { taxa: TAXA_CUSTODIA_B3, isencao: /selic|LFT/i.test(t) ? ISENCAO_CUSTODIA_SELIC : 0 };
}

/**
 * salario-calc.js - 26/09/2026: contas da aba "Salário e investimentos" da
 * Organização Financeira (sem DOM - testável).
 *
 *  - investido no mês = compras - vendas daquele mês (série da Início);
 *    "sem proventos" desconta os proventos recebidos no mês (o que saiu do
 *    bolso); "só longo prazo" deixa de fora aportes/resgates da reserva.
 *  - média = só meses FECHADOS (o mês de hoje fica fora), igual à média de
 *    Renda Passiva da Distribuição e Metas.
 *  - meta mensal = salário líquido (DM!N11) × % pra investir (DM!Q11).
 *  - projeção: juros compostos mensais equivalentes ao rendimento anual da
 *    Distribuição e Metas (M18), aporte no fim de cada mês.
 */

const num = (v) => typeof v === 'number' && Number.isFinite(v);

export const JANELAS = [6, 12, 24];

/** Valor investido no mês conforme as escolhas da tela. */
export function valorDoMes(m, { base = 'total', descontarProventos = false } = {}) {
  const bruto = base === 'longoPrazo' ? (m.longoPrazo || 0) : (m.total || 0);
  return bruto - (descontarProventos ? (m.proventos || 0) : 0);
}

export function metaMensal(base) {
  if (!base || !num(base.liquido) || !num(base.percentualInvestir)) return null;
  return base.liquido * base.percentualInvestir;
}

/** Média investida nos últimos `janela` meses fechados + estatísticas contra a meta. */
export function mediaInvestida(mensal, { janela = 12, base = 'total', descontarProventos = false, meta = null, liquido = null } = {}) {
  const fechados = (mensal || []).filter((m) => !m.parcial);
  const meses = fechados.slice(-janela).map((m) => ({ mes: m.mes, valor: valorDoMes(m, { base, descontarProventos }), proventos: m.proventos || 0, reserva: m.reserva || 0 }));
  const n = meses.length;
  const soma = meses.reduce((s, m) => s + m.valor, 0);
  const media = n ? soma / n : null;
  const acima = num(meta) ? meses.filter((m) => m.valor >= meta).length : null;
  const maior = n ? meses.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;
  const menor = n ? meses.reduce((a, b) => (b.valor < a.valor ? b : a)) : null;
  const atual = (mensal || []).find((m) => m.parcial) || null;
  return {
    meses, n, soma, media, acima, maior, menor,
    pctDaMeta: num(meta) && meta > 0 && num(media) ? media / meta : null,
    taxaPoupanca: num(liquido) && liquido > 0 && num(media) ? media / liquido : null,
    diferencaMeta: num(meta) && num(media) ? media - meta : null,
    mesAtual: atual ? { mes: atual.mes, valor: valorDoMes(atual, { base, descontarProventos }) } : null,
  };
}

/**
 * Meses até o patrimônio chegar no alvo, com aporte mensal fixo. null quando
 * nunca chega (sem aporte e sem rendimento) ou passa de 100 anos.
 */
export function mesesAteAlvo({ atual, alvo, rendimentoAnual, aporte }) {
  if (!num(atual) || !num(alvo)) return null;
  if (atual >= alvo) return 0;
  const i = num(rendimentoAnual) ? (1 + rendimentoAnual) ** (1 / 12) - 1 : 0;
  const ap = num(aporte) ? aporte : 0;
  if (ap <= 0 && i <= 0) return null;
  let v = atual;
  for (let m = 1; m <= 1200; m += 1) {
    v = v * (1 + i) + ap;
    if (v >= alvo) return m;
  }
  return null;
}

/** Trajetória anual (pro gráfico): [{ ano: 0..N, valor }] até passar do alvo ou `maxAnos`. */
export function trajetoria({ atual, alvo, rendimentoAnual, aporte }, maxAnos = 40) {
  const i = num(rendimentoAnual) ? (1 + rendimentoAnual) ** (1 / 12) - 1 : 0;
  const ap = num(aporte) ? aporte : 0;
  const pts = [{ ano: 0, valor: atual }];
  let v = atual;
  for (let a = 1; a <= maxAnos; a += 1) {
    for (let m = 0; m < 12; m += 1) v = v * (1 + i) + ap;
    pts.push({ ano: a, valor: v });
    if (num(alvo) && v >= alvo) break;
  }
  return pts;
}

/** Último holerite mensal recebido (o que a tela mostra como "salário de hoje"). */
export function ultimoHolerite(pagamentos) {
  return (pagamentos || []).filter((p) => p.status !== 'Previsto' && p.tipo === 'Mensal')
    .sort((a, b) => (a.mes < b.mes ? 1 : -1))[0] || null;
}

/** Do bruto ao líquido (holerite) e do líquido pra onde vai (base das contas). */
export function orcamentoSalario({ holerite, base, despesasReal }) {
  const h = holerite;
  let bruto = null;
  if (h) {
    const venc = num(h.totalVencimentos) ? h.totalVencimentos : (h.salarioBase || 0) + (h.outrosVencimentos || 0);
    bruto = {
      vencimentos: venc,
      inss: h.inss || 0,
      irrf: h.irrf || 0,
      outrosDescontos: h.outrosDescontos || 0,
      liquido: h.liquido,
      fgts: h.fgts || 0,
      aliquotaIR: venc > 0 ? (h.irrf || 0) / venc : null,
      aliquotaINSS: venc > 0 ? (h.inss || 0) / venc : null,
      aliquotaImpostos: venc > 0 ? ((h.irrf || 0) + (h.inss || 0)) / venc : null,
      // custo total pro empregador que vira seu: bruto + FGTS
      pacote: venc + (h.fgts || 0),
    };
  }
  let liquido = null;
  if (base && num(base.liquido) && base.liquido > 0) {
    const aporte = metaMensal(base) || 0;
    const ess = num(despesasReal) ? despesasReal : 0;
    liquido = {
      total: base.liquido,
      essenciais: ess,
      aporte,
      livre: base.liquido - ess - aporte,
      pctEssenciais: ess / base.liquido,
      pctAporte: aporte / base.liquido,
      pctLivre: (base.liquido - ess - aporte) / base.liquido,
    };
  }
  return { bruto, liquido };
}

export const TIPOS_EXTRAS = ['13º (1ª parcela)', '13º (2ª parcela)', 'Férias', 'PLR', 'Bônus'];
const MES_PADRAO = { '13º (1ª parcela)': '11', '13º (2ª parcela)': '12' };

/**
 * Extras do ano: o que já entrou (Recebido) ou foi planejado (Previsto) de
 * 13º, férias, PLR e bônus, com uma estimativa pro 13º quando ainda não há nada.
 */
export function extrasDoAno(pagamentos, ano, { holerite = null, percentualPadrao = null } = {}) {
  const doAno = (pagamentos || []).filter((p) => p.tipo !== 'Mensal' && String(p.mes).slice(0, 4) === String(ano));
  const linhas = TIPOS_EXTRAS.map((tipo) => {
    const p = doAno.find((x) => x.tipo === tipo);
    const pct = p && num(p.percentualInvestir) ? p.percentualInvestir : percentualPadrao;
    let estimativa = null;
    if (!p && holerite && num(holerite.salarioBase)) {
      if (tipo === '13º (1ª parcela)') estimativa = holerite.salarioBase / 2; // adiantamento, sem descontos
      if (tipo === '13º (2ª parcela)') estimativa = Math.max(0, holerite.salarioBase / 2 - (holerite.inss || 0) - (holerite.irrf || 0));
      if (tipo === 'Férias') estimativa = (holerite.salarioBase / 3) * (num(holerite.liquido) && holerite.totalVencimentos ? holerite.liquido / holerite.totalVencimentos : 1);
    }
    const valor = p ? p.liquido : null;
    return {
      tipo,
      mes: p ? p.mes : (MES_PADRAO[tipo] ? `${ano}-${MES_PADRAO[tipo]}` : ''),
      status: p ? p.status : null,
      valor,
      estimativa,
      percentualInvestir: pct,
      investir: num(valor) && num(pct) ? valor * pct : null,
    };
  });
  const comValor = linhas.filter((l) => num(l.valor));
  return {
    ano,
    linhas,
    total: comValor.reduce((s, l) => s + l.valor, 0),
    totalInvestir: comValor.reduce((s, l) => s + (l.investir || 0), 0),
    recebido: comValor.filter((l) => l.status === 'Recebido').reduce((s, l) => s + l.valor, 0),
  };
}

/** Histórico do líquido mensal (holerites recebidos), do mais antigo pro mais novo. */
export function historicoSalario(pagamentos) {
  return (pagamentos || []).filter((p) => p.tipo === 'Mensal' && p.status !== 'Previsto' && num(p.liquido))
    .sort((a, b) => (a.mes < b.mes ? -1 : 1))
    .map((p) => ({ mes: p.mes, liquido: p.liquido, bruto: p.totalVencimentos, base: p.salarioBase }));
}

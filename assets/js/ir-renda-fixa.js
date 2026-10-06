/**
 * ir-renda-fixa.js - 06/10/2026 (A-82): módulo ÚNICO de IR e IOF da renda fixa no front, espelho de
 * apps-script/RendaFixaIR.gs (aliquotaIRRendaFixa_, aliquotaIofRendaFixa_). A tabela regressiva estava copiada em
 * analise-grafico.js e em simulador-dividas-calc.js; se a alíquota mudar, muda aqui e lá (o teste
 * tests/o4-ir-renda-fixa.test.js compara as duas pontas dia a dia).
 *
 * - IR regressivo (Lei 11.033/2004, art. 1º), sobre o RENDIMENTO: até 180 dias 22,5%; 181-360 20%; 361-720 17,5%;
 *   acima de 720 15%. Prazo em dias corridos desde a aplicação.
 * - IOF regressivo (Decreto 6.306/2007, anexo), % do RENDIMENTO nos primeiros 29 dias (96% no dia 1 ... 3% no dia 29,
 *   0 a partir do dia 30). Incide ANTES do IR: o IR é sobre (rendimento - IOF).
 */

/** Faixas do IR regressivo: [limite superior em dias corridos (inclusive), alíquota]. */
export const FAIXAS_IR_RENDA_FIXA = [[180, 0.225], [360, 0.2], [720, 0.175], [Infinity, 0.15]];

/** % do rendimento cobrado de IOF no dia 1..29 (o dia 30 em diante é 0). */
export const TABELA_IOF_RENDA_FIXA = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0];

/** Alíquota de IR (fração) pelo prazo da aplicação em dias corridos. */
export function aliquotaIrPorDias(dias) {
  for (const [ate, aliquota] of FAIXAS_IR_RENDA_FIXA) if (dias <= ate) return aliquota;
  return 0.15;
}

/** Alíquota de IR pela idade da aplicação em MESES (mês médio de 30,4375 dias; simulações). */
export function aliquotaIrPorMeses(meses) {
  return aliquotaIrPorDias(meses * 30.4375);
}

/** IOF (fração do rendimento) pelo prazo em dias corridos: 0 -> 96%, 1 -> 96%... 29 -> 0%, 30+ -> 0 (igual ao GS). */
export function aliquotaIofPorDias(dias) {
  if (!(dias >= 1)) return dias === 0 ? 0.96 : 0;
  if (dias >= 30) return 0;
  return TABELA_IOF_RENDA_FIXA[dias - 1] / 100;
}

/**
 * Imposto de um lote: { iof, ir, total, liquido } sobre `rendimento` (>= 0) com `dias` de aplicação. `isento`
 * (LCI/LCA) não paga nada. Ordem do GS: IOF primeiro, IR sobre o que sobra.
 */
export function impostoDoLote({ rendimento, dias, isento = false }) {
  const r = Math.max(0, Number(rendimento) || 0);
  if (isento || !r) return { iof: 0, ir: 0, total: 0, liquido: r };
  const iof = r * aliquotaIofPorDias(dias);
  const ir = Math.max(0, r - iof) * aliquotaIrPorDias(dias);
  return { iof, ir, total: iof + ir, liquido: r - iof - ir };
}

/**
 * metas-calc-fora.js - 07/10/2026 (Tiago: "o dinheiro está num fundo da XP que NÃO está na planilha"): "Saldo ou investimento FORA
 * DA CARTEIRA" (o vínculo `tipo: 'saldo'` das metas, antes "Saldo em conta") com rendimento estimado em % do CDI.
 *
 * Regra (honesta, sem inventar aporte): valor de HOJE estimado = o último saldo informado (`saldo`, no dia `atualizadoEm`)
 * corrigido pelo CDI acumulado desde esse dia, vezes o % do CDI do investimento. NÃO soma aportes feitos depois do último extrato
 * (ninguém confirmou que aconteceram): a tela mostra "estimado: R$ X (último extrato R$ Y em dd/mm, +CDI)" e convida a atualizar.
 * Sem série de CDI (ou sem % do CDI, ou saldo em outra moeda) vale o último valor informado.
 *
 * A série do CDI vem do GET metas (`cdi: { ate, pontos: [['aaaa-mm-dd', índice], ...] }`, índice base 1 acumulado dia a dia de
 * aux_historico-indices - Metas.gs!serieCdiMetas_). O servidor tem a MESMA conta (Metas.gs!estimarSaldoCdiMetas_) pra Patrimônio.
 */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null)));

/** Fator do CDI de `desde` (fim do dia, 'aaaa-mm-dd') até o último ponto da série; null se a série não cobre a data. */
export function fatorCdi(cdi, desde) {
  const pontos = cdi && Array.isArray(cdi.pontos) ? cdi.pontos : [];
  const d = String(desde || '').slice(0, 10);
  if (!pontos.length || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  let base = null;
  for (let i = 0; i < pontos.length; i += 1) {
    if (String(pontos[i][0]) <= d) base = pontos[i][1]; else break;
  }
  const fim = pontos[pontos.length - 1];
  if (!(base > 0) || !(fim[1] > 0)) return null;
  return fim[1] / base;
}

/**
 * Estimativa de um saldo fora da carteira: { valor (na moeda do saldo), informado, estimado, ate, pct, desde }.
 * `v`: { saldo, moeda, atualizadoEm, cdiPct }; `cdi`: a série acima (ou null).
 */
export function estimarSaldoCdi(v, cdi) {
  const saldo = num(v && v.saldo) || 0;
  const pct = num(v && v.cdiPct);
  const base = { valor: saldo, informado: saldo, estimado: false, ate: null, pct: pct > 0 ? pct : null, desde: (v && v.atualizadoEm) || null };
  if (!(pct > 0) || !cdi || (v.moeda && v.moeda !== 'BRL') || !(saldo > 0)) return base;
  const fator = fatorCdi(cdi, v.atualizadoEm);
  const ate = cdi.ate || (cdi.pontos && cdi.pontos.length ? cdi.pontos[cdi.pontos.length - 1][0] : null);
  if (fator == null || !ate || String(ate) <= String(v.atualizadoEm || '').slice(0, 10)) return base;
  // (1 + p x r) diário composto ~ fator^p (erro desprezível nas taxas diárias do CDI)
  const valor = Math.round(saldo * Math.pow(fator, pct / 100) * 100) / 100;
  return { ...base, valor, estimado: true, ate: String(ate).slice(0, 10) };
}

/** "dd/mm" de 'aaaa-mm-dd'. */
export const diaMes = (iso) => { const m = String(iso || '').match(/^\d{4}-(\d{2})-(\d{2})/); return m ? `${m[2]}/${m[1]}` : ''; };

/** Texto curto da estimativa: "estimado: R$ X (último extrato R$ Y em dd/mm, + CDI)" - `fmt` formata dinheiro. */
export function textoEstimativa(est, fmt) {
  if (!est || !est.estimado) return '';
  return `estimado: ${fmt(est.valor)} (último extrato ${fmt(est.informado)} em ${diaMes(est.desde)}, + ${est.pct}% do CDI até ${diaMes(est.ate)})`;
}

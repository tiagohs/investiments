/**
 * inicio-comparativo.js — 02/10/2026: "Ontem era" + os 3 meses anteriores
 * (pedido do Tiago: "sob o valor total, em fonte menor e criativa: 'Ontem
 * era: VALOR ▼/▲ %'; à direita, em paralelo: 'Setembro era: VALOR ▼ %',
 * 'Agosto era: ...', 'Julho era: ...' - os últimos 3 meses relativos ao
 * dia/período selecionado (valor de fechamento do mês). Não se aplica pra
 * 6M/3A/personalizado de vários meses (mostrar só '—')").
 *
 * Por que tinha sumido: o "ontem era: R$ X - Y%" morava em
 * inicio.js!renderResumoPatrimonio (17/09/2026, depois lido do snapshot
 * diário Auxiliar_app!E:J - SnapshotResumoDiario.gs - e, desde 23/09, da
 * própria série do gráfico: Home.gs!montarOntemDaSerie_). Na reorganização
 * da Início de 26/09 (inicio-painel.js!renderResumoCompacto) o resumo virou
 * abas-número com "▲ +R$ · % desde dd/mm" e a linha "ontem era" saiu junto
 * com o resumo antigo. Volta agora no bloco de valor de cada gráfico de
 * patrimônio (Início e Carteiras), amarrada ao período do filtro.
 *
 * Regras:
 *  - referência = o último ponto da janela do gráfico (o fim do período).
 *    Quando é o dia de hoje (último ponto do histórico), o valor é o mesmo
 *    que o bloco mostra (ao vivo) e o "ontem" pode vir pronto do back-end
 *    (`ontemValor`, resposta.ontem da Início - já com o ajuste de marcação
 *    da Renda Fixa);
 *  - "ontem" = o último ponto ANTES da referência com pregão (fim de semana
 *    e feriado voltam pro último dia útil). Se esse dia não é o dia útil
 *    anterior de verdade (série com buraco), o rótulo vira "Em 25/09 era";
 *  - meses = fechamento (último ponto) de cada um dos 3 meses anteriores ao
 *    mês da referência;
 *  - quando a referência é hoje, os valores passados levam o mesmo ajuste
 *    de marcação da Renda Fixa que Home.gs!montarOntemDaSerie_ soma (a série
 *    mede a RF pela projeção do índice; o valor de hoje, pela planilha) -
 *    senão a diferença entre as duas réguas apareceria como variação;
 *  - só vale pra períodos curtos ('mes', '30d', personalizado de até 31
 *    dias); nos outros a faixa mostra só "—".
 */
import { formatBRL, formatPercentFromFraction, MESES_LONGOS_CAPITAL } from '../format.js';
import { ehPeriodoPersonalizado, diasNoIntervalo } from '../periodo-personalizado.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único


const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Ajuste de marcação (R$) da Renda Fixa embutido no ponto de hoje, por campo. */
const AJUSTE_POR_CAMPO = {
  patrimonio: (p) => p.ajusteMarcacaoRendaFixa,
  longoPrazo: (p) => p.ajusteMarcacaoRendaFixa - p.ajusteMarcacaoRendaEmergencial,
  nacional: (p) => p.ajusteMarcacaoRendaFixa - p.ajusteMarcacaoRendaEmergencial,
  rendaEmergencial: (p) => p.ajusteMarcacaoRendaEmergencial,
  rendaFixaTotal: (p) => p.ajusteMarcacaoRendaFixa,
  rendaFixaLongoPrazo: (p) => p.ajusteMarcacaoRendaFixa - p.ajusteMarcacaoRendaEmergencial,
};
export function ajusteMarcacaoDoCampo(ponto, campo) {
  const f = AJUSTE_POR_CAMPO[campo];
  if (!f || !ponto) return 0;
  const p = { ajusteMarcacaoRendaFixa: num(ponto.ajusteMarcacaoRendaFixa) ? ponto.ajusteMarcacaoRendaFixa : 0, ajusteMarcacaoRendaEmergencial: num(ponto.ajusteMarcacaoRendaEmergencial) ? ponto.ajusteMarcacaoRendaEmergencial : 0 };
  const v = f(p);
  return num(v) ? v : 0;
}

export function periodoAplicaComparativo(periodo) {
  if (periodo === 'mes' || periodo === '30d') return true;
  if (ehPeriodoPersonalizado(periodo)) return diasNoIntervalo(periodo) <= 31;
  return false;
}

function anoMesMenos(anoMes, n) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** O dia útil (seg-sex) imediatamente anterior a `iso`. */
function diaUtilAnterior(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  do { dt.setUTCDate(dt.getUTCDate() - 1); } while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * { aplica, referencia:{data,valor}, ontem:{data,valor,variacao,ehOntem}|null,
 *   meses:[{anoMes,nome,data,valor,variacao}] }
 * `janela` = o recorte do gráfico (o fim dela é a referência);
 * `historico` = a série inteira (pra achar ontem/meses antes da janela).
 */
export function calcularComparativo(historico, campo, periodo, { janela = null, valorReferencia = null, ontemValor = null } = {}) {
  const vazio = { aplica: false, referencia: null, ontem: null, meses: [] };
  if (!Array.isArray(historico) || !historico.length || !campo) return vazio;
  const aplica = periodoAplicaComparativo(periodo);
  const recorte = Array.isArray(janela) && janela.length ? janela : historico;
  let ref = null;
  for (let i = recorte.length - 1; i >= 0; i -= 1) if (num(recorte[i][campo])) { ref = recorte[i]; break; }
  if (!ref) return vazio;
  const idxRef = historico.indexOf(ref) !== -1 ? historico.indexOf(ref) : historico.findIndex((p) => p.data === ref.data);
  const ehHoje = idxRef === historico.length - 1;
  const valorRef = ehHoje && num(valorReferencia) ? valorReferencia : ref[campo];
  const ajuste = ehHoje ? ajusteMarcacaoDoCampo(ref, campo) : 0;
  const resultado = { aplica, referencia: { data: ref.data, valor: valorRef }, ontem: null, meses: [] };
  if (!aplica) return resultado;
  const variacao = (antes) => (num(antes) && antes !== 0 ? (valorRef - antes) / Math.abs(antes) : null);

  // ontem
  let pOntem = null;
  for (let i = idxRef - 1; i >= 0; i -= 1) {
    const p = historico[i];
    if (num(p[campo]) && p.pregao !== false && p[campo] !== 0) { pOntem = p; break; }
  }
  if (ehHoje && num(ontemValor) && ontemValor !== 0) {
    const data = pOntem ? pOntem.data : null;
    resultado.ontem = { data, valor: ontemValor, variacao: variacao(ontemValor), ehOntem: !data || data === diaUtilAnterior(ref.data) };
  } else if (pOntem) {
    const v = pOntem[campo] + ajuste;
    resultado.ontem = { data: pOntem.data, valor: v, variacao: variacao(v), ehOntem: pOntem.data === diaUtilAnterior(ref.data) };
  }

  // fechamento dos 3 meses anteriores ao mês da referência
  const mesRef = ref.data.slice(0, 7);
  for (let k = 1; k <= 3; k += 1) {
    const am = anoMesMenos(mesRef, k);
    let fech = null;
    for (let i = idxRef; i >= 0; i -= 1) {
      const d = historico[i].data;
      if (typeof d !== 'string') continue;
      if (d.slice(0, 7) < am) break;
      if (d.slice(0, 7) === am && num(historico[i][campo]) && historico[i][campo] !== 0) { fech = historico[i]; break; }
    }
    if (!fech) continue;
    const v = fech[campo] + ajuste;
    resultado.meses.push({ anoMes: am, nome: MESES_LONGOS_CAPITAL[Number(am.slice(5, 7)) - 1], data: fech.data, valor: v, variacao: variacao(v) });
  }
  return resultado;
}

const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

function itemHtml(rotulo, item, fmt, titulo) {
  const v = item.variacao;
  const temVar = num(v);
  const sobe = temVar && v >= 0;
  const varHtml = temVar
    ? `<span class="cmp-var ${sobe ? 'good' : 'bad'}"><i aria-hidden="true">${sobe ? '▲' : '▼'}</i>${esc(formatPercentFromFraction(Math.abs(v)).replace(/^\+/, ''))}</span>`
    : '';
  const desc = `${titulo}: ${fmt(item.valor)}${temVar ? `; de lá pra cá ${sobe ? 'subiu' : 'caiu'} ${formatPercentFromFraction(Math.abs(v)).replace(/^\+/, '')}` : ''}`;
  return `<span class="cmp-item" title="${esc(desc)}"><span class="cmp-rot">${esc(rotulo)}</span><span class="cmp-valor">${esc(fmt(item.valor))}</span>${varHtml}</span>`;
}

/** HTML da faixa (string vazia quando não há nem referência). */
export function htmlComparativo(comp, { formatarMoeda = formatBRL } = {}) {
  if (!comp || !comp.referencia) return '';
  if (!comp.aplica) {
    return '<div class="rentab-cmp cmp-na" title="&quot;Ontem era&quot; e os meses anteriores só aparecem em períodos de até 1 mês (Mês atual, 30 dias ou um período personalizado curto)."><span class="cmp-item"><span class="cmp-rot">Ontem era</span><span class="cmp-valor">—</span></span></div>';
  }
  if (!comp.ontem && !comp.meses.length) return '';
  const fmt = formatarMoeda;
  const ontem = comp.ontem
    ? itemHtml(comp.ontem.ehOntem ? 'Ontem era' : `Em ${ddmm(comp.ontem.data)} era`, comp.ontem, fmt, comp.ontem.data ? `Fechamento de ${ddmm(comp.ontem.data)}` : 'Fechamento do último pregão')
    : '';
  const meses = comp.meses.map((m) => itemHtml(`${m.nome} era`, m, fmt, `Fechamento de ${m.nome.toLowerCase()} (${ddmm(m.data)})`)).join('');
  return `<div class="rentab-cmp" aria-label="Comparativo com dias e meses anteriores">${ontem}${meses ? `<span class="cmp-meses">${meses}</span>` : ''}</div>`;
}

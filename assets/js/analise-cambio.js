/**
 * analise-cambio.js - decompõe a variação em REAIS de ativos em DÓLAR em
 * "efeito dos preços em US$" x "efeito do câmbio" (07/10/2026, pedido do
 * Tiago: "Inclua na lista de análises essas quedas por causa de câmbio, é
 * uma boa informação" - Ações Internacionais caiu ~5% de um dia pro outro
 * quase só pelo dólar, com as ações em US$ quase estáveis).
 *
 * Tudo PURO (sem DOM, sem relógio - a data de "hoje" entra por parâmetro) e
 * em FRAÇÃO (0,05 = 5%). Usado por analise-grafico.js (regraCambioJanelas) pro
 * dia, o mês e o período selecionado - Início (Internacional), Carteiras
 * (Ações EUA) e tela do Ativo EUA.
 *
 *   R$ = US$ x câmbio  =>  (1 + retornoBrl) = (1 + retornoUsd) x (1 + variacaoCambio)
 *
 * API
 *   decomporCambio({ retornoBrl, variacaoCambio, retornoUsd? })
 *     -> { retornoBrl, retornoUsd, variacaoCambio, parteCambio, sinaisOpostos, dominante }
 *        parteCambio: quanto do movimento em R$ é do câmbio (0..1+; log-retornos, soma 1 com o efeito preço);
 *        dominante: 'cambio' (>= limiar e mesmo sinal) | 'oposto' (câmbio contra o preço) | 'preco' | null.
 *   itemCambio({ ...decomposicao, janela, nivelIni, nivelFim, sujeito, ... }) -> { tipo, tom, texto, resumo, peso, criterios } | null
 */
import { formatBRL, formatPctSinal, formatPctAbs } from './format.js';

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Limiar padrão: o câmbio "explica a maior parte" quando responde por >= 60% do movimento em R$ (pedido do Tiago). */
export const LIMIAR_CAMBIO_DOMINANTE = 0.6;
/** Variação mínima do dólar (fração) pra valer um item, por janela - abaixo disso é ruído do dia a dia. */
export const MINIMO_CAMBIO_POR_JANELA = { dia: 0.003, mes: 0.01, periodo: 0.015 };

/**
 * Decompõe uma variação em reais. Aceita `retornoUsd` (preço em dólar medido direto) ou o deduz de R$ e câmbio.
 * `minimoCambio` = variação mínima do dólar pra contar como relevante (abaixo, dominante = null).
 */
export function decomporCambio({ retornoBrl, variacaoCambio, retornoUsd = null, limiar = LIMIAR_CAMBIO_DOMINANTE, minimoCambio = 0 } = {}) {
  if (!num(variacaoCambio) || variacaoCambio <= -1) return null;
  let r = num(retornoBrl) ? retornoBrl : null;
  let u = num(retornoUsd) ? retornoUsd : null;
  if (r == null && u == null) return null;
  if (r == null) r = (1 + u) * (1 + variacaoCambio) - 1;
  if (u == null) u = (1 + r) / (1 + variacaoCambio) - 1;
  if (r <= -1 || u <= -1) return null;
  const lnR = Math.log(1 + r);
  const lnD = Math.log(1 + variacaoCambio);
  const parteCambio = Math.abs(lnR) > 1e-9 ? lnD / lnR : null; // negativa = câmbio puxou pro lado contrário
  const relevante = Math.abs(variacaoCambio) >= minimoCambio;
  const oposto = Math.sign(u) !== Math.sign(variacaoCambio) && Math.abs(u) >= minimoCambio / 2 && Math.abs(u) >= 0.0005;
  let dominante = null;
  if (relevante) {
    if (parteCambio != null && parteCambio >= limiar) dominante = 'cambio';
    else if (oposto && Math.abs(variacaoCambio) >= 0.5 * Math.abs(u)) dominante = 'oposto';
    else dominante = 'preco';
  }
  return { retornoBrl: r, retornoUsd: u, variacaoCambio, parteCambio, sinaisOpostos: oposto, dominante };
}

const ROTULO_JANELA = { dia: 'no dia', mes: 'no mês', periodo: 'no período' };
const PESO_JANELA = { dia: 88, mes: 74, periodo: 70 };

function reais(n) { return formatBRL(n); }

/**
 * Item de análise a partir de uma decomposição (`d` = resultado de decomporCambio) - null quando o dólar não é
 * a história (preço em US$ manda ou dólar parado).
 *   janela: 'dia' | 'mes' | 'periodo';  rotulo: "hoje" | "em 06/10" | "no mês" | "de 02/09 a 06/10"...
 *   nivelIni/nivelFim: USD/BRL no começo e no fim da janela (opcionais, saem no texto);
 *   sujeito: { texto: 'as ações', plural: true } (ou 'o ativo', singular) - quem variou em dólar.
 */
export function itemCambio({ d, janela = 'periodo', rotulo = null, nivelIni = null, nivelFim = null, sujeito = { texto: 'as ações', plural: true } } = {}) {
  if (!d || (d.dominante !== 'cambio' && d.dominante !== 'oposto')) return null;
  const quando = rotulo || ROTULO_JANELA[janela] || 'no período';
  const plural = sujeito.plural !== false;
  const verbo = (singular, pl) => (plural ? pl : singular);
  const R = d.retornoBrl;
  const u = d.retornoUsd;
  const dfx = d.variacaoCambio;
  const niveis = num(nivelIni) && num(nivelFim) ? `: ${reais(nivelIni)} → ${reais(nivelFim)}` : '';
  const dolar = `${formatPctSinal(dfx, 1)}${niveis}`;
  const usdTxt = Math.abs(u) < 0.0005
    ? `em dólar ${sujeito.texto} ${verbo('ficou', 'ficaram')} ${plural ? 'estáveis' : 'estável'}`
    : `em dólar ${sujeito.texto} ${u > 0 ? verbo('subiu', 'subiram') : verbo('caiu', 'caíram')} ${formatPctAbs(u, 1)}`;
  const queda = R < 0;
  let texto;
  const criterios = ['efeito_cambio'];
  if (d.dominante === 'cambio') {
    const intensidade = d.parteCambio >= 0.9 ? 'quase toda' : 'em boa parte';
    const movimento = `${queda ? 'Queda' : (R > 0 ? 'Alta' : 'Variação')} de ${formatPctAbs(R, 1)} ${quando}`;
    texto = `${movimento}, ${intensidade} pelo dólar (${dolar}); ${usdTxt}.`;
    if (Math.abs(u) < Math.abs(R) * 0.4) {
      texto += queda
        ? ' Os preços não caíram: é a conversão para reais (o real se valorizou).'
        : ' Não é valorização dos preços: é a conversão para reais (o real se desvalorizou).';
    }
    criterios.push('diag_cambio');
  } else {
    texto = `${quando.charAt(0).toUpperCase()}${quando.slice(1)}, ${usdTxt} (${formatPctSinal(u, 1)}), mas o dólar ${dfx < 0 ? 'caiu' : 'subiu'} ${formatPctAbs(dfx, 1)}${niveis ? ` (${reais(nivelIni)} → ${reais(nivelFim)})` : ''}: em reais, ${R < 0 ? 'queda' : (R > 0 ? 'alta' : 'variação')} de ${formatPctAbs(R, 1)}.`;
    criterios.push('diag_cambio');
  }
  const seta = dfx >= 0 ? '↑' : '↓';
  const resumoJanela = janela === 'dia' ? 'no dia' : (janela === 'mes' ? 'no mês' : 'no período');
  return {
    tipo: `cambio-${janela}`, tom: 'neutro', texto,
    resumo: `${queda ? 'queda' : 'alta'} ${resumoJanela} pelo dólar ${seta} ${formatPctAbs(dfx, 1)}`,
    peso: PESO_JANELA[janela] || 70, criterios,
  };
}

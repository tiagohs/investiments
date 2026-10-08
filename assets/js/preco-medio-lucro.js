/**
 * preco-medio-lucro.js - 08/10/2026 (Tiago: "quantas cotas eu preciso comprar para que o meu preço médio fique abaixo do
 * valor atual da cota, indicando que estou no lucro? Considere o valor atual e uma projeção com a cota 10 ou 20% mais
 * barata e mais cara").
 *
 * Conta PURA (sem DOM): a mesma nas 4 telas - Detalhe do ativo (card "Cotação × preço-teto" + seção "Para ficar no
 * lucro"), Acompanhamento de Ativos (Radar), Transações › Aportes e as análises (criterios/motor.js!sinalPrecoMedio).
 *
 *   comprar q cotas a c:   novo PM = (Q·PM + q·c) / (Q + q)
 *   pra chegar ao PM T:    q = Q·(PM − T) / (T − c)        (só existe se c < T < PM)
 *
 * O ponto que muda a leitura: comprando AO PREÇO DE HOJE o preço médio se aproxima da cotação mas nunca fica abaixo
 * dela - "ficar no lucro com a cota parada" é impossível. Por isso a simulação cruza dois eixos:
 *   - o preço da COMPRA (a cota 20% / 10% mais barata, ou a de hoje) e
 *   - a cotação em que você quer estar no LUCRO (a de hoje, 10% ou 20% mais cara).
 * Cotas sempre inteiras e arredondadas pra cima; sem corretagem nem impostos. Testes: tests/preco-medio-lucro.test.js.
 */
import { formatMoeda, formatNumeroPt } from './format.js';

/** Preço da compra: a cota 20% mais barata, 10% mais barata e a de hoje. */
export const VARIACOES_COMPRA = [-0.2, -0.1, 0];
/** Cotação em que você quer estar no lucro: a de hoje, 10% e 20% mais cara. */
export const VARIACOES_ALVO = [0, 0.1, 0.2];
/** Acima disto (vezes a sua posição) a compra é "fora da realidade" - a tela mostra o número, mas apagado e com o aviso. */
export const LIMITE_VEZES_POSICAO = 10;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r2 = (v) => Math.round(v * 100 + 1e-7) / 100; // 71,85 × 0,9 = 64,66499… -> 64,67
const EPS = 1e-9;

/** Preço médio depois de comprar `cotas` a `preco` (null se a entrada não faz sentido). */
export function pmAposCompra({ quantidade, precoMedio }, cotas, preco) {
  const Q = num(quantidade); const pm = num(precoMedio); const q = num(cotas); const c = num(preco);
  if (!(Q > 0) || !(pm > 0) || q == null || q < 0 || !(c > 0)) return null;
  return (Q * pm + q * c) / (Q + q);
}

/**
 * Quantas cotas comprar a `precoCompra` pra o preço médio chegar a `pmAlvo`.
 * { situacao: 'ok' | 'semCompra' (o PM já está no alvo) | 'impossivel' (compra >= alvo), cotas, aporte, novoPm,
 *   vezesPosicao, inviavel } ou null (dado faltando).
 */
export function cotasParaPm({ quantidade, precoMedio, precoCompra, pmAlvo }) {
  const Q = num(quantidade); const pm = num(precoMedio); const c = num(precoCompra); const T = num(pmAlvo);
  if (!(Q > 0) || !(pm > 0) || !(c > 0) || !(T > 0)) return null;
  if (T >= pm - EPS) return { situacao: 'semCompra', cotas: 0, aporte: 0, novoPm: pm, vezesPosicao: 0, inviavel: false };
  if (c >= T - EPS) return { situacao: 'impossivel', cotas: null, aporte: null, novoPm: null, vezesPosicao: null, inviavel: false };
  const bruto = (Q * (pm - T)) / (T - c);
  const cotas = Math.max(1, Math.ceil(bruto - 1e-6));
  const vezesPosicao = cotas / Q;
  return { situacao: 'ok', cotas, aporte: cotas * c, novoPm: (Q * pm + cotas * c) / (Q + cotas), vezesPosicao, inviavel: vezesPosicao > LIMITE_VEZES_POSICAO };
}

/**
 * A simulação completa. null sem posição/preço. Com a cotação no PM ou acima: { situacao: 'lucro', folga } (quanto a cota
 * pode cair antes de empatar). Abaixo do PM: { situacao: 'prejuizo', subida (quanto a cota precisa subir pra empatar sem
 * comprar), compras[], alvos[], matriz[compra][alvo], destaque (compra hoje -> lucro com +10%), alternativa (compra 10% mais
 * barata -> lucro na cotação de hoje) }.
 */
export function simularSaidaPrejuizo({ quantidade, precoMedio, precoAtual } = {}) {
  const Q = num(quantidade); const pm = num(precoMedio); const P = num(precoAtual);
  if (!(Q > 0) || !(pm > 0) || !(P > 0)) return null;
  const base = { quantidade: Q, precoMedio: pm, precoAtual: P };
  if (P >= pm - EPS) return { ...base, situacao: 'lucro', folga: 1 - pm / P };
  const compras = VARIACOES_COMPRA.map((variacao) => ({ variacao, preco: variacao === 0 ? P : r2(P * (1 + variacao)) }));
  const alvos = VARIACOES_ALVO.map((variacao) => ({ variacao, preco: variacao === 0 ? P : r2(P * (1 + variacao)) }));
  const matriz = compras.map((c) => alvos.map((a) => ({
    compra: c, alvo: a, ...cotasParaPm({ quantidade: Q, precoMedio: pm, precoCompra: c.preco, pmAlvo: a.preco }),
  })));
  const iHoje = VARIACOES_COMPRA.indexOf(0);
  return {
    ...base,
    situacao: 'prejuizo',
    subida: pm / P - 1,
    perda: P / pm - 1,
    compras, alvos, matriz,
    destaque: matriz[iHoje][VARIACOES_ALVO.indexOf(0.1)],
    alternativa: matriz[VARIACOES_COMPRA.indexOf(-0.1)][VARIACOES_ALVO.indexOf(0)],
  };
}

const pct = (f, casas = 1) => `${formatNumeroPt(Math.abs(f) * 100, { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const qtdTxt = (n) => `${formatNumeroPt(n, { maximumFractionDigits: 0 })} cota${n === 1 ? '' : 's'}`;
/** "R$ 6.610" / "US$ 239" (sem centavos: é uma estimativa). */
export const aporteTxt = (v, moeda = 'BRL') => formatMoeda(v, moeda === 'USD' ? 'USD' : 'BRL', { casas: 0 });
/** "R$ 79,04" / "US$ 7,90". */
export const precoTxt = (v, moeda = 'BRL') => formatMoeda(v, moeda === 'USD' ? 'USD' : 'BRL', { casas: 2 });

/** Texto da variação de um cenário: "hoje", "10% mais barata", "20% mais cara". */
export function rotuloVariacao(v, { genero = 'a' } = {}) {
  if (Math.abs(v) < EPS) return 'hoje';
  return `${pct(v, 0)} mais ${v < 0 ? 'barat' : 'car'}${genero}`;
}

/**
 * Resumo em texto (tabelas e análises): { curto: linhas pequenas pra célula de tabela, frase: 1 frase pras análises,
 * dica: o detalhe (title/tooltip) }. null se não está no prejuízo.
 */
export function resumoSaidaPrejuizo(sim, { moeda = 'BRL' } = {}) {
  if (!sim || sim.situacao !== 'prejuizo') return null;
  const d = sim.destaque; const alt = sim.alternativa;
  const empata = `Empata com +${pct(sim.subida)}`;
  const linhaAlt = alt && alt.situacao === 'ok'
    ? `Se cair 10% (${precoTxt(alt.compra.preco, moeda)}), ${qtdTxt(alt.cotas)} (${aporteTxt(alt.aporte, moeda)}) deixam você no lucro quando ela voltar a ${precoTxt(sim.precoAtual, moeda)}.`
    : '';
  if (d.situacao === 'semCompra') {
    return {
      curto: [empata],
      frase: `a cota precisa subir ${pct(sim.subida)} para você empatar`,
      dica: `Sem comprar mais, a cota precisa subir ${pct(sim.subida)} (até ${precoTxt(sim.precoMedio, moeda)}) para você empatar. ${linhaAlt}`.trim(),
    };
  }
  return {
    curto: [empata, `Lucro em +10%: ${qtdTxt(d.cotas)}`],
    frase: `lucro se a cota subir 10%: compre cerca de ${qtdTxt(d.cotas)} (${aporteTxt(d.aporte, moeda)})`,
    dica: `Sem comprar mais, a cota precisa subir ${pct(sim.subida)} para você empatar. Comprando ${qtdTxt(d.cotas)} hoje (${aporteTxt(d.aporte, moeda)}), o preço médio cai para ${precoTxt(d.novoPm, moeda)} e você fica no lucro com a cota a ${precoTxt(d.alvo.preco, moeda)} (+10%). ${linhaAlt}`.trim(),
  };
}

/** Quantas cotas comprar no gráfico (eixo X): até onde as linhas cruzam a cotação de hoje / +10%, sem passar de 10x a posição. */
function limiteEixo(sim) {
  const Q = sim.quantidade;
  const candidatos = [];
  sim.matriz.forEach((linha) => linha.forEach((c) => { if (c.situacao === 'ok' && c.alvo.variacao <= 0.1 + EPS) candidatos.push(c.cotas); }));
  const alvo = candidatos.length ? Math.min(Math.max(...candidatos) * 1.15, Q * LIMITE_VEZES_POSICAO) : Q * 3;
  return Math.max(alvo, Q * 0.5, 4);
}

/**
 * Pontos do gráfico "preço médio x cotas compradas": eixoX (cotas, inteiros crescentes a partir de 0) e uma série por preço
 * de compra (o PM resultante). { eixo: [n...], series: [{ variacao, preco, valores }] } ou null.
 */
export function pontosGraficoPm(sim, { pontos = 41 } = {}) {
  if (!sim || sim.situacao !== 'prejuizo') return null;
  const max = limiteEixo(sim);
  const passo = Math.max(1, Math.ceil(max / (pontos - 1)));
  const eixo = [];
  for (let q = 0; eixo.length < pontos; q += passo) eixo.push(q);
  return {
    eixo,
    series: sim.compras.map((c) => ({ variacao: c.variacao, preco: c.preco, valores: eixo.map((q) => pmAposCompra(sim, q, c.preco)) })),
  };
}

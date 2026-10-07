/**
 * metas-calc-grupo.js - 07/10/2026 (Tiago, chácara com amigos): as ESTIMATIVAS da seção recolhível "Estimativas" do detalhe da meta -
 * compra em grupo, simulador "e se custar R$ X", projeção sem alvo (1, 3, 5 e 10 anos) e quanto do que ele tem é aporte e quanto é
 * rendimento. Funções puras (a tela é metas-estimativas.js); texto simples, sem jargão, tudo "só a SUA parte".
 *
 * O que a meta guarda (Metas.gs conserva): especificos.grupoPessoas (quantas pessoas, contando você), especificos.custosPct (ITBI,
 * escritura e registro - padrão 5% em imóvel) e especificos.precoReferencia (o preço digitado no simulador, NÃO vira alvo sozinho).
 */
import { aporteNecessario, prazoParaAlvo, trajetoriaMensal } from './metas-calc-plano.js';
import { aporteDeCalc } from './metas-calc-aporte.js';
import { mesDe, mesesEntre, num, r2, somarMeses } from './metas-calc-nucleo.js';

/** Custos de compra (ITBI, escritura, registro) como fração do preço. Imóvel/chácara/casa: 5% se a pessoa não mudou. */
export const CUSTOS_PADRAO_IMOVEL = 0.05;
export const ANOS_PROJECAO = [1, 3, 5, 10];

/** Metas em que a seção "Estimativas" faz sentido: juntar dinheiro pra um objetivo (nada de reserva, renda, aposentadoria, viagem). */
export function temEstimativas(meta) {
  if (!meta || meta.status === 'arquivada') return false;
  return ['acumulo', 'casa', 'carro'].includes(meta.tipo) && meta.contribuicao !== 'recorrente';
}

/** É compra de imóvel (custos padrão de 5%, exemplos de preço)? */
export const ehImovel = (meta) => !!meta && (meta.tipo === 'casa' || (meta.tipo === 'acumulo' && meta.categoria === 'imoveis'));

/** Quantas pessoas dividem a compra (1 = só você). */
export function pessoasDoGrupo(meta) {
  const n = num(meta && meta.especificos && meta.especificos.grupoPessoas);
  return n >= 2 ? Math.min(50, Math.round(n)) : 1;
}

/** Fração de custos usada no simulador (o que a pessoa informou, senão 5% pra imóvel, senão 0). */
export function custosDaMeta(meta) {
  const c = num(meta && meta.especificos && meta.especificos.custosPct);
  if (c != null && c >= 0) return c;
  return ehImovel(meta) ? CUSTOS_PADRAO_IMOVEL : 0;
}

/** O que já foi juntado, no critério da meta (reserva usa o líquido). */
const jaTem = (c) => (c.atualRitmo != null ? c.atualRitmo : c.atualBRL) || 0;

/**
 * "Em 1, 3, 5 e 10 anos você terá ~R$ ..." no ritmo da meta (aporte crescente e rendimento estimado incluídos).
 * [{ anos, valor, aportado, rendimento }] - `aportado` = só o que sairia do seu bolso nesses anos; `rendimento` = o resto.
 */
export function projecaoPorAnos(c, anos = ANOS_PROJECAO) {
  if (!c) return [];
  const atual = jaTem(c);
  const maxMeses = Math.max(...anos) * 12;
  const traj = trajetoriaMensal({ atual, aporte: aporteDeCalc(c), taxa: c.taxa || 0, entradas: c.entradasFluxo || null, meses: maxMeses });
  const ap = aporteDeCalc(c);
  return anos.map((a) => {
    const n = a * 12;
    let aportado = 0;
    for (let k = 1; k <= n; k += 1) aportado += typeof ap === 'function' ? ap(k) : ap;
    const valor = r2(traj[n]);
    return { anos: a, valor, aportado: r2(aportado), rendimento: r2(Math.max(0, valor - atual - aportado)) };
  });
}

/**
 * Compra em grupo: se os amigos aportarem a mesma média, o grupo tem ~X hoje e ~Y em `anos`. null sem grupo.
 * { pessoas, hoje, em: { anos, valor }, suaParte: { hoje, em } }
 */
export function estimativaGrupo(meta, c, { anos = 5 } = {}) {
  const n = pessoasDoGrupo(meta);
  if (n < 2 || !c) return null;
  const proj = projecaoPorAnos(c, [anos])[0];
  return { pessoas: n, anos, hoje: r2(jaTem(c) * n), em: r2(proj.valor * n), suaParte: { hoje: r2(jaTem(c)), em: proj.valor } };
}

/**
 * Simulador "E se custar R$ X": a SUA parte = preço x (1 + custos) / pessoas. Devolve
 * { preco, custosPct, pessoas, parte, chegaEm: { mes, meses }|null, noPrazo: { mes, aporte }|null, jaChegou }
 *   - chegaEm: quando você chega nessa parte no seu ritmo (com o aumento anual do aporte e o rendimento da meta);
 *   - noPrazo: pra chegar em `mesPrazo` ('aaaa-mm'), o aporte por mês (fixo) que fecha.
 */
export function simularPreco(meta, c, preco, { hoje, mesPrazo = null, custosPct = null, pessoas = null } = {}) {
  const p = num(preco);
  if (!(p > 0) || !c) return null;
  const cust = custosPct != null ? custosPct : custosDaMeta(meta);
  const n = pessoas != null ? Math.max(1, pessoas) : pessoasDoGrupo(meta);
  const parte = r2((p * (1 + cust)) / n);
  const atual = jaTem(c);
  const mes0 = mesDe(hoje) || c.hoje;
  const jaChegou = atual >= parte - 0.5;
  let chegaEm = null;
  if (!jaChegou) {
    const m = prazoParaAlvo({ alvo: parte, atual, aporte: aporteDeCalc(c), taxa: c.taxa || 0, entradas: c.entradasFluxo || null });
    if (Number.isFinite(m)) chegaEm = { meses: Math.ceil(m), mes: somarMeses(mes0, Math.ceil(m)) };
  }
  let noPrazo = null;
  if (mesPrazo && mesesEntre(mes0, mesPrazo) > 0) {
    const meses = mesesEntre(mes0, mesPrazo);
    noPrazo = { mes: mesPrazo, meses, aporte: r2(aporteNecessario({ alvo: parte, atual, meses, taxa: c.taxa || 0, entradas: c.entradasFluxo || null }) || 0) };
  }
  return { preco: p, custosPct: cust, pessoas: n, parte, jaChegou, chegaEm, noPrazo };
}

/** Preços de exemplo do simulador (valores redondos) - o que a pessoa digitou antes vira o do meio. */
export function precosDeExemplo(meta) {
  const ref = num(meta && meta.especificos && meta.especificos.precoReferencia);
  if (ref > 0) return [r2(ref * 0.8), ref, r2(ref * 1.25)];
  if (ehImovel(meta)) return [150000, 300000, 600000];
  return [];
}

/**
 * Quanto do que você tem é aporte e quanto é rendimento - só quando a meta diz desde quando você aporta
 * (aporte crescente com "começou em"). { aportado, rendimento, valorInicial, total } ou null.
 */
export function composicaoAtual(c) {
  const ac = c && c.aporteCrescente;
  if (!ac || ac.totalAportado == null) return null;
  const total = c.atualBRL;
  const inicial = c.valorInicial || 0;
  const aportado = ac.totalAportado;
  return { aportado, valorInicial: inicial, rendimento: r2(total - aportado - inicial), total, desde: ac.inicio };
}

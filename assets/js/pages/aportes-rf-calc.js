// assets/js/pages/aportes-rf-calc.js
//
// 05/10/2026: renda fixa por VALOR ou por QUANTIDADE no Tesouro Direto
// (Tiago: "no Tesouro Direto só dá pra investir um valor (mínimo, ex. hoje
// R$ 201,42 - de onde vem?). Quero isso em Transações").
//
// Regra do Tesouro Direto (B3, Perguntas frequentes e comunicado das novas
// regras, em vigor desde 18/11/2024): dá pra comprar qualquer fração do título
// em múltiplos de 0,01 título (1% do preço unitário, o PU); então o valor
// mínimo de uma compra é 1% do PU de compra do dia - ex.: título a
// R$ 15.613,45 -> mínimo R$ 156,13. Até 17/11/2024 existia também o piso de
// R$ 30,00 por compra; ele deixou de existir (CNN Brasil/B3, 18/11/2024), por
// isso um título barato (PU de R$ 212 -> mínimo R$ 2,12) aceita menos de R$ 30.
// O PU de compra do dia vem do CSV público do Tesouro Transparente (coluna "PU
// Compra Manha", lido por CarteiraRendaFixaSync.gs!precosTesouroDireto_).
// Puro, sem DOM: testado em tests/aportes-rf-calc.test.js.

export const FRACAO_MINIMA_TESOURO = 0.01;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/** "Tesouro Selic 2029" (com ou sem tabulações da planilha) é Tesouro Direto? */
export const ehTesouro = (nome) => /^tesouro\b/i.test(limpar(nome));

/** Valor mínimo de compra: 0,01 título = 1% do PU, em centavos (R$ 15.613,45 -> R$ 156,13). */
export function minimoTesouro(pu) {
  return num(pu) > 0 ? Math.round(pu) / 100 : null;
}

/** Quantidade de títulos que um valor compra: 2 casas, pra baixo (como o Tesouro). */
export function qtdTesouroPorValor(valor, pu) {
  if (!(num(valor) > 0) || !(num(pu) > 0)) return 0;
  return Math.floor(valor / pu * 100 + 1e-9) / 100;
}

/** Valor de uma quantidade (arredondada pra baixo em 2 casas): qtd × PU, em centavos. */
export function valorTesouroPorQtd(qtd, pu) {
  if (!(num(qtd) > 0) || !(num(pu) > 0)) return 0;
  return Math.round(Math.floor(qtd * 100 + 1e-9) / 100 * pu * 100) / 100;
}

/**
 * Compra por valor: { qtd, valor (o que de fato custa: qtd × PU), sobra (o que
 * ficou de fora), minimo, abaixoMinimo }.
 */
export function compraPorValor(valorDigitado, pu) {
  const minimo = minimoTesouro(pu);
  const qtd = qtdTesouroPorValor(valorDigitado, pu);
  const valor = valorTesouroPorQtd(qtd, pu);
  return { qtd, valor, sobra: Math.max(0, Math.round((num(valorDigitado) - valor) * 100) / 100), minimo, abaixoMinimo: qtd < FRACAO_MINIMA_TESOURO - 1e-9 };
}

/** Compra por quantidade (2 casas pra baixo): { qtd, valor, minimo, abaixoMinimo }. */
export function compraPorQuantidade(qtdDigitada, pu) {
  const qtd = Math.floor(num(qtdDigitada) * 100 + 1e-9) / 100;
  return { qtd, valor: valorTesouroPorQtd(qtd, pu), sobra: 0, minimo: minimoTesouro(pu), abaixoMinimo: qtd < FRACAO_MINIMA_TESOURO - 1e-9 };
}

/** PU de compra de hoje de um título da carteira (ou da lista do Tesouro): number | null. */
export function puDoTitulo(t) {
  if (!t) return null;
  if (t.cotacao && num(t.cotacao.pu) > 0) return t.cotacao.pu;
  if (t.taxaHoje && num(t.taxaHoje.pu) > 0) return t.taxaHoje.pu;
  if (num(t.pu) > 0) return t.pu;
  return null;
}

/** Data-base da cotação (aaaa-mm-dd) de um título, se vier. */
export function dataCotacao(t) {
  if (!t) return '';
  return (t.cotacao && t.cotacao.data) || (t.taxaHoje && t.taxaHoje.data) || t.data || '';
}

const chaveNome = (s) => limpar(s).toLowerCase();

/** Título do Tesouro à venda hoje pelo nome (lista { nome, pu, data, ... } de Aportes.gs). */
export function acharTesouroHoje(lista, nome) {
  const k = chaveNome(nome);
  if (!k) return null;
  return (lista || []).find((t) => chaveNome(t.nome) === k) || null;
}

/** "mínimo hoje R$ 156,13 (1% do PU de R$ 15.613,45)" */
export function textoMinimo(pu, formatar) {
  const m = minimoTesouro(pu);
  return m == null ? '' : `mínimo hoje ${formatar(m)} (1% do PU de ${formatar(pu)})`;
}

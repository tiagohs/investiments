// assets/js/pages/aportes-grafico-calc.js
//
// 27/09/2026: gráfico "Suas compras no preço" (Lançamentos, quando filtra
// 1 ativo; e no popover do mapa de compras) - Tiago: "gosto do 1, pode
// incluir ele." Puro, sem DOM - testado em tests/aportes-grafico-calc.test.js.
//
// serieHistorico = getHistoricoAtivo (HistoricoAtivo.gs): [{ data, preco }],
// cronológico, preço cru (a MESMA moeda do ativo - nunca convertido: o
// site trata Ações EUA em dólar aqui, igual ao resto da tela do ativo).
// compras = as compras desse 1 ticker (aportes-mapa-calc.js!todasAsCompras
// filtrado por ativo), com o preço REALMENTE PAGO no lançamento - nunca
// reconstruído a partir do historico (Tiago, 27/09/2026, sobre o TRXF11:
// "veja de fato o lancamento daquele dia, ele é o valor que paguei" - o
// historico pode não bater 100% com o preço de pregão do dia por motivos
// fora do controle da planilha; o que o usuário pagou é o `preco` da
// própria transação, sempre).

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const porData = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0);

/**
 * Preço médio CORRIDO (todas as compras desde sempre, não só as do
 * período visível) em cada ponto de compra - a linha tracejada do
 * gráfico. Devolve [{ data, precoMedio }], começando e terminando nas
 * pontas do historico visível (pra a linha cobrir o gráfico inteiro).
 */
export function seriePrecoMedio(serieHistorico, compras) {
  if (!serieHistorico || !serieHistorico.length) return [];
  const ini = serieHistorico[0].data;
  const fim = serieHistorico[serieHistorico.length - 1].data;
  const todas = [...(compras || [])].sort(porData);
  let q = 0;
  let v = 0;
  todas.filter((c) => c.data < ini).forEach((c) => { q += num(c.qtd); v += num(c.qtd) * num(c.preco); });
  const pontos = [{ data: ini, precoMedio: q ? v / q : null }];
  todas.filter((c) => c.data >= ini && c.data <= fim).forEach((c) => {
    q += num(c.qtd);
    v += num(c.qtd) * num(c.preco);
    pontos.push({ data: c.data, precoMedio: q ? v / q : null });
  });
  pontos.push({ data: fim, precoMedio: q ? v / q : null });
  return pontos;
}

/** Compras dentro do período visível (mesma janela do historico), cronológicas. */
export function comprasNoPeriodo(serieHistorico, compras) {
  if (!serieHistorico || !serieHistorico.length) return [];
  const ini = serieHistorico[0].data;
  return (compras || []).filter((c) => c.data >= ini && num(c.qtd) > 0 && num(c.preco) > 0).sort(porData);
}

/**
 * Estatísticas do resumo abaixo do gráfico: quantas compras no período,
 * o preço médio que você realmente pagou (ponderado pela quantidade) x
 * o preço médio do próprio ativo no mesmo período, e quantas compras
 * ficaram abaixo dessa média do período.
 */
export function estatisticasGrafico(serieHistorico, compras) {
  const periodo = comprasNoPeriodo(serieHistorico, compras);
  if (!periodo.length || !serieHistorico || !serieHistorico.length) return { n: 0 };
  const mediaPeriodo = serieHistorico.reduce((s, p) => s + num(p.preco), 0) / serieHistorico.length;
  const qtdTotal = periodo.reduce((s, c) => s + num(c.qtd), 0);
  const valorTotal = periodo.reduce((s, c) => s + num(c.qtd) * num(c.preco), 0);
  const precoMedioPago = qtdTotal ? valorTotal / qtdTotal : null;
  const abaixoDaMedia = periodo.filter((c) => num(c.preco) < mediaPeriodo).length;
  return {
    n: periodo.length, precoMedioPago, mediaPeriodo,
    diferenca: precoMedioPago != null && mediaPeriodo ? precoMedioPago / mediaPeriodo - 1 : null,
    abaixoDaMedia,
  };
}

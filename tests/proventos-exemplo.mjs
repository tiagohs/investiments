// tests/proventos-exemplo.mjs - 24/09/2026: dados de exemplo (sintéticos) da
// tela Proventos, no formato de Proventos.gs!montarTelaProventos_ - usados em
// tests/proventos-calc.test.js e tests/proventos.test.js.
const rec = (data, ticker, classe, tipo, valor, o = {}) => ({ data, dataCom: '', ticker, classe, tipo, quantidade: 10, valorPorCota: valor / 10, liquido: valor, moeda: 'BRL', cambio: null, valor, ...o });
export const DADOS = {
  hoje: '2026-09-24',
  recebidos: [
    rec('2026-09-15', 'AAAA11', 'fiis', 'Rendimento', 10),
    rec('2026-09-05', 'BBBB3', 'acoes', 'JCP', 4),
    rec('2026-08-14', 'AAAA11', 'fiis', 'Rendimento', 10),
    rec('2026-08-20', 'CCCC', 'acoesEua', 'Dividendo', 5, { moeda: 'USD', liquido: 1, cambio: 5, valorPorCota: 0.1 }),
    rec('2026-01-10', 'BBBB3', 'acoes', 'Dividendo', 20),
    rec('2025-10-01', 'AAAA11', 'fiis', 'Rendimento', 8), // 12 meses = out/25..set/26: entra
    rec('2025-09-30', 'AAAA11', 'fiis', 'Rendimento', 7), // fora dos 12 meses
    rec('2024-03-10', 'DDDD3', 'acoes', 'Reembolso', 1),
  ],
  aReceber: [
    { ticker: 'BBBB3', classe: 'acoes', tipo: 'Dividendo', dataCom: '', dataPagamento: '2026-09-30', quantidade: 10, valorPorCota: 0.3, valor: 3, fonte: 'B3', jaLancado: false },
    { ticker: 'AAAA11', classe: 'fiis', tipo: 'Rendimento', dataCom: '2026-09-30', dataPagamento: '2026-10-14', quantidade: 10, valorPorCota: 1, valor: 10, fonte: 'FNet', jaLancado: false },
    { ticker: 'BBBB3', classe: 'acoes', tipo: 'JCP', dataCom: '', dataPagamento: '2027-03-01', quantidade: 10, valorPorCota: 0.2, valor: 2, fonte: 'B3', jaLancado: false },
    { ticker: 'EEEE3', classe: 'acoes', tipo: 'Dividendo', dataCom: '', dataPagamento: '', quantidade: 5, valorPorCota: 1, valor: 5, fonte: 'B3', jaLancado: false },
  ],
  pagosNaoLancados: [
    { ticker: 'AAAA11', classe: 'fiis', tipo: 'Rendimento', dataCom: '2026-08-31', dataPagamento: '2026-09-12', quantidade: 10, valorPorCota: 0.5, valor: 5, fonte: 'FNet', jaLancado: false },
  ],
  ativos: [
    { ticker: 'AAAA11', nome: 'Fundo A', classe: 'fiis', moeda: 'R$', precoAtual: 100, quantidade: 10, precoMedio: 90, dy: 0.1 },
    { ticker: 'BBBB3', nome: 'Empresa B', classe: 'acoes', moeda: 'R$', precoAtual: 20, quantidade: 10, precoMedio: 25, dy: 0.05 },
    { ticker: 'CCCC', nome: 'Company C', classe: 'acoesEua', moeda: 'US$', precoAtual: 12, quantidade: 1, precoMedio: 10, dy: 0.02 },
  ],
  aplicado: { acoes: 250, fiis: 900, acoesEua: 50 },
  aportes12m: { acoes: 100, fiis: 200, acoesEua: 0 },
};

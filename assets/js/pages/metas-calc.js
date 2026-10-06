/**
 * metas-calc.js - 06/10/2026 (A-42/A-76): ficou só como "barril" de compatibilidade. O cálculo de Metas foi dividido para
 * cada tela carregar só o que usa:
 *   - metas-calc-nucleo.js  tipos, status, datas em mês, moeda e o veredito de um ativo para uma meta (motor de critérios);
 *   - metas-calc-plano.js   o plano da meta (calcularMeta, vínculos, alocação, projeção, marcos, sugestões) - cartão de meta;
 *   - metas-calc-viagem.js  metas de viagem (países, entradas, taxa turística);
 *   - metas-calc-analise.js textos/análises da tela Metas.
 * Código novo deve importar do módulo específico; os testes e imports antigos continuam funcionando por aqui.
 */
export * from './metas-calc-nucleo.js';
export * from './metas-calc-plano.js';
export * from './metas-calc-viagem.js';
export * from './metas-calc-analise.js';

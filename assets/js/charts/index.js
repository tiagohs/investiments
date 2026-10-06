/**
 * assets/js/charts/index.js - BIBLIOTECA ÚNICA DE GRÁFICOS (05/10/2026, Onda 3 - kit Figma "Material You").
 * SVG próprio, sem lib; ES modules; cores só por variáveis CSS (assets/css/charts.css); formatadores de format.js (pt-BR).
 * Todos os criadores recebem o elemento-contêiner e devolvem { atualizar(dados), destruir() } (+ selecionar/alternarTabela
 * nos gráficos com tooltip). Passe `card: { rotulo, valor, periodos, periodo, aoMudarPeriodo, menu, ... }` pra envolver o
 * gráfico no card padrão do kit. Documentação viva: docs/graficos-m3.html. Inventário do que existia: docs/graficos-inventario.md.
 */
import { criarXY } from './xy.js';
import { criarBarras } from './barras.js';

/** Linha: `{ series:[{id,nome,valores,cor?,principal?,pontilhada?,area?}], eixoX:[rótulos], formatarY, formatarValor, altura, area, suave, zero, card }`. */
export const criarGraficoLinha = (el, op = {}) => criarXY(el, { ...op, tipo: 'linha' });
/** Área suave empilhada: `{ series, eixoX, formatarY, tons:'rampa'|'categorica', empilhado:true, total, card }`. */
export const criarGraficoArea = (el, op = {}) => criarXY(el, { ...op, tipo: 'area' });
/** Barras: `{ modo:'simples'|'agrupadas'|'empilhadas'|'pilulas', orientacao:'vertical'|'horizontal', categorias, series, destaque, card }`. */
export const criarGraficoBarras = (el, op = {}) => criarBarras(el, op);
/** Pílulas de faixa (barra com pontas totalmente arredondadas + segmentos tonais; `base:[..]` = faixa flutuante). */
export const criarGraficoPilulas = (el, op = {}) => criarBarras(el, { orientacao: 'vertical', ...op, modo: 'pilulas' });

export { criarAnel, criarAnelProgresso } from './anel.js';
export { criarSparkline, sparklineHtml } from './sparkline.js';
export { criarCardGrafico } from './card.js';
export { criarKpi, animarNumero } from './kpi.js';
export { criarBarraProgresso, criarBarraComposicao } from './progresso.js';
export { garantirEstilosCharts } from './estilos.js';

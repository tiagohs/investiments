/**
 * metas-graficos.js - gráficos da tela Metas e Objetivos, agora sobre a biblioteca única assets/js/charts/
 * (06/10/2026, Onda 3 - migração para o kit M3). Antes: SVG próprio com tooltip e CSS "mt-g-*" só desta tela
 * (graficoProjecaoSvg, graficoHistoricoSvg, graficoRendaSvg, ligarTooltipGrafico - removidos).
 *
 * Aqui só ficam as TRADUÇÕES dado -> opções da biblioteca (funções puras, testáveis sem DOM) e um pequeno gerenciador
 * que reaproveita o gráfico quando só o período muda (a biblioteca MORFA em vez de redesenhar do zero):
 *  - opcoesProjecao  evolução projetada: no seu ritmo (principal, com área) x necessária (pontilhada) x alvo (pontilhada fina);
 *                    prazo, marcos (1º milhão...) e vencimento de título aparecem no título do tooltip do mês
 *  - opcoesHistorico valor da meta mês a mês (linha + área) e, embaixo, o aporte de cada mês (barras, verde/vermelho pelo sinal);
 *                    no modo "mês a mês": aporte x rendimento (barras agrupadas)
 *  - opcoesRenda     proventos de cada mês (linha + área) + média de 12 meses + meta (pontilhada)
 *  - montarGrafico   cria/atualiza o gráfico dentro de uma caixa
 * Tudo que é número vem formatado por metas-card!formatMoeda / format.js; texto de dado só entra por textContent (a biblioteca cuida).
 */

import { serieProjecao, rotuloMes } from './metas-calc.js';
import { formatMoeda } from '../metas-card.js';
import { formatPct, MESES_CURTOS } from '../format.js';
import { criarGraficoLinha, criarGraficoBarras } from '../charts/index.js';

const COR_ALVO = 'var(--chart-axis)';
const pct = (v) => formatPct(v, 0);
const moeda0 = (v) => formatMoeda(v, 'BRL', { casas: 0 });

/** "mar/27" (eixo X compacto); com muitos meses só o ano, no mês de janeiro. */
function rotuloEixo(mes, longo) {
  const m = Number(mes.slice(5, 7));
  if (longo) return m === 1 ? mes.slice(0, 4) : '';
  return `${MESES_CURTOS[m - 1]}/${mes.slice(2, 4)}`;
}

/** Eixo X por mês: itens { rotulo, titulo } (o título é o texto longo do tooltip). */
function eixoMeses(pontos, tituloDe) {
  const longo = pontos.length > 36;
  return pontos.map((p, i) => ({ rotulo: rotuloEixo(p.mes, longo), titulo: tituloDe(p, i) }));
}
const tituloDoItem = (item) => (item && item.titulo) || '';

/**
 * Evolução projetada. `pontos` (opcional) = serieProjecao já recortada; `marcos` = metas-calc!marcosProjecao (no ritmo).
 * Devolve as opções de criarGraficoLinha (ou null quando não há o que projetar).
 */
export function opcoesProjecao(c, { pontos = null, marcos = [], hoje, mesDoHoje = null, duracaoAte = null } = {}) {
  const pts = pontos || serieProjecao(c, { hoje });
  if (pts.length < 2) return null;
  const maxDados = Math.max(...pts.map((p) => Math.max(p.ritmo || 0, p.necessaria || 0)));
  const mostraAlvo = !!(c.alvoBRL && c.alvoBRL <= maxDados * 2.2);
  const temNecessaria = pts[0].necessaria != null;
  const marcosPorMes = new Map((marcos || []).filter((m) => !m.ja && m.mes).map((m) => [m.mes, m]));
  const vencPorMes = new Map(((c.vencimentos && c.vencimentos.eventos) || []).map((e) => [e.mes, e]));
  const series = [
    { id: 'ritmo', nome: 'No seu ritmo', valores: pts.map((p) => p.ritmo), principal: true, area: true, cor: 1, largura: 3 },
  ];
  if (temNecessaria) series.push({ id: 'necessaria', nome: 'Necessária', valores: pts.map((p) => p.necessaria), pontilhada: true, cor: 3 });
  if (mostraAlvo) series.push({ id: 'alvo', nome: 'Alvo', valores: pts.map(() => c.alvoBRL), pontilhada: true, cor: COR_ALVO, largura: 1.5 });
  const eixoX = eixoMeses(pts, (p, i) => {
    const partes = [rotuloMes(p.mes)];
    if (i === 0) partes.push('hoje');
    else if (duracaoAte) partes.push(`daqui a ${duracaoAte(p.mes)}`);
    if (c.dataAlvo && p.mes === c.dataAlvo) partes.push('prazo da meta');
    const m = marcosPorMes.get(p.mes);
    if (m) partes.push(`marco: ${m.rotulo}${m.idade ? ` (${m.idade} anos)` : ''}`);
    const v = vencPorMes.get(p.mes);
    if (v) partes.push(`vence ${v.titulos.map((t) => t.nome).join(' e ')}`);
    return partes.join(' · ');
  });
  const ultimo = pts[pts.length - 1];
  return {
    series, eixoX, formatarX: tituloDoItem, formatarValor: (v) => formatMoeda(v), zero: true, altura: 250,
    tooltipExtra: (i) => (c.alvoBRL ? [{ nome: '% do alvo (ritmo)', valor: pct(pts[i].ritmo / c.alvoBRL) }] : []),
    aria: `Evolução projetada: no seu ritmo chega a ${formatMoeda(ultimo.ritmo)} em ${rotuloMes(ultimo.mes)}; alvo ${c.alvoBRL ? formatMoeda(c.alvoBRL) : 'não definido'}`,
    // para teste/uso: o que vira nota embaixo do gráfico
    notas: { prazo: !!(c.dataAlvo && pts.some((p) => p.mes === c.dataAlvo)), marcos: [...marcosPorMes.values()], vencimentos: [...vencPorMes.values()], mostraAlvo, hoje: mesDoHoje },
  };
}

/** Histórico: meses = [{ mes, valor, fluxo }]. modo 'acumulado' (linha do valor + barras do aporte) ou 'mensal' (aporte x rendimento). */
export function opcoesHistorico(meses, { alvo = null, modo = 'acumulado', mesAtual = null } = {}) {
  if (!meses || meses.length < 2) return null;
  const rend = meses.map((p, i) => (i === 0 ? 0 : p.valor - meses[i - 1].valor - (p.fluxo || 0)));
  const titulo = (p) => `${rotuloMes(p.mes)}${p.mes === mesAtual ? ' (até hoje)' : ''}`;
  const eixoX = eixoMeses(meses, titulo);
  if (modo === 'mensal') {
    const corpo = meses.slice(1);
    return {
      tipo: 'barras',
      opcoes: {
        modo: 'agrupadas', categorias: eixoX.slice(1), formatarX: tituloDoItem, formatarValor: (v) => formatMoeda(v), altura: 260,
        series: [
          { id: 'aporte', nome: 'Aporte do mês', valores: corpo.map((p) => p.fluxo || 0), cor: 1 },
          { id: 'rend', nome: 'Rendimento/valorização', valores: rend.slice(1), cor: 3 },
        ],
        aria: 'Mês a mês: aporte e rendimento de cada mês',
      },
    };
  }
  const maxV = Math.max(...meses.map((p) => p.valor));
  const mostraAlvo = !!(alvo && alvo <= maxV * 1.6);
  const series = [{ id: 'valor', nome: 'Valor da meta', valores: meses.map((p) => p.valor), principal: true, area: true, cor: 1, largura: 3 }];
  if (mostraAlvo) series.push({ id: 'alvo', nome: 'Alvo', valores: meses.map(() => alvo), pontilhada: true, cor: COR_ALVO, largura: 1.5 });
  const ult = meses[meses.length - 1];
  return {
    tipo: 'linha+barras',
    opcoes: {
      series, eixoX, formatarX: tituloDoItem, formatarValor: (v) => formatMoeda(v), altura: 230,
      tooltipExtra: (i) => {
        const p = meses[i];
        const linhas = [{ nome: 'Aporte', valor: `${(p.fluxo || 0) < 0 ? '−' : ''}${formatMoeda(Math.abs(p.fluxo || 0))}` }];
        if (i > 0) linhas.push({ nome: 'Rendimento', valor: `${rend[i] < 0 ? '−' : '+'}${formatMoeda(Math.abs(rend[i]))}` });
        if (alvo) linhas.push({ nome: '% do alvo', valor: pct(p.valor / alvo) });
        return linhas;
      },
      aria: `Histórico: de ${moeda0(meses[0].valor)} em ${rotuloMes(meses[0].mes)} a ${moeda0(ult.valor)} em ${rotuloMes(ult.mes)}`,
    },
    aporte: {
      categorias: eixoX, formatarX: tituloDoItem, formatarValor: (v) => formatMoeda(v), altura: 110, ticksY: 2, corPorSinal: true, legenda: false,
      series: [{ id: 'aporte', nome: 'Aporte do mês', valores: meses.map((p) => p.fluxo || 0) }], modo: 'simples', aria: 'Aporte de cada mês',
    },
  };
}

/** Renda mensal: renda = [{ mes, valor, media12 }] (o último pode ser parcial). */
export function opcoesRenda(renda, { alvo = null, mesAtual = null } = {}) {
  if (!renda || renda.length < 2) return null;
  const maxV = Math.max(...renda.map((p) => Math.max(p.valor, p.media12 || 0)));
  const mostraAlvo = !!(alvo && alvo <= maxV * 2);
  const series = [
    { id: 'renda', nome: 'Proventos do mês', valores: renda.map((p) => p.valor), principal: true, area: true, cor: 1, largura: 2.5 },
    { id: 'media', nome: 'Média de 12 meses', valores: renda.map((p) => (p.media12 == null ? null : p.media12)), cor: 3, largura: 2 },
  ];
  if (mostraAlvo) series.push({ id: 'alvo', nome: 'Meta', valores: renda.map(() => alvo), pontilhada: true, cor: COR_ALVO, largura: 1.5 });
  return {
    series, eixoX: eixoMeses(renda, (p) => `${rotuloMes(p.mes)}${p.mes === mesAtual ? ' (parcial)' : ''}`), formatarX: tituloDoItem,
    formatarValor: (v) => formatMoeda(v), altura: 230, zero: true,
    tooltipExtra: (i) => (alvo ? [{ nome: '% da meta', valor: pct(renda[i].valor / alvo) }] : []),
    aria: 'Renda passiva mês a mês',
  };
}

// ---------------------------------------------------------------------------
// Gerenciador: cria o gráfico na 1ª vez e MORFA nas seguintes (só troca o período/modo)
// ---------------------------------------------------------------------------

const GUARDADOS = new WeakMap();

function destruir(g) { if (g) g.graficos.forEach((x) => { try { x.destruir(); } catch (e) { /* já saiu */ } }); }

/** Esvazia a caixa e solta o que estava desenhado nela. */
export function limparGrafico(caixa) {
  if (!caixa) return;
  destruir(GUARDADOS.get(caixa));
  GUARDADOS.delete(caixa);
  caixa.textContent = '';
}

/**
 * Desenha `spec` ({ tipo:'linha'|'barras'|'linha+barras', opcoes, aporte? }) em `caixa`. Mesma caixa + mesmo tipo = atualiza
 * (morfa); tipo diferente = recria. Devolve a lista de gráficos.
 */
export function montarGrafico(caixa, spec) {
  if (!caixa || !spec) return [];
  const doc = caixa.ownerDocument;
  const antes = GUARDADOS.get(caixa);
  if (antes && antes.tipo === spec.tipo && caixa.contains(antes.graficos[0] && antes.graficos[0].el)) {
    antes.graficos[0].atualizar(spec.opcoes);
    if (antes.graficos[1] && spec.aporte) antes.graficos[1].atualizar(spec.aporte);
    return antes.graficos;
  }
  limparGrafico(caixa);
  const graficos = [];
  const principal = doc.createElement('div');
  principal.className = 'mt-g-principal';
  caixa.append(principal);
  if (spec.tipo === 'barras') graficos.push(criarGraficoBarras(principal, spec.opcoes));
  else graficos.push(criarGraficoLinha(principal, spec.opcoes));
  if (spec.tipo === 'linha+barras' && spec.aporte) {
    const emb = doc.createElement('div');
    emb.className = 'mt-g-aporte';
    caixa.append(emb);
    graficos.push(criarGraficoBarras(emb, { botaoTabela: false, ...spec.aporte }));
  }
  GUARDADOS.set(caixa, { tipo: spec.tipo, graficos });
  return graficos;
}

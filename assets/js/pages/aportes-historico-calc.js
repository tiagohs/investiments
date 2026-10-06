// assets/js/pages/aportes-historico-calc.js
//
// 06/10/2026: contas de "Transações > Aportes concluídos" (Tiago: "Aportes concluídos deveriam refletir o gráfico de
// Investido por mês. Converter os meses que investi antes do site para aparecerem em Aportes concluídos... inclua
// filtros e controle"). Duas origens, uma lista só:
//  - site: aportes concluídos feitos pelo site (aux_aportes);
//  - histórico: os dias de compra das abas Transações / Transações - USA / Transações Renda Fixa que nenhum aporte do
//    site cobre (Aportes.gs!historicoInvestido_, derivado na leitura - nada é gravado na planilha).
// O total de cada mês é o MESMO da barra do "Investido por mês" (dados.resumo, que sai das mesmas compras).
// Só funções puras (sem DOM); o desenho fica em aportes-historico.js.

import { ehPeriodoPersonalizado } from '../periodo-personalizado.js';

export const PERIODOS_HISTORICO = ['ano', '1a', '3a', '5a', 'tudo'];
export const CLASSES_HISTORICO = ['acoes', 'fiis', 'acoesEua', 'rendaFixa'];

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100;
const mesDe = (iso) => String(iso).slice(0, 7);
const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function estadoInicialHistorico() {
  return { periodo: 'tudo', classe: 'todas', origem: 'todas', busca: '', anos: 1, mesesAbertos: {}, itensAbertos: {} };
}

/** { inicio, fim } (yyyy-MM-dd) do período do filtro, ou null (= tudo). */
export function intervaloDoPeriodo(periodo, hoje) {
  if (ehPeriodoPersonalizado(periodo)) return periodo.inicio <= periodo.fim ? { inicio: periodo.inicio, fim: periodo.fim } : { inicio: periodo.fim, fim: periodo.inicio };
  const [a, m] = String(hoje).split('-').map(Number);
  const mesesAtras = (n) => { const t = a * 12 + (m - 1) - n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`; };
  if (periodo === 'ano') return { inicio: `${a}-01-01`, fim: hoje };
  if (periodo === '1a' || periodo === '12m') return { inicio: mesesAtras(11), fim: hoje };
  if (periodo === '3a' || periodo === '36m') return { inicio: mesesAtras(35), fim: hoje };
  if (periodo === '5a' || periodo === '60m') return { inicio: mesesAtras(59), fim: hoje };
  return null;
}

/** Itens do aporte do site que passam no filtro de classe e na busca. */
function itensDoSite(aporte, { classe, busca }) {
  return (aporte.itens || []).filter((it) => (classe === 'todas' || it.classe === classe) && (!busca || norm(it.ativo).includes(busca)));
}

/**
 * Meses do "Aportes concluídos" já filtrados e ordenados (mais novo primeiro).
 * entrada: { aportes, historicoPlanilha: { dias, cobertoSite }, resumo, aConfirmar, hoje }
 * filtros: { periodo, classe: 'todas'|classe, origem: 'todas'|'site'|'historico', busca }
 * saída: [{ chave, ano, total, barra, filtrado, nSite, nHistorico, cartoes: [{ tipo: 'site', data, aporte } | { tipo: 'historico', data, classe, valor, usd, itens }] }]
 *  - barra = o valor do mês no gráfico "Investido por mês" (com filtro de classe: só a classe);
 *  - total = barra, ou, quando há busca / filtro de origem, a soma do que está na tela (filtrado = true);
 *  - aguardando = aportes concluídos no site ainda sem lançamento na planilha (aConfirmar), só no mês e sem filtro de busca.
 */
export function mesesDoHistorico(entrada, filtros = {}) {
  const { aportes = [], historicoPlanilha = {}, resumo = {}, aConfirmar = [], hoje } = entrada;
  const f = { periodo: 'tudo', classe: 'todas', origem: 'todas', busca: '', ...filtros };
  const busca = norm(f.busca);
  const intervalo = intervaloDoPeriodo(f.periodo, hoje);
  const dentro = (data) => !intervalo || (data >= intervalo.inicio && data <= intervalo.fim);
  const meses = new Map();
  const mes = (chave) => {
    if (!meses.has(chave)) meses.set(chave, { chave, ano: Number(chave.slice(0, 4)), cartoes: [], nSite: 0, nHistorico: 0, soma: 0, aguardando: 0 });
    return meses.get(chave);
  };

  if (f.origem !== 'historico') {
    aportes.filter((a) => a.status === 'concluido' && dentro(a.data)).forEach((a) => {
      const itens = itensDoSite(a, { classe: f.classe, busca });
      if (!itens.length) return;
      const m = mes(mesDe(a.data));
      m.cartoes.push({ tipo: 'site', data: a.data, aporte: a });
      m.nSite += 1;
      m.soma += itens.reduce((t, it) => t + (Number(it.valorFinal) || 0) * (it.moeda === 'USD' ? (entrada.cambio || 0) : 1), 0);
    });
  }
  if (f.origem !== 'site') {
    (historicoPlanilha.dias || []).filter((d) => dentro(d.data) && (f.classe === 'todas' || d.classe === f.classe)).forEach((d) => {
      let itens = d.itens || [];
      if (busca) itens = itens.filter((it) => norm(it.ativo).includes(busca));
      if (!itens.length) return;
      const valor = busca ? arred(itens.reduce((t, it) => t + it.valor, 0)) : d.valor;
      const dolares = busca ? arred(itens.reduce((t, it) => t + (it.usd || 0), 0)) : d.usd;
      const m = mes(mesDe(d.data));
      m.cartoes.push({ tipo: 'historico', data: d.data, classe: d.classe, valor, usd: dolares, itens });
      m.nHistorico += 1;
      m.soma += valor;
    });
  }
  if (!busca && f.origem !== 'historico') {
    (aConfirmar || []).filter((x) => dentro(x.data) && (f.classe === 'todas' || x.classe === f.classe)).forEach((x) => {
      if (meses.has(mesDe(x.data))) meses.get(mesDe(x.data)).aguardando += Number(x.valor) || 0;
    });
  }

  const ordemClasse = (c) => CLASSES_HISTORICO.indexOf(c.classe || (c.aporte && c.aporte.itens && c.aporte.itens[0] && c.aporte.itens[0].classe));
  return [...meses.values()].sort((a, b) => (a.chave < b.chave ? 1 : -1)).map((m) => {
    m.cartoes.sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : ordemClasse(x) - ordemClasse(y)));
    const r = resumo[m.chave] || {};
    const barra = arred(f.classe === 'todas' ? r.total : r[f.classe]);
    const filtrado = !!busca || f.origem !== 'todas';
    return { chave: m.chave, ano: m.ano, barra, total: filtrado ? arred(m.soma) : barra, filtrado, nSite: m.nSite, nHistorico: m.nHistorico, aguardando: arred(m.aguardando), cartoes: m.cartoes };
  });
}

/** Anos presentes (mais novo primeiro) com quantos meses e quanto cada um tem. */
export function anosDosMeses(meses) {
  const por = new Map();
  meses.forEach((m) => {
    const a = por.get(m.ano) || { ano: m.ano, meses: 0, total: 0 };
    a.meses += 1; a.total = arred(a.total + m.total);
    por.set(m.ano, a);
  });
  return [...por.values()].sort((a, b) => b.ano - a.ano);
}

/** Primeira página: os `anos` anos mais novos; `proximo` = o ano que o "Carregar mais" traz (ou null). */
export function paginaPorAno(meses, anos) {
  const lista = anosDosMeses(meses);
  const n = Math.max(1, anos | 0);
  const liberados = new Set(lista.slice(0, n).map((a) => a.ano));
  return { visiveis: meses.filter((m) => liberados.has(m.ano)), proximo: lista[n] || null, anosTotal: lista.length };
}

/** Limites pro calendário do "Escolher período": do 1º dia com compra (site ou planilha) até hoje. */
export function limitesDoHistorico({ aportes = [], historicoPlanilha = {}, resumo = {}, hoje }) {
  const datas = [];
  (historicoPlanilha.dias || []).forEach((d) => datas.push(d.data));
  aportes.filter((a) => a.status === 'concluido').forEach((a) => datas.push(a.data));
  Object.keys(resumo || {}).forEach((k) => { if (/^\d{4}-\d{2}$/.test(k)) datas.push(`${k}-01`); });
  datas.sort();
  return { min: datas[0] || `${String(hoje).slice(0, 4)}-01-01`, max: hoje };
}

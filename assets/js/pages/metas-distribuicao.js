/**
 * metas-distribuicao.js - 06/10/2026 (Tiago: "faz sentido os objetivos da carteira ser um tipo de meta? E ser enviado para a
 * tela de Metas e Objetivos? [...] metas de peso de divisão de ativos, divisão de ações (dividendos - renomearia para
 * nacionais -, internacionais), FIIs (tijolo, híbrido, papel)").
 *
 * Meta do tipo "Distribuição da carteira" ('distribuicaoCarteira', aux_metas): guarda os PESOS desejados (frações 0-1) em
 * `especificos.pesos`, um conjunto por grupo, e cada grupo soma 100%:
 *   grupos  Ações / FIIs / Renda Fixa
 *   acoes   Ações Nacionais / Ações Internacionais
 *   fiis    Tijolo / Híbrido / Papel
 *   rf      Renda Emergencial / Renda Fixa (de longo prazo)
 * O SITE é a fonte da verdade: ao salvar, o Apps Script (DistribuicoesMetas.gs) grava esses % nas células da planilha de onde
 * as fórmulas dela leem. Aqui mora só o cálculo puro (atual x meta, "faltam R$", aporte pra rebalancear) e o HTML do card, do
 * detalhe e dos passos do assistente - sem rede e sem estado (testes em tests/metas-distribuicao.test.js).
 *
 * A conta do aporte é a mesma da planilha: o tipo mais "cheio" em relação à meta dele define o tamanho da carteira alvo
 * (carteira alvo = maior valor atual / peso); cada tipo precisa chegar em peso x carteira alvo, só comprando (nunca vende).
 * Sem dependência de DOM nem de outros módulos de página (só format.js e util/html.js).
 */

import { formatBRL, formatNumeroBR } from '../format.js';
import { esc } from '../util/html.js';

export const TIPO_DISTRIBUICAO = 'distribuicaoCarteira';

/** Tolerância da soma de 100% (em fração): 0,05 ponto percentual - o mesmo do Apps Script. */
export const TOLERANCIA_SOMA = 0.0005;

/** Cores por tipo = as classes do site (tokens de shell.css). */
export const GRUPOS_DISTRIBUICAO = [
  {
    id: 'grupos', titulo: 'Ações, FIIs e Renda Fixa', curto: 'Ações, FIIs e Renda Fixa',
    itens: [
      { id: 'acoes', rotulo: 'Ações', cor: 'var(--acoes)' },
      { id: 'fiis', rotulo: 'FIIs', cor: 'var(--fiis)' },
      { id: 'rf', rotulo: 'Renda Fixa', cor: 'var(--rf)' },
    ],
  },
  {
    id: 'acoes', titulo: 'Dentro das Ações', curto: 'Ações',
    itens: [
      { id: 'nacionais', rotulo: 'Nacionais', cor: 'var(--acoes)' },
      { id: 'internacionais', rotulo: 'Internacionais', cor: 'var(--usa)' },
    ],
  },
  {
    id: 'fiis', titulo: 'Dentro dos FIIs', curto: 'FIIs',
    itens: [
      { id: 'tijolo', rotulo: 'Tijolo', cor: 'var(--fii-tijolo)' },
      { id: 'hibrido', rotulo: 'Híbrido', cor: 'var(--fii-hibrido)' },
      { id: 'papel', rotulo: 'Papel', cor: 'var(--fii-papel)' },
    ],
  },
  {
    id: 'rf', titulo: 'Dentro da Renda Fixa', curto: 'Renda Fixa',
    itens: [
      { id: 'emergencial', rotulo: 'Renda Emergencial', cor: 'var(--na)' },
      { id: 'rendaFixa', rotulo: 'Renda Fixa', cor: 'var(--rf)' },
    ],
  },
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r2 = (v) => Math.round(v * 100) / 100;

export const ehMetaDistribuicao = (meta) => !!meta && meta.tipo === TIPO_DISTRIBUICAO;

/** Pesos de partida (assistente sem a planilha à mão): 50/40/10, 60/40, 40/30/30 e 90/10. */
export function pesosPadraoDistribuicao() {
  return {
    grupos: { acoes: 0.5, fiis: 0.4, rf: 0.1 },
    acoes: { nacionais: 0.6, internacionais: 0.4 },
    fiis: { tijolo: 0.4, hibrido: 0.3, papel: 0.3 },
    rf: { emergencial: 0.9, rendaFixa: 0.1 },
  };
}

/** Pesos da meta, completando o que faltar com zero (nunca devolve undefined em nenhum tipo). */
export function pesosDaMeta(meta) {
  const p = (meta && meta.especificos && meta.especificos.pesos) || {};
  const out = {};
  GRUPOS_DISTRIBUICAO.forEach((g) => {
    out[g.id] = {};
    g.itens.forEach((i) => { out[g.id][i.id] = num(p[g.id] && p[g.id][i.id]) || 0; });
  });
  return out;
}

export function somaGrupo(pesos, grupoId) {
  const g = (pesos && pesos[grupoId]) || {};
  const def = GRUPOS_DISTRIBUICAO.find((x) => x.id === grupoId);
  return (def ? def.itens : []).reduce((s, i) => s + (num(g[i.id]) || 0), 0);
}

/** Cada grupo tem que somar 100%. `{ ok, grupos: [{ id, titulo, soma, ok }], mensagem }` (mensagem = o 1º grupo que não fecha). */
export function validarPesos(pesos) {
  const grupos = GRUPOS_DISTRIBUICAO.map((g) => {
    const soma = somaGrupo(pesos, g.id);
    return { id: g.id, titulo: g.curto, soma, ok: Math.abs(soma - 1) <= TOLERANCIA_SOMA };
  });
  const ruim = grupos.find((g) => !g.ok);
  return {
    ok: !ruim, grupos,
    mensagem: ruim ? `Os pesos de "${ruim.titulo}" precisam somar 100% (hoje somam ${fmtPct(ruim.soma)}).` : null,
  };
}

/** "55%", "33,3%" (até 1 casa, sem zero sobrando). */
export function fmtPct(fracao) {
  if (num(fracao) == null) return '—';
  const v = Math.round(fracao * 1000) / 10;
  return `${formatNumeroBR(v, Number.isInteger(v) ? 0 : 1)}%`;
}

// ---------------------------------------------------------------------------
// "Atual": vem dos blocos que a planilha já calcula (action=distribuicoesMetas -> objetivos/splitsInternos; action=metas ->
// distribuicaoAtual, mesmo formato). Só o carteira atual em R$ de cada tipo é lido - o resto é conta daqui.
// ---------------------------------------------------------------------------

function achar(lista, re, posicao) {
  const l = lista || [];
  return l.find((t) => re.test(String((t && t.tipo) || ''))) || l[posicao] || null;
}

/** { grupos: {acoes,fiis,rf}, acoes: {nacionais,internacionais}, fiis: {tijolo,hibrido,papel}, rf: {emergencial,rendaFixa} } em R$; `temDados` se achou o bloco principal. */
export function atuaisDeResposta(resp) {
  const out = { grupos: {}, acoes: {}, fiis: {}, rf: {}, temDados: false };
  const obj = (resp && resp.objetivos) || {};
  const split = (resp && resp.splitsInternos) || {};
  const v = (t) => (t ? num(t.carteiraAtual) : null);
  const geral = (obj.alocacaoGeral && obj.alocacaoGeral.tipos) || [];
  if (geral.length) {
    out.grupos.acoes = v(achar(geral, /a[cç][oõ]es/i, 0));
    out.grupos.fiis = v(achar(geral, /fii/i, 1));
    out.grupos.rf = v(achar(geral, /renda fixa/i, 2));
    out.temDados = true;
  }
  const rf = (obj.alocacaoRendaFixa && obj.alocacaoRendaFixa.tipos) || [];
  if (rf.length) {
    out.rf.emergencial = v(achar(rf, /emergenc/i, 0));
    out.rf.rendaFixa = v(rf.find((t) => !/emergenc/i.test(String(t.tipo || ''))) || rf[1]);
  }
  const acoes = (split.acoes && split.acoes.itens) || [];
  if (acoes.length) {
    out.acoes.nacionais = v(acoes.find((t) => !/internac/i.test(String(t.tipo || ''))) || acoes[0]);
    out.acoes.internacionais = v(achar(acoes, /internac/i, 1));
  }
  const fiis = (split.fiis && split.fiis.itens) || [];
  if (fiis.length) {
    out.fiis.tijolo = v(achar(fiis, /tijolo/i, 0));
    out.fiis.papel = v(achar(fiis, /papel/i, 1));
    out.fiis.hibrido = v(achar(fiis, /h[ií]brid/i, 2));
  }
  return out;
}

/** Os % desejados que a planilha tem (mesma resposta) - só pra montar a meta quando ela ainda não veio do servidor. */
export function pesosDeResposta(resp) {
  const obj = (resp && resp.objetivos) || {};
  const split = (resp && resp.splitsInternos) || {};
  const d = (t) => (t ? num(t.percentualDesejado) : null);
  const pesos = pesosPadraoDistribuicao();
  const geral = (obj.alocacaoGeral && obj.alocacaoGeral.tipos) || [];
  if (geral.length) {
    const a = d(achar(geral, /a[cç][oõ]es/i, 0)); const f = d(achar(geral, /fii/i, 1)); const r = d(achar(geral, /renda fixa/i, 2));
    if (a != null && f != null && r != null) pesos.grupos = { acoes: a, fiis: f, rf: r };
  }
  const rf = (obj.alocacaoRendaFixa && obj.alocacaoRendaFixa.tipos) || [];
  if (rf.length) {
    const e = d(achar(rf, /emergenc/i, 0)); const l = d(rf.find((t) => !/emergenc/i.test(String(t.tipo || ''))) || rf[1]);
    if (e != null && l != null) pesos.rf = { emergencial: e, rendaFixa: l };
  }
  const acoes = (split.acoes && split.acoes.itens) || [];
  if (acoes.length) {
    const n = d(acoes.find((t) => !/internac/i.test(String(t.tipo || ''))) || acoes[0]); const i = d(achar(acoes, /internac/i, 1));
    if (n != null && i != null) pesos.acoes = { nacionais: n, internacionais: i };
  }
  const fiis = (split.fiis && split.fiis.itens) || [];
  if (fiis.length) {
    const t = d(achar(fiis, /tijolo/i, 0)); const p = d(achar(fiis, /papel/i, 1)); const h = d(achar(fiis, /h[ií]brid/i, 2));
    if (t != null && p != null && h != null) pesos.fiis = { tijolo: t, papel: p, hibrido: h };
  }
  return pesos;
}

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------

/**
 * Atual x meta por grupo e o aporte pra rebalancear (só comprando).
 * `{ grupos: [{ id, titulo, itens: [{ id, rotulo, cor, peso, atual, pctAtual, faltam, naMeta, quase }], total, aporte,
 *   novoTotal, naMeta, somaPesos }], totalInvestido, aporteTotal, novoTotal, naMeta, temDados }`
 */
export function calcularDistribuicao(pesos, atuais) {
  const p = pesos || {};
  const a = atuais || {};
  const grupos = GRUPOS_DISTRIBUICAO.map((def) => {
    const itens = def.itens.map((i) => ({
      id: i.id, rotulo: i.rotulo, cor: i.cor,
      peso: num(p[def.id] && p[def.id][i.id]) || 0,
      atual: Math.max(0, num(a[def.id] && a[def.id][i.id]) || 0),
      temAtual: num(a[def.id] && a[def.id][i.id]) != null,
    }));
    const total = itens.reduce((s, i) => s + i.atual, 0);
    let alvo = 0;
    itens.forEach((i) => { if (i.peso > 0) alvo = Math.max(alvo, i.atual / i.peso); });
    itens.forEach((i) => {
      i.pctAtual = total > 0 ? i.atual / total : 0;
      const falta = alvo * i.peso - i.atual;
      i.faltam = falta > 0.5 ? r2(falta) : 0;
      i.naMeta = i.faltam === 0;
      i.quase = !i.naMeta && i.peso > 0 && i.pctAtual / i.peso >= 0.9; // "quase lá": a 90% da fatia desejada
    });
    const aporte = r2(itens.reduce((s, i) => s + i.faltam, 0));
    return {
      id: def.id, titulo: def.titulo, curto: def.curto, itens, total: r2(total), aporte, novoTotal: r2(total + aporte),
      naMeta: aporte === 0, somaPesos: somaGrupo(p, def.id), temDados: itens.some((i) => i.temAtual),
    };
  });
  const principal = grupos[0];
  return {
    grupos, totalInvestido: principal.total, aporteTotal: principal.aporte, novoTotal: principal.novoTotal,
    naMeta: grupos.filter((g) => g.temDados).every((g) => g.naMeta), temDados: principal.temDados,
  };
}

/**
 * Status da meta no padrão de cores do site: verde = na meta; amarelo = quase lá (falta menos de 5% da carteira alvo no
 * grupo principal); cinza = em progresso. Nunca vermelho (não é erro).
 */
export function statusDistribuicao(dist) {
  if (!dist || !dist.temDados) return { id: 'sem-dados', rotulo: 'Sem dados', classe: 'na' };
  if (dist.naMeta) return { id: 'na-meta', rotulo: 'Na meta', classe: 'good' };
  const p = dist.grupos[0];
  const quase = p.novoTotal > 0 && p.aporte / p.novoTotal <= 0.05;
  return quase ? { id: 'quase', rotulo: 'Quase lá', classe: 'warn' } : { id: 'em-progresso', rotulo: 'Em progresso', classe: 'na' };
}

/** Os blocos no formato de criarBlocoObjetivo (distribuicoes-metas.js): a tela de Acompanhamento redesenha com o visual de sempre. */
export function blocosDeDistribuicao(dist) {
  return (dist ? dist.grupos : []).filter((g) => g.temDados).map((g) => ({
    blocoId: g.id,
    titulo: g.titulo,
    tipos: g.itens.map((i) => ({
      tipo: rotuloItem(g.id, i), percentualDesejado: i.peso, percentualAtual: i.pctAtual, carteiraAtual: i.atual, valorInvestir: i.faltam, cor: i.cor,
    })),
    total: { carteiraAtual: g.total, novaCarteira: g.novoTotal, valorInvestir: g.aporte },
  }));
}

/** Rótulo do tipo na linha (dentro do bloco "Dentro das Ações" o título do bloco já diz de quê). */
function rotuloItem(grupoId, item) {
  void grupoId;
  return item.rotulo;
}

// ---------------------------------------------------------------------------
// HTML (card da lista, detalhe, passos do assistente). Classes md-* em assets/css/distribuicoes-metas.css.
// ---------------------------------------------------------------------------

function badgeItem(i) {
  if (i.naMeta) return '<span class="md-badge good"><svg class="ico" aria-hidden="true"><use href="#ico-check"/></svg>na meta</span>';
  return `<span class="md-badge ${i.quase ? 'warn' : 'na'}">faltam ${esc(formatBRL(i.faltam))}</span>`;
}

function linhaHtml(grupoId, i) {
  const pctA = Math.max(0, Math.min(1, i.pctAtual)) * 100;
  const pctM = Math.max(0, Math.min(1, i.peso)) * 100;
  const nome = rotuloItem(grupoId, i);
  return `<span class="md-linha">
  <span class="md-linha-cab"><i class="md-dot" style="background:${i.cor}" aria-hidden="true"></i><span class="md-nome">${esc(nome)}</span><span class="md-pcts"><b>${fmtPct(i.pctAtual)}</b> meta ${fmtPct(i.peso)}</span></span>
  <span class="md-barra" role="img" aria-label="${esc(`${nome}: atual ${fmtPct(i.pctAtual)}, meta ${fmtPct(i.peso)}`)}"><span class="md-fill" style="width:${pctA.toFixed(2)}%;background:${i.cor}"></span><i class="md-marca" style="left:${pctM.toFixed(2)}%"></i></span>
  <span class="md-linha-pe"><span class="md-valor">${esc(formatBRL(i.atual))}</span>${badgeItem(i)}</span>
</span>`;
}

/** Duas barras empilhadas (atual x meta) do grupo, como a da Início. */
function comparativoHtml(g) {
  const fatias = (campo) => g.itens.filter((i) => i[campo] > 0).map((i) => `<i style="flex:${(i[campo] * 100).toFixed(3)} 1 0;background:${i.cor}" title="${esc(`${i.rotulo}: ${fmtPct(i[campo])}`)}"></i>`).join('');
  return `<span class="md-comp" aria-hidden="true">
  <span class="md-comp-linha"><em>atual</em><span class="md-comp-barra">${fatias('pctAtual')}</span></span>
  <span class="md-comp-linha"><em>meta</em><span class="md-comp-barra md-comp-meta">${fatias('peso')}</span></span>
</span>`;
}

function resumoGrupoHtml(g) {
  return g.naMeta
    ? '<span class="md-resumo-ok"><svg class="ico" aria-hidden="true"><use href="#ico-check"/></svg>na meta - nenhum aporte pendente</span>'
    : `<span class="md-resumo"><b class="md-aporte">+ ${esc(formatBRL(g.aporte))}</b><small>de aporte pra rebalancear · carteira vai a ${esc(formatBRL(g.novoTotal))}</small></span>`;
}

function blocoGrupoHtml(g, { comparativo = true } = {}) {
  if (!g.temDados) return '';
  return `<section class="md-grupo-bloco" aria-label="${esc(g.titulo)}">
  <span class="md-grupo-cab"><h4>${esc(g.titulo)}</h4><span class="md-total">${esc(formatBRL(g.total))}</span></span>
  ${resumoGrupoHtml(g)}
  ${comparativo ? comparativoHtml(g) : ''}
  <span class="md-linhas">${g.itens.map((i) => linhaHtml(g.id, i)).join('')}</span>
</section>`;
}

/**
 * Card da meta na lista de Metas e Objetivos (mesmo invólucro dos outros cards: botão com data-abrir). Mostra o grupo
 * principal (Ações / FIIs / Renda Fixa) e o aporte pra rebalancear; os outros 3 grupos ficam no detalhe.
 * `seloHtml` vem de metas-card (seloMetaHtml) - o módulo não importa a tela.
 */
export function cardDistribuicaoHtml(meta, dist, { seloHtml = '', arquivada = false } = {}) {
  const st = arquivada ? { rotulo: 'Arquivada', classe: 'na' } : statusDistribuicao(dist);
  const p = dist && dist.temDados ? dist.grupos[0] : null;
  const corpo = p
    ? `${resumoGrupoHtml(p)}<span class="md-linhas">${p.itens.map((i) => linhaHtml(p.id, i)).join('')}</span>`
    : '<span class="md-vazio">Os valores atuais da carteira ainda não chegaram da planilha. Abra a meta pra ver os pesos.</span>';
  return `<button class="mt-card md-card" type="button" data-abrir="${esc(meta.id)}" style="--mt-cor:var(--acoes);--mt-cor-soft:var(--acoes-soft)">
  <span class="mt-card-cab">
    ${seloHtml}
    <span class="mt-card-tit"><strong>${esc(meta.nome)}</strong><span>${p ? `${esc(formatBRL(p.total))} investidos` : 'Distribuição da carteira'}</span></span>
    <span class="mt-status ${st.classe}">${esc(st.rotulo)}</span>
  </span>
  ${corpo}
</button>`;
}

/**
 * Detalhe: os 4 grupos (atual x meta, "na meta"/"faltam R$", aporte). Botões com os mesmos data-* da tela
 * (data-editar, data-arquivar, data-restaurar, data-excluir-definitivo, data-voltar).
 */
export function detalheDistribuicaoHtml(meta, dist, { seloHtml = '', arquivada = false } = {}) {
  const st = arquivada ? { rotulo: 'Arquivada', classe: 'na' } : statusDistribuicao(dist);
  const acoes = arquivada
    ? '<button class="btn btn-ghost mt-btn-sm" type="button" data-restaurar>Restaurar</button><button class="btn btn-ghost mt-btn-sm mt-btn-perigo" type="button" data-excluir-definitivo>Excluir definitivamente</button>'
    : '<button class="btn btn-ghost mt-btn-sm" type="button" data-editar>Editar pesos</button><button class="btn btn-ghost mt-btn-sm" type="button" data-arquivar>Arquivar</button>';
  const kpi = dist && dist.temDados
    ? `<div class="md-kpis">
  <span class="md-kpi"><em>Total investido</em><b>${esc(formatBRL(dist.totalInvestido))}</b><small>Ações, FIIs e Renda Fixa de longo prazo</small></span>
  <span class="md-kpi"><em>Pra atingir a meta</em>${dist.aporteTotal > 0 ? `<b class="md-aporte">+ ${esc(formatBRL(dist.aporteTotal))}</b><small>de aporte novo pra rebalancear · carteira vai a ${esc(formatBRL(dist.novoTotal))}</small>` : '<b class="md-ok">na meta</b><small>nenhum aporte pendente</small>'}</span>
</div>` : '';
  const blocos = dist && dist.temDados
    ? `<div class="md-grade">${dist.grupos.map((g) => blocoGrupoHtml(g)).join('')}</div>`
    : '<p class="mt-nota">Os valores atuais da carteira ainda não chegaram da planilha. Atualize a página em instantes.</p>';
  return `<div class="mt-detalhe md-detalhe">
<nav class="breadcrumb mt-breadcrumb" aria-label="Você está em"><ol><li><a href="#" data-voltar>Metas e Objetivos</a><span class="bc-sep" aria-hidden="true"><svg class="ico"><use href="#ico-chev-r"/></svg></span></li><li><span aria-current="page">${esc(meta.nome)}</span></li></ol></nav>
<section class="mt-heroi mt-heroi-v2" style="--mt-cor:var(--acoes);--mt-cor-soft:var(--acoes-soft)">
  <div class="mt-heroi-cab">
    ${seloHtml}
    <div class="mt-heroi-tit"><span class="mt-eyebrow">Distribuição da carteira</span><h2>${esc(meta.nome)}</h2></div>
    <span class="mt-status ${st.classe}">${esc(st.rotulo)}</span>
    <div class="mt-heroi-acoes">${acoes}</div>
  </div>
  ${kpi}
</section>
<p class="mt-nota md-nota">O aporte é o que falta comprar pra cada tipo chegar na fatia desejada sem vender nada: o tipo mais "cheio" em relação à meta define o tamanho da carteira alvo. Ao salvar os pesos aqui, a planilha (Distribuição e Metas) é atualizada junto.</p>
${blocos}
</div>`;
}

// --- assistente (passos Tipo -> Dados -> Revisar) ---

/** Tile do tipo no 1º passo (uma meta ativa só: se já existe, o tile avisa). */
export function tileDistribuicaoHtml({ ativo = false, jaExiste = false, seloHtml = '', resumo = '' } = {}) {
  return `<button type="button" class="mt-tipo ${ativo ? 'ativo' : ''}" data-tipo="${TIPO_DISTRIBUICAO}" ${jaExiste ? 'data-ja-existe' : ''} style="--mt-cor:var(--acoes);--mt-cor-soft:var(--acoes-soft)">${seloHtml}<span><strong>Distribuição da carteira</strong><em>${esc(jaExiste ? 'Você já tem essa meta: toque pra abrir e editar os pesos' : resumo)}</em></span></button>`;
}

function campoPesoHtml(grupoId, item, valor) {
  const mostra = valor == null ? '' : String(Math.round(valor * 10000) / 100).replace('.', ',');
  return `<label class="mt-campo"><span>${esc(item.rotulo)}</span><span class="mt-entrada"><input data-campo="especificos.pesos.${grupoId}.${item.id}" data-formato="pct" inputmode="decimal" value="${esc(mostra)}"><span class="mt-sufixo">%</span></span></label>`;
}

/** Passo "Dados": nome + os pesos de cada grupo, com a soma ao vivo (data-dist-soma, atualizada por atualizarSomasDistribuicao). */
export function passoDadosDistribuicaoHtml(meta) {
  const pesos = pesosDaMeta(meta);
  const v = validarPesos(pesos);
  const grupos = GRUPOS_DISTRIBUICAO.map((g) => {
    const info = v.grupos.find((x) => x.id === g.id);
    return `<fieldset class="md-fieldset">
  <legend>${esc(g.titulo)} <span class="md-soma ${info.ok ? 'ok' : 'ruim'}" data-dist-soma="${g.id}">${fmtPct(info.soma)}</span></legend>
  <div class="mt-campos">${g.itens.map((i) => campoPesoHtml(g.id, i, pesos[g.id][i.id])).join('')}</div>
</fieldset>`;
  }).join('');
  return `<p class="mt-dialogo-dica">Quanto você quer ter em cada tipo de ativo. Cada grupo precisa somar 100%. Ao salvar, a planilha também é atualizada (as fórmulas dela usam esses %).</p>
<div class="mt-campos"><label class="mt-campo largo"><span>Nome da meta</span><input data-campo="nome" data-formato="texto" value="${esc(meta.nome || '')}" data-foco></label></div>
${grupos}`;
}

/** Atualiza as somas (e as cores) dentro do diálogo enquanto digita. */
export function atualizarSomasDistribuicao(raiz, meta) {
  if (!raiz) return validarPesos(pesosDaMeta(meta));
  const v = validarPesos(pesosDaMeta(meta));
  v.grupos.forEach((g) => {
    raiz.querySelectorAll(`[data-dist-soma="${g.id}"]`).forEach((el) => {
      el.textContent = fmtPct(g.soma);
      el.classList.toggle('ok', g.ok);
      el.classList.toggle('ruim', !g.ok);
    });
  });
  return v;
}

/** Texto do rodapé do assistente (prévia). */
export function previaDistribuicaoHtml(meta) {
  const v = validarPesos(pesosDaMeta(meta));
  if (v.ok) return 'todos os grupos somam <b>100%</b>';
  return `<span class="mt-ruim">${esc(v.mensagem)}</span>`;
}

/** Mensagem de erro do passo Dados (null se pode continuar). */
export function erroPassoDistribuicao(meta) {
  if (!String((meta && meta.nome) || '').trim()) return 'Dê um nome pra meta.';
  return validarPesos(pesosDaMeta(meta)).mensagem;
}

/** Passo "Revisar": pesos por grupo e, se a carteira atual já chegou, o aporte pra rebalancear. */
export function revisarDistribuicaoHtml(meta, dist, { seloHtml = '' } = {}) {
  const pesos = pesosDaMeta(meta);
  const v = validarPesos(pesos);
  const linhas = GRUPOS_DISTRIBUICAO.map((g) => [g.titulo, g.itens.map((i) => `${i.rotulo} ${fmtPct(pesos[g.id][i.id])}`).join(' · ')]);
  if (dist && dist.temDados) linhas.push(['Aporte pra rebalancear hoje', dist.aporteTotal > 0 ? `${formatBRL(dist.aporteTotal)} (carteira vai a ${formatBRL(dist.novoTotal)})` : 'nenhum - já está na meta']);
  return `<div class="mt-revisar" style="--mt-cor:var(--acoes);--mt-cor-soft:var(--acoes-soft)">
  <div class="mt-revisar-cab">${seloHtml}<div><strong>${esc(meta.nome || '(sem nome)')}</strong></div></div>
  <dl>${linhas.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd class="mono">${esc(val)}</dd></div>`).join('')}</dl>
  ${v.ok ? '' : `<p class="mt-alerta">${esc(v.mensagem)}</p>`}
  <p class="mt-nota">Ao salvar, os % também são gravados na planilha (aba Distribuição e Metas).</p>
</div>`;
}

/** Passo "Investimentos": esta meta olha a carteira inteira, não tem vínculos. */
export function passoVinculosDistribuicaoHtml() {
  return '<p class="mt-dialogo-dica">Esta meta não vincula investimentos: ela compara a carteira inteira (Ações, FIIs e Renda Fixa) com os pesos que você definiu. Siga para revisar.</p>';
}

// assets/js/pages/carteiras-proventos.js
//
// 25/09/2026 (Tiago): proventos nas Carteiras (Visão geral, Ações, FIIs e
// Ações Internacionais):
//  - no hero: quanto entrou NO MÊS e nos ÚLTIMOS 12 MESES (mesma janela
//    da tela Proventos: este mês + os 11 anteriores);
//  - abaixo da tabela de ativos: a área "Proventos do mês" da Início
//    (recebidos + a receber), só da carteira da página.
// Os números saem do histórico da Início (campos proventos* por dia de
// pagamento - os mesmos do gráfico e da tela Proventos) e a lista, de
// home.proventosAnunciados (Proventos.gs!montarProventosAnunciados_).
import { renderProventosAnunciados, linhaHtml_ } from './inicio-proventos.js';
import { resolveSiteRootUrl } from '../shell.js';
import { MESES_CURTOS, MESES_LONGOS_CAPITAL, formatMesAno, formatBRL, hojeSP } from '../format.js'; // 05/10/2026 (A-68)
import { getProventos } from '../api-client.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { normalizarPorData } from './proventos-calc.js';


const rotuloMes = (am) => formatMesAno(am);
function somarMeses(anoMes, n) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** Valor de provento do dia no campo pedido; 'proventosAcoesEuaUsd' = reais ÷ câmbio do dia. */
function valorDoDia(p, campo) {
  if (campo === 'proventosAcoesEuaUsd') {
    return typeof p.proventosAcoesEua === 'number' && typeof p.cambioUsd === 'number' && p.cambioUsd > 0 ? p.proventosAcoesEua / p.cambioUsd : 0;
  }
  return typeof p[campo] === 'number' && Number.isFinite(p[campo]) ? p[campo] : 0;
}

/**
 * { mes, doze, desdeInicio, mesAtual, inicio12 } - soma dos campos de
 * proventos no mês do último ponto do histórico (hoje), nos 12 meses que
 * terminam nele e desde o início. null sem histórico.
 */
export function proventosMesE12Meses(historico, campos) {
  if (!Array.isArray(historico) || !historico.length || !campos || !campos.length) return null;
  const mesAtual = String(historico[historico.length - 1].data || '').slice(0, 7);
  if (!mesAtual) return null;
  const inicio12 = somarMeses(mesAtual, -11);
  let mes = 0;
  let doze = 0;
  let desdeInicio = 0;
  historico.forEach((p) => {
    const m = String(p.data || '').slice(0, 7);
    const v = campos.reduce((s, c) => s + valorDoDia(p, c), 0);
    if (!v) return;
    desdeInicio += v;
    if (m >= inicio12 && m <= mesAtual) doze += v;
    if (m === mesAtual) mes += v;
  });
  const r2 = (n) => Math.round(n * 100) / 100;
  return { mes: r2(mes), doze: r2(doze), desdeInicio: r2(desdeInicio), mesAtual, inicio12 };
}

/**
 * Card KPI "Proventos no mês" (06/10/2026: era um stat do hero): valor = R$ do mês e, embaixo, "R$ ... em 12 meses". O total desde
 * o início fica no "i" (entra no Resultado desde o início). `botaoInfoHtml` segue no contrato por compatibilidade (o "i" agora é do KPI).
 * Devolve { rotulo, valor (número), formatar, sub, info, dados } - o formato que renderResumoClasseCarteiras/montarKpis esperam.
 */
export function statProventosHero(historico, campos, { formatar } = {}) {
  const p = proventosMesE12Meses(historico, campos);
  if (!p) return null;
  const fmt = formatar || String;
  return {
    rotulo: 'Proventos no mês',
    label: 'Proventos no mês',
    valor: p.mes,
    formatar: fmt,
    sub: `${fmt(p.doze)} em 12 meses`,
    info: `${fmt(p.mes)} recebidos em ${rotuloMes(p.mesAtual)}; ${fmt(p.doze)} de ${rotuloMes(p.inicio12)} a ${rotuloMes(p.mesAtual)} (os 12 meses que terminam no mês atual, ainda em curso - é a janela do total "12 meses" da tela Proventos; a média mensal e a meta de Renda Passiva usam só os 12 meses fechados). Desde o início: ${fmt(p.desdeInicio)}.`,
    dados: p,
  };
}

/**
 * HTML da área "Proventos do mês" (vai ao lado do "por setor/tipo", abaixo da tabela de ativos): seção recolhível, escondida até haver
 * o que mostrar. `navegacao` (06/10/2026, Tiago: "me dê a opção de navegar por meses anteriores"): barra ‹ mês › + escolher mês.
 */
export function secaoProventosCarteiraHtml(id, { navegacao = false } = {}) {
  let href = '../proventos/index.html';
  try { href = new URL('proventos/index.html', resolveSiteRootUrl()).href; } catch (e) { /* mantém o relativo */ }
  const nav = navegacao ? `
        <div class="cc-prov-nav" role="group" aria-label="Mês dos proventos">
          <button type="button" class="icon-btn icon-btn-tonal" data-prov-nav="ant" aria-label="Mês anterior"><svg class="ico" aria-hidden="true"><use href="#ico-chevron-left"/></svg></button>
          <label class="cc-prov-mes"><span class="sr-only">Escolher mês</span><select class="select" data-prov-nav="mes"></select></label>
          <button type="button" class="icon-btn icon-btn-tonal cc-prov-prox" data-prov-nav="prox" aria-label="Próximo mês"><svg class="ico" aria-hidden="true"><use href="#ico-chevron-left"/></svg></button>
          <button type="button" class="btn btn-text btn-sm" data-prov-nav="atual" hidden>Mês atual</button>
        </div>` : '';
  return `
    <details class="cc-recolhivel cc-proventos proventos-secao" data-secao="proventos" id="${id}" hidden>
      <summary><span class="cc-recolhivel-titulo">Proventos do mês</span><svg class="ico cc-recolhivel-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary>
      <div class="cc-recolhivel-corpo">
        <a class="cc-proventos-link" href="${href}">Ver a agenda completa em Proventos <svg class="ico" aria-hidden="true"><use href="#ico-arrow-forward"/></svg></a>${nav}
        <div class="prov-card prov-corpo"></div>
      </div>
    </details>`;
}

// ---------------------------------------------------------------------------
// Navegação por meses anteriores (06/10/2026). O mês atual usa a resposta da Início (proventosAnunciados); os anteriores usam a ação
// existente "proventos" (getProventos: a lista `recebidos` desde o início - a mesma da tela Proventos, com cache compartilhado
// 'proventos'), pedida só na 1ª vez que o Tiago sai do mês atual.
// ---------------------------------------------------------------------------
const FONTE = { token: null, getProventosImpl: getProventos };
const ESTADO_MES = {}; // id da seção -> mês escolhido (sobrevive ao redesenho da página)
let historicoProvEmMemoria = null; // última resposta de getProventos (normalizada)
let historicoProvPedido = null;

/** A página diz de onde vêm os meses anteriores (token do login + implementação injetável nos testes). */
export function definirFonteProventos(token, getProventosImpl) {
  FONTE.token = token || null;
  FONTE.getProventosImpl = getProventosImpl || getProventos;
}

/** Só testes: zera o que ficou guardado entre páginas. */
export function reiniciarNavegacaoProventos_() {
  Object.keys(ESTADO_MES).forEach((k) => delete ESTADO_MES[k]);
  historicoProvEmMemoria = null; historicoProvPedido = null;
}

/** 'yyyy-MM' do mês seguinte/anterior. */
export const mesVizinho = (anoMes, n) => somarMeses(anoMes, n);

/** Nome do mês: "Setembro de 2026". */
export function nomeMesLongo(anoMes) {
  const [a, m] = String(anoMes).split('-').map(Number);
  return `${MESES_LONGOS_CAPITAL[(m || 1) - 1]} de ${a}`;
}

/** Itens recebidos de `anoMes` nas `classes` (null = todas), do mais recente pro mais antigo, no formato da linha de provento. */
export function recebidosDoMes(historico, anoMes, classes = null) {
  const lista = (historico && historico.recebidos) || [];
  return lista
    .filter((p) => String(p.data || '').slice(0, 7) === anoMes && (!classes || classes.includes(p.classe)))
    .map((p) => ({ ...p, dataPagamento: p.data }))
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : String(a.ticker).localeCompare(String(b.ticker))));
}

/** Meses (do atual pra trás) até o mais antigo com provento nas `classes`; sem histórico, os 12 últimos. */
export function mesesNavegaveis(historico, mesAtual, classes = null) {
  let menor = somarMeses(mesAtual, -11);
  ((historico && historico.recebidos) || []).forEach((p) => {
    const m = String(p.data || '').slice(0, 7);
    if (m && m < menor && (!classes || classes.includes(p.classe))) menor = m;
  });
  const meses = [];
  for (let m = mesAtual; m >= menor; m = somarMeses(m, -1)) meses.push(m);
  return meses;
}

function obterHistoricoProventos_() {
  if (historicoProvEmMemoria) return Promise.resolve(historicoProvEmMemoria);
  if (!historicoProvPedido) {
    historicoProvPedido = (async () => {
      const cache = await lerCacheDados('proventos');
      if (cache && cache.dados && Array.isArray(cache.dados.recebidos)) historicoProvEmMemoria = normalizarPorData(cache.dados);
      const rede = (async () => {
        let r = null;
        try { r = await FONTE.getProventosImpl(FONTE.token); } catch (e) { r = null; }
        if (r && r.ok !== false && Array.isArray(r.recebidos)) {
          gravarCacheDados('proventos', r);
          historicoProvEmMemoria = normalizarPorData(r);
        } else if (!historicoProvEmMemoria) throw new Error('proventos');
        return historicoProvEmMemoria;
      })();
      // stale-while-revalidate: com cache, mostra já e atualiza por trás
      if (historicoProvEmMemoria) { rede.catch(() => {}); return historicoProvEmMemoria; }
      return rede;
    })().finally(() => { historicoProvPedido = null; });
  }
  return historicoProvPedido;
}

function htmlMesAnterior_(lista, anoMes) {
  const total = Math.round(lista.reduce((s, p) => s + (typeof p.valor === 'number' ? p.valor : 0), 0) * 100) / 100;
  if (!lista.length) return `<p class="hint cc-prov-vazio">Nenhum provento recebido em ${nomeMesLongo(anoMes)}.</p>`;
  return `
    <div class="prov-resumo">
      <span class="prov-stat"><small>Recebido em ${nomeMesLongo(anoMes)}</small> <b class="good">${formatBRL(total)}</b></span>
      <span class="prov-stat"><small>Pagamentos</small> <b>${lista.length}</b></span>
    </div>
    <ul class="prov-lista lista-resumo">${lista.map((p) => linhaHtml_(p, { modo: 'recebido' })).join('')}</ul>`;
}

/** Liga a barra ‹ mês › da seção (criada por secaoProventosCarteiraHtml(id, { navegacao: true })). Devolve { irPara(mes) } ou null. */
function ligarNavegacao_(doc, secao, proventosAnunciados, { classes, hoje }) {
  const barra = secao.querySelector('.cc-prov-nav');
  if (!barra) return null;
  const corpo = secao.querySelector('.prov-corpo');
  const mesAtual = hojeSP(hoje);
  const atualMes = mesAtual.slice(0, 7);
  const $ = (k) => barra.querySelector(`[data-prov-nav="${k}"]`);
  const select = $('mes');
  let mes = ESTADO_MES[secao.id] || atualMes;
  let seq = 0;

  function preencherSelect_(historico) {
    const meses = mesesNavegaveis(historico, atualMes, classes);
    if (!meses.includes(mes)) meses.push(mes);
    select.replaceChildren();
    meses.forEach((m) => {
      const o = doc.createElement('option'); o.value = m; o.textContent = nomeMesLongo(m);
      select.append(o);
    });
    select.value = mes;
  }
  function atualizarControles_() {
    select.value = mes;
    $('ant').disabled = false;
    $('prox').disabled = mes >= atualMes;
    $('atual').hidden = mes === atualMes;
    ESTADO_MES[secao.id] = mes;
  }
  async function mostrar_() {
    const minha = ++seq;
    atualizarControles_();
    if (mes === atualMes) { renderProventosCarteiraMesAtual_(doc, secao, proventosAnunciados, { classes, hoje }); return; }
    corpo.innerHTML = '<p class="hint cc-prov-vazio" role="status">Carregando proventos…</p>';
    try {
      const hist = await obterHistoricoProventos_();
      if (minha !== seq) return;
      preencherSelect_(hist);
      corpo.innerHTML = htmlMesAnterior_(recebidosDoMes(hist, mes, classes), mes);
    } catch (e) {
      if (minha !== seq) return;
      corpo.innerHTML = '<p class="hint cc-prov-vazio" role="alert">Não deu pra carregar o histórico de proventos agora. <button type="button" class="btn btn-text btn-sm" data-prov-tentar>Tentar de novo</button></p>';
      corpo.querySelector('[data-prov-tentar]').addEventListener('click', () => mostrar_());
    }
  }
  function irPara(novo) { mes = novo > atualMes ? atualMes : novo; mostrar_(); }
  $('ant').addEventListener('click', () => irPara(somarMeses(mes, -1)));
  $('prox').addEventListener('click', () => irPara(somarMeses(mes, 1)));
  $('atual').addEventListener('click', () => irPara(atualMes));
  select.addEventListener('change', () => irPara(select.value));
  preencherSelect_(historicoProvEmMemoria);
  mostrar_();
  return { irPara };
}

function renderProventosCarteiraMesAtual_(doc, secao, proventosAnunciados, { classes, hoje }) {
  const d = proventosAnunciados || {};
  const filtrar = (lista) => (Array.isArray(lista) ? lista.filter((p) => !classes || classes.includes(p.classe)) : []);
  renderProventosAnunciados(doc, secao, {
    aReceber: filtrar(d.aReceber),
    recebidosNoMes: filtrar(d.recebidosNoMes),
    pagosNaoLancados: filtrar(d.pagosNaoLancados),
  }, { hoje });
  // com a navegação, a seção fica sempre visível (dá pra ir a meses anteriores mesmo sem nada neste mês)
  if (secao.querySelector('.cc-prov-nav') && secao.hidden) {
    secao.hidden = false;
    const corpo = secao.querySelector('.prov-corpo');
    if (corpo) corpo.innerHTML = '<p class="hint cc-prov-vazio">Nenhum provento neste mês ainda. Use as setas pra ver meses anteriores.</p>';
  }
}

/**
 * Desenha a área com os proventos da(s) classe(s) da página. `classes` null = todas (Visão geral). Sem navegação por meses, some quando
 * não há nada no mês; com ela (seção criada com { navegacao: true }), fica visível e o mês atual vem de `proventosAnunciados`.
 */
export function renderProventosCarteira(doc, secao, proventosAnunciados, { classes = null, hoje = new Date() } = {}) {
  if (!secao) return;
  if (secao.querySelector('.cc-prov-nav')) { ligarNavegacao_(doc, secao, proventosAnunciados, { classes, hoje }); return; }
  renderProventosCarteiraMesAtual_(doc, secao, proventosAnunciados, { classes, hoje });
}

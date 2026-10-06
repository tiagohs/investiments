// assets/js/pages/proventos.js
//
// 24/09/2026: tela Proventos (menu principal) - Tiago: "Consolidado" e
// "Agenda", com filtro pelo tipo de ativo (Todas / Ações / FIIs / Ações EUA)
// valendo nas 2 abas. As contas ficam em proventos-calc.js (puras, testadas);
// aqui só desenha e liga os cliques.
//
// 06/10/2026 (Onda 3, kit Figma "Material You"): tela migrada pro M3 - só
// APRESENTAÇÃO, nenhuma conta mudou:
//  - cabeçalho padrão (montarCabecalhoPagina): título, subtítulo com o número-
//    chave, "Atualizar dados", "Importar B3" e as abas em pílula
//    Consolidado | Agenda (subpáginas); a carteira (Todas/Ações/FIIs/EUA) é
//    recorte, então vira aba sublinhada;
//  - cartões KPI do kit (criarKpi, com sparkline do histórico);
//  - "Histórico mensal" = biblioteca de gráficos (barras empilhadas, tooltip,
//    "Ver como tabela" no menu do cartão); período = segmentado canônico +
//    "Escolher período" (periodo-personalizado.js);
//  - "Por ativo" e "Agenda" = tabela do kit (.tabela): ticker pequeno acima do
//    nome, chips tonais, "•••" com menu e, no celular, só as colunas
//    essenciais - o resto abre ao tocar na linha (folha);
//  - importar a B3 confirma com confirmar() e avisa com toast(); falha de
//    carga = mostrarErroCarga ("Tentar de novo"), detalhe técnico recolhido.
import { getProventos, importarProventosB3 } from '../api-client.js';
import { formatBRL, formatNumeroBR, hojeSP, formatUSD as usd, formatNumeroPt, formatDM, formatDMA } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { ligarFiltroPeriodo, ehPeriodoPersonalizado, botoesSegmentadoHtml } from '../periodo-personalizado.js'; // 02/10/2026: "Escolher período"
import { renderAnalise, analisarRendaPassiva, complementarAnalise } from '../analise-grafico.js'; // 02/10/2026: card de Análise embaixo do Histórico mensal
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { logoAtivoHtml } from './carteiras-pecas.js';
import { urlAtivoTicker, linkAtivoComNovaAbaHtml } from '../link-ativo.js'; // 25/09/2026
import { criarGraficoBarras, criarKpi, garantirEstilosCharts } from '../charts/index.js'; // 06/10/2026 (Onda 3)
import { montarCabecalhoPagina, criarTabs, confirmar, abrirFolha, toast, mostrarErroCarga, mostrarEstadoVazio, ligarMenu, criar as criarUi, icone as iconeUi } from '../ui/index.js'; // 06/10/2026 (Onda 3)
import {
  CLASSES, NOME_CLASSE, COR_CLASSE, PERIODOS, MESES_CURTOS, MESES_LONGOS,
  resumoConsolidado, historicoMensal, rankingPorAtivo, receitaFutura, rotuloMes,
  itensAgenda, anosDaAgenda, contagemPorMes, filtrarAgenda, previaExportacaoB3,
  normalizarPorData, hojeSaoPaulo, resumoConferencia, iconeConferenciaHtml, // 02/10/2026: pago presumido / conferência B3
  filtrarClasse, proventosPorMes, analisarProventosMensais, somarMeses, // 02/10/2026: análise do histórico mensal
} from './proventos-calc.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único


const CHAVE_CACHE = 'proventos';
const CHAVE_PREFS = 'proventos.prefs.v1';
const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const LIMITE_RANKING = 10;
const SECAO = 'Proventos';

const pct = (v, casas = 2) => (typeof v === 'number' && Number.isFinite(v) ? `${formatNumeroBR(v, casas)}%` : '—');
const qtdTxt = (q) => (typeof q === 'number' && q > 0 ? formatNumeroBR(q, q % 1 ? 4 : 0) : '—');
const ic = (nome, classe = 'ico') => `<svg class="${classe}" aria-hidden="true"><use href="#ico-${nome}"/></svg>`;

function lerPrefs() {
  try { return JSON.parse(globalThis.localStorage.getItem(CHAVE_PREFS) || '{}') || {}; } catch (e) { return {}; }
}
function gravarPrefs(estado) {
  try {
    globalThis.localStorage.setItem(CHAVE_PREFS, JSON.stringify({ aba: estado.aba, classe: estado.classe, periodo: estado.periodo, agrupar: estado.agrupar }));
  } catch (e) { /* só conveniência */ }
}

const numeroCota = (v) => formatNumeroPt(v, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function valorPorCotaTxt(p) {
  if (!(typeof p.valorPorCota === 'number' && p.valorPorCota > 0)) return '—';
  return `${p.moeda === 'USD' ? 'US$' : 'R$'} ${numeroCota(p.valorPorCota)}`;
}

/**
 * 06/10/2026: cor das classes/grupos do cálculo ('--acoes', '--cat-3'...) -> paleta categórica do kit
 * (--chart-N, ordem fixa: 1 Ações, 2 FIIs, 4 EUA). "Outros" é o cinza do eixo.
 */
export function corGrafico(cor) {
  if (cor === '--acoes') return 'var(--chart-1)';
  if (cor === '--fiis') return 'var(--chart-2)';
  if (cor === '--usa') return 'var(--chart-4)';
  const m = /^--cat-(\d)$/.exec(cor || '');
  if (m) return `var(--chart-${m[1]})`;
  return 'var(--chart-axis)';
}
const bolinha = (cor) => `<span class="pv-dot" style="background:${corGrafico(cor)}"></span>`;

// ---------------------------------------------------------------------------
// Filtros (carteira) - abas sublinhadas: são recortes da mesma subpágina
// ---------------------------------------------------------------------------

function montarFiltroClasse(doc, el, estado, redesenhar) {
  const itens = [{ id: 'todas', rotulo: 'Todas' }, ...CLASSES.map((c) => ({ id: c.id, rotulo: c.nome }))];
  criarTabs(el, {
    variante: 'sublinhada', rotulo: 'Carteira', itens, ativo: estado.classe, idBase: 'pvClasse',
    aoMudar(id) { estado.classe = id; estado.rankingTodos = false; redesenhar(); },
    doc,
  });
}

/** Foco do teclado sobrevive ao redesenho (a tela inteira é refeita a cada filtro). */
const ATRIBUTOS_FOCO = ['data-tab', 'data-periodo', 'data-id', 'data-status', 'data-ano', 'data-agrupar'];
function chaveFoco(doc, raiz) {
  const a = doc.activeElement;
  if (!a || !raiz.contains(a)) return null;
  const grupo = a.closest('[aria-label]');
  for (const attr of ATRIBUTOS_FOCO) {
    if (a.hasAttribute(attr)) return { attr, valor: a.getAttribute(attr), grupo: grupo ? grupo.getAttribute('aria-label') : null };
  }
  return null;
}
function restaurarFoco(raiz, chave) {
  if (!chave) return;
  const candidatos = [...raiz.querySelectorAll(`[${chave.attr}="${chave.valor}"]`)];
  const alvo = candidatos.find((c) => { const g = c.closest('[aria-label]'); return (g ? g.getAttribute('aria-label') : null) === chave.grupo; }) || candidatos[0];
  if (alvo && typeof alvo.focus === 'function') alvo.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Consolidado
// ---------------------------------------------------------------------------

/** Cartões KPI do kit (criarKpi): rótulo, número grande, linha de apoio e sparkline do histórico. */
function desenharKpis(doc, el, r, periodoId, mesNome, hist, graficos) {
  const e12 = periodoId === '12m';
  const faixa = (a, b) => (a === b ? rotuloMes(b) : `${rotuloMes(a)} a ${rotuloMes(b)}`);
  const presumido = e12 && r.rendaMesPresumido > 0
    ? ` <span class="pv-card-presumido" title="Pago presumido pela data de pagamento (ainda sem lançamento/extrato da B3): ${formatBRL(r.rendaMesPresumido)}; confirmado: ${formatBRL(r.rendaMesConfirmado)}">(${formatBRL(r.rendaMesPresumido)} presumido)</span>`
    : '';
  const cartoes = [
    { classe: 'pv-card', rotulo: 'Valor aplicado', valor: r.aplicado, formatar: formatBRL, info: 'Quanto você aplicou nos ativos da carteira escolhida.', sub: `Aportes em 12 meses: <b>${formatBRL(r.aportes12m)}</b>` },
    { classe: 'pv-card pv-card-destaque', rotulo: `Renda · ${faixa(r.primeiroMes, r.ultimoMes)}`, valor: r.renda, formatar: formatBRL, info: 'Proventos recebidos no período, incluindo os pagos presumidos pela data de pagamento.', sub: e12 ? `Em ${mesNome}: <b>${formatBRL(r.rendaMes)}</b>${presumido}` : `12 meses: <b>${formatBRL(r.renda12m)}</b>`, spark: hist.totais.length >= 2 ? hist.totais : null },
    { classe: 'pv-card', rotulo: 'Média mensal', valor: r.media, formatar: formatBRL, info: 'Média dos meses fechados do período (o mês em andamento não entra).', sub: `${faixa(r.mediaInicio, r.mediaFim)} · meses fechados${e12 ? '' : ` · 12 meses: <b>${formatBRL(r.media12m)}</b>`}` },
    { classe: 'pv-card', rotulo: 'Yield on cost', valor: Number.isFinite(r.yoc) ? r.yoc : '—', formatar: (v) => pct(v), info: 'Renda de 12 meses dividida pelo valor aplicado (o que você pagou pelos ativos).', sub: e12 ? 'renda de 12 meses ÷ valor aplicado' : `12 meses: <b>${pct(r.yoc12m)}</b>` },
    { classe: 'pv-card', rotulo: 'A receber', valor: r.aReceber, formatar: formatBRL, info: 'Proventos anunciados que ainda vão ser pagos.', sub: `Neste mês: <b>${formatBRL(r.aReceberEsteMes)}</b>` },
  ];
  cartoes.forEach((c) => {
    const celula = criarUi(doc, 'div', { class: c.classe });
    el.append(celula);
    const kpi = criarKpi(celula, { rotulo: c.rotulo, valor: c.valor, formatar: c.formatar, info: c.info, spark: c.spark ? { valores: c.spark, cor: 1, aria: 'Renda mês a mês no período' } : null });
    const sub = criarUi(doc, 'div', { class: 'pv-card-sub' });
    sub.innerHTML = c.sub;
    const spark = kpi.el.querySelector('.chart-kpi-spark');
    if (spark) kpi.el.insertBefore(sub, spark); else kpi.el.append(sub);
    graficos.push(kpi);
  });
}

/**
 * 02/10/2026 (Tiago: "se a data de pagamento já passou, deduz que está
 * pago. Eu mando no final do mês [o arquivo da B3] e você faz o check
 * final"): uma linha discreta abaixo dos cartões - quanto dos totais é pago
 * presumido e o resultado da última conferência; o que pede atenção
 * (valor diferente / não confirmado) abre numa lista curta.
 */
function conferenciaHtml(c) {
  const partes = [];
  if (c.presumidos.quantidade) {
    partes.push(`${iconeConferenciaHtml({ conferencia: 'presumido' })}<span><b>${c.presumidos.quantidade}</b> pago${c.presumidos.quantidade === 1 ? '' : 's'} presumido${c.presumidos.quantidade === 1 ? '' : 's'} (${formatBRL(c.presumidos.total)}) aguardando o extrato da B3</span>`);
  }
  if (c.ultimoPeriodo) {
    const p = c.ultimoPeriodo;
    const conferido = p.conferidoEm ? ` em ${formatDM(p.conferidoEm)}` : '';
    partes.push(`${iconeConferenciaHtml({ conferencia: 'confirmado' })}<span>${esc(rotuloMes(p.mes))} conferido com a B3${conferido}: <b>${p.confirmados}</b> confirmado${p.confirmados === 1 ? '' : 's'}${p.divergentes ? ` · <b>${p.divergentes}</b> com valor diferente` : ''}${p.naoConfirmados ? ` · <b>${p.naoConfirmados}</b> não confirmado${p.naoConfirmados === 1 ? '' : 's'}` : ''}${p.extras ? ` · <b>${p.extras}</b> no extrato e não lançado${p.extras === 1 ? '' : 's'}` : ''}</span>`);
  }
  if (!partes.length) return '';
  const atencao = [
    ...c.divergentes.map((d) => `<li>${iconeConferenciaHtml({ ...d, conferencia: 'divergente' })}<b>${esc(d.ticker)}</b> ${formatDM(d.dataPagamento)} · previsto ${formatBRL(d.valor)} · B3 ${formatBRL(d.valorB3)}${d.dataB3 && d.dataB3 !== d.dataPagamento ? ` em ${formatDM(d.dataB3)}` : ''}</li>`),
    ...c.naoConfirmados.map((d) => `<li>${iconeConferenciaHtml({ conferencia: 'nao_confirmado' })}<b>${esc(d.ticker)}</b> ${formatDM(d.dataPagamento)} · ${formatBRL(d.valor)} · não veio no extrato${d.contando ? ' (lançado: continua no total)' : ' (fora do total)'}</li>`),
  ];
  return `
    <div class="pv-conf-faixa">
      ${partes.map((x) => `<span class="pv-conf-item">${x}</span>`).join('')}
      ${atencao.length ? `<details class="pv-conf-det"><summary>ver ${atencao.length} pra conferir</summary><ul>${atencao.join('')}</ul></details>` : ''}
    </div>`;
}

/**
 * Histórico mensal: barras empilhadas da biblioteca (charts/barras.js). "Agrupar por" usa o segmentado do próprio
 * cartão (✓ no ativo); "Ver como tabela" vem no menu "•••" do cartão. Abaixo, a legenda com o total de cada grupo.
 */
function desenharHistorico(doc, slot, hist, estado, redesenhar, graficos) {
  slot.innerHTML = '';
  const total = hist.totais.reduce((s, v) => s + v, 0);
  if (!(total > 0)) {
    const vazio = criarUi(doc, 'div', { class: 'card' });
    slot.append(vazio);
    const acao = estado.periodo !== 'inicio' ? { rotulo: 'Ver desde o início', aoClicar: () => { const f = doc.getElementById('pvPeriodo'); if (f && f._filtroPeriodo) f._filtroPeriodo.definir('inicio'); } } : null;
    mostrarEstadoVazio(vazio, { icone: 'savings', titulo: 'Nenhum provento recebido neste período', texto: 'Quando um provento for pago, ele aparece aqui mês a mês.', acao, doc });
    return;
  }
  const grafico = criarGraficoBarras(slot, {
    modo: 'empilhadas',
    categorias: hist.meses.map((m) => rotuloMes(m)),
    series: hist.grupos.map((g) => ({ id: g.id, nome: g.rotulo, cor: corGrafico(g.cor), valores: hist.valores[g.id].slice() })),
    formatarValor: formatBRL,
    formatarX: (_cat, i) => `${MESES_LONGOS[Number(hist.meses[i].slice(5, 7)) - 1]} de ${hist.meses[i].slice(0, 4)}`,
    tooltipExtra: (i) => (hist.presumidos && hist.presumidos[i] > 0 ? [{ nome: 'inclui presumido', valor: formatBRL(hist.presumidos[i]) }] : []),
    altura: 260, legenda: false, aria: 'Proventos recebidos por mês',
    card: {
      rotulo: 'Proventos recebidos por mês', valor: 'Histórico mensal',
      periodos: [{ id: 'classe', rotulo: 'Classe' }, { id: 'tipo', rotulo: 'Tipo' }, { id: 'ativo', rotulo: 'Ativo' }], periodo: estado.agrupar,
      aoMudarPeriodo: (id) => { estado.agrupar = id; redesenhar(); },
    },
  });
  graficos.push(grafico);
  const card = grafico.card;
  card.raiz.id = 'pvHistCard';
  const seg = card.raiz.querySelector('.chart-seg');
  if (seg) seg.setAttribute('aria-label', 'Agrupar por');
  const legenda = criarUi(doc, 'div', { class: 'pv-legenda', id: 'pvHistLegenda' });
  legenda.innerHTML = hist.grupos.map((g) => {
    const t = hist.valores[g.id].reduce((s, v) => s + v, 0);
    return `<span class="pv-legenda-item">${bolinha(g.cor)}${esc(g.rotulo)} <b>${formatBRL(t)}</b></span>`;
  }).join('');
  card.raiz.append(legenda);
}

/** Linha de uma seção recolhível (<details>): no celular as seções longas abrem fechadas. */
function secaoHtml(id, titulo, dica, corpoHtml, aberta) {
  return `
    <details class="card pv-sec" data-secao="${id}"${aberta ? ' open' : ''} aria-labelledby="${id}Titulo">
      <summary class="pv-sec-cab"><span><h3 id="${id}Titulo">${titulo}</h3>${dica ? `<span class="pv-dica">${dica}</span>` : ''}</span>${ic('expand-more', 'ico pv-sec-seta')}</summary>
      <div class="pv-sec-corpo">${corpoHtml}</div>
    </details>`;
}

function celulaAtivoHtml(ticker, nome, classe, pgtoMini = '', marca = '') {
  return `<div class="cel-ativo">${logoAtivoHtml(ticker)}<div class="cel-ativo-textos"><b class="cel-ativo-ticker">${marca}${linkAtivoComNovaAbaHtml(urlAtivoTicker(ticker), esc(ticker), ticker)}</b><span class="cel-ativo-nome">${esc(nome || NOME_CLASSE[classe] || '')}</span>${pgtoMini}</div></div>`;
}

const BOTAO_MENU = (rotulo) => `<button type="button" class="icon-btn pv-menu-btn" data-menu aria-label="${esc(rotulo)}">${ic('more-vert')}</button>`;

function rankingHtml(lista, mostrarTodos) {
  if (!lista.length) return '<div class="pv-vazio-slot" data-vazio="ranking"></div>';
  const visiveis = mostrarTodos ? lista : lista.slice(0, LIMITE_RANKING);
  return `
    <div class="card card-flat">
      <div class="tabela-wrap">
        <table class="tabela tabela-baixa pv-rank-tabela">
          <thead><tr><th>Ativo</th><th class="num">Recebido</th><th class="num col-opc">Parte</th><th class="sr-only col-opc">Ações</th></tr></thead>
          <tbody>${visiveis.map((a) => `
            <tr class="pv-rank-item" data-ticker="${esc(a.ticker)}" aria-label="${esc(a.ticker)}: ${formatBRL(a.total)}, ${pct(a.pct, 1)} do total">
              <td>${celulaAtivoHtml(a.ticker, a.nome, a.classe, '', bolinha(COR_CLASSE[a.classe]))}</td>
              <td class="num"><b>${formatBRL(a.total)}</b></td>
              <td class="num col-opc pv-parte"><span class="pv-rank-pct">${pct(a.pct, 1)}</span><span class="barra-fina" aria-hidden="true"><span style="--p:${Math.max(1.5, a.pct || 0).toFixed(1)}%;background:${corGrafico(COR_CLASSE[a.classe])}"></span></span></td>
              <td class="col-opc pv-col-menu">${BOTAO_MENU(`Mais ações de ${a.ticker}`)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>
    ${lista.length > LIMITE_RANKING ? `<button type="button" class="btn btn-text pv-mais" data-acao="ranking">${mostrarTodos ? 'Mostrar menos' : `Ver todos os ${lista.length}`}</button>` : ''}`;
}

function linhasDetalheHtml(linhas) {
  return `<dl class="pv-det">${linhas.map(([k, v]) => `<div class="pv-det-linha"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function detalheAtivoHtml(a) {
  const pm = a.precoMedio ? (a.moeda === 'USD' ? usd(a.precoMedio) : formatBRL(a.precoMedio)) : '—';
  return `
    <div class="pv-det-cab">${logoAtivoHtml(a.ticker)}<span>${a.nome ? esc(a.nome) : esc(a.ticker)}<small>${esc(NOME_CLASSE[a.classe] || '')}</small></span></div>
    ${linhasDetalheHtml([
    ['Recebido no período', `${formatBRL(a.total)} · ${a.pagamentos} pagto${a.pagamentos === 1 ? '' : 's'}`],
    ['Parte dos proventos', pct(a.pct, 1)],
    ['Quantidade atual', a.naCarteira ? qtdTxt(a.quantidade) : 'vendido'],
    ['Preço médio', pm],
    ['Yield on cost (12 meses)', pct(a.yoc12m)],
    ['Dividend yield', pct(a.dy)],
    ['Total desde o início', formatBRL(a.totalDesdeInicio)],
  ])}
    <a class="btn btn-tonal pv-det-abrir" href="${esc(urlAtivoTicker(a.ticker))}">Abrir página do ativo</a>`;
}

function abrirDetalhe(doc, { titulo, html }) {
  const conteudo = criarUi(doc, 'div', { class: 'pv-folha' });
  conteudo.innerHTML = html;
  return abrirFolha({ titulo, conteudo, acoes: [{ id: 'fechar', rotulo: 'Fechar', classe: 'btn-text', valor: true, foco: true }], doc });
}

function futuroHtml(f) {
  const tile = (rotulo, v) => `<div class="pv-futuro-tile"><span>${rotulo}</span><b>${formatBRL(v)}</b></div>`;
  const prox = f.proximos.slice(0, 6);
  const item = (p, meta, valor) => `<li class="lista-item"><span class="lista-item-textos"><span class="lista-item-nome">${bolinha(COR_CLASSE[p.classe])}<b>${esc(p.ticker)}</b></span><span class="lista-item-sub">${meta}</span></span><span class="pv-lista-valor">${valor}</span></li>`;
  return `
    <div class="pv-futuro-tiles">
      ${tile('Próximos 30 dias', f.d30)}
      ${tile('Próximos 3 meses', f.d90)}
      ${tile('Próximos 12 meses', f.d365)}
    </div>
    ${f.qtdSemData ? `<p class="pv-nota">+ ${formatBRL(f.semData)} anunciados sem data de pagamento (${f.qtdSemData}).</p>` : ''}
    <h4 class="pv-subtitulo">Próximos pagamentos</h4>
    ${prox.length ? `<ul class="lista-resumo">${prox.map((p) => item(p, `${formatDM(p.dataPagamento)} · ${esc(p.tipo)}`, formatBRL(p.valor))).join('')}</ul>`
    : '<p class="pv-vazio">Nenhum pagamento anunciado.</p>'}
    <h4 class="pv-subtitulo">Data com futura</h4>
    ${f.datasComFuturas.length ? `<ul class="lista-resumo">${f.datasComFuturas.slice(0, 6).map((p) => item(p, `tenha até ${formatDM(p.dataCom)} · paga ${formatDM(p.dataPagamento)}`, `${valorPorCotaTxt(p)}/cota`)).join('')}</ul>`
    : '<p class="pv-vazio">Nenhuma data com anunciada à frente.</p>'}`;
}

/**
 * 02/10/2026 (Tiago: "Adicionar em todos os filtros dos gráficos a opção
 * 'Escolher período'"): o período do Consolidado pode ser um intervalo
 * { inicio, fim } do calendário - cartões, barras e ranking usam os MESES
 * que tocam o intervalo (o gráfico é mensal; ver proventos-calc!mesesDoIntervalo).
 */
function periodoDoEstado(estado) {
  if (ehPeriodoPersonalizado(estado.periodo)) return { id: estado.periodo, nome: 'Período escolhido', personalizado: true };
  return PERIODOS.find((p) => p.id === estado.periodo) || PERIODOS[1];
}

/** { min, max } do calendário: do 1º provento recebido até hoje. */
export function limitesPeriodoProventos(dados) {
  const datas = (dados.recebidos || []).map((p) => p.data).filter((d) => typeof d === 'string' && d <= dados.hoje).sort();
  return { min: datas[0] || `${dados.hoje.slice(0, 4)}-01-01`, max: dados.hoje };
}

function mesesEntre(inicio, fim) {
  const lista = [];
  for (let m = inicio; m <= fim && lista.length < 600; m = somarMeses(m, 1)) lista.push(m);
  return lista;
}

/** Análise do Histórico mensal (mesma janela e carteira do gráfico). */
export function analiseHistoricoProventos(dados, estado, hist, r) {
  const porMes = proventosPorMes(filtrarClasse(dados.recebidos, estado.classe), dados.hoje);
  // a média é a MESMA do cartão "Média mensal" (meses fechados do período)
  const mesesFechados = r.mediaInicio && r.mediaFim ? mesesEntre(r.mediaInicio, r.mediaFim) : null;
  const base = analisarProventosMensais({ porMes, meses: hist.meses, mesAtual: dados.hoje.slice(0, 7), aReceberMes: r.aReceberEsteMes || 0, mesesFechados });
  // 03/10/2026 (base de critérios de rentabilidade - Baroni/Suno: "somar
  // tudo que recebeu por ano"): renda dos 12 meses fechados x os 12
  // anteriores (só com 24 meses de histórico).
  return complementarAnalise(base, analisarRendaPassiva({ porMes, mesAtual: dados.hoje.slice(0, 7) }));
}

function renderConsolidado(doc, el, dados, estado, redesenhar, filtrosEl, graficos) {
  const periodo = periodoDoEstado(estado);
  const r = resumoConsolidado(dados, { classe: estado.classe, periodoId: periodo.id });
  const hist = historicoMensal(dados, { classe: estado.classe, periodoId: periodo.id, agrupar: estado.agrupar });
  const ranking = rankingPorAtivo(dados, { classe: estado.classe, periodoId: periodo.id });
  const futuro = receitaFutura(dados, { classe: estado.classe });
  el.innerHTML = `
    <div class="pv-kpis" id="pvKpis"></div>
    ${conferenciaHtml(resumoConferencia(dados, { classe: estado.classe }))}
    <div class="pv-hist" id="pvHist"><div id="pvHistSlot"></div><div class="ag-slot pv-hist-analise" id="pvHistAnalise" hidden></div></div>
    <div class="pv-duas">
      ${secaoHtml('pvRank', 'Por ativo', 'toque numa linha pra ver o detalhe', `<div id="pvRanking">${rankingHtml(ranking, estado.rankingTodos)}</div>`, estado.secoes.ranking)}
      ${secaoHtml('pvFut', 'Receita futura', 'anunciados', futuroHtml(futuro), estado.secoes.futuro)}
    </div>`;

  desenharKpis(doc, el.querySelector('#pvKpis'), r, periodo.id, MESES_LONGOS[Number(dados.hoje.slice(5, 7)) - 1], hist, graficos);
  desenharHistorico(doc, el.querySelector('#pvHistSlot'), hist, estado, redesenhar, graficos);
  // 02/10/2026 (pedido C): card de Análise embaixo do gráfico - lembra se estava aberto entre redesenhos
  const slotAnalise = el.querySelector('#pvHistAnalise');
  slotAnalise._agAberto = !!estado.analiseAberta;
  renderAnalise(doc, slotAnalise, analiseHistoricoProventos(dados, estado, hist, r));
  const det = slotAnalise.querySelector('details');
  if (det) det.addEventListener('toggle', () => { estado.analiseAberta = det.open; });

  // período: segmentado canônico + chip "Escolher período" (06/10/2026: .chart-seg do kit; os ids continuam os do cálculo)
  filtrosEl.innerHTML = `<div class="pv-periodo" id="pvPeriodo">${botoesSegmentadoHtml(PERIODOS.map((p) => p.id), periodo.personalizado ? null : periodo.id)}</div>`;
  ligarFiltroPeriodo(doc, filtrosEl.querySelector('#pvPeriodo'), {
    periodoInicial: estado.periodo,
    limites: limitesPeriodoProventos(dados),
    aoMudar(p) { estado.periodo = p; redesenhar(); },
  });

  const rankEl = el.querySelector('#pvRanking');
  if (!ranking.length) {
    const slot = rankEl.querySelector('[data-vazio]');
    const caixa = criarUi(doc, 'div', { class: 'card' });
    slot.append(caixa);
    mostrarEstadoVazio(caixa, { icone: 'inbox', titulo: 'Nenhum provento recebido no período', texto: 'Escolha um período maior pra ver os ativos que pagaram.', doc });
  }
  const mais = el.querySelector('[data-acao="ranking"]');
  if (mais) mais.addEventListener('click', () => { estado.rankingTodos = !estado.rankingTodos; redesenhar(); });
  ligarDetalheRanking(doc, rankEl, ranking);
  el.querySelectorAll('details[data-secao]').forEach((d) => d.addEventListener('toggle', () => { estado.secoes[d.getAttribute('data-secao') === 'pvRank' ? 'ranking' : 'futuro'] = d.open; }));
}

function ligarDetalheRanking(doc, raiz, ranking) {
  const porTicker = Object.fromEntries(ranking.map((a) => [a.ticker, a]));
  raiz.querySelectorAll('.pv-rank-item').forEach((tr) => {
    const a = porTicker[tr.getAttribute('data-ticker')];
    if (!a) return;
    const abrir = () => abrirDetalhe(doc, { titulo: a.ticker, html: detalheAtivoHtml(a) });
    tr.addEventListener('click', (ev) => { if (ev.target.closest('a, button')) return; abrir(); });
    ligarMenu(tr.querySelector('[data-menu]'), () => [
      { rotulo: 'Ver detalhes', icone: 'info', aoClicar: abrir },
      { rotulo: 'Abrir página do ativo', icone: 'open-in-new', href: urlAtivoTicker(a.ticker) },
    ]);
  });
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

const STATUS_PILL = {
  pago: ['Pago', 'pago', 'chip-good'],
  naoLancado: ['Pago · não lançado', 'naolancado', 'chip-warn'],
  naoConfirmado: ['Não confirmado', 'naolancado', 'chip-warn'], // 02/10/2026: o extrato da B3 do mês não trouxe
  aReceber: ['A receber', 'areceber', 'chip-info'],
  semData: ['A definir', 'semdata', ''],
};

function linhaAgendaHtml(p, nomes) {
  const [rotulo, classe, chip] = STATUS_PILL[p.status] || ['—', '', ''];
  const emDolar = p.moeda === 'USD' && typeof p.liquido === 'number';
  const pgto = p.dataPagamento ? formatDMA(p.dataPagamento) : 'a definir';
  return `
    <tr class="pv-ag-linha">
      <td class="pv-ag-ativo">${celulaAtivoHtml(p.ticker, nomes[p.ticker], p.classe, `<small class="pv-pgto-mini">Pgto ${pgto}</small>`)}</td>
      <td class="col-opc pv-ag-texto pv-ag-det">${esc(p.tipo || '—')}</td>
      <td class="num col-opc pv-ag-det">${valorPorCotaTxt(p)}</td>
      <td class="num col-opc pv-ag-det">${qtdTxt(p.quantidade)}</td>
      <td class="num col-opc pv-ag-det">${p.dataCom ? formatDMA(p.dataCom) : '—'}</td>
      <td class="num col-opc pv-ag-pag">${pgto}</td>
      <td class="pv-ag-sit"><span class="pv-pill chip-tonal ${chip} ${classe}">${rotulo}</span>${p.status === 'naoConfirmado' ? '' : iconeConferenciaHtml(p)}</td>
      <td class="num pv-ag-total"><b>${formatBRL(p.valor)}</b>${emDolar ? `<small>${usd(p.liquido)}${p.cambio ? ` · câmbio ${formatNumeroBR(p.cambio, 4)}` : ''}</small>` : ''}</td>
      <td class="col-opc pv-col-menu">${BOTAO_MENU(`Mais ações de ${p.ticker}`)}</td>
    </tr>`;
}

function detalheAgendaHtml(p, nomes) {
  const [rotulo] = STATUS_PILL[p.status] || ['—'];
  const emDolar = p.moeda === 'USD' && typeof p.liquido === 'number';
  const cotas = typeof p.quantidade === 'number' && p.quantidade > 0 && p.valorPorCota > 0 ? `${qtdTxt(p.quantidade)} × ${valorPorCotaTxt(p)}` : '';
  return `
    <div class="pv-det-cab">${logoAtivoHtml(p.ticker)}<span>${esc(nomes[p.ticker] || p.ticker)}<small>${esc(NOME_CLASSE[p.classe] || '')}</small></span></div>
    ${linhasDetalheHtml([
    ['Situação', rotulo],
    ['Tipo', esc(p.tipo || '—')],
    ...(cotas ? [['Cotas × valor por cota', cotas]] : [['Valor por cota', valorPorCotaTxt(p)], ['Quantidade', qtdTxt(p.quantidade)]]),
    ['Data com', p.dataCom ? formatDMA(p.dataCom) : '—'],
    ['Pagamento', p.dataPagamento ? formatDMA(p.dataPagamento) : 'a definir'],
    ['Total', formatBRL(p.valor)],
    ...(emDolar ? [['Líquido em dólar', `${usd(p.liquido)}${p.cambio ? ` · câmbio ${formatNumeroBR(p.cambio, 4)}` : ''}`]] : []),
    ...(p.fonte ? [['Fonte', esc(p.fonte)]] : []),
  ])}
    <a class="btn btn-tonal pv-det-abrir" href="${esc(urlAtivoTicker(p.ticker))}">Abrir página do ativo</a>`;
}

function renderAgenda(doc, el, dados, estado, redesenhar, filtrosEl, graficos) {
  const itens = itensAgenda(dados, { classe: estado.classe });
  const nomes = Object.fromEntries((dados.ativos || []).map((a) => [a.ticker, a.nome]));
  const anos = anosDaAgenda(itens, dados.hoje);
  if (!anos.includes(estado.ano)) estado.ano = anos[0];
  const cont = contagemPorMes(itens, estado.ano, estado.status);
  if (estado.mes === 'semData' && !cont.semData) estado.mes = null;
  const { itens: lista, total } = filtrarAgenda(itens, { ano: estado.ano, mes: estado.mes, status: estado.status });
  const recebido = lista.filter((p) => p.status === 'pago' || p.status === 'naoLancado').reduce((s, p) => s + p.valor, 0);
  const aReceber = lista.filter((p) => p.status === 'aReceber' || p.status === 'semData').reduce((s, p) => s + p.valor, 0);
  const iAno = anos.indexOf(estado.ano);
  const titulo = estado.mes === 'semData' ? 'Sem data de pagamento' : (estado.mes ? `${MESES_LONGOS[estado.mes - 1]} de ${estado.ano}` : `Ano de ${estado.ano}`);
  el.innerHTML = `
    <div class="pv-meses" id="pvMeses"></div>
    <div class="pv-ag-bloco">
      <div class="pv-ag-resumo">
        <h3>${esc(titulo.charAt(0).toUpperCase() + titulo.slice(1))}</h3>
        <span>${lista.length} provento${lista.length === 1 ? '' : 's'} · <b>${formatBRL(total)}</b>${recebido > 0 && aReceber > 0 ? ` <small>(${formatBRL(recebido)} recebido · ${formatBRL(aReceber)} a receber)</small>` : ''}</span>
      </div>
      ${lista.length ? `
      <div class="card card-flat">
        <div class="tabela-wrap">
          <table class="tabela tabela-baixa pv-agenda">
            <thead><tr><th>Ativo</th><th class="col-opc">Tipo</th><th class="num col-opc">Valor por cota</th><th class="num col-opc">Qtd</th><th class="num col-opc">Data com</th><th class="num col-opc">Pagamento</th><th>Situação</th><th class="num">Total</th><th class="sr-only col-opc">Ações</th></tr></thead>
            <tbody>${lista.map((p) => linhaAgendaHtml(p, nomes)).join('')}</tbody>
          </table>
        </div>
      </div>` : '<div class="card" id="pvAgVazio"></div>'}
    </div>`;
  criarTabs(el.querySelector('#pvMeses'), {
    variante: 'sublinhada', rotulo: 'Mês', idBase: 'pvMes',
    ativo: estado.mes == null ? 'todos' : String(estado.mes),
    itens: [
      { id: 'todos', rotulo: 'Ano todo', contagem: cont.meses.reduce((s, v) => s + v, 0) },
      ...MESES_CURTOS.map((m, i) => ({ id: String(i + 1), rotulo: m.charAt(0).toUpperCase() + m.slice(1), contagem: cont.meses[i] || '' })),
      ...(cont.semData ? [{ id: 'semData', rotulo: 'A definir', contagem: cont.semData }] : []),
    ],
    aoMudar(id) { estado.mes = id === 'todos' ? null : (id === 'semData' ? 'semData' : Number(id)); redesenhar(); },
    doc,
  });
  if (!lista.length) {
    mostrarEstadoVazio(el.querySelector('#pvAgVazio'), {
      icone: 'calendar-month', titulo: 'Nenhum provento aqui', texto: 'Não há proventos com esses filtros.',
      acao: estado.mes != null || estado.status !== 'todos' ? { rotulo: 'Ver o ano todo', aoClicar: () => { estado.mes = null; estado.status = 'todos'; redesenhar(); } } : null, doc,
    });
  }
  filtrosEl.innerHTML = `
    <div class="pv-ano" role="group" aria-label="Ano">
      <button type="button" class="icon-btn pv-ano-btn" data-ano="${anos[iAno + 1] || ''}" ${anos[iAno + 1] ? '' : 'disabled'} aria-label="Ano anterior">${ic('chevron-left')}</button>
      <b>${estado.ano}</b>
      <button type="button" class="icon-btn pv-ano-btn" data-ano="${anos[iAno - 1] || ''}" ${anos[iAno - 1] ? '' : 'disabled'} aria-label="Próximo ano">${ic('chev-r')}</button>
    </div>
    <div class="segmented pv-status" role="group" aria-label="Situação">${[['todos', 'Todos'], ['realizado', 'Realizado'], ['aRealizar', 'A realizar']].map(([id, n]) => `<button type="button" data-status="${id}" aria-pressed="${estado.status === id}">${n}</button>`).join('')}</div>`;
  filtrosEl.querySelectorAll('[data-ano]').forEach((b) => b.addEventListener('click', () => { const a = Number(b.getAttribute('data-ano')); if (a) { estado.ano = a; estado.mes = null; redesenhar(); } }));
  filtrosEl.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', () => { estado.status = b.getAttribute('data-status'); redesenhar(); }));

  const linhas = [...el.querySelectorAll('.pv-ag-linha')];
  linhas.forEach((tr, i) => {
    const p = lista[i];
    const abrir = () => abrirDetalhe(doc, { titulo: `${p.ticker} · ${p.tipo || 'Provento'}`, html: detalheAgendaHtml(p, nomes) });
    tr.addEventListener('click', (ev) => { if (ev.target.closest('a, button')) return; abrir(); });
    ligarMenu(tr.querySelector('[data-menu]'), () => [
      { rotulo: 'Ver detalhes', icone: 'info', aoClicar: abrir },
      { rotulo: 'Abrir página do ativo', icone: 'open-in-new', href: urlAtivoTicker(p.ticker) },
    ]);
  });
}

// ---------------------------------------------------------------------------
// Importar a planilha da B3
// ---------------------------------------------------------------------------

function carregarSheetJs(doc) {
  const win = doc.defaultView;
  if (win.XLSX) return Promise.resolve(win.XLSX);
  return new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = SHEETJS_URL;
    s.onload = () => (win.XLSX ? resolve(win.XLSX) : reject(new Error('leitor de planilha não carregou')));
    s.onerror = () => reject(new Error('sem conexão pra carregar o leitor de planilha'));
    doc.head.appendChild(s);
  });
}

/** Lê o .xlsx no navegador: a aba "Proventos a Receber" (ou a 1ª) como matriz. */
export async function lerArquivoB3(doc, arquivo, { carregarXlsx = carregarSheetJs } = {}) {
  const XLSX = await carregarXlsx(doc);
  const buffer = await arquivo.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const nome = wb.SheetNames.find((n) => /provento/i.test(n)) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: '' });
}

/**
 * 06/10/2026 (A-62): a prévia da planilha vira confirmar() (nada é enviado antes do "Enviar"), o resultado vira
 * toast(); a linha #pvImportarStatus só mostra o andamento ("Lendo...", "Enviando...") e o erro, com o detalhe
 * técnico recolhido.
 */
function ligarImportacao(doc, token, { botao, input, status, importarImpl, carregarXlsx, aoImportar }) {
  if (!botao || !input || !status) return;
  const andamento = (texto) => { status.hidden = false; status.className = 'pv-importar-status'; status.textContent = texto; };
  const erro = (texto, detalhe) => {
    status.hidden = false;
    status.className = 'pv-importar-status erro';
    status.innerHTML = `<span class="estado-erro-linha">${ic('error')}<span>${esc(texto)}${detalhe ? `<details class="estado-detalhe"><summary>Detalhes técnicos</summary><pre>${esc(detalhe)}</pre></details>` : ''}</span></span>`;
    toast.erro(texto, { doc });
  };
  const limpar = () => { status.hidden = true; status.textContent = ''; };
  botao.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const arquivo = input.files && input.files[0];
    input.value = '';
    if (!arquivo) return;
    andamento('Lendo a planilha…');
    let linhas;
    try {
      linhas = await lerArquivoB3(doc, arquivo, { carregarXlsx });
    } catch (e) {
      erro('Não consegui ler esse arquivo. Confira se é a planilha .xlsx baixada da B3 e tente de novo.', String((e && e.message) || e));
      return;
    }
    const previa = previaExportacaoB3(linhas);
    if (!previa.ok) {
      erro('Esse arquivo não parece a planilha "Proventos a receber" da B3 (não achei as colunas Produto e Valor líquido).');
      return;
    }
    limpar();
    const ok = await confirmar({
      titulo: 'Importar proventos da B3?',
      mensagem: `Encontrei ${previa.itens.length} proventos a receber, somando ${formatBRL(previa.total)}. Isso substitui a importação anterior.`,
      confirmarTexto: 'Enviar pra planilha', cancelarTexto: 'Cancelar', icone: 'upload', doc,
    });
    if (!ok) return;
    andamento('Enviando…');
    let r;
    try { r = await importarImpl(token, linhas); } catch (e) { r = { ok: false, erro: String((e && e.message) || e) }; }
    if (!r || !r.ok) { erro('Não deu pra importar agora. Tente de novo em instantes.', (r && r.erro) || 'erro desconhecido'); return; }
    limpar();
    toast.ok(`Importado: ${r.importados} proventos (${formatBRL(r.total)}).`, { doc });
    await aoImportar();
  });
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function estadoInicialProventos(dados, prefs = {}) {
  const hoje = (dados && dados.hoje) || hojeSP(); // 05/10/2026 (A-19): era UTC (virava o dia às 21h de SP)
  const estreito = typeof globalThis.innerWidth === 'number' && globalThis.innerWidth < 600;
  return {
    aba: prefs.aba === 'agenda' ? 'agenda' : 'consolidado',
    classe: ['todas', 'acoes', 'fiis', 'acoesEua'].includes(prefs.classe) ? prefs.classe : 'todas',
    periodo: PERIODOS.some((p) => p.id === prefs.periodo) || ehPeriodoPersonalizado(prefs.periodo) ? prefs.periodo : '12m',
    agrupar: ['classe', 'tipo', 'ativo'].includes(prefs.agrupar) ? prefs.agrupar : 'classe',
    rankingTodos: false,
    secoes: { ranking: true, futuro: !estreito }, // 06/10/2026: no celular a seção mais longa abre fechada
    ano: Number(hoje.slice(0, 4)),
    mes: Number(hoje.slice(5, 7)),
    status: 'todos',
  };
}

const NOME_ABA = { consolidado: 'Consolidado', agenda: 'Agenda' };

export function desenharProventos(doc, conteudo, dadosBrutos, estado, { hojeLocal = hojeSaoPaulo(), cab = null, aoMudarAba = null } = {}) {
  // 02/10/2026: pagamento até hoje (São Paulo) = pago; os não lançados entram como presumidos
  const dados = normalizarPorData(dadosBrutos, hojeLocal);
  const foco = chaveFoco(doc, conteudo);
  (conteudo._pvGraficos || []).forEach((g) => { try { g.destruir(); } catch (e) { /* já saiu do DOM */ } });
  const graficos = [];
  conteudo._pvGraficos = graficos;
  const redesenhar = () => desenharProventos(doc, conteudo, dados, estado, { hojeLocal, cab, aoMudarAba });
  gravarPrefs(estado);
  if (cab) {
    if (cab.abas.pilula && cab.abas.pilula.obterAtivo() !== estado.aba) cab.abas.pilula.selecionar(estado.aba);
    cab.definirTitulo('Proventos', { subaba: NOME_ABA[estado.aba], secao: SECAO });
    const r12 = resumoConsolidado(dados, { classe: 'todas', periodoId: '12m' });
    cab.definirSubtitulo(['Você recebeu ', { texto: formatBRL(r12.renda), tom: 'bom' }, ` em proventos nos últimos 12 meses${dados.atualizadoB3 ? ` · B3 importada em ${formatDM(dados.atualizadoB3)}` : ''}`]);
  }
  conteudo.innerHTML = `
    <div class="pv-filtros">
      <div class="pv-classes" id="pvClasses"></div>
      <div class="pv-filtros-dir" id="pvFiltrosDir"></div>
    </div>
    <div class="pv-painel" id="pvPainel"></div>`;
  montarFiltroClasse(doc, conteudo.querySelector('#pvClasses'), estado, redesenhar);
  const painel = conteudo.querySelector('#pvPainel');
  const filtrosEl = conteudo.querySelector('#pvFiltrosDir');
  if (estado.aba === 'agenda') renderAgenda(doc, painel, dados, estado, redesenhar, filtrosEl, graficos);
  else renderConsolidado(doc, painel, dados, estado, redesenhar, filtrosEl, graficos);
  restaurarFoco(conteudo, foco);
}

export async function montarPaginaProventos(token, { doc = document, getProventosImpl = getProventos, importarImpl = importarProventosB3, carregarXlsx = carregarSheetJs, hojeLocal = null } = {}) {
  const hojeDe = () => hojeLocal || hojeSaoPaulo(); // 02/10/2026 (testes fixam o dia)
  const loadingEl = doc.getElementById('proventosLoading');
  const erroEl = doc.getElementById('proventosErro');
  const conteudo = doc.getElementById('proventosConteudo');
  garantirEstilosCharts(doc);
  let estado = null;
  let dadosAtuais = null;

  // cabeçalho padrão (título, subtítulo com o número-chave, Atualizar dados, Importar B3 e as abas em pílula)
  let cabEl = doc.getElementById('pvCabecalho');
  if (!cabEl) { cabEl = doc.createElement('div'); cabEl.id = 'pvCabecalho'; conteudo.parentNode.insertBefore(cabEl, conteudo.parentNode.firstChild); }
  const prefs = lerPrefs();
  const botaoImportar = criarUi(doc, 'button', { type: 'button', class: 'btn btn-tonal', id: 'pvImportarBtn', title: 'Planilha "Proventos a receber" baixada da Área do Investidor da B3' }, [iconeUi(doc, 'upload'), criarUi(doc, 'span', { class: 'pv-longo', texto: 'Importar planilha da B3' }), criarUi(doc, 'span', { class: 'pv-curto', texto: 'Importar B3' })]);
  const inputArquivo = criarUi(doc, 'input', { type: 'file', id: 'pvImportarArquivo', accept: '.xlsx,.xls', hidden: true });
  let aoMudarAba = null;
  const cab = montarCabecalhoPagina(cabEl, {
    secao: SECAO, subaba: NOME_ABA[prefs.aba === 'agenda' ? 'agenda' : 'consolidado'], titulo: 'Proventos',
    subtitulo: 'Dividendos, JCP e rendimentos que você recebeu e os que ainda vão cair.',
    refresh: true, acoes: [botaoImportar, inputArquivo],
    abas: {
      pilula: {
        rotulo: 'Proventos', ativo: prefs.aba === 'agenda' ? 'agenda' : 'consolidado',
        itens: [{ id: 'consolidado', rotulo: 'Consolidado' }, { id: 'agenda', rotulo: 'Agenda' }],
        aoMudar(id) { if (estado && estado.aba !== id) { estado.aba = id; if (aoMudarAba) aoMudarAba(); } },
      },
    },
    doc,
  });
  let statusEl = doc.getElementById('pvImportarStatus');
  if (!statusEl) { statusEl = doc.createElement('div'); statusEl.id = 'pvImportarStatus'; statusEl.hidden = true; statusEl.setAttribute('role', 'status'); cabEl.after(statusEl); }

  const desenhar = (dados) => {
    dadosAtuais = dados;
    if (!estado) estado = estadoInicialProventos(dados, lerPrefs());
    loadingEl.hidden = true;
    erroEl.hidden = true;
    conteudo.hidden = false; // antes de desenhar: o gráfico mede a largura do cartão
    aoMudarAba = () => desenharProventos(doc, conteudo, dados, estado, { hojeLocal: hojeDe(), cab, aoMudarAba });
    desenharProventos(doc, conteudo, dados, estado, { hojeLocal: hojeDe(), cab, aoMudarAba });
  };

  /** Devolve false quando a busca falha (o "Atualizar dados" mostra "Falhou"); true quando desenhou. */
  async function carregar() {
    let r;
    try { r = await getProventosImpl(token); } catch (e) { r = { ok: false, erro: String((e && e.message) || e) }; }
    if (!r || !r.ok) {
      loadingEl.hidden = true;
      if (!dadosAtuais) {
        // 06/10/2026 (A-60/A-61): texto humano + "Tentar de novo"; o detalhe técnico fica recolhido
        mostrarErroCarga(erroEl, { tela: 'Proventos', resposta: r, aoTentar: async () => { loadingEl.hidden = false; erroEl.hidden = true; await carregar(); }, doc });
      } else {
        toast.erro('Não consegui atualizar os proventos agora. Mostrando os últimos dados.', { doc });
      }
      return false;
    }
    erroEl.hidden = true;
    gravarCacheDados(CHAVE_CACHE, r);
    desenhar(r);
    return true;
  }

  ligarImportacao(doc, token, { botao: botaoImportar, input: inputArquivo, status: statusEl, importarImpl, carregarXlsx, aoImportar: carregar });

  const cache = await lerCacheDados(CHAVE_CACHE);
  if (cache) desenhar(cache.dados);
  // 26/09/2026: o botão "Atualizar dados" entra ANTES da 1ª busca (mostra
  // "Atualizando…" enquanto carrega) e fica fora do conteúdo - visível no
  // carregamento e no erro também, que é quando mais se precisa dele.
  await mountRefreshControl(doc, cab.refreshEl, carregar).atualizar();
}

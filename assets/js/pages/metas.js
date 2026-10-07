/**
 * metas.js - 02/10/2026: tela "Metas e Objetivos" (metas.html, aba do router).
 *
 * Tiago: "novo menu principal Metas e Objetivos, v1 funcional já". Lista de
 * cards (progresso, quanto falta, prazo, aporte necessário x o seu, no ritmo /
 * atrasada), filtros por status e tipo, "Nova meta" em passos (tipo -> dados
 * -> vincular investimentos -> revisar), detalhe com gráfico da evolução
 * projetada x necessária, sub-itens de custo, investimentos vinculados e o
 * simulador ("até tal mês, aporte quanto" e o inverso). Sem metas, a tela
 * sugere as mais comuns com 1 clique, já com os números da planilha.
 *
 * Dados: GET action=metas (apps-script/Metas.gs); contas em ./metas-calc.js;
 * ícones/formatos/card de outras telas em ../metas-card.js. O detalhe abre por
 * metas.html#meta=<id> (é o link do card de renda passiva em Carteiras).
 *
 * 03/10/2026 (Tiago: "'Metas da Carteira' [...] precisa estar linkada às
 * metas presentes em 'Metas e Objetivos'; clicando nela, sou jogado pra tela
 * de detalhe da meta"): metas.html#nova=<tipo> (ex. #nova=renda-passiva) abre
 * o assistente direto no passo Dados, com os números da planilha
 * (metas-calc!metaDaPlanilha) - é o link "Criar em Metas e Objetivos" dos
 * cards do Acompanhamento de Ativos. Se a meta desse tipo já existe, abre o
 * detalhe dela em vez de criar outra.
 *
 * 03/10/2026 (Metas v2 - "Focando em metas", 2 mensagens do Tiago): herói
 * novo (anel de progresso, números com cor verde/vermelho, "nesse ritmo"),
 * reserva com bruto x LÍQUIDO, detalhe dos investimentos e formas usadas
 * (ativo, classe, marcação, instituição, vencimento, IR) + "Saldo em conta"
 * editável (ex. Wise em euro), gráfico de HISTÓRICO (GET metasHistorico) com
 * hover/toque, filtros de período (6M/12M/Tudo/Escolher período) e análise
 * embaixo - também no gráfico da evolução projetada; renda passiva mês a
 * mês; velocidade (75%/50% do tempo) e dicas pra acelerar; aposentadoria com
 * a conta da planilha editável passo a passo (e o prazo editável - bug), marcos
 * de milhão e "se a renda fosse 10%/20% menor"; viagem por destinos + itens
 * fixos; explicação ("i") em todo status/indicador; sugestões de investimento
 * por tipo de meta (fontes) e avaliação de cada vínculo; "Excluir
 * definitivamente" pras arquivadas.
 */

import {
  getMetas, salvarMeta as salvarMetaApi, excluirMeta as excluirMetaApi,
  getMetasHistorico, excluirMetaDefinitivamente as excluirDefinitivoApi,
} from '../api-client.js';
import { mountRefreshControl, resolveSiteRootUrl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { urlAtivo } from '../link-ativo.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { DESTINOS_RENDA_FIXA, DESTINO_OBJETIVO, ROTULO_DESTINO_RF, ativoRfObjetivo } from '../destino-renda-fixa.js'; // 07/10/2026
import { ligarFiltroPeriodo, ehPeriodoPersonalizado, rotuloPeriodo } from '../periodo-personalizado.js';
import { renderAnalise } from '../analise-grafico.js';
import { TIPOS_META, CATEGORIAS_ACUMULO, MOEDAS, STATUS_META, tomProgresso, ultimoMesFechadoMetas, aparenciaMeta, rotuloMes, rotuloDuracao, mesesEntre, mesDe, cotacao, somarMeses, chaveSugestaoInvestimento, avaliarVinculos, explicarStatus } from './metas-calc-nucleo.js';
import { EXPLICACOES, calcularMeta, serieProjecao, resumoMetas, metaPadrao, metaDaPlanilha, sugestoesMetas, simular, resolverVinculos, ativosSobrecomprometidos, ignoraAvisoSobreposicao, LIMITE_ALERTA_VENCIMENTO_MESES, vinculosOrfaos, taxaMensal, marcosProjecao, SUGESTOES_INVESTIMENTO, destinoPadrao, contaAposentadoria } from './metas-calc-plano.js';
import { velocidadeMeta, dicasAcelerar, cenariosRendaMenor, resumoMarcos, fraseMarcos, velocidadeEntreMarcos, analisarHistoricoMeta, analisarProjecaoMeta, analisarRendaMensal } from './metas-calc-analise.js';
import { aporteCrescimentoEditorHtml, resumoCrescimentoEditor, estimativasHtml, ligarEstimativas, cardAcompanhandoHtml, fraseAporteCrescente } from './metas-estimativas.js'; // 07/10/2026: aporte crescente, estimativas e meta "acompanhando"
import { rebasearAporte, planoAporte } from './metas-calc-aporte.js';
import { temEstimativas, pessoasDoGrupo, projecaoPorAnos } from './metas-calc-grupo.js';
import { textoEstimativa } from './metas-calc-fora.js';
import { calcularViagem, migrarMetaViagem, entradaPadrao, normalizarUrl, acharPais, paisPorCodigo, sugestaoTaxaTuristica, ehLinkWanderlog } from './metas-calc-viagem.js';
import {
  bandeiraHtml, bandeirasViagemHtml, opcoesPaisesHtml, opcoesCidadesHtml, destinosEditorHtml, fixosEditorHtml, entradasEditorHtml,
  resumoViagemHtml, resumoEntradaHtml, totalDestinoTexto, notaTaxaHtml, porMesHtml, botaoRoteiroHtml, viagemDetalheHtml,
  entradasDetalheHtml, avisoRevisarHtml,
} from './metas-viagem.js';
import {
  iconeMetaSvg, seloMetaHtml, formatMoeda, valorGrandeHtml, pct, statusPillHtml, garantirEstiloMetas, contextoMetas,
  metaPrincipalDoTipo, tipoMetaDoSlug, infoHtml, statusComDicaHtml,
} from '../metas-card.js';
import { opcoesProjecao, opcoesHistorico, opcoesRenda, montarGrafico, limparGrafico } from './metas-graficos.js';
import {
  montarCabecalhoPagina, criarTabs, criarBreadcrumb, confirmar, toast, mostrarErroCarga, mostrarEstadoVazio, icone as iconeUi, criar as criarUi, definirTituloPagina,
} from '../ui/index.js'; // 06/10/2026 (Onda 3): cabeçalho, abas, breadcrumb, confirmar, toast e erro de carga padrão do kit
import { criarAnelProgresso, criarBarraProgresso } from '../charts/index.js';
import { formatNumeroPt } from '../format.js'; // 05/10/2026 (A-68)
// 06/10/2026: tipo "Distribuição da carteira" (os objetivos da carteira) - cálculo e HTML em metas-distribuicao.js
import {
  TIPO_DISTRIBUICAO, ehMetaDistribuicao, pesosDaMeta, atuaisDeResposta, calcularDistribuicao, cardDistribuicaoHtml, detalheDistribuicaoHtml,
  tileDistribuicaoHtml, passoDadosDistribuicaoHtml, atualizarSomasDistribuicao, previaDistribuicaoHtml, erroPassoDistribuicao,
  revisarDistribuicaoHtml, passoVinculosDistribuicaoHtml,
} from './metas-distribuicao.js';

export { opcoesProjecao, opcoesHistorico, opcoesRenda };

import { TEMPLATE_METAS } from './metas-template.js'; // 06/10/2026 (A-42): o router precisa só do HTML, sem carregar a tela inteira
export { TEMPLATE_METAS };

// ---------------------------------------------------------------------------
// Números digitados (pt-BR)
// ---------------------------------------------------------------------------

/** "1.234,56" / "1234.56" / "R$ 10" -> número (null se vazio/inválido). */
export function parseNumeroBR(texto) {
  if (texto == null) return null;
  let s = String(texto).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function numParaCampo(v, casas = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return formatNumeroPt(v, { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function lerCaminho(obj, caminho) {
  return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function gravarCaminho(obj, caminho, valor) {
  const partes = caminho.split('.');
  let o = obj;
  partes.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  o[partes[partes.length - 1]] = valor;
}

/**
 * 04/10/2026: países (com moeda e bandeira), cidades turísticas e taxas
 * turísticas da meta de viagem (assets/data/*.json). Nunca lança: sem os
 * arquivos o assistente aceita país e cidade digitados.
 */
export async function carregarDadosViagemPadrao(fetchImpl = typeof fetch !== 'undefined' ? fetch : null) {
  const vazio = { paises: [], cidades: null, taxas: null };
  if (!fetchImpl) return vazio;
  const raiz = resolveSiteRootUrl();
  const buscar = (nome) => fetchImpl(new URL(`assets/data/${nome}`, raiz).href).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [p, c, t] = await Promise.all([buscar('paises.json'), buscar('cidades.json'), buscar('taxas-turisticas.json')]);
  return { paises: (p && p.paises) || [], cidades: (c && c.cidades) || null, taxas: t || null };
}

const clonar = (o) => JSON.parse(JSON.stringify(o));
const idItem = () => Math.random().toString(36).slice(2, 10);
const ROTULO_CLASSE = { acoes: 'Ações', fiis: 'FIIs', usa: 'Ações EUA', rf: 'Renda Fixa' };
const ROTULO_MARCA = ROTULO_DESTINO_RF; // 07/10/2026: + objetivo = "Reservado para objetivos" (destino-renda-fixa.js)
const FILTROS_STATUS = [
  ['todas', 'Todas'], ['no-ritmo', 'No ritmo'], ['atrasadas', 'Atrasadas'], ['concluidas', 'Concluídas'], ['arquivadas', 'Arquivadas'],
];
const MOEDAS_SALDO = ['EUR', 'USD', 'GBP', 'BRL', 'CHF', 'CAD', 'AUD', 'JPY'];
const CATEGORIAS_DIARIA = [['alimentacao', 'Alimentação'], ['transporte', 'Transporte'], ['passeios', 'Passeios'], ['compras', 'Compras']];
const r0 = (v) => formatMoeda(v, 'BRL', { casas: 0 });

function passaFiltroStatus(filtro, c) {
  if (filtro === 'todas' || filtro === 'arquivadas') return true;
  if (filtro === 'no-ritmo') return ['no-ritmo', 'saldo-ideal', 'sem-prazo', 'acompanhando'].includes(c.status); // 07/10/2026: acompanhando nunca é atenção
  if (filtro === 'atrasadas') return ['atrasada', 'vencida', 'abaixo', 'ideal-bruto'].includes(c.status);
  if (filtro === 'concluidas') return c.status === 'concluida';
  return true;
}

function chaveTipo(meta) { return meta.tipo === 'acumulo' ? `acumulo:${meta.categoria || 'outros'}` : meta.tipo; }

/** Ícones pequenos dos números do herói. */
const ICONE_NUM = {
  carteira: '<path d="M4 7.5h14.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18z"/><path d="M4 7.5 15.5 4.5V7.5"/><circle cx="16" cy="13.5" r="1.2" fill="currentColor" stroke="none"/>',
  alvo: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  falta: '<path d="M5 12h14"/><path d="M12 5v0"/><circle cx="12" cy="12" r="8.5"/>',
  sobe: '<path d="M4 17l6-6 4 4 6-7"/><path d="M15 8h5v5"/>',
  relogio: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  foguete: '<path d="M12 3.5c3 2 4.5 5.2 4.5 8.5l-2 3.5h-5l-2-3.5c0-3.3 1.5-6.5 4.5-8.5z"/><circle cx="12" cy="10" r="1.6"/><path d="M9.5 15.5 8 20l2.5-1.5M14.5 15.5 16 20l-2.5-1.5"/>',
  escudo: '<path d="M12 3.5l7 2.6v5.2c0 4.3-2.9 7.9-7 9.2-4.1-1.3-7-4.9-7-9.2V6.1z"/>',
  moeda: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.7.9 2.7 2.1-1.2 2-2.7 2c-1.2 0-2.2-.5-2.7-1.4M12 6.3v1.5M12 16.3v1.5"/>',
  calendario: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  marco: '<path d="M6 20.5V4M6 4.5h11l-2.5 3.5L17 11.5H6"/>',
  conta: '<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M3.5 10h17M7 14.5h3"/>',
};
function iconeNum(chave, tamanho = 15) {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_NUM[chave] || ICONE_NUM.alvo}</svg>`;
}

/** Cor do tipo da meta (token legado --acoes/--fiis/--rf/--usa/--bad) -> posição na paleta categórica do kit (--chart-N). */
const COR_CHART = { acoes: 1, fiis: 2, rf: 3, usa: 4, bad: 8 };

/**
 * 06/10/2026 (A-64/A-65): no celular os blocos longos da tela de detalhe (vencimentos, velocidade, marcos)
 * viram seções recolhíveis (<details>, fechadas), sem mexer no conteúdo. No desktop nada muda.
 */
export function recolherNoCelular(raiz, win, doc) {
  let estreito = false;
  try { estreito = !!(win && win.matchMedia && win.matchMedia('(max-width: 760px)').matches); } catch { estreito = false; }
  if (!estreito) return;
  const titulos = ['Títulos que vencem', 'Quanto tempo leva', 'Marcos até o alvo', 'De onde vem o alvo'];
  raiz.querySelectorAll('section.mt-bloco').forEach((sec) => {
    const cab = sec.querySelector(':scope > .mt-bloco-cab');
    const h3 = cab && cab.querySelector('h3');
    if (!h3 || !titulos.some((t) => (h3.textContent || '').trim().startsWith(t))) return;
    const det = doc.createElement('details');
    det.className = 'mt-rec';
    const sum = doc.createElement('summary');
    sum.className = 'mt-bloco-cab';
    while (cab.firstChild) sum.appendChild(cab.firstChild);
    cab.remove();
    det.appendChild(sum);
    while (sec.firstChild) det.appendChild(sec.firstChild);
    sec.appendChild(det);
  });
}

/** 06/10/2026 (Onda 3): troca cada `.mt-prog[data-prog]` pela barra de progresso da biblioteca de gráficos (animada, com aria). */
export function montarProgressos(raiz) {
  if (!raiz) return;
  raiz.querySelectorAll('.mt-prog[data-prog]').forEach((el) => {
    const v = Number(el.dataset.prog);
    const meta = el.dataset.meta != null && el.dataset.meta !== '' ? Number(el.dataset.meta) : undefined;
    criarBarraProgresso(el, {
      valor: Number.isFinite(v) ? v : 0, meta, cor: COR_TOM_PROGRESSO[tomProgresso(v)], rotulo: el.dataset.rotulo || 'Progresso',
    });
    el.removeAttribute('data-prog');
  });
}

/** 06/10/2026: cor do progresso pela semântica de metas - verde atingida, amarelo quase lá (90%+), cinza em progresso. */
/** 06/10/2026: o mês "em curso" (parcial) - null no último dia do mês, quando ele já conta como fechado. */
const mesEmCurso = (hoje) => { const mes = mesDe(hoje); return mes && mes <= ultimoMesFechadoMetas(hoje) ? null : mes; };
const COR_TOM_PROGRESSO = { bom: 'var(--chart-up)', quase: 'var(--warn)', neutro: 'var(--chart-axis)' };

/**
 * Anel de progresso: `p` 0-1; `p2` (opcional) = anel fino de fora (ex. bruto da reserva). 06/10/2026 (Onda 3): só o espaço
 * (com os dados em data-*); `montarAneis` troca pelo anel da biblioteca de gráficos (varre no sentido horário, texto no meio).
 */
export function anelProgressoHtml(p, { tamanho = 148, tom = null, rotulo = 'da meta', cor = 'acoes', texto = null } = {}) {
  const v = Math.max(0, Math.min(1, p || 0));
  tom = tom || tomProgresso(v); // 06/10/2026: um anel só, na cor do estado (o bruto da reserva virou texto secundário)
  return `<div class="mt-anel ${tom}" style="width:${tamanho}px;min-height:${tamanho}px" data-anel="${v}" data-tom="${tom}" data-cor="${esc(cor)}" data-tamanho="${tamanho}" data-rotulo="${esc(rotulo)}" data-texto="${esc(texto != null ? texto : pct(p))}"></div>`;
}

/** Monta os anéis (`.mt-anel[data-anel]`) com `criarAnelProgresso`. */
export function montarAneis(raiz) {
  if (!raiz) return;
  raiz.querySelectorAll('.mt-anel[data-anel]').forEach((el) => {
    const cor = COR_TOM_PROGRESSO[el.dataset.tom] || COR_TOM_PROGRESSO.neutro;
    criarAnelProgresso(el, {
      valor: Number(el.dataset.anel), tamanho: Number(el.dataset.tamanho) || 148, espessura: 12,
      cor, rotulo: el.dataset.texto, subrotulo: el.dataset.rotulo, aria: 'Progresso da meta:',
    });
    el.removeAttribute('data-anel');
  });
}

/** Chip colorido +/− (verde/vermelho). */
function chipDelta(valor, { sufixo = '', positivoBom = true, texto = null } = {}) {
  if (!Number.isFinite(valor) || Math.abs(valor) < 0.5) return '';
  const bom = (valor > 0) === positivoBom;
  return `<span class="mt-chip-delta ${bom ? 'bom' : 'ruim'}">${valor > 0 ? '▲' : '▼'} ${texto || `${valor > 0 ? '+' : '−'}${r0(Math.abs(valor))}${sufixo}`}</span>`;
}

// ---------------------------------------------------------------------------
// Card da lista
// ---------------------------------------------------------------------------

export function cardMetaHtml(meta, c) {
  if (c.acompanhando) return cardAcompanhandoHtml(meta, c); // 07/10/2026: sem valor alvo - cartão próprio (cinza, sem % nem "falta")
  const ap = aparenciaMeta(meta);
  const p = Math.max(0, Math.min(1, c.percentual || 0));
  const estrangeira = c.moeda !== 'BRL' && c.alvoMoeda != null;
  const reserva = meta.tipo === 'reservaEmergencia';
  let linhaValor;
  if (c.renda) {
    linhaValor = `<span class="mt-num">${valorGrandeHtml(c.renda.atual)}<small>/mês</small></span><span class="mt-de">de ${formatMoeda(c.renda.alvo)}/mês</span>`;
  } else if (reserva) {
    linhaValor = `<span class="mt-num">${valorGrandeHtml(c.atualLiquidoBRL)}<small>líquido</small></span><span class="mt-de">de ${c.alvoBRL != null ? formatMoeda(c.alvoBRL) : '—'}${c.liquido.impostoBRL > 0 ? ` · bruto ${r0(c.atualBRL)}` : ''}</span>`;
  } else {
    linhaValor = `<span class="mt-num">${valorGrandeHtml(c.ja)}</span><span class="mt-de">de ${c.total != null ? formatMoeda(c.total) : '—'}${estrangeira ? ` <span class="mt-moeda">(${formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 })})</span>` : ''}</span>`;
  }
  const linhas = [];
  if (reserva) {
    linhas.push(['Saldo ideal', c.alvoBRL != null ? formatMoeda(c.alvoBRL) : '—']);
    const dif = c.atualLiquidoBRL - (c.alvoBRL || 0);
    linhas.push([dif < 0 ? 'Falta (líquido)' : 'Acima do ideal', `<span class="${dif < 0 ? 'mt-ruim' : 'mt-bom'}">${formatMoeda(Math.abs(dif))}</span>`]);
  } else {
    linhas.push(['Falta', c.renda ? formatMoeda(Math.max(0, c.renda.alvo - c.renda.atual)) + '/mês' : (c.total != null ? formatMoeda(Math.max(0, c.total - c.ja)) : '—')]);
    linhas.push(['Prazo', c.dataAlvo ? `${rotuloMes(c.dataAlvo)}${c.mesesRestantes != null && c.mesesRestantes >= 0 ? `<small>em ${rotuloDuracao(c.mesesRestantes)}</small>` : ''}` : (c.dataEstimada ? `${rotuloMes(c.dataEstimada)}<small>estimado no seu ritmo</small>` : '—')]);
  }
  const necessario = c.aporteNecessarioTotal;
  const parcelasAPagar = c.viagem ? c.viagem.aPagar.mesAtualBRL : 0; // 04/10/2026: parcelas são pagas à parte
  const voce = c.aporteAtual ? `${formatMoeda(c.aporteAtual, 'BRL', { casas: 0 })}${c.aporteOrigem === 'historico' ? ' (real)' : ''}` : '—';
  const aporte = necessario != null && necessario > 0
    ? `<div class="mt-aporte ${(c.planoAporte ? c.status === 'no-ritmo' : c.aporteAtual + 0.5 >= (c.parcelasCorrendo > 0 ? (c.aporteNecessario || 0) : necessario)) ? 'ok' : 'baixo'}"><span>Aporte/mês</span><b>${formatMoeda(necessario, 'BRL', { casas: 0 })}</b><span class="mt-fraco">${c.viagem ? 'pra guardar' : 'necessário'}${!c.viagem && c.parcelasCorrendo > 0 ? ` (${r0(c.parcelasCorrendo)} de parcelas)` : ''} · você: ${voce}${parcelasAPagar > 0 ? ` · paga ${r0(parcelasAPagar)}/mês de parcelas` : ''}</span></div>`
    : (c.dataEstimada && c.status !== 'concluida' && c.status !== 'saldo-ideal' ? `<div class="mt-aporte ok"><span>Nesse ritmo</span><b>${rotuloMes(c.dataEstimada)}</b><span class="mt-fraco">${c.aporteAtual > 0 ? `aportando ${voce}/mês` : 'só com o rendimento'}</span></div>` : '');
  return `<button class="mt-card" type="button" data-abrir="${esc(meta.id)}" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <span class="mt-card-cab">
    ${seloMetaHtml(meta)}
    <span class="mt-card-tit"><strong>${esc(meta.nome)}</strong><span>${c.viagem ? bandeirasViagemHtml(meta, { tamanho: 15 }) : ''}${esc(ap.rotulo)}${meta.contribuicao === 'recorrente' ? ' · pagamento recorrente' : ''}</span></span>
    ${meta.status === 'arquivada' ? '<span class="mt-status na">Arquivada</span>' : statusPillHtml(c.status, meta, c.percentual)}
  </span>
  <span class="mt-card-valor">${linhaValor}</span>
  <span class="mt-prog" data-prog="${p.toFixed(4)}" data-cor="${esc(ap.cor)}" data-rotulo="${esc(`${pct(c.percentual)} de ${meta.nome}`)}"></span>
  <span class="mt-card-pct"><b>${pct(c.percentual)}</b>${c.vinculos.length ? ` · ${c.vinculos.length} ${c.vinculos.length === 1 ? 'vínculo' : 'vínculos'}` : ''}</span>
  <span class="mt-card-linhas">${linhas.map(([r, v]) => `<span><em>${r}</em><b>${v}</b></span>`).join('')}</span>
  ${aporte}
  ${linhaMarcoCard(c)}
</button>`;
}

/** 05/10/2026: 1 linha curta no card da lista ("1º milhão em 2031"; reserva: próximo vencimento de título). */
function linhaMarcoCard(c) {
  if (c.vencimentos && c.vencimentos.proximo) {
    const e = c.vencimentos.proximo;
    return `<span class="mt-card-marco ${e.tom === 'atencao' ? 'atencao' : ''}">${e.tom === 'atencao' ? '⚠ ' : ''}${esc(e.titulos[0].nome)}${e.titulos.length > 1 ? ` e +${e.titulos.length - 1}` : ''} vence em ${rotuloMes(e.mes)}${e.tom === 'atencao' ? ' - reserva cai abaixo do mínimo' : ''}</span>`;
  }
  if (c.marcoProximo) return `<span class="mt-card-marco">${iconeNum('marco', 12)} ${esc(c.marcoProximo.rotulo)} em <b>${c.marcoProximo.ano}</b></span>`;
  return '';
}

// ---------------------------------------------------------------------------
// Herói do detalhe
// ---------------------------------------------------------------------------

function numHeroi({ icone, rotulo, valor, sub = '', tom = '', dica = '' }) {
  return `<div class="mt-hnum ${tom}"><span class="mt-hnum-rot">${iconeNum(icone)}${rotulo}${dica ? infoHtml(dica, { rotulo: `O que é "${rotulo}"?` }) : ''}</span><span class="mt-hnum-val">${valor}</span>${sub ? `<span class="mt-hnum-sub">${sub}</span>` : ''}</div>`;
}

/** Frase do ritmo ("Nesse ritmo você chega em ..."). { html, tom } */
export function fraseRitmo(meta, c) {
  const aporteTxt = c.aporteAtual > 0
    ? `${formatMoeda(c.aporteAtual, 'BRL', { casas: 0 })}/mês ${c.aporteOrigem === 'historico' ? '<em>(seu aporte real, média de 12 meses)</em>' : '<em>(informado por você)</em>'}`
    : null;
  if (c.status === 'concluida' || c.status === 'saldo-ideal') return { tom: 'bom', html: `${meta.tipo === 'reservaEmergencia' ? 'Reserva no saldo ideal, já contando o IR de um resgate hoje.' : 'Meta alcançada!'} ${c.aporteAtual > 0 ? `Seu aporte atual: ${aporteTxt}.` : ''}` };
  if (c.recorrente) return { tom: 'neutro', html: `Pagamento recorrente: ${c.recorrente.restantes} parcelas restantes${c.recorrente.fim ? `, última em <b>${rotuloMes(c.recorrente.fim)}</b>` : ''}.` };
  if (c.acompanhando) { // 07/10/2026: sem valor alvo ainda - só acompanha (nada de "defina o alvo" como problema)
    const f = c.aporteCrescente ? ` (${fraseAporteCrescente(c)})` : '';
    return { tom: 'neutro', html: `Ainda sem valor definido: o site só acompanha. ${c.aporteAtual > 0 ? `Aportando ${formatMoeda(c.aporteAtual, 'BRL', { casas: 0 })}/mês${f}, você terá ~<b>${formatMoeda(projecaoPorAnos(c, [5])[0].valor, 'BRL', { casas: 0 })}</b> em 5 anos (veja as Estimativas abaixo).` : 'Informe um aporte mensal em Editar pra ver quanto terá daqui a alguns anos.'}` };
  }
  if (!(c.alvoBRL > 0)) return { tom: 'neutro', html: 'Defina o alvo (Editar) para ver quando você chega.' };
  if (c.dataEstimada) {
    let quando = `<b>${rotuloMes(c.dataEstimada)}</b> (${rotuloDuracao(c.mesesEstimados)})`;
    let tom = 'neutro';
    if (c.mesesRestantes != null) {
      const dif = Math.ceil(c.mesesEstimados) - c.mesesRestantes;
      tom = dif <= 0 ? 'bom' : 'atencao'; // 06/10/2026: atraso é amarelo (vermelho só pra erro/grave)
      quando += dif <= 0 ? ` - <span class="mt-bom">${rotuloDuracao(-dif) === 'agora' ? 'bem no prazo' : `${rotuloDuracao(-dif)} antes do prazo`}</span>` : ` - <span class="mt-atencao">${rotuloDuracao(dif)} depois do prazo</span>`;
    }
    return { tom, html: `Nesse ritmo você chega em ${quando}${aporteTxt ? `, aportando ${aporteTxt}` : ' só com o rendimento'}.` };
  }
  // 05/10/2026 (A-15): ritmo <= 0 (aporte real zero ou só resgates) tem mensagem própria, em vez de "nunca" sem explicação
  if (c.ritmoSemAporte) return { tom: 'atencao', html: `Nos últimos meses você não aportou nessa meta (ritmo médio ${formatMoeda(c.aporteReal, 'BRL', { casas: 0 })}/mês): sem aporte não dá pra projetar quando chega. Informe um aporte em Editar ou veja o aporte necessário e as simulações abaixo.` };
  if (c.aporteOrigem === 'nenhum') return { tom: 'neutro', html: 'Ainda não dá pra saber o seu ritmo: vincule investimentos (o aporte real sai do histórico deles) ou informe um aporte mensal em Editar.' };
  return { tom: 'atencao', html: `No ritmo de hoje (${aporteTxt || 'sem aporte'}) a meta não chega no alvo - veja as simulações abaixo.` };
}

/**
 * 06/10/2026 (Tiago: "se já passei da meta, quanto eu poderia resgatar (considerando IR) e destinar a outro objetivo (ações, FIIs)
 * sem diminuir a meta da renda emergencial"): bloco "Excedente da reserva" - bruto a resgatar, IR/IOF estimado, líquido liberado,
 * de quais títulos tirar (menor imposto primeiro) e pra onde (Radar / Aportes). Vazio se a reserva não passou da meta.
 */
export function excedenteHtml(meta, c, { raizSite = null } = {}) {
  const ex = c && c.excedente;
  if (meta.tipo !== 'reservaEmergencia' || !ex) return '';
  let raiz = raizSite;
  if (!raiz) { try { raiz = resolveSiteRootUrl(); } catch (_) { raiz = 'http://localhost/'; } }
  const radar = new URL('distribuicoes-metas.html', raiz).href;
  const aportes = new URL('transacoes/index.html#aportes', raiz).href;
  const m0 = (v) => formatMoeda(v, 'BRL', { casas: 0 });
  const linhas = ex.titulos.map((t) => `<tr><th scope="row">${esc(t.nome)}${t.vencimento ? `<small class="mt-fraco"> vence ${rotuloMes(t.vencimento)}</small>` : ''}</th><td class="num">${m0(t.bruto)}</td><td class="num">${t.imposto > 0.5 ? `−${m0(t.imposto)}` : '—'}</td><td class="num">${m0(t.liquido)}</td><td>${t.total ? 'resgate total' : 'resgate parcial'}</td></tr>`).join('');
  return `<section class="mt-bloco mt-excedente" id="mtExcedente"><div class="mt-bloco-cab"><h3>Excedente da reserva${infoHtml('A reserva (líquida, já sem IR/IOF) passou do saldo ideal. Esse excedente está parado sem necessidade: dá pra resgatar e direcionar a outro objetivo (ações, FIIs) sem baixar a reserva abaixo da meta. A sugestão tira primeiro os títulos que pagam MENOS imposto (os mais antigos e os isentos). Resgate parcial: o imposto é proporcional (estimativa; a corretora ou o Tesouro confirmam no resgate).', { rotulo: 'Como o excedente é calculado?' })}</h3><span class="mt-fraco">acima do saldo ideal: <b class="mono">${m0(ex.excedenteLiquido)}</b> (líquido)</span></div>
  ${ex.semTitulos ? '<p class="mt-nota">Não há títulos de renda fixa vinculados com saldo para sugerir o resgate: o excedente está em outros ativos ou em saldo em conta.</p>' : `<dl class="mt-exc-nums">
    <div><dt>Resgatar (bruto)</dt><dd class="mono">${m0(ex.brutoResgatar)}</dd></div>
    <div><dt>IR/IOF estimado</dt><dd class="mono">${ex.imposto > 0.5 ? `−${m0(ex.imposto)}` : 'isento'}</dd></div>
    <div><dt>Líquido liberado</dt><dd class="mono mt-bom">${m0(ex.liquidoLiberado)}</dd></div>
    <div><dt>Reserva depois (líquida)</dt><dd class="mono">${m0(ex.reservaDepois)}</dd></div>
  </dl>
  <div class="card card-flat"><div class="tabela-wrap"><table class="tabela tabela-baixa mt-tabela"><thead><tr><th scope="col">De qual título</th><th scope="col" class="num">Bruto</th><th scope="col" class="num">IR/IOF</th><th scope="col" class="num">Líquido</th><th scope="col">Resgate</th></tr></thead><tbody>${linhas}</tbody></table></div></div>
  ${ex.faltaTitulos > 0.5 ? `<p class="mt-nota">Os títulos vinculados cobrem ${m0(ex.liquidoLiberado)} do excedente; os outros ${m0(ex.faltaTitulos)} estão em ativos que não são renda fixa.</p>` : ''}
  ${ex.estimado ? '<p class="mt-nota">Algum título está sem estimativa de IR (tratado como sem imposto): confira antes de resgatar.</p>' : ''}`}
  <p class="mt-exc-acoes"><span class="mt-fraco">Pra onde levar:</span> <a class="btn btn-tonal mt-btn-sm" href="${esc(radar)}">Ver no Radar de oportunidades</a> <a class="btn btn-text mt-btn-sm" href="${esc(aportes)}">Registrar o aporte</a></p></section>`;
}

export function heroiHtml(meta, c, { arquivada = false, marcos = [] } = {}) {
  const ap = aparenciaMeta(meta);
  const reserva = meta.tipo === 'reservaEmergencia';
  const estrangeira = c.moeda !== 'BRL' && c.alvoMoeda != null;
  const nums = [];
  const aporteSub = (necessario) => {
    if (necessario == null) return `${c.aporteOrigem === 'historico' ? `média dos últimos ${c.mesesBaseAporte || 12} meses${c.aporteReal < -0.5 ? ' - saiu mais do que entrou (resgates)' : ''}` : (c.aporteOrigem === 'informado' ? 'informado por você' : 'sem histórico ainda')}${c.aporteCrescente ? ` · ${esc(fraseAporteCrescente(c))}` : ''}`;
    const dif = (c.aporteAtual || 0) - necessario;
    return `necessário <b>${r0(necessario)}</b> ${chipDelta(dif, { sufixo: '/mês' })}${c.aporteCrescente ? ` · ${esc(fraseAporteCrescente(c))}` : ''}`; // 07/10/2026: + degraus do aporte crescente
  };
  if (c.renda) {
    nums.push(numHeroi({ icone: 'sobe', rotulo: 'Renda média (12 meses)', valor: `${valorGrandeHtml(c.renda.atual)}`, sub: `meta <b>${formatMoeda(c.renda.alvo)}</b>/mês`, dica: EXPLICACOES.rendaMedia }));
    nums.push(numHeroi({ icone: 'carteira', rotulo: 'Patrimônio que gera a renda', valor: valorGrandeHtml(c.atualBRL), sub: `necessário <b>${c.alvoBRL != null ? r0(c.alvoBRL) : '—'}</b>${c.renda.yieldAtual ? ` · rende ${pct(c.renda.yieldAtual, 1)} a.a.` : ''}`, dica: EXPLICACOES.patrimonioRenda }));
    const faltaRenda = Math.max(0, c.renda.alvo - c.renda.atual);
    nums.push(numHeroi({ icone: 'falta', rotulo: 'Falta de renda', valor: faltaRenda > 0 ? `<span class="mt-ruim">${valorGrandeHtml(faltaRenda)}</span><small>/mês</small>` : '<span class="mt-bom">nada</span>', tom: faltaRenda > 0 ? 'ruim' : 'bom', sub: `${pct(c.percentual)} da meta de renda` }));
  } else if (reserva) {
    nums.push(numHeroi({ icone: 'escudo', rotulo: 'Líquido hoje', valor: valorGrandeHtml(c.atualLiquidoBRL), tom: c.status === 'saldo-ideal' ? 'bom' : '', sub: `bruto <b>${r0(c.atualBRL)}</b>${c.liquido.impostoBRL > 0 ? ` · <span class="mt-ruim">IR/IOF −${r0(c.liquido.impostoBRL)}</span>` : ''}`, dica: EXPLICACOES.liquido }));
    nums.push(numHeroi({ icone: 'alvo', rotulo: 'Saldo ideal', valor: c.alvoBRL != null ? valorGrandeHtml(c.alvoBRL) : '—', sub: c.partes.length ? `${c.partes[1].valor} meses x ${r0(c.partes[0].valor)} + ${pct(c.partes[2].valor)}` : '', dica: EXPLICACOES.saldoIdeal }));
    const dif = c.atualLiquidoBRL - (c.alvoBRL || 0);
    nums.push(numHeroi({ icone: dif >= 0 ? 'sobe' : 'falta', rotulo: dif >= 0 ? 'Acima do ideal (líquido)' : 'Falta (líquido)', valor: `<span class="${dif >= 0 ? 'mt-bom' : 'mt-ruim'}">${dif >= 0 ? '+' : ''}${valorGrandeHtml(Math.abs(dif))}</span>`, tom: dif >= 0 ? 'bom' : 'ruim', sub: c.atualBRL >= (c.alvoBRL || 0) && dif < 0 ? 'no bruto já bate - a diferença é o imposto' : `bruto ${c.atualBRL - (c.alvoBRL || 0) >= 0 ? '+' : '−'}${r0(Math.abs(c.atualBRL - (c.alvoBRL || 0)))}` }));
  } else if (c.viagem) {
    // 04/10/2026 (Tiago: "quero saber quanto tenho que pagar por mês, e quanto tenho que aportar e guardar pro futuro"):
    // o herói olha só o que falta JUNTAR; o que já foi comprado no cartão aparece à parte ("A pagar")
    const est = c.moeda !== 'BRL' && c.alvoMoeda != null;
    // 06/10/2026 (Tiago: "falta a maior [informação]: quanto de fato a viagem está custando"): o número principal
    if (c.custoTotal) {
      const ct = c.custoTotal;
      const detalhe = `Detalhe: compras já feitas ${formatMoeda(ct.comprasBRL, 'BRL', { casas: 0 })}${ct.comprasPendenteBRL > 0.5 ? ` (${formatMoeda(ct.comprasPendenteBRL, 'BRL', { casas: 0 })} ainda a confirmar nas faturas)` : ''} + já guardado ${formatMoeda(ct.guardadoBRL, 'BRL', { casas: 0 })} + falta guardar ${formatMoeda(ct.faltaBRL, 'BRL', { casas: 0 })} = ${formatMoeda(ct.totalBRL, 'BRL', { casas: 0 })}.`;
      nums.push(numHeroi({ icone: 'conta', rotulo: 'Custo total da viagem', valor: valorGrandeHtml(ct.totalBRL), tom: 'principal', sub: `compras <b>${r0(ct.comprasBRL)}</b> + guardado <b>${r0(ct.guardadoBRL)}</b> + falta guardar <b>${r0(ct.faltaBRL)}</b>`, dica: `${EXPLICACOES.custoTotal} ${detalhe}` }));
    }
    nums.push(numHeroi({ icone: 'carteira', rotulo: 'Já guardado', valor: valorGrandeHtml(c.ja), sub: `de <b>${c.total != null ? r0(c.total) : '—'}</b> a juntar${est ? ` (${formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 })} a ${formatMoeda(c.cotacao, 'BRL', { casas: 2 })})` : ''}`, dica: EXPLICACOES.aJuntar }));
    const subEntradas = c.entradasTotal > 0 && c.decomposicao ? `− <b>${r0(c.entradasTotal)}</b> de entradas programadas = <b>${r0(c.decomposicao.restante)}</b> a aportar` : (c.falta > 0 ? 'falta guardar até a viagem' : `${pct(c.percentual)} concluído`);
    nums.push(numHeroi({ icone: 'falta', rotulo: 'Falta juntar', valor: c.falta > 0 ? `<span class="mt-ruim">${valorGrandeHtml(c.falta)}</span>` : '<span class="mt-bom">nada</span>', tom: c.falta > 0 ? 'ruim' : 'bom', sub: subEntradas, dica: EXPLICACOES.entradas }));
  } else if (c.acompanhando) {
    // 07/10/2026: sem valor alvo - o que já tem e quanto terá em 5 anos no ritmo (sem "falta" nem "%")
    const p5 = projecaoPorAnos(c, [5])[0];
    nums.push(numHeroi({ icone: 'carteira', rotulo: 'Já tenho', valor: valorGrandeHtml(c.ja), sub: 'ainda sem valor definido · só acompanhando' }));
    nums.push(numHeroi({ icone: 'sobe', rotulo: 'Em 5 anos (estimativa)', valor: c.aporteAtual > 0 || c.ja > 0 ? `~${valorGrandeHtml(p5.valor)}` : '—', sub: c.aporteAtual > 0 ? `${r0(p5.aportado)} de aportes + ${r0(p5.rendimento)} de rendimento` : 'informe um aporte em Editar' }));
  } else {
    const contaFalta = (c.total != null && c.alvoBRL != null) ? Math.max(0, c.total - c.alvoBRL - (c.ja - c.atualBRL)) : 0;
    nums.push(numHeroi({ icone: 'carteira', rotulo: 'Já tenho', valor: valorGrandeHtml(c.ja), sub: `de <b>${c.total != null ? r0(c.total) : '—'}</b>${estrangeira ? ` (${formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 })} a ${formatMoeda(c.cotacao, 'BRL', { casas: 2 })})` : ''}`, dica: EXPLICACOES.percentual }));
    const faltaTot = (c.falta || 0) + contaFalta;
    const subFalta = [c.faltaMoeda != null && estrangeira ? `<b>${formatMoeda(c.faltaMoeda, c.moeda, { casas: 0 })}</b> pra juntar` : null, contaFalta > 0 ? `<b>${r0(contaFalta)}</b> de parcelas` : null].filter(Boolean).join(' + ');
    nums.push(numHeroi({ icone: 'falta', rotulo: 'Falta', valor: faltaTot > 0 ? `<span class="mt-ruim">${valorGrandeHtml(faltaTot)}</span>` : '<span class="mt-bom">nada</span>', tom: faltaTot > 0 ? 'ruim' : 'bom', sub: subFalta || `${pct(c.percentual)} concluído` }));
  }
  const valorAporte = c.aporteAtual > 0 ? `${valorGrandeHtml(c.aporteAtual)}<small>/mês</small>`
    : (c.aporteOrigem === 'historico' && c.aporteReal < -0.5 ? `<span class="mt-ruim">−${valorGrandeHtml(Math.abs(c.aporteReal))}</span><small>/mês</small>` : (c.aporteOrigem === 'historico' ? `${valorGrandeHtml(0)}<small>/mês</small>` : '<span class="mt-fraco">—</span>'));
  // 03/10/2026 (revisão): parcelas que já correm (itens fixos da viagem / conta
  // mensal) são pagas à parte (cartão) - o seu aporte compara com o que falta
  // JUNTAR (a mesma regra do status "no ritmo"/"atrasada"); as parcelas aparecem ao lado.
  const parcelas = !reserva && !c.viagem && c.parcelasCorrendo > 0 ? c.parcelasCorrendo : 0;
  const necJuntar = reserva ? null : (parcelas ? c.aporteNecessario : c.aporteNecessarioTotal);
  const subParcelas = parcelas ? `+ <b>${r0(parcelas)}</b>/mês de parcelas` : '';
  const subAporte = parcelas && !(necJuntar > 0) ? `nada a juntar · ${subParcelas}` : `${aporteSub(necJuntar)}${parcelas ? ` · ${subParcelas}` : ''}`;
  nums.push(numHeroi({ icone: 'moeda', rotulo: c.aporteOrigem === 'historico' ? 'Seu aporte real' : 'Seu aporte', valor: valorAporte, tom: necJuntar != null && necJuntar > 0 ? ((c.planoAporte ? c.status === 'no-ritmo' : c.aporteAtual + 0.5 >= necJuntar) ? 'bom' : 'ruim') : '', sub: subAporte, dica: EXPLICACOES.aporteReal }));
  if (c.viagem && c.viagem.aPagar.itens.length) {
    const ap = c.viagem.aPagar;
    nums.push(numHeroi({ icone: 'conta', rotulo: 'A pagar (já comprado)', valor: valorGrandeHtml(ap.totalBRL), sub: `${ap.pendenteBRL > 0.5 ? `<b>${r0(ap.pendenteBRL)}</b> a confirmar nas faturas` : 'tudo confirmado'} · fora do aporte`, dica: EXPLICACOES.aPagar }));
  }
  if (meta.tipo === 'aposentadoria' && c.aposentadoria) {
    const prox = (marcos || []).find((m) => !m.ja && m.mes);
    nums.splice(1, 0, numHeroi({ icone: 'alvo', rotulo: 'Montante alvo', valor: c.alvoBRL != null ? valorGrandeHtml(c.alvoBRL) : '—', sub: `renda ideal <b>${c.aposentadoria.renda ? r0(c.aposentadoria.renda) : '—'}</b>/mês · retirada <b>${pct(c.aposentadoria.taxa, 1)}</b>/ano${prox ? ` · ${prox.rotulo} em <b>${prox.ano}</b>` : ''}`, dica: EXPLICACOES.taxaRetirada }));
  }
  const ritmo = fraseRitmo(meta, c);
  const p = c.percentual || 0;
  const tomAnel = tomProgresso(p, { atingida: ['concluida', 'saldo-ideal'].includes(c.status) }); // 06/10/2026: verde/amarelo/cinza
  const viagemInfo = meta.especificos && meta.especificos.destino ? ` · ${esc(meta.especificos.destino)}` : '';
  const destinosTxt = c.viagem && c.viagem.destinos.length ? ` · ${c.viagem.destinos.map((d) => esc(d.cidade || d.pais)).join(', ')}` : '';
  const bandeiras = c.viagem ? bandeirasViagemHtml(meta, { tamanho: 18 }) : '';
  return `<section class="mt-heroi mt-heroi-v2" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <div class="mt-heroi-cab">
    ${seloMetaHtml(meta, { tamanho: 46 })}
    <div class="mt-heroi-tit"><span class="mt-eyebrow">${bandeiras}${esc(ap.rotulo)}${viagemInfo}${destinosTxt}${c.dataAlvo ? ` · até ${rotuloMes(c.dataAlvo)}` : ''}</span><h2>${esc(meta.nome)}</h2></div>
    ${arquivada ? '<span class="mt-status na">Arquivada</span>' : statusComDicaHtml(c.status, meta, c.percentual)}
    <div class="mt-heroi-acoes">
      ${botaoRoteiroHtml(meta)}
      ${arquivada ? '<button class="btn btn-ghost mt-btn-sm" type="button" data-restaurar>Restaurar</button><button class="btn btn-ghost mt-btn-sm mt-btn-perigo" type="button" data-excluir-definitivo>Excluir definitivamente</button>' : '<button class="btn btn-ghost mt-btn-sm" type="button" data-editar>Editar</button><button class="btn btn-ghost mt-btn-sm" type="button" data-arquivar>Arquivar</button>'}
    </div>
  </div>
  <div class="mt-heroi-corpo">
    ${c.acompanhando ? anelProgressoHtml(0, { tom: 'neutro', cor: ap.cor, rotulo: 'sem valor alvo', texto: '—' }) : anelProgressoHtml(p, { tom: tomAnel, cor: ap.cor, rotulo: reserva ? 'líquido' : 'da meta' })}
    <div class="mt-heroi-numeros">${nums.join('')}</div>
  </div>
  ${c.viagem ? porMesHtml(c) : ''}
  ${reserva && c.liquido.impostoBRL > 0 ? `<p class="mt-heroi-legenda">${pct(c.percentual)} do saldo ideal no líquido · bruto (antes do IR/IOF) ${pct(c.percentualBruto)}</p>` : ''}
  <p class="mt-heroi-ritmo ${ritmo.tom}">${iconeNum(ritmo.tom === 'bom' ? 'foguete' : 'relogio', 16)}<span>${ritmo.html}</span>${infoHtml(EXPLICACOES.noSeuRitmo, { rotulo: 'Como o ritmo é calculado?' })}</p>
  ${meta.notas ? `<p class="mt-notas">${esc(meta.notas)}</p>` : ''}
  ${c.sobreposicao && !arquivada ? `<p class="mt-alerta mt-alerta-acao"><span>${esc(c.sobreposicao.texto)}</span><button type="button" class="btn btn-text mt-btn-sm" data-ignorar-sobreposicao>Ignorar este aviso</button></p>` : ''}
  ${c.avisos.length ? `<p class="mt-alerta">${c.avisos.map(esc).join(' · ')}</p>` : ''}
</section>`;
}

// ---------------------------------------------------------------------------
// Recortes de período (gráficos mensais)
// ---------------------------------------------------------------------------

/** Meses do histórico no período: '6m' | '12m' | '24m' | 'tudo' | { inicio, fim } (com o mês-base antes). */
export function recortarMeses(lista, periodo) {
  const arr = lista || [];
  if (!arr.length) return [];
  if (ehPeriodoPersonalizado(periodo)) {
    const a = periodo.inicio.slice(0, 7); const b = periodo.fim.slice(0, 7);
    const i0 = arr.findIndex((x) => x.mes >= a);
    if (i0 < 0) return [];
    let i1 = -1;
    arr.forEach((x, i) => { if (x.mes <= b) i1 = i; });
    if (i1 < i0) return [];
    return arr.slice(Math.max(0, i0 - 1), i1 + 1);
  }
  const n = { '3m': 3, '6m': 6, '12m': 12, '24m': 24 }[periodo];
  return n ? arr.slice(-(n + 1)) : arr.slice();
}

/** Média móvel de 12 meses fechados (o mês atual, parcial, fica de fora). */
export function comMedia12(renda, mesAtual) {
  const out = [];
  const fechados = [];
  (renda || []).forEach((x) => {
    if (x.mes !== mesAtual) fechados.push(x.valor);
    const ult = fechados.slice(-12);
    out.push({ ...x, media12: ult.length >= 3 ? Math.round((ult.reduce((s, v) => s + v, 0) / ult.length) * 100) / 100 : null });
  });
  return out;
}

const PERIODOS_HIST = ['6m', '12m', '24m', 'tudo'].map((id) => [id, rotuloPeriodo(id)]);
const PERIODOS_PROJ = ['12m', '60m', 'fim'].map((id) => [id, rotuloPeriodo(id)]);

function tabsPeriodoHtml(lista, atual, rotulo) {
  return `<div class="filter-tabs mt-tabs-periodo" role="group" aria-label="${esc(rotulo)}">${lista.map(([k, r]) => `<button type="button" class="filter-tab ${atual === k ? 'active' : ''}" data-periodo="${k}">${r}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export async function montarPaginaMetas(token, {
  doc = document,
  getMetasImpl = getMetas,
  salvarMetaImpl = salvarMetaApi,
  excluirMetaImpl = excluirMetaApi,
  getMetasHistoricoImpl = getMetasHistorico,
  excluirDefinitivoImpl = excluirDefinitivoApi,
  carregarDadosViagemImpl = carregarDadosViagemPadrao, // 04/10/2026: países, cidades e taxas turísticas
  win = doc.defaultView,
  usarCache = true,
} = {}) {
  garantirEstiloMetas(doc);
  const el = {
    carregando: doc.getElementById('mtCarregando'),
    erro: doc.getElementById('mtErro'),
    avisos: doc.getElementById('mtAvisos'),
    tela: doc.getElementById('mtTela'),
    dialogo: doc.getElementById('mtDialogo'),
    nova: null,
    refresh: null,
  };
  if (!el.tela) return null;

  // 06/10/2026 (Onda 3): cabeçalho padrão do kit (título grande, subtítulo de uma linha com o número-chave, "Atualizar dados" e
  // a ação principal em pílula) + document.title "<Subaba> · <Seção> · Patrimônio" (A-69).
  const botaoNova = criarUi(doc, 'button', { type: 'button', id: 'mtNova', class: 'btn btn-filled' }, [iconeUi(doc, 'add'), 'Nova meta']);
  const cabEl = doc.getElementById('mtCabecalho');
  const cabecalho = cabEl ? montarCabecalhoPagina(cabEl, {
    secao: 'Metas e Objetivos', subaba: 'Minhas metas', titulo: 'Metas e Objetivos',
    subtitulo: 'Quanto falta, quanto aportar por mês e se você está no ritmo - com os seus investimentos de verdade.',
    refresh: true, acoes: [botaoNova], doc,
  }) : null;
  el.nova = botaoNova;
  el.refresh = cabecalho ? cabecalho.refreshEl : null;
  if (el.refresh) el.refresh.id = 'mtRefresh';

  const estado = {
    resposta: null, ctx: null, filtroStatus: 'todas', filtroTipo: 'todos', detalheId: null, assistente: null, simulador: null,
    historico: null, indices: [], historicoCarregando: false, historicoErro: null,
    modoHist: 'acumulado', periodos: { hist: '12m', proj: 'fim', renda: '12m' }, editandoSaldo: null,
    simPreco: {}, estimAberta: null, // 07/10/2026: simulador "e se custar R$ X" (por meta) e se a seção Estimativas está aberta
    dados: { paises: [], cidades: null, taxas: null }, // 04/10/2026
  };

  function idDoHash() {
    const m = String((win && win.location && win.location.hash) || '').match(/meta=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  // 03/10/2026: #nova=<tipo> (link "Criar em Metas e Objetivos" do Acompanhamento de Ativos).
  function novaDoHash() {
    const m = String((win && win.location && win.location.hash) || '').match(/nova=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function trocarHashSemHistorico(id) {
    if (!(win && win.history && win.location)) return;
    const base = win.location.pathname + win.location.search;
    win.history.replaceState(win.history.state, '', id ? `${base}#meta=${encodeURIComponent(id)}` : base);
  }
  /** Abre o pedido do #nova= assim que os dados (referências da planilha) chegam - 1 vez só. */
  function abrirNovaPendente() {
    if (!estado.novaPendente || !estado.ctx || estado.assistente) return;
    const tipo = tipoMetaDoSlug(estado.novaPendente);
    estado.novaPendente = null;
    if (!tipo) { trocarHashSemHistorico(null); return; }
    const existente = metaPrincipalDoTipo(estado.resposta.metas, tipo);
    if (existente) { // já tem: vai pro detalhe dela em vez de duplicar
      estado.detalheId = existente.id;
      trocarHashSemHistorico(existente.id);
      desenhar();
      return;
    }
    trocarHashSemHistorico(null); // fechar/F5 não reabre o assistente
    abrirAssistente(metaDaPlanilha(tipo, { referencias: estado.ctx.referencias, hoje: estado.ctx.hoje }), 2);
  }

  function irPara(id) {
    estado.detalheId = id;
    estado.simulador = null;
    estado.editandoSaldo = null;
    if (win && win.history && win.location) {
      const base = win.location.pathname + win.location.search;
      win.history.pushState(win.history.state, '', id ? `${base}#meta=${encodeURIComponent(id)}` : base);
    }
    desenhar();
    if (win && win.scrollTo) { try { win.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* jsdom */ } }
  }

  function todasAsMetas() {
    const r = estado.resposta || {};
    return [...(r.metas || []), ...(r.arquivadas || [])];
  }
  function acharMeta(id) { return todasAsMetas().find((m) => m.id === id) || null; }
  const calcDe = (meta) => calcularMeta(meta, estado.ctx || {});

  /** Junta o resumo do histórico (aporte real) no contexto de cálculo. */
  function aplicarHistoricoNoCtx() {
    if (!estado.ctx) return;
    const resumo = { ...((estado.resposta && estado.resposta.historicoResumo) || {}) };
    Object.entries(estado.historico || {}).forEach(([id, h]) => { resumo[id] = { aporteMedio: h.aporteMedio, aporte3m: h.aporte3m, mesesBase: h.mesesBase, desde: h.desde }; });
    estado.ctx.historico = resumo;
  }

  /**
   * 04/10/2026: viagens cadastradas antes (países digitados, itens fixos, conta
   * mensal) ganham o formato novo na hora de desenhar - nada é gravado até o
   * Tiago salvar (metas-calc!migrarMetaViagem); o que não mapear vira "revise".
   */
  function migrarResposta(resposta) {
    const mig = (m) => (m && (m.tipo === 'viagemInternacional' || m.tipo === 'viagemNacional') ? migrarMetaViagem(m, { paises: estado.dados.paises, cidades: estado.dados.cidades }).meta : m);
    return { ...resposta, metas: (resposta.metas || []).map(mig), arquivadas: (resposta.arquivadas || []).map(mig) };
  }
  /** Os dados de países chegaram (ou mudaram): refaz a migração e redesenha o que depende deles. */
  function aoChegarDadosViagem() {
    if (!estado.resposta) return;
    estado.resposta = migrarResposta(estado.resposta); // idempotente
    estado.ctx = { ...contextoMetas(estado.resposta), historico: estado.ctx ? estado.ctx.historico : {} };
    aplicarHistoricoNoCtx();
    const a = estado.assistente;
    if (a) {
      const f = doc.activeElement;
      const digitando = f && el.dialogo.contains(f) && ['INPUT', 'TEXTAREA'].includes(f.tagName);
      if (a.passo === 2 && !digitando) desenharAssistente();
    } else desenhar();
  }

  function desenharResposta(resposta) {
    if (el.carregando) el.carregando.hidden = true;
    if (!resposta || !resposta.ok) {
      if (!estado.resposta && el.erro) {
        // 06/10/2026 (A-60/A-61): texto humano + "Tentar de novo"; o detalhe técnico fica num <details>
        mostrarErroCarga(el.erro, { tela: 'Metas e Objetivos', resposta, aoTentar: () => carregarERedesenhar(), doc });
      }
      return;
    }
    if (el.erro) el.erro.hidden = true;
    estado.resposta = migrarResposta(resposta);
    estado.ctx = contextoMetas(estado.resposta);
    aplicarHistoricoNoCtx();
    if (el.avisos) {
      const av = resposta.avisos || {};
      el.avisos.hidden = !Object.keys(av).length;
      el.avisos.innerHTML = Object.keys(av).length ? `Algumas informações não carregaram: ${Object.entries(av).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v)}`).join(' · ')}` : '';
    }
    el.tela.hidden = false;
    desenhar();
    abrirNovaPendente();
  }

  async function carregarHistorico() {
    if (!getMetasHistoricoImpl || estado.historicoCarregando) return;
    estado.historicoCarregando = true;
    if (!estado.historico && usarCache) {
      const emCache = await lerCacheDados('metasHistorico');
      if (emCache && emCache.dados && emCache.dados.ok) {
        estado.historico = emCache.dados.metas || {};
        estado.indices = emCache.dados.indices || [];
        aplicarHistoricoNoCtx();
        desenhar();
      }
    }
    let r = null;
    try { r = await getMetasHistoricoImpl(token); } catch (e) { r = { ok: false, erro: String(e) }; }
    estado.historicoCarregando = false;
    if (r && r.ok) {
      estado.historico = r.metas || {};
      estado.indices = r.indices || [];
      estado.historicoErro = null;
      gravarCacheDados('metasHistorico', r);
    } else if (!estado.historico) {
      estado.historicoErro = (r && r.erro) || 'sem resposta';
      estado.historico = {};
    }
    aplicarHistoricoNoCtx();
    if (estado.resposta) desenhar();
  }

  function desenhar() {
    if (!estado.resposta) return;
    fecharDica();
    const meta = estado.detalheId ? acharMeta(estado.detalheId) : null;
    if (estado.detalheId && meta) desenharDetalhe(meta);
    else desenharLista();
  }

  // ---------------- dicas ("i": toque/clique/teclado) ----------------
  let dicaAberta = null;
  function fecharDica() {
    if (!dicaAberta) return;
    dicaAberta.balao.remove();
    dicaAberta.botao.setAttribute('aria-expanded', 'false');
    dicaAberta.botao.removeAttribute('aria-describedby');
    dicaAberta = null;
  }
  function abrirDica(botao) {
    if (dicaAberta && dicaAberta.botao === botao) { fecharDica(); return; }
    fecharDica();
    const balao = doc.createElement('div');
    balao.className = 'mt-dica-balao';
    balao.id = `mtDica${Math.random().toString(36).slice(2, 8)}`;
    balao.setAttribute('role', 'tooltip');
    balao.innerHTML = `<p>${esc(botao.dataset.dica)}</p><button type="button" class="mt-dica-fechar" aria-label="Fechar explicação">×</button>`;
    doc.body.appendChild(balao);
    botao.setAttribute('aria-expanded', 'true');
    botao.setAttribute('aria-describedby', balao.id);
    const r = botao.getBoundingClientRect ? botao.getBoundingClientRect() : { left: 0, bottom: 0, top: 0 };
    const lw = (win && win.innerWidth) || 1024;
    const bw = Math.min(300, lw - 24);
    balao.style.width = `${bw}px`;
    const left = Math.max(12, Math.min(lw - bw - 12, r.left - bw / 2 + 8));
    const scrollY = (win && win.scrollY) || 0;
    balao.style.left = `${Math.round(left)}px`;
    balao.style.top = `${Math.round(r.bottom + scrollY + 8)}px`;
    dicaAberta = { botao, balao };
  }
  doc.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('.mt-info');
    if (b) { ev.preventDefault(); ev.stopPropagation(); abrirDica(b); return; }
    if (dicaAberta && (ev.target.closest('.mt-dica-fechar') || !ev.target.closest('.mt-dica-balao'))) fecharDica();
  }, true);
  doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && dicaAberta) { const b = dicaAberta.botao; fecharDica(); if (b.focus) b.focus(); } });

  // ---------------- lista ----------------
  function desenharLista() {
    const r = estado.resposta;
    const ativas = r.metas || [];
    const calcs = ativas.map((m) => ({ meta: m, c: calcDe(m) }));
    const res = resumoMetas(calcs.filter((x) => !ehMetaDistribuicao(x.meta)).map((x) => x.c), { // 06/10/2026: a distribuição da carteira não tem alvo em R$ (não entra nos totais)
      patrimonioVinculavel: estado.ctx && estado.ctx.alocacao ? estado.ctx.alocacao.patrimonioVinculavel : null });
    const arquivadas = (r.arquivadas || []).map((m) => ({ meta: m, c: calcDe(m) }));
    const base = estado.filtroStatus === 'arquivadas' ? arquivadas : calcs;
    const tiposPresentes = [...new Map(base.map(({ meta }) => [chaveTipo(meta), meta])).entries()];
    if (estado.filtroTipo !== 'todos' && !tiposPresentes.some(([k]) => k === estado.filtroTipo)) estado.filtroTipo = 'todos';
    const visiveis = base.filter(({ meta, c }) => passaFiltroStatus(estado.filtroStatus, c) && (estado.filtroTipo === 'todos' || chaveTipo(meta) === estado.filtroTipo));
    const sobre = ativosSobrecomprometidos(ativas, estado.ctx.ativos);
    const aporteReal = calcs.reduce((s, x) => s + (x.c.aporteAtual || 0), 0);

    let html = '';
    if (ativas.some((m) => !ehMetaDistribuicao(m))) {
      const faltaAporte = res.aporteNecessario - aporteReal;
      const infoPatrimonio = 'Cada investimento conta numa meta só: se duas metas vinculam o mesmo ativo, fica com a de maior prioridade (reserva de emergência, depois renda passiva, depois aposentadoria, depois as demais) - exceto a Aposentadoria, que pode contar os mesmos ativos da Reserva de emergência e da Renda passiva (é a mesma carteira). Por isso este total nunca passa do patrimônio que você tem investido.';
      const kpiIcone = (nome) => `<svg class="ico mt-kpi-ico" aria-hidden="true"><use href="#ico-${nome}"/></svg>`;
      // 06/10/2026 (Onda 3): cartões KPI do kit (rótulo pequeno + info, número grande, tendência com ícone - nunca só cor)
      html += `<section class="grid-kpi mt-resumo" aria-label="Resumo das metas">
  <article class="card"><div class="kpi">
    <div class="kpi-topo"><span class="kpi-rotulo">Metas ativas</span>${kpiIcone('target')}</div>
    <div class="kpi-valor">${res.quantidade}</div>
    <div class="kpi-sub">${res.noRitmo || !res.acompanhando ? `<span class="tendencia sobe"><svg class="ico" aria-hidden="true"><use href="#ico-north-east"/></svg>${res.noRitmo} no ritmo</span> ` : ''}${res.acompanhando ? `<span class="tendencia estavel"><svg class="ico" aria-hidden="true"><use href="#ico-trending-flat"/></svg>${res.acompanhando} acompanhando</span> ` : ''}${res.atrasadas ? `<span class="tendencia desce"><svg class="ico" aria-hidden="true"><use href="#ico-south-east"/></svg>${res.atrasadas} ${res.atrasadas === 1 ? 'precisa' : 'precisam'} de atenção</span>` : ''}</div>
  </div></article>
  <article class="card"><div class="kpi">
    <div class="kpi-topo"><span class="kpi-rotulo">Patrimônio alocado nas metas</span>${infoHtml(infoPatrimonio)}</div>
    <div class="kpi-valor">${valorGrandeHtml(res.atual)}</div>
    <div class="kpi-sub">de <b>${r0(res.alvo)}</b> somando os alvos</div>
  </div></article>
  <article class="card"><div class="kpi">
    <div class="kpi-topo"><span class="kpi-rotulo">Aporte mensal necessário</span>${infoHtml(EXPLICACOES.aporteNecessario)}</div>
    <div class="kpi-valor">${valorGrandeHtml(res.aporteNecessario)}</div>
    <div class="kpi-sub">você aporta <b>${r0(aporteReal)}</b>/mês (real/informado)${faltaAporte > 1 ? ` · <span class="tendencia desce"><svg class="ico" aria-hidden="true"><use href="#ico-south-east"/></svg>faltam ${r0(faltaAporte)}</span>` : (res.aporteNecessario > 0 ? ' · <span class="tendencia sobe"><svg class="ico" aria-hidden="true"><use href="#ico-check"/></svg>cobre tudo</span>' : '')}</div>
  </div></article>
</section>`;
    }
    if (sobre.length) {
      const grupos = new Map();
      sobre.forEach((s) => { const k = s.metas.join(' e '); grupos.set(k, [...(grupos.get(k) || []), s]); });
      const partes = [...grupos.entries()].map(([metas, lista]) => {
        const nomes = lista.slice(0, 3).map((s) => `<b>${esc(s.nome)}</b>`).join(', ') + (lista.length > 3 ? ` e mais ${lista.length - 3}` : '');
        return `${nomes} ${lista.length === 1 ? 'conta' : 'contam'} em <b>${esc(metas)}</b> (${r0(lista.reduce((t, s) => t + s.comprometido - s.valorBRL, 0))} a mais do que existe)`;
      });
      // 05/10/2026 (A-11): o progresso já conta cada ativo numa meta só (prioridade: reserva, renda passiva, aposentadoria, demais)
      // 06/10/2026: a exceção (Reserva x Aposentadoria podem contar os mesmos ativos) e o "ignorar este aviso" (persistido nas metas)
      const nomesSobre = new Set(sobre.flatMap((x) => x.metas));
      const idsSobre = ativas.filter((m) => nomesSobre.has(m.nome) && m.id).map((m) => m.id).join(',');
      html += `<p class="mt-alerta mt-alerta-acao"><span>O mesmo dinheiro está em mais de uma meta: ${partes.join(' · ')}. Cada ativo conta numa meta só - fica com a de maior prioridade (reserva, depois renda passiva, depois aposentadoria) e as outras contam só o que sobra; a exceção é a Aposentadoria, que pode contar os mesmos ativos da Reserva de emergência e da Renda passiva. Use uma fração ou um valor fixo nos vínculos para repartir.</span><button type="button" class="btn btn-text mt-btn-sm" data-ignorar-sobreposicao="${esc(idsSobre)}">Ignorar este aviso</button></p>`;
    }
    // 05/10/2026 (A-14): vínculo a ativo que não existe mais (vendido ou com outro ticker) - antes sumia em silêncio
    const orfaos = vinculosOrfaos(ativas, estado.ctx.ativos, estado.ctx.cambio, estado.ctx.aliases);
    if (orfaos.length) {
      html += `<p class="mt-alerta">Vínculos sem ativo correspondente (não contam no progresso): ${orfaos.map((o) => `<b>${esc(String(o.id || '').split('@')[0])}</b> em ${esc(o.meta)}`).join(' · ')}. Foram vendidos ou mudaram de ticker - abra a meta e refaça o vínculo.</p>`;
    }
    if (ativas.length || arquivadas.length) {
      const legenda = ['no-ritmo', 'atrasada', 'saldo-ideal', 'ideal-bruto', 'abaixo', 'vencida', 'sem-prazo', 'acompanhando'].map((k) => `${STATUS_META[k].rotulo}: ${STATUS_META[k].explicacao}`).join('\n\n');
      html += `<div class="mt-filtros">
  <div class="mt-filtros-status"><div id="mtAbasStatus"></div>${infoHtml(legenda, { rotulo: 'O que significa cada status?' })}</div>
  ${tiposPresentes.length > 1 ? `<div class="mt-filtro-tipos" role="group" aria-label="Tipo"><button type="button" class="chip ${estado.filtroTipo === 'todos' ? 'on' : ''}" aria-pressed="${estado.filtroTipo === 'todos'}" data-filtro-tipo="todos">Todos os tipos</button>${tiposPresentes.map(([k, m]) => `<button type="button" class="chip ${estado.filtroTipo === k ? 'on' : ''}" aria-pressed="${estado.filtroTipo === k}" data-filtro-tipo="${esc(k)}">${iconeMetaSvg(aparenciaMeta(m).icone, { tamanho: 16 })}${esc(aparenciaMeta(m).rotulo)}</button>`).join('')}</div>` : ''}
</div>`;
    }
    if (estado.filtroStatus === 'arquivadas' && arquivadas.length) {
      html += '<p class="mt-nota mt-nota-arq">Metas arquivadas não contam nos totais. Abra uma para <b>restaurar</b> ou <b>excluir definitivamente</b> (apaga a linha da aba aux_metas - não tem volta).</p>';
    }
    if (visiveis.length) {
      html += `<div class="mt-grade">${visiveis.map(({ meta, c }) => (ehMetaDistribuicao(meta) ? cardDistribuicaoHtml(meta, distribuicaoDe(meta), { seloHtml: seloMetaHtml(meta, { tamanho: 38 }), arquivada: meta.status === 'arquivada' }) : cardMetaHtml(meta, c))).join('')}</div>`;
    } else if (ativas.length || arquivadas.length) {
      html += '<div class="mt-vazio-filtro" id="mtVazioFiltro"></div>';
    }
    const sugestoes = sugestoesMetas({ referencias: estado.ctx.referencias, hoje: estado.ctx.hoje, existentes: ativas });
    if (!ativas.some((m) => !ehMetaDistribuicao(m))) {
      html += `<section class="mt-vazio">
  <div class="mt-vazio-cab">${iconeMetaSvg('alvo', { tamanho: 28 })}<div><h2>Comece por uma meta</h2><p>Escolha uma sugestão (já vem com os números da sua planilha) ou monte a sua do zero. Dá pra editar tudo depois.</p></div></div>
  <div class="mt-sugestoes">${sugestoes.map((s, i) => sugestaoHtml(s, i)).join('')}</div>
  <button class="btn btn-ghost" type="button" data-nova>Montar do zero</button>
</section>`;
    } else if (sugestoes.length && estado.filtroStatus === 'todas' && estado.filtroTipo === 'todos') {
      html += `<details class="mt-mais-sugestoes"><summary>Sugestões de metas</summary><div class="mt-sugestoes">${sugestoes.map((s, i) => sugestaoHtml(s, i)).join('')}</div></details>`;
    }
    el.tela.innerHTML = html;
    estado.sugestoes = sugestoes;
    // abas SUBLINHADAS = recortes dentro da subpágina (kit): status das metas
    const abasEl = doc.getElementById('mtAbasStatus');
    if (abasEl) {
      criarTabs(abasEl, {
        variante: 'sublinhada', rotulo: 'Status das metas', ativo: estado.filtroStatus, doc,
        itens: FILTROS_STATUS.filter(([k]) => k !== 'arquivadas' || arquivadas.length).map(([id, rotulo]) => ({ id, rotulo })),
        aoMudar: (id) => { estado.filtroStatus = id; desenhar(); },
      });
    }
    const vazioEl = doc.getElementById('mtVazioFiltro');
    if (vazioEl) {
      mostrarEstadoVazio(vazioEl, {
        icone: 'filter-list', titulo: 'Nenhuma meta nesse filtro', texto: 'Troque o status ou o tipo para ver as outras metas.', doc,
        acao: { rotulo: 'Limpar filtros', aoClicar: () => { estado.filtroStatus = 'todas'; estado.filtroTipo = 'todos'; desenhar(); } },
      });
    }
    definirTituloPagina({ subaba: 'Minhas metas', secao: 'Metas e Objetivos' }, doc);
    montarProgressos(el.tela);
  }

  function sugestaoHtml(s, i) {
    const c = calcDe(s.meta);
    const ap = aparenciaMeta(s.meta);
    const valor = c.renda ? `${r0(c.renda.alvo)}/mês` : (c.alvoBRL != null ? (c.moeda !== 'BRL' ? formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 }) : r0(c.alvoBRL)) : '');
    return `<button type="button" class="mt-sugestao" data-sugestao="${i}" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  ${seloMetaHtml(s.meta, { tamanho: 34 })}
  <span class="mt-sug-txt"><strong>${esc(s.meta.nome)}</strong><span>${esc(s.porque)}</span></span>
  <span class="mt-sug-valor mono">${valor}</span>
  <span class="mt-sug-mais" aria-hidden="true">+</span>
</button>`;
  }

  // ---------------- detalhe ----------------
  function horizonteProjecao(c) {
    const venc = c.vencimentos && c.vencimentos.eventos.length ? Math.max(...c.vencimentos.eventos.map((e) => e.em + 3)) : 0; // 05/10/2026: até o último vencimento
    const fim = Math.max(c.mesesRestantes || 0, Number.isFinite(c.mesesEstimados) ? Math.ceil(c.mesesEstimados) : 0, venc);
    return Math.min(720, Math.max(12, fim || 12));
  }

  /** 06/10/2026: atual x meta da meta "Distribuição da carteira" (o atual vem da planilha: GET metas -> distribuicaoAtual). */
  function distribuicaoDe(meta) {
    return calcularDistribuicao(pesosDaMeta(meta), atuaisDeResposta(estado.resposta && estado.resposta.distribuicaoAtual));
  }
  /** A meta de distribuição ativa (só existe uma: os pesos dela vão pra planilha). */
  function distribuicaoExistente() { return ((estado.resposta && estado.resposta.metas) || []).find((x) => ehMetaDistribuicao(x)) || null; }
  function desenharDetalheDistribuicao(meta) {
    el.tela.innerHTML = detalheDistribuicaoHtml(meta, distribuicaoDe(meta), { seloHtml: seloMetaHtml(meta, { tamanho: 46 }), arquivada: meta.status === 'arquivada' });
    definirTituloPagina({ subaba: meta.nome, secao: 'Metas e Objetivos' }, doc);
  }

  function desenharDetalhe(meta) {
    if (ehMetaDistribuicao(meta)) { desenharDetalheDistribuicao(meta); return; }
    const c = calcDe(meta);
    const arquivada = meta.status === 'arquivada';
    const hoje = estado.ctx.hoje;
    const hist = estado.historico ? estado.historico[meta.id] : null;
    const marcosRitmo = c.alvoBRL > 0 ? marcosProjecao(c, { hoje, anoNascimento: num(meta.especificos && meta.especificos.anoNascimento) }) : [];
    let html = `<div class="mt-detalhe">
<nav class="breadcrumb mt-breadcrumb" aria-label="Você está em"><ol><li><a href="#" data-voltar>Metas e Objetivos</a><span class="bc-sep" aria-hidden="true"><svg class="ico"><use href="#ico-chev-r"/></svg></span></li><li><span aria-current="page">${esc(meta.nome)}</span></li></ol></nav>
${heroiHtml(meta, c, { arquivada, marcos: marcosRitmo })}
<div class="mt-colunas">
  <div class="mt-col-principal">`;

    // 04/10/2026: viagem - primeiro as contas (a pagar x a juntar, entradas, destinos)
    if (c.viagem) html += viagemDetalheHtml(meta, c, { cambio: estado.ctx.cambio, dados: estado.dados });

    // histórico
    html += `<section class="mt-bloco" id="mtHistBloco"><div class="mt-bloco-cab"><h3>Histórico${infoHtml(EXPLICACOES.historico)}</h3>
      <div class="mt-bloco-ctrl"><div class="segmented mt-modo" role="group" aria-label="Visão"><button type="button" aria-pressed="${estado.modoHist === 'acumulado'}" data-modo-hist="acumulado">Acumulado</button><button type="button" aria-pressed="${estado.modoHist === 'mensal'}" data-modo-hist="mensal">Mês a mês</button></div>
      ${tabsPeriodoHtml(PERIODOS_HIST, estado.periodos.hist, 'Período do histórico')}</div></div>
      <div class="mt-grafico-caixa" id="mtHistGrafico"></div>
      <div class="mt-analise" id="mtHistAnalise"></div></section>`;

    if (meta.tipo === 'rendaPassiva') {
      html += `<section class="mt-bloco" id="mtRendaBloco"><div class="mt-bloco-cab"><h3>Renda mês a mês${infoHtml(EXPLICACOES.rendaMensal)}</h3>${tabsPeriodoHtml(PERIODOS_HIST, estado.periodos.renda, 'Período da renda')}</div>
      <div class="mt-grafico-caixa" id="mtRendaGrafico"></div>
      <div class="mt-analise" id="mtRendaAnalise"></div></section>`;
    }

    html += excedenteHtml(meta, c);
    html += vencimentosHtml(meta, c);
    if (c.alvoBRL != null && (!(c.status === 'concluida' || c.status === 'saldo-ideal') || (c.vencimentos && c.vencimentos.eventos.length))) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Evolução projetada${infoHtml(EXPLICACOES.projecao)}</h3>${tabsPeriodoHtml(PERIODOS_PROJ, estado.periodos.proj, 'Horizonte da projeção')}</div>
      <div class="mt-grafico-caixa" id="mtGrafico"></div>
      <p class="mt-nota" id="mtGraficoNotas" hidden></p>
      <p class="mt-nota">${c.taxa ? `Rendimento de ${pct(meta.rendimentoAnual || 0, 1)} ao ano (${pct(c.taxa, 2)} ao mês), aportes no fim de cada mês.` : 'Sem rendimento informado - só a soma dos aportes.'}${meta.tipo === 'reservaEmergencia' ? ' Parte do valor líquido de hoje.' : ''}</p>
      <div class="mt-analise" id="mtProjAnalise"></div></section>`;
    }

    html += velocidadeHtml(meta, c);
    html += estimativasHtml(meta, c, { hoje, aberta: estado.estimAberta, sim: estado.simPreco[meta.id] || null }); // 07/10/2026: seção recolhível "Estimativas"
    if (meta.tipo === 'aposentadoria' || (meta.tipo === 'rendaPassiva' && c.alvoBRL > 0)) html += marcosHtml(meta, c, marcosRitmo);
    if (!c.viagem) html += entradasDetalheHtml(meta, c); // 04/10/2026: entradas programadas valem pra qualquer meta (na viagem vêm junto)

    if (c.partes.length && meta.tipo !== 'acumulo' && !c.viagem) { // viagem: a conta está em "A juntar"
      const ehApos = meta.tipo === 'aposentadoria';
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>De onde vem o alvo</h3>${ehApos && !arquivada ? '<button type="button" class="mt-link" data-editar>Editar a conta</button>' : ''}</div><ul class="mt-partes ${ehApos ? 'passos' : ''}">${c.partes.map((pt) => `<li class="${/^=/.test(pt.rotulo) ? 'sub' : ''}"><span>${esc(pt.rotulo)}${pt.chave === 'extra' ? infoHtml(EXPLICACOES.extra) : pt.chave === 'reinvestimento' ? infoHtml(EXPLICACOES.reinvestimento) : pt.chave === 'taxa' ? infoHtml(EXPLICACOES.taxaRetirada) : ''}</span><b class="mono">${pt.tipo === '%' ? pct(pt.valor, 1) : pt.tipo === 'n' ? pt.valor : (pt.moeda && pt.moeda !== 'BRL' ? `${formatMoeda(pt.valorMoeda, pt.moeda, { casas: 0 })} ≈ ${formatMoeda(pt.valor)}` : formatMoeda(pt.valor))}</b></li>`).join('')}<li class="total"><span>${meta.tipo === 'rendaPassiva' ? 'Patrimônio necessário' : meta.tipo === 'reservaEmergencia' ? 'Saldo ideal' : ehApos ? `Montante = renda x 12 / ${pct(c.aposentadoria ? c.aposentadoria.taxa : 0, 1)}` : 'Alvo'}</span><b class="mono">${formatMoeda(c.alvoBRL)}</b></li></ul>
      ${meta.tipo === 'reservaEmergencia' ? '<p class="mt-nota">O custo de vida vem das Despesas essenciais (Organização Financeira) - adicionar ou remover uma despesa lá muda o saldo ideal aqui. O status olha o valor LÍQUIDO: o que cairia na conta se resgatasse tudo hoje.</p>' : ''}
      ${ehApos && c.aposentadoria && c.aposentadoria.modo === 'calculado' ? '<p class="mt-nota">É a mesma conta da planilha (Distribuição e Metas, K17 a N19). As despesas vêm da renda emergencial (Despesas essenciais); extra, % de reinvestimento e rendimento você muda em Editar.</p>' : ''}</section>`;
    }
    if (c.conta) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>${esc(c.conta.descricao || 'Conta mensal')}</h3><span class="mt-fraco">${c.conta.pagas} de ${c.conta.total} parcelas</span></div>
      <div class="mt-heroi-barra"><span class="mt-prog" data-prog="${(c.conta.pagas / c.conta.total).toFixed(4)}" data-cor="${esc(aparenciaMeta(meta).cor)}" data-rotulo="${esc(`${c.conta.pagas} de ${c.conta.total} parcelas pagas`)}"></span></div>
      <p class="mt-nota">${formatMoeda(c.conta.valor)}/mês · total ${formatMoeda(c.conta.valorTotal)} · pago ${formatMoeda(c.conta.valorPago)}${c.conta.inicio ? ` · desde ${rotuloMes(c.conta.inicio)}` : ''}</p></section>`;
    }
    if (c.recorrente) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Pagamento recorrente</h3><span class="mt-fraco">${c.recorrente.pagas} de ${c.recorrente.total} parcelas</span></div>
      <p class="mt-nota">${formatMoeda(c.recorrente.parcela)}/mês${c.recorrente.fim ? ` · última parcela em ${rotuloMes(c.recorrente.fim)}` : ''} · faltam ${formatMoeda(c.recorrente.parcela * c.recorrente.restantes)}</p></section>`;
    }
    if (!['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].includes(meta.tipo) && meta.contribuicao !== 'recorrente') {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Itens de custo</h3><span class="mt-fraco">${c.itens.length ? (c.viagem && c.viagem.temDestinos ? 'somados ao gasto dos destinos' : 'o alvo é a soma dos itens') : 'opcional - divida o alvo em partes'}</span></div><div id="mtItensDetalhe"></div></section>`;
    }
    html += '</div><div class="mt-col-lateral">';
    html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Onde está o dinheiro</h3>${arquivada ? '' : '<button type="button" class="mt-link" data-editar-vinculos>Editar</button>'}</div>${vinculosDetalheHtml(meta, c, { arquivada })}</section>`;
    html += avaliacaoHtml(meta, c);
    if (!arquivada) html += '<section class="mt-bloco" id="mtSimulador"></section>';
    const dicas = aparenciaMeta(meta).dicas || [];
    if (dicas.length) html += `<section class="mt-bloco mt-dicas"><h3>Dicas</h3><ul>${dicas.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></section>`;
    html += '</div></div></div>';
    el.tela.innerHTML = html;
    definirTituloPagina({ subaba: meta.nome, secao: 'Metas e Objetivos' }, doc);
    montarAneis(el.tela);
    montarProgressos(el.tela);
    recolherNoCelular(el.tela, win, doc);

    desenharHistorico(meta, c);
    desenharRenda(meta, c);
    desenharGrafico(c, marcosRitmo);
    ligarFiltros(meta);
    const itensEl = doc.getElementById('mtItensDetalhe');
    if (itensEl) {
      montarEditorItens(itensEl, meta, { aoMudar: (itens) => salvar({ ...clonar(meta), itens }, { manterDetalhe: true, silencioso: true }), somenteLeitura: arquivada, cambio: estado.ctx.cambio });
    }
    const simEl = doc.getElementById('mtSimulador');
    if (simEl) montarSimulador(simEl, meta, c);
    if (temEstimativas(meta)) {
      const simPreco = estado.simPreco[meta.id] || (estado.simPreco[meta.id] = { preco: (meta.especificos && meta.especificos.precoReferencia) || null, ano: null });
      ligarEstimativas(el.tela, {
        meta, c, hoje, sim: simPreco, parseNumero: parseNumeroBR,
        aoGuardar: async (preco) => {
          const m = clonar(meta); m.especificos = { ...(m.especificos || {}), precoReferencia: preco };
          const salva = await salvar(m, { manterDetalhe: true, silencioso: true });
          if (salva) { toast.ok('Preço de referência guardado.', { doc }); estado.estimAberta = true; desenhar(); }
        },
        aoUsarComoAlvo: async (parte, preco) => {
          const m = clonar(meta); m.especificos = { ...(m.especificos || {}), precoReferencia: preco };
          if (m.tipo === 'casa') { m.especificos.valorImovel = Math.round(preco / pessoasDoGrupo(m)); m.especificos.entradaPct = 1; } else if (m.tipo === 'carro') { m.especificos.valorCarro = Math.round(preco / pessoasDoGrupo(m)); m.especificos.entradaPct = 1; } else m.valorAlvo = Math.round(parte);
          estado.estimAberta = true;
          await salvar(m, { manterDetalhe: true });
        },
      });
    }
    void hist;
  }

  function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

  function velocidadeHtml(meta, c) {
    const vel = velocidadeMeta(c, { hoje: estado.ctx.hoje });
    if (!vel || vel.chegou || !vel.cenarios.length) return '';
    const dicas = dicasAcelerar(c, meta, { hoje: estado.ctx.hoje });
    const base = vel.cenarios[0];
    const cards = vel.cenarios.map((x) => {
      const titulo = x.fracao === 1 ? (vel.origem === 'ritmo' ? 'No seu ritmo' : 'Até o prazo') : `Em ${Math.round(x.fracao * 100)}% do tempo`;
      const delta = x.fracao === 1 ? '' : chipDelta(x.aMais, { sufixo: '/mês', positivoBom: false });
      return `<div class="mt-vel ${x.fracao === 1 ? 'base' : ''}"><span class="mt-vel-tit">${titulo}</span><b class="mt-vel-data">${rotuloMes(x.data)}</b><span class="mt-vel-dur">${rotuloDuracao(x.meses)}</span><span class="mt-vel-ap"><b>${r0(x.aporte)}</b>/mês ${delta}</span></div>`;
    }).join('');
    return `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Quanto tempo leva${infoHtml(EXPLICACOES.velocidade)}</h3><span class="mt-fraco">${vel.origem === 'ritmo' ? `base: seu ritmo de ${r0(c.aporteAtual)}/mês` : 'base: o prazo da meta'}</span></div>
  <div class="mt-vels">${cards}</div>
  <p class="mt-nota">Para chegar em ${rotuloDuracao(vel.cenarios[1].meses)} (75% do tempo), aporte ${r0(vel.cenarios[1].aporte)}/mês; em ${rotuloDuracao(vel.cenarios[2].meses)} (metade), ${r0(vel.cenarios[2].aporte)}/mês - com o mesmo rendimento de ${pct(meta.rendimentoAnual || 0, 1)} a.a.</p>
  ${vel.cenarios.some((x) => x.comIsso) ? `<ul class="mt-comisso">${vel.cenarios.filter((x) => x.comIsso).map((x) => `<li><b>${x.fracao === 1 ? (vel.origem === 'ritmo' ? 'No seu ritmo' : 'Até o prazo') : `Em ${Math.round(x.fracao * 100)}% do tempo`}:</b> ${esc(x.comIsso)}${x.velocidadeMarcos ? ` <span class="mt-fraco">${esc(x.velocidadeMarcos)}</span>` : ''}</li>`).join('')}</ul>` : ''}
  ${dicas.length ? `<h4 class="mt-grupo">Como acelerar</h4><ul class="mt-dicas-acel">${dicas.slice(0, 5).map((d) => `<li><span class="mt-dica-ico ${d.mesesAMenos > 0 ? 'bom' : ''}">${iconeNum(d.mesesAMenos > 0 ? 'foguete' : 'moeda', 14)}</span><span>${esc(d.texto)}${d.comIsso ? `<small class="mt-comisso-dica">${esc(d.comIsso)}</small>` : ''}</span></li>`).join('')}</ul>` : ''}
</section>`;
  }

  /**
   * 05/10/2026: reserva com títulos de renda fixa que vencem (IR cobrado, dinheiro cai na conta).
   * 06/10/2026 (Tiago: "muito poluído com essas mensagens de atenção; o background não precisa ser dessa cor. Considere sempre o
   * alerta só se algum título vencer em menos de um ano"): lista neutra com chip de estado; o alerta (amarelo) só aparece pra
   * título que vence em menos de 12 meses com a reserva caindo abaixo do mínimo; os demais ficam como informação discreta e o
   * texto longo fica recolhido em "detalhes".
   */
  function vencimentosHtml(meta, c) {
    const v = c.vencimentos;
    if (meta.tipo !== 'reservaEmergencia' || !v || !v.eventos.length) return '';
    const itens = v.eventos.map((e) => {
      const alerta = e.tom === 'atencao';
      const nomes = e.titulos.map((t) => esc(t.nome)).join(' e ');
      const chip = alerta ? '<span class="mt-status warn">Atenção</span>' : '<span class="mt-status na">Sem alerta</span>';
      return `<li class="mt-venc ${alerta ? 'atencao' : ''}">
    <div class="mt-venc-cab"><span class="mt-venc-data">${iconeNum('marco', 14)} ${rotuloMes(e.mes)}<small>${e.em > 0 ? `daqui a ${rotuloDuracao(e.em)}` : 'este mês'}</small></span><span class="mt-venc-nome">${nomes}</span>
      <span class="mt-venc-liq mono">entram ${formatMoeda(e.liquido, 'BRL', { casas: 0 })}<small> (IR ${formatMoeda(e.ir, 'BRL', { casas: 0 })})</small></span>${chip}</div>
    ${alerta ? `<p class="mt-venc-txt">${esc(e.texto)}</p>` : ''}
    <details class="mt-venc-det"><summary>detalhes</summary>
    ${alerta ? '' : `<p class="mt-venc-txt">${esc(e.texto)}</p>`}
    <dl class="mt-venc-nums">
      <div><dt>Reserva sem reaplicar</dt><dd class="mono">${formatMoeda(e.reservaSemReaplicar, 'BRL', { casas: 0 })}</dd></div>
      <div><dt>Reserva reaplicando</dt><dd class="mono">${formatMoeda(e.reservaReaplicando, 'BRL', { casas: 0 })}</dd></div>
      ${e.falta > 0 ? `<div><dt>Falta pro mínimo</dt><dd class="mono">${formatMoeda(e.falta, 'BRL', { casas: 0 })}</dd></div>` : ''}
    </dl></details></li>`;
    }).join('');
    return `<section class="mt-bloco" id="mtVencimentos"><div class="mt-bloco-cab"><h3>Títulos que vencem${infoHtml(EXPLICACOES.vencimentos)}</h3><span class="mt-fraco">mínimo ${v.minimo != null ? formatMoeda(v.minimo, 'BRL', { casas: 0 }) : '-'} (líquido)</span></div>
  <ul class="mt-vencs">${itens}</ul>
  <p class="mt-nota">No vencimento o IR é cobrado obrigatoriamente (tabela regressiva pelo tempo total aplicado) e o dinheiro cai na conta: deixa de ser o título e de contar na reserva, até você reaplicar. Só vira alerta o que vence em menos de ${LIMITE_ALERTA_VENCIMENTO_MESES} meses e derruba a reserva abaixo do mínimo. Valores projetados com ${c.taxa ? `rendimento de ${pct(meta.rendimentoAnual || 0, 1)} a.a.` : 'rendimento zero (informe o rendimento em Editar)'}, sem novos aportes.</p></section>`;
  }

  function marcosHtml(meta, c, marcosRitmo) {
    const marcosNec = c.aporteNecessario > 0 ? marcosProjecao(c, { hoje: estado.ctx.hoje, aporte: c.aporteNecessario, anoNascimento: num(meta.especificos && meta.especificos.anoNascimento) }) : [];
    const cen = cenariosRendaMenor(c, { hoje: estado.ctx.hoje });
    const celula = (m) => (m.ja ? '<span class="mt-bom">já tem ✓</span>' : m.mes ? `<b>${rotuloMes(m.mes)}</b>${m.idade ? ` <span class="mt-fraco">(${m.idade} anos)</span>` : ''}` : '<span class="mt-fraco">não chega</span>');
    const linhas = marcosRitmo.map((m, i) => `<tr class="${m.rotulo === 'Alvo' ? 'alvo' : ''}"><th scope="row">${iconeNum('marco', 13)} ${esc(m.rotulo)}<span class="mt-fraco"> ${r0(m.valor)}</span></th><td>${celula(m)}</td>${marcosNec.length ? `<td>${celula(marcosNec[i])}</td>` : ''}</tr>`).join('');
    const rendaBase = c.aposentadoria ? c.aposentadoria.renda : (c.renda ? c.renda.alvo : null);
    return `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Marcos até o alvo${infoHtml(EXPLICACOES.marcos)}</h3>${!num(meta.especificos && meta.especificos.anoNascimento) && meta.tipo === 'aposentadoria' ? '<span class="mt-fraco">informe o ano de nascimento em Editar pra ver a idade</span>' : ''}</div>
  <div class="card card-flat"><div class="tabela-wrap"><table class="tabela tabela-baixa mt-tabela"><thead><tr><th scope="col">Marco</th><th scope="col">No seu ritmo (${r0(c.aporteAtual)}/mês)</th>${marcosNec.length ? `<th scope="col">No necessário (${r0(c.aporteNecessario)}/mês)</th>` : ''}</tr></thead><tbody>${linhas}</tbody></table></div></div>
  ${fraseMarcos(marcosRitmo, { alvo: c.alvoBRL }) ? `<p class="mt-nota mt-comisso-p"><b>No seu ritmo (${r0(c.aporteAtual)}/mês).</b> ${esc(fraseMarcos(marcosRitmo, { alvo: c.alvoBRL }))}${velocidadeEntreMarcos(marcosRitmo) ? ` Velocidade: ${esc(velocidadeEntreMarcos(marcosRitmo))}` : ''}</p>` : ''}
  ${marcosNec.length && fraseMarcos(marcosNec, { alvo: c.alvoBRL }) ? `<p class="mt-nota mt-comisso-p"><b>Com o aporte necessário (${r0(c.aporteNecessario)}/mês).</b> ${esc(fraseMarcos(marcosNec, { alvo: c.alvoBRL }))}${velocidadeEntreMarcos(marcosNec) ? ` Velocidade: ${esc(velocidadeEntreMarcos(marcosNec))}` : ''}</p>` : ''}
  ${cen.length ? `<h4 class="mt-grupo">E se a renda fosse menor?</h4><div class="mt-cenarios">${cen.map((x) => `<div class="mt-cen"><span class="mt-cen-tit">Renda ${Math.round(x.reducao * 100)}% menor${x.renda ? ` (${r0(x.renda)}/mês)` : ''}</span><b>${r0(x.montante)}</b><span>precisaria juntar · <span class="mt-bom">−${r0(x.economia)}</span></span>${x.aporteNecessario != null ? `<span>aporte até o prazo: <b>${r0(x.aporteNecessario)}</b>/mês</span>` : ''}${x.data ? `<span>no seu ritmo: <b>${rotuloMes(x.data)}</b>${x.mesesAMenos > 0 ? ` (${rotuloDuracao(x.mesesAMenos)} antes)` : ''}</span>` : ''}${x.comIsso ? `<span class="mt-fraco">${esc(x.comIsso)}</span>` : ''}</div>`).join('')}</div>
  <p class="mt-nota">Montante = renda x 12 / ${pct(c.aposentadoria ? c.aposentadoria.taxa : (meta.especificos && meta.especificos.dyAnual) || 0, 1)}${rendaBase ? `, a partir da renda de ${r0(rendaBase)}/mês` : ''}.</p>` : ''}
</section>`;
  }

  function vinculosDetalheHtml(meta, c, { arquivada = false } = {}) {
    const reserva = meta.tipo === 'reservaEmergencia';
    if (!c.vinculos.length && !c.valorInicial) return `<p class="mt-nota">Nenhum investimento ou saldo vinculado: o progresso conta só o que você informou como já guardado.</p>${arquivada ? '' : '<button type="button" class="mt-link" data-editar-vinculos>+ Vincular investimentos ou um saldo em conta</button>'}`;
    const detalheAtivo = (a, parte) => {
      const ir = a.irResgate;
      const imposto = ir ? ((ir.ir || 0) + (ir.iof || 0)) * parte : 0;
      const sub = [ROTULO_CLASSE[a.classe], a.classe === 'rf' && a.marca ? ROTULO_MARCA[a.marca] : null, a.instituicao, a.indexador, a.vencimento ? `vence ${a.vencimento}` : null].filter(Boolean).map(esc).join(' · ');
      return `<li class="mt-v-ativo"><span class="mt-v-nome"><a href="${esc(urlAtivo(a.ref))}">${esc(a.nome)}</a><em>${sub}</em>${ir && imposto > 0.004 ? `<em class="mt-v-ir">IR${ir.iof ? '+IOF' : ''} se resgatasse hoje: <span class="mt-ruim">−${formatMoeda(imposto)}</span> · líquido ${formatMoeda(a.valorBRL * parte - imposto)}</em>` : (ir && ir.isento ? '<em class="mt-v-ir">isento de IR</em>' : '')}</span><b class="mono">${formatMoeda(a.valorBRL * parte)}</b></li>`;
    };
    const linhas = c.vinculos.map((v) => {
      if (v.tipo === 'saldo') {
        const editando = estado.editandoSaldo === v.id;
        const hist = (v.historico || []).slice(-4).reverse();
        // 07/10/2026: "Saldo ou investimento fora da carteira" - com % do CDI mostra a estimativa de hoje (sem somar aportes) e convida a atualizar
        const textoEst = v.estimativa ? textoEstimativa(v.estimativa, (x) => formatMoeda(x)) : '';
        return `<li class="mt-v-saldo"><span class="mt-v-nome"><strong>${iconeNum('carteira', 13)} Fora da carteira · ${esc(v.nome || v.instituicao)}</strong><em>${v.nome ? `${esc(v.instituicao)} · ` : ''}${formatMoeda(Number(v.saldo) || 0, v.moeda || 'BRL')}${v.moeda !== 'BRL' && v.cotacao ? ` x ${formatMoeda(v.cotacao, 'BRL', { casas: 2 })}` : ''} · informado em ${v.atualizadoEm ? v.atualizadoEm.split('-').reverse().join('/') : '—'}${infoHtml(EXPLICACOES.saldoConta)}</em>
          ${textoEst ? `<em class="mt-v-estim">${esc(textoEst)}. Atualize o saldo quando tiver o extrato novo (o site não soma aportes sozinho).</em>` : ''}
          ${v.contaNoPatrimonio ? '<em class="mt-v-patrim">conta no meu patrimônio (Organização e Início)</em>' : ''}
          ${hist.length > 1 ? `<em class="mt-v-hist">antes: ${hist.slice(1).map((h) => `${formatMoeda(h.saldo, v.moeda || 'BRL', { casas: 0 })} em ${h.data.split('-').reverse().slice(0, 2).join('/')}`).join(' · ')}</em>` : ''}
          ${arquivada ? '' : (editando ? `<span class="mt-saldo-form"><label class="sr" for="mtSaldoNovo">Novo saldo</label><span class="mt-entrada"><span class="mt-prefixo">${esc(v.moeda || 'BRL')}</span><input id="mtSaldoNovo" inputmode="decimal" value="${numParaCampo(Number(v.saldo) || 0)}"></span><button type="button" class="btn btn-primary mt-btn-sm" data-saldo-salvar="${esc(v.id)}">Salvar</button><button type="button" class="btn btn-ghost mt-btn-sm" data-saldo-cancelar>Cancelar</button></span>` : `<button type="button" class="mt-link" data-saldo-editar="${esc(v.id)}">Atualizar saldo</button>`)}</span>
          <b class="mono">${formatMoeda(v.valorBRL)}</b></li>`;
      }
      const parte = v.base > 0 ? v.valorBRL / v.base : 0;
      const modo = v.modo === 'fracao' ? `${pct(v.fracao, 0)} de ${r0(v.base)}` : v.modo === 'valor' ? `valor fixo (de ${r0(v.base)})` : 'total';
      if (v.tipo === 'ativo') {
        const a = v.ativos[0];
        if (!a) return `<li><span class="mt-v-nome">${esc(v.nome || v.id)}<em class="mt-ruim">não encontrado na carteira hoje</em></span><b class="mono">${formatMoeda(0)}</b></li>`;
        return detalheAtivo(a, parte).replace('<em>', `<em>${v.modo !== 'total' ? `${esc(modo)} · ` : ''}`);
      }
      const nome = v.tipo === 'classe' ? `Toda a classe ${ROTULO_CLASSE[v.classe]}` : ROTULO_MARCA[v.marca];
      return `<li class="mt-v-grupo"><details><summary><span class="mt-v-nome"><strong>${esc(nome)}</strong><em>${v.ativos.length} ${v.classe === 'rf' || v.tipo === 'marca' ? 'títulos' : 'ativos'} · ${esc(modo)}${v.impostoBRL > 0.004 ? ` · <span class="mt-ruim">IR −${r0(v.impostoBRL)}</span>` : ''}</em></span><b class="mono">${formatMoeda(v.valorBRL)}</b></summary><ul>${v.ativos.slice().sort((x, y) => y.valorBRL - x.valorBRL).map((a) => detalheAtivo(a, parte)).join('')}</ul></details></li>`;
    }).join('');
    const liquidoLinha = c.liquido.impostoBRL > 0 || reserva
      ? `<li class="total liquido"><span>Líquido se resgatasse hoje${infoHtml(EXPLICACOES.liquido)}</span><b class="mono">${formatMoeda(c.atualLiquidoBRL)}</b></li>${c.liquido.rvSemEstimativa ? '<li class="nota"><span class="mt-fraco">IR de ações/FIIs não estimado (depende do preço médio e da isenção de R$ 20 mil/mês em ações).</span></li>' : ''}`
      : '';
    return `<ul class="mt-vinculos">${linhas}${c.valorInicial ? `<li><span class="mt-v-nome">Guardado fora dos investimentos<em>informado por você</em></span><b class="mono">${formatMoeda(c.valorInicial)}</b></li>` : ''}${c.itensConcluidosBRL ? `<li><span class="mt-v-nome">Itens já pagos</span><b class="mono">${formatMoeda(c.itensConcluidosBRL)}</b></li>` : ''}<li class="total"><span>Total${c.liquido.impostoBRL > 0 ? ' (bruto)' : ''}</span><b class="mono">${formatMoeda(c.atualBRL)}</b></li>${liquidoLinha}</ul>${arquivada ? '' : '<button type="button" class="mt-link mt-add-saldo" data-add-saldo>+ Saldo em conta (ex. Wise em euro)</button>'}`;
  }

  function avaliacaoHtml(meta, c) {
    const av = avaliarVinculos(meta, c);
    const chave = chaveSugestaoInvestimento(meta, c);
    const sug = SUGESTOES_INVESTIMENTO[chave];
    const ROT = { bom: 'Combina', atencao: 'Atenção', ruim: 'Não combina' };
    const itens = av.itens.map((x) => `<li class="mt-av ${x.veredito}"><span class="mt-av-selo">${x.veredito === 'bom' ? '✓' : x.veredito === 'ruim' ? '✕' : '!'}</span><span><b>${esc(x.nome || (x.vinculo.tipo === 'classe' ? `Classe ${ROTULO_CLASSE[x.vinculo.classe]}` : ROTULO_MARCA[x.vinculo.marca] || ''))}</b> <em class="mt-av-rot">${ROT[x.veredito]}</em><br>${esc(x.motivo)}</span></li>`).join('');
    return `<section class="mt-bloco mt-bloco-sug"><div class="mt-bloco-cab"><h3>Seus investimentos combinam?${infoHtml(EXPLICACOES.avaliacao)}</h3></div>
  <p class="mt-av-resumo ${!av.itens.length ? 'neutro' : av.resumo.ruim ? 'ruim' : av.resumo.atencao ? 'atencao' : 'bom'}">${esc(av.resumo.texto)}</p>
  ${itens ? `<ul class="mt-avs">${itens}</ul>` : ''}
  ${sug ? `<details class="mt-sug-inv" ${av.itens.length ? '' : 'open'}><summary>O que as fontes sugerem: ${esc(sug.titulo)}</summary>
    <ul>${sug.itens.map((i) => `<li><b>${esc(i.nome)}</b> - ${esc(i.porque)}</li>`).join('')}</ul>
    <p class="mt-nota">${esc(sug.evitar)}</p>
    <p class="mt-fontes">Fontes: ${sug.fontes.map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.nome)}</a>`).join(' · ')}</p>
    <p class="mt-nota">Resumo educativo dessas fontes, não é recomendação individual.</p></details>` : ''}
</section>`;
  }

  // ---------------- gráficos ----------------
  // 06/10/2026 (Onda 3): os três gráficos agora são da biblioteca assets/js/charts (traduzidos por metas-graficos.js);
  // trocar o período/modo MORFA o gráfico que já está na caixa em vez de redesenhar do zero.
  const textoCaixa = (caixa, texto, { carregando = false } = {}) => {
    limparGrafico(caixa);
    const p = doc.createElement('p');
    p.className = `hint${carregando ? ' mt-carregando-hist' : ''}`;
    p.textContent = texto;
    caixa.append(p);
  };

  function desenharHistorico(meta, c) {
    const caixa = doc.getElementById('mtHistGrafico');
    if (!caixa) return;
    const leg = doc.getElementById('mtHistLegenda');
    const anal = doc.getElementById('mtHistAnalise');
    const semVinculos = !(meta.vinculos || []).length;
    if (semVinculos) { textoCaixa(caixa, 'Vincule investimentos ou um saldo em conta pra ver como a meta evoluiu mês a mês.'); return; }
    if (!estado.historico) { textoCaixa(caixa, 'Carregando o histórico…', { carregando: true }); return; }
    const h = estado.historico[meta.id];
    if (!h || !h.meses || h.meses.length < 2) {
      textoCaixa(caixa, estado.historicoErro ? 'Não consegui carregar o histórico agora. Atualize os dados para tentar de novo.' : 'Ainda não há histórico suficiente (precisa de pelo menos 2 meses com valor).');
      return;
    }
    const meses = recortarMeses(h.meses, estado.periodos.hist);
    const spec = opcoesHistorico(meses, { alvo: c.alvoBRL, modo: estado.modoHist, mesAtual: mesDe(estado.ctx.hoje) });
    if (!spec) { textoCaixa(caixa, 'Ainda não há histórico suficiente nesse período.'); return; }
    montarGrafico(caixa, spec);
    if (leg) leg.hidden = true; // a legenda agora é a da própria biblioteca
    if (anal) renderAnalise(doc, anal, analisarHistoricoMeta({ meses, calc: c, indices: estado.indices }), { titulo: 'Análise do histórico' });
  }

  function desenharRenda(meta, c) {
    const caixa = doc.getElementById('mtRendaGrafico');
    if (!caixa) return;
    const anal = doc.getElementById('mtRendaAnalise');
    if (!estado.historico) { textoCaixa(caixa, 'Carregando os proventos mês a mês…', { carregando: true }); return; }
    const h = estado.historico[meta.id];
    const mesAtual = mesEmCurso(estado.ctx.hoje); // 06/10/2026: no último dia do mês ele já conta como fechado
    const completa = comMedia12((h && h.renda) || [], mesAtual);
    if (completa.length < 2) { textoCaixa(caixa, 'Ainda não há proventos suficientes pra montar a evolução mensal.'); return; }
    const renda = estado.periodos.renda === 'tudo' ? completa : recortarMeses(completa, estado.periodos.renda).slice(1);
    const spec = opcoesRenda(renda, { alvo: c.renda ? c.renda.alvo : null, mesAtual });
    if (!spec) { textoCaixa(caixa, 'Ainda não há proventos suficientes nesse período.'); return; }
    montarGrafico(caixa, { tipo: 'linha', opcoes: spec });
    if (anal) renderAnalise(doc, anal, analisarRendaMensal(completa.filter((x) => renda.some((r) => r.mes === x.mes)), c, { hoje: estado.ctx.hoje }), { titulo: 'Análise da renda' });
  }

  function pontosProjecao(c) {
    const per = estado.periodos.proj;
    const hoje = estado.ctx.hoje;
    const total = horizonteProjecao(c);
    if (ehPeriodoPersonalizado(per)) {
      const fim = mesesEntre(mesDe(hoje), per.fim.slice(0, 7));
      const ini = Math.max(0, mesesEntre(mesDe(hoje), per.inicio.slice(0, 7)));
      return serieProjecao(c, { hoje, meses: Math.max(1, fim), maxMeses: 720 }).slice(ini);
    }
    const n = per === '12m' ? 12 : per === '60m' ? 60 : total;
    return serieProjecao(c, { hoje, meses: Math.min(n, 720), maxMeses: 720 });
  }

  function desenharGrafico(c, marcos = []) {
    const caixa = doc.getElementById('mtGrafico');
    if (!caixa) return;
    const pontos = pontosProjecao(c);
    const spec = opcoesProjecao(c, { hoje: estado.ctx.hoje, pontos, marcos, duracaoAte: (mes) => rotuloDuracao(mesesEntre(mesDe(estado.ctx.hoje), mes)) });
    if (!spec) { textoCaixa(caixa, 'Sem dados pra projetar (falta o alvo).'); return; }
    montarGrafico(caixa, { tipo: 'linha', opcoes: spec });
    // marcos e vencimentos que caem no trecho desenhado: ficam também em texto (o tooltip do mês mostra o mesmo)
    const notas = doc.getElementById('mtGraficoNotas');
    if (notas) {
      const itens = [];
      if (spec.notas.prazo) itens.push(`prazo da meta: ${rotuloMes(c.dataAlvo)}`);
      spec.notas.marcos.forEach((m) => itens.push(`${m.rotulo} em ${rotuloMes(m.mes)}`));
      spec.notas.vencimentos.forEach((v) => itens.push(`vence ${v.titulos.map((t) => t.nome).join(' e ')} em ${rotuloMes(v.mes)}`));
      notas.hidden = !itens.length;
      notas.textContent = itens.length ? `No gráfico (passe o mouse no mês): ${itens.join(' · ')}.` : '';
    }
    const anal = doc.getElementById('mtProjAnalise');
    if (anal) renderAnalise(doc, anal, analisarProjecaoMeta(c, { pontos, marcos, hoje: estado.ctx.hoje }), { titulo: 'Análise da projeção' });
  }

  /** Filtros de período (presets + "Escolher período" do componente compartilhado). */
  function ligarFiltros(meta) {
    const hoje = estado.ctx.hoje;
    const tabs = el.tela.querySelectorAll('.mt-tabs-periodo');
    tabs.forEach((t) => {
      const bloco = t.closest('.mt-bloco');
      const qual = bloco && bloco.id === 'mtHistBloco' ? 'hist' : bloco && bloco.id === 'mtRendaBloco' ? 'renda' : 'proj';
      let limites;
      if (qual === 'proj') {
        const c = calcDe(meta);
        limites = { min: hoje, max: `${somarMeses(mesDe(hoje), horizonteProjecao(c))}-28` };
      } else {
        const h = estado.historico && estado.historico[meta.id];
        const lista = h ? (qual === 'renda' ? h.renda : h.meses) : null;
        limites = lista && lista.length ? { min: `${lista[0].mes}-01`, max: hoje } : null;
      }
      ligarFiltroPeriodo(doc, t, {
        chave: `metas.${qual}`, periodoInicial: estado.periodos[qual], limites,
        aoMudar: (p) => {
          estado.periodos[qual] = p;
          const m = acharMeta(estado.detalheId);
          if (!m) return;
          const c = calcDe(m);
          if (qual === 'hist') desenharHistorico(m, c);
          else if (qual === 'renda') desenharRenda(m, c);
          else desenharGrafico(c, marcosProjecao(c, { hoje: estado.ctx.hoje, anoNascimento: num(m.especificos && m.especificos.anoNascimento) }));
        },
      });
      const atual = t._filtroPeriodo && t._filtroPeriodo.periodo;
      if (atual != null && JSON.stringify(atual) !== JSON.stringify(estado.periodos[qual])) {
        estado.periodos[qual] = atual;
        const c = calcDe(meta);
        if (qual === 'hist') desenharHistorico(meta, c);
        else if (qual === 'renda') desenharRenda(meta, c);
        else desenharGrafico(c, marcosProjecao(c, { hoje, anoNascimento: num(meta.especificos && meta.especificos.anoNascimento) }));
      }
    });
  }

  // ---------------- simulador ----------------
  function montarSimulador(caixa, meta, c) {
    const s = estado.simulador && estado.simulador.id === meta.id ? estado.simulador : {
      id: meta.id, modo: 'data', moeda: c.moeda, alvo: c.alvoMoeda != null ? c.alvoMoeda : c.alvoBRL,
      atual: c.atualRitmo != null ? c.atualRitmo : c.atualBRL, rendimento: meta.rendimentoAnual != null ? meta.rendimentoAnual : 0.1,
      data: c.dataAlvo || somarMeses(mesDe(estado.ctx.hoje), 12), aporte: c.aporteAtual || c.aporteNecessario || 500,
    };
    estado.simulador = s;
    const resultado = () => {
      const cot = cotacao(s.moeda, estado.ctx.cambio) || 1;
      const alvoBRL = (s.alvo || 0) * cot;
      const alvoTxt = s.moeda !== 'BRL' ? `${formatMoeda(s.alvo, s.moeda)} (${formatMoeda(alvoBRL)})` : formatMoeda(alvoBRL);
      if (!(alvoBRL > 0)) return 'Informe o alvo.';
      if (s.modo === 'data') {
        const meses = mesesEntre(mesDe(estado.ctx.hoje), s.data);
        if (meses == null) return 'Escolha o mês.';
        const r = simular({ alvo: alvoBRL, atual: s.atual || 0, rendimentoAnual: s.rendimento, meses: Math.max(0, meses) });
        const comIsso = fraseSim({ alvo: alvoBRL, atual: s.atual || 0, aporte: r.aporte || 0, rendimento: s.rendimento });
        if (r.aporte === 0) return `Com <b>${formatMoeda(s.atual || 0)}</b> já guardados e rendimento de ${pct(s.rendimento, 1)} a.a., você alcança ${alvoTxt} até ${rotuloMes(s.data)} <b>sem aportar mais nada</b>.${comIsso}`;
        return `Para alcançar <b>${alvoTxt}</b> até <b>${rotuloMes(s.data)}</b> com rendimento de ${pct(s.rendimento, 1)} a.a., aporte <b class="mt-destaque">${formatMoeda(r.aporte)}</b> por mês${meses > 0 ? ` (${rotuloDuracao(meses)}; ${formatMoeda(r.totalAportado, 'BRL', { casas: 0 })} de aportes + ${formatMoeda(r.rendimento, 'BRL', { casas: 0 })} de rendimento)` : ''}.${comIsso}`;
      }
      const r = simular({ alvo: alvoBRL, atual: s.atual || 0, rendimentoAnual: s.rendimento, aporte: s.aporte || 0 });
      if (r.mesesAteAlvo === 0) return `Você já tem o suficiente pra ${alvoTxt}.`;
      if (!Number.isFinite(r.mesesAteAlvo)) return `Aportando ${formatMoeda(s.aporte || 0)} por mês você não chega em ${alvoTxt} - aumente o aporte ou o rendimento.`;
      const quando = somarMeses(mesDe(estado.ctx.hoje), Math.ceil(r.mesesAteAlvo));
      return `Aportando <b>${formatMoeda(s.aporte || 0)}</b> por mês a ${pct(s.rendimento, 1)} a.a., você chega em <b>${alvoTxt}</b> em <b class="mt-destaque">${rotuloMes(quando)}</b> (${rotuloDuracao(r.mesesAteAlvo)}).${fraseSim({ alvo: alvoBRL, atual: s.atual || 0, aporte: s.aporte || 0, rendimento: s.rendimento })}`;
    };
    // 05/10/2026: "Com isso, sua meta de X chega em ..., o 1º milhão em ..." (só pra alvo em milhões)
    const fraseSim = ({ alvo, atual, aporte, rendimento }) => {
      const rm = resumoMarcos(c, { hoje: estado.ctx.hoje, alvo, atual, aporte, taxa: taxaMensal(rendimento || 0), entradas: null });
      return rm.frase ? ` <span class="mt-comisso-sim">${esc(rm.frase)}${rm.velocidade ? ` <em>${esc(rm.velocidade)}</em>` : ''}</span>` : '';
    };
    caixa.innerHTML = `<div class="mt-bloco-cab"><h3>Simulador</h3></div>
<div class="filter-tabs mt-sim-modo"><button type="button" class="filter-tab ${s.modo === 'data' ? 'active' : ''}" data-sim-modo="data">Até uma data</button><button type="button" class="filter-tab ${s.modo === 'aporte' ? 'active' : ''}" data-sim-modo="aporte">Com um aporte</button></div>
<div class="mt-sim-campos">
  <label class="mt-campo"><span>Alvo</span><span class="mt-entrada"><select data-sim="moeda" aria-label="Moeda">${MOEDAS.map((m) => `<option ${m === s.moeda ? 'selected' : ''}>${m}</option>`).join('')}</select><input data-sim="alvo" inputmode="decimal" value="${numParaCampo(s.alvo)}"></span></label>
  <label class="mt-campo"><span>Já tenho (R$)</span><input data-sim="atual" inputmode="decimal" value="${numParaCampo(s.atual)}"></label>
  <label class="mt-campo"><span>Rendimento (% a.a.)</span><input data-sim="rendimento" inputmode="decimal" value="${numParaCampo((s.rendimento || 0) * 100)}"></label>
  ${s.modo === 'data' ? `<label class="mt-campo"><span>Até o mês</span><input type="month" data-sim="data" value="${s.data || ''}"></label>` : `<label class="mt-campo"><span>Aporte mensal (R$)</span><input data-sim="aporte" inputmode="decimal" value="${numParaCampo(s.aporte)}"></label>`}
</div>
<p class="mt-sim-resultado" aria-live="polite">${resultado()}</p>`;
    caixa.querySelectorAll('[data-sim-modo]').forEach((b) => b.addEventListener('click', () => { s.modo = b.dataset.simModo; montarSimulador(caixa, meta, c); }));
    caixa.querySelectorAll('[data-sim]').forEach((inp) => {
      const ev = inp.tagName === 'SELECT' || inp.type === 'month' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        const k = inp.dataset.sim;
        if (k === 'moeda' || k === 'data') s[k] = inp.value;
        else if (k === 'rendimento') s.rendimento = (parseNumeroBR(inp.value) || 0) / 100;
        else s[k] = parseNumeroBR(inp.value);
        caixa.querySelector('.mt-sim-resultado').innerHTML = resultado();
      });
    });
  }

  // ---------------- sub-itens ----------------
  function montarEditorItens(caixa, meta, { aoMudar, somenteLeitura = false, cambio }) {
    let itens = clonar(meta.itens || []);
    let timer = null;
    const avisar = (imediato) => {
      if (timer) clearTimeout(timer);
      if (imediato) aoMudar(clonar(itens));
      else timer = setTimeout(() => aoMudar(clonar(itens)), 700);
    };
    function desenharItens() {
      const total = itens.reduce((s, it) => s + ((cotacao(it.moeda, cambio) || 0) * (Number(it.valor) || 0)), 0);
      caixa.innerHTML = `${itens.length ? `<ul class="mt-itens">${itens.map((it, i) => `<li class="${it.concluido ? 'feito' : ''}">
  <label class="mt-check" title="Já pago"><input type="checkbox" data-item-check="${i}" ${it.concluido ? 'checked' : ''} ${somenteLeitura ? 'disabled' : ''}><span class="sr">Já pago</span></label>
  <input class="mt-item-nome" data-item-nome="${i}" value="${esc(it.nome)}" aria-label="Item" ${somenteLeitura ? 'disabled' : ''}>
  <span class="mt-entrada mt-item-valor"><select data-item-moeda="${i}" aria-label="Moeda" ${somenteLeitura ? 'disabled' : ''}>${MOEDAS.map((m) => `<option ${m === it.moeda ? 'selected' : ''}>${m}</option>`).join('')}</select><input data-item-valor="${i}" inputmode="decimal" value="${numParaCampo(it.valor)}" aria-label="Valor" ${somenteLeitura ? 'disabled' : ''}></span>
  <span class="mt-item-brl mono">${it.moeda !== 'BRL' && cotacao(it.moeda, cambio) ? formatMoeda((Number(it.valor) || 0) * cotacao(it.moeda, cambio), 'BRL', { casas: 0 }) : ''}</span>
  ${somenteLeitura ? '' : `<button type="button" class="mt-x" data-item-remover="${i}" aria-label="Remover ${esc(it.nome)}">×</button>`}
</li>`).join('')}</ul><p class="mt-itens-total"><span>Total</span><b class="mono">${formatMoeda(total)}</b></p>` : ''}
${somenteLeitura ? '' : '<button type="button" class="mt-link" data-item-add>+ Adicionar item</button>'}`;
    }
    desenharItens();
    caixa.addEventListener('click', (ev) => {
      const add = ev.target.closest('[data-item-add]');
      const rem = ev.target.closest('[data-item-remover]');
      if (add) {
        itens.push({ id: idItem(), nome: `Item ${itens.length + 1}`, valor: 0, moeda: meta.moeda || 'BRL', concluido: false });
        desenharItens();
        const ultimo = caixa.querySelector(`[data-item-nome="${itens.length - 1}"]`);
        if (ultimo) { ultimo.focus(); ultimo.select(); }
        avisar(false);
      } else if (rem) {
        itens.splice(Number(rem.dataset.itemRemover), 1);
        desenharItens();
        avisar(true);
      }
    });
    caixa.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.dataset.itemNome != null) { itens[Number(t.dataset.itemNome)].nome = t.value; avisar(false); }
      if (t.dataset.itemValor != null) {
        const i = Number(t.dataset.itemValor);
        itens[i].valor = parseNumeroBR(t.value) || 0;
        const brl = t.closest('li').querySelector('.mt-item-brl');
        if (brl) brl.textContent = itens[i].moeda !== 'BRL' && cotacao(itens[i].moeda, cambio) ? formatMoeda(itens[i].valor * cotacao(itens[i].moeda, cambio), 'BRL', { casas: 0 }) : '';
        const tot = caixa.querySelector('.mt-itens-total b');
        if (tot) tot.textContent = formatMoeda(itens.reduce((s, it) => s + ((cotacao(it.moeda, cambio) || 0) * (Number(it.valor) || 0)), 0));
        avisar(false);
      }
    });
    caixa.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.itemCheck != null) { itens[Number(t.dataset.itemCheck)].concluido = t.checked; desenharItens(); avisar(true); }
      if (t.dataset.itemMoeda != null) { itens[Number(t.dataset.itemMoeda)].moeda = t.value; desenharItens(); avisar(true); }
    });
  }

  // ---------------- salvar / arquivar / excluir ----------------
  async function salvar(meta, { manterDetalhe = false, silencioso = false } = {}) {
    const r = await salvarMetaImpl(token, meta);
    if (!r || !r.ok) {
      // 06/10/2026 (A-62): toast no lugar de window.alert (e a edição silenciosa de item também avisa, antes só ia pro console)
      toast.erro(`Não consegui salvar a meta${r && r.erro ? ` (${r.erro})` : ''}. Tente de novo.`, { doc });
      return null;
    }
    const salva = r.meta || { ...meta, id: r.id };
    const lista = (estado.resposta.metas || []).filter((m) => m.id !== salva.id);
    const idx = (estado.resposta.metas || []).findIndex((m) => m.id === salva.id);
    if (idx >= 0) lista.splice(idx, 0, salva); else lista.push(salva);
    estado.resposta = { ...estado.resposta, metas: lista };
    gravarCacheDados('metas', estado.resposta);
    if (!silencioso) toast.ok('Meta salva.', { doc });
    if (manterDetalhe && silencioso) {
      // edição de sub-item: só atualiza os números (não redesenha os campos que estão sendo digitados)
      return salva;
    }
    if (manterDetalhe || !silencioso) irPara(salva.id); else desenhar();
    // vínculos mudaram: o histórico daquela meta precisa ser refeito
    if (!silencioso) { estado.historico = estado.historico ? { ...estado.historico } : null; carregarHistorico(); }
    return salva;
  }

  /** 06/10/2026 (Tiago: "me dê a opção de ignorar esse aviso"): grava `ignorarAvisos: ['sobreposicao']` nas metas (persistido na meta). */
  async function ignorarSobreposicao(ids) {
    let ok = true;
    for (const id of ids) {
      const m = acharMeta(id);
      if (!m || ignoraAvisoSobreposicao(m)) continue;
      const nova = clonar(m);
      nova.ignorarAvisos = [...new Set([...(nova.ignorarAvisos || []), 'sobreposicao'])];
      if (!(await salvar(nova, { manterDetalhe: false, silencioso: true }))) ok = false;
    }
    if (ok) { toast.ok('Aviso ignorado.', { doc }); desenhar(); }
  }

  async function arquivar(meta, restaurar = false) {
    if (!restaurar && !(await confirmar({ titulo: `Arquivar "${meta.nome}"?`, mensagem: 'Ela sai da lista e fica em "Arquivadas": dá pra restaurar - ou excluir de vez de lá.', confirmarTexto: 'Arquivar', doc }))) return;
    const r = await excluirMetaImpl(token, meta.id, { restaurar });
    if (!r || !r.ok) { toast.erro(`Não consegui ${restaurar ? 'restaurar' : 'arquivar'} a meta${r && r.erro ? ` (${r.erro})` : ''}.`, { doc }); return; }
    toast.ok(restaurar ? `"${meta.nome}" voltou pras metas ativas.` : `"${meta.nome}" arquivada.`, { doc });
    const m = { ...meta, status: restaurar ? 'ativa' : 'arquivada' };
    const metas = (estado.resposta.metas || []).filter((x) => x.id !== meta.id);
    const arquivadas = (estado.resposta.arquivadas || []).filter((x) => x.id !== meta.id);
    if (restaurar) metas.push(m); else arquivadas.push(m);
    estado.resposta = { ...estado.resposta, metas, arquivadas };
    gravarCacheDados('metas', estado.resposta);
    if (restaurar) desenhar(); else { estado.filtroStatus = 'todas'; irPara(null); }
  }

  // 03/10/2026 (Tiago: "me diga como excluí-las para eu iniciar do zero"): apaga de verdade (só arquivada)
  async function excluirDefinitivo(meta) {
    if (!(await confirmar({ titulo: `Excluir "${meta.nome}" de vez?`, mensagem: 'A meta sai da planilha (aba aux_metas) e não dá pra desfazer.', confirmarTexto: 'Excluir definitivamente', perigo: true, doc }))) return;
    const r = await excluirDefinitivoImpl(token, meta.id);
    if (!r || !r.ok) { toast.erro(`Não consegui excluir a meta${r && r.erro ? ` (${r.erro})` : ''}.`, { doc }); return; }
    toast.ok(`"${meta.nome}" excluída.`, { doc });
    const arquivadas = (estado.resposta.arquivadas || []).filter((x) => x.id !== meta.id);
    estado.resposta = { ...estado.resposta, arquivadas };
    gravarCacheDados('metas', estado.resposta);
    estado.filtroStatus = arquivadas.length ? 'arquivadas' : 'todas';
    irPara(null);
  }

  async function salvarSaldo(meta, id, novo) {
    const m = clonar(meta);
    const v = (m.vinculos || []).find((x) => x.tipo === 'saldo' && x.id === id);
    if (!v || novo == null) return;
    v.saldo = novo;
    v.atualizadoEm = String(estado.ctx.hoje || '').slice(0, 10) || null;
    estado.editandoSaldo = null;
    await salvar(m, { manterDetalhe: true });
  }

  // ---------------- assistente (nova meta / editar) ----------------
  function abrirAssistente(meta, passo = 1, { editando = false } = {}) {
    const copia = clonar(meta);
    if (editando) rebasearAporte(copia, estado.ctx && estado.ctx.hoje); // 07/10/2026: aporte crescente - o campo mostra o aporte de HOJE
    estado.assistente = { meta: copia, passo, editando, buscaAtivo: '' };
    el.dialogo.hidden = false;
    doc.body.classList.add('mt-dialogo-aberto');
    desenharAssistente();
  }
  function fecharAssistente() {
    estado.assistente = null;
    el.dialogo.hidden = true;
    el.dialogo.innerHTML = '';
    doc.body.classList.remove('mt-dialogo-aberto');
  }

  const PASSOS = ['Tipo', 'Dados', 'Investimentos', 'Revisar'];

  function desenharAssistente() {
    const a = estado.assistente;
    if (!a) return;
    const m = a.meta;
    let corpo = '';
    if (a.passo === 1) corpo = passoTipoHtml(m);
    if (a.passo === 2) corpo = passoDadosHtml(m);
    if (a.passo === 3) corpo = passoVinculosHtml(m);
    if (a.passo === 4) corpo = passoRevisarHtml(m);
    const rolagem = el.dialogo.querySelector('.mt-dialogo-corpo');
    const topo = rolagem && a._passoDesenhado === a.passo ? rolagem.scrollTop : 0;
    el.dialogo.innerHTML = `<div class="mt-dialogo" role="dialog" aria-modal="true" aria-labelledby="mtDialogoTitulo">
  <header class="mt-dialogo-cab">
    <h2 id="mtDialogoTitulo">${a.editando ? `Editar "${esc(m.nome)}"` : 'Nova meta'}</h2>
    <button type="button" class="mt-x mt-fechar" data-fechar aria-label="Fechar">×</button>
  </header>
  <ol class="mt-passos">${PASSOS.map((p, i) => `<li class="${i + 1 === a.passo ? 'atual' : i + 1 < a.passo ? 'feito' : ''}"><button type="button" data-passo="${i + 1}" ${i + 1 > a.passo && !(a.editando || a.passo > 1) ? 'disabled' : ''}><span>${i + 1}</span>${p}</button></li>`).join('')}</ol>
  <div class="mt-dialogo-corpo">${corpo}</div>
  <footer class="mt-dialogo-rodape">
    ${a.passo > 1 ? '<button type="button" class="btn btn-ghost" data-anterior>Voltar</button>' : '<span></span>'}
    <span class="mt-dialogo-previa" id="mtPrevia">${a.passo >= 2 ? previaHtml(m) : ''}</span>
    ${a.passo === 1 ? '' : a.passo < 4 ? '<button type="button" class="btn btn-primary" data-proximo>Continuar</button>' : `<button type="button" class="btn btn-primary" data-salvar>${a.editando ? 'Salvar alterações' : 'Criar meta'}</button>`}
  </footer>
</div>`;
    const novoCorpo = el.dialogo.querySelector('.mt-dialogo-corpo');
    if (novoCorpo && topo) novoCorpo.scrollTop = topo;
    const primeira = a._passoDesenhado !== a.passo;
    a._passoDesenhado = a.passo;
    if (a.passo === 2) {
      const caixa = el.dialogo.querySelector('#mtItensAssistente');
      if (caixa) montarEditorItens(caixa, m, { aoMudar: (itens) => { m.itens = itens; atualizarPrevia(); }, cambio: estado.ctx.cambio });
    }
    if (primeira) {
      const foco = el.dialogo.querySelector('[data-foco]') || el.dialogo.querySelector('.mt-dialogo-corpo input, .mt-dialogo-corpo button');
      if (foco) { try { foco.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
    }
  }

  function previaHtml(m) {
    if (ehMetaDistribuicao(m)) return previaDistribuicaoHtml(m);
    const c = calcDe(m);
    if (c.renda) return `renda hoje <b>${r0(c.renda.atual)}</b>/mês · patrimônio necessário <b>${c.alvoBRL != null ? r0(c.alvoBRL) : '—'}</b>`;
    if (c.acompanhando) return `só acompanhando${c.aporteAtual > 0 ? ` · em 5 anos ~<b>${r0(projecaoPorAnos(c, [5])[0].valor)}</b>` : ''}`; // 07/10/2026
    if (c.alvoBRL == null && !(c.viagem && c.viagem.temFixos)) return 'informe o alvo';
    if (c.viagem) { // 04/10/2026: a juntar x já comprado (parcelas à parte)
      const par = c.viagem.aPagar.mesAtualBRL;
      return `a juntar <b>${c.alvoBRL != null ? r0(c.alvoBRL) : '—'}</b>${c.moeda !== 'BRL' && c.alvoMoeda ? ` (${formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 })})` : ''}${c.aporteNecessario != null ? ` · guarda <b>${r0(c.aporteNecessario)}</b>/mês` : ''}${par > 0 ? ` · paga <b>${r0(par)}</b>/mês` : ''}`;
    }
    return `alvo <b>${c.alvoBRL != null ? r0(c.alvoBRL) : '—'}</b>${c.moeda !== 'BRL' && c.alvoMoeda ? ` (${formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 })})` : ''}${c.aporteNecessarioTotal ? ` · aporte <b>${r0(c.aporteNecessarioTotal)}</b>/mês` : ''}`;
  }
  function atualizarPrevia() {
    const a = estado.assistente;
    if (!a) return;
    const p = el.dialogo.querySelector('#mtPrevia');
    if (p) p.innerHTML = previaHtml(a.meta);
    if (ehMetaDistribuicao(a.meta)) atualizarSomasDistribuicao(el.dialogo, a.meta);
    const cresc = el.dialogo.querySelector('#mtCrescResumo');
    if (cresc) cresc.textContent = resumoCrescimentoEditor(a.meta, estado.ctx.hoje);
    const conta = el.dialogo.querySelector('#mtContaApos');
    if (conta) conta.innerHTML = contaAposentadoriaHtml(a.meta);
    const viag = el.dialogo.querySelector('#mtResumoViagem');
    if (viag) viag.innerHTML = resumoViagemHtml(a.meta, calcDe(a.meta));
    const pessoasPadrao = Math.max(1, Number(a.meta.especificos && a.meta.especificos.pessoas) || 1);
    el.dialogo.querySelectorAll('[data-dest-total]').forEach((x) => {
      const d = (a.meta.especificos.destinos || [])[Number(x.dataset.destTotal)];
      if (d) x.textContent = totalDestinoTexto(d, { pessoasPadrao });
    });
    el.dialogo.querySelectorAll('[data-taxa-nota]').forEach((x) => {
      const d = (a.meta.especificos.destinos || [])[Number(x.dataset.taxaNota)];
      if (d) x.innerHTML = notaTaxaHtml(d, Number(x.dataset.taxaNota), estado.dados.taxas);
    });
    el.dialogo.querySelectorAll('[data-entrada-resumo]').forEach((x) => {
      const e = (a.meta.entradas || [])[Number(x.dataset.entradaResumo)];
      if (e) x.innerHTML = resumoEntradaHtml(a.meta, e, { referencias: estado.ctx.referencias, hoje: estado.ctx.hoje });
    });
  }

  function passoTipoHtml(m) {
    const tile = (tipo, categoria) => {
      const fake = { tipo, categoria };
      const ap = aparenciaMeta(fake);
      const resumo = tipo === 'acumulo' ? (CATEGORIAS_ACUMULO[categoria].dica || '') : TIPOS_META[tipo].resumo;
      const ativo = m.tipo === tipo && (tipo !== 'acumulo' || m.categoria === categoria);
      return `<button type="button" class="mt-tipo ${ativo ? 'ativo' : ''}" data-tipo="${tipo}" ${categoria ? `data-categoria="${categoria}"` : ''} style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">${seloMetaHtml(fake, { tamanho: 34 })}<span><strong>${esc(ap.rotulo)}</strong><em>${esc(resumo)}</em></span></button>`;
    };
    return `<p class="mt-dialogo-dica">Que tipo de meta? Cada tipo pede os dados certos e calcula do jeito certo.</p>
<h4 class="mt-grupo">Patrimônio e renda</h4><div class="mt-tipos">${['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].map((t) => tile(t)).join('')}${tileDistribuicaoHtml({ ativo: m.tipo === TIPO_DISTRIBUICAO, jaExiste: !!distribuicaoExistente(), seloHtml: seloMetaHtml({ tipo: TIPO_DISTRIBUICAO }, { tamanho: 34 }), resumo: TIPOS_META[TIPO_DISTRIBUICAO].resumo })}</div>
<h4 class="mt-grupo">Objetivos</h4><div class="mt-tipos">${['viagemInternacional', 'viagemNacional', 'casa', 'carro'].map((t) => tile(t)).join('')}</div>
<h4 class="mt-grupo">Juntar até uma data</h4><div class="mt-tipos compacto">${Object.keys(CATEGORIAS_ACUMULO).map((k) => tile('acumulo', k)).join('')}</div>`;
  }

  function campo({ caminho, rotulo, formato = 'dinheiro', ajuda = '', moeda = null, opcoes = null, largura = '', foco = false, dica = '', padrao = null }) {
    const m = estado.assistente.meta;
    const v = lerCaminho(m, caminho);
    const rot = `${rotulo}${dica ? infoHtml(dica) : ''}`;
    let entrada;
    if (formato === 'texto') entrada = `<input data-campo="${caminho}" data-formato="texto" value="${esc(v || '')}" ${foco ? 'data-foco' : ''}>`;
    else if (formato === 'mes') entrada = `<input type="month" data-campo="${caminho}" data-formato="mes" value="${esc(v || '')}">`;
    else if (formato === 'select') entrada = `<select data-campo="${caminho}" data-formato="select">${opcoes.map(([k, r]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>`;
    else if (formato === 'bool') return `<label class="mt-campo mt-campo-bool ${largura}"><input type="checkbox" data-campo="${caminho}" data-formato="bool" ${v ? 'checked' : ''}><span>${rot}${ajuda ? `<em>${ajuda}</em>` : ''}</span></label>`;
    else {
      const mostra = formato === 'ano' ? (v == null ? '' : String(v)) : formato === 'pct' ? numParaCampo(v == null ? null : v * 100, 2) : numParaCampo(v, formato === 'int' ? 0 : 2);
      const prefixo = formato === 'dinheiro' ? `<span class="mt-prefixo">${esc(moeda || 'R$')}</span>` : '';
      const sufixo = formato === 'pct' ? '<span class="mt-sufixo">%</span>' : '';
      entrada = `<span class="mt-entrada">${prefixo}<input data-campo="${caminho}" data-formato="${formato}" inputmode="decimal" value="${mostra}" ${padrao != null ? `placeholder="${esc(String(padrao))}"` : ''} ${foco ? 'data-foco' : ''}>${sufixo}</span>`;
    }
    return `<label class="mt-campo ${largura}"><span>${rot}</span>${entrada}${ajuda ? `<em>${ajuda}</em>` : ''}</label>`;
  }

  /** A conta da aposentadoria ao vivo, passo a passo (caixa do assistente). */
  function contaAposentadoriaHtml(m) {
    const ct = contaAposentadoria(m, estado.ctx.referencias || {});
    const linha = (rot, val, cls = '') => `<li class="${cls}"><span>${rot}</span><b class="mono">${val}</b></li>`;
    let passos = '';
    if (ct.modo === 'calculado') {
      passos = linha(`Despesas essenciais/mês${ct.usarPlanilha ? ' (renda emergencial)' : ''}`, formatMoeda(ct.despesa))
        + linha('+ Extra/mês', formatMoeda(ct.extra))
        + linha('= Base', formatMoeda(ct.base), 'sub')
        + linha(`+ Reinvestimento (${pct(ct.reinvestimentoPct, 1)} da base)`, formatMoeda(ct.reinvestimento))
        + linha('= Renda ideal por mês', formatMoeda(ct.renda), 'sub destaque');
    } else if (ct.modo === 'renda') passos = linha('Renda desejada por mês', formatMoeda(ct.renda), 'destaque');
    else passos = linha('Montante informado', formatMoeda(ct.montante), 'destaque') + linha(`Renda que ele paga (${pct(ct.taxa, 1)} a.a.)`, formatMoeda(ct.renda));
    if (ct.modo !== 'montante') passos += linha(`Montante = renda x 12 / ${pct(ct.taxa, 1)}`, formatMoeda(ct.montante), 'total');
    return `<ol class="mt-conta">${passos}</ol>`;
  }

  /** 07/10/2026: "Ainda não sei o valor nem a data" - sem valor alvo (nem sub-itens) e sem prazo. */
  function semAlvoMarcado(m) {
    const esp = m.especificos || {};
    const semValor = m.tipo === 'casa' ? !(esp.valorImovel > 0) : m.tipo === 'carro' ? !(esp.valorCarro > 0) : !(m.valorAlvo > 0);
    return semValor && !m.dataAlvo && !(m.itens || []).length;
  }

  function passoDadosHtml(m) {
    if (ehMetaDistribuicao(m)) return passoDadosDistribuicaoHtml(m);
    const ref = estado.ctx.referencias || {};
    const simbolo = (moeda) => (moeda === 'BRL' ? 'R$' : moeda);
    const f = [];
    let extra = '';
    f.push(campo({ caminho: 'nome', rotulo: 'Nome da meta', formato: 'texto', largura: 'largo', foco: true }));
    if (m.tipo === 'acumulo') f.push(campo({ caminho: 'categoria', rotulo: 'Categoria', formato: 'select', opcoes: Object.entries(CATEGORIAS_ACUMULO).map(([k, c]) => [k, c.nome]) }));
    const dataViagem = m.tipo === 'viagemInternacional' || m.tipo === 'viagemNacional';
    // 07/10/2026 (Tiago: "sem valor final nem prazo - não vamos procurar agora"): objetivo livre pode ficar "só acompanhando"
    const livre = ['acumulo', 'casa', 'carro'].includes(m.tipo) && m.contribuicao !== 'recorrente';
    const semAlvo = livre && semAlvoMarcado(m);
    if (livre) f.push(`<label class="mt-campo mt-campo-bool largo mt-sem-alvo"><input type="checkbox" data-sem-alvo ${semAlvo ? 'checked' : ''}><span>Ainda não sei o valor nem a data<em>só vou acompanhar quanto já tenho e quanto terei daqui a alguns anos - quando souber, é só desmarcar</em></span></label>`);
    // 04/10/2026: toda viagem é por destinos (país/cidade) + "já comprado"; a "conta mensal" antiga virou item no cartão (migração)
    const porDestinos = dataViagem;
    if (dataViagem) {
      f.push(campo({ caminho: 'especificos.destino', rotulo: 'Nome da viagem / roteiro', formato: 'texto', ajuda: 'ex. Eurotrip - os destinos você lista abaixo' }));
      f.push(campo({ caminho: 'especificos.roteiroUrl', rotulo: 'Roteiro (Wanderlog)', formato: 'texto', largura: 'largo', ajuda: 'cole o link do roteiro (wanderlog.com/…): vira um botão no detalhe da viagem, em nova aba' }));
      f.push(campo({ caminho: 'especificos.pessoas', rotulo: 'Pessoas na viagem (taxa turística)', formato: 'int', ajuda: 'a taxa turística é por pessoa e por noite' }));
    }
    if (m.tipo === 'rendaPassiva') {
      f.push(campo({ caminho: 'especificos.rendaMensal', rotulo: 'Renda passiva por mês', ajuda: ref.rendaPassiva && ref.rendaPassiva.metaPlanilha ? `na planilha (aba Distribuição e Metas): ${formatMoeda(ref.rendaPassiva.metaPlanilha)}` : '' }));
      f.push(campo({ caminho: 'especificos.dyAnual', rotulo: 'Rendimento em proventos (DY) ao ano', formato: 'pct', ajuda: 'patrimônio necessário = renda x 12 / DY' }));
      f.push(campo({ caminho: 'dataAlvo', rotulo: 'Até quando', formato: 'mes' }));
    } else if (m.tipo === 'reservaEmergencia') {
      const cv = ref.reserva && ref.reserva.custoDeVida;
      f.push(campo({ caminho: 'especificos.meses', rotulo: 'Meses de custo de vida', formato: 'int', padrao: ref.reserva && ref.reserva.meses != null ? ref.reserva.meses : null, ajuda: ref.reserva && ref.reserva.meses != null ? `vazio = segue a planilha (hoje ${ref.reserva.meses})` : '' }));
      f.push(campo({ caminho: 'especificos.margem', rotulo: 'Sobra de segurança', formato: 'pct', padrao: ref.reserva && ref.reserva.sobra != null ? numParaCampo(ref.reserva.sobra * 100, 2) : null, ajuda: ref.reserva && ref.reserva.sobra != null ? `vazio = segue a planilha (hoje ${pct(ref.reserva.sobra)})` : '' }));
      f.push(campo({ caminho: 'especificos.usarDespesasPlanilha', rotulo: `Usar o custo de vida das Despesas essenciais${cv ? ` (${formatMoeda(cv)}/mês)` : ''}`, formato: 'bool', largura: 'largo' }));
      if (m.especificos && m.especificos.usarDespesasPlanilha === false) f.push(campo({ caminho: 'especificos.despesaMensal', rotulo: 'Despesa mensal' }));
      extra += '<p class="mt-nota largo">O status olha o valor LÍQUIDO: "Saldo ideal" só quando o que cairia na conta num resgate hoje (sem IR/IOF) cobre o alvo.</p>';
    } else if (m.tipo === 'casa') {
      if (!semAlvo) {
        f.push(campo({ caminho: 'especificos.valorImovel', rotulo: 'Valor do imóvel' }));
        f.push(campo({ caminho: 'especificos.entradaPct', rotulo: 'Entrada', formato: 'pct' }));
        f.push(campo({ caminho: 'especificos.custosPct', rotulo: 'ITBI, escritura e registro', formato: 'pct' }));
      }
    } else if (m.tipo === 'carro') {
      if (!semAlvo) {
        f.push(campo({ caminho: 'especificos.valorCarro', rotulo: 'Valor do carro' }));
        f.push(campo({ caminho: 'especificos.entradaPct', rotulo: 'Quanto juntar (100% = à vista)', formato: 'pct' }));
      }
    } else if (m.tipo === 'aposentadoria') {
      // 03/10/2026: a conta da planilha, transparente e editável (e o prazo - antes não aparecia)
      const ct = contaAposentadoria(m, ref);
      if (!m.especificos.modoAlvo) m.especificos.modoAlvo = ct.modo;
      f.push(campo({ caminho: 'especificos.modoAlvo', rotulo: 'Como definir o alvo', formato: 'select', largura: 'largo', opcoes: [['calculado', 'Pela conta da planilha: despesas + extra + % de reinvestimento'], ['renda', 'Pela renda mensal que eu quero'], ['montante', 'Digitar o montante final']] }));
      if (ct.modo === 'calculado') {
        const cv = ref.reserva && ref.reserva.custoDeVida;
        f.push(campo({ caminho: 'especificos.usarDespesasPlanilha', rotulo: `Usar as despesas essenciais da renda emergencial${cv ? ` (${formatMoeda(cv)}/mês)` : ''}`, formato: 'bool', largura: 'largo' }));
        if (m.especificos.usarDespesasPlanilha === false) f.push(campo({ caminho: 'especificos.despesaMensal', rotulo: 'Despesas por mês' }));
        f.push(campo({ caminho: 'especificos.extra', rotulo: 'Extra por mês', dica: EXPLICACOES.extra, ajuda: ref.patrimonio && ref.patrimonio.extra != null ? `na planilha (K18): ${formatMoeda(ref.patrimonio.extra)}` : '' }));
        f.push(campo({ caminho: 'especificos.reinvestimento', rotulo: '% para reinvestir', formato: 'pct', dica: EXPLICACOES.reinvestimento, ajuda: ref.patrimonio && ref.patrimonio.reinvestimento != null ? `na planilha (L18): ${pct(ref.patrimonio.reinvestimento)}` : '' }));
      } else if (ct.modo === 'renda') {
        f.push(campo({ caminho: 'especificos.rendaDesejada', rotulo: 'Renda desejada por mês' }));
      } else {
        f.push(campo({ caminho: 'valorAlvo', rotulo: 'Montante final' }));
      }
      f.push(campo({ caminho: 'especificos.taxaRetirada', rotulo: 'Rendimento médio ao ano (retirada)', formato: 'pct', dica: EXPLICACOES.taxaRetirada, ajuda: ref.patrimonio && ref.patrimonio.rendimento ? `na planilha (M18): ${pct(ref.patrimonio.rendimento, 1)}` : 'regra dos 4%' }));
      f.push(campo({ caminho: 'dataAlvo', rotulo: 'Até quando (prazo)', formato: 'mes', ajuda: 'ex. 2050 - mês e ano em que quer ter o montante' }));
      f.push(campo({ caminho: 'especificos.anoNascimento', rotulo: 'Ano de nascimento (opcional)', formato: 'ano', ajuda: 'pra mostrar a idade em cada marco' }));
      extra += `<fieldset class="mt-grupo-campos"><legend>A conta, passo a passo</legend><div id="mtContaApos">${contaAposentadoriaHtml(m)}</div></fieldset>`;
    }
    if (!['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].includes(m.tipo)) {
      const contrib = ['acumulo', 'carro', 'casa', 'viagemNacional'].includes(m.tipo);
      if (contrib) f.push(campo({ caminho: 'contribuicao', rotulo: 'Como você vai pagar', formato: 'select', opcoes: [['acumulo', 'Juntar (acúmulo)'], ['recorrente', 'Pagamento recorrente / amortização']] }));
      if (m.contribuicao === 'recorrente') {
        f.push(campo({ caminho: 'recorrente.parcela', rotulo: 'Valor da parcela' }));
        f.push(campo({ caminho: 'recorrente.totalParcelas', rotulo: 'Número de parcelas', formato: 'int' }));
        f.push(campo({ caminho: 'recorrente.inicio', rotulo: '1ª parcela', formato: 'mes' }));
      } else if (!['casa', 'carro'].includes(m.tipo) && !semAlvo) {
        f.push(campo({ caminho: 'moeda', rotulo: porDestinos ? 'Moeda principal' : 'Moeda', formato: 'select', opcoes: MOEDAS.map((x) => [x, x]) }));
        if (!porDestinos || !(m.especificos.destinos || []).length) {
          f.push(campo({ caminho: 'valorAlvo', rotulo: dataViagem ? 'Dinheiro pra gastar lá (total)' : 'Valor alvo', moeda: simbolo(m.moeda), ajuda: porDestinos ? 'ou deixe vazio e liste os destinos abaixo - o alvo sai sozinho' : ((m.itens || []).length ? 'os sub-itens abaixo substituem esse valor' : (m.moeda !== 'BRL' && cotacao(m.moeda, estado.ctx.cambio) ? `1 ${m.moeda} = ${formatMoeda(cotacao(m.moeda, estado.ctx.cambio), 'BRL', { casas: 4 })}` : '')) }));
        }
      }
      if ((m.contribuicao !== 'recorrente' || m.tipo !== 'acumulo') && !semAlvo) f.push(campo({ caminho: 'dataAlvo', rotulo: dataViagem ? 'Mês da viagem' : 'Até quando', formato: 'mes' }));
      if (livre) { // 07/10/2026: compra em grupo (só a SUA parte entra na meta) e custos de compra do simulador
        f.push(campo({ caminho: 'especificos.grupoPessoas', rotulo: 'Compra em grupo: quantas pessoas (contando você)', formato: 'int', largura: 'largo', padrao: 1, ajuda: 'opcional - o que você informa aqui continua sendo só a SUA parte; as estimativas mostram também o total do grupo' }));
        if ((m.tipo === 'acumulo' && m.categoria === 'imoveis') || (m.tipo === 'casa' && semAlvo)) f.push(campo({ caminho: 'especificos.custosPct', rotulo: 'ITBI, escritura e registro', formato: 'pct', padrao: 5, ajuda: 'vazio = 5% (usado no simulador "e se custar R$ X")' }));
      }
    }
    if (m.contribuicao !== 'recorrente') {
      if (!['reservaEmergencia'].includes(m.tipo) && !dataViagem) f.push(campo({ caminho: 'valorInicial', rotulo: 'Já guardado fora dos investimentos', ajuda: 'dinheiro solto - conta com saldo em moeda você vincula no próximo passo ("Saldo em conta")' }));
      const real = estado.ctx.historico && m.id && estado.ctx.historico[m.id] ? estado.ctx.historico[m.id].aporteMedio : null;
      f.push(campo({ caminho: 'aporteMensal', rotulo: `Seu aporte mensal (opcional)`, dica: EXPLICACOES.aporteReal, ajuda: real != null ? `vazio = o aporte real do histórico: ${formatMoeda(Math.max(0, real))}/mês` : 'vazio = deduzido do histórico dos investimentos vinculados' }));
      f.push(campo({ caminho: 'rendimentoAnual', rotulo: 'Rendimento esperado ao ano', formato: 'pct', ajuda: m.tipo === 'aposentadoria' ? 'use o rendimento real (acima da inflação)' : '' }));
      extra += aporteCrescimentoEditorHtml(m, String(estado.ctx.hoje || '')); // 07/10/2026: aporte crescente (qualquer meta com aporte)
    }
    if (porDestinos) {
      extra += `<fieldset class="mt-grupo-campos"><legend>Destinos <em>(país/cidade, dias e gasto diário na moeda de lá)</em></legend>${destinosEditorHtml(m, { dados: estado.dados })}
  <div class="mt-campos">${campo({ caminho: 'especificos.margem', rotulo: 'Margem de segurança', formato: 'pct', dica: EXPLICACOES.margemViagem })}</div></fieldset>`;
      extra += `<fieldset class="mt-grupo-campos"><legend>Já comprado e a pagar <em>(passagens, hospedagem, ingressos)</em>${infoHtml(EXPLICACOES.aPagar, { rotulo: 'O que é "já comprado"?' })}</legend>${fixosEditorHtml(m, { hoje: estado.ctx.hoje, dados: estado.dados })}
  <p class="mt-nota">No cartão ou pago = já comprado: conta como pago e fica <b>fora do aporte</b>. "Ainda vou pagar" entra no dinheiro a juntar.</p></fieldset>`;
      extra += `<div id="mtResumoViagem">${resumoViagemHtml(m, calcDe(m))}</div>`;
    }
    // 04/10/2026: entradas programadas (13º, FGTS, PLR...) - qualquer meta de juntar dinheiro
    if (!['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].includes(m.tipo) && m.contribuicao !== 'recorrente') {
      extra += `<fieldset class="mt-grupo-campos"><legend>Entradas programadas <em>(13º, FGTS, PLR…)</em></legend>${entradasEditorHtml(m, { referencias: estado.ctx.referencias, hoje: estado.ctx.hoje })}</fieldset>`;
    }
    if (!['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].includes(m.tipo) && m.contribuicao !== 'recorrente') {
      extra += `<fieldset class="mt-grupo-campos"><legend>Sub-itens de custo <em>(opcional)</em></legend><div id="mtItensAssistente"></div></fieldset>`;
    }
    if (m.tipo === 'rendaPassiva') extra += `<div class="mt-campos">${campo({ caminho: 'exibirNaCarteira', rotulo: 'Mostrar essa meta na tela Carteiras', formato: 'bool', largura: 'largo' })}</div>`;
    extra += `<label class="mt-campo largo"><span>Notas</span><textarea data-campo="notas" data-formato="texto" rows="2">${esc(m.notas || '')}</textarea></label>`;
    return `<div class="mt-campos">${f.join('')}</div>${extra}`;
  }

  function saldosEditorHtml(m) {
    const ss = (m.vinculos || []).map((v, i) => ({ v, i })).filter((x) => x.v.tipo === 'saldo');
    // 07/10/2026 (Tiago: dinheiro num fundo que NÃO está na carteira): "Saldo ou investimento fora da carteira" - descrição, % do CDI e "conta no meu patrimônio"
    return `<h4 class="mt-grupo">Saldo ou investimento fora da carteira <em class="mt-fraco">(ex. Wise em euro, ou um fundo que não está na planilha)</em>${infoHtml(EXPLICACOES.saldoConta)}</h4>
<ul class="mt-saldos-ed">${ss.map(({ v, i }) => `<li>
  <input data-saldo="${i}" data-saldo-campo="nome" value="${esc(v.nome || '')}" placeholder="Nome (ex. Fundo XP - minha parte)" aria-label="Nome ou descrição">
  <input data-saldo="${i}" data-saldo-campo="instituicao" value="${esc(v.instituicao || '')}" placeholder="Instituição (ex. XP, Wise)" aria-label="Instituição">
  <span class="mt-entrada"><select data-saldo="${i}" data-saldo-campo="moeda" aria-label="Moeda">${MOEDAS_SALDO.map((x) => `<option ${x === (v.moeda || 'EUR') ? 'selected' : ''}>${x}</option>`).join('')}</select><input data-saldo="${i}" data-saldo-campo="saldo" inputmode="decimal" value="${numParaCampo(v.saldo)}" aria-label="Saldo"></span>
  <label class="mt-mini"><span>saldo do dia</span><input type="date" data-saldo="${i}" data-saldo-campo="atualizadoEm" value="${esc(v.atualizadoEm || '')}" max="${esc(String(estado.ctx.hoje || '').slice(0, 10))}"></label>
  <span class="mt-saldo-brl mono">${v.moeda && v.moeda !== 'BRL' && cotacao(v.moeda, estado.ctx.cambio) ? `≈ ${r0((Number(v.saldo) || 0) * cotacao(v.moeda, estado.ctx.cambio))}` : ''}</span>
  ${!v.moeda || v.moeda === 'BRL' ? `<label class="mt-mini mt-saldo-cdi"><span>rende (% do CDI)</span><span class="mt-entrada"><input data-saldo="${i}" data-saldo-campo="cdiPct" inputmode="decimal" value="${numParaCampo(v.cdiPct, 2)}" placeholder="ex. 100" aria-label="Rendimento estimado em % do CDI"><span class="mt-sufixo">%</span></span></label>` : '<span></span>'}
  <label class="mt-campo-bool mt-saldo-patrim"><input type="checkbox" data-saldo="${i}" data-saldo-campo="contaNoPatrimonio" ${v.contaNoPatrimonio ? 'checked' : ''}><span>Conta no meu patrimônio<em>entra no patrimônio líquido (Organização e Início); não entra na carteira de investimentos, na rentabilidade nem na aposentadoria</em></span></label>
  <button type="button" class="mt-x" data-saldo-remover="${i}" aria-label="Remover">×</button>
</li>`).join('')}</ul>
<p class="mt-nota">Se você cadastrou esse investimento na carteira como "Reservado para objetivos", vincule o título (lista acima) e não use saldo fora da carteira, senão ele conta 2 vezes no patrimônio.</p>
<p class="mt-nota">Com "% do CDI", o valor de hoje é o último saldo informado corrigido pelo CDI desde o dia dele. O site <b>não soma aportes sozinho</b>: atualize o saldo quando tiver o extrato novo.</p>
<button type="button" class="mt-link" data-saldo-add>+ Adicionar saldo ou investimento fora da carteira</button>`;
  }
  /**
   * 07/10/2026 (Tiago: "tudo selecionado e o vinculado não bate"): quando parte do que foi marcado já conta em outra meta
   * de prioridade maior, diz quanto foi marcado e onde está o resto - em vez de só um total menor sem explicação.
   */
  function htmlParteDeOutrasMetas(vinc, ativos, res, ocupado) {
    const sem = resolverVinculos(vinc, ativos, estado.ctx.cambio, { aliases: estado.ctx.aliases || null });
    const fora = Math.round((sem.total - res.total) * 100) / 100;
    if (!(fora > 1)) return '';
    const nomes = new Set();
    Object.keys(sem.uso || {}).forEach((id) => { const x = ocupado[id]; if (x && x.valor > 0.005) (x.metas || []).forEach((n) => nomes.add(n)); });
    return `<span class="mt-v-fora"> de <b class="mono">${formatMoeda(sem.total)}</b> marcados · <b class="mono">${formatMoeda(fora)}</b> já conta${nomes.size ? ` em ${[...nomes].map(esc).join(', ')}` : ' em outra meta'} (cada investimento conta numa meta só)</span>`;
  }
  function passoVinculosHtml(m) {
    if (ehMetaDistribuicao(m)) return passoVinculosDistribuicaoHtml();
    const ativos = estado.ctx.ativos || [];
    const vinc = m.vinculos || [];
    const temGrupo = (tipo, chave) => vinc.some((v) => v.tipo === tipo && (v.classe === chave || v.marca === chave));
    const outras = (estado.resposta.metas || []).filter((x) => x.id !== m.id);
    const usoOutras = new Map();
    outras.forEach((o) => resolverVinculos(o.vinculos, ativos, estado.ctx.cambio).itens.forEach((v) => v.ativos.forEach((a) => {
      const lista = usoOutras.get(a.id) || []; lista.push(o.nome); usoOutras.set(a.id, lista);
    })));
    const ocupadoDaMeta = (estado.ctx.ocupadoPorMeta && estado.ctx.ocupadoPorMeta[m.id || '']) || {};
    const res = resolverVinculos(vinc, ativos, estado.ctx.cambio, { ocupado: ocupadoDaMeta, aliases: estado.ctx.aliases || null });
    const atalhos = [
      ...DESTINOS_RENDA_FIXA.map((k) => ({ tipo: 'marca', chave: k, rotulo: ROTULO_MARCA[k], valor: ativos.filter((a) => a.classe === 'rf' && a.marca === k).reduce((s, a) => s + a.valorBRL, 0) })),
      ...['fiis', 'acoes', 'usa', 'rf'].map((k) => ({ tipo: 'classe', chave: k, rotulo: `Toda a classe ${ROTULO_CLASSE[k]}`, valor: ativos.filter((a) => a.classe === k && !ativoRfObjetivo(a)).reduce((s, a) => s + a.valorBRL, 0) })), // 07/10/2026: a classe Renda Fixa não conta o que está reservado pra objetivos
    ].filter((x) => x.valor > 0);
    const busca = (estado.assistente.buscaAtivo || '').toLowerCase();
    // 07/10/2026: os títulos 'objetivo' ganham um grupo próprio, "Reservado para objetivos" (não entram pela classe Renda Fixa)
    const grupos = ['rf', DESTINO_OBJETIVO, 'fiis', 'acoes', 'usa'].map((cl) => [cl, ativos.filter((a) => (cl === DESTINO_OBJETIVO ? ativoRfObjetivo(a) : (a.classe === cl && !(cl === 'rf' && ativoRfObjetivo(a)))) && (!busca || `${a.nome} ${a.descricao || ''} ${a.instituicao || ''}`.toLowerCase().includes(busca)))]).filter(([, l]) => l.length);
    const linhaAtivo = (a) => {
      const v = vinc.find((x) => x.tipo === 'ativo' && x.id === a.id);
      // 07/10/2026: título 'objetivo' NÃO entra pela classe Renda Fixa (só pela marca 'Reservado para objetivos' ou marcado direto)
      const coberto = vinc.some((x) => (x.tipo === 'classe' && x.classe === a.classe && !ativoRfObjetivo(a)) || (x.tipo === 'marca' && a.classe === 'rf' && x.marca === a.marca));
      const outrasMetas = usoOutras.get(a.id);
      const sub = [a.descricao && a.descricao !== a.nome ? a.descricao : null, a.instituicao, a.classe === 'rf' ? ROTULO_MARCA[a.marca] : null].filter(Boolean).map(esc).join(' · ');
      return `<li class="${v || coberto ? 'marcado' : ''}">
  <label class="mt-v-check"><input type="checkbox" data-vinc-ativo="${esc(a.id)}" ${v || coberto ? 'checked' : ''} ${coberto ? 'disabled' : ''}><span class="mt-v-nome">${esc(a.nome)}<em>${sub}${coberto ? ' · já entra pela classe/marca' : ''}${outrasMetas ? ` · <span class="mt-ruim">também em ${outrasMetas.map(esc).join(', ')}</span>` : ''}</em></span></label>
  <b class="mono">${formatMoeda(a.valorBRL, 'BRL', { casas: 0 })}</b>
  ${v ? `<span class="mt-v-modo"><select data-vinc-modo="${esc(a.id)}" aria-label="Quanto"><option value="total" ${v.modo === 'total' ? 'selected' : ''}>Tudo</option><option value="fracao" ${v.modo === 'fracao' ? 'selected' : ''}>%</option><option value="valor" ${v.modo === 'valor' ? 'selected' : ''}>R$</option></select>${v.modo !== 'total' ? `<input data-vinc-qtd="${esc(a.id)}" inputmode="decimal" value="${v.modo === 'fracao' ? numParaCampo((v.fracao || 0) * 100) : numParaCampo(v.valor)}" aria-label="${v.modo === 'fracao' ? 'Percentual' : 'Valor'}">` : ''}</span>` : '<span></span>'}
</li>`;
    };
    return `<p class="mt-dialogo-dica">Quais investimentos são dessa meta? O progresso anda sozinho com o valor de hoje deles. Dá pra dedicar só uma parte (% ou valor fixo).</p>
<div class="mt-atalhos">${atalhos.map((x) => `<button type="button" class="mt-chip ${temGrupo(x.tipo, x.chave) ? 'active' : ''}" data-vinc-grupo="${x.tipo}:${x.chave}" aria-pressed="${temGrupo(x.tipo, x.chave)}">${esc(x.rotulo)} <span class="mono">${formatMoeda(x.valor, 'BRL', { casas: 0 })}</span></button>`).join('')}</div>
<input class="mt-busca" type="search" placeholder="Buscar ativo, instituição…" data-vinc-busca value="${esc(estado.assistente.buscaAtivo || '')}" aria-label="Buscar ativo">
<div class="mt-v-lista">${grupos.map(([cl, lista]) => `<h4 class="mt-grupo">${cl === DESTINO_OBJETIVO ? `${ROTULO_MARCA[DESTINO_OBJETIVO]} <em class="mt-fraco">(Renda Fixa marcada "Objetivo" na carteira - não entra pela classe Renda Fixa)</em>` : ROTULO_CLASSE[cl]}</h4><ul>${lista.map(linhaAtivo).join('')}</ul>`).join('') || '<p class="hint">Nenhum ativo encontrado.</p>'}</div>
<p class="mt-v-total">Vinculado: <b class="mono">${formatMoeda(res.total)}</b>${htmlParteDeOutrasMetas(vinc, ativos, res, ocupadoDaMeta)}</p>
${saldosEditorHtml(m)}`;
  }

  function passoRevisarHtml(m) {
    if (ehMetaDistribuicao(m)) return revisarDistribuicaoHtml(m, distribuicaoDe(m), { seloHtml: seloMetaHtml(m, { tamanho: 42 }) });
    const c = calcDe(m);
    const ap = aparenciaMeta(m);
    const linhas = [
      ['Tipo', ap.rotulo],
      c.renda ? ['Renda hoje / meta', `${formatMoeda(c.renda.atual)} / ${formatMoeda(c.renda.alvo)} por mês`] : null,
      [c.viagem ? 'A juntar' : 'Alvo', c.alvoBRL != null ? `${formatMoeda(c.alvoBRL)}${c.moeda !== 'BRL' && c.alvoMoeda != null ? ` (${formatMoeda(c.alvoMoeda, c.moeda)})` : ''}` : (c.acompanhando ? 'ainda sem valor definido (só acompanhando)' : '—')],
      c.conta ? ['Conta mensal', `${formatMoeda(c.conta.valor)} x ${c.conta.total} meses`] : null,
      ['Já tem', c.acompanhando ? formatMoeda(c.atualBRL) : `${formatMoeda(c.atualBRL)} (${pct(c.percentual)})`],
      m.tipo !== 'reservaEmergencia' && !c.acompanhando ? ['Prazo', c.dataAlvo ? `${rotuloMes(c.dataAlvo)} · ${rotuloDuracao(c.mesesRestantes)}` : 'sem data'] : null,
      m.tipo !== 'reservaEmergencia' && !c.acompanhando ? [c.viagem ? 'Aporte (pra guardar)' : 'Aporte necessário', c.aporteNecessarioTotal != null ? `${formatMoeda(c.aporteNecessarioTotal)}/mês` : '—'] : null,
      ['Seu aporte', c.aporteAtual ? (c.aporteCrescente ? fraseAporteCrescente(c) : `${formatMoeda(c.aporteAtual)}/mês${c.aporteOrigem === 'historico' ? ' (real)' : ''}`) : '—'],
      c.acompanhando && c.aporteAtual > 0 ? ['Em 5 anos (estimativa)', `~${formatMoeda(projecaoPorAnos(c, [5])[0].valor, 'BRL', { casas: 0 })}`] : null,
      m.tipo === 'reservaEmergencia' ? ['Líquido hoje', formatMoeda(c.atualLiquidoBRL)] : null,
      c.aposentadoria ? ['Renda ideal', c.aposentadoria.renda ? `${formatMoeda(c.aposentadoria.renda)}/mês` : '—'] : null,
      c.viagem && c.viagem.aPagar.itens.length ? ['A pagar (já comprado)', `${formatMoeda(c.viagem.aPagar.totalBRL)}${c.viagem.aPagar.mesAtualBRL ? ` · ${formatMoeda(c.viagem.aPagar.mesAtualBRL)}/mês` : ''} - fora do aporte`] : null,
      c.entradasTotal > 0 ? ['Entradas programadas', `${formatMoeda(c.entradasTotal)} até a data`] : null,
      ['Investimentos vinculados', `${c.vinculos.length} · ${formatMoeda(c.valorVinculado)}`],
    ].filter(Boolean);
    return `<div class="mt-revisar" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <div class="mt-revisar-cab">${seloMetaHtml(m, { tamanho: 42 })}<div><strong>${esc(m.nome || '(sem nome)')}</strong>${statusPillHtml(c.status, m)}</div></div>
  <dl>${linhas.map(([k, v]) => `<div><dt>${k}</dt><dd class="mono">${esc(v)}</dd></div>`).join('')}</dl>
  ${c.avisos.length ? `<p class="mt-alerta">${c.avisos.map(esc).join(' · ')}</p>` : ''}
  ${!m.nome ? '<p class="mt-alerta">Dê um nome pra meta (passo 2).</p>' : ''}
</div>`;
  }

  function lerCampo(inp) {
    const m = estado.assistente.meta;
    const f = inp.dataset.formato;
    let v;
    if (f === 'texto' || f === 'select' || f === 'mes') v = inp.value || null;
    else if (f === 'bool') v = inp.checked;
    else if (f === 'pct') { const n = parseNumeroBR(inp.value); v = n == null ? null : n / 100; }
    else if (f === 'int' || f === 'ano') { const n = parseNumeroBR(inp.value); v = n == null ? null : Math.round(n); }
    else v = parseNumeroBR(inp.value);
    if (inp.dataset.campo === 'nome' || inp.dataset.campo === 'notas') v = inp.value;
    gravarCaminho(m, inp.dataset.campo, v);
    // 07/10/2026: o aporte digitado vale pro mês de hoje (aporte crescente conta os degraus a partir daí)
    if (inp.dataset.campo === 'aporteMensal' && m.aporteCrescimento) m.aporteCrescimento.referencia = mesDe(estado.ctx.hoje);
  }

  function validarPasso(a) {
    const m = a.meta;
    if (a.passo === 2 && ehMetaDistribuicao(m)) return erroPassoDistribuicao(m);
    if (a.passo === 2 && !String(m.nome || '').trim()) return 'Dê um nome pra meta.';
    const url = m.especificos && m.especificos.roteiroUrl;
    if (a.passo === 2 && String(url || '').trim() && normalizarUrl(url) === null) return 'O link do roteiro não parece válido (ex. https://wanderlog.com/plan/…).';
    return null;
  }

  // --- 04/10/2026: dropdown pesquisável de país/cidade (bandeira, moeda e taxa turística sugerida) ---
  const destinoDe = (i) => ((estado.assistente && estado.assistente.meta.especificos.destinos) || [])[Number(i)] || null;

  /** Preenche a taxa turística com a sugestão confirmada (só se estiver vazia, ou com `forcar`). */
  function aplicarTaxaSugerida(d, { forcar = false } = {}) {
    const sug = sugestaoTaxaTuristica(d, estado.dados.taxas);
    if (!sug || (!forcar && d.taxaTuristica != null) || (sug.moeda && d.moeda && sug.moeda !== d.moeda)) return;
    if (sug.tipo === 'fixa') { d.taxaTuristica = sug.valor; d.taxaMaxNoites = sug.maxNoites || null; } else if (sug.tipo === 'nao-cobra') d.taxaTuristica = 0;
  }
  function definirPais(d, p) {
    d.paisCodigo = p.codigo; d.pais = p.nome;
    if (p.moeda) d.moeda = p.moeda;
    aplicarTaxaSugerida(d);
  }
  /** Atualiza bandeira, moeda, taxa e total de 1 destino sem redesenhar o diálogo (não perde o foco). */
  function atualizarLinhaDestino(i) {
    const d = destinoDe(i);
    const li = el.dialogo.querySelector(`[data-dest-item="${i}"]`);
    if (!d || !li) return;
    const flag = li.querySelector('.mt-combo-flag');
    if (flag) flag.innerHTML = bandeiraHtml(d.paisCodigo, { tamanho: 22 });
    const inpPais = li.querySelector('[data-combo="pais"]');
    if (inpPais && doc.activeElement !== inpPais) inpPais.value = d.pais || '';
    const sel = li.querySelector('select[data-dest-campo="moeda"]');
    if (sel) {
      if (![...sel.options].some((o) => o.value === d.moeda)) { const o = doc.createElement('option'); o.textContent = d.moeda; sel.appendChild(o); }
      sel.value = d.moeda;
    }
    const tx = li.querySelector('[data-dest-campo="taxaTuristica"]');
    if (tx && doc.activeElement !== tx) tx.value = numParaCampo(d.taxaTuristica);
    const rotTx = li.querySelector('.mt-dest-campos.taxa label span');
    if (rotTx) rotTx.textContent = `Por pessoa/noite (${d.moeda || 'EUR'})`;
  }
  function fecharCombos(exceto = null) {
    el.dialogo.querySelectorAll('.mt-combo-lista').forEach((l) => {
      if (l === exceto) return;
      l.hidden = true;
      const inp = l.parentElement && l.parentElement.querySelector('.mt-combo-input');
      if (inp) { inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); inp.dataset.digitou = ''; }
    });
  }
  function abrirCombo(input) {
    const d = destinoDe(input.dataset.dest);
    const lista = input.parentElement && input.parentElement.querySelector('.mt-combo-lista');
    if (!d || !lista) return;
    fecharCombos(lista);
    const busca = input.dataset.digitou === '1' ? input.value : '';
    lista.innerHTML = input.dataset.combo === 'pais'
      ? opcoesPaisesHtml(estado.dados.paises, busca, { selecionado: d.paisCodigo })
      : opcoesCidadesHtml(estado.dados.cidades, d.paisCodigo, busca, { atual: d.cidade });
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    const sel = lista.querySelector('.sel');
    if (sel && !busca && sel.scrollIntoView) { try { sel.scrollIntoView({ block: 'nearest' }); } catch (e) { /* jsdom */ } }
  }
  function escolherPais(i, codigo) {
    const d = destinoDe(i);
    const p = paisPorCodigo(codigo, estado.dados.paises);
    if (!d || !p) return;
    definirPais(d, p);
    const inpPais = el.dialogo.querySelector(`[data-dest-item="${i}"] [data-combo="pais"]`);
    if (inpPais) inpPais.value = p.nome;
    fecharCombos();
    atualizarLinhaDestino(i);
    atualizarPrevia();
    const cid = el.dialogo.querySelector(`[data-dest-item="${i}"] [data-combo="cidade"]`);
    if (cid) { try { cid.focus(); } catch (e) { /* ok */ } }
  }
  function escolherCidade(i, nome) {
    const d = destinoDe(i);
    if (!d) return;
    d.cidade = nome;
    aplicarTaxaSugerida(d);
    const inp = el.dialogo.querySelector(`[data-dest-item="${i}"] [data-combo="cidade"]`);
    if (inp) inp.value = nome;
    fecharCombos();
    atualizarLinhaDestino(i);
    atualizarPrevia();
    const dias = el.dialogo.querySelector(`[data-dest-item="${i}"] [data-dest-campo="dias"]`);
    if (dias) { try { dias.focus(); } catch (e) { /* ok */ } }
  }

  // eventos do assistente (delegação no fundo do diálogo)
  el.dialogo.addEventListener('click', async (ev) => {
    const a = estado.assistente;
    if (!a) return;
    if (ev.target === el.dialogo || ev.target.closest('[data-fechar]')) { fecharAssistente(); return; }
    if (!ev.target.closest('.mt-combo')) fecharCombos();
    const opPais = ev.target.closest('[data-pais-opcao]');
    if (opPais) { escolherPais(opPais.closest('[data-dest-item]').dataset.destItem, opPais.dataset.paisOpcao); return; }
    const opCidade = ev.target.closest('[data-cidade-opcao]');
    if (opCidade) { escolherCidade(opCidade.closest('[data-dest-item]').dataset.destItem, opCidade.dataset.cidadeOpcao); return; }
    const taxaAplicar = ev.target.closest('[data-taxa-aplicar]');
    if (taxaAplicar) { const i = Number(taxaAplicar.dataset.taxaAplicar); const d = destinoDe(i); if (d) { aplicarTaxaSugerida(d, { forcar: true }); atualizarLinhaDestino(i); atualizarPrevia(); } return; }
    const addEnt = ev.target.closest('[data-entrada-add]');
    if (addEnt) { a.meta.entradas = a.meta.entradas || []; a.meta.entradas.push(entradaPadrao(addEnt.dataset.entradaAdd)); desenharAssistente(); return; }
    const remEnt = ev.target.closest('[data-entrada-remover]');
    if (remEnt) { a.meta.entradas.splice(Number(remEnt.dataset.entradaRemover), 1); desenharAssistente(); return; }
    const tipoBtn = ev.target.closest('[data-tipo]');
    if (tipoBtn) {
      const tipo = tipoBtn.dataset.tipo;
      const categoria = tipoBtn.dataset.categoria;
      if (tipo === TIPO_DISTRIBUICAO && !a.editando && distribuicaoExistente()) { const existente = distribuicaoExistente(); fecharAssistente(); irPara(existente.id); return; } // 06/10/2026: uma só
      const mudou = a.meta.tipo !== tipo || (tipo === 'acumulo' && a.meta.categoria !== categoria);
      if (mudou && !a.editando) a.meta = metaPadrao(tipo, { referencias: estado.ctx.referencias, hoje: estado.ctx.hoje, categoria });
      else if (mudou) { a.meta.tipo = tipo; a.meta.categoria = tipo === 'acumulo' ? categoria : null; }
      a.passo = 2;
      desenharAssistente();
      return;
    }
    const passoBtn = ev.target.closest('[data-passo]');
    if (passoBtn && !passoBtn.disabled) { a.passo = Number(passoBtn.dataset.passo); desenharAssistente(); return; }
    if (ev.target.closest('[data-anterior]')) { a.passo = Math.max(1, a.passo - (a.passo === 4 && ehMetaDistribuicao(a.meta) ? 2 : 1)); desenharAssistente(); return; }
    if (ev.target.closest('[data-proximo]')) {
      const erro = validarPasso(a);
      if (erro) { const p = el.dialogo.querySelector('#mtPrevia'); if (p) p.innerHTML = `<span class="mt-ruim">${erro}</span>`; return; }
      a.passo = Math.min(4, a.passo + (a.passo === 2 && ehMetaDistribuicao(a.meta) ? 2 : 1)); desenharAssistente(); return; // distribuição: sem passo de investimentos
    }
    // 03/10/2026: destinos, itens fixos e saldos em conta
    const esp = a.meta.especificos || (a.meta.especificos = {});
    if (ev.target.closest('[data-dest-add]')) {
      esp.destinos = esp.destinos || [];
      esp.destinos.push(a.meta.tipo === 'viagemNacional' ? destinoPadrao({ pais: 'Brasil', paisCodigo: 'BR', moeda: 'BRL' }) : destinoPadrao({ moeda: a.meta.moeda && a.meta.moeda !== 'BRL' ? a.meta.moeda : 'EUR' }));
      if (esp.margem == null) esp.margem = 0.1;
      if (!esp.fixos) esp.fixos = [];
      desenharAssistente();
      const ult = el.dialogo.querySelector(`[data-dest="${esp.destinos.length - 1}"][data-dest-campo="cidade"]`);
      if (ult) { try { ult.focus(); } catch (e) { /* ok */ } }
      return;
    }
    const remDest = ev.target.closest('[data-dest-remover]');
    if (remDest) { esp.destinos.splice(Number(remDest.dataset.destRemover), 1); desenharAssistente(); return; }
    if (ev.target.closest('[data-fixo-add]')) {
      esp.fixos = esp.fixos || [];
      esp.fixos.push({ id: idItem(), nome: '', valor: null, moeda: 'BRL', parcelas: 1, inicio: mesDe(estado.ctx.hoje), parte: 1, pago: false, forma: 'cartao', cartao: '', confirmado: false });
      desenharAssistente();
      const ult = el.dialogo.querySelector(`[data-fixo="${esp.fixos.length - 1}"][data-fixo-campo="nome"]`);
      if (ult) { try { ult.focus(); } catch (e) { /* ok */ } }
      return;
    }
    const remFixo = ev.target.closest('[data-fixo-remover]');
    if (remFixo) { esp.fixos.splice(Number(remFixo.dataset.fixoRemover), 1); desenharAssistente(); return; }
    if (ev.target.closest('[data-saldo-add]')) {
      a.meta.vinculos.push({ tipo: 'saldo', modo: 'total', id: idItem(), instituicao: '', moeda: a.meta.moeda && a.meta.moeda !== 'BRL' ? a.meta.moeda : 'EUR', saldo: null, atualizadoEm: String(estado.ctx.hoje || '').slice(0, 10) });
      desenharAssistente();
      const ins = el.dialogo.querySelectorAll('[data-saldo-campo="instituicao"]');
      if (ins.length) { try { ins[ins.length - 1].focus(); } catch (e) { /* ok */ } }
      return;
    }
    const remSaldo = ev.target.closest('[data-saldo-remover]');
    if (remSaldo) { a.meta.vinculos.splice(Number(remSaldo.dataset.saldoRemover), 1); desenharAssistente(); return; }
    const grupo = ev.target.closest('[data-vinc-grupo]');
    if (grupo) {
      const [tipo, chave] = grupo.dataset.vincGrupo.split(':');
      const campoChave = tipo === 'classe' ? 'classe' : 'marca';
      const tem = a.meta.vinculos.some((v) => v.tipo === tipo && v[campoChave] === chave);
      if (tem) a.meta.vinculos = a.meta.vinculos.filter((v) => !(v.tipo === tipo && v[campoChave] === chave));
      else a.meta.vinculos.push({ tipo, [campoChave]: chave, modo: 'total' });
      desenharAssistente();
      return;
    }
    const salvarBtn = ev.target.closest('[data-salvar]');
    if (salvarBtn) {
      if (!String(a.meta.nome || '').trim() || (ehMetaDistribuicao(a.meta) && erroPassoDistribuicao(a.meta))) { a.passo = 2; desenharAssistente(); return; }
      salvarBtn.disabled = true;
      salvarBtn.textContent = 'Salvando…';
      const meta = clonar(a.meta);
      if (meta.contribuicao !== 'recorrente') meta.recorrente = null;
      if (meta.contaMensal && !(meta.contaMensal.valor > 0)) meta.contaMensal = null;
      (meta.vinculos || []).forEach((v) => { if (v.tipo === 'saldo' && !String(v.instituicao || '').trim() && String(v.nome || '').trim()) v.instituicao = v.nome; }); // 07/10/2026: só o nome já basta
      meta.vinculos = (meta.vinculos || []).filter((v) => v.tipo !== 'saldo' || String(v.instituicao || '').trim());
      // 07/10/2026: aporte crescente sem valor não vale nada; com valor, sempre carrega o mês a que o aporte se refere
      if (meta.aporteCrescimento && !(meta.aporteCrescimento.valor > 0)) delete meta.aporteCrescimento;
      else if (meta.aporteCrescimento && !meta.aporteCrescimento.referencia) meta.aporteCrescimento.referencia = mesDe(estado.ctx.hoje);
      if (meta.especificos && Array.isArray(meta.especificos.destinos)) meta.especificos.destinos = meta.especificos.destinos.filter((d) => String(d.cidade || d.pais || '').trim());
      if (meta.especificos && Array.isArray(meta.especificos.fixos)) meta.especificos.fixos = meta.especificos.fixos.filter((x) => String(x.nome || '').trim());
      if (meta.especificos && 'roteiroUrl' in meta.especificos) meta.especificos.roteiroUrl = normalizarUrl(meta.especificos.roteiroUrl) || '';
      delete meta._revisar; delete meta._entradasPadrao; // só da migração, na tela
      if (Array.isArray(meta.entradas)) meta.entradas = meta.entradas.filter((e) => e && e.tipo);
      const salva = await salvar(meta);
      if (salva) fecharAssistente(); else { salvarBtn.disabled = false; salvarBtn.textContent = 'Tentar de novo'; }
    }
  });
  el.dialogo.addEventListener('input', (ev) => {
    const a = estado.assistente;
    if (!a) return;
    const t = ev.target;
    if (t.dataset.campo && !['select', 'bool', 'mes'].includes(t.dataset.formato)) { lerCampo(t); atualizarPrevia(); }
    if (t.dataset.combo) { // país/cidade: digitar filtra a lista (a cidade fora da lista vale)
      const d = destinoDe(t.dataset.dest);
      if (d) { if (t.dataset.combo === 'pais') d.pais = t.value; else d.cidade = t.value; }
      t.dataset.digitou = '1';
      abrirCombo(t);
      atualizarPrevia();
    } else if (t.dataset.dest != null && t.tagName !== 'SELECT') {
      const d = (a.meta.especificos.destinos || [])[Number(t.dataset.dest)];
      if (d) gravarCaminho(d, t.dataset.destCampo, ['cidade', 'pais'].includes(t.dataset.destCampo) ? t.value : parseNumeroBR(t.value));
      atualizarPrevia();
    }
    if (t.dataset.entrada != null && t.type !== 'checkbox' && t.type !== 'month' && t.tagName !== 'SELECT') {
      const e = (a.meta.entradas || [])[Number(t.dataset.entrada)];
      const k = t.dataset.entradaCampo;
      if (e) {
        if (k === 'nome') e.nome = t.value;
        else if (k === 'pct') { const n = parseNumeroBR(t.value); e.pct = n == null ? 1 : Math.max(0, Math.min(1, n / 100)); } else e[k] = parseNumeroBR(t.value);
      }
      atualizarPrevia();
    }
    if (t.dataset.fixo != null && t.type !== 'checkbox' && t.tagName !== 'SELECT' && t.type !== 'month') {
      const fx = (a.meta.especificos.fixos || [])[Number(t.dataset.fixo)];
      const k = t.dataset.fixoCampo;
      if (fx) {
        if (k === 'nome') fx.nome = t.value;
        else if (k === 'cartao') fx.cartao = t.value;
        else if (k === 'parte') { const n = parseNumeroBR(t.value); fx.parte = n == null ? 1 : Math.max(0, Math.min(1, n / 100)); }
        else if (k === 'parcelas') { const n = parseNumeroBR(t.value); fx.parcelas = n == null ? 1 : Math.max(1, Math.round(n)); }
        else fx[k] = parseNumeroBR(t.value);
      }
      atualizarPrevia();
    }
    if (t.dataset.saldo != null && t.tagName !== 'SELECT' && t.type !== 'date' && t.type !== 'checkbox') {
      const v = a.meta.vinculos[Number(t.dataset.saldo)];
      if (v) {
        const kS = t.dataset.saldoCampo;
        if (kS === 'instituicao') v.instituicao = t.value;
        else if (kS === 'nome') v.nome = t.value;
        else if (kS === 'cdiPct') { const nC = parseNumeroBR(t.value); v.cdiPct = nC > 0 ? nC : null; } // 07/10/2026: rendimento estimado em % do CDI
        else { v.saldo = parseNumeroBR(t.value); v.atualizadoEm = String(estado.ctx.hoje || '').slice(0, 10); }
        const brl = t.closest('li') && t.closest('li').querySelector('.mt-saldo-brl');
        const cot = cotacao(v.moeda || 'BRL', estado.ctx.cambio);
        if (brl) brl.textContent = v.moeda !== 'BRL' && cot ? `≈ ${r0((Number(v.saldo) || 0) * cot)}` : '';
      }
      atualizarPrevia();
    }
    if (t.dataset.cresc === 'valor' && a.meta.aporteCrescimento) { // 07/10/2026: quanto o aporte aumenta por ano (R$ ou %)
      const nA = parseNumeroBR(t.value);
      a.meta.aporteCrescimento.valor = nA == null || nA <= 0 ? null : (a.meta.aporteCrescimento.tipo === 'pct' ? nA / 100 : nA);
      atualizarPrevia();
    }
    if (t.dataset.vincQtd) {
      const v = a.meta.vinculos.find((x) => x.tipo === 'ativo' && x.id === t.dataset.vincQtd);
      const n = parseNumeroBR(t.value);
      if (v && v.modo === 'fracao') v.fracao = n == null ? 0 : Math.max(0, Math.min(1, n / 100));
      if (v && v.modo === 'valor') v.valor = n == null ? 0 : Math.max(0, n);
      const tot = el.dialogo.querySelector('.mt-v-total b');
      if (tot) tot.textContent = formatMoeda(resolverVinculos(a.meta.vinculos, estado.ctx.ativos).total);
    }
    if (t.dataset.vincBusca != null) {
      a.buscaAtivo = t.value;
      const lista = el.dialogo.querySelector('.mt-v-lista');
      const tmp = doc.createElement('div');
      tmp.innerHTML = passoVinculosHtml(a.meta);
      const nova = tmp.querySelector('.mt-v-lista');
      if (lista && nova) lista.replaceWith(nova);
    }
  });
  el.dialogo.addEventListener('change', (ev) => {
    const a = estado.assistente;
    if (!a) return;
    const t = ev.target;
    if (t.dataset.campo && ['select', 'bool', 'mes'].includes(t.dataset.formato)) {
      lerCampo(t);
      if (['contribuicao', 'moeda', 'categoria', 'especificos.usarDespesasPlanilha', 'especificos.modoAlvo'].includes(t.dataset.campo)) {
        if (t.dataset.campo === 'contribuicao' && t.value === 'recorrente' && !a.meta.recorrente) a.meta.recorrente = { parcela: null, totalParcelas: 12, inicio: mesDe(estado.ctx.hoje) };
        if (t.dataset.campo === 'moeda') (a.meta.itens || []).forEach((it) => { if (!it.valor) it.moeda = t.value; });
        desenharAssistente();
      } else atualizarPrevia();
    }
    if (t.dataset.combo) { // saiu do campo de país/cidade: casa o que foi digitado com a lista (sinônimos, sem acento)
      const i = t.dataset.dest;
      const d = destinoDe(i);
      if (d && t.dataset.combo === 'pais') {
        const p = acharPais(t.value, estado.dados.paises);
        if (p) definirPais(d, p); else { d.pais = t.value; d.paisCodigo = null; }
      } else if (d) aplicarTaxaSugerida(d);
      atualizarLinhaDestino(i);
      atualizarPrevia();
      return;
    }
    if (t.dataset.dest != null && t.tagName === 'SELECT') {
      const d = (a.meta.especificos.destinos || [])[Number(t.dataset.dest)];
      if (d) d.moeda = t.value;
      atualizarLinhaDestino(t.dataset.dest);
      atualizarPrevia();
    }
    if (t.dataset.fixo != null && (t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'month')) {
      const fx = (a.meta.especificos.fixos || [])[Number(t.dataset.fixo)];
      if (fx) {
        fx[t.dataset.fixoCampo] = t.type === 'checkbox' ? t.checked : (t.value || null);
        if (t.dataset.fixoCampo === 'forma') { // muda os campos que aparecem (cartão: parcelas, 1ª fatura...)
          fx.pago = fx.forma === 'pago';
          if (fx.forma === 'cartao' && !fx.inicio) fx.inicio = mesDe(estado.ctx.hoje);
          desenharAssistente();
          return;
        }
      }
      atualizarPrevia();
    }
    if (t.dataset.entrada != null && (t.type === 'checkbox' || t.type === 'month' || t.tagName === 'SELECT')) {
      const e = (a.meta.entradas || [])[Number(t.dataset.entrada)];
      if (e) {
        const k = t.dataset.entradaCampo;
        if (t.type === 'checkbox') e.ativo = t.checked; else e[k] = t.value || null;
        if (k === 'ativo') { desenharAssistente(); return; }
      }
      atualizarPrevia();
    }
    if (t.dataset.saldo != null && t.tagName === 'SELECT') {
      const v = a.meta.vinculos[Number(t.dataset.saldo)];
      if (v) { v.moeda = t.value; if (v.moeda !== 'BRL') v.cdiPct = null; } // CDI só vale pra saldo em reais
      desenharAssistente();
    }
    if (t.dataset.saldo != null && t.type === 'checkbox') { // 07/10/2026: "conta no meu patrimônio"
      const v = a.meta.vinculos[Number(t.dataset.saldo)];
      if (v) v.contaNoPatrimonio = t.checked;
    }
    if (t.dataset.semAlvo != null) { // 07/10/2026: "Ainda não sei o valor nem a data"
      const m = a.meta;
      const esp = m.especificos || (m.especificos = {});
      if (t.checked) {
        m.valorAlvo = null; m.dataAlvo = null; m.itens = [];
        if (m.tipo === 'casa') esp.valorImovel = null;
        if (m.tipo === 'carro') esp.valorCarro = null;
      } else m.dataAlvo = somarMeses(mesDe(estado.ctx.hoje), m.tipo === 'casa' ? 60 : (m.tipo === 'carro' ? 24 : 12));
      desenharAssistente();
      return;
    }
    if (t.dataset.cresc && t.dataset.cresc !== 'valor') { // 07/10/2026: aporte crescente - tipo, mês do aumento e "começou em"
      const k = t.dataset.cresc;
      const mesHoje = mesDe(estado.ctx.hoje);
      if (k === 'tipo') {
        if (!t.value) delete a.meta.aporteCrescimento;
        else {
          const cr = a.meta.aporteCrescimento || { valor: null, mes: null, referencia: mesHoje, inicio: null };
          if (cr.tipo !== t.value) cr.valor = null;
          cr.tipo = t.value;
          a.meta.aporteCrescimento = cr;
        }
        desenharAssistente();
        return;
      }
      if (a.meta.aporteCrescimento) a.meta.aporteCrescimento[k] = k === 'mes' ? (t.value ? Number(t.value) : null) : (t.value || null);
      atualizarPrevia();
    }
    if (t.dataset.saldo != null && t.type === 'date') {
      const v = a.meta.vinculos[Number(t.dataset.saldo)];
      if (v && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) v.atualizadoEm = t.value;
    }
    if (t.dataset.vincAtivo) {
      const id = t.dataset.vincAtivo;
      if (t.checked) {
        const ativo = (estado.ctx.ativos || []).find((x) => x.id === id);
        a.meta.vinculos.push({ tipo: 'ativo', id, nome: ativo ? ativo.nome : '', modo: 'total' });
      } else a.meta.vinculos = a.meta.vinculos.filter((v) => !(v.tipo === 'ativo' && v.id === id));
      desenharAssistente();
    }
    if (t.dataset.vincModo) {
      const v = a.meta.vinculos.find((x) => x.tipo === 'ativo' && x.id === t.dataset.vincModo);
      if (v) {
        v.modo = t.value;
        if (v.modo === 'fracao' && v.fracao == null) v.fracao = 0.5;
        if (v.modo === 'valor' && v.valor == null) { const at = (estado.ctx.ativos || []).find((x) => x.id === v.id); v.valor = at ? Math.round(at.valorBRL / 2) : 0; }
      }
      desenharAssistente();
    }
  });
  // dropdown de país/cidade: abre ao focar, navega com as setas, Enter escolhe, Esc fecha só a lista
  el.dialogo.addEventListener('focusin', (ev) => { if (estado.assistente && ev.target.dataset && ev.target.dataset.combo) { ev.target.dataset.digitou = ''; abrirCombo(ev.target); } });
  el.dialogo.addEventListener('focusout', (ev) => {
    const caixa = ev.target.closest && ev.target.closest('.mt-combo');
    if (caixa) setTimeout(() => { if (!caixa.contains(doc.activeElement)) fecharCombos(); }, 0);
  });
  el.dialogo.addEventListener('mousedown', (ev) => { if (ev.target.closest && ev.target.closest('.mt-combo-op')) ev.preventDefault(); }); // não tira o foco do campo
  el.dialogo.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (!estado.assistente || !t.dataset || !t.dataset.combo) return;
    const lista = t.parentElement.querySelector('.mt-combo-lista');
    const ops = lista && !lista.hidden ? [...lista.querySelectorAll('.mt-combo-op')] : [];
    if (ev.key === 'Escape' && lista && !lista.hidden) { ev.stopPropagation(); fecharCombos(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (lista && lista.hidden) { abrirCombo(t); return; }
      if (!ops.length) return;
      const atual = ops.findIndex((o) => o.classList.contains('ativo'));
      const prox = ev.key === 'ArrowDown' ? Math.min(ops.length - 1, atual + 1) : Math.max(0, atual < 0 ? 0 : atual - 1);
      ops.forEach((o, k) => { o.classList.toggle('ativo', k === prox); });
      if (ops[prox].id) t.setAttribute('aria-activedescendant', ops[prox].id);
      if (ops[prox].scrollIntoView) { try { ops[prox].scrollIntoView({ block: 'nearest' }); } catch (e) { /* jsdom */ } }
      return;
    }
    if (ev.key === 'Enter' && ops.length) {
      const alvo = ops.find((o) => o.classList.contains('ativo')) || (ops.length === 1 ? ops[0] : null);
      if (alvo) { ev.preventDefault(); alvo.click(); }
    }
  });
  doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && estado.assistente) fecharAssistente(); });

  // 07/10/2026: lembra se a seção Estimativas estava aberta (o detalhe é redesenhado ao salvar)
  el.tela.addEventListener('toggle', (ev) => { if (ev.target && ev.target.id === 'mtEstimDet') estado.estimAberta = ev.target.open; }, true);

  // eventos da tela
  el.tela.addEventListener('click', async (ev) => {
    const abrir = ev.target.closest('[data-abrir]');
    if (abrir) { irPara(abrir.dataset.abrir); return; }
    if (ev.target.closest('[data-voltar]')) { ev.preventDefault(); irPara(null); return; }
    const ft = ev.target.closest('[data-filtro-tipo]');
    if (ft) { estado.filtroTipo = ft.dataset.filtroTipo; desenhar(); return; }
    if (ev.target.closest('[data-nova]')) { abrirAssistente(metaPadrao('acumulo', { hoje: estado.ctx.hoje }), 1); return; }
    const sug = ev.target.closest('[data-sugestao]');
    if (sug) {
      const s = (estado.sugestoes || [])[Number(sug.dataset.sugestao)];
      if (!s) return;
      sug.disabled = true;
      sug.classList.add('salvando');
      await salvar(clonar(s.meta));
      return;
    }
    const ign = ev.target.closest('[data-ignorar-sobreposicao]');
    if (ign) { await ignorarSobreposicao((ign.dataset.ignorarSobreposicao || estado.detalheId || '').split(',').filter(Boolean)); return; }
    const meta = estado.detalheId ? acharMeta(estado.detalheId) : null;
    if (!meta) return;
    if (ev.target.closest('[data-editar]')) { abrirAssistente(meta, 2, { editando: true }); return; }
    if (ev.target.closest('[data-editar-vinculos]')) { abrirAssistente(meta, 3, { editando: true }); return; }
    if (ev.target.closest('[data-arquivar]')) { await arquivar(meta); return; }
    if (ev.target.closest('[data-excluir-definitivo]')) { await excluirDefinitivo(meta); return; }
    const modoHist = ev.target.closest('[data-modo-hist]');
    if (modoHist) {
      estado.modoHist = modoHist.dataset.modoHist;
      el.tela.querySelectorAll('[data-modo-hist]').forEach((b) => b.setAttribute('aria-pressed', String(b === modoHist)));
      desenharHistorico(meta, calcDe(meta));
      return;
    }
    const edSaldo = ev.target.closest('[data-saldo-editar]');
    if (edSaldo) {
      estado.editandoSaldo = edSaldo.dataset.saldoEditar; desenhar();
      const inp = doc.getElementById('mtSaldoNovo'); if (inp) { try { inp.focus(); inp.select(); } catch (e) { /* ok */ } }
      return;
    }
    if (ev.target.closest('[data-saldo-cancelar]')) { estado.editandoSaldo = null; desenhar(); return; }
    const svSaldo = ev.target.closest('[data-saldo-salvar]');
    if (svSaldo) { const inp = doc.getElementById('mtSaldoNovo'); await salvarSaldo(meta, svSaldo.dataset.saldoSalvar, inp ? parseNumeroBR(inp.value) : null); return; }
    if (ev.target.closest('[data-add-saldo]')) {
      const m = clonar(meta);
      m.vinculos = m.vinculos || [];
      m.vinculos.push({ tipo: 'saldo', modo: 'total', id: idItem(), instituicao: '', moeda: m.moeda && m.moeda !== 'BRL' ? m.moeda : 'EUR', saldo: null, atualizadoEm: String(estado.ctx.hoje || '').slice(0, 10) });
      abrirAssistente(m, 3, { editando: true });
      return;
    }
    if (ev.target.closest('[data-restaurar]')) { await arquivar(meta, true); }
  });
  if (el.nova) el.nova.addEventListener('click', () => { if (estado.ctx) abrirAssistente(metaPadrao('acumulo', { hoje: estado.ctx.hoje }), 1); });

  el.tela.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || !ev.target || ev.target.id !== 'mtSaldoNovo') return;
    const btn = el.tela.querySelector('[data-saldo-salvar]');
    if (btn) { ev.preventDefault(); btn.click(); }
  });

  if (win) {
    win.addEventListener('popstate', () => { const id = idDoHash(); if (id !== estado.detalheId) { estado.detalheId = id; desenhar(); } });
    win.addEventListener('hashchange', () => {
      if (novaDoHash()) { estado.novaPendente = novaDoHash(); abrirNovaPendente(); return; }
      const id = idDoHash(); if (id !== estado.detalheId) { estado.detalheId = id; desenhar(); }
    });
    // 06/10/2026: os gráficos da biblioteca se redimensionam sozinhos (ResizeObserver) - não precisa redesenhar no resize
  }
  estado.detalheId = idDoHash();
  estado.novaPendente = novaDoHash();

  // 04/10/2026: países/cidades/taxas em paralelo com as metas (arquivos pequenos, no cache do service worker)
  estado.dadosPromise = (async () => {
    let d = null;
    try { d = await carregarDadosViagemImpl(); } catch (e) { d = null; }
    if (d && Array.isArray(d.paises) && d.paises.length) { estado.dados = { paises: d.paises, cidades: d.cidades || null, taxas: d.taxas || null }; aoChegarDadosViagem(); }
  })();

  async function carregarERedesenhar() {
    const [resposta] = await Promise.all([getMetasImpl(token), estado.dadosPromise]);
    if (resposta && resposta.ok) gravarCacheDados('metas', resposta);
    desenharResposta(resposta);
    if (resposta && resposta.ok) carregarHistorico();
  }

  if (usarCache) {
    const emCache = await lerCacheDados('metas');
    if (emCache) { try { desenharResposta(emCache.dados); } catch (erro) { console.error('cache das metas não desenhou', erro); } }
  }
  await mountRefreshControl(doc, el.refresh, carregarERedesenhar).atualizar();
  return { estado, desenhar, abrirAssistente, irPara, carregarHistorico };
}

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
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { urlAtivo } from '../link-ativo.js';
import { ligarFiltroPeriodo, ehPeriodoPersonalizado } from '../periodo-personalizado.js';
import { renderAnalise } from '../analise-grafico.js';
import {
  TIPOS_META, CATEGORIAS_ACUMULO, MOEDAS, STATUS_META, EXPLICACOES, aparenciaMeta, calcularMeta, serieProjecao, resumoMetas,
  metaPadrao, metaDaPlanilha, sugestoesMetas, simular, resolverVinculos, ativosSobrecomprometidos, rotuloMes, rotuloDuracao,
  mesesEntre, mesDe, cotacao, somarMeses, velocidadeMeta, dicasAcelerar, marcosProjecao, cenariosRendaMenor,
  analisarHistoricoMeta, analisarProjecaoMeta, analisarRendaMensal, SUGESTOES_INVESTIMENTO, chaveSugestaoInvestimento,
  avaliarVinculos, destinoPadrao, contaAposentadoria, calcularViagem, explicarStatus,
} from './metas-calc.js';
import {
  iconeMetaSvg, seloMetaHtml, escHtml, formatMoeda, valorGrandeHtml, pct, statusPillHtml, garantirEstiloMetas, contextoMetas,
  metaPrincipalDoTipo, tipoMetaDoSlug, infoHtml, statusComDicaHtml,
} from '../metas-card.js';
import { graficoProjecaoSvg, graficoHistoricoSvg, graficoRendaSvg, ligarTooltipGrafico } from './metas-graficos.js';

export { graficoProjecaoSvg };

/** Conteúdo do <main> da aba (o router injeta - ver router.js, rota "metas"). */
export const TEMPLATE_METAS = `
<div class="mt-pagina">
  <div class="mt-titulo">
    <div>
      <h1>Metas e Objetivos</h1>
      <p>Quanto falta, quanto aportar por mês e se você está no ritmo - com os seus investimentos de verdade.</p>
    </div>
    <div class="mt-titulo-acoes">
      <div id="mtRefresh" class="refresh-control"></div>
      <button class="btn btn-primary" id="mtNova" type="button"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nova meta</button>
    </div>
  </div>
  <div class="mt-carregando" id="mtCarregando" aria-hidden="true">
    <div class="mt-skel-resumo"><span class="skel"></span><span class="skel"></span><span class="skel"></span></div>
    <div class="mt-grade"><span class="skel" style="height:210px"></span><span class="skel" style="height:210px"></span><span class="skel" style="height:210px"></span></div>
  </div>
  <div class="mt-erro" id="mtErro" hidden></div>
  <div class="avisos-banner" id="mtAvisos" hidden></div>
  <div id="mtTela" hidden></div>
</div>
<div class="mt-dialogo-fundo" id="mtDialogo" hidden></div>
`;

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
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
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

const clonar = (o) => JSON.parse(JSON.stringify(o));
const idItem = () => Math.random().toString(36).slice(2, 10);
const ROTULO_CLASSE = { acoes: 'Ações', fiis: 'FIIs', usa: 'Ações EUA', rf: 'Renda Fixa' };
const ROTULO_MARCA = { emergencial: 'Renda Emergencial', 'longo-prazo': 'Renda Fixa de longo prazo' };
const FILTROS_STATUS = [
  ['todas', 'Todas'], ['no-ritmo', 'No ritmo'], ['atrasadas', 'Atrasadas'], ['concluidas', 'Concluídas'], ['arquivadas', 'Arquivadas'],
];
const MOEDAS_SALDO = ['EUR', 'USD', 'GBP', 'BRL', 'CHF', 'CAD', 'AUD', 'JPY'];
const CATEGORIAS_DIARIA = [['alimentacao', 'Alimentação'], ['transporte', 'Transporte'], ['passeios', 'Passeios'], ['compras', 'Compras']];
const r0 = (v) => formatMoeda(v, 'BRL', { casas: 0 });

function passaFiltroStatus(filtro, c) {
  if (filtro === 'todas' || filtro === 'arquivadas') return true;
  if (filtro === 'no-ritmo') return ['no-ritmo', 'saldo-ideal', 'sem-prazo'].includes(c.status);
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
};
function iconeNum(chave, tamanho = 15) {
  return `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_NUM[chave] || ICONE_NUM.alvo}</svg>`;
}

/** Anel de progresso (SVG): `p` 0-1; `p2` (opcional) = anel fino de fora (ex. bruto da reserva). */
export function anelProgressoHtml(p, { tamanho = 104, tom = 'meta', p2 = null, rotulo = 'da meta' } = {}) {
  const r = 42; const C = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, p || 0));
  const v2 = p2 == null ? null : Math.max(0, Math.min(1, p2));
  return `<div class="mt-anel ${tom}" style="width:${tamanho}px;height:${tamanho}px" role="img" aria-label="${pct(p)} ${rotulo}">
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="${r}" class="mt-anel-fundo"/>
    ${v2 != null ? `<circle cx="50" cy="50" r="47.5" class="mt-anel-bruto" stroke-dasharray="${(v2 * 2 * Math.PI * 47.5).toFixed(1)} ${(2 * Math.PI * 47.5).toFixed(1)}" transform="rotate(-90 50 50)"/>` : ''}
    <circle cx="50" cy="50" r="${r}" class="mt-anel-valor" stroke-dasharray="${(v * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/>
  </svg>
  <span class="mt-anel-txt"><b>${pct(p)}</b><small>${rotulo}</small></span>
</div>`;
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
  const voce = c.aporteAtual ? `${formatMoeda(c.aporteAtual, 'BRL', { casas: 0 })}${c.aporteOrigem === 'historico' ? ' (real)' : ''}` : '—';
  const aporte = necessario != null && necessario > 0
    ? `<div class="mt-aporte ${c.aporteAtual + 0.5 >= (c.parcelasCorrendo > 0 ? (c.aporteNecessario || 0) : necessario) ? 'ok' : 'baixo'}"><span>Aporte/mês</span><b>${formatMoeda(necessario, 'BRL', { casas: 0 })}</b><span class="mt-fraco">necessário${c.parcelasCorrendo > 0 ? ` (${r0(c.parcelasCorrendo)} de parcelas)` : ''} · você: ${voce}</span></div>`
    : (c.dataEstimada && c.status !== 'concluida' && c.status !== 'saldo-ideal' ? `<div class="mt-aporte ok"><span>Nesse ritmo</span><b>${rotuloMes(c.dataEstimada)}</b><span class="mt-fraco">${c.aporteAtual > 0 ? `aportando ${voce}/mês` : 'só com o rendimento'}</span></div>` : '');
  return `<button class="mt-card" type="button" data-abrir="${escHtml(meta.id)}" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <span class="mt-card-cab">
    ${seloMetaHtml(meta)}
    <span class="mt-card-tit"><strong>${escHtml(meta.nome)}</strong><span>${escHtml(ap.rotulo)}${meta.contribuicao === 'recorrente' ? ' · pagamento recorrente' : ''}</span></span>
    ${meta.status === 'arquivada' ? '<span class="mt-status na">Arquivada</span>' : statusPillHtml(c.status, meta)}
  </span>
  <span class="mt-card-valor">${linhaValor}</span>
  <span class="mt-barra ${p >= 1 ? 'good' : ''}"><span style="width:${(p * 100).toFixed(1)}%"></span></span>
  <span class="mt-card-pct"><b>${pct(c.percentual)}</b>${c.vinculos.length ? ` · ${c.vinculos.length} ${c.vinculos.length === 1 ? 'vínculo' : 'vínculos'}` : ''}</span>
  <span class="mt-card-linhas">${linhas.map(([r, v]) => `<span><em>${r}</em><b>${v}</b></span>`).join('')}</span>
  ${aporte}
</button>`;
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
  if (!(c.alvoBRL > 0)) return { tom: 'neutro', html: 'Defina o alvo (Editar) para ver quando você chega.' };
  if (c.dataEstimada) {
    let quando = `<b>${rotuloMes(c.dataEstimada)}</b> (${rotuloDuracao(c.mesesEstimados)})`;
    let tom = 'neutro';
    if (c.mesesRestantes != null) {
      const dif = Math.ceil(c.mesesEstimados) - c.mesesRestantes;
      tom = dif <= 0 ? 'bom' : 'ruim';
      quando += dif <= 0 ? ` - <span class="mt-bom">${rotuloDuracao(-dif) === 'agora' ? 'bem no prazo' : `${rotuloDuracao(-dif)} antes do prazo`}</span>` : ` - <span class="mt-ruim">${rotuloDuracao(dif)} depois do prazo</span>`;
    }
    return { tom, html: `Nesse ritmo você chega em ${quando}${aporteTxt ? `, aportando ${aporteTxt}` : ' só com o rendimento'}.` };
  }
  if (c.aporteOrigem === 'nenhum') return { tom: 'neutro', html: 'Ainda não dá pra saber o seu ritmo: vincule investimentos (o aporte real sai do histórico deles) ou informe um aporte mensal em Editar.' };
  return { tom: 'ruim', html: `No ritmo de hoje (${aporteTxt || 'sem aporte'}) a meta não chega no alvo - veja as simulações abaixo.` };
}

export function heroiHtml(meta, c, { arquivada = false, marcos = [] } = {}) {
  const ap = aparenciaMeta(meta);
  const reserva = meta.tipo === 'reservaEmergencia';
  const estrangeira = c.moeda !== 'BRL' && c.alvoMoeda != null;
  const nums = [];
  const aporteSub = (necessario) => {
    if (necessario == null) return c.aporteOrigem === 'historico' ? `média dos últimos ${c.mesesBaseAporte || 12} meses${c.aporteReal < -0.5 ? ' - saiu mais do que entrou (resgates)' : ''}` : (c.aporteOrigem === 'informado' ? 'informado por você' : 'sem histórico ainda');
    const dif = (c.aporteAtual || 0) - necessario;
    return `necessário <b>${r0(necessario)}</b> ${chipDelta(dif, { sufixo: '/mês' })}`;
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
  const parcelas = !reserva && c.parcelasCorrendo > 0 ? c.parcelasCorrendo : 0;
  const necJuntar = reserva ? null : (parcelas ? c.aporteNecessario : c.aporteNecessarioTotal);
  const subParcelas = parcelas ? `+ <b>${r0(parcelas)}</b>/mês de parcelas` : '';
  const subAporte = parcelas && !(necJuntar > 0) ? `nada a juntar · ${subParcelas}` : `${aporteSub(necJuntar)}${parcelas ? ` · ${subParcelas}` : ''}`;
  nums.push(numHeroi({ icone: 'moeda', rotulo: c.aporteOrigem === 'historico' ? 'Seu aporte real' : 'Seu aporte', valor: valorAporte, tom: necJuntar != null && necJuntar > 0 ? (c.aporteAtual + 0.5 >= necJuntar ? 'bom' : 'ruim') : '', sub: subAporte, dica: EXPLICACOES.aporteReal }));
  if (meta.tipo === 'aposentadoria' && c.aposentadoria) {
    const prox = (marcos || []).find((m) => !m.ja && m.mes);
    nums.splice(1, 0, numHeroi({ icone: 'alvo', rotulo: 'Montante alvo', valor: c.alvoBRL != null ? valorGrandeHtml(c.alvoBRL) : '—', sub: `renda ideal <b>${c.aposentadoria.renda ? r0(c.aposentadoria.renda) : '—'}</b>/mês${prox ? ` · ${prox.rotulo} em <b>${prox.ano}</b>` : ''}`, dica: EXPLICACOES.taxaRetirada }));
  }
  const ritmo = fraseRitmo(meta, c);
  const p = c.percentual || 0;
  const tomAnel = ['concluida', 'saldo-ideal'].includes(c.status) ? 'bom' : (['atrasada', 'vencida'].includes(c.status) ? 'ruim' : 'meta');
  const viagemInfo = meta.especificos && meta.especificos.destino ? ` · ${escHtml(meta.especificos.destino)}` : '';
  const destinosTxt = c.viagem && c.viagem.destinos.length ? ` · ${c.viagem.destinos.map((d) => escHtml(d.cidade || d.pais)).join(', ')}` : '';
  return `<section class="mt-heroi mt-heroi-v2" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <div class="mt-heroi-cab">
    ${seloMetaHtml(meta, { tamanho: 46 })}
    <div class="mt-heroi-tit"><span class="mt-eyebrow">${escHtml(ap.rotulo)}${viagemInfo}${destinosTxt}${c.dataAlvo ? ` · até ${rotuloMes(c.dataAlvo)}` : ''}</span><h2>${escHtml(meta.nome)}</h2></div>
    ${arquivada ? '<span class="mt-status na">Arquivada</span>' : statusComDicaHtml(c.status, meta)}
    <div class="mt-heroi-acoes">
      ${arquivada ? '<button class="btn btn-ghost mt-btn-sm" type="button" data-restaurar>Restaurar</button><button class="btn btn-ghost mt-btn-sm mt-btn-perigo" type="button" data-excluir-definitivo>Excluir definitivamente</button>' : '<button class="btn btn-ghost mt-btn-sm" type="button" data-editar>Editar</button><button class="btn btn-ghost mt-btn-sm" type="button" data-arquivar>Arquivar</button>'}
    </div>
  </div>
  <div class="mt-heroi-corpo">
    ${anelProgressoHtml(p, { tom: tomAnel, p2: reserva && c.liquido.impostoBRL > 0 ? c.percentualBruto : null, rotulo: reserva ? 'líquido' : 'da meta' })}
    <div class="mt-heroi-numeros">${nums.join('')}</div>
  </div>
  ${reserva && c.liquido.impostoBRL > 0 ? `<p class="mt-heroi-legenda"><i class="liq"></i>líquido ${pct(c.percentual)} <i class="bru"></i>bruto ${pct(c.percentualBruto)} do saldo ideal</p>` : ''}
  <p class="mt-heroi-ritmo ${ritmo.tom}">${iconeNum(ritmo.tom === 'bom' ? 'foguete' : 'relogio', 16)}<span>${ritmo.html}</span>${infoHtml(EXPLICACOES.noSeuRitmo, { rotulo: 'Como o ritmo é calculado?' })}</p>
  ${meta.notas ? `<p class="mt-notas">${escHtml(meta.notas)}</p>` : ''}
  ${c.avisos.length ? `<p class="mt-alerta">${c.avisos.map(escHtml).join(' · ')}</p>` : ''}
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

const PERIODOS_HIST = [['6m', '6M'], ['12m', '12M'], ['24m', '24M'], ['tudo', 'Tudo']];
const PERIODOS_PROJ = [['12m', '12 meses'], ['60m', '5 anos'], ['fim', 'Até o alvo']];

function tabsPeriodoHtml(lista, atual, rotulo) {
  return `<div class="filter-tabs mt-tabs-periodo" role="group" aria-label="${escHtml(rotulo)}">${lista.map(([k, r]) => `<button type="button" class="filter-tab ${atual === k ? 'active' : ''}" data-periodo="${k}">${r}</button>`).join('')}</div>`;
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
    nova: doc.getElementById('mtNova'),
    refresh: doc.getElementById('mtRefresh'),
  };
  if (!el.tela) return null;

  const estado = {
    resposta: null, ctx: null, filtroStatus: 'todas', filtroTipo: 'todos', detalheId: null, assistente: null, simulador: null,
    historico: null, indices: [], historicoCarregando: false, historicoErro: null,
    modoHist: 'acumulado', periodos: { hist: '12m', proj: 'fim', renda: '12m' }, editandoSaldo: null,
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

  function desenharResposta(resposta) {
    if (el.carregando) el.carregando.hidden = true;
    if (!resposta || !resposta.ok) {
      if (!estado.resposta && el.erro) {
        el.erro.hidden = false;
        el.erro.textContent = `Não deu pra carregar as metas agora (${(resposta && resposta.etapa) || '?'}): ${(resposta && resposta.erro) || 'erro desconhecido'}.`;
      }
      return;
    }
    if (el.erro) el.erro.hidden = true;
    estado.resposta = resposta;
    estado.ctx = contextoMetas(resposta);
    aplicarHistoricoNoCtx();
    if (el.avisos) {
      const av = resposta.avisos || {};
      el.avisos.hidden = !Object.keys(av).length;
      el.avisos.innerHTML = Object.keys(av).length ? `Algumas informações não carregaram: ${Object.entries(av).map(([k, v]) => `<b>${escHtml(k)}</b>: ${escHtml(v)}`).join(' · ')}` : '';
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
    balao.innerHTML = `<p>${escHtml(botao.dataset.dica)}</p><button type="button" class="mt-dica-fechar" aria-label="Fechar explicação">×</button>`;
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
    const res = resumoMetas(calcs.map((x) => x.c));
    const arquivadas = (r.arquivadas || []).map((m) => ({ meta: m, c: calcDe(m) }));
    const base = estado.filtroStatus === 'arquivadas' ? arquivadas : calcs;
    const tiposPresentes = [...new Map(base.map(({ meta }) => [chaveTipo(meta), meta])).entries()];
    if (estado.filtroTipo !== 'todos' && !tiposPresentes.some(([k]) => k === estado.filtroTipo)) estado.filtroTipo = 'todos';
    const visiveis = base.filter(({ meta, c }) => passaFiltroStatus(estado.filtroStatus, c) && (estado.filtroTipo === 'todos' || chaveTipo(meta) === estado.filtroTipo));
    const sobre = ativosSobrecomprometidos(ativas, estado.ctx.ativos);
    const aporteReal = calcs.reduce((s, x) => s + (x.c.aporteAtual || 0), 0);

    let html = '';
    if (ativas.length) {
      const faltaAporte = res.aporteNecessario - aporteReal;
      html += `<section class="mt-resumo" aria-label="Resumo das metas">
  <div class="mt-tile mt-tile-cor ${res.atrasadas ? 'ruim' : 'bom'}"><span class="mt-rot">${iconeNum('alvo')}Metas ativas</span><span class="mt-grande">${res.quantidade}</span><span class="mt-sub"><b class="mt-bom">${res.noRitmo}</b> no ritmo · <b class="${res.atrasadas ? 'mt-ruim' : ''}">${res.atrasadas}</b> ${res.atrasadas === 1 ? 'precisa' : 'precisam'} de atenção</span></div>
  <div class="mt-tile"><span class="mt-rot">${iconeNum('carteira')}Já guardado pras metas</span><span class="mt-grande">${valorGrandeHtml(res.atual)}</span><span class="mt-sub">de <b>${r0(res.alvo)}</b> somando os alvos</span></div>
  <div class="mt-tile"><span class="mt-rot">${iconeNum('moeda')}Aporte mensal necessário${infoHtml(EXPLICACOES.aporteNecessario)}</span><span class="mt-grande">${valorGrandeHtml(res.aporteNecessario)}</span><span class="mt-sub">você aporta <b>${r0(aporteReal)}</b>/mês (real/informado)${faltaAporte > 1 ? ` · <b class="mt-ruim">faltam ${r0(faltaAporte)}</b>` : (res.aporteNecessario > 0 ? ' · <b class="mt-bom">cobre tudo</b>' : '')}</span></div>
</section>`;
    }
    if (sobre.length) {
      const grupos = new Map();
      sobre.forEach((s) => { const k = s.metas.join(' e '); grupos.set(k, [...(grupos.get(k) || []), s]); });
      const partes = [...grupos.entries()].map(([metas, lista]) => {
        const nomes = lista.slice(0, 3).map((s) => `<b>${escHtml(s.nome)}</b>`).join(', ') + (lista.length > 3 ? ` e mais ${lista.length - 3}` : '');
        return `${nomes} ${lista.length === 1 ? 'conta' : 'contam'} em <b>${escHtml(metas)}</b> (${r0(lista.reduce((t, s) => t + s.comprometido - s.valorBRL, 0))} a mais do que existe)`;
      });
      html += `<p class="mt-alerta">O mesmo dinheiro está em mais de uma meta: ${partes.join(' · ')}. Use uma fração ou um valor fixo nos vínculos.</p>`;
    }
    if (ativas.length || arquivadas.length) {
      const legenda = ['no-ritmo', 'atrasada', 'saldo-ideal', 'ideal-bruto', 'abaixo', 'vencida', 'sem-prazo'].map((k) => `${STATUS_META[k].rotulo}: ${STATUS_META[k].explicacao}`).join('\n\n');
      html += `<div class="mt-filtros">
  <div class="mt-filtros-status"><div class="filter-tabs" role="tablist" aria-label="Status">${FILTROS_STATUS.filter(([k]) => k !== 'arquivadas' || arquivadas.length).map(([k, rot]) => `<button type="button" class="filter-tab ${estado.filtroStatus === k ? 'active' : ''}" data-filtro-status="${k}" role="tab" aria-selected="${estado.filtroStatus === k}">${rot}</button>`).join('')}</div>${infoHtml(legenda, { rotulo: 'O que significa cada status?' })}</div>
  ${tiposPresentes.length > 1 ? `<div class="mt-filtro-tipos" aria-label="Tipo"><button type="button" class="mt-chip ${estado.filtroTipo === 'todos' ? 'active' : ''}" data-filtro-tipo="todos">Todos os tipos</button>${tiposPresentes.map(([k, m]) => `<button type="button" class="mt-chip ${estado.filtroTipo === k ? 'active' : ''}" data-filtro-tipo="${escHtml(k)}">${iconeMetaSvg(aparenciaMeta(m).icone, { tamanho: 13 })}${escHtml(aparenciaMeta(m).rotulo)}</button>`).join('')}</div>` : ''}
</div>`;
    }
    if (estado.filtroStatus === 'arquivadas' && arquivadas.length) {
      html += '<p class="mt-nota mt-nota-arq">Metas arquivadas não contam nos totais. Abra uma para <b>restaurar</b> ou <b>excluir definitivamente</b> (apaga a linha da aba aux_metas - não tem volta).</p>';
    }
    if (visiveis.length) {
      html += `<div class="mt-grade">${visiveis.map(({ meta, c }) => cardMetaHtml(meta, c)).join('')}</div>`;
    } else if (ativas.length || arquivadas.length) {
      html += '<p class="mt-vazio-filtro">Nenhuma meta nesse filtro.</p>';
    }
    const sugestoes = sugestoesMetas({ referencias: estado.ctx.referencias, hoje: estado.ctx.hoje, existentes: ativas });
    if (!ativas.length) {
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
  }

  function sugestaoHtml(s, i) {
    const c = calcDe(s.meta);
    const ap = aparenciaMeta(s.meta);
    const valor = c.renda ? `${r0(c.renda.alvo)}/mês` : (c.alvoBRL != null ? (c.moeda !== 'BRL' ? formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 }) : r0(c.alvoBRL)) : '');
    return `<button type="button" class="mt-sugestao" data-sugestao="${i}" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  ${seloMetaHtml(s.meta, { tamanho: 34 })}
  <span class="mt-sug-txt"><strong>${escHtml(s.meta.nome)}</strong><span>${escHtml(s.porque)}</span></span>
  <span class="mt-sug-valor mono">${valor}</span>
  <span class="mt-sug-mais" aria-hidden="true">+</span>
</button>`;
  }

  // ---------------- detalhe ----------------
  function horizonteProjecao(c) {
    const fim = Math.max(c.mesesRestantes || 0, Number.isFinite(c.mesesEstimados) ? Math.ceil(c.mesesEstimados) : 0);
    return Math.min(720, Math.max(12, fim || 12));
  }

  function desenharDetalhe(meta) {
    const c = calcDe(meta);
    const arquivada = meta.status === 'arquivada';
    const hoje = estado.ctx.hoje;
    const hist = estado.historico ? estado.historico[meta.id] : null;
    const marcosRitmo = c.alvoBRL > 0 ? marcosProjecao(c, { hoje, anoNascimento: num(meta.especificos && meta.especificos.anoNascimento) }) : [];
    let html = `<div class="mt-detalhe">
<button type="button" class="mt-voltar" data-voltar><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Todas as metas</button>
${heroiHtml(meta, c, { arquivada, marcos: marcosRitmo })}
<div class="mt-colunas">
  <div class="mt-col-principal">`;

    // histórico
    html += `<section class="mt-bloco" id="mtHistBloco"><div class="mt-bloco-cab"><h3>Histórico${infoHtml(EXPLICACOES.historico)}</h3>
      <div class="mt-bloco-ctrl"><div class="filter-tabs mt-modo" role="group" aria-label="Visão"><button type="button" class="filter-tab ${estado.modoHist === 'acumulado' ? 'active' : ''}" data-modo-hist="acumulado">Acumulado</button><button type="button" class="filter-tab ${estado.modoHist === 'mensal' ? 'active' : ''}" data-modo-hist="mensal">Mês a mês</button></div>
      ${tabsPeriodoHtml(PERIODOS_HIST, estado.periodos.hist, 'Período do histórico')}</div></div>
      <div class="mt-grafico-caixa" id="mtHistGrafico"></div>
      <div class="mt-legenda" id="mtHistLegenda"></div>
      <div class="mt-analise" id="mtHistAnalise"></div></section>`;

    if (meta.tipo === 'rendaPassiva') {
      html += `<section class="mt-bloco" id="mtRendaBloco"><div class="mt-bloco-cab"><h3>Renda mês a mês${infoHtml(EXPLICACOES.rendaMensal)}</h3>${tabsPeriodoHtml(PERIODOS_HIST, estado.periodos.renda, 'Período da renda')}</div>
      <div class="mt-grafico-caixa" id="mtRendaGrafico"></div>
      <div class="mt-legenda"><i class="renda"></i>proventos do mês<i class="media"></i>média de 12 meses${c.renda && c.renda.alvo ? '<i class="alvo"></i>meta' : ''}</div>
      <div class="mt-analise" id="mtRendaAnalise"></div></section>`;
    }

    if (c.alvoBRL != null && !(c.status === 'concluida' || c.status === 'saldo-ideal')) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Evolução projetada${infoHtml(EXPLICACOES.projecao)}</h3>${tabsPeriodoHtml(PERIODOS_PROJ, estado.periodos.proj, 'Horizonte da projeção')}</div>
      <div class="mt-legenda"><i class="ritmo"></i>no seu ritmo${c.aporteNecessario != null ? '<i class="necessaria"></i>necessária' : ''}<i class="alvo"></i>alvo${marcosRitmo.some((m) => !m.ja && m.mes) ? '<i class="marco"></i>marcos' : ''}</div>
      <div class="mt-grafico-caixa" id="mtGrafico"></div>
      <p class="mt-nota">${c.taxa ? `Rendimento de ${pct(meta.rendimentoAnual || 0, 1)} ao ano (${pct(c.taxa, 2)} ao mês), aportes no fim de cada mês.` : 'Sem rendimento informado - só a soma dos aportes.'}${meta.tipo === 'reservaEmergencia' ? ' Parte do valor líquido de hoje.' : ''}</p>
      <div class="mt-analise" id="mtProjAnalise"></div></section>`;
    }

    html += velocidadeHtml(meta, c);
    if (meta.tipo === 'aposentadoria' || (meta.tipo === 'rendaPassiva' && c.alvoBRL > 0)) html += marcosHtml(meta, c, marcosRitmo);
    if (c.viagem) html += viagemDetalheHtml(meta, c);

    if (c.partes.length && meta.tipo !== 'acumulo') {
      const ehApos = meta.tipo === 'aposentadoria';
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>De onde vem o alvo</h3>${ehApos && !arquivada ? '<button type="button" class="mt-link" data-editar>Editar a conta</button>' : ''}</div><ul class="mt-partes ${ehApos ? 'passos' : ''}">${c.partes.map((pt) => `<li class="${/^=/.test(pt.rotulo) ? 'sub' : ''}"><span>${escHtml(pt.rotulo)}${pt.chave === 'extra' ? infoHtml(EXPLICACOES.extra) : pt.chave === 'reinvestimento' ? infoHtml(EXPLICACOES.reinvestimento) : pt.chave === 'taxa' ? infoHtml(EXPLICACOES.taxaRetirada) : ''}</span><b class="mono">${pt.tipo === '%' ? pct(pt.valor, 1) : pt.tipo === 'n' ? pt.valor : (pt.moeda && pt.moeda !== 'BRL' ? `${formatMoeda(pt.valorMoeda, pt.moeda, { casas: 0 })} ≈ ${formatMoeda(pt.valor)}` : formatMoeda(pt.valor))}</b></li>`).join('')}<li class="total"><span>${meta.tipo === 'rendaPassiva' ? 'Patrimônio necessário' : meta.tipo === 'reservaEmergencia' ? 'Saldo ideal' : ehApos ? `Montante = renda x 12 / ${pct(c.aposentadoria ? c.aposentadoria.taxa : 0, 1)}` : 'Alvo'}</span><b class="mono">${formatMoeda(c.alvoBRL)}</b></li></ul>
      ${meta.tipo === 'reservaEmergencia' ? '<p class="mt-nota">O custo de vida vem das Despesas essenciais (Organização Financeira) - adicionar ou remover uma despesa lá muda o saldo ideal aqui. O status olha o valor LÍQUIDO: o que cairia na conta se resgatasse tudo hoje.</p>' : ''}
      ${ehApos && c.aposentadoria && c.aposentadoria.modo === 'calculado' ? '<p class="mt-nota">É a mesma conta da planilha (Distribuição e Metas, K17 a N19). As despesas vêm da renda emergencial (Despesas essenciais); extra, % de reinvestimento e rendimento você muda em Editar.</p>' : ''}</section>`;
    }
    if (c.conta) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>${escHtml(c.conta.descricao || 'Conta mensal')}</h3><span class="mt-fraco">${c.conta.pagas} de ${c.conta.total} parcelas</span></div>
      <div class="mt-heroi-barra"><span class="mt-barra"><span style="width:${((c.conta.pagas / c.conta.total) * 100).toFixed(1)}%"></span></span></div>
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
    if (dicas.length) html += `<section class="mt-bloco mt-dicas"><h3>Dicas</h3><ul>${dicas.map((d) => `<li>${escHtml(d)}</li>`).join('')}</ul></section>`;
    html += '</div></div></div>';
    el.tela.innerHTML = html;

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
  <p class="mt-nota">Para chegar em ${rotuloDuracao(vel.cenarios[1].meses)} (75% do tempo), aporte ${r0(vel.cenarios[1].aporte)}/mês; em ${rotuloDuracao(vel.cenarios[2].meses)} (metade), ${r0(vel.cenarios[2].aporte)}/mês - com o mesmo rendimento de ${pct(meta.rendimentoAnual || 0, 1)} a.a.${base.aporte > 0 && vel.origem === 'ritmo' ? '' : ''}</p>
  ${dicas.length ? `<h4 class="mt-grupo">Como acelerar</h4><ul class="mt-dicas-acel">${dicas.slice(0, 5).map((d) => `<li><span class="mt-dica-ico ${d.mesesAMenos > 0 ? 'bom' : ''}">${iconeNum(d.mesesAMenos > 0 ? 'foguete' : 'moeda', 14)}</span><span>${escHtml(d.texto)}</span></li>`).join('')}</ul>` : ''}
</section>`;
  }

  function marcosHtml(meta, c, marcosRitmo) {
    const marcosNec = c.aporteNecessario > 0 ? marcosProjecao(c, { hoje: estado.ctx.hoje, aporte: c.aporteNecessario, anoNascimento: num(meta.especificos && meta.especificos.anoNascimento) }) : [];
    const cen = cenariosRendaMenor(c, { hoje: estado.ctx.hoje });
    const celula = (m) => (m.ja ? '<span class="mt-bom">já tem ✓</span>' : m.mes ? `<b>${rotuloMes(m.mes)}</b>${m.idade ? ` <span class="mt-fraco">(${m.idade} anos)</span>` : ''}` : '<span class="mt-fraco">não chega</span>');
    const linhas = marcosRitmo.map((m, i) => `<tr class="${m.rotulo === 'Alvo' ? 'alvo' : ''}"><th scope="row">${iconeNum('marco', 13)} ${escHtml(m.rotulo)}<span class="mt-fraco"> ${r0(m.valor)}</span></th><td>${celula(m)}</td>${marcosNec.length ? `<td>${celula(marcosNec[i])}</td>` : ''}</tr>`).join('');
    const rendaBase = c.aposentadoria ? c.aposentadoria.renda : (c.renda ? c.renda.alvo : null);
    return `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Marcos até o alvo${infoHtml(EXPLICACOES.marcos)}</h3>${!num(meta.especificos && meta.especificos.anoNascimento) && meta.tipo === 'aposentadoria' ? '<span class="mt-fraco">informe o ano de nascimento em Editar pra ver a idade</span>' : ''}</div>
  <div class="mt-tabela-rolagem"><table class="mt-tabela"><thead><tr><th scope="col">Marco</th><th scope="col">No seu ritmo (${r0(c.aporteAtual)}/mês)</th>${marcosNec.length ? `<th scope="col">No necessário (${r0(c.aporteNecessario)}/mês)</th>` : ''}</tr></thead><tbody>${linhas}</tbody></table></div>
  ${cen.length ? `<h4 class="mt-grupo">E se a renda fosse menor?</h4><div class="mt-cenarios">${cen.map((x) => `<div class="mt-cen"><span class="mt-cen-tit">Renda ${Math.round(x.reducao * 100)}% menor${x.renda ? ` (${r0(x.renda)}/mês)` : ''}</span><b>${r0(x.montante)}</b><span>precisaria juntar · <span class="mt-bom">−${r0(x.economia)}</span></span>${x.aporteNecessario != null ? `<span>aporte até o prazo: <b>${r0(x.aporteNecessario)}</b>/mês</span>` : ''}${x.data ? `<span>no seu ritmo: <b>${rotuloMes(x.data)}</b>${x.mesesAMenos > 0 ? ` (${rotuloDuracao(x.mesesAMenos)} antes)` : ''}</span>` : ''}</div>`).join('')}</div>
  <p class="mt-nota">Montante = renda x 12 / ${pct(c.aposentadoria ? c.aposentadoria.taxa : (meta.especificos && meta.especificos.dyAnual) || 0, 1)}${rendaBase ? `, a partir da renda de ${r0(rendaBase)}/mês` : ''}.</p>` : ''}
</section>`;
  }

  function viagemDetalheHtml(meta, c) {
    const v = c.viagem;
    let html = '';
    if (v.temDestinos) {
      const moedas = Object.values(v.porMoeda);
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Destinos</h3><span class="mt-fraco">${v.dias} dias${v.margem ? ` · margem de ${pct(v.margem)}` : ''}</span></div>
  <div class="mt-tabela-rolagem"><table class="mt-tabela"><thead><tr><th scope="col">Destino</th><th scope="col">Dias</th><th scope="col">Por dia</th><th scope="col">Total</th></tr></thead><tbody>${v.destinos.map((d) => `<tr><th scope="row">${escHtml(d.cidade || d.pais)}<span class="mt-fraco">${d.cidade && d.pais ? ` · ${escHtml(d.pais)}` : ''}</span></th><td>${d.dias}</td><td>${formatMoeda(d.diaria, d.moeda, { casas: 0 })}</td><td><b>${formatMoeda(d.totalMoeda, d.moeda, { casas: 0 })}</b>${d.totalBRL != null && d.moeda !== 'BRL' ? `<span class="mt-fraco"> ≈ ${r0(d.totalBRL)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
  <h4 class="mt-grupo">Por moeda${infoHtml(EXPLICACOES.cambio)}</h4>
  <ul class="mt-moedas">${moedas.map((x) => {
    const p = x.comMargem > 0 ? Math.min(1, x.guardado / x.comMargem) : 0;
    return `<li><div class="mt-moeda-cab"><b>${x.moeda}</b><span>${formatMoeda(x.comMargem, x.moeda, { casas: 0 })} com margem${x.cotacao && x.moeda !== 'BRL' ? ` · 1 ${x.moeda} = ${formatMoeda(x.cotacao, 'BRL', { casas: 2 })}` : ''}</span></div>
      <span class="mt-barra"><span style="width:${(p * 100).toFixed(1)}%"></span></span>
      <div class="mt-moeda-num"><span>já trocado: <b>${formatMoeda(x.guardado, x.moeda, { casas: 0 })}</b></span><span class="${x.falta > 0 ? 'mt-ruim' : 'mt-bom'}">${x.falta > 0 ? `faltam <b>${formatMoeda(x.falta, x.moeda, { casas: 0 })}</b>${x.faltaBRL != null && x.moeda !== 'BRL' ? ` ≈ ${r0(x.faltaBRL)} hoje` : ''}` : 'completo ✓'}</span></div></li>`;
  }).join('')}</ul></section>`;
    }
    if (v.temFixos) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Itens fixos e compras antecipadas</h3><span class="mt-fraco">${r0(v.fixosPagoBRL)} pagos de ${r0(v.fixosTotalBRL)}${v.parcelaMensal ? ` · ${r0(v.parcelaMensal)}/mês correndo` : ''}</span></div>
  <ul class="mt-fixos">${v.fixos.map((f) => `<li class="${f.pagas >= f.parcelas ? 'pago' : ''}"><span class="mt-v-nome">${escHtml(f.nome)}<em>${f.parcelas > 1 ? `${f.pagas} de ${f.parcelas} parcelas de ${f.parcelaBRL != null ? r0(f.parcelaBRL) : '—'}` : (f.pagas ? 'pago' : 'à vista')}${f.parte < 1 ? ` · sua parte ${pct(f.parte)}` : ''}${f.moeda !== 'BRL' ? ` · ${formatMoeda(f.totalMoeda, f.moeda, { casas: 0 })}` : ''}${f.fim && f.parcelas > 1 ? ` · até ${rotuloMes(f.fim)}` : ''}</em></span><b class="mono">${f.totalBRL != null ? formatMoeda(f.totalBRL) : '—'}</b></li>`).join('')}</ul></section>`;
    }
    return html;
  }

  function vinculosDetalheHtml(meta, c, { arquivada = false } = {}) {
    const reserva = meta.tipo === 'reservaEmergencia';
    if (!c.vinculos.length && !c.valorInicial) return `<p class="mt-nota">Nenhum investimento ou saldo vinculado: o progresso conta só o que você informou como já guardado.</p>${arquivada ? '' : '<button type="button" class="mt-link" data-editar-vinculos>+ Vincular investimentos ou um saldo em conta</button>'}`;
    const detalheAtivo = (a, parte) => {
      const ir = a.irResgate;
      const imposto = ir ? ((ir.ir || 0) + (ir.iof || 0)) * parte : 0;
      const sub = [ROTULO_CLASSE[a.classe], a.classe === 'rf' && a.marca ? ROTULO_MARCA[a.marca] : null, a.instituicao, a.indexador, a.vencimento ? `vence ${a.vencimento}` : null].filter(Boolean).map(escHtml).join(' · ');
      return `<li class="mt-v-ativo"><span class="mt-v-nome"><a href="${escHtml(urlAtivo(a.ref))}">${escHtml(a.nome)}</a><em>${sub}</em>${ir && imposto > 0.004 ? `<em class="mt-v-ir">IR${ir.iof ? '+IOF' : ''} se resgatasse hoje: <span class="mt-ruim">−${formatMoeda(imposto)}</span> · líquido ${formatMoeda(a.valorBRL * parte - imposto)}</em>` : (ir && ir.isento ? '<em class="mt-v-ir">isento de IR</em>' : '')}</span><b class="mono">${formatMoeda(a.valorBRL * parte)}</b></li>`;
    };
    const linhas = c.vinculos.map((v) => {
      if (v.tipo === 'saldo') {
        const editando = estado.editandoSaldo === v.id;
        const hist = (v.historico || []).slice(-4).reverse();
        return `<li class="mt-v-saldo"><span class="mt-v-nome"><strong>${iconeNum('carteira', 13)} Saldo em conta · ${escHtml(v.instituicao)}</strong><em>${formatMoeda(Number(v.saldo) || 0, v.moeda || 'BRL')}${v.moeda !== 'BRL' && v.cotacao ? ` x ${formatMoeda(v.cotacao, 'BRL', { casas: 2 })}` : ''} · atualizado ${v.atualizadoEm ? v.atualizadoEm.split('-').reverse().join('/') : '—'}${infoHtml(EXPLICACOES.saldoConta)}</em>
          ${hist.length > 1 ? `<em class="mt-v-hist">antes: ${hist.slice(1).map((h) => `${formatMoeda(h.saldo, v.moeda || 'BRL', { casas: 0 })} em ${h.data.split('-').reverse().slice(0, 2).join('/')}`).join(' · ')}</em>` : ''}
          ${arquivada ? '' : (editando ? `<span class="mt-saldo-form"><label class="sr" for="mtSaldoNovo">Novo saldo</label><span class="mt-entrada"><span class="mt-prefixo">${escHtml(v.moeda || 'BRL')}</span><input id="mtSaldoNovo" inputmode="decimal" value="${numParaCampo(Number(v.saldo) || 0)}"></span><button type="button" class="btn btn-primary mt-btn-sm" data-saldo-salvar="${escHtml(v.id)}">Salvar</button><button type="button" class="btn btn-ghost mt-btn-sm" data-saldo-cancelar>Cancelar</button></span>` : `<button type="button" class="mt-link" data-saldo-editar="${escHtml(v.id)}">Atualizar saldo</button>`)}</span>
          <b class="mono">${formatMoeda(v.valorBRL)}</b></li>`;
      }
      const parte = v.base > 0 ? v.valorBRL / v.base : 0;
      const modo = v.modo === 'fracao' ? `${pct(v.fracao, 0)} de ${r0(v.base)}` : v.modo === 'valor' ? `valor fixo (de ${r0(v.base)})` : 'total';
      if (v.tipo === 'ativo') {
        const a = v.ativos[0];
        if (!a) return `<li><span class="mt-v-nome">${escHtml(v.nome || v.id)}<em class="mt-ruim">não encontrado na carteira hoje</em></span><b class="mono">${formatMoeda(0)}</b></li>`;
        return detalheAtivo(a, parte).replace('<em>', `<em>${v.modo !== 'total' ? `${escHtml(modo)} · ` : ''}`);
      }
      const nome = v.tipo === 'classe' ? `Toda a classe ${ROTULO_CLASSE[v.classe]}` : ROTULO_MARCA[v.marca];
      return `<li class="mt-v-grupo"><details><summary><span class="mt-v-nome"><strong>${escHtml(nome)}</strong><em>${v.ativos.length} ${v.classe === 'rf' || v.tipo === 'marca' ? 'títulos' : 'ativos'} · ${escHtml(modo)}${v.impostoBRL > 0.004 ? ` · <span class="mt-ruim">IR −${r0(v.impostoBRL)}</span>` : ''}</em></span><b class="mono">${formatMoeda(v.valorBRL)}</b></summary><ul>${v.ativos.slice().sort((x, y) => y.valorBRL - x.valorBRL).map((a) => detalheAtivo(a, parte)).join('')}</ul></details></li>`;
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
    const itens = av.itens.map((x) => `<li class="mt-av ${x.veredito}"><span class="mt-av-selo">${x.veredito === 'bom' ? '✓' : x.veredito === 'ruim' ? '✕' : '!'}</span><span><b>${escHtml(x.nome || (x.vinculo.tipo === 'classe' ? `Classe ${ROTULO_CLASSE[x.vinculo.classe]}` : ROTULO_MARCA[x.vinculo.marca] || ''))}</b> <em class="mt-av-rot">${ROT[x.veredito]}</em><br>${escHtml(x.motivo)}</span></li>`).join('');
    return `<section class="mt-bloco mt-bloco-sug"><div class="mt-bloco-cab"><h3>Seus investimentos combinam?${infoHtml(EXPLICACOES.avaliacao)}</h3></div>
  <p class="mt-av-resumo ${!av.itens.length ? 'neutro' : av.resumo.ruim ? 'ruim' : av.resumo.atencao ? 'atencao' : 'bom'}">${escHtml(av.resumo.texto)}</p>
  ${itens ? `<ul class="mt-avs">${itens}</ul>` : ''}
  ${sug ? `<details class="mt-sug-inv" ${av.itens.length ? '' : 'open'}><summary>O que as fontes sugerem: ${escHtml(sug.titulo)}</summary>
    <ul>${sug.itens.map((i) => `<li><b>${escHtml(i.nome)}</b> - ${escHtml(i.porque)}</li>`).join('')}</ul>
    <p class="mt-nota">${escHtml(sug.evitar)}</p>
    <p class="mt-fontes">Fontes: ${sug.fontes.map((f) => `<a href="${escHtml(f.url)}" target="_blank" rel="noopener noreferrer">${escHtml(f.nome)}</a>`).join(' · ')}</p>
    <p class="mt-nota">Resumo educativo dessas fontes, não é recomendação individual.</p></details>` : ''}
</section>`;
  }

  // ---------------- gráficos ----------------
  function larguraDe(caixa) { return (caixa && caixa.clientWidth) || 640; }

  function desenharHistorico(meta, c) {
    const caixa = doc.getElementById('mtHistGrafico');
    if (!caixa) return;
    const leg = doc.getElementById('mtHistLegenda');
    const anal = doc.getElementById('mtHistAnalise');
    const semVinculos = !(meta.vinculos || []).length;
    if (semVinculos) { caixa.innerHTML = '<p class="hint">Vincule investimentos ou um saldo em conta pra ver como a meta evoluiu mês a mês.</p>'; return; }
    if (!estado.historico) { caixa.innerHTML = '<p class="hint mt-carregando-hist">Carregando o histórico…</p>'; return; }
    const h = estado.historico[meta.id];
    if (!h || !h.meses || h.meses.length < 2) {
      caixa.innerHTML = `<p class="hint">${estado.historicoErro ? `Histórico indisponível agora (${escHtml(estado.historicoErro)}).` : 'Ainda não há histórico suficiente (precisa de pelo menos 2 meses com valor).'}</p>`;
      return;
    }
    const meses = recortarMeses(h.meses, estado.periodos.hist);
    const largura = larguraDe(caixa);
    caixa.innerHTML = graficoHistoricoSvg(meses, { largura, altura: largura < 480 ? 230 : 260, alvo: c.alvoBRL, modo: estado.modoHist });
    if (leg) leg.innerHTML = estado.modoHist === 'mensal' ? '<i class="aporte"></i>aporte do mês<i class="rend"></i>rendimento/valorização do mês' : '<i class="hist"></i>valor da meta no fim do mês<i class="aporte"></i>aporte do mês (compras - vendas)';
    ligarTooltipGrafico(caixa, (i) => {
      const p = meses[i];
      const ant = i > 0 ? meses[i - 1] : null;
      const rend = ant ? p.valor - ant.valor - (p.fluxo || 0) : null;
      return `<div class="mt-tt-data">${rotuloMes(p.mes)}${p.mes === mesDe(estado.ctx.hoje) ? ' (até hoje)' : ''}</div>
        <div class="mt-tt-item"><i class="hist"></i>Valor<b>${formatMoeda(p.valor)}</b></div>
        <div class="mt-tt-item"><i class="aporte"></i>Aporte<b class="${(p.fluxo || 0) < 0 ? 'mt-ruim' : ''}">${(p.fluxo || 0) < 0 ? '−' : ''}${formatMoeda(Math.abs(p.fluxo || 0))}</b></div>
        ${rend != null ? `<div class="mt-tt-item"><i class="rend"></i>Rendimento<b class="${rend < 0 ? 'mt-ruim' : 'mt-bom'}">${rend < 0 ? '−' : '+'}${formatMoeda(Math.abs(rend))}</b></div>` : ''}
        ${c.alvoBRL ? `<div class="mt-tt-item">% do alvo<b>${pct(p.valor / c.alvoBRL)}</b></div>` : ''}`;
    });
    if (anal) renderAnalise(doc, anal, analisarHistoricoMeta({ meses, calc: c, indices: estado.indices }), { titulo: 'Análise do histórico' });
  }

  function desenharRenda(meta, c) {
    const caixa = doc.getElementById('mtRendaGrafico');
    if (!caixa) return;
    const anal = doc.getElementById('mtRendaAnalise');
    if (!estado.historico) { caixa.innerHTML = '<p class="hint">Carregando os proventos mês a mês…</p>'; return; }
    const h = estado.historico[meta.id];
    const mesAtual = mesDe(estado.ctx.hoje);
    const completa = comMedia12((h && h.renda) || [], mesAtual);
    if (completa.length < 2) { caixa.innerHTML = '<p class="hint">Ainda não há proventos suficientes pra montar a evolução mensal.</p>'; return; }
    const renda = estado.periodos.renda === 'tudo' ? completa : recortarMeses(completa, estado.periodos.renda).slice(1);
    const largura = larguraDe(caixa);
    caixa.innerHTML = graficoRendaSvg(renda, { largura, altura: largura < 480 ? 200 : 220, alvo: c.renda ? c.renda.alvo : null, mesAtual });
    ligarTooltipGrafico(caixa, (i) => {
      const p = renda[i];
      return `<div class="mt-tt-data">${rotuloMes(p.mes)}${p.mes === mesAtual ? ' (parcial)' : ''}</div>
        <div class="mt-tt-item"><i class="renda"></i>Proventos<b>${formatMoeda(p.valor)}</b></div>
        ${p.media12 != null ? `<div class="mt-tt-item"><i class="media"></i>Média 12 meses<b>${formatMoeda(p.media12)}</b></div>` : ''}
        ${c.renda && c.renda.alvo ? `<div class="mt-tt-item">% da meta<b>${pct(p.valor / c.renda.alvo)}</b></div>` : ''}`;
    });
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
    const largura = larguraDe(caixa);
    caixa.innerHTML = graficoProjecaoSvg(c, { largura, altura: largura < 480 ? 210 : 250, hoje: estado.ctx.hoje, pontos, marcos });
    ligarTooltipGrafico(caixa, (i) => {
      const p = pontos[i];
      const m = marcos.find((x) => x.mes === p.mes && !x.ja);
      return `<div class="mt-tt-data">${rotuloMes(p.mes)}${i ? ` · daqui a ${rotuloDuracao(mesesEntre(mesDe(estado.ctx.hoje), p.mes))}` : ' (hoje)'}</div>
        <div class="mt-tt-item"><i class="ritmo"></i>No seu ritmo<b>${formatMoeda(p.ritmo)}</b></div>
        ${p.necessaria != null ? `<div class="mt-tt-item"><i class="necessaria"></i>Necessária<b>${formatMoeda(p.necessaria)}</b></div>` : ''}
        ${c.alvoBRL ? `<div class="mt-tt-item">% do alvo (ritmo)<b>${pct(p.ritmo / c.alvoBRL)}</b></div>` : ''}
        ${m ? `<div class="mt-tt-marco">★ ${escHtml(m.rotulo)}${m.idade ? ` · ${m.idade} anos` : ''}</div>` : ''}`;
    });
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
        if (r.aporte === 0) return `Com <b>${formatMoeda(s.atual || 0)}</b> já guardados e rendimento de ${pct(s.rendimento, 1)} a.a., você alcança ${alvoTxt} até ${rotuloMes(s.data)} <b>sem aportar mais nada</b>.`;
        return `Para alcançar <b>${alvoTxt}</b> até <b>${rotuloMes(s.data)}</b> com rendimento de ${pct(s.rendimento, 1)} a.a., aporte <b class="mt-destaque">${formatMoeda(r.aporte)}</b> por mês${meses > 0 ? ` (${rotuloDuracao(meses)}; ${formatMoeda(r.totalAportado, 'BRL', { casas: 0 })} de aportes + ${formatMoeda(r.rendimento, 'BRL', { casas: 0 })} de rendimento)` : ''}.`;
      }
      const r = simular({ alvo: alvoBRL, atual: s.atual || 0, rendimentoAnual: s.rendimento, aporte: s.aporte || 0 });
      if (r.mesesAteAlvo === 0) return `Você já tem o suficiente pra ${alvoTxt}.`;
      if (!Number.isFinite(r.mesesAteAlvo)) return `Aportando ${formatMoeda(s.aporte || 0)} por mês você não chega em ${alvoTxt} - aumente o aporte ou o rendimento.`;
      const quando = somarMeses(mesDe(estado.ctx.hoje), Math.ceil(r.mesesAteAlvo));
      return `Aportando <b>${formatMoeda(s.aporte || 0)}</b> por mês a ${pct(s.rendimento, 1)} a.a., você chega em <b>${alvoTxt}</b> em <b class="mt-destaque">${rotuloMes(quando)}</b> (${rotuloDuracao(r.mesesAteAlvo)}).`;
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
  <input class="mt-item-nome" data-item-nome="${i}" value="${escHtml(it.nome)}" aria-label="Item" ${somenteLeitura ? 'disabled' : ''}>
  <span class="mt-entrada mt-item-valor"><select data-item-moeda="${i}" aria-label="Moeda" ${somenteLeitura ? 'disabled' : ''}>${MOEDAS.map((m) => `<option ${m === it.moeda ? 'selected' : ''}>${m}</option>`).join('')}</select><input data-item-valor="${i}" inputmode="decimal" value="${numParaCampo(it.valor)}" aria-label="Valor" ${somenteLeitura ? 'disabled' : ''}></span>
  <span class="mt-item-brl mono">${it.moeda !== 'BRL' && cotacao(it.moeda, cambio) ? formatMoeda((Number(it.valor) || 0) * cotacao(it.moeda, cambio), 'BRL', { casas: 0 }) : ''}</span>
  ${somenteLeitura ? '' : `<button type="button" class="mt-x" data-item-remover="${i}" aria-label="Remover ${escHtml(it.nome)}">×</button>`}
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
      const msg = `Não salvou: ${(r && r.erro) || 'erro desconhecido'}`;
      if (!silencioso && win && win.alert) win.alert(msg); else console.error(msg);
      return null;
    }
    const salva = r.meta || { ...meta, id: r.id };
    const lista = (estado.resposta.metas || []).filter((m) => m.id !== salva.id);
    const idx = (estado.resposta.metas || []).findIndex((m) => m.id === salva.id);
    if (idx >= 0) lista.splice(idx, 0, salva); else lista.push(salva);
    estado.resposta = { ...estado.resposta, metas: lista };
    gravarCacheDados('metas', estado.resposta);
    if (manterDetalhe && silencioso) {
      // edição de sub-item: só atualiza os números (não redesenha os campos que estão sendo digitados)
      return salva;
    }
    if (manterDetalhe || !silencioso) irPara(salva.id); else desenhar();
    // vínculos mudaram: o histórico daquela meta precisa ser refeito
    if (!silencioso) { estado.historico = estado.historico ? { ...estado.historico } : null; carregarHistorico(); }
    return salva;
  }

  async function arquivar(meta, restaurar = false) {
    if (!restaurar && win && win.confirm && !win.confirm(`Arquivar "${meta.nome}"? Ela sai da lista (fica em "Arquivadas" e dá pra restaurar - ou excluir de vez de lá).`)) return;
    const r = await excluirMetaImpl(token, meta.id, { restaurar });
    if (!r || !r.ok) { if (win && win.alert) win.alert(`Não deu: ${(r && r.erro) || 'erro desconhecido'}`); return; }
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
    if (win && win.confirm && !win.confirm(`Excluir "${meta.nome}" DEFINITIVAMENTE? A linha sai da aba aux_metas e não dá pra desfazer.`)) return;
    const r = await excluirDefinitivoImpl(token, meta.id);
    if (!r || !r.ok) { if (win && win.alert) win.alert(`Não excluiu: ${(r && r.erro) || 'erro desconhecido'}`); return; }
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
    estado.assistente = { meta: clonar(meta), passo, editando, buscaAtivo: '' };
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
    <h2 id="mtDialogoTitulo">${a.editando ? `Editar "${escHtml(m.nome)}"` : 'Nova meta'}</h2>
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
    const c = calcDe(m);
    if (c.renda) return `renda hoje <b>${r0(c.renda.atual)}</b>/mês · patrimônio necessário <b>${c.alvoBRL != null ? r0(c.alvoBRL) : '—'}</b>`;
    if (c.alvoBRL == null && !(c.viagem && c.viagem.temFixos)) return 'informe o alvo';
    const extra = c.viagem && c.viagem.fixosTotalBRL ? ` + fixos <b>${r0(c.viagem.fixosTotalBRL)}</b>` : '';
    return `alvo <b>${c.alvoBRL != null ? r0(c.alvoBRL) : '—'}</b>${c.moeda !== 'BRL' && c.alvoMoeda ? ` (${formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 })})` : ''}${extra}${c.aporteNecessarioTotal ? ` · aporte <b>${r0(c.aporteNecessarioTotal)}</b>/mês` : ''}`;
  }
  function atualizarPrevia() {
    const a = estado.assistente;
    if (!a) return;
    const p = el.dialogo.querySelector('#mtPrevia');
    if (p) p.innerHTML = previaHtml(a.meta);
    const conta = el.dialogo.querySelector('#mtContaApos');
    if (conta) conta.innerHTML = contaAposentadoriaHtml(a.meta);
    const viag = el.dialogo.querySelector('#mtResumoViagem');
    if (viag) viag.innerHTML = resumoViagemHtml(a.meta);
    el.dialogo.querySelectorAll('[data-dest-total]').forEach((x) => {
      const d = (a.meta.especificos.destinos || [])[Number(x.dataset.destTotal)];
      if (!d) return;
      const diaria = CATEGORIAS_DIARIA.reduce((s, [k]) => s + (Number(d.gastos && d.gastos[k]) || 0), 0) + (Number(d.gastos && d.gastos.outros) || 0);
      x.textContent = `${formatMoeda(diaria, d.moeda || 'EUR', { casas: 0 })}/dia · total ${formatMoeda(diaria * (Number(d.dias) || 0) + (Number(d.extras) || 0), d.moeda || 'EUR', { casas: 0 })}`;
    });
  }

  function passoTipoHtml(m) {
    const tile = (tipo, categoria) => {
      const fake = { tipo, categoria };
      const ap = aparenciaMeta(fake);
      const resumo = tipo === 'acumulo' ? (CATEGORIAS_ACUMULO[categoria].dica || '') : TIPOS_META[tipo].resumo;
      const ativo = m.tipo === tipo && (tipo !== 'acumulo' || m.categoria === categoria);
      return `<button type="button" class="mt-tipo ${ativo ? 'ativo' : ''}" data-tipo="${tipo}" ${categoria ? `data-categoria="${categoria}"` : ''} style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">${seloMetaHtml(fake, { tamanho: 34 })}<span><strong>${escHtml(ap.rotulo)}</strong><em>${escHtml(resumo)}</em></span></button>`;
    };
    return `<p class="mt-dialogo-dica">Que tipo de meta? Cada tipo pede os dados certos e calcula do jeito certo.</p>
<h4 class="mt-grupo">Patrimônio e renda</h4><div class="mt-tipos">${['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].map((t) => tile(t)).join('')}</div>
<h4 class="mt-grupo">Objetivos</h4><div class="mt-tipos">${['viagemInternacional', 'viagemNacional', 'casa', 'carro'].map((t) => tile(t)).join('')}</div>
<h4 class="mt-grupo">Juntar até uma data</h4><div class="mt-tipos compacto">${Object.keys(CATEGORIAS_ACUMULO).map((k) => tile('acumulo', k)).join('')}</div>`;
  }

  function campo({ caminho, rotulo, formato = 'dinheiro', ajuda = '', moeda = null, opcoes = null, largura = '', foco = false, dica = '' }) {
    const m = estado.assistente.meta;
    const v = lerCaminho(m, caminho);
    const rot = `${rotulo}${dica ? infoHtml(dica) : ''}`;
    let entrada;
    if (formato === 'texto') entrada = `<input data-campo="${caminho}" data-formato="texto" value="${escHtml(v || '')}" ${foco ? 'data-foco' : ''}>`;
    else if (formato === 'mes') entrada = `<input type="month" data-campo="${caminho}" data-formato="mes" value="${escHtml(v || '')}">`;
    else if (formato === 'select') entrada = `<select data-campo="${caminho}" data-formato="select">${opcoes.map(([k, r]) => `<option value="${escHtml(k)}" ${String(v) === String(k) ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}</select>`;
    else if (formato === 'bool') return `<label class="mt-campo mt-campo-bool ${largura}"><input type="checkbox" data-campo="${caminho}" data-formato="bool" ${v ? 'checked' : ''}><span>${rot}${ajuda ? `<em>${ajuda}</em>` : ''}</span></label>`;
    else {
      const mostra = formato === 'ano' ? (v == null ? '' : String(v)) : formato === 'pct' ? numParaCampo(v == null ? null : v * 100, 2) : numParaCampo(v, formato === 'int' ? 0 : 2);
      const prefixo = formato === 'dinheiro' ? `<span class="mt-prefixo">${escHtml(moeda || 'R$')}</span>` : '';
      const sufixo = formato === 'pct' ? '<span class="mt-sufixo">%</span>' : '';
      entrada = `<span class="mt-entrada">${prefixo}<input data-campo="${caminho}" data-formato="${formato}" inputmode="decimal" value="${mostra}" ${foco ? 'data-foco' : ''}>${sufixo}</span>`;
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

  /** Resumo da viagem ao vivo (por moeda + fixos) no assistente. */
  function resumoViagemHtml(m) {
    const v = calcularViagem(m, { cambio: estado.ctx.cambio, hoje: estado.ctx.hoje });
    const moedas = Object.values(v.porMoeda);
    if (!moedas.length && !v.fixos.length) return '<p class="mt-nota">Adicione os destinos: o alvo em cada moeda sai sozinho (dias x gasto diário + extras, com a margem).</p>';
    return `<ul class="mt-resumo-viagem">${moedas.map((x) => `<li><b>${formatMoeda(x.comMargem, x.moeda, { casas: 0 })}</b><span>${x.dias} dias · ${escHtml(x.destinos.join(', '))}${x.cotacao && x.moeda !== 'BRL' ? ` · ≈ ${r0(x.comMargemBRL)} hoje` : ''}</span></li>`).join('')}${v.fixos.length ? `<li><b>${r0(v.fixosTotalBRL)}</b><span>itens fixos (sua parte)${v.parcelaMensal ? ` · ${r0(v.parcelaMensal)}/mês correndo` : ''}</span></li>` : ''}</ul>`;
  }

  function destinosEditorHtml(m) {
    const ds = (m.especificos && m.especificos.destinos) || [];
    const linhas = ds.map((d, i) => `<li class="mt-dest">
  <div class="mt-dest-cab"><span class="mt-dest-num">${i + 1}</span>
    <input data-dest="${i}" data-dest-campo="cidade" value="${escHtml(d.cidade || '')}" placeholder="Cidade" aria-label="Cidade do destino ${i + 1}">
    <input data-dest="${i}" data-dest-campo="pais" value="${escHtml(d.pais || '')}" placeholder="País" aria-label="País do destino ${i + 1}">
    <select data-dest="${i}" data-dest-campo="moeda" aria-label="Moeda do destino ${i + 1}">${MOEDAS.map((x) => `<option ${x === (d.moeda || 'EUR') ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <button type="button" class="mt-x" data-dest-remover="${i}" aria-label="Remover destino ${i + 1}">×</button></div>
  <div class="mt-dest-campos">
    <label class="mt-campo"><span>Dias</span><input data-dest="${i}" data-dest-campo="dias" inputmode="numeric" value="${numParaCampo(d.dias, 0)}"></label>
    ${CATEGORIAS_DIARIA.map(([k, r]) => `<label class="mt-campo"><span>${r}/dia</span><input data-dest="${i}" data-dest-campo="gastos.${k}" inputmode="decimal" value="${numParaCampo(d.gastos && d.gastos[k])}"></label>`).join('')}
    <label class="mt-campo"><span>Ingressos/extras</span><input data-dest="${i}" data-dest-campo="extras" inputmode="decimal" value="${numParaCampo(d.extras)}"></label>
  </div>
  <p class="mt-dest-total" data-dest-total="${i}"></p>
</li>`).join('');
    return `<ul class="mt-dests">${linhas}</ul><button type="button" class="mt-link" data-dest-add>+ Adicionar destino (país/cidade)</button>`;
  }

  function fixosEditorHtml(m) {
    const fs = (m.especificos && m.especificos.fixos) || [];
    const linhas = fs.map((f, i) => `<li class="mt-fixo-ed">
  <input data-fixo="${i}" data-fixo-campo="nome" value="${escHtml(f.nome || '')}" placeholder="Passagem, hotel, ingresso…" aria-label="Item fixo ${i + 1}">
  <span class="mt-entrada"><select data-fixo="${i}" data-fixo-campo="moeda" aria-label="Moeda">${MOEDAS.map((x) => `<option ${x === (f.moeda || 'BRL') ? 'selected' : ''}>${x}</option>`).join('')}</select><input data-fixo="${i}" data-fixo-campo="valor" inputmode="decimal" value="${numParaCampo(f.valor)}" aria-label="Valor total"></span>
  <label class="mt-mini"><span>parcelas</span><input data-fixo="${i}" data-fixo-campo="parcelas" inputmode="numeric" value="${numParaCampo(f.parcelas, 0)}"></label>
  <label class="mt-mini"><span>1ª parcela</span><input type="month" data-fixo="${i}" data-fixo-campo="inicio" value="${escHtml(f.inicio || '')}"></label>
  <label class="mt-mini"><span>sua parte %</span><input data-fixo="${i}" data-fixo-campo="parte" inputmode="decimal" value="${numParaCampo(f.parte == null ? 100 : f.parte * 100, 1)}"></label>
  <label class="mt-check-txt"><input type="checkbox" data-fixo="${i}" data-fixo-campo="pago" ${f.pago ? 'checked' : ''}> pago</label>
  <button type="button" class="mt-x" data-fixo-remover="${i}" aria-label="Remover ${escHtml(f.nome || 'item')}">×</button>
</li>`).join('');
    return `<ul class="mt-fixos-ed">${linhas}</ul><button type="button" class="mt-link" data-fixo-add>+ Adicionar item fixo</button>`;
  }

  function passoDadosHtml(m) {
    const ref = estado.ctx.referencias || {};
    const simbolo = (moeda) => (moeda === 'BRL' ? 'R$' : moeda);
    const f = [];
    let extra = '';
    f.push(campo({ caminho: 'nome', rotulo: 'Nome da meta', formato: 'texto', largura: 'largo', foco: true }));
    if (m.tipo === 'acumulo') f.push(campo({ caminho: 'categoria', rotulo: 'Categoria', formato: 'select', opcoes: Object.entries(CATEGORIAS_ACUMULO).map(([k, c]) => [k, c.nome]) }));
    const dataViagem = m.tipo === 'viagemInternacional' || m.tipo === 'viagemNacional';
    const porDestinos = dataViagem && (((m.especificos && m.especificos.destinos) || []).length > 0 || (m.tipo === 'viagemInternacional' && !(m.contaMensal && m.contaMensal.valor > 0)));
    if (dataViagem) f.push(campo({ caminho: 'especificos.destino', rotulo: 'Nome da viagem / roteiro', formato: 'texto', ajuda: 'ex. Mochilão pela Europa - os destinos você lista abaixo' }));
    if (m.tipo === 'rendaPassiva') {
      f.push(campo({ caminho: 'especificos.rendaMensal', rotulo: 'Renda passiva por mês', ajuda: ref.rendaPassiva && ref.rendaPassiva.metaPlanilha ? `na planilha (aba Distribuição e Metas): ${formatMoeda(ref.rendaPassiva.metaPlanilha)}` : '' }));
      f.push(campo({ caminho: 'especificos.dyAnual', rotulo: 'Rendimento em proventos (DY) ao ano', formato: 'pct', ajuda: 'patrimônio necessário = renda x 12 / DY' }));
      f.push(campo({ caminho: 'dataAlvo', rotulo: 'Até quando', formato: 'mes' }));
    } else if (m.tipo === 'reservaEmergencia') {
      const cv = ref.reserva && ref.reserva.custoDeVida;
      f.push(campo({ caminho: 'especificos.meses', rotulo: 'Meses de custo de vida', formato: 'int' }));
      f.push(campo({ caminho: 'especificos.margem', rotulo: 'Sobra de segurança', formato: 'pct' }));
      f.push(campo({ caminho: 'especificos.usarDespesasPlanilha', rotulo: `Usar o custo de vida das Despesas essenciais${cv ? ` (${formatMoeda(cv)}/mês)` : ''}`, formato: 'bool', largura: 'largo' }));
      if (m.especificos && m.especificos.usarDespesasPlanilha === false) f.push(campo({ caminho: 'especificos.despesaMensal', rotulo: 'Despesa mensal' }));
      extra += '<p class="mt-nota largo">O status olha o valor LÍQUIDO: "Saldo ideal" só quando o que cairia na conta num resgate hoje (sem IR/IOF) cobre o alvo.</p>';
    } else if (m.tipo === 'casa') {
      f.push(campo({ caminho: 'especificos.valorImovel', rotulo: 'Valor do imóvel' }));
      f.push(campo({ caminho: 'especificos.entradaPct', rotulo: 'Entrada', formato: 'pct' }));
      f.push(campo({ caminho: 'especificos.custosPct', rotulo: 'ITBI, escritura e registro', formato: 'pct' }));
    } else if (m.tipo === 'carro') {
      f.push(campo({ caminho: 'especificos.valorCarro', rotulo: 'Valor do carro' }));
      f.push(campo({ caminho: 'especificos.entradaPct', rotulo: 'Quanto juntar (100% = à vista)', formato: 'pct' }));
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
      } else if (!['casa', 'carro'].includes(m.tipo)) {
        f.push(campo({ caminho: 'moeda', rotulo: porDestinos ? 'Moeda principal' : 'Moeda', formato: 'select', opcoes: MOEDAS.map((x) => [x, x]) }));
        if (!porDestinos || !(m.especificos.destinos || []).length) {
          f.push(campo({ caminho: 'valorAlvo', rotulo: dataViagem ? 'Dinheiro pra gastar lá (total)' : 'Valor alvo', moeda: simbolo(m.moeda), ajuda: porDestinos ? 'ou deixe vazio e liste os destinos abaixo - o alvo sai sozinho' : ((m.itens || []).length ? 'os sub-itens abaixo substituem esse valor' : (m.moeda !== 'BRL' && cotacao(m.moeda, estado.ctx.cambio) ? `1 ${m.moeda} = ${formatMoeda(cotacao(m.moeda, estado.ctx.cambio), 'BRL', { casas: 4 })}` : '')) }));
        }
      }
      if (m.contribuicao !== 'recorrente' || m.tipo !== 'acumulo') f.push(campo({ caminho: 'dataAlvo', rotulo: dataViagem ? 'Mês da viagem' : 'Até quando', formato: 'mes' }));
    }
    if (m.contribuicao !== 'recorrente') {
      if (!['reservaEmergencia'].includes(m.tipo) && !dataViagem) f.push(campo({ caminho: 'valorInicial', rotulo: 'Já guardado fora dos investimentos', ajuda: 'dinheiro solto - conta com saldo em moeda você vincula no próximo passo ("Saldo em conta")' }));
      const real = estado.ctx.historico && m.id && estado.ctx.historico[m.id] ? estado.ctx.historico[m.id].aporteMedio : null;
      f.push(campo({ caminho: 'aporteMensal', rotulo: `Seu aporte mensal (opcional)`, dica: EXPLICACOES.aporteReal, ajuda: real != null ? `vazio = o aporte real do histórico: ${formatMoeda(Math.max(0, real))}/mês` : 'vazio = deduzido do histórico dos investimentos vinculados' }));
      f.push(campo({ caminho: 'rendimentoAnual', rotulo: 'Rendimento esperado ao ano', formato: 'pct', ajuda: m.tipo === 'aposentadoria' ? 'use o rendimento real (acima da inflação)' : '' }));
    }
    if (porDestinos) {
      extra += `<fieldset class="mt-grupo-campos"><legend>Destinos <em>(país/cidade, dias e gasto diário na moeda de lá)</em></legend>${destinosEditorHtml(m)}
  <div class="mt-campos">${campo({ caminho: 'especificos.margem', rotulo: 'Margem de segurança', formato: 'pct', dica: EXPLICACOES.margemViagem })}</div>
  <div id="mtResumoViagem">${resumoViagemHtml(m)}</div></fieldset>`;
      extra += `<fieldset class="mt-grupo-campos"><legend>Itens fixos e compras antecipadas <em>(passagens, hospedagem, ingressos - parcelados ou à vista)</em></legend>${fixosEditorHtml(m)}</fieldset>`;
    } else if (dataViagem) {
      extra += `<fieldset class="mt-grupo-campos"><legend>Conta mensal (passagens, hospedagem parceladas)</legend><div class="mt-campos">
${campo({ caminho: 'contaMensal.descricao', rotulo: 'Descrição', formato: 'texto' })}${campo({ caminho: 'contaMensal.valor', rotulo: 'Valor por mês' })}${campo({ caminho: 'contaMensal.meses', rotulo: 'Meses', formato: 'int' })}${campo({ caminho: 'contaMensal.inicio', rotulo: 'Começa em', formato: 'mes' })}</div></fieldset>`;
      extra += '<button type="button" class="mt-link" data-dest-add>+ Planejar por destinos (dias x gasto diário)</button>';
    }
    if (!['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].includes(m.tipo) && m.contribuicao !== 'recorrente') {
      extra += `<fieldset class="mt-grupo-campos"><legend>Sub-itens de custo <em>(opcional)</em></legend><div id="mtItensAssistente"></div></fieldset>`;
    }
    if (m.tipo === 'rendaPassiva') extra += `<div class="mt-campos">${campo({ caminho: 'exibirNaCarteira', rotulo: 'Mostrar essa meta na tela Carteiras', formato: 'bool', largura: 'largo' })}</div>`;
    extra += `<label class="mt-campo largo"><span>Notas</span><textarea data-campo="notas" data-formato="texto" rows="2">${escHtml(m.notas || '')}</textarea></label>`;
    return `<div class="mt-campos">${f.join('')}</div>${extra}`;
  }

  function saldosEditorHtml(m) {
    const ss = (m.vinculos || []).map((v, i) => ({ v, i })).filter((x) => x.v.tipo === 'saldo');
    return `<h4 class="mt-grupo">Saldo em conta <em class="mt-fraco">(dinheiro parado, não investido - ex. Wise em euro)</em>${infoHtml(EXPLICACOES.saldoConta)}</h4>
<ul class="mt-saldos-ed">${ss.map(({ v, i }) => `<li>
  <input data-saldo="${i}" data-saldo-campo="instituicao" value="${escHtml(v.instituicao || '')}" placeholder="Instituição (ex. Wise)" aria-label="Instituição">
  <span class="mt-entrada"><select data-saldo="${i}" data-saldo-campo="moeda" aria-label="Moeda">${MOEDAS_SALDO.map((x) => `<option ${x === (v.moeda || 'EUR') ? 'selected' : ''}>${x}</option>`).join('')}</select><input data-saldo="${i}" data-saldo-campo="saldo" inputmode="decimal" value="${numParaCampo(v.saldo)}" aria-label="Saldo"></span>
  <label class="mt-mini"><span>atualizado em</span><input type="date" data-saldo="${i}" data-saldo-campo="atualizadoEm" value="${escHtml(v.atualizadoEm || '')}" max="${escHtml(String(estado.ctx.hoje || '').slice(0, 10))}"></label>
  <span class="mt-saldo-brl mono">${v.moeda && v.moeda !== 'BRL' && cotacao(v.moeda, estado.ctx.cambio) ? `≈ ${r0((Number(v.saldo) || 0) * cotacao(v.moeda, estado.ctx.cambio))}` : ''}</span>
  <button type="button" class="mt-x" data-saldo-remover="${i}" aria-label="Remover saldo">×</button>
</li>`).join('')}</ul>
<button type="button" class="mt-link" data-saldo-add>+ Adicionar saldo em conta</button>`;
  }
  function passoVinculosHtml(m) {
    const ativos = estado.ctx.ativos || [];
    const vinc = m.vinculos || [];
    const temGrupo = (tipo, chave) => vinc.some((v) => v.tipo === tipo && (v.classe === chave || v.marca === chave));
    const outras = (estado.resposta.metas || []).filter((x) => x.id !== m.id);
    const usoOutras = new Map();
    outras.forEach((o) => resolverVinculos(o.vinculos, ativos, estado.ctx.cambio).itens.forEach((v) => v.ativos.forEach((a) => {
      const lista = usoOutras.get(a.id) || []; lista.push(o.nome); usoOutras.set(a.id, lista);
    })));
    const res = resolverVinculos(vinc, ativos, estado.ctx.cambio);
    const atalhos = [
      ...['emergencial', 'longo-prazo'].map((k) => ({ tipo: 'marca', chave: k, rotulo: ROTULO_MARCA[k], valor: ativos.filter((a) => a.classe === 'rf' && a.marca === k).reduce((s, a) => s + a.valorBRL, 0) })),
      ...['fiis', 'acoes', 'usa', 'rf'].map((k) => ({ tipo: 'classe', chave: k, rotulo: `Toda a classe ${ROTULO_CLASSE[k]}`, valor: ativos.filter((a) => a.classe === k).reduce((s, a) => s + a.valorBRL, 0) })),
    ].filter((x) => x.valor > 0);
    const busca = (estado.assistente.buscaAtivo || '').toLowerCase();
    const grupos = ['rf', 'fiis', 'acoes', 'usa'].map((cl) => [cl, ativos.filter((a) => a.classe === cl && (!busca || `${a.nome} ${a.descricao || ''} ${a.instituicao || ''}`.toLowerCase().includes(busca)))]).filter(([, l]) => l.length);
    const linhaAtivo = (a) => {
      const v = vinc.find((x) => x.tipo === 'ativo' && x.id === a.id);
      const coberto = vinc.some((x) => (x.tipo === 'classe' && x.classe === a.classe) || (x.tipo === 'marca' && a.classe === 'rf' && x.marca === a.marca));
      const outrasMetas = usoOutras.get(a.id);
      const sub = [a.descricao && a.descricao !== a.nome ? a.descricao : null, a.instituicao, a.classe === 'rf' ? ROTULO_MARCA[a.marca] : null].filter(Boolean).map(escHtml).join(' · ');
      return `<li class="${v || coberto ? 'marcado' : ''}">
  <label class="mt-v-check"><input type="checkbox" data-vinc-ativo="${escHtml(a.id)}" ${v || coberto ? 'checked' : ''} ${coberto ? 'disabled' : ''}><span class="mt-v-nome">${escHtml(a.nome)}<em>${sub}${coberto ? ' · já entra pela classe/marca' : ''}${outrasMetas ? ` · <span class="mt-ruim">também em ${outrasMetas.map(escHtml).join(', ')}</span>` : ''}</em></span></label>
  <b class="mono">${formatMoeda(a.valorBRL, 'BRL', { casas: 0 })}</b>
  ${v ? `<span class="mt-v-modo"><select data-vinc-modo="${escHtml(a.id)}" aria-label="Quanto"><option value="total" ${v.modo === 'total' ? 'selected' : ''}>Tudo</option><option value="fracao" ${v.modo === 'fracao' ? 'selected' : ''}>%</option><option value="valor" ${v.modo === 'valor' ? 'selected' : ''}>R$</option></select>${v.modo !== 'total' ? `<input data-vinc-qtd="${escHtml(a.id)}" inputmode="decimal" value="${v.modo === 'fracao' ? numParaCampo((v.fracao || 0) * 100) : numParaCampo(v.valor)}" aria-label="${v.modo === 'fracao' ? 'Percentual' : 'Valor'}">` : ''}</span>` : '<span></span>'}
</li>`;
    };
    return `<p class="mt-dialogo-dica">Quais investimentos são dessa meta? O progresso anda sozinho com o valor de hoje deles. Dá pra dedicar só uma parte (% ou valor fixo).</p>
<div class="mt-atalhos">${atalhos.map((x) => `<button type="button" class="mt-chip ${temGrupo(x.tipo, x.chave) ? 'active' : ''}" data-vinc-grupo="${x.tipo}:${x.chave}" aria-pressed="${temGrupo(x.tipo, x.chave)}">${escHtml(x.rotulo)} <span class="mono">${formatMoeda(x.valor, 'BRL', { casas: 0 })}</span></button>`).join('')}</div>
<input class="mt-busca" type="search" placeholder="Buscar ativo, instituição…" data-vinc-busca value="${escHtml(estado.assistente.buscaAtivo || '')}" aria-label="Buscar ativo">
<div class="mt-v-lista">${grupos.map(([cl, lista]) => `<h4 class="mt-grupo">${ROTULO_CLASSE[cl]}</h4><ul>${lista.map(linhaAtivo).join('')}</ul>`).join('') || '<p class="hint">Nenhum ativo encontrado.</p>'}</div>
<p class="mt-v-total">Vinculado: <b class="mono">${formatMoeda(res.total)}</b></p>
${saldosEditorHtml(m)}`;
  }

  function passoRevisarHtml(m) {
    const c = calcDe(m);
    const ap = aparenciaMeta(m);
    const linhas = [
      ['Tipo', ap.rotulo],
      c.renda ? ['Renda hoje / meta', `${formatMoeda(c.renda.atual)} / ${formatMoeda(c.renda.alvo)} por mês`] : null,
      ['Alvo', c.alvoBRL != null ? `${formatMoeda(c.alvoBRL)}${c.moeda !== 'BRL' && c.alvoMoeda != null ? ` (${formatMoeda(c.alvoMoeda, c.moeda)})` : ''}` : '—'],
      c.conta ? ['Conta mensal', `${formatMoeda(c.conta.valor)} x ${c.conta.total} meses`] : null,
      ['Já tem', `${formatMoeda(c.atualBRL)} (${pct(c.percentual)})`],
      m.tipo !== 'reservaEmergencia' ? ['Prazo', c.dataAlvo ? `${rotuloMes(c.dataAlvo)} · ${rotuloDuracao(c.mesesRestantes)}` : 'sem data'] : null,
      m.tipo !== 'reservaEmergencia' ? ['Aporte necessário', c.aporteNecessarioTotal != null ? `${formatMoeda(c.aporteNecessarioTotal)}/mês` : '—'] : null,
      ['Seu aporte', c.aporteAtual ? `${formatMoeda(c.aporteAtual)}/mês${c.aporteOrigem === 'historico' ? ' (real)' : ''}` : '—'],
      m.tipo === 'reservaEmergencia' ? ['Líquido hoje', formatMoeda(c.atualLiquidoBRL)] : null,
      c.aposentadoria ? ['Renda ideal', c.aposentadoria.renda ? `${formatMoeda(c.aposentadoria.renda)}/mês` : '—'] : null,
      c.viagem && c.viagem.temFixos ? ['Itens fixos', `${formatMoeda(c.viagem.fixosTotalBRL)} (${formatMoeda(c.viagem.fixosPagoBRL)} pagos)`] : null,
      ['Investimentos vinculados', `${c.vinculos.length} · ${formatMoeda(c.valorVinculado)}`],
    ].filter(Boolean);
    return `<div class="mt-revisar" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <div class="mt-revisar-cab">${seloMetaHtml(m, { tamanho: 42 })}<div><strong>${escHtml(m.nome || '(sem nome)')}</strong>${statusPillHtml(c.status, m)}</div></div>
  <dl>${linhas.map(([k, v]) => `<div><dt>${k}</dt><dd class="mono">${escHtml(v)}</dd></div>`).join('')}</dl>
  ${c.avisos.length ? `<p class="mt-alerta">${c.avisos.map(escHtml).join(' · ')}</p>` : ''}
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
  }

  function validarPasso(a) {
    const m = a.meta;
    if (a.passo === 2 && !String(m.nome || '').trim()) return 'Dê um nome pra meta.';
    return null;
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
  }

  function validarPasso(a) {
    const m = a.meta;
    if (a.passo === 2 && !String(m.nome || '').trim()) return 'Dê um nome pra meta.';
    return null;
  }

  // eventos do assistente (delegação no fundo do diálogo)
  el.dialogo.addEventListener('click', async (ev) => {
    const a = estado.assistente;
    if (!a) return;
    if (ev.target === el.dialogo || ev.target.closest('[data-fechar]')) { fecharAssistente(); return; }
    const tipoBtn = ev.target.closest('[data-tipo]');
    if (tipoBtn) {
      const tipo = tipoBtn.dataset.tipo;
      const categoria = tipoBtn.dataset.categoria;
      const mudou = a.meta.tipo !== tipo || (tipo === 'acumulo' && a.meta.categoria !== categoria);
      if (mudou && !a.editando) a.meta = metaPadrao(tipo, { referencias: estado.ctx.referencias, hoje: estado.ctx.hoje, categoria });
      else if (mudou) { a.meta.tipo = tipo; a.meta.categoria = tipo === 'acumulo' ? categoria : null; }
      a.passo = 2;
      desenharAssistente();
      return;
    }
    const passoBtn = ev.target.closest('[data-passo]');
    if (passoBtn && !passoBtn.disabled) { a.passo = Number(passoBtn.dataset.passo); desenharAssistente(); return; }
    if (ev.target.closest('[data-anterior]')) { a.passo = Math.max(1, a.passo - 1); desenharAssistente(); return; }
    if (ev.target.closest('[data-proximo]')) {
      const erro = validarPasso(a);
      if (erro) { const p = el.dialogo.querySelector('#mtPrevia'); if (p) p.innerHTML = `<span class="mt-ruim">${erro}</span>`; return; }
      a.passo = Math.min(4, a.passo + 1); desenharAssistente(); return;
    }
    // 03/10/2026: destinos, itens fixos e saldos em conta
    const esp = a.meta.especificos || (a.meta.especificos = {});
    if (ev.target.closest('[data-dest-add]')) {
      esp.destinos = esp.destinos || [];
      esp.destinos.push(destinoPadrao({ moeda: a.meta.moeda && a.meta.moeda !== 'BRL' ? a.meta.moeda : 'EUR' }));
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
      esp.fixos.push({ id: idItem(), nome: '', valor: null, moeda: 'BRL', parcelas: 1, inicio: mesDe(estado.ctx.hoje), parte: 1, pago: false });
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
      if (!String(a.meta.nome || '').trim()) { a.passo = 2; desenharAssistente(); return; }
      salvarBtn.disabled = true;
      salvarBtn.textContent = 'Salvando…';
      const meta = clonar(a.meta);
      if (meta.contribuicao !== 'recorrente') meta.recorrente = null;
      if (meta.contaMensal && !(meta.contaMensal.valor > 0)) meta.contaMensal = null;
      meta.vinculos = (meta.vinculos || []).filter((v) => v.tipo !== 'saldo' || String(v.instituicao || '').trim());
      if (meta.especificos && Array.isArray(meta.especificos.destinos)) meta.especificos.destinos = meta.especificos.destinos.filter((d) => String(d.cidade || d.pais || '').trim());
      if (meta.especificos && Array.isArray(meta.especificos.fixos)) meta.especificos.fixos = meta.especificos.fixos.filter((x) => String(x.nome || '').trim());
      const salva = await salvar(meta);
      if (salva) fecharAssistente(); else { salvarBtn.disabled = false; salvarBtn.textContent = 'Tentar de novo'; }
    }
  });
  el.dialogo.addEventListener('input', (ev) => {
    const a = estado.assistente;
    if (!a) return;
    const t = ev.target;
    if (t.dataset.campo && !['select', 'bool', 'mes'].includes(t.dataset.formato)) { lerCampo(t); atualizarPrevia(); }
    if (t.dataset.dest != null && t.tagName !== 'SELECT') {
      const d = (a.meta.especificos.destinos || [])[Number(t.dataset.dest)];
      if (d) gravarCaminho(d, t.dataset.destCampo, ['cidade', 'pais'].includes(t.dataset.destCampo) ? t.value : parseNumeroBR(t.value));
      atualizarPrevia();
    }
    if (t.dataset.fixo != null && t.type !== 'checkbox' && t.tagName !== 'SELECT' && t.type !== 'month') {
      const fx = (a.meta.especificos.fixos || [])[Number(t.dataset.fixo)];
      const k = t.dataset.fixoCampo;
      if (fx) {
        if (k === 'nome') fx.nome = t.value;
        else if (k === 'parte') { const n = parseNumeroBR(t.value); fx.parte = n == null ? 1 : Math.max(0, Math.min(1, n / 100)); }
        else if (k === 'parcelas') { const n = parseNumeroBR(t.value); fx.parcelas = n == null ? 1 : Math.max(1, Math.round(n)); }
        else fx[k] = parseNumeroBR(t.value);
      }
      atualizarPrevia();
    }
    if (t.dataset.saldo != null && t.tagName !== 'SELECT' && t.type !== 'date') {
      const v = a.meta.vinculos[Number(t.dataset.saldo)];
      if (v) {
        if (t.dataset.saldoCampo === 'instituicao') v.instituicao = t.value;
        else { v.saldo = parseNumeroBR(t.value); v.atualizadoEm = String(estado.ctx.hoje || '').slice(0, 10); }
        const brl = t.closest('li') && t.closest('li').querySelector('.mt-saldo-brl');
        const cot = cotacao(v.moeda || 'BRL', estado.ctx.cambio);
        if (brl) brl.textContent = v.moeda !== 'BRL' && cot ? `≈ ${r0((Number(v.saldo) || 0) * cot)}` : '';
      }
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
    if (t.dataset.dest != null && t.tagName === 'SELECT') {
      const d = (a.meta.especificos.destinos || [])[Number(t.dataset.dest)];
      if (d) d.moeda = t.value;
      atualizarPrevia();
    }
    if (t.dataset.fixo != null && (t.type === 'checkbox' || t.tagName === 'SELECT' || t.type === 'month')) {
      const fx = (a.meta.especificos.fixos || [])[Number(t.dataset.fixo)];
      if (fx) fx[t.dataset.fixoCampo] = t.type === 'checkbox' ? t.checked : (t.value || null);
      atualizarPrevia();
    }
    if (t.dataset.saldo != null && t.tagName === 'SELECT') {
      const v = a.meta.vinculos[Number(t.dataset.saldo)];
      if (v) v.moeda = t.value;
      desenharAssistente();
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
  doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && estado.assistente) fecharAssistente(); });

  // eventos da tela
  el.tela.addEventListener('click', async (ev) => {
    const abrir = ev.target.closest('[data-abrir]');
    if (abrir) { irPara(abrir.dataset.abrir); return; }
    if (ev.target.closest('[data-voltar]')) { irPara(null); return; }
    const fs = ev.target.closest('[data-filtro-status]');
    if (fs) { estado.filtroStatus = fs.dataset.filtroStatus; desenhar(); return; }
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
    const meta = estado.detalheId ? acharMeta(estado.detalheId) : null;
    if (!meta) return;
    if (ev.target.closest('[data-editar]')) { abrirAssistente(meta, 2, { editando: true }); return; }
    if (ev.target.closest('[data-editar-vinculos]')) { abrirAssistente(meta, 3, { editando: true }); return; }
    if (ev.target.closest('[data-arquivar]')) { await arquivar(meta); return; }
    if (ev.target.closest('[data-excluir-definitivo]')) { await excluirDefinitivo(meta); return; }
    const modoHist = ev.target.closest('[data-modo-hist]');
    if (modoHist) {
      estado.modoHist = modoHist.dataset.modoHist;
      el.tela.querySelectorAll('[data-modo-hist]').forEach((b) => b.classList.toggle('active', b === modoHist));
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
    let timerResize = null;
    let larguraAntes = win.innerWidth;
    win.addEventListener('resize', () => {
      if (!estado.detalheId || win.innerWidth === larguraAntes) return;
      larguraAntes = win.innerWidth;
      clearTimeout(timerResize);
      timerResize = setTimeout(() => {
        const m = acharMeta(estado.detalheId);
        if (!m) return;
        const c = calcDe(m);
        desenharHistorico(m, c);
        desenharRenda(m, c);
        desenharGrafico(c, marcosProjecao(c, { hoje: estado.ctx.hoje, anoNascimento: num(m.especificos && m.especificos.anoNascimento) }));
      }, 150);
    });
  }
  estado.detalheId = idDoHash();
  estado.novaPendente = novaDoHash();

  async function carregarERedesenhar() {
    const resposta = await getMetasImpl(token);
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

/**
 * ativo.js - 25/09/2026: tela "Detalhe do ativo" (ativo/index.html?ref=...).
 *
 * Um ativo por tela - ações, FIIs, ações EUA ou um título de renda fixa -
 * com o foco no que o Tiago tem nele: posição e resultado, cotação x
 * preço-teto (o teto e o viés que ele edita em Distribuições e Metas),
 * rentabilidade x CDI e o índice da bolsa, valor aplicado x saldo, histórico
 * mês a mês, proventos (recebidos e a receber), extrato, e o conteúdo de
 * apoio: tese da Suno (Google Drive privado dele), notícias (Google
 * Notícias), "Sobre" (assets/data/ativos-sobre.json) e imposto de renda
 * (assets/data/imposto-renda.json).
 *
 * Dados: action=ativo (apps-script/Ativo.gs), em cache no aparelho
 * (cache-dados.js, chave "ativo:<ref>") - a tela abre na hora com o último
 * dado e atualiza por cima. Notícias e teses chegam depois, cada uma por
 * conta própria (uma falha não derruba o resto).
 */

import { getAtivo, getNoticiasAtivo, getTesesAtivo } from '../api-client.js';
import {
  formatBRL, formatBRLCompacto, formatUSD, formatNumeroBR, formatPercentFromFraction, formatPercentFromPoints,
  formatDateBR, formatRelativeTime,
} from '../format.js';
import { mountRefreshControl, resolveSiteRootUrl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { refDaUrl } from '../link-ativo.js';
import { logoAtivoHtml, botaoInfoHtml, statusVies, wirePointerTooltipCarteiras_, wireGraficosClasseCarteiras } from './carteiras-classe-comum.js';
import {
  CLASSES_ATIVO, montarHistoricoAtivo, historicoMensal, montarExtrato, resumoProventosAtivo, faixaDePreco,
  resumoPosicao, percentualNaCarteira, irDaClasse, ordenarTeses, cambioMaisRecente,
} from './ativo-calc.js';

const VERSAO_CACHE = 'v1';
const chaveCache = (ref) => `ativo_${VERSAO_CACHE}:${ref}`;

/** Texto vindo de planilha/notícia/JSON entra sempre escapado. */
export function esc(texto) {
  return String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Só http(s) vira link. */
function urlSegura(url) {
  return /^https?:\/\//i.test(String(url || '')) ? esc(url) : null;
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function rotuloMes(anoMes, { comAno = true } = {}) {
  const [a, m] = anoMes.split('-');
  return `${MESES_CURTOS[Number(m) - 1]}${comAno ? `/${a.slice(2)}` : ''}`;
}

const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "2026-09" -> "setembro de 2026"; data completa -> dd/mm/aaaa. */
export function textoMesAno(valor) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(valor || ''));
  return m ? `${MESES_LONGOS[Number(m[2]) - 1]} de ${m[1]}` : formatDateBR(valor);
}

const cor = (v) => (typeof v === 'number' ? (v >= 0 ? 'good' : 'bad') : '');

// ---------------------------------------------------------------------------
// Conteúdo estático (Sobre e IR): 1 fetch por visita
// ---------------------------------------------------------------------------

let estaticosEmCurso = null;
function carregarEstaticosPadrao(fetchImpl = typeof fetch !== 'undefined' ? fetch : null) {
  if (!estaticosEmCurso) {
    const raiz = resolveSiteRootUrl();
    const pegar = (caminho) => (fetchImpl
      ? fetchImpl(new URL(caminho, raiz).href).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null));
    estaticosEmCurso = Promise.all([pegar('assets/data/ativos-sobre.json'), pegar('assets/data/imposto-renda.json')])
      .then(([sobre, ir]) => ({ sobre, ir }));
  }
  return estaticosEmCurso;
}

// ---------------------------------------------------------------------------
// Contexto de desenho
// ---------------------------------------------------------------------------

/** Tudo que as seções precisam, calculado 1x a partir da resposta. */
export function montarContexto(resposta, { sobre = null, ir = null } = {}) {
  const classe = resposta.classe || (resposta.tipo === 'rf' ? 'rendaFixa' : 'acoes');
  const cfg = CLASSES_ATIVO[classe] || CLASSES_ATIVO.acoes;
  const emDolar = resposta.moeda === 'USD';
  const historico = montarHistoricoAtivo(resposta);
  const posicao = resumoPosicao(resposta, historico);
  const cambio = emDolar ? cambioMaisRecente(resposta) : null;
  const aplicadoBrl = posicao.aplicadoHistorico ?? (emDolar ? null : posicao.aplicado);
  return {
    resposta,
    classe,
    cfg,
    ehRf: resposta.tipo === 'rf',
    emDolar,
    cambio,
    fmt: emDolar ? formatUSD : formatBRL,
    ativo: resposta.ativo || null,
    ticker: resposta.ticker,
    historico,
    posicao,
    proventos: resumoProventosAtivo(resposta, { aplicadoHoje: aplicadoBrl }),
    faixa: faixaDePreco(resposta),
    mensal: historicoMensal(historico, { campoIndice: cfg.indice.campo }),
    extrato: montarExtrato(resposta),
    percentualCarteira: percentualNaCarteira(historico),
    sobre: sobre && sobre.ativos ? sobre.ativos[String(resposta.ticker || '').toUpperCase()] || null : null,
    ir: irDaClasse(ir, classe),
  };
}

/** Valor na moeda do ativo + "i" com o equivalente em reais (ações EUA). */
function valorComBrl(ctx, valor) {
  const texto = ctx.fmt(valor);
  if (!ctx.emDolar || typeof valor !== 'number' || !ctx.cambio) return texto;
  return `${texto}${botaoInfoHtml(`Equivalente em reais: ${formatBRL(valor * ctx.cambio)} (câmbio de hoje, ${formatNumeroBR(ctx.cambio, 4)}).`, { pequeno: true })}`;
}

function linkCarteira(ctx) {
  return new URL(`carteiras/index.html#${ctx.cfg.pagina}`, resolveSiteRootUrl()).href;
}

// ---------------------------------------------------------------------------
// Cabeçalho + navegação das seções
// ---------------------------------------------------------------------------

function cabecalhoHtml(ctx) {
  const a = ctx.ativo || {};
  const raiz = resolveSiteRootUrl();
  const trilha = `
    <nav class="at-trilha" aria-label="Você está em">
      <a href="${new URL('carteiras/index.html', raiz).href}">Carteiras</a><span aria-hidden="true">›</span>
      <a href="${linkCarteira(ctx)}">${ctx.cfg.labelPlural}</a><span aria-hidden="true">›</span>
      <span aria-current="page">${esc(ctx.ticker)}</span>
    </nav>`;

  if (ctx.ehRf) {
    const carteira = a.tipoCarteira === 'emergencial' ? 'Reserva de emergência' : 'Longo prazo';
    const chips = [
      `<span class="at-chip at-chip-classe">Renda fixa</span>`,
      a.indexador ? `<span class="at-chip">${esc(a.indexador)}</span>` : '',
      a.tipoInvestimento ? `<span class="at-chip">${esc(a.tipoInvestimento)}</span>` : '',
      `<span class="at-chip">${carteira}</span>`,
    ].join('');
    return `${trilha}
      <header class="at-cabecalho">
        <div class="at-id">
          <span class="at-logo">${logoAtivoHtml(String(a.instituicao || ctx.ticker).replace(/[^A-Za-z]/g, '').slice(0, 2) || 'RF')}</span>
          <div class="at-id-texto">
            <h1 class="at-ticker at-ticker-rf">${esc(ctx.ticker)}</h1>
            <p class="at-nome">${esc(a.instituicao || '')}${a.vencimento ? ` · vence em ${esc(a.vencimento)}` : ''}</p>
            <div class="at-chips">${chips}</div>
          </div>
        </div>
        <div class="at-cotacao">
          <span class="at-cotacao-label">Saldo bruto</span>
          <span class="at-cotacao-valor">${formatBRL(ctx.posicao.saldo)}</span>
          <span class="at-cotacao-var ${cor(ctx.posicao.percentual)}">${formatPercentFromFraction(ctx.posicao.percentual)} sobre o aplicado</span>
        </div>
      </header>`;
  }

  const nome = (ctx.sobre && ctx.sobre.nome) || a.nome || '';
  const grupo = ctx.sobre ? [ctx.sobre.setor || ctx.sobre.tipo, ctx.sobre.subsetor || ctx.sobre.segmento || ctx.sobre.industria].filter(Boolean).join(' · ') : a.grupo;
  const vies = statusVies(a.vies);
  const chips = [
    `<span class="at-chip at-chip-classe">${ctx.cfg.label}</span>`,
    grupo ? `<span class="at-chip">${esc(grupo)}</span>` : '',
    vies.classe ? `<span class="status-pill ${vies.classe}">${vies.texto}</span>` : '',
  ].join('');
  const variacao = typeof a.variacaoDia === 'number'
    ? `<span class="at-cotacao-var ${cor(a.variacaoDia)}">${formatPercentFromFraction(a.variacaoDia)} hoje</span>` : '';
  return `${trilha}
    <header class="at-cabecalho">
      <div class="at-id">
        <span class="at-logo">${logoAtivoHtml(ctx.ticker)}</span>
        <div class="at-id-texto">
          <h1 class="at-ticker">${esc(ctx.ticker)}</h1>
          ${nome ? `<p class="at-nome">${esc(nome)}</p>` : ''}
          <div class="at-chips">${chips}</div>
        </div>
      </div>
      <div class="at-cotacao">
        <span class="at-cotacao-label">Cotação</span>
        <span class="at-cotacao-valor">${valorComBrl(ctx, a.precoAtual)}</span>
        ${variacao}
      </div>
    </header>`;
}

function navSecoesHtml(ctx) {
  const itens = [
    ['at-graficos', 'Rentabilidade'],
    ['at-mensal', 'Mês a mês'],
    ...(ctx.ehRf ? [] : [['at-proventos', 'Proventos']]),
    ['at-extrato', 'Extrato'],
    ...(ctx.ehRf ? [] : [['at-tese', 'Tese'], ['at-noticias', 'Notícias']]),
    ...(ctx.sobre ? [['at-sobre', 'Sobre']] : []),
    ['at-ir', 'Imposto de renda'],
  ];
  return `<nav class="at-secoes" aria-label="Seções da página">${itens.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</nav>`;
}

// ---------------------------------------------------------------------------
// Resumo da posição
// ---------------------------------------------------------------------------

function statHtml(label, valorHtml, { classe = '', sub = '' } = {}) {
  return `<div class="cc-resumo-stat${classe ? ` ${classe}` : ''}">
    <span class="cc-resumo-stat-label">${label}</span>
    <span class="cc-resumo-stat-valor">${valorHtml}</span>
    ${sub ? `<span class="cc-resumo-stat-sub">${sub}</span>` : ''}
  </div>`;
}

export function resumoHtml(ctx) {
  const p = ctx.posicao;
  const a = ctx.ativo || {};
  if (!ctx.ativo || (!ctx.ehRf && !(ctx.ativo.quantidade > 0))) {
    const jaTeve = (ctx.resposta.transacoes || []).length > 0;
    return `<div class="at-aviso">${jaTeve
      ? `Você não tem mais ${esc(ctx.ticker)} na carteira. O histórico, o extrato e os proventos de quando teve continuam abaixo.`
      : `Você ainda não tem ${esc(ctx.ticker)} na carteira.`}</div>`;
  }
  let stats;
  if (ctx.ehRf) {
    const contratada = (a.rentabilidadeContratada && a.rentabilidadeContratada.texto) || a.indexador || '—';
    stats = [
      statHtml('Resultado', `${formatBRL(p.resultado)}<span class="cc-resumo-stat-pct ${cor(p.resultado)}">${formatPercentFromFraction(p.percentual)}</span>`, { classe: cor(p.resultado) }),
      statHtml('Rentab. contratada', esc(contratada)),
      statHtml('Vencimento', esc(a.vencimento || '—')),
      statHtml('Se resgatasse hoje', formatBRL(p.liquidoHoje), { sub: p.irHoje != null ? `IR de ${formatBRL(p.irHoje)}` : '' }),
      statHtml('Do patrimônio', formatPercentFromFraction(ctx.percentualCarteira, 1).replace('+', '')),
    ];
  } else {
    const pr = ctx.proventos;
    stats = [
      statHtml('Resultado', `${valorComBrl(ctx, p.resultado)}<span class="cc-resumo-stat-pct ${cor(p.resultado)}">${formatPercentFromFraction(p.percentual)}</span>`, {
        classe: cor(p.resultado),
        sub: p.resultadoComProventos != null ? `${ctx.fmt(p.resultadoComProventos)} com proventos` : '',
      }),
      statHtml('Quantidade', formatNumeroBR(p.quantidade, Number.isInteger(p.quantidade) ? 0 : 4), { sub: `preço médio ${ctx.fmt(p.precoMedio)}` }),
      statHtml('Proventos 12 meses', formatBRL(pr.ultimos12), { sub: `${formatBRL(pr.total)} desde a compra` }),
      statHtml('Do patrimônio', formatPercentFromFraction(ctx.percentualCarteira, 1).replace('+', '')),
    ];
  }
  return `
    <div class="cc-resumo at-resumo" style="--tile-accent:var(${ctx.cfg.token})">
      <div class="cc-resumo-principal">
        <span class="eyebrow">Saldo atual</span>
        <span class="cc-resumo-valor">${ctx.ehRf ? formatBRL(p.saldo) : valorComBrl(ctx, p.saldo)}</span>
        <span class="cc-resumo-investido">Valor aplicado: ${ctx.ehRf ? formatBRL(p.aplicado) : valorComBrl(ctx, p.aplicado)}</span>
      </div>
      <div class="cc-resumo-sep" aria-hidden="true"></div>
      <div class="cc-resumo-stats">${stats.join('')}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Cotação x preço-teto (a barra do "print 2": mínimo de 52 semanas -> teto)
// ---------------------------------------------------------------------------

export function faixaHtml(ctx) {
  const f = ctx.faixa;
  if (!f) return '';
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const vies = statusVies(f.vies);
  const temTeto = typeof f.teto === 'number' && f.teto > 0;
  const ini = Math.min(f.posicoes.min ?? 0, temTeto ? f.posicoes.teto : f.posicoes.max ?? 1);
  const fim = Math.max(f.posicoes.min ?? 0, temTeto ? f.posicoes.teto : f.posicoes.max ?? 1);
  const rotuloMin = f.fonte === 'serie' && f.parcial ? `Mín. desde ${formatDateBR(f.desde)}` : 'Mín. 52 semanas';
  const rotuloMax = f.fonte === 'serie' && f.parcial ? 'Máx. no período' : 'Máx. 52 semanas';
  let frase = '';
  if (temTeto) {
    const abaixo = f.margemTeto >= 0;
    frase = `A cotação está <b class="${abaixo ? 'good' : 'bad'}">${formatPercentFromFraction(Math.abs(f.margemTeto), 1).replace('+', '')} ${abaixo ? 'abaixo' : 'acima'}</b> do seu preço-teto${abaixo ? ' (margem de segurança).' : '.'}`;
  } else {
    frase = 'Sem preço-teto definido - você pode definir em Distribuições e Metas.';
  }
  const fonteTexto = f.fonte === 'planilha'
    ? 'Mínimo e máximo de 52 semanas da aba "Carteira FIIs".'
    : (f.parcial ? `Mínimo e máximo desde que o ativo entrou na sua carteira (${formatDateBR(f.desde)}), menos de 1 ano.` : 'Mínimo e máximo das cotações dos últimos 12 meses.');
  const marcador = (classe, v, rotulo, dica) => (v == null ? '' : `<span class="at-faixa-marca ${classe} info-alvo" style="left:${pct(v)}" data-tooltip="${esc(dica)}">${rotulo ? `<span class="at-faixa-marca-rotulo">${rotulo}</span>` : ''}</span>`);
  return `
    <section class="at-card" id="at-faixa" aria-labelledby="at-faixa-titulo">
      <div class="at-card-titulo"><h2 id="at-faixa-titulo">Cotação × preço-teto</h2>${vies.classe ? `<span class="status-pill ${vies.classe}">${vies.texto}</span>` : ''}</div>
      <div class="at-faixa" role="img" aria-label="Cotação ${esc(ctx.fmt(f.atual))}, mínimo ${esc(ctx.fmt(f.min))}${temTeto ? `, preço-teto ${esc(ctx.fmt(f.teto))}` : ''}">
        <div class="at-faixa-trilho">
          <span class="at-faixa-cheia ${temTeto && f.margemTeto < 0 ? 'acima' : ''}" style="left:${pct(ini)};width:${pct(Math.max(fim - ini, 0.004))}"></span>
          ${marcador('at-faixa-pm', f.posicoes.precoMedio, 'PM', `Seu preço médio: ${ctx.fmt(f.precoMedio)}`)}
          ${temTeto && f.posicoes.teto < 0.97 ? marcador('at-faixa-teto', f.posicoes.teto, 'teto', `Seu preço-teto: ${ctx.fmt(f.teto)}`) : ''}
          ${f.posicoes.min > 0.03 ? marcador('at-faixa-min', f.posicoes.min, 'mín', `${rotuloMin}: ${ctx.fmt(f.min)}`) : ''}
          ${marcador('at-faixa-max', f.posicoes.max, '', `${rotuloMax}: ${ctx.fmt(f.max)}`)}
          <span class="at-faixa-atual info-alvo" style="left:${pct(f.posicoes.atual ?? 0.5)}" data-tooltip="Cotação de hoje: ${esc(ctx.fmt(f.atual))}"><span class="at-faixa-atual-rotulo">${ctx.fmt(f.atual)}</span></span>
        </div>
        <div class="at-faixa-escala">
          <span><small>${rotuloMin}</small><b>${ctx.fmt(f.min)}</b></span>
          <span class="at-faixa-escala-dir"><small>${temTeto ? 'Preço-teto' : rotuloMax}</small><b>${ctx.fmt(temTeto ? f.teto : f.max)}</b></span>
        </div>
      </div>
      <p class="at-faixa-texto">${frase}</p>
      <dl class="at-mini">
        <div><dt>${rotuloMax}</dt><dd>${ctx.fmt(f.max)}</dd></div>
        <div><dt>Seu preço médio</dt><dd>${ctx.fmt(f.precoMedio)}</dd></div>
        <div><dt>Acima do mínimo</dt><dd>${formatPercentFromFraction(f.distanciaMinimo, 1)}</dd></div>
      </dl>
      <p class="hint at-fonte">${fonteTexto} O preço-teto e o viés vêm de Distribuições e Metas.</p>
    </section>`;
}

// ---------------------------------------------------------------------------
// Indicadores (renda variável) / Características (renda fixa)
// ---------------------------------------------------------------------------

const AJUDA = {
  dy: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pela cotação atual.',
  pl: 'Preço/Lucro: cotação dividida pelo lucro por ação dos últimos 12 meses - quantos anos de lucro pagam o preço.',
  pvp: 'Preço/Valor Patrimonial: cotação dividida pelo patrimônio por ação/cota. Abaixo de 1, o mercado paga menos que o valor contábil.',
  descontoPvp: 'Com desconto quando o P/VP é menor que 1; caro quando é maior ou igual a 1 (Distribuições e Metas).',
  descontoPl: 'Com desconto quando o retorno do lucro (1 ÷ P/L) fica acima da taxa de renda fixa atual (Distribuições e Metas).',
  liquidez: 'Volume médio negociado por dia na bolsa.',
  caixa: 'Parte do patrimônio do fundo que está em caixa, ainda não aplicada em imóveis ou papéis.',
  patrimonio: 'Patrimônio líquido do fundo.',
  yoc: 'Yield on cost: proventos dos últimos 12 meses sobre o valor que você aplicou (não sobre a cotação de hoje).',
};

function indicadorHtml(label, valor, { ajuda = '', sub = '', texto = false } = {}) {
  return `<div class="at-ind"><span class="at-ind-label">${label}${botaoInfoHtml(ajuda, { pequeno: true })}</span><span class="at-ind-valor${texto ? ' texto' : ''}">${valor}</span>${sub ? `<span class="at-ind-sub">${sub}</span>` : ''}</div>`;
}

export function indicadoresHtml(ctx) {
  const a = ctx.ativo;
  if (!a) return '';
  const n = (v, d = 2) => (typeof v === 'number' ? formatNumeroBR(v, d) : '—');
  let itens;
  let titulo = 'Indicadores';
  if (ctx.ehRf) {
    titulo = 'Características';
    const ir = a.irSeResgatasseHoje;
    itens = [
      indicadorHtml('Tipo', esc(a.tipoInvestimento || '—'), { texto: true }),
      indicadorHtml('Indexador', esc(a.indexador || '—')),
      indicadorHtml('Rentab. contratada', esc((a.rentabilidadeContratada && a.rentabilidadeContratada.texto) || '—')),
      indicadorHtml('Vencimento', esc(a.vencimento || '—')),
      indicadorHtml('Instituição', esc(a.instituicao || '—'), { texto: true }),
      indicadorHtml('Quantidade', n(a.quantidade, 2)),
      indicadorHtml('IR se resgatasse hoje', ir ? formatBRL(ir.impostoSeResgatasseHoje) : '—', { sub: ir && ir.detalhes ? esc(typeof ir.detalhes === 'string' ? ir.detalhes : '') : '' }),
      indicadorHtml('Carteira', a.tipoCarteira === 'emergencial' ? 'Reserva de emergência' : 'Longo prazo', { texto: true }),
    ];
  } else {
    itens = [
      indicadorHtml('DY 12 meses', formatPercentFromFraction(a.dyPercentual).replace('+', ''), { ajuda: AJUDA.dy, sub: typeof a.dyValor === 'number' ? `${ctx.fmt(a.dyValor)} por ${ctx.classe === 'fiis' ? 'cota' : 'ação'}` : '' }),
      indicadorHtml('Yield on cost', formatPercentFromFraction(ctx.proventos.yieldOnCost12).replace('+', ''), { ajuda: AJUDA.yoc }),
      indicadorHtml('P/VP', n(a.pvp), { ajuda: AJUDA.pvp, sub: a.descontoPvp ? esc(a.descontoPvp) : '' }),
    ];
    if (ctx.classe !== 'fiis') itens.push(indicadorHtml('P/L', n(a.pl), { ajuda: AJUDA.pl, sub: a.descontoPl ? esc(a.descontoPl) : '' }));
    if (ctx.classe === 'fiis') {
      itens.push(
        indicadorHtml('Liquidez diária', typeof a.liquidezDiaria === 'number' ? formatBRLCompacto(a.liquidezDiaria) : '—', { ajuda: AJUDA.liquidez }),
        indicadorHtml('Em caixa', typeof a.percentualEmCaixa === 'number' ? formatPercentFromFraction(a.percentualEmCaixa, 1).replace('+', '') : '—', { ajuda: AJUDA.caixa }),
        indicadorHtml('Patrimônio do fundo', typeof a.patrimonio === 'number' ? formatBRLCompacto(a.patrimonio) : '—', { ajuda: AJUDA.patrimonio }),
      );
    }
    itens.push(indicadorHtml('Preço-teto', valorComBrl(ctx, a.precoTeto)));
  }
  return `
    <section class="at-card" id="at-indicadores" aria-labelledby="at-ind-titulo">
      <div class="at-card-titulo"><h2 id="at-ind-titulo">${titulo}</h2></div>
      <div class="at-ind-grade">${itens.join('')}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Gráficos (mesmo motor das Carteiras)
// ---------------------------------------------------------------------------

function graficosHtml(ctx) {
  const titulo2 = ctx.ehRf ? 'Valor aplicado × saldo bruto' : 'Valor aplicado × saldo';
  return `
    <section class="at-bloco" id="at-graficos">
      <div class="area-header"><h2>Rentabilidade</h2><span class="hint">com proventos, descontando aportes e vendas${ctx.emDolar ? ' · em reais' : ''}</span></div>
      <div class="filter-tabs" id="atPeriodoTabs" style="margin-bottom:12px">
        <button class="filter-tab active" type="button" data-periodo="mes">Mês atual</button>
        <button class="filter-tab" type="button" data-periodo="30d">30 dias</button>
        <button class="filter-tab" type="button" data-periodo="6m">6 meses</button>
        <button class="filter-tab" type="button" data-periodo="12m">12 meses</button>
        <button class="filter-tab" type="button" data-periodo="3a">3 anos</button>
        <button class="filter-tab" type="button" data-periodo="tudo">Desde o início</button>
      </div>
      <div class="cg-chart-card">
        <div class="rentab-card-info" id="atRentabInfo"></div>
        <div id="atRentabChart"></div>
        <div class="chart-legend2" id="atRentabLegenda"></div>
      </div>
      <div class="area-header" style="margin-top:22px"><h2>${titulo2}</h2></div>
      <div class="cg-chart-card">
        <div class="rentab-card-info" id="atEvolucaoInfo"></div>
        <div id="atEvolucaoChart"></div>
        <div class="chart-legend2" id="atEvolucaoLegenda"></div>
      </div>
    </section>`;
}

function ligarGraficos(doc, ctx) {
  const tabs = doc.getElementById('atPeriodoTabs');
  if (!tabs) return;
  if (ctx.historico.length < 2) {
    const aviso = '<p class="hint">Ainda não há histórico suficiente deste ativo pra desenhar o gráfico.</p>';
    doc.getElementById('atRentabChart').innerHTML = aviso;
    doc.getElementById('atEvolucaoChart').innerHTML = aviso;
    return;
  }
  wireGraficosClasseCarteiras(doc, {
    historico: ctx.historico,
    periodoTabsContainer: tabs,
    paineis: [{
      visaoId: ctx.cfg.visao,
      camposProventos: ctx.ehRf ? null : ['proventosAtivo'],
      rentabInfoContainer: doc.getElementById('atRentabInfo'),
      rentabChartContainer: doc.getElementById('atRentabChart'),
      rentabLegendaContainer: doc.getElementById('atRentabLegenda'),
      labelRentabilidade: ctx.ehRf ? 'Título' : ctx.ticker,
      evolucaoInfoContainer: doc.getElementById('atEvolucaoInfo'),
      evolucaoChartContainer: doc.getElementById('atEvolucaoChart'),
      evolucaoLegendaContainer: doc.getElementById('atEvolucaoLegenda'),
      labelInfoEvolucao: ctx.ehRf ? 'Saldo bruto' : `Saldo em ${ctx.ticker}${ctx.emDolar ? ' (em reais)' : ''}`,
      labelValor: ctx.ehRf ? 'Saldo bruto' : 'Saldo',
      corToken: ctx.cfg.token,
    }],
  });
}

// ---------------------------------------------------------------------------
// Histórico mês a mês
// ---------------------------------------------------------------------------

const MENSAL_INICIAL = 12;

export function mensalHtml(ctx, { todos = false } = {}) {
  const linhas = todos ? ctx.mensal : ctx.mensal.slice(0, MENSAL_INICIAL);
  const idx = ctx.cfg.indice;
  const comQtd = !ctx.ehRf;
  const comProventos = !ctx.ehRf;
  const pct = (v) => (typeof v === 'number' ? `<span class="${cor(v)}">${formatPercentFromPoints(v)}</span>` : '—');
  const corpo = linhas.map((m) => `
    <tr>
      <td class="cc-td-esquerda cc-td-topo" data-label="Mês"><b>${rotuloMes(m.mes)}</b></td>
      <td data-label="Saldo">${formatBRL(m.saldo)}</td>
      ${comQtd ? `<td data-label="Qtd">${m.cotas != null ? formatNumeroBR(m.cotas, Number.isInteger(m.cotas) ? 0 : 3) : '—'}</td>` : ''}
      <td data-label="Rentab. no mês">${pct(m.rentabilidade)}</td>
      <td data-label="${idx.label}">${pct(m.indice)}</td>
      <td data-label="CDI">${pct(m.cdi)}</td>
      <td data-label="% patrimônio">${m.percentualCarteira != null ? formatPercentFromFraction(m.percentualCarteira, 1).replace('+', '') : '—'}</td>
      ${comProventos ? `<td data-label="Proventos">${m.proventos ? formatBRL(m.proventos) : '—'}</td>` : ''}
      <td data-label="Aplicado">${formatBRL(m.aplicado)}</td>
    </tr>`).join('');
  const mais = ctx.mensal.length > MENSAL_INICIAL
    ? `<button class="at-mais" type="button" data-acao="mensal-todos">${todos ? 'Mostrar só os últimos 12 meses' : `Ver os ${ctx.mensal.length} meses`}</button>` : '';
  return `
    <div class="area-header"><h2>Mês a mês</h2><span class="hint">saldo no fim do mês, em reais</span></div>
    ${ctx.mensal.length ? `<div class="cc-tabela-card"><div class="cc-tabela-wrap"><table class="cc-tabela at-tabela at-tabela-mensal">
      <thead><tr><th>Mês</th><th>Saldo</th>${comQtd ? '<th>Qtd</th>' : ''}<th>Rentab.</th><th>${idx.label}</th><th>CDI</th><th>% patrim.</th>${comProventos ? '<th>Proventos</th>' : ''}<th>Aplicado</th></tr></thead>
      <tbody>${corpo}</tbody></table></div>${mais}</div>` : '<p class="hint">Sem histórico ainda.</p>'}`;
}

// ---------------------------------------------------------------------------
// Proventos
// ---------------------------------------------------------------------------

/** Barras dos últimos 24 meses (1 série, cor da classe), com dica ao passar o dedo/mouse. */
export function barrasProventosSvg(ctx, largura = 640) {
  const meses = ctx.proventos.porMes;
  const max = Math.max(...meses.map((m) => m.valor), 0);
  if (!(max > 0)) return '<p class="hint">Nenhum provento nos últimos 24 meses.</p>';
  const W = Math.max(largura, 280), H = 150, padL = 8, padR = 8, padT = 18, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const passo = plotW / meses.length;
  const larg = Math.min(Math.max(passo - 2, 2), 18); // barra fina, sempre com respiro entre elas
  const barras = meses.map((m, i) => {
    const h = m.valor > 0 ? Math.max((m.valor / max) * plotH, 2) : 0;
    const x = padL + i * passo + (passo - larg) / 2;
    const y = padT + plotH - h;
    const raio = Math.min(4, larg / 2, h);
    // topo arredondado (4px), base reta no eixo
    const d = h > 0 ? `M${x.toFixed(1)},${(padT + plotH).toFixed(1)} V${(y + raio).toFixed(1)} Q${x.toFixed(1)},${y.toFixed(1)} ${(x + raio).toFixed(1)},${y.toFixed(1)} H${(x + larg - raio).toFixed(1)} Q${(x + larg).toFixed(1)},${y.toFixed(1)} ${(x + larg).toFixed(1)},${(y + raio).toFixed(1)} V${(padT + plotH).toFixed(1)} Z` : '';
    const dica = `${rotuloMes(m.mes)}: ${m.valor ? formatBRL(m.valor) : 'sem proventos'}${m.tipos.length ? ` (${m.tipos.join(', ')})` : ''}`;
    return `<g class="at-barra info-alvo" data-tooltip="${esc(dica)}">
      <rect x="${(padL + i * passo).toFixed(1)}" y="${padT}" width="${passo.toFixed(1)}" height="${plotH}" fill="transparent"/>
      ${d ? `<path d="${d}" fill="var(${ctx.cfg.token})"/>` : ''}
    </g>`;
  }).join('');
  // rótulos: jan de cada ano + o 1º e o último mês (sem encavalar num janeiro vizinho)
  const perto = (i) => meses.some((m, j) => m.mes.endsWith('-01') && j !== i && Math.abs(j - i) < 4);
  const rotulos = meses.map((m, i) => {
    const eJan = m.mes.endsWith('-01');
    const ponta = i === 0 || i === meses.length - 1;
    if (!eJan && !(ponta && !perto(i))) return '';
    const x = padL + i * passo + passo / 2;
    return `<text class="axislabel" x="${x.toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : (i === meses.length - 1 ? 'end' : 'middle')}">${rotuloMes(m.mes)}</text>`;
  }).join('');
  const iMax = meses.findIndex((m) => m.valor === max);
  const xMax = padL + iMax * passo + passo / 2;
  const rotuloMax = `<text class="axislabel at-barra-max" x="${Math.min(Math.max(xMax, 30), W - 30).toFixed(1)}" y="${(padT - 5).toFixed(1)}" text-anchor="middle">${formatBRL(max)}</text>`;
  return `<svg class="at-barras" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Proventos por mês nos últimos 24 meses">
    <line class="gridline" x1="${padL}" x2="${W - padR}" y1="${padT + plotH}" y2="${padT + plotH}"/>
    ${barras}${rotulos}${rotuloMax}
  </svg>`;
}

export function proventosHtml(ctx) {
  if (ctx.ehRf) return '';
  const pr = ctx.proventos;
  const aReceber = pr.aReceber.length ? `
    <div class="at-sub-titulo">A receber</div>
    <ul class="at-lista-receber">${pr.aReceber.map((p) => `
      <li><span class="at-receber-data">${p.dataPagamento ? formatDateBR(p.dataPagamento) : 'a definir'}</span>
        <span class="at-receber-tipo">${esc(p.tipo)}${p.fonte && p.fonte !== 'Planilha' ? ` <small>${esc(p.fonte)}</small>` : ''}</span>
        <b>${formatBRL(p.valor)}</b></li>`).join('')}
    </ul>` : '';
  const porAno = pr.porAno.length ? `<div class="at-anos">${pr.porAno.slice(-6).map((a) => `<span><small>${a.ano}</small><b>${formatBRL(a.valor)}</b></span>`).join('')}</div>` : '';
  return `
    <section class="at-bloco" id="at-proventos">
      <div class="area-header"><h2>Proventos</h2><span class="hint">líquidos, em reais${ctx.emDolar ? ' (câmbio do dia do pagamento)' : ''}</span></div>
      <div class="at-card">
        <div class="at-prov-stats">
          ${indicadorHtml('Recebidos no total', formatBRL(pr.total), { sub: pr.primeiroPagamento ? `desde ${formatDateBR(pr.primeiroPagamento)}` : '' })}
          ${indicadorHtml('Últimos 12 meses', formatBRL(pr.ultimos12), { sub: `média de ${formatBRL(pr.mediaMensal12)}/mês` })}
          ${indicadorHtml('Neste mês', formatBRL(pr.mesAtual), { sub: pr.totalAReceber ? `+ ${formatBRL(pr.totalAReceber)} a receber` : '' })}
          ${indicadorHtml('Yield on cost', formatPercentFromFraction(pr.yieldOnCost12).replace('+', ''), { ajuda: AJUDA.yoc })}
        </div>
        <div class="at-sub-titulo">Por mês · últimos 24 meses</div>
        <div id="atBarrasProventos" class="at-barras-wrap">${barrasProventosSvg(ctx)}</div>
        ${porAno}
        ${aReceber}
        <p class="hint at-fonte">Cada pagamento está no extrato abaixo.</p>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Extrato
// ---------------------------------------------------------------------------

const EXTRATO_INICIAL = 15;

export function extratoLinhasHtml(ctx, filtro = 'todos', { todos = false } = {}) {
  const itens = ctx.extrato.filter((e) => filtro === 'todos' || e.grupo === filtro);
  const exibidos = todos ? itens : itens.slice(0, EXTRATO_INICIAL);
  const fmtItem = (e, v) => (e.moeda === 'USD' ? formatUSD(v) : formatBRL(v));
  const linhas = exibidos.map((e) => {
    const pill = e.grupo === 'provento' ? 'prov' : (e.entrada ? 'entrada' : 'saida');
    const brl = e.moeda === 'USD' && typeof e.totalBrl === 'number' ? `<span class="cc-sub">${formatBRL(e.totalBrl)}</span>` : '';
    const lucro = typeof e.lucro === 'number' && !e.entrada ? `<span class="cc-sub ${cor(e.lucro)}">${e.lucro >= 0 ? 'lucro' : 'prejuízo'} ${fmtItem(e, Math.abs(e.lucro))}</span>` : '';
    return `<tr>
      <td class="cc-td-esquerda cc-td-topo" data-label="Data"><b>${formatDateBR(e.data)}</b>${e.dataCom ? `<span class="cc-sub">data com ${formatDateBR(e.dataCom)}</span>` : ''}</td>
      <td data-label="Tipo"><span class="at-pill ${pill}">${esc(e.tipo)}</span></td>
      <td data-label="Quantidade">${e.quantidade != null ? formatNumeroBR(e.quantidade, Number.isInteger(e.quantidade) ? 0 : 4) : '—'}</td>
      <td data-label="${e.grupo === 'provento' ? 'Por cota' : 'Preço'}">${e.preco != null ? (e.grupo === 'provento' ? (e.moeda === 'USD' ? `US$ ${formatNumeroBR(e.preco, 4)}` : `R$ ${formatNumeroBR(e.preco, 4)}`) : fmtItem(e, e.preco)) : '—'}</td>
      <td data-label="Total">${fmtItem(e, e.total)}${brl}${lucro}</td>
    </tr>`;
  }).join('');
  const mais = itens.length > EXTRATO_INICIAL
    ? `<button class="at-mais" type="button" data-acao="extrato-todos">${todos ? 'Mostrar menos' : `Ver tudo (${itens.length})`}</button>` : '';
  return itens.length
    ? `<div class="cc-tabela-wrap"><table class="cc-tabela at-tabela"><thead><tr><th>Data</th><th>Tipo</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead><tbody>${linhas}</tbody></table></div>${mais}`
    : '<p class="hint">Nada por aqui.</p>';
}

function extratoHtml(ctx) {
  const temProv = ctx.extrato.some((e) => e.grupo === 'provento');
  const filtros = temProv ? `
    <div class="filter-tabs at-extrato-filtros" id="atExtratoFiltros">
      <button class="filter-tab active" type="button" data-filtro="todos">Tudo</button>
      <button class="filter-tab" type="button" data-filtro="movimentacao">${ctx.ehRf ? 'Aplicações e resgates' : 'Compras e vendas'}</button>
      <button class="filter-tab" type="button" data-filtro="provento">${ctx.ehRf ? 'Juros' : 'Proventos'}</button>
    </div>` : '';
  return `
    <section class="at-bloco" id="at-extrato">
      <div class="area-header"><h2>Extrato</h2><span class="hint">${ctx.extrato.length} lançamentos</span></div>
      <div class="cc-tabela-card">${filtros}<div id="atExtratoTabela">${extratoLinhasHtml(ctx)}</div></div>
    </section>`;
}

function ligarExtratoEMensal(doc, ctx) {
  const estado = { filtro: 'todos', todos: false, mensalTodos: false };
  const tabela = doc.getElementById('atExtratoTabela');
  const filtros = doc.getElementById('atExtratoFiltros');
  const redesenhar = () => { if (tabela) tabela.innerHTML = extratoLinhasHtml(ctx, estado.filtro, { todos: estado.todos }); };
  if (filtros) {
    filtros.querySelectorAll('.filter-tab').forEach((b) => b.addEventListener('click', () => {
      filtros.querySelectorAll('.filter-tab').forEach((x) => x.classList.toggle('active', x === b));
      estado.filtro = b.dataset.filtro; estado.todos = false; redesenhar();
    }));
  }
  if (tabela) tabela.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('[data-acao="extrato-todos"]')) { estado.todos = !estado.todos; redesenhar(); }
  });
  const mensal = doc.getElementById('at-mensal');
  if (mensal) mensal.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('[data-acao="mensal-todos"]')) {
      estado.mensalTodos = !estado.mensalTodos;
      mensal.innerHTML = mensalHtml(ctx, { todos: estado.mensalTodos });
    }
  });
}

// ---------------------------------------------------------------------------
// Tese (Google Drive privado) e notícias - chegam depois
// ---------------------------------------------------------------------------

export function teseHtml(ctx, resposta) {
  if (ctx.ehRf) return '';
  if (!resposta) return '<div class="at-carregando"><span class="skel" style="height:90px;border-radius:12px"></span></div>';
  if (!resposta.ok) return `<p class="hint">Não deu pra buscar as teses agora (${esc(resposta.erro || resposta.etapa || 'erro')}).</p>`;
  if (!resposta.configurado) {
    return `<p class="hint">As teses ficam no seu Google Drive (privado). Suba a pasta <b>documents/teses</b> pro Drive e rode <code>configurarPastaTesesDireto()</code> uma vez no editor do Apps Script.</p>`;
  }
  const teses = ordenarTeses(resposta.teses);
  const resumos = [...(resposta.resumos || [])].sort((a, b) => ((b.dataPublicacao || '') < (a.dataPublicacao || '') ? -1 : 1));
  const r = resumos[0];
  const lista = (itens) => `<ul>${(itens || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const seuTeto = ctx.ativo && typeof ctx.ativo.precoTeto === 'number' ? ctx.ativo.precoTeto : null;
  const fmtTeto = (v, moeda) => (moeda === 'USD' ? formatUSD(v) : formatBRL(v));
  const resumoHtml = r ? `
    <div class="at-tese-topo">
      ${r.recomendacao ? `<span class="status-pill ${/compra/i.test(r.recomendacao) ? 'good' : (/aguard|manter|neutr/i.test(r.recomendacao) ? 'warn' : '')}">${esc(r.recomendacao)}</span>` : ''}
      ${typeof r.precoTeto === 'number' ? `<span class="at-tese-teto">Teto da Suno <b>${fmtTeto(r.precoTeto, r.moeda)}</b>${seuTeto != null ? ` · o seu: <b>${ctx.fmt(seuTeto)}</b>` : ''}</span>` : ''}
      ${r.dataPublicacao ? `<span class="hint">publicada em ${formatDateBR(r.dataPublicacao)}</span>` : ''}
    </div>
    ${r.resumo ? `<p class="at-tese-resumo">${esc(r.resumo)}</p>` : ''}
    <div class="at-tese-colunas">
      ${(r.pontosFortes || []).length ? `<div><div class="at-sub-titulo good">Pontos fortes</div>${lista(r.pontosFortes)}</div>` : ''}
      ${(r.riscos || []).length ? `<div><div class="at-sub-titulo bad">Riscos</div>${lista(r.riscos)}</div>` : ''}
    </div>
    ${r.ultimosResultados ? `<div class="at-sub-titulo">Últimos resultados</div><p class="at-tese-resumo">${esc(r.ultimosResultados)}</p>` : ''}
    <p class="hint at-fonte">Resumo feito a partir da tese da Suno Research - leia o PDF completo pra decidir.</p>` : '<p class="hint">Ainda não há resumo desta tese.</p>';
  const pdfs = teses.length ? `
    <div class="at-sub-titulo">Relatórios (PDF)</div>
    <ul class="at-teses">${teses.map((t, i) => `
      <li>
        <span><b>${t.data ? formatDateBR(t.data) : esc(t.nome)}</b>${t.maisRecente ? ' <span class="at-chip">mais recente</span>' : ''}</span>
        <span class="at-teses-acoes">
          <button class="at-link" type="button" data-acao="tese-ler" data-indice="${i}" aria-expanded="false">Ler aqui</button>
          ${urlSegura(t.abrir) ? `<a class="at-link" href="${urlSegura(t.abrir)}" target="_blank" rel="noopener">Abrir no Drive ↗</a>` : ''}
        </span>
        <div class="at-tese-pdf" hidden data-src="${urlSegura(t.preview) || ''}"></div>
      </li>`).join('')}
    </ul>` : '<p class="hint">Nenhum PDF desta tese no Drive ainda.</p>';
  return `${resumoHtml}${pdfs}`;
}

function ligarTese(container) {
  if (!container || container._teseLigada) return;
  container._teseLigada = true;
  container.addEventListener('click', (ev) => {
    const botao = ev.target.closest && ev.target.closest('[data-acao="tese-ler"]');
    if (!botao) return;
    const item = botao.closest('li');
    const alvo = item && item.querySelector('.at-tese-pdf');
    if (!alvo) return;
    const abrir = alvo.hidden;
    alvo.hidden = !abrir;
    botao.setAttribute('aria-expanded', String(abrir));
    botao.textContent = abrir ? 'Fechar' : 'Ler aqui';
    if (abrir && !alvo.firstChild && /^https:\/\/drive\.google\.com\//.test(alvo.dataset.src || '')) {
      const iframe = alvo.ownerDocument.createElement('iframe');
      iframe.src = alvo.dataset.src;
      iframe.title = 'Tese em PDF';
      iframe.loading = 'lazy';
      alvo.appendChild(iframe);
    }
  });
}

export function noticiasHtml(resposta, agora = new Date()) {
  if (!resposta) return '<div class="at-carregando"><span class="skel" style="height:16px"></span><span class="skel" style="height:16px;width:80%"></span><span class="skel" style="height:16px;width:65%"></span></div>';
  if (!resposta.ok) return `<p class="hint">Não deu pra buscar as notícias agora (${esc(resposta.erro || resposta.etapa || 'erro')}).</p>`;
  const itens = (resposta.noticias || []).filter((n) => urlSegura(n.link));
  if (!itens.length) return '<p class="hint">Nenhuma notícia nos últimos 60 dias.</p>';
  return `<ul class="at-noticias">${itens.map((n) => `
    <li><a href="${urlSegura(n.link)}" target="_blank" rel="noopener">${esc(n.titulo)}</a>
      <span class="at-noticia-meta">${n.fonte ? `${esc(n.fonte)} · ` : ''}${n.data ? `${formatRelativeTime(n.data, agora)} · ${formatDateBR(n.data)}` : ''}</span></li>`).join('')}
  </ul><p class="hint at-fonte">Via Google Notícias, atualizado a cada 2 horas.</p>`;
}

// ---------------------------------------------------------------------------
// Sobre + Imposto de renda (estáticos)
// ---------------------------------------------------------------------------

const CAMPOS_SOBRE = {
  acoes: [['setor', 'Setor'], ['subsetor', 'Subsetor'], ['listagem', 'Segmento de listagem'], ['tipoAcao', 'Tipo de ação'], ['cnpj', 'CNPJ'], ['fundacao', 'Fundação'], ['sede', 'Sede']],
  fiis: [['tipo', 'Tipo'], ['segmento', 'Segmento'], ['mandato', 'Mandato'], ['gestao', 'Gestão'], ['gestor', 'Gestor'], ['administrador', 'Administrador'], ['taxaAdministracao', 'Taxa de administração'], ['publicoAlvo', 'Público-alvo'], ['cnpj', 'CNPJ'], ['inicio', 'Início']],
  acoesEua: [['setor', 'Setor'], ['industria', 'Indústria'], ['bolsa', 'Bolsa'], ['tipo', 'Tipo'], ['pais', 'País'], ['sede', 'Sede'], ['fundacao', 'Fundação'], ['moedaDividendos', 'Moeda dos dividendos'], ['retencaoDividendosBrasileiro', 'Imposto retido nos dividendos']],
};

export function sobreHtml(ctx) {
  const s = ctx.sobre;
  if (!s) return '';
  const campos = (CAMPOS_SOBRE[ctx.classe] || []).filter(([c]) => s[c]).map(([c, rotulo]) => `<div><dt>${rotulo}</dt><dd>${esc(s[c])}</dd></div>`).join('');
  const links = [['site', 'Site'], ['ri', 'Relações com investidores']].filter(([c]) => urlSegura(s[c]))
    .map(([c, rotulo]) => `<a class="at-link" href="${urlSegura(s[c])}" target="_blank" rel="noopener">${rotulo} ↗</a>`).join('');
  return `
    <section class="at-card" id="at-sobre" aria-labelledby="at-sobre-titulo">
      <div class="at-card-titulo"><h2 id="at-sobre-titulo">Sobre</h2></div>
      ${s.nome ? `<p class="at-sobre-nome">${esc(s.nome)}</p>` : ''}
      ${s.descricao ? `<p class="at-sobre-desc">${esc(s.descricao)}</p>` : ''}
      ${campos ? `<dl class="at-dl">${campos}</dl>` : ''}
      ${links ? `<div class="at-links">${links}</div>` : ''}
    </section>`;
}

export function irHtml(ctx) {
  const ir = ctx.ir;
  if (!ir || !ir.classe) return '';
  const regra = (r) => `<li><b>${esc(r.titulo)}</b><p>${esc(r.texto)}</p>${urlSegura(r.fonte) ? `<a class="at-fonte-link" href="${urlSegura(r.fonte)}" target="_blank" rel="noopener">fonte ↗</a>` : ''}</li>`;
  const bloco = (titulo, itens, aberto = false) => (itens.length ? `
    <details class="at-ir-bloco"${aberto ? ' open' : ''}><summary>${titulo}</summary><ul class="at-regras">${itens.map(regra).join('')}</ul></details>` : '');
  const onde = ir.ondeBaixar.length ? `
    <details class="at-ir-bloco" open><summary>Onde baixar os informes</summary>
      <ul class="at-onde">${ir.ondeBaixar.map((o) => `<li>${urlSegura(o.url) ? `<a href="${urlSegura(o.url)}" target="_blank" rel="noopener">${esc(o.nome)} ↗</a>` : `<b>${esc(o.nome)}</b>`}<p>${esc(o.oQue)}</p></li>`).join('')}</ul>
    </details>` : '';
  return `
    <section class="at-bloco" id="at-ir">
      <div class="area-header"><h2>Imposto de renda</h2><span class="hint">${esc(ir.classe.titulo)}</span></div>
      <div class="at-card">
        ${onde}
        ${bloco('Regras da classe', ir.classe.regras || [], true)}
        ${bloco('Proventos', ir.proventos)}
        ${bloco('DARF', ir.darf)}
        ${bloco('Declaração anual', ir.declaracao)}
        ${ir.avisos.length ? `<div class="at-ir-avisos">${ir.avisos.map((a) => `<p>${esc(a)}</p>`).join('')}</div>` : ''}
        <p class="hint at-fonte">${esc(ir.aviso || '')}${ir.atualizadoEm ? ` Atualizado em ${esc(textoMesAno(ir.atualizadoEm))}.` : ''}</p>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export function paginaHtml(ctx) {
  const lateral = ctx.ehRf ? `
      ${indicadoresHtml(ctx)}
      ${ctx.sobre ? sobreHtml(ctx) : ''}` : `
      ${faixaHtml(ctx)}
      ${indicadoresHtml(ctx)}
      <section class="at-card" id="at-tese" aria-labelledby="at-tese-titulo">
        <div class="at-card-titulo"><h2 id="at-tese-titulo">Tese de investimento</h2><span class="hint">Suno Research</span></div>
        <div id="atTeseConteudo">${teseHtml(ctx, null)}</div>
      </section>
      <section class="at-card" id="at-noticias" aria-labelledby="at-noticias-titulo">
        <div class="at-card-titulo"><h2 id="at-noticias-titulo">Notícias</h2></div>
        <div id="atNoticiasConteudo">${noticiasHtml(null)}</div>
      </section>
      ${sobreHtml(ctx)}`;
  return `
    <div class="at-pagina" style="--accent:var(${ctx.cfg.token}); --accent-soft:var(${ctx.cfg.soft})">
      ${cabecalhoHtml(ctx)}
      ${navSecoesHtml(ctx)}
      <div class="at-resumo-wrap">${resumoHtml(ctx)}</div>
      <div class="at-grade">
        <div class="at-col at-col-principal">
          ${graficosHtml(ctx)}
          ${proventosHtml(ctx)}
          <section class="at-bloco" id="at-mensal">${mensalHtml(ctx)}</section>
          ${extratoHtml(ctx)}
        </div>
        <aside class="at-col at-col-lateral">${lateral}</aside>
      </div>
      ${irHtml(ctx)}
    </div>`;
}

/** Redesenha as barras de proventos na largura real do cartão (1 unidade = 1px, texto sem distorcer). */
function ligarBarras(doc, ctx) {
  const wrap = doc.getElementById('atBarrasProventos');
  if (!wrap) return;
  const redesenhar = () => {
    const w = wrap.clientWidth;
    if (w > 40) wrap.innerHTML = barrasProventosSvg(ctx, Math.round(w));
  };
  redesenhar();
  const janela = doc.defaultView;
  if (janela && !wrap._resizeLigado && typeof janela.addEventListener === 'function') {
    wrap._resizeLigado = true;
    let timer = null;
    janela.addEventListener('resize', () => { janela.clearTimeout(timer); timer = janela.setTimeout(redesenhar, 150); });
  }
}

function desenhar(doc, conteudoEl, ctx) {
  conteudoEl.innerHTML = paginaHtml(ctx);
  doc.title = `${ctx.ticker} · Patrimônio`;
  wirePointerTooltipCarteiras_(doc, conteudoEl);
  ligarBarras(doc, ctx);
  ligarGraficos(doc, ctx);
  ligarExtratoEMensal(doc, ctx);
  ligarTese(doc.getElementById('atTeseConteudo'));
}

/**
 * Monta a tela. `ref` vem do endereço (?ref=). As 3 chamadas ao Apps Script
 * saem juntas: a do ativo desenha a página; teses e notícias preenchem as
 * suas caixas quando chegarem (e são redesenhadas se a página for
 * redesenhada pelo cache/atualização).
 */
export async function montarPaginaAtivo(token, {
  doc = document,
  ref = refDaUrl(doc.location ? doc.location.href : ''),
  getAtivoImpl = getAtivo,
  getNoticiasImpl = getNoticiasAtivo,
  getTesesImpl = getTesesAtivo,
  carregarEstaticosImpl = carregarEstaticosPadrao,
  agora = () => new Date(),
} = {}) {
  const loadingEl = doc.getElementById('ativoLoading');
  const erroEl = doc.getElementById('ativoErro');
  const conteudoEl = doc.getElementById('ativoConteudo');
  const refreshEl = doc.getElementById('refreshControlAtivo');

  if (!ref) {
    loadingEl.hidden = true;
    erroEl.hidden = false;
    erroEl.innerHTML = 'Nenhum ativo informado. Abra um ativo pelas Carteiras, pela Início ou por Proventos.';
    return;
  }

  const estado = { ctx: null, teses: null, noticias: null, noticiasPedidas: false, tesesPedidas: false };
  const estaticosPromise = carregarEstaticosImpl();

  const preencherExtras = () => {
    if (!estado.ctx || estado.ctx.ehRf) return;
    const teseEl = doc.getElementById('atTeseConteudo');
    if (teseEl && estado.teses) { teseEl.innerHTML = teseHtml(estado.ctx, estado.teses); ligarTese(teseEl); }
    const notEl = doc.getElementById('atNoticiasConteudo');
    if (notEl && estado.noticias) notEl.innerHTML = noticiasHtml(estado.noticias, agora());
  };

  const pedirExtras = (resposta) => {
    if (resposta.tipo === 'rf') return;
    if (!estado.tesesPedidas) {
      estado.tesesPedidas = true;
      Promise.resolve(getTesesImpl(token, resposta.ticker)).catch((e) => ({ ok: false, erro: String(e) }))
        .then((r) => { estado.teses = r; preencherExtras(); });
    }
    if (!estado.noticiasPedidas) {
      estado.noticiasPedidas = true;
      const nome = (resposta.ativo && resposta.ativo.nome) || '';
      Promise.resolve(getNoticiasImpl(token, { ticker: resposta.ticker, nome, classe: resposta.classe })).catch((e) => ({ ok: false, erro: String(e) }))
        .then((r) => { estado.noticias = r; preencherExtras(); });
    }
  };

  const desenharResposta = async (resposta) => {
    const estaticos = await estaticosPromise;
    estado.ctx = montarContexto(resposta, estaticos || {});
    loadingEl.hidden = true;
    erroEl.hidden = true;
    conteudoEl.hidden = false;
    desenhar(doc, conteudoEl, estado.ctx);
    preencherExtras();
    pedirExtras(resposta);
  };

  const cache = await lerCacheDados(chaveCache(ref));
  if (cache && cache.dados && cache.dados.ok) await desenharResposta(cache.dados);

  async function carregarERedesenhar() {
    const resposta = await getAtivoImpl(token, ref);
    if (!resposta || !resposta.ok) {
      if (!estado.ctx) {
        loadingEl.hidden = true;
        erroEl.hidden = false;
        erroEl.textContent = `Não deu pra carregar ${ref.replace(/^rf:/, '').split('|')[0]} agora (${(resposta && resposta.etapa) || '?'}): ${(resposta && resposta.erro) || 'erro desconhecido'}.`;
      }
      return;
    }
    await desenharResposta(resposta);
    gravarCacheDados(chaveCache(ref), resposta);
  }

  await carregarERedesenhar();
  if (refreshEl) mountRefreshControl(doc, refreshEl, carregarERedesenhar).marcarAtualizado();
}

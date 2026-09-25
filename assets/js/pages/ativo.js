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
import { logoAtivoHtml, logoRendaFixaHtml, renderTabelaAtivosCarteiras, botaoInfoHtml, statusVies, wirePointerTooltipCarteiras_, wireGraficosClasseCarteiras } from './carteiras-classe-comum.js';
import {
  CLASSES_ATIVO, montarHistoricoAtivo, historicoMensal, montarExtrato, resumoProventosAtivo, faixaDePreco,
  resumoPosicao, percentualNaCarteira, informesIrDoAtivo, declaracaoIrDoAtivo, ordenarTeses, cambioMaisRecente,
  comCamposUsdAtivo, historicoAtivoTemCambioUsd,
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
    ir: informesIrDoAtivo(ir, { ticker: resposta.ticker, classe, instituicao: resposta.ativo && resposta.ativo.instituicao }),
    declaracaoIr: declaracaoIrDoAtivo(ir, {
      classe, ticker: resposta.ticker, hoje: resposta.hoje, transacoes: resposta.transacoes || [], ativo: resposta.ativo || null, historico,
      ehRf: resposta.tipo === 'rf',
      sobre: sobre && sobre.ativos ? sobre.ativos[String(resposta.ticker || '').toUpperCase()] || null : null,
    }),
    informesFundo: resposta.informesFundo || null,
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
// Links relevantes (site oficial, RI, Suno, B3) - topo da coluna lateral
// ---------------------------------------------------------------------------

// 25/09/2026 (Tiago, ponto 3): URLs da Suno (site privado dele - ele
// confirmou os padrões, não tem endpoint pra descobrir isso). Carteira
// recomendada de Ações: quase tudo é "Dividendos" - só VAMO3 e B3SA3 são
// da carteira "Valor" (confirmado por ele).
export const SUNO_CARTEIRAS_URL = {
  dividendos: 'https://investidor.suno.com.br/carteiras/dividendos',
  valor: 'https://investidor.suno.com.br/carteiras/valor',
  fiis: 'https://investidor.suno.com.br/carteiras/fiis',
  internacional: 'https://investidor.suno.com.br/carteiras/internacional',
  rendaFixa: 'https://investidor.suno.com.br/carteiras/renda-fixa',
  reservaEmergencia: 'https://investidor.suno.com.br/carteiras/reserva-de-emergencia',
};
const TICKERS_SUNO_CARTEIRA_VALOR = new Set(['VAMO3', 'B3SA3']);

// 25/09/2026 (Tiago: "remova os da b3 (nenhum funciona) e coloque o
// tradingview no lugar, e inclua o do google"): TradingView e Google
// Finance. Brasil: bolsa BMFBOVESPA / BVMF. EUA: bolsa do "Sobre"
// (ativos-sobre.json, campo bolsa: NYSE, NASDAQ, OTC).
const BOLSA_EUA = {
  NYSE: { tradingView: 'NYSE', google: 'NYSE' },
  NASDAQ: { tradingView: 'NASDAQ', google: 'NASDAQ' },
  OTC: { tradingView: 'OTC', google: 'OTCMKTS' },
};

export function tradingViewUrl(ctx) {
  const t = encodeURIComponent(String(ctx.ticker || '').toUpperCase());
  if (!t || ctx.ehRf) return null;
  if (ctx.classe === 'acoesEua') {
    const b = BOLSA_EUA[String((ctx.sobre && ctx.sobre.bolsa) || '').toUpperCase()];
    return b ? `https://www.tradingview.com/symbols/${b.tradingView}-${t}/` : `https://www.tradingview.com/symbols/${t}/`;
  }
  return `https://www.tradingview.com/symbols/BMFBOVESPA-${t}/`;
}

export function googleFinanceUrl(ctx) {
  const t = encodeURIComponent(String(ctx.ticker || '').toUpperCase());
  if (!t || ctx.ehRf) return null;
  if (ctx.classe === 'acoesEua') {
    const b = BOLSA_EUA[String((ctx.sobre && ctx.sobre.bolsa) || '').toUpperCase()];
    return b ? `https://www.google.com/finance/quote/${t}:${b.google}` : `https://www.google.com/finance?q=${t}`;
  }
  return `https://www.google.com/finance/quote/${t}:BVMF`;
}

/** "https://investidor.suno.com.br/acoes/WIZC3" / ".../fiis/PMLL11" - sem padrão pra EUA/RF. */
function sunoDetalheAtivoUrl_(ctx) {
  if (ctx.classe === 'acoes') return `https://investidor.suno.com.br/acoes/${encodeURIComponent(ctx.ticker)}`;
  if (ctx.classe === 'fiis') return `https://investidor.suno.com.br/fiis/${encodeURIComponent(ctx.ticker)}`;
  return null;
}

/** Carteira recomendada da Suno em que o ativo está (Dividendos/Valor,
 * FIIs, Internacional, Renda Fixa/Reserva de emergência). */
function sunoCarteiraUrl_(ctx) {
  if (ctx.classe === 'acoes') return TICKERS_SUNO_CARTEIRA_VALOR.has(ctx.ticker) ? SUNO_CARTEIRAS_URL.valor : SUNO_CARTEIRAS_URL.dividendos;
  if (ctx.classe === 'fiis') return SUNO_CARTEIRAS_URL.fiis;
  if (ctx.classe === 'acoesEua') return SUNO_CARTEIRAS_URL.internacional;
  if (ctx.ehRf) return (ctx.ativo && ctx.ativo.tipoCarteira === 'emergencial') ? SUNO_CARTEIRAS_URL.reservaEmergencia : SUNO_CARTEIRAS_URL.rendaFixa;
  return null;
}

function linkRelevanteHtml_(rotulo, url) {
  return url ? `<a class="at-link-relevante" href="${urlSegura(url) || esc(url)}" target="_blank" rel="noopener">${rotulo} ↗</a>` : '';
}

export function linksRelevantesHtml(ctx) {
  const s = ctx.sobre;
  const itens = [
    linkRelevanteHtml_('Site oficial', s ? urlSegura(s.site) : null),
    linkRelevanteHtml_('Relação com investidores', s ? urlSegura(s.ri) : null),
    linkRelevanteHtml_('Carteira recomendada (Suno)', sunoCarteiraUrl_(ctx)),
    linkRelevanteHtml_('Detalhes do ativo (Suno)', sunoDetalheAtivoUrl_(ctx)),
    linkRelevanteHtml_('TradingView', tradingViewUrl(ctx)),
    linkRelevanteHtml_('Google Finance', googleFinanceUrl(ctx)),
  ].filter(Boolean);
  if (!itens.length) return '';
  return `
    <section class="at-card at-links-relevantes" id="at-links" aria-labelledby="at-links-titulo">
      <div class="at-card-titulo"><h2 id="at-links-titulo">Links relevantes</h2></div>
      <div class="at-links-grade">${itens.join('')}</div>
    </section>`;
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
          <span class="at-logo">${logoRendaFixaHtml(a)}</span>
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

// 25/09/2026 (Tiago: "quero reorganizar essa tela do ativo, tem muita coisa
// em um lugar só. Vamos criar um sistema de abas parecido com a de
// carteiras"): 3 abas - Visão geral (quase tudo), Extrato (mês a mês +
// extrato) e Sobre (Sobre + imposto de renda). Mesmo visual dos .side-item
// de Carteiras, em linha; a aba aberta fica no endereço (#extrato, #sobre)
// pra sobreviver ao F5 e ao redesenho do cache.
const ICONES_ABA = {
  visao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  extrato: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
  sobre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
};

/** Aba a partir do endereço ("#extrato", "#sobre"; qualquer outra coisa = visão geral). */
export function abaDoHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  return h === 'extrato' || h === 'sobre' ? h : 'visao';
}

function abasHtml(ctx, ativa) {
  const abas = [
    ['visao', 'Visão geral'],
    ['extrato', 'Extrato'],
    ['sobre', ctx.ehRf ? 'Imposto de renda' : 'Sobre e IR'],
  ];
  return `<nav class="at-abas" role="tablist" aria-label="Seções do ativo">${abas.map(([id, rotulo]) => `
    <button type="button" role="tab" class="side-item${id === ativa ? ' active' : ''}" id="at-tab-${id}" data-aba="${id}"
            aria-controls="at-aba-${id}" aria-selected="${id === ativa}">
      <span class="side-ico">${ICONES_ABA[id]}</span><span class="side-label">${rotulo}</span>
    </button>`).join('')}
  </nav>`;
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
  // 25/09/2026 (Tiago, ponto 4b): "os gráficos estão em reais, traga o
  // filtro R$/Dólar" - o toggle só faz sentido pra ações EUA (é o único
  // caso em que o histórico do ativo é convertido de moeda); ligarGraficos
  // decide se mostra (precisa de câmbio por dia no histórico).
  const toggleMoeda = ctx.classe === 'acoesEua' ? `
      <div class="filter-tabs cc-moeda-toggle" id="atMoedaToggle" role="group" aria-label="Ver valores em" hidden>
        <button class="filter-tab" type="button" data-moeda="BRL" aria-pressed="false">R$</button>
        <button class="filter-tab" type="button" data-moeda="USD" aria-pressed="false">US$</button>
      </div>` : '';
  return `
    <section class="at-bloco" id="at-graficos">
      <div class="area-header">
        <div class="at-graficos-titulo"><h2>Rentabilidade</h2><span class="hint">com proventos, descontando aportes e vendas${ctx.emDolar ? ' · em reais' : ''}</span></div>
        ${toggleMoeda}
      </div>
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

/** Chave por ticker (não por classe): cada ativo lembra sua própria escolha. */
const CHAVE_MOEDA_ATIVO_PREFIXO = 'ativo.moeda.';
function lerMoedaAtivoGuardada_(ticker) {
  try {
    const v = globalThis.localStorage && globalThis.localStorage.getItem(CHAVE_MOEDA_ATIVO_PREFIXO + ticker);
    return v === 'BRL' || v === 'USD' ? v : null;
  } catch (_) { return null; }
}
function guardarMoedaAtivo_(ticker, moeda) {
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(CHAVE_MOEDA_ATIVO_PREFIXO + ticker, moeda); } catch (_) { /* sem storage: só não lembra */ }
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
  // 25/09/2026 (Tiago, ponto 4b): "os gráficos estão em reais, traga o
  // filtro R$/Dólar" - só ações EUA (o histórico do ativo, ao contrário da
  // tabela de Carteiras, só converte pra dólar quando há câmbio por dia
  // gravado em cada ponto - ver comCamposUsdAtivo em ativo-calc.js).
  const podeAlternarMoeda = ctx.classe === 'acoesEua' && historicoAtivoTemCambioUsd(ctx.historico);
  const historicoComUsd = podeAlternarMoeda ? comCamposUsdAtivo(ctx.historico) : ctx.historico;
  const toggleEl = doc.getElementById('atMoedaToggle');

  function desenhar_(moeda) {
    const emDolar = podeAlternarMoeda && moeda === 'USD';
    wireGraficosClasseCarteiras(doc, {
      historico: historicoComUsd,
      periodoTabsContainer: tabs,
      paineis: [{
        visaoId: emDolar ? 'ativoAcoesEuaUsd' : ctx.cfg.visao,
        moeda: emDolar ? 'USD' : 'BRL',
        camposProventos: ctx.ehRf ? null : [emDolar ? 'proventosAtivoUsd' : 'proventosAtivo'],
        rentabInfoContainer: doc.getElementById('atRentabInfo'),
        rentabChartContainer: doc.getElementById('atRentabChart'),
        rentabLegendaContainer: doc.getElementById('atRentabLegenda'),
        labelRentabilidade: ctx.ehRf ? 'Título' : ctx.ticker,
        evolucaoInfoContainer: doc.getElementById('atEvolucaoInfo'),
        evolucaoChartContainer: doc.getElementById('atEvolucaoChart'),
        evolucaoLegendaContainer: doc.getElementById('atEvolucaoLegenda'),
        labelInfoEvolucao: ctx.ehRf ? 'Saldo bruto' : `Saldo em ${ctx.ticker}${emDolar ? '' : (ctx.emDolar ? ' (em reais)' : '')}`,
        labelValor: ctx.ehRf ? 'Saldo bruto' : 'Saldo',
        corToken: ctx.cfg.token,
      }],
    });
  }

  if (!toggleEl || !podeAlternarMoeda) {
    if (toggleEl) toggleEl.hidden = true;
    desenhar_('BRL');
    return;
  }

  function aplicarMoeda_(moeda) {
    toggleEl.querySelectorAll('.filter-tab').forEach((b) => {
      const ativo = b.dataset.moeda === moeda;
      b.classList.toggle('active', ativo);
      b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
    desenhar_(moeda);
  }
  toggleEl.hidden = false;
  if (!toggleEl._moedaLigada) {
    toggleEl._moedaLigada = true;
    toggleEl.querySelectorAll('.filter-tab').forEach((b) => {
      b.addEventListener('click', () => {
        guardarMoedaAtivo_(ctx.ticker, b.dataset.moeda);
        aplicarMoeda_(b.dataset.moeda);
      });
    });
  }
  // Padrão dólar (a moeda do papel, mesmo padrão de carteiras-acoes-eua.js), lembrando a escolha por ativo.
  aplicarMoeda_(lerMoedaAtivoGuardada_(ctx.ticker) || 'USD');
}

// ---------------------------------------------------------------------------
// Histórico mês a mês
// ---------------------------------------------------------------------------

const MENSAL_INICIAL = 12;

// 25/09/2026 (Tiago: "essas tabelas em extrato, deixe mais legal. Use as
// formatações das tabelas em carteira e distribuições e metas... Lembre-se de
// filtro e ordenação por coluna"): mês a mês e extrato usam a MESMA tabela
// das Carteiras (renderTabelaAtivosCarteiras: título da coluna ordena, vira
// cartão no celular, rodapé de totais), com filtro por ano (e por tipo, no
// extrato). O estado (filtro/ordem/aba do gráfico) fica por ativo, pra não
// se perder quando a página redesenha com o dado novo.
const estadoTabelasAtivo = new Map();
function estadoTabelas(ctx) {
  if (!estadoTabelasAtivo.has(ctx.ticker)) {
    estadoTabelasAtivo.set(ctx.ticker, {
      mensal: { ano: null, ordenacao: { campo: 'mes', direcao: 'desc' }, todos: false, vista: 'tabela' },
      extrato: { filtro: 'todos', ano: null, ordenacao: { campo: 'data', direcao: 'desc' }, todos: false },
    });
  }
  return estadoTabelasAtivo.get(ctx.ticker);
}

const anosDe = (lista, campo) => [...new Set(lista.map((x) => String(x[campo] || '').slice(0, 4)).filter(Boolean))].sort().reverse();

function chipsAnoHtml(anos, ativo, attr) {
  if (anos.length < 2) return '';
  return `<div class="filter-tabs at-chips-ano">
    <button type="button" class="filter-tab${ativo ? '' : ' active'}" ${attr}="">Todos os anos</button>
    ${anos.map((a) => `<button type="button" class="filter-tab${ativo === a ? ' active' : ''}" ${attr}="${a}">${a}</button>`).join('')}
  </div>`;
}

/** Ordena como renderTabelaAtivosCarteiras (pra poder cortar em N linhas ANTES de mandar pra ela). */
function ordenarLista(lista, colunas, ordenacao) {
  const col = colunas.find((c) => c.campo === ordenacao.campo && typeof c.ordenarPor === 'function');
  if (!col) return [...lista];
  return [...lista].sort((a, b) => {
    const va = col.ordenarPor(a), vb = col.ordenarPor(b);
    const cmp = (typeof va === 'string' || typeof vb === 'string') ? String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR') : (va ?? -Infinity) - (vb ?? -Infinity);
    return ordenacao.direcao === 'asc' ? cmp : -cmp;
  });
}

const pctPill = (v) => (typeof v === 'number' ? `<span class="status-pill ${v >= 0 ? 'good' : 'bad'}">${formatPercentFromPoints(v)}</span>` : '—');
const pctTexto = (v) => (typeof v === 'number' ? `<span class="${cor(v)}">${formatPercentFromPoints(v)}</span>` : '—');

export function colunasMensal(ctx) {
  const idx = ctx.cfg.indice;
  return [
    { label: 'Mês', campo: 'mes', alinharEsquerda: true, ordenarPor: (m) => m.mes, formatar: (m) => `<b>${rotuloMes(m.mes)}</b>` },
    { label: 'Saldo', campo: 'saldo', ordenarPor: (m) => m.saldo, formatar: (m) => formatBRL(m.saldo) },
    ...(ctx.ehRf ? [] : [{ label: 'Qtd', campo: 'cotas', ordenarPor: (m) => m.cotas, formatar: (m) => (m.cotas != null ? formatNumeroBR(m.cotas, Number.isInteger(m.cotas) ? 0 : 3) : '—') }]),
    {
      label: 'Rentab.', campo: 'rentabilidade', ordenarPor: (m) => m.rentabilidade,
      ajuda: `Rentabilidade do ativo no mês (já descontando compras e vendas) e a diferença pro ${idx.label}.`,
      formatar: (m) => {
        const dif = typeof m.rentabilidade === 'number' && typeof m.indice === 'number' ? m.rentabilidade - m.indice : null;
        return `${pctPill(m.rentabilidade)}${dif != null ? `<span class="cc-sub ${cor(dif)}">${dif >= 0 ? '+' : ''}${formatNumeroBR(dif, 2)} p.p. vs ${esc(idx.label)}</span>` : ''}`;
      },
    },
    { label: idx.label, campo: 'indice', ordenarPor: (m) => m.indice, formatar: (m) => pctTexto(m.indice) },
    { label: 'CDI', campo: 'cdi', ordenarPor: (m) => m.cdi, formatar: (m) => pctTexto(m.cdi) },
    { label: '% patrim.', campo: 'percentualCarteira', ordenarPor: (m) => m.percentualCarteira, formatar: (m) => (m.percentualCarteira != null ? formatPercentFromFraction(m.percentualCarteira, 1).replace('+', '') : '—') },
    ...(ctx.ehRf ? [] : [{ label: 'Proventos', campo: 'proventos', ordenarPor: (m) => m.proventos, formatar: (m) => (m.proventos ? formatBRL(m.proventos) : '—') }]),
    { label: 'Aplicado', campo: 'aplicado', ordenarPor: (m) => m.aplicado, formatar: (m) => formatBRL(m.aplicado) },
  ];
}

/** Rentabilidade composta de uma lista de meses (em pontos %). */
function compor(lista, campo) {
  const vals = lista.map((m) => m[campo]).filter((v) => typeof v === 'number');
  if (!vals.length) return null;
  return (vals.reduce((acc, v) => acc * (1 + v / 100), 1) - 1) * 100;
}

function rodapeMensalHtml(ctx, lista, ano) {
  if (!lista.length) return '';
  const partes = [
    `rentab. ${formatPercentFromPoints(compor(lista, 'rentabilidade'))}`,
    `${esc(ctx.cfg.indice.label)} ${formatPercentFromPoints(compor(lista, 'indice'))}`,
    `CDI ${formatPercentFromPoints(compor(lista, 'cdi'))}`,
    ...(ctx.ehRf ? [] : [`proventos ${formatBRL(lista.reduce((s, m) => s + (m.proventos || 0), 0))}`]),
  ];
  return `<tr><td class="cc-td-esquerda" colspan="${colunasMensal(ctx).length}"><b>${ano ? `Em ${ano}` : `Desde o início (${lista.length} meses)`}</b> · ${partes.join(' · ')}</td></tr>`;
}

/** Casca do Mês a mês: cabeçalho, alternador Tabela/Gráfico e filtro por ano (a tabela/gráfico entram em ligarExtratoEMensal). */
export function mensalHtml(ctx) {
  const st = estadoTabelas(ctx).mensal;
  if (!ctx.mensal.length) return '<div class="area-header"><h2>Mês a mês</h2></div><p class="hint">Sem histórico ainda.</p>';
  return `
    <div class="area-header at-mensal-topo"><h2>Mês a mês</h2><span class="hint">saldo no fim do mês, em reais</span>
      <div class="filter-tabs at-vista" id="atMensalVista" role="group" aria-label="Ver como">
        <button type="button" class="filter-tab${st.vista === 'tabela' ? ' active' : ''}" data-vista="tabela">Tabela</button>
        <button type="button" class="filter-tab${st.vista === 'grafico' ? ' active' : ''}" data-vista="grafico">Gráfico</button>
      </div>
    </div>
    <div class="cc-tabela-card">
      <div id="atMensalFiltros">${chipsAnoHtml(anosDe(ctx.mensal, 'mes'), st.ano, 'data-ano')}</div>
      <div id="atMensalTabela"${st.vista === 'tabela' ? '' : ' hidden'}></div>
      <div id="atMensalGrafico" class="at-mensal-grafico"${st.vista === 'grafico' ? '' : ' hidden'}></div>
    </div>`;
}

/**
 * Gráfico do mês a mês: barra = rentabilidade do ativo no mês (cor da
 * classe; abaixo da linha do zero quando negativa), ponto = o índice de
 * referência no mesmo mês. Dica por mês ao passar o mouse/dedo.
 */
export function mensalGraficoSvg(ctx, meses, largura = 640) {
  const lista = [...meses].sort((a, b) => (a.mes < b.mes ? -1 : 1)).filter((m) => typeof m.rentabilidade === 'number' || typeof m.indice === 'number');
  if (!lista.length) return '<p class="hint">Sem meses com rentabilidade calculada.</p>';
  const idx = ctx.cfg.indice;
  const valores = lista.flatMap((m) => [m.rentabilidade, m.indice]).filter((v) => typeof v === 'number');
  const max = Math.max(...valores, 0.5), min = Math.min(...valores, -0.5);
  const W = Math.max(largura, 280), H = 210, padL = 44, padR = 10, padT = 14, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const y = (v) => padT + ((max - v) / (max - min)) * plotH;
  const passo = plotW / lista.length;
  const larg = Math.min(Math.max(passo * 0.6, 2), 22);
  const zero = y(0);
  const barras = lista.map((m, i) => {
    const x = padL + i * passo + (passo - larg) / 2;
    const cx = padL + i * passo + passo / 2;
    const r = m.rentabilidade;
    let barra = '';
    if (typeof r === 'number' && r !== 0) {
      const topo = Math.min(y(r), zero), altura = Math.max(Math.abs(y(r) - zero), 1.5);
      const raio = Math.min(4, larg / 2, altura);
      // ponta arredondada do lado do valor, base reta na linha do zero
      barra = r > 0
        ? `<path d="M${x.toFixed(1)},${zero.toFixed(1)} V${(topo + raio).toFixed(1)} Q${x.toFixed(1)},${topo.toFixed(1)} ${(x + raio).toFixed(1)},${topo.toFixed(1)} H${(x + larg - raio).toFixed(1)} Q${(x + larg).toFixed(1)},${topo.toFixed(1)} ${(x + larg).toFixed(1)},${(topo + raio).toFixed(1)} V${zero.toFixed(1)} Z" fill="var(${ctx.cfg.token})"/>`
        : `<path d="M${x.toFixed(1)},${zero.toFixed(1)} V${(zero + altura - raio).toFixed(1)} Q${x.toFixed(1)},${(zero + altura).toFixed(1)} ${(x + raio).toFixed(1)},${(zero + altura).toFixed(1)} H${(x + larg - raio).toFixed(1)} Q${(x + larg).toFixed(1)},${(zero + altura).toFixed(1)} ${(x + larg).toFixed(1)},${(zero + altura - raio).toFixed(1)} V${zero.toFixed(1)} Z" fill="var(${ctx.cfg.token})" fill-opacity="0.55"/>`;
    }
    const ponto = typeof m.indice === 'number' ? `<circle cx="${cx.toFixed(1)}" cy="${y(m.indice).toFixed(1)}" r="4" class="at-mensal-indice"/>` : '';
    const dica = `${rotuloMes(m.mes)} · ${ctx.ticker}: ${typeof r === 'number' ? formatPercentFromPoints(r) : '—'} · ${idx.label}: ${typeof m.indice === 'number' ? formatPercentFromPoints(m.indice) : '—'}`;
    return `<g class="info-alvo" data-tooltip="${esc(dica)}"><rect x="${(padL + i * passo).toFixed(1)}" y="${padT}" width="${passo.toFixed(1)}" height="${plotH}" fill="transparent"/>${barra}${ponto}</g>`;
  }).join('');
  const ticks = [max, 0, min].map((v) => `<text class="axislabel" x="${padL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${formatNumeroBR(v, 1)}%</text>`).join('');
  const rotulos = lista.map((m, i) => {
    const ponta = i === 0 || i === lista.length - 1;
    const eJan = m.mes.endsWith('-01');
    const perto = lista.some((o, j) => o.mes.endsWith('-01') && j !== i && Math.abs(j - i) < 3);
    if (!eJan && !(ponta && !perto)) return '';
    return `<text class="axislabel" x="${(padL + i * passo + passo / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${rotuloMes(m.mes)}</text>`;
  }).join('');
  return `<svg class="at-barras at-mensal-svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Rentabilidade de ${esc(ctx.ticker)} mês a mês comparada ao ${esc(idx.label)}">
      <line class="gridline" x1="${padL}" x2="${W - padR}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}"/>
      ${ticks}${barras}${rotulos}
    </svg>
    <div class="chart-legend2 at-mensal-legenda">
      <span class="li"><span class="at-leg-barra" style="background:var(${ctx.cfg.token})"></span>${esc(ctx.ticker)} (rentab. no mês)</span>
      <span class="li"><span class="at-leg-ponto"></span>${esc(idx.label)}</span>
    </div>`;
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

const PILL_EXTRATO = { provento: 'good', entrada: 'info', saida: 'warn' };

export function colunasExtrato(ctx) {
  const fmtItem = (e, v) => (e.moeda === 'USD' ? formatUSD(v) : formatBRL(v));
  return [
    { label: 'Data', campo: 'data', alinharEsquerda: true, ordenarPor: (e) => e.data,
      formatar: (e) => `<b>${formatDateBR(e.data)}</b>${e.dataCom ? `<span class="cc-sub">data com ${formatDateBR(e.dataCom)}</span>` : ''}` },
    { label: 'Tipo', campo: 'tipo', ordenarPor: (e) => e.tipo,
      formatar: (e) => `<span class="status-pill ${PILL_EXTRATO[e.grupo === 'provento' ? 'provento' : (e.entrada ? 'entrada' : 'saida')]}">${esc(e.tipo)}</span>` },
    { label: 'Qtd', campo: 'quantidade', ordenarPor: (e) => e.quantidade,
      formatar: (e) => (e.quantidade != null ? formatNumeroBR(e.quantidade, Number.isInteger(e.quantidade) ? 0 : 4) : '—') },
    { label: ctx.ehRf ? 'Preço' : 'Preço / por cota', campo: 'preco', ordenarPor: (e) => e.preco,
      formatar: (e) => (e.preco != null ? (e.grupo === 'provento' ? `${e.moeda === 'USD' ? 'US$' : 'R$'} ${formatNumeroBR(e.preco, 4)}` : fmtItem(e, e.preco)) : '—') },
    { label: 'Total', campo: 'total', ordenarPor: (e) => (typeof e.totalBrl === 'number' ? e.totalBrl : e.total),
      formatar: (e) => {
        const brl = e.moeda === 'USD' && typeof e.totalBrl === 'number' ? `<span class="cc-sub">${formatBRL(e.totalBrl)}</span>` : '';
        const lucro = typeof e.lucro === 'number' && !e.entrada ? `<span class="cc-sub ${cor(e.lucro)}">${e.lucro >= 0 ? 'lucro' : 'prejuízo'} ${fmtItem(e, Math.abs(e.lucro))}</span>` : '';
        return `<b>${fmtItem(e, e.total)}</b>${brl}${lucro}`;
      } },
  ];
}

function rodapeExtratoHtml(ctx, lista) {
  if (!lista.length) return '';
  const emReais = (e) => (typeof e.totalBrl === 'number' ? e.totalBrl : (e.moeda === 'USD' ? 0 : e.total || 0));
  const soma = (f) => lista.filter(f).reduce((s, e) => s + emReais(e), 0);
  const partes = [
    [ctx.ehRf ? 'aplicações' : 'compras', soma((e) => e.grupo !== 'provento' && e.entrada)],
    [ctx.ehRf ? 'resgates' : 'vendas', soma((e) => e.grupo !== 'provento' && !e.entrada)],
    [ctx.ehRf ? 'juros' : 'proventos', soma((e) => e.grupo === 'provento')],
  ].filter(([, v]) => v > 0).map(([r, v]) => `${r} ${formatBRL(v)}`);
  return `<tr><td class="cc-td-esquerda" colspan="${colunasExtrato(ctx).length}"><b>${lista.length} lançamento${lista.length === 1 ? '' : 's'}</b>${partes.length ? ` · ${partes.join(' · ')}` : ''}</td></tr>`;
}

function extratoHtml(ctx) {
  const st = estadoTabelas(ctx).extrato;
  const temProv = ctx.extrato.some((e) => e.grupo === 'provento');
  const filtros = temProv ? `
    <div class="filter-tabs at-extrato-filtros" id="atExtratoFiltros">
      <button class="filter-tab${st.filtro === 'todos' ? ' active' : ''}" type="button" data-filtro="todos">Tudo</button>
      <button class="filter-tab${st.filtro === 'movimentacao' ? ' active' : ''}" type="button" data-filtro="movimentacao">${ctx.ehRf ? 'Aplicações e resgates' : 'Compras e vendas'}</button>
      <button class="filter-tab${st.filtro === 'provento' ? ' active' : ''}" type="button" data-filtro="provento">${ctx.ehRf ? 'Juros' : 'Proventos'}</button>
    </div>` : '';
  return `
    <section class="at-bloco" id="at-extrato">
      <div class="area-header"><h2>Extrato</h2><span class="hint">${ctx.extrato.length} lançamentos · clique no título de uma coluna pra ordenar</span></div>
      <div class="cc-tabela-card">
        <div class="at-filtros-linha">${filtros}<div id="atExtratoAnos">${chipsAnoHtml(anosDe(ctx.extrato, 'data'), st.ano, 'data-ano')}</div></div>
        <div id="atExtratoTabela"></div>
      </div>
    </section>`;
}

/** Desenha o gráfico do mês a mês na largura real (só quando a aba Extrato e a vista Gráfico estão visíveis). */
function desenharGraficoMensal(doc, ctx) {
  const alvo = doc.getElementById('atMensalGrafico');
  if (!alvo || alvo.hidden) return;
  const st = estadoTabelas(ctx).mensal;
  const meses = st.ano ? ctx.mensal.filter((m) => m.mes.startsWith(st.ano)) : ctx.mensal.slice(0, 24);
  alvo.innerHTML = mensalGraficoSvg(ctx, meses, Math.round(alvo.clientWidth || 640));
}

function ligarExtratoEMensal(doc, ctx) {
  const est = estadoTabelas(ctx);
  const colsM = colunasMensal(ctx);
  const colsE = colunasExtrato(ctx);
  const alternarOrdem = (ordenacao, campo) => (ordenacao.campo === campo
    ? { campo, direcao: ordenacao.direcao === 'asc' ? 'desc' : 'asc' }
    : { campo, direcao: campo === 'tipo' ? 'asc' : 'desc' }); // coluna nova: texto A-Z, número/data do maior pro menor

  const tabMensal = doc.getElementById('atMensalTabela');
  const desenharMensal = () => {
    if (!tabMensal) return;
    const st = est.mensal;
    const filtrados = st.ano ? ctx.mensal.filter((m) => m.mes.startsWith(st.ano)) : ctx.mensal;
    const ordenados = ordenarLista(filtrados, colsM, st.ordenacao);
    const limitar = !st.ano && !st.todos && ordenados.length > MENSAL_INICIAL;
    renderTabelaAtivosCarteiras(doc, tabMensal, limitar ? ordenados.slice(0, MENSAL_INICIAL) : ordenados, colsM, {
      ordenacao: st.ordenacao,
      linhaTotalHtml: rodapeMensalHtml(ctx, filtrados, st.ano),
      onOrdenar: (campo) => { st.ordenacao = alternarOrdem(st.ordenacao, campo); desenharMensal(); },
    });
    const tabela = tabMensal.querySelector('table');
    if (tabela) tabela.classList.add('at-tabela', 'at-tabela-mensal');
    if (!st.ano && filtrados.length > MENSAL_INICIAL) {
      tabMensal.insertAdjacentHTML('beforeend', `<button class="at-mais" type="button" data-acao="mensal-todos">${st.todos ? 'Mostrar só 12 meses' : `Ver os ${filtrados.length} meses`}</button>`);
    }
    desenharGraficoMensal(doc, ctx);
  };
  if (tabMensal) tabMensal.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('[data-acao="mensal-todos"]')) { est.mensal.todos = !est.mensal.todos; desenharMensal(); }
  });
  const filtrosMensal = doc.getElementById('atMensalFiltros');
  if (filtrosMensal) filtrosMensal.querySelectorAll('[data-ano]').forEach((b) => b.addEventListener('click', () => {
    filtrosMensal.querySelectorAll('[data-ano]').forEach((x) => x.classList.toggle('active', x === b));
    est.mensal.ano = b.dataset.ano || null; desenharMensal();
  }));
  const vista = doc.getElementById('atMensalVista');
  if (vista) vista.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    est.mensal.vista = b.dataset.vista;
    vista.querySelectorAll('[data-vista]').forEach((x) => x.classList.toggle('active', x === b));
    const g = doc.getElementById('atMensalGrafico');
    if (tabMensal) tabMensal.hidden = est.mensal.vista !== 'tabela';
    if (g) g.hidden = est.mensal.vista !== 'grafico';
    desenharGraficoMensal(doc, ctx);
  }));
  const janela = doc.defaultView;
  if (janela && typeof janela.addEventListener === 'function') {
    let timer = null;
    janela.addEventListener('resize', () => { janela.clearTimeout(timer); timer = janela.setTimeout(() => desenharGraficoMensal(doc, ctx), 150); });
  }
  desenharMensal();

  const tabExtrato = doc.getElementById('atExtratoTabela');
  const desenharExtrato = () => {
    if (!tabExtrato) return;
    const st = est.extrato;
    const filtrados = ctx.extrato.filter((e) => (st.filtro === 'todos' || e.grupo === st.filtro) && (!st.ano || String(e.data).startsWith(st.ano)));
    if (!filtrados.length) { tabExtrato.innerHTML = '<p class="hint">Nada por aqui com esse filtro.</p>'; return; }
    const ordenados = ordenarLista(filtrados, colsE, st.ordenacao);
    const limitar = !st.todos && ordenados.length > EXTRATO_INICIAL;
    renderTabelaAtivosCarteiras(doc, tabExtrato, limitar ? ordenados.slice(0, EXTRATO_INICIAL) : ordenados, colsE, {
      ordenacao: st.ordenacao,
      linhaTotalHtml: rodapeExtratoHtml(ctx, filtrados),
      onOrdenar: (campo) => { st.ordenacao = alternarOrdem(st.ordenacao, campo); desenharExtrato(); },
    });
    const tabela = tabExtrato.querySelector('table');
    if (tabela) tabela.classList.add('at-tabela');
    if (filtrados.length > EXTRATO_INICIAL) {
      tabExtrato.insertAdjacentHTML('beforeend', `<button class="at-mais" type="button" data-acao="extrato-todos">${st.todos ? 'Mostrar menos' : `Ver tudo (${filtrados.length})`}</button>`);
    }
  };
  if (tabExtrato) tabExtrato.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('[data-acao="extrato-todos"]')) { est.extrato.todos = !est.extrato.todos; desenharExtrato(); }
  });
  const filtros = doc.getElementById('atExtratoFiltros');
  if (filtros) filtros.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    filtros.querySelectorAll('[data-filtro]').forEach((x) => x.classList.toggle('active', x === b));
    est.extrato.filtro = b.dataset.filtro; est.extrato.todos = false; desenharExtrato();
  }));
  const anos = doc.getElementById('atExtratoAnos');
  if (anos) anos.querySelectorAll('[data-ano]').forEach((b) => b.addEventListener('click', () => {
    anos.querySelectorAll('[data-ano]').forEach((x) => x.classList.toggle('active', x === b));
    est.extrato.ano = b.dataset.ano || null; est.extrato.todos = false; desenharExtrato();
  }));
  desenharExtrato();
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

/**
 * 25/09/2026 (Tiago, ponto 2): FIIs não têm tese da Suno - em vez disso,
 * cada FII tem sua própria "zona de informes relevantes" (fatos
 * relevantes, comunicados ao mercado, relatórios gerenciais etc.),
 * publicados no FNet (sistema de documentos da B3/CVM). Vem PRONTO na
 * resposta de action=ativo (ctx.informesFundo, lido de uma aba já
 * atualizada 1x por dia - ver apps-script/FnetInformesFii.gs) - sem
 * chamada extra, ao contrário de Tese/Notícias.
 */
export function informesFundoHtml(ctx) {
  const inf = ctx.informesFundo;
  if (!inf) return '<p class="hint">Ainda sem informes deste fundo - rode a atualização de informes (FnetInformesFii.gs) uma vez.</p>';
  if (!inf.ok) return `<p class="hint">Não deu pra buscar os informes agora (${esc(inf.erro || inf.etapa || 'erro')}).</p>`;
  const itens = inf.itens || [];
  if (!itens.length) return '<p class="hint">Nenhum informe recente deste fundo.</p>';
  return `<ul class="at-noticias">${itens.map((i) => `
    <li><a href="${urlSegura(i.link) || '#'}" target="_blank" rel="noopener">${esc(i.titulo || 'Documento do fundo')}</a>
      <span class="at-noticia-meta">${i.tipo ? `${esc(i.tipo)} · ` : ''}${i.data ? formatDateBR(i.data) : ''}</span></li>`).join('')}
  </ul><p class="hint at-fonte">Via FNet (sistema de documentos da B3/CVM) - atualizado 1x por dia.</p>`;
}

const NOTICIAS_VISIVEIS = 6;

function hostDe(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
}

/**
 * 25/09/2026 (Tiago: "Teria como mostrar as imagens se disponível? se não um
 * placeholder? estilo print"): cartões com imagem em cima, título e "há X
 * horas". O Google Notícias quase nunca manda a imagem no RSS, então o normal
 * é o placeholder: ícone do site da fonte (serviço de favicons do Google) e o
 * nome dela, na cor da classe. Se a imagem vier e falhar, ela some e o
 * placeholder por baixo aparece.
 */
export function noticiasHtml(resposta, agora = new Date()) {
  if (!resposta) return `<div class="at-noticias-grade">${'<div class="at-noticia"><span class="skel at-noticia-img"></span><span class="skel" style="height:14px"></span><span class="skel" style="height:14px;width:70%"></span></div>'.repeat(3)}</div>`;
  if (!resposta.ok) return `<p class="hint">Não deu pra buscar as notícias agora (${esc(resposta.erro || resposta.etapa || 'erro')}).</p>`;
  const itens = (resposta.noticias || []).filter((n) => urlSegura(n.link));
  if (!itens.length) return '<p class="hint">Nenhuma notícia nos últimos 60 dias.</p>';
  const cartao = (n, i) => {
    const host = hostDe(n.fonteUrl);
    const iniciais = String(n.fonte || host || '?').replace(/[^A-Za-zÀ-ú0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '•';
    const favicon = host ? `<img class="at-noticia-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64" alt="" loading="lazy" onerror="this.remove()">` : '';
    const imagem = /^https:\/\//i.test(String(n.imagem || '')) ? `<img class="at-noticia-foto" src="${urlSegura(n.imagem)}" alt="" loading="lazy" onerror="this.remove()">` : '';
    return `
      <a class="at-noticia${i >= NOTICIAS_VISIVEIS ? ' at-noticia-extra' : ''}" href="${urlSegura(n.link)}" target="_blank" rel="noopener">
        <span class="at-noticia-img" aria-hidden="true">
          <span class="at-noticia-ph"><span class="at-noticia-marca">${favicon}<span class="at-noticia-iniciais">${esc(iniciais)}</span></span><span class="at-noticia-ph-fonte">${esc(n.fonte || host || 'Notícia')}</span></span>
          ${imagem}
        </span>
        <span class="at-noticia-titulo">${esc(n.titulo)}</span>
        <span class="at-noticia-meta">${n.data ? `${formatRelativeTime(n.data, agora)}` : ''}${n.fonte ? `${n.data ? ' · ' : ''}${esc(n.fonte)}` : ''}</span>
      </a>`;
  };
  const extras = itens.length - NOTICIAS_VISIVEIS;
  return `<div class="at-noticias-grade">${itens.map(cartao).join('')}</div>
    ${extras > 0 ? `<button class="at-mais" type="button" data-acao="noticias-todas">Ver mais ${extras} notícia${extras === 1 ? '' : 's'}</button>` : ''}
    <p class="hint at-fonte">Via Google Notícias, atualizado a cada 2 horas.</p>`;
}

/** "Ver mais notícias" (delegado - o conteúdo das notícias chega depois do desenho da página). */
function ligarNoticias(raiz) {
  if (raiz._noticiasLigadas) return;
  raiz._noticiasLigadas = true;
  raiz.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('[data-acao="noticias-todas"]');
    if (!btn) return;
    const caixa = btn.closest('#atNoticiasConteudo');
    if (!caixa) return;
    const aberto = caixa.classList.toggle('at-noticias-todas');
    const extras = caixa.querySelectorAll('.at-noticia-extra').length;
    btn.textContent = aberto ? 'Mostrar menos' : `Ver mais ${extras} notícia${extras === 1 ? '' : 's'}`;
  });
}

// ---------------------------------------------------------------------------
// Sobre + Imposto de renda (estáticos)
// ---------------------------------------------------------------------------

const CAMPOS_SOBRE = {
  acoes: [['setor', 'Setor'], ['subsetor', 'Subsetor'], ['listagem', 'Segmento de listagem'], ['tipoAcao', 'Tipo de ação'], ['cnpj', 'CNPJ'], ['fundacao', 'Fundação'], ['sede', 'Sede']],
  fiis: [['tipo', 'Tipo'], ['segmento', 'Segmento'], ['mandato', 'Mandato'], ['gestao', 'Gestão'], ['gestor', 'Gestor'], ['administrador', 'Administrador'], ['taxaAdministracao', 'Taxa de administração'], ['publicoAlvo', 'Público-alvo'], ['cnpj', 'CNPJ'], ['inicio', 'Início']],
  acoesEua: [['setor', 'Setor'], ['industria', 'Indústria'], ['bolsa', 'Bolsa'], ['tipo', 'Tipo'], ['pais', 'País'], ['sede', 'Sede'], ['fundacao', 'Fundação'], ['moedaDividendos', 'Moeda dos dividendos'], ['retencaoDividendosBrasileiro', 'Imposto retido nos dividendos']],
};

/** Imagem do Sobre: https ou um caminho do próprio site (assets/...). */
function srcImagemSobre(url) {
  const u = String(url || '').trim();
  if (/^https:\/\//i.test(u)) return urlSegura(u);
  if (/^assets\/[\w./-]+$/.test(u)) return new URL(u, resolveSiteRootUrl()).href;
  return null;
}

function figuraSobreHtml(img, classe = '') {
  const src = img && srcImagemSobre(img.url);
  if (!src) return '';
  const leg = [img.legenda ? esc(img.legenda) : '', img.credito ? `<span class="at-sobre-credito">${esc(img.credito)}</span>` : ''].filter(Boolean).join(' ');
  return `<figure class="at-sobre-fig ${classe}"><img src="${src}" alt="${esc(img.legenda || '')}" loading="lazy" onerror="this.closest('figure').remove()">${leg ? `<figcaption>${leg}</figcaption>` : ''}</figure>`;
}

const paragrafos = (texto) => String(texto || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');

/**
 * 25/09/2026 (abas): Sobre ganhou espaço próprio (aba "Sobre e IR") e aceita
 * texto longo e imagens - em assets/data/ativos-sobre.json, além de
 * "descricao", cada ativo pode ter "imagem" ({url, legenda, credito}, foto de
 * destaque) e "secoes" ([{titulo, texto (parágrafos separados por linha em
 * branco), imagem?}]). Sem isso, mostra só o que já tinha.
 */
export function sobreHtml(ctx) {
  const s = ctx.sobre;
  if (!s) return '';
  const campos = (CAMPOS_SOBRE[ctx.classe] || []).filter(([c]) => s[c]).map(([c, rotulo]) => `<div><dt>${rotulo}</dt><dd>${esc(s[c])}</dd></div>`).join('');
  const links = [['site', 'Site'], ['ri', 'Relações com investidores']].filter(([c]) => urlSegura(s[c]))
    .map(([c, rotulo]) => `<a class="at-link" href="${urlSegura(s[c])}" target="_blank" rel="noopener">${rotulo} ↗</a>`).join('');
  const chips = [s.setor, s.segmento, s.tipo && ctx.classe === 'fiis' ? s.tipo : null, s.pais].filter(Boolean).map((c) => `<span class="at-chip">${esc(c)}</span>`).join('');
  const secoes = (Array.isArray(s.secoes) ? s.secoes : []).filter((sec) => sec && (sec.titulo || sec.texto)).map((sec) => `
        <section class="at-sobre-secao">
          ${sec.titulo ? `<h3>${esc(sec.titulo)}</h3>` : ''}
          ${figuraSobreHtml(sec.imagem, 'at-sobre-fig-lateral')}
          ${paragrafos(sec.texto)}
        </section>`).join('');
  const fontes = (Array.isArray(s.fontes) ? s.fontes : []).map((u) => urlSegura(u)).filter(Boolean);
  return `
    <section class="at-card at-sobre" id="at-sobre" aria-labelledby="at-sobre-titulo">
      <header class="at-sobre-topo">
        <span class="at-logo">${logoAtivoHtml(ctx.ticker)}</span>
        <div>
          <h2 id="at-sobre-titulo">Sobre ${esc(ctx.ticker)}</h2>
          ${s.nome ? `<p class="at-sobre-nome">${esc(s.nome)}</p>` : ''}
          ${chips ? `<div class="at-chips">${chips}</div>` : ''}
        </div>
      </header>
      ${figuraSobreHtml(s.imagem, 'at-sobre-fig-destaque')}
      <div class="at-sobre-corpo">
        <div class="at-sobre-texto">
          ${s.descricao ? `<div class="at-sobre-desc">${paragrafos(s.descricao)}</div>` : ''}
          ${secoes}
        </div>
        <aside class="at-sobre-ficha">
          <h3>Ficha</h3>
          ${campos ? `<dl class="at-dl">${campos}</dl>` : ''}
          ${links ? `<div class="at-links">${links}</div>` : ''}
        </aside>
      </div>
      ${fontes.length ? `<p class="hint at-fonte">Fontes: ${fontes.map((u) => `<a href="${u}" target="_blank" rel="noopener">${esc(hostDe(u))}</a>`).join(' · ')}</p>` : ''}
    </section>`;
}

/**
 * 25/09/2026: "Imposto de renda" virou um guia de ONDE e COMO baixar o
 * informe de rendimentos deste ativo (Tiago: "sinto que tem muita
 * informação inútil na área de IR") - sai tudo que era regra geral
 * (alíquotas, DARF, declaração, avisos). Conteúdo em
 * assets/data/imposto-renda.json, que o Tiago edita à mão todo ano.
 */
/**
 * 25/09/2026: "Na declaração" - ficha/grupo/código de Bens e Direitos e a
 * discriminação pronta pra colar (31/12 do ano passado + prévia de hoje),
 * montada com as transações do app (ativo-calc.js!declaracaoIrDoAtivo).
 */
export function declaracaoIrHtml(ctx) {
  const d = ctx.declaracaoIr;
  if (!d) return '';
  const f = d.ficha;
  const linhas = [
    ['Ficha', 'Bens e Direitos'],
    ['Grupo', `${f.grupo} - ${f.grupoNome}`],
    ['Código', `${f.codigo} - ${f.codigoNome}`],
    ['Localização', f.localizacao],
    f.cnpj ? ['CNPJ', f.cnpj] : null,
    f.negociadoEmBolsa ? ['Negociado em bolsa', `Sim · código ${ctx.ticker}`] : null,
  ].filter(Boolean);
  const posicao = (p, i) => {
    const valor = p.valor == null ? '—' : formatBRL(p.valor);
    const corpo = p.texto
      ? `<p class="at-ir-texto" id="atIrTexto${i}">${esc(p.texto)}</p>
         <button type="button" class="at-ir-copiar" data-copiar="atIrTexto${i}">Copiar texto</button>`
      : `<p class="hint">Sem posição nessa data.</p>`;
    return `
      <div class="at-ir-disc${p.previa ? ' at-ir-previa' : ''}">
        <div class="at-ir-disc-topo"><b>${esc(p.rotulo)}</b><span class="at-ir-valor"><small>${esc(p.valorRotulo || '')}</small>${valor}</span></div>
        ${corpo}
      </div>`;
  };
  return `
    <div class="at-ir-declaracao">
      <h3>Na declaração</h3>
      <dl class="at-ir-ficha">${linhas.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="at-ir-discs">${d.posicoes.map(posicao).join('')}</div>
      ${d.notas.length ? d.notas.map((n) => `<p class="hint at-ir-nota">${esc(n)}</p>`).join('') : ''}
    </div>`;
}

/** Botões "Copiar texto" da seção Na declaração. */
function ligarCopiarIr(doc, raiz) {
  raiz.querySelectorAll('.at-ir-copiar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const alvo = doc.getElementById(btn.dataset.copiar);
      if (!alvo) return;
      const original = btn.textContent;
      try {
        const nav = doc.defaultView && doc.defaultView.navigator;
        await nav.clipboard.writeText(alvo.textContent);
        btn.textContent = 'Copiado ✓';
      } catch (_) {
        const sel = doc.defaultView && doc.defaultView.getSelection && doc.defaultView.getSelection();
        if (sel) { const r = doc.createRange(); r.selectNodeContents(alvo); sel.removeAllRanges(); sel.addRange(r); }
        btn.textContent = 'Selecionado - use Ctrl+C';
      }
      setTimeout(() => { btn.textContent = original; }, 1800);
    });
  });
}

export function irHtml(ctx) {
  const ir = ctx.ir;
  if (!ir) return '';
  const link = (l) => (urlSegura(l.url) ? `<a class="at-ir-link" href="${urlSegura(l.url)}" target="_blank" rel="noopener">${esc(l.rotulo || l.url)} ↗</a>` : '');
  const fonte = (f) => `
    <article class="at-ir-fonte">
      <header class="at-ir-fonte-topo"><h3>${esc(f.nome)}</h3>${f.papel ? `<span class="at-chip">${esc(f.papel)}</span>` : ''}</header>
      ${f.resumo ? `<p class="at-ir-resumo">${esc(f.resumo)}</p>` : ''}
      ${(f.passos || []).length ? `<ul class="at-ir-passos">${f.passos.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${(f.links || []).length ? `<div class="at-ir-links">${f.links.map(link).join('')}</div>` : ''}
      ${(f.notas || []).length ? f.notas.map((n) => `<p class="hint at-ir-nota">${esc(n)}</p>`).join('') : ''}
    </article>`;
  const corpo = ir.fontes.length
    ? `<div class="at-ir-fontes">${ir.fontes.map(fonte).join('')}</div>`
    : `<p class="hint">Ainda não sei quem emite o informe de ${esc(ctx.ticker)}. Cadastre em assets/data/imposto-renda.json (porTicker).</p>`;
  const notas = ir.notas.length ? `<div class="at-ir-avisos">${ir.notas.map((n) => `<p>${esc(n)}</p>`).join('')}</div>` : '';
  const rodape = [ir.prazo, ir.atualizadoEm ? `Atualizado em ${textoMesAno(ir.atualizadoEm)}.` : ''].filter(Boolean).map(esc).join(' ');
  return `
    <section class="at-bloco" id="at-ir">
      <div class="area-header"><h2>Imposto de renda</h2><span class="hint">Como declarar e onde baixar o informe</span></div>
      <div class="at-card">
        ${declaracaoIrHtml(ctx)}
        <h3 class="at-ir-subtitulo">Onde baixar o informe</h3>
        ${corpo}
        ${notas}
        ${rodape ? `<p class="hint at-fonte">${rodape}</p>` : ''}
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

function teseCardHtml_(ctx) {
  return `
    <section class="at-card" id="at-tese" aria-labelledby="at-tese-titulo">
      <div class="at-card-titulo"><h2 id="at-tese-titulo">Tese de investimento</h2><span class="hint">Suno Research</span></div>
      <div id="atTeseConteudo">${teseHtml(ctx, null)}</div>
    </section>`;
}

function informesFundoCardHtml_(ctx) {
  return `
    <section class="at-card" id="at-informes" aria-labelledby="at-informes-titulo">
      <div class="at-card-titulo"><h2 id="at-informes-titulo">Informes do fundo</h2><span class="hint">FNet / CVM</span></div>
      ${informesFundoHtml(ctx)}
    </section>`;
}

function noticiasCardHtml_() {
  return `
      <section class="at-card" id="at-noticias" aria-labelledby="at-noticias-titulo">
        <div class="at-card-titulo"><h2 id="at-noticias-titulo">Últimas notícias</h2><span class="hint">Google Notícias</span></div>
        <div id="atNoticiasConteudo">${noticiasHtml(null)}</div>
      </section>`;
}

/**
 * 25/09/2026 (abas): Visão geral = resumo + gráficos, proventos, notícias
 * (logo abaixo de proventos) e a tese no corpo da página; na lateral, links,
 * faixa de preço, indicadores e (FIIs) os informes do fundo. Extrato = mês a
 * mês + extrato. Sobre = Sobre + imposto de renda. As 3 abas vão pro HTML de
 * uma vez (trocar de aba é só mostrar/esconder, sem refazer nada).
 */
export function paginaHtml(ctx, { aba = 'visao' } = {}) {
  const ehFii = ctx.classe === 'fiis';
  const lateral = ctx.ehRf ? `
      ${linksRelevantesHtml(ctx)}
      ${indicadoresHtml(ctx)}` : `
      ${linksRelevantesHtml(ctx)}
      ${faixaHtml(ctx)}
      ${indicadoresHtml(ctx)}
      ${ehFii ? informesFundoCardHtml_(ctx) : ''}`;
  const principal = ctx.ehRf ? `
      ${graficosHtml(ctx)}` : `
      ${graficosHtml(ctx)}
      ${proventosHtml(ctx)}
      ${noticiasCardHtml_()}
      ${ehFii ? '' : teseCardHtml_(ctx)}`;
  const painel = (id, conteudo) => `
      <section class="at-aba" id="at-aba-${id}" role="tabpanel" aria-labelledby="at-tab-${id}"${id === aba ? '' : ' hidden'}>${conteudo}
      </section>`;
  return `
    <div class="at-pagina" style="--accent:var(${ctx.cfg.token}); --accent-soft:var(${ctx.cfg.soft})">
      ${cabecalhoHtml(ctx)}
      ${abasHtml(ctx, aba)}
      ${painel('visao', `
        <div class="at-resumo-wrap">${resumoHtml(ctx)}</div>
        <div class="at-grade">
          <div class="at-col at-col-principal">${principal}</div>
          <aside class="at-col at-col-lateral">${lateral}</aside>
        </div>`)}
      ${painel('extrato', `
        <section class="at-bloco" id="at-mensal">${mensalHtml(ctx)}</section>
        ${extratoHtml(ctx)}`)}
      ${painel('sobre', `
        ${sobreHtml(ctx)}
        ${irHtml(ctx)}`)}
    </div>`;
}

/** Liga as abas: troca o painel visível, guarda no endereço e avisa os gráficos (que medem a largura). */
function ligarAbas(doc, raiz, { aoMostrar = () => {} } = {}) {
  const janela = doc.defaultView;
  const botoes = [...raiz.querySelectorAll('.at-abas [data-aba]')];
  const mostrar = (id, { foco = false } = {}) => {
    botoes.forEach((b) => {
      const ativa = b.dataset.aba === id;
      b.classList.toggle('active', ativa);
      b.setAttribute('aria-selected', String(ativa));
      b.tabIndex = ativa ? 0 : -1;
      if (ativa && foco) b.focus();
    });
    raiz.querySelectorAll('.at-aba').forEach((sec) => { sec.hidden = sec.id !== `at-aba-${id}`; });
    try {
      const hash = id === 'visao' ? '' : `#${id}`;
      if (janela && janela.history && (janela.location.hash || '') !== hash) {
        janela.history.replaceState(null, '', `${janela.location.pathname}${janela.location.search}${hash}`);
      }
    } catch (_) { /* sem history (testes antigos): só não lembra */ }
    // gráficos escondidos mediram largura 0 - "resize" faz cada um redesenhar
    try { if (janela && typeof janela.dispatchEvent === 'function') janela.dispatchEvent(new janela.Event('resize')); } catch (_) { /* nada */ }
    aoMostrar(id);
  };
  botoes.forEach((b, i) => {
    b.tabIndex = b.classList.contains('active') ? 0 : -1;
    b.addEventListener('click', () => mostrar(b.dataset.aba));
    b.addEventListener('keydown', (ev) => {
      const passo = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!passo) return;
      ev.preventDefault();
      mostrar(botoes[(i + passo + botoes.length) % botoes.length].dataset.aba, { foco: true });
    });
  });
  return mostrar;
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
  const janela = doc.defaultView;
  conteudoEl.innerHTML = paginaHtml(ctx, { aba: abaDoHash(janela && janela.location ? janela.location.hash : '') });
  doc.title = `${ctx.ticker} · Patrimônio`;
  wirePointerTooltipCarteiras_(doc, conteudoEl);
  ligarBarras(doc, ctx);
  ligarGraficos(doc, ctx);
  ligarExtratoEMensal(doc, ctx);
  ligarTese(doc.getElementById('atTeseConteudo'));
  ligarCopiarIr(doc, conteudoEl);
  ligarNoticias(conteudoEl);
  ligarAbas(doc, conteudoEl, { aoMostrar: (id) => { if (id === 'extrato') desenharGraficoMensal(doc, ctx); } });
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

  estadoTabelasAtivo.clear(); // página nova: filtros/ordem das tabelas voltam ao padrão
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
    // 25/09/2026 (ponto 2): FIIs não têm tese da Suno - não vale a pena
    // pedir (o card nem existe mais na página pra ela preencher).
    if (!estado.tesesPedidas && resposta.classe !== 'fiis') {
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

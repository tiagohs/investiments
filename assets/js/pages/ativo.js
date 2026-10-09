/**
 * ativo.js - 25/09/2026: tela "Detalhe do ativo" (ativo/index.html?ref=...).
 *
 * Um ativo por tela - ações, FIIs, ações EUA ou um título de renda fixa -
 * com o foco no que o Tiago tem nele: posição e resultado, cotação x
 * preço-teto (o teto e o viés que ele edita em Acompanhamento de Ativos -
 * 02/10/2026: o menu "Distribuições e Metas" foi renomeado; o arquivo continua distribuicoes-metas.html),
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

import { getAtivo, getNoticiasAtivo, getTesesAtivo, getIntradia, getFiiPortfolio, salvarCoordenadasFiiPortfolio, definirDestinoRendaFixa, definirCotaFundoRf } from '../api-client.js';
import { montarFundoRf } from '../fundos-rf.js'; // 07/10/2026: fundo de investimento na Renda Fixa (cota, ficha pública, rentabilidade mensal)
import { cotaFundoHtml, sobreFundoHtml, rentabilidadeFundoHtml, ligarCotaFundo } from './ativo-fundo.js';
import { DESTINOS_RENDA_FIXA, DESTINO_EMERGENCIAL, ROTULO_DESTINO_RF, destinoRendaFixa } from '../destino-renda-fixa.js'; // 07/10/2026: destino único do título de Renda Fixa
import { formatBRL, formatBRLCompacto, formatUSD, formatNumeroBR, formatPercentFromFraction, formatPercentFromPoints, formatDateBR, formatRelativeTime, variacaoNula, hojeSP, MESES_CURTOS, MESES_LONGOS, formatDMA } from '../format.js';
import { mountRefreshControl, resolveSiteRootUrl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { refDaUrl } from '../link-ativo.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68)
import { secaoVideosHtml, criarCarregadorVideos } from '../videos.js';
import { canalDoAtivo, familiaTesouro, parametrosCanalVideos } from '../canais-youtube.js';
import { chaveIntradiaDoAtivo, preencherIntradia } from './inicio-intradia.js';
import { logoCirculoHtml, logoCirculoRendaFixaHtml } from './carteiras-pecas.js';
import { renderTabelaAtivosCarteiras, botaoInfoHtml, seloViesHtml, variacaoHtml, wirePointerTooltipCarteiras_, lerEstadoSecoes, aplicarEstadoSecoes } from './carteiras-classe-comum.js';
import { criarGraficosCarteira, montarKpis, lembrarGrafico, destruirGraficos, corDoToken, sinalDe } from './carteiras-graficos.js';
import { criarGraficoBarras, criarAnelProgresso } from '../charts/index.js';
import { montarCabecalhoPagina, definirTituloPagina, mostrarErroCarga, mostrarEstadoVazio } from '../ui/index.js';
import { criar } from '../ui/dom.js';
import {
  CLASSES_ATIVO, montarHistoricoAtivo, historicoMensal, montarExtrato, resumoProventosAtivo, faixaDePreco,
  resumoPosicao, percentualNaCarteira, informesIrDoAtivo, declaracaoIrDoAtivo, ordenarTeses, cambioMaisRecente,
  comCamposUsdAtivo, historicoAtivoTemCambioUsd, entradaMotorDoAtivo, indicesDoHistoricoHome,
} from './ativo-calc.js';
// 03/10/2026: análise por critérios (base Suno e outras fontes) + metas de Metas e Objetivos
import { avaliarAtivo, GRUPOS } from '../criterios/motor.js';
import { getMetas, getMacro } from '../api-client.js';
// 05/10/2026: contexto de mercado na Análise (criterios/macro.js, Macro.gs)
import { ajudaHtml, resumoMacro } from '../criterios/macro.js';
import { carregarMacroMomento } from './momento-carga.js';
import { renderAnalise } from '../analise-grafico.js'; // 02/10/2026: card de Análise (proventos por mês)
import { analisarProventosMensais, proventosPorMes, somarMeses as somarMesesProv } from './proventos-calc.js';
// 08/10/2026: quantas cotas comprar pra ficar no lucro (resumo no card de cotação + seção com tabela, gráfico e simulador)
import { resumoPmFaixaHtml, secaoPmHtml, ligarSecaoPm } from './ativo-preco-medio.js';
// 09/10/2026: IR do título de Renda Fixa resgatando hoje x no vencimento
import { irResgateHtml, preencherIrResgate } from './ativo-ir-resgate.js';
// 05/10/2026: aba "Patrimônio" dos FIIs (imóveis, CRI com indexador, mapa) - ativo-patrimonio.js
import { patrimonioPlaceholderHtml } from './ativo-patrimonio-esqueleto.js'; // o controlador (ativo-patrimonio.js, 45 KB) só é importado quando o ativo é um FII

const VERSAO_CACHE = 'v1';
const chaveCache = (ref) => `ativo_${VERSAO_CACHE}:${ref}`;

// 05/10/2026 (A-68): `esc` central (util/html.js) - o local não escapava aspas simples. Texto vindo de planilha/notícia/JSON entra sempre escapado.
export { esc };

/** Só http(s) vira link. */
function urlSegura(url) {
  return /^https?:\/\//i.test(String(url || '')) ? esc(url) : null;
}


function rotuloMes(anoMes, { comAno = true } = {}) {
  const [a, m] = anoMes.split('-');
  return `${MESES_CURTOS[Number(m) - 1]}${comAno ? `/${a.slice(2)}` : ''}`;
}


/** "2026-09" -> "setembro de 2026"; data completa -> dd/mm/aaaa. */
export function textoMesAno(valor) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(valor || ''));
  return m ? `${MESES_LONGOS[Number(m[2]) - 1]} de ${m[1]}` : formatDateBR(valor);
}

// 05/10/2026 (A-04): variação que arredonda pra 0,00% fica neutra (sem verde); `fracao` = valor em fração (0,013 = 1,3%).
const cor = (v, fracao = false) => (typeof v === 'number' ? (variacaoNula(v, { fracao }) ? '' : (v >= 0 ? 'good' : 'bad')) : '');

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

/** 07/10/2026: dados públicos dos fundos (assets/data/fundos.json) - 1 fetch, só quando o título é de renda fixa. */
let fundosEmCurso = null;
function carregarFundosPadrao(fetchImpl = typeof fetch !== 'undefined' ? fetch : null) {
  if (!fundosEmCurso) {
    fundosEmCurso = fetchImpl
      ? fetchImpl(new URL('assets/data/fundos.json', resolveSiteRootUrl()).href).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null);
  }
  return fundosEmCurso;
}

/** 05/10/2026: curadoria da aba Patrimônio (assets/data/fii-portfolio-manual.json) - 1 fetch, só quando a aba abre. */
let manualPatrimonioEmCurso = null;
function carregarManualPatrimonioPadrao(fetchImpl = typeof fetch !== 'undefined' ? fetch : null) {
  if (!manualPatrimonioEmCurso) {
    manualPatrimonioEmCurso = fetchImpl
      ? fetchImpl(new URL('assets/data/fii-portfolio-manual.json', resolveSiteRootUrl()).href).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      : Promise.resolve(null);
  }
  return manualPatrimonioEmCurso;
}

// ---------------------------------------------------------------------------
// Contexto de desenho
// ---------------------------------------------------------------------------

/** Tudo que as seções precisam, calculado 1x a partir da resposta. */
export function montarContexto(resposta, { sobre = null, ir = null, metas = null, macro = null, fundos = null } = {}) {
  const classe = resposta.classe || (resposta.tipo === 'rf' ? 'rendaFixa' : 'acoes');
  const cfg = CLASSES_ATIVO[classe] || CLASSES_ATIVO.acoes;
  const emDolar = resposta.moeda === 'USD';
  const historico = montarHistoricoAtivo(resposta);
  const posicao = resumoPosicao(resposta, historico);
  const cambio = emDolar ? cambioMaisRecente(resposta) : null;
  const aplicadoBrl = posicao.aplicadoHistorico ?? (emDolar ? null : posicao.aplicado);
  const faixa = faixaDePreco(resposta);
  const percentualCarteira = percentualNaCarteira(historico);
  const fundoRf = montarFundoRf(resposta, fundos);
  return {
    // 03/10/2026: análise por critérios (criterios/motor.js); refeita quando as metas chegam
    avaliacao: avaliacaoDoAtivo(resposta, { faixa, percentualCarteira, metas, macro }),
    macro,
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
    faixa,
    mensal: historicoMensal(historico, { campoIndice: cfg.indice.campo }),
    extrato: montarExtrato(resposta),
    percentualCarteira,
    sobre: sobre && sobre.ativos ? sobre.ativos[String(resposta.ticker || '').toUpperCase()] || null : null,
    ir: informesIrDoAtivo(ir, { ticker: resposta.ticker, classe, instituicao: resposta.ativo && resposta.ativo.instituicao }),
    declaracaoIr: declaracaoIrDoAtivo(ir, {
      classe, ticker: resposta.ticker, hoje: resposta.hoje, transacoes: resposta.transacoes || [], ativo: resposta.ativo || null, historico,
      ehRf: resposta.tipo === 'rf',
      sobre: sobre && sobre.ativos ? sobre.ativos[String(resposta.ticker || '').toUpperCase()] || null : null,
      fundo: fundoRf ? { cnpj: (fundoRf.info && fundoRf.info.cnpj) || null, nome: (fundoRf.info && fundoRf.info.nome) || fundoRf.nome, nomeCompleto: (fundoRf.info && fundoRf.info.nomeCompleto) || null } : null,
    }),
    informesFundo: resposta.informesFundo || null,
    // 07/10/2026: título que é fundo de investimento (null nos demais) - cota real x estimativa, ficha pública e rentabilidade mensal
    fundoRf,
    // 02/10/2026: canal oficial no YouTube (canais-youtube.js) e chave do gráfico do dia (Intradia.gs)
    canal: canalDoAtivo({ ticker: resposta.ticker, classe, ativo: resposta.ativo || null, ehRf: resposta.tipo === 'rf' }),
    chaveIntradia: chaveIntradiaAtivo({ ticker: resposta.ticker, classe, ehRf: resposta.tipo === 'rf' }),
  };
}

/** 06/10/2026 (A-42): o cartão de metas (calcularMeta, viagem, patrimônio-calc ≈ 200 KB) só é carregado quando as metas chegam. */
async function metasComCalculo(dados) {
  const { metasComCalculo: calcular } = await import('../metas-card.js');
  return calcular(dados);
}

/** 03/10/2026: a análise do motor de critérios - nunca derruba a página (erro = sem análise). */
export function avaliacaoDoAtivo(resposta, { faixa = null, percentualCarteira = null, metas = null, macro = null } = {}) {
  try {
    return avaliarAtivo(entradaMotorDoAtivo(resposta, { faixa, percentualCarteira, metas, macro }));
  } catch (erro) {
    if (typeof console !== 'undefined') console.error('análise do ativo', erro);
    return null;
  }
}

/**
 * 02/10/2026: chave do gráfico do dia (a mesma da Início: 'acoes:PETR4',
 * 'fiis:BTLG11', 'usa:CHTR'). Renda fixa não tem pregão: null.
 */
export function chaveIntradiaAtivo({ ticker = '', classe = '', ehRf = false } = {}) {
  if (ehRf) return null;
  return chaveIntradiaDoAtivo({ ticker, classe: classe === 'acoesEua' ? 'usa' : classe });
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
  if (ctx.ehRf) return (ctx.ativo && destinoRendaFixa(ctx.ativo.tipoCarteira) === DESTINO_EMERGENCIAL) ? SUNO_CARTEIRAS_URL.reservaEmergencia : SUNO_CARTEIRAS_URL.rendaFixa;
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
    <details class="card at-card at-recolhe at-links-relevantes" id="at-links" data-secao="links" open>
      <summary class="at-card-titulo"><h2 id="at-links-titulo">Links relevantes</h2><svg class="ico at-recolhe-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary>
      <div class="at-links-grade">${itens.join('')}</div>
    </details>`;
}

// ---------------------------------------------------------------------------
// Cabeçalho + navegação das seções
// ---------------------------------------------------------------------------

/** Chips tonais do hero (classe, grupo, viés, % do patrimônio). */
const chipHtml = (texto, classe = '') => `<span class="chip-tonal${classe ? ` ${classe}` : ''}">${texto}</span>`;

/** Texto do subtítulo do cabeçalho padrão: nome da empresa/fundo (RV) ou instituição + vencimento (RF). */
function subtituloAtivo(ctx) {
  const a = ctx.ativo || {};
  if (ctx.ehRf) return `${a.instituicao || ''}${a.vencimento ? ` · vence em ${a.vencimento}` : ''}`.replace(/^ · /, '');
  return (ctx.sobre && ctx.sobre.nome) || a.nome || '';
}

/**
 * 06/10/2026 (Onda 3): o cabeçalho da tela é o padrão do app (ui/pagina.js) - breadcrumb "Carteiras › <classe> › <TICKER>", título =
 * ticker, subtítulo = nome, "Atualizar dados" à direita e as seções em abas em pílula. Antes de o dado chegar só há o breadcrumb
 * e o ticker do endereço (sem abas); depois do dado (e a cada redesenho) volta completo, com a aba atual mantida.
 */
function montarCabecalhoAtivo(doc, cabEl, { ctx = null, ref = '', refreshEl = null, aba = 'visao', aoMudarAba = () => {} } = {}) {
  if (!cabEl) return null;
  const raiz = resolveSiteRootUrl();
  const ticker = ctx ? ctx.ticker : String(ref || '').replace(/^rf:/, '').split('|')[0];
  const breadcrumb = [{ rotulo: 'Carteiras', href: new URL('carteiras/index.html', raiz).href }];
  if (ctx) breadcrumb.push({ rotulo: ctx.cfg.labelPlural, href: linkCarteira(ctx) });
  breadcrumb.push({ rotulo: ticker || 'Ativo' });
  const itens = ctx ? [
    { id: 'visao', rotulo: 'Visão geral' },
    { id: 'extrato', rotulo: 'Extrato' },
    // 05/10/2026 (Tiago: "nova aba no FII, antes de 'Sobre'"): imóveis, CRI/indexador e mapa - só FIIs
    ...(ctx.classe === 'fiis' ? [{ id: 'patrimonio', rotulo: 'Patrimônio' }] : []),
    { id: 'sobre', rotulo: ctx.ehRf ? (ctx.fundoRf && ctx.fundoRf.info ? 'Sobre o fundo e IR' : 'Imposto de renda') : 'Sobre e IR' },
  ] : [];
  return montarCabecalhoPagina(cabEl, {
    secao: 'Carteiras', subaba: ticker || 'Ativo', titulo: ticker || 'Ativo', subtitulo: ctx ? subtituloAtivo(ctx) : '', breadcrumb,
    acoes: refreshEl ? [refreshEl] : [],
    abas: itens.length ? { pilula: { rotulo: 'Seções do ativo', itens, ativo: aba, aoMudar: aoMudarAba } } : {},
    doc,
  });
}

/** Cartão de identificação: logo, chips, cotação (com a variação do dia) e o gráfico do dia. Fica acima das abas de conteúdo. */
function heroHtml(ctx) {
  const a = ctx.ativo || {};
  const temPosicao = !!ctx.ativo && (ctx.ehRf || ctx.ativo.quantidade > 0);
  const chipPatrimonio = temPosicao && typeof ctx.percentualCarteira === 'number'
    ? chipHtml(`${formatPercentFromFraction(ctx.percentualCarteira, 1).replace('+', '')} do patrimônio`, 'chip-primary') : '';

  if (ctx.ehRf) {
    const carteira = ROTULO_CARTEIRA_RF[destinoRendaFixa(a.tipoCarteira)];
    const chips = [
      chipHtml('Renda fixa', 'chip-primary'),
      ctx.fundoRf && ctx.fundoRf.info && ctx.fundoRf.info.classificacaoXp ? chipHtml(esc(ctx.fundoRf.info.classificacaoXp)) : '',
      a.indexador ? chipHtml(esc(a.indexador)) : '',
      a.tipoInvestimento ? chipHtml(esc(a.tipoInvestimento)) : '',
      chipHtml(carteira),
      chipPatrimonio,
    ].join('');
    return `
      <section class="card at-hero" aria-label="Resumo do título">
        <div class="at-id">
          ${logoCirculoRendaFixaHtml(a)}
          <div class="at-chips">${chips}</div>
        </div>
        <div class="at-cotacao">
          <span class="at-cotacao-label">Saldo bruto</span>
          <span class="at-cotacao-valor num">${formatBRL(ctx.posicao.saldo)}</span>
          <span class="at-cotacao-var">${variacaoHtml(ctx.posicao.percentual)}<span class="at-cotacao-sufixo">sobre o aplicado</span></span>
        </div>
      </section>`;
  }

  const grupo = ctx.sobre ? [ctx.sobre.setor || ctx.sobre.tipo, ctx.sobre.subsetor || ctx.sobre.segmento || ctx.sobre.industria].filter(Boolean).join(' · ') : a.grupo;
  const chips = [
    chipHtml(esc(ctx.cfg.label), 'chip-primary'),
    grupo ? chipHtml(esc(grupo)) : '',
    seloViesHtml(a.vies),
    chipPatrimonio,
  ].join('');
  const variacao = typeof a.variacaoDia === 'number' ? `<span class="at-cotacao-var">${variacaoHtml(a.variacaoDia)}<span class="at-cotacao-sufixo">hoje</span></span>` : '';
  return `
    <section class="card at-hero" aria-label="Resumo do ativo">
      <div class="at-id">
        ${logoCirculoHtml(ctx.ticker)}
        <div class="at-chips">${chips}</div>
      </div>
      ${graficoDiaHtml(ctx)}
      <div class="at-cotacao">
        <span class="at-cotacao-label">Cotação</span>
        <span class="at-cotacao-valor num">${valorComBrl(ctx, a.precoAtual)}</span>
        ${variacao}
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// 02/10/2026 (Tiago: "Tela de ativos: gráfico de variação diária igual da
// home; do lado do hero no desktop, embaixo no mobile. Clicando no gráfico
// abre o Google Finance"): o mesmo desenho dos favoritos da Início
// (inicio-intradia.js: linha do pregão + fechamento anterior pontilhado,
// verde/vermelho), série do Intradia.gs. Chega depois da página (esqueleto
// discreto enquanto isso); sem série, fica só o aviso e o link.
// ---------------------------------------------------------------------------

export function graficoDiaHtml(ctx) {
  if (!ctx.chaveIntradia) return '';
  const url = googleFinanceUrl(ctx);
  const tag = url ? 'a' : 'div';
  const link = url ? ` href="${esc(url)}" target="_blank" rel="noopener" title="Abrir ${esc(ctx.ticker)} no Google Finance (nova aba)"` : '';
  return `
      <${tag} class="at-dia carregando"${link} aria-label="Variação do dia de ${esc(ctx.ticker)}${url ? ' - abrir no Google Finance' : ''}">
        <span class="at-dia-grafico intradia-slot" data-intradia="${esc(ctx.chaveIntradia)}"><span class="skel at-dia-skel"></span></span>
        <span class="at-dia-rodape"><span class="at-dia-rotulo">Variação do dia</span>${url ? '<span class="at-dia-gf">Google Finance ↗</span>' : ''}</span>
      </${tag}>`;
}

/** "yyyy-mm-dd" de hoje em Brasília (o rótulo "pregão 01/10" só aparece quando a série não é de hoje). */
function hojeIsoBrasilia(agora) {
  try { return hojeSP(agora); } catch (_) { return agora.toISOString().slice(0, 10); } // 05/10/2026: hojeSP de format.js
}

/** Preenche o gráfico do dia com a série (null = sem dado: tira o esqueleto e avisa, sem alarde). */
export function preencherGraficoDia(raiz, chave, serie, { agora = new Date() } = {}) {
  const caixa = raiz && raiz.querySelector('.at-dia');
  if (!caixa || !chave) return;
  preencherIntradia(caixa, { [chave]: serie || null }, { hojeISO: hojeIsoBrasilia(agora) });
  const slot = caixa.querySelector('.at-dia-grafico');
  caixa.classList.remove('carregando');
  caixa.classList.toggle('sem-dado', !serie);
  if (!serie && slot) slot.innerHTML = '<span class="at-dia-vazio">Gráfico do dia indisponível agora</span>';
}

// 25/09/2026 (Tiago: "quero reorganizar essa tela do ativo, tem muita coisa
// em um lugar só. Vamos criar um sistema de abas parecido com a de
// carteiras"): 3 abas - Visão geral (quase tudo), Extrato (mês a mês +
// extrato) e Sobre (Sobre + imposto de renda). Mesmo visual dos .side-item
// de Carteiras, em linha; a aba aberta fica no endereço (#extrato, #sobre)
// pra sobreviver ao F5 e ao redesenho do cache.
/** Aba a partir do endereço ("#extrato", "#patrimonio", "#sobre"; qualquer outra coisa = visão geral). */
export function abaDoHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  return h === 'extrato' || h === 'sobre' || h === 'patrimonio' ? h : 'visao';
}

// ---------------------------------------------------------------------------
// Resumo da posição
// ---------------------------------------------------------------------------

/** Aviso quando não há posição (vendeu tudo ou nunca teve): o histórico, o extrato e os proventos continuam na tela. */
function avisoSemPosicaoHtml(ctx) {
  const jaTeve = (ctx.resposta.transacoes || []).length > 0;
  return `<div class="at-aviso" role="status">${jaTeve
    ? `Você não tem mais ${esc(ctx.ticker)} na carteira. O histórico, o extrato e os proventos de quando teve continuam abaixo.`
    : `Você ainda não tem ${esc(ctx.ticker)} na carteira.`}</div>`;
}

const temPosicaoAtual = (ctx) => !!ctx.ativo && (ctx.ehRf || ctx.ativo.quantidade > 0);

/**
 * 06/10/2026 (Onda 3): o resumo da posição são os cards KPI do kit (charts/kpi via montarKpis): Saldo atual (com o valor aplicado
 * embaixo), Resultado (com % e seta), Quantidade/Rentab. contratada e Proventos/Se resgatasse hoje. O "% do patrimônio" foi
 * pro chip do hero. Mesmos números de antes - só a forma mudou.
 */
export function montarResumoAtivo(doc, container, ctx, dono = container) {
  if (!container) return [];
  if (!temPosicaoAtual(ctx)) {
    container.classList.remove('grid-kpi');
    container.innerHTML = avisoSemPosicaoHtml(ctx);
    return [];
  }
  const p = ctx.posicao;
  const a = ctx.ativo || {};
  const sinalPct = typeof p.percentual === 'number' ? (variacaoNula(p.percentual, { fracao: true }) ? 0 : (p.percentual >= 0 ? 1 : -1)) : sinalDe(p.resultado);
  const delta = typeof p.percentual === 'number' ? { texto: formatPercentFromFraction(p.percentual), sinal: sinalPct } : null;
  const brl = (valor, rotulo) => (ctx.emDolar && typeof valor === 'number' && ctx.cambio
    ? `${rotulo ? `${rotulo}: ` : ''}Equivalente em reais: ${formatBRL(valor * ctx.cambio)} (câmbio de hoje, ${formatNumeroBR(ctx.cambio, 4)}).` : null);
  let itens;
  if (ctx.ehRf) {
    const contratada = (a.rentabilidadeContratada && a.rentabilidadeContratada.texto) || a.indexador || '—';
    itens = [
      { rotulo: 'Saldo atual', valor: p.saldo, formatar: formatBRL, sub: `Valor aplicado: ${formatBRL(p.aplicado)}`, classe: 'cc-kpi-valor' },
      { rotulo: 'Resultado', valor: p.resultado, formatar: formatBRL, delta },
      { rotulo: 'Se resgatasse hoje', valor: typeof p.liquidoHoje === 'number' ? p.liquidoHoje : '—', formatar: formatBRL, sub: p.irHoje != null ? `IR de ${formatBRL(p.irHoje)}` : null },
      { rotulo: 'Rentab. contratada', valor: contratada, sub: a.vencimento ? `Vence em ${a.vencimento}` : null },
    ];
  } else {
    const pr = ctx.proventos;
    itens = [
      { rotulo: 'Saldo atual', valor: p.saldo, formatar: ctx.fmt, info: brl(p.saldo), sub: `Valor aplicado: ${ctx.fmt(p.aplicado)}`, subInfo: brl(p.aplicado), classe: 'cc-kpi-valor' },
      { rotulo: 'Resultado', valor: p.resultado, formatar: ctx.fmt, info: brl(p.resultado), delta, sub: p.resultadoComProventos != null ? `${ctx.fmt(p.resultadoComProventos)} com proventos` : null },
      { rotulo: 'Quantidade', valor: p.quantidade, formatar: (n) => formatNumeroBR(n, Number.isInteger(p.quantidade) ? 0 : 4), sub: `Preço médio: ${ctx.fmt(p.precoMedio)}` },
      { rotulo: 'Proventos 12 meses', valor: pr.ultimos12, formatar: formatBRL, sub: `${formatBRL(pr.total)} desde a compra` },
    ];
  }
  return montarKpis(doc, container, itens, dono);
}

// ---------------------------------------------------------------------------
// Cotação x preço-teto (a barra do "print 2": mínimo de 52 semanas -> teto)
// ---------------------------------------------------------------------------

/** 02/10/2026: link pra tela onde o Tiago edita teto/viés (menu renomeado pra
 * "Acompanhamento de Ativos"; o arquivo continua distribuicoes-metas.html). */
function linkAcompanhamentoHtml_() {
  let href = 'distribuicoes-metas.html';
  try { href = new URL('distribuicoes-metas.html', resolveSiteRootUrl()).href; } catch (_) { /* sem raiz: relativo */ }
  return `<a class="at-link-acomp" href="${esc(href)}">Acompanhamento de Ativos</a>`;
}

export function faixaHtml(ctx) {
  const f = ctx.faixa;
  if (!f) return '';
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
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
    frase = `Sem preço-teto definido - você pode definir em ${linkAcompanhamentoHtml_()}.`;
  }
  const fonteTexto = f.fonte === 'planilha'
    ? 'Mínimo e máximo de 52 semanas da aba "Carteira FIIs".'
    : (f.parcial ? `Mínimo e máximo desde que o ativo entrou na sua carteira (${formatDateBR(f.desde)}), menos de 1 ano.` : 'Mínimo e máximo das cotações dos últimos 12 meses.');
  const marcador = (classe, v, rotulo, dica) => (v == null ? '' : `<span class="at-faixa-marca ${classe} info-alvo" style="left:${pct(v)}" data-tooltip="${esc(dica)}">${rotulo ? `<span class="at-faixa-marca-rotulo">${rotulo}</span>` : ''}</span>`);
  return `
    <section class="card at-card" id="at-faixa" aria-labelledby="at-faixa-titulo">
      <div class="at-card-titulo"><h2 id="at-faixa-titulo">Cotação × preço-teto</h2>${seloViesHtml(f.vies)}</div>
      <div class="at-faixa" role="img" aria-label="Cotação ${esc(ctx.fmt(f.atual))}, mínimo ${esc(ctx.fmt(f.min))}${temTeto ? `, preço-teto ${esc(ctx.fmt(f.teto))}` : ''}">
        <div class="at-faixa-trilho">
          <span class="at-faixa-cheia ${temTeto && f.margemTeto < 0 ? 'acima' : ''}" style="left:${pct(ini)};width:${pct(Math.max(fim - ini, 0.004))}"></span>
          ${marcador('at-faixa-pm', f.posicoes.precoMedio, 'PM', `Seu preço médio: ${ctx.fmt(f.precoMedio)}`)}
          ${temTeto && f.posicoes.teto < 0.97 ? marcador('at-faixa-teto', f.posicoes.teto, 'teto', `Seu preço-teto: ${ctx.fmt(f.teto)}`) : ''}
          ${f.posicoes.min > 0.03 ? marcador('at-faixa-min', f.posicoes.min, 'mín', `${rotuloMin}: ${ctx.fmt(f.min)}`) : ''}
          ${marcador('at-faixa-max', f.posicoes.max, '', `${rotuloMax}: ${ctx.fmt(f.max)}`)}
          <span class="at-faixa-atual info-alvo${(f.posicoes.atual ?? 0.5) > 0.88 ? ' no-fim' : ((f.posicoes.atual ?? 0.5) < 0.12 ? ' no-inicio' : '')}" style="left:${pct(f.posicoes.atual ?? 0.5)}" data-tooltip="Cotação de hoje: ${esc(ctx.fmt(f.atual))}"><span class="at-faixa-atual-rotulo">${ctx.fmt(f.atual)}</span></span>
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
      ${resumoPmFaixaHtml(ctx)}
      <p class="hint at-fonte">${fonteTexto} O preço-teto e o viés vêm de ${linkAcompanhamentoHtml_()}.</p>
    </section>`;
}

// ---------------------------------------------------------------------------
// Indicadores (renda variável) / Características (renda fixa)
// ---------------------------------------------------------------------------

const AJUDA = {
  dy: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pela cotação atual.',
  pl: 'Preço/Lucro: cotação dividida pelo lucro por ação dos últimos 12 meses - quantos anos de lucro pagam o preço.',
  pvp: 'Preço/Valor Patrimonial: cotação dividida pelo patrimônio por ação/cota. Abaixo de 1, o mercado paga menos que o valor contábil.',
  descontoPvp: 'Com desconto quando o P/VP é menor que 1; caro quando é maior ou igual a 1 (Acompanhamento de Ativos).',
  descontoPl: 'Com desconto quando o retorno do lucro (1 ÷ P/L) fica acima da taxa de renda fixa atual (Acompanhamento de Ativos).',
  liquidez: 'Volume médio negociado por dia na bolsa.',
  caixa: 'Parte do patrimônio do fundo que está em caixa, ainda não aplicada em imóveis ou papéis.',
  patrimonio: 'Patrimônio líquido do fundo.',
  yoc: 'Yield on cost: proventos dos últimos 12 meses sobre o valor que você aplicou (não sobre a cotação de hoje).',
};

/** 05/10/2026 (A-18): deixa explícito QUAIS meses entram nos "12 meses" (os 12 meses fechados da meta de Renda Passiva). */
function rotuloJanela12(pr) {
  const j = pr && pr.janela12;
  if (!j || !j.inicio || !j.fim) return '';
  const mes = (m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
  return ` · ${esc(j.rotulo || '12 meses')}: ${mes(j.inicio)} a ${mes(j.fim)}`;
}

function indicadorHtml(label, valor, { ajuda = '', sub = '', texto = false, conclusao = '' } = {}) {
  return `<div class="at-ind"><div class="at-ind-linha"><span class="at-ind-label">${label}${botaoInfoHtml(ajuda, { pequeno: true })}</span><span class="at-ind-valor${texto ? ' texto' : ''}">${valor}</span></div>${sub ? `<span class="at-ind-sub">${sub}</span>` : ''}${conclusao ? `<p class="at-ind-conclusao">${conclusao}</p>` : ''}</div>`;
}

// ---------------------------------------------------------------------------
// 25/09/2026 (Tiago: "gostei que você incluiu 'A cotação está 41,5% acima do
// seu preço-teto'. Coloque esse tipo de conclusão abaixo de cada indicador"):
// uma frase por indicador traduzindo o número - só contas com os dados da
// planilha e o CDI de 12 meses da série da Início; comparação, não recomendação.
// ---------------------------------------------------------------------------

const pctTxt = (v, casas = 1) => `${formatNumeroBR(v, casas)}%`;
const destaque = (texto, bom) => `<b class="${bom ? 'good' : 'bad'}">${texto}</b>`;

const ROTULO_TOM = { bom: 'bom', neutro: 'neutro', atencao: 'atenção', ruim: 'ruim' };
/** Indicador da tela -> critério(s) do motor (o primeiro que tiver leitura). */
const CRITERIO_DO_INDICADOR = {
  dy: ['dy_12m', 'fii_dy_12m'], pvp: ['pvp', 'fii_pvp'], pl: ['pl'], liquidez: ['fii_liquidez_diaria'],
  caixa: ['fii_pct_caixa'], patrimonio: ['fii_patrimonio_liquido'], teto: ['preco_vs_teto_planilha', 'fii_preco_teto_dy'],
};
const NOME_AVISO = { pvp: /^P\/VP/, pl: /^P\/L/, dy: /^DY/ };

function tomHtml(tom) {
  return `<span class="at-tom tom-${tom}">${ROTULO_TOM[tom] || tom}</span>`;
}

/** { dy: html, pvp: html, ... } com a frase do motor (ou o aviso de dado ignorado). */
export function conclusoesDoMotor(ctx) {
  const av = ctx.avaliacao;
  const out = {};
  if (!av || !av.pontos) return out;
  Object.entries(CRITERIO_DO_INDICADOR).forEach(([k, ids]) => {
    const p = av.pontos.find((x) => ids.includes(x.criterioId));
    // preço-teto: a frase da tela já diz o mesmo - só o selo do tom
    if (p) { out[k] = k === 'teto' ? tomHtml(p.tom) : `${tomHtml(p.tom)}${esc(p.texto)}`; return; }
    const aviso = NOME_AVISO[k] && (av.avisos || []).find((t) => NOME_AVISO[k].test(t));
    if (aviso) out[k] = `<span class="at-tom tom-atencao">dado</span>${esc(aviso)}`;
  });
  return out;
}

export function conclusoesIndicadores(ctx) {
  const a = ctx.ativo || {};
  const out = {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const cdi = num(ctx.resposta && ctx.resposta.referencias && ctx.resposta.referencias.cdi12m);
  const dy = num(a.dyPercentual) != null ? a.dyPercentual * 100 : null;
  const saldo = num(ctx.posicao && ctx.posicao.saldo);

  if (dy != null) {
    if (dy <= 0) out.dy = 'Não pagou proventos nos últimos 12 meses.';
    else if (cdi && cdi > 0) {
      const rel = (dy / cdi) * 100;
      out.dy = `Só em proventos, rendeu ${pctTxt(dy)} em 12 meses: ${destaque(`${formatNumeroBR(rel, 0)}% do CDI`, dy >= cdi)} do período (${pctTxt(cdi)}).`;
    } else out.dy = `Pagou ${pctTxt(dy)} da cotação atual em proventos nos últimos 12 meses.`;
  }

  const yoc = num(ctx.proventos && ctx.proventos.yieldOnCost12);
  if (yoc != null && yoc > 0) {
    const y = yoc * 100;
    let fim = '.';
    if (dy != null && dy > 0 && Math.abs(y - dy) >= 0.1) {
      fim = y > dy ? ` - ${destaque('mais que o DY de hoje', true)}, porque você comprou abaixo da cotação atual.`
        : ` - ${destaque('menos que o DY de hoje', false)}, porque você comprou acima da cotação atual.`;
    }
    out.yoc = `Sobre o que você aplicou, os proventos de 12 meses renderam ${pctTxt(y)}${fim}`;
  }

  const pvp = num(a.pvp);
  if (pvp != null && pvp > 0) {
    const dif = (pvp - 1) * 100;
    out.pvp = Math.abs(dif) < 2
      ? 'Negocia praticamente pelo valor patrimonial.'
      : `O mercado paga ${ctx.emDolar ? 'US$' : 'R$'} ${formatNumeroBR(pvp, 2)} por ${ctx.emDolar ? 'US$' : 'R$'} 1,00 de patrimônio: ${destaque(`${pctTxt(Math.abs(dif))} ${dif < 0 ? 'abaixo' : 'acima'}`, dif < 0)} do valor patrimonial.`;
  }

  const pl = num(a.pl);
  if (pl != null && pl !== 0) {
    if (pl < 0) out.pl = `${destaque('Teve prejuízo', false)} nos últimos 12 meses (P/L negativo).`;
    else {
      const ey = 100 / pl;
      out.pl = `O preço equivale a ${formatNumeroBR(pl, 1)} anos do lucro atual - um lucro de ${cdi ? destaque(pctTxt(ey), ey >= cdi) : pctTxt(ey)} ao ano sobre a cotação${cdi ? ` (o CDI rendeu ${pctTxt(cdi)} em 12 meses)` : ''}.`;
    }
  }

  const liq = num(a.liquidezDiaria);
  if (liq != null && liq > 0) {
    out.liquidez = `Negocia em média ${formatBRLCompacto(liq)} por dia${saldo ? `; a sua posição equivale a ${pctTxt((saldo / liq) * 100, saldo / liq < 0.01 ? 2 : 1)} de um dia de negociação` : ''}.`;
  }
  const caixa = num(a.percentualEmCaixa);
  if (caixa != null) out.caixa = `${pctTxt(caixa * 100)} do patrimônio do fundo está em caixa, ainda não aplicado em imóveis ou papéis.`;
  const pat = num(a.patrimonio);
  if (pat != null && pat > 0 && saldo) out.patrimonio = `Você tem ${pctTxt((saldo / pat) * 100, saldo / pat < 0.0001 ? 4 : 3)} do fundo.`;

  const teto = num(a.precoTeto), atual = num(a.precoAtual);
  if (teto && atual) {
    const m = (teto - atual) / teto;
    out.teto = `A cotação está ${destaque(`${pctTxt(Math.abs(m) * 100)} ${m >= 0 ? 'abaixo' : 'acima'}`, m >= 0)} do seu preço-teto${m >= 0 ? ' (margem de segurança).' : '.'}`;
  }

  // 03/10/2026: a leitura do motor de critérios entra na frente de cada
  // conclusão (faixa do setor/segmento + porquê); a conta acima continua
  // depois, como complemento. Valor absurdo (erro de dado) vira o aviso.
  const motor = conclusoesDoMotor(ctx);
  // o que a frase do motor já disse sai do complemento (sem repetir o número)
  if (motor.liquidez && liq != null && liq > 0) out.liquidez = saldo ? `A sua posição equivale a ${pctTxt((saldo / liq) * 100, saldo / liq < 0.01 ? 2 : 1)} de um dia de negociação.` : '';
  if (motor.caixa) delete out.caixa;
  if (motor.dy && dy != null && dy <= 0) delete out.dy;
  Object.entries(motor).forEach(([k, html]) => { out[k] = out[k] ? `${html} ${out[k]}` : html; });

  if (ctx.ehRf && a.vencimento && ctx.resposta && ctx.resposta.hoje) {
    const p = String(a.vencimento).split('/').map(Number);
    const [ano, mes] = p.length === 3 ? [p[2], p[1]] : [p[1], p[0]];
    const [ah, mh] = String(ctx.resposta.hoje).split('-').map(Number);
    const meses = (ano - ah) * 12 + (mes - mh);
    if (Number.isFinite(meses)) {
      out.vencimento = meses <= 0 ? 'Já venceu ou vence neste mês.'
        : `Faltam ${meses >= 12 ? `${Math.floor(meses / 12)} ano${Math.floor(meses / 12) === 1 ? '' : 's'}${meses % 12 ? ` e ${meses % 12} ${meses % 12 === 1 ? 'mês' : 'meses'}` : ''}` : `${meses} ${meses === 1 ? 'mês' : 'meses'}`} para o vencimento.`;
    }
  }
  return out;
}

/** Nome do destino na tela do título ("Carteira"). */
const ROTULO_CARTEIRA_RF = { emergencial: 'Reserva de emergência', 'longo-prazo': 'Longo prazo', objetivo: ROTULO_DESTINO_RF.objetivo };

/**
 * 07/10/2026 (Tiago: fundo guardado pra comprar a chácara): o destino do título (reserva / longo prazo / reservado para objetivos) grava a
 * coluna B da Carteira Renda Fixa - a única fonte do destino. Um fundo de investimento DI entra aqui como pós-fixado "% do CDI" (aproximação:
 * taxa de administração e come-cotas não são modelados).
 */
function destinoRfHtml(a) {
  const atual = destinoRendaFixa(a.tipoCarteira);
  const opcoes = DESTINOS_RENDA_FIXA.map((d) => `<option value="${d}"${d === atual ? ' selected' : ''}>${esc(ROTULO_DESTINO_RF[d])}</option>`).join('');
  return `<div class="at-destino-rf">
      <label class="at-destino-rotulo" for="atDestinoRf">Destino deste título</label>
      <select id="atDestinoRf" data-destino-rf data-titulo="${esc(a.nomePersonalizado || a.nome || a.tipoInvestimento || '')}" data-instituicao="${esc(a.instituicao || '')}">${opcoes}</select>
      <p class="hint at-destino-dica">"Reservado para objetivos" conta no seu patrimônio, mas fica fora do longo prazo, da distribuição da carteira e da aposentadoria (use em Metas e Objetivos pra ligar a uma meta, como a chácara). É o que fica escrito na coluna B da Carteira Renda Fixa ("Objetivo"). Fundo de investimento entra como pós-fixado em % do CDI (aproximação: taxa de administração e come-cotas não entram na conta).</p>
      <p class="hint at-destino-msg" data-destino-msg role="status" hidden></p>
    </div>`;
}

export function indicadoresHtml(ctx) {
  const a = ctx.ativo;
  if (!a) return '';
  const n = (v, d = 2) => (typeof v === 'number' ? formatNumeroBR(v, d) : '—');
  let itens;
  let titulo = 'Indicadores';
  const c = conclusoesIndicadores(ctx);
  if (ctx.ehRf) {
    titulo = 'Características';
    const ir = a.irSeResgatasseHoje;
    itens = [
      indicadorHtml('Tipo', esc(a.tipoInvestimento || '—'), { texto: true }),
      indicadorHtml('Indexador', esc(a.indexador || '—')),
      indicadorHtml('Rentab. contratada', esc((a.rentabilidadeContratada && a.rentabilidadeContratada.texto) || '—')),
      indicadorHtml('Vencimento', esc(a.vencimento || '—'), { conclusao: c.vencimento }),
      indicadorHtml('Instituição', esc(a.instituicao || '—'), { texto: true }),
      indicadorHtml('Quantidade', n(a.quantidade, 2)),
      indicadorHtml('IR se resgatasse hoje', ir ? formatBRL(ir.impostoSeResgatasseHoje) : '—', { sub: ir && ir.detalhes ? esc(typeof ir.detalhes === 'string' ? ir.detalhes : '') : '' }),
      indicadorHtml('Carteira', ROTULO_CARTEIRA_RF[destinoRendaFixa(a.tipoCarteira)], { texto: true }),
    ];
  } else {
    itens = [
      indicadorHtml('DY 12 meses', formatPercentFromFraction(a.dyPercentual).replace('+', ''), { ajuda: AJUDA.dy, sub: typeof a.dyValor === 'number' ? `${ctx.fmt(a.dyValor)} por ${ctx.classe === 'fiis' ? 'cota' : 'ação'}` : '', conclusao: c.dy }),
      indicadorHtml('Yield on cost', formatPercentFromFraction(ctx.proventos.yieldOnCost12).replace('+', ''), { ajuda: AJUDA.yoc, conclusao: c.yoc }),
      indicadorHtml('P/VP', n(a.pvp), { ajuda: AJUDA.pvp, sub: a.descontoPvp ? esc(a.descontoPvp) : '', conclusao: c.pvp }),
    ];
    if (ctx.classe !== 'fiis') itens.push(indicadorHtml('P/L', n(a.pl), { ajuda: AJUDA.pl, sub: a.descontoPl ? esc(a.descontoPl) : '', conclusao: c.pl }));
    if (ctx.classe === 'fiis') {
      itens.push(
        indicadorHtml('Liquidez diária', typeof a.liquidezDiaria === 'number' ? formatBRLCompacto(a.liquidezDiaria) : '—', { ajuda: AJUDA.liquidez, conclusao: c.liquidez }),
        indicadorHtml('Em caixa', typeof a.percentualEmCaixa === 'number' ? formatPercentFromFraction(a.percentualEmCaixa, 1).replace('+', '') : '—', { ajuda: AJUDA.caixa, conclusao: c.caixa }),
        indicadorHtml('Patrimônio do fundo', typeof a.patrimonio === 'number' ? formatBRLCompacto(a.patrimonio) : '—', { ajuda: AJUDA.patrimonio, conclusao: c.patrimonio }),
      );
    }
    itens.push(indicadorHtml('Preço-teto', valorComBrl(ctx, a.precoTeto), { conclusao: c.teto }));
  }
  return `
    <details class="card at-card at-recolhe" id="at-indicadores" data-secao="indicadores" open>
      <summary class="at-card-titulo"><h2 id="at-ind-titulo">${titulo}</h2><svg class="ico at-recolhe-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary>
      <div class="at-ind-grade">${itens.join('')}</div>
      ${ctx.ehRf ? destinoRfHtml(a) : ''}
    </details>`;
}

// ---------------------------------------------------------------------------
// 03/10/2026 (Tiago: "Nas análises dos gráficos e métricas dos ativos,
// considere essas fontes... Tenha um largo banco de dados de critérios,
// para no site ser dinâmico as decisões e análises (confio na Suno,
// principalmente)" + "inclua também nas análises quando investir no ativo
// vai ajudar a chegar à meta... se o preço atual está abaixo do preço médio,
// é um ponto positivo"): card "Análise do ativo" - nota 0-100, veredito, os
// pontos que mais pesam e, recolhido, todos os critérios por grupo com a
// faixa e a fonte; os dados que faltam ficam discretos no fim.
// ---------------------------------------------------------------------------

const PONTOS_VISIVEIS = 5;
const ICONE_TOM = {
  bom: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  ruim: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  atencao: '<path d="M12 5v9"/><path d="M12 18.5v.5"/>',
  neutro: '<path d="M6 12h12"/>',
};
const iconeTom = (tom) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE_TOM[tom] || ICONE_TOM.neutro}</svg>`;

/** Espaço do anel da nota; o anel de progresso do kit (charts) entra em montarAneisNota depois do innerHTML. */
function anelNotaHtml(nota) {
  return `<span class="at-an-anel-slot" data-nota="${typeof nota === 'number' ? nota : ''}"></span>`;
}

const COR_NIVEL_NOTA = { bom: 'var(--good)', ok: 'var(--md-sys-color-primary)', misto: 'var(--warn)', ruim: 'var(--bad)', na: 'var(--ink-faint)' };

/** Desenha o anel de progresso (charts) da nota em cada espaço `.at-an-anel-slot` de `raiz`. */
function montarAneisNota(doc, raiz, dono = raiz) {
  if (!raiz) return;
  raiz.querySelectorAll('.at-an-anel-slot').forEach((slot) => {
    const nota = slot.dataset.nota === '' ? null : Number(slot.dataset.nota);
    const temNota = Number.isFinite(nota);
    const anel = criarAnelProgresso(slot, {
      valor: temNota ? Math.max(0, Math.min(100, nota)) / 100 : 0, rotulo: temNota ? String(nota) : '—', subrotulo: temNota ? 'de 100' : '',
      tamanho: 104, espessura: 10, cor: COR_NIVEL_NOTA[nivelDaNota(nota)] || COR_NIVEL_NOTA.na, aria: temNota ? 'Nota' : 'Sem nota',
    });
    lembrarGrafico(dono, anel);
  });
}

/** Rótulo curto da fonte ("Suno", "vídeo Prof. Baroni", "Itaú BBA"); o título inteiro fica no title. */
export function rotuloFonte(f) {
  const t = String((f && f.titulo) || '');
  const antes = t.split(':')[0].trim();
  if (/youtube\.com|youtu\.be/.test(String(f && f.url))) {
    const canal = /\(([^,()]+),\s*\d/.exec(t);
    return `vídeo ${canal ? canal[1].trim() : (antes.length <= 40 ? antes : '')}`.trim();
  }
  if (antes && antes.length <= 30) return antes;
  try { return new URL(f.url).hostname.replace(/^www\./, ''); } catch (_) { return 'fonte'; }
}

function fonteLinkHtml(f) {
  const url = f && urlSegura(f.url);
  return url ? `<a href="${url}" target="_blank" rel="noopener" title="${esc(f.titulo)}">${esc(rotuloFonte(f))}</a>` : '';
}

function pontoHtml(p) {
  return `<li class="at-an-ponto tom-${p.tom}"><span class="at-an-ico" title="${ROTULO_TOM[p.tom] || ''}">${iconeTom(p.tom)}</span><span class="at-an-txt">${esc(p.texto)}${ajudaHtml(p.ajuda)}</span></li>`;
}

/** 05/10/2026: "Para o seu aporte" - metas + preço médio + contexto de mercado (criterios/motor.js!leituraParaVoce); a nota continua só dos fundamentos. */
function leituraHtml(av) {
  const l = av.leitura;
  if (!l) return '';
  const classe = { favoravel: 'bom', neutro: 'neutro', cautela: 'ruim' }[l.nivel] || 'neutro';
  return `<div class="at-an-voce nivel-${classe}"><em class="at-an-voce-t">Para o seu aporte</em><strong>${esc(l.rotulo)}</strong><span>${esc(l.texto)}</span>${ajudaHtml('Junta o que pesa para o SEU aporte: as metas (completar uma meta vale mais), preço abaixo do seu preço médio e o contexto de mercado (no máximo meio ponto). Não muda a nota de fundamentos e nunca fica "a favor" se os fundamentos estão fracos ou há critério eliminatório.')}</div>`;
}

/** Chips do contexto de mercado (juro real, NTN-B, bolsa) - cada um com o "i". */
function chipsMacroHtml(macro) {
  const itens = resumoMacro(macro);
  if (!itens.length) return '';
  return `<div class="at-an-macro" aria-label="Contexto de mercado"><span class="at-an-macro-t">Contexto de mercado</span>${itens.map((i) => `<span class="at-an-chip nivel-${i.tom === 'bom' ? 'bom' : (i.tom === 'atencao' ? 'misto' : 'ok')}">${esc(i.rotulo)} <b>${esc(i.valor)}</b>${ajudaHtml(i.ajuda)}</span>`).join('')}</div>`;
}

function criterioHtml(p) {
  const meta = [
    p.faixa ? `bom: ${esc(p.faixa)}${p.regua ? ` (${esc(p.regua)})` : ''}` : '',
    p.derivado ? 'calculado' : '',
    p.informativo && p.grupo !== 'carteira' ? 'fora da nota' : '',
    (p.fontes || []).slice(0, 2).map(fonteLinkHtml).filter(Boolean).join(' · '),
  ].filter(Boolean).join(' · ');
  return `<li class="at-an-crit">
          <div class="at-an-crit-linha"><span class="at-an-crit-nome">${esc(p.nome)}</span>${p.valorTexto ? `<span class="at-an-crit-valor">${esc(p.valorTexto)}</span>` : ''}<span class="at-tom tom-${p.tom}">${ROTULO_TOM[p.tom] || p.tom}</span></div>
          <p class="at-an-crit-texto">${esc(p.texto)}</p>${p.porQue ? `
          <p class="at-an-crit-porque">${esc(p.porQue)}</p>` : ''}${meta ? `
          <p class="at-an-crit-meta">${meta}</p>` : ''}
        </li>`;
}

function nivelDaNota(nota) {
  if (typeof nota !== 'number') return 'na';
  return nota >= 75 ? 'bom' : (nota >= 55 ? 'ok' : (nota >= 35 ? 'misto' : 'ruim'));
}

export function analiseHtml(ctx) {
  const av = ctx.avaliacao;
  if (!av) return '';
  const pontos = av.pontos || [];
  if (ctx.ehRf && !pontos.length) return '';
  const temNota = typeof av.nota === 'number';
  // até 2 pontos da sua carteira (metas antes; preço médio só quando a favor) + os critérios que mais pesam
  const daCarteira = pontos.filter((p) => p.grupo === 'carteira' && (p.metaId || p.tom === 'bom'))
    .sort((x, y) => (y.metaId ? 1 : 0) - (x.metaId ? 1 : 0)).slice(0, ctx.ehRf ? 4 : 2);
  // 05/10/2026: o contexto de mercado tem lugar próprio (1 linha, com o "i"); não disputa as linhas dos fundamentos
  const doContexto = pontos.filter((p) => p.grupo === 'contexto').slice(0, 2);
  const visiveis = [...pontos.filter((p) => p.grupo !== 'carteira' && p.grupo !== 'contexto' && p.tom !== 'neutro').slice(0, PONTOS_VISIVEIS - (daCarteira.length ? 1 : 0)), ...daCarteira, ...doContexto];
  const grupos = Object.entries(av.notaPorGrupo || {});
  const porGrupo = {};
  pontos.forEach((p) => { (porGrupo[p.grupo] || (porGrupo[p.grupo] = [])).push(p); });
  const ordemGrupos = Object.keys(GRUPOS).filter((g) => porGrupo[g]);
  const todos = ordemGrupos.map((g) => `
        <div class="at-an-grupo-bloco">
          <h3>${esc(GRUPOS[g])}${av.notaPorGrupo[g] && typeof av.notaPorGrupo[g].nota === 'number' ? `<span class="at-an-grupo-nota nivel-${nivelDaNota(av.notaPorGrupo[g].nota)}">${av.notaPorGrupo[g].nota}</span>` : ''}</h3>
          <ul class="at-an-crits">${porGrupo[g].map(criterioHtml).join('')}</ul>
        </div>`).join('');
  const faltam = (av.dadosFaltantes || []).filter((d) => d.peso >= 2);
  const topo = ctx.ehRf ? '' : `
      <div class="at-an-topo nivel-${temNota ? nivelDaNota(av.nota) : 'na'}">
        <div class="at-an-nota" role="img" aria-label="${temNota ? `Nota ${av.nota} de 100` : 'Sem nota: poucos dados'}">${anelNotaHtml(av.nota)}</div>
        <div class="at-an-veredito"><strong>${esc(av.veredito.rotulo)}</strong><span>${esc(av.veredito.texto)}${av.regua ? ` Régua de ${esc(av.regua)}.` : ''}</span></div>
      </div>${grupos.length > 1 ? `
      <div class="at-an-grupos">${grupos.map(([g, x]) => `<span class="at-an-chip nivel-${nivelDaNota(x.nota)}" title="${x.n} critério${x.n === 1 ? '' : 's'}">${esc(x.nome)} <b>${x.nota}</b></span>`).join('')}</div>` : ''}`;
  return `
    <details class="card at-card at-recolhe at-analise" id="at-analise" data-secao="analise" open>
      <summary class="at-card-titulo"><h2 id="at-analise-titulo">${ctx.ehRf ? 'Análise do título' : 'Análise do ativo'}</h2><span class="hint">${ctx.ehRf ? 'suas metas' : `${av.cobertura.avaliados} critérios`}</span><svg class="ico at-recolhe-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary>${topo}
      ${leituraHtml(av)}
      ${visiveis.length ? `<ul class="at-an-pontos">${visiveis.map(pontoHtml).join('')}</ul>` : ''}${ctx.macro ? chipsMacroHtml(ctx.macro) : ''}${av.avisos && av.avisos.length ? `
      <p class="at-an-aviso">${av.avisos.map(esc).join(' ')}</p>` : ''}${ctx.ehRf ? '' : `
      <details class="at-an-todos">
        <summary>Ver todos os critérios (${pontos.length})</summary>${todos}
      </details>`}${faltam.length ? `
      <details class="at-an-faltam">
        <summary>Dados que faltam (${faltam.length})</summary>
        <p>${faltam.map((d) => esc(d.nome)).join(' · ')}. Chegam com a fonte de fundamentos; sem eles a nota usa só o que a planilha tem.</p>
      </details>` : ''}
      <p class="hint at-fonte">${ctx.ehRf ? 'Conta com as suas metas de Metas e Objetivos (vínculo pelo título, pela marca Renda Emergencial/longo prazo ou pela classe).' : 'Leitura automática de critérios públicos (Suno, Barsi, Bazin, Graham, Baroni e outros) com os seus dados.'} Não é recomendação.</p>
    </details>`;
}

/** Redesenha só o card da análise (quando as metas chegam). */
function trocarAnalise(raiz, ctx, doc = raiz && raiz.ownerDocument) {
  const atual = raiz && raiz.querySelector('#at-analise');
  const html = analiseHtml(ctx);
  if (atual) {
    const aberta = atual.open;
    if (html) { atual.outerHTML = html; const novo = raiz.querySelector('#at-analise'); if (novo) novo.open = aberta; } else atual.remove();
  } else {
    const ind = raiz && raiz.querySelector('#at-indicadores');
    if (ind && html) ind.insertAdjacentHTML('afterend', html);
  }
  montarAneisNota(doc, raiz && raiz.querySelector('#at-analise'), raiz);
}

// ---------------------------------------------------------------------------
// Gráficos (mesmo motor das Carteiras)
// ---------------------------------------------------------------------------

function graficosHtml(ctx) {
  // 25/09/2026 (Tiago, ponto 4b): "os gráficos estão em reais, traga o filtro R$/Dólar" - o toggle só faz sentido pra ações EUA (é o
  // único caso em que o histórico do ativo é convertido de moeda); ligarGraficos decide se mostra (precisa de câmbio por dia no histórico).
  const toggleMoeda = ctx.classe === 'acoesEua' ? `
      <div class="cc-moeda-linha" id="atMoedaLinha" hidden>
        <span class="cc-moeda-rotulo" id="atMoedaRotulo">Ver valores em</span>
        <div class="segmented cc-moeda-toggle" id="atMoedaToggle" role="group" aria-labelledby="atMoedaRotulo">
          <button type="button" data-moeda="BRL" aria-pressed="false">R$</button>
          <button type="button" data-moeda="USD" aria-pressed="false">US$</button>
        </div>
      </div>` : '';
  return `
    <section class="at-bloco" id="at-graficos" aria-label="Gráficos do ativo">${toggleMoeda}
      <div id="atGraficos" class="cc-graficos"></div>
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

/**
 * 06/10/2026 (Onda 3): os 2 gráficos (Rentabilidade e Valor aplicado × saldo) são os da biblioteca assets/js/charts, montados por
 * criarGraficosCarteira (carteiras-graficos.js - o mesmo bloco das Carteiras, com o seletor de período canônico + "Escolher período").
 * O período vale pros dois e fica guardado sob a chave 'ativo' (acompanha quem pula de um ativo pro outro).
 */
function ligarGraficos(doc, ctx, dono) {
  const alvo = doc.getElementById('atGraficos');
  if (!alvo) return;
  const linhaMoeda = doc.getElementById('atMoedaLinha');
  if (ctx.historico.length < 2) {
    if (linhaMoeda) linhaMoeda.hidden = true;
    mostrarEstadoVazio(alvo, { icone: 'show-chart', titulo: 'Ainda sem histórico', texto: 'Ainda não há histórico suficiente deste ativo pra desenhar o gráfico.', doc });
    return;
  }
  // 25/09/2026 (Tiago, ponto 4b): só ações EUA (o histórico do ativo, ao contrário da tabela de Carteiras, só converte pra dólar quando
  // há câmbio por dia gravado em cada ponto - ver comCamposUsdAtivo em ativo-calc.js).
  const podeAlternarMoeda = ctx.classe === 'acoesEua' && historicoAtivoTemCambioUsd(ctx.historico);
  const historicoComUsd = podeAlternarMoeda ? comCamposUsdAtivo(ctx.historico) : ctx.historico;
  const toggleEl = doc.getElementById('atMoedaToggle');
  let graficos = null;

  function desenhar_(moeda) {
    const emDolar = podeAlternarMoeda && moeda === 'USD';
    const periodoAnterior = graficos && graficos.filtro && typeof graficos.filtro.periodo === 'string' ? graficos.filtro.periodo : undefined;
    graficos = criarGraficosCarteira(doc, alvo, {
      historico: historicoComUsd, chavePeriodo: 'ativo', periodoInicial: periodoAnterior, titulo: 'Desempenho',
      paineis: [{
        visaoId: emDolar ? 'ativoAcoesEuaUsd' : ctx.cfg.visao,
        moeda: emDolar ? 'USD' : 'BRL',
        camposProventos: ctx.ehRf ? null : [emDolar ? 'proventosAtivoUsd' : 'proventosAtivo'],
        titulo: 'Rentabilidade',
        labelInfo: ctx.ehRf ? 'Título' : ctx.ticker,
        labelPrincipal: ctx.ehRf ? 'Título' : ctx.ticker,
        tituloEvolucao: ctx.ehRf ? 'Valor aplicado × saldo bruto' : 'Valor aplicado × saldo',
        labelInfoEvolucao: ctx.ehRf ? 'Saldo bruto' : `Saldo em ${ctx.ticker}${emDolar ? '' : (ctx.emDolar ? ' (em reais)' : '')}`,
        labelValor: ctx.ehRf ? 'Saldo bruto' : 'Saldo',
        corToken: ctx.cfg.token,
        // 02/10/2026 (pedido C): card de Análise embaixo da Rentabilidade (o ativo vs o índice da bolsa e o CDI)
        analise: true,
        nomeAnalise: ctx.ehRf ? 'O título' : ctx.ticker,
        // 03/10/2026 (base de critérios de rentabilidade): título de renda fixa -> indexador/vencimento/taxa contratada (régua IPCA + taxa,
        // duration na marcação a mercado; reserva -> régua da reserva); renda variável -> proventos que já passaram da data-com e ainda
        // não foram pagos (a cota já caiu, o dinheiro ainda não entrou).
        analiseExtra: ctx.ehRf
          ? {
            rf: ctx.ativo ? { indexador: ctx.ativo.indexador || '', vencimento: ctx.ativo.vencimento || '', taxa: (ctx.ativo.rentabilidadeContratada && ctx.ativo.rentabilidadeContratada.texto) || '', nome: ctx.ativo.nomePersonalizado || ctx.ticker || '' } : null,
            ...(ctx.ativo && destinoRendaFixa(ctx.ativo.tipoCarteira) === DESTINO_EMERGENCIAL ? { classe: 'reserva' } : {}),
          }
          : { proventosAReceber: emDolar ? null : ((ctx.resposta && ctx.resposta.aReceber) || null) },
        comparativo: true,
      }],
    });
    lembrarGrafico(dono, graficos);
  }

  if (!toggleEl || !podeAlternarMoeda) {
    if (linhaMoeda) linhaMoeda.hidden = true;
    desenhar_('BRL');
    return;
  }

  function aplicarMoeda_(moeda) {
    toggleEl.querySelectorAll('[data-moeda]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.moeda === moeda ? 'true' : 'false'));
    desenhar_(moeda);
  }
  if (linhaMoeda) linhaMoeda.hidden = false;
  toggleEl.querySelectorAll('[data-moeda]').forEach((b) => {
    b.addEventListener('click', () => {
      guardarMoedaAtivo_(ctx.ticker, b.dataset.moeda);
      aplicarMoeda_(b.dataset.moeda);
    });
  });
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

/** Filtro de ano (select compacto, do lado direito do título - Tiago: "o filtro ficou perdido"). */
function selectAnoHtml(anos, ativo, id) {
  if (anos.length < 2) return '';
  return `<label class="at-select-caixa" title="Filtrar por ano"><span class="sr-only">Ano</span>
    <select class="select at-select" id="${id}">
      <option value=""${ativo ? '' : ' selected'}>Todos os anos</option>
      ${anos.map((a) => `<option value="${a}"${ativo === a ? ' selected' : ''}>${a}</option>`).join('')}
    </select></label>`;
}

function botaoCsvHtml(id) {
  return `<button type="button" class="btn btn-text btn-sm at-csv" id="${id}" title="Baixar a tabela (com o filtro atual) como CSV pra abrir no Excel/Planilhas">
    <svg class="ico" aria-hidden="true"><use href="#ico-download"/></svg>CSV</button>`;
}

// ---- exportar CSV (25/09/2026: "me dê a opção de exportar essas tabelas para um csv") ----
// Separador ";" e vírgula decimal (o Excel/Planilhas em português abre direto,
// cada número numa coluna) + BOM pra acentuação sair certa.
export function csvDe(cabecalhos, linhas) {
  const cel = (v) => {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const txt = typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6).replace('.', ',') : String(v);
    return /[";\r\n]/.test(txt) ? `"${txt.replace(/"/g, '""')}"` : txt;
  };
  return '﻿' + [cabecalhos, ...linhas].map((l) => l.map(cel).join(';')).join('\r\n');
}


export function csvMensal(ctx, lista) {
  const idx = ctx.cfg.indice.label;
  const cab = ['Mês', 'Saldo (R$)', ...(ctx.ehRf ? [] : ['Quantidade']), 'Rentabilidade no mês (%)', `${idx} (%)`, 'CDI (%)', '% do patrimônio', ...(ctx.ehRf ? [] : ['Proventos (R$)']), 'Aplicado (R$)'];
  const linhas = lista.map((m) => [
    `${m.mes.slice(5, 7)}/${m.mes.slice(0, 4)}`, m.saldo, ...(ctx.ehRf ? [] : [m.cotas]), m.rentabilidade, m.indice, m.cdi,
    m.percentualCarteira != null ? m.percentualCarteira * 100 : null, ...(ctx.ehRf ? [] : [m.proventos || 0]), m.aplicado,
  ]);
  return csvDe(cab, linhas);
}

export function csvExtrato(ctx, lista) {
  const cab = ['Data', 'Data com', 'Tipo', 'Quantidade', ctx.ehRf ? 'Preço' : 'Preço / por cota', 'Moeda', 'Total', 'Total (R$)', 'Lucro/prejuízo'];
  const linhas = lista.map((e) => [
    formatDMA(e.data, ''), formatDMA(e.dataCom, ''), e.tipo, e.quantidade, e.preco, e.moeda, e.total,
    typeof e.totalBrl === 'number' ? e.totalBrl : (e.moeda === 'USD' ? null : e.total), typeof e.lucro === 'number' && !e.entrada ? e.lucro : null,
  ]);
  return csvDe(cab, linhas);
}

function baixarCsv(doc, nomeArquivo, conteudo) {
  const janela = doc.defaultView;
  if (!janela || !janela.Blob || !janela.URL || typeof janela.URL.createObjectURL !== 'function') return false;
  const url = janela.URL.createObjectURL(new janela.Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = doc.createElement('a');
  a.href = url; a.download = nomeArquivo; a.hidden = true;
  doc.body.appendChild(a); a.click(); a.remove();
  janela.setTimeout(() => janela.URL.revokeObjectURL(url), 2000);
  return true;
}

const nomeArquivoCsv = (ctx, qual, ano) => `${String(ctx.ticker).replace(/[^\w.-]+/g, '-').slice(0, 40)}-${qual}${ano ? `-${ano}` : ''}.csv`;

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

const pctPill = (v) => (typeof v === 'number' ? variacaoHtml(v / 100) : '—');
const pctTexto = (v) => (typeof v === 'number' ? `<span class="${cor(v)}">${formatPercentFromPoints(v)}</span>` : '—');

export function colunasMensal(ctx) {
  const idx = ctx.cfg.indice;
  return [
    { label: 'Mês', campo: 'mes', topo: true, ordenarPor: (m) => m.mes, formatar: (m) => `<b>${rotuloMes(m.mes)}</b>` },
    { label: 'Saldo', campo: 'saldo', num: true, ordenarPor: (m) => m.saldo, formatar: (m) => formatBRL(m.saldo) },
    ...(ctx.ehRf ? [] : [{ label: 'Qtd', campo: 'cotas', num: true, opc: true, ordenarPor: (m) => m.cotas, formatar: (m) => (m.cotas != null ? formatNumeroBR(m.cotas, Number.isInteger(m.cotas) ? 0 : 3) : '—') }]),
    {
      label: 'Rentab.', campo: 'rentabilidade', num: true, ordenarPor: (m) => m.rentabilidade,
      ajuda: `Rentabilidade do ativo no mês (já descontando compras e vendas) e a diferença pro ${idx.label}.`,
      formatar: (m) => {
        const dif = typeof m.rentabilidade === 'number' && typeof m.indice === 'number' ? m.rentabilidade - m.indice : null;
        return `${pctPill(m.rentabilidade)}${dif != null ? `<span class="cc-sub ${cor(dif)}">${dif >= 0 ? '+' : ''}${formatNumeroBR(dif, 2)} p.p. vs ${esc(idx.label)}</span>` : ''}`;
      },
    },
    { label: idx.label, campo: 'indice', num: true, opc: true, ordenarPor: (m) => m.indice, formatar: (m) => pctTexto(m.indice) },
    { label: 'CDI', campo: 'cdi', num: true, opc: true, ordenarPor: (m) => m.cdi, formatar: (m) => pctTexto(m.cdi) },
    { label: '% patrim.', campo: 'percentualCarteira', num: true, opc: true, ordenarPor: (m) => m.percentualCarteira, formatar: (m) => (m.percentualCarteira != null ? formatPercentFromFraction(m.percentualCarteira, 1).replace('+', '') : '—') },
    ...(ctx.ehRf ? [] : [{ label: 'Proventos', campo: 'proventos', num: true, opc: true, ordenarPor: (m) => m.proventos, formatar: (m) => (m.proventos ? formatBRL(m.proventos) : '—') }]),
    { label: 'Aplicado', campo: 'aplicado', num: true, opc: true, ordenarPor: (m) => m.aplicado, formatar: (m) => formatBRL(m.aplicado) },
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
  return `<tr><td class="at-rodape-tabela" colspan="${colunasMensal(ctx).length}"><b>${ano ? `Em ${ano}` : `Desde o início (${lista.length} meses)`}</b> · ${partes.join(' · ')}</td></tr>`;
}

/** Casca do Mês a mês: título à esquerda, controles (vista, ano, CSV) à direita; tabela/gráfico entram em ligarExtratoEMensal. */
export function mensalHtml(ctx) {
  const st = estadoTabelas(ctx).mensal;
  if (!ctx.mensal.length) return '<div class="at-cab-bloco"><h2>Mês a mês</h2></div><p class="hint">Sem histórico ainda.</p>';
  return `
    <div class="at-cab-bloco at-tabela-topo"><div class="at-cab-titulos"><h2>Mês a mês</h2><span class="hint">saldo no fim do mês, em reais</span></div>
      <div class="at-controles">
        <div class="segmented at-vista" id="atMensalVista" role="group" aria-label="Ver como">
          <button type="button" data-vista="tabela" aria-pressed="${st.vista === 'tabela'}">Tabela</button>
          <button type="button" data-vista="grafico" aria-pressed="${st.vista === 'grafico'}">Gráfico</button>
        </div>
        ${selectAnoHtml(anosDe(ctx.mensal, 'mes'), st.ano, 'atMensalAno')}
        ${botaoCsvHtml('atMensalCsv')}
      </div>
    </div>
    <div id="atMensalTabela"${st.vista === 'tabela' ? '' : ' hidden'}></div>
    <div id="atMensalGrafico" class="card at-mensal-grafico"${st.vista === 'grafico' ? '' : ' hidden'}></div>`;
}

/**
 * Gráfico do mês a mês (06/10/2026: agora o de barras agrupadas de assets/js/charts): barra = rentabilidade do ativo no mês (cor da
 * classe), barra ao lado = o índice de referência no mesmo mês. A dica por mês vem do gráfico (mouse, toque e setas).
 */
export function dadosGraficoMensal(ctx, meses) {
  const lista = [...meses].sort((a, b) => (a.mes < b.mes ? -1 : 1)).filter((m) => typeof m.rentabilidade === 'number' || typeof m.indice === 'number');
  const idx = ctx.cfg.indice;
  return {
    lista,
    modo: 'agrupadas',
    categorias: lista.map((m) => rotuloMes(m.mes)),
    series: [
      { id: 'ativo', nome: `${ctx.ticker} (rentab. no mês)`, cor: corDoToken(ctx.cfg.token), valores: lista.map((m) => (typeof m.rentabilidade === 'number' ? m.rentabilidade : null)) },
      { id: 'indice', nome: idx.label, cor: 'var(--md-sys-color-outline)', valores: lista.map((m) => (typeof m.indice === 'number' ? m.indice : null)) },
    ],
    aria: `Rentabilidade de ${ctx.ticker} mês a mês comparada ao ${idx.label}`,
  };
}

// ---------------------------------------------------------------------------
// Proventos
// ---------------------------------------------------------------------------

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
      <div class="at-cab-bloco"><div class="at-cab-titulos"><h2>Proventos</h2><span class="hint">líquidos, em reais${ctx.emDolar ? ' (câmbio do dia do pagamento)' : ''}</span></div></div>
      <div class="card at-card">
        <div class="at-prov-stats">
          ${indicadorHtml('Recebidos no total', formatBRL(pr.total), { sub: pr.primeiroPagamento ? `desde ${formatDateBR(pr.primeiroPagamento)}` : '' })}
          ${indicadorHtml('Últimos 12 meses', formatBRL(pr.ultimos12), { sub: `média de ${formatBRL(pr.mediaMensal12)}/mês${rotuloJanela12(pr)}` })}
          ${indicadorHtml('Neste mês', formatBRL(pr.mesAtual), { sub: pr.totalAReceber ? `+ ${formatBRL(pr.totalAReceber)} a receber` : '' })}
          ${indicadorHtml('Yield on cost', formatPercentFromFraction(pr.yieldOnCost12).replace('+', ''), { ajuda: AJUDA.yoc })}
        </div>
        <div class="at-sub-titulo">Por mês · últimos 24 meses</div>
        <div id="atBarrasProventos" class="at-barras-wrap"></div>
        <div class="ag-slot at-prov-analise" id="atProvAnalise" hidden></div>
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

const CHIP_EXTRATO = { provento: 'chip-good', entrada: 'chip-info', saida: 'chip-warn' };

export function colunasExtrato(ctx) {
  const fmtItem = (e, v) => (e.moeda === 'USD' ? formatUSD(v) : formatBRL(v));
  return [
    { label: 'Data', campo: 'data', topo: true, ordenarPor: (e) => e.data,
      formatar: (e) => `<b>${formatDateBR(e.data)}</b>${e.dataCom ? `<span class="cc-sub">data com ${formatDateBR(e.dataCom)}</span>` : ''}` },
    { label: 'Tipo', campo: 'tipo', ordenarPor: (e) => e.tipo,
      formatar: (e) => `<span class="chip-tonal ${CHIP_EXTRATO[e.grupo === 'provento' ? 'provento' : (e.entrada ? 'entrada' : 'saida')]}">${esc(e.tipo)}</span>` },
    { label: 'Qtd', campo: 'quantidade', num: true, opc: true, ordenarPor: (e) => e.quantidade,
      formatar: (e) => (e.quantidade != null ? formatNumeroBR(e.quantidade, Number.isInteger(e.quantidade) ? 0 : 4) : '—') },
    { label: ctx.ehRf ? 'Preço' : 'Preço / por cota', campo: 'preco', num: true, opc: true, ordenarPor: (e) => e.preco,
      formatar: (e) => (e.preco != null ? (e.grupo === 'provento' ? `${e.moeda === 'USD' ? 'US$' : 'R$'} ${formatNumeroBR(e.preco, 4)}` : fmtItem(e, e.preco)) : '—') },
    { label: 'Total', campo: 'total', num: true, ordenarPor: (e) => (typeof e.totalBrl === 'number' ? e.totalBrl : e.total),
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
  return `<tr><td class="at-rodape-tabela" colspan="${colunasExtrato(ctx).length}"><b>${lista.length} lançamento${lista.length === 1 ? '' : 's'}</b>${partes.length ? ` · ${partes.join(' · ')}` : ''}</td></tr>`;
}

function extratoHtml(ctx) {
  const st = estadoTabelas(ctx).extrato;
  const temProv = ctx.extrato.some((e) => e.grupo === 'provento');
  const filtro = (id, rotulo) => `<button type="button" data-filtro="${id}" aria-pressed="${st.filtro === id}">${rotulo}</button>`;
  const filtros = temProv ? `
        <div class="segmented at-extrato-filtros" id="atExtratoFiltros" role="group" aria-label="Tipo de lançamento">
          ${filtro('todos', 'Tudo')}${filtro('movimentacao', ctx.ehRf ? 'Aplicações e resgates' : 'Compras e vendas')}${filtro('provento', ctx.ehRf ? 'Juros' : 'Proventos')}
        </div>` : '';
  return `
    <section class="at-bloco" id="at-extrato">
      <div class="at-cab-bloco at-tabela-topo"><div class="at-cab-titulos"><h2>Extrato</h2><span class="hint">${ctx.extrato.length} lançamentos</span></div>
        <div class="at-controles">${filtros}
          ${selectAnoHtml(anosDe(ctx.extrato, 'data'), st.ano, 'atExtratoAno')}
          ${botaoCsvHtml('atExtratoCsv')}
        </div>
      </div>
      <div id="atExtratoTabela"></div>
    </section>`;
}

/** Desenha o gráfico do mês a mês (só quando a aba Extrato e a vista Gráfico estão visíveis; refaz do zero, é barato). */
function desenharGraficoMensal(doc, ctx, dono) {
  const alvo = doc.getElementById('atMensalGrafico');
  if (!alvo || alvo.hidden) return;
  const st = estadoTabelas(ctx).mensal;
  const meses = st.ano ? ctx.mensal.filter((m) => m.mes.startsWith(st.ano)) : ctx.mensal.slice(0, 24);
  const d = dadosGraficoMensal(ctx, meses);
  if (alvo._grafico) { try { alvo._grafico.destruir(); } catch (_) { /* já saiu do DOM */ } alvo._grafico = null; }
  alvo.replaceChildren();
  if (!d.lista.length) { alvo.append(criar(doc, 'p', { class: 'hint', texto: 'Sem meses com rentabilidade calculada.' })); return; }
  alvo._grafico = lembrarGrafico(dono, criarGraficoBarras(alvo, {
    modo: d.modo, categorias: d.categorias, series: d.series, altura: 260, aria: d.aria,
    formatarValor: (v) => formatPercentFromPoints(v), formatarY: (v) => `${formatNumeroBR(v, 1)}%`,
  }));
}

function ligarExtratoEMensal(doc, ctx, dono) {
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
      tituloFolha: (m) => rotuloMes(m.mes),
      onOrdenar: (campo) => { st.ordenacao = alternarOrdem(st.ordenacao, campo); desenharMensal(); },
    });
    if (!st.ano && filtrados.length > MENSAL_INICIAL) {
      tabMensal.insertAdjacentHTML('beforeend', `<button class="btn btn-tonal btn-sm at-mais" type="button" data-acao="mensal-todos">${st.todos ? 'Mostrar só 12 meses' : `Ver os ${filtrados.length} meses`}</button>`);
    }
    desenharGraficoMensal(doc, ctx, dono);
  };
  if (tabMensal) tabMensal.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('[data-acao="mensal-todos"]')) { est.mensal.todos = !est.mensal.todos; desenharMensal(); }
  });
  const anoMensal = doc.getElementById('atMensalAno');
  if (anoMensal) anoMensal.addEventListener('change', () => { est.mensal.ano = anoMensal.value || null; desenharMensal(); });
  const csvMensalBtn = doc.getElementById('atMensalCsv');
  if (csvMensalBtn) csvMensalBtn.addEventListener('click', () => {
    const st = est.mensal;
    const lista = ordenarLista(st.ano ? ctx.mensal.filter((m) => m.mes.startsWith(st.ano)) : ctx.mensal, colsM, st.ordenacao);
    baixarCsv(doc, nomeArquivoCsv(ctx, 'mes-a-mes', st.ano), csvMensal(ctx, lista));
  });
  const vista = doc.getElementById('atMensalVista');
  if (vista) vista.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => {
    est.mensal.vista = b.dataset.vista;
    vista.querySelectorAll('[data-vista]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const g = doc.getElementById('atMensalGrafico');
    if (tabMensal) tabMensal.hidden = est.mensal.vista !== 'tabela';
    if (g) g.hidden = est.mensal.vista !== 'grafico';
    desenharGraficoMensal(doc, ctx, dono);
  }));
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
      tituloFolha: (e) => `${e.tipo} · ${formatDateBR(e.data)}`,
      onOrdenar: (campo) => { st.ordenacao = alternarOrdem(st.ordenacao, campo); desenharExtrato(); },
    });
    if (filtrados.length > EXTRATO_INICIAL) {
      tabExtrato.insertAdjacentHTML('beforeend', `<button class="btn btn-tonal btn-sm at-mais" type="button" data-acao="extrato-todos">${st.todos ? 'Mostrar menos' : `Ver tudo (${filtrados.length})`}</button>`);
    }
  };
  if (tabExtrato) tabExtrato.addEventListener('click', (ev) => {
    if (ev.target.closest && ev.target.closest('[data-acao="extrato-todos"]')) { est.extrato.todos = !est.extrato.todos; desenharExtrato(); }
  });
  const filtros = doc.getElementById('atExtratoFiltros');
  if (filtros) filtros.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    filtros.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    est.extrato.filtro = b.dataset.filtro; est.extrato.todos = false; desenharExtrato();
  }));
  const anoExtrato = doc.getElementById('atExtratoAno');
  if (anoExtrato) anoExtrato.addEventListener('change', () => { est.extrato.ano = anoExtrato.value || null; est.extrato.todos = false; desenharExtrato(); });
  const csvExtratoBtn = doc.getElementById('atExtratoCsv');
  if (csvExtratoBtn) csvExtratoBtn.addEventListener('click', () => {
    const st = est.extrato;
    const lista = ordenarLista(ctx.extrato.filter((e) => (st.filtro === 'todos' || e.grupo === st.filtro) && (!st.ano || String(e.data).startsWith(st.ano))), colsE, st.ordenacao);
    baixarCsv(doc, nomeArquivoCsv(ctx, 'extrato', st.ano), csvExtrato(ctx, lista));
  });
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
      ${r.recomendacao ? `<span class="chip-tonal ${/compra/i.test(r.recomendacao) ? 'chip-good' : (/aguard|manter|neutr/i.test(r.recomendacao) ? 'chip-warn' : '')}">${esc(r.recomendacao)}</span>` : ''}
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
        <span><b>${t.data ? formatDateBR(t.data) : esc(t.nome)}</b>${t.maisRecente ? ' <span class="chip-tonal">mais recente</span>' : ''}</span>
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
  const chips = [s.setor, s.segmento, s.tipo && ctx.classe === 'fiis' ? s.tipo : null, s.pais].filter(Boolean).map((c) => `<span class="chip-tonal">${esc(c)}</span>`).join('');
  const secoes = (Array.isArray(s.secoes) ? s.secoes : []).filter((sec) => sec && (sec.titulo || sec.texto)).map((sec) => `
        <section class="at-sobre-secao">
          ${sec.titulo ? `<h3>${esc(sec.titulo)}</h3>` : ''}
          ${figuraSobreHtml(sec.imagem, 'at-sobre-fig-lateral')}
          ${paragrafos(sec.texto)}
        </section>`).join('');
  const fontes = (Array.isArray(s.fontes) ? s.fontes : []).map((u) => urlSegura(u)).filter(Boolean);
  // 25/09/2026 (Tiago: "tem que ficar em cards separados, como antes"): texto
  // num cartão, ficha no outro (lado a lado; um embaixo do outro no celular)
  return `
    <div class="at-sobre-grade" id="at-sobre">
      <section class="card at-card at-sobre" aria-labelledby="at-sobre-titulo">
        <header class="at-sobre-topo">
          ${logoCirculoHtml(ctx.ticker)}
          <div>
            <h2 id="at-sobre-titulo">Sobre ${esc(ctx.ticker)}</h2>
            ${s.nome ? `<p class="at-sobre-nome">${esc(s.nome)}</p>` : ''}
            ${chips ? `<div class="at-chips">${chips}</div>` : ''}
          </div>
        </header>
        ${figuraSobreHtml(s.imagem, 'at-sobre-fig-destaque')}
        <div class="at-sobre-texto">
          ${s.descricao ? `<div class="at-sobre-desc">${paragrafos(s.descricao)}</div>` : ''}
          ${secoes}
        </div>
        ${fontes.length ? `<p class="hint at-fonte">Fontes: ${fontes.map((u) => `<a href="${u}" target="_blank" rel="noopener">${esc(hostDe(u))}</a>`).join(' · ')}</p>` : ''}
      </section>
      <aside class="card at-card at-sobre-ficha" aria-labelledby="at-ficha-titulo">
        <div class="at-card-titulo"><h2 id="at-ficha-titulo">Ficha</h2></div>
        ${campos ? `<dl class="at-dl">${campos}</dl>` : ''}
        ${links ? `<div class="at-links">${links}</div>` : ''}
      </aside>
    </div>`;
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
      <header class="at-ir-fonte-topo"><h3>${esc(f.nome)}</h3>${f.papel ? `<span class="chip-tonal">${esc(f.papel)}</span>` : ''}</header>
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
      <div class="at-cab-bloco"><div class="at-cab-titulos"><h2>Imposto de renda</h2><span class="hint">Como declarar e onde baixar o informe</span></div></div>
      <div class="card at-card">
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
    <details class="card at-card at-recolhe" id="at-tese" data-secao="tese" open>
      <summary class="at-card-titulo"><h2 id="at-tese-titulo">Tese de investimento</h2><span class="hint">Suno Research</span><svg class="ico at-recolhe-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary>
      <div id="atTeseConteudo">${teseHtml(ctx, null)}</div>
    </details>`;
}

function informesFundoCardHtml_(ctx) {
  return `
    <details class="card at-card at-recolhe" id="at-informes" data-secao="informes" open>
      <summary class="at-card-titulo"><h2 id="at-informes-titulo">Informes do fundo</h2><span class="hint">FNet / CVM</span><svg class="ico at-recolhe-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary>
      ${informesFundoHtml(ctx)}
    </details>`;
}

function noticiasCardHtml_() {
  return `
      <details class="card at-card at-recolhe" id="at-noticias" data-secao="noticias" open>
      <summary class="at-card-titulo"><h2 id="at-noticias-titulo">Últimas notícias</h2><span class="hint">Google Notícias</span><svg class="ico at-recolhe-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary>
        <div id="atNoticiasConteudo">${noticiasHtml(null)}</div>
      </details>`;
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
      ${indicadoresHtml(ctx)}
      ${cotaFundoHtml(ctx)}
      ${analiseHtml(ctx)}` : `
      ${linksRelevantesHtml(ctx)}
      ${faixaHtml(ctx)}
      ${indicadoresHtml(ctx)}
      ${analiseHtml(ctx)}
      ${ehFii ? informesFundoCardHtml_(ctx) : ''}`;
  // 02/10/2026: o canal oficial (canais-youtube.js) fica no topo da seção de
  // vídeos; renda fixa só tem a seção quando é do Tesouro (canal Tesouro Direto)
  const videos = secaoVideosHtml('at-videos', {
    hint: ctx.canal ? 'do canal oficial e dos seus canais do YouTube que citam o ativo' : 'dos seus canais do YouTube que citam o ativo',
    canal: ctx.canal,
  });
  const principal = ctx.ehRf ? `
      ${graficosHtml(ctx)}
      ${irResgateHtml(ctx)}
      ${ctx.canal ? videos : ''}` : `
      ${graficosHtml(ctx)}
      ${secaoPmHtml(ctx)}
      ${proventosHtml(ctx)}
      ${noticiasCardHtml_()}
      ${videos}
      ${ehFii ? '' : teseCardHtml_(ctx)}`;
  const painel = (id, conteudo) => `
      <section class="at-aba" id="at-aba-${id}" role="tabpanel" aria-label="${ABAS_ROTULO[id] || id}"${id === aba ? '' : ' hidden'}>${conteudo}
      </section>`;
  return `
    <div class="at-pagina" style="--accent:var(${ctx.cfg.token}); --accent-soft:var(${ctx.cfg.soft})">
      ${heroHtml(ctx)}
      ${painel('visao', `
        <div class="at-resumo-wrap" id="atResumo"></div>
        <div class="at-grade">
          <div class="at-col at-col-principal">${principal}</div>
          <aside class="at-col at-col-lateral">${lateral}</aside>
        </div>`)}
      ${painel('extrato', `
        <section class="at-bloco" id="at-mensal">${mensalHtml(ctx)}</section>
        ${extratoHtml(ctx)}`)}
      ${ehFii ? painel('patrimonio', `<div id="atPatrimonio">${patrimonioPlaceholderHtml()}</div>`) : ''}
      ${painel('sobre', `
        ${sobreHtml(ctx)}
        ${sobreFundoHtml(ctx)}
        ${rentabilidadeFundoHtml(ctx)}
        ${irHtml(ctx)}`)}
    </div>`;
}

const ABAS_ROTULO = { visao: 'Visão geral', extrato: 'Extrato', patrimonio: 'Patrimônio', sobre: 'Sobre e IR' };

/**
 * Troca de aba: as abas em pílula ficam no cabeçalho (`cab.abas.pilula`); aqui só se mostra o painel certo, guarda a aba no endereço
 * e avisa quem mede largura (os gráficos). Devolve mostrar(id).
 */
function criarTrocaAbas(doc, raiz, { cab = null, aoMostrar = () => {} } = {}) {
  const janela = doc.defaultView;
  return (id) => {
    if (cab && cab.abas && cab.abas.pilula) cab.abas.pilula.selecionar(id);
    raiz._abaAtual = id;
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
}

/**
 * 02/10/2026 (pedido C, "card de análise embaixo dos gráficos"): análise dos
 * proventos do ativo - janela dos 12 últimos meses fechados do gráfico (a
 * régua da média de 12 meses) + o mês de hoje, comparada com os 12 anteriores, o
 * último mês fechado, regularidade e pico (proventos-calc!analisarProventosMensais).
 */
export function analiseProventosAtivo(ctx) {
  const r = ctx.resposta || {};
  if (ctx.ehRf || !r.hoje) return null;
  const mesAtual = r.hoje.slice(0, 7);
  const porMes = proventosPorMes(r.proventos || [], r.hoje, { campoData: 'dataPagamento' });
  const meses = [];
  // os 12 meses FECHADOS (a régua da média de 12 meses) + o mês de hoje, parcial
  for (let k = 12; k >= 0; k -= 1) meses.push(somarMesesProv(mesAtual, -k));
  const aReceberMes = (ctx.proventos.aReceber || [])
    .filter((p) => String(p.dataPagamento || '').slice(0, 7) === mesAtual)
    .reduce((s, p) => s + (Number.isFinite(p.valor) ? p.valor : 0), 0);
  return analisarProventosMensais({ porMes, meses, mesAtual, aReceberMes });
}

/** Proventos por mês (últimos 24 meses): barras simples da biblioteca de gráficos, na cor da classe; a análise vem do card de Análise. */
function ligarBarras(doc, ctx, dono) {
  const wrap = doc.getElementById('atBarrasProventos');
  if (!wrap) return;
  const slotAnalise = doc.getElementById('atProvAnalise');
  if (slotAnalise) renderAnalise(doc, slotAnalise, analiseProventosAtivo(ctx), { titulo: 'Análise' });
  const meses = ctx.proventos.porMes;
  const max = Math.max(...meses.map((m) => m.valor), 0);
  if (!(max > 0)) { wrap.replaceChildren(criar(doc, 'p', { class: 'hint', texto: 'Nenhum provento nos últimos 24 meses.' })); return; }
  lembrarGrafico(dono, criarGraficoBarras(wrap, {
    modo: 'simples', altura: 200, categorias: meses.map((m) => rotuloMes(m.mes)),
    series: [{ id: 'proventos', nome: 'Proventos', cor: corDoToken(ctx.cfg.token), valores: meses.map((m) => m.valor) }],
    formatarValor: formatBRL, formatarY: formatBRLCompacto, aria: 'Proventos por mês nos últimos 24 meses',
  }));
}

function desenhar(doc, conteudoEl, ctx, patrimonio = null, { cabEl = null, refreshEl = null } = {}) {
  const janela = doc.defaultView;
  destruirGraficos(conteudoEl); // gráficos e KPIs do desenho anterior (cache -> dado novo)
  const estadoSecoes = lerEstadoSecoes(conteudoEl); // seções recolhíveis: aberta/fechada sobrevive ao redesenho
  let aba = conteudoEl._abaAtual || abaDoHash(janela && janela.location ? janela.location.hash : '');
  if (aba === 'patrimonio' && ctx.classe !== 'fiis') aba = 'visao';
  conteudoEl._abaAtual = aba;
  conteudoEl.innerHTML = paginaHtml(ctx, { aba });
  let mostrar = () => {};
  // cabeçalho padrão (breadcrumb, título, "Atualizar dados", abas em pílula); também define o document.title
  const cab = montarCabecalhoAtivo(doc, cabEl, { ctx, refreshEl, aba, aoMudarAba: (id) => mostrar(id) });
  if (!cab) definirTituloPagina({ subaba: ctx.ticker, secao: 'Carteiras' }, doc);
  aplicarEstadoSecoes(doc, conteudoEl, estadoSecoes, { abertasNoCelular: ['indicadores'] }); // no celular só os indicadores abrem sozinhos
  wirePointerTooltipCarteiras_(doc, conteudoEl);
  montarResumoAtivo(doc, doc.getElementById('atResumo'), ctx, conteudoEl);
  montarAneisNota(doc, doc.getElementById('at-analise'), conteudoEl);
  ligarBarras(doc, ctx, conteudoEl);
  ligarGraficos(doc, ctx, conteudoEl);
  ligarSecaoPm(doc, ctx, conteudoEl);
  preencherIrResgate(doc, ctx);
  ligarExtratoEMensal(doc, ctx, conteudoEl);
  ligarTese(doc.getElementById('atTeseConteudo'));
  ligarCopiarIr(doc, conteudoEl);
  ligarNoticias(conteudoEl);
  mostrar = criarTrocaAbas(doc, conteudoEl, { cab, aoMostrar: (id) => {
    if (id === 'extrato') desenharGraficoMensal(doc, ctx, conteudoEl);
    if (id === 'patrimonio' && patrimonio) patrimonio.mostrar(); // 05/10/2026: carrega só quando a aba abre
  } });
  const slotPatrimonio = patrimonio && doc.getElementById('atPatrimonio');
  if (slotPatrimonio) {
    patrimonio.desenhar(slotPatrimonio);
    if (aba === 'patrimonio') patrimonio.mostrar();
  }
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
  definirDestinoImpl = definirDestinoRendaFixa, // 07/10/2026: troca o destino do título (coluna B da Carteira Renda Fixa)
  definirCotaImpl = definirCotaFundoRf, // 07/10/2026: cota informada de um fundo (cota + data)
  carregarFundosImpl = carregarFundosPadrao, // 07/10/2026: dados públicos dos fundos (assets/data/fundos.json), só pra título que é fundo
  getNoticiasImpl = getNoticiasAtivo,
  getTesesImpl = getTesesAtivo,
  carregarEstaticosImpl = carregarEstaticosPadrao,
  getVideosImpl = undefined,
  getIntradiaImpl = getIntradia,
  getMetasImpl = getMetas,
  getMacroImpl = getMacro, // 05/10/2026: contexto de mercado da Análise (Macro.gs)
  getFiiPortfolioImpl = getFiiPortfolio, // 05/10/2026: aba Patrimônio do FII (PortfolioFii.gs)
  salvarCoordsImpl = salvarCoordenadasFiiPortfolio,
  carregarManualPatrimonioImpl = carregarManualPatrimonioPadrao,
  agora = () => new Date(),
} = {}) {
  const loadingEl = doc.getElementById('ativoLoading');
  const erroEl = doc.getElementById('ativoErro');
  const conteudoEl = doc.getElementById('ativoConteudo');
  // 06/10/2026 (Onda 3): o cabeçalho padrão (breadcrumb, título, "Atualizar dados", abas) mora FORA do conteúdo, que é redesenhado
  // (cache -> dado novo). O "Atualizar dados" é um elemento único, só reposicionado a cada redesenho do cabeçalho.
  let cabEl = doc.getElementById('ativoCabecalho');
  if (!cabEl && conteudoEl && conteudoEl.parentNode) {
    cabEl = doc.createElement('header');
    cabEl.id = 'ativoCabecalho';
    conteudoEl.parentNode.insertBefore(cabEl, loadingEl || conteudoEl);
  }
  let refreshEl = doc.getElementById('refreshControlAtivo');
  if (!refreshEl) refreshEl = criar(doc, 'div', { class: 'refresh-control', id: 'refreshControlAtivo' });
  refreshEl.classList.add('refresh-control');
  montarCabecalhoAtivo(doc, cabEl, { ref, refreshEl });

  if (!ref) {
    loadingEl.hidden = true;
    mostrarEstadoVazio(erroEl, { icone: 'search', titulo: 'Nenhum ativo informado', texto: 'Abra um ativo pelas Carteiras, pela Início ou por Proventos.', doc });
    return;
  }

  estadoTabelasAtivo.clear(); // página nova: filtros/ordem das tabelas voltam ao padrão
  const estado = { ctx: null, teses: null, noticias: null, noticiasPedidas: false, tesesPedidas: false, intradia: undefined, intradiaPedidoEm: 0, metas: null, metasPedidas: false };
  const estaticosPromise = carregarEstaticosImpl();

  // 07/10/2026: troca do destino do título (reserva / longo prazo / reservado para objetivos) - grava a coluna B e recarrega a tela
  if (conteudoEl) {
    conteudoEl.addEventListener('change', async (ev) => {
      const sel = ev.target && ev.target.closest ? ev.target.closest('[data-destino-rf]') : null;
      if (!sel) return;
      const msg = conteudoEl.querySelector('[data-destino-msg]');
      const mostrar = (texto) => { if (msg) { msg.textContent = texto; msg.hidden = !texto; } };
      sel.disabled = true;
      mostrar('Salvando…');
      let r;
      try { r = await definirDestinoImpl(token, { titulo: sel.dataset.titulo, instituicao: sel.dataset.instituicao, destino: sel.value }); } catch (e) { r = { ok: false, erro: (e && e.message) || String(e) }; }
      if (!r || !r.ok) { sel.disabled = false; mostrar(`Não consegui salvar: ${(r && r.erro) || 'sem resposta'}`); return; }
      mostrar('Salvo. Atualizando…');
      try { await carregarERedesenhar(); } catch (e) { /* a tela mostra o próprio erro */ }
    });
  }

  if (conteudoEl) ligarCotaFundo(conteudoEl, { salvar: (d) => definirCotaImpl(token, d), aoSalvar: () => carregarERedesenhar() });

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

  // 02/10/2026: gráfico do dia - 1 busca por abertura (e de novo no
  // "Atualizar dados", se já passou 1 min); a página redesenha por cima do
  // cache, então a série fica guardada e é reaplicada a cada desenho.
  const aplicarIntradia = () => {
    if (!estado.ctx || !estado.ctx.chaveIntradia || estado.intradia === undefined) return;
    preencherGraficoDia(conteudoEl, estado.ctx.chaveIntradia, estado.intradia, { agora: agora() });
  };
  const pedirIntradia = () => {
    const chave = estado.ctx && estado.ctx.chaveIntradia;
    if (!chave || !getIntradiaImpl) return;
    const t = agora().getTime();
    if (estado.intradiaPedidoEm && t - estado.intradiaPedidoEm < 60000) return;
    estado.intradiaPedidoEm = t;
    Promise.resolve(getIntradiaImpl(token, [chave])).catch(() => null).then((r) => {
      const serie = r && r.ok && r.resultado ? r.resultado[chave] || null : null;
      // falha numa atualização não apaga o gráfico que já estava na tela
      if (serie || estado.intradia === undefined) estado.intradia = serie;
      aplicarIntradia();
    });
  };

  // 03/10/2026: metas de Metas e Objetivos (pros pontos "investir aqui
  // completa a meta" da Análise) - 1 busca por tela, o cache 'metas' (o mesmo
  // da tela Metas) aparece na hora; falhou = análise sem os pontos de meta.
  const aplicarMetas = () => {
    if (!estado.ctx || !(estado.metas || estado.macro)) return;
    estado.ctx.avaliacao = avaliacaoDoAtivo(estado.ctx.resposta, { faixa: estado.ctx.faixa, percentualCarteira: estado.ctx.percentualCarteira, metas: estado.metas, macro: estado.macro });
    estado.ctx.macro = estado.macro || null;
    trocarAnalise(conteudoEl, estado.ctx);
    preencherIrResgate(conteudoEl.ownerDocument, estado.ctx); // a Selic/IPCA de hoje chegou: refaz a projeção até o vencimento
  };
  // 05/10/2026: contexto de mercado (juro real, bolsa cara/barata, NTN-B) - 1 busca por tela; falhou = análise sem ele
  const pedirMacro = () => {
    if (estado.macroPedido || !getMacroImpl) return;
    estado.macroPedido = true;
    carregarMacroMomento(token, { getMacroImpl, aoChegar: (m) => { estado.macro = m; aplicarMetas(); } }).catch(() => null);
  };
  const pedirMetas = () => {
    if (estado.metasPedidas || !getMetasImpl) return;
    estado.metasPedidas = true;
    (async () => {
      try {
        const emCache = await lerCacheDados('metas');
        if (emCache && emCache.dados && emCache.dados.ok && !estado.metas) { estado.metas = await metasComCalculo(emCache.dados); aplicarMetas(); }
      } catch (_) { /* sem cache */ }
      let r = null;
      try { r = await getMetasImpl(token); } catch (_) { r = null; }
      if (r && r.ok) {
        gravarCacheDados('metas', r);
        estado.metas = await metasComCalculo(r);
        aplicarMetas();
      }
    })();
  };

  const desenharResposta = async (resposta) => {
    const estaticos = await estaticosPromise;
    let fundos = null;
    if (resposta && resposta.tipo === 'rf') { try { fundos = await carregarFundosImpl(); } catch (_) { fundos = null; } } // 07/10/2026: sem o arquivo, só a ficha pública some
    estado.ctx = montarContexto(resposta, { ...(estaticos || {}), metas: estado.metas, macro: estado.macro, fundos });
    loadingEl.hidden = true;
    erroEl.hidden = true;
    conteudoEl.hidden = false;
    if (estado.ctx.classe === 'fiis' && !estado.patrimonio) {
      estado.patrimonioModulo = estado.patrimonioModulo || import('./ativo-patrimonio.js'); // 06/10/2026 (A-42): só FII baixa a aba Patrimônio
      const { criarControladorPatrimonio } = await estado.patrimonioModulo;
      if (!estado.patrimonio) estado.patrimonio = criarControladorPatrimonio({
        doc, token, ticker: estado.ctx.ticker, getFiiPortfolioImpl, salvarCoordsImpl,
        carregarManualImpl: carregarManualPatrimonioImpl, lerCache: lerCacheDados, gravarCache: gravarCacheDados,
      });
    }
    desenhar(doc, conteudoEl, estado.ctx, estado.patrimonio || null, { cabEl, refreshEl });
    aplicarIntradia();
    pedirIntradia();
    pedirMetas();
    pedirMacro();
    // 25/09/2026: vídeos do YouTube (ticker + apelidos do Sobre); busca 1x, quando a seção aparece.
    // 02/10/2026: + o canal oficial do ativo (canais-youtube.js); renda fixa só com canal (Tesouro).
    if (!estado.ctx.ehRf || estado.ctx.canal) {
      if (!estado.videos) {
        const ctx = estado.ctx;
        const params = ctx.ehRf
          ? { termos: [ctx.ticker, familiaTesouro(ctx.ticker) || familiaTesouro(ctx.ativo && ctx.ativo.tipoInvestimento), 'Tesouro Direto'].filter(Boolean), ticker: ctx.ticker }
          : { termos: [ctx.ticker, ...((ctx.sobre && ctx.sobre.apelidos) || [])], ticker: ctx.ticker };
        Object.assign(params, parametrosCanalVideos(ctx.canal));
        estado.videos = criarCarregadorVideos(token, params, { ...(getVideosImpl ? { getVideosImpl } : {}), agora });
      }
      estado.videos(doc.getElementById('at-videos'));
    }
    preencherExtras();
    pedirExtras(resposta);
  };

  // 05/10/2026 (A-38): os índices (CDI, Ibovespa, dólar...) são os da Início - se a home guardada no IndexedDB está
  // de hoje, não pede de novo ao servidor (resposta ~200 KB menor) e monta os índices dela.
  const lerHistoricoHome = async () => {
    try {
      const h = await lerCacheDados('home');
      const hist = h && h.dados && h.dados.ok ? h.dados.historico : null;
      return Array.isArray(hist) && hist.length && hist[hist.length - 1].data >= hojeSP(agora()) ? hist : null;
    } catch (_) { return null; }
  };
  const comIndicesDaHome = (resposta, historicoHome) => {
    if (!resposta || !resposta.ok || resposta.indices || !historicoHome) return resposta;
    return { ...resposta, indices: indicesDoHistoricoHome(historicoHome, resposta.indicesDesde) || [] };
  };

  const cache = await lerCacheDados(chaveCache(ref));
  if (cache && cache.dados && cache.dados.ok) {
    try { await desenharResposta(comIndicesDaHome(cache.dados, await lerHistoricoHome())); } catch (e) { console.error('ativo.js: falha ao desenhar o cache', e); estado.ctx = null; }
  }

  async function carregarERedesenhar() {
    const historicoHome = await lerHistoricoHome();
    let resposta;
    try {
      resposta = await (historicoHome ? getAtivoImpl(token, ref, { semIndices: true }) : getAtivoImpl(token, ref));
    } catch (e) {
      resposta = { ok: false, etapa: 'network', erro: (e && e.message) || String(e) };
    }
    if (!resposta || !resposta.ok) {
      if (!estado.ctx) {
        loadingEl.hidden = true;
        mostrarErroCarga(erroEl, { tela: ref.replace(/^rf:/, '').split('|')[0], resposta: resposta || { erro: 'sem resposta' }, aoTentar: carregarERedesenhar, doc });
      }
      return false; // com a página já desenhada (cache) o "Atualizar dados" mostra a falha
    }
    try {
      await desenharResposta(comIndicesDaHome(resposta, historicoHome));
    } catch (e) {
      console.error('ativo.js: falha ao desenhar a tela', e);
      if (!estado.ctx) {
        loadingEl.hidden = true;
        mostrarErroCarga(erroEl, { tela: ref.replace(/^rf:/, '').split('|')[0], erro: e, aoTentar: carregarERedesenhar, doc });
      }
      return false;
    }
    gravarCacheDados(chaveCache(ref), resposta);
    return true;
  }

  // 26/09/2026: o botão "Atualizar dados" entra ANTES da 1ª busca (mostra
  // "Atualizando…" enquanto carrega) e fica fora do conteúdo - visível no
  // carregamento e no erro também, que é quando mais se precisa dele.
  if (refreshEl) await mountRefreshControl(doc, refreshEl, carregarERedesenhar).atualizar();
  else await carregarERedesenhar();
}

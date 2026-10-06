/**
 * carteiras-visao-geral.js — "Visão geral" de Carteiras (a Home consolidada, primeira aba). Junta 2 chamadas em paralelo:
 *   - getCarteirasHome() (action=carteirasHome, CarteirasHome.gs): os 4 cards de classe + patrimonioTotal + benchmarks.cdi;
 *   - getHome() (action=home, Home.gs): histórico/patrimônio/índices - os gráficos usam a MESMA série "total" da Início
 *     ("confirmado com o Tiago que dá pra reaproveitar, sem rota nova", ver cabeçalho de CarteirasHome.gs).
 *
 * 06/10/2026 (Onda 3, fase 2 - kit Material 3): só APRESENTAÇÃO, nenhuma conta mudou.
 *   - topo: cards KPI (Patrimônio em carteiras com o "Valor aplicado" embaixo, Resultado desde o início com a rentabilidade, Proventos
 *     do mês, Posições) + chips de benchmark (Ibovespa hoje, CDI a.a.);
 *   - "Composição" (anel) ao lado de 4 cards de carteira clicáveis (valor, rentabilidade, sparkline do histórico, viés, índices da classe);
 *   - "Desempenho": rentabilidade acumulada + evolução do patrimônio na biblioteca de gráficos (carteiras-graficos.js), um seletor de
 *     período só; o card de Análise e o "Ontem era" continuam, vindos dos mesmos cálculos de inicio.js/inicio-comparativo.js;
 *   - meta de renda passiva e proventos do mês em seções recolhíveis; erro de carga = mostrarErroCarga (com "Tentar de novo"), e com
 *     dados guardados na tela só um aviso discreto.
 * Os cálculos (valor aplicado = soma de fluxoAplicado*, resultado/rentabilidade TWR "desde o início", cards alinhados com o histórico)
 * são os de antes - ver os comentários de renderHeroStats_ (agora calcularHero_) e alinharCardsComHistorico_.
 */

import { getCarteirasHome, getHome } from '../api-client.js';
import { formatBRL, formatUSD, formatPercentFromFraction, formatPercentFromPoints, formatDiaHoraBR } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { esc } from '../util/html.js';
import { mostrarErroCarga } from '../ui/erro-carga.js';
import { sparklineHtml } from '../charts/index.js';
import { statProventosHero, secaoProventosCarteiraHtml, renderProventosCarteira } from './carteiras-proventos.js';
import { proventosAReceberDe } from '../analise-grafico.js'; // 03/10/2026: proventos a receber no card de Análise (data-ex)
import { calcularResumoRentabilidade, CAMPO_PRINCIPAL_POR_VISAO } from './inicio.js';
import { carregarMetasParaCard, cardMetaRendaPassiva, urlMetas } from '../metas-card.js'; // 02/10/2026: meta de renda passiva
import { criarGraficosCarteira, montarKpis, desenharAnelDistribuicao, destruirGraficos, corDoToken } from './carteiras-graficos.js';
import {
  renderBenchmarksClasseCarteiras, variacaoHtml, mostrarAvisoDadosGuardados, lerEstadoSecoes, aplicarEstadoSecoes,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_VISAO_GERAL = 'carteiras_visao_geral_v2';
const PONTOS_SPARK = 60;

const CORES_CARD = {
  'Ações': '--acoes',
  'FIIs': '--fiis',
  'Ações Internacionais': '--usa',
  'Renda Fixa': '--rf',
};

/** Carteira -> campo do histórico que guarda o valor dela dia a dia (CAMPO_PRINCIPAL_POR_VISAO, inicio.js). */
const VISAO_POR_CARD = {
  'Ações': 'carteiraAcoes',
  'FIIs': 'carteiraFiis',
  'Ações Internacionais': 'carteiraAcoesEua',
  'Renda Fixa': 'carteiraRendaFixaTotal',
};

/**
 * 19/09/2026 #2/#3 (Tiago: "cada carteira tem seus índices"): campo -> como mostrar. Ibovespa/IFIX/S&P 500 são VARIAÇÃO DO DIA em
 * pontos percentuais (GOOGLEFINANCE changepct), coloridos pelo sinal; CDI/Selic/IPCA são taxa/inflação de referência (fração, sem cor).
 */
const CAMPO_BENCHMARK_CARD = {
  ibovespa: { label: 'Ibovespa', sufixo: 'hoje', formatar: (v) => formatPercentFromPoints(v), colorir: true },
  ifix: { label: 'IFIX', sufixo: 'hoje', formatar: (v) => formatPercentFromPoints(v), colorir: true },
  spx: { label: 'S&P 500', sufixo: 'hoje', formatar: (v) => formatPercentFromPoints(v), colorir: true },
  cdi: { label: 'CDI', sufixo: 'a.a.', formatar: (v) => formatPercentFromFraction(v) },
  selic: { label: 'Selic', sufixo: 'a.a.', formatar: (v) => formatPercentFromFraction(v) },
  ipca: { label: 'IPCA', sufixo: '12m', formatar: (v) => formatPercentFromFraction(v) },
};

/** Índices DA classe do card (os que CarteirasHome.gs manda em card.benchmarks), na ordem da API. */
function benchmarksCardHtml_(benchmarks) {
  if (!benchmarks) return '';
  const partes = Object.keys(benchmarks).map((chave) => {
    const meta = CAMPO_BENCHMARK_CARD[chave];
    if (!meta) return null;
    const valor = benchmarks[chave];
    const texto = typeof valor === 'number' ? meta.formatar(valor) : '—';
    const cor = meta.colorir && typeof valor === 'number' ? (valor >= 0 ? 'good' : 'bad') : '';
    return `<span class="vg-card-bm-item">${esc(meta.label)} <b${cor ? ` class="${cor}"` : ''}>${texto}</b> ${esc(meta.sufixo)}</span>`;
  }).filter(Boolean);
  return partes.length ? `<span class="vg-card-bm">${partes.join('')}</span>` : '';
}

/**
 * "Valor aplicado / Resultado (desde o início) / Rentabilidade" do topo. 19/09/2026 (bug do Tiago, comparando com o Gorila): a conta é a
 * MESMA do gráfico de Rentabilidade com o período "Desde o início" (calcularResumoRentabilidade, TWR validada em 13/09/2026), nunca dois
 * cálculos de "desde o início" divergindo. 23/09/2026: "Valor aplicado" = soma de fluxoAplicadoPatrimonio (custo de tudo que está
 * investido, sem subtrair provento - ver FluxoCaixaInicio.gs); Valor aplicado + Resultado não precisa dar o Patrimônio (o Resultado inclui
 * proventos recebidos e lucro realizado). Sem `home` (getHome falhou/pendente) cai pro método antigo: só a posição atual dos cards.
 */
export function calcularHero_(cards, home) {
  let investido = null; let resultado = null; let rentabilidade = null;
  if (home && home.patrimonio && home.historico) {
    const resumo = calcularResumoRentabilidade(home.patrimonio, home.historico, { visaoId: 'total', periodoId: 'tudo' });
    if (typeof resumo.valorAtual === 'number' && typeof resumo.ganhoReais === 'number') {
      resultado = resumo.ganhoReais;
      rentabilidade = typeof resumo.percentual === 'number' ? resumo.percentual / 100 : null;
      const temAplicado = home.historico.some((item) => typeof item.fluxoAplicadoPatrimonio === 'number');
      investido = temAplicado
        ? home.historico.reduce((soma, item) => soma + (Number.isFinite(item.fluxoAplicadoPatrimonio) ? item.fluxoAplicadoPatrimonio : 0), 0)
        : resumo.valorAtual - resumo.ganhoReais;
    }
  }
  if (investido == null) {
    investido = cards.reduce((soma, c) => soma + (c.totalInvestido || 0), 0);
    resultado = cards.reduce((soma, c) => soma + (c.lucroPrejuizo || 0), 0);
    rentabilidade = investido !== 0 ? resultado / investido : 0;
  }
  return { investido, resultado, rentabilidade };
}

/**
 * 23/09/2026 #3 (Controle 8): quando o histórico está disponível, o Valor aplicado de cada card sai da MESMA fonte do topo e das
 * subpáginas (soma de fluxoAplicado<Classe>); lucro = valor de hoje − valor aplicado; % = lucro / aplicado sem arredondar antes.
 * Assim os 4 cards somam exatamente o "Valor aplicado" do topo. Sem histórico, o card fica como a API mandou.
 */
const CAMPO_APLICADO_POR_CARD = {
  'Ações': 'fluxoAplicadoAcoes',
  'FIIs': 'fluxoAplicadoFiis',
  'Ações Internacionais': 'fluxoAplicadoAcoesEua',
  'Renda Fixa': 'fluxoAplicadoRendaFixaTotal',
};
export function alinharCardsComHistorico_(cards, historico) {
  if (!Array.isArray(cards)) return cards;
  const temHistorico = Array.isArray(historico) && historico.length > 0;
  return cards.map((card) => {
    const campo = CAMPO_APLICADO_POR_CARD[card.nome];
    let totalInvestido = card.totalInvestido;
    if (temHistorico && campo && historico.some((item) => typeof item[campo] === 'number')) {
      totalInvestido = historico.reduce((soma, item) => soma + (Number.isFinite(item[campo]) ? item[campo] : 0), 0);
    }
    const lucroPrejuizo = card.totalAtualizado - totalInvestido;
    return {
      ...card,
      totalInvestido,
      lucroPrejuizo,
      rentabilidade: totalInvestido ? lucroPrejuizo / totalInvestido : 0,
    };
  });
}

function chaveDaPagina_(nomeCard) {
  const mapa = { 'Ações': 'acoes', 'FIIs': 'fiis', 'Ações Internacionais': 'acoes-eua', 'Renda Fixa': 'renda-fixa' };
  return mapa[nomeCard] || 'visao-geral';
}

/** Últimos `n` valores numéricos de um campo do histórico (pra sparkline). */
function serieDoCampo_(historico, campo, n = PONTOS_SPARK) {
  if (!Array.isArray(historico) || !campo) return [];
  return historico.map((item) => item[campo]).filter((v) => typeof v === 'number' && Number.isFinite(v)).slice(-n);
}

// ---------------------------------------------------------------------------
// Cards KPI do topo
// ---------------------------------------------------------------------------
function montarKpisTopo_(doc, container, carteiras, home, { pendente, dono }) {
  const hero = calcularHero_(carteiras.cards, pendente ? null : home);
  const posicoes = carteiras.cards.reduce((soma, c) => soma + (c.quantidadeAtivos || 0), 0);
  const sinal = hero.resultado > 0 ? 1 : (hero.resultado < 0 ? -1 : 0);
  const prov = !pendente && home && home.historico
    ? statProventosHero(home.historico, ['proventosAcoes', 'proventosFiis', 'proventosAcoesEua'], { formatar: formatBRL })
    : null;
  const itens = [
    {
      rotulo: 'Patrimônio em carteiras', valor: carteiras.patrimonioTotal, formatar: formatBRL, classe: 'cc-kpi-valor',
      sub: pendente ? 'Calculando o valor aplicado…' : `Valor aplicado: ${formatBRL(hero.investido)}`,
      subInfo: pendente ? null : 'Quanto você colocou nas carteiras (custo de tudo que está investido), sem descontar os proventos recebidos.',
      spark: home && home.historico ? { valores: serieDoCampo_(home.historico, CAMPO_PRINCIPAL_POR_VISAO.total), cor: 'auto', area: true } : null,
    },
    pendente
      ? { rotulo: 'Resultado desde o início', valor: '—', sub: 'Calculando…' }
      : {
        rotulo: 'Resultado desde o início', valor: hero.resultado, formatar: (v) => `${v > 0 ? '+' : ''}${formatBRL(v)}`,
        info: 'Ganho de tudo que está na carteira, mais lucros já realizados e proventos recebidos, desde o primeiro aporte.',
        delta: typeof hero.rentabilidade === 'number' ? { texto: formatPercentFromFraction(hero.rentabilidade), sinal } : null,
      },
    prov ? { rotulo: prov.rotulo, valor: prov.valor, formatar: prov.formatar, sub: prov.sub, info: prov.info }
      : { rotulo: 'Proventos no mês', valor: '—', sub: pendente ? 'Calculando…' : 'Sem histórico por enquanto' },
    { rotulo: 'Posições', valor: posicoes, formatar: (n) => String(Math.round(n)), sub: `em ${carteiras.cards.length} carteiras` },
  ];
  return montarKpis(doc, container, itens, dono);
}

// ---------------------------------------------------------------------------
// Cards de carteira (resumo clicável)
// ---------------------------------------------------------------------------
function cardClasseHtml_(card, historico, pendente) {
  const corToken = CORES_CARD[card.nome] || '--acoes';
  const lucroBom = card.lucroPrejuizo >= 0;
  const chave = chaveDaPagina_(card.nome);
  const subUsd = card.nome === 'Ações Internacionais' && typeof card.totalAtualizadoUsd === 'number'
    ? `<span class="vg-card-usd">${esc(formatUSD(card.totalAtualizadoUsd))}</span>` : '';

  // Barra "comprar/aguardar" (19/09/2026) - só quando a API manda os 2 campos; Renda Fixa não tem viés e ganha uma faixa neutra
  // (só decorativa) pra manter o mesmo peso visual dos outros cards.
  let vies;
  if (typeof card.comprar === 'number' && typeof card.aguardar === 'number' && (card.comprar + card.aguardar) > 0) {
    const total = card.comprar + card.aguardar;
    const pctComprar = (card.comprar / total) * 100;
    vies = `<span class="vg-card-vies"><span class="cc-vies" role="img" aria-label="${card.comprar} para comprar e ${card.aguardar} para aguardar"><span class="comprar" style="width:${pctComprar.toFixed(1)}%"></span><span class="aguardar" style="width:${(100 - pctComprar).toFixed(1)}%"></span></span><span class="vg-card-vies-legenda">${card.comprar} comprar · ${card.aguardar} aguardar</span></span>`;
  } else {
    vies = '<span class="vg-card-vies" aria-hidden="true"><span class="cc-vies"><span class="neutro" style="width:100%"></span></span></span>';
  }

  const serie = serieDoCampo_(historico, CAMPO_PRINCIPAL_POR_VISAO[VISAO_POR_CARD[card.nome]]);
  const spark = !pendente && serie.length >= 2
    ? `<span class="vg-card-spark">${sparklineHtml(serie, { largura: 240, altura: 44, cor: corDoToken(corToken), aria: `${card.nome}: evolução do valor nos últimos ${serie.length} dias` })}</span>`
    : '';
  const rentab = pendente ? '<span class="vg-card-rentab">…</span>' : `<span class="vg-card-rentab">${variacaoHtml(card.rentabilidade)}</span>`;
  const resultado = pendente ? '' : `<span class="vg-card-lucro ${lucroBom ? 'num-bom' : 'num-ruim'}">${lucroBom ? '+' : ''}${esc(formatBRL(card.lucroPrejuizo))}</span>`;
  const aplicado = pendente ? '<b>…</b>' : `<b>${esc(formatBRL(card.totalInvestido))}</b>`;

  return `
    <button class="card card-clicavel vg-card" type="button" data-ir-para="${chave}" style="--vg-cor:var(${corToken})" aria-label="${esc(card.nome)}: ver detalhes">
      <span class="vg-card-topo">
        <span class="vg-card-dot" aria-hidden="true"></span>
        <span class="vg-card-nome">${esc(card.nome)}</span>
        <span class="chip-tonal vg-card-pct">${Math.round((card.percentualDoPatrimonio || 0) * 100)}% da carteira</span>
      </span>
      <span class="vg-card-valor">${esc(formatBRL(card.totalAtualizado))}${subUsd}</span>
      <span class="vg-card-linha">${rentab}${resultado}</span>
      ${spark}
      <span class="vg-card-aplicado">Valor aplicado: ${aplicado}</span>
      ${vies}
      ${benchmarksCardHtml_(card.benchmarks)}
      <span class="vg-card-rodape">
        <span>${card.quantidadeAtivos} ${card.quantidadeAtivos === 1 ? 'ativo' : 'ativos'}</span>
        <span class="vg-card-ver">Ver detalhes<svg class="ico" aria-hidden="true"><use href="#ico-arrow-forward"/></svg></span>
      </span>
    </button>`;
}

function renderCardsClasse(doc, container, cards, historico, pendente) {
  container.innerHTML = cards.map((c) => cardClasseHtml_(c, historico, pendente)).join('');
  container.querySelectorAll('.vg-card').forEach((botao) => {
    botao.addEventListener('click', () => {
      // a navegação entre as abas é a do cabeçalho (carteiras-router.js): clicar na aba da carteira
      const aba = doc.querySelector(`.pagina-abas [data-tab="${botao.dataset.irPara}"]`);
      if (aba) aba.click();
    });
  });
}

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------
function desenhar(doc, { carteiras: carteirasApi, home }, { homePendente = false, historicoFalhou = false, aoTentarGraficos = null } = {}) {
  const conteudoEl = doc.getElementById('vgConteudo');
  const $ = (id) => doc.getElementById(id);
  const estadoSecoes = lerEstadoSecoes(conteudoEl);
  destruirGraficos(conteudoEl);
  destruirGraficos($('vgGraficos'));
  const pendente = homePendente && !home;
  const carteiras = { ...carteirasApi, cards: alinharCardsComHistorico_(carteirasApi.cards, home?.historico) };
  const historico = home?.historico || null;

  montarKpisTopo_(doc, $('vgResumo'), carteiras, home, { pendente, dono: conteudoEl });

  // calculados 1 vez só: nunca dois textos pra "Ibovespa hoje"/"CDI (a.a.)" podendo divergir na mesma tela
  const ibovespaVariacaoDia = home?.indices?.ibovespa?.variacaoDia;
  renderBenchmarksClasseCarteiras(doc, $('vgBenchmarks'), [
    { label: 'Ibovespa hoje', valor: typeof ibovespaVariacaoDia === 'number' ? formatPercentFromPoints(ibovespaVariacaoDia) : '—', cor: typeof ibovespaVariacaoDia === 'number' ? (ibovespaVariacaoDia >= 0 ? 'good' : 'bad') : undefined },
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(carteiras.benchmarks?.cdi) },
  ]);

  const fatias = carteiras.cards.map((card) => ({
    nome: card.nome, valor: card.totalAtualizado, cor: corDoToken(CORES_CARD[card.nome] || '--acoes'),
  }));
  desenharAnelDistribuicao(doc, $('vgDonut'), fatias, { aria: 'Composição das carteiras', tamanho: 260, legenda: 'baixo', dono: conteudoEl });

  renderCardsClasse(doc, $('vgCardsGrid'), carteiras.cards, historico, pendente);

  const graficos = criarGraficosCarteira(doc, $('vgGraficos'), {
    historico, patrimonio: home?.patrimonio || null, chavePeriodo: 'carteiras.visaoGeral', aoTentar: aoTentarGraficos,
    paineis: [{
      visaoId: 'total', labelInfo: 'Patrimônio total', labelInfoEvolucao: 'Patrimônio total', camposProventos: ['proventosAcoes', 'proventosFiis', 'proventosAcoesEua'],
      analise: true, analiseExtra: { proventosAReceber: proventosAReceberDe(home?.proventosAnunciados) }, usarOntem: true, comparativo: true,
      // 02/10/2026 (pedido D): IPCA no Patrimônio total - mesma curva base 100 do CDI (indiceIpca, HistoricoInicio.gs)
      benchmarksExtra: [{ campo: 'indiceIpca', label: 'IPCA', cor: '--rf' }],
    }],
  });
  if (historico && historico.length) {
    graficos.atualizar({ historico, patrimonio: home.patrimonio, ontem: home.ontem && typeof home.ontem.total === 'number' ? home.ontem.total : null });
  } else if (historicoFalhou) {
    graficos.erro('Não deu pra carregar os gráficos agora. O resto da página continua normal.');
  }

  const provWrap = $('vgProventosWrap');
  if (provWrap) {
    provWrap.innerHTML = secaoProventosCarteiraHtml('vgProventos');
    renderProventosCarteira(doc, $('vgProventos'), home ? home.proventosAnunciados : null);
  }
  aplicarEstadoSecoes(doc, conteudoEl, estadoSecoes);
}

/**
 * 02/10/2026 (Tiago: "meta de renda passiva em Carteiras com link pro detalhe da meta"): o card da meta (metas-card.js) logo acima
 * dos proventos do mês. Sem meta de renda passiva, só um link discreto pra criar; erro/sem resposta, nada.
 */
export function renderMetaRendaPassiva(doc, el, resultado) {
  if (!el) return;
  // falha numa atualização não apaga o card que já estava na tela
  if (!resultado || !resultado.ok) { if (!el.innerHTML.trim()) el.hidden = true; return; }
  const card = resultado.rendaPassiva ? cardMetaRendaPassiva(resultado.rendaPassiva) : '';
  let urlTodas = 'metas.html';
  try { urlTodas = urlMetas(); } catch (e) { /* sem raiz do site: relativo */ }
  el.innerHTML = card
    ? `<div class="cc-secao-cab"><h2>Renda passiva</h2><a class="cc-proventos-link" href="${esc(urlTodas)}">todas as metas</a></div>
      <div class="vg-meta-renda-card">${card}</div>`
    : `<p class="vg-meta-renda-convite"><a class="cc-proventos-link" href="${esc(urlTodas)}">Criar meta de renda passiva</a></p>`;
  el.hidden = false;
}

export async function montarPaginaCarteirasVisaoGeral(token, { doc = document, getCarteirasHomeImpl = getCarteirasHome, getHomeImpl = getHome, carregarMetasImpl = carregarMetasParaCard } = {}) {
  const loadingEl = doc.getElementById('vgLoading');
  const erroEl = doc.getElementById('vgErro');
  const conteudoEl = doc.getElementById('vgConteudo');
  const avisosEl = doc.getElementById('vgAvisos');
  const refreshControlEl = doc.getElementById('refreshControlVisaoGeral');

  // 25/09/2026: cache em IndexedDB (cache-dados.js) - os cards desta página e a resposta da Início (chave "home")
  const [cacheCarteiras, cacheHome] = await Promise.all([lerCacheDados(CHAVE_CACHE_VISAO_GERAL), lerCacheDados('home')]);
  let homeNaTela = cacheHome && cacheHome.dados ? cacheHome.dados : null;
  let mostrando = null; // o que está na tela (cache ou resposta): um erro não apaga
  if (cacheCarteiras) {
    mostrando = cacheCarteiras;
    desenhar(doc, { carteiras: cacheCarteiras.dados, home: homeNaTela }, { homePendente: !homeNaTela });
    if (loadingEl) loadingEl.hidden = true;
    conteudoEl.hidden = false;
  }

  // 02/10/2026: meta de renda passiva - busca em paralelo, sem segurar o resto (o lugar dela é estático no HTML, desenhar() não apaga)
  const carregarMeta = () => {
    if (!carregarMetasImpl || !doc.getElementById('vgMetaRenda')) return Promise.resolve();
    return Promise.resolve()
      .then(() => carregarMetasImpl(token, { doc }))
      .catch(() => null)
      .then((r) => renderMetaRendaPassiva(doc, doc.getElementById('vgMetaRenda'), r));
  };

  async function carregarERedesenhar() {
    carregarMeta();
    // 05/10/2026 (A-41): getHome (histórico, lento) em paralelo mas sem segurar os cards: eles pintam quando carteirasHome chega e os
    // gráficos/resultado quando o home chega.
    const promessaHome = Promise.resolve()
      .then(() => getHomeImpl(token))
      .catch((err) => ({ ok: false, etapa: 'home', erro: String(err) }));
    let respCarteiras;
    try { respCarteiras = await getCarteirasHomeImpl(token); } catch (erro) { respCarteiras = { ok: false, etapa: 'network', erro: String((erro && erro.message) || erro) }; }
    if (loadingEl) loadingEl.hidden = true;

    if (!respCarteiras || !respCarteiras.ok) {
      if (mostrando) {
        mostrarAvisoDadosGuardados(doc, erroEl, { quando: mostrando.ts ? formatDiaHoraBR(mostrando.ts) : null, resposta: respCarteiras, aoTentar: carregarERedesenhar });
        conteudoEl.hidden = false;
      } else {
        mostrarErroCarga(erroEl, { tela: 'Carteiras', resposta: respCarteiras, aoTentar: carregarERedesenhar, doc });
        conteudoEl.hidden = true;
      }
      return false;
    }

    erroEl.hidden = true; erroEl.textContent = '';
    conteudoEl.hidden = false;
    mostrando = { ts: Date.now(), dados: respCarteiras.carteiras };
    gravarCacheDados(CHAVE_CACHE_VISAO_GERAL, respCarteiras.carteiras);
    if (avisosEl) avisosEl.hidden = true;
    desenhar(doc, { carteiras: respCarteiras.carteiras, home: homeNaTela }, { homePendente: !homeNaTela });

    const respHome = await promessaHome;
    if (respHome.ok) {
      homeNaTela = respHome;
      desenhar(doc, { carteiras: respCarteiras.carteiras, home: homeNaTela });
    } else if (!homeNaTela) {
      desenhar(doc, { carteiras: respCarteiras.carteiras, home: null }, { historicoFalhou: true, aoTentarGraficos: carregarERedesenhar });
      if (avisosEl) {
        avisosEl.hidden = false;
        avisosEl.textContent = 'Os gráficos de evolução e rentabilidade não carregaram agora. Os cards das carteiras estão corretos.';
      }
    }
    return true;
  }

  // 26/09/2026: o "Atualizar dados" entra ANTES da 1ª busca (mostra "Atualizando…") e fica fora do conteúdo - visível no erro também
  await mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).atualizar();
}

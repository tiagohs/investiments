/**
 * pages/inicio.js — renderização da página Início, Fase 2 completa:
 * cards de Índices & Câmbio, resumo de Patrimônio (Total / Longo Prazo /
 * Renda Emergencial, os 3 sempre visíveis, sem precisar clicar em nada -
 * ver renderResumoPatrimonio), gráfico de Rentabilidade (com filtro de
 * período contextual, próprio desta página) e a grade "Meus Ativos"
 * (cartão inteiro clicável pro Detalhe do Ativo - ativo/index.html?ref=,
 * ver link-ativo.js).
 *
 * Mesmo padrão de shell.js/auth-ui.js: funções puras de renderização
 * (recebem doc + elemento + dado já pronto, nunca buscam nada sozinhas)
 * e um único orquestrador real (montarPaginaInicio) que busca de
 * verdade via api-client.js!getHome e liga tudo. Os testes exercitam as
 * funções puras contra um jsdom, sem precisar de fetch de verdade nem
 * de um token real.
 *
 * "avisos" (falha parcial de uma seção só) é tratado exatamente como o
 * back-end trata (ver Home.gs) - cada pedaço (índices/câmbio, resumo,
 * gráfico, ativos) aparece se veio, e falta silenciosamente (com um
 * aviso) se não veio, em vez de uma falha em uma seção derrubar a
 * página inteira.
 *
 * Rentabilidade (13/09/2026): historico (HistoricoInicio.gs) já vem com
 * uma linha por dia corrido - patrimonio/longoPrazo/rendaEmergencial em
 * R$, indiceCdi/indiceSelic como curva composta base 100, ibovespa em
 * pontos brutos (pode vir null antes do 1º pregão da janela). O gráfico
 * nunca compara valores brutos entre si (R$ vs pontos de índice não faz
 * sentido) - normaliza tudo pra "% desde o início do período" a partir
 * do primeiro valor válido da janela (normalizarSerieRentabilidade),
 * mesma ideia por trás de qualquer gráfico de rentabilidade comparada.
 * Os benchmarks mudam por visão, seguindo a decisão já registrada em
 * docs/plano-implementacao.html: Total/Longo Prazo contra Ibovespa+CDI,
 * Renda Emergencial contra CDI+Selic (não faz sentido comparar reserva
 * de emergência com bolsa).
 *
 * Ajuste do mesmo dia (feedback do Tiago com print): três mudanças na
 * mesma leva, todas interligadas -
 *  1) o resumo de patrimônio (antes um "hero" com abas Total/Longo
 *     Prazo/Renda Emergencial, só uma visão por vez) virou
 *     renderResumoPatrimonio - as 3 divisões aparecem juntas, sem clique;
 *  2) cada gráfico de Rentabilidade agora desenha seu <svg> na LARGURA
 *     REAL do próprio cartão (medida via clientWidth), em vez de um
 *     viewBox fixo (0 0 1000 220) esticado por preserveAspectRatio="none".
 *     Esse viewBox fixo era o motivo da fonte do eixo (font-size em
 *     unidade do SVG) renderizar menor nos 2 cartões lado a lado
 *     (Longo Prazo/Renda Emergencial, mais estreitos) do que no cartão
 *     Total (largura cheia) - a mesma unidade de viewBox virava menos
 *     pixels de tela quanto mais estreito o cartão. Com viewBox largura
 *     = largura real do cartão em px, 1 unidade de SVG = 1px de tela
 *     sempre, não importa a largura do cartão - fonte sempre no mesmo
 *     tamanho visual. wireGraficoRentabilidade também escuta "resize" da
 *     janela (com debounce) e redesenha, pra não ficar com a medida
 *     antiga se a janela mudar de tamanho depois do primeiro desenho;
 *  3) a % de cada benchmark no período (CDI/Ibovespa/Selic) passou a
 *     aparecer junto do próprio nome dele na legenda de cada gráfico
 *     (em vez de um elemento novo na página) - é o lugar onde o olho já
 *     vai pra identificar qual linha é qual, então é ali que o número
 *     faz sentido, sem inflar o total de texto da página.
 *
 * Correção do mesmo dia, 2ª rodada (Tiago viu o resultado e apontou 2
 * problemas):
 *  a) a % de cada benchmark na legenda estava mostrando o retorno
 *     ABSOLUTO do próprio benchmark (ex.: "Ibovespa +12,03%"), não
 *     "quanto minha carteira ganhou ou perdeu" EM RELAÇÃO a ele (o que
 *     Tiago pediu desde o início - ver o exemplo dele "+15% CDI, -2%
 *     Ibovespa"). Se o portfólio subiu 5% e o Ibovespa subiu 12%, o
 *     portfólio está ATRÁS do Ibovespa (deveria aparecer negativo), não
 *     "+12,03%" em verde do lado. Corrigido: a % agora é a DIFERENÇA
 *     (retorno do portfólio − retorno do benchmark, mesma unidade "%
 *     desde o início do período" que já alimenta os dois), positiva
 *     quando o portfólio bate o benchmark, negativa quando fica atrás;
 *  b) o detalhamento por classe (antes um texto corrido só no cartão
 *     Total) virou um "donut" (SVG simples, técnica de
 *     stroke-dasharray sobre um círculo, sem biblioteca nenhuma) +
 *     legenda com nome/%, replicado nos 3 cartões do resumo:
 *     Total (Ações/FIIs/Renda Fixa/Ações EUA), Longo Prazo (as mesmas 4
 *     classes, mas excluindo a reserva de emergência de dentro de Renda
 *     Fixa - por isso a fatia de Renda Fixa é menor que a do Total) e
 *     Renda Emergencial (que é 100% Renda Fixa, então em vez de
 *     classe, mostra por TIPO de investimento - Tesouro Selic, Tesouro
 *     IPCA, CDB, LCI/LCA etc., via o campo tipoInvestimento que já vem
 *     em cada ativo de Renda Fixa). Total e Longo Prazo são calculados
 *     a partir do array `ativos` (não de patrimonio.porClasse, que só
 *     cobre o total combinado) - ver calcularDistribuicaoPorClasse /
 *     calcularDistribuicaoRendaEmergencial.
 *
 * Correção do mesmo dia, 3ª rodada (Tiago testou de novo):
 *  a) passar o mouse (ou tocar, no celular) no gráfico de Rentabilidade
 *     não mostrava nada - não havia NENHUMA interação ligada ao <svg>,
 *     só o desenho estático. Agora um <rect> transparente
 *     (.rentab-hitarea) escuta Pointer Events (mesma API pra mouse e
 *     touch) e liga uma linha-guia + um ponto por série + uma tooltip
 *     (HTML normal, fora do SVG - ver ligarInteracaoGrafico_) com a data
 *     e o valor de cada linha naquele ponto;
 *  b) o "no período" só mostrava a % - Tiago também quer o valor em R$
 *     ganho/perdido (renderInfoRentabilidade agora calcula os dois a
 *     partir do MESMO par de pontos brutos, pra nunca divergir).
 *
 * 16/09/2026: Índices & Câmbio mostrava o dólar/euro com a chave "R$"
 * em vez do símbolo certo (criarTileCambio ganhou o parâmetro `simbolo`,
 * "US$"/"€" em vez do default "R$"). A fatia "Ações EUA" do resumo de
 * Patrimônio (Total/Longo Prazo) agora mostra o valor em dólar primeiro,
 * com o equivalente em R$ entre parênteses
 * (calcularDistribuicaoPorClasse acumula um valorUsd só nessa fatia) -
 * cálculo interno (somas/percentuais) continua 100% em BRL, só a
 * exibição mudou (17/09/2026: o equivalente em R$ saiu da mesma linha e
 * virou uma 2ª linha menor embaixo - ver renderDistribuicao, estourava
 * a largura do card no mobile). wireTooltipAtivos ganhou toque dedicado pro mesmo
 * motivo do Radar (ver distribuicoes-metas.js) - como .ativo-card é um
 * link de verdade (não uma célula de tabela), o toque não podia usar o
 * cartão inteiro como gatilho (senão qualquer toque pra navegar
 * mostraria a tooltip de relance antes de sair da página): entrou um
 * ícone dedicado .ativo-info-icon, só ele responde a pointerdown com
 * pointerType touch/pen (alterna - 2º toque fecha), com preventDefault/
 * stopPropagation no click pra nunca navegar; fechar por toque fora é
 * um novo listener em document/pointerdown (captura). Mouse/hover no
 * cartão inteiro continuam exatamente como antes.
 *
 * 16/09/2026 (mesmo dia, continuação): a legenda do donut de resumo de
 * patrimônio (renderDistribuicao/.distrib-item) também usava `title`
 * nativo - virou .info-alvo com ícone "i" clicável, mesma técnica de
 * toque/toque-fora de cima, ligada 1x em wirePointerTooltipDistrib_ (no
 * container ESTÁVEL de renderResumoPatrimonio, não no de cada card -
 * senão duplicaria a cada redesenho). Ficaram de fora desta rodada
 * apenas os botões de ação com `title` (ex.: nenhum nesta página) - só
 * o texto de valor "Editar" já é visível nos botões daqui, não tinha
 * `title` escondendo nada.
 */

import { icone, montarCabecalhoPagina, mostrarErroCarga } from '../ui/index.js';
import { renderAvisosParciais } from './avisos-parciais.js';
import { getHome, getIntradia } from '../api-client.js';
import { botoesSegmentadoHtml } from '../periodo-personalizado.js';
import { hojeSP } from '../format.js';
import { CHAVES_MERCADO, chaveIntradiaDoAtivo, preencherIntradia } from './inicio-intradia.js';
import { aplicarCardsPorLinha, criarControleCardsPorLinha, lerCardsPorLinha } from './inicio-densidade.js';
import { completarFaixaComIntradia, renderFaixaMercado, renderResumoCompacto, wireListaAtivos } from './inicio-painel.js';
import { criarAtivoCard, wireGraficoAtivo, wireTooltipAtivos } from './inicio-ativos.js';
import { wireGraficoRentabilidade } from './inicio-rentabilidade.js';
import { proventosAReceberDe } from '../analise-grafico.js';
import { montarFavoritos } from './inicio-favoritos.js';
import { renderProventosAnunciados } from './inicio-proventos.js';
import { gravarCacheDados, lerCacheDados } from '../cache-dados.js';
import { mountRefreshControl } from '../shell.js';

// Compatibilidade (A-76, 06/10/2026): estes nomes moraram aqui; agora vivem nos módulos abaixo e continuam exportados daqui.
export { BENCHMARKS_POR_VISAO, CAMPO_FLUXO_APLICADO_POR_VISAO, CAMPO_FLUXO_POR_VISAO, CAMPO_PRINCIPAL_POR_VISAO, COR_PRINCIPAL_POR_VISAO, LABEL_POR_VISAO_RENTABILIDADE, calcularDistribuicaoPorClasse, calcularDistribuicaoRendaEmergencial, calcularResumoEvolucao, calcularResumoRentabilidade, comCamposUsdAcoesEua, filtrarHistoricoPorPeriodo, historicoTemCambioUsd, inicioEhAbertura_, limitesDoHistorico_, montarAnaliseRentabilidade_, normalizarSerieRentabilidade, primeiroIndiceValidoInicio_, resolverVisao, somarProventosNoPeriodo, splitValorExibicao, ultimoValidoDe_ } from './inicio-calc.js';
export { renderGraficoRentabilidade, renderInfoEvolucao, renderInfoRentabilidade, wireGraficoRentabilidade } from './inicio-rentabilidade.js';
export { criarAtivoCard, wireGraficoAtivo, wireTooltipAtivos } from './inicio-ativos.js';

// 06/10/2026 (A-79): renderDistribuicao (donut desenhado à mão) e a paleta dele saíram - nenhuma tela chamava mais;
// as Carteiras usam o anel de charts/anel.js (carteiras-classe-comum.js!renderDistribuicaoGrupoCarteiras).

/**
 * 18/09/2026: "ontem" pro comparativo "ontem era" deixou de vir daqui
 * (valorUltimoPregaoAntes_, que escaneava `historico` procurando o último
 * dia com pregao=true) - depois de DOIS fixes seguidos na série histórica
 * combinada (montarSerieHistoricoInicio_, HistoricoInicio.gs) que ou
 * deixavam o "ontem" um dia atrasado ou corrigiam isso mas quebravam o
 * gráfico de Rentabilidade junto (aquela série casa 3 fontes com gatilhos
 * em horários diferentes - um dia pode sair incompleto sem erro nenhum),
 * o Tiago pediu um caminho separado: o backend agora grava 1x por dia um
 * snapshot dos mesmos 4 valores que Home.gs já lê ao vivo (ver
 * SnapshotResumoDiario.gs) e devolve pronto em `ontem` (resposta de
 * handleHome) - o front-end só lê `ontem[visaoId]` direto, ver
 * renderResumoPatrimonio logo abaixo.
 */

// ============================================================================
// Gráfico de Rentabilidade
// ============================================================================

// ============================================================================
// Grade "Meus Ativos"
// ============================================================================

const NOMES_AVISOS = {
  home: 'dados gerais', historico: 'histórico de rentabilidade', historicoAoVivo: 'último ponto do histórico', ativos: 'meus ativos',
  ontem: 'comparação com o último fechamento', favoritos: 'favoritos', proventosAnunciados: 'proventos anunciados',
};

/** Banner de avisos (falha parcial de alguma seção) - some quando não há nenhum. Texto de gente; detalhe técnico num <details>. */
export function renderAvisos(container, avisos) {
  renderAvisosParciais(container, avisos, NOMES_AVISOS);
}

/**
 * Orquestrador real: busca action=home com o token e liga tudo - chamado
 * pelo index.html assim que o login é confirmado (mountShell!onAuthenticated,
 * ver shell.js). getHomeImpl é injetável pra teste (sem precisar de
 * fetch/token reais).
 */
export async function montarPaginaInicio(token, { doc = document, getHomeImpl = getHome, getIntradiaImpl = getIntradia, salvarFavoritosImpl = null, opcoesFavoritos = null } = {}) {
  const loadingEl = doc.getElementById('inicioLoading');
  const erroEl = doc.getElementById('inicioErro');
  const conteudoEl = doc.getElementById('inicioConteudo');
  // 06/10/2026 (Onda 3): cabeçalho padrão da página (título + "Atualizar dados" à direita). Sem o contêiner (HTML antigo em
  // cache), o botão cai no espaço antigo.
  const cabecalhoEl = doc.getElementById('inicioCabecalho');
  // 07/10/2026 (Tiago: "me dê a opção de colocar 4, 5, 6 ou 7 cards por row"): controle "Cards por linha" no cabeçalho (só
  // desktop) - vale pra faixa de mercado e pros Favoritos; escolha lembrada em localStorage (inicio-densidade.js).
  const controleCards = criarControleCardsPorLinha(doc, {
    valor: lerCardsPorLinha(),
    aoMudar: (n) => aplicarCardsPorLinha(doc.getElementById('inicioConteudo'), n),
  });
  aplicarCardsPorLinha(doc.getElementById('inicioConteudo'), lerCardsPorLinha());
  const cabecalho = cabecalhoEl ? montarCabecalhoPagina(cabecalhoEl, {
    secao: 'Início', titulo: 'Início', subtitulo: 'Sua carteira e o mercado de hoje', refresh: true, acoes: [controleCards],
  }) : null;
  const refreshControlEl = (cabecalho && cabecalho.refreshEl) || doc.getElementById('refreshControlInicio');
  const periodoEl = doc.getElementById('periodoTabs');
  if (periodoEl && !periodoEl.querySelector('[data-periodo]')) periodoEl.innerHTML = botoesSegmentadoHtml(['mes', '30d', '6m', '12m', '3a', 'tudo'], 'mes');
  // celular: "Por visão" começa recolhido (o gráfico do patrimônio total já está à vista)
  const maisEl = doc.getElementById('rentabMais');
  try { if (maisEl && doc.defaultView && doc.defaultView.matchMedia && doc.defaultView.matchMedia('(max-width: 700px)').matches) maisEl.open = false; } catch (e) { /* sem matchMedia */ }
  // Partial antigo em cache (HTML de antes de 26/09 com o JS novo): desenha a
  // faixa no lugar dos cartões antigos em vez de deixar "Índices & câmbio" vazio.
  const faixaEl = doc.getElementById('faixaMercado') || doc.getElementById('indicesCambioGrid');
  if (faixaEl && faixaEl.id !== 'faixaMercado') faixaEl.classList.add('mkt-faixa');

  // 26/09/2026: gráfico do dia (inicio-intradia.js / Intradia.gs) - dos
  // índices da faixa de mercado e dos favoritos. Guardado aqui pra redesenhar
  // na hora (Atualizar dados, estrela, arrastar) sem buscar de novo; busca
  // de novo no máximo 1x por minuto, e só as chaves que faltam no meio tempo.
  const seriesIntradia = {};
  let ultimaBuscaIntradia = 0;
  let pendentesIntradia = new Set();
  let agendado = false;
  const hojeISO = () => hojeSP(); // 05/10/2026: o mesmo "hoje" (São Paulo) de format.js
  function aplicarIntradia(series) {
    if (!conteudoEl) return;
    preencherIntradia(conteudoEl, series, { hojeISO: hojeISO() });
    completarFaixaComIntradia(faixaEl, series);
  }
  async function buscarIntradia(chaves, { forcar = false } = {}) {
    if (!getIntradiaImpl || !chaves.length) return;
    const agora = Date.now();
    const lista = forcar || agora - ultimaBuscaIntradia > 60000 ? chaves : chaves.filter((c) => !(c in seriesIntradia));
    if (!lista.length) { aplicarIntradia(seriesIntradia); return; }
    if (lista.length === chaves.length) ultimaBuscaIntradia = agora;
    let r = null;
    try { r = await getIntradiaImpl(token, lista); } catch (e) { r = null; }
    if (r && r.ok && r.resultado) {
      Object.assign(seriesIntradia, r.resultado);
      aplicarIntradia(r.resultado);
    }
  }
  function pedirIntradia(chaves) {
    chaves.forEach((c) => pendentesIntradia.add(c));
    if (agendado) return;
    agendado = true;
    Promise.resolve().then(() => {
      agendado = false;
      const lista = [...pendentesIntradia];
      pendentesIntradia = new Set();
      buscarIntradia(lista);
    });
  }
  // cartão de favorito = o mesmo de "Meus ativos" + o gráfico do dia
  function criarCardFavorito(d, ativo, opcoes) {
    const card = criarAtivoCard(d, ativo, opcoes);
    const chave = chaveIntradiaDoAtivo(ativo);
    if (!chave) return card;
    card.classList.add('com-intradia');
    const slot = d.createElement('div');
    slot.className = 'ativo-intradia intradia-slot';
    slot.dataset.intradia = chave;
    card.insertBefore(slot, card.querySelector('.ativo-card-acoes'));
    if (chave in seriesIntradia) preencherIntradia(card, { [chave]: seriesIntradia[chave] }, { hojeISO: hojeISO() });
    else pedirIntradia([chave]);
    return card;
  }

  function desenharResposta(resposta) {
    if (loadingEl) loadingEl.hidden = true;

    if (!resposta.ok) {
      if (erroEl) mostrarErroCarga(erroEl, { tela: 'Início', resposta, aoTentar: carregarERedesenhar, doc });
      return;
    }

    if (conteudoEl) conteudoEl.hidden = false;
    if (erroEl) erroEl.hidden = true;

    renderAvisos(doc.getElementById('inicioAvisos'), resposta.avisos);
    renderFaixaMercado(doc, faixaEl, { indices: resposta.indices, cambio: resposta.cambio });
    renderResumoCompacto(doc, doc.getElementById('resumoDistribuicao'), {
      patrimonio: resposta.patrimonio,
      ativos: resposta.ativos,
      cambio: resposta.cambio,
      ontem: resposta.ontem,
      historico: resposta.historico,
    });

    const PAINEIS_RENTABILIDADE = [
      { visaoId: 'total', sufixo: 'Total' },
      { visaoId: 'longoPrazo', sufixo: 'LongoPrazo' },
      { visaoId: 'nacional', sufixo: 'Nacional' },
      { visaoId: 'internacional', sufixo: 'Internacional' },
      { visaoId: 'rendaEmergencial', sufixo: 'RendaEmergencial' },
    ];
    wireGraficoRentabilidade(doc, {
      patrimonio: resposta.patrimonio,
      historico: resposta.historico,
      periodoTabsContainer: doc.getElementById('periodoTabs'),
      periodoInicial: 'mes',
      // 02/10/2026: "Escolher período" (A), "Ontem era" + meses (B) e o card de Análise (C)
      periodoPersonalizado: { chave: 'inicio.rentabilidade' },
      ontem: resposta.ontem,
      paineis: PAINEIS_RENTABILIDADE.map(({ visaoId, sufixo }) => ({
        visaoId,
        infoContainer: doc.getElementById(`rentabInfo${sufixo}`),
        chartContainer: doc.getElementById(`rentabChart${sufixo}`),
        legendaContainer: doc.getElementById(`rentabLegenda${sufixo}`),
        comparativo: true,
        analise: true,
        // 03/10/2026 (base de critérios de rentabilidade): proventos que já
        // passaram da data-com e não foram pagos - a cota já caiu, o dinheiro
        // ainda não entrou (só nas visões com renda variável brasileira).
        analiseExtra: visaoId === 'rendaEmergencial' || visaoId === 'internacional' ? null
          : { proventosAReceber: proventosAReceberDe(resposta.proventosAnunciados, { classes: ['acoes', 'fiis'] }) },
        // 03/10/2026 (revisão do pedido D, "Patrimônio total: incluir o índice
        // IPCA"): a mesma linha do IPCA da Visão geral de Carteiras também no
        // Patrimônio total da Início (as outras visões ficam como estavam).
        benchmarksExtra: visaoId === 'total' ? [{ campo: 'indiceIpca', label: 'IPCA', cor: '--rf', dash: '3 3' }] : null,
      })),
    });

    // 26/09/2026: "Meus ativos" virou lista enxuta na coluna lateral
    // (inicio-painel.js) - a estrela continua sendo a mesma (.ativo-fav-btn).
    const meusAtivosLista = doc.getElementById('meusAtivosGrid');
    wireListaAtivos(doc, {
      lista: meusAtivosLista,
      abas: doc.getElementById('filtroAtivosTabs'),
      busca: doc.getElementById('alBusca'),
      ordem: doc.getElementById('alOrdem'),
      contador: doc.getElementById('alContador'),
      mais: doc.getElementById('alMais'),
    }, resposta.ativos || [], { cambioUsd: resposta.cambio && resposta.cambio.usd });

    // 23/09/2026: Favoritos (inicio-favoritos.js); a lista salva vem junto na resposta da Início.
    const favoritosGrid = doc.getElementById('favoritosGrid');
    montarFavoritos(doc, {
      secao: doc.getElementById('favoritosSecao'),
      grid: favoritosGrid,
      botaoEditar: doc.getElementById('favoritosEditar'),
      dica: doc.getElementById('favoritosDica'),
      status: doc.getElementById('favoritosStatus'),
      meusAtivosGrid: meusAtivosLista,
      ativos: resposta.ativos || [],
      favoritos: Array.isArray(resposta.favoritos) ? resposta.favoritos : [],
      token,
      criarCard: criarCardFavorito,
      ...(salvarFavoritosImpl ? { salvarImpl: salvarFavoritosImpl } : {}),
      ...(opcoesFavoritos || {}), // só teste (ex.: acharCardNoPonto - JSDOM não tem layout)
    });
    wireTooltipAtivos(doc, favoritosGrid);
    wireGraficoAtivo(doc, favoritosGrid, { token });

    // 24/09/2026: proventos a receber (FIIs, FNet/B3) - ver inicio-proventos.js
    renderProventosAnunciados(doc, doc.getElementById('proventosSecao'), resposta.proventosAnunciados);

    aplicarIntradia(seriesIntradia);
    const chavesFavoritos = favoritosGrid ? [...favoritosGrid.querySelectorAll('[data-intradia]')].map((el) => el.dataset.intradia) : [];
    buscarIntradia([...CHAVES_MERCADO, ...chavesFavoritos]);
  }

  // 25/09/2026 (Tiago: "demorando muito pra carregar"): desenha na hora com
  // a última resposta guardada (cache-dados.js, IndexedDB) e busca a nova por
  // trás; se a nova falhar, o que já está na tela fica (com o aviso de erro).
  async function carregarERedesenhar() {
    let resposta;
    try { resposta = await getHomeImpl(token); } catch (erro) { resposta = { ok: false, etapa: 'network', erro: erro && erro.message ? erro.message : String(erro) }; }
    if (resposta && resposta.ok) gravarCacheDados('home', resposta);
    desenharResposta(resposta);
  }

  const emCache = await lerCacheDados('home');
  if (emCache) {
    try { desenharResposta(emCache.dados); } catch (erro) { console.error('cache da página não desenhou', erro); }
  }

  // 26/09/2026: o botão "Atualizar dados" entra ANTES da 1ª busca (mostra
  // "Atualizando…" enquanto carrega) e fica fora do conteúdo - visível no
  // carregamento e no erro também, que é quando mais se precisa dele.
  await mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).atualizar();
}

/**
 * carteiras-fiis.js — subpágina Carteiras > FIIs (action=carteirasFiis, ver apps-script/CarteirasClasses.gs!montarCarteirasFiis_).
 * Mesmo molde de carteiras-acoes.js — a diferença real é P/VP no lugar de P/L (FIIs não têm P/L) e Patrimônio do fundo, além dos chips
 * de filtro por segmento (Papel/Shopping/etc.), que só FIIs têm (19/09/2026 #3). 06/10/2026 (Onda 3, fase 2): kit Material 3.
 */

import { getCarteirasFiis, getHome } from '../api-client.js';
import { secaoVideosHtml, criarCarregadorVideos } from '../videos.js'; // 25/09/2026: vídeos do YouTube da carteira
import { formatBRL, formatBRLCompacto, formatPercentFromFraction, formatPercentFromPoints, formatNumeroBR } from '../format.js';
import { urlAtivoTicker } from '../link-ativo.js'; // 25/09/2026: ticker -> tela do ativo
import { statProventosHero, secaoProventosCarteiraHtml, renderProventosCarteira } from './carteiras-proventos.js';
import { proventosAReceberDe } from '../analise-grafico.js'; // 03/10/2026: proventos a receber no card de Análise (data-ex)
import { criarGraficosCarteira } from './carteiras-graficos.js';
import {
  proventosDoHistorico_, renderResumoClasseCarteiras, renderBenchmarksClasseCarteiras, renderDistribuicaoGrupoCarteiras, montarTabelaFiltravel,
  wirePointerTooltipCarteiras_, celulaAtivoRendaVariavelHtml, statusVies, seloViesHtml, variacaoHtml, linhaTotalHtml,
  contarVies_, esqueletoClasseHtml, linksRelevantesHtml, contagemTexto, lerEstadoSecoes, aplicarEstadoSecoes, secaoRecolhivelHtml, montarPaginaClasseCarteiras,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_FIIS = 'carteiras_fiis_v2';

// 25/09/2026 (Tiago, ponto 3): carteira recomendada da Suno pra esta subpágina.
const LINKS_RELEVANTES_FIIS = [{ rotulo: 'Carteira recomendada: FIIs', href: 'https://investidor.suno.com.br/carteiras/fiis' }];

const COLUNAS_ATIVOS_FIIS = [
  { label: 'Ativo', campo: 'ticker', ordenarPor: (a) => a.ticker, topo: true, formatar: celulaAtivoRendaVariavelHtml },
  {
    label: 'Preço / dia', campo: 'precoAtual', ordenarPor: (a) => a.precoAtual, num: true, opc: true,
    formatar: (a) => `${formatBRL(a.precoAtual)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub">${variacaoHtml(a.variacaoDia)}</span>` : ''}`,
  },
  { label: 'Qtd', campo: 'quantidade', ordenarPor: (a) => a.quantidade, num: true, opc: true, formatar: (a) => formatNumeroBR(a.quantidade, 0) },
  {
    label: 'Pr. médio', campo: 'precoMedio', ordenarPor: (a) => a.precoMedio, num: true, opc: true,
    ajuda: 'Preço médio pago por cota, ponderado por todas as compras feitas.',
    formatar: (a) => formatBRL(a.precoMedio),
  },
  {
    label: 'Status', campo: 'vies', ordenarPor: (a) => statusVies(a.vies).texto, opc: true,
    ajuda: 'Compara o preço atual com o preço-teto definido por você: abaixo do teto = Comprar, acima = Aguardar.',
    formatar: (a) => `${seloViesHtml(a.vies) || '—'}${typeof a.precoTeto === 'number' ? `<span class="cc-sub">teto ${formatBRL(a.precoTeto)}</span>` : ''}`,
  },
  {
    label: 'DY', campo: 'dyPercentual', ordenarPor: (a) => a.dyPercentual, num: true, opc: true,
    ajuda: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pelo preço atual da cota.',
    formatar: (a) => `${formatBRL(a.dyValor)}${typeof a.dyPercentual === 'number' ? `<span class="cc-sub">${formatPercentFromFraction(a.dyPercentual)}</span>` : ''}`,
  },
  {
    label: 'P/VP', campo: 'pvp', ordenarPor: (a) => a.pvp, num: true, opc: true,
    ajuda: 'Preço/Valor Patrimonial: preço da cota dividido pelo valor patrimonial por cota do fundo.',
    formatar: (a) => (typeof a.pvp === 'number' ? formatNumeroBR(a.pvp, 2) : '—'),
  },
  {
    label: 'Patrim. fundo', campo: 'patrimonio', ordenarPor: (a) => a.patrimonio, num: true, opc: true,
    formatar: (a) => (typeof a.patrimonio === 'number' ? formatBRLCompacto(a.patrimonio) : '—'),
  },
  { label: '% cart.', campo: 'percentualCarteira', ordenarPor: (a) => a.percentualCarteira, num: true, opc: true, formatar: (a) => formatPercentFromFraction(a.percentualCarteira, 1) },
  {
    label: 'Total', campo: 'totalAtualizado', ordenarPor: (a) => a.totalAtualizado, num: true,
    formatar: (a) => `${formatBRL(a.totalAtualizado)}<span class="cc-sub">de ${formatNumeroBR(a.totalComprado, 2)}</span>`,
  },
  {
    label: 'Lucro / Prejuízo', campo: 'lucroPrejuizo', ordenarPor: (a) => a.lucroPrejuizo, num: true,
    formatar: (a) => `<span class="${a.lucroPrejuizo >= 0 ? 'num-bom' : 'num-ruim'}">${formatBRL(a.lucroPrejuizo)}</span><span class="cc-sub">${variacaoHtml(a.percentualLucroPrejuizo)}</span>`,
  },
];

/** Linha de totais no rodapé - somada da lista EXIBIDA, pra bater com o filtro de segmento OU a busca (19/09/2026 #3). */
function montarLinhaTotalAtivos_(ativosExibidos) {
  const somaAtualizado = ativosExibidos.reduce((s, a) => s + (a.totalAtualizado || 0), 0);
  const somaComprado = ativosExibidos.reduce((s, a) => s + (a.totalComprado || 0), 0);
  const somaLucro = somaAtualizado - somaComprado;
  const percLucro = somaComprado ? somaLucro / somaComprado : 0;
  return linhaTotalHtml(COLUNAS_ATIVOS_FIIS, `Total (${contagemTexto(ativosExibidos.length)})`, {
    totalAtualizado: `${formatBRL(somaAtualizado)}<span class="cc-sub">de ${formatNumeroBR(somaComprado, 2)}</span>`,
    lucroPrejuizo: `<span class="${somaLucro >= 0 ? 'num-bom' : 'num-ruim'}">${formatBRL(somaLucro)}</span><span class="cc-sub">${variacaoHtml(percLucro)}</span>`,
  });
}

function desenhar(doc, dados, { historicoPendente = false, aoTentarGraficos = null } = {}) {
  const conteudoEl = doc.getElementById('fiisConteudo');
  const estadoSecoes = lerEstadoSecoes(conteudoEl);
  conteudoEl.innerHTML = esqueletoClasseHtml({
    prefixo: 'fiis', links: linksRelevantesHtml(LINKS_RELEVANTES_FIIS), tituloDistribuicao: 'Por tipo', tituloLista: 'Ativos', contagem: contagemTexto(dados.resumo.quantidadeAtivos),
    extrasAposLista: `${secaoProventosCarteiraHtml('fiisProventos')}${secaoRecolhivelHtml({ nome: 'videos', id: 'fiisVideosSecao', titulo: 'Vídeos', corpoHtml: secaoVideosHtml('fiisVideos') })}`,
  });
  const $ = (id) => doc.getElementById(id);
  wirePointerTooltipCarteiras_(doc, conteudoEl);

  renderResumoClasseCarteiras(doc, $('fiisResumo'), dados.resumo, {
    corToken: '--fiis', dono: conteudoEl,
    // 23/09/2026 #3: proventos do histórico (inclui códigos antigos). 25/09/2026: do mês e dos últimos 12 meses (o total desde o início fica no "i")
    extras: [statProventosHero(dados.historico, ['proventosFiis'], { formatar: formatBRL })
      || { rotulo: 'Proventos recebidos', valor: proventosDoHistorico_(dados.historico, 'proventosFiis', 'fluxoCaixaFiis', 'fluxoAplicadoFiis') ?? dados.resumo.proventosTotais, formatar: formatBRL }],
    vies: contarVies_(dados.ativos),
  });
  // 19/09/2026 #2: FIIs ganhou Ibovespa/CDI junto do IFIX. IFIX/Ibovespa em variação do dia (com tom), CDI em fração a.a. (neutro)
  const ifixVar = dados.benchmarks?.ifix;
  const ibovespaVar = dados.benchmarks?.ibovespa;
  renderBenchmarksClasseCarteiras(doc, $('fiisBenchmarks'), [
    { label: 'IFIX hoje', valor: typeof ifixVar === 'number' ? formatPercentFromPoints(ifixVar) : '—', cor: typeof ifixVar === 'number' ? (ifixVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'Ibovespa hoje', valor: typeof ibovespaVar === 'number' ? formatPercentFromPoints(ibovespaVar) : '—', cor: typeof ibovespaVar === 'number' ? (ibovespaVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.cdi) },
  ]);

  const graficos = criarGraficosCarteira(doc, $('fiisGraficos'), {
    historico: dados.historico || null, chavePeriodo: 'carteiras.fiis', aoTentar: aoTentarGraficos,
    paineis: [{
      visaoId: 'carteiraFiis', camposProventos: ['proventosFiis'], labelInfoEvolucao: 'Patrimônio em FIIs', corToken: '--fiis',
      analise: true, analiseExtra: { proventosAReceber: proventosAReceberDe(dados.proventosAnunciados, { classes: ['fiis'] }) }, comparativo: true,
    }],
  });
  if (!(dados.historico && dados.historico.length) && !historicoPendente) graficos.erro('Não deu pra carregar os gráficos agora. O resto da página continua normal.');

  renderDistribuicaoGrupoCarteiras(doc, $('fiisDistribuicao'), dados.distribuicaoPorGrupo, { dono: conteudoEl });
  renderProventosCarteira(doc, $('fiisProventos'), dados.proventosAnunciados, { classes: ['fiis'] });

  const totalCarteira = dados.resumo.totalAtualizado || 0;
  const ativosBase = (dados.ativos || []).map((a) => ({ ...a, percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0 }));
  // Chips "Todos"/segmento vêm de distribuicaoPorGrupo (já ordenada por totalAtualizado desc) - dinâmico, nunca hard-coded
  const grupos = (dados.distribuicaoPorGrupo || []).map((d) => d.grupo);
  montarTabelaFiltravel(doc, {
    filtrosEl: $('fiisFiltros'), tabelaEl: $('fiisTabela'), ativos: ativosBase, colunas: COLUNAS_ATIVOS_FIIS, linhaTotal: montarLinhaTotalAtivos_, grupos,
    tituloFolha: (a) => [a.ticker, a.nome].filter(Boolean).join(' · '), acaoFolha: (a) => ({ href: urlAtivoTicker(a.ticker), rotulo: 'Abrir a página do ativo' }),
  });
  aplicarEstadoSecoes(doc, conteudoEl, estadoSecoes);
}

export async function montarPaginaCarteirasFiis(token, { doc = document, getCarteirasFiisImpl = getCarteirasFiis, getHomeImpl = getHome, getVideosImpl = undefined } = {}) {
  const preencherVideos = criarCarregadorVideos(token, { carteira: 'fiis' }, getVideosImpl ? { getVideosImpl } : {});
  return montarPaginaClasseCarteiras(token, {
    doc, prefixo: 'fiis', tela: 'Carteira de FIIs', chaveCache: CHAVE_CACHE_FIIS, buscarCarteira: getCarteirasFiisImpl, getHomeImpl, desenhar,
    depoisDeDesenhar: () => preencherVideos(doc.getElementById('fiisVideos')),
  });
}

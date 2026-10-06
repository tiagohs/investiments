/**
 * carteiras-acoes.js — subpágina Carteiras > Ações (action=carteirasAcoes, ver apps-script/CarteirasClasses.gs!montarCarteirasAcoes_).
 * 06/10/2026 (Onda 3, fase 2): kit Material 3 - cards KPI, chips de benchmark, gráficos da biblioteca (carteiras-graficos.js), anel "por
 * setor" e tabela do kit. A carga (cache + API + histórico em paralelo, estados de erro) é a de montarPaginaClasseCarteiras.
 */

import { getCarteirasAcoes, getHome } from '../api-client.js';
import { secaoVideosHtml, criarCarregadorVideos } from '../videos.js'; // 25/09/2026: vídeos do YouTube da carteira
import { formatBRL, formatPercentFromFraction, formatPercentFromPoints, formatNumeroBR } from '../format.js';
import { urlAtivoTicker } from '../link-ativo.js'; // 25/09/2026: ticker -> tela do ativo
import { statProventosHero, secaoProventosCarteiraHtml, renderProventosCarteira, definirFonteProventos } from './carteiras-proventos.js';
import { proventosAReceberDe } from '../analise-grafico.js'; // 03/10/2026: proventos a receber no card de Análise (data-ex)
import { criarGraficosCarteira } from './carteiras-graficos.js';
import { proventosDoHistorico_, renderResumoClasseCarteiras, renderBenchmarksClasseCarteiras, renderDistribuicaoGrupoCarteiras, montarTabelaFiltravel, wirePointerTooltipCarteiras_, celulaAtivoRendaVariavelHtml, seloViesHtml, variacaoHtml, celulaAtivoHtml, linhaTotalHtml, contarVies_, esqueletoClasseHtml, linksRelevantesHtml, contagemTexto, lerEstadoSecoes, aplicarEstadoSecoes, secaoRecolhivelHtml, montarPaginaClasseCarteiras } from './carteiras-classe-comum.js';
import { statusVies } from './carteiras-pecas.js';

const CHAVE_CACHE_ACOES = 'carteiras_acoes_v2';

// 25/09/2026 (Tiago, ponto 3): carteiras recomendadas da Suno - quase toda a carteira de Ações está em "Dividendos", só VAMO3/B3SA3 são da "Valor".
const LINKS_RELEVANTES_ACOES = [
  { rotulo: 'Carteira recomendada: Dividendos', href: 'https://investidor.suno.com.br/carteiras/dividendos' },
  { rotulo: 'Carteira recomendada: Valor (VAMO3, B3SA3)', href: 'https://investidor.suno.com.br/carteiras/valor' },
];

const COLUNAS_ATIVOS_ACOES = [
  { label: 'Ativo', campo: 'ticker', ordenarPor: (a) => a.ticker, topo: true, formatar: celulaAtivoRendaVariavelHtml },
  {
    label: 'Preço / dia', campo: 'precoAtual', ordenarPor: (a) => a.precoAtual, num: true, opc: true,
    formatar: (a) => `${formatBRL(a.precoAtual)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub">${variacaoHtml(a.variacaoDia)}</span>` : ''}`,
  },
  { label: 'Qtd', campo: 'quantidade', ordenarPor: (a) => a.quantidade, num: true, opc: true, formatar: (a) => formatNumeroBR(a.quantidade, 0) },
  {
    label: 'Pr. médio', campo: 'precoMedio', ordenarPor: (a) => a.precoMedio, num: true, opc: true,
    ajuda: 'Preço médio pago por ação, ponderado por todas as compras feitas.',
    formatar: (a) => formatBRL(a.precoMedio),
  },
  {
    label: 'Status', campo: 'vies', ordenarPor: (a) => statusVies(a.vies).texto, opc: true,
    ajuda: 'Compara o preço atual com o preço-teto definido por você: abaixo do teto = Comprar, acima = Aguardar.',
    formatar: (a) => `${seloViesHtml(a.vies) || '—'}${typeof a.precoTeto === 'number' ? `<span class="cc-sub">teto ${formatBRL(a.precoTeto)}</span>` : ''}`,
  },
  {
    label: 'DY', campo: 'dyPercentual', ordenarPor: (a) => a.dyPercentual, num: true, opc: true,
    ajuda: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pelo preço atual da ação.',
    formatar: (a) => `${formatBRL(a.dyValor)}${typeof a.dyPercentual === 'number' ? `<span class="cc-sub">${formatPercentFromFraction(a.dyPercentual)}</span>` : ''}`,
  },
  {
    label: 'P/L', campo: 'pl', ordenarPor: (a) => a.pl, num: true, opc: true,
    ajuda: 'Preço/Lucro: preço da ação dividido pelo lucro por ação dos últimos 12 meses — quantos anos de lucro pagam o preço atual.',
    formatar: (a) => (typeof a.pl === 'number' ? formatNumeroBR(a.pl, 2) : '—'),
  },
  {
    label: 'P/VP', campo: 'pvp', ordenarPor: (a) => a.pvp, num: true, opc: true,
    ajuda: 'Preço/Valor Patrimonial: preço da ação dividido pelo valor patrimonial por ação — compara o preço de mercado com o valor contábil.',
    formatar: (a) => (typeof a.pvp === 'number' ? formatNumeroBR(a.pvp, 2) : '—'),
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

/** Linha de totais no rodapé (19/09/2026 #2) - somada a partir da lista efetivamente exibida, pra continuar batendo quando a busca filtra a tabela. */
function montarLinhaTotalAtivos_(ativosExibidos) {
  const somaAtualizado = ativosExibidos.reduce((s, a) => s + (a.totalAtualizado || 0), 0);
  const somaComprado = ativosExibidos.reduce((s, a) => s + (a.totalComprado || 0), 0);
  const somaLucro = somaAtualizado - somaComprado;
  const percLucro = somaComprado ? somaLucro / somaComprado : 0;
  const qtd = ativosExibidos.length;
  return linhaTotalHtml(COLUNAS_ATIVOS_ACOES, `Total (${contagemTexto(qtd)})`, {
    totalAtualizado: `${formatBRL(somaAtualizado)}<span class="cc-sub">de ${formatNumeroBR(somaComprado, 2)}</span>`,
    lucroPrejuizo: `<span class="${somaLucro >= 0 ? 'num-bom' : 'num-ruim'}">${formatBRL(somaLucro)}</span><span class="cc-sub">${variacaoHtml(percLucro)}</span>`,
  });
}

function desenhar(doc, dados, { historicoPendente = false, aoTentarGraficos = null } = {}) {
  const conteudoEl = doc.getElementById('acoesConteudo');
  const estadoSecoes = lerEstadoSecoes(conteudoEl);
  conteudoEl.innerHTML = esqueletoClasseHtml({
    prefixo: 'acoes', links: linksRelevantesHtml(LINKS_RELEVANTES_ACOES), tituloDistribuicao: 'Por setor', tituloLista: 'Ativos', contagem: contagemTexto(dados.resumo.quantidadeAtivos),
    proventosHtml: secaoProventosCarteiraHtml('acoesProventos', { navegacao: true }),
    extrasAposLista: `${secaoRecolhivelHtml({ nome: 'videos', id: 'acoesVideosSecao', titulo: 'Vídeos', corpoHtml: secaoVideosHtml('acoesVideos') })}`,
  });
  const $ = (id) => doc.getElementById(id);

  // Tooltips "i" (cabeçalho, nota de ativo, cards KPI) - ligado 1x no container estável
  wirePointerTooltipCarteiras_(doc, conteudoEl);

  renderResumoClasseCarteiras(doc, $('acoesResumo'), dados.resumo, {
    corToken: '--acoes', dono: conteudoEl,
    // 23/09/2026 #3: proventos do histórico (inclui códigos antigos). 25/09/2026: do mês e dos últimos 12 meses (o total desde o início fica no "i")
    extras: [statProventosHero(dados.historico, ['proventosAcoes'], { formatar: formatBRL })
      || { rotulo: 'Proventos recebidos', valor: proventosDoHistorico_(dados.historico, 'proventosAcoes', 'fluxoCaixaAcoes', 'fluxoAplicadoAcoes') ?? dados.resumo.proventosTotais, formatar: formatBRL }],
    vies: contarVies_(dados.ativos),
  });
  const ibovespaVar = dados.benchmarks?.ibovespa;
  renderBenchmarksClasseCarteiras(doc, $('acoesBenchmarks'), [
    { label: 'Ibovespa hoje', valor: typeof ibovespaVar === 'number' ? formatPercentFromPoints(ibovespaVar) : '—', cor: typeof ibovespaVar === 'number' ? (ibovespaVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.cdi) },
  ]);

  const graficos = criarGraficosCarteira(doc, $('acoesGraficos'), {
    historico: dados.historico || null, chavePeriodo: 'carteiras.acoes', aoTentar: aoTentarGraficos,
    paineis: [{
      visaoId: 'carteiraAcoes', camposProventos: ['proventosAcoes'], labelInfoEvolucao: 'Patrimônio em Ações', corToken: '--acoes',
      analise: true, analiseExtra: { proventosAReceber: proventosAReceberDe(dados.proventosAnunciados, { classes: ['acoes'] }) }, comparativo: true,
    }],
  });
  if (!(dados.historico && dados.historico.length) && !historicoPendente) graficos.erro('Não deu pra carregar os gráficos agora. O resto da página continua normal.');

  renderDistribuicaoGrupoCarteiras(doc, $('acoesDistribuicao'), dados.distribuicaoPorGrupo, { dono: conteudoEl });
  renderProventosCarteira(doc, $('acoesProventos'), dados.proventosAnunciados, { classes: ['acoes'] });

  const totalCarteira = dados.resumo.totalAtualizado || 0;
  const ativosBase = (dados.ativos || []).map((a) => ({ ...a, percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0 }));
  montarTabelaFiltravel(doc, {
    filtrosEl: $('acoesFiltros'), tabelaEl: $('acoesTabela'), ativos: ativosBase, colunas: COLUNAS_ATIVOS_ACOES, linhaTotal: montarLinhaTotalAtivos_,
    tituloFolha: (a) => [a.ticker, a.nome].filter(Boolean).join(' · '), acaoFolha: (a) => ({ href: urlAtivoTicker(a.ticker), rotulo: 'Abrir a página do ativo' }),
  });
  aplicarEstadoSecoes(doc, conteudoEl, estadoSecoes);
}

export async function montarPaginaCarteirasAcoes(token, { doc = document, getCarteirasAcoesImpl = getCarteirasAcoes, getHomeImpl = getHome, getVideosImpl = undefined, getProventosImpl = undefined } = {}) {
  definirFonteProventos(token, getProventosImpl); // 06/10/2026: meses anteriores dos proventos (ação "proventos" existente)
  const preencherVideos = criarCarregadorVideos(token, { carteira: 'acoes' }, getVideosImpl ? { getVideosImpl } : {});
  return montarPaginaClasseCarteiras(token, {
    doc, prefixo: 'acoes', tela: 'Carteira de Ações', chaveCache: CHAVE_CACHE_ACOES, buscarCarteira: getCarteirasAcoesImpl, getHomeImpl, desenhar,
    depoisDeDesenhar: () => preencherVideos(doc.getElementById('acoesVideos')),
  });
}

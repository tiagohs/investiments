/**
 * carteiras-renda-fixa.js — subpágina Carteiras > Renda Fixa
 * (action=carteirasRendaFixa, ver
 * apps-script/CarteirasRendaFixa.gs!montarCarteirasRendaFixa_). Formato
 * de resposta é parecido com as 3 classes de renda variável (resumo +
 * distribuição + ativos), mas cada ativo tem campos bem diferentes
 * (indexador/vencimento/rentabilidade contratada/IR) — por isso não usa
 * o mesmo molde de colunas das outras 3, mas reaproveita os mesmos
 * blocos genéricos de carteiras-classe-comum.js (resumo/donut/tabela).
 */

import { getCarteirasRendaFixa, getHome } from '../api-client.js';
import { secaoVideosHtml, criarCarregadorVideos } from '../videos.js'; // 25/09/2026: vídeos do YouTube da carteira
import { formatBRL, formatPercentFromFraction } from '../format.js';
import { urlAtivo, refAtivo, linkAtivoComNovaAbaHtml } from '../link-ativo.js'; // 25/09/2026: título -> tela do ativo
import { esc } from '../util/html.js';
import { criarGraficosCarteira } from './carteiras-graficos.js';
import {
  somaCampoHistorico_, renderResumoClasseCarteiras, renderBenchmarksClasseCarteiras, renderDistribuicaoGrupoCarteiras, montarTabelaFiltravel,
  wirePointerTooltipCarteiras_, logoCirculoRendaFixaHtml, celulaAtivoHtml, linhaTotalHtml, esqueletoClasseHtml, linksRelevantesHtml,
  contagemTexto, lerEstadoSecoes, aplicarEstadoSecoes, secaoRecolhivelHtml, montarPaginaClasseCarteiras,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_RENDA_FIXA = 'carteiras_renda_fixa_v2';

// 25/09/2026 (Tiago, ponto 3): as 2 carteiras recomendadas da Suno que cobrem renda fixa - longo prazo e reserva de emergência.
const LINKS_RELEVANTES_RENDA_FIXA = [
  { rotulo: 'Carteira recomendada: Renda Fixa', href: 'https://investidor.suno.com.br/carteiras/renda-fixa' },
  { rotulo: 'Carteira recomendada: Reserva de emergência', href: 'https://investidor.suno.com.br/carteiras/reserva-de-emergencia' },
];

// 19/09/2026 #7 (catchup pedido pelo Tiago, junto com os gráficos: "e
// apos os graficos, lembre-se de atualizar o que falta na tela de renda
// fixa - tabela desatualizada, filtros por tipo, etc") - rótulo EXATO dos
// 2 valores de tipoCarteira que o back-end manda (CarteirasRendaFixa.gs:
// "emergencial"/"longo-prazo") pros chips de filtro E pra tag da coluna
// Carteira, num lugar só (nunca 2 strings podendo divergir).
const LABEL_TIPO_CARTEIRA = { emergencial: 'Reserva de Emergência', 'longo-prazo': 'Longo Prazo' };

/**
 * Colunas da tabela de Renda Fixa - Título/Vencimento/Contratada/Rentab./Carteira/% cart./Total/IR hoje. `campo`+`ordenarPor` em TODAS as
 * colunas ordenáveis (clique no cabeçalho). 06/10/2026: "tags verdinhas em Rentabilidade e Indexador contratado" (pedido verbal do Tiago)
 * viram selo tonal verde do kit (`chip-tonal chip-good`) em "Contratada" e "Rentab."; a carteira é um selo tonal (Longo Prazo = info,
 * Emergência = verde).
 */
const COLUNAS_ATIVOS_RENDA_FIXA = [
  {
    label: 'Título', campo: 'titulo', topo: true,
    ordenarPor: (a) => a.nomePersonalizado || a.tipoInvestimento || a.codigo || '',
    formatar: (a) => {
      const nome = a.nomePersonalizado || a.tipoInvestimento || a.codigo || '—';
      // 25/09/2026: logo (Tesouro Selic/IPCA, Inter) igual às outras tabelas + ↗ nova aba
      const href = urlAtivo(refAtivo({ ...a, classe: 'rf' }));
      return celulaAtivoHtml({ logo: logoCirculoRendaFixaHtml(a), ticker: nome, nome: a.instituicao || '', linkHtml: linkAtivoComNovaAbaHtml(href, esc(nome), nome) });
    },
  },
  { label: 'Vencimento', campo: 'vencimento', ordenarPor: (a) => a.vencimento || '', opc: true, formatar: (a) => a.vencimento || '—' },
  {
    // 25/09/2026 (Tiago: tabela com rolagem no desktop): sem as colunas Indexador e Instituição - o indexador aparece aqui e a instituição embaixo do título.
    label: 'Contratada', campo: 'rentabilidadeContratada', ordenarPor: (a) => a.rentabilidadeContratada?.texto || a.indexador || '', opc: true,
    ajuda: 'Rentabilidade contratada: taxa combinada no momento da compra do título — o indexador (Selic/IPCA/CDI) mais o percentual/juro adicional contratado.',
    formatar: (a) => {
      const texto = a.rentabilidadeContratada?.texto || a.indexador;
      return texto ? `<span class="chip-tonal chip-good">${esc(texto)}</span>` : '—';
    },
  },
  {
    label: 'Rentab.', campo: 'percentualLucroPrejuizo', ordenarPor: (a) => a.percentualLucroPrejuizo, num: true, opc: true,
    ajuda: 'Rentabilidade: retorno já realizado no título: quanto o valor atual cresceu em relação ao valor aplicado, desde a compra.',
    formatar: (a) => (typeof a.percentualLucroPrejuizo === 'number' ? `<span class="chip-tonal ${a.percentualLucroPrejuizo >= 0 ? 'chip-good' : 'chip-bad'}">${formatPercentFromFraction(a.percentualLucroPrejuizo)}</span>` : '—'),
  },
  {
    label: 'Carteira', campo: 'tipoCarteira', ordenarPor: (a) => a.tipoCarteira || '', opc: true,
    formatar: (a) => (a.tipoCarteira === 'emergencial'
      ? `<span class="chip-tonal chip-good" title="${LABEL_TIPO_CARTEIRA.emergencial}">Emergência</span>`
      : `<span class="chip-tonal chip-info">${LABEL_TIPO_CARTEIRA['longo-prazo']}</span>`),
  },
  { label: '% cart.', campo: 'percentualCarteira', ordenarPor: (a) => a.percentualCarteira, num: true, opc: true, formatar: (a) => formatPercentFromFraction(a.percentualCarteira, 1) },
  {
    label: 'Total', campo: 'totalAtualizado', ordenarPor: (a) => a.totalAtualizado, num: true,
    formatar: (a) => `${formatBRL(a.totalAtualizado)}<span class="cc-sub">de ${formatBRL(a.totalInvestido)}</span>`,
  },
  {
    label: 'IR hoje', campo: 'irLiquido', ordenarPor: (a) => a.irSeResgatasseHoje?.valorLiquidoSeResgatasseHoje, num: true,
    ajuda: 'Imposto de Renda regressivo estimado caso o título fosse resgatado hoje: 22,5% até 180 dias, 20% de 181 a 360 dias, 17,5% de 361 a 720 dias, 15% acima de 720 dias. 05/10/2026: inclui o IOF regressivo dos primeiros 30 dias (96% do rendimento no 1º dia, zerando no 30º), o mesmo critério da meta de reserva em Metas e Objetivos.',
    formatar: (a) => {
      const ir = a.irSeResgatasseHoje;
      if (!ir || typeof ir.valorLiquidoSeResgatasseHoje !== 'number') return '—';
      return `${formatBRL(ir.valorLiquidoSeResgatasseHoje)}<span class="cc-sub">líquido${typeof ir.impostoSeResgatasseHoje === 'number' ? ` · IR${typeof ir.iofSeResgatasseHoje === 'number' && ir.iofSeResgatasseHoje > 0 ? '+IOF' : ''} ${formatBRL(ir.impostoSeResgatasseHoje)}` : ''}</span>`;
    },
  },
];

/** Linha de totais no rodapé - soma da lista EXIBIDA (acompanha filtro de carteira + busca). IR hoje soma o líquido/imposto de quem tiver o dado. */
function montarLinhaTotalAtivos_(ativosExibidos) {
  const somaAtualizado = ativosExibidos.reduce((s, a) => s + (a.totalAtualizado || 0), 0);
  const somaInvestido = ativosExibidos.reduce((s, a) => s + (a.totalInvestido || 0), 0);
  const somaIrLiquido = ativosExibidos.reduce((s, a) => s + (a.irSeResgatasseHoje?.valorLiquidoSeResgatasseHoje || 0), 0);
  const somaIrImposto = ativosExibidos.reduce((s, a) => s + (a.irSeResgatasseHoje?.impostoSeResgatasseHoje || 0), 0);
  return linhaTotalHtml(COLUNAS_ATIVOS_RENDA_FIXA, `Total (${contagemTexto(ativosExibidos.length, 'posição', 'posições')})`, {
    totalAtualizado: `${formatBRL(somaAtualizado)}<span class="cc-sub">de ${formatBRL(somaInvestido)}</span>`,
    irLiquido: somaIrLiquido ? `${formatBRL(somaIrLiquido)}<span class="cc-sub">líquido · IR ${formatBRL(somaIrImposto)}</span>` : '—',
  });
}

/**
 * Os 6 gráficos (3 Rentabilidade acumulada + 3 Evolução do patrimônio) - 19/09/2026 #7: "na tela de renda fixa são três gráficos por tipo.
 * No desktop, primeira row com o gráfico da carteira atual, e na segunda row longo prazo/renda emergencial lado a lado". Agrupa por tipo:
 * Rentabilidade (total em largura cheia; longo prazo | emergencial embaixo), depois Evolução do mesmo jeito. Um seletor de período manda
 * nos 6. A Evolução de Longo Prazo/Reserva mostra só 1 linha (sem "quanto investi" - `comInvestido:false`), fiel ao mockup.
 */
function paineisRendaFixa_() {
  const base = { corToken: '--rf', analise: true, comparativo: true, labelInfo: 'Valor atual', labelInfoEvolucao: 'Valor atual' };
  return [
    { ...base, visaoId: 'carteiraRendaFixaTotal', titulo: 'Carteira total', largo: true },
    { ...base, visaoId: 'carteiraRendaFixaLongoPrazo', titulo: 'Longo prazo', labelValor: 'Longo prazo', labelPrincipal: 'Longo prazo', comInvestido: false },
    { ...base, visaoId: 'carteiraRendaFixaEmergencial', titulo: 'Reserva de emergência', labelValor: 'Reserva de emergência', labelPrincipal: 'Reserva de emergência', comInvestido: false },
  ];
}

function desenhar(doc, dados, { historicoPendente = false, aoTentarGraficos = null } = {}) {
  const conteudoEl = doc.getElementById('rendaFixaConteudo');
  const estadoSecoes = lerEstadoSecoes(conteudoEl);
  conteudoEl.innerHTML = esqueletoClasseHtml({
    prefixo: 'rendaFixa', links: linksRelevantesHtml(LINKS_RELEVANTES_RENDA_FIXA), tituloDistribuicao: 'Por indexador', tituloLista: 'Posições', contagem: contagemTexto(dados.resumo.quantidadeAtivos, 'posição', 'posições'),
    extrasAposLista: secaoRecolhivelHtml({ nome: 'videos', id: 'rendaFixaVideosSecao', titulo: 'Vídeos', corpoHtml: secaoVideosHtml('rendaFixaVideos') }),
  });
  const $ = (id) => doc.getElementById(id);
  wirePointerTooltipCarteiras_(doc, conteudoEl);

  // 23/09/2026 #3: Valor aplicado do topo = a MESMA soma do fim da linha "Valor aplicado" do gráfico e do card da Visão geral
  const aplicadoHistorico = somaCampoHistorico_(dados.historico, 'fluxoAplicadoRendaFixaTotal');
  const resumoTopo = aplicadoHistorico != null
    ? { ...dados.resumo, totalInvestido: aplicadoHistorico, lucroPrejuizo: dados.resumo.totalAtualizado - aplicadoHistorico }
    : dados.resumo;
  renderResumoClasseCarteiras(doc, $('rendaFixaResumo'), resumoTopo, { corToken: '--rf', rotuloAtivos: 'Posições', dono: conteudoEl });
  renderBenchmarksClasseCarteiras(doc, $('rendaFixaBenchmarks'), [
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.cdi) },
    { label: 'Selic (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.selic) },
    { label: 'IPCA (12m)', valor: formatPercentFromFraction(dados.benchmarks?.ipca) },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, $('rendaFixaDistribuicao'), dados.distribuicaoPorIndexador, { dono: conteudoEl });

  const graficos = criarGraficosCarteira(doc, $('rendaFixaGraficos'), {
    historico: dados.historico || null, chavePeriodo: 'carteiras.rendaFixa', agruparPor: 'tipo', aoTentar: aoTentarGraficos, paineis: paineisRendaFixa_(),
  });
  if (!(dados.historico && dados.historico.length) && !historicoPendente) graficos.erro('Não deu pra carregar os gráficos agora. O resto da página continua normal.');

  // Percentual de lucro/prejuízo por posição (19/09/2026 #7) - calculado aqui a partir dos mesmos 2 números que a API manda
  const totalCarteira = dados.resumo.totalAtualizado || 0;
  const ativosBase = (dados.ativos || []).map((a) => {
    const lucroPrejuizo = (a.totalAtualizado || 0) - (a.totalInvestido || 0);
    return {
      ...a,
      lucroPrejuizo,
      percentualLucroPrejuizo: a.totalInvestido ? lucroPrejuizo / a.totalInvestido : 0,
      percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0,
      // `.grupo` reaproveita o mecanismo de chips do filtro (aqui o "grupo" é o tipo de carteira, não o indexador do anel)
      grupo: LABEL_TIPO_CARTEIRA[a.tipoCarteira] || LABEL_TIPO_CARTEIRA['longo-prazo'],
      // filtrarAtivosPorBusca procura em `ticker`/`nome`; Renda Fixa usa `codigo`/`nomePersonalizado`
      ticker: a.codigo,
      nome: a.nomePersonalizado,
    };
  });
  // Chips "Todos/Longo Prazo/Reserva de Emergência" - fixo (só 2 valores). Os 6 gráficos acima ficam fora do filtro de propósito.
  const grupos = [LABEL_TIPO_CARTEIRA['longo-prazo'], LABEL_TIPO_CARTEIRA.emergencial];
  montarTabelaFiltravel(doc, {
    filtrosEl: $('rendaFixaFiltros'), tabelaEl: $('rendaFixaTabela'), ativos: ativosBase, colunas: COLUNAS_ATIVOS_RENDA_FIXA, linhaTotal: montarLinhaTotalAtivos_, grupos,
    tituloFolha: (a) => a.nomePersonalizado || a.tipoInvestimento || a.codigo || 'Posição', acaoFolha: (a) => ({ href: urlAtivo(refAtivo({ ...a, classe: 'rf' })), rotulo: 'Abrir a página do título' }),
  });
  aplicarEstadoSecoes(doc, conteudoEl, estadoSecoes);
}

export async function montarPaginaCarteirasRendaFixa(token, { doc = document, getCarteirasRendaFixaImpl = getCarteirasRendaFixa, getHomeImpl = getHome, getVideosImpl = undefined } = {}) {
  const preencherVideos = criarCarregadorVideos(token, { carteira: 'rendaFixa' }, getVideosImpl ? { getVideosImpl } : {});
  return montarPaginaClasseCarteiras(token, {
    doc, prefixo: 'rendaFixa', tela: 'Carteira de Renda Fixa', chaveCache: CHAVE_CACHE_RENDA_FIXA, buscarCarteira: getCarteirasRendaFixaImpl, getHomeImpl, desenhar,
    depoisDeDesenhar: () => preencherVideos(doc.getElementById('rendaFixaVideos')),
  });
}

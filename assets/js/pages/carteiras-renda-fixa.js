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
import { formatBRL, formatPercentFromFraction } from '../format.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../carteiras-cache.js';
import {
  somaCampoHistorico_,
  renderResumoClasseCarteiras,
  renderBenchmarksClasseCarteiras,
  renderDistribuicaoGrupoCarteiras,
  renderTabelaAtivosCarteiras,
  renderFiltrosTabelaCarteiras,
  filtrarAtivosPorBusca,
  wirePointerTooltipCarteiras_,
  wireGraficosClasseCarteiras,
} from './carteiras-classe-comum.js';

const CHAVE_CACHE_RENDA_FIXA = 'carteiras_renda_fixa_v1';

// 19/09/2026 #7 (catchup pedido pelo Tiago, junto com os gráficos: "e
// apos os graficos, lembre-se de atualizar o que falta na tela de renda
// fixa - tabela desatualizada, filtros por tipo, etc") - rótulo EXATO dos
// 2 valores de tipoCarteira que o back-end manda (CarteirasRendaFixa.gs:
// "emergencial"/"longo-prazo") pros chips de filtro E pra tag da coluna
// Carteira, num lugar só (nunca 2 strings podendo divergir).
const LABEL_TIPO_CARTEIRA = { emergencial: 'Reserva de Emergência', 'longo-prazo': 'Longo Prazo' };

/**
 * Colunas da tabela de Renda Fixa - reescrita fiel ao mockup
 * (RendaFixa.dc.html): Título/Indexador/Vencimento/Rentab.
 * contratada/Rentabilidade/Instituição/Carteira/% cart./Total/IR hoje
 * (era só 6 colunas antes, sem % cart./Instituição/Carteira/ordenação/
 * tags). `campo`+`ordenarPor` em TODAS as colunas ordenáveis (mesmo
 * padrão das outras 3 subpáginas - clique no cabeçalho ordena, ver
 * renderTabelaAtivosCarteiras).
 *
 * "Tags verdinhas em Rentabilidade e Indexador contratado" (pedido
 * verbal do Tiago) - vira status-pill verde nos valores de "Rentab.
 * contratada" (o texto tipo "SELIC + 0,00%") e "Rentabilidade" (o
 * retorno já realizado, calculado aqui - ver comHistoricoRendaFixa_
 * abaixo) - diferente do mockup (que mostra Indexador como tag âmbar e
 * Rentabilidade/Rentab. contratada como TEXTO colorido, sem pill) -
 * seguindo o pedido mais recente e explícito do Tiago por cima do
 * mockup estático (mesmo precedente já usado nesta rodada pro filtro de
 * período/tooltip, que também não estavam no mockup). Sinalizado no
 * relatório final pro Tiago conferir se bateu com o que ele imaginou.
 * A coluna "Indexador" em si mantém uma tag neutra (âmbar/--rf, fiel ao
 * mockup) - só as 2 colunas que o Tiago nomeou viraram verdes.
 */
const COLUNAS_ATIVOS_RENDA_FIXA = [
  {
    label: 'Título', campo: 'titulo', alinharEsquerda: true,
    ordenarPor: (a) => a.nomePersonalizado || a.tipoInvestimento || a.codigo || '',
    formatar: (a) => {
      const nome = a.nomePersonalizado || a.tipoInvestimento || a.codigo || '—';
      return `<div><b>${nome}</b>${a.instituicao ? `<span class="cc-ativo-nome">${a.instituicao}</span>` : ''}</div>`;
    },
  },
  {
    label: 'Indexador', campo: 'indexador', ordenarPor: (a) => a.indexador || '',
    formatar: (a) => (a.indexador ? `<span class="status-pill" style="background:var(--rf-soft);color:var(--rf)">${a.indexador}</span>` : '—'),
  },
  { label: 'Vencimento', campo: 'vencimento', ordenarPor: (a) => a.vencimento || '', formatar: (a) => a.vencimento || '—' },
  {
    label: 'Rentab. contratada', campo: 'rentabilidadeContratada', ordenarPor: (a) => a.rentabilidadeContratada?.texto || '',
    ajuda: 'Taxa combinada no momento da compra do título — o indexador (Selic/IPCA) mais o percentual/juro adicional contratado.',
    formatar: (a) => (a.rentabilidadeContratada?.texto ? `<span class="status-pill good">${a.rentabilidadeContratada.texto}</span>` : '—'),
  },
  {
    label: 'Rentabilidade', campo: 'percentualLucroPrejuizo', ordenarPor: (a) => a.percentualLucroPrejuizo,
    ajuda: 'Retorno já realizado no título: quanto o valor atual cresceu em relação ao valor aplicado, desde a compra.',
    formatar: (a) => (typeof a.percentualLucroPrejuizo === 'number' ? `<span class="status-pill good">${formatPercentFromFraction(a.percentualLucroPrejuizo)}</span>` : '—'),
  },
  { label: 'Instituição', campo: 'instituicao', ordenarPor: (a) => a.instituicao || '', formatar: (a) => a.instituicao || '—' },
  {
    label: 'Carteira', campo: 'tipoCarteira', ordenarPor: (a) => a.tipoCarteira || '',
    formatar: (a) => (a.tipoCarteira === 'emergencial'
      ? `<span class="status-pill good">${LABEL_TIPO_CARTEIRA.emergencial}</span>`
      : `<span class="status-pill" style="background:var(--acoes-soft);color:var(--acoes)">${LABEL_TIPO_CARTEIRA['longo-prazo']}</span>`),
  },
  { label: '% cart.', campo: 'percentualCarteira', ordenarPor: (a) => a.percentualCarteira, formatar: (a) => formatPercentFromFraction(a.percentualCarteira, 1) },
  {
    label: 'Total', campo: 'totalAtualizado', ordenarPor: (a) => a.totalAtualizado,
    formatar: (a) => `${formatBRL(a.totalAtualizado)}<span class="cc-sub">de ${formatBRL(a.totalInvestido)}</span>`,
  },
  {
    label: 'IR hoje', campo: 'irLiquido', ordenarPor: (a) => a.irSeResgatasseHoje?.valorLiquidoSeResgatasseHoje,
    ajuda: 'Imposto de Renda regressivo estimado caso o título fosse resgatado hoje: 22,5% até 180 dias, 20% de 181 a 360 dias, 17,5% de 361 a 720 dias, 15% acima de 720 dias.',
    formatar: (a) => {
      const ir = a.irSeResgatasseHoje;
      if (!ir || typeof ir.valorLiquidoSeResgatasseHoje !== 'number') return '—';
      return `${formatBRL(ir.valorLiquidoSeResgatasseHoje)}<span class="cc-sub">líquido${typeof ir.impostoSeResgatasseHoje === 'number' ? ` · IR ${formatBRL(ir.impostoSeResgatasseHoje)}` : ''}</span>`;
    },
  },
];

/** Linha de totais no rodapé - mesmo padrão das outras 3 subpáginas
 * (soma da lista efetivamente exibida, acompanha filtro de carteira +
 * busca). IR hoje soma o valor líquido/imposto de quem tiver o dado (nem
 * todo ativo de Renda Fixa tem IR calculado - ex. isentos). */
function montarLinhaTotalAtivos_(ativosExibidos) {
  const somaAtualizado = ativosExibidos.reduce((s, a) => s + (a.totalAtualizado || 0), 0);
  const somaInvestido = ativosExibidos.reduce((s, a) => s + (a.totalInvestido || 0), 0);
  const somaIrLiquido = ativosExibidos.reduce((s, a) => s + (a.irSeResgatasseHoje?.valorLiquidoSeResgatasseHoje || 0), 0);
  const somaIrImposto = ativosExibidos.reduce((s, a) => s + (a.irSeResgatasseHoje?.impostoSeResgatasseHoje || 0), 0);
  const qtd = ativosExibidos.length;
  return `<tr>
    <td colspan="${COLUNAS_ATIVOS_RENDA_FIXA.length - 2}">Total (${qtd} ${qtd === 1 ? 'posição' : 'posições'})</td>
    <td data-label="Total">${formatBRL(somaAtualizado)}<span class="cc-sub">de ${formatBRL(somaInvestido)}</span></td>
    <td data-label="IR hoje">${somaIrLiquido ? `${formatBRL(somaIrLiquido)}<span class="cc-sub">líquido · IR ${formatBRL(somaIrImposto)}</span>` : '—'}</td>
  </tr>`;
}

/**
 * Bloco dos 6 gráficos (3 Rentabilidade acumulada + 3 Evolução do
 * patrimônio) - 19/09/2026 #7, pedido explícito do Tiago: "na tela de
 * renda fixa sao tres graficos por tipo (tres de rentabilidade, tres de
 * evolucao). No desktop, primeira row com o grafico da carteira atual
 * renda fixa, e na seugnda row, grafico de longo pazo/renda emergencial
 * lado a lado" - dentro de CADA seção (Rentabilidade/Evolução), row 1 é
 * "Carteira total" (largura cheia, mesmo `.cg-chart-card` das outras 3
 * subpáginas) e row 2 é Longo Prazo + Reserva de Emergência lado a lado
 * (`.cc-charts-par`, nova classe em carteiras.css - grid 2 colunas no
 * desktop, empilha em 1 coluna no celular, mesmo breakpoint de
 * .cg-hero-grid). O filtro de período (acima da 1ª seção, afeta as 2)
 * segue o mesmo padrão "igual a home" das outras 3 subpáginas - ver
 * wireGraficosClasseCarteiras em carteiras-classe-comum.js.
 *
 * A Evolução de Longo Prazo/Reserva de Emergência mostra só 1 linha
 * (sem "quanto investi" comparado - `comInvestido:false`, ver
 * renderEvolucaoClasseCarteiras) - fiel ao mockup, que não traz essa
 * comparação pras 2 sub-contas, só pra Carteira total.
 */
function montarBlocoGraficosHtml_() {
  return `
    <div class="area-header" style="margin-top:22px"><h2>Rentabilidade acumulada</h2></div>
    <div class="filter-tabs" id="rendaFixaPeriodoTabs" style="margin-bottom:12px">
      <button class="filter-tab" type="button" data-periodo="mes">Mês atual</button>
      <button class="filter-tab" type="button" data-periodo="30d">30 dias</button>
      <button class="filter-tab" type="button" data-periodo="6m">6 meses</button>
      <button class="filter-tab active" type="button" data-periodo="12m">12 meses</button>
      <button class="filter-tab" type="button" data-periodo="3a">3 anos</button>
      <button class="filter-tab" type="button" data-periodo="tudo">Desde o início</button>
    </div>
    <div class="cg-chart-card">
      <div class="cc-chart-titulo">Carteira total</div>
      <div class="rentab-card-info" id="rfRentabTotalInfo"></div>
      <div id="rfRentabTotalChart"></div>
      <div class="chart-legend2" id="rfRentabTotalLegenda"></div>
    </div>
    <div class="cc-charts-par">
      <div class="cg-chart-card">
        <div class="cc-chart-titulo">Longo prazo</div>
        <div class="rentab-card-info" id="rfRentabLongoInfo"></div>
      <div id="rfRentabLongoChart"></div>
        <div class="chart-legend2" id="rfRentabLongoLegenda"></div>
      </div>
      <div class="cg-chart-card">
        <div class="cc-chart-titulo">Reserva de emergência</div>
        <div class="rentab-card-info" id="rfRentabEmergInfo"></div>
      <div id="rfRentabEmergChart"></div>
        <div class="chart-legend2" id="rfRentabEmergLegenda"></div>
      </div>
    </div>

    <div class="area-header" style="margin-top:22px"><h2>Evolução do patrimônio</h2></div>
    <div class="cg-chart-card">
      <div class="cc-chart-titulo">Carteira total</div>
      <div class="rentab-card-info" id="rfEvolucaoTotalInfo"></div>
      <div id="rfEvolucaoTotalChart"></div>
      <div class="chart-legend2" id="rfEvolucaoTotalLegenda"></div>
    </div>
    <div class="cc-charts-par">
      <div class="cg-chart-card">
        <div class="cc-chart-titulo">Longo prazo</div>
        <div class="rentab-card-info" id="rfEvolucaoLongoInfo"></div>
      <div id="rfEvolucaoLongoChart"></div>
        <div class="chart-legend2" id="rfEvolucaoLongoLegenda"></div>
      </div>
      <div class="cg-chart-card">
        <div class="cc-chart-titulo">Reserva de emergência</div>
        <div class="rentab-card-info" id="rfEvolucaoEmergInfo"></div>
      <div id="rfEvolucaoEmergChart"></div>
        <div class="chart-legend2" id="rfEvolucaoEmergLegenda"></div>
      </div>
    </div>
  `;
}

function desenhar(doc, dados) {
  const conteudoEl = doc.getElementById('rendaFixaConteudo');
  conteudoEl.innerHTML = `
    <div class="area-header"><h2>Renda Fixa</h2><span class="hint">longo prazo + reserva de emergência</span></div>
    <div id="rendaFixaResumo"></div>
    <div id="rendaFixaBenchmarks" class="cc-benchmarks"></div>
    ${montarBlocoGraficosHtml_()}
    <div class="cc-layout-donut-tabela">
      <div class="cc-donut-card">
        <div class="area-header" style="margin-top:0"><h2>Por indexador</h2></div>
        <div id="rendaFixaDistribuicao"></div>
      </div>
      <div class="cc-tabela-card">
        <div class="area-header" style="margin-top:0"><h2>Posições</h2><span class="hint">${dados.resumo.quantidadeAtivos} ${dados.resumo.quantidadeAtivos === 1 ? 'posição' : 'posições'}</span></div>
        <div id="rendaFixaFiltros"></div>
        <div id="rendaFixaTabela"></div>
      </div>
    </div>
  `;

  // Tooltips "i" (cabeçalho, legenda do donut) - ligado 1x no container
  // estável, mesmo padrão das outras 3 subpáginas (19/09/2026 #4, ver
  // wirePointerTooltipCarteiras_ em carteiras-classe-comum.js) - faltava
  // aqui (a tela de Renda Fixa nunca tinha ligado isso).
  wirePointerTooltipCarteiras_(doc, conteudoEl);

  // 23/09/2026 #3: Valor aplicado do topo = a MESMA soma do fim da linha
  // "Valor aplicado" do gráfico e do card da Visão geral (fluxos diários do
  // histórico, já em centavos). O back-end soma o PEPS sem arredondar e
  // saía 1 centavo diferente do gráfico e do card.
  const aplicadoHistorico = somaCampoHistorico_(dados.historico, 'fluxoAplicadoRendaFixaTotal');
  const resumoTopo = aplicadoHistorico != null
    ? { ...dados.resumo, totalInvestido: aplicadoHistorico, lucroPrejuizo: dados.resumo.totalAtualizado - aplicadoHistorico }
    : dados.resumo;
  renderResumoClasseCarteiras(doc, doc.getElementById('rendaFixaResumo'), resumoTopo, { corToken: '--rf' });
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('rendaFixaBenchmarks'), [
    { label: 'CDI (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.cdi) },
    { label: 'Selic (a.a.)', valor: formatPercentFromFraction(dados.benchmarks?.selic) },
    { label: 'IPCA (12m)', valor: formatPercentFromFraction(dados.benchmarks?.ipca) },
  ]);
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('rendaFixaDistribuicao'), dados.distribuicaoPorIndexador);

  if (dados.historico && dados.historico.length) {
    wireGraficosClasseCarteiras(doc, {
      historico: dados.historico,
      periodoTabsContainer: doc.getElementById('rendaFixaPeriodoTabs'),
      paineis: [
        {
          visaoId: 'carteiraRendaFixaTotal',
          rentabInfoContainer: doc.getElementById('rfRentabTotalInfo'),
          evolucaoInfoContainer: doc.getElementById('rfEvolucaoTotalInfo'),
          labelInfo: 'Valor atual',
          labelInfoEvolucao: 'Valor atual',
          rentabChartContainer: doc.getElementById('rfRentabTotalChart'),
          rentabLegendaContainer: doc.getElementById('rfRentabTotalLegenda'),
          evolucaoChartContainer: doc.getElementById('rfEvolucaoTotalChart'),
          evolucaoLegendaContainer: doc.getElementById('rfEvolucaoTotalLegenda'),
          corToken: '--rf',
        },
        {
          visaoId: 'carteiraRendaFixaLongoPrazo',
          rentabInfoContainer: doc.getElementById('rfRentabLongoInfo'),
          evolucaoInfoContainer: doc.getElementById('rfEvolucaoLongoInfo'),
          labelInfo: 'Valor atual',
          labelInfoEvolucao: 'Valor atual',
          rentabChartContainer: doc.getElementById('rfRentabLongoChart'),
          rentabLegendaContainer: doc.getElementById('rfRentabLongoLegenda'),
          evolucaoChartContainer: doc.getElementById('rfEvolucaoLongoChart'),
          evolucaoLegendaContainer: doc.getElementById('rfEvolucaoLongoLegenda'),
          corToken: '--rf',
          labelValor: 'Longo prazo',
          comInvestido: false,
        },
        {
          visaoId: 'carteiraRendaFixaEmergencial',
          rentabInfoContainer: doc.getElementById('rfRentabEmergInfo'),
          evolucaoInfoContainer: doc.getElementById('rfEvolucaoEmergInfo'),
          labelInfo: 'Valor atual',
          labelInfoEvolucao: 'Valor atual',
          rentabChartContainer: doc.getElementById('rfRentabEmergChart'),
          rentabLegendaContainer: doc.getElementById('rfRentabEmergLegenda'),
          evolucaoChartContainer: doc.getElementById('rfEvolucaoEmergChart'),
          evolucaoLegendaContainer: doc.getElementById('rfEvolucaoEmergLegenda'),
          corToken: '--rf',
          labelValor: 'Reserva de emergência',
          comInvestido: false,
        },
      ],
    });
  } else {
    const semHistoricoHtml = '<p class="hint">Não deu pra carregar os gráficos agora - o resto da página continua normal.</p>';
    ['rfRentabTotalChart', 'rfRentabLongoChart', 'rfRentabEmergChart', 'rfEvolucaoTotalChart', 'rfEvolucaoLongoChart', 'rfEvolucaoEmergChart']
      .forEach((id) => { doc.getElementById(id).innerHTML = semHistoricoHtml; });
  }

  // Percentual de lucro/prejuízo por posição (19/09/2026 #7) - o
  // back-end só manda totalInvestido/totalAtualizado por ativo (ver
  // CarteirasRendaFixa.gs, diferente das 3 classes de renda variável que
  // já mandam percentualLucroPrejuizo pronto) - calculado aqui, mesmo
  // padrão de percentualCarteira logo abaixo (client-side, sempre a
  // partir dos mesmos 2 números que já vêm da API, nunca um 3º cálculo
  // divergente).
  const totalCarteira = dados.resumo.totalAtualizado || 0;
  const ativosBase = (dados.ativos || []).map((a) => {
    const lucroPrejuizo = (a.totalAtualizado || 0) - (a.totalInvestido || 0);
    return {
      ...a,
      lucroPrejuizo,
      percentualLucroPrejuizo: a.totalInvestido ? lucroPrejuizo / a.totalInvestido : 0,
      percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0,
      // `.grupo` reaproveita o MESMO mecanismo de chips de
      // renderFiltrosTabelaCarteiras que FIIs já usa (filtra por
      // `a.grupo === filtroGrupo`) - aqui o "grupo" é o tipo de
      // carteira (Longo Prazo/Reserva de Emergência), não o indexador
      // (que já tem seus próprios chips no donut "Por indexador" - 2
      // filtros diferentes, nomes de campo diferentes de propósito).
      grupo: LABEL_TIPO_CARTEIRA[a.tipoCarteira] || LABEL_TIPO_CARTEIRA['longo-prazo'],
      // filtrarAtivosPorBusca (carteiras-classe-comum.js) procura em
      // `a.ticker`/`a.nome` - nomes genéricos usados por Ações/FIIs/Ações
      // EUA. Renda Fixa usa `codigo`/`nomePersonalizado` (não tem
      // "ticker" de verdade), então mapeamos aqui pra reaproveitar a
      // função compartilhada sem alterá-la (mesma lógica do `.grupo`
      // acima) - bug pego rodando a suíte de testes: buscar "TES002" não
      // filtrava nada antes disso.
      ticker: a.codigo,
      nome: a.nomePersonalizado,
    };
  });

  // Chips "Todos/Longo Prazo/Reserva de Emergência" (19/09/2026 #7,
  // pedido do Tiago desde o início: "filtro de Renda Emergencial e Longo
  // Prazo, igual FIIs") - fixo (só 2 valores possíveis, ao contrário do
  // segmento de FIIs que vem dinâmico da planilha) - "O filtro por tipo
  // de carteira também recalcula os totais no rodapé da tabela" (dica do
  // próprio mockup) já acontece de graça, porque montarLinhaTotalAtivos_
  // soma sempre a lista `exibidos` (já filtrada), nunca dados.resumo
  // direto - mesmo padrão das outras 3 subpáginas. Os 6 GRÁFICOS acima
  // ficam de fora do filtro de propósito (layout fixo em 2 linhas, ver
  // comentário grande de montarBlocoGraficosHtml_ - já mostram Longo
  // Prazo/Emergência separados o tempo todo, um filtro por cima seria
  // redundante).
  const grupos = [LABEL_TIPO_CARTEIRA['longo-prazo'], LABEL_TIPO_CARTEIRA.emergencial];

  let ordenacao = null;
  let busca = '';
  let filtroGrupo = null;

  function renderizarTabela() {
    let exibidos = filtroGrupo ? ativosBase.filter((a) => a.grupo === filtroGrupo) : ativosBase;
    exibidos = filtrarAtivosPorBusca(exibidos, busca);
    renderTabelaAtivosCarteiras(doc, doc.getElementById('rendaFixaTabela'), exibidos, COLUNAS_ATIVOS_RENDA_FIXA, {
      linhaTotalHtml: exibidos.length ? montarLinhaTotalAtivos_(exibidos) : '',
      ordenacao,
      onOrdenar: (campo) => {
        ordenacao = ordenacao && ordenacao.campo === campo
          ? { campo, direcao: ordenacao.direcao === 'asc' ? 'desc' : 'asc' }
          : { campo, direcao: 'asc' };
        renderizarTabela();
      },
    });
  }

  renderFiltrosTabelaCarteiras(doc, doc.getElementById('rendaFixaFiltros'), {
    busca,
    onBuscar: (valor) => { busca = valor; renderizarTabela(); },
    grupos,
    filtroGrupo,
    onFiltrarGrupo: (grupo) => { filtroGrupo = grupo; renderizarTabela(); },
  });
  renderizarTabela();
}

export async function montarPaginaCarteirasRendaFixa(token, { doc = document, getCarteirasRendaFixaImpl = getCarteirasRendaFixa, getHomeImpl = getHome } = {}) {
  const loadingEl = doc.getElementById('rendaFixaLoading');
  const erroEl = doc.getElementById('rendaFixaErro');
  const conteudoEl = doc.getElementById('rendaFixaConteudo');
  const refreshControlEl = doc.getElementById('refreshControlRendaFixa');

  const cache = lerCacheCarteiras(CHAVE_CACHE_RENDA_FIXA);
  if (cache) {
    desenhar(doc, cache);
    loadingEl.hidden = true;
    conteudoEl.hidden = false;
  }

  async function carregarERedesenhar() {
    const [resposta, respostaHome] = await Promise.all([getCarteirasRendaFixaImpl(token), getHomeImpl(token)]);
    loadingEl.hidden = true;

    if (!resposta.ok) {
      erroEl.hidden = false;
      erroEl.textContent = `Não deu pra carregar Renda Fixa agora (${resposta.etapa || '?'}): ${resposta.erro || 'erro desconhecido'}.`;
      return;
    }

    erroEl.hidden = true;
    conteudoEl.hidden = false;
    const dados = { ...resposta.carteira, historico: respostaHome.ok ? respostaHome.historico : null };
    desenhar(doc, dados);
    gravarCacheCarteiras(CHAVE_CACHE_RENDA_FIXA, dados);
  }

  await carregarERedesenhar();
  mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).marcarAtualizado();
}

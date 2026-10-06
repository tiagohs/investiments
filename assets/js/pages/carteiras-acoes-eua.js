/**
 * carteiras-acoes-eua.js — subpágina Carteiras > Ações Internacionais
 * (action=carteirasAcoesEua, ver
 * apps-script/CarteirasClasses.gs!montarCarteirasAcoesEua_). Resumo e
 * ativos vêm nativamente em US$ (comentário no .gs) — página inteira
 * formata em dólar, com o equivalente em R$ do lado (formatComConversao,
 * câmbio de hoje vindo de dados.benchmarks.dolar) nos valores grandes
 * (Total/Lucro), e um botão "i" com o equivalente nos valores menores
 * (Pr. médio/teto) — mesma distinção do mockup (19/09/2026 #3, pedido
 * do Tiago: "lembre-se dos valores em dólar e reais na tabela EUA").
 */

import { getCarteirasAcoesEua, getHome } from '../api-client.js';
import { secaoVideosHtml, criarCarregadorVideos } from '../videos.js'; // 25/09/2026: vídeos do YouTube da carteira
import { formatBRL, formatUSD, formatComConversao, formatPercentFromFraction, formatNumeroBR, formatPercentFromPoints } from '../format.js';
import { urlAtivoTicker } from '../link-ativo.js'; // 25/09/2026: ticker -> tela do ativo
import { statProventosHero, secaoProventosCarteiraHtml, renderProventosCarteira, definirFonteProventos } from './carteiras-proventos.js';
import { criarGraficosCarteira } from './carteiras-graficos.js';
import { somaCampoHistorico_, renderResumoClasseCarteiras, renderBenchmarksClasseCarteiras, renderDistribuicaoGrupoCarteiras, montarTabelaFiltravel, wirePointerTooltipCarteiras_, celulaAtivoRendaVariavelHtml, equivalenteBrlHtml_, seloViesHtml, variacaoHtml, linhaTotalHtml, contarVies_, esqueletoClasseHtml, linksRelevantesHtml, contagemTexto, lerEstadoSecoes, aplicarEstadoSecoes, secaoRecolhivelHtml, montarPaginaClasseCarteiras } from './carteiras-classe-comum.js';
import { statusVies } from './carteiras-pecas.js';
import { comCamposUsdAcoesEua, historicoTemCambioUsd } from './inicio-calc.js';

// 24/09/2026 (Tiago: "em Ações EUA, me dê a opção de ver em reais ou em
// dólar"): botão R$ | US$ no topo da página - troca o resumo em destaque e
// os 2 gráficos (valor em cima, eixo, tooltip e a própria curva, que em
// dólar não sente o câmbio). A tabela e o "Por setor" já mostram as 2
// moedas (US$ com o equivalente em R$). Padrão US$ (a moeda do papel,
// como o resto da página); a escolha fica guardada neste navegador.
const CHAVE_MOEDA_ACOES_EUA = 'carteiras.acoesEua.moeda';
let moedaAcoesEua_ = null;
function lerMoedaGuardada_() {
  try {
    const v = globalThis.localStorage && globalThis.localStorage.getItem(CHAVE_MOEDA_ACOES_EUA);
    return v === 'BRL' || v === 'USD' ? v : null;
  } catch (_) { return null; }
}
function guardarMoeda_(moeda) {
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(CHAVE_MOEDA_ACOES_EUA, moeda); } catch (_) { /* navegador sem storage: só não lembra */ }
}
/** Moeda em uso na página ('USD' padrão). Exportada pros testes. */
export function moedaAtualAcoesEua() {
  if (!moedaAcoesEua_) moedaAcoesEua_ = lerMoedaGuardada_() || 'USD';
  return moedaAcoesEua_;
}

const CHAVE_CACHE_ACOES_EUA = 'carteiras_acoes_eua_v2';

// 25/09/2026 (Tiago, ponto 3): link da carteira recomendada da Suno pra esta subpágina.
const LINKS_RELEVANTES_ACOES_EUA = [{ rotulo: 'Carteira recomendada: Internacional', href: 'https://investidor.suno.com.br/carteiras/internacional' }];

function montarColunas_(cambio) {
  return [
    { label: 'Ativo', campo: 'ticker', ordenarPor: (a) => a.ticker, topo: true, formatar: celulaAtivoRendaVariavelHtml },
    {
      // 19/09/2026 #6: "i" com a conversão em reais na coluna Preço / dia (mesmo padrão de Pr. médio/teto)
      label: 'Preço / dia', campo: 'precoAtual', ordenarPor: (a) => a.precoAtual, num: true, opc: true,
      formatar: (a) => `${formatUSD(a.precoAtual)}${equivalenteBrlHtml_(a.precoAtual, cambio)}${typeof a.variacaoDia === 'number' ? `<span class="cc-sub">${variacaoHtml(a.variacaoDia)}</span>` : ''}`,
    },
    { label: 'Qtd', campo: 'quantidade', ordenarPor: (a) => a.quantidade, num: true, opc: true, formatar: (a) => formatNumeroBR(a.quantidade, 0) },
    {
      label: 'Pr. médio', campo: 'precoMedio', ordenarPor: (a) => a.precoMedio, num: true, opc: true,
      formatar: (a) => `${formatUSD(a.precoMedio)}${equivalenteBrlHtml_(a.precoMedio, cambio)}`,
    },
    {
      label: 'Status', campo: 'vies', ordenarPor: (a) => statusVies(a.vies).texto, opc: true,
      ajuda: 'Compara o preço atual com o preço-teto definido por você: abaixo do teto = Comprar, acima = Aguardar.',
      formatar: (a) => `${seloViesHtml(a.vies) || '—'}${typeof a.precoTeto === 'number' ? `<span class="cc-sub">teto ${formatUSD(a.precoTeto)}${equivalenteBrlHtml_(a.precoTeto, cambio)}</span>` : ''}`,
    },
    {
      label: 'DY', campo: 'dyPercentual', ordenarPor: (a) => a.dyPercentual, num: true, opc: true,
      ajuda: 'Dividend Yield: proventos pagos nos últimos 12 meses dividido pelo preço atual da ação.',
      formatar: (a) => `${formatUSD(a.dyValor)}${typeof a.dyPercentual === 'number' ? `<span class="cc-sub">${formatPercentFromFraction(a.dyPercentual)}</span>` : ''}`,
    },
    {
      label: 'P/VP', campo: 'pvp', ordenarPor: (a) => a.pvp, num: true, opc: true,
      ajuda: 'Preço/Valor Patrimonial: preço da ação dividido pelo valor patrimonial por ação.',
      formatar: (a) => (typeof a.pvp === 'number' ? formatNumeroBR(a.pvp, 2) : '—'),
    },
    { label: '% cart.', campo: 'percentualCarteira', ordenarPor: (a) => a.percentualCarteira, num: true, opc: true, formatar: (a) => formatPercentFromFraction(a.percentualCarteira, 1) },
    {
      label: 'Total', campo: 'totalAtualizado', ordenarPor: (a) => a.totalAtualizado, num: true,
      formatar: (a) => {
        const principal = formatComConversao(a.totalAtualizado, typeof cambio === 'number' ? a.totalAtualizado * cambio : null, formatUSD);
        const investidoBrl = custoBrlLinha_(a, cambio);
        return `${principal}<span class="cc-sub">de ${formatComConversao(a.totalComprado, investidoBrl, formatUSD)}</span>`;
      },
    },
    {
      label: 'Lucro / Prejuízo', campo: 'lucroPrejuizo', ordenarPor: (a) => a.lucroPrejuizo, num: true,
      formatar: (a) => {
        const brl = lucroBrlLinha_(a, cambio);
        return `<span class="${a.lucroPrejuizo >= 0 ? 'num-bom' : 'num-ruim'}">${formatComConversao(a.lucroPrejuizo, brl, formatUSD)}</span><span class="cc-sub">${variacaoHtml(a.percentualLucroPrejuizo)}</span>`;
      },
    },
  ];
}

/**
 * 05/10/2026 (A-22): custo em R$ de uma linha = o do back-end (cada compra no câmbio do dia dela,
 * CarteirasHome.gs!custoBrlAcoesEuaPorTicker_) - não muda quando o dólar de hoje muda. Sem ele
 * (ticker sem câmbio de compra / resposta antiga), cai no custo em US$ x câmbio de hoje.
 */
export function custoBrlLinha_(a, cambio) {
  if (typeof a.totalCompradoBrl === 'number') return a.totalCompradoBrl;
  return typeof cambio === 'number' ? a.totalComprado * cambio : null;
}

/** Lucro em R$ da linha: valor de hoje em reais - custo em reais (já com a variação do dólar desde a compra). */
export function lucroBrlLinha_(a, cambio) {
  if (typeof a.totalCompradoBrl === 'number' && typeof cambio === 'number') return a.totalAtualizado * cambio - a.totalCompradoBrl;
  return typeof cambio === 'number' ? a.lucroPrejuizo * cambio : null;
}

/** Linha de totais no rodapé - somada da lista EXIBIDA (acompanha a busca; 19/09/2026 #3). Em R$, o custo de cada linha vem com o câmbio da compra (A-22). */
function montarLinhaTotalAtivos_(ativosExibidos, colunas, cambio) {
  const somaAtualizado = ativosExibidos.reduce((s, a) => s + (a.totalAtualizado || 0), 0);
  const somaComprado = ativosExibidos.reduce((s, a) => s + (a.totalComprado || 0), 0);
  const somaLucro = somaAtualizado - somaComprado;
  const percLucro = somaComprado ? somaLucro / somaComprado : 0;
  const totalHtml = formatComConversao(somaAtualizado, typeof cambio === 'number' ? somaAtualizado * cambio : null, formatUSD);
  const somaCompradoBrl = ativosExibidos.reduce((s, a) => (s == null ? null : (custoBrlLinha_(a, cambio) == null ? null : s + custoBrlLinha_(a, cambio))), 0);
  const investidoHtml = formatComConversao(somaComprado, somaCompradoBrl, formatUSD);
  const lucroBrl = somaCompradoBrl != null && typeof cambio === 'number' ? somaAtualizado * cambio - somaCompradoBrl : null;
  const lucroHtml = formatComConversao(somaLucro, lucroBrl, formatUSD);
  return linhaTotalHtml(colunas, `Total (${contagemTexto(ativosExibidos.length)})`, {
    totalAtualizado: `${totalHtml}<span class="cc-sub">de ${investidoHtml}</span>`,
    lucroPrejuizo: `<span class="${somaLucro >= 0 ? 'num-bom' : 'num-ruim'}">${lucroHtml}</span><span class="cc-sub">${variacaoHtml(percLucro)}</span>`,
  });
}

function desenhar(doc, dados, { historicoPendente = false, aoTentarGraficos = null } = {}) {
  const conteudoEl = doc.getElementById('acoesEuaConteudo');
  const estadoSecoes = lerEstadoSecoes(conteudoEl);
  conteudoEl.innerHTML = esqueletoClasseHtml({
    prefixo: 'acoesEua', links: linksRelevantesHtml(LINKS_RELEVANTES_ACOES_EUA), tituloDistribuicao: 'Por setor', tituloLista: 'Ativos', contagem: contagemTexto(dados.resumo.quantidadeAtivos),
    antesDoResumo: `<div class="cc-moeda-linha">
        <span class="cc-moeda-rotulo" id="acoesEuaMoedaRotulo">Ver valores em</span>
        <div class="segmented cc-moeda-toggle" id="acoesEuaMoeda" role="group" aria-labelledby="acoesEuaMoedaRotulo">
          <button type="button" data-moeda="BRL" aria-pressed="false">R$</button>
          <button type="button" data-moeda="USD" aria-pressed="false">US$</button>
        </div>
      </div>`,
    proventosHtml: secaoProventosCarteiraHtml('acoesEuaProventos', { navegacao: true }),
    extrasAposLista: `${secaoRecolhivelHtml({ nome: 'videos', id: 'acoesEuaVideosSecao', titulo: 'Vídeos', corpoHtml: secaoVideosHtml('acoesEuaVideos') })}`,
  });
  const $ = (id) => doc.getElementById(id);
  wirePointerTooltipCarteiras_(doc, conteudoEl);

  // Câmbio de hoje (USD->BRL): também alimenta o "i" com o equivalente em reais no Valor atual / aplicado / Lucro (19/09/2026 #6)
  const cambio = dados.benchmarks?.dolar;

  // 23/09/2026 #3: o "i" do Valor aplicado e do Lucro/Prejuízo mostra o valor em reais com o câmbio de CADA compra (mesma conta do gráfico
  // "Valor aplicado" e do card da Visão geral). Sem histórico, cai no câmbio de hoje.
  const custoBrl = somaCampoHistorico_(dados.historico, 'fluxoAplicadoAcoesEua');
  const ultimoPonto = dados.historico && dados.historico.length ? dados.historico[dados.historico.length - 1] : null;
  const valorBrl = ultimoPonto && typeof ultimoPonto.acoesEua === 'number' ? ultimoPonto.acoesEua : null;
  const equivalentesBrl = custoBrl != null && valorBrl != null ? {
    totalAtualizado: `Equivalente em reais: ${formatBRL(valorBrl)} (câmbio de hoje).`,
    totalInvestido: `Em reais: ${formatBRL(custoBrl)} - cada compra no câmbio do dia dela (o mesmo número do fim da linha "Valor aplicado" do gráfico).`,
    lucroPrejuizo: `Em reais: ${valorBrl - custoBrl >= 0 ? '+' : '−'}${formatBRL(Math.abs(valorBrl - custoBrl))} (${formatPercentFromFraction(custoBrl ? (valorBrl - custoBrl) / custoBrl : 0)}) - já com a variação do dólar desde cada compra.`,
  } : null;
  // 25/09/2026 (Tiago): proventos do mês e dos últimos 12 meses, na moeda escolhida
  const extrasProventos_ = (moeda) => {
    const stat = moeda === 'USD'
      ? statProventosHero(dados.historico, ['proventosAcoesEuaUsd'], { formatar: formatUSD })
      : statProventosHero(dados.historico, ['proventosAcoesEua'], { formatar: formatBRL });
    return stat ? [stat] : [];
  };
  // 24/09/2026: resumo na moeda escolhida - ver aplicarMoeda_ mais abaixo.
  const renderResumo_ = (moeda) => {
    if (moeda === 'BRL' && equivalentesBrl) {
      const r = dados.resumo;
      const lucroUsd = r.lucroPrejuizo;
      renderResumoClasseCarteiras(doc, $('acoesEuaResumo'), { ...r, totalAtualizado: valorBrl, totalInvestido: custoBrl, lucroPrejuizo: valorBrl - custoBrl }, {
        corToken: '--usa', formatarValor: formatBRL, vies: contarVies_(dados.ativos), extras: extrasProventos_('BRL'), dono: conteudoEl,
        equivalentesBrl: {
          totalAtualizado: `Em dólar: ${formatUSD(r.totalAtualizado)}.`,
          totalInvestido: `Em dólar: ${formatUSD(r.totalInvestido)} (preço médio de compra). Em reais, cada compra no câmbio do dia dela - o mesmo número do fim da linha "Valor aplicado" do gráfico.`,
          lucroPrejuizo: `Em dólar: ${lucroUsd >= 0 ? '+' : '−'}${formatUSD(Math.abs(lucroUsd))} (${formatPercentFromFraction(r.totalInvestido ? lucroUsd / r.totalInvestido : 0)}) - sem a variação do dólar.`,
        },
      });
      return;
    }
    renderResumoClasseCarteiras(doc, $('acoesEuaResumo'), dados.resumo, {
      corToken: '--usa', formatarValor: formatUSD, vies: contarVies_(dados.ativos), cambio, equivalentesBrl, extras: extrasProventos_('USD'), dono: conteudoEl,
    });
  };

  // 19/09/2026 #2: Ibovespa/S&P 500 em variação do dia (com tom) - Dólar continua cotação (R$), neutro
  const ibovespaVar = dados.benchmarks?.ibovespa;
  const spxVar = dados.benchmarks?.spx;
  renderBenchmarksClasseCarteiras(doc, $('acoesEuaBenchmarks'), [
    { label: 'Dólar hoje', valor: typeof cambio === 'number' ? `R$ ${formatNumeroBR(cambio, 2)}` : '—' },
    { label: 'Ibovespa hoje', valor: typeof ibovespaVar === 'number' ? formatPercentFromPoints(ibovespaVar) : '—', cor: typeof ibovespaVar === 'number' ? (ibovespaVar >= 0 ? 'good' : 'bad') : undefined },
    { label: 'S&P 500 hoje', valor: typeof spxVar === 'number' ? formatPercentFromPoints(spxVar) : '—', cor: typeof spxVar === 'number' ? (spxVar >= 0 ? 'good' : 'bad') : undefined },
  ]);
  // 19/09/2026 #6: a legenda mostra US$ (o valor como ele já É) e, entre parênteses, o equivalente em reais
  renderDistribuicaoGrupoCarteiras(doc, $('acoesEuaDistribuicao'), dados.distribuicaoPorGrupo, { cambio, dono: conteudoEl });
  // a lista de proventos é sempre em reais (valor recebido na conta, pelo câmbio do dia)
  renderProventosCarteira(doc, $('acoesEuaProventos'), dados.proventosAnunciados, { classes: ['acoesEua'] });

  const totalCarteira = dados.resumo.totalAtualizado || 0;
  const ativosBase = (dados.ativos || []).map((a) => ({ ...a, percentualCarteira: totalCarteira ? (a.totalAtualizado || 0) / totalCarteira : 0 }));
  const colunas = montarColunas_(cambio);
  montarTabelaFiltravel(doc, {
    filtrosEl: $('acoesEuaFiltros'), tabelaEl: $('acoesEuaTabela'), ativos: ativosBase, colunas, linhaTotal: (exibidos) => montarLinhaTotalAtivos_(exibidos, colunas, cambio),
    tituloFolha: (a) => [a.ticker, a.nome].filter(Boolean).join(' · '), acaoFolha: (a) => ({ href: urlAtivoTicker(a.ticker), rotulo: 'Abrir a página do ativo' }),
  });

  const temCambio = historicoTemCambioUsd(dados.historico);
  const historicoComUsd = temCambio ? comCamposUsdAcoesEua(dados.historico) : dados.historico;
  const temHistorico = !!(dados.historico && dados.historico.length);
  let graficos = null;
  const desenharGraficos_ = (moeda) => {
    const emDolar = moeda === 'USD' && temCambio;
    const sufixo = emDolar ? '(em dólar)' : '(em reais)';
    const periodoAnterior = graficos && graficos.filtro && typeof graficos.filtro.periodo === 'string' ? graficos.filtro.periodo : undefined;
    graficos = criarGraficosCarteira(doc, $('acoesEuaGraficos'), {
      historico: historicoComUsd || null, chavePeriodo: 'carteiras.acoesEua', periodoInicial: periodoAnterior, aoTentar: aoTentarGraficos,
      paineis: [{
        visaoId: emDolar ? 'carteiraAcoesEuaUsd' : 'carteiraAcoesEua', moeda: emDolar ? 'USD' : 'BRL',
        camposProventos: [emDolar ? 'proventosAcoesEuaUsd' : 'proventosAcoesEua'], // 24/09/2026
        labelInfo: `Carteira de Ações EUA ${sufixo}`, labelInfoEvolucao: `Patrimônio em Ações EUA ${sufixo}`, corToken: '--usa', analise: true, comparativo: true,
      }],
    });
    if (!temHistorico && !historicoPendente) graficos.erro('Não deu pra carregar os gráficos agora. O resto da página continua normal.');
  };

  // 24/09/2026: botão R$ | US$. Sem câmbio por dia no histórico (back-end ainda sem o campo cambioUsd) não dá pra desenhar a curva em
  // dólar: o botão some e a página fica como era (resumo em US$, gráficos em R$).
  const toggleEl = $('acoesEuaMoeda');
  const linhaMoedaEl = toggleEl.parentElement;
  function aplicarMoeda_(moeda) {
    moedaAcoesEua_ = moeda;
    toggleEl.querySelectorAll('[data-moeda]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.moeda === moeda ? 'true' : 'false'));
    renderResumo_(moeda);
    desenharGraficos_(moeda);
  }
  if (!temCambio || !equivalentesBrl) {
    linhaMoedaEl.hidden = true;
    renderResumo_('USD');
    desenharGraficos_('BRL');
  } else {
    toggleEl.querySelectorAll('[data-moeda]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.moeda === moedaAtualAcoesEua()) return;
        guardarMoeda_(b.dataset.moeda);
        aplicarMoeda_(b.dataset.moeda);
      });
    });
    aplicarMoeda_(moedaAtualAcoesEua());
  }
  aplicarEstadoSecoes(doc, conteudoEl, estadoSecoes);
}

export async function montarPaginaCarteirasAcoesEua(token, { doc = document, getCarteirasAcoesEuaImpl = getCarteirasAcoesEua, getHomeImpl = getHome, getVideosImpl = undefined, getProventosImpl = undefined } = {}) {
  definirFonteProventos(token, getProventosImpl); // 06/10/2026: meses anteriores dos proventos (ação "proventos" existente)
  const preencherVideos = criarCarregadorVideos(token, { carteira: 'acoesEua' }, getVideosImpl ? { getVideosImpl } : {});
  return montarPaginaClasseCarteiras(token, {
    doc, prefixo: 'acoesEua', tela: 'Carteira de Ações Internacionais', chaveCache: CHAVE_CACHE_ACOES_EUA, buscarCarteira: getCarteirasAcoesEuaImpl, getHomeImpl, desenhar,
    depoisDeDesenhar: () => preencherVideos(doc.getElementById('acoesEuaVideos')),
  });
}

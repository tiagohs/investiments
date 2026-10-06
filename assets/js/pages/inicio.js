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

import { getHome, getHistoricoAtivo, getIntradia } from '../api-client.js';
import { urlAtivo, refAtivo } from '../link-ativo.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { icone, mostrarErroCarga, montarCabecalhoPagina, mostrarEstadoVazio, toast } from '../ui/index.js'; // 06/10/2026 (Onda 3)
import { criarGraficoLinha } from '../charts/index.js'; // 06/10/2026 (Onda 3): biblioteca única de gráficos
import { logoCirculoHtml } from './logo-circulo.js';
import { renderAvisosParciais } from './avisos-parciais.js';
import { htmlBotaoFavorito, montarFavoritos, idFavoritoDoAtivo } from './inicio-favoritos.js';
import { renderProventosAnunciados } from './inicio-proventos.js';
import { renderFaixaMercado, completarFaixaComIntradia, renderResumoCompacto, wireListaAtivos } from './inicio-painel.js';
import { CHAVES_MERCADO, chaveIntradiaDoAtivo, preencherIntradia } from './inicio-intradia.js';
import { formatBRL, formatUSD, formatNumeroBR, formatPercentFromFraction, formatPercentFromPoints, formatDateBR, variacaoNula, hojeSP } from '../format.js';
// 02/10/2026 (pedidos A-D do Tiago - "Escolher período", "Ontem era" +
// meses, card de Análise, IPCA na Visão geral de Carteiras): os 2 módulos
// compartilhados (sem dependência de página) e o comparativo da Início.
import { ligarFiltroPeriodo, recortarPorIntervalo, ehPeriodoPersonalizado, rotuloPeriodo, botoesSegmentadoHtml } from '../periodo-personalizado.js';
import { analisarSerie, renderAnalise, proventosAReceberDe } from '../analise-grafico.js';
import { calcularComparativo, htmlComparativo, ajusteMarcacaoDoCampo } from './inicio-comparativo.js';


/**
 * Separa um valor já formatado ("R$ 5,09", "185.600,00") na parte
 * principal + a última "quebra" (vírgula decimal, ou o último separador
 * de milhar quando não há decimal visível) - reproduz o efeito de dois
 * tamanhos de fonte do mockup (docs/direcao-visual.html, classe .dec)
 * sem precisar de um formatador dedicado por campo.
 */
export function splitValorExibicao(formatted) {
  const idx = Math.max(formatted.lastIndexOf(','), formatted.lastIndexOf('.'));
  if (idx === -1) return { principal: formatted, dec: '' };
  return { principal: formatted.slice(0, idx), dec: formatted.slice(idx) };
}

function setValorComDec(el, formatted) {
  const { principal, dec } = splitValorExibicao(formatted);
  el.textContent = '';
  el.appendChild(el.ownerDocument.createTextNode(principal));
  if (dec) {
    const span = el.ownerDocument.createElement('span');
    span.className = 'dec';
    span.textContent = dec;
    el.appendChild(span);
  }
}

/**
 * As 4 visões de patrimônio que a Home.gs devolve hoje. porClasse
 * (Ações/FIIs/Renda Fixa/Ações EUA) só existe pro total - não é um
 * recorte por classe dentro de Longo Prazo, Nacional ou Renda
 * Emergencial. Nacional (17/09/2026) = Longo Prazo sem os investimentos
 * internacionais (Ações EUA) - ver Home.gs!montarHome_.
 */
const VISOES = {
  total: { chave: 'total', label: 'Patrimônio total' },
  longoPrazo: { chave: 'longoPrazo', label: 'Longo Prazo' },
  nacional: { chave: 'nacional', label: 'Patrimônio Nacional' },
  rendaEmergencial: { chave: 'rendaEmergencial', label: 'Renda Emergencial' },
  // 23/09/2026 #9 (pedido do Tiago: gráfico "Ações Internacionais" na
  // Rentabilidade da Início) - o valor ao vivo mora em porClasse (Home.gs),
  // o MESMO número do topo de Carteiras > Ações EUA em reais.
  internacional: { valor: (p) => (p && p.porClasse ? p.porClasse.acoesEua : undefined), label: 'Ações Internacionais' },
};

/** {valor, label} pra visão pedida - cai em "total" se o id não for reconhecido. */
export function resolverVisao(patrimonio, visaoId) {
  const visao = VISOES[visaoId] || VISOES.total;
  const valor = typeof visao.valor === 'function' ? visao.valor(patrimonio) : (patrimonio ? patrimonio[visao.chave] : undefined);
  return { valor, label: visao.label };
}

const ORDEM_RESUMO = ['total', 'longoPrazo', 'nacional', 'rendaEmergencial'];

const CLASSE_LABEL_DISTRIB = { acoes: 'Ações', fiis: 'FIIs', rf: 'Renda Fixa', usa: 'Ações EUA' };
const CLASSE_COR_DISTRIB = { acoes: '--acoes', fiis: '--fiis', rf: '--rf', usa: '--usa' };
const ORDEM_CLASSE_DISTRIB = ['acoes', 'fiis', 'rf', 'usa'];

/** Valor de posição (BRL) de UM ativo - Renda Fixa já vem como saldo
 * (valorAtualizado), Ações/FIIs são preço unitário × quantidade, Ações
 * EUA preferem o preço unitário já convertido (precoAtualBRL, calculado
 * pelo back-end - ver MeusAtivos.gs) e só caem pro câmbio manual
 * (precoAtual × cambioUsd) se por algum motivo esse campo não vier. */
function valorPosicaoAtivo_(ativo, cambioUsd) {
  if (ativo.classe === 'rf') return typeof ativo.valorAtualizado === 'number' ? ativo.valorAtualizado : 0;
  const qtd = typeof ativo.quantidade === 'number' ? ativo.quantidade : 0;
  if (ativo.classe === 'usa') {
    if (typeof ativo.precoAtualBRL === 'number') return ativo.precoAtualBRL * qtd;
    if (typeof cambioUsd === 'number' && typeof ativo.precoAtual === 'number') return ativo.precoAtual * qtd * cambioUsd;
    return 0;
  }
  return typeof ativo.precoAtual === 'number' ? ativo.precoAtual * qtd : 0;
}

/**
 * Soma o valor de posição (BRL) de cada classe (Ações/FIIs/Renda
 * Fixa/Ações EUA) dentro de `ativos` - usado pra desenhar a distribuição
 * do Total e da divisão Longo Prazo. `excluirEmergencial` tira as
 * posições de Renda Fixa marcadas "Renda Emergencial" (marca==='emergencial')
 * da soma - é assim que a distribuição de Longo Prazo difere da do
 * Total (mesmas 4 classes, só que a fatia de Renda Fixa fica menor,
 * já que a reserva de emergência saiu). `excluirInternacional`
 * (17/09/2026) tira as posições classe 'usa' inteiras - é assim que a
 * distribuição de Nacional difere da de Longo Prazo (fica só com
 * Ações/FIIs/Renda Fixa não-emergencial). Calculado a partir do array
 * `ativos` (não de patrimonio.porClasse, que só existe pro total
 * combinado - ver Home.gs) - classes com valor zero/ausente não entram.
 */
export function calcularDistribuicaoPorClasse(ativos, { cambioUsd, excluirEmergencial = false, excluirInternacional = false, totaisPorClasse = null } = {}) {
  const somas = { acoes: 0, fiis: 0, rf: 0, usa: 0 };
  // Soma à parte, só pra 'usa', o valor de posição em DÓLAR (preço
  // unitário em USD × quantidade - nunca convertido de volta a partir
  // do BRL já somado acima, pra não acumular arredondamento de mais em
  // cima do que precoAtualBRL/cambioUsd já podem ter introduzido).
  // Alimenta o "US$ X (R$ Y)" da fatia Ações EUA - ver renderDistribuicao.
  let somaUsaUsd = 0;
  (ativos || []).forEach((ativo) => {
    if (excluirInternacional && ativo.classe === 'usa') return;
    if (excluirEmergencial && ativo.classe === 'rf' && ativo.marca === 'emergencial') return;
    if (!(ativo.classe in somas)) return;
    somas[ativo.classe] += valorPosicaoAtivo_(ativo, cambioUsd);
    if (ativo.classe === 'usa') {
      const qtd = typeof ativo.quantidade === 'number' ? ativo.quantidade : 0;
      if (typeof ativo.precoAtual === 'number') somaUsaUsd += ativo.precoAtual * qtd;
    }
  });
  // 23/09/2026 #3: quando o chamador tem o total EXATO de cada classe
  // (patrimonio.porClasse, o mesmo número do card/topo de cada carteira),
  // usa ele em vez da soma ativo a ativo - a soma de preço-em-R$-
  // arredondado × quantidade dava a fatia "Ações EUA" alguns centavos
  // diferente do resto do app.
  if (totaisPorClasse) {
    ORDEM_CLASSE_DISTRIB.forEach((classe) => {
      if (excluirInternacional && classe === 'usa') return;
      const v = totaisPorClasse[classe];
      if (typeof v === 'number' && Number.isFinite(v) && somas[classe] > 0) somas[classe] = v;
    });
  }
  return ORDEM_CLASSE_DISTRIB
    .filter((classe) => somas[classe] > 0)
    .map((classe) => ({
      label: CLASSE_LABEL_DISTRIB[classe],
      cor: `var(${CLASSE_COR_DISTRIB[classe]})`,
      valor: somas[classe],
      ...(classe === 'usa' ? { valorUsd: somaUsaUsd } : {}),
    }));
}

/**
 * Distribuição da Renda Emergencial por TIPO de investimento (Tesouro
 * Selic, Tesouro IPCA, CDB, LCI/LCA etc., via o campo tipoInvestimento
 * que cada ativo de Renda Fixa já traz) - a pedido do Tiago, já que
 * Renda Emergencial é 100% Renda Fixa (uma distribuição por CLASSE, como
 * as outras 2 divisões, não diria nada de novo aqui). Ordenado do maior
 * pro menor valor.
 */
export function calcularDistribuicaoRendaEmergencial(ativos) {
  const somas = new Map();
  (ativos || []).forEach((ativo) => {
    if (ativo.classe !== 'rf' || ativo.marca !== 'emergencial') return;
    const tipo = ativo.tipoInvestimento || 'Outro';
    const valor = typeof ativo.valorAtualizado === 'number' ? ativo.valorAtualizado : 0;
    somas.set(tipo, (somas.get(tipo) || 0) + valor);
  });
  return Array.from(somas.entries())
    .filter(([, valor]) => valor > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, valor]) => ({ label: tipo, valor }));
}

/** Paleta de cores pra fatias sem token dedicado (caso da Renda
 * Emergencial, que não tem uma cor fixa por tipo de investimento) -
 * cicla pelos mesmos tokens categóricos já usados no resto do app. */
const PALETA_DISTRIB_FALLBACK = ['--rf', '--fiis', '--usa', '--acoes', '--warn', '--na'];

/**
 * Desenha um "donut" (SVG simples - um círculo com stroke-dasharray por
 * fatia, técnica que não depende de biblioteca nenhuma, mesma convenção
 * do resto do projeto) + a legenda (nome e %) dentro de `container`
 * (esvazia antes). Ao contrário do gráfico de Rentabilidade, os textos
 * aqui (nome/%) ficam em HTML normal FORA do SVG - um donut não precisa
 * de rótulo desenhado dentro do próprio desenho, então não corre o
 * mesmo risco de fonte minúscula que o gráfico de linha teve (ver
 * renderGraficoRentabilidade). `fatias` é `[{ label, valor, cor? }]` -
 * `cor` é opcional (cai na paleta PALETA_DISTRIB_FALLBACK quando não
 * vem, caso da Renda Emergencial). `formatarValor` (padrão formatBRL) e
 * `formatarValorTooltip` (padrão = o mesmo `formatarValor`) permitem
 * mostrar o valor principal numa moeda e o valor entre parênteses da
 * tooltip em outra - 19/09/2026 #6, pedido do Tiago pro donut "Por
 * setor" de Ações EUA (carteiras-classe-comum.js!renderDistribuicaoGrupoCarteiras):
 * "por default, mostra em dolar aqui, e no i, mantenha a versao em
 * reais" - ali `formatarValor=formatUSD` (os valores de Ações EUA já
 * vêm nativamente em US$) e `formatarValorTooltip=(v)=>formatBRL(v*cambio)`.
 * Não mexe no caminho `f.valorUsd` abaixo (2ª linha US$/R$ empilhada,
 * usado só no resumo de Patrimônio da própria Início, que mistura
 * classes em R$ com uma fatia em US$ na mesma legenda) - são 2
 * necessidades diferentes: aqui é a legenda INTEIRA numa moeda só,
 * variável por chamador.
 */
export function renderDistribuicao(doc, container, fatias, { formatarValor = formatBRL, formatarValorTooltip = formatarValor } = {}) {
  container.innerHTML = '';
  const total = (fatias || []).reduce((soma, f) => soma + f.valor, 0);
  if (!fatias || !fatias.length || total <= 0) {
    container.innerHTML = '<p class="hint">Sem dado suficiente pra montar a distribuição.</p>';
    return;
  }

  const R = 15.9155; // raio cuja circunferência (2πR) dá ~100 - 1 unidade de dasharray = 1% da volta.
  let acumulado = 0;
  const arcosSvg = fatias.map((f, i) => {
    const pct = (f.valor / total) * 100;
    const cor = f.cor || `var(${PALETA_DISTRIB_FALLBACK[i % PALETA_DISTRIB_FALLBACK.length]})`;
    const dashoffset = (25 - acumulado).toFixed(2);
    acumulado += pct;
    return `<circle class="distrib-arco" cx="21" cy="21" r="${R}" fill="none" stroke="${cor}" stroke-width="7" stroke-dasharray="${pct.toFixed(2)} ${(100 - pct).toFixed(2)}" stroke-dashoffset="${dashoffset}"/>`;
  }).join('');

  const wrap = doc.createElement('div');
  wrap.className = 'distrib';
  wrap.innerHTML = `
    <svg class="distrib-donut" viewBox="0 0 42 42" aria-hidden="true">${arcosSvg}</svg>
    <div class="distrib-legenda"></div>
  `;

  // 13/09/2026 (4ª rodada): Tiago pediu de volta o valor em R$ junto da
  // % (antes de virar donut, só tinha o R$; a 1ª versão do donut só
  // trouxe a % - agora mostra os dois lado a lado por fatia).
  const legenda = wrap.querySelector('.distrib-legenda');
  fatias.forEach((f, i) => {
    const pct = (f.valor / total) * 100;
    const cor = f.cor || `var(${PALETA_DISTRIB_FALLBACK[i % PALETA_DISTRIB_FALLBACK.length]})`;
    const item = doc.createElement('div');
    item.className = 'distrib-item info-alvo';
    // 14/09/2026: tooltip com nome completo (o .distrib-nome trunca com
    // "..." quando o rótulo é longo) + % com 2 casas (a legenda mostra só
    // 1 casa, pra caber) - sem precisar abrir a planilha pra ver o valor
    // exato por trás do arredondamento. 16/09/2026: era `title` nativo
    // (não aparece no toque) - agora é .info-alvo com ícone "i" clicável,
    // ver wirePointerTooltipDistrib_ logo abaixo.
    item.dataset.tooltip = `${f.label}: ${formatNumeroBR(pct, 2)}% (${formatarValorTooltip(f.valor)})`;
    // 18/09/2026: dot+nome e valor+%+ícone viraram 2 grupos (.distrib-nome-wrap/
    // .distrib-valores) em vez de 5 filhos soltos - o min-width:0 (17/09/2026)
    // não bastou sozinho num celular de verdade (Tiago testou e ainda vazava):
    // AINDA existiam 3 pedaços flex:none/nowrap (valor, %, ícone) competindo
    // por espaço na MESMA linha que o nome, então achavam largura suficiente
    // pra vazar mesmo com o resto podendo encolher. Agrupar os 2 lados deixa
    // .distrib-item virar 2 linhas empilhadas (flex-direction:column) abaixo
    // de 480px (ver CSS) - cada linha só precisa caber sozinha, nunca mais
    // todos os 5 pedaços juntos numa linha só.
    item.innerHTML = `
      <span class="distrib-nome-wrap">
        <span class="distrib-dot" style="background:${cor}"></span>
        <span class="distrib-nome">${f.label}</span>
      </span>
      <span class="distrib-valores">
        <span class="distrib-valor"></span>
        <span class="distrib-pct"></span>
        <span class="info-icon">i</span>
      </span>
    `;
    // 16/09/2026: pedido do Tiago - a fatia de Ações EUA (investimento
    // internacional) mostra o valor em dólar, com o equivalente em reais
    // (cálculo continua todo em R$ por trás - "valor"/pct acima nunca
    // mudam - só a EXIBIÇÃO muda). 17/09/2026: o equivalente em reais
    // saiu do lado (mesma linha, entre parênteses) e virou uma 2ª linha
    // embaixo do valor em dólar - "US$ X (R$ Y)" numa linha só, com nome
    // + % do lado, estourava a largura do card no mobile (linha cortando
    // na tela, pedido do Tiago pra corrigir).
    if (typeof f.valorUsd === 'number') {
      item.querySelector('.distrib-valor').innerHTML = `${formatUSD(f.valorUsd)}<span class="distrib-valor-abaixo">(${formatBRL(f.valor)})</span>`;
    } else {
      item.querySelector('.distrib-valor').textContent = formatarValor(f.valor);
    }
    item.querySelector('.distrib-pct').textContent = `${formatNumeroBR(pct, 1)}%`;
    legenda.appendChild(item);
  });

  container.appendChild(wrap);
}

/**
 * Mesma técnica/mesmo comportamento de wireTooltipAtivos logo acima
 * (touch/pen alterna no pointerdown, nunca fecha sozinho no
 * pointerleave, toque fora fecha) - versão genérica pro resto da
 * página (16/09/2026, seguimento do pedido "todos os lugares que
 * possuem um tooltip"): a legenda do donut de resumo de patrimônio
 * (renderDistribuicao) ainda usava `title` nativo. Marcador genérico
 * ".info-alvo"/".info-icon"/".info-tooltip" (mesmas classes usadas em
 * distribuicoes-metas.js!wirePointerTooltipInfo_, duplicadas aqui pelo
 * mesmo motivo de sempre - .moeda-conv/.skel/etc.) - ligado 1x no
 * container ESTÁVEL de renderResumoPatrimonio (não no de
 * renderDistribuicao, que é recriado a cada card).
 */
function wirePointerTooltipDistrib_(doc, container) {
  if (!container || container._infoTooltipWired) return;
  container._infoTooltipWired = true;

  const janela = doc.defaultView;
  const tooltip = doc.createElement('div');
  tooltip.className = 'info-tooltip';
  tooltip.hidden = true;
  (doc.body || container).appendChild(tooltip);

  let alvoAberto = null;

  function esconder_() {
    tooltip.hidden = true;
    alvoAberto = null;
  }

  function mostrar_(alvo, clientX, clientY) {
    const texto = alvo.dataset.tooltip;
    if (!texto) {
      esconder_();
      return;
    }
    tooltip.textContent = texto;
    tooltip.hidden = false;

    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let esquerda = clientX + 14;
    let topo = clientY + 14;
    if (esquerda + tw > larguraJanela - 12) esquerda = clientX - tw - 14;
    if (topo + th > alturaJanela - 12) topo = clientY - th - 14;
    tooltip.style.left = `${esquerda}px`;
    tooltip.style.top = `${topo}px`;
  }

  function aoMoverOuTocar_(ev) {
    const alvo = typeof ev.target.closest === 'function' ? ev.target.closest('.info-alvo') : null;
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
      if (ev.type !== 'pointerdown' || !alvo) return;
      if (alvoAberto === alvo) {
        esconder_();
        return;
      }
      alvoAberto = alvo;
      mostrar_(alvo, ev.clientX, ev.clientY);
      return;
    }
    if (!alvo) {
      esconder_();
      return;
    }
    mostrar_(alvo, ev.clientX, ev.clientY);
  }

  function aoSairPonteiro_(ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return;
    esconder_();
  }

  function aoTocarFora_(ev) {
    if (!alvoAberto) return;
    const alvo = ev.target;
    if (tooltip.contains(alvo) || alvoAberto.contains(alvo)) return;
    esconder_();
  }

  /** 06/10/2026 (A-59, teclado): Enter/Espaço no "i" abre e fecha a tooltip; Esc fecha. */
  function aoTecla_(ev) {
    if (ev.key === 'Escape') { esconder_(); return; }
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-info-icon') : null;
    const card = icone && icone.closest('.ativo-card');
    if (!card) return;
    ev.preventDefault();
    if (cardAberto === card) { esconder_(); return; }
    cardAberto = card;
    const r = icone.getBoundingClientRect();
    mostrar_(card, r.left, r.bottom);
  }

  container.addEventListener('keydown', aoTecla_);
  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', aoSairPonteiro_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

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

/** dias corridos de cada preset - historico tem 1 linha por dia corrido (ver
 * cabeçalho), então cortar os últimos N itens do array já é a janela certa,
 * sem precisar comparar datas. */
const DIAS_POR_PERIODO = { '30d': 30, '6m': 182, '12m': 365, '3a': 365 * 3 };

/**
 * Recorta historico pro período pedido. 'mes' (13/09/2026, a pedido do
 * Tiago: "aqui faltou o mês atual") é diferente dos outros presets -
 * não é "os últimos N dias corridos", é o mês-calendário corrente (dia
 * 1 até hoje). "hoje" aqui é o dia do ÚLTIMO item de historico (o mais
 * recente sincronizado), não o relógio da máquina - evita qualquer
 * divergência entre o que o back-end considera "hoje" e o front-end.
 * Comparação por PREFIXO DE TEXTO (yyyy-MM) em vez de Date - historico[i].data
 * é uma data pura (yyyy-MM-dd, sem hora), e já existe um bug real
 * documentado (format.js!formatDateBR) de converter esse tipo de data
 * por Date+fuso sem necessidade nenhuma - aqui nem essa conversão existe.
 * 'tudo' (ou um id desconhecido que não seja 'mes'/'tudo') devolve o
 * array inteiro.
 */
export function filtrarHistoricoPorPeriodo(historico, periodoId = '12m', campoDesdeInicio = null) {
  if (!historico || !historico.length) return [];
  // 02/10/2026 ("Escolher período"): período personalizado { inicio, fim } -
  // os dias do intervalo + o fechamento do dia anterior como base do 0%
  // (mesma ideia do 'mes' logo abaixo). Ver periodo-personalizado.js.
  if (ehPeriodoPersonalizado(periodoId)) return recortarPorIntervalo(historico, periodoId);
  if (periodoId === 'mes') {
    const ultimaData = historico[historico.length - 1].data;
    if (typeof ultimaData !== 'string' || ultimaData.length < 7) return historico;
    const anoMes = ultimaData.slice(0, 7); // 'yyyy-MM'
    // 23/09/2026 (comparando com o Gorila - o "Mês atual" de lá começa em
    // "31 ago" com 0%): a BASE do mês é o fechamento do ÚLTIMO dia do mês
    // anterior, não o 1º dia do mês - senão o que aconteceu no dia 1 (de
    // 31/08 pra 01/09) simplesmente não entra na rentabilidade do mês. O
    // ponto-base entra na janela (é o 0% do gráfico); o resto continua
    // sendo só o mês corrente.
    const idxPrimeiroDoMes = historico.findIndex((item) => typeof item.data === 'string' && item.data.startsWith(anoMes));
    if (idxPrimeiroDoMes === -1) return [];
    return historico.slice(Math.max(0, idxPrimeiroDoMes - 1));
  }
  const dias = DIAS_POR_PERIODO[periodoId];
  if (!dias) {
    // periodoId === 'tudo' ("Desde o início") - ou qualquer id desconhecido,
    // mesmo comportamento de sempre (devolve o historico inteiro).
    //
    // 20/09/2026 (pedido do Tiago, comparando as 4 subpáginas de Carteiras):
    // "o desde o início de cada carteira varia, é sempre a 1ª data que
    // comecei a investir naquele tipo" - Ações EUA/FIIs/as 2 sub-visões de
    // Renda Fixa começaram bem depois do início do patrimônio total
    // (22/12/2020) - historico é o MESMO array pra todas as visões (só o
    // campo muda), então "Desde o início" sem nenhum corte nascia com
    // anos de linha reta em zero antes da 1ª posição de verdade daquele
    // tipo específico (Ações/Renda Fixa Total, que já existem desde o
    // início de tudo, continuam batendo com o array inteiro - só as
    // visões mais novas mudam de verdade). campoDesdeInicio (opcional,
    // omitido = comportamento antigo, nunca corta) deixa cada chamador
    // dizer QUAL campo define "o início desta visão" - corta pro primeiro
    // dia em que ELE tem valor válido, reaproveitando
    // primeiroIndiceValidoInicio_ (mesma função que já decide a base do
    // cálculo de % "desde o início" logo abaixo - nunca 2 critérios de
    // "onde essa visão começa" podendo divergir entre si).
    if (campoDesdeInicio) {
      const idxInicio = primeiroIndiceValidoInicio_(historico, campoDesdeInicio);
      if (idxInicio > 0) return historico.slice(idxInicio);
    }
    return historico;
  }
  // 23/09/2026: N dias de variação precisam de N+1 pontos (o 1º é a base
  // - mesmo motivo do 'mes', acima).
  // 03/10/2026 (achado no card de Análise do ativo): o histórico do ATIVO
  // só tem dias de pregão - 366 pontos ali eram ~17 meses, e o "12 meses"
  // do gráfico mostrava 17. O corte agora é pela DATA (a base é o último
  // ponto até "último dia − N"); na série da Início, que tem todo dia
  // corrido, dá exatamente os mesmos N+1 pontos de antes.
  const ultimaData = historico[historico.length - 1].data;
  if (typeof ultimaData === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ultimaData)) {
    const [a, m, d] = ultimaData.slice(0, 10).split('-').map(Number);
    const corte = new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
    let base = -1;
    for (let i = historico.length - 1; i >= 0; i -= 1) {
      if (typeof historico[i].data === 'string' && historico[i].data <= corte) { base = i; break; }
    }
    return historico.slice(Math.max(0, base));
  }
  return historico.slice(-(dias + 1));
}

// 19/09/2026: "carteiraX" abaixo são as visões por classe das 4
// subpáginas de Carteiras (Ações/FIIs/Ações EUA/Renda Fixa×3) - ver
// cabeçalho de HistoricoInicio.gs pros campos novos que alimentam elas.
// Não são "visões da Início" de verdade (a Início nunca usa essas 6),
// mas moram aqui porque renderGraficoRentabilidade/wireGraficoRentabilidade
// (o "motor" de gráfico) já é reaproveitado por Carteiras (ver
// carteiras-visao-geral.js, visaoId:'total') - mesmo precedente já
// confirmado com o Tiago, estender essas 3 tabelas em vez de duplicar o
// motor inteiro numa cópia dentro de carteiras-classe-comum.js.
/**
 * 24/09/2026 (Tiago: "em Ações EUA, me dê a opção de ver em reais ou em
 * dólar"): acrescenta a cada ponto os campos da visão carteiraAcoesEuaUsd
 * - valor, fluxo da rentabilidade e Valor aplicado de Ações EUA em DÓLAR,
 * dividindo os campos em reais pelo câmbio do próprio dia (`cambioUsd`,
 * HistoricoInicio.gs). É o mesmo câmbio que o back-end usou pra passar
 * cada posição/compra/provento pra reais, então a volta é exata: o último
 * ponto dá o "Total atualizado" em US$ e a soma do aplicado dá o "Valor
 * aplicado" em US$ do topo da página. Ponto sem câmbio (back-end antigo
 * ou antes da 1ª posição) fica sem os campos (null).
 */
export function comCamposUsdAcoesEua(historico) {
  return (historico || []).map((p) => {
    const c = p.cambioUsd;
    if (!(typeof c === 'number' && Number.isFinite(c) && c > 0)) return { ...p, acoesEuaUsd: null, fluxoCaixaAcoesEuaUsd: null, fluxoAplicadoAcoesEuaUsd: null, proventosAcoesEuaUsd: null };
    const div = (v) => (typeof v === 'number' && Number.isFinite(v) ? v / c : null);
    return { ...p, acoesEuaUsd: div(p.acoesEua), fluxoCaixaAcoesEuaUsd: div(p.fluxoCaixaAcoesEua), fluxoAplicadoAcoesEuaUsd: div(p.fluxoAplicadoAcoesEua), proventosAcoesEuaUsd: div(p.proventosAcoesEua) };
  });
}

/** 24/09/2026: o histórico tem câmbio por dia (dá pra mostrar Ações EUA em dólar)? */
export function historicoTemCambioUsd(historico) {
  return Array.isArray(historico) && historico.some((p) => typeof p.cambioUsd === 'number' && p.cambioUsd > 0);
}

export const CAMPO_PRINCIPAL_POR_VISAO = {
  total: 'patrimonio', longoPrazo: 'longoPrazo', nacional: 'nacional', rendaEmergencial: 'rendaEmergencial',
  internacional: 'acoesEua', // 23/09/2026 #9: mesmo campo de carteiraAcoesEua (Carteiras) - os 2 gráficos batem por construção
  carteiraAcoes: 'acoes', carteiraFiis: 'fiis', carteiraAcoesEua: 'acoesEua',
  carteiraAcoesEuaUsd: 'acoesEuaUsd', // 24/09/2026: Ações EUA em dólar - ver comCamposUsdAcoesEua
  carteiraRendaFixaTotal: 'rendaFixaTotal', carteiraRendaFixaLongoPrazo: 'rendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'rendaEmergencial', // mesmo campo da Início - RF-emergencial é o mesmo número
  // 25/09/2026: tela Detalhe do ativo - histórico de UM ativo montado no
  // front (ativo-calc.js!montarHistoricoAtivo), com os mesmos nomes de campo
  ativoAcoes: 'ativo', ativoFiis: 'ativo', ativoAcoesEua: 'ativo', ativoRendaFixa: 'ativo',
  // 25/09/2026 #2 (Tiago: "os graficos estao em reais, traga o filtro
  // R$/Dolar"): Ações EUA em dólar na tela do ativo - mesmo padrão de
  // carteiraAcoesEuaUsd acima, ver ativo-calc.js!comCamposUsdAtivo.
  ativoAcoesEuaUsd: 'ativoUsd',
};

/** Campo de fluxo de caixa liquido diario (aporte/retirada/provento, ver
 * FluxoCaixaInicio.gs) correspondente a cada visao - usado so pra
 * "neutralizar" a serie do PORTFOLIO em normalizarSerieRentabilidade (TWR),
 * nunca pros benchmarks (Ibovespa/CDI/Selic nao tem aporte). */
export const CAMPO_FLUXO_POR_VISAO = {
  total: 'fluxoCaixaPatrimonio',
  longoPrazo: 'fluxoCaixaLongoPrazo',
  nacional: 'fluxoCaixaNacional',
  rendaEmergencial: 'fluxoCaixaRendaEmergencial',
  internacional: 'fluxoCaixaAcoesEua',
  carteiraAcoes: 'fluxoCaixaAcoes',
  carteiraFiis: 'fluxoCaixaFiis',
  carteiraAcoesEua: 'fluxoCaixaAcoesEua',
  carteiraAcoesEuaUsd: 'fluxoCaixaAcoesEuaUsd',
  carteiraRendaFixaTotal: 'fluxoCaixaRendaFixaTotal',
  carteiraRendaFixaLongoPrazo: 'fluxoCaixaRendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'fluxoCaixaRendaEmergencial',
  ativoAcoes: 'fluxoCaixaAtivo', ativoFiis: 'fluxoCaixaAtivo', ativoAcoesEua: 'fluxoCaixaAtivo', ativoRendaFixa: 'fluxoCaixaAtivo',
  ativoAcoesEuaUsd: 'fluxoCaixaAtivoUsd',
};

/** 21/09/2026 (pedido do Tiago - "Valor aplicado" tem que ser só capital
 * líquido de Compra/Venda + Renda Fixa, NUNCA reduzido por provento
 * recebido): mesmas chaves de CAMPO_FLUXO_POR_VISAO acima, mas apontando
 * pros campos fluxoAplicado* (HistoricoInicio.gs) - usado SÓ pra linha
 * pontilhada "Valor aplicado" dos gráficos de Evolução (Início +
 * subpáginas de Carteiras), nunca pro TWR da Rentabilidade (que continua
 * usando CAMPO_FLUXO_POR_VISAO acima, deduzindo provento de propósito -
 * ver FluxoCaixaInicio.gs). */
export const CAMPO_FLUXO_APLICADO_POR_VISAO = {
  total: 'fluxoAplicadoPatrimonio',
  longoPrazo: 'fluxoAplicadoLongoPrazo',
  nacional: 'fluxoAplicadoNacional',
  rendaEmergencial: 'fluxoAplicadoRendaEmergencial',
  internacional: 'fluxoAplicadoAcoesEua',
  carteiraAcoes: 'fluxoAplicadoAcoes',
  carteiraFiis: 'fluxoAplicadoFiis',
  carteiraAcoesEua: 'fluxoAplicadoAcoesEua',
  carteiraAcoesEuaUsd: 'fluxoAplicadoAcoesEuaUsd',
  carteiraRendaFixaTotal: 'fluxoAplicadoRendaFixaTotal',
  carteiraRendaFixaLongoPrazo: 'fluxoAplicadoRendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'fluxoAplicadoRendaEmergencial',
  ativoAcoes: 'fluxoAplicadoAtivo', ativoFiis: 'fluxoAplicadoAtivo', ativoAcoesEua: 'fluxoAplicadoAtivo', ativoRendaFixa: 'fluxoAplicadoAtivo',
  ativoAcoesEuaUsd: 'fluxoAplicadoAtivoUsd',
};

/** Benchmarks por visão - Total/Longo Prazo/Nacional contra Ibovespa+CDI,
 * Renda Emergencial contra CDI+Selic (decisão registrada em
 * docs/plano-implementacao.html - não compara reserva de emergência com bolsa). */
export const BENCHMARKS_POR_VISAO = {
  total: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  longoPrazo: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  nacional: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  rendaEmergencial: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
    { campo: 'indiceSelic', label: 'Selic', cor: '--fiis', dash: '1.5 4.5' },
  ],
  // 23/09/2026 #9: Ações Internacionais da Início - S&P 500 (a bolsa dela)
  // tracejado e Ibovespa pontilhado, mesmo estilo de traço dos outros 3
  // painéis. Em reais, com o câmbio de cada dia (a carteira sente o dólar,
  // o S&P 500 aqui não).
  internacional: [
    { campo: 'sp500', label: 'S&P 500', cor: '--usa', dash: '6 4' },
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
  ],
  // 19/09/2026 (ver comentário de CAMPO_PRINCIPAL_POR_VISAO acima) - cores
  // e estilo de traço conferidos pixel-a-pixel no mockup real
  // (docs/direcao-visual do Design "Carteiras", artboards Acoes/Fiis/
  // AcoesEua/RendaFixa.dc.html): o benchmark de "índice de mercado"
  // (Ibovespa/IFIX) desenha em linha CHEIA (dash:null, ver
  // renderGraficoRentabilidade acima), só o benchmark de "taxa" (CDI/
  // IPCA/S&P 500) vem tracejado - diferente da Início, que tracejava os
  // dois. dash:null só funciona por causa do guard adicionado nesta
  // mesma rodada em benchmarkPathsSvg/cls logo acima.
  carteiraAcoes: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  carteiraFiis: [
    { campo: 'ifix', label: 'IFIX', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  carteiraAcoesEua: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'sp500', label: 'S&P 500', cor: '--acoes', dash: '6 4' },
  ],
  // 24/09/2026: mesma comparação, com a carteira em dólar
  carteiraAcoesEuaUsd: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'sp500', label: 'S&P 500', cor: '--acoes', dash: '6 4' },
  ],
  // Renda Fixa não tem "índice de mercado" (não tem preço de bolsa) -
  // CDI e IPCA vêm os 2 tracejados, igual o mockup de RendaFixa.dc.html.
  // As 3 sub-visões (total/longoPrazo/emergencial) comparam com os MESMOS
  // 2 benchmarks - só o campo principal (Portfólio) muda entre elas.
  carteiraRendaFixaTotal: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  carteiraRendaFixaLongoPrazo: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  carteiraRendaFixaEmergencial: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  // 25/09/2026: tela Detalhe do ativo - o índice da bolsa do ativo (linha
  // cheia) e o CDI (tracejado), como nas Carteiras; renda fixa: CDI e IPCA.
  ativoAcoes: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  ativoFiis: [
    { campo: 'ifix', label: 'IFIX', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  ativoAcoesEua: [
    { campo: 'sp500', label: 'S&P 500', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  ativoRendaFixa: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  // 25/09/2026 #2: mesma comparação de ativoAcoesEua, com o ativo em dólar
  ativoAcoesEuaUsd: [
    { campo: 'sp500', label: 'S&P 500', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
};

// 19/09/2026: cor da linha do Portfólio (a série principal) por visão -
// na Início é sempre --acoes (azul), mas cada subpágina de Carteiras usa
// a cor da própria classe (mesmo token de shell.css usado no resto da
// página) - conferido pixel-a-pixel no mockup real. default 'total'
// preserva o valor hardcoded que já existia antes desta rodada.
export const COR_PRINCIPAL_POR_VISAO = {
  total: '--acoes', longoPrazo: '--acoes', nacional: '--acoes', rendaEmergencial: '--acoes', internacional: '--acoes',
  carteiraAcoes: '--acoes', carteiraFiis: '--fiis', carteiraAcoesEua: '--usa', carteiraAcoesEuaUsd: '--usa',
  carteiraRendaFixaTotal: '--rf', carteiraRendaFixaLongoPrazo: '--rf', carteiraRendaFixaEmergencial: '--rf',
  ativoAcoes: '--acoes', ativoFiis: '--fiis', ativoAcoesEua: '--usa', ativoRendaFixa: '--rf', ativoAcoesEuaUsd: '--usa',
};

/** Índice do primeiro valor numérico válido (não-nulo, finito) e diferente de
 * zero de `campo` em `historico` - zero como base de "% desde o início"
 * dividiria por zero; ibovespa também pode vir null antes do 1º pregão da
 * janela. -1 quando não existe nenhum valor válido. */
export function primeiroIndiceValidoInicio_(historico, campo) {
  for (let i = 0; i < historico.length; i += 1) {
    const v = historico[i][campo];
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return i;
  }
  return -1;
}

/** 23/09/2026 #3: a janela começa no dia em que a visão NASCEU? (o
 * ponto anterior a ela, no histórico completo, vale 0/não existe, e o dia
 * tem aporte) - aí a rentabilidade mede a partir do custo desse aporte,
 * não do fechamento do dia (ver normalizarSerieRentabilidade). */
export function inicioEhAbertura_(historicoCompleto, janela, campo, campoFluxo) {
  const idx = primeiroIndiceValidoInicio_(janela, campo);
  if (idx === -1) return false;
  const pos = historicoCompleto.indexOf(janela[idx]);
  if (pos === -1) return false;
  const anterior = pos > 0 ? historicoCompleto[pos - 1][campo] : 0;
  if (typeof anterior === 'number' && Number.isFinite(anterior) && anterior !== 0) return false;
  const fluxo = janela[idx][campoFluxo];
  const valor = janela[idx][campo];
  return typeof fluxo === 'number' && fluxo > 0 && valor / fluxo >= 0.5 && valor / fluxo <= 2;
}

/** Primeiro valor numérico válido de `campo` em `historico` (ver
 * primeiroIndiceValidoInicio_). */
function primeiroValorValidoInicio_(historico, campo) {
  const idx = primeiroIndiceValidoInicio_(historico, campo);
  return idx === -1 ? null : historico[idx][campo];
}

/**
 * Normaliza a série de `campo` (dentro de `historico`, já recortado pro
 * período) pra "% desde o início do período" - único jeito de comparar
 * patrimônio (R$) com um índice (pontos ou curva base 100) na mesma escala.
 * Sem base válida (tudo zero/null na janela), devolve todo mundo null em vez
 * de inventar 0% - renderGraficoRentabilidade trata isso mostrando um aviso.
 *
 * 13/09/2026 (correção Gorilla - Tiago comparou nosso "+5.726% desde o
 * início" com o "+75,63%" do app Gorilla): quando `campoFluxo` é passado (só
 * pra série do PORTFÓLIO - patrimonio/longoPrazo/rendaEmergencial -, nunca
 * pros benchmarks, que não têm aporte/retirada), o cálculo vira Retorno
 * Ponderado no Tempo (TWR) em vez da razão ingênua valor_hoje/valor_base:
 * cada dia "neutraliza" o fluxo de caixa líquido daquele dia (aporte,
 * retirada, provento recebido - ver FluxoCaixaInicio.gs, calculado incluindo
 * câmbio histórico USD/BRL pras ações EUA) antes de medir o retorno do dia, e
 * os retornos diários são encadeados (compostos), nunca somados. Isso evita
 * que um aporte apareça como ganho (ou uma retirada/venda como perda) - a
 * causa raiz do número absurdo. Proventos entram como flow NEGATIVO (ver
 * FluxoCaixaInicio.gs) de propósito: como `patrimonio` não inclui caixa, um
 * provento recebido não move o valor bruto do dia, então soma-lo de volta é
 * o jeito de fazer o dividendo CONTAR como ganho no retorno total (pedido do
 * Tiago: "incluir proventos também"). Sem campoFluxo, mantém o cálculo antigo
 * (usado pelos benchmarks, que não têm fluxo de caixa).
 */
export function normalizarSerieRentabilidade(historico, campo, campoFluxo, { abertura = false } = {}) {
  if (!campoFluxo) {
    const base = primeiroValorValidoInicio_(historico, campo);
    if (base == null) return historico.map(() => null);
    return historico.map((item) => {
      const v = item[campo];
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      return ((v / base) - 1) * 100;
    });
  }

  const idxBase = primeiroIndiceValidoInicio_(historico, campo);
  if (idxBase === -1) return historico.map(() => null);

  const resultado = new Array(historico.length).fill(null);
  const suspeitos = [];
  Object.defineProperty(resultado, 'suspeitos', { value: suspeitos, enumerable: false });
  resultado[idxBase] = 0;
  let cumulativo = 0;
  let anterior = historico[idxBase][campo];
  // 23/09/2026 #3 (Controle 8 - "Desde o início" de Ações EUA dava
  // um ganho em R$ menor que o lucro da posição em reais - o que
  // aconteceu no 1º dia sumia): quando a janela começa no DIA DA
  // ABERTURA da visão (antes disso ela valia 0 - ver inicioEhAbertura_),
  // o ponto de partida não é o fechamento desse dia e sim o CUSTO
  // aplicado nele (o fluxo do dia) - o que aconteceu entre a compra e o
  // fechamento do 1º dia também é rendimento (mesma convenção do Gorila:
  // base 0 na véspera da 1ª compra). Sem a flag (default), igual antes.
  if (abertura) {
    const fluxoAbertura = historico[idxBase][campoFluxo];
    if (typeof fluxoAbertura === 'number' && fluxoAbertura > 0) {
      const fatorAbertura = anterior / fluxoAbertura;
      if (fatorAbertura >= 0.5 && fatorAbertura <= 2) {
        cumulativo = fatorAbertura - 1;
        resultado[idxBase] = cumulativo * 100;
      }
    }
  }

  for (let i = idxBase + 1; i < historico.length; i += 1) {
    const v = historico[i][campo];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      resultado[i] = null;
      continue;
    }
    if (anterior) {
      const fluxo = historico[i][campoFluxo] || 0;
      const retornoDiaBruto = (v - fluxo) / anterior - 1;
      // 20/09/2026 (bug real, achado com dados reais do Tiago via
      // tests/harness/ - "Desde o início" de Total/Longo Prazo/Nacional/
      // Renda Fixa Total travado perto de -100% pra sempre, Carteira de
      // Ações em -101% e Renda Emergencial em -100% - comprovado rodando
      // montarSerieHistoricoInicio_ de verdade contra a planilha real):
      // esta conta só é segura quando `v` (valor bruto do dia) JÁ
      // reflete o `fluxo` que está sendo descontado dele - ou seja, as
      // duas fontes nasceram no MESMO instante. Na prática, várias
      // combinações de fonte podem desalinhar isso: o caso mais comum é
      // o fluxo (Transações, data real da compra) chegar um dia (ou
      // mais) ANTES do preço/saldo aparecer em v (aux_historico-
      // patrimonio, sujeito a atraso de backfill do GOOGLEFINANCE -
      // "lacuna" no Registro de Controle; HistoricoInicio.gs!
      // primeiraCompraPorTicker já corrige isso pra Ações/FIIs/Ações
      // EUA, mas nunca cobriu Total/Longo Prazo/Nacional/Renda Fixa) -
      // mas o mesmo tipo de desalinhamento pode nascer de qualquer outra
      // combinação fonte-a-fonte (ex.: duas linhas de Transações Renda
      // Fixa muito próximas no tempo já bastou pra travar
      // "Renda Emergencial" com dado real do Tiago). Quando isso
      // acontece, `v - fluxo` fica artificialmente baixo (às vezes até
      // negativo) só naquele dia - matematicamente equivale a "o
      // mercado caiu quase 100% hoje", o que nunca é real - e como o
      // retorno é COMPOSTO (multiplicativo), um único dia assim TRAVA o
      // acumulado perto de -100% PRA SEMPRE, mesmo que todo o resto da
      // história seja positivo (comprovado com dado real: o 2º dia de
      // toda a carteira, 23/12/2020, já dispara isso sozinho).
      // Em vez de caçar cada combinação fonte-a-fonte que pode
      // desalinhar (jogo de gato-e-rato - o padrão de bug recorrente que
      // motivou pedir o harness de testes, ver tests/harness/README.md),
      // trava aqui, na fórmula em si: nenhum dia sozinho pode implicar
      // um retorno fora da faixa fisicamente plausível pra uma carteira
      // diversificada num único pregão (o pior dia de bolsa já
      // registrado, o "Black Monday" de 1987, foi -20,5% - a faixa até
      // -50%/+100% é generosa o bastante pra nunca recortar um dia real,
      // mas pequena o bastante pra pegar qualquer desalinhamento
      // fonte-a-fonte). Um dia fora da faixa é tratado como "sem dado
      // confiável hoje" (retorno neutro, 0%, em vez de contaminar todo o
      // resto da série) - normalizarSerieRentabilidade.test.js tem os
      // casos com dado real que provam isso.
      const RETORNO_DIARIO_MIN_PLAUSIVEL = -0.5;
      const RETORNO_DIARIO_MAX_PLAUSIVEL = 1;
      const suspeito = retornoDiaBruto < RETORNO_DIARIO_MIN_PLAUSIVEL || retornoDiaBruto > RETORNO_DIARIO_MAX_PLAUSIVEL;
      // 05/10/2026 (A-20, auditoria): o dia fora da faixa continua neutro na
      // CADEIA do % (senão um único dado ruim trava o acumulado em -100%, ver
      // acima), mas deixou de ser um corte SILENCIOSO: fica registrado em
      // `suspeitos` (propriedade não enumerável do resultado) e a tela avisa
      // - o ganho em R$ (calcularResumoRentabilidade) não corta nada, então
      // os dois podem divergir justamente nesses dias.
      if (suspeito) suspeitos.push({ indice: i, data: historico[i].data || null, retorno: retornoDiaBruto * 100 });
      const retornoDia = suspeito ? 0 : retornoDiaBruto;
      cumulativo = (1 + cumulativo) * (1 + retornoDia) - 1;
      resultado[i] = cumulativo * 100;
    } else {
      resultado[i] = null;
    }
    anterior = v;
  }

  return resultado;
}

/** Último valor não-nulo de uma série já normalizada ("% desde o início do
 * período") - usado tanto pro delta do portfólio (renderInfoRentabilidade)
 * quanto pro delta de cada benchmark na legenda (renderGraficoRentabilidade),
 * uma implementação só pros dois nunca divergirem. */
export function ultimoValidoDe_(serieNormalizada) {
  for (let i = serieNormalizada.length - 1; i >= 0; i -= 1) {
    if (serieNormalizada[i] != null) return serieNormalizada[i];
  }
  return null;
}

/** "30/09" - rótulo curto do eixo X (a data inteira vai no título da tooltip). */
function dataCurta_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : '';
}

/** 06/10/2026 (Onda 3): o gráfico (instância da biblioteca) mora no próprio contêiner - redesenhar = `atualizar` (a linha MORFA). */
function destruirGraficoDe_(container) {
  if (container && container._graficoLib) {
    try { container._graficoLib.destruir(); } catch (e) { /* já saiu do DOM */ }
    container._graficoLib = null;
  }
}

/**
 * Desenha o gráfico de Rentabilidade (Portfólio vs benchmarks da visão) em
 * `container` com a biblioteca única de gráficos (assets/js/charts/, kit
 * Figma): linha principal grossa + comparativos pontilhados, crosshair,
 * tooltip escura multilinha com a data, setas do teclado e "ver como tabela".
 * Chamar de novo no mesmo contêiner (troca de período, Atualizar dados) só
 * ATUALIZA a instância - a linha morfa em vez de redesenhar do zero.
 *
 * A legenda (bolinha + nome + o quanto o PORTFÓLIO ganhou ou perdeu EM
 * RELAÇÃO a cada benchmark - ver a correção de 13/09 no cabeçalho do arquivo)
 * é a própria legenda da biblioteca; com `legendaContainer` ela é MOVIDA pra
 * lá (as telas de Carteiras reaproveitam esta função e guardam a legenda num
 * lugar próprio). Some com um aviso, sem lançar, quando não há histórico
 * (ou menos de 2 dias, onde uma linha não diz nada).
 */
export function renderGraficoRentabilidade(doc, container, { historico, visaoId = 'total', periodoId = '12m', legendaContainer, labelPrincipal = 'Portfólio', benchmarksExtra = null, analiseContainer = null, nomeAnalise = null, formatarMoeda = formatBRL, analiseExtra = null, altura = 220 } = {}) {
  // 20/09/2026: campoPrincipal precisa existir ANTES de filtrar - "Desde o
  // início" (periodoId:'tudo') corta pro início desta visão específica
  // (ver comentário de filtrarHistoricoPorPeriodo) - sem isso, o gráfico
  // de FIIs/Ações EUA/Renda Fixa (sub-visões) "desde o início" nascia com
  // anos de linha reta em zero antes da 1ª posição de verdade.
  const campoPrincipal = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const campoFluxoPrincipal = CAMPO_FLUXO_POR_VISAO[visaoId] || CAMPO_FLUXO_POR_VISAO.total;
  // 02/10/2026 (pedido D - IPCA no Patrimônio total de Carteiras):
  // benchmarksExtra acrescenta linhas a uma visão sem mexer nas outras telas.
  const benchmarks = [...(BENCHMARKS_POR_VISAO[visaoId] || BENCHMARKS_POR_VISAO.total), ...(Array.isArray(benchmarksExtra) ? benchmarksExtra : [])];
  const corPrincipal = COR_PRINCIPAL_POR_VISAO[visaoId] || COR_PRINCIPAL_POR_VISAO.total;

  let janela = filtrarHistoricoPorPeriodo(historico, periodoId, campoPrincipal);
  // 23/09/2026 #3 (Controle 8 - Ações EUA em "3 anos": a carteira só existe
  // desde 11/06/2025, mas o S&P 500 era medido desde 24/09/2023 e a legenda
  // comparava o portfólio com ~2 anos a mais de S&P 500): quando a visão nasce DENTRO da janela, o
  // gráfico (portfólio e benchmarks) começa no 1º dia dela - comparar
  // sempre o mesmo intervalo.
  const idxNascimento = primeiroIndiceValidoInicio_(janela, campoPrincipal);
  if (idxNascimento > 0) janela = janela.slice(idxNascimento);
  if (janela.length < 2) {
    destruirGraficoDe_(container);
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    if (legendaContainer) legendaContainer.innerHTML = '';
    if (analiseContainer) renderAnalise(doc, analiseContainer, null);
    return;
  }

  const seriePrincipal = normalizarSerieRentabilidade(janela, campoPrincipal, campoFluxoPrincipal, {
    abertura: inicioEhAbertura_(historico, janela, campoPrincipal, campoFluxoPrincipal),
  });
  const seriesBenchmark = benchmarks.map((b) => {
    const valores = normalizarSerieRentabilidade(janela, b.campo);
    return { ...b, valores, delta: ultimoValidoDe_(valores) };
  });

  // 13/09/2026 (2ª rodada): a % ao lado do benchmark é RELATIVA ao
  // portfólio (retorno do portfólio − retorno do benchmark, mesma
  // série "% desde o início do período") - não o retorno absoluto do
  // próprio benchmark. Positiva = portfólio bateu o benchmark no
  // período; negativa = ficou atrás.
  const deltaPrincipal = ultimoValidoDe_(seriePrincipal);
  const series = [
    { id: 'principal', nome: labelPrincipal, valores: seriePrincipal, principal: true, cor: `var(${corPrincipal})` },
    ...seriesBenchmark.map((b) => {
      const relativo = (typeof deltaPrincipal === 'number' && typeof b.delta === 'number') ? deltaPrincipal - b.delta : null;
      return {
        id: b.campo, nome: b.label, valores: b.valores, principal: false, pontilhada: !!b.dash, cor: `var(${b.cor})`,
        valorLegenda: typeof relativo === 'number' ? formatPercentFromPoints(relativo) : undefined,
        tomLegenda: typeof relativo === 'number' && !variacaoNula(relativo) ? (relativo >= 0 ? 'up' : 'down') : undefined,
      };
    }),
  ];
  const eixoX = janela.map((p) => ({ rotulo: dataCurta_(p.data), data: p.data }));
  const dados = { series, eixoX };

  if (container._graficoLib && container.querySelector('svg')) {
    container._graficoLib.atualizar(dados);
  } else {
    destruirGraficoDe_(container);
    container.innerHTML = '';
    container._graficoLib = criarGraficoLinha(container, {
      ...dados, altura, zero: true, ticksY: 4,
      formatarY: (v) => `${formatNumeroBR(v, 1)}%`, formatarValor: (v) => formatPercentFromPoints(v),
      formatarX: (item) => (item && item.data ? formatDateBR(item.data) : ''),
      aria: `Rentabilidade (% desde o início do período): ${labelPrincipal} contra ${benchmarks.map((b) => b.label).join(' e ')}`,
    });
  }
  if (legendaContainer) {
    const leg = container._graficoLib.casca && container._graficoLib.casca.legenda && container._graficoLib.casca.legenda.el;
    legendaContainer.classList.add('chart', 'chart-legenda-ext');
    if (leg) legendaContainer.replaceChildren(leg);
  }

  // 02/10/2026 (pedido C): card "Análise" embaixo do gráfico - os MESMOS
  // números desenhados (série do portfólio e dos índices já normalizadas),
  // então o texto nunca diverge da legenda. Ver analise-grafico.js.
  if (analiseContainer) {
    renderAnalise(doc, analiseContainer, montarAnaliseRentabilidade_({ historico, janela, seriePrincipal, seriesBenchmark, visaoId, campoPrincipal, campoFluxoPrincipal, periodoId, nomeAnalise, formatarMoeda, analiseExtra }));
  }
}

/** Sujeito das frases do card de Análise, por visão. */
const NOME_ANALISE_POR_VISAO = {
  total: 'O patrimônio total', longoPrazo: 'O longo prazo', nacional: 'O patrimônio nacional', rendaEmergencial: 'A renda emergencial',
  internacional: 'A carteira internacional', carteiraAcoes: 'A carteira de ações', carteiraFiis: 'A carteira de FIIs',
  carteiraAcoesEua: 'A carteira de ações EUA', carteiraAcoesEuaUsd: 'A carteira de ações EUA (em dólar)',
  carteiraRendaFixaTotal: 'A renda fixa', carteiraRendaFixaLongoPrazo: 'O longo prazo da renda fixa', carteiraRendaFixaEmergencial: 'A reserva de emergência',
};

/** De onde veio o resultado (regras "movimento" e "concentração"): [rótulo, campo, campo de fluxo]. */
const COMPONENTES_ANALISE_POR_VISAO = {
  total: [['Ações', 'acoes', 'fluxoCaixaAcoes'], ['FIIs', 'fiis', 'fluxoCaixaFiis'], ['Ações EUA', 'acoesEua', 'fluxoCaixaAcoesEua'], ['Renda Fixa', 'rendaFixaTotal', 'fluxoCaixaRendaFixaTotal']],
  longoPrazo: [['Ações', 'acoes', 'fluxoCaixaAcoes'], ['FIIs', 'fiis', 'fluxoCaixaFiis'], ['Ações EUA', 'acoesEua', 'fluxoCaixaAcoesEua'], ['Renda Fixa', 'rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo']],
  nacional: [['Ações', 'acoes', 'fluxoCaixaAcoes'], ['FIIs', 'fiis', 'fluxoCaixaFiis'], ['Renda Fixa', 'rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo']],
  carteiraRendaFixaTotal: [['Longo prazo', 'rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo'], ['Reserva de emergência', 'rendaEmergencial', 'fluxoCaixaRendaEmergencial']],
};

/** Monta as entradas de analisarSerie a partir do que o gráfico já calculou. */
export function montarAnaliseRentabilidade_({ historico, janela, seriePrincipal, seriesBenchmark, visaoId, campoPrincipal, campoFluxoPrincipal, periodoId, nomeAnalise, formatarMoeda, analiseExtra = null }) {
  // 03/10/2026: `ajuste` = ajuste de marcação da Renda Fixa embutido no fluxo
  // do último ponto (valor da planilha x projeção do histórico - Home.gs e
  // ativo-calc.js): o card diz que é ajuste, não aporte/resgate
  const serie = janela.map((p, i) => ({
    data: p.data, valor: p[campoPrincipal], retorno: seriePrincipal[i], fluxo: p[campoFluxoPrincipal], pregao: p.pregao,
    ajuste: typeof p.ajusteMarcacao === 'number' ? p.ajusteMarcacao : ajusteMarcacaoDoCampo(p, campoPrincipal),
  }));
  const indices = {};
  seriesBenchmark.forEach((b) => {
    indices[b.label] = janela.map((p, i) => ({ data: p.data, retorno: b.valores[i] })).filter((x) => x.retorno != null);
  });
  // contexto: ~6 meses até o fim da janela, só pra medir a oscilação típica
  // (num "Mês atual" de 2 dias não dá pra saber se a queda foi brusca)
  const fimIdx = historico.indexOf(janela[janela.length - 1]);
  let contexto = null;
  let inicioComp = historico.indexOf(janela[0]);
  if (fimIdx > 0) {
    const ctxJanela = historico.slice(Math.max(0, fimIdx - 180), fimIdx + 1);
    const idxNasc = primeiroIndiceValidoInicio_(ctxJanela, campoPrincipal);
    const ctx = idxNasc > 0 ? ctxJanela.slice(idxNasc) : ctxJanela;
    const retCtx = normalizarSerieRentabilidade(ctx, campoPrincipal, campoFluxoPrincipal);
    const indCtx = {};
    seriesBenchmark.forEach((b) => {
      const v = normalizarSerieRentabilidade(ctx, b.campo);
      indCtx[b.label] = ctx.map((p, i) => ({ data: p.data, retorno: v[i] })).filter((x) => x.retorno != null);
    });
    contexto = { serie: ctx.map((p, i) => ({ data: p.data, retorno: retCtx[i], pregao: p.pregao })), indices: indCtx };
    inicioComp = Math.min(inicioComp === -1 ? fimIdx : inicioComp, Math.max(0, fimIdx - 180));
  }
  let componentes = null;
  const defs = COMPONENTES_ANALISE_POR_VISAO[visaoId];
  const fatia = fimIdx >= 0 ? historico.slice(Math.max(0, inicioComp - 1), fimIdx + 1) : janela;
  if (defs && fimIdx >= 0) {
    componentes = {};
    defs.forEach(([rotulo, campo, campoFluxo]) => {
      componentes[rotulo] = fatia.map((p) => ({ data: p.data, valor: p[campo], fluxo: p[campoFluxo] }));
    });
  }
  // 03/10/2026 (Tiago: "Nas análises dos gráficos e métricas dos ativos,
  // considere essas fontes [...] Tenha um largo banco de dados de
  // critérios"): a classe escolhe o benchmark CERTO, as faixas e o prazo
  // mínimo (assets/js/criterios/base-rentabilidade.js); as referências são
  // índices que não estão desenhados mas entram na conta (IPCA pra
  // rentabilidade real, CDI pro Sharpe, IFIX/S&P 500 pro benchmark composto,
  // câmbio pro S&P 500 em R$).
  const referencias = {};
  REFERENCIAS_ANALISE.forEach(([rotulo, campo]) => {
    const l = fatia.filter((p) => typeof p[campo] === 'number' && Number.isFinite(p[campo]) && p[campo] > 0).map((p) => ({ data: p.data, valor: p[campo] }));
    if (l.length >= 2) referencias[rotulo] = l;
  });
  const cambio = fatia.filter((p) => typeof p.cambioUsd === 'number' && p.cambioUsd > 0).map((p) => ({ data: p.data, valor: p.cambioUsd }));
  return analisarSerie({
    serie, indices, periodo: periodoId, contexto, componentes, formatarMoeda,
    nome: nomeAnalise || NOME_ANALISE_POR_VISAO[visaoId] || 'A carteira',
    classe: CLASSE_ANALISE_POR_VISAO[visaoId] || null,
    referencias,
    cambio: cambio.length >= 2 ? cambio : null,
    moeda: /Usd$/.test(visaoId) ? 'USD' : 'BRL',
    benchmarkComponentes: BENCHMARK_COMPONENTES_POR_VISAO[visaoId] || null,
    ...(analiseExtra && typeof analiseExtra === 'object' ? analiseExtra : {}),
  });
}

/** 03/10/2026: classe de cada visão pro card de Análise (benchmark certo, faixas e prazo - ver analise-grafico.js). */
const CLASSE_ANALISE_POR_VISAO = {
  total: 'carteira', longoPrazo: 'carteira', nacional: 'carteira', rendaEmergencial: 'reserva', internacional: 'eua',
  carteiraAcoes: 'acoes', carteiraFiis: 'fiis', carteiraAcoesEua: 'eua', carteiraAcoesEuaUsd: 'eua',
  carteiraRendaFixaTotal: 'rf', carteiraRendaFixaLongoPrazo: 'rf', carteiraRendaFixaEmergencial: 'reserva',
  ativoAcoes: 'ativo-acao', ativoFiis: 'ativo-fii', ativoAcoesEua: 'ativo-eua', ativoAcoesEuaUsd: 'ativo-eua', ativoRendaFixa: 'ativo-rf',
};

/** 03/10/2026: índices do histórico que entram na conta da Análise mesmo sem estar desenhados ([rótulo, campo]). */
const REFERENCIAS_ANALISE = [
  ['CDI', 'indiceCdi'], ['IPCA', 'indiceIpca'], ['Ibovespa', 'ibovespa'], ['IFIX', 'ifix'], ['S&P 500', 'sp500'],
  ['S&P 500 com dividendos (IVVB11)', 'ivvb11'], // HistoricoInicio.gs, depois de rodarBackfillIvvb11Direto()
];

/** 03/10/2026: carteira com várias classes - benchmark composto pelos pesos de cada dia (cada classe no seu índice). */
const BENCHMARK_COMPONENTES_TOTAL_ = { 'Ações': 'Ibovespa', FIIs: 'IFIX', 'Ações EUA': ['S&P 500 com dividendos (IVVB11)', 'S&P 500 em R$'], 'Renda Fixa': 'CDI' };
const BENCHMARK_COMPONENTES_POR_VISAO = {
  total: BENCHMARK_COMPONENTES_TOTAL_, longoPrazo: BENCHMARK_COMPONENTES_TOTAL_,
  nacional: { 'Ações': 'Ibovespa', FIIs: 'IFIX', 'Renda Fixa': 'CDI' },
};

export const LABEL_POR_VISAO_RENTABILIDADE = {
  total: 'Patrimônio total',
  longoPrazo: 'Patrimônio de Longo Prazo',
  nacional: 'Patrimônio Nacional',
  rendaEmergencial: 'Renda Emergencial',
  internacional: 'Ações Internacionais',
  carteiraAcoes: 'Carteira de Ações',
  carteiraFiis: 'Carteira de FIIs',
  carteiraAcoesEua: 'Carteira de Ações EUA',
  carteiraAcoesEuaUsd: 'Carteira de Ações EUA (em dólar)',
  carteiraRendaFixaTotal: 'Carteira total',
  carteiraRendaFixaLongoPrazo: 'Longo prazo',
  carteiraRendaFixaEmergencial: 'Reserva de emergência',
  ativoAcoes: 'Saldo do ativo', ativoFiis: 'Saldo do ativo', ativoAcoesEua: 'Saldo do ativo (em reais)', ativoRendaFixa: 'Saldo do título',
  ativoAcoesEuaUsd: 'Saldo do ativo (em dólar)',
};

/**
 * Renderiza o bloco de info (rótulo + valor atual + variação no período)
 * de UM cartão de Rentabilidade - fica dentro do MESMO cartão do gráfico,
 * reaproveitando o ÚLTIMO ponto da mesma série normalizada que alimenta a
 * linha do gráfico (normalizarSerieRentabilidade, via ultimoValidoDe_)
 * como a "variação no período" - uma fonte só pro número e pro desenho,
 * nunca dois cálculos podendo divergir.
 *
 * 13/09/2026 (3ª rodada): além da %, mostra também o valor em R$
 * ganho/perdido no período - a pedido do Tiago ("quero saber o valor
 * também, quanto ganhei ou perdi"). Calculado a partir dos MESMOS dois
 * pontos brutos (1º valor válido da janela e o último) que já alimentam
 * a % acima - nunca um R$ e uma % contando históricos diferentes.
 */
/**
 * Núcleo de cálculo por trás de renderInfoRentabilidade (extraído em
 * 19/09/2026 pra ser reaproveitado fora da Início - ver
 * carteiras-visao-geral.js!renderHeroStats_, que usa isso com
 * periodoId:'tudo' pro resumo "Investido/Resultado/Rentabilidade" do
 * hero de Carteiras). Devolve os 3 números brutos (valor atual, ganho em
 * R$ já líquido de aporte/retirada - TWR -, e a % correspondente) sem
 * tocar em DOM nenhum - renderInfoRentabilidade só formata isso.
 *
 * Existir separado garante que qualquer tela que precise de um resumo
 * "desde o início" (ou qualquer outro período) sempre usa a MESMA conta
 * já validada contra o Gorilla (ver correção de 13/09/2026 logo abaixo),
 * em vez de cada tela reimplementar sua própria soma de fluxo de caixa -
 * foi exatamente reimplementar essa soma "por fora" (somando
 * card.totalInvestido/lucroPrejuizo dos cards de classe, que só olham
 * pra posição ATUAL, sem realizado nem proventos) que fez o hero de
 * Carteiras sair batendo muito menor do que o Gorilla (uma fração do
 * resultado e da % reais) - bug relatado pelo Tiago em
 * 19/09/2026, ver comentário em renderHeroStats_.
 */
export function calcularResumoRentabilidade(patrimonio, historico, { visaoId = 'total', periodoId = '12m' } = {}) {
  const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const campoFluxo = CAMPO_FLUXO_POR_VISAO[visaoId] || CAMPO_FLUXO_POR_VISAO.total;
  // 23/09/2026 #8: as subpáginas de Carteiras não têm o `patrimonio` da
  // Início (nem uma entrada em VISOES pras visões carteira*) - o valor
  // atual é o último ponto da própria série (que já é o valor ao vivo de
  // hoje, ver HistoricoInicio.gs/Home.gs).
  const valorAtualHoje = patrimonio && VISOES[visaoId] ? resolverVisao(patrimonio, visaoId).valor : ultimoValorDoCampo_(historico, campo);
  // 20/09/2026: mesmo corte de "Desde o início" por visão - ver comentário
  // de filtrarHistoricoPorPeriodo/renderGraficoRentabilidade.
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId, campo);
  // 02/10/2026: período personalizado que termina ANTES de hoje - o valor
  // mostrado é o do fim do intervalo (o "ganho no período" é dele), não o de hoje.
  const ultimoDia = historico && historico.length ? historico[historico.length - 1].data : null;
  const fimJanela = janela.length ? janela[janela.length - 1].data : null;
  const terminaAntes = !!(fimJanela && ultimoDia && fimJanela < ultimoDia);
  const valorAtual = terminaAntes ? ultimoValorDoCampo_(janela, campo) : valorAtualHoje;
  const abertura = janela.length >= 2 && inicioEhAbertura_(historico, janela, campo, campoFluxo);
  const serieNormalizada = janela.length >= 2 ? normalizarSerieRentabilidade(janela, campo, campoFluxo, { abertura }) : [];
  const percentual = ultimoValidoDe_(serieNormalizada);
  const diasSuspeitos = (serieNormalizada.suspeitos || []).map((d) => ({ data: d.data, retorno: d.retorno })); // A-20

  // 13/09/2026 (correção Gorilla): o ganho em R$ também precisa descontar o
  // fluxo de caixa líquido do período (mesma lógica da % acima, TWR) - senão
  // um aporte de R$ 10.000 no meio do período aparecia como "+R$ 10.000" de
  // ganho que nunca existiu. Soma o fluxo de todos os dias DEPOIS da base (o
  // próprio dia-base é o ponto de partida, não conta como fluxo do período) e
  // desconta do delta bruto (valor final - valor base).
  let ganhoReais = null;
  if (janela.length >= 2) {
    const idxBase = primeiroIndiceValidoInicio_(janela, campo);
    if (idxBase !== -1) {
      const base = janela[idxBase][campo];
      let ultimoBruto = null;
      for (let i = janela.length - 1; i >= 0; i -= 1) {
        const v = janela[i][campo];
        if (typeof v === 'number' && Number.isFinite(v)) { ultimoBruto = v; break; }
      }
      if (ultimoBruto != null) {
        let somaFluxo = 0;
        for (let i = idxBase + 1; i < janela.length; i += 1) {
          somaFluxo += janela[i][campoFluxo] || 0;
        }
        // abertura (ver normalizarSerieRentabilidade): a base é 0 na
        // véspera e o aporte do 1º dia entra como fluxo - o ganho vira
        // exatamente "valor de hoje − tudo o que entrou".
        ganhoReais = abertura
          ? ultimoBruto - (janela[idxBase][campoFluxo] || 0) - somaFluxo
          : (ultimoBruto - base) - somaFluxo;
      }
    }
  }

  return { valorAtual, ganhoReais, percentual, dataFim: terminaAntes ? fimJanela : null, diasSuspeitos };
}

/**
 * 24/09/2026 (Tiago: "na home de carteiras, mostre a soma de todos os
 * proventos ... leve em consideração o filtro de gráficos"): soma dos campos
 * diários de provento (proventosAcoes/Fiis/AcoesEua - em R$, no dia do
 * pagamento) na MESMA janela do gráfico - os dias depois da base (igual ao
 * fluxo no ganho em R$: "Mês atual" = os dias deste mês).
 */
export function somarProventosNoPeriodo(historico, periodoId, campoCorte, campos) {
  if (!Array.isArray(historico) || !campos || !campos.length) return null;
  if (!historico.some((p) => campos.some((c) => typeof p[c] === 'number'))) return null;
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId, campoCorte);
  let soma = 0;
  janela.slice(1).forEach((p) => { campos.forEach((c) => { if (typeof p[c] === 'number' && Number.isFinite(p[c])) soma += p[c]; }); });
  return Math.round(soma * 100) / 100;
}

export function renderInfoRentabilidade(doc, container, { patrimonio, historico, visaoId = 'total', periodoId = '12m', label = null, formatarMoeda = formatBRL, camposProventos = null, comparativo = null } = {}) {
  if (!container) return;
  const { valorAtual, ganhoReais, percentual: ultimoValido, dataFim, diasSuspeitos } = calcularResumoRentabilidade(patrimonio, historico, { visaoId, periodoId });

  // 02/10/2026: intervalo personalizado que termina antes de hoje - o valor é o do fim dele
  const sufixoData = dataFim ? ` <span class="rentab-card-em">em ${formatDateBR(dataFim)}</span>` : '';
  container.innerHTML = `
    <div class="rentab-card-label">${label || LABEL_POR_VISAO_RENTABILIDADE[visaoId] || LABEL_POR_VISAO_RENTABILIDADE.total}${sufixoData}</div>
    <div class="rentab-card-value"></div>
    <div class="rentab-card-delta"></div>
  `;
  setValorComDec(container.querySelector('.rentab-card-value'), formatarMoeda(valorAtual));
  // 02/10/2026 (pedido B): "Ontem era" + 3 meses, logo abaixo do valor (ver inicio-comparativo.js)
  if (comparativo) container.insertAdjacentHTML('beforeend', htmlComparativo(comparativo, { formatarMoeda }));

  const deltaEl = container.querySelector('.rentab-card-delta');
  if (typeof ultimoValido === 'number') {
    // 24/09/2026 (Tiago: "lembrando que valor negativo é vermelho"): o R$ e
    // a % têm cor PRÓPRIA cada um. Os dois podem ter sinais diferentes no
    // mesmo período (a % não depende de quanto dinheiro havia em cada
    // momento, o R$ sim - ex.: rendeu bem com pouco dinheiro e perdeu um
    // pouco depois de um aporte grande); antes o bloco inteiro seguia a %,
    // e um "-R$ 107,39" aparecia verde.
    const good = ultimoValido >= 0;
    const misto = typeof ganhoReais === 'number' && Math.abs(ganhoReais) >= 0.005 && (ganhoReais >= 0) !== good;
    deltaEl.className = `rentab-card-delta ${misto ? 'misto' : (variacaoNula(ultimoValido) ? 'na' : (good ? 'good' : 'bad'))}`;
    deltaEl.textContent = '';
    if (typeof ganhoReais === 'number') {
      const reaisEl = doc.createElement('span');
      reaisEl.className = `delta-reais ${ganhoReais >= 0 ? 'good' : 'bad'}`;
      reaisEl.textContent = `${ganhoReais >= 0 ? '+' : '−'}${formatarMoeda(Math.abs(ganhoReais))}`;
      deltaEl.append(reaisEl, ' ');
    }
    const pctEl = doc.createElement('span');
    pctEl.className = `delta-pct ${good ? 'good' : 'bad'}`;
    // 06/10/2026 (kit): variação sempre com ícone de tendência (nunca só cor)
    if (!variacaoNula(ultimoValido)) pctEl.append(icone(doc, good ? 'trending-up' : 'trending-down'));
    pctEl.append(formatPercentFromPoints(ultimoValido));
    deltaEl.append(pctEl, ' no período');
    // 24/09/2026: proventos recebidos na mesma janela (Carteiras)
    const proventos = camposProventos ? somarProventosNoPeriodo(historico, periodoId, CAMPO_PRINCIPAL_POR_VISAO[visaoId] || 'patrimonio', camposProventos) : null;
    if (proventos != null) {
      const sub = doc.createElement('div');
      sub.className = 'rentab-card-sub rentab-card-proventos';
      sub.textContent = `Proventos recebidos no período: ${formatarMoeda(proventos)}`;
      container.append(sub);
    }
    // 05/10/2026 (A-20): dia com variação fora da faixa plausível = dado ruim no histórico; o % o
    // desconsidera (0% naquele dia), o ganho em R$ não - avisa em vez de esconder.
    if (diasSuspeitos && diasSuspeitos.length) {
      const aviso = doc.createElement('div');
      aviso.className = 'rentab-card-sub rentab-card-aviso';
      const exemplos = diasSuspeitos.slice(0, 3).map((d) => `${d.data ? formatDateBR(d.data) : '?'} (${formatPercentFromPoints(d.retorno)})`).join(', ');
      aviso.textContent = `Atenção: ${diasSuspeitos.length} dia${diasSuspeitos.length === 1 ? '' : 's'} com variação fora do normal no histórico (${exemplos}${diasSuspeitos.length > 3 ? '…' : ''}). O % desconsidera ${diasSuspeitos.length === 1 ? 'esse dia' : 'esses dias'}; o ganho em R$ não, então os dois podem divergir.`;
      aviso.title = 'Variação diária fora de -50% a +100%: provável defeito nos dados (preço ou fluxo de caixa desalinhados).';
      container.append(aviso);
    }
  } else {
    deltaEl.className = 'rentab-card-delta na';
    deltaEl.textContent = 'sem histórico suficiente no período';
  }
}

/** 23/09/2026 #8: último valor numérico de `campo` na série (o de hoje). */
function ultimoValorDoCampo_(historico, campo) {
  for (let i = (historico || []).length - 1; i >= 0; i -= 1) {
    const v = historico[i][campo];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * 23/09/2026 #8 (pedido do Tiago: "nos gráficos da carteira, coloque os
 * valores em cima dos gráficos, com os ganhos ou perdas (igual a home) de
 * acordo com o tipo de gráfico"). Resumo do gráfico de EVOLUÇÃO a partir
 * das MESMAS duas linhas que ele desenha (`valores` = Portfólio,
 * `investidos` = Valor aplicado, já recortadas na janela) - nunca uma
 * conta à parte:
 *  - final: último ponto da linha (= valor de hoje);
 *  - variacao / percentual: fim − começo da linha no período (inclui
 *    aporte e retirada - é o quanto a linha subiu/desceu; o ganho SEM
 *    aporte é o do gráfico de Rentabilidade). A tela mostra só o R$;
 *    `percentual` fica pra quem precisar;
 *  - aplicado / diferencaAplicado: fim da linha tracejada e a distância
 *    entre as duas linhas no último dia.
 * null quando a janela tem menos de 2 pontos.
 */
export function calcularResumoEvolucao(valores, investidos = null) {
  const idx = [];
  (valores || []).forEach((v, i) => { if (typeof v === 'number' && Number.isFinite(v)) idx.push(i); });
  if (idx.length < 2) return null;
  const inicial = valores[idx[0]];
  const final = valores[idx[idx.length - 1]];
  const variacao = final - inicial;
  const percentual = inicial ? (variacao / Math.abs(inicial)) * 100 : null;
  const ultInv = investidos ? investidos[idx[idx.length - 1]] : null;
  const aplicado = typeof ultInv === 'number' && Number.isFinite(ultInv) ? ultInv : null;
  return { inicial, final, variacao, percentual, aplicado, diferencaAplicado: aplicado != null ? final - aplicado : null };
}

/** 23/09/2026 #8: bloco "rótulo / R$ valor / ±R$ variação no período /
 * Valor aplicado e ±R$ (±x%) acima/abaixo dele" em cima do gráfico de Evolução - mesmo visual do bloco da
 * Rentabilidade (renderInfoRentabilidade). */
export function renderInfoEvolucao(doc, container, { label = 'Patrimônio', valores, investidos = null, formatarMoeda = formatBRL, comparativo = null, dataFim = null } = {}) {
  if (!container) return;
  const r = calcularResumoEvolucao(valores, investidos);
  container.innerHTML = `
    <div class="rentab-card-label"></div>
    <div class="rentab-card-value"></div>
    <div class="rentab-card-delta"></div>
    <div class="rentab-card-sub"></div>
  `;
  container.querySelector('.rentab-card-label').textContent = label;
  if (dataFim) container.querySelector('.rentab-card-label').insertAdjacentHTML('beforeend', ` <span class="rentab-card-em">em ${formatDateBR(dataFim)}</span>`);
  // 02/10/2026 (pedido B): "Ontem era" + 3 meses (ver inicio-comparativo.js)
  if (comparativo && r) container.querySelector('.rentab-card-delta').insertAdjacentHTML('afterend', htmlComparativo(comparativo, { formatarMoeda }));
  const deltaEl = container.querySelector('.rentab-card-delta');
  const subEl = container.querySelector('.rentab-card-sub');
  if (!r) {
    container.querySelector('.rentab-card-value').textContent = '—';
    deltaEl.className = 'rentab-card-delta na';
    deltaEl.textContent = 'sem histórico suficiente no período';
    subEl.remove();
    return;
  }
  setValorComDec(container.querySelector('.rentab-card-value'), formatarMoeda(r.final));
  const sinal = (v) => (v >= 0 ? '+' : '−');
  deltaEl.className = `rentab-card-delta ${Math.abs(r.variacao) < 0.005 ? 'na' : (r.variacao >= 0 ? 'good' : 'bad')}`;
  // Sem % na variação da linha: com aporte no meio, "subiu 5.000%" (desde
  // o início) não diz nada - o % que importa aqui é a distância pro Valor
  // aplicado; o rendimento do período (sem aporte) é o do gráfico de
  // Rentabilidade.
  deltaEl.textContent = `${sinal(r.variacao)}${formatarMoeda(Math.abs(r.variacao))} no período`;
  if (r.aplicado != null) {
    const pctAplicado = r.aplicado ? ` ${formatPercentFromPoints((r.diferencaAplicado / Math.abs(r.aplicado)) * 100)}` : '';
    subEl.textContent = `com aportes e retiradas · Valor aplicado: ${formatarMoeda(r.aplicado)} · ${sinal(r.diferencaAplicado)}${formatarMoeda(Math.abs(r.diferencaAplicado))}${pctAplicado} ${r.diferencaAplicado >= 0 ? 'acima' : 'abaixo'} do aplicado`;
  } else {
    subEl.textContent = 'com aportes e retiradas';
  }
}

/** 02/10/2026: { min, max } (1º e último dia do histórico) - datas do
 * calendário de "Escolher período" fora disso ficam desabilitadas. */
export function limitesDoHistorico_(historico) {
  if (!Array.isArray(historico) || !historico.length) return null;
  const min = historico[0] && historico[0].data;
  const max = historico[historico.length - 1] && historico[historico.length - 1].data;
  return typeof min === 'string' && typeof max === 'string' ? { min, max } : null;
}

/** 02/10/2026 (pedido C): onde o card de Análise de um painel mora -
 * `analiseContainer` explícito, ou (analise:true) um <div> criado 1x logo
 * depois da legenda (ou do gráfico). */
function slotAnalise_(doc, painel) {
  if (painel.analiseContainer) return painel.analiseContainer;
  if (!painel.analise) return null;
  const ancora = painel.legendaContainer || painel.chartContainer;
  if (!ancora || !ancora.parentNode) return null;
  if (ancora._agSlot && ancora._agSlot.parentNode) return ancora._agSlot;
  const slot = doc.createElement('div');
  slot.className = 'ag-slot';
  ancora.parentNode.insertBefore(slot, ancora.nextSibling);
  ancora._agSlot = slot;
  return slot;
}

/** 02/10/2026 (pedido B): "Ontem era" + meses do painel da Início/Carteiras -
 * o valor de referência é o MESMO que o bloco mostra (ao vivo, hoje) e o
 * "ontem" de hoje vem pronto do back-end quando a visão tem (resposta.ontem). */
function comparativoDoPainel_(estado, visaoId) {
  const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const janela = filtrarHistoricoPorPeriodo(estado.historico, estado.periodoAtual, campo);
  const chaveOntem = { total: 'total', longoPrazo: 'longoPrazo', nacional: 'nacional', rendaEmergencial: 'rendaEmergencial' }[visaoId];
  const valorReferencia = estado.patrimonio && VISOES[visaoId] ? resolverVisao(estado.patrimonio, visaoId).valor : null;
  const ontemValor = chaveOntem && estado.ontem && typeof estado.ontem[chaveOntem] === 'number' ? estado.ontem[chaveOntem] : null;
  return calcularComparativo(estado.historico, campo, estado.periodoAtual, { janela, valorReferencia, ontemValor });
}

/**
 * Liga o seletor de período segmentado (#periodoTabs) - um filtro só, compartilhado
 * pelos 3 cartões de Rentabilidade (Total/Longo Prazo/Renda Emergencial),
 * sempre visíveis ao mesmo tempo. `paineis` é um array com um item por
 * visão - { visaoId, chartContainer, legendaContainer, infoContainer } -
 * cada um é atualizado (info + gráfico) no mesmo clique de período, sem
 * buscar nada de novo (historico/patrimonio já vieram inteiros na 1ª
 * chamada). periodoInicial deve bater com o pill marcado "active" no HTML
 * (14/09/2026: default trocado de "12m" pra "mes", a pedido do Tiago -
 * montarPaginaInicio agora passa periodoInicial:'mes' explicitamente, e o
 * default do parâmetro também foi atualizado pra "mes" por segurança, caso
 * algum outro chamador não passe o valor).
 *
 * 14/09/2026 (botão "Atualizar dados" + timer automático - ver
 * shell.js!mountRefreshControl): montarPaginaInicio agora pode chamar
 * esta função várias vezes na vida da página (1 vez por carga de dado
 * novo), sempre com o MESMO periodoTabsContainer (elemento estático do
 * HTML, nunca recriado). Só a 1ª chamada liga os listeners de clique e
 * resize de verdade - guardado em `periodoTabsContainer._graficoEstado`;
 * chamadas seguintes só atualizam esse estado (patrimonio/historico/
 * paineis novos) e redesenham, sem religar nada (religar de novo a cada
 * refresh duplicaria o listener, e cada clique/resize futuro dispararia
 * o redesenho N vezes). Os listeners já ligados sempre leem o estado
 * mais recente através do objeto `estado` (nunca duma variável capturada
 * na 1ª chamada), por isso continuam corretos depois de um refresh.
 */
export function wireGraficoRentabilidade(doc, { patrimonio, historico, periodoTabsContainer, paineis = [], periodoInicial = 'mes', periodoPersonalizado = null, ontem = null } = {}) {
  // 02/10/2026 (pedido A): o filtro de período agora é o controlador de
  // periodo-personalizado.js (presets + chip "Escolher período" quando
  // `periodoPersonalizado` vem - { chave } pro localStorage). Sem a opção, só
  // os presets, exatamente como antes (ex.: telas que ainda não integraram).
  const limites = limitesDoHistorico_(historico);
  const chavePeriodo = typeof periodoPersonalizado === 'string' ? periodoPersonalizado : (periodoPersonalizado && periodoPersonalizado.chave) || null;
  if (periodoTabsContainer && periodoTabsContainer._graficoEstado) {
    const estado = periodoTabsContainer._graficoEstado;
    estado.patrimonio = patrimonio;
    estado.historico = historico;
    estado.paineis = paineis;
    estado.ontem = ontem;
    const filtro = ligarFiltroPeriodo(doc, periodoTabsContainer, { chave: chavePeriodo, comChip: !!periodoPersonalizado, periodoInicial, limites });
    if (filtro) estado.periodoAtual = filtro.periodo;
    estado.atualizar();
    return;
  }

  const estado = { patrimonio, historico, paineis, periodoAtual: periodoInicial, ontem };

  estado.atualizar = function atualizar() {
    estado.paineis.forEach((painel) => {
      const { visaoId, chartContainer, legendaContainer, infoContainer, labelInfo, formatarMoeda, camposProventos, labelPrincipal } = painel;
      const moeda = formatarMoeda || formatBRL;
      renderInfoRentabilidade(doc, infoContainer, {
        patrimonio: estado.patrimonio, historico: estado.historico, visaoId, periodoId: estado.periodoAtual, label: labelInfo, formatarMoeda: moeda, camposProventos: camposProventos || null,
        comparativo: painel.comparativo ? comparativoDoPainel_(estado, visaoId) : null,
      });
      if (chartContainer) {
        renderGraficoRentabilidade(doc, chartContainer, {
          historico: estado.historico, visaoId, periodoId: estado.periodoAtual, legendaContainer, labelPrincipal: labelPrincipal || undefined,
          benchmarksExtra: painel.benchmarksExtra || null,
          analiseContainer: slotAnalise_(doc, painel),
          nomeAnalise: painel.nomeAnalise || null,
          analiseExtra: painel.analiseExtra || null, // 03/10/2026: opções extras do card de Análise (rf, proventos a receber...)
          formatarMoeda: moeda,
        });
      }
    });
  };

  if (periodoTabsContainer) {
    periodoTabsContainer._graficoEstado = estado;
    const filtro = ligarFiltroPeriodo(doc, periodoTabsContainer, {
      chave: chavePeriodo,
      comChip: !!periodoPersonalizado,
      periodoInicial,
      limites,
      aoMudar(periodo) {
        estado.periodoAtual = periodo;
        estado.atualizar();
      },
    });
    if (filtro) estado.periodoAtual = filtro.periodo;
  }

  // 06/10/2026 (Onda 3): sem ouvir "resize" nem a troca de fonte - os gráficos da biblioteca acompanham a largura do
  // cartão sozinhos (ResizeObserver) e redesenham sem recriar.
  estado.atualizar();
}

// ============================================================================
// Grade "Meus Ativos"
// ============================================================================

const CLASSE_LABEL_ATIVO = { acoes: 'Ação', fiis: 'FII', usa: 'EUA', rf: 'RF' };

/**
 * Linhas do tooltip de hover/touch de cada .ativo-card, por classe - layout
 * validado em docs/direcao-visual.html e decisão registrada em
 * docs/mapa-paginas.html ("Card de Meus Ativos ganha ... tooltip de hover
 * por classe: Nome, Quantidade, Preço Teto, Preço Médio, Descontos sobre
 * P/VP e P/L pra Ações/FIIs/USA; Tipo em vez de P/L pra FIIs; Tipo de
 * investimento/Indexador/Vencimento/Valor atualizado pra Renda Fixa").
 * descontoPVp/descontoPL já vêm como texto pronto do back-end
 * (MeusAtivos.gs) - "173% (1,73 P/VP)" - por isso entram direto, sem
 * formatador. Ações EUA ainda não tem P/L na planilha (só P/VP) - por
 * isso a linha de Desconto sobre P/L só aparece quando o dado existe.
 */
function linhasTooltipAtivo_(ativo) {
  const linhas = [];
  if (ativo.classe === 'rf') {
    linhas.push(['Tipo de investimento', ativo.tipoInvestimento || '—']);
    linhas.push(['Indexador', ativo.indexador || '—']);
    linhas.push(['Vencimento', ativo.vencimento || '—']);
    linhas.push(['Valor atualizado', formatBRL(ativo.valorAtualizado)]);
    return linhas;
  }
  linhas.push(['Nome', ativo.nome || ativo.ticker]);
  if (ativo.classe === 'fiis') {
    linhas.push(['Tipo', ativo.tipo || '—']);
    linhas.push(['Preço médio', formatBRL(ativo.precoMedio)]);
    linhas.push(['Quantidade de cotas', formatNumeroBR(ativo.quantidade, 0)]);
  } else if (ativo.classe === 'usa') {
    linhas.push(['Quantidade de ações', formatNumeroBR(ativo.quantidade, 0)]);
    linhas.push(['Preço teto', valorComConversaoBRL_(ativo.precoTeto, ativo.precoTetoBRL, formatUSD)]);
    linhas.push(['Preço médio', valorComConversaoBRL_(ativo.precoMedio, ativo.precoMedioBRL, formatUSD)]);
  } else {
    linhas.push(['Quantidade de ações', formatNumeroBR(ativo.quantidade, 0)]);
    linhas.push(['Preço teto', formatBRL(ativo.precoTeto)]);
    linhas.push(['Preço médio', formatBRL(ativo.precoMedio)]);
  }
  if (ativo.descontoPVp) linhas.push(['Desconto sobre P/VP', ativo.descontoPVp]);
  if (ativo.descontoPL) linhas.push(['Desconto sobre P/L', ativo.descontoPL]);
  return linhas;
}

/** "US$ 12,34 (R$ 66,12)" - valor principal em USD (Ações EUA) com o
 * equivalente em R$ menor do lado, mesmo padrão já usado no preço do
 * cartão (.ativo-price-conv). Sem câmbio disponível, mostra só o USD. */
function valorComConversaoBRL_(valorPrincipal, valorBRL, formatterPrincipal) {
  const texto = formatterPrincipal(valorPrincipal);
  if (typeof valorBRL !== 'number' || !Number.isFinite(valorBRL)) return texto;
  return `${texto} <span class="tt-conv">(${formatBRL(valorBRL)})</span>`;
}

/** Monta o HTML inteiro do tooltip (cabeçalho com ticker+classe + linhas). */
function tooltipInnerHtmlAtivo_(ativo) {
  const linhasHtml = linhasTooltipAtivo_(ativo).map(([label, valor]) => `
    <div class="tt-row"><span class="tt-k">${label}</span><span class="tt-v">${valor}</span></div>
  `).join('');
  return `<div class="tt-head">${ativo.ticker} <span class="tt-cat">${CLASSE_LABEL_ATIVO[ativo.classe] || ativo.classe}</span></div>${linhasHtml}`;
}



/**
 * Cria um .ativo-card - cartão inteiro é o link pro Detalhe do Ativo
 * (ativo/index.html?ref=..., ver link-ativo.js - 25/09/2026), sem link externo
 * separado, mesmo padrão já aplicado aos widget-tiles de índices/câmbio.
 * Renda Fixa não tem preço-teto (não existe preço-teto pra título de renda
 * fixa) nem viés - mostra o saldo atualizado no lugar do preço, e o
 * indexador/vencimento no lugar do desconto sobre P/VP ou P/L.
 */
export function criarAtivoCard(doc, ativo, { favorito = false } = {}) {
  const card = doc.createElement('a');
  card.className = `ativo-card ${ativo.classe}`;
  card.href = urlAtivo(refAtivo(ativo)); // 25/09/2026: tela Detalhe do ativo (ativo/index.html)

  const viesHtml = ativo.vies
    ? `<span class="vies-badge chip-tonal ${ativo.vies === 'comprar' ? 'chip-good' : 'chip-warn'} ${ativo.vies}">${ativo.vies === 'comprar' ? 'Comprar' : 'Aguardar'}</span>`
    : '';

  let precoHtml;
  let deltaHtml;
  let detalheHtml;

  // 06/10/2026 (kit): variação do dia com ícone de tendência (nunca só cor) - 0,00% é neutro
  const deltaDoDia = () => {
    const tem = typeof ativo.variacaoDia === 'number' && Number.isFinite(ativo.variacaoDia);
    if (!tem) return '<div class="ativo-delta na">—</div>';
    const nulo = variacaoNula(ativo.variacaoDia, { fracao: true });
    const sobe = ativo.variacaoDia >= 0;
    const tom = nulo ? 'na' : (sobe ? 'good' : 'bad');
    const ico = nulo ? 'trending-flat' : (sobe ? 'trending-up' : 'trending-down');
    return `<div class="ativo-delta ${tom}"><svg class="ico" aria-hidden="true"><use href="#ico-${ico}"/></svg>${formatPercentFromFraction(ativo.variacaoDia)} <span class="dim">hoje</span></div>`;
  };

  if (ativo.classe === 'rf') {
    precoHtml = `<div class="ativo-price"></div>`;
    deltaHtml = typeof ativo.variacaoDia === 'number' && Number.isFinite(ativo.variacaoDia) ? deltaDoDia() : '';
    detalheHtml = `<div class="ativo-detalhe">${[ativo.indexador, ativo.vencimento ? `vence ${ativo.vencimento}` : null].filter(Boolean).join(' · ')}</div>`;
  } else {
    precoHtml = `<div class="ativo-price"></div>`;
    deltaHtml = deltaDoDia();
    const desconto = ativo.classe === 'usa' || ativo.classe === 'acoes' ? ativo.descontoPL : ativo.descontoPVp;
    detalheHtml = desconto ? `<div class="ativo-detalhe">Desconto: ${desconto}</div>` : '';
  }

  card.innerHTML = `
    <div class="ativo-card-top">
      ${ativo.classe === 'rf' ? '' : logoCirculoHtml(ativo.ticker)}
      <div class="ativo-id">
        <span class="ativo-ticker">${ativo.ticker}</span>
        <span class="ativo-classe ${ativo.classe}">${CLASSE_LABEL_ATIVO[ativo.classe] || ativo.classe}</span>
      </div>
      ${viesHtml}
    </div>
    ${precoHtml}
    ${deltaHtml}
    ${detalheHtml}
    <div class="ativo-card-acoes">
      ${htmlBotaoFavorito(ativo, favorito)}
      <span class="ativo-grafico-icon" role="button" tabindex="0" aria-label="Ver gráfico de preço" title="Ver gráfico de preço"><svg class="ico" aria-hidden="true"><use href="#ico-show-chart"/></svg></span>
      <span class="ativo-info-icon" role="button" tabindex="0" aria-label="Informações rápidas" title="Informações rápidas"><svg class="ico" aria-hidden="true"><use href="#ico-info"/></svg></span>
    </div>
  `;

  const precoEl = card.querySelector('.ativo-price');
  if (ativo.classe === 'rf') {
    setValorComDec(precoEl, formatBRL(ativo.valorAtualizado));
  } else if (ativo.classe === 'usa') {
    setValorComDec(precoEl, formatUSD(ativo.precoAtual));
    if (typeof ativo.precoAtualBRL === 'number') {
      const conv = doc.createElement('span');
      conv.className = 'ativo-price-conv';
      conv.textContent = ` (${formatBRL(ativo.precoAtualBRL)})`;
      precoEl.appendChild(conv);
    }
  } else {
    setValorComDec(precoEl, formatBRL(ativo.precoAtual));
  }

  // Guarda o ativo inteiro no próprio nó (não só o ticker em dataset) pra
  // wireTooltipAtivos ler direto na hora do hover/touch, sem precisar
  // reconsultar a lista de ativos - ver wireTooltipAtivos logo abaixo.
  card._ativoTooltip = ativo;

  return card;
}

/**
 * Liga o tooltip de hover/touch de cada .ativo-card (Nome, Quantidade,
 * Preço Teto/Médio, Descontos sobre P/VP e P/L, ou os campos de Renda
 * Fixa - ver linhasTooltipAtivo_ acima). Mesma técnica de Pointer Events
 * (mouse + touch com a mesma API) já usada no gráfico de Rentabilidade
 * (ver ligarInteracaoGrafico_), mas aqui é 1 tooltip só, position:fixed,
 * anexado a doc.body e reposicionado por delegação de evento no
 * `container` (a grade inteira) - porque o conteúdo do container é
 * substituído a cada clique nas abas de classe (wireFiltroAtivos), mas o
 * próprio container nunca é recriado, então ligar aqui uma vez só (na
 * mesma chamada que já liga o filtro, em montarPaginaInicio) é suficiente
 * pra qualquer cartão, mesmo depois de trocar de aba.
 */
export function wireTooltipAtivos(doc, container) {
  if (!container || container._tooltipWired) return;
  container._tooltipWired = true;
  const janela = doc.defaultView;
  const tooltip = doc.createElement('div');
  tooltip.className = 'ativo-tooltip';
  tooltip.hidden = true;
  (doc.body || container).appendChild(tooltip);

  // cardAberto: só usado no toque (touch/pen) - guarda qual .ativo-card
  // está com a tooltip aberta por toque, pra 1) o 2º toque no mesmo "i"
  // fechar (alternar) e 2) o listener de "toque fora" (mais abaixo) saber
  // o que fechar. No mouse/hover isso fica sempre null (esconder_ já
  // cuida de tudo via pointerleave, como sempre foi).
  let cardAberto = null;

  function esconder_() {
    tooltip.hidden = true;
    cardAberto = null;
  }

  function mostrar_(card, clientX, clientY) {
    const ativo = card._ativoTooltip;
    if (!ativo) {
      esconder_();
      return;
    }
    tooltip.innerHTML = tooltipInnerHtmlAtivo_(ativo);
    tooltip.hidden = false;

    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let esquerda = clientX + 16;
    let topo = clientY + 16;
    if (esquerda + tw > larguraJanela - 12) esquerda = clientX - tw - 16;
    if (topo + th > alturaJanela - 12) topo = clientY - th - 16;
    tooltip.style.left = `${esquerda}px`;
    tooltip.style.top = `${topo}px`;
  }

  /**
   * pointerType 'touch'/'pen': o cartão inteiro é um <a href> (navega pro
   * Detalhe do Ativo), então no toque só o ícone ".ativo-info-icon" abre
   * a tooltip (não o cartão inteiro, senão qualquer toque pra navegar
   * mostraria a tooltip de relance antes de sair da página) - e
   * pointerdown alterna (2º toque no mesmo ícone fecha) em vez de só
   * mostrar, porque toque não tem "hover sustentado" pra saber quando
   * esconder. O fechamento por toque-fora fica com aoTocarFora_ abaixo.
   * Mouse/outros: continua exatamente como antes (hover no cartão
   * inteiro mostra, pointerleave esconde) - nenhum teste que já passava
   * com pointerType não informado (o default do PointerEvent) pode
   * quebrar.
   */
  function aoMoverOuTocar_(ev) {
    // 23/09/2026: grade de favoritos em modo edição (arrastando) - sem tooltip
    if (container.classList && container.classList.contains('editando')) {
      esconder_();
      return;
    }
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
      if (ev.type !== 'pointerdown') return;
      const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-info-icon') : null;
      if (!icone) return;
      const card = icone.closest('.ativo-card');
      if (!card) return;
      if (cardAberto === card) {
        esconder_();
        return;
      }
      cardAberto = card;
      mostrar_(card, ev.clientX, ev.clientY);
      return;
    }
    const card = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-card') : null;
    if (!card) {
      esconder_();
      return;
    }
    mostrar_(card, ev.clientX, ev.clientY);
  }

  function aoSairPonteiro_(ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return;
    esconder_();
  }

  /** Toque fora do cartão aberto (e fora da própria tooltip) fecha - "se
   * eu clico fora, o tooltip some" (pedido do Tiago, 16/09/2026). Alheio
   * ao toque (cardAberto null) não faz nada, então nunca interfere no
   * fluxo de mouse/hover de cima. */
  function aoTocarFora_(ev) {
    if (!cardAberto) return;
    const alvo = ev.target;
    if (tooltip.contains(alvo) || cardAberto.contains(alvo)) return;
    esconder_();
  }

  /** O ícone "i" nunca deve navegar (é dentro do <a> do cartão) - clique
   * (mouse ou o "click" sintético que o toque dispara depois do
   * pointerup) é sempre bloqueado, pra abrir/fechar a tooltip sem sair
   * da página. */
  function aoClicarIcone_(ev) {
    const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-info-icon') : null;
    if (!icone) return;
    ev.preventDefault();
    ev.stopPropagation();
  }

  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', aoSairPonteiro_);
  container.addEventListener('click', aoClicarIcone_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

/**
 * Liga o botão de gráfico (.ativo-grafico-icon, rodapé de cada
 * .ativo-card - ver criarAtivoCard) a um popover ("alertinha", pedido
 * do Tiago) com o gráfico de preço do ativo. Ao contrário da tooltip de
 * info (wireTooltipAtivos, que mistura hover-no-mouse com toque-no-
 * ícone), aqui é sempre "clique/toque pra abrir, clique/toque de novo
 * (ou fora, ou no X) pra fechar" nos dois - um só listener de `click`
 * cobre mouse E o clique sintético que o toque dispara depois do
 * pointerup, sem precisar checar pointerType. Nunca navega pro Detalhe
 * do Ativo (preventDefault+stopPropagation, mesmo motivo do ícone "i").
 * 1 popover só, criado 1x e reposicionado por cartão - mesma técnica de
 * wireTooltipAtivos/wirePointerTooltipDistrib_.
 *
 * 17/09/2026 (1ª fatia - só o posicionamento/interação dos 3 "gatilhos"
 * do cartão, pedido do Tiago: "quero só reavaliar os botões, onde
 * colocá-los", antes de mexer em dado de verdade): o CORPO do popover
 * ainda é um placeholder ("gráfico chegando em breve") - buscar o
 * histórico de preço de verdade (endpoint novo no Apps Script, lendo
 * aux_historico-patrimonio, que já tem o preço de fechamento diário de
 * cada ticker) fica pra próxima rodada, depois que o encaixe do botão
 * em si estiver validado no desktop e no mobile.
 */
/** Rótulos/ids dos filtros de período do gráfico de preço do ativo -
 * MESMO conjunto/ordem usado no filtro de período da Rentabilidade
 * (#periodoTabs, pages.html) - pedido explícito do Tiago (17/09/2026):
 * "Siga o filtro que usamos na sessao Rentabilidade, onde o default é
 * mes atual". Gerado aqui em JS (não em pages.html) porque o popover
 * inteiro é montado dinamicamente - 1 popover só, reaproveitado pra
 * qualquer card, nunca um HTML estático por ativo. */
const PERIODOS_GRAFICO_ATIVO = ['mes', '30d', '6m', '12m', '3a', 'tudo'].map((id) => ({ id, label: rotuloPeriodo(id) }));

/**
 * Desenha o gráfico de PREÇO BRUTO (não %) de 1 ativo só, dentro do
 * popover "Ver gráfico" (pedido do Tiago, 17/09/2026: "Preço bruto (R$
 * ou US$, conforme o ativo)"). 06/10/2026 (Onda 3): agora com a biblioteca
 * única de gráficos (linha + área suave, crosshair, tooltip escura); trocar
 * de período só atualiza a instância (a linha morfa). A série (`serie`,
 * vinda de getHistoricoAtivo) já está na unidade final (preço cru).
 */
function renderGraficoPrecoAtivo_(doc, container, { serie, periodoId = 'mes', formatMoeda }) {
  const janela = filtrarHistoricoPorPeriodo(serie, periodoId);
  if (janela.length < 2) {
    destruirGraficoDe_(container);
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    return;
  }
  const dados = {
    series: [{ id: 'preco', nome: 'Preço', valores: janela.map((item) => item.preco), cor: 'var(--md-sys-color-primary)', area: true }],
    eixoX: janela.map((p) => ({ rotulo: dataCurta_(p.data), data: p.data })),
  };
  if (container._graficoLib && container.querySelector('svg')) {
    container._graficoLib.atualizar(dados);
    return;
  }
  destruirGraficoDe_(container);
  container.innerHTML = '';
  container._graficoLib = criarGraficoLinha(container, {
    ...dados, altura: 160, ticksY: 3, area: true, legenda: false, botaoTabela: false, maxRotulosX: 3,
    formatarY: (v) => formatNumeroBR(v, 2), formatarValor: (v) => formatMoeda(v),
    formatarX: (item) => (item && item.data ? formatDateBR(item.data) : ''),
    aria: 'Preço do ativo no período',
  });
}

/**
 * Monta o corpo "carregado" do popover: filtro de período (segmentado,
 * mesmo componente/CSS de #periodoTabs) + o gráfico de preço bruto.
 * `serie` já veio inteira do back-end (getHistoricoAtivo) numa única
 * chamada - trocar de período aqui é só filtrar/redesenhar em memória,
 * sem nova chamada de rede (mesmo padrão de wireGraficoRentabilidade).
 */
function montarCorpoGraficoAtivo_(doc, corpo, { ativo, serie }) {
  corpo.innerHTML = `
    <div class="ativo-grafico-periodo">${botoesSegmentadoHtml(PERIODOS_GRAFICO_ATIVO.map(({ id }) => id), 'mes')}</div>
    <div class="ativo-grafico-chart-wrap"></div>
  `;

  const chartWrap = corpo.querySelector('.ativo-grafico-chart-wrap');
  const formatMoeda = ativo.classe === 'usa' ? formatUSD : formatBRL;

  function redesenhar_(periodoId) {
    renderGraficoPrecoAtivo_(doc, chartWrap, { serie, periodoId, formatMoeda });
  }

  // 02/10/2026 (pedido A): mesmo filtro com "Escolher período" dos outros
  // gráficos - o calendário só deixa escolher dias que a série do ativo tem.
  const filtro = ligarFiltroPeriodo(doc, corpo.querySelector('.ativo-grafico-periodo'), {
    chave: 'inicio.graficoAtivo',
    periodoInicial: 'mes',
    limites: limitesDoHistorico_(serie),
    aoMudar: redesenhar_,
  });
  redesenhar_(filtro ? filtro.periodo : 'mes');
}

/**
 * Liga o popover "Ver gráfico" de cada .ativo-card (ícone
 * .ativo-grafico-icon, criarAtivoCard) - 1 popover só, reaproveitado
 * pra qualquer card (mesmo padrão de wireTooltipAtivos), criado 1 vez
 * (idempotente via container._graficoWired) e reposicionado/redesenhado
 * a cada clique. `token` é passado pelo orquestrador (montarPaginaInicio)
 * pra buscar o histórico (getHistoricoAtivoImpl, injetável pra teste).
 *
 * 17/09/2026 (2ª rodada - pedido do Tiago: "continue com os gráficos
 * dos cards"): busca sob demanda (getHistoricoAtivo, ver api-client.js)
 * na 1ª vez que o popover de um ticker abre - o resultado fica em cache
 * no próprio nó do card (`card._historicoAtivoSerie`) pras aberturas
 * seguintes do MESMO card não baterem na rede de novo (a série inteira
 * já veio, trocar de período é só filtrar em memória - ver
 * montarCorpoGraficoAtivo_). `aberturaId` (incrementado a cada
 * mostrar_/esconder_) descarta uma resposta que chega depois do usuário
 * já ter fechado o popover ou aberto outro card - sem isso, uma busca
 * lenta do card A poderia sobrescrever o card B já aberto.
 *
 * Renda Fixa (ativo.classe==='rf') não tem preço diário por ticker
 * nesse formato (aux_historico-patrimonio guarda saldo pra RF, não
 * cotação de mercado - ver cabeçalho de apps-script/HistoricoAtivo.gs);
 * o ícone continua visível em todo card (evita UI que muda de forma por
 * classe), mas mostra um aviso direto, sem tentar buscar.
 */
export function wireGraficoAtivo(doc, container, { token, getHistoricoAtivoImpl = getHistoricoAtivo } = {}) {
  if (!container || container._graficoWired) return;
  container._graficoWired = true;

  const popover = doc.createElement('div');
  popover.className = 'ativo-grafico-popover';
  popover.hidden = true;
  popover.innerHTML = `
    <div class="ativo-grafico-popover-head">
      <span class="ativo-grafico-popover-ticker"></span>
      <button type="button" class="ativo-grafico-popover-fechar" aria-label="Fechar"><svg class="ico" aria-hidden="true"><use href="#ico-close"/></svg></button>
    </div>
    <div class="ativo-grafico-popover-corpo"></div>
  `;
  (doc.body || container).appendChild(popover);

  let cardAberto = null;
  let aberturaId = 0;

  function esconder_() {
    popover.hidden = true;
    cardAberto = null;
    aberturaId += 1; // invalida qualquer busca em andamento (ver mostrar_)
  }

  /** position:fixed ancorado no ícone clicado - mesma lógica de "não
   * deixa vazar da tela" já usada em mostrar_ (ativo-tooltip acima) e
   * mostrar_ (info-tooltip, wirePointerTooltipDistrib_), adaptada pra
   * abrir colado embaixo do ícone (não seguindo o ponteiro). */
  function posicionar_(icone) {
    const janela = doc.defaultView;
    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const rect = icone.getBoundingClientRect();
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    let esquerda = rect.right - pw;
    if (esquerda < 12) esquerda = 12;
    if (esquerda + pw > larguraJanela - 12) esquerda = larguraJanela - pw - 12;
    let topo = rect.bottom + 8;
    if (topo + ph > alturaJanela - 12) topo = rect.top - ph - 8;
    popover.style.left = `${esquerda}px`;
    popover.style.top = `${topo}px`;
  }

  function mostrar_(icone, card) {
    const ativo = card._ativoTooltip;
    const corpo = popover.querySelector('.ativo-grafico-popover-corpo');
    popover.querySelector('.ativo-grafico-popover-ticker').textContent = ativo ? ativo.ticker : '';
    popover.hidden = false;
    posicionar_(icone);
    cardAberto = card;

    const minhaAbertura = (aberturaId += 1);

    if (!ativo) {
      corpo.innerHTML = '<div class="ativo-grafico-popover-hint"><p class="hint">Ativo não encontrado.</p></div>';
      return;
    }

    if (ativo.classe === 'rf') {
      corpo.innerHTML = '<div class="ativo-grafico-popover-hint"><p class="hint">Gráfico de preço não disponível para Renda Fixa.</p></div>';
      return;
    }

    if (card._historicoAtivoSerie) {
      montarCorpoGraficoAtivo_(doc, corpo, { ativo, serie: card._historicoAtivoSerie });
      return;
    }

    corpo.innerHTML = '<div class="ativo-grafico-popover-hint"><p class="hint">Carregando…</p></div>';

    getHistoricoAtivoImpl(token, ativo.ticker).then((resposta) => {
      if (minhaAbertura !== aberturaId) return; // popover fechou/trocou de card enquanto buscava
      if (!resposta.ok || !resposta.resultado) {
        corpo.innerHTML = '<div class="ativo-grafico-popover-hint"><p class="hint">Não deu pra carregar o histórico agora.</p></div>';
        return;
      }
      card._historicoAtivoSerie = resposta.resultado.serie || [];
      montarCorpoGraficoAtivo_(doc, corpo, { ativo, serie: card._historicoAtivoSerie });
    });
  }

  function aoClicar_(ev) {
    const fechar = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-grafico-popover-fechar') : null;
    if (fechar) {
      ev.preventDefault();
      esconder_();
      return;
    }
    const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-grafico-icon') : null;
    if (!icone) return;
    ev.preventDefault();
    ev.stopPropagation();
    const card = icone.closest('.ativo-card');
    if (!card) return;
    if (cardAberto === card) {
      esconder_();
      return;
    }
    mostrar_(icone, card);
  }

  /** Toque/clique fora do cartão aberto (e fora do próprio popover) fecha
   * - mesmo padrão "se eu clico fora, some" já validado nas outras
   * tooltips/popovers da página. */
  function aoTocarFora_(ev) {
    if (!cardAberto) return;
    const alvo = ev.target;
    if (popover.contains(alvo) || cardAberto.contains(alvo)) return;
    // 02/10/2026: o calendário de "Escolher período" mora fora do popover
    if (alvo && typeof alvo.closest === 'function' && alvo.closest('.fp-camada')) return;
    esconder_();
  }

  /** 06/10/2026 (A-59, teclado): o ícone é um role=button num <span> - Enter/Espaço fazem o mesmo que o clique; Esc fecha. */
  function aoTecla_(ev) {
    if (ev.key === 'Escape') { if (cardAberto) esconder_(); return; }
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const icone = typeof ev.target.closest === 'function' ? ev.target.closest('.ativo-grafico-icon') : null;
    if (!icone) return;
    ev.preventDefault();
    icone.click();
  }

  container.addEventListener('click', aoClicar_);
  container.addEventListener('keydown', aoTecla_);
  popover.addEventListener('click', aoClicar_);
  popover.addEventListener('keydown', aoTecla_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

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
  const cabecalho = cabecalhoEl ? montarCabecalhoPagina(cabecalhoEl, {
    secao: 'Início', titulo: 'Início', subtitulo: 'Sua carteira e o mercado de hoje', refresh: true,
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
    renderResumoCompacto(doc, doc.getElementById('resumoPatrimonio'), {
      patrimonio: resposta.patrimonio,
      ativos: resposta.ativos,
      cambio: resposta.cambio,
      ontem: resposta.ontem,
      historico: resposta.historico,
    }, { distribuicaoEl: doc.getElementById('resumoDistribuicao') });

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

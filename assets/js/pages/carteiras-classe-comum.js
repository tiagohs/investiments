/**
 * carteiras-classe-comum.js — pedaços de renderização compartilhados
 * pelas 4 subpáginas de classe de Carteiras (Ações/FIIs/Ações
 * Internacionais/Renda Fixa). As 4 têm o mesmo formato de resposta na
 * raiz (resumo/benchmarks + uma lista de ativos + uma distribuição por
 * grupo — ver apps-script/CarteirasClasses.gs e CarteirasRendaFixa.gs),
 * só o detalhe de CADA ativo muda de classe pra classe — por isso o
 * resumo/benchmarks/donut são genéricos aqui, e a tabela de ativos é
 * genérica também, parametrizada por uma lista de colunas que cada
 * page module (carteiras-acoes.js etc.) passa com seus próprios campos
 * e formatadores.
 */

import { formatBRL, formatUSD, formatPercentFromFraction } from '../format.js';
import { renderDistribuicao } from './inicio.js';
import { LOGOS_ATIVOS } from '../logos-ativos.js';
import { resolveSiteRootUrl } from '../shell.js';

/**
 * Resumo em destaque, estilo cotação (19/09/2026 #4, pedido do Tiago
 * revisando o resultado: "não ficou muito bom os cards... em destaque,
 * o valor atualizado, abaixo dele, o valor investido... ao lado, as
 * infos de Lucro/Prejuízo, Ativos na carteira e Proventos", com um
 * print de referência de uma cotação de ação - valor grande + Min/Max/
 * Volume do lado). Trocou o grid de 4-5 "tiles" iguais por 1 cartão só:
 * Total atualizado em destaque (fonte grande) com Total investido
 * embaixo (menor), e um grupo de estatísticas menores do lado (Lucro/
 * Prejuízo + Ativos na carteira + `extras`, hoje só Proventos
 * recebidos nas 3 classes de renda variável) - ver .cc-resumo* em
 * carteiras.css, que já cuida de empilhar tudo em mobile.
 * `formatarValor` (padrão formatBRL) permite reaproveitar em Ações EUA,
 * que já vem nativamente em US$ (formatUSD) - ver carteiras-acoes-eua.js.
 * `vies` ({comprar,aguardar}, opcional - ver contarVies_ abaixo) desenha
 * a faixinha comprar/aguardar embaixo do stat "Ativos na carteira",
 * igual aos cards de classe da Visão Geral (19/09/2026 #5, "voce só
 * manteve o numero de ativos, mas remoeu o gadget de comprar/aguardar
 * (com a barrinha)") - Renda Fixa não passa `vies` (não tem essa
 * coluna), então continua mostrando só o número, sem faixa.
 * `cambio` (opcional, só Ações EUA) acrescenta um "i" com o equivalente
 * em reais (equivalenteBrlHtml_) depois do Total atualizado, do Total
 * investido e do valor de Lucro/Prejuízo (19/09/2026 #6, pedido do
 * Tiago: "coloque um i com a conversao nesses tres valores em dolar") -
 * no caso de Lucro/Prejuízo, o "i" fica entre o valor e a % (que pode
 * quebrar pra uma 2ª linha se não couber, o próprio Tiago topou: "a
 * porcentagem pode ir pra baixo" - nenhum CSS novo precisou pra isso, o
 * <span> da % já é inline e quebra sozinho quando falta espaço).
 */
export function renderResumoClasseCarteiras(doc, container, resumo, { corToken = '--acoes', extras = [], formatarValor = formatBRL, vies = null, cambio = null } = {}) {
  if (!container || !resumo) return;
  const lucroBom = resumo.lucroPrejuizo >= 0;

  let ativosValorHtml = String(resumo.quantidadeAtivos);
  if (vies && typeof vies.comprar === 'number' && typeof vies.aguardar === 'number' && (vies.comprar + vies.aguardar) > 0) {
    const totalVies = vies.comprar + vies.aguardar;
    const pctComprar = (vies.comprar / totalVies) * 100;
    const pctAguardar = 100 - pctComprar;
    ativosValorHtml += `
      <div class="cc-resumo-vies-bar"><span class="comprar" style="width:${pctComprar.toFixed(1)}%"></span><span class="aguardar" style="width:${pctAguardar.toFixed(1)}%"></span></div>
      <span class="cc-resumo-vies-legenda">${vies.comprar} compr. · ${vies.aguardar} aguard.</span>
    `;
  }

  const equivTotal = equivalenteBrlHtml_(resumo.totalAtualizado, cambio);
  const equivInvestido = equivalenteBrlHtml_(resumo.totalInvestido, cambio);
  const equivLucro = equivalenteBrlHtml_(resumo.lucroPrejuizo, cambio);

  const stats = [
    {
      label: 'Lucro / Prejuízo',
      valor: `${formatarValor(resumo.lucroPrejuizo)}${equivLucro}<span class="cc-resumo-stat-pct ${lucroBom ? 'good' : 'bad'}">${formatPercentFromFraction(resumo.percentualLucroPrejuizo)}</span>`,
      classe: lucroBom ? 'good' : 'bad',
    },
    { label: 'Ativos na carteira', valor: ativosValorHtml },
    ...extras,
  ];

  container.innerHTML = `
    <div class="cc-resumo" style="--tile-accent:var(${corToken})">
      <div class="cc-resumo-principal">
        <span class="cc-resumo-valor">${formatarValor(resumo.totalAtualizado)}${equivTotal}</span>
        <span class="cc-resumo-investido">Investido: ${formatarValor(resumo.totalInvestido)}${equivInvestido}</span>
      </div>
      <div class="cc-resumo-sep" aria-hidden="true"></div>
      <div class="cc-resumo-stats">
        ${stats.map((s) => `
          <div class="cc-resumo-stat${s.classe ? ` ${s.classe}` : ''}">
            <span class="cc-resumo-stat-label">${s.label}</span>
            <span class="cc-resumo-stat-valor">${s.valor}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/** Chips de benchmark (ex.: "Ibovespa hoje · +0,54%" · "CDI (a.a.) ·
 * 13,4%") — `itens` é `[{ label, valor, cor? }]`, já formatado pelo
 * chamador (cada classe tem sua própria mistura de índice/%/câmbio).
 * `cor` é opcional ('good'/'bad') - só pros índices que representam
 * variação do dia (Ibovespa/IFIX/S&P 500), igual ao mockup (verde/
 * vermelho); CDI/Selic/IPCA/Dólar são taxas/cotação de referência, sem
 * viés de alta/baixa, ficam sem cor (neutro). */
export function renderBenchmarksClasseCarteiras(doc, container, itens) {
  if (!container) return;
  if (!itens || !itens.length) { container.innerHTML = ''; return; }
  container.innerHTML = itens.map((i) => `
    <span class="cc-benchmark-chip"><span class="cc-benchmark-label">${i.label}</span><b${i.cor ? ` class="${i.cor}"` : ''}>${i.valor}</b></span>
  `).join('');
}

/** Donut "por grupo" (Setor/Segmento pra RV, Indexador pra Renda Fixa) —
 * reaproveita renderDistribuicao (inicio.js) sem cor fixa por fatia (a
 * própria função cicla pela paleta de fallback quando `cor` não vem).
 * Pizza maior + legenda em 2 COLUNAS lado a lado (pedido do Tiago,
 * revisando o resultado: "a divisão de setores está mal posicionado...
 * aumente a pizza" - e depois, corrigindo a própria palavra: "eu me
 * confundi... na verdade, quero que seja duas COLUNAS") - o tamanho é
 * escopado a `.cc-donut-card` em carteiras.css, não mexe no donut da
 * Início (mesmo componente, contextos de card diferentes). A divisão
 * em 2 colunas é feita aqui no DOM (ver dividirLegendaEmDuasColunas_
 * abaixo), não em CSS - ver o comentário lá pro porquê.
 * `cambio` (opcional, só Ações EUA) corrige um bug de rótulo: os totais
 * de `distribuicao` em Ações EUA já vêm nativamente em US$ (mesmo dado
 * que preenche a tabela/resumo), mas a legenda mostrava "R$" na frente
 * de um número que na verdade era dólar (19/09/2026 #6, print do Tiago:
 * "Financeiro/Bancário R$ 312,48" quando o valor real era em US$) -
 * "por default, mostra em dolar aqui, e no i, mantenha a versao em
 * reais". Com `cambio`, a legenda passa a mostrar formatUSD (o valor
 * como ele já É) e o "i" de cada item mostra o equivalente convertido
 * pro câmbio de hoje; sem `cambio` (Ações/FIIs, nativamente em R$),
 * comportamento igual a antes. */
export function renderDistribuicaoGrupoCarteiras(doc, container, distribuicao, { cambio = null } = {}) {
  if (!container) return;
  const fatias = (distribuicao || []).map((d) => ({ label: d.grupo, valor: d.totalAtualizado }));
  const opcoesFormato = typeof cambio === 'number'
    ? { formatarValor: formatUSD, formatarValorTooltip: (v) => formatBRL(v * cambio) }
    : {};
  renderDistribuicao(doc, container, fatias, opcoesFormato);
  dividirLegendaEmDuasColunas_(doc, container);
}

/**
 * Reagrupa os itens de `.distrib-legenda` em EXATAMENTE 2 COLUNAS
 * (`.cc-donut-legenda-col`), a quantidade por coluna dependendo da
 * contagem total - metade pra cada, a 1ª coluna leva o item a mais
 * quando o total é ímpar (19/09/2026 #5, pedido do Tiago: "divida
 * entre elas de acordo com o numero de itens na lista"). Uma 1ª
 * tentativa fez a divisão em 2 LINHAS horizontais em vez de colunas
 * (mal-entendido da própria palavra que o Tiago usou antes de
 * corrigir), o que numa tela estreita forçava os itens de cada linha a
 * quebrar em várias linhas mesmo assim (linha muito comprida pro
 * celular) - 2 colunas verticais lado a lado é o mesmo
 * `.distrib-legenda` estreito de sempre (o que já funciona bem no
 * card pequeno da Início), só que 2 vezes lado a lado, então funciona
 * em qualquer largura de tela sem precisar de fallback por media
 * query. Só reorganiza a legenda DENTRO do `.cc-donut-card` de
 * Carteiras (chamada só por renderDistribuicaoGrupoCarteiras) - o
 * donut de resumo da Início (mesma renderDistribuicao, chamada direto
 * por lá) continua intocado.
 */
function dividirLegendaEmDuasColunas_(doc, container) {
  const legenda = container.querySelector('.distrib-legenda');
  if (!legenda) return;
  const itens = [...legenda.children];
  if (itens.length <= 1) return; // 0-1 item já cabe numa coluna só.

  const meio = Math.ceil(itens.length / 2);
  const col1 = doc.createElement('div');
  col1.className = 'cc-donut-legenda-col';
  const col2 = doc.createElement('div');
  col2.className = 'cc-donut-legenda-col';
  itens.forEach((item, i) => (i < meio ? col1 : col2).appendChild(item));

  legenda.innerHTML = '';
  legenda.appendChild(col1);
  legenda.appendChild(col2);
}

/**
 * Logo redondo do ativo (LOGOS_ATIVOS, gerado por
 * scripts/gerar-logos-ativos.mjs a partir de assets/imgs/acoes|fiis/ que
 * o Tiago organizou por ticker) - mesmo padrão visual/fallback que a
 * grade "Radar de oportunidades" já usa
 * (distribuicoes-metas.js!criarLogoAtivo_), só que como HTML-string (as
 * tabelas de Carteiras montam a linha inteira via innerHTML, não
 * createElement) - a <img> tem onerror inline que remove ela mesma se a
 * imagem falhar, revelando o fallback de iniciais que já está por baixo
 * no HTML (não depende de religar listener depois de um re-render).
 * new URL(caminho, resolveSiteRootUrl()) resolve certo mesmo de dentro
 * de carteiras/index.html (1 nível mais fundo que a raiz do site - ver
 * o comentário de resolveSiteRootUrl em shell.js).
 */
export function logoAtivoHtml(ticker) {
  const iniciais = (ticker || '?').slice(0, 2).toUpperCase();
  const caminho = LOGOS_ATIVOS[ticker];
  if (!caminho) return `<span class="cc-logo cc-logo-fallback">${iniciais}</span>`;
  const url = new URL(caminho, resolveSiteRootUrl()).href;
  return `<span class="cc-logo"><img src="${url}" alt="" loading="lazy" onerror="this.remove()"><span class="cc-logo-fallback">${iniciais}</span></span>`;
}

/**
 * "i" que abre uma tooltip por toque/hover - NÃO é mais `title` nativo
 * (19/09/2026 #4, pedido do Tiago: "as tooltips não estão funcionando.
 * O botão do i só deve ser clicável no mobile. No desktop, é um
 * tooltip que quando eu passo o mouse, aparece"). `title` nativo não
 * aparece no toque (sem hover no celular) - mesmo problema que a
 * Início/Distribuição e Metas já resolveram com o marcador genérico
 * ".info-alvo"/".info-icon"/".info-tooltip" (CSS já vem de inicio.css,
 * que esta página já carrega - só falta ligar o wiring, ver
 * wirePointerTooltipCarteiras_ abaixo). Reaproveita essas MESMAS
 * classes em vez de inventar um "cc-" prefixado - mesmo motivo de
 * sempre pra duplicar em vez de importar uma função privada de outro
 * módulo (ver o comentário de wirePointerTooltipDistrib_/
 * wirePointerTooltipInfo_ nos outros 2 arquivos). `pequeno` usa um
 * tamanho reduzido pro ícone dentro de célula (nota de ativo,
 * equivalente em R$) - ver .cc-info-icon-sm em carteiras.css. */
export function botaoInfoHtml(texto, { pequeno = false } = {}) {
  if (!texto) return '';
  const escapado = String(texto).replace(/"/g, '&quot;');
  const classeIcone = pequeno ? 'info-icon cc-info-icon-sm' : 'info-icon';
  return ` <span class="info-alvo" data-tooltip="${escapado}"><span class="${classeIcone}">i</span></span>`;
}

/**
 * "i" com o equivalente em reais de um valor em US$ (câmbio de hoje) -
 * só Ações EUA passa `cambio` (câmbio do dia, `dados.benchmarks.dolar`),
 * que já vem nativamente em US$ (resumo/tabela/donut) - 19/09/2026 #6,
 * pedido do Tiago: "coloque um i com a conversao" no resumo (Total
 * atualizado/Investido/Lucro-Prejuízo) e na coluna Preço/dia da tabela;
 * "por default, mostra em dolar... no i, mantenha a versao em reais" no
 * donut "Por setor" (ver o `cambio` de renderDistribuicaoGrupoCarteiras
 * abaixo). '' quando não há câmbio disponível (sem quebrar a tela).
 * Compartilhada aqui (em vez de duplicada por página) porque é um puro
 * helper de formatação sem estado nem efeito colateral - ao contrário
 * das funções de wiring que este projeto duplica de propósito (ver o
 * comentário de wirePointerTooltipCarteiras_ logo abaixo). Usada
 * também na coluna "Pr. médio"/teto de carteiras-acoes-eua.js, que já
 * tinha essa MESMA função como cópia local antes desta rodada - migrada
 * pra cá quando um 3º lugar (resumo) passou a precisar dela também.
 */
export function equivalenteBrlHtml_(valorUsd, cambio) {
  if (typeof valorUsd !== 'number' || typeof cambio !== 'number') return '';
  return botaoInfoHtml(`Equivalente em reais: ${formatBRL(valorUsd * cambio)} (câmbio de hoje).`, { pequeno: true });
}

/**
 * Tooltip por Pointer Events (funciona em mouse E toque, ao contrário
 * de `title` nativo) - cópia do mesmo padrão já usado em
 * pages/inicio.js!wirePointerTooltipDistrib_ e
 * pages/distribuicoes-metas.js!wirePointerTooltipInfo_ (documentado lá:
 * duplicado de propósito, cada arquivo com sua própria cópia, mesmo
 * motivo de sempre - .moeda-conv/.skel/etc.). Delegado no container
 * ESTÁVEL de cada subpágina (o <div id="xxxConteudo">, nunca recriado -
 * só o innerHTML dele é trocado a cada desenhar()/atualização), pra
 * qualquer ".info-alvo" com `dataset.tooltip` dentro dele: ícones "i"
 * de cabeçalho de coluna, nota de ativo (AXIA15G), equivalente em R$
 * (Ações EUA) e a legenda do donut "por grupo" (que já vinha com essa
 * marcação de renderDistribuicao, só faltava este wiring - por isso as
 * tooltips do donut também não funcionavam antes). Guardado por
 * `container._ccTooltipWired` pra nunca ligar 2x no mesmo container.
 */
export function wirePointerTooltipCarteiras_(doc, container) {
  if (!container || container._ccTooltipWired) return;
  container._ccTooltipWired = true;

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

  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', aoSairPonteiro_);
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

/** Observações curtas por ticker específico (19/09/2026 #3, pedido do
 * Tiago: "AXIA15G é uma ação de subscrição, inclua um i na frente,
 * explique o que é"). Mapa fixo, não um padrão automático de sufixo de
 * ticker - o padrão do B3 pra direito/recibo de subscrição (normalmente
 * termina em 1/2/9/10 + uma letra de série) tem exceções demais pra
 * confiar cegamente (ações PNA/PNB, por ex., também podem terminar em
 * 5/6) - arriscaria rotular errado um ativo de verdade. Cresce
 * conforme o Tiago for confirmando outros tickers. */
const NOTAS_ATIVOS = {
  AXIA15G: 'Ação de subscrição: um direito que dá ao acionista a opção de comprar novas ações emitidas pela empresa num aumento de capital, geralmente por um preço menor que o de mercado. Não tem histórico de preço nem fundamentos (P/L, P/VP, DY) como uma ação normal — por isso essas colunas aparecem vazias para este ativo.',
};

/** "i" pequeno antes do ticker quando o ativo tem uma nota conhecida
 * (ver NOTAS_ATIVOS) - '' quando não tem (maioria dos ativos). */
export function notaAtivoHtml(ticker) {
  return botaoInfoHtml(NOTAS_ATIVOS[ticker], { pequeno: true });
}

/** Filtra ativos por ticker/nome (substring, sem diferenciar
 * maiúsculas/minúsculas) - usado pela caixa de busca das 3 subpáginas
 * de renda variável (19/09/2026 #3). Busca vazia devolve a lista
 * inteira sem cópia desnecessária. */
export function filtrarAtivosPorBusca(ativos, busca) {
  const termo = (busca || '').trim().toLowerCase();
  if (!termo) return ativos;
  return (ativos || []).filter((a) => (a.ticker || '').toLowerCase().includes(termo) || (a.nome || '').toLowerCase().includes(termo));
}

/**
 * Barra de busca (+ opcionalmente chips de filtro por grupo, hoje só
 * FIIs usa - "Todos"/"Papel (TVM)"/"Shopping"/etc., vindos dinamicamente
 * de distribuicaoPorGrupo, não hard-coded, pra não ficar errado se o
 * Tiago reclassificar um ativo) acima da tabela de Ativos, igual ao
 * mockup nas 3 subpáginas de renda variável (19/09/2026 #3). Renderiza
 * o HTML só 1x por desenho de página inteiro - re-renderizar a cada
 * tecla digitada tiraria o foco do <input> a cada letra - o page module
 * chama onBuscar/onFiltrarGrupo pra re-renderizar só a TABELA (ver
 * carteiras-fiis.js).
 */
export function renderFiltrosTabelaCarteiras(doc, container, { busca = '', onBuscar, grupos = null, filtroGrupo = null, onFiltrarGrupo } = {}) {
  if (!container) return;
  const chipsHtml = grupos ? `
    <div class="filter-tabs cc-filtro-chips">
      <button type="button" class="filter-tab${filtroGrupo === null ? ' active' : ''}" data-grupo="">Todos</button>
      ${grupos.map((g) => `<button type="button" class="filter-tab${filtroGrupo === g ? ' active' : ''}" data-grupo="${g}">${g}</button>`).join('')}
    </div>
  ` : '';
  container.innerHTML = `
    <div class="cc-filtros-linha">
      ${chipsHtml}
      <label class="cc-busca-caixa">
        <span class="cc-busca-icone" aria-hidden="true">🔍</span>
        <input type="search" class="cc-busca-input" placeholder="Buscar por ticker ou nome">
      </label>
    </div>
    <div class="hint cc-filtros-dica">${grupos ? 'O filtro por segmento também recalcula os totais no rodapé da tabela · ' : ''}Clique no título de uma coluna pra ordenar por ela</div>
  `;
  const inputEl = container.querySelector('.cc-busca-input');
  if (inputEl) {
    inputEl.value = busca;
    if (onBuscar) inputEl.addEventListener('input', (ev) => onBuscar(ev.target.value));
  }
  if (onFiltrarGrupo) {
    container.querySelectorAll('[data-grupo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('[data-grupo]').forEach((b) => b.classList.toggle('active', b === btn));
        onFiltrarGrupo(btn.dataset.grupo || null);
      });
    });
  }
}

/**
 * Tabela de ativos genérica. `colunas` é `[{ label, alinharEsquerda?,
 * ajuda?, campo?, ordenarPor?(ativo)=>valor bruto,
 * formatar(ativo)=>string HTML }]` — cada page module monta as colunas
 * certas pra sua classe (ver carteiras-acoes.js/carteiras-fiis.js/
 * carteiras-acoes-eua.js/carteiras-renda-fixa.js). Conteúdo de toda
 * coluna é CENTRALIZADO por padrão (19/09/2026 #4, pedido do Tiago -
 * "todas as colunas, tirando o Ativo, centralize o conteúdo. Em Ativo,
 * só centralize o título", inspirado na tabela do Radar de
 * oportunidades) - só a coluna com `alinharEsquerda:true` (a de Ativo,
 * com logo+ticker+nome) tem a CÉLULA (não o cabeçalho) alinhada à
 * esquerda, ver .cc-td-esquerda em carteiras.css.
 *
 * `ajuda` vira um ícone "i" com tooltip no cabeçalho (19/09/2026 #3,
 * ver botaoInfoHtml); `campo`+`ordenarPor` deixam a coluna clicável pra
 * ordenar (19/09/2026 #3, pedido do Tiago - "quero poder ordenar
 * clicando no título de cada coluna") - sem `ordenarPor` a coluna não
 * vira clicável. O clique no ícone "i" do cabeçalho NUNCA ordena (só
 * abre a tooltip) - o listener de ordenação ignora cliques que vieram
 * de dentro de ".info-alvo", senão tocar no "i" no celular também
 * dispararia uma ordenação junto (os 2 elementos dividem o mesmo <th>).
 * Sem uma ordenação ativa (ou ordenacao=null), cai no padrão de
 * sempre: Total atualizado desc (maior posição primeiro, mesma
 * hierarquia da Home consolidada).
 *
 * `linhaTotalHtml` (opcional) - 1 <tr> pronto (o chamador já sabe quantas
 * colunas tem e quais das últimas são Total/Lucro, então monta o
 * colspan+valores certos sozinho - ver montarLinhaTotalAtivos_ em
 * carteiras-acoes.js) - some quando null/vazio (tabela filtrada por
 * busca com 0 resultado, por ex., não faz sentido mostrar total ali).
 *
 * MOBILE (19/09/2026 #5, pedido do Tiago: "NAO USAR TABELA EM MOBIle...
 * la ja decidimos que em modo mobile, cada item seria um card. [...] a
 * tela de distribuicao e metas ja resolve bem a adaptacao das tabelas
 * em mobile") - mesma técnica do Radar de oportunidades
 * (distribuicoes-metas.js!criarLinhaRadar_ + o media query em
 * distribuicoes-metas.css): a MESMA <table>/<tr>/<td> vira 1 card por
 * ativo só com CSS (ver `@media (max-width:640px)` em carteiras.css) -
 * <thead> some, cada <tr> vira um cartão e cada <td> vira uma linha
 * "rótulo: valor", com o rótulo vindo de `data-label` (setado aqui
 * embaixo, cópia de `c.label`). A coluna Ativo (`alinharEsquerda:true`,
 * sempre a 1ª) vira o "topo" do card (`.cc-td-topo`), sem rótulo - o
 * conteúdo (logo+ticker+nome) já fala por si, igual Ranking+Ativo no
 * Radar. Não precisa duplicar a lógica de desenho pra isso - o mesmo
 * HTML serve pras 2 telas, só a CSS muda por largura.
 */
export function renderTabelaAtivosCarteiras(doc, container, ativos, colunas, { linhaTotalHtml = '', ordenacao = null, onOrdenar = null } = {}) {
  if (!container) return;
  if (!ativos || !ativos.length) {
    container.innerHTML = '<p class="hint">Nenhum ativo encontrado nesta carteira.</p>';
    return;
  }

  const colunaAtiva = ordenacao ? colunas.find((c) => c.campo === ordenacao.campo && typeof c.ordenarPor === 'function') : null;
  const lista = [...ativos].sort((a, b) => {
    if (colunaAtiva) {
      const va = colunaAtiva.ordenarPor(a);
      const vb = colunaAtiva.ordenarPor(b);
      const cmp = (typeof va === 'string' || typeof vb === 'string')
        ? String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR')
        : (va ?? -Infinity) - (vb ?? -Infinity);
      return ordenacao.direcao === 'asc' ? cmp : -cmp;
    }
    return (b.totalAtualizado || 0) - (a.totalAtualizado || 0);
  });

  const cabecalho = colunas.map((c) => {
    const ordenavel = typeof c.ordenarPor === 'function';
    const ativa = ordenavel && ordenacao && ordenacao.campo === c.campo;
    const seta = ativa ? ` <span class="cc-th-seta">${ordenacao.direcao === 'asc' ? '▲' : '▼'}</span>` : '';
    const ajuda = c.ajuda ? botaoInfoHtml(c.ajuda) : '';
    return `<th${ordenavel ? ' class="cc-th-ordenavel"' : ''}${ordenavel ? ` data-campo="${c.campo}"` : ''}>${c.label}${ajuda}${seta}</th>`;
  }).join('');
  const linhas = lista.map((ativo) => {
    const celulas = colunas.map((c) => {
      // .cc-td-topo (só na coluna Ativo, sempre alinharEsquerda:true) -
      // vira o "cabeçalho" do card no mobile (sem rótulo); o resto leva
      // data-label pro rótulo "coluna: valor" do card (ver o comentário
      // grande acima). rotuloEscapado protege contra aspas no label
      // (nenhum label atual tem, mas por segurança - mesmo padrão de
      // botaoInfoHtml).
      const classe = c.alinharEsquerda ? ' class="cc-td-esquerda cc-td-topo"' : '';
      const rotuloEscapado = String(c.label).replace(/"/g, '&quot;');
      const dataLabel = c.alinharEsquerda ? '' : ` data-label="${rotuloEscapado}"`;
      return `<td${classe}${dataLabel}>${c.formatar(ativo)}</td>`;
    }).join('');
    return `<tr>${celulas}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="cc-tabela-wrap">
      <table class="cc-tabela">
        <thead><tr>${cabecalho}</tr></thead>
        <tbody>${linhas}</tbody>
        ${linhaTotalHtml ? `<tfoot>${linhaTotalHtml}</tfoot>` : ''}
      </table>
    </div>
  `;

  if (onOrdenar) {
    container.querySelectorAll('.cc-th-ordenavel').forEach((th) => {
      th.addEventListener('click', (ev) => {
        if (ev.target.closest && ev.target.closest('.info-alvo')) return;
        onOrdenar(th.dataset.campo);
      });
    });
  }
}

/** "Comprar" (good) / "Aguardar" (warn) / sem dado (—) — Auxiliar_ativos
 * guarda o texto bruto (não normalizado como em MeusAtivos.gs), então
 * compara sem diferenciar maiúsculas. */
export function statusVies(vies) {
  const v = (vies || '').toLowerCase();
  if (v === 'comprar') return { texto: 'Comprar', classe: 'good' };
  if (v === 'aguardar') return { texto: 'Aguardar', classe: 'warn' };
  return { texto: '—', classe: '' };
}

/** Conta quantos ativos estão "Comprar" vs "Aguardar" (statusVies) numa
 * lista de ativos - usado pra faixa comprar/aguardar do stat "Ativos na
 * carteira" no resumo (19/09/2026 #5, pedido do Tiago revisando o
 * resultado: "voce só manteve o numero de ativos, mas remoeu o gadget
 * de comprar/aguardar (com a barrinha)" - existia nos cards de classe
 * da Visão Geral, carteiras-visao-geral.js!renderCardsClasse, e também
 * nas 3 subpáginas de renda variável antes do redesenho do resumo -
 * ficou pra trás sem querer). Ativos sem viés reconhecido (ex.: Renda
 * Fixa, que não tem essa coluna) não entram em nenhum dos 2 totais -
 * ver o `if` em renderResumoClasseCarteiras que só desenha a faixa
 * quando a soma é > 0. */
export function contarVies_(ativos) {
  let comprar = 0, aguardar = 0;
  (ativos || []).forEach((a) => {
    const status = statusVies(a.vies);
    if (status.classe === 'good') comprar += 1;
    else if (status.classe === 'warn') aguardar += 1;
  });
  return { comprar, aguardar };
}

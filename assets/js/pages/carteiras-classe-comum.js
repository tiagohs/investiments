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

import { formatBRL, formatUSD, formatDateBR, formatPercentFromFraction } from '../format.js';
import {
  renderDistribuicao,
  filtrarHistoricoPorPeriodo,
  renderGraficoRentabilidade,
  wireGraficoRentabilidade,
  CAMPO_PRINCIPAL_POR_VISAO,
  CAMPO_FLUXO_POR_VISAO,
  CAMPO_FLUXO_APLICADO_POR_VISAO,
  COR_PRINCIPAL_POR_VISAO,
  renderInfoEvolucao,
} from './inicio.js';
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
export function renderResumoClasseCarteiras(doc, container, resumo, { corToken = '--acoes', extras = [], formatarValor = formatBRL, vies = null, cambio = null, equivalentesBrl = null } = {}) {
  if (!container || !resumo) return;
  const lucroBom = resumo.lucroPrejuizo >= 0;
  // 23/09/2026 #3: % calculado aqui, com todas as casas - a API manda a
  // fração já arredondada pra 2 casas, e um lucro de 12,4% aparecia "12,00%".
  const percentualLucro = typeof resumo.totalInvestido === 'number' && resumo.totalInvestido !== 0 && typeof resumo.lucroPrejuizo === 'number'
    ? resumo.lucroPrejuizo / resumo.totalInvestido
    : resumo.percentualLucroPrejuizo;

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

  // 23/09/2026 #3 (Ações EUA): `equivalentesBrl` troca o "i" genérico
  // (valor em US$ × câmbio de HOJE) por textos prontos - o Valor aplicado
  // em reais é o custo de cada compra no câmbio do dia dela (o mesmo
  // número do fim da linha "Valor aplicado" do gráfico logo abaixo); US$
  // × câmbio de hoje dava um número diferente do fim da linha do gráfico.
  const equivDe_ = (chave, valorUsd) => (equivalentesBrl && equivalentesBrl[chave]
    ? botaoInfoHtml(equivalentesBrl[chave], { pequeno: true })
    : equivalenteBrlHtml_(valorUsd, cambio));
  const equivTotal = equivDe_('totalAtualizado', resumo.totalAtualizado);
  const equivInvestido = equivDe_('totalInvestido', resumo.totalInvestido);
  const equivLucro = equivDe_('lucroPrejuizo', resumo.lucroPrejuizo);

  const stats = [
    {
      label: 'Lucro / Prejuízo',
      valor: `${formatarValor(resumo.lucroPrejuizo)}${equivLucro}<span class="cc-resumo-stat-pct ${lucroBom ? 'good' : 'bad'}">${formatPercentFromFraction(percentualLucro)}</span>`,
      classe: lucroBom ? 'good' : 'bad',
    },
    { label: 'Ativos na carteira', valor: ativosValorHtml },
    ...extras,
  ];

  container.innerHTML = `
    <div class="cc-resumo" style="--tile-accent:var(${corToken})">
      <div class="cc-resumo-principal">
        <span class="cc-resumo-valor">${formatarValor(resumo.totalAtualizado)}${equivTotal}</span>
        <span class="cc-resumo-investido">Valor aplicado: ${formatarValor(resumo.totalInvestido)}${equivInvestido}</span>
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

// ============================================================================
// Gráficos "Rentabilidade acumulada" + "Evolução do patrimônio" das 4
// subpáginas de classe (Ações/FIIs/Ações EUA/Renda Fixa) - 19/09/2026 #7,
// pedido do Tiago: "Pode prosseguir com o codigo... lembre-se do mockup,
// lembre-se de ficar bom em mobile, lembre-se das labels, lembre-se que ao
// passar o mouse, quero ver o periodo, lembre-se do filtro de periodo
// encima do primeiro grafico, que afeta todos (igual a home)". O lado
// Rentabilidade REAPROVEITA renderGraficoRentabilidade/
// wireGraficoRentabilidade de inicio.js direto (mesmo "motor" que a Início
// e carteiras-visao-geral.js já usam, com as visões "carteiraAcoes"/
// "carteiraFiis"/"carteiraAcoesEua"/"carteiraRendaFixaTotal"/
// "carteiraRendaFixaLongoPrazo"/"carteiraRendaFixaEmergencial" que essa
// mesma rodada acrescentou em CAMPO_PRINCIPAL_POR_VISAO/
// CAMPO_FLUXO_POR_VISAO/BENCHMARKS_POR_VISAO/COR_PRINCIPAL_POR_VISAO -
// ver inicio.js). O lado Evolução NÃO tinha equivalente genérico (só
// existia hardcoded pro total geral em carteiras-visao-geral.js) - as 3
// funções abaixo generalizam esse pedaço (comHistoricoAcumuladoClasse_/
// ligarInteracaoEvolucaoClasse_/renderEvolucaoClasseCarteiras), copiando
// deliberadamente a lógica de lá em vez de importá-la (mesmo motivo de
// sempre neste projeto pra funções de wiring/desenho - ver o comentário
// de wirePointerTooltipCarteiras_ acima) - carteiras-visao-geral.js
// continua intocada nesta rodada, pra não arriscar regredir o que já
// está no ar e testado.
//
// A ORQUESTRAÇÃO (wireGraficosClasseCarteiras, no fim deste bloco) é o
// que liga os dois lados a 1 ÚNICO filtro de período compartilhado, acima
// do 1º gráfico da página - exatamente como a Início/Visão geral já fazem
// (1 filtro no topo, N painéis redesenhados juntos) - reaproveita
// wireGraficoRentabilidade pro lado Rentabilidade e religa um 2º conjunto
// de listeners (idempotente, próprio) pro lado Evolução nos MESMOS
// botões, mesmo padrão dos "2 conjuntos de listener independentes" já
// comprovado em carteiras-visao-geral.js.
// ============================================================================

/** Compacto BRL pro eixo Y do gráfico de Evolução (R$ 12,3 mil, R$ 1,2 mi)
 * - cópia de carteiras-visao-geral.js!COMPACTO_BRL, mesmo motivo de
 * sempre pra duplicar em vez de importar (função "de desenho", não um
 * helper puro de formatação como equivalenteBrlHtml_ acima). */
const COMPACTO_BRL_CARTEIRAS = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/**
 * Acumula historico[i][campoFluxo] (fluxo de caixa líquido diário DA
 * CLASSE - aporte/retirada/provento, já calculado por classe em
 * FluxoCaixaInicio.gs/HistoricoInicio.gs nesta mesma rodada) num "quanto
 * investi até aqui" por dia, pra plotar junto do "quanto tenho" na
 * Evolução - generalização de
 * carteiras-visao-geral.js!comHistoricoInvestidoAcumulado_ (que só sabia
 * somar `fluxoCaixaPatrimonio`, o total geral) pra aceitar qualquer campo
 * de fluxo por visão (fluxoCaixaAcoes/fluxoCaixaFiis/fluxoCaixaAcoesEua/
 * fluxoCaixaRendaFixaTotal/fluxoCaixaRendaFixaLongoPrazo/
 * fluxoCaixaRendaEmergencial - ver CAMPO_FLUXO_POR_VISAO em inicio.js, o
 * caller de wireGraficosClasseCarteiras nunca precisa saber esse nome na
 * mão). Roda sobre o histórico INTEIRO (nunca a janela já filtrada por
 * período) - o acumulado tem que começar do dia 1 de verdade, senão um
 * recorte de "30 dias" mostraria só o aporte DENTRO desses 30 dias, não o
 * total investido até então - mesmo cuidado do original.
 */
export function comHistoricoAcumuladoClasse_(historico, campoFluxo) {
  let acumulado = 0;
  return (historico || []).map((item) => {
    const fluxo = campoFluxo && typeof item[campoFluxo] === 'number' && Number.isFinite(item[campoFluxo]) ? item[campoFluxo] : 0;
    acumulado += fluxo;
    return { ...item, investidoAcumulado: acumulado };
  });
}

/**
 * Hover/touch do gráfico de Evolução por classe - adaptado de
 * carteiras-visao-geral.js!ligarInteracaoEvolucao_ (mesma técnica de
 * Pointer Events sobre um <rect> transparente), generalizado em 2 pontos:
 * (1) `valoresInvestido` pode vir `null` (Longo Prazo/Reserva de
 * Emergência de Renda Fixa mostram só 1 linha, sem comparação com valor
 * investido - mockup RendaFixa.dc.html) - a tooltip e o ponto de hover da
 * 2ª série somem sozinhos nesse caso; (2) `labelValor`/`labelInvestido`
 * customizam os rótulos da tooltip por chamador ("Portfólio"/"Valor
 * investido" nas 3 subpáginas de renda variável, conferido pixel a pixel
 * no mockup - diferente de "Quanto tenho hoje"/"Quanto investi" que a
 * Visão geral usa, então não dá pra simplesmente importar a função de lá
 * sem mudar o texto). `corToken` pinta o ponto/linha principal com a cor
 * da própria classe (--acoes/--fiis/--usa/--rf) em vez do --acoes fixo do
 * original.
 */
function ligarInteracaoEvolucaoClasse_(container, { janela, valoresPrincipal, valoresInvestido, x, y, padL, plotW, W, corToken = '--acoes', labelValor = 'Portfólio', labelInvestido = 'Valor aplicado', formatarValor = formatBRL }) {
  const svgEl = container.querySelector('svg.rentab-chart');
  const hitarea = container.querySelector('.rentab-hitarea');
  const hoverGroup = container.querySelector('.rentab-hover');
  const linhaHover = container.querySelector('.rentab-hover-linha');
  const pontoPrincipal = container.querySelector('.rentab-hover-ponto[data-serie="principal"]');
  const pontoInvestido = container.querySelector('.rentab-hover-ponto[data-serie="investido"]');
  const tooltip = container.querySelector('.rentab-tooltip');
  if (!svgEl || !hitarea || !hoverGroup || !linhaHover || !tooltip) return;

  function indiceNoClientX_(clientX) {
    const rect = svgEl.getBoundingClientRect();
    const svgX = clientX - rect.left;
    const fracao = plotW > 0 ? (svgX - padL) / plotW : 0;
    return Math.min(janela.length - 1, Math.max(0, Math.round(fracao * (janela.length - 1))));
  }

  function posicionarPonto_(el, valor, i) {
    if (!el) return;
    if (typeof valor !== 'number') { el.setAttribute('hidden', ''); return; }
    el.removeAttribute('hidden');
    el.setAttribute('cx', x(i).toFixed(1));
    el.setAttribute('cy', y(valor).toFixed(1));
  }

  function mostrar_(clientX) {
    const i = indiceNoClientX_(clientX);
    const xx = x(i);

    linhaHover.setAttribute('x1', xx.toFixed(1));
    linhaHover.setAttribute('x2', xx.toFixed(1));
    posicionarPonto_(pontoPrincipal, valoresPrincipal[i], i);
    if (pontoInvestido) posicionarPonto_(pontoInvestido, valoresInvestido ? valoresInvestido[i] : null, i);
    hoverGroup.removeAttribute('hidden');

    // Tooltip mostra o PERÍODO (data completa, "18 set 2026") + o valor de
    // cada série visível - pedido explícito do Tiago ("lembre-se que ao
    // passar o mouse, quero ver o periodo"), mesmo formato já usado na
    // Início/Visão geral (formatDateBR).
    const linhas = [{ label: labelValor, cor: `var(${corToken})`, valor: valoresPrincipal[i] }];
    if (valoresInvestido) linhas.push({ label: labelInvestido, cor: 'var(--ink-muted)', valor: valoresInvestido[i] });
    const linhasTooltip = linhas.map((linha) => `
      <div class="rentab-tooltip-item">
        <span class="dot" style="background:${linha.cor}"></span>${linha.label}
        <b>${typeof linha.valor === 'number' ? formatarValor(linha.valor) : '—'}</b>
      </div>
    `).join('');
    tooltip.innerHTML = `<div class="rentab-tooltip-data">${formatDateBR(janela[i].data)}</div>${linhasTooltip}`;
    tooltip.hidden = false;

    const larguraTooltip = tooltip.offsetWidth || 170;
    const esquerda = Math.min(Math.max(xx - larguraTooltip / 2, 4), Math.max(W - larguraTooltip - 4, 4));
    tooltip.style.left = `${esquerda}px`;
  }

  function esconder_() {
    hoverGroup.setAttribute('hidden', '');
    tooltip.hidden = true;
  }

  hitarea.addEventListener('pointermove', (ev) => mostrar_(ev.clientX));
  hitarea.addEventListener('pointerdown', (ev) => mostrar_(ev.clientX));
  hitarea.addEventListener('pointerleave', esconder_);
}

/**
 * Gráfico "Evolução do patrimônio" genérico por classe/sub-visão -
 * generalização de carteiras-visao-geral.js!renderEvolucaoPatrimonio
 * (hardcoded pro campo `patrimonio`, único gráfico que aquela página
 * desenha) pras 6 novas visões de Carteiras (Ações/FIIs/Ações EUA + as 3
 * de Renda Fixa). `campoValor` escolhe o campo bruto do histórico (ver
 * CAMPO_PRINCIPAL_POR_VISAO em inicio.js); `campoInvestido` (default
 * 'investidoAcumulado') o campo já acumulado por
 * comHistoricoAcumuladoClasse_ acima - SEMPRE chamado pelo caller ANTES
 * de passar o histórico pra esta função (mesmo padrão de pré-processar
 * fora que a Visão geral já usa) - nunca calculado aqui dentro, pra não
 * recalcular o acumulado do histórico INTEIRO a cada troca de período
 * (só a JANELA filtrada muda a cada clique, o acumulado é fixo).
 *
 * `comInvestido:false` desliga a linha tracejada + a área de comparação
 * com "quanto investi" (mockup RendaFixa.dc.html: Longo Prazo/Reserva de
 * Emergência mostram só 1 linha sólida, sem preenchimento - o valor
 * investido de cada SUB-conta de Renda Fixa não é algo que o Tiago
 * acompanha separado hoje, só o total; "Carteira total" de Renda Fixa e
 * as 3 subpáginas de renda variável usam `comInvestido:true`, igual ao
 * gráfico da Visão geral). `corToken` (--acoes/--fiis/--usa/--rf) pinta a
 * linha/área com a cor da própria classe - conferido pixel a pixel nos 4
 * mockups (só a Visão geral usa --acoes fixo, por isso o default aqui é
 * --acoes, preservando esse comportamento caso um chamador não passe
 * nada).
 */
/** 23/09/2026 #3: soma de um campo diário do histórico (ex.:
 * fluxoAplicadoAcoesEua -> custo em reais de tudo que está aplicado). null
 * quando o histórico não tem o campo. */
export function somaCampoHistorico_(historico, campo) {
  if (!Array.isArray(historico) || !historico.some((item) => typeof item[campo] === 'number')) return null;
  return historico.reduce((soma, item) => soma + (Number.isFinite(item[campo]) ? item[campo] : 0), 0);
}

/** "Proventos recebidos" de Ações/FIIs a partir do histórico.
 * 23/09/2026 #3: o card lia a coluna "Proventos Totais" de Auxiliar_ativos,
 * que só soma os tickers da carteira de HOJE - some tudo o que foi lançado
 * com código antigo (ex.: nome antigo de um FII). O histórico soma a aba
 * Proventos inteira.
 * 23/09/2026 #7 (Controle 10): usa o campo diário proventos<Classe>
 * (HistoricoInicio.gs) - a conta antiga, Σ(fluxoAplicado − fluxoCaixa),
 * também pegava LUCRO DE VENDA (a venda da AXIA15G, custo 0, virava
 * "provento"). Sem o campo (back-end antigo), cai na conta antiga.
 * Resultado "desde o início" = Lucro/Prejuízo da posição + proventos +
 * lucro realizado nas vendas. */
export function proventosDoHistorico_(historico, campoProventos, campoCaixa, campoAplicado) {
  const proventos = somaCampoHistorico_(historico, campoProventos);
  if (proventos != null) return proventos;
  const aplicado = somaCampoHistorico_(historico, campoAplicado);
  const caixa = somaCampoHistorico_(historico, campoCaixa);
  if (aplicado == null || caixa == null) return null;
  return aplicado - caixa;
}

export function renderEvolucaoClasseCarteiras(doc, container, historico, { campoValor, campoInvestido = 'investidoAcumulado', comInvestido = true, periodoId = '12m', legendaContainer = null, corToken = '--acoes', labelValor = 'Portfólio', labelInvestido = 'Valor aplicado', infoContainer = null, labelInfo = 'Patrimônio', moeda = 'BRL' } = {}) {
  // 24/09/2026: Ações EUA pode ser vista em dólar (moeda:'USD') - eixo,
  // tooltip e o bloco de valor em cima mudam de moeda juntos.
  const formatarMoeda = moeda === 'USD' ? formatUSD : formatBRL;
  const prefixoEixo = moeda === 'USD' ? 'US$' : 'R$';
  if (!container || !campoValor) return;
  // 20/09/2026 (pedido do Tiago): "Desde o início" (periodoId:'tudo') corta
  // pro início desta visão/classe específica, não o início do patrimônio
  // total - ver comentário de filtrarHistoricoPorPeriodo (inicio.js).
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId, campoValor);
  const valoresPrincipal = janela.map((item) => (typeof item[campoValor] === 'number' && Number.isFinite(item[campoValor]) ? item[campoValor] : null));
  const valoresInvestido = comInvestido
    ? janela.map((item) => (typeof item[campoInvestido] === 'number' && Number.isFinite(item[campoInvestido]) ? item[campoInvestido] : null))
    : null;
  // 23/09/2026 #8: valor + variação no período em cima do gráfico, das
  // MESMAS duas linhas desenhadas abaixo (ver inicio.js!renderInfoEvolucao).
  renderInfoEvolucao(doc, infoContainer, { label: labelInfo, valores: valoresPrincipal, investidos: valoresInvestido, formatarMoeda });
  const validos = valoresPrincipal.filter((v) => v != null);
  if (validos.length < 2) {
    container.innerHTML = '<p class="hint">Sem histórico suficiente ainda pra desenhar o gráfico nesse período.</p>';
    if (legendaContainer) legendaContainer.innerHTML = '';
    return;
  }

  const W = Math.max(container.clientWidth || 0, 280);
  const H = 190;
  const padL = 76, // 24/09/2026: 60 cortava "R$ 11,7 mil"/"US$ 3,9 mil" (fonte mono 9,5px)
    padR = 8, padT = 12, padB = 22;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const todosValores = [...valoresPrincipal, ...(valoresInvestido || [])].filter((v) => v != null);
  let minV = Math.min(...todosValores), maxV = Math.max(...todosValores);
  const folga = (maxV - minV) * 0.12 || Math.abs(maxV) * 0.05 || 1;
  minV -= folga; maxV += folga;

  const n = valoresPrincipal.length;
  const y = (v) => padT + plotH * (1 - (v - minV) / (maxV - minV));
  const x = (i) => padL + plotW * (n > 1 ? i / (n - 1) : 0);

  const ticks = 4;
  let gridSvg = '';
  for (let t = 0; t <= ticks; t += 1) {
    const v = minV + (maxV - minV) * (t / ticks);
    const yy = y(v);
    gridSvg += `<line class="gridline" x1="${padL}" x2="${W - padR}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/>`;
    gridSvg += `<text class="axislabel" x="${padL - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end">${prefixoEixo} ${COMPACTO_BRL_CARTEIRAS.format(v)}</text>`;
  }

  // Cartão estreito (Longo Prazo/Emergência lado a lado no desktop) cabe
  // menos rótulo de data sem amontoar - mesmo cuidado de
  // renderGraficoRentabilidade (inicio.js).
  const passos = W < 460 ? 3 : (W < 720 ? 4 : 5);
  let xLabelsSvg = '';
  for (let i = 0; i < passos; i += 1) {
    const idx = Math.round((n - 1) * (i / (passos - 1)));
    const xx = padL + plotW * (i / (passos - 1));
    const ancora = i === 0 ? 'start' : (i === passos - 1 ? 'end' : 'middle');
    xLabelsSvg += `<text class="axislabel" x="${xx.toFixed(1)}" y="${H - 7}" text-anchor="${ancora}">${formatDateBR(janela[idx].data)}</text>`;
  }

  function pathD_(valores) {
    let d = '';
    let comecou = false;
    valores.forEach((v, i) => {
      if (v == null) { comecou = false; return; }
      const px = x(i), py = y(v);
      d += comecou ? ` L${px.toFixed(1)},${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`;
      comecou = true;
    });
    return d;
  }

  let primeiroIdx = -1, ultimoIdx = -1;
  valoresPrincipal.forEach((v, i) => { if (v != null) { if (primeiroIdx === -1) primeiroIdx = i; ultimoIdx = i; } });
  const linhaPrincipalD = pathD_(valoresPrincipal);
  const linhaInvestidoD = valoresInvestido ? pathD_(valoresInvestido) : '';
  const areaD = comInvestido ? `${linhaPrincipalD} L${x(ultimoIdx).toFixed(1)},${(H - padB).toFixed(1)} L${x(primeiroIdx).toFixed(1)},${(H - padB).toFixed(1)} Z` : '';

  container.innerHTML = `
    <svg class="rentab-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
      ${gridSvg}${xLabelsSvg}
      ${comInvestido ? `<path d="${areaD}" fill="var(${corToken})" fill-opacity="0.1" stroke="none"/>` : ''}
      ${comInvestido ? `<path d="${linhaInvestidoD}" fill="none" stroke="var(--ink-muted)" stroke-width="2" stroke-dasharray="6 4"/>` : ''}
      <path d="${linhaPrincipalD}" fill="none" stroke="var(${corToken})" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <g class="rentab-hover" hidden>
        <line class="rentab-hover-linha" x1="0" x2="0" y1="${padT}" y2="${H - padB}"/>
        <circle class="rentab-hover-ponto" data-serie="principal" r="3.6" fill="var(${corToken})" hidden/>
        ${comInvestido ? `<circle class="rentab-hover-ponto" data-serie="investido" r="3.2" fill="var(--ink-muted)" hidden/>` : ''}
      </g>
      <rect class="rentab-hitarea" x="${padL}" y="${padT}" width="${Math.max(plotW, 0)}" height="${Math.max(plotH, 0)}" fill="transparent" pointer-events="all"/>
    </svg>
    <div class="rentab-tooltip" hidden></div>
  `;

  ligarInteracaoEvolucaoClasse_(container, { janela, valoresPrincipal, valoresInvestido, x, y, padL, plotW, W, corToken, labelValor, labelInvestido, formatarValor: formatarMoeda });

  if (legendaContainer) {
    legendaContainer.innerHTML = comInvestido ? `
      <span class="li"><span class="swline" style="border-color:var(${corToken})"></span>${labelValor}</span>
      <span class="li"><span class="swline dash" style="border-color:var(--ink-muted)"></span>${labelInvestido}</span>
    ` : `
      <span class="li"><span class="swline" style="border-color:var(${corToken})"></span>${labelValor}</span>
    `;
  }
}

/**
 * Orquestrador: liga TODOS os gráficos de uma subpágina de classe (1
 * painel de Rentabilidade+Evolução nas 3 de renda variável, 3 pares nas
 * de Renda Fixa) a 1 ÚNICO filtro de período compartilhado
 * (`periodoTabsContainer`, sempre posicionado ACIMA do 1º gráfico da
 * página - "Rentabilidade acumulada" no mockup das 4 subpáginas, mesmo
 * pedido do Tiago de deixar "igual a home": 1 filtro no topo que afeta
 * TODOS os gráficos de uma vez, não 1 filtro por gráfico).
 *
 * O lado Rentabilidade é 100% delegado a wireGraficoRentabilidade
 * (inicio.js, o mesmo "motor" que a Início e a Visão geral já usam) -
 * `infoContainer` sempre null aqui (as 4 subpáginas de classe não têm o
 * cartão "valor atual + variação" que a Início/Visão geral mostram ao
 * lado do gráfico - o resumo em destaque no topo da página, ver
 * renderResumoClasseCarteiras, já cobre isso; renderInfoRentabilidade
 * ignora um container null de propósito, ver o guard `if (!container)
 * return`). O lado Evolução NÃO existe em wireGraficoRentabilidade (só
 * cuida de Rentabilidade) - por isso este orquestrador religa um 2º
 * conjunto de listeners, PRÓPRIO, nos MESMOS botões de período, mesma
 * técnica dos "2 conjuntos de listener independentes" já comprovada em
 * carteiras-visao-geral.js!desenhar (wireGraficoRentabilidade + o
 * listener manual de Evolução logo abaixo dele) - por isso NÃO chama
 * `botao.classList.toggle('active', ...)` aqui: wireGraficoRentabilidade
 * já faz isso no seu próprio listener (registrado primeiro, na chamada
 * acima), duplicar a troca de classe aqui seria trabalho de DOM à toa.
 *
 * `paineis` é `[{ visaoId, rentabChartContainer, rentabLegendaContainer,
 * evolucaoChartContainer, evolucaoLegendaContainer, corToken?,
 * labelValor?, labelInvestido?, comInvestido? }]` - o `campoValor`
 * (Rentabilidade E Evolução) e o `campoFluxo` de cada painel vêm de
 * CAMPO_PRINCIPAL_POR_VISAO/CAMPO_FLUXO_POR_VISAO (inicio.js) só pelo
 * `visaoId` - nenhum page module (carteiras-acoes.js etc.) precisa saber
 * o nome do campo bruto no histórico, só o id da visão, mesmo
 * desacoplamento que wireGraficoRentabilidade já garante pro lado
 * Rentabilidade. Um painel sem `rentabChartContainer`/
 * `evolucaoChartContainer` simplesmente não desenha aquele lado (nenhuma
 * subpágina usa isso hoje, mas evita quebrar se um dia um painel só
 * tiver 1 dos 2 gráficos).
 *
 * Idempotente (mesmo cuidado de sempre neste projeto - desenhar() roda 1x
 * com cache e outra com dado fresco/stale-while-revalidate, então sem
 * essa guarda os listeners do lado Evolução dobrariam a cada mount()) -
 * guardado por `periodoTabsContainer._evolucaoClasseWired`; chamadas
 * seguintes só atualizam o histórico mais recente (guardado fora do
 * closure dos listeners, em `_evolucaoClasseHistorico`/
 * `_evolucaoClasseDesenhar`) e redesenham no período atual, sem religar
 * nada.
 */
export function wireGraficosClasseCarteiras(doc, { historico, periodoTabsContainer, paineis = [], periodoInicial = '12m' } = {}) {
  wireGraficoRentabilidade(doc, {
    historico,
    periodoTabsContainer,
    periodoInicial,
    paineis: paineis
      .filter((p) => p.rentabChartContainer)
      .map((p) => ({
        visaoId: p.visaoId,
        chartContainer: p.rentabChartContainer,
        legendaContainer: p.rentabLegendaContainer,
        // 23/09/2026 #8: "R$ valor / +R$ ganho +x% no período" igual à Início
        infoContainer: p.rentabInfoContainer || null,
        labelInfo: p.labelInfo || null,
        formatarMoeda: p.moeda === 'USD' ? formatUSD : formatBRL,
      })),
  });

  const paineisEvolucao = paineis.filter((p) => p.evolucaoChartContainer);
  if (!paineisEvolucao.length || !periodoTabsContainer) return;

  function desenharEvolucao_(periodoId) {
    paineisEvolucao.forEach((p) => {
      // 21/09/2026 (pedido do Tiago): CAMPO_FLUXO_APLICADO_POR_VISAO, NAO
      // CAMPO_FLUXO_POR_VISAO - "Valor aplicado" nunca cai so por causa de
      // provento recebido (esse campo continua so pro TWR da Rentabilidade).
      const historicoAcumulado = comHistoricoAcumuladoClasse_(historico, CAMPO_FLUXO_APLICADO_POR_VISAO[p.visaoId]);
      renderEvolucaoClasseCarteiras(doc, p.evolucaoChartContainer, historicoAcumulado, {
        campoValor: CAMPO_PRINCIPAL_POR_VISAO[p.visaoId],
        periodoId,
        legendaContainer: p.evolucaoLegendaContainer,
        corToken: p.corToken || COR_PRINCIPAL_POR_VISAO[p.visaoId] || '--acoes',
        labelValor: p.labelValor || 'Portfólio',
        labelInvestido: p.labelInvestido || 'Valor aplicado',
        comInvestido: p.comInvestido !== false,
        infoContainer: p.evolucaoInfoContainer || null,
        labelInfo: p.labelInfoEvolucao || 'Patrimônio',
        moeda: p.moeda || 'BRL',
      });
    });
  }

  // Guardados fora do closure dos listeners (registrados só na 1ª
  // chamada, ver guarda `_evolucaoClasseWired` abaixo) - assim um
  // refresh automático (dado novo) sempre redesenha com o histórico MAIS
  // RECENTE, mesmo que o usuário troque de período bem depois da 1ª
  // carga (mesma técnica de `periodoTabsContainer._evolucaoHistorico` em
  // carteiras-visao-geral.js).
  periodoTabsContainer._evolucaoClasseHistorico = historico;
  periodoTabsContainer._evolucaoClasseDesenhar = desenharEvolucao_;

  const periodoAtual = periodoTabsContainer.querySelector('.filter-tab.active')?.dataset.periodo || periodoInicial;
  desenharEvolucao_(periodoAtual);

  if (periodoTabsContainer._evolucaoClasseWired) return;
  periodoTabsContainer._evolucaoClasseWired = true;

  periodoTabsContainer.querySelectorAll('.filter-tab').forEach((botao) => {
    botao.addEventListener('click', () => {
      periodoTabsContainer._evolucaoClasseDesenhar(botao.dataset.periodo);
    });
  });

  const janela = doc.defaultView;
  if (janela && typeof janela.addEventListener === 'function') {
    let timerResize = null;
    janela.addEventListener('resize', () => {
      if (timerResize) janela.clearTimeout(timerResize);
      timerResize = janela.setTimeout(() => {
        const periodoAgora = periodoTabsContainer.querySelector('.filter-tab.active')?.dataset.periodo || periodoInicial;
        periodoTabsContainer._evolucaoClasseDesenhar(periodoAgora);
      }, 150);
    });
  }
}

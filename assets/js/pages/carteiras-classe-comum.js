/**
 * carteiras-classe-comum.js — pedaços de renderização compartilhados pelas 4 subpáginas de classe de Carteiras
 * (Ações / FIIs / Ações Internacionais / Renda Fixa) e por quem mostra ativo em lista (logos, "i", selo de viés).
 * As 4 têm o mesmo formato de resposta (resumo + benchmarks + lista de ativos + distribuição por grupo — ver
 * apps-script/CarteirasClasses.gs e CarteirasRendaFixa.gs); só o detalhe de CADA ativo muda de classe pra classe:
 * por isso resumo/benchmarks/anel são genéricos aqui e a tabela é parametrizada por uma lista de colunas que cada page module
 * (carteiras-acoes.js etc.) monta com seus campos e formatadores.
 *
 * 06/10/2026 (Onda 3, fase 2 - kit Figma): tudo aqui virou o desenho do kit. O resumo são cards KPI (charts/kpi.js, via
 * carteiras-graficos.js), os benchmarks são chips tonais, o "por grupo" é o anel da biblioteca (charts/anel.js), a tabela é
 * `.card.card-flat > .tabela-wrap > table.tabela` (ordenação no cabeçalho com aria-sort, ticker pequeno acima do nome, variação
 * com ícone, selos tonais; no celular só as colunas essenciais e o resto aparece ao tocar na linha, numa folha). Os gráficos
 * de linha saíram daqui: moram em carteiras-graficos.js (criarGraficosCarteira). A CONTA continua a mesma de antes.
 */

import { formatBRL, formatUSD, formatPercentFromFraction, formatDiaHoraBR, variacaoNula } from '../format.js';
import { LOGOS_ATIVOS } from '../logos-ativos.js';
import { resolveSiteRootUrl } from '../shell.js';
import { esc } from '../util/html.js';
import { urlAtivoTicker, linkAtivoComNovaAbaHtml } from '../link-ativo.js';
import { abrirFolha } from '../ui/confirmar.js';
import { icone as iconeUi } from '../ui/dom.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { mostrarErroCarga } from '../ui/erro-carga.js';
import { montarKpis, desenharAnelDistribuicao, iconeMaterial, comHistoricoAcumuladoClasse_, destruirGraficos } from './carteiras-graficos.js';

export { comHistoricoAcumuladoClasse_ };

// ---------------------------------------------------------------------------
// Resumo (cards KPI)
// ---------------------------------------------------------------------------
/**
 * Cards KPI do topo de uma classe: Valor atual (com "Valor aplicado" embaixo), Lucro / Prejuízo (com % e seta), os `extras`
 * ({ rotulo, valor, sub, info }, hoje só "Proventos no mês") e "Ativos na carteira" (com a faixa comprar/aguardar quando `vies`).
 * `formatarValor` (padrão formatBRL) deixa reaproveitar em Ações EUA (US$). `cambio` / `equivalentesBrl` (só EUA) viram o "i" com o
 * equivalente em reais de cada valor em dólar. Devolve a lista de KPIs ({ atualizar, destruir }).
 */
export function renderResumoClasseCarteiras(doc, container, resumo, { corToken = '--acoes', extras = [], formatarValor = formatBRL, vies = null, cambio = null, equivalentesBrl = null, rotuloAtivos = 'Ativos na carteira', dono = container } = {}) {
  if (!container || !resumo) return [];
  const lucroBom = resumo.lucroPrejuizo >= 0;
  // 23/09/2026 #3: % calculado aqui, com todas as casas - a API manda a fração já arredondada pra 2 casas
  const percentualLucro = typeof resumo.totalInvestido === 'number' && resumo.totalInvestido !== 0 && typeof resumo.lucroPrejuizo === 'number'
    ? resumo.lucroPrejuizo / resumo.totalInvestido
    : resumo.percentualLucroPrejuizo;

  // 23/09/2026 #3 (Ações EUA): `equivalentesBrl` troca o "i" genérico (valor em US$ x câmbio de HOJE) por textos prontos
  const infoDe = (chave, valorUsd) => {
    if (equivalentesBrl && equivalentesBrl[chave]) return equivalentesBrl[chave];
    if (typeof valorUsd === 'number' && typeof cambio === 'number') return `Equivalente em reais: ${formatBRL(valorUsd * cambio)} (câmbio de hoje).`;
    return null;
  };

  let extraVies = null;
  let subAtivos = null;
  if (vies && typeof vies.comprar === 'number' && typeof vies.aguardar === 'number' && (vies.comprar + vies.aguardar) > 0) {
    const total = vies.comprar + vies.aguardar;
    const pctComprar = (vies.comprar / total) * 100;
    extraVies = doc.createElement('div');
    extraVies.className = 'cc-vies';
    extraVies.setAttribute('role', 'img');
    extraVies.setAttribute('aria-label', `${vies.comprar} para comprar e ${vies.aguardar} para aguardar`);
    const comprar = doc.createElement('span'); comprar.className = 'comprar'; comprar.style.width = `${pctComprar.toFixed(1)}%`;
    const aguardar = doc.createElement('span'); aguardar.className = 'aguardar'; aguardar.style.width = `${(100 - pctComprar).toFixed(1)}%`;
    extraVies.append(comprar, aguardar);
    subAtivos = `${vies.comprar} comprar · ${vies.aguardar} aguardar`;
  }

  return montarKpis(doc, container, [
    {
      rotulo: 'Valor atual', valor: resumo.totalAtualizado, formatar: formatarValor, info: infoDe('totalAtualizado', resumo.totalAtualizado),
      sub: `Valor aplicado: ${formatarValor(resumo.totalInvestido)}`, subInfo: infoDe('totalInvestido', resumo.totalInvestido), classe: 'cc-kpi-valor',
    },
    {
      rotulo: 'Lucro / Prejuízo', valor: resumo.lucroPrejuizo, formatar: formatarValor, info: infoDe('lucroPrejuizo', resumo.lucroPrejuizo),
      delta: typeof percentualLucro === 'number' && Number.isFinite(percentualLucro)
        ? { texto: formatPercentFromFraction(percentualLucro), sinal: variacaoNula(percentualLucro, { fracao: true }) ? 0 : (lucroBom ? 1 : -1) } : null,
    },
    ...extras.filter(Boolean).map((x) => ({ rotulo: x.rotulo || x.label, valor: x.valor, sub: x.sub, info: x.info, formatar: x.formatar })),
    { rotulo: rotuloAtivos, valor: resumo.quantidadeAtivos, formatar: (n) => String(Math.round(n)), sub: subAtivos, extra: extraVies },
  ], dono);
}

// ---------------------------------------------------------------------------
// Benchmarks (chips)
// ---------------------------------------------------------------------------
/**
 * Chips de referência (ex.: "Ibovespa hoje +0,54%" · "CDI (a.a.) 13,4%") — `itens` é `[{ label, valor, cor? }]`, já formatado pelo
 * chamador. `cor` ('good'/'bad') só nos índices que representam variação do dia (Ibovespa/IFIX/S&P 500): ganham seta e tom;
 * CDI/Selic/IPCA/Dólar são taxa/cotação de referência, ficam neutros.
 */
export function renderBenchmarksClasseCarteiras(doc, container, itens) {
  if (!container) return;
  container.replaceChildren();
  if (!itens || !itens.length) return;
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Índices de referência');
  itens.forEach((i) => {
    const chip = doc.createElement('span');
    chip.className = `chip-tonal cc-benchmark-chip${i.cor === 'good' ? ' chip-good' : i.cor === 'bad' ? ' chip-bad' : ''}`;
    if (i.cor) chip.append(iconeMaterial(doc, i.cor === 'good' ? 'sobe' : 'desce', 14));
    const rot = doc.createElement('span'); rot.className = 'cc-benchmark-label'; rot.textContent = i.label;
    const val = doc.createElement('b'); if (i.cor) val.className = i.cor; val.textContent = i.valor;
    chip.append(rot, val);
    container.append(chip);
  });
}

// ---------------------------------------------------------------------------
// Distribuição por grupo (anel)
// ---------------------------------------------------------------------------
/**
 * Anel "por grupo" (Setor/Segmento pra RV, Indexador pra Renda Fixa) com legenda ao lado. `cambio` (só Ações EUA): os totais de
 * `distribuicao` já vêm nativamente em US$; a legenda mostra o dólar e, entre parênteses, o equivalente em reais pelo câmbio de hoje
 * (19/09/2026 #6: "por default, mostra em dólar... e a versão em reais junto").
 */
export function renderDistribuicaoGrupoCarteiras(doc, container, distribuicao, { cambio = null, dono = container } = {}) {
  if (!container) return null;
  const fatias = (distribuicao || []).map((d) => ({ nome: d.grupo, valor: d.totalAtualizado }));
  const formatarValor = typeof cambio === 'number' ? (v) => `${formatUSD(v)} (${formatBRL(v * cambio)})` : formatBRL;
  return desenharAnelDistribuicao(doc, container, fatias, { formatarValor, aria: 'Composição por grupo', tamanho: 200, dono });
}

// ---------------------------------------------------------------------------
// Logos
// ---------------------------------------------------------------------------
/**
 * Logo redondo do ativo (LOGOS_ATIVOS, gerado por scripts/gerar-logos-ativos.mjs). HTML-string porque as listas montam a linha
 * inteira via innerHTML: a <img> tem onerror inline que remove ela mesma se a imagem falhar, revelando o fallback de iniciais
 * que já está por baixo. (Versão `.cc-logo`, usada por Aportes/Lançamentos/Proventos; a tabela de Carteiras usa `.logo-circulo`.)
 */
export function logoAtivoHtml(ticker) {
  const iniciais = (ticker || '?').slice(0, 2).toUpperCase();
  const caminho = LOGOS_ATIVOS[ticker];
  if (!caminho) return `<span class="cc-logo cc-logo-fallback">${iniciais}</span>`;
  const url = new URL(caminho, resolveSiteRootUrl()).href;
  return `<span class="cc-logo"><img src="${url}" alt="" loading="lazy" onerror="this.remove()"><span class="cc-logo-fallback">${iniciais}</span></span>`;
}

// 25/09/2026 (Tiago, ponto 6): 3 imagens genéricas pra renda fixa, por tipo de título (não por ticker).
function imagemRendaFixa_(a) {
  const indexador = String(a.indexador || '').toUpperCase();
  const tipo = String(a.tipoInvestimento || '').toUpperCase();
  const instituicao = String(a.instituicao || '').toUpperCase();
  if (indexador.includes('SELIC')) return 'assets/imgs/tesouro-selic.webp';
  if (indexador.includes('IPCA')) return 'assets/imgs/tesouro-direto.webp';
  if (tipo.includes('LCI') && instituicao.includes('INTER')) return 'assets/imgs/banco-inter.png';
  return null;
}
const iniciaisRendaFixa_ = (a) => String(a.instituicao || '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'RF';

export function logoRendaFixaHtml(a) {
  const imagem = imagemRendaFixa_(a);
  const iniciais = iniciaisRendaFixa_(a);
  if (!imagem) return `<span class="cc-logo cc-logo-fallback">${iniciais}</span>`;
  const url = new URL(imagem, resolveSiteRootUrl()).href;
  return `<span class="cc-logo"><img src="${url}" alt="" loading="lazy" onerror="this.remove()"><span class="cc-logo-fallback">${iniciais}</span></span>`;
}

/** Logo no formato do kit (`.logo-circulo`, 40px) - ação/FII/ETF por ticker. */
export function logoCirculoHtml(ticker) {
  const iniciais = esc((ticker || '?').slice(0, 2).toUpperCase());
  const caminho = LOGOS_ATIVOS[ticker];
  if (!caminho) return `<span class="logo-circulo" aria-hidden="true">${iniciais}</span>`;
  const url = new URL(caminho, resolveSiteRootUrl()).href;
  return `<span class="logo-circulo" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">${iniciais}</span>`;
}

/** Logo `.logo-circulo` de um título de renda fixa. */
export function logoCirculoRendaFixaHtml(a) {
  const imagem = imagemRendaFixa_(a);
  const iniciais = esc(iniciaisRendaFixa_(a));
  if (!imagem) return `<span class="logo-circulo" aria-hidden="true">${iniciais}</span>`;
  const url = new URL(imagem, resolveSiteRootUrl()).href;
  return `<span class="logo-circulo" aria-hidden="true"><img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove()">${iniciais}</span>`;
}

// ---------------------------------------------------------------------------
// "i" com tooltip
// ---------------------------------------------------------------------------
/**
 * "i" que abre uma tooltip por toque/hover - NÃO é `title` nativo (que não aparece no toque; 19/09/2026 #4). Usa o marcador
 * genérico ".info-alvo"/".info-icon", ligado por wirePointerTooltipCarteiras_. `pequeno` = tamanho reduzido pra dentro de célula.
 */
export function botaoInfoHtml(texto, { pequeno = false } = {}) {
  if (!texto) return '';
  const classeIcone = pequeno ? 'info-icon cc-info-icon-sm' : 'info-icon';
  return ` <span class="info-alvo" data-tooltip="${esc(texto)}"><span class="${classeIcone}">i</span></span>`;
}

/** "i" com o equivalente em reais de um valor em US$ (câmbio de hoje); '' sem câmbio. */
export function equivalenteBrlHtml_(valorUsd, cambio) {
  if (typeof valorUsd !== 'number' || typeof cambio !== 'number') return '';
  return botaoInfoHtml(`Equivalente em reais: ${formatBRL(valorUsd * cambio)} (câmbio de hoje).`, { pequeno: true });
}

/**
 * Tooltip por Pointer Events (mouse E toque) pra qualquer ".info-alvo" com `dataset.tooltip` dentro de `container` (cabeçalho de
 * coluna, nota de ativo, equivalente em R$, "i" dos cards KPI). Delegado no container ESTÁVEL de cada subpágina; guardado por
 * `container._ccTooltipWired`. Teclado: foco no "i" mostra, Esc/blur esconde.
 */
export function wirePointerTooltipCarteiras_(doc, container) {
  if (!container || container._ccTooltipWired) return;
  container._ccTooltipWired = true;

  const janela = doc.defaultView;
  const tooltip = doc.createElement('div');
  tooltip.className = 'info-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  (doc.body || container).appendChild(tooltip);

  let alvoAberto = null;

  function esconder_() { tooltip.hidden = true; alvoAberto = null; }

  function mostrar_(alvo, clientX, clientY) {
    const texto = alvo.dataset.tooltip;
    if (!texto) { esconder_(); return; }
    tooltip.textContent = texto;
    tooltip.hidden = false;
    const larguraJanela = (janela && janela.innerWidth) || 1000;
    const alturaJanela = (janela && janela.innerHeight) || 800;
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;
    let esquerda = clientX + 14;
    let topo = clientY + 14;
    if (esquerda + tw > larguraJanela - 12) esquerda = clientX - tw - 14;
    if (esquerda < 8) esquerda = 8;
    if (topo + th > alturaJanela - 12) topo = clientY - th - 14;
    tooltip.style.left = `${esquerda}px`;
    tooltip.style.top = `${topo}px`;
  }

  function aoMoverOuTocar_(ev) {
    const alvo = typeof ev.target.closest === 'function' ? ev.target.closest('.info-alvo') : null;
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') {
      if (ev.type !== 'pointerdown' || !alvo) return;
      if (alvoAberto === alvo) { esconder_(); return; }
      alvoAberto = alvo;
      mostrar_(alvo, ev.clientX, ev.clientY);
      return;
    }
    if (!alvo) { esconder_(); return; }
    mostrar_(alvo, ev.clientX, ev.clientY);
  }
  function aoSairPonteiro_(ev) { if (ev.pointerType === 'touch' || ev.pointerType === 'pen') return; esconder_(); }
  function aoTocarFora_(ev) {
    if (!alvoAberto) return;
    const alvo = ev.target;
    if (tooltip.contains(alvo) || alvoAberto.contains(alvo)) return;
    esconder_();
  }
  function aoFocar_(ev) {
    const alvo = typeof ev.target.closest === 'function' ? ev.target.closest('.info-alvo') : null;
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    alvoAberto = alvo;
    mostrar_(alvo, r.left, r.bottom);
  }

  container.addEventListener('pointermove', aoMoverOuTocar_);
  container.addEventListener('pointerdown', aoMoverOuTocar_);
  container.addEventListener('pointerleave', aoSairPonteiro_);
  container.addEventListener('focusin', aoFocar_);
  container.addEventListener('focusout', esconder_);
  container.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') esconder_(); });
  (doc.body ? doc : container).addEventListener('pointerdown', aoTocarFora_, true);
}

/** Observações curtas por ticker (19/09/2026 #3: "AXIA15G é uma ação de subscrição, inclua um i, explique o que é"). Mapa fixo. */
const NOTAS_ATIVOS = {
  AXIA15G: 'Ação de subscrição: um direito que dá ao acionista a opção de comprar novas ações emitidas pela empresa num aumento de capital, geralmente por um preço menor que o de mercado. Não tem histórico de preço nem fundamentos (P/L, P/VP, DY) como uma ação normal — por isso essas colunas aparecem vazias para este ativo.',
};

/** "i" pequeno antes do ticker quando o ativo tem uma nota conhecida - '' quando não tem. */
export function notaAtivoHtml(ticker) {
  return botaoInfoHtml(NOTAS_ATIVOS[ticker], { pequeno: true });
}

// ---------------------------------------------------------------------------
// Busca e filtros
// ---------------------------------------------------------------------------
/** Filtra ativos por ticker/nome (substring, sem diferenciar maiúsculas) - caixa de busca das subpáginas. Busca vazia devolve a lista inteira. */
export function filtrarAtivosPorBusca(ativos, busca) {
  const termo = (busca || '').trim().toLowerCase();
  if (!termo) return ativos;
  return (ativos || []).filter((a) => (a.ticker || '').toLowerCase().includes(termo) || (a.nome || '').toLowerCase().includes(termo));
}

/**
 * Barra de busca (campo do kit) + chips de filtro por grupo (FIIs: segmento; Renda Fixa: tipo de carteira), acima da tabela.
 * Renderiza 1x por desenho da página (redesenhar a cada tecla tiraria o foco do campo): `onBuscar`/`onFiltrarGrupo` re-renderizam
 * só a TABELA. Chips = `.chip` com aria-pressed.
 */
export function renderFiltrosTabelaCarteiras(doc, container, { busca = '', onBuscar, grupos = null, filtroGrupo = null, onFiltrarGrupo } = {}) {
  if (!container) return;
  container.replaceChildren();
  const linha = doc.createElement('div');
  linha.className = 'cc-filtros-linha';
  if (grupos && grupos.length) {
    const chips = doc.createElement('div');
    chips.className = 'cc-filtro-chips';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filtrar por grupo');
    [{ rotulo: 'Todos', valor: '' }, ...grupos.map((g) => ({ rotulo: g, valor: g }))].forEach((g) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'chip filter-tab';
      b.dataset.grupo = g.valor;
      b.textContent = g.rotulo;
      const ativo = (filtroGrupo === null ? '' : filtroGrupo) === g.valor;
      b.classList.toggle('active', ativo); b.classList.toggle('on', ativo);
      b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
      b.addEventListener('click', () => {
        chips.querySelectorAll('[data-grupo]').forEach((x) => {
          const on = x === b; x.classList.toggle('active', on); x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        if (onFiltrarGrupo) onFiltrarGrupo(g.valor || null);
      });
      chips.append(b);
    });
    linha.append(chips);
  }
  const caixa = doc.createElement('label');
  caixa.className = 'cc-busca-caixa';
  const rot = doc.createElement('span'); rot.className = 'sr-only'; rot.textContent = 'Buscar por ticker ou nome';
  const ico = iconeUi(doc, 'search', 'ico cc-busca-icone');
  const input = doc.createElement('input');
  input.type = 'search'; input.className = 'input cc-busca-input'; input.placeholder = 'Buscar por ticker ou nome'; input.value = busca;
  input.setAttribute('autocomplete', 'off');
  if (onBuscar) input.addEventListener('input', (ev) => onBuscar(ev.target.value));
  caixa.append(rot, ico, input);
  linha.append(caixa);
  container.append(linha);
  const dica = doc.createElement('p');
  dica.className = 'hint cc-filtros-dica';
  dica.textContent = `${grupos && grupos.length ? 'O filtro também recalcula os totais no rodapé da tabela · ' : ''}Toque no título de uma coluna pra ordenar por ela`;
  container.append(dica);
}

// ---------------------------------------------------------------------------
// Tabela de ativos (kit)
// ---------------------------------------------------------------------------
/** Variação em % com ícone (kit: `.var.sobe|desce`): nunca só cor. `fracao` = valor em fração (0,013 = 1,3%). '' se não numérico. */
export function variacaoHtml(fracao, { casas = 2 } = {}) {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao)) return '';
  const nula = variacaoNula(fracao, { fracao: true });
  const classe = nula ? '' : (fracao >= 0 ? 'sobe' : 'desce');
  const ico = nula ? 'trending-flat' : (fracao >= 0 ? 'arrow-circle-up' : 'arrow-circle-down');
  return `<span class="var ${classe}"><svg class="ico" aria-hidden="true"><use href="#ico-${ico}"/></svg>${formatPercentFromFraction(fracao, casas)}</span>`;
}

/** Selo tonal do viés (Comprar/Aguardar) no formato do kit. '' quando não há viés. */
export function seloViesHtml(vies) {
  const s = statusVies(vies);
  return s.classe ? `<span class="chip-tonal ${s.classe === 'good' ? 'chip-good' : 'chip-warn'}">${s.texto}</span>` : '';
}

/** Célula "Ativo" do kit: logo + ticker pequeno (link) acima do nome. `logo` = HTML do .logo-circulo; `href` = tela do ativo. */
export function celulaAtivoHtml({ logo, ticker, href, nome = '', sufixoTicker = '', linkHtml }) {
  const link = linkHtml || `<a class="link-ativo" href="${esc(href)}">${esc(ticker)}</a>`;
  return `<div class="cel-ativo">${logo}<div class="cel-ativo-textos"><span class="cel-ativo-ticker">${sufixoTicker}${link}</span>${nome ? `<span class="cel-ativo-nome" title="${esc(nome)}">${esc(nome)}</span>` : ''}</div></div>`;
}

/** Célula "Ativo" de Ações/FIIs/Ações EUA: logo + ticker (link, com ↗ de nova aba no desktop) acima do nome + grupo. */
export function celulaAtivoRendaVariavelHtml(a) {
  const nomeGrupo = [a.nome, a.grupo].filter(Boolean).join(' · ');
  const url = urlAtivoTicker(a.ticker);
  return celulaAtivoHtml({ logo: logoCirculoHtml(a.ticker), ticker: a.ticker, nome: nomeGrupo, sufixoTicker: notaAtivoHtml(a.ticker), linkHtml: linkAtivoComNovaAbaHtml(url, esc(a.ticker), a.ticker) });
}

const MQ_CELULAR = '(max-width: 719.98px)';

/**
 * Tabela de ativos genérica. `colunas`: `[{ label, campo?, ordenarPor?(a)=>valor, formatar(a)=>HTML, ajuda?, num?, opc?, topo? }]`.
 *   - `num`  : número (mono, à direita);  `opc` : coluna opcional (some no celular; o toque na linha mostra tudo numa folha);
 *   - `topo` : a coluna do ativo (logo + ticker + nome) - sem rótulo na folha.
 * `ajuda` vira um "i" com tooltip no cabeçalho; `campo`+`ordenarPor` deixam a coluna ordenável (th[aria-sort] > button). O toque no "i"
 * NUNCA ordena. Sem ordenação ativa, cai em Total atualizado (maior posição primeiro). `linhaTotalHtml` = 1 <tr> do rodapé (some se vazio).
 */
export function renderTabelaAtivosCarteiras(doc, container, ativos, colunas, { linhaTotalHtml = '', ordenacao = null, onOrdenar = null, tituloFolha = null, acaoFolha = null } = {}) {
  if (!container) return;
  if (!ativos || !ativos.length) {
    container.innerHTML = '<p class="hint cc-vazio">Nenhum ativo encontrado nesta carteira.</p>';
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

  const classeCol = (c) => [c.num ? 'num' : '', c.opc ? 'col-opc' : '', c.topo ? 'cc-col-ativo' : ''].filter(Boolean).join(' ');
  const cabecalho = colunas.map((c) => {
    const ordenavel = typeof c.ordenarPor === 'function';
    const ativa = ordenavel && ordenacao && ordenacao.campo === c.campo;
    const sort = ativa ? ` aria-sort="${ordenacao.direcao === 'asc' ? 'ascending' : 'descending'}"` : '';
    const ico = ativa ? 'arrow-downward' : 'unfold-more';
    const rotulo = ordenavel
      ? `<button type="button" data-campo="${esc(c.campo)}">${esc(c.label)}<svg class="ico" aria-hidden="true"><use href="#ico-${ico}"/></svg></button>`
      : esc(c.label);
    const cls = [classeCol(c), ordenavel ? 'cc-th-ordenavel' : ''].filter(Boolean).join(' ');
    return `<th scope="col"${cls ? ` class="${cls}"` : ''}${ordenavel ? ` data-campo="${esc(c.campo)}"` : ''}${sort}>${rotulo}${c.ajuda ? botaoInfoHtml(c.ajuda) : ''}</th>`;
  }).join('');
  const linhas = lista.map((ativo, i) => {
    const celulas = colunas.map((c) => {
      const cls = classeCol(c);
      return `<td${cls ? ` class="${cls}"` : ''}${c.topo ? '' : ` data-label="${esc(c.label)}"`}>${c.formatar(ativo)}</td>`;
    }).join('');
    return `<tr data-i="${i}">${celulas}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="card card-flat cc-card-tabela">
      <div class="tabela-wrap">
        <table class="tabela cc-tabela">
          <thead><tr>${cabecalho}</tr></thead>
          <tbody>${linhas}</tbody>
          ${linhaTotalHtml ? `<tfoot>${linhaTotalHtml}</tfoot>` : ''}
        </table>
      </div>
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

  // celular: o toque na linha mostra todas as colunas numa folha (a tabela só tem as essenciais)
  const win = doc.defaultView;
  const noCelular = () => { try { return !!(win && win.matchMedia && win.matchMedia(MQ_CELULAR).matches); } catch (e) { return false; } };
  container.querySelectorAll('tbody tr').forEach((tr) => {
    tr.addEventListener('click', (ev) => {
      if (!noCelular()) return;
      if (ev.target.closest && ev.target.closest('a, button, .info-alvo')) return;
      const ativo = lista[Number(tr.dataset.i)];
      if (ativo) abrirDetalheLinha_(doc, ativo, colunas, { titulo: tituloFolha ? tituloFolha(ativo) : (ativo.ticker || ativo.nome || 'Detalhes'), acao: acaoFolha ? acaoFolha(ativo) : null });
    });
  });
}

/**
 * <tr> do rodapé da tabela: uma célula por coluna (assim as colunas opcionais somem junto com as do corpo no celular). A 1ª coluna leva o
 * `rotulo` ("Total (14 ativos)"); `porCampo` = { <campo da coluna>: HTML } nas colunas que têm total.
 */
export function linhaTotalHtml(colunas, rotulo, porCampo = {}) {
  const tds = colunas.map((c, i) => {
    const cls = [c.num ? 'num' : '', c.opc ? 'col-opc' : '', i === 0 ? 'cc-col-ativo' : ''].filter(Boolean).join(' ');
    const conteudo = i === 0 ? esc(rotulo) : (porCampo[c.campo] || '');
    return `<td${cls ? ` class="${cls}"` : ''}${i === 0 || !porCampo[c.campo] ? '' : ` data-label="${esc(c.label)}"`}>${conteudo}</td>`;
  }).join('');
  return `<tr>${tds}</tr>`;
}

/** Folha com o detalhe completo da linha (celular): um par rótulo/valor por coluna. */
function abrirDetalheLinha_(doc, ativo, colunas, { titulo, acao }) {
  const dl = doc.createElement('dl');
  dl.className = 'cc-folha-lista';
  colunas.filter((c) => !c.topo).forEach((c) => {
    const linha = doc.createElement('div');
    const dt = doc.createElement('dt'); dt.textContent = c.label;
    const dd = doc.createElement('dd'); dd.innerHTML = c.formatar(ativo);
    linha.append(dt, dd);
    dl.append(linha);
  });
  if (acao && acao.href) {
    const a = doc.createElement('a');
    a.className = 'btn btn-tonal btn-bloco cc-folha-link'; a.href = acao.href; a.textContent = acao.rotulo || 'Abrir a página do ativo';
    dl.append(a);
  }
  abrirFolha({ titulo, conteudo: dl, doc, acoes: [{ id: 'fechar', rotulo: 'Fechar', classe: 'btn-text', valor: true, foco: true }] });
}

/** "Comprar" (good) / "Aguardar" (warn) / sem dado (—) — Auxiliar_ativos guarda o texto bruto, então compara sem diferenciar maiúsculas. */
export function statusVies(vies) {
  const v = (vies || '').toLowerCase();
  if (v === 'comprar') return { texto: 'Comprar', classe: 'good' };
  if (v === 'aguardar') return { texto: 'Aguardar', classe: 'warn' };
  return { texto: '—', classe: '' };
}

/** Conta quantos ativos estão "Comprar" vs "Aguardar" - alimenta a faixa comprar/aguardar do card "Ativos na carteira". */
export function contarVies_(ativos) {
  let comprar = 0, aguardar = 0;
  (ativos || []).forEach((a) => {
    const status = statusVies(a.vies);
    if (status.classe === 'good') comprar += 1;
    else if (status.classe === 'warn') aguardar += 1;
  });
  return { comprar, aguardar };
}

/** 05/10/2026 (A-41): o histórico novo é o mesmo que já está desenhado? (compara tamanho, 1º e último dia) */
export function mesmoHistorico(a, b) {
  return a === b || (!!a && !!b && a.length === b.length
    && JSON.stringify(a[a.length - 1]) === JSON.stringify(b[b.length - 1]) && JSON.stringify(a[0]) === JSON.stringify(b[0]));
}

/** 23/09/2026 #3: soma de um campo diário do histórico (ex.: fluxoAplicadoAcoesEua). null quando o histórico não tem o campo. */
export function somaCampoHistorico_(historico, campo) {
  if (!Array.isArray(historico) || !historico.some((item) => typeof item[campo] === 'number')) return null;
  return historico.reduce((soma, item) => soma + (Number.isFinite(item[campo]) ? item[campo] : 0), 0);
}

/**
 * "Proventos recebidos" de Ações/FIIs a partir do histórico (23/09/2026 #3 e #7 Controle 10): usa o campo diário proventos<Classe>
 * (HistoricoInicio.gs); sem ele (back-end antigo), cai na conta antiga Σ(fluxoAplicado − fluxoCaixa).
 */
export function proventosDoHistorico_(historico, campoProventos, campoCaixa, campoAplicado) {
  const proventos = somaCampoHistorico_(historico, campoProventos);
  if (proventos != null) return proventos;
  const aplicado = somaCampoHistorico_(historico, campoAplicado);
  const caixa = somaCampoHistorico_(historico, campoCaixa);
  if (aplicado == null || caixa == null) return null;
  return aplicado - caixa;
}

// ---------------------------------------------------------------------------
// Esqueleto e seções recolhíveis das subpáginas
// ---------------------------------------------------------------------------
/**
 * Seção recolhível (<details>): em telas longas as seções 2+ ficam fechadas no celular (A-59/A-65). `nome` identifica a seção pra
 * lembrar aberto/fechado entre redesenhos (a página troca o conteúdo mais de uma vez: cache -> dado novo -> histórico).
 */
export function secaoRecolhivelHtml({ nome, id, titulo, hint = '', corpoHtml = '', classe = '' }) {
  return `<details class="cc-recolhivel ${classe}" data-secao="${esc(nome)}" id="${esc(id)}"><summary><span class="cc-recolhivel-titulo">${esc(titulo)}</span>${hint ? `<span class="hint">${esc(hint)}</span>` : ''}<svg class="ico cc-recolhivel-seta" aria-hidden="true"><use href="#ico-expand-more"/></svg></summary><div class="cc-recolhivel-corpo">${corpoHtml}</div></details>`;
}

/** Guarda o aberto/fechado das seções recolhíveis de `raiz` (chame ANTES de trocar o conteúdo). */
export function lerEstadoSecoes(raiz) {
  const estado = {};
  if (raiz) raiz.querySelectorAll('details[data-secao]').forEach((d) => { estado[d.dataset.secao] = d.open; });
  return estado;
}

/** Reaplica o estado guardado; sem estado, abre no desktop e fecha no celular (`abertasNoCelular` = nomes que ficam abertas sempre). */
export function aplicarEstadoSecoes(doc, raiz, estado = {}, { abertasNoCelular = [] } = {}) {
  if (!raiz) return;
  const win = doc.defaultView;
  let celular = false;
  try { celular = !!(win && win.matchMedia && win.matchMedia(MQ_CELULAR).matches); } catch (e) { celular = false; }
  raiz.querySelectorAll('details[data-secao]').forEach((d) => {
    const nome = d.dataset.secao;
    d.open = Object.prototype.hasOwnProperty.call(estado, nome) ? estado[nome] : (!celular || abertasNoCelular.includes(nome));
  });
}

/** Linha de links "Carteira recomendada: ..." (25/09/2026) - chips de link discretos. `links` = [{ rotulo, href }]. */
export function linksRelevantesHtml(links) {
  if (!links || !links.length) return '';
  return `<div class="cc-links-relevantes">${links.map((l) => `<a class="chip cc-link-relevante" href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.rotulo)} ↗</a>`).join('')}</div>`;
}

/** Texto "N ativo(s)" / "N posição(ões)". */
export const contagemTexto = (n, singular = 'ativo', plural = 'ativos') => `${n} ${n === 1 ? singular : plural}`;

// ---------------------------------------------------------------------------
// Tabela com busca / filtro / ordenação (estado local do desenho)
// ---------------------------------------------------------------------------
/**
 * Liga busca + chips de grupo + ordenação a uma tabela de ativos. O estado (ordenação, busca, grupo) é local a este desenho: reseta a cada
 * carregamento, igual ao Radar de oportunidades. `linhaTotal(exibidos)` devolve o <tr> do rodapé (somado do que está EXIBIDO, então
 * acompanha a busca e o filtro). Devolve { renderizar }.
 */
export function montarTabelaFiltravel(doc, { filtrosEl, tabelaEl, ativos, colunas, linhaTotal, grupos = null, tituloFolha = null, acaoFolha = null }) {
  let ordenacao = null;
  let busca = '';
  let filtroGrupo = null;
  function renderizar() {
    let exibidos = filtroGrupo ? ativos.filter((a) => a.grupo === filtroGrupo) : ativos;
    exibidos = filtrarAtivosPorBusca(exibidos, busca);
    renderTabelaAtivosCarteiras(doc, tabelaEl, exibidos, colunas, {
      linhaTotalHtml: exibidos.length && linhaTotal ? linhaTotal(exibidos) : '',
      ordenacao, tituloFolha, acaoFolha,
      onOrdenar: (campo) => {
        ordenacao = ordenacao && ordenacao.campo === campo ? { campo, direcao: ordenacao.direcao === 'asc' ? 'desc' : 'asc' } : { campo, direcao: 'asc' };
        renderizar();
      },
    });
  }
  renderFiltrosTabelaCarteiras(doc, filtrosEl, {
    busca, onBuscar: (valor) => { busca = valor; renderizar(); },
    grupos, filtroGrupo, onFiltrarGrupo: grupos ? (g) => { filtroGrupo = g; renderizar(); } : undefined,
  });
  renderizar();
  return { renderizar };
}

/** Esqueleto das 4 subpáginas de classe (ids `${p}Resumo|Benchmarks|Graficos|Distribuicao|Filtros|Tabela`). */
export function esqueletoClasseHtml({ prefixo: p, links = '', tituloDistribuicao, tituloLista, contagem, extrasAposLista = '', antesDoResumo = '' }) {
  return `
    ${links}
    ${antesDoResumo}
    <div id="${p}Resumo"></div>
    <div id="${p}Benchmarks" class="cc-benchmarks"></div>
    <div id="${p}Graficos" class="cc-graficos"></div>
    ${secaoRecolhivelHtml({ nome: 'distribuicao', id: `${p}DistribuicaoSecao`, titulo: tituloDistribuicao, corpoHtml: `<div class="cc-distribuicao" id="${p}Distribuicao"></div>` })}
    <section class="cc-ativos" aria-labelledby="${p}AtivosTitulo">
      <div class="cc-secao-cab"><h2 id="${p}AtivosTitulo">${esc(tituloLista)}</h2><span class="hint">${esc(contagem)}</span></div>
      <div id="${p}Filtros"></div>
      <div id="${p}Tabela"></div>
    </section>
    ${extrasAposLista}
  `;
}

// ---------------------------------------------------------------------------
// Carga de uma subpágina de classe (cache -> API da carteira + histórico da Início em paralelo)
// ---------------------------------------------------------------------------
const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

/** Aviso discreto "mostrando os dados guardados" (a tela continua utilizável; detalhes técnicos fechados). */
export function mostrarAvisoDadosGuardados(doc, el, { quando, resposta, aoTentar }) {
  el.hidden = false;
  el.textContent = '';
  const caixa = doc.createElement('div');
  caixa.className = 'avisos-banner cc-aviso-cache';
  caixa.setAttribute('role', 'status');
  const txt = doc.createElement('span');
  txt.textContent = `Mostrando os dados guardados${quando ? ` de ${quando}` : ''} — não deu pra atualizar agora.`;
  caixa.append(txt);
  if (aoTentar) {
    const b = doc.createElement('button'); b.type = 'button'; b.className = 'btn btn-text btn-sm'; b.textContent = 'Tentar de novo';
    b.addEventListener('click', () => aoTentar());
    caixa.append(b);
  }
  const det = [resposta && resposta.etapa ? `etapa: ${resposta.etapa}` : '', resposta && resposta.erro ? `erro: ${resposta.erro}` : ''].filter(Boolean).join('\n');
  if (det) {
    const d = doc.createElement('details'); d.className = 'estado-detalhe';
    const sm = doc.createElement('summary'); sm.textContent = 'Detalhes técnicos';
    const pre = doc.createElement('pre'); pre.textContent = det;
    d.append(sm, pre); caixa.append(d);
  }
  el.append(caixa);
}

/**
 * Monta uma subpágina de classe. `buscarCarteira(token)` é a ação da planilha (getCarteirasAcoes...), `desenhar(doc, dados, { historicoPendente })`
 * pinta a tela (dados = carteira + historico + proventosAnunciados). O histórico (getHome, pesado) é pedido em paralelo mas NÃO segura o
 * desenho: a carteira pinta quando responde e os gráficos são refeitos quando o histórico chega. Falha sem cache = estado de erro padrão
 * com "Tentar de novo"; falha com cache = a tela fica e entra um aviso discreto.
 */
export async function montarPaginaClasseCarteiras(token, { doc, prefixo, tela, chaveCache, buscarCarteira, getHomeImpl, desenhar, depoisDeDesenhar = () => {} }) {
  const loadingEl = doc.getElementById(`${prefixo}Loading`);
  const erroEl = doc.getElementById(`${prefixo}Erro`);
  const conteudoEl = doc.getElementById(`${prefixo}Conteudo`);
  const refreshControlEl = doc.getElementById(`refreshControl${maiuscula(prefixo)}`);

  const [cacheCarteira, cacheHome] = await Promise.all([lerCacheDados(chaveCache), lerCacheDados('home')]);
  let historicoNaTela = cacheHome && cacheHome.dados ? cacheHome.dados.historico || null : null;
  let anunciadosNaTela = cacheHome && cacheHome.dados ? cacheHome.dados.proventosAnunciados || null : null;
  let mostrando = null; // o que está na tela (cache ou resposta): um erro não apaga

  const pintar = (carteira, opcoes) => {
    destruirGraficos(conteudoEl);
    conteudoEl.querySelectorAll('.cc-graficos').forEach((g) => destruirGraficos(g)); // o bloco de gráficos registra no próprio contêiner
    desenhar(doc, { ...carteira, historico: historicoNaTela, proventosAnunciados: anunciadosNaTela }, opcoes);
    depoisDeDesenhar(doc);
  };

  if (cacheCarteira) {
    mostrando = cacheCarteira;
    pintar(cacheCarteira.dados, { historicoPendente: !historicoNaTela });
    if (loadingEl) loadingEl.hidden = true;
    conteudoEl.hidden = false;
  }

  async function carregarERedesenhar() {
    // 05/10/2026 (A-41): getHome (histórico lento) em paralelo, sem segurar a tela
    const promessaHome = Promise.resolve().then(() => getHomeImpl(token)).catch((err) => ({ ok: false, etapa: 'home', erro: String(err) }));
    let resposta;
    try { resposta = await buscarCarteira(token); } catch (erro) { resposta = { ok: false, etapa: 'network', erro: String((erro && erro.message) || erro) }; }
    if (loadingEl) loadingEl.hidden = true;

    if (!resposta || !resposta.ok) {
      if (mostrando) {
        mostrarAvisoDadosGuardados(doc, erroEl, { quando: mostrando.ts ? formatDiaHoraBR(mostrando.ts) : null, resposta, aoTentar: carregarERedesenhar });
        conteudoEl.hidden = false;
      } else {
        mostrarErroCarga(erroEl, { tela, resposta, aoTentar: carregarERedesenhar, doc });
        conteudoEl.hidden = true;
      }
      return false;
    }

    erroEl.hidden = true; erroEl.textContent = '';
    mostrando = { ts: Date.now(), dados: resposta.carteira };
    conteudoEl.hidden = false;
    pintar(resposta.carteira, { historicoPendente: !historicoNaTela });
    gravarCacheDados(chaveCache, resposta.carteira);

    const respostaHome = await promessaHome;
    if (respostaHome.ok && respostaHome.historico) {
      // só refaz a tela se o histórico (ou os proventos anunciados) mudou em relação ao que já está desenhado
      const mudou = !mesmoHistorico(historicoNaTela, respostaHome.historico)
        || JSON.stringify(anunciadosNaTela) !== JSON.stringify(respostaHome.proventosAnunciados || null);
      if (mudou) {
        historicoNaTela = respostaHome.historico || null;
        anunciadosNaTela = respostaHome.proventosAnunciados || null;
        pintar(resposta.carteira, {});
      }
    } else if (!historicoNaTela) {
      // getHome falhou e não há histórico guardado: troca o "Carregando" pelo aviso (os cards de gráfico ganham "Tentar de novo")
      pintar(resposta.carteira, { historicoFalhou: true, aoTentarGraficos: carregarERedesenhar });
    }
    return true;
  }

  // 26/09/2026: o "Atualizar dados" entra ANTES da 1ª busca e fica fora do conteúdo (visível no carregamento e no erro também)
  await mountRefreshControl(doc, refreshControlEl, carregarERedesenhar).atualizar();
}

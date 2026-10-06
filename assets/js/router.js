/**
 * router.js — client-side "tab" navigation between the pages the shell
 * already knows how to render (Início / Distribuições e Metas), without
 * a full browser page reload.
 *
 * 16/09/2026: pedido do Tiago - antes, cada uma dessas duas "abas" era
 * um arquivo HTML separado e independente (index.html,
 * distribuicoes-metas.html); trocar de uma pra outra era sempre uma
 * navegação de página CHEIA do navegador - tudo recarregava do zero,
 * inclusive coisas que deveriam persistir entre abas (o popover de
 * sincronização do header, que reiniciava e buscava o status de novo a
 * cada troca) e coisas que já tinham acabado de ser buscadas segundos
 * antes (voltar pra uma aba já visitada buscava tudo de novo). Esse
 * módulo resolve isso: as duas páginas moram no MESMO documento (o
 * conteúdo de cada uma vem de assets/partials/pages.html, mesmo padrão
 * de assets/partials/shell.html pro header/footer), e trocar de aba só
 * esconde/mostra o <main> de cada uma - nunca busca dado de novo numa
 * troca, só na 1ª visita de cada aba (mount() é chamado exatamente 1x
 * por aba, por sessão de página). A URL muda via history.pushState (sem
 * navegação de verdade), então o botão voltar/avançar do navegador e um
 * F5 continuam funcionando normalmente.
 *
 * O timer de atualização automática de 5 em 5 min que cada página já
 * tinha (ver shell.js!mountRefreshControl, ligado dentro de
 * montarPaginaInicio/montarPaginaDistribuicoesMetas) continua rodando
 * sozinho depois da 1ª visita, mesmo com a aba fora de foco - é
 * exatamente esse timer que agora cobre o pedido do Tiago de "atualiza
 * de novo se passar 5 minutos, mas não a cada troca de aba": antes ele
 * morria a cada reload (cada troca de aba matava e recriava o timer);
 * agora, sem reload, ele sobrevive e continua contando naturalmente.
 *
 * Só as rotas registradas em ROUTES interceptam a navegação - os outros
 * itens do menu (Carteiras/Transações/Proventos/Organização, ver
 * assets/partials/shell.html) ainda não existem como página nenhuma,
 * então seus links continuam sendo navegação normal do navegador.
 */

import { TEMPLATE_METAS } from './pages/metas-template.js'; // só o HTML da aba Metas (o código da tela é lazy, ver rotaLazy)
import { markActiveSection } from './shell.js';

/**
 * 06/10/2026 (A-42, carga por tela): a tela de cada aba (pages/*.js, 100-150 KB cada + o que ela arrasta) só é importada - com
 * import() - quando a aba é aberta pela primeira vez; antes o router importava as 3 estaticamente e qualquer uma das 3 URLs
 * baixava o código das outras duas (37-70 módulos). O CSS da tela (assets/css/<nome>.css) vem junto com o import(): o HTML de
 * entrada só linka o CSS da própria aba (ver tests/carga-telas.test.js) e as outras folhas entram aqui, na primeira visita
 * (o <main> só aparece depois que a folha carregou, pra não piscar sem estilo).
 *
 * Campos extras de uma rota lazy: `carregar()` -> import() do módulo da tela, `css` -> folhas da tela (relativas a assets/css/),
 * `mount` -> importa o módulo (se ainda não veio) e chama a função de montagem. `mount` continua sendo o contrato do router.
 */
function rotaLazy({ carregar, montar, ...resto }) {
  return {
    ...resto,
    carregar,
    mount: async (token, opcoes) => (await carregar())[montar](token, opcoes),
  };
}

/**
 * Uma entrada por "aba" que o router sabe montar sem reload. `href` tem
 * que bater exatamente com o atributo href do <a class="nav-link"> em
 * assets/partials/shell.html (mesmo valor relativo, funciona tanto na
 * raiz quanto num subpath do GitHub Pages sem nenhuma resolução
 * especial) - é também o valor usado em history.pushState.
 */
export const ROUTES = [
  rotaLazy({
    key: 'inicio',
    href: 'index.html',
    title: 'Início · Patrimônio', // 06/10/2026 (A-69): "<Subaba> · <Seção> · Patrimônio"
    containerId: 'page-inicio',
    templateId: 'page-inicio-template',
    css: ['charts.css', 'componentes-grafico.css', 'comum-telas.css', 'inicio.css'],
    carregar: () => import('./pages/inicio.js'),
    montar: 'montarPaginaInicio',
  }),
  rotaLazy({
    key: 'distribuicoes',
    href: 'distribuicoes-metas.html',
    title: 'Acompanhamento de Ativos · Patrimônio', // 02/10/2026: era "Distribuições e Metas" (Tiago renomeou o menu); 06/10/2026 (A-69): formato do título
    containerId: 'page-distribuicoes',
    templateId: 'page-distribuicoes-template',
    css: ['charts.css', 'comum-telas.css', 'distribuicoes-metas.css'],
    carregar: () => import('./pages/distribuicoes-metas.js'),
    montar: 'montarPaginaDistribuicoesMetas',
  }),
  // 02/10/2026: menu "Metas e Objetivos" (pages/metas.js). O conteúdo vem de
  // TEMPLATE_METAS (templateHtml) em vez de assets/partials/pages.html.
  rotaLazy({
    key: 'metas',
    href: 'metas.html',
    title: 'Metas e Objetivos',
    containerId: 'page-metas',
    templateId: 'page-metas-template',
    templateHtml: TEMPLATE_METAS,
    css: ['charts.css', 'componentes-grafico.css', 'comum-telas.css', 'distribuicoes-metas.css', 'metas.css'],
    carregar: () => import('./pages/metas.js'),
    montar: 'montarPaginaMetas',
  }),
];

/** URL absoluta de uma folha em assets/css/ (relativa a ESTE arquivo: funciona na raiz e num subpath do GitHub Pages). */
export function urlCss(nome) {
  return new URL(`../css/${nome}`, import.meta.url).href;
}

/**
 * Garante que as folhas da rota estão no <head> e carregadas. As que o HTML de entrada já linka (href igual) contam como
 * presentes; as outras viram <link rel="stylesheet"> e a promessa só resolve no `load` (ou `error`, ou em `limiteMs` - nunca
 * trava a aba por causa de uma folha).
 */
export function carregarCssDaRota(rota, doc, { limiteMs = 4000 } = {}) {
  const nomes = (rota && rota.css) || [];
  if (!nomes.length || !doc || !doc.head) return Promise.resolve();
  const existentes = new Map([...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => [l.href, l]));
  return Promise.all(nomes.map((nome) => new Promise((resolve) => {
    const href = urlCss(nome);
    let link = existentes.get(href);
    if (link && (link.sheet || link.dataset.cssPronto === '1' || !link.dataset.cssLazy)) { resolve(); return; }
    if (!link) {
      link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.cssLazy = '1';
      doc.head.appendChild(link);
    }
    const pronto = () => { link.dataset.cssPronto = '1'; resolve(); };
    link.addEventListener('load', pronto, { once: true });
    link.addEventListener('error', pronto, { once: true });
    setTimeout(pronto, limiteMs);
  })));
}

/**
 * O partial sempre mora em assets/partials/pages.html relativo a ESTE
 * arquivo (assets/js/router.js) - mesmo truque do import.meta.url já
 * usado em shell.js!resolveShellPartialUrl, funciona tanto servido da
 * raiz do domínio quanto de um subpath do GitHub Pages.
 */
export function resolvePagesPartialUrl() {
  return new URL('../partials/pages.html', import.meta.url).href;
}

/** Busca o HTML bruto do partial. */
export async function fetchPagesPartial(url, fetchImpl = fetch) {
  // 26/09/2026: cache 'no-cache' = o navegador sempre confere com o servidor
  // (ETag/If-Modified-Since, 304 se nada mudou). Sem isso o GitHub Pages
  // (max-age=600) deixava o partial até 10 min velho enquanto o JS já era o
  // novo - a Início nova abria no HTML antigo (sem índices, sem coluna lateral).
  const response = await fetchImpl(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`pages.html fetch failed: ${response.status}`);
  }
  return response.text();
}

/**
 * Extrai o <template> de cada rota do HTML bruto do partial - mesma
 * técnica de shell.js!parseShellPartial (div descartável no próprio
 * documento do caller, pra que os nós resultantes já pertençam a esse
 * documento).
 */
export function parsePagesPartial(html, doc = document, routes = ROUTES) {
  const container = doc.createElement('div');
  container.innerHTML = html;
  const templates = {};
  routes.forEach((route) => {
    let template = container.querySelector(`#${route.templateId}`);
    if (!template && route.templateHtml) { // 02/10/2026: rota com o próprio HTML (ex. Metas)
      template = doc.createElement('template');
      template.innerHTML = route.templateHtml;
    }
    if (!template) {
      throw new Error(`pages.html is missing #${route.templateId}`);
    }
    templates[route.key] = template.content;
  });
  return templates;
}

/**
 * Cria o <main id="..."> de cada rota (escondido por padrão) com o
 * conteúdo do template correspondente, e anexa dentro de `mount` (o
 * container entre o header e o footer do shell). Roda 1x só, na
 * inicialização do router - todo o markup das duas abas entra no DOM de
 * uma vez (é só HTML estático, sem nenhum dado ainda), só o mount()
 * (que busca dado de verdade) é adiado pra quando a aba é visitada de
 * verdade (ver ativar_ em mountRouter).
 */
export function injectPageContainers(doc, mount, templates, routes = ROUTES) {
  routes.forEach((route) => {
    const main = doc.createElement('main');
    main.id = route.containerId;
    main.hidden = true;
    main.appendChild(templates[route.key].cloneNode(true));
    mount.appendChild(main);
  });
}

/**
 * Decide qual rota corresponde a um pathname de verdade (location.pathname,
 * de um clique em nav-link resolvido, ou do próprio F5/link direto).
 * Compara só o ÚLTIMO segmento do path com route.href - funciona igual
 * na raiz do domínio, num subpath do GitHub Pages, ou com a barra final
 * (sem nome de arquivo, que o servidor resolve pra index.html) - esse
 * último caso cai no fallback (1ª rota da lista, "inicio") por não ter
 * nenhum segmento de arquivo pra comparar.
 */
export function resolveRouteKey(pathname, routes = ROUTES) {
  const ultimoSegmento = (pathname || '').split('/').filter(Boolean).pop() || '';
  const rota = routes.find((route) => route.href === ultimoSegmento);
  return rota ? rota.key : routes[0].key;
}

/**
 * Real-world entry point: injeta as 2 abas no DOM, ativa a rota que bate
 * com a URL atual (SEM empilhar histórico - já estamos nela), monta
 * essa 1ª aba de verdade (busca os dados), e liga os cliques do menu +
 * voltar/avançar do navegador pras trocas seguintes, sempre sem reload.
 *
 * `token` é repassado pra cada route.mount(token, { doc }) igual hoje
 * cada página passava pro seu próprio montarPaginaX - nenhuma das duas
 * funções de página muda de assinatura por causa do router.
 */
export async function mountRouter(doc, {
  token,
  routes = ROUTES,
  fetchImpl = typeof fetch !== 'undefined' ? fetch : undefined,
  winImpl = typeof window !== 'undefined' ? window : undefined,
  partialUrl = resolvePagesPartialUrl(),
} = {}) {
  const mountPoint = doc.getElementById('app-pages');
  if (!mountPoint) {
    console.error('router.js: no #app-pages mount point found on this page');
    return null;
  }

  const html = await fetchPagesPartial(partialUrl, fetchImpl);
  const templates = parsePagesPartial(html, doc, routes);
  injectPageContainers(doc, mountPoint, templates, routes);

  const montado = new Set();
  let chaveAtual = null;

  let sequencia = 0;

  /** Mostra só o <main> da rota (e atualiza menu, título e URL). */
  function mostrar(rota, empilharHistorico) {
    routes.forEach((r) => {
      const el = doc.getElementById(r.containerId);
      if (el) el.hidden = r.key !== rota.key;
    });
    if (empilharHistorico && winImpl && winImpl.history) {
      winImpl.history.pushState({ routeKey: rota.key }, '', rota.href);
    }
  }

  async function ativar(key, { empilharHistorico = true } = {}) {
    const rota = routes.find((r) => r.key === key);
    if (!rota) return;
    if (key === chaveAtual) return; // já está na aba - clique redundante, nada a fazer

    const minhaVez = ++sequencia;
    chaveAtual = key;
    markActiveSection(doc, key);
    doc.body.dataset.section = key;
    doc.title = rota.title;
    // URL e menu mudam na hora do clique; o <main> novo só aparece quando o código e o CSS da aba chegaram (1ª visita) -
    // até lá a aba anterior continua na tela em vez de um esqueleto sem estilo.
    const primeiraVisita = !montado.has(key);
    if (primeiraVisita && (rota.carregar || (rota.css && rota.css.length))) {
      if (empilharHistorico && winImpl && winImpl.history) winImpl.history.pushState({ routeKey: key }, '', rota.href);
      try {
        await Promise.all([carregarCssDaRota(rota, doc), rota.carregar ? rota.carregar() : null]);
      } catch (error) {
        console.error(`router.js: falha ao carregar a aba "${key}"`, error);
      }
      if (minhaVez !== sequencia) return; // o usuário já foi pra outra aba enquanto esta carregava
      mostrar(rota, false);
    } else {
      mostrar(rota, empilharHistorico);
    }

    if (!montado.has(key)) {
      montado.add(key);
      try {
        await rota.mount(token, { doc });
      } catch (error) {
        console.error(`router.js: falha ao montar a aba "${key}"`, error);
      }
    }
  }

  doc.querySelectorAll('.nav-link[data-section]').forEach((link) => {
    const key = link.dataset.section;
    if (!routes.some((r) => r.key === key)) return; // rota ainda não existe (Carteiras etc.) - navegação normal
    link.addEventListener('click', (event) => {
      // Ctrl/Cmd/Shift/Alt+clique ou clique com botão diferente do
      // esquerdo têm que continuar abrindo em nova aba/janela, do jeito
      // que o navegador já faz sozinho pra qualquer link - só o clique
      // "normal" vira troca de aba sem reload.
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      ativar(key);
    });
  });

  if (winImpl) {
    winImpl.addEventListener('popstate', () => {
      const key = resolveRouteKey(winImpl.location.pathname, routes);
      ativar(key, { empilharHistorico: false });
    });
  }

  const chaveInicial = winImpl ? resolveRouteKey(winImpl.location.pathname, routes) : routes[0].key;
  await ativar(chaveInicial, { empilharHistorico: false });

  return { ativar };
}

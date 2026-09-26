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

import { montarPaginaInicio } from './pages/inicio.js';
import { montarPaginaDistribuicoesMetas } from './pages/distribuicoes-metas.js';
import { markActiveSection } from './shell.js';

/**
 * Uma entrada por "aba" que o router sabe montar sem reload. `href` tem
 * que bater exatamente com o atributo href do <a class="nav-link"> em
 * assets/partials/shell.html (mesmo valor relativo, funciona tanto na
 * raiz quanto num subpath do GitHub Pages sem nenhuma resolução
 * especial) - é também o valor usado em history.pushState.
 */
export const ROUTES = [
  {
    key: 'inicio',
    href: 'index.html',
    title: 'Patrimônio',
    containerId: 'page-inicio',
    templateId: 'page-inicio-template',
    mount: montarPaginaInicio,
  },
  {
    key: 'distribuicoes',
    href: 'distribuicoes-metas.html',
    title: 'Distribuições e Metas',
    containerId: 'page-distribuicoes',
    templateId: 'page-distribuicoes-template',
    mount: montarPaginaDistribuicoesMetas,
  },
];

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
    const template = container.querySelector(`#${route.templateId}`);
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

  async function ativar(key, { empilharHistorico = true } = {}) {
    const rota = routes.find((r) => r.key === key);
    if (!rota) return;
    if (key === chaveAtual) return; // já está na aba - clique redundante, nada a fazer

    routes.forEach((r) => {
      const el = doc.getElementById(r.containerId);
      if (el) el.hidden = r.key !== key;
    });
    markActiveSection(doc, key);
    doc.body.dataset.section = key;
    doc.title = rota.title;
    chaveAtual = key;

    if (empilharHistorico && winImpl && winImpl.history) {
      winImpl.history.pushState({ routeKey: key }, '', rota.href);
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

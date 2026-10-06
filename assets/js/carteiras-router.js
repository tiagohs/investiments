/**
 * carteiras-router.js — troca de "aba" dentro de Carteiras (Visão geral / Ações / FIIs / Ações Internacionais / Renda Fixa), sem
 * reload. As 5 <section id="page-<key>"> já estão no carteiras/index.html; cada mount() só busca dado na 1ª visita e a troca é só
 * mostrar/esconder (mesma ideia do `montado` Set de router.js).
 *
 * 06/10/2026 (Onda 3, fase 2): o submenu vertical virou o cabeçalho padrão da página (ui/pagina.js): título "Carteiras", subtítulo da
 * aba, abas em pílula (Visão geral | Ações | FIIs | Ações Internacionais | Renda Fixa), o "Atualizar dados" da aba aberta e o botão
 * "Adicionar ativo". O document.title acompanha a aba ("Ações · Carteiras · Patrimônio").
 */

import { montarPaginaCarteirasVisaoGeral } from './pages/carteiras-visao-geral.js';
import { montarPaginaCarteirasAcoes } from './pages/carteiras-acoes.js';
import { montarPaginaCarteirasFiis } from './pages/carteiras-fiis.js';
import { montarPaginaCarteirasAcoesEua } from './pages/carteiras-acoes-eua.js';
import { montarPaginaCarteirasRendaFixa } from './pages/carteiras-renda-fixa.js';
import { getHome } from './api-client.js';
import { criarGetHomeCompartilhado } from './cache-dados.js';
import { montarCabecalhoPagina, definirTituloPagina } from './ui/pagina.js';
import { criar, icone } from './ui/dom.js';

export const SECAO_CARTEIRAS = 'Carteiras';

export const CARTEIRAS_PAGINAS = [
  { key: 'visao-geral', titulo: 'Visão geral', refreshId: 'refreshControlVisaoGeral', subtitulo: 'Tudo o que você tem investido, numa tela só.', mount: montarPaginaCarteirasVisaoGeral },
  { key: 'acoes', titulo: 'Ações', refreshId: 'refreshControlAcoes', subtitulo: 'Suas ações brasileiras: posição, viés de compra e proventos.', mount: montarPaginaCarteirasAcoes },
  { key: 'fiis', titulo: 'FIIs', refreshId: 'refreshControlFiis', subtitulo: 'Seus fundos imobiliários: posição, rendimentos e viés de compra.', mount: montarPaginaCarteirasFiis },
  { key: 'acoes-eua', titulo: 'Ações Internacionais', refreshId: 'refreshControlAcoesEua', subtitulo: 'Suas ações nos EUA, em dólar e em reais.', mount: montarPaginaCarteirasAcoesEua },
  { key: 'renda-fixa', titulo: 'Renda Fixa', refreshId: 'refreshControlRendaFixa', subtitulo: 'Seus títulos de renda fixa: carteira de longo prazo e reserva de emergência.', mount: montarPaginaCarteirasRendaFixa },
];

export async function mountCarteirasRouter(doc, { token, paginas = CARTEIRAS_PAGINAS, getHomeImpl = getHome } = {}) {
  // 25/09/2026: as 5 subpáginas usam o histórico da Início - uma chamada só pra todas
  const getHomeCompartilhado = criarGetHomeCompartilhado(getHomeImpl);
  const montado = new Set();
  let chaveAtual = null;

  const hashInicial = ((doc.defaultView && doc.defaultView.location && doc.defaultView.location.hash) || '').replace(/^#/, '');
  const chaveInicial = paginas.some((p) => p.key === hashInicial) ? hashInicial : paginas[0].key;

  // Cabeçalho montado ANTES de qualquer await: título e abas aparecem na hora, mesmo com a primeira carga demorando.
  const refreshEls = paginas.map((p) => {
    const e = criar(doc, 'div', { class: 'refresh-control', id: p.refreshId });
    e.hidden = p.key !== chaveInicial;
    return e;
  });
  const botaoNovo = criar(doc, 'button', { type: 'button', class: 'btn btn-filled', 'data-novo-ativo': '', title: 'Adicionar ativo' }, [icone(doc, 'add'), criar(doc, 'span', { texto: 'Adicionar ativo' })]);
  const cabEl = doc.getElementById('carteirasCabecalho');
  const inicial = paginas.find((p) => p.key === chaveInicial);
  const cab = cabEl ? montarCabecalhoPagina(cabEl, {
    secao: SECAO_CARTEIRAS, subaba: inicial.titulo, titulo: SECAO_CARTEIRAS, subtitulo: inicial.subtitulo,
    acoes: [...refreshEls, botaoNovo],
    abas: {
      pilula: {
        rotulo: 'Carteiras', ativo: chaveInicial, itens: paginas.map((p) => ({ id: p.key, rotulo: p.titulo })),
        aoMudar: (id) => { ativar(id); },
      },
    },
    doc,
  }) : null;

  async function ativar(key) {
    const pagina = paginas.find((p) => p.key === key);
    if (!pagina || key === chaveAtual) return;

    paginas.forEach((p, i) => {
      const secao = doc.getElementById(`page-${p.key}`);
      if (secao) secao.hidden = p.key !== key;
      refreshEls[i].hidden = p.key !== key;
    });
    if (cab) {
      cab.definirSubtitulo(pagina.subtitulo);
      if (cab.abas.pilula) cab.abas.pilula.selecionar(key);
    }
    definirTituloPagina({ subaba: pagina.titulo, secao: SECAO_CARTEIRAS }, doc);
    chaveAtual = key;
    // 25/09/2026: a subpágina fica no endereço (#acoes) - a tela do ativo volta direto pra ela ("Carteiras › Ações"), e recarregar não perde.
    const win = doc.defaultView;
    if (win && win.history && typeof win.history.replaceState === 'function') {
      const hash = key === paginas[0].key ? '' : `#${key}`;
      try {
        if ((win.location.hash || '') !== hash) win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}${hash}`);
      } catch (e) { /* about:blank (testes) etc. - o endereço é só conveniência */ }
    }

    if (!montado.has(key)) {
      montado.add(key);
      try {
        await pagina.mount(token, { doc, getHomeImpl: getHomeCompartilhado });
      } catch (error) {
        console.error(`carteiras-router.js: falha ao montar a página "${key}"`, error);
      }
    }
  }

  await ativar(chaveInicial);

  return { ativar };
}

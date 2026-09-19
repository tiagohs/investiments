/**
 * carteiras-router.js — troca de "aba" dentro do mini-app Carteiras
 * (Visão geral / Ações / FIIs / Ações Internacionais / Renda Fixa), sem
 * reload — mesmo espírito de router.js (Início/Distribuições), mas bem
 * mais simples: aqui não existem 2 arquivos HTML de entrada, então não
 * precisa de fetch de partial nem de pushState/popstate — as 5
 * <section> já estão todas no próprio carteiras/index.html (ver
 * comentário lá), cada mount() só busca dado na 1ª visita (mesma ideia
 * do `montado` Set de router.js) e a URL nunca muda.
 *
 * O item da sidebar não é um <a href>, é um <button data-page> — dentro
 * de Carteiras a navegação é só um estado local de UI, não uma rota de
 * verdade (ver decisão registrada: Carteiras é "mini-app com sidebar
 * própria", não mais rotas no router.js principal).
 */

import { montarPaginaCarteirasVisaoGeral } from './pages/carteiras-visao-geral.js';
import { montarPaginaCarteirasAcoes } from './pages/carteiras-acoes.js';
import { montarPaginaCarteirasFiis } from './pages/carteiras-fiis.js';
import { montarPaginaCarteirasAcoesEua } from './pages/carteiras-acoes-eua.js';
import { montarPaginaCarteirasRendaFixa } from './pages/carteiras-renda-fixa.js';

export const CARTEIRAS_PAGINAS = [
  { key: 'visao-geral', titulo: 'Visão geral', mount: montarPaginaCarteirasVisaoGeral },
  { key: 'acoes', titulo: 'Ações', mount: montarPaginaCarteirasAcoes },
  { key: 'fiis', titulo: 'FIIs', mount: montarPaginaCarteirasFiis },
  { key: 'acoes-eua', titulo: 'Ações Internacionais', mount: montarPaginaCarteirasAcoesEua },
  { key: 'renda-fixa', titulo: 'Renda Fixa', mount: montarPaginaCarteirasRendaFixa },
];

export async function mountCarteirasRouter(doc, { token, paginas = CARTEIRAS_PAGINAS } = {}) {
  const sideItems = Array.from(doc.querySelectorAll('.side-item[data-page]'));
  const tituloMobile = doc.getElementById('carteirasMobileTitle');
  const montado = new Set();
  let chaveAtual = null;

  async function ativar(key) {
    const pagina = paginas.find((p) => p.key === key);
    if (!pagina || key === chaveAtual) return;

    paginas.forEach((p) => {
      const secao = doc.getElementById(`page-${p.key}`);
      if (secao) secao.hidden = p.key !== key;
    });
    sideItems.forEach((item) => item.classList.toggle('active', item.dataset.page === key));
    if (tituloMobile) tituloMobile.textContent = pagina.titulo;
    chaveAtual = key;

    if (!montado.has(key)) {
      montado.add(key);
      try {
        await pagina.mount(token, { doc });
      } catch (error) {
        console.error(`carteiras-router.js: falha ao montar a página "${key}"`, error);
      }
    }
  }

  sideItems.forEach((item) => {
    item.addEventListener('click', () => ativar(item.dataset.page));
  });

  await ativar(paginas[0].key);

  return { ativar };
}

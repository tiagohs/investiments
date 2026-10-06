/**
 * ui/breadcrumb.js — trilha "Carteiras > Ações > PETR4" das telas de detalhe (05/10/2026, kit).
 * Todos os itens com `href` são links; o último é a página atual (aria-current="page").
 *
 *   criarBreadcrumb(el, [{ rotulo: 'Carteiras', href: '../carteiras/index.html' }, { rotulo: 'Ações', href: '../carteiras/index.html#acoes' }, { rotulo: 'PETR4' }]);
 */
import { criar, icone } from './dom.js';

export function criarBreadcrumb(container, itens = [], { rotulo = 'Você está em', doc } = {}) {
  const d = doc || container.ownerDocument;
  function desenhar(lista) {
    container.textContent = '';
    container.classList.add('breadcrumb');
    container.setAttribute('aria-label', rotulo);
    const ol = criar(d, 'ol');
    lista.forEach((item, i) => {
      const ultimo = i === lista.length - 1;
      const li = criar(d, 'li');
      if (ultimo || !item.href) {
        li.append(criar(d, 'span', { texto: item.rotulo, 'aria-current': ultimo ? 'page' : null }));
      } else {
        li.append(criar(d, 'a', { href: item.href, texto: item.rotulo }));
      }
      if (!ultimo) li.append(criar(d, 'span', { class: 'bc-sep', 'aria-hidden': 'true' }, [icone(d, 'chev-r', 'ico')]));
      ol.append(li);
    });
    container.append(ol);
  }
  desenhar(itens);
  return { el: container, atualizar: desenhar };
}

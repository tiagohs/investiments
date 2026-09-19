/**
 * carteiras-sidebar.js — pedacinho compartilhado entre carteiras-router.js
 * e pages/carteiras-visao-geral.js: mapeia o `nome` de cada card de
 * action=carteirasHome (ver apps-script/CarteirasHome.gs!montarCarteirasHome_)
 * pra chave de página (data-page) e atualiza o "% do patrimônio" que
 * aparece ao lado de cada item do menu — só a Visão geral busca
 * carteirasHome (as 4 subpáginas não precisam desse dado), por isso mora
 * separado dos dois módulos que o usam, em vez de dentro de um deles
 * (evita import circular entre router e page module).
 */

export const CHAVE_PAGINA_POR_NOME_CARD = {
  'Ações': 'acoes',
  'FIIs': 'fiis',
  'Ações Internacionais': 'acoes-eua',
  'Renda Fixa': 'renda-fixa',
};

/** Sem sinal de +/- (é sempre uma fatia positiva do patrimônio, não uma
 * variação) - por isso não usa formatPercentFromFraction (que sempre
 * antepõe "+"). Arredonda pro inteiro mais próximo - é só o número ao
 * lado do menu, o valor com casas decimais já aparece no card da
 * própria página. */
export function atualizarBadgesSideNav(doc, cards) {
  (cards || []).forEach((card) => {
    const chave = CHAVE_PAGINA_POR_NOME_CARD[card.nome];
    if (!chave) return;
    const el = doc.getElementById(`sidePct-${chave}`);
    if (el && typeof card.percentualDoPatrimonio === 'number') {
      el.textContent = `${Math.round(card.percentualDoPatrimonio * 100)}%`;
    }
  });
}

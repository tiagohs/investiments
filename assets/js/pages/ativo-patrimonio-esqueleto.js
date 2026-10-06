/**
 * ativo-patrimonio-esqueleto.js - 06/10/2026 (A-42): só o esqueleto de "carregando" da aba Patrimônio dos FIIs. Separado de
 * ativo-patrimonio.js (45 KB com o cálculo) para a tela Ativo desenhar o placeholder sem baixar o módulo - que só é importado
 * quando o ativo é mesmo um FII. ativo-patrimonio.js reexporta (compatibilidade).
 */

/** Aba vazia (antes de abrir): o controlador preenche. */
export function patrimonioPlaceholderHtml() {
  return '<div class="pf-raiz" id="pfRaiz" aria-live="polite"><div class="pf-carregando"><span class="skel pf-esq-resumo"></span><span class="skel pf-esq-bloco"></span></div></div>';
}

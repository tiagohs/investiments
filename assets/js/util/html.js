/**
 * util/html.js — escape de HTML, ÚNICO do site (05/10/2026, auditoria A-68).
 * Antes eram 26 cópias de `esc` (+3 `escHtml`/`escAttr`) e 3 variantes NÃO escapavam aspas
 * simples (videos.js, pages/ativo.js, ativo-patrimonio.js) - com texto vindo de feed externo
 * (vídeos, notícias) isso abria XSS em atributo delimitado por aspas simples.
 * Funções puras, sem DOM; aceitam null/undefined/número (viram texto) e ignoram argumentos
 * extras, então servem direto em `lista.map(esc)`.
 */

const MAPA_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Texto -> HTML seguro (conteúdo de elemento OU atributo, com aspas duplas ou simples). */
export function esc(valor) {
  return String(valor == null ? '' : valor).replace(/[&<>"']/g, (c) => MAPA_HTML[c]);
}

/** Valor de atributo (`title="..."`, `data-x='...'`): mesmo escape do `esc`; nome separado só pra deixar a intenção explícita. */
export function escAttr(valor) {
  return esc(valor);
}

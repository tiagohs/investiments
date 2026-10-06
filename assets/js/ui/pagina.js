/**
 * ui/pagina.js — cabeçalho padrão de página + document.title (05/10/2026, A-69).
 *
 *   const cab = montarCabecalhoPagina(el, {
 *     secao: 'Carteiras', subaba: 'Ações',                       // document.title = "Ações · Carteiras · Patrimônio"
 *     titulo: 'Ações',
 *     subtitulo: ['A carteira subiu ', { texto: '1,49%', tom: 'bom' }, ' hoje'],   // número-chave colorido inline
 *     breadcrumb: [{ rotulo: 'Carteiras', href: '...' }, { rotulo: 'Ações' }],      // telas de detalhe (opcional)
 *     refresh: true,                                              // cria o espaço do "Atualizar dados / Atualizado às"
 *     acoes: [botaoOuSwitch],                                     // controles à direita (CTA em pílula, switch...)
 *     abas: { pilula: { itens, ativo, aoMudar, rotulo }, sublinhada: { itens, ativo, aoMudar, rotulo } },
 *   });
 *   mountRefreshControl(doc, cab.refreshEl, carregar);   // shell.js
 *   cab.definirSubtitulo([...]);  cab.definirTitulo('Ações', { subaba: 'Ações' });
 */
import { criar } from './dom.js';
import { criarTabs } from './tabs.js';
import { criarBreadcrumb } from './breadcrumb.js';

export const NOME_APP = 'Patrimônio';

/** "<Subaba> · <Seção> · Patrimônio" (omite o que faltar; sem nada = "Patrimônio"). */
export function formatarTituloPagina({ subaba, secao } = {}) {
  const partes = [subaba, secao].filter((p) => p && String(p).trim() && p !== NOME_APP);
  return [...partes, NOME_APP].join(' · ');
}

/** Define document.title no formato do app e devolve o texto. */
export function definirTituloPagina({ subaba, secao } = {}, doc = document) {
  const t = formatarTituloPagina({ subaba, secao });
  doc.title = t;
  return t;
}

const TONS = { bom: 'num-bom', ruim: 'num-ruim', aviso: 'num-aviso' };

function preencherSubtitulo(d, el, partes) {
  el.textContent = '';
  const lista = Array.isArray(partes) ? partes : [partes];
  lista.forEach((p) => {
    if (p == null || p === false) return;
    if (typeof p === 'string') el.append(d.createTextNode(p));
    else if (p.nodeType) el.append(p);
    else el.append(criar(d, 'b', { class: `destaque ${TONS[p.tom] || ''}`.trim(), texto: p.texto }));
  });
  el.hidden = !el.childNodes.length;
}

export function montarCabecalhoPagina(container, { secao, subaba, titulo, subtitulo, breadcrumb, acoes = [], refresh = false, abas = {}, atualizarTitulo = true, doc } = {}) {
  const d = doc || container.ownerDocument;
  container.textContent = '';
  container.classList.add('pagina-cab');
  if (atualizarTitulo && (secao || subaba)) definirTituloPagina({ subaba, secao }, d);

  let bc = null;
  if (breadcrumb && breadcrumb.length) {
    const nav = criar(d, 'nav');
    container.append(nav);
    bc = criarBreadcrumb(nav, breadcrumb, { doc: d });
  }
  const tituloEl = criar(d, 'h1', { class: 'pagina-titulo', texto: titulo || '' });
  const subEl = criar(d, 'p', { class: 'pagina-sub' });
  subEl.hidden = true;
  if (subtitulo != null) preencherSubtitulo(d, subEl, subtitulo);
  const acoesEl = criar(d, 'div', { class: 'pagina-acoes' });
  const refreshEl = refresh ? criar(d, 'div', { class: 'refresh-control' }) : null;
  if (refreshEl) acoesEl.append(refreshEl);
  (Array.isArray(acoes) ? acoes : [acoes]).forEach((a) => { if (a) acoesEl.append(a); });
  const linha = criar(d, 'div', { class: 'pagina-cab-linha' }, [criar(d, 'div', { class: 'pagina-titulos' }, [tituloEl, subEl])]);
  if (acoesEl.childNodes.length) linha.append(acoesEl);
  container.append(linha);

  const res = { el: container, tituloEl, subtituloEl: subEl, acoesEl, refreshEl, breadcrumb: bc, abas: {} };
  if (abas.pilula || abas.sublinhada) {
    const grupo = criar(d, 'div', { class: 'pagina-abas' });
    container.append(grupo);
    if (abas.pilula) { const el = criar(d, 'div'); grupo.append(el); res.abas.pilula = criarTabs(el, { variante: 'pilula', doc: d, ...abas.pilula }); }
    if (abas.sublinhada) { const el = criar(d, 'div'); grupo.append(el); res.abas.sublinhada = criarTabs(el, { variante: 'sublinhada', doc: d, ...abas.sublinhada }); }
  }
  res.definirSubtitulo = (partes) => preencherSubtitulo(d, subEl, partes);
  res.definirTitulo = (novo, { subaba: sa, secao: se } = {}) => { tituloEl.textContent = novo; if (sa !== undefined || se !== undefined) definirTituloPagina({ subaba: sa, secao: se }, d); };
  return res;
}

/**
 * ui/busca.js — busca global da top bar (05/10/2026, Onda 3): navegação rápida por ATIVOS da carteira (lidos do cache
 * local do navegador - IndexedDB de cache-dados.js, os mesmos dados que Carteiras já guardou; nenhuma chamada nova à API)
 * e por NOMES DE TELAS. Atalho "/" foca a busca; ↑ ↓ navegam, Enter abre, Esc fecha. Sem cache ainda (1ª visita) a busca
 * só acha telas.
 */
import { criar, icone, novoId } from './dom.js';

/** Telas navegáveis (href relativo à raiz do site). `palavras` = sinônimos que também acham a tela. */
export const TELAS = [
  { rotulo: 'Início', secao: 'Seção', href: 'index.html', icone: 'home', palavras: 'home painel resumo patrimonio' },
  { rotulo: 'Acompanhamento de Ativos', secao: 'Seção', href: 'distribuicoes-metas.html', icone: 'monitoring', palavras: 'distribuicoes metas radar oportunidades' },
  { rotulo: 'Metas e Objetivos', secao: 'Seção', href: 'metas.html', icone: 'flag', palavras: 'metas objetivos viagem' },
  { rotulo: 'Carteiras', secao: 'Seção', href: 'carteiras/index.html', icone: 'wallet', palavras: 'carteira visao geral' },
  { rotulo: 'Ações', secao: 'Carteiras', href: 'carteiras/index.html#acoes', icone: 'wallet', palavras: 'acoes bolsa b3' },
  { rotulo: 'FIIs', secao: 'Carteiras', href: 'carteiras/index.html#fiis', icone: 'wallet', palavras: 'fundos imobiliarios fii' },
  { rotulo: 'Ações Internacionais (EUA)', secao: 'Carteiras', href: 'carteiras/index.html#acoes-eua', icone: 'wallet', palavras: 'eua usa exterior internacionais dolar' },
  { rotulo: 'Renda Fixa', secao: 'Carteiras', href: 'carteiras/index.html#renda-fixa', icone: 'wallet', palavras: 'renda fixa tesouro cdb lci lca' },
  { rotulo: 'Transações', secao: 'Seção', href: 'transacoes/index.html', icone: 'swap-horiz', palavras: 'transacoes compras vendas' },
  { rotulo: 'Aportes (carrinho)', secao: 'Transações', href: 'transacoes/index.html#aportes', icone: 'swap-horiz', palavras: 'aporte carrinho novo aporte comprar' },
  { rotulo: 'Lançamentos', secao: 'Transações', href: 'transacoes/index.html#lancamentos', icone: 'swap-horiz', palavras: 'lancamentos importar b3 historico' },
  { rotulo: 'Proventos', secao: 'Seção', href: 'proventos/index.html', icone: 'payments', palavras: 'dividendos rendimentos jcp' },
  { rotulo: 'Organização Financeira', secao: 'Seção', href: 'organizacao/despesas.html', icone: 'receipt-long', palavras: 'organizacao despesas gastos salario renda' },
];
/** Telas que a página pode acrescentar (ex.: abas internas): registrarTelasBusca([{ rotulo, secao, href, icone }]). */
const EXTRAS = [];
export function registrarTelasBusca(lista) { (lista || []).forEach((t) => { if (t && t.rotulo && t.href && !EXTRAS.some((e) => e.href === t.href && e.rotulo === t.rotulo)) EXTRAS.push(t); }); }

/** Chaves do cache local (cache-dados.js) que guardam as carteiras, e o nome da classe de cada uma. */
export const CHAVES_CARTEIRAS = [
  { chave: 'carteiras_acoes_v2', classe: 'Ação' },
  { chave: 'carteiras_fiis_v2', classe: 'FII' },
  { chave: 'carteiras_acoes_eua_v2', classe: 'Ação EUA' },
  { chave: 'carteiras_renda_fixa_v2', classe: 'Renda Fixa' },
];

export const normalizar = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Procura, no JSON guardado, listas de objetos com `ticker` (ou título de renda fixa) e devolve os ativos achados. */
export function extrairAtivos(dados, classe, { limite = 500 } = {}) {
  const achados = [];
  let visitados = 0;
  const rf = classe === 'Renda Fixa';
  function visitar(no, prof) {
    if (!no || typeof no !== 'object' || prof > 4 || visitados++ > 6000 || achados.length >= limite) return;
    if (Array.isArray(no)) {
      no.forEach((x) => {
        if (x && typeof x === 'object' && !Array.isArray(x) && (typeof x.ticker === 'string' || (rf && (x.nome || x.tipoInvestimento)))) {
          const ticker = typeof x.ticker === 'string' ? x.ticker.trim() : '';
          const nome = String(x.nomePersonalizado || x.nome || x.empresa || x.tipoInvestimento || '').trim();
          if (rf) {
            const base = nome || ticker;
            if (base) achados.push({ ref: `rf:${base}|${String(x.instituicao || '').trim()}`, ticker: ticker || base, nome: x.instituicao ? `${base} · ${x.instituicao}` : base, classe });
          } else if (ticker) achados.push({ ref: ticker.toUpperCase(), ticker: ticker.toUpperCase(), nome: nome && nome.toUpperCase() !== ticker.toUpperCase() ? nome : '', classe });
        } else visitar(x, prof + 1);
      });
    } else Object.values(no).forEach((v) => visitar(v, prof + 1));
  }
  visitar(dados, 0);
  return achados;
}

/** Lê o cache e junta os ativos (sem repetir ref). `ler(chave)` = cache-dados.js!lerCacheDados (devolve {dados} ou null). */
export async function coletarAtivosDoCache(ler) {
  const mapa = new Map();
  for (const { chave, classe } of CHAVES_CARTEIRAS) {
    let reg = null;
    try { reg = await ler(chave); } catch (e) { reg = null; }
    if (!reg || !reg.dados) continue;
    extrairAtivos(reg.dados, classe).forEach((a) => { if (!mapa.has(a.ref)) mapa.set(a.ref, a); });
  }
  return [...mapa.values()];
}

/** Pontuação (0 = não bate). Ticker começando com a busca > nome começando > contém. */
export function pontuar(q, campos) {
  const n = normalizar(q);
  if (!n) return 1;
  let melhor = 0;
  campos.forEach(([texto, peso]) => {
    const t = normalizar(texto);
    if (!t) return;
    let p = 0;
    if (t === n) p = 100; else if (t.startsWith(n)) p = 80; else if (t.split(/[\s·\-/()]+/).some((w) => w.startsWith(n))) p = 60; else if (t.includes(n)) p = 35;
    melhor = Math.max(melhor, p * peso);
  });
  return melhor;
}

/** Resultados pra uma busca: { telas:[...], ativos:[...] } já ordenados e limitados. */
export function buscar(q, ativos = [], { maxTelas = 6, maxAtivos = 8 } = {}) {
  const todasTelas = [...TELAS, ...EXTRAS];
  const telas = todasTelas.map((t) => ({ t, p: pontuar(q, [[t.rotulo, 1], [t.secao === 'Seção' ? '' : t.secao, 0.5], [t.palavras, 0.7]]) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p).slice(0, maxTelas).map((x) => x.t);
  const ach = String(q || '').trim() ? ativos.map((a) => ({ a, p: pontuar(q, [[a.ticker, 1.2], [a.nome, 1]]) })).filter((x) => x.p > 0).sort((a, b) => b.p - a.p || a.a.ticker.localeCompare(b.a.ticker)).slice(0, maxAtivos).map((x) => x.a) : [];
  return { telas, ativos: ach };
}

function marcar(doc, texto, q) {
  const frag = doc.createDocumentFragment();
  const n = normalizar(q);
  const t = String(texto);
  if (!n) { frag.append(t); return frag; }
  // acha o trecho respeitando acentos: compara texto normalizado posição a posição (NFD pode mudar o tamanho; cai pro texto cru)
  const base = normalizar(t);
  const i = base.length === t.length ? base.indexOf(n) : -1;
  if (i < 0) { frag.append(t); return frag; }
  frag.append(t.slice(0, i), criar(doc, 'mark', { texto: t.slice(i, i + n.length) }), t.slice(i + n.length));
  return frag;
}

/** Liga a busca da top bar. Devolve { destruir(), abrir(), definirAtivos(lista) }. Tudo opcional: sem os elementos, não faz nada. */
export function montarBuscaGlobal(doc, { raizSite, ler, win = doc.defaultView } = {}) {
  const wrap = doc.getElementById('shellBuscaWrap');
  const input = doc.getElementById('shellBuscaInput');
  const lista = doc.getElementById('shellBuscaLista');
  const form = doc.getElementById('shellBusca');
  if (!wrap || !input || !lista) return { destruir() {}, abrir() {}, definirAtivos() {} };
  const base = raizSite || (win && win.location ? win.location.href : 'http://localhost/');
  let ativos = [];
  let carregadoEm = 0;
  let itens = [];
  let sel = -1;
  const idLista = lista.id;

  async function carregarAtivos() {
    if (typeof ler !== 'function' || Date.now() - carregadoEm < 60000) return;
    carregadoEm = Date.now();
    try { ativos = await coletarAtivosDoCache(ler); } catch (e) { ativos = []; }
    if (!lista.hidden) desenhar();
  }
  const urlTela = (t) => new URL(t.href, base).href;
  const urlAtivo = (a) => new URL(`ativo/index.html?ref=${encodeURIComponent(a.ref)}`, base).href;

  function abrirLista(sim) {
    lista.hidden = !sim;
    input.setAttribute('aria-expanded', sim ? 'true' : 'false');
    if (!sim) { input.removeAttribute('aria-activedescendant'); sel = -1; }
  }
  function desenhar() {
    const q = input.value;
    const r = buscar(q, ativos);
    lista.textContent = '';
    itens = [];
    const grupo = (rotulo, linhas) => {
      if (!linhas.length) return;
      lista.append(criar(doc, 'p', { class: 'busca-grupo', role: 'presentation', texto: rotulo }));
      linhas.forEach((l) => { lista.append(l.el); itens.push(l); });
    };
    const mk = (href, icoNome, titulo, sub) => {
      const id = novoId('busca-i');
      const a = criar(doc, 'a', { class: 'busca-item', href, role: 'option', id, tabindex: '-1', 'aria-selected': 'false' }, [
        criar(doc, 'span', { class: 'busca-ico' }, [icone(doc, icoNome, 'ico')]),
        criar(doc, 'span', { class: 'busca-item-texto' }, [criar(doc, 'b', {}, [marcar(doc, titulo, q)]), sub ? criar(doc, 'small', { texto: sub }) : null]),
      ]);
      return { el: a, id };
    };
    grupo(String(q).trim() ? 'Telas' : 'Ir para', r.telas.map((t) => mk(urlTela(t), t.icone, t.rotulo, t.secao === 'Seção' ? 'Seção do app' : `${t.secao}`)));
    grupo('Ativos da carteira', r.ativos.map((a) => mk(urlAtivo(a), 'show-chart', a.ticker, [a.nome, a.classe].filter(Boolean).join(' · '))));
    if (!itens.length) lista.append(criar(doc, 'p', { class: 'busca-vazio', role: 'presentation', texto: ativos.length ? 'Nada encontrado. Tente o código do ativo ou o nome da tela.' : 'Nada encontrado entre as telas. Os ativos aparecem aqui depois que você abrir as Carteiras uma vez.' }));
    marcarSel(itens.length ? 0 : -1);
  }
  function marcarSel(i) {
    sel = i;
    itens.forEach((it, k) => it.el.setAttribute('aria-selected', k === i ? 'true' : 'false'));
    if (i >= 0 && itens[i]) {
      input.setAttribute('aria-activedescendant', itens[i].id);
      try { itens[i].el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* jsdom */ }
    } else input.removeAttribute('aria-activedescendant');
  }
  function abrir() { carregarAtivos(); desenhar(); abrirLista(true); }
  function fechar() { abrirLista(false); }

  input.addEventListener('focus', abrir);
  input.addEventListener('input', () => { if (lista.hidden) abrirLista(true); desenhar(); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (lista.hidden) abrir(); else marcarSel(itens.length ? (sel + 1) % itens.length : -1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (!lista.hidden && itens.length) marcarSel((sel - 1 + itens.length) % itens.length); }
    else if (ev.key === 'Escape') { if (!lista.hidden) { ev.preventDefault(); fechar(); } else if (input.value) { input.value = ''; } else input.blur(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); const it = itens[sel >= 0 ? sel : 0]; if (it) { fechar(); input.blur(); it.el.click(); } }
  });
  if (form) form.addEventListener('submit', (ev) => ev.preventDefault());
  lista.addEventListener('mousedown', (ev) => ev.preventDefault()); // não tira o foco do campo antes do clique
  lista.addEventListener('mousemove', (ev) => { const a = ev.target.closest && ev.target.closest('.busca-item'); if (a) { const k = itens.findIndex((x) => x.el === a); if (k >= 0 && k !== sel) marcarSel(k); } });
  lista.addEventListener('click', () => { fechar(); });
  const aoFocoFora = (ev) => { if (!wrap.contains(ev.relatedTarget)) fechar(); };
  wrap.addEventListener('focusout', aoFocoFora);
  const aoAtalho = (ev) => {
    if (ev.key !== '/' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const t = ev.target;
    const tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    ev.preventDefault();
    input.focus();
  };
  doc.addEventListener('keydown', aoAtalho);
  return {
    destruir() { doc.removeEventListener('keydown', aoAtalho); },
    abrir,
    definirAtivos(l) { ativos = l || []; carregadoEm = Date.now(); },
  };
}

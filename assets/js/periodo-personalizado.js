/**
 * periodo-personalizado.js — "Escolher período" (02/10/2026, pedido do
 * Tiago: "Adicionar em todos os filtros dos gráficos a opção 'Escolher
 * período', abrindo um calendário bonito pra qualquer período
 * personalizado"). Componente reutilizável, feito do zero (sem biblioteca),
 * que não depende de página nenhuma: só precisa de um `.filter-tabs` com os
 * botões de preset (`.filter-tab[data-periodo]`).
 *
 * O QUE FAZ
 *  - acrescenta um chip a mais no fim do `.filter-tabs` ("Escolher período",
 *    com ícone de calendário);
 *  - o chip abre um calendário de INTERVALO: popover ancorado no chip no
 *    computador (dois meses lado a lado; um só em tela média) e "folha" que
 *    sobe do rodapé no celular (≤560px); atalhos (Este mês, Mês passado,
 *    3 meses, Este ano, 12 meses); navegação rápida de mês/ano (clicar no
 *    nome do mês abre a grade de meses do ano); datas fora do histórico
 *    desabilitadas; Aplicar/Cancelar; teclado completo (setas, PageUp/Down,
 *    Home/End, Enter, Esc) e foco visível;
 *  - ao aplicar, o chip mostra o intervalo ("02–24 out", "02 set–24 out",
 *    "mar/25–set/26") e a página recebe `{ inicio, fim }` (ISO yyyy-MM-dd);
 *  - cuida também dos presets (clique, classe .active) e lembra a escolha
 *    no localStorage (try/catch - sem storage, só não lembra).
 *
 * API
 *   import { ligarFiltroPeriodo, recortarPorIntervalo, ehPeriodoPersonalizado } from '../periodo-personalizado.js';
 *
 *   const filtro = ligarFiltroPeriodo(doc, tabsEl, {
 *     chave: 'proventos.grafico',  // opcional: lembra a escolha (localStorage "periodo:<chave>")
 *     periodoInicial: 'mes',       // quando não há nada salvo
 *     limites: { min: '2020-12-23', max: '2026-10-02' }, // datas fora ficam desabilitadas
 *     comChip: true,               // false = só os presets (sem o "Escolher período")
 *     aoMudar(periodo) { ... },    // 'mes' | '30d' | ... | { inicio, fim }
 *   });
 *   filtro.periodo                 // período atual (string do preset ou { inicio, fim })
 *   filtro.inscrever(fn)           // mais um ouvinte; devolve a função que cancela
 *   filtro.definir(periodo, { avisar = true } = {})
 *   filtro.definirLimites({ min, max })
 *   filtro.abrir() / filtro.fechar()
 *  Idempotente: chamar de novo no MESMO tabsEl devolve o mesmo controlador
 *  (atualiza limites, troca o `aoMudar` principal e acrescenta o chip se
 *  agora `comChip` vier true) - seguro no "Atualizar dados".
 *  Também dispara o evento DOM "periodochange" ({ detail: { periodo } }) no tabsEl.
 *
 *  Utilitários puros (servem pra qualquer série com campo `data` ISO):
 *   recortarPorIntervalo(serie, { inicio, fim }, { comBase = true, campoData = 'data' })
 *     -> pontos do intervalo + (comBase) o último ponto ANTES dele, que é a
 *        base do "0%" (mesmo critério do "Mês atual" da Início).
 *   ehPeriodoPersonalizado(p), rotuloIntervalo(p), descricaoIntervalo(p),
 *   diasNoIntervalo(p), atalhosPeriodo({ min, max }), somarDiasIso(iso, n).
 *
 * Estilo: assets/css/componentes-grafico.css (.fp-*) - injetado sozinho na
 * 1ª vez que o componente é usado, se a página ainda não carregou o CSS.
 */

import { esc } from './util/html.js'; // 05/10/2026 (A-68): escape único
import { MESES_CURTOS, MESES_LONGOS } from './format.js'; // 05/10/2026 (A-68)

const ISO = /^\d{4}-\d{2}-\d{2}$/;


const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DIAS_SEMANA_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

// ---------------------------------------------------------------------------
// 05/10/2026 (auditoria A-67): catálogo ÚNICO de períodos dos filtros de gráfico. Antes cada tela
// escrevia os seus ("Mês atual/30 dias/6 meses/12 meses/3 anos/Desde o início", "12/24/36 meses",
// "12M/3A/5A/Tudo", "5 anos/10 anos/Tudo"...) - 4 grafias pra "tudo". Ids/rótulos canônicos abaixo;
// os ids que as telas já guardam (preferências no navegador, cálculos, testes) continuam valendo
// como ALIAS (`ALIAS_PERIODO`), então nada que está salvo quebra e `rotuloPeriodo()` aceita os dois.
// ---------------------------------------------------------------------------
export const ROTULO_PERSONALIZADO = 'Escolher período';
export const PERIODOS = [
  { id: '1m', rotulo: '1 mês' },
  { id: '6m', rotulo: '6 meses' },
  { id: 'ano', rotulo: 'No ano' },
  { id: '1a', rotulo: '1 ano' },
  { id: '3a', rotulo: '3 anos' },
  { id: '5a', rotulo: '5 anos' },
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'personalizado', rotulo: ROTULO_PERSONALIZADO },
];
/** id antigo (o que as telas guardam) -> id canônico. */
export const ALIAS_PERIODO = { '30d': '1m', '12m': '1a', '60m': '5a', inicio: 'tudo' };
// Períodos que não são "janela até hoje" (mês de calendário) ou que só existem em uma tela: rótulo no mesmo padrão.
const ROTULOS_ESPECIAIS = { mes: 'Mês atual', '3m': '3 meses', '24m': '2 anos', '36m': '3 anos', '10a': '10 anos', fim: 'Até o alvo' };

/** Id (canônico, antigo ou especial) -> id canônico ('12m' -> '1a'); desconhecido volta como veio. */
export function periodoCanonico(id) {
  return ALIAS_PERIODO[id] || id;
}

/** Rótulo canônico de um período ("1 ano", "Tudo"...); id desconhecido volta como veio. */
export function rotuloPeriodo(id) {
  const c = periodoCanonico(id);
  const achado = PERIODOS.find((p) => p.id === c);
  return achado ? achado.rotulo : (ROTULOS_ESPECIAIS[id] || String(id));
}

/** Botões `.filter-tab[data-periodo]` com os rótulos canônicos, na ordem de `ids` (os ids são os que a tela já usa). */
export function botoesPeriodoHtml(ids, ativo = ids[0]) {
  return ids.map((id) => `<button class="filter-tab${id === ativo ? ' active' : ''}" type="button" data-periodo="${id}">${rotuloPeriodo(id)}</button>`).join('');
}

/**
 * 06/10/2026 (Onda 3, kit): o mesmo conjunto de períodos como SEGMENTADO do kit ("1 mês | ✓ 6 meses | 1 ano", charts.css:
 * .chart-seg/.chart-seg-btn, ✓ no ativo). Ponha o resultado dentro do contêiner que vai pra ligarFiltroPeriodo - o chip
 * "Escolher período" entra depois do segmentado, no mesmo contêiner.
 */
const CHECK_SEG = '<svg class="chart-seg-ck" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M9.55 17.65 4.6 12.7l1.4-1.4 3.55 3.55 8.45-8.45 1.4 1.4z"/></svg>';
export function botoesSegmentadoHtml(ids, ativo = ids[0]) {
  return `<div class="chart-seg" role="group" aria-label="Período">${ids.map((id) => `<button class="chart-seg-btn${id === ativo ? ' active' : ''}" type="button" data-periodo="${id}" aria-pressed="${id === ativo ? 'true' : 'false'}">${CHECK_SEG}<span>${rotuloPeriodo(id)}</span></button>`).join('')}</div>`;
}

const ROTULO_CHIP = ROTULO_PERSONALIZADO;
const ICONE_CALENDARIO = '<svg class="fp-chip-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const SETA_ESQ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const SETA_DIR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

// ---------------------------------------------------------------------------
// Datas (sempre texto yyyy-MM-dd; contas em UTC pra nunca escorregar de fuso)
// ---------------------------------------------------------------------------

function dataUtc(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}
function isoUtc(dt) {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
export function somarDiasIso(iso, n) {
  const dt = dataUtc(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return isoUtc(dt);
}
/** 1º dia do mês de `iso`, deslocado `n` meses. */
function inicioMesIso(iso, n = 0) {
  const [a, m] = iso.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}
function fimMesIso(iso) {
  return somarDiasIso(inicioMesIso(iso, 1), -1);
}
function diaSemana(iso) { return dataUtc(iso).getUTCDay(); }
function partes(iso) { const [a, m, d] = iso.split('-').map(Number); return { a, m, d }; }
const minIso = (x, y) => (x < y ? x : y);
const maxIso = (x, y) => (x > y ? x : y);

export function ehPeriodoPersonalizado(p) {
  return !!p && typeof p === 'object' && ISO.test(String(p.inicio)) && ISO.test(String(p.fim));
}

/** Garante inicio <= fim. */
function normalizar(p) {
  if (!ehPeriodoPersonalizado(p)) return null;
  return p.inicio <= p.fim ? { inicio: p.inicio, fim: p.fim } : { inicio: p.fim, fim: p.inicio };
}

/** Dias corridos do intervalo, contando os dois extremos. */
export function diasNoIntervalo(p) {
  const n = normalizar(p);
  if (!n) return 0;
  return Math.round((dataUtc(n.fim) - dataUtc(n.inicio)) / 86400000) + 1;
}

/** Texto curto do chip: "02–24 out", "02 set–24 out", "mar/25–set/26", "02 out". */
export function rotuloIntervalo(p) {
  const n = normalizar(p);
  if (!n) return ROTULO_CHIP;
  const i = partes(n.inicio);
  const f = partes(n.fim);
  const dd = (x) => String(x.d).padStart(2, '0');
  if (n.inicio === n.fim) return `${dd(i)} ${MESES_CURTOS[i.m - 1]}`;
  if (i.a === f.a && i.m === f.m) return `${dd(i)}–${dd(f)} ${MESES_CURTOS[f.m - 1]}`;
  if (i.a === f.a) return `${dd(i)} ${MESES_CURTOS[i.m - 1]}–${dd(f)} ${MESES_CURTOS[f.m - 1]}`;
  return `${MESES_CURTOS[i.m - 1]}/${String(i.a).slice(2)}–${MESES_CURTOS[f.m - 1]}/${String(f.a).slice(2)}`;
}

/** Texto completo (title/aria): "02/10/2026 a 24/10/2026". */
export function descricaoIntervalo(p) {
  const n = normalizar(p);
  if (!n) return '';
  const br = (iso) => { const x = partes(iso); return `${String(x.d).padStart(2, '0')}/${String(x.m).padStart(2, '0')}/${x.a}`; };
  return n.inicio === n.fim ? br(n.inicio) : `${br(n.inicio)} a ${br(n.fim)}`;
}

/**
 * Recorta uma série (itens com `data` ISO, em ordem) pro intervalo. Com
 * `comBase` (padrão), inclui também o último ponto ANTES do início - a base
 * do "0%" (o que aconteceu no 1º dia do intervalo conta). [] quando nenhum
 * ponto cai no intervalo.
 */
export function recortarPorIntervalo(serie, periodo, { comBase = true, campoData = 'data' } = {}) {
  const n = normalizar(periodo);
  if (!n || !Array.isArray(serie)) return [];
  let ini = -1;
  let fim = -1;
  for (let i = 0; i < serie.length; i += 1) {
    const d = serie[i] && serie[i][campoData];
    if (typeof d !== 'string') continue;
    if (ini === -1 && d >= n.inicio && d <= n.fim) ini = i;
    if (d >= n.inicio && d <= n.fim) fim = i;
  }
  if (ini === -1) return [];
  return serie.slice(comBase ? Math.max(0, ini - 1) : ini, fim + 1);
}

/** Atalhos do calendário, relativos ao ÚLTIMO dia com dado (limites.max). */
export function atalhosPeriodo({ min = null, max } = {}) {
  if (!ISO.test(String(max))) return [];
  const lista = [
    { id: 'este-mes', rotulo: 'Este mês', inicio: inicioMesIso(max), fim: max },
    { id: 'mes-passado', rotulo: 'Mês passado', inicio: inicioMesIso(max, -1), fim: fimMesIso(inicioMesIso(max, -1)) },
    { id: '3-meses', rotulo: '3 meses', inicio: null, fim: max },
    { id: 'este-ano', rotulo: 'Este ano', inicio: `${max.slice(0, 4)}-01-01`, fim: max },
    { id: '12-meses', rotulo: '12 meses', inicio: somarDiasIso(`${Number(max.slice(0, 4)) - 1}${max.slice(4)}`, 1), fim: max },
  ];
  // "3 meses": mesmo dia, 3 meses antes (+1); dia que não existe (31) cai no fim do mês.
  const tres = inicioMesIso(max, -3);
  const diaAlvo = Math.min(Number(max.slice(8)), Number(fimMesIso(tres).slice(8)));
  lista[2].inicio = somarDiasIso(`${tres.slice(0, 8)}${String(diaAlvo).padStart(2, '0')}`, 1);
  return lista.map((a) => {
    const inicio = min ? maxIso(a.inicio, min) : a.inicio;
    return { ...a, inicio, desabilitado: inicio > a.fim };
  });
}

// ---------------------------------------------------------------------------
// localStorage (só conveniência)
// ---------------------------------------------------------------------------

function lerSalvo(chave) {
  if (!chave) return null;
  try {
    const bruto = globalThis.localStorage ? globalThis.localStorage.getItem(`periodo:${chave}`) : null;
    if (!bruto) return null;
    const v = JSON.parse(bruto);
    return v && Object.prototype.hasOwnProperty.call(v, 'p') ? v.p : null;
  } catch (e) { return null; }
}
function gravarSalvo(chave, periodo) {
  if (!chave) return;
  try { if (globalThis.localStorage) globalThis.localStorage.setItem(`periodo:${chave}`, JSON.stringify({ p: periodo })); } catch (e) { /* sem storage: só não lembra */ }
}

/** Injeta o CSS do componente (1x por documento) se a página não carregou. */
export function garantirEstilosComponentesGrafico(doc) {
  if (!doc || !doc.head || doc._cssComponentesGrafico) return;
  doc._cssComponentesGrafico = true;
  const ja = [...doc.querySelectorAll('link[rel="stylesheet"]')].some((l) => /componentes-grafico\.css/.test(l.getAttribute('href') || ''));
  if (ja) return;
  try {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('../css/componentes-grafico.css', import.meta.url).href;
    link.dataset.componentesGrafico = '';
    doc.head.appendChild(link);
  } catch (e) { /* ambiente sem import.meta.url resolvível: a página carrega o CSS */ }
}


// ---------------------------------------------------------------------------
// Controlador
// ---------------------------------------------------------------------------

export function ligarFiltroPeriodo(doc, tabsEl, { chave = null, comChip = true, periodoInicial = 'mes', limites = null, aoMudar = null } = {}) {
  if (!tabsEl) return null;
  if (tabsEl._filtroPeriodo) {
    const c = tabsEl._filtroPeriodo;
    if (limites) c.definirLimites(limites);
    if (typeof aoMudar === 'function') c._principal = aoMudar;
    if (comChip) c._garantirChip(chave);
    return c;
  }

  const janelaDoc = doc.defaultView;
  const ouvintes = new Set();
  // 06/10/2026: os presets podem ser .filter-tab (chip) ou .chart-seg-btn (segmentado do kit, charts.css)
  const presets = () => [...tabsEl.querySelectorAll('.filter-tab[data-periodo], .chart-seg-btn[data-periodo]')].filter((b) => !b.classList.contains('fp-chip'));
  const presetExiste = (id) => presets().some((b) => b.dataset.periodo === id);

  const c = {
    periodo: periodoInicial,
    limites: null,
    chave,
    _principal: typeof aoMudar === 'function' ? aoMudar : null,
    _chip: null,
  };

  function valido(p) {
    if (typeof p === 'string') return presetExiste(p) || !presets().length;
    const n = normalizar(p);
    if (!n) return false;
    if (c.limites && (n.fim < c.limites.min || n.inicio > c.limites.max)) return false;
    return true;
  }
  function ajustarAosLimites(p) {
    const n = normalizar(p);
    if (!n || !c.limites) return n;
    return { inicio: maxIso(n.inicio, c.limites.min), fim: minIso(n.fim, c.limites.max) };
  }

  function sincronizar() {
    const custom = ehPeriodoPersonalizado(c.periodo);
    presets().forEach((b) => {
      const ativo = !custom && b.dataset.periodo === c.periodo;
      b.classList.toggle('active', ativo);
      b.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
    if (c._chip) {
      c._chip.classList.toggle('active', custom);
      c._chip.setAttribute('aria-pressed', custom ? 'true' : 'false');
      c._chip.querySelector('.fp-chip-txt').textContent = custom ? rotuloIntervalo(c.periodo) : ROTULO_CHIP;
      const desc = custom ? `Período personalizado: ${descricaoIntervalo(c.periodo)}. Toque pra alterar` : 'Escolher um período personalizado no calendário';
      c._chip.title = desc;
      c._chip.setAttribute('aria-label', desc);
    }
  }

  function emitir() {
    const p = c.periodo;
    if (c._principal) c._principal(p);
    ouvintes.forEach((fn) => fn(p));
    try {
      const Ev = janelaDoc && janelaDoc.CustomEvent;
      if (Ev) tabsEl.dispatchEvent(new Ev('periodochange', { detail: { periodo: p } }));
    } catch (e) { /* sem CustomEvent: os ouvintes acima já foram avisados */ }
  }

  c.definir = function definir(p, { avisar = true, gravar = true } = {}) {
    const novo = ehPeriodoPersonalizado(p) ? ajustarAosLimites(p) : p;
    if (!valido(novo)) return false;
    c.periodo = novo;
    sincronizar();
    if (gravar) gravarSalvo(c.chave, novo);
    if (avisar) emitir();
    return true;
  };

  c.definirLimites = function definirLimites(lim) {
    if (!lim || !ISO.test(String(lim.min)) || !ISO.test(String(lim.max))) return;
    c.limites = { min: lim.min, max: lim.max };
    if (ehPeriodoPersonalizado(c.periodo)) {
      if (!valido(c.periodo)) c.periodo = presetExiste(periodoInicial) ? periodoInicial : (presets()[0] ? presets()[0].dataset.periodo : periodoInicial);
      else c.periodo = ajustarAosLimites(c.periodo);
      sincronizar();
    }
  };

  c.inscrever = function inscrever(fn) {
    if (typeof fn !== 'function') return () => {};
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
  };

  c._garantirChip = function garantirChip(novaChave) {
    if (novaChave && !c.chave) c.chave = novaChave;
    if (c._chip && tabsEl.contains(c._chip)) return;
    garantirEstilosComponentesGrafico(doc);
    const chip = doc.createElement('button');
    chip.type = 'button';
    chip.className = 'filter-tab fp-chip';
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.setAttribute('aria-expanded', 'false');
    chip.innerHTML = `${ICONE_CALENDARIO}<span class="fp-chip-txt">${ROTULO_CHIP}</span>`;
    tabsEl.appendChild(chip);
    c._chip = chip;
    sincronizar();
  };

  tabsEl.addEventListener('click', (ev) => {
    const alvo = ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('.filter-tab, .chart-seg-btn') : null;
    if (!alvo || !tabsEl.contains(alvo)) return;
    if (alvo.classList.contains('fp-chip')) { c.abrir(); return; }
    if (alvo.dataset.periodo) c.definir(alvo.dataset.periodo);
  });

  // ------------------------------------------------------------- calendário
  let camada = null;
  let estadoCal = null;

  c.fechar = function fechar({ devolverFoco = true } = {}) {
    if (!camada) return;
    camada.remove();
    camada = null;
    estadoCal = null;
    if (janelaDoc) {
      janelaDoc.removeEventListener('resize', reposicionar);
      janelaDoc.removeEventListener('scroll', reposicionar, true);
    }
    if (c._chip) {
      c._chip.setAttribute('aria-expanded', 'false');
      if (devolverFoco && typeof c._chip.focus === 'function') c._chip.focus();
    }
  };

  function larguraJanela() { return (janelaDoc && janelaDoc.innerWidth) || 1024; }
  function quantosMeses() { return larguraJanela() >= 760 ? 2 : 1; }
  function ehFolha() { return larguraJanela() <= 560; }

  c.abrir = function abrir() {
    if (!c._chip) c._garantirChip();
    if (camada) return;
    garantirEstilosComponentesGrafico(doc);
    const lim = c.limites || { min: '1900-01-01', max: isoUtc(new Date()) };
    const atual = ehPeriodoPersonalizado(c.periodo) ? normalizar(c.periodo) : null;
    const focoInicial = atual ? atual.fim : lim.max;
    const meses = quantosMeses();
    estadoCal = {
      lim,
      rascunho: atual ? { ...atual } : { inicio: null, fim: null },
      foco: focoInicial,
      hover: null,
      modo: 'dias',
      anoMeses: Number(focoInicial.slice(0, 4)),
      // o mês da direita mostra o foco (fim do intervalo/último dia com dado)
      vista: inicioMesIso(focoInicial, -(meses - 1)),
    };
    camada = doc.createElement('div');
    camada.className = `fp-camada${ehFolha() ? ' fp-folha' : ''}`;
    camada.innerHTML = '<div class="fp-pop" role="dialog" aria-modal="true" aria-label="Escolher período"></div>';
    (doc.body || tabsEl).appendChild(camada);
    camada.addEventListener('pointerdown', (ev) => { if (ev.target === camada) { ev.preventDefault(); c.fechar(); } });
    const pop = camada.querySelector('.fp-pop');
    pop.addEventListener('click', aoClicarPop);
    pop.addEventListener('keydown', aoTeclar);
    pop.addEventListener('pointerover', aoPassar);
    pop.addEventListener('pointerleave', () => { if (estadoCal) { estadoCal.hover = null; pintarPrevia(); } });
    c._chip.setAttribute('aria-expanded', 'true');
    desenhar({ focar: true });
    if (janelaDoc) {
      janelaDoc.addEventListener('resize', reposicionar);
      janelaDoc.addEventListener('scroll', reposicionar, true);
    }
  };

  function reposicionar() {
    if (!camada) return;
    const folha = ehFolha();
    camada.classList.toggle('fp-folha', folha);
    const pop = camada.querySelector('.fp-pop');
    if (folha || !c._chip || typeof c._chip.getBoundingClientRect !== 'function') {
      pop.style.left = '';
      pop.style.top = '';
      return;
    }
    const r = c._chip.getBoundingClientRect();
    const lw = larguraJanela();
    const lh = (janelaDoc && janelaDoc.innerHeight) || 800;
    const pw = pop.offsetWidth || 640;
    const ph = pop.offsetHeight || 420;
    let left = Math.min(r.left, lw - pw - 12);
    left = Math.max(12, left);
    let top = r.bottom + 8;
    if (top + ph > lh - 12) top = Math.max(12, Math.min(r.top - ph - 8, lh - ph - 12));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function classeDia(iso) {
    const s = estadoCal;
    const cls = ['fp-dia'];
    const fora = iso < s.lim.min || iso > s.lim.max;
    if (fora) cls.push('fp-fora');
    const { inicio, fim } = s.rascunho;
    if (inicio && fim) {
      if (iso === inicio) cls.push('fp-ini');
      if (iso === fim) cls.push('fp-fim');
      if (iso > inicio && iso < fim) cls.push('fp-meio');
    } else if (inicio && iso === inicio) {
      cls.push('fp-ini', 'fp-fim');
    }
    if (iso === s.lim.max) cls.push('fp-hoje');
    return cls.join(' ');
  }

  function htmlMes(primeiro, idx, total) {
    const s = estadoCal;
    const { a, m } = partes(primeiro);
    const ultimo = fimMesIso(primeiro);
    const prevOk = inicioMesIso(primeiro, -1) >= inicioMesIso(s.lim.min) || idx > 0;
    const proxOk = inicioMesIso(primeiro, 1) <= s.lim.max || idx < total - 1;
    const navAnt = idx === 0 ? `<button type="button" class="fp-nav" data-acao="mes-ant" aria-label="Mês anterior"${prevOk ? '' : ' disabled'}>${SETA_ESQ}</button>` : '<span class="fp-nav-vazio"></span>';
    const navProx = idx === total - 1 ? `<button type="button" class="fp-nav" data-acao="mes-prox" aria-label="Próximo mês"${proxOk ? '' : ' disabled'}>${SETA_DIR}</button>` : '<span class="fp-nav-vazio"></span>';
    let celulas = '';
    const vazios = diaSemana(primeiro);
    for (let i = 0; i < vazios; i += 1) celulas += '<span class="fp-vazio" role="gridcell"></span>';
    for (let d = primeiro; d <= ultimo; d = somarDiasIso(d, 1)) {
      const fora = d < s.lim.min || d > s.lim.max;
      const sel = s.rascunho.inicio && (d === s.rascunho.inicio || d === s.rascunho.fim);
      const x = partes(d);
      celulas += `<span role="gridcell"><button type="button" class="${classeDia(d)}" data-dia="${d}" tabindex="${d === s.foco ? '0' : '-1'}"`
        + ` aria-label="${x.d} de ${MESES_LONGOS[x.m - 1]} de ${x.a}, ${DIAS_SEMANA_LONGOS[diaSemana(d)]}${fora ? ' (sem dado)' : ''}"`
        + `${fora ? ' aria-disabled="true"' : ''} aria-selected="${sel ? 'true' : 'false'}">${x.d}</button></span>`;
    }
    return `
      <div class="fp-mes">
        <div class="fp-mes-cab">
          ${navAnt}
          <button type="button" class="fp-mes-titulo" data-acao="modo-meses" data-ano="${a}" aria-label="${MESES_LONGOS[m - 1]} de ${a} - escolher outro mês ou ano">${MESES_LONGOS[m - 1]} <b>${a}</b></button>
          ${navProx}
        </div>
        <div class="fp-semana" aria-hidden="true">${DIAS_SEMANA.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="fp-grade" role="grid" aria-label="${MESES_LONGOS[m - 1]} de ${a}">${celulas}</div>
      </div>`;
  }

  function htmlMesesDoAno() {
    const s = estadoCal;
    const ano = s.anoMeses;
    const anoMin = Number(s.lim.min.slice(0, 4));
    const anoMax = Number(s.lim.max.slice(0, 4));
    const botoes = MESES_CURTOS.map((nome, i) => {
      const ini = `${ano}-${String(i + 1).padStart(2, '0')}-01`;
      const fora = fimMesIso(ini) < s.lim.min || ini > s.lim.max;
      const atual = ini === inicioMesIso(s.foco);
      return `<button type="button" class="fp-mes-op${atual ? ' fp-atual' : ''}" data-acao="ir-mes" data-mes="${ini}"${fora ? ' disabled' : ''}>${nome}</button>`;
    }).join('');
    return `
      <div class="fp-anos">
        <div class="fp-mes-cab">
          <button type="button" class="fp-nav" data-acao="ano-ant" aria-label="Ano anterior"${ano <= anoMin ? ' disabled' : ''}>${SETA_ESQ}</button>
          <span class="fp-ano-titulo" aria-live="polite">${ano}</span>
          <button type="button" class="fp-nav" data-acao="ano-prox" aria-label="Próximo ano"${ano >= anoMax ? ' disabled' : ''}>${SETA_DIR}</button>
        </div>
        <div class="fp-meses-grade">${botoes}</div>
        <button type="button" class="fp-link" data-acao="modo-dias">Voltar aos dias</button>
      </div>`;
  }

  function textoRodape() {
    const { inicio, fim } = estadoCal.rascunho;
    if (inicio && fim) {
      const n = diasNoIntervalo({ inicio, fim });
      return `<b>${esc(descricaoIntervalo({ inicio, fim }))}</b> · ${n} ${n === 1 ? 'dia' : 'dias'}`;
    }
    if (inicio) return `Início em <b>${esc(descricaoIntervalo({ inicio, fim: inicio }))}</b> · agora toque no dia final`;
    return 'Toque no dia inicial e depois no dia final';
  }

  function desenhar({ focar = false } = {}) {
    if (!camada || !estadoCal) return;
    const s = estadoCal;
    const pop = camada.querySelector('.fp-pop');
    const focoEstavaNaGrade = doc.activeElement && doc.activeElement.dataset && doc.activeElement.dataset.dia;
    const meses = quantosMeses();
    const atalhos = atalhosPeriodo(s.lim).map((a) => {
      const sel = s.rascunho.inicio === a.inicio && s.rascunho.fim === a.fim;
      return `<button type="button" class="fp-atalho${sel ? ' fp-sel' : ''}" data-acao="atalho" data-inicio="${a.inicio}" data-fim="${a.fim}"${a.desabilitado ? ' disabled' : ''} aria-pressed="${sel ? 'true' : 'false'}">${sel ? '<i aria-hidden="true">✓</i>' : ''}${esc(a.rotulo)}</button>`;
    }).join('');
    let corpo = '';
    if (s.modo === 'meses') corpo = htmlMesesDoAno();
    else {
      for (let i = 0; i < meses; i += 1) corpo += htmlMes(inicioMesIso(s.vista, i), i, meses);
    }
    const pronto = !!(s.rascunho.inicio && s.rascunho.fim);
    pop.innerHTML = `
      <div class="fp-cab">
        <span class="fp-titulo">Escolher período</span>
        <button type="button" class="fp-fechar" data-acao="cancelar" aria-label="Fechar sem aplicar">×</button>
      </div>
      <div class="fp-corpo">
        <div class="fp-atalhos" role="group" aria-label="Atalhos">${atalhos}</div>
        <div class="fp-meses fp-meses-${s.modo === 'meses' ? 1 : meses}">${corpo}</div>
      </div>
      <div class="fp-rodape">
        <span class="fp-resumo" aria-live="polite">${textoRodape()}</span>
        <span class="fp-botoes">
          <button type="button" class="fp-btn" data-acao="cancelar">Cancelar</button>
          <button type="button" class="fp-btn fp-btn-prim" data-acao="aplicar"${pronto ? '' : ' disabled'}>Aplicar</button>
        </span>
      </div>`;
    pintarPrevia();
    reposicionar();
    if (focar || focoEstavaNaGrade) {
      const alvo = pop.querySelector(`[data-dia="${s.foco}"]`) || pop.querySelector('.fp-mes-op.fp-atual:not([disabled])') || pop.querySelector('.fp-mes-op:not([disabled])') || pop.querySelector('.fp-dia:not(.fp-fora)');
      if (alvo && typeof alvo.focus === 'function') alvo.focus();
    }
  }

  /** Pré-visualização do intervalo enquanto escolhe o dia final (só classes, sem redesenhar). */
  function pintarPrevia() {
    if (!camada || !estadoCal) return;
    const { inicio, fim } = estadoCal.rascunho;
    const h = estadoCal.hover;
    const ativo = inicio && !fim && h;
    const a = ativo ? minIso(inicio, h) : null;
    const b = ativo ? maxIso(inicio, h) : null;
    camada.querySelectorAll('.fp-dia').forEach((el) => {
      const d = el.dataset.dia;
      el.classList.toggle('fp-previa', !!ativo && d >= a && d <= b);
    });
  }

  function escolherDia(iso) {
    const s = estadoCal;
    if (iso < s.lim.min || iso > s.lim.max) return;
    const r = s.rascunho;
    if (!r.inicio || (r.inicio && r.fim)) s.rascunho = { inicio: iso, fim: null };
    else if (iso < r.inicio) s.rascunho = { inicio: iso, fim: r.inicio };
    else s.rascunho = { inicio: r.inicio, fim: iso };
    s.foco = iso;
    s.hover = null;
    desenhar({ focar: true });
  }

  function moverFoco(novo) {
    const s = estadoCal;
    s.foco = novo;
    const meses = quantosMeses();
    const ultimaVista = inicioMesIso(s.vista, meses - 1);
    if (novo < s.vista) s.vista = inicioMesIso(novo);
    else if (novo > fimMesIso(ultimaVista)) s.vista = inicioMesIso(novo, -(meses - 1));
    desenhar({ focar: true });
  }

  function aoClicarPop(ev) {
    const s = estadoCal;
    if (!s) return;
    const dia = ev.target.closest && ev.target.closest('[data-dia]');
    if (dia) { if (dia.getAttribute('aria-disabled') !== 'true') escolherDia(dia.dataset.dia); return; }
    const btn = ev.target.closest && ev.target.closest('[data-acao]');
    if (!btn || btn.disabled) return;
    const acao = btn.dataset.acao;
    if (acao === 'cancelar') { c.fechar(); return; }
    if (acao === 'aplicar') {
      if (s.rascunho.inicio && s.rascunho.fim) {
        const p = { ...s.rascunho };
        c.fechar();
        c.definir(p);
      }
      return;
    }
    if (acao === 'atalho') {
      s.rascunho = { inicio: btn.dataset.inicio, fim: btn.dataset.fim };
      s.foco = btn.dataset.fim;
      s.modo = 'dias';
      s.vista = inicioMesIso(btn.dataset.fim, -(quantosMeses() - 1));
      desenhar();
      const ap = camada && camada.querySelector('[data-acao="aplicar"]');
      if (ap) ap.focus();
      return;
    }
    if (acao === 'mes-ant') { s.vista = inicioMesIso(s.vista, -1); desenhar(); return; }
    if (acao === 'mes-prox') { s.vista = inicioMesIso(s.vista, 1); desenhar(); return; }
    if (acao === 'modo-meses') { s.modo = 'meses'; s.anoMeses = Number(btn.dataset.ano); desenhar({ focar: true }); return; }
    if (acao === 'modo-dias') { s.modo = 'dias'; desenhar({ focar: true }); return; }
    if (acao === 'ano-ant') { s.anoMeses -= 1; desenhar(); return; }
    if (acao === 'ano-prox') { s.anoMeses += 1; desenhar(); return; }
    if (acao === 'ir-mes') {
      const ini = btn.dataset.mes;
      s.modo = 'dias';
      s.vista = quantosMeses() === 2 && inicioMesIso(ini, 1) > s.lim.max ? inicioMesIso(ini, -1) : ini;
      const dentro = maxIso(ini, s.lim.min);
      s.foco = minIso(dentro, s.lim.max);
      desenhar({ focar: true });
    }
  }

  function aoPassar(ev) {
    const dia = ev.target.closest && ev.target.closest('[data-dia]');
    if (!dia || !estadoCal) return;
    if (estadoCal.hover !== dia.dataset.dia) { estadoCal.hover = dia.dataset.dia; pintarPrevia(); }
  }

  function aoTeclar(ev) {
    const s = estadoCal;
    if (!s) return;
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); c.fechar(); return; }
    if (ev.key === 'Tab') {
      const focaveis = [...camada.querySelectorAll('button:not([disabled])')].filter((b) => b.tabIndex !== -1);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (ev.shiftKey && doc.activeElement === primeiro) { ev.preventDefault(); ultimo.focus(); } else if (!ev.shiftKey && doc.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
      return;
    }
    const dia = ev.target && ev.target.dataset ? ev.target.dataset.dia : null;
    if (!dia) return;
    const mapa = {
      ArrowLeft: () => somarDiasIso(dia, -1),
      ArrowRight: () => somarDiasIso(dia, 1),
      ArrowUp: () => somarDiasIso(dia, -7),
      ArrowDown: () => somarDiasIso(dia, 7),
      Home: () => somarDiasIso(dia, -diaSemana(dia)),
      End: () => somarDiasIso(dia, 6 - diaSemana(dia)),
      PageUp: () => { const alvo = inicioMesIso(dia, ev.shiftKey ? -12 : -1); return `${alvo.slice(0, 8)}${String(Math.min(Number(dia.slice(8)), Number(fimMesIso(alvo).slice(8)))).padStart(2, '0')}`; },
      PageDown: () => { const alvo = inicioMesIso(dia, ev.shiftKey ? 12 : 1); return `${alvo.slice(0, 8)}${String(Math.min(Number(dia.slice(8)), Number(fimMesIso(alvo).slice(8)))).padStart(2, '0')}`; },
    };
    if (mapa[ev.key]) {
      ev.preventDefault();
      moverFoco(mapa[ev.key]());
      if (s.rascunho.inicio && !s.rascunho.fim) { s.hover = s.foco; pintarPrevia(); }
      return;
    }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      escolherDia(dia);
    }
  }

  // ----------------------------------------------------------- estado inicial
  tabsEl._filtroPeriodo = c;
  if (limites) c.definirLimites(limites);
  const salvo = lerSalvo(chave);
  if (salvo != null && valido(ehPeriodoPersonalizado(salvo) ? ajustarAosLimites(salvo) : salvo)) {
    c.periodo = ehPeriodoPersonalizado(salvo) ? ajustarAosLimites(salvo) : salvo;
  }
  if (comChip) c._garantirChip(chave);
  sincronizar();
  return c;
}

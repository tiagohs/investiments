/**
 * metas.js - 02/10/2026: tela "Metas e Objetivos" (metas.html, aba do router).
 *
 * Tiago: "novo menu principal Metas e Objetivos, v1 funcional já". Lista de
 * cards (progresso, quanto falta, prazo, aporte necessário x o seu, no ritmo /
 * atrasada), filtros por status e tipo, "Nova meta" em passos (tipo -> dados
 * -> vincular investimentos -> revisar), detalhe com gráfico da evolução
 * projetada x necessária, sub-itens de custo, investimentos vinculados e o
 * simulador ("até tal mês, aporte quanto" e o inverso). Sem metas, a tela
 * sugere as mais comuns com 1 clique, já com os números da planilha.
 *
 * Dados: GET action=metas (apps-script/Metas.gs); contas em ./metas-calc.js;
 * ícones/formatos/card de outras telas em ../metas-card.js. O detalhe abre por
 * metas.html#meta=<id> (é o link do card de renda passiva em Carteiras).
 */

import { getMetas, salvarMeta as salvarMetaApi, excluirMeta as excluirMetaApi } from '../api-client.js';
import { mountRefreshControl } from '../shell.js';
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { urlAtivo } from '../link-ativo.js';
import {
  TIPOS_META, CATEGORIAS_ACUMULO, MOEDAS, STATUS_META, aparenciaMeta, calcularMeta, serieProjecao, resumoMetas,
  metaPadrao, sugestoesMetas, simular, resolverVinculos, ativosSobrecomprometidos, rotuloMes, rotuloDuracao,
  mesesEntre, mesDe, cotacao, somarMeses,
} from './metas-calc.js';
import {
  iconeMetaSvg, seloMetaHtml, escHtml, formatMoeda, valorGrandeHtml, pct, statusPillHtml, garantirEstiloMetas, contextoMetas,
} from '../metas-card.js';

/** Conteúdo do <main> da aba (o router injeta - ver router.js, rota "metas"). */
export const TEMPLATE_METAS = `
<div class="mt-pagina">
  <div class="mt-titulo">
    <div>
      <h1>Metas e Objetivos</h1>
      <p>Quanto falta, quanto aportar por mês e se você está no ritmo - com os seus investimentos de verdade.</p>
    </div>
    <div class="mt-titulo-acoes">
      <div id="mtRefresh" class="refresh-control"></div>
      <button class="btn btn-primary" id="mtNova" type="button"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Nova meta</button>
    </div>
  </div>
  <div class="mt-carregando" id="mtCarregando" aria-hidden="true">
    <div class="mt-skel-resumo"><span class="skel"></span><span class="skel"></span><span class="skel"></span></div>
    <div class="mt-grade"><span class="skel" style="height:210px"></span><span class="skel" style="height:210px"></span><span class="skel" style="height:210px"></span></div>
  </div>
  <div class="mt-erro" id="mtErro" hidden></div>
  <div class="avisos-banner" id="mtAvisos" hidden></div>
  <div id="mtTela" hidden></div>
</div>
<div class="mt-dialogo-fundo" id="mtDialogo" hidden></div>
`;

// ---------------------------------------------------------------------------
// Números digitados (pt-BR)
// ---------------------------------------------------------------------------

/** "1.234,56" / "1234.56" / "R$ 10" -> número (null se vazio/inválido). */
export function parseNumeroBR(texto) {
  if (texto == null) return null;
  let s = String(texto).replace(/[^\d,.-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function numParaCampo(v, casas = 2) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

function lerCaminho(obj, caminho) {
  return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function gravarCaminho(obj, caminho, valor) {
  const partes = caminho.split('.');
  let o = obj;
  partes.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  o[partes[partes.length - 1]] = valor;
}

const clonar = (o) => JSON.parse(JSON.stringify(o));
const idItem = () => Math.random().toString(36).slice(2, 10);
const ROTULO_CLASSE = { acoes: 'Ações', fiis: 'FIIs', usa: 'Ações EUA', rf: 'Renda Fixa' };
const ROTULO_MARCA = { emergencial: 'Renda Emergencial', 'longo-prazo': 'Renda Fixa de longo prazo' };
const FILTROS_STATUS = [
  ['todas', 'Todas'], ['no-ritmo', 'No ritmo'], ['atrasadas', 'Atrasadas'], ['concluidas', 'Concluídas'], ['arquivadas', 'Arquivadas'],
];

function passaFiltroStatus(filtro, c) {
  if (filtro === 'todas' || filtro === 'arquivadas') return true;
  if (filtro === 'no-ritmo') return ['no-ritmo', 'saldo-ideal', 'sem-prazo'].includes(c.status);
  if (filtro === 'atrasadas') return ['atrasada', 'vencida', 'abaixo'].includes(c.status);
  if (filtro === 'concluidas') return c.status === 'concluida';
  return true;
}

function chaveTipo(meta) { return meta.tipo === 'acumulo' ? `acumulo:${meta.categoria || 'outros'}` : meta.tipo; }

// ---------------------------------------------------------------------------
// Card da lista
// ---------------------------------------------------------------------------

export function cardMetaHtml(meta, c) {
  const ap = aparenciaMeta(meta);
  const p = Math.max(0, Math.min(1, c.percentual || 0));
  const estrangeira = c.moeda !== 'BRL' && c.alvoMoeda != null;
  let linhaValor;
  if (c.renda) {
    linhaValor = `<span class="mt-num">${valorGrandeHtml(c.renda.atual)}<small>/mês</small></span><span class="mt-de">de ${formatMoeda(c.renda.alvo)}/mês</span>`;
  } else {
    linhaValor = `<span class="mt-num">${valorGrandeHtml(c.atualBRL)}</span><span class="mt-de">de ${c.alvoBRL != null ? formatMoeda(c.alvoBRL) : '—'}${estrangeira ? ` <span class="mt-moeda">(${formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 })})</span>` : ''}</span>`;
  }
  const linhas = [];
  if (meta.tipo === 'reservaEmergencia') {
    linhas.push(['Saldo ideal', c.alvoBRL != null ? formatMoeda(c.alvoBRL) : '—']);
    linhas.push([c.falta > 0 ? 'Falta pro ideal' : 'Acima do ideal', formatMoeda(c.falta > 0 ? c.falta : c.atualBRL - (c.alvoBRL || 0))]);
  } else {
    linhas.push(['Falta', c.renda ? formatMoeda(Math.max(0, c.renda.alvo - c.renda.atual)) + '/mês' : (c.falta != null ? formatMoeda(c.falta) : '—')]);
    linhas.push(['Prazo', c.dataAlvo ? `${rotuloMes(c.dataAlvo)}${c.mesesRestantes != null && c.mesesRestantes >= 0 ? `<small>em ${rotuloDuracao(c.mesesRestantes)}</small>` : ''}` : (c.dataEstimada ? `${rotuloMes(c.dataEstimada)}<small>estimado no seu ritmo</small>` : '—')]);
  }
  const necessario = c.aporteNecessarioTotal;
  const aporte = necessario != null && necessario > 0
    ? `<div class="mt-aporte ${c.aporteAtual + 0.5 >= necessario ? 'ok' : 'baixo'}"><span>Aporte/mês</span><b>${formatMoeda(necessario, 'BRL', { casas: 0 })}</b><span class="mt-fraco">necessário · você: ${c.aporteAtual ? formatMoeda(c.aporteAtual, 'BRL', { casas: 0 }) : '—'}</span></div>`
    : '';
  return `<button class="mt-card" type="button" data-abrir="${escHtml(meta.id)}" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <span class="mt-card-cab">
    ${seloMetaHtml(meta)}
    <span class="mt-card-tit"><strong>${escHtml(meta.nome)}</strong><span>${escHtml(ap.rotulo)}${meta.contribuicao === 'recorrente' ? ' · pagamento recorrente' : ''}</span></span>
    ${meta.status === 'arquivada' ? '<span class="mt-status na">Arquivada</span>' : statusPillHtml(c.status)}
  </span>
  <span class="mt-card-valor">${linhaValor}</span>
  <span class="mt-barra ${p >= 1 ? 'good' : ''}"><span style="width:${(p * 100).toFixed(1)}%"></span></span>
  <span class="mt-card-pct"><b>${pct(c.percentual)}</b>${c.vinculos.length ? ` · ${c.vinculos.length} ${c.vinculos.length === 1 ? 'vínculo' : 'vínculos'}` : ''}</span>
  <span class="mt-card-linhas">${linhas.map(([r, v]) => `<span><em>${r}</em><b>${v}</b></span>`).join('')}</span>
  ${aporte}
</button>`;
}

// ---------------------------------------------------------------------------
// Gráfico (SVG puro): evolução no seu ritmo x necessária x alvo
// ---------------------------------------------------------------------------

export function graficoProjecaoSvg(c, { largura = 640, altura = 230, hoje } = {}) {
  const pontos = serieProjecao(c, { hoje });
  if (pontos.length < 2) return '<p class="hint">Sem dados pra projetar (falta o alvo).</p>';
  const L = Math.max(280, largura); const H = altura;
  const m = { e: 62, d: 14, t: 14, b: 28 };
  const w = L - m.e - m.d; const h = H - m.t - m.b;
  const max = Math.max(c.alvoBRL || 0, ...pontos.map((p) => Math.max(p.ritmo, p.necessaria || 0))) * 1.06 || 1;
  const x = (i) => m.e + (i / (pontos.length - 1)) * w;
  const y = (v) => m.t + h - (v / max) * h;
  const linha = (campo) => pontos.map((p, i) => (p[campo] == null ? '' : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[campo]).toFixed(1)}`)).join(' ');
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f / 1.06);
  const curto = (v) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : v >= 1e3 ? `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : Math.round(v).toString());
  const passo = Math.max(1, Math.ceil((pontos.length - 1) / Math.max(2, Math.floor(w / 80))));
  const ticksX = pontos.map((p, i) => ({ i, p })).filter(({ i }) => i % passo === 0 || i === pontos.length - 1);
  // rótulos das pontas são alinhados pra dentro (ocupam ~1 rótulo inteiro): tira os vizinhos que encostam
  const perto = (a, b) => Math.abs(x(a) - x(b)) < 100;
  for (let k = ticksX.length - 2; k >= 1; k--) if (perto(ticksX[k].i, ticksX[ticksX.length - 1].i) || perto(ticksX[k].i, 0)) ticksX.splice(k, 1);
  const ultimo = pontos[pontos.length - 1];
  const area = `${linha('ritmo')} L${x(pontos.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  return `<svg class="mt-grafico" viewBox="0 0 ${L} ${H}" width="${L}" height="${H}" role="img" aria-label="Evolução projetada: no seu ritmo chega a ${formatMoeda(ultimo.ritmo)} em ${rotuloMes(ultimo.mes)}; alvo ${formatMoeda(c.alvoBRL)}">
  ${ticksY.map((v) => `<line x1="${m.e}" x2="${L - m.d}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="mt-g-grade"/><text x="${m.e - 8}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end" class="mt-g-eixo">${curto(v)}</text>`).join('')}
  ${ticksX.map(({ i, p }) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle'}" class="mt-g-eixo">${rotuloMes(p.mes)}</text>`).join('')}
  <path d="${area}" class="mt-g-area"/>
  ${c.alvoBRL ? `<line x1="${m.e}" x2="${L - m.d}" y1="${y(c.alvoBRL).toFixed(1)}" y2="${y(c.alvoBRL).toFixed(1)}" class="mt-g-alvo"/><text x="${L - m.d}" y="${(y(c.alvoBRL) - 6).toFixed(1)}" text-anchor="end" class="mt-g-rot-alvo">alvo ${formatMoeda(c.alvoBRL, 'BRL', { casas: 0 })}</text>` : ''}
  ${pontos[0].necessaria != null ? `<path d="${linha('necessaria')}" class="mt-g-necessaria"/>` : ''}
  <path d="${linha('ritmo')}" class="mt-g-ritmo"/>
  <circle cx="${x(pontos.length - 1).toFixed(1)}" cy="${y(ultimo.ritmo).toFixed(1)}" r="3.5" class="mt-g-ponto"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export async function montarPaginaMetas(token, {
  doc = document,
  getMetasImpl = getMetas,
  salvarMetaImpl = salvarMetaApi,
  excluirMetaImpl = excluirMetaApi,
  win = doc.defaultView,
  usarCache = true,
} = {}) {
  garantirEstiloMetas(doc);
  const el = {
    carregando: doc.getElementById('mtCarregando'),
    erro: doc.getElementById('mtErro'),
    avisos: doc.getElementById('mtAvisos'),
    tela: doc.getElementById('mtTela'),
    dialogo: doc.getElementById('mtDialogo'),
    nova: doc.getElementById('mtNova'),
    refresh: doc.getElementById('mtRefresh'),
  };
  if (!el.tela) return null;

  const estado = { resposta: null, ctx: null, filtroStatus: 'todas', filtroTipo: 'todos', detalheId: null, assistente: null, simulador: null };

  function idDoHash() {
    const m = String((win && win.location && win.location.hash) || '').match(/meta=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function irPara(id) {
    estado.detalheId = id;
    estado.simulador = null;
    if (win && win.history && win.location) {
      const base = win.location.pathname + win.location.search;
      win.history.pushState(win.history.state, '', id ? `${base}#meta=${encodeURIComponent(id)}` : base);
    }
    desenhar();
    if (win && win.scrollTo) { try { win.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* jsdom */ } }
  }

  function todasAsMetas() {
    const r = estado.resposta || {};
    return [...(r.metas || []), ...(r.arquivadas || [])];
  }
  function acharMeta(id) { return todasAsMetas().find((m) => m.id === id) || null; }
  const calcDe = (meta) => calcularMeta(meta, estado.ctx || {});

  function desenharResposta(resposta) {
    if (el.carregando) el.carregando.hidden = true;
    if (!resposta || !resposta.ok) {
      if (!estado.resposta && el.erro) {
        el.erro.hidden = false;
        el.erro.textContent = `Não deu pra carregar as metas agora (${(resposta && resposta.etapa) || '?'}): ${(resposta && resposta.erro) || 'erro desconhecido'}.`;
      }
      return;
    }
    if (el.erro) el.erro.hidden = true;
    estado.resposta = resposta;
    estado.ctx = contextoMetas(resposta);
    if (el.avisos) {
      const av = resposta.avisos || {};
      el.avisos.hidden = !Object.keys(av).length;
      el.avisos.innerHTML = Object.keys(av).length ? `Algumas informações não carregaram: ${Object.entries(av).map(([k, v]) => `<b>${escHtml(k)}</b>: ${escHtml(v)}`).join(' · ')}` : '';
    }
    el.tela.hidden = false;
    desenhar();
  }

  function desenhar() {
    if (!estado.resposta) return;
    const meta = estado.detalheId ? acharMeta(estado.detalheId) : null;
    if (estado.detalheId && meta) desenharDetalhe(meta);
    else desenharLista();
  }

  // ---------------- lista ----------------
  function desenharLista() {
    const r = estado.resposta;
    const ativas = r.metas || [];
    const calcs = ativas.map((m) => ({ meta: m, c: calcDe(m) }));
    const res = resumoMetas(calcs.map((x) => x.c));
    const arquivadas = (r.arquivadas || []).map((m) => ({ meta: m, c: calcDe(m) }));
    const base = estado.filtroStatus === 'arquivadas' ? arquivadas : calcs;
    const tiposPresentes = [...new Map(base.map(({ meta }) => [chaveTipo(meta), meta])).entries()];
    if (estado.filtroTipo !== 'todos' && !tiposPresentes.some(([k]) => k === estado.filtroTipo)) estado.filtroTipo = 'todos';
    const visiveis = base.filter(({ meta, c }) => passaFiltroStatus(estado.filtroStatus, c) && (estado.filtroTipo === 'todos' || chaveTipo(meta) === estado.filtroTipo));
    const sobre = ativosSobrecomprometidos(ativas, estado.ctx.ativos);

    let html = '';
    if (ativas.length) {
      html += `<section class="mt-resumo" aria-label="Resumo das metas">
  <div class="mt-tile"><span class="mt-rot">Metas ativas</span><span class="mt-grande">${res.quantidade}</span><span class="mt-sub"><b>${res.noRitmo}</b> no ritmo · <b>${res.atrasadas}</b> ${res.atrasadas === 1 ? 'precisa' : 'precisam'} de atenção</span></div>
  <div class="mt-tile"><span class="mt-rot">Já guardado pras metas</span><span class="mt-grande">${valorGrandeHtml(res.atual)}</span><span class="mt-sub">de <b>${formatMoeda(res.alvo, 'BRL', { casas: 0 })}</b> somando os alvos</span></div>
  <div class="mt-tile"><span class="mt-rot">Aporte mensal necessário</span><span class="mt-grande">${valorGrandeHtml(res.aporteNecessario)}</span><span class="mt-sub">você informou <b>${formatMoeda(res.aporteAtual, 'BRL', { casas: 0 })}</b>/mês${res.aporteNecessario > res.aporteAtual + 1 ? ` · faltam <b class="mt-ruim">${formatMoeda(res.aporteNecessario - res.aporteAtual, 'BRL', { casas: 0 })}</b>` : ''}</span></div>
</section>`;
    }
    if (sobre.length) {
      // agrupa por conjunto de metas (uma classe inteira em 2 metas viraria uma linha por ativo)
      const grupos = new Map();
      sobre.forEach((s) => { const k = s.metas.join(' e '); grupos.set(k, [...(grupos.get(k) || []), s]); });
      const partes = [...grupos.entries()].map(([metas, lista]) => {
        const nomes = lista.slice(0, 3).map((s) => `<b>${escHtml(s.nome)}</b>`).join(', ') + (lista.length > 3 ? ` e mais ${lista.length - 3}` : '');
        return `${nomes} ${lista.length === 1 ? 'conta' : 'contam'} em <b>${escHtml(metas)}</b> (${formatMoeda(lista.reduce((t, s) => t + s.comprometido - s.valorBRL, 0), 'BRL', { casas: 0 })} a mais do que existe)`;
      });
      html += `<p class="mt-alerta">O mesmo dinheiro está em mais de uma meta: ${partes.join(' · ')}. Use uma fração ou um valor fixo nos vínculos.</p>`;
    }
    if (ativas.length || arquivadas.length) {
      html += `<div class="mt-filtros">
  <div class="filter-tabs" role="tablist" aria-label="Status">${FILTROS_STATUS.filter(([k]) => k !== 'arquivadas' || arquivadas.length).map(([k, rot]) => `<button type="button" class="filter-tab ${estado.filtroStatus === k ? 'active' : ''}" data-filtro-status="${k}" role="tab" aria-selected="${estado.filtroStatus === k}">${rot}</button>`).join('')}</div>
  ${tiposPresentes.length > 1 ? `<div class="mt-filtro-tipos" aria-label="Tipo"><button type="button" class="mt-chip ${estado.filtroTipo === 'todos' ? 'active' : ''}" data-filtro-tipo="todos">Todos os tipos</button>${tiposPresentes.map(([k, m]) => `<button type="button" class="mt-chip ${estado.filtroTipo === k ? 'active' : ''}" data-filtro-tipo="${escHtml(k)}">${iconeMetaSvg(aparenciaMeta(m).icone, { tamanho: 13 })}${escHtml(aparenciaMeta(m).rotulo)}</button>`).join('')}</div>` : ''}
</div>`;
    }
    if (visiveis.length) {
      html += `<div class="mt-grade">${visiveis.map(({ meta, c }) => cardMetaHtml(meta, c)).join('')}</div>`;
    } else if (ativas.length || arquivadas.length) {
      html += '<p class="mt-vazio-filtro">Nenhuma meta nesse filtro.</p>';
    }
    const sugestoes = sugestoesMetas({ referencias: estado.ctx.referencias, hoje: estado.ctx.hoje, existentes: ativas });
    if (!ativas.length) {
      html += `<section class="mt-vazio">
  <div class="mt-vazio-cab">${iconeMetaSvg('alvo', { tamanho: 28 })}<div><h2>Comece por uma meta</h2><p>Escolha uma sugestão (já vem com os números da sua planilha) ou monte a sua do zero. Dá pra editar tudo depois.</p></div></div>
  <div class="mt-sugestoes">${sugestoes.map((s, i) => sugestaoHtml(s, i)).join('')}</div>
  <button class="btn btn-ghost" type="button" data-nova>Montar do zero</button>
</section>`;
    } else if (sugestoes.length && estado.filtroStatus === 'todas' && estado.filtroTipo === 'todos') {
      html += `<details class="mt-mais-sugestoes"><summary>Sugestões de metas</summary><div class="mt-sugestoes">${sugestoes.map((s, i) => sugestaoHtml(s, i)).join('')}</div></details>`;
    }
    el.tela.innerHTML = html;
    estado.sugestoes = sugestoes;
  }

  function sugestaoHtml(s, i) {
    const c = calcDe(s.meta);
    const ap = aparenciaMeta(s.meta);
    const valor = c.renda ? `${formatMoeda(c.renda.alvo, 'BRL', { casas: 0 })}/mês` : (c.alvoBRL != null ? (c.moeda !== 'BRL' ? formatMoeda(c.alvoMoeda, c.moeda, { casas: 0 }) : formatMoeda(c.alvoBRL, 'BRL', { casas: 0 })) : '');
    return `<button type="button" class="mt-sugestao" data-sugestao="${i}" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  ${seloMetaHtml(s.meta, { tamanho: 34 })}
  <span class="mt-sug-txt"><strong>${escHtml(s.meta.nome)}</strong><span>${escHtml(s.porque)}</span></span>
  <span class="mt-sug-valor mono">${valor}</span>
  <span class="mt-sug-mais" aria-hidden="true">+</span>
</button>`;
  }

  // ---------------- detalhe ----------------
  function desenharDetalhe(meta) {
    const c = calcDe(meta);
    const ap = aparenciaMeta(meta);
    const arquivada = meta.status === 'arquivada';
    const estrangeira = c.moeda !== 'BRL' && c.alvoMoeda != null;
    const tiles = [];
    if (c.renda) {
      tiles.push(['Renda média (12 meses)', `${valorGrandeHtml(c.renda.atual)}<small>/mês</small>`, `meta <b>${formatMoeda(c.renda.alvo)}</b>/mês · ${c.renda.origem === 'vinculados' ? 'proventos dos vinculados' : 'proventos de toda a carteira'}`]);
      tiles.push(['Patrimônio que gera a renda', valorGrandeHtml(c.atualBRL), `necessário <b>${c.alvoBRL != null ? formatMoeda(c.alvoBRL, 'BRL', { casas: 0 }) : '—'}</b>${c.renda.yieldAtual ? ` · rende hoje <b>${pct(c.renda.yieldAtual, 1)}</b> a.a.` : ''}`]);
    } else {
      tiles.push([meta.tipo === 'reservaEmergencia' ? 'Reserva hoje' : 'Já tenho', valorGrandeHtml(c.atualBRL + (c.conta ? c.conta.valorPago : 0)), `de <b>${c.alvoBRL != null ? formatMoeda(c.alvoBRL + (c.conta ? c.conta.valorTotal : 0)) : '—'}</b>${estrangeira ? ` (${formatMoeda(c.alvoMoeda, c.moeda)} a ${formatMoeda(c.cotacao, 'BRL', { casas: 4 })})` : ''}`]);
      const contaFalta = c.conta ? c.conta.valorTotal - c.conta.valorPago : 0;
      const subFalta = [c.faltaMoeda != null && estrangeira ? `<b>${formatMoeda(c.faltaMoeda, c.moeda)}</b> pra juntar` : null, contaFalta > 0 ? `<b>${formatMoeda(contaFalta)}</b> de parcelas` : null].filter(Boolean).join(' + ');
      tiles.push([meta.tipo === 'reservaEmergencia' ? (c.falta > 0 ? 'Falta pro saldo ideal' : 'Acima do ideal') : 'Falta', valorGrandeHtml(meta.tipo === 'reservaEmergencia' && !(c.falta > 0) ? c.atualBRL - (c.alvoBRL || 0) : (c.falta || 0) + contaFalta), subFalta || `${pct(c.percentual)} concluído`]);
    }
    if (meta.tipo !== 'reservaEmergencia') {
      tiles.push(['Aporte mensal necessário', c.aporteNecessarioTotal != null ? valorGrandeHtml(c.aporteNecessarioTotal) : '—', c.dataAlvo ? `até <b>${rotuloMes(c.dataAlvo)}</b>${c.mesesRestantes != null && c.mesesRestantes >= 0 ? ` (${rotuloDuracao(c.mesesRestantes)})` : ''} · você: <b>${c.aporteAtual ? formatMoeda(c.aporteAtual) : '—'}</b>` : 'defina uma data pra saber']);
      tiles.push(['No seu ritmo', c.dataEstimada ? rotuloMes(c.dataEstimada) : (c.mesesEstimados === 0 ? 'já chegou' : '—'), c.aporteAtual ? `aportando <b>${formatMoeda(c.aporteAtual)}</b>/mês a ${pct(meta.rendimentoAnual || 0, 1)} a.a.` : 'informe o seu aporte mensal (Editar)']);
    } else {
      tiles.push(['Saldo ideal', c.alvoBRL != null ? valorGrandeHtml(c.alvoBRL) : '—', c.partes.length ? `${c.partes[1].valor} meses x ${formatMoeda(c.partes[0].valor)} + ${pct(c.partes[2].valor)}` : '']);
    }

    const p = Math.max(0, Math.min(1, c.percentual || 0));
    let html = `<div class="mt-detalhe">
<button type="button" class="mt-voltar" data-voltar><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>Todas as metas</button>
<section class="mt-heroi" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <div class="mt-heroi-cab">
    ${seloMetaHtml(meta, { tamanho: 46 })}
    <div class="mt-heroi-tit"><span class="mt-eyebrow">${escHtml(ap.rotulo)}${meta.especificos && meta.especificos.destino ? ` · ${escHtml(meta.especificos.destino)}` : ''}</span><h2>${escHtml(meta.nome)}</h2></div>
    ${arquivada ? '<span class="mt-status na">Arquivada</span>' : statusPillHtml(c.status)}
    <div class="mt-heroi-acoes">
      ${arquivada ? '<button class="btn btn-ghost mt-btn-sm" type="button" data-restaurar>Restaurar</button>' : '<button class="btn btn-ghost mt-btn-sm" type="button" data-editar>Editar</button><button class="btn btn-ghost mt-btn-sm" type="button" data-arquivar>Arquivar</button>'}
    </div>
  </div>
  <div class="mt-heroi-barra"><span class="mt-barra grande ${p >= 1 ? 'good' : ''}"><span style="width:${(p * 100).toFixed(1)}%"></span></span><b class="mono">${pct(c.percentual)}</b></div>
  ${meta.notas ? `<p class="mt-notas">${escHtml(meta.notas)}</p>` : ''}
  ${c.avisos.length ? `<p class="mt-alerta">${c.avisos.map(escHtml).join(' · ')}</p>` : ''}
</section>
<section class="mt-tiles">${tiles.map(([r, v, s]) => `<div class="mt-tile"><span class="mt-rot">${r}</span><span class="mt-grande">${v}</span><span class="mt-sub">${s}</span></div>`).join('')}</section>
<div class="mt-colunas">
  <div class="mt-col-principal">`;

    if (meta.tipo !== 'reservaEmergencia' && c.alvoBRL != null) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Evolução projetada</h3><span class="mt-legenda"><i class="ritmo"></i>no seu ritmo${c.aporteNecessario != null ? '<i class="necessaria"></i>necessária' : ''}<i class="alvo"></i>alvo</span></div><div class="mt-grafico-caixa" id="mtGrafico"></div>
      <p class="mt-nota">${c.taxa ? `Rendimento de ${pct(meta.rendimentoAnual || 0, 1)} ao ano (${pct(c.taxa, 2)} ao mês), aportes no fim de cada mês.` : 'Sem rendimento informado - só a soma dos aportes.'}</p></section>`;
    }
    if (c.partes.length && meta.tipo !== 'acumulo') {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>De onde vem o alvo</h3></div><ul class="mt-partes">${c.partes.map((pt) => `<li><span>${escHtml(pt.rotulo)}</span><b class="mono">${pt.tipo === '%' ? pct(pt.valor, 1) : pt.tipo === 'n' ? pt.valor : formatMoeda(pt.valor)}</b></li>`).join('')}<li class="total"><span>${meta.tipo === 'rendaPassiva' ? 'Patrimônio necessário' : meta.tipo === 'reservaEmergencia' ? 'Saldo ideal' : 'Alvo'}</span><b class="mono">${formatMoeda(c.alvoBRL)}</b></li></ul>
      ${meta.tipo === 'reservaEmergencia' ? '<p class="mt-nota">O custo de vida vem das Despesas essenciais (Organização Financeira) - adicionar ou remover uma despesa lá muda o saldo ideal aqui.</p>' : ''}</section>`;
    }
    if (c.conta) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>${escHtml(c.conta.descricao || 'Conta mensal')}</h3><span class="mt-fraco">${c.conta.pagas} de ${c.conta.total} parcelas</span></div>
      <div class="mt-heroi-barra"><span class="mt-barra"><span style="width:${((c.conta.pagas / c.conta.total) * 100).toFixed(1)}%"></span></span></div>
      <p class="mt-nota">${formatMoeda(c.conta.valor)}/mês · total ${formatMoeda(c.conta.valorTotal)} · pago ${formatMoeda(c.conta.valorPago)}${c.conta.inicio ? ` · desde ${rotuloMes(c.conta.inicio)}` : ''}</p></section>`;
    }
    if (c.recorrente) {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Pagamento recorrente</h3><span class="mt-fraco">${c.recorrente.pagas} de ${c.recorrente.total} parcelas</span></div>
      <p class="mt-nota">${formatMoeda(c.recorrente.parcela)}/mês${c.recorrente.fim ? ` · última parcela em ${rotuloMes(c.recorrente.fim)}` : ''} · faltam ${formatMoeda(c.recorrente.parcela * c.recorrente.restantes)}</p></section>`;
    }
    if (!['rendaPassiva', 'reservaEmergencia'].includes(meta.tipo) && meta.contribuicao !== 'recorrente') {
      html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Itens de custo</h3><span class="mt-fraco">${c.itens.length ? 'o alvo é a soma dos itens' : 'opcional - divida o alvo em partes'}</span></div><div id="mtItensDetalhe"></div></section>`;
    }
    html += `</div><div class="mt-col-lateral">`;
    html += `<section class="mt-bloco"><div class="mt-bloco-cab"><h3>Investimentos vinculados</h3>${arquivada ? '' : '<button type="button" class="mt-link" data-editar-vinculos>Editar</button>'}</div>${vinculosDetalheHtml(c)}</section>`;
    if (!arquivada) html += `<section class="mt-bloco" id="mtSimulador"></section>`;
    const dicas = ap.dicas || [];
    if (dicas.length) html += `<section class="mt-bloco mt-dicas"><h3>Dicas</h3><ul>${dicas.map((d) => `<li>${escHtml(d)}</li>`).join('')}</ul></section>`;
    html += '</div></div></div>';
    el.tela.innerHTML = html;

    desenharGrafico(c);
    const itensEl = doc.getElementById('mtItensDetalhe');
    if (itensEl) {
      montarEditorItens(itensEl, meta, { aoMudar: (itens) => salvar({ ...clonar(meta), itens }, { manterDetalhe: true, silencioso: true }), somenteLeitura: arquivada, cambio: estado.ctx.cambio });
    }
    const simEl = doc.getElementById('mtSimulador');
    if (simEl) montarSimulador(simEl, meta, c);
  }

  function vinculosDetalheHtml(c) {
    if (!c.vinculos.length) return `<p class="mt-nota">Nenhum investimento vinculado: o progresso conta só o que você informou como já guardado${c.valorInicial ? ` (${formatMoeda(c.valorInicial)})` : ''}.</p>`;
    const linhas = c.vinculos.map((v) => {
      let nome; let sub = '';
      if (v.tipo === 'classe') { nome = `Toda a classe ${ROTULO_CLASSE[v.classe]}`; sub = `${v.ativos.length} ativos`; }
      else if (v.tipo === 'marca') { nome = ROTULO_MARCA[v.marca]; sub = `${v.ativos.length} títulos`; }
      else {
        const a = v.ativos[0];
        nome = a ? `<a href="${escHtml(urlAtivo(a.ref))}">${escHtml(a.nome)}</a>` : escHtml(v.nome || v.id);
        sub = a ? [ROTULO_CLASSE[a.classe], a.instituicao, a.classe === 'rf' && a.marca ? ROTULO_MARCA[a.marca] : null].filter(Boolean).map(escHtml).join(' · ') : 'não encontrado na carteira';
      }
      const modo = v.modo === 'fracao' ? `${pct(v.fracao, 0)} de ${formatMoeda(v.base, 'BRL', { casas: 0 })}` : v.modo === 'valor' ? `valor fixo de ${formatMoeda(v.base, 'BRL', { casas: 0 })}` : 'total';
      return `<li><span class="mt-v-nome">${v.tipo === 'ativo' ? nome : escHtml(nome)}<em>${sub} · ${modo}</em></span><b class="mono">${formatMoeda(v.valorBRL)}</b></li>`;
    }).join('');
    return `<ul class="mt-vinculos">${linhas}${c.valorInicial ? `<li><span class="mt-v-nome">Guardado fora dos investimentos<em>informado por você</em></span><b class="mono">${formatMoeda(c.valorInicial)}</b></li>` : ''}${c.itensConcluidosBRL ? `<li><span class="mt-v-nome">Itens já pagos</span><b class="mono">${formatMoeda(c.itensConcluidosBRL)}</b></li>` : ''}<li class="total"><span>Total</span><b class="mono">${formatMoeda(c.atualBRL)}</b></li></ul>`;
  }

  function desenharGrafico(c) {
    const caixa = doc.getElementById('mtGrafico');
    if (!caixa) return;
    const largura = caixa.clientWidth || 640;
    caixa.innerHTML = graficoProjecaoSvg(c, { largura, altura: largura < 480 ? 200 : 240, hoje: estado.ctx.hoje });
  }

  // ---------------- simulador ----------------
  function montarSimulador(caixa, meta, c) {
    const s = estado.simulador && estado.simulador.id === meta.id ? estado.simulador : {
      id: meta.id, modo: 'data', moeda: c.moeda, alvo: c.alvoMoeda != null ? c.alvoMoeda : c.alvoBRL,
      atual: c.atualBRL, rendimento: meta.rendimentoAnual != null ? meta.rendimentoAnual : 0.1,
      data: c.dataAlvo || somarMeses(mesDe(estado.ctx.hoje), 12), aporte: c.aporteAtual || c.aporteNecessario || 500,
    };
    estado.simulador = s;
    const resultado = () => {
      const cot = cotacao(s.moeda, estado.ctx.cambio) || 1;
      const alvoBRL = (s.alvo || 0) * cot;
      const alvoTxt = s.moeda !== 'BRL' ? `${formatMoeda(s.alvo, s.moeda)} (${formatMoeda(alvoBRL)})` : formatMoeda(alvoBRL);
      if (!(alvoBRL > 0)) return 'Informe o alvo.';
      if (s.modo === 'data') {
        const meses = mesesEntre(mesDe(estado.ctx.hoje), s.data);
        if (meses == null) return 'Escolha o mês.';
        const r = simular({ alvo: alvoBRL, atual: s.atual || 0, rendimentoAnual: s.rendimento, meses: Math.max(0, meses) });
        if (r.aporte === 0) return `Com <b>${formatMoeda(s.atual || 0)}</b> já guardados e rendimento de ${pct(s.rendimento, 1)} a.a., você alcança ${alvoTxt} até ${rotuloMes(s.data)} <b>sem aportar mais nada</b>.`;
        return `Para alcançar <b>${alvoTxt}</b> até <b>${rotuloMes(s.data)}</b> com rendimento de ${pct(s.rendimento, 1)} a.a., aporte <b class="mt-destaque">${formatMoeda(r.aporte)}</b> por mês${meses > 0 ? ` (${rotuloDuracao(meses)}; ${formatMoeda(r.totalAportado, 'BRL', { casas: 0 })} de aportes + ${formatMoeda(r.rendimento, 'BRL', { casas: 0 })} de rendimento)` : ''}.`;
      }
      const r = simular({ alvo: alvoBRL, atual: s.atual || 0, rendimentoAnual: s.rendimento, aporte: s.aporte || 0 });
      if (r.mesesAteAlvo === 0) return `Você já tem o suficiente pra ${alvoTxt}.`;
      if (!Number.isFinite(r.mesesAteAlvo)) return `Aportando ${formatMoeda(s.aporte || 0)} por mês você não chega em ${alvoTxt} - aumente o aporte ou o rendimento.`;
      const quando = somarMeses(mesDe(estado.ctx.hoje), Math.ceil(r.mesesAteAlvo));
      return `Aportando <b>${formatMoeda(s.aporte || 0)}</b> por mês a ${pct(s.rendimento, 1)} a.a., você chega em <b>${alvoTxt}</b> em <b class="mt-destaque">${rotuloMes(quando)}</b> (${rotuloDuracao(r.mesesAteAlvo)}).`;
    };
    caixa.innerHTML = `<div class="mt-bloco-cab"><h3>Simulador</h3></div>
<div class="filter-tabs mt-sim-modo"><button type="button" class="filter-tab ${s.modo === 'data' ? 'active' : ''}" data-sim-modo="data">Até uma data</button><button type="button" class="filter-tab ${s.modo === 'aporte' ? 'active' : ''}" data-sim-modo="aporte">Com um aporte</button></div>
<div class="mt-sim-campos">
  <label class="mt-campo"><span>Alvo</span><span class="mt-entrada"><select data-sim="moeda" aria-label="Moeda">${MOEDAS.map((m) => `<option ${m === s.moeda ? 'selected' : ''}>${m}</option>`).join('')}</select><input data-sim="alvo" inputmode="decimal" value="${numParaCampo(s.alvo)}"></span></label>
  <label class="mt-campo"><span>Já tenho (R$)</span><input data-sim="atual" inputmode="decimal" value="${numParaCampo(s.atual)}"></label>
  <label class="mt-campo"><span>Rendimento (% a.a.)</span><input data-sim="rendimento" inputmode="decimal" value="${numParaCampo((s.rendimento || 0) * 100)}"></label>
  ${s.modo === 'data' ? `<label class="mt-campo"><span>Até o mês</span><input type="month" data-sim="data" value="${s.data || ''}"></label>` : `<label class="mt-campo"><span>Aporte mensal (R$)</span><input data-sim="aporte" inputmode="decimal" value="${numParaCampo(s.aporte)}"></label>`}
</div>
<p class="mt-sim-resultado" aria-live="polite">${resultado()}</p>`;
    caixa.querySelectorAll('[data-sim-modo]').forEach((b) => b.addEventListener('click', () => { s.modo = b.dataset.simModo; montarSimulador(caixa, meta, c); }));
    caixa.querySelectorAll('[data-sim]').forEach((inp) => {
      const ev = inp.tagName === 'SELECT' || inp.type === 'month' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        const k = inp.dataset.sim;
        if (k === 'moeda' || k === 'data') s[k] = inp.value;
        else if (k === 'rendimento') s.rendimento = (parseNumeroBR(inp.value) || 0) / 100;
        else s[k] = parseNumeroBR(inp.value);
        caixa.querySelector('.mt-sim-resultado').innerHTML = resultado();
      });
    });
  }

  // ---------------- sub-itens ----------------
  function montarEditorItens(caixa, meta, { aoMudar, somenteLeitura = false, cambio }) {
    let itens = clonar(meta.itens || []);
    let timer = null;
    const avisar = (imediato) => {
      if (timer) clearTimeout(timer);
      if (imediato) aoMudar(clonar(itens));
      else timer = setTimeout(() => aoMudar(clonar(itens)), 700);
    };
    function desenharItens() {
      const total = itens.reduce((s, it) => s + ((cotacao(it.moeda, cambio) || 0) * (Number(it.valor) || 0)), 0);
      caixa.innerHTML = `${itens.length ? `<ul class="mt-itens">${itens.map((it, i) => `<li class="${it.concluido ? 'feito' : ''}">
  <label class="mt-check" title="Já pago"><input type="checkbox" data-item-check="${i}" ${it.concluido ? 'checked' : ''} ${somenteLeitura ? 'disabled' : ''}><span class="sr">Já pago</span></label>
  <input class="mt-item-nome" data-item-nome="${i}" value="${escHtml(it.nome)}" aria-label="Item" ${somenteLeitura ? 'disabled' : ''}>
  <span class="mt-entrada mt-item-valor"><select data-item-moeda="${i}" aria-label="Moeda" ${somenteLeitura ? 'disabled' : ''}>${MOEDAS.map((m) => `<option ${m === it.moeda ? 'selected' : ''}>${m}</option>`).join('')}</select><input data-item-valor="${i}" inputmode="decimal" value="${numParaCampo(it.valor)}" aria-label="Valor" ${somenteLeitura ? 'disabled' : ''}></span>
  <span class="mt-item-brl mono">${it.moeda !== 'BRL' && cotacao(it.moeda, cambio) ? formatMoeda((Number(it.valor) || 0) * cotacao(it.moeda, cambio), 'BRL', { casas: 0 }) : ''}</span>
  ${somenteLeitura ? '' : `<button type="button" class="mt-x" data-item-remover="${i}" aria-label="Remover ${escHtml(it.nome)}">×</button>`}
</li>`).join('')}</ul><p class="mt-itens-total"><span>Total</span><b class="mono">${formatMoeda(total)}</b></p>` : ''}
${somenteLeitura ? '' : '<button type="button" class="mt-link" data-item-add>+ Adicionar item</button>'}`;
    }
    desenharItens();
    caixa.addEventListener('click', (ev) => {
      const add = ev.target.closest('[data-item-add]');
      const rem = ev.target.closest('[data-item-remover]');
      if (add) {
        itens.push({ id: idItem(), nome: `Item ${itens.length + 1}`, valor: 0, moeda: meta.moeda || 'BRL', concluido: false });
        desenharItens();
        const ultimo = caixa.querySelector(`[data-item-nome="${itens.length - 1}"]`);
        if (ultimo) { ultimo.focus(); ultimo.select(); }
        avisar(false);
      } else if (rem) {
        itens.splice(Number(rem.dataset.itemRemover), 1);
        desenharItens();
        avisar(true);
      }
    });
    caixa.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t.dataset.itemNome != null) { itens[Number(t.dataset.itemNome)].nome = t.value; avisar(false); }
      if (t.dataset.itemValor != null) {
        const i = Number(t.dataset.itemValor);
        itens[i].valor = parseNumeroBR(t.value) || 0;
        const brl = t.closest('li').querySelector('.mt-item-brl');
        if (brl) brl.textContent = itens[i].moeda !== 'BRL' && cotacao(itens[i].moeda, cambio) ? formatMoeda(itens[i].valor * cotacao(itens[i].moeda, cambio), 'BRL', { casas: 0 }) : '';
        const tot = caixa.querySelector('.mt-itens-total b');
        if (tot) tot.textContent = formatMoeda(itens.reduce((s, it) => s + ((cotacao(it.moeda, cambio) || 0) * (Number(it.valor) || 0)), 0));
        avisar(false);
      }
    });
    caixa.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.itemCheck != null) { itens[Number(t.dataset.itemCheck)].concluido = t.checked; desenharItens(); avisar(true); }
      if (t.dataset.itemMoeda != null) { itens[Number(t.dataset.itemMoeda)].moeda = t.value; desenharItens(); avisar(true); }
    });
  }

  // ---------------- salvar / arquivar ----------------
  async function salvar(meta, { manterDetalhe = false, silencioso = false } = {}) {
    const r = await salvarMetaImpl(token, meta);
    if (!r || !r.ok) {
      const msg = `Não salvou: ${(r && r.erro) || 'erro desconhecido'}`;
      if (!silencioso && win && win.alert) win.alert(msg); else console.error(msg);
      return null;
    }
    const salva = r.meta || { ...meta, id: r.id };
    const lista = (estado.resposta.metas || []).filter((m) => m.id !== salva.id);
    const idx = (estado.resposta.metas || []).findIndex((m) => m.id === salva.id);
    if (idx >= 0) lista.splice(idx, 0, salva); else lista.push(salva);
    estado.resposta = { ...estado.resposta, metas: lista };
    gravarCacheDados('metas', estado.resposta);
    if (manterDetalhe && silencioso) {
      // edição de sub-item: só atualiza os números (não redesenha os campos que estão sendo digitados)
      return salva;
    }
    if (manterDetalhe || !silencioso) irPara(salva.id); else desenhar();
    return salva;
  }

  async function arquivar(meta, restaurar = false) {
    if (!restaurar && win && win.confirm && !win.confirm(`Arquivar "${meta.nome}"? Ela sai da lista (fica em "Arquivadas" e dá pra restaurar).`)) return;
    const r = await excluirMetaImpl(token, meta.id, { restaurar });
    if (!r || !r.ok) { if (win && win.alert) win.alert(`Não deu: ${(r && r.erro) || 'erro desconhecido'}`); return; }
    const m = { ...meta, status: restaurar ? 'ativa' : 'arquivada' };
    const metas = (estado.resposta.metas || []).filter((x) => x.id !== meta.id);
    const arquivadas = (estado.resposta.arquivadas || []).filter((x) => x.id !== meta.id);
    if (restaurar) metas.push(m); else arquivadas.push(m);
    estado.resposta = { ...estado.resposta, metas, arquivadas };
    gravarCacheDados('metas', estado.resposta);
    if (restaurar) desenhar(); else { estado.filtroStatus = 'todas'; irPara(null); }
  }

  // ---------------- assistente (nova meta / editar) ----------------
  function abrirAssistente(meta, passo = 1, { editando = false } = {}) {
    estado.assistente = { meta: clonar(meta), passo, editando, buscaAtivo: '' };
    el.dialogo.hidden = false;
    doc.body.classList.add('mt-dialogo-aberto');
    desenharAssistente();
  }
  function fecharAssistente() {
    estado.assistente = null;
    el.dialogo.hidden = true;
    el.dialogo.innerHTML = '';
    doc.body.classList.remove('mt-dialogo-aberto');
  }

  const PASSOS = ['Tipo', 'Dados', 'Investimentos', 'Revisar'];

  function desenharAssistente() {
    const a = estado.assistente;
    if (!a) return;
    const m = a.meta;
    let corpo = '';
    if (a.passo === 1) corpo = passoTipoHtml(m);
    if (a.passo === 2) corpo = passoDadosHtml(m);
    if (a.passo === 3) corpo = passoVinculosHtml(m);
    if (a.passo === 4) corpo = passoRevisarHtml(m);
    el.dialogo.innerHTML = `<div class="mt-dialogo" role="dialog" aria-modal="true" aria-labelledby="mtDialogoTitulo">
  <header class="mt-dialogo-cab">
    <h2 id="mtDialogoTitulo">${a.editando ? `Editar "${escHtml(m.nome)}"` : 'Nova meta'}</h2>
    <button type="button" class="mt-x mt-fechar" data-fechar aria-label="Fechar">×</button>
  </header>
  <ol class="mt-passos">${PASSOS.map((p, i) => `<li class="${i + 1 === a.passo ? 'atual' : i + 1 < a.passo ? 'feito' : ''}"><button type="button" data-passo="${i + 1}" ${i + 1 > a.passo && !(a.editando || a.passo > 1) ? 'disabled' : ''}><span>${i + 1}</span>${p}</button></li>`).join('')}</ol>
  <div class="mt-dialogo-corpo">${corpo}</div>
  <footer class="mt-dialogo-rodape">
    ${a.passo > 1 ? '<button type="button" class="btn btn-ghost" data-anterior>Voltar</button>' : '<span></span>'}
    <span class="mt-dialogo-previa" id="mtPrevia">${a.passo >= 2 ? previaHtml(m) : ''}</span>
    ${a.passo === 1 ? '' : a.passo < 4 ? '<button type="button" class="btn btn-primary" data-proximo>Continuar</button>' : `<button type="button" class="btn btn-primary" data-salvar>${a.editando ? 'Salvar alterações' : 'Criar meta'}</button>`}
  </footer>
</div>`;
    if (a.passo === 2) {
      const caixa = el.dialogo.querySelector('#mtItensAssistente');
      if (caixa) montarEditorItens(caixa, m, { aoMudar: (itens) => { m.itens = itens; atualizarPrevia(); }, cambio: estado.ctx.cambio });
    }
    const foco = el.dialogo.querySelector('[data-foco]') || el.dialogo.querySelector('.mt-dialogo-corpo input, .mt-dialogo-corpo button');
    if (foco) { try { foco.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
  }

  function previaHtml(m) {
    const c = calcDe(m);
    if (c.renda) return `renda hoje <b>${formatMoeda(c.renda.atual, 'BRL', { casas: 0 })}</b>/mês · patrimônio necessário <b>${c.alvoBRL != null ? formatMoeda(c.alvoBRL, 'BRL', { casas: 0 }) : '—'}</b>`;
    if (c.alvoBRL == null) return 'informe o alvo';
    return `alvo <b>${formatMoeda(c.alvoBRL, 'BRL', { casas: 0 })}</b>${c.aporteNecessarioTotal ? ` · aporte <b>${formatMoeda(c.aporteNecessarioTotal, 'BRL', { casas: 0 })}</b>/mês` : ''}`;
  }
  function atualizarPrevia() {
    const p = el.dialogo.querySelector('#mtPrevia');
    if (p && estado.assistente) p.innerHTML = previaHtml(estado.assistente.meta);
  }

  function passoTipoHtml(m) {
    const tile = (tipo, categoria) => {
      const fake = { tipo, categoria };
      const ap = aparenciaMeta(fake);
      const resumo = tipo === 'acumulo' ? (CATEGORIAS_ACUMULO[categoria].dica || '') : TIPOS_META[tipo].resumo;
      const ativo = m.tipo === tipo && (tipo !== 'acumulo' || m.categoria === categoria);
      return `<button type="button" class="mt-tipo ${ativo ? 'ativo' : ''}" data-tipo="${tipo}" ${categoria ? `data-categoria="${categoria}"` : ''} style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">${seloMetaHtml(fake, { tamanho: 34 })}<span><strong>${escHtml(ap.rotulo)}</strong><em>${escHtml(resumo)}</em></span></button>`;
    };
    return `<p class="mt-dialogo-dica">Que tipo de meta? Cada tipo pede os dados certos e calcula do jeito certo.</p>
<h4 class="mt-grupo">Patrimônio e renda</h4><div class="mt-tipos">${['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].map((t) => tile(t)).join('')}</div>
<h4 class="mt-grupo">Objetivos</h4><div class="mt-tipos">${['viagemInternacional', 'viagemNacional', 'casa', 'carro'].map((t) => tile(t)).join('')}</div>
<h4 class="mt-grupo">Juntar até uma data</h4><div class="mt-tipos compacto">${Object.keys(CATEGORIAS_ACUMULO).map((k) => tile('acumulo', k)).join('')}</div>`;
  }

  function campo({ caminho, rotulo, formato = 'dinheiro', ajuda = '', moeda = null, opcoes = null, largura = '', foco = false }) {
    const m = estado.assistente.meta;
    const v = lerCaminho(m, caminho);
    let entrada;
    if (formato === 'texto') entrada = `<input data-campo="${caminho}" data-formato="texto" value="${escHtml(v || '')}" ${foco ? 'data-foco' : ''}>`;
    else if (formato === 'mes') entrada = `<input type="month" data-campo="${caminho}" data-formato="mes" value="${escHtml(v || '')}">`;
    else if (formato === 'select') entrada = `<select data-campo="${caminho}" data-formato="select">${opcoes.map(([k, r]) => `<option value="${escHtml(k)}" ${String(v) === String(k) ? 'selected' : ''}>${escHtml(r)}</option>`).join('')}</select>`;
    else if (formato === 'bool') return `<label class="mt-campo mt-campo-bool ${largura}"><input type="checkbox" data-campo="${caminho}" data-formato="bool" ${v ? 'checked' : ''}><span>${rotulo}${ajuda ? `<em>${ajuda}</em>` : ''}</span></label>`;
    else {
      const mostra = formato === 'pct' ? numParaCampo(v == null ? null : v * 100, 2) : numParaCampo(v, formato === 'int' ? 0 : 2);
      const prefixo = formato === 'dinheiro' ? `<span class="mt-prefixo">${escHtml(moeda || 'R$')}</span>` : '';
      const sufixo = formato === 'pct' ? '<span class="mt-sufixo">%</span>' : '';
      entrada = `<span class="mt-entrada">${prefixo}<input data-campo="${caminho}" data-formato="${formato}" inputmode="decimal" value="${mostra}" ${foco ? 'data-foco' : ''}>${sufixo}</span>`;
    }
    return `<label class="mt-campo ${largura}"><span>${rotulo}</span>${entrada}${ajuda ? `<em>${ajuda}</em>` : ''}</label>`;
  }

  function passoDadosHtml(m) {
    const ref = estado.ctx.referencias || {};
    const simbolo = (moeda) => (moeda === 'BRL' ? 'R$' : moeda);
    const f = [];
    f.push(campo({ caminho: 'nome', rotulo: 'Nome da meta', formato: 'texto', largura: 'largo', foco: true }));
    if (m.tipo === 'acumulo') f.push(campo({ caminho: 'categoria', rotulo: 'Categoria', formato: 'select', opcoes: Object.entries(CATEGORIAS_ACUMULO).map(([k, c]) => [k, c.nome]) }));
    const dataViagem = m.tipo === 'viagemInternacional' || m.tipo === 'viagemNacional';
    if (dataViagem) f.push(campo({ caminho: 'especificos.destino', rotulo: 'Destino', formato: 'texto' }));
    if (m.tipo === 'rendaPassiva') {
      f.push(campo({ caminho: 'especificos.rendaMensal', rotulo: 'Renda passiva por mês', ajuda: ref.rendaPassiva && ref.rendaPassiva.metaPlanilha ? `na planilha (aba Distribuição e Metas): ${formatMoeda(ref.rendaPassiva.metaPlanilha)}` : '' }));
      f.push(campo({ caminho: 'especificos.dyAnual', rotulo: 'Rendimento em proventos (DY) ao ano', formato: 'pct', ajuda: 'patrimônio necessário = renda x 12 / DY' }));
      f.push(campo({ caminho: 'dataAlvo', rotulo: 'Até quando', formato: 'mes' }));
    } else if (m.tipo === 'reservaEmergencia') {
      const cv = ref.reserva && ref.reserva.custoDeVida;
      f.push(campo({ caminho: 'especificos.meses', rotulo: 'Meses de custo de vida', formato: 'int' }));
      f.push(campo({ caminho: 'especificos.margem', rotulo: 'Sobra de segurança', formato: 'pct' }));
      f.push(campo({ caminho: 'especificos.usarDespesasPlanilha', rotulo: `Usar o custo de vida das Despesas essenciais${cv ? ` (${formatMoeda(cv)}/mês)` : ''}`, formato: 'bool', largura: 'largo' }));
      if (m.especificos && m.especificos.usarDespesasPlanilha === false) f.push(campo({ caminho: 'especificos.despesaMensal', rotulo: 'Despesa mensal' }));
    } else if (m.tipo === 'casa') {
      f.push(campo({ caminho: 'especificos.valorImovel', rotulo: 'Valor do imóvel' }));
      f.push(campo({ caminho: 'especificos.entradaPct', rotulo: 'Entrada', formato: 'pct' }));
      f.push(campo({ caminho: 'especificos.custosPct', rotulo: 'ITBI, escritura e registro', formato: 'pct' }));
    } else if (m.tipo === 'carro') {
      f.push(campo({ caminho: 'especificos.valorCarro', rotulo: 'Valor do carro' }));
      f.push(campo({ caminho: 'especificos.entradaPct', rotulo: 'Quanto juntar (100% = à vista)', formato: 'pct' }));
    } else if (m.tipo === 'aposentadoria') {
      f.push(campo({ caminho: 'valorAlvo', rotulo: 'Montante final', ajuda: 'ou deixe vazio e informe a renda abaixo' }));
      f.push(campo({ caminho: 'especificos.rendaDesejada', rotulo: 'Renda desejada por mês' }));
      f.push(campo({ caminho: 'especificos.taxaRetirada', rotulo: 'Taxa de retirada ao ano', formato: 'pct', ajuda: 'regra dos 4%' }));
    }
    if (!['rendaPassiva', 'reservaEmergencia', 'aposentadoria'].includes(m.tipo)) {
      const contrib = ['acumulo', 'carro', 'casa', 'viagemNacional'].includes(m.tipo);
      if (contrib) f.push(campo({ caminho: 'contribuicao', rotulo: 'Como você vai pagar', formato: 'select', opcoes: [['acumulo', 'Juntar (acúmulo)'], ['recorrente', 'Pagamento recorrente / amortização']] }));
      if (m.contribuicao === 'recorrente') {
        f.push(campo({ caminho: 'recorrente.parcela', rotulo: 'Valor da parcela' }));
        f.push(campo({ caminho: 'recorrente.totalParcelas', rotulo: 'Número de parcelas', formato: 'int' }));
        f.push(campo({ caminho: 'recorrente.inicio', rotulo: '1ª parcela', formato: 'mes' }));
      } else if (!['casa', 'carro'].includes(m.tipo)) {
        f.push(campo({ caminho: 'moeda', rotulo: 'Moeda', formato: 'select', opcoes: MOEDAS.map((x) => [x, x]) }));
        f.push(campo({ caminho: 'valorAlvo', rotulo: m.tipo === 'viagemInternacional' ? 'Dinheiro pra gastar lá (comida, compras, transporte)' : m.tipo === 'viagemNacional' ? 'Dinheiro pra gastar lá' : 'Valor alvo', moeda: simbolo(m.moeda), ajuda: (m.itens || []).length ? 'os sub-itens abaixo substituem esse valor' : (m.moeda !== 'BRL' && cotacao(m.moeda, estado.ctx.cambio) ? `1 ${m.moeda} = ${formatMoeda(cotacao(m.moeda, estado.ctx.cambio), 'BRL', { casas: 4 })}` : '') }));
      }
      if (m.contribuicao !== 'recorrente' || m.tipo !== 'acumulo') f.push(campo({ caminho: 'dataAlvo', rotulo: dataViagem ? 'Mês da viagem' : 'Até quando', formato: 'mes' }));
    }
    if (m.contribuicao !== 'recorrente') {
      if (m.tipo !== 'reservaEmergencia') f.push(campo({ caminho: 'valorInicial', rotulo: 'Já guardado fora dos investimentos', ajuda: 'conta corrente, dinheiro… (os investimentos você vincula no próximo passo)' }));
      f.push(campo({ caminho: 'aporteMensal', rotulo: m.tipo === 'reservaEmergencia' ? 'Aporte mensal pra recompor' : 'Seu aporte mensal hoje' }));
      f.push(campo({ caminho: 'rendimentoAnual', rotulo: 'Rendimento esperado ao ano', formato: 'pct', ajuda: m.tipo === 'aposentadoria' ? 'use o rendimento real (acima da inflação)' : '' }));
    }
    let extra = '';
    if (dataViagem) {
      extra += `<fieldset class="mt-grupo-campos"><legend>Conta mensal (passagens, hospedagem parceladas)</legend><div class="mt-campos">
${campo({ caminho: 'contaMensal.descricao', rotulo: 'Descrição', formato: 'texto' })}${campo({ caminho: 'contaMensal.valor', rotulo: 'Valor por mês' })}${campo({ caminho: 'contaMensal.meses', rotulo: 'Meses', formato: 'int' })}${campo({ caminho: 'contaMensal.inicio', rotulo: 'Começa em', formato: 'mes' })}</div></fieldset>`;
    }
    if (!['rendaPassiva', 'reservaEmergencia'].includes(m.tipo) && m.contribuicao !== 'recorrente') {
      extra += `<fieldset class="mt-grupo-campos"><legend>Sub-itens de custo <em>(opcional)</em></legend><div id="mtItensAssistente"></div></fieldset>`;
    }
    if (m.tipo === 'rendaPassiva') extra += `<div class="mt-campos">${campo({ caminho: 'exibirNaCarteira', rotulo: 'Mostrar essa meta na tela Carteiras', formato: 'bool', largura: 'largo' })}</div>`;
    extra += `<label class="mt-campo largo"><span>Notas</span><textarea data-campo="notas" data-formato="texto" rows="2">${escHtml(m.notas || '')}</textarea></label>`;
    return `<div class="mt-campos">${f.join('')}</div>${extra}`;
  }

  function passoVinculosHtml(m) {
    const ativos = estado.ctx.ativos || [];
    const vinc = m.vinculos || [];
    const temGrupo = (tipo, chave) => vinc.some((v) => v.tipo === tipo && (v.classe === chave || v.marca === chave));
    const outras = (estado.resposta.metas || []).filter((x) => x.id !== m.id);
    const usoOutras = new Map();
    outras.forEach((o) => resolverVinculos(o.vinculos, ativos).itens.forEach((v) => v.ativos.forEach((a) => {
      const lista = usoOutras.get(a.id) || []; lista.push(o.nome); usoOutras.set(a.id, lista);
    })));
    const res = resolverVinculos(vinc, ativos);
    const atalhos = [
      ...['emergencial', 'longo-prazo'].map((k) => ({ tipo: 'marca', chave: k, rotulo: ROTULO_MARCA[k], valor: ativos.filter((a) => a.classe === 'rf' && a.marca === k).reduce((s, a) => s + a.valorBRL, 0) })),
      ...['fiis', 'acoes', 'usa', 'rf'].map((k) => ({ tipo: 'classe', chave: k, rotulo: `Toda a classe ${ROTULO_CLASSE[k]}`, valor: ativos.filter((a) => a.classe === k).reduce((s, a) => s + a.valorBRL, 0) })),
    ].filter((x) => x.valor > 0);
    const busca = (estado.assistente.buscaAtivo || '').toLowerCase();
    const grupos = ['rf', 'fiis', 'acoes', 'usa'].map((cl) => [cl, ativos.filter((a) => a.classe === cl && (!busca || `${a.nome} ${a.descricao || ''} ${a.instituicao || ''}`.toLowerCase().includes(busca)))]).filter(([, l]) => l.length);
    const linhaAtivo = (a) => {
      const v = vinc.find((x) => x.tipo === 'ativo' && x.id === a.id);
      const coberto = vinc.some((x) => (x.tipo === 'classe' && x.classe === a.classe) || (x.tipo === 'marca' && a.classe === 'rf' && x.marca === a.marca));
      const outrasMetas = usoOutras.get(a.id);
      const sub = [a.descricao && a.descricao !== a.nome ? a.descricao : null, a.instituicao, a.classe === 'rf' ? ROTULO_MARCA[a.marca] : null].filter(Boolean).map(escHtml).join(' · ');
      return `<li class="${v || coberto ? 'marcado' : ''}">
  <label class="mt-v-check"><input type="checkbox" data-vinc-ativo="${escHtml(a.id)}" ${v || coberto ? 'checked' : ''} ${coberto ? 'disabled' : ''}><span class="mt-v-nome">${escHtml(a.nome)}<em>${sub}${coberto ? ' · já entra pela classe/marca' : ''}${outrasMetas ? ` · <span class="mt-ruim">também em ${outrasMetas.map(escHtml).join(', ')}</span>` : ''}</em></span></label>
  <b class="mono">${formatMoeda(a.valorBRL, 'BRL', { casas: 0 })}</b>
  ${v ? `<span class="mt-v-modo"><select data-vinc-modo="${escHtml(a.id)}" aria-label="Quanto"><option value="total" ${v.modo === 'total' ? 'selected' : ''}>Tudo</option><option value="fracao" ${v.modo === 'fracao' ? 'selected' : ''}>%</option><option value="valor" ${v.modo === 'valor' ? 'selected' : ''}>R$</option></select>${v.modo !== 'total' ? `<input data-vinc-qtd="${escHtml(a.id)}" inputmode="decimal" value="${v.modo === 'fracao' ? numParaCampo((v.fracao || 0) * 100) : numParaCampo(v.valor)}" aria-label="${v.modo === 'fracao' ? 'Percentual' : 'Valor'}">` : ''}</span>` : '<span></span>'}
</li>`;
    };
    return `<p class="mt-dialogo-dica">Quais investimentos são dessa meta? O progresso anda sozinho com o valor de hoje deles. Dá pra dedicar só uma parte (% ou valor fixo).</p>
<div class="mt-atalhos">${atalhos.map((x) => `<button type="button" class="mt-chip ${temGrupo(x.tipo, x.chave) ? 'active' : ''}" data-vinc-grupo="${x.tipo}:${x.chave}" aria-pressed="${temGrupo(x.tipo, x.chave)}">${escHtml(x.rotulo)} <span class="mono">${formatMoeda(x.valor, 'BRL', { casas: 0 })}</span></button>`).join('')}</div>
<input class="mt-busca" type="search" placeholder="Buscar ativo, instituição…" data-vinc-busca value="${escHtml(estado.assistente.buscaAtivo || '')}" aria-label="Buscar ativo">
<div class="mt-v-lista">${grupos.map(([cl, lista]) => `<h4 class="mt-grupo">${ROTULO_CLASSE[cl]}</h4><ul>${lista.map(linhaAtivo).join('')}</ul>`).join('') || '<p class="hint">Nenhum ativo encontrado.</p>'}</div>
<p class="mt-v-total">Vinculado: <b class="mono">${formatMoeda(res.total)}</b></p>`;
  }

  function passoRevisarHtml(m) {
    const c = calcDe(m);
    const ap = aparenciaMeta(m);
    const linhas = [
      ['Tipo', ap.rotulo],
      c.renda ? ['Renda hoje / meta', `${formatMoeda(c.renda.atual)} / ${formatMoeda(c.renda.alvo)} por mês`] : null,
      ['Alvo', c.alvoBRL != null ? `${formatMoeda(c.alvoBRL)}${c.moeda !== 'BRL' && c.alvoMoeda != null ? ` (${formatMoeda(c.alvoMoeda, c.moeda)})` : ''}` : '—'],
      c.conta ? ['Conta mensal', `${formatMoeda(c.conta.valor)} x ${c.conta.total} meses`] : null,
      ['Já tem', `${formatMoeda(c.atualBRL)} (${pct(c.percentual)})`],
      m.tipo !== 'reservaEmergencia' ? ['Prazo', c.dataAlvo ? `${rotuloMes(c.dataAlvo)} · ${rotuloDuracao(c.mesesRestantes)}` : 'sem data'] : null,
      m.tipo !== 'reservaEmergencia' ? ['Aporte necessário', c.aporteNecessarioTotal != null ? `${formatMoeda(c.aporteNecessarioTotal)}/mês` : '—'] : null,
      ['Seu aporte', c.aporteAtual ? `${formatMoeda(c.aporteAtual)}/mês` : '—'],
      ['Investimentos vinculados', `${c.vinculos.length} · ${formatMoeda(c.valorVinculado)}`],
    ].filter(Boolean);
    return `<div class="mt-revisar" style="--mt-cor:var(--${ap.cor});--mt-cor-soft:var(--${ap.cor}-soft)">
  <div class="mt-revisar-cab">${seloMetaHtml(m, { tamanho: 42 })}<div><strong>${escHtml(m.nome || '(sem nome)')}</strong>${statusPillHtml(c.status)}</div></div>
  <dl>${linhas.map(([k, v]) => `<div><dt>${k}</dt><dd class="mono">${escHtml(v)}</dd></div>`).join('')}</dl>
  ${c.avisos.length ? `<p class="mt-alerta">${c.avisos.map(escHtml).join(' · ')}</p>` : ''}
  ${!m.nome ? '<p class="mt-alerta">Dê um nome pra meta (passo 2).</p>' : ''}
</div>`;
  }

  function lerCampo(inp) {
    const m = estado.assistente.meta;
    const f = inp.dataset.formato;
    let v;
    if (f === 'texto' || f === 'select' || f === 'mes') v = inp.value || null;
    else if (f === 'bool') v = inp.checked;
    else if (f === 'pct') { const n = parseNumeroBR(inp.value); v = n == null ? null : n / 100; }
    else if (f === 'int') { const n = parseNumeroBR(inp.value); v = n == null ? null : Math.round(n); }
    else v = parseNumeroBR(inp.value);
    if (inp.dataset.campo === 'nome' || inp.dataset.campo === 'notas') v = inp.value;
    gravarCaminho(m, inp.dataset.campo, v);
  }

  function validarPasso(a) {
    const m = a.meta;
    if (a.passo === 2 && !String(m.nome || '').trim()) return 'Dê um nome pra meta.';
    return null;
  }

  // eventos do assistente (delegação no fundo do diálogo)
  el.dialogo.addEventListener('click', async (ev) => {
    const a = estado.assistente;
    if (!a) return;
    if (ev.target === el.dialogo || ev.target.closest('[data-fechar]')) { fecharAssistente(); return; }
    const tipoBtn = ev.target.closest('[data-tipo]');
    if (tipoBtn) {
      const tipo = tipoBtn.dataset.tipo;
      const categoria = tipoBtn.dataset.categoria;
      const mudou = a.meta.tipo !== tipo || (tipo === 'acumulo' && a.meta.categoria !== categoria);
      if (mudou && !a.editando) a.meta = metaPadrao(tipo, { referencias: estado.ctx.referencias, hoje: estado.ctx.hoje, categoria });
      else if (mudou) { a.meta.tipo = tipo; a.meta.categoria = tipo === 'acumulo' ? categoria : null; }
      a.passo = 2;
      desenharAssistente();
      return;
    }
    const passoBtn = ev.target.closest('[data-passo]');
    if (passoBtn && !passoBtn.disabled) { a.passo = Number(passoBtn.dataset.passo); desenharAssistente(); return; }
    if (ev.target.closest('[data-anterior]')) { a.passo = Math.max(1, a.passo - 1); desenharAssistente(); return; }
    if (ev.target.closest('[data-proximo]')) {
      const erro = validarPasso(a);
      if (erro) { const p = el.dialogo.querySelector('#mtPrevia'); if (p) p.innerHTML = `<span class="mt-ruim">${erro}</span>`; return; }
      a.passo = Math.min(4, a.passo + 1); desenharAssistente(); return;
    }
    const grupo = ev.target.closest('[data-vinc-grupo]');
    if (grupo) {
      const [tipo, chave] = grupo.dataset.vincGrupo.split(':');
      const campoChave = tipo === 'classe' ? 'classe' : 'marca';
      const tem = a.meta.vinculos.some((v) => v.tipo === tipo && v[campoChave] === chave);
      if (tem) a.meta.vinculos = a.meta.vinculos.filter((v) => !(v.tipo === tipo && v[campoChave] === chave));
      else a.meta.vinculos.push({ tipo, [campoChave]: chave, modo: 'total' });
      desenharAssistente();
      return;
    }
    const salvarBtn = ev.target.closest('[data-salvar]');
    if (salvarBtn) {
      if (!String(a.meta.nome || '').trim()) { a.passo = 2; desenharAssistente(); return; }
      salvarBtn.disabled = true;
      salvarBtn.textContent = 'Salvando…';
      const meta = clonar(a.meta);
      if (meta.contribuicao !== 'recorrente') meta.recorrente = null;
      if (meta.contaMensal && !(meta.contaMensal.valor > 0)) meta.contaMensal = null;
      const salva = await salvar(meta);
      if (salva) fecharAssistente(); else { salvarBtn.disabled = false; salvarBtn.textContent = 'Tentar de novo'; }
    }
  });
  el.dialogo.addEventListener('input', (ev) => {
    const a = estado.assistente;
    if (!a) return;
    const t = ev.target;
    if (t.dataset.campo && !['select', 'bool', 'mes'].includes(t.dataset.formato)) { lerCampo(t); atualizarPrevia(); }
    if (t.dataset.vincQtd) {
      const v = a.meta.vinculos.find((x) => x.tipo === 'ativo' && x.id === t.dataset.vincQtd);
      const n = parseNumeroBR(t.value);
      if (v && v.modo === 'fracao') v.fracao = n == null ? 0 : Math.max(0, Math.min(1, n / 100));
      if (v && v.modo === 'valor') v.valor = n == null ? 0 : Math.max(0, n);
      const tot = el.dialogo.querySelector('.mt-v-total b');
      if (tot) tot.textContent = formatMoeda(resolverVinculos(a.meta.vinculos, estado.ctx.ativos).total);
    }
    if (t.dataset.vincBusca != null) {
      a.buscaAtivo = t.value;
      const lista = el.dialogo.querySelector('.mt-v-lista');
      const tmp = doc.createElement('div');
      tmp.innerHTML = passoVinculosHtml(a.meta);
      const nova = tmp.querySelector('.mt-v-lista');
      if (lista && nova) lista.replaceWith(nova);
    }
  });
  el.dialogo.addEventListener('change', (ev) => {
    const a = estado.assistente;
    if (!a) return;
    const t = ev.target;
    if (t.dataset.campo && ['select', 'bool', 'mes'].includes(t.dataset.formato)) {
      lerCampo(t);
      if (['contribuicao', 'moeda', 'categoria', 'especificos.usarDespesasPlanilha'].includes(t.dataset.campo)) {
        if (t.dataset.campo === 'contribuicao' && t.value === 'recorrente' && !a.meta.recorrente) a.meta.recorrente = { parcela: null, totalParcelas: 12, inicio: mesDe(estado.ctx.hoje) };
        if (t.dataset.campo === 'moeda') (a.meta.itens || []).forEach((it) => { if (!it.valor) it.moeda = t.value; });
        desenharAssistente();
      } else atualizarPrevia();
    }
    if (t.dataset.vincAtivo) {
      const id = t.dataset.vincAtivo;
      if (t.checked) {
        const ativo = (estado.ctx.ativos || []).find((x) => x.id === id);
        a.meta.vinculos.push({ tipo: 'ativo', id, nome: ativo ? ativo.nome : '', modo: 'total' });
      } else a.meta.vinculos = a.meta.vinculos.filter((v) => !(v.tipo === 'ativo' && v.id === id));
      desenharAssistente();
    }
    if (t.dataset.vincModo) {
      const v = a.meta.vinculos.find((x) => x.tipo === 'ativo' && x.id === t.dataset.vincModo);
      if (v) {
        v.modo = t.value;
        if (v.modo === 'fracao' && v.fracao == null) v.fracao = 0.5;
        if (v.modo === 'valor' && v.valor == null) { const at = (estado.ctx.ativos || []).find((x) => x.id === v.id); v.valor = at ? Math.round(at.valorBRL / 2) : 0; }
      }
      desenharAssistente();
    }
  });
  doc.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && estado.assistente) fecharAssistente(); });

  // eventos da tela
  el.tela.addEventListener('click', async (ev) => {
    const abrir = ev.target.closest('[data-abrir]');
    if (abrir) { irPara(abrir.dataset.abrir); return; }
    if (ev.target.closest('[data-voltar]')) { irPara(null); return; }
    const fs = ev.target.closest('[data-filtro-status]');
    if (fs) { estado.filtroStatus = fs.dataset.filtroStatus; desenhar(); return; }
    const ft = ev.target.closest('[data-filtro-tipo]');
    if (ft) { estado.filtroTipo = ft.dataset.filtroTipo; desenhar(); return; }
    if (ev.target.closest('[data-nova]')) { abrirAssistente(metaPadrao('acumulo', { hoje: estado.ctx.hoje }), 1); return; }
    const sug = ev.target.closest('[data-sugestao]');
    if (sug) {
      const s = (estado.sugestoes || [])[Number(sug.dataset.sugestao)];
      if (!s) return;
      sug.disabled = true;
      sug.classList.add('salvando');
      await salvar(clonar(s.meta));
      return;
    }
    const meta = estado.detalheId ? acharMeta(estado.detalheId) : null;
    if (!meta) return;
    if (ev.target.closest('[data-editar]')) { abrirAssistente(meta, 2, { editando: true }); return; }
    if (ev.target.closest('[data-editar-vinculos]')) { abrirAssistente(meta, 3, { editando: true }); return; }
    if (ev.target.closest('[data-arquivar]')) { await arquivar(meta); return; }
    if (ev.target.closest('[data-restaurar]')) { await arquivar(meta, true); }
  });
  if (el.nova) el.nova.addEventListener('click', () => { if (estado.ctx) abrirAssistente(metaPadrao('acumulo', { hoje: estado.ctx.hoje }), 1); });

  if (win) {
    win.addEventListener('popstate', () => { const id = idDoHash(); if (id !== estado.detalheId) { estado.detalheId = id; desenhar(); } });
    win.addEventListener('hashchange', () => { const id = idDoHash(); if (id !== estado.detalheId) { estado.detalheId = id; desenhar(); } });
    let timerResize = null;
    win.addEventListener('resize', () => {
      if (!estado.detalheId) return;
      clearTimeout(timerResize);
      timerResize = setTimeout(() => { const m = acharMeta(estado.detalheId); if (m) desenharGrafico(calcDe(m)); }, 150);
    });
  }
  estado.detalheId = idDoHash();

  async function carregarERedesenhar() {
    const resposta = await getMetasImpl(token);
    if (resposta && resposta.ok) gravarCacheDados('metas', resposta);
    desenharResposta(resposta);
  }

  if (usarCache) {
    const emCache = await lerCacheDados('metas');
    if (emCache) { try { desenharResposta(emCache.dados); } catch (erro) { console.error('cache das metas não desenhou', erro); } }
  }
  await mountRefreshControl(doc, el.refresh, carregarERedesenhar).atualizar();
  return { estado, desenhar, abrirAssistente, irPara };
}

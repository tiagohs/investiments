/**
 * organizacao-gastos.js - 02/10/2026: seção "Gastos" da Organização
 * Financeira (aba "Gastos e Despesas").
 *
 * Tiago: "área rica de gastos a partir dos arquivos no meu Drive
 * (Documentos/Transações/Cartão de Crédito e Documentos/Transações/
 * Extratos)... novos gadgets/gráficos de quanto eu gastei e gasto em média".
 *
 * USO (quem integra a aba):
 *
 *   import { montarSecaoGastos } from './organizacao-gastos.js';
 *   const gastos = montarSecaoGastos(raiz, { token, despesas, hoje });
 *   // raiz:     elemento onde a seção é desenhada (a seção cuida do próprio conteúdo)
 *   // token:    sessão (usa as funções do api-client) - OU api: { getGastos(),
 *   //           getArquivosGastos(), getArquivoGastos(id), salvarImportacaoGastos(arquivo, lancs),
 *   //           salvarRegraGastos(padrao, categoria), excluirArquivoGastos(id) } (sem token)
 *   // despesas: a resposta do getDespesas que a aba já tem (ou o bloco .despesas) -
 *   //           opcional; liga o card "Essencial x real". Atualize com gastos.atualizarDespesas(r).
 *   // hoje:     Date ou 'aaaa-mm-dd' (padrão: agora)
 *   // retorno:  { pronto: Promise, recarregar(), atualizarDespesas(d), importarNovos(), lerArquivos(files), dados, resumo }
 *
 * Ao abrir: lê os lançamentos da planilha (Gastos.gs) e, em paralelo, lista
 * as pastas do Drive - se houver arquivo novo ou alterado, oferece "Importar
 * agora" (1 clique). Cada PDF é aberto AQUI (pdf.js); se tiver senha (fatura
 * OuroCard), a seção pede a senha na hora e oferece "lembrar neste navegador"
 * (localStorage). A senha nunca vai pra planilha nem pro Apps Script. Só os
 * lançamentos limpos (gastos-import.js) são gravados, arquivo por arquivo.
 */
import {
  getGastos, getArquivosGastos, getArquivoGastos, salvarImportacaoGastos, salvarRegraGastos, excluirArquivoGastos,
} from '../api-client.js';
import { formatBRL, formatNumeroBR } from '../format.js';
import { ligarFiltroPeriodo } from '../periodo-personalizado.js'; // 03/10/2026: "Escolher período"
import { carregarPdfJs } from './holerite.js';
import { juntarAcentos } from './patrimonio-import.js';
import { lerDocumentoGasto, lerCsvGastos, lerOfxGastos, mesesDoDocumento } from './gastos-import.js';
import {
  CATEGORIAS_GASTO, NOME_CATEGORIA, NOME_FONTE, PERIODOS, resumoGastos, prepararRegras, categorizar, chavesDedup, chaveDescricao, somarMeses, mesDe,
} from './gastos-calc.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const brl = (v) => (num(v) ? formatBRL(v) : '—');
const brl0 = (v) => (num(v) ? `R$ ${formatNumeroBR(Math.round(v), 0)}` : '—');
const mil = (v) => (Math.abs(v) >= 1000 ? `${formatNumeroBR(v / 1000, Math.abs(v) >= 10000 ? 0 : 1)} mil` : formatNumeroBR(v, 0));
const MESES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesAno = (m) => { const [a, mm] = String(m || '').split('-'); return a && mm ? `${MESES_CURTO[Number(mm) - 1]}/${a.slice(2)}` : ''; };
const mesAnoLongo = (m) => { const [a, mm] = String(m || '').split('-'); return a && mm ? `${MESES_CURTO[Number(mm) - 1]}/${a}` : ''; };
/** No período personalizado, só os lançamentos dentro dos dias escolhidos. */
function diaNoPeriodo(r) {
  const dias = r && r.intervalo && r.intervalo.dias;
  return dias ? (l) => l.data >= dias.inicio && l.data <= dias.fim : () => true;
}
function isoHoje(hoje) {
  const d = hoje instanceof Date ? hoje : new Date(hoje || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : ''; };
const pctVar = (a, b) => (num(a) && num(b) && b > 0 ? (a - b) / b : null);
const pillVar = (v, rotulo) => {
  if (!num(v)) return '';
  const cls = v > 0.02 ? 'bad' : v < -0.02 ? 'good' : '';
  return `<span class="gs-pill ${cls}" title="${esc(rotulo)}">${v > 0 ? '▲' : v < 0 ? '▼' : '='} ${formatNumeroBR(Math.abs(v) * 100, 0)}% ${esc(rotulo)}</span>`;
};

const CHAVE_PERIODO = 'gastos.periodo';
const CHAVE_SENHA = 'gastos.senhaPdf';
function lerLocal(storage, k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }
function gravarLocal(storage, k, v) { try { if (storage) { if (v == null) storage.removeItem(k); else storage.setItem(k, v); } } catch (e) { /* ok */ } }

function base64ParaBytes(b64) {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * PDF -> linhas (mesmo agrupamento de holerite.js/extrairLinhasPdf), com
 * senha. O pdf.js transfere o buffer pro worker, então cada tentativa recebe
 * uma CÓPIA (bytes.slice()) - senão a 2ª tentativa (com a senha) quebra.
 */
export async function extrairLinhasPdfComSenha(pdfjsLib, bytes, senha) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), password: senha || undefined }).promise;
  const linhas = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    const grupos = [];
    items.filter((it) => String(it.str || '').trim()).forEach((it) => {
      const x = it.transform[4]; const y = it.transform[5];
      let g = grupos.find((gr) => Math.abs(gr.y - y) <= 2.5);
      if (!g) { g = { y, itens: [] }; grupos.push(g); }
      g.itens.push({ x, s: String(it.str).trim() });
    });
    grupos.sort((a, b) => b.y - a.y).forEach((g) => { linhas.push(g.itens.sort((a, b) => a.x - b.x).map((i) => i.s).join('  ')); });
  }
  try { await pdf.destroy(); } catch (e) { /* ok */ }
  return linhas;
}
const ehErroSenha = (e) => !!e && (e.name === 'PasswordException' || /password/i.test(String(e.message || '')));

/** Lançamentos da planilha (arrays) -> objetos. */
function objetosLancamentos(r) {
  const cols = r.colunas || ['mes', 'data', 'origem', 'fonte', 'descricao', 'categoria', 'valor', 'tipo', 'parcela', 'arquivo'];
  return (r.lancamentos || []).map((l) => (Array.isArray(l) ? Object.fromEntries(cols.map((c, i) => [c, l[i]])) : l));
}

// ---------------------------------------------------------------------------
// Gráficos (SVG puro)
// ---------------------------------------------------------------------------

/** Evolução mensal empilhada: cartão (embaixo) + conta, linha tracejada da média. */
export function graficoEvolucao(porMes, { largura = 720, altura = 230, media = null, destaque = null } = {}) {
  const n = porMes.length;
  if (!n) return { svg: '', dicas: [] };
  const L = Math.max(280, largura); const H = altura; const m = { t: 14, r: 10, b: 26, l: 44 };
  const w = L - m.l - m.r; const h = H - m.t - m.b;
  const max = Math.max(1, ...porMes.map((p) => Math.max(0, p.cartao) + Math.max(0, p.conta)), num(media) ? media : 0);
  const passo = (() => { const bruto = max / 4; const ord = 10 ** Math.floor(Math.log10(bruto)); return [1, 2, 2.5, 5, 10].map((k) => k * ord).find((k) => k >= bruto); })();
  const topo = passo * Math.ceil(max / passo);
  const y = (v) => m.t + h - (v / topo) * h;
  const bw = w / n; const barra = Math.max(3, Math.min(34, bw * 0.68));
  let s = `<svg viewBox="0 0 ${L} ${H}" width="100%" height="${H}" role="img" aria-label="Gasto por mês, cartão e conta" class="gs-svg">`;
  for (let v = 0; v <= topo + 0.01; v += passo) s += `<line x1="${m.l}" x2="${L - m.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="gs-grade"/><text x="${m.l - 6}" y="${(y(v) + 3.5).toFixed(1)}" class="gs-eixo" text-anchor="end">${esc(mil(v))}</text>`;
  const cadaRot = Math.ceil(n / Math.max(1, Math.floor(w / 46)));
  const dicas = [];
  porMes.forEach((p, i) => {
    const cx = m.l + bw * i + bw / 2; const x = cx - barra / 2;
    const c = Math.max(0, p.cartao); const k = Math.max(0, p.conta);
    const yc = y(c); const yk = y(c + k);
    const op = destaque && p.mes !== destaque ? ' gs-apagado' : '';
    if (c > 0) s += `<path d="M${x},${y(0)} V${(yc + (k > 0 ? 1 : 4)).toFixed(1)} ${k > 0 ? `H${x + barra}` : `q0,-4 4,-4 H${x + barra - 4} q4,0 4,4`} V${y(0)} Z" class="gs-cartao${op}"/>`;
    if (k > 0) s += `<path d="M${x},${(yc - 1).toFixed(1)} V${(yk + 4).toFixed(1)} q0,-4 4,-4 H${x + barra - 4} q4,0 4,4 V${(yc - 1).toFixed(1)} Z" class="gs-conta${op}"/>`;
    if (i % cadaRot === 0 || i === n - 1) s += `<text x="${cx.toFixed(1)}" y="${H - 8}" class="gs-eixo" text-anchor="middle">${esc(mesAno(p.mes))}</text>`;
    s += `<rect x="${(m.l + bw * i).toFixed(1)}" y="${m.t}" width="${bw.toFixed(1)}" height="${h}" class="gs-hit" data-i="${i}" tabindex="0" aria-label="${esc(mesAnoLongo(p.mes))}: ${esc(brl(p.total))}"/>`;
    dicas.push(`<span class="gs-tt-t">${esc(mesAnoLongo(p.mes))}</span><span class="gs-tt-l"><i class="gs-q gs-q-cartao"></i>Cartão<b>${esc(brl(p.cartao))}</b></span><span class="gs-tt-l"><i class="gs-q gs-q-conta"></i>Conta<b>${esc(brl(p.conta))}</b></span><span class="gs-tt-l gs-tt-total">Total<b>${esc(brl(p.total))}</b></span>`);
  });
  if (num(media) && media > 0) s += `<line x1="${m.l}" x2="${L - m.r}" y1="${y(media).toFixed(1)}" y2="${y(media).toFixed(1)}" class="gs-media"/><text x="${m.l + 4}" y="${(y(media) - 5).toFixed(1)}" class="gs-eixo gs-media-t" text-anchor="start">média ${esc(brl0(media))}</text>`;
  s += '</svg>';
  return { svg: s, dicas };
}

/** Compromisso futuro das parcelas, mês a mês. */
export function graficoParcelas(porMes, { largura = 520, altura = 150 } = {}) {
  const n = porMes.length;
  if (!n) return { svg: '', dicas: [] };
  const L = Math.max(260, largura); const H = altura; const m = { t: 18, r: 6, b: 22, l: 6 };
  const w = L - m.l - m.r; const h = H - m.t - m.b;
  const max = Math.max(1, ...porMes.map((p) => p.total));
  const bw = w / n; const barra = Math.max(3, Math.min(30, bw * 0.66));
  let s = `<svg viewBox="0 0 ${L} ${H}" width="100%" height="${H}" role="img" aria-label="Parcelas a pagar nos próximos meses" class="gs-svg">`;
  const dicas = [];
  porMes.forEach((p, i) => {
    const cx = m.l + bw * i + bw / 2; const x = cx - barra / 2;
    const yy = m.t + h - (p.total / max) * h;
    if (p.total > 0) s += `<path d="M${x},${m.t + h} V${(yy + 4).toFixed(1)} q0,-4 4,-4 H${x + barra - 4} q4,0 4,4 V${m.t + h} Z" class="gs-parcela"/>`;
    if (i === 0 || p.total === max) s += `<text x="${cx.toFixed(1)}" y="${(yy - 5).toFixed(1)}" class="gs-eixo" text-anchor="middle">${esc(mil(p.total))}</text>`;
    if (i % Math.ceil(n / Math.max(1, Math.floor(w / 40))) === 0) s += `<text x="${cx.toFixed(1)}" y="${H - 6}" class="gs-eixo" text-anchor="middle">${esc(mesAno(p.mes))}</text>`;
    s += `<rect x="${(m.l + bw * i).toFixed(1)}" y="${m.t}" width="${bw.toFixed(1)}" height="${h}" class="gs-hit" data-i="${i}" tabindex="0" aria-label="${esc(mesAnoLongo(p.mes))}: ${esc(brl(p.total))}"/>`;
    dicas.push(`<span class="gs-tt-t">${esc(mesAnoLongo(p.mes))}</span><span class="gs-tt-l">Parcelas<b>${esc(brl(p.total))}</b></span>`);
  });
  s += `<line x1="${m.l}" x2="${L - m.r}" y1="${m.t + h}" y2="${m.t + h}" class="gs-grade"/></svg>`;
  return { svg: s, dicas };
}

// ---------------------------------------------------------------------------
// Blocos de HTML
// ---------------------------------------------------------------------------

function rotuloPeriodo(r) {
  if (r.intervalo && r.intervalo.dias) {
    const { inicio, fim } = r.intervalo.dias;
    const d = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    return inicio === fim ? `em ${d(inicio)}` : `de ${d(inicio)} a ${d(fim)}`;
  }
  if (r.periodo === 'mes') return `em ${mesAnoLongo(r.mesRef)}`;
  if (r.periodo === 'ano') return `em ${r.mesRef.slice(0, 4)} (até ${mesAno(r.mesRef)})`;
  if (r.periodo === 'tudo') return `desde ${mesAno(r.intervalo.inicio)}`;
  return `de ${mesAno(r.intervalo.inicio)} a ${mesAno(r.intervalo.fim)}`;
}

export function htmlTabsPeriodo(periodo) {
  const tabs = PERIODOS.map((p) => `<button type="button" class="filter-tab${p.id === periodo ? ' active' : ''}" data-periodo="${p.id}" aria-pressed="${p.id === periodo}">${esc(p.nome)}</button>`).join('');
  return `<div class="filter-tabs gs-periodos" role="group" aria-label="Período">${tabs}</div>`;
}

/** Navegação de mês (‹ set/2026 ›) - não vale no período personalizado (o calendário já escolhe as datas). */
export function htmlNavMes(r) {
  return r && !r.vazio && !(r.intervalo && r.intervalo.dias) ? `<div class="gs-nav-mes" role="group" aria-label="Mês de referência">
      <button type="button" class="gs-nav-b" data-acao="mes-ant" aria-label="Mês anterior" ${r.mesRef <= r.meses[0] ? 'disabled' : ''}>‹</button>
      <span class="gs-nav-t">${esc(mesAnoLongo(r.mesRef))}</span>
      <button type="button" class="gs-nav-b" data-acao="mes-prox" aria-label="Próximo mês" ${r.mesRef >= r.ultimo ? 'disabled' : ''}>›</button></div>` : '';
}

export function htmlFiltros(r, periodo) {
  return `${htmlTabsPeriodo(periodo)}${htmlNavMes(r)}`;
}

/** Linha sob o total: média por mês (presets) ou lançamentos em N dias (período personalizado). */
function subHero(r) {
  const n = r.porMes.reduce((s, m) => s + m.n, 0);
  const dias = r.intervalo && r.intervalo.dias;
  if (dias) {
    const nd = Math.round((Date.parse(`${dias.fim}T00:00:00Z`) - Date.parse(`${dias.inicio}T00:00:00Z`)) / 86400000) + 1;
    return `${n} lançamento${n === 1 ? '' : 's'} em ${nd} dia${nd === 1 ? '' : 's'}${nd >= 7 ? ` · ritmo de <b>${esc(brl0(r.total / nd * 30.44))}/mês</b>` : ''}`;
  }
  return r.mesesValidos > 1 ? `média de <b>${esc(brl0(r.media))}/mês</b> em ${r.mesesValidos} meses` : `${n} lançamentos`;
}

export function htmlHero(r) {
  if (r.vazio) {
    return `<div class="gs-hero-vazio"><h3>Seus gastos aparecem aqui</h3>
      <p>Importe as faturas do cartão e os extratos da conta - das pastas <b>Documentos/Transações</b> do seu Drive ou do computador. Os PDFs são lidos no seu navegador; só os lançamentos (data, descrição, valor) vão pra planilha.</p>
      <div class="gs-acoes"><button type="button" class="btn btn-primary" data-acao="drive">Procurar no Drive</button><button type="button" class="btn" data-acao="arquivo">Importar do computador</button></div></div>`;
  }
  const d = r.doMes;
  const v6 = pctVar(d.total, r.media6); const v12 = pctVar(d.total, r.media12);
  const fr = r.total > 0 ? r.cartao / r.total : 0;
  return `<div class="gs-hero-num">
      <span class="eyebrow">Gasto ${esc(rotuloPeriodo(r))}</span>
      <span class="gs-grande">${esc(brl0(r.total))}</span>
      <span class="gs-hero-sub">${subHero(r)}</span>
      <div class="gs-split" aria-label="Cartão e conta"><span class="gs-split-c" style="width:${(fr * 100).toFixed(1)}%"></span><span class="gs-split-k" style="width:${((1 - fr) * 100).toFixed(1)}%"></span></div>
      <span class="gs-hero-leg"><span><i class="gs-q gs-q-cartao"></i>Cartão <b>${esc(brl0(r.cartao))}</b></span><span><i class="gs-q gs-q-conta"></i>Conta <b>${esc(brl0(r.conta))}</b></span></span>
    </div>
    <div class="gs-tiles">
      <div class="gs-tile"><span class="gs-rot">${esc(mesAnoLongo(r.mesRef))}</span><b class="gs-num">${esc(brl0(d.total))}</b><span class="gs-pills">${pillVar(v6, 'vs média 6m')}${pillVar(v12, 'vs média 12m')}</span></div>
      <div class="gs-tile"><span class="gs-rot">Média 6 meses</span><b class="gs-num">${esc(brl0(r.media6))}</b><span class="gs-fraco">antes de ${esc(mesAno(r.mesRef))}</span></div>
      <div class="gs-tile"><span class="gs-rot">Média 12 meses</span><b class="gs-num">${esc(brl0(r.media12))}</b><span class="gs-fraco">${num(r.media12) ? `${esc(brl0(r.media12 * 12))} por ano` : 'precisa de mais meses'}</span></div>
      <div class="gs-tile"><span class="gs-rot">Recorrentes ativos</span><b class="gs-num">${esc(brl0(r.recorrentes.filter((x) => x.ativa).reduce((s, x) => s + x.valor, 0)))}</b><span class="gs-fraco">${r.recorrentes.filter((x) => x.ativa).length} por mês</span></div>
    </div>`;
}

export function htmlCategorias(r, aberta = null) {
  if (!r.categorias.length) return '<p class="gs-fraco">Nenhum gasto no período.</p>';
  const max = Math.max(...r.categorias.map((c) => c.total));
  return `<ul class="gs-cats">${r.categorias.map((c) => `<li><button type="button" class="gs-cat${aberta === c.id ? ' on' : ''}" data-cat="${esc(c.id)}" aria-expanded="${aberta === c.id}">
      <span class="gs-cat-n">${esc(c.nome)}</span><span class="gs-cat-v gs-num">${esc(brl0(c.total))}<small>${formatNumeroBR(c.fracao * 100, 0)}%</small></span>
      <span class="gs-cat-b"><i style="width:${Math.max(1, (c.total / max) * 100).toFixed(1)}%"></i></span>
      ${r.mesesValidos > 1 ? `<span class="gs-cat-m">${esc(brl0(c.total / r.mesesValidos))}/mês</span>` : ''}</button></li>`).join('')}</ul>`;
}

function seletorCategoria(atual, attrs) {
  return `<select class="gs-sel" ${attrs} aria-label="Categoria">${CATEGORIAS_GASTO.map((c) => `<option value="${c.id}"${c.id === atual ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>`;
}

function linhaLancamento(l, i, { comSeletor = true } = {}) {
  return `<tr><td class="gs-num gs-fraco">${esc(dataBR(l.data))}</td>
    <td><span class="gs-desc">${esc(l.descricao)}</span>${l.parcela ? ` <span class="gs-tag">${esc(l.parcela)}</span>` : ''}<span class="gs-fonte">${esc(NOME_FONTE[l.fonte] || l.fonte)}${l.origem === 'cartao' && l.mes !== String(l.data).slice(0, 7) ? ` · fatura ${esc(mesAno(l.mes))}` : ''}</span></td>
    <td>${comSeletor ? seletorCategoria(l.categoria, `data-recat="${i}"`) : esc(NOME_CATEGORIA[l.categoria] || l.categoria)}</td>
    <td class="gs-num gs-valor${l.valor < 0 ? ' good' : ''}">${esc(brl(l.valor))}</td></tr>`;
}

export function htmlMaiores(r) {
  if (!r.maiores.length) return '<p class="gs-fraco">Nada no período.</p>';
  return `<ol class="gs-maiores">${r.maiores.map((l) => `<li><span class="gs-m-d"><span class="gs-desc">${esc(l.descricao)}</span><span class="gs-fonte">${esc(dataBR(l.data))} · ${esc(NOME_CATEGORIA[l.categoria] || '')}${l.parcela ? ` · parcela ${esc(l.parcela)}` : ''}</span></span><b class="gs-num">${esc(brl(l.valor))}</b></li>`).join('')}</ol>`;
}

export function htmlRecorrentes(r) {
  const ativos = r.recorrentes.filter((x) => x.ativa);
  const parados = r.recorrentes.filter((x) => !x.ativa && x.categoria === 'assinaturas').slice(0, 5);
  if (!r.recorrentes.length) return '<p class="gs-fraco">Ainda não achei gastos que se repetem todo mês - aparecem com 3 meses ou mais de documentos.</p>';
  const tot = ativos.reduce((s, x) => s + x.valor, 0);
  const item = (x) => `<li class="${x.ativa ? '' : 'gs-parado'}"><span class="gs-m-d"><span class="gs-desc">${esc(x.descricao.replace(/^Pix enviado · /, 'Pix · '))}</span><span class="gs-fonte">${esc(NOME_CATEGORIA[x.categoria] || '')} · ${x.meses} meses${x.ativa ? '' : ` · último em ${esc(mesAno(x.ultimo))}`}</span></span><b class="gs-num">${esc(brl(x.valor))}</b></li>`;
  return `<p class="gs-resumo-linha"><b class="gs-num">${esc(brl(tot))}</b>/mês em ${ativos.length} gastos fixos · <b class="gs-num">${esc(brl0(tot * 12))}</b> por ano</p>
    <ul class="gs-maiores gs-rec">${ativos.map(item).join('')}</ul>
    ${parados.length ? `<p class="gs-sub-t">Assinaturas que pararam</p><ul class="gs-maiores gs-rec">${parados.map(item).join('')}</ul>` : ''}`;
}

export function htmlParcelas(r) {
  const p = r.parcelas;
  if (!p.compras.length) return '<p class="gs-fraco">Nenhuma compra parcelada em aberto nas últimas faturas.</p>';
  return `<p class="gs-resumo-linha"><b class="gs-num">${esc(brl(p.total))}</b> ainda a pagar em ${p.compras.length} compra${p.compras.length > 1 ? 's' : ''} · próxima fatura <b class="gs-num">${esc(brl(p.porMes[0] ? p.porMes[0].total : 0))}</b></p>
    <div class="gs-grafico" data-grafico="parc" id="gsGParc"></div>
    <ul class="gs-maiores">${p.compras.slice(0, 8).map((c) => `<li><span class="gs-m-d"><span class="gs-desc">${esc(c.descricao)}</span><span class="gs-fonte">${esc(NOME_FONTE[c.fonte] || c.fonte)} · ${c.n}/${c.de} · termina ${esc(mesAno(c.fim))}</span></span><b class="gs-num">${esc(brl(c.valor))}<small>/mês</small></b></li>`).join('')}</ul>`;
}

export function htmlEssenciais(r) {
  const e = r.essenciais;
  if (!e) return '<p class="gs-fraco">Cadastre as despesas essenciais (logo acima) pra comparar com o que você gasta de verdade.</p>';
  const max = Math.max(1, ...e.linhas.map((l) => Math.max(l.cadastrado, l.real || 0)));
  return `<div class="gs-ess-topo">
      <div><span class="gs-rot">Essenciais cadastrados</span><b class="gs-num">${esc(brl0(e.essencial))}</b><span class="gs-fraco">por mês</span></div>
      <div><span class="gs-rot">Gasto real (média 12m)</span><b class="gs-num">${esc(brl0(e.real))}</b><span class="gs-fraco">${num(e.razao) ? `${formatNumeroBR(e.razao, 1)}× o essencial` : ''}</span></div>
      <div><span class="gs-rot">Além do essencial</span><b class="gs-num ${num(e.alemDoEssencial) && e.alemDoEssencial > 0 ? 'bad' : 'good'}">${esc(brl0(e.alemDoEssencial))}</b><span class="gs-fraco">${num(e.fracaoSalario) ? `gasto = ${formatNumeroBR(e.fracaoSalario * 100, 0)}% do salário` : 'por mês'}</span></div>
    </div>
    <table class="gs-tab gs-ess"><thead><tr><th>Categoria (Despesas)</th><th class="gs-num">Cadastrado</th><th class="gs-num">Real/mês</th><th class="gs-ess-barra" aria-hidden="true"></th></tr></thead><tbody>
    ${e.linhas.map((l) => `<tr><td>${esc(l.categoria)}</td><td class="gs-num">${esc(brl0(l.cadastrado))}</td><td class="gs-num${num(l.diferenca) && l.diferenca > l.cadastrado * 0.1 + 20 ? ' bad' : ''}">${l.real == null ? '<span class="gs-fraco">—</span>' : esc(brl0(l.real))}</td>
      <td class="gs-ess-barra"><span class="gs-eb"><i class="gs-eb-c" style="width:${((l.cadastrado / max) * 100).toFixed(1)}%"></i>${l.real != null ? `<i class="gs-eb-r" style="width:${((l.real / max) * 100).toFixed(1)}%"></i>` : ''}</span></td></tr>`).join('')}
    </tbody></table>
    <p class="gs-nota"><span><i class="gs-q gs-q-ess"></i>cadastrado</span> <span><i class="gs-q gs-q-real"></i>real</span> · "Real" soma as categorias de gasto equivalentes (Alimentação = mercado + restaurantes; Transporte = apps + combustível).</p>`;
}

export function htmlDocumentos(r, { drive = null, hoje = new Date() } = {}) {
  const cob = r.cobertura;
  const fim = cob.ultimoFechado;
  const meses = Array.from({ length: 18 }, (_, k) => somarMeses(fim, k - 17));
  const linhas = cob.fontes.map((f) => {
    const set = new Set(f.meses);
    const celulas = meses.map((m) => {
      const cls = set.has(m) ? 'ok' : (m < f.primeiro ? 'antes' : 'falta');
      return `<i class="gs-cel ${cls}" title="${esc(mesAnoLongo(m))}: ${cls === 'ok' ? 'importado' : cls === 'falta' ? 'falta' : 'antes do 1º documento'}"></i>`;
    }).join('');
    const faltam = f.faltam.length ? `faltam ${f.faltam.slice(-4).map(mesAno).join(', ')}${f.faltam.length > 4 ? ` e mais ${f.faltam.length - 4}` : ''}` : 'completo';
    return `<tr><td><b>${esc(f.nome)}</b><span class="gs-fonte">${esc(mesAno(f.primeiro))} a ${esc(mesAno(f.ultimo))} · ${f.meses.length} meses</span></td>
      <td class="gs-cels" aria-label="Últimos 18 meses">${celulas}</td><td class="gs-faltam ${f.faltam.length ? 'warn' : 'good'}">${esc(faltam)}</td></tr>`;
  }).join('');
  const novos = drive && drive.arquivos ? drive.arquivos.filter((a) => !a.importado || a.alterado) : [];
  const problemas = (r.arquivos || []).filter((a) => a.conferencia && a.conferencia.ok === false);
  return `${cob.fontes.length ? `<div class="gs-tab-wrap"><table class="gs-tab gs-docs"><thead><tr><th>Documento</th><th>${esc(mesAno(meses[0]))} → ${esc(mesAno(fim))}</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<p class="gs-fraco">Nenhum documento importado ainda.</p>'}
    <p class="gs-nota"><span><i class="gs-cel ok"></i>importado</span> <span><i class="gs-cel falta"></i>falta</span> · fatura = mês do vencimento; extrato = meses do período.${drive && drive.configurado === false ? ' <b>Não achei a pasta Documentos/Transações no Drive</b> - rode <code>configurarPastasGastosDireto()</code> uma vez no editor do Apps Script.' : ''}${drive && drive.arquivos ? ` · ${drive.arquivos.length} arquivos no Drive, ${novos.length} novos/alterados.` : ''}</p>
    ${problemas.length ? `<div class="gs-problemas"><p class="gs-sub-t">Soma não bateu com o total do documento</p><ul>${problemas.map((a) => `<li><span>${esc(a.caminho ? `${a.caminho}/` : '')}${esc(a.nome)} <span class="gs-fraco">(diferença ${esc(brl(a.conferencia.diferenca))})</span></span><button type="button" class="gs-mini" data-acao="remover-arq" data-id="${esc(a.id)}">remover</button></li>`).join('')}</ul></div>` : ''}
    <div class="gs-acoes"><button type="button" class="btn" data-acao="drive">${novos.length ? `Importar ${novos.length} novo${novos.length > 1 ? 's' : ''} do Drive` : 'Procurar novos no Drive'}</button><button type="button" class="btn" data-acao="arquivo">Importar do computador</button></div>`;
}

/** Painel de importação: banner de novos, progresso, pedido de senha, resultado. */
export function htmlPainel(est) {
  const partes = [];
  const d = est.drive;
  if (d && d.erro && !est.importacao) partes.push(`<div class="gs-painel gs-aviso-bad"><span>${esc(d.erro)}</span><button type="button" class="gs-mini" data-acao="fechar-drive">fechar</button></div>`);
  if (d && d.arquivos && !est.importacao && !est.dispensado) {
    const novos = d.arquivos.filter((a) => !a.importado || a.alterado);
    if (novos.length) {
      const porBanco = {};
      novos.forEach((a) => { const k = a.banco || a.caminho; porBanco[k] = (porBanco[k] || 0) + 1; });
      partes.push(`<div class="gs-painel gs-novos"><div><b>${novos.length} arquivo${novos.length > 1 ? 's' : ''} novo${novos.length > 1 ? 's' : ''} no Drive</b><span class="gs-fraco"> · ${esc(Object.entries(porBanco).map(([k, n]) => `${k} ${n}`).join(' · '))}</span></div>
        <div class="gs-acoes"><button type="button" class="btn btn-primary" data-acao="importar-novos">Importar agora</button><button type="button" class="gs-mini" data-acao="dispensar">depois</button></div></div>`);
    }
  }
  const imp = est.importacao;
  if (imp) {
    const ok = imp.log.filter((x) => x.status === 'ok').length;
    partes.push(`<div class="gs-painel gs-imp"><div class="gs-imp-cab"><b>${imp.fim ? `Importação concluída: ${ok} de ${imp.total} arquivo${imp.total > 1 ? 's' : ''}` : `Importando ${Math.min(imp.log.length + 1, imp.total)} de ${imp.total}…`}</b>${imp.atual && !imp.fim ? `<span class="gs-fraco">${esc(imp.atual)}</span>` : ''}${imp.fim ? '<button type="button" class="gs-mini" data-acao="fechar-imp">fechar</button>' : ''}</div>
      <div class="gs-prog" aria-hidden="true"><i style="width:${((imp.log.length / Math.max(1, imp.total)) * 100).toFixed(1)}%"></i></div>
      ${imp.log.length ? `<ul class="gs-log">${imp.log.map((x) => `<li class="${x.status}"><span class="gs-log-i" aria-hidden="true">${x.status === 'ok' ? '✓' : x.status === 'aviso' ? '!' : x.status === 'pulado' ? '–' : '✕'}</span><span class="gs-log-n">${esc(x.nome)}</span><span class="gs-log-m">${esc(x.msg)}</span></li>`).join('')}</ul>` : ''}</div>`);
  }
  if (est.senha) {
    partes.push(`<form class="gs-painel gs-senha" data-form="senha"><div><b>${esc(est.senha.nome)}</b> está protegido por senha.${est.senha.incorreta ? ' <span class="bad">Senha incorreta - tente de novo.</span>' : ''}</div>
      <div class="gs-senha-l"><input type="password" id="gsSenha" autocomplete="off" aria-label="Senha do PDF" placeholder="Senha do PDF">
      <label class="gs-check"><input type="checkbox" id="gsLembrar"${est.senha.lembrar ? ' checked' : ''}> lembrar neste navegador</label>
      <button type="submit" class="btn btn-primary">Abrir</button><button type="button" class="gs-mini" data-acao="senha-pular">pular este</button></div>
      <p class="gs-fraco">A senha fica só aqui no navegador${est.senha.lembrar ? ' (lembrada)' : ''} - não vai pra planilha.</p></form>`);
  }
  return partes.join('');
}

export function htmlLancamentos(lista, filtro, total) {
  const cats = CATEGORIAS_GASTO.map((c) => `<option value="${c.id}"${filtro.categoria === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  return `<div class="gs-lanc-filtros"><input type="search" id="gsBusca" placeholder="Buscar descrição" value="${esc(filtro.busca)}" aria-label="Buscar descrição">
      <select id="gsFiltroCat" aria-label="Filtrar categoria"><option value="">Todas as categorias</option>${cats}<option value="__nao"${filtro.categoria === '__nao' ? ' selected' : ''}>Movimentações que não são gasto</option></select></div>
    <div class="gs-tab-wrap"><table class="gs-tab gs-lanc"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="gs-num">Valor</th></tr></thead><tbody>
    ${lista.map((x) => linhaLancamento(x.l, x.i)).join('') || '<tr><td colspan="4" class="gs-fraco">Nada encontrado.</td></tr>'}</tbody></table></div>
    ${total > lista.length ? `<button type="button" class="gs-mini gs-mais" data-acao="mais">mostrar mais (${total - lista.length})</button>` : ''}
    <p class="gs-nota">Mudar a categoria cria uma regra pra essa descrição - vale pros lançamentos de agora e dos próximos meses.</p>`;
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

export function montarSecaoGastos(raiz, opcoes = {}) {
  const {
    token = '', despesas = null, hoje = new Date(), doc = raiz.ownerDocument || globalThis.document,
    carregarPdf = carregarPdfJs, lerPdf = extrairLinhasPdfComSenha,
    storage = (() => { try { return globalThis.localStorage || null; } catch (e) { return null; } })(),
  } = opcoes;
  const api = opcoes.api || {
    getGastos: () => getGastos(token), getArquivosGastos: () => getArquivosGastos(token), getArquivoGastos: (id) => getArquivoGastos(token, id),
    salvarImportacaoGastos: (a, l) => salvarImportacaoGastos(token, a, l), salvarRegraGastos: (p, c) => salvarRegraGastos(token, p, c),
    excluirArquivoGastos: (id) => excluirArquivoGastos(token, id),
  };
  const win = doc.defaultView;
  const est = {
    periodo: PERIODOS.some((p) => p.id === lerLocal(storage, CHAVE_PERIODO)) ? lerLocal(storage, CHAVE_PERIODO) : '12m',
    filtroPeriodo: null, // 03/10/2026: controlador de periodo-personalizado.js (presets + "Escolher período")
    mes: null, cat: null, filtro: { busca: '', categoria: '' }, limite: 60, drive: null, importacao: null, senha: null, dispensado: false,
  };
  let dados = null; let resumo = null; let desp = despesas;
  let resolverSenha = null;
  const dicas = {};

  function esqueleto() {
    raiz.innerHTML = `<div class="gs-conteudo">
      <div class="gs-topo"><div class="gs-titulo"><h2>Gastos</h2><span class="gs-hint">faturas do cartão e extratos da conta · pagamento de fatura e transferências entre suas contas não contam</span></div><div class="gs-filtros" id="gsFiltros"></div></div>
      <div id="gsPainel" aria-live="polite"></div>
      <section class="gs-card gs-hero" id="gsHero"></section>
      <div id="gsCorpo">
        <div class="gs-duas">
          <section class="gs-card gs-pad"><div class="gs-card-cab"><h3>Por categoria</h3><span class="gs-hint" id="gsCatHint"></span></div><div id="gsCats"></div><div id="gsCatLista"></div></section>
          <section class="gs-card gs-pad"><div class="gs-card-cab"><h3>Mês a mês</h3><span class="gs-hint">cartão e conta</span></div>
            <div class="gs-grafico" data-grafico="evol" id="gsGEvol"></div>
            <div class="gs-leg"><span><i class="gs-q gs-q-cartao"></i>Cartão</span><span><i class="gs-q gs-q-conta"></i>Conta</span><span><i class="gs-leg-media"></i>Média do período</span></div></section>
        </div>
        <section class="gs-card gs-pad"><div class="gs-card-cab"><h3>Essencial x real</h3><span class="gs-hint">despesas cadastradas x o que os documentos mostram</span></div><div id="gsEss"></div></section>
        <div class="gs-duas">
          <section class="gs-card gs-pad"><div class="gs-card-cab"><h3>Assinaturas e gastos fixos</h3><span class="gs-hint">mesma descrição, valor parecido, mês após mês</span></div><div id="gsRec"></div></section>
          <section class="gs-card gs-pad"><div class="gs-card-cab"><h3>Parcelamentos em aberto</h3><span class="gs-hint">o que já está comprometido nas próximas faturas</span></div><div id="gsParc"></div></section>
        </div>
        <div class="gs-duas">
          <section class="gs-card gs-pad"><div class="gs-card-cab"><h3>Maiores lançamentos</h3><span class="gs-hint">fora os gastos fixos</span><span class="gs-hint" id="gsMaioresHint"></span></div><div id="gsMaiores"></div></section>
          <section class="gs-card gs-pad"><div class="gs-card-cab"><h3>Documentos</h3><span class="gs-hint">meses importados e os que faltam</span></div><div id="gsDocs"></div></section>
        </div>
        <details class="gs-card gs-pad gs-det" id="gsDetLanc"><summary><h3>Todos os lançamentos do período</h3><span class="gs-hint" id="gsLancHint"></span></summary><div id="gsLanc"></div></details>
      </div>
      <input type="file" id="gsArquivo" accept="application/pdf,.pdf,.csv,.ofx,text/csv" multiple hidden>
    </div>`;
    ligar();
  }

  const largura = (sel, padrao) => { const e = raiz.querySelector(sel); return (e && e.clientWidth) || padrao; };
  function grafico(sel, chave, g) { const box = raiz.querySelector(sel); if (!box) return; box.innerHTML = `${g.svg}<div class="gs-tt" hidden></div>`; dicas[chave] = g.dicas; }

  function recalcular() {
    resumo = resumoGastos({ lancamentos: dados ? dados.lancs : [], regras: dados ? dados.regras : [], arquivos: dados ? dados.arquivos : [] }, { periodo: est.periodo, mesEscolhido: est.mes, hoje, despesas: desp });
    resumo.arquivos = dados ? dados.arquivos : [];
  }

  function listaFiltrada() {
    const set = new Set(resumo.intervalo ? resumo.intervalo.meses : []);
    const noDia = diaNoPeriodo(resumo);
    const busca = chaveDescricao(est.filtro.busca);
    const todos = resumo.lancs.map((l, i) => ({ l, i })).filter(({ l }) => set.has(l.mes) && noDia(l)
      && (!busca || l.chave.includes(busca))
      && (est.filtro.categoria === '__nao' ? !l.gasto : (!est.filtro.categoria || l.categoria === est.filtro.categoria) && (est.filtro.categoria || l.gasto)))
      .sort((a, b) => (a.l.data < b.l.data ? 1 : a.l.data > b.l.data ? -1 : b.l.valor - a.l.valor));
    return { total: todos.length, lista: todos.slice(0, est.limite) };
  }

  function desenharPainel() { const p = raiz.querySelector('#gsPainel'); if (p) p.innerHTML = htmlPainel(est); const s = raiz.querySelector('#gsSenha'); if (s && est.senha && !est.senha.focado) { est.senha.focado = true; try { s.focus(); } catch (e) { /* ok */ } } }

  function desenharLancamentos() {
    const { lista, total } = listaFiltrada();
    raiz.querySelector('#gsLanc').innerHTML = htmlLancamentos(lista, est.filtro, total);
    raiz.querySelector('#gsLancHint').textContent = `${total} no período`;
  }

  function desenharCatLista() {
    const box = raiz.querySelector('#gsCatLista');
    if (!est.cat || resumo.vazio) { box.innerHTML = ''; return; }
    const set = new Set(resumo.intervalo.meses);
    const noDia = diaNoPeriodo(resumo);
    const itens = resumo.lancs.map((l, i) => ({ l, i })).filter(({ l }) => l.gasto && l.categoria === est.cat && set.has(l.mes) && noDia(l)).sort((a, b) => b.l.valor - a.l.valor);
    box.innerHTML = `<div class="gs-cat-lista"><p class="gs-sub-t">${esc(NOME_CATEGORIA[est.cat])} · ${itens.length} lançamentos</p><div class="gs-tab-wrap"><table class="gs-tab gs-lanc"><tbody>${itens.slice(0, 15).map((x) => linhaLancamento(x.l, x.i)).join('')}</tbody></table></div>${itens.length > 15 ? `<p class="gs-fraco">e mais ${itens.length - 15} - veja em "Todos os lançamentos".</p>` : ''}</div>`;
  }

  /**
   * 03/10/2026 ("Escolher período" em TODOS os filtros): os botões de período
   * ficam fixos (o controlador de periodo-personalizado.js acrescenta o chip
   * do calendário e cuida dos cliques); só a navegação de mês é redesenhada.
   */
  function garantirFiltroPeriodo() {
    const box = raiz.querySelector('#gsFiltros');
    if (!box || box.querySelector('.gs-periodos')) return;
    box.innerHTML = `${htmlTabsPeriodo(est.periodo)}<span class="gs-nav-slot"></span>`;
    try {
      est.filtroPeriodo = ligarFiltroPeriodo(doc, box.querySelector('.gs-periodos'), {
        chave: 'gastos', periodoInicial: est.periodo, comChip: true,
        aoMudar(p) {
          est.periodo = p;
          if (typeof p === 'string') gravarLocal(storage, CHAVE_PERIODO, p);
          else est.mes = null; // presets continuam ancorados no mês escolhido (‹ ›), como antes
          est.limite = 60; desenhar();
        },
      });
    } catch (e) { est.filtroPeriodo = null; }
    if (est.filtroPeriodo) est.periodo = est.filtroPeriodo.periodo; // pode ser o personalizado lembrado
  }

  function desenharFiltros(r) {
    const box = raiz.querySelector('#gsFiltros');
    if (!box) return;
    if (est.filtroPeriodo && r && !r.vazio && r.meses && r.meses.length) {
      try { est.filtroPeriodo.definirLimites({ min: `${r.meses[0]}-01`, max: isoHoje(hoje) }); } catch (e) { /* ok */ }
    }
    const nav = box.querySelector('.gs-nav-slot');
    if (nav) nav.innerHTML = htmlNavMes(r);
  }

  function desenhar() {
    if (!raiz.querySelector('.gs-conteudo')) esqueleto();
    garantirFiltroPeriodo();
    recalcular();
    const r = resumo;
    desenharFiltros(r);
    raiz.querySelector('#gsHero').innerHTML = htmlHero(r);
    raiz.querySelector('#gsHero').classList.toggle('gs-hero-v', !!r.vazio);
    raiz.querySelector('#gsCorpo').hidden = !!r.vazio;
    desenharPainel();
    if (r.vazio) return;
    raiz.querySelector('#gsCatHint').textContent = rotuloPeriodo(r);
    raiz.querySelector('#gsCats').innerHTML = htmlCategorias(r, est.cat);
    desenharCatLista();
    const evol = r.periodo === 'mes' ? r.porMesTodos.filter((m) => m.mes > somarMeses(r.mesRef, -12) && m.mes <= r.mesRef) : r.porMes;
    grafico('#gsGEvol', 'evol', graficoEvolucao(evol, { largura: largura('#gsGEvol', 560), media: r.periodo === 'mes' ? r.media12 : r.media, destaque: r.periodo === 'mes' ? r.mesRef : null }));
    raiz.querySelector('#gsEss').innerHTML = htmlEssenciais(r);
    raiz.querySelector('#gsRec').innerHTML = htmlRecorrentes(r);
    raiz.querySelector('#gsParc').innerHTML = htmlParcelas(r);
    if (r.parcelas.porMes.length) grafico('#gsGParc', 'parc', graficoParcelas(r.parcelas.porMes, { largura: largura('#gsGParc', 480) }));
    raiz.querySelector('#gsMaiores').innerHTML = htmlMaiores(r);
    raiz.querySelector('#gsMaioresHint').textContent = rotuloPeriodo(r);
    raiz.querySelector('#gsDocs').innerHTML = htmlDocumentos(r, { drive: est.drive, hoje });
    desenharLancamentos();
  }

  // --- leitura e importação ------------------------------------------------

  function pedirSenha(nome, incorreta) {
    return new Promise((resolve) => {
      resolverSenha = resolve;
      est.senha = { nome, incorreta, lembrar: !!lerLocal(storage, CHAVE_SENHA) };
      desenharPainel();
    });
  }

  /** Sem senha -> senha lembrada -> pede na tela (até acertar ou "pular"). */
  async function abrirPdf(bytes, nome) {
    const lib = await carregarPdf(doc);
    try { return await lerPdf(lib, bytes, null); } catch (e) { if (!ehErroSenha(e)) throw e; }
    const lembrada = lerLocal(storage, CHAVE_SENHA);
    if (lembrada) { try { return await lerPdf(lib, bytes, lembrada); } catch (e) { if (!ehErroSenha(e)) throw e; } }
    let incorreta = !!lembrada;
    for (;;) {
      const r = await pedirSenha(nome, incorreta);
      if (!r) throw Object.assign(new Error('pulado (sem a senha)'), { pulado: true });
      try {
        const linhas = await lerPdf(lib, bytes, r.senha);
        gravarLocal(storage, CHAVE_SENHA, r.lembrar ? r.senha : null);
        return linhas;
      } catch (e) { if (!ehErroSenha(e)) throw e; incorreta = true; }
    }
  }

  /** Um arquivo (bytes + metadados) -> documento lido. */
  async function lerUmArquivo({ nome, bytes, banco, origem }) {
    const ext = String(nome).split('.').pop().toLowerCase();
    if (ext === 'csv') return lerCsvGastos(new TextDecoder('utf-8').decode(bytes), { nome });
    if (ext === 'ofx') return lerOfxGastos(new TextDecoder('latin1').decode(bytes));
    const linhas = juntarAcentos(await abrirPdf(bytes, nome));
    return lerDocumentoGasto(linhas, { banco, origem });
  }

  function lancamentosParaSalvar(docLido) {
    const rp = prepararRegras(dados ? dados.regras : []);
    const lancs = (docLido.lancamentos || []).filter((l) => l.mes && l.data && num(l.valor));
    const chaves = chavesDedup(docLido.fonte, lancs);
    return lancs.map((l, i) => ({ ...l, origem: docLido.origem, fonte: docLido.fonte, categoria: categorizar(l, rp), chaveDedup: chaves[i] }));
  }

  async function importarLista(itens) {
    est.importacao = { total: itens.length, log: [], atual: '', fim: false };
    est.dispensado = true;
    desenharPainel();
    for (const it of itens) {
      const nome = it.caminho ? `${it.caminho}/${it.nome}` : it.nome;
      est.importacao.atual = nome;
      desenharPainel();
      let status = 'ok'; let msg = '';
      try {
        let bytes = it.bytes;
        let modificado = it.modificado || '';
        if (!bytes) {
          const r = await api.getArquivoGastos(it.id);
          if (!r || !r.ok || !r.base64) throw new Error((r && r.erro) || 'o arquivo não veio do Drive');
          bytes = base64ParaBytes(r.base64);
          modificado = r.modificado || modificado;
        }
        const lido = await lerUmArquivo({ nome: it.nome, bytes, banco: it.banco, origem: it.origem });
        if (lido.erro || !(lido.lancamentos || []).length) throw new Error(lido.erro || (lido.avisos || []).join(' ') || 'nenhum lançamento encontrado');
        const lancs = lancamentosParaSalvar(lido);
        const meta = {
          id: it.id, nome: it.nome, caminho: it.caminho || '', fonte: lido.fonte, modificado,
          meses: mesesDoDocumento(lido), total: lido.total, conferencia: lido.conferencia, entradas: lido.entradas,
        };
        const s = await api.salvarImportacaoGastos(meta, lancs);
        if (!s || !s.ok) throw new Error(`não salvou: ${(s && s.erro) || 'sem resposta'}`);
        const meses = meta.meses.length > 1 ? `${mesAno(meta.meses[0])}–${mesAno(meta.meses[meta.meses.length - 1])}` : mesAno(meta.meses[0]);
        msg = `${NOME_FONTE[lido.fonte] || lido.fonte} ${meses} · ${s.gravados} lançamentos${s.pulados ? ` (${s.pulados} já estavam)` : ''}`;
        if (lido.conferencia && lido.conferencia.ok === false) { status = 'aviso'; msg += ` · soma não bate (diferença ${brl(lido.conferencia.diferenca)})`; } else if (lido.conferencia && lido.conferencia.ok) msg += ' · soma confere';
      } catch (e) {
        status = e && e.pulado ? 'pulado' : 'erro';
        msg = String((e && e.message) || e);
      }
      est.importacao.log.push({ nome, status, msg });
      desenharPainel();
    }
    est.importacao.fim = true;
    est.importacao.atual = '';
    await carregar({ comDrive: true });
  }

  async function procurarDrive({ importar = false } = {}) {
    let r;
    try { r = await api.getArquivosGastos(); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) est.drive = { erro: `Não deu pra listar o Drive: ${(r && r.erro) || 'erro'}` };
    else est.drive = { configurado: r.configurado !== false, arquivos: r.arquivos || [] };
    if (importar && est.drive.arquivos) {
      const novos = est.drive.arquivos.filter((a) => !a.importado || a.alterado);
      if (novos.length) { await importarLista(novos); return; }
    }
    if (dados) desenhar(); else desenharPainel();
  }

  async function lerArquivos(files) {
    const itens = [];
    for (const f of files) {
      // 27/09/2026 (patrimônio): NÃO usar "f.bytes" - Blob.prototype.bytes é um MÉTODO.
      const bytes = f.conteudo instanceof Uint8Array ? f.conteudo : new Uint8Array(await f.arrayBuffer());
      itens.push({ id: `upload:${f.name || f.nome}:${f.size || bytes.length}`, nome: f.name || f.nome, caminho: 'computador', bytes, modificado: f.lastModified ? new Date(f.lastModified).toISOString() : '' });
    }
    if (itens.length) await importarLista(itens);
  }

  async function recategorizar(i, categoria) {
    const l = resumo.lancs[i];
    if (!l || !categoria) return;
    const padrao = l.chave;
    dados.regras = [...(dados.regras || []).filter((x) => chaveDescricao(x.padrao) !== padrao), { padrao, categoria }];
    desenhar();
    let r;
    try { r = await api.salvarRegraGastos(padrao, categoria); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (r && r.ok && r.regras) { dados.regras = r.regras; } else if (!r || !r.ok) {
      const p = raiz.querySelector('#gsPainel');
      if (p) p.insertAdjacentHTML('afterbegin', `<div class="gs-painel gs-aviso-bad"><span>Não deu pra salvar a regra: ${esc((r && r.erro) || 'erro')}</span></div>`);
    }
  }

  // --- eventos ---------------------------------------------------------------

  function mostrarDica(alvo) {
    const box = alvo.closest('[data-grafico]');
    const tt = box && box.querySelector('.gs-tt');
    const lista = box && dicas[box.dataset.grafico];
    if (!tt || !lista || !lista[Number(alvo.dataset.i)]) return;
    tt.innerHTML = lista[Number(alvo.dataset.i)];
    tt.hidden = false;
    const rb = box.getBoundingClientRect ? box.getBoundingClientRect() : { left: 0, width: 0 };
    const ra = alvo.getBoundingClientRect ? alvo.getBoundingClientRect() : { left: 0, width: 0 };
    let x = ra.left - rb.left + ra.width / 2 + 10;
    if (x > rb.width - 190) x = Math.max(4, ra.left - rb.left + ra.width / 2 - 196);
    tt.style.left = `${x}px`; tt.style.top = '10px';
  }
  const esconderDica = (alvo) => { const box = alvo && alvo.closest && alvo.closest('[data-grafico]'); const tt = box && box.querySelector('.gs-tt'); if (tt) tt.hidden = true; };

  function ligar() {
    raiz.addEventListener('mouseover', (ev) => { const h = ev.target.closest && ev.target.closest('.gs-hit'); if (h) mostrarDica(h); });
    raiz.addEventListener('mouseout', (ev) => { const h = ev.target.closest && ev.target.closest('.gs-hit'); if (h) esconderDica(h); });
    raiz.addEventListener('focusin', (ev) => { const h = ev.target.closest && ev.target.closest('.gs-hit'); if (h) mostrarDica(h); });
    raiz.addEventListener('focusout', (ev) => { const h = ev.target.closest && ev.target.closest('.gs-hit'); if (h) esconderDica(h); });
    raiz.addEventListener('click', async (ev) => {
      const per = !est.filtroPeriodo && ev.target.closest('[data-periodo]');
      if (per) { est.periodo = per.dataset.periodo; gravarLocal(storage, CHAVE_PERIODO, est.periodo); est.limite = 60; desenhar(); return; }
      const cat = ev.target.closest('[data-cat]');
      if (cat) { est.cat = est.cat === cat.dataset.cat ? null : cat.dataset.cat; raiz.querySelector('#gsCats').innerHTML = htmlCategorias(resumo, est.cat); desenharCatLista(); return; }
      const b = ev.target.closest('[data-acao]');
      if (!b || !raiz.contains(b)) return;
      const acao = b.dataset.acao;
      if (acao === 'mes-ant' || acao === 'mes-prox') {
        est.mes = somarMeses(resumo.mesRef, acao === 'mes-ant' ? -1 : 1);
        if (est.periodo !== 'mes' && est.periodo !== 'ano' && est.periodo !== 'tudo') { /* mantém a janela, ancorada no mês */ }
        desenhar();
      } else if (acao === 'drive') await procurarDrive({ importar: !!(est.drive && est.drive.arquivos) });
      else if (acao === 'importar-novos') await procurarDrive({ importar: true });
      else if (acao === 'arquivo') raiz.querySelector('#gsArquivo').click();
      else if (acao === 'dispensar') { est.dispensado = true; desenharPainel(); }
      else if (acao === 'fechar-imp') { est.importacao = null; desenharPainel(); }
      else if (acao === 'fechar-drive') { est.drive = null; desenharPainel(); }
      else if (acao === 'senha-pular') { const r = resolverSenha; resolverSenha = null; est.senha = null; desenharPainel(); if (r) r(null); }
      else if (acao === 'mais') { est.limite += 100; desenharLancamentos(); }
      else if (acao === 'remover-arq') {
        b.disabled = true;
        try { await api.excluirArquivoGastos(b.dataset.id); } catch (e) { /* recarrega igual */ }
        await carregar();
      }
    });
    raiz.addEventListener('submit', (ev) => {
      const f = ev.target.closest('form[data-form="senha"]');
      if (!f) return;
      ev.preventDefault();
      const senha = f.querySelector('#gsSenha').value;
      if (!senha) return;
      const lembrar = f.querySelector('#gsLembrar').checked;
      const r = resolverSenha; resolverSenha = null; est.senha = null; desenharPainel();
      if (r) r({ senha, lembrar });
    });
    raiz.addEventListener('change', async (ev) => {
      const t = ev.target;
      if (t.id === 'gsArquivo') { const arqs = [...(t.files || [])]; t.value = ''; if (arqs.length) await lerArquivos(arqs); return; }
      if (t.id === 'gsFiltroCat') { est.filtro.categoria = t.value; est.limite = 60; desenharLancamentos(); return; }
      if (t.dataset && t.dataset.recat !== undefined) await recategorizar(Number(t.dataset.recat), t.value);
    });
    raiz.addEventListener('input', (ev) => {
      if (ev.target.id === 'gsBusca') {
        est.filtro.busca = ev.target.value; est.limite = 60;
        const pos = ev.target.selectionStart;
        desenharLancamentos();
        const novo = raiz.querySelector('#gsBusca');
        if (novo) { novo.focus(); try { novo.setSelectionRange(pos, pos); } catch (e) { /* ok */ } }
      }
    });
    if (win && typeof win.addEventListener === 'function') {
      let t = null;
      win.addEventListener('resize', () => { if (!dados || !raiz.offsetParent) return; clearTimeout(t); t = setTimeout(() => desenhar(), 200); });
    }
  }

  async function carregar({ comDrive = false } = {}) {
    const pDrive = comDrive || !est.drive ? api.getArquivosGastos().catch((e) => ({ ok: false, erro: String(e) })) : null;
    let r;
    try { r = await api.getGastos(); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) {
      if (!dados) raiz.innerHTML = `<div class="carteiras-erro">Não deu pra carregar os gastos agora (${esc((r && r.etapa) || '?')}): ${esc((r && r.erro) || 'erro desconhecido')}.</div>`;
      return;
    }
    dados = { lancs: objetosLancamentos(r), regras: r.regras || [], arquivos: r.arquivos || [] };
    desenhar();
    if (pDrive) {
      const d = await pDrive;
      if (d && d.ok) est.drive = { configurado: d.configurado !== false, arquivos: d.arquivos || [] };
      else if (d) est.drive = { erro: `Não deu pra listar o Drive: ${d.erro || 'erro'}` };
      desenhar();
    }
  }

  raiz.innerHTML = '<div class="carteiras-loading" aria-hidden="true"><span class="skel" style="height:150px;border-radius:14px"></span><span class="skel" style="height:300px;border-radius:14px"></span></div>';
  const pronto = carregar({ comDrive: true });
  return {
    pronto,
    recarregar: () => carregar({ comDrive: true }),
    atualizarDespesas(d) { desp = d; if (dados) desenhar(); },
    importarNovos: () => procurarDrive({ importar: true }),
    lerArquivos,
    get dados() { return dados; },
    get resumo() { return resumo; },
  };
}

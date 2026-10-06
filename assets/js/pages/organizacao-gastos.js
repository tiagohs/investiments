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
 *
 * 03/10/2026 (Tiago: faturas antigas do Nubank e TODAS as OuroCard falhando;
 * "se eu for reimportar o que faltou, não reimportar o que já deu sucesso"):
 *  - o PDF é lido COM a posição de cada pedaço de texto
 *    (extrairPaginasPdfComSenha) - a fatura do BB tem 2 painéis lado a lado
 *    e uma fonte que o pdf.js quebra letra a letra;
 *  - o que falha fica registrado como "com problema" (Gastos.gs, Situação
 *    = erro, sem lançamento) e o que entra com soma que não bate como
 *    "aviso": "Importar novos" pula esses; "Tentar de novo só os que
 *    falharam" pega só eles. Reimportar substitui os lançamentos do arquivo.
 *  - outros painéis (Documentos) mandam arquivos do computador pra cá com
 *    o evento 'organizacao:gastos-arquivos' (detail.arquivos).
 */
import {
  getGastos, getArquivosGastos, getArquivoGastos, salvarImportacaoGastos, salvarRegraGastos, excluirArquivoGastos,
} from '../api-client.js';
import { formatBRL, formatNumeroBR, MESES_CURTOS, formatDM, formatMesAno, formatBRL0 } from '../format.js';
import { ligarFiltroPeriodo } from '../periodo-personalizado.js'; // 03/10/2026: "Escolher período"
import { carregarPdfJs } from './holerite.js';
import { juntarAcentos } from './patrimonio-import.js';
import { lerDocumentoGasto, lerCsvGastos, lerOfxGastos, mesesDoDocumento } from './gastos-import.js';
import {
  CATEGORIAS_GASTO, NOME_CATEGORIA, NOME_FONTE, PERIODOS, resumoGastos, prepararRegras, categorizar, chavesDedup, chaveDescricao, somarMeses, mesDe,
  arquivosNovosDrive, arquivosFalhosDrive, arquivosParciaisDrive,
} from './gastos-calc.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { montarGrafico, limparGrafico } from './metas-graficos.js'; // 06/10/2026 (Onda 3): gráficos da biblioteca (criam e morfam)
import { kpiHtml, chipHtml, icoHtml, compAttr, montarBarrasProgresso, montarComposicoes, tornarRecolhiveis } from './organizacao-ui.js';
import { mostrarErroCarga, confirmar, toast } from '../ui/index.js';


/** Evento que outros painéis da página disparam no document pra mandar arquivos do computador pra cá. */
export const EVENTO_ARQUIVOS_GASTOS = 'organizacao:gastos-arquivos';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const mil = (v) => (Math.abs(v) >= 1000 ? `${formatNumeroBR(v / 1000, Math.abs(v) >= 10000 ? 0 : 1)} mil` : formatNumeroBR(v, 0));

/** No período personalizado, só os lançamentos dentro dos dias escolhidos. */
function diaNoPeriodo(r) {
  const dias = r && r.intervalo && r.intervalo.dias;
  return dias ? (l) => l.data >= dias.inicio && l.data <= dias.fim : () => true;
}
function isoHoje(hoje) {
  const d = hoje instanceof Date ? hoje : new Date(hoje || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const pctVar = (a, b) => (num(a) && num(b) && b > 0 ? (a - b) / b : null);
const pillVar = (v, rotulo) => {
  if (!num(v)) return '';
  const tom = v > 0.02 ? 'bad' : v < -0.02 ? 'good' : 'info';
  const ico = v > 0 ? 'north-east' : v < 0 ? 'south-east' : null;
  return `<span title="${esc(rotulo)}">${chipHtml(tom, `${formatNumeroBR(Math.abs(v) * 100, 0)}% ${esc(rotulo)}`, ico)}</span>`;
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
/**
 * 03/10/2026: PDF -> páginas com os itens do pdf.js e a POSIÇÃO de cada um
 * ({ s, x, y, w }) - gastos-import.js!linhasDeItens junta em linhas olhando
 * o espaço entre os pedaços e separa os painéis lado a lado da fatura do BB.
 */
export async function extrairPaginasPdfComSenha(pdfjsLib, bytes, senha) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(), password: senha || undefined }).promise;
  const paginas = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const pagina = await pdf.getPage(n);
    const { items } = await pagina.getTextContent();
    paginas.push({ itens: items.filter((it) => String(it.str || '').trim()).map((it) => ({ s: String(it.str), x: it.transform[4], y: it.transform[5], w: Number(it.width) || 0 })) });
  }
  try { await pdf.destroy(); } catch (e) { /* ok */ }
  return paginas;
}
const ehErroSenha = (e) => !!e && (e.name === 'PasswordException' || /password/i.test(String(e.message || '')));

/** Lançamentos da planilha (arrays) -> objetos. */
function objetosLancamentos(r) {
  const cols = r.colunas || ['mes', 'data', 'origem', 'fonte', 'descricao', 'categoria', 'valor', 'tipo', 'parcela', 'arquivo'];
  return (r.lancamentos || []).map((l) => (Array.isArray(l) ? Object.fromEntries(cols.map((c, i) => [c, l[i]])) : l));
}

// ---------------------------------------------------------------------------
// Gráficos (06/10/2026, Onda 3: biblioteca assets/js/charts via metas-graficos!montarGrafico; aqui só dado -> opções)
// ---------------------------------------------------------------------------

const tituloMes = (m) => formatMesAno(m, { anoCurto: false });
const tituloDoItem = (item) => (item && item.titulo) || '';

/** Evolução mensal empilhada: cartão (embaixo) + conta; o mês escolhido fica em destaque; a média do período vai no balão. -> spec de montarGrafico ou null. */
export function opcoesEvolucaoGastos(porMes, { media = null, destaque = null } = {}) {
  if (!porMes.length) return null;
  const idx = destaque ? porMes.findIndex((p) => p.mes === destaque) : -1;
  return {
    tipo: 'barras',
    opcoes: {
      modo: 'empilhadas', categorias: porMes.map((p) => ({ rotulo: formatMesAno(p.mes), titulo: tituloMes(p.mes) })),
      series: [
        { id: 'cartao', nome: 'Cartão', cor: 1, valores: porMes.map((p) => Math.max(0, p.cartao)) },
        { id: 'conta', nome: 'Conta', cor: 2, valores: porMes.map((p) => Math.max(0, p.conta)) },
      ],
      formatarX: tituloDoItem, formatarValor: (v) => formatBRL(v), formatarY: mil, altura: 230, tons: 'categorica',
      destaque: idx >= 0 ? idx : null, rotulosValor: false,
      tooltipExtra: (i) => {
        const e = [{ nome: 'Total', valor: formatBRL(porMes[i].total) }];
        if (num(media) && media > 0) e.push({ nome: 'Média do período', valor: formatBRL0(media) });
        return e;
      },
      aria: `Gasto por mês, cartão e conta, de ${tituloMes(porMes[0].mes)} a ${tituloMes(porMes[porMes.length - 1].mes)}`,
    },
  };
}

/** Compromisso futuro das parcelas, mês a mês. -> spec de montarGrafico ou null. */
export function opcoesParcelasGastos(porMes) {
  if (!porMes.length) return null;
  return {
    tipo: 'barras',
    opcoes: {
      modo: 'simples', categorias: porMes.map((p) => ({ rotulo: formatMesAno(p.mes), titulo: tituloMes(p.mes) })),
      series: [{ id: 'parcelas', nome: 'Parcelas', cor: 3, valores: porMes.map((p) => p.total) }],
      formatarX: tituloDoItem, formatarValor: (v) => formatBRL(v), formatarY: mil, altura: 170, rotulosValor: false, tons: 'categorica',
      aria: `Parcelas a pagar nos próximos meses, de ${tituloMes(porMes[0].mes)} a ${tituloMes(porMes[porMes.length - 1].mes)}`,
    },
  };
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
  if (r.periodo === 'mes') return `em ${formatMesAno(r.mesRef, { anoCurto: false })}`;
  if (r.periodo === 'ano') return `em ${r.mesRef.slice(0, 4)} (até ${formatMesAno(r.mesRef)})`;
  if (r.periodo === 'tudo') return `desde ${formatMesAno(r.intervalo.inicio)}`;
  return `de ${formatMesAno(r.intervalo.inicio)} a ${formatMesAno(r.intervalo.fim)}`;
}

export function htmlTabsPeriodo(periodo) {
  const tabs = PERIODOS.map((p) => `<button type="button" class="filter-tab${p.id === periodo ? ' active' : ''}" data-periodo="${p.id}" aria-pressed="${p.id === periodo}">${esc(p.nome)}</button>`).join('');
  return `<div class="filter-tabs gs-periodos" role="group" aria-label="Período">${tabs}</div>`;
}

/** Navegação de mês (‹ set/2026 ›) - não vale no período personalizado (o calendário já escolhe as datas). */
export function htmlNavMes(r) {
  return r && !r.vazio && !(r.intervalo && r.intervalo.dias) ? `<div class="gs-nav-mes" role="group" aria-label="Mês de referência">
      <button type="button" class="gs-nav-b" data-acao="mes-ant" aria-label="Mês anterior" ${r.mesRef <= (r.primeiroMes || r.meses[0]) ? 'disabled' : ''}>‹</button>
      <span class="gs-nav-t">${esc(formatMesAno(r.mesRef, { anoCurto: false }))}</span>
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
    return `${n} lançamento${n === 1 ? '' : 's'} em ${nd} dia${nd === 1 ? '' : 's'}${nd >= 7 ? ` · ritmo de <b>${esc(formatBRL0(r.total / nd * 30.44))}/mês</b>` : ''}`;
  }
  return r.mesesValidos > 1 ? `média de <b>${esc(formatBRL0(r.media))}/mês</b> em ${r.mesesValidos} meses` : `${n} lançamentos`;
}

/** Uma linha no tile do mês quando algum arquivo dele entrou com a soma que não bate (A-25). */
function avisoDoMes(r) {
  const a = (mesesComAviso(r.arquivos)[r.mesRef] || []);
  // 07/10/2026 (Tiago: "considere como parcialmente sucesso ... o que importa são as compras"): nota discreta, não alerta
  return a.length ? `<span class="gs-aviso-mes" title="${esc(a.map((x) => x.nome).join(' · '))}">entrada parcial em ${a.length} arquivo${a.length > 1 ? 's' : ''} deste mês (as compras entraram; o total do documento não bate)</span>` : '';
}

export function htmlHero(r) {
  if (r.vazio) {
    return `<div class="estado gs-hero-vazio"><span class="estado-ico">${icoHtml('inbox')}</span><h3 class="estado-titulo">Seus gastos aparecem aqui</h3>
      <p class="estado-texto">Importe as faturas do cartão e os extratos da conta - das pastas <b>Documentos/Transações</b> do seu Drive ou do computador. Os PDFs são lidos no seu navegador; só os lançamentos (data, descrição, valor) vão pra planilha.</p>
      <div class="estado-acoes"><button type="button" class="btn btn-filled" data-acao="drive">Procurar no Drive</button><button type="button" class="btn btn-tonal" data-acao="arquivo">Importar do computador</button><button type="button" class="btn btn-outlined" data-acao="recarregar">Recarregar da planilha</button></div></div>`;
  }
  const d = r.doMes;
  const v6 = pctVar(d.total, r.media6); const v12 = pctVar(d.total, r.media12);
  const fatias = [{ id: 'cartao', nome: 'Cartão', valor: Math.max(0, r.cartao), cor: 1 }, { id: 'conta', nome: 'Conta', valor: Math.max(0, r.conta), cor: 2 }];
  const ativos = r.recorrentes.filter((x) => x.ativa);
  return `<div class="grid-kpi gs-kpis">
    ${kpiHtml({
    classe: 'gs-kpi gs-kpi-total', rotulo: `Gasto ${rotuloPeriodo(r)}`, valorHtml: `<span class="gs-grande">${esc(formatBRL0(r.total))}</span>`,
    extraHtml: `<div class="gs-split" ${compAttr(fatias)}></div>`,
    subHtml: `${subHero(r)}<span class="gs-hero-leg"><span><span class="gs-q gs-q-cartao"></span>Cartão <b>${esc(formatBRL0(r.cartao))}</b></span><span><span class="gs-q gs-q-conta"></span>Conta <b>${esc(formatBRL0(r.conta))}</b></span></span>`,
  })}
    ${kpiHtml({
    classe: 'gs-kpi', rotulo: formatMesAno(r.mesRef, { anoCurto: false }), valorHtml: esc(formatBRL0(d.total)),
    extraHtml: `<div class="gs-pills">${pillVar(v6, 'vs média 6m')}${pillVar(v12, 'vs média 12m')}</div>`, subHtml: avisoDoMes(r),
  })}
    ${kpiHtml({
    classe: 'gs-kpi', rotulo: 'Média 12 meses', valorHtml: esc(formatBRL0(r.media12)),
    subHtml: `${num(r.media12) ? `${esc(formatBRL0(r.media12 * 12))} por ano` : 'precisa de mais meses'} · média 6 meses <b>${esc(formatBRL0(r.media6))}</b> (antes de ${esc(formatMesAno(r.mesRef))})`,
  })}
    ${kpiHtml({
    classe: 'gs-kpi', rotulo: 'Recorrentes ativos', valorHtml: esc(formatBRL0(ativos.reduce((s, x) => s + x.valor, 0))), subHtml: `${ativos.length} por mês`,
  })}
  </div>`;
}

export function htmlCategorias(r, aberta = null) {
  if (!r.categorias.length) return '<p class="gs-fraco">Nenhum gasto no período.</p>';
  const max = Math.max(...r.categorias.map((c) => c.total));
  return `<ul class="gs-cats">${r.categorias.map((c) => `<li><button type="button" class="gs-cat${aberta === c.id ? ' on' : ''}" data-cat="${esc(c.id)}" aria-expanded="${aberta === c.id}">
      <span class="gs-cat-n">${esc(c.nome)}</span><span class="gs-cat-v gs-num">${esc(formatBRL0(c.total))}<small>${formatNumeroBR(c.fracao * 100, 0)}%</small></span>
      <span class="gs-cat-b" data-prog-valor="${Math.max(0.01, c.total / max).toFixed(4)}" data-prog-cor="1" data-prog-rotulo="${esc(c.nome)}"></span>
      ${r.mesesValidos > 1 ? `<span class="gs-cat-m">${esc(formatBRL0(c.total / r.mesesValidos))}/mês</span>` : ''}</button></li>`).join('')}</ul>`;
}

function seletorCategoria(atual, attrs) {
  return `<select class="gs-sel" ${attrs} aria-label="Categoria">${CATEGORIAS_GASTO.map((c) => `<option value="${c.id}"${c.id === atual ? ' selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>`;
}

function linhaLancamento(l, i, { comSeletor = true } = {}) {
  return `<tr><td class="num gs-num gs-fraco">${esc(formatDM(l.data, ''))}</td>
    <td><span class="gs-desc">${esc(l.descricao)}</span>${l.parcela ? ` <span class="gs-tag">${esc(l.parcela)}</span>` : ''}<span class="gs-fonte">${esc(NOME_FONTE[l.fonte] || l.fonte)}${l.origem === 'cartao' && l.mes !== String(l.data).slice(0, 7) ? ` · fatura ${esc(formatMesAno(l.mes))}` : ''}</span></td>
    <td>${comSeletor ? seletorCategoria(l.categoria, `data-recat="${i}"`) : esc(NOME_CATEGORIA[l.categoria] || l.categoria)}</td>
    <td class="num gs-num gs-valor${l.valor < 0 ? ' good' : ''}">${esc(formatBRL(l.valor))}</td></tr>`;
}

export function htmlMaiores(r) {
  if (!r.maiores.length) return '<p class="gs-fraco">Nada no período.</p>';
  return `<ol class="gs-maiores">${r.maiores.map((l) => `<li><span class="gs-m-d"><span class="gs-desc">${esc(l.descricao)}</span><span class="gs-fonte">${esc(formatDM(l.data, ''))} · ${esc(NOME_CATEGORIA[l.categoria] || '')}${l.parcela ? ` · parcela ${esc(l.parcela)}` : ''}</span></span><b class="gs-num">${esc(formatBRL(l.valor))}</b></li>`).join('')}</ol>`;
}

export function htmlRecorrentes(r) {
  const ativos = r.recorrentes.filter((x) => x.ativa);
  const parados = r.recorrentes.filter((x) => !x.ativa && x.categoria === 'assinaturas').slice(0, 5);
  if (!r.recorrentes.length) return '<p class="gs-fraco">Ainda não achei gastos que se repetem todo mês - aparecem com 3 meses ou mais de documentos.</p>';
  const tot = ativos.reduce((s, x) => s + x.valor, 0);
  const item = (x) => `<li class="${x.ativa ? '' : 'gs-parado'}"><span class="gs-m-d"><span class="gs-desc">${esc(x.descricao.replace(/^Pix enviado · /, 'Pix · '))}</span><span class="gs-fonte">${esc(NOME_CATEGORIA[x.categoria] || '')} · ${x.meses} meses${x.ativa ? '' : ` · último em ${esc(formatMesAno(x.ultimo))}`}</span></span><b class="gs-num">${esc(formatBRL(x.valor))}</b></li>`;
  return `<p class="gs-resumo-linha"><b class="gs-num">${esc(formatBRL(tot))}</b>/mês em ${ativos.length} gastos fixos · <b class="gs-num">${esc(formatBRL0(tot * 12))}</b> por ano</p>
    <ul class="gs-maiores gs-rec">${ativos.map(item).join('')}</ul>
    ${parados.length ? `<p class="gs-sub-t">Assinaturas que pararam</p><ul class="gs-maiores gs-rec">${parados.map(item).join('')}</ul>` : ''}`;
}

export function htmlParcelas(r) {
  const p = r.parcelas;
  if (!p.compras.length) return '<p class="gs-fraco">Nenhuma compra parcelada em aberto nas últimas faturas.</p>';
  return `<p class="gs-resumo-linha"><b class="gs-num">${esc(formatBRL(p.total))}</b> ainda a pagar em ${p.compras.length} compra${p.compras.length > 1 ? 's' : ''} · próxima fatura <b class="gs-num">${esc(formatBRL(p.porMes[0] ? p.porMes[0].total : 0))}</b></p>
    <div class="gs-grafico" data-grafico="parc" id="gsGParc"></div>
    <ul class="gs-maiores">${p.compras.slice(0, 8).map((c) => `<li><span class="gs-m-d"><span class="gs-desc">${esc(c.descricao)}</span><span class="gs-fonte">${esc(NOME_FONTE[c.fonte] || c.fonte)} · ${c.n}/${c.de} · termina ${esc(formatMesAno(c.fim))}</span></span><b class="gs-num">${esc(formatBRL(c.valor))}<small>/mês</small></b></li>`).join('')}</ul>`;
}

export function htmlEssenciais(r) {
  const e = r.essenciais;
  if (!e) return '<p class="gs-fraco">Cadastre as despesas essenciais (logo acima) pra comparar com o que você gasta de verdade.</p>';
  const max = Math.max(1, ...e.linhas.map((l) => Math.max(l.cadastrado, l.real || 0)));
  return `<div class="gs-ess-topo">
      <div><span class="gs-rot">Essenciais cadastrados</span><b class="gs-num">${esc(formatBRL0(e.essencial))}</b><span class="gs-fraco">por mês</span></div>
      <div><span class="gs-rot">Gasto real (média 12m)</span><b class="gs-num">${esc(formatBRL0(e.real))}</b><span class="gs-fraco">${num(e.razao) ? `${formatNumeroBR(e.razao, 1)}× o essencial` : ''}</span></div>
      <div><span class="gs-rot">Além do essencial</span><b class="gs-num ${num(e.alemDoEssencial) && e.alemDoEssencial > 0 ? 'bad' : 'good'}">${esc(formatBRL0(e.alemDoEssencial))}</b><span class="gs-fraco">${num(e.fracaoSalario) ? `gasto = ${formatNumeroBR(e.fracaoSalario * 100, 0)}% do salário` : 'por mês'}</span></div>
    </div>
    <div class="tabela-wrap"><table class="tabela tabela-baixa gs-tab gs-ess"><thead><tr><th scope="col">Categoria (Despesas)</th><th scope="col" class="num">Cadastrado</th><th scope="col" class="num">Real/mês</th><th scope="col" class="gs-ess-barra col-opc"><span class="sr-only">Comparação</span></th></tr></thead><tbody>
    ${e.linhas.map((l) => `<tr><td>${esc(l.categoria)}</td><td class="num gs-num">${esc(formatBRL0(l.cadastrado))}</td><td class="num gs-num${num(l.diferenca) && l.diferenca > l.cadastrado * 0.1 + 20 ? ' bad' : ''}">${l.real == null ? '<span class="gs-fraco">—</span>' : esc(formatBRL0(l.real))}</td>
      <td class="gs-ess-barra col-opc"><span class="gs-eb"><span data-prog-valor="${Math.min(1, l.cadastrado / max).toFixed(4)}" data-prog-cor="2" data-prog-rotulo="Cadastrado: ${esc(l.categoria)}"></span>${l.real != null ? `<span data-prog-valor="${Math.min(1, l.real / max).toFixed(4)}" data-prog-cor="1" data-prog-rotulo="Real: ${esc(l.categoria)}"></span>` : ''}</span></td></tr>`).join('')}
    </tbody></table></div>
    <p class="gs-nota"><span class="gs-q gs-q-ess"></span>cadastrado <span class="gs-q gs-q-real"></span>real · "Real" soma as categorias de gasto equivalentes (Alimentação = mercado + restaurantes; Transporte = apps + combustível).</p>`;
}

/**
 * 05/10/2026 (auditoria A-25): arquivo que entrou com "soma não bate" (ou que parece repetir outro). Os meses dele ficam
 * marcados na cobertura e no tile do mês, em vez de carregar o erro sem destaque.
 */
export function arquivoComAviso(a) {
  return !!a && a.situacao !== 'erro' && (a.situacao === 'aviso' || !!(a.conferencia && a.conferencia.ok === false));
}
export function mesesComAviso(arquivos) {
  const m = {};
  (arquivos || []).filter(arquivoComAviso).forEach((a) => (a.meses || []).forEach((mes) => { (m[mes] = m[mes] || []).push(a); }));
  return m;
}

/**
 * 07/10/2026 (Tiago: "dê opção de remover vários de uma vez"): uma lista de arquivos com caixinha em cada um,
 * "selecionar todos" e "Remover selecionados" (o botão conta os marcados). `aberto`: <details> aberto.
 */
function htmlGrupoArquivos(lista, { titulo, chave, aberto = false, motivo = () => '', reprocessar = false, classe = '' }) {
  if (!lista.length) return '';
  const itens = lista.map((a) => `<li><label class="gs-arq-l"><input type="checkbox" class="gs-sel-arq" value="${esc(a.id)}" aria-label="Selecionar ${esc(a.nome)}"><span>${esc(a.caminho ? `${a.caminho}/` : '')}${esc(a.nome)}${motivo(a) ? ` <span class="gs-fraco">(${esc(motivo(a))})</span>` : ''}</span></label><span class="gs-acoes-mini">${reprocessar && !String(a.id).startsWith('upload:') ? `<button type="button" class="gs-mini" data-acao="reprocessar-arq" data-id="${esc(a.id)}">reprocessar</button>` : ''}<button type="button" class="gs-mini" data-acao="remover-arq" data-id="${esc(a.id)}">remover</button></span></li>`).join('');
  return `<details class="gs-arqs-grupo ${classe}" data-grupo="${esc(chave)}"${aberto ? ' open' : ''}><summary class="gs-sub-t">${titulo}</summary>
      <div class="gs-sel-barra"><label><input type="checkbox" class="gs-sel-todos"> selecionar todos</label><button type="button" class="btn btn-sm btn-outlined" data-acao="remover-sel" disabled>Remover selecionados</button></div>
      <ul>${itens}</ul></details>`;
}

export function htmlDocumentos(r, { drive = null, hoje = new Date() } = {}) {
  const cob = r.cobertura;
  const fim = cob.ultimoFechado;
  const meses = Array.from({ length: 18 }, (_, k) => somarMeses(fim, k - 17));
  const avisoFonteMes = new Set();
  (r.arquivos || []).filter(arquivoComAviso).forEach((a) => (a.meses || []).forEach((m) => avisoFonteMes.add(`${a.fonte}|${m}`)));
  const linhas = cob.fontes.map((f) => {
    const set = new Set(f.meses);
    const celulas = meses.map((m) => {
      // 07/10/2026: cartão/conta encerrado - depois do último mês não "falta" nada
      const cls = set.has(m) ? (avisoFonteMes.has(`${f.fonte}|${m}`) ? 'aviso' : 'ok') : (m < f.primeiro || (f.encerrada && m > f.ultimo) ? 'antes' : 'falta');
      const dica = { ok: 'importado', aviso: 'importado (parcial: a soma do documento não bate)', falta: 'falta', antes: f.encerrada && m > f.ultimo ? 'encerrado' : 'antes do 1º documento' }[cls];
      return `<i class="gs-cel ${cls}" title="${esc(formatMesAno(m, { anoCurto: false }))}: ${dica}"></i>`;
    }).join('');
    const faltam = f.encerrada ? 'encerrado' : (f.faltam.length ? `faltam ${f.faltam.slice(-4).map((m) => formatMesAno(m)).join(', ')}${f.faltam.length > 4 ? ` e mais ${f.faltam.length - 4}` : ''}` : 'completo');
    const toggle = `<button type="button" class="gs-mini" data-acao="fonte-encerrar" data-fonte="${esc(f.fonte)}" data-encerrada="${f.encerrada ? '0' : '1'}" title="${f.encerrada ? 'Voltar a pedir documentos deste' : 'Cancelou o cartão ou não usa mais a conta? Sai do atrasado; o histórico fica'}">${f.encerrada ? 'reativar' : 'encerrei'}</button>`;
    return `<tr${f.encerrada ? ' class="gs-encerrada"' : ''}><td><b>${esc(f.nome)}</b><span class="gs-fonte">${esc(formatMesAno(f.primeiro))} a ${esc(formatMesAno(f.ultimo))} · ${f.meses.length} meses</span></td>
      <td class="gs-cels" aria-label="Últimos 18 meses">${celulas}</td><td class="gs-faltam ${f.encerrada ? '' : (f.faltam.length ? 'warn' : 'good')}"><span>${esc(faltam)}</span> ${toggle}</td></tr>`;
  }).join('');
  const lista = drive && drive.arquivos ? drive.arquivos : [];
  const novos = arquivosNovosDrive(lista);
  const falhos = arquivosFalhosDrive(lista);
  // 03/10/2026: o que não entrou (erro). 07/10/2026: o que entrou com a soma errada (aviso) é PARCIAL - fora do "com problema"
  const problemas = (r.arquivos || []).filter((a) => a.situacao === 'erro');
  const parciais = (r.arquivos || []).filter(arquivoComAviso);
  const ordenar = (xs) => [...xs].sort((a, b) => `${a.caminho}/${a.nome}`.localeCompare(`${b.caminho}/${b.nome}`, 'pt-BR', { numeric: true }));
  const todos = ordenar((r.arquivos || []).filter((a) => a.id && a.situacao !== 'erro'));
  return `${cob.fontes.length ? `<div class="tabela-wrap"><table class="tabela tabela-baixa gs-tab gs-docs"><thead><tr><th scope="col">Documento</th><th scope="col">${esc(formatMesAno(meses[0]))} → ${esc(formatMesAno(fim))}</th><th scope="col">Situação</th></tr></thead><tbody>${linhas}</tbody></table></div>` : '<p class="gs-fraco">Nenhum documento importado ainda.</p>'}
    <p class="gs-nota"><span><i class="gs-cel ok"></i>importado</span> <span><i class="gs-cel aviso"></i>parcial</span> <span><i class="gs-cel falta"></i>falta</span> · fatura = mês do vencimento; extrato = meses do período · "encerrei" tira o cartão/conta do atrasado.${drive && drive.configurado === false ? ' <b>Não achei a pasta Documentos/Transações no Drive</b> - rode <code>configurarPastasGastosDireto()</code> uma vez no editor do Apps Script.' : ''}${drive && drive.arquivos ? ` · ${lista.length} arquivos no Drive: ${novos.length} ${novos.length === 1 ? 'novo' : 'novos'}${falhos.length ? `, ${falhos.length} com problema` : ''}.` : ''}</p>
    ${htmlGrupoArquivos(ordenar(problemas), { titulo: `Não entraram (${problemas.length})`, chave: 'problemas', aberto: true, motivo: (a) => a.problema || 'não entrou', reprocessar: true, classe: 'gs-problemas' })}
    ${htmlGrupoArquivos(ordenar(parciais), { titulo: `Entraram parcialmente (${parciais.length}) <span class="gs-fraco">- as compras entraram; só o total do documento não bate</span>`, chave: 'parciais', motivo: (a) => (a.conferencia && a.conferencia.ok === false ? `diferença ${formatBRL(a.conferencia.diferenca)}` : ''), reprocessar: true, classe: 'gs-parciais' })}
    ${htmlGrupoArquivos(todos, { titulo: `Todos os arquivos importados (${todos.length})`, chave: 'todos', classe: 'gs-todos-arqs' })}
    <div class="gs-acoes"><button type="button" class="btn" data-acao="${novos.length ? 'importar-novos' : 'drive'}">${novos.length ? `Importar ${novos.length} novo${novos.length > 1 ? 's' : ''} do Drive` : 'Procurar novos no Drive'}</button>${falhos.length ? `<button type="button" class="btn" data-acao="importar-falhos">${falhos.length === 1 ? 'Tentar de novo o que falhou' : `Tentar de novo só os ${falhos.length} que falharam`}</button>` : ''}<button type="button" class="btn" data-acao="arquivo">Importar do computador</button></div>`;
}

const ERRO_DRIVE_HUMANO = 'Não consegui ver as pastas do Drive agora. Tente de novo em instantes.';

/** Painel de importação: banner de novos, progresso, pedido de senha, resultado. */
export function htmlPainel(est) {
  const partes = [];
  const d = est.drive;
  // 06/10/2026 (Onda 3): texto humano + o texto técnico recolhido num <details> (A-60/A-61)
  if (d && d.erro && !est.importacao) partes.push(`<div class="gs-painel gs-aviso-bad"><span>${esc(d.erro)}${d.detalhe ? `<details class="gs-detalhe"><summary>Detalhes técnicos</summary><code>${esc(d.detalhe)}</code></details>` : ''}</span><button type="button" class="gs-mini" data-acao="fechar-drive">fechar</button></div>`);
  if (d && d.arquivos && !est.importacao && !est.dispensado) {
    const novos = arquivosNovosDrive(d.arquivos);
    const falhos = arquivosFalhosDrive(d.arquivos);
    if (novos.length || falhos.length) {
      const porBanco = {};
      novos.forEach((a) => { const k = a.banco || a.caminho; porBanco[k] = (porBanco[k] || 0) + 1; });
      const titulo = novos.length
        ? `<b>${novos.length} arquivo${novos.length > 1 ? 's' : ''} novo${novos.length > 1 ? 's' : ''} no Drive</b><span class="gs-fraco"> · ${esc(Object.entries(porBanco).map(([k, n]) => `${k} ${n}`).join(' · '))}${falhos.length ? ` · ${falhos.length} com problema` : ''}</span>`
        : `<b>${falhos.length} arquivo${falhos.length > 1 ? 's' : ''} do Drive com problema</b><span class="gs-fraco"> · os que já entraram não são lidos de novo</span>`;
      partes.push(`<div class="gs-painel gs-novos"><div>${titulo}</div>
        <div class="gs-acoes">${novos.length ? '<button type="button" class="btn btn-filled" data-acao="importar-novos">Importar agora</button>' : ''}${falhos.length ? `<button type="button" class="btn${novos.length ? '' : ' btn-filled'}" data-acao="importar-falhos">Tentar de novo só os que falharam</button>` : ''}<button type="button" class="gs-mini" data-acao="dispensar">depois</button></div></div>`);
    }
  }
  // 05/10/2026 (Tiago, P3): se a releitura da planilha falhar (rede, Apps Script), o que acabou de entrar fica na tela e avisa
  if (est.falhaAtualizar) partes.push(`<div class="gs-painel gs-aviso-bad" role="status"><span>${est.pendenteSync ? 'O que você acabou de importar está na tela, mas ainda não consegui confirmar com a planilha' : 'Não consegui atualizar os gastos com a planilha agora'} (${esc(est.falhaAtualizar)}). Tentando de novo sozinho.</span><button type="button" class="gs-mini" data-acao="recarregar">Tentar agora</button></div>`);
  // 05/10/2026 (A-35): a resposta padrão traz só os últimos 12 meses; "Tudo"/meses antigos buscam o resto
  if (est.ampliando) partes.push('<div class="gs-painel" role="status"><span class="gs-fraco">Carregando o histórico completo…</span></div>');
  const imp = est.importacao;
  if (imp) {
    const ok = imp.log.filter((x) => x.status === 'ok' || x.status === 'aviso').length;
    const falhasDrive = imp.fim ? imp.log.filter((x) => x.drive && (x.status === 'erro' || x.status === 'aviso')).length : 0;
    partes.push(`<div class="gs-painel gs-imp"><div class="gs-imp-cab"><b>${imp.fim ? `Importação concluída: ${ok} de ${imp.total} arquivo${imp.total > 1 ? 's' : ''}` : `Importando ${Math.min(imp.log.length + 1, imp.total)} de ${imp.total}…`}</b>${imp.atual && !imp.fim ? `<span class="gs-fraco">${esc(imp.atual)}</span>` : ''}${imp.fim ? '<button type="button" class="gs-mini" data-acao="fechar-imp">fechar</button>' : ''}</div>
      <div class="gs-prog" data-prog-valor="${Math.min(1, imp.log.length / Math.max(1, imp.total)).toFixed(4)}" data-prog-cor="1" data-prog-rotulo="Arquivos importados"></div>
      ${imp.log.length ? `<ul class="gs-log">${imp.log.map((x) => `<li class="${x.status}"><span class="gs-log-i" aria-hidden="true">${x.status === 'ok' ? '✓' : x.status === 'aviso' ? '!' : x.status === 'pulado' ? '–' : '✕'}</span><span class="gs-log-n">${esc(x.nome)}</span><span class="gs-log-m">${esc(x.msg)}</span></li>`).join('')}</ul>` : ''}
      ${falhasDrive ? `<div class="gs-acoes gs-imp-acoes"><button type="button" class="btn" data-acao="importar-falhos">${falhasDrive === 1 ? 'Tentar de novo o que falhou' : `Tentar de novo só os ${falhasDrive} que falharam`}</button><span class="gs-fraco">os que entraram não são lidos de novo</span></div>` : ''}</div>`);
  }
  if (est.senha) {
    partes.push(`<form class="gs-painel gs-senha" data-form="senha"><div><b>${esc(est.senha.nome)}</b> está protegido por senha.${est.senha.incorreta ? ' <span class="bad">Senha incorreta - tente de novo.</span>' : ''}</div>
      <div class="gs-senha-l"><input type="password" id="gsSenha" autocomplete="off" aria-label="Senha do PDF" placeholder="Senha do PDF">
      <label class="gs-check"><input type="checkbox" id="gsLembrar"${est.senha.lembrar ? ' checked' : ''}> lembrar neste navegador</label>
      <button type="submit" class="btn btn-filled">Abrir</button><button type="button" class="gs-mini" data-acao="senha-pular">pular este</button></div>
      <p class="gs-fraco">A senha fica só aqui no navegador${est.senha.lembrar ? ' (lembrada)' : ''} - não vai pra planilha.</p></form>`);
  }
  return partes.join('');
}

export function htmlLancamentos(lista, filtro, total) {
  const cats = CATEGORIAS_GASTO.map((c) => `<option value="${c.id}"${filtro.categoria === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  return `<div class="gs-lanc-filtros"><input type="search" id="gsBusca" placeholder="Buscar descrição" value="${esc(filtro.busca)}" aria-label="Buscar descrição">
      <select id="gsFiltroCat" aria-label="Filtrar categoria"><option value="">Todas as categorias</option>${cats}<option value="__nao"${filtro.categoria === '__nao' ? ' selected' : ''}>Movimentações que não são gasto</option></select></div>
    <div class="tabela-wrap"><table class="tabela tabela-baixa gs-tab gs-lanc"><thead><tr><th scope="col">Data</th><th scope="col">Descrição</th><th scope="col">Categoria</th><th scope="col" class="num">Valor</th></tr></thead><tbody>
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
    carregarPdf = carregarPdfJs, lerPdf = extrairPaginasPdfComSenha,
    storage = (() => { try { return globalThis.localStorage || null; } catch (e) { return null; } })(),
  } = opcoes;
  const api = opcoes.api || {
    getGastos: (janela) => getGastos(token, janela), getArquivosGastos: () => getArquivosGastos(token), getArquivoGastos: (id) => getArquivoGastos(token, id),
    salvarImportacaoGastos: (a, l) => salvarImportacaoGastos(token, a, l), salvarRegraGastos: (p, c) => salvarRegraGastos(token, p, c),
    excluirArquivoGastos: (id) => excluirArquivoGastos(token, id),
  };
  // 05/10/2026 (A-35): busca de uma janela maior (histórico completo). Quem injeta `api` (organizacao.js compartilha a 1ª resposta)
  // pode não repassar parâmetros no getGastos - com token, vai direto no api-client.
  const buscarJanela = typeof api.getGastosJanela === 'function' ? api.getGastosJanela : (token ? (j) => getGastos(token, j) : (j) => api.getGastos(j));
  const win = doc.defaultView;
  const est = {
    periodo: PERIODOS.some((p) => p.id === lerLocal(storage, CHAVE_PERIODO)) ? lerLocal(storage, CHAVE_PERIODO) : '12m',
    filtroPeriodo: null, // 03/10/2026: controlador de periodo-personalizado.js (presets + "Escolher período")
    mes: null, cat: null, filtro: { busca: '', categoria: '' }, limite: 60, drive: null, importacao: null, senha: null, dispensado: false,
    falhaAtualizar: '', pendenteSync: false,
    ampliando: false, completo: false, // A-35: já tem o histórico inteiro? (a resposta padrão traz só os últimos 12 meses + 1)
  };
  let seqCarga = 0; let cargaAplicada = 0; let tentativasCarga = 0; let timerCarga = null;
  let dados = null; let resumo = null; let desp = despesas;
  let resolverSenha = null;

  function esqueleto() {
    raiz.innerHTML = `<div class="gs-conteudo">
      <div class="gs-topo"><div class="gs-titulo"><h2>Gastos</h2><span class="gs-hint">faturas do cartão e extratos da conta · pagamento de fatura e transferências entre suas contas não contam</span></div><div class="gs-filtros" id="gsFiltros"></div></div>
      <div id="gsPainel" aria-live="polite"></div>
      <section class="gs-hero" id="gsHero" aria-label="Resumo dos gastos"></section>
      <div id="gsCorpo">
        <div class="gs-duas">
          <section class="card gs-pad"><div class="gs-card-cab"><h3>Por categoria</h3><span class="gs-hint" id="gsCatHint"></span></div><div id="gsCats"></div><div id="gsCatLista"></div></section>
          <section class="card gs-pad"><div class="gs-card-cab"><h3>Mês a mês</h3><span class="gs-hint">cartão e conta</span></div>
            <div class="gs-grafico" data-grafico="evol" id="gsGEvol"></div>
            <p class="gs-nota" id="gsEvolNota"></p></section>
        </div>
        <section class="card gs-pad"><div class="gs-card-cab"><h3>Essencial x real</h3><span class="gs-hint">despesas cadastradas x o que os documentos mostram</span></div><div id="gsEss"></div></section>
        <div class="gs-duas">
          <section class="card gs-pad"><div class="gs-card-cab"><h3>Assinaturas e gastos fixos</h3><span class="gs-hint">mesma descrição, valor parecido, mês após mês</span></div><div id="gsRec"></div></section>
          <section class="card gs-pad"><div class="gs-card-cab"><h3>Parcelamentos em aberto</h3><span class="gs-hint">o que já está comprometido nas próximas faturas</span></div><div id="gsParc"></div></section>
        </div>
        <div class="gs-duas">
          <section class="card gs-pad"><div class="gs-card-cab"><h3>Maiores lançamentos</h3><span class="gs-hint">fora os gastos fixos</span><span class="gs-hint" id="gsMaioresHint"></span></div><div id="gsMaiores"></div></section>
          <section class="card gs-pad"><div class="gs-card-cab"><h3>Documentos</h3><span class="gs-hint">meses importados e os que faltam</span></div><div id="gsDocs"></div></section>
        </div>
        <details class="card gs-pad gs-det" id="gsDetLanc"><summary><h3>Todos os lançamentos do período</h3><span class="gs-hint" id="gsLancHint"></span></summary><div id="gsLanc"></div></details>
      </div>
      <input type="file" id="gsArquivo" accept="application/pdf,.pdf,.csv,.ofx,text/csv" multiple hidden>
    </div>`;
    tornarRecolhiveis(raiz, { seletor: 'section.gs-pad', cabecalho: '.gs-card-cab', abertasNoCelular: 2, doc });
    ligar();
  }

  /** Desenha `spec` na caixa (cria na 1ª vez e morfa depois); sem spec, limpa. */
  function desenharGrafico(sel, spec) {
    const box = raiz.querySelector(sel);
    if (!box) return;
    if (!spec) { limparGrafico(box); box.textContent = ''; return; }
    montarGrafico(box, spec);
  }

  function recalcular() {
    resumo = resumoGastos({ lancamentos: dados ? dados.lancs : [], regras: dados ? dados.regras : [], arquivos: dados ? dados.arquivos : [], fontesEncerradas: dados ? dados.fontesEncerradas : [] }, { periodo: est.periodo, mesEscolhido: est.mes, hoje, despesas: desp });
    resumo.arquivos = dados ? dados.arquivos : [];
    resumo.primeiroMes = dados && dados.janela ? dados.janela.primeiroMes : null; // até onde dá pra voltar (A-35)
  }

  /**
   * 05/10/2026 (A-35): o que a tela pede (período, mês de referência e os 12 meses antes dele, pra média) começa antes da
   * janela carregada? Então busca o histórico completo (1 chamada; o servidor guarda 6 h).
   */
  function precisaMaisHistorico() {
    const j = dados && dados.janela;
    if (!j || j.completo || est.ampliando || !j.primeiroMes) return false;
    if (!resumo || est.ampliarFalhouEm === JSON.stringify([est.periodo, est.mes])) return false; // falhou pra esse pedido: só tenta de novo quando o período/mês mudar
    const mesRef = resumo.vazio ? j.ultimoMes : resumo.mesRef;
    let necessario = somarMeses(mesRef, -12);
    const per = est.periodo;
    if (per === 'tudo' || resumo.vazio) necessario = j.primeiroMes;
    else if (per === 'ano') necessario = necessario < `${mesRef.slice(0, 4)}-01` ? necessario : `${mesRef.slice(0, 4)}-01`;
    else if (per && typeof per === 'object') {
      const ini = String(per.inicio) <= String(per.fim) ? per.inicio : per.fim;
      if (String(ini).slice(0, 7) < necessario) necessario = String(ini).slice(0, 7);
    }
    if (necessario < j.primeiroMes) necessario = j.primeiroMes;
    return necessario < j.de;
  }

  async function ampliarHistorico() {
    if (est.ampliando) return;
    est.ampliando = true;
    desenharPainel();
    let r;
    try { r = await buscarJanela({ de: 'tudo' }); } catch (e) { r = { ok: false, erro: String(e) }; }
    est.ampliando = false;
    if (!r || !r.ok) est.ampliarFalhouEm = JSON.stringify([est.periodo, est.mes]);
    if (r && r.ok) {
      est.completo = !r.janela || !!r.janela.completo;
      dados = { lancs: objetosLancamentos(r), regras: r.regras || [], arquivos: r.arquivos || [], janela: r.janela || null, fontesEncerradas: r.fontesEncerradas || [] };
    }
    desenhar(); // sem sucesso: segue com a janela que tem (não tenta de novo sozinho - mudar de período tenta)
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

  function desenharPainel() { const p = raiz.querySelector('#gsPainel'); if (p) { p.innerHTML = htmlPainel(est); montarBarrasProgresso(p); } const s = raiz.querySelector('#gsSenha'); if (s && est.senha && !est.senha.focado) { est.senha.focado = true; try { s.focus(); } catch (e) { /* ok */ } } }

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
    box.innerHTML = `<div class="gs-cat-lista"><p class="gs-sub-t">${esc(NOME_CATEGORIA[est.cat])} · ${itens.length} lançamentos</p><div class="tabela-wrap"><table class="tabela tabela-baixa gs-tab gs-lanc"><tbody>${itens.slice(0, 15).map((x) => linhaLancamento(x.l, x.i)).join('')}</tbody></table></div>${itens.length > 15 ? `<p class="gs-fraco">e mais ${itens.length - 15} - veja em "Todos os lançamentos".</p>` : ''}</div>`;
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
      try { est.filtroPeriodo.definirLimites({ min: `${r.primeiroMes || r.meses[0]}-01`, max: isoHoje(hoje) }); } catch (e) { /* ok */ }
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
    montarComposicoes(raiz.querySelector('#gsHero'), (v) => formatBRL0(v));
    raiz.querySelector('#gsHero').classList.toggle('gs-hero-v', !!r.vazio);
    raiz.querySelector('#gsCorpo').hidden = !!r.vazio;
    desenharPainel();
    if (r.vazio) { if (precisaMaisHistorico()) ampliarHistorico(); return; }
    raiz.querySelector('#gsCatHint').textContent = rotuloPeriodo(r);
    raiz.querySelector('#gsCats').innerHTML = htmlCategorias(r, est.cat);
    montarBarrasProgresso(raiz.querySelector('#gsCats'));
    desenharCatLista();
    const evol = r.periodo === 'mes' ? r.porMesTodos.filter((m) => m.mes > somarMeses(r.mesRef, -12) && m.mes <= r.mesRef) : r.porMes;
    const mediaEvol = r.periodo === 'mes' ? r.media12 : r.media;
    desenharGrafico('#gsGEvol', opcoesEvolucaoGastos(evol, { media: mediaEvol, destaque: r.periodo === 'mes' ? r.mesRef : null }));
    const notaEvol = raiz.querySelector('#gsEvolNota');
    if (notaEvol) notaEvol.textContent = num(mediaEvol) && mediaEvol > 0 ? `Média do período: ${formatBRL0(mediaEvol)} por mês.` : '';
    raiz.querySelector('#gsEss').innerHTML = htmlEssenciais(r);
    montarBarrasProgresso(raiz.querySelector('#gsEss'));
    raiz.querySelector('#gsRec').innerHTML = htmlRecorrentes(r);
    raiz.querySelector('#gsParc').innerHTML = htmlParcelas(r);
    if (r.parcelas.porMes.length) desenharGrafico('#gsGParc', opcoesParcelasGastos(r.parcelas.porMes));
    raiz.querySelector('#gsMaiores').innerHTML = htmlMaiores(r);
    raiz.querySelector('#gsMaioresHint').textContent = rotuloPeriodo(r);
    raiz.querySelector('#gsDocs').innerHTML = htmlDocumentos(r, { drive: est.drive, hoje });
    desenharLancamentos();
    if (precisaMaisHistorico()) ampliarHistorico();
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

  /**
   * Um arquivo (bytes + metadados) -> documento lido. 03/10/2026: o leitor
   * de PDF devolve as páginas com posição (extrairPaginasPdfComSenha); um
   * leitor injetado que devolva linhas de texto continua valendo.
   */
  async function lerUmArquivo({ nome, bytes, banco, origem }) {
    const ext = String(nome).split('.').pop().toLowerCase();
    if (ext === 'csv') return lerCsvGastos(new TextDecoder('utf-8').decode(bytes), { nome });
    if (ext === 'ofx') return lerOfxGastos(new TextDecoder('latin1').decode(bytes));
    const lido = await abrirPdf(bytes, nome);
    const comPosicao = Array.isArray(lido) && lido.length && lido[0] && typeof lido[0] === 'object' && Array.isArray(lido[0].itens);
    return lerDocumentoGasto(comPosicao ? { paginas: lido } : juntarAcentos(lido), { banco, origem, nome });
  }

  function lancamentosParaSalvar(docLido) {
    const rp = prepararRegras(dados ? dados.regras : []);
    const lancs = (docLido.lancamentos || []).filter((l) => l.mes && l.data && num(l.valor));
    const chaves = chavesDedup(docLido.fonte, lancs);
    return lancs.map((l, i) => ({ ...l, origem: docLido.origem, fonte: docLido.fonte, categoria: categorizar(l, rp), chaveDedup: chaves[i] }));
  }

  /**
   * 05/10/2026 (Tiago, P3: depois de importar, a seção voltava ao "Seus gastos aparecem aqui" até dar reload): o que a
   * planilha acabou de gravar entra na tela na hora, sem esperar a releitura - se ela falhar (rede, Apps Script
   * ocupado), a tela continua certa e a releitura é refeita sozinha. O arquivo reimportado substitui o dele.
   */
  function aplicarSalvo(meta, lancs) {
    if (!dados) dados = { lancs: [], regras: [], arquivos: [] };
    dados.lancs = dados.lancs.filter((l) => l.arquivo !== meta.id).concat(lancs.map((l) => ({
      mes: l.mes, data: l.data, origem: l.origem, fonte: l.fonte, descricao: l.descricao, categoria: l.categoria,
      valor: l.valor, tipo: l.tipo, parcela: l.parcela || '', arquivo: meta.id,
    })));
    dados.arquivos = dados.arquivos.filter((a) => a.id !== meta.id).concat([{
      id: meta.id, nome: meta.nome, caminho: meta.caminho, fonte: meta.fonte, modificado: meta.modificado, meses: meta.meses,
      lancamentos: lancs.length, total: meta.total, conferencia: meta.conferencia, entradas: meta.entradas,
      situacao: meta.situacao, problema: meta.problema, importadoEm: new Date().toISOString(),
    }]);
    est.pendenteSync = true;
  }

  async function importarLista(itens) {
    est.importacao = { total: itens.length, log: [], atual: '', fim: false };
    est.dispensado = true;
    desenharPainel();
    let ignoradasTotal = 0; // 06/10/2026: linhas que a planilha já tinha (outro arquivo cobrindo o mesmo dia) e foram ignoradas
    for (const it of itens) {
      const nome = it.caminho ? `${it.caminho}/${it.nome}` : it.nome;
      est.importacao.atual = nome;
      desenharPainel();
      let status = 'ok'; let msg = '';
      const doDrive = !it.bytes; // do computador não dá pra "tentar de novo" sozinho
      let modificado = it.modificado || '';
      let fonte = '';
      try {
        let bytes = it.bytes;
        if (!bytes) {
          const r = await api.getArquivoGastos(it.id);
          if (!r || !r.ok || !r.base64) throw new Error((r && r.erro) || 'o arquivo não veio do Drive');
          bytes = base64ParaBytes(r.base64);
          modificado = r.modificado || modificado;
        }
        const lido = await lerUmArquivo({ nome: it.nome, bytes, banco: it.banco, origem: it.origem });
        fonte = lido.fonte || '';
        if (lido.erro || !(lido.lancamentos || []).length) throw new Error(lido.erro || (lido.avisos || []).join(' ') || 'nenhum lançamento encontrado');
        const lancs = lancamentosParaSalvar(lido);
        const c = lido.conferencia;
        const problema = c && c.ok === false ? `soma não bate: li ${formatBRL(c.lido)}, o documento diz ${formatBRL(c.esperado)} (diferença ${formatBRL(c.diferenca)})` : '';
        const meta = {
          id: it.id, nome: it.nome, caminho: it.caminho || '', fonte: lido.fonte, modificado,
          meses: mesesDoDocumento(lido), total: lido.total, conferencia: lido.conferencia, entradas: lido.entradas,
          situacao: problema ? 'aviso' : 'ok', problema,
        };
        const s = await api.salvarImportacaoGastos(meta, lancs);
        if (!s || !s.ok) throw Object.assign(new Error(`não salvou: ${(s && s.erro) || 'sem resposta'}`), { naoSalvou: true });
        aplicarSalvo(meta, lancs);
        const meses = meta.meses.length > 1 ? `${formatMesAno(meta.meses[0])}–${formatMesAno(meta.meses[meta.meses.length - 1])}` : formatMesAno(meta.meses[0]);
        const ign = Number(s.ignoradasDuplicadas != null ? s.ignoradasDuplicadas : s.pulados) || 0;
        ignoradasTotal += ign;
        msg = `${NOME_FONTE[lido.fonte] || lido.fonte} ${meses} · ${s.gravados} lançamentos${ign ? ` · ${ign === 1 ? '1 linha já estava na planilha e foi ignorada' : `${ign} linhas já estavam na planilha e foram ignoradas`}` : ''}`;
        if (problema) { status = 'aviso'; msg += ` · ${problema}`; } else if (c && c.ok) msg += ' · soma confere';
        if ((lido.avisos || []).length) msg += ` · ${lido.avisos.join(' ')}`;
      } catch (e) {
        status = e && e.pulado ? 'pulado' : 'erro';
        msg = String((e && e.message) || e);
        // 03/10/2026: a falha fica registrada (sem lançamento) - "Importar novos" não insiste nela
        if (status === 'erro' && doDrive && !e.naoSalvou) {
          try { await api.salvarImportacaoGastos({ id: it.id, nome: it.nome, caminho: it.caminho || '', fonte, modificado, situacao: 'erro', problema: msg }, []); } catch (e2) { /* fica como novo */ }
        }
      }
      est.importacao.log.push({ nome, status, msg, drive: doDrive, id: it.id });
      desenharPainel();
    }
    est.importacao.fim = true;
    est.importacao.atual = '';
    if (ignoradasTotal) toast(ignoradasTotal === 1 ? '1 linha já estava na planilha e foi ignorada.' : `${ignoradasTotal} linhas já estavam na planilha e foram ignoradas.`, { tipo: 'info', doc });
    if (dados) desenhar(); // o que entrou já aparece, antes da releitura
    await carregar({ comDrive: true });
  }

  /** `importar`: false | true/'novos' (nunca tentados ou mudados no Drive) | 'falhos' (só os que deram erro/aviso). */
  async function procurarDrive({ importar = false } = {}) {
    let r;
    try { r = await api.getArquivosGastos(); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) est.drive = { erro: ERRO_DRIVE_HUMANO, detalhe: String((r && r.erro) || 'erro') };
    else est.drive = { configurado: r.configurado !== false, arquivos: r.arquivos || [] };
    if (importar && est.drive.arquivos) {
      const lista = importar === 'falhos' ? arquivosFalhosDrive(est.drive.arquivos) : arquivosNovosDrive(est.drive.arquivos);
      if (lista.length) { await importarLista(lista); return; }
    }
    if (dados) desenhar(); else desenharPainel();
  }

  /** 05/10/2026 (A-25): lê de novo UM arquivo do Drive (o que entrou com aviso ou não entrou), sem mexer nos outros. */
  /** 07/10/2026: "Remover selecionados" de um grupo (confirmar() + 1 chamada só). */
  async function removerSelecionados(b) {
    const grupo = b.closest('.gs-arqs-grupo');
    const ids = grupo ? [...grupo.querySelectorAll('.gs-sel-arq:checked')].map((c) => c.value) : [];
    if (!ids.length) return;
    const ok = await confirmar({
      titulo: ids.length === 1 ? 'Remover este arquivo?' : `Remover ${ids.length} arquivos?`,
      mensagem: 'Os lançamentos que vieram deles saem da lista. Os originais no Drive não são apagados - se continuarem na pasta, voltam a aparecer como novos.',
      confirmarTexto: 'Remover', perigo: true, doc,
    });
    if (!ok) return;
    b.disabled = true;
    let falhou = false;
    try {
      if (typeof api.excluirArquivosGastos === 'function') {
        const r = await api.excluirArquivosGastos(ids);
        falhou = !r || r.ok === false;
      } else {
        for (const id of ids) await api.excluirArquivoGastos(id); // eslint-disable-line no-await-in-loop
      }
    } catch (e) { falhou = true; }
    toast(falhou ? 'Não consegui remover agora. Veja se eles sumiram da lista.' : `${ids.length === 1 ? 'Arquivo removido' : `${ids.length} arquivos removidos`}.`, { tipo: falhou ? 'erro' : 'info', doc });
    await carregar();
  }

  /** 07/10/2026 (Tiago: OuroCard cancelado, Bradesco sem uso): "encerrei"/"reativar" na tabela de documentos. */
  async function marcarFonte(b) {
    if (typeof api.salvarFontesGastos !== 'function') return;
    const fonte = b.dataset.fonte;
    const encerrada = b.dataset.encerrada === '1';
    const atual = new Set((dados && dados.fontesEncerradas) || []);
    if (encerrada) atual.add(fonte); else atual.delete(fonte);
    b.disabled = true;
    let r;
    try { r = await api.salvarFontesGastos([...atual]); } catch (e) { r = { ok: false }; }
    if (!r || !r.ok) { b.disabled = false; toast('Não consegui salvar agora. Tente de novo em instantes.', { tipo: 'erro', doc }); return; }
    if (dados) { dados.fontesEncerradas = r.fontesEncerradas || [...atual]; desenhar(); }
    toast(encerrada ? `${NOME_FONTE[fonte] || fonte}: encerrado - não entra mais em "atrasado".` : `${NOME_FONTE[fonte] || fonte}: reativado.`, { tipo: 'info', doc });
    await carregar();
  }

  async function reprocessarArquivo(id) {
    if (!(est.drive && est.drive.arquivos)) await procurarDrive();
    const f = ((est.drive && est.drive.arquivos) || []).find((a) => a.id === id);
    if (f) await importarLista([f]);
    else { est.drive = { ...(est.drive || {}), erro: 'Esse arquivo não está mais nas pastas do Drive.' }; if (dados) desenhar(); else desenharPainel(); }
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


  function ligar() {
    raiz.addEventListener('click', async (ev) => {
      const per = !est.filtroPeriodo && ev.target.closest('[data-periodo]');
      if (per) { est.periodo = per.dataset.periodo; gravarLocal(storage, CHAVE_PERIODO, est.periodo); est.limite = 60; desenhar(); return; }
      const cat = ev.target.closest('[data-cat]');
      if (cat) { est.cat = est.cat === cat.dataset.cat ? null : cat.dataset.cat; raiz.querySelector('#gsCats').innerHTML = htmlCategorias(resumo, est.cat); montarBarrasProgresso(raiz.querySelector('#gsCats')); desenharCatLista(); return; }
      const b = ev.target.closest('[data-acao]');
      if (!b || !raiz.contains(b)) return;
      const acao = b.dataset.acao;
      if (acao === 'mes-ant' || acao === 'mes-prox') {
        est.mes = somarMeses(resumo.mesRef, acao === 'mes-ant' ? -1 : 1);
        // 05/10/2026 (A-35): voltar além da janela carregada (e dos 12 meses de margem da média) busca o histórico completo antes
        if (dados && dados.janela && !dados.janela.completo && somarMeses(est.mes, -12) < dados.janela.de) { await ampliarHistorico(); return; }
        if (est.periodo !== 'mes' && est.periodo !== 'ano' && est.periodo !== 'tudo') { /* mantém a janela, ancorada no mês */ }
        desenhar();
      } else if (acao === 'drive') await procurarDrive({ importar: !!(est.drive && est.drive.arquivos) });
      else if (acao === 'importar-novos') await procurarDrive({ importar: 'novos' });
      else if (acao === 'importar-falhos') { est.importacao = null; await procurarDrive({ importar: 'falhos' }); }
      else if (acao === 'reprocessar-arq') await reprocessarArquivo(b.dataset.id);
      else if (acao === 'arquivo') raiz.querySelector('#gsArquivo').click();
      else if (acao === 'recarregar') { tentativasCarga = 0; await carregar({ comDrive: true }); }
      else if (acao === 'dispensar') { est.dispensado = true; desenharPainel(); }
      else if (acao === 'fechar-imp') { est.importacao = null; desenharPainel(); }
      else if (acao === 'fechar-drive') { est.drive = null; desenharPainel(); }
      else if (acao === 'senha-pular') { const r = resolverSenha; resolverSenha = null; est.senha = null; desenharPainel(); if (r) r(null); }
      else if (acao === 'mais') { est.limite += 100; desenharLancamentos(); }
      else if (acao === 'remover-sel') await removerSelecionados(b);
      else if (acao === 'fonte-encerrar') await marcarFonte(b);
      else if (acao === 'remover-arq') {
        // 06/10/2026 (A-62): confirmar() em vez de apagar direto; toast() com o resultado
        const ok = await confirmar({ titulo: 'Remover este arquivo?', mensagem: 'Os lançamentos que vieram dele saem da lista. O arquivo original no Drive não é apagado.', confirmarTexto: 'Remover', perigo: true, doc });
        if (!ok) return;
        b.disabled = true;
        let falhou = false;
        try { await api.excluirArquivoGastos(b.dataset.id); } catch (e) { falhou = true; }
        toast(falhou ? 'Não consegui remover agora. Veja se ele sumiu da lista.' : 'Arquivo removido.', { tipo: falhou ? 'erro' : 'info', doc });
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
      // 07/10/2026: seleção pra "Remover selecionados" (o botão conta os marcados do grupo)
      if (t.classList && (t.classList.contains('gs-sel-arq') || t.classList.contains('gs-sel-todos'))) {
        const grupo = t.closest('.gs-arqs-grupo');
        if (!grupo) return;
        if (t.classList.contains('gs-sel-todos')) grupo.querySelectorAll('.gs-sel-arq').forEach((c) => { c.checked = t.checked; });
        const caixas = [...grupo.querySelectorAll('.gs-sel-arq')];
        const n = caixas.filter((c) => c.checked).length;
        const todos = grupo.querySelector('.gs-sel-todos');
        if (todos) { todos.checked = n > 0 && n === caixas.length; todos.indeterminate = n > 0 && n < caixas.length; }
        const btn = grupo.querySelector('[data-acao="remover-sel"]');
        if (btn) { btn.disabled = !n; btn.textContent = n ? `Remover ${n} selecionado${n > 1 ? 's' : ''}` : 'Remover selecionados'; }
        return;
      }
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
  }

  /** Nova releitura sozinha (3 tentativas, 4 s / 8 s / 12 s) enquanto a última falhou ou o que entrou ainda não foi confirmado. */
  function agendarNovaTentativa() {
    if (timerCarga || tentativasCarga >= 3) return;
    tentativasCarga += 1;
    const t = setTimeout(() => { timerCarga = null; carregar({ comDrive: false, automatica: true }); }, 4000 * tentativasCarga);
    if (t && typeof t.unref === 'function') t.unref();
    timerCarga = t;
  }

  async function carregar({ comDrive = false, automatica = false } = {}) {
    const meu = seqCarga += 1;
    const pDrive = comDrive || !est.drive ? api.getArquivosGastos().catch((e) => ({ ok: false, erro: String(e) })) : null;
    let r;
    try { r = await api.getGastos(est.completo ? { de: 'tudo' } : undefined); } catch (e) { r = { ok: false, erro: String(e) }; }
    // 05/10/2026: resposta velha (pedida antes de uma releitura mais nova que já chegou) não sobrescreve a tela
    if (meu < cargaAplicada) return;
    if (!r || !r.ok) {
      if (!dados) { mostrarErroCarga(raiz, { tela: 'Gastos reais', resposta: r, aoTentar: () => carregar({ comDrive: true }), doc }); return; } // 06/10/2026 (A-60/A-61): texto humano + "Tentar de novo"
      est.falhaAtualizar = String((r && (r.erro || r.etapa)) || 'erro desconhecido').slice(0, 120);
      desenharPainel();
      agendarNovaTentativa();
      return;
    }
    cargaAplicada = meu;
    est.falhaAtualizar = ''; est.pendenteSync = false; tentativasCarga = 0;
    if (timerCarga) { clearTimeout(timerCarga); timerCarga = null; }
    dados = { lancs: objetosLancamentos(r), regras: r.regras || [], arquivos: r.arquivos || [], janela: r.janela || null, fontesEncerradas: r.fontesEncerradas || [] };
    est.completo = !r.janela || !!r.janela.completo; // já tem o histórico inteiro? (resposta sem `janela` = tudo)
    desenhar();
    if (pDrive && !automatica) {
      const d = await pDrive;
      if (d && d.ok) est.drive = { configurado: d.configurado !== false, arquivos: d.arquivos || [] };
      else if (d) est.drive = { erro: ERRO_DRIVE_HUMANO, detalhe: String(d.erro || 'erro') };
      desenhar();
    }
  }

  raiz.innerHTML = '<div class="og-carregando" aria-hidden="true"><span class="skel skel-bloco og-skel-150"></span><span class="skel skel-bloco og-skel-320"></span></div>';
  const pronto = carregar({ comDrive: true });
  // 03/10/2026: painel Documentos ("Enviar arquivo" de faturas/extratos) manda os arquivos pra cá
  doc.addEventListener(EVENTO_ARQUIVOS_GASTOS, (ev) => {
    const arqs = ev && ev.detail && ev.detail.arquivos;
    if (!arqs || !arqs.length) return;
    ev.detail.recebido = true;
    (async () => {
      await pronto;
      const p = raiz.querySelector('#gsPainel');
      if (p && p.scrollIntoView) { try { p.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* ok */ } }
      await lerArquivos([...arqs]);
    })();
  });
  return {
    pronto,
    recarregar: () => carregar({ comDrive: true }),
    /** A aba Gastos e Despesas voltou a aparecer: refaz o desenho (os gráficos medem a largura) e relê se a última releitura falhou ou a tela está vazia. */
    aoMostrar() {
      if (!dados) return;
      desenhar();
      if (est.falhaAtualizar || est.pendenteSync || !dados.lancs.length) { tentativasCarga = 0; carregar({ comDrive: false, automatica: true }); }
    },
    atualizarDespesas(d) { desp = d; if (dados) desenhar(); },
    importarNovos: () => procurarDrive({ importar: 'novos' }),
    importarFalhos: () => procurarDrive({ importar: 'falhos' }),
    lerArquivos,
    get dados() { return dados; },
    get resumo() { return resumo; },
  };
}

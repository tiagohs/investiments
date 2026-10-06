/**
 * organizacao.js - 26/09/2026: tela Organização Financeira (organizacao/despesas.html).
 *
 * Tiago: "quero ter uma relação dos meus gastos, pra me auxiliar na ideia de
 * quantos eu preciso ter na renda emergencial... adicionar novas despesas ou
 * remover, isso influencia na soma e na meta da renda emergencial, tudo tem
 * que estar bem conectado".
 *
 * A tela trabalha num RASCUNHO: editar/adicionar/remover mexe só na tela, e
 * tudo (cartões do topo, conta da meta, categorias, salário) já mostra o
 * efeito na hora - o simulador. "Salvar alterações" grava a lista inteira de
 * uma vez (Despesas.gs, salvarDespesas); a planilha recalcula a média de
 * gastos da Distribuição e Metas, a meta da reserva e o patrimônio desejado.
 * Contas em organizacao-calc.js (sem DOM).
 *
 * 03/10/2026 - reorganização (Tiago: "Reorganizar conteúdo das três abas
 * atuais e renomear ... eu tenho que saber quais documentos preciso enviar
 * mensalmente ou de vez em quando, e o que dá pra ser automatizado"):
 *  - Patrimônio (#patrimonio, a 1ª): organizacao-patrimonio.js - sem o
 *    simulador de dívidas e sem Carreira/FGTS; + Patrimônio vs. inflação.
 *  - Gastos e Despesas (#despesas, #gastos): as despesas essenciais "para a
 *    renda de emergência" (esta tela) e os gastos reais das faturas/extratos
 *    (organizacao-gastos.js), com um link pra Simulações.
 *  - Renda e Orçamentos (#renda, #salario): a seção Renda
 *    (organizacao-renda.js: salário pelo IR e crescimento, quanto investe do
 *    salário, contas do IR), Carreira e FGTS (montarCarreiraFgts) e o
 *    orçamento do salário (organizacao-salario.js).
 *  - Simulações (#simulacoes, #simulador; 03/10/2026 - Tiago: "Eu senti que
 *    Gastos e Despesas ficou muito grande.. jogue tudo que tem a parte de
 *    simulações ... pra uma nova aba"): herói (ritmo, primeiro milhão, viés
 *    amortizar × investir, quitação) + o simulador inteiro
 *    (organizacao-simulacoes.js + organizacao-simulador.js).
 *  - Documentos (organizacao-documentos.js): painel no topo, pras 4 abas.
 * As respostas do getPatrimonio, getSalario e getGastos são carregadas UMA
 * vez e compartilhadas (criarCarregador) entre as abas e o painel; cada
 * pedaço só se monta quando a aba dele abre.
 */
import {
  getDespesas, salvarDespesas, getPatrimonio, getSalario, getArquivosHolerites, getGastos, getArquivosGastos, getArquivoGastos,
  salvarImportacaoGastos, salvarRegraGastos, excluirArquivoGastos, excluirArquivosGastos, salvarFontesGastos, getMacro,
} from '../api-client.js';
import { mountRefreshControl } from '../shell.js';
import { montarCabecalhoPagina, criarTabs, mostrarErroCarga, definirTituloPagina, toast } from '../ui/index.js'; // 06/10/2026 (Onda 3): cabeçalho, abas em pílula e erro de carga padrão do kit
import { lerCacheDados, gravarCacheDados } from '../cache-dados.js';
import { formatBRL, formatNumeroBR, formatDateBR, formatPct } from '../format.js';
import {
  CATEGORIAS, SEM_CATEGORIA, categoriaSugerida, lerValorBR, mensalDespesa, calcularOrganizacao, rascunhoDoServidor,
  novoItemDespesa, estadoItem, mudancasRascunho, validarRascunho, payloadRascunho, impactoRascunho,
} from './organizacao-calc.js';
import { montarAbaSalario } from './organizacao-salario.js';
import { montarAbaPatrimonio, montarCarreiraFgts, contextoPatrimonio } from './organizacao-patrimonio.js';
import { montarSecaoGastos, mensagemFalhaGastos } from './organizacao-gastos.js';
import { NOME_FONTE as NOME_FONTE_DOC } from './gastos-calc.js';
import { montarAbaSimulacoes } from './organizacao-simulacoes.js';
import { montarSecaoRenda } from './organizacao-renda.js';
import { montarPainelDocumentos } from './organizacao-documentos.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { kpiHtml, chipHtml, icoHtml, montarBarrasProgresso, tornarRecolhiveis, recolherRedesenhavel } from './organizacao-ui.js'; // 06/10/2026 (Onda 3)
import { criarGraficoLinha, criarBarraComposicao } from '../charts/index.js';


const CHAVE_CACHE = 'despesas';
const CHAVE_ORDEM = 'organizacao.ordem';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const meses = (m) => (num(m) ? `${formatNumeroBR(m, 1)} ${Math.abs(m - 1) < 0.05 ? 'mês' : 'meses'}` : '—');
const sinalBRL = (v) => (num(v) ? `${v > 0 ? '+' : v < 0 ? '−' : '±'}${formatBRL(Math.abs(v))}` : '—');
const dec = (texto) => { // "R$ 9.891,81" -> R$ 9.891<span class="dec">,81</span>
  const m = String(texto).match(/^(.*?)(,\d{2})$/);
  return m ? `${esc(m[1])}<span class="dec">${esc(m[2])}</span>` : esc(texto);
};
const dataBR = (iso) => { const t = formatDateBR(iso); return t === '—' ? '' : t; };

function lerLocal(chave) { try { return globalThis.localStorage ? globalThis.localStorage.getItem(chave) : null; } catch (e) { return null; } }
function gravarLocal(chave, v) { try { if (globalThis.localStorage) globalThis.localStorage.setItem(chave, v); } catch (e) { /* ok */ } }

// ---------------------------------------------------------------------------
// Blocos (HTML puro a partir do cálculo)
// ---------------------------------------------------------------------------

function eraHtml(antes, depois, formatar) {
  if (!num(antes) || !num(depois) || Math.round(antes * 100) === Math.round(depois * 100)) return '';
  return `<span class="og-era" title="Valor na planilha agora">era ${esc(formatar(antes))}</span>`;
}

/**
 * Os 3 números do topo (06/10/2026, Onda 3): cartões KPI do kit (.card > .kpi). As barras de progresso viram a barra da
 * biblioteca de gráficos (montarBarrasProgresso, chamado por quem pôs este HTML na página).
 */
export function htmlHero(c, base) {
  const escala = Math.max(12, Math.ceil((c.meses || 0) * (1 + (c.sobra || 0)) * 1.5), Math.ceil(c.cobertura || 0));
  const alvoMeses = (c.meses || 0) * (1 + (c.sobra || 0));
  const pAtual = num(c.cobertura) ? Math.min(1, c.cobertura / escala) : 0;
  const pAlvo = Math.min(1, alvoMeses / escala);
  const bom = !!c.metaAtingida;
  const barra = num(c.atingido) ? Math.min(1, c.atingido) : 0;
  const cor = bom ? 'up' : 'var(--md-ext-color-warn)';
  const eraCob = num(base.cobertura) && num(c.cobertura) && Math.abs(base.cobertura - c.cobertura) >= 0.05 ? `<span class="og-era">era ${esc(meses(base.cobertura))}</span>` : '';
  return `
    ${kpiHtml({
    classe: 'og-tile og-tile-custo', rotulo: 'Custo de vida',
    valorHtml: `${dec(formatBRL(c.totalComFolga))}<small>/mês</small>`,
    extraHtml: eraHtml(base.totalComFolga, c.totalComFolga, formatBRL),
    subHtml: `gasto real <b>${esc(formatBRL(c.totalReal))}</b> + ${esc(formatPct(c.folga, 0))} de folga · ${c.qtd} ${c.qtd === 1 ? 'despesa' : 'despesas'}`,
  })}
    ${kpiHtml({
    classe: 'og-tile og-tile-meta', rotulo: 'Meta da reserva',
    rotuloExtraHtml: chipHtml(bom ? 'good' : 'warn', c.metaAtingida ? 'Meta batida' : `${esc(formatPct(c.atingido, 0))} da meta`, bom ? 'check' : 'schedule'),
    valorHtml: dec(formatBRL(c.meta)),
    extraHtml: `${eraHtml(base.meta, c.meta, formatBRL)}<div class="og-barra-prog" data-prog-valor="${barra}" data-prog-cor="${esc(cor)}" data-prog-rotulo="Reserva atual sobre a meta"></div>`,
    subHtml: `você tem <b>${esc(formatBRL(c.atual))}</b> · ${c.metaAtingida ? `sobram <b>${esc(formatBRL((c.atual || 0) - c.meta))}</b>` : `faltam <b>${esc(formatBRL(c.falta))}</b>`}`,
  })}
    ${kpiHtml({
    classe: 'og-tile og-tile-cobertura', rotulo: 'A reserva cobre',
    valorHtml: esc(meses(c.cobertura)),
    extraHtml: `${eraCob}<div class="og-barra-prog" data-prog-valor="${pAtual}" data-prog-meta="${pAlvo}" data-prog-cor="${esc(cor)}" data-prog-rotulo="Cobertura da reserva em meses (marca = meta)"></div>
      <div class="og-regua-escala" aria-hidden="true"><span>0</span><span>meta ${esc(formatNumeroBR(alvoMeses, 1))}</span><span>${escala} meses</span></div>`,
    subHtml: `do custo com folga · <b>${esc(meses(c.coberturaReal))}</b> do gasto real`,
  })}`;
}

/** "De onde vem a meta": a conta da planilha, com folga/meses/sobra editáveis. */
export function htmlConta(r) {
  return `
    <div class="og-conta-cab">
      <h2>De onde vem a meta</h2>
      <span class="hint">a mesma conta da planilha - mude a folga, os meses ou a sobra e veja o efeito</span>
    </div>
    <ol class="og-cadeia">
      <li><span class="og-elo-rot">Gasto real</span><b data-out="totalReal"></b></li>
      <li class="og-op"><span>+</span><label class="og-campo"><input id="ogFolga" inputmode="decimal" value="${esc(formatNumeroBR(r.folga * 100, 0))}" aria-label="Folga em cada despesa (%)"><span>%</span></label><span class="og-elo-rot">folga</span></li>
      <li><span class="og-elo-rot">Custo de vida</span><b data-out="totalComFolga"></b></li>
      <li class="og-op"><span>×</span><label class="og-campo"><input id="ogMeses" inputmode="numeric" value="${esc(formatNumeroBR(r.meses, 0))}" aria-label="Meses de reserva"></label><span class="og-elo-rot">meses</span></li>
      <li><span class="og-elo-rot">Base</span><b data-out="base"></b></li>
      <li class="og-op"><span>+</span><label class="og-campo"><input id="ogSobra" inputmode="decimal" value="${esc(formatNumeroBR(r.sobra * 100, 0))}" aria-label="Sobra na meta (%)"><span>%</span></label><span class="og-elo-rot">sobra</span></li>
      <li class="og-elo-final"><span class="og-elo-rot">Meta da reserva</span><b data-out="meta"></b></li>
    </ol>
    <p class="og-conta-nota" data-out="nota"></p>`;
}

function atualizarConta(el, c) {
  if (!el) return;
  const set = (k, v) => { const o = el.querySelector(`[data-out="${k}"]`); if (o) o.innerHTML = v; };
  set('totalReal', dec(formatBRL(c.totalReal)));
  set('totalComFolga', dec(formatBRL(c.totalComFolga)));
  set('base', dec(formatBRL(c.base)));
  set('meta', dec(formatBRL(c.meta)));
  set('nota', c.totalReal > 0
    ? `As duas margens juntas deixam a meta <b>${esc(formatPct(c.margemTotal))}</b> acima de ${esc(formatNumeroBR(c.meses, 0))} meses do gasto real (${esc(formatBRL(c.baseReal))}).${num(c.patrimonioDesejado) ? ` O custo de vida também entra no <a href="../distribuicoes-metas.html">Patrimônio desejado</a>: <b>${esc(formatBRL(c.patrimonioDesejado))}</b>.` : ''}`
    : '');
}

function htmlLinhaItem(item, c, { sugestao }) {
  const estado = estadoItem(item);
  const mensal = mensalDespesa(item);
  const comFolga = mensal * (1 + (c.folga || 0));
  const share = c.totalReal > 0 && !item.removida ? mensal / c.totalReal : 0;
  const removida = estado === 'removida';
  return `
    <li class="og-item${estado ? ` ${estado}` : ''}" data-id="${esc(item.id)}" style="--f:${share.toFixed(4)}">
      <span class="og-marca" title="${estado === 'nova' ? 'Nova (ainda não salva)' : estado === 'editada' ? 'Alterada (ainda não salva)' : estado === 'removida' ? 'Vai ser removida ao salvar' : ''}"></span>
      <input class="og-nome" value="${esc(item.nome)}" placeholder="Nome da despesa" aria-label="Nome da despesa" maxlength="80"${removida ? ' disabled' : ''}>
      <span class="og-cat-cel">
        <input class="og-cat" list="ogListaCategorias" value="${esc(item.categoria)}" placeholder="${sugestao ? esc(sugestao) : 'Categoria'}" aria-label="Categoria" maxlength="40"${removida ? ' disabled' : ''}>
        ${!item.categoria && sugestao && !removida ? `<button type="button" class="og-sug" data-sug="${esc(sugestao)}" title="Usar a categoria sugerida">usar</button>` : ''}
      </span>
      <select class="og-freq" aria-label="Frequência"${removida ? ' disabled' : ''}>
        <option value="Mensal"${item.frequencia !== 'Anual' ? ' selected' : ''}>Mensal</option>
        <option value="Anual"${item.frequencia === 'Anual' ? ' selected' : ''}>Anual</option>
      </select>
      <label class="og-valor-cel"><span>R$</span><input class="og-valor" inputmode="decimal" value="${esc(formatNumeroBR(item.valor))}" aria-label="Valor${item.frequencia === 'Anual' ? ' por ano' : ' por mês'}"${removida ? ' disabled' : ''}></label>
      <span class="og-mes" data-out="mes"><b>${dec(formatBRL(comFolga))}</b><small>${item.frequencia === 'Anual' ? `${esc(formatBRL(mensal))}/mês real` : 'c/ folga'}</small></span>
      <span class="og-pct" data-out="pct">${removida ? '' : esc(formatPct(share, 1))}</span>
      <span class="og-acoes">
        ${removida
    ? '<button type="button" class="og-desfazer tx-link">Desfazer</button>'
    : `${estado === 'editada' ? '<button type="button" class="og-restaurar" title="Voltar ao valor da planilha" aria-label="Voltar ao valor da planilha">↺</button>' : ''}<button type="button" class="og-remover" title="Remover despesa" aria-label="Remover ${esc(item.nome || 'despesa')}">×</button>`}
      </span>
    </li>`;
}

function ordenarItens(itens, ordem) {
  const lista = [...itens];
  if (ordem === 'valor') lista.sort((a, b) => mensalDespesa(b) - mensalDespesa(a));
  if (ordem === 'categoria') {
    const idx = (cat) => { const i = CATEGORIAS.indexOf(cat); return i < 0 ? (cat ? CATEGORIAS.length : CATEGORIAS.length + 1) : i; };
    lista.sort((a, b) => idx(a.categoria.trim()) - idx(b.categoria.trim()) || a.categoria.localeCompare(b.categoria) || mensalDespesa(b) - mensalDespesa(a));
  }
  return lista;
}

export function htmlLista(rascunho, c, ordem) {
  const itens = ordenarItens(rascunho.itens, ordem);
  if (!itens.length) return '<li class="og-vazio hint">Nenhuma despesa. Use "Adicionar despesa".</li>';
  if (ordem !== 'categoria') return itens.map((i) => htmlLinhaItem(i, c, { sugestao: categoriaSugerida(i.nome) })).join('');
  let atual = null;
  return itens.map((i) => {
    const cat = i.categoria.trim() || SEM_CATEGORIA;
    let cab = '';
    if (cat !== atual) {
      atual = cat;
      const g = c.porCategoria.find((p) => p.categoria === cat);
      cab = `<li class="og-grupo"><span>${esc(cat)}</span><b>${g ? esc(formatBRL(g.valor)) : ''}</b><small>${g ? esc(formatPct(g.pct, 0)) : ''}</small></li>`;
    }
    return cab + htmlLinhaItem(i, c, { sugestao: categoriaSugerida(i.nome) });
  }).join('');
}

export function htmlCategorias(c) {
  if (!c.porCategoria.length) return '';
  const max = c.porCategoria[0].valor || 1;
  const assin = c.porCategoria.find((p) => p.categoria === 'Assinaturas');
  const semCat = c.porCategoria.find((p) => p.categoria === SEM_CATEGORIA);
  return `
    <div class="lateral-cab"><h2>Por categoria</h2><span class="hint">gasto real / mês</span></div>
    <ul class="og-cats">
      ${c.porCategoria.map((p) => `
        <li class="${p.categoria === SEM_CATEGORIA ? 'sem' : ''}" title="${esc(`${p.categoria}: ${formatBRL(p.valor)}/mês · ${formatBRL(p.comFolga)} com folga · ${p.qtd} ${p.qtd === 1 ? 'despesa' : 'despesas'}`)}">
          <span class="og-cat-nome">${esc(p.categoria)}</span>
          <span class="og-cat-valor">${esc(formatBRL(p.valor))}</span>
          <span class="og-cat-barra" data-prog-valor="${(p.valor / max).toFixed(4)}" data-prog-cor="1" data-prog-rotulo="${esc(p.categoria)}"></span>
          <span class="og-cat-pct">${esc(formatPct(p.pct, 0))}</span>
        </li>`).join('')}
    </ul>
    ${assin ? `<p class="og-nota"><b>Assinaturas</b> somam ${esc(formatBRL(assin.valor))}/mês - <b>${esc(formatBRL(assin.valor * 12))} por ano</b>.</p>` : ''}
    ${semCat ? `<p class="og-nota fraca">${semCat.qtd} ${semCat.qtd === 1 ? 'despesa sem categoria' : 'despesas sem categoria'} - use a sugestão ao lado de cada uma, ou "Categorizar tudo".</p>` : ''}`;
}

export function htmlSalario(c) {
  const s = c.salario;
  if (!s) return '<div class="lateral-cab"><h2>Salário: pra onde vai</h2></div><p class="hint">Sem salário líquido na planilha (aba Distribuição e Metas, N11).</p>';
  const estourou = s.livre < 0;
  return `
    <div class="lateral-cab"><h2>Salário: pra onde vai</h2><a class="hint" href="../distribuicoes-metas.html">líquido ${esc(formatBRL(s.liquido))} ›</a></div>
    <div class="og-sal-barra" data-ess="${s.essenciais}" data-inv="${s.aporte}" data-liv="${estourou ? 0 : s.livre}"></div>
    <ul class="og-sal-leg">
      <li><i class="ess"></i><span>Despesas essenciais</span><b>${esc(formatBRL(s.essenciais))}</b><small>${esc(formatPct(s.pctEssenciais, 0))}</small></li>
      <li><i class="inv"></i><span>Investir (meta)</span><b>${esc(formatBRL(s.aporte))}</b><small>${esc(formatPct(s.pctAporte, 0))}</small></li>
      <li class="${estourou ? 'bad' : ''}"><i class="liv"></i><span>${estourou ? 'Falta' : 'Livre'}</span><b>${esc(formatBRL(Math.abs(s.livre)))}</b><small>${estourou ? '' : esc(formatPct(s.pctLivre, 0))}</small></li>
    </ul>
    <p class="og-nota fraca">${estourou ? 'Despesas + aporte passam do salário.' : 'Usa o gasto real (sem a folga). O aporte é o % pra investir da planilha (aba Distribuição e Metas).'}</p>`;
}

/** Barra do salário (essenciais | investir | livre) pela biblioteca de gráficos; lê os valores dos data-* que htmlSalario deixou. */
export function montarSalarioBarra(raiz) {
  const caixa = raiz && raiz.querySelector('.og-sal-barra');
  if (!caixa) return null;
  const fatias = [
    { id: 'ess', nome: 'Despesas essenciais', valor: Number(caixa.dataset.ess) || 0, cor: 3 },
    { id: 'inv', nome: 'Investir (meta)', valor: Number(caixa.dataset.inv) || 0, cor: 1 },
    { id: 'liv', nome: 'Livre', valor: Number(caixa.dataset.liv) || 0, cor: 2 },
  ];
  return criarBarraComposicao(caixa, { fatias, formatarValor: formatBRL, legenda: false });
}

/** Pontos do custo de vida no tempo (uma linha por gravação em aux_historico-despesas). */
export function pontosHistorico(historico) {
  return (historico || []).filter((h) => num(h.totalComFolga) && !Number.isNaN(new Date(h.data).getTime()))
    .map((h) => ({ t: new Date(h.data).getTime(), v: h.totalComFolga, real: h.totalReal }));
}
const CAB_HISTORICO = '<div class="lateral-cab"><h2>Custo de vida no tempo</h2><span class="hint">com folga</span></div>';
const diaMes = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };

/** Texto embaixo da linha do tempo ("R$ A → R$ B (+X) · prévia agora ..."). */
export function notaHistorico(pontos, c) {
  const prim = pontos[0]; const ult = pontos[pontos.length - 1];
  const dif = ult.v - prim.v;
  return `${esc(formatBRL(prim.v))} → <b>${esc(formatBRL(ult.v))}</b> <span class="${dif > 0 ? 'bad' : dif < 0 ? 'good' : ''}">(${esc(sinalBRL(dif))})</span>${num(c.totalComFolga) && Math.round(c.totalComFolga * 100) !== Math.round(ult.v * 100) ? ` · prévia agora ${esc(formatBRL(c.totalComFolga))}` : ''}`;
}

/** Opções da biblioteca (criarGraficoLinha) para a linha do tempo do custo de vida. */
export function opcoesHistoricoDespesas(pontos) {
  const prim = pontos[0]; const ult = pontos[pontos.length - 1];
  return {
    series: [{ id: 'custo', nome: 'Custo de vida (com folga)', valores: pontos.map((p) => p.v), principal: true, area: true, cor: 1, largura: 2.5 }],
    eixoX: pontos.map((p) => ({ rotulo: diaMes(p.t), titulo: dataBR(p.t) })), formatarX: (item) => (item && item.titulo) || '',
    formatarValor: (v) => formatBRL(v), altura: 150, ticksY: 3,
    tooltipExtra: (i) => [{ nome: 'Gasto real', valor: formatBRL(pontos[i].real) }],
    aria: `Custo de vida de ${formatBRL(prim.v)} em ${dataBR(prim.t)} para ${formatBRL(ult.v)} em ${dataBR(ult.t)}`,
  };
}

/** Estado vazio da linha do tempo (menos de 2 gravações). */
export function htmlHistoricoVazio() {
  return `${CAB_HISTORICO}<p class="og-nota fraca">A linha do tempo começa na primeira vez que você salvar por aqui: cada gravação vira um ponto (o "antes" e o "depois").</p>`;
}

/**
 * Desenha (ou só atualiza o texto) a linha do tempo dentro de `el`. `guardado` = { grafico, sig } entre chamadas: o gráfico só é
 * recriado quando os pontos mudam (a cada tecla só a nota "prévia agora" muda). Devolve o novo `guardado`.
 */
export function desenharHistoricoDespesas(el, historico, c, guardado = {}) {
  if (!el) return guardado;
  const pontos = pontosHistorico(historico);
  const sig = JSON.stringify(pontos);
  if (pontos.length < 2) {
    if (guardado.grafico) { try { guardado.grafico.destruir(); } catch (e) { /* já saiu */ } }
    el.innerHTML = htmlHistoricoVazio();
    return {};
  }
  if (!guardado.grafico || guardado.sig !== sig || !el.querySelector('.og-hist-grafico')) {
    if (guardado.grafico) { try { guardado.grafico.destruir(); } catch (e) { /* já saiu */ } }
    el.innerHTML = `${CAB_HISTORICO}<div class="og-hist-grafico"></div><p class="og-nota" data-out="nota"></p>`;
    guardado = { grafico: criarGraficoLinha(el.querySelector('.og-hist-grafico'), opcoesHistoricoDespesas(pontos)), sig };
  }
  el.querySelector('[data-out="nota"]').innerHTML = notaHistorico(pontos, c);
  return guardado;
}

export function htmlBarra(mud, imp, { erros = [], salvando = false, erro = '', conflito = false } = {}) {
  const partes = [];
  if (mud.novas) partes.push(`${mud.novas} ${mud.novas === 1 ? 'nova' : 'novas'}`);
  if (mud.editadas) partes.push(`${mud.editadas} ${mud.editadas === 1 ? 'alterada' : 'alteradas'}`);
  if (mud.removidas) partes.push(`${mud.removidas} ${mud.removidas === 1 ? 'removida' : 'removidas'}`);
  if (mud.parametros.length) partes.push(mud.parametros.join(', '));
  const chip = (rot, v, fmt, inverso = false) => {
    if (!num(v) || Math.abs(v) < 0.005) return '';
    const ruim = inverso ? v < 0 : v > 0;
    return `<span class="og-imp ${ruim ? 'bad' : 'good'}"><small>${esc(rot)}</small>${esc(fmt(v))}</span>`;
  };
  const cob = num(imp.coberturaAntes) && num(imp.coberturaDepois) && Math.abs(imp.coberturaAntes - imp.coberturaDepois) >= 0.05
    ? `<span class="og-imp ${imp.coberturaDepois < imp.coberturaAntes ? 'bad' : 'good'}"><small>Cobertura</small>${esc(formatNumeroBR(imp.coberturaAntes, 1))} → ${esc(formatNumeroBR(imp.coberturaDepois, 1))} meses</span>` : '';
  const aviso = conflito
    ? `<p class="og-barra-erro">A planilha mudou enquanto você editava. Descarte e recarregue pra não sobrescrever o que mudou lá.</p>`
    : erro ? `<p class="og-barra-erro">${esc(erro)}</p>`
      : erros.length ? `<p class="og-barra-erro">${esc(erros[0])}${erros.length > 1 ? ` (+${erros.length - 1})` : ''}</p>` : '';
  return `
    <div class="og-barra-info">
      <b>${mud.total} ${mud.total === 1 ? 'alteração' : 'alterações'}</b><span class="og-barra-partes">${esc(partes.join(' · '))}</span>
      <span class="og-imps">${chip('Custo de vida', imp.totalComFolga, (v) => `${sinalBRL(v)}/mês`)}${chip('Meta da reserva', imp.meta, sinalBRL)}${chip('Patrimônio desejado', imp.patrimonioDesejado, sinalBRL)}${cob}</span>
      ${aviso}
    </div>
    <div class="og-barra-botoes">
      <button type="button" class="btn btn-outlined" data-acao="descartar"${salvando ? ' disabled' : ''}>${conflito ? 'Descartar e recarregar' : 'Descartar'}</button>
      <button type="button" class="btn btn-filled" data-acao="salvar"${salvando || erros.length || conflito ? ' disabled' : ''}>${salvando ? 'Salvando…' : 'Salvar na planilha'}</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

/**
 * Carrega uma resposta da API UMA vez e divide entre quem precisa (as abas e
 * o painel de Documentos). valor: undefined = ainda não veio; null = deu erro
 * (e nunca veio); objeto = a última resposta ok. obter() reaproveita a busca;
 * recarregar() busca de novo; definir(v) troca o valor (quem salvou já tem a
 * resposta nova); inscrever(fn) avisa a cada mudança.
 */
export function criarCarregador(buscar) {
  let promessa = null;
  let valor;
  let iniciadoEm = 0; // 05/10/2026 (A-39): quando a última busca começou - "Atualizar" não repete o que acabou de ser pedido
  const ouvintes = new Set();
  const avisar = () => ouvintes.forEach((f) => { try { f(valor); } catch (e) { /* um ouvinte com erro não derruba os outros */ } });
  // 07/10/2026 (Tiago: "desativo o OuroCard e alguns segundos depois ele é reativado"): uma busca que começou ANTES
  // de outra (ou antes de um definir() de quem acabou de salvar) e termina DEPOIS não sobrescreve o valor mais novo.
  let geracao = 0;
  async function rodar() {
    let r;
    const minha = ++geracao;
    iniciadoEm = Date.now();
    try { r = await buscar(); } catch (e) { r = { ok: false, erro: String(e && e.message ? e.message : e) }; }
    if (minha !== geracao) return r; // resposta velha: o valor já é mais novo que ela
    if (r && r.ok) valor = r;
    else if (valor === undefined) valor = null;
    avisar();
    return r;
  }
  return {
    obter() { if (!promessa) promessa = rodar(); return promessa; },
    recarregar() { promessa = rodar(); return promessa; },
    definir(v) { geracao += 1; valor = v; if (!promessa) promessa = Promise.resolve(v); avisar(); },
    inscrever(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); },
    get valor() { return valor; },
    get iniciado() { return !!promessa; },
    /** ms desde que a última busca começou (Infinity se nunca buscou). */
    iniciadoHa() { return iniciadoEm ? Date.now() - iniciadoEm : Infinity; },
  };
}

/** 1ª chamada: a busca compartilhada; as seguintes ("Atualizar", depois de salvar): busca de novo. */
function primeiraDepoisRecarrega(c) {
  let primeira = true;
  return () => { if (primeira) { primeira = false; return c.obter(); } return c.recarregar(); };
}

/** Hash do endereço -> aba. #salario (antigo) = Renda; #gastos = Gastos e Despesas; #simulador = Simulações (rola até o simulador). */
export const ABA_DO_HASH = {
  patrimonio: 'patrimonio', despesas: 'despesas', gastos: 'despesas', simulador: 'simulacoes', simulacoes: 'simulacoes', renda: 'renda', salario: 'renda',
};

export async function montarPaginaOrganizacao(token, {
  doc = document, getDespesasImpl = getDespesas, salvarDespesasImpl = salvarDespesas, refresh = true, salarioOpcoes = {}, patrimonioOpcoes = {},
  gastosOpcoes = {}, rendaOpcoes = {}, simuladorOpcoes = {}, documentosOpcoes = {}, hoje = null,
} = {}) {
  let gastos = null;
  const loadingEl = doc.getElementById('organizacaoLoading');
  const erroEl = doc.getElementById('organizacaoErro');
  const conteudo = doc.getElementById('organizacaoConteudo');
  const win = doc.defaultView;
  // 06/10/2026 (Onda 3): cabeçalho padrão da página (título, subtítulo e o "Atualizar dados")
  const cabEl = doc.getElementById('ogCabecalho');
  const cabecalho = cabEl ? montarCabecalhoPagina(cabEl, {
    secao: 'Organização Financeira', subaba: 'Patrimônio', titulo: 'Organização Financeira',
    subtitulo: 'Patrimônio, gastos e despesas, renda e orçamentos - e os documentos que o site precisa de você.',
    refresh: true, doc,
  }) : null;
  const refreshEl = cabecalho ? cabecalho.refreshEl : null;
  if (refreshEl) refreshEl.id = 'refreshControlOrganizacao';

  let dados = null;
  let rascunho = null;
  let calcBase = null;
  let ordem = ['planilha', 'valor', 'categoria'].includes(lerLocal(CHAVE_ORDEM)) ? lerLocal(CHAVE_ORDEM) : 'planilha';
  const ui = { salvando: false, erro: '', conflito: false, salvoEm: null };

  const $ = (sel) => conteudo.querySelector(sel);
  const contexto = () => ({ reserva: dados.reserva, salario: dados.salario, patrimonio: dados.patrimonio });
  const calcular = () => calcularOrganizacao(rascunho, contexto());
  const acharItem = (id) => rascunho.itens.find((i) => i.id === id);

  let histGuardado = {};
  // 06/10/2026 (Onda 3, A-59): os 3 cartões laterais (Por categoria, Salário, Custo de vida no tempo) são recolhíveis - no celular
  // começam fechados. O conteúdo é redesenhado a cada edição, então o <details> é refeito junto e o estado aberto/fechado é lembrado.
  const recAberto = {};
  const recolherLateral = (sel) => recolherRedesenhavel(conteudo, sel, { memoria: recAberto, doc });
  function montarEsqueleto() {
    conteudo.innerHTML = `
      <div class="pt-sec-cab og-sec-cab"><h2>Renda de emergência</h2><span class="pt-hint">despesas essenciais → custo de vida → meta da reserva</span><a class="og-link-meta" href="../metas.html">Acompanhar como meta (Reserva de emergência) em Metas e Objetivos ›</a></div>
      <section class="og-hero grid-kpi" id="ogHero" aria-live="polite"></section>
      <section class="og-conta" id="ogConta"></section>
      <div class="og-colunas">
        <section class="card og-lista-card">
          <div class="og-lista-cab">
            <div class="og-lista-tit"><h2>Despesas essenciais para a renda de emergência</h2><span class="hint og-lista-sub">a lista de despesas que entram na conta da renda emergencial (a sua reserva de emergência)</span><span class="hint" id="ogContador"></span></div>
          </div>
          <div class="og-lista-ferr">
            <div class="filter-tabs og-ordem" id="ogOrdem" role="group" aria-label="Ordenar">
              <button type="button" class="filter-tab" data-ordem="planilha">Planilha</button>
              <button type="button" class="filter-tab" data-ordem="valor">Maior valor</button>
              <button type="button" class="filter-tab" data-ordem="categoria">Categoria</button>
            </div>
            <button type="button" class="btn btn-outlined og-btn-sm" id="ogCategorizar" hidden>Categorizar tudo</button>
          </div>
          <div class="og-colunas-rot" aria-hidden="true"><span></span><span>Despesa</span><span>Categoria</span><span>Frequência</span><span>Valor</span><span>Por mês</span><span>%</span><span></span></div>
          <ul class="og-lista" id="ogLista"></ul>
          <div class="og-lista-rodape">
            <button type="button" class="btn btn-outlined og-btn-sm" id="ogAdicionar">+ Adicionar despesa</button>
            <div class="og-totais" id="ogTotais"></div>
          </div>
        </section>
        <aside class="og-lateral">
          <section class="card" id="ogCategorias"></section>
          <section class="card" id="ogSalario"></section>
          <section class="card" id="ogHistorico"></section>
        </aside>
      </div>
      <div class="og-barra" id="ogBarra" hidden role="region" aria-label="Alterações não salvas"></div>
      <datalist id="ogListaCategorias">${CATEGORIAS.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>`;
    // 06/10/2026 (Onda 3, A-59): no celular a lista de despesas começa recolhida (eram ~2.300px de rolagem)
    tornarRecolhiveis(conteudo, { seletor: '.og-lista-card', cabecalho: '.og-lista-cab', abertasNoCelular: 0, doc });
    ligarEventos();
  }

  function desenharLista(c) {
    $('#ogLista').innerHTML = htmlLista(rascunho, c, ordem);
    conteudo.querySelectorAll('#ogOrdem [data-ordem]').forEach((b) => {
      const ativo = b.dataset.ordem === ordem;
      b.classList.toggle('active', ativo);
      b.setAttribute('aria-pressed', String(ativo));
    });
  }

  function atualizarResumo({ lista = false } = {}) {
    const c = calcular();
    $('#ogHero').innerHTML = htmlHero(c, calcBase);
    montarBarrasProgresso($('#ogHero'));
    atualizarConta($('#ogConta'), c);
    if (lista) desenharLista(c);
    else {
      // só as células calculadas - os campos em edição ficam intactos (foco/cursor)
      conteudo.querySelectorAll('#ogLista .og-item').forEach((li) => {
        const it = acharItem(li.dataset.id);
        if (!it) return;
        const mensal = mensalDespesa(it);
        const share = c.totalReal > 0 && !it.removida ? mensal / c.totalReal : 0;
        li.style.setProperty('--f', share.toFixed(4));
        li.querySelector('[data-out="mes"]').innerHTML = `<b>${dec(formatBRL(mensal * (1 + c.folga)))}</b><small>${it.frequencia === 'Anual' ? `${esc(formatBRL(mensal))}/mês real` : 'c/ folga'}</small>`;
        li.querySelector('[data-out="pct"]').textContent = it.removida ? '' : formatPct(share, 1);
        const estado = estadoItem(it);
        li.classList.toggle('nova', estado === 'nova');
        li.classList.toggle('editada', estado === 'editada');
        const acoes = li.querySelector('.og-acoes');
        const temRestaurar = !!acoes.querySelector('.og-restaurar');
        if ((estado === 'editada') !== temRestaurar && !it.removida) {
          acoes.innerHTML = `${estado === 'editada' ? '<button type="button" class="og-restaurar" title="Voltar ao valor da planilha" aria-label="Voltar ao valor da planilha">↺</button>' : ''}<button type="button" class="og-remover" title="Remover despesa" aria-label="Remover ${esc(it.nome || 'despesa')}">×</button>`;
        }
      });
    }
    const semCat = rascunho.itens.filter((i) => !i.removida && !i.categoria.trim() && categoriaSugerida(i.nome)).length;
    const btnCat = $('#ogCategorizar');
    btnCat.hidden = semCat === 0;
    btnCat.textContent = `Categorizar tudo (${semCat})`;
    $('#ogContador').textContent = `${c.qtd} ${c.qtd === 1 ? 'despesa' : 'despesas'} · o que você precisa pagar todo mês, aconteça o que acontecer`;
    $('#ogTotais').innerHTML = `<span>Gasto real <b>${esc(formatBRL(c.totalReal))}</b></span><span>Com ${esc(formatPct(c.folga, 0))} de folga <b>${esc(formatBRL(c.totalComFolga))}</b></span>`;
    $('#ogCategorias').innerHTML = htmlCategorias(c);
    montarBarrasProgresso($('#ogCategorias'));
    $('#ogSalario').innerHTML = htmlSalario(c);
    montarSalarioBarra($('#ogSalario'));
    histGuardado = desenharHistoricoDespesas($('#ogHistorico'), dados.historico, c, histGuardado);
    ['#ogCategorias', '#ogSalario', '#ogHistorico'].forEach(recolherLateral);
    desenharBarra(c);
  }

  function desenharBarra(c = calcular()) {
    const barra = $('#ogBarra');
    const mud = mudancasRascunho(rascunho);
    const sujo = mud.total > 0;
    if (!sujo && !ui.conflito && !ui.erro) {
      if (ui.salvoEm) {
        barra.hidden = false;
        barra.className = 'og-barra og-barra-ok';
        barra.innerHTML = '<div class="og-barra-info"><b>Salvo na planilha</b><span class="og-barra-partes">A planilha (aba Distribuição e Metas) já usa a nova média de gastos.</span></div>';
      } else barra.hidden = true;
      return;
    }
    barra.hidden = false;
    barra.className = 'og-barra';
    barra.innerHTML = htmlBarra(mud, impactoRascunho(calcBase, c), {
      erros: validarRascunho(rascunho), salvando: ui.salvando, erro: ui.erro, conflito: ui.conflito,
    });
  }

  function desenharTudo() {
    loadingEl.hidden = true;
    erroEl.hidden = true;
    conteudo.hidden = false;
    if (!$('#ogHero')) montarEsqueleto();
    $('#ogConta').innerHTML = htmlConta(rascunho);
    atualizarResumo({ lista: true });
  }

  function aoMudar({ lista = false } = {}) {
    ui.salvoEm = null;
    ui.erro = '';
    atualizarResumo({ lista });
  }

  function lerParametro(input, { fracao = true } = {}) {
    const v = lerValorBR(input.value);
    input.classList.toggle('invalido', v === null);
    if (v === null) return null;
    return fracao ? v / 100 : v;
  }

  function ligarEventos() {
    const lista = $('#ogLista');
    lista.addEventListener('input', (ev) => {
      const li = ev.target.closest('.og-item');
      const it = li && acharItem(li.dataset.id);
      if (!it) return;
      if (ev.target.classList.contains('og-nome')) it.nome = ev.target.value;
      else if (ev.target.classList.contains('og-cat')) it.categoria = ev.target.value;
      else if (ev.target.classList.contains('og-valor')) {
        const v = lerValorBR(ev.target.value);
        ev.target.classList.toggle('invalido', v === null || v < 0);
        it.valor = v === null ? NaN : v;
      } else return;
      aoMudar();
    });
    lista.addEventListener('change', (ev) => {
      const li = ev.target.closest('.og-item');
      const it = li && acharItem(li.dataset.id);
      if (!it) return;
      if (ev.target.classList.contains('og-freq')) {
        it.frequencia = ev.target.value === 'Anual' ? 'Anual' : 'Mensal';
        aoMudar({ lista: true });
      } else if (ev.target.classList.contains('og-cat')) {
        aoMudar({ lista: ordem === 'categoria' });
      }
    });
    lista.addEventListener('focusout', (ev) => {
      if (!ev.target.classList.contains('og-valor')) return;
      const v = lerValorBR(ev.target.value);
      if (v !== null && v >= 0) ev.target.value = formatNumeroBR(v);
    });
    lista.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' || ev.target.tagName !== 'INPUT') return;
      ev.preventDefault();
      const campos = [...lista.querySelectorAll('input:not([disabled]), select:not([disabled])')];
      const i = campos.indexOf(ev.target);
      if (i >= 0 && campos[i + 1]) campos[i + 1].focus();
    });
    lista.addEventListener('click', (ev) => {
      const li = ev.target.closest('.og-item');
      const it = li && acharItem(li.dataset.id);
      if (!it) return;
      if (ev.target.closest('.og-remover')) {
        if (it.nova) rascunho.itens = rascunho.itens.filter((x) => x !== it);
        else it.removida = true;
        aoMudar({ lista: true });
      } else if (ev.target.closest('.og-desfazer')) {
        it.removida = false;
        aoMudar({ lista: true });
      } else if (ev.target.closest('.og-restaurar')) {
        Object.assign(it, it.original);
        aoMudar({ lista: true });
      } else if (ev.target.closest('.og-sug')) {
        it.categoria = ev.target.closest('.og-sug').dataset.sug;
        aoMudar({ lista: true });
      }
    });

    $('#ogOrdem').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ordem]');
      if (!b) return;
      ordem = b.dataset.ordem;
      gravarLocal(CHAVE_ORDEM, ordem);
      desenharLista(calcular());
    });
    $('#ogCategorizar').addEventListener('click', () => {
      rascunho.itens.forEach((i) => { if (!i.removida && !i.categoria.trim()) i.categoria = categoriaSugerida(i.nome) || ''; });
      aoMudar({ lista: true });
    });
    $('#ogAdicionar').addEventListener('click', () => {
      const novo = novoItemDespesa();
      rascunho.itens.push(novo);
      if (ordem !== 'planilha') { ordem = 'planilha'; gravarLocal(CHAVE_ORDEM, ordem); }
      aoMudar({ lista: true });
      const campo = conteudo.querySelector(`.og-item[data-id="${novo.id}"] .og-nome`);
      if (campo) campo.focus();
    });

    $('#ogConta').addEventListener('input', (ev) => {
      const id = ev.target.id;
      if (id === 'ogFolga') { const v = lerParametro(ev.target); rascunho.folga = v === null ? NaN : v; }
      else if (id === 'ogSobra') { const v = lerParametro(ev.target); rascunho.sobra = v === null ? NaN : v; }
      else if (id === 'ogMeses') { const v = lerParametro(ev.target, { fracao: false }); rascunho.meses = v === null ? NaN : v; }
      else return;
      aoMudar();
    });

    $('#ogBarra').addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-acao]');
      if (!b) return;
      if (b.dataset.acao === 'descartar') {
        const recarregar = ui.conflito;
        ui.conflito = false; ui.erro = ''; ui.salvoEm = null;
        rascunho = rascunhoDoServidor(dados);
        desenharTudo();
        if (recarregar) await carregar();
        return;
      }
      if (b.dataset.acao === 'salvar') await salvar();
    });
  }

  async function salvar() {
    if (ui.salvando || validarRascunho(rascunho).length) return;
    ui.salvando = true; ui.erro = '';
    desenharBarra();
    let r;
    try { r = await salvarDespesasImpl(token, payloadRascunho(rascunho)); } catch (e) { r = { ok: false, erro: String(e) }; }
    ui.salvando = false;
    if (!r || !r.ok) {
      ui.conflito = !!(r && r.conflito);
      ui.erro = ui.conflito ? '' : `Não deu pra salvar: ${(r && r.erro) || 'erro desconhecido'}`;
      desenharBarra();
      return;
    }
    aplicarDados(r, { forcar: true });
    ui.salvoEm = Date.now();
    desenharTudo();
    gravarCacheDados(CHAVE_CACHE, r);
  }

  function aplicarDados(r, { forcar = false } = {}) {
    const sujo = rascunho && mudancasRascunho(rascunho).total > 0;
    dados = r;
    if (gastos) { try { gastos.atualizarDespesas(r); } catch (e) { /* ok */ } }
    calcBase = calcularOrganizacao(rascunhoDoServidor(r), { reserva: r.reserva, salario: r.salario, patrimonio: r.patrimonio });
    if (!forcar && sujo) {
      if (r.assinatura !== rascunho.assinatura) ui.conflito = true;
      return;
    }
    rascunho = rascunhoDoServidor(r);
  }

  async function carregar() {
    let r;
    try { r = await getDespesasImpl(token); } catch (e) { r = { ok: false, erro: String(e) }; }
    if (!r || !r.ok) {
      loadingEl.hidden = true;
      if (!dados) {
        // 06/10/2026 (A-60/A-61): texto humano + "Tentar de novo"; o detalhe técnico fica num <details>
        mostrarErroCarga(erroEl, { tela: 'Gastos e Despesas', resposta: r, aoTentar: () => carregar(), doc });
      }
      return;
    }
    gravarCacheDados(CHAVE_CACHE, r);
    const sujo = rascunho && mudancasRascunho(rascunho).total > 0;
    aplicarDados(r);
    if (sujo) atualizarResumo(); else desenharTudo();
  }

  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('beforeunload', (ev) => {
      if (rascunho && mudancasRascunho(rascunho).total > 0) { ev.preventDefault(); ev.returnValue = ''; }
    });
  }

  // -------------------------------------------------------------------------
  // Abas (03/10/2026: Patrimônio | Gastos e Despesas | Renda e Orçamentos | Simulações)
  // 26/09/2026: 2 abas, só carregadas quando abrem; 27/09/2026: 3ª (Patrimônio).
  // -------------------------------------------------------------------------
  const abasEl = doc.getElementById('ogAbas');
  const paineis = {
    patrimonio: doc.getElementById('painelPatrimonio'),
    despesas: doc.getElementById('painelDespesas'),
    renda: doc.getElementById('painelRenda') || doc.getElementById('painelSalario'),
    simulacoes: doc.getElementById('painelSimulacoes'),
  };
  // 06/10/2026 (Onda 3): abas em pílula no topo (criarTabs); cada botão ganha data-aba (o código e os testes usam) e aria-controls
  const NOME_ABA = { patrimonio: 'Patrimônio', despesas: 'Gastos e Despesas', renda: 'Renda e Orçamentos', simulacoes: 'Simulações' };
  let abasUi = null;
  if (abasEl) {
    abasUi = criarTabs(abasEl, {
      variante: 'pilula', rotulo: 'Organização Financeira', ativo: 'patrimonio', doc,
      itens: Object.entries(NOME_ABA).map(([id, rotulo]) => ({ id, rotulo })),
      aoMudar: (id) => mostrarAba(id),
    });
    abasEl.querySelectorAll('[data-tab]').forEach((b) => {
      b.dataset.aba = b.dataset.tab;
      const painel = paineis[b.dataset.tab];
      if (painel) b.setAttribute('aria-controls', painel.id);
    });
  }
  const el = {
    patrimonio: doc.getElementById('patrimonioConteudo'),
    gastos: doc.getElementById('gastosConteudo'),
    simulador: doc.getElementById('simulador'),
    simHero: doc.getElementById('simulacoesHero'),
    rendaTopo: doc.getElementById('rendaTopo'),
    carreira: doc.getElementById('carreiraFgts'),
    salario: doc.getElementById('salarioConteudo'),
    rendaInv: doc.getElementById('rendaInvestimento'),
    rendaContas: doc.getElementById('rendaContas'),
    documentos: doc.getElementById('ogDocumentos'),
  };
  const hojeIso = () => hoje || (pat.valor && pat.valor.hoje) || (dados && dados.hoje) || null;
  // 06/10/2026 (A-78): taxas do contexto de mercado (Macro.gs) pro simulador e pra tabela de IPCA da Renda; só na página real (nos testes, doc não é o document global)
  const getMacroPagina = (token && doc === globalThis.document) ? (() => getMacro(token)) : null;

  // respostas compartilhadas
  const api = {
    getPatrimonio: patrimonioOpcoes.getPatrimonioImpl || ((t) => getPatrimonio(t)),
    getSalario: salarioOpcoes.getSalarioImpl || ((t) => getSalario(t)),
    getArquivosHolerites: salarioOpcoes.listarHoleritesImpl || ((t) => getArquivosHolerites(t)), // 05/10/2026: holerites no Drive
    gastos: gastosOpcoes.api || {
      getGastos: () => getGastos(token), getArquivosGastos: () => getArquivosGastos(token), getArquivoGastos: (id) => getArquivoGastos(token, id),
      salvarImportacaoGastos: (a, l) => salvarImportacaoGastos(token, a, l), salvarRegraGastos: (pp, c) => salvarRegraGastos(token, pp, c),
      excluirArquivoGastos: (id) => excluirArquivoGastos(token, id),
      excluirArquivosGastos: (ids) => excluirArquivosGastos(token, ids), // 07/10/2026: remover vários de uma vez
      salvarFontesGastos: (lista) => salvarFontesGastos(token, lista), // 07/10/2026: cartões/contas encerrados
    },
  };
  const pat = criarCarregador(() => api.getPatrimonio(token));
  const sal = criarCarregador(() => api.getSalario(token));
  const holDrive = criarCarregador(() => api.getArquivosHolerites(token)); // 05/10/2026: lista dos holerites no Drive (painel Documentos + aba Renda)
  const gas = criarCarregador(() => api.gastos.getGastos());
  const gasDrive = criarCarregador(() => api.gastos.getArquivosGastos());
  let ctxPat = null; // o contexto que a aba Patrimônio calculou (com as preferências do Tiago)
  const contextoPat = () => {
    if (!pat.valor) return null;
    if (ctxPat && ctxPat.d === pat.valor) return ctxPat;
    try { ctxPat = contextoPatrimonio(pat.valor); } catch (e) { ctxPat = null; }
    return ctxPat;
  };

  // peças (montadas quando a aba abre)
  let patrimonio = null; let salario = null; let simulador = null; let simulacoes = null; let carreira = null;
  const renda = { topo: null, inv: null, contas: null };
  let rendaMontada = false;
  let rolarDepois = null; // id pra rolar quando a aba Simulações terminar de montar
  let abaAtual = null;
  const pendente = { patrimonio: false, despesas: false, renda: false, simulacoes: false };
  const visivel = (aba) => abaAtual === aba;

  function rolarAte(alvo) {
    if (alvo && alvo.scrollIntoView) try { alvo.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ok */ }
  }

  // --- Gastos e Despesas: gastos reais ----------------------------------------
  function montarDespesasExtras() {
    if (!gastos && el.gastos) {
      try {
        gastos = montarSecaoGastos(el.gastos, {
          token, despesas: dados, hoje: hojeIso() || undefined, doc, ...gastosOpcoes,
          api: { ...api.gastos, getGastos: primeiraDepoisRecarrega(gas), getArquivosGastos: primeiraDepoisRecarrega(gasDrive) },
        });
      } catch (e) { mostrarErroCarga(el.gastos, { tela: 'Gastos reais', erro: e, aoTentar: () => { gastos = null; montarDespesasExtras(); }, doc }); }
    }
  }

  // --- Simulações: herói + simulador amortizar × investir --------------------
  function montarSimulacoes() {
    if (!el.simulador || simulacoes) return;
    if (!pat.iniciado) pat.obter();
    if (pat.valor) desenharSimulador();
    else if (pat.valor === null) {
      // 06/10/2026 (A-60/A-61): o simulador precisa do patrimônio (financiamento e FIES); texto humano + "Tentar de novo"
      if (el.simHero) el.simHero.innerHTML = '';
      mostrarErroCarga(el.simulador, { tela: 'Simulações', resposta: { erro: 'o patrimônio (financiamento e FIES) não carregou' }, aoTentar: () => pat.recarregar(), doc });
    } else if (!el.simulador.querySelector('.skel')) {
      if (el.simHero) el.simHero.innerHTML = '<div class="sm-hero sm-hero-skel grid-kpi"><span class="skel"></span><span class="skel"></span><span class="skel"></span><span class="skel"></span></div>';
      el.simulador.innerHTML = '<section class="pt-sec"><div class="pt-sec-cab"><h2>Amortizar ou investir?</h2><span class="pt-hint">carregando o financiamento e o FIES…</span></div><span class="skel skel-bloco og-skel-220"></span></section>';
    }
  }
  function desenharSimulador() {
    if (!el.simulador) return;
    const ctx = contextoPat();
    if (!ctx) return;
    try {
      if (!simulacoes) {
        simulacoes = montarAbaSimulacoes({ hero: el.simHero, simulador: el.simulador }, { ctx, doc, hoje: hojeIso(), getMacro: getMacroPagina, ...simuladorOpcoes });
        simulador = simulacoes.simulador;
        // #simulador antes de os dados chegarem: o herói empurrou o simulador pra baixo - rola de novo
        if (rolarDepois && visivel('simulacoes')) { const alvo = doc.getElementById(rolarDepois); if (alvo) setTimeout(() => rolarAte(alvo), 0); }
        rolarDepois = null;
      } else simulacoes.atualizar(ctx);
    } catch (e) { mostrarErroCarga(el.simulador, { tela: 'Simulações', erro: e, aoTentar: () => { simulacoes = null; desenharSimulador(); }, doc }); }
  }

  // --- Renda e Orçamentos -----------------------------------------------------
  function aoAcaoRenda(acao) {
    if (acao === 'importar-holerite') {
      if (salario) salario.rolarAteHolerite();
      const inp = el.salario && el.salario.querySelector('#slArquivo');
      if (inp) inp.click();
    } else if (acao === 'importar-ir') irParaIr();
    else if (acao === 'importar') abrirImportacaoPatrimonio();
  }
  function montarRenda() {
    if (!salario && el.salario) {
      salario = montarAbaSalario({
        doc, el: el.salario, token, ...salarioOpcoes, getSalarioImpl: primeiraDepoisRecarrega(sal),
        listarHoleritesImpl: primeiraDepoisRecarrega(holDrive), // 05/10/2026: a mesma lista alimenta o painel Documentos
        aoMudarDados: (d) => { if (d && d !== sal.valor) sal.definir(d); },
      });
    }
    if (!carreira && el.carreira) {
      carreira = montarCarreiraFgts(el.carreira, { doc, aoAcao: aoAcaoRenda });
      if (pat.valor === null) carreira.erro('O patrimônio (Carteira de Trabalho e FGTS) não carregou agora. Tente "Atualizar dados".');
    }
    if (!pat.iniciado) pat.obter();
    if (!sal.iniciado) sal.obter();
    if (!rendaMontada) {
      [el.rendaTopo, el.rendaInv, el.rendaContas].forEach((x) => { if (x && !x.innerHTML.trim()) x.innerHTML = '<span class="skel skel-bloco og-skel-180"></span>'; });
      if (pat.valor !== undefined && sal.valor !== undefined) desenharRenda();
    } else desenharRenda();
  }
  function desenharRenda() {
    const fontes = { patrimonio: pat.valor || null, salario: sal.valor || null, hoje: hojeIso() || new Date() };
    if (!rendaMontada) {
      rendaMontada = true;
      const comum = { ...fontes, doc, token, aoAcao: aoAcaoRenda, getMacro: getMacroPagina, aoAtualizarPatrimonio: (resp) => { if (resp && resp.config && pat.valor) { pat.valor.config = resp.config; if (resp.atualizado) pat.valor.atualizado = resp.atualizado; ctxPat = null; pat.definir(pat.valor); } }, ...rendaOpcoes };
      if (el.rendaTopo) renda.topo = montarSecaoRenda(el.rendaTopo, { ...comum, secoes: ['hero', 'salario'] });
      if (el.rendaInv) renda.inv = montarSecaoRenda(el.rendaInv, { ...comum, secoes: ['investimento'], buscarIpca: false });
      if (el.rendaContas) renda.contas = montarSecaoRenda(el.rendaContas, { ...comum, secoes: ['contas'], buscarIpca: false });
    } else Object.values(renda).forEach((r) => { if (r) r.atualizar(fontes); });
    const ctx = contextoPat();
    if (carreira && ctx) carreira.atualizar(ctx);
  }

  // --- Patrimônio -------------------------------------------------------------
  function montarPatrimonio() {
    if (patrimonio || !el.patrimonio) return patrimonio;
    patrimonio = montarAbaPatrimonio({
      doc, el: el.patrimonio, token, ...patrimonioOpcoes, getPatrimonioImpl: primeiraDepoisRecarrega(pat),
      aoMudarDados: (d, ctx) => { ctxPat = ctx || null; pat.definir(d); },
    });
    return patrimonio;
  }
  async function irParaIr() {
    mostrarAba('patrimonio');
    const p = montarPatrimonio();
    if (!p) return;
    await p.pronto;
    if (pat.valor && pat.valor.pastaIrConfigurada) await p.abrirDriveIr();
    else p.rolarAte('#ptSecFontes:not([hidden]), #ptFontesTopo:not([hidden])');
  }
  function abrirImportacaoPatrimonio() {
    mostrarAba('patrimonio');
    const p = montarPatrimonio();
    if (!p) return;
    // no mesmo clique (o navegador só abre o seletor de arquivos num gesto do usuário)
    if (el.patrimonio.querySelector('#ptArquivo')) p.abrirImportacao();
    else p.pronto.then(() => p.rolarAte('#ptSecFontes:not([hidden]), #ptFontesTopo:not([hidden])'));
  }

  // --- quando as respostas compartilhadas mudam -------------------------------
  pat.inscrever(() => {
    atualizarDocumentos();
    if (visivel('simulacoes')) { if (pat.valor) desenharSimulador(); else if (!simulacoes) montarSimulacoes(); } else pendente.simulacoes = true;
    if (visivel('renda')) { if (salario || rendaMontada) montarRenda(); } else pendente.renda = true;
  });
  sal.inscrever(() => {
    atualizarDocumentos();
    if (visivel('renda')) { if (salario || rendaMontada) montarRenda(); } else pendente.renda = true;
  });
  gas.inscrever(() => atualizarDocumentos());
  holDrive.inscrever(() => atualizarDocumentos());
  gasDrive.inscrever(() => atualizarDocumentos());

  // --- Documentos -------------------------------------------------------------
  let painelDocs = null;
  function atualizarDocumentos() {
    if (!painelDocs) return;
    try { painelDocs.atualizar({ patrimonio: pat.valor, salario: sal.valor, gastos: gas.valor, gastosDrive: gasDrive.valor, holeritesDrive: holDrive.valor, hoje: hojeIso() || new Date() }); } catch (e) { /* o painel é extra */ }
  }
  async function acaoDocumento(acao, extra) {
    if (acao === 'ir-drive') { await irParaIr(); return; }
    if (acao === 'fonte-encerrada') { await marcarFonteEncerrada(extra); return; }
    if (acao === 'pdfs') {
      mostrarAba('patrimonio');
      const p = montarPatrimonio();
      if (!p) return;
      await p.pronto;
      await p.lerArquivos(extra);
      return;
    }
    if (acao === 'holerite') {
      mostrarAba('renda');
      if (salario) await salario.importarArquivo(extra);
      return;
    }
    if (acao === 'holerite-drive') { // 05/10/2026: lê só os holerites novos da pasta Documentos/Trabalho do Drive
      mostrarAba('renda');
      if (salario) await salario.lerHoleritesDrive();
      return;
    }
    if (acao === 'gastos' || acao === 'gastos-novos') {
      mostrarAba('despesas');
      if (!gastos) return;
      rolarAte(el.gastos);
      if (acao === 'gastos-novos') { await gastos.pronto; await gastos.importarNovos(); } else {
        await gastos.pronto;
        rolarAte(el.gastos.querySelector('#gsDocs') || el.gastos);
      }
    }
  }
  /**
   * 07/10/2026 (Tiago: OuroCard cancelado, Bradesco sem uso): marca/desmarca um cartão ou conta como encerrado. A lista
   * mora no Apps Script (Gastos.gs) e volta no getGastos - o painel Documentos e a seção Gastos leem dali.
   */
  // 07/10/2026: otimista - a marcação vale na tela na hora (definir() descarta as buscas que já estavam no caminho, como a
  // lista do Drive ou uma releitura, que traziam a lista antiga); só volta atrás se o Apps Script recusar. Um salvamento
  // por vez, na ordem dos cliques.
  let filaFontes = Promise.resolve();
  function marcarFonteEncerrada({ fonte, encerrada } = {}) {
    if (!fonte || typeof api.gastos.salvarFontesGastos !== 'function') return Promise.resolve();
    const antes = [...((gas.valor && gas.valor.fontesEncerradas) || [])];
    const atual = new Set(antes);
    if (encerrada) atual.add(fonte); else atual.delete(fonte);
    const lista = [...atual];
    if (gas.valor) gas.definir({ ...gas.valor, fontesEncerradas: lista });
    filaFontes = filaFontes.then(async () => {
      let r;
      try { r = await api.gastos.salvarFontesGastos(lista); } catch (e) { r = { ok: false, erro: String(e) }; }
      if (!r || !r.ok) {
        const agora = new Set((gas.valor && gas.valor.fontesEncerradas) || []);
        if (encerrada) agora.delete(fonte); else agora.add(fonte); // desfaz só este clique
        if (gas.valor) gas.definir({ ...gas.valor, fontesEncerradas: [...agora] }); else atualizarDocumentos();
        toast(mensagemFalhaGastos(r, 'Não consegui salvar agora. Tente de novo em instantes.'), { tipo: 'erro', doc, duracaoMs: 10000 });
        return;
      }
      toast(encerrada ? `${NOME_FONTE_DOC[fonte] || 'Encerrado'}: não entra mais em "atrasado".` : `${NOME_FONTE_DOC[fonte] || 'Fonte'}: reativado.`, { tipo: 'info', doc });
      if (gastos && typeof gastos.recarregar === 'function') gastos.recarregar();
    });
    return filaFontes;
  }
  if (el.documentos && documentosOpcoes !== false) {
    painelDocs = montarPainelDocumentos(el.documentos, { doc, aoAcao: (a, x) => { acaoDocumento(a, x); }, ...(documentosOpcoes || {}) });
    atualizarDocumentos();
  }

  // --- trocar de aba ----------------------------------------------------------
  function mostrarAba(qual, { rolarPara = null } = {}) {
    const aba = paineis[qual] ? qual : (paineis.patrimonio ? 'patrimonio' : 'despesas');
    abaAtual = aba;
    Object.entries(paineis).forEach(([k, p]) => { if (p) p.hidden = k !== aba; });
    if (abasUi) abasUi.selecionar(aba);
    definirTituloPagina({ subaba: NOME_ABA[aba], secao: 'Organização Financeira' }, doc); // A-69: "<Subaba> · <Seção> · Patrimônio"
    if (aba === 'patrimonio') montarPatrimonio();
    if (aba === 'despesas') { montarDespesasExtras(); pendente.despesas = false; if (gastos && gastos.aoMostrar) { try { gastos.aoMostrar(); } catch (e) { /* ok */ } } }
    if (aba === 'simulacoes') { montarSimulacoes(); if (pendente.simulacoes && simulacoes && pat.valor) desenharSimulador(); pendente.simulacoes = false; }
    if (aba === 'renda') { montarRenda(); pendente.renda = false; }
    if (win && win.history && typeof win.history.replaceState === 'function' && win.location) {
      const hash = aba === 'patrimonio' ? '' : `#${aba}`;
      try { if ((win.location.hash || '') !== hash) win.history.replaceState(null, '', `${win.location.pathname}${win.location.search}${hash}`); } catch (e) { /* ok */ }
    }
    if (rolarPara) { const alvo = doc.getElementById(rolarPara); if (alvo) setTimeout(() => rolarAte(alvo), 0); }
    if (aba === 'simulacoes' && !simulacoes && rolarPara && rolarPara !== 'ogAbas') rolarDepois = rolarPara;
    return aba;
  }
  /** "#salario" -> renda; "#simulador" ou o id de qualquer coisa dentro de uma aba -> essa aba (e rola até lá). */
  function abaDoHash(h) {
    if (!h) return null;
    if (ABA_DO_HASH[h]) return { aba: ABA_DO_HASH[h], rolar: h === 'simulador' ? 'simulador' : null };
    let alvo = null;
    try { alvo = doc.getElementById(h); } catch (e) { alvo = null; }
    if (alvo) { const k = Object.keys(paineis).find((x) => paineis[x] && paineis[x].contains(alvo)); if (k) return { aba: k, rolar: h }; }
    return null;
  }
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('hashchange', () => {
      const r = abaDoHash(String(win.location.hash || '').replace('#', ''));
      // 03/10/2026: veio de um link no meio da página (ex.: "→ Simulações"): sobe até as abas
      if (r) mostrarAba(r.aba, { rolarPara: r.rolar || (r.aba !== abaAtual ? 'ogAbas' : null) });
    });
  }
  const inicial = abaDoHash(win && win.location ? String(win.location.hash || '').replace('#', '') : '');
  mostrarAba(inicial ? inicial.aba : 'patrimonio', { rolarPara: inicial && inicial.rolar });

  // 05/10/2026 (A-39): a carga inicial já pediu patrimônio/salário/gastos/Drive
  // (painel Documentos + aba aberta); o "Atualizar dados" da 1ª pintura não
  // pede de novo o que começou há menos de 5 s (eram 5 chamadas duplicadas,
  // 4 execuções pesadas simultâneas no Apps Script). Abas fora de vista só
  // buscam ao abrir (mostrarAba -> montarX -> obter()).
  const JANELA_RECENTE_MS = 5000;
  const recente = (c) => c.iniciado && c.iniciadoHa() < JANELA_RECENTE_MS;
  const atualizarTudo = async () => {
    const tarefas = [carregar()];
    if (patrimonio && patrimonio.dados) { if (!recente(pat)) tarefas.push(patrimonio.recarregar()); }
    else if (pat.iniciado && !recente(pat)) tarefas.push(pat.recarregar());
    if (salario && salario.dados) { if (!recente(sal)) tarefas.push(salario.recarregar()); }
    else if (sal.iniciado && !recente(sal)) tarefas.push(sal.recarregar());
    if (gastos && gastos.dados) { if (!recente(gas)) tarefas.push(gastos.recarregar()); }
    else {
      if (gas.iniciado && !recente(gas)) tarefas.push(gas.recarregar());
      if (gasDrive.iniciado && !recente(gasDrive)) tarefas.push(gasDrive.recarregar());
    }
    if (holDrive.iniciado && !recente(holDrive)) tarefas.push(holDrive.recarregar());
    await Promise.all(tarefas);
  };

  const cache = await lerCacheDados(CHAVE_CACHE);
  if (cache && cache.dados && cache.dados.ok) { aplicarDados(cache.dados); desenharTudo(); }
  // 03/10/2026: o painel Documentos precisa das 4 respostas - busca em
  // segundo plano (as que a aba aberta já pediu são reaproveitadas)
  if (painelDocs) { pat.obter(); sal.obter(); gas.obter(); gasDrive.obter(); holDrive.obter(); }
  // 26/09/2026: o botão "Atualizar dados" entra ANTES da 1ª busca (mostra
  // "Atualizando…" enquanto carrega) e fica fora do conteúdo - visível no
  // carregamento e no erro também, que é quando mais se precisa dele.
  if (refresh) await mountRefreshControl(doc, refreshEl, atualizarTudo, { setIntervalImpl: null }).atualizar();
  else await carregar();
  return {
    get rascunho() { return rascunho; }, get dados() { return dados; }, get salario() { return salario; }, get patrimonio() { return patrimonio; },
    get gastos() { return gastos; }, get simulador() { return simulador; }, get simulacoes() { return simulacoes; }, get renda() { return renda; }, get carreira() { return carreira; },
    get documentos() { return painelDocs; }, get abaAtual() { return abaAtual; },
    carregadores: { patrimonio: pat, salario: sal, gastos: gas, gastosDrive: gasDrive, holeritesDrive: holDrive },
    mostrarAba, acaoDocumento,
  };
}

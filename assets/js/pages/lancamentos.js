// assets/js/pages/lancamentos.js
//
// 26/09/2026: aba "Lançamentos" da tela Transações. Três partes:
//  1. Importar extratos (B3 Negociação / Movimentação / Proventos recebidos e
//     o Extrato de atividade da Interactive Brokers): lidos no navegador
//     (lancamentos-parse.js), conferidos no servidor contra o que já está na
//     planilha (modo simular) e só gravados depois da revisão;
//  2. Lançar manualmente (uma linha, qualquer aba);
//  3. Todos os lançamentos, agrupados por mês, com filtro (onde/ano/ativo),
//     busca e exportar CSV.
//
// 27/09/2026: redesenho de "Todos os lançamentos" (Tiago: "gostei do
// agrupamento. Use tag em quantidade, mas deixe mais formatado como tabela,
// ficou meio desorganizado as informacoes. No caso do internacional, tem
// que incluir quantos gastei em reais") - agora agrupado por mês (com uma
// linha de totais de compras/vendas/proventos), quantidade em tag, uma
// coluna "Em reais" pras operações em dólar (câmbio do dia, já vindo de
// Aportes.gs!listaLancamentosTela_), indicador vs. compra anterior nas
// compras, proventos recolhidos numa linha "ver os N ›" e um filtro por
// ativo que, com histórico de compra, mostra o gráfico "Suas compras no
// preço" (aportes-grafico.js) - o mesmo gráfico do popover do mapa de compras.

import { formatBRL, formatNumeroBR, formatUSD as usd, formatNumeroPt, formatDMA, formatMesAno } from '../format.js';
import { DESTINOS, TIPOS_ARQUIVO, lerArquivos, valorDoItem } from './lancamentos-parse.js';
import { lerTabelaColada, itensRendaFixaDaTabela, itensAcoesDaTabela } from './colar-tabela-parse.js';
import { destinoRendaFixa, ROTULO_DESTINO_RF, DESTINOS_RENDA_FIXA } from '../destino-renda-fixa.js';
import { MESES_LONGOS } from './aportes-calc.js';
import { classePorTicker, todasAsCompras } from './aportes-mapa-calc.js';
import { renderGraficoCompras } from './aportes-grafico.js';
import { logoAtivoHtml, logoRendaFixaHtml } from './carteiras-pecas.js';
import { esc } from '../util/html.js'; // 05/10/2026 (A-68): escape único
import { ligarFiltroPeriodo, botoesSegmentadoHtml, recortarPorIntervalo, ehPeriodoPersonalizado } from '../periodo-personalizado.js'; // 06/10/2026 (Onda 3): período canônico do gráfico
import { confirmar, toast, mostrarErroCarga, ligarMenu } from '../ui/index.js';
import { ic, COR_DESTINO, corClasse, chipTom, ativoCelHtml, estadoVazioHtml, secaoHtml, textoDeHtml, ehCelular } from './transacoes-ui.js';


const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const POR_PAGINA = 40;
const MESES_LISTA_INICIAL = 6;
const ORDEM_DESTINOS = ['transacoes', 'transacoesUsa', 'rendaFixa', 'proventos', 'proventosUsa'];
const FILTROS_LISTA = [
  { id: 'todos', nome: 'Tudo' }, { id: 'transacoes', nome: 'Brasil' }, { id: 'transacoesUsa', nome: 'EUA' },
  { id: 'rendaFixa', nome: 'Renda Fixa' }, { id: 'proventos', nome: 'Proventos' },
];
const SITUACAO = {
  novo: { txt: 'Novo', cls: 'good' }, lancado: { txt: 'Já lançado', cls: 'na' }, parecido: { txt: 'Parecido', cls: 'warn' },
  bloqueado: { txt: 'Bloqueado', cls: 'bad' }, invalido: { txt: 'Incompleto', cls: 'bad' }, gravado: { txt: 'Lançado agora', cls: 'good' },
  recusado: { txt: 'Não lançado', cls: 'bad' }, // 07/10/2026: a validação da planilha recusou (motivo na linha)
};

/** Erro de uma etapa (conferir, lançar): texto humano e, recolhido, o detalhe técnico (A-60/A-61). */
function erroLinhaHtml(e) {
  const texto = typeof e === 'string' ? e : e.texto;
  const detalhe = typeof e === 'string' ? '' : e.detalhe;
  return `
    <div class="estado-erro-linha tx-erro-linha" role="alert">${ic('error')}<div><span>${esc(texto)}</span>${detalhe ? `<details class="estado-detalhe"><summary>Detalhes técnicos</summary><pre>${esc(detalhe)}</pre></details>` : ''}</div></div>`;
}
const erroDe = (texto, resp) => ({ texto, detalhe: String((resp && resp.erro) || 'sem resposta do servidor') });

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const dinheiro = (v, moeda) => (moeda === 'USD' ? usd(v) : formatBRL(v));
const numTxt = (v, casas = 2) => (typeof v === 'number' && Number.isFinite(v) ? formatNumeroPt(v, { minimumFractionDigits: 0, maximumFractionDigits: casas }) : '—');
const moedaDoDestino = (d) => (d === 'transacoesUsa' || d === 'proventosUsa' ? 'USD' : 'BRL');
const lerNumeroCampo = (s) => {
  const t = String(s == null ? '' : s).trim().replace(/\s/g, '');
  if (!t) return null;
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// Ler os arquivos (navegador)
// ---------------------------------------------------------------------------

export function carregarSheetJs(doc) {
  const win = doc.defaultView;
  if (win.XLSX) return Promise.resolve(win.XLSX);
  return new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = SHEETJS_URL;
    s.onload = () => (win.XLSX ? resolve(win.XLSX) : reject(new Error('leitor de planilha não carregou')));
    s.onerror = () => reject(new Error('sem conexão pra carregar o leitor de planilha'));
    doc.head.appendChild(s);
  });
}

/** File -> { nome, linhas } (.xlsx/.xls) ou { nome, texto } (.csv/.txt). */
export async function lerArquivoDoNavegador(doc, arquivo, { carregarXlsx = carregarSheetJs } = {}) {
  const nome = arquivo.name || 'arquivo';
  if (/\.(csv|txt)$/i.test(nome)) return { nome, texto: await arquivo.text() };
  const XLSX = await carregarXlsx(doc);
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
  const aba = wb.Sheets[wb.SheetNames[0]];
  return { nome, linhas: XLSX.utils.sheet_to_json(aba, { header: 1, raw: true, defval: '' }) };
}

// ---------------------------------------------------------------------------
// 1. Importar
// ---------------------------------------------------------------------------

function importarHtml(estado, dados) {
  return `
    <section class="tx-secao" aria-labelledby="txImpTitulo">
      <div class="tx-secao-cab">
        <h2 id="txImpTitulo">Importar extratos</h2>
        <span class="hint">nada vai pra planilha antes da sua revisão</span>
        <button type="button" class="btn btn-tonal btn-sm tx-colar-abrir" data-lanc="colar-abrir" aria-expanded="${estado.colar.aberto ? 'true' : 'false'}" aria-controls="txColar">${ic('table-chart')}Colar uma tabela</button>
      </div>
      <div id="txColar">${colarHtml(estado, dados)}</div>
      <label class="tx-drop${estado.arrastando ? ' arrastando' : ''}" id="txDrop">
        <input type="file" id="txArquivos" multiple accept=".xlsx,.xls,.csv,.txt" hidden>
        ${ic('upload', 'ico tx-drop-ico')}
        <span class="tx-drop-titulo">Solte os arquivos aqui <span>ou toque pra escolher</span></span>
        <span class="tx-drop-tipos">
          <span>B3 · Negociação</span><span>B3 · Movimentação</span><span>B3 · Proventos recebidos</span><span>Interactive Brokers · CSV</span>
        </span>
      </label>
      <details class="tx-ajuda">
        <summary>${ic('help')}Onde baixar cada arquivo</summary>
        <ul>
          <li><b>B3</b> (Área do Investidor → Extratos): <b>Negociação</b> traz as compras e vendas de ações e FIIs; <b>Movimentação</b> traz Tesouro, CDB, LCI e os proventos; <b>Eventos → Proventos recebidos</b> também serve pros proventos. Baixe em Excel (.xlsx). Pode mandar um período maior: o que já está na planilha aparece como "já lançado".</li>
          <li><b>Interactive Brokers</b> (Desempenho e relatórios → Extratos → Atividade): período desejado, formato <b>CSV</b>. Entram as compras/vendas e os dividendos já pagos (com o imposto retido descontado).</li>
          <li>Compra de ação na B3 aparece também na Movimentação (como "Liquidação"): ela é ignorada, porque a data certa é a do pregão, que vem da Negociação.</li>
        </ul>
      </details>
      <div id="txRevisao">${revisaoHtml(estado)}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// 1b. Colar uma tabela (07/10/2026: fundo guardado pra chácara - a corretora não dá extrato, o agregador mostra uma tabela)
// ---------------------------------------------------------------------------

const TITULO_NOVO_TAXA_PADRAO = '100% do CDI';
const semAcentoColar = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const alfaNum = (t) => semAcentoColar(t).replace(/[^a-z0-9]/g, '');

/** O título digitado já está na Carteira Renda Fixa? (nome sem acento/caixa; com mais de um de mesmo nome, prefere a mesma instituição). */
export function acharTituloRf(dados, titulo, instituicao = '') {
  const nome = semAcentoColar(titulo);
  if (!nome) return null;
  const lista = ((dados && dados.classes && dados.classes.rendaFixa) || []).filter((t) => semAcentoColar(t.titulo) === nome);
  if (!lista.length) return null;
  const inst = alfaNum(instituicao);
  return (inst && lista.find((t) => alfaNum(t.instituicao) === inst)) || lista[0];
}

function colarNovoHtml(estado, dados) {
  const c = estado.colar;
  if (c.destino !== 'rendaFixa' || !String(c.titulo || '').trim()) return '';
  const ex = acharTituloRf(dados, c.titulo, c.instituicao);
  if (ex) {
    return `<p class="tx-nota tx-colar-achou" role="status">${ic('check-circle')}Título já cadastrado em Carteiras › Renda Fixa: <b>${esc(ROTULO_DESTINO_RF[destinoRendaFixa(ex.destino || ex.categoria)])}</b>. As compras entram nele.</p>`;
  }
  return `
    <div class="tx-aviso aviso tx-colar-novo" role="status">${ic('warning')}<span><b>Título novo.</b> Ele ainda não está em Carteiras › Renda Fixa. Ao lançar, o site cria o título lá com o destino abaixo (não precisa cadastrar antes).</span></div>
    <div class="tx-form-grade">
      <label class="tx-rotulo">Destino
        <select class="select" id="txColarDestinoRf" name="destinoRf" data-colar="destinoRf">${DESTINOS_RENDA_FIXA.map((d) => `<option value="${d}"${c.destinoRf === d ? ' selected' : ''}>${esc(ROTULO_DESTINO_RF[d])}</option>`).join('')}</select>
      </label>
    </div>
    <p class="tx-nota">Fundo DI: cadastre como pós-fixado, 100% do CDI (aproximação: a taxa de administração e o come-cotas não entram na conta).</p>`;
}

function colarCamposHtml(estado, dados) {
  const c = estado.colar;
  if (c.destino === 'acoes') {
    return '<p class="tx-nota">A tabela precisa ter uma coluna com o ticker (Ticker, Código ou Papel), além de data, tipo, quantidade e preço. O que tiver ticker ainda não cadastrado em Carteiras fica marcado como problema na revisão.</p>';
  }
  const titulos = (dados.classes.rendaFixa || []);
  return `
    <div class="tx-form-grade">
      <label class="tx-rotulo tx-rotulo-largo">Título ou fundo
        <input class="input" type="text" id="txColarTitulo" name="titulo" data-colar="titulo" list="txColarListaTitulos" autocomplete="off" placeholder="Fundo DI Exemplo, Tesouro Selic 2029..." value="${esc(c.titulo)}">
      </label>
      <label class="tx-rotulo tx-rotulo-largo">Instituição
        <input class="input" type="text" id="txColarInst" name="instituicao" data-colar="instituicao" list="txColarListaInst" autocomplete="off" placeholder="Rico, XP INVESTIMENTOS..." value="${esc(c.instituicao)}">
      </label>
      <label class="tx-rotulo">Taxa contratada (opcional)
        <input class="input" type="text" id="txColarTaxa" name="taxa" data-colar="taxa" autocomplete="off" placeholder="${TITULO_NOVO_TAXA_PADRAO}" value="${esc(c.taxa)}">
      </label>
    </div>
    <datalist id="txColarListaTitulos">${titulos.map((t) => `<option value="${esc(t.titulo)}"></option>`).join('')}</datalist>
    <datalist id="txColarListaInst">${[...new Set(titulos.map((t) => t.instituicao).filter(Boolean))].map((i) => `<option value="${esc(i)}"></option>`).join('')}</datalist>
    <div id="txColarNovo" class="tx-colar-novo-caixa">${colarNovoHtml(estado, dados)}</div>`;
}

/** Linha de prévia embaixo da caixa de texto: quantas linhas a tabela colada tem e quantas não deu pra entender. */
export function textoPreviaColar(texto) {
  if (!String(texto || '').trim()) return 'Cole as linhas acima; dá pra conferir tudo antes de lançar.';
  const r = lerTabelaColada(texto);
  const compras = r.linhas.filter((l) => l.tipo === 'compra').length;
  const resg = r.linhas.length - compras;
  const partes = [`${r.linhas.length} linha${r.linhas.length === 1 ? '' : 's'} reconhecida${r.linhas.length === 1 ? '' : 's'}`];
  if (r.linhas.length) partes.push(`${compras} compra${compras === 1 ? '' : 's'}${resg ? ` e ${resg} resgate${resg === 1 ? '' : 's'}` : ''}`);
  if (r.avisos.length) partes.push(`${r.avisos.length} não entendida${r.avisos.length === 1 ? '' : 's'} (aparecem na revisão)`);
  if (r.linhas.some((l) => l.aviso)) partes.push('com divergência de valor em ' + r.linhas.filter((l) => l.aviso).length);
  return partes.join(' · ');
}

function colarHtml(estado, dados) {
  const c = estado.colar;
  if (!c.aberto) return '';
  return `
    <div class="card tx-colar" role="group" aria-labelledby="txColarTit">
      <div class="tx-colar-cab">
        <h3 id="txColarTit">Colar uma tabela</h3>
        <button type="button" class="icon-btn" data-lanc="colar-fechar" aria-label="Fechar">${ic('close')}</button>
      </div>
      <p class="tx-nota">Serve pra qualquer corretora ou agregador: copie as linhas da tabela (Data, Tipo, Quantidade, Preço, Valor...) e cole aqui. Nada vai pra planilha antes da revisão.</p>
      <label class="tx-rotulo">Cole aqui as linhas (copie a tabela do site da corretora, do Gorila, do Excel...)
        <textarea class="textarea" id="txColarTexto" data-colar="texto" rows="7" spellcheck="false" placeholder="Data&#9;Tipo&#9;Quantidade&#9;Preço&#9;Custos Op.&#9;Valor total&#10;05/10/2026&#9;Compra&#9;100,5&#9;R$ 2,00&#9;R$ 0,00&#9;R$ 201,00">${esc(c.texto)}</textarea>
      </label>
      <p class="tx-nota tx-colar-previa" id="txColarPrevia" role="status">${esc(textoPreviaColar(c.texto))}</p>
      <label class="tx-rotulo tx-colar-destino">Pra onde vai
        <select class="select" id="txColarDestino" name="destino" data-colar="destino">
          <option value="rendaFixa"${c.destino === 'rendaFixa' ? ' selected' : ''}>Renda Fixa / fundo</option>
          <option value="acoes"${c.destino === 'acoes' ? ' selected' : ''}>Ações e FIIs (a tabela tem a coluna do ticker)</option>
        </select>
      </label>
      <div id="txColarCampos">${colarCamposHtml(estado, dados)}</div>
      ${c.erro ? `<div class="tx-aviso erro" role="alert">${ic('error')}<span>${esc(c.erro)}</span></div>` : ''}
      <div class="tx-botoes">
        <button type="button" class="btn btn-filled" data-lanc="colar-conferir">Conferir e revisar</button>
        <button type="button" class="btn btn-text" data-lanc="colar-fechar">Cancelar</button>
      </div>
    </div>`;
}

function redesenharColar(ctx) {
  const el = ctx.el.querySelector('#txColar');
  if (el) el.innerHTML = colarHtml(ctx.estado, ctx.dados);
  const b = ctx.el.querySelector('[data-lanc="colar-abrir"]');
  if (b) b.setAttribute('aria-expanded', ctx.estado.colar.aberto ? 'true' : 'false');
}

/** Campo da caixa "Colar uma tabela" mudou: guarda no estado (a tela pode ser redesenhada sem perder o que foi digitado) e atualiza só o que depende dele. */
function aoMudarCampoColar(ctx, campo, valor) {
  const { el, estado } = ctx;
  const c = estado.colar;
  c[campo] = valor;
  if (campo === 'texto') {
    const previa = el.querySelector('#txColarPrevia');
    if (previa) previa.textContent = textoPreviaColar(valor);
    // a tabela tem coluna de ticker e o destino ainda é o padrão: sugere Ações e FIIs (não mexe se a pessoa já escolheu)
    if (!c.destinoEscolhido && c.destino === 'rendaFixa' && lerTabelaColada(valor).temTicker) {
      c.destino = 'acoes';
      const sel = el.querySelector('#txColarDestino');
      const campos = el.querySelector('#txColarCampos');
      if (sel) sel.value = 'acoes';
      if (campos) campos.innerHTML = colarCamposHtml(estado, ctx.dados);
    }
    return;
  }
  if (campo === 'taxa') { c.taxaTocada = true; return; }
  if (campo === 'destino') {
    c.destinoEscolhido = true;
    const campos = el.querySelector('#txColarCampos');
    if (campos) campos.innerHTML = colarCamposHtml(estado, ctx.dados);
    return;
  }
  if (campo === 'titulo' || campo === 'instituicao') {
    const ex = acharTituloRf(ctx.dados, c.titulo, c.instituicao);
    const inst = el.querySelector('#txColarInst');
    if (campo === 'titulo' && ex && !String(c.instituicao || '').trim() && ex.instituicao) { c.instituicao = ex.instituicao; if (inst) inst.value = ex.instituicao; }
    // título novo: a taxa já vem como "100% do CDI" (o fundo DI do pedido); ao voltar pra um título que existe, tira o que a tela sugeriu
    const taxa = el.querySelector('#txColarTaxa');
    const novo = !!String(c.titulo || '').trim() && !ex;
    if (novo && !c.taxa && !c.taxaTocada) { c.taxa = TITULO_NOVO_TAXA_PADRAO; if (taxa) taxa.value = c.taxa; }
    if (!novo && c.taxa === TITULO_NOVO_TAXA_PADRAO && !c.taxaTocada) { c.taxa = ''; if (taxa) taxa.value = ''; }
    const caixa = el.querySelector('#txColarNovo');
    if (caixa) caixa.innerHTML = colarNovoHtml(estado, ctx.dados);
  }
}

function celulasItem(it) {
  const m = moedaDoDestino(it.destino);
  if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') {
    return [formatDMA(it.data), `<b>${esc(it.ticker)}</b>${it.obs ? `<small>${esc(it.obs)}</small>` : ''}`, esc(it.tipo), numTxt(it.qtd, 4), dinheiro(it.preco, m), dinheiro(valorDoItem(it), m)];
  }
  if (it.destino === 'rendaFixa') {
    return [formatDMA(it.data), `<b>${esc(it.produto)}</b><small>${esc(it.instituicao || '')}</small>`, esc(it.movimentacao), numTxt(it.qtd, 4), it.preco == null ? '—' : formatBRL(it.preco), it.valor == null ? '—' : formatBRL(it.valor)];
  }
  return [formatDMA(it.dataPagamento), `<b>${esc(it.ticker)}</b>${it.dataCom ? `<small>data com ${formatDMA(it.dataCom)}</small>` : ''}`, esc(it.tipo), numTxt(it.qtd, 4), dinheiro(it.valorPorCota, m), dinheiro(it.valor, m)];
}

const ROTULOS_COLUNAS = ['Data', 'Ativo', 'Tipo', 'Qtd', 'Preço', 'Valor'];

/**
 * 26/09/2026: ativo que ainda não está cadastrado -> atalho pro cadastro em
 * Carteiras (abre em outra aba pra não perder a revisão; depois é só
 * "Conferir de novo"). FII = ticker terminado em 11.
 */
export function classeNovoAtivoDoItem(it) {
  if (it.destino === 'transacoesUsa') return 'acoesEua';
  if (it.destino === 'transacoes') return /11[A-Z]?$/.test(String(it.ticker || '')) ? 'fiis' : 'acoes';
  return null;
}

const PAGINA_DA_CLASSE = { acoes: 'acoes', fiis: 'fiis', acoesEua: 'acoes-eua' };

function linkNovoAtivoHtml(it, s) {
  const classe = classeNovoAtivoDoItem(it);
  if (!classe || s.situacao !== 'bloqueado' || !/cadastrad/i.test(s.motivo || '')) return '';
  const href = `../carteiras/index.html?novoAtivo=${encodeURIComponent(it.ticker)}&classe=${classe}#${PAGINA_DA_CLASSE[classe]}`;
  return `<a class="tx-link tx-link-novo" href="${href}" target="_blank" rel="noopener">+ Adicionar ${esc(it.ticker)} em Carteiras</a>`;
}

function grupoRevisaoHtml(estado, destino) {
  const rev = estado.revisao;
  const itens = rev.itens.filter((it) => it.destino === destino);
  if (!itens.length) return '';
  const sit = (it) => rev.situacao[it.uid] || { situacao: 'novo' };
  const lancados = itens.filter((it) => sit(it).situacao === 'lancado');
  const mostrar = estado.mostrarLancados[destino] ? itens : itens.filter((it) => sit(it).situacao !== 'lancado');
  const novos = itens.filter((it) => ['novo', 'gravado'].includes(sit(it).situacao)).length;
  const rfCompra = (it) => destino === 'rendaFixa' && /compra|aplica/i.test(it.movimentacao) && sit(it).situacao === 'novo';
  const linhas = mostrar.map((it) => {
    const s = sit(it);
    const info = SITUACAO[s.situacao] || SITUACAO.novo;
    const travado = s.situacao === 'bloqueado' || s.situacao === 'invalido' || s.situacao === 'gravado';
    const marcado = !!rev.marcados[it.uid];
    const c = celulasItem(it);
    return `
      <tr class="tx-rev-${s.situacao}${marcado ? ' marcado' : ''}">
        <td class="tx-td-check"><input type="checkbox" class="cb" data-marcar="${it.uid}"${marcado ? ' checked' : ''}${travado ? ' disabled' : ''} aria-label="Lançar esta linha"></td>
        ${c.map((v, i) => `<td data-rot="${ROTULOS_COLUNAS[i]}"${i === 1 ? ' class="esq"' : ''}>${v}</td>`).join('')}
        <td data-rot="Situação" class="tx-td-sit"><span class="${chipTom(info.cls)}">${info.txt}</span>${s.motivo && s.situacao !== 'lancado' ? `<small>${esc(s.motivo)}</small>` : ''}${it.aviso ? `<small class="tx-aviso-linha">${ic('warning')}${esc(it.aviso)}</small>` : ''}${linkNovoAtivoHtml(it, s)}
          ${rfCompra(it) ? `<label class="tx-taxa">Taxa contratada <input type="text" class="input" data-taxa="${it.uid}" value="${esc(it.taxaContratada || '')}" placeholder="IPCA + 6,5%" aria-label="Taxa contratada (opcional)"></label>` : ''}
        </td>
      </tr>`;
  }).join('');
  return `
    <div class="tx-rev-grupo">
      <div class="tx-rev-grupo-cab">
        <h3><span class="tx-dot" style="background:var(${COR_DESTINO[destino]})"></span>${DESTINOS[destino].nome}</h3>
        <span>${novos} novo${novos === 1 ? '' : 's'} · ${itens.length} ${rev.origem === 'Colado' ? 'na tabela' : 'no arquivo'} <small>→ aba ${esc(DESTINOS[destino].aba)}</small></span>
        ${lancados.length ? `<button type="button" class="btn btn-text btn-sm" data-mostrar-lancados="${destino}">${estado.mostrarLancados[destino] ? 'esconder' : 'mostrar'} ${lancados.length} já lançado${lancados.length > 1 ? 's' : ''}</button>` : ''}
      </div>
      ${mostrar.length ? `
      <div class="card card-flat tx-card-tabela"><div class="tabela-wrap tx-tabela-wrap">
        <table class="tabela tx-tabela tx-tabela-rev">
          <thead><tr><th class="tx-td-check"></th><th>Data</th><th class="esq">Ativo</th><th>Tipo</th><th>Qtd</th><th>Preço</th><th>Valor</th><th>Situação</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div></div>` : '<p class="tx-fraco tx-rev-tudo">Tudo desse grupo já está na planilha.</p>'}
    </div>`;
}

/** "3 linhas já estavam na planilha e foram ignoradas." (06/10/2026: reimportar não repete nada) */
export function textoIgnoradas(n) {
  return n === 1 ? '1 linha já estava na planilha e foi ignorada.' : `${n} linhas já estavam na planilha e foram ignoradas.`;
}

function revisaoHtml(estado) {
  const rev = estado.revisao;
  if (!rev) return '';
  if (rev.carregando) return `<div class="tx-aviso" role="status"><span class="tx-spinner" aria-hidden="true"></span>${esc(rev.carregando)}</div>`;
  const cont = { novo: 0, lancado: 0, parecido: 0, bloqueado: 0, invalido: 0, gravado: 0 };
  rev.itens.forEach((it) => { const s = (rev.situacao[it.uid] || {}).situacao || 'novo'; cont[s] = (cont[s] || 0) + 1; });
  const marcados = rev.itens.filter((it) => rev.marcados[it.uid]).length;
  const arquivos = rev.arquivos.map((a) => `
    <span class="tx-arq${a.erro ? ' erro' : ''}" title="${esc(a.erro || '')}"><b>${esc(a.nome)}</b><small>${a.erro ? esc(a.erro) : `${esc(TIPOS_ARQUIVO[a.tipo] || a.tipo)} · ${a.itens.length} linha${a.itens.length === 1 ? '' : 's'}`}</small></span>`).join('');
  const ignorados = rev.ignorados.length ? `
    <details class="tx-ignorados">
      <summary>${rev.ignorados.length} linha${rev.ignorados.length > 1 ? 's' : ''} ${rev.origem === 'Colado' ? 'da tabela' : 'dos arquivos'} não vira${rev.ignorados.length > 1 ? 'm' : ''} lançamento</summary>
      <div class="card card-flat tx-card-tabela"><div class="tabela-wrap tx-tabela-wrap"><table class="tabela tx-tabela tx-tabela-ign">
        <thead><tr><th>Data</th><th class="esq">Ativo</th><th class="esq">O que é</th><th class="esq">Por quê</th></tr></thead>
        <tbody>${rev.ignorados.map((g) => `<tr><td data-rot="Data">${formatDMA(g.data)}</td><td data-rot="Ativo" class="esq"><b>${esc(g.ativo)}</b></td><td data-rot="O que é" class="esq">${esc(g.detalhe)}</td><td data-rot="Por quê" class="esq">${esc(g.motivo)}</td></tr>`).join('')}</tbody>
      </table></div></div>
    </details>` : '';
  return `
    <div class="tx-revisao">
      <div class="tx-arqs">${arquivos}</div>
      ${rev.erro ? erroLinhaHtml(rev.erro) : ''}
      ${rev.resultado ? `<div class="tx-aviso ok" role="status">${ic('check-circle')}<span>${rev.resultado}</span></div>` : ''}
      ${htmlConferenciaB3(rev.conferenciaB3)}
      ${rev.itens.length ? `
      <div class="tx-rev-chips">
        ${cont.gravado ? `<span class="tx-chip chip-tonal chip-good"><b>${cont.gravado}</b> lançados agora</span>` : ''}
        <span class="tx-chip chip-tonal chip-good"><b>${cont.novo}</b> novos</span>
        <span class="tx-chip chip-tonal"><b>${cont.lancado}</b> já lançados</span>
        ${cont.parecido ? `<span class="tx-chip chip-tonal chip-warn"><b>${cont.parecido}</b> parecidos</span>` : ''}
        ${cont.bloqueado + cont.invalido ? `<span class="tx-chip chip-tonal chip-bad"><b>${cont.bloqueado + cont.invalido}</b> com problema</span>` : ''}
      </div>
      ${cont.lancado ? `<p class="tx-nota tx-nota-ignoradas" role="status">${esc(textoIgnoradas(cont.lancado))} Reimportar o mesmo arquivo não repete nada na planilha.</p>` : ''}
      ${cont.parecido ? '<p class="tx-nota"><b>Parecido</b>: a planilha já tem o mesmo ativo, dia e tipo com essa quantidade ou valor, só dividido em linhas diferentes. Fica desmarcado; marque se for mesmo outra operação.</p>' : ''}
      ${ORDEM_DESTINOS.map((d) => grupoRevisaoHtml(estado, d)).join('')}` : ''}
      ${ignorados}
      <div class="tx-rev-acoes">
        <button type="button" class="btn btn-filled" data-lanc="gravar"${marcados ? '' : ' disabled'}>${marcados ? `Lançar ${marcados} na planilha` : 'Nada marcado pra lançar'}</button>
        ${cont.bloqueado ? '<button type="button" class="btn btn-outlined" data-lanc="reconferir" title="Depois de cadastrar o ativo em Carteiras, confere de novo o que ainda não foi lançado">Conferir de novo</button>' : ''}
        <button type="button" class="btn btn-text" data-lanc="descartar">${cont.gravado ? 'Fechar' : 'Descartar'}</button>
      </div>
      ${rev.consolidacao && rev.consolidacao.pendente ? `
      <div class="tx-consol" role="status">
        ${ic('warning')}
        <div><b>Consolidação necessária.</b> ${esc(textoConsolidacao(rev.consolidacao))} Consolidar recalcula gráficos, rentabilidade e totais com o que acabou de entrar.</div>
        <button type="button" class="btn btn-filled" data-lanc="consolidar">Consolidar agora</button>
      </div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// 2. Lançar manualmente
// ---------------------------------------------------------------------------

const MANUAL_DESTINOS = [
  { id: 'transacoes', nome: 'Compra/venda Brasil' }, { id: 'transacoesUsa', nome: 'Compra/venda EUA' },
  { id: 'rendaFixa', nome: 'Renda Fixa' }, { id: 'proventos', nome: 'Provento Brasil' }, { id: 'proventosUsa', nome: 'Provento EUA' },
];

function campo(rotulo, html, extra = '') {
  return `<label class="tx-rotulo${extra}">${rotulo}${html.replace(/<input /g, '<input class="input" ').replace(/<select /g, '<select class="select" ')}</label>`;
}

function manualCamposHtml(estado, dados) {
  const d = estado.manual.destino;
  const hoje = dados.hoje;
  const tickers = (classes) => classes.flatMap((c) => (dados.classes[c] || []).map((a) => a.ticker));
  if (d === 'transacoes' || d === 'transacoesUsa') {
    const lista = tickers(d === 'transacoesUsa' ? ['acoesEua'] : ['acoes', 'fiis']);
    return `
      ${campo('Ativo', `<input type="text" name="ticker" list="txListaTickers" required autocapitalize="characters" placeholder="${d === 'transacoesUsa' ? 'VNOM' : 'PETR4'}">`)}
      ${campo('Data', `<input type="date" name="data" value="${hoje}" required>`)}
      ${campo('Tipo', '<select name="tipo"><option>Compra</option><option>Venda</option></select>')}
      ${campo('Quantidade', '<input type="text" inputmode="decimal" name="qtd" required placeholder="0">')}
      ${campo(`Preço (${d === 'transacoesUsa' ? 'US$' : 'R$'})`, '<input type="text" inputmode="decimal" name="preco" required placeholder="0,00">')}
      ${campo('Taxa (opcional)', '<input type="text" inputmode="decimal" name="taxa" placeholder="0,00">')}
      <datalist id="txListaTickers">${lista.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;
  }
  if (d === 'rendaFixa') {
    const titulos = (dados.classes.rendaFixa || []);
    return `
      ${campo('Título', `<input type="text" name="produto" list="txListaTitulos" required placeholder="Tesouro IPCA+ 2035">`, ' tx-rotulo-largo')}
      ${campo('Instituição', `<input type="text" name="instituicao" list="txListaInst" placeholder="XP INVESTIMENTOS CCTVM S/A">`)}
      ${campo('Data', `<input type="date" name="data" value="${hoje}" required>`)}
      ${campo('Movimentação', '<select name="movimentacao"><option>Compra</option><option>Venda</option><option>Resgate</option><option>Juros</option><option>Cobrança de Taxa Semestral</option></select>')}
      ${campo('Quantidade', '<input type="text" inputmode="decimal" name="qtd" placeholder="0,00">')}
      ${campo('Preço unitário', '<input type="text" inputmode="decimal" name="preco" placeholder="0,00">')}
      ${campo('Valor (R$)', '<input type="text" inputmode="decimal" name="valor" required placeholder="0,00">')}
      ${campo('Taxa contratada (compra)', '<input type="text" name="taxaContratada" placeholder="IPCA + 6,5%">')}
      <datalist id="txListaTitulos">${titulos.map((t) => `<option value="${esc(t.titulo)}"></option>`).join('')}</datalist>
      <datalist id="txListaInst">${[...new Set(titulos.map((t) => t.instituicao))].map((i) => `<option value="${esc(i)}"></option>`).join('')}</datalist>`;
  }
  const lista = tickers(d === 'proventosUsa' ? ['acoesEua'] : ['acoes', 'fiis']);
  return `
    ${campo('Ativo', `<input type="text" name="ticker" list="txListaTickers" required autocapitalize="characters">`)}
    ${campo('Data com (opcional)', '<input type="date" name="dataCom">')}
    ${campo('Pagamento', `<input type="date" name="dataPagamento" value="${hoje}" required>`)}
    ${campo('Tipo', `<select name="tipo">${(d === 'proventosUsa' ? ['Dividendo'] : ['Rendimento', 'Dividendo', 'JCP', 'Juros', 'Amortização', 'Reembolso']).map((t) => `<option>${t}</option>`).join('')}</select>`)}
    ${campo('Quantidade', '<input type="text" inputmode="decimal" name="qtd" placeholder="0">')}
    ${campo(`Valor por cota (${d === 'proventosUsa' ? 'US$' : 'R$'})`, '<input type="text" inputmode="decimal" name="valorPorCota" placeholder="0,00">')}
    ${campo(`Valor líquido (${d === 'proventosUsa' ? 'US$' : 'R$'})`, '<input type="text" inputmode="decimal" name="valor" required placeholder="qtd × valor por cota">')}
    <datalist id="txListaTickers">${lista.map((t) => `<option value="${esc(t)}"></option>`).join('')}</datalist>`;
}

function manualHtml(estado, dados) {
  const m = estado.manual;
  return `
    <section class="tx-secao" aria-labelledby="txManualTitulo">
      <details class="card tx-manual"${m.aberto ? ' open' : ''} id="txManualDetalhe">
        <summary class="tx-sec-cab"><span class="tx-sec-tit"><h2 id="txManualTitulo">Lançar manualmente</h2><span class="tx-dica">uma compra, venda ou provento avulso</span></span>${ic('expand-more', 'ico tx-sec-seta')}</summary>
        <div class="tx-sec-corpo">
        <div class="segmented tx-seg tx-seg-manual" role="group" aria-label="Onde lançar">${MANUAL_DESTINOS.map((x) => `<button type="button" class="tx-seg-btn${m.destino === x.id ? ' active' : ''}" aria-pressed="${m.destino === x.id}" data-manual-destino="${x.id}"><span class="tx-dot" style="background:var(${COR_DESTINO[x.id]})"></span>${x.nome}</button>`).join('')}</div>
        <form class="tx-form-manual" id="txFormManual" autocomplete="off" novalidate>
          <div class="tx-form-grade">${manualCamposHtml(estado, dados)}</div>
          ${m.mensagem ? `<div class="tx-aviso ${m.mensagem.tipo || ''}" role="status">${ic(m.mensagem.tipo === 'erro' ? 'error' : 'warning')}<span>${m.mensagem.html}</span></div>` : ''}
          <div class="tx-botoes">
            ${m.pendente ? '<button type="button" class="btn btn-filled" data-lanc="forcar-manual">Lançar mesmo assim</button>' : ''}
            <button type="submit" class="btn ${m.pendente ? 'btn-outlined' : 'btn-filled'}">Lançar na aba ${esc(DESTINOS[m.destino].aba)}</button>
          </div>
        </form>
        </div>
      </details>
    </section>`;
}

/** Form -> item (mesmo formato da importação). Devolve { item } ou { erro }. */
export function itemDoFormulario(destino, valores) {
  const n = (k) => lerNumeroCampo(valores[k]);
  const t = (k) => String(valores[k] || '').trim();
  if (destino === 'transacoes' || destino === 'transacoesUsa') {
    const it = { destino, ticker: t('ticker').toUpperCase(), data: t('data'), tipo: t('tipo') || 'Compra', qtd: n('qtd'), preco: n('preco'), taxa: n('taxa') || 0 };
    if (!it.ticker || !it.data || !(it.qtd > 0) || !(it.preco >= 0) || it.preco == null) return { erro: 'Preencha ativo, data, quantidade e preço.' };
    return { item: it };
  }
  if (destino === 'rendaFixa') {
    const mov = t('movimentacao') || 'Compra';
    const it = {
      destino, produto: t('produto'), data: t('data'), movimentacao: mov, entradaSaida: /compra|juros|aplica/i.test(mov) ? 'Credito' : 'Debito',
      instituicao: t('instituicao'), qtd: n('qtd'), preco: n('preco'), valor: n('valor'), taxaContratada: t('taxaContratada'),
    };
    if (!it.produto || !it.data || !(it.valor > 0)) return { erro: 'Preencha título, data e valor.' };
    return { item: it };
  }
  const qtd = n('qtd');
  const porCota = n('valorPorCota');
  const valor = n('valor') != null ? n('valor') : (qtd && porCota ? Math.round(qtd * porCota * 100) / 100 : null);
  const it = { destino, ticker: t('ticker').toUpperCase(), dataCom: t('dataCom'), dataPagamento: t('dataPagamento'), tipo: t('tipo'), qtd: qtd || 0, valorPorCota: porCota || 0, valor };
  if (!it.ticker || !it.dataPagamento || !(valor > 0)) return { erro: 'Preencha ativo, data de pagamento e valor.' };
  return { item: it };
}

// ---------------------------------------------------------------------------
// 3. Todos os lançamentos
// ---------------------------------------------------------------------------

/**
 * ticker -> histórico de compras (transacoes/transacoesUsa, tipo Compra,
 * preço > 0), ordenado - pro indicador "vs. anterior" de cada linha de
 * compra (não depende do agrupamento por mês: olha o histórico inteiro).
 */
function historicoComprasPorAtivo(todos) {
  const mapa = {};
  (todos || []).forEach((l) => {
    if ((l.destino === 'transacoes' || l.destino === 'transacoesUsa') && /compra/i.test(l.tipo) && num(l.preco) > 0) {
      (mapa[l.ativo] = mapa[l.ativo] || []).push({ data: l.data, preco: l.preco });
    }
  });
  Object.values(mapa).forEach((arr) => arr.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)));
  return mapa;
}

/** A compra do mesmo ativo imediatamente ANTES de `data` (ou null). */
function compraAnterior(mapa, ativo, data) {
  const hist = mapa[ativo];
  if (!hist) return null;
  let prev = null;
  for (let i = 0; i < hist.length; i += 1) {
    if (hist[i].data < data) prev = hist[i]; else break;
  }
  return prev;
}

export function csvLancamentos(lista) {
  const cel = (v) => {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = ['Data', 'Onde', 'Ativo', 'Tipo', 'Quantidade', 'Preço', 'Valor', 'Moeda', 'Instituição'];
  const linhas = lista.map((l) => [formatDMA(l.data), DESTINOS[l.destino] ? DESTINOS[l.destino].nome : l.destino, l.ativo, l.tipo, l.qtd, l.preco, l.valor, l.moeda, l.inst || ''].map(cel).join(';'));
  return `﻿${[cab.join(';'), ...linhas].join('\r\n')}\r\n`;
}

/** filtro (onde), ano, ativo (ticker exato) e busca (texto livre). */
export function filtrarLista(lista, { filtro = 'todos', ano = '', busca = '', ativo = '' } = {}) {
  const b = busca.trim().toLowerCase();
  return (lista || []).filter((l) => {
    if (filtro === 'proventos' ? !(l.destino === 'proventos' || l.destino === 'proventosUsa') : (filtro !== 'todos' && l.destino !== filtro)) return false;
    if (ano && String(l.data).slice(0, 4) !== String(ano)) return false;
    if (ativo && l.ativo !== ativo) return false;
    if (b && !`${l.ativo} ${l.tipo} ${l.inst || ''}`.toLowerCase().includes(b)) return false;
    return true;
  });
}

const NOME_CLASSE_LISTA = { acoes: 'Ações', fiis: 'FIIs', acoesEua: 'Ações EUA', rendaFixa: 'Renda Fixa' };
const COR_CLASSE_LISTA = { acoes: corClasse('acoes'), fiis: corClasse('fiis'), acoesEua: corClasse('acoesEua'), rendaFixa: corClasse('rendaFixa') };

/** Classe de um lançamento (pro logo, a bolinha de cor e o nome embaixo do ativo). */
function classeDoLancamento(l, mapaClasse) {
  if (l.destino === 'rendaFixa') return 'rendaFixa';
  if (l.destino === 'transacoesUsa' || l.destino === 'proventosUsa') return 'acoesEua';
  return mapaClasse[l.ativo] || (/11[A-Z]?$/.test(String(l.ativo || '')) ? 'fiis' : 'acoes');
}

/** Tipo como tag colorida (compra azul, venda vermelha, aplicação âmbar, provento verde). */
function tipoTagHtml(l) {
  const t = String(l.tipo || '');
  let cls = 'outro';
  if (l.destino === 'proventos' || l.destino === 'proventosUsa') cls = 'prov';
  else if (l.destino === 'rendaFixa') cls = /compra|aplica/i.test(t) ? 'aplic' : (/venda|resgate/i.test(t) ? 'venda' : (/juros/i.test(t) ? 'prov' : 'outro'));
  else if (/compra/i.test(t)) cls = 'compra';
  else if (/venda/i.test(t)) cls = 'venda';
  const limpo = t.trim().toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const rotulo = l.destino === 'rendaFixa' && /compra|aplica/i.test(t) ? 'Aplicação' : limpo;
  return `<span class="tx-tipo tx-tipo-${cls}">${esc(rotulo)}</span>`;
}

/** 05/10/2026 (A-24): marca "a confirmar" na linha provisória (aporte concluído que a importação da B3 ainda não trouxe). */
const etiquetaAConfirmar = (l) => (l.aConfirmar ? `<span class="tx-tipo tx-tipo-aconf" title="${l.lancavel ? 'Aporte concluído de Ações EUA: ainda não foi lançado em Transações - USA' : 'Aporte concluído: confirma quando a importação da B3 trouxer o lançamento'}">a confirmar</span>` : '');
/** 07/10/2026: Ações EUA não têm importação da B3 - o aporte concluído já é o lançamento; se a gravação não aconteceu, "Lançar agora" faz. */
const botaoLancarAgora = (l) => (l.aConfirmar && l.lancavel ? `<button type="button" class="btn btn-tonal btn-sm tx-lancar-agora" data-lanc="lancar-eua" data-aporte="${esc(l.aporteId || '')}">Lançar agora</button>` : '');

function linhaLancHtml(l, ctxLista) {
  const { anteriorMapa, mapaClasse } = ctxLista;
  const classe = classeDoLancamento(l, mapaClasse);
  const rf = l.destino === 'rendaFixa';
  const logo = rf ? logoRendaFixaHtml({ indexador: /selic/i.test(l.ativo) ? 'SELIC' : (/ipca/i.test(l.ativo) ? 'IPCA' : ''), tipoInvestimento: l.ativo, instituicao: l.inst }) : logoAtivoHtml(l.ativo);
  const compra = (l.destino === 'transacoes' || l.destino === 'transacoesUsa') && /compra/i.test(l.tipo);
  const ant = compra ? compraAnterior(anteriorMapa, l.ativo, l.data) : null;
  const dif = ant && num(l.preco) > 0 ? (l.preco / ant.preco - 1) * 100 : null;
  const usdLinha = l.moeda === 'USD' && l.valorBRL != null;
  return `
    <tr class="tx-lista-linha${l.aConfirmar ? ' tx-lista-aconfirmar' : ''}">
      <td data-rot="Data" class="tx-mono tx-lista-data">${formatDMA(l.data).slice(0, 5)}</td>
      <td data-rot="Ativo" class="esq">${ativoCelHtml(logo, '', l.ativo, { linhaTopo: `<span class="tx-dot" style="background:var(${COR_CLASSE_LISTA[classe]})"></span>${NOME_CLASSE_LISTA[classe]}${l.inst ? ` · ${esc(l.inst)}` : ''}` })}${l.aConfirmar ? `<span class="tx-aconf-linha">${etiquetaAConfirmar(l)}${botaoLancarAgora(l)}</span>` : ''}</td>
      <td data-rot="Tipo"><span class="tx-tipo-linha">${tipoTagHtml(l)}<button type="button" class="icon-btn tx-lista-mais" data-lista-mais="${esc(l.ativo)}" aria-label="Mais ações de ${esc(l.ativo)}" aria-haspopup="menu">${ic('more-horiz')}</button></span></td>
      <td data-rot="Qtd"${rf || !l.qtd ? ' class="tx-td-vazio"' : ''}>${rf || !l.qtd ? '' : `<span class="chip-tonal tx-chip-qtd">×${numTxt(l.qtd, 4)}</span>`}</td>
      <td data-rot="Preço" class="tx-mono${l.preco == null || rf ? ' tx-td-vazio' : ''}">${l.preco == null || rf ? '' : dinheiro(l.preco, l.moeda)}</td>
      <td data-rot="Total" class="tx-mono"><b>${l.valor == null ? '—' : dinheiro(l.valor, l.moeda)}</b></td>
      <td data-rot="Em reais" class="tx-mono${usdLinha ? '' : ' tx-td-vazio'}">${usdLinha ? `${formatBRL(l.valorBRL)}<small>câmbio ${formatNumeroBR(l.cambio, 2)}</small>` : '<span class="tx-fraco">—</span>'}</td>
      <td data-rot="vs. compra anterior"${dif == null ? ' class="tx-td-vazio"' : ''}>${dif == null ? '' : `<span class="var tx-vs ${dif > 0 ? 'desce' : 'sobe'}">${ic(dif > 0 ? 'arrow-circle-up' : 'arrow-circle-down')}${numTxt(Math.abs(dif), 1)}%</span><small>vs ${formatDMA(ant.data).slice(0, 5)}/${ant.data.slice(2, 4)}</small>`}</td>
    </tr>`;
}

function totalMesHtml(rotulo, valor) {
  return `<span class="tx-lista-mes-tot">${rotulo} <b>${formatBRL(valor)}</b></span>`;
}

function grupoMesHtml(mesChave, itensDoMes, estadoLista, ctxLista) {
  const movs = itensDoMes.filter((l) => l.destino !== 'proventos' && l.destino !== 'proventosUsa').sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  const provs = itensDoMes.filter((l) => l.destino === 'proventos' || l.destino === 'proventosUsa').sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  const brl = (l) => (l.moeda === 'USD' ? num(l.valorBRL) : num(l.valor));
  const compras = movs.filter((l) => !l.aConfirmar && /compra|aplica/i.test(l.tipo)).reduce((s, l) => s + brl(l), 0);
  const aConfirmar = movs.filter((l) => l.aConfirmar).reduce((s, l) => s + brl(l), 0); // 05/10/2026 (A-24): fora de "Compras" (ainda não está nas abas)
  const vendas = movs.filter((l) => /venda|resgate/i.test(l.tipo)).reduce((s, l) => s + brl(l), 0);
  const pv = provs.reduce((s, l) => s + brl(l), 0);
  const aberto = !!estadoLista.proventosAbertos[mesChave];
  const tickersProv = [...new Set(provs.map((p) => p.ativo))];
  return `
    <tbody>
      <tr class="tx-lista-mes">
        <td colspan="8">
          <span class="tx-lista-mes-nome">${MESES_LONGOS[Number(mesChave.slice(5, 7)) - 1]} <small>${mesChave.slice(0, 4)}</small></span>
          ${compras ? totalMesHtml('Compras', compras) : ''}
          ${aConfirmar ? totalMesHtml('A confirmar', aConfirmar) : ''}
          ${vendas ? totalMesHtml('Vendas', vendas) : ''}
          ${pv ? totalMesHtml('Proventos', pv) : ''}
        </td>
      </tr>
      ${movs.map((l) => linhaLancHtml(l, ctxLista)).join('')}
      ${provs.length ? `
      <tr class="tx-lista-provs">
        <td colspan="3" class="esq"><span class="tx-tipo tx-tipo-prov">${provs.length} provento${provs.length > 1 ? 's' : ''}</span> <span class="tx-fraco">${esc(tickersProv.slice(0, 6).join(', '))}${tickersProv.length > 6 ? ` +${tickersProv.length - 6}` : ''}</span></td>
        <td class="tx-td-vazio"></td><td class="tx-td-vazio"></td>
        <td data-rot="Total" class="tx-mono"><b>${formatBRL(pv)}</b></td>
        <td class="tx-td-vazio"></td>
        <td class="tx-lista-provs-acao"><button type="button" class="btn btn-text btn-sm" data-provs-toggle="${mesChave}" aria-expanded="${aberto}">${aberto ? 'ocultar ‹' : `ver os ${provs.length} ›`}</button></td>
      </tr>
      ${aberto ? provs.map((l) => linhaLancHtml(l, ctxLista)).join('') : ''}` : ''}
    </tbody>`;
}

const PERIODOS_GRAFICO = ['6m', '1a', 'tudo'];
function graficoListaHtml(estado) {
  const g = estado.lista.grafico;
  if (!g || !g.aberto) return '';
  let corpo = '<div class="tx-lista-grafico-corpo" id="txListaGrafico"></div>';
  if (g.carregando) corpo = '<div class="tx-aviso" role="status"><span class="tx-spinner" aria-hidden="true"></span>Carregando o histórico de preço…</div>';
  const periodo = g.periodo || '1a';
  return `
    <div class="card tx-lista-grafico">
      <div class="tx-lista-grafico-cab">
        <h3>Suas compras no preço</h3>
        <span class="hint">${esc(g.ticker || '')} · cada ponto é uma compra sua (preço que você pagou)</span>
        <button type="button" class="icon-btn tx-mapa-pop-fechar" data-lanc="grafico" aria-label="Fechar gráfico">${ic('close')}</button>
      </div>
      ${g.serie ? `<div class="tx-grafico-periodo" id="txGrafPeriodo">${botoesSegmentadoHtml(PERIODOS_GRAFICO, ehPeriodoPersonalizado(periodo) ? null : periodo)}</div>` : ''}
      ${corpo}
    </div>`;
}

const deslocarMeses = (iso, n) => {
  const t = Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1) - n;
  const dia = Math.min(Number(iso.slice(8, 10)), 28);
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};
/** A série do gráfico no período escolhido ('6m' | '1a' | 'tudo' | { inicio, fim }); sempre só preços > 0. */
export function recortarSerieGrafico(serie, periodo = '1a') {
  const boa = (serie || []).filter((p) => typeof p.preco === 'number' && p.preco > 0);
  if (!boa.length) return [];
  if (ehPeriodoPersonalizado(periodo)) return recortarPorIntervalo(boa, periodo, { comBase: false });
  if (periodo === 'tudo') return boa;
  if (periodo === '6m') { const fim = boa[boa.length - 1].data; const ini = deslocarMeses(fim, 6); return boa.filter((p) => p.data >= ini); }
  return ultimos12Meses(boa);
}

/** Os últimos 12 meses do histórico de preço (a série vem inteira do back-end). */
export function ultimos12Meses(serie) {
  if (!serie || !serie.length) return [];
  const fim = serie[serie.length - 1].data;
  const ini = `${Number(fim.slice(0, 4)) - 1}${fim.slice(4)}`;
  return serie.filter((p) => p.data >= ini && typeof p.preco === 'number' && p.preco > 0);
}

function listaHtml(estado, dados) {
  const f = estado.lista;
  const reais = dados.lancamentos || [];
  // 05/10/2026 (A-24): as linhas provisórias ("a confirmar", derivadas dos aportes concluídos) entram só na lista;
  // gráfico, "vs. compra anterior" e CSV continuam só com o que está de verdade nas abas.
  const provisorios = (dados.aConfirmar || []).map((l) => ({ ...l, aConfirmar: true }));
  const todos = [...provisorios, ...reais];
  const anos = [...new Set(todos.map((l) => String(l.data).slice(0, 4)).filter(Boolean))].sort().reverse();
  const porDestinoAno = filtrarLista(todos, { filtro: f.filtro, ano: f.ano });
  const ativos = [...new Set([...porDestinoAno.map((l) => l.ativo), f.ativo].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const filtrados = filtrarLista(todos, f);
  const ctxLista = { anteriorMapa: historicoComprasPorAtivo(reais), mapaClasse: classePorTicker(dados.classes || {}) };
  const meses = [...new Set(filtrados.map((l) => String(l.data).slice(0, 7)))].sort().reverse();
  const mesesVisiveis = meses.slice(0, f.mesesVisiveis || MESES_LISTA_INICIAL);
  const podeGrafico = !!f.ativo && todasAsCompras(reais, ctxLista.mapaClasse).some((c) => c.ativo === f.ativo);
  const graficoAberto = !!(f.grafico && f.grafico.aberto);
  return `
    <section class="tx-secao" id="txLista" aria-labelledby="txListaTitulo">
      <div class="tx-secao-cab">
        <h2 id="txListaTitulo">Todos os lançamentos</h2>
        <span class="hint">${filtrados.length} de ${todos.length} · direto das abas da planilha${provisorios.length ? ` · ${provisorios.length} a confirmar` : ''}</span>
        <div class="tx-controles">
          <label class="tx-select-caixa"><span class="sr-only">Ativo</span><select class="select tx-select" id="txListaAtivo"><option value="">Todos os ativos</option>${ativos.map((a) => `<option value="${esc(a)}"${f.ativo === a ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
          <label class="tx-select-caixa"><span class="sr-only">Ano</span><select class="select tx-select" id="txListaAno"><option value="">Todos os anos</option>${anos.map((a) => `<option value="${a}"${String(f.ano) === a ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
          <button type="button" class="btn btn-outlined btn-sm tx-csv" data-lanc="csv" title="Baixar a lista (com o filtro atual) como CSV">${ic('download')}CSV</button>
        </div>
      </div>
      <div class="tx-lista-filtros">
        <div class="tabs tabs-sub tx-lista-abas" role="group" aria-label="Onde">${FILTROS_LISTA.map((x) => `<button type="button" class="tab${f.filtro === x.id ? ' on' : ''}" aria-pressed="${f.filtro === x.id}" data-lista-filtro="${x.id}">${x.id !== 'todos' ? `<span class="tx-dot" style="background:var(${COR_DESTINO[x.id]})"></span>` : ''}<span class="tab-rotulo">${x.nome}</span></button>`).join('')}</div>
        <input type="search" class="input tx-busca" id="txListaBusca" placeholder="Buscar ativo ou tipo" value="${esc(f.busca)}" aria-label="Buscar lançamento">
        ${podeGrafico ? `<button type="button" class="btn btn-tonal btn-sm" data-lanc="grafico">${ic('show-chart')}${graficoAberto ? 'Ocultar gráfico' : `Ver gráfico do preço de ${esc(f.ativo)}`}</button>` : ''}
      </div>
      ${provisorios.length ? `<p class="tx-aconf-aviso">${ic('info')}<span>${provisorios.length} compra${provisorios.length === 1 ? '' : 's'} de aportes concluídos ainda não ${provisorios.length === 1 ? 'aparece' : 'aparecem'} nas abas de Transações (linhas <span class="tx-tipo tx-tipo-aconf">a confirmar</span>): confirmam quando a importação da B3 trouxer o lançamento (Renda Fixa: quando o lançamento for feito; Ações EUA: lançadas na hora em que o aporte é concluído - se alguma ficou pendente, use "Lançar agora").</span></p>` : ''}
      <div id="txListaGraficoCorpo">${graficoListaHtml(estado)}</div>
      <div id="txListaCorpo">
        ${filtrados.length ? `
        <div class="card card-flat tx-card-tabela"><div class="tabela-wrap tx-tabela-wrap">
          <table class="tabela tx-tabela tx-tabela-lista">
            <thead><tr><th>Data</th><th class="esq">Ativo</th><th>Tipo</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Em reais</th><th>vs. compra anterior</th></tr></thead>
            ${mesesVisiveis.map((m) => grupoMesHtml(m, filtrados.filter((l) => String(l.data).slice(0, 7) === m), f, ctxLista)).join('')}
          </table>
        </div></div>
        ${meses.length > mesesVisiveis.length ? `<button type="button" class="btn btn-outlined tx-mais" data-lanc="mais-meses">Ver mais meses (faltam ${meses.length - mesesVisiveis.length})</button>` : ''}`
        : (todos.length
          ? estadoVazioHtml({ icone: 'filter-list', titulo: 'Nenhum lançamento com esse filtro', texto: 'Tire algum filtro pra ver mais.', acao: { rotulo: 'Limpar filtros', atributos: 'data-lanc="limpar-filtros"' } })
          : estadoVazioHtml({ icone: 'receipt-long', titulo: 'Nenhum lançamento ainda', texto: 'Importe os extratos da B3 ou da Interactive Brokers, ou lance uma operação à mão.', acao: { rotulo: 'Importar extratos', atributos: 'data-lanc="ir-importar"' } }))}
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Aba inteira
// ---------------------------------------------------------------------------

export function estadoInicialLancamentos() {
  return {
    arrastando: false, revisao: null, mostrarLancados: {},
    colar: { aberto: false, texto: '', destino: 'rendaFixa', destinoEscolhido: false, titulo: '', instituicao: '', taxa: '', taxaTocada: false, destinoRf: 'longo-prazo', erro: '' },
    manual: { aberto: false, destino: 'transacoes', mensagem: null, pendente: null },
    lista: {
      filtro: 'todos', ano: '', busca: '', ativo: '', limite: POR_PAGINA, mesesVisiveis: MESES_LISTA_INICIAL,
      proventosAbertos: {}, grafico: { aberto: false, ticker: null, carregando: false, serie: null, erro: null },
    },
  };
}

/**
 * ctx: { doc, el, dados, estado, importar(itens, opcoes), carregarXlsx, recarregar(), baixar(nome, conteudo),
 *   getHistoricoAtivo(ticker) } - getHistoricoAtivo é opcional: sem ele, o botão "Ver gráfico" simplesmente
 *   não aparece pra ativos sem compra (podeGrafico já filtra isso) ou fica sem efeito se chamado.
 */
export function renderLancamentos(ctx) {
  const { el, dados, estado } = ctx;
  destruirGrafico(el);
  el.innerHTML = `${importarHtml(estado, dados)}${manualHtml(estado, dados)}${listaHtml(estado, dados)}`;
  el._txCtx = ctx;
  desenharGraficoLista(ctx);
  ligarMenusLista(ctx);
  if (!el._txLancLigado) { el._txLancLigado = true; ligarLancamentos(el); }
}

/**
 * 07/10/2026 (Tiago: "garanta que esteja sendo registrado pra que eu não fique enviando a mesma coisa"): o extrato de
 * proventos da B3 é registrado já na conferência (Proventos.gs!registrarExtratoB3Proventos_). Aqui a tela diz que
 * registrou - ou que esse extrato já tinha chegado (nada duplica).
 */
export function htmlConferenciaB3(c) {
  if (!c || !c.ok || !Array.isArray(c.meses) || !c.meses.length) return '';
  const meses = c.meses.map((m) => formatMesAno(m)).join(', ');
  const texto = c.jaEnviado
    ? `Extrato de proventos da B3: esse já tinha chegado (${meses}). Nada novo pra conferir e nada foi duplicado.`
    : `Extrato de proventos da B3 registrado (${meses}): ${c.linhasNovas} provento${c.linhasNovas === 1 ? '' : 's'} na conferência${c.ignoradasDuplicadas ? `, ${c.ignoradasDuplicadas} já estava${c.ignoradasDuplicadas === 1 ? '' : 'm'} lá` : ''}. Em Organização › Documentos ele já aparece como enviado.`;
  return `<div class="tx-aviso ok" role="status">${ic('check-circle')}<span>${esc(texto)}</span></div>`;
}

function redesenharRevisao(ctx) {
  const r = ctx.el.querySelector('#txRevisao');
  if (r) r.innerHTML = revisaoHtml(ctx.estado);
}

function redesenharLista(ctx) {
  const s = ctx.el.querySelector('#txLista');
  destruirGrafico(ctx.el);
  if (s) s.outerHTML = listaHtml(ctx.estado, ctx.dados);
  desenharGraficoLista(ctx);
  ligarMenusLista(ctx);
}

function destruirGrafico(el) {
  if (el._txGrafico) { try { el._txGrafico.destruir(); } catch (e) { /* já saiu da tela */ } el._txGrafico = null; }
}

/** "•••" de cada linha da lista (kit): ver só aquele ativo e, se ele tem compras, o gráfico do preço. */
function ligarMenusLista(ctx) {
  const { doc, el, dados, estado } = ctx;
  const mapaClasse = classePorTicker(dados.classes || {});
  const comCompra = new Set(todasAsCompras(dados.lancamentos, mapaClasse).map((c) => c.ativo));
  el.querySelectorAll('[data-lista-mais]').forEach((botao) => {
    const ativo = botao.getAttribute('data-lista-mais');
    ligarMenu(botao, () => [
      { rotulo: `Ver só ${ativo}`, icone: 'filter-list', aoClicar: () => { estado.lista.ativo = ativo; estado.lista.mesesVisiveis = MESES_LISTA_INICIAL; estado.lista.grafico = { ...estado.lista.grafico, aberto: false, serie: null, erro: null }; redesenharLista(ctx); } },
      ...(comCompra.has(ativo) && typeof ctx.getHistoricoAtivo === 'function' ? [{ rotulo: 'Ver gráfico do preço', icone: 'show-chart', aoClicar: () => abrirGraficoPara(ctx, ativo) }] : []),
    ], { doc });
  });
}

/** Desenha o gráfico "Suas compras no preço" (biblioteca de gráficos) dentro de #txListaGrafico, se estiver aberto e com histórico já carregado. */
function desenharGraficoLista(ctx) {
  const { doc, dados, estado } = ctx;
  const g = estado.lista.grafico;
  if (!g || !g.aberto) return;
  const cont = ctx.el.querySelector('#txListaGrafico');
  if (g.erro && cont) {
    // A-60/A-61: texto humano + "Tentar de novo"; o detalhe técnico fica recolhido
    mostrarErroCarga(cont, { tela: 'o histórico de preço', resposta: g.erro.resposta, erro: g.erro.erro, aoTentar: () => abrirGraficoPara(ctx, g.ticker), doc });
    return;
  }
  if (!g.serie || !cont) return;
  const mapaClasse = classePorTicker(dados.classes || {});
  const compras = todasAsCompras(dados.lancamentos, mapaClasse).filter((c) => c.ativo === g.ticker);
  const moeda = mapaClasse[g.ticker] === 'acoesEua' ? 'USD' : 'BRL';
  const formatMoeda = (v) => (moeda === 'USD' ? usd(v) : formatBRL(v));
  destruirGrafico(ctx.el);
  ctx.el._txGrafico = renderGraficoCompras(doc, cont, { serie: recortarSerieGrafico(g.serie, g.periodo || '1a'), compras, moeda, formatMoeda });
  // período canônico (6 meses | 1 ano | Tudo | Escolher período): só refaz o gráfico, a lista fica
  const seletor = ctx.el.querySelector('#txGrafPeriodo');
  const boa = recortarSerieGrafico(g.serie, 'tudo');
  if (seletor && !seletor._filtroPeriodo && boa.length) {
    ligarFiltroPeriodo(doc, seletor, {
      periodoInicial: g.periodo || '1a', limites: { min: boa[0].data, max: boa[boa.length - 1].data },
      aoMudar(p) { g.periodo = p; desenharGraficoLista(ctx); },
    });
  }
}

/** Abre (buscando o histórico, se preciso) o gráfico de `ticker` na lista - usado pelo botão da própria lista e pelo "Ver gráfico do preço" do popover do mapa de compras (aportes.js, evento transacoes:verGrafico). */
export async function abrirGraficoPara(ctx, ticker) {
  const f = ctx.estado.lista;
  if (f.ativo !== ticker) { f.filtro = 'todos'; f.ano = ''; f.busca = ''; f.mesesVisiveis = MESES_LISTA_INICIAL; }
  f.ativo = ticker;
  f.grafico = { aberto: true, ticker, carregando: true, serie: null, erro: null, periodo: (f.grafico && f.grafico.periodo) || '1a' };
  redesenharLista(ctx);
  if (typeof ctx.getHistoricoAtivo !== 'function') { f.grafico.carregando = false; redesenharLista(ctx); return; }
  try {
    const resp = await ctx.getHistoricoAtivo(ticker);
    f.grafico.carregando = false;
    if (resp && resp.ok) f.grafico.serie = (resp.resultado && resp.resultado.serie) || [];
    else f.grafico.erro = { resposta: resp || { ok: false } };
  } catch (e) {
    f.grafico.carregando = false;
    f.grafico.erro = { erro: e };
  }
  redesenharLista(ctx);
}

async function alternarGrafico(ctx) {
  const f = ctx.estado.lista;
  if (f.grafico && f.grafico.aberto) { f.grafico.aberto = false; redesenharLista(ctx); return; }
  await abrirGraficoPara(ctx, f.ativo);
}

async function processarArquivos(ctx, arquivos) {
  const { doc, estado } = ctx;
  if (!arquivos || !arquivos.length) return;
  estado.revisao = { carregando: `Lendo ${arquivos.length} arquivo${arquivos.length > 1 ? 's' : ''}…`, itens: [], arquivos: [], ignorados: [], situacao: {}, marcados: {} };
  estado.mostrarLancados = {};
  redesenharRevisao(ctx);
  const lidos = [];
  for (const arq of arquivos) {
    try { lidos.push(await lerArquivoDoNavegador(doc, arq, { carregarXlsx: ctx.carregarXlsx })); } catch (e) {
      lidos.push({ nome: arq.name, texto: '', erroLeitura: String(e.message || e) });
    }
  }
  const r = lerArquivos(lidos.filter((l) => !l.erroLeitura));
  lidos.filter((l) => l.erroLeitura).forEach((l) => r.arquivos.push({ nome: l.nome, tipo: '', itens: [], ignorados: [], erro: `Não consegui ler: ${l.erroLeitura}` }));
  await conferirRevisaoInicial(ctx, r, '');
}

/** O que vai junto de cada chamada ao servidor: simular ou não e, na tabela colada, a origem "Colado" (Registro de Controle; nunca força "já lançado"). */
const opcoesImportar = (rev, simular) => (rev && rev.origem ? { simular, origem: rev.origem } : { simular });

/**
 * r: { itens (com uid), arquivos, ignorados } - de arquivos (lerArquivos) ou da tabela colada. Abre a revisão e confere com a planilha
 * (importar simular) - o MESMO caminho nos dois casos, pra herdar "já lançado", marcar/desmarcar e o resumo. origem '' = padrão.
 */
async function conferirRevisaoInicial(ctx, r, origem) {
  const { estado } = ctx;
  estado.revisao = { ...r, situacao: {}, marcados: {}, carregando: r.itens.length ? 'Conferindo com o que já está na planilha…' : '', ...(origem ? { origem } : {}) };
  redesenharRevisao(ctx);
  if (!r.itens.length) return;
  const resp = await ctx.importar(r.itens, opcoesImportar(estado.revisao, true));
  estado.revisao.carregando = '';
  if (!resp || !resp.ok) {
    estado.revisao.erro = erroDe('Não consegui conferir com a planilha agora. Nada foi lançado; tente conferir de novo.', resp);
  } else {
    (resp.resultado.itens || []).forEach((c) => {
      estado.revisao.situacao[c.uid] = c;
      if (c.situacao === 'novo') estado.revisao.marcados[c.uid] = true;
    });
    estado.revisao.conferenciaB3 = resp.resultado.conferenciaProventos || null; // 07/10/2026: o extrato de proventos ficou registrado?
  }
  redesenharRevisao(ctx);
}

/** Botão "Conferir e revisar" da tabela colada: lê os campos, vira itens e abre a revisão (nada é gravado aqui). */
async function colarConferir(ctx) {
  const { estado } = ctx;
  const c = estado.colar;
  const r = lerTabelaColada(c.texto);
  const falha = (erro) => { c.erro = erro; redesenharColar(ctx); };
  if (!r.linhas.length) return falha((r.avisos[0] && r.avisos[0].motivo) || 'Cole as linhas da tabela primeiro.');
  let itens = [];
  let avisos = r.avisos;
  let nome = 'Tabela colada';
  if (c.destino === 'acoes') {
    const a = itensAcoesDaTabela(r.linhas);
    itens = a.itens;
    avisos = [...r.avisos, ...a.avisos];
    if (!itens.length) return falha(a.avisos[0] ? `${a.avisos[0].motivo} Escolha "Renda Fixa / fundo" se a tabela não tem ticker.` : 'Nenhuma linha com ticker, quantidade e preço.');
  } else {
    const titulo = String(c.titulo || '').replace(/\s+/g, ' ').trim();
    if (!titulo) return falha('Informe o título ou fundo (escolha um da lista ou digite o nome).');
    const existente = acharTituloRf(ctx.dados, titulo, c.instituicao);
    const instituicao = String(c.instituicao || '').trim() || (existente && existente.instituicao) || '';
    itens = itensRendaFixaDaTabela(r.linhas, {
      produto: existente ? existente.titulo : titulo, instituicao, taxaContratada: String(c.taxa || '').trim(),
      destinoRf: existente ? '' : (DESTINOS_RENDA_FIXA.includes(c.destinoRf) ? c.destinoRf : 'longo-prazo'),
    });
    nome = existente ? existente.titulo : titulo;
  }
  itens.forEach((it, i) => { it.uid = i; it.arquivo = nome; });
  const ignorados = avisos.map((a) => ({ data: '', ativo: `Linha ${a.n}`, detalhe: String(a.bruto || '—').replace(/\t/g, ' · ').slice(0, 140), motivo: a.motivo }));
  c.erro = '';
  c.aberto = false;
  redesenharColar(ctx);
  estado.mostrarLancados = {};
  await conferirRevisaoInicial(ctx, { itens, ignorados, arquivos: [{ nome, tipo: 'colado', itens, ignorados, erro: '' }] }, 'Colado');
  const el = ctx.el.querySelector('#txRevisao');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function textoConsolidacao(c) {
  const ativos = [...new Set([...(c.ativos || []), ...(c.precos || [])])];
  const partes = [];
  if (ativos.length) partes.push(`o histórico de ${ativos.slice(0, 5).join(', ')}${ativos.length > 5 ? ` e mais ${ativos.length - 5}` : ''}`);
  if (c.rf) partes.push('a Renda Fixa');
  return partes.length ? `Falta atualizar ${partes.join(' e ')}.` : 'Falta atualizar o histórico.';
}

/** Avisa o topo do site (shell.js) que tem consolidação pendente. */
function avisarConsolidacao(ctx, consolidacao) {
  const win = ctx.doc && ctx.doc.defaultView;
  if (!consolidacao || !win || typeof win.dispatchEvent !== 'function' || typeof win.CustomEvent !== 'function') return;
  win.dispatchEvent(new win.CustomEvent('consolidacao:pendente', { detail: consolidacao }));
}

async function reconferirRevisao(ctx) {
  const rev = ctx.estado.revisao;
  const itens = rev.itens.filter((it) => (rev.situacao[it.uid] || {}).situacao !== 'gravado');
  if (!itens.length) return;
  rev.carregando = 'Conferindo de novo com a planilha…';
  redesenharRevisao(ctx);
  const resp = await ctx.importar(itens, opcoesImportar(rev, true));
  rev.carregando = '';
  if (!resp || !resp.ok) {
    rev.erro = erroDe('Não consegui conferir com a planilha agora. Nada foi lançado; tente conferir de novo.', resp);
  } else {
    rev.erro = '';
    (resp.resultado.itens || []).forEach((c) => {
      const antes = (rev.situacao[c.uid] || {}).situacao;
      rev.situacao[c.uid] = c;
      if (c.situacao === 'novo' && antes !== 'novo') rev.marcados[c.uid] = true;
      if (c.situacao === 'bloqueado' || c.situacao === 'invalido') delete rev.marcados[c.uid];
    });
    if (resp.resultado.conferenciaProventos) rev.conferenciaB3 = resp.resultado.conferenciaProventos;
  }
  redesenharRevisao(ctx);
}

async function gravarRevisao(ctx) {
  const { estado } = ctx;
  const rev = estado.revisao;
  const itens = rev.itens.filter((it) => rev.marcados[it.uid]).map((it) => {
    const s = (rev.situacao[it.uid] || {}).situacao;
    return { ...it, forcar: s === 'lancado' || s === 'parecido' };
  });
  if (!itens.length) return;
  rev.carregando = `Lançando ${itens.length} na planilha…`;
  redesenharRevisao(ctx);
  const resp = await ctx.importar(itens, opcoesImportar(rev, false));
  rev.carregando = '';
  if (!resp || !resp.ok) {
    rev.erro = erroDe('Não consegui lançar na planilha agora. Confira o que já entrou antes de tentar de novo.', resp);
    redesenharRevisao(ctx);
    return;
  }
  const g = resp.resultado.gravados || {};
  (resp.resultado.itens || []).forEach((c) => {
    if (c.situacao === 'gravado' || c.situacao === 'recusado' || c.situacao === 'bloqueado') { rev.situacao[c.uid] = c; delete rev.marcados[c.uid]; }
  });
  const recusadas = resp.resultado.recusadas || [];
  rev.erro = '';
  if (resp.resultado.consolidacao) { rev.consolidacao = resp.resultado.consolidacao; avisarConsolidacao(ctx, resp.resultado.consolidacao); }
  // 06/10/2026: "N linhas já estavam na planilha e foram ignoradas" = o que a conferência marcou como já lançado + lotes de RF que já existiam
  const ignoradas = rev.itens.filter((it) => (rev.situacao[it.uid] || {}).situacao === 'lancado').length + (resp.resultado.lotesRfIgnoradas || 0);
  const textoIgn = ignoradas ? ` ${esc(textoIgnoradas(ignoradas))}` : '';
  rev.resultado = resp.resultado.total
    ? `Lançado: ${Object.keys(g).map((d) => `<b>${g[d]}</b> em ${esc(DESTINOS[d].aba)}`).join(', ')}${resp.resultado.lotesRf ? ` e ${resp.resultado.lotesRf} lote(s) em RF Contratada` : ''}.${textoIgn} As telas já vão mostrar os números novos.`
    : `Nada foi lançado${recusadas.length ? '.' : ' (tudo já estava na planilha).'}${textoIgn}`;
  if (recusadas.length) rev.resultado += ` <b>${recusadas.length} não ${recusadas.length > 1 ? 'foram lançadas' : 'foi lançada'}</b> (a planilha recusou: ${recusadas.map((x) => esc(x.motivo)).join('; ')}).`;
  const criados = resp.resultado.titulosRfCriados || [];
  if (criados.length) rev.resultado += ` Título${criados.length > 1 ? 's' : ''} criado${criados.length > 1 ? 's' : ''} em Carteiras › Renda Fixa: ${criados.map((t) => `<b>${esc(t.titulo)}</b> (${esc(ROTULO_DESTINO_RF[t.destino] || t.destino)})`).join(', ')}.`;
  if (ignoradas) toast(textoIgnoradas(ignoradas), { tipo: 'info', doc: ctx.doc });
  redesenharRevisao(ctx);
  await ctx.recarregar();
}

async function enviarManual(ctx, forcar = false) {
  const { el, estado } = ctx;
  const m = estado.manual;
  let item = m.pendente;
  if (!forcar) {
    const form = el.querySelector('#txFormManual');
    const valores = {};
    form.querySelectorAll('input[name],select[name]').forEach((i) => { valores[i.name] = i.value; });
    const r = itemDoFormulario(m.destino, valores);
    if (r.erro) { m.mensagem = { tipo: 'erro', html: esc(r.erro) }; m.valores = valores; renderLancamentos(ctx); return; }
    item = { ...r.item, uid: 0 };
    m.valores = valores;
  }
  const resp = await ctx.importar([{ ...item, forcar }], { simular: false, origem: 'Manual' });
  if (!resp || !resp.ok) { m.mensagem = { tipo: 'erro', html: `Não consegui lançar agora. <small>(${esc((resp && resp.erro) || 'sem resposta do servidor')})</small>` }; renderLancamentos(ctx); return; }
  const c = (resp.resultado.itens || [])[0] || {};
  if (c.situacao === 'gravado') {
    avisarConsolidacao(ctx, resp.resultado.consolidacao);
    m.mensagem = null;
    toast.ok(textoDeHtml(ctx.doc, `Lançado na aba <b>${esc(DESTINOS[m.destino].aba)}</b>.${resp.resultado.consolidacao && resp.resultado.consolidacao.pendente ? ' O aviso <b>Consolidação necessária</b> no topo atualiza o histórico.' : ''}`), { doc: ctx.doc });
    m.pendente = null;
    m.valores = null;
    await ctx.recarregar();
    return;
  }
  if (c.situacao === 'lancado' || c.situacao === 'parecido') {
    m.pendente = item;
    m.mensagem = { tipo: 'aviso', html: `${esc(c.motivo || 'Já existe um lançamento igual.')} Se for outra operação, use "Lançar mesmo assim".` };
  } else {
    m.pendente = null;
    m.mensagem = { tipo: 'erro', html: esc(c.motivo || 'Não foi lançado.') };
  }
  renderLancamentos(ctx);
  restaurarFormulario(ctx);
}

function restaurarFormulario(ctx) {
  const v = ctx.estado.manual.valores;
  if (!v) return;
  const form = ctx.el.querySelector('#txFormManual');
  if (!form) return;
  form.querySelectorAll('input[name],select[name]').forEach((i) => { if (v[i.name] != null) i.value = v[i.name]; });
}

function ligarLancamentos(el) {
  el.addEventListener('click', async (ev) => {
    const ctx = el._txCtx;
    const { estado } = ctx;
    const t = ev.target;
    const alvo = t.closest('[data-lanc],[data-mostrar-lancados],[data-manual-destino],[data-lista-filtro],[data-provs-toggle]');
    if (!alvo || !el.contains(alvo)) return;
    if (alvo.hasAttribute('data-mostrar-lancados')) {
      const d = alvo.getAttribute('data-mostrar-lancados');
      estado.mostrarLancados[d] = !estado.mostrarLancados[d];
      redesenharRevisao(ctx);
      return;
    }
    if (alvo.hasAttribute('data-manual-destino')) {
      estado.manual = { ...estado.manual, aberto: true, destino: alvo.getAttribute('data-manual-destino'), mensagem: null, pendente: null, valores: null };
      renderLancamentos(ctx);
      return;
    }
    if (alvo.hasAttribute('data-lista-filtro')) {
      estado.lista.filtro = alvo.getAttribute('data-lista-filtro'); estado.lista.mesesVisiveis = MESES_LISTA_INICIAL; redesenharLista(ctx); return;
    }
    if (alvo.hasAttribute('data-provs-toggle')) {
      const mes = alvo.getAttribute('data-provs-toggle');
      estado.lista.proventosAbertos[mes] = !estado.lista.proventosAbertos[mes];
      redesenharLista(ctx);
      return;
    }
    const acao = alvo.getAttribute('data-lanc');
    if (acao === 'colar-abrir') {
      estado.colar.aberto = !estado.colar.aberto;
      estado.colar.erro = '';
      redesenharColar(ctx);
      const ta = el.querySelector('#txColarTexto');
      if (estado.colar.aberto && ta && typeof ta.focus === 'function') ta.focus();
      return;
    }
    if (acao === 'colar-fechar') { estado.colar.aberto = false; estado.colar.erro = ''; redesenharColar(ctx); return; }
    if (acao === 'colar-conferir') { alvo.disabled = true; await colarConferir(ctx); alvo.disabled = false; return; }
    if (acao === 'gravar') { alvo.disabled = true; await gravarRevisao(ctx); return; }
    if (acao === 'descartar') {
      const rev = estado.revisao;
      const pendentes = rev ? rev.itens.filter((it) => rev.marcados[it.uid]).length : 0;
      // A-62: descartar uma revisão com linhas marcadas pede confirmação (diálogo do kit)
      if (pendentes && !(await confirmar({ titulo: 'Descartar esta revisão?', mensagem: `${pendentes} linha${pendentes > 1 ? 's' : ''} marcada${pendentes > 1 ? 's' : ''} não ${pendentes > 1 ? 'serão lançadas' : 'será lançada'}. Dá pra ${rev.origem === 'Colado' ? 'colar a tabela' : 'soltar os arquivos'} de novo depois.`, confirmarTexto: 'Descartar', cancelarTexto: 'Voltar', perigo: true, doc: ctx.doc }))) return;
      if (rev && rev.origem === 'Colado') estado.colar.texto = '';
      estado.revisao = null;
      redesenharRevisao(ctx);
      return;
    }
    if (acao === 'limpar-filtros') { Object.assign(estado.lista, { filtro: 'todos', ano: '', busca: '', ativo: '', mesesVisiveis: MESES_LISTA_INICIAL }); estado.lista.grafico = { aberto: false, ticker: null, carregando: false, serie: null, erro: null }; redesenharLista(ctx); return; }
    if (acao === 'ir-importar') { const d = el.querySelector('#txDrop'); if (d && typeof d.scrollIntoView === 'function') d.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (acao === 'lancar-eua') {
      if (typeof ctx.lancarEua !== 'function') return;
      alvo.disabled = true;
      let r = null;
      try { r = await ctx.lancarEua(alvo.getAttribute('data-aporte') || ''); } catch (e) { r = null; }
      if (!r || !r.ok) { alvo.disabled = false; toast((r && r.erro) || 'Não consegui lançar agora. Tente de novo.', { tipo: 'erro', doc: ctx.doc }); return; }
      if (r.gravadas) toast.ok(`Lançado em Transações - USA: ${r.lancados.map((x) => `${x.ativo} ×${x.qtd}`).join(', ')}.`, { doc: ctx.doc });
      else toast(r.naoLancados && r.naoLancados.length ? `Não foi possível lançar: ${r.naoLancados.map((x) => `${x.ativo} (${x.motivo})`).join('; ')}` : 'Já estava lançado.', { tipo: 'info', doc: ctx.doc });
      await ctx.recarregar();
      return;
    }
    if (acao === 'reconferir') { alvo.disabled = true; await reconferirRevisao(ctx); return; }
    if (acao === 'consolidar') {
      const win = ctx.doc && ctx.doc.defaultView;
      if (win && typeof win.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent('consolidacao:abrir'));
      return;
    }
    if (acao === 'mais-meses') { estado.lista.mesesVisiveis += MESES_LISTA_INICIAL; redesenharLista(ctx); return; }
    if (acao === 'grafico') { alvo.disabled = true; await alternarGrafico(ctx); return; }
    if (acao === 'forcar-manual') { alvo.disabled = true; await enviarManual(ctx, true); return; }
    if (acao === 'csv') {
      const lista = filtrarLista(ctx.dados.lancamentos, estado.lista);
      ctx.baixar(`lancamentos${estado.lista.filtro !== 'todos' ? `-${estado.lista.filtro}` : ''}${estado.lista.ano ? `-${estado.lista.ano}` : ''}.csv`, csvLancamentos(lista));
    }
  });

  el.addEventListener('change', (ev) => {
    const ctx = el._txCtx;
    const { estado } = ctx;
    const t = ev.target;
    if (t.matches && t.matches('#txColar [data-colar]')) { aoMudarCampoColar(ctx, t.getAttribute('data-colar'), t.value); return; }
    if (t.id === 'txArquivos') { const files = [...(t.files || [])]; t.value = ''; processarArquivos(ctx, files); return; }
    if (t.matches('[data-marcar]')) {
      const uid = Number(t.getAttribute('data-marcar'));
      if (t.checked) estado.revisao.marcados[uid] = true; else delete estado.revisao.marcados[uid];
      redesenharRevisao(ctx);
      return;
    }
    if (t.id === 'txListaAno') { estado.lista.ano = t.value; estado.lista.mesesVisiveis = MESES_LISTA_INICIAL; redesenharLista(ctx); return; }
    if (t.id === 'txListaAtivo') {
      estado.lista.ativo = t.value;
      estado.lista.mesesVisiveis = MESES_LISTA_INICIAL;
      estado.lista.grafico = { aberto: false, ticker: null, carregando: false, serie: null, erro: null };
      redesenharLista(ctx);
    }
  });

  el.addEventListener('input', (ev) => {
    const ctx = el._txCtx;
    const { estado } = ctx;
    const t = ev.target;
    if (t.matches('#txColar [data-colar]') && t.getAttribute('data-colar') !== 'destino' && t.getAttribute('data-colar') !== 'destinoRf') { aoMudarCampoColar(ctx, t.getAttribute('data-colar'), t.value); return; }
    if (t.matches('[data-taxa]')) {
      const it = estado.revisao && estado.revisao.itens.find((x) => x.uid === Number(t.getAttribute('data-taxa')));
      if (it) it.taxaContratada = t.value.trim();
      return;
    }
    if (t.id === 'txListaBusca') {
      estado.lista.busca = t.value;
      estado.lista.mesesVisiveis = MESES_LISTA_INICIAL;
      const cursor = t.selectionStart;
      redesenharLista(ctx);
      const novo = el.querySelector('#txListaBusca');
      if (novo) { novo.focus(); try { novo.setSelectionRange(cursor, cursor); } catch (e) { /* ok */ } }
    }
  });

  el.addEventListener('toggle', (ev) => {
    if (ev.target && ev.target.id === 'txManualDetalhe') el._txCtx.estado.manual.aberto = ev.target.open;
  }, true);

  el.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'txFormManual') return;
    ev.preventDefault();
    enviarManual(el._txCtx, false);
  });

  // arrastar arquivos
  const naDrop = (ev) => ev.target.closest && ev.target.closest('#txDrop');
  el.addEventListener('dragover', (ev) => {
    if (!naDrop(ev)) return;
    ev.preventDefault();
    const d = el.querySelector('#txDrop');
    if (d) d.classList.add('arrastando');
  });
  el.addEventListener('dragleave', (ev) => {
    if (!naDrop(ev)) return;
    const d = el.querySelector('#txDrop');
    if (d) d.classList.remove('arrastando');
  });
  el.addEventListener('drop', (ev) => {
    if (!naDrop(ev)) return;
    ev.preventDefault();
    const d = el.querySelector('#txDrop');
    if (d) d.classList.remove('arrastando');
    const files = [...((ev.dataTransfer && ev.dataTransfer.files) || [])];
    processarArquivos(el._txCtx, files);
  });
}

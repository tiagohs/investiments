// assets/js/pages/lancamentos.js
//
// 26/09/2026: aba "Lançamentos" da tela Transações. Três partes:
//  1. Importar extratos (B3 Negociação / Movimentação / Proventos recebidos e
//     o Extrato de atividade da Interactive Brokers): lidos no navegador
//     (lancamentos-parse.js), conferidos no servidor contra o que já está na
//     planilha (modo simular) e só gravados depois da revisão;
//  2. Lançar manualmente (uma linha, qualquer aba);
//  3. Todos os lançamentos, com filtro, busca e exportar CSV.

import { formatBRL, formatNumeroBR } from '../format.js';
import { DESTINOS, TIPOS_ARQUIVO, lerArquivos, valorDoItem } from './lancamentos-parse.js';

const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const POR_PAGINA = 40;
const ORDEM_DESTINOS = ['transacoes', 'transacoesUsa', 'rendaFixa', 'proventos', 'proventosUsa'];
const COR_DESTINO = { transacoes: '--acoes', transacoesUsa: '--usa', rendaFixa: '--rf', proventos: '--fiis', proventosUsa: '--usa' };
const FILTROS_LISTA = [
  { id: 'todos', nome: 'Tudo' }, { id: 'transacoes', nome: 'Brasil' }, { id: 'transacoesUsa', nome: 'EUA' },
  { id: 'rendaFixa', nome: 'Renda Fixa' }, { id: 'proventos', nome: 'Proventos' },
];
const SITUACAO = {
  novo: { txt: 'Novo', cls: 'good' }, lancado: { txt: 'Já lançado', cls: 'na' }, parecido: { txt: 'Parecido', cls: 'warn' },
  bloqueado: { txt: 'Bloqueado', cls: 'bad' }, invalido: { txt: 'Incompleto', cls: 'bad' }, gravado: { txt: 'Lançado agora', cls: 'good' },
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dma = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '—');
const usd = (v) => (typeof v === 'number' && Number.isFinite(v) ? `US$ ${formatNumeroBR(v)}` : '—');
const dinheiro = (v, moeda) => (moeda === 'USD' ? usd(v) : formatBRL(v));
const numTxt = (v, casas = 2) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas }) : '—');
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

function importarHtml(estado) {
  return `
    <section class="tx-secao" aria-labelledby="txImpTitulo">
      <div class="tx-secao-cab">
        <h2 id="txImpTitulo">Importar extratos</h2>
        <span class="hint">nada vai pra planilha antes da sua revisão</span>
      </div>
      <label class="tx-drop${estado.arrastando ? ' arrastando' : ''}" id="txDrop">
        <input type="file" id="txArquivos" multiple accept=".xlsx,.xls,.csv,.txt" hidden>
        <svg class="tx-drop-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3"/></svg>
        <span class="tx-drop-titulo">Solte os arquivos aqui <span>ou toque pra escolher</span></span>
        <span class="tx-drop-tipos">
          <span>B3 · Negociação</span><span>B3 · Movimentação</span><span>B3 · Proventos recebidos</span><span>Interactive Brokers · CSV</span>
        </span>
      </label>
      <details class="tx-ajuda">
        <summary>Onde baixar cada arquivo</summary>
        <ul>
          <li><b>B3</b> (Área do Investidor → Extratos): <b>Negociação</b> traz as compras e vendas de ações e FIIs; <b>Movimentação</b> traz Tesouro, CDB, LCI e os proventos; <b>Eventos → Proventos recebidos</b> também serve pros proventos. Baixe em Excel (.xlsx). Pode mandar um período maior: o que já está na planilha aparece como "já lançado".</li>
          <li><b>Interactive Brokers</b> (Desempenho e relatórios → Extratos → Atividade): período desejado, formato <b>CSV</b>. Entram as compras/vendas e os dividendos já pagos (com o imposto retido descontado).</li>
          <li>Compra de ação na B3 aparece também na Movimentação (como "Liquidação"): ela é ignorada, porque a data certa é a do pregão, que vem da Negociação.</li>
        </ul>
      </details>
      <div id="txRevisao">${revisaoHtml(estado)}</div>
    </section>`;
}

function celulasItem(it) {
  const m = moedaDoDestino(it.destino);
  if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') {
    return [dma(it.data), `<b>${esc(it.ticker)}</b>${it.obs ? `<small>${esc(it.obs)}</small>` : ''}`, esc(it.tipo), numTxt(it.qtd, 4), dinheiro(it.preco, m), dinheiro(valorDoItem(it), m)];
  }
  if (it.destino === 'rendaFixa') {
    return [dma(it.data), `<b>${esc(it.produto)}</b><small>${esc(it.instituicao || '')}</small>`, esc(it.movimentacao), numTxt(it.qtd, 4), it.preco == null ? '—' : formatBRL(it.preco), it.valor == null ? '—' : formatBRL(it.valor)];
  }
  return [dma(it.dataPagamento), `<b>${esc(it.ticker)}</b>${it.dataCom ? `<small>data com ${dma(it.dataCom)}</small>` : ''}`, esc(it.tipo), numTxt(it.qtd, 4), dinheiro(it.valorPorCota, m), dinheiro(it.valor, m)];
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
        <td class="tx-td-check"><input type="checkbox" data-marcar="${it.uid}"${marcado ? ' checked' : ''}${travado ? ' disabled' : ''} aria-label="Lançar esta linha"></td>
        ${c.map((v, i) => `<td data-rot="${ROTULOS_COLUNAS[i]}"${i === 1 ? ' class="esq"' : ''}>${v}</td>`).join('')}
        <td data-rot="Situação" class="tx-td-sit"><span class="status-pill ${info.cls}">${info.txt}</span>${s.motivo && s.situacao !== 'lancado' ? `<small>${esc(s.motivo)}</small>` : ''}${linkNovoAtivoHtml(it, s)}
          ${rfCompra(it) ? `<label class="tx-taxa">Taxa contratada <input type="text" data-taxa="${it.uid}" value="${esc(it.taxaContratada || '')}" placeholder="IPCA + 6,5%" aria-label="Taxa contratada (opcional)"></label>` : ''}
        </td>
      </tr>`;
  }).join('');
  return `
    <div class="tx-rev-grupo">
      <div class="tx-rev-grupo-cab">
        <h3><span class="tx-dot" style="background:var(${COR_DESTINO[destino]})"></span>${DESTINOS[destino].nome}</h3>
        <span>${novos} novo${novos === 1 ? '' : 's'} · ${itens.length} no arquivo <small>→ aba ${esc(DESTINOS[destino].aba)}</small></span>
        ${lancados.length ? `<button type="button" class="tx-link" data-mostrar-lancados="${destino}">${estado.mostrarLancados[destino] ? 'esconder' : 'mostrar'} ${lancados.length} já lançado${lancados.length > 1 ? 's' : ''}</button>` : ''}
      </div>
      ${mostrar.length ? `
      <div class="tx-tabela-wrap">
        <table class="tx-tabela tx-tabela-rev">
          <thead><tr><th class="tx-td-check"></th><th>Data</th><th class="esq">Ativo</th><th>Tipo</th><th>Qtd</th><th>Preço</th><th>Valor</th><th>Situação</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>` : '<p class="tx-fraco tx-rev-tudo">Tudo desse grupo já está na planilha.</p>'}
    </div>`;
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
      <summary>${rev.ignorados.length} linha${rev.ignorados.length > 1 ? 's' : ''} dos arquivos não vira${rev.ignorados.length > 1 ? 'm' : ''} lançamento</summary>
      <div class="tx-tabela-wrap"><table class="tx-tabela tx-tabela-ign">
        <thead><tr><th>Data</th><th class="esq">Ativo</th><th class="esq">O que é</th><th class="esq">Por quê</th></tr></thead>
        <tbody>${rev.ignorados.map((g) => `<tr><td data-rot="Data">${dma(g.data)}</td><td data-rot="Ativo" class="esq"><b>${esc(g.ativo)}</b></td><td data-rot="O que é" class="esq">${esc(g.detalhe)}</td><td data-rot="Por quê" class="esq">${esc(g.motivo)}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>` : '';
  return `
    <div class="tx-revisao">
      <div class="tx-arqs">${arquivos}</div>
      ${rev.erro ? `<div class="tx-aviso erro" role="status">${esc(rev.erro)}</div>` : ''}
      ${rev.resultado ? `<div class="tx-aviso ok" role="status">${rev.resultado}</div>` : ''}
      ${rev.itens.length ? `
      <div class="tx-rev-chips">
        ${cont.gravado ? `<span class="tx-chip good"><b>${cont.gravado}</b> lançados agora</span>` : ''}
        <span class="tx-chip good"><b>${cont.novo}</b> novos</span>
        <span class="tx-chip"><b>${cont.lancado}</b> já lançados</span>
        ${cont.parecido ? `<span class="tx-chip warn"><b>${cont.parecido}</b> parecidos</span>` : ''}
        ${cont.bloqueado + cont.invalido ? `<span class="tx-chip bad"><b>${cont.bloqueado + cont.invalido}</b> com problema</span>` : ''}
      </div>
      ${cont.parecido ? '<p class="tx-nota"><b>Parecido</b>: a planilha já tem o mesmo ativo, dia e tipo com essa quantidade ou valor, só dividido em linhas diferentes. Fica desmarcado; marque se for mesmo outra operação.</p>' : ''}
      ${ORDEM_DESTINOS.map((d) => grupoRevisaoHtml(estado, d)).join('')}` : ''}
      ${ignorados}
      <div class="tx-rev-acoes">
        <button type="button" class="btn btn-primary" data-lanc="gravar"${marcados ? '' : ' disabled'}>${marcados ? `Lançar ${marcados} na planilha` : 'Nada marcado pra lançar'}</button>
        ${cont.bloqueado ? '<button type="button" class="btn btn-ghost" data-lanc="reconferir" title="Depois de cadastrar o ativo em Carteiras, confere de novo o que ainda não foi lançado">Conferir de novo</button>' : ''}
        <button type="button" class="btn btn-ghost" data-lanc="descartar">${cont.gravado ? 'Fechar' : 'Descartar'}</button>
      </div>
      ${rev.consolidacao && rev.consolidacao.pendente ? `
      <div class="tx-consol" role="status">
        <span class="tx-consol-dot" aria-hidden="true"></span>
        <div><b>Consolidação necessária.</b> ${esc(textoConsolidacao(rev.consolidacao))} Consolidar recalcula gráficos, rentabilidade e totais com o que acabou de entrar.</div>
        <button type="button" class="btn btn-primary" data-lanc="consolidar">Consolidar agora</button>
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
  return `<label class="tx-rotulo${extra}">${rotulo}${html}</label>`;
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
      <details class="tx-manual"${m.aberto ? ' open' : ''} id="txManualDetalhe">
        <summary><h2 id="txManualTitulo">Lançar manualmente</h2><span class="hint">uma compra, venda ou provento avulso</span></summary>
        <div class="tx-seg tx-seg-manual" role="group" aria-label="Onde lançar">${MANUAL_DESTINOS.map((x) => `<button type="button" class="tx-seg-btn${m.destino === x.id ? ' active' : ''}" data-manual-destino="${x.id}"><span class="tx-dot" style="background:var(${COR_DESTINO[x.id]})"></span>${x.nome}</button>`).join('')}</div>
        <form class="tx-form-manual" id="txFormManual" autocomplete="off" novalidate>
          <div class="tx-form-grade">${manualCamposHtml(estado, dados)}</div>
          ${m.mensagem ? `<div class="tx-aviso ${m.mensagem.tipo || ''}" role="status">${m.mensagem.html}</div>` : ''}
          <div class="tx-botoes">
            ${m.pendente ? '<button type="button" class="btn btn-primary" data-lanc="forcar-manual">Lançar mesmo assim</button>' : ''}
            <button type="submit" class="btn ${m.pendente ? 'btn-ghost' : 'btn-primary'}">Lançar na aba ${esc(DESTINOS[m.destino].aba)}</button>
          </div>
        </form>
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

export function filtrarLista(lista, { filtro = 'todos', ano = '', busca = '' } = {}) {
  const b = busca.trim().toLowerCase();
  return (lista || []).filter((l) => {
    if (filtro === 'proventos' ? !(l.destino === 'proventos' || l.destino === 'proventosUsa') : (filtro !== 'todos' && l.destino !== filtro)) return false;
    if (ano && String(l.data).slice(0, 4) !== String(ano)) return false;
    if (b && !`${l.ativo} ${l.tipo} ${l.inst || ''}`.toLowerCase().includes(b)) return false;
    return true;
  });
}

export function csvLancamentos(lista) {
  const cel = (v) => {
    if (v == null || v === '') return '';
    if (typeof v === 'number') return String(v).replace('.', ',');
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cab = ['Data', 'Onde', 'Ativo', 'Tipo', 'Quantidade', 'Preço', 'Valor', 'Moeda', 'Instituição'];
  const linhas = lista.map((l) => [dma(l.data), DESTINOS[l.destino] ? DESTINOS[l.destino].nome : l.destino, l.ativo, l.tipo, l.qtd, l.preco, l.valor, l.moeda, l.inst || ''].map(cel).join(';'));
  return `﻿${[cab.join(';'), ...linhas].join('\r\n')}\r\n`;
}

function listaHtml(estado, dados) {
  const f = estado.lista;
  const todos = dados.lancamentos || [];
  const anos = [...new Set(todos.map((l) => String(l.data).slice(0, 4)).filter(Boolean))].sort().reverse();
  const filtrados = filtrarLista(todos, f);
  const visiveis = filtrados.slice(0, f.limite);
  const linhas = visiveis.map((l) => `
    <tr>
      <td data-rot="Data" class="tx-mono">${dma(l.data)}</td>
      <td data-rot="Onde"><span class="tx-onde"><span class="tx-dot" style="background:var(${COR_DESTINO[l.destino]})"></span>${esc(DESTINOS[l.destino] ? DESTINOS[l.destino].curto : l.destino)}</span></td>
      <td data-rot="Ativo" class="esq"><b>${esc(l.ativo)}</b>${l.inst ? `<small>${esc(l.inst)}</small>` : ''}</td>
      <td data-rot="Tipo">${esc(l.tipo)}</td>
      <td data-rot="Qtd" class="tx-mono">${numTxt(l.qtd, 4)}</td>
      <td data-rot="Preço" class="tx-mono">${l.preco == null ? '—' : dinheiro(l.preco, l.moeda)}</td>
      <td data-rot="Valor" class="tx-mono"><b>${l.valor == null ? '—' : dinheiro(l.valor, l.moeda)}</b></td>
    </tr>`).join('');
  return `
    <section class="tx-secao" id="txLista" aria-labelledby="txListaTitulo">
      <div class="tx-secao-cab">
        <h2 id="txListaTitulo">Todos os lançamentos</h2>
        <span class="hint">${filtrados.length} de ${todos.length} · direto das abas da planilha</span>
        <div class="tx-controles">
          <label class="tx-select-caixa"><span class="tx-sr">Ano</span><select class="tx-select" id="txListaAno"><option value="">Todos os anos</option>${anos.map((a) => `<option value="${a}"${String(f.ano) === a ? ' selected' : ''}>${a}</option>`).join('')}</select></label>
          <button type="button" class="tx-csv" data-lanc="csv" title="Baixar a lista (com o filtro atual) como CSV"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>CSV</button>
        </div>
      </div>
      <div class="tx-lista-filtros">
        <div class="tx-seg" role="group" aria-label="Onde">${FILTROS_LISTA.map((x) => `<button type="button" class="tx-seg-btn${f.filtro === x.id ? ' active' : ''}" data-lista-filtro="${x.id}">${x.id !== 'todos' ? `<span class="tx-dot" style="background:var(${COR_DESTINO[x.id]})"></span>` : ''}${x.nome}</button>`).join('')}</div>
        <input type="search" class="tx-busca" id="txListaBusca" placeholder="Buscar ativo ou tipo" value="${esc(f.busca)}" aria-label="Buscar lançamento">
      </div>
      <div id="txListaCorpo">
        ${filtrados.length ? `
        <div class="tx-tabela-wrap">
          <table class="tx-tabela tx-tabela-lista">
            <thead><tr><th>Data</th><th>Onde</th><th class="esq">Ativo</th><th>Tipo</th><th>Qtd</th><th>Preço</th><th>Valor</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        ${filtrados.length > visiveis.length ? `<button type="button" class="tx-mais" data-lanc="mais">Mostrar mais ${Math.min(POR_PAGINA, filtrados.length - visiveis.length)} (faltam ${filtrados.length - visiveis.length})</button>` : ''}`
        : '<p class="tx-vazio">Nenhum lançamento com esse filtro.</p>'}
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Aba inteira
// ---------------------------------------------------------------------------

export function estadoInicialLancamentos() {
  return {
    arrastando: false, revisao: null, mostrarLancados: {},
    manual: { aberto: false, destino: 'transacoes', mensagem: null, pendente: null },
    lista: { filtro: 'todos', ano: '', busca: '', limite: POR_PAGINA },
  };
}

/**
 * ctx: { doc, el, dados, estado, importar(itens, opcoes), carregarXlsx, recarregar(), baixar(nome, conteudo) }
 */
export function renderLancamentos(ctx) {
  const { el, dados, estado } = ctx;
  el.innerHTML = `${importarHtml(estado)}${manualHtml(estado, dados)}${listaHtml(estado, dados)}`;
  el._txCtx = ctx;
  if (!el._txLancLigado) { el._txLancLigado = true; ligarLancamentos(el); }
}

function redesenharRevisao(ctx) {
  const r = ctx.el.querySelector('#txRevisao');
  if (r) r.innerHTML = revisaoHtml(ctx.estado);
}

function redesenharLista(ctx) {
  const s = ctx.el.querySelector('#txLista');
  if (s) s.outerHTML = listaHtml(ctx.estado, ctx.dados);
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
  estado.revisao = { ...r, situacao: {}, marcados: {}, carregando: r.itens.length ? 'Conferindo com o que já está na planilha…' : '' };
  redesenharRevisao(ctx);
  if (!r.itens.length) return;
  const resp = await ctx.importar(r.itens, { simular: true });
  estado.revisao.carregando = '';
  if (!resp || !resp.ok) {
    estado.revisao.erro = `Não deu pra conferir com a planilha: ${(resp && resp.erro) || 'erro desconhecido'}.`;
  } else {
    (resp.resultado.itens || []).forEach((c) => {
      estado.revisao.situacao[c.uid] = c;
      if (c.situacao === 'novo') estado.revisao.marcados[c.uid] = true;
    });
  }
  redesenharRevisao(ctx);
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
  const resp = await ctx.importar(itens, { simular: true });
  rev.carregando = '';
  if (!resp || !resp.ok) {
    rev.erro = `Não deu pra conferir com a planilha: ${(resp && resp.erro) || 'erro desconhecido'}.`;
  } else {
    rev.erro = '';
    (resp.resultado.itens || []).forEach((c) => {
      const antes = (rev.situacao[c.uid] || {}).situacao;
      rev.situacao[c.uid] = c;
      if (c.situacao === 'novo' && antes !== 'novo') rev.marcados[c.uid] = true;
      if (c.situacao === 'bloqueado' || c.situacao === 'invalido') delete rev.marcados[c.uid];
    });
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
  const resp = await ctx.importar(itens, { simular: false });
  rev.carregando = '';
  if (!resp || !resp.ok) {
    rev.erro = `Não deu pra lançar: ${(resp && resp.erro) || 'erro desconhecido'}.`;
    redesenharRevisao(ctx);
    return;
  }
  const g = resp.resultado.gravados || {};
  (resp.resultado.itens || []).forEach((c) => {
    if (c.situacao === 'gravado') { rev.situacao[c.uid] = c; delete rev.marcados[c.uid]; }
  });
  rev.erro = '';
  if (resp.resultado.consolidacao) { rev.consolidacao = resp.resultado.consolidacao; avisarConsolidacao(ctx, resp.resultado.consolidacao); }
  rev.resultado = resp.resultado.total
    ? `Lançado: ${Object.keys(g).map((d) => `<b>${g[d]}</b> em ${esc(DESTINOS[d].aba)}`).join(', ')}${resp.resultado.lotesRf ? ` e ${resp.resultado.lotesRf} lote(s) em RF Contratada` : ''}. As telas já vão mostrar os números novos.`
    : 'Nada foi lançado (tudo já estava na planilha).';
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
  if (!resp || !resp.ok) { m.mensagem = { tipo: 'erro', html: `Não deu pra lançar: ${esc((resp && resp.erro) || 'erro desconhecido')}.` }; renderLancamentos(ctx); return; }
  const c = (resp.resultado.itens || [])[0] || {};
  if (c.situacao === 'gravado') {
    avisarConsolidacao(ctx, resp.resultado.consolidacao);
    m.mensagem = { tipo: 'ok', html: `Lançado na aba <b>${esc(DESTINOS[m.destino].aba)}</b>.${resp.resultado.consolidacao && resp.resultado.consolidacao.pendente ? ' O aviso <b>Consolidação necessária</b> no topo atualiza o histórico.' : ''}` };
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
    const alvo = t.closest('[data-lanc],[data-mostrar-lancados],[data-manual-destino],[data-lista-filtro]');
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
    if (alvo.hasAttribute('data-lista-filtro')) { estado.lista.filtro = alvo.getAttribute('data-lista-filtro'); estado.lista.limite = POR_PAGINA; redesenharLista(ctx); return; }
    const acao = alvo.getAttribute('data-lanc');
    if (acao === 'gravar') { alvo.disabled = true; await gravarRevisao(ctx); return; }
    if (acao === 'descartar') { estado.revisao = null; redesenharRevisao(ctx); return; }
    if (acao === 'reconferir') { alvo.disabled = true; await reconferirRevisao(ctx); return; }
    if (acao === 'consolidar') {
      const win = ctx.doc && ctx.doc.defaultView;
      if (win && typeof win.CustomEvent === 'function') win.dispatchEvent(new win.CustomEvent('consolidacao:abrir'));
      return;
    }
    if (acao === 'mais') { estado.lista.limite += POR_PAGINA; redesenharLista(ctx); return; }
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
    if (t.id === 'txArquivos') { const files = [...(t.files || [])]; t.value = ''; processarArquivos(ctx, files); return; }
    if (t.matches('[data-marcar]')) {
      const uid = Number(t.getAttribute('data-marcar'));
      if (t.checked) estado.revisao.marcados[uid] = true; else delete estado.revisao.marcados[uid];
      redesenharRevisao(ctx);
      return;
    }
    if (t.id === 'txListaAno') { estado.lista.ano = t.value; estado.lista.limite = POR_PAGINA; redesenharLista(ctx); }
  });

  el.addEventListener('input', (ev) => {
    const ctx = el._txCtx;
    const { estado } = ctx;
    const t = ev.target;
    if (t.matches('[data-taxa]')) {
      const it = estado.revisao && estado.revisao.itens.find((x) => x.uid === Number(t.getAttribute('data-taxa')));
      if (it) it.taxaContratada = t.value.trim();
      return;
    }
    if (t.id === 'txListaBusca') {
      estado.lista.busca = t.value;
      estado.lista.limite = POR_PAGINA;
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

// assets/js/pages/lancamentos-parse.js
//
// 26/09/2026 (Tiago: tela Transações, aba "Lançamentos" - "seria o local onde
// eu enviaria os relatórios da B3 e das minhas corretoras (e da Interactive
// Brokers), e você cadastraria isso na planilha"). Só lê os arquivos, no
// navegador, e devolve o que cada linha vira na planilha - nada é gravado
// aqui (quem decide o que já foi lançado é o servidor: Lancamentos.gs).
//
// Arquivos reconhecidos (pelo cabeçalho, não pelo nome):
//  - B3 · Negociação (.xlsx): compra/venda de ações e FIIs -> Transações.
//    "Mercado Fracionário" vem com F no fim (BBAS3F) - vira BBAS3.
//  - B3 · Movimentação (.xlsx): Tesouro/CDB/LCI... -> Transações Renda Fixa;
//    rendimento/dividendo/JCP -> Proventos. O resto (liquidação de compra,
//    aluguel, desdobramento...) fica listado como "não lançado".
//  - B3 · Proventos recebidos (.xlsx) -> Proventos.
//  - Interactive Brokers · Extrato de atividade (.csv, em português ou
//    inglês): operações -> Transações - USA; dividendos pagos (seção
//    "Alteração nos dividendos acumulados", que traz data com, quantidade e
//    valor por ação) -> Proventos - USA. Fusão (ex.: LBRDA -> CHTR, "59
//    para 250") converte as compras antigas pro ticker novo, igual o Tiago
//    já fazia na mão.
//
// Tudo puro (sem DOM): testado em tests/lancamentos-parse.test.js.

export const DESTINOS = {
  transacoes: { nome: 'Transações · Brasil', curto: 'Brasil', aba: 'Transações' },
  transacoesUsa: { nome: 'Transações · EUA', curto: 'EUA', aba: 'Transações - USA' },
  rendaFixa: { nome: 'Renda Fixa', curto: 'Renda Fixa', aba: 'Transações Renda Fixa' },
  proventos: { nome: 'Proventos · Brasil', curto: 'Proventos', aba: 'Proventos' },
  proventosUsa: { nome: 'Proventos · EUA', curto: 'Proventos EUA', aba: 'Proventos - USA' },
};

export const TIPOS_ARQUIVO = {
  b3Negociacao: 'B3 · Negociação',
  b3Movimentacao: 'B3 · Movimentação',
  b3Proventos: 'B3 · Proventos recebidos',
  b3ProventosAReceber: 'B3 · Proventos a receber',
  ibkr: 'Interactive Brokers · Extrato',
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const chaveCab = (s) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();
const arred = (v, casas) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10 ** casas) / 10 ** casas : v);

/** Número de célula: 12.5, "12,50", "1.234,56", "R$ 3,00", "-" (vazio -> null). */
export function lerNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v == null ? '' : v).trim();
  if (!s || s === '-' || s === '--') return null;
  s = s.replace(/[^\d,.-]/g, '');
  if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "dd/mm/aaaa", "aaaa-mm-dd", "aaaa-mm-dd, hh:mm:ss", Date ou serial do Excel -> "aaaa-mm-dd". */
export function lerData(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

/** Ticker de "BTLG11 - BTG PACTUAL LOGISTICA..." -> "BTLG11". */
export function tickerDoProduto(produto) {
  const t = String(produto || '').split(' - ')[0].trim().toUpperCase();
  return /^[A-Z0-9]{4,6}\d{0,2}[A-Z]?$/.test(t) ? t : '';
}

/** Ticker do mercado fracionário (BBAS3F, KNUQ11F) -> ticker normal. */
export function tickerSemFracionario(t) {
  const s = String(t || '').trim().toUpperCase();
  return /^[A-Z0-9]{4}\d{1,2}F$/.test(s) ? s.slice(0, -1) : s;
}

const RE_RENDA_FIXA = /^(tesouro|lci|lca|cdb|cri|cra|lc |lf |lig|rdb|deb)|deb[eê]ntur/i;
export const ehProdutoRendaFixa = (produto) => RE_RENDA_FIXA.test(String(produto || '').trim());

const TIPO_PROVENTO = [
  [/juros sobre capital/i, 'JCP'], [/^jcp$/i, 'JCP'], [/rendimento/i, 'Rendimento'], [/dividendo/i, 'Dividendo'],
  [/amortiza/i, 'Amortização'], [/reembolso/i, 'Reembolso'], [/^juros$/i, 'Juros'],
];
export function tipoProvento(texto) {
  const s = String(texto || '').trim();
  const achado = TIPO_PROVENTO.find(([re]) => re.test(s));
  return achado ? achado[1] : '';
}

/** Índices das colunas pelo nome (sem acento/caixa); aceita sinônimos. */
function indices(cab, nomes) {
  const cabN = cab.map(chaveCab);
  const out = {};
  Object.entries(nomes).forEach(([campo, opcoes]) => {
    out[campo] = [].concat(opcoes).map(chaveCab).map((o) => cabN.indexOf(o)).find((i) => i !== -1);
    if (out[campo] === undefined) out[campo] = -1;
  });
  return out;
}

/** Linha do cabeçalho (entre as 15 primeiras) que tem todos esses rótulos. */
function acharCabecalho(linhas, rotulos) {
  const alvo = rotulos.map(chaveCab);
  for (let i = 0; i < Math.min(linhas.length, 15); i += 1) {
    const l = (linhas[i] || []).map(chaveCab);
    if (alvo.every((r) => l.includes(r))) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Reconhecer o arquivo
// ---------------------------------------------------------------------------

/** { linhas } (matriz do .xlsx) ou { texto } (.csv) -> tipo (TIPOS_ARQUIVO) ou ''. */
export function identificarArquivo({ linhas = null, texto = null } = {}) {
  if (texto != null) {
    const inicio = String(texto).replace(/^﻿/, '').slice(0, 400);
    if (/^(Statement|Extrato),(Header|Cabeçalho)/m.test(inicio) || /Interactive Brokers/i.test(inicio)) return 'ibkr';
    return '';
  }
  if (!Array.isArray(linhas)) return '';
  if (acharCabecalho(linhas, ['Data do Negócio', 'Código de Negociação']) !== -1) return 'b3Negociacao';
  if (acharCabecalho(linhas, ['Entrada/Saída', 'Movimentação', 'Produto']) !== -1) return 'b3Movimentacao';
  if (acharCabecalho(linhas, ['Produto', 'Tipo de Evento', 'Valor líquido']) !== -1) {
    const i = acharCabecalho(linhas, ['Produto', 'Tipo de Evento', 'Valor líquido']);
    return linhas[i].map(chaveCab).some((c) => c.startsWith('previsao')) ? 'b3ProventosAReceber' : 'b3Proventos';
  }
  return '';
}

// ---------------------------------------------------------------------------
// B3
// ---------------------------------------------------------------------------

export function lerNegociacaoB3(linhas) {
  const cab = acharCabecalho(linhas, ['Data do Negócio', 'Código de Negociação']);
  const itens = [];
  const ignorados = [];
  if (cab === -1) return { itens, ignorados };
  const c = indices(linhas[cab], {
    data: 'Data do Negócio', tipo: 'Tipo de Movimentação', mercado: 'Mercado', inst: 'Instituição',
    ticker: 'Código de Negociação', qtd: 'Quantidade', preco: 'Preço', valor: 'Valor',
  });
  for (let r = cab + 1; r < linhas.length; r += 1) {
    const l = linhas[r] || [];
    const tickerBruto = String(l[c.ticker] || '').trim();
    if (!tickerBruto) continue;
    const data = lerData(l[c.data]);
    const tipo = /venda/i.test(l[c.tipo]) ? 'Venda' : (/compra/i.test(l[c.tipo]) ? 'Compra' : '');
    const qtd = lerNumero(l[c.qtd]);
    const preco = lerNumero(l[c.preco]);
    const mercado = String(l[c.mercado] || '');
    const base = { data, ativo: tickerBruto, detalhe: `${l[c.tipo] || ''} · ${mercado}`.trim() };
    if (!/vista|fracion/i.test(mercado)) { ignorados.push({ ...base, motivo: 'Mercado de opções/termo/futuro: lance na mão se for o caso.' }); continue; }
    if (!tipo || !data || !(qtd > 0) || preco == null) { ignorados.push({ ...base, motivo: 'Linha incompleta (sem tipo, data, quantidade ou preço).' }); continue; }
    itens.push({
      destino: 'transacoes', ticker: tickerSemFracionario(tickerBruto), data, tipo, preco: arred(preco, 4), qtd: arred(qtd, 6), taxa: 0,
      instituicao: String(l[c.inst] || '').trim(),
    });
  }
  return { itens, ignorados };
}

export function lerMovimentacaoB3(linhas) {
  const cab = acharCabecalho(linhas, ['Entrada/Saída', 'Movimentação', 'Produto']);
  const itens = [];
  const ignorados = [];
  if (cab === -1) return { itens, ignorados };
  const c = indices(linhas[cab], {
    es: 'Entrada/Saída', data: 'Data', mov: 'Movimentação', produto: 'Produto', inst: 'Instituição',
    qtd: 'Quantidade', preco: ['Preço unitário', 'Preço Unitário'], valor: ['Valor da Operação', 'Valor da operação'],
  });
  for (let r = cab + 1; r < linhas.length; r += 1) {
    const l = linhas[r] || [];
    const produto = String(l[c.produto] || '').trim();
    if (!produto) continue;
    const mov = String(l[c.mov] || '').trim();
    const es = String(l[c.es] || '').trim();
    const data = lerData(l[c.data]);
    const base = { data, ativo: produto.split(' - ')[0], detalhe: `${mov} · ${es}` };
    if (ehProdutoRendaFixa(produto)) {
      if (!data || !mov) { ignorados.push({ ...base, motivo: 'Linha incompleta.' }); continue; }
      const preco = lerNumero(l[c.preco]);
      const valor = lerNumero(l[c.valor]);
      itens.push({
        destino: 'rendaFixa', produto, data, movimentacao: mov, entradaSaida: es, instituicao: String(l[c.inst] || '').trim(),
        qtd: lerNumero(l[c.qtd]), preco, valor,
      });
      continue;
    }
    const tipo = tipoProvento(mov);
    const ticker = tickerDoProduto(produto);
    if (tipo && /cr[eé]dito/i.test(es) && ticker) {
      const valor = lerNumero(l[c.valor]);
      if (!(valor > 0) || !data) { ignorados.push({ ...base, motivo: 'Provento sem valor ou data.' }); continue; }
      itens.push({
        destino: 'proventos', ticker, dataCom: '', dataPagamento: data, tipo,
        qtd: lerNumero(l[c.qtd]) || 0, valorPorCota: lerNumero(l[c.preco]) || 0, valor: arred(valor, 2),
      });
      continue;
    }
    let motivo = 'Evento que não é lançado automaticamente (desdobramento, bonificação, leilão de fração...): confira se precisa ajustar na planilha.';
    if (/liquida/i.test(mov)) motivo = 'Liquidação de compra/venda: ela entra pelo extrato de Negociação (com a data do pregão).';
    else if (/empr[eé]stimo/i.test(mov)) motivo = 'Aluguel de ações: não mexe na sua posição.';
    else if (/transfer/i.test(mov)) motivo = 'Transferência entre contas/corretoras: não é compra nem venda.';
    else if (/imposto|ir\b/i.test(mov) || /d[eé]bito/i.test(es)) motivo = 'Débito na conta (imposto, taxa...): não é lançado.';
    ignorados.push({ ...base, motivo });
  }
  return { itens, ignorados };
}

export function lerProventosRecebidosB3(linhas) {
  const cab = acharCabecalho(linhas, ['Produto', 'Tipo de Evento', 'Valor líquido']);
  const itens = [];
  const ignorados = [];
  if (cab === -1) return { itens, ignorados };
  const c = indices(linhas[cab], {
    produto: 'Produto', pag: ['Pagamento', 'Data de pagamento'], tipo: 'Tipo de Evento', inst: 'Instituição', qtd: 'Quantidade',
    preco: ['Preço unitário', 'Preço Unitário'], valor: ['Valor líquido', 'Valor Líquido'],
  });
  for (let r = cab + 1; r < linhas.length; r += 1) {
    const l = linhas[r] || [];
    const produto = String(l[c.produto] || '').trim();
    if (!produto) continue;
    const ticker = tickerDoProduto(produto);
    const data = lerData(l[c.pag]);
    const tipo = tipoProvento(l[c.tipo]);
    const valor = lerNumero(l[c.valor]);
    if (ehProdutoRendaFixa(produto) && data && valor > 0) {
      // cupom do Tesouro com juros semestrais: é movimentação de Renda Fixa, não provento de ação
      itens.push({
        destino: 'rendaFixa', produto, data, movimentacao: String(l[c.tipo] || 'Juros').trim() || 'Juros', entradaSaida: 'Credito',
        instituicao: String(l[c.inst] || '').trim(), qtd: lerNumero(l[c.qtd]), preco: lerNumero(l[c.preco]), valor: arred(valor, 2),
      });
      continue;
    }
    if (!ticker || !data || !tipo || !(valor > 0)) {
      ignorados.push({ data, ativo: produto.split(' - ')[0], detalhe: String(l[c.tipo] || ''), motivo: 'Linha incompleta (sem ativo, data, tipo ou valor).' });
      continue;
    }
    itens.push({
      destino: 'proventos', ticker, dataCom: '', dataPagamento: data, tipo,
      qtd: lerNumero(l[c.qtd]) || 0, valorPorCota: lerNumero(l[c.preco]) || 0, valor: arred(valor, 2),
    });
  }
  return { itens, ignorados };
}

// ---------------------------------------------------------------------------
// Interactive Brokers (Extrato de atividade em CSV)
// ---------------------------------------------------------------------------

/** CSV simples com aspas ("a, b" e "" dentro de aspas). */
export function lerCsv(texto) {
  const out = [];
  let linha = [];
  let campo = '';
  let aspas = false;
  const s = String(texto || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (aspas) {
      if (ch === '"') {
        if (s[i + 1] === '"') { campo += '"'; i += 1; } else aspas = false;
      } else campo += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === ',') { linha.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i += 1;
      linha.push(campo); out.push(linha); linha = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || linha.length) { linha.push(campo); out.push(linha); }
  return out.filter((l) => l.length > 1 || (l[0] || '').trim());
}

/** Seções do extrato: { nomeDaSeção: [ {coluna: valor} ] } (cada "Header" vale pras linhas "Data" seguintes). */
function secoesIbkr(texto) {
  const secoes = {};
  const cabAtual = {};
  lerCsv(texto).forEach((l) => {
    const nome = chaveCab(l[0]);
    const tipo = chaveCab(l[1]);
    if (tipo === 'header' || tipo === 'cabecalho') { cabAtual[nome] = l.slice(2).map(chaveCab); return; }
    if (tipo !== 'data' && tipo !== 'dados') return;
    const cab = cabAtual[nome];
    if (!cab) return;
    const obj = {};
    cab.forEach((c, i) => { obj[c] = l[i + 2] == null ? '' : l[i + 2]; });
    (secoes[nome] = secoes[nome] || []).push(obj);
  });
  return secoes;
}

const campo = (obj, ...nomes) => {
  for (const n of nomes) { const v = obj[chaveCab(n)]; if (v !== undefined) return v; }
  return '';
};
const secao = (secoes, ...nomes) => nomes.map(chaveCab).map((n) => secoes[n]).find(Boolean) || [];

/** "LBRDA(US...) Mesclado(Aquisição) WITH US... 59 para 250 (CHTR, ...)" -> { antigo, novo, fator } */
export function fusaoIbkr(descricao) {
  const s = String(descricao || '');
  const m = s.match(/^([A-Z.]+)\(.*?(?:Mesclado|Merged)[^0-9]*?(?:WITH\s+\S+\s+)?(\d+(?:\.\d+)?)\s+(?:para|for)\s+(\d+(?:\.\d+)?)\s*\(([A-Z.]+),/i);
  if (!m) return null;
  const [, antigo, a, b, novo] = m;
  if (antigo === novo) return null;
  return { antigo, novo, fator: Number(a) / Number(b) };
}

export function lerExtratoIbkr(texto) {
  const secoes = secoesIbkr(texto);
  const itens = [];
  const ignorados = [];

  // fusões/incorporações: converte as compras do ticker antigo pro novo
  const fusoes = {};
  secao(secoes, 'Operações societárias', 'Corporate Actions').forEach((o) => {
    const desc = campo(o, 'Descrição', 'Description');
    const f = fusaoIbkr(desc);
    const data = lerData(campo(o, 'Data do relatório', 'Report Date'));
    if (f) {
      if (!fusoes[f.antigo]) {
        ignorados.push({ data, ativo: f.antigo, detalhe: `${f.antigo} incorporada por ${f.novo} (${arred(f.fator, 4)} ${f.novo} por ${f.antigo})`, motivo: `As compras de ${f.antigo} deste extrato entram como ${f.novo}, com quantidade e preço convertidos. Confira a posição na planilha.` });
      }
      fusoes[f.antigo] = f;
    } else if (desc && !/Mesclado|Merged/i.test(desc)) { // a 2ª linha da fusão (a baixa do ticker antigo) não precisa aparecer
      ignorados.push({ data, ativo: (desc.match(/^([A-Z.]+)/) || [])[1] || '', detalhe: desc, motivo: 'Operação societária: não é lançada automaticamente; confira a posição na planilha.' });
    }
  });

  secao(secoes, 'Operações', 'Trades').forEach((o) => {
    const disc = chaveCab(campo(o, 'DataDiscriminator'));
    const cat = chaveCab(campo(o, 'Categoria de ativos', 'Asset Category'));
    if (disc && disc !== 'order' && disc !== 'trade') return;
    let ticker = String(campo(o, 'Símbolo', 'Symbol')).trim().toUpperCase();
    const data = lerData(campo(o, 'Data/hora', 'Date/Time'));
    const qtdBruta = lerNumero(campo(o, 'Quantidade', 'Quantity'));
    let preco = lerNumero(campo(o, 'Preço Neg.', 'T. Price'));
    const taxa = Math.abs(lerNumero(campo(o, 'Corr/Taxa', 'Comm/Fee')) || 0);
    if (!/^(acoes|stocks)$/.test(cat)) { ignorados.push({ data, ativo: ticker, detalhe: campo(o, 'Categoria de ativos', 'Asset Category'), motivo: 'Só ações entram automaticamente.' }); return; }
    if (!ticker || !data || !qtdBruta || preco == null) { ignorados.push({ data, ativo: ticker, detalhe: 'Operação', motivo: 'Linha incompleta.' }); return; }
    let qtd = Math.abs(qtdBruta);
    let obs = '';
    const f = fusoes[ticker];
    if (f) { obs = `${ticker} convertido em ${f.novo} (fator ${arred(f.fator, 4)})`; qtd *= f.fator; preco /= f.fator; ticker = f.novo; }
    itens.push({ destino: 'transacoesUsa', ticker, data, tipo: qtdBruta < 0 ? 'Venda' : 'Compra', preco: arred(preco, 4), qtd: arred(qtd, 4), taxa: arred(taxa, 4), obs });
  });

  // dividendos: "Po" (lançado) + "Re" (revertido = pago) na mesma data de pagamento
  const acumulados = secao(secoes, 'Alteração nos dividendos acumulados', 'Change in Dividend Accruals');
  const pagos = new Set();
  const lancados = new Map();
  acumulados.forEach((o) => {
    const ticker = String(campo(o, 'Símbolo', 'Symbol')).trim().toUpperCase();
    const pag = lerData(campo(o, 'Data de pagamento', 'Pay Date'));
    if (!ticker || !pag) return;
    const codigos = String(campo(o, 'Código', 'Code')).split(';').map((x) => x.trim());
    const chave = `${ticker}|${pag}`;
    if (codigos.includes('Re')) pagos.add(chave);
    if (codigos.includes('Po')) lancados.set(chave, o); // fica o último lançamento da mesma data
  });
  lancados.forEach((o, chave) => {
    const [ticker, pag] = chave.split('|');
    const valor = lerNumero(campo(o, 'Valor líquido', 'Net Amount'));
    if (!(valor > 0)) return; // taxa de ADR sem dividendo
    if (!pagos.has(chave)) {
      ignorados.push({ data: pag, ativo: ticker, detalhe: 'Dividendo', motivo: 'Ainda não foi pago (sai no próximo extrato).' });
      return;
    }
    itens.push({
      destino: 'proventosUsa', ticker: (fusoes[ticker] && fusoes[ticker].novo) || ticker,
      dataCom: lerData(campo(o, 'Data', 'Date')), dataPagamento: pag, tipo: 'Dividendo',
      qtd: lerNumero(campo(o, 'Quantidade', 'Quantity')) || 0, valorPorCota: lerNumero(campo(o, 'Taxa bruta', 'Gross Rate')) || 0, valor: arred(valor, 2),
    });
  });
  return { itens, ignorados };
}

// ---------------------------------------------------------------------------
// Vários arquivos de uma vez
// ---------------------------------------------------------------------------

const LEITORES = {
  b3Negociacao: (a) => lerNegociacaoB3(a.linhas),
  b3Movimentacao: (a) => lerMovimentacaoB3(a.linhas),
  b3Proventos: (a) => lerProventosRecebidosB3(a.linhas),
  ibkr: (a) => lerExtratoIbkr(a.texto),
};

/**
 * arquivos: [{ nome, linhas } | { nome, texto }] -> { arquivos: [{ nome, tipo, itens, ignorados, erro }], itens, ignorados }.
 * Cada item ganha `uid` (posição) e `arquivo` (nome), pra casar com a resposta do servidor.
 */
export function lerArquivos(arquivos) {
  const saida = { arquivos: [], itens: [], ignorados: [] };
  (arquivos || []).forEach((a) => {
    const tipo = identificarArquivo(a);
    const reg = { nome: a.nome, tipo, itens: [], ignorados: [], erro: '' };
    if (tipo === 'b3ProventosAReceber') reg.erro = 'Esse é o "Proventos a receber": ele é importado na tela Proventos.';
    else if (!LEITORES[tipo]) reg.erro = 'Não reconheci esse arquivo. Use os extratos de Negociação, Movimentação ou Proventos recebidos da B3, ou o Extrato de atividade (CSV) da Interactive Brokers.';
    else {
      const r = LEITORES[tipo](a);
      reg.itens = r.itens.map((it) => ({ ...it, arquivo: a.nome }));
      reg.ignorados = r.ignorados.map((it) => ({ ...it, arquivo: a.nome }));
      if (!reg.itens.length && !reg.ignorados.length) reg.erro = 'O arquivo não tem nenhuma linha.';
    }
    saida.arquivos.push(reg);
    saida.itens.push(...reg.itens);
    saida.ignorados.push(...reg.ignorados);
  });
  saida.itens.forEach((it, i) => { it.uid = i; });
  return saida;
}

/** Texto curto que identifica o lançamento (tabelas e mensagens). */
export function valorDoItem(it) {
  if (it.destino === 'transacoes' || it.destino === 'transacoesUsa') return (it.preco || 0) * (it.qtd || 0);
  return it.valor == null ? 0 : it.valor;
}

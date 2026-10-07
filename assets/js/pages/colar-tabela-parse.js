// assets/js/pages/colar-tabela-parse.js
//
// 07/10/2026 (Tiago: o fundo da chácara na Rico - a corretora não dá extrato fácil, mas o app agregador mostra a lista de compras
// numa tabela). "Colar uma tabela" na tela Transações › Lançamentos: o usuário copia as linhas do site da corretora/agregador/
// Excel e cola numa caixa de texto; aqui o texto vira lançamentos - no MESMO formato dos itens da importação de arquivo - pra
// passarem pela mesma revisão (conferência com a planilha, "já lançado", marcar/desmarcar, "Lançar"). Nada é gravado aqui.
//
// Tudo puro (sem DOM): testado em tests/colar-tabela.test.js. Dados dos testes são INVENTADOS.
//
// O que aceita:
//  - cabeçalho por NOME, em qualquer ordem (Data, Tipo/Movimentação/Operação, Quantidade/Qtd/Cotas, Preço/Preço unitário/Valor da
//    cota, Custos/Taxas, Valor total/Valor/Total; opcional: Ticker/Código/Papel). Sem cabeçalho: ordem do Gorila
//    (Data | Tipo | Quantidade | Preço | Custos Op. | Valor total | Origem) ou, se faltar coluna, pelo tipo de cada célula.
//  - separador TAB (copiado do navegador), ";" ou 2+ espaços; também "uma célula por linha" (alguns sites quebram a linha a cada
//    célula) e linha com espaço simples ("05/10/2026 Compra 121,01 R$ 1,65 R$ 0,00 R$ 200,00").
//  - números pt-BR ("R$ 1.234,56", "121,01928834") e en ("1,234.56"); "1.234" (um ponto e 3 dígitos) vale milhar, não decimal.
//  - datas dd/mm/aaaa (e d/m/aa) e aaaa-mm-dd.
//  - Compra/Aplicação/Aporte -> compra; Venda/Resgate/Saque -> resgate. Outro tipo (come-cotas, rendimento...) vira aviso.
//  - ignora linhas vazias e rodapé ("Total"); linha que não entendeu vira AVISO com o motivo (nunca trava).
//  - confere quantidade × preço ≈ valor (tolerância de centavos, com folga pro arredondamento do preço mostrado) e marca
//    divergência como aviso DA LINHA (ela continua entrando; quem decide é a revisão).
//  - sem quantidade/preço mas com valor: aceita só o valor.

import { tickerSemFracionario } from './lancamentos-parse.js';

const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (s) => semAcento(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[.:]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Cabeçalho
// ---------------------------------------------------------------------------

const SINONIMOS = {
  data: ['data', 'data da operacao', 'data operacao', 'data da compra', 'data de aplicacao', 'dt'],
  tipo: ['tipo', 'movimentacao', 'operacao', 'tipo de operacao', 'tipo de movimentacao', 'natureza', 'evento'],
  qtd: ['quantidade', 'qtd', 'qtde', 'cotas', 'quantidade de cotas', 'qtd cotas', 'numero de cotas'],
  preco: ['preco', 'preco unitario', 'valor da cota', 'valor cota', 'preco da cota', 'cota', 'pu', 'preco medio', 'valor unitario'],
  custos: ['custos', 'custos op', 'custos operacionais', 'custo', 'taxas', 'taxa', 'corretagem', 'custos e taxas'],
  valor: ['valor total', 'valor', 'total', 'valor da operacao', 'valor liquido', 'valor bruto', 'montante', 'valor financeiro'],
  ticker: ['ticker', 'codigo', 'papel', 'ativo', 'codigo de negociacao', 'ativo ticker'],
  origem: ['origem', 'fonte'],
};
const CAMPO_DO_ROTULO = {};
Object.entries(SINONIMOS).forEach(([campo, nomes]) => nomes.forEach((n) => { CAMPO_DO_ROTULO[n] = campo; }));
const FRASES_CABECALHO = Object.keys(CAMPO_DO_ROTULO).sort((a, b) => b.split(' ').length - a.split(' ').length);

const campoDoRotulo = (celula) => CAMPO_DO_ROTULO[chave(celula)] || '';

/** Colunas pelo cabeçalho: { data: 0, tipo: 1, ... } ou null se a linha não parece cabeçalho (precisa de ao menos 2 nomes conhecidos, um deles "data"). */
function mapearCabecalho(celulas) {
  const mapa = {};
  let achados = 0;
  celulas.forEach((c, i) => {
    const campo = campoDoRotulo(c);
    if (campo && mapa[campo] === undefined) { mapa[campo] = i; achados += 1; }
  });
  return achados >= 2 && mapa.data !== undefined ? mapa : null;
}

// ---------------------------------------------------------------------------
// Células
// ---------------------------------------------------------------------------

const RE_DATA = /^\d{1,2}\/\d{1,2}\/\d{2,4}$|^\d{4}-\d{2}-\d{2}(?:[ T,].*)?$/;
const ehCelulaData = (c) => RE_DATA.test(String(c || '').trim());
const RE_NUMERO = /^\(?[-+]?\s*(?:R\$|US\$|\$)?\s*[-+]?\s*\d[\d.,\s]*\)?$/;
const ehCelulaNumero = (c) => RE_NUMERO.test(String(c || '').trim());

/** "dd/mm/aaaa", "d/m/aa", "aaaa-mm-dd" -> "aaaa-mm-dd" (data de calendário válida) ou ''. */
export function dataColada(v) {
  const s = String(v == null ? '' : v).trim();
  let a; let m; let d;
  let mt = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
  if (mt) { d = Number(mt[1]); m = Number(mt[2]); a = Number(mt[3]); if (mt[3].length === 2) a += 2000; } else {
    mt = s.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
    if (!mt) return '';
    a = Number(mt[1]); m = Number(mt[2]); d = Number(mt[3]);
  }
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Número pt-BR ou en: "R$ 1.234,56", "121,01928834", "1,234.56", "(200,00)", "-5". Vazio, "-" ou texto -> null.
 * Vale o ÚLTIMO separador quando há os dois; só vírgula = decimal; vários pontos = milhar; um ponto + 3 dígitos = milhar (pt-BR).
 */
export function numeroColado(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v == null ? '' : v).trim();
  if (!s || s === '-' || s === '--') return null;
  const negativo = /^\(.*\)$/.test(s) || /^[-−]/.test(s.replace(/^(R\$|US\$|\$)\s*/, '')) || /^-/.test(s);
  s = s.replace(/[^\d,.]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const virgulas = (s.match(/,/g) || []).length;
  const pontos = (s.match(/\./g) || []).length;
  if (virgulas && pontos) {
    const decimalVirgula = s.lastIndexOf(',') > s.lastIndexOf('.');
    s = decimalVirgula ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (virgulas > 1) s = s.replace(/,/g, '');
  else if (virgulas === 1) s = s.replace(',', '.');
  else if (pontos > 1) s = s.replace(/\./g, '');
  else if (pontos === 1 && /^\d{1,3}\.\d{3}$/.test(s) && !/^0\./.test(s)) s = s.replace('.', '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

const casasDecimais = (celula) => {
  const s = String(celula == null ? '' : celula).replace(/[^\d,.]/g, '');
  const mv = s.match(/,(\d+)$/);
  if (mv) return mv[1].length;
  const mp = s.match(/\.(\d+)$/);
  return mp && (s.match(/\./g) || []).length === 1 && !/^\d{1,3}\.\d{3}$/.test(s) ? mp[1].length : 0;
};
const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');

const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;

/** "Compra"/"Aplicação"... -> 'compra'; "Venda"/"Resgate"... -> 'resgate'; resto -> ''. */
export function tipoColado(v) {
  const t = chave(v);
  if (!t) return '';
  if (/^(compra|aplicacao|aplic|aporte|subscricao|c|buy|entrada)\b/.test(t) || /\bcompra\b/.test(t)) return 'compra';
  if (/^(venda|resgate|saque|retirada|v|sell|saida)\b/.test(t) || /\b(venda|resgate)\b/.test(t)) return 'resgate';
  return '';
}

// ---------------------------------------------------------------------------
// Separar o texto em linhas de células
// ---------------------------------------------------------------------------

/** Junta "R$" solto com o número seguinte. */
function juntarMoeda(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (/^(R\$|US\$|\$)$/.test(tokens[i]) && i + 1 < tokens.length) { out.push(`${tokens[i]} ${tokens[i + 1]}`); i += 1; } else out.push(tokens[i]);
  }
  return out;
}

/** Linha de cabeçalho com espaço simples ("Data Tipo Quantidade Preço Custos Op. Valor total Origem"): reconhece as frases conhecidas. */
function celulasDeCabecalhoPorPalavras(linha) {
  const palavras = linha.trim().split(/\s+/);
  const out = [];
  let i = 0;
  while (i < palavras.length) {
    let achou = '';
    let n = 0;
    for (const frase of FRASES_CABECALHO) {
      const k = frase.split(' ').length;
      if (i + k > palavras.length) continue;
      if (chave(palavras.slice(i, i + k).join(' ')) === frase) { achou = palavras.slice(i, i + k).join(' '); n = k; break; }
    }
    if (achou) { out.push(achou); i += n; } else { out.push(palavras[i]); i += 1; }
  }
  return out;
}

/** Uma linha de texto -> células (TAB > ";" > 2+ espaços > espaço simples com "R$" colado ao número). */
export function celulasDaLinha(linha) {
  const l = String(linha == null ? '' : linha).replace(/ /g, ' ').replace(/[​‌‍﻿]/g, '').replace(/\s+$/, '');
  if (l.includes('\t')) return l.split('\t').map((c) => c.trim());
  if (l.includes(';')) return l.split(';').map((c) => c.trim());
  const dois = l.trim().split(/\s{2,}/);
  if (dois.length >= 3) return dois.map((c) => c.trim());
  const porPalavras = celulasDeCabecalhoPorPalavras(l);
  if (porPalavras.filter((c) => campoDoRotulo(c)).length >= 3) return porPalavras;
  const tokens = juntarMoeda(l.trim().split(/\s+/));
  return tokens.length >= 3 ? tokens : dois.map((c) => c.trim());
}

/** Texto -> [{ n, cel: [..], bruto }] (n = nº da linha no texto colado, de 1). Trata "uma célula por linha". */
function linhasDeCelulas(texto) {
  const brutas = String(texto == null ? '' : texto).split(/\r?\n/).map((t, i) => ({ n: i + 1, bruto: t.replace(/\s+$/, '') })).filter((l) => l.bruto.trim());
  const comCelulas = brutas.map((l) => ({ ...l, cel: celulasDaLinha(l.bruto) }));
  // alguns sites quebram a linha a cada célula: nenhuma linha tem 3 células e há várias datas soltas -> reagrupa a cada data
  const tem3 = comCelulas.some((l) => l.cel.length >= 3);
  const datasSoltas = comCelulas.filter((l) => l.cel.length === 1 && ehCelulaData(l.cel[0])).length;
  if (!tem3 && datasSoltas >= 1) {
    const out = [];
    let atual = null;
    const cab = [];
    comCelulas.forEach((l) => {
      const c = l.cel[0];
      if (ehCelulaData(c)) { atual = { n: l.n, cel: [c], bruto: c }; out.push(atual); } else if (atual) { atual.cel.push(c); atual.bruto += ` ${c}`; } else cab.push(c);
    });
    if (cab.length) out.unshift({ n: comCelulas[0].n, cel: cab, bruto: cab.join(' ') });
    return out;
  }
  return comCelulas;
}

// ---------------------------------------------------------------------------
// Ler a tabela
// ---------------------------------------------------------------------------

const RE_RODAPE = /^(total|totais|subtotal|soma|saldo|resumo|p[aá]gina|mostrando|exibindo|ver mais|carregar mais)\b/i;
const RE_TICKER = /^[A-Z]{4}\d{1,2}F?$/;

/** Sem cabeçalho: descobre o papel de cada célula pelo conteúdo (data, tipo, números na ordem Gorila). */
function mapaSemCabecalho(celulas) {
  const mapa = {};
  const numeros = [];
  celulas.forEach((c, i) => {
    if (mapa.data === undefined && ehCelulaData(c)) mapa.data = i;
    else if (mapa.tipo === undefined && tipoColado(c)) mapa.tipo = i;
    else if (mapa.ticker === undefined && RE_TICKER.test(String(c).trim().toUpperCase()) && !ehCelulaNumero(c)) mapa.ticker = i;
    else if (ehCelulaNumero(c)) numeros.push(i);
  });
  // ordem Gorila: Quantidade | Preço | Custos | Valor total. Menos colunas: 3 = qtd, preço, valor; 2 = qtd, valor; 1 = valor
  const ordem = { 1: ['valor'], 2: ['qtd', 'valor'], 3: ['qtd', 'preco', 'valor'] }[numeros.length] || ['qtd', 'preco', 'custos', 'valor'];
  numeros.slice(0, ordem.length).forEach((idx, k) => { mapa[ordem[k]] = idx; });
  return mapa;
}

/**
 * texto -> { linhas, avisos, temCabecalho, temTicker, total }
 *  linhas: [{ n, data, tipo ('compra'|'resgate'), qtd, preco, custos, valor, ticker, aviso, bruto }]  (aviso = divergência; a linha entra)
 *  avisos: [{ n, bruto, motivo }]  (linhas que NÃO entraram, com o porquê)
 */
export function lerTabelaColada(texto) {
  const saida = { linhas: [], avisos: [], temCabecalho: false, temTicker: false, total: 0 };
  const todas = linhasDeCelulas(texto);
  saida.total = todas.length;
  let mapa = null;
  let primeiraDeDados = 0;
  for (let i = 0; i < Math.min(todas.length, 5); i += 1) {
    if (todas[i].cel.some(ehCelulaData)) break;
    const m = mapearCabecalho(todas[i].cel);
    if (m) { mapa = m; saida.temCabecalho = true; primeiraDeDados = i + 1; break; }
  }
  if (mapa && mapa.data === undefined) mapa = null;
  for (let i = primeiraDeDados; i < todas.length; i += 1) {
    const { n, cel, bruto } = todas[i];
    if (!cel.some((c) => String(c).trim())) continue;
    if (RE_RODAPE.test(String(cel[0] || '').trim()) || RE_RODAPE.test(bruto.trim())) continue;
    if (!cel.some(ehCelulaData) && mapearCabecalho(cel)) continue; // cabeçalho repetido (copiou 2 páginas)
    const m = mapa || mapaSemCabecalho(cel);
    const get = (campo) => (m[campo] === undefined ? '' : String(cel[m[campo]] == null ? '' : cel[m[campo]]).trim());
    const aviso = (motivo) => saida.avisos.push({ n, bruto, motivo });
    if (m.data === undefined || !get('data')) { aviso('Não achei a data na linha.'); continue; }
    const data = dataColada(get('data'));
    if (!data) { aviso(`Data "${get('data')}" não é uma data válida (use dd/mm/aaaa).`); continue; }
    let tipo = 'compra';
    if (m.tipo !== undefined && get('tipo')) {
      tipo = tipoColado(get('tipo'));
      if (!tipo) { aviso(`Tipo "${get('tipo')}" não é compra nem resgate (ex.: come-cotas, rendimento): não lançado.`); continue; }
    }
    let qtd = numeroColado(get('qtd'));
    let preco = numeroColado(get('preco'));
    let custos = numeroColado(get('custos'));
    let valor = numeroColado(get('valor'));
    if (m.tipo === undefined && valor != null && valor < 0) tipo = 'resgate'; // sem coluna de tipo, valor negativo = saída
    [qtd, preco, custos, valor] = [qtd, preco, custos, valor].map((x) => (x == null ? x : Math.abs(x)));
    if (qtd === 0) qtd = null;
    const ticker = m.ticker !== undefined && RE_TICKER.test(get('ticker').toUpperCase()) ? get('ticker').toUpperCase() : '';
    if (ticker) saida.temTicker = true;
    let avisoLinha = '';
    if (valor == null && qtd != null && preco != null) valor = arred(qtd * preco, 2);
    if (valor == null) { aviso('Não achei o valor da operação (nem quantidade e preço pra calcular).'); continue; }
    if (preco == null && qtd != null && qtd > 0) preco = arred(valor / qtd, 8);
    if (qtd != null && preco != null) {
      const bruto2 = qtd * preco;
      const folga = 0.011 + qtd * 0.5 * 10 ** -(casasDecimais(get('preco')) || 8);
      const c = custos || 0;
      const confere = [bruto2, bruto2 + c, bruto2 - c].some((x) => Math.abs(x - valor) <= folga);
      if (!confere) avisoLinha = `Quantidade × preço dá ${fmt2(bruto2)}, mas o valor total é ${fmt2(valor)}: confira a linha.`;
    }
    saida.linhas.push({ n, data, tipo, qtd, preco, custos: custos || 0, valor: arred(valor, 2), ticker, aviso: avisoLinha, bruto });
  }
  if (!saida.linhas.length && !saida.avisos.length && saida.total) saida.avisos.push({ n: 1, bruto: '', motivo: 'Não achei nenhuma linha com data. Copie a tabela inteira, com as datas.' });
  return saida;
}

// ---------------------------------------------------------------------------
// Linhas lidas -> itens da revisão (mesmo formato da importação de arquivo)
// ---------------------------------------------------------------------------

/** Renda Fixa / fundo: título e instituição vêm dos campos da tela (a tabela é de um título só). */
export function itensRendaFixaDaTabela(linhas, { produto, instituicao = '', taxaContratada = '', destinoRf = '' } = {}) {
  return linhas.map((l) => {
    const compra = l.tipo === 'compra';
    const it = {
      destino: 'rendaFixa', produto: String(produto || '').replace(/\s+/g, ' ').trim(), data: l.data, movimentacao: compra ? 'Compra' : 'Resgate',
      entradaSaida: compra ? 'Credito' : 'Debito', instituicao: String(instituicao || '').trim(), qtd: l.qtd, preco: l.preco, valor: l.valor,
    };
    if (compra && taxaContratada) it.taxaContratada = taxaContratada;
    if (compra && destinoRf) it.destinoRf = destinoRf;
    if (l.aviso) it.aviso = l.aviso;
    return it;
  });
}

/**
 * Ações e FIIs (Brasil): precisa de ticker, quantidade e preço em cada linha. Devolve { itens, avisos } - o que falta vira aviso.
 */
export function itensAcoesDaTabela(linhas) {
  const itens = [];
  const avisos = [];
  linhas.forEach((l) => {
    const motivo = !l.ticker ? 'Sem ticker (coluna Ticker/Código/Papel).' : !(l.qtd > 0) ? 'Sem quantidade.' : !(l.preco >= 0) || l.preco == null ? 'Sem preço.' : '';
    if (motivo) { avisos.push({ n: l.n, bruto: l.bruto, motivo }); return; }
    const ticker = tickerSemFracionario(l.ticker);
    const it = { destino: 'transacoes', ticker, data: l.data, tipo: l.tipo === 'compra' ? 'Compra' : 'Venda', qtd: l.qtd, preco: l.preco, taxa: l.custos || 0 };
    if (l.aviso) it.aviso = l.aviso;
    itens.push(it);
  });
  return { itens, avisos };
}

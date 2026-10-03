/**
 * gastos-import.js - 02/10/2026: ler no navegador as faturas de cartão e os
 * extratos de conta que alimentam a seção "Gastos" da Organização Financeira
 * (organizacao-gastos.js).
 *
 * Tiago: "área rica de gastos a partir dos arquivos no Drive: Documentos/
 * Transações/Cartão de Crédito (faturas OuroCard do Banco do Brasil, em PDF
 * com senha) e Documentos/Transações/Extratos (extratos bancários com mix,
 * débitos etc.)... quanto eu gastei e gasto em média".
 *
 * Funções PURAS: recebem as LINHAS de texto do PDF (pdf.js, itens da mesma
 * altura juntados com 2 espaços - holerite.js/extrairLinhasPdf) ou o texto
 * de um CSV/OFX e devolvem os lançamentos normalizados. Nada de número de
 * cartão, de conta, agência, CPF ou CNPJ sai daqui (limparDescricao).
 *
 *  - lerFaturaNubank        fatura do cartão Nubank ("TRANSAÇÕES DE ...")
 *  - lerFaturaOurocard      fatura OuroCard (Banco do Brasil) - leitor
 *                           genérico de "dd/mm  descrição  ...  valor"
 *  - lerExtratoNubank       extrato da conta Nubank ("Movimentações")
 *  - lerExtratoBradesco     extrato Bradesco Celular (Histórico/Docto/Saldo)
 *  - lerCsvGastos/lerOfxGastos  CSV do Nubank (cartão e conta) e OFX genérico
 *  - identificarDocumentoGasto / lerDocumentoGasto  qual leitor usar
 *  - linhasDeItens          03/10/2026: itens do pdf.js COM posição (x, y,
 *                           largura) -> linhas; separa os 2 painéis lado a
 *                           lado do "Detalhamento da Fatura" do BB
 *
 * Lançamento: { data 'aaaa-mm-dd', mes 'aaaa-mm' (competência: na fatura é o
 * mês do vencimento - parcelas e compras entram no mês em que são pagas; no
 * extrato é o mês do dia), descricao, valor (+ saída/gasto, − estorno/
 * crédito), tipo, parcela 'n/de' | '', moeda, valorOriginal }.
 * Tipos que NÃO são gasto (pagamento da fatura, transferência pra conta
 * própria, aplicação/resgate) ficam marcados - gastos-calc.js é quem decide
 * o que entra na conta; assim o pagamento da fatura que aparece no extrato
 * não é contado de novo.
 */

export const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const NUM = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
const r2 = (v) => Math.round(v * 100) / 100;
const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_EXT = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const p2 = (n) => String(n).padStart(2, '0');

/**
 * "R$ 1.234,56", "-R$ 88,30", "- 1.259,00", "+7,00", "US$ 9,50" -> número (sinal incluído).
 * 03/10/2026: também o menos tipográfico do Nubank ("−R$ 300,00") e o menos
 * DEPOIS do valor do Banco do Brasil ("200,00 -").
 */
export function valorBR(s) {
  if (s == null) return null;
  let t = String(s).replace(/[\u2212\u2013\u2014]/g, '-').replace(/\s+/g, '');
  let negFim = false;
  if (/\d-$/.test(t)) { negFim = true; t = t.slice(0, -1); }
  const m = t.match(/^([+-]?)(?:R\$|US\$|USD|BRL)?([+-]?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/i);
  if (!m) return null;
  const n = Number(`${m[3].replace(/\./g, '')}.${m[4]}`);
  return (negFim || m[1] === '-' || m[2] === '-') ? -n : n;
}

/**
 * Descrição sem dado sensível: tira CPF/CNPJ (inteiros ou mascarados),
 * "Agência: 1 Conta: 123-4", sequências longas de dígitos (cartão, conta,
 * código de autorização) e o "- -" que sobra.
 */
export function limparDescricao(s, max = 80) {
  let t = String(s == null ? '' : s);
  t = t.replace(/[•*]{2,}\s?[\d.\-•*]*/g, ' '); // "•••• 1234" (final do cartão do Nubank) sai inteiro
  t = t.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-?\d{0,2}/g, ' ');
  t = t.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, ' ');
  t = t.replace(/\b(?:Ag[eê]ncia|AG\.?)\s*:\s*[\d-]*|\bAg[eê]ncia\s+\d[\d-]*/gi, ' ');
  t = t.replace(/\bConta\s*:\s*[\d.\-xX]*|\bConta\s+\d[\d.\-]*/gi, ' ');
  t = t.replace(/\bAG\.?\s+\d{3,5}(?:-\w)?\b/g, ' '); // "PGTO. CASH AG. 1234 ..." (BB)
  t = t.replace(/\(\d{3,4}\)/g, ' ');
  t = t.replace(/\b(?:final|cart[aã]o)\s*\d{4}\b/gi, ' ');
  t = t.replace(/\d{6,}/g, ' ');
  t = t.replace(/[\u0000-\u001f]/g, ' ');
  t = t.replace(/(\s-\s*)+$/g, '').replace(/^(\s*-\s)+/g, '').replace(/\s-\s(?=\s*-\s)/g, ' ');
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+-\s*$/, '').trim();
  return t.slice(0, max);
}

const iso = (a, m, d) => `${a}-${p2(m)}-${p2(d)}`;
const mesDeIso = (s) => String(s || '').slice(0, 7);
const somarMes = (mes, k) => { const [a, m] = mes.split('-').map(Number); const t = a * 12 + (m - 1) + k; return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`; };
/** Meses (aaaa-mm) de inicio a fim, inclusive. */
export function mesesEntre(inicio, fim) {
  const out = [];
  if (!inicio || !fim || inicio > fim) return out;
  for (let m = mesDeIso(inicio); m <= mesDeIso(fim) && out.length < 240; m = somarMes(m, 1)) out.push(m);
  return out;
}
const normLinhas = (linhas) => (Array.isArray(linhas) ? linhas : String(linhas || '').split(/\r?\n/)).map((l) => String(l == null ? '' : l).replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u2212\u2013]/g, '-').trim()).filter(Boolean);
const plano = (L) => semAcento(L.join('\n')).toUpperCase();

/** Parcela "Parcela 2/5", "PARC 03/10", "PARC.03 DE 10", "Loja - 2/5" -> '2/5'. */
export function parcelaDe(desc) {
  const s = semAcento(desc).toUpperCase();
  let m = s.match(/\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/);
  if (!m) m = s.match(/\s(\d{2})\/(\d{2})\s*$/);
  if (!m) m = s.match(/\s-\s(\d{1,2})\/(\d{1,2})\s*$/); // Nubank antigo: "Loja - 2/3"
  if (!m) return '';
  const n = Number(m[1]); const de = Number(m[2]);
  return n >= 1 && de >= 2 && n <= de && de <= 72 ? `${n}/${de}` : '';
}

/** Tipo de um lançamento de fatura de cartão (pela descrição e pelo sinal). */
export function tipoLancamentoCartao(desc, valor) {
  const s = semAcento(desc).toUpperCase();
  if (/\bPAGAMENTO\b|\bPGTO\b|\bPAG\s+(?:DE\s+)?FATURA|DEBITO\s+(?:EM\s+)?CONTA\s+CORRENTE|PAGTO/.test(s) && !/PAG\*/.test(s)) return 'pagamento_fatura';
  if (/\bIOF\b/.test(s)) return 'iof';
  if (/ANUIDADE/.test(s)) return 'anuidade';
  if (/\bJUROS\b|\bMULTA\b|ENCARGO|\bMORA\b|ROTATIVO|TARIFA|SEGURO\s+(?:CARTAO|FATURA)|PROTECAO\s+(?:PERDA|CARTAO)/.test(s)) return 'encargo';
  if (valor < 0) return 'estorno';
  if (/ESTORNO|REEMBOLSO|CREDITO\s+DE|DEVOLUCAO|CANCELAMENTO/.test(s)) return 'estorno';
  return 'compra';
}

// ---------------------------------------------------------------------------
// Qual documento é
// ---------------------------------------------------------------------------

/**
 * 'nubank-cartao' | 'nubank-conta' | 'ourocard' | 'bradesco' | null.
 * `dica` (opcional): { banco, origem } - a pasta do Drive de onde veio.
 */
export function identificarDocumentoGasto(linhas, dica = {}) {
  const L = normLinhas(linhas);
  const t = plano(L);
  if (/BRADESCO/.test(t) && /EXTRATO DE:/.test(t) && /HISTORICO/.test(t)) return 'bradesco';
  if (/MOVIMENTACOES/.test(t) && /TOTAL DE (ENTRADAS|SAIDAS)/.test(t)) return 'nubank-conta';
  if (/TRANSACOES\s+DE\s+\d{2}\s+[A-Z]{3}\s+A\s+\d{2}\s+[A-Z]{3}/.test(t) || (/ESTA E A SUA FATURA/.test(t) && /TOTAL A PAGAR/.test(t))) return 'nubank-cartao';
  if (/OUROCARD|BANCO DO BRASIL|\bBB\b.*CARTAO/.test(t) && /(FATURA|VENCIMENTO)/.test(t)) return 'ourocard';
  const banco = semAcento(dica.banco || '').toUpperCase();
  if (dica.origem === 'cartao' && /OURO|BRASIL|\bBB\b/.test(banco)) return 'ourocard';
  if (dica.origem === 'cartao' && /NU/.test(banco)) return 'nubank-cartao';
  if (dica.origem === 'conta' && /NU/.test(banco)) return 'nubank-conta';
  if (dica.origem === 'conta' && /BRADESCO/.test(banco)) return 'bradesco';
  return null;
}

// ---------------------------------------------------------------------------
// PDF com posição (pdf.js) -> linhas
// ---------------------------------------------------------------------------

const compacto = (s) => semAcento(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * 03/10/2026: junta os itens de UMA linha (mesma altura), da esquerda pra
 * direita, olhando o espaço entre eles: colados (fonte que o pdf.js quebra
 * letra a letra, ou a letra acentuada solta) -> sem espaço; espaço de uma
 * letra -> 1 espaço; mais que isso (outra coluna) -> 2 espaços, que é o que
 * os leitores entendem como "outra coluna". Sem largura, 2 espaços (como
 * holerite.js/extrairLinhasPdf).
 */
function juntarItensLinha(itens) {
  let s = '';
  let ant = null;
  itens.forEach((it) => {
    const txt = String(it.s).trim();
    if (!txt) return;
    if (ant && txt === ant.txt && Math.abs(it.x - ant.x) < 1) return; // "negrito" desenhado 2 vezes
    if (!ant) s = txt;
    else if (!(ant.w > 0)) s += `  ${txt}`;
    else {
      const gap = it.x - (ant.x + ant.w);
      const letra = Math.max(1, ant.w / Math.max(1, ant.txt.length));
      s += gap < letra * 0.3 ? txt : gap < letra * 1.6 ? ` ${txt}` : `  ${txt}`;
    }
    ant = { txt, x: it.x, w: Number(it.w) || 0 };
  });
  return s;
}

function agruparPorAltura(itens, tol = 2.5) {
  const grupos = [];
  itens.forEach((it) => {
    let g = grupos.find((gr) => Math.abs(gr.y - it.y) <= tol);
    if (!g) { g = { y: it.y, itens: [] }; grupos.push(g); }
    g.itens.push(it);
  });
  grupos.sort((a, b) => b.y - a.y);
  grupos.forEach((g) => g.itens.sort((a, b) => a.x - b.x));
  return grupos;
}

/**
 * Fatura do BB: o "Detalhamento da Fatura" vem em DOIS painéis lado a lado
 * (Data | Transações | País | Moeda | Valor duas vezes na mesma altura).
 * Juntando só pela altura, um lançamento da esquerda gruda no da direita.
 * Devolve onde começa o 2º painel ({ x, y }) ou null.
 */
function corteDePaineis(grupos) {
  for (const g of grupos) {
    let txt = '';
    const xs = [];
    g.itens.forEach((it) => {
      const c = compacto(it.s);
      for (let k = 0; k < c.length; k += 1) { txt += c[k]; xs.push(it.x + (Number(it.w) || 0) * (k / Math.max(1, c.length))); }
    });
    for (const rot of ['DETALHAMENTODAFATURA', 'DATATRANSACOES']) {
      const i1 = txt.indexOf(rot);
      const i2 = i1 >= 0 ? txt.indexOf(rot, i1 + rot.length) : -1;
      if (i2 > 0) return { x: xs[i2] - 3, y: g.y };
    }
  }
  return null;
}

/**
 * 03/10/2026: páginas do pdf.js com posição -> linhas de texto.
 * `paginas`: [{ itens: [{ s, x, y, w }] }] (organizacao-gastos.js!extrairPaginasPdfComSenha).
 * `colunas`: separa os painéis lado a lado (fatura do BB): primeiro o que
 * está acima deles, depois o painel da esquerda inteiro, depois o da direita.
 */
export function linhasDeItens(paginas, { colunas = false } = {}) {
  const out = [];
  (paginas || []).forEach((p) => {
    const itens = ((p && p.itens) || [])
      .filter((it) => it && String(it.s == null ? '' : it.s).trim())
      .map((it) => ({ s: String(it.s), x: Number(it.x) || 0, y: Number(it.y) || 0, w: Number(it.w) || 0 }));
    const grupos = agruparPorAltura(itens);
    const corte = colunas ? corteDePaineis(grupos) : null;
    if (!corte) { grupos.forEach((g) => out.push(juntarItensLinha(g.itens))); return; }
    const acima = itens.filter((it) => it.y > corte.y + 2.5);
    const abaixo = itens.filter((it) => it.y <= corte.y + 2.5);
    [acima, abaixo.filter((it) => it.x < corte.x), abaixo.filter((it) => it.x >= corte.x)]
      .forEach((parte) => agruparPorAltura(parte).forEach((g) => out.push(juntarItensLinha(g.itens))));
  });
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Cartão - Nubank
// ---------------------------------------------------------------------------

function anoDaCompra(mesCompra, mesVenc, anoVenc) { return mesCompra > mesVenc ? anoVenc - 1 : anoVenc; }

/** "312.38" (USD do Nubank, ponto decimal) ou "25,00" -> número. */
function numeroUsd(s) {
  const t = String(s || '').trim();
  if (/,\d{2}$/.test(t)) return Math.abs(valorBR(t));
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Fatura do cartão Nubank. 03/10/2026 (Tiago: as de 2023 davam "Não achei
 * nenhuma transação" e a de 09/2026 "soma não bate"), os 2 formatos:
 *  - antigo (até 2023): "04 MAR  Loja - 2/3  144,00" (sem "R$"; o pagamento
 *    vem POSITIVO - "Pagamento em 04 MAR  88,30" - e é crédito);
 *  - atual: "04 AGO  •••• 1234 Loja - Parcela 3/4  R$ 28,62", crédito com o
 *    menos tipográfico ("−R$ 105,29"), a data às vezes numa linha e a
 *    descrição/valor na de baixo (ou acima, nas compras em dólar, que ainda
 *    têm a linha "USD 12.34 Conversão: USD 1 = R$ 5,27"), subtotal por
 *    titular ("Fulano R$ 1.000,00") e a seção "Pagamentos" no fim.
 * Conferência: fatura anterior + transações = total a pagar (ou pagamentos +
 * compras + IOF + outros lançamentos do resumo).
 */
export function lerFaturaNubank(linhas) {
  const L = normLinhas(linhas);
  const out = { tipoDoc: 'fatura', fonte: 'nubank-cartao', origem: 'cartao', mes: '', vencimento: '', total: null, lancamentos: [], conferencia: null, avisos: [] };
  const T = L.map((l) => semAcento(l).toUpperCase());
  const tudo = T.join('\n');
  const reAbr = `(${MESES_ABREV.join('|')})`;
  let mv = tudo.match(new RegExp(`DATA (?:DE|DO) VENCIMENTO:?\\s*(\\d{2})\\s+${reAbr}\\s+(\\d{4})`));
  if (!mv) mv = tudo.match(new RegExp(`\\bFATURA\\s+(\\d{2})\\s+${reAbr}\\s+(\\d{4})`));
  if (!mv) { out.avisos.push('Não achei a data de vencimento da fatura.'); return out; }
  const anoV = Number(mv[3]); const mesV = MESES_ABREV.indexOf(mv[2]) + 1;
  out.vencimento = iso(anoV, mesV, Number(mv[1]));
  out.mes = `${anoV}-${p2(mesV)}`;
  // resumo: só a partir de "RESUMO DA FATURA" (a pág. 2 das faturas novas simula parcelamentos com outro "Total a pagar")
  const iRes = tudo.search(/RESUMO DA FATURA/);
  const res = iRes >= 0 ? tudo.slice(iRes) : tudo;
  const V = `((?:-\\s?)?(?:R\\$\\s?)?-?\\s?${NUM})`;
  const resumo = (re) => { const m = res.match(re); return m ? valorBR(m[1]) : null; };
  const anterior = resumo(new RegExp(`FATURA ANTERIOR\\s+${V}`));
  const pagRec = resumo(new RegExp(`PAGAMENTOS? RECEBIDOS?\\s+${V}`));
  const compras = resumo(new RegExp(`TOTAL DE COMPRAS[^\\n]*?\\s${V}`));
  const iofInt = resumo(new RegExp(`IOF DE COMPRAS INTERNACIONAIS\\s+${V}`));
  const outros = resumo(new RegExp(`OUTROS LANCAMENTOS\\s+${V}`));
  out.total = resumo(new RegExp(`TOTAL A PAGAR\\s+${V}`));
  if (out.total == null) { const m = tudo.match(new RegExp(`NO VALOR DE\\s+(R\\$\\s?${NUM})`)); if (m) out.total = valorBR(m[1]); }

  // cabeçalho repetido em cada página: "FULANO DE TAL" + "FATURA 11 ABR 2023 EMISSÃO E ENVIO ..."
  const reCabFatura = /^FATURA\s+\d{2}\s+[A-Z]{3}\s+\d{4}/;
  const nomes = new Set();
  T.forEach((u, i) => { if (reCabFatura.test(u) && i > 0) nomes.add(T[i - 1]); });
  const ehCabecalho = (u) => nomes.has(u) || reCabFatura.test(u) || /^\d+\s+DE\s+\d+$/.test(u) || /^VALORES EM R\$/.test(u);

  const reData = new RegExp(`^(\\d{2})\\s+${reAbr}(?:\\s+(.*))?$`);
  const reValor = new RegExp(`^(.*?)\\s*((?:-\\s?)?(?:R\\$\\s?)?-?\\s?${NUM})$`);
  const reUsd = /\b(?:USD|US\$)\s?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\b/;
  const reCredito = /^(PAGAMENTO\b|ESTORNO|CREDITO DE|AJUSTE A CREDITO|DESCONTO|REEMBOLSO|IOF DE VOLTA|DEPOSITO DE CONFIANCA)/;
  const emitir = (p, desc) => {
    let valor = valorBR(p.valor);
    if (valor == null) return;
    const descricao = limparDescricao(String(desc || '').replace(/\s{2,}/g, ' ')) || 'Lançamento sem descrição';
    // formato antigo: sem "R$" e sem sinal - pagamento/crédito vem positivo
    if (valor > 0 && !/-|R\$/.test(p.valor) && reCredito.test(semAcento(descricao).toUpperCase())) valor = -valor;
    const lanc = {
      data: iso(anoDaCompra(p.mesC, mesV, anoV), p.mesC, p.dia), mes: out.mes, descricao, valor, tipo: tipoLancamentoCartao(descricao, valor),
      parcela: parcelaDe(descricao), moeda: p.usd != null ? 'USD' : 'BRL', valorOriginal: p.usd != null ? p.usd : null,
    };
    out.lancamentos.push(lanc);
  };
  let dentro = false;
  let pend = null; // { dia, mesC, desc, valor, usd, orfa }
  let orfa = ''; // descrição sem data nem valor (fica ACIMA da linha "data  valor" nas compras em dólar)
  const fechar = () => {
    if (!pend) return;
    if (pend.valor != null) emitir(pend, pend.desc || pend.orfa);
    else if (pend.desc) out.avisos.push(`Linha sem valor: ${limparDescricao(pend.desc)}`);
    pend = null;
  };
  const absorver = (texto) => {
    const m = texto.match(reValor);
    if (m) { const d = m[1].trim(); if (d) pend.desc = pend.desc ? `${pend.desc} ${d}` : d; pend.valor = m[2]; } else pend.desc = pend.desc ? `${pend.desc} ${texto}` : texto;
    if (pend.valor != null && (pend.desc || pend.orfa)) { emitir(pend, pend.desc || pend.orfa); pend = null; }
  };
  L.forEach((l, i) => {
    const u = T[i];
    if (/^TRANSACOES\b/.test(u)) { fechar(); dentro = true; return; }
    if (!dentro || ehCabecalho(u)) return;
    const us = u.match(reUsd);
    if (us && (/^(?:USD|US\$)/.test(u) || /CONVERSAO/.test(u))) {
      const v = numeroUsd(us[1]);
      if (pend) pend.usd = v;
      else { const ult = out.lancamentos[out.lancamentos.length - 1]; if (ult && ult.valorOriginal == null) { ult.moeda = 'USD'; ult.valorOriginal = v; } }
      return;
    }
    const md = u.match(reData);
    if (md) {
      fechar();
      pend = { dia: Number(md[1]), mesC: MESES_ABREV.indexOf(md[2]) + 1, desc: '', valor: null, usd: null, orfa };
      orfa = '';
      const resto = md[3] ? l.replace(/^\d{2}\s+\S+\s*/, '') : '';
      if (resto) absorver(resto);
      return;
    }
    if (pend) { absorver(l); return; }
    orfa = reValor.test(l) ? '' : l; // subtotal do titular e "Pagamentos -R$ ..." têm valor: não são descrição
  });
  fechar();
  if (!out.lancamentos.length) out.avisos.push('Não achei nenhuma transação na fatura.');
  const soma = r2(out.lancamentos.reduce((s, x) => s + x.valor, 0));
  const cands = [];
  if (out.total != null && anterior != null) cands.push({ esperado: r2(out.total - anterior), regra: 'fatura anterior + transações = total a pagar' });
  if (compras != null) cands.push({ esperado: r2(-Math.abs(pagRec || 0) + compras + (iofInt || 0) + (outros || 0)), regra: 'transações = pagamentos + compras + IOF + outros lançamentos' });
  if (cands.length) {
    const bom = cands.find((c) => Math.abs(soma - c.esperado) <= 0.05 + 1e-9);
    const c = bom || cands[0];
    out.conferencia = { ok: !!bom, esperado: c.esperado, lido: soma, diferenca: r2(soma - c.esperado), regra: c.regra };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cartão - OuroCard (Banco do Brasil)
// ---------------------------------------------------------------------------

/**
 * Ano de uma compra da fatura do BB: a data é a da COMPRA (a parcela 9/12 de
 * uma compra de março aparece com "27/03" na fatura de janeiro) - se a
 * parcela diz que a compra tem mais de 1 ano, volta os anos que faltam.
 */
function anoComParcela(mesC, mesV, anoV, parcela) {
  let ano = anoDaCompra(mesC, mesV, anoV);
  const n = Number(String(parcela || '').split('/')[0]) || 0;
  while (n > 1 && (anoV * 12 + mesV) - (ano * 12 + mesC) < n - 2 && ano > anoV - 7) ano -= 1;
  return ano;
}

const RE_DATA_CHEIA = /^(\d{2})[/.](\d{2})[/.](\d{4}|\d{2})$/;

/** Vencimento da fatura do BB por "votos": o rótulo e a data podem vir na mesma linha, na coluna ao lado ou na linha de baixo (caixa "Vencimento:", boleto). */
function vencimentoOurocard(T) {
  const votos = new Map();
  const votar = (m, peso) => {
    if (!m) return;
    const a = Number(m[3].length === 2 ? `20${m[3]}` : m[3]); const mm = Number(m[2]); const d = Number(m[1]);
    if (mm < 1 || mm > 12 || d < 1 || d > 31 || a < 2000) return;
    const k = iso(a, mm, d);
    votos.set(k, (votos.get(k) || 0) + peso);
  };
  T.forEach((u, i) => {
    if (!/VENCIMENTO/.test(u)) return;
    const m1 = u.match(/VENCIMENTO\s*:?\s*(?:EM\s+)?(\d{2})[/.](\d{2})[/.](\d{4}|\d{2})\b/);
    if (m1) { votar(m1, 2); return; }
    const segs = u.split(/\s{2,}/);
    const k = segs.findIndex((s) => /VENCIMENTO/.test(s));
    const prox = segs[k + 1];
    if (prox && RE_DATA_CHEIA.test(prox)) { votar(prox.match(RE_DATA_CHEIA), 2); return; }
    const abaixo = T[i + 1] ? T[i + 1].split(/\s{2,}/).filter((s) => RE_DATA_CHEIA.test(s)) : [];
    if (abaixo.length === 1) votar(abaixo[0].match(RE_DATA_CHEIA), 1);
  });
  let melhor = null;
  votos.forEach((n, k) => { if (!melhor || n > melhor.n) melhor = { k, n }; });
  return melhor ? melhor.k : null;
}

/**
 * 02/10/2026: leitor das faturas OuroCard. 03/10/2026 (Tiago: TODAS davam
 * "Não achei a data de vencimento"), pelo layout real (Smiles/OuroCard):
 *  - pág. 1: caixa "Vencimento:" com a data EMBAIXO, "Valor Total:", o
 *    "Resumo em Real" (Saldo anterior, Pagamentos/Créditos "- 7.016,55",
 *    Compras/Débitos, Valor Total - R$) e o boleto ("Data de Vencimento");
 *  - "Detalhamento da Fatura" em 2 painéis lado a lado (linhasDeItens com
 *    colunas separa), colunas Data | Transações | País | Moeda | Valor, com
 *    os subtítulos do próprio BB (Pagamentos, Restaurantes, Compras
 *    diversas...), crédito com o menos DEPOIS do valor ("200,00 -") e
 *    Subtotal/Total em R$ e US$;
 *  - "Parcelamentos Próxima Fatura" (até "Total parcelado para próxima
 *    fatura"): NÃO são desta fatura - ficam de fora.
 * Continua aceitando o formato genérico "dd/mm  descrição  ...  valor".
 * `nome` (opcional): nome do arquivo ("12-2023.pdf") - só se o vencimento
 * não aparecer em lugar nenhum.
 */
export function lerFaturaOurocard(linhas, { nome = '' } = {}) {
  // 2 lançamentos na mesma linha (painéis juntados pela altura) -> 2 linhas
  const L = [];
  normLinhas(linhas).forEach((l) => l.split(new RegExp(`(?<=${NUM}(?:\\s?-)?)\\s{2,}(?=\\d{2}[/.]\\d{2}\\s)`)).forEach((x) => { if (x.trim()) L.push(x.trim()); }));
  const out = { tipoDoc: 'fatura', fonte: 'ourocard', origem: 'cartao', mes: '', vencimento: '', total: null, lancamentos: [], conferencia: null, avisos: [] };
  const T = L.map((l) => semAcento(l).toUpperCase());
  const tudo = T.join('\n');
  const venc = vencimentoOurocard(T);
  let anoV; let mesV;
  if (venc) {
    out.vencimento = venc;
    anoV = Number(venc.slice(0, 4)); mesV = Number(venc.slice(5, 7));
  } else {
    const mn = String(nome || '').match(/(?:^|\D)(\d{2})[-_. ](\d{4})(?:\D|$)/);
    if (!mn || Number(mn[1]) < 1 || Number(mn[1]) > 12) { out.avisos.push(L.length < 5 ? 'Não achei texto nesta fatura (o PDF parece imagem).' : 'Não achei a data de vencimento da fatura.'); return out; }
    anoV = Number(mn[2]); mesV = Number(mn[1]);
    out.avisos.push(`Vencimento pelo nome do arquivo (${mn[1]}/${mn[2]}) - não achei no PDF.`);
  }
  out.mes = `${anoV}-${p2(mesV)}`;
  const achar = (...res) => { for (const re of res) { const m = tudo.match(re); if (m) return valorBR(m[1]); } return null; };
  const V = `((?:-\\s?)?(?:R\\$\\s?)?-?\\s?${NUM}(?:\\s?-)?)`;
  out.total = achar(
    new RegExp(`VALOR\\s+TOTAL\\s*-\\s*R\\$\\s+${V}`),
    new RegExp(`(?:TOTAL\\s+(?:DESTA|DA)\\s+FATURA|VALOR\\s+TOTAL\\s+(?:DESTA|DA)\\s+FATURA|SALDO\\s+DESTA\\s+FATURA|TOTAL\\s+A\\s+PAGAR)[^\\d\\n-]{0,40}${V}`),
    new RegExp(`VALOR\\s+TOTAL\\s*:?\\s*(?:R\\$)?\\s+${V}`),
    new RegExp(`VALOR\\s+TOTAL\\s*:?\\s*\\n(?:R\\$\\s*)?(${NUM})`),
  );
  const anterior = achar(new RegExp(`SALDO\\s+(?:DA\\s+)?(?:FATURA\\s+)?ANTERIOR[^\\d\\n-]{0,30}${V}`));
  const comprasDeb = achar(new RegExp(`COMPRAS\\s*\\/\\s*DEBITOS\\s+${V}`));
  const cotacao = (() => { const m = tudo.match(/COTACAO[^\d\n]{0,40}(\d+,\d{2,4})/); return m ? Number(m[1].replace(',', '.')) : null; })();

  const reDinheiro = new RegExp(`^(-\\s?)?(R\\$|US\\$)?\\s?(-\\s?)?${NUM}(\\s?-)?$`);
  const reMoeda = new RegExp(`^(.*?)\\s+(?:([A-Z]{2}|\\d{1,3})\\s+)?(R\\$|US\\$)\\s*((?:-\\s?)?${NUM}(?:\\s?-)?)$`);
  const ignorar = /SALDO\s+(?:DA\s+)?(?:FATURA\s+)?ANTERIOR|^TOTAL|SUBTOTAL|TOTAL\s+(?:DA|DESTA)\s+FATURA|LIMITE|VENCIMENTO|PAGAMENTO\s+MINIMO|ENCARGOS\s+(?:FINANCEIROS\s+)?(?:MAXIMOS|PARA O PROXIMO)|FECHARA|MELHOR DATA|PROCESSAMENTO|DOCUMENTO/;
  let proxima = false;
  L.forEach((l, i) => {
    const u = T[i];
    if (/PARCELAMENTOS?\s+(?:DA\s+)?PROXIMA\s+FATURA/.test(u)) { proxima = true; return; }
    if (/TOTAL\s+PARCELADO/.test(u)) { proxima = false; return; }
    if (proxima) return;
    const md = u.match(/^(\d{2})[/.](\d{2})(?:[/.](\d{2,4}))?\s+(.+)$/);
    if (!md || ignorar.test(md[4])) return;
    const dia = Number(md[1]); const mesC = Number(md[2]);
    if (dia < 1 || dia > 31 || mesC < 1 || mesC > 12) return;
    const resto = l.replace(/^\d{2}[/.]\d{2}(?:[/.]\d{2,4})?\s+/, '');
    let partes; let v0; let v1 = null; let moedaCol = null;
    const mm = resto.match(reMoeda);
    if (mm && /[A-Za-z]/.test(mm[1]) && !new RegExp(`${NUM}\\s*-?$`).test(mm[1])) {
      // colunas do BB: descrição (+ cidade) | país | moeda | valor
      partes = mm[1].split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
      moedaCol = mm[3].toUpperCase();
      v0 = mm[4];
      const parc = partes.slice(1).join(' ').match(/PARC\.?\s*\d{1,2}\s*\/\s*\d{1,2}/i);
      partes = [(partes.length >= 3 ? partes.slice(0, -1).join(' ') : partes[0]) + (parc && !/PARC/i.test(partes[0]) ? ` ${parc[0]}` : '')];
    } else {
      // genérico: colunas pelo pdf.js (2+ espaços); sem isso, o(s) valor(es) do fim por regex
      partes = resto.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
      const valores = [];
      while (partes.length > 1 && reDinheiro.test(semAcento(partes[partes.length - 1]).toUpperCase())) valores.unshift(partes.pop());
      if (!valores.length) {
        const m = resto.match(new RegExp(`^(.*?)\\s+((?:-\\s?)?(?:R\\$\\s?)?-?\\s?${NUM}(?:\\s?-)?)(?:\\s+((?:-\\s?)?(?:US\\$\\s?)?-?\\s?${NUM}))?$`));
        if (!m) return;
        partes = [m[1]];
        valores.push(m[2]); if (m[3]) valores.push(m[3]);
      }
      [v0, v1] = valores;
    }
    let valor = null; let moeda = 'BRL'; let valorOriginal = null;
    if (moedaCol === 'US$' || (!moedaCol && /US\$/i.test(v0) && !v1)) { moeda = 'USD'; valorOriginal = valorBR(v0); valor = cotacao && valorOriginal != null ? r2(valorOriginal * cotacao) : null; } else {
      valor = valorBR(v0);
      if (v1) { const us = valorBR(v1); if (us) { moeda = 'USD'; valorOriginal = us; } }
    }
    const desc = limparDescricao(partes[0].replace(/\s+(?:BR|BRA)$/i, ''));
    if (!desc) return;
    if (valor == null) { out.avisos.push(`Lançamento em dólar sem valor em reais: ${desc}`); return; }
    let tipo = tipoLancamentoCartao(desc, valor);
    if (tipo === 'pagamento_fatura' && valor > 0) { valor = -valor; tipo = tipoLancamentoCartao(desc, valor); }
    const parcela = parcelaDe(desc);
    const ano = md[3] ? Number(md[3].length === 2 ? `20${md[3]}` : md[3]) : anoComParcela(mesC, mesV, anoV, parcela);
    out.lancamentos.push({ data: iso(ano, mesC, dia), mes: out.mes, descricao: desc, valor, tipo, parcela, moeda, valorOriginal });
  });
  if (!out.lancamentos.length) out.avisos.push('Não reconheci os lançamentos desta fatura OuroCard.');
  const soma = r2(out.lancamentos.reduce((s, x) => s + x.valor, 0));
  const somaSemPag = r2(out.lancamentos.filter((x) => x.tipo !== 'pagamento_fatura').reduce((s, x) => s + x.valor, 0));
  const cands = [];
  if (out.total != null && anterior != null) cands.push({ esperado: r2(out.total - anterior), lido: soma, regra: 'saldo anterior + lançamentos = total da fatura' });
  if (comprasDeb != null) cands.push({ esperado: Math.abs(comprasDeb), lido: somaSemPag, regra: 'compras e débitos (sem os pagamentos) = "Compras/Débitos" do resumo' });
  if (out.total != null) {
    cands.push({ esperado: out.total, lido: somaSemPag, regra: 'compras e encargos − estornos = total da fatura' });
    cands.push({ esperado: out.total, lido: soma, regra: 'lançamentos = total da fatura' });
  }
  if (cands.length && out.lancamentos.length) {
    const bom = cands.find((c) => Math.abs(c.lido - c.esperado) <= 0.05 + 1e-9);
    const c = bom || cands[0];
    out.conferencia = { ok: !!bom, esperado: c.esperado, lido: c.lido, diferenca: r2(c.lido - c.esperado), regra: c.regra };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conta - classificação comum
// ---------------------------------------------------------------------------

/** Mesmo nome (titular x contraparte), tolerando corte no fim ("Fulano De Tal Exem" = "FULANO DE TAL EXEMPLO"). */
export function mesmoNome(a, b) {
  const n = (s) => semAcento(s).toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const x = n(a); const y = n(b);
  if (!x || !y || Math.min(x.length, y.length) < 8) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

/**
 * Tipo de um movimento de conta. `sentido` 'saida' | 'entrada'; `contraparte`
 * o nome do outro lado (Pix/TED), quando houver.
 */
export function tipoMovimentoConta(historico, sentido, { contraparte = '', titular = '' } = {}) {
  const s = semAcento(`${historico} ${contraparte}`).toUpperCase();
  const h = semAcento(historico).toUpperCase();
  if (/PAGAMENTO\s+DE\s+FATURA|PAGTO\.?\s+(?:DE\s+)?(?:CARTAO|FATURA)|PAGAMENTO\s+(?:DE\s+)?CARTAO|FATURA\s+CARTAO|CARTAO\s+DE\s+CREDITO/.test(h)) return sentido === 'saida' ? 'pagamento_fatura' : 'receita';
  if (/APLICA|DINHEIRO GUARDADO|GUARDADO|\bRDB\b|\bCDB\b|INVEST\s*FACIL|POUPANCA|TESOURO|NUINVEST|CORRETORA|COMPRA DE (?:CRIPTO|BITCOIN)|CAIXINHA/.test(h)) return sentido === 'saida' ? 'investimento' : 'resgate';
  if (/RESGATE|DINHEIRO RESGATADO/.test(h)) return sentido === 'saida' ? 'investimento' : 'resgate';
  if (contraparte && titular && mesmoNome(contraparte, titular)) return 'transferencia_propria';
  if (sentido === 'entrada') return /ESTORNO|REEMBOLSO|DEVOLUCAO|CANCELAMENTO/.test(s) ? 'estorno' : 'receita';
  if (/TARIFA|CESTA|ANUIDADE|\bIOF\b|JUROS|ENCARGO|MULTA/.test(h)) return 'tarifa';
  if (/BOLETO|PAGTO\s+(?:DE\s+)?TITULO|PAGAMENTO\s+DE\s+TITULO|CONVENIO/.test(h)) return 'boleto';
  if (/DEBITO AUTOMATICO|CONTA DE (?:LUZ|AGUA|GAS|TELEFONE)|DEB\.?\s*AUT/.test(h)) return 'debito_automatico';
  if (/SAQUE/.test(h)) return 'saque';
  if (/COMPRA|DEBITO\s+(?:NO\s+)?CARTAO|CARTAO\s+(?:VISA|ELO|MASTER)|NUPAY/.test(h)) return 'compra';
  if (/PIX|TRANSF|TED|DOC\b/.test(h)) return 'transferencia';
  return 'outro';
}

// ---------------------------------------------------------------------------
// Conta - Nubank
// ---------------------------------------------------------------------------

const RODAPE_NUBANK = /^(TEM ALGUMA DUVIDA|METROPOLITANAS|CASO A SOLUCAO|DISPONIVEIS EM|EXTRATO GERADO|O SALDO LIQUIDO|NAO NOS RESPONSABILIZAMOS|ASSEGURAMOS|NU FINANCEIRA|INVESTIMENTO\s+PAGAMENTO|CNPJ:|CPF\b|VALORES EM R\$|\d{2} DE [A-Z]+ DE \d{4}\s+A\s+)/;

export function lerExtratoNubank(linhas) {
  const L = normLinhas(linhas);
  const T = L.map((l) => semAcento(l).toUpperCase());
  const out = { tipoDoc: 'extrato', fonte: 'nubank-conta', origem: 'conta', periodo: null, meses: [], total: null, entradas: null, lancamentos: [], conferencia: null, avisos: [] };
  const iCpf = T.findIndex((u) => /^CPF\b/.test(u));
  const titular = iCpf > 0 ? L[iCpf - 1] : '';
  const reExt = `(${MESES_EXT.join('|')})`;
  const mp = T.join('\n').match(new RegExp(`(\\d{2}) DE ${reExt} DE (\\d{4})\\s+A\\s+(\\d{2}) DE ${reExt} DE (\\d{4})`));
  if (mp) {
    out.periodo = { inicio: iso(mp[3], MESES_EXT.indexOf(mp[2]) + 1, mp[1]), fim: iso(mp[6], MESES_EXT.indexOf(mp[5]) + 1, mp[4]) };
    out.meses = mesesEntre(out.periodo.inicio, out.periodo.fim);
  } else out.avisos.push('Não achei o período do extrato.');
  const totalDe = (re) => { const i = T.findIndex((u) => re.test(u)); if (i < 0) return null; const m = T[i].match(new RegExp(`([+-]?\\s?${NUM})\\s*$`)); return m ? Math.abs(valorBR(m[1])) : null; };
  const iMov = T.findIndex((u) => /^MOVIMENTACOES\b/.test(u));
  const resumo = iMov > 0 ? T.slice(0, iMov) : T;
  const achaResumo = (re) => { const u = resumo.find((x) => re.test(x)); if (!u) return null; const m = u.match(new RegExp(`([+-]?\\s?${NUM})\\s*$`)); return m ? Math.abs(valorBR(m[1])) : null; };
  out.total = achaResumo(/^TOTAL DE SAIDAS/) ?? totalDe(/^TOTAL DE SAIDAS/);
  out.entradas = achaResumo(/^TOTAL DE ENTRADAS/);

  const reAbr = `(${MESES_ABREV.join('|')})`;
  const reDia = new RegExp(`^(\\d{2})\\s+${reAbr}\\s+(\\d{4})\\b`);
  const reFim = new RegExp(`^(.*?)\\s+([+-]?\\s?${NUM})$`);
  let dia = null; let sentido = null;
  let somaE = 0; let somaS = 0;
  for (let i = Math.max(0, iMov + 1); i < L.length; i += 1) {
    let u = T[i]; let l = L[i];
    const md = u.match(reDia);
    if (md) {
      dia = iso(md[3], MESES_ABREV.indexOf(md[2]) + 1, md[1]);
      u = u.slice(md[0].length).trim(); l = l.replace(/^\d{2}\s+\S+\s+\d{4}\s*/, '');
      if (!u) continue;
    }
    if (/^TOTAL DE ENTRADAS/.test(u)) { sentido = 'entrada'; continue; }
    if (/^TOTAL DE SAIDAS/.test(u)) { sentido = 'saida'; continue; }
    if (RODAPE_NUBANK.test(u) || (titular && semAcento(l).toUpperCase() === semAcento(titular).toUpperCase()) || /^\d+\s+DE\s+\d+$/.test(u)) continue;
    const m = l.match(reFim);
    if (!m || !dia || !sentido) continue;
    const partes = m[1].split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
    const historico = partes[0] || '';
    let contraparte = partes.slice(1).join(' ');
    if (!contraparte) {
      const tm = historico.match(/^(Transfer[eê]ncia (?:enviada|recebida)(?: pelo Pix)?|Pagamento de boleto efetuado|Compra no d[eé]bito(?: via NuPay)?|Pagamento de fatura)\s+(.+)$/i);
      if (tm) contraparte = tm[2];
    }
    const nomeCp = contraparte.split(/\s+-\s+/)[0].trim();
    const valorAbs = Math.abs(valorBR(m[2]));
    if (sentido === 'entrada') somaE += valorAbs; else somaS += valorAbs;
    const tipo = tipoMovimentoConta(historico, sentido, { contraparte: nomeCp, titular });
    if (sentido === 'entrada' && tipo !== 'estorno') continue; // entradas: só o total (salário, Pix recebido... não são gasto)
    const rotulo = /pix/i.test(historico) ? (sentido === 'saida' ? 'Pix enviado' : 'Pix recebido') : historico.replace(/\s+efetuado$/i, '');
    const desc = limparDescricao(nomeCp && !historico.toUpperCase().includes(nomeCp.toUpperCase()) ? `${rotulo} · ${nomeCp}` : (contraparte ? `${rotulo} · ${contraparte}` : rotulo));
    out.lancamentos.push({ data: dia, mes: mesDeIso(dia), descricao: desc, valor: sentido === 'saida' ? valorAbs : -valorAbs, tipo, parcela: '', moeda: 'BRL', valorOriginal: null });
  }
  if (!out.lancamentos.length && !somaS) out.avisos.push('Não achei movimentações no extrato.');
  if (out.total != null) {
    const ok = Math.abs(r2(somaS) - out.total) <= 0.05 && (out.entradas == null || Math.abs(r2(somaE) - out.entradas) <= 0.05);
    out.conferencia = { ok, esperado: out.total, lido: r2(somaS), diferenca: r2(somaS - out.total), regra: 'saídas lidas = total de saídas (e entradas = total de entradas)' };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conta - Bradesco (Bradesco Celular)
// ---------------------------------------------------------------------------

const CAB_BRADESCO = /^(BRADESCO CELULAR|DATA:|NOME:|EXTRATO DE:|DATA\s+HISTORICO|FOLHA|ULTIMOS LANCAMENTOS|TOTAL\b|SALDO\s+(?:ANTERIOR|DISPONIVEL|TOTAL))/;

export function lerExtratoBradesco(linhas) {
  const L = normLinhas(linhas);
  const T = L.map((l) => semAcento(l).toUpperCase());
  const out = { tipoDoc: 'extrato', fonte: 'bradesco', origem: 'conta', periodo: null, meses: [], total: null, entradas: null, lancamentos: [], conferencia: null, avisos: [] };
  const tudo = T.join('\n');
  const nomeM = L.map((l) => l.match(/^Nome:\s*(.+)$/i)).find(Boolean);
  const titular = nomeM ? nomeM[1].trim() : '';
  const mp = tudo.match(/MOVIMENTACAO ENTRE:\s*(\d{2})\/(\d{2})\/(\d{4})\s+E\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (mp) {
    out.periodo = { inicio: iso(mp[3], mp[2], mp[1]), fim: iso(mp[6], mp[5], mp[4]) };
    out.meses = mesesEntre(out.periodo.inicio, out.periodo.fim);
  }
  // linha de valor: [data] docto valor saldo   |   saldo inicial: [data] COD. LANC. 0  0,00  saldo
  const reValor = new RegExp(`^(?:(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+)?(\\d{1,9})\\s+(${NUM})\\s+(-?${NUM})$`);
  const reInicial = new RegExp(`^(?:(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+)?COD\\.?\\s*LANC\\.?\\s*0\\s+(${NUM})(?:\\s+(-?${NUM}))?$`);
  let data = null; let saldo = null;
  let texto = []; // linhas de texto desde o último valor
  const movs = [];
  let encadeado = 0; let quebrados = 0;
  const fechar = (semProximo = false) => {
    // o texto entre 2 valores: 1º = complemento do anterior, último = histórico do próximo
    // (antes de uma linha de saldo "COD. LANC. 0" - nova folha - não há próximo)
    const ant = movs[movs.length - 1];
    if (ant && (texto.length >= 2 || (semProximo && texto.length))) ant.complemento = texto[0];
    const hist = texto.length ? texto[texto.length - 1] : '';
    texto = [];
    return hist;
  };
  L.forEach((l, i) => {
    const u = T[i].replace(/\s{2,}/g, ' ');
    if (CAB_BRADESCO.test(u)) return;
    const mi = u.match(reInicial);
    if (mi) { if (mi[1]) data = iso(mi[3], mi[2], mi[1]); const s = valorBR(mi[5] || mi[4]); if (saldo == null) saldo = s; fechar(true); return; }
    const mv = u.match(reValor);
    if (mv) {
      if (mv[1]) data = iso(mv[3], mv[2], mv[1]);
      const hist = fechar();
      const valor = valorBR(mv[5]); const novo = valorBR(mv[6]);
      let sentido = null;
      if (saldo != null) {
        if (Math.abs(r2(saldo + valor) - novo) <= 0.01) sentido = 'entrada';
        else if (Math.abs(r2(saldo - valor) - novo) <= 0.01) sentido = 'saida';
      }
      if (sentido) encadeado += 1; else { quebrados += 1; sentido = /RECEBID|DEP\b|DEPOSITO|CREDITO|ESTORNO|RESGATE|REMET/.test(hist) ? 'entrada' : 'saida'; }
      saldo = novo;
      movs.push({ data, historico: L[i - 1] && T[i - 1].replace(/\s{2,}/g, ' ') === hist ? L[i - 1] : hist, valor, sentido, complemento: '' });
      return;
    }
    texto.push(L[i]);
  });
  // último complemento
  if (movs.length && texto.length) movs[movs.length - 1].complemento = texto[0];
  let somaS = 0; let somaE = 0;
  movs.forEach((mo) => {
    if (!mo.data) return;
    if (mo.sentido === 'saida') somaS += mo.valor; else somaE += mo.valor;
    const comp = String(mo.complemento || '');
    const cp = (comp.match(/^(?:DES|REM):\s*(.+?)(?:\s+\d{2}\/\d{2})?$/i) || [])[1] || '';
    const tipo = tipoMovimentoConta(mo.historico, mo.sentido, { contraparte: cp, titular });
    if (mo.sentido === 'entrada' && tipo !== 'estorno') return;
    const h = semAcento(mo.historico).toUpperCase();
    let desc;
    if (/COMPRA CARTAO|COMPRA COM CARTAO/.test(h)) desc = comp || mo.historico;
    else if (cp) desc = `${/PIX/.test(h) ? 'Pix enviado' : mo.historico} · ${cp}`;
    else desc = comp ? `${mo.historico} · ${comp}` : mo.historico;
    desc = limparDescricao(desc.replace(/-\d{6,}.*$/, ''));
    out.lancamentos.push({ data: mo.data, mes: mesDeIso(mo.data), descricao: desc, valor: mo.sentido === 'saida' ? mo.valor : -mo.valor, tipo, parcela: '', moeda: 'BRL', valorOriginal: null });
  });
  out.total = r2(somaS);
  out.entradas = r2(somaE);
  if (!movs.length) out.avisos.push('Não achei movimentações no extrato.');
  if (!out.meses.length && movs.length) {
    const ds = movs.map((m) => m.data).filter(Boolean).sort();
    out.periodo = { inicio: ds[0], fim: ds[ds.length - 1] };
    out.meses = mesesEntre(ds[0], ds[ds.length - 1]);
  }
  if (movs.length) out.conferencia = { ok: quebrados === 0, esperado: movs.length, lido: encadeado, diferenca: quebrados, regra: 'cada lançamento fecha com o saldo da linha' };
  return out;
}

// ---------------------------------------------------------------------------
// CSV (Nubank) e OFX
// ---------------------------------------------------------------------------

function separarCsv(linha) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (c === '"') { if (q && linha[i + 1] === '"') { cur += '"'; i += 1; } else q = !q; } else if ((c === ',' || c === ';') && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const numCsv = (s) => { const t = String(s || '').trim(); if (/,\d{2}$/.test(t)) return valorBR(t); const n = Number(t); return Number.isFinite(n) ? n : null; };
const dataCsv = (s) => { const t = String(s || '').trim(); let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

/**
 * CSV exportado pelo Nubank: cartão ("date,title,amount", amount + = compra)
 * ou conta ("Data,Valor,Identificador,Descrição", Valor − = saída).
 * `nome` do arquivo (opcional) ajuda a achar o mês da fatura ("..._2025-01-13.csv").
 */
export function lerCsvGastos(texto, { nome = '' } = {}) {
  const L = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const cab = separarCsv(L[0] || '').map((c) => semAcento(c).toLowerCase());
  const ic = (...ns) => cab.findIndex((c) => ns.includes(c));
  const cartao = ic('title') >= 0 && ic('amount') >= 0;
  const out = { tipoDoc: cartao ? 'fatura' : 'extrato', fonte: cartao ? 'nubank-cartao' : 'nubank-conta', origem: cartao ? 'cartao' : 'conta', mes: '', periodo: null, meses: [], total: null, lancamentos: [], conferencia: null, avisos: [] };
  const iD = ic('date', 'data'); const iV = cartao ? ic('amount') : ic('valor'); const iT = cartao ? ic('title') : ic('descricao', 'description');
  if (iD < 0 || iV < 0 || iT < 0) { out.avisos.push('CSV em formato desconhecido.'); return out; }
  const mesNome = (String(nome).match(/(\d{4})-(\d{2})-\d{2}/) || []);
  L.slice(1).forEach((l) => {
    const c = separarCsv(l);
    const data = dataCsv(c[iD]); const v = numCsv(c[iV]);
    if (!data || v == null) return;
    const descBruta = c[iT] || '';
    if (cartao) {
      const desc = limparDescricao(descBruta);
      out.lancamentos.push({ data, mes: '', descricao: desc, valor: r2(v), tipo: tipoLancamentoCartao(desc, v), parcela: parcelaDe(desc), moeda: 'BRL', valorOriginal: null });
    } else {
      const sentido = v < 0 ? 'saida' : 'entrada';
      const partes = descBruta.split(/\s+-\s+/);
      const tipo = tipoMovimentoConta(partes[0], sentido, { contraparte: partes[1] || '' });
      if (sentido === 'entrada' && tipo !== 'estorno') return;
      const desc = limparDescricao(partes[1] ? `${/pix/i.test(partes[0]) ? 'Pix enviado' : partes[0]} · ${partes[1]}` : partes[0]);
      out.lancamentos.push({ data, mes: data.slice(0, 7), descricao: desc, valor: r2(-v), tipo, parcela: '', moeda: 'BRL', valorOriginal: null });
    }
  });
  const datas = out.lancamentos.map((x) => x.data).sort();
  if (cartao) {
    out.mes = mesNome[1] ? `${mesNome[1]}-${mesNome[2]}` : (datas.length ? somarMes(datas[datas.length - 1].slice(0, 7), 1) : '');
    out.lancamentos.forEach((x) => { x.mes = out.mes; });
  } else if (datas.length) {
    out.periodo = { inicio: datas[0], fim: datas[datas.length - 1] };
    out.meses = mesesEntre(datas[0], datas[datas.length - 1]);
  }
  out.total = r2(out.lancamentos.filter((x) => x.valor > 0).reduce((s, x) => s + x.valor, 0));
  if (!out.lancamentos.length) out.avisos.push('Nenhum lançamento no CSV.');
  return out;
}

/** OFX (qualquer banco): <STMTTRN> com TRNAMT/DTPOSTED/MEMO|NAME. Cartão se vier <CCSTMTRS>. */
export function lerOfxGastos(texto) {
  const t = String(texto || '');
  const cartao = /<CCSTMTRS>/i.test(t);
  const out = { tipoDoc: cartao ? 'fatura' : 'extrato', fonte: cartao ? 'ofx-cartao' : 'ofx-conta', origem: cartao ? 'cartao' : 'conta', mes: '', periodo: null, meses: [], total: null, lancamentos: [], conferencia: null, avisos: [] };
  const tag = (bloco, n) => { const m = bloco.match(new RegExp(`<${n}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
  (t.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) || []).forEach((b) => {
    const d = tag(b, 'DTPOSTED').match(/^(\d{4})(\d{2})(\d{2})/);
    const v = Number(tag(b, 'TRNAMT').replace(',', '.'));
    if (!d || !Number.isFinite(v)) return;
    const data = `${d[1]}-${d[2]}-${d[3]}`;
    const memo = tag(b, 'MEMO') || tag(b, 'NAME');
    const saida = v < 0;
    if (cartao) {
      const desc = limparDescricao(memo);
      out.lancamentos.push({ data, mes: data.slice(0, 7), descricao: desc, valor: r2(-v), tipo: tipoLancamentoCartao(desc, -v), parcela: parcelaDe(desc), moeda: 'BRL', valorOriginal: null });
    } else {
      const tipo = tipoMovimentoConta(memo, saida ? 'saida' : 'entrada');
      if (!saida && tipo !== 'estorno') return;
      out.lancamentos.push({ data, mes: data.slice(0, 7), descricao: limparDescricao(memo), valor: r2(-v), tipo, parcela: '', moeda: 'BRL', valorOriginal: null });
    }
  });
  const datas = out.lancamentos.map((x) => x.data).sort();
  if (datas.length) {
    out.periodo = { inicio: datas[0], fim: datas[datas.length - 1] };
    out.meses = mesesEntre(datas[0], datas[datas.length - 1]);
    if (cartao) out.mes = datas[datas.length - 1].slice(0, 7);
  }
  out.total = r2(out.lancamentos.filter((x) => x.valor > 0).reduce((s, x) => s + x.valor, 0));
  if (!out.lancamentos.length) out.avisos.push('Nenhum lançamento no OFX.');
  return out;
}

// ---------------------------------------------------------------------------
// Entrada única
// ---------------------------------------------------------------------------

/**
 * Linhas de PDF -> documento lido (ou { erro }).
 * 03/10/2026: `entrada` pode ser as linhas (como antes) ou { paginas } com
 * os itens do pdf.js COM posição (extrairPaginasPdfComSenha) - aí a fatura
 * do BB é lida painel por painel. `dica`: { banco, origem, nome }.
 */
export function lerDocumentoGasto(entrada, dica = {}) {
  const paginas = entrada && !Array.isArray(entrada) && Array.isArray(entrada.paginas) ? entrada.paginas : null;
  const linhas = paginas ? linhasDeItens(paginas) : entrada;
  if (paginas && normLinhas(linhas).join('').replace(/[^A-Za-z]/g, '').length < 30) {
    return { erro: 'Este PDF não tem texto que dê pra ler (parece imagem/escaneado). Baixe de novo pelo app ou site do banco.', lancamentos: [], avisos: [] };
  }
  const tipo = identificarDocumentoGasto(linhas, dica);
  let r;
  if (tipo === 'nubank-cartao') r = lerFaturaNubank(linhas);
  else if (tipo === 'nubank-conta') r = lerExtratoNubank(linhas);
  else if (tipo === 'bradesco') r = lerExtratoBradesco(linhas);
  else if (tipo === 'ourocard') r = lerFaturaOurocard(paginas ? linhasDeItens(paginas, { colunas: true }) : linhas, { nome: dica.nome });
  else return { erro: 'Não reconheci este documento (fatura ou extrato).', lancamentos: [], avisos: [] };
  // 03/10/2026: só a PASTA dizia o banco e nada foi lido - provavelmente não é fatura/extrato
  if (!r.lancamentos.length && !identificarDocumentoGasto(linhas)) {
    const nome = { 'nubank-cartao': 'fatura do Nubank', 'nubank-conta': 'extrato do Nubank', bradesco: 'extrato do Bradesco', ourocard: 'fatura OuroCard' }[tipo];
    r.erro = `Não parece uma ${nome} (está na pasta dele, mas o texto não bate): ${(r.avisos || []).join(' ') || 'nenhum lançamento'}`;
  }
  return r;
}

/** Meses que o documento cobre (fatura: o do vencimento; extrato: o período). */
export function mesesDoDocumento(doc) {
  if (!doc) return [];
  if (doc.tipoDoc === 'fatura') return doc.mes ? [doc.mes] : [];
  if (doc.meses && doc.meses.length) return doc.meses;
  return [...new Set((doc.lancamentos || []).map((l) => l.mes))].sort();
}

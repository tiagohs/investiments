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

/** "R$ 1.234,56", "-R$ 88,30", "- 1.259,00", "+7,00", "US$ 9,50" -> número (sinal incluído). */
export function valorBR(s) {
  if (s == null) return null;
  const t = String(s).replace(/\s+/g, '');
  const m = t.match(/^([+-]?)(?:R\$|US\$|USD|BRL)?([+-]?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})$/i);
  if (!m) return null;
  const n = Number(`${m[3].replace(/\./g, '')}.${m[4]}`);
  return (m[1] === '-' || m[2] === '-') ? -n : n;
}

/**
 * Descrição sem dado sensível: tira CPF/CNPJ (inteiros ou mascarados),
 * "Agência: 1 Conta: 123-4", sequências longas de dígitos (cartão, conta,
 * código de autorização) e o "- -" que sobra.
 */
export function limparDescricao(s, max = 80) {
  let t = String(s == null ? '' : s);
  t = t.replace(/[•*]{2,}[\d.\-•*]*/g, ' ');
  t = t.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-?\d{0,2}/g, ' ');
  t = t.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, ' ');
  t = t.replace(/\b(?:Ag[eê]ncia|AG\.?)\s*:\s*[\d-]*|\bAg[eê]ncia\s+\d[\d-]*/gi, ' ');
  t = t.replace(/\bConta\s*:\s*[\d.\-xX]*|\bConta\s+\d[\d.\-]*/gi, ' ');
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
const normLinhas = (linhas) => (Array.isArray(linhas) ? linhas : String(linhas || '').split(/\r?\n/)).map((l) => String(l == null ? '' : l).replace(/ /g, ' ').trim()).filter(Boolean);
const plano = (L) => semAcento(L.join('\n')).toUpperCase();

/** Parcela "Parcela 2/5", "PARC 03/10", "PARC.03 DE 10" -> '2/5'. */
export function parcelaDe(desc) {
  const s = semAcento(desc).toUpperCase();
  let m = s.match(/\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE)\s*(\d{1,2})\b/);
  if (!m) m = s.match(/\s(\d{2})\/(\d{2})\s*$/);
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
// Cartão - Nubank
// ---------------------------------------------------------------------------

function anoDaCompra(mesCompra, mesVenc, anoVenc) { return mesCompra > mesVenc ? anoVenc - 1 : anoVenc; }

export function lerFaturaNubank(linhas) {
  const L = normLinhas(linhas);
  const out = { tipoDoc: 'fatura', fonte: 'nubank-cartao', origem: 'cartao', mes: '', vencimento: '', total: null, lancamentos: [], conferencia: null, avisos: [] };
  const T = L.map((l) => semAcento(l).toUpperCase());
  const tudo = T.join('\n');
  const reAbr = `(${MESES_ABREV.join('|')})`;
  let mv = tudo.match(new RegExp(`DATA DE VENCIMENTO:?\\s*(\\d{2})\\s+${reAbr}\\s+(\\d{4})`));
  if (!mv) mv = tudo.match(new RegExp(`\\bFATURA\\s+(\\d{2})\\s+${reAbr}\\s+(\\d{4})`));
  if (!mv) { out.avisos.push('Não achei a data de vencimento da fatura.'); return out; }
  const anoV = Number(mv[3]); const mesV = MESES_ABREV.indexOf(mv[2]) + 1;
  out.vencimento = iso(anoV, mesV, Number(mv[1]));
  out.mes = `${anoV}-${p2(mesV)}`;
  const resumo = (re) => { const m = tudo.match(re); return m ? valorBR(m[1]) : null; };
  const anterior = resumo(new RegExp(`FATURA ANTERIOR\\s+(-?R\\$\\s?${NUM})`));
  const pagRec = resumo(new RegExp(`PAGAMENTOS? RECEBIDOS?\\s+(-?R\\$\\s?${NUM})`));
  const compras = resumo(new RegExp(`TOTAL DE COMPRAS[^\\n]*?\\s(-?R\\$\\s?${NUM})`));
  const outros = resumo(new RegExp(`OUTROS LANCAMENTOS\\s+(-?R\\$\\s?${NUM})`));
  out.total = resumo(new RegExp(`TOTAL A PAGAR\\s+(-?R\\$\\s?${NUM})`));

  const reLinha = new RegExp(`^(\\d{2})\\s+${reAbr}\\s+(.+?)\\s+(-?\\s?R\\$\\s?-?${NUM})$`);
  const reUsd = new RegExp(`\\b(?:USD|US\\$)\\s?(${NUM})`);
  let dentro = false;
  L.forEach((l, i) => {
    const u = T[i];
    if (/^TRANSACOES\b/.test(u)) { dentro = true; return; }
    if (!dentro) return;
    const m = u.match(reLinha);
    if (!m) {
      // "USD 9,50" logo abaixo de uma compra internacional
      const us = u.match(reUsd);
      const ult = out.lancamentos[out.lancamentos.length - 1];
      if (us && ult && !ult.valorOriginal) { ult.moeda = 'USD'; ult.valorOriginal = valorBR(us[1]); }
      return;
    }
    const mesC = MESES_ABREV.indexOf(m[2]) + 1;
    const ano = anoDaCompra(mesC, mesV, anoV);
    const original = l.match(new RegExp(`^\\d{2}\\s+\\S+\\s+(.+?)\\s+-?\\s?R\\$`));
    const bruto = (original ? original[1] : m[3]).replace(/\s{2,}.*$/, (x) => x); // descrição como veio
    const valor = valorBR(m[4]);
    const desc = limparDescricao(bruto.replace(/\s{2,}/g, ' '));
    out.lancamentos.push({ data: iso(ano, mesC, Number(m[1])), mes: out.mes, descricao: desc, valor, tipo: tipoLancamentoCartao(desc, valor), parcela: parcelaDe(desc), moeda: 'BRL', valorOriginal: null });
  });
  if (!out.lancamentos.length) out.avisos.push('Não achei nenhuma transação na fatura.');
  // conferência: as linhas (pagamentos incluídos) somam pagamentos + compras + outros lançamentos do resumo
  const soma = r2(out.lancamentos.reduce((s, x) => s + x.valor, 0));
  if (compras != null) {
    const esperado = r2((pagRec || 0) + compras + (outros || 0));
    out.conferencia = { ok: Math.abs(soma - esperado) <= 0.05, esperado, lido: soma, diferenca: r2(soma - esperado), regra: 'transações = pagamentos + compras + outros lançamentos' };
  } else if (out.total != null && anterior != null) {
    const esperado = r2(out.total - anterior);
    out.conferencia = { ok: Math.abs(soma - esperado) <= 0.05, esperado, lido: soma, diferenca: r2(soma - esperado), regra: 'fatura anterior + transações = total a pagar' };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cartão - OuroCard (Banco do Brasil)
// ---------------------------------------------------------------------------

/**
 * 02/10/2026: leitor genérico das faturas OuroCard. Cada lançamento é uma
 * linha "dd/mm  descrição  [cidade]  [país]  valor R$  [valor US$]"; a
 * descrição é o 1º bloco depois da data (o pdf.js separa as colunas com 2
 * espaços), cidade/país ficam de fora. Saldo anterior, totais e subtotais
 * não são lançamento. A conferência usa o "Total da fatura" (e o saldo
 * anterior, se a fatura mostrar) - a tela avisa quando a soma não bate.
 */
export function lerFaturaOurocard(linhas) {
  const L = normLinhas(linhas);
  const out = { tipoDoc: 'fatura', fonte: 'ourocard', origem: 'cartao', mes: '', vencimento: '', total: null, lancamentos: [], conferencia: null, avisos: [] };
  const T = L.map((l) => semAcento(l).toUpperCase());
  const tudo = T.join('\n');
  const mv = tudo.match(/VENCIMENTO[^\d\n]{0,30}(\d{2})[/.](\d{2})[/.](\d{2,4})/) || tudo.match(/VENCIMENTO[^\n]*\n[^\d\n]{0,30}(\d{2})[/.](\d{2})[/.](\d{2,4})/);
  if (!mv) { out.avisos.push('Não achei a data de vencimento da fatura.'); return out; }
  const anoV = Number(mv[3].length === 2 ? `20${mv[3]}` : mv[3]); const mesV = Number(mv[2]);
  out.vencimento = iso(anoV, mesV, Number(mv[1]));
  out.mes = `${anoV}-${p2(mesV)}`;
  const achar = (re) => { const m = tudo.match(re); return m ? valorBR(m[1]) : null; };
  const V = `(-?\\s?(?:R\\$\\s?)?-?\\s?${NUM})`;
  out.total = achar(new RegExp(`(?:TOTAL\\s+(?:DESTA|DA)\\s+FATURA|VALOR\\s+TOTAL\\s+(?:DESTA|DA)\\s+FATURA|SALDO\\s+DESTA\\s+FATURA|TOTAL\\s+A\\s+PAGAR)[^\\d\\n-]{0,40}${V}`));
  const anterior = achar(new RegExp(`SALDO\\s+(?:DA\\s+)?(?:FATURA\\s+)?ANTERIOR[^\\d\\n-]{0,30}${V}`));
  const cotacao = (() => { const m = tudo.match(/COTACAO[^\d\n]{0,40}(\d+,\d{2,4})/); return m ? Number(m[1].replace(',', '.')) : null; })();

  const reDinheiro = new RegExp(`^(-\\s?)?(R\\$|US\\$)?\\s?(-\\s?)?${NUM}$`);
  const ignorar = /SALDO\s+(?:DA\s+)?(?:FATURA\s+)?ANTERIOR|^TOTAL|SUBTOTAL|TOTAL\s+(?:DA|DESTA)\s+FATURA|LIMITE|VENCIMENTO|PAGAMENTO\s+MINIMO|ENCARGOS\s+(?:FINANCEIROS\s+)?(?:MAXIMOS|PARA O PROXIMO)/;
  L.forEach((l, i) => {
    const u = T[i];
    const md = u.match(/^(\d{2})[/.](\d{2})(?:[/.](\d{2,4}))?\s+(.+)$/);
    if (!md || ignorar.test(md[4])) return;
    // colunas pelo pdf.js (2+ espaços); sem isso, separa o(s) valor(es) do fim por regex
    const resto = l.replace(/^\d{2}[/.]\d{2}(?:[/.]\d{2,4})?\s+/, '');
    let partes = resto.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
    const valores = [];
    while (partes.length > 1 && reDinheiro.test(semAcento(partes[partes.length - 1]).toUpperCase())) valores.unshift(partes.pop());
    if (!valores.length) {
      const m = resto.match(new RegExp(`^(.*?)\\s+((?:-\\s?)?(?:R\\$\\s?)?-?\\s?${NUM})(?:\\s+((?:-\\s?)?(?:US\\$\\s?)?-?\\s?${NUM}))?$`));
      if (!m) return;
      partes = [m[1]];
      valores.push(m[2]); if (m[3]) valores.push(m[3]);
    }
    const dia = Number(md[1]); const mesC = Number(md[2]);
    if (dia < 1 || dia > 31 || mesC < 1 || mesC > 12) return;
    let valor = null; let moeda = 'BRL'; let valorOriginal = null;
    const v0 = valores[0]; const v1 = valores[1];
    if (/US\$/i.test(v0) && !v1) { moeda = 'USD'; valorOriginal = valorBR(v0); valor = cotacao ? r2(valorOriginal * cotacao) : null; } else {
      valor = valorBR(v0);
      if (v1) { const us = valorBR(v1); if (us) { moeda = 'USD'; valorOriginal = us; } }
    }
    if (valor == null) { out.avisos.push(`Lançamento em dólar sem valor em reais: ${limparDescricao(partes[0])}`); return; }
    const desc = limparDescricao(partes[0].replace(/\s+(?:BR|BRA)$/i, ''));
    if (!desc) return;
    const ano = md[3] ? Number(md[3].length === 2 ? `20${md[3]}` : md[3]) : anoDaCompra(mesC, mesV, anoV);
    out.lancamentos.push({ data: iso(ano, mesC, dia), mes: out.mes, descricao: desc, valor, tipo: tipoLancamentoCartao(desc, valor), parcela: parcelaDe(desc), moeda, valorOriginal });
  });
  if (!out.lancamentos.length) out.avisos.push('Não reconheci os lançamentos desta fatura OuroCard - me mande um exemplo do formato.');
  const soma = r2(out.lancamentos.reduce((s, x) => s + x.valor, 0));
  const somaSemPag = r2(out.lancamentos.filter((x) => x.tipo !== 'pagamento_fatura').reduce((s, x) => s + x.valor, 0));
  if (out.total != null) {
    const cands = [];
    if (anterior != null) cands.push({ esperado: r2(out.total - anterior), lido: soma, regra: 'saldo anterior + lançamentos = total da fatura' });
    cands.push({ esperado: out.total, lido: somaSemPag, regra: 'compras e encargos − estornos = total da fatura' });
    cands.push({ esperado: out.total, lido: soma, regra: 'lançamentos = total da fatura' });
    const bom = cands.find((c) => Math.abs(c.lido - c.esperado) <= 0.05);
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

/** Linhas de PDF -> documento lido (ou { erro }). */
export function lerDocumentoGasto(linhas, dica = {}) {
  const tipo = identificarDocumentoGasto(linhas, dica);
  if (tipo === 'nubank-cartao') return lerFaturaNubank(linhas);
  if (tipo === 'nubank-conta') return lerExtratoNubank(linhas);
  if (tipo === 'bradesco') return lerExtratoBradesco(linhas);
  if (tipo === 'ourocard') return lerFaturaOurocard(linhas);
  return { erro: 'Não reconheci este documento (fatura ou extrato).', lancamentos: [], avisos: [] };
}

/** Meses que o documento cobre (fatura: o do vencimento; extrato: o período). */
export function mesesDoDocumento(doc) {
  if (!doc) return [];
  if (doc.tipoDoc === 'fatura') return doc.mes ? [doc.mes] : [];
  if (doc.meses && doc.meses.length) return doc.meses;
  return [...new Set((doc.lancamentos || []).map((l) => l.mes))].sort();
}

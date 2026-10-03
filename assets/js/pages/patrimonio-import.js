/**
 * patrimonio-import.js - 27/09/2026: ler no navegador os documentos que
 * alimentam a aba Patrimônio da Organização Financeira.
 *
 * Cada leitor recebe as LINHAS de texto do PDF (holerite.js/extrairLinhasPdf,
 * pdf.js no navegador) e devolve só números agregados - o que a tela mostra
 * pra conferir antes de salvar. Nada de CPF, PIS, número de conta, endereço,
 * nome de vendedor, CNPJ ou número de contrato sai daqui: o PDF não sai do
 * navegador e a planilha (privada, no Drive do Tiago) guarda só os totais.
 *
 *  - lerDeclaracaoIr   "Cópia da Declaração" do IRPF (qualquer ano): bens e
 *                      dívidas em 31/12, bens por grupo, rendimentos, imposto.
 *  - lerExtratoFgts    extrato do FGTS por empregador (app FGTS/Caixa).
 *  - lerCtps           "Contratos de trabalho" da Carteira de Trabalho Digital.
 *  - lerExtratoCaixaHabitacao  "Demonstrativo de Evolução - Habitação" (Caixa).
 *  - lerExtratoFies    comprovante do SISBB (Banco do Brasil) com o saldo do FIES.
 *  - identificarDocumento  diz qual dos leitores acima usar.
 *
 * Os leitores trabalham com o texto sem acento e em maiúsculas (os PDFs
 * variam acento/caixa entre anos) e toleram quebras de linha diferentes das
 * do pdftotext - o pdf.js agrupa por altura, então uma "linha" pode juntar
 * colunas vizinhas.
 */

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const NUM = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
const numBR = (s) => {
  if (s == null || s === '') return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const r2 = (v) => Math.round(v * 100) / 100;
/** "dd/mm/aaaa", "dd.mm.aaaa" ou "dd/mm/aa" -> "aaaa-mm-dd". */
export function dataIso(s) {
  const m = String(s || '').match(/(\d{2})[/.](\d{2})[/.](\d{2,4})/);
  if (!m) return null;
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2]}-${m[1]}`;
}
/**
 * 27/09/2026: o pdf.js entrega cada letra acentuada como um item separado
 * nesses PDFs (Caixa/FGTS usam uma fonte que quebra ali), e extrairLinhasPdf
 * junta itens com 2 espaços: "Hist  ó  rico de Movimenta  ç  õ  es". Aqui a
 * letra acentuada volta a grudar na palavra (só nos "2 espaços" do pdf.js;
 * espaço simples dentro do texto fica como está).
 */
export function juntarAcentos(linhas) {
  const A = '\u00C0-\u00FF';
  const antes = new RegExp(`([A-Za-z${A}]) {2}([${A}]+)`, 'g');
  const depois = new RegExp(`([${A}]+) {2}([A-Za-z${A}])`, 'g');
  return (linhas || []).map((l) => {
    let s = String(l == null ? '' : l);
    for (let k = 0; k < 6; k += 1) {
      const novo = s.replace(antes, '$1$2').replace(depois, '$1$2');
      if (novo === s) break;
      s = novo;
    }
    return s;
  });
}
const plano = (linhas) => semAcento((linhas || []).join(' ')).replace(/\s+/g, ' ').toUpperCase().trim();
const achar = (t, re) => { const m = t.match(re); return m ? m[1] : null; };

// ---------------------------------------------------------------------------
// Qual documento é
// ---------------------------------------------------------------------------

export function identificarDocumento(linhas) {
  linhas = juntarAcentos(linhas);
  const t = plano(linhas);
  if (/DECLARACAO DE AJUSTE ANUAL/.test(t) && /ANO-CALENDARIO/.test(t)) return 'ir';
  if (/HISTORICO DE MOVIMENTACOES/.test(t) && /EMPREGADOR/.test(t) && /(DEPOSITO|JAM|SAQUE)/.test(t)) return 'fgts';
  if (/CARTEIRA DE TRABALHO DIGITAL/.test(t) && /CONTRATOS DE TRABALHO/.test(t)) return 'ctps';
  if (/DEMONSTRATIVO DE EVOLUCAO/.test(t) && /HABITACAO/.test(t)) return 'caixa';
  if (/SISBB/.test(t) && /SALDO DEVEDOR/.test(t)) return 'fies';
  return null;
}

// ---------------------------------------------------------------------------
// IRPF - "Cópia da Declaração"
// ---------------------------------------------------------------------------

/** Grupos de Bens e Direitos (layout de 2023 em diante; o antigo, de código só, cai no grupo pelo 1º dígito). */
export const GRUPOS_IR = {
  '01': 'Imóveis', '02': 'Veículos e outros bens móveis', '03': 'Ações e participações', '04': 'Aplicações (renda fixa, poupança)',
  '05': 'Créditos', '06': 'Contas e dinheiro', '07': 'Fundos (FII, ETF, fundos)', '08': 'Criptoativos', '99': 'Outros',
};
const GRUPO_DO_CODIGO_ANTIGO = { 1: '01', 2: '02', 3: '03', 4: '04', 5: '05', 6: '06', 7: '07', 8: '08', 9: '99' };
const PAR_VALORES = new RegExp(`(?:^|\\s)(${NUM})\\s+(${NUM})(?=\\s|$)`);

/**
 * Bens e Direitos por grupo, lendo o bloco "DECLARACAO DE BENS E DIREITOS":
 * cada bem termina no país ("105 - BRASIL"), e no trecho de cada um o primeiro
 * par de valores é "situação no ano anterior / no ano". O grupo sai do código
 * no começo do bem ("01 11 ..." no layout novo, "41 ..." no antigo).
 */
function bensPorGrupo(t, layoutNovo) {
  const ini = t.search(/DECLARACAO DE BENS E DIREITOS/);
  if (ini < 0) return {};
  const fimRel = t.slice(ini).search(/DIVIDAS E ONUS REAIS/);
  let sec = fimRel < 0 ? t.slice(ini) : t.slice(ini, ini + fimRel);
  const cab = /SITUACAO EM\s*31\/12\/\d{4}\s*31\/12\/\d{4}/;
  // cabeçalho/rodapé de cada página ("CONTROLE: ... SITUACAO EM 31/12/x 31/12/y")
  sec = sec.replace(/CONTROLE:.*?SITUACAO EM\s*31\/12\/\d{4}\s*31\/12\/\d{4}/g, ' ');
  const h = sec.search(cab);
  if (h >= 0) sec = sec.slice(h).replace(cab, ' ');
  sec = sec.replace(/\bTOTAL\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}.*$/, ' ');
  const pedacos = sec.split(/\b\d{3}\s-\s[A-Z][A-Z]+/);
  const grupos = {};
  pedacos.slice(0, -1).forEach((p) => {
    const par = p.match(PAR_VALORES);
    if (!par) return;
    const antes = p.slice(0, par.index + 1);
    let grupo = null;
    if (layoutNovo) {
      const m = antes.match(/(?:^|\s)(0[1-8]|99)\s(\d{2})\s(?=\S)/);
      if (m) grupo = m[1];
    } else {
      const m = antes.match(/(?:^|\s)([1-9])(\d)\s(?=[A-Z"])/);
      if (m) grupo = GRUPO_DO_CODIGO_ANTIGO[m[1]];
    }
    if (!grupo) return;
    const g = grupos[grupo] || (grupos[grupo] = { anterior: 0, atual: 0, qtd: 0 });
    g.anterior = r2(g.anterior + numBR(par[1]));
    g.atual = r2(g.atual + numBR(par[2]));
    g.qtd += 1;
  });
  return grupos;
}

// ---------------------------------------------------------------------------
// 02/10/2026: renda e contas pela declaração (aba "Renda e Orçamentos").
// Tiago: "com as infos do meu IR, dá pra saber quanto eu ganhei mensalmente e
// conforme os anos" e "inclua aqui informações sobre as minhas contas: Bancos,
// com Agência e Conta". Agência e conta vão SÓ pra planilha privada dele
// (aux_patrimonio, chave 'ir'), nunca pro repositório; da fonte pagadora fica
// só a raiz do CNPJ (o da empresa, que é público) - nada de CPF.
// ---------------------------------------------------------------------------

/** Código COMPE do banco → nome curto (o que aparece no cartão da conta). */
export const BANCOS = {
  '001': 'Banco do Brasil', '003': 'Banco da Amazônia', '004': 'Banco do Nordeste', '021': 'Banestes', '033': 'Santander', '037': 'Banpará',
  '041': 'Banrisul', '047': 'Banese', '069': 'Crefisa', '070': 'BRB', '077': 'Inter', '085': 'Ailos', '102': 'XP', '104': 'Caixa',
  '121': 'Agibank', '133': 'Cresol', '136': 'Unicred', '197': 'Stone', '208': 'BTG Pactual', '212': 'Banco Original', '218': 'BS2',
  '237': 'Bradesco', '260': 'Nubank', '280': 'Will Bank', '290': 'PagBank', '318': 'BMG', '323': 'Mercado Pago', '336': 'C6 Bank',
  '341': 'Itaú', '348': 'XP', '364': 'Efí', '380': 'PicPay', '389': 'Mercantil', '403': 'Cora', '413': 'BV', '422': 'Safra',
  '461': 'Asaas', '536': 'Neon', '623': 'Pan', '633': 'Rendimento', '655': 'BV', '707': 'Daycoval', '735': 'Neon', '746': 'Modal',
  '748': 'Sicredi', '756': 'Sicoob',
};
export const nomeBanco = (codigo) => {
  const c = String(codigo == null ? '' : codigo).replace(/\D/g, '').padStart(3, '0');
  return BANCOS[c] || (c !== '000' ? `Banco ${c}` : 'Banco');
};

const RE_BANCO_CONTA = /BANCO:\s*(\d{1,3})\b(.{0,60}?)AGENCIA:\s*([0-9X][0-9X-]*)(?:\s+(?:CONTA|NUMERO DA CONTA):\s*([0-9X][0-9X.-]*))?/;

/** Tipo da conta pelo grupo/código do bem (layout novo) ou pelo código antigo. */
function tipoConta(grupo, codigo, codigoAntigo, pagamento) {
  if (pagamento) return 'pagamento';
  if (grupo === '06' && codigo === '01') return 'corrente';
  if (grupo === '04' && codigo === '01') return 'poupanca';
  if (codigoAntigo === '61' || codigoAntigo === '62') return 'corrente';
  if (codigoAntigo === '41') return 'poupanca';
  return grupo === '06' ? 'corrente' : 'aplicacao';
}

/**
 * Contas bancárias dos Bens e Direitos: "Banco: 001 Agência: 0001 Conta:
 * 12345-6" vem DEPOIS do "105 - Brasil" que fecha o bem (nos dois layouts),
 * então os dados do banco do bem k estão no começo do pedaço k+1. Entram as
 * contas com banco/agência e os "depósitos em conta corrente" (06 01) mesmo
 * sem eles. Saldos = situação em 31/12 do ano anterior e do ano.
 */
function contasDaDeclaracao(t, layoutNovo) {
  const ini = t.search(/DECLARACAO DE BENS E DIREITOS/);
  if (ini < 0) return [];
  const fimRel = t.slice(ini).search(/DIVIDAS E ONUS REAIS/);
  let sec = fimRel < 0 ? t.slice(ini) : t.slice(ini, ini + fimRel);
  sec = sec.replace(/CONTROLE:.*?SITUACAO EM\s*31\/12\/\d{4}\s*31\/12\/\d{4}/g, ' ');
  const cab = /SITUACAO EM\s*31\/12\/\d{4}\s*31\/12\/\d{4}/;
  const h = sec.search(cab);
  if (h >= 0) sec = sec.slice(h).replace(cab, ' ');
  const pedacos = sec.split(/\b\d{3}\s-\s[A-Z][A-Z]+/);
  const contas = [];
  pedacos.slice(0, -1).forEach((p, k) => {
    const par = p.match(PAR_VALORES);
    if (!par) return;
    const antes = p.slice(0, par.index + 1);
    let grupo = null; let codigo = null; let codigoAntigo = null; let desc = '';
    if (layoutNovo) {
      const m = antes.match(/(?:^|\s)(0[1-8]|99)\s(\d{2})\s(?=\S)/);
      if (m) { grupo = m[1]; codigo = m[2]; desc = antes.slice(m.index + m[0].length); }
    } else {
      const m = antes.match(/(?:^|\s)([1-9]\d)\s(?=[A-Z"])/);
      if (m) { codigoAntigo = m[1]; grupo = GRUPO_DO_CODIGO_ANTIGO[m[1][0]]; desc = antes.slice(m.index + m[0].length); }
    }
    if (!grupo) return;
    // o resto da discriminação vem depois dos valores (layout novo quebra a linha)
    desc = `${desc} ${p.slice(par.index + par[0].length)}`;
    const prox = pedacos[k + 1] || '';
    const parProx = prox.match(PAR_VALORES);
    const trecho = parProx ? prox.slice(0, parProx.index) : prox;
    const b = trecho.match(RE_BANCO_CONTA);
    const ehConta = (grupo === '06' && (codigo === '01' || codigoAntigo === '61' || codigoAntigo === '62')) || codigoAntigo === '61';
    if (!b && !ehConta) return;
    const pagamento = /CONTA PAGAMENTO\?\s*SIM/.test(trecho);
    const descricao = desc.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    contas.push({
      banco: b ? b[1].padStart(3, '0') : null,
      bancoNome: b ? nomeBanco(b[1]) : null,
      agencia: b ? b[3] : null,
      conta: b && b[4] ? b[4].replace(/\.$/, '') : null,
      tipo: tipoConta(grupo, codigo, codigoAntigo, pagamento),
      grupo,
      descricao,
      saldoAnterior: numBR(par[1]),
      saldoAtual: numBR(par[2]),
    });
  });
  return contas;
}

const CNPJ_OU_CPF = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b|(?<!CPF:\s?)\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
/** Raiz do CNPJ ("12.345.678") - CPF de fonte pagadora pessoa física não sai. */
const raizCnpj = (doc) => (/\//.test(doc) ? doc.slice(0, 10) : null);

/** Recorta a seção que começa no título `reTitulo` e vai até o próximo título "(VALORES EM REAIS)" de outra seção. */
function secaoDeclaracao(t, reTitulo) {
  const m = t.match(reTitulo);
  if (!m) return null;
  let sec = t.slice(m.index + m[0].length);
  const fim = sec.search(/(?:RENDIMENTOS|DECLARACAO|PAGAMENTOS|DOACOES|DEPENDENTES|ALIMENTANDOS|DIVIDAS|IMPOSTO PAGO|INFORMACOES)[A-Z\s/-]{0,90}\(VALORES EM REAIS\)|\bRESUMO\b|EVOLUCAO PATRIMONIAL/);
  if (fim >= 0) sec = sec.slice(0, fim);
  // cabeçalho/rodapé das páginas no meio da seção
  return sec.replace(/CONTROLE:\s*\d+.*?ANO-CALENDARIO\s+\d{4}/g, ' ').replace(/\(VALORES EM REAIS\)/g, ' ').replace(/\s+/g, ' ');
}

/**
 * "RENDIMENTOS TRIBUTÁVEIS RECEBIDOS DE PESSOA JURÍDICA PELO TITULAR": uma
 * linha por fonte pagadora - nome, CNPJ e os valores na ordem das colunas
 * (rendimentos, contribuição previdenciária oficial, IRRF, 13º salário, IRRF
 * sobre o 13º). O nome pode vir antes ou depois do CNPJ (o pdf.js junta as
 * colunas por altura).
 */
function rendimentosPjDaDeclaracao(t) {
  let sec = secaoDeclaracao(t, /RENDIMENTOS TRIBUTAVEIS RECEBIDOS DE PESSOA JURIDICA PELO TITULAR/);
  if (!sec) return [];
  const tot = sec.search(new RegExp(`\\bTOTAL\\s+${NUM}`));
  if (tot >= 0) sec = sec.slice(0, tot);
  sec = sec.replace(/(?:NOME DA FONTE PAGADORA|C(?:PF|NPJ)\/C(?:NPJ|PF) DA FONTE PAGADORA|RENDIMENTOS RECEBIDOS(?: DE PESSOA JURIDICA)?|CONTRIBUICAO PREVIDENCIARIA OFICIAL|IMPOSTO RETIDO NA FONTE|IRRF SOBRE (?:O )?13\S? SALARIO|13\S? SALARIO)/g, ' ');
  const docs = [...sec.matchAll(CNPJ_OU_CPF)];
  const out = [];
  let fimAnterior = 0;
  docs.forEach((d) => {
    const depois = sec.slice(d.index + d[0].length);
    const m = depois.match(new RegExp(`^\\s*(.*?)\\s*((?:${NUM}\\s+){2,4}${NUM})(?=\\s|$)`));
    if (!m) return;
    const valores = m[2].trim().split(/\s+/).map(numBR);
    const nomeDepois = /[A-Z]{2}/.test(m[1]) ? m[1] : '';
    const nomeAntes = sec.slice(fimAnterior, d.index);
    const nome = (nomeDepois || nomeAntes).replace(/\s+/g, ' ').trim().slice(0, 80);
    fimAnterior = d.index + d[0].length + m[0].length;
    out.push({
      fonte: nome || 'Fonte pagadora',
      cnpjRaiz: raizCnpj(d[0]),
      anual: valores[0] ?? 0,
      inss: valores[1] ?? 0,
      irrf: valores[2] ?? 0,
      decimoTerceiro: valores[3] ?? 0,
      irrf13: valores[4] ?? 0,
    });
  });
  return out;
}

/** Classe de um item de rendimento isento/exclusivo pelo nome (os números dos itens mudam entre anos). */
export function tipoRendimentoIr(nome) {
  const s = semAcento(nome).toUpperCase();
  if (/13\S?\s*SALARIO|DECIMO TERCEIRO/.test(s)) return 'decimoTerceiro';
  if (/PARTICIPACAO NOS LUCROS|\bPLR\b/.test(s)) return 'plr';
  if (/JUROS SOBRE (O )?CAPITAL PROPRIO/.test(s)) return 'jcp';
  if (/FGTS|RESCISAO/.test(s)) return 'fgtsRescisao';
  if (/LUCROS E DIVIDENDOS/.test(s)) return 'dividendos';
  if (/POUPANCA|LCI|LCA|CRI\b|CRA\b|LETRAS HIPOTECARIAS/.test(s)) return 'lciLcaPoupanca';
  if (/IMOBILIARIO|FII/.test(s)) return 'fii';
  if (/ACOES|OURO/.test(s) && /ALIENACAO|20\.000|VENDAS|GANHOS/.test(s)) return 'acoesIsentas';
  if (/APLICACOES FINANCEIRAS/.test(s)) return 'aplicacoes';
  if (/GANHO/.test(s) && /CAPITAL/.test(s)) return 'ganhoCapital';
  if (/BOLSA|ESTAGIO/.test(s)) return 'bolsa';
  return 'outros';
}

/** Itens numerados ("09. Lucros e dividendos recebidos 279,35") de uma seção de rendimentos. */
function itensRendimentos(t, reTitulo) {
  const sec = secaoDeclaracao(t, reTitulo);
  if (!sec) return [];
  const marcas = [...sec.matchAll(/(?:^|\s)(\d{2})\\?\.\s+(?=\S)/g)];
  const out = [];
  marcas.forEach((mk, i) => {
    const fim = i + 1 < marcas.length ? marcas[i + 1].index : sec.length;
    const pedaco = sec.slice(mk.index + mk[0].length, fim);
    const m = pedaco.match(new RegExp(`^(.+?)\\s+(-?${NUM})(?=\\s|$)`));
    if (!m) return;
    const total = pedaco.match(new RegExp(`\\bTOTAL\\s+(${NUM})`));
    const nome = m[1].replace(/\s+/g, ' ').trim().slice(0, 90);
    out.push({ codigo: mk[1], nome, tipo: tipoRendimentoIr(nome), valor: numBR(total ? total[1] : m[2]) });
  });
  return out;
}

export function lerDeclaracaoIr(linhas) {
  linhas = juntarAcentos(linhas);
  const t = plano(linhas);
  const ex = t.match(/EXERCICIO\s+(\d{4})\s+ANO-CALENDARIO\s+(\d{4})/);
  if (!ex) throw new Error('não parece uma "Cópia da Declaração" do IRPF (não achei EXERCÍCIO/ANO-CALENDÁRIO)');
  const exercicio = Number(ex[1]);
  const ano = Number(ex[2]);
  const porAno = (re) => {
    const out = {};
    for (const m of t.matchAll(re)) out[m[1]] = numBR(m[2]);
    return out;
  };
  const bens = porAno(new RegExp(`BENS E DIREITOS EM 31\\/12\\/(\\d{4})\\s+(-?${NUM})`, 'g'));
  const dividas = porAno(new RegExp(`DIVIDAS E ONUS REAIS EM 31\\/12\\/(\\d{4})\\s+(-?${NUM})`, 'g'));
  if (bens[ano] == null) throw new Error(`não achei "Bens e direitos em 31/12/${ano}" na evolução patrimonial`);
  const valor = (re) => numBR(achar(t, re));
  const grupos = bensPorGrupo(t, exercicio >= 2023);
  const somaGrupos = Object.values(grupos).reduce((s, g) => s + g.atual, 0);
  const diferenca = r2(bens[ano] - somaGrupos);
  if (Math.abs(diferenca) >= 0.01) {
    const anterior = r2((bens[ano - 1] || 0) - Object.values(grupos).reduce((s, g) => s + g.anterior, 0));
    grupos.nd = { anterior, atual: diferenca, qtd: 0 };
  }
  const nasc = t.match(/DATA DE NASCIMENTO:?\s*\d{2}\/(\d{2})\/(\d{4})/);
  return {
    exercicio,
    ano,
    bens: bens[ano],
    bensAnterior: bens[ano - 1] ?? null,
    dividas: dividas[ano] ?? 0,
    dividasAnterior: dividas[ano - 1] ?? null,
    grupos,
    conferido: Math.abs(diferenca) < 0.01,
    tributaveis: valor(new RegExp(`TOTAL DE RENDIMENTOS TRIBUTAVEIS\\s+(${NUM})`)),
    isentos: valor(new RegExp(`RENDIMENTOS ISENTOS E NAO TRIBUTAVEIS\\s+(${NUM})`)),
    exclusivos: valor(new RegExp(`RENDIMENTOS SUJEITOS A TRIBUTACAO EXCLUSIVA\\/DEFINITIVA\\s+(${NUM})`)),
    impostoDevido: valor(new RegExp(`TOTAL DO IMPOSTO DEVIDO\\s+(${NUM})`)),
    impostoPago: valor(new RegExp(`TOTAL DO IMPOSTO PAGO\\s+(${NUM})`)),
    restituir: valor(new RegExp(`IMPOSTO A RESTITUIR\\s+(${NUM})`)) || 0,
    pagar: valor(new RegExp(`SALDO IMPOSTO A PAGAR\\s+(${NUM})`)) || 0,
    nascimento: nasc ? `${nasc[2]}-${nasc[1]}` : null,
    // 02/10/2026 (aba Renda e Orçamentos): salário por fonte pagadora, contas
    // bancárias e o detalhe dos rendimentos isentos/exclusivos
    recebidosPj: valor(new RegExp(`RECEBIDOS DE PESSOA JURIDICA PELO TITULAR\\s+(${NUM})`)),
    rendimentosPj: rendimentosPjDaDeclaracao(t),
    contasBancarias: contasDaDeclaracao(t, exercicio >= 2023),
    isentosItens: itensRendimentos(t, /RENDIMENTOS ISENTOS E NAO TRIBUTAVEIS\s*\(VALORES EM REAIS\)/),
    exclusivosItens: itensRendimentos(t, /RENDIMENTOS SUJEITOS A TRIBUTACAO EXCLUSIVA\/DEFINITIVA\s*\(VALORES EM REAIS\)/),
  };
}

// ---------------------------------------------------------------------------
// FGTS - extrato por empregador
// ---------------------------------------------------------------------------

/** Tipo do lançamento do extrato do FGTS (e o código do saque, quando é saque). */
export function tipoLancamentoFgts(descricao) {
  const d = semAcento(descricao).toUpperCase();
  if (/SALDO ANTERIOR/.test(d)) return { tipo: 'saldoAnterior' };
  if (/DEPOSITO|^DEP\b/.test(d)) return { tipo: 'deposito' };
  if (/JAM/.test(d) && /CREDITO/.test(d)) return { tipo: 'jam' };
  if (/DIST(RIBUICAO)?\s+RESULTADO|DISTRIBUICAO DE LUCRO/.test(d)) return { tipo: 'lucro' };
  if (/TRANSFERENCIA RECEBIDA/.test(d)) return { tipo: 'transfEntrada' };
  if (/TRANSFERENCIA EXPEDIDA/.test(d)) return { tipo: 'transfSaida' };
  if (/SAQUE/.test(d)) {
    const cod = (d.match(/COD\.?\s*(\d{2}[A-Z]?)/) || [])[1] || '';
    let motivo = 'outros';
    if (/^60/.test(cod)) motivo = 'aniversario';
    else if (/^(9[1-9])/.test(cod)) motivo = 'moradia';
    else if (/^0[1-4]|^0[1-4][A-Z]/.test(cod)) motivo = 'rescisao';
    else if (/^(50|19)/.test(cod)) motivo = 'emergencial';
    return { tipo: 'saque', cod, motivo };
  }
  if (/JAM/.test(d)) return { tipo: 'jam' };
  return { tipo: 'outro' };
}

export const MOTIVOS_SAQUE_FGTS = {
  aniversario: 'saque-aniversário', moradia: 'moradia (apê)', rescisao: 'rescisão', emergencial: 'saque emergencial/imediato', outros: 'outros saques',
};

export function lerExtratoFgts(linhas) {
  linhas = juntarAcentos(linhas);
  const ls = (linhas || []).map((l) => semAcento(l).toUpperCase());
  const t = plano(linhas);
  let empregador = null;
  let admissao = null;
  const iEmp = ls.findIndex((l) => /^\s*EMPREGADOR\b/.test(l));
  if (iEmp >= 0) {
    const prox = ls.slice(iEmp + 1).find((l) => l.trim());
    if (prox) {
      const partes = prox.trim().split(/\s{2,}/);
      empregador = partes[0] && !/\d{2}\/\d{2}\/\d{4}/.test(partes[0]) ? partes[0].trim() : null;
      admissao = dataIso(achar(prox, /(\d{2}\/\d{2}\/\d{4})/));
    }
  }
  if (!empregador) {
    const m = t.match(/EMPREGADOR\s+DATA DE ADMISSAO\s+PIS\/PASEP\s+(.+?)\s+(\d{2}\/\d{2}\/\d{4})/);
    if (m) { empregador = m[1].trim(); admissao = dataIso(m[2]); }
  }
  if (!empregador) throw new Error('não achei o empregador - é um extrato do FGTS?');
  const bloco = t.match(/DATA E CODIGO DE AFASTAMENTO\s+CATEGORIA\s+((?:\d{2}\/\d{2}\/\d{4}\s*)+)/);
  const datasBloco = bloco ? bloco[1].match(/\d{2}\/\d{2}\/\d{4}/g) : [];
  const afastamento = datasBloco && datasBloco.length > 1 ? dataIso(datasBloco[1]) : null;
  const re = new RegExp(`(\\d{2}\\/\\d{2}\\/\\d{4})\\s+(.+?)\\s+R\\$\\s*(-)?\\s*(${NUM})\\s+R\\$\\s*(-)?\\s*(${NUM})\\s*$`);
  const movimentos = [];
  ls.forEach((l) => {
    const m = l.trim().match(re);
    if (!m) return;
    const valor = numBR(m[4]) * (m[3] ? -1 : 1);
    const total = numBR(m[6]) * (m[5] ? -1 : 1);
    const desc = m[2].replace(/\s{2,}/g, ' ').replace(/\b\d{10,}\b/g, '').trim();
    movimentos.push({ data: dataIso(m[1]), descricao: desc, valor, total, ...tipoLancamentoFgts(desc) });
  });
  if (!movimentos.length) throw new Error(`não achei lançamentos no extrato do FGTS de ${empregador}`);
  return { empregador, admissao, afastamento, movimentos, ...resumoFgts(movimentos) };
}

/**
 * Resumo de uma conta do FGTS (o que vai pra planilha): saldo no fim de cada
 * mês (o "TOTAL" do último lançamento do mês, na ordem do extrato), totais de
 * depósito, JAM, distribuição de lucro, transferências e saques por motivo.
 */
export function resumoFgts(movimentos) {
  const tot = { depositos: 0, jam: 0, lucros: 0, transfEntrada: 0, transfSaida: 0 };
  const saques = { aniversario: 0, moradia: 0, rescisao: 0, emergencial: 0, outros: 0 };
  const usosMoradia = [];
  const saquesAniversario = [];
  const porMes = new Map();
  (movimentos || []).forEach((mv) => {
    if (mv.tipo === 'deposito') tot.depositos += mv.valor;
    else if (mv.tipo === 'jam') tot.jam += mv.valor;
    else if (mv.tipo === 'lucro') tot.lucros += mv.valor;
    else if (mv.tipo === 'transfEntrada') tot.transfEntrada += mv.valor;
    else if (mv.tipo === 'transfSaida') tot.transfSaida += -mv.valor;
    else if (mv.tipo === 'saque') {
      saques[mv.motivo] = (saques[mv.motivo] || 0) - mv.valor;
      if (mv.motivo === 'moradia') {
        const u = usosMoradia.find((x) => x.data === mv.data);
        if (u) u.valor = r2(u.valor - mv.valor); else usosMoradia.push({ data: mv.data, valor: r2(-mv.valor) });
      }
      if (mv.motivo === 'aniversario') {
        const u = saquesAniversario.find((x) => x.data === mv.data);
        if (u) u.valor = r2(u.valor - mv.valor); else saquesAniversario.push({ data: mv.data, valor: r2(-mv.valor) });
      }
    }
    if (mv.data && Number.isFinite(mv.total)) porMes.set(mv.data.slice(0, 7), mv.total);
  });
  Object.keys(tot).forEach((k) => { tot[k] = r2(tot[k]); });
  Object.keys(saques).forEach((k) => { saques[k] = r2(saques[k]); });
  const mensal = [...porMes.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([mes, saldo]) => [mes, r2(saldo)]);
  const ult = (movimentos || [])[movimentos.length - 1];
  const datas = (movimentos || []).map((m) => m.data).filter(Boolean).sort();
  return {
    saldo: ult ? r2(ult.total) : 0,
    dataSaldo: datas[datas.length - 1] || null,
    mensal,
    ...tot,
    saques,
    usosMoradia: usosMoradia.sort((a, b) => (a.data < b.data ? -1 : 1)),
    saquesAniversario: saquesAniversario.sort((a, b) => (a.data < b.data ? -1 : 1)),
  };
}

/** O que da conta do FGTS vai pra planilha (sem os lançamentos um a um). */
export function contaFgtsParaSalvar(c) {
  return {
    empregador: String(c.empregador || '').slice(0, 80), admissao: c.admissao || null, afastamento: c.afastamento || null,
    saldo: c.saldo, dataSaldo: c.dataSaldo, mensal: c.mensal || [], depositos: c.depositos, jam: c.jam, lucros: c.lucros,
    transfEntrada: c.transfEntrada, transfSaida: c.transfSaida, saques: c.saques, usosMoradia: c.usosMoradia || [], saquesAniversario: c.saquesAniversario || [],
  };
}

// ---------------------------------------------------------------------------
// Carteira de Trabalho Digital - contratos
// ---------------------------------------------------------------------------

export function lerCtps(linhas) {
  linhas = juntarAcentos(linhas);
  const ls = (linhas || []).map((l) => semAcento(l).toUpperCase().replace(/\s+/g, ' ').trim()).filter(Boolean);
  const tudo = ls.join(' ');
  if (!/CARTEIRA DE TRABALHO DIGITAL/.test(tudo)) throw new Error('não parece a Carteira de Trabalho Digital (contratos)');
  const nasc = tudo.match(/DATA DE NASCIMENTO.*?\d{2}\/(\d{2})\/(\d{4})/);
  const contratos = [];
  let atual = null;
  let texto = [];
  const fechar = () => { if (atual) { atual.texto = texto.join(' '); contratos.push(atual); } texto = []; };
  ls.forEach((l, i) => {
    const m = l.match(/^(\d{2}\/\d{2}\/\d{4}) - (ABERTO|\d{2}\/\d{2}\/\d{4})$/);
    if (m) {
      fechar();
      atual = { inicio: dataIso(m[1]), fim: m[2] === 'ABERTO' ? null : dataIso(m[2]), empregador: null };
      return;
    }
    if (atual && !atual.empregador && l === 'EMPREGADOR' && ls[i + 1]) atual.empregador = ls[i + 1];
    if (atual) texto.push(l);
  });
  fechar();
  if (!contratos.length) throw new Error('não achei nenhum contrato de trabalho no PDF');
  const limparPaginas = (s) => s.replace(/PAGINA \d+ DOCUMENTO ASSINADO.*?DATA DE EMISSAO: \d{2}\/\d{2}\/\d{4}/g, ' ')
    .replace(/PAGINA \d+ DOCUMENTO ASSINADO.*$/g, ' ').replace(/\s+/g, ' ');
  return {
    nascimento: nasc ? `${nasc[2]}-${nasc[1]}` : null,
    contratos: contratos.map((c) => {
      const s = limparPaginas(c.texto);
      const salarios = [];
      for (const m of s.matchAll(new RegExp(`(\\d{2}\\/\\d{2}\\/\\d{4}) - SALARIO DEFINIDO PARA R\\$ ?(${NUM}) POR MES(?: ?, ?COM EFEITO A PARTIR DE (\\d{2}\\/\\d{2}\\/\\d{4}))?`, 'g'))) {
        salarios.push({ data: dataIso(m[3] || m[1]), valor: numBR(m[2]) });
      }
      const contratual = numBR(achar(s, new RegExp(`SALARIO CONTRATUAL R\\$ ?(${NUM})`)));
      if (!salarios.length && contratual) salarios.push({ data: c.inicio, valor: contratual });
      const unicos = [];
      salarios.sort((a, b) => (a.data < b.data ? -1 : 1)).forEach((x) => {
        const u = unicos[unicos.length - 1];
        if (u && u.data === x.data) u.valor = x.valor; else unicos.push(x);
      });
      const cargos = [];
      for (const m of s.matchAll(/(\d{2}\/\d{2}\/\d{4}) A (\(ATUAL\)|\d{2}\/\d{2}\/\d{4}) - CARGO EXERCIDO DE (.+?)(?= \d{2}\/\d{2}\/\d{4} (?:-|A) | OBSERVACOES| ANOTACOES|$)/g)) {
        cargos.push({ inicio: dataIso(m[1]), fim: m[2] === '(ATUAL)' ? null : dataIso(m[2]), cargo: m[3].trim().slice(0, 60) });
      }
      cargos.sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
      return {
        empregador: String(c.empregador || '').slice(0, 80), inicio: c.inicio, fim: c.fim,
        cargos, salarios: unicos, salarioContratual: contratual,
      };
    }).sort((a, b) => (a.inicio < b.inicio ? -1 : 1)),
  };
}

// ---------------------------------------------------------------------------
// Caixa - "Demonstrativo de Evolução - Habitação"
// ---------------------------------------------------------------------------

export function lerExtratoCaixaHabitacao(linhas) {
  linhas = juntarAcentos(linhas);
  const t = plano(linhas);
  if (!/DEMONSTRATIVO DE EVOLUCAO/.test(t)) throw new Error('não parece o "Demonstrativo de Evolução - Habitação" da Caixa');
  const dataSaldo = dataIso(achar(t, /SALDO DEVEDOR TEORICO EM\s+(\d{2}\/\d{2}\/\d{2,4})/));
  const iSaldo = t.search(/SALDO DEVEDOR TEORICO EM/);
  const saldo = numBR(achar(t.slice(Math.max(0, iSaldo)), new RegExp(`\\bVALOR\\s+R\\$\\s*(${NUM})`)));
  if (saldo == null) throw new Error('não achei o saldo devedor no demonstrativo');
  const taxa = achar(t, /TAXA DE JUROS NOMINAL COM RELACIONAMENTO\s+([\d,]+)\s*%/) || achar(t, /TAXA DE JUROS CONTRATUAL NOMINAL\s+([\d,]+)\s*%/);
  const parcelas = [];
  const reLinha = /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+\d+\s+\d{3}\s+(.*)$/;
  (linhas || []).forEach((l) => {
    const m = String(l).trim().match(reLinha);
    if (!m) return;
    const vals = (m[3].match(new RegExp(`-?${NUM}`, 'g')) || []).map(numBR);
    if (vals.length < 6) return;
    parcelas.push({
      vencimento: dataIso(m[1]), pagamento: dataIso(m[2]), amortizacaoJuros: vals[0], seguro: vals[1], taxa: vals[2],
      devido: vals[vals.length - 3], pago: vals[vals.length - 2],
    });
  });
  parcelas.sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1));
  const ult = parcelas[parcelas.length - 1];
  const prox = t.match(new RegExp(`ENCARGOS GERADOS E EM ABERTO.*?(\\d{2}\\/\\d{2}\\/\\d{4})\\s+\\d+\\s+[\\d.]+\\s+(${NUM}).*?TOTAL A PAGAR R\\$\\s*(${NUM})`));
  const sistema = achar(t, /SISTEMA DE AMORTIZACAO\s+(SAC|PRICE|SACRE)/) || 'SAC';
  return {
    banco: 'Caixa',
    sistema,
    saldo,
    dataSaldo,
    jurosMes: numBR(achar(t, new RegExp(`JUROS\\/CORRECAO DO MES\\s+R\\$\\s*(${NUM})`))),
    amortizacao: numBR(achar(t, new RegExp(`AMORTIZACAO DO MES\\s+R\\$\\s*(${NUM})`))),
    indexador: achar(t, /INDEXADOR DO SALDO\s+([A-Z]+)/),
    prazoTotal: Number(achar(t, /PRAZO DO FINANCIAMENTO\s+(\d+)\s+MESES/)) || null,
    prazoRestante: Number(achar(t, /PRAZO REMANESCENTE\s+(\d+)\s+MESES/)) || null,
    taxaAnual: taxa ? numBR(taxa.includes(',') ? taxa : `${taxa},00`) / 100 : null,
    seguroTaxas: ult ? r2(ult.seguro + ult.taxa) : null,
    parcela: ult ? ult.devido : null,
    proximaParcela: prox ? { vencimento: dataIso(prox[1]), valor: numBR(prox[3]) } : null,
    parcelas,
  };
}

// ---------------------------------------------------------------------------
// FIES - comprovante do SISBB (Banco do Brasil)
// ---------------------------------------------------------------------------

export function lerExtratoFies(linhas) {
  linhas = juntarAcentos(linhas);
  const t = plano(linhas);
  const saldo = numBR(achar(t, new RegExp(`VALOR DO SALDO DEVEDOR\\s+(${NUM})`)));
  if (saldo == null) throw new Error('não achei o "Valor do saldo devedor" no comprovante');
  const parcelas = [];
  const re = new RegExp(`^\\d+\\s+(\\d{2}\\.\\d{2}\\.\\d{4})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})\\s+(${NUM})$`);
  (linhas || []).forEach((l) => {
    const m = String(l).trim().replace(/\s+/g, ' ').match(re);
    if (m) parcelas.push({ data: dataIso(m[1]), valor: numBR(m[2]), capital: numBR(m[3]), juros: numBR(m[4]), encargos: numBR(m[5]) });
  });
  parcelas.sort((a, b) => (a.data < b.data ? -1 : 1));
  // Price: a amortização (capital) cresce na taxa do contrato a cada parcela -
  // capital(k)/capital(k-1) − 1 = taxa do mês. (A coluna "Juros" do SISBB não
  // bate com taxa × saldo nos contratos antigos do FIES, então não serve.)
  const taxas = [];
  for (let k = 1; k < parcelas.length; k += 1) {
    const a = parcelas[k - 1].capital; const b = parcelas[k].capital;
    if (a > 0 && b > a) taxas.push(b / a - 1);
  }
  if (!taxas.length) {
    let depois = saldo;
    for (let k = parcelas.length - 1; k >= 0; k -= 1) {
      const antes = depois + parcelas[k].capital;
      if (antes > 0 && parcelas[k].juros > 0) taxas.push(parcelas[k].juros / antes);
      depois = antes;
    }
  }
  taxas.sort((a, b) => a - b);
  const taxaMensal = taxas.length ? taxas[Math.floor(taxas.length / 2)] : null;
  const ult = parcelas[parcelas.length - 1];
  const fim = dataIso(achar(t, /FIM DA FASE\s+(\d{2}\.\d{2}\.\d{4})/));
  const inicioFase = dataIso(achar(t, /INICIO DA FASE\s+(\d{2}\.\d{2}\.\d{4})/));
  const contratacao = dataIso(achar(t, /DATA DA CONTRATACAO\s+(\d{2}\.\d{2}\.\d{4})/));
  return {
    banco: 'Banco do Brasil',
    sistema: 'Price',
    saldo,
    dataSaldo: ult ? ult.data : null,
    parcela: ult ? ult.valor : null,
    taxaMensal: taxaMensal == null ? null : Math.round(taxaMensal * 1e7) / 1e7,
    restantes: Number(achar(t, /LANCAMENTOS EM SER\s+(\d+)/)) || null,
    fim: fim ? fim.slice(0, 7) : null,
    inicioAmortizacao: inicioFase ? inicioFase.slice(0, 7) : null,
    contratacao: contratacao ? contratacao.slice(0, 7) : null,
    valorContratado: numBR(achar(t, new RegExp(`VALOR DO CREDITO GLOBAL\\s+(${NUM})`))),
    parcelas,
  };
}

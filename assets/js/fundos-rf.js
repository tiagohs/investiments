/**
 * fundos-rf.js - 07/10/2026 (Tiago: fundo DI "Trend DI FC RF Simples RL" guardado pra comprar a chácara com amigos).
 *
 * Fundo de investimento dentro da Renda Fixa: (1) reconhecer o título pelo nome ou CNPJ e achar o logo - SÍNCRONO, porque as listas montam o HTML
 * na hora (por isso o índice mínimo FUNDOS_INDEX mora aqui e o resto dos dados públicos em assets/data/fundos.json, que só o detalhe do título busca;
 * um teste confere que os apelidos/CNPJ/logo dos dois batem); (2) a tabela de rentabilidade mensal contra o CDI; (3) a cota: "valor pela última cota
 * conhecida" x o valor estimado do site (100% do CDI desde cada compra - aproximação: sem taxa de administração e sem come-cotas).
 * Só dado PÚBLICO do fundo aqui; posição/valores do investidor nunca entram em arquivo.
 */

import { MESES_CURTOS } from './format.js';

/** Índice mínimo (logo + apelidos + CNPJ). A mesma chave do assets/data/fundos.json. */
export const FUNDOS_INDEX = [
  {
    chave: 'trend-di-fic-rf-simples-rl',
    cnpj: '45.278.833/0001-57',
    logo: 'assets/imgs/fundos/TrendDIFCRFSimplesRL.png',
    apelidos: ['Trend DI FIC RF Simples RL', 'Trend DI FC RF Simples RL', 'Trend DI FIC RF Simples', 'Trend DI FC RF Simples', 'Trend DI Simples RL', 'Trend DI'],
  },
];

/** Sem acento, minúsculas, só letras/números separados por 1 espaço ("Trend DI FC-RF" -> "trend di fc rf"). */
export function normalizarNomeFundo(texto) {
  return String(texto == null ? '' : texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const soDigitos = (t) => String(t || '').replace(/\D/g, '');

/**
 * O nome é de um FUNDO de investimento (FIC, FC, FI, FIRF, "RF Simples", "Fundo...")? Tesouro, CDB e LCI/LCA nunca. Espelho de
 * apps-script/CarteiraRendaFixaSync.gs!ehFundoRf_.
 */
export function ehFundoRf(nome) {
  const s = String(nome == null ? '' : nome).replace(/\s+/g, ' ').trim();
  if (!s || /^(Tesouro|LCI|LCA|CDB)\b/i.test(s)) return false;
  return /(^|[^A-Za-z0-9])(FIC|FC|FI|FIRF|FIF|FIM|FIA|FUNDO|FUNDOS)([^A-Za-z0-9]|$)|\bRF\s+(SIMPLES|REFERENCIADO|CURTO|LONGO|CR|LP)\b|\bREFERENCIADO\s+DI\b/i.test(s);
}

/**
 * Casa um texto (ou lista: nome, apelido, tipo...) com um fundo da lista, por apelido (palavras inteiras, sem acento/maiúscula) ou pelo CNPJ.
 * `fundos` = FUNDOS_INDEX ou o `fundos` do fundos.json (mesmos campos chave/apelidos/cnpj). null se nenhum.
 */
export function casarFundo(textos, fundos = FUNDOS_INDEX) {
  const lista = (Array.isArray(textos) ? textos : [textos]).map((t) => normalizarNomeFundo(t)).filter(Boolean);
  const digitos = (Array.isArray(textos) ? textos : [textos]).map(soDigitos);
  if (!lista.length) return null;
  let melhor = null, melhorTam = 0;
  for (const f of fundos || []) {
    if (f.cnpj && digitos.some((d) => d.length >= 14 && d.includes(soDigitos(f.cnpj)))) return f;
    for (const ap of f.apelidos || []) {
      const a = normalizarNomeFundo(ap);
      if (!a) continue;
      // palavras inteiras: "trend di" casa "trend di fc rf simples rl", nunca "trend dinamico"
      if (lista.some((t) => ` ${t} `.includes(` ${a} `)) && a.length > melhorTam) { melhor = f; melhorTam = a.length; }
    }
  }
  return melhor;
}

/** Os textos do título onde procurar o fundo (varia por tela: carteira, aportes, lançamentos...). */
function textosDoTitulo(a) {
  const x = a || {};
  return [x.nomePersonalizado, x.nome, x.titulo, x.ativo, x.ticker, x.produto, x.tipoInvestimento, x.descricao].filter((t) => typeof t === 'string' && t);
}

/** Caminho (relativo à raiz do site) do logo do fundo deste título, ou null. Aceita o item de qualquer lista (carteira, aporte, lançamento). */
export function logoDoFundo(a) {
  const f = casarFundo(textosDoTitulo(a));
  return f ? f.logo : null;
}

// ---------------------------------------------------------------------------
// Rentabilidade mensal x CDI
// ---------------------------------------------------------------------------

const MESES = MESES_CURTOS;
export const MESES_ABREV = MESES_CURTOS;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arred = (v, c = 2) => Math.round(v * 10 ** c) / 10 ** c;

/** Composição de percentuais: [1,2] -> 3,02 (%). null se faltar algum. */
export function comporPercentuais(lista) {
  if (!lista.length || lista.some((v) => num(v) == null)) return null;
  return arred((lista.reduce((f, v) => f * (1 + v / 100), 1) - 1) * 100, 2);
}

/**
 * Linhas da tabela "Rentabilidade mensal": uma por ano (mais novo primeiro) com os 12 meses, o ano e a acumulada desde o início.
 * `fundo` = item do fundos.json; `cdiMensal` = { 'aaaa-mm': % do CDI no mês } (Apps Script, só meses completos). "% do CDI" do ano =
 * rentabilidade do ano / CDI do ano (só se todos os meses do ano têm CDI; ano de início parcial fica sem). A acumulada vem da lâmina
 * quando existe e, senão, é encadeada pelos anos (marcada como calculada).
 */
export function tabelaRentabilidadeFundo(fundo, cdiMensal = {}) {
  if (!fundo) return [];
  const mensal = fundo.rentabilidadeMensal || {};
  const anual = fundo.rentabilidadeAno || {};
  const acum = fundo.rentabilidadeAcumulada || {};
  const anos = [...new Set([...Object.keys(mensal), ...Object.keys(anual)])].map(Number).sort((a, b) => a - b);
  const inicioAno = fundo.inicio ? Number(String(fundo.inicio).slice(0, 4)) : null;
  let fator = 1;
  const linhas = anos.map((ano) => {
    const valores = mensal[ano] || [];
    const meses = MESES.map((rot, i) => {
      const pct = num(valores[i]);
      const cdi = num(cdiMensal[`${ano}-${String(i + 1).padStart(2, '0')}`]);
      return { mes: i + 1, rotulo: rot, pct, cdi, pctCdi: pct != null && cdi ? arred((pct / cdi) * 100, 0) : null };
    });
    const pctAno = num(anual[ano]) != null ? anual[ano] : comporPercentuais(valores.filter((v) => num(v) != null));
    fator *= 1 + (pctAno || 0) / 100;
    const acumuladaCalc = arred((fator - 1) * 100, 2);
    const cdis = Array.from({ length: valores.length || 12 }, (_, i) => cdiMensal[`${ano}-${String(i + 1).padStart(2, '0')}`]);
    const cdiAno = ano === inicioAno ? null : comporPercentuais(cdis);
    return {
      ano, meses, pctAno, cdiAno,
      pctCdiAno: pctAno != null && cdiAno ? arred((pctAno / cdiAno) * 100, 0) : null,
      acumulada: num(acum[ano]) != null ? acum[ano] : acumuladaCalc, acumuladaCalculada: num(acum[ano]) == null,
      parcial: valores.length > 0 && valores.length < 12, mesesComDado: valores.length,
    };
  });
  return linhas.sort((a, b) => b.ano - a.ano);
}

// ---------------------------------------------------------------------------
// Cota
// ---------------------------------------------------------------------------

/** Cotas que o Tiago tem: aplicações (crédito) menos resgates (débito) das movimentações do título. */
export function cotasDasMovimentacoes(transacoes) {
  let total = 0;
  for (const t of transacoes || []) {
    const q = Math.abs(Number(t.quantidade) || 0);
    if (!q) continue;
    const es = String(t.entradaSaida || '');
    const tipo = String(t.tipo || '');
    const saida = /^d[eé]bit/i.test(es) || (!/^cr[eé]dit/i.test(es) && /resgat|venda|saque/i.test(tipo));
    total += saida ? -q : q;
  }
  return Math.round(total * 1e8) / 1e8;
}

/**
 * A cota mais recente que se conhece: a que o Tiago informou (cota + data, guardada no Apps Script) ou a do fundos.json - vale a de data mais nova
 * (empate: a informada). { cota, data, origem: 'informada' | 'publica' } ou null.
 */
export function cotaMaisRecente(fundoInfo, cotaInformada) {
  const pub = fundoInfo && fundoInfo.ultimaCota && num(fundoInfo.ultimaCota.valor) ? { cota: fundoInfo.ultimaCota.valor, data: fundoInfo.ultimaCota.data, origem: 'publica' } : null;
  const inf = cotaInformada && num(cotaInformada.cota) ? { cota: cotaInformada.cota, data: cotaInformada.data, origem: 'informada' } : null;
  if (pub && inf) return String(inf.data) >= String(pub.data) ? inf : pub;
  return inf || pub;
}

/**
 * Cota real x estimativa. `valorEstimado`/`dataEstimado` = ponto de hoje da série estimada (100% do CDI desde cada compra), `valorTitulo` = o
 * valor que o site usa pro título (coluna L). Devolve null sem cotas ou sem cota.
 */
export function compararCota({ cotas, cota, valorEstimado = null, dataEstimado = null, valorTitulo = null }) {
  if (!(cotas > 0) || !cota || !(num(cota.cota) > 0)) return null;
  const valorPelaCota = arred(cotas * cota.cota, 2);
  const base = num(valorEstimado) != null ? valorEstimado : num(valorTitulo);
  const diferenca = base != null ? arred(valorPelaCota - base, 2) : null;
  return {
    cotas, cota: cota.cota, dataCota: cota.data, origem: cota.origem,
    valorPelaCota, valorEstimado: num(valorEstimado), dataEstimado, valorTitulo: num(valorTitulo),
    diferenca, diferencaPct: diferenca != null && base ? diferenca / base : null,
  };
}

/** Junta o que a tela do fundo precisa (null se o título não é fundo). `fundos` = o fundos.json; `resposta` = action=ativo de um título de RF. */
export function montarFundoRf(resposta, fundos = null) {
  if (!resposta || resposta.tipo !== 'rf') return null;
  const a = resposta.ativo || {};
  const nome = a.nomePersonalizado || a.nome || resposta.ticker || '';
  const info = casarFundo([nome, resposta.ticker, a.tipoInvestimento].filter(Boolean), (fundos && fundos.fundos) || FUNDOS_INDEX);
  const marcado = !!resposta.fundo; // o Apps Script reconhece o fundo pelo nome (ehFundoRf_)
  if (!info && !marcado) return null;
  const detalhes = (fundos && fundos.fundos || []).find((f) => info && f.chave === info.chave) || null;
  const serie = resposta.serie || [];
  const ultimo = serie.length ? serie[serie.length - 1] : null;
  const cotas = cotasDasMovimentacoes(resposta.transacoes);
  const informada = (resposta.fundo && resposta.fundo.cotaInformada) || null;
  const cota = cotaMaisRecente(detalhes, informada);
  return {
    nome, info: detalhes, chave: info ? info.chave : null, hoje: resposta.hoje || null, // 08/10/2026: "hoje" do servidor (limite da data da cota)
    cdiMensal: (resposta.fundo && resposta.fundo.cdiMensal) || {},
    cotaInformada: informada, cota, cotas,
    comparacao: compararCota({ cotas, cota, valorEstimado: ultimo ? ultimo.valor : null, dataEstimado: ultimo ? ultimo.data : null, valorTitulo: num(a.totalAtualizado) }),
  };
}

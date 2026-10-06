/**
 * gastos-calc.js - 02/10/2026: contas da seção "Gastos" da Organização
 * Financeira (organizacao-gastos.js). Sem DOM.
 *
 * Tiago: "novos gadgets/gráficos de quanto eu gastei e gasto em média".
 *
 *  - categorizar: regras por descrição (mercado, restaurantes/delivery,
 *    transporte/app, combustível, saúde, assinaturas, compras online,
 *    educação, moradia/contas, viagem, lazer, tarifas, transferências,
 *    investimentos, outros) + as regras do Tiago (aux_gastos-regras), que
 *    ganham das automáticas e valem pros meses seguintes.
 *  - ehGasto: pagamento de fatura, transferência pra conta própria,
 *    aplicação/resgate e "não é gasto" ficam de fora - o pagamento da fatura
 *    que sai da conta não conta de novo (a fatura já conta cada compra).
 *  - totais por mês/categoria/origem, média, recorrentes (assinaturas),
 *    parcelamentos em aberto, cobertura dos documentos, essencial x real.
 */
import { semAcento, mesesEntre } from './gastos-import.js';
import { rotuloPeriodo } from '../periodo-personalizado.js'; // 05/10/2026 (A-67): períodos canônicos

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;
const p2 = (n) => String(n).padStart(2, '0');

export function somarMeses(mes, k) {
  const [a, m] = String(mes).split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`;
}
export function mesDe(hoje) {
  if (hoje instanceof Date) return `${hoje.getFullYear()}-${p2(hoje.getMonth() + 1)}`;
  return String(hoje || '').slice(0, 7);
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

/** id, nome e se entra como gasto. A ordem é a da tela (e do seletor). */
export const CATEGORIAS_GASTO = [
  { id: 'mercado', nome: 'Mercado' },
  { id: 'restaurantes', nome: 'Restaurantes e delivery' },
  { id: 'transporte', nome: 'Transporte e apps' },
  { id: 'combustivel', nome: 'Combustível' },
  { id: 'saude', nome: 'Farmácia e saúde' },
  { id: 'assinaturas', nome: 'Assinaturas e streaming' },
  { id: 'compras', nome: 'Compras' },
  { id: 'educacao', nome: 'Educação' },
  { id: 'moradia', nome: 'Moradia e contas' },
  { id: 'viagem', nome: 'Viagem' },
  { id: 'lazer', nome: 'Lazer' },
  { id: 'tarifas', nome: 'Tarifas, juros e IOF' },
  { id: 'transferencias', nome: 'Transferências (Pix a pessoas)' },
  { id: 'outros', nome: 'Outros' },
  { id: 'investimentos', nome: 'Investimentos', naoGasto: true },
  { id: 'ignorar', nome: 'Não é gasto', naoGasto: true },
];
export const NOME_CATEGORIA = Object.fromEntries(CATEGORIAS_GASTO.map((c) => [c.id, c.nome]));
const NAO_GASTO_CATEGORIAS = new Set(CATEGORIAS_GASTO.filter((c) => c.naoGasto).map((c) => c.id));
/** Tipos de lançamento que nunca são gasto. */
export const TIPOS_NAO_GASTO = new Set(['pagamento_fatura', 'transferencia_propria', 'investimento', 'resgate', 'receita']);

export const NOME_FONTE = {
  ourocard: 'OuroCard', 'nubank-cartao': 'Nubank (cartão)', 'nubank-conta': 'Nubank (conta)', bradesco: 'Bradesco',
  'ofx-cartao': 'Cartão (OFX)', 'ofx-conta': 'Conta (OFX)',
};

// Ordem importa: "AMAZON PRIME" é assinatura antes de ser compra; "UBER EATS"
// é delivery antes de ser transporte; "SMILES CLUB" é assinatura antes de viagem.
const REGRAS = [
  ['tarifas', /\bIOF\b|ANUIDADE|TARIFA|\bJUROS\b|\bMULTA\b|ENCARGO|CESTA B\.?\s?EXPRESS|\bMORA\b|SEGURO CARTAO/],
  ['restaurantes', /IFOOD|RAPPI|UBER\s?\*?\s?EATS|ZE DELIVERY|AIQFOME|RESTAUR|LANCHONETE|LANCHES?\b|BURGER|MC ?DONALD|MCDONALDS|\bBK\b|OUTBACK|PIZZ|SUSHI|TEMAKI|\bCAFE\b|CAFETERIA|COFFEE|STARBUCKS|PADARIA|BAKERY|PANIFICADORA|GELAT|SORVET|CHOPP|CHURRASC|HABIB|SPOLETO|GIRAFFAS|SUBWAY|\bKFC\b|POPEYES|COCO BAMBU|MADERO|DOCERIA|CONFEITAR|\bACAI\b|BOTECO|\bBAR\b|BISTRO|CANTINA|HAMBURG|\bPOKE\b|DELIVERY/],
  ['assinaturas', /NETFLIX|SPOTIFY|DISNEY|\bHBO\b|MAX\.COM|AMAZON ?PRIME|PRIME ?VIDEO|PRIMEVIDEO|APPLE\.COM|APPLE ?BILL|ITUNES|ICLOUD|GOOGLE ?(ONE|STORAGE|YOUTUBE)|YOUTUBE|DEEZER|GLOBOPLAY|PARAMOUNT|CRUNCHYROLL|TELECINE|OPENAI|CHATGPT|ANTHROPIC|CLAUDE\.AI|ADOBE|CANVA|NOTION|DROPBOX|AUDIBLE|KINDLE ?UNL|SMILES ?CLUB|CLUBE SMILES|ASSINATURA|MICROSOFT ?365|OFFICE ?365|SUNO|STATUS ?INVEST|TELEGRAM ?PREMIUM/],
  ['mercado', /SUPERMERC|MERCADO(?! ?LIVRE| ?PAGO)|MERCEARIA|ATACAD|ASSAI|CARREFOUR|PAO DE ACUCAR|\bEXTRA\b|HORTIFRUT|SACOLAO|ACOUGUE|OXXO|MINUTO PA|ST MARCHE|SAMS CLUB|COSTCO|MAKRO|SONDA|TENDA ATAC|QUITANDA|EMPORIO|HIPERMERC|DIA BRASIL|NATURAL DA TERRA|FEIRA/],
  ['transporte', /UBER(?!\s?\*?\s?EATS)|\b99\s?(APP|POP|TAXI)|99APP|CABIFY|TAXI|\bMETRO\b|CPTM|SPTRANS|BILHETE UNICO|ESTACION|ESTAPAR|PARKING|PEDAGIO|SEM PARAR|CONECTCAR|VELOE|AUTOPASS|BUSER|ONIBUS|RODOVIARI|\bLIME\b|PATINETE/],
  ['combustivel', /\bPOSTO\b|AUTO ?POSTO|\bSHELL\b|IPIRANGA|PETROBRAS|BR MANIA|COMBUST|RAIZEN|\bALE\b/],
  ['saude', /DROGA|FARMA|\bRAIA\b|PACHECO|PAGUE MENOS|PANVEL|CLINICA|ODONTO|HOSPITAL|LABORAT|MEDIC|DENTIST|PSICOL|FISIOTER|UNIMED|\bAMIL\b|SULAMERICA|HAPVIDA|NOTREDAME|\bOTICA|\bEXAME|FLEURY|\bDASA\b|LAVOISIER|DELBONI|SMART ?FIT|ACADEMIA|BLUEFIT|BODYTECH|GYMPASS|WELLHUB|TOTALPASS|NUTRI/],
  ['viagem', /HOTEL|POUSADA|AIRBNB|BOOKING|DECOLAR|LATAM|\bGOL\b|GOL LINHAS|AZUL LINHAS|\bAZUL\b|SMILES|LIVELO|123 ?MILHAS|MAXMILHAS|HURB|\bCVC\b|LOCALIZA|MOVIDA|UNIDAS|RENTCARS|AEROPORTO|DUTY ?FREE|EXPEDIA|HOSTEL|RESORT/],
  ['lazer', /CINEMA|CINEMARK|KINOPLEX|\bUCI\b|INGRESSO|SYMPLA|EVENTIM|TICKET|TEATRO|\bSHOW\b|PARQUE|MUSEU|PLAYSTATION|SONYPLAYSTAT|\bPSN\b|XBOX|NINTENDO|STEAM|\bGAME|BOLICHE|BALADA|KARAOKE/],
  ['educacao', /ESCOLA|COLEGIO|FACULDADE|UNIVERSID|\bCURSO|UDEMY|ALURA|COURSERA|ROCKETSEAT|DUOLINGO|LIVRARIA|SARAIVA|ESTANTE VIRTUAL|HOTMART|EDUZZ|KIWIFY|MENSALIDADE|IDIOMA|INGLES/],
  ['moradia', /ALUGUEL|CONDOMIN|IMOBILIAR|\bIPTU\b|\bENEL\b|SABESP|ELETROPAULO|\bCPFL\b|\bLIGHT\b|CEMIG|COPEL|COMGAS|NATURGY|ULTRAGAZ|LIQUIGAS|TELEFONICA|\bVIVO\b|\bCLARO\b|\bTIM\b|\bOI\b|NET SERV|\bSKY\b|INTERNET|FIBRA|CONTA DE (?:LUZ|AGUA|GAS|TELEFONE)|DIARISTA|FAXIN|ENERGIA|SANEAMENTO/],
  ['compras', /AMAZON|MERCADO ?LIVRE|MERCADOLIVRE|MAGAZINE|MAGALU|SHOPEE|SHEIN|ALIEXPRESS|AMERICANAS|SUBMARINO|KABUM|CASAS BAHIA|PONTO FRIO|NETSHOES|CENTAURO|RENNER|RIACHUELO|\bC&A\b|\bZARA\b|HERING|DAFITI|LEROY|TOK ?STOK|\bETNA\b|IKEA|DECATHLON|FAST SHOP|SAMSUNG|APPLE STORE|VIVARA|PANDORA|BOTICARIO|NATURA|SEPHORA|PAYPAL|TEMU|MOBLY|CAMICADO|\bEBN\b|LOJAS?\b|SHOPPING/],
  ['investimentos', /CORRETORA|XP INVEST|\bRICO\b|\bCLEAR\b|NUINVEST|\bBTG\b|TESOURO DIRETO|\bB3\b|AVENUE|INTER DTVM|BINANCE|MERCADO BITCOIN/],
];

/**
 * Chave de uma descrição pra agrupar e pras regras: sem acento, maiúscula,
 * sem números, parcela, "*" e pontuação ("Amazon - Parcela 1/2" -> "AMAZON").
 */
export function chaveDescricao(desc) {
  return semAcento(desc).toUpperCase()
    .replace(/[-–]?\s*PARC(?:ELA)?\.?\s*\d{1,2}\s*(?:\/|DE)\s*\d{1,2}/g, ' ')
    .replace(/\s\d{2}\/\d{2}\s*$/, ' ')
    .replace(/[^A-Z&·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Regras do Tiago: [{ padrao, categoria }] - "contém o padrão" (maiores primeiro). */
export function prepararRegras(regras) {
  return (regras || [])
    .map((r) => ({ padrao: chaveDescricao(r.padrao), categoria: r.categoria }))
    .filter((r) => r.padrao && NOME_CATEGORIA[r.categoria])
    .sort((a, b) => b.padrao.length - a.padrao.length);
}

/** Categoria de um lançamento: regra do Tiago > tipo > regras automáticas. */
export function categorizar(l, regrasPreparadas = []) {
  const chave = chaveDescricao(l.descricao);
  const regra = regrasPreparadas.find((r) => chave.includes(r.padrao));
  if (regra) return regra.categoria;
  if (l.tipo === 'investimento' || l.tipo === 'resgate') return 'investimentos';
  if (TIPOS_NAO_GASTO.has(l.tipo)) return 'ignorar';
  if (['iof', 'anuidade', 'encargo', 'tarifa'].includes(l.tipo)) return 'tarifas';
  const s = semAcento(l.descricao).toUpperCase();
  for (const [cat, re] of REGRAS) if (re.test(s)) return cat;
  if (l.tipo === 'transferencia') return 'transferencias';
  if (l.tipo === 'saque') return 'outros';
  return 'outros';
}

/** Conta como gasto? (pagamento de fatura, conta própria, investimentos e "não é gasto" não). */
export function ehGasto(l) {
  return !TIPOS_NAO_GASTO.has(l.tipo) && !NAO_GASTO_CATEGORIAS.has(l.categoria);
}

/** Lançamentos da planilha (+ regras) -> lançamentos com categoria e gasto. */
export function prepararLancamentos(lancamentos, regras) {
  const rp = prepararRegras(regras);
  return (lancamentos || []).map((l) => {
    const categoria = categorizar(l, rp);
    const x = { ...l, categoria, chave: chaveDescricao(l.descricao) };
    x.gasto = ehGasto(x);
    return x;
  });
}

// ---------------------------------------------------------------------------
// Deduplicação (extratos que se sobrepõem, a mesma fatura importada 2x)
// ---------------------------------------------------------------------------

/**
 * Chave de cada lançamento de um arquivo: fonte|data|valor|descrição|n (n
 * conta repetições iguais NO MESMO arquivo - 2 Pix iguais no mesmo dia são 2).
 * Dois arquivos que cobrem o mesmo dia geram a mesma chave pro mesmo lançamento.
 */
export function chavesDedup(fonte, lancamentos) {
  const vistos = {};
  return (lancamentos || []).map((l) => {
    const base = `${fonte}|${l.data}|${Number(l.valor).toFixed(2)}|${chaveDescricao(l.descricao)}`;
    vistos[base] = (vistos[base] || 0) + 1;
    return `${base}|${vistos[base]}`;
  });
}

/** Tira dos novos os que já estão na planilha vindos de OUTRO arquivo. */
export function deduplicar(existentes, novos, arquivoId) {
  const ja = new Set((existentes || []).filter((l) => l.arquivo !== arquivoId).map((l) => l.chaveDedup).filter(Boolean));
  return (novos || []).filter((l) => !ja.has(l.chaveDedup));
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

export const PERIODOS = ['mes', '3m', '6m', '12m', 'ano', 'tudo'].map((id) => ({ id, nome: rotuloPeriodo(id) }));

/** Meses com gasto, em ordem. */
export function mesesComDados(lancs) {
  return [...new Set(lancs.filter((l) => l.gasto).map((l) => l.mes))].sort();
}

/** { inicio, fim, meses[] } do período, ancorado em `mesRef` (o mês escolhido / último com dados). */
/**
 * 03/10/2026 (revisão do pedido "Escolher período" em TODOS os filtros):
 * período personalizado { inicio, fim } (ISO yyyy-mm-dd, do calendário de
 * periodo-personalizado.js).
 */
export function ehPeriodoDias(p) {
  return !!p && typeof p === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(p.inicio)) && /^\d{4}-\d{2}-\d{2}$/.test(String(p.fim));
}

export function intervaloPeriodo(periodo, mesRef, primeiro) {
  if (ehPeriodoDias(periodo)) {
    // meses que o intervalo toca (o recorte por dia é feito nos lançamentos)
    const d0 = periodo.inicio <= periodo.fim ? periodo.inicio : periodo.fim;
    const d1 = periodo.inicio <= periodo.fim ? periodo.fim : periodo.inicio;
    let ini = d0.slice(0, 7);
    const fimP = d1.slice(0, 7);
    if (primeiro && ini < primeiro) ini = primeiro <= fimP ? primeiro : fimP;
    return { inicio: ini, fim: fimP, meses: mesesEntre(ini, fimP), dias: { inicio: d0, fim: d1 } };
  }
  const fim = mesRef;
  let inicio = fim;
  if (periodo === '3m') inicio = somarMeses(fim, -2);
  else if (periodo === '6m') inicio = somarMeses(fim, -5);
  else if (periodo === '12m') inicio = somarMeses(fim, -11);
  else if (periodo === 'ano') inicio = `${fim.slice(0, 4)}-01`;
  else if (periodo === 'tudo') inicio = primeiro || fim;
  if (primeiro && inicio < primeiro && periodo !== 'mes') inicio = primeiro;
  return { inicio, fim, meses: mesesEntre(inicio, fim) };
}

// ---------------------------------------------------------------------------
// Totais
// ---------------------------------------------------------------------------

/** Gasto por mês: { mes, total, cartao, conta, n } para cada mês do intervalo (0 se vazio). */
export function totaisPorMes(lancs, meses) {
  const mapa = Object.fromEntries(meses.map((m) => [m, { mes: m, total: 0, cartao: 0, conta: 0, n: 0 }]));
  lancs.forEach((l) => {
    const t = mapa[l.mes];
    if (!t || !l.gasto) return;
    t.total += l.valor; t[l.origem === 'cartao' ? 'cartao' : 'conta'] += l.valor; t.n += 1;
  });
  return meses.map((m) => { const t = mapa[m]; return { ...t, total: r2(t.total), cartao: r2(t.cartao), conta: r2(t.conta) }; });
}

/** Por categoria no conjunto de meses: [{ id, nome, total, n, fracao }] maior primeiro. */
export function totaisPorCategoria(lancs, meses) {
  const set = new Set(meses);
  const mapa = {};
  let soma = 0;
  lancs.forEach((l) => {
    if (!l.gasto || !set.has(l.mes)) return;
    const c = mapa[l.categoria] || (mapa[l.categoria] = { id: l.categoria, nome: NOME_CATEGORIA[l.categoria] || l.categoria, total: 0, n: 0 });
    c.total += l.valor; c.n += 1; soma += l.valor;
  });
  return Object.values(mapa).map((c) => ({ ...c, total: r2(c.total), fracao: soma > 0 ? c.total / soma : 0 }))
    .filter((c) => Math.abs(c.total) >= 0.005).sort((a, b) => b.total - a.total);
}

/** Média mensal dos `n` meses que terminam em `mesFim` (só meses com documento). */
export function mediaMensal(porMes, mesFim, n, mesesCobertos = null) {
  const alvo = porMes.filter((m) => m.mes <= mesFim && m.mes > somarMeses(mesFim, -n) && (!mesesCobertos || mesesCobertos.has(m.mes)));
  if (!alvo.length) return null;
  return r2(alvo.reduce((s, m) => s + m.total, 0) / alvo.length);
}

/** Maiores do período - sem os gastos fixos (`excluirChaves`), que repetiriam todo mês. */
export function maioresLancamentos(lancs, meses, n = 10, excluirChaves = null) {
  const set = new Set(meses);
  return lancs.filter((l) => l.gasto && set.has(l.mes) && l.valor > 0 && !(excluirChaves && excluirChaves.has(l.chave))).sort((a, b) => b.valor - a.valor).slice(0, n);
}

// ---------------------------------------------------------------------------
// Recorrentes (assinaturas)
// ---------------------------------------------------------------------------

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

/**
 * Mesma descrição, valor parecido (±20% da mediana), em pelo menos 3 meses
 * seguidos (tolera 1 mês de falha). Parcelamentos não entram. "ativa" = visto
 * nos 2 últimos meses com documento.
 */
export function detectarRecorrentes(lancs, { ultimoMes = null, minMeses = 3 } = {}) {
  const grupos = {};
  lancs.forEach((l) => {
    if (!l.gasto || l.parcela || l.valor <= 0 || !l.chave) return;
    const g = grupos[l.chave] || (grupos[l.chave] = { chave: l.chave, porMes: {}, descricao: l.descricao, categoria: l.categoria, origem: l.origem });
    g.porMes[l.mes] = (g.porMes[l.mes] || 0) + l.valor;
    g.descricao = l.descricao; g.categoria = l.categoria;
  });
  const fim = ultimoMes || mesesComDados(lancs).slice(-1)[0];
  const out = [];
  Object.values(grupos).forEach((g) => {
    const meses = Object.keys(g.porMes).sort();
    if (meses.length < minMeses) return;
    const vals = meses.map((m) => g.porMes[m]);
    const med = mediana(vals);
    if (med < 1) return;
    // assinatura varia pouco (câmbio, reajuste); o resto precisa ser bem fixo (aluguel, Pix da diarista)
    const tol = g.categoria === 'assinaturas' ? 0.2 : 0.08;
    // maior sequência de meses (falha de no máximo 1 mês) com valor parecido
    let melhor = []; let atual = [];
    meses.forEach((m) => {
      const ok = Math.abs(g.porMes[m] - med) <= med * tol + 0.5;
      if (ok && atual.length && somarMeses(atual[atual.length - 1], 2) >= m) atual.push(m);
      else if (ok) atual = [m];
      else atual = [];
      if (atual.length > melhor.length) melhor = [...atual];
    });
    if (melhor.length < minMeses) return;
    const ultimo = melhor[melhor.length - 1];
    out.push({
      chave: g.chave, descricao: g.descricao, categoria: g.categoria, origem: g.origem,
      valor: r2(g.porMes[ultimo]), mediana: r2(med), meses: melhor.length, primeiro: melhor[0], ultimo,
      ativa: !!fim && ultimo >= somarMeses(fim, -1), anual: r2(g.porMes[ultimo] * 12),
    });
  });
  return out.sort((a, b) => (b.ativa - a.ativa) || (b.valor - a.valor));
}

// ---------------------------------------------------------------------------
// Parcelamentos em aberto
// ---------------------------------------------------------------------------

/**
 * Compras parceladas no cartão cuja ÚLTIMA parcela vista está na fatura mais
 * recente daquela fonte e ainda não é a última: o que falta pagar, mês a mês.
 * { compras: [{ descricao, valor, n, de, restantes, fim, total }], porMes: [{ mes, total }] }
 */
export function parcelamentosEmAberto(lancs, { meses = 12 } = {}) {
  const cartao = lancs.filter((l) => l.origem === 'cartao' && l.parcela && l.gasto && l.valor > 0);
  const ultimoPorFonte = {};
  lancs.filter((l) => l.origem === 'cartao').forEach((l) => { if (!ultimoPorFonte[l.fonte] || l.mes > ultimoPorFonte[l.fonte]) ultimoPorFonte[l.fonte] = l.mes; });
  const compras = {};
  cartao.forEach((l) => {
    const [n, de] = l.parcela.split('/').map(Number);
    const k = `${l.fonte}|${l.chave}|${Number(l.valor).toFixed(2)}|${de}|${somarMeses(l.mes, -(n - 1))}`;
    const c = compras[k];
    if (!c || n > c.n) compras[k] = { fonte: l.fonte, descricao: l.descricao.replace(/\s*[-–]?\s*PARC(?:ELA)?\.?\s*\d{1,2}\s*(?:\/|DE)\s*\d{1,2}/i, '').trim(), categoria: l.categoria, valor: l.valor, n, de, mes: l.mes };
  });
  const abertas = Object.values(compras)
    .filter((c) => c.n < c.de && c.mes === ultimoPorFonte[c.fonte])
    .map((c) => ({ ...c, restantes: c.de - c.n, fim: somarMeses(c.mes, c.de - c.n), total: r2(c.valor * (c.de - c.n)) }))
    .sort((a, b) => b.total - a.total);
  const base = Object.values(ultimoPorFonte).sort().slice(-1)[0];
  const porMes = [];
  if (base) {
    for (let k = 1; k <= meses; k += 1) {
      const mes = somarMeses(base, k);
      const total = abertas.reduce((s, c) => s + (mes > c.mes && mes <= c.fim ? c.valor : 0), 0);
      porMes.push({ mes, total: r2(total) });
    }
    while (porMes.length && porMes[porMes.length - 1].total === 0) porMes.pop();
  }
  return { compras: abertas, porMes, total: r2(abertas.reduce((s, c) => s + c.total, 0)), base };
}

// ---------------------------------------------------------------------------
// Documentos: meses importados e meses que faltam
// ---------------------------------------------------------------------------

/**
 * arquivos: [{ fonte, meses:[aaaa-mm] }] (o registro aux_gastos-arquivos).
 * Devolve, por fonte, os meses cobertos, os que faltam entre o 1º e o mês
 * passado, e o conjunto de meses "completos" (todas as fontes ativas na época).
 */
export function coberturaDocumentos(arquivos, hoje, { encerradas = [], semMovimento = {} } = {}) {
  const fechadas = new Set(encerradas || []); // 07/10/2026: cartão/conta encerrado - sem "faltam meses" (o histórico fica)
  // 07/10/2026 (Tiago: "meses que não usei o cartão - mês sem fatura"): marcados por fonte, saem do "faltam"
  const semMov = (f) => new Set((semMovimento && Array.isArray(semMovimento[f]) ? semMovimento[f] : []));
  const mesAtual = mesDe(hoje);
  const ultimoFechado = somarMeses(mesAtual, -1);
  const porFonte = {};
  (arquivos || []).forEach((a) => {
    if (!a.fonte) return;
    const f = porFonte[a.fonte] || (porFonte[a.fonte] = new Set());
    (a.meses || []).forEach((m) => f.add(m));
  });
  const fontes = Object.entries(porFonte).map(([fonte, set]) => {
    const meses = [...set].sort();
    const ini = meses[0];
    const encerrada = fechadas.has(fonte);
    const sem = semMov(fonte);
    const buracos = mesesEntre(ini, ultimoFechado).filter((m) => !set.has(m));
    const faltam = encerrada ? [] : buracos.filter((m) => !sem.has(m));
    const semMovimento = buracos.filter((m) => sem.has(m)); // marcados "sem fatura/extrato" (e que de fato não têm documento)
    return { fonte, nome: NOME_FONTE[fonte] || fonte, meses, primeiro: ini, ultimo: meses[meses.length - 1], faltam, encerrada, semMovimento };
  }).sort((a, b) => (a.nome < b.nome ? -1 : 1));
  const todos = new Set(fontes.flatMap((f) => f.meses));
  return { fontes, mesesCobertos: todos, ultimoFechado };
}

/**
 * 03/10/2026 (Tiago: "se eu for reimportar o que faltou, não reimportar o
 * que já deu sucesso"): situação de um arquivo da lista do Drive
 * (Gastos.gs!listarArquivosGastos_):
 *  - 'importado' - entrou e não mudou desde então;
 *  - 'falhou'    - a última tentativa deu erro, ou entrou com aviso (soma
 *                  que não bate) - vai pro "Tentar de novo só os que falharam";
 *  - 'novo'      - nunca foi tentado, ou mudou no Drive depois de importado.
 */
export function situacaoArquivoDrive(a) {
  if (!a) return 'novo';
  if (a.situacao === 'erro') return 'falhou';
  if (a.importado && a.alterado && a.problema && a.situacao !== 'aviso') return 'falhou'; // mudou no Drive e a releitura falhou
  if (!a.importado || a.alterado) return 'novo';
  // 07/10/2026 (Tiago: "considere como parcialmente sucesso esses de a conta não bater, o que importa são as compras"):
  // entrou com a soma que não bate = 'parcial' - conta como importado, fora do "com problema" e do "tentar de novo"
  if (a.situacao === 'aviso') return 'parcial';
  return 'importado';
}
export const arquivosNovosDrive = (lista) => (lista || []).filter((a) => situacaoArquivoDrive(a) === 'novo');
export const arquivosFalhosDrive = (lista) => (lista || []).filter((a) => situacaoArquivoDrive(a) === 'falhou');
export const arquivosParciaisDrive = (lista) => (lista || []).filter((a) => situacaoArquivoDrive(a) === 'parcial');

/**
 * 07/10/2026: de que cartão/conta (id de NOME_FONTE) é um arquivo da lista do Drive. O já importado traz a fonte do
 * registro; o novo sai da pasta do banco (Cartão de Crédito/<Banco>/..., Extratos/<Banco>/...). '' = não sei.
 */
export function fonteArquivoDrive(a) {
  if (!a) return '';
  if (a.fonte) return a.fonte;
  const banco = String(a.banco || String(a.caminho || '').split('/')[1] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cartao = a.origem ? a.origem === 'cartao' : /cart[aã]o/i.test(a.caminho || '');
  if (/ouro/.test(banco)) return 'ourocard';
  if (/bradesco/.test(banco)) return 'bradesco';
  if (/nubank|nu\b/.test(banco)) return cartao ? 'nubank-cartao' : 'nubank-conta';
  return '';
}

// ---------------------------------------------------------------------------
// Essencial (aba Despesas) x real
// ---------------------------------------------------------------------------

const MAPA_ESSENCIAL = {
  Moradia: ['moradia'], 'Contas da casa': ['moradia'], Alimentação: ['mercado', 'restaurantes'], Transporte: ['transporte', 'combustivel'],
  Saúde: ['saude'], Educação: ['educacao'], Assinaturas: ['assinaturas'], 'Dívidas e parcelas': ['tarifas'],
};

/**
 * despesas: a resposta do getDespesas (ou o bloco .despesas) - itens
 * { nome, valor, categoria, frequencia }. mediaPorCategoria: { id: média/mês }.
 */
export function compararEssenciais(despesas, mediaPorCategoria, mediaTotal) {
  const d = despesas && despesas.despesas ? despesas.despesas : despesas;
  const itens = (d && d.itens) || [];
  if (!itens.length) return null;
  const mensal = (it) => (num(it.valor) ? (it.frequencia === 'Anual' ? it.valor / 12 : it.valor) : 0);
  const essencial = r2(itens.reduce((s, it) => s + mensal(it), 0));
  const grupos = {};
  itens.forEach((it) => {
    const cat = it.categoria && MAPA_ESSENCIAL[it.categoria] ? it.categoria : 'Outros';
    const g = grupos[cat] || (grupos[cat] = { categoria: cat, cadastrado: 0, real: null, ids: MAPA_ESSENCIAL[cat] || [] });
    g.cadastrado += mensal(it);
  });
  const linhas = Object.values(grupos).map((g) => {
    const real = g.ids.length ? r2(g.ids.reduce((s, id) => s + (mediaPorCategoria[id] || 0), 0)) : null;
    return { categoria: g.categoria, cadastrado: r2(g.cadastrado), real, diferenca: real == null ? null : r2(real - g.cadastrado) };
  }).sort((a, b) => b.cadastrado - a.cadastrado);
  const salario = despesas && despesas.salario && num(despesas.salario.liquido) ? despesas.salario.liquido : null;
  return {
    essencial, real: mediaTotal, alemDoEssencial: num(mediaTotal) ? r2(mediaTotal - essencial) : null,
    razao: num(mediaTotal) && essencial > 0 ? mediaTotal / essencial : null, linhas,
    salario, fracaoSalario: salario && num(mediaTotal) ? mediaTotal / salario : null,
  };
}

// ---------------------------------------------------------------------------
// Tudo de uma vez
// ---------------------------------------------------------------------------

/**
 * dados: { lancamentos, regras, arquivos } (getGastos). periodo: id de PERIODOS ou { inicio, fim } (dias ISO, "Escolher período").
 * mesEscolhido: 'aaaa-mm' (ou null = último mês com dados).
 */
export function resumoGastos(dados, { periodo = '12m', mesEscolhido = null, hoje = new Date(), despesas = null } = {}) {
  const lancs = prepararLancamentos(dados.lancamentos, dados.regras);
  const meses = mesesComDados(lancs);
  const cobertura = coberturaDocumentos(dados.arquivos, hoje, { encerradas: dados.fontesEncerradas || [], semMovimento: dados.mesesSemMovimento || {} });
  if (!meses.length) return { vazio: true, lancs, cobertura, meses };
  const ultimo = meses[meses.length - 1];
  const personalizado = ehPeriodoDias(periodo);
  let mesRef = mesEscolhido && mesEscolhido <= ultimo && mesEscolhido >= meses[0] ? mesEscolhido : ultimo;
  const intervalo = intervaloPeriodo(periodo, mesRef, meses[0]);
  // período personalizado: o mês de referência (médias de 6/12 meses, "este
  // mês") é o último mês do intervalo, sem passar do último com dados
  if (personalizado) mesRef = intervalo.fim < ultimo ? (intervalo.fim < meses[0] ? meses[0] : intervalo.fim) : ultimo;
  const todos = mesesEntre(meses[0], ultimo);
  const porMesTodos = totaisPorMes(lancs, todos);
  // lançamentos do período (no personalizado, recortados pelo DIA)
  const noPeriodo = personalizado ? lancs.filter((l) => l.data >= intervalo.dias.inicio && l.data <= intervalo.dias.fim) : lancs;
  const porMes = personalizado
    ? totaisPorMes(noPeriodo, intervalo.meses)
    : porMesTodos.filter((m) => m.mes >= intervalo.inicio && m.mes <= intervalo.fim);
  const cobertos = cobertura.mesesCobertos.size ? cobertura.mesesCobertos : new Set(meses);
  const mesesValidos = porMes.filter((m) => cobertos.has(m.mes) || m.total > 0);
  const total = r2(porMes.reduce((s, m) => s + m.total, 0));
  const media = mesesValidos.length ? r2(total / mesesValidos.length) : null;
  const cats = totaisPorCategoria(noPeriodo, intervalo.meses);
  const mediaPorCategoria = {};
  cats.forEach((c) => { mediaPorCategoria[c.id] = mesesValidos.length ? c.total / mesesValidos.length : 0; });
  const media6 = mediaMensal(porMesTodos, somarMeses(mesRef, -1), 6, cobertos);
  const media12 = mediaMensal(porMesTodos, somarMeses(mesRef, -1), 12, cobertos);
  const doMes = porMesTodos.find((m) => m.mes === mesRef) || { total: 0, cartao: 0, conta: 0, n: 0 };
  const media12Todas = {};
  const ult12 = mesesEntre(somarMeses(ultimo, -11), ultimo).filter((m) => cobertos.has(m) || m >= meses[0]);
  totaisPorCategoria(lancs, ult12).forEach((c) => { media12Todas[c.id] = ult12.length ? c.total / ult12.length : 0; });
  const mediaGeral12 = mediaMensal(porMesTodos, ultimo, 12, cobertos);
  const recorrentes = detectarRecorrentes(lancs, { ultimoMes: ultimo });
  return {
    vazio: false, lancs, meses, ultimo, mesRef, periodo, intervalo, porMes, porMesTodos, total, media, mesesValidos: mesesValidos.length,
    cartao: r2(porMes.reduce((s, m) => s + m.cartao, 0)), conta: r2(porMes.reduce((s, m) => s + m.conta, 0)),
    categorias: cats, mediaPorCategoria, doMes, media6, media12,
    recorrentes,
    maiores: maioresLancamentos(noPeriodo, intervalo.meses, 10, new Set(recorrentes.filter((x) => x.ativa).map((x) => x.chave))),
    parcelas: parcelamentosEmAberto(lancs),
    cobertura,
    essenciais: compararEssenciais(despesas, media12Todas, mediaGeral12),
  };
}

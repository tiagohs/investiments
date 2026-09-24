// assets/js/pages/proventos-calc.js
//
// 24/09/2026: contas da tela Proventos (Consolidado e Agenda) - funções puras,
// sem DOM, testadas em tests/proventos-calc.test.js. Os dados chegam de
// apps-script/Proventos.gs!montarTelaProventos_:
//   { hoje, recebidos, aReceber, pagosNaoLancados, ativos, aplicado, aportes12m }
// Todas as datas são chaves 'yyyy-MM-dd' (texto): nada passa por Date, então
// o dia nunca vira por fuso.

export const CLASSES = [
  { id: 'acoes', nome: 'Ações', cor: '--acoes' },
  { id: 'fiis', nome: 'FIIs', cor: '--fiis' },
  { id: 'acoesEua', nome: 'Ações EUA', cor: '--usa' },
];
export const NOME_CLASSE = Object.fromEntries(CLASSES.map((c) => [c.id, c.nome]));
export const COR_CLASSE = Object.fromEntries(CLASSES.map((c) => [c.id, c.cor]));

/** Tipos na ordem fixa das cores (--cat-1..5); o resto vira "Outros" (neutro). */
export const TIPOS = ['Dividendo', 'JCP', 'Rendimento', 'Amortização', 'Reembolso'];

export const PERIODOS = [
  { id: 'ano', nome: 'No ano' },
  { id: '12m', nome: '12 meses' },
  { id: '24m', nome: '24 meses' },
  { id: '36m', nome: '36 meses' },
  { id: 'inicio', nome: 'Desde o início' },
];

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MAX_ATIVOS_GRAFICO = 7;

export const r2 = (n) => Math.round(n * 100) / 100;
const soma = (itens) => r2((itens || []).reduce((s, p) => s + (Number.isFinite(p.valor) ? p.valor : 0), 0));

/** 'yyyy-MM' + n meses. */
export function somarMeses(anoMes, n) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** 'yyyy-MM' -> "set/26" */
export function rotuloMes(anoMes) {
  const [a, m] = anoMes.split('-');
  return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`;
}

/** 'yyyy-MM-dd' + n dias (UTC puro, só aritmética de calendário). */
export function somarDias(chave, n) {
  const [a, m, d] = chave.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d) + n * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

export function filtrarClasse(itens, classe) {
  if (!classe || classe === 'todas') return itens || [];
  return (itens || []).filter((p) => p.classe === classe);
}

/**
 * Meses do período, sempre terminando no mês de hoje (inclusive):
 * "No ano" = janeiro até agora; "12 meses" = este mês + os 11 anteriores
 * (12 barras); "Desde o início" = do mês do 1º provento recebido.
 */
export function mesesDoPeriodo(periodoId, hoje, primeiraData = null) {
  const fim = hoje.slice(0, 7);
  let inicio;
  if (periodoId === 'ano') inicio = `${hoje.slice(0, 4)}-01`;
  else if (periodoId === 'inicio') inicio = primeiraData ? primeiraData.slice(0, 7) : fim;
  else {
    const n = { '12m': 12, '24m': 24, '36m': 36 }[periodoId] || 12;
    inicio = somarMeses(fim, -(n - 1));
  }
  if (inicio > fim) inicio = fim;
  const meses = [];
  for (let m = inicio; m <= fim; m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

function primeiraDataRecebida(recebidos) {
  return (recebidos || []).reduce((min, p) => (!min || p.data < min ? p.data : min), null);
}

function somaPorClasse(obj, classe) {
  if (!obj) return 0;
  if (classe && classe !== 'todas') return Number(obj[classe]) || 0;
  return CLASSES.reduce((s, c) => s + (Number(obj[c.id]) || 0), 0);
}

/**
 * Os 5 números do topo do Consolidado.
 * - aplicado: Valor aplicado hoje (mesma régua de Carteiras); aportes12m: aportes líquidos em 365 dias;
 * - renda / renda12m: recebidos no período / nos últimos 12 meses (mesma janela das barras);
 * - media / media12m: renda ÷ nº de meses da janela;
 * - yoc / yoc12m: renda ÷ Valor aplicado (em %);
 * - aReceber: tudo o que está anunciado; aReceberEsteMes: com pagamento neste mês.
 */
export function resumoConsolidado(dados, { classe = 'todas', periodoId = '12m' } = {}) {
  const hoje = dados.hoje;
  const rec = filtrarClasse(dados.recebidos, classe);
  const meses = mesesDoPeriodo(periodoId, hoje, primeiraDataRecebida(rec));
  const meses12 = mesesDoPeriodo('12m', hoje);
  const naJanela = (lista) => rec.filter((p) => p.data.slice(0, 7) >= lista[0] && p.data <= hoje);
  const renda = soma(naJanela(meses));
  const renda12m = soma(naJanela(meses12));
  const aplicado = r2(somaPorClasse(dados.aplicado, classe));
  const aReceber = filtrarClasse(dados.aReceber, classe);
  const mesHoje = hoje.slice(0, 7);
  return {
    meses: meses.length,
    primeiroMes: meses[0],
    ultimoMes: meses[meses.length - 1],
    aplicado,
    aportes12m: r2(somaPorClasse(dados.aportes12m, classe)),
    renda,
    renda12m,
    media: r2(renda / meses.length),
    media12m: r2(renda12m / 12),
    yoc: aplicado > 0 ? (renda / aplicado) * 100 : null,
    yoc12m: aplicado > 0 ? (renda12m / aplicado) * 100 : null,
    rendaMes: soma(rec.filter((p) => p.data.slice(0, 7) === mesHoje && p.data <= hoje)),
    aReceber: soma(aReceber),
    aReceberEsteMes: soma(aReceber.filter((p) => String(p.dataPagamento || '').slice(0, 7) === mesHoje)),
    qtdAReceber: aReceber.length,
  };
}

function grupoDoTipo(tipo) {
  return TIPOS.includes(tipo) ? tipo : 'Outros';
}

/**
 * Séries das barras empilhadas por mês.
 * agrupar: 'classe' (cores das classes) | 'tipo' (ordem fixa de TIPOS) |
 * 'ativo' (os 7 maiores NO PERÍODO + "Outros": com 20+ ativos, os maiores de
 * sempre deixavam o "Outros" com metade da barra - a cor segue a posição
 * no período, e a legenda/tooltip sempre dizem qual ativo é qual).
 * Devolve { meses, grupos: [{ id, rotulo, cor }], valores: { id: [por mês] }, totais: [por mês] }.
 */
export function historicoMensal(dados, { classe = 'todas', periodoId = '12m', agrupar = 'classe' } = {}) {
  const rec = filtrarClasse(dados.recebidos, classe);
  const meses = mesesDoPeriodo(periodoId, dados.hoje, primeiraDataRecebida(rec));
  const idxMes = Object.fromEntries(meses.map((m, i) => [m, i]));
  let grupos;
  let grupoDe;
  if (agrupar === 'tipo') {
    const presentes = new Set(rec.map((p) => grupoDoTipo(p.tipo)));
    grupos = [...TIPOS, 'Outros'].filter((t) => presentes.has(t)).map((t) => ({ id: t, rotulo: t, cor: t === 'Outros' ? '--cat-outros' : `--cat-${TIPOS.indexOf(t) + 1}` }));
    grupoDe = (p) => grupoDoTipo(p.tipo);
  } else if (agrupar === 'ativo') {
    const total = {};
    rec.forEach((p) => { if (idxMes[p.data.slice(0, 7)] !== undefined && p.data <= dados.hoje) total[p.ticker] = (total[p.ticker] || 0) + p.valor; });
    const top = Object.keys(total).sort((a, b) => total[b] - total[a] || (a < b ? -1 : 1)).slice(0, MAX_ATIVOS_GRAFICO);
    const outros = Object.keys(total).length > top.length;
    grupos = top.map((t, i) => ({ id: t, rotulo: t, cor: `--cat-${i + 1}` }));
    if (outros) grupos.push({ id: 'Outros', rotulo: 'Outros', cor: '--cat-outros' });
    grupoDe = (p) => (top.includes(p.ticker) ? p.ticker : 'Outros');
  } else {
    const presentes = new Set(rec.map((p) => p.classe));
    grupos = CLASSES.filter((c) => presentes.has(c.id)).map((c) => ({ id: c.id, rotulo: c.nome, cor: c.cor }));
    grupoDe = (p) => p.classe;
  }
  const valores = Object.fromEntries(grupos.map((g) => [g.id, meses.map(() => 0)]));
  rec.forEach((p) => {
    const i = idxMes[p.data.slice(0, 7)];
    if (i === undefined || p.data > dados.hoje) return;
    const g = grupoDe(p);
    if (valores[g]) valores[g][i] += p.valor;
  });
  Object.keys(valores).forEach((g) => { valores[g] = valores[g].map(r2); });
  // grupos sem nenhum valor no período saem da legenda (a cor dos outros não muda)
  const gruposVisiveis = grupos.filter((g) => valores[g.id].some((v) => v !== 0));
  const totais = meses.map((_, i) => r2(gruposVisiveis.reduce((s, g) => s + valores[g.id][i], 0)));
  return { meses, grupos: gruposVisiveis, valores, totais };
}

/**
 * Ranking por ativo no período: total recebido, % do total, e da carteira de
 * hoje quantidade, preço médio, YoC 12 meses (renda de 12 meses ÷ quantidade ×
 * preço médio, na moeda do ativo) e DY.
 */
export function rankingPorAtivo(dados, { classe = 'todas', periodoId = '12m' } = {}) {
  const hoje = dados.hoje;
  const rec = filtrarClasse(dados.recebidos, classe);
  const meses = mesesDoPeriodo(periodoId, hoje, primeiraDataRecebida(rec));
  const inicio12 = mesesDoPeriodo('12m', hoje)[0];
  const ativos = Object.fromEntries((dados.ativos || []).map((a) => [a.ticker, a]));
  const porTicker = {};
  rec.forEach((p) => {
    if (p.data > hoje) return;
    const x = porTicker[p.ticker] || (porTicker[p.ticker] = { ticker: p.ticker, classe: p.classe, total: 0, totalDesdeInicio: 0, renda12mMoeda: 0, pagamentos: 0 });
    x.totalDesdeInicio += p.valor;
    if (p.data.slice(0, 7) >= meses[0]) { x.total += p.valor; x.pagamentos += 1; }
    if (p.data.slice(0, 7) >= inicio12) x.renda12mMoeda += p.moeda === 'USD' ? (p.liquido || 0) : p.valor;
  });
  const lista = Object.values(porTicker).filter((x) => x.total > 0);
  const totalGeral = lista.reduce((s, x) => s + x.total, 0);
  return lista.map((x) => {
    const a = ativos[x.ticker];
    const custo = a && a.quantidade > 0 && a.precoMedio > 0 ? a.quantidade * a.precoMedio : null;
    return {
      ticker: x.ticker,
      classe: x.classe,
      nome: a ? a.nome : '',
      total: r2(x.total),
      pct: totalGeral > 0 ? (x.total / totalGeral) * 100 : 0,
      pagamentos: x.pagamentos,
      totalDesdeInicio: r2(x.totalDesdeInicio),
      quantidade: a ? a.quantidade : 0,
      precoMedio: a ? a.precoMedio : null,
      moeda: x.classe === 'acoesEua' ? 'USD' : 'BRL',
      yoc12m: custo ? (x.renda12mMoeda / custo) * 100 : null,
      dy: a && typeof a.dy === 'number' ? a.dy * 100 : null,
      naCarteira: !!(a && a.quantidade > 0),
    };
  }).sort((a, b) => b.total - a.total || (a.ticker < b.ticker ? -1 : 1));
}

/**
 * Receita futura (anunciada): pagamentos em até 30, 90 e 365 dias (de hoje,
 * inclusive), os sem data definida, e as datas com que ainda vão acontecer.
 */
export function receitaFutura(dados, { classe = 'todas' } = {}) {
  const hoje = dados.hoje;
  const itens = filtrarClasse(dados.aReceber, classe);
  const ate = (dias) => soma(itens.filter((p) => p.dataPagamento && p.dataPagamento >= hoje && p.dataPagamento <= somarDias(hoje, dias)));
  return {
    d30: ate(30),
    d90: ate(90),
    d365: ate(365),
    semData: soma(itens.filter((p) => !p.dataPagamento)),
    qtdSemData: itens.filter((p) => !p.dataPagamento).length,
    datasComFuturas: itens.filter((p) => p.dataCom && p.dataCom >= hoje).sort((a, b) => (a.dataCom < b.dataCom ? -1 : 1)),
    proximos: itens.filter((p) => p.dataPagamento).sort((a, b) => (a.dataPagamento < b.dataPagamento ? -1 : a.dataPagamento > b.dataPagamento ? 1 : (a.ticker < b.ticker ? -1 : 1))),
  };
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

/**
 * Lista única da Agenda: recebidos (status 'pago'), pagos que ainda não
 * estão na aba Proventos ('naoLancado'), a receber ('aReceber') e sem data
 * ('semData'). Cada item: { ticker, classe, tipo, dataCom, dataPagamento,
 * quantidade, valorPorCota, moeda, liquido, cambio, valor (R$), status, fonte }.
 */
export function itensAgenda(dados, { classe = 'todas' } = {}) {
  const out = [];
  filtrarClasse(dados.recebidos, classe).forEach((p) => {
    out.push({ ticker: p.ticker, classe: p.classe, tipo: p.tipo, dataCom: p.dataCom || '', dataPagamento: p.data, quantidade: p.quantidade, valorPorCota: p.valorPorCota,
      moeda: p.moeda || 'BRL', liquido: p.liquido, cambio: p.cambio || null, valor: p.valor, status: 'pago', fonte: 'Planilha' });
  });
  filtrarClasse(dados.pagosNaoLancados, classe).forEach((p) => {
    out.push({ ...p, moeda: 'BRL', status: 'naoLancado' });
  });
  filtrarClasse(dados.aReceber, classe).forEach((p) => {
    out.push({ ...p, moeda: p.moeda || 'BRL', status: p.dataPagamento ? 'aReceber' : 'semData' });
  });
  return out.sort((a, b) => {
    const da = a.dataPagamento || '9999-99-99';
    const db = b.dataPagamento || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : (a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0);
  });
}

export const STATUS_REALIZADO = ['pago', 'naoLancado'];
export const STATUS_A_REALIZAR = ['aReceber', 'semData'];

function passaStatus(p, status) {
  if (status === 'realizado') return STATUS_REALIZADO.includes(p.status);
  if (status === 'aRealizar') return STATUS_A_REALIZAR.includes(p.status);
  return true;
}

/** Anos com algum provento (e o ano de hoje), do mais novo pro mais velho. */
export function anosDaAgenda(itens, hoje) {
  const anos = new Set([Number(hoje.slice(0, 4))]);
  itens.forEach((p) => { if (p.dataPagamento) anos.add(Number(p.dataPagamento.slice(0, 4))); });
  return [...anos].sort((a, b) => b - a);
}

/** Quantos proventos em cada mês do ano (índice 0 = janeiro) e sem data, respeitando o filtro de status. */
export function contagemPorMes(itens, ano, status = 'todos') {
  const meses = Array.from({ length: 12 }, () => 0);
  let semData = 0;
  itens.forEach((p) => {
    if (!passaStatus(p, status)) return;
    if (!p.dataPagamento) { semData += 1; return; }
    if (Number(p.dataPagamento.slice(0, 4)) !== ano) return;
    meses[Number(p.dataPagamento.slice(5, 7)) - 1] += 1;
  });
  return { meses, semData };
}

/** mes: 1..12, 'semData' ou null (ano inteiro). Devolve { itens, total }. */
export function filtrarAgenda(itens, { ano, mes = null, status = 'todos' } = {}) {
  const lista = itens.filter((p) => {
    if (!passaStatus(p, status)) return false;
    if (mes === 'semData') return !p.dataPagamento;
    if (!p.dataPagamento || Number(p.dataPagamento.slice(0, 4)) !== ano) return false;
    return mes == null || Number(p.dataPagamento.slice(5, 7)) === mes;
  });
  return { itens: lista, total: soma(lista) };
}

// ---------------------------------------------------------------------------
// Importar a exportação da B3 (prévia no navegador, antes de enviar)
// ---------------------------------------------------------------------------

const normalizarTexto = (s) => String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function numeroB3(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').replace(/[^\d,.-]/g, '');
  if (/,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Prévia da planilha "Proventos a receber" da B3 - mesma leitura de
 * Proventos.gs!extrairProventosB3DeLinhas_ (cabeçalho "Produto" + "Valor
 * líquido" nas 15 primeiras linhas, "TICKER - NOME", linha de total fora).
 * Devolve { ok, itens: [{ ticker, evento, pagamento, valor }], total }.
 */
export function previaExportacaoB3(linhas) {
  const matriz = Array.isArray(linhas) ? linhas : [];
  let cab = -1;
  let idx = {};
  for (let i = 0; i < Math.min(matriz.length, 15) && cab === -1; i += 1) {
    const nomes = (matriz[i] || []).map(normalizarTexto);
    if (nomes.includes('produto') && nomes.some((n) => n.startsWith('valor liquido'))) {
      cab = i;
      idx = {};
      nomes.forEach((n, j) => { if (n && idx[n] === undefined) idx[n] = j; });
    }
  }
  if (cab === -1) return { ok: false, itens: [], total: 0 };
  const col = (prefixo) => { const k = Object.keys(idx).find((n) => n.startsWith(prefixo)); return k === undefined ? -1 : idx[k]; };
  const cProduto = col('produto');
  const cEvento = col('tipo de evento');
  const cPag = col('previsao de pagamento');
  const cValor = col('valor liquido');
  const itens = [];
  for (let r = cab + 1; r < matriz.length; r += 1) {
    const l = matriz[r] || [];
    const ticker = String(l[cProduto] || '').trim().split(' - ')[0].trim().toUpperCase();
    if (!/^[A-Z0-9]{4,6}\d{0,2}$/.test(ticker)) continue;
    const valor = numeroB3(l[cValor]);
    if (!(valor > 0)) continue;
    itens.push({ ticker, evento: cEvento === -1 ? '' : String(l[cEvento] || ''), pagamento: cPag === -1 ? '' : String(l[cPag] || ''), valor });
  }
  return { ok: itens.length > 0, itens, total: r2(itens.reduce((s, p) => s + p.valor, 0)) };
}

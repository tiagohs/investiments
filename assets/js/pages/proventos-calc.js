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
  // 02/10/2026 ("Escolher período"): intervalo { inicio, fim } = os meses que
  // TOCAM o intervalo (gráfico mensal), nunca passando do mês de hoje.
  if (ehIntervalo(periodoId)) return mesesDoIntervalo(periodoId, hoje);
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

/** 02/10/2026: período personalizado do calendário ({ inicio, fim } em yyyy-MM-dd). */
export function ehIntervalo(p) {
  return !!p && typeof p === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(p.inicio)) && /^\d{4}-\d{2}-\d{2}$/.test(String(p.fim));
}

/** Meses ('yyyy-MM') que tocam o intervalo, cortados no mês de hoje. */
export function mesesDoIntervalo(p, hoje) {
  const a = p.inicio <= p.fim ? p.inicio : p.fim;
  const b = p.inicio <= p.fim ? p.fim : p.inicio;
  const mesHoje = hoje.slice(0, 7);
  const fim = b.slice(0, 7) < mesHoje ? b.slice(0, 7) : mesHoje;
  const inicio = a.slice(0, 7) < fim ? a.slice(0, 7) : fim;
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
/**
 * Meses FECHADOS pra média mensal (o mês de hoje ainda não acabou - contar
 * ele puxaria a média pra baixo no começo do mês e pra cima no fim):
 * 12/24/36 meses = os N meses que terminam no mês passado; "No ano" =
 * janeiro até o mês passado; "Desde o início" = do 1º provento até o mês
 * passado. É a MESMA régua da meta de Renda Passiva (Distribuições e Metas,
 * apps-script/DistribuicoesMetas.gs!mediaRendaPassiva12Meses_).
 */
export function mesesFechadosDoPeriodo(periodoId, hoje, primeiraData = null) {
  const mesHoje = hoje.slice(0, 7);
  // 02/10/2026: no intervalo personalizado, os meses dele que já fecharam
  // (só o mês de hoje, se o intervalo for só ele)
  if (ehIntervalo(periodoId)) {
    const meses = mesesDoIntervalo(periodoId, hoje);
    const fechados = meses.filter((m) => m < mesHoje);
    return fechados.length ? fechados : meses;
  }
  const fim = somarMeses(mesHoje, -1);
  let inicio;
  if (periodoId === 'ano') inicio = `${hoje.slice(0, 4)}-01`;
  else if (periodoId === 'inicio') inicio = primeiraData ? primeiraData.slice(0, 7) : fim;
  else inicio = somarMeses(fim, -(({ '12m': 12, '24m': 24, '36m': 36 }[periodoId] || 12) - 1));
  if (inicio > fim) return [mesHoje]; // janeiro no "No ano" / carteira que começou este mês
  const meses = [];
  for (let m = inicio; m <= fim; m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

/** Média mensal dos proventos em `meses` (lista 'yyyy-MM'). */
export function mediaMensal(recebidos, meses) {
  const set = new Set(meses);
  const total = soma((recebidos || []).filter((p) => set.has(p.data.slice(0, 7))));
  return { media: r2(total / meses.length), total, inicio: meses[0], fim: meses[meses.length - 1], meses: meses.length };
}

/**
 * Os 5 números do topo do Consolidado.
 * - aplicado: Valor aplicado hoje (mesma régua de Carteiras); aportes12m: aportes líquidos em 365 dias;
 * - renda / renda12m: recebidos no período / nos últimos 12 meses (mesma janela das barras);
 * - media: média dos meses FECHADOS do período (ver mesesFechadosDoPeriodo); media12m: dos 12 últimos fechados
 *   (= média da meta de Renda Passiva);
 * - yoc / yoc12m: renda ÷ Valor aplicado (em %);
 * - aReceber: tudo o que está anunciado; aReceberEsteMes: com pagamento neste mês.
 */
export function resumoConsolidado(dados, { classe = 'todas', periodoId = '12m' } = {}) {
  const hoje = dados.hoje;
  const rec = filtrarClasse(dados.recebidos, classe);
  const primeira = primeiraDataRecebida(rec);
  const meses = mesesDoPeriodo(periodoId, hoje, primeira);
  const meses12 = mesesDoPeriodo('12m', hoje);
  const naJanela = (lista) => rec.filter((p) => p.data.slice(0, 7) >= lista[0] && p.data.slice(0, 7) <= lista[lista.length - 1] && p.data <= hoje);
  const renda = soma(naJanela(meses));
  const renda12m = soma(naJanela(meses12));
  const m = mediaMensal(rec, mesesFechadosDoPeriodo(periodoId, hoje, primeira));
  const m12 = mediaMensal(rec, mesesFechadosDoPeriodo('12m', hoje));
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
    media: m.media,
    mediaInicio: m.inicio,
    mediaFim: m.fim,
    mediaMeses: m.meses,
    media12m: m12.media,
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
  // 02/10/2026: quanto de cada mês é pago PRESUMIDO (falta o extrato da B3) - só pro tooltip
  const presumidos = meses.map(() => 0);
  rec.forEach((p) => {
    const i = idxMes[p.data.slice(0, 7)];
    if (i !== undefined && p.data <= dados.hoje && p.conferencia === 'presumido') presumidos[i] += p.valor;
  });
  return { meses, grupos: gruposVisiveis, valores, totais, presumidos: presumidos.map(r2) };
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
    if (p.data.slice(0, 7) >= meses[0] && p.data.slice(0, 7) <= meses[meses.length - 1]) { x.total += p.valor; x.pagamentos += 1; }
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
// Pago presumido e conferência com o extrato da B3 (02/10/2026)
// ---------------------------------------------------------------------------
// Tiago: "Proventos: se a data de pagamento já passou, deduz que está pago.
// Eu mando no final do mês [o arquivo da B3] e você faz o check final."
// O servidor (Proventos.gs) já separa pelo dia de hoje e marca a
// `conferencia` de cada um; aqui o dia é reconferido no fuso de São Paulo
// (a resposta pode ter vindo do cache de ontem) e os pagos que não estão na
// aba Proventos entram nos recebidos - contam nos totais e gráficos.

const FMT_DIA_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia de hoje em São Paulo ('yyyy-MM-dd'), seja qual for o fuso do aparelho. */
export function hojeSaoPaulo(agora = new Date()) {
  return FMT_DIA_SP.format(agora);
}

/** Pagamento até hoje (inclusive) = 'pago'; depois = 'aReceber'; sem data = 'semData'. */
export function statusPorData(dataPagamento, hoje) {
  if (!dataPagamento) return 'semData';
  return dataPagamento <= hoje ? 'pago' : 'aReceber';
}

/** Rótulo e explicação de cada situação da conferência (ícone/tooltip). */
export const CONFERENCIA = {
  presumido: { rotulo: 'Pago presumido', dica: 'Pago presumido pela data de pagamento: falta conferir com o extrato da B3.' },
  confirmado: { rotulo: 'Conferido com a B3', dica: 'Conferido com o extrato da B3.' },
  divergente: { rotulo: 'Valor diferente na B3', dica: 'Está no extrato da B3, mas com outro valor.' },
  nao_confirmado: { rotulo: 'Não confirmado', dica: 'O extrato da B3 do mês não trouxe esse provento: pode ter atrasado ou não ter sido pago.' },
};

const ICONE_CONFERENCIA = {
  // relógio (presumido), check (conferido), alerta (valor diferente / não confirmado)
  presumido: ['--ink-faint', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  confirmado: ['--good-ink', '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>'],
  divergente: ['--warn-ink', '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>'],
  nao_confirmado: ['--warn-ink', '<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.3"/>'],
};
const escAttr = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const brl2 = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Texto do tooltip da situação (com os valores da B3 quando diverge). */
export function dicaConferencia(p) {
  const c = CONFERENCIA[p && p.conferencia];
  if (!c) return '';
  if (p.conferencia === 'divergente' && p.valorB3 != null) {
    return `${c.dica} B3: ${brl2(p.valorB3)}${p.dataB3 ? ` em ${p.dataB3.slice(8, 10)}/${p.dataB3.slice(5, 7)}` : ''} · previsto ${brl2(p.valor)}.`;
  }
  return c.dica;
}

/** Ícone discreto (14px, cor pelos tokens) com tooltip; '' quando não há situação (anteriores à conferência). */
export function iconeConferenciaHtml(p, { classe = 'pv-conf' } = {}) {
  const ic = ICONE_CONFERENCIA[p && p.conferencia];
  if (!ic) return '';
  const dica = escAttr(dicaConferencia(p));
  return `<span class="${classe}" title="${dica}" aria-label="${dica}" role="img" style="display:inline-flex;vertical-align:-2px;margin-left:5px;color:var(${ic[0]})"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ic[1]}</svg></span>`;
}

/**
 * Resposta da tela -> mesma resposta com o dia de hoje aplicado:
 * - hoje = o maior entre o do servidor e `hojeLocal` (São Paulo);
 * - a receber com pagamento até hoje vira pago presumido;
 * - pagos não lançados (B3/FNet) entram em `recebidos` (com fonte e
 *   conferencia), menos os 'nao_confirmado', que vão pra `naoConfirmados`
 *   (só na Agenda - o extrato do mês não trouxe).
 * Pode chamar de novo: a 2ª vez não muda nada.
 */
export function normalizarPorData(dados, hojeLocal = hojeSaoPaulo()) {
  if (!dados || dados.porData) return dados;
  const hoje = hojeLocal && hojeLocal > (dados.hoje || '') ? hojeLocal : dados.hoje;
  const aReceber = [];
  const passados = [];
  (dados.aReceber || []).forEach((p) => {
    if (statusPorData(p.dataPagamento, hoje) === 'pago') passados.push({ ...p, conferencia: 'presumido' });
    else aReceber.push(p);
  });
  const pagos = [...(dados.pagosNaoLancados || []).map((p) => ({ ...p, conferencia: p.conferencia || 'presumido' })), ...passados];
  const comoRecebido = (p) => ({
    data: p.dataPagamento, dataCom: p.dataCom || '', ticker: p.ticker, classe: p.classe, tipo: p.tipo, quantidade: p.quantidade,
    valorPorCota: p.valorPorCota, liquido: p.valor, moeda: 'BRL', cambio: null, valor: p.valor, fonte: p.fonte || 'Planilha',
    conferencia: p.conferencia, dataB3: p.dataB3 || '', valorB3: p.valorB3 == null ? null : p.valorB3,
  });
  return {
    ...dados,
    hoje,
    recebidos: [...(dados.recebidos || []), ...pagos.filter((p) => p.conferencia !== 'nao_confirmado').map(comoRecebido)],
    aReceber,
    pagosNaoLancados: [],
    naoConfirmados: [...(dados.naoConfirmados || []), ...pagos.filter((p) => p.conferencia === 'nao_confirmado')],
    porData: true,
  };
}

/**
 * Resumo da conferência pra faixa da tela (dados já normalizados):
 * presumidos (quantos e quanto, contando nos totais), divergentes e não
 * confirmados (da classe escolhida), o último mês conferido e as linhas do
 * extrato que ainda não estão na planilha.
 */
export function resumoConferencia(dados, { classe = 'todas' } = {}) {
  const rec = filtrarClasse(dados.recebidos, classe);
  const presumidos = rec.filter((p) => p.conferencia === 'presumido');
  const conf = dados.conferencia || {};
  const periodos = (conf.periodos || []).slice().sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const naoConfirmados = [
    ...rec.filter((p) => p.conferencia === 'nao_confirmado').map((p) => ({ ticker: p.ticker, classe: p.classe, tipo: p.tipo, dataPagamento: p.data, valor: p.valor, contando: true })),
    ...filtrarClasse(dados.naoConfirmados, classe).map((p) => ({ ticker: p.ticker, classe: p.classe, tipo: p.tipo, dataPagamento: p.dataPagamento, valor: p.valor, contando: false })),
  ].sort((a, b) => (a.dataPagamento < b.dataPagamento ? -1 : 1));
  const divergentes = rec.filter((p) => p.conferencia === 'divergente')
    .map((p) => ({ ticker: p.ticker, classe: p.classe, tipo: p.tipo, dataPagamento: p.data, valor: p.valor, dataB3: p.dataB3, valorB3: p.valorB3, diferenca: p.valorB3 == null ? null : r2(p.valorB3 - p.valor) }))
    .sort((a, b) => (a.dataPagamento < b.dataPagamento ? -1 : 1));
  return {
    presumidos: { quantidade: presumidos.length, total: soma(presumidos) },
    confirmados: rec.filter((p) => p.conferencia === 'confirmado').length,
    divergentes,
    naoConfirmados,
    ultimoPeriodo: periodos.length ? periodos[periodos.length - 1] : null,
    periodos,
    extras: classe === 'todas' ? (conf.extras || []) : [],
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
      moeda: p.moeda || 'BRL', liquido: p.liquido, cambio: p.cambio || null, valor: p.valor, status: 'pago', fonte: p.fonte || 'Planilha',
      conferencia: p.conferencia || null, dataB3: p.dataB3 || '', valorB3: p.valorB3 == null ? null : p.valorB3 });
  });
  filtrarClasse(dados.pagosNaoLancados, classe).forEach((p) => {
    out.push({ ...p, moeda: 'BRL', status: 'naoLancado' });
  });
  // 02/10/2026: anunciados que o extrato da B3 do mês não trouxe (normalizarPorData)
  filtrarClasse(dados.naoConfirmados, classe).forEach((p) => {
    out.push({ ...p, moeda: 'BRL', status: 'naoConfirmado' });
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

export const STATUS_REALIZADO = ['pago', 'naoLancado', 'naoConfirmado'];
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

// ---------------------------------------------------------------------------
// Análise dos proventos mensais (02/10/2026)
// ---------------------------------------------------------------------------
// Tiago: "embaixo do gráfico um card de análise como o das tabelas". O motor
// de assets/js/analise-grafico.js compara séries de CRESCIMENTO com índices;
// pra renda mês a mês a régua é outra (média e o período anterior), então os
// pontos saem daqui, no mesmo formato ({ tom, resumo, pontos }) - quem desenha
// é o mesmo renderAnalise (mesmo visual).

const pctTxt0 = (fracao) => `${Math.abs(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const vezesTxt = (x) => `${x.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`;

/** Soma dos recebidos por mês ('yyyy-MM' -> R$), só o que já foi pago até `hoje`. */
export function proventosPorMes(recebidos, hoje = null, { campoData = 'data' } = {}) {
  const porMes = {};
  (recebidos || []).forEach((p) => {
    const d = p && p[campoData];
    if (typeof d !== 'string' || (hoje && d > hoje) || !Number.isFinite(p.valor)) return;
    const m = d.slice(0, 7);
    porMes[m] = (porMes[m] || 0) + p.valor;
  });
  Object.keys(porMes).forEach((m) => { porMes[m] = r2(porMes[m]); });
  return porMes;
}

const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const rotuloJanela = (meses) => (meses.length === 1 ? rotuloMes(meses[0]) : `${rotuloMes(meses[0])} a ${rotuloMes(meses[meses.length - 1])}`);

/**
 * Pontos de análise de uma janela de meses (a do gráfico):
 *  - comparacao: média dos meses FECHADOS da janela x a média da janela
 *    anterior de mesmo tamanho (quando o histórico cobre ela inteira);
 *  - ultimoMes: o último mês fechado x a média dos 12 meses antes dele;
 *  - regularidade: em quantos meses fechados entrou algum provento;
 *  - pico: um mês que vale 2× a média ou mais (puxa a média pra cima);
 *  - mesAtual: o que já entrou neste mês + o que está anunciado pra ele.
 * `porMes` = proventosPorMes (histórico inteiro); `meses` = janela em ordem;
 * `mesesFechados` = régua da média (padrão: os meses fechados da janela).
 * Sem nada recebido na janela: { pontos: [] } (a tela não mostra o card).
 */
export function analisarProventosMensais({ porMes = {}, meses = [], mesAtual, aReceberMes = 0, mesesFechados = null } = {}) {
  const vazio = { tom: 'neutro', resumo: '', pontos: [] };
  if (!meses.length || !mesAtual) return vazio;
  const val = (m) => porMes[m] || 0;
  const totalJanela = meses.reduce((s, m) => s + val(m), 0);
  if (!(totalJanela > 0)) return vazio;
  const comDado = Object.keys(porMes).filter((m) => porMes[m] > 0).sort();
  const primeiroMes = comDado[0];
  // `mesesFechados` (opcional): a régua de média da tela (ex.: mesesFechadosDoPeriodo,
  // a mesma do cartão "Média mensal") - sem ela, os meses fechados da janela
  const fechadosTodos = (Array.isArray(mesesFechados) && mesesFechados.length ? mesesFechados : meses).filter((m) => m < mesAtual);
  // meses antes do 1º provento não contam na média (a posição nem existia)
  const fechados = fechadosTodos.filter((m) => m >= primeiroMes);
  const pontos = [];

  // 1) média da janela x janela anterior
  let comparacao = null;
  if (fechados.length) {
    const media = fechados.reduce((s, m) => s + val(m), 0) / fechados.length;
    const n = fechados.length;
    const antes = [];
    for (let k = n; k >= 1; k -= 1) antes.push(somarMeses(fechados[0], -k));
    const temAnterior = n >= 2 && primeiroMes <= antes[0];
    if (temAnterior) {
      const mediaAnt = antes.reduce((s, m) => s + val(m), 0) / n;
      const varia = mediaAnt > 0 ? media / mediaAnt - 1 : null;
      if (varia == null) {
        comparacao = { tipo: 'comparacao', tom: 'bom', peso: 60, texto: `Média de ${brl2(media)}/mês em ${rotuloJanela(fechados)} (meses fechados) — no período anterior de mesmo tamanho não tinha entrado nada.`, resumo: `média de ${brl2(media)}/mês` };
      } else {
        const tom = varia >= 0.05 ? 'bom' : (varia <= -0.05 ? 'atencao' : 'neutro');
        const comp = Math.abs(varia) < 0.005 ? 'igual à' : `${pctTxt0(varia)} ${varia > 0 ? 'acima da' : 'abaixo da'}`;
        comparacao = {
          tipo: 'comparacao', tom, peso: 60,
          texto: `Média de ${brl2(media)}/mês em ${rotuloJanela(fechados)} (meses fechados) — ${comp} média dos ${n} meses anteriores (${brl2(mediaAnt)}/mês).`,
          resumo: `média de ${brl2(media)}/mês, ${Math.abs(varia) < 0.005 ? 'estável' : `${varia > 0 ? '+' : '−'}${pctTxt0(varia)}`} vs os ${n} meses antes`,
        };
      }
    } else {
      comparacao = { tipo: 'comparacao', tom: 'neutro', peso: 60, texto: `Média de ${brl2(media)}/mês em ${rotuloJanela(fechados)} (${n} ${n === 1 ? 'mês fechado' : 'meses fechados'}).`, resumo: `média de ${brl2(media)}/mês` };
    }
    pontos.push(comparacao);

    // 2) último mês fechado x média dos 12 anteriores
    const ultimo = fechados[fechados.length - 1];
    const ant12 = [];
    for (let k = 12; k >= 1; k -= 1) { const m = somarMeses(ultimo, -k); if (m >= primeiroMes) ant12.push(m); }
    if (ant12.length >= 3) {
      const media12 = ant12.reduce((s, m) => s + val(m), 0) / ant12.length;
      if (media12 > 0) {
        const v = val(ultimo);
        const varia = v / media12 - 1;
        const rot = ant12.length === 12 ? 'dos 12 meses anteriores' : `dos ${ant12.length} meses anteriores`;
        const tom = varia >= 0.15 ? 'bom' : (varia <= -0.15 ? 'atencao' : 'neutro');
        const texto = v > 0
          ? `Em ${rotuloMes(ultimo)} entraram ${brl2(v)} — ${Math.abs(varia) < 0.005 ? 'igual à' : `${pctTxt0(varia)} ${varia > 0 ? 'acima da' : 'abaixo da'}`} média ${rot} (${brl2(media12)}/mês).`
          : `Em ${rotuloMes(ultimo)} não entrou nenhum provento (média ${rot}: ${brl2(media12)}/mês).`;
        pontos.push({ tipo: 'ultimoMes', tom, peso: Math.abs(varia) >= 0.15 ? 58 : 40, texto, resumo: `${rotuloMes(ultimo)} ${varia >= 0 ? 'acima' : 'abaixo'} da média` });
      }
    }

    // 3) regularidade
    if (fechados.length >= 4) {
      const pagos = fechados.filter((m) => val(m) > 0).length;
      pontos.push(pagos === fechados.length
        ? { tipo: 'regularidade', tom: 'bom', peso: 38, texto: `Entrou provento em todos os ${fechados.length} meses fechados do período — renda regular.`, resumo: 'todo mês' }
        : { tipo: 'regularidade', tom: 'neutro', peso: 36, texto: `Entrou provento em ${pagos} dos ${fechados.length} meses fechados do período${pagos <= fechados.length / 2 ? ' — os pagamentos se concentram em poucos meses' : ''}.`, resumo: `${pagos} de ${fechados.length} meses` });
    }

    // 4) pico
    if (fechados.length >= 4 && media > 0) {
      const maior = fechados.reduce((a, m) => (val(m) > val(a) ? m : a), fechados[0]);
      const x = val(maior) / media;
      if (x >= 2) {
        const semEle = (fechados.reduce((s, m) => s + val(m), 0) - val(maior)) / (fechados.length - 1);
        pontos.push({ tipo: 'pico', tom: 'neutro', peso: 50, texto: `${maiuscula(rotuloMes(maior))} foi fora da curva: ${brl2(val(maior))} (${vezesTxt(x)} a média). Sem ele, a média seria ${brl2(semEle)}/mês.`, resumo: `pico em ${rotuloMes(maior)}` });
      }
    }
  }

  // 5) mês de hoje (parcial)
  if (meses.includes(mesAtual) && (val(mesAtual) > 0 || aReceberMes > 0)) {
    const ja = val(mesAtual);
    pontos.push({
      tipo: 'mesAtual', tom: 'neutro', peso: fechados.length ? 34 : 70,
      texto: `Neste mês (${rotuloMes(mesAtual)}), até agora: ${brl2(ja)} recebidos${aReceberMes > 0 ? ` + ${brl2(aReceberMes)} anunciados a receber` : ''}.`,
      resumo: `${brl2(ja)} neste mês`,
    });
  }

  if (!pontos.length) return vazio;
  const lista = [...pontos].sort((a, b) => (a === comparacao ? -1 : b === comparacao ? 1 : b.peso - a.peso)).slice(0, 4);
  const principal = lista[0];
  const alerta = lista.find((p) => p !== principal && p.tom === 'atencao');
  const resumo = alerta ? `${principal.resumo} · ${alerta.resumo}` : principal.resumo;
  // comparação a favor + um alerta pontual (ex.: o último mês fraco) = neutro, não "atenção"
  const tom = alerta ? (principal.tom === 'bom' ? 'neutro' : 'atencao') : principal.tom;
  return { tom, resumo: maiuscula(resumo), pontos: lista };
}

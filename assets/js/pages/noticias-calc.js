// assets/js/pages/noticias-calc.js
//
// 30/10/2026: contas da tela de Notícias (docs/noticias.md) - puras, sem DOM, testadas em tests/noticias.test.js.
//  - resumo de um índice a partir do gráfico do dia (valor, variação, abertura, máxima, mínima);
//  - "O que mexe com a bolsa" (Brent, minério, ouro, Bitcoin, juro de 10 anos dos EUA);
//  - classificador de notícias por palavras (tema e tom) e os "Possíveis fatores hoje" de um ativo (RF-09, ADR-N7
//    camada 1: só números e regras - sem IA);
//  - agenda (proventos da carteira + Copom, Fed, Focus e feriados da B3);
//  - o feed "Notícias dos seus ativos" (filtro por classe/ativo e ordenação).

/** Índices da tela: id da tela -> chave do gráfico do dia (intradia-yahoo.js) e o que a tela mostra. */
export const INDICES = Object.freeze([
  { id: 'ibov', chave: 'IBOV', nome: 'Ibovespa', curto: 'Ibovespa', editoria: 'Bolsa brasileira', secao: 'Economia e mercado', classe: null, unidade: 'pts' },
  { id: 'ifix', chave: 'IFIX', nome: 'IFIX', curto: 'IFIX', editoria: 'Fundos imobiliários', secao: 'Fundos imobiliários', classe: 'fiis', unidade: 'pts' },
  { id: 'spx', chave: 'SPX', nome: 'S&P 500', curto: 'Exterior', editoria: 'Mercado internacional', secao: 'Mercado internacional', classe: 'acoesEua', unidade: 'pts' },
  { id: 'dolar', chave: 'USD', nome: 'Dólar', curto: 'Dólar', editoria: 'Câmbio', secao: 'Câmbio e juros', classe: null, unidade: 'brl' },
]);

export const TERMOMETRO = Object.freeze([
  { chave: 'BRENT', nome: 'Petróleo Brent', unidade: 'usd' },
  { chave: 'MINERIO', nome: 'Minério de ferro', unidade: 'usd' },
  { chave: 'OURO', nome: 'Ouro', unidade: 'usd' },
  { chave: 'BTC', nome: 'Bitcoin', unidade: 'usd' },
  { chave: 'US10Y', nome: 'Juro 10 anos EUA', unidade: 'taxa' },
]);

export const CLASSES_NOTICIAS = Object.freeze([
  { id: 'todos', nome: 'Todos' },
  { id: 'acoes', nome: 'Ações' },
  { id: 'fiis', nome: 'FIIs' },
  { id: 'acoesEua', nome: 'EUA' },
]);

const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Série do gráfico do dia -> { valor, variacao, anterior, abertura, maxima, minima } (null sem série). */
export function resumoDaSerie(serie) {
  if (!serie || !Array.isArray(serie.v) || !serie.v.length) return null;
  const v = serie.v.filter(num);
  if (!v.length) return null;
  return {
    valor: num(serie.preco) ? serie.preco : v[v.length - 1],
    variacao: num(serie.variacao) ? serie.variacao : null,
    anterior: num(serie.fechamentoAnterior) ? serie.fechamentoAnterior : null,
    abertura: v[0],
    maxima: Math.max(...v),
    minima: Math.min(...v),
    dia: serie.dia || '',
  };
}

/** Juro (^TNX) em pontos percentuais: a variação que importa é em p.p., não em %. */
export function variacaoDoTermometro(item, serie) {
  const r = resumoDaSerie(serie);
  if (!r) return null;
  if (item.unidade === 'taxa') return { ...r, pp: r.anterior != null ? r.valor - r.anterior : null };
  return r;
}

// ---------------------------------------------------------------------------
// Classificador de notícias (tema e tom) - palavras em português, título só.
// ---------------------------------------------------------------------------
const TEMAS = [
  ['resultado', /(lucro|preju[ií]zo|balan[çc]o|resultado|receita|ebitda|trimestre|\b[1-4]t\d{2}\b|guidance)/i],
  ['dividendos', /(dividend|\bjcp\b|juros sobre (o )?capital|proventos?|rendimentos?\b|distribui[çc][aã]o)/i],
  ['recomendação', /(recomenda|pre[çc]o[- ]alvo|rebaix|eleva .*(recomenda|pre[çc]o)|overweight|underweight|outperform|carteira recomendada)/i],
  ['fato relevante', /(fato relevante|comunicado ao mercado|aquisi[çc][aã]o|fus[aã]o|incorpora[çc]|emiss[aã]o de cotas|\boferta\b|follow-on|\bipo\b|recompra|venda de (ativo|im[oó]vel))/i],
  ['política', /(governo|planalto|congresso|\bstf\b|pol[ií]tic|interven[çc]|minist[eé]rio|elei[çc])/i],
  ['macro', /(selic|copom|\bipca\b|infla[çc][aã]o|juros|\bfed\b|\bpib\b|d[oó]lar|c[aâ]mbio|fiscal)/i],
];
const POSITIVO = /(\bsob(e|em)\b|\bsubir\b|\balta\b|dispara|salta|avan[çc]a|recorde|supera|\beleva\b|aprova|\bganha|melhora|otimis|valoriza|cresce|\bforte\b|lucro (sobe|cresce|avan)|extraordin|recompra|compra\b)/i;
const NEGATIVO = /(\bca(i|em)\b|queda|despenca|recua|tomba|\bperde|preju[ií]zo|rebaix|piora|\bfraco|abaixo do esperado|frustra|\bcorta|suspende|investiga|\bmulta|pessimis|desvaloriza|derrete|\bvenda\b|crise|rombo)/i;

export function classificarNoticia(titulo) {
  const t = String(titulo || '');
  const tema = (TEMAS.find(([, re]) => re.test(t)) || ['setor'])[0];
  const p = POSITIVO.test(t);
  const n = NEGATIVO.test(t);
  return { tema, tom: p && !n ? 'positivo' : n && !p ? 'negativo' : 'neutro' };
}

// ---------------------------------------------------------------------------
// Possíveis fatores hoje (RF-09) - camada 1 do ADR-N7: números do dia + notícias classificadas.
// ---------------------------------------------------------------------------
/** Ativo -> commodity da faixa "O que mexe com a bolsa" que costuma andar junto (ticker ou setor da carteira). */
const FATOR_POR_TICKER = {
  PETR3: 'BRENT', PETR4: 'BRENT', PRIO3: 'BRENT', RECV3: 'BRENT', BRAV3: 'BRENT', RRRP3: 'BRENT', CSAN3: 'BRENT', UGPA3: 'BRENT', VBBR3: 'BRENT',
  VALE3: 'MINERIO', CMIN3: 'MINERIO', GGBR4: 'MINERIO', GOAU4: 'MINERIO', CSNA3: 'MINERIO', USIM5: 'MINERIO',
};
export function fatorSetorialDe(ativo) {
  const t = String((ativo && ativo.ticker) || '').toUpperCase();
  if (FATOR_POR_TICKER[t]) return FATOR_POR_TICKER[t];
  const g = String((ativo && ativo.grupo) || '');
  if (/petr[oó]leo|g[aá]s/i.test(g)) return 'BRENT';
  if (/minera|sider/i.test(g)) return 'MINERIO';
  if (/ouro/i.test(g)) return 'OURO';
  return null;
}

const ORDEM_PESO = { forte: 0, médio: 1, fraco: 2 };
const sinalDe = (x) => (!num(x) || Math.abs(x) < 1e-9 ? '=' : x > 0 ? '+' : '−');

/** Dia útil anterior (seg -> sex) de 'aaaa-mm-dd'. Feriado não entra (a data-com de feriado é rara e o erro é pequeno). */
export function diaUtilAnterior(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() - 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/**
 * { itens: [{ sinal, titulo, detalhe, peso, tipo }], resumo } ou null (sem variação do ativo).
 * entrada: { ativo: { ticker, classe, variacaoDia, precoAtual, grupo }, indice: { nome, variacao }, termometro: { BRENT: {variacao}... },
 *   dolar: variação do dólar, proventos: [{ ticker, dataCom, valorPorCota }], noticias: [{ titulo, data, fonte }], hojeISO, agoraMs, fmt }
 * fmt: { pct(fração) -> '+1,2%', brl(valor) } - quem chama passa os formatadores de format.js.
 */
export function possiveisFatores({ ativo, indice, termometro = {}, dolar = null, proventos = [], noticias = [], hojeISO, agoraMs = Date.now(), fmt }) {
  const v = ativo && ativo.variacaoDia;
  if (!num(v)) return null;
  const itens = [];
  const pct = fmt.pct;
  // 1. o mercado
  if (indice && num(indice.variacao)) {
    const dif = v - indice.variacao;
    if (Math.abs(dif) < 0.005) {
      itens.push({ tipo: 'mercado', sinal: sinalDe(indice.variacao), titulo: `Acompanhou o mercado (${indice.nome} ${pct(indice.variacao)})`, detalhe: `Diferença de ${fmt.pp(dif)} para o índice.`, peso: Math.abs(indice.variacao) >= 0.015 ? 'forte' : Math.abs(indice.variacao) >= 0.005 ? 'médio' : 'fraco', forca: Math.abs(indice.variacao) });
    } else {
      const parte = Math.abs(v) > 1e-9 && Math.sign(indice.variacao) === Math.sign(v) ? Math.abs(indice.variacao) / Math.abs(v) : 0;
      itens.push({ tipo: 'mercado', sinal: sinalDe(indice.variacao), titulo: `O mercado (${indice.nome} ${pct(indice.variacao)})`, detalhe: parte ? `Explica cerca de ${Math.round(Math.min(parte, 1) * 100)}% do movimento.` : 'Foi para o outro lado do ativo.', peso: parte >= 0.6 ? 'forte' : parte >= 0.3 ? 'médio' : 'fraco', forca: Math.abs(indice.variacao) * (parte || 0.2) });
      itens.push({ tipo: 'proprio', sinal: sinalDe(dif), titulo: `Movimento próprio: ${fmt.pp(dif)} ${dif > 0 ? 'acima' : 'abaixo'} do ${indice.nome}`, detalhe: 'O que o índice não explica - veja as notícias e eventos abaixo.', peso: Math.abs(dif) >= 0.02 ? 'forte' : Math.abs(dif) >= 0.008 ? 'médio' : 'fraco', forca: Math.abs(dif) * 0.9 });
    }
  }
  // 2. setor / commodity
  const chaveFator = fatorSetorialDe(ativo);
  const tf = chaveFator && termometro[chaveFator];
  if (tf && num(tf.variacao)) {
    const junto = Math.sign(tf.variacao) === Math.sign(v);
    itens.push({ tipo: 'setor', sinal: sinalDe(tf.variacao), titulo: `${tf.nome || chaveFator} ${pct(tf.variacao)}`, detalhe: junto ? 'O preço da commodity costuma puxar o ativo.' : 'Foi contra o ativo hoje: pesa pouco.', peso: junto && Math.abs(tf.variacao) >= 0.015 ? 'forte' : junto && Math.abs(tf.variacao) >= 0.005 ? 'médio' : 'fraco', forca: junto ? Math.abs(tf.variacao) : 0 });
  }
  // 3. data-com ontem: a cota fica "ex" hoje e cai mais ou menos o valor do provento
  const ontem = hojeISO ? diaUtilAnterior(hojeISO) : '';
  const prov = (proventos || []).find((p) => String(p.ticker || '').toUpperCase() === String(ativo.ticker).toUpperCase() && p.dataCom === ontem && num(p.valorPorCota));
  if (prov) {
    const queda = num(ativo.precoAtual) && ativo.precoAtual > 0 ? prov.valorPorCota / (ativo.precoAtual + prov.valorPorCota) : null;
    const explica = v < 0 && queda != null && queda >= Math.abs(v) * 0.5;
    itens.push({ tipo: 'provento', sinal: '−', titulo: `Data-com ontem (${fmt.brl(prov.valorPorCota)} por cota)`, detalhe: queda != null ? `Hoje a cota negocia sem o provento: ${pct(-queda)} esperado só por isso.` : 'Hoje a cota negocia sem o provento.', peso: explica ? 'forte' : 'médio', forca: explica ? 1 : (queda || 0) });
  }
  // 4. dólar (ativo dos EUA, visto em reais)
  if (ativo.classe === 'acoesEua' && num(dolar) && Math.abs(dolar) >= 0.002) {
    itens.push({ tipo: 'dolar', sinal: sinalDe(dolar), titulo: `Dólar ${pct(dolar)}`, detalhe: 'Em reais, o ativo também anda com o câmbio.', peso: Math.abs(dolar) >= 0.01 ? 'médio' : 'fraco', forca: Math.abs(dolar) * 0.8 });
  }
  // 5. notícias das últimas 24 h, por tema e tom
  const relevantes = ['resultado', 'fato relevante', 'dividendos', 'recomendação'];
  (noticias || []).filter((n) => { const t = Date.parse(n.data || ''); return Number.isFinite(t) && agoraMs - t <= 24 * 3600e3; }).slice(0, 4).forEach((n) => {
    const c = classificarNoticia(n.titulo);
    const sinal = c.tom === 'positivo' ? '+' : c.tom === 'negativo' ? '−' : '=';
    const aFavor = (sinal === '+' && v > 0) || (sinal === '−' && v < 0);
    const peso = aFavor && relevantes.includes(c.tema) ? (Math.abs(v) >= 0.02 ? 'forte' : 'médio') : aFavor ? 'médio' : 'fraco';
    itens.push({ tipo: 'noticia', sinal, titulo: n.titulo, detalhe: `Notícia · ${c.tema} · ${n.fonte || 'fonte'}`, peso, forca: aFavor ? Math.abs(v) * 0.5 : 0, link: n.link || '' });
  });
  itens.sort((a, b) => ORDEM_PESO[a.peso] - ORDEM_PESO[b.peso] || b.forca - a.forca);
  return { itens: itens.map(({ forca, ...x }) => x), resumo: resumoDosFatores(ativo, v, itens, indice, pct) };
}

function resumoDosFatores(ativo, v, itens, indice, pct) {
  const t = String(ativo.ticker).toUpperCase();
  const mov = `${t} ${v > 0 ? 'sobe' : v < 0 ? 'cai' : 'fica estável'} ${pct(v)} hoje`;
  const top = itens[0];
  if (!top) return `${mov}.`;
  const semNoticia = !itens.some((i) => i.tipo === 'noticia');
  if (top.tipo === 'mercado' && /^Acompanhou/.test(top.titulo)) return `${mov}: acompanhou o mercado (${indice.nome} ${pct(indice.variacao)})${semNoticia ? ', sem notícia própria no dia' : ''}.`;
  if (top.tipo === 'provento') return `${mov}: a maior parte é o provento que saiu da cota (data-com ontem).`;
  if (top.tipo === 'proprio') return `${mov}, ${top.titulo.replace(/^Movimento próprio: /, '')}${semNoticia ? ' - sem notícia que explique' : ''}.`;
  if (top.tipo === 'noticia') return `${mov}; a notícia mais ligada ao movimento: "${top.titulo}".`;
  return `${mov}; o principal fator possível: ${top.titulo.charAt(0).toLowerCase()}${top.titulo.slice(1)}.`;
}

// ---------------------------------------------------------------------------
// Agenda (RF-06): proventos da carteira + datas do mercado.
// ---------------------------------------------------------------------------
/** Datas fixas do mercado. Copom e Fed: calendários oficiais divulgados pelo BC e pelo Fed para 2026. */
export const EVENTOS_MERCADO = Object.freeze([
  { dia: '2026-11-03', titulo: 'Copom: 1º dia', detalhe: 'Reunião de juros (Selic)', tag: 'macro' },
  { dia: '2026-11-04', hora: '18h30', titulo: 'Copom: decisão da Selic', detalhe: 'Banco Central', tag: 'macro' },
  { dia: '2026-12-08', titulo: 'Copom: 1º dia', detalhe: 'Reunião de juros (Selic)', tag: 'macro' },
  { dia: '2026-12-09', hora: '18h30', titulo: 'Copom: decisão da Selic', detalhe: 'Banco Central', tag: 'macro' },
  { dia: '2026-12-09', hora: '16h00', titulo: 'Fed: decisão de juros (FOMC)', detalhe: 'Estados Unidos', tag: 'exterior' },
  { dia: '2026-11-02', titulo: 'B3 fechada (Finados)', detalhe: 'Sem pregão', tag: 'feriado' },
  { dia: '2026-11-20', titulo: 'B3 fechada (Consciência Negra)', detalhe: 'Sem pregão', tag: 'feriado' },
  { dia: '2026-12-24', titulo: 'B3 fechada (Véspera de Natal)', detalhe: 'Sem pregão', tag: 'feriado' },
  { dia: '2026-12-25', titulo: 'B3 fechada (Natal)', detalhe: 'Sem pregão', tag: 'feriado' },
  { dia: '2026-12-31', titulo: 'B3 fechada (último dia do ano)', detalhe: 'Sem pregão', tag: 'feriado' },
]);

function somarDias(iso, n) { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/**
 * Grupos da agenda: [{ grupo: 'Hoje' | 'Amanhã' | 'dd/mm', itens: [{ quando, titulo, detalhe, tag, valor }] }].
 * proventos: os itens a receber da tela Proventos ({ ticker, dataCom, dataPagamento, valorPorCota, valor, moeda }).
 * periodo: 'hoje' (só hoje) | 'semana' (hoje + 6 dias). Focus: toda segunda, 8h25.
 */
export function agenda({ proventos = [], eventos = EVENTOS_MERCADO, hojeISO, periodo = 'hoje', fmtDM, fmtValor }) {
  const fim = periodo === 'semana' ? somarDias(hojeISO, 6) : hojeISO;
  const dentro = (d) => d && d >= hojeISO && d <= fim;
  const itens = [];
  (proventos || []).forEach((p) => {
    if (dentro(p.dataCom)) itens.push({ dia: p.dataCom, quando: 'com', titulo: `${p.ticker}: data-com`, detalhe: num(p.valorPorCota) ? `${fmtValor(p.valorPorCota, p.moeda)} por cota · na sua carteira` : 'na sua carteira', tag: 'carteira' });
    if (dentro(p.dataPagamento)) itens.push({ dia: p.dataPagamento, quando: 'pgto', titulo: `${p.ticker}: pagamento`, detalhe: num(p.valor) ? `${fmtValor(p.valor, p.moeda)} · na sua carteira` : 'na sua carteira', tag: 'carteira' });
  });
  (eventos || []).forEach((e) => { if (dentro(e.dia)) itens.push({ dia: e.dia, quando: e.hora || '', titulo: e.titulo, detalhe: e.detalhe, tag: e.tag }); });
  for (let d = hojeISO; d <= fim; d = somarDias(d, 1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() === 1) itens.push({ dia: d, quando: '8h25', titulo: 'Boletim Focus', detalhe: 'Projeções do mercado (BC)', tag: 'macro' });
  }
  const ordemTag = { carteira: 0, macro: 1, exterior: 2, feriado: 3 };
  itens.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : (ordemTag[a.tag] ?? 9) - (ordemTag[b.tag] ?? 9)));
  const grupos = [];
  itens.forEach((it) => {
    const nome = it.dia === hojeISO ? 'Hoje' : it.dia === somarDias(hojeISO, 1) ? 'Amanhã' : fmtDM(it.dia);
    let g = grupos[grupos.length - 1];
    if (!g || g.grupo !== nome) { g = { grupo: nome, itens: [] }; grupos.push(g); }
    const { dia, ...resto } = it;
    g.itens.push(resto);
  });
  return grupos;
}

// ---------------------------------------------------------------------------
// Feed "Notícias dos seus ativos" (RF-07)
// ---------------------------------------------------------------------------
/** ativos da carteira (as 3 classes) com as notícias: [{ ticker, classe, ... , noticias }] */
export function ativosComNoticias(carteira, porTicker) {
  return (carteira || []).map((a) => ({ ...a, noticias: (porTicker && porTicker[String(a.ticker).toUpperCase()]) || [] }));
}

/** Itens do feed: [{ ticker, classe, titulo, link, data, fonte, resumo }]. ordem: 'recentes' | 'posicao' | 'variacao'. */
export function feedDosAtivos(ativos, { classe = 'todos', ticker = null, ordem = 'recentes', max = 30 } = {}) {
  let lista = (ativos || []).filter((a) => (classe === 'todos' || a.classe === classe) && (!ticker || a.ticker === ticker));
  if (ordem === 'posicao') lista = lista.slice().sort((a, b) => (b.totalAtualizado || 0) - (a.totalAtualizado || 0));
  if (ordem === 'variacao') lista = lista.slice().sort((a, b) => Math.abs(b.variacaoDia || 0) - Math.abs(a.variacaoDia || 0));
  const itens = [];
  lista.forEach((a, i) => a.noticias.forEach((n) => itens.push({ ...n, ticker: a.ticker, classe: a.classe, _ordem: i })));
  if (ordem === 'recentes') itens.sort((a, b) => (Date.parse(b.data || '') || 0) - (Date.parse(a.data || '') || 0));
  else itens.sort((a, b) => a._ordem - b._ordem || (Date.parse(b.data || '') || 0) - (Date.parse(a.data || '') || 0));
  return itens.slice(0, max).map(({ _ordem, ...x }) => x);
}

/** "há 5 min" / "há 3 h" / "ontem" / "dd/mm" de um ISO. */
export function haQuanto(iso, agoraMs, fmtDM) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((agoraMs - t) / 60000));
  if (min < 60) return `há ${Math.max(1, min)} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  if (min < 48 * 60) return 'ontem';
  return fmtDM(iso);
}

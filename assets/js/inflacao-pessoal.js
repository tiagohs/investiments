/**
 * inflacao-pessoal.js - 28/10/2026 (Tiago, depois da live da Suno sobre "confisco inflacionário": "quero ainda o IPCA real lá,
 * mas em paralelo, quero essa ideia do IPCA real" - a minha inflação). Conta PURA (sem DOM), a mesma em todas as telas.
 *
 *   minha inflação = Σ (peso da despesa no gasto do mês × inflação do índice dela)
 *
 * Cada despesa da aba Despesas Essenciais segue um índice do catálogo (InflacaoPessoal.gs): um item do IPCA (energia,
 * condomínio, supermercado...), 'fixo' (parcela que não muda - não sobe com a inflação), 'tr' (financiamento corrigido pela
 * TR) ou 'ipca' (o geral, pra despesas variadas como a fatura do cartão). Sem índice escolhido, vale a sugestão pelo nome/
 * categoria (sugerirIndice). Pesos = valor por mês de hoje (anual ÷ 12), fixos no período (cesta de hoje).
 * As séries vêm em fração por mês ({ 'aaaa-mm': 0,0082 }). Testes: tests/inflacao-pessoal.test.js.
 */

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Ordem importa: "IFood Assinatura" é assinatura antes de ser alimentação; "Parcela Apartamento" é financiamento antes de parcela. */
const REGRAS = [
  ['tr', /apartamento|financiamento|imovel|casa propria|\bape\b/],
  ['fixo', /\bfies\b|emprestimo|consignado|consorcio|parcela|prestacao|divida/],
  ['condominio', /condominio/],
  ['aluguel', /aluguel/],
  ['energia', /\bluz\b|energia|eletric/],
  ['agua', /\bagua\b|saneamento|esgoto|sabesp|cedae|copasa|embasa/],
  ['gasEncanado', /\bgas\b/],
  ['internet', /internet|wi-?fi|fibra|\bcombo\b|\btv\b/],
  ['celular', /celular|telefone|\bchip\b|plano movel/],
  ['streaming', /assinatura|streaming|netflix|spotify|youtube|\bdrive\b|icloud|disney|\bprime\b|\bhbo\b|\bmax\b|globoplay|deezer|chatgpt|google one|apple/],
  ['aplicativo', /\buber\b|\b99\b|cabify/],
  ['gasolina', /gasolina|combustivel|etanol|\bposto\b/],
  ['transportePublico', /onibus|metro|bilhete unico|\btrem\b/],
  ['seguroAuto', /seguro (do )?(carro|auto)/],
  ['alimentacaoFora', /restaurante|ifood|delivery|lanche|almoco|marmita/],
  ['alimentacaoCasa', /supermercado|mercado|feira|hortifruti|acougue|padaria|sacolao/],
  ['empregadoDomestico', /diarista|faxin|empregad|baba|domestic/],
  ['planoSaude', /plano de saude|unimed|amil|sulamerica|hapvida|notredame/],
  ['remedios', /farmacia|remedio|drogaria|medicament/],
  ['consultas', /consulta|medico|dentista|psicolog|terapia|exame/],
  ['academia', /academia|smart ?fit|crossfit|pilates|musculacao/],
  ['cursosLivres', /ingles|idioma|espanhol/],
  ['cursos', /faculdade|escola|mensalidade escolar|curso|pos-?graduacao|creche/],
  ['animal', /\bpet\b|racao|veterinar/],
  ['vestuario', /roupa|vestuario|calcado|tenis/],
  ['viagem', /viagem|hotel|hospedagem|airbnb/],
  ['recreacao', /lazer|cinema|show|teatro/],
];
const POR_CATEGORIA = {
  'Dívidas e parcelas': 'fixo', Alimentação: 'alimentacaoCasa', Transporte: 'transportes', Saúde: 'saude', Educação: 'educacao',
  Assinaturas: 'streaming',
};

/** Índice sugerido pra uma despesa ({ nome, categoria }). Nada reconhecido = 'ipca' (o geral). */
export function sugerirIndice({ nome = '', categoria = '' } = {}) {
  const t = semAcento(nome);
  const r = REGRAS.find(([, re]) => re.test(t));
  if (r) return r[0];
  return POR_CATEGORIA[String(categoria || '').trim()] || 'ipca';
}

/** Valor por mês da despesa (anual ÷ 12). */
export const porMes = (it) => (num(it && it.valor) ? (String(it.frequencia || '').toLowerCase().startsWith('anual') ? it.valor / 12 : it.valor) : 0);

/** 'aaaa-mm' + n meses. */
export function somarMesesIso(mes, n) {
  const [a, m] = String(mes).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Os n meses que terminam em `ate` (inclusive), do mais antigo pro mais novo. */
export function mesesAte(ate, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(somarMesesIso(ate, -i));
  return out;
}

export const composto = (taxas) => (taxas || []).reduce((acc, t) => acc * (1 + (num(t) ? t : 0)), 1) - 1;

/**
 * Taxa de um índice num mês: 'fixo' = 0; sem dado no índice = a do IPCA geral (estimada); sem IPCA = null.
 * { taxa, estimada }
 */
export function taxaDoMes(series, id, mes) {
  if (id === 'fixo') return { taxa: 0, estimada: false };
  const s = series && series[id];
  if (s && num(s[mes])) return { taxa: s[mes], estimada: false };
  const g = series && series.ipca;
  if (g && num(g[mes])) return { taxa: g[mes], estimada: id !== 'ipca' };
  return { taxa: null, estimada: true };
}

/** O índice de cada despesa: o escolhido (mapa) ou o sugerido. */
export function indiceDaDespesa(it, mapa = {}) {
  const escolhido = mapa && mapa[it.nome];
  return escolhido ? { indice: escolhido, sugerido: false } : { indice: sugerirIndice(it), sugerido: true };
}

/**
 * A conta inteira. `dados` = resposta do GET inflacaoPessoal ({ catalogo, series, ultimoMes, cesta: { itens, mapa } });
 * `itens`/`mapa` podem vir de fora (o rascunho da tela de Despesas). `meses` = janela (12).
 * Devolve null sem IPCA. {
 *   periodo: { de, ate, meses }, minha, ipca, diferencaPp, total (R$/mês), impactoMensal, impactoIpca,
 *   porItem: [{ nome, mensal, peso, indice, rotulo, sugerido, variacao, contribuicao, estimada }],
 *   grupos: { fixo, tr, precos } (peso de cada um), semParcelas (a inflação só do que acompanha preços),
 *   mensal: [{ mes, minha, ipca }] (a janela inteira das séries), acumulado12: [{ mes, minha, ipca }] (12 meses móveis)
 * }
 */
export function calcularMinhaInflacao(dados, { itens = null, mapa = null, meses = 12 } = {}) {
  const d = dados || {};
  const series = d.series || {};
  const ate = d.ultimoMes || (series.ipca ? Object.keys(series.ipca).sort().pop() : null);
  if (!ate || !series.ipca) return null;
  const lista = (itens || (d.cesta && d.cesta.itens) || []).filter((it) => it && String(it.nome || '').trim() && porMes(it) > 0);
  const escolhas = mapa || (d.cesta && d.cesta.mapa) || {};
  const rotulos = Object.fromEntries((d.catalogo || []).map((c) => [c.id, c.rotulo]));
  const total = lista.reduce((s, it) => s + porMes(it), 0);
  const janela = mesesAte(ate, meses);
  const ipca = composto(janela.map((m) => taxaDoMes(series, 'ipca', m).taxa));
  const porItem = lista.map((it) => {
    const { indice, sugerido } = indiceDaDespesa(it, escolhas);
    const taxas = janela.map((m) => taxaDoMes(series, indice, m));
    const variacao = composto(taxas.map((t) => t.taxa));
    const mensal = porMes(it);
    const peso = total > 0 ? mensal / total : 0;
    return { nome: it.nome, categoria: it.categoria || '', mensal, peso, indice, rotulo: rotulos[indice] || indice, sugerido, variacao, contribuicao: peso * variacao, estimada: taxas.some((t) => t.estimada) };
  });
  const minha = porItem.reduce((s, p) => s + p.contribuicao, 0);
  const peso = (f) => porItem.filter(f).reduce((s, p) => s + p.peso, 0);
  const precos = porItem.filter((p) => p.indice !== 'fixo' && p.indice !== 'tr');
  const pesoPrecos = precos.reduce((s, p) => s + p.peso, 0);
  // série mensal da janela toda das séries (pesos de hoje) e o acumulado em 12 meses móveis
  const todos = Object.keys(series.ipca).sort();
  const mensal = todos.map((m) => ({
    mes: m,
    minha: porItem.reduce((s, p) => s + p.peso * (taxaDoMes(series, p.indice, m).taxa || 0), 0),
    ipca: series.ipca[m],
  }));
  // 12 meses móveis do jeito do KPI (cesta fixa de hoje): Σ peso × (inflação acumulada de cada índice na janela)
  const acumulado12 = todos.slice(11).map((m, i) => {
    const jan = todos.slice(i, i + 12);
    return {
      mes: m,
      minha: porItem.reduce((s, p) => s + p.peso * composto(jan.map((x) => taxaDoMes(series, p.indice, x).taxa)), 0),
      ipca: composto(jan.map((x) => series.ipca[x])),
    };
  });
  return {
    periodo: { de: janela[0], ate, meses },
    minha, ipca, diferencaPp: (minha - ipca) * 100,
    total, impactoMensal: porItem.reduce((s, p) => s + p.mensal * p.variacao, 0), impactoIpca: total * ipca,
    porItem: porItem.sort((a, b) => b.mensal - a.mensal),
    grupos: { fixo: peso((p) => p.indice === 'fixo'), tr: peso((p) => p.indice === 'tr'), precos: pesoPrecos },
    semParcelas: pesoPrecos > 0 ? precos.reduce((s, p) => s + p.peso * p.variacao, 0) / pesoPrecos : null,
    mensal, acumulado12,
    estimada: porItem.some((p) => p.estimada),
  };
}

/** Ganho real: (1 + rendimento × (1 − IR)) ÷ (1 + inflação) − 1. Frações. */
export function ganhoReal(rendimento, inflacao, ir = 0) {
  if (!num(rendimento) || !num(inflacao)) return null;
  return (1 + rendimento * (1 - (num(ir) ? ir : 0))) / (1 + inflacao) - 1;
}

/** Valor de hoje corrigido por uma taxa anual por `meses` meses. */
export function corrigir(valor, taxaAnual, meses) {
  if (!num(valor) || !num(taxaAnual) || !num(meses)) return null;
  return valor * (1 + taxaAnual) ** (Math.max(0, meses) / 12);
}

/**
 * Retorno mínimo exigido (Tiago/Suno: "o custo de oportunidade precisa ser acima da sua inflação"): o líquido precisa repor
 * a inflação e ainda dar o prêmio; o bruto ainda paga o IR. { liquido, bruto }.
 */
export function retornoMinimo(inflacao, premio, ir = 0) {
  if (!num(inflacao) || !num(premio)) return null;
  const liquido = (1 + inflacao) * (1 + premio) - 1;
  return { liquido, bruto: ir > 0 && ir < 1 ? liquido / (1 - ir) : liquido };
}

/**
 * Dólar de equilíbrio em 12 meses (quanto o dólar precisa valer pra empatar com o CDI): o real rende o CDI líquido; o dólar
 * rende o juro em dólar (T-bill) líquido. dólar hoje × (1 + CDI × (1 − IR)) ÷ (1 + juro US$ × (1 − IR)).
 */
export function dolarEquilibrio({ dolar, cdi, juroUsd = 0, ir = 0.15 } = {}) {
  if (!num(dolar) || !(dolar > 0) || !num(cdi)) return null;
  const j = num(juroUsd) ? juroUsd : 0;
  const valor = dolar * (1 + cdi * (1 - ir)) / (1 + j * (1 - ir));
  return { valor, alta: valor / dolar - 1 };
}

/**
 * O retorno mínimo da resposta do GET inflacaoPessoal (a minha inflação de 12 meses + o prêmio da config).
 * { liquido, inflacao, premio, ipca } ou null.
 */
export function pisoDaResposta(resp) {
  const c = resp && resp.ok !== false ? calcularMinhaInflacao(resp) : null;
  if (!c) return null;
  const premio = resp.config && num(resp.config.premio) ? resp.config.premio : 0.05;
  const m = retornoMinimo(c.minha, premio);
  return { liquido: m.liquido, inflacao: c.minha, premio, ipca: c.ipca, pisoIpca: retornoMinimo(c.ipca, premio).liquido };
}

/**
 * 28/10/2026 (Tiago: "na home, de forma muito sucinta, abaixo dos três cards: minha inflação real vs a do IBGE, e se tô bem ou
 * não"). Uma linha para a Início, a partir da resposta de getInflacaoPessoal (a cesta salva). null = sem dado.
 * tom: bom (abaixo do IPCA), neutro (±0,25 p.p.) ou ruim (acima) - o mesmo limiar do veredito da tela de Despesas.
 */
export function resumoInflacaoHome(resp) {
  const c = resp && resp.ok !== false ? calcularMinhaInflacao(resp) : null;
  if (!c || !num(c.minha) || !num(c.ipca)) return null;
  const dif = c.minha - c.ipca;
  const tom = dif <= -0.0025 ? 'bom' : (dif < 0.0025 ? 'neutro' : 'ruim');
  let texto = tom === 'bom' ? 'Você está bem: o seu custo de vida sobe menos que o IPCA.'
    : tom === 'neutro' ? 'O seu custo de vida sobe no ritmo do IPCA.'
      : 'Atenção: o seu custo de vida sobe mais que o IPCA.';
  const g = c.grupos || {};
  const pct = (v) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  if (tom === 'bom' && num(c.semParcelas) && c.semParcelas - c.ipca >= 0.0025 && (g.tr || 0) + (g.fixo || 0) >= 0.2) {
    texto += ` Sem as parcelas, seria ${pct(c.semParcelas)}.`;
  }
  return { tom, minha: c.minha, ipca: c.ipca, rotuloMinha: pct(c.minha), rotuloIpca: pct(c.ipca), texto };
}

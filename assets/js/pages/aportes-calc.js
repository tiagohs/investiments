// assets/js/pages/aportes-calc.js
//
// 26/09/2026: contas da aba "Aportes" da tela Transações (o "carrinho de
// compra" do dia de aporte). Puro, sem DOM: testado em tests/aportes-calc.test.js.
//
// Carrinho: { editandoId, data, observacao, itens: { 'classe:ativo': item } }
//  - ação/FII/EUA: { classe, ativo, moeda, qtd, preco } (preço = cotação na hora)
//  - renda fixa: { classe: 'rendaFixa', ativo (título), instituicao, valor }
// Aporte (o que vai pra planilha, aux_aportes): { id, data, status, observacao,
// itens: [{ classe, ativo, instituicao, moeda, qtdPlanejada, precoPlanejado,
// valorPlanejado, qtdFinal, precoFinal, valorFinal }] }.

// 03/10/2026: motor de critérios (nota/eliminatórios), preço x preço médio e metas de Metas e Objetivos
import { avaliarAtivo, sinalPrecoMedio, sinaisDeMetas, sinaisRendaFixaMeta } from '../criterios/motor.js';
// 05/10/2026: contexto de mercado (juro real, termômetro da bolsa, NTN-B) - peso pequeno e limitado
import { sinaisMacro, LIMITE_PONTOS_MACRO } from '../criterios/macro.js';
import { puDoTitulo } from './aportes-rf-calc.js';
import { DESTINO_EMERGENCIAL, DESTINO_OBJETIVO, destinoRendaFixa } from '../destino-renda-fixa.js'; // 07/10/2026: destino único do título de Renda Fixa
import { formatUSD, formatNumeroPt, MESES_CURTOS, MESES_LONGOS, formatPct, formatBRL0, formatBRL } from '../format.js';

export const CLASSES_APORTE = [
  { id: 'acoes', nome: 'Ações', curto: 'Ações', cor: '--acoes' },
  { id: 'fiis', nome: 'FIIs', curto: 'FIIs', cor: '--fiis' },
  { id: 'acoesEua', nome: 'Ações EUA', curto: 'EUA', cor: '--usa' },
  { id: 'rendaFixa', nome: 'Renda Fixa', curto: 'RF', cor: '--rf' },
];
export const NOME_CLASSE_APORTE = Object.fromEntries(CLASSES_APORTE.map((c) => [c.id, c.nome]));


// 05/10/2026: as contas puras do carrinho (pôr/tirar item, totais, validar o que
// veio do navegador) moraram aqui até agora; foram pra ../carrinho-global.js
// porque o header de todas as telas também lê o carrinho. Reexportadas aqui.
import {
  chaveItem, carrinhoVazio, carrinhoValido, definirQuantidade, definirValorRf, removerDoCarrinho,
  valorItemCarrinho, itensDoCarrinho, totaisCarrinho,
} from '../carrinho-global.js';

export {
  chaveItem, carrinhoVazio, carrinhoValido, definirQuantidade, definirValorRf, removerDoCarrinho,
  valorItemCarrinho, itensDoCarrinho, totaisCarrinho,
};

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

/** Atualiza o preço de cada item com a cotação de agora (a prateleira é dinâmica). */
export function atualizarPrecos(carrinho, classes) {
  const itens = {};
  Object.entries(carrinho.itens).forEach(([k, it]) => {
    if (it.classe === 'rendaFixa') {
      // 05/10/2026: Tesouro por quantidade: valor = qtd × PU de hoje (a lista traz a cotação do dia)
      const t = it.qtd > 0 && it.pu > 0 ? ((classes && classes.rendaFixa) || []).find((x) => x.titulo === it.ativo && (x.instituicao || '') === (it.instituicao || '')) : null;
      const pu = t ? puDoTitulo(t) : null;
      itens[k] = pu > 0 ? { ...it, pu, valor: arred(it.qtd * pu, 2) } : it;
      return;
    }
    const a = ((classes && classes[it.classe]) || []).find((x) => x.ticker === it.ativo);
    itens[k] = a && num(a.precoAtual) > 0 ? { ...it, preco: a.precoAtual } : it;
  });
  return { ...carrinho, itens };
}

/** Carrinho -> aporte "aguardando valores finais" (o que vai pra planilha). */
export function aporteDoCarrinho(carrinho) {
  return {
    id: carrinho.editandoId || undefined,
    data: carrinho.data,
    status: 'aguardando',
    observacao: carrinho.observacao || '',
    itens: itensDoCarrinho(carrinho).map((it) => (it.classe === 'rendaFixa'
      ? { classe: it.classe, ativo: it.ativo, instituicao: it.instituicao || '', moeda: 'BRL', valorPlanejado: arred(it.valor), ...(it.qtd > 0 && it.pu > 0 ? { qtdPlanejada: it.qtd, precoPlanejado: it.pu } : {}) }
      : { classe: it.classe, ativo: it.ativo, moeda: it.moeda, qtdPlanejada: it.qtd, precoPlanejado: it.preco, valorPlanejado: arred(it.qtd * it.preco) })),
  };
}

/**
 * 05/10/2026: "se começar outro carrinho no mesmo dia, fazer MERGE" (Tiago: o
 * aporte confirmado aparecia DUPLICADO lá em cima). Junta o carrinho novo ao
 * aporte que já está aguardando valores finais naquele dia: o mesmo ativo soma
 * (quantidade; o preço planejado vira a média ponderada; na renda fixa, o
 * valor), ativo novo entra. O id (e a data) ficam os do aporte que já existe.
 * Devolve um aporte "aguardando" pronto pra salvar com o mesmo id.
 */
export function mesclarAporteComCarrinho(aporte, carrinho) {
  const novo = aporteDoCarrinho({ ...carrinho, editandoId: null });
  return mesclarAportes(aporte, novo);
}

/** Soma os itens de `extra` (aporte aguardando) no aporte `base`; id/data/status do `base`. */
export function mesclarAportes(base, extra) {
  const itens = base.itens.map((it) => ({ ...it }));
  const mesma = (a, b) => a.classe === b.classe && a.ativo === b.ativo && (a.classe !== 'rendaFixa' || (a.instituicao || '') === (b.instituicao || ''));
  extra.itens.forEach((novo) => {
    const i = itens.findIndex((it) => mesma(it, novo));
    if (i < 0) { itens.push({ ...novo }); return; }
    const it = itens[i];
    const valor = arred(num(it.valorPlanejado) + num(novo.valorPlanejado), 4);
    if (it.classe === 'rendaFixa') {
      it.valorPlanejado = arred(valor, 2);
      if (num(it.qtdPlanejada) > 0 || num(novo.qtdPlanejada) > 0) {
        it.qtdPlanejada = arred(num(it.qtdPlanejada) + num(novo.qtdPlanejada), 2);
        it.precoPlanejado = it.qtdPlanejada > 0 ? arred(it.valorPlanejado / it.qtdPlanejada, 2) : null;
      }
      return;
    }
    const qtd = arred(num(it.qtdPlanejada) + num(novo.qtdPlanejada), 4);
    it.qtdPlanejada = qtd;
    it.valorPlanejado = arred(valor, 2);
    it.precoPlanejado = qtd > 0 ? arred(valor / qtd, 4) : it.precoPlanejado;
  });
  const obs = [base.observacao, extra.observacao].map((x) => String(x || '').trim()).filter(Boolean);
  return {
    id: base.id, data: base.data, status: 'aguardando',
    observacao: obs.filter((x, i) => obs.indexOf(x) === i).join(' · '),
    itens,
  };
}

/** Aportes aguardando valores finais num dia (mais novo primeiro, como vêm da planilha). */
export const aguardandoDoDia = (aportes, data) => (aportes || []).filter((a) => a.status === 'aguardando' && a.data === data);

/** Aporte (aguardando) -> carrinho, pra editar. */
export function carrinhoDoAporte(aporte) {
  const itens = {};
  aporte.itens.forEach((it) => {
    if (it.classe === 'rendaFixa') {
      itens[chaveItem('rendaFixa', it.ativo, it.instituicao)] = {
        classe: 'rendaFixa', ativo: it.ativo, instituicao: it.instituicao || '', moeda: 'BRL', valor: num(it.valorPlanejado),
        ...(num(it.qtdPlanejada) > 0 && num(it.precoPlanejado) > 0 ? { qtd: it.qtdPlanejada, pu: it.precoPlanejado } : {}),
      };
    }
    else itens[chaveItem(it.classe, it.ativo)] = { classe: it.classe, ativo: it.ativo, moeda: it.moeda || 'BRL', qtd: num(it.qtdPlanejada), preco: num(it.precoPlanejado) };
  });
  return { editandoId: aporte.id, data: aporte.data, observacao: aporte.observacao || '', itens };
}

/** Aporte concluído -> carrinho novo com as mesmas quantidades (repetir a compra). */
export function carrinhoRepetindo(aporte, hoje, classes) {
  const c = carrinhoDoAporte({ ...aporte, itens: aporte.itens.map((it) => ({ ...it, qtdPlanejada: it.qtdFinal || it.qtdPlanejada, valorPlanejado: it.valorFinal || it.valorPlanejado })) });
  return atualizarPrecos({ ...c, editandoId: null, data: hoje }, classes);
}

/** Valores finais de um item: o que foi digitado, senão o planejado. */
export function finalDoItem(it, digitado = {}) {
  if (it.classe === 'rendaFixa') {
    const valor = digitado.valor != null ? digitado.valor : (it.valorFinal != null ? it.valorFinal : it.valorPlanejado);
    return { valor: num(valor) };
  }
  const qtd = digitado.qtd != null ? digitado.qtd : (it.qtdFinal != null ? it.qtdFinal : it.qtdPlanejada);
  const preco = digitado.preco != null ? digitado.preco : (it.precoFinal != null ? it.precoFinal : it.precoPlanejado);
  return { qtd: num(qtd), preco: num(preco), valor: arred(num(qtd) * num(preco), 4) };
}

/** Aporte "aguardando" + valores digitados -> aporte "concluído". */
export function concluirAporte(aporte, digitados = {}) {
  return {
    id: aporte.id, data: aporte.data, status: 'concluido', observacao: aporte.observacao || '',
    itens: aporte.itens.map((it, i) => {
      const f = finalDoItem(it, digitados[i] || {});
      return it.classe === 'rendaFixa'
        ? { ...it, valorFinal: arred(f.valor) }
        : { ...it, qtdFinal: f.qtd, precoFinal: f.preco, valorFinal: arred(f.valor) };
    }),
  };
}

/** Total de um aporte em reais ('planejado' ou 'final'); EUA pelo câmbio de hoje. */
export function totalAporte(aporte, qual, cambio, digitados = null) {
  return arred(aporte.itens.reduce((s, it, i) => {
    let v;
    if (qual === 'final') v = digitados ? finalDoItem(it, digitados[i] || {}).valor : num(it.valorFinal);
    else v = num(it.valorPlanejado);
    return s + (it.moeda === 'USD' ? v * num(cambio) : v);
  }, 0));
}

export function classesDoAporte(aporte) {
  return CLASSES_APORTE.map((c) => c.id).filter((id) => aporte.itens.some((it) => it.classe === id));
}

// ---------------------------------------------------------------------------
// Resumo por mês (o que foi investido de verdade, das transações)
// ---------------------------------------------------------------------------

export function anosDoResumo(resumo, hoje) {
  const anos = new Set(Object.keys(resumo || {}).map((m) => Number(m.slice(0, 4))));
  anos.add(Number(String(hoje).slice(0, 4)));
  return [...anos].sort((a, b) => b - a);
}

/** 12 meses do ano: [{ mes: 1..12, chave, acoes, fiis, acoesEua, rendaFixa, total, acoesEuaUsd }] */
export function mesesDoAno(resumo, ano) {
  return Array.from({ length: 12 }, (_, i) => {
    const chave = `${ano}-${String(i + 1).padStart(2, '0')}`;
    const r = (resumo && resumo[chave]) || {};
    return { mes: i + 1, chave, acoes: num(r.acoes), fiis: num(r.fiis), acoesEua: num(r.acoesEua), rendaFixa: num(r.rendaFixa), total: num(r.total), acoesEuaUsd: num(r.acoesEuaUsd) };
  });
}

/** 'aaaa-mm' + n meses. */
function somarMesChave(chave, n) {
  const [a, m] = chave.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

/** 06/10/2026 (A-67): períodos canônicos do gráfico "Investido por mês" (mesmos ids/rótulos de Proventos; + "Escolher período"). */
export const PERIODOS_INVESTIDO = ['ano', '12m', '24m', '36m', 'inicio'];

/**
 * Meses do gráfico "Investido por mês" no período escolhido (mesmo formato de mesesDoAno): 'ano' = jan..dez do ano de hoje;
 * '12m'/'24m'/'36m' = os últimos N meses até o mês de hoje; 'inicio' = do 1º mês com dado até hoje; ou um intervalo
 * { inicio, fim } (yyyy-MM-dd) = os meses que tocam o intervalo (cortado no mês de hoje).
 */
export function mesesDoPeriodo(resumo, periodo, hoje) {
  const mesHoje = String(hoje).slice(0, 7);
  let chaves;
  if (periodo && typeof periodo === 'object' && periodo.inicio && periodo.fim) {
    const a = periodo.inicio <= periodo.fim ? periodo.inicio : periodo.fim;
    const b = periodo.inicio <= periodo.fim ? periodo.fim : periodo.inicio;
    const fim = b.slice(0, 7) < mesHoje ? b.slice(0, 7) : mesHoje;
    const ini = a.slice(0, 7) < fim ? a.slice(0, 7) : fim;
    chaves = []; for (let m = ini; m <= fim && chaves.length < 600; m = somarMesChave(m, 1)) chaves.push(m);
  } else if (periodo === 'ano') {
    return mesesDoAno(resumo, Number(mesHoje.slice(0, 4)));
  } else if (periodo === 'inicio') {
    const primeiro = Object.keys(resumo || {}).filter((k) => /^\d{4}-\d{2}$/.test(k) && k <= mesHoje).sort()[0] || mesHoje;
    chaves = []; for (let m = primeiro; m <= mesHoje && chaves.length < 600; m = somarMesChave(m, 1)) chaves.push(m);
  } else {
    const n = { '12m': 12, '24m': 24, '36m': 36 }[periodo] || 12;
    chaves = Array.from({ length: n }, (_, i) => somarMesChave(mesHoje, i - (n - 1)));
  }
  return chaves.map((chave) => {
    const r = (resumo && resumo[chave]) || {};
    return { mes: Number(chave.slice(5, 7)), chave, acoes: num(r.acoes), fiis: num(r.fiis), acoesEua: num(r.acoesEua), rendaFixa: num(r.rendaFixa), total: num(r.total), acoesEuaUsd: num(r.acoesEuaUsd) };
  });
}

/** Aportes concluídos por mês ('aaaa-mm' -> { n, valor }), pelo valor final. */
export function aportesPorMes(aportes, cambio) {
  const out = {};
  (aportes || []).filter((a) => a.status === 'concluido').forEach((a) => {
    const m = a.data.slice(0, 7);
    const r = out[m] || (out[m] = { n: 0, valor: 0 });
    r.n += 1;
    r.valor = arred(r.valor + totalAporte(a, 'final', cambio));
  });
  return out;
}

// ---------------------------------------------------------------------------
// 26/09/2026: "momento de aporte" (Tiago: "um resumo se é um bom momento ou
// não de aporte, segundo os indicadores, viés, e outras variáveis").
// Leitura dos critérios que a PRÓPRIA planilha já usa - preço-teto (viés),
// % desejado x atual do Radar (e o R$ a investir que ela calcula), preço
// médio, última compra, P/VP (FIIs), P/L x renda fixa (ações), fatia da
// classe nos Objetivos; na Renda Fixa, taxa de hoje x taxa média contratada
// e a meta da reserva / longo prazo. Não é recomendação: é o espelho das
// regras do Tiago, ativo por ativo.
//
// Devolve { nivel: 'bom'|'neutro'|'esperar', rotulo, pontos, sinais: [{ tom:
// 'bom'|'ruim'|'neutro', texto, peso }] } - sinais já em ordem de peso.
// ---------------------------------------------------------------------------

const ROTULO_MOMENTO = { bom: 'Bom momento', neutro: 'Momento neutro', esperar: 'Melhor esperar' };
const br = (v, casas = 1) => formatNumeroPt((Math.round(v * 10 ** casas) / 10 ** casas), { minimumFractionDigits: casas, maximumFractionDigits: casas });
// 05/10/2026 (A-06): dólar pelo formatUSD único (mesmo padrão do real)
const moedaTxt = (v, moeda) => (moeda === 'USD' ? formatUSD(v) : formatBRL(v));
const NOME_META_CLASSE = { acoes: 'Ações (Dividendos)', fiis: 'FIIs', acoesEua: 'Ações Internacionais' };

function sinal(lista, tom, texto, peso, extra = null) { lista.push(extra ? { tom, texto, peso, ...extra } : { tom, texto, peso }); }

/**
 * 05/10/2026: soma dos pontos do momento. O "contexto de mercado" (sinais
 * macro) soma no máximo +/-0,5 no total (de 3 pra "Bom momento"): desempata
 * ativo na beira do limiar, nunca decide sozinho nem passa por cima de
 * fundamentos, metas e preço.
 */
function somaPontos(sinais) {
  const normais = sinais.filter((x) => !x.macro).reduce((s, x) => s + x.peso, 0);
  const macro = sinais.filter((x) => x.macro).reduce((s, x) => s + x.peso, 0);
  return normais + Math.max(-LIMITE_PONTOS_MACRO, Math.min(LIMITE_PONTOS_MACRO, macro));
}

function sinaisDoMacro(sinais, macro, classe, opcoes = {}) {
  sinaisMacro(macro, classe, opcoes).forEach((x) => sinal(sinais, x.tom, x.texto, x.peso, { macro: true, ajuda: x.ajuda }));
}

function fechar(sinais, nivel) {
  const pontos = Math.round(somaPontos(sinais) * 10) / 10;
  // contexto de mercado por último (só é "o mais pesado" quando não há mais nada)
  const ordenados = [...sinais].sort((a, b) => (a.macro ? 1 : 0) - (b.macro ? 1 : 0) || Math.abs(b.peso) - Math.abs(a.peso));
  return { nivel, rotulo: ROTULO_MOMENTO[nivel], pontos, sinais: ordenados };
}

function sinalMetaClasse(sinais, meta, nome, peso = 0.5) {
  if (!meta || typeof meta.desejado !== 'number' || typeof meta.atual !== 'number' || !(meta.desejado > 0)) return;
  const dif = meta.atual - meta.desejado;
  if (dif <= -0.01) sinal(sinais, 'bom', `${nome} abaixo da fatia desejada da carteira (${formatPct(meta.atual)} de ${formatPct(meta.desejado, 0)})`, peso);
  else if (dif >= 0.01) sinal(sinais, 'ruim', `${nome} já acima da fatia desejada (${formatPct(meta.atual)} de ${formatPct(meta.desejado, 0)})`, -peso);
}

// ---------------------------------------------------------------------------
// 03/10/2026 (Tiago: "inclua também nas análises quando investir no ativo vai
// ajudar a chegar à meta... Além disso, se o preço atual da ação está abaixo
// do preço médio, é um ponto positivo pra investir; se não, pode ser um
// ponto neutro"): sinais de meta (criterios/motor!sinaisDeMetas), preço x
// preço médio (sinalPrecoMedio) e 2-3 sinais do motor de critérios - a nota
// (só com 5+ critérios), os eliminatórios e o ponto mais forte/fraco que o
// momento ainda não mostra.
// ---------------------------------------------------------------------------

/** Item da prateleira/Radar -> entrada do motor (sem carteira/metas: o momento cuida deles). */
export function entradaMotorDoAporte(a, classe) {
  const r = (a && a.radar) || {};
  const pick = (x, y) => (x != null ? x : y);
  return {
    classe, ticker: a.ticker, nome: a.nome || '', moeda: a.moeda === 'USD' ? 'USD' : 'BRL',
    setor: a.setor || '', segmento: a.segmento || r.segmento || '', tipoFii: r.tipo || a.tipo || '',
    indicadores: {
      precoAtual: a.precoAtual, precoTeto: a.precoTeto, precoMedio: a.precoMedio,
      pvp: pick(a.pvp, r.pvp), pl: pick(a.pl, r.pl), dy: pick(a.dy, r.dy), dyValor: a.dyValor,
      liquidez: a.liquidezDiaria, caixa: a.percentualEmCaixa, patrimonio: a.patrimonio,
    },
    fundamentos: a.fundamentos || null,
    referencias: a.referencias || {},
  };
}

/** Critérios que o momento já mostra do jeito dele (teto, P/VP, desconto P/L). */
const JA_NO_MOMENTO = new Set(['pvp', 'fii_pvp', 'pl', 'preco_vs_teto_planilha', 'fii_preco_teto_dy', 'earnings_yield', 'combo_retorno_implicito', 'preco_teto_bazin', 'combo_teto_composto', 'preco_justo_graham']);
const semPonto = (t) => String(t || '').replace(/\.\s*$/, '');

function sinaisDoMotor(sinais, a, classe) {
  let av = null;
  try { av = avaliarAtivo(entradaMotorDoAporte(a, classe)); } catch (e) { av = null; }
  if (!av) return { eliminatorio: false };
  av.eliminatoriosAcionados.slice(0, 2).forEach((x) => sinal(sinais, 'ruim', `Alerta: ${semPonto(x.texto)}`, -1.5));
  if (typeof av.nota === 'number' && av.cobertura.avaliados >= 5) {
    const tom = av.nota >= 70 ? 'bom' : (av.nota <= 40 ? 'ruim' : 'neutro');
    sinal(sinais, tom, `Fundamentos: nota ${av.nota}/100, ${av.veredito.rotulo.toLowerCase()} (${av.cobertura.avaliados} critérios)`, tom === 'bom' ? 1 : (tom === 'ruim' ? -1 : 0));
  }
  const extra = av.pontos.find((p) => !JA_NO_MOMENTO.has(p.criterioId) && p.grupo !== 'carteira' && !p.informativo && !p.eliminatorio
    && (p.tom === 'bom' || p.tom === 'ruim') && p.peso >= 2);
  if (extra) sinal(sinais, extra.tom, semPonto(extra.texto), extra.tom === 'bom' ? 0.5 : -0.5);
  return { eliminatorio: av.eliminatoriosAcionados.length > 0, avaliacao: av };
}

function sinaisMeta(sinais, alvo, opcoes) {
  const lista = sinaisDeMetas({ ...alvo, metas: opcoes.metasObjetivos, valorSugerido: opcoes.valorSugerido, cambio: opcoes.cambio });
  lista.forEach((x) => sinal(sinais, x.tom, x.texto, x.peso, x.ajuda ? { ajuda: x.ajuda } : null));
  return lista;
}

function momentoRendaVariavel(a, classe, metas, totalRanking, opcoes = {}) {
  const sinais = [];
  const preco = a.precoAtual;
  let acimaDoTeto = false;
  if (preco > 0 && a.precoTeto > 0) {
    const margem = a.precoTeto / preco - 1;
    if (preco <= a.precoTeto && margem < 0.02) sinal(sinais, 'neutro', `No limite do preço-teto (${moedaTxt(a.precoTeto, a.moeda)}): margem de ${formatPct(margem)}`, 0.5);
    else if (preco <= a.precoTeto) sinal(sinais, 'bom', `Abaixo do preço-teto (${moedaTxt(a.precoTeto, a.moeda)}): margem de ${formatPct(margem)}`, 2);
    else { acimaDoTeto = true; sinal(sinais, 'ruim', `Acima do preço-teto (${moedaTxt(a.precoTeto, a.moeda)}) em ${formatPct(preco / a.precoTeto - 1)}`, -2); }
  }
  const r = a.radar || null;
  if (r && typeof r.percentualDesejado === 'number') {
    const d = r.percentualDesejado;
    const at = typeof r.percentualAtual === 'number' ? r.percentualAtual : (a.peso || 0);
    if (d <= 0) sinal(sinais, 'ruim', 'Fora da meta: % desejado zerado no Radar', -1.5);
    else if (at - d <= -0.01) {
      const falta = r.valorInvestir > 0 ? `: faltam ${a.moeda === 'USD' ? moedaTxt(r.valorInvestir, 'USD') : formatBRL0(r.valorInvestir)}` : '';
      sinal(sinais, 'bom', `Abaixo do % desejado no Radar (${formatPct(at)} de ${formatPct(d)})${falta}`, at / d < 0.6 ? 2 : 1);
    } else if (at - d >= 0.01) sinal(sinais, 'ruim', `Acima do % desejado no Radar (${formatPct(at)} de ${formatPct(d)})`, -1.5);
    else sinal(sinais, 'neutro', `No % desejado do Radar (${formatPct(at)} de ${formatPct(d)})`, 0);
  }
  const pm = sinalPrecoMedio({ precoAtual: preco, precoMedio: a.precoMedio, quantidade: a.quantidade, moeda: a.moeda, quantidadeReal: a.quantidadeReal !== false });
  // 08/10/2026: abaixo do preço médio, a mesma linha diz quanto falta pra ficar no lucro (o detalhe vai no "i")
  if (pm) sinal(sinais, pm.tom, pm.textoLucro ? `${pm.texto}; ${pm.textoLucro}` : pm.texto, pm.peso, pm.ajuda ? { ajuda: pm.dicaLucro ? `${pm.ajuda} ${pm.dicaLucro}` : pm.ajuda } : null);
  const u = a.ultimoPago;
  if (preco > 0 && u && u.preco > 0) {
    const v = preco / u.preco - 1;
    if (v <= -0.03) sinal(sinais, 'bom', `${formatPct(-v)} mais barato que a última compra (${moedaTxt(u.preco, a.moeda)})`, 0.5);
    else if (v >= 0.08) sinal(sinais, 'ruim', `${formatPct(v)} mais caro que a última compra (${moedaTxt(u.preco, a.moeda)})`, -0.5);
  }
  if (classe === 'fiis' && r && r.pvp > 0) {
    if (r.pvp < 0.95) sinal(sinais, 'bom', `P/VP ${br(r.pvp, 2)}: negociando abaixo do patrimônio`, 1);
    else if (r.pvp > 1.1) sinal(sinais, 'ruim', `P/VP ${br(r.pvp, 2)}: acima do patrimônio`, -1);
    else sinal(sinais, 'neutro', `P/VP ${br(r.pvp, 2)}: perto do patrimônio`, 0);
  }
  // Desconto sobre P/L: a MESMA regra da coluna "Desc. P/L" do Radar - retorno
  // pelo lucro (1/P/L) "acima" da taxa de renda fixa = com desconto, "abaixo" = caro
  if (classe === 'acoes' && r && typeof r.descontoPl === 'string') {
    const pl = r.pl > 0 ? ` (P/L ${br(r.pl, 1)})` : '';
    if (/acima/i.test(r.descontoPl)) sinal(sinais, 'bom', `Desconto sobre P/L: com desconto${pl}`, 1);
    else if (/abaixo/i.test(r.descontoPl)) sinal(sinais, 'ruim', `Desconto sobre P/L: está caro${pl}`, -0.5);
  }
  if (typeof a.variacaoDia === 'number' && a.variacaoDia <= -0.02) sinal(sinais, 'bom', `Caindo ${formatPct(-a.variacaoDia)} hoje`, 0.5);
  if (metas) sinalMetaClasse(sinais, metas[classe], NOME_META_CLASSE[classe]);
  const r0 = a.radar || {};
  sinaisMeta(sinais, { classe, ticker: a.ticker, moeda: a.moeda, dy: a.dy != null ? a.dy : r0.dy }, {
    ...opcoes, valorSugerido: opcoes.valorSugerido != null ? opcoes.valorSugerido : (r0.valorInvestir > 0 ? r0.valorInvestir : null),
  });
  const motor = sinaisDoMotor(sinais, a, classe);
  // Ranking (26/09/2026, Tiago: "o ranking é uma forma da Suno dizer que é um
  // bom momento de investir naquele ativo, por questões externas, não só
  // fundamentalistas... pode influenciar pra algo 'bom momento' para 'neutro',
  // se o ativo estiver entre os últimos"): 1º quarto da lista soma, último
  // quarto pesa contra e nunca deixa ser "Bom momento".
  const rk = r && r.ranking > 0 ? r.ranking : null;
  let entreOsUltimos = false;
  if (rk && totalRanking >= 3 && rk <= totalRanking) {
    const posicao = (rk - 1) / (totalRanking - 1);
    if (posicao <= 0.25) sinal(sinais, 'bom', `Ranking ${rk} de ${totalRanking}: entre os primeiros da Suno`, 1);
    else if (posicao >= 0.75) { entreOsUltimos = true; sinal(sinais, 'ruim', `Ranking ${rk} de ${totalRanking}: entre os últimos da Suno`, -1); }
    else sinal(sinais, 'neutro', `Ranking ${rk} de ${totalRanking} na Suno`, 0);
  }
  sinaisDoMacro(sinais, opcoes.macro, classe); // 05/10/2026: contexto de mercado (<= 0,5 ponto no total)
  const pontos = somaPontos(sinais);
  let nivel = acimaDoTeto || pontos <= -1 ? 'esperar' : (pontos >= 3 ? 'bom' : 'neutro');
  if (nivel === 'bom' && (entreOsUltimos || motor.eliminatorio)) nivel = 'neutro';
  return fechar(sinais, nivel);
}

/** Maior ranking do Radar numa lista de ativos (da prateleira ou do próprio Radar) - o "de N" do ranking. */
export function totalRanking(lista) {
  return (lista || []).reduce((m, a) => {
    const r = a && (a.radar ? a.radar.ranking : a.ranking);
    return typeof r === 'number' && r > m ? r : m;
  }, 0);
}

function textoTaxa(indice, taxa) {
  const t = `${br(taxa * 100, 2)}%`;
  if (indice === 'SELIC') return `Selic + ${t}`;
  if (indice === 'IPCA') return `IPCA + ${t}`;
  return `${t} a.a.`;
}

/** Marca da Renda Fixa em Metas e Objetivos ('emergencial' | 'longo-prazo' | 'objetivo') - o destino do título (coluna B da Carteira Renda Fixa; destino-renda-fixa.js). */
export const marcaRf = (t) => destinoRendaFixa(t && (t.destino || t.categoria || t.tipoCarteira));

/** A classe (ações, FIIs) mais abaixo da fatia desejada (Objetivos da planilha), com folga de 1 p.p.; null se nenhuma. */
function classeMaisAbaixoDaAlocacao(metas) {
  if (!metas) return null;
  const lista = [['acoesENacionais', 'Ações'], ['fiis', 'FIIs']]
    .map(([k, nome]) => ({ nome, desejado: metas[k] && metas[k].desejado, atual: metas[k] && metas[k].atual }))
    .filter((x) => typeof x.desejado === 'number' && typeof x.atual === 'number' && x.desejado > 0 && x.atual - x.desejado <= -0.01)
    .sort((a, b) => (a.atual - a.desejado) - (b.atual - b.desejado));
  return lista[0] || null;
}

function momentoRendaFixa(t, metas, hoje, opcoes = {}) {
  const sinais = [];
  const indice = /selic/i.test(t.titulo) || t.indexador === 'SELIC' ? 'SELIC' : (/ipca/i.test(t.titulo) || t.indexador === 'IPCA' ? 'IPCA' : (/prefixado/i.test(t.titulo) ? 'PRE' : (t.indexador || '')));
  const hojeT = t.taxaHoje && typeof t.taxaHoje.taxa === 'number' ? t.taxaHoje.taxa : null;
  const contr = t.taxaContratada && typeof t.taxaContratada.taxa === 'number' ? t.taxaContratada.taxa : null;
  if (indice === 'SELIC') sinal(sinais, 'neutro', 'Pós-fixado: rende a Selic, o dia da compra pesa pouco', 0);
  else if (hojeT != null) {
    if (contr != null) {
      const dif = hojeT - contr;
      if (dif >= 0.002) sinal(sinais, 'bom', `Taxa de hoje (${textoTaxa(indice, hojeT)}) maior que a sua média (${textoTaxa(indice, contr)})`, 2);
      else if (dif <= -0.002) sinal(sinais, 'ruim', `Taxa de hoje (${textoTaxa(indice, hojeT)}) menor que a sua média (${textoTaxa(indice, contr)})`, -1);
      else sinal(sinais, 'neutro', `Taxa de hoje (${textoTaxa(indice, hojeT)}) igual à sua média`, 0);
    } else sinal(sinais, 'neutro', `Taxa de hoje: ${textoTaxa(indice, hojeT)}`, 0);
    if (indice === 'IPCA' && hojeT >= 0.06) sinal(sinais, 'bom', 'Juro real acima de 6% a.a., alto pro histórico do Tesouro', 1);
  }
  const destino = marcaRf(t);
  const emergencial = destino === DESTINO_EMERGENCIAL;
  const objetivo = destino === DESTINO_OBJETIVO; // 07/10/2026: Reservado para objetivos - fora da Distribuição da carteira (sem meta de classe)
  const meta = metas && !objetivo ? (emergencial ? metas.rfEmergencial : metas.rfLongoPrazo) : null;
  const nome = emergencial ? 'Reserva de emergência' : (objetivo ? 'Reservado para objetivos' : 'Renda Fixa de longo prazo');
  // 03/10/2026: metas de Metas e Objetivos (vínculo pela marca Renda Emergencial/longo prazo, pelo título ou pela classe)
  const titulo = String(t.titulo || '').replace(/\s+/g, ' ').trim();
  const metasObj = sinaisMeta(sinais, { classe: 'rendaFixa', ticker: titulo, ref: `rf:${titulo}|${String(t.instituicao || '').trim()}`, marca: marcaRf(t), moeda: 'BRL' }, opcoes);
  // a meta de Metas e Objetivos substitui a linha de "% da reserva" da planilha (mesma informação, mais exata)
  if (!metasObj.length && meta && typeof meta.desejado === 'number' && typeof meta.atual === 'number' && meta.desejado > 0) {
    const dif = meta.atual - meta.desejado;
    if (dif <= -0.01) sinal(sinais, 'bom', `${nome} abaixo da meta (${formatPct(meta.atual)} de ${formatPct(meta.desejado, 0)})${meta.valorInvestir > 0 ? `: faltam ${formatBRL0(meta.valorInvestir)}` : ''}`, 1.5);
    else if (dif >= 0.01) sinal(sinais, 'ruim', `${nome} já acima da meta (${formatPct(meta.atual)} de ${formatPct(meta.desejado, 0)})`, -1.5);
    else sinal(sinais, 'neutro', `${nome} na meta`, 0);
  }
  if (metas && !objetivo) sinalMetaClasse(sinais, metas.rendaFixa, 'Renda Fixa');
  // 05/10/2026 (Tiago: "Tesouro Selic 2032 é positivo investir se a renda emergencial estiver abaixo do ideal"):
  // este título combina com a(s) meta(s) a que está ligado? (reserva abaixo do ideal, liquidez, vence antes/depois da
  // meta, IPCA+ longo pra meta curta, vencendo em < 12 meses na reserva)
  const encaixe = sinaisRendaFixaMeta({
    titulo: { titulo, descricao: t.tipo || t.tipoInvestimento || '', indexador: t.indexador || indice, vencimento: t.vencimento },
    ref: `rf:${titulo}|${String(t.instituicao || '').trim()}`, marca: marcaRf(t), metas: opcoes.metasObjetivos, hoje,
  });
  encaixe.forEach((x) => sinal(sinais, x.tom, x.texto, x.peso, x.ajuda ? { ajuda: x.ajuda } : null));
  // reserva (ou outra meta) no ideal: neutro e diz onde faz mais falta - outra meta (já no texto) ou a classe mais abaixo da alocação-alvo
  if (metasObj.some((x) => x.tipo === 'atingida' && !x.outraMeta)) {
    const alvoClasse = classeMaisAbaixoDaAlocacao(metas);
    if (alvoClasse) sinal(sinais, 'neutro', `Para o próximo aporte, a classe mais abaixo da alocação-alvo é ${alvoClasse.nome} (${formatPct(alvoClasse.atual)} de ${formatPct(alvoClasse.desejado, 0)})`, 0);
  }
  if (t.vencimento && hoje && !encaixe.some((x) => x.tipo === 'rf-vencendo')) {
    const dias = (Date.parse(`${t.vencimento}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000;
    if (dias < 365) sinal(sinais, 'ruim', 'Vence em menos de 1 ano', -0.5);
  }
  sinaisDoMacro(sinais, opcoes.macro, 'rendaFixa', { indexador: indice, taxaPropria: indice === 'IPCA' && hojeT != null });
  const pontos = somaPontos(sinais);
  return fechar(sinais, pontos >= 2 ? 'bom' : (pontos < 0 ? 'esperar' : 'neutro'));
}

/** a = item de dados.classes[classe] (Aportes.gs!ativosParaAporte_ + enriquecerMomentoAporte_); metas = dados.metas. */
/** opcoes.totalRanking = quantos ativos tem o bloco do Radar dessa classe (pra "ranking X de N"). */
/**
 * 03/10/2026: opcoes.metasObjetivos = metas de Metas e Objetivos com `calc`
 * (metas-card!metasComCalculo; null = sem sinal de meta), opcoes.valorSugerido
 * = quanto se pensa aportar (moeda do ativo; padrão: o "R$ a investir" do
 * Radar), opcoes.cambio = dólar (ativos EUA).
 */
export function momentoAporte(a, classe, metas = null, hoje = '', { totalRanking: total = 0, metasObjetivos = null, valorSugerido = null, cambio = null, macro = null } = {}) {
  if (!a) return fechar([], 'neutro');
  const opcoes = { metasObjetivos, valorSugerido, cambio, macro };
  return classe === 'rendaFixa' ? momentoRendaFixa(a, metas, hoje, opcoes) : momentoRendaVariavel(a, classe, metas, total, opcoes);
}

// 05/10/2026 (A-68): os meses moram em format.js; reexportados daqui pra quem já importava.
export { MESES_CURTOS, MESES_LONGOS };

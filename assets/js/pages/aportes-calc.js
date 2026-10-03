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
import { avaliarAtivo, sinalPrecoMedio, sinaisDeMetas } from '../criterios/motor.js';

export const CLASSES_APORTE = [
  { id: 'acoes', nome: 'Ações', curto: 'Ações', cor: '--acoes' },
  { id: 'fiis', nome: 'FIIs', curto: 'FIIs', cor: '--fiis' },
  { id: 'acoesEua', nome: 'Ações EUA', curto: 'EUA', cor: '--usa' },
  { id: 'rendaFixa', nome: 'Renda Fixa', curto: 'RF', cor: '--rf' },
];
export const NOME_CLASSE_APORTE = Object.fromEntries(CLASSES_APORTE.map((c) => [c.id, c.nome]));
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const ordemClasse = (c) => CLASSES_APORTE.findIndex((x) => x.id === c);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

export const chaveItem = (classe, ativo, instituicao = '') => `${classe}:${ativo}${classe === 'rendaFixa' && instituicao ? `|${instituicao}` : ''}`;

export function carrinhoVazio(hoje) {
  return { editandoId: null, data: hoje, observacao: '', itens: {} };
}

/** Carrinho lido do navegador, conferido (formato antigo/estragado vira vazio). */
export function carrinhoValido(c, hoje) {
  if (!c || typeof c !== 'object' || typeof c.itens !== 'object' || !c.itens) return carrinhoVazio(hoje);
  const itens = {};
  Object.entries(c.itens).forEach(([k, it]) => {
    if (!it || !CLASSES_APORTE.some((x) => x.id === it.classe) || !it.ativo) return;
    if (it.classe === 'rendaFixa' ? num(it.valor) > 0 : num(it.qtd) > 0) itens[k] = it;
  });
  return { editandoId: c.editandoId || null, data: /^\d{4}-\d{2}-\d{2}$/.test(c.data || '') ? c.data : hoje, observacao: String(c.observacao || ''), itens };
}

/** Define a quantidade (0 tira do carrinho). Devolve um carrinho novo. */
export function definirQuantidade(carrinho, { classe, ativo, moeda = 'BRL', preco }, qtd) {
  const itens = { ...carrinho.itens };
  const k = chaveItem(classe, ativo);
  const q = Math.max(0, Math.floor(num(qtd) * 10000) / 10000);
  if (q > 0) itens[k] = { classe, ativo, moeda, qtd: q, preco: num(preco) || (itens[k] && itens[k].preco) || 0 };
  else delete itens[k];
  return { ...carrinho, itens };
}

export function definirValorRf(carrinho, { ativo, instituicao = '' }, valor) {
  const itens = { ...carrinho.itens };
  const k = chaveItem('rendaFixa', ativo, instituicao);
  const v = Math.max(0, arred(num(valor), 2));
  if (v > 0) itens[k] = { classe: 'rendaFixa', ativo, instituicao, moeda: 'BRL', valor: v };
  else delete itens[k];
  return { ...carrinho, itens };
}

export function removerDoCarrinho(carrinho, chave) {
  const itens = { ...carrinho.itens };
  delete itens[chave];
  return { ...carrinho, itens };
}

/** Atualiza o preço de cada item com a cotação de agora (a prateleira é dinâmica). */
export function atualizarPrecos(carrinho, classes) {
  const itens = {};
  Object.entries(carrinho.itens).forEach(([k, it]) => {
    if (it.classe === 'rendaFixa') { itens[k] = it; return; }
    const a = ((classes && classes[it.classe]) || []).find((x) => x.ticker === it.ativo);
    itens[k] = a && num(a.precoAtual) > 0 ? { ...it, preco: a.precoAtual } : it;
  });
  return { ...carrinho, itens };
}

export const valorItemCarrinho = (it) => (it.classe === 'rendaFixa' ? num(it.valor) : num(it.qtd) * num(it.preco));

/** Itens em ordem de classe e nome, com o subtotal. */
export function itensDoCarrinho(carrinho) {
  return Object.entries(carrinho.itens)
    .map(([chave, it]) => ({ chave, ...it, subtotal: arred(valorItemCarrinho(it), 4) }))
    .sort((a, b) => ordemClasse(a.classe) - ordemClasse(b.classe) || a.ativo.localeCompare(b.ativo));
}

/** { porClasse: { id: { n, valor (moeda da classe), brl } }, n, totalBrl, totalUsd } */
export function totaisCarrinho(carrinho, cambio) {
  const porClasse = {};
  let totalBrl = 0;
  let totalUsd = 0;
  itensDoCarrinho(carrinho).forEach((it) => {
    const p = porClasse[it.classe] || (porClasse[it.classe] = { n: 0, valor: 0, brl: 0 });
    p.n += 1;
    p.valor += it.subtotal;
    const brl = it.moeda === 'USD' ? it.subtotal * num(cambio) : it.subtotal;
    p.brl += brl;
    totalBrl += brl;
    if (it.moeda === 'USD') totalUsd += it.subtotal;
  });
  Object.values(porClasse).forEach((p) => { p.valor = arred(p.valor); p.brl = arred(p.brl); });
  return { porClasse, n: Object.keys(carrinho.itens).length, totalBrl: arred(totalBrl), totalUsd: arred(totalUsd) };
}

/** Carrinho -> aporte "aguardando valores finais" (o que vai pra planilha). */
export function aporteDoCarrinho(carrinho) {
  return {
    id: carrinho.editandoId || undefined,
    data: carrinho.data,
    status: 'aguardando',
    observacao: carrinho.observacao || '',
    itens: itensDoCarrinho(carrinho).map((it) => (it.classe === 'rendaFixa'
      ? { classe: it.classe, ativo: it.ativo, instituicao: it.instituicao || '', moeda: 'BRL', valorPlanejado: arred(it.valor) }
      : { classe: it.classe, ativo: it.ativo, moeda: it.moeda, qtdPlanejada: it.qtd, precoPlanejado: it.preco, valorPlanejado: arred(it.qtd * it.preco) })),
  };
}

/** Aporte (aguardando) -> carrinho, pra editar. */
export function carrinhoDoAporte(aporte) {
  const itens = {};
  aporte.itens.forEach((it) => {
    if (it.classe === 'rendaFixa') itens[chaveItem('rendaFixa', it.ativo, it.instituicao)] = { classe: 'rendaFixa', ativo: it.ativo, instituicao: it.instituicao || '', moeda: 'BRL', valor: num(it.valorPlanejado) };
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
const br = (v, casas = 1) => (Math.round(v * 10 ** casas) / 10 ** casas).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pctTxt = (fracao, casas = 1) => `${br(fracao * 100, casas)}%`;
const reais = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const moedaTxt = (v, moeda) => `${moeda === 'USD' ? 'US$' : 'R$'} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const NOME_META_CLASSE = { acoes: 'Ações (Dividendos)', fiis: 'FIIs', acoesEua: 'Ações Internacionais' };

function sinal(lista, tom, texto, peso) { lista.push({ tom, texto, peso }); }

function fechar(sinais, nivel) {
  const pontos = Math.round(sinais.reduce((s, x) => s + x.peso, 0) * 10) / 10;
  const ordenados = [...sinais].sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso));
  return { nivel, rotulo: ROTULO_MOMENTO[nivel], pontos, sinais: ordenados };
}

function sinalMetaClasse(sinais, meta, nome, peso = 0.5) {
  if (!meta || typeof meta.desejado !== 'number' || typeof meta.atual !== 'number' || !(meta.desejado > 0)) return;
  const dif = meta.atual - meta.desejado;
  if (dif <= -0.01) sinal(sinais, 'bom', `${nome} abaixo da fatia desejada da carteira (${pctTxt(meta.atual)} de ${pctTxt(meta.desejado, 0)})`, peso);
  else if (dif >= 0.01) sinal(sinais, 'ruim', `${nome} já acima da fatia desejada (${pctTxt(meta.atual)} de ${pctTxt(meta.desejado, 0)})`, -peso);
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
  lista.forEach((x) => sinal(sinais, x.tom, x.texto, x.peso));
  return lista;
}

function momentoRendaVariavel(a, classe, metas, totalRanking, opcoes = {}) {
  const sinais = [];
  const preco = a.precoAtual;
  let acimaDoTeto = false;
  if (preco > 0 && a.precoTeto > 0) {
    const margem = a.precoTeto / preco - 1;
    if (preco <= a.precoTeto && margem < 0.02) sinal(sinais, 'neutro', `No limite do preço-teto (${moedaTxt(a.precoTeto, a.moeda)}): margem de ${pctTxt(margem)}`, 0.5);
    else if (preco <= a.precoTeto) sinal(sinais, 'bom', `Abaixo do preço-teto (${moedaTxt(a.precoTeto, a.moeda)}): margem de ${pctTxt(margem)}`, 2);
    else { acimaDoTeto = true; sinal(sinais, 'ruim', `Acima do preço-teto (${moedaTxt(a.precoTeto, a.moeda)}) em ${pctTxt(preco / a.precoTeto - 1)}`, -2); }
  }
  const r = a.radar || null;
  if (r && typeof r.percentualDesejado === 'number') {
    const d = r.percentualDesejado;
    const at = typeof r.percentualAtual === 'number' ? r.percentualAtual : (a.peso || 0);
    if (d <= 0) sinal(sinais, 'ruim', 'Fora da meta: % desejado zerado no Radar', -1.5);
    else if (at - d <= -0.01) {
      const falta = r.valorInvestir > 0 ? `: faltam ${a.moeda === 'USD' ? moedaTxt(r.valorInvestir, 'USD') : reais(r.valorInvestir)}` : '';
      sinal(sinais, 'bom', `Abaixo do % desejado no Radar (${pctTxt(at)} de ${pctTxt(d)})${falta}`, at / d < 0.6 ? 2 : 1);
    } else if (at - d >= 0.01) sinal(sinais, 'ruim', `Acima do % desejado no Radar (${pctTxt(at)} de ${pctTxt(d)})`, -1.5);
    else sinal(sinais, 'neutro', `No % desejado do Radar (${pctTxt(at)} de ${pctTxt(d)})`, 0);
  }
  const pm = sinalPrecoMedio({ precoAtual: preco, precoMedio: a.precoMedio, quantidade: a.quantidade, moeda: a.moeda });
  if (pm) sinal(sinais, pm.tom, pm.texto, pm.peso);
  const u = a.ultimoPago;
  if (preco > 0 && u && u.preco > 0) {
    const v = preco / u.preco - 1;
    if (v <= -0.03) sinal(sinais, 'bom', `${pctTxt(-v)} mais barato que a última compra (${moedaTxt(u.preco, a.moeda)})`, 0.5);
    else if (v >= 0.08) sinal(sinais, 'ruim', `${pctTxt(v)} mais caro que a última compra (${moedaTxt(u.preco, a.moeda)})`, -0.5);
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
  if (typeof a.variacaoDia === 'number' && a.variacaoDia <= -0.02) sinal(sinais, 'bom', `Caindo ${pctTxt(-a.variacaoDia)} hoje`, 0.5);
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
  const pontos = sinais.reduce((s, x) => s + x.peso, 0);
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

/** Marca da Renda Fixa em Metas e Objetivos ('emergencial' | 'longo-prazo') pela categoria da planilha. */
export const marcaRf = (t) => (/emergencial|reserva/i.test(String((t && (t.categoria || t.tipoCarteira)) || '')) ? 'emergencial' : 'longo-prazo');

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
  const emergencial = /emergencial/i.test(t.categoria || '');
  const meta = metas ? (emergencial ? metas.rfEmergencial : metas.rfLongoPrazo) : null;
  const nome = emergencial ? 'Reserva de emergência' : 'Renda Fixa de longo prazo';
  // 03/10/2026: metas de Metas e Objetivos (vínculo pela marca Renda Emergencial/longo prazo, pelo título ou pela classe)
  const titulo = String(t.titulo || '').replace(/\s+/g, ' ').trim();
  const metasObj = sinaisMeta(sinais, { classe: 'rendaFixa', ticker: titulo, ref: `rf:${titulo}|${String(t.instituicao || '').trim()}`, marca: marcaRf(t), moeda: 'BRL' }, opcoes);
  // a meta de Metas e Objetivos substitui a linha de "% da reserva" da planilha (mesma informação, mais exata)
  if (!metasObj.length && meta && typeof meta.desejado === 'number' && typeof meta.atual === 'number' && meta.desejado > 0) {
    const dif = meta.atual - meta.desejado;
    if (dif <= -0.01) sinal(sinais, 'bom', `${nome} abaixo da meta (${pctTxt(meta.atual)} de ${pctTxt(meta.desejado, 0)})${meta.valorInvestir > 0 ? `: faltam ${reais(meta.valorInvestir)}` : ''}`, 1.5);
    else if (dif >= 0.01) sinal(sinais, 'ruim', `${nome} já acima da meta (${pctTxt(meta.atual)} de ${pctTxt(meta.desejado, 0)})`, -1.5);
    else sinal(sinais, 'neutro', `${nome} na meta`, 0);
  }
  if (metas) sinalMetaClasse(sinais, metas.rendaFixa, 'Renda Fixa');
  if (t.vencimento && hoje) {
    const dias = (Date.parse(`${t.vencimento}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000;
    if (dias < 365) sinal(sinais, 'ruim', 'Vence em menos de 1 ano', -0.5);
  }
  const pontos = sinais.reduce((s, x) => s + x.peso, 0);
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
export function momentoAporte(a, classe, metas = null, hoje = '', { totalRanking: total = 0, metasObjetivos = null, valorSugerido = null, cambio = null } = {}) {
  if (!a) return fechar([], 'neutro');
  const opcoes = { metasObjetivos, valorSugerido, cambio };
  return classe === 'rendaFixa' ? momentoRendaFixa(a, metas, hoje, opcoes) : momentoRendaVariavel(a, classe, metas, total, opcoes);
}

// assets/js/pages/aportes-eua-calc.js
//
// 05/10/2026: fluxo novo das Ações internacionais (Tiago: "primeiro envio
// BRL->USD pela Remessa Online, depois divido os dólares entre as ações. Às
// vezes estimo os dólares pela quantidade de ações que quero; às vezes só
// envio e compro depois (como hoje)").
//
//  Etapa 1 - Enviar dólares: R$ -> US$ pela Remessa Online (ou o caminho
//            inverso: US$ que quero -> R$ a enviar). O que chega vira "caixa em
//            dólar" aguardando compra (aba aux_caixa_dolar, Aportes.gs).
//  Etapa 2 - Comprar ações com o caixa: sugestão de divisão pelos alvos do
//            Radar e pelo momento; ou o inverso: escolhi as ações -> quantos
//            US$ faltam e quantos R$ enviar.
//
// Custo da remessa, calibrado pela cotação real do Tiago (Remessa Online,
// "Detalhes da cotação", 05/10/2026: dólar comercial R$ 4,9783; tarifas de
// R$ 0,1119 por US$; VET R$ 5,0902; US$ 68,76 por R$ 350,00, dos quais R$ 3,88
// de taxa de conversão e R$ 3,81 de encargos):
//   taxa de conversão = 3,88 / (68,76 × 4,9783)  ≈ 1,13% do valor convertido
//   encargos (IOF)    = 3,81 / (342,30 + 3,88)   ≈ 1,10% (conversão + taxa)
//   VET = comercial × (1 + conversão) × (1 + encargos)  ≈ R$ 5,09 por US$
// Os dois percentuais são MÉDIAS editáveis (a Remessa muda a taxa por valor,
// forma de pagamento e dia): a tela deixa o Tiago ajustar e guarda os dele.
// Puro, sem DOM: testado em tests/aportes-eua-calc.test.js.

import { momentoAporte } from './aportes-calc.js';

export const PADROES_REMESSA = { conversao: 0.0113, encargos: 0.011 };
export const CHAVE_REMESSA = 'transacoes.remessa.v1';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;

/** Percentuais conferidos (fração 0-0,2); o que vier estranho volta pro padrão. */
export function taxasValidas(t) {
  const ok = (v, padrao) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 0.2 ? v : padrao);
  return { conversao: ok(t && t.conversao, PADROES_REMESSA.conversao), encargos: ok(t && t.encargos, PADROES_REMESSA.encargos) };
}

/** Taxas guardadas no navegador (ou, na falta delas, as do último envio da planilha, ou as padrão). */
export function lerTaxasRemessa(storage = (typeof globalThis !== 'undefined' ? globalThis.localStorage : null), ultimoEnvio = null) {
  try {
    const salvo = JSON.parse(storage.getItem(CHAVE_REMESSA) || 'null');
    if (salvo && typeof salvo === 'object') return taxasValidas(salvo);
  } catch (e) { /* só conveniência */ }
  return taxasValidas(ultimoEnvio ? { conversao: ultimoEnvio.conversao, encargos: ultimoEnvio.encargos } : null);
}

export function gravarTaxasRemessa(taxas, storage = (typeof globalThis !== 'undefined' ? globalThis.localStorage : null)) {
  try { storage.setItem(CHAVE_REMESSA, JSON.stringify(taxasValidas(taxas))); } catch (e) { /* só conveniência */ }
}

/** Valor efetivo de um dólar (VET): comercial + taxa de conversão, com os encargos por cima. */
export function vetRemessa(comercial, taxas) {
  const t = taxasValidas(taxas);
  return num(comercial) > 0 ? num(comercial) * (1 + t.conversao) * (1 + t.encargos) : 0;
}

function detalhe(usd, comercial, taxas, reaisTotal) {
  const t = taxasValidas(taxas);
  const base = usd * comercial;
  const conversaoBrl = base * t.conversao;
  const encargosBrl = (base + conversaoBrl) * t.encargos;
  const vet = vetRemessa(comercial, t);
  return {
    usd, reais: reaisTotal, comercial, vet: arred(vet, 4), comercialBrl: arred(base), conversaoBrl: arred(conversaoBrl), encargosBrl: arred(encargosBrl),
    tarifaPorUsd: arred(vet - comercial, 4), custoPct: comercial > 0 ? vet / comercial - 1 : 0, conversao: t.conversao, encargos: t.encargos,
  };
}

/** Informei R$ a enviar -> quantos US$ chegam (2 casas, como a Remessa). */
export function remessaPorReais(reais, comercial, taxas) {
  const vet = vetRemessa(comercial, taxas);
  if (!(num(reais) > 0) || !(vet > 0)) return null;
  const dolares = arred(reais / vet, 2);
  return detalhe(dolares, comercial, taxas, arred(reais, 2));
}

/** Informei os US$ que quero -> quantos R$ enviar. */
export function remessaPorDolares(usd, comercial, taxas) {
  const vet = vetRemessa(comercial, taxas);
  if (!(num(usd) > 0) || !(vet > 0)) return null;
  const q = arred(usd, 2);
  return detalhe(q, comercial, taxas, arred(q * vet, 2));
}

// ---------------------------------------------------------------------------
// Caixa em dólar
// ---------------------------------------------------------------------------

/** Saldo e movimentos do caixa (vem de Aportes.gs, mas confere o formato). */
export function caixaValido(c) {
  const movimentos = Array.isArray(c && c.movimentos) ? c.movimentos.filter((m) => m && m.id) : [];
  const saldo = movimentos.length ? movimentos.reduce((s, m) => s + num(m.usd), 0) : num(c && c.saldoUsd);
  return { saldoUsd: arred(saldo, 2), movimentos };
}

/** Quanto falta (ou sobra) de dólar pro que está no carrinho, e quantos R$ enviar pra cobrir. */
export function necessidadeDeDolares(usdNoCarrinho, caixaUsd, comercial, taxas) {
  const precisa = arred(num(usdNoCarrinho), 2);
  const caixa = Math.max(0, arred(num(caixaUsd), 2));
  const falta = Math.max(0, arred(precisa - caixa, 2));
  const sobra = Math.max(0, arred(caixa - precisa, 2));
  return { precisa, caixa, falta, sobra, enviar: falta > 0 ? remessaPorDolares(falta, comercial, taxas) : null };
}

// ---------------------------------------------------------------------------
// Sugestão de divisão do caixa entre as ações
// ---------------------------------------------------------------------------

/**
 * Divide `caixaUsd` entre as ações EUA pelo quanto cada uma está abaixo do alvo
 * no Radar (% desejado - % atual); sem alvo, o melhor momento. Ações em
 * "melhor esperar" só entram se não sobrar nenhuma outra. Compra em ações
 * inteiras; o troco vai pro ativo que mais precisa e ainda couber.
 * Devolve { itens: [{ ticker, qtd, valor, preco, motivo }], sobra, usado }.
 */
export function sugerirDivisaoCaixa(ativos, caixaUsd, { metas = null, hoje = '', cambio = null, metasObjetivos = null } = {}) {
  const caixa = Math.max(0, num(caixaUsd));
  const base = (ativos || []).filter((a) => num(a.precoAtual) > 0);
  if (!(caixa > 0) || !base.length) return { itens: [], sobra: arred(caixa), usado: 0 };
  const avaliados = base.map((a) => {
    const m = momentoAporte(a, 'acoesEua', metas, hoje, { metasObjetivos, cambio });
    const r = a.radar || {};
    const falta = typeof r.percentualDesejado === 'number' && typeof r.percentualAtual === 'number' ? Math.max(0, r.percentualDesejado - r.percentualAtual) : 0;
    return { a, m, falta, preco: a.precoAtual };
  });
  let candidatos = avaliados.filter((x) => x.m.nivel !== 'esperar');
  if (!candidatos.length) candidatos = avaliados;
  let comPeso = candidatos.filter((x) => x.falta > 0);
  if (!comPeso.length) comPeso = candidatos.filter((x) => x.m.nivel === 'bom');
  if (!comPeso.length) comPeso = candidatos;
  const pesoDe = (x) => (x.falta > 0 ? x.falta : 0.0001 + Math.max(0, x.m.pontos || 0) / 1000);
  const somaPesos = comPeso.reduce((s, x) => s + pesoDe(x), 0);
  const itens = comPeso.map((x) => {
    const alvoUsd = caixa * pesoDe(x) / somaPesos;
    return { ...x, alvoUsd, qtd: Math.floor(alvoUsd / x.preco + 1e-9) };
  });
  let usado = itens.reduce((s, x) => s + x.qtd * x.preco, 0);
  // troco: uma ação por vez pra quem mais "deve" (alvo - já comprado), enquanto couber
  for (let guarda = 0; guarda < 200; guarda++) {
    const cabem = itens.filter((x) => x.preco <= caixa - usado + 1e-9);
    if (!cabem.length) break;
    cabem.sort((p, q) => (q.alvoUsd - q.qtd * q.preco) - (p.alvoUsd - p.qtd * p.preco));
    cabem[0].qtd += 1;
    usado += cabem[0].preco;
  }
  const resultado = itens.filter((x) => x.qtd > 0).map((x) => ({
    ticker: x.a.ticker, qtd: x.qtd, preco: x.preco, valor: arred(x.qtd * x.preco),
    motivo: x.falta > 0
      ? `${(x.a.radar.percentualAtual * 100).toFixed(1).replace('.', ',')}% de ${(x.a.radar.percentualDesejado * 100).toFixed(1).replace('.', ',')}% desejado no Radar`
      : x.m.rotulo.toLowerCase(),
  }));
  usado = resultado.reduce((s, x) => s + x.valor, 0);
  return { itens: resultado, sobra: arred(caixa - usado), usado: arred(usado) };
}

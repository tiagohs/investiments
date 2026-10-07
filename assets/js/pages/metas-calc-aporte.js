/**
 * metas-calc-aporte.js - 07/10/2026 (Tiago, meta de uma chácara com amigos: "invisto R$ 200/mês - no 1º ano foi R$ 100 - e a gente
 * pretende aumentar R$ 100 a cada ano"): APORTE CRESCENTE. Funciona em qualquer meta com aporte informado (Aposentadoria inclusive).
 *
 * O que a meta guarda (Metas.gs!normalizarMeta_ conserva todos os campos):
 *   aporteMensal                    o aporte do mês `referencia` (o "de hoje" quando a pessoa digitou);
 *   aporteCrescimento: {
 *     tipo: 'valor' | 'pct',        aumenta R$ por ano ou % ao ano;
 *     valor,                        R$ (tipo 'valor') ou fração 0-1 (tipo 'pct');
 *     mes,                          mês do reajuste (1-12); vazio = o mês de `referencia` (padrão: o mês em que a meta foi criada);
 *     referencia,                   'aaaa-mm' a que `aporteMensal` se refere (o site grava o mês de hoje ao digitar o aporte);
 *     inicio,                       'aaaa-mm' em que começou a aportar (opcional - só pra contar o histórico, ex. o 1º ano de R$ 100)
 *   }
 * A cada mês de reajuste o aporte sobe um degrau (R$ + valor, ou x (1 + %)). Meses antes da referência desfazem os degraus.
 * Sem `aporteCrescimento` nada muda: o aporte é o mesmo todo mês (comportamento anterior).
 *
 * Funções puras. Mês = 'aaaa-mm'.
 */
import { mesDe, somarMeses, num, r2 } from './metas-calc-nucleo.js';

const idx = (mes) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1;

/** O crescimento da meta já conferido ({ tipo, valor, mes, referencia, inicio }) ou null (sem crescimento válido). */
export function crescimentoDaMeta(meta) {
  const c = meta && meta.aporteCrescimento;
  if (!c || typeof c !== 'object') return null;
  const tipo = c.tipo === 'pct' ? 'pct' : 'valor';
  const valor = num(c.valor);
  if (!(valor > 0)) return null;
  const mes = num(c.mes);
  return {
    tipo, valor, mes: mes >= 1 && mes <= 12 ? Math.round(mes) : null,
    referencia: mesDe(c.referencia) || null, inicio: mesDe(c.inicio) || null,
  };
}

/** Quantos meses de reajuste (mês do ano = `mesReaj`, 1-12) existem em (de, ate] - 'aaaa-mm'. */
export function degrausEntre(de, ate, mesReaj) {
  const a = idx(de); const b = idx(ate);
  if (b <= a) return 0;
  const r = mesReaj - 1;
  return Math.floor((b - r) / 12) - Math.floor((a - r) / 12);
}

/**
 * Plano do aporte da meta (null = aporte constante). `hoje`: 'aaaa-mm[-dd]'.
 * { base, referencia, tipo, valor, mesReajuste, inicio }
 */
export function planoAporte(meta, hoje) {
  const base = num(meta && meta.aporteMensal);
  if (!(base > 0)) return null;
  const c = crescimentoDaMeta(meta);
  if (!c) return null;
  const mesHoje = mesDe(hoje) || mesDe(new Date());
  const referencia = c.referencia || mesDe(meta.criadaEm) || mesHoje;
  const mesReajuste = c.mes || Number(referencia.slice(5, 7));
  return { base, referencia, tipo: c.tipo, valor: c.valor, mesReajuste, inicio: c.inicio };
}

/** O aporte de um mês ('aaaa-mm'). Antes do início: 0. */
export function aporteNoMes(plano, mes) {
  const m = mesDe(mes);
  if (!plano || !m) return 0;
  if (plano.inicio && m < plano.inicio) return 0;
  let v;
  if (m >= plano.referencia) {
    const n = degrausEntre(plano.referencia, m, plano.mesReajuste);
    v = plano.tipo === 'pct' ? plano.base * Math.pow(1 + plano.valor, n) : plano.base + n * plano.valor;
  } else {
    const n = degrausEntre(m, plano.referencia, plano.mesReajuste);
    v = plano.tipo === 'pct' ? plano.base / Math.pow(1 + plano.valor, n) : Math.max(0, plano.base - n * plano.valor);
  }
  return r2(v);
}

/** k (1 = o mês que vem) -> aporte daquele mês; é o que trajetoriaMensal/prazoParaAlvo aceitam no lugar do número. */
export function aporteFn(plano, hoje) {
  const h = mesDe(hoje) || mesDe(new Date());
  return (k) => aporteNoMes(plano, somarMeses(h, k));
}

/** O próximo reajuste depois de `hoje`: { mes, valor } (null sem plano). */
export function proximoReajuste(plano, hoje) {
  if (!plano) return null;
  const h = mesDe(hoje) || mesDe(new Date());
  const n = ((plano.mesReajuste - Number(h.slice(5, 7))) + 12) % 12 || 12;
  const mes = somarMeses(h, n);
  return { mes, valor: aporteNoMes(plano, mes) };
}

/** Soma dos aportes de `inicio` até o mês passado (null sem `inicio`). Os meses vazios antes da referência usam os degraus desfeitos. */
export function totalAportadoDesde(plano, hoje) {
  if (!plano || !plano.inicio) return null;
  const h = mesDe(hoje) || mesDe(new Date());
  let total = 0;
  for (let m = plano.inicio, i = 0; m < h && i < 1200; m = somarMeses(m, 1), i += 1) total += aporteNoMes(plano, m);
  return r2(total);
}

/**
 * Tudo que a tela mostra do aporte crescente: { hoje, proximo: { mes, valor }, tipo, valor, mesReajuste, inicio, aporteInicial, totalAportado }.
 * (`hoje` = o aporte do mês atual, já com os degraus que passaram desde a referência.)
 */
export function resumoAporteCrescente(plano, hoje) {
  if (!plano) return null;
  const h = mesDe(hoje) || mesDe(new Date());
  return {
    hoje: aporteNoMes(plano, h), proximo: proximoReajuste(plano, h), tipo: plano.tipo, valor: plano.valor, mesReajuste: plano.mesReajuste,
    inicio: plano.inicio, aporteInicial: plano.inicio ? aporteNoMes(plano, plano.inicio) : null, totalAportado: totalAportadoDesde(plano, h),
  };
}

/** Aporte "como a conta usa": a função por mês quando há crescimento, senão o número (calc.aporteAtual). */
export function aporteDeCalc(calc) {
  if (calc && calc.planoAporte) return aporteFn(calc.planoAporte, calc.hoje);
  return (calc && calc.aporteAtual) || 0;
}

/** Soma `extra` (R$/mês) a um aporte que pode ser número ou função por mês. */
export function somarAporte(aporte, extra) {
  return typeof aporte === 'function' ? (k) => aporte(k) + extra : (aporte || 0) + extra;
}

/**
 * Ao abrir a meta pra editar: o aporte informado passa a ser o de HOJE (com os degraus que já passaram) e a referência vira o mês de hoje -
 * assim o campo "Seu aporte mensal" mostra o valor de verdade (não o de quando a meta foi salva). Muda a meta que recebe (um clone).
 */
export function rebasearAporte(meta, hoje) {
  const plano = planoAporte(meta, hoje);
  const h = mesDe(hoje) || mesDe(new Date());
  if (!plano) return meta;
  meta.aporteMensal = aporteNoMes(plano, h);
  meta.aporteCrescimento = { ...meta.aporteCrescimento, referencia: h, mes: meta.aporteCrescimento.mes || plano.mesReajuste };
  return meta;
}

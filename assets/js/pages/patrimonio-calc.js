/**
 * patrimonio-calc.js - 27/09/2026: contas da aba Patrimônio da Organização
 * Financeira (sem DOM - organizacao-patrimonio.js desenha).
 *
 * Tiago: "Qual meu patrimônio total? ... quanto de fato eu tenho ... meu
 * histórico ... minha meta futura ... no meu ritmo atual, quanto tempo
 * levaria ... dicas".
 *
 *  - Patrimônio líquido = o que tem (investimentos, reserva, apê a valor de
 *    mercado estimado, FGTS, outros bens) − o que deve (financiamento, FIES,
 *    outras dívidas).
 *  - Apê: valor de compra corrigido pelo FipeZap da cidade e/ou pelo IVG-R
 *    (Banco Central), ou o valor que o Tiago digitar.
 *  - Dívidas "no automático": o saldo anda sozinho mês a mês - financiamento
 *    SAC (amortização fixa, com os saldos conhecidos e as amortizações extras
 *    como âncoras) e FIES Price (parcela fixa, sempre paga em dia).
 *  - Meta da aposentadoria: a renda da Distribuição e Metas SEM as parcelas
 *    das dívidas (quitadas até lá) - o "descontar" é explícito e editável.
 *  - Projeção, Coast FI, simulador "amortizar ou investir" e o que acelera.
 *
 * Datas: 'aaaa-mm-dd' ou 'aaaa-mm'; meses são 'aaaa-mm'.
 */

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;
const soma = (arr, f = (x) => x) => (arr || []).reduce((s, x) => s + (Number(f(x)) || 0), 0);

// ---------------------------------------------------------------------------
// Meses
// ---------------------------------------------------------------------------

export const mesDe = (d) => String(d || '').slice(0, 7);
/** b − a, em meses. */
export function difMeses(a, b) {
  const [ya, ma] = mesDe(a).split('-').map(Number);
  const [yb, mb] = mesDe(b).split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export function somarMeses(mes, n) {
  const [y, m] = mesDe(mes).split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
/** Último ponto [mes, valor] com mes <= alvo (a série vem em ordem crescente). */
export function pontoAte(serie, mes) {
  let achado = null;
  for (const p of serie || []) {
    if (!Array.isArray(p) || !num(p[1])) continue;
    if (p[0] <= mes) achado = p; else break;
  }
  return achado;
}

// ---------------------------------------------------------------------------
// Apartamento: valor estimado pelos índices
// ---------------------------------------------------------------------------

export const METODOS_IMOVEL = {
  media: 'Média dos dois índices', fipezap: 'FipeZap da cidade', ivgr: 'IVG-R (Banco Central)', manual: 'Valor que eu informei', compra: 'Valor de compra',
};

/** Quanto o índice andou entre dois meses (usa o último mês disponível de cada lado). */
export function fatorIndice(serie, de, ate) {
  if (!serie || !serie.length) return null;
  const a = pontoAte(serie, de);
  const b = pontoAte(serie, ate);
  if (!a || !b || !(a[1] > 0)) return null;
  return { fator: b[1] / a[1], de: a[0], ate: b[0] };
}

export function valorImovel(imovel, indices, mes) {
  if (!imovel || !num(imovel.valorCompra) || !imovel.dataCompra) return null;
  const compra = mesDe(imovel.dataCompra);
  if (mes < compra) return { valor: 0, metodo: 'antes', compra: imovel.valorCompra };
  const fz = fatorIndice(indices && indices.fipezap, compra, mes);
  const iv = fatorIndice(indices && indices.ivgr, compra, mes);
  const est = {
    fipezap: fz ? { valor: r2(imovel.valorCompra * fz.fator), fator: fz.fator, ate: fz.ate } : null,
    ivgr: iv ? { valor: r2(imovel.valorCompra * iv.fator), fator: iv.fator, ate: iv.ate } : null,
  };
  const disponiveis = [est.fipezap, est.ivgr].filter(Boolean);
  const media = disponiveis.length ? r2(soma(disponiveis, (x) => x.valor) / disponiveis.length) : null;
  let metodo = imovel.metodo || 'media';
  let valor;
  if (metodo === 'manual' && num(imovel.valorManual) && (!imovel.dataValorManual || mesDe(imovel.dataValorManual) <= mes)) valor = imovel.valorManual;
  else if (metodo === 'fipezap' && est.fipezap) valor = est.fipezap.valor;
  else if (metodo === 'ivgr' && est.ivgr) valor = est.ivgr.valor;
  else if (metodo === 'compra') valor = imovel.valorCompra;
  else if (media != null) { valor = media; if (metodo !== 'media') metodo = 'media'; }
  else { valor = imovel.valorCompra; metodo = 'compra'; }
  return { valor, metodo, compra: imovel.valorCompra, media, ...est, valorizacao: valor / imovel.valorCompra - 1 };
}

// ---------------------------------------------------------------------------
// Financiamento (SAC) e FIES (Price)
// ---------------------------------------------------------------------------

/** Amortizações extras (manuais + usos do FGTS na moradia depois do início do financiamento). */
export function extrasFinanciamento(fin, fgts) {
  if (!fin) return [];
  const inicio = fin.dataInicio ? mesDe(fin.dataInicio) : null;
  const manuais = (fin.amortizacoesExtras || []).filter((e) => e && num(e.valor) && e.data).map((e) => ({ data: e.data, valor: e.valor, origem: e.origem || 'manual' }));
  const doFgts = fin.usarFgtsComoExtra === false ? [] : usosMoradiaFgts(fgts)
    .filter((u) => inicio && mesDe(u.data) > inicio)
    .filter((u) => !manuais.some((m) => mesDe(m.data) === mesDe(u.data)))
    .map((u) => ({ data: u.data, valor: u.valor, origem: 'fgts' }));
  return [...manuais, ...doFgts].sort((a, b) => (a.data < b.data ? -1 : 1));
}

/**
 * Saldo do financiamento no fim de `mes`. Âncoras: os saldos conhecidos
 * (extrato + os que o Tiago informar) e o valor financiado no início. Entre
 * duas âncoras, linha reta; as amortizações extras entram no mês em que
 * aconteceram (degrau); depois da última âncora, SAC: cai a amortização do mês.
 */
export function saldoFinanciamento(fin, mes, extras = []) {
  if (!fin || !num(fin.saldo) || !fin.dataSaldo) return null;
  const inicio = fin.dataInicio ? mesDe(fin.dataInicio) : null;
  if (inicio && mes < inicio) return 0;
  const acum = (m) => soma(extras.filter((e) => mesDe(e.data) <= m), (e) => e.valor);
  const ancoras = [
    ...(inicio && num(fin.valorFinanciado) ? [{ mes: inicio, saldo: fin.valorFinanciado }] : []),
    ...(fin.saldosConhecidos || []).filter((s) => s && num(s.saldo) && s.data).map((s) => ({ mes: mesDe(s.data), saldo: s.saldo })),
    { mes: mesDe(fin.dataSaldo), saldo: fin.saldo },
  ].sort((a, b) => (a.mes < b.mes ? -1 : 1))
    .filter((a, i, arr) => i === arr.length - 1 || a.mes !== arr[i + 1].mes)
    .map((a) => ({ ...a, ajustado: a.saldo + acum(a.mes) }));
  const ultima = ancoras[ancoras.length - 1];
  if (mes >= ultima.mes) {
    const A = num(fin.amortizacao) && fin.amortizacao > 0 ? fin.amortizacao : (fin.prazoRestante ? fin.saldo / fin.prazoRestante : 0);
    const depois = soma(extras.filter((e) => mesDe(e.data) > ultima.mes && mesDe(e.data) <= mes), (e) => e.valor);
    return r2(Math.max(0, ultima.saldo - A * difMeses(ultima.mes, mes) - depois));
  }
  if (mes <= ancoras[0].mes) return r2(ancoras[0].saldo);
  let k = 0;
  while (ancoras[k + 1].mes < mes) k += 1;
  const a = ancoras[k]; const b = ancoras[k + 1];
  const f = difMeses(a.mes, mes) / difMeses(a.mes, b.mes);
  return r2(Math.max(0, a.ajustado + (b.ajustado - a.ajustado) * f - acum(mes)));
}

/** Meses até o financiamento zerar (SAC, sem extras futuros). */
export function mesesRestantesFinanciamento(fin) {
  if (!fin || !num(fin.saldo)) return null;
  if (num(fin.amortizacao) && fin.amortizacao > 0) return Math.ceil(fin.saldo / fin.amortizacao - 1e-9);
  return fin.prazoRestante || null;
}

/** Saldo do FIES no fim de `mes` (Price: s(k) = s0(1+i)^k − P((1+i)^k − 1)/i; pra trás, a mesma conta invertida). */
export function saldoFies(fies, mes) {
  if (!fies || !num(fies.saldo) || !fies.dataSaldo) return null;
  const i = fies.taxaMensal || 0;
  const P = fies.parcela || 0;
  let alvo = mes;
  if (fies.inicioAmortizacao && mes < fies.inicioAmortizacao) alvo = fies.inicioAmortizacao;
  const k = difMeses(fies.dataSaldo, alvo);
  if (fies.contratacao && mes < mesDe(fies.contratacao)) return 0;
  const g = (1 + i) ** Math.abs(k);
  const a = i > 0 ? (g - 1) / i : Math.abs(k);
  if (k >= 0) return r2(Math.max(0, fies.saldo * g - P * a));
  return r2((fies.saldo + P * a) / g);
}

export function mesesRestantesFies(fies, hoje) {
  if (!fies) return null;
  if (fies.fim && hoje) return Math.max(0, difMeses(hoje, fies.fim));
  if (num(fies.restantes)) return fies.restantes;
  const i = fies.taxaMensal; const P = fies.parcela; const S = fies.saldo;
  if (!(i > 0) || !(P > S * i)) return null;
  return Math.ceil(-Math.log(1 - (S * i) / P) / Math.log(1 + i));
}

const pmt = (s, i, n) => (n <= 0 ? s : i > 0 ? (s * i) / (1 - (1 + i) ** -n) : s / n);

/**
 * Cronograma mês a mês (t = 1 é a próxima parcela). `extras` {t: valor} são
 * amortizações a mais pagas junto da parcela do mês t (t = 0: agora);
 * modo 'prazo' mantém a parcela/amortização e termina antes, 'parcela'
 * recalcula a parcela pro prazo que falta.
 */
export function cronogramaDivida({ sistema = 'SAC', saldo, taxaMensal, meses, seguro = 0, amortizacao = null, parcela = null, extras = {}, extraMensal = 0, modo = 'prazo' }) {
  let s = saldo;
  const i = taxaMensal || 0;
  let A = sistema === 'SAC' ? (num(amortizacao) && amortizacao > 0 ? amortizacao : s / meses) : null;
  let P = sistema === 'Price' ? (num(parcela) && parcela > 0 ? parcela : pmt(s, i, meses)) : null;
  const e0 = Math.min(extras[0] || 0, s);
  s -= e0;
  if (e0 > 0 && modo === 'parcela') { if (sistema === 'SAC') A = s / meses; else P = pmt(s, i, meses); }
  const linhas = [];
  for (let t = 1; t <= meses + 600 && s > 0.005; t += 1) {
    const juros = s * i;
    const amort = Math.min(sistema === 'SAC' ? A : Math.max(0, P - juros), s);
    s -= amort;
    let extra = 0;
    if (s > 0.005) {
      extra = Math.min((extras[t] || 0) + extraMensal, s);
      s -= extra;
      if (extra > 0 && modo === 'parcela') {
        const resta = Math.max(1, meses - t);
        if (sistema === 'SAC') A = s / resta; else P = pmt(s, i, resta);
      }
    }
    linhas.push({ t, juros, amortizacao: amort, extra, pagamento: amort + juros + (amort > 0 ? seguro : 0), saldo: Math.max(0, s) });
  }
  return linhas;
}

/** Os parâmetros do cronograma a partir do que está salvo (financiamento/FIES). */
export function parametrosDivida(qual, cfg, hoje) {
  if (qual === 'financiamento') {
    const meses = mesesRestantesFinanciamento(cfg);
    return { sistema: 'SAC', saldo: saldoFinanciamento(cfg, mesDe(hoje)) ?? cfg.saldo, taxaMensal: (cfg.taxaAnual || 0) / 12, meses, seguro: cfg.seguroTaxas || 0, amortizacao: cfg.amortizacao };
  }
  const meses = mesesRestantesFies(cfg, hoje);
  return { sistema: 'Price', saldo: saldoFies(cfg, mesDe(hoje)) ?? cfg.saldo, taxaMensal: cfg.taxaMensal || 0, meses, seguro: 0, parcela: cfg.parcela };
}

/**
 * "Amortizar ou investir?" - mesmo dinheiro saindo do bolso nos dois
 * caminhos. A: o extra vai pra dívida; o que deixa de pagar (parcelas
 * menores/quitação antes) vai pro investimento. B: o extra vai direto pro
 * investimento. Compara o patrimônio no mês em que a dívida acabaria.
 */
export function amortizarOuInvestir(divida, { valor = 0, mensal = 0, modo = 'prazo', rendimentoAnual = 0.1 } = {}) {
  if (!divida || !num(divida.saldo) || !(divida.saldo > 0) || !(divida.meses > 0)) return null;
  const base = cronogramaDivida({ ...divida });
  const comExtra = cronogramaDivida({ ...divida, extras: { 0: valor }, extraMensal: mensal, modo });
  const n = base.length;
  const patrimonio = (rv) => {
    const iv = (1 + rv) ** (1 / 12) - 1;
    let wa = 0; let wb = valor;
    for (let t = 1; t <= n; t += 1) {
      const pb = base[t - 1] ? base[t - 1].pagamento : 0;
      const la = comExtra[t - 1];
      const pa = la ? la.pagamento + la.extra : 0;
      wa = wa * (1 + iv) + (pb + mensal - pa);
      wb = wb * (1 + iv) + mensal;
    }
    return { a: wa, b: wb };
  };
  const res = patrimonio(rendimentoAnual);
  let lo = 0; let hi = 0.6;
  const dif = (r) => { const p = patrimonio(r); return p.a - p.b; };
  let empate = null;
  if (dif(lo) > 0 && dif(hi) < 0) {
    for (let k = 0; k < 50; k += 1) { const m = (lo + hi) / 2; if (dif(m) > 0) lo = m; else hi = m; }
    empate = (lo + hi) / 2;
  }
  const jurosBase = soma(base, (l) => l.juros);
  const jurosExtra = soma(comExtra, (l) => l.juros);
  return {
    meses: n,
    mesesComExtra: comExtra.length,
    mesesAMenos: n - comExtra.length,
    jurosEconomizados: r2(jurosBase - jurosExtra),
    patrimonioAmortizando: r2(res.a),
    patrimonioInvestindo: r2(res.b),
    vantagemAmortizar: r2(res.a - res.b),
    melhor: res.a >= res.b ? 'amortizar' : 'investir',
    taxaEmpate: empate,
    parcelaAntes: base[0] ? r2(base[0].pagamento) : null,
    parcelaDepois: comExtra[0] ? r2(comExtra[0].pagamento) : null,
  };
}

// ---------------------------------------------------------------------------
// FGTS
// ---------------------------------------------------------------------------

export function usosMoradiaFgts(fgts) {
  const usos = [];
  ((fgts && fgts.contas) || []).forEach((c) => (c.usosMoradia || []).forEach((u) => {
    const x = usos.find((y) => y.data === u.data);
    if (x) x.valor = r2(x.valor + u.valor); else usos.push({ data: u.data, valor: u.valor });
  }));
  // mesmo mês em contas diferentes = um uso só
  const porMes = [];
  usos.sort((a, b) => (a.data < b.data ? -1 : 1)).forEach((u) => {
    const x = porMes.find((y) => mesDe(y.data) === mesDe(u.data));
    if (x) x.valor = r2(x.valor + u.valor); else porMes.push({ ...u });
  });
  return porMes;
}

export function saldoFgtsEm(fgts, mes) {
  const contas = (fgts && fgts.contas) || [];
  if (!contas.length) return null;
  return r2(soma(contas, (c) => { const p = pontoAte(c.mensal, mes); return p ? p[1] : 0; }));
}

/**
 * Saque-aniversário (Lei 8.036/90, anexo): alíquota sobre o saldo total do
 * FGTS + parcela adicional fixa, pela faixa do saldo. Ex.: R$ 13.570,53 ->
 * 15% + R$ 1.150 = R$ 3.185,58; acima de R$ 15.000 -> 10% + R$ 1.900.
 */
export const FAIXAS_SAQUE_ANIVERSARIO = [
  { ate: 500, aliquota: 0.5, adicional: 0 },
  { ate: 1000, aliquota: 0.4, adicional: 50 },
  { ate: 5000, aliquota: 0.3, adicional: 150 },
  { ate: 10000, aliquota: 0.2, adicional: 650 },
  { ate: 15000, aliquota: 0.15, adicional: 1150 },
  { ate: 20000, aliquota: 0.1, adicional: 1900 },
  { ate: Infinity, aliquota: 0.05, adicional: 2900 },
];

export function saqueAniversario(saldo) {
  if (!(saldo > 0)) return { valor: 0, aliquota: 0, adicional: 0 };
  const f = FAIXAS_SAQUE_ANIVERSARIO.find((x) => saldo <= x.ate + 1e-9);
  return { valor: r2(saldo * f.aliquota + f.adicional), aliquota: f.aliquota, adicional: f.adicional };
}

/**
 * Saldo do FGTS mês a mês de `de` até `ate` ('aaaa-mm'): depósito todo mês
 * (~dia 10), JAM (~3% a.a. + TR) e, se estiver no saque-aniversário, o
 * saque no mês do aniversário (sai no começo do mês, antes do depósito).
 */
export function projetarFgtsMensal(saldo, depositoMensal, de, ate, { mesAniversario = null, jamMensal = 0.004 } = {}) {
  let s = saldo || 0;
  const saques = [];
  for (let m = somarMeses(de, 1); m <= ate; m = somarMeses(m, 1)) {
    if (mesAniversario && Number(m.slice(5, 7)) === mesAniversario) {
      const sa = saqueAniversario(s);
      s -= sa.valor;
      saques.push({ mes: m, ...sa, saldoAntes: r2(s + sa.valor) });
    }
    if (m < ate) s = s * (1 + jamMensal) + (depositoMensal || 0);
  }
  return { saldo: r2(s), saques };
}

export function resumoFgts(fgts, hoje, { nascimento = null, depositoMensal = null } = {}) {
  const contas = (fgts && fgts.contas) || [];
  if (!contas.length) return null;
  const saques = {};
  contas.forEach((c) => Object.entries(c.saques || {}).forEach(([k, v]) => { saques[k] = r2((saques[k] || 0) + (v || 0)); }));
  const usos = usosMoradiaFgts(fgts);
  const ultimoUso = usos[usos.length - 1] || null;
  const ativa = [...contas].filter((c) => !c.afastamento).sort((a, b) => ((a.dataSaldo || '') < (b.dataSaldo || '') ? 1 : -1))[0] || null;
  return {
    saldo: r2(soma(contas, (c) => c.saldo)),
    depositos: r2(soma(contas, (c) => c.depositos)),
    rendimentos: r2(soma(contas, (c) => (c.jam || 0) + (c.lucros || 0))),
    saques,
    totalSacado: r2(soma(Object.values(saques))),
    usosMoradia: usos,
    usadoMoradia: r2(soma(usos, (u) => u.valor)),
    ultimoUsoMoradia: ultimoUso,
    // a Caixa libera uma nova amortização/liquidação com FGTS a cada 2 anos
    proximaAmortizacao: ultimoUso ? somarMeses(ultimoUso.data, 24) : mesDe(hoje),
    contaAtiva: ativa,
    desde: contas.map((c) => c.admissao).filter(Boolean).sort()[0] || null,
    aniversario: resumoSaqueAniversario(contas, hoje, { nascimento, depositoMensal, saldo: r2(soma(contas, (c) => c.saldo)), ativa }),
  };
}

/**
 * Está no saque-aniversário? (houve saque cód. 60 nos últimos 13 meses) e
 * quanto é o próximo: com o saldo de hoje (o que o app do FGTS simula) e
 * com o saldo projetado até o mês do aniversário.
 */
function resumoSaqueAniversario(contas, hoje, { nascimento, depositoMensal, saldo, ativa }) {
  const lista = [];
  contas.forEach((c) => (c.saquesAniversario || []).forEach((u) => lista.push(u)));
  lista.sort((a, b) => (a.data < b.data ? -1 : 1));
  const ultimo = lista[lista.length - 1] || null;
  const totalSacado = r2(soma(contas, (c) => (c.saques && c.saques.aniversario) || 0));
  const mesHoje = mesDe(hoje);
  const ativo = !!(ultimo && difMeses(ultimo.data, mesHoje) <= 13);
  const mesAniv = nascimento ? Number(String(nascimento).slice(5, 7)) : (ultimo ? Number(ultimo.data.slice(5, 7)) : null);
  if (!mesAniv) return { ativo, ultimo, totalSacado, saques: lista };
  let proximo = `${mesHoje.slice(0, 4)}-${String(mesAniv).padStart(2, '0')}`;
  if (proximo < mesHoje || (ultimo && mesDe(ultimo.data) === proximo)) proximo = somarMeses(proximo, 12);
  const base = ativa && ativa.dataSaldo ? mesDe(ativa.dataSaldo) : mesHoje;
  const dep = num(depositoMensal) ? depositoMensal : 0;
  const proj = projetarFgtsMensal(saldo, dep, base, proximo, { mesAniversario: mesAniv });
  const noMes = proj.saques[proj.saques.length - 1] || null;
  return {
    ativo, ultimo, totalSacado, saques: lista, mesAniversario: mesAniv, proximo,
    comSaldoDeHoje: { saldo, ...saqueAniversario(saldo) },
    estimado: noMes ? { saldo: noMes.saldoAntes, valor: noMes.valor, aliquota: noMes.aliquota, adicional: noMes.adicional } : null,
    // fica disponível do 1º dia útil do mês do aniversário até o último dia útil do 2º mês seguinte
    ate: somarMeses(proximo, 2),
  };
}

/** Saldo do FGTS daqui a `meses`: depósito de 8% do salário + JAM (~3% a.a. + TR). */
export function projetarFgts(saldo, depositoMensal, meses, jamMensal = 0.004) {
  let s = saldo || 0;
  for (let k = 0; k < meses; k += 1) s = s * (1 + jamMensal) + (depositoMensal || 0);
  return r2(s);
}

// ---------------------------------------------------------------------------
// Carreira (CTPS)
// ---------------------------------------------------------------------------

export function linhaSalarios(carreira) {
  const out = [];
  ((carreira && carreira.contratos) || []).forEach((c) => (c.salarios || []).forEach((s) => out.push({ data: s.data, valor: s.valor, empregador: c.empregador })));
  return out.sort((a, b) => (a.data < b.data ? -1 : 1));
}

export function salarioEm(carreira, data) {
  const l = linhaSalarios(carreira).filter((s) => s.data <= data);
  return l.length ? l[l.length - 1].valor : null;
}

/** Crescimento médio ao ano do salário contratual nos últimos `anos`. */
export function crescimentoSalario(carreira, hoje, anos = 5) {
  const atual = salarioEm(carreira, hoje);
  const [y, m, d] = String(hoje).split('-');
  const antes = salarioEm(carreira, `${Number(y) - anos}-${m}-${d || '01'}`);
  if (!num(atual) || !num(antes) || !(antes > 0)) return null;
  return { atual, antes, anos, taxa: (atual / antes) ** (1 / anos) - 1 };
}

// ---------------------------------------------------------------------------
// Balanço de hoje e histórico
// ---------------------------------------------------------------------------

export function balanco(d) {
  const cfg = d.config || {};
  const mes = mesDe(d.hoje);
  const inv = d.investimentos || {};
  const ativos = [];
  const dividas = [];
  if (num(inv.longoPrazo)) ativos.push({ id: 'investimentos', nome: 'Investimentos', valor: inv.longoPrazo, porClasse: inv.porClasse || null });
  if (num(inv.reserva)) ativos.push({ id: 'reserva', nome: 'Reserva de emergência', valor: inv.reserva });
  const imo = valorImovel(cfg.imovel, d.indices, mes);
  if (imo) ativos.push({ id: 'imovel', nome: (cfg.imovel && cfg.imovel.nome) || 'Apartamento', valor: imo.valor, imovel: imo });
  const fg = saldoFgtsEm(cfg.fgts, mes);
  if (fg != null) ativos.push({ id: 'fgts', nome: 'FGTS', valor: fg });
  (cfg.outros || []).filter((o) => o && o.tipo !== 'divida' && num(o.valor)).forEach((o) => ativos.push({ id: `outro:${o.id}`, nome: o.nome, valor: o.valor, outro: o }));
  const extras = extrasFinanciamento(cfg.financiamento, cfg.fgts);
  const fin = saldoFinanciamento(cfg.financiamento, mes, extras);
  if (fin != null) dividas.push({ id: 'financiamento', nome: 'Financiamento do apê', valor: fin });
  const fi = saldoFies(cfg.fies, mes);
  if (fi != null) dividas.push({ id: 'fies', nome: 'FIES', valor: fi });
  (cfg.outros || []).filter((o) => o && o.tipo === 'divida' && num(o.valor)).forEach((o) => dividas.push({ id: `outro:${o.id}`, nome: o.nome, valor: o.valor, outro: o }));
  const totalAtivos = r2(soma(ativos, (a) => a.valor));
  const totalDividas = r2(soma(dividas, (a) => a.valor));
  return {
    ativos, dividas, totalAtivos, totalDividas,
    liquido: r2(totalAtivos - totalDividas),
    imovel: imo ? { valor: imo.valor, saldo: fin || 0, seu: r2(imo.valor - (fin || 0)), pct: imo.valor > 0 ? (imo.valor - (fin || 0)) / imo.valor : null } : null,
    extras,
  };
}

/** Grupo 01 (imóveis) da declaração - no IR o apê entra pelo que já foi pago, não pelo valor de mercado. */
const imoveisIr = (a) => (a && a.grupos && a.grupos['01'] ? a.grupos['01'].atual || 0 : 0);

/**
 * Patrimônio no fim de cada ano: investimentos e contas do IR (valores
 * declarados, fora o imóvel) + apê pelo índice + FGTS dos extratos −
 * financiamento − FIES; o ano de hoje vem do balanço. Sem IR daquele ano, usa
 * o que o site tem (patrimônio de dezembro).
 */
export function historicoAnual(d) {
  const cfg = d.config || {};
  const anoHoje = Number(String(d.hoje).slice(0, 4));
  const irs = ((cfg.ir && cfg.ir.anos) || []).filter((a) => num(a.ano) && a.ano < anoHoje);
  const site = new Map((d.historicoMensal || []).filter((p) => /-12$/.test(p.mes)).map((p) => [Number(p.mes.slice(0, 4)), p]));
  const anos = [...new Set([...irs.map((a) => a.ano), ...site.keys()])].filter((a) => a < anoHoje).sort((a, b) => a - b);
  const extras = extrasFinanciamento(cfg.financiamento, cfg.fgts);
  // entrada paga com FGTS antes da escritura (até 12 meses antes): já é do apê
  const compra = cfg.imovel && cfg.imovel.dataCompra ? mesDe(cfg.imovel.dataCompra) : null;
  const entradaAntes = (mes) => (compra && mes < compra
    ? soma(usosMoradiaFgts(cfg.fgts).filter((u) => mesDe(u.data) <= mes && difMeses(u.data, compra) <= 12), (u) => u.valor) : 0);
  const linhas = anos.map((ano) => {
    const mes = `${ano}-12`;
    const ir = irs.find((a) => a.ano === ano);
    const s = site.get(ano);
    const investimentos = ir ? r2(ir.bens - imoveisIr(ir)) : (s ? s.patrimonio : null);
    const imo = valorImovel(cfg.imovel, d.indices, mes);
    const fin = saldoFinanciamento(cfg.financiamento, mes, extras);
    const fi = saldoFies(cfg.fies, mes);
    const fg = saldoFgtsEm(cfg.fgts, mes);
    return {
      ano, rotulo: String(ano), fonte: ir ? 'ir' : 's', investimentos: investimentos || 0,
      imovel: imo && imo.valor > 0 ? imo.valor : entradaAntes(mes), entradaImovel: !(imo && imo.valor > 0) && entradaAntes(mes) > 0,
      fgts: fg || 0, financiamento: fin || 0, fies: fi || 0,
      renda: ir ? ir.tributaveis : null, rendaTotal: ir ? soma([ir.tributaveis, ir.isentos, ir.exclusivos]) : null,
      imovelNoIr: ir ? imoveisIr(ir) : null, compraImovel: !!(cfg.imovel && mesDe(cfg.imovel.dataCompra).slice(0, 4) === String(ano)),
    };
  });
  const b = balanco(d);
  const val = (id) => { const x = [...b.ativos, ...b.dividas].find((a) => a.id === id); return x ? x.valor : 0; };
  linhas.push({
    ano: anoHoje, rotulo: 'hoje', hoje: true, fonte: 'site',
    investimentos: r2(val('investimentos') + val('reserva') + soma(b.ativos.filter((a) => a.outro), (a) => a.valor)),
    imovel: val('imovel'), fgts: val('fgts'), financiamento: val('financiamento'), fies: val('fies'),
    outrasDividas: soma(b.dividas.filter((a) => a.outro), (a) => a.valor), renda: null,
  });
  let anterior = null;
  return linhas.map((l) => {
    const ativos = r2(l.investimentos + l.imovel + l.fgts);
    const dividas = r2(l.financiamento + l.fies + (l.outrasDividas || 0));
    const liquido = r2(ativos - dividas);
    const noAno = anterior == null ? null : r2(liquido - anterior);
    anterior = liquido;
    return { ...l, ativos, dividas, liquido, noAno, convertido: num(noAno) && l.renda > 0 ? noAno / l.renda : null };
  });
}

// ---------------------------------------------------------------------------
// Meta da aposentadoria (sem as parcelas das dívidas)
// ---------------------------------------------------------------------------

export const PADRAO_PARCELA_DIVIDA = /fies|financiamento|(parcela|presta[cç][aã]o).*(ap[eêé](?![a-z])|apto|apart|casa|im[oó]vel)|^apartamento$/i;

const mensalDespesa = (it) => { const v = Number(it.valor) || 0; return /anual/i.test(it.frequencia || '') ? v / 12 : v; };

/**
 * A renda desejada da Distribuição e Metas parte do custo de vida de HOJE,
 * que inclui as parcelas do apê e do FIES. Aposentado, com as dívidas
 * quitadas, essas parcelas somem - então a renda e o patrimônio necessário
 * caem. `descontar`: nomes das despesas que são parcela de dívida (padrão:
 * as que parecem - FIES, financiamento, parcela do apê).
 */
export function metaAposentadoria(d, { descontar = null, taxaSaque = null } = {}) {
  const desp = d.despesas || {};
  const metas = d.metas || {};
  const folga = num(desp.folga) ? desp.folga : 0;
  const extra = num(metas.extra) ? metas.extra : 0;
  const reinv = num(metas.reinvestimento) ? metas.reinvestimento : 0;
  const rendimento = num(metas.rendimento) && metas.rendimento > 0 ? metas.rendimento : 0.06;
  const taxa = num(taxaSaque) && taxaSaque > 0 ? taxaSaque : rendimento;
  const itens = (desp.itens || []).filter((it) => it && it.nome).map((it) => {
    const marcado = Array.isArray(descontar) ? descontar.includes(it.nome) : PADRAO_PARCELA_DIVIDA.test(it.nome);
    return { nome: it.nome, mensal: r2(mensalDespesa(it)), descontar: marcado };
  });
  const parcelas = r2(soma(itens.filter((i) => i.descontar), (i) => i.mensal));
  const custoComFolga = num(desp.totalComFolga) ? desp.totalComFolga : r2(soma(itens, (i) => i.mensal) * (1 + folga));
  const rendaDM = num(metas.rendaDesejada) ? metas.rendaDesejada : r2((custoComFolga + extra) * (1 + reinv));
  const rendaSem = r2(Math.max(0, (custoComFolga - parcelas * (1 + folga) + extra) * (1 + reinv)));
  return {
    itens, folga, extra, reinvestimento: reinv, rendimento, taxa, custoComFolga,
    parcelas, parcelasComFolga: r2(parcelas * (1 + folga)),
    rendaDM, rendaSem,
    patrimonioDM: r2((rendaDM * 12) / taxa),
    patrimonioSem: r2((rendaSem * 12) / taxa),
    desejadoPlanilha: num(metas.desejado) ? metas.desejado : null,
  };
}

// ---------------------------------------------------------------------------
// Ritmo, projeção e Coast FI
// ---------------------------------------------------------------------------

/** Média do aporte de longo prazo nos últimos `meses` meses completos (o mês de hoje fica de fora). */
export function aporteMedio(historicoMensal, hoje, meses = 12, campo = 'aporteLongoPrazo') {
  const mesHoje = mesDe(hoje);
  const lista = (historicoMensal || []).filter((p) => p.mes < mesHoje && num(p[campo])).slice(-meses);
  if (!lista.length) return null;
  return r2(soma(lista, (p) => p[campo]) / lista.length);
}

/**
 * Investimentos mês a mês com aporte fixo e rendimento real (tudo em
 * dinheiro de hoje). `liberacoes`: [{ mes: n, valor }] - a partir do mês n o
 * aporte ganha `valor` (a parcela da dívida que acabou).
 */
export function projetarAposentadoria({ inicial = 0, aporte = 0, rendimentoReal = 0.05, alvo = null, liberacoes = [], maxMeses = 600, crescimentoAporte = 0 }) {
  const i = (1 + rendimentoReal) ** (1 / 12) - 1;
  const g = (1 + crescimentoAporte) ** (1 / 12) - 1;
  let v = inicial;
  let ap = aporte;
  const pontos = [{ m: 0, v }];
  let chegou = alvo != null && v >= alvo ? 0 : null;
  for (let m = 1; m <= maxMeses; m += 1) {
    const extra = soma(liberacoes.filter((l) => m > l.mes), (l) => l.valor);
    if (m > 1) ap *= 1 + g;
    v = v * (1 + i) + ap + extra;
    pontos.push({ m, v });
    if (chegou == null && alvo != null && v >= alvo) chegou = m;
  }
  return { pontos, chegou };
}

/** Quanto precisa ter hoje pra, sem aportar mais nada, chegar em `alvo` em `anos`. */
export function coastFi(alvo, rendimentoReal, anos) {
  if (!num(alvo) || !(anos > 0)) return null;
  return r2(alvo / (1 + rendimentoReal) ** anos);
}

export function idadeEm(nascimento, data) {
  if (!nascimento) return null;
  return difMeses(nascimento, data) / 12;
}

/** Quando cada dívida acaba (meses a partir de hoje) e quanto libera por mês. */
export function liberacoesDividas(d, meta) {
  const cfg = d.config || {};
  const out = [];
  const itens = (meta && meta.itens) || [];
  const valorDespesa = (re) => soma(itens.filter((i) => i.descontar && re.test(i.nome)), (i) => i.mensal);
  if (cfg.fies && num(cfg.fies.saldo)) {
    const n = mesesRestantesFies(cfg.fies, d.hoje);
    const v = valorDespesa(/fies/i) || cfg.fies.parcela || 0;
    if (n != null) out.push({ id: 'fies', nome: 'FIES quitado', mes: n, valor: r2(v) });
  }
  if (cfg.financiamento && num(cfg.financiamento.saldo)) {
    const hojeMes = mesDe(d.hoje);
    const saldoHoje = saldoFinanciamento(cfg.financiamento, hojeMes, extrasFinanciamento(cfg.financiamento, cfg.fgts));
    const A = cfg.financiamento.amortizacao || (cfg.financiamento.prazoRestante ? cfg.financiamento.saldo / cfg.financiamento.prazoRestante : null);
    const n = A ? Math.ceil(saldoHoje / A - 1e-9) : cfg.financiamento.prazoRestante;
    const v = valorDespesa(/^(?!.*fies)/i) || cfg.financiamento.parcela || 0;
    if (n != null) out.push({ id: 'financiamento', nome: 'Apê quitado', mes: n, valor: r2(v) });
  }
  return out.sort((a, b) => a.mes - b.mes);
}

// ---------------------------------------------------------------------------
// De onde veio o crescimento (últimos N meses)
// ---------------------------------------------------------------------------

/**
 * Quebra a variação do patrimônio líquido dos últimos `meses` em: aportes
 * (compras − vendas), rendimento dos investimentos (o resto da variação),
 * dívidas abatidas (financiamento + FIES), valorização do apê e FGTS.
 */
export function origemCrescimento(d, meses = 12) {
  const cfg = d.config || {};
  const hist = (d.historicoMensal || []).filter((p) => num(p.patrimonio));
  if (hist.length < 2) return null;
  const fim = hist[hist.length - 1];
  const iniMes = somarMeses(fim.mes, -meses);
  const ini = [...hist].reverse().find((p) => p.mes <= iniMes);
  if (!ini) return null;
  const periodo = hist.filter((p) => p.mes > ini.mes && p.mes <= fim.mes);
  const aportes = r2(soma(periodo, (p) => p.aporte));
  const varInv = r2(fim.patrimonio - ini.patrimonio);
  const extras = extrasFinanciamento(cfg.financiamento, cfg.fgts);
  const dif = (f) => { const a = f(ini.mes); const b = f(fim.mes); return num(a) && num(b) ? r2(b - a) : 0; };
  const fin = dif((m) => saldoFinanciamento(cfg.financiamento, m, extras));
  const fies = dif((m) => saldoFies(cfg.fies, m));
  const imovel = dif((m) => { const v = valorImovel(cfg.imovel, d.indices, m); return v ? v.valor : null; });
  const fgts = dif((m) => saldoFgtsEm(cfg.fgts, m));
  const itens = [
    { id: 'aportes', nome: 'Aportes (compras − vendas)', valor: aportes },
    { id: 'rendimento', nome: 'Rendimento dos investimentos', valor: r2(varInv - aportes) },
    { id: 'dividas', nome: 'Dívidas abatidas', valor: r2(-(fin + fies)) },
    { id: 'imovel', nome: 'Valorização do apê', valor: imovel },
    { id: 'fgts', nome: 'FGTS', valor: fgts },
  ];
  return { de: ini.mes, ate: fim.mes, itens, total: r2(soma(itens, (i) => i.valor)) };
}

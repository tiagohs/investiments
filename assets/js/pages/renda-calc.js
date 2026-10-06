/**
 * renda-calc.js - 02/10/2026: contas da seção "Renda" da aba "Renda e
 * Orçamentos" da Organização Financeira (sem DOM - organizacao-renda.js
 * desenha).
 *
 * Tiago: "Informações sobre o Salário: com as infos do meu IR, dá pra saber
 * quanto eu ganhei mensalmente e conforme os anos ... Gráficos com como meu
 * salário foi crescendo", "Quanto eu invisto por mês do meu salário", "eu
 * tenho que saber quais documentos preciso enviar mensalmente ou de vez em
 * quando, e o que dá pra ser automatizado".
 *
 * Fontes do salário de cada ano, nesta ordem de preferência:
 *  1. holerite (aba 'Salário', Salario.gs) - média dos meses recebidos;
 *  2. Carteira de Trabalho (aux_patrimonio 'carreira') - salário contratual
 *     de cada mês trabalhado no ano;
 *  3. declaração do IR (aux_patrimonio 'ir') - (rendimentos + 13º) ÷ 13,33
 *     (12 salários + 13º + 1/3 de férias) por mês trabalhado.
 * O total do ano e os impostos vêm da declaração quando ela existe (é o que
 * de fato entrou); sem ela, é estimado pelo salário do mês.
 * Inflação: IPCA mensal (IBGE, série 433 do Banco Central) - tabela abaixo,
 * atualizável no navegador com mesclarIpca (a API do BC aceita CORS).
 *
 * Datas: meses 'aaaa-mm', dias 'aaaa-mm-dd'. Taxas em fração (0,05 = 5%).
 */
import { valorDoMes } from './salario-calc.js';
import { formatNumeroPt, MESES_CURTOS, formatMesAno, formatDMA, formatPctAbs, formatBRL0 } from '../format.js'; // 05/10/2026 (A-68)

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (v) => Math.round(v * 100) / 100;
const soma = (arr, f = (x) => x) => (arr || []).reduce((s, x) => s + (Number(f(x)) || 0), 0);
const mesDe = (d) => String(d || '').slice(0, 7);
const anoDe = (d) => Number(String(d || '').slice(0, 4)) || null;
export function somarMeses(mes, n) {
  const [y, m] = mesDe(mes).split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function difMeses(a, b) {
  const [ya, ma] = mesDe(a).split('-').map(Number);
  const [yb, mb] = mesDe(b).split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
const isoDe = (hoje) => {
  if (hoje instanceof Date) return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  return String(hoje || '').slice(0, 10);
};

/** Fator do mês "12 salários + 13º + 1/3 de férias" ÷ 12. */
export const FATOR_ANO_CLT = 13 + 1 / 3;

// ---------------------------------------------------------------------------
// Inflação (IPCA)
// ---------------------------------------------------------------------------

/** IPCA mensal em % (IBGE; BCB SGS 433), por ano: jan..dez. Dado público. */
export const IPCA_MENSAL = {
  2010: [0.75, 0.78, 0.52, 0.57, 0.43, 0.00, 0.01, 0.04, 0.45, 0.75, 0.83, 0.63],
  2011: [0.83, 0.80, 0.79, 0.77, 0.47, 0.15, 0.16, 0.37, 0.53, 0.43, 0.52, 0.50],
  2012: [0.56, 0.45, 0.21, 0.64, 0.36, 0.08, 0.43, 0.41, 0.57, 0.59, 0.60, 0.79],
  2013: [0.86, 0.60, 0.47, 0.55, 0.37, 0.26, 0.03, 0.24, 0.35, 0.57, 0.54, 0.92],
  2014: [0.55, 0.69, 0.92, 0.67, 0.46, 0.40, 0.01, 0.25, 0.57, 0.42, 0.51, 0.78],
  2015: [1.24, 1.22, 1.32, 0.71, 0.74, 0.79, 0.62, 0.22, 0.54, 0.82, 1.01, 0.96],
  2016: [1.27, 0.90, 0.43, 0.61, 0.78, 0.35, 0.52, 0.44, 0.08, 0.26, 0.18, 0.30],
  2017: [0.38, 0.33, 0.25, 0.14, 0.31, -0.23, 0.24, 0.19, 0.16, 0.42, 0.28, 0.44],
  2018: [0.29, 0.32, 0.09, 0.22, 0.40, 1.26, 0.33, -0.09, 0.48, 0.45, -0.21, 0.15],
  2019: [0.32, 0.43, 0.75, 0.57, 0.13, 0.01, 0.19, 0.11, -0.04, 0.10, 0.51, 1.15],
  2020: [0.21, 0.25, 0.07, -0.31, -0.38, 0.26, 0.36, 0.24, 0.64, 0.86, 0.89, 1.35],
  2021: [0.25, 0.86, 0.93, 0.31, 0.83, 0.53, 0.96, 0.87, 1.16, 1.25, 0.95, 0.73],
  2022: [0.54, 1.01, 1.62, 1.06, 0.47, 0.67, -0.68, -0.36, -0.29, 0.59, 0.41, 0.62],
  2023: [0.53, 0.84, 0.71, 0.61, 0.23, -0.08, 0.12, 0.23, 0.26, 0.24, 0.28, 0.56],
  2024: [0.42, 0.83, 0.16, 0.38, 0.46, 0.21, 0.38, -0.02, 0.44, 0.56, 0.39, 0.52],
  2025: [0.16, 1.31, 0.56, 0.43, 0.26, 0.24, 0.26, -0.11, 0.48, 0.09, 0.18, 0.33],
  2026: [0.33, 0.70, 0.88, 0.67, 0.58, 0.16, 0.07, -0.32],
};
export const URL_IPCA_BCB = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2010';

/** Junta à tabela os meses da resposta da API do BC ([{ data: 'dd/mm/aaaa', valor: '0.42' }]). */
export function mesclarIpca(tabela, serieBcb) {
  const out = {};
  Object.entries(tabela || {}).forEach(([a, v]) => { out[a] = [...v]; });
  (serieBcb || []).forEach((p) => {
    const m = String(p && p.data || '').match(/^\d{2}\/(\d{2})\/(\d{4})$/);
    const v = Number(String(p && p.valor).replace(',', '.'));
    if (!m || !Number.isFinite(v)) return;
    const lista = out[m[2]] || (out[m[2]] = []);
    lista[Number(m[1]) - 1] = v;
  });
  Object.keys(out).forEach((a) => { const l = out[a]; const k = l.findIndex((x) => !num(x)); if (k >= 0) out[a] = l.slice(0, k); });
  return out;
}

/**
 * 06/10/2026 (A-78): a tabela fixa IPCA_MENSAL é só o ponto de partida/fallback. Quando a resposta do contexto de
 * mercado (Macro.gs: macro.juros.ipcaMensal = [{ mes: 'aaaa-mm', valor: % }]) traz meses, eles entram por cima da
 * tabela. Devolve { tabela, origem: 'macro' | 'premissa', ate } - 'premissa' = só a tabela embutida no site
 * (rotulada assim na tela, ver rotuloOrigemIpca).
 */
export function mesclarIpcaMacro(tabela, macro) {
  const meses = macro && macro.juros && Array.isArray(macro.juros.ipcaMensal) ? macro.juros.ipcaMensal : [];
  const serie = meses
    .map((m) => { const x = String(m && m.mes || '').match(/^(\d{4})-(\d{2})$/); return x && num(Number(m.valor)) ? { data: `01/${x[2]}/${x[1]}`, valor: String(m.valor) } : null; })
    .filter(Boolean);
  if (!serie.length) return { tabela, origem: 'premissa', ate: ultimoMesIpca(tabela) };
  const nova = mesclarIpca(tabela, serie);
  return { tabela: nova, origem: 'macro', ate: ultimoMesIpca(nova) };
}

/** Texto curto da origem do IPCA ('' quando veio da API; "premissa" quando é só a tabela fixa do site). */
export function rotuloOrigemIpca(origem, ate = null) {
  if (origem !== 'premissa') return '';
  const m = String(ate || '').match(/^(\d{4})-(\d{2})$/);
  return `IPCA: tabela fixa do site (premissa)${m ? `, até ${m[2]}/${m[1]}` : ''} - sem o dado mais novo do Banco Central`;
}

/** Último mês com IPCA na tabela ('aaaa-mm'). */
export function ultimoMesIpca(tabela = IPCA_MENSAL) {
  const anos = Object.keys(tabela).map(Number).filter((a) => (tabela[a] || []).length).sort((a, b) => a - b);
  const a = anos[anos.length - 1];
  return a ? `${a}-${String(tabela[a].length).padStart(2, '0')}` : null;
}

/** Fator de inflação dos meses (de, ate] ('aaaa-mm'); null se faltar algum mês. */
export function fatorIpca(de, ate, tabela = IPCA_MENSAL) {
  if (!de || !ate) return null;
  if (ate <= de) return 1;
  let f = 1;
  for (let m = somarMeses(de, 1); m <= ate; m = somarMeses(m, 1)) {
    const [a, mm] = m.split('-').map(Number);
    const v = (tabela[a] || [])[mm - 1];
    if (!num(v)) return null;
    f *= 1 + v / 100;
  }
  return f;
}

/** IPCA do ano (dez/ano-1 → dez/ano); no ano corrente, o acumulado até o último mês divulgado. */
export function ipcaDoAno(ano, tabela = IPCA_MENSAL) {
  const meses = (tabela[ano] || []).length;
  if (!meses) return null;
  const f = fatorIpca(`${ano - 1}-12`, `${ano}-${String(meses).padStart(2, '0')}`, tabela);
  return f == null ? null : { taxa: f - 1, meses, completo: meses === 12 };
}

/** IPCA dos 12 meses até `mes` (ou até o último divulgado, se `mes` for depois). */
export function ipca12m(mes, tabela = IPCA_MENSAL) {
  const ult = ultimoMesIpca(tabela);
  const fim = mes > ult ? ult : mes;
  const f = fatorIpca(somarMeses(fim, -12), fim, tabela);
  return f == null ? null : { taxa: f - 1, ate: fim };
}

// ---------------------------------------------------------------------------
// Salário: fontes
// ---------------------------------------------------------------------------

/** Holerites mensais recebidos, do mais antigo pro mais novo. */
export function holeritesMensais(pagamentos) {
  return (pagamentos || []).filter((p) => p && p.tipo === 'Mensal' && p.status !== 'Previsto' && /^\d{4}-\d{2}$/.test(String(p.mes)))
    .map((p) => {
      const bruto = num(p.totalVencimentos) ? p.totalVencimentos : (num(p.salarioBase) ? p.salarioBase + (p.outrosVencimentos || 0) : null);
      return { mes: p.mes, bruto, liquido: num(p.liquido) ? p.liquido : null, inss: p.inss || 0, irrf: p.irrf || 0, base: num(p.salarioBase) ? p.salarioBase : null, dataCredito: p.dataCredito || null };
    })
    .sort((a, b) => (a.mes < b.mes ? -1 : 1));
}

/** Salário contratual (CTPS) vigente no mês, se havia contrato ativo. */
export function salarioCtpsNoMes(carreira, mes) {
  const contratos = (carreira && carreira.contratos) || [];
  let achado = null;
  contratos.forEach((c) => {
    if (!c.inicio || mesDe(c.inicio) > mes || (c.fim && mesDe(c.fim) < mes)) return;
    const ss = (c.salarios || []).filter((s) => s && num(s.valor) && mesDe(s.data) <= mes).sort((a, b) => (a.data < b.data ? -1 : 1));
    const v = ss.length ? ss[ss.length - 1].valor : (num(c.salarioContratual) ? c.salarioContratual : null);
    if (num(v)) achado = { valor: v, empregador: c.empregador || '' };
  });
  return achado;
}

/** Meses com contrato ativo (CTPS) no ano - até `ateMes` no ano corrente. */
export function mesesTrabalhados(carreira, ano, ateMes = null) {
  let n = 0;
  for (let m = 1; m <= 12; m += 1) {
    const mes = `${ano}-${String(m).padStart(2, '0')}`;
    if (ateMes && mes > ateMes) break;
    if (salarioCtpsNoMes(carreira, mes)) n += 1;
  }
  return n;
}

/** Totais do salário numa declaração (soma das fontes pagadoras; sem o detalhe, os totais do resumo). */
export function rendaDaDeclaracao(dec) {
  if (!dec) return null;
  const pj = Array.isArray(dec.rendimentosPj) ? dec.rendimentosPj : [];
  const anual = pj.length ? soma(pj, (r) => r.anual) : (num(dec.recebidosPj) ? dec.recebidosPj : (num(dec.tributaveis) ? dec.tributaveis : null));
  if (!num(anual) || anual <= 0) return null;
  const decimo = pj.length ? soma(pj, (r) => r.decimoTerceiro) : soma((dec.exclusivosItens || []).filter((i) => i.tipo === 'decimoTerceiro'), (i) => i.valor);
  const plr = soma((dec.exclusivosItens || []).filter((i) => i.tipo === 'plr'), (i) => i.valor);
  const inss = pj.length ? soma(pj, (r) => r.inss) : null;
  const irrf = pj.length ? soma(pj, (r) => r.irrf) : null;
  const irrf13 = pj.length ? soma(pj, (r) => r.irrf13) : 0;
  // imposto do ano = o devido no ajuste (o que fica depois de restituir/pagar) + o do 13º (exclusivo)
  const ir = num(dec.impostoDevido) ? dec.impostoDevido + irrf13 : (num(irrf) ? irrf + irrf13 : null);
  const bruto = anual + decimo;
  return {
    ano: dec.ano,
    detalhado: pj.length > 0,
    fontes: pj.map((r) => r.fonte),
    anual: r2(anual), decimoTerceiro: r2(decimo), plr: r2(plr), bruto: r2(bruto),
    inss: num(inss) ? r2(inss) : null, irrf: num(irrf) ? r2(irrf) : null, ir: num(ir) ? r2(ir) : null,
    // carga do mês a mês (o que sai no holerite) e a carga final do ano (com o ajuste)
    cargaMensal: num(inss) && num(irrf) && anual > 0 ? (inss + irrf) / anual : null,
    carga: num(inss) && num(ir) && bruto > 0 ? (inss + ir) / bruto : null,
    ajuste: r2((dec.restituir || 0) - (dec.pagar || 0)),
  };
}

// ---------------------------------------------------------------------------
// Série anual do salário
// ---------------------------------------------------------------------------

/**
 * Uma linha por ano (do mais antigo pro mais novo), com o salário do mês
 * (bruto e líquido), a fonte, o total do ano, impostos e crescimento.
 */
export function serieRendaAnual({ carreira = null, pagamentos = [], irAnos = [], hoje, ipca = IPCA_MENSAL } = {}) {
  const hojeIso = isoDe(hoje || new Date());
  const mesHoje = mesDe(hojeIso);
  const anoHoje = anoDe(hojeIso);
  const hols = holeritesMensais(pagamentos);
  const decs = new Map((irAnos || []).filter((d) => d && num(d.ano)).map((d) => [d.ano, d]));
  const anosCtps = [];
  ((carreira && carreira.contratos) || []).forEach((c) => {
    const a0 = anoDe(c.inicio); const a1 = c.fim ? anoDe(c.fim) : anoHoje;
    if (a0 && a1) for (let a = a0; a <= Math.min(a1, anoHoje); a += 1) anosCtps.push(a);
  });
  const anos = [...new Set([...hols.map((h) => anoDe(h.mes)), ...decs.keys(), ...anosCtps])].filter((a) => a && a <= anoHoje).sort((a, b) => a - b);
  const linhas = anos.map((ano) => {
    const parcial = ano === anoHoje;
    const ateMes = parcial ? mesHoje : null;
    const hAno = hols.filter((h) => anoDe(h.mes) === ano && num(h.bruto));
    const dec = rendaDaDeclaracao(decs.get(ano));
    const trab = carreira ? mesesTrabalhados(carreira, ano, ateMes) : 0;
    let ctps = null;
    if (trab) {
      let s = 0;
      for (let m = 1; m <= 12; m += 1) {
        const mes = `${ano}-${String(m).padStart(2, '0')}`;
        if (ateMes && mes > ateMes) break;
        const v = salarioCtpsNoMes(carreira, mes);
        if (v) s += v.valor;
      }
      ctps = s / trab;
    }
    let brutoMensal = null; let liquidoMensal = null; let fonte = null;
    if (hAno.length) {
      brutoMensal = soma(hAno, (h) => h.bruto) / hAno.length;
      const comLiq = hAno.filter((h) => num(h.liquido));
      liquidoMensal = comLiq.length ? soma(comLiq, (h) => h.liquido) / comLiq.length : null;
      fonte = 'holerite';
    } else if (num(ctps)) {
      brutoMensal = ctps; fonte = 'ctps';
    } else if (dec) {
      const meses = trab || 12;
      brutoMensal = dec.bruto / (meses * (FATOR_ANO_CLT / 12));
      fonte = 'ir';
    }
    const mesesAno = trab || (hAno.length ? (parcial ? hAno.length : 12) : (parcial ? Number(mesHoje.slice(5)) : 12));
    return {
      ano, parcial, fonte, meses: mesesAno, holerites: hAno.length,
      brutoMensal: num(brutoMensal) ? r2(brutoMensal) : null,
      liquidoMensal: num(liquidoMensal) ? r2(liquidoMensal) : null,
      liquidoEstimado: false,
      declaracao: dec,
      brutoAnual: dec ? dec.bruto : (num(brutoMensal) ? r2(brutoMensal * mesesAno * (FATOR_ANO_CLT / 12)) : null),
      brutoAnualFonte: dec ? 'ir' : 'estimado',
      carga: dec ? dec.carga : null,
      cargaMensal: dec ? dec.cargaMensal : null,
      ipca: ipcaDoAno(ano, ipca),
    };
  }).filter((l) => num(l.brutoMensal));
  // líquido sem holerite: bruto × (1 − carga do mês a mês) do ano, ou do ano mais perto que tenha
  const comCarga = linhas.filter((l) => num(l.cargaMensal));
  const comHol = linhas.filter((l) => num(l.liquidoMensal) && l.fonte === 'holerite' && l.brutoMensal > 0);
  linhas.forEach((l) => {
    if (num(l.liquidoMensal)) return;
    const perto = (lista) => lista.slice().sort((a, b) => Math.abs(a.ano - l.ano) - Math.abs(b.ano - l.ano))[0];
    let c = num(l.cargaMensal) ? l.cargaMensal : null;
    if (c == null) {
      const a = perto(comCarga); const h = perto(comHol);
      const ca = a ? { d: Math.abs(a.ano - l.ano), c: a.cargaMensal } : null;
      const ch = h ? { d: Math.abs(h.ano - l.ano), c: 1 - h.liquidoMensal / h.brutoMensal } : null;
      const melhor = [ca, ch].filter(Boolean).sort((x, y) => x.d - y.d)[0];
      if (melhor) { c = melhor.c; l.liquidoEstimado = true; }
    }
    if (c != null) { l.liquidoMensal = r2(l.brutoMensal * (1 - c)); if (!num(l.cargaMensal)) l.liquidoEstimado = true; }
  });
  // crescimento ano a ano (nominal e real) do salário do mês
  linhas.forEach((l, k) => {
    const ant = linhas[k - 1];
    if (!ant || ant.ano !== l.ano - 1 || !(ant.brutoMensal > 0)) { l.nominal = null; l.real = null; return; }
    l.nominal = l.brutoMensal / ant.brutoMensal - 1;
    l.real = l.ipca ? (1 + l.nominal) / (1 + l.ipca.taxa) - 1 : null;
  });
  return linhas;
}

/** Recorta as linhas anuais por um período do filtro ('5a' | '10a' | 'tudo' | { inicio, fim }). */
export function recortarAnos(linhas, periodo, anoHoje) {
  if (!periodo || periodo === 'tudo') return linhas;
  if (typeof periodo === 'object') {
    const a0 = anoDe(periodo.inicio) || 0; const a1 = anoDe(periodo.fim) || 9999;
    return linhas.filter((l) => l.ano >= a0 && l.ano <= a1);
  }
  const n = Number(String(periodo).replace(/\D/g, '')) || 5;
  const ult = anoHoje || (linhas.length ? linhas[linhas.length - 1].ano : 0);
  return linhas.filter((l) => l.ano > ult - n);
}

/**
 * Linha da inflação: quanto o salário do 1º ano da janela valeria em cada ano
 * só corrigido pelo IPCA (mesma escala das barras).
 */
export function linhaInflacao(linhas, ipca = IPCA_MENSAL) {
  if (!linhas.length) return [];
  const base = linhas[0];
  let f = 1;
  return linhas.map((l, k) => {
    if (k > 0) {
      for (let a = linhas[k - 1].ano + 1; a <= l.ano; a += 1) { const i = ipcaDoAno(a, ipca); f *= i ? 1 + i.taxa : 1; }
    }
    return { ano: l.ano, valor: r2(base.brutoMensal * f), fator: f };
  });
}

/** CAGR nominal e real do salário do mês entre a 1ª e a última linha. */
export function cagrSalario(linhas, ipca = IPCA_MENSAL) {
  if (!linhas || linhas.length < 2) return null;
  const a = linhas[0]; const b = linhas[linhas.length - 1];
  const anos = b.ano - a.ano;
  if (!(anos > 0) || !(a.brutoMensal > 0) || !(b.brutoMensal > 0)) return null;
  const inf = linhaInflacao([a, b], ipca)[1].fator;
  const nominal = (b.brutoMensal / a.brutoMensal) ** (1 / anos) - 1;
  const acumulado = b.brutoMensal / a.brutoMensal - 1;
  return {
    de: a.ano, ate: b.ano, anos, nominal, acumulado,
    inflacaoAcumulada: inf - 1,
    real: ((b.brutoMensal / a.brutoMensal) / inf) ** (1 / anos) - 1,
    acimaInflacao: (b.brutoMensal / a.brutoMensal) / inf - 1,
  };
}

/**
 * 03/10/2026 (revisão do pedido de 02/10: "em todas as telas com gráficos de
 * análise de crescimento, embaixo deles um card de análise de como está o que
 * analiso vs os índices do gráfico"): leitura do gráfico "Como seu salário
 * cresceu" (salário do mês x a linha da inflação). Sem DOM - devolve o mesmo
 * formato de analise-grafico.js!analisarSerie ({ tom, resumo, pontos }), pra
 * usar o mesmo card (renderAnalise). As regras de lá são de série diária
 * (pregões, últimos dias); aqui os pontos são anuais, por isso a conta própria:
 *  - comparação: crescimento ao ano no período x IPCA (ganho real);
 *  - último ano fechado: reajuste x inflação do ano;
 *  - anos que perderam pra inflação (ou nenhum);
 *  - maior salto real (troca de emprego/promoção costuma aparecer aqui);
 *  - ano em andamento (parcial) x o ano anterior.
 * `linhas` = o recorte do gráfico (serieRendaAnual + recortarAnos).
 */
export function analisarSalario(linhas, ipca = IPCA_MENSAL) {
  const ls = (linhas || []).filter((l) => l && num(l.brutoMensal) && l.brutoMensal > 0);
  if (ls.length < 2) return null;
  const p1 = (v, casas = 1) => `${v >= 0 ? '+' : '−'}${formatNumeroPt(Math.abs(v * 100), { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
  const tomDe = (real) => (real > 0.005 ? 'bom' : (real < -0.005 ? 'atencao' : 'neutro'));
  const juntar = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
  const pontos = [];

  const c = cagrSalario(ls, ipca);
  if (!c) return null;
  const ultimo = ls[ls.length - 1];
  const rotFim = ultimo.parcial ? `${c.ate} (até agora)` : String(c.ate);
  const inflAno = (1 + c.inflacaoAcumulada) ** (1 / c.anos) - 1;
  const tom = tomDe(c.real);
  pontos.push({
    tipo: 'comparacao', tom, peso: 10,
    texto: `De ${c.de} a ${rotFim} o salário do mês foi de ${formatBRL0(ls[0].brutoMensal)} pra ${formatBRL0(ultimo.brutoMensal)} (bruto): ${p1(c.nominal)} ao ano, contra ${formatPctAbs(inflAno)} ao ano do IPCA - ${c.real >= 0 ? 'ganho' : 'perda'} real de ${formatPctAbs(c.real)} ao ano (${p1(c.acimaInflacao, 0)} de poder de compra no total).`,
  });

  const fechados = ls.filter((l) => !l.parcial && num(l.real));
  const ultFechado = fechados[fechados.length - 1] || null;
  if (ultFechado && ultFechado.ipca) {
    const acima = ultFechado.real >= 0;
    pontos.push({
      tipo: 'ultimoAno', tom: tomDe(ultFechado.real), peso: 8,
      texto: `Em ${ultFechado.ano} o salário ${ultFechado.nominal >= 0 ? 'subiu' : 'caiu'} ${formatPctAbs(ultFechado.nominal)}, com IPCA de ${formatPctAbs(ultFechado.ipca.taxa)} no ano: ficou ${formatPctAbs(ultFechado.real)} ${acima ? 'acima' : 'abaixo'} da inflação.`,
    });
  }

  const perderam = fechados.filter((l) => l.real < -0.005);
  if (perderam.length) {
    pontos.push({
      tipo: 'perdas', tom: 'atencao', peso: 7,
      texto: `${perderam.length === 1 ? 'Um ano ficou' : `${perderam.length} anos ficaram`} abaixo da inflação: ${juntar(perderam.map((l) => `${l.ano} (${p1(l.real)} real)`))}. Ano sem reajuste acima do IPCA é poder de compra que não volta sozinho.`,
    });
  } else if (fechados.length >= 2) {
    pontos.push({ tipo: 'perdas', tom: 'bom', peso: 4, texto: `Nenhum ano do período ficou abaixo da inflação: o salário sempre repôs pelo menos o IPCA.` });
  }

  const salto = fechados.slice().sort((a, b) => b.real - a.real)[0];
  if (salto && salto.real >= 0.1 && salto !== ultFechado) {
    pontos.push({
      tipo: 'salto', tom: 'neutro', peso: 5,
      texto: `O maior salto foi em ${salto.ano}: ${p1(salto.nominal)} (${p1(salto.real)} acima da inflação) - troca de emprego ou promoção costuma aparecer assim, num degrau só.`,
    });
  }

  if (ultimo.parcial && num(ultimo.nominal)) {
    const inf = ultimo.ipca;
    pontos.push({
      tipo: 'parcial', tom: num(ultimo.real) ? tomDe(ultimo.real) : 'neutro', peso: 6,
      texto: `${ultimo.ano} até agora: salário do mês ${p1(ultimo.nominal)} sobre a média de ${ultimo.ano - 1}${inf ? `, com IPCA de ${formatPctAbs(inf.taxa)} em ${inf.meses} ${inf.meses === 1 ? 'mês' : 'meses'}` : ''}.`,
    });
  }

  const escolhidos = pontos.sort((a, b) => b.peso - a.peso).slice(0, 4);
  const resumo = `${p1(c.nominal)} ao ano de ${c.de} a ${c.ate}, ${c.real > 0.005 ? 'acima' : (c.real < -0.005 ? 'abaixo' : 'empatado com')}${c.real > 0.005 || c.real < -0.005 ? ' do' : ' o'} IPCA (${p1(c.real)} real ao ano)`;
  return { tom, resumo, pontos: escolhidos, metricas: { ...c, inflacaoAno: inflAno } };
}

/**
 * Salário de agora e de 12 meses atrás (holerite > CTPS > média do IR do
 * ano anterior), com o crescimento nominal e real (IPCA 12 meses).
 */
export function salarioAtual({ carreira = null, pagamentos = [], base = null, linhas = [], hoje, ipca = IPCA_MENSAL } = {}) {
  const mesHoje = mesDe(isoDe(hoje || new Date()));
  const hols = holeritesMensais(pagamentos);
  const ultHol = hols.filter((h) => num(h.bruto)).pop() || null;
  let atual = null;
  if (ultHol && difMeses(ultHol.mes, mesHoje) <= 3) atual = { mes: ultHol.mes, bruto: ultHol.bruto, liquido: ultHol.liquido, fonte: 'holerite' };
  if (!atual) {
    const c = salarioCtpsNoMes(carreira, mesHoje);
    if (c) {
      const l = linhas.find((x) => num(x.liquidoMensal) && x.brutoMensal > 0 && x.ano === Number(mesHoje.slice(0, 4))) || linhas.filter((x) => num(x.liquidoMensal)).pop();
      atual = { mes: mesHoje, bruto: c.valor, liquido: l ? r2(c.valor * (l.liquidoMensal / l.brutoMensal)) : null, fonte: 'ctps', liquidoEstimado: true, empregador: c.empregador };
    }
  }
  if (!atual && ultHol) atual = { mes: ultHol.mes, bruto: ultHol.bruto, liquido: ultHol.liquido, fonte: 'holerite' };
  if (!atual && linhas.length) { const l = linhas[linhas.length - 1]; atual = { mes: `${l.ano}-12`, bruto: l.brutoMensal, liquido: l.liquidoMensal, fonte: l.fonte, liquidoEstimado: l.liquidoEstimado }; }
  if (!atual) return null;
  if (base && num(base.liquido) && !num(atual.liquido)) { atual.liquido = base.liquido; atual.liquidoEstimado = false; }
  const mesAntes = somarMeses(atual.mes, -12);
  let antes = null;
  const holAntes = hols.find((h) => h.mes === mesAntes && num(h.bruto));
  if (holAntes) antes = { mes: mesAntes, bruto: holAntes.bruto, fonte: 'holerite' };
  else {
    const c = salarioCtpsNoMes(carreira, mesAntes);
    if (c) antes = { mes: mesAntes, bruto: c.valor, fonte: 'ctps' };
    else { const l = linhas.find((x) => x.ano === Number(mesAntes.slice(0, 4))); if (l) antes = { mes: mesAntes, bruto: l.brutoMensal, fonte: l.fonte }; }
  }
  const nominal = antes && antes.bruto > 0 ? atual.bruto / antes.bruto - 1 : null;
  const inf = ipca12m(atual.mes, ipca);
  return {
    ...atual, antes,
    nominal12m: nominal,
    ipca12m: inf ? inf.taxa : null,
    real12m: num(nominal) && inf ? (1 + nominal) / (1 + inf.taxa) - 1 : null,
    cargaAtual: atual.fonte === 'holerite' && ultHol && ultHol.bruto > 0 ? (ultHol.inss + ultHol.irrf) / ultHol.bruto : null,
  };
}

// ---------------------------------------------------------------------------
// Quanto do salário vai pra investimento, mês a mês
// ---------------------------------------------------------------------------

/**
 * % do líquido investido por mês. O líquido do mês é o do holerite daquele
 * mês (quando tem) ou o salário líquido base (Distribuição e Metas). Médias
 * de 6 e 12 meses FECHADOS (soma investida ÷ soma do líquido) e tendência
 * (inclinação da reta dos últimos 12 fechados, em pontos percentuais/mês).
 */
export function investimentoDoSalario({ mensal = [], pagamentos = [], base = null, opcoes = {} } = {}) {
  const hols = new Map(holeritesMensais(pagamentos).filter((h) => num(h.liquido)).map((h) => [h.mes, h.liquido]));
  const liqBase = base && num(base.liquido) && base.liquido > 0 ? base.liquido : null;
  const meses = (mensal || []).map((m) => {
    const valor = valorDoMes(m, opcoes);
    const liquido = hols.get(m.mes) || liqBase;
    return { mes: m.mes, valor: r2(valor), liquido, fonteLiquido: hols.has(m.mes) ? 'holerite' : 'base', pct: num(liquido) && liquido > 0 ? valor / liquido : null, parcial: !!m.parcial, proventos: m.proventos || 0 };
  });
  const fechados = meses.filter((m) => !m.parcial && num(m.pct));
  const media = (n) => {
    const ms = fechados.slice(-n);
    if (!ms.length) return null;
    const liq = soma(ms, (m) => m.liquido);
    return { n: ms.length, pct: liq > 0 ? soma(ms, (m) => m.valor) / liq : null, valor: soma(ms, (m) => m.valor) / ms.length };
  };
  const ult12 = fechados.slice(-12);
  let tendencia = null;
  if (ult12.length >= 4) {
    const n = ult12.length;
    const xm = (n - 1) / 2;
    const ym = soma(ult12, (m) => m.pct) / n;
    let cov = 0; let vx = 0;
    ult12.forEach((m, i) => { cov += (i - xm) * (m.pct - ym); vx += (i - xm) ** 2; });
    const incl = vx ? cov / vx : 0;
    tendencia = { inclinacao: incl, sentido: incl > 0.004 ? 'subindo' : incl < -0.004 ? 'caindo' : 'estavel', meses: n };
  }
  const meta = base && num(base.percentualInvestir) ? base.percentualInvestir : null;
  return {
    meses,
    media6: media(6),
    media12: media(12),
    meta,
    metaValor: meta != null && liqBase ? liqBase * meta : null,
    acimaDaMeta12: meta != null ? ult12.filter((m) => m.pct >= meta).length : null,
    melhor: fechados.length ? fechados.reduce((a, b) => (b.pct > a.pct ? b : a)) : null,
    tendencia,
    atual: meses.find((m) => m.parcial) || null,
  };
}

/** Recorta os meses do gráfico de investimento ('6m' | '12m' | '24m' | '36m' | { inicio, fim }). */
export function recortarMeses(meses, periodo) {
  if (!periodo || periodo === 'tudo') return meses;
  if (typeof periodo === 'object') {
    const a = mesDe(periodo.inicio) || '0000-00'; const b = mesDe(periodo.fim) || '9999-99';
    return meses.filter((m) => m.mes >= a && m.mes <= b);
  }
  const n = Number(String(periodo).replace(/\D/g, '')) || 12;
  return meses.slice(-n);
}

// ---------------------------------------------------------------------------
// Contas bancárias (pela última declaração que tem)
// ---------------------------------------------------------------------------

/**
 * Contas da declaração mais recente que tem contas + as que só aparecem em
 * declarações antigas (fechadas ou esquecidas). Mesma conta = banco +
 * agência + conta (sem pontuação).
 */
export function contasDoIr(irAnos) {
  const anos = (irAnos || []).filter((d) => d && Array.isArray(d.contasBancarias)).sort((a, b) => a.ano - b.ano);
  if (!anos.length) return { ano: null, contas: [], antigas: [], semDados: (irAnos || []).length > 0 };
  const chave = (c) => `${c.banco || ''}|${String(c.agencia || '').replace(/\D/g, '')}|${String(c.conta || '').replace(/\D/g, '')}|${c.banco ? '' : c.descricao}`;
  const ult = anos[anos.length - 1];
  const atuais = ult.contasBancarias.map((c) => ({ ...c, ano: ult.ano }));
  const vistas = new Set(atuais.map(chave));
  const antigas = [];
  for (let k = anos.length - 2; k >= 0; k -= 1) {
    anos[k].contasBancarias.forEach((c) => {
      const ch = chave(c);
      if (vistas.has(ch)) return;
      vistas.add(ch);
      antigas.push({ ...c, ano: anos[k].ano });
    });
  }
  const ordem = (a, b) => (b.saldoAtual || 0) - (a.saldoAtual || 0);
  return { ano: ult.ano, exercicio: ult.exercicio || ult.ano + 1, contas: atuais.sort(ordem), antigas, total: r2(soma(atuais, (c) => c.saldoAtual)), semDados: false };
}

// ---------------------------------------------------------------------------
// Documentos: o que chega sozinho, o que mandar e quando
// ---------------------------------------------------------------------------


const rotMes = (m) => formatMesAno(m, { anoCurto: false });
const dataCurta = (iso) => formatDMA(iso, '') || rotMes(iso);

/**
 * Lista dos documentos desta aba: { id, nome, frequencia, automatico,
 * como, ultimo, proximo, estado ('ok' | 'atencao' | 'atrasado' | 'falta'), acao? }.
 */
export function documentosRenda({ patrimonio = null, salario = null, hoje } = {}) {
  const hojeIso = isoDe(hoje || new Date());
  const mesHoje = mesDe(hojeIso);
  const anoHoje = anoDe(hojeIso);
  const cfg = (patrimonio && patrimonio.config) || {};
  const atualizado = (patrimonio && patrimonio.atualizado) || {};
  const docs = [];

  // Declaração do IR
  const irs = ((cfg.ir && cfg.ir.anos) || []).slice().sort((a, b) => a.ano - b.ano);
  const ultIr = irs[irs.length - 1];
  const drive = !!(patrimonio && patrimonio.pastaIrConfigurada);
  const exercicioEsperado = hojeIso.slice(5) >= '06-01' ? anoHoje : anoHoje - 1;
  const semNovos = irs.length > 0 && irs.every((d) => d.rendimentosPj === undefined && d.contasBancarias === undefined);
  let estIr = 'ok'; let proxIr = `março a maio de ${(ultIr ? (ultIr.exercicio || ultIr.ano + 1) : anoHoje) + 1}`; let acaoIr = null;
  if (!irs.length) { estIr = 'falta'; proxIr = 'importe as declarações (uma por ano)'; acaoIr = drive ? 'ler-ir-drive' : 'importar-ir'; } else if ((ultIr.exercicio || ultIr.ano + 1) < exercicioEsperado) { estIr = 'atrasado'; proxIr = `falta a de ${exercicioEsperado} (ano ${exercicioEsperado - 1})`; acaoIr = drive ? 'ler-ir-drive' : 'importar-ir'; } else if (semNovos) { estIr = 'atencao'; proxIr = 'leia de novo pra trazer salário e contas'; acaoIr = drive ? 'ler-ir-drive' : 'importar-ir'; }
  if (estIr === 'ok' && hojeIso.slice(5) >= '03-01' && hojeIso.slice(5) < '06-01' && (ultIr.exercicio || ultIr.ano + 1) < anoHoje) { estIr = 'atencao'; proxIr = `a de ${anoHoje} é entregue até o fim de maio - depois o site lê sozinho${drive ? ' do Drive' : ''}`; }
  docs.push({
    id: 'ir', nome: 'Declaração do IR', frequencia: 'anual (mar–mai)', automatico: drive,
    como: drive ? 'o site lê a "Cópia da Declaração" direto da pasta IR do seu Drive' : 'PDF "Cópia da Declaração" - ou configure a pasta do Drive (configurarPastaIrDireto) e vira automático',
    ultimo: ultIr ? `exercício ${ultIr.exercicio || ultIr.ano + 1} (ano ${ultIr.ano})` : null, proximo: proxIr, estado: estIr, acao: acaoIr,
  });

  // Holerite
  const hols = holeritesMensais(salario && salario.pagamentos);
  const ultHol = hols[hols.length - 1];
  let estHol = 'falta'; let proxHol = 'importe o PDF em Renda e Orçamentos'; let quando = null;
  if (ultHol) {
    const dia = ultHol.dataCredito ? Number(ultHol.dataCredito.slice(8, 10)) : 5;
    const mesCredito = ultHol.dataCredito ? mesDe(ultHol.dataCredito) : somarMeses(ultHol.mes, 1);
    const desloc = difMeses(ultHol.mes, mesCredito);
    const proxMes = somarMeses(ultHol.mes, 1);
    quando = `${somarMeses(proxMes, desloc)}-${String(Math.min(28, dia)).padStart(2, '0')}`;
    // até a data esperada: em dia; até 10 dias depois: "já deve ter chegado"; depois disso: atrasado
    const folga = new Date(`${quando}T12:00:00Z`);
    folga.setUTCDate(folga.getUTCDate() + 10);
    estHol = hojeIso <= quando ? 'ok' : hojeIso <= folga.toISOString().slice(0, 10) ? 'atencao' : 'atrasado';
    proxHol = estHol === 'ok' ? `${rotMes(proxMes)} - cai por volta de ${dataCurta(quando)}` : `o de ${rotMes(proxMes)} já deve ter chegado (${dataCurta(quando)})`;
  }
  docs.push({
    id: 'holerite', nome: 'Holerite', frequencia: 'todo mês', automatico: false,
    como: 'PDF em Renda e Orçamentos → Orçamento do salário (lido no navegador). Dá pra automatizar como o IR: uma pasta "Holerites" no Drive',
    ultimo: ultHol ? rotMes(ultHol.mes) : null, proximo: proxHol, estado: estHol, acao: 'importar-holerite',
  });

  // Investimentos (aportes) - vêm das Transações/B3
  const comAporte = ((salario && salario.mensal) || []).filter((m) => Math.abs(m.total || 0) >= 0.01);
  const ultAp = comAporte[comAporte.length - 1];
  docs.push({
    id: 'investimentos', nome: 'Aportes e resgates', frequencia: 'automático', automatico: true,
    como: 'das suas Transações (sincronização com a B3 e lançamentos) - nada a mandar',
    ultimo: ultAp ? rotMes(ultAp.mes) : null, proximo: 'atualiza sozinho', estado: ultAp ? 'ok' : 'atencao',
  });

  // Carteira de Trabalho: só quando o salário/emprego muda - o holerite denuncia
  const car = cfg.carreira;
  const ctpsHoje = salarioCtpsNoMes(car, mesHoje);
  const baseHol = ultHol ? (hols.filter((h) => num(h.base)).pop() || {}).base : null;
  let estCtps = car ? 'ok' : 'falta'; let proxCtps = 'quando mudar de salário, cargo ou empresa';
  if (car && num(baseHol) && ctpsHoje && Math.abs(baseHol - ctpsHoje.valor) > Math.max(1, ctpsHoje.valor * 0.005)) {
    estCtps = 'atencao'; proxCtps = `o holerite mostra salário-base diferente do da Carteira (${baseHol > ctpsHoje.valor ? 'aumento' : 'mudança'}) - baixe de novo`;
  } else if (car && !ctpsHoje) { estCtps = 'atencao'; proxCtps = 'sem contrato aberto na Carteira - baixe de novo se mudou de emprego'; }
  docs.push({
    id: 'ctps', nome: 'Carteira de Trabalho Digital', frequencia: 'quando mudar', automatico: false,
    como: 'PDF "Contratos de trabalho" do app/gov.br (Patrimônio → Seus documentos)',
    ultimo: atualizado.carreira ? dataCurta(String(atualizado.carreira).slice(0, 10)) : null, proximo: proxCtps, estado: estCtps,
  });

  // Extratos do FGTS
  const contas = (cfg.fgts && cfg.fgts.contas) || [];
  const dataFgts = contas.map((c) => c.dataSaldo).filter(Boolean).sort().pop() || (atualizado.fgts ? String(atualizado.fgts).slice(0, 10) : null);
  const mesesFgts = dataFgts ? difMeses(dataFgts, mesHoje) : null;
  docs.push({
    id: 'fgts', nome: 'Extrato do FGTS', frequencia: 'a cada 6 meses', automatico: false,
    como: 'PDF do app FGTS (um por empresa) - o saldo anda sozinho com os depósitos do holerite',
    ultimo: dataFgts ? dataCurta(dataFgts) : null,
    proximo: dataFgts ? (mesesFgts >= 6 ? 'já dá pra atualizar' : rotMes(somarMeses(dataFgts, 6))) : 'importe os extratos',
    estado: !dataFgts ? 'falta' : mesesFgts >= 9 ? 'atrasado' : mesesFgts >= 6 ? 'atencao' : 'ok',
  });

  // Informe de rendimentos: não precisa mandar
  docs.push({
    id: 'informe', nome: 'Informe de rendimentos (empresa e bancos)', frequencia: 'anual (fev)', automatico: true,
    como: 'não precisa mandar: os números já entram pela declaração do IR', ultimo: null, proximo: `fevereiro de ${hojeIso.slice(5) >= '03-01' ? anoHoje + 1 : anoHoje}`, estado: 'ok',
  });
  return docs;
}

/**
 * metas-calc-ir.js - 09/10/2026 (Tiago, depois da seção "IR: resgatar hoje × no vencimento" do título: "considere isso
 * também quando for fazer os cálculos das metas, que considera valor líquido se incluir um vencimento (sei que tem isso na
 * renda emergencial)").
 *
 * Conta PURA (sem DOM). Leva cada título de renda fixa vinculado a uma meta até uma data - a data da meta ou o vencimento,
 * o que vier antes - com a MESMA conta da tela do título (assets/js/ir-resgate-rf.js!compararResgate):
 *   - o valor de hoje rende pela taxa do próprio título (Selic/CDI/IPCA esperados + o contratado; sem isso, o rendimento
 *     informado na meta);
 *   - cada lote paga a alíquota que terá NAQUELA data (tabela regressiva pelo tempo desde a aplicação dele);
 *   - a custódia da B3 até lá sai do líquido (Tesouro; o Tesouro Selic é isento até R$ 10 mil);
 *   - vencendo ANTES da data da meta, o IR é cobrado no vencimento e o líquido volta a render (reaplicado, como lote novo,
 *     com a alíquota pelo tempo que ficar aplicado).
 * Precisa dos lotes (Metas.gs!lotesIrMetas_); sem eles devolve null e quem chama usa a conta antiga (alíquota média).
 * Testes: tests/metas-calc-ir.test.js.
 */
import { compararResgate, taxaProjetada, dataVencimento, custodiaDoTitulo, aliquotaIR, diasEntre } from '../ir-resgate-rf.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const r2 = (v) => Math.round(v * 100 + 1e-7) / 100;

/** 'AAAA-MM-DD' de hoje: o `hoje` da resposta (Metas.gs) ou o relógio. */
export function hojeIso(hoje) {
  const s = String(hoje || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return new Date().toISOString().slice(0, 10);
}

/** Lote do Apps Script (Metas.gs!lotesIrMetas_): [data, investido, atual, imposto, iof?] - ou já como objeto. */
export function loteDoServidor(l) {
  if (Array.isArray(l)) return { dataAplicacao: l[0], valorInvestido: Number(l[1]) || 0, valorAtual: Number(l[2]) || 0, imposto: Number(l[3]) || 0, iof: Number(l[4]) || 0, aliquota: null };
  return l && typeof l === 'object' ? { dataAplicacao: l.dataAplicacao, valorInvestido: Number(l.valorInvestido) || 0, valorAtual: Number(l.valorAtual) || 0, imposto: Number(l.imposto) || 0, iof: Number(l.iof) || 0, aliquota: num(l.aliquota) } : null;
}

/** Dia usado pra uma data de meta 'AAAA-MM' (o meio do mês - a mesma regra do vencimento sem dia em Metas.gs). */
export const diaDaMeta = (mes) => (/^\d{4}-\d{2}$/.test(String(mes || '')) ? `${mes}-15` : null);

/**
 * Projeção de UM título até `ate` ('AAAA-MM-DD'; sem `ate` = até o vencimento). `parte` = fração do título que conta na meta.
 * `taxaMetaAnual` = rendimento informado na meta (fração ao ano), usado se o título não tem taxa projetável.
 * Devolve null sem lotes/valor. { data, venceAntes, vencimento, hoje: { bruto, imposto, liquido }, bruto, imposto,
 * custodia, liquido, aliquotaEfetiva, taxaAnual, base ('Selic'|'CDI'|'IPCA'|'prefixado'|'meta'), estimado }.
 */
export function projetarTituloAte(ativo, { parte = 1, hoje, ate = null, juros = null, taxaMetaAnual = null } = {}) {
  const a = ativo || {};
  const ir0 = a.irResgate || null;
  const lotesSrv = ir0 && Array.isArray(ir0.lotes) ? ir0.lotes : [];
  const valor = (num(a.valorBRL) || 0) * parte;
  if (!(parte > 0) || !(valor > 0) || !lotesSrv.length) return null;
  const dia = hojeIso(hoje);
  const venc = dataVencimento({ vencimentoData: a.vencimentoData, vencimento: a.vencimento });
  const vencData = venc && venc.data > dia ? venc.data : null;
  // o vencimento no mesmo mês da meta conta como "esperou o vencimento" (não como venda antecipada dias antes)
  let fim = ate && ate > dia ? ate : vencData;
  if (!fim) return null;
  const venceAntes = !!(vencData && (vencData <= fim || vencData.slice(0, 7) === fim.slice(0, 7)));
  if (venceAntes) fim = vencData > fim ? vencData : fim;
  const ateTitulo = venceAntes ? vencData : fim;

  const proj = taxaProjetada({ indexador: a.indexador, texto: a.taxaTexto || a.descricao || a.nome || '', juros });
  let taxaAnual = proj ? proj.taxa : null;
  let base = proj ? proj.base : null;
  if (taxaAnual == null && num(taxaMetaAnual) != null) { taxaAnual = taxaMetaAnual; base = 'meta'; }
  if (taxaAnual == null) { taxaAnual = 0; base = 'zero'; }

  // lotes na proporção do vínculo (o Apps Script já mandou na proporção do ativo)
  const lotes = lotesSrv.map(loteDoServidor).filter(Boolean).map((l) => ({
    dataAplicacao: l.dataAplicacao, valorInvestido: l.valorInvestido * parte, valorAtual: l.valorAtual * parte,
    imposto: l.imposto * parte, iof: l.iof * parte, aliquota: l.aliquota,
  }));
  const comp = compararResgate({
    lotes, valorAtual: valor, hoje: dia, vencimento: ateTitulo, taxaAnual,
    isento: !!ir0.isento, custodia: custodiaDoTitulo(a.nome, a.descricao),
  });
  if (!comp || !comp.vencimento) return null;
  const v = comp.vencimento;
  let bruto = v.bruto; let imposto = v.imposto; const custodia = v.custodia || 0; let liquido = v.liquido;
  let reaplicado = null;
  if (venceAntes && fim > ateTitulo) {
    // venceu antes da data da meta: o líquido do vencimento volta a render até lá (lote novo, IR pelo tempo dele)
    const dias = diasEntre(ateTitulo, fim);
    const brutoR = liquido * (1 + taxaAnual) ** (dias / 365);
    const irR = ir0.isento ? 0 : Math.max(0, brutoR - liquido) * aliquotaIR(dias);
    reaplicado = { desde: ateTitulo, dias, bruto: brutoR, imposto: irR, liquido: brutoR - irR };
    // "bruto" = o que você teria antes de TODO o imposto (o do vencimento já saiu antes de reaplicar): bruto − IR − custódia = líquido
    bruto = brutoR + imposto + custodia; imposto += irR; liquido = brutoR - irR;
  }
  return {
    data: fim, venceAntes, vencimento: venceAntes ? { data: ateTitulo, bruto: r2(v.bruto), imposto: r2(v.imposto), custodia: r2(custodia), liquido: r2(v.liquido), aliquotaEfetiva: v.aliquotaEfetiva } : null,
    reaplicado: reaplicado ? { desde: reaplicado.desde, dias: reaplicado.dias, imposto: r2(reaplicado.imposto) } : null,
    hoje: { bruto: r2(comp.hoje.bruto), imposto: r2(comp.hoje.imposto), liquido: r2(comp.hoje.liquido) },
    bruto: r2(bruto), imposto: r2(imposto), custodia: r2(custodia), liquido: r2(liquido),
    aliquotaEfetiva: v.aliquotaEfetiva, taxaAnual, base, estimado: base === 'meta' || base === 'zero', aproximada: !!(venc && venc.aproximada),
  };
}

/**
 * Os títulos de renda fixa de uma meta levados até a data dela (`mes` 'AAAA-MM'). `itens` = vínculos já resolvidos
 * (metas-calc-plano!resolverVinculos: { valorBRL, base, ativos }). Só entra o que tem lotes; o resto vai em `semLotes`.
 * Devolve null sem nenhum título projetável. { mes, data, titulos: [{ nome, ...projeção }], hoje: { bruto, imposto, liquido },
 * bruto, imposto, custodia, liquido, ganho, impostoExtra (o IR a mais na data, além do de hoje), semLotes, estimado }.
 */
export function rendaFixaNaData(itens, { mes, hoje, juros = null, taxaMetaAnual = null } = {}) {
  const ate = diaDaMeta(mes);
  if (!ate || !Array.isArray(itens)) return null;
  const titulos = [];
  let semLotes = 0;
  itens.forEach((v) => {
    const parte = v.base > 0 ? v.valorBRL / v.base : 0;
    (v.ativos || []).forEach((a) => {
      if (a.classe !== 'rf' || !(parte > 0)) return;
      const p = projetarTituloAte(a, { parte, hoje, ate, juros, taxaMetaAnual });
      if (!p) { if ((Number(a.valorBRL) || 0) * parte > 0) semLotes += 1; return; }
      titulos.push({ nome: String(a.nome || '').split(' · ')[0], ...p });
    });
  });
  if (!titulos.length) return null;
  const soma = (f) => r2(titulos.reduce((s, t) => s + f(t), 0));
  const hojeT = { bruto: soma((t) => t.hoje.bruto), imposto: soma((t) => t.hoje.imposto), liquido: soma((t) => t.hoje.liquido) };
  const imposto = soma((t) => t.imposto);
  const bruto = soma((t) => t.bruto);
  return {
    mes, data: ate, titulos, hoje: hojeT, bruto, imposto, custodia: soma((t) => t.custodia), liquido: soma((t) => t.liquido),
    ganho: r2(bruto - hojeT.bruto), impostoExtra: r2(Math.max(0, imposto - hojeT.imposto)), semLotes,
    estimado: titulos.some((t) => t.estimado), vencemAntes: titulos.filter((t) => t.venceAntes).length,
  };
}

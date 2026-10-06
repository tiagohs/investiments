/**
 * metas-calc-viagem.js - 06/10/2026 (A-42/A-76): metas de viagem (países, cidades, entradas de dinheiro, taxa turística, plano em moeda estrangeira).
 * metas-calc.js reexporta (compatibilidade).
 */

import { cotacao, mesDe, num, r2, somarMeses } from './metas-calc-nucleo.js';
import { resumoFgts, salarioEm } from './patrimonio-calc.js';

/**
 * 03/10/2026: viagem por destinos + itens fixos (o desenho da planilha de
 * viagem do Tiago). Cada destino: dias x gasto diário (alimentação,
 * transporte, passeios, compras, outros) + extras (ingressos), na moeda do
 * destino.
 *
 * 04/10/2026 (Tiago: "compras no cartão de crédito já feitas (passagens,
 * hotéis) não devem ser incluídas na conta de aportes. São contas a pagar pra
 * viagem, mas não é algo pra ser juntado [...] O que está no meu cartão já
 * deveria de antemão ser considerado 'pago'"): a viagem tem DUAS partes.
 *   aPagar  - itens fixos 'cartao' (já comprados: PAGOS de antemão, só falta a
 *             fatura - "confirmado" quando o mês da última parcela passa ou
 *             ele marca) e 'pago' (à vista/pix). Cronograma das parcelas por
 *             mês e por cartão. Não entra no aporte.
 *   juntar  - por moeda: gasto lá x (1 + margem) + taxa turística (por pessoa
 *             por noite x noites x pessoas, sem margem) + itens 'juntar' (ainda
 *             não pagos), menos o "Saldo em conta" naquela moeda; o resto vira
 *             reais pelo câmbio do dia. gastoBRL = o total a juntar em reais.
 * A "conta mensal" antiga de uma viagem (contaMensal) entra como um item no
 * cartão (mesma coisa: parcelas já compradas).
 */
export function calcularViagem(meta, { cambio = {}, hoje } = {}) {
  const esp = (meta && meta.especificos) || {};
  const margem = num(esp.margem) ?? 0;
  const pessoasPadrao = Math.max(1, num(esp.pessoas) || 1);
  const mesHoje = mesDe(hoje || new Date());
  const destinos = (esp.destinos || []).map((d) => {
    const g = d.gastos || {};
    const diaria = ['alimentacao', 'transporte', 'passeios', 'compras', 'outros'].reduce((s, k) => s + (num(g[k]) || 0), 0);
    const dias = num(d.dias) || 0;
    const gastosMoeda = r2(diaria * dias + (num(d.extras) || 0));
    const taxa = taxaTuristicaDestino(d, { pessoasPadrao });
    const totalMoeda = r2(gastosMoeda + taxa.total);
    const cot = cotacao(d.moeda || 'BRL', cambio);
    return { ...d, diaria: r2(diaria), gastosMoeda, taxa, totalMoeda, totalBRL: cot == null ? null : r2((gastosMoeda * (1 + margem) + taxa.total) * cot), cotacao: cot };
  });
  // itens fixos (+ a conta mensal antiga de viagem, como item no cartão)
  const brutos = [...(esp.fixos || [])];
  if (meta && meta.contaMensal && num(meta.contaMensal.valor) > 0) {
    const n = Math.max(1, num(meta.contaMensal.meses) || 1);
    brutos.push({ id: 'conta-mensal', nome: meta.contaMensal.descricao || 'Conta mensal', valor: r2(num(meta.contaMensal.valor) * n), moeda: 'BRL', parcelas: n, inicio: meta.contaMensal.inicio || null, parte: 1, forma: 'cartao' });
  }
  const fixos = brutos.map((f) => {
    const forma = formaFixo(f);
    const parte = num(f.parte) ?? 1;
    const cot = cotacao(f.moeda || 'BRL', cambio);
    const total = (num(f.valor) || 0) * parte;
    const parcelas = Math.max(1, num(f.parcelas) || 1);
    const totalBRL = cot == null ? null : r2(total * cot);
    const parcelaBRL = totalBRL == null ? null : r2(totalBRL / parcelas);
    const cronograma = [];
    if (forma === 'cartao' && f.inicio) {
      for (let k = 0; k < parcelas; k++) {
        const mes = somarMeses(f.inicio, k);
        cronograma.push({ mes, n: k + 1, valor: parcelaBRL, confirmada: !!f.confirmado || mes < mesHoje });
      }
    }
    const pagas = forma === 'pago' ? parcelas : cronograma.filter((c) => c.confirmada).length;
    const confirmado = forma === 'pago' || !!f.confirmado || (forma === 'cartao' && cronograma.length > 0 && pagas >= parcelas);
    const pendenteBRL = forma === 'cartao' && totalBRL != null ? r2(cronograma.length ? cronograma.filter((c) => !c.confirmada).reduce((s, c) => s + (c.valor || 0), 0) : (f.confirmado ? 0 : totalBRL)) : 0;
    const status = forma === 'juntar' ? 'a-juntar' : (confirmado ? 'confirmado' : 'pendente');
    return {
      ...f, forma, parte, totalMoeda: r2(total), totalBRL, parcelas, pagas, parcelaBRL, cronograma, status, pendenteBRL,
      // compat (v2): "pago" = já comprado (cartão) ou à vista
      pagoBRL: forma === 'juntar' || totalBRL == null ? 0 : totalBRL,
      ativa: forma === 'cartao' && cronograma.some((c) => c.mes >= mesHoje), semInicio: forma === 'cartao' && !f.inicio,
      fim: f.inicio && forma === 'cartao' ? somarMeses(f.inicio, parcelas - 1) : null,
    };
  });
  // --- a juntar, por moeda ---
  const porMoeda = {};
  const grupo = (m) => porMoeda[m] || (porMoeda[m] = { moeda: m, gastos: 0, taxa: 0, itens: 0, dias: 0, destinos: [] });
  destinos.forEach((d) => {
    const x = grupo(d.moeda || 'BRL');
    x.gastos += d.gastosMoeda; x.taxa += d.taxa.total; x.dias += num(d.dias) || 0; x.destinos.push(d.cidade || d.pais);
  });
  fixos.filter((f) => f.forma === 'juntar').forEach((f) => { grupo(f.moeda || 'BRL').itens += f.totalMoeda; });
  const saldos = ((meta && meta.vinculos) || []).filter((v) => v.tipo === 'saldo');
  Object.values(porMoeda).forEach((x) => {
    x.gastos = r2(x.gastos); x.taxa = r2(x.taxa); x.itens = r2(x.itens);
    x.total = x.gastos; // compat v2: gasto sem margem
    x.margemValor = r2(x.gastos * margem);
    x.comMargem = r2(x.gastos * (1 + margem) + x.taxa + x.itens); // o total a juntar nessa moeda
    x.guardado = r2(saldos.filter((v) => (v.moeda || 'BRL') === x.moeda).reduce((s, v) => s + (Number(v.saldo) || 0), 0));
    x.falta = r2(Math.max(0, x.comMargem - x.guardado));
    x.cotacao = cotacao(x.moeda, cambio);
    x.comMargemBRL = x.cotacao == null ? null : r2(x.comMargem * x.cotacao);
    x.faltaBRL = x.cotacao == null ? null : r2(x.falta * x.cotacao);
  });
  const semCambio = Object.values(porMoeda).filter((x) => x.cotacao == null).map((x) => x.moeda);
  fixos.filter((f) => f.totalBRL == null).forEach((f) => { if (!semCambio.includes(f.moeda)) semCambio.push(f.moeda); });
  const gastoBRL = r2(Object.values(porMoeda).reduce((s, x) => s + (x.comMargemBRL || 0), 0));
  const taxaBRL = r2(Object.values(porMoeda).reduce((s, x) => s + (x.cotacao ? x.taxa * x.cotacao : 0), 0));
  const margemBRL = r2(Object.values(porMoeda).reduce((s, x) => s + (x.cotacao ? x.margemValor * x.cotacao : 0), 0));
  const juntarItensBRL = r2(fixos.filter((f) => f.forma === 'juntar').reduce((s, f) => s + (f.totalBRL || 0), 0));
  // --- a pagar (já comprado) ---
  const comprados = fixos.filter((f) => f.forma !== 'juntar');
  const meses = new Map();
  comprados.forEach((f) => f.cronograma.forEach((c) => {
    const x = meses.get(c.mes) || { mes: c.mes, total: 0, pendente: 0, porCartao: {}, itens: [] };
    x.total = r2(x.total + (c.valor || 0));
    if (!c.confirmada) x.pendente = r2(x.pendente + (c.valor || 0));
    const cartao = f.cartao || 'Cartão';
    x.porCartao[cartao] = r2((x.porCartao[cartao] || 0) + (c.valor || 0));
    x.itens.push({ nome: f.nome, n: c.n, de: f.parcelas, valor: c.valor, cartao: f.cartao || null, confirmada: c.confirmada });
    meses.set(c.mes, x);
  }));
  const cronograma = [...meses.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const doMes = cronograma.find((x) => x.mes === mesHoje);
  const futuros = cronograma.filter((x) => x.mes >= mesHoje);
  const aPagar = {
    itens: comprados,
    totalBRL: r2(comprados.reduce((s, f) => s + (f.totalBRL || 0), 0)),
    pendenteBRL: r2(comprados.reduce((s, f) => s + (f.pendenteBRL || 0), 0)),
    confirmadoBRL: r2(comprados.reduce((s, f) => s + (f.totalBRL || 0) - (f.pendenteBRL || 0), 0)),
    cronograma,
    mesAtualBRL: doMes ? doMes.pendente : 0,
    proximoMes: futuros.find((x) => x.mes > mesHoje) || null,
    ultimoMes: futuros.length ? futuros[futuros.length - 1].mes : null,
    mediaAteFimBRL: futuros.length ? r2(futuros.reduce((s, x) => s + x.pendente, 0) / futuros.length) : 0,
    cartoes: [...new Set(comprados.map((f) => f.cartao || 'Cartão'))],
    semInicio: comprados.filter((f) => f.semInicio).map((f) => f.nome),
  };
  const dias = destinos.reduce((s, d) => s + (num(d.dias) || 0), 0);
  return {
    mesHoje, margem, pessoas: pessoasPadrao, destinos, porMoeda, gastoBRL, taxaBRL, margemBRL, juntarItensBRL, fixos, aPagar, dias, semCambio,
    // compat v2
    fixosTotalBRL: aPagar.totalBRL, fixosPagoBRL: aPagar.totalBRL, parcelaMensal: aPagar.mesAtualBRL,
    temDestinos: destinos.length > 0, temFixos: fixos.length > 0, temJuntar: Object.keys(porMoeda).length > 0,
  };
}

/** Forma de pagamento de um item fixo (o antigo `pago: true` = 'pago'; sem nada = 'cartao'). */
export function formaFixo(f) {
  if (f && ['cartao', 'pago', 'juntar'].includes(f.forma)) return f.forma;
  return f && f.pago ? 'pago' : 'cartao';
}

/**
 * 04/10/2026: taxa turística de 1 destino: valor por pessoa por noite (moeda
 * do destino) x noites (padrão = dias; no máximo `taxaMaxNoites`) x pessoas
 * (padrão = as da viagem). { valor, noites, pessoas, total }
 */
export function taxaTuristicaDestino(d, { pessoasPadrao = 1 } = {}) {
  const valor = num(d && d.taxaTuristica) || 0;
  let noites = num(d && d.taxaNoites) ?? (num(d && d.dias) || 0);
  const max = num(d && d.taxaMaxNoites);
  if (max > 0) noites = Math.min(noites, max);
  const pessoas = Math.max(1, num(d && d.taxaPessoas) || pessoasPadrao || 1);
  return { valor, noites, pessoas, max: max || null, total: r2(valor * noites * pessoas) };
}

const idCurto = () => Math.random().toString(36).slice(2, 10);

/** "Suíça " -> "suica" (sem acento, minúsculo, só letras/números e espaço). */
export function normalizarNome(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const INDICES_PAISES = new WeakMap();

function indicePaises(paises) {
  if (!Array.isArray(paises)) return new Map();
  let idx = INDICES_PAISES.get(paises);
  if (idx) return idx;
  idx = new Map();
  paises.forEach((p) => {
    [p.nome, ...(p.aliases || [])].forEach((n) => { const k = normalizarNome(n); if (k && !idx.has(k)) idx.set(k, p); });
  });
  // o código ISO por último (não briga com um nome de 2 letras)
  paises.forEach((p) => { const k = normalizarNome(p.codigo); if (!idx.has(k)) idx.set(k, p); });
  INDICES_PAISES.set(paises, idx);
  return idx;
}

/** País pelo nome digitado (acentos/caixa/sinônimos: "Suiça", "Switzerland", "Inglaterra", "Holanda", "CH"). */
export function acharPais(texto, paises) {
  const k = normalizarNome(texto);
  if (!k) return null;
  return indicePaises(paises).get(k) || null;
}

export function paisPorCodigo(codigo, paises) {
  const c = String(codigo || '').toUpperCase();
  return (paises || []).find((p) => p.codigo === c) || null;
}

/** "Madri|Madrid" -> { nome: 'Madri', aliases: ['Madrid'] } (assets/data/cidades.json). */
export function cidadesDoPais(cidades, codigo) {
  const lista = (cidades && cidades[String(codigo || '').toUpperCase()]) || [];
  return lista.map((x) => { const [nome, ...aliases] = String(x).split('|'); return { nome, aliases }; });
}

/** País de uma cidade conhecida ("Interlaken" -> CH), quando o país ficou em branco. */
export function acharPaisPelaCidade(cidade, cidades, paises) {
  const k = normalizarNome(cidade);
  if (!k || !cidades) return null;
  const achados = Object.keys(cidades).filter((cod) => cidadesDoPais(cidades, cod).some((c) => [c.nome, ...c.aliases].some((n) => normalizarNome(n) === k)));
  return achados.length === 1 ? paisPorCodigo(achados[0], paises) : null;
}

/** Bandeira local (assets/imgs/flags/<iso>.svg), relativa à raiz do site. */
export function caminhoBandeira(codigo) {
  return /^[A-Za-z]{2}$/.test(String(codigo || '')) ? `assets/imgs/flags/${String(codigo).toLowerCase()}.svg` : null;
}

/** Link http(s) (sem protocolo ganha https://). Inválido = null; vazio = ''. */
export function normalizarUrl(texto) {
  let u = String(texto == null ? '' : texto).trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = `https://${u.replace(/^\/+/, '')}`;
  try {
    const x = new URL(u);
    if (!['http:', 'https:'].includes(x.protocol) || !x.hostname.includes('.') || /\s/.test(u)) return null;
    return x.href;
  } catch (e) { return null; }
}

export function ehLinkWanderlog(u) {
  try { return /(^|\.)wanderlog\.com$/i.test(new URL(u).hostname); } catch (e) { return false; }
}

/**
 * Sugestão de taxa turística (assets/data/taxas-turisticas.json) pro destino:
 * pela cidade (nomes/aliases, sem acento) e, se houver, pelo país.
 */
export function sugestaoTaxaTuristica(destino, taxas) {
  const lista = (taxas && taxas.cidades) || taxas || [];
  const k = normalizarNome(destino && destino.cidade);
  if (!k || !Array.isArray(lista)) return null;
  return lista.find((t) => (!destino.paisCodigo || t.pais === destino.paisCodigo) && (t.nomes || [t.cidade]).some((n) => normalizarNome(n) === k)) || null;
}

export const TIPOS_ENTRADA = {
  decimo13: { rotulo: '13º salário', pct: 0.9, recorrencia: 'anual', dica: 'decimo13' },
  fgts: { rotulo: 'Saque-aniversário do FGTS', pct: 0.9, recorrencia: 'anual', dica: 'fgts' },
  plr: { rotulo: 'PLR / bônus', pct: 1, recorrencia: 'unica' },
  outra: { rotulo: 'Outra entrada', pct: 1, recorrencia: 'unica' },
};

export function entradaPadrao(tipo, extra = {}) {
  const t = TIPOS_ENTRADA[tipo] || TIPOS_ENTRADA.outra;
  return { id: idCurto(), tipo: TIPOS_ENTRADA[tipo] ? tipo : 'outra', nome: '', pct: t.pct, valor: null, mes: null, recorrencia: t.recorrencia, ativo: true, ...extra };
}

/**
 * 13º de um ano: 1ª parcela em novembro (metade do bruto, sem descontos) e 2ª
 * em dezembro (outra metade - INSS e IR do 13º inteiro, aproximados pelos do
 * holerite mensal - a mesma conta da aba Salário, salario-calc!extrasDoAno).
 * Lançado na aba Salário (Recebido/Previsto) = vale o valor lançado.
 * Sem holerite: salário da carteira (aux_patrimonio) - (bruto - líquido N11);
 * só o líquido: metade em cada parcela (aproximado).
 */
export function estimativa13(referencias = {}, ano) {
  const sal = referencias.salario || {};
  const extras = sal.extras || [];
  const lancado = (tipo) => extras.find((p) => p.tipo === tipo && String(p.mes || '').slice(0, 4) === String(ano) && num(p.liquido) > 0);
  const l1 = lancado('13º (1ª parcela)');
  const l2 = lancado('13º (2ª parcela)');
  const h = sal.holerite;
  let bruto = h ? (num(h.salarioBase) || num(h.totalVencimentos)) : null;
  let descontos = h ? (num(h.inss) || 0) + (num(h.irrf) || 0) : null;
  let origem = 'holerite';
  if (!(bruto > 0)) {
    const doc = referencias.fgts && referencias.fgts.carreira ? salarioEm(referencias.fgts.carreira, `${ano}-12-31`) : null;
    if (doc > 0 && num(sal.liquido) > 0) { bruto = doc; descontos = Math.max(0, doc - sal.liquido); origem = 'carreira'; } else bruto = null;
  }
  let p1 = null; let p2 = null;
  if (bruto > 0) { p1 = bruto / 2; p2 = Math.max(0, bruto / 2 - (descontos || 0)); } else if (num(sal.liquido) > 0) { p1 = sal.liquido / 2; p2 = sal.liquido / 2; origem = 'aproximado'; }
  if (p1 == null && !l1 && !l2) return null;
  return {
    bruto, descontos,
    p1: { mes: `${ano}-11`, valor: l1 ? l1.liquido : (p1 == null ? null : r2(p1)), origem: l1 ? 'planilha' : origem },
    p2: { mes: `${ano}-12`, valor: l2 ? l2.liquido : (p2 == null ? null : r2(p2)), origem: l2 ? 'planilha' : origem },
  };
}

/** Saque-aniversário: o mês (próximo aniversário) e o valor que a aba Patrimônio calcula (patrimonio-calc!resumoFgts). */
export function estimativaFgts(referencias = {}, hoje) {
  const f = referencias.fgts;
  if (!f || !Array.isArray(f.contas) || !f.contas.length) return null;
  const dia = typeof hoje === 'string' ? (hoje.length === 7 ? `${hoje}-01` : hoje.slice(0, 10)) : `${mesDe(hoje || new Date())}-01`;
  const sal = f.carreira ? salarioEm(f.carreira, dia) : null;
  const r = resumoFgts({ contas: f.contas }, dia, { nascimento: f.nascimento || null, depositoMensal: sal > 0 ? sal * 0.08 : null });
  const a = r && r.aniversario;
  if (!a || !a.proximo) return { mes: null, valor: null, ativo: a ? a.ativo : false, saldo: r ? r.saldo : null };
  const valor = a.estimado ? a.estimado.valor : (a.comSaldoDeHoje ? a.comSaldoDeHoje.valor : null);
  return { mes: a.proximo, valor: valor == null ? null : r2(valor), ativo: !!a.ativo, mesAniversario: a.mesAniversario, saldo: r.saldo };
}

/**
 * Cada vez que uma entrada programada cai, de hoje até `ate` (exclusive - "só
 * as que caem ANTES da data da meta"): [{ id, entradaId, tipo, rotulo, mes,
 * bruto, pct, valor (= bruto x pct), origem, nota }]. bruto null = falta o
 * valor (sem salário/FGTS pra estimar) - fica de fora da conta.
 */
export function expandirEntradas(meta, { referencias = {}, hoje, ate = null } = {}) {
  const mesHoje = mesDe(hoje || new Date());
  const fim = mesDe(ate) || somarMeses(mesHoje, 24);
  const out = [];
  (meta && Array.isArray(meta.entradas) ? meta.entradas : []).filter((e) => e && e.ativo !== false).forEach((e) => {
    const t = TIPOS_ENTRADA[e.tipo] || TIPOS_ENTRADA.outra;
    const pct = num(e.pct) ?? t.pct;
    const recorrencia = e.recorrencia || t.recorrencia;
    const nome = String(e.nome || '').trim() || t.rotulo;
    let primeira = true;
    const add = (mes, bruto, origem, rotulo, nota = '') => {
      if (!mes || mes < mesHoje || mes >= fim) return false;
      out.push({ id: `${e.id}|${mes}|${rotulo}`, entradaId: e.id, tipo: e.tipo, rotulo, mes, bruto: bruto == null ? null : r2(bruto), pct, valor: bruto == null ? 0 : r2(bruto * pct), origem, nota });
      return true;
    };
    const anoIni = Number(mesHoje.slice(0, 4));
    const anoFim = Number(fim.slice(0, 4));
    if (e.tipo === 'decimo13') {
      for (let ano = anoIni; ano <= anoFim; ano++) {
        if (recorrencia === 'unica' && !primeira) break;
        const est = estimativa13(referencias, ano);
        let v1 = est ? est.p1.valor : null; let v2 = est ? est.p2.valor : null;
        let o1 = est ? est.p1.origem : 'sem-dados'; let o2 = est ? est.p2.origem : 'sem-dados';
        if (num(e.valor) > 0) { // valor informado = o líquido do 13º inteiro do ano
          const soma = (v1 || 0) + (v2 || 0);
          const frac = soma > 0 ? (v1 || 0) / soma : 0.5;
          v1 = e.valor * frac; v2 = e.valor - v1; o1 = 'informado'; o2 = 'informado';
        }
        const a = add(`${ano}-11`, v1, o1, `${nome} (1ª parcela)`, v1 == null ? 'informe o valor (sem holerite pra estimar)' : '');
        const b = add(`${ano}-12`, v2, o2, `${nome} (2ª parcela)`, v2 == null ? 'informe o valor (sem holerite pra estimar)' : '');
        if (a || b) primeira = false;
      }
      return;
    }
    let mes0 = mesDe(e.mes);
    let valor = num(e.valor) > 0 ? e.valor : null;
    let origem = valor != null ? 'informado' : 'sem-dados';
    let nota = '';
    if (e.tipo === 'fgts') {
      const est = estimativaFgts(referencias, hoje);
      if (!mes0 && est && est.mes) mes0 = est.mes;
      if (valor == null && est && est.valor > 0) { valor = est.valor; origem = 'estimado'; }
      if (est && !est.ativo) nota = 'pelo histórico do FGTS você ainda não está no saque-aniversário - confira';
      if (!mes0) nota = 'informe o mês do saque (aniversário) - sem dados do FGTS na aba Patrimônio';
    } else if (e.tipo === 'plr' && valor == null) {
      const prev = ((referencias.salario || {}).extras || []).find((p) => ['PLR', 'Bônus'].includes(p.tipo) && String(p.mes) >= mesHoje && num(p.liquido) > 0);
      if (prev) { valor = prev.liquido; origem = 'planilha'; if (!mes0) mes0 = mesDe(prev.mes); }
    }
    if (!mes0) return;
    if (valor == null && !nota) nota = 'informe o valor';
    const passo = recorrencia === 'mensal' ? 1 : (recorrencia === 'anual' ? 12 : 0);
    let mes = mes0;
    if (passo) while (mes < mesHoje) mes = somarMeses(mes, passo); // recorrente que começou antes: a próxima
    for (let n = 0; n < 600 && mes < fim; n++) {
      add(mes, valor, origem, nome, nota);
      if (!passo) break;
      mes = somarMeses(mes, passo);
    }
  });
  return out.sort((a, b) => (a.mes < b.mes ? -1 : (a.mes > b.mes ? 1 : 0)));
}

/**
 * 04/10/2026: migração da meta de viagem cadastrada antes (v2) - sem perder
 * nada. Destinos: país digitado -> código ISO (acentos, caixa e sinônimos:
 * "Suiça"/"Switzerland" -> CH, "Inglaterra"/"Reino Unido" -> GB, "Holanda" ->
 * NL; sem país, pela cidade conhecida); itens fixos antigos -> "A pagar" (no
 * cartão; o `pago` vira à vista); conta mensal -> item no cartão; viagem sem
 * entradas configuradas ganha o 13º e o FGTS (90%), como o Tiago pediu. O
 * que não der pra mapear vira um aviso "revise: <campo>".
 * { meta (cópia), revisar: [{ destinoId?, fixoId?, campo, texto }], mudou }
 */
export function migrarMetaViagem(meta, { paises = [], cidades = null } = {}) {
  if (!meta || !['viagemInternacional', 'viagemNacional'].includes(meta.tipo)) return { meta, revisar: [], mudou: false };
  const m = JSON.parse(JSON.stringify(meta));
  m.especificos = m.especificos && typeof m.especificos === 'object' ? m.especificos : {};
  const esp = m.especificos;
  const revisar = [];
  let mudou = false;
  (esp.destinos || []).forEach((d) => {
    if (!d.id) { d.id = idCurto(); mudou = true; }
    let p = d.paisCodigo ? paisPorCodigo(d.paisCodigo, paises) : null;
    if (!p) {
      p = acharPais(d.pais, paises);
      let deduzido = false;
      if (!p && !String(d.pais || '').trim()) {
        p = acharPaisPelaCidade(d.cidade, cidades, paises) || (m.tipo === 'viagemNacional' ? paisPorCodigo('BR', paises) : null);
        deduzido = !!p;
      }
      if (p) {
        d.paisCodigo = p.codigo;
        if (d.pais !== p.nome) { if (String(d.pais || '').trim()) d.paisDigitado = d.pais; d.pais = p.nome; }
        if (deduzido) revisar.push({ destinoId: d.id, campo: 'país', texto: `país deduzido pela cidade (${p.nome}) - confira` });
        mudou = true;
      } else if (paises.length && (String(d.pais || '').trim() || String(d.cidade || '').trim())) {
        revisar.push({ destinoId: d.id, campo: 'país', texto: String(d.pais || '').trim() ? `"${d.pais}" não reconhecido - escolha o país na lista` : 'escolha o país na lista' });
      }
    }
    if (p && d.moeda && p.moeda && d.moeda !== p.moeda) {
      revisar.push({ destinoId: d.id, campo: 'moeda', texto: `a moeda está ${d.moeda}, mas a de ${p.nome} é ${p.moeda} - confira em que moeda estão os gastos` });
    }
  });
  (esp.fixos || []).forEach((f) => {
    if (!f.id) { f.id = idCurto(); mudou = true; }
    if (!['cartao', 'pago', 'juntar'].includes(f.forma)) {
      f.forma = f.pago ? 'pago' : 'cartao';
      mudou = true;
    }
    if (f.forma === 'cartao' && !f.inicio) revisar.push({ fixoId: f.id, campo: 'mês da 1ª fatura', texto: `"${f.nome}": informe o mês da 1ª fatura (pra montar as parcelas por mês)` });
  });
  if (m.contaMensal && num(m.contaMensal.valor) > 0) {
    const n = Math.max(1, num(m.contaMensal.meses) || 1);
    esp.fixos = esp.fixos || [];
    esp.fixos.push({ id: idCurto(), nome: m.contaMensal.descricao || 'Passagens e hospedagem', valor: r2(num(m.contaMensal.valor) * n), moeda: 'BRL', parcelas: n, inicio: m.contaMensal.inicio || null, parte: 1, forma: 'cartao', cartao: '', confirmado: false, pago: false });
    m.contaMensal = null;
    mudou = true;
  }
  if (!Array.isArray(m.entradas)) {
    m.entradas = [entradaPadrao('decimo13'), entradaPadrao('fgts')];
    m._entradasPadrao = true;
    mudou = true;
  }
  m._revisar = revisar;
  return { meta: m, revisar, mudou };
}

/**
 * organizacao-calc.js - 26/09/2026: contas da tela Organização Financeira
 * (sem DOM - testável). Espelham as fórmulas da planilha, pra tela mostrar o
 * efeito de uma alteração ANTES de gravar (simulador):
 *
 *   por mês (item)      = valor (Mensal) ou valor / 12 (Anual)
 *   com folga (item)    = por mês × (1 + folga)                 'Despesas Essenciais'!C
 *   custo de vida       = Σ com folga                           C{total} = DM!K11
 *   base da reserva     = custo de vida × meses                 DM!M11
 *   meta da reserva     = base × (1 + sobra)                    DM!M12
 *   renda desejada      = (custo de vida + extra) × (1 + reinv) DM!M19
 *   patrimônio desejado = renda desejada × 12 / rendimento      DM!N18
 *
 * O "salário: pra onde vai" usa o gasto REAL (sem folga): a folga é margem
 * de segurança da reserva, não dinheiro que sai todo mês.
 */

export const CATEGORIAS = [
  'Moradia', 'Contas da casa', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Assinaturas', 'Dívidas e parcelas', 'Outros',
];
export const SEM_CATEGORIA = 'Sem categoria';

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Ordem importa: "Uber Assinatura" é assinatura antes de ser transporte;
// "Parcela Apartamento" é moradia antes de ser parcela.
const REGRAS_CATEGORIA = [
  ['Assinaturas', /assinatura|spotify|youtube|netflix|streaming|\bdrive\b|icloud|\bprime\b|disney|\bhbo\b|\bmax\b|deezer|apple (one|music|tv)|google one|chatgpt|globoplay|paramount/],
  ['Moradia', /apartamento|aluguel|condominio|\biptu\b|diarista|faxin|financiamento imob|\bcasa\b/],
  ['Transporte', /\buber\b|\b99\b|combustivel|gasolina|\bipva\b|seguro (do )?(carro|auto)|estacionamento|onibus|metro|pedagio|licenciamento/],
  ['Contas da casa', /\bgas\b|\bagua\b|\bluz\b|energia|internet|celular|telefone|\btv\b/],
  ['Alimentação', /supermercado|mercado|feira|padaria|acougue|restaurante|\bifood\b|hortifruti/],
  ['Saúde', /plano de saude|saude|farmacia|remedio|medic|dentist|terapia|psicolog|academia/],
  ['Educação', /curso|escola|faculdade|mensalidade|livro|idioma|ingles/],
  ['Dívidas e parcelas', /\bfies\b|emprestimo|parcela|financiamento|consorcio|divida/],
  ['Outros', /cartao/],
];

/** Categoria sugerida pelo nome (só sugestão - só vai pra planilha se o Tiago aplicar). */
export function categoriaSugerida(nome) {
  const n = semAcento(nome);
  if (!n.trim()) return '';
  const r = REGRAS_CATEGORIA.find(([, re]) => re.test(n));
  return r ? r[0] : '';
}

/** "4.260,00" / "4260" / "4260.5" / "R$ 1.234,5" -> número (null se não der). */
export function lerValorBR(texto) {
  if (num(texto)) return texto;
  let s = String(texto == null ? '' : texto).replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function mensalDespesa(item) {
  const v = num(item && item.valor) ? item.valor : 0;
  return item && item.frequencia === 'Anual' ? v / 12 : v;
}

/**
 * Tudo que a tela mostra, a partir de um rascunho { itens, folga, meses, sobra }
 * e do contexto do servidor (reserva atual, salário, patrimônio).
 */
export function calcularOrganizacao(rascunho, contexto = {}) {
  const itens = (rascunho.itens || []).filter((i) => !i.removida);
  const folga = num(rascunho.folga) ? rascunho.folga : 0;
  const meses = num(rascunho.meses) ? rascunho.meses : 0;
  const sobra = num(rascunho.sobra) ? rascunho.sobra : 0;
  const totalReal = itens.reduce((s, i) => s + mensalDespesa(i), 0);
  const totalComFolga = totalReal * (1 + folga);
  const base = totalComFolga * meses;
  const meta = base * (1 + sobra);
  const reserva = contexto.reserva || {};
  const atual = num(reserva.atual) ? reserva.atual : null;

  const mapa = new Map();
  itens.forEach((i) => {
    const cat = (i.categoria || '').trim() || SEM_CATEGORIA;
    const m = mapa.get(cat) || { categoria: cat, valor: 0, qtd: 0 };
    m.valor += mensalDespesa(i);
    m.qtd += 1;
    mapa.set(cat, m);
  });
  const porCategoria = [...mapa.values()]
    .map((c) => ({ ...c, comFolga: c.valor * (1 + folga), pct: totalReal > 0 ? c.valor / totalReal : 0 }))
    .sort((a, b) => b.valor - a.valor);

  const sal = contexto.salario || {};
  let salario = null;
  if (num(sal.liquido) && sal.liquido > 0) {
    const aporte = num(sal.aporte) ? sal.aporte : (num(sal.percentualInvestir) ? sal.liquido * sal.percentualInvestir : 0);
    const livre = sal.liquido - totalReal - aporte;
    salario = {
      liquido: sal.liquido,
      essenciais: totalReal,
      aporte,
      livre,
      pctEssenciais: totalReal / sal.liquido,
      pctAporte: aporte / sal.liquido,
      pctLivre: livre / sal.liquido,
    };
  }

  const pat = contexto.patrimonio || {};
  let patrimonioDesejado = null;
  let rendaDesejada = null;
  if (num(pat.rendimento) && pat.rendimento > 0) {
    rendaDesejada = (totalComFolga + (num(pat.extra) ? pat.extra : 0)) * (1 + (num(pat.reinvestimento) ? pat.reinvestimento : 0));
    patrimonioDesejado = (rendaDesejada * 12) / pat.rendimento;
  }

  return {
    qtd: itens.length,
    folga, meses, sobra,
    totalReal,
    totalComFolga,
    base,
    meta,
    // as duas margens juntas, sobre o gasto real × meses
    margemTotal: totalReal > 0 ? (1 + folga) * (1 + sobra) - 1 : 0,
    baseReal: totalReal * meses,
    atual,
    falta: atual == null ? null : Math.max(0, meta - atual),
    atingido: atual == null || !(meta > 0) ? null : atual / meta,
    metaAtingida: atual != null && meta > 0 && atual >= meta,
    cobertura: atual == null || !(totalComFolga > 0) ? null : atual / totalComFolga,
    coberturaReal: atual == null || !(totalReal > 0) ? null : atual / totalReal,
    porCategoria,
    salario,
    rendaDesejada,
    patrimonioDesejado,
  };
}

let seqId = 0;
const novoId = () => `d${Date.now().toString(36)}${(seqId += 1)}`;

/** Resposta do getDespesas -> rascunho editável (cada item guarda o original pra comparar). */
export function rascunhoDoServidor(r) {
  const d = (r && r.despesas) || {};
  const res = (r && r.reserva) || {};
  return {
    itens: (d.itens || []).map((i) => {
      const item = { nome: i.nome, valor: num(i.valor) ? i.valor : 0, categoria: i.categoria || '', frequencia: i.frequencia === 'Anual' ? 'Anual' : 'Mensal' };
      return { id: novoId(), ...item, original: { ...item } };
    }),
    folga: num(d.folga) ? d.folga : 0,
    meses: num(res.meses) ? res.meses : 6,
    sobra: num(res.sobra) ? res.sobra : 0,
    original: { folga: num(d.folga) ? d.folga : 0, meses: num(res.meses) ? res.meses : 6, sobra: num(res.sobra) ? res.sobra : 0 },
    assinatura: r && r.assinatura,
  };
}

export function novoItemDespesa(campos = {}) {
  return { id: novoId(), nome: '', valor: 0, categoria: '', frequencia: 'Mensal', nova: true, ...campos };
}

const mesmoValor = (a, b) => Math.round((a || 0) * 100) === Math.round((b || 0) * 100);

/** Estado de uma linha: 'nova' | 'removida' | 'editada' | '' */
export function estadoItem(item) {
  if (item.removida) return item.nova ? 'descartada' : 'removida';
  if (item.nova || !item.original) return 'nova';
  const o = item.original;
  const mudou = o.nome !== item.nome.trim() || !mesmoValor(o.valor, item.valor) || o.categoria !== item.categoria.trim() || o.frequencia !== item.frequencia;
  return mudou ? 'editada' : '';
}

/** Quantas mudanças o rascunho tem (linhas novas/editadas/removidas + parâmetros da reserva). */
export function mudancasRascunho(rascunho) {
  const out = { novas: 0, editadas: 0, removidas: 0, parametros: [] };
  (rascunho.itens || []).forEach((i) => {
    const e = estadoItem(i);
    if (e === 'nova') out.novas += 1;
    else if (e === 'editada') out.editadas += 1;
    else if (e === 'removida') out.removidas += 1;
  });
  const o = rascunho.original || {};
  if (!mesmoValor((o.folga || 0) * 100, (rascunho.folga || 0) * 100)) out.parametros.push('folga');
  if (o.meses !== rascunho.meses) out.parametros.push('meses');
  if (!mesmoValor((o.sobra || 0) * 100, (rascunho.sobra || 0) * 100)) out.parametros.push('sobra');
  out.total = out.novas + out.editadas + out.removidas + out.parametros.length;
  return out;
}

/** Problemas que impedem salvar (lista de textos; vazia = pode salvar). */
export function validarRascunho(rascunho) {
  const erros = [];
  const vivos = (rascunho.itens || []).filter((i) => !i.removida);
  if (!vivos.length) erros.push('A lista precisa ter pelo menos 1 despesa.');
  vivos.forEach((i, k) => {
    if (!String(i.nome || '').trim()) erros.push(`A despesa ${k + 1} está sem nome.`);
    else if (/^total/i.test(i.nome.trim())) erros.push(`"${i.nome.trim()}" é um nome reservado da planilha.`);
    if (!num(i.valor) || i.valor < 0) erros.push(`Valor inválido em "${i.nome || `despesa ${k + 1}`}".`);
  });
  const nomes = vivos.map((i) => semAcento(i.nome).trim()).filter(Boolean);
  const repetidos = [...new Set(nomes.filter((n, k) => nomes.indexOf(n) !== k))];
  if (repetidos.length) erros.push(`Nome repetido: ${repetidos.join(', ')}.`);
  if (!num(rascunho.folga) || rascunho.folga < 0 || rascunho.folga > 1) erros.push('Folga precisa estar entre 0% e 100%.');
  if (!num(rascunho.sobra) || rascunho.sobra < 0 || rascunho.sobra > 1) erros.push('Sobra precisa estar entre 0% e 100%.');
  if (!num(rascunho.meses) || rascunho.meses <= 0 || rascunho.meses > 60) erros.push('Meses da reserva precisa estar entre 1 e 60.');
  return erros;
}

/** O que vai pro back-end (salvarDespesas). */
export function payloadRascunho(rascunho) {
  return {
    itens: (rascunho.itens || []).filter((i) => !i.removida).map((i) => ({
      nome: String(i.nome).trim(), valor: Math.round(i.valor * 100) / 100, categoria: String(i.categoria || '').trim(), frequencia: i.frequencia === 'Anual' ? 'Anual' : 'Mensal',
    })),
    folga: rascunho.folga,
    meses: rascunho.meses,
    sobra: rascunho.sobra,
    assinatura: rascunho.assinatura,
  };
}

/** Diferenças entre dois cálculos (antes = como está na planilha, depois = rascunho). */
export function impactoRascunho(antes, depois) {
  const d = (k) => (num(antes[k]) && num(depois[k]) ? depois[k] - antes[k] : null);
  return {
    totalReal: d('totalReal'),
    totalComFolga: d('totalComFolga'),
    meta: d('meta'),
    patrimonioDesejado: d('patrimonioDesejado'),
    coberturaAntes: antes.cobertura,
    coberturaDepois: depois.cobertura,
  };
}

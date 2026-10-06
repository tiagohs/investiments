/**
 * metas-calc-plano.js (antes metas-calc.js) - 02/10/2026: contas da tela Metas e Objetivos (metas.html).
 * Funções puras (sem DOM, sem fetch) - testadas em tests/metas-calc.test.js.
 *
 * Tiago: "Para alcançar 5.000 euros até o mês X com rendimento Y%, aporte R$ Z
 * por mês - e o inverso: com aporte Z, quando chego". Toda meta tem um alvo em
 * reais (o valor na moeda da meta x câmbio do dia; sub-itens em qualquer moeda),
 * um "já tenho" (investimentos vinculados + o que ele guardou fora + sub-itens
 * já pagos) e, se tiver data, o aporte mensal necessário com o rendimento
 * informado. A reserva de emergência é diferente: não tem data, é "manter o
 * saldo ideal" = meses x custo de vida (das Despesas essenciais) x (1 + sobra).
 * A renda passiva mede renda (média de proventos de 12 meses, a mesma da
 * Distribuição e Metas) e também o patrimônio que gera essa renda.
 *
 * Os valores dos ativos vinculados vêm do back-end (apps-script/Metas.gs,
 * valor de hoje de cada ativo - o mesmo da Início/Carteiras);
 * resolverVinculos tem a MESMA regra de Metas.gs!progressoVinculosMeta_.
 *
 * 03/10/2026 (Metas v2 - pedido do Tiago, "Focando em metas"): reserva com
 * valor LÍQUIDO (IR/IOF se resgatasse hoje) e status "ideal" só quando o
 * líquido cobre o alvo; vínculo "Saldo em conta" (instituição + moeda + saldo,
 * ex. Wise em euro); aporte REAL deduzido do histórico (ctx.historico, de
 * GET metasHistorico - a digitação vira opcional); "nesse ritmo você chega
 * em X" e as simulações de 75%/50% do tempo + dicas pra acelerar com
 * números; aposentadoria com a conta da planilha (despesas + extra + %
 * reinvestimento = renda ideal -> montante) editável, marcos de milhão e
 * "se a renda fosse 10%/20% menor"; viagem por destinos (dias x gasto diário
 * por categoria, moeda de cada país, margem) + itens fixos parcelados;
 * explicação de todo status/indicador (EXPLICACOES, mostrada em toque/hover);
 * sugestões de investimento por tipo de meta (fontes citadas) e avaliação de
 * cada investimento vinculado (liquidez x prazo, risco x horizonte, moeda);
 * análise (mesmo formato de analise-grafico.js) dos gráficos de histórico,
 * projeção e renda mensal. Tudo puro, testado em tests/metas-calc.test.js.
 *
 * 04/10/2026 (Metas › Viagem - Tiago: "compras no cartão de crédito já
 * feitas (passagens, hotéis) não devem ser incluídas na conta de aportes [...]
 * O aporte mensal será sempre para o dinheiro que preciso juntar, e não para
 * o que eu tenho que pagar"; "meu 13º (90%) e meu FGTS Aniversário (90% do
 * que eu receber) vou colocar pra guardar [...] o aporte mensal necessário
 * tem que levar isso em consideração"; "Incluir a taxa diária de turismo";
 * países/cidades com bandeira; "Inclua link com o Wanderlog"):
 *   - viagem em DUAS partes (calcularViagem): "A pagar (já comprado)" - itens
 *     no cartão contam como PAGOS de antemão (só falta a fatura chegar), com
 *     o cronograma de parcelas por mês e por cartão, FORA do aporte - e "A
 *     juntar" - gasto lá (diárias x dias), taxa turística, margem e o que
 *     ainda não foi pago, menos o que já está guardado. O aporte, o status e
 *     a projeção olham só o "a juntar";
 *   - entradas programadas (qualquer meta): 13º (1ª parcela em novembro sem
 *     descontos, 2ª em dezembro com INSS/IR - estimado pelo holerite),
 *     saque-aniversário do FGTS (no mês do aniversário, pela conta da aba
 *     Patrimônio), PLR/bônus e outras, cada uma com o % que vai pra meta; só
 *     as que caem ANTES da data da meta. O aporte necessário desconta o valor
 *     delas (com o rendimento até a data) e a projeção sobe em degraus;
 *   - países (assets/data/paises.json) e a migração dos destinos digitados à
 *     mão (migrarMetaViagem: "Suiça"/"Switzerland" -> CH; itens fixos antigos
 *     -> "A pagar"; o que não reconhecer vira um aviso "revise");
 *   - taxa turística por destino (valor por pessoa por noite x noites x
 *     pessoas, com sugestão de assets/data/taxas-turisticas.json);
 *   - links (o roteiro no Wanderlog) validados.
 */

import { CATEGORIAS_ACUMULO, TIPOS_META, cotacao, mesDe, mesVenc, mesesEntre, num, paraBRL, r2, rotuloMes, somarMeses } from './metas-calc-nucleo.js';
import { calcularViagem, entradaPadrao, expandirEntradas } from './metas-calc-viagem.js';
import { formatBRL0 } from '../format.js';
import { pesosPadraoDistribuicao } from './metas-distribuicao.js'; // 06/10/2026: tipo "Distribuição da carteira"


/**
 * 03/10/2026 (Tiago: "o que significa 'atrasada' ou 'no ritmo'? Me explique
 * as coisas com toast aqui e em qualquer outro lugar"): texto de cada
 * indicador da tela - aparece no ícone "i" (toque/hover/teclado).
 */
export const EXPLICACOES = {
  percentual: 'Quanto do alvo você já tem hoje (valor atual dos investimentos vinculados + saldos em conta + o que foi informado como guardado + itens já pagos).',
  liquido: 'Valor líquido = o que cairia na sua conta se resgatasse tudo hoje: valor bruto menos IR (tabela regressiva: 22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois, sobre o rendimento) e IOF (só nos primeiros 30 dias). LCI/LCA são isentas. Mesmo cálculo da Carteira Renda Fixa.',
  bruto: 'Valor bruto = o valor de hoje dos investimentos, sem descontar impostos de um resgate.',
  aporteReal: 'Aporte real = média do que você colocou de fato por mês (compras menos vendas/resgates) nos investimentos vinculados nos últimos 12 meses fechados - calculado do histórico, sem precisar digitar. Se você informar um aporte em Editar, ele passa a valer no lugar.',
  aporteNecessario: 'Quanto aportar por mês, a partir de agora, para chegar no alvo exatamente no prazo, contando o rendimento esperado (juros compostos, aporte no fim de cada mês). Parcelas de itens fixos que ainda correm entram somadas.',
  noSeuRitmo: 'Quando você chega no alvo se continuar aportando o seu aporte atual (real ou informado) com o rendimento esperado.',
  saldoIdeal: 'Saldo ideal da reserva = meses de custo de vida x custo de vida mensal (Despesas essenciais) x (1 + sobra de segurança).',
  rendaMedia: 'Média mensal dos proventos recebidos nos últimos 12 meses fechados pelos ativos vinculados que você ainda tem (a mesma janela da Distribuição e Metas; proventos de um ativo já vendido ou convertido em outro ticker ficam de fora, por isso pode dar um pouco menos que lá).',
  patrimonioRenda: 'Patrimônio que gera a renda = valor de hoje dos ativos vinculados. O necessário é a renda anual dividida pelo rendimento em proventos (DY) esperado.',
  vencimentos: 'Título de renda fixa vinculado que vence: no vencimento o IR é descontado de qualquer jeito (tabela regressiva pelo tempo desde a aplicação) e o dinheiro cai na conta. "Sem reaplicar" é a reserva sem esse título (o dinheiro sai da carteira); "reaplicando" é a reserva se você puser o valor líquido de volta em um título vinculado. O mínimo é o saldo ideal líquido da meta.',
  velocidade: 'Simulação: o aporte mensal que faz você chegar no alvo em 75% ou 50% do tempo que levaria no ritmo atual (mesmo rendimento).',
  historico: 'Valor da meta no fim de cada mês, reconstruído pelo histórico dos ativos vinculados (cotações e títulos dia a dia) e dos saldos em conta. As barras são o aporte líquido do mês (compras - vendas).',
  projecao: 'Projeção a partir de hoje: a linha cheia é o seu ritmo atual; a tracejada é o aporte necessário para fechar no prazo; a pontilhada é o alvo.',
  rendaMensal: 'Proventos pagos em cada mês pelos ativos vinculados (sem vínculo: a carteira toda). Mês atual ainda parcial.',
  marcos: 'Mês em que a projeção cruza cada milhão (ou cada quarto do alvo), no seu ritmo e no aporte necessário.',
  taxaRetirada: 'Rendimento médio ao ano que o patrimônio paga sem acabar (a "taxa de retirada"). Montante = renda mensal x 12 / taxa. Na sua planilha: Rendimento Médio (Distribuição e Metas, M18).',
  reinvestimento: 'Parte da renda que você quer continuar reinvestindo depois de se aposentar (na planilha, L18). Renda ideal = base + base x %.',
  extra: 'Valor extra por mês somado às despesas essenciais (na planilha, K18) - lazer, viagens, imprevistos.',
  margemViagem: 'Folga sobre o gasto estimado lá (câmbio, imprevistos). O alvo em moeda estrangeira já inclui a margem.',
  cambio: 'Cotação de hoje (AwesomeAPI; se falhar, PTAX do Banco Central). O que falta em moeda estrangeira é convertido para reais por ela.',
  saldoConta: 'Dinheiro parado numa conta (ex. Wise em euro): não é investimento, entra pelo saldo informado, convertido pelo câmbio do dia. Atualize o saldo sempre que mudar - cada atualização vira um ponto no histórico.',
  avaliacao: 'Avaliação automática de cada investimento vinculado: liquidez x prazo da meta, risco (oscilação) x horizonte e moeda. Não é recomendação de compra ou venda.',
  // 04/10/2026 (viagem em 2 partes + entradas programadas)
  custoTotal: 'Quanto a viagem custa DE FATO: o que você já comprou (passagens, hotéis, ingressos no cartão ou pagos à vista) + o dinheiro que precisa guardar pra gastar lá e pagar o resto (o que já está guardado + o que ainda falta guardar). As compras já feitas ficam fora do aporte (você as paga nas faturas); aqui entram só pra você ver o custo inteiro.',
  aPagar: 'O que você JÁ COMPROU (passagens, hotéis, ingressos) no cartão conta como pago desde já: só falta a fatura chegar. Por isso fica fora do aporte - aqui você vê quanto paga em cada mês, por cartão. Cada parcela vira "confirmada" quando o mês da fatura passa (ou quando você marca o item como confirmado).',
  aJuntar: 'O dinheiro que você ainda precisa JUNTAR até a viagem: gasto lá (diárias x dias de cada destino, na moeda de lá), taxa turística, margem de segurança e o que ainda não foi pago - menos o que já está guardado (saldo em conta, ex. Wise em euro, e investimentos vinculados). O aporte mensal, o status e a projeção olham só essa parte.',
  entradas: 'Dinheiro que vai entrar e você já decidiu guardar na meta (13º, saque-aniversário do FGTS, PLR...). Só contam as que caem ANTES da data da meta. O aporte mensal necessário desconta o valor delas (com o rendimento até a data). Valor vazio = estimado pelo seu salário (aba Salário) e pelo FGTS (aba Patrimônio); dá pra digitar o valor e o mês.',
  decimo13: '13º salário: a 1ª parcela (até 30/nov) é metade do salário bruto, sem descontos; a 2ª (até 20/dez) é a outra metade menos o INSS e o IR do 13º inteiro. Estimado pelo seu último holerite (aba Salário) - se o 13º já estiver lançado lá, vale o valor lançado.',
  fgts: 'Saque-aniversário do FGTS: liberado no mês do seu aniversário (até o fim do 2º mês seguinte). Valor = alíquota da faixa x saldo + parcela adicional (Lei 8.036/90), estimado pela aba Patrimônio com o saldo projetado até lá.',
  taxaTuristica: 'Taxa turística (city tax / taxa de hospedagem): cobrada pelo hotel por pessoa e por noite, na moeda local - nem toda cidade cobra, e algumas têm limite de noites. Entra no dinheiro a juntar (sem margem). Os valores sugeridos são de um hotel 3 estrelas, com a fonte - confira antes de viajar.',
  cambioFonte: 'Cotação de hoje: 1º a da sua planilha (aba Bolsa USA >>>, GOOGLEFINANCE - dólar, libra, franco e euro); outras moedas pela aba aux_cambio (também GOOGLEFINANCE, criada sozinha); se a planilha não tiver, AwesomeAPI ou PTAX do Banco Central.',
};

// ---------------------------------------------------------------------------
// Datas (mês 'aaaa-mm')
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Juros compostos: aporte necessário, prazo, valor futuro
// ---------------------------------------------------------------------------

/** Taxa mensal equivalente a uma anual (fração): (1+a)^(1/12) - 1. */
export function taxaMensal(anual) {
  const a = num(anual);
  if (!a) return 0;
  return Math.pow(1 + a, 1 / 12) - 1;
}

/** Saldo depois de `meses` aportando `aporte` no fim de cada mês, rendendo `taxa` (mensal). */
export function valorFuturo({ atual = 0, aporte = 0, meses = 0, taxa = 0 }) {
  const n = Math.max(0, meses || 0);
  if (!taxa) return atual + aporte * n;
  const f = Math.pow(1 + taxa, n);
  return atual * f + aporte * ((f - 1) / taxa);
}

/**
 * Aporte mensal pra sair de `atual` e chegar em `alvo` em `meses`, rendendo
 * `taxa` ao mês: (alvo - atual*(1+i)^n) * i / ((1+i)^n - 1). Já alcançado
 * (ou que alcança só com o rendimento) = 0. Sem meses = null.
 */
export function aporteNecessario({ alvo, atual = 0, meses, taxa = 0, entradas = null }) {
  if (!(alvo > 0)) return 0;
  if (meses == null || !Number.isFinite(meses)) return null;
  if (atual >= alvo) return 0;
  // 04/10/2026: entradas programadas ({ k: mês a partir de hoje, valor }) rendem até a data
  const fvE = valorFuturoEntradas(entradas, meses, taxa);
  if (meses <= 0) return Math.max(0, alvo - atual - fvE); // prazo vencido: falta tudo agora
  if (!taxa) return Math.max(0, (alvo - atual - fvE) / meses);
  const f = Math.pow(1 + taxa, meses);
  return Math.max(0, ((alvo - atual * f - fvE) * taxa) / (f - 1));
}

/**
 * 04/10/2026: valor, no mês `n`, das entradas programadas ({ k, valor }: k =
 * meses a partir de hoje, 1 = o 1º ponto da projeção) que caem até n.
 */
export function valorFuturoEntradas(entradas, n, taxa = 0) {
  return (entradas || []).reduce((s, e) => (e && e.k <= n && e.valor > 0 ? s + e.valor * Math.pow(1 + (taxa || 0), Math.max(0, n - e.k)) : s), 0);
}

/** 04/10/2026: saldo mês a mês (0..n) com aporte no fim de cada mês e as entradas programadas no mês k. */
export function trajetoriaMensal({ atual = 0, aporte = 0, taxa = 0, entradas = null, meses = 0 }) {
  const porK = new Map();
  (entradas || []).forEach((e) => { if (e && e.valor > 0) porK.set(e.k, (porK.get(e.k) || 0) + e.valor); });
  const out = [atual];
  let v = atual;
  for (let t = 1; t <= meses; t++) {
    v = v * (1 + (taxa || 0)) + (aporte || 0) + (porK.get(t) || 0);
    out.push(v);
  }
  return out;
}

/**
 * Meses até chegar em `alvo` aportando `aporte` por mês (fracionário; Infinity
 * se nunca chega). (1+i)^n = (alvo*i + aporte) / (atual*i + aporte).
 */
export function prazoParaAlvo({ alvo, atual = 0, aporte = 0, taxa = 0, entradas = null }) {
  if (!(alvo > 0) || atual >= alvo) return 0;
  if (entradas && entradas.some((e) => e && e.valor > 0)) {
    // 04/10/2026: com entradas programadas não tem fórmula fechada - mês a mês
    const ultimaK = Math.max(...entradas.map((e) => e.k || 0));
    let v = atual;
    const porK = new Map();
    entradas.forEach((e) => { if (e && e.valor > 0) porK.set(e.k, (porK.get(e.k) || 0) + e.valor); });
    for (let t = 1; t <= 1200; t++) {
      const antes = v;
      v = v * (1 + (taxa || 0)) + (aporte || 0) + (porK.get(t) || 0);
      if (v >= alvo) {
        const passo = v - antes;
        return passo > 0 && !porK.get(t) ? t - 1 + (alvo - antes) / passo : t;
      }
      if (t > ultimaK && !(aporte > 0) && !(taxa > 0)) return Infinity;
    }
    return Infinity;
  }
  if (!taxa) return aporte > 0 ? (alvo - atual) / aporte : Infinity;
  const denom = atual * taxa + aporte;
  if (denom <= 0) return Infinity;
  const razao = (alvo * taxa + aporte) / denom;
  if (razao <= 0) return Infinity;
  const n = Math.log(razao) / Math.log(1 + taxa);
  return n > 0 ? n : 0;
}

/**
 * Simulador. Com `meses` (ou `dataAlvo`) devolve o aporte necessário; com
 * `aporte` devolve quando chega. Valores em reais.
 */
export function simular({ alvo, atual = 0, rendimentoAnual = 0, meses = null, aporte = null }) {
  const taxa = taxaMensal(rendimentoAnual);
  const out = { alvo, atual, taxa };
  if (meses != null) {
    out.meses = meses;
    out.aporte = aporteNecessario({ alvo, atual, meses, taxa });
    out.totalAportado = (out.aporte || 0) * Math.max(0, meses);
    out.rendimento = Math.max(0, alvo - atual - out.totalAportado);
  }
  if (aporte != null) {
    const n = prazoParaAlvo({ alvo, atual, aporte, taxa });
    out.aporteInformado = aporte;
    out.mesesAteAlvo = n;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Câmbio, vínculos, reserva
// ---------------------------------------------------------------------------

/**
 * Valor de hoje dos investimentos vinculados. Vínculo = um ativo (`id`), uma
 * classe inteira (`classe`: acoes|fiis|usa|rf), a marca da Renda Fixa
 * (`marca`: emergencial|longo-prazo) ou - 03/10/2026 - um "Saldo em conta"
 * (`tipo: 'saldo'`, instituição + moeda + saldo, convertido pelo `cambio`);
 * modo total, fração (0-1) ou valor fixo em reais (limitado ao que o ativo
 * vale). Cada item sai também com o líquido (IR/IOF se resgatasse hoje, de
 * `ativo.irResgate`, na mesma fração do vínculo).
 *
 * 05/10/2026 (A-11 - "Já guardado" era ~1,9x o patrimônio vinculável): CADA ATIVO
 * CONTA UMA VEZ. (1) Dentro da meta: se o mesmo ativo cai em mais de um vínculo
 * (marca dentro da classe, classe + ativo direto), vale o de MAIOR fração e os
 * outros ficam com 0 nesse ativo. (2) Entre metas: `opcoes.ocupado` ({ idDoAtivo:
 * { valor, metas: [nome] } }) é o que metas de prioridade maior já pegaram
 * (ver alocarMetas) - o ativo só entrega o que sobrou. Cada item sai com
 * `fracaoPorId` ({ idDoAtivo: fração do valor do ativo que ESTE vínculo conta }),
 * `pretendidoBRL` (o que o vínculo pediria sozinho) e o total com `cortadoBRL`
 * (pretendido - contado) e `donos` ({ idDoAtivo: [metas que já tinham] }).
 * 05/10/2026 (A-14): `opcoes.aliases` ({ TICKERANTIGO: 'TICKERATUAL' }, de
 * Incorporacoes.gs!tabelaAliasesTicker_) faz vínculo a ticker antigo achar o ativo atual.
 */
export function resolverVinculos(vinculos, ativos, cambio, opcoes = {}) {
  const lista = ativos || [];
  const ocupado = opcoes.ocupado || {};
  const aliases = opcoes.aliases || null;
  const idCanonico = (id) => {
    if (!aliases || !id) return id;
    const [ref, marca] = String(id).split('@');
    let t = String(ref).trim().toUpperCase();
    for (let i = 0; i < 5 && aliases[t]; i += 1) t = String(aliases[t]).toUpperCase();
    return marca === undefined ? t : `${t}@${marca}`;
  };
  // 1) o que cada vínculo pediria sozinho, por ativo
  const pre = (vinculos || []).map((v) => {
    if (v.tipo === 'saldo') return { v, saldo: true };
    const idv = v.tipo === 'ativo' || (!v.tipo && v.id) ? idCanonico(v.id) : null;
    const alvo = lista.filter((a) => {
      if (v.tipo === 'classe') return a.classe === v.classe;
      if (v.tipo === 'marca') return a.classe === 'rf' && a.marca === v.marca;
      return a.id === v.id || (idv != null && a.id === idv);
    });
    const base = alvo.reduce((s, a) => s + (Number(a.valorBRL) || 0), 0);
    let parte = 1;
    if (v.modo === 'fracao') parte = Math.max(0, Math.min(1, Number(v.fracao) || 0));
    if (v.modo === 'valor') parte = base > 0 ? Math.min(base, Number(v.valor) || 0) / base : 0;
    return { v, alvo, base, parte, idCanonico: idv };
  });
  // 2) por ativo, o vínculo de maior fração (empate: o 1º) é quem conta
  const vencedor = new Map();
  pre.forEach((p, i) => {
    if (p.saldo) return;
    p.alvo.forEach((a) => {
      const atual = vencedor.get(a.id);
      if (atual === undefined || p.parte > pre[atual].parte + 1e-12) vencedor.set(a.id, i);
    });
  });
  // 3) o que sobra depois das metas anteriores
  const usoNovo = {};
  const donosCortes = {};
  let total = 0;
  let cortado = 0;
  const itens = pre.map((p, i) => {
    const v = p.v;
    if (p.saldo) {
      const cot = cotacao(v.moeda || 'BRL', cambio);
      const valor = cot == null ? 0 : r2((Number(v.saldo) || 0) * cot);
      total += valor;
      return { ...v, base: valor, valorBRL: valor, pretendidoBRL: valor, ativos: [], encontrado: cot != null, cotacao: cot, impostoBRL: 0, liquidoBRL: valor, semCambio: cot == null };
    }
    const fracaoPorId = {};
    let valor = 0;
    let pretendido = 0;
    let imposto = 0;
    p.alvo.forEach((a) => {
      const vale = Number(a.valorBRL) || 0;
      const quer = vale * p.parte;
      pretendido += quer;
      fracaoPorId[a.id] = 0;
      if (vencedor.get(a.id) !== i) return; // outro vínculo da MESMA meta já cobre este ativo com fração maior
      const oc = ocupado[a.id];
      const jaUsado = (oc ? Number(oc.valor) || 0 : 0) + (usoNovo[a.id] || 0);
      const toma = Math.max(0, Math.min(quer, vale - jaUsado));
      if (toma < quer - 0.005 && oc && oc.metas && oc.metas.length) donosCortes[a.id] = oc.metas;
      valor += toma;
      usoNovo[a.id] = (usoNovo[a.id] || 0) + toma;
      fracaoPorId[a.id] = vale > 0 ? toma / vale : 0;
      if (a.irResgate) imposto += ((Number(a.irResgate.ir) || 0) + (Number(a.irResgate.iof) || 0)) * fracaoPorId[a.id];
    });
    valor = r2(valor);
    total += valor;
    cortado += Math.max(0, pretendido - valor);
    return { ...v, id: p.idCanonico || v.id, base: r2(p.base), valorBRL: valor, pretendidoBRL: r2(pretendido), ativos: p.alvo, fracaoPorId, encontrado: p.alvo.length > 0, impostoBRL: r2(imposto), liquidoBRL: r2(valor - imposto) };
  });
  return { total: r2(total), itens, cortadoBRL: r2(cortado), uso: usoNovo, donos: donosCortes };
}

/** Fração do valor do ativo `a` que o item de vínculo `v` conta (A-11: cada ativo conta uma vez). */
function fracaoDoItem(v, a) {
  if (v.fracaoPorId && Object.prototype.hasOwnProperty.call(v.fracaoPorId, a.id)) return v.fracaoPorId[a.id];
  return v.base > 0 ? v.valorBRL / v.base : 0;
}

/**
 * 05/10/2026 (A-11): prioridade de quem fica com o dinheiro quando duas metas
 * vinculam o mesmo ativo (Tiago: reserva primeiro, depois renda passiva, depois
 * aposentadoria; as outras metas, na ordem da lista, depois dessas).
 */
export const PRIORIDADE_TIPOS_ALOCACAO = ['reservaEmergencia', 'rendaPassiva', 'aposentadoria'];

export function ordemDeAlocacao(metas) {
  const peso = (m) => { const k = PRIORIDADE_TIPOS_ALOCACAO.indexOf(m.tipo); return k < 0 ? PRIORIDADE_TIPOS_ALOCACAO.length : k; };
  return (metas || []).map((m, i) => ({ m, i })).sort((a, b) => peso(a.m) - peso(b.m) || a.i - b.i).map((x) => x.m);
}

/**
 * Aloca os ativos entre as metas ATIVAS, na ordem de prioridade (ordemDeAlocacao):
 * cada ativo é entregue uma vez só. Devolve { ocupadoPorMeta: { [metaId]: ocupado
 * ANTES da meta (o que as de prioridade maior já pegaram) }, usoPorMeta, totalAlocado,
 * patrimonioVinculavel } - passe `ocupadoPorMeta` em ctx.ocupadoPorMeta pro calcularMeta.
 * Meta sem `id` usa a chave '__sem-id-<posição>'.
 */
export function alocarMetas(metas, ativos, cambio, aliases = null) {
  const ocupado = {};
  let saldos = 0; // saldos em conta vinculados (dinheiro fora de ativos): também são patrimônio vinculável
  const ocupadoPorMeta = {};
  const usoPorMeta = {};
  // 06/10/2026 (Tiago: "a única exceção de ter os mesmos ativos em duas metas seria Renda Emergencial e Patrimônio"):
  // a reserva e a aposentadoria podem contar OS MESMOS ativos. A aposentadoria não vê o que a reserva pegou; quem vem
  // depois vê, de cada ativo, o maior dos dois usos (o mesmo dinheiro não é contado em dobro).
  const usoReserva = {}; // { idDoAtivo: valor } pego pela reserva
  const nomesReserva = new Set();
  const ativas = (metas || []).filter((m) => m && m.status !== 'arquivada');
  ordemDeAlocacao(ativas).forEach((m) => {
    const chave = m.id || `__sem-id-${ativas.indexOf(m)}`;
    const ehApos = m.tipo === 'aposentadoria';
    let visao = ocupado;
    if (ehApos && Object.keys(usoReserva).length) {
      visao = {};
      Object.entries(ocupado).forEach(([id, x]) => {
        visao[id] = { valor: Math.max(0, (Number(x.valor) || 0) - (usoReserva[id] || 0)), metas: (x.metas || []).filter((n) => !nomesReserva.has(n)) };
      });
    }
    ocupadoPorMeta[chave] = JSON.parse(JSON.stringify(visao));
    const r = resolverVinculos(m.vinculos, ativos, cambio, { ocupado: visao, aliases });
    saldos += r.itens.filter((v) => v.tipo === 'saldo').reduce((t, v) => t + (v.valorBRL || 0), 0);
    usoPorMeta[chave] = r.uso;
    Object.entries(r.uso).forEach(([id, valor]) => {
      const x = ocupado[id] || (ocupado[id] = { valor: 0, metas: [] });
      if (m.tipo === 'reservaEmergencia') {
        usoReserva[id] = (usoReserva[id] || 0) + valor;
        x.valor += valor;
        if (valor > 0.005) nomesReserva.add(m.nome);
      } else if (ehApos) {
        x.valor += Math.max(0, valor - (usoReserva[id] || 0)); // a parte que coincide com a da reserva não ocupa de novo
      } else x.valor += valor;
      if (valor > 0.005 && !x.metas.includes(m.nome)) x.metas.push(m.nome);
    });
  });
  const patrimonioVinculavel = r2((ativos || []).reduce((s, a) => s + (Number(a.valorBRL) || 0), 0) + saldos);
  const totalAlocado = r2(Object.values(ocupado).reduce((s, x) => s + x.valor, 0));
  return { ocupadoPorMeta, usoPorMeta, totalAlocado, patrimonioVinculavel };
}

/**
 * Vínculos a ativo que não existem mais entre os ativos de hoje (vendido,
 * renomeado sem alias) - antes sumiam em silêncio e a meta aparecia com
 * progresso menor sem explicação (A-14). [{ meta, metaId, id }]
 */
export function vinculosOrfaos(metas, ativos, cambio, aliases = null) {
  const out = [];
  (metas || []).filter((m) => m && m.status !== 'arquivada').forEach((m) => {
    resolverVinculos(m.vinculos, ativos, cambio, { aliases }).itens.forEach((v) => {
      if ((v.tipo === 'ativo' || (!v.tipo && v.id)) && !v.encontrado) out.push({ meta: m.nome, metaId: m.id || null, id: v.id });
    });
  });
  return out;
}

/**
 * Quanto de cada ativo as metas PEDEM somando tudo (sem a exclusividade) - pra
 * avisar que o mesmo dinheiro está em mais de uma meta. A alocação exclusiva
 * (alocarMetas) garante que o progresso não conta o ativo duas vezes; isto só
 * diz quem pediu o quê. Devolve [{ id, nome, valorBRL, comprometido, fracao,
 * metas: [nome] }] só dos que passam de 100%.
 */
export function ativosSobrecomprometidos(metas, ativos) {
  const mapa = new Map();
  // 06/10/2026: meta com "ignorar este aviso" (meta.ignorarAvisos inclui 'sobreposicao') sai da conta; reserva e
  // aposentadoria podem dividir os mesmos ativos (conta o maior dos dois, não a soma)
  (metas || []).filter((m) => m.status !== 'arquivada' && !ignoraAvisoSobreposicao(m)).forEach((m) => {
    resolverVinculos(m.vinculos, ativos).itens.forEach((v) => {
      v.ativos.forEach((a) => {
        const parte = v.pretendidoBRL != null && v.base > 0 ? v.pretendidoBRL * ((Number(a.valorBRL) || 0) / v.base) : (v.base > 0 ? v.valorBRL * ((Number(a.valorBRL) || 0) / v.base) : 0);
        const x = mapa.get(a.id) || { id: a.id, nome: a.nome, valorBRL: a.valorBRL, outros: 0, reserva: 0, apos: 0, metas: [] };
        if (m.tipo === 'reservaEmergencia') x.reserva += parte;
        else if (m.tipo === 'aposentadoria') x.apos += parte;
        else x.outros += parte;
        if (!x.metas.includes(m.nome)) x.metas.push(m.nome);
        mapa.set(a.id, x);
      });
    });
  });
  return [...mapa.values()].map((x) => {
    const comprometido = x.outros + Math.max(x.reserva, x.apos);
    return { id: x.id, nome: x.nome, valorBRL: x.valorBRL, metas: x.metas, comprometido: r2(comprometido), fracao: x.valorBRL > 0 ? comprometido / x.valorBRL : 0 };
  }).filter((x) => x.fracao > 1.005 && x.metas.length > 1);
}

/** 06/10/2026: a meta pediu "ignorar este aviso" de sobreposição de ativos (persistido em meta.ignorarAvisos). */
export function ignoraAvisoSobreposicao(meta) {
  return !!(meta && Array.isArray(meta.ignorarAvisos) && meta.ignorarAvisos.includes('sobreposicao'));
}

/** Reserva ideal = meses x despesa mensal x (1 + margem). */
export function reservaIdeal({ despesaMensal, meses, margem = 0 }) {
  const d = num(despesaMensal); const m = num(meses);
  if (!(d > 0) || !(m > 0)) return null;
  return r2(d * m * (1 + (num(margem) || 0)));
}

/** Parcelas pagas de uma conta recorrente (manual, ou pelos meses desde o início). */
export function parcelasPagas(rec, hoje) {
  if (!rec) return 0;
  const total = num(rec.totalParcelas || rec.meses) || 0;
  if (num(rec.parcelasPagas) != null) return Math.min(total, num(rec.parcelasPagas));
  if (!rec.inicio) return 0;
  const n = mesesEntre(rec.inicio, hoje) + 1;
  return Math.max(0, Math.min(total, n));
}

// ---------------------------------------------------------------------------
// A conta de uma meta
// ---------------------------------------------------------------------------

/**
 * 03/10/2026: a conta da aposentadoria, passo a passo (a da planilha,
 * Distribuição e Metas K17:N19): base = despesas essenciais + extra;
 * reinvestimento = base x %; renda ideal = base + reinvestimento; montante =
 * renda x 12 / rendimento médio. Modos: 'calculado' (essa conta), 'renda'
 * (renda digitada) e 'montante' (alvo digitado). Meta antiga sem modo: alvo
 * igual ao patrimônio desejado da planilha = 'calculado'.
 */
export function contaAposentadoria(meta, referencias = {}) {
  const esp = (meta && meta.especificos) || {};
  const refP = referencias.patrimonio || {};
  const refR = referencias.reserva || {};
  const valorAlvo = num(meta && meta.valorAlvo);
  let modo = esp.modoAlvo;
  if (!['calculado', 'renda', 'montante'].includes(modo)) {
    if (valorAlvo > 0) modo = num(refP.desejado) > 0 && Math.abs(valorAlvo - num(refP.desejado)) < 1 ? 'calculado' : 'montante';
    else modo = num(esp.rendaDesejada) > 0 ? 'renda' : 'calculado';
  }
  const taxa = num(esp.taxaRetirada) ?? num(refP.rendimento) ?? 0.04;
  const usarPlanilha = esp.usarDespesasPlanilha !== false && num(refR.custoDeVida) > 0;
  const despesa = usarPlanilha ? num(refR.custoDeVida) : (num(esp.despesaMensal) || 0);
  const extra = num(esp.extra) ?? num(refP.extra) ?? 0;
  const pctReinv = num(esp.reinvestimento) ?? num(refP.reinvestimento) ?? 0.25;
  // sem arredondar no meio do caminho (igual a planilha: N18 = M19*12/M18 com M19 cheio)
  const base = despesa + extra;
  const reinvestimento = base * pctReinv;
  let renda = null;
  if (modo === 'calculado') renda = base + reinvestimento;
  else if (modo === 'renda') renda = num(esp.rendaDesejada) || null;
  let montante = null;
  if (modo === 'montante') {
    montante = valorAlvo || null;
    renda = montante && taxa ? (montante * taxa) / 12 : null; // a renda que esse montante paga
  } else montante = renda && taxa ? (renda * 12) / taxa : null;
  return {
    modo, taxa, usarPlanilha, despesa, extra, base: r2(base), reinvestimentoPct: pctReinv, reinvestimento: r2(reinvestimento),
    renda: renda == null ? null : r2(renda), montante: montante == null ? null : r2(montante),
  };
}

/**
 * ctx: { ativos, cambio, referencias, proventos12m: { porTicker }, hoje: 'aaaa-mm-dd',
 *        historico?: { <id>: { aporteMedio, aporte3m, mesesBase } } (03/10/2026) }
 * Devolve tudo que a tela mostra de uma meta (valores em reais).
 */
export function calcularMeta(meta, ctx = {}) {
  const hoje = mesDe(ctx.hoje || new Date());
  const cambio = ctx.cambio || {};
  const esp = meta.especificos || {};
  const moeda = meta.moeda || 'BRL';
  const taxa = taxaMensal(meta.rendimentoAnual);
  const avisos = [];
  const partes = []; // composição do alvo, pra tela "de onde vem o alvo"
  const ehViagem = meta.tipo === 'viagemInternacional' || meta.tipo === 'viagemNacional';

  // --- alvo (na moeda da meta e em reais) ---
  let alvoMoeda = num(meta.valorAlvo);
  let alvoBRL = null;
  const itens = (meta.itens || []).map((it) => {
    const brl = paraBRL(it.valor, it.moeda || moeda, cambio);
    if (brl == null) avisos.push(`sem câmbio de ${it.moeda} pro item "${it.nome}"`);
    return { ...it, valorBRL: brl == null ? null : r2(brl) };
  });
  const itensConcluidosBRL = itens.filter((it) => it.concluido).reduce((s, it) => s + (it.valorBRL || 0), 0);
  const viagem = ehViagem && ((esp.destinos || []).length || (esp.fixos || []).length || (meta.contaMensal && num(meta.contaMensal.valor) > 0)) ? calcularViagem(meta, { cambio, hoje }) : null;
  let aposentadoria = null;

  if (meta.tipo === 'reservaEmergencia') {
    const ref = (ctx.referencias && ctx.referencias.reserva) || {};
    const usarPlanilha = esp.usarDespesasPlanilha !== false && num(ref.custoDeVida) > 0;
    const despesa = usarPlanilha ? num(ref.custoDeVida) : num(esp.despesaMensal);
    const meses = num(esp.meses) ?? num(ref.meses) ?? 6;
    const margem = num(esp.margem) ?? num(ref.sobra) ?? 0;
    alvoBRL = reservaIdeal({ despesaMensal: despesa, meses, margem });
    partes.push({ rotulo: usarPlanilha ? 'Custo de vida (Despesas essenciais)' : 'Despesa mensal informada', valor: despesa }, { rotulo: 'Meses', valor: meses, tipo: 'n' }, { rotulo: 'Sobra de segurança', valor: margem, tipo: '%' });
    alvoMoeda = alvoBRL;
  } else if (meta.tipo === 'rendaPassiva') {
    const renda = num(esp.rendaMensal) || 0;
    const dy = num(esp.dyAnual) || 0;
    alvoBRL = renda > 0 && dy > 0 ? r2((renda * 12) / dy) : null;
    alvoMoeda = alvoBRL;
    partes.push({ rotulo: 'Renda mensal desejada', valor: renda }, { rotulo: 'Rendimento (DY) ao ano', valor: dy, tipo: '%' });
  } else if (viagem) {
    // 04/10/2026: o alvo da viagem é só o "a juntar" (o que já foi comprado no cartão fica à parte)
    const simples = !viagem.temDestinos && num(meta.valorAlvo) > 0 ? paraBRL(meta.valorAlvo, moeda, cambio) : 0;
    const somaItens = itens.reduce((s, it) => s + (it.valorBRL || 0), 0);
    alvoBRL = r2(viagem.gastoBRL + (simples || 0) + somaItens);
    alvoMoeda = moeda === 'BRL' ? alvoBRL : (cotacao(moeda, cambio) ? alvoBRL / cotacao(moeda, cambio) : null);
    if (simples) partes.push({ rotulo: 'Dinheiro pra gastar lá (informado)', valor: r2(simples), moeda, valorMoeda: num(meta.valorAlvo) });
    Object.values(viagem.porMoeda).forEach((x) => {
      if (x.gastos > 0) partes.push({ rotulo: `Gasto lá em ${x.moeda} (${x.dias} dias${viagem.margem ? ` + ${Math.round(viagem.margem * 100)}% de margem` : ''})`, valor: x.cotacao == null ? null : r2((x.gastos + x.margemValor) * x.cotacao), moeda: x.moeda, valorMoeda: r2(x.gastos + x.margemValor) });
      if (x.taxa > 0) partes.push({ rotulo: `Taxa turística em ${x.moeda}`, valor: x.cotacao == null ? null : r2(x.taxa * x.cotacao), moeda: x.moeda, valorMoeda: x.taxa, chave: 'taxa-turistica' });
      if (x.itens > 0) partes.push({ rotulo: `Ainda não pago em ${x.moeda}`, valor: x.cotacao == null ? null : r2(x.itens * x.cotacao), moeda: x.moeda, valorMoeda: x.itens });
    });
    if (itens.length) partes.push({ rotulo: `Soma dos ${itens.length} sub-itens`, valor: r2(somaItens) });
    viagem.semCambio.forEach((m) => avisos.push(`sem câmbio de ${m}`));
  } else if (itens.length) {
    alvoBRL = itens.reduce((s, it) => s + (it.valorBRL || 0), 0);
    alvoMoeda = moeda === 'BRL' ? alvoBRL : (cotacao(moeda, cambio) ? alvoBRL / cotacao(moeda, cambio) : null);
    partes.push({ rotulo: `Soma dos ${itens.length} sub-itens`, valor: alvoBRL });
  } else if (meta.tipo === 'casa' && num(esp.valorImovel) > 0) {
    const v = num(esp.valorImovel); const ent = num(esp.entradaPct) ?? 0.2; const cus = num(esp.custosPct) ?? 0.05;
    alvoMoeda = v * (ent + cus);
    alvoBRL = paraBRL(alvoMoeda, moeda, cambio);
    partes.push({ rotulo: 'Valor do imóvel', valor: v }, { rotulo: 'Entrada', valor: ent, tipo: '%' }, { rotulo: 'ITBI, escritura e registro', valor: cus, tipo: '%' });
  } else if (meta.tipo === 'carro' && num(esp.valorCarro) > 0) {
    const v = num(esp.valorCarro); const ent = num(esp.entradaPct) ?? 1;
    alvoMoeda = v * ent;
    alvoBRL = paraBRL(alvoMoeda, moeda, cambio);
    partes.push({ rotulo: 'Valor do carro', valor: v }, { rotulo: ent >= 1 ? 'À vista' : 'Entrada', valor: ent, tipo: '%' });
  } else if (meta.tipo === 'aposentadoria') {
    aposentadoria = contaAposentadoria(meta, ctx.referencias || {});
    const ap = aposentadoria;
    if (ap.modo === 'calculado') {
      partes.push(
        { rotulo: ap.usarPlanilha ? 'Despesas essenciais por mês (renda emergencial)' : 'Despesas por mês (informado)', valor: ap.despesa, chave: 'despesa' },
        { rotulo: '+ Extra por mês', valor: ap.extra, chave: 'extra' },
        { rotulo: '= Base', valor: ap.base, chave: 'base' },
        { rotulo: `+ Reinvestimento (${Math.round(ap.reinvestimentoPct * 1000) / 10}% da base)`, valor: ap.reinvestimento, chave: 'reinvestimento' },
        { rotulo: '= Renda ideal por mês', valor: ap.renda, chave: 'renda' },
        { rotulo: 'Rendimento médio ao ano (retirada)', valor: ap.taxa, tipo: '%', chave: 'taxa' },
      );
    } else if (ap.modo === 'renda') {
      partes.push({ rotulo: 'Renda desejada por mês', valor: ap.renda, chave: 'renda' }, { rotulo: 'Rendimento médio ao ano (retirada)', valor: ap.taxa, tipo: '%', chave: 'taxa' });
    } else {
      partes.push({ rotulo: 'Montante informado', valor: ap.montante, chave: 'montante' }, { rotulo: `Renda que ele paga a ${Math.round(ap.taxa * 1000) / 10}% ao ano`, valor: ap.renda, chave: 'renda' });
    }
    alvoMoeda = ap.montante;
    alvoBRL = alvoMoeda != null ? paraBRL(alvoMoeda, moeda, cambio) : null;
  } else {
    alvoBRL = paraBRL(alvoMoeda, moeda, cambio);
  }
  if (alvoBRL == null && moeda !== 'BRL' && alvoMoeda > 0) avisos.push(`sem câmbio de ${moeda}`);

  // 06/10/2026 (Tiago: "não precisa me lembrar que está diferente na planilha; agora o que vale é o que está no site"):
  // sem avisos de "congelado em..." / "difere do patrimônio desejado da planilha". O que está salvo na meta manda
  // (esp.x ?? referência) e, ao salvar, o Metas.gs sobrescreve as células correspondentes da planilha.
  const congelados = [];

  // --- conta mensal (passagens/hospedagem parceladas) ---
  let conta = null;
  if (!ehViagem && meta.contaMensal && num(meta.contaMensal.valor) > 0) { // 04/10/2026: na viagem, vira item no cartão (calcularViagem)
    const total = num(meta.contaMensal.meses) || 1;
    const pagas = parcelasPagas({ totalParcelas: total, inicio: meta.contaMensal.inicio || hoje }, ctx.hoje || hoje);
    conta = {
      ...meta.contaMensal, total, pagas, restantes: total - pagas,
      valorTotal: r2(num(meta.contaMensal.valor) * total), valorPago: r2(num(meta.contaMensal.valor) * pagas),
      ativa: pagas < total,
    };
  }

  // --- já tenho ---
  // 05/10/2026 (A-11): só conta o que as metas de prioridade maior (reserva -> renda passiva -> aposentadoria) não pegaram
  const chaveAloc = meta.id || '';
  const vinc = resolverVinculos(meta.vinculos, ctx.ativos, cambio, { ocupado: (ctx.ocupadoPorMeta && ctx.ocupadoPorMeta[chaveAloc]) || {}, aliases: ctx.aliases || null });
  vinc.itens.filter((v) => v.semCambio).forEach((v) => avisos.push(`sem câmbio de ${v.moeda} pro saldo em ${v.instituicao}`));
  // 05/10/2026 (A-14): vínculo a ativo que sumiu/foi renomeado não some mais em silêncio
  vinc.itens.filter((v) => (v.tipo === 'ativo' || (!v.tipo && v.id)) && !v.encontrado).forEach((v) => avisos.push(`o ativo vinculado "${String(v.id || '').split('@')[0]}" não está mais na carteira (vendido ou com outro ticker) e não conta no progresso`));
  const donosCortados = [...new Set(Object.values(vinc.donos || {}).flat())];
  // 06/10/2026: o aviso de sobreposição sai à parte (`sobreposicao`) pra tela oferecer "ignorar este aviso" (meta.ignorarAvisos);
  // reserva e aposentadoria podem dividir os mesmos ativos, então só as outras combinações aparecem aqui
  let sobreposicao = null;
  if (vinc.cortadoBRL > 0.5 && donosCortados.length) {
    if (!ignoraAvisoSobreposicao(meta)) sobreposicao = { texto: `${formatBRL0(vinc.cortadoBRL)} do que você vinculou já está em ${donosCortados.join(' e ')} (maior prioridade) e não conta de novo aqui: cada ativo vale numa meta só (a exceção é a Reserva de emergência e a Aposentadoria, que podem contar os mesmos ativos)` };
  } else if (vinc.cortadoBRL > 0.5) avisos.push(`${formatBRL0(vinc.cortadoBRL)} dos vínculos se repetem dentro desta meta (ex.: classe + ativo da mesma classe) e contam uma vez só`);
  const valorInicial = num(meta.valorInicial) || 0;
  let atualBRL = r2(vinc.total + valorInicial + itensConcluidosBRL);
  // 03/10/2026: líquido (IR/IOF se resgatasse hoje)
  const impostoBRL = r2(vinc.itens.reduce((s, v) => s + (v.impostoBRL || 0), 0));
  const temRvVinculada = vinc.itens.some((v) => v.ativos.some((a) => a.classe !== 'rf'));
  const temRfSemIr = vinc.itens.some((v) => v.ativos.some((a) => a.classe === 'rf' && !a.irResgate));

  // --- pagamento recorrente (amortização) ---
  let recorrente = null;
  if (meta.contribuicao === 'recorrente' && meta.recorrente && num(meta.recorrente.parcela) > 0) {
    const rec = meta.recorrente;
    const total = num(rec.totalParcelas) || 1;
    const pagas = parcelasPagas(rec, ctx.hoje || hoje);
    recorrente = { parcela: num(rec.parcela), total, pagas, restantes: total - pagas, fim: rec.inicio ? somarMeses(rec.inicio, total - 1) : null };
    alvoBRL = r2(num(rec.parcela) * total);
    alvoMoeda = alvoBRL;
    atualBRL = r2(num(rec.parcela) * pagas + vinc.total + valorInicial);
  }
  const atualLiquidoBRL = r2(atualBRL - impostoBRL);
  const liquido = {
    brutoBRL: atualBRL, impostoBRL, liquidoBRL: atualLiquidoBRL,
    ir: r2(vinc.itens.reduce((s, v) => s + v.ativos.reduce((t, a) => t + (a.irResgate ? (Number(a.irResgate.ir) || 0) * fracaoDoItem(v, a) : 0), 0), 0)),
    iof: r2(vinc.itens.reduce((s, v) => s + v.ativos.reduce((t, a) => t + (a.irResgate ? (Number(a.irResgate.iof) || 0) * fracaoDoItem(v, a) : 0), 0), 0)),
    rvSemEstimativa: temRvVinculada, rfSemDados: temRfSemIr,
  };

  // --- renda passiva: renda de hoje ---
  let renda = null;
  if (meta.tipo === 'rendaPassiva') {
    const por = (ctx.proventos12m && ctx.proventos12m.porTicker) || {};
    const temVinculos = (meta.vinculos || []).length > 0;
    let total12 = 0;
    if (temVinculos) {
      vinc.itens.forEach((v) => {
        v.ativos.forEach((a) => {
          if (a.classe === 'rf') return;
          const prov = Number(por[String(a.ref || a.id).toUpperCase()]) || 0;
          const parte = fracaoDoItem(v, a); // fração que ESTE vínculo conta do ativo (A-11)
          total12 += prov * parte;
        });
      });
    }
    const ref = (ctx.referencias && ctx.referencias.rendaPassiva) || {};
    const media = temVinculos ? r2(total12 / 12) : (num(ref.media12m) || 0);
    const meta12 = num(esp.rendaMensal) || 0;
    renda = { atual: media, alvo: meta12, percentual: meta12 > 0 ? media / meta12 : null, origem: temVinculos ? 'vinculados' : 'carteira', yieldAtual: atualBRL > 0 ? (media * 12) / atualBRL : null };
  }

  // --- aporte: real (histórico) ou informado (03/10/2026) ---
  const hist = ctx.historico && meta.id ? ctx.historico[meta.id] : null;
  const aporteInformado = num(meta.aporteMensal);
  const aporteReal = hist && num(hist.aporteMedio) != null ? r2(num(hist.aporteMedio)) : null;
  let aporteAtual = 0;
  let aporteOrigem = 'nenhum';
  if (aporteInformado > 0) { aporteAtual = aporteInformado; aporteOrigem = 'informado'; } else if (aporteReal != null) { aporteAtual = Math.max(0, aporteReal); aporteOrigem = 'historico'; }

  // --- progresso, prazo e ritmo ---
  // 04/10/2026: na viagem o que já foi comprado não entra (é "a pagar", à parte)
  const totalExtra = conta ? conta.valorTotal : 0;
  const pagoExtra = conta ? conta.valorPago : 0;
  const total = alvoBRL != null ? alvoBRL + totalExtra : null;
  const ja = atualBRL + pagoExtra;
  const ehReserva = meta.tipo === 'reservaEmergencia';
  // reserva: o IDEAL é o líquido (Tiago: "se eu tenho 65k e a meta é 62k, se eu resgatar os 65k, o valor líquido precisa ser >= 62k")
  const atualRitmo = ehReserva ? atualLiquidoBRL : atualBRL;
  const falta = alvoBRL != null ? Math.max(0, r2(alvoBRL - atualRitmo)) : null;
  let percentual = total > 0 ? Math.min(1, (ehReserva ? atualLiquidoBRL : ja) / total) : null;
  const percentualBruto = total > 0 ? Math.min(1, ja / total) : null;
  if (renda && renda.percentual != null) percentual = Math.min(1, renda.percentual);

  const dataAlvo = ehReserva ? null : (meta.dataAlvo || (recorrente && recorrente.fim) || null);
  const mesesRestantes = dataAlvo ? mesesEntre(hoje, dataAlvo) : null;
  // 04/10/2026: entradas programadas (13º, FGTS...) que caem antes da data
  const entradas = Array.isArray(meta.entradas) && !ehReserva && !recorrente
    ? expandirEntradas(meta, { referencias: ctx.referencias || {}, hoje: ctx.hoje || hoje, ate: dataAlvo || somarMeses(hoje, 24) })
    : [];
  const entradasValidas = entradas.filter((e) => e.valor > 0);
  const entradasFluxo = entradasValidas.map((e) => ({ k: Math.max(1, mesesEntre(hoje, e.mes)), valor: e.valor, mes: e.mes }));
  const entradasTotal = r2(entradasValidas.reduce((s, e) => s + e.valor, 0));
  let necessario = null;
  if (recorrente) necessario = recorrente.restantes > 0 ? recorrente.parcela : 0;
  else if (alvoBRL != null && mesesRestantes != null) necessario = r2(aporteNecessario({ alvo: alvoBRL, atual: atualRitmo, meses: mesesRestantes, taxa, entradas: entradasFluxo }));
  // 04/10/2026: na viagem, as parcelas do cartão são pagas à parte (não somam no aporte)
  const parcelasCorrendo = viagem ? viagem.aPagar.mesAtualBRL : (conta && conta.ativa ? num(conta.valor) : 0);
  const necessarioTotal = viagem ? necessario : (necessario != null ? r2(necessario + parcelasCorrendo) : (parcelasCorrendo ? r2(parcelasCorrendo) : null));

  // prazo estimado no ritmo atual
  let mesesEstimados = null;
  if (recorrente) mesesEstimados = recorrente.restantes;
  else if (alvoBRL != null) mesesEstimados = prazoParaAlvo({ alvo: alvoBRL, atual: atualRitmo, aporte: aporteAtual, taxa, entradas: entradasFluxo });
  const dataEstimada = mesesEstimados != null && Number.isFinite(mesesEstimados) ? somarMeses(hoje, Math.ceil(mesesEstimados)) : null;

  let status;
  if (ehReserva) {
    if (alvoBRL != null && atualLiquidoBRL >= alvoBRL - 0.5) status = 'saldo-ideal';
    else if (alvoBRL != null && atualBRL >= alvoBRL - 0.5) status = 'ideal-bruto';
    else status = 'abaixo';
  } else if (meta.tipo === 'rendaPassiva' && renda && renda.alvo > 0 && renda.atual >= renda.alvo) status = 'concluida';
  else if (meta.tipo !== 'rendaPassiva' && total > 0 && ja >= total - 0.5) status = 'concluida';
  else if (!dataAlvo) status = 'sem-prazo';
  else if (mesesRestantes < 0 || (mesesRestantes === 0 && falta > 0)) status = 'vencida';
  else if (recorrente) status = 'no-ritmo';
  else status = aporteAtual + 0.5 >= (necessario || 0) ? 'no-ritmo' : 'atrasada';

  const calcPronto = {
    id: meta.id, alvoMoeda: alvoMoeda != null ? r2(alvoMoeda) : null, moeda, alvoBRL: alvoBRL != null ? r2(alvoBRL) : null,
    cotacao: cotacao(moeda, cambio), atualBRL, valorVinculado: vinc.total, valorInicial, itensConcluidosBRL: r2(itensConcluidosBRL),
    falta, faltaMoeda: falta != null && cotacao(moeda, cambio) ? r2(falta / cotacao(moeda, cambio)) : null,
    percentual, percentualBruto, dataAlvo, mesesRestantes, taxa, aporteAtual, aporteNecessario: necessario, aporteNecessarioTotal: necessarioTotal,
    mesesEstimados, dataEstimada, status, vinculos: vinc.itens, itens, conta, recorrente, renda, partes, avisos,
    // 03/10/2026 (v2)
    atualLiquidoBRL, faltaLiquida: alvoBRL != null ? Math.max(0, r2(alvoBRL - atualLiquidoBRL)) : null, liquido, atualRitmo, aporteReal, aporteInformado: aporteInformado || null, aporteOrigem,
    aporte3m: hist && num(hist.aporte3m) != null ? r2(num(hist.aporte3m)) : null, mesesBaseAporte: hist ? hist.mesesBase || 0 : 0,
    // 05/10/2026 (A-15): ritmo médio dos últimos meses <= 0 (sem aporte ou só resgates) - a projeção não vira "nunca" calado
    ritmoSemAporte: !(aporteInformado > 0) && aporteReal != null && aporteReal <= 0,
    congelados, sobreposicao, taxaRetirada: aposentadoria ? aposentadoria.taxa : null,
    viagem, aposentadoria, total: total != null ? r2(total) : null, ja: r2(ja), parcelasCorrendo: r2(parcelasCorrendo),
    // 05/10/2026 (A-11): quanto dos vínculos não conta porque outra meta (ou outro vínculo desta) já pegou
    vinculadoCortadoBRL: vinc.cortadoBRL || 0, valorAtivosVinculados: r2(vinc.itens.filter((v) => v.tipo !== 'saldo').reduce((t, v) => t + v.valorBRL, 0)),
    // 04/10/2026
    entradas, entradasFluxo, entradasTotal,
    // 06/10/2026 (Tiago: "falta a maior [informação]: quanto de fato a viagem está custando - soma das compras no cartão e
    // afins + o dinheiro que vou precisar guardar"): compras já feitas + já guardado + falta guardar
    custoTotal: viagem && total != null ? (() => {
      const comprasBRL = viagem.aPagar.totalBRL;
      const guardadoBRL = r2(Math.min(ja, total));
      const faltaBRL = r2(Math.max(0, total - ja));
      return { totalBRL: r2(comprasBRL + guardadoBRL + faltaBRL), comprasBRL, comprasConfirmadoBRL: viagem.aPagar.confirmadoBRL, comprasPendenteBRL: viagem.aPagar.pendenteBRL, guardadoBRL, faltaBRL, aJuntarBRL: r2(total) };
    })() : null,
    decomposicao: falta != null ? { falta, entradas: entradasValidas, totalEntradas: entradasTotal, restante: r2(Math.max(0, falta - entradasTotal)), meses: mesesRestantes, aporte: necessario } : null,
  };
  // 05/10/2026: 1º marco (milhão) no ritmo - 1 linha curta no card da lista
  const proximoMarco = !ehReserva && !recorrente && alvoBRL >= 1.5e6 ? marcosProjecao(calcPronto, { hoje }).find((m) => !m.ja && m.rotulo !== 'Alvo') : null;
  calcPronto.marcoProximo = proximoMarco && proximoMarco.mes ? { rotulo: proximoMarco.rotulo, mes: proximoMarco.mes, ano: proximoMarco.ano } : null;
  // 05/10/2026: reserva com títulos de renda fixa que vencem
  calcPronto.vencimentos = ehReserva ? eventosVencimento(calcPronto, { hoje }) : null;
  calcPronto.excedente = ehReserva ? excedenteReserva(calcPronto) : null; // 06/10/2026
  return calcPronto;
}

/**
 * Pontos mês a mês (de hoje até a data alvo, ou até o prazo estimado) das 2
 * curvas do gráfico: "no seu ritmo" (aporte atual) e "necessária" (aporte que
 * fecha na data). [{ mes, ritmo, necessaria }]
 */
export function serieProjecao(calc, { maxMeses = 360, hoje, meses = null } = {}) {
  if (!calc || calc.alvoBRL == null) return [];
  const inicio = mesDe(hoje || new Date());
  let n = calc.mesesRestantes != null && calc.mesesRestantes > 0 ? calc.mesesRestantes : (Number.isFinite(calc.mesesEstimados) && calc.mesesEstimados > 0 ? Math.ceil(calc.mesesEstimados) : 12);
  // 05/10/2026: reserva com título vencendo - o horizonte padrão chega até o último vencimento
  if (meses == null && calc.vencimentos && calc.vencimentos.eventos.length) n = Math.max(n, ...calc.vencimentos.eventos.map((e) => e.em + 3));
  if (meses != null) n = meses; // 03/10/2026: o gráfico escolhe o horizonte (filtro de período)
  n = Math.min(maxMeses, Math.max(1, n));
  const necessario = calc.aporteNecessario != null ? calc.aporteNecessario : null;
  const base = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL; // reserva: o líquido
  // 04/10/2026: entradas programadas (13º, FGTS...) entram como degraus
  const ent = calc.entradasFluxo || [];
  const ritmo = trajetoriaMensal({ atual: base, aporte: calc.aporteAtual, taxa: calc.taxa, entradas: ent, meses: n });
  const nec = necessario == null ? null : trajetoriaMensal({ atual: base, aporte: necessario, taxa: calc.taxa, entradas: ent, meses: n });
  const pontos = [];
  for (let i = 0; i <= n; i++) {
    const e = ent.filter((x) => x.k === i);
    pontos.push({
      mes: somarMeses(inicio, i),
      ritmo: r2(ritmo[i]),
      necessaria: nec == null ? null : r2(nec[i]),
      entrada: e.length ? r2(e.reduce((t, x) => t + x.valor, 0)) : 0,
    });
  }
  return pontos;
}

/** Totais do topo da lista (só metas ativas, alvo conhecido). */
export function resumoMetas(calculos, { patrimonioVinculavel = null } = {}) {
  const ativos = calculos.filter((c) => c && c.alvoBRL != null);
  // 05/10/2026 (A-11): "já guardado" = patrimônio ALOCADO nas metas. Com a alocação exclusiva a soma dos
  // vínculos nunca passa do patrimônio; o teto abaixo é só a trava final (o que não vem de ativo - valor
  // inicial, saldo em conta, sub-itens pagos, parcelas - fica de fora do teto).
  let atual = r2(ativos.reduce((s, c) => s + Math.min(c.atualBRL, c.alvoBRL), 0));
  if (patrimonioVinculavel != null) {
    const foraDeAtivos = ativos.reduce((s, c) => s + Math.max(0, c.atualBRL - (c.valorAtivosVinculados || 0)), 0);
    atual = r2(Math.min(atual, patrimonioVinculavel + foraDeAtivos));
  }
  return {
    quantidade: calculos.length,
    alvo: r2(ativos.reduce((s, c) => s + c.alvoBRL, 0)),
    atual,
    patrimonioVinculavel,
    aporteNecessario: r2(calculos.reduce((s, c) => s + (c && c.aporteNecessarioTotal ? c.aporteNecessarioTotal : 0), 0)),
    aporteAtual: r2(calculos.reduce((s, c) => s + (c ? c.aporteAtual : 0), 0)),
    noRitmo: calculos.filter((c) => c && ['no-ritmo', 'concluida', 'saldo-ideal'].includes(c.status)).length,
    atrasadas: calculos.filter((c) => c && ['atrasada', 'vencida', 'abaixo', 'ideal-bruto'].includes(c.status)).length,
  };
}

/** Meta nova com os padrões do tipo (o fluxo de criação parte daqui). */
export function metaPadrao(tipo, { referencias = {}, hoje, categoria } = {}) {
  const mes = mesDe(hoje || new Date());
  const base = {
    tipo, categoria: tipo === 'acumulo' ? (categoria || 'outros') : null, nome: '', moeda: 'BRL', valorAlvo: null,
    dataAlvo: somarMeses(mes, 12), valorInicial: null, aporteMensal: null, rendimentoAnual: 0.1,
    contribuicao: 'acumulo', recorrente: null, contaMensal: null, especificos: {}, itens: [], vinculos: [], status: 'ativa',
  };
  if (tipo === 'acumulo') base.nome = (CATEGORIAS_ACUMULO[base.categoria] || CATEGORIAS_ACUMULO.outros).nome;
  else base.nome = TIPOS_META[tipo] ? TIPOS_META[tipo].nome : '';
  if (tipo === 'rendaPassiva') {
    const rp = referencias.rendaPassiva || {};
    const pat = referencias.patrimonio || {};
    base.especificos = { rendaMensal: num(rp.metaPlanilha) || null, dyAnual: num(pat.rendimento) || 0.08 };
    base.vinculos = [{ tipo: 'classe', classe: 'fiis', modo: 'total' }, { tipo: 'classe', classe: 'acoes', modo: 'total' }, { tipo: 'classe', classe: 'usa', modo: 'total' }];
    base.dataAlvo = somarMeses(mes, 120);
    base.exibirNaCarteira = true;
  }
  if (tipo === 'distribuicaoCarteira') { // 06/10/2026: pesos por grupo (o assistente parte da planilha, se ela já veio em referencias)
    base.dataAlvo = null; base.rendimentoAnual = null;
    base.especificos = { pesos: referencias.distribuicaoPesos || pesosPadraoDistribuicao() };
  }
  if (tipo === 'reservaEmergencia') {
    const rs = referencias.reserva || {};
    base.dataAlvo = null;
    base.rendimentoAnual = 0.1;
    // 05/10/2026 (A-12): meses e sobra NÃO são mais copiados da planilha (ficavam congelados e mudanças depois não chegavam
    // à meta): null = "seguir a planilha", resolvido na leitura (calcularMeta). Digitar um valor congela de propósito.
    base.especificos = { meses: null, margem: null, usarDespesasPlanilha: true, despesaMensal: null };
    base.vinculos = [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }];
  }
  if (tipo === 'viagemInternacional' || tipo === 'viagemNacional') {
    // 03/10/2026: por destinos + itens fixos (substitui a "conta mensal" única)
    // 04/10/2026: roteiro (Wanderlog), pessoas da taxa turística e as entradas
    // programadas já ligadas (Tiago: "meu 13º (90%) e meu FGTS Aniversário (90%)")
    base.moeda = tipo === 'viagemNacional' ? 'BRL' : 'EUR'; base.rendimentoAnual = 0.1;
    base.especificos = { destino: '', dataViagem: null, margem: 0.1, destinos: [], fixos: [], roteiroUrl: '', pessoas: 1 };
    base.entradas = [entradaPadrao('decimo13'), entradaPadrao('fgts')];
  }
  if (tipo === 'casa') { base.especificos = { valorImovel: null, entradaPct: 0.2, custosPct: 0.05 }; base.dataAlvo = somarMeses(mes, 60); base.rendimentoAnual = 0.1; }
  if (tipo === 'carro') { base.especificos = { valorCarro: null, entradaPct: 1 }; base.dataAlvo = somarMeses(mes, 24); }
  if (tipo === 'aposentadoria') {
    // 03/10/2026: a conta da planilha (Distribuição e Metas K17:N19), editável
    const pat = referencias.patrimonio || {};
    base.especificos = {
      modoAlvo: 'calculado', usarDespesasPlanilha: true, despesaMensal: null,
      // 05/10/2026 (A-12): extra, % de reinvestimento e taxa de retirada = referência da planilha (null), não cópia congelada
      extra: null, reinvestimento: null,
      rendaDesejada: null, taxaRetirada: null, anoNascimento: null,
    };
    base.dataAlvo = somarMeses(mes, 300); base.rendimentoAnual = 0.06;
  }
  return base;
}

/**
 * 03/10/2026 (Tiago: "'Metas da Carteira' [...] precisa estar linkada às
 * metas presentes em 'Metas e Objetivos'"): meta nova de renda passiva,
 * reserva de emergência ou aposentadoria já com os números da planilha (aba
 * Distribuição e Metas / Despesas essenciais). É o que as sugestões de 1
 * clique criam e o que o link "Criar em Metas e Objetivos" (metas.html#nova=)
 * abre no assistente. Outro tipo = metaPadrao puro.
 */
export function metaDaPlanilha(tipo, { referencias = {}, hoje } = {}) {
  const m = metaPadrao(tipo, { referencias, hoje });
  if (tipo === 'reservaEmergencia') m.nome = 'Reserva de emergência';
  if (tipo === 'rendaPassiva') {
    m.nome = 'Renda passiva';
    if (!m.especificos.rendaMensal) m.especificos.rendaMensal = 1000;
  }
  if (tipo === 'aposentadoria') {
    m.nome = 'Aposentadoria';
    // 03/10/2026: em vez de copiar o resultado (N18), copia a CONTA - o
    // montante sai igual ao da planilha e cada peça fica editável
    const temConta = num(referencias.reserva && referencias.reserva.custoDeVida) > 0;
    if (!temConta) { m.especificos.modoAlvo = 'renda'; m.especificos.rendaDesejada = 10000; }
    m.vinculos = [{ tipo: 'marca', marca: 'longo-prazo', modo: 'total' }, { tipo: 'classe', classe: 'fiis', modo: 'total' }, { tipo: 'classe', classe: 'acoes', modo: 'total' }, { tipo: 'classe', classe: 'usa', modo: 'total' }];
  }
  return m;
}

/**
 * Sugestões pro estado vazio (1 clique cria). Usa o que a planilha já sabe:
 * custo de vida e meses da reserva, meta de renda passiva da Distribuição e Metas.
 */
export function sugestoesMetas({ referencias = {}, hoje, existentes = [] } = {}) {
  const tem = (tipo) => existentes.some((m) => m.tipo === tipo && m.status !== 'arquivada');
  const out = [];
  if (!tem('reservaEmergencia')) {
    const m = metaDaPlanilha('reservaEmergencia', { referencias, hoje });
    out.push({ meta: m, porque: referencias.reserva && referencias.reserva.custoDeVida ? `${num(referencias.reserva.meses) || 6} meses do seu custo de vida, com os títulos marcados Renda Emergencial` : 'Meses x custo de vida, com os títulos marcados Renda Emergencial' });
  }
  if (!tem('rendaPassiva')) {
    out.push({ meta: metaDaPlanilha('rendaPassiva', { referencias, hoje }), porque: 'A meta mensal da planilha (aba Distribuição e Metas), medida pelos proventos de FIIs e ações' });
  }
  const viagem = metaPadrao('viagemInternacional', { referencias, hoje });
  viagem.nome = 'Viagem pra Europa';
  viagem.valorAlvo = 5000;
  viagem.contaMensal = null;
  out.push({ meta: viagem, porque: '€ 5.000 em 12 meses - edite destino, data e sub-itens depois' });
  if (!tem('aposentadoria')) {
    out.push({ meta: metaDaPlanilha('aposentadoria', { referencias, hoje }), porque: 'O patrimônio desejado da planilha (aba Distribuição e Metas), com a carteira de longo prazo' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 03/10/2026 (Metas v2): velocidade, dicas, marcos, sensibilidade
// ---------------------------------------------------------------------------

export const arred = (v, passo) => Math.max(passo, Math.round(v / passo) * passo);

/**
 * Marcos da projeção (Tiago: "mostre em destaque na projeção quando chegarei
 * ao primeiro milhão, segundo milhão, terceiro, etc., até o valor da meta"):
 * cada milhão (alvo >= R$ 1,5 mi) ou cada quarto do alvo, mais o próprio
 * alvo. [{ valor, rotulo, meses, mes, ano, idade, ja }] (meses null = não chega em maxMeses).
 */
export function marcosProjecao(calc, { hoje, aporte = null, maxMeses = 720, anoNascimento = null, atual: atualOv = null, taxa: taxaOv = null, alvo: alvoOv = null, entradas: entradasOv } = {}) {
  // 05/10/2026: atual/taxa/alvo/entradas opcionais - as simulações (75%/50% do tempo, renda -10%, simulador...) reaproveitam o mesmo cálculo
  if (!calc || !((alvoOv != null ? alvoOv : calc.alvoBRL) > 0)) return [];
  const alvo = alvoOv != null ? alvoOv : calc.alvoBRL;
  const atual = atualOv != null ? atualOv : (calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL);
  const taxaUsada = taxaOv != null ? taxaOv : (calc.taxa || 0);
  const entradasUsadas = entradasOv !== undefined ? entradasOv : calc.entradasFluxo;
  const ap = aporte != null ? aporte : (calc.aporteAtual || 0);
  const mes = mesDe(hoje || new Date());
  const passo = alvo >= 1.5e6 ? 1e6 : alvo / 4;
  const valores = [];
  for (let v = passo; v < alvo - passo * 0.05; v += passo) valores.push(r2(v));
  valores.push(r2(alvo));
  return valores.map((v, i) => {
    const ehAlvo = i === valores.length - 1;
    const rotulo = ehAlvo ? 'Alvo' : (passo === 1e6 ? `${Math.round(v / 1e6)}º milhão` : `${Math.round(((i + 1) * 100) / 4)}% do alvo`);
    if (atual >= v) return { valor: v, rotulo, meses: 0, mes, ano: Number(mes.slice(0, 4)), idade: anoNascimento ? Number(mes.slice(0, 4)) - anoNascimento : null, ja: true };
    const n = prazoParaAlvo({ alvo: v, atual, aporte: ap, taxa: taxaUsada, entradas: entradasUsadas });
    if (!Number.isFinite(n) || n > maxMeses) return { valor: v, rotulo, meses: null, mes: null, ano: null, idade: null, ja: false };
    const m = somarMeses(mes, Math.ceil(n));
    const ano = Number(m.slice(0, 4));
    return { valor: v, rotulo, meses: Math.ceil(n), mes: m, ano, idade: anoNascimento ? ano - anoNascimento : null, ja: false };
  });
}

// ---------------------------------------------------------------------------
// 03/10/2026: análises dos gráficos (mesmo formato de analise-grafico.js:
// { tom, resumo, pontos: [{ tipo, tom, texto, resumo, peso }] } - desenhado
// por renderAnalise)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 03/10/2026: sugestões de investimento por tipo de meta + avaliação dos vinculados
// (Tiago: "inclua nas metas sugestões de investimentos segundo fontes
// confiáveis para aquela meta, e diga se já tenho boas opções escolhidas").
// Resumo com as nossas palavras do que essas fontes explicam - não é
// recomendação individual.
// ---------------------------------------------------------------------------

const FONTES = {
  tesouro: { nome: 'Tesouro Direto - tipos de título', url: 'https://www.tesourodireto.com.br/titulos/tipos-de-tesouro.htm' },
  b3Prazo: { nome: 'B3 Bora Investir - Tesouro para curto, médio e longo prazo', url: 'https://borainvestir.b3.com.br/tipos-de-investimentos/renda-fixa/tesouro-direto/quais-investimentos-do-tesouro-direto-encaixam-em-objetivos-de-curto-medio-e-longo-prazo/' },
  b3Reserva: { nome: 'B3 Bora Investir - onde investir a reserva de emergência', url: 'https://borainvestir.b3.com.br/tipos-de-investimentos/renda-variavel/etfs/onde-investir-a-reserva-de-emergencia-tesouro-cdb-fundo-lcis-conta-remunerada-ou-etf/' },
  sunoReserva: { nome: 'Suno - Reserva de emergência: quanto guardar e onde investir', url: 'https://www.suno.com.br/artigos/reserva-de-emergencia/' },
  fgc: { nome: 'FGC - sobre a garantia (R$ 250 mil por CPF e instituição)', url: 'https://www.fgc.org.br/garantia-fgc/sobre-a-garantia-fgc' },
  bcb: { nome: 'Banco Central - Cidadania Financeira (caderno de educação financeira)', url: 'https://www.bcb.gov.br/cidadaniafinanceira' },
  b3Viagem: { nome: 'B3 Bora Investir - preparar a viagem ao exterior', url: 'https://borainvestir.b3.com.br/objetivos-financeiros/organizar-as-contas/quer-fazer-a-primeira-viagem-para-o-exterior-em-2027-saiba-como-se-preparar-financeiramente/' },
  b3Moeda: { nome: 'B3 Bora Investir - espécie ou cartão no exterior', url: 'https://borainvestir.b3.com.br/objetivos-financeiros/especie-ou-cartao-a-melhor-forma-de-levar-moeda-estrangeira-nas-ferias/' },
  b3Fii: { nome: 'B3 Bora Investir - quanto investir para R$ 1 mil/mês em FIIs', url: 'https://borainvestir.b3.com.br/tipos-de-investimentos/renda-variavel/fundos-investimento/quanto-investir-para-garantir-rendimentos-de-r-1-mil-em-fiis-por-mes/' },
  sunoDividendos: { nome: 'Suno - viver de dividendos: como estruturar a renda', url: 'https://www.suno.com.br/noticias/viver-de-dividendos-veja-como-estruturar-sua-renda/' },
  sunoAposentadoria: { nome: 'Suno - FIIs para aposentadoria', url: 'https://www.suno.com.br/noticias/fundos-imobiliarios-previdencia-aposentadoria/' },
  b3Isentos: { nome: 'B3 Bora Investir - tabela de tributação dos investimentos', url: 'https://borainvestir.b3.com.br/noticias/imposto-de-renda/quais-investimentos-sao-isentos-de-ir-confira-a-tabela-atualizada-de-tributacao/' },
};

export const SUGESTOES_INVESTIMENTO = {
  reserva: {
    titulo: 'Reserva de emergência: liquidez diária e quase sem oscilação',
    itens: [
      { nome: 'Tesouro Selic (ou Tesouro Reserva)', porque: 'Pós-fixado na Selic, resgate em D+0/D+1 e oscilação mínima - o título que o próprio Tesouro e a B3 apontam para reserva.' },
      { nome: 'CDB de liquidez diária pagando ≥ 100% do CDI', porque: 'Rende parecido com a Selic e tem garantia do FGC até R$ 250 mil por CPF por instituição. Confira se o resgate é diário.' },
      { nome: 'Conta remunerada / fundo DI de taxa baixa (só a parte de uso imediato)', porque: 'Dinheiro na mão no mesmo dia; vale para o primeiro mês de despesas.' },
    ],
    evitar: 'Evite na reserva: Tesouro IPCA+ e Prefixado (marcação a mercado - resgatar antes do vencimento pode render menos), LCI/LCA com carência, ações e FIIs (podem estar em queda justo quando você precisar).',
    fontes: [FONTES.b3Reserva, FONTES.sunoReserva, FONTES.tesouro, FONTES.fgc],
  },
  curto: {
    titulo: 'Objetivo curto (até ~2 anos): pós-fixado e liquidez',
    itens: [
      { nome: 'Tesouro Selic / CDB pós-fixado ≥ 100% do CDI', porque: 'Acompanha os juros, não oscila e dá para usar na data sem surpresa.' },
      { nome: 'CDB/LCI/LCA com vencimento antes da data', porque: 'Se a data é certa, um título que vence até lá trava a rentabilidade (LCI/LCA: isentas de IR).' },
    ],
    evitar: 'Evite renda variável: em menos de 2 anos não dá tempo de esperar uma queda passar.',
    fontes: [FONTES.b3Prazo, FONTES.tesouro, FONTES.fgc],
  },
  viagemExterior: {
    titulo: 'Viagem ao exterior: parte já na moeda, parte rendendo em reais',
    itens: [
      { nome: 'Conta em moeda estrangeira (ex. Wise, conta global) comprando aos poucos', porque: 'Trava o câmbio em várias datas (preço médio) e é o que você usa lá. Algumas contas remuneram o saldo.' },
      { nome: 'Tesouro Selic / CDB de liquidez diária para a parte em reais', porque: 'O que ainda não foi trocado rende até a hora da compra da moeda.' },
      { nome: 'Passagens e hospedagem parceladas', porque: 'Entram como itens fixos - a parcela mensal já é "aporte" garantido da viagem.' },
    ],
    evitar: 'Evite deixar tudo para trocar na véspera (risco de câmbio concentrado) e cartão de crédito em moeda estrangeira sem conferir IOF e spread.',
    fontes: [FONTES.b3Viagem, FONTES.b3Moeda, FONTES.bcb],
  },
  medio: {
    titulo: 'Casa, carro e objetivos de 2 a 5 anos: vencimento casado com a data',
    itens: [
      { nome: 'Tesouro IPCA+ ou Prefixado com vencimento perto da data', porque: 'Levado até o vencimento, entrega a taxa contratada (IPCA+ protege da inflação do preço do imóvel/carro).' },
      { nome: 'CDB/LCI/LCA com vencimento até a data', porque: 'Rentabilidade travada e garantia do FGC.' },
      { nome: 'Tesouro Selic para o último ano', porque: 'Perto da data, migre para liquidez diária para não depender do preço de mercado.' },
    ],
    evitar: 'Evite títulos que vencem DEPOIS da data (terá que vender a preço de mercado) e muita renda variável.',
    fontes: [FONTES.b3Prazo, FONTES.tesouro, FONTES.fgc],
  },
  longo: {
    titulo: 'Aposentadoria (longo prazo): inflação + crescimento',
    itens: [
      { nome: 'Tesouro IPCA+ / Tesouro RendA+ de vencimento longo', porque: 'Garantem ganho acima da inflação por décadas; o RendA+ já paga renda mensal por 20 anos a partir da data escolhida.' },
      { nome: 'Ações de boas pagadoras de dividendos e ETFs', porque: 'No longo prazo, renda variável tende a render mais - e a oscilação tem tempo de passar.' },
      { nome: 'FIIs', porque: 'Rendimento mensal isento de IR para pessoa física - vira a renda da aposentadoria.' },
    ],
    evitar: 'Evite concentrar num ativo só e manter muito tempo em pós-fixado (só acompanha os juros, sem crescimento real garantido).',
    fontes: [FONTES.b3Prazo, FONTES.tesouro, FONTES.sunoAposentadoria],
  },
  renda: {
    titulo: 'Renda passiva: quem paga todo mês ou com regularidade',
    itens: [
      { nome: 'FIIs (tijolo e papel) diversificados', porque: 'Rendimentos mensais isentos de IR para pessoa física; cerca de 0,7%-1% ao mês sobre o valor investido é o patamar comum.' },
      { nome: 'Ações boas pagadoras de dividendos', porque: 'Dividendos (isentos hoje) e JCP; pagam concentrado em alguns meses do ano.' },
      { nome: 'Tesouro IPCA+ com Juros Semestrais / RendA+', porque: 'Renda previsível e protegida da inflação (com IR).' },
    ],
    evitar: 'Evite escolher só pelo maior DY do momento - rendimento alto demais costuma não se sustentar.',
    fontes: [FONTES.b3Fii, FONTES.sunoDividendos, FONTES.b3Isentos],
  },
};

/**
 * 05/10/2026 (Tiago: "ex. Tesouro Selic 2027 vence em janeiro do ano que vem e
 * o IR é pago obrigatoriamente; a renda emergencial tem que continuar com o
 * mínimo da meta quando vencer"): projeta, mês a mês, os títulos de renda fixa
 * vinculados que vencem. No vencimento o IR é cobrado de qualquer jeito
 * (tabela regressiva pelo tempo total aplicado) e o dinheiro cai na conta - deixa
 * de ser o título (e de contar na meta, se não reaplicar).
 *
 * `calc` precisa de vinculos, atualLiquidoBRL, alvoBRL (o mínimo, líquido) e taxa
 * (mensal; o título cresce nela até vencer). O IR vem de `ativo.irResgate.vencimento`
 * ({ aliquota, principal } - Metas.gs); sem isso estima com 15% sobre o rendimento
 * que ainda vai render (`estimado: true`).
 * Devolve { eventos: [{ mes, em, titulos: [{ nome, valorHoje, bruto, ir, liquido, estimado }],
 * bruto, ir, liquido, reservaSemReaplicar, reservaReaplicando, acimaMinimo, acimaReaplicando,
 * falta, perdeMes, tom, sugestao, texto }], minimo, proximo } ou null.
 */
export const LIMITE_ALERTA_VENCIMENTO_MESES = 12;

export function eventosVencimento(calc, { hoje } = {}) {
  if (!calc || !Array.isArray(calc.vinculos)) return null;
  const mesHoje = mesDe(hoje || new Date());
  const taxa = calc.taxa || 0;
  const porMes = new Map();
  calc.vinculos.forEach((v) => {
    const parte = v.base > 0 ? v.valorBRL / v.base : 0;
    (v.ativos || []).forEach((a) => {
      if (a.classe !== 'rf' || !(parte > 0)) return;
      const mes = mesVenc(a.vencimento);
      const n = mes ? mesesEntre(mesHoje, mes) : null;
      if (n == null || n < 0) return;
      const valorHoje = (Number(a.valorBRL) || 0) * parte;
      if (!(valorHoje > 0)) return;
      const ir0 = a.irResgate || {};
      const irHoje = ((Number(ir0.ir) || 0) + (Number(ir0.iof) || 0)) * parte;
      const bruto = valorHoje * Math.pow(1 + taxa, n);
      const iv = ir0.vencimento;
      let ir;
      let estimado = false;
      if (ir0.isento) ir = 0; // LCI/LCA: isentas
      else if (iv && Number.isFinite(iv.aliquota) && Number.isFinite(iv.principal)) ir = Math.max(0, bruto - iv.principal * parte) * iv.aliquota;
      else { ir = irHoje + Math.max(0, bruto - valorHoje) * (iv && Number.isFinite(iv.aliquota) ? iv.aliquota : 0.15); estimado = true; }
      const item = { nome: String(a.nome || '').split(' · ')[0], valorHoje: r2(valorHoje), liquidoHoje: r2(valorHoje - irHoje), bruto: r2(bruto), ir: r2(ir), liquido: r2(bruto - ir), estimado, indexador: a.indexador || null, descricao: a.descricao || null };
      if (!porMes.has(mes)) porMes.set(mes, []);
      porMes.get(mes).push(item);
    });
  });
  if (!porMes.size) return null;
  const minimo = calc.alvoBRL != null ? calc.alvoBRL : null;
  let reaplicando = calc.atualLiquidoBRL || 0;
  let semReaplicar = calc.atualLiquidoBRL || 0;
  const jaAbaixo = (calc.alvoBRL != null) && (calc.atualLiquidoBRL || 0) < calc.alvoBRL - 0.5;
  const eventos = [...porMes.keys()].sort().map((mes, idx) => {
    const titulos = porMes.get(mes);
    const soma = (k) => r2(titulos.reduce((t, x) => t + x[k], 0));
    const liquido = soma('liquido'); const ir = soma('ir'); const bruto = soma('bruto'); const liquidoHoje = soma('liquidoHoje');
    semReaplicar = Math.max(0, semReaplicar - liquidoHoje); // o título sai da meta; o dinheiro vai pra conta
    reaplicando += liquido - liquidoHoje; // reaplicado, volta a contar (já sem o IR cobrado)
    const acimaMinimo = minimo == null ? null : semReaplicar >= minimo - 0.5;
    const acimaReaplicando = minimo == null ? null : reaplicando >= minimo - 0.5;
    const falta = minimo == null || acimaMinimo ? 0 : r2(minimo - semReaplicar);
    const faltaReaplicando = minimo == null || acimaReaplicando ? 0 : r2(minimo - reaplicando);
    const todos = titulos.map((t) => t.nome).join(' e ');
    const indexSelic = titulos.some((t) => /SELIC/i.test(`${t.nome} ${t.indexador || ''}`));
    const sugestao = indexSelic || titulos.some((t) => /CDI|CDB/i.test(`${t.nome} ${t.indexador || ''}`))
      ? 'um Tesouro Selic com o vencimento mais longo disponível (liquidez diária; resgate em D+1)'
      : 'um Tesouro Selic com o vencimento mais longo disponível (liquidez diária) ou um CDB com liquidez diária a 100% do CDI';
    const perdeMes = taxa > 0 ? r2(liquido * taxa) : null;
    // 06/10/2026 (Tiago: "considere sempre o alerta só se algum título vencer em menos de um ano. Mais do que isso não
    // preciso me preocupar tanto"): 'atencao' só pra vencimento em menos de 12 meses E reserva abaixo do mínimo; o resto é informação
    const emMeses = mesesEntre(mesHoje, mes);
    const tom = minimo != null && !acimaMinimo && emMeses < LIMITE_ALERTA_VENCIMENTO_MESES ? 'atencao' : 'neutro';
    const partes = [
      `Em ${rotuloMes(mes)} ${titulos.length > 1 ? 'vencem' : 'vence'} ${todos}: entram ${formatBRL0(liquido)} líquidos (IR ${formatBRL0(ir)}${titulos.some((t) => t.estimado) ? ', estimado' : ''}).`,
    ];
    if (minimo != null) partes.push(acimaMinimo ? `Sua reserva continua acima do mínimo? Sim (${formatBRL0(semReaplicar)} contra ${formatBRL0(minimo)}).` : `Sua reserva continua acima do mínimo? Não${jaAbaixo ? ' (já está abaixo hoje)' : ''}: sem ${idx > 0 ? 'esse título e os que vencem antes' : 'esse título'} ela fica em ${formatBRL0(semReaplicar)} e faltam ${formatBRL0(falta)} pro mínimo de ${formatBRL0(minimo)}${acimaReaplicando ? ' - reaplicando o dinheiro, volta a ficar acima.' : ` - mesmo reaplicando faltam ${formatBRL0(faltaReaplicando)}.`}`);
    partes.push(`Reaplique em ${sugestao}. Sem reaplicar, o dinheiro fica na conta e para de render${perdeMes ? ` (cerca de ${formatBRL0(perdeMes)}/mês a menos)` : ''}.`);
    return { mes, em: mesesEntre(mesHoje, mes), titulos, bruto, ir, liquido, reservaSemReaplicar: r2(semReaplicar), reservaReaplicando: r2(reaplicando), acimaMinimo, acimaReaplicando, falta, faltaReaplicando, perdeMes, tom, sugestao, texto: partes.join(' ') };
  });
  return { eventos, minimo, proximo: eventos[0], temAtencao: eventos.some((e) => e.tom === 'atencao') };
}

/**
 * 06/10/2026 (Tiago: "se já passei da meta, quanto eu poderia resgatar (considerando IR) e destinar a outro objetivo (ações,
 * FIIs) sem diminuir a meta da renda emergencial - pra não ficar dinheiro parado sem necessidade"): o EXCEDENTE da reserva =
 * líquido de hoje - saldo ideal. Sugere de quais títulos de renda fixa vinculados tirar: primeiro os de MENOR imposto
 * (IR+IOF sobre o valor: os mais antigos e os isentos), empate pelo vencimento mais próximo; resgate parcial com o imposto
 * proporcional (aproximação - a corretora/o Tesouro confirma no resgate). O líquido liberado nunca passa do excedente, então a
 * reserva (líquida) fica no saldo ideal ou acima. O IR/IOF de cada título vem de `ativo.irResgate` (Metas.gs!irResgateDoAtivo_,
 * o mesmo módulo de RendaFixaIR.gs / assets/js/ir-renda-fixa.js).
 * `calc` = calcularMeta de uma reserva. Devolve null se não há excedente. { excedenteLiquido, brutoResgatar, ir, iof, imposto,
 * liquidoLiberado, reservaDepois, titulos: [{ id, nome, vencimento, bruto, imposto, liquido, taxa, total }], semTitulos,
 * faltaTitulos, estimado }.
 */
export function excedenteReserva(calc) {
  if (!calc || calc.alvoBRL == null || !Array.isArray(calc.vinculos)) return null;
  const excedenteLiquido = r2((calc.atualLiquidoBRL || 0) - calc.alvoBRL);
  if (!(excedenteLiquido >= 1)) return null;
  const vistos = new Set();
  const candidatos = [];
  calc.vinculos.forEach((v) => {
    (v.ativos || []).forEach((a) => {
      if (a.classe !== 'rf' || vistos.has(a.id)) return;
      const fr = fracaoDoItem(v, a);
      const valor = (Number(a.valorBRL) || 0) * fr;
      if (!(valor > 0.5)) return;
      vistos.add(a.id);
      const ir0 = a.irResgate || null;
      const ir = ir0 ? (Number(ir0.ir) || 0) * fr : 0;
      const iof = ir0 ? (Number(ir0.iof) || 0) * fr : 0;
      candidatos.push({
        id: a.id, nome: String(a.nome || '').split(' · ')[0], vencimento: mesVenc(a.vencimento), valor, ir, iof, imposto: ir + iof,
        taxa: valor > 0 ? (ir + iof) / valor : 0, semEstimativa: !ir0 || ir0.precisao === 'sem-dados',
      });
    });
  });
  candidatos.sort((x, y) => (x.taxa - y.taxa) || String(x.vencimento || '9999-99').localeCompare(String(y.vencimento || '9999-99')) || (y.valor - x.valor));
  let restante = excedenteLiquido;
  const titulos = [];
  candidatos.forEach((c) => {
    if (restante < 0.5) return;
    const liqTotal = c.valor - c.imposto;
    if (!(liqTotal > 0)) return;
    const tira = Math.min(liqTotal, restante);
    const f = tira / liqTotal;
    titulos.push({ id: c.id, nome: c.nome, vencimento: c.vencimento, bruto: r2(c.valor * f), ir: r2(c.ir * f), iof: r2(c.iof * f), imposto: r2(c.imposto * f), liquido: r2(tira), taxa: c.taxa, total: f >= 0.999, semEstimativa: c.semEstimativa });
    restante -= tira;
  });
  const soma = (k) => r2(titulos.reduce((t, x) => t + x[k], 0));
  const liquidoLiberado = soma('liquido');
  return {
    excedenteLiquido, brutoResgatar: soma('bruto'), ir: soma('ir'), iof: soma('iof'), imposto: soma('imposto'), liquidoLiberado,
    reservaDepois: r2((calc.atualLiquidoBRL || 0) - liquidoLiberado), titulos, semTitulos: !titulos.length,
    faltaTitulos: r2(Math.max(0, excedenteLiquido - liquidoLiberado)), estimado: titulos.some((x) => x.semEstimativa),
  };
}

/** Destino novo pro assistente de viagem (gasto diário em branco). */
export function destinoPadrao({ pais = '', paisCodigo = null, cidade = '', moeda = 'EUR', dias = 3 } = {}) {
  return { id: Math.random().toString(36).slice(2, 10), pais, paisCodigo, cidade, moeda, dias, gastos: { alimentacao: null, transporte: null, passeios: null, compras: null, outros: null }, extras: null, taxaTuristica: null, taxaNoites: null, taxaPessoas: null, taxaMaxNoites: null };
}

// ---------------------------------------------------------------------------
// 04/10/2026: Metas › Viagem v3 - países/cidades, migração, taxa turística,
// links (Wanderlog) e entradas programadas (13º, FGTS, PLR...)
// ---------------------------------------------------------------------------

// --- entradas programadas ---------------------------------------------------


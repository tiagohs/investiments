/**
 * metas-calc.js - 02/10/2026: contas da tela Metas e Objetivos (metas.html).
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

import { resumoFgts, salarioEm } from './patrimonio-calc.js';
import { formatNumeroPt, MESES_CURTOS, formatMesAno, formatBRL0 } from '../format.js'; // 05/10/2026 (A-68)

/** Tipos de meta. `grupo` organiza a escolha no 1º passo da criação. */
export const TIPOS_META = {
  rendaPassiva: { nome: 'Renda passiva', icone: 'renda', cor: 'fiis', grupo: 'patrimonio', resumo: 'Proventos por mês e o patrimônio que gera essa renda', dicas: ['Vincule as classes que pagam proventos (FIIs, ações) - a renda atual é a média dos últimos 12 meses fechados delas.', 'O patrimônio necessário é a renda anual dividida pelo rendimento (dividend yield) esperado.'] },
  reservaEmergencia: { nome: 'Reserva de emergência', icone: 'escudo', cor: 'rf', grupo: 'patrimonio', resumo: 'Manter o saldo ideal: meses x custo de vida', dicas: ['O custo de vida vem das suas Despesas essenciais (Organização Financeira) - mudou lá, muda aqui.', 'Os títulos marcados "Renda Emergencial" na Carteira Renda Fixa já entram sozinhos.'] },
  aposentadoria: { nome: 'Aposentadoria', icone: 'ampulheta', cor: 'usa', grupo: 'patrimonio', resumo: 'Montante final pra viver de renda', dicas: ['A conta é a da sua planilha: (despesas essenciais + extra) + % de reinvestimento = renda ideal; montante = renda x 12 / rendimento médio.', 'Use rendimento real (acima da inflação) pra ver o valor em dinheiro de hoje.'] },
  viagemInternacional: { nome: 'Viagem internacional', icone: 'aviao', cor: 'acoes', grupo: 'objetivo', resumo: 'Destinos (dias x gasto diário) em cada moeda + passagens/hospedagem parceladas', dicas: ['Cada destino tem a sua moeda e o seu gasto diário (alimentação, transporte, passeios, compras) - o alvo em moeda estrangeira sai sozinho.', 'Dinheiro já trocado (ex. Wise em euro) entra como "Saldo em conta"; o que falta é convertido pelo câmbio do dia.'] },
  viagemNacional: { nome: 'Viagem nacional', icone: 'mala', cor: 'acoes', grupo: 'objetivo', resumo: 'Conta mensal + dinheiro pra gastar', dicas: ['A conta mensal é o que você já parcelou (passagem, hotel); o alvo é o dinheiro pra gastar lá.'] },
  casa: { nome: 'Comprar casa', icone: 'casa', cor: 'fiis', grupo: 'objetivo', resumo: 'Entrada + custos (ITBI, escritura, registro)', dicas: ['Os custos de cartório e ITBI costumam ficar entre 4% e 6% do valor do imóvel.', 'Títulos atrelados à inflação (Tesouro IPCA+) protegem o poder de compra até a data.'] },
  carro: { nome: 'Comprar carro', icone: 'carro', cor: 'rf', grupo: 'objetivo', resumo: 'À vista ou entrada', dicas: ['Comprar à vista costuma render desconto - compare com os juros do financiamento.'] },
  acumulo: { nome: 'Juntar até uma data', icone: 'alvo', cor: 'acoes', grupo: 'objetivo', resumo: 'Projetos, estudos, equipamentos, eventos…', dicas: [] },
};

/** Categorias do tipo genérico "acúmulo até data" - ícone, cor e dica próprios. */
export const CATEGORIAS_ACUMULO = {
  projetos: { nome: 'Projetos e construções', icone: 'obra', cor: 'rf', dica: 'Reforma costuma estourar: deixe 10-20% de folga como sub-item "imprevistos".' },
  educacao: { nome: 'Educação e carreira', icone: 'livro', cor: 'acoes', dica: 'Cursos e certificações podem ter desconto à vista - e alguns são dedutíveis no IR (educação formal).' },
  equipamentos: { nome: 'Equipamentos e tecnologia', icone: 'chip', cor: 'usa', dica: 'Preços em dólar? Ponha o sub-item em USD e o restante em reais acompanha o câmbio.' },
  empreendedorismo: { nome: 'Empreendedorismo', icone: 'loja', cor: 'fiis', dica: 'Separe capital inicial de capital de giro (pelo menos 6 meses de custos fixos).' },
  hobbies: { nome: 'Hobbies', icone: 'estrela', cor: 'acoes', dica: 'Metas pequenas e curtas: renda fixa com liquidez diária é suficiente.' },
  pets: { nome: 'Pets', icone: 'pata', cor: 'fiis', dica: 'Uma reserva pro pet (veterinário) evita mexer na reserva de emergência.' },
  eventos: { nome: 'Grandes eventos', icone: 'calendario', cor: 'usa', dica: 'Fornecedores costumam pedir sinal: liste cada um como sub-item e marque quando pagar.' },
  assinaturas: { nome: 'Assinaturas e licenças anuais', icone: 'recibo', cor: 'rf', dica: 'Pagar anual sai mais barato: junte 1/12 por mês até a renovação.' },
  saude: { nome: 'Saúde e estética', icone: 'coracao', cor: 'bad', dica: 'Procedimentos eletivos: veja se o plano cobre parte antes de definir o alvo.' },
  mudancaPais: { nome: 'Mudança de país', icone: 'globo', cor: 'acoes', dica: 'Muitos vistos exigem comprovar saldo em moeda estrangeira - use a moeda do destino.' },
  casamento: { nome: 'Casamento e celebrações', icone: 'anel', cor: 'usa', dica: 'Divida em sub-itens (buffet, local, roupa, foto) e marque o que já foi pago.' },
  veiculosLazer: { nome: 'Veículos de lazer', icone: 'barco', cor: 'fiis', dica: 'Some seguro, manutenção e vaga/marina do 1º ano ao alvo.' },
  outros: { nome: 'Outro objetivo', icone: 'alvo', cor: 'acoes', dica: '' },
};

export const MOEDAS = ['BRL', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'];
/** 04/10/2026: moedas que aparecem primeiro nas listas (o resto vem dos países). */
export const MOEDAS_COMUNS = ['BRL', 'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'HUF', 'DKK', 'SEK', 'NOK', 'PLN', 'CAD', 'AUD', 'JPY', 'ARS', 'CLP', 'UYU', 'MXN'];

export const STATUS_META = {
  concluida: { rotulo: 'Concluída', classe: 'good', explicacao: 'Você já juntou o alvo inteiro (na renda passiva: a renda média já chegou na meta).' },
  'no-ritmo': { rotulo: 'No ritmo', classe: 'good', explicacao: 'O seu aporte mensal de hoje (o real, deduzido do histórico dos investimentos vinculados, ou o que você informou), somado ao rendimento esperado, alcança o alvo ATÉ o prazo.' },
  atrasada: { rotulo: 'Atrasada', classe: 'bad', explicacao: 'No ritmo de hoje você não chega até o prazo: o aporte necessário por mês é maior que o seu aporte atual. Veja quanto falta por mês e as simulações para acelerar.' },
  vencida: { rotulo: 'Prazo passou', classe: 'bad', explicacao: 'A data da meta já chegou e ainda falta dinheiro. Ajuste o prazo ou o alvo (Editar).' },
  'sem-prazo': { rotulo: 'Sem prazo', classe: 'na', explicacao: 'A meta não tem data: mostramos quando você chega no ritmo atual, mas não dá para dizer se está adiantada ou atrasada.' },
  'saldo-ideal': { rotulo: 'Saldo ideal', classe: 'good', explicacao: 'O valor LÍQUIDO da reserva (o que cairia na conta se você resgatasse tudo hoje, já sem IR e IOF) cobre o saldo ideal.' },
  'ideal-bruto': { rotulo: 'Ideal só no bruto', classe: 'warn', explicacao: 'O valor investido (bruto) já bate o saldo ideal, mas se você resgatasse hoje o IR/IOF deixaria o líquido abaixo dele. Falta pouco: a diferença é o imposto.' },
  abaixo: { rotulo: 'Abaixo do ideal', classe: 'warn', explicacao: 'O valor líquido da reserva (já descontando o IR/IOF de um resgate hoje) ainda está abaixo do saldo ideal.' },
};

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
  aPagar: 'O que você JÁ COMPROU (passagens, hotéis, ingressos) no cartão conta como pago desde já: só falta a fatura chegar. Por isso fica fora do aporte - aqui você vê quanto paga em cada mês, por cartão. Cada parcela vira "confirmada" quando o mês da fatura passa (ou quando você marca o item como confirmado).',
  aJuntar: 'O dinheiro que você ainda precisa JUNTAR até a viagem: gasto lá (diárias x dias de cada destino, na moeda de lá), taxa turística, margem de segurança e o que ainda não foi pago - menos o que já está guardado (saldo em conta, ex. Wise em euro, e investimentos vinculados). O aporte mensal, o status e a projeção olham só essa parte.',
  entradas: 'Dinheiro que vai entrar e você já decidiu guardar na meta (13º, saque-aniversário do FGTS, PLR...). Só contam as que caem ANTES da data da meta. O aporte mensal necessário desconta o valor delas (com o rendimento até a data). Valor vazio = estimado pelo seu salário (aba Salário) e pelo FGTS (aba Patrimônio); dá pra digitar o valor e o mês.',
  decimo13: '13º salário: a 1ª parcela (até 30/nov) é metade do salário bruto, sem descontos; a 2ª (até 20/dez) é a outra metade menos o INSS e o IR do 13º inteiro. Estimado pelo seu último holerite (aba Salário) - se o 13º já estiver lançado lá, vale o valor lançado.',
  fgts: 'Saque-aniversário do FGTS: liberado no mês do seu aniversário (até o fim do 2º mês seguinte). Valor = alíquota da faixa x saldo + parcela adicional (Lei 8.036/90), estimado pela aba Patrimônio com o saldo projetado até lá.',
  taxaTuristica: 'Taxa turística (city tax / taxa de hospedagem): cobrada pelo hotel por pessoa e por noite, na moeda local - nem toda cidade cobra, e algumas têm limite de noites. Entra no dinheiro a juntar (sem margem). Os valores sugeridos são de um hotel 3 estrelas, com a fonte - confira antes de viajar.',
  cambioFonte: 'Cotação de hoje: 1º a da sua planilha (aba Bolsa USA >>>, GOOGLEFINANCE - dólar, libra, franco e euro); outras moedas pela aba aux_cambio (também GOOGLEFINANCE, criada sozinha); se a planilha não tiver, AwesomeAPI ou PTAX do Banco Central.',
};


const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null)));
const r2 = (v) => Math.round(v * 100) / 100;

/** Nome/ícone/cor de uma meta (o genérico usa os da categoria). */
export function aparenciaMeta(meta) {
  const tipo = TIPOS_META[meta && meta.tipo] || TIPOS_META.acumulo;
  if (meta && meta.tipo === 'acumulo') {
    const c = CATEGORIAS_ACUMULO[meta.categoria] || CATEGORIAS_ACUMULO.outros;
    return { rotulo: c.nome, icone: c.icone, cor: c.cor, dicas: c.dica ? [c.dica] : [] };
  }
  return { rotulo: tipo.nome, icone: tipo.icone, cor: tipo.cor, dicas: tipo.dicas };
}

// ---------------------------------------------------------------------------
// Datas (mês 'aaaa-mm')
// ---------------------------------------------------------------------------

export function mesDe(data) {
  if (typeof data === 'string') { const m = data.match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}` : null; }
  if (data instanceof Date) return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  return null;
}

/** Meses de `de` até `ate` (mesmo mês = 0; negativo se `ate` já passou). */
export function mesesEntre(de, ate) {
  const a = mesDe(de); const b = mesDe(ate);
  if (!a || !b) return null;
  return (Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7))) - (Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7)));
}

export function somarMeses(mes, n) {
  const m = mesDe(mes);
  if (!m) return null;
  const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}


/** "mar/2027" */
export function rotuloMes(mes) {
  const m = mesDe(mes);
  return m ? formatMesAno(m, { anoCurto: false }) : '—';
}

/** "2 anos e 3 meses" / "8 meses" */
export function rotuloDuracao(meses) {
  if (meses == null || !Number.isFinite(meses)) return '—';
  const n = Math.max(0, Math.ceil(meses));
  const a = Math.floor(n / 12); const m = n % 12;
  const pa = a ? `${a} ${a === 1 ? 'ano' : 'anos'}` : '';
  const pm = m ? `${m} ${m === 1 ? 'mês' : 'meses'}` : '';
  return pa && pm ? `${pa} e ${pm}` : (pa || pm || 'agora');
}

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

/** Cotação (reais por 1 unidade) - aceita { EUR: 6.1 } ou { EUR: { valor: 6.1 } }. BRL = 1. */
export function cotacao(moeda, cambio) {
  if (!moeda || moeda === 'BRL') return 1;
  const c = cambio && cambio[moeda];
  const v = c && typeof c === 'object' ? c.valor : c;
  return typeof v === 'number' && v > 0 ? v : null;
}

/** Valor em reais (null se não há câmbio dessa moeda). */
export function paraBRL(valor, moeda, cambio) {
  const v = num(valor);
  if (v == null) return null;
  const c = cotacao(moeda, cambio);
  return c == null ? null : v * c;
}

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
  const ativas = (metas || []).filter((m) => m && m.status !== 'arquivada');
  ordemDeAlocacao(ativas).forEach((m) => {
    const chave = m.id || `__sem-id-${ativas.indexOf(m)}`;
    ocupadoPorMeta[chave] = JSON.parse(JSON.stringify(ocupado));
    const r = resolverVinculos(m.vinculos, ativos, cambio, { ocupado, aliases });
    saldos += r.itens.filter((v) => v.tipo === 'saldo').reduce((t, v) => t + (v.valorBRL || 0), 0);
    usoPorMeta[chave] = r.uso;
    Object.entries(r.uso).forEach(([id, valor]) => {
      const x = ocupado[id] || (ocupado[id] = { valor: 0, metas: [] });
      x.valor += valor;
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
  (metas || []).filter((m) => m.status !== 'arquivada').forEach((m) => {
    resolverVinculos(m.vinculos, ativos).itens.forEach((v) => {
      v.ativos.forEach((a) => {
        const parte = v.pretendidoBRL != null && v.base > 0 ? v.pretendidoBRL * ((Number(a.valorBRL) || 0) / v.base) : (v.base > 0 ? v.valorBRL * ((Number(a.valorBRL) || 0) / v.base) : 0);
        const x = mapa.get(a.id) || { id: a.id, nome: a.nome, valorBRL: a.valorBRL, comprometido: 0, metas: [] };
        x.comprometido += parte;
        if (!x.metas.includes(m.nome)) x.metas.push(m.nome);
        mapa.set(a.id, x);
      });
    });
  });
  return [...mapa.values()].map((x) => ({ ...x, comprometido: r2(x.comprometido), fracao: x.valorBRL > 0 ? x.comprometido / x.valorBRL : 0 }))
    .filter((x) => x.fracao > 1.005 && x.metas.length > 1);
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

  // 05/10/2026 (A-12): cópia congelada (meta salva antes de "seguir a planilha") que já difere da planilha - avisa em vez de calar
  const congelados = [];
  {
    const refs = ctx.referencias || {};
    const dif = (a, b) => num(a) != null && num(b) != null && Math.abs(num(a) - num(b)) > 1e-9;
    const quando = meta.atualizadoEm ? ` (congelado em ${String(meta.atualizadoEm).slice(8, 10)}/${String(meta.atualizadoEm).slice(5, 7)})` : ' (congelado)';
    if (meta.tipo === 'reservaEmergencia') {
      const rr = refs.reserva || {};
      if (dif(esp.meses, rr.meses)) congelados.push({ campo: 'meses', rotulo: 'meses de reserva', meta: num(esp.meses), planilha: num(rr.meses) });
      if (dif(esp.margem, rr.sobra)) congelados.push({ campo: 'margem', rotulo: 'sobra de segurança', meta: num(esp.margem), planilha: num(rr.sobra), tipo: '%' });
    }
    if (meta.tipo === 'aposentadoria') {
      const rp = refs.patrimonio || {};
      if (dif(esp.extra, rp.extra)) congelados.push({ campo: 'extra', rotulo: 'extra por mês', meta: num(esp.extra), planilha: num(rp.extra), tipo: 'R$' });
      if (dif(esp.reinvestimento, rp.reinvestimento)) congelados.push({ campo: 'reinvestimento', rotulo: '% de reinvestimento', meta: num(esp.reinvestimento), planilha: num(rp.reinvestimento), tipo: '%' });
      if (dif(esp.taxaRetirada, rp.rendimento)) congelados.push({ campo: 'taxaRetirada', rotulo: 'taxa de retirada', meta: num(esp.taxaRetirada), planilha: num(rp.rendimento), tipo: '%' });
    }
    const fmt = (x, tipo) => (tipo === '%' ? `${Math.round(x * 1000) / 10}%` : tipo === 'R$' ? formatBRL0(x) : String(x));
    congelados.forEach((c) => avisos.push(`${c.rotulo}${quando}: esta meta usa ${fmt(c.meta, c.tipo)} e a planilha agora tem ${fmt(c.planilha, c.tipo)} - apague o campo em Editar para seguir a planilha`));
    // 3 alvos pra mesma aposentadoria (planilha, engine, versão arquivada): mostra a taxa e avisa quando planilha e engine divergem
    const desejadoPlanilha = num(refs.patrimonio && refs.patrimonio.desejado);
    if (aposentadoria && aposentadoria.modo === 'calculado' && desejadoPlanilha > 0 && alvoBRL > 0 && Math.abs(alvoBRL - desejadoPlanilha) / desejadoPlanilha > 0.01) {
      avisos.push(`o alvo desta meta (${formatBRL0(alvoBRL)}, retirada de ${Math.round(aposentadoria.taxa * 1000) / 10}% ao ano) difere do patrimônio desejado da planilha (${formatBRL0(desejadoPlanilha)}${num(refs.patrimonio.rendimento) != null ? `, ${Math.round(num(refs.patrimonio.rendimento) * 1000) / 10}% ao ano` : ''}) - confira a taxa de retirada`);
    }
  }

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
  if (vinc.cortadoBRL > 0.5 && donosCortados.length) avisos.push(`${formatBRL0(vinc.cortadoBRL)} do que você vinculou já está em ${donosCortados.join(' e ')} (maior prioridade) e não conta de novo aqui: cada ativo vale numa meta só (reserva, depois renda passiva, depois aposentadoria)`);
  else if (vinc.cortadoBRL > 0.5) avisos.push(`${formatBRL0(vinc.cortadoBRL)} dos vínculos se repetem dentro desta meta (ex.: classe + ativo da mesma classe) e contam uma vez só`);
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
    congelados, taxaRetirada: aposentadoria ? aposentadoria.taxa : null,
    viagem, aposentadoria, total: total != null ? r2(total) : null, ja: r2(ja), parcelasCorrendo: r2(parcelasCorrendo),
    // 05/10/2026 (A-11): quanto dos vínculos não conta porque outra meta (ou outro vínculo desta) já pegou
    vinculadoCortadoBRL: vinc.cortadoBRL || 0, valorAtivosVinculados: r2(vinc.itens.filter((v) => v.tipo !== 'saldo').reduce((t, v) => t + v.valorBRL, 0)),
    // 04/10/2026
    entradas, entradasFluxo, entradasTotal,
    decomposicao: falta != null ? { falta, entradas: entradasValidas, totalEntradas: entradasTotal, restante: r2(Math.max(0, falta - entradasTotal)), meses: mesesRestantes, aporte: necessario } : null,
  };
  // 05/10/2026: 1º marco (milhão) no ritmo - 1 linha curta no card da lista
  const proximoMarco = !ehReserva && !recorrente && alvoBRL >= 1.5e6 ? marcosProjecao(calcPronto, { hoje }).find((m) => !m.ja && m.rotulo !== 'Alvo') : null;
  calcPronto.marcoProximo = proximoMarco && proximoMarco.mes ? { rotulo: proximoMarco.rotulo, mes: proximoMarco.mes, ano: proximoMarco.ano } : null;
  // 05/10/2026: reserva com títulos de renda fixa que vencem
  calcPronto.vencimentos = ehReserva ? eventosVencimento(calcPronto, { hoje }) : null;
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

const arred = (v, passo) => Math.max(passo, Math.round(v / passo) * passo);

/**
 * Tiago: "nesse ritmo, você chega na sua meta em tanto tempo. Sugestão pra
 * chegar em 75% desse tempo, 50% desse tempo (velocidade)". A base é o
 * prazo no ritmo atual; sem ritmo (aporte zero e sem rendimento), o prazo
 * da meta. Devolve { origem, baseMeses, cenarios: [{ fracao, meses, data, aporte, aMais }] }.
 */
export function velocidadeMeta(calc, { hoje } = {}) {
  if (!calc || calc.alvoBRL == null || calc.recorrente) return null;
  const atual = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL;
  if (atual >= calc.alvoBRL - 0.5) return { chegou: true, cenarios: [] };
  const mes = mesDe(hoje || new Date());
  let baseMeses = null;
  let origem = null;
  if (Number.isFinite(calc.mesesEstimados) && calc.mesesEstimados > 0) { baseMeses = calc.mesesEstimados; origem = 'ritmo'; }
  else if (calc.mesesRestantes > 0) { baseMeses = calc.mesesRestantes; origem = 'prazo'; }
  if (!baseMeses) return { origem: null, cenarios: [] };
  const cenarios = [1, 0.75, 0.5].map((f) => {
    const meses = Math.max(1, f === 1 ? Math.ceil(baseMeses) : Math.round(baseMeses * f));
    // no ritmo = o aporte de hoje; nos outros, o que fecha naquele prazo
    const aporte = f === 1 && origem === 'ritmo' ? r2(calc.aporteAtual || 0) : r2(aporteNecessario({ alvo: calc.alvoBRL, atual, meses, taxa: calc.taxa || 0, entradas: calc.entradasFluxo }) || 0);
    // 05/10/2026: "com isso, sua meta chega em ..., o 1º milhão em ..." de cada cenário
    const rm = resumoMarcos(calc, { hoje, aporte });
    return { fracao: f, meses, data: somarMeses(mes, meses), aporte, aMais: r2(aporte - (calc.aporteAtual || 0)), comIsso: rm.frase, velocidadeMarcos: rm.velocidade };
  });
  return { origem, baseMeses, cenarios };
}

function mesesAte(calc, { atual, aporte, taxa }) {
  return prazoParaAlvo({ alvo: calc.alvoBRL, atual, aporte, taxa, entradas: calc.entradasFluxo });
}

/**
 * Dicas concretas pra acelerar (Tiago: "me dê projeções e dicas de como
 * acelerar isso"): cada uma com o número - quanto antecipa.
 * [{ id, texto, mesesAMenos }]
 */
export function dicasAcelerar(calc, meta = {}, { hoje } = {}) {
  if (!calc || calc.alvoBRL == null || calc.recorrente) return [];
  const atual = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL;
  if (atual >= calc.alvoBRL - 0.5) return [];
  const mes = mesDe(hoje || new Date());
  const taxa = calc.taxa || 0;
  const aporte = calc.aporteAtual || 0;
  const m0 = mesesAte(calc, { atual, aporte, taxa });
  const dicas = [];
  const efeito = (m1) => {
    if (!Number.isFinite(m1)) return null;
    if (!Number.isFinite(m0)) return { texto: `você chega em ${rotuloMes(somarMeses(mes, Math.ceil(m1)))}`, mesesAMenos: Infinity };
    const ganho = Math.ceil(m0) - Math.ceil(m1);
    return ganho >= 1 ? { texto: `antecipa ${rotuloDuracao(ganho)} (${rotuloMes(somarMeses(mes, Math.ceil(m1)))} em vez de ${rotuloMes(somarMeses(mes, Math.ceil(m0)))})`, mesesAMenos: ganho } : null;
  };
  const extraMes = aporte > 0 ? arred(aporte * 0.1, 50) : arred(Math.max(100, (calc.aporteNecessario || 0) * 0.25), 50);
  const e1 = efeito(mesesAte(calc, { atual, aporte: aporte + extraMes, taxa }));
  if (e1) dicas.push({ id: 'aporte', texto: `Aportar ${formatBRL0(extraMes)} a mais por mês (${formatBRL0(aporte + extraMes)}) ${e1.texto}.`, mesesAMenos: e1.mesesAMenos, comIsso: resumoMarcos(calc, { hoje, aporte: aporte + extraMes }).frase });
  const unico = arred(Math.max(1000, aporte), 500);
  const e2 = efeito(mesesAte(calc, { atual: atual + unico, aporte, taxa }));
  if (e2) dicas.push({ id: 'unico', texto: `Um aporte extra de ${formatBRL0(unico)} agora (13º, restituição do IR, bônus) ${e2.texto}.`, mesesAMenos: e2.mesesAMenos, comIsso: resumoMarcos(calc, { hoje, atual: atual + unico }).frase });
  const rend = num(meta.rendimentoAnual) || 0;
  const e3 = efeito(mesesAte(calc, { atual, aporte, taxa: taxaMensal(rend + 0.01) }));
  if (e3 && meta.tipo !== 'reservaEmergencia') dicas.push({ id: 'rendimento', texto: `Render 1 ponto percentual a mais ao ano (${formatNumeroPt(Math.round((rend + 0.01) * 1000) / 10)}% em vez de ${formatNumeroPt((Math.round(rend * 1000) / 10))}%) - ex. tirar dinheiro parado da conta - ${e3.texto}.`, mesesAMenos: e3.mesesAMenos, comIsso: resumoMarcos(calc, { hoje, taxa: taxaMensal(rend + 0.01) }).frase });
  if (meta.tipo === 'rendaPassiva' && calc.renda && calc.renda.atual > 0) {
    const e4 = efeito(mesesAte(calc, { atual, aporte: aporte + calc.renda.atual, taxa }));
    if (e4) dicas.push({ id: 'reinvestir', texto: `Reinvestir todos os proventos (${formatBRL0(calc.renda.atual)}/mês hoje) somados ao aporte ${e4.texto} - a renda cresce sozinha (efeito bola de neve).`, mesesAMenos: e4.mesesAMenos, comIsso: resumoMarcos(calc, { hoje, aporte: aporte + calc.renda.atual }).frase });
  }
  if (calc.viagem) {
    Object.values(calc.viagem.porMoeda).filter((x) => x.moeda !== 'BRL' && x.faltaBRL > 0).forEach((x) => {
      dicas.push({ id: `cambio-${x.moeda}`, texto: `Faltam ${formatNumeroPt(x.falta, { maximumFractionDigits: 0 })} ${x.moeda}: cada 1% de alta do ${x.moeda} encarece a viagem em ${formatBRL0(x.faltaBRL * 0.01)}. Comprar um pouco por mês (preço médio) dilui esse risco.`, mesesAMenos: 0 });
    });
  }
  if (meta.tipo === 'reservaEmergencia' && calc.liquido && calc.liquido.impostoBRL > 0) {
    dicas.push({ id: 'imposto', texto: `${formatBRL0(calc.liquido.impostoBRL)} da reserva iriam para IR/IOF num resgate hoje. O IR cai com o tempo (15% depois de 2 anos): numa emergência, resgate primeiro os títulos mais antigos.`, mesesAMenos: 0 });
  }
  return dicas.sort((a, b) => (b.mesesAMenos || 0) - (a.mesesAMenos || 0));
}

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

/**
 * 05/10/2026 (Tiago: "nas simulações, sempre incluir 'com isso, sua meta de X
 * chega em tal ano, o 1º milhão em tal ano, o 2º...'"): frase a partir dos
 * marcos (marcosProjecao). Só faz sentido com alvo em milhões (>= R$ 1,5 mi:
 * os marcos são cada milhão); senão devolve ''.
 * "Com isso, sua meta de R$ 3.200.000 chega em mar/2041; o 1º milhão em 2029, o 2º em 2035, o 3º em 2040."
 */
export function fraseMarcos(marcos, { alvo = null } = {}) {
  const lista = marcos || [];
  const milhoes = lista.filter((m) => /º milhão$/.test(m.rotulo));
  const fim = lista.find((m) => m.rotulo === 'Alvo');
  if (!milhoes.length || !fim) return '';
  const meta = alvo != null ? alvo : fim.valor;
  const quando = fim.ja ? 'já está alcançada' : (fim.mes ? `chega em ${rotuloMes(fim.mes)}` : 'não chega em 60 anos');
  const partes = milhoes.map((m, i) => {
    const nome = i === 0 ? `o ${m.rotulo}` : `o ${m.rotulo.replace(/ milhão$/, '')}`;
    return `${nome} ${m.ja ? 'já foi' : (m.ano ? `em ${m.ano}` : 'não chega')}`;
  });
  return `Com isso, sua meta de ${formatBRL0(meta)} ${quando}; ${partes.join(', ')}.`;
}

/**
 * 05/10/2026: velocidade entre os marcos ("do 1º pro 2º milhão: 6 anos; do 2º
 * pro 3º: 4 anos e 2 meses - os juros compostos aceleram"). Pula o trecho que
 * começa num marco que já passou (não dá pra saber quando foi). '' sem 2 marcos.
 */
export function velocidadeEntreMarcos(marcos) {
  const lista = (marcos || []).filter((m) => m.meses != null);
  const ehMilhao = (m) => /º milhão$/.test(m.rotulo);
  const ord = (m) => m.rotulo.replace(/ milhão$/, '');
  const trechos = [];
  for (let i = 0; i + 1 < lista.length; i++) {
    const a = lista[i]; const b = lista[i + 1];
    if (a.ja || !ehMilhao(a)) continue;
    // a meta redonda (ex. R$ 3 mi) é o próprio "3º milhão"
    const redondo = b.rotulo === 'Alvo' && b.valor % 1e6 === 0;
    trechos.push({ n: b.meses - a.meses, entreMilhoes: ehMilhao(b) || redondo, de: ord(a), para: ehMilhao(b) ? ord(b) : (redondo ? `${b.valor / 1e6}º` : null) });
  }
  if (!trechos.length) return '';
  const txt = trechos.map((t, i) => `${t.entreMilhoes ? `do ${t.de} pro ${t.para}${i === 0 ? ' milhão' : ''}` : `do ${t.de} milhão à meta`}: ${rotuloDuracao(t.n)}`).join('; ');
  const completos = trechos.filter((t) => t.entreMilhoes);
  const primeiro = completos[0]; const ultimo = completos[completos.length - 1];
  const acelera = completos.length >= 2 && ultimo.n <= primeiro.n * 0.95 && primeiro.n - ultimo.n >= 3; // diferença de arredondamento não é aceleração
  return `${txt}${acelera ? ' - os juros compostos aceleram: cada milhão novo vem mais rápido' : ''}.`;
}

/**
 * 05/10/2026: { marcos, frase, velocidade } de uma simulação (aporte/atual/
 * taxa/alvo diferentes dos da meta). Vazio fora do modo "milhões".
 */
export function resumoMarcos(calc, opcoes = {}) {
  const alvo = opcoes.alvo != null ? opcoes.alvo : (calc && calc.alvoBRL);
  if (!calc || !(alvo >= 1.5e6) || calc.recorrente) return { marcos: [], frase: '', velocidade: '' };
  const marcos = marcosProjecao(calc, opcoes);
  return { marcos, frase: fraseMarcos(marcos, { alvo }), velocidade: velocidadeEntreMarcos(marcos) };
}

/**
 * "Se a renda fosse 10% a menos, 20% a menos, quanto você precisaria
 * juntar" (aposentadoria e renda passiva). [{ reducao, renda, montante,
 * economia, aporteNecessario, data, mesesAMenos }]
 */
export function cenariosRendaMenor(calc, { hoje, reducoes = [0.1, 0.2] } = {}) {
  if (!calc || !(calc.alvoBRL > 0)) return [];
  const renda = calc.aposentadoria ? calc.aposentadoria.renda : (calc.renda ? calc.renda.alvo : null);
  const atual = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL;
  const mes = mesDe(hoje || new Date());
  const ent = calc.entradasFluxo;
  const m0 = prazoParaAlvo({ alvo: calc.alvoBRL, atual, aporte: calc.aporteAtual || 0, taxa: calc.taxa || 0, entradas: ent });
  return reducoes.map((r) => {
    const montante = r2(calc.alvoBRL * (1 - r));
    const n = prazoParaAlvo({ alvo: montante, atual, aporte: calc.aporteAtual || 0, taxa: calc.taxa || 0, entradas: ent });
    return {
      reducao: r, renda: renda != null ? r2(renda * (1 - r)) : null, montante, economia: r2(calc.alvoBRL - montante),
      aporteNecessario: calc.mesesRestantes != null ? r2(aporteNecessario({ alvo: montante, atual, meses: Math.max(0, calc.mesesRestantes), taxa: calc.taxa || 0, entradas: ent }) || 0) : null,
      data: Number.isFinite(n) ? somarMeses(mes, Math.ceil(n)) : null,
      mesesAMenos: Number.isFinite(n) && Number.isFinite(m0) ? Math.ceil(m0) - Math.ceil(n) : null,
      // 05/10/2026: com o montante menor, quando cada milhão chega no seu ritmo
      comIsso: resumoMarcos(calc, { hoje, alvo: montante }).frase,
    };
  });
}

/** Explicação do status (com o caso da renda passiva). */
export function explicarStatus(status, meta = {}) {
  const s = STATUS_META[status] || STATUS_META['sem-prazo'];
  if (meta.tipo === 'rendaPassiva' && (status === 'no-ritmo' || status === 'atrasada')) {
    return status === 'no-ritmo'
      ? 'Na renda passiva, "No ritmo" quer dizer: com o seu aporte mensal de hoje (real ou informado) e o rendimento esperado, o patrimônio que gera a renda (renda x 12 / DY) é alcançado até o prazo - aí a renda chega na meta.'
      : 'Na renda passiva, "Atrasada" quer dizer: no aporte de hoje, o patrimônio que gera a renda (renda x 12 / DY) só é alcançado DEPOIS do prazo. A renda de hoje pode até estar crescendo, mas não no passo necessário.';
  }
  return s.explicacao || '';
}

// ---------------------------------------------------------------------------
// 03/10/2026: análises dos gráficos (mesmo formato de analise-grafico.js:
// { tom, resumo, pontos: [{ tipo, tom, texto, resumo, peso }] } - desenhado
// por renderAnalise)
// ---------------------------------------------------------------------------

const pctTxt = (f, casas = 1) => `${f >= 0 ? '+' : '−'}${formatNumeroPt(Math.abs(f * 100), { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
function fecharAnalise(pontos) {
  const lista = pontos.filter(Boolean).slice(0, 5);
  if (!lista.length) return { tom: 'neutro', resumo: '', pontos: [] };
  const atencao = lista.filter((p) => p.tom === 'atencao').length;
  const bons = lista.filter((p) => p.tom === 'bom').length;
  const tom = atencao > bons ? 'atencao' : (bons > atencao ? 'bom' : 'neutro');
  const resumo = lista.slice(0, 2).map((p) => p.resumo).filter(Boolean).join(' · ');
  return { tom, resumo: resumo.charAt(0).toUpperCase() + resumo.slice(1), pontos: lista };
}

/**
 * Histórico (meses = [{ mes, valor, fluxo }], já recortado no período, o 1º é
 * a base). indices = [{ mes, cdi }] (nível do CDI no fim do mês).
 */
export function analisarHistoricoMeta({ meses = [], calc = null, indices = [] } = {}) {
  if (!meses || meses.length < 2) return { tom: 'neutro', resumo: '', pontos: [] };
  const a = meses[0]; const b = meses[meses.length - 1];
  const corpo = meses.slice(1);
  const aportes = corpo.reduce((s, x) => s + (x.fluxo || 0), 0);
  const delta = b.valor - a.valor;
  const ganho = delta - aportes;
  const pontos = [];
  pontos.push({
    tipo: 'crescimento', tom: delta >= 0 ? 'bom' : 'atencao', peso: 70,
    texto: `De ${rotuloMes(a.mes)} a ${rotuloMes(b.mes)} a meta foi de ${formatBRL0(a.valor)} para ${formatBRL0(b.valor)} (${delta >= 0 ? '+' : '−'}${formatBRL0(Math.abs(delta))}): ${formatBRL0(aportes)} vieram de aportes e ${ganho >= 0 ? '+' : '−'}${formatBRL0(Math.abs(ganho))} de rendimento/valorização.`,
    resumo: `${delta >= 0 ? '+' : '−'}${formatBRL0(Math.abs(delta))} no período (${formatBRL0(aportes)} de aportes)`,
  });
  // rendimento ponderado no tempo x CDI
  let f = 1;
  for (let i = 1; i < meses.length; i++) {
    const ant = meses[i - 1].valor;
    if (ant > 0) { let r = (meses[i].valor - (meses[i].fluxo || 0)) / ant - 1; if (r < -0.5 || r > 1) r = 0; f *= 1 + r; }
  }
  const mapaCdi = new Map((indices || []).map((x) => [x.mes, x.cdi]));
  const c0 = mapaCdi.get(a.mes); const c1 = mapaCdi.get(b.mes);
  if (meses.length >= 3) {
    const R = f - 1;
    const cdi = c0 > 0 && c1 > 0 ? c1 / c0 - 1 : null;
    pontos.push({
      tipo: 'rendimento', tom: cdi == null ? (R >= 0 ? 'neutro' : 'atencao') : (R >= cdi ? 'bom' : 'atencao'), peso: 60,
      texto: `Tirando os aportes, o dinheiro da meta rendeu ${pctTxt(R)} no período${cdi != null ? ` - o CDI rendeu ${pctTxt(cdi)} (${R >= cdi ? 'acima' : 'abaixo'} dele${R > 0 && cdi > 0.001 ? `, ${Math.round((R / cdi) * 100)}% do CDI` : ''})` : ''}.`,
      resumo: `rendeu ${pctTxt(R)}${cdi != null ? ` (CDI ${pctTxt(cdi)})` : ''}`,
    });
  }
  if (corpo.length >= 2) {
    const media = aportes / corpo.length;
    const ult3 = corpo.slice(-3);
    const media3 = ult3.reduce((s, x) => s + (x.fluxo || 0), 0) / ult3.length;
    const sem = corpo.filter((x) => (x.fluxo || 0) <= 1).length;
    let texto = `Aporte médio de ${formatBRL0(media)}/mês no período`;
    if (corpo.length > 4) texto += `; nos últimos 3 meses, ${formatBRL0(media3)}/mês (${media3 >= media * 1.1 ? 'acelerando' : media3 <= media * 0.9 ? 'desacelerando' : 'estável'})`;
    texto += sem ? `. ${sem} de ${corpo.length} meses sem aporte.` : '. Aportou em todos os meses.';
    let tom = 'neutro';
    if (calc && calc.aporteNecessario > 0) {
      const cobre = media / calc.aporteNecessario;
      texto += ` O necessário até o prazo é ${formatBRL0(calc.aporteNecessario)}/mês: a média do período cobre ${Math.round(cobre * 100)}%.`;
      tom = cobre >= 1 ? 'bom' : 'atencao';
    }
    pontos.push({ tipo: 'aportes', tom, peso: 65, texto, resumo: `aporte médio ${formatBRL0(media)}/mês` });
  }
  // maior queda (renda variável)
  let pico = 0; let pior = { dd: 0 };
  for (let i = 1; i < meses.length; i++) {
    if (meses[i].valor > meses[pico].valor) pico = i;
    const dd = meses[pico].valor > 0 ? 1 - (meses[i].valor - 0) / meses[pico].valor : 0;
    if (dd > pior.dd && (meses[i].fluxo || 0) >= 0) pior = { dd, pico, vale: i };
  }
  if (pior.dd >= 0.05) {
    pontos.push({ tipo: 'queda', tom: 'atencao', peso: 50, texto: `Maior queda no período: −${Math.round(pior.dd * 100)}% (de ${rotuloMes(meses[pior.pico].mes)} a ${rotuloMes(meses[pior.vale].mes)}) - oscilação de renda variável ou resgate.`, resumo: `queda de −${Math.round(pior.dd * 100)}% no caminho` });
  }
  return fecharAnalise(pontos);
}

/** Projeção (pontos de serieProjecao). */
export function analisarProjecaoMeta(calc, { pontos = [], marcos = [], hoje } = {}) {
  if (!calc || calc.alvoBRL == null || pontos.length < 2) return { tom: 'neutro', resumo: '', pontos: [] };
  const mes = mesDe(hoje || new Date());
  const out = [];
  if (Number.isFinite(calc.mesesEstimados) && calc.mesesEstimados > 0) {
    const chega = somarMeses(mes, Math.ceil(calc.mesesEstimados));
    let texto = `No seu ritmo (${formatBRL0(calc.aporteAtual)}/mês${calc.aporteOrigem === 'historico' ? ', o aporte real dos últimos 12 meses' : ''}) você chega no alvo em ${rotuloMes(chega)} (${rotuloDuracao(calc.mesesEstimados)})`;
    let tom = 'neutro';
    if (calc.mesesRestantes != null) {
      const dif = Math.ceil(calc.mesesEstimados) - calc.mesesRestantes;
      texto += dif <= 0 ? ` - ${rotuloDuracao(-dif)} antes do prazo.` : ` - ${rotuloDuracao(dif)} depois do prazo (${rotuloMes(calc.dataAlvo)}).`;
      tom = dif <= 0 ? 'bom' : 'atencao';
    } else texto += '.';
    out.push({ tipo: 'ritmo', tom, peso: 80, texto, resumo: `no ritmo: ${rotuloMes(chega)}` });
  } else if (calc.atualRitmo < calc.alvoBRL && calc.ritmoSemAporte) {
    out.push({ tipo: 'ritmo', tom: 'atencao', peso: 80, texto: `Nos últimos meses você não aportou nessa meta (ritmo médio ${formatBRL0(calc.aporteReal)}/mês) - sem aporte, só o rendimento não leva ao alvo. Informe um aporte em Editar ou veja o aporte necessário.`, resumo: 'sem aporte recente' });
  } else if (calc.atualRitmo < calc.alvoBRL) {
    out.push({ tipo: 'ritmo', tom: 'atencao', peso: 80, texto: 'No ritmo de hoje (sem aporte e sem rendimento suficiente) a meta não chega no alvo - informe um aporte ou vincule os investimentos.', resumo: 'sem ritmo pra chegar' });
  }
  if (calc.aporteNecessario > 0 && calc.mesesRestantes > 0) {
    const n = calc.mesesRestantes;
    const aportes = calc.aporteNecessario * n;
    const rend = Math.max(0, calc.alvoBRL - (calc.atualRitmo || 0) - aportes - (calc.entradasTotal || 0));
    const gap = calc.aporteNecessario - (calc.aporteAtual || 0);
    const fraseNec = resumoMarcos(calc, { hoje, aporte: calc.aporteNecessario }).frase; // 05/10/2026
    out.push({
      tipo: 'composicao', tom: gap > 0.5 ? 'atencao' : 'bom', peso: 70,
      texto: `Para fechar em ${rotuloMes(calc.dataAlvo)}: ${formatBRL0(calc.aporteNecessario)}/mês${gap > 0.5 ? ` (${formatBRL0(gap)} a mais que hoje)` : ' (você já aporta isso)'}. Desse caminho, ${formatBRL0(aportes)} seriam aportes${calc.entradasTotal > 0 ? `, ${formatBRL0(calc.entradasTotal)} entradas programadas (13º, FGTS...)` : ''} e ${formatBRL0(rend)} rendimento (${Math.round((rend / Math.max(1, calc.alvoBRL - (calc.atualRitmo || 0))) * 100)}% do que falta).${fraseNec ? ` ${fraseNec}` : ''}`,
      resumo: gap > 0.5 ? `faltam ${formatBRL0(gap)}/mês pro prazo` : 'aporte cobre o prazo',
    });
  }
  const proximos = (marcos || []).filter((m) => !m.ja && m.mes);
  if (proximos.length) {
    // 05/10/2026: a velocidade entre os marcos (1º pro 2º milhão...) entra na explicação
    const vel = velocidadeEntreMarcos(marcos);
    out.push({ tipo: 'marcos', tom: 'neutro', peso: 55, texto: `Marcos no seu ritmo: ${proximos.slice(0, 4).map((m) => `${m.rotulo} em ${rotuloMes(m.mes)}${m.idade ? ` (${m.idade} anos)` : ''}`).join('; ')}.${vel ? ` Velocidade: ${vel}` : ''}`, resumo: `${proximos[0].rotulo} em ${proximos[0].ano}` });
  }
  return fecharAnalise(out);
}

/** Renda passiva mês a mês (renda = [{ mes, valor }], recortada; o mês atual é parcial). */
export function analisarRendaMensal(renda = [], calc = null, { hoje } = {}) {
  const mesHoje = mesDe(hoje || new Date());
  const fechados = (renda || []).filter((x) => x.mes < mesHoje);
  if (fechados.length < 2) return { tom: 'neutro', resumo: '', pontos: [] };
  const ult12 = fechados.slice(-12);
  const media12 = ult12.reduce((s, x) => s + x.valor, 0) / ult12.length;
  const out = [];
  const alvo = calc && calc.renda ? calc.renda.alvo : null;
  out.push({
    tipo: 'media', tom: alvo ? (media12 >= alvo ? 'bom' : 'neutro') : 'neutro', peso: 70,
    texto: `Média dos últimos ${ult12.length} meses: ${formatBRL0(media12)}/mês${alvo ? ` - ${Math.round((media12 / alvo) * 100)}% da meta de ${formatBRL0(alvo)}/mês` : ''}.`,
    resumo: `média ${formatBRL0(media12)}/mês`,
  });
  const ant = fechados.slice(-24, -12);
  if (ant.length >= 6) {
    const mediaAnt = ant.reduce((s, x) => s + x.valor, 0) / ant.length;
    if (mediaAnt > 0) {
      const cresc = media12 / mediaAnt - 1;
      out.push({ tipo: 'crescimento', tom: cresc >= 0 ? 'bom' : 'atencao', peso: 65, texto: `A renda média dos últimos 12 meses ${cresc >= 0 ? 'cresceu' : 'caiu'} ${pctTxt(cresc).replace(/^[+−]/, '')} em relação aos 12 anteriores (${formatBRL0(mediaAnt)}/mês).`, resumo: `${pctTxt(cresc)} em 12 meses` });
    }
  }
  const melhor = ult12.reduce((m, x) => (x.valor > m.valor ? x : m), ult12[0]);
  const pior = ult12.reduce((m, x) => (x.valor < m.valor ? x : m), ult12[0]);
  if (melhor.valor > 0) out.push({ tipo: 'variacao', tom: 'neutro', peso: 45, texto: `Melhor mês: ${rotuloMes(melhor.mes)} (${formatBRL0(melhor.valor)}); mais fraco: ${rotuloMes(pior.mes)} (${formatBRL0(pior.valor)}) - ações pagam concentrado em alguns meses, FIIs todo mês.`, resumo: '' });
  const ult3 = fechados.slice(-3);
  if (fechados.length >= 6) {
    const m3 = ult3.reduce((s, x) => s + x.valor, 0) / ult3.length;
    const t = m3 / media12 - 1;
    if (Math.abs(t) >= 0.1) out.push({ tipo: 'tendencia', tom: t > 0 ? 'bom' : 'atencao', peso: 55, texto: `Últimos 3 meses: ${formatBRL0(m3)}/mês, ${pctTxt(t).replace(/^[+−]/, '')} ${t > 0 ? 'acima' : 'abaixo'} da média de 12 meses.`, resumo: `${t > 0 ? 'acelerando' : 'mais fraca'} nos últimos 3 meses` });
  }
  return fecharAnalise(out);
}

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

/** Horizonte da meta em meses (null = imediato, a reserva). */
export function horizonteMeta(meta, calc) {
  if (meta.tipo === 'reservaEmergencia') return null;
  if (calc && calc.mesesRestantes != null) return Math.max(0, calc.mesesRestantes);
  if (meta.tipo === 'aposentadoria' || meta.tipo === 'rendaPassiva') return 240;
  if (calc && Number.isFinite(calc.mesesEstimados)) return Math.ceil(calc.mesesEstimados);
  return 36;
}

/** Qual bloco de SUGESTOES_INVESTIMENTO serve pra meta. */
export function chaveSugestaoInvestimento(meta, calc) {
  if (meta.tipo === 'reservaEmergencia') return 'reserva';
  if (meta.tipo === 'rendaPassiva') return 'renda';
  if (meta.tipo === 'aposentadoria') return 'longo';
  if (meta.tipo === 'viagemInternacional') return 'viagemExterior';
  const h = horizonteMeta(meta, calc);
  if (h != null && h <= 24) return 'curto';
  if (h != null && h > 60) return 'longo';
  return 'medio';
}

const mesVenc = (v) => {
  const s = String(v || '');
  let m = s.match(/^(\d{2})\/(\d{4})/); if (m) return `${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})/); if (m) return `${m[1]}-${m[2]}`;
  return null;
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
    const tom = minimo != null && !acimaMinimo ? 'atencao' : 'neutro';
    const partes = [
      `Em ${rotuloMes(mes)} ${titulos.length > 1 ? 'vencem' : 'vence'} ${todos}: entram ${formatBRL0(liquido)} líquidos (IR ${formatBRL0(ir)}${titulos.some((t) => t.estimado) ? ', estimado' : ''}).`,
    ];
    if (minimo != null) partes.push(acimaMinimo ? `Sua reserva continua acima do mínimo? Sim (${formatBRL0(semReaplicar)} contra ${formatBRL0(minimo)}).` : `Sua reserva continua acima do mínimo? Não${jaAbaixo ? ' (já está abaixo hoje)' : ''}: sem ${idx > 0 ? 'esse título e os que vencem antes' : 'esse título'} ela fica em ${formatBRL0(semReaplicar)} e faltam ${formatBRL0(falta)} pro mínimo de ${formatBRL0(minimo)}${acimaReaplicando ? ' - reaplicando o dinheiro, volta a ficar acima.' : ` - mesmo reaplicando faltam ${formatBRL0(faltaReaplicando)}.`}`);
    partes.push(`Reaplique em ${sugestao}. Sem reaplicar, o dinheiro fica na conta e para de render${perdeMes ? ` (cerca de ${formatBRL0(perdeMes)}/mês a menos)` : ''}.`);
    return { mes, em: mesesEntre(mesHoje, mes), titulos, bruto, ir, liquido, reservaSemReaplicar: r2(semReaplicar), reservaReaplicando: r2(reaplicando), acimaMinimo, acimaReaplicando, falta, faltaReaplicando, perdeMes, tom, sugestao, texto: partes.join(' ') };
  });
  return { eventos, minimo, proximo: eventos[0], temAtencao: eventos.some((e) => e.tom === 'atencao') };
}

/** Veredito de 1 ativo pra meta: { veredito: 'bom'|'atencao'|'ruim', motivo }. */
export function avaliarAtivoParaMeta(a, meta, calc) {
  const h = horizonteMeta(meta, calc);
  const reserva = meta.tipo === 'reservaEmergencia';
  const exterior = meta.tipo === 'viagemInternacional';
  if (a.classe === 'rf') {
    const txt = `${a.nome || ''} ${a.descricao || ''} ${a.indexador || ''}`.toUpperCase();
    const lciLca = /\b(LCI|LCA)\b/.test(txt);
    const selic = /SELIC/.test(txt);
    const ipca = /IPCA/.test(txt);
    const pre = /PREFIXAD|\bPRE\b/.test(txt);
    const pos = selic || (/CDI/.test(txt) && !pre && !ipca);
    const venc = mesVenc(a.vencimento);
    if (reserva) {
      if (selic) return { veredito: 'bom', motivo: 'Tesouro Selic: liquidez diária e quase não oscila - o padrão para reserva.' };
      if (lciLca) return { veredito: 'atencao', motivo: 'LCI/LCA costuma ter carência (sem resgate antes do vencimento) - confira se dá para sacar numa emergência.' };
      if (pos) return { veredito: 'atencao', motivo: 'Pós-fixado no CDI é bom para reserva SE tiver liquidez diária - confira. FGC cobre até R$ 250 mil.' };
      return { veredito: 'ruim', motivo: `${ipca ? 'IPCA+' : 'Prefixado'} oscila com a marcação a mercado: resgatar antes do vencimento pode render menos ou até dar prejuízo.` };
    }
    const dataMeta = calc && calc.dataAlvo;
    const extraMoeda = exterior ? ' Em reais: troque aos poucos para diluir o câmbio.' : '';
    if (pos && !lciLca) return { veredito: 'bom', motivo: `Pós-fixado com liquidez: rende com os juros e está disponível na data.${extraMoeda}` };
    if (venc && dataMeta) {
      const dif = mesesEntre(venc, dataMeta);
      if (dif >= 0 && dif <= 12) return { veredito: 'bom', motivo: `Vence em ${rotuloMes(venc)}, perto da data da meta (${rotuloMes(dataMeta)}): leva até o vencimento e recebe a taxa contratada.${extraMoeda}` };
      if (dif > 12) return { veredito: (h || 0) > 60 ? 'bom' : 'atencao', motivo: `Vence em ${rotuloMes(venc)}, bem antes da meta: dá para levar até o vencimento e reaplicar.${extraMoeda}` };
      if (lciLca) return { veredito: 'ruim', motivo: `Vence em ${rotuloMes(venc)}, DEPOIS da meta (${rotuloMes(dataMeta)}), e LCI/LCA costuma não ter resgate antecipado.` };
      return { veredito: (h || 0) >= 120 && ipca ? 'bom' : 'atencao', motivo: `Vence em ${rotuloMes(venc)}, depois da meta (${rotuloMes(dataMeta)}): vai precisar vender antes, pelo preço de mercado do dia (pode estar abaixo).` };
    }
    if (ipca && (h == null || h >= 60)) return { veredito: 'bom', motivo: 'IPCA+ protege da inflação no longo prazo.' };
    return { veredito: 'atencao', motivo: 'Confira se o vencimento/liquidez combina com a data da meta.' };
  }
  // renda variável
  const nomeClasse = { acoes: 'Ações', fiis: 'FIIs', usa: 'Ações dos EUA' }[a.classe] || 'Renda variável';
  if (reserva) return { veredito: 'ruim', motivo: `${nomeClasse} oscilam: podem estar em queda justo quando você precisar da reserva.` };
  if (meta.tipo === 'rendaPassiva') {
    if (a.classe === 'fiis') return { veredito: 'bom', motivo: 'FII paga rendimento todo mês, isento de IR para pessoa física.' };
    if (a.classe === 'acoes') return { veredito: 'bom', motivo: 'Ação pagadora de dividendos: renda isenta hoje, concentrada em alguns meses.' };
    return { veredito: 'atencao', motivo: 'Dividendos dos EUA têm 30% retidos na fonte - bom para diversificar moeda, rende menos de renda líquida.' };
  }
  if (exterior && a.classe === 'usa') return { veredito: 'atencao', motivo: 'Em dólar: protege parte do câmbio, mas oscila - em viagem curta é arriscado.' };
  if (h != null && h < 24) return { veredito: 'ruim', motivo: `${nomeClasse} em menos de 2 anos: não dá tempo de esperar uma queda passar.` };
  if (h != null && h < 60) return { veredito: 'atencao', motivo: `${nomeClasse} em 2 a 5 anos: só uma parte - perto da data, migre para renda fixa.` };
  return { veredito: 'bom', motivo: `${nomeClasse} no longo prazo: tempo para a oscilação passar e o crescimento aparecer.` };
}

const PESO_VEREDITO = { bom: 0, atencao: 1, ruim: 2 };
/**
 * Veredito por vínculo (classe/marca = os ativos de dentro, pesados pelo
 * valor) e um resumo. { itens: [{ vinculo, nome, veredito, motivo, ativos }], resumo: { bom, atencao, ruim, texto } }
 */
export function avaliarVinculos(meta, calc) {
  const itens = (calc.vinculos || []).map((v) => {
    if (v.tipo === 'saldo') {
      let veredito = 'atencao';
      let motivo = 'Dinheiro parado em conta perde para a inflação - mantenha aí só o que já é da moeda/uso imediato.';
      if (meta.tipo === 'viagemInternacional' && v.moeda && v.moeda !== 'BRL') {
        const moedasViagem = calc.viagem ? Object.keys(calc.viagem.porMoeda) : [meta.moeda];
        if (moedasViagem.includes(v.moeda)) { veredito = 'bom'; motivo = `Já em ${v.moeda}, a moeda da viagem: o câmbio dessa parte está travado e é o dinheiro que você usa lá.`; }
        else motivo = `Em ${v.moeda}, mas a viagem gasta em ${moedasViagem.join('/')} - vai pagar câmbio de novo.`;
      } else if (meta.tipo === 'reservaEmergencia') motivo = 'Conta corrente dá acesso imediato, mas costuma não render - deixe só o primeiro mês de despesas; o resto em Tesouro Selic/CDB diário.';
      return { vinculo: v, nome: `${v.instituicao} (${v.moeda})`, veredito, motivo, ativos: [] };
    }
    const avs = v.ativos.map((a) => ({ ativo: a, ...avaliarAtivoParaMeta(a, meta, calc) }));
    if (!avs.length) return { vinculo: v, nome: v.nome || v.id || v.classe || v.marca, veredito: 'atencao', motivo: 'Não encontrado na carteira hoje.', ativos: [] };
    if (avs.length === 1) return { vinculo: v, nome: avs[0].ativo.nome, veredito: avs[0].veredito, motivo: avs[0].motivo, ativos: avs };
    const total = avs.reduce((s, x) => s + (Number(x.ativo.valorBRL) || 0), 0) || 1;
    const fatia = (ver) => avs.filter((x) => x.veredito === ver).reduce((s, x) => s + (Number(x.ativo.valorBRL) || 0), 0) / total;
    const ruim = fatia('ruim'); const atenc = fatia('atencao');
    const veredito = ruim > 0.3 ? 'ruim' : (ruim + atenc > 0.3 ? 'atencao' : 'bom');
    const bons = avs.filter((x) => x.veredito === 'bom').length;
    const problemas = avs.filter((x) => x.veredito !== 'bom').map((x) => x.ativo.nome);
    const motivo = `${bons} de ${avs.length} adequados (${Math.round((1 - ruim - atenc) * 100)}% do valor)${problemas.length ? ` - atenção: ${problemas.slice(0, 3).join(', ')}${problemas.length > 3 ? ` e mais ${problemas.length - 3}` : ''}` : ''}.`;
    return { vinculo: v, nome: null, veredito, motivo, ativos: avs };
  });
  const conta = { bom: 0, atencao: 0, ruim: 0 };
  itens.forEach((x) => { conta[x.veredito] += 1; });
  let texto;
  if (!itens.length) texto = 'Nenhum investimento vinculado ainda - veja as sugestões abaixo.';
  else if (!conta.atencao && !conta.ruim) texto = 'Boas escolhas: tudo que está vinculado combina com o prazo e o objetivo da meta.';
  else if (conta.ruim) texto = `${conta.ruim} ${conta.ruim === 1 ? 'vínculo não combina' : 'vínculos não combinam'} com a meta - veja o porquê e as alternativas.`;
  else texto = `No geral ok, ${conta.atencao} ${conta.atencao === 1 ? 'ponto' : 'pontos'} de atenção.`;
  itens.sort((a, b) => PESO_VEREDITO[b.veredito] - PESO_VEREDITO[a.veredito]);
  return { itens, resumo: { ...conta, texto } };
}

/** Destino novo pro assistente de viagem (gasto diário em branco). */
export function destinoPadrao({ pais = '', paisCodigo = null, cidade = '', moeda = 'EUR', dias = 3 } = {}) {
  return { id: Math.random().toString(36).slice(2, 10), pais, paisCodigo, cidade, moeda, dias, gastos: { alimentacao: null, transporte: null, passeios: null, compras: null, outros: null }, extras: null, taxaTuristica: null, taxaNoites: null, taxaPessoas: null, taxaMaxNoites: null };
}

// ---------------------------------------------------------------------------
// 04/10/2026: Metas › Viagem v3 - países/cidades, migração, taxa turística,
// links (Wanderlog) e entradas programadas (13º, FGTS, PLR...)
// ---------------------------------------------------------------------------

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

// --- entradas programadas ---------------------------------------------------

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

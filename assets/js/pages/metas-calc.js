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
 */

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

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "mar/2027" */
export function rotuloMes(mes) {
  const m = mesDe(mes);
  return m ? `${MESES_CURTOS[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}` : '—';
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
export function aporteNecessario({ alvo, atual = 0, meses, taxa = 0 }) {
  if (!(alvo > 0)) return 0;
  if (meses == null || !Number.isFinite(meses)) return null;
  if (atual >= alvo) return 0;
  if (meses <= 0) return alvo - atual; // prazo vencido: falta tudo agora
  if (!taxa) return Math.max(0, (alvo - atual) / meses);
  const f = Math.pow(1 + taxa, meses);
  return Math.max(0, ((alvo - atual * f) * taxa) / (f - 1));
}

/**
 * Meses até chegar em `alvo` aportando `aporte` por mês (fracionário; Infinity
 * se nunca chega). (1+i)^n = (alvo*i + aporte) / (atual*i + aporte).
 */
export function prazoParaAlvo({ alvo, atual = 0, aporte = 0, taxa = 0 }) {
  if (!(alvo > 0) || atual >= alvo) return 0;
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
 */
export function resolverVinculos(vinculos, ativos, cambio) {
  const lista = ativos || [];
  let total = 0;
  const itens = (vinculos || []).map((v) => {
    if (v.tipo === 'saldo') {
      const cot = cotacao(v.moeda || 'BRL', cambio);
      const valor = cot == null ? 0 : r2((Number(v.saldo) || 0) * cot);
      total += valor;
      return { ...v, base: valor, valorBRL: valor, ativos: [], encontrado: cot != null, cotacao: cot, impostoBRL: 0, liquidoBRL: valor, semCambio: cot == null };
    }
    const alvo = lista.filter((a) => {
      if (v.tipo === 'classe') return a.classe === v.classe;
      if (v.tipo === 'marca') return a.classe === 'rf' && a.marca === v.marca;
      return a.id === v.id;
    });
    const base = alvo.reduce((s, a) => s + (Number(a.valorBRL) || 0), 0);
    let valor = base;
    if (v.modo === 'fracao') valor = base * (Number(v.fracao) || 0);
    if (v.modo === 'valor') valor = Math.min(base, Number(v.valor) || 0);
    valor = r2(valor);
    total += valor;
    const parte = base > 0 ? valor / base : 0;
    let imposto = 0;
    alvo.forEach((a) => { if (a.irResgate) imposto += ((Number(a.irResgate.ir) || 0) + (Number(a.irResgate.iof) || 0)) * parte; });
    return { ...v, base: r2(base), valorBRL: valor, ativos: alvo, encontrado: alvo.length > 0, impostoBRL: r2(imposto), liquidoBRL: r2(valor - imposto) };
  });
  return { total: r2(total), itens };
}

/**
 * Quanto de cada ativo está comprometido somando todas as metas (pra avisar
 * quando passa de 100% - o mesmo dinheiro contado em 2 metas).
 * Devolve [{ id, nome, valorBRL, comprometido, fracao, metas: [nome] }] só dos que passam.
 */
export function ativosSobrecomprometidos(metas, ativos) {
  const mapa = new Map();
  (metas || []).filter((m) => m.status !== 'arquivada').forEach((m) => {
    resolverVinculos(m.vinculos, ativos).itens.forEach((v) => {
      v.ativos.forEach((a) => {
        const parte = v.base > 0 ? v.valorBRL * ((Number(a.valorBRL) || 0) / v.base) : 0;
        const x = mapa.get(a.id) || { id: a.id, nome: a.nome, valorBRL: a.valorBRL, comprometido: 0, metas: [] };
        x.comprometido += parte;
        if (!x.metas.includes(m.nome)) x.metas.push(m.nome);
        mapa.set(a.id, x);
      });
    });
  });
  return [...mapa.values()].map((x) => ({ ...x, comprometido: r2(x.comprometido), fracao: x.valorBRL > 0 ? x.comprometido / x.valorBRL : 0 }))
    .filter((x) => x.fracao > 1.005);
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
 * destino. O alvo em cada moeda leva a margem; o que já está em "Saldo em
 * conta" naquela moeda abate dela; o resto vira reais pelo câmbio do dia.
 * Itens fixos (passagens, hospedagem): valor x sua parte, parcelados a
 * partir do mês de início (pagas = meses desde o início, ou "já pago").
 */
export function calcularViagem(meta, { cambio = {}, hoje } = {}) {
  const esp = (meta && meta.especificos) || {};
  const margem = num(esp.margem) ?? 0;
  const destinos = (esp.destinos || []).map((d) => {
    const g = d.gastos || {};
    const diaria = ['alimentacao', 'transporte', 'passeios', 'compras', 'outros'].reduce((s, k) => s + (num(g[k]) || 0), 0);
    const totalMoeda = r2(diaria * (num(d.dias) || 0) + (num(d.extras) || 0));
    const cot = cotacao(d.moeda || 'BRL', cambio);
    return { ...d, diaria: r2(diaria), totalMoeda, totalBRL: cot == null ? null : r2(totalMoeda * cot), cotacao: cot };
  });
  const porMoeda = {};
  destinos.forEach((d) => {
    const m = d.moeda || 'BRL';
    const x = porMoeda[m] || (porMoeda[m] = { moeda: m, total: 0, dias: 0, destinos: [] });
    x.total += d.totalMoeda; x.dias += num(d.dias) || 0; x.destinos.push(d.cidade || d.pais);
  });
  const saldos = (meta.vinculos || []).filter((v) => v.tipo === 'saldo');
  Object.values(porMoeda).forEach((x) => {
    x.total = r2(x.total);
    x.comMargem = r2(x.total * (1 + margem));
    x.guardado = r2(saldos.filter((v) => (v.moeda || 'BRL') === x.moeda).reduce((s, v) => s + (Number(v.saldo) || 0), 0));
    x.falta = r2(Math.max(0, x.comMargem - x.guardado));
    x.cotacao = cotacao(x.moeda, cambio);
    x.comMargemBRL = x.cotacao == null ? null : r2(x.comMargem * x.cotacao);
    x.faltaBRL = x.cotacao == null ? null : r2(x.falta * x.cotacao);
  });
  const semCambio = Object.values(porMoeda).filter((x) => x.cotacao == null).map((x) => x.moeda);
  const gastoBRL = r2(Object.values(porMoeda).reduce((s, x) => s + (x.comMargemBRL || 0), 0));
  const mesHoje = mesDe(hoje || new Date());
  const fixos = (esp.fixos || []).map((f) => {
    const parte = num(f.parte) ?? 1;
    const cot = cotacao(f.moeda || 'BRL', cambio);
    const total = (num(f.valor) || 0) * parte;
    const parcelas = Math.max(1, num(f.parcelas) || 1);
    const pagas = f.pago ? parcelas : (f.inicio ? parcelasPagas({ totalParcelas: parcelas, inicio: f.inicio }, mesHoje) : 0);
    const totalBRL = cot == null ? null : r2(total * cot);
    const parcelaBRL = totalBRL == null ? null : r2(totalBRL / parcelas);
    return { ...f, parte, totalMoeda: r2(total), totalBRL, parcelas, pagas, parcelaBRL, pagoBRL: totalBRL == null ? 0 : r2((totalBRL * pagas) / parcelas), ativa: pagas < parcelas && !!f.inicio, fim: f.inicio ? somarMeses(f.inicio, parcelas - 1) : null };
  });
  fixos.filter((f) => f.totalBRL == null).forEach((f) => { if (!semCambio.includes(f.moeda)) semCambio.push(f.moeda); });
  const fixosTotalBRL = r2(fixos.reduce((s, f) => s + (f.totalBRL || 0), 0));
  const fixosPagoBRL = r2(fixos.reduce((s, f) => s + f.pagoBRL, 0));
  const parcelaMensal = r2(fixos.filter((f) => f.ativa).reduce((s, f) => s + (f.parcelaBRL || 0), 0));
  const dias = destinos.reduce((s, d) => s + (num(d.dias) || 0), 0);
  return {
    margem, destinos, porMoeda, gastoBRL, fixos, fixosTotalBRL, fixosPagoBRL, parcelaMensal, dias, semCambio,
    temDestinos: destinos.length > 0, temFixos: fixos.length > 0,
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
  const viagem = ehViagem && ((esp.destinos || []).length || (esp.fixos || []).length) ? calcularViagem(meta, { cambio, hoje }) : null;
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
  } else if (viagem && viagem.temDestinos) {
    alvoBRL = r2(viagem.gastoBRL + itens.reduce((s, it) => s + (it.valorBRL || 0), 0));
    alvoMoeda = moeda === 'BRL' ? alvoBRL : (cotacao(moeda, cambio) ? alvoBRL / cotacao(moeda, cambio) : null);
    Object.values(viagem.porMoeda).forEach((x) => partes.push({ rotulo: `Gasto lá em ${x.moeda} (${x.dias} dias${viagem.margem ? ` + ${Math.round(viagem.margem * 100)}% de margem` : ''})`, valor: x.comMargemBRL, moeda: x.moeda, valorMoeda: x.comMargem }));
    if (itens.length) partes.push({ rotulo: `Soma dos ${itens.length} sub-itens`, valor: r2(itens.reduce((s, it) => s + (it.valorBRL || 0), 0)) });
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

  // --- conta mensal (passagens/hospedagem parceladas) ---
  let conta = null;
  if (meta.contaMensal && num(meta.contaMensal.valor) > 0) {
    const total = num(meta.contaMensal.meses) || 1;
    const pagas = parcelasPagas({ totalParcelas: total, inicio: meta.contaMensal.inicio || hoje }, ctx.hoje || hoje);
    conta = {
      ...meta.contaMensal, total, pagas, restantes: total - pagas,
      valorTotal: r2(num(meta.contaMensal.valor) * total), valorPago: r2(num(meta.contaMensal.valor) * pagas),
      ativa: pagas < total,
    };
  }

  // --- já tenho ---
  const vinc = resolverVinculos(meta.vinculos, ctx.ativos, cambio);
  vinc.itens.filter((v) => v.semCambio).forEach((v) => avisos.push(`sem câmbio de ${v.moeda} pro saldo em ${v.instituicao}`));
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
    ir: r2(vinc.itens.reduce((s, v) => s + v.ativos.reduce((t, a) => t + (a.irResgate ? (Number(a.irResgate.ir) || 0) * (v.base > 0 ? v.valorBRL / v.base : 0) : 0), 0), 0)),
    iof: r2(vinc.itens.reduce((s, v) => s + v.ativos.reduce((t, a) => t + (a.irResgate ? (Number(a.irResgate.iof) || 0) * (v.base > 0 ? v.valorBRL / v.base : 0) : 0), 0), 0)),
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
          const parte = v.base > 0 ? v.valorBRL / v.base : 0; // mesma fração do vínculo
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
  const totalExtra = (conta ? conta.valorTotal : 0) + (viagem ? viagem.fixosTotalBRL : 0);
  const pagoExtra = (conta ? conta.valorPago : 0) + (viagem ? viagem.fixosPagoBRL : 0);
  const total = alvoBRL != null ? alvoBRL + totalExtra : (viagem && viagem.temFixos ? totalExtra : null);
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
  let necessario = null;
  if (recorrente) necessario = recorrente.restantes > 0 ? recorrente.parcela : 0;
  else if (alvoBRL != null && mesesRestantes != null) necessario = r2(aporteNecessario({ alvo: alvoBRL, atual: atualRitmo, meses: mesesRestantes, taxa }));
  const parcelasCorrendo = (conta && conta.ativa ? num(conta.valor) : 0) + (viagem ? viagem.parcelaMensal : 0);
  const necessarioTotal = necessario != null ? r2(necessario + parcelasCorrendo) : (parcelasCorrendo ? r2(parcelasCorrendo) : null);

  // prazo estimado no ritmo atual
  let mesesEstimados = null;
  if (recorrente) mesesEstimados = recorrente.restantes;
  else if (alvoBRL != null) mesesEstimados = prazoParaAlvo({ alvo: alvoBRL, atual: atualRitmo, aporte: aporteAtual, taxa });
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

  return {
    id: meta.id, alvoMoeda: alvoMoeda != null ? r2(alvoMoeda) : null, moeda, alvoBRL: alvoBRL != null ? r2(alvoBRL) : null,
    cotacao: cotacao(moeda, cambio), atualBRL, valorVinculado: vinc.total, valorInicial, itensConcluidosBRL: r2(itensConcluidosBRL),
    falta, faltaMoeda: falta != null && cotacao(moeda, cambio) ? r2(falta / cotacao(moeda, cambio)) : null,
    percentual, percentualBruto, dataAlvo, mesesRestantes, taxa, aporteAtual, aporteNecessario: necessario, aporteNecessarioTotal: necessarioTotal,
    mesesEstimados, dataEstimada, status, vinculos: vinc.itens, itens, conta, recorrente, renda, partes, avisos,
    // 03/10/2026 (v2)
    atualLiquidoBRL, faltaLiquida: alvoBRL != null ? Math.max(0, r2(alvoBRL - atualLiquidoBRL)) : null, liquido, atualRitmo, aporteReal, aporteInformado: aporteInformado || null, aporteOrigem,
    aporte3m: hist && num(hist.aporte3m) != null ? r2(num(hist.aporte3m)) : null, mesesBaseAporte: hist ? hist.mesesBase || 0 : 0,
    viagem, aposentadoria, total: total != null ? r2(total) : null, ja: r2(ja), parcelasCorrendo: r2(parcelasCorrendo),
  };
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
  if (meses != null) n = meses; // 03/10/2026: o gráfico escolhe o horizonte (filtro de período)
  n = Math.min(maxMeses, Math.max(1, n));
  const necessario = calc.aporteNecessario != null ? calc.aporteNecessario : null;
  const base = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL; // reserva: o líquido
  const pontos = [];
  for (let i = 0; i <= n; i++) {
    pontos.push({
      mes: somarMeses(inicio, i),
      ritmo: r2(valorFuturo({ atual: base, aporte: calc.aporteAtual, meses: i, taxa: calc.taxa })),
      necessaria: necessario == null ? null : r2(valorFuturo({ atual: base, aporte: necessario, meses: i, taxa: calc.taxa })),
    });
  }
  return pontos;
}

/** Totais do topo da lista (só metas ativas, alvo conhecido). */
export function resumoMetas(calculos) {
  const ativos = calculos.filter((c) => c && c.alvoBRL != null);
  return {
    quantidade: calculos.length,
    alvo: r2(ativos.reduce((s, c) => s + c.alvoBRL, 0)),
    atual: r2(ativos.reduce((s, c) => s + Math.min(c.atualBRL, c.alvoBRL), 0)),
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
    base.especificos = { meses: num(rs.meses) || 6, margem: num(rs.sobra) ?? 0.1, usarDespesasPlanilha: true, despesaMensal: null };
    base.vinculos = [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }];
  }
  if (tipo === 'viagemInternacional') {
    // 03/10/2026: por destinos + itens fixos (substitui a "conta mensal" única)
    base.moeda = 'EUR'; base.rendimentoAnual = 0.1;
    base.especificos = { destino: '', dataViagem: null, margem: 0.1, destinos: [], fixos: [] };
  }
  if (tipo === 'viagemNacional') { base.contaMensal = { descricao: 'Passagens e hospedagem', valor: null, meses: 6, inicio: mes }; }
  if (tipo === 'casa') { base.especificos = { valorImovel: null, entradaPct: 0.2, custosPct: 0.05 }; base.dataAlvo = somarMeses(mes, 60); base.rendimentoAnual = 0.1; }
  if (tipo === 'carro') { base.especificos = { valorCarro: null, entradaPct: 1 }; base.dataAlvo = somarMeses(mes, 24); }
  if (tipo === 'aposentadoria') {
    // 03/10/2026: a conta da planilha (Distribuição e Metas K17:N19), editável
    const pat = referencias.patrimonio || {};
    base.especificos = {
      modoAlvo: 'calculado', usarDespesasPlanilha: true, despesaMensal: null,
      extra: num(pat.extra) ?? 4000, reinvestimento: num(pat.reinvestimento) ?? 0.25,
      rendaDesejada: null, taxaRetirada: num(pat.rendimento) || 0.04, anoNascimento: null,
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
    out.push({ meta: m, porque: referencias.reserva && referencias.reserva.custoDeVida ? `${m.especificos.meses} meses do seu custo de vida, com os títulos marcados Renda Emergencial` : 'Meses x custo de vida, com os títulos marcados Renda Emergencial' });
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
const moedaTxt = (v) => (typeof v === 'number' && Number.isFinite(v) ? `R$ ${Math.round(v).toLocaleString('pt-BR')}` : '—');

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
    const aporte = f === 1 && origem === 'ritmo' ? r2(calc.aporteAtual || 0) : r2(aporteNecessario({ alvo: calc.alvoBRL, atual, meses, taxa: calc.taxa || 0 }) || 0);
    return { fracao: f, meses, data: somarMeses(mes, meses), aporte, aMais: r2(aporte - (calc.aporteAtual || 0)) };
  });
  return { origem, baseMeses, cenarios };
}

function mesesAte(calc, { atual, aporte, taxa }) {
  return prazoParaAlvo({ alvo: calc.alvoBRL, atual, aporte, taxa });
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
  if (e1) dicas.push({ id: 'aporte', texto: `Aportar ${moedaTxt(extraMes)} a mais por mês (${moedaTxt(aporte + extraMes)}) ${e1.texto}.`, mesesAMenos: e1.mesesAMenos });
  const unico = arred(Math.max(1000, aporte), 500);
  const e2 = efeito(mesesAte(calc, { atual: atual + unico, aporte, taxa }));
  if (e2) dicas.push({ id: 'unico', texto: `Um aporte extra de ${moedaTxt(unico)} agora (13º, restituição do IR, bônus) ${e2.texto}.`, mesesAMenos: e2.mesesAMenos });
  const rend = num(meta.rendimentoAnual) || 0;
  const e3 = efeito(mesesAte(calc, { atual, aporte, taxa: taxaMensal(rend + 0.01) }));
  if (e3 && meta.tipo !== 'reservaEmergencia') dicas.push({ id: 'rendimento', texto: `Render 1 ponto percentual a mais ao ano (${(Math.round((rend + 0.01) * 1000) / 10).toLocaleString('pt-BR')}% em vez de ${(Math.round(rend * 1000) / 10).toLocaleString('pt-BR')}%) - ex. tirar dinheiro parado da conta - ${e3.texto}.`, mesesAMenos: e3.mesesAMenos });
  if (meta.tipo === 'rendaPassiva' && calc.renda && calc.renda.atual > 0) {
    const e4 = efeito(mesesAte(calc, { atual, aporte: aporte + calc.renda.atual, taxa }));
    if (e4) dicas.push({ id: 'reinvestir', texto: `Reinvestir todos os proventos (${moedaTxt(calc.renda.atual)}/mês hoje) somados ao aporte ${e4.texto} - a renda cresce sozinha (efeito bola de neve).`, mesesAMenos: e4.mesesAMenos });
  }
  if (calc.viagem) {
    Object.values(calc.viagem.porMoeda).filter((x) => x.moeda !== 'BRL' && x.faltaBRL > 0).forEach((x) => {
      dicas.push({ id: `cambio-${x.moeda}`, texto: `Faltam ${x.falta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} ${x.moeda}: cada 1% de alta do ${x.moeda} encarece a viagem em ${moedaTxt(x.faltaBRL * 0.01)}. Comprar um pouco por mês (preço médio) dilui esse risco.`, mesesAMenos: 0 });
    });
  }
  if (meta.tipo === 'reservaEmergencia' && calc.liquido && calc.liquido.impostoBRL > 0) {
    dicas.push({ id: 'imposto', texto: `${moedaTxt(calc.liquido.impostoBRL)} da reserva iriam para IR/IOF num resgate hoje. O IR cai com o tempo (15% depois de 2 anos): numa emergência, resgate primeiro os títulos mais antigos.`, mesesAMenos: 0 });
  }
  return dicas.sort((a, b) => (b.mesesAMenos || 0) - (a.mesesAMenos || 0));
}

/**
 * Marcos da projeção (Tiago: "mostre em destaque na projeção quando chegarei
 * ao primeiro milhão, segundo milhão, terceiro, etc., até o valor da meta"):
 * cada milhão (alvo >= R$ 1,5 mi) ou cada quarto do alvo, mais o próprio
 * alvo. [{ valor, rotulo, meses, mes, ano, idade, ja }] (meses null = não chega em maxMeses).
 */
export function marcosProjecao(calc, { hoje, aporte = null, maxMeses = 720, anoNascimento = null } = {}) {
  if (!calc || !(calc.alvoBRL > 0)) return [];
  const alvo = calc.alvoBRL;
  const atual = calc.atualRitmo != null ? calc.atualRitmo : calc.atualBRL;
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
    const n = prazoParaAlvo({ alvo: v, atual, aporte: ap, taxa: calc.taxa || 0 });
    if (!Number.isFinite(n) || n > maxMeses) return { valor: v, rotulo, meses: null, mes: null, ano: null, idade: null, ja: false };
    const m = somarMeses(mes, Math.ceil(n));
    const ano = Number(m.slice(0, 4));
    return { valor: v, rotulo, meses: Math.ceil(n), mes: m, ano, idade: anoNascimento ? ano - anoNascimento : null, ja: false };
  });
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
  const m0 = prazoParaAlvo({ alvo: calc.alvoBRL, atual, aporte: calc.aporteAtual || 0, taxa: calc.taxa || 0 });
  return reducoes.map((r) => {
    const montante = r2(calc.alvoBRL * (1 - r));
    const n = prazoParaAlvo({ alvo: montante, atual, aporte: calc.aporteAtual || 0, taxa: calc.taxa || 0 });
    return {
      reducao: r, renda: renda != null ? r2(renda * (1 - r)) : null, montante, economia: r2(calc.alvoBRL - montante),
      aporteNecessario: calc.mesesRestantes != null ? r2(aporteNecessario({ alvo: montante, atual, meses: Math.max(0, calc.mesesRestantes), taxa: calc.taxa || 0 }) || 0) : null,
      data: Number.isFinite(n) ? somarMeses(mes, Math.ceil(n)) : null,
      mesesAMenos: Number.isFinite(n) && Number.isFinite(m0) ? Math.ceil(m0) - Math.ceil(n) : null,
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

const pctTxt = (f, casas = 1) => `${f >= 0 ? '+' : '−'}${Math.abs(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
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
    texto: `De ${rotuloMes(a.mes)} a ${rotuloMes(b.mes)} a meta foi de ${moedaTxt(a.valor)} para ${moedaTxt(b.valor)} (${delta >= 0 ? '+' : '−'}${moedaTxt(Math.abs(delta))}): ${moedaTxt(aportes)} vieram de aportes e ${ganho >= 0 ? '+' : '−'}${moedaTxt(Math.abs(ganho))} de rendimento/valorização.`,
    resumo: `${delta >= 0 ? '+' : '−'}${moedaTxt(Math.abs(delta))} no período (${moedaTxt(aportes)} de aportes)`,
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
    let texto = `Aporte médio de ${moedaTxt(media)}/mês no período`;
    if (corpo.length > 4) texto += `; nos últimos 3 meses, ${moedaTxt(media3)}/mês (${media3 >= media * 1.1 ? 'acelerando' : media3 <= media * 0.9 ? 'desacelerando' : 'estável'})`;
    texto += sem ? `. ${sem} de ${corpo.length} meses sem aporte.` : '. Aportou em todos os meses.';
    let tom = 'neutro';
    if (calc && calc.aporteNecessario > 0) {
      const cobre = media / calc.aporteNecessario;
      texto += ` O necessário até o prazo é ${moedaTxt(calc.aporteNecessario)}/mês: a média do período cobre ${Math.round(cobre * 100)}%.`;
      tom = cobre >= 1 ? 'bom' : 'atencao';
    }
    pontos.push({ tipo: 'aportes', tom, peso: 65, texto, resumo: `aporte médio ${moedaTxt(media)}/mês` });
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
    let texto = `No seu ritmo (${moedaTxt(calc.aporteAtual)}/mês${calc.aporteOrigem === 'historico' ? ', o aporte real dos últimos 12 meses' : ''}) você chega no alvo em ${rotuloMes(chega)} (${rotuloDuracao(calc.mesesEstimados)})`;
    let tom = 'neutro';
    if (calc.mesesRestantes != null) {
      const dif = Math.ceil(calc.mesesEstimados) - calc.mesesRestantes;
      texto += dif <= 0 ? ` - ${rotuloDuracao(-dif)} antes do prazo.` : ` - ${rotuloDuracao(dif)} depois do prazo (${rotuloMes(calc.dataAlvo)}).`;
      tom = dif <= 0 ? 'bom' : 'atencao';
    } else texto += '.';
    out.push({ tipo: 'ritmo', tom, peso: 80, texto, resumo: `no ritmo: ${rotuloMes(chega)}` });
  } else if (calc.atualRitmo < calc.alvoBRL) {
    out.push({ tipo: 'ritmo', tom: 'atencao', peso: 80, texto: 'No ritmo de hoje (sem aporte e sem rendimento suficiente) a meta não chega no alvo - informe um aporte ou vincule os investimentos.', resumo: 'sem ritmo pra chegar' });
  }
  if (calc.aporteNecessario > 0 && calc.mesesRestantes > 0) {
    const n = calc.mesesRestantes;
    const aportes = calc.aporteNecessario * n;
    const rend = Math.max(0, calc.alvoBRL - (calc.atualRitmo || 0) - aportes);
    const gap = calc.aporteNecessario - (calc.aporteAtual || 0);
    out.push({
      tipo: 'composicao', tom: gap > 0.5 ? 'atencao' : 'bom', peso: 70,
      texto: `Para fechar em ${rotuloMes(calc.dataAlvo)}: ${moedaTxt(calc.aporteNecessario)}/mês${gap > 0.5 ? ` (${moedaTxt(gap)} a mais que hoje)` : ' (você já aporta isso)'}. Desse caminho, ${moedaTxt(aportes)} seriam aportes e ${moedaTxt(rend)} rendimento (${Math.round((rend / Math.max(1, calc.alvoBRL - (calc.atualRitmo || 0))) * 100)}% do que falta).`,
      resumo: gap > 0.5 ? `faltam ${moedaTxt(gap)}/mês pro prazo` : 'aporte cobre o prazo',
    });
  }
  const proximos = (marcos || []).filter((m) => !m.ja && m.mes);
  if (proximos.length) {
    out.push({ tipo: 'marcos', tom: 'neutro', peso: 55, texto: `Marcos no seu ritmo: ${proximos.slice(0, 4).map((m) => `${m.rotulo} em ${rotuloMes(m.mes)}${m.idade ? ` (${m.idade} anos)` : ''}`).join('; ')}.`, resumo: `${proximos[0].rotulo} em ${proximos[0].ano}` });
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
    texto: `Média dos últimos ${ult12.length} meses: ${moedaTxt(media12)}/mês${alvo ? ` - ${Math.round((media12 / alvo) * 100)}% da meta de ${moedaTxt(alvo)}/mês` : ''}.`,
    resumo: `média ${moedaTxt(media12)}/mês`,
  });
  const ant = fechados.slice(-24, -12);
  if (ant.length >= 6) {
    const mediaAnt = ant.reduce((s, x) => s + x.valor, 0) / ant.length;
    if (mediaAnt > 0) {
      const cresc = media12 / mediaAnt - 1;
      out.push({ tipo: 'crescimento', tom: cresc >= 0 ? 'bom' : 'atencao', peso: 65, texto: `A renda média dos últimos 12 meses ${cresc >= 0 ? 'cresceu' : 'caiu'} ${pctTxt(cresc).replace(/^[+−]/, '')} em relação aos 12 anteriores (${moedaTxt(mediaAnt)}/mês).`, resumo: `${pctTxt(cresc)} em 12 meses` });
    }
  }
  const melhor = ult12.reduce((m, x) => (x.valor > m.valor ? x : m), ult12[0]);
  const pior = ult12.reduce((m, x) => (x.valor < m.valor ? x : m), ult12[0]);
  if (melhor.valor > 0) out.push({ tipo: 'variacao', tom: 'neutro', peso: 45, texto: `Melhor mês: ${rotuloMes(melhor.mes)} (${moedaTxt(melhor.valor)}); mais fraco: ${rotuloMes(pior.mes)} (${moedaTxt(pior.valor)}) - ações pagam concentrado em alguns meses, FIIs todo mês.`, resumo: '' });
  const ult3 = fechados.slice(-3);
  if (fechados.length >= 6) {
    const m3 = ult3.reduce((s, x) => s + x.valor, 0) / ult3.length;
    const t = m3 / media12 - 1;
    if (Math.abs(t) >= 0.1) out.push({ tipo: 'tendencia', tom: t > 0 ? 'bom' : 'atencao', peso: 55, texto: `Últimos 3 meses: ${moedaTxt(m3)}/mês, ${pctTxt(t).replace(/^[+−]/, '')} ${t > 0 ? 'acima' : 'abaixo'} da média de 12 meses.`, resumo: `${t > 0 ? 'acelerando' : 'mais fraca'} nos últimos 3 meses` });
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
export function destinoPadrao({ pais = '', cidade = '', moeda = 'EUR', dias = 3 } = {}) {
  return { id: Math.random().toString(36).slice(2, 10), pais, cidade, moeda, dias, gastos: { alimentacao: null, transporte: null, passeios: null, compras: null, outros: null }, extras: null };
}

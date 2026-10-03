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
 */

/** Tipos de meta. `grupo` organiza a escolha no 1º passo da criação. */
export const TIPOS_META = {
  rendaPassiva: { nome: 'Renda passiva', icone: 'renda', cor: 'fiis', grupo: 'patrimonio', resumo: 'Proventos por mês e o patrimônio que gera essa renda', dicas: ['Vincule as classes que pagam proventos (FIIs, ações) - a renda atual é a média dos últimos 12 meses fechados delas.', 'O patrimônio necessário é a renda anual dividida pelo rendimento (dividend yield) esperado.'] },
  reservaEmergencia: { nome: 'Reserva de emergência', icone: 'escudo', cor: 'rf', grupo: 'patrimonio', resumo: 'Manter o saldo ideal: meses x custo de vida', dicas: ['O custo de vida vem das suas Despesas essenciais (Organização Financeira) - mudou lá, muda aqui.', 'Os títulos marcados "Renda Emergencial" na Carteira Renda Fixa já entram sozinhos.'] },
  aposentadoria: { nome: 'Aposentadoria', icone: 'ampulheta', cor: 'usa', grupo: 'patrimonio', resumo: 'Montante final pra viver de renda', dicas: ['Regra dos 4%: o montante que paga a renda desejada é renda anual / 4%.', 'Use rendimento real (acima da inflação) no simulador pra ver o valor de hoje.'] },
  viagemInternacional: { nome: 'Viagem internacional', icone: 'aviao', cor: 'acoes', grupo: 'objetivo', resumo: 'Dinheiro em outra moeda + conta mensal de passagens/hospedagem', dicas: ['Separe em sub-itens: comida, compras, transporte - cada um na moeda do destino.', 'Passagens e hospedagem parceladas entram como "conta mensal".'] },
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
  concluida: { rotulo: 'Concluída', classe: 'good' },
  'no-ritmo': { rotulo: 'No ritmo', classe: 'good' },
  atrasada: { rotulo: 'Atrasada', classe: 'bad' },
  vencida: { rotulo: 'Prazo passou', classe: 'bad' },
  'sem-prazo': { rotulo: 'Sem prazo', classe: 'na' },
  'saldo-ideal': { rotulo: 'Saldo ideal', classe: 'good' },
  abaixo: { rotulo: 'Abaixo do ideal', classe: 'warn' },
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
 * classe inteira (`classe`: acoes|fiis|usa|rf) ou a marca da Renda Fixa
 * (`marca`: emergencial|longo-prazo); modo total, fração (0-1) ou valor fixo
 * em reais (limitado ao que o ativo vale).
 */
export function resolverVinculos(vinculos, ativos) {
  const lista = ativos || [];
  let total = 0;
  const itens = (vinculos || []).map((v) => {
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
    return { ...v, base: r2(base), valorBRL: valor, ativos: alvo, encontrado: alvo.length > 0 };
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
 * ctx: { ativos, cambio, referencias, proventos12m: { porTicker }, hoje: 'aaaa-mm-dd' }
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

  // --- alvo (na moeda da meta e em reais) ---
  let alvoMoeda = num(meta.valorAlvo);
  let alvoBRL = null;
  const itens = (meta.itens || []).map((it) => {
    const brl = paraBRL(it.valor, it.moeda || moeda, cambio);
    if (brl == null) avisos.push(`sem câmbio de ${it.moeda} pro item "${it.nome}"`);
    return { ...it, valorBRL: brl == null ? null : r2(brl) };
  });
  const itensConcluidosBRL = itens.filter((it) => it.concluido).reduce((s, it) => s + (it.valorBRL || 0), 0);

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
  } else if (meta.tipo === 'aposentadoria' && !(alvoMoeda > 0) && num(esp.rendaDesejada) > 0) {
    const tr = num(esp.taxaRetirada) || 0.04;
    alvoMoeda = (num(esp.rendaDesejada) * 12) / tr;
    alvoBRL = paraBRL(alvoMoeda, moeda, cambio);
    partes.push({ rotulo: 'Renda desejada', valor: num(esp.rendaDesejada) }, { rotulo: 'Taxa de retirada ao ano', valor: tr, tipo: '%' });
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
  const vinc = resolverVinculos(meta.vinculos, ctx.ativos);
  const valorInicial = num(meta.valorInicial) || 0;
  let atualBRL = r2(vinc.total + valorInicial + itensConcluidosBRL);

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

  // --- progresso, prazo e ritmo ---
  const total = alvoBRL != null ? alvoBRL + (conta ? conta.valorTotal : 0) : null;
  const ja = atualBRL + (conta ? conta.valorPago : 0);
  const falta = alvoBRL != null ? Math.max(0, r2(alvoBRL - atualBRL)) : null;
  let percentual = total > 0 ? Math.min(1, ja / total) : null;
  if (renda && renda.percentual != null) percentual = Math.min(1, renda.percentual);

  const aporteAtual = num(meta.aporteMensal) || 0;
  const dataAlvo = meta.tipo === 'reservaEmergencia' ? null : (meta.dataAlvo || (recorrente && recorrente.fim) || null);
  const mesesRestantes = dataAlvo ? mesesEntre(hoje, dataAlvo) : null;
  let necessario = null;
  if (recorrente) necessario = recorrente.restantes > 0 ? recorrente.parcela : 0;
  else if (alvoBRL != null && mesesRestantes != null) necessario = r2(aporteNecessario({ alvo: alvoBRL, atual: atualBRL, meses: mesesRestantes, taxa }));
  const necessarioTotal = necessario != null ? r2(necessario + (conta && conta.ativa ? num(conta.valor) : 0)) : (conta && conta.ativa ? num(conta.valor) : null);

  // prazo estimado no ritmo atual
  let mesesEstimados = null;
  if (recorrente) mesesEstimados = recorrente.restantes;
  else if (alvoBRL != null) mesesEstimados = prazoParaAlvo({ alvo: alvoBRL, atual: atualBRL, aporte: aporteAtual, taxa });
  const dataEstimada = mesesEstimados != null && Number.isFinite(mesesEstimados) ? somarMeses(hoje, Math.ceil(mesesEstimados)) : null;

  let status;
  if (meta.tipo === 'reservaEmergencia') status = alvoBRL != null && atualBRL >= alvoBRL - 0.5 ? 'saldo-ideal' : 'abaixo';
  else if (meta.tipo === 'rendaPassiva' && renda && renda.alvo > 0 && renda.atual >= renda.alvo) status = 'concluida';
  else if (meta.tipo !== 'rendaPassiva' && total > 0 && ja >= total - 0.5) status = 'concluida';
  else if (!dataAlvo) status = 'sem-prazo';
  else if (mesesRestantes < 0 || (mesesRestantes === 0 && falta > 0)) status = 'vencida';
  else if (recorrente) status = 'no-ritmo';
  else status = aporteAtual + 0.5 >= (necessario || 0) ? 'no-ritmo' : 'atrasada';

  return {
    id: meta.id, alvoMoeda: alvoMoeda != null ? r2(alvoMoeda) : null, moeda, alvoBRL: alvoBRL != null ? r2(alvoBRL) : null,
    cotacao: cotacao(moeda, cambio), atualBRL, valorVinculado: vinc.total, valorInicial, itensConcluidosBRL: r2(itensConcluidosBRL),
    falta, faltaMoeda: falta != null && cotacao(moeda, cambio) ? r2(falta / cotacao(moeda, cambio)) : null,
    percentual, dataAlvo, mesesRestantes, taxa, aporteAtual, aporteNecessario: necessario, aporteNecessarioTotal: necessarioTotal,
    mesesEstimados, dataEstimada, status, vinculos: vinc.itens, itens, conta, recorrente, renda, partes, avisos,
  };
}

/**
 * Pontos mês a mês (de hoje até a data alvo, ou até o prazo estimado) das 2
 * curvas do gráfico: "no seu ritmo" (aporte atual) e "necessária" (aporte que
 * fecha na data). [{ mes, ritmo, necessaria }]
 */
export function serieProjecao(calc, { maxMeses = 360, hoje } = {}) {
  if (!calc || calc.alvoBRL == null) return [];
  const inicio = mesDe(hoje || new Date());
  let n = calc.mesesRestantes != null && calc.mesesRestantes > 0 ? calc.mesesRestantes : (Number.isFinite(calc.mesesEstimados) && calc.mesesEstimados > 0 ? Math.ceil(calc.mesesEstimados) : 12);
  n = Math.min(maxMeses, Math.max(1, n));
  const necessario = calc.aporteNecessario != null ? calc.aporteNecessario : null;
  const pontos = [];
  for (let i = 0; i <= n; i++) {
    pontos.push({
      mes: somarMeses(inicio, i),
      ritmo: r2(valorFuturo({ atual: calc.atualBRL, aporte: calc.aporteAtual, meses: i, taxa: calc.taxa })),
      necessaria: necessario == null ? null : r2(valorFuturo({ atual: calc.atualBRL, aporte: necessario, meses: i, taxa: calc.taxa })),
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
    atrasadas: calculos.filter((c) => c && ['atrasada', 'vencida', 'abaixo'].includes(c.status)).length,
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
  if (tipo === 'viagemInternacional') { base.moeda = 'EUR'; base.contaMensal = { descricao: 'Passagens e hospedagem', valor: null, meses: 10, inicio: mes }; base.rendimentoAnual = 0.1; }
  if (tipo === 'viagemNacional') { base.contaMensal = { descricao: 'Passagens e hospedagem', valor: null, meses: 6, inicio: mes }; }
  if (tipo === 'casa') { base.especificos = { valorImovel: null, entradaPct: 0.2, custosPct: 0.05 }; base.dataAlvo = somarMeses(mes, 60); base.rendimentoAnual = 0.1; }
  if (tipo === 'carro') { base.especificos = { valorCarro: null, entradaPct: 1 }; base.dataAlvo = somarMeses(mes, 24); }
  if (tipo === 'aposentadoria') { base.especificos = { rendaDesejada: null, taxaRetirada: 0.04 }; base.dataAlvo = somarMeses(mes, 300); base.rendimentoAnual = 0.06; }
  return base;
}

/**
 * Sugestões pro estado vazio (1 clique cria). Usa o que a planilha já sabe:
 * custo de vida e meses da reserva, meta de renda passiva da Distribuição e Metas.
 */
export function sugestoesMetas({ referencias = {}, hoje, existentes = [] } = {}) {
  const tem = (tipo) => existentes.some((m) => m.tipo === tipo && m.status !== 'arquivada');
  const out = [];
  if (!tem('reservaEmergencia')) {
    const m = metaPadrao('reservaEmergencia', { referencias, hoje });
    m.nome = 'Reserva de emergência';
    out.push({ meta: m, porque: referencias.reserva && referencias.reserva.custoDeVida ? `${m.especificos.meses} meses do seu custo de vida, com os títulos marcados Renda Emergencial` : 'Meses x custo de vida, com os títulos marcados Renda Emergencial' });
  }
  if (!tem('rendaPassiva')) {
    const m = metaPadrao('rendaPassiva', { referencias, hoje });
    m.nome = 'Renda passiva';
    if (!m.especificos.rendaMensal) m.especificos.rendaMensal = 1000;
    out.push({ meta: m, porque: 'A meta mensal da planilha (aba Distribuição e Metas), medida pelos proventos de FIIs e ações' });
  }
  const viagem = metaPadrao('viagemInternacional', { referencias, hoje });
  viagem.nome = 'Viagem pra Europa';
  viagem.valorAlvo = 5000;
  viagem.contaMensal = null;
  out.push({ meta: viagem, porque: '€ 5.000 em 12 meses - edite destino, data e sub-itens depois' });
  if (!tem('aposentadoria')) {
    const m = metaPadrao('aposentadoria', { referencias, hoje });
    m.nome = 'Aposentadoria';
    m.especificos.rendaDesejada = num(referencias.patrimonio && referencias.patrimonio.desejado) ? null : 10000;
    if (num(referencias.patrimonio && referencias.patrimonio.desejado)) m.valorAlvo = num(referencias.patrimonio.desejado);
    m.vinculos = [{ tipo: 'marca', marca: 'longo-prazo', modo: 'total' }, { tipo: 'classe', classe: 'fiis', modo: 'total' }, { tipo: 'classe', classe: 'acoes', modo: 'total' }, { tipo: 'classe', classe: 'usa', modo: 'total' }];
    out.push({ meta: m, porque: 'O patrimônio desejado da planilha (aba Distribuição e Metas), com a carteira de longo prazo' });
  }
  return out;
}

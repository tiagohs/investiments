/**
 * metas-calc-nucleo.js - 06/10/2026 (A-42/A-76): núcleo leve do cálculo de Metas (tipos, status, datas em mês, moeda e o veredito de um ativo
 * para uma meta). É só o que o motor de critérios (Ativo/Transações) precisa - antes ele importava metas-calc.js inteiro
 * (~135 KB). metas-calc.js reexporta tudo (compatibilidade).
 */

import { formatMesAno } from '../format.js';

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
  // 06/10/2026: os objetivos da carteira (Acompanhamento de Ativos) viraram uma meta - pesos por grupo, sem alvo em R$ nem prazo (pages/metas-distribuicao.js)
  distribuicaoCarteira: { nome: 'Distribuição da carteira', icone: 'alvo', cor: 'acoes', grupo: 'patrimonio', resumo: 'Quanto ter em Ações, FIIs e Renda Fixa (e dentro de cada um) e o aporte que falta pra chegar lá', dicas: ['Cada grupo precisa somar 100%: Ações / FIIs / Renda Fixa; Nacionais / Internacionais; Tijolo / Híbrido / Papel; Renda Emergencial / Renda Fixa.', 'O site manda: ao salvar, os % também vão pra planilha (as fórmulas dela usam esses valores).'] },
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

/**
 * 06/10/2026 (Tiago, Metas: "Cor de sucesso = verde; quase lá = amarelo; em progresso = cinza. Vermelho só pra erro ou algo
 * grave"): a semântica de cor de TODAS as metas - 'bom' (atingida, verde), 'quase' (a partir de 90%, amarelo) e 'neutro'
 * (em progresso, cinza). Vermelho não é estado de meta: fica pra erro de carga/validação.
 */
export const LIMIAR_QUASE_LA = 0.9;
export function tomProgresso(p, { atingida = false } = {}) {
  const v = Number(p);
  if (atingida || (Number.isFinite(v) && v >= 1 - 1e-9)) return 'bom';
  return Number.isFinite(v) && v >= LIMIAR_QUASE_LA ? 'quase' : 'neutro';
}

/** Classe visual do selo de status ('good' verde | 'warn' amarelo | 'na' cinza): quem está em progresso com 90%+ vira "quase lá". */
export function classeStatusVisual(status, percentual) {
  const base = (STATUS_META[status] || STATUS_META['sem-prazo']).classe;
  if (base === 'na' && tomProgresso(percentual) === 'quase') return 'warn';
  return base;
}

export const STATUS_META = {
  concluida: { rotulo: 'Concluída', classe: 'good', explicacao: 'Você já juntou o alvo inteiro (na renda passiva: a renda média já chegou na meta).' },
  'no-ritmo': { rotulo: 'No ritmo', classe: 'na', explicacao: 'O seu aporte mensal de hoje (o real, deduzido do histórico dos investimentos vinculados, ou o que você informou), somado ao rendimento esperado, alcança o alvo ATÉ o prazo.' },
  atrasada: { rotulo: 'Atrasada', classe: 'warn', explicacao: 'No ritmo de hoje você não chega até o prazo: o aporte necessário por mês é maior que o seu aporte atual. Veja quanto falta por mês e as simulações para acelerar.' },
  vencida: { rotulo: 'Prazo passou', classe: 'warn', explicacao: 'A data da meta já chegou e ainda falta dinheiro. Ajuste o prazo ou o alvo (Editar).' },
  'sem-prazo': { rotulo: 'Sem prazo', classe: 'na', explicacao: 'A meta não tem data: mostramos quando você chega no ritmo atual, mas não dá para dizer se está adiantada ou atrasada.' },
  'saldo-ideal': { rotulo: 'Saldo ideal', classe: 'good', explicacao: 'O valor LÍQUIDO da reserva (o que cairia na conta se você resgatasse tudo hoje, já sem IR e IOF) cobre o saldo ideal.' },
  'ideal-bruto': { rotulo: 'Ideal só no bruto', classe: 'warn', explicacao: 'O valor investido (bruto) já bate o saldo ideal, mas se você resgatasse hoje o IR/IOF deixaria o líquido abaixo dele. Falta pouco: a diferença é o imposto.' },
  abaixo: { rotulo: 'Abaixo do ideal', classe: 'na', explicacao: 'O valor líquido da reserva (já descontando o IR/IOF de um resgate hoje) ainda está abaixo do saldo ideal.' },
};

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null)));

export const r2 = (v) => Math.round(v * 100) / 100;

/** Nome/ícone/cor de uma meta (o genérico usa os da categoria). */
export function aparenciaMeta(meta) {
  const tipo = TIPOS_META[meta && meta.tipo] || TIPOS_META.acumulo;
  if (meta && meta.tipo === 'acumulo') {
    const c = CATEGORIAS_ACUMULO[meta.categoria] || CATEGORIAS_ACUMULO.outros;
    return { rotulo: c.nome, icone: c.icone, cor: c.cor, dicas: c.dica ? [c.dica] : [] };
  }
  return { rotulo: tipo.nome, icone: tipo.icone, cor: tipo.cor, dicas: tipo.dicas };
}

export function mesDe(data) {
  if (typeof data === 'string') { const m = data.match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}-${m[2]}` : null; }
  if (data instanceof Date) return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  return null;
}

/**
 * 06/10/2026 (Tiago, Renda passiva: "a conta é sempre dos últimos 12 meses a partir do último mês fechado [...] se já é 31 de
 * outubro: outubro/2025 a outubro/2026"): último mês FECHADO ('aaaa-mm') = o mês passado; no ÚLTIMO dia do mês o próprio mês já
 * conta como fechado. Mesma regra de apps-script/Proventos.gs!ultimoMesFechadoProventos_ e de proventos-calc.js!ultimoMesFechado.
 * `hoje`: 'aaaa-mm-dd' ou Date.
 */
export function ultimoMesFechadoMetas(hoje) {
  let a; let m; let d;
  if (typeof hoje === 'string' && /^\d{4}-\d{2}-\d{2}/.test(hoje)) { a = Number(hoje.slice(0, 4)); m = Number(hoje.slice(5, 7)); d = Number(hoje.slice(8, 10)); }
  else { const dt = hoje instanceof Date ? hoje : new Date(); a = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate(); }
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const t = a * 12 + (m - 1) + (d >= ultimoDia ? 0 : -1);
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
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

export const mesVenc = (v) => {
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

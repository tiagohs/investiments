/**
 * inicio-calc.js - 06/10/2026 (A-42/A-76): contas PURAS da tela Início (visões, distribuição por classe, janelas de período,
 * série de rentabilidade normalizada, resumo, comparativos de benchmark). Sem DOM: é o que Carteiras, Ativo e o painel lateral
 * importam - antes vinha tudo de inicio.js, que arrastava a tela inteira junto. inicio.js reexporta tudo (compatibilidade).
 */

import { ehPeriodoPersonalizado, recortarPorIntervalo } from '../periodo-personalizado.js';
import { ajusteMarcacaoDoCampo } from './inicio-comparativo.js';
import { analisarSerie } from '../analise-grafico.js';
import { DESTINO_EMERGENCIAL, DESTINO_OBJETIVO, ROTULO_DESTINO_RF, destinoRendaFixa } from '../destino-renda-fixa.js';

/**
 * Separa um valor já formatado ("R$ 5,09", "185.600,00") na parte
 * principal + a última "quebra" (vírgula decimal, ou o último separador
 * de milhar quando não há decimal visível) - reproduz o efeito de dois
 * tamanhos de fonte do mockup (docs/direcao-visual.html, classe .dec)
 * sem precisar de um formatador dedicado por campo.
 */
export function splitValorExibicao(formatted) {
  const idx = Math.max(formatted.lastIndexOf(','), formatted.lastIndexOf('.'));
  if (idx === -1) return { principal: formatted, dec: '' };
  return { principal: formatted.slice(0, idx), dec: formatted.slice(idx) };
}

/**
 * As 4 visões de patrimônio que a Home.gs devolve hoje. porClasse
 * (Ações/FIIs/Renda Fixa/Ações EUA) só existe pro total - não é um
 * recorte por classe dentro de Longo Prazo, Nacional ou Renda
 * Emergencial. Nacional (17/09/2026) = Longo Prazo sem os investimentos
 * internacionais (Ações EUA) - ver Home.gs!montarHome_.
 */
export const VISOES = {
  total: { chave: 'total', label: 'Patrimônio total' },
  longoPrazo: { chave: 'longoPrazo', label: 'Longo Prazo' },
  nacional: { chave: 'nacional', label: 'Patrimônio Nacional' },
  rendaEmergencial: { chave: 'rendaEmergencial', label: 'Renda Emergencial' },
  // 07/10/2026: Renda Fixa marcada 'Objetivo' (Reservado para objetivos) - entra no total, fica fora do Longo Prazo (Home.gs)
  objetivos: { chave: 'objetivos', label: ROTULO_DESTINO_RF[DESTINO_OBJETIVO] },
  // 23/09/2026 #9 (pedido do Tiago: gráfico "Ações Internacionais" na
  // Rentabilidade da Início) - o valor ao vivo mora em porClasse (Home.gs),
  // o MESMO número do topo de Carteiras > Ações EUA em reais.
  internacional: { valor: (p) => (p && p.porClasse ? p.porClasse.acoesEua : undefined), label: 'Ações Internacionais' },
};

/**
 * 07/10/2026 (Tiago: o "Patrimônio total" da Início passa a se chamar "Investimentos" - o patrimônio líquido virou o hero da
 * tela): rótulos PRÓPRIOS da Início pra visão 'total'. Carteiras > Visão geral continua com "Patrimônio total"
 * (VISOES / LABEL_POR_VISAO_RENTABILIDADE / NOME_ANALISE_POR_VISAO não mudam - são compartilhados).
 */
export const ROTULO_TOTAL_HOME = 'Investimentos';
export const NOME_ANALISE_TOTAL_HOME = 'A carteira de investimentos'; // singular: os verbos das frases da Análise são todos na 3ª pessoa do singular

/** {valor, label} pra visão pedida - cai em "total" se o id não for reconhecido. */
export function resolverVisao(patrimonio, visaoId) {
  const visao = VISOES[visaoId] || VISOES.total;
  const valor = typeof visao.valor === 'function' ? visao.valor(patrimonio) : (patrimonio ? patrimonio[visao.chave] : undefined);
  return { valor, label: visao.label };
}

const ORDEM_RESUMO = ['total', 'longoPrazo', 'nacional', 'rendaEmergencial'];

const CLASSE_LABEL_DISTRIB = { acoes: 'Ações', fiis: 'FIIs', rf: 'Renda Fixa', usa: 'Ações EUA' };

const CLASSE_COR_DISTRIB = { acoes: '--acoes', fiis: '--fiis', rf: '--rf', usa: '--usa' };

const ORDEM_CLASSE_DISTRIB = ['acoes', 'fiis', 'rf', 'usa'];

/** Valor de posição (BRL) de UM ativo - Renda Fixa já vem como saldo
 * (valorAtualizado), Ações/FIIs são preço unitário × quantidade, Ações
 * EUA preferem o preço unitário já convertido (precoAtualBRL, calculado
 * pelo back-end - ver MeusAtivos.gs) e só caem pro câmbio manual
 * (precoAtual × cambioUsd) se por algum motivo esse campo não vier. */
function valorPosicaoAtivo_(ativo, cambioUsd) {
  if (ativo.classe === 'rf') return typeof ativo.valorAtualizado === 'number' ? ativo.valorAtualizado : 0;
  const qtd = typeof ativo.quantidade === 'number' ? ativo.quantidade : 0;
  if (ativo.classe === 'usa') {
    if (typeof ativo.precoAtualBRL === 'number') return ativo.precoAtualBRL * qtd;
    if (typeof cambioUsd === 'number' && typeof ativo.precoAtual === 'number') return ativo.precoAtual * qtd * cambioUsd;
    return 0;
  }
  return typeof ativo.precoAtual === 'number' ? ativo.precoAtual * qtd : 0;
}

/**
 * Soma o valor de posição (BRL) de cada classe (Ações/FIIs/Renda
 * Fixa/Ações EUA) dentro de `ativos` - usado pra desenhar a distribuição
 * do Total e da divisão Longo Prazo. `excluirEmergencial` tira as
 * posições de Renda Fixa marcadas "Renda Emergencial" (marca==='emergencial')
 * da soma - é assim que a distribuição de Longo Prazo difere da do
 * Total (mesmas 4 classes, só que a fatia de Renda Fixa fica menor,
 * já que a reserva de emergência saiu). `excluirInternacional`
 * (17/09/2026) tira as posições classe 'usa' inteiras - é assim que a
 * distribuição de Nacional difere da de Longo Prazo (fica só com
 * Ações/FIIs/Renda Fixa não-emergencial). Calculado a partir do array
 * `ativos` (não de patrimonio.porClasse, que só existe pro total
 * combinado - ver Home.gs) - classes com valor zero/ausente não entram.
 */
export function calcularDistribuicaoPorClasse(ativos, { cambioUsd, excluirEmergencial = false, excluirInternacional = false, totaisPorClasse = null } = {}) {
  const somas = { acoes: 0, fiis: 0, rf: 0, usa: 0 };
  // Soma à parte, só pra 'usa', o valor de posição em DÓLAR (preço
  // unitário em USD × quantidade - nunca convertido de volta a partir
  // do BRL já somado acima, pra não acumular arredondamento de mais em
  // cima do que precoAtualBRL/cambioUsd já podem ter introduzido).
  // Alimenta o "US$ X (R$ Y)" da fatia Ações EUA - ver renderDistribuicao.
  let somaUsaUsd = 0;
  (ativos || []).forEach((ativo) => {
    if (excluirInternacional && ativo.classe === 'usa') return;
    // 07/10/2026: a visão sem reserva também fica sem o que está 'Reservado para objetivos' (destinoRendaFixa, destino-renda-fixa.js)
    if (excluirEmergencial && ativo.classe === 'rf' && destinoRendaFixa(ativo.marca) !== 'longo-prazo') return;
    if (!(ativo.classe in somas)) return;
    somas[ativo.classe] += valorPosicaoAtivo_(ativo, cambioUsd);
    if (ativo.classe === 'usa') {
      const qtd = typeof ativo.quantidade === 'number' ? ativo.quantidade : 0;
      if (typeof ativo.precoAtual === 'number') somaUsaUsd += ativo.precoAtual * qtd;
    }
  });
  // 23/09/2026 #3: quando o chamador tem o total EXATO de cada classe
  // (patrimonio.porClasse, o mesmo número do card/topo de cada carteira),
  // usa ele em vez da soma ativo a ativo - a soma de preço-em-R$-
  // arredondado × quantidade dava a fatia "Ações EUA" alguns centavos
  // diferente do resto do app.
  if (totaisPorClasse) {
    ORDEM_CLASSE_DISTRIB.forEach((classe) => {
      if (excluirInternacional && classe === 'usa') return;
      const v = totaisPorClasse[classe];
      if (typeof v === 'number' && Number.isFinite(v) && somas[classe] > 0) somas[classe] = v;
    });
  }
  return ORDEM_CLASSE_DISTRIB
    .filter((classe) => somas[classe] > 0)
    .map((classe) => ({
      label: CLASSE_LABEL_DISTRIB[classe],
      cor: `var(${CLASSE_COR_DISTRIB[classe]})`,
      valor: somas[classe],
      ...(classe === 'usa' ? { valorUsd: somaUsaUsd } : {}),
    }));
}

/**
 * Distribuição da Renda Emergencial por TIPO de investimento (Tesouro
 * Selic, Tesouro IPCA, CDB, LCI/LCA etc., via o campo tipoInvestimento
 * que cada ativo de Renda Fixa já traz) - a pedido do Tiago, já que
 * Renda Emergencial é 100% Renda Fixa (uma distribuição por CLASSE, como
 * as outras 2 divisões, não diria nada de novo aqui). Ordenado do maior
 * pro menor valor.
 */
export function calcularDistribuicaoRendaEmergencial(ativos) {
  const somas = new Map();
  (ativos || []).forEach((ativo) => {
    if (ativo.classe !== 'rf' || destinoRendaFixa(ativo.marca) !== DESTINO_EMERGENCIAL) return;
    const tipo = ativo.tipoInvestimento || 'Outro';
    const valor = typeof ativo.valorAtualizado === 'number' ? ativo.valorAtualizado : 0;
    somas.set(tipo, (somas.get(tipo) || 0) + valor);
  });
  return Array.from(somas.entries())
    .filter(([, valor]) => valor > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, valor]) => ({ label: tipo, valor }));
}

/** 07/10/2026: distribuição do que está 'Reservado para objetivos' por TIPO de título (mesma conta da reserva de emergência). */
export function calcularDistribuicaoObjetivos(ativos) {
  const somas = new Map();
  (ativos || []).forEach((ativo) => {
    if (ativo.classe !== 'rf' || destinoRendaFixa(ativo.marca) !== DESTINO_OBJETIVO) return;
    const tipo = ativo.tipoInvestimento || 'Outro';
    const valor = typeof ativo.valorAtualizado === 'number' ? ativo.valorAtualizado : 0;
    somas.set(tipo, (somas.get(tipo) || 0) + valor);
  });
  return Array.from(somas.entries())
    .filter(([, valor]) => valor > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, valor]) => ({ label: tipo, valor }));
}

/** dias corridos de cada preset - historico tem 1 linha por dia corrido (ver
 * cabeçalho), então cortar os últimos N itens do array já é a janela certa,
 * sem precisar comparar datas. */
const DIAS_POR_PERIODO = { '30d': 30, '6m': 182, '12m': 365, '3a': 365 * 3 };

/**
 * Recorta historico pro período pedido. 'mes' (13/09/2026, a pedido do
 * Tiago: "aqui faltou o mês atual") é diferente dos outros presets -
 * não é "os últimos N dias corridos", é o mês-calendário corrente (dia
 * 1 até hoje). "hoje" aqui é o dia do ÚLTIMO item de historico (o mais
 * recente sincronizado), não o relógio da máquina - evita qualquer
 * divergência entre o que o back-end considera "hoje" e o front-end.
 * Comparação por PREFIXO DE TEXTO (yyyy-MM) em vez de Date - historico[i].data
 * é uma data pura (yyyy-MM-dd, sem hora), e já existe um bug real
 * documentado (format.js!formatDateBR) de converter esse tipo de data
 * por Date+fuso sem necessidade nenhuma - aqui nem essa conversão existe.
 * 'tudo' (ou um id desconhecido que não seja 'mes'/'tudo') devolve o
 * array inteiro.
 */
export function filtrarHistoricoPorPeriodo(historico, periodoId = '12m', campoDesdeInicio = null) {
  if (!historico || !historico.length) return [];
  // 02/10/2026 ("Escolher período"): período personalizado { inicio, fim } -
  // os dias do intervalo + o fechamento do dia anterior como base do 0%
  // (mesma ideia do 'mes' logo abaixo). Ver periodo-personalizado.js.
  if (ehPeriodoPersonalizado(periodoId)) return recortarPorIntervalo(historico, periodoId);
  if (periodoId === 'mes') {
    const ultimaData = historico[historico.length - 1].data;
    if (typeof ultimaData !== 'string' || ultimaData.length < 7) return historico;
    const anoMes = ultimaData.slice(0, 7); // 'yyyy-MM'
    // 23/09/2026 (comparando com o Gorila - o "Mês atual" de lá começa em
    // "31 ago" com 0%): a BASE do mês é o fechamento do ÚLTIMO dia do mês
    // anterior, não o 1º dia do mês - senão o que aconteceu no dia 1 (de
    // 31/08 pra 01/09) simplesmente não entra na rentabilidade do mês. O
    // ponto-base entra na janela (é o 0% do gráfico); o resto continua
    // sendo só o mês corrente.
    const idxPrimeiroDoMes = historico.findIndex((item) => typeof item.data === 'string' && item.data.startsWith(anoMes));
    if (idxPrimeiroDoMes === -1) return [];
    return historico.slice(Math.max(0, idxPrimeiroDoMes - 1));
  }
  const dias = DIAS_POR_PERIODO[periodoId];
  if (!dias) {
    // periodoId === 'tudo' ("Desde o início") - ou qualquer id desconhecido,
    // mesmo comportamento de sempre (devolve o historico inteiro).
    //
    // 20/09/2026 (pedido do Tiago, comparando as 4 subpáginas de Carteiras):
    // "o desde o início de cada carteira varia, é sempre a 1ª data que
    // comecei a investir naquele tipo" - Ações EUA/FIIs/as 2 sub-visões de
    // Renda Fixa começaram bem depois do início do patrimônio total
    // (22/12/2020) - historico é o MESMO array pra todas as visões (só o
    // campo muda), então "Desde o início" sem nenhum corte nascia com
    // anos de linha reta em zero antes da 1ª posição de verdade daquele
    // tipo específico (Ações/Renda Fixa Total, que já existem desde o
    // início de tudo, continuam batendo com o array inteiro - só as
    // visões mais novas mudam de verdade). campoDesdeInicio (opcional,
    // omitido = comportamento antigo, nunca corta) deixa cada chamador
    // dizer QUAL campo define "o início desta visão" - corta pro primeiro
    // dia em que ELE tem valor válido, reaproveitando
    // primeiroIndiceValidoInicio_ (mesma função que já decide a base do
    // cálculo de % "desde o início" logo abaixo - nunca 2 critérios de
    // "onde essa visão começa" podendo divergir entre si).
    if (campoDesdeInicio) {
      const idxInicio = primeiroIndiceValidoInicio_(historico, campoDesdeInicio);
      if (idxInicio > 0) return historico.slice(idxInicio);
    }
    return historico;
  }
  // 23/09/2026: N dias de variação precisam de N+1 pontos (o 1º é a base
  // - mesmo motivo do 'mes', acima).
  // 03/10/2026 (achado no card de Análise do ativo): o histórico do ATIVO
  // só tem dias de pregão - 366 pontos ali eram ~17 meses, e o "12 meses"
  // do gráfico mostrava 17. O corte agora é pela DATA (a base é o último
  // ponto até "último dia − N"); na série da Início, que tem todo dia
  // corrido, dá exatamente os mesmos N+1 pontos de antes.
  const ultimaData = historico[historico.length - 1].data;
  if (typeof ultimaData === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ultimaData)) {
    const [a, m, d] = ultimaData.slice(0, 10).split('-').map(Number);
    const corte = new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
    let base = -1;
    for (let i = historico.length - 1; i >= 0; i -= 1) {
      if (typeof historico[i].data === 'string' && historico[i].data <= corte) { base = i; break; }
    }
    return historico.slice(Math.max(0, base));
  }
  return historico.slice(-(dias + 1));
}

// 19/09/2026: "carteiraX" abaixo são as visões por classe das 4
// subpáginas de Carteiras (Ações/FIIs/Ações EUA/Renda Fixa×3) - ver
// cabeçalho de HistoricoInicio.gs pros campos novos que alimentam elas.
// Não são "visões da Início" de verdade (a Início nunca usa essas 6),
// mas moram aqui porque renderGraficoRentabilidade/wireGraficoRentabilidade
// (o "motor" de gráfico) já é reaproveitado por Carteiras (ver
// carteiras-visao-geral.js, visaoId:'total') - mesmo precedente já
// confirmado com o Tiago, estender essas 3 tabelas em vez de duplicar o
// motor inteiro numa cópia dentro de carteiras-classe-comum.js.
/**
 * 24/09/2026 (Tiago: "em Ações EUA, me dê a opção de ver em reais ou em
 * dólar"): acrescenta a cada ponto os campos da visão carteiraAcoesEuaUsd
 * - valor, fluxo da rentabilidade e Valor aplicado de Ações EUA em DÓLAR,
 * dividindo os campos em reais pelo câmbio do próprio dia (`cambioUsd`,
 * HistoricoInicio.gs). É o mesmo câmbio que o back-end usou pra passar
 * cada posição/compra/provento pra reais, então a volta é exata: o último
 * ponto dá o "Total atualizado" em US$ e a soma do aplicado dá o "Valor
 * aplicado" em US$ do topo da página. Ponto sem câmbio (back-end antigo
 * ou antes da 1ª posição) fica sem os campos (null).
 */
export function comCamposUsdAcoesEua(historico) {
  return (historico || []).map((p) => {
    const c = p.cambioUsd;
    if (!(typeof c === 'number' && Number.isFinite(c) && c > 0)) return { ...p, acoesEuaUsd: null, fluxoCaixaAcoesEuaUsd: null, fluxoAplicadoAcoesEuaUsd: null, proventosAcoesEuaUsd: null };
    const div = (v) => (typeof v === 'number' && Number.isFinite(v) ? v / c : null);
    return { ...p, acoesEuaUsd: div(p.acoesEua), fluxoCaixaAcoesEuaUsd: div(p.fluxoCaixaAcoesEua), fluxoAplicadoAcoesEuaUsd: div(p.fluxoAplicadoAcoesEua), proventosAcoesEuaUsd: div(p.proventosAcoesEua) };
  });
}

/** 24/09/2026: o histórico tem câmbio por dia (dá pra mostrar Ações EUA em dólar)? */
export function historicoTemCambioUsd(historico) {
  return Array.isArray(historico) && historico.some((p) => typeof p.cambioUsd === 'number' && p.cambioUsd > 0);
}

export const CAMPO_PRINCIPAL_POR_VISAO = {
  total: 'patrimonio', longoPrazo: 'longoPrazo', nacional: 'nacional', rendaEmergencial: 'rendaEmergencial', objetivos: 'objetivos',
  internacional: 'acoesEua', // 23/09/2026 #9: mesmo campo de carteiraAcoesEua (Carteiras) - os 2 gráficos batem por construção
  carteiraAcoes: 'acoes', carteiraFiis: 'fiis', carteiraAcoesEua: 'acoesEua',
  carteiraAcoesEuaUsd: 'acoesEuaUsd', // 24/09/2026: Ações EUA em dólar - ver comCamposUsdAcoesEua
  carteiraRendaFixaTotal: 'rendaFixaTotal', carteiraRendaFixaLongoPrazo: 'rendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'rendaEmergencial', // mesmo campo da Início - RF-emergencial é o mesmo número
  carteiraRendaFixaObjetivos: 'objetivos', // 07/10/2026: Renda Fixa reservada pra objetivos
  // 25/09/2026: tela Detalhe do ativo - histórico de UM ativo montado no
  // front (ativo-calc.js!montarHistoricoAtivo), com os mesmos nomes de campo
  ativoAcoes: 'ativo', ativoFiis: 'ativo', ativoAcoesEua: 'ativo', ativoRendaFixa: 'ativo',
  // 25/09/2026 #2 (Tiago: "os graficos estao em reais, traga o filtro
  // R$/Dolar"): Ações EUA em dólar na tela do ativo - mesmo padrão de
  // carteiraAcoesEuaUsd acima, ver ativo-calc.js!comCamposUsdAtivo.
  ativoAcoesEuaUsd: 'ativoUsd',
};

/** Campo de fluxo de caixa liquido diario (aporte/retirada/provento, ver
 * FluxoCaixaInicio.gs) correspondente a cada visao - usado so pra
 * "neutralizar" a serie do PORTFOLIO em normalizarSerieRentabilidade (TWR),
 * nunca pros benchmarks (Ibovespa/CDI/Selic nao tem aporte). */
export const CAMPO_FLUXO_POR_VISAO = {
  total: 'fluxoCaixaPatrimonio',
  longoPrazo: 'fluxoCaixaLongoPrazo',
  nacional: 'fluxoCaixaNacional',
  rendaEmergencial: 'fluxoCaixaRendaEmergencial',
  objetivos: 'fluxoCaixaObjetivos',
  internacional: 'fluxoCaixaAcoesEua',
  carteiraAcoes: 'fluxoCaixaAcoes',
  carteiraFiis: 'fluxoCaixaFiis',
  carteiraAcoesEua: 'fluxoCaixaAcoesEua',
  carteiraAcoesEuaUsd: 'fluxoCaixaAcoesEuaUsd',
  carteiraRendaFixaTotal: 'fluxoCaixaRendaFixaTotal',
  carteiraRendaFixaLongoPrazo: 'fluxoCaixaRendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'fluxoCaixaRendaEmergencial',
  carteiraRendaFixaObjetivos: 'fluxoCaixaObjetivos',
  ativoAcoes: 'fluxoCaixaAtivo', ativoFiis: 'fluxoCaixaAtivo', ativoAcoesEua: 'fluxoCaixaAtivo', ativoRendaFixa: 'fluxoCaixaAtivo',
  ativoAcoesEuaUsd: 'fluxoCaixaAtivoUsd',
};

/** 21/09/2026 (pedido do Tiago - "Valor aplicado" tem que ser só capital
 * líquido de Compra/Venda + Renda Fixa, NUNCA reduzido por provento
 * recebido): mesmas chaves de CAMPO_FLUXO_POR_VISAO acima, mas apontando
 * pros campos fluxoAplicado* (HistoricoInicio.gs) - usado SÓ pra linha
 * pontilhada "Valor aplicado" dos gráficos de Evolução (Início +
 * subpáginas de Carteiras), nunca pro TWR da Rentabilidade (que continua
 * usando CAMPO_FLUXO_POR_VISAO acima, deduzindo provento de propósito -
 * ver FluxoCaixaInicio.gs). */
export const CAMPO_FLUXO_APLICADO_POR_VISAO = {
  total: 'fluxoAplicadoPatrimonio',
  longoPrazo: 'fluxoAplicadoLongoPrazo',
  nacional: 'fluxoAplicadoNacional',
  rendaEmergencial: 'fluxoAplicadoRendaEmergencial',
  objetivos: 'fluxoAplicadoObjetivos',
  internacional: 'fluxoAplicadoAcoesEua',
  carteiraAcoes: 'fluxoAplicadoAcoes',
  carteiraFiis: 'fluxoAplicadoFiis',
  carteiraAcoesEua: 'fluxoAplicadoAcoesEua',
  carteiraAcoesEuaUsd: 'fluxoAplicadoAcoesEuaUsd',
  carteiraRendaFixaTotal: 'fluxoAplicadoRendaFixaTotal',
  carteiraRendaFixaLongoPrazo: 'fluxoAplicadoRendaFixaLongoPrazo',
  carteiraRendaFixaEmergencial: 'fluxoAplicadoRendaEmergencial',
  carteiraRendaFixaObjetivos: 'fluxoAplicadoObjetivos',
  ativoAcoes: 'fluxoAplicadoAtivo', ativoFiis: 'fluxoAplicadoAtivo', ativoAcoesEua: 'fluxoAplicadoAtivo', ativoRendaFixa: 'fluxoAplicadoAtivo',
  ativoAcoesEuaUsd: 'fluxoAplicadoAtivoUsd',
};

/** Benchmarks por visão - Total/Longo Prazo/Nacional contra Ibovespa+CDI,
 * Renda Emergencial contra CDI+Selic (decisão registrada em
 * docs/plano-implementacao.html - não compara reserva de emergência com bolsa). */
export const BENCHMARKS_POR_VISAO = {
  total: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  longoPrazo: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  nacional: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
  ],
  rendaEmergencial: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--usa', dash: '6 4' },
    { campo: 'indiceSelic', label: 'Selic', cor: '--fiis', dash: '1.5 4.5' },
  ],
  // 23/09/2026 #9: Ações Internacionais da Início - S&P 500 (a bolsa dela)
  // tracejado e Ibovespa pontilhado, mesmo estilo de traço dos outros 3
  // painéis. Em reais, com o câmbio de cada dia (a carteira sente o dólar,
  // o S&P 500 aqui não).
  internacional: [
    { campo: 'sp500', label: 'S&P 500', cor: '--usa', dash: '6 4' },
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--fiis', dash: '1.5 4.5' },
  ],
  // 19/09/2026 (ver comentário de CAMPO_PRINCIPAL_POR_VISAO acima) - cores
  // e estilo de traço conferidos pixel-a-pixel no mockup real
  // (docs/direcao-visual do Design "Carteiras", artboards Acoes/Fiis/
  // AcoesEua/RendaFixa.dc.html): o benchmark de "índice de mercado"
  // (Ibovespa/IFIX) desenha em linha CHEIA (dash:null, ver
  // renderGraficoRentabilidade acima), só o benchmark de "taxa" (CDI/
  // IPCA/S&P 500) vem tracejado - diferente da Início, que tracejava os
  // dois. dash:null só funciona por causa do guard adicionado nesta
  // mesma rodada em benchmarkPathsSvg/cls logo acima.
  carteiraAcoes: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  carteiraFiis: [
    { campo: 'ifix', label: 'IFIX', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  carteiraAcoesEua: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'sp500', label: 'S&P 500', cor: '--acoes', dash: '6 4' },
  ],
  // 24/09/2026: mesma comparação, com a carteira em dólar
  carteiraAcoesEuaUsd: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'sp500', label: 'S&P 500', cor: '--acoes', dash: '6 4' },
  ],
  // Renda Fixa não tem "índice de mercado" (não tem preço de bolsa) -
  // CDI e IPCA vêm os 2 tracejados, igual o mockup de RendaFixa.dc.html.
  // As 3 sub-visões (total/longoPrazo/emergencial) comparam com os MESMOS
  // 2 benchmarks - só o campo principal (Portfólio) muda entre elas.
  carteiraRendaFixaTotal: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  carteiraRendaFixaLongoPrazo: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  carteiraRendaFixaEmergencial: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  carteiraRendaFixaObjetivos: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  // 25/09/2026: tela Detalhe do ativo - o índice da bolsa do ativo (linha
  // cheia) e o CDI (tracejado), como nas Carteiras; renda fixa: CDI e IPCA.
  ativoAcoes: [
    { campo: 'ibovespa', label: 'Ibovespa', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  ativoFiis: [
    { campo: 'ifix', label: 'IFIX', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  ativoAcoesEua: [
    { campo: 'sp500', label: 'S&P 500', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
  ativoRendaFixa: [
    { campo: 'indiceCdi', label: 'CDI', cor: '--ink-faint', dash: '6 4' },
    { campo: 'indiceIpca', label: 'IPCA', cor: '--usa', dash: '6 4' },
  ],
  // 25/09/2026 #2: mesma comparação de ativoAcoesEua, com o ativo em dólar
  ativoAcoesEuaUsd: [
    { campo: 'sp500', label: 'S&P 500', cor: '--ink-faint', dash: null },
    { campo: 'indiceCdi', label: 'CDI', cor: '--rf', dash: '6 4' },
  ],
};

// 19/09/2026: cor da linha do Portfólio (a série principal) por visão -
// na Início é sempre --acoes (azul), mas cada subpágina de Carteiras usa
// a cor da própria classe (mesmo token de shell.css usado no resto da
// página) - conferido pixel-a-pixel no mockup real. default 'total'
// preserva o valor hardcoded que já existia antes desta rodada.
export const COR_PRINCIPAL_POR_VISAO = {
  total: '--acoes', longoPrazo: '--acoes', nacional: '--acoes', rendaEmergencial: '--acoes', internacional: '--acoes',
  carteiraAcoes: '--acoes', carteiraFiis: '--fiis', carteiraAcoesEua: '--usa', carteiraAcoesEuaUsd: '--usa',
  carteiraRendaFixaTotal: '--rf', carteiraRendaFixaLongoPrazo: '--rf', carteiraRendaFixaEmergencial: '--rf', carteiraRendaFixaObjetivos: '--rf',
  ativoAcoes: '--acoes', ativoFiis: '--fiis', ativoAcoesEua: '--usa', ativoRendaFixa: '--rf', ativoAcoesEuaUsd: '--usa',
};

/** Índice do primeiro valor numérico válido (não-nulo, finito) e diferente de
 * zero de `campo` em `historico` - zero como base de "% desde o início"
 * dividiria por zero; ibovespa também pode vir null antes do 1º pregão da
 * janela. -1 quando não existe nenhum valor válido. */
export function primeiroIndiceValidoInicio_(historico, campo) {
  for (let i = 0; i < historico.length; i += 1) {
    const v = historico[i][campo];
    if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return i;
  }
  return -1;
}

/** 23/09/2026 #3: a janela começa no dia em que a visão NASCEU? (o
 * ponto anterior a ela, no histórico completo, vale 0/não existe, e o dia
 * tem aporte) - aí a rentabilidade mede a partir do custo desse aporte,
 * não do fechamento do dia (ver normalizarSerieRentabilidade). */
export function inicioEhAbertura_(historicoCompleto, janela, campo, campoFluxo) {
  const idx = primeiroIndiceValidoInicio_(janela, campo);
  if (idx === -1) return false;
  const pos = historicoCompleto.indexOf(janela[idx]);
  if (pos === -1) return false;
  const anterior = pos > 0 ? historicoCompleto[pos - 1][campo] : 0;
  if (typeof anterior === 'number' && Number.isFinite(anterior) && anterior !== 0) return false;
  const fluxo = janela[idx][campoFluxo];
  const valor = janela[idx][campo];
  return typeof fluxo === 'number' && fluxo > 0 && valor / fluxo >= 0.5 && valor / fluxo <= 2;
}

/** Primeiro valor numérico válido de `campo` em `historico` (ver
 * primeiroIndiceValidoInicio_). */
function primeiroValorValidoInicio_(historico, campo) {
  const idx = primeiroIndiceValidoInicio_(historico, campo);
  return idx === -1 ? null : historico[idx][campo];
}

/**
 * Normaliza a série de `campo` (dentro de `historico`, já recortado pro
 * período) pra "% desde o início do período" - único jeito de comparar
 * patrimônio (R$) com um índice (pontos ou curva base 100) na mesma escala.
 * Sem base válida (tudo zero/null na janela), devolve todo mundo null em vez
 * de inventar 0% - renderGraficoRentabilidade trata isso mostrando um aviso.
 *
 * 13/09/2026 (correção Gorilla - Tiago comparou nosso "+5.726% desde o
 * início" com o "+75,63%" do app Gorilla): quando `campoFluxo` é passado (só
 * pra série do PORTFÓLIO - patrimonio/longoPrazo/rendaEmergencial -, nunca
 * pros benchmarks, que não têm aporte/retirada), o cálculo vira Retorno
 * Ponderado no Tempo (TWR) em vez da razão ingênua valor_hoje/valor_base:
 * cada dia "neutraliza" o fluxo de caixa líquido daquele dia (aporte,
 * retirada, provento recebido - ver FluxoCaixaInicio.gs, calculado incluindo
 * câmbio histórico USD/BRL pras ações EUA) antes de medir o retorno do dia, e
 * os retornos diários são encadeados (compostos), nunca somados. Isso evita
 * que um aporte apareça como ganho (ou uma retirada/venda como perda) - a
 * causa raiz do número absurdo. Proventos entram como flow NEGATIVO (ver
 * FluxoCaixaInicio.gs) de propósito: como `patrimonio` não inclui caixa, um
 * provento recebido não move o valor bruto do dia, então soma-lo de volta é
 * o jeito de fazer o dividendo CONTAR como ganho no retorno total (pedido do
 * Tiago: "incluir proventos também"). Sem campoFluxo, mantém o cálculo antigo
 * (usado pelos benchmarks, que não têm fluxo de caixa).
 */
export function normalizarSerieRentabilidade(historico, campo, campoFluxo, { abertura = false } = {}) {
  if (!campoFluxo) {
    const base = primeiroValorValidoInicio_(historico, campo);
    if (base == null) return historico.map(() => null);
    return historico.map((item) => {
      const v = item[campo];
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      return ((v / base) - 1) * 100;
    });
  }

  const idxBase = primeiroIndiceValidoInicio_(historico, campo);
  if (idxBase === -1) return historico.map(() => null);

  const resultado = new Array(historico.length).fill(null);
  const suspeitos = [];
  Object.defineProperty(resultado, 'suspeitos', { value: suspeitos, enumerable: false });
  resultado[idxBase] = 0;
  let cumulativo = 0;
  let anterior = historico[idxBase][campo];
  // 23/09/2026 #3 (Controle 8 - "Desde o início" de Ações EUA dava
  // um ganho em R$ menor que o lucro da posição em reais - o que
  // aconteceu no 1º dia sumia): quando a janela começa no DIA DA
  // ABERTURA da visão (antes disso ela valia 0 - ver inicioEhAbertura_),
  // o ponto de partida não é o fechamento desse dia e sim o CUSTO
  // aplicado nele (o fluxo do dia) - o que aconteceu entre a compra e o
  // fechamento do 1º dia também é rendimento (mesma convenção do Gorila:
  // base 0 na véspera da 1ª compra). Sem a flag (default), igual antes.
  if (abertura) {
    const fluxoAbertura = historico[idxBase][campoFluxo];
    if (typeof fluxoAbertura === 'number' && fluxoAbertura > 0) {
      const fatorAbertura = anterior / fluxoAbertura;
      if (fatorAbertura >= 0.5 && fatorAbertura <= 2) {
        cumulativo = fatorAbertura - 1;
        resultado[idxBase] = cumulativo * 100;
      }
    }
  }

  for (let i = idxBase + 1; i < historico.length; i += 1) {
    const v = historico[i][campo];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      resultado[i] = null;
      continue;
    }
    if (anterior) {
      const fluxo = historico[i][campoFluxo] || 0;
      const retornoDiaBruto = (v - fluxo) / anterior - 1;
      // 20/09/2026 (bug real, achado com dados reais do Tiago via
      // tests/harness/ - "Desde o início" de Total/Longo Prazo/Nacional/
      // Renda Fixa Total travado perto de -100% pra sempre, Carteira de
      // Ações em -101% e Renda Emergencial em -100% - comprovado rodando
      // montarSerieHistoricoInicio_ de verdade contra a planilha real):
      // esta conta só é segura quando `v` (valor bruto do dia) JÁ
      // reflete o `fluxo` que está sendo descontado dele - ou seja, as
      // duas fontes nasceram no MESMO instante. Na prática, várias
      // combinações de fonte podem desalinhar isso: o caso mais comum é
      // o fluxo (Transações, data real da compra) chegar um dia (ou
      // mais) ANTES do preço/saldo aparecer em v (aux_historico-
      // patrimonio, sujeito a atraso de backfill do GOOGLEFINANCE -
      // "lacuna" no Registro de Controle; HistoricoInicio.gs!
      // primeiraCompraPorTicker já corrige isso pra Ações/FIIs/Ações
      // EUA, mas nunca cobriu Total/Longo Prazo/Nacional/Renda Fixa) -
      // mas o mesmo tipo de desalinhamento pode nascer de qualquer outra
      // combinação fonte-a-fonte (ex.: duas linhas de Transações Renda
      // Fixa muito próximas no tempo já bastou pra travar
      // "Renda Emergencial" com dado real do Tiago). Quando isso
      // acontece, `v - fluxo` fica artificialmente baixo (às vezes até
      // negativo) só naquele dia - matematicamente equivale a "o
      // mercado caiu quase 100% hoje", o que nunca é real - e como o
      // retorno é COMPOSTO (multiplicativo), um único dia assim TRAVA o
      // acumulado perto de -100% PRA SEMPRE, mesmo que todo o resto da
      // história seja positivo (comprovado com dado real: o 2º dia de
      // toda a carteira, 23/12/2020, já dispara isso sozinho).
      // Em vez de caçar cada combinação fonte-a-fonte que pode
      // desalinhar (jogo de gato-e-rato - o padrão de bug recorrente que
      // motivou pedir o harness de testes, ver tests/harness/README.md),
      // trava aqui, na fórmula em si: nenhum dia sozinho pode implicar
      // um retorno fora da faixa fisicamente plausível pra uma carteira
      // diversificada num único pregão (o pior dia de bolsa já
      // registrado, o "Black Monday" de 1987, foi -20,5% - a faixa até
      // -50%/+100% é generosa o bastante pra nunca recortar um dia real,
      // mas pequena o bastante pra pegar qualquer desalinhamento
      // fonte-a-fonte). Um dia fora da faixa é tratado como "sem dado
      // confiável hoje" (retorno neutro, 0%, em vez de contaminar todo o
      // resto da série) - normalizarSerieRentabilidade.test.js tem os
      // casos com dado real que provam isso.
      const RETORNO_DIARIO_MIN_PLAUSIVEL = -0.5;
      const RETORNO_DIARIO_MAX_PLAUSIVEL = 1;
      const suspeito = retornoDiaBruto < RETORNO_DIARIO_MIN_PLAUSIVEL || retornoDiaBruto > RETORNO_DIARIO_MAX_PLAUSIVEL;
      // 05/10/2026 (A-20, auditoria): o dia fora da faixa continua neutro na
      // CADEIA do % (senão um único dado ruim trava o acumulado em -100%, ver
      // acima), mas deixou de ser um corte SILENCIOSO: fica registrado em
      // `suspeitos` (propriedade não enumerável do resultado) e a tela avisa
      // - o ganho em R$ (calcularResumoRentabilidade) não corta nada, então
      // os dois podem divergir justamente nesses dias.
      if (suspeito) suspeitos.push({ indice: i, data: historico[i].data || null, retorno: retornoDiaBruto * 100 });
      const retornoDia = suspeito ? 0 : retornoDiaBruto;
      cumulativo = (1 + cumulativo) * (1 + retornoDia) - 1;
      resultado[i] = cumulativo * 100;
    } else {
      resultado[i] = null;
    }
    anterior = v;
  }

  return resultado;
}

/** Último valor não-nulo de uma série já normalizada ("% desde o início do
 * período") - usado tanto pro delta do portfólio (renderInfoRentabilidade)
 * quanto pro delta de cada benchmark na legenda (renderGraficoRentabilidade),
 * uma implementação só pros dois nunca divergirem. */
export function ultimoValidoDe_(serieNormalizada) {
  for (let i = serieNormalizada.length - 1; i >= 0; i -= 1) {
    if (serieNormalizada[i] != null) return serieNormalizada[i];
  }
  return null;
}

/** Sujeito das frases do card de Análise, por visão. */
const NOME_ANALISE_POR_VISAO = {
  total: 'O patrimônio total', longoPrazo: 'O longo prazo', nacional: 'O patrimônio nacional', rendaEmergencial: 'A renda emergencial',
  internacional: 'A carteira internacional', carteiraAcoes: 'A carteira de ações', carteiraFiis: 'A carteira de FIIs',
  carteiraAcoesEua: 'A carteira de ações EUA', carteiraAcoesEuaUsd: 'A carteira de ações EUA (em dólar)',
  carteiraRendaFixaTotal: 'A renda fixa', carteiraRendaFixaLongoPrazo: 'O longo prazo da renda fixa', carteiraRendaFixaEmergencial: 'A reserva de emergência', carteiraRendaFixaObjetivos: 'O que está reservado para objetivos', objetivos: 'O que está reservado para objetivos',
};

/** De onde veio o resultado (regras "movimento" e "concentração"): [rótulo, campo, campo de fluxo]. */
const COMPONENTES_ANALISE_POR_VISAO = {
  total: [['Ações', 'acoes', 'fluxoCaixaAcoes'], ['FIIs', 'fiis', 'fluxoCaixaFiis'], ['Ações EUA', 'acoesEua', 'fluxoCaixaAcoesEua'], ['Renda Fixa', 'rendaFixaTotal', 'fluxoCaixaRendaFixaTotal']],
  longoPrazo: [['Ações', 'acoes', 'fluxoCaixaAcoes'], ['FIIs', 'fiis', 'fluxoCaixaFiis'], ['Ações EUA', 'acoesEua', 'fluxoCaixaAcoesEua'], ['Renda Fixa', 'rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo']],
  nacional: [['Ações', 'acoes', 'fluxoCaixaAcoes'], ['FIIs', 'fiis', 'fluxoCaixaFiis'], ['Renda Fixa', 'rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo']],
  carteiraRendaFixaTotal: [['Longo prazo', 'rendaFixaLongoPrazo', 'fluxoCaixaRendaFixaLongoPrazo'], ['Reserva de emergência', 'rendaEmergencial', 'fluxoCaixaRendaEmergencial'], ['Reservado para objetivos', 'objetivos', 'fluxoCaixaObjetivos']],
};

/** 07/10/2026: data de hoje (fuso do navegador) em ISO - só pro rótulo "hoje" da análise. */
function hojeIsoLocal_() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Monta as entradas de analisarSerie a partir do que o gráfico já calculou. */
export function montarAnaliseRentabilidade_({ historico, janela, seriePrincipal, seriesBenchmark, visaoId, campoPrincipal, campoFluxoPrincipal, periodoId, nomeAnalise, formatarMoeda, analiseExtra = null }) {
  // 03/10/2026: `ajuste` = ajuste de marcação da Renda Fixa embutido no fluxo
  // do último ponto (valor da planilha x projeção do histórico - Home.gs e
  // ativo-calc.js): o card diz que é ajuste, não aporte/resgate
  const serie = janela.map((p, i) => ({
    data: p.data, valor: p[campoPrincipal], retorno: seriePrincipal[i], fluxo: p[campoFluxoPrincipal], pregao: p.pregao,
    ajuste: typeof p.ajusteMarcacao === 'number' ? p.ajusteMarcacao : ajusteMarcacaoDoCampo(p, campoPrincipal),
  }));
  const indices = {};
  seriesBenchmark.forEach((b) => {
    indices[b.label] = janela.map((p, i) => ({ data: p.data, retorno: b.valores[i] })).filter((x) => x.retorno != null);
  });
  // contexto: ~6 meses até o fim da janela, só pra medir a oscilação típica
  // (num "Mês atual" de 2 dias não dá pra saber se a queda foi brusca)
  const fimIdx = historico.indexOf(janela[janela.length - 1]);
  let contexto = null;
  let inicioComp = historico.indexOf(janela[0]);
  if (fimIdx > 0) {
    const ctxJanela = historico.slice(Math.max(0, fimIdx - 180), fimIdx + 1);
    const idxNasc = primeiroIndiceValidoInicio_(ctxJanela, campoPrincipal);
    const ctx = idxNasc > 0 ? ctxJanela.slice(idxNasc) : ctxJanela;
    const retCtx = normalizarSerieRentabilidade(ctx, campoPrincipal, campoFluxoPrincipal);
    const indCtx = {};
    seriesBenchmark.forEach((b) => {
      const v = normalizarSerieRentabilidade(ctx, b.campo);
      indCtx[b.label] = ctx.map((p, i) => ({ data: p.data, retorno: v[i] })).filter((x) => x.retorno != null);
    });
    contexto = { serie: ctx.map((p, i) => ({ data: p.data, retorno: retCtx[i], pregao: p.pregao })), indices: indCtx };
    inicioComp = Math.min(inicioComp === -1 ? fimIdx : inicioComp, Math.max(0, fimIdx - 180));
  }
  let componentes = null;
  const defs = COMPONENTES_ANALISE_POR_VISAO[visaoId];
  const fatia = fimIdx >= 0 ? historico.slice(Math.max(0, inicioComp - 1), fimIdx + 1) : janela;
  if (defs && fimIdx >= 0) {
    componentes = {};
    defs.forEach(([rotulo, campo, campoFluxo]) => {
      componentes[rotulo] = fatia.map((p) => ({ data: p.data, valor: p[campo], fluxo: p[campoFluxo] }));
    });
  }
  // 03/10/2026 (Tiago: "Nas análises dos gráficos e métricas dos ativos,
  // considere essas fontes [...] Tenha um largo banco de dados de
  // critérios"): a classe escolhe o benchmark CERTO, as faixas e o prazo
  // mínimo (assets/js/criterios/base-rentabilidade.js); as referências são
  // índices que não estão desenhados mas entram na conta (IPCA pra
  // rentabilidade real, CDI pro Sharpe, IFIX/S&P 500 pro benchmark composto,
  // câmbio pro S&P 500 em R$).
  const referencias = {};
  REFERENCIAS_ANALISE.forEach(([rotulo, campo]) => {
    const l = fatia.filter((p) => typeof p[campo] === 'number' && Number.isFinite(p[campo]) && p[campo] > 0).map((p) => ({ data: p.data, valor: p[campo] }));
    if (l.length >= 2) referencias[rotulo] = l;
  });
  const cambio = fatia.filter((p) => typeof p.cambioUsd === 'number' && p.cambioUsd > 0).map((p) => ({ data: p.data, valor: p.cambioUsd }));
  return analisarSerie({
    serie, indices, periodo: periodoId, contexto, componentes, formatarMoeda,
    nome: nomeAnalise || NOME_ANALISE_POR_VISAO[visaoId] || 'A carteira',
    classe: CLASSE_ANALISE_POR_VISAO[visaoId] || null,
    referencias,
    cambio: cambio.length >= 2 ? cambio : null,
    hoje: hojeIsoLocal_(), // 07/10/2026: "hoje" no texto da queda/alta por causa do dólar
    moeda: /Usd$/.test(visaoId) ? 'USD' : 'BRL',
    benchmarkComponentes: BENCHMARK_COMPONENTES_POR_VISAO[visaoId] || null,
    ...(analiseExtra && typeof analiseExtra === 'object' ? analiseExtra : {}),
  });
}

/** 03/10/2026: classe de cada visão pro card de Análise (benchmark certo, faixas e prazo - ver analise-grafico.js). */
const CLASSE_ANALISE_POR_VISAO = {
  total: 'carteira', longoPrazo: 'carteira', nacional: 'carteira', rendaEmergencial: 'reserva', internacional: 'eua',
  carteiraAcoes: 'acoes', carteiraFiis: 'fiis', carteiraAcoesEua: 'eua', carteiraAcoesEuaUsd: 'eua',
  carteiraRendaFixaTotal: 'rf', carteiraRendaFixaLongoPrazo: 'rf', carteiraRendaFixaEmergencial: 'reserva', carteiraRendaFixaObjetivos: 'rf', objetivos: 'rf',
  ativoAcoes: 'ativo-acao', ativoFiis: 'ativo-fii', ativoAcoesEua: 'ativo-eua', ativoAcoesEuaUsd: 'ativo-eua', ativoRendaFixa: 'ativo-rf',
};

/** 03/10/2026: índices do histórico que entram na conta da Análise mesmo sem estar desenhados ([rótulo, campo]). */
const REFERENCIAS_ANALISE = [
  ['CDI', 'indiceCdi'], ['IPCA', 'indiceIpca'], ['Ibovespa', 'ibovespa'], ['IFIX', 'ifix'], ['S&P 500', 'sp500'],
  ['S&P 500 com dividendos (IVVB11)', 'ivvb11'], // HistoricoInicio.gs, depois de rodarBackfillIvvb11Direto()
];

/** 03/10/2026: carteira com várias classes - benchmark composto pelos pesos de cada dia (cada classe no seu índice). */
const BENCHMARK_COMPONENTES_TOTAL_ = { 'Ações': 'Ibovespa', FIIs: 'IFIX', 'Ações EUA': ['S&P 500 com dividendos (IVVB11)', 'S&P 500 em R$'], 'Renda Fixa': 'CDI' };

const BENCHMARK_COMPONENTES_POR_VISAO = {
  total: BENCHMARK_COMPONENTES_TOTAL_, longoPrazo: BENCHMARK_COMPONENTES_TOTAL_,
  nacional: { 'Ações': 'Ibovespa', FIIs: 'IFIX', 'Renda Fixa': 'CDI' },
};

export const LABEL_POR_VISAO_RENTABILIDADE = {
  total: 'Patrimônio total',
  longoPrazo: 'Patrimônio de Longo Prazo',
  nacional: 'Patrimônio Nacional',
  rendaEmergencial: 'Renda Emergencial',
  internacional: 'Ações Internacionais',
  carteiraAcoes: 'Carteira de Ações',
  carteiraFiis: 'Carteira de FIIs',
  carteiraAcoesEua: 'Carteira de Ações EUA',
  carteiraAcoesEuaUsd: 'Carteira de Ações EUA (em dólar)',
  carteiraRendaFixaTotal: 'Carteira total',
  carteiraRendaFixaLongoPrazo: 'Longo prazo',
  carteiraRendaFixaEmergencial: 'Reserva de emergência',
  carteiraRendaFixaObjetivos: 'Reservado para objetivos',
  objetivos: 'Reservado para objetivos',
  ativoAcoes: 'Saldo do ativo', ativoFiis: 'Saldo do ativo', ativoAcoesEua: 'Saldo do ativo (em reais)', ativoRendaFixa: 'Saldo do título',
  ativoAcoesEuaUsd: 'Saldo do ativo (em dólar)',
};

/**
 * Renderiza o bloco de info (rótulo + valor atual + variação no período)
 * de UM cartão de Rentabilidade - fica dentro do MESMO cartão do gráfico,
 * reaproveitando o ÚLTIMO ponto da mesma série normalizada que alimenta a
 * linha do gráfico (normalizarSerieRentabilidade, via ultimoValidoDe_)
 * como a "variação no período" - uma fonte só pro número e pro desenho,
 * nunca dois cálculos podendo divergir.
 *
 * 13/09/2026 (3ª rodada): além da %, mostra também o valor em R$
 * ganho/perdido no período - a pedido do Tiago ("quero saber o valor
 * também, quanto ganhei ou perdi"). Calculado a partir dos MESMOS dois
 * pontos brutos (1º valor válido da janela e o último) que já alimentam
 * a % acima - nunca um R$ e uma % contando históricos diferentes.
 */
/**
 * Núcleo de cálculo por trás de renderInfoRentabilidade (extraído em
 * 19/09/2026 pra ser reaproveitado fora da Início - ver
 * carteiras-visao-geral.js!renderHeroStats_, que usa isso com
 * periodoId:'tudo' pro resumo "Investido/Resultado/Rentabilidade" do
 * hero de Carteiras). Devolve os 3 números brutos (valor atual, ganho em
 * R$ já líquido de aporte/retirada - TWR -, e a % correspondente) sem
 * tocar em DOM nenhum - renderInfoRentabilidade só formata isso.
 *
 * Existir separado garante que qualquer tela que precise de um resumo
 * "desde o início" (ou qualquer outro período) sempre usa a MESMA conta
 * já validada contra o Gorilla (ver correção de 13/09/2026 logo abaixo),
 * em vez de cada tela reimplementar sua própria soma de fluxo de caixa -
 * foi exatamente reimplementar essa soma "por fora" (somando
 * card.totalInvestido/lucroPrejuizo dos cards de classe, que só olham
 * pra posição ATUAL, sem realizado nem proventos) que fez o hero de
 * Carteiras sair batendo muito menor do que o Gorilla (uma fração do
 * resultado e da % reais) - bug relatado pelo Tiago em
 * 19/09/2026, ver comentário em renderHeroStats_.
 */
export function calcularResumoRentabilidade(patrimonio, historico, { visaoId = 'total', periodoId = '12m' } = {}) {
  const campo = CAMPO_PRINCIPAL_POR_VISAO[visaoId] || CAMPO_PRINCIPAL_POR_VISAO.total;
  const campoFluxo = CAMPO_FLUXO_POR_VISAO[visaoId] || CAMPO_FLUXO_POR_VISAO.total;
  // 23/09/2026 #8: as subpáginas de Carteiras não têm o `patrimonio` da
  // Início (nem uma entrada em VISOES pras visões carteira*) - o valor
  // atual é o último ponto da própria série (que já é o valor ao vivo de
  // hoje, ver HistoricoInicio.gs/Home.gs).
  const valorAtualHoje = patrimonio && VISOES[visaoId] ? resolverVisao(patrimonio, visaoId).valor : ultimoValorDoCampo_(historico, campo);
  // 20/09/2026: mesmo corte de "Desde o início" por visão - ver comentário
  // de filtrarHistoricoPorPeriodo/renderGraficoRentabilidade.
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId, campo);
  // 02/10/2026: período personalizado que termina ANTES de hoje - o valor
  // mostrado é o do fim do intervalo (o "ganho no período" é dele), não o de hoje.
  const ultimoDia = historico && historico.length ? historico[historico.length - 1].data : null;
  const fimJanela = janela.length ? janela[janela.length - 1].data : null;
  const terminaAntes = !!(fimJanela && ultimoDia && fimJanela < ultimoDia);
  const valorAtual = terminaAntes ? ultimoValorDoCampo_(janela, campo) : valorAtualHoje;
  const abertura = janela.length >= 2 && inicioEhAbertura_(historico, janela, campo, campoFluxo);
  const serieNormalizada = janela.length >= 2 ? normalizarSerieRentabilidade(janela, campo, campoFluxo, { abertura }) : [];
  const percentual = ultimoValidoDe_(serieNormalizada);
  const diasSuspeitos = (serieNormalizada.suspeitos || []).map((d) => ({ data: d.data, retorno: d.retorno })); // A-20

  // 13/09/2026 (correção Gorilla): o ganho em R$ também precisa descontar o
  // fluxo de caixa líquido do período (mesma lógica da % acima, TWR) - senão
  // um aporte de R$ 10.000 no meio do período aparecia como "+R$ 10.000" de
  // ganho que nunca existiu. Soma o fluxo de todos os dias DEPOIS da base (o
  // próprio dia-base é o ponto de partida, não conta como fluxo do período) e
  // desconta do delta bruto (valor final - valor base).
  let ganhoReais = null;
  if (janela.length >= 2) {
    const idxBase = primeiroIndiceValidoInicio_(janela, campo);
    if (idxBase !== -1) {
      const base = janela[idxBase][campo];
      let ultimoBruto = null;
      for (let i = janela.length - 1; i >= 0; i -= 1) {
        const v = janela[i][campo];
        if (typeof v === 'number' && Number.isFinite(v)) { ultimoBruto = v; break; }
      }
      if (ultimoBruto != null) {
        let somaFluxo = 0;
        for (let i = idxBase + 1; i < janela.length; i += 1) {
          somaFluxo += janela[i][campoFluxo] || 0;
        }
        // abertura (ver normalizarSerieRentabilidade): a base é 0 na
        // véspera e o aporte do 1º dia entra como fluxo - o ganho vira
        // exatamente "valor de hoje − tudo o que entrou".
        ganhoReais = abertura
          ? ultimoBruto - (janela[idxBase][campoFluxo] || 0) - somaFluxo
          : (ultimoBruto - base) - somaFluxo;
      }
    }
  }

  return { valorAtual, ganhoReais, percentual, dataFim: terminaAntes ? fimJanela : null, diasSuspeitos };
}

/**
 * 24/09/2026 (Tiago: "na home de carteiras, mostre a soma de todos os
 * proventos ... leve em consideração o filtro de gráficos"): soma dos campos
 * diários de provento (proventosAcoes/Fiis/AcoesEua - em R$, no dia do
 * pagamento) na MESMA janela do gráfico - os dias depois da base (igual ao
 * fluxo no ganho em R$: "Mês atual" = os dias deste mês).
 */
export function somarProventosNoPeriodo(historico, periodoId, campoCorte, campos) {
  if (!Array.isArray(historico) || !campos || !campos.length) return null;
  if (!historico.some((p) => campos.some((c) => typeof p[c] === 'number'))) return null;
  const janela = filtrarHistoricoPorPeriodo(historico, periodoId, campoCorte);
  let soma = 0;
  janela.slice(1).forEach((p) => { campos.forEach((c) => { if (typeof p[c] === 'number' && Number.isFinite(p[c])) soma += p[c]; }); });
  return Math.round(soma * 100) / 100;
}

/** 23/09/2026 #8: último valor numérico de `campo` na série (o de hoje). */
function ultimoValorDoCampo_(historico, campo) {
  for (let i = (historico || []).length - 1; i >= 0; i -= 1) {
    const v = historico[i][campo];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * 23/09/2026 #8 (pedido do Tiago: "nos gráficos da carteira, coloque os
 * valores em cima dos gráficos, com os ganhos ou perdas (igual a home) de
 * acordo com o tipo de gráfico"). Resumo do gráfico de EVOLUÇÃO a partir
 * das MESMAS duas linhas que ele desenha (`valores` = Portfólio,
 * `investidos` = Valor aplicado, já recortadas na janela) - nunca uma
 * conta à parte:
 *  - final: último ponto da linha (= valor de hoje);
 *  - variacao / percentual: fim − começo da linha no período (inclui
 *    aporte e retirada - é o quanto a linha subiu/desceu; o ganho SEM
 *    aporte é o do gráfico de Rentabilidade). A tela mostra só o R$;
 *    `percentual` fica pra quem precisar;
 *  - aplicado / diferencaAplicado: fim da linha tracejada e a distância
 *    entre as duas linhas no último dia.
 * null quando a janela tem menos de 2 pontos.
 */
export function calcularResumoEvolucao(valores, investidos = null) {
  const idx = [];
  (valores || []).forEach((v, i) => { if (typeof v === 'number' && Number.isFinite(v)) idx.push(i); });
  if (idx.length < 2) return null;
  const inicial = valores[idx[0]];
  const final = valores[idx[idx.length - 1]];
  const variacao = final - inicial;
  const percentual = inicial ? (variacao / Math.abs(inicial)) * 100 : null;
  const ultInv = investidos ? investidos[idx[idx.length - 1]] : null;
  const aplicado = typeof ultInv === 'number' && Number.isFinite(ultInv) ? ultInv : null;
  return { inicial, final, variacao, percentual, aplicado, diferencaAplicado: aplicado != null ? final - aplicado : null };
}

/** 02/10/2026: { min, max } (1º e último dia do histórico) - datas do
 * calendário de "Escolher período" fora disso ficam desabilitadas. */
export function limitesDoHistorico_(historico) {
  if (!Array.isArray(historico) || !historico.length) return null;
  const min = historico[0] && historico[0].data;
  const max = historico[historico.length - 1] && historico[historico.length - 1].data;
  return typeof min === 'string' && typeof max === 'string' ? { min, max } : null;
}

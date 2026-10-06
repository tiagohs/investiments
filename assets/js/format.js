/**
 * format.js — pt-BR formatting helpers (currency, percentage, dates).
 * Pure functions, no DOM, no fetch — every page that displays a number
 * imports from here instead of re-writing Intl.NumberFormat calls.
 *
 * Percentage in particular has a documented landmine in this project
 * (see docs/plano-implementacao.html, "Riscos técnicos"): GOOGLEFINANCE's
 * changepct already comes as percentage points (1.3 means 1.3%), while
 * "Variação dia" in the Carteira sheets comes as a fraction (0.013 means
 * 1.3%) - mixing them up silently makes one number 100x the other with
 * no error anywhere. So there are two explicitly-named percent
 * functions below instead of one that "assumes" a scale - the caller
 * has to say which one they have.
 */

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
// 05/10/2026 (auditoria A-06): dólar no MESMO padrão do real ("US$ 1.234,56"): antes o formatUSD escrevia "$1,234.56" (en-US) e 7 helpers
// locais escreviam "US$ 1.234,56" - "$3,128.03" parecia 3,1 mil. Único formatador de dólar do site agora.
const USD_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });
const BRL_COMPACTO_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1,
});

const MINUS = '\u2212';

/**
 * 05/10/2026 (auditoria A-68): sinal negativo ÚNICO do site = "−" (U+2212), o mesmo dos gráficos e dos
 * helpers de variação (antes o Intl devolvia o hífen "-" e a mesma tela misturava "-R$ 50" com "−R$ 50").
 * Troca só o hífen do INÍCIO do texto já formatado ("-R$ 50,00" -> "−R$ 50,00"); qualquer outro texto passa igual.
 */
export function formatMinus(texto) {
  return String(texto).replace(/^-(?=\S)/, MINUS);
}

/** "R$ 1.234,56". Non-finite input (NaN, null->NaN, etc.) renders as "—". Negativo: "−R$ 50,00". */
export function formatBRL(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return formatMinus(BRL_FORMATTER.format(value));
}

const BRL0_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * "R$ 1.235" - reais INTEIROS, sem centavos (05/10/2026, A-68). Padrão do site: textos corridos, dicas, eixos e cartões
 * de resumo usam este (centavo ali é ruído: "R$ 7,00" ao lado de "R$ 7" na mesma tela); tabelas, extratos e o valor
 * principal de cada cartão continuam com `formatBRL` (centavos). Arredonda, não trunca.
 */
export function formatBRL0(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return formatMinus(BRL0_FORMATTER.format(Math.round(value) === 0 ? 0 : value));
}

/** "R$ 3,8 bi" / "R$ 450 mi" - versão compacta pra valores grandes que
 * não precisam do centavo (ex.: Patrimônio do fundo, na tabela de FIIs
 * de Carteiras - 19/09/2026 #3, fiel ao mockup). */
export function formatBRLCompacto(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return formatMinus(BRL_COMPACTO_FORMATTER.format(value));
}

const FORMATADORES_MOEDA = new Map();
/** "€ 5.000,00" / "R$ 1.234,56" (qualquer moeda, em pt-BR; `casas` = casas decimais). Movido de metas-card.js (A-68). */
export function formatMoeda(valor, moeda = 'BRL', { casas = 2 } = {}) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
  if (moeda === 'BRL' && casas === 2) return formatBRL(valor);
  const chave = `${moeda}|${casas}`;
  if (!FORMATADORES_MOEDA.has(chave)) {
    FORMATADORES_MOEDA.set(chave, new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda, minimumFractionDigits: casas, maximumFractionDigits: casas }));
  }
  return formatMinus(FORMATADORES_MOEDA.get(chave).format(valor));
}

const COMPACTO_FORMATTER = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
/** "12,3 mil" / "1,2 mi" - número compacto SEM moeda (eixo Y dos gráficos de Carteiras; quem põe "R$" é o chamador). */
export function formatCompacto(value) {
  return COMPACTO_FORMATTER.format(value);
}

/** "US$ 1.234,56" - for Ações Internacionais fields still in USD (mesmo padrão do formatBRL). */
export function formatUSD(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return formatMinus(USD_FORMATTER.format(value));
}

/**
 * "US$ 1.234,56 <span class="moeda-conv">(R$ 6.234,10)</span>" - valor
 * principal formatado por `formatterPrincipal` + o equivalente em outra
 * moeda (default BRL) menor do lado, entre parênteses. Sem conversão
 * disponível (valorSecundario não numérico), devolve só o principal -
 * nunca quebra por falta de câmbio. Pedido do Tiago (16/09/2026):
 * investimento internacional tem que aparecer em dólar com o
 * equivalente em reais do lado, menor - não escondido atrás de um
 * ícone "i" (padrão que já existia, meio solto, em
 * inicio.js!valorComConversaoBRL_ - essa função aqui é a versão
 * compartilhada, pra distribuicoes-metas.js poder usar também). Usa
 * innerHTML no chamador (o retorno tem uma <span> dentro) - a classe
 * "moeda-conv" está duplicada em inicio.css e distribuicoes-metas.css
 * (mesmo padrão de .skel/.area-header, ver o comentário lá).
 */
export function formatComConversao(valorPrincipal, valorSecundario, formatterPrincipal, formatterSecundario = formatBRL) {
  const texto = formatterPrincipal(valorPrincipal);
  if (typeof valorSecundario !== 'number' || !Number.isFinite(valorSecundario)) return texto;
  return `${texto} <span class="moeda-conv">(${formatterSecundario(valorSecundario)})</span>`;
}

const NUMERO_BR_FORMATTER_2CASAS = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "185.600,00" - número puro em pt-BR, sem símbolo de moeda nenhum. Uso
 * principal: pontos de índice (Ibovespa/IFIX/S&P 500), que não são
 * valor em dinheiro. decimals=2 usa um formatador já pronto (caminho
 * mais comum); qualquer outra contagem de casas monta um formatador
 * avulso na hora.
 */
export function formatNumeroBR(value, decimals = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  if (decimals === 2) return NUMERO_BR_FORMATTER_2CASAS.format(value);
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Número em pt-BR com as opções do Intl cruas (`minimumFractionDigits`, `maximumFractionDigits`, `useGrouping`...).
 * É o ÚNICO ponto do site que chama `toLocaleString('pt-BR', ...)` (o teste de arquitetura vigia). Sem trava de
 * não-numérico de propósito (igual ao `Number(v).toLocaleString` que os módulos usavam): quem precisa de "—" usa
 * `formatNumeroBR`. Hífen padrão no negativo (serve pra campo de formulário); pra texto de tela, `formatMinus`.
 */
export function formatNumeroPt(value, opcoes) {
  return Number(value).toLocaleString('pt-BR', opcoes);
}

function formatPercentValue(points, decimals) {
  if (typeof points !== 'number' || !Number.isFinite(points)) return '—';
  const sign = points > 0 ? '+' : '';
  return formatMinus(`${sign}${points.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`);
}

/**
 * Percentual com sinal EXPLÍCITO, escala em fração (0,013 = 1,3%): "+1,3%" / "−0,4%" / "0,0%" (zero sem sinal).
 * `casas` default 1. Não numérico -> "—". Substitui os ~15 `pct`/`pctSinal` locais (A-68).
 */
export function formatPctSinal(fracao, casas = 1) {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao)) return '—';
  const v = fracao * 100;
  const t = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const zero = Math.abs(v) < 0.5 * 10 ** -casas;
  return `${zero ? '' : (v > 0 ? '+' : MINUS)}${t}%`;
}

/** Percentual natural (negativo com "−", positivo sem "+"), escala em fração: 0,123 -> "12,3%". Não numérico -> "—". */
export function formatPct(fracao, casas = 1) {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao)) return '—';
  return `${formatMinus(formatNumeroBR(fracao * 100, casas))}%`;
}

/** "R$ 230 mil" / "R$ 2,06 mi" / "−R$ 90 mil" / "R$ 820" - reais abreviados pra eixo e legenda de gráfico. Não numérico -> "—". */
export function formatBRLMil(valor) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
  const a = Math.abs(valor);
  const t = a >= 1e6 ? `${formatNumeroBR(a / 1e6, 2)} mi` : a >= 1000 ? `${formatNumeroBR(a / 1000, a >= 1e5 ? 0 : 1)} mil` : formatNumeroBR(a, 0);
  return `${valor < 0 ? MINUS : ''}R$ ${t}`;
}

/** Percentual SEM sinal, escala em fração (0,0123 -> "1,2%"), valor absoluto. Não numérico -> "—". */
export function formatPctAbs(fracao, casas = 1) {
  if (typeof fracao !== 'number' || !Number.isFinite(fracao)) return '—';
  return `${Math.abs(fracao * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

// ---------------------------------------------------------------------------
// Meses e datas curtas (A-68: 18 cópias de MESES e 11 helpers de dd/mm)
// ---------------------------------------------------------------------------

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "Janeiro"... (título/rótulo com inicial maiúscula). */
export const MESES_LONGOS_CAPITAL = MESES_LONGOS.map((m) => m[0].toUpperCase() + m.slice(1));
/** "JAN"... e "JANEIRO"..."MARCO" (sem acento) - só pra RECONHECER mês em texto de planilha/holerite/fatura, não pra exibir. */
export const MESES_CURTOS_MAIUSC = MESES_CURTOS.map((m) => m.toUpperCase());
export const MESES_LONGOS_ASCII_MAIUSC = MESES_LONGOS.map((m) => m.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase());

const PARTES_DATA = /^(\d{4})-(\d{2})(?:-(\d{2}))?/;

/** "2026-09-24..." -> "24/09/2026". Sem data válida devolve `vazio` (default "—"). Texto puro, sem Date/fuso. */
export function formatDMA(iso, vazio = '—') {
  const m = PARTES_DATA.exec(String(iso || ''));
  return m && m[3] ? `${m[3]}/${m[2]}/${m[1]}` : vazio;
}

/** "2026-09-24..." -> "24/09". */
export function formatDM(iso, vazio = '—') {
  const m = PARTES_DATA.exec(String(iso || ''));
  return m && m[3] ? `${m[3]}/${m[2]}` : vazio;
}

/** "2026-09-24..." -> "24/09/26" (ano com 2 dígitos). */
export function formatDMAcurto(iso, vazio = '—') {
  const m = PARTES_DATA.exec(String(iso || ''));
  return m && m[3] ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : vazio;
}

/** "2026-09" (ou "2026-09-24") -> "set/26" (ou "set/2026" com `anoCurto: false`). Sem mês válido devolve `vazio` (default ""). */
export function formatMesAno(anoMes, { anoCurto = true, vazio = '' } = {}) {
  const m = PARTES_DATA.exec(String(anoMes || ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return vazio;
  return `${MESES_CURTOS[Number(m[2]) - 1]}/${anoCurto ? m[1].slice(2) : m[1]}`;
}

/**
 * value is a FRACTION (0.013 means 1.3%) - the scale most "Variação
 * dia" columns in the Carteira sheets use. -> "+1,30%"
 */
export function formatPercentFromFraction(value, decimals = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return formatPercentValue(value * 100, decimals);
}

/**
 * 05/10/2026 (auditoria A-04): variação que arredonda pra 0,00% é "sem variação" (mercado fechado/feriado):
 * não é alta nem queda, então não pode ficar verde nem ganhar seta. `fracao: true` quando o valor é fração
 * (0,013 = 1,3%); senão está em pontos percentuais. Não numérico também conta como nulo.
 */
export function variacaoNula(valor, { fracao = false } = {}) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return true;
  return Math.abs(fracao ? valor * 100 : valor) < 0.005;
}

/**
 * value is already in PERCENTAGE POINTS (1.3 means 1.3%) - the scale
 * GOOGLEFINANCE's changepct (Ibovespa/IFIX/S&P 500) uses. -> "+1,30%"
 */
export function formatPercentFromPoints(value, decimals = 2) {
  return formatPercentValue(value, decimals);
}

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// Fixed to America/Sao_Paulo rather than the runtime's local timezone -
// the app has exactly one user, in Brazil, and leaving this out makes
// the displayed time silently depend on where the code happens to run
// (a Node test machine, a browser with a different OS timezone, etc.),
// which is a much worse bug than any real timezone edge case.
const DATE_TZ = 'America/Sao_Paulo';

// 05/10/2026 (auditoria A-19): "hoje" calculado de 3 jeitos (fuso de SP via
// Intl, fuso local do navegador e UTC) - entre 21h e 24h em SP o UTC já é o
// dia seguinte e o mês corrente / "pago vs presumido" mudavam de lado à noite.
// ÚNICO helper de "hoje" do front: dia de calendário de São Paulo, seja qual
// for o fuso do aparelho. (No Apps Script o par é hojeSP_ em Proventos.gs.)
const FMT_DIA_SP = new Intl.DateTimeFormat('en-CA', { timeZone: DATE_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'yyyy-MM-dd' de hoje (ou do instante `agora`) em São Paulo. */
export function hojeSP(agora = new Date()) {
  const d = agora instanceof Date ? agora : new Date(agora);
  if (Number.isNaN(d.getTime())) return hojeSP(new Date());
  return FMT_DIA_SP.format(d);
}

// 'yyyy-MM-dd' puro (sem hora nenhuma) - é assim que historico[i].data
// (HistoricoInicio.gs) vem pro front-end. BUG real encontrado em
// 13/09/2026 (3ª rodada, testando a tooltip do gráfico de Rentabilidade):
// `new Date('2026-01-03')` é interpretado como meia-noite UTC, e
// convertendo isso pra America/Sao_Paulo (UTC-3) vira 2026-01-02 21:00 -
// ou seja, ESSA data (sem hora nenhuma) formatava um dia ATRASADA. Uma
// data pura de calendário não representa um instante no tempo, então não
// faz sentido nenhum "converter de fuso" nela - o caminho abaixo evita
// completamente o Date/timeZone pra esse caso, só reformatando os
// componentes ano/mês/dia direto do texto.
const SO_DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** "09/09/2026". Accepts a Date, an ISO string (with time), a timestamp,
 * or um 'yyyy-MM-dd' puro (esse último NUNCA passa pelo Date/fuso -
 * ver SO_DATA_REGEX acima). */
export function formatDateBR(value) {
  if (typeof value === 'string' && SO_DATA_REGEX.test(value)) {
    const [ano, mes, dia] = value.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: DATE_TZ });
}

/** "05/10, 14:30" - dia/mês + hora (carimbo curto de "atualizado em"), no fuso de São Paulo. */
export function formatDiaHoraBR(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: DATE_TZ });
}

/** "09/09/2026 10:01". Same accepted input types as formatDateBR. */
export function formatDateTimeBR(value) {
  const date = toDate(value);
  if (!date) return '—';
  const dateStr = date.toLocaleDateString('pt-BR', { timeZone: DATE_TZ });
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: DATE_TZ });
  return `${dateStr} ${timeStr}`;
}

/**
 * "há 12min" / "há 3h" / "há 2d" - for the refresh pill ("Cotações
 * atualizadas há Xmin") and the sync badge tooltip. now defaults to the
 * real clock but takes a fixed value in tests.
 */
export function formatRelativeTime(value, now = new Date()) {
  const date = toDate(value);
  const nowDate = toDate(now);
  if (!date || !nowDate) return '—';
  const diffMs = nowDate.getTime() - date.getTime();
  if (diffMs < 0) return 'agora';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `há ${diffD}d`;
}

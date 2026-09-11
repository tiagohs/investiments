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
const USD_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** "R$ 1.234,56". Non-finite input (NaN, null->NaN, etc.) renders as "—". */
export function formatBRL(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return BRL_FORMATTER.format(value);
}

/** "$1,234.56" - for Ações Internacionais fields still in USD. */
export function formatUSD(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return USD_FORMATTER.format(value);
}

function formatPercentValue(points, decimals) {
  if (typeof points !== 'number' || !Number.isFinite(points)) return '—';
  const sign = points > 0 ? '+' : '';
  return `${sign}${points.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`;
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

/** "09/09/2026". Accepts a Date, an ISO string, or a timestamp. */
export function formatDateBR(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: DATE_TZ });
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

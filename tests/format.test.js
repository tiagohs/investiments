// Unit tests for assets/js/format.js. Pure functions - no DOM, no
// mocking needed. Note: Intl.NumberFormat('pt-BR', {style:'currency'})
// puts a NON-BREAKING SPACE (U+00A0) between "R$" and the number, not a
// regular space - tests match on that exact character to catch a
// regression that would otherwise look identical when printed to a
// terminal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBRL,
  formatUSD,
  variacaoNula,
  formatNumeroBR,
  formatPercentFromFraction,
  formatPercentFromPoints,
  formatDateBR,
  formatDateTimeBR,
  formatRelativeTime,
  formatMinus,
  formatBRL0,
  formatBRLMil,
  formatPct,
  formatPctSinal,
  formatPctAbs,
  formatDMA,
  formatDM,
  formatDMAcurto,
  formatMesAno,
  formatNumeroPt,
  formatMoeda,
  MESES_CURTOS,
  MESES_LONGOS,
  MESES_LONGOS_ASCII_MAIUSC,
} from '../assets/js/format.js';

const NBSP = ' ';

// --- formatBRL / formatUSD -----------------------------------------------

test('formatBRL() formats a positive value with the R$ + non-breaking-space + pt-BR grouping', () => {
  assert.equal(formatBRL(1234.56), `R$${NBSP}1.234,56`);
});

test('formatBRL() formats zero and negative values', () => {
  assert.equal(formatBRL(0), `R$${NBSP}0,00`);
  assert.equal(formatBRL(-50), `\u2212R$${NBSP}50,00`);
});

test('formatBRL() returns an em dash for non-finite input instead of throwing', () => {
  assert.equal(formatBRL(NaN), '—');
  assert.equal(formatBRL(undefined), '—');
  assert.equal(formatBRL(null), '—');
  assert.equal(formatBRL('12.5'), '—'); // strings are not accepted, only numbers
});

test('formatUSD() usa o mesmo padrão do real (A-06): "US$" + espaço sem quebra + milhar com ponto e vírgula decimal', () => {
  assert.equal(formatUSD(1234.56), `US$${NBSP}1.234,56`);
  assert.equal(formatUSD(0), `US$${NBSP}0,00`);
  assert.equal(formatUSD(-50), `\u2212US$${NBSP}50,00`);
});

test('variacaoNula() trata 0,00% (e não numérico) como sem variação (A-04)', () => {
  assert.equal(variacaoNula(0), true);
  assert.equal(variacaoNula(0.004), true);
  assert.equal(variacaoNula(-0.004), true);
  assert.equal(variacaoNula(0.005), false);
  assert.equal(variacaoNula(0.00004, { fracao: true }), true);
  assert.equal(variacaoNula(0.013, { fracao: true }), false);
  assert.equal(variacaoNula(null), true);
  assert.equal(variacaoNula(NaN), true);
});

test('formatUSD() returns an em dash for non-finite input', () => {
  assert.equal(formatUSD(NaN), '—');
});

// --- formatPercentFromFraction / formatPercentFromPoints ------------------

test('formatPercentFromFraction() converts a fraction (0.013) to percentage points (1.30%)', () => {
  assert.equal(formatPercentFromFraction(0.013), '+1,30%');
});

test('formatPercentFromPoints() takes an already-in-points value (1.3) as-is', () => {
  assert.equal(formatPercentFromPoints(1.3), '+1,30%');
});

test('the two percent scales genuinely disagree on the same raw number - this is the bug the two functions exist to prevent', () => {
  // The same literal value 1.3 means wildly different things depending
  // on which scale it came from - GOOGLEFINANCE's changepct (points) vs
  // a Carteira sheet's "Variação dia" (fraction).
  assert.equal(formatPercentFromPoints(1.3), '+1,30%');
  assert.equal(formatPercentFromFraction(1.3), '+130,00%'); // 1.3 as a fraction is 130%, not 1.3%
});

test('percent formatters prefix a "+" for positive values, nothing extra for negative/zero', () => {
  assert.equal(formatPercentFromPoints(-1.3), '\u22121,30%');
  assert.equal(formatPercentFromPoints(0), '0,00%');
});

test('percent formatters respect a custom decimals count', () => {
  assert.equal(formatPercentFromPoints(1.2345, 1), '+1,2%');
  assert.equal(formatPercentFromPoints(1.2345, 0), '+1%');
});

test('percent formatters return an em dash for non-finite input', () => {
  assert.equal(formatPercentFromFraction(NaN), '—');
  assert.equal(formatPercentFromPoints(undefined), '—');
});


// --- formatNumeroBR ---------------------------------------------------------

test('formatNumeroBR() formats a plain pt-BR number, no currency symbol - for index points (Ibovespa/IFIX/S&P 500)', () => {
  assert.equal(formatNumeroBR(185600), '185.600,00');
  assert.equal(formatNumeroBR(3761.37), '3.761,37');
});

test('formatNumeroBR() respects a custom decimals count', () => {
  assert.equal(formatNumeroBR(185600, 0), '185.600');
});

test('formatNumeroBR() returns an em dash for non-finite input instead of throwing', () => {
  assert.equal(formatNumeroBR(NaN), '—');
  assert.equal(formatNumeroBR(undefined), '—');
  assert.equal(formatNumeroBR('185600'), '—'); // strings are not accepted, only numbers
});

// --- formatDateBR / formatDateTimeBR --------------------------------------
// Fixed to America/Sao_Paulo regardless of the machine's own timezone -
// these tests use a date built from an explicit UTC offset so the
// expected output is independent of the test runner's local TZ setting.

test('formatDateBR() formats a Date as DD/MM/AAAA in America/Sao_Paulo', () => {
  const date = new Date('2026-09-09T10:01:00-03:00');
  assert.equal(formatDateBR(date), '09/09/2026');
});

test('formatDateBR() also accepts an ISO string or a timestamp', () => {
  assert.equal(formatDateBR('2026-09-09T10:01:00-03:00'), '09/09/2026');
  assert.equal(formatDateBR(new Date('2026-09-09T10:01:00-03:00').getTime()), '09/09/2026');
});

test('formatDateBR() converts across a UTC day boundary correctly (America/Sao_Paulo is UTC-3)', () => {
  // 2026-09-09 23:30 in São Paulo is 2026-09-10 02:30 UTC - a formatter
  // that ignored timezone entirely could plausibly show the wrong day.
  const date = new Date('2026-09-09T23:30:00-03:00');
  assert.equal(formatDateBR(date), '09/09/2026');
});

test('formatDateBR() returns an em dash for an invalid date', () => {
  assert.equal(formatDateBR('not-a-date'), '—');
  assert.equal(formatDateBR(new Date('invalid')), '—');
  assert.equal(formatDateBR(null), '—');
});

test('formatDateBR() com uma data "pura" (yyyy-MM-dd, sem hora - o formato de historico[i].data) NUNCA volta um dia (bug real: new Date("2026-01-03") é meia-noite UTC, que em America/Sao_Paulo (UTC-3) cai em 02/01)', () => {
  assert.equal(formatDateBR('2026-01-03'), '03/01/2026');
  assert.equal(formatDateBR('2026-01-01'), '01/01/2026', 'nem no dia 1º do mês/ano - o caso mais fácil de mascarar o bug');
});

test('formatDateTimeBR() formats date and time together, in America/Sao_Paulo', () => {
  const date = new Date('2026-09-09T10:01:00-03:00');
  assert.equal(formatDateTimeBR(date), '09/09/2026 10:01');
});

test('formatDateTimeBR() returns an em dash for an invalid date', () => {
  assert.equal(formatDateTimeBR('not-a-date'), '—');
});

// --- formatRelativeTime ---------------------------------------------------

test('formatRelativeTime() renders minutes, hours, and days', () => {
  const now = new Date('2026-09-09T12:00:00-03:00');
  assert.equal(formatRelativeTime(new Date('2026-09-09T11:48:00-03:00'), now), 'há 12min');
  assert.equal(formatRelativeTime(new Date('2026-09-09T09:00:00-03:00'), now), 'há 3h');
  assert.equal(formatRelativeTime(new Date('2026-09-07T12:00:00-03:00'), now), 'há 2d');
});

test('formatRelativeTime() renders "agora" for anything under a minute old', () => {
  const now = new Date('2026-09-09T12:00:00-03:00');
  assert.equal(formatRelativeTime(new Date('2026-09-09T11:59:30-03:00'), now), 'agora');
  assert.equal(formatRelativeTime(now, now), 'agora');
});

test('formatRelativeTime() renders "agora" instead of a negative duration for a future timestamp', () => {
  const now = new Date('2026-09-09T12:00:00-03:00');
  assert.equal(formatRelativeTime(new Date('2026-09-09T12:05:00-03:00'), now), 'agora');
});

test('formatRelativeTime() returns an em dash when the value is not a valid date', () => {
  assert.equal(formatRelativeTime('not-a-date'), '—');
});

// --- A-68 (05/10/2026): sinal "−" único, helpers centrais de reais inteiros, %, data curta e meses ---------

test('formatMinus() troca só o hífen do início por "−" (U+2212)', () => {
  assert.equal(formatMinus('-R$ 5,00'), '\u2212R$ 5,00');
  assert.equal(formatMinus('-1,3%'), '\u22121,3%');
  assert.equal(formatMinus('1-2'), '1-2');
  assert.equal(formatMinus('+1,3%'), '+1,3%');
});

test('formatBRL/formatUSD/percentuais: negativo sai com "−", não com hífen', () => {
  assert.equal(formatBRL(-50), `\u2212R$${NBSP}50,00`);
  assert.equal(formatUSD(-50), `\u2212US$${NBSP}50,00`);
  assert.equal(formatPercentFromPoints(-1.3), '\u22121,30%');
  assert.equal(formatPercentFromFraction(-0.013), '\u22121,30%');
});

test('formatBRL0() = reais inteiros, arredondados, sem centavo', () => {
  assert.equal(formatBRL0(1234.56), `R$${NBSP}1.235`);
  assert.equal(formatBRL0(7), `R$${NBSP}7`);
  assert.equal(formatBRL0(-7.4), `\u2212R$${NBSP}7`);
  assert.equal(formatBRL0(-0.3), `R$${NBSP}0`); // sem "−R$ 0"
  assert.equal(formatBRL0(NaN), '—');
  assert.equal(formatBRL0(null), '—');
});

test('formatBRLMil() abrevia pra eixo/legenda', () => {
  assert.equal(formatBRLMil(230000), 'R$ 230 mil');
  assert.equal(formatBRLMil(2060000), 'R$ 2,06 mi');
  assert.equal(formatBRLMil(-90000), '\u2212R$ 90,0 mil');
  assert.equal(formatBRLMil(820), 'R$ 820');
  assert.equal(formatBRLMil(undefined), '—');
});

test('formatPct / formatPctSinal / formatPctAbs (escala em fração)', () => {
  assert.equal(formatPct(0.123), '12,3%');
  assert.equal(formatPct(-0.123), '\u221212,3%');
  assert.equal(formatPct(0.5, 0), '50%');
  assert.equal(formatPct(null), '—');
  assert.equal(formatPctSinal(0.0123), '+1,2%');
  assert.equal(formatPctSinal(-0.0123), '\u22121,2%');
  assert.equal(formatPctSinal(0.0001), '0,0%'); // arredonda pra zero: sem sinal
  assert.equal(formatPctSinal(0.0123, 2), '+1,23%');
  assert.equal(formatPctAbs(-0.0123), '1,2%');
  assert.equal(formatPctAbs(0.5, 0), '50%');
});

test('datas curtas a partir de texto yyyy-mm-dd (sem fuso)', () => {
  assert.equal(formatDMA('2026-09-24'), '24/09/2026');
  assert.equal(formatDMA('2026-09-24T23:59:00Z'), '24/09/2026');
  assert.equal(formatDM('2026-09-24'), '24/09');
  assert.equal(formatDMAcurto('2026-09-24'), '24/09/26');
  assert.equal(formatDMA(''), '—');
  assert.equal(formatDMA(null, ''), '');
  assert.equal(formatDMA('2026-09'), '—');
  assert.equal(formatMesAno('2026-09'), 'set/26');
  assert.equal(formatMesAno('2026-09-24', { anoCurto: false }), 'set/2026');
  assert.equal(formatMesAno('lixo'), '');
  assert.equal(formatMesAno('lixo', { vazio: '—' }), '—');
});

test('MESES_*: 12 nomes, variantes derivadas da mesma lista', () => {
  assert.equal(MESES_CURTOS.length, 12);
  assert.equal(MESES_LONGOS.length, 12);
  assert.equal(MESES_LONGOS[2], 'março');
  assert.equal(MESES_LONGOS_ASCII_MAIUSC[2], 'MARCO');
});

test('formatNumeroPt() e formatMoeda()', () => {
  assert.equal(formatNumeroPt(1234.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '1.234,50');
  assert.equal(formatNumeroPt(1234567), '1.234.567');
  assert.equal(formatMoeda(5000, 'EUR'), `€${NBSP}5.000,00`);
  assert.equal(formatMoeda(1234.5, 'BRL', { casas: 0 }), `R$${NBSP}1.235`);
  assert.equal(formatMoeda(null), '—');
});

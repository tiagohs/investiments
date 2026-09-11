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
  formatPercentFromFraction,
  formatPercentFromPoints,
  formatDateBR,
  formatDateTimeBR,
  formatRelativeTime,
} from '../assets/js/format.js';

const NBSP = ' ';

// --- formatBRL / formatUSD -----------------------------------------------

test('formatBRL() formats a positive value with the R$ + non-breaking-space + pt-BR grouping', () => {
  assert.equal(formatBRL(1234.56), `R$${NBSP}1.234,56`);
});

test('formatBRL() formats zero and negative values', () => {
  assert.equal(formatBRL(0), `R$${NBSP}0,00`);
  assert.equal(formatBRL(-50), `-R$${NBSP}50,00`);
});

test('formatBRL() returns an em dash for non-finite input instead of throwing', () => {
  assert.equal(formatBRL(NaN), '—');
  assert.equal(formatBRL(undefined), '—');
  assert.equal(formatBRL(null), '—');
  assert.equal(formatBRL('12.5'), '—'); // strings are not accepted, only numbers
});

test('formatUSD() formats with the en-US pattern (symbol, no space, dot decimal)', () => {
  assert.equal(formatUSD(1234.56), '$1,234.56');
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
  assert.equal(formatPercentFromPoints(-1.3), '-1,30%');
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

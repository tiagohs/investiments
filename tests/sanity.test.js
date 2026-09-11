// Teste de sanidade - so confirma que a esteira (node --test + ESM) esta
// funcionando antes de qualquer teste de verdade depender dela.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('esteira de testes unitarios esta funcionando', () => {
  assert.equal(1 + 1, 2);
});

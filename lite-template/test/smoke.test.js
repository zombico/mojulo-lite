// Tier 0 smoke test for the lite-template test runner.
//
// This file exists to prove `node --test test/` is wired and to give a
// minimal target for CI to fail loudly on if the runner regresses. Full
// coverage for json-extractor.js lives in Tier 2.2f — when that's written,
// this smoke can be deleted.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractJSON } = require('../helper/json-extractor.js');

test('Tier 0 smoke — extractJSON parses pure JSON', () => {
  assert.deepEqual(extractJSON('{"answer":"hi"}'), { answer: 'hi' });
});

test('Tier 0 smoke — extractJSON throws on input with no JSON object', () => {
  assert.throws(() => extractJSON('plain text, no braces'), /No JSON object found/);
});

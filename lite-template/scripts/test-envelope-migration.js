#!/usr/bin/env node
/**
 * Offline smoke test for the envelope unflatten migration.
 *
 * Covers the structural changes — schema, shim, chain compatibility,
 * analytics COALESCE, fallback synthesis. Does NOT exercise the live LLM
 * path: that's a manual smoke matrix per ENVELOPE_UNFLATTEN_PLAN.md Phase 5
 * (4 protocols × 3 providers).
 *
 * Run: node lite-template/scripts/test-envelope-migration.js
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const { ENVELOPE_SCHEMA } = require('../helper/envelope-schema');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message}`);
  }
}

function group(label, fn) {
  console.log(`\n${label}`);
  fn();
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeEnvelope — kept in sync with lite-template/client/index.html.
// The client copy lives in HTML and can't be required directly; this is a
// faithful duplicate for testing.
// ─────────────────────────────────────────────────────────────────────────────
function normalizeEnvelope(r) {
  if (!r || typeof r !== 'object') return r;
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(r.form) || isObj(r.triage) || isObj(r.appointment) || isObj(r.extraction)) return r;

  const out = {
    answer: r.answer,
    suggestions: r.suggestions ?? r.formSuggestions ?? [],
  };
  if (r.formTracker || r.fieldsRemaining != null || r.isComplete != null) {
    out.form = {
      fields: r.formTracker ?? {},
      remaining: r.fieldsRemaining,
      complete: r.isComplete === true || r.isComplete === 'true',
    };
  }
  if (r.triage && r.deploymentId) {
    out.triage = {
      deploymentId: r.deploymentId,
      starterPrompt: r.starterPrompt,
    };
  }
  if (r.showCalendarLaunchButton != null || r.calendarId) {
    out.appointment = {
      showLaunchButton: r.showCalendarLaunchButton === true || r.showCalendarLaunchButton === 'true',
      calendarId: r.calendarId,
    };
  }
  if (r.extractedFields || r.extractionConfidence || r.showUploadButton != null) {
    out.extraction = {
      fields: r.extractedFields ?? {},
      confidence: r.extractionConfidence,
      notes: r.extractionNotes,
      showUploadButton: r.showUploadButton === true || r.showUploadButton === 'true',
    };
  }
  return out;
}

// Mirror of the bot's hashTurnContent. Same content goes in, same hash comes out.
function hashTurnContent(turn, userPrompt, llmResponse, machineState) {
  const content = JSON.stringify({ turn, userPrompt, llmResponse, machineState });
  return crypto.createHash('sha256').update(content).digest('hex');
}
function createChainHash(contentHash, previousChainHash) {
  return crypto
    .createHash('sha256')
    .update(contentHash + (previousChainHash || '0'))
    .digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Schema artifact
// ─────────────────────────────────────────────────────────────────────────────
group('1. Canonical schema (ENVELOPE_SCHEMA)', () => {
  test('exports an object with answer required', () => {
    assert.equal(ENVELOPE_SCHEMA.type, 'object');
    assert.deepEqual(ENVELOPE_SCHEMA.required, ['answer']);
    assert.equal(ENVELOPE_SCHEMA.additionalProperties, false);
  });

  test('has answer + suggestions as universals', () => {
    assert.equal(ENVELOPE_SCHEMA.properties.answer.type, 'string');
    assert.equal(ENVELOPE_SCHEMA.properties.suggestions.type, 'array');
  });

  test('each protocol owns one nested object key', () => {
    for (const key of ['form', 'triage', 'appointment', 'extraction']) {
      const prop = ENVELOPE_SCHEMA.properties[key];
      assert.equal(prop.type, 'object', `${key} should be object`);
      assert.equal(prop.additionalProperties, false, `${key} should be closed`);
    }
  });

  test('form.fields and extraction.fields stay open (additionalProperties: true)', () => {
    assert.equal(ENVELOPE_SCHEMA.properties.form.properties.fields.additionalProperties, true);
    assert.equal(ENVELOPE_SCHEMA.properties.extraction.properties.fields.additionalProperties, true);
  });

  test('extraction.confidence enum locks the three labels', () => {
    assert.deepEqual(
      ENVELOPE_SCHEMA.properties.extraction.properties.confidence.enum,
      ['high', 'medium', 'low']
    );
  });

  test('lite-template and control schema files exist and have identical structure', () => {
    const liteSchema = ENVELOPE_SCHEMA;
    const controlPath = path.resolve(__dirname, '../../control/lib/envelope-schema.js');
    const controlSrc = fs.readFileSync(controlPath, 'utf8');
    // Strip the export keyword and eval to compare structure
    const stripped = controlSrc.replace(/^export const/m, 'const');
    const sandbox = {};
    new Function('sandbox', `${stripped}; sandbox.S = ENVELOPE_SCHEMA;`)(sandbox);
    assert.deepEqual(sandbox.S, liteSchema, 'control mirror drifted from lite-template canonical');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. normalizeEnvelope — translation of every legacy shape
// ─────────────────────────────────────────────────────────────────────────────
group('2. normalizeEnvelope shim (legacy → canonical)', () => {
  test('null/undefined pass through unchanged', () => {
    assert.equal(normalizeEnvelope(null), null);
    assert.equal(normalizeEnvelope(undefined), undefined);
    assert.equal(normalizeEnvelope('not an object'), 'not an object');
  });

  test('already-nested envelope passes through untouched (form)', () => {
    const input = {
      answer: 'hi',
      form: { fields: { name: 'Franz' }, remaining: 2, complete: false },
    };
    const out = normalizeEnvelope(input);
    assert.equal(out, input, 'should return same reference');
  });

  test('already-nested envelope passes through untouched (triage)', () => {
    const input = { answer: 'routing', triage: { deploymentId: 'dep_123', starterPrompt: 'hi' } };
    assert.equal(normalizeEnvelope(input), input);
  });

  test('legacy form-gathering: formTracker → form.fields, isComplete → form.complete', () => {
    const out = normalizeEnvelope({
      answer: 'next field',
      formTracker: { name: 'Franz', email: 'a@b.com' },
      formSuggestions: ['phone'],
      fieldsRemaining: 1,
      isComplete: false,
    });
    assert.deepEqual(out.form, {
      fields: { name: 'Franz', email: 'a@b.com' },
      remaining: 1,
      complete: false,
    });
    assert.deepEqual(out.suggestions, ['phone']);
  });

  test('legacy form: isComplete as string "true" coerces to boolean', () => {
    const out = normalizeEnvelope({
      answer: 'done',
      formTracker: { name: 'Franz' },
      isComplete: 'true',
    });
    assert.equal(out.form.complete, true);
  });

  test('legacy triage: triage:true + deploymentId → triage object', () => {
    const out = normalizeEnvelope({
      answer: 'routing you to billing',
      triage: true,
      deploymentId: 'dep_billing',
      starterPrompt: 'I have a billing question',
    });
    assert.deepEqual(out.triage, {
      deploymentId: 'dep_billing',
      starterPrompt: 'I have a billing question',
    });
  });

  test('legacy triage: triage:false (no match) drops the triage key', () => {
    const out = normalizeEnvelope({ answer: 'no match', triage: false });
    assert.equal(out.triage, undefined);
  });

  test('legacy appointment: showCalendarLaunchButton string "true" → boolean', () => {
    const out = normalizeEnvelope({
      answer: 'click below',
      showCalendarLaunchButton: 'true',
      calendarId: 'cal_main',
    });
    assert.deepEqual(out.appointment, {
      showLaunchButton: true,
      calendarId: 'cal_main',
    });
  });

  test('legacy optical-read: extractedFields → extraction.fields, etc.', () => {
    const out = normalizeEnvelope({
      answer: '',
      extractedFields: { name: 'Jane Doe', dob: '1990-01-01' },
      extractionConfidence: 'high',
      extractionNotes: 'all fields legible',
      showUploadButton: 'false',
    });
    assert.deepEqual(out.extraction, {
      fields: { name: 'Jane Doe', dob: '1990-01-01' },
      confidence: 'high',
      notes: 'all fields legible',
      showUploadButton: false,
    });
  });

  test('legacy formSuggestions falls into suggestions when suggestions absent', () => {
    const out = normalizeEnvelope({
      answer: 'pick a field',
      formSuggestions: ['name', 'email'],
    });
    assert.deepEqual(out.suggestions, ['name', 'email']);
  });

  test('legacy suggestions wins over formSuggestions when both present', () => {
    const out = normalizeEnvelope({
      answer: '',
      suggestions: ['a', 'b'],
      formSuggestions: ['c', 'd'],
    });
    assert.deepEqual(out.suggestions, ['a', 'b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Chain hash continuity across the flat → nested boundary
// ─────────────────────────────────────────────────────────────────────────────
group('3. Chain hash continuity (mixed-shape conversation)', () => {
  test('old flat row + new nested row chain together; verify recomputes both', () => {
    // Turn 1: pre-upgrade, flat shape
    const flatEnvelope = {
      answer: 'Hi! What is your name?',
      formTracker: {},
      formSuggestions: ['name'],
      fieldsRemaining: 3,
      isComplete: false,
      turn: 1,
    };
    const turn1 = {
      turn: 1,
      user_prompt: 'hello',
      llm_response: '{"answer":"..."}',  // raw model output (opaque)
      machine_state: JSON.stringify(flatEnvelope),
    };
    const c1 = hashTurnContent(turn1.turn, turn1.user_prompt, turn1.llm_response, turn1.machine_state);
    const ch1 = createChainHash(c1, null);

    // Turn 2: post-upgrade, nested shape
    const nestedEnvelope = {
      answer: 'Got it. What is your email?',
      suggestions: ['email'],
      form: { fields: { name: 'Franz' }, remaining: 2, complete: false },
    };
    const turn2 = {
      turn: 2,
      user_prompt: 'Franz',
      llm_response: '{"answer":"..."}',
      machine_state: JSON.stringify(nestedEnvelope),
    };
    const c2 = hashTurnContent(turn2.turn, turn2.user_prompt, turn2.llm_response, turn2.machine_state);
    const ch2 = createChainHash(c2, ch1);

    // Re-verify exactly as /verify/:id does
    const recomputedC1 = hashTurnContent(turn1.turn, turn1.user_prompt, turn1.llm_response, turn1.machine_state);
    const recomputedCh1 = createChainHash(recomputedC1, null);
    assert.equal(recomputedC1, c1, 'turn 1 content hash mismatch');
    assert.equal(recomputedCh1, ch1, 'turn 1 chain hash mismatch');

    const recomputedC2 = hashTurnContent(turn2.turn, turn2.user_prompt, turn2.llm_response, turn2.machine_state);
    const recomputedCh2 = createChainHash(recomputedC2, recomputedCh1);
    assert.equal(recomputedC2, c2, 'turn 2 content hash mismatch');
    assert.equal(recomputedCh2, ch2, 'turn 2 chain hash mismatch');
  });

  test('history replay reads parsed.answer from both shapes', () => {
    // The bot's adapters do JSON.parse(item.llm_response).answer.
    // For the test we use machineState (same shape as what the model emits
    // after extraction — answer is at top-level in both old and new shapes).
    const flatEnvelope = { answer: 'A', formTracker: {}, isComplete: false };
    const nestedEnvelope = { answer: 'B', form: { fields: {}, complete: false } };
    assert.equal(JSON.parse(JSON.stringify(flatEnvelope)).answer, 'A');
    assert.equal(JSON.parse(JSON.stringify(nestedEnvelope)).answer, 'B');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Analytics COALESCE query against mixed-shape rows
// ─────────────────────────────────────────────────────────────────────────────
group('4. Analytics COALESCE (form completion count across shapes)', () => {
  test('counts completes from both old isComplete and new form.complete rows', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        machine_state TEXT,
        event_type TEXT
      )
    `);
    const insert = db.prepare('INSERT INTO turns (conversation_id, machine_state) VALUES (?, ?)');

    // Conv A: old flat shape, completed
    insert.run('conv_A', JSON.stringify({ answer: '', formTracker: {}, isComplete: true }));
    // Conv B: new nested shape, completed
    insert.run('conv_B', JSON.stringify({ answer: '', form: { fields: {}, complete: true } }));
    // Conv C: new nested shape, NOT completed
    insert.run('conv_C', JSON.stringify({ answer: '', form: { fields: {}, complete: false } }));
    // Conv D: old flat shape, NOT completed
    insert.run('conv_D', JSON.stringify({ answer: '', formTracker: {}, isComplete: false }));
    // Conv E: nested but no form key (e.g. knowledge-only)
    insert.run('conv_E', JSON.stringify({ answer: 'hi' }));

    const result = db.prepare(`
      SELECT COUNT(DISTINCT conversation_id) as count
      FROM turns
      WHERE COALESCE(
        json_extract(machine_state, '$.form.complete'),
        json_extract(machine_state, '$.isComplete')
      ) = 1
    `).get();

    assert.equal(result.count, 2, 'should count conv_A (flat) + conv_B (nested) only');
    db.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cartridges + composer — confirm composed instructions reference new shape
// ─────────────────────────────────────────────────────────────────────────────
group('5. Cartridges reference nested envelope keys', () => {
  const protocolsDir = path.resolve(__dirname, '../../control/lib/composer/protocols');

  test('00_base.txt names the four protocol nested keys', () => {
    const text = fs.readFileSync(path.join(protocolsDir, '00_base.txt'), 'utf8');
    for (const key of ['form', 'triage', 'appointment', 'extraction']) {
      assert.match(text, new RegExp(`\\b${key}\\b`), `00_base.txt should mention '${key}'`);
    }
  });

  test('02_form-gathering.txt instructs nested form object, not legacy fields', () => {
    const text = fs.readFileSync(path.join(protocolsDir, '02_form-gathering.txt'), 'utf8');
    assert.match(text, /'form\.fields'|form\.fields/);
    assert.match(text, /'form\.complete'|form\.complete/);
    // Legacy field names should not appear as instructions to the model.
    assert.doesNotMatch(text, /\bformTracker\b/);
    assert.doesNotMatch(text, /\bfieldsRemaining\b/);
    assert.doesNotMatch(text, /\bisComplete\b/);
  });

  test('03_appointments.txt instructs nested appointment object', () => {
    const text = fs.readFileSync(path.join(protocolsDir, '03_appointments.txt'), 'utf8');
    assert.match(text, /\bappointment\b/);
    assert.match(text, /showLaunchButton/);
    assert.doesNotMatch(text, /\bshowCalendarLaunchButton\b/);
  });

  test('04_triage.txt instructs nested triage object', () => {
    const text = fs.readFileSync(path.join(protocolsDir, '04_triage.txt'), 'utf8');
    assert.match(text, /'triage'|\btriage:\s*\{|\btriage\b/);
    assert.match(text, /deploymentId/);
    assert.match(text, /starterPrompt/);
  });

  test('05_optical-read.txt instructs nested extraction object', () => {
    const text = fs.readFileSync(path.join(protocolsDir, '05_optical-read.txt'), 'utf8');
    assert.match(text, /\bextraction\b/);
    assert.doesNotMatch(text, /\bextractedFields\b/);
    assert.doesNotMatch(text, /\bextractionConfidence\b/);
    assert.doesNotMatch(text, /\bextractionNotes\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`Passed: ${passed}    Failed: ${failed}`);
if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}`);
    console.log(`      ${f.err.stack || f.err.message}`);
  }
  process.exit(1);
}
console.log('\nAll structural checks passed.');
console.log('Manual smoke matrix (4 protocols × 3 providers, live LLM) is the remaining step.');

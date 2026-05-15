// Tier 1.1a — hash chain algorithm spec.
//
// The production hashing logic lives INLINE in lite-template/server.js
// (`hashTurnContent`, `createChainHash`, and the chain-tracking loop in
// `verifyConversation`). Those functions can't be required from this test
// file because `require('../server.js')` boots Express + reads
// config/config.json at module-load time.
//
// So this file is a *spec*, not an integration test. The algorithm is
// reimplemented here as a reference and tested against fixed inputs. If
// you change the algorithm in server.js, change it here too — otherwise
// every existing customer conversation's /verify call breaks.
//
// What this catches:
//   - Algorithm regressions in the test file (someone changes the spec
//     thinking it's harmless).
//   - Snapshot drift if the documented hash output changes.
// What this does NOT catch:
//   - server.js diverging from this spec. That gap needs an integration
//     test against the running bot (deferred to Tier 2 with the server
//     scaffold).
//
// Tradeoff accepted because extracting these into helpers broke the app
// (the original refactor attempt is in git history if you want the diff).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Reference implementation of the algorithm in server.js. Keep this in sync
// with lite-template/server.js's `hashTurnContent` + `createChainHash` +
// the chain-tracking loop in `verifyConversation`.
// ---------------------------------------------------------------------------
function refHashTurnContent(turn, userPrompt, llmResponse, machineState) {
  const content = JSON.stringify({ turn, userPrompt, llmResponse, machineState });
  return crypto.createHash('sha256').update(content).digest('hex');
}

function refCreateChainHash(contentHash, previousChainHash) {
  const combined = contentHash + (previousChainHash || '0');
  return crypto.createHash('sha256').update(combined).digest('hex');
}

function refVerifyTurns(turns) {
  if (!Array.isArray(turns) || turns.length === 0) {
    return { valid: true, totalTurns: 0, message: 'No turns to verify' };
  }
  const chainMap = new Map();
  let isValid = true;
  let invalidCount = 0;
  for (const t of turns) {
    const prevHash = chainMap.get(t.conversation_id) || t.handoff_hash || null;
    const expectedContentHash = refHashTurnContent(t.turn, t.user_prompt, t.llm_response, t.machine_state);
    const expectedChainHash = refCreateChainHash(t.content_hash, prevHash);
    if (expectedContentHash !== t.content_hash || expectedChainHash !== t.chain_hash) {
      isValid = false;
      invalidCount++;
    }
    chainMap.set(t.conversation_id, t.chain_hash);
  }
  return { valid: isValid, totalTurns: turns.length, invalidTurns: invalidCount, conversationsVerified: chainMap.size };
}

// ---------------------------------------------------------------------------
// Algorithm snapshots — lock the exact hash for fixed inputs. The day the
// algorithm changes (intentionally or otherwise), these snapshots fail and
// the change becomes a deliberate, documented event.
// ---------------------------------------------------------------------------
describe('hashTurnContent — algorithm snapshot', () => {
  test('canonical content hash for a "hello world" turn is stable', () => {
    // The four-key object {turn, userPrompt, llmResponse, machineState} is
    // stringified in source order; sha256 hex digest is the output.
    const expected = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        turn: 1,
        userPrompt: 'hello',
        llmResponse: '{"answer":"hi"}',
        machineState: '{"answer":"hi"}',
      }))
      .digest('hex');
    assert.equal(
      refHashTurnContent(1, 'hello', '{"answer":"hi"}', '{"answer":"hi"}'),
      expected,
    );
  });

  test('different inputs produce different content hashes', () => {
    assert.notEqual(refHashTurnContent(1, 'a', 'x', '{}'), refHashTurnContent(1, 'b', 'x', '{}'));
  });

  test('identical inputs produce identical content hashes (determinism)', () => {
    assert.equal(
      refHashTurnContent(7, 'p', 'r', '{"k":"v"}'),
      refHashTurnContent(7, 'p', 'r', '{"k":"v"}'),
    );
  });

  test('hash is 64 lowercase hex chars (sha256 hex digest)', () => {
    assert.match(refHashTurnContent(0, '', '', ''), /^[0-9a-f]{64}$/);
  });
});

describe('createChainHash — algorithm snapshot', () => {
  test('combines contentHash + previousChainHash as concatenated input', () => {
    const ch = 'a'.repeat(64);
    const prev = 'b'.repeat(64);
    const expected = crypto.createHash('sha256').update(ch + prev).digest('hex');
    assert.equal(refCreateChainHash(ch, prev), expected);
  });

  test('falls back to literal "0" when previousChainHash is null/undefined/empty', () => {
    const ch = 'c'.repeat(64);
    const expected = crypto.createHash('sha256').update(ch + '0').digest('hex');
    assert.equal(refCreateChainHash(ch, null), expected);
    assert.equal(refCreateChainHash(ch, undefined), expected);
    assert.equal(refCreateChainHash(ch, ''), expected);
  });

  test('different previous hashes yield different chain hashes', () => {
    const ch = 'd'.repeat(64);
    assert.notEqual(refCreateChainHash(ch, 'a'.repeat(64)), refCreateChainHash(ch, 'b'.repeat(64)));
  });
});

// ---------------------------------------------------------------------------
// Helpers for building test chains
// ---------------------------------------------------------------------------
function buildChatTurn({ conversationId, turn, userPrompt, llmResponse, machineState, handoffHash = null }) {
  const contentHash = refHashTurnContent(turn, userPrompt, llmResponse, machineState);
  return {
    conversation_id: conversationId,
    turn,
    user_prompt: userPrompt,
    llm_response: llmResponse,
    machine_state: machineState,
    content_hash: contentHash,
    chain_hash: null,
    handoff_hash: handoffHash,
    event_type: 'chat',
  };
}

function buildChain(turns) {
  const out = [];
  const chainMap = new Map();
  for (const t of turns) {
    const prev = chainMap.get(t.conversation_id) || t.handoff_hash || null;
    const chainHash = refCreateChainHash(t.content_hash, prev);
    chainMap.set(t.conversation_id, chainHash);
    out.push({ ...t, chain_hash: chainHash });
  }
  return out;
}

// ---------------------------------------------------------------------------
// verifyTurns — chain composition + verification
// ---------------------------------------------------------------------------
describe('verify — happy path', () => {
  test('empty array verifies as valid with totalTurns: 0', () => {
    const r = refVerifyTurns([]);
    assert.equal(r.valid, true);
    assert.equal(r.totalTurns, 0);
  });

  test('a single-turn conversation verifies', () => {
    const turns = buildChain([
      buildChatTurn({ conversationId: 'c1', turn: 1, userPrompt: 'hi', llmResponse: 'hello', machineState: '{}' }),
    ]);
    const r = refVerifyTurns(turns);
    assert.equal(r.valid, true);
    assert.equal(r.totalTurns, 1);
    assert.equal(r.invalidTurns, 0);
  });

  test('a 10-turn chain verifies end-to-end', () => {
    const turns = buildChain(
      Array.from({ length: 10 }, (_, i) => buildChatTurn({
        conversationId: 'c1',
        turn: i + 1,
        userPrompt: `prompt-${i}`,
        llmResponse: `resp-${i}`,
        machineState: JSON.stringify({ i }),
      })),
    );
    const r = refVerifyTurns(turns);
    assert.equal(r.valid, true);
    assert.equal(r.totalTurns, 10);
  });

  test('multi-conversation array verifies (each chain tracked independently)', () => {
    const turns = buildChain([
      buildChatTurn({ conversationId: 'c1', turn: 1, userPrompt: 'a', llmResponse: 'A', machineState: '{}' }),
      buildChatTurn({ conversationId: 'c1', turn: 2, userPrompt: 'b', llmResponse: 'B', machineState: '{}' }),
      buildChatTurn({ conversationId: 'c2', turn: 1, userPrompt: 'x', llmResponse: 'X', machineState: '{}' }),
    ]);
    assert.equal(refVerifyTurns(turns).conversationsVerified, 2);
  });
});

// ---------------------------------------------------------------------------
// Tamper detection — mutate any field, assert verification fails.
// ---------------------------------------------------------------------------
describe('verify — tamper detection (any-field mutation invalidates)', () => {
  function makeValidChain() {
    return buildChain([
      buildChatTurn({ conversationId: 'c1', turn: 1, userPrompt: 'first', llmResponse: 'r1', machineState: '{"k":1}' }),
      buildChatTurn({ conversationId: 'c1', turn: 2, userPrompt: 'second', llmResponse: 'r2', machineState: '{"k":2}' }),
      buildChatTurn({ conversationId: 'c1', turn: 3, userPrompt: 'third', llmResponse: 'r3', machineState: '{"k":3}' }),
    ]);
  }

  for (const field of ['user_prompt', 'llm_response', 'machine_state']) {
    test(`mutating ${field} on any turn fails verification`, () => {
      for (let idx = 0; idx < 3; idx++) {
        const chain = makeValidChain();
        chain[idx][field] = `${chain[idx][field]}-TAMPERED`;
        assert.equal(refVerifyTurns(chain).valid, false, `tampering turn ${idx + 1}.${field} should invalidate`);
      }
    });
  }

  test('mutating the turn (sequence number) fails verification', () => {
    const chain = makeValidChain();
    chain[1].turn = 99;
    assert.equal(refVerifyTurns(chain).valid, false);
  });

  test('mutating the stored content_hash fails verification', () => {
    const chain = makeValidChain();
    chain[1].content_hash = 'f'.repeat(64);
    assert.equal(refVerifyTurns(chain).valid, false);
  });

  test('mutating the stored chain_hash fails verification', () => {
    const chain = makeValidChain();
    chain[1].chain_hash = '0'.repeat(64);
    assert.equal(refVerifyTurns(chain).valid, false);
  });
});

// ---------------------------------------------------------------------------
// Federated handoff — first turn seeds prevHash from handoff_hash.
// docs/federated-routing.md.
// ---------------------------------------------------------------------------
describe('verify — federated handoff', () => {
  test('first turn with handoff_hash chains off it, not off "0"', () => {
    const incomingTip = crypto.createHash('sha256').update('sender-chain-tip').digest('hex');

    const t1Content = refHashTurnContent(1, 'starter', 'r1', '{}');
    const t1Chain = refCreateChainHash(t1Content, incomingTip);
    const t2Content = refHashTurnContent(2, 'reply', 'r2', '{}');
    const t2Chain = refCreateChainHash(t2Content, t1Chain);

    const turns = [
      {
        conversation_id: 'handed-off',
        turn: 1,
        user_prompt: 'starter',
        llm_response: 'r1',
        machine_state: '{}',
        content_hash: t1Content,
        chain_hash: t1Chain,
        handoff_hash: incomingTip,
        event_type: 'chat',
      },
      {
        conversation_id: 'handed-off',
        turn: 2,
        user_prompt: 'reply',
        llm_response: 'r2',
        machine_state: '{}',
        content_hash: t2Content,
        chain_hash: t2Chain,
        handoff_hash: null,
        event_type: 'chat',
      },
    ];

    assert.equal(refVerifyTurns(turns).valid, true);
  });

  test('a wrong handoff_hash on the receiver turn invalidates verification', () => {
    const realTip = 'r'.repeat(64);
    const forgedTip = 'f'.repeat(64);
    const t1Content = refHashTurnContent(1, 'starter', 'r1', '{}');
    const t1RealChain = refCreateChainHash(t1Content, realTip);

    const turn = {
      conversation_id: 'handed-off',
      turn: 1,
      user_prompt: 'starter',
      llm_response: 'r1',
      machine_state: '{}',
      content_hash: t1Content,
      chain_hash: t1RealChain,
      handoff_hash: forgedTip,
      event_type: 'chat',
    };

    assert.equal(refVerifyTurns([turn]).valid, false);
  });
});

// ---------------------------------------------------------------------------
// Optical-read extraction turn — sentinel matches sha256(image bytes),
// chain verifies, mutating one byte changes the sentinel + tip.
// ---------------------------------------------------------------------------
describe('verify — optical-read extraction turn', () => {
  const sampleEnvelope = {
    answer: 'Read your driver license.',
    extraction: {
      fields: { firstName: 'Ada', dob: '1815-12-10' },
      confidence: 'high',
      notes: '',
      showUploadButton: false,
    },
  };

  function refBuildImageSentinel(imageHash) {
    return `[optical_read image: ${imageHash}]`;
  }

  function refBuildMachineState(envelope, { imageHash, mime, imageBytes, fileName }) {
    return JSON.stringify({
      ...envelope,
      source: 'optical_read',
      imageHash,
      imageMime: mime,
      imageBytes,
      fileName: typeof fileName === 'string' ? fileName : null,
    });
  }

  function buildExtractTurn({ conversationId, turn, imageBytes, fileName = 'id.png' }) {
    const imageHash = crypto.createHash('sha256').update(imageBytes).digest('hex');
    const sentinel = refBuildImageSentinel(imageHash);
    const llmResponse = JSON.stringify(sampleEnvelope);
    const machineState = refBuildMachineState(sampleEnvelope, {
      imageHash,
      mime: 'image/png',
      imageBytes: imageBytes.length,
      fileName,
    });
    const contentHash = refHashTurnContent(turn, sentinel, llmResponse, machineState);
    return {
      row: {
        conversation_id: conversationId,
        turn,
        user_prompt: sentinel,
        llm_response: llmResponse,
        machine_state: machineState,
        content_hash: contentHash,
        chain_hash: null,
        handoff_hash: null,
        event_type: 'chat',
      },
      imageHash,
      sentinel,
    };
  }

  test('sentinel format equals "[optical_read image: <sha256(bytes)>]"', () => {
    const bytes = Buffer.from('fake-image-bytes');
    const { sentinel, imageHash } = buildExtractTurn({ conversationId: 'c1', turn: 1, imageBytes: bytes });
    assert.equal(sentinel, `[optical_read image: ${imageHash}]`);
    assert.match(sentinel, /^\[optical_read image: [0-9a-f]{64}\]$/);
  });

  test('image-sentinel hashes the raw bytes, not the base64-encoded form', () => {
    const bytes = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const directHash = crypto.createHash('sha256').update(bytes).digest('hex');
    const b64Hash = crypto.createHash('sha256').update(bytes.toString('base64')).digest('hex');
    assert.notEqual(directHash, b64Hash);
    const { imageHash } = buildExtractTurn({ conversationId: 'c1', turn: 1, imageBytes: bytes });
    assert.equal(imageHash, directHash);
  });

  test('extract-as-first-turn chain verifies end-to-end', () => {
    const bytes = Buffer.from('image-bytes-for-extract');
    const { row } = buildExtractTurn({ conversationId: 'c1', turn: 1, imageBytes: bytes });
    assert.equal(refVerifyTurns(buildChain([row])).valid, true);
  });

  test('chat → chat → extract chain verifies (mid-conversation extract)', () => {
    const bytes = Buffer.from('image-bytes-mid-conv');
    const { row: extractRow } = buildExtractTurn({ conversationId: 'c1', turn: 3, imageBytes: bytes });
    const turns = buildChain([
      buildChatTurn({ conversationId: 'c1', turn: 1, userPrompt: 'hi', llmResponse: 'hello', machineState: '{}' }),
      buildChatTurn({ conversationId: 'c1', turn: 2, userPrompt: 'send id', llmResponse: 'sure', machineState: '{}' }),
      extractRow,
    ]);
    const r = refVerifyTurns(turns);
    assert.equal(r.valid, true);
    assert.equal(r.totalTurns, 3);
  });

  test('mutating one byte of the image input changes both the sentinel and the chain tip', () => {
    const original = Buffer.from('original-image-bytes');
    const mutated = Buffer.from('original-image-bytes');
    mutated[0] ^= 0x01;

    const a = buildExtractTurn({ conversationId: 'c1', turn: 1, imageBytes: original });
    const b = buildExtractTurn({ conversationId: 'c1', turn: 1, imageBytes: mutated });

    assert.notEqual(a.sentinel, b.sentinel);
    assert.notEqual(buildChain([a.row])[0].chain_hash, buildChain([b.row])[0].chain_hash);
  });

  test('substituting a forged sentinel (image bytes unchanged in machineState) is detected', () => {
    const bytes = Buffer.from('real-image');
    const { row } = buildExtractTurn({ conversationId: 'c1', turn: 1, imageBytes: bytes });
    const tampered = { ...row, user_prompt: refBuildImageSentinel('f'.repeat(64)) };
    assert.equal(refVerifyTurns(buildChain([tampered])).valid, false);
  });
});

// ---------------------------------------------------------------------------
// machineState string stability — algorithm hashes machineState as the
// caller passes it. Re-ordering keys or whitespace changes the hash. Pin
// that choice so an accidental "canonicalize" step surfaces as a test
// failure.
// ---------------------------------------------------------------------------
describe('hashTurnContent — machineState string sensitivity', () => {
  test('different key order in machineState yields different content hash', () => {
    assert.notEqual(
      refHashTurnContent(1, 'p', 'r', '{"a":1,"b":2}'),
      refHashTurnContent(1, 'p', 'r', '{"b":2,"a":1}'),
    );
  });

  test('different whitespace in machineState yields different content hash', () => {
    assert.notEqual(
      refHashTurnContent(1, 'p', 'r', '{"a":1,"b":2}'),
      refHashTurnContent(1, 'p', 'r', '{ "a": 1, "b": 2 }'),
    );
  });
});

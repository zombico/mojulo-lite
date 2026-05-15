// Tier 1.1f — /api/extract validation + narrowing algorithm spec.
//
// The production logic lives INLINE in lite-template/server.js's
// `/api/extract` route handler. It cannot be required from this test
// file because `require('../server.js')` boots Express + reads
// config/config.json at module-load time.
//
// So this file is a *spec*, not an integration test. The validation /
// narrowing algorithm is reimplemented here as a reference and tested
// against fixed inputs. If you change the algorithm in server.js, change
// it here too — and the duplicated copy in
// control/app/api/preview/extract/route.js too. (That two-way drift is
// the bug class 2i is meant to catch; until 2i lands, the only thing
// keeping the three implementations in sync is human discipline.)
//
// What this catches:
//   - Algorithm regressions in the test file (forces a deliberate spec
//     change instead of a silent drift).
// What this does NOT catch:
//   - server.js diverging from this spec.
//   - The preview route diverging from this spec.
//   - Rate limiter, disabled-state route guard, DB-level persistence.
// All of those need an integration scaffold (deferred to Tier 2).
//
// The earlier attempt to extract these as importable helpers broke the
// app — see git history. The lesson: refactor production code to enable
// tests only when the production code already wants to be refactored.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// Reference implementation of the algorithm in server.js. Keep this in sync
// with the inline code in `app.post('/api/extract', ...)` and the constants
// MAX_IMAGE_BYTES / ALLOWED_IMAGE_MIMES above it.
// ---------------------------------------------------------------------------
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_CONFIDENCE = new Set(['high', 'medium', 'low']);

function refValidateExtractInput(body) {
  const safeBody = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const { conversationId, fileName, mime, base64 } = safeBody;

  if (!mime || !ALLOWED_IMAGE_MIMES.has(mime)) {
    return { ok: false, status: 400, error: 'Unsupported image type. Use PNG, JPEG, or WebP.' };
  }
  if (typeof base64 !== 'string' || base64.length === 0) {
    return { ok: false, status: 400, error: 'base64 image data is required' };
  }

  const cleaned = base64.replace(/^data:[^;]+;base64,/, '');
  let imageBuffer;
  try {
    imageBuffer = Buffer.from(cleaned, 'base64');
  } catch {
    return { ok: false, status: 400, error: 'Invalid base64 payload' };
  }
  if (imageBuffer.length === 0) {
    return { ok: false, status: 400, error: 'Empty image payload' };
  }
  if (imageBuffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: `Image exceeds ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB cap` };
  }

  return {
    ok: true,
    mime,
    base64Clean: cleaned,
    imageBuffer,
    fileName: typeof fileName === 'string' ? fileName : null,
    conversationIdHint: typeof conversationId === 'string' ? conversationId : null,
  };
}

function refNarrowExtractionEnvelope(parsed, opticalReadFields) {
  const safeParsed = parsed && typeof parsed === 'object' ? parsed : {};
  const rawFields = safeParsed.extraction?.fields ?? safeParsed.extractedFields ?? {};
  const rawConfidence = safeParsed.extraction?.confidence ?? safeParsed.extractionConfidence;
  const rawNotes = safeParsed.extraction?.notes ?? safeParsed.extractionNotes;
  const rawShowUpload = safeParsed.extraction?.showUploadButton ?? safeParsed.showUploadButton;

  const allowedIds = new Set(
    (Array.isArray(opticalReadFields) ? opticalReadFields : [])
      .map((f) => f?.idName)
      .filter((id) => typeof id === 'string' && id.length > 0),
  );
  const fields = {};
  for (const id of allowedIds) {
    const v = (rawFields && typeof rawFields === 'object') ? rawFields[id] : undefined;
    fields[id] = typeof v === 'string' ? v : '';
  }

  const confRaw = (rawConfidence || '').toString().trim().toLowerCase();
  const confidence = ALLOWED_CONFIDENCE.has(confRaw) ? confRaw : 'medium';
  const notes = typeof rawNotes === 'string' ? rawNotes : '';
  const showUploadButton = rawShowUpload === true || rawShowUpload === 'true';

  return {
    answer: typeof safeParsed.answer === 'string' ? safeParsed.answer : '',
    extraction: { fields, confidence, notes, showUploadButton },
  };
}

function refBuildExtractionMachineState(envelope, { imageHash, mime, imageBytes, fileName }) {
  return JSON.stringify({
    ...envelope,
    source: 'optical_read',
    imageHash,
    imageMime: mime,
    imageBytes,
    fileName: typeof fileName === 'string' ? fileName : null,
  });
}

function refBuildImageSentinel(imageHash) {
  return `[optical_read image: ${imageHash}]`;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SMALL_IMAGE = Buffer.concat([PNG_HEADER, Buffer.alloc(64, 0x42)]);
const SMALL_IMAGE_B64 = SMALL_IMAGE.toString('base64');

// ---------------------------------------------------------------------------
// Module constants — pin the documented numbers. CLAUDE.md, cartridge
// instructions, and the preview route all reference these.
// ---------------------------------------------------------------------------
describe('module constants', () => {
  test('MAX_IMAGE_BYTES is exactly 5MB', () => {
    assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024);
  });

  test('ALLOWED_IMAGE_MIMES is the documented PNG/JPEG/WebP set', () => {
    assert.deepEqual(
      [...ALLOWED_IMAGE_MIMES].sort(),
      ['image/jpeg', 'image/png', 'image/webp'],
    );
  });
});

// ---------------------------------------------------------------------------
// validateExtractInput — mime / base64 / size gating
// ---------------------------------------------------------------------------
describe('validateExtractInput — mime gating', () => {
  for (const mime of ['image/png', 'image/jpeg', 'image/webp']) {
    test(`accepts ${mime}`, () => {
      const r = refValidateExtractInput({ mime, base64: SMALL_IMAGE_B64 });
      assert.equal(r.ok, true);
      assert.equal(r.mime, mime);
    });
  }

  test('rejects image/gif with 400', () => {
    const r = refValidateExtractInput({ mime: 'image/gif', base64: SMALL_IMAGE_B64 });
    assert.deepEqual(r, {
      ok: false,
      status: 400,
      error: 'Unsupported image type. Use PNG, JPEG, or WebP.',
    });
  });

  test('rejects application/pdf', () => {
    const r = refValidateExtractInput({ mime: 'application/pdf', base64: SMALL_IMAGE_B64 });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });

  test('rejects when mime is missing', () => {
    const r = refValidateExtractInput({ base64: SMALL_IMAGE_B64 });
    assert.equal(r.ok, false);
  });
});

describe('validateExtractInput — base64 gating', () => {
  test('rejects when base64 is missing', () => {
    const r = refValidateExtractInput({ mime: 'image/png' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.equal(r.error, 'base64 image data is required');
  });

  test('rejects when base64 is an empty string', () => {
    assert.equal(refValidateExtractInput({ mime: 'image/png', base64: '' }).ok, false);
  });

  test('rejects when base64 is not a string', () => {
    assert.equal(refValidateExtractInput({ mime: 'image/png', base64: { not: 'string' } }).ok, false);
  });

  test('strips data: URL prefix and decodes the trailing base64', () => {
    const r = refValidateExtractInput({
      mime: 'image/png',
      base64: `data:image/png;base64,${SMALL_IMAGE_B64}`,
    });
    assert.equal(r.ok, true);
    assert.deepEqual(Buffer.from(r.base64Clean, 'base64'), SMALL_IMAGE);
    assert.equal(r.base64Clean.startsWith('data:'), false);
  });

  test('rejects when the base64 decodes to zero bytes', () => {
    const r = refValidateExtractInput({ mime: 'image/png', base64: '====' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
    assert.equal(r.error, 'Empty image payload');
  });

  test('rejects when the decoded buffer exceeds the 5MB cap (413)', () => {
    const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0x00).toString('base64');
    const r = refValidateExtractInput({ mime: 'image/png', base64: oversized });
    assert.equal(r.ok, false);
    assert.equal(r.status, 413);
    assert.match(r.error, /5MB cap/);
  });

  test('accepts a buffer exactly at the 5MB cap', () => {
    const atCap = Buffer.alloc(MAX_IMAGE_BYTES, 0x00).toString('base64');
    const r = refValidateExtractInput({ mime: 'image/png', base64: atCap });
    assert.equal(r.ok, true);
    assert.equal(r.imageBuffer.length, MAX_IMAGE_BYTES);
  });
});

describe('validateExtractInput — body shape robustness', () => {
  test('handles null body without throwing', () => {
    assert.equal(refValidateExtractInput(null).ok, false);
  });

  test('handles primitive body (string) without throwing', () => {
    assert.equal(refValidateExtractInput('not-an-object').ok, false);
  });

  test('handles array body without throwing', () => {
    assert.equal(refValidateExtractInput([]).ok, false);
  });

  test('preserves fileName when string, drops non-string', () => {
    const ok = refValidateExtractInput({
      mime: 'image/png', base64: SMALL_IMAGE_B64, fileName: 'invoice.png',
    });
    assert.equal(ok.fileName, 'invoice.png');
    const dropped = refValidateExtractInput({
      mime: 'image/png', base64: SMALL_IMAGE_B64, fileName: { evil: 'object' },
    });
    assert.equal(dropped.fileName, null);
  });

  test('returns conversationIdHint when string, null otherwise', () => {
    const a = refValidateExtractInput({
      mime: 'image/png', base64: SMALL_IMAGE_B64, conversationId: 'aaaa-bbbb',
    });
    assert.equal(a.conversationIdHint, 'aaaa-bbbb');
    const b = refValidateExtractInput({
      mime: 'image/png', base64: SMALL_IMAGE_B64, conversationId: 12345,
    });
    assert.equal(b.conversationIdHint, null);
  });
});

// ---------------------------------------------------------------------------
// narrowExtractionEnvelope — idName allowlist, confidence/notes coercion,
// new-nested vs legacy-flat shape compatibility
// ---------------------------------------------------------------------------
describe('narrowExtractionEnvelope — idName allowlist', () => {
  const fields = [
    { idName: 'firstName', label: 'First name' },
    { idName: 'dob', label: 'Date of birth' },
  ];

  test('drops hallucinated keys outside the allowlist', () => {
    const out = refNarrowExtractionEnvelope({
      answer: 'ok',
      extraction: {
        fields: { firstName: 'Ada', dob: '1815-12-10', ssn: '123-45-6789' },
      },
    }, fields);
    assert.deepEqual(Object.keys(out.extraction.fields).sort(), ['dob', 'firstName']);
    assert.equal(out.extraction.fields.ssn, undefined);
  });

  test('fills missing allowed keys with empty string', () => {
    const out = refNarrowExtractionEnvelope({
      extraction: { fields: { firstName: 'Ada' } },
    }, fields);
    assert.deepEqual(out.extraction.fields, { firstName: 'Ada', dob: '' });
  });

  test('coerces non-string values to empty string (no leaked numbers / objects)', () => {
    const out = refNarrowExtractionEnvelope({
      extraction: { fields: { firstName: 42, dob: { y: 1815 } } },
    }, fields);
    assert.deepEqual(out.extraction.fields, { firstName: '', dob: '' });
  });

  test('falls back to legacy flat extractedFields when nested is missing', () => {
    const out = refNarrowExtractionEnvelope({
      extractedFields: { firstName: 'Ada', dob: '1815-12-10' },
    }, fields);
    assert.equal(out.extraction.fields.firstName, 'Ada');
    assert.equal(out.extraction.fields.dob, '1815-12-10');
  });

  test('nested shape wins over legacy flat when both are present', () => {
    const out = refNarrowExtractionEnvelope({
      extraction: { fields: { firstName: 'NEW' } },
      extractedFields: { firstName: 'OLD' },
    }, fields);
    assert.equal(out.extraction.fields.firstName, 'NEW');
  });

  test('empty opticalReadFields → empty result', () => {
    assert.deepEqual(
      refNarrowExtractionEnvelope({ extraction: { fields: { anything: 'value' } } }, []).extraction.fields,
      {},
    );
  });

  test('malformed opticalReadFields entries (missing idName) are dropped', () => {
    const out = refNarrowExtractionEnvelope({
      extraction: { fields: { firstName: 'Ada' } },
    }, [
      { idName: 'firstName' },
      { label: 'No idName' },
      null,
      { idName: '' },
      { idName: 123 },
    ]);
    assert.deepEqual(Object.keys(out.extraction.fields), ['firstName']);
  });
});

describe('narrowExtractionEnvelope — confidence coercion', () => {
  const fields = [{ idName: 'x' }];

  for (const c of ['high', 'medium', 'low']) {
    test(`passes through allowed confidence "${c}"`, () => {
      assert.equal(
        refNarrowExtractionEnvelope({ extraction: { confidence: c } }, fields).extraction.confidence,
        c,
      );
    });
  }

  test('normalizes uppercase / whitespace to lowercase', () => {
    assert.equal(
      refNarrowExtractionEnvelope({ extraction: { confidence: '  HIGH  ' } }, fields).extraction.confidence,
      'high',
    );
  });

  test('falls back to "medium" for non-enum strings ("okay", "good")', () => {
    assert.equal(refNarrowExtractionEnvelope({ extraction: { confidence: 'okay' } }, fields).extraction.confidence, 'medium');
    assert.equal(refNarrowExtractionEnvelope({ extraction: { confidence: 'good' } }, fields).extraction.confidence, 'medium');
  });

  test('falls back to "medium" for missing or null inputs', () => {
    assert.equal(refNarrowExtractionEnvelope({ extraction: { confidence: null } }, fields).extraction.confidence, 'medium');
    assert.equal(refNarrowExtractionEnvelope({ extraction: {} }, fields).extraction.confidence, 'medium');
  });
});

describe('narrowExtractionEnvelope — notes coercion', () => {
  const fields = [{ idName: 'x' }];

  test('passes through a string', () => {
    assert.equal(
      refNarrowExtractionEnvelope({ extraction: { notes: 'blurry top edge' } }, fields).extraction.notes,
      'blurry top edge',
    );
  });

  test('falls back to empty string for non-string', () => {
    assert.equal(refNarrowExtractionEnvelope({ extraction: { notes: { v: 1 } } }, fields).extraction.notes, '');
    assert.equal(refNarrowExtractionEnvelope({}, fields).extraction.notes, '');
  });
});

describe('narrowExtractionEnvelope — showUploadButton coercion', () => {
  const fields = [{ idName: 'x' }];

  test('boolean true → true', () => {
    assert.equal(
      refNarrowExtractionEnvelope({ extraction: { showUploadButton: true } }, fields).extraction.showUploadButton,
      true,
    );
  });

  test('string "true" → true', () => {
    assert.equal(
      refNarrowExtractionEnvelope({ extraction: { showUploadButton: 'true' } }, fields).extraction.showUploadButton,
      true,
    );
  });

  test('any other value → false (false, 1, "false", undefined, null, object, "")', () => {
    for (const v of [false, 1, 'false', null, undefined, {}, '']) {
      assert.equal(
        refNarrowExtractionEnvelope({ extraction: { showUploadButton: v } }, fields).extraction.showUploadButton,
        false,
        `value ${JSON.stringify(v)} should coerce to false`,
      );
    }
  });
});

describe('narrowExtractionEnvelope — answer + bad-input safety', () => {
  test('passes through string answer', () => {
    assert.equal(refNarrowExtractionEnvelope({ answer: 'I read your ID.' }, []).answer, 'I read your ID.');
  });

  test('non-string answer becomes empty string', () => {
    assert.equal(refNarrowExtractionEnvelope({ answer: 42 }, []).answer, '');
    assert.equal(refNarrowExtractionEnvelope({}, []).answer, '');
  });

  test('null parsed input returns canonical empty envelope without throwing', () => {
    const out = refNarrowExtractionEnvelope(null, [{ idName: 'x' }]);
    assert.deepEqual(out, {
      answer: '',
      extraction: { fields: { x: '' }, confidence: 'medium', notes: '', showUploadButton: false },
    });
  });
});

// ---------------------------------------------------------------------------
// machineState audit shape + privacy invariant
// ---------------------------------------------------------------------------
describe('buildExtractionMachineState — audit shape', () => {
  const envelope = {
    answer: 'Read your driver license.',
    extraction: {
      fields: { firstName: 'Ada', dob: '1815-12-10' },
      confidence: 'high',
      notes: '',
      showUploadButton: false,
    },
  };
  const imageBuffer = Buffer.concat([PNG_HEADER, Buffer.alloc(4096, 0x77)]);
  const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

  test('JSON parses to the documented field set on metadata.source === optical_read', () => {
    const out = refBuildExtractionMachineState(envelope, {
      imageHash, mime: 'image/png', imageBytes: imageBuffer.length, fileName: 'license.png',
    });
    const parsed = JSON.parse(out);
    assert.equal(parsed.source, 'optical_read');
    assert.equal(parsed.imageHash, imageHash);
    assert.equal(parsed.imageMime, 'image/png');
    assert.equal(parsed.imageBytes, imageBuffer.length);
    assert.equal(parsed.fileName, 'license.png');
    assert.deepEqual(parsed.extraction, envelope.extraction);
  });

  test('fileName is null when not provided', () => {
    const out = refBuildExtractionMachineState(envelope, {
      imageHash, mime: 'image/png', imageBytes: imageBuffer.length, fileName: null,
    });
    assert.equal(JSON.parse(out).fileName, null);
  });

  // P0 privacy invariant — see UNIT_TEST_PLAN.md 1f.
  test('image bytes never appear in the output (privacy invariant)', () => {
    const out = refBuildExtractionMachineState(envelope, {
      imageHash, mime: 'image/png', imageBytes: imageBuffer.length, fileName: 'license.png',
    });
    const base64Image = imageBuffer.toString('base64');
    assert.equal(out.includes(base64Image), false, 'base64 of image must not appear in machine_state');
    assert.equal(/[A-Za-z0-9+/=]{200,}/.test(out), false, 'no long base64-shaped substring in machine_state');
    assert.equal(out.includes(imageBuffer.toString('hex')), false, 'hex of image must not appear in machine_state');
  });

  test('imageBytes is the decoded length number, not the buffer itself', () => {
    const parsed = JSON.parse(refBuildExtractionMachineState(envelope, {
      imageHash, mime: 'image/png', imageBytes: 12345, fileName: null,
    }));
    assert.equal(typeof parsed.imageBytes, 'number');
    assert.equal(parsed.imageBytes, 12345);
  });
});

describe('buildImageSentinel', () => {
  test('returns the documented sentinel format', () => {
    const hash = 'a'.repeat(64);
    assert.equal(refBuildImageSentinel(hash), `[optical_read image: ${hash}]`);
  });

  test('hashing raw bytes (not base64) is what the sentinel records', () => {
    const bytes = Buffer.from([1, 2, 3, 4, 5]);
    const mutated = Buffer.from([1, 2, 3, 4, 6]);
    const h1 = crypto.createHash('sha256').update(bytes).digest('hex');
    const h2 = crypto.createHash('sha256').update(mutated).digest('hex');
    assert.notEqual(refBuildImageSentinel(h1), refBuildImageSentinel(h2));
  });
});

// ---------------------------------------------------------------------------
// Malicious-input fuzz over validateExtractInput. OSS public surface —
// inputs are user-controlled. Assert: no input crashes, no input bypasses
// the gates.
// ---------------------------------------------------------------------------
describe('validateExtractInput — fuzz', () => {
  function randomString(len) {
    return crypto.randomBytes(len).toString('base64').slice(0, len);
  }

  test('random base64-shaped strings under disallowed mimes are rejected, never crash', () => {
    for (let i = 0; i < 200; i++) {
      const mime = `application/${randomString(8)}`;
      const base64 = randomString(crypto.randomInt(0, 10_000));
      let r;
      try { r = refValidateExtractInput({ mime, base64 }); }
      catch (e) { assert.fail(`refValidateExtractInput threw: ${e.message}`); }
      assert.equal(r.ok, false);
    }
  });

  test('random bodies (with disallowed/missing mime) never produce ok: true', () => {
    const garbageBodies = [
      null, undefined, '', 'plain string', [], [1, 2, 3],
      { mime: null, base64: null },
      { mime: 0, base64: 0 },
      { mime: ['image/png'], base64: ['data'] },
      { mime: 'image/png', base64: '  ' },
      { mime: 'image/png', base64: '====' },
      { mime: 'image/png ', base64: SMALL_IMAGE_B64 },
    ];
    for (const body of garbageBodies) {
      let r;
      try { r = refValidateExtractInput(body); }
      catch (e) { assert.fail(`fuzz body crashed: ${JSON.stringify(body)} → ${e.message}`); }
      assert.equal(r.ok, false);
    }
  });

  test('oversized fuzz inputs always reject with 413', () => {
    for (const extra of [1, 7, 100, 1024]) {
      const buf = Buffer.alloc(MAX_IMAGE_BYTES + extra, 0x00);
      const r = refValidateExtractInput({ mime: 'image/png', base64: buf.toString('base64') });
      assert.equal(r.ok, false);
      assert.equal(r.status, 413);
    }
  });

  test('random allowed-mime + random under-cap base64 yields ok: true, buffer length matches', () => {
    for (let i = 0; i < 50; i++) {
      const targetBytes = crypto.randomInt(1, MAX_IMAGE_BYTES);
      const buf = crypto.randomBytes(targetBytes);
      const r = refValidateExtractInput({ mime: 'image/png', base64: buf.toString('base64') });
      assert.equal(r.ok, true);
      assert.equal(r.imageBuffer.length, targetBytes);
    }
  });
});

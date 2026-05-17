import { describe, it, expect } from 'vitest';
import {
  SYNTHESIZER_BRIEFING,
  getCatalystHandler,
  listCatalystsHandler,
} from './catalysts.js';

describe('SYNTHESIZER_BRIEFING — vocabulary disambiguation', () => {
  it('names all three overlapping concepts so the model can keep them distinct', () => {
    expect(SYNTHESIZER_BRIEFING).toMatch(/Mojulo protocols/);
    expect(SYNTHESIZER_BRIEFING).toMatch(/Claude Code skill/);
    expect(SYNTHESIZER_BRIEFING).toMatch(/mojulo catalyst/i);
  });

  it('uses the bare term "catalyst" rather than "skill catalyst" to keep concepts distinct', () => {
    // The bare term is load-bearing — catalysts produce skills, they are not skills.
    expect(SYNTHESIZER_BRIEFING).not.toMatch(/skill catalyst/i);
  });

  it('names the canonical protocols so requires.protocols values resolve', () => {
    for (const p of ['knowledge', 'formGathering', 'triage', 'appointments', 'opticalRead']) {
      expect(SYNTHESIZER_BRIEFING).toContain(p);
    }
  });

  it('points the synthesizer at the .claude/skills/ write target', () => {
    expect(SYNTHESIZER_BRIEFING).toMatch(/\.claude\/skills\//);
  });

  it('makes the catalyst metaphor literal — crystallize / nucleation', () => {
    expect(SYNTHESIZER_BRIEFING).toMatch(/crystallize/i);
    expect(SYNTHESIZER_BRIEFING).toMatch(/nucleation/i);
  });
});

describe('SYNTHESIZER_BRIEFING — posture preamble', () => {
  it('frames the catalyst as a starting point, not a contract', () => {
    expect(SYNTHESIZER_BRIEFING).toMatch(/starting point, not a contract/i);
  });

  it('flags the library as non-exhaustive', () => {
    expect(SYNTHESIZER_BRIEFING).toMatch(/non-exhaustive/i);
  });

  it('explicitly authorizes adaptation and writing from scratch', () => {
    expect(SYNTHESIZER_BRIEFING).toMatch(/Adapt freely/i);
    expect(SYNTHESIZER_BRIEFING).toMatch(/Write from scratch/i);
  });

  it('preserves non-negotiable safety defaults — dryRun and mojulo trace', () => {
    expect(SYNTHESIZER_BRIEFING).toMatch(/dryRun/);
    expect(SYNTHESIZER_BRIEFING).toMatch(/mojulo trace/i);
  });

  it('places posture before vocabulary so the model reads it first', () => {
    const postureIdx = SYNTHESIZER_BRIEFING.indexOf('How to read this catalyst');
    const vocabIdx = SYNTHESIZER_BRIEFING.indexOf('Vocabulary');
    expect(postureIdx).toBeGreaterThanOrEqual(0);
    expect(vocabIdx).toBeGreaterThan(postureIdx);
  });
});

describe('getCatalystHandler', () => {
  it('prepends the briefing to the body', async () => {
    const out = await getCatalystHandler({ id: 'qualify-lead-to-crm' });
    expect(out.body.startsWith(SYNTHESIZER_BRIEFING)).toBe(true);
  });

  it('still returns metadata fields alongside the briefed body', async () => {
    const out = await getCatalystHandler({ id: 'qualify-lead-to-crm' });
    expect(out.id).toBe('qualify-lead-to-crm');
    expect(out.name).toBeTypeOf('string');
    expect(out.summary).toBeTypeOf('string');
    expect(Array.isArray(out.parameters)).toBe(true);
  });

  it('throws on missing id', async () => {
    await expect(getCatalystHandler({})).rejects.toThrow(/id is required/);
  });

  it('throws on unknown id', async () => {
    await expect(getCatalystHandler({ id: 'no-such-catalyst' })).rejects.toThrow(/not found/);
  });
});

describe('listCatalystsHandler', () => {
  it('returns the catalog wrapped with total', async () => {
    const out = await listCatalystsHandler({});
    expect(out.total).toBeGreaterThanOrEqual(6);
    expect(Array.isArray(out.catalysts)).toBe(true);
    expect(out.catalysts.length).toBe(out.total);
  });

  it('forwards the category filter', async () => {
    const out = await listCatalystsHandler({ category: 'crm-sync' });
    expect(out.total).toBeGreaterThan(0);
    expect(out.catalysts.every((c) => c.category === 'crm-sync')).toBe(true);
  });
});

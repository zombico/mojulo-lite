import { describe, it, expect } from 'vitest';
import {
  CONSULTATION_POSTURE,
  CUSTOM_CATALYST_GUIDE,
  SYNTHESIZER_BRIEFING,
  customCatalystHandler,
  getCatalystHandler,
  listCatalystsHandler,
  recommendCatalystsHandler,
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

describe('CONSULTATION_POSTURE — recommend_catalysts framing', () => {
  // recommend_catalysts returns this in every response so the agent re-reads
  // the posture at the moment of acting on it (mirror of SYNTHESIZER_BRIEFING
  // for get_catalyst). If any of these guarantees drift, the consultation
  // mode collapses back into role-executor.
  it('explicitly names valueHook as the lead-with field', () => {
    expect(CONSULTATION_POSTURE).toMatch(/valueHook/);
    expect(CONSULTATION_POSTURE).toMatch(/Lead with/i);
  });

  it('forbids gatekeeping framing for uninstalled destinations', () => {
    expect(CONSULTATION_POSTURE).toMatch(/Never gatekeep/i);
    expect(CONSULTATION_POSTURE).toMatch(/opt-in upgrade/i);
  });

  it('distinguishes missing-MCP from missing-protocols', () => {
    expect(CONSULTATION_POSTURE).toMatch(/destinationExamples/);
    expect(CONSULTATION_POSTURE).toMatch(/missingProtocols/);
  });

  it('reminds the agent that mojulo cannot see what MCPs are installed', () => {
    expect(CONSULTATION_POSTURE).toMatch(/only you/i);
  });
});

describe('CUSTOM_CATALYST_GUIDE — author posture for remote contributors', () => {
  it('frames catalysts you author here as proposals to the library, not local skills', () => {
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/proposal/i);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/library/i);
  });

  it('points the remote agent at the existing exemplars via get_catalyst', () => {
    // The body is self-contained but tells the agent to anchor on exemplars
    // (which it can pull through MCP) rather than inlining 500 lines of prose.
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/get_catalyst\("qualify-lead-to-crm"\)/);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/list_catalysts/);
  });

  it('contains the posture-check rubric with worked bad-vs-good examples for the subtle rules', () => {
    // Rules 5 and 6 are the ones contributors most often rationalize past —
    // the worked examples are what make them self-enforcing.
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Bad mapping insight/i);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Good mapping insight/i);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Bad idempotency story/i);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Good idempotency story/i);
  });

  it('includes a worked pushback exchange so the agent has a concrete template', () => {
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Example pushback exchange/i);
  });

  it('inlines the frontmatter spec so the remote agent does not need loader.js', () => {
    // The required string fields the loader enforces.
    for (const field of ['id', 'name', 'summary', 'valueHook']) {
      expect(CUSTOM_CATALYST_GUIDE).toContain(field);
    }
    // The destinationExamples coupling — easy to miss without the spec inline.
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/destinationExamples/);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/destinationMcpCategory/);
  });

  it('names the six-section body template', () => {
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/six-section/i);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Mapping intent/);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Idempotency/);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Pitfalls/);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Skill behavior contract/);
  });

  it('preserves the non-negotiable body principles', () => {
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/dryRun: true/);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/mojulo trace/i);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Don't write back to the bot/i);
  });

  it('ships a by-hand validation checklist since the remote agent cannot run vitest', () => {
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/Self-validate/i);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/checklist/i);
  });

  it('points the hand-off at a PR against zombico/mojulo, not an in-repo edit', () => {
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/github\.com\/zombico\/mojulo/);
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/control\/lib\/mcp\/catalysts\//);
  });

  it('reminds the agent the body is a prompt, not documentation', () => {
    // This is the single most load-bearing framing from the in-repo skill —
    // worth asserting it survives every edit to the guide.
    expect(CUSTOM_CATALYST_GUIDE).toMatch(/prompt, not documentation/i);
  });
});

describe('customCatalystHandler', () => {
  it('returns the guide as plain text content', async () => {
    const out = await customCatalystHandler({});
    expect(out.content).toEqual([{ type: 'text', text: CUSTOM_CATALYST_GUIDE }]);
  });

  it('ignores any input — the guide is input-less and idempotent', async () => {
    const a = await customCatalystHandler({});
    const b = await customCatalystHandler({ foo: 'bar' });
    expect(a).toEqual(b);
  });
});

describe('recommendCatalystsHandler — input validation', () => {
  it('throws on missing deploymentId', async () => {
    await expect(recommendCatalystsHandler({})).rejects.toThrow(/deploymentId is required/);
  });

  it('throws on unknown deploymentId', async () => {
    await expect(
      recommendCatalystsHandler({ deploymentId: 'no-such-deployment-id-xyz' })
    ).rejects.toThrow(/not found/);
  });
});

import { describe, it, expect } from 'vitest';
import {
  getCatalyst,
  getCatalystCatalog,
  listCatalysts,
  _parseCatalystFileForTests as parseCatalystFile,
} from './loader.js';

describe('parseCatalystFile', () => {
  it('parses a well-formed catalyst', () => {
    const raw =
      '---\n' +
      JSON.stringify({
        id: 'x',
        name: 'X',
        summary: 'a test',
        valueHook: 'a value hook',
        category: 'misc',
      }) +
      '\n---\n\n# Body\n\nProse.';
    const catalyst = parseCatalystFile('test.md', raw);
    expect(catalyst.id).toBe('x');
    expect(catalyst.name).toBe('X');
    expect(catalyst.summary).toBe('a test');
    expect(catalyst.valueHook).toBe('a value hook');
    expect(catalyst.category).toBe('misc');
    expect(catalyst.body).toBe('# Body\n\nProse.');
    expect(catalyst.version).toBe(1);
    expect(catalyst.parameters).toEqual([]);
  });

  it('throws when valueHook is missing', () => {
    const raw =
      '---\n' +
      JSON.stringify({ id: 'x', name: 'X', summary: 's' }) +
      '\n---\n\nbody';
    expect(() => parseCatalystFile('test.md', raw)).toThrow(
      /missing required string field 'valueHook'/
    );
  });

  it('throws when frontmatter fences are missing', () => {
    expect(() => parseCatalystFile('test.md', '# Just a body')).toThrow(/missing JSON frontmatter/);
  });

  it('throws when JSON is malformed', () => {
    const raw = '---\n{ not: valid }\n---\n\nbody';
    expect(() => parseCatalystFile('test.md', raw)).toThrow(/invalid JSON frontmatter/);
  });

  it('throws when required fields are missing', () => {
    const raw = '---\n' + JSON.stringify({ id: 'x', name: 'X' }) + '\n---\n\nbody';
    expect(() => parseCatalystFile('test.md', raw)).toThrow(/missing required string field 'summary'/);
  });

  it('throws when body is empty', () => {
    const raw =
      '---\n' +
      JSON.stringify({ id: 'x', name: 'X', summary: 's', valueHook: 'v' }) +
      '\n---\n\n   \n';
    expect(() => parseCatalystFile('test.md', raw)).toThrow(/empty body/);
  });
});

describe('built-in catalyst catalog', () => {
  it('loads all shipped catalysts without errors', () => {
    const catalog = getCatalystCatalog();
    expect(catalog.size).toBeGreaterThanOrEqual(6);
  });

  it('every shipped catalyst has the documented contract', () => {
    const catalog = getCatalystCatalog();
    for (const [id, catalyst] of catalog) {
      expect(catalyst.id).toBe(id);
      expect(typeof catalyst.name).toBe('string');
      expect(catalyst.name.length).toBeGreaterThan(0);
      expect(typeof catalyst.summary).toBe('string');
      expect(catalyst.summary.length).toBeGreaterThan(0);
      expect(typeof catalyst.valueHook).toBe('string');
      expect(catalyst.valueHook.length).toBeGreaterThan(0);
      expect(typeof catalyst.body).toBe('string');
      expect(catalyst.body.length).toBeGreaterThan(100); // bodies are substantive
      expect(Array.isArray(catalyst.parameters)).toBe(true);
    }
  });

  it('every shipped catalyst with a destinationMcpCategory also lists destinationExamples', () => {
    // The recommend_catalysts tool surfaces destinationExamples as
    // consultation suggestions ("you could install HubSpot to unlock this"),
    // so a catalyst with a destination category but no examples is a hole
    // in the consultation posture.
    const catalog = getCatalystCatalog();
    for (const [id, catalyst] of catalog) {
      const requires = catalyst.requires || {};
      if (!requires.destinationMcpCategory) continue;
      expect(
        Array.isArray(requires.destinationExamples),
        `${id}: requires.destinationExamples must be an array`
      ).toBe(true);
      expect(
        requires.destinationExamples.length,
        `${id}: requires.destinationExamples must be non-empty`
      ).toBeGreaterThan(0);
      for (const example of requires.destinationExamples) {
        expect(typeof example).toBe('string');
        expect(example.length).toBeGreaterThan(0);
      }
    }
  });

});

describe('listCatalysts', () => {
  it('returns id/name/summary/valueHook/category/requires (not body)', () => {
    const catalysts = listCatalysts();
    for (const c of catalysts) {
      expect(c).toHaveProperty('id');
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('summary');
      expect(c).toHaveProperty('valueHook');
      expect(c).toHaveProperty('category');
      expect(c).toHaveProperty('requires');
      expect(c).not.toHaveProperty('body');
    }
  });

  it('filters by category', () => {
    const crm = listCatalysts({ category: 'crm-sync' });
    expect(crm.length).toBeGreaterThan(0);
    expect(crm.every((c) => c.category === 'crm-sync')).toBe(true);
  });

  it('returns empty array for unknown category', () => {
    expect(listCatalysts({ category: 'nonexistent' })).toEqual([]);
  });
});

describe('getCatalyst', () => {
  it('returns the full catalyst including body', () => {
    const catalyst = getCatalyst('qualify-lead-to-crm');
    expect(catalyst).not.toBeNull();
    expect(catalyst.id).toBe('qualify-lead-to-crm');
    expect(typeof catalyst.body).toBe('string');
    expect(catalyst.body).toMatch(/Qualify lead/);
  });

  it('returns null for unknown id', () => {
    expect(getCatalyst('does-not-exist')).toBeNull();
  });

  it('does not expose internal _file field', () => {
    const catalyst = getCatalyst('qualify-lead-to-crm');
    expect(catalyst).not.toHaveProperty('_file');
  });
});

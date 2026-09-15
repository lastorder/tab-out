import { describe, expect, it } from 'vitest';
import { matchesQueryTerms, tokenizeQuery } from '@/core/query';

describe('tokenizeQuery', () => {
  it('splits on whitespace, lower-cases, and drops empty terms', () => {
    expect(tokenizeQuery('  Tab   DOC ')).toEqual(['tab', 'doc']);
  });

  it('returns no terms for a blank query', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('matchesQueryTerms', () => {
  it('matches everything when there are no terms', () => {
    expect(matchesQueryTerms([], ['anything'])).toBe(true);
  });

  it('requires every term, which may hit different fields', () => {
    // "tab" hits the title, "doc" the URL — both must be present.
    expect(matchesQueryTerms(tokenizeQuery('tab doc'), ['Tab Out Guide', 'docs.example.com'])).toBe(true);
    expect(matchesQueryTerms(tokenizeQuery('tab rust'), ['Tab Out Guide', 'docs.example.com'])).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesQueryTerms(tokenizeQuery('DOC'), ['Read the Docs'])).toBe(true);
  });
});

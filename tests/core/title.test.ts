import { describe, expect, it } from 'vitest';
import { cleanTitle, displayTitle, smartTitle, stripTitleNoise, withLocalhostPort } from '@/core/title';

describe('stripTitleNoise', () => {
  it.each([
    ['(3) Inbox', 'Inbox'],
    ['(9+) Slack', 'Slack'],
    ['Inbox (16,359)', 'Inbox'],
    // Email addresses are stripped for privacy as well as noise.
    ['Inbox - me@example.com', 'Inbox'],
    ['Zara on X: "hello"', 'Zara: "hello"'],
    ['Some Post / X', 'Some Post'],
  ])('cleans %s to "%s"', (input, expected) => {
    expect(stripTitleNoise(input)).toBe(expected);
  });
});

describe('cleanTitle', () => {
  it('drops a redundant site-name suffix, matching hostname or brand name', () => {
    expect(cleanTitle('Some Long Article - Medium', 'medium.com')).toBe('Some Long Article');
    expect(cleanTitle('Weekly digest - Gmail', 'mail.google.com')).toBe('Weekly digest');
  });

  it('keeps suffixes that are not the site name', () => {
    expect(cleanTitle('Chapter 1 - The Beginning', 'example.com')).toBe('Chapter 1 - The Beginning');
  });

  it('keeps the original when stripping would leave too little to be useful', () => {
    expect(cleanTitle('Hi - Medium', 'medium.com')).toBe('Hi - Medium');
  });
});

describe('smartTitle', () => {
  it.each([
    ['https://github.com/acme/app/issues/42', 'acme/app Issue #42'],
    ['https://github.com/acme/app/pull/7', 'acme/app PR #7'],
    ['https://github.com/acme/app/blob/main/src/index.ts', 'acme/app — src/index.ts'],
    ['https://github.com/acme/app', 'acme/app'],
    ['https://x.com/zarazhangrui/status/123', 'Post by @zarazhangrui'],
    ['https://www.youtube.com/watch?v=abc', 'YouTube Video'],
    ['https://www.reddit.com/r/typescript/comments/abc/title/', 'r/typescript post'],
  ])('derives a title from %s when the tab has none', (url, expected) => {
    expect(smartTitle('', url)).toBe(expected);
  });

  it('never overrides a real title', () => {
    expect(smartTitle('Fix the thing by zara', 'https://github.com/acme/app')).toBe(
      'Fix the thing by zara',
    );
  });

  it('degrades gracefully with no better option', () => {
    expect(smartTitle('', 'https://example.com/x')).toBe('https://example.com/x');
    expect(smartTitle('Some title', 'not a url')).toBe('Some title');
  });
});

describe('displayTitle', () => {
  it('runs the full pipeline: strip noise, infer, drop the site suffix', () => {
    expect(displayTitle('(2) Big News - Medium', 'https://medium.com/p/1', 'medium.com')).toBe(
      'Big News',
    );
  });
});

describe('withLocalhostPort', () => {
  it('prefixes only localhost titles, so dev servers are distinguishable', () => {
    expect(withLocalhostPort('My App', 'http://localhost:3000/')).toBe('3000 My App');
    expect(withLocalhostPort('My App', 'http://localhost/')).toBe('My App');
    expect(withLocalhostPort('My App', 'https://example.com:8443/')).toBe('My App');
  });
});

import { describe, expect, it } from 'vitest';
import {
  cleanTitle,
  displayTitle,
  smartTitle,
  stripTitleNoise,
  withLocalhostPort,
} from '@/core/title';

describe('stripTitleNoise', () => {
  it('removes a leading notification count', () => {
    expect(stripTitleNoise('(3) Inbox')).toBe('Inbox');
    expect(stripTitleNoise('(9+) Slack')).toBe('Slack');
  });

  it('removes inline counts', () => {
    expect(stripTitleNoise('Inbox (16,359)')).toBe('Inbox');
  });

  it('removes email addresses for privacy', () => {
    expect(stripTitleNoise('Inbox - me@example.com')).toBe('Inbox');
    expect(stripTitleNoise('me@example.com mailbox')).toBe('mailbox');
  });

  it('rewrites X post titles', () => {
    expect(stripTitleNoise('Zara on X: "hello"')).toBe('Zara: "hello"');
    expect(stripTitleNoise('Some Post / X')).toBe('Some Post');
  });

  it('returns an empty string for missing input', () => {
    expect(stripTitleNoise('')).toBe('');
    expect(stripTitleNoise(undefined)).toBe('');
  });
});

describe('cleanTitle', () => {
  it('drops a redundant site-name suffix', () => {
    expect(cleanTitle('Some Long Article - Medium', 'medium.com')).toBe('Some Long Article');
    expect(cleanTitle('Build a thing | GitHub', 'github.com')).toBe('Build a thing');
  });

  it('matches the friendly brand name, not just the hostname', () => {
    expect(cleanTitle('Weekly digest - Gmail', 'mail.google.com')).toBe('Weekly digest');
  });

  it('keeps suffixes that are not the site name', () => {
    expect(cleanTitle('Chapter 1 - The Beginning', 'example.com')).toBe(
      'Chapter 1 - The Beginning',
    );
  });

  it('keeps the original when stripping would leave too little', () => {
    // 'Hi' is under the minimum length, so the full title survives.
    expect(cleanTitle('Hi - Medium', 'medium.com')).toBe('Hi - Medium');
  });

  it('passes through when hostname is unknown', () => {
    expect(cleanTitle('Anything - Medium', '')).toBe('Anything - Medium');
  });
});

describe('smartTitle', () => {
  it('derives GitHub issue and PR titles', () => {
    expect(smartTitle('', 'https://github.com/acme/app/issues/42')).toBe('acme/app Issue #42');
    expect(smartTitle('', 'https://github.com/acme/app/pull/7')).toBe('acme/app PR #7');
  });

  it('derives GitHub file paths', () => {
    expect(smartTitle('', 'https://github.com/acme/app/blob/main/src/index.ts')).toBe(
      'acme/app — src/index.ts',
    );
  });

  it('falls back to owner/repo for a bare repo URL', () => {
    expect(smartTitle('', 'https://github.com/acme/app')).toBe('acme/app');
  });

  it('keeps a real title instead of inventing one', () => {
    expect(smartTitle('Fix the thing by zara', 'https://github.com/acme/app')).toBe(
      'Fix the thing by zara',
    );
  });

  it('names X posts by author when the title is unhelpful', () => {
    expect(smartTitle('', 'https://x.com/zarazhangrui/status/123')).toBe('Post by @zarazhangrui');
  });

  it('labels untitled YouTube videos and Reddit threads', () => {
    expect(smartTitle('', 'https://www.youtube.com/watch?v=abc')).toBe('YouTube Video');
    expect(smartTitle('', 'https://www.reddit.com/r/typescript/comments/abc/title/')).toBe(
      'r/typescript post',
    );
  });

  it('returns the URL when nothing better exists', () => {
    expect(smartTitle('', 'https://example.com/x')).toBe('https://example.com/x');
  });

  it('handles malformed URLs', () => {
    expect(smartTitle('Some title', 'not a url')).toBe('Some title');
  });
});

describe('displayTitle', () => {
  it('runs the full clean-up pipeline', () => {
    expect(displayTitle('(2) Big News - Medium', 'https://medium.com/p/1', 'medium.com')).toBe(
      'Big News',
    );
  });
});

describe('withLocalhostPort', () => {
  it('prefixes localhost titles with the port', () => {
    expect(withLocalhostPort('My App', 'http://localhost:3000/')).toBe('3000 My App');
  });

  it('leaves non-localhost titles alone', () => {
    expect(withLocalhostPort('My App', 'https://example.com:8443/')).toBe('My App');
  });

  it('leaves localhost without a port alone', () => {
    expect(withLocalhostPort('My App', 'http://localhost/')).toBe('My App');
  });
});

import { describe, expect, it } from 'vitest';
import { dashboardUrls } from '@/core/dashboard';

describe('dashboardUrls', () => {
  it('covers both forms Chrome reports for an overridden new tab', () => {
    const urls = dashboardUrls('abcdef');
    expect(urls).toContain('chrome-extension://abcdef/index.html');
    expect(urls).toContain('chrome://newtab/');
  });
});

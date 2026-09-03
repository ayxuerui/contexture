import { describe, expect, it } from 'vitest';
import { resolveTheme } from '../../src/core/browse/preferences.js';

function params(query = ''): URLSearchParams {
  return new URLSearchParams(query);
}

describe('resolveTheme', () => {
  it('defaults to system when there is no cookie and no query parameter', () => {
    const result = resolveTheme(undefined, params());
    expect(result.theme).toBe('system');
    expect(result.setCookie).toBeUndefined();
  });

  it('resolves from a valid cookie', () => {
    const result = resolveTheme('ctxr_theme=dark', params());
    expect(result.theme).toBe('dark');
    expect(result.setCookie).toBeUndefined();
  });

  it('falls back to system for an unrecognized cookie value', () => {
    const result = resolveTheme('ctxr_theme=purple', params());
    expect(result.theme).toBe('system');
  });

  it('falls back to system for an empty cookie header', () => {
    const result = resolveTheme('', params());
    expect(result.theme).toBe('system');
  });

  it('keeps the first of a duplicated cookie name', () => {
    const result = resolveTheme('ctxr_theme=dark; ctxr_theme=light', params());
    expect(result.theme).toBe('dark');
  });

  it('does not match a cookie whose name merely shares a prefix', () => {
    const result = resolveTheme('ctxr_theme_other=dark', params());
    expect(result.theme).toBe('system');
  });

  it('strips a quoted cookie value', () => {
    const result = resolveTheme('ctxr_theme="dark"', params());
    expect(result.theme).toBe('dark');
  });

  it('a query parameter overrides a persisted cookie, and asks to persist itself', () => {
    const result = resolveTheme('ctxr_theme=light', params('ctxr-theme=dark'));
    expect(result.theme).toBe('dark');
    expect(result.setCookie).toContain('ctxr_theme=dark');
  });

  it('an invalid query parameter is ignored, falling back to the cookie', () => {
    const result = resolveTheme('ctxr_theme=dark', params('ctxr-theme=purple'));
    expect(result.theme).toBe('dark');
    expect(result.setCookie).toBeUndefined();
  });

  it('the Set-Cookie value carries Path, SameSite, and HttpOnly', () => {
    const result = resolveTheme(undefined, params('ctxr-theme=dark'));
    expect(result.setCookie).toContain('Path=/');
    expect(result.setCookie).toContain('SameSite=Lax');
    expect(result.setCookie).toContain('HttpOnly');
    expect(result.setCookie).not.toContain('Secure');
  });
});

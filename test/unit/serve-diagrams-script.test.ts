import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * render-diagrams-in-notes design.md D7: the page script's theme mapping is
 * pure, so it is tested here without a DOM. The script is shipped as a plain
 * `.mjs` under `templates/serve/`, so it is imported through a computed URL
 * with its shape declared here rather than through a declaration file shipped
 * beside it.
 */
interface DiagramScript {
  effectiveScheme(themeAttr: string | null, prefersDark: boolean): 'light' | 'dark';
  themeVariables(readProperty: (name: string) => string): Record<string, string>;
}

const SCRIPT_URL = new URL('../../templates/serve/diagrams.mjs', import.meta.url);

/** The two palettes, read from the shipped stylesheet so the test follows it. */
async function palettes(): Promise<{ light: Record<string, string>; dark: Record<string, string> }> {
  const css = await readFile(fileURLToPath(new URL('../../templates/serve/style.css', import.meta.url)), 'utf8');
  const block = (selector: string): Record<string, string> => {
    const start = css.indexOf(`${selector} {`);
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries([...body.matchAll(/(--ctxr-[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
  };
  return { light: block(':root'), dark: block('html[data-ctxr-theme="dark"]') };
}

let script: DiagramScript;

beforeAll(async () => {
  script = (await import(SCRIPT_URL.href)) as DiagramScript;
});

describe('diagrams.mjs effectiveScheme', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('theme %s with prefersDark %s resolves to %s', (theme, prefersDark, expected) => {
    expect(script.effectiveScheme(theme, prefersDark)).toBe(expected);
  });
});

describe('diagrams.mjs themeVariables', () => {
  it('maps each palette onto mermaid variables from the shell custom properties', async () => {
    const { light, dark } = await palettes();
    for (const palette of [light, dark]) {
      expect(Object.keys(palette).length).toBeGreaterThanOrEqual(5); // anti-vacuity
      const vars = script.themeVariables((name) => palette[name] ?? '');
      expect(vars.background).toBe(palette['--ctxr-bg']);
      expect(vars.textColor).toBe(palette['--ctxr-fg']);
      expect(vars.primaryTextColor).toBe(palette['--ctxr-fg']);
      expect(vars.primaryColor).toBe(palette['--ctxr-code-bg']);
      expect(vars.lineColor).toBe(palette['--ctxr-muted']);
      expect(vars.clusterBorder).toBe(palette['--ctxr-border']);
      for (const [key, value] of Object.entries(vars)) expect(value, key).not.toBe('');
    }
    expect(script.themeVariables((name) => light[name] ?? '').background).not.toBe(
      script.themeVariables((name) => dark[name] ?? '').background,
    );
  });
});

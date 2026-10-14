import { describe, expect, it } from 'vitest';
import { DIAGRAM_SCRIPT_ROUTE, diagramRenderer } from '../../src/core/browse/diagram-assets.js';
import { renderShell } from '../../src/core/browse/templates.js';

describe('renderShell', () => {
  it('escapes the title but leaves nav and body html untouched', async () => {
    const html = await renderShell('<script>alert(1)</script>', { html: '<p>body</p>', hasDiagram: false }, '<nav>nav</nav>', { theme: 'system', navState: 'shown' });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('<p>body</p>');
    expect(html).toContain('<nav>nav</nav>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders the resolved theme and nav state onto <html>', async () => {
    const html = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'dark', navState: 'collapsed' });
    expect(html).toContain('data-ctxr-theme="dark"');
    expect(html).toContain('data-ctxr-nav="collapsed"');
  });

  it('defaults to a system theme and a shown nav when so resolved', async () => {
    const html = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'system', navState: 'shown' });
    expect(html).toContain('data-ctxr-theme="system"');
    expect(html).toContain('data-ctxr-nav="shown"');
  });

  it('links the wide-viewport control to the opposite of the current nav state', async () => {
    const shown = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'system', navState: 'shown' });
    expect(shown).toContain('href="?ctxr-nav=collapsed"');

    const collapsed = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'system', navState: 'collapsed' });
    expect(collapsed).toContain('href="?ctxr-nav=shown"');
  });

  it('emits no script element', async () => {
    const html = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'system', navState: 'shown' });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
  });

  it('places the nav-toggle checkbox before <header>, so a sibling selector can reach the label', async () => {
    const html = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'system', navState: 'shown' });
    const inputIndex = html.indexOf('id="ctxr-nav-toggle"');
    const headerIndex = html.indexOf('<header');
    expect(inputIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeGreaterThan(-1);
    expect(inputIndex).toBeLessThan(headerIndex);
  });

  it("the toggle label's for attribute matches the checkbox's id", async () => {
    const html = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'system', navState: 'shown' });
    expect(html).toContain('<input type="checkbox" id="ctxr-nav-toggle"');
    expect(html).toContain('<label for="ctxr-nav-toggle"');
  });

  it('the checkbox is never hidden with display:none or visibility:hidden', async () => {
    const html = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'system', navState: 'shown' });
    const inputTag = html.slice(html.indexOf('<input type="checkbox"'), html.indexOf('>', html.indexOf('<input type="checkbox"')) + 1);
    expect(inputTag).not.toContain('display:none');
    expect(inputTag).not.toContain('display: none');
    expect(inputTag).not.toContain('visibility:hidden');
    expect(inputTag).not.toContain('visibility: hidden');
  });

  it('both nav controls carry visually-hidden accessible text, not just the glyph', async () => {
    const html = await renderShell('t', { html: 'b', hasDiagram: false }, 'n', { theme: 'system', navState: 'shown' });
    expect(html).toContain('<span class="ctxr-visually-hidden">Navigation</span>');
    expect(html).toContain('<span class="ctxr-visually-hidden">Hide sidebar</span>');
  });
});

/** render-diagrams-in-notes design.md D6. */
describe('renderShell diagram scripts', () => {
  const state = { theme: 'system', navState: 'shown' } as const;
  const diagramBody = { html: '<pre class="ctxr-diagram"><code>graph TD\n</code></pre>\n', hasDiagram: true };

  it('references the renderer then the page script, in that order, when the body has a diagram', async () => {
    const html = await renderShell('t', diagramBody, 'n', state);
    const scripts = [...html.matchAll(/<script[^>]*>/g)].map((m) => m[0]);
    expect(scripts).toEqual([
      `<script defer src="${diagramRenderer().route}">`,
      `<script type="module" src="${DIAGRAM_SCRIPT_ROUTE}">`,
    ]);
    expect(diagramRenderer().route).toMatch(/^\/assets\/mermaid\/[^/]+\/mermaid\.tiny\.js$/);
  });

  it('leaves the slot empty when the body has no diagram', async () => {
    const html = await renderShell('t', { html: diagramBody.html, hasDiagram: false }, 'n', state);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('{{SCRIPTS}}');
    expect(html).toContain('</div>\n</body>');
  });

  it('names no external address in any src or href, with or without a diagram', async () => {
    for (const body of [diagramBody, { html: 'b', hasDiagram: false }]) {
      const html = await renderShell('t', body, '<nav><a href="/notes/a.md">a</a></nav>', state);
      const urls = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]!);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url, url).toMatch(/^[/?]/);
        expect(url, url).not.toMatch(/^https?:/);
      }
    }
  });
});

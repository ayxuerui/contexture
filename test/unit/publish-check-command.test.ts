import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute as executeCheck } from '../../src/commands/publish-check.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { contentHashOfBody } from '../../src/core/content/canonicalize.js';
import { PublishPageNotFoundError } from '../../src/core/errors.js';
import type { Store } from '../../src/core/store.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
    ...overrides,
  };
}

const GOOD_HTML = [
  '<!doctype html>',
  '<html><head><title>Good Page</title><meta name="viewport" content="width=device-width"><style>@media print{.x{display:none}}</style></head>',
  '<body><p><span>2026-09-01</span> <a href="./README.md">spec</a></p></body></html>',
  '',
].join('\n');

async function writePage(root: string, slug: string, html: string, readme: string | null = ''): Promise<string> {
  const dir = path.join(root, 'publish', slug);
  await mkdir(dir, { recursive: true });
  const htmlPath = path.join(dir, 'index.html');
  await writeFile(htmlPath, html);
  if (readme !== null) await writeFile(path.join(dir, 'README.md'), readme);
  return htmlPath;
}

const NOTE_BODY = '# Ctx note\n\nThe note a page represents.\n';

/**
 * two-kinds-of-published-page: a permanent page passes only when its README
 * leads with the one note it represents and carries that note's hash, so a
 * page meant to pass every other check writes the note and a stamped README.
 */
async function stampedReadme(root: string, noteBody = NOTE_BODY): Promise<string> {
  await mkdir(path.join(root, 'notes'), { recursive: true });
  await writeFile(path.join(root, 'notes', 'ctx-note.md'), noteBody);
  return `# page\n\n## Source notes\n\n- [[ctx-note]] — the note this page represents <!-- hash:${contentHashOfBody(noteBody)} -->\n`;
}

describe('publish check', () => {
  it('passes a page satisfying every invariant', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      // Filed under a grouping directory, which the filing-location check now requires.
      const htmlPath = await writePage(tmp.root, 'ctx-a/good', GOOD_HTML, await stampedReadme(tmp.root));

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data).toEqual({
        path: 'publish/ctx-a/good/index.html',
        passed: true,
        failures: [],
        lifespan: 'permanent',
        send_copies: [],
        served_at: {
          area: 'publish',
          route: '/publish/ctx-a/good/index.html',
          url: null,
          worktree: null,
          after_landing: null,
        },
      });
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws PublishPageNotFoundError for a path that does not exist', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      await expect(executeCheck(store, { path: path.join(tmp.root, 'publish/nope/index.html') })).rejects.toBeInstanceOf(
        PublishPageNotFoundError,
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails and names the check for a page missing its sibling README', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const htmlPath = await writePage(tmp.root, 'no-readme', GOOD_HTML, null);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toContain('sibling-readme');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails and names the check for a page referencing an external network resource', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = GOOD_HTML.replace('<style>', '<script src="https://cdn.example.com/x.js"></script><style>');
      const htmlPath = await writePage(tmp.root, 'cdn', html);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toContain('no-external-references');
    } finally {
      await tmp.cleanup();
    }
  });

  describe('no-external-references reads what a page loads', () => {
    async function externalChecks(html: string): Promise<string[]> {
      const tmp = await makeTmpDir();
      try {
        const store: Store = { root: tmp.root, config: makeConfig() };
        const htmlPath = await writePage(tmp.root, 'ctx-a/links', html, await stampedReadme(tmp.root));
        const outcome = await executeCheck(store, { path: htmlPath });
        return outcome.data!.failures.filter((f) => f.check === 'no-external-references').map((f) => f.message);
      } finally {
        await tmp.cleanup();
      }
    }
    const inBody = (fragment: string) => GOOD_HTML.replace('</body>', `${fragment}</body>`);
    const inStyle = (rule: string) => GOOD_HTML.replace('<style>', `<style>${rule}`);

    it('passes a page whose only external addresses are outbound links', async () => {
      const html = inBody('<a href="https://example.com/">one</a><a class=x href=\'http://example.org/\'>two</a><map><area href="https://example.net/"></map>');
      expect(await externalChecks(html)).toEqual([]);
    });

    it.each([
      ['an external stylesheet link', inBody('<link rel="stylesheet" href="https://cdn.example.com/x.css">')],
      ['an external image', inBody('<img src="https://cdn.example.com/x.png" alt="">')],
      ['an unquoted external src', inBody('<img src=https://cdn.example.com/x.png alt="">')],
      ['an external srcset candidate', inBody('<img src="x.png" srcset="x2.png 2x, https://cdn.example.com/x3.png 3x" alt="">')],
      ['an external base', GOOD_HTML.replace('<title>', '<base href="https://example.com/"><title>')],
      ['an external SVG use', inBody('<svg><use xlink:href="https://cdn.example.com/s.svg#i"></use></svg>')],
      ['an external video poster', inBody('<video poster="https://cdn.example.com/p.jpg"></video>')],
      ['an external CSS @import', inStyle('@import "https://fonts.example.com/f.css";')],
      ['an external CSS url()', inStyle('body{background:url(https://cdn.example.com/bg.png)}')],
      ['an external url() in a style attribute', inBody('<div style="background:url(&quot;https://cdn.example.com/bg.png&quot;)"></div>')],
    ])('fails %s', async (_label, html) => {
      const messages = await externalChecks(html);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('example.com');
    });
  });

  it('fails, names the check, and identifies the block for a syntactically invalid inline script', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = GOOD_HTML.replace('</body>', '<script>function broken( { console.log("x") }</script></body>');
      const htmlPath = await writePage(tmp.root, 'broken-js', html);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failure = outcome.data?.failures.find((f) => f.check === 'script-syntax');
      expect(failure?.message).toContain('block #0');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails when the sibling README declares a kind field', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const readme = '---\nkind: living\n---\n# page\n';
      const htmlPath = await writePage(tmp.root, 'tagged-readme', GOOD_HTML, readme);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const messages = outcome.data?.failures.filter((f) => f.check === 'readme-frontmatter').map((f) => f.message) ?? [];
      expect(messages.some((m) => m.includes('"kind"'))).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it('names every failing check in one run, not only the first', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = '<!doctype html><html><body>no viewport, no print rule, no provenance, no title</body></html>';
      const htmlPath = await writePage(tmp.root, 'many-failures', html, null);

      const outcome = await executeCheck(store, { path: htmlPath });
      const checks = outcome.data?.failures.map((f) => f.check) ?? [];
      expect(checks).toContain('viewport-meta');
      expect(checks).toContain('print-rule');
      expect(checks).toContain('provenance-line');
      expect(checks).toContain('sibling-readme');
      expect(checks).toContain('title');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails and names the check for a page with no title', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = GOOD_HTML.replace('<title>Good Page</title>', '');
      const htmlPath = await writePage(tmp.root, 'no-title', html);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toContain('title');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails and names the location check for a page filed directly at the publish path', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const htmlPath = await writePage(tmp.root, 'flat-page', GOOD_HTML, await stampedReadme(tmp.root));

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toEqual(['page-location']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports the location failure alongside every other failing check in the same run', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = GOOD_HTML.replace('<title>Good Page</title>', '');
      const htmlPath = await writePage(tmp.root, 'flat-and-untitled', html);

      const outcome = await executeCheck(store, { path: htmlPath });
      const checks = outcome.data?.failures.map((f) => f.check) ?? [];
      expect(checks).toContain('page-location');
      expect(checks).toContain('title');
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes the location check for a page filed several grouping directories deep', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const htmlPath = await writePage(tmp.root, 'ctx-a/ctx-b/deep', GOOD_HTML, await stampedReadme(tmp.root));

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.failures).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('names no expected directory in the location failure', async () => {
    const tmp = await makeTmpDir();
    try {
      // A store with layers configured: the failure must still not point at one of them,
      // because which grouping directory is correct is not derivable from the page.
      const config = makeConfig();
      const store: Store = {
        root: tmp.root,
        config: { ...config, taxonomy: { profile: 'custom', layers: [{ name: 'Ctx A', path: 'ctx-a', description: 'a' }] } },
      };
      const htmlPath = await writePage(tmp.root, 'flat-page', GOOD_HTML, await stampedReadme(tmp.root));

      const outcome = await executeCheck(store, { path: htmlPath });
      const message = outcome.data?.failures.find((f) => f.check === 'page-location')?.message ?? '';
      expect(message).toContain('publish/');
      expect(message).not.toContain('ctx-a');
      expect(message).not.toContain('Ctx A');
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports no location failure for a checked file outside the configured publish path', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const dir = path.join(tmp.root, 'elsewhere');
      await mkdir(dir, { recursive: true });
      const htmlPath = path.join(dir, 'index.html');
      await writeFile(htmlPath, GOOD_HTML);
      await writeFile(path.join(dir, 'README.md'), '');

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.data?.failures.map((f) => f.check)).not.toContain('page-location');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails and names the check for a page with an empty title', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const html = GOOD_HTML.replace('<title>Good Page</title>', '<title>   </title>');
      const htmlPath = await writePage(tmp.root, 'empty-title', html);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toContain('title');
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * publish-names-where-the-page-is-served: the address is reported on both
   * exit paths, because a page whose checks failed is exactly the one somebody
   * needs to open — and reported for no file that no route serves.
   */
  it('names the previewable address of a page checked from inside a session worktree', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      const worktreeRoot = path.join(tmp.root, config.session.worktrees_path, 'session-20260920-180253-d97aa6');
      await mkdir(worktreeRoot, { recursive: true });
      const store: Store = { root: worktreeRoot, config };
      const htmlPath = await writePage(worktreeRoot, 'ctx-a/good', GOOD_HTML, await stampedReadme(worktreeRoot));

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.served_at).toEqual({
        area: 'preview',
        route: '/preview/session-20260920-180253-d97aa6/ctx-a/good/index.html',
        url: null,
        worktree: 'session-20260920-180253-d97aa6',
        after_landing: { route: '/publish/ctx-a/good/index.html', url: null },
      });
      expect(outcome.humanSummary).toContain('all checks passed. Preview at /preview/session-20260920-180253-d97aa6/ctx-a/good/index.html');
    } finally {
      await tmp.cleanup();
    }
  });

  it('names the address on the failing path too', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const htmlPath = await writePage(tmp.root, 'ctx-a/bad', GOOD_HTML.replace('<title>Good Page</title>', '<title></title>'));

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.served_at?.route).toBe('/publish/ctx-a/bad/index.html');
      expect(outcome.humanSummary).toContain('Served at /publish/ctx-a/bad/index.html.');
    } finally {
      await tmp.cleanup();
    }
  });

  it('names no address for a file outside the configured publish path', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const dir = path.join(tmp.root, 'elsewhere');
      await mkdir(dir, { recursive: true });
      const htmlPath = path.join(dir, 'index.html');
      await writeFile(htmlPath, GOOD_HTML);
      await writeFile(path.join(dir, 'README.md'), '');

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.data?.served_at).toBeNull();
      expect(outcome.humanSummary).not.toContain('Served at');
      expect(outcome.humanSummary).not.toContain('Preview at');
    } finally {
      await tmp.cleanup();
    }
  });

  it('names an absolute address when the store declares a base URL', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig({ serve: { base_url: 'https://ctx-a.example.test' } }) };
      const htmlPath = await writePage(tmp.root, 'ctx-a/good', GOOD_HTML);

      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.data?.served_at?.url).toBe('https://ctx-a.example.test/publish/ctx-a/good/index.html');
    } finally {
      await tmp.cleanup();
    }
  });

});

describe('publish check — two-kinds-of-published-page lifespans', () => {
  async function checkAt(slug: string, readme: string | ((root: string) => Promise<string>) = '# page\n') {
    const tmp = await makeTmpDir();
    const store: Store = { root: tmp.root, config: makeConfig() };
    const readmeText = typeof readme === 'string' ? readme : await readme(tmp.root);
    const htmlPath = await writePage(tmp.root, slug, GOOD_HTML, readmeText);
    const outcome = await executeCheck(store, { path: htmlPath });
    return { tmp, store, htmlPath, outcome, checks: outcome.data?.failures.map((f) => f.check) ?? [] };
  }

  it('reports a well-formed disposable page as disposable, passing, with no represented-note check', async () => {
    const { tmp, outcome } = await checkAt('disposable/2026-10-13-agent-week');
    try {
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.lifespan).toBe('disposable');
      expect(outcome.data?.failures).toEqual([]);
      expect(outcome.humanSummary).toContain('(disposable)');
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes page-location for disposable/<dated>/', async () => {
    const { tmp, checks } = await checkAt('disposable/2026-01-01-example');
    try {
      expect(checks).not.toContain('page-location');
    } finally {
      await tmp.cleanup();
    }
  });

  for (const slug of ['disposable/folder-a/2026-10-13-agent-week', 'disposable/agent-week', 'disposable/2026-13-45-agent-week', 'disposable/ctx-a/example-page']) {
    it(`fails disposable-shape for ${slug}`, async () => {
      const { tmp, outcome, checks } = await checkAt(slug);
      try {
        expect(outcome.data?.lifespan).toBe('disposable');
        expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
        expect(checks).toContain('disposable-shape');
        expect(checks).not.toContain('represented-note');
      } finally {
        await tmp.cleanup();
      }
    });
  }

  it('reports a page anywhere else as permanent', async () => {
    const { tmp, outcome } = await checkAt('ctx-a/work/example-page', stampedReadme);
    try {
      expect(outcome.data?.lifespan).toBe('permanent');
      expect(outcome.exitCode).toBe(ExitCode.Ok);
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes a permanent page leading with its note and citing many after it', async () => {
    const readme = async (root: string) => {
      const lead = await stampedReadme(root);
      for (const n of ['cite-a', 'cite-b']) await writeFile(path.join(root, 'notes', `${n}.md`), `# ${n}\n`);
      return `${lead}- [[cite-a]]\n- [[cite-b]]\n- [[not-a-note-at-all]]\n`;
    };
    const { tmp, outcome } = await checkAt('ctx-a/hub-page', readme);
    try {
      expect(outcome.data?.failures).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails represented-note when the README links no note', async () => {
    const { tmp, outcome } = await checkAt('ctx-a/unlinked', '# page\n\nNo links here.\n');
    try {
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failure = outcome.data?.failures.find((f) => f.check === 'represented-note');
      expect(failure?.message).toContain('names no note');
    } finally {
      await tmp.cleanup();
    }
  });

  it('reads the lead link from the body, never from frontmatter', async () => {
    const readme = async (root: string) => {
      await stampedReadme(root); // the note exists, so only the frontmatter-vs-body reading decides
      return '---\nsource: "[[ctx-note]]"\n---\n# page\n\nNo links in the body.\n';
    };
    const { tmp, outcome } = await checkAt('ctx-a/frontmatter-only', readme);
    try {
      expect(outcome.data?.failures.find((f) => f.check === 'represented-note')?.message).toContain('names no note');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails represented-note when the lead link names no existing note', async () => {
    const { tmp, outcome } = await checkAt('ctx-a/unknown', '# page\n\n- [[nowhere-note]]\n');
    try {
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failure = outcome.data?.failures.find((f) => f.check === 'represented-note');
      expect(failure?.message).toContain('"nowhere-note", which no note in the store carries');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails represented-note naming both notes when the lead link stem is shared', async () => {
    const readme = async (root: string) => {
      for (const dir of ['ctx-a', 'ctx-b']) {
        await mkdir(path.join(root, dir), { recursive: true });
        await writeFile(path.join(root, dir, 'twin.md'), `# twin in ${dir}\n`);
      }
      return '# page\n\n- [[twin]]\n';
    };
    const { tmp, outcome } = await checkAt('ctx-a/ambiguous', readme);
    try {
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      const failure = outcome.data?.failures.find((f) => f.check === 'represented-note');
      expect(failure?.message).toContain('ctx-a/twin.md');
      expect(failure?.message).toContain('ctx-b/twin.md');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails represented-note-hash as not stamped when the lead line carries no marker', async () => {
    const readme = async (root: string) => (await stampedReadme(root)).replace(/ <!-- hash:[0-9a-f]{16} -->/, '');
    const { tmp, outcome, checks } = await checkAt('ctx-a/unstamped', readme);
    try {
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(checks).toEqual(['represented-note-hash']);
      expect(outcome.data?.failures[0]?.message).toContain('not stamped');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails represented-note-hash as stale once the note changes after stamping', async () => {
    const { tmp, store, htmlPath } = await checkAt('ctx-a/drifted', stampedReadme);
    try {
      await writeFile(path.join(tmp.root, 'notes', 'ctx-note.md'), `${NOTE_BODY}\nA new fact.\n`);
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toEqual(['represented-note-hash']);
      expect(outcome.data?.failures[0]?.message).toContain('stale');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('publish check — send copies (file-pdfs-beside-their-page, send-copies-beside-their-page)', () => {
  const PDF_BYTES = '%PDF-1.4\n%%EOF\n';

  async function pageWithFiles(files: readonly string[], slug = 'ctx-a/brief', readme: (root: string) => Promise<string> = stampedReadme) {
    const tmp = await makeTmpDir();
    const store: Store = { root: tmp.root, config: makeConfig() };
    const htmlPath = await writePage(tmp.root, slug, GOOD_HTML, await readme(tmp.root));
    for (const file of files) {
      const filePath = path.join(path.dirname(htmlPath), file);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, PDF_BYTES);
    }
    return { tmp, store, htmlPath };
  }

  it('passes a dated PDF beside the index page and lists it with its address', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['2026-01-15-brief.pdf']);
    try {
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.failures).toEqual([]);
      expect(outcome.data?.send_copies).toEqual([
        {
          path: 'publish/ctx-a/brief/2026-01-15-brief.pdf',
          served_at: { area: 'publish', route: '/publish/ctx-a/brief/2026-01-15-brief.pdf', url: null, worktree: null, after_landing: null },
        },
      ]);
      expect(outcome.humanSummary).toContain('1 send copy(ies).');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails send-copy-name for an undated PDF at the folder root, naming it, alongside every other check', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const htmlPath = await writePage(tmp.root, 'ctx-a/brief', GOOD_HTML.replace('<title>Good Page</title>', ''), await stampedReadme(tmp.root));
      await writeFile(path.join(path.dirname(htmlPath), 'brief.pdf'), PDF_BYTES);
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check).sort()).toEqual(['send-copy-name', 'title']);
      expect(outcome.data?.failures.find((f) => f.check === 'send-copy-name')?.message).toContain('"brief.pdf"');
    } finally {
      await tmp.cleanup();
    }
  });

  for (const name of ['2026-02-30-brief.pdf', '2026-01-15-.pdf', '2026-01-15.pdf']) {
    it(`fails send-copy-name for ${name}`, async () => {
      const { tmp, store, htmlPath } = await pageWithFiles([name]);
      try {
        const outcome = await executeCheck(store, { path: htmlPath });
        expect(outcome.data?.failures.map((f) => f.check)).toEqual(['send-copy-name']);
      } finally {
        await tmp.cleanup();
      }
    });
  }

  it('treats a PDF under assets/ as an input: no send-copy-name result and not listed', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['assets/kickoff.pdf']);
    try {
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.send_copies).toEqual([]);
      expect(outcome.humanSummary).not.toContain('send cop');
    } finally {
      await tmp.cleanup();
    }
  });

  it('lists each earlier rendering beside the newest, in date order', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['2026-03-02-brief.pdf', '2026-01-15-brief.pdf']);
    try {
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.data?.send_copies.map((copy) => copy.path)).toEqual(['publish/ctx-a/brief/2026-01-15-brief.pdf', 'publish/ctx-a/brief/2026-03-02-brief.pdf']);
      expect(outcome.data?.send_copies[1]?.served_at?.route).toBe('/publish/ctx-a/brief/2026-03-02-brief.pdf');
    } finally {
      await tmp.cleanup();
    }
  });

  it('checks the page when the path names one of its PDFs', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['2026-01-15-brief.pdf']);
    try {
      const outcome = await executeCheck(store, { path: path.join(path.dirname(htmlPath), '2026-01-15-brief.pdf') });
      expect(outcome).toEqual(await executeCheck(store, { path: htmlPath }));
      expect(outcome.data?.path).toBe('publish/ctx-a/brief/index.html');
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws PublishPageNotFoundError for the index page when a named PDF has none beside it', async () => {
    const tmp = await makeTmpDir();
    try {
      const store: Store = { root: tmp.root, config: makeConfig() };
      const dir = path.join(tmp.root, 'publish', 'ctx-a', 'loose');
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, '2026-01-15-brief.pdf'), PDF_BYTES);
      await expect(executeCheck(store, { path: path.join(dir, '2026-01-15-brief.pdf') })).rejects.toThrow(PublishPageNotFoundError);
      await expect(executeCheck(store, { path: path.join(dir, '2026-01-15-brief.pdf') })).rejects.toThrow('publish/ctx-a/loose/index.html');
    } finally {
      await tmp.cleanup();
    }
  });

  it('keeps a stale page stale when a newer PDF is added without restamping', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['2026-01-15-brief.pdf']);
    try {
      await writeFile(path.join(tmp.root, 'notes', 'ctx-note.md'), `${NOTE_BODY}\nA new fact.\n`);
      await writeFile(path.join(path.dirname(htmlPath), '2026-03-02-brief.pdf'), PDF_BYTES);
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
      expect(outcome.data?.failures.map((f) => f.check)).toEqual(['represented-note-hash']);
      expect(outcome.data?.failures[0]?.message).toContain('stale');
    } finally {
      await tmp.cleanup();
    }
  });

  it('fails send-copy-name on a disposable page too', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['brief.pdf'], 'disposable/2026-10-13-agent-week', async () => '# page\n');
    try {
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.data?.lifespan).toBe('disposable');
      expect(outcome.data?.failures.map((f) => f.check)).toEqual(['send-copy-name']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes a dated send copy in each of the four formats and lists them all', async () => {
    const names = ['2026-01-15-brief.docx', '2026-01-15-brief.pdf', '2026-01-15-deck.pptx', '2026-01-15-model.xlsx'];
    const { tmp, store, htmlPath } = await pageWithFiles(names);
    try {
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.failures).toEqual([]);
      expect(outcome.data?.send_copies.map((copy) => copy.path)).toEqual(names.map((name) => `publish/ctx-a/brief/${name}`));
      expect(outcome.data?.send_copies.every((copy) => copy.served_at?.route === `/${copy.path}`)).toBe(true);
      expect(outcome.humanSummary).toContain('4 send copy(ies).');
    } finally {
      await tmp.cleanup();
    }
  });

  for (const name of ['model.xlsx', '2026-02-30-brief.docx', 'deck.pptx', 'Brief.PDF']) {
    it(`fails send-copy-name for ${name}, naming it`, async () => {
      const { tmp, store, htmlPath } = await pageWithFiles([name]);
      try {
        const outcome = await executeCheck(store, { path: htmlPath });
        expect(outcome.exitCode).toBe(ExitCode.CheckFailed);
        expect(outcome.data?.failures.map((f) => f.check)).toEqual(['send-copy-name']);
        expect(outcome.data?.failures[0]?.message).toContain(`"${name}"`);
      } finally {
        await tmp.cleanup();
      }
    });
  }

  it('passes an upper-case extension when the name is dated', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['2026-01-15-Brief.PDF']);
    try {
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.data?.failures).toEqual([]);
      expect(outcome.data?.send_copies.map((copy) => copy.path)).toEqual(['publish/ctx-a/brief/2026-01-15-Brief.PDF']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('treats an office file under assets/ as an input', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['assets/source-data.xlsx', 'assets/kickoff.pdf']);
    try {
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.send_copies).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves a format outside the four alone', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['data.csv']);
    try {
      const outcome = await executeCheck(store, { path: htmlPath });
      expect(outcome.exitCode).toBe(ExitCode.Ok);
      expect(outcome.data?.send_copies).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('checks the page when the path names a spreadsheet send copy', async () => {
    const { tmp, store, htmlPath } = await pageWithFiles(['2026-01-15-model.xlsx']);
    try {
      const outcome = await executeCheck(store, { path: path.join(path.dirname(htmlPath), '2026-01-15-model.xlsx') });
      expect(outcome).toEqual(await executeCheck(store, { path: htmlPath }));
    } finally {
      await tmp.cleanup();
    }
  });
});

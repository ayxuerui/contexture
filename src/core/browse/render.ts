import MarkdownIt from 'markdown-it';
import type { StateInline, Token } from 'markdown-it';
import type { LinkResolver } from './link-resolver.js';

/**
 * markdown-it's own `Renderer.RenderRule` type lives three namespace levels
 * deep (`MarkdownIt.Renderer.RenderRule`), which isn't reachable through a
 * default import under this project's module settings — a narrower local
 * alias for exactly the shape used here avoids that without widening
 * anything markdown-it itself doesn't already guarantee.
 */
type RenderRule = (tokens: Token[], idx: number) => string;

const OPEN = 0x5b; // '['

/**
 * local-browsing-surface design.md D3: a resolvable `[[Target]]` becomes a
 * real link to that note's route; an unresolved or ambiguous one becomes
 * visibly-marked, non-clickable markup naming the reason — never a link to
 * an arbitrary or wrong target. Target extraction (up to the first `]`,
 * `|`, or `#`) mirrors `extractLinks`' `WIKILINK_RE` in
 * `src/core/graph/model.ts`, so a link this parses is a link the graph
 * build parses identically.
 */
function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  const max = state.posMax;
  if (start + 3 >= max) return false;
  if (state.src.charCodeAt(start) !== OPEN || state.src.charCodeAt(start + 1) !== OPEN) return false;

  const end = state.src.indexOf(']]', start + 2);
  if (end === -1 || end > max) return false;

  const rawInner = state.src.slice(start + 2, end);
  const targetMatch = /^([^\]|#]+)/.exec(rawInner);
  const target = targetMatch?.[1]?.trim();
  if (!target) return false;

  const pipeIdx = rawInner.indexOf('|');
  const label = (pipeIdx !== -1 ? rawInner.slice(pipeIdx + 1).trim() : '') || target;

  if (!silent) {
    const token = state.push('wikilink', '', 0);
    token.meta = { target, label };
  }
  state.pos = end + 2;
  return true;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderWikilink(resolveLink: LinkResolver): RenderRule {
  return (tokens, idx) => {
    const { target, label } = tokens[idx]!.meta as { target: string; label: string };
    const resolution = resolveLink(target);
    const safeLabel = escapeHtml(label);
    if ('path' in resolution) {
      return `<a href="/notes/${encodeURI(resolution.path)}">${safeLabel}</a>`;
    }
    const reasonText = resolution.reason === 'ambiguous' ? 'ambiguous' : 'unresolved';
    const title = `${reasonText} wikilink target: ${target}`;
    return `<span class="ctxr-broken-link" data-reason="${resolution.reason}" title="${escapeHtml(title)}">${safeLabel}</span>`;
  };
}

/** The per-render `env` markdown-it threads through every rule; the fence rule records a diagram in it. */
// A type alias rather than an interface, so it satisfies markdown-it's index-signature `Env`.
type RenderEnv = { hasDiagram: boolean };

type Markdown = InstanceType<typeof MarkdownIt>;

/** Read from the instance rather than the namespace, for the same reason as `RenderRule` above. */
type FenceRule = NonNullable<Markdown['renderer']['rules']['fence']>;

/**
 * render-diagrams-in-notes design.md D5: a fence whose info string's first
 * word is `mermaid` becomes a source block marked as a diagram, escaped like
 * every other text this renderer emits — readable as it stands without
 * script, and the seam the page script draws from. Every other fence goes to
 * markdown-it's own rule untouched. The first word is split out the way
 * markdown-it's default rule splits a language name, so the two agree on
 * what `mermaid` labels.
 */
function diagramFence(md: Markdown, defaultFence: FenceRule): FenceRule {
  return (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const language = md.utils.unescapeAll(token.info).trim().split(/\s+/)[0];
    if (language !== 'mermaid') return defaultFence(tokens, idx, options, env, self);
    (env as RenderEnv).hasDiagram = true;
    return `<pre class="ctxr-diagram"><code>${escapeHtml(token.content)}</code></pre>\n`;
  };
}

function buildRenderer(resolveLink: LinkResolver) {
  const md = new MarkdownIt({ html: false, linkify: true });
  md.inline.ruler.before('link', 'wikilink', wikilinkRule);
  md.renderer.rules.wikilink = renderWikilink(resolveLink);
  md.renderer.rules.fence = diagramFence(md, md.renderer.rules.fence!);
  return md;
}

/**
 * A rendered body, and whether it holds a diagram block. render-diagrams-in-notes
 * design.md D5: the flag is set by the fence rule as it emits the block, never
 * found by searching the HTML, which a code block quoting the class name would match.
 */
export interface RenderedBody {
  html: string;
  hasDiagram: boolean;
}

/** Renders a note's markdown body to HTML, with wikilinks resolved via `resolveLink` (design.md D3). */
export function renderNoteBody(body: string, resolveLink: LinkResolver): RenderedBody {
  const env: RenderEnv = { hasDiagram: false };
  const html = buildRenderer(resolveLink).render(body, env);
  return { html, hasDiagram: env.hasDiagram };
}

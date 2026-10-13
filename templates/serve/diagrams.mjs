/*
 * render-diagrams-in-notes design.md D6/D7: draws each `.ctxr-diagram` source
 * block with the renderer the shell loaded just before this module
 * (`window.mermaid`, served by `ctxr serve` from its installed dependency).
 * Script only enhances: without it the block stays readable source. This file
 * registers no icon loader and fetches nothing.
 *
 * The two exported functions are pure, so a unit test imports them without a
 * DOM; everything that touches the page runs only when there is a document.
 */

/**
 * The scheme the page renders in. `light` and `dark` are the reader's explicit
 * choice, already applied by the server; only `system` defers to the browser.
 */
export function effectiveScheme(themeAttr, prefersDark) {
  if (themeAttr === 'dark') return 'dark';
  if (themeAttr === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

/**
 * Maps the shell's `--ctxr-*` custom properties (read through `readProperty`,
 * a name-to-value function) to mermaid `themeVariables` for its `base` theme,
 * so `style.css` stays the palette's one source.
 */
export function themeVariables(readProperty) {
  const fg = readProperty('--ctxr-fg');
  const bg = readProperty('--ctxr-bg');
  const muted = readProperty('--ctxr-muted');
  const border = readProperty('--ctxr-border');
  const codeBg = readProperty('--ctxr-code-bg');
  return {
    background: bg,
    textColor: fg,
    lineColor: muted,
    primaryColor: codeBg,
    primaryTextColor: fg,
    primaryBorderColor: muted,
    secondaryColor: bg,
    secondaryTextColor: fg,
    secondaryBorderColor: muted,
    tertiaryColor: bg,
    tertiaryTextColor: fg,
    tertiaryBorderColor: border,
    mainBkg: codeBg,
    nodeBorder: muted,
    nodeTextColor: fg,
    clusterBkg: bg,
    clusterBorder: border,
    titleColor: fg,
    edgeLabelBackground: bg,
    actorBkg: codeBg,
    actorBorder: muted,
    actorTextColor: fg,
    actorLineColor: muted,
    signalColor: fg,
    signalTextColor: fg,
    labelBoxBkgColor: codeBg,
    labelBoxBorderColor: muted,
    labelTextColor: fg,
    loopTextColor: fg,
    noteBkgColor: codeBg,
    noteTextColor: fg,
    noteBorderColor: border,
    activationBkgColor: codeBg,
    activationBorderColor: muted,
    sequenceNumberColor: bg,
  };
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Each block's source, kept from before the first draw so a redraw starts from the author's text. */
const sources = new Map();
let renderCount = 0;

function initialize(mermaid, root) {
  const style = getComputedStyle(root);
  const readProperty = (name) => style.getPropertyValue(name).trim();
  const scheme = effectiveScheme(root.getAttribute('data-ctxr-theme'), matchMedia(DARK_QUERY).matches);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'base',
    themeVariables: { ...themeVariables(readProperty), darkMode: scheme === 'dark' },
  });
}

/** Draws one block; a failure keeps its source visible and marks it, without stopping the others. */
async function draw(mermaid, block) {
  const source = sources.get(block);
  try {
    renderCount += 1;
    const { svg } = await mermaid.render(`ctxr-diagram-${renderCount}`, source);
    block.innerHTML = svg;
    block.setAttribute('data-ctxr-diagram-drawn', '');
    block.removeAttribute('data-ctxr-diagram-error');
  } catch (err) {
    block.textContent = source;
    block.removeAttribute('data-ctxr-diagram-drawn');
    block.setAttribute('data-ctxr-diagram-error', err instanceof Error ? err.message : String(err));
  }
}

async function drawAll(mermaid, root) {
  initialize(mermaid, root);
  for (const block of sources.keys()) await draw(mermaid, block);
}

if (typeof document !== 'undefined') {
  const mermaid = globalThis.mermaid;
  const root = document.documentElement;
  const blocks = document.querySelectorAll('.ctxr-diagram');
  if (mermaid && blocks.length > 0) {
    for (const block of blocks) sources.set(block, block.textContent);
    void drawAll(mermaid, root);
    // A chosen light or dark theme is a full page load; only `system` changes under an open page.
    if (root.getAttribute('data-ctxr-theme') === 'system') {
      matchMedia(DARK_QUERY).addEventListener('change', () => void drawAll(mermaid, root));
    }
  }
}

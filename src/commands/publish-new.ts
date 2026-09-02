import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { PublishInvalidSlugError, PublishReservedSlugError, PublishSlugExistsError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface PublishNewFlags {
  slug: string;
}

export interface PublishNewData {
  slug: string;
  path: string;
}

/** publish spec: reserved for frozen snapshots — a living page's own name must never collide with this shape. */
const RESERVED_SLUG_PATTERN = /^\d{4}-/;

/**
 * browse-navigation-by-folder design.md D5: a slug may name a path of
 * folders, so it is validated a segment at a time. Refusing an empty, `.`,
 * `..`, or absolute segment is what keeps a slug from resolving anywhere
 * but under the configured publish path — the command joined the slug on
 * directly before, with no validation at all.
 */
function pageSegments(slug: string): string[] {
  if (path.isAbsolute(slug)) throw new PublishInvalidSlugError(slug);
  const segments = slug.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') throw new PublishInvalidSlugError(slug);
  }
  return segments;
}

function pageSkeleton(slug: string, dateCreated: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${slug}</title>`,
    '<style>',
    '@media print {',
    '  .no-print { display: none; }',
    '}',
    '</style>',
    '</head>',
    '<body>',
    `<p class="meta"><span>${dateCreated}</span> &middot; <a href="./README.md">spec</a></p>`,
    '<main>',
    '<!-- Build the bespoke representation here. -->',
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function readmeSkeleton(slug: string, dateCreated: string): string {
  return [
    `# ${slug}`,
    '',
    `date-created: ${dateCreated}`,
    '',
    '## Intent',
    '',
    "One sentence: what does this page let the viewer DO that its source notes couldn't?",
    '',
    '## Source notes',
    '',
    'Wikilinks back into the store. The notes are the source of truth; this page is a representation of them.',
    '',
    '## Audience & use',
    '',
    'Who is this for, and in what setting will they use it?',
    '',
    '## Spec / prompt',
    '',
    'The brief that produced index.html. Keep this so the page is regenerable.',
    '',
  ].join('\n');
}

/**
 * publish spec: fixes a page's identity once. Refuses a slug whose page name
 * collides with the reserved dated-snapshot naming pattern or whose segments
 * would resolve outside the publish path, and never overwrites an existing
 * page folder — the caller updates in place by editing the existing files
 * directly, never by re-running this command.
 */
export async function execute(store: Store, flags: PublishNewFlags): Promise<CommandOutcome<PublishNewData>> {
  const segments = pageSegments(flags.slug);
  // The final segment is the page's own identity; the ones before it are the
  // directories it is filed under, which the reserved naming does not govern.
  const pageName = segments[segments.length - 1]!;
  if (RESERVED_SLUG_PATTERN.test(pageName)) {
    throw new PublishReservedSlugError(flags.slug, pageName);
  }

  const relativePath = path.join(store.config.publish.path, flags.slug).split(path.sep).join('/');
  const absolutePath = path.join(store.root, relativePath);
  if (existsSync(absolutePath)) {
    throw new PublishSlugExistsError(flags.slug, relativePath);
  }

  const dateCreated = new Date().toISOString().slice(0, 10);
  await mkdir(absolutePath, { recursive: true });
  await writeFileAtomic(path.join(absolutePath, 'index.html'), pageSkeleton(pageName, dateCreated));
  await writeFileAtomic(path.join(absolutePath, 'README.md'), readmeSkeleton(pageName, dateCreated));

  return {
    exitCode: ExitCode.Ok,
    data: { slug: flags.slug, path: relativePath },
    findings: [],
    humanSummary: `Created "${relativePath}".`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

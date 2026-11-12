// A conflict resolver for the land tests: rebases onto $CTXR_LAND_BASE and, on each conflict,
// keeps both sides (drops the markers). With --broken it then commits a note whose frontmatter does not parse, which fails doctor;
// with --fail it gives up.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const flags = process.argv.slice(2);
if (flags.includes('--fail')) process.exit(3);
const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  git(['-c', 'core.editor=true', 'rebase', process.env.CTXR_LAND_BASE]);
} catch {
  for (;;) {
    for (const file of git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean)) {
      const kept = readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !/^(<<<<<<<|=======|>>>>>>>)/.test(line))
        .join('\n');
      writeFileSync(file, kept);
      git(['add', file]);
    }
    try {
      git(['-c', 'core.editor=true', 'rebase', '--continue']);
      break;
    } catch {
      // the next commit conflicted too
    }
  }
}
if (flags.includes('--broken')) {
  mkdirSync('projects', { recursive: true });
  writeFileSync('projects/broken.md', '---\ntitle: [unclosed\n---\n# Broken\n');
  git(['add', 'projects/broken.md']);
  git(['commit', '--no-verify', '-qm', 'resolver adds a note doctor refuses']);
}

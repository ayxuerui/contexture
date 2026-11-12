import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** The stub every CLI name points at: records what it was given, then behaves as scripted. */
export const STUB = `#!/usr/bin/env node
const fs = require('node:fs');
const name = require('node:path').basename(process.argv[1]);
const dir = process.env.CTXR_SECOND_OPINION_STUB_DIR;
const args = process.argv.slice(2);
const behavior = JSON.parse(process.env['CTXR_SECOND_OPINION_STUB_' + name.toUpperCase()] || '{"kind":"ok","text":"PONG"}');
const isHelp = args.includes('--help');
let stdin = '';
if (!isHelp && behavior.kind !== 'hang') { try { stdin = fs.readFileSync(0, 'utf8'); } catch {} }
const listHome = (root, rel = '') => fs.readdirSync(root + '/' + rel, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? listHome(root, rel + e.name + '/') : [rel + e.name]);
if (!isHelp) {
  // A confined stub may not be able to write the log; the answer it prints still says what it saw.
  try {
    const file = dir + '/' + name + '.json';
    const prior = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    const home = process.env.CTXR_SECOND_OPINION_STUB_LISTHOME ? listHome(process.env.HOME) : undefined;
    prior.push({ args, stdin, cwd: process.cwd(), ppid: process.ppid, env: process.env, home });
    fs.writeFileSync(file, JSON.stringify(prior));
  } catch {}
}
if (!isHelp && behavior.rewrite) fs.writeFileSync(process.env.HOME + '/' + behavior.rewrite, 'rotated by ' + name);
if (!isHelp && behavior.touchOriginal) fs.writeFileSync(behavior.touchOriginal, 'changed meanwhile');
if (isHelp) { console.log(behavior.help ?? '--tools --model --effort --no-session-persistence --disable-slash-commands --output-format --skip-git-repo-check --sandbox --ephemeral --color --config --print'); process.exit(0); }
if (behavior.kind === 'exit') { console.error(behavior.stderr ?? 'boom'); process.exit(behavior.code ?? 1); }
if (behavior.kind === 'hang') { setInterval(() => {}, 1000); return; }
let text = behavior.text;
if (behavior.read) { let seen; try { seen = 'read ' + fs.readFileSync(behavior.read, 'utf8').trim(); } catch (e) { seen = 'refused ' + e.code; } text += '\\nREAD-RESULT: ' + seen; }
if (name === 'claude') console.log(JSON.stringify({ result: text, modelUsage: { 'claude-stub-1': {} } }));
else if (name === 'codex') console.log('OpenAI Codex v0\\n--------\\nmodel: gpt-stub\\nsandbox: read-only\\n--------\\nuser\\n(prompt echo)\\ncodex\\n' + text + '\\ntokens used\\n42\\n' + text);
else console.log(text);
`;

/**
 * serve-the-second-opinion-to-chat-apps: a stub `setpriv` first on PATH, so a
 * run's confinement does not depend on the machine's util-linux. By default it
 * offers no Landlock, and runs are unconfined as before; a test sets
 * `CTXR_SECOND_OPINION_STUB_SETPRIV=landlock` to have it advertise Landlock and
 * run the command after `--` without confining it.
 */
export const SETPRIV_STUB = [
  '#!/usr/bin/env node',
  "const { spawnSync } = require('node:child_process');",
  "const fs = require('node:fs');",
  'const args = process.argv.slice(2);',
  "const landlock = process.env.CTXR_SECOND_OPINION_STUB_SETPRIV === 'landlock';",
  "if (args.includes('--help')) { console.log(landlock ? ' --landlock-access <access>  add Landlock access' : ' --reuid <uid>'); process.exit(0); }",
  "if (args.includes('--version')) { console.log('setpriv stub'); process.exit(0); }",
  // One file per call: three CLIs start at once, and a shared log would lose one.
  "try { fs.writeFileSync(process.env.CTXR_SECOND_OPINION_STUB_DIR + '/setpriv-' + process.pid + '.json', JSON.stringify(args)); } catch {}",
  "const rest = args.slice(args.indexOf('--') + 1);",
  "const r = spawnSync(rest[0], rest.slice(1), { stdio: 'inherit' });",
  'process.exit(r.status ?? 1);',
  '',
].join('\n');


/** Writes the stub `claude`, `codex`, `agy` and `setpriv` into `binDir`, to go first on PATH. */
export function installSecondOpinionStubs(binDir: string): void {
  writeFileSync(path.join(binDir, 'setpriv'), SETPRIV_STUB);
  chmodSync(path.join(binDir, 'setpriv'), 0o755);
  for (const name of ['claude', 'codex', 'agy']) {
    const file = path.join(binDir, name);
    writeFileSync(file, STUB.replace(/^#!.*\n/, '#!/usr/bin/env node\n"use strict";(function(){\n') + '\n})();\n');
    chmodSync(file, 0o755);
  }
}

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { packagedTemplate } from '../templates.js';

/**
 * write-lifecycle spec: the resolver gets "the conflict playbook the shipped
 * lifecycle skill carries" — read out of that skill's own template, so the
 * playbook has one source and the resolver can never follow an older copy.
 */
function lifecyclePlaybook(defaultBranch: string): string {
  const skill = readFileSync(fileURLToPath(new URL('../../../templates/skills/ctxr-session-lifecycle.md', import.meta.url)), 'utf8');
  const start = skill.indexOf('## Conflict playbook');
  if (start === -1) throw new Error('the lifecycle skill template carries no "## Conflict playbook" section');
  const next = skill.indexOf('\n## ', start + 1);
  const section = skill.slice(skill.indexOf('\n', start) + 1, next === -1 ? undefined : next).trim();
  return section.replaceAll('__DEFAULT_BRANCH__', defaultBranch);
}

export function resolverPrompt(pullNumber: number, base: string, defaultBranch: string): string {
  return packagedTemplate('land', 'resolver')
    .replaceAll('__PR__', () => String(pullNumber))
    .replaceAll('__BASE__', () => base)
    .replace('__PLAYBOOK__', () => lifecyclePlaybook(defaultBranch));
}

/**
 * design.md D6: the one place `ctxr land` spawns the store's configured
 * conflict resolver — an argument vector, never a shell string, run in the
 * checkout to resolve, with the prompt as its last argument. Its output goes to
 * `output` (the command's stderr), so stdout keeps the one envelope.
 */
export function runResolver(input: {
  argv: readonly string[];
  prompt: string;
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  output: NodeJS.WritableStream;
}): Promise<number> {
  const [command, ...args] = input.argv;
  return new Promise((resolve) => {
    const child = spawn(command!, [...args, input.prompt], { cwd: input.cwd, env: input.env as NodeJS.ProcessEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk: Buffer) => input.output.write(chunk));
    child.stderr.on('data', (chunk: Buffer) => input.output.write(chunk));
    child.on('error', () => resolve(127));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

import { execFileSync } from 'node:child_process';

/**
 * Integration tests spawn the real built binary (dist/bin.js) as a subprocess,
 * because they exist to prove real exit codes and real stdout/stderr — not
 * mocked behavior. Unit tests import from src/ directly and don't need this.
 */
export default function setup(): void {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit', cwd: process.cwd() });
}

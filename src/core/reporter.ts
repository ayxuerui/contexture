import type { Io } from './env.js';
import type { Envelope } from './envelope.js';

/**
 * The only object in the codebase permitted to write to stdout. This is what
 * makes the "JSON output is parseable in isolation" scenario mechanical
 * rather than a convention every command has to remember: a command that
 * imports Reporter has no other way to reach stdout, and a guard test
 * (single-source-literals.test.ts) fails on any direct `process.stdout` use
 * under src/commands/**.
 */
export interface Reporter {
  /** Emits the command's result exactly once: JSON in --json mode, a human summary otherwise. */
  emitResult<T>(envelope: Envelope<T>, humanSummary: string): void;
  /** Diagnostic narration — always stderr, safe to call in either mode. */
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createReporter(io: Io, jsonMode: boolean): Reporter {
  let emitted = false;

  function assertNotEmitted(): void {
    if (emitted) {
      throw new Error('Reporter.emitResult was called more than once in a single invocation.');
    }
    emitted = true;
  }

  return {
    emitResult(envelope, humanSummary) {
      assertNotEmitted();
      io.stdout.write(`${jsonMode ? JSON.stringify(envelope) : humanSummary}\n`);
    },
    info(message) {
      io.stderr.write(`${message}\n`);
    },
    warn(message) {
      io.stderr.write(`warning: ${message}\n`);
    },
    error(message) {
      io.stderr.write(`error: ${message}\n`);
    },
  };
}

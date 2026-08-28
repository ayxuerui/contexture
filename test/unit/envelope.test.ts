import { describe, expect, it } from 'vitest';
import { buildEnvelope } from '../../src/core/envelope.js';
import { ExitCode } from '../../src/core/exit-codes.js';

function envelope(exitCode: number) {
  return buildEnvelope({
    cliVersion: '0.1.0',
    command: 'x',
    storeRoot: null,
    schemaVersion: null,
    findings: [],
    data: null,
    exitCode: exitCode as ExitCode,
  });
}

describe('buildEnvelope', () => {
  it('maps ExitCode.Ok to status "ok"', () => {
    expect(envelope(ExitCode.Ok).status).toBe('ok');
  });

  it('maps ExitCode.Internal and ExitCode.Usage to status "error"', () => {
    expect(envelope(ExitCode.Internal).status).toBe('error');
    expect(envelope(ExitCode.Usage).status).toBe('error');
  });

  it('maps ExitCode.CheckFailed to status "failed"', () => {
    expect(envelope(ExitCode.CheckFailed).status).toBe('failed');
  });

  it('always carries envelope_version 1 and the given exit_code', () => {
    const env = envelope(ExitCode.Ok);
    expect(env.envelope_version).toBe(1);
    expect(env.exit_code).toBe(ExitCode.Ok);
  });

  it('carries store root, schema version, findings, and data through unchanged', () => {
    const env = buildEnvelope({
      cliVersion: '0.1.0',
      command: 'doctor',
      storeRoot: '/a/b',
      schemaVersion: 3,
      findings: [{ code: 'x', severity: 'info', message: 'hi' }],
      data: { n: 1 },
      exitCode: ExitCode.Ok,
    });
    expect(env.store).toEqual({ root: '/a/b', schema_version: 3 });
    expect(env.findings).toEqual([{ code: 'x', severity: 'info', message: 'hi' }]);
    expect(env.data).toEqual({ n: 1 });
  });
});

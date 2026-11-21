import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * second-opinion-through-openrouter: a stub OpenRouter endpoint on localhost,
 * in a process of its own because the command tests spawn `ctxr` synchronously
 * and a server in the test's own process could not answer meanwhile. It
 * records every request to `<dir>/openrouter.json` and answers as
 * `<dir>/openrouter-behavior.json` says, read on each request so a test can
 * change it between runs without restarting anything.
 */
const SERVER = `
const http = require('node:http');
const fs = require('node:fs');
const dir = process.argv[1];
const log = dir + '/openrouter.json';
const behaviorFile = dir + '/openrouter-behavior.json';
const server = http.createServer((req, res) => {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const prior = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : [];
    let parsed = null;
    try { parsed = JSON.parse(body); } catch {}
    prior.push({ method: req.method, url: req.url, headers: req.headers, body: parsed, rawBody: body });
    fs.writeFileSync(log, JSON.stringify(prior));
    const b = fs.existsSync(behaviorFile) ? JSON.parse(fs.readFileSync(behaviorFile, 'utf8')) : { kind: 'ok', text: 'PONG' };
    const send = (status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(typeof payload === 'string' ? payload : JSON.stringify(payload)); };
    if (b.kind === 'hang') return;
    if (b.kind === 'status') return send(b.code, { error: { code: b.code, message: b.message } });
    if (b.kind === 'error200') return send(200, b.onChoice ? { model: 'stub/answered', choices: [{ error: { code: 502, message: b.message }, message: { content: '' } }] } : { error: { code: 502, message: b.message } });
    if (b.kind === 'garbage') return send(200, '<html>not json</html>');
    if (b.kind === 'nochoices') return send(200, { model: 'stub/answered' });
    return send(200, { id: 'gen-stub', object: 'chat.completion', model: b.model ?? 'stub/answered', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: b.text ?? '' } }] });
  });
});
server.listen(0, '127.0.0.1', () => { console.log(server.address().port); });
`;

export type StubBehavior =
  | { kind: 'ok'; text: string; model?: string }
  | { kind: 'status'; code: number; message: string }
  | { kind: 'error200'; message: string; onChoice?: boolean }
  | { kind: 'hang' }
  | { kind: 'garbage' }
  | { kind: 'nochoices' };

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: { model?: string; messages?: Array<{ role: string; content: string }>; stream?: boolean; provider?: Record<string, unknown>; tools?: unknown } | null;
  rawBody: string;
}

export interface OpenRouterStub {
  /** The base address to put in `CTXR_SECOND_OPINION_OPENROUTER_URL`. */
  url: string;
  requests(): RecordedRequest[];
  behave(behavior: StubBehavior): void;
  stop(): void;
}

/** The key every test sets; searched for in whatever a run wrote or printed. */
export const STUB_KEY = 'sk-or-stub-7f3a91c2e5';

export async function startOpenRouterStub(dir: string): Promise<OpenRouterStub> {
  const child: ChildProcess = spawn(process.execPath, ['-e', SERVER, dir], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise<number>((resolve, reject) => {
    let out = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (d: string) => {
      out += d;
      const line = out.split('\n')[0];
      if (out.includes('\n') && line) resolve(Number(line));
    });
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`the OpenRouter stub exited early with ${code}`)));
  });
  const log = path.join(dir, 'openrouter.json');
  return {
    url: `http://127.0.0.1:${port}/api/v1`,
    requests: () => (existsSync(log) ? (JSON.parse(readFileSync(log, 'utf8')) as RecordedRequest[]) : []),
    behave: (behavior) => writeFileSync(path.join(dir, 'openrouter-behavior.json'), JSON.stringify(behavior)),
    stop: () => {
      child.removeAllListeners('exit');
      child.kill('SIGKILL');
    },
  };
}

import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import path from 'node:path';

export interface GitHttpOrigin {
  /** The clone URL of `repoName` under this server. */
  url: string;
  /** Each request's method, path and whether it carried an accepted credential. */
  requests: { method: string; path: string; authorized: boolean }[];
  close(): Promise<void>;
}

/**
 * Serves the bare repositories under `projectRoot` over smart HTTP through
 * `git http-backend`, answering 401 to any request whose basic credential is
 * not `x-access-token` with a password `accept` approves — the way GitHub treats
 * an installation token.
 */
export async function startGitHttpOrigin(projectRoot: string, repoName: string, accept: (password: string) => boolean): Promise<GitHttpOrigin> {
  const requests: GitHttpOrigin['requests'] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const basic = /^Basic (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const [user, password] = basic === undefined ? [] : Buffer.from(basic, 'base64').toString().split(':');
    const authorized = user === 'x-access-token' && password !== undefined && accept(password);
    requests.push({ method: req.method ?? 'GET', path: url.pathname, authorized });
    if (!authorized) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="git"' });
      res.end();
      return;
    }
    const backend = spawn('git', ['http-backend'], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: projectRoot,
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.replace(/^\?/, ''),
        REQUEST_METHOD: req.method ?? 'GET',
        CONTENT_TYPE: req.headers['content-type'] ?? '',
        HTTP_CONTENT_ENCODING: (req.headers['content-encoding'] as string | undefined) ?? '',
        REMOTE_USER: 'x-access-token',
        REMOTE_ADDR: '127.0.0.1',
      },
    });
    req.pipe(backend.stdin);
    const chunks: Buffer[] = [];
    backend.stdout.on('data', (c: Buffer) => chunks.push(c));
    backend.on('close', () => {
      const out = Buffer.concat(chunks);
      const split = out.indexOf('\r\n\r\n');
      const head = out.subarray(0, split).toString();
      const headers: Record<string, string> = {};
      let status = 200;
      for (const line of head.split('\r\n')) {
        const [name, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        if (name!.toLowerCase() === 'status') status = Number.parseInt(value, 10);
        else headers[name!] = value;
      }
      res.writeHead(status, headers);
      res.end(out.subarray(split + 4));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/${path.basename(repoName)}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

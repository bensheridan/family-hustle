/** The sync service: one family's backup document, kept in a file.
 *
 * This is the Pi's server, and the reference the ESP32 firmware is checked
 * against — the contract test (scripts/sync-contract.test.ts) runs the same
 * requests at both. The design and its reasons are in docs/pi-sync.md; the
 * short version is that this is a filing cabinet, not a database. It checks
 * that a document is ours (`app` and `format`) and never looks further in.
 *
 * Node, no dependencies, so the Pi needs nothing but this one file once it is
 * bundled (npm run build:server).
 *
 *   node sync-server.mjs /etc/family-hustle/config.json
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { promises as fs, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { documentText, envelope, type Meta } from './envelope';

export interface Config {
  port: number;
  /** 127.0.0.1 behind a tunnel. Never 0.0.0.0 on the Pi. */
  host: string;
  dataDir: string;
  /** exact origins allowed to call from a browser — never '*' */
  origins: string[];
  tokens: { write: string; read: string };
  /** how many previous versions to keep; default 50 */
  history?: number;
}

const MAX_BODY = 5 * 1024 * 1024;
const MIN_WRITE_GAP_MS = 2000;

type Role = 'write' | 'read';

export function startServer(config: Config) {
  const stateFile = join(config.dataDir, 'state.json');
  const historyDir = join(config.dataDir, 'history');
  const keep = config.history ?? 50;
  const lastWrite = new Map<Role, number>();

  // the version and who wrote it live in memory, so a 409 or a health check
  // never has to read the file
  let meta: Meta | undefined = existsSync(stateFile)
    ? readMeta(readFileSync(stateFile, 'utf8'))
    : undefined;

  const tokenBuffers: [Role, Buffer][] = [
    ['write', Buffer.from(config.tokens.write)],
    ['read', Buffer.from(config.tokens.read)],
  ];

  function roleOf(req: IncomingMessage): Role | undefined {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return undefined;
    const given = Buffer.from(header.slice(7));
    let found: Role | undefined;
    // compare against both, always, so timing says nothing about which
    for (const [role, expected] of tokenBuffers) {
      if (given.length === expected.length && timingSafeEqual(given, expected)) found = role;
    }
    return found;
  }

  function cors(req: IncomingMessage, res: ServerResponse) {
    const origin = req.headers.origin;
    if (origin && config.origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }

  function send(res: ServerResponse, status: number, body?: unknown) {
    res.setHeader('Cache-Control', 'no-store');
    if (body === undefined) {
      res.writeHead(status).end();
    } else {
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(text);
    }
  }

  async function readBody(req: IncomingMessage): Promise<string | 'too-big'> {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > MAX_BODY) return 'too-big';
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > MAX_BODY) return 'too-big';
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  /** Write a temp file, fsync it, rename it over the target, fsync the
   *  directory. After a power cut the file is the old one or the new one. */
  async function writeAtomic(path: string, text: string) {
    const tmp = `${path}.tmp`;
    const handle = await fs.open(tmp, 'w');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, path);
    const dir = await fs.open(config.dataDir, 'r');
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  }

  async function keepHistory() {
    if (!meta) return;
    await fs.mkdir(historyDir, { recursive: true });
    await fs.copyFile(stateFile, join(historyDir, `${meta.version}.json`));
    const versions = (await fs.readdir(historyDir))
      .map((f) => Number.parseInt(f, 10))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);
    for (const v of versions.slice(0, Math.max(0, versions.length - keep))) {
      await fs.rm(join(historyDir, `${v}.json`), { force: true });
    }
  }

  async function put(req: IncomingMessage, res: ServerResponse): Promise<number> {
    const body = await readBody(req);
    if (body === 'too-big') {
      send(res, 413);
      return 413;
    }

    let parsed: { expectedVersion?: unknown; updatedBy?: unknown; document?: unknown };
    try {
      parsed = JSON.parse(body);
    } catch {
      send(res, 400);
      return 400;
    }
    const doc = parsed.document as { app?: unknown; format?: unknown } | undefined;
    const raw = documentText(body);
    if (
      !doc ||
      doc.app !== 'family-hustle' ||
      typeof doc.format !== 'number' ||
      typeof parsed.expectedVersion !== 'number' ||
      raw === undefined
    ) {
      send(res, 400);
      return 400;
    }

    const current = meta?.version ?? 0;
    if (parsed.expectedVersion !== current) {
      send(res, 409, meta ?? { version: 0 });
      return 409;
    }

    const next: Meta = {
      version: current + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy.slice(0, 64) : 'unknown',
    };
    await fs.mkdir(config.dataDir, { recursive: true });
    await keepHistory();
    await writeAtomic(stateFile, envelope(next, raw));
    meta = next;
    send(res, 200, { version: next.version, updatedAt: next.updatedAt });
    return 200;
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<number> {
    cors(req, res);
    const path = (req.url ?? '/').split('?')[0];

    if (req.method === 'OPTIONS') {
      send(res, 204);
      return 204;
    }

    if (path === '/api/health' && req.method === 'GET') {
      send(res, 200, { ok: true, version: meta?.version ?? 0 });
      return 200;
    }

    if (path !== '/api/state') {
      send(res, 404);
      return 404;
    }

    const role = roleOf(req);
    if (!role) {
      send(res, 401);
      return 401;
    }

    if (req.method === 'GET') {
      if (!meta) {
        send(res, 204);
        return 204;
      }
      send(res, 200, await fs.readFile(stateFile, 'utf8'));
      return 200;
    }

    if (req.method === 'PUT') {
      if (role !== 'write') {
        send(res, 403);
        return 403;
      }
      const now = Date.now();
      if (now - (lastWrite.get(role) ?? 0) < MIN_WRITE_GAP_MS) {
        send(res, 429);
        return 429;
      }
      lastWrite.set(role, now);
      return put(req, res);
    }

    send(res, 405);
    return 405;
  }

  // one write at a time: two PUTs racing could both pass the version check
  let queue: Promise<unknown> = Promise.resolve();

  const server = createServer((req, res) => {
    const run = async () => {
      let status = 500;
      let role: Role | undefined;
      try {
        role = roleOf(req);
        status = await handle(req, res);
      } catch (err) {
        console.error(err);
        if (!res.headersSent) send(res, 500);
      }
      // one line per request; the token's name, never the token or the family
      console.log(
        `${new Date().toISOString()} ${req.method} ${req.url?.split('?')[0]} ${status} ${role ?? '-'}`,
      );
    };
    if (req.method === 'PUT') queue = queue.then(run, run);
    else void run();
  });

  server.listen(config.port, config.host);
  return server;
}

function readMeta(text: string): Meta {
  const { version, updatedAt, updatedBy } = JSON.parse(text) as Meta;
  return { version, updatedAt, updatedBy };
}

export function loadConfig(path: string): Config {
  const config = JSON.parse(readFileSync(path, 'utf8')) as Partial<Config>;
  const tokens = config.tokens;
  if (!tokens || tokens.write.length < 32 || tokens.read.length < 32 || tokens.write === tokens.read) {
    throw new Error('config needs two different tokens of at least 32 characters');
  }
  return {
    port: config.port ?? 8787,
    host: config.host ?? '127.0.0.1',
    dataDir: config.dataDir ?? '/var/lib/family-hustle',
    origins: config.origins ?? ['https://bensheridan.github.io', 'http://localhost:5173'],
    tokens,
    history: config.history,
  };
}

// run directly, rather than imported by the contract test
const entry = process.argv[1] ?? '';
if (/sync-server\.(m?js|ts)$/.test(entry)) {
  const path = process.argv[2] ?? process.env.FH_CONFIG ?? '/etc/family-hustle/config.json';
  const config = loadConfig(path);
  startServer(config);
  console.log(`family hustle sync on http://${config.host}:${config.port}`);
}

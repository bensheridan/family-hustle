/* The sync contract, checked against a running server.
 *
 * With nothing set, starts the Node server (the Pi's) in a temp directory and
 * checks it. Pointed at a real box, checks that instead — which is how the
 * ESP32 firmware is held to the same contract as the Pi:
 *
 *   FH_SYNC_URL=http://family-hustle.local FH_WRITE_TOKEN=… FH_READ_TOKEN=… \
 *     npm run test:sync
 *
 * Against a real box this writes one test version on top of whatever is
 * there; the family's document is restored at the end, as a new version.
 *
 * Run with: npm run test:sync */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { startServer } from '../server/sync-server';

const local = !process.env.FH_SYNC_URL;
const writeToken = process.env.FH_WRITE_TOKEN ?? randomBytes(32).toString('hex');
const readToken = process.env.FH_READ_TOKEN ?? randomBytes(32).toString('hex');

let base = process.env.FH_SYNC_URL?.replace(/\/$/, '') ?? '';
let dataDir = '';
let server: ReturnType<typeof startServer> | undefined;

if (local) {
  dataDir = mkdtempSync(join(tmpdir(), 'fh-sync-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  server = startServer({
    port,
    host: '127.0.0.1',
    dataDir,
    origins: ['http://localhost:5173'],
    tokens: { write: writeToken, read: readToken },
  });
  base = `http://127.0.0.1:${port}`;
  // the server logs every request; the test output is the interesting part
  console.log = () => {};
}

const log = (s: string) => process.stdout.write(`${s}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// writes are rate limited to one per two seconds per token
const nextWrite = () => sleep(2100);

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function get(token?: string) {
  return fetch(`${base}/api/state`, { headers: token ? auth(token) : {} });
}

async function put(token: string, body: string) {
  return fetch(`${base}/api/state`, {
    method: 'PUT',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body,
  });
}

async function currentVersion(): Promise<{ version: number; text?: string }> {
  const res = await get(readToken);
  if (res.status === 204) return { version: 0 };
  const text = await res.text();
  return { version: (JSON.parse(text) as { version: number }).version, text };
}

/* Formatted on purpose — indentation, an escaped character, a 1.50 — so a
 * server that re-serialises instead of storing the bytes is caught. */
const document = `{
  "app": "family-hustle",
  "format": 1,
  "savedAt": "2026-10-03T08:00:00.000Z",
  "state": { "people": [ { "name": "Ren\\u00e9e", "ratio": 1.50 } ], "entries": [] }
}`;

const putBody = (expectedVersion: number, doc = document) =>
  `{"expectedVersion":${expectedVersion},"updatedBy":"contract-test","document":${doc}}`;

async function run() {
  const health = await fetch(`${base}/api/health`);
  const healthBody = (await health.json()) as { ok?: boolean; version?: number };
  check('health is ok without a token', health.status === 200 && healthBody.ok === true);
  check(
    'health says nothing about the family',
    Object.keys(healthBody).sort().join() === 'ok,version',
    JSON.stringify(healthBody),
  );

  check('GET with no token → 401', (await get()).status === 401);
  check('GET with a made-up token → 401', (await get('nope'.repeat(16))).status === 401);

  const before = await currentVersion();
  if (local) check('nothing stored yet → 204', before.version === 0);

  check('PUT with the read token → 403', (await put(readToken, putBody(before.version))).status === 403);

  const first = await put(writeToken, putBody(before.version));
  const firstBody = (await first.json()) as { version: number; updatedAt: string };
  check(
    'PUT with the write token → 200, next version',
    first.status === 200 && firstBody.version === before.version + 1,
    `${first.status} ${JSON.stringify(firstBody)}`,
  );
  const v = firstBody.version;

  const tooSoon = await put(writeToken, putBody(v));
  check('a second PUT straight away → 429', tooSoon.status === 429, `${tooSoon.status}`);

  const read = await get(readToken);
  const readText = await read.text();
  check('GET with the read token → 200', read.status === 200);
  check(
    'GET returns the document byte for byte',
    readText.endsWith(`"document":${document}}`),
    readText.slice(0, 200),
  );
  const readMeta = JSON.parse(readText) as { version: number; updatedBy: string; updatedAt: string };
  check(
    'GET carries version, updatedAt and updatedBy',
    readMeta.version === v && readMeta.updatedBy === 'contract-test' && !!Date.parse(readMeta.updatedAt),
  );

  await nextWrite();
  const stale = await put(writeToken, putBody(v - 1, document.replace('1.50', '2')));
  const staleBody = (await stale.json()) as { version?: number; updatedBy?: string };
  check(
    'PUT with a stale version → 409 with who wrote last',
    stale.status === 409 && staleBody.version === v && staleBody.updatedBy === 'contract-test',
    `${stale.status} ${JSON.stringify(staleBody)}`,
  );
  check('…and the stored document is unchanged', (await (await get(readToken)).text()) === readText);

  await nextWrite();
  const notOurs = await put(writeToken, putBody(v, '{"app":"something-else","format":1}'));
  check('PUT a document that is not ours → 400', notOurs.status === 400, `${notOurs.status}`);
  await nextWrite();
  const garbage = await put(writeToken, 'not json at all');
  check('PUT a body that is not JSON → 400', garbage.status === 400, `${garbage.status}`);
  check('…and the stored document is unchanged', (await (await get(readToken)).text()) === readText);

  await nextWrite();
  const huge = putBody(v, `{"app":"family-hustle","format":1,"pad":"${'x'.repeat(6 * 1024 * 1024)}"}`);
  const tooBig = await put(writeToken, huge).catch(() => undefined);
  // a server may answer 413 and close the connection before reading it all,
  // which some clients report as a network error; either way, not stored
  check('PUT larger than the limit → 413', !tooBig || tooBig.status === 413, `${tooBig?.status}`);
  check('…and the stored document is unchanged', (await (await get(readToken)).text()) === readText);

  if (local) {
    const pre = await fetch(`${base}/api/state`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT' },
    });
    check(
      'preflight from an allowed origin is allowed',
      pre.headers.get('access-control-allow-origin') === 'http://localhost:5173',
    );
    const evil = await fetch(`${base}/api/state`, { headers: { Origin: 'https://evil.example' } });
    check('any other origin is not', evil.headers.get('access-control-allow-origin') === null);
  }

  // leave a real box holding the family's document again, not the test's
  if (!local && before.text) {
    await nextWrite();
    const original = JSON.parse(before.text) as { document: unknown };
    const restore = await put(
      writeToken,
      `{"expectedVersion":${v},"updatedBy":"contract-test","document":${JSON.stringify(original.document)}}`,
    );
    check('restored the family’s document', restore.status === 200, `${restore.status}`);
  }
}

run()
  .catch((err) => {
    failures++;
    log(`FAIL ${String(err)}`);
  })
  .finally(() => {
    server?.close();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    log(failures ? `\n${failures} failed` : '\nall passed');
    process.exit(failures ? 1 : 0);
  });

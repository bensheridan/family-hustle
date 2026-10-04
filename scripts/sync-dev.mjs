/* A sync box for development: the Node server, data in .sync-dev/, with
 * tokens generated on first run and kept in .sync-dev/config.json (never
 * committed). Pair it with the hub build of the dev server:
 *
 *   npm run sync:dev
 *   FH_TARGET=hub FH_SYNC_PROXY=http://127.0.0.1:8787 npm run dev */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const dir = resolve('.sync-dev');
const path = `${dir}/config.json`;
if (!existsSync(path)) {
  mkdirSync(dir, { recursive: true });
  const token = () => randomBytes(32).toString('hex');
  writeFileSync(
    path,
    JSON.stringify(
      {
        port: 8787,
        host: '127.0.0.1',
        dataDir: `${dir}/data`,
        origins: ['http://localhost:5173'],
        tokens: { write: token(), read: token() },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`made dev tokens in ${path}`);
}

const { startServer, loadConfig } = await import('../dist-server/sync-server.mjs');
startServer(loadConfig(path));
console.log('dev sync box on http://127.0.0.1:8787');

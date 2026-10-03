/* Gzip the hub build and copy it into the ESP32's filesystem image.
 *
 * The ESP32 serves foo.js.gz in place of foo.js when it is there, which cuts
 * what crosses its Wi-Fi to under a third. The originals are kept too, so
 * the same folder can be served by anything else.
 *
 * Run with: npm run build:hub */
import { readdirSync, statSync, readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const from = 'dist-hub';
const to = 'firmware/esp32/data/www';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

let raw = 0;
let packed = 0;
for (const file of walk(from)) {
  if (!/\.(js|css|html|svg|json)$/.test(file)) continue;
  const body = readFileSync(file);
  const gz = gzipSync(body, { level: 9 });
  writeFileSync(`${file}.gz`, gz);
  raw += body.length;
  packed += gz.length;
}

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`hub build: ${kb(raw)} → ${kb(packed)} gzipped, copied to ${to}`);

/** Finding the document inside a PUT body without re-serialising it.
 *
 * The contract promises that GET returns the document byte for byte as it
 * was sent. JSON.parse then JSON.stringify does not keep that promise —
 * whitespace, escapes and number formats all drift — so the server keeps the
 * sent bytes and only parses to check them. The ESP32 firmware does the same
 * walk in C++ (firmware/esp32/src/envelope.h); keep the two in step.
 */

/** Skip one JSON value starting at i, returning the index just past it.
 *  Assumes the text has already parsed, so it only tracks strings and depth. */
function skipValue(s: string, i: number): number {
  const n = s.length;
  if (s[i] === '"') {
    for (i++; i < n; i++) {
      if (s[i] === '\\') i++;
      else if (s[i] === '"') return i + 1;
    }
    return n;
  }
  if (s[i] === '{' || s[i] === '[') {
    let depth = 0;
    let inString = false;
    for (; i < n; i++) {
      const c = s[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        if (--depth === 0) return i + 1;
      }
    }
    return n;
  }
  // a number, true, false or null
  while (i < n && s[i] !== ',' && s[i] !== '}' && s[i] !== ']' && !/\s/.test(s[i])) i++;
  return i;
}

/** The exact text of the top-level "document" value, or undefined if there
 *  is none. Key order does not matter. */
export function documentText(body: string): string | undefined {
  let i = 0;
  const ws = () => {
    while (i < body.length && /\s/.test(body[i])) i++;
  };
  ws();
  if (body[i] !== '{') return undefined;
  i++;
  ws();
  if (body[i] === '}') return undefined;
  for (;;) {
    ws();
    if (body[i] !== '"') return undefined;
    const keyEnd = skipValue(body, i);
    const key = JSON.parse(body.slice(i, keyEnd)) as string;
    i = keyEnd;
    ws();
    if (body[i] !== ':') return undefined;
    i++;
    ws();
    const start = i;
    i = skipValue(body, i);
    if (key === 'document') return body.slice(start, i);
    ws();
    if (body[i] !== ',') return undefined;
    i++;
  }
}

export interface Meta {
  version: number;
  updatedAt: string;
  updatedBy: string;
}

/** The stored file is exactly the GET response, so reading it is a send. */
export function envelope(meta: Meta, document: string): string {
  const head = JSON.stringify(meta);
  return `${head.slice(0, -1)},"document":${document}}`;
}

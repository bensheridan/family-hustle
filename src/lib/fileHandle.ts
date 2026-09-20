/** Remembering which file the family chose.
 *
 * A file handle survives a reload, but only if it is kept somewhere
 * structured-cloneable — so IndexedDB, not localStorage. The browser still
 * asks permission again after a restart, which is the point: a page cannot
 * quietly hold write access to someone's drive.
 */

const DB = 'family-hustle-files';
const STORE = 'handles';
const KEY = 'backup';

export interface WritableHandle {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  name: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberHandle(handle: WritableHandle): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function recallHandle(): Promise<WritableHandle | undefined> {
  try {
    const db = await open();
    const handle = await new Promise<WritableHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result as WritableHandle | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return undefined;
  }
}

export async function forgetHandle(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // nothing to forget
  }
}

/** Does the page still have permission, without prompting? */
export async function hasPermission(handle: WritableHandle): Promise<boolean> {
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

export async function askPermission(handle: WritableHandle): Promise<boolean> {
  try {
    if (await hasPermission(handle)) return true;
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

export async function writeFile(handle: WritableHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

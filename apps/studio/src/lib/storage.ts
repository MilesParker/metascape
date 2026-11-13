// SPDX-License-Identifier: EPL-2.0

/** Reads a JSON value kept for this browser, or the fallback. Never throws. */
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const text = localStorage.getItem(`metascape:${key}`);
    return text === null ? fallback : (JSON.parse(text) as T);
  } catch {
    return fallback;
  }
}

/** Keeps a JSON value for this browser; `undefined` forgets it. Never throws. */
export function writeLocal(key: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(`metascape:${key}`);
    else localStorage.setItem(`metascape:${key}`, JSON.stringify(value));
  } catch {
    // Private windows and full storage: the value just is not kept.
  }
}

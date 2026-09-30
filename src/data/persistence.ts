import type { AppData } from '../domain/types';
import { parseAppData } from './schema';

/**
 * Local persistence. Everything lives in ONE storage key as a single JSON
 * document, so each save is atomic: an interrupted write leaves either the old
 * document or the new one, never a half-updated mix.
 *
 * `Persistence` is the seam for the future: a sync layer can wrap or replace
 * it without the rest of the app noticing.
 */

export const STORAGE_KEY = 'freelanche:data';
export const BACKUP_KEY = 'freelanche:data:unreadable-backup';
/** Tiny mirror of the theme so it can be applied before the app loads (no flash). */
export const THEME_KEY = 'freelanche:theme';
const KEY_PREFIX = 'freelanche:';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export type LoadResult =
  | { status: 'fresh' }
  | { status: 'ok'; data: AppData; dropped: number }
  /** Stored text could not be understood; a copy was kept under `BACKUP_KEY`. */
  | { status: 'corrupt' };

export interface Persistence {
  /** False when the browser refuses storage and data lives only in memory. */
  readonly durable: boolean;
  load(): LoadResult;
  /** Throws if the write fails. */
  save(data: AppData): void;
  /** Removes everything this app stored (including backups and the theme mirror). */
  clear(): void;
  /** Removes only the main document, keeping the unreadable-data backup. */
  discard(): void;
  /** Calls back when another tab changes the data. Returns an unsubscribe function. */
  watch(onChange: () => void): () => void;
}

export function createMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** The browser's localStorage if it really works (Safari private modes and some webviews throw). */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    const storage = window.localStorage;
    const probe = `${KEY_PREFIX}probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function readDocument(text: string): ReturnType<typeof parseAppData> {
  try {
    return parseAppData(JSON.parse(text));
  } catch {
    return null;
  }
}

export function createLocalPersistence(storage: KeyValueStorage | null): Persistence {
  const durable = storage !== null;
  const store = storage ?? createMemoryStorage();

  return {
    durable,

    load() {
      let text: string | null;
      try {
        text = store.getItem(STORAGE_KEY);
      } catch {
        return { status: 'corrupt' };
      }
      if (text === null) return { status: 'fresh' };

      const parsed = readDocument(text);
      if (!parsed) {
        try {
          store.setItem(BACKUP_KEY, text);
        } catch {
          /* nothing more we can do; the main document is left untouched */
        }
        return { status: 'corrupt' };
      }
      return { status: 'ok', data: parsed.data, dropped: parsed.dropped };
    },

    save(data) {
      store.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    discard() {
      store.removeItem(STORAGE_KEY);
    },

    clear() {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key?.startsWith(KEY_PREFIX)) keys.push(key);
      }
      for (const key of keys) store.removeItem(key);
    },

    watch(onChange) {
      if (!durable || typeof window === 'undefined') return () => undefined;
      const listener = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === null) onChange();
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
  };
}

import type { MemoryStorage } from './store';

/**
 * Makes the remembered subscription check tamper-evident.
 *
 * On the Android app the memory is stamped with a keyed signature (HMAC-SHA256) whose key lives in the
 * Android Keystore: it can be used by this app but never read out, and it is not included in backups. So:
 *  - editing the stored text (even with `adb backup`/`adb restore` on an older phone) invalidates the stamp;
 *  - copying the storage to another phone, or restoring a backup, produces a memory that does not verify;
 *  - a memory that does not verify is simply ignored — the app then asks Google Play, as on a first launch.
 *
 * Nothing secret is in the stored text (no purchase token); the stamp is what makes it trustworthy.
 */

export interface Sealer {
  sign(text: string): Promise<string>;
  verify(text: string, mac: string): Promise<boolean>;
}

interface SealedWrapper {
  v: 2;
  text: string;
  mac: string;
}

export async function seal(text: string, sealer: Sealer): Promise<string> {
  const wrapper: SealedWrapper = { v: 2, text, mac: await sealer.sign(text) };
  return JSON.stringify(wrapper);
}

/** The original text if — and only if — it carries a valid stamp from this device's key. */
export async function unseal(raw: string | null, sealer: Sealer): Promise<string | null> {
  if (!raw) return null;
  try {
    const wrapper: unknown = JSON.parse(raw);
    if (typeof wrapper !== 'object' || wrapper === null) return null;
    const { v, text, mac } = wrapper as Record<string, unknown>;
    if (v !== 2 || typeof text !== 'string' || typeof mac !== 'string') return null;
    return (await sealer.verify(text, mac)) ? text : null;
  } catch {
    return null;
  }
}

/** Where the stamped memory is kept (the browser's storage in the app, a variable in tests). */
export interface RawStore {
  get(): string | null;
  set(text: string): void;
}

/**
 * Reads and checks the memory once, up front, then hands the store a synchronous view of it. Later writes are stamped
 * and saved one after another, in order, in the background.
 */
export async function createSealedMemory(raw: RawStore, sealer: Sealer): Promise<MemoryStorage> {
  let current: string | null;
  try {
    current = await unseal(raw.get(), sealer);
  } catch {
    current = null;
  }
  let queue: Promise<void> = Promise.resolve();
  return {
    read: () => current,
    write: (text) => {
      current = text;
      queue = queue
        .then(async () => raw.set(await seal(text, sealer)))
        .catch(() => {
          /* if the key is unavailable the memory simply isn't kept; the app asks Google Play instead */
        });
    },
  };
}

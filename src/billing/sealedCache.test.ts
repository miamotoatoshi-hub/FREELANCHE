import { describe, expect, it } from 'vitest';
import { serializeCache } from './entitlement';
import { createSealedMemory, seal, unseal, type RawStore, type Sealer } from './sealedCache';

/** A stand-in for the Android Keystore: a "key" only this device knows, used to stamp text. */
function fakeSealer(key = 'device-key'): Sealer {
  const stamp = (text: string) => `${key}:${text.length}:${[...text].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) % 1_000_003, 7)}`;
  return { sign: async (text) => stamp(text), verify: async (text, mac) => mac === stamp(text) };
}

const memory = serializeCache({ lastVerifiedAt: 1_000, lastStatus: 'active', everEntitled: true, seenAt: 1_000 });

function rawStore(initial: string | null = null): RawStore & { value: () => string | null } {
  let value = initial;
  return { get: () => value, set: (text) => void (value = text), value: () => value };
}

describe('sealing', () => {
  it('round-trips on the same device', async () => {
    const sealer = fakeSealer();
    expect(await unseal(await seal(memory, sealer), sealer)).toBe(memory);
  });

  it('refuses text that was edited after it was stamped', async () => {
    const sealer = fakeSealer();
    const edited = (await seal(memory, sealer)).replace('"lastStatus\\":\\"active', '"lastStatus\\":\\"inactive').replace('active','inactive');
    expect(await unseal(edited, sealer)).toBeNull();
    const wrapper = JSON.parse(await seal(memory, sealer)) as { text: string; mac: string; v: number };
    expect(await unseal(JSON.stringify({ ...wrapper, text: wrapper.text.replace('1000', '9999999999') }), sealer)).toBeNull();
    expect(await unseal(JSON.stringify({ ...wrapper, mac: 'forged' }), sealer)).toBeNull();
  });

  it('refuses a memory stamped on another phone or restored from a backup (different key)', async () => {
    const sealed = await seal(memory, fakeSealer('phone-A'));
    expect(await unseal(sealed, fakeSealer('phone-B'))).toBeNull();
  });

  it('refuses an unstamped memory — the plain format is only for development', async () => {
    expect(await unseal(memory, fakeSealer())).toBeNull();
  });

  it.each([null, '', 'garbage', '[]', '{"v":2}', '{"v":1,"text":"x","mac":"y"}', '{"v":2,"text":5,"mac":"y"}'])('treats %j as no memory', async (raw) => {
    expect(await unseal(raw, fakeSealer())).toBeNull();
  });

  it('treats a broken Keystore as no memory rather than failing', async () => {
    const broken: Sealer = { sign: async () => { throw new Error('keystore unavailable'); }, verify: async () => { throw new Error('keystore unavailable'); } };
    expect(await unseal(await seal(memory, fakeSealer()), broken)).toBeNull();
  });
});

describe('the sealed memory the store uses', () => {
  it('starts from a valid stamped memory, and ignores a tampered one', async () => {
    const sealer = fakeSealer();
    const good = rawStore(await seal(memory, sealer));
    expect((await createSealedMemory(good, sealer)).read()).toBe(memory);

    const tampered = rawStore(JSON.stringify({ ...(JSON.parse(await seal(memory, sealer)) as object), mac: 'x' }));
    expect((await createSealedMemory(tampered, sealer)).read()).toBeNull();
  });

  it('stamps every write, in order, so the stored text always verifies', async () => {
    const sealer = fakeSealer();
    const raw = rawStore();
    const sealed = await createSealedMemory(raw, sealer);
    const first = serializeCache({ lastVerifiedAt: 1, lastStatus: 'active', everEntitled: true, seenAt: 1 });
    const second = serializeCache({ lastVerifiedAt: 2, lastStatus: 'inactive', everEntitled: true, seenAt: 2 });
    sealed.write(first);
    sealed.write(second);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sealed.read()).toBe(second);
    expect(await unseal(raw.value(), sealer)).toBe(second); // the last write wins
  });

  it('survives storage that refuses to write', async () => {
    const sealed = await createSealedMemory({ get: () => null, set: () => { throw new Error('quota'); } }, fakeSealer());
    expect(() => sealed.write(memory)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sealed.read()).toBe(memory);
  });
});

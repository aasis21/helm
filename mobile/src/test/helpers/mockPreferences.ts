// In-memory stand-in for @capacitor/preferences.
//
// The point of mocking at THIS boundary (rather than mocking sessions/transcripts/storage) is that
// those modules keep running for real against this Map — so dedupe, migration, restore and the
// localStorage mirror all get genuine coverage. `resetPreferences()` is called from the global
// beforeEach so every test starts from a clean device.
const store = new Map<string, string>();

export const memoryPreferences = {
  async get({ key }: { key: string }): Promise<{ value: string | null }> {
    return { value: store.has(key) ? (store.get(key) as string) : null };
  },
  async set({ key, value }: { key: string; value: string }): Promise<void> {
    store.set(key, value);
  },
  async remove({ key }: { key: string }): Promise<void> {
    store.delete(key);
  },
  async keys(): Promise<{ keys: string[] }> {
    return { keys: [...store.keys()] };
  },
  async clear(): Promise<void> {
    store.clear();
  },
  async configure(): Promise<void> {},
  async migrate(): Promise<{ migrated: string[]; existing: string[] }> {
    return { migrated: [], existing: [] };
  },
  async removeOld(): Promise<void> {},
};

/** Wipe the in-memory device store. Call between tests (done globally in setup.ts). */
export function resetPreferences(): void {
  store.clear();
}

/** Peek at a raw persisted value — handy for asserting what was written. */
export function peekPreference(key: string): string | null {
  return store.has(key) ? (store.get(key) as string) : null;
}

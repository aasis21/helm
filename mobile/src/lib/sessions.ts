import { Preferences } from '@capacitor/preferences';
import type { StoredPairing } from './storage';
import { loadStoredPairing } from './storage';

const SESSIONS_KEY = 'helm.sessions.v1';

/** A joined session: the ECDH pairing material plus light display metadata. */
export interface StoredSession {
  pairing: StoredPairing;
  title: string | null;
  cwd: string | null;
  addedAt: number;
  lastSeenAt: number;
}

async function read(): Promise<StoredSession[]> {
  try {
    const { value } = await Preferences.get({ key: SESSIONS_KEY });
    const raw = value ?? globalThis.localStorage?.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSession[];
    return Array.isArray(parsed) ? parsed.filter((s) => s?.pairing?.channelId) : [];
  } catch {
    return [];
  }
}

async function write(list: StoredSession[]): Promise<void> {
  const value = JSON.stringify(list);
  await Preferences.set({ key: SESSIONS_KEY, value });
  globalThis.localStorage?.setItem(SESSIONS_KEY, value);
}

/**
 * Load every joined session. Transparently migrates a single legacy
 * `helm.pairing.v1` entry into the multi-session list on first run.
 */
export async function loadSessions(): Promise<StoredSession[]> {
  const list = await read();
  if (list.length > 0) return list;
  const legacy = await loadStoredPairing();
  if (legacy?.channelId && legacy.publicKeyB64) {
    const migrated: StoredSession = {
      pairing: legacy,
      title: null,
      cwd: null,
      addedAt: legacy.savedAt ?? Date.now(),
      lastSeenAt: legacy.savedAt ?? Date.now(),
    };
    await write([migrated]);
    return [migrated];
  }
  return [];
}

export async function upsertSession(session: StoredSession): Promise<void> {
  const list = await read();
  const next = [
    ...list.filter((s) => s.pairing.channelId !== session.pairing.channelId),
    session,
  ];
  await write(next);
}

export async function patchSession(
  channelId: string,
  patch: Partial<Pick<StoredSession, 'title' | 'cwd' | 'lastSeenAt'>>,
): Promise<void> {
  const list = await read();
  let changed = false;
  const next = list.map((s) => {
    if (s.pairing.channelId !== channelId) return s;
    changed = true;
    return { ...s, ...patch };
  });
  if (changed) await write(next);
}

export async function removeSession(channelId: string): Promise<void> {
  const list = await read();
  await write(list.filter((s) => s.pairing.channelId !== channelId));
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSessions } from '@/lib/sessions';
import { loadTranscript } from '@/lib/transcripts';
import { makeManager } from '@/test/helpers/makeManager';
import * as B from '@/test/helpers/builders';

describe('scenario: resume dedupe', () => {
  let h: ReturnType<typeof makeManager> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    h = makeManager();
  });

  afterEach(() => {
    h?.dispose();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('merges a resumed channel with the same sessionId and removes stale storage', async () => {
    const c1 = await h!.pair('c1');
    c1.client.emit(B.channelUp('c1', 'sess-shared'));
    await h!.flush();
    c1.client.emit(B.assistantDelta('old answer', 'm1'));
    await h!.flush();
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(1500);
    await h!.flush();

    const c2 = await h!.pair('c2');
    c2.client.emit(B.channelUp('c2', 'sess-shared'));
    await h!.flush();

    expect(h!.sessions()).toHaveLength(1);
    expect(h!.snapshot().activeId).toBe('c2');
    expect(h!.active()?.meta.channelId).toBe('c2');
    expect(h!.active()?.meta.sessionId).toBe('sess-shared');
    expect(h!.active()?.timeline.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'assistant', text: 'old answer' })]),
    );

    let stored = await loadSessions();
    for (let i = 0; i < 5 && stored.length !== 1; i += 1) {
      await h!.flush();
      stored = await loadSessions();
    }
    expect(stored).toHaveLength(1);
    expect(stored[0].pairing.channelId).toBe('c2');
    expect(await loadTranscript('c1')).toBeNull();
  });

  it('ORs unread when the stale card was unread', async () => {
    const c1 = await h!.pair('c1');
    c1.client.emit(B.channelUp('c1', 'sess-shared', '/repo', 'Refactor auth'));
    await h!.flush();

    const c2 = await h!.pair('c2');
    c2.client.emit(B.channelUp('c2', 'other-session', '/repo', 'Other'));
    await h!.flush();

    c1.client.emit(B.assistantDelta('inactive', 'm1'));
    await h!.flush();
    expect(h!.byChannel('c1')?.unread).toBe(true);

    c2.client.emit(B.channelUp('c2', 'sess-shared', '/repo', 'Refactor auth'));
    await h!.flush();

    expect(h!.sessions()).toHaveLength(1);
    expect(h!.active()?.meta.channelId).toBe('c2');
    expect(h!.active()?.unread).toBe(true);
  });

  it('does not dedupe unknown-session channel announcements', async () => {
    const c1 = await h!.pair('c1');
    c1.client.emit(B.channelUp('c1', 'unknown-session', '/repo/one', 'One'));
    await h!.flush();

    const c2 = await h!.pair('c2');
    c2.client.emit(B.channelUp('c2', 'unknown-session', '/repo/two', 'Two'));
    await h!.flush();

    expect(h!.sessions()).toHaveLength(2);
    expect(h!.byChannel('c1')).toBeDefined();
    expect(h!.byChannel('c2')).toBeDefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }) },
}));
import { loadSessions, upsertSession } from '@/lib/sessions';
import { fakePairing } from '@/test/helpers/fakeHelmClient';
import { App } from '@capacitor/app';
import { makeManager } from '@/test/helpers/makeManager';
import * as B from '@/test/helpers/builders';

describe('scenario: restart', () => {
  let h: ReturnType<typeof makeManager> | undefined;
  let h2: ReturnType<typeof makeManager> | undefined;

  beforeEach(() => {
    vi.mocked(App.addListener).mockResolvedValue({ remove: vi.fn() });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    h = makeManager();
  });

  afterEach(() => {
    h2?.dispose();
    h?.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('restores saved cards, active default, and transcript after an app restart', async () => {
    await h!.init();
    const { client } = await h!.pair('c1');
    client.emit(B.channelUp('c1', 'sess-1', '/repo', 'Refactor auth'));
    await h!.flush();
    client.emit(B.channelUp('c1', 'sess-temp', '/repo', 'Refactor auth'));
    await h!.flush();
    client.emit(B.channelUp('c1', 'sess-1', '/repo', 'Refactor auth'));
    client.emit(B.assistantDelta('Persisted answer', 'm1'));
    await h!.flush();

    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(1500);
    await h!.flush();

    expect(h!.sessions().map((s) => s.meta.channelId)).toEqual(['c1']);
    expect((await loadSessions()).find((s) => s.pairing.channelId === 'c1')).toMatchObject({
      sessionId: 'sess-1',
      title: 'Refactor auth',
    });

    h2 = makeManager();
    await h2.init();
    await h2.flush();

    expect(h2.sessions()).toHaveLength(1);
    expect(h2.snapshot().activeId).toBe('c1');
    expect(h2.byChannel('c1')?.meta).toMatchObject({
      channelId: 'c1',
      sessionId: 'sess-1',
      title: 'Refactor auth',
    });
    expect(h2.byChannel('c1')?.timeline.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'assistant', text: 'Persisted answer' })]),
    );
  });

  it('dedupes stored cards with the same durable session id on init', async () => {
    await upsertSession({
      pairing: fakePairing('old-c'),
      sessionId: 'sess-dupe',
      title: 'Old card',
      cwd: '/old',
      addedAt: 1,
      lastSeenAt: 1,
    });
    await upsertSession({
      pairing: fakePairing('new-c'),
      sessionId: 'sess-dupe',
      title: 'New card',
      cwd: '/new',
      addedAt: 2,
      lastSeenAt: 2,
    });

    h2 = makeManager();
    await h2.init();
    await h2.flush();

    expect(h2.sessions()).toHaveLength(1);
    expect(h2.sessions()[0].meta).toMatchObject({
      channelId: 'new-c',
      sessionId: 'sess-dupe',
      title: 'New card',
      cwd: '/new',
    });
  });
});




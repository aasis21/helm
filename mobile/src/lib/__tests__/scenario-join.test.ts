import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeManager } from '@/test/helpers/makeManager';
import * as B from '@/test/helpers/builders';

describe('scenario: join', () => {
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

  it('creates a live card, probes state, and requests the empty latest page', async () => {
    const { channelId, client } = await h!.pair('c1');

    expect(channelId).toBe('c1');
    expect(h!.active()?.timeline.historyLoading).toBe(true);
    expect(h!.active()?.timeline.items).toEqual([]);

    client.emit(B.channelUp('c1', 'sess-1', '/repo/app', 'Refactor auth'));
    await h!.flush();

    expect(h!.sessions()).toHaveLength(1);
    expect(h!.snapshot().activeId).toBe('c1');
    expect(h!.active()?.meta.title).toBe('Refactor auth');
    expect(h!.active()?.meta.cwd).toBe('/repo/app');
    expect(h!.active()?.meta.sessionId).toBe('sess-1');
    expect(h!.active()?.status).toBe('live');

    expect(client.sentOfKind('control.state_request')).toHaveLength(1);
    const requests = client.sentOfKind('control.history_request');
    expect(requests).toHaveLength(1);
    expect(requests[0].before).toBeNull();
    expect(requests[0].since).toBeNull();
  });
});

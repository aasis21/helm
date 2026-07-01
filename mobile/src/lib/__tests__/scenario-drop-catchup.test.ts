import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeManager } from '@/test/helpers/makeManager';
import * as B from '@/test/helpers/builders';

describe('scenario: drop catchup', () => {
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

  it('goes offline on socket drop and reconnects with a forward catch-up request', async () => {
    const { client } = await h!.pair('c1');
    client.emit(B.channelUp('c1', 'sess-1', '/repo/app', 'Refactor auth'));
    client.emit(B.heartbeat(5, false));
    client.emit(B.assistantDelta('live tail', 'm1'));
    await h!.flush();
    await vi.advanceTimersByTimeAsync(800);
    await h!.flush();

    expect(h!.active()?.timeline.latestTurnIndex).toBe(5);
    client.setStatus('disconnected');
    await h!.flush();
    expect(h!.active()?.status).toBe('error');
    expect(h!.active()?.error).toBe('Connection lost — reconnect to resume.');

    await h!.manager.reconnect('c1');
    await h!.flush();

    const fresh = h!.client('c1');
    expect(fresh).not.toBe(client);
    const requests = fresh.sentOfKind('control.history_request');
    expect(requests).toHaveLength(1);
    expect(requests[0].before).toBeNull();
    expect(requests[0].since).toBe(5);
  });

  it('continues forward catch-up up to the cap, then appends an info notice', async () => {
    const { client } = await h!.pair('c1');
    client.emit(B.channelUp('c1', 'sess-1', '/repo/app', 'Refactor auth'));
    client.emit(B.heartbeat(5, false));
    client.emit(B.assistantDelta('live tail', 'm1'));
    await h!.flush();
    await vi.advanceTimersByTimeAsync(800);
    await h!.flush();

    client.setStatus('disconnected');
    await h!.manager.reconnect('c1');
    await h!.flush();
    const fresh = h!.client('c1');
    fresh.clearSent();

    fresh.emit(B.historyPage([B.historyItem(6, 'user', 'missed 6', 600)], { since: 5, nextCursor: 6, hasMore: true }));
    await h!.flush();
    expect(fresh.sentOfKind('control.history_request').at(-1)?.since).toBe(6);

    fresh.emit(B.historyPage([B.historyItem(7, 'assistant', 'missed 7', 700)], { since: 6, nextCursor: 7, hasMore: true }));
    await h!.flush();
    expect(fresh.sentOfKind('control.history_request').at(-1)?.since).toBe(7);

    fresh.emit(B.historyPage([B.historyItem(8, 'user', 'missed 8', 800)], { since: 7, nextCursor: 8, hasMore: true }));
    await h!.flush();
    expect(fresh.sentOfKind('control.history_request').at(-1)?.since).toBe(8);

    fresh.emit(B.historyPage([B.historyItem(9, 'assistant', 'missed 9', 900)], { since: 8, nextCursor: 9, hasMore: true }));
    await h!.flush();

    const requests = fresh.sentOfKind('control.history_request');
    expect(requests.map((request) => request.since)).toEqual([6, 7, 8]);
    expect(h!.active()?.timeline.items.map((item) => ('text' in item ? item.text : ''))).toEqual(
      expect.arrayContaining(['1 new while you were away', 'missed 6', 'missed 7', 'missed 8', 'missed 9', 'A lot happened while you were away — scroll up to load the rest.']),
    );
    const catchupTexts = h!.active()!.timeline.items
      .filter((item) => item.kind === 'user' || item.kind === 'assistant')
      .map((item) => item.text);
    expect(catchupTexts).toEqual(['live tail', 'missed 6', 'missed 7', 'missed 8', 'missed 9']);
  });
});

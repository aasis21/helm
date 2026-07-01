import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeManager } from '@/test/helpers/makeManager';
import * as B from '@/test/helpers/builders';

describe('scenario: interrupt and mode', () => {
  let h: ReturnType<typeof makeManager> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    h = makeManager();
  });

  afterEach(() => {
    h?.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('sends interrupts, switches mode, and reverts failed mode switches with a warning', async () => {
    const { client } = await h!.pair('c1');
    client.emit(B.channelUp('c1', 'sess-1', '/repo', 'Title'));
    await h!.flush();
    client.clearSent();

    await h!.manager.sendInterrupt('c1');
    expect(client.sentOfKind('control.interrupt')).toHaveLength(1);

    await h!.manager.sendMode('c1', 'plan');
    expect(h!.active()!.timeline.mode).toBe('plan');
    expect(client.sentOfKind('control.mode')).toHaveLength(1);
    expect(client.sentOfKind('control.mode')[0]).toMatchObject({ mode: 'plan' });

    client.send = vi.fn().mockRejectedValue(new Error('offline'));
    await h!.manager.sendMode('c1', 'autopilot');

    const timeline = h!.active()!.timeline;
    expect(timeline.mode).toBe('plan');
    expect(timeline.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'notice', level: 'warning', text: expect.stringContaining('autopilot') }),
      ]),
    );
  });
});

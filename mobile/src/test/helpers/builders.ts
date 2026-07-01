// Message builders for tests.
//
// These are thin re-exports of the REAL @aasis21/helm-shared factories, so every message a test
// pushes tracks the live protocol schema (rename a field in shared and these tests break, exactly as
// intended). On top of the factories we add:
//   - `stamp()` to attach identity fields (sessionId/deviceId/userId/origin) that SecureChannel would
//     normally inject on the wire, and to pin `ts` for deterministic ordering.
//   - `historyItem()` / `historyPage()` conveniences for the backfill/catch-up scenarios.
export {
  KIND,
  EVENTS,
  MODES,
  mergeHistory,
  assistantMessage,
  assistantDelta,
  toolStart,
  toolComplete,
  logLine,
  activity,
  userMessage,
  prompt,
  approvalRequest,
  approvalDecision,
  elicitationRequest,
  elicitationResponse,
  elicitationComplete,
  channelUp,
  sessionMeta,
  channelDown,
  heartbeat,
  modeChange,
  interrupt,
  historyRequest,
  history,
  stateRequest,
  stateSnapshot,
  eventForKind,
  isValidInner,
} from '@aasis21/helm-shared';

import { history } from '@aasis21/helm-shared';
import type { BaseMessage, History, HistoryItem } from '@aasis21/helm-shared';

/** Identity/ordering fields a test may want to pin on an inbound message. */
export interface StampFields {
  sessionId?: string;
  deviceId?: string;
  userId?: string;
  origin?: 'phone' | 'terminal';
  ts?: number;
}

/** Return a copy of `msg` with the given identity/ordering fields set (as the wire would carry). */
export function stamp<T extends BaseMessage>(msg: T, fields: StampFields): T {
  return { ...msg, ...fields };
}

/** Build a single backfill HistoryItem. */
export function historyItem(
  turnIndex: number,
  role: 'user' | 'assistant',
  text: string,
  ts = turnIndex,
): HistoryItem {
  return { turnIndex, role, text, ts };
}

/** Build a page of ascending history items (defaults: no more, latest/backward page). */
export function historyPage(
  items: HistoryItem[],
  opts: { nextCursor?: number | null; hasMore?: boolean; since?: number | null } = {},
): History {
  return history(items, opts.nextCursor ?? null, opts.hasMore ?? false, opts.since ?? null);
}

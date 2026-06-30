import { KIND, MODES } from '@aasis21/helm-shared';
import type {
  ApprovalRequest,
  AssistantDelta,
  AssistantMessage,
  InnerMessage,
  LogLine,
  ModeChange,
  SessionMode,
  ToolComplete,
  ToolStart,
} from '@aasis21/helm-shared';

/**
 * A single rendered row in the chat thread. Tool calls live *inline* in the
 * same ordered stream as assistant/user turns (VS Code / Copilot style) rather
 * than in a separate timeline panel.
 */
export type ToolStatus = 'running' | 'success' | 'error';

export interface UserItem {
  kind: 'user';
  id: string;
  text: string;
  ts: number;
}
export interface AssistantItem {
  kind: 'assistant';
  id: string;
  text: string;
  ts: number;
}
export interface ToolItem {
  kind: 'tool';
  id: string;
  name: string;
  args?: unknown;
  status: ToolStatus;
  resultPreview?: string;
  startedAt: number;
  finishedAt?: number;
  ts: number;
}
export interface NoticeItem {
  kind: 'notice';
  id: string;
  level: LogLine['level'];
  text: string;
  ts: number;
}

export type TimelineItem = UserItem | AssistantItem | ToolItem | NoticeItem;

export interface TimelineState {
  items: TimelineItem[];
  approvals: ApprovalRequest[];
  mode: SessionMode;
  cwd: string | null;
  /** CLI chat summary ("title"); null until the extension reports one. */
  title: string | null;
  lastHeartbeat: number | null;
  sessionEnded: boolean;
  endedReason?: string;
}

const MAX_ITEMS = 240;
const DEFAULT_MODE = MODES[0] as SessionMode;

export function emptyTimeline(): TimelineState {
  return {
    items: [],
    approvals: [],
    mode: DEFAULT_MODE,
    cwd: null,
    title: null,
    lastHeartbeat: null,
    sessionEnded: false,
  };
}

function cap(items: TimelineItem[]): TimelineItem[] {
  return items.length > MAX_ITEMS ? items.slice(items.length - MAX_ITEMS) : items;
}

/** Append a locally-echoed user prompt so it shows instantly as a right bubble. */
export function appendUser(state: TimelineState, text: string, ts: number): TimelineState {
  const item: UserItem = {
    kind: 'user',
    id: `user-${ts}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    ts,
  };
  return { ...state, items: cap([...state.items, item]) };
}

/** Fold one decrypted inner message into the timeline state. Pure. */
export function reduceTimeline(state: TimelineState, message: InnerMessage): TimelineState {
  switch (message.kind) {
    case KIND.ASSISTANT_MESSAGE:
      return upsertAssistant(state, message);
    case KIND.ASSISTANT_DELTA:
      return appendDelta(state, message);
    case KIND.TOOL_START:
      return startTool(state, message);
    case KIND.TOOL_COMPLETE:
      return completeTool(state, message);
    case KIND.LOG:
      return pushNotice(state, message);
    case KIND.APPROVAL_REQUEST:
      return {
        ...state,
        approvals: [
          ...state.approvals.filter((a) => a.requestId !== (message as ApprovalRequest).requestId),
          message as ApprovalRequest,
        ],
      };
    case KIND.SESSION_START:
      return {
        ...state,
        cwd: message.cwd ?? state.cwd,
        title: message.title || state.title,
        lastHeartbeat: Date.now(),
        sessionEnded: false,
        endedReason: undefined,
      };
    case KIND.SESSION_META:
      return {
        ...state,
        title: message.title || state.title,
        cwd: message.cwd ?? state.cwd,
      };
    case KIND.SESSION_END: {
      const reason = message.reason ?? 'Session ended.';
      return {
        ...state,
        sessionEnded: true,
        endedReason: reason,
        items: cap([
          ...state.items,
          { kind: 'notice', id: `end-${message.ts}`, level: 'warning', text: reason, ts: message.ts },
        ]),
      };
    }
    case KIND.HEARTBEAT:
      return { ...state, lastHeartbeat: Date.now(), sessionEnded: false };
    case KIND.MODE:
      return { ...state, mode: (message as ModeChange).mode };
    default:
      return state;
  }
}

export function dismissApproval(state: TimelineState, requestId: string): TimelineState {
  return { ...state, approvals: state.approvals.filter((a) => a.requestId !== requestId) };
}

function upsertAssistant(state: TimelineState, message: AssistantMessage): TimelineState {
  const id = message.messageId ?? `assistant-${message.ts}`;
  const index = state.items.findIndex((item) => item.id === id && item.kind === 'assistant');
  if (index === -1) {
    const item: AssistantItem = { kind: 'assistant', id, text: message.content, ts: message.ts };
    return { ...state, items: cap([...state.items, item]) };
  }
  return {
    ...state,
    items: state.items.map((item, i) =>
      i === index ? { ...(item as AssistantItem), text: message.content, ts: message.ts } : item,
    ),
  };
}

function appendDelta(state: TimelineState, message: AssistantDelta): TimelineState {
  const id = message.messageId ?? `assistant-${message.ts}`;
  const index = state.items.findIndex((item) => item.id === id && item.kind === 'assistant');
  if (index === -1) {
    const item: AssistantItem = { kind: 'assistant', id, text: message.content, ts: message.ts };
    return { ...state, items: cap([...state.items, item]) };
  }
  return {
    ...state,
    items: state.items.map((item, i) =>
      i === index
        ? { ...(item as AssistantItem), text: `${(item as AssistantItem).text}${message.content}`, ts: message.ts }
        : item,
    ),
  };
}

function startTool(state: TimelineState, message: ToolStart): TimelineState {
  if (state.items.some((item) => item.kind === 'tool' && item.id === message.toolCallId)) {
    return state;
  }
  const item: ToolItem = {
    kind: 'tool',
    id: message.toolCallId,
    name: message.toolName,
    args: message.args,
    status: 'running',
    startedAt: message.ts,
    ts: message.ts,
  };
  return { ...state, items: cap([...state.items, item]) };
}

function completeTool(state: TimelineState, message: ToolComplete): TimelineState {
  const index = state.items.findIndex((item) => item.kind === 'tool' && item.id === message.toolCallId);
  if (index === -1) {
    const item: ToolItem = {
      kind: 'tool',
      id: message.toolCallId,
      name: message.toolName,
      status: message.success ? 'success' : 'error',
      resultPreview: message.resultPreview,
      startedAt: message.ts,
      finishedAt: message.ts,
      ts: message.ts,
    };
    return { ...state, items: cap([...state.items, item]) };
  }
  return {
    ...state,
    items: state.items.map((item, i) =>
      i === index
        ? {
            ...(item as ToolItem),
            status: message.success ? 'success' : 'error',
            resultPreview: message.resultPreview,
            finishedAt: message.ts,
          }
        : item,
    ),
  };
}

function pushNotice(state: TimelineState, message: LogLine): TimelineState {
  const item: NoticeItem = {
    kind: 'notice',
    id: `log-${message.ts}-${Math.random().toString(36).slice(2, 6)}`,
    level: message.level,
    text: message.message,
    ts: message.ts,
  };
  return { ...state, items: cap([...state.items, item]) };
}

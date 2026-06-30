import { useEffect, useRef } from 'react';
import type { JSX, ReactNode } from 'react';
import type { TimelineItem } from '../lib/timeline';
import { Markdown } from './Markdown';
import { ToolCard } from './ToolCard';

interface ChatThreadProps {
  items: TimelineItem[];
  /** True while the bound session is live, so we show a caret / working row. */
  streaming?: boolean;
  /** Shown centered when there is nothing yet. */
  emptyHint?: string;
}

const COPILOT_AVATAR: ReactNode = (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M8 0.8l1.7 4.5L14.2 7 9.7 8.7 8 13.2 6.3 8.7 1.8 7l4.5-1.7zM13 10.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9L10.4 13l1.9-.7z"
    />
  </svg>
);

function isAssistantSide(item: TimelineItem | undefined): boolean {
  return !!item && (item.kind === 'assistant' || item.kind === 'tool');
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(ts);
}

export function ChatThread({ items, streaming = false, emptyHint }: ChatThreadProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  // True while the viewport is parked at (or near) the bottom. When the user has
  // scrolled up to read history we must not yank them back down — we only stick to
  // the bottom if they were already there (or just sent a prompt themselves).
  const pinnedRef = useRef(true);

  const last = items[items.length - 1];
  const lastText = last && 'text' in last ? last.text : last?.kind;
  const lastIsUser = last?.kind === 'user';

  // Track how far the reader is from the bottom of the scrolling ancestor.
  useEffect(() => {
    const scroller = rootRef.current?.closest('.thread-scroll') as HTMLElement | null;
    if (!scroller) return undefined;
    const update = (): void => {
      const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      pinnedRef.current = gap < 80;
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    return () => scroller.removeEventListener('scroll', update);
  }, []);

  // Auto-scroll only when genuinely new content arrives (never on a Live/Quiet
  // heartbeat flip), and only if the reader is pinned to the bottom or just sent.
  useEffect(() => {
    if (!pinnedRef.current && !lastIsUser) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length, lastText, lastIsUser]);

  const showThinking = streaming && (!last || last.kind === 'user' || last.kind === 'notice');

  return (
    <div className="chat-thread" aria-live="polite" ref={rootRef}>
      {items.length === 0 && !streaming ? (
        <p className="thread-empty">{emptyHint ?? 'Waiting for the encrypted Copilot stream…'}</p>
      ) : null}

      {items.map((item, idx) => {
        const prev = items[idx - 1];
        const turnStart = isAssistantSide(item) && !isAssistantSide(prev);
        const isLast = idx === items.length - 1;

        if (item.kind === 'user') {
          return (
            <div key={item.id} className="row user">
              <div className="bubble user-bubble">{item.text}</div>
            </div>
          );
        }

        if (item.kind === 'notice') {
          return (
            <div key={item.id} className={`row notice ${item.level}`}>
              <span className="notice-text">{item.text}</span>
            </div>
          );
        }

        const header = turnStart ? (
          <div className="meta">
            <span className="avatar copilot">{COPILOT_AVATAR}</span>
            <span className="role">Copilot</span>
            <span className="ts">{formatTime(item.ts)}</span>
          </div>
        ) : null;

        if (item.kind === 'tool') {
          return (
            <div key={item.id} className={`row tool${turnStart ? ' turn-start' : ''}`}>
              {header}
              <ToolCard item={item} />
            </div>
          );
        }

        const caret = streaming && isLast;
        return (
          <div key={item.id} className={`row assistant${turnStart ? ' turn-start' : ''}`}>
            {header}
            <div className="bubble assistant-bubble">
              <Markdown text={item.text} />
              {caret ? <span className="caret" aria-hidden="true" /> : null}
            </div>
          </div>
        );
      })}

      {showThinking ? (
        <div className="row assistant turn-start thinking-row">
          <div className="meta">
            <span className="avatar copilot">{COPILOT_AVATAR}</span>
            <span className="role">Copilot</span>
          </div>
          <div className="thinking">
            <span className="thinking-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>working…</span>
          </div>
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}

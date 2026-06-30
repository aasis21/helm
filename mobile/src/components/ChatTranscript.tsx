import { useEffect, useRef } from 'react';
import type { JSX, ReactNode } from 'react';
import type { TranscriptItem } from '../App';
import { Markdown } from './Markdown';

interface ChatTranscriptProps {
  items: TranscriptItem[];
  /** True while the session is live, so we show a caret / working indicator. */
  streaming?: boolean;
}

const ASSISTANT_ICON: ReactNode = (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M8 0.8l1.7 4.5L14.2 7 9.7 8.7 8 13.2 6.3 8.7 1.8 7l4.5-1.7zM13 10.4l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9L10.4 13l1.9-.7z"
    />
  </svg>
);

interface RoleView {
  cls: string;
  label: string;
  avatar: ReactNode;
}

function describe(item: TranscriptItem): RoleView {
  if (item.role === 'assistant') {
    return { cls: 'assistant', label: 'Copilot', avatar: ASSISTANT_ICON };
  }
  if (item.role === 'user') {
    return { cls: 'user', label: 'You', avatar: '⊹' };
  }
  if (item.level === 'error') {
    return { cls: 'system error', label: 'Error', avatar: '◈' };
  }
  if (item.level === 'warning') {
    return { cls: 'system warning', label: 'Notice', avatar: '◈' };
  }
  return { cls: 'system', label: 'System', avatar: '◈' };
}

export function ChatTranscript({ items, streaming = false }: ChatTranscriptProps): JSX.Element {
  const endRef = useRef<HTMLDivElement | null>(null);
  const last = items[items.length - 1];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items.length, last?.content, streaming]);

  const showThinking = streaming && (!last || last.role !== 'assistant');

  return (
    <div className="anya-chat" aria-live="polite">
      {items.length === 0 && !streaming ? (
        <p className="chat-empty">Waiting for the encrypted Copilot stream…</p>
      ) : null}

      {items.map((item, idx) => {
        const view = describe(item);
        const prev = items[idx - 1];
        const continuation = idx > 0 && prev?.role === 'assistant' && item.role === 'assistant';
        const isLast = idx === items.length - 1;
        const caret = streaming && isLast && item.role === 'assistant';

        return (
          <article key={item.id} className={`msg ${view.cls}${continuation ? ' continuation' : ''}`}>
            {continuation ? null : (
              <div className="meta">
                <span className="avatar">{view.avatar}</span>
                <span className="role">{view.label}</span>
                <span className="ts">{formatTime(item.ts)}</span>
              </div>
            )}
            <div className="bubble">
              {item.role === 'log' ? <span>{item.content}</span> : <Markdown text={item.content} />}
              {caret ? <span className="caret" aria-hidden="true" /> : null}
            </div>
          </article>
        );
      })}

      {showThinking ? (
        <div className="thinking">
          <span className="thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Copilot is working…</span>
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts);
}

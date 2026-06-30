import type { JSX } from 'react';
import type { SessionView } from '../lib/sessionManager';

interface SessionDrawerProps {
  sessions: SessionView[];
  activeId: string | null;
  onSelect(channelId: string): void;
  onAddSession(): void;
  onRemove(channelId: string): void;
  onClose(): void;
}

function fmtRelative(ts: number | null): string {
  if (!ts) return '';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function lastActivity(session: SessionView): number | null {
  const items = session.timeline.items;
  const lastTs = items.length > 0 ? items[items.length - 1].ts : null;
  return Math.max(lastTs ?? 0, session.timeline.lastHeartbeat ?? 0) || null;
}

function turnCount(session: SessionView): number {
  return session.timeline.items.filter((i) => i.kind === 'user' || i.kind === 'assistant').length;
}

export function SessionDrawer({
  sessions,
  activeId,
  onSelect,
  onAddSession,
  onRemove,
  onClose,
}: SessionDrawerProps): JSX.Element {
  return (
    <>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="drawer-title">SESSIONS</span>
          <button className="icon-btn" type="button" onClick={onAddSession} title="Join another session">
            ＋
          </button>
          <button className="icon-btn" type="button" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="drawer-list">
          {sessions.length === 0 ? (
            <p className="drawer-empty">No sessions joined yet.</p>
          ) : (
            sessions.map((session) => {
              const id = session.meta.channelId;
              const isActive = id === activeId;
              const pending = session.timeline.approvals.length;
              return (
                <div
                  key={id}
                  className={`session-row ${isActive ? 'current' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelect(id);
                  }}
                >
                  <span className={`status-dot ${session.status}`} aria-hidden="true" />
                  <span className="session-info">
                    <span className="session-title">
                      {session.meta.title}
                      {session.meta.kind === 'demo' ? <span className="tag demo">demo</span> : null}
                      {pending > 0 ? <span className="tag alert">{pending} approval</span> : null}
                    </span>
                    <span className="session-sub">
                      {turnCount(session)} msg
                      {lastActivity(session) ? ` · ${fmtRelative(lastActivity(session))}` : ''}
                      {session.meta.cwd ? ` · ${session.meta.cwd.split(/[\\/]/).pop()}` : ''}
                    </span>
                  </span>
                  <button
                    className="icon-btn row-x"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(id);
                    }}
                    title="Leave session"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>

        <button className="drawer-add" type="button" onClick={onAddSession}>
          ＋ Join another Copilot session
        </button>
      </aside>
      <div className="drawer-scrim" onClick={onClose} />
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { SessionStatus } from '../lib/sessionManager';

interface StatusBarProps {
  title: string;
  cwd: string | null;
  status: SessionStatus;
  sessionCount: number;
  canReconnect: boolean;
  onOpenDrawer(): void;
  onAddSession(): void;
  onReconnect(): void;
  onRemove(): void;
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  idle: 'Quiet',
  ended: 'Ended',
  error: 'Offline',
};

export function StatusBar({
  title,
  cwd,
  status,
  sessionCount,
  canReconnect,
  onOpenDrawer,
  onAddSession,
  onReconnect,
  onRemove,
}: StatusBarProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <header className="status-bar">
      <button className="icon-btn drawer-btn" type="button" onClick={onOpenDrawer} aria-label="Open sessions">
        <span className="hamburger" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {sessionCount > 1 ? <span className="session-count">{sessionCount}</span> : null}
      </button>

      <div className="status-id">
        <span className="status-title" title={cwd ?? undefined}>{title}</span>
        <span className={`status-line ${status}`}>
          <span className="status-dot" aria-hidden="true" />
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="bar-menu-wrap" ref={menuRef}>
        <button
          className="icon-btn menu-btn"
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Session menu"
        >
          ⋯
        </button>
        {menuOpen ? (
          <div className="bar-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              className="bar-menu-item"
              onClick={() => {
                setMenuOpen(false);
                onAddSession();
              }}
            >
              ＋ Join another session
            </button>
            {canReconnect ? (
              <button
                type="button"
                role="menuitem"
                className="bar-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onReconnect();
                }}
              >
                ↻ Reconnect
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="bar-menu-item danger"
              onClick={() => {
                setMenuOpen(false);
                onRemove();
              }}
            >
              ✕ Leave this session
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

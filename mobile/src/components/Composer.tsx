import { useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import { MODES } from '@aasis21/helm-shared';
import type { SessionMode } from '@aasis21/helm-shared';

interface ComposerProps {
  disabled: boolean;
  mode: SessionMode;
  cwd: string | null;
  onPrompt(text: string): Promise<void> | void;
  onModeChange(mode: SessionMode): Promise<void> | void;
}

const MODE_LABEL: Record<string, string> = {
  interactive: 'Interactive',
  plan: 'Plan',
  autopilot: 'Autopilot',
};

function basename(path: string | null): string | null {
  if (!path) return null;
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function Composer({ disabled, mode, cwd, onPrompt, onModeChange }: ComposerProps): JSX.Element {
  const [text, setText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  const send = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText('');
    await onPrompt(trimmed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  const folder = basename(cwd);

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <div className="composer-toolbar">
        <div className="mode-wrap">
          <button
            type="button"
            className="pill mode-pill"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="pill-dot" aria-hidden="true" />
            {MODE_LABEL[mode] ?? mode}
            <span className="pill-caret" aria-hidden="true">▾</span>
          </button>
          {menuOpen ? (
            <div className="mode-menu" role="menu">
              {MODES.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="menuitemradio"
                  aria-checked={item === mode}
                  className={`mode-menu-item${item === mode ? ' active' : ''}`}
                  onClick={() => {
                    setMenuOpen(false);
                    if (item !== mode) void onModeChange(item);
                  }}
                >
                  <span className="mode-check">{item === mode ? '✓' : ''}</span>
                  {MODE_LABEL[item] ?? item}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {folder ? <span className="cwd-chip" title={cwd ?? undefined}>📁 {folder}</span> : null}
        <span className="composer-spacer" />
      </div>

      <div className="composer-input-row">
        <textarea
          ref={areaRef}
          rows={1}
          aria-label="Message your Copilot session"
          disabled={disabled}
          value={text}
          spellCheck={false}
          onKeyDown={onKeyDown}
          onChange={(event) => setText(event.target.value)}
          placeholder={disabled ? 'Session ended — re-pair to continue.' : 'Message your Copilot session…'}
        />
        <button className="send-btn" type="submit" disabled={disabled || !text.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M4 12l15-7-7 15-2-6-6-2z" />
          </svg>
        </button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import type { JSX } from 'react';
import type { ToolItem } from '../lib/timeline';

interface ToolCardProps {
  item: ToolItem;
}

const TOOL_LABELS: Record<string, string> = {
  powershell: 'Run',
  bash: 'Run',
  shell: 'Run',
  view: 'View',
  read: 'Read',
  str_replace: 'Edit',
  edit: 'Edit',
  create: 'Create',
  write: 'Write',
  grep: 'Search',
  glob: 'Find',
  ls: 'List',
};

function titleCase(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function label(name: string): string {
  return TOOL_LABELS[name] ?? titleCase(name);
}

/** One-line, human-readable summary of the most useful argument. */
function summarize(args: unknown): string {
  if (!args || typeof args !== 'object') return '';
  const record = args as Record<string, unknown>;
  for (const key of ['command', 'path', 'file', 'pattern', 'query', 'url', 'description']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  const keys = Object.keys(record);
  return keys.length > 0 ? JSON.stringify(record) : '';
}

function elapsed(item: ToolItem): string {
  if (item.finishedAt) {
    const ms = Math.max(0, item.finishedAt - item.startedAt);
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
  }
  return item.status === 'running' ? 'running…' : '';
}

export function ToolCard({ item }: ToolCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const icon = item.status === 'running' ? '↻' : item.status === 'success' ? '✓' : '✕';
  const argLine = summarize(item.args);
  const hasDetail = !!argLine || !!item.resultPreview;

  return (
    <div className={`tool-card ${item.status}${expanded ? ' open' : ''}`}>
      <button
        type="button"
        className="tc-head"
        aria-expanded={expanded}
        onClick={() => hasDetail && setExpanded((v) => !v)}
      >
        <span className="tc-icon" aria-hidden="true">{icon}</span>
        <span className="tc-name">{label(item.name)}</span>
        {argLine ? <span className="tc-args">{argLine}</span> : <span className="tc-args" />}
        <span className="tc-time">{elapsed(item)}</span>
        {hasDetail ? <span className="tc-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span> : null}
      </button>
      {expanded ? (
        <div className="tc-detail">
          {argLine ? (
            <>
              <div className="tc-section">ARGUMENTS</div>
              <pre className="tc-pre">
                {typeof item.args === 'object' ? JSON.stringify(item.args, null, 2) : String(item.args)}
              </pre>
            </>
          ) : null}
          {item.resultPreview ? (
            <>
              <div className="tc-section">{item.status === 'error' ? 'ERROR' : 'RESULT'}</div>
              <pre className="tc-pre">{item.resultPreview}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

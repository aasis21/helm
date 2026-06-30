import { Fragment } from 'react';
import type { JSX, ReactNode } from 'react';

/**
 * Minimal, dependency-free, XSS-safe Markdown -> React renderer.
 * Supports the subset Copilot streams emit: fenced + inline code, bold, italic,
 * links, ordered/unordered lists, headings, blockquotes, and horizontal rules.
 * It renders real React nodes (never dangerouslySetInnerHTML), and only allows
 * http(s)/mailto links. Tolerant of partial markdown while a turn streams in
 * (e.g. an unterminated ``` fence is treated as code to the end of the text).
 */

const SAFE_URL = /^(https?:|mailto:)/i;
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest.length > 0) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyBase}-${n++}`;
    if (tok.startsWith('`')) {
      out.push(<code key={key}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith('**')) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('[')) {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (lm && SAFE_URL.test(lm[2].trim())) {
        out.push(
          <a key={key} href={lm[2].trim()} target="_blank" rel="noreferrer noopener">
            {lm[1]}
          </a>,
        );
      } else {
        out.push(lm ? lm[1] : tok);
      }
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export function Markdown({ text }: { text: string }): JSX.Element {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: JSX.Element[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block (tolerant of a missing closing fence while streaming).
    const fence = /^```(\w+)?\s*$/.exec(line.trim());
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence if present
      blocks.push(
        <pre key={`b${key++}`}>
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    if (line.trim() === '') {
      i++;
      continue;
    }

    if (/^---+\s*$/.test(line.trim())) {
      blocks.push(<hr key={`b${key++}`} />);
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = (`h${level}` as 'h1' | 'h2' | 'h3');
      blocks.push(<Tag key={`b${key++}`}>{renderInline(heading[2], `h${key}`)}</Tag>);
      i++;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote key={`b${key++}`}>{renderInline(quote.join(' '), `q${key}`)}</blockquote>,
      );
      continue;
    }

    // Unordered / ordered list.
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const content = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        items.push(<li key={`li${key}-${items.length}`}>{renderInline(content, `li${key}`)}</li>);
        i++;
      }
      blocks.push(
        ordered ? <ol key={`b${key++}`}>{items}</ol> : <ul key={`b${key++}`}>{items}</ul>,
      );
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-block lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i].trim()) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i].trim())
    ) {
      para.push(lines[i]);
      i++;
    }
    const parts = renderInline(para.join('\n'), `p${key}`);
    blocks.push(
      <p key={`b${key++}`}>
        {parts.map((part, idx) =>
          typeof part === 'string'
            ? part.split('\n').map((seg, j, arr) => (
                <Fragment key={`s${idx}-${j}`}>
                  {seg}
                  {j < arr.length - 1 ? <br /> : null}
                </Fragment>
              ))
            : part,
        )}
      </p>,
    );
  }

  return <>{blocks}</>;
}

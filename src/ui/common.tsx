import React, { useCallback, useState } from 'react';
import { ChapterCopy } from '../content';
import { ChapterId, registerChapter, registerViewport, useChapterVisible } from '../scroll';

/**
 * One scroll-pinned chapter: `length` viewport heights of scroll; inside the page container,
 * the copy on the left and (optionally) the 3D viewport card on the right.
 */
export const Chapter: React.FC<{
  id: ChapterId;
  length: number;
  className?: string;
  viewport?: { label: React.ReactNode; right?: React.ReactNode; foot?: React.ReactNode };
  children: React.ReactNode;
}> = ({ id, length, className, viewport, children }) => {
  const ref = useCallback((el: HTMLElement | null) => registerChapter(id, el), [id]);
  return (
    <section id={id} ref={ref} className={`chapter ${className ?? ''}`} style={{ height: `${length * 100}vh` }}>
      <div className="pin">
        <div className={`wrap ${viewport ? 'grid' : ''}`}>
          {children}
          {viewport && <Viewport id={id} {...viewport} />}
        </div>
      </div>
    </section>
  );
};

/** the card the chapter's stage renders into (the GL canvas is scissored to its body) */
export const Viewport: React.FC<{ id: ChapterId; label: React.ReactNode; right?: React.ReactNode; foot?: React.ReactNode }> = ({
  id,
  label,
  right,
  foot,
}) => {
  const ref = useCallback((el: HTMLElement | null) => registerViewport(id, el), [id]);
  const v = useChapterVisible(id, 8);
  return (
    <figure className="viewport" style={{ opacity: Math.min(1, v * 1.5) }}>
      <figcaption className="vp-head">
        <span>{label}</span>
        {right !== undefined && <span>{right}</span>}
      </figcaption>
      <div className="vp-body" ref={ref}>
        <i className="vp-mark tl" />
        <i className="vp-mark tr" />
        <i className="vp-mark bl" />
        <i className="vp-mark br" />
      </div>
      {foot !== undefined && <div className="vp-foot">{foot}</div>}
    </figure>
  );
};

/** the left column; fades in stepped with the chapter's visibility */
export const Copy: React.FC<{ id: ChapterId; children: React.ReactNode }> = ({ id, children }) => {
  const v = useChapterVisible(id, 8);
  return (
    <div className="copy" style={{ opacity: v, visibility: v > 0 ? 'visible' : 'hidden' }}>
      {children}
    </div>
  );
};

export const Heading: React.FC<{ copy: ChapterCopy }> = ({ copy }) => (
  <>
    <div className="kicker">
      <span className="chip">{copy.index}</span>
      <span>{copy.label}</span>
    </div>
    <h2 className="title">{copy.title}</h2>
    <p className="body">{copy.body}</p>
  </>
);

/** scad.var-style names (UPPER_CASE) in the name ink */
const PARAM = /\b([A-Z][A-Z0-9]*_[A-Z0-9_]+|OVERSHOOT)\b/g;

export const highlightParams = (line: string): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(PARAM)) {
    if (m.index! > last) out.push(line.slice(last, m.index));
    out.push(
      <span className="param" key={m.index}>
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
};

export type LineState = 'dim' | 'on' | 'hot';

export interface CodeLine {
  text: string;
  state: LineState;
  ink?: 'focus' | 'pass' | 'fail';
  head?: boolean;
}

export const Code: React.FC<{ lines: CodeLine[]; params?: boolean }> = ({ lines, params = true }) => (
  <pre className="code">
    {lines.map((l, i) => (
      <span key={i} className={`ln ${l.state === 'dim' ? '' : l.state} ${l.ink ?? ''} ${l.head ? 'cell-head' : ''}`}>
        {params && l.state !== 'hot' ? highlightParams(l.text) : l.text}
        {'\n'}
      </span>
    ))}
  </pre>
);

export const Panel: React.FC<{
  head: React.ReactNode;
  right?: React.ReactNode;
  headClass?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ head, right, headClass, className, children }) => (
  <div className={`panel ${className ?? ''}`}>
    <div className={`panel-head ${headClass ?? ''}`}>
      <span>{head}</span>
      {right !== undefined && <span>{right}</span>}
    </div>
    <div className="panel-body">{children}</div>
  </div>
);

export const Install: React.FC<{ command: string }> = ({ command }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="install"
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(command).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        });
      }}
      aria-label={`Copy "${command}"`}
    >
      <span className="prompt">$</span>
      <span>{command}</span>
      <span className="state">{copied ? 'copied' : 'copy'}</span>
    </button>
  );
};

export const fmt = (v: number, digits = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

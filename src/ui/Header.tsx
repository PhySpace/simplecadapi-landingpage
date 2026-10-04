import React, { useEffect, useState } from 'react';
import { DOCS_URL, GITHUB_REPO, GITHUB_URL, PAPER_URL } from '../style/tokens';

const STARS_KEY = 'sca-stars';

/** GitHub stars, cached for the session (the unauthenticated API allows 60 requests/hour) */
const useStars = () => {
  const [stars, setStars] = useState<number | null>(() => {
    const v = sessionStorage.getItem(STARS_KEY);
    return v ? Number(v) : null;
  });
  useEffect(() => {
    if (stars !== null) return;
    let live = true;
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { stargazers_count: number }) => {
        if (!live) return;
        sessionStorage.setItem(STARS_KEY, String(d.stargazers_count));
        setStars(d.stargazers_count);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [stars]);
  return stars;
};

/** Octicons star-fill-16 */
const StarIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"
    />
  </svg>
);

/** Octicons mark-github-16 */
const GitIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
    />
  </svg>
);

export const Header: React.FC = () => {
  const stars = useStars();
  return (
    <header className="header">
      <div className="wrap header-row">
      <a className="brand" href="#hero">
        SimpleCADAPI
        <small>by PhySpace</small>
      </a>
      <nav className="nav">
        <a className="link" href={DOCS_URL} target="_blank" rel="noreferrer">
          Docs
        </a>
        <a className="link" href={PAPER_URL} target="_blank" rel="noreferrer">
          Paper
        </a>
        <a className="gh" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="SimpleCADAPI on GitHub">
          <span>
            <GitIcon />
            GitHub
          </span>
          <span className="count">
            <StarIcon />
            {stars === null ? '···' : stars.toLocaleString('en-US')}
          </span>
        </a>
      </nav>
      </div>
    </header>
  );
};

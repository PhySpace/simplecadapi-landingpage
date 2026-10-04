import React from 'react';
import { measure } from '../scroll';
import { DOCS_URL, GITHUB_URL, PAPER_URL, PYPI_URL } from '../style/tokens';

export const Footer: React.FC<{ status: string }> = ({ status }) => (
  <footer className="footer">
    <div className="wrap footer-grid">
      <div>
        <div className="brand">SimpleCADAPI</div>
        <p className="body" style={{ color: 'var(--dim)' }}>
          An OCP-native Python CAD SDK for agents. Research artifact of the CADIR paper. Built by PhySpace.
        </p>
      </div>
      <div className="footer-col">
        <span className="k">Project</span>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
        <a href={PYPI_URL} target="_blank" rel="noreferrer">PyPI</a>
        <a href={DOCS_URL} target="_blank" rel="noreferrer">Docs</a>
      </div>
      <div className="footer-col">
        <span className="k">Research</span>
        <a href={PAPER_URL} target="_blank" rel="noreferrer">CADIR · arXiv 2608.00891</a>
        <a href={`${GITHUB_URL}/tree/master/examples`} target="_blank" rel="noreferrer">Examples</a>
      </div>
      <div className="footer-col">
        <span className="k">This page</span>
        <span>Models exported from the repository's own examples</span>
        <span className="status">renderer · {status}</span>
      </div>
    </div>
  </footer>
);

/** keeps chapter progress live when there is no GL loop to drive it */
export const startDomLoop = () => {
  let raf = 0;
  const loop = () => {
    measure();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
};

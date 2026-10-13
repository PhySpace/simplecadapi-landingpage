import React, { useEffect, useRef, useState } from 'react';
import type { Engine, EngineStatus } from './gl/Engine';
import { heroSettled } from './hero';
import {
  AssemblyChapter,
  Close,
  CodeChapter,
  ComposeChapter,
  Hero,
  ParamsChapter,
  SelectChapter,
  SimChapter,
  VerifyChapter,
} from './ui/chapters';
import { Header } from './ui/Header';
import { Footer, startDomLoop } from './ui/Footer';

export const App: React.FC = () => {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<EngineStatus | 'starting'>('starting');

  useEffect(() => {
    // debug: ?at=select:0.5 jumps to a chapter's progress (screenshots)
    const at = new URLSearchParams(location.search).get('at');
    if (at) {
      const [id, p] = at.split(':');
      const el = document.getElementById(id);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top + Number(p ?? 0) * Math.max(0, el.offsetHeight - window.innerHeight), behavior: 'instant' });
      }
    }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (import.meta.env.DEV && query.has('capture')) {
      // dev only: make the hero's loops (see src/capture.ts); no page engine
      void import('./capture').then(({ runCapture }) => runCapture()).catch((err) => console.error('capture failed', err));
      return;
    }
    if (query.has('nogl')) {
      setStatus('failed');
      return startDomLoop();
    }
    // the 3D engine (and three.js with it) loads after the hero's first picture is on screen
    let live = true;
    let engine: Engine | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let stopDom: (() => void) | null = null;
    void (async () => {
      await heroSettled;
      if (!live) return;
      try {
        const [{ Engine }, { pageStages }] = await Promise.all([import('./gl/Engine'), import('./gl/stages')]);
        if (!live) return;
        // a fresh canvas per engine: StrictMode mounts twice, and a GPU context cannot be re-owned
        canvas = document.createElement('canvas');
        canvas.className = 'gl';
        host.current!.appendChild(canvas);
        engine = new Engine(pageStages);
        const s = await engine.init(canvas);
        if (live) setStatus(s);
      } catch (err) {
        console.error('renderer failed', err);
        if (!live) return;
        setStatus('failed');
        stopDom = startDomLoop();
      }
    })();
    return () => {
      live = false;
      stopDom?.();
      engine?.dispose();
      canvas?.remove();
    };
  }, []);

  return (
    <>
      <div ref={host} />
      <Header />
      <main>
        <Hero />
        <CodeChapter />
        <SelectChapter />
        <VerifyChapter />
        <ParamsChapter />
        <AssemblyChapter />
        <SimChapter />
        <ComposeChapter />
        <Close />
      </main>
      <Footer status={status === 'starting' ? 'starting renderer' : status === 'failed' ? 'no GPU renderer' : status} />
    </>
  );
};

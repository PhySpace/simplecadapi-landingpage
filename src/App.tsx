import React, { useEffect, useRef, useState } from 'react';
import { Engine, EngineStatus } from './gl/Engine';
import { AssemblyStage } from './gl/stages/assembly';
import { ComposeStage } from './gl/stages/compose';
import { CodeStage, ParamsStage, SelectStage } from './gl/stages/flange';
import { ShowcaseStage } from './gl/stages/showcase';
import { SimStage } from './gl/stages/sim';
import { VerifyStage } from './gl/stages/verify';
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

const stages = () => [
  new ShowcaseStage(),
  new CodeStage(),
  new SelectStage(),
  new VerifyStage(),
  new ParamsStage(),
  new AssemblyStage(),
  new SimStage(),
  new ComposeStage(),
];

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
    if (new URLSearchParams(location.search).has('nogl')) {
      setStatus('failed');
      return startDomLoop();
    }
    // a fresh canvas per engine: StrictMode mounts twice, and a GPU context cannot be re-owned
    const canvas = document.createElement('canvas');
    canvas.className = 'gl';
    host.current!.appendChild(canvas);
    const engine = new Engine(stages);
    let live = true;
    let stopDom: (() => void) | null = null;
    engine
      .init(canvas)
      .then((s) => live && setStatus(s))
      .catch((err) => {
        console.error('renderer failed', err);
        if (!live) return;
        setStatus('failed');
        stopDom = startDomLoop();
      });
    return () => {
      live = false;
      stopDom?.();
      engine.dispose();
      canvas.remove();
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

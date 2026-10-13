import { useEffect, useState } from 'react';
import { fetchJson, type Priority } from './gl/cad';

/** pipeline/export_flange.py index */
export interface FlangeIndex {
  notebook: string;
  params: Record<string, number>;
  stages: { asset: string; slug: string; kind: string; faces: number; volume: number }[];
  selections: Record<string, { stage: string; edges: number[]; candidates: number; circles: number }>;
  variants: { asset: string; bolt_count: number; bolt_pcd: number; faces: number; volume: number; web: number }[];
  rejected: { bolt_count: number; bolt_pcd: number; error: string; message: string } | null;
}

export interface BldcIndex {
  assets: {
    name: string;
    path: string;
    module: string;
    hiddenInExplode: boolean;
    explodeDz: number;
    axisRadius: number;
    center: number[];
  }[];
  components: number;
  constraints: number;
  treeComponents: number;
  treeConstraints: number;
  leaves: number;
  buildSeconds: number;
  moduleOrder: string[];
}

export interface FieldIndex {
  bin: string;
  buffers: Record<string, { offset: number; length: number; type: 'f32' | 'u32' | 'u8' }>;
  nodes: number;
  triangles: number;
  volumeNodes: number;
  elements: number;
  meshSize: number;
  vmMax: number;
  vmMin: number;
  dispMax: number;
  loadZ: number;
  solver: string;
  summary: Record<string, number>;
}

export interface FourbarIndex {
  links: { asset: string; part_id: string; center_distance: number; faces: number; volume: number }[];
  components: number;
  constraints: number;
  barThickness: number;
  lengths: { ground: number; crank: number; coupler: number; rocker: number };
}

export interface FilletError {
  payload: {
    operation: string;
    what_happened: string;
    measurements: { name: string; value: number | number[]; unit: string }[];
    repair: string[];
    technical_details: string;
  };
  badRadius: number;
  goodRadius: number;
}

const cache = new Map<string, Promise<unknown>>();
export const loadJson = <T,>(path: string, priority: Priority = 'auto'): Promise<T> => {
  let p = cache.get(path);
  if (!p) {
    p = fetchJson<T>(path, priority);
    cache.set(path, p);
  }
  return p as Promise<T>;
};

export const useJson = <T,>(path: string): T | null => {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    loadJson<T>(path).then((d) => live && setV(d), console.error);
    return () => {
      live = false;
    };
  }, [path]);
  return v;
};

/** pipeline/export_showcase.py index */
export interface ShowcaseProduct {
  key: string;
  title: string;
  notebook: string;
  kind: 'part' | 'assembly';
  parts: number;
  assets: number;
  instances: { asset: string; path: string; matrix: number[] }[];
  bounds: { min: number[]; max: number[]; center: number[]; radius: number };
  components?: number;
  constraints?: number;
}
export interface ShowcaseIndex {
  products: ShowcaseProduct[];
}

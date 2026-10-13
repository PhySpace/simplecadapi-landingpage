import React, { useEffect, useSyncExternalStore } from 'react';
import type { HeroProduct } from '../hero';
import { heroSrc, showcase, startHero } from '../hero';

/**
 * The picture in the hero card: a still frame at once, replaced by the loop when it has
 * downloaded (the loop starts on the same frame, so nothing jumps). Drawn nearest-neighbour:
 * the loop is the page's own 1-bit dither at half the card's resolution.
 */
export const HeroLoop: React.FC = () => {
  useSyncExternalStore(showcase.subscribe, () => showcase.version);
  useEffect(() => startHero(), []);
  const index = showcase.index;
  const p = showcase.products[index] as HeroProduct | undefined;
  if (!p || (index === 0 && !showcase.posterReady && !showcase.loaded.has(0))) return null;
  return (
    <img
      key={index}
      className="hero-loop"
      src={heroSrc(index)}
      width={p.width}
      height={p.height}
      alt={`${p.title}: a rotating 1-bit render of the finished model`}
      draggable={false}
    />
  );
};

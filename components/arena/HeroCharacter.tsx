'use client';

import { useEffect, useRef } from 'react';
import { createHeroScene } from '@/lib/game/hero-scene';

/** The home page's crowned character, drawn live in 3D (a still frame on phones). */
export function HeroCharacter({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createHeroScene(canvas);
    return () => scene?.dispose();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-label="The king of Crowns, wearing the crown"
      role="img"
      className={`block ${className}`}
    />
  );
}

'use client';

import { useRef, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'framer-motion';

/** The snap curve every Crowns animation uses. */
export const EASE = [0.23, 1, 0.32, 1] as const;

/** Fades and lifts its children in once, as they scroll into view. */
export function Reveal({ children, delay = 0, y = 28, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 0.3, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** How far an element has scrolled through the screen: 0 as it enters, 1 as it leaves. */
export function useSectionProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  return { ref, progress: scrollYProgress };
}

/** Turns that progress into an up-and-down drift in px; none for people who turn motion off. */
export function useDrift(progress: MotionValue<number>, distance: number) {
  const reduce = useReducedMotion();
  return useTransform(progress, [0, 1], reduce ? [0, 0] : [-distance, distance]);
}

/** A huge section headline that slides in from the side as it scrolls into view. */
export function SectionTitle({ kicker, children, align = 'left' }: { kicker?: string; children: ReactNode; align?: 'left' | 'center' }) {
  return (
    <div className={align === 'center' ? 'text-center' : ''}>
      {kicker ? (
        <Reveal y={12}>
          <p className="mb-3 font-display text-lg font-extrabold tracking-wide text-lime">{kicker}</p>
        </Reveal>
      ) : null}
      <motion.h2
        initial={{ opacity: 0, x: align === 'center' ? 0 : -48, y: align === 'center' ? 24 : 0 }}
        whileInView={{ opacity: 1, x: 0, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        transition={{ duration: 0.3, ease: EASE }}
        className="font-display text-[56px] font-black uppercase leading-[0.88] sm:text-[84px] lg:text-[112px]"
      >
        {children}
      </motion.h2>
    </div>
  );
}

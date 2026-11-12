/** Every motion helper checks this first: people who ask for reduced motion get the end state with no animation. */
export function prefersReducedMotion(win: Window | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);

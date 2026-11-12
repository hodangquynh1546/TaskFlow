import { prefersReducedMotion } from './motion';

const COLORS = ['#ff8a3d', '#7db8ff', '#ffd84a', '#5fe0a4', '#ff7aae', '#ffffff'] as const;
const PARTICLES = 90;
const DURATION_MS = 1800;
const GRAVITY = 0.32;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  round: boolean;
}

/**
 * One burst of paper from a point on screen (default: the lower middle). Drawn on a throw-away full-screen canvas that
 * ignores the pointer and removes itself, so it can never block the UI. Does nothing for reduced motion or where
 * canvas is unavailable (tests, old browsers).
 */
export function burstConfetti(origin?: { x: number; y: number }, doc: Document = document): void {
  const win = doc.defaultView;
  if (!win || prefersReducedMotion(win)) {
    return;
  }

  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    return;
  }

  const dpr = Math.min(win.devicePixelRatio || 1, 2);
  canvas.width = win.innerWidth * dpr;
  canvas.height = win.innerHeight * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '2000' });
  ctx.scale(dpr, dpr);
  doc.body.appendChild(canvas);

  const from = origin ?? { x: win.innerWidth / 2, y: win.innerHeight * 0.65 };
  const particles: Particle[] = Array.from({ length: PARTICLES }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 7 + Math.random() * 9;
    return {
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      round: Math.random() < 0.3,
    };
  });

  const start = win.performance.now();
  const frame = (now: number): void => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, win.innerWidth, win.innerHeight);
    const fade = Math.max(0, Math.min(1, (DURATION_MS - elapsed) / 500));
    for (const p of particles) {
      p.vy += GRAVITY;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.spin;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (elapsed < DURATION_MS) {
      win.requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };
  win.requestAnimationFrame(frame);
}

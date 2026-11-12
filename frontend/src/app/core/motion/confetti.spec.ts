import { burstConfetti } from './confetti';

describe('burstConfetti', () => {
  const original = window.matchMedia;
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: original });
    document.querySelectorAll('canvas').forEach((c) => c.remove());
    vi.restoreAllMocks();
  });

  it('draws nothing for people who asked for reduced motion', () => {
    burstConfetti();

    expect(document.querySelector('canvas')).toBeNull();
  });

  it('does nothing where canvas is unavailable instead of throwing', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: () => ({ matches: false }) });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(() => burstConfetti()).not.toThrow();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('adds a click-through, screen-reader-hidden canvas and removes it when the burst ends', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: () => ({ matches: false }) });
    const ctx = { scale() {}, clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, arc() {}, fill() {}, fillRect() {}, globalAlpha: 1, fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    let now = 0;
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => (callbacks.push(cb), callbacks.length));
    vi.spyOn(window.performance, 'now').mockImplementation(() => now);

    burstConfetti({ x: 10, y: 20 });
    const canvas = document.querySelector('canvas')!;

    expect(canvas.style.pointerEvents).toBe('none');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    callbacks.shift()!(100);
    expect(document.querySelector('canvas')).not.toBeNull();
    now = 5000;
    callbacks.shift()!(5000);
    expect(document.querySelector('canvas')).toBeNull();
  });
});

// jsdom reports an English browser. The app picks its first-visit language from the browser, but the existing
// behaviour specs assert Vietnamese text, so the test browser is Vietnamese. Language behaviour is tested directly
// (core/i18n/i18n.service.spec.ts) with explicit inputs.
Object.defineProperty(window.navigator, 'languages', { value: ['vi-VN', 'vi'], configurable: true });
Object.defineProperty(window.navigator, 'language', { value: 'vi-VN', configurable: true });

// jsdom has no matchMedia. Tests behave as for a person who asked for reduced motion: numbers show their final value at
// once and no confetti canvas is created, so assertions never race an animation. Specs that exercise the animations
// replace this stub with their own.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

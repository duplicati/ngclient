// Node 25+ ships its own localStorage/sessionStorage globals, which shadow the jsdom ones,
// and its localStorage is undefined unless --localstorage-file is given.
// Point both globals at the jsdom storage so specs behave the same on every Node version.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;

if (jsdomWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    Object.defineProperty(globalThis, key, {
      value: jsdomWindow[key],
      configurable: true,
      writable: true,
    });
  }
}

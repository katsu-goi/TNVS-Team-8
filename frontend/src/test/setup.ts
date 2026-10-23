import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Node 22+ may expose an unusable experimental global localStorage unless a
// file is configured. Keep a deterministic per-worker Web Storage substitute.
const storageValues = new Map<string, string>();
Object.defineProperties(Storage.prototype, {
  length: { configurable: true, get: () => storageValues.size },
  clear: { configurable: true, value: () => storageValues.clear() },
  getItem: { configurable: true, value: (key: string) => storageValues.get(String(key)) ?? null },
  key: { configurable: true, value: (index: number) => [...storageValues.keys()][index] ?? null },
  removeItem: { configurable: true, value: (key: string) => { storageValues.delete(String(key)); } },
  setItem: { configurable: true, value: (key: string, value: string) => { storageValues.set(String(key), String(value)); } },
});
const testStorage = Object.create(Storage.prototype) as Storage;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: testStorage,
});
Object.defineProperty(window, 'localStorage', { configurable: true, value: testStorage });

const canvasGradient = { addColorStop: vi.fn() };
const canvasContext = new Proxy({
  canvas: document.createElement('canvas'),
  measureText: () => ({ width: 0 }),
  createLinearGradient: () => canvasGradient,
  createRadialGradient: () => canvasGradient,
  createPattern: () => null,
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
}, {
  get: (target, property) => Reflect.get(target, property) ?? vi.fn(),
  set: (target, property, value) => Reflect.set(target, property, value),
});

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: vi.fn(() => canvasContext),
});

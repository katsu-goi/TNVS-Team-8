import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

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

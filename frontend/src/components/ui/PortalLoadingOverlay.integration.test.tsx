import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { LottieRefCurrentProps } from 'lottie-react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, createRef, type ComponentType, type RefObject } from 'react';
import loadingAnimation from '../../assets/lottie/loading.json';

type LottieComponent = ComponentType<{
  animationData: unknown;
  lottieRef: RefObject<LottieRefCurrentProps | null>;
  autoplay: boolean;
  loop: boolean;
}>;

let Lottie: LottieComponent;
let PortalLoadingOverlay: ComponentType<{ message?: string }>;

describe('loading.json runtime integration', () => {
  beforeAll(async () => {
    const gradient = { addColorStop: vi.fn() };
    const canvasContext = new Proxy({
      canvas: document.createElement('canvas'),
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => null,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    }, {
      get: (target, property) => Reflect.get(target, property) ?? vi.fn(),
      set: (target, property, value) => Reflect.set(target, property, value),
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext as unknown as CanvasRenderingContext2D);
    ({ default: Lottie } = await import('lottie-react'));
    ({ PortalLoadingOverlay } = await import('./PortalLoadingOverlay'));
  });

  afterEach(cleanup);
  afterAll(() => vi.restoreAllMocks());

  it('imports a valid multi-frame Lottie document', () => {
    expect(loadingAnimation).toMatchObject({
      v: '5.7.0',
      fr: 30,
      ip: 0,
      op: 66,
      w: 500,
      h: 500,
    });
    expect(loadingAnimation.layers).toHaveLength(2);
    expect(loadingAnimation.op - loadingAnimation.ip).toBeGreaterThan(1);
  });

  it('creates visible SVG output inside PortalLoadingOverlay', async () => {
    const { container } = render(createElement(PortalLoadingOverlay, { message: 'Loading test content...' }));
    const wrapper = container.querySelector('[data-testid="portal-loading-animation"]');

    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveStyle({ minWidth: '112px', minHeight: '112px' });
    await waitFor(() => expect(wrapper?.querySelector('svg')).not.toBeNull());
    const svg = wrapper?.querySelector('svg');
    expect(svg).toHaveStyle({ width: '100%', height: '100%' });
    expect(wrapper?.querySelectorAll('path[fill]:not([fill="none"])').length).toBeGreaterThan(0);
  });

  it('advances frames with autoplay enabled and looping configured', async () => {
    const lottieRef = createRef<LottieRefCurrentProps>();
    render(createElement(Lottie, {
      animationData: loadingAnimation,
      lottieRef,
      autoplay: true,
      loop: true,
    }));

    await waitFor(() => expect(lottieRef.current?.animationLoaded).toBe(true));
    expect(lottieRef.current?.getDuration(true)).toBe(66);
    expect(lottieRef.current?.animationItem?.loop).toBe(true);
    const startFrame = lottieRef.current?.animationItem?.currentFrame ?? 0;

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    });

    expect(lottieRef.current?.animationItem?.currentFrame).toBeGreaterThan(startFrame);
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('lottie-react', () => ({
  default: ({ animationData, autoplay, loop }: { animationData: Record<string, unknown>; autoplay: boolean; loop: boolean }) => (
    <div
      data-testid="lottie-animation"
      data-version={String(animationData.v)}
      data-layers={String(Array.isArray(animationData.layers) ? animationData.layers.length : 0)}
      data-autoplay={String(autoplay)}
      data-loop={String(loop)}
    />
  ),
}));

import { PortalLoadingOverlay } from './PortalLoadingOverlay';

describe('PortalLoadingOverlay', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('announces loading and autoplays the exact loading.json animation data', async () => {
    render(<PortalLoadingOverlay message="Loading audit records..." />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading audit records...')).toBeInTheDocument();
    const wrapper = screen.getByTestId('portal-loading-animation');
    expect(wrapper).toHaveStyle({ minWidth: '112px', minHeight: '112px' });
    expect(wrapper.className).toContain('h-[112px]');
    expect(wrapper.className).toContain('lg:h-[148px]');
    expect(screen.getByRole('status')).toHaveClass('fixed', 'inset-0', 'z-[110]');
    const animation = await screen.findByTestId('lottie-animation');
    expect(animation).toHaveAttribute('data-version', '5.7.0');
    expect(animation).toHaveAttribute('data-layers', '2');
    expect(animation).toHaveAttribute('data-autoplay', 'true');
    expect(animation).toHaveAttribute('data-loop', 'true');
  });

  it('renders the exact animation as a static frame when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(<PortalLoadingOverlay />);

    const animation = await screen.findByTestId('lottie-animation');
    expect(animation).toHaveAttribute('data-version', '5.7.0');
    expect(animation).toHaveAttribute('data-layers', '2');
    expect(animation).toHaveAttribute('data-autoplay', 'false');
    expect(animation).toHaveAttribute('data-loop', 'false');
  });
});

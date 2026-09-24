import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: ({ src, autoplay, loop }: { src: string; autoplay: boolean; loop: boolean }) => (
    <div
      data-testid="lottie-animation"
      data-src={src}
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

  it('announces loading and autoplays the exact loading.json asset', async () => {
    render(<PortalLoadingOverlay message="Loading audit records…" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading audit records…')).toBeInTheDocument();
    const animation = await screen.findByTestId('lottie-animation');
    expect(animation.getAttribute('data-src')).toContain('/src/assets/lottie/loading.json');
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
    expect(animation.getAttribute('data-src')).toContain('/src/assets/lottie/loading.json');
    expect(animation).toHaveAttribute('data-autoplay', 'false');
    expect(animation).toHaveAttribute('data-loop', 'false');
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => <div data-testid="lottie-animation" />,
}));

import { PortalLoadingState } from './PortalLoadingState';

describe('PortalLoadingState', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('announces the content loading state and renders the bundled animation', async () => {
    render(<PortalLoadingState message="Loading audit records" />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading audit records')).toBeInTheDocument();
    expect(await screen.findByTestId('lottie-animation')).toBeInTheDocument();
  });

  it('uses a static Hirna mark when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const { container } = render(<PortalLoadingState />);

    expect(screen.queryByTestId('lottie-animation')).not.toBeInTheDocument();
    expect(container.querySelector('img[src="/hirna-logo.png"]')).toBeInTheDocument();
  });
});

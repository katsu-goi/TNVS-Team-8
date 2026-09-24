import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => <div data-testid="lottie-animation" />,
}));

import { HirnaLoader } from './HirnaLoader';

describe('HirnaLoader', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('announces the global loading state and renders the bundled animation', async () => {
    render(<HirnaLoader />);

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Loading Hirna Portal...')).toBeInTheDocument();
    expect(screen.getByText('Preparing your workspace')).toBeInTheDocument();
    expect(await screen.findByTestId('lottie-animation')).toBeInTheDocument();
  });

  it('uses a static Hirna mark when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(<HirnaLoader />);

    expect(screen.queryByTestId('lottie-animation')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Hirna' })).toHaveLength(1);
  });
});

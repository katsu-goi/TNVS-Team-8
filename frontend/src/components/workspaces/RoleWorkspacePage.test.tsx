import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getWorkspace } = vi.hoisted(() => ({ getWorkspace: vi.fn() }));

vi.mock('../../api/governanceService', () => ({
  governanceService: { getWorkspace },
}));
vi.mock('../../stores/realtimeSyncStore', () => ({
  useRealtimeSyncStore: (selector: (state: { revision: number }) => unknown) => selector({ revision: 0 }),
}));
vi.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => <div data-testid="lottie-animation" />,
}));

import { RoleWorkspacePage } from './RoleWorkspacePage';
import { workspaceConfigs } from './workspaceConfig';

const config = workspaceConfigs.find((item) => item.slug === 'compliance-management')!;

describe('RoleWorkspacePage loading transitions', () => {
  beforeEach(() => getWorkspace.mockReset());
  afterEach(cleanup);

  it('replaces the loader with the empty state after an empty API response', async () => {
    getWorkspace.mockResolvedValueOnce({
      workspace: config.slug,
      section: 'dashboard',
      generatedAt: new Date().toISOString(),
      metrics: [],
      rows: [],
      alerts: [],
    });

    render(<RoleWorkspacePage config={config} section="dashboard" />);

    expect(screen.getByText('Loading executive dashboard')).toBeInTheDocument();
    expect(await screen.findByText('No records are currently available for this workspace.')).toBeInTheDocument();
    expect(screen.queryByText('Loading executive dashboard')).not.toBeInTheDocument();
  });

  it('replaces the loader with a visible error when the API fails', async () => {
    getWorkspace.mockRejectedValueOnce(new Error('Workspace service unavailable'));

    render(<RoleWorkspacePage config={config} section="dashboard" />);

    expect(screen.getByText('Loading executive dashboard')).toBeInTheDocument();
    expect(await screen.findByText('Workspace service unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Loading executive dashboard')).not.toBeInTheDocument();
  });
});

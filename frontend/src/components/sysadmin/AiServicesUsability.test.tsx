import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { AiServicesPage } from './AiServicesPage';

vi.mock('../../api/client', () => ({ apiClient: { get: vi.fn() }, extractErrorMessage: () => 'Connection unavailable' }));
vi.mock('../../stores/realtimeSyncStore', () => ({ useRealtimeSyncStore: (selector: (s: { aiConfigRevision: number }) => unknown) => selector({ aiConfigRevision: 0 }) }));
afterEach(cleanup);

describe('AI measurements', () => {
  const renderMetrics = (avgLatencyMs: number | null, successRate: number | null) => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => ({ data: { data: url === '/ai/analytics' ? {
      requestsToday: 0, avgLatencyMs, successRate, requestsPerDay: [], tokenConsumption: [],
    } : url === '/ai/prompt' ? { prompt: '' } : [] } }));
    render(<AiServicesPage />);
  };
  it('explains absent measurements without displaying null units or manufacturing zero', async () => {
    renderMetrics(null, null);
    await waitFor(() => expect(screen.getAllByText('No measurements yet')).toHaveLength(2));
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('null ms')).not.toBeInTheDocument();
    expect(screen.queryByText('null%')).not.toBeInTheDocument();
  });
  it('preserves real zero measurements', async () => {
    renderMetrics(0, 0);
    expect(await screen.findByText('0 ms')).toBeVisible();
    expect(screen.getByText('0%')).toBeVisible();
  });
});

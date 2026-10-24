import { useEffect, useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationFocusManager } from './NotificationFocusManager';

const recordId = '1b8a9977-9874-4ea6-a79b-1b71c2a7b5ef';

describe('NotificationFocusManager', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('focuses and highlights an authorized record already rendered by the page', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { container } = render(
      <MemoryRouter initialEntries={[`/compliance/documents?focus=${recordId}`]}>
        <NotificationFocusManager />
        <div data-notification-entity-id={recordId}>Permit</div>
      </MemoryRouter>,
    );

    const target = container.querySelector(`[data-notification-entity-id="${recordId}"]`)!;
    expect(target).toHaveAttribute('tabindex', '-1');
    expect(target).toHaveClass('notification-focus-target');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('waits for an authorized row to load and ignores malformed identifiers', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const DeferredRow = () => {
      const [visible, setVisible] = useState(false);
      useEffect(() => { setVisible(true); }, []);
      return visible ? <div data-notification-entity-id={recordId}>Loaded permit</div> : null;
    };

    const { container, unmount } = render(
      <MemoryRouter initialEntries={[`/compliance/documents?focus=${recordId}`]}>
        <NotificationFocusManager /><DeferredRow />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(container.querySelector(`[data-notification-entity-id="${recordId}"]`)).toHaveClass('notification-focus-target');

    unmount();
    scrollIntoView.mockClear();
    render(
      <MemoryRouter initialEntries={['/compliance/documents?focus=not-a-uuid']}>
        <NotificationFocusManager /><div data-notification-entity-id="not-a-uuid">Unsafe target</div>
      </MemoryRouter>,
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

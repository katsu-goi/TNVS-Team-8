import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NotificationFocusManager: React.FC = () => {
  const { search } = useLocation();

  useEffect(() => {
    const recordId = new URLSearchParams(search).get('focus');
    if (!recordId || !UUID_PATTERN.test(recordId)) return;

    let target: HTMLElement | null = null;
    const focusTarget = () => {
      const match = document.querySelector<HTMLElement>(`[data-notification-entity-id="${recordId}"]`);
      if (!match) return false;
      target = match;
      match.setAttribute('tabindex', '-1');
      match.classList.add('notification-focus-target');
      match.focus({ preventScroll: true });
      match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    };

    if (focusTarget()) return () => {
      target?.classList.remove('notification-focus-target');
      target?.removeAttribute('tabindex');
    };

    const observer = new MutationObserver(() => {
      if (focusTarget()) observer.disconnect();
    });
    observer.observe(document.getElementById('portal-content') ?? document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      target?.classList.remove('notification-focus-target');
      target?.removeAttribute('tabindex');
    };
  }, [search]);

  return null;
};

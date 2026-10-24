import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRenderedWithin(element: HTMLElement, boundary: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current && current !== boundary.parentElement) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (current === boundary) break;
    current = current.parentElement;
  }
  return true;
}

export const NotificationFocusManager: React.FC = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const recordId = new URLSearchParams(search).get('focus');
    if (!recordId || !UUID_PATTERN.test(recordId)) return;

    let target: HTMLElement | null = null;
    const routeKey = `${pathname}${search}`;
    const contentRoot = document.getElementById('portal-content') ?? document.body;
    const focusTarget = () => {
      const slots = Array.from(contentRoot.querySelectorAll<HTMLElement>('[data-portal-route-key]'));
      const destination = slots.length > 0
        ? slots.find((slot) => slot.dataset.portalRouteKey === routeKey && slot.getAttribute('aria-hidden') !== 'true')
        : contentRoot;
      const matches = destination
        ? Array.from(destination.querySelectorAll<HTMLElement>(`[data-notification-entity-id="${recordId}"]`))
        : [];
      const match = destination ? matches.find((candidate) => isRenderedWithin(candidate, destination)) : undefined;
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
    observer.observe(contentRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden'] });
    return () => {
      observer.disconnect();
      target?.classList.remove('notification-focus-target');
      target?.removeAttribute('tabindex');
    };
  }, [pathname, search]);

  return null;
};

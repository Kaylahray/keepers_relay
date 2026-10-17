'use client';

import { useEffect } from 'react';

/**
 * The CCC connector measures its card while the host is still
 * `display: none`, writes `height: 0`, then clips the wallet list
 * (`overflow: hidden`). The next open never recovers, so Connect
 * sits on a dimmed page with no picker.
 */
const PATCH = `
  .main {
    height: auto !important;
    max-height: min(80vh, 640px);
    overflow: auto;
  }
`;

export function ConnectorFrame() {
  useEffect(() => {
    const apply = () => {
      const root = document.querySelector('ccc-connector')?.shadowRoot;
      if (!root || root.querySelector('style[data-crowns-connector]')) return Boolean(root);
      const style = document.createElement('style');
      style.dataset.crownsConnector = '1';
      style.textContent = PATCH;
      root.appendChild(style);
      return true;
    };

    if (apply()) return;
    const obs = new MutationObserver(() => {
      if (apply()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  return null;
}

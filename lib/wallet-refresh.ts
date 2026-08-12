/** Soft signal after a signed CKB tx so balance/UI can refresh. */
export const WALLET_REFRESH_EVENT = 'keepers-wallet-refresh';

export function requestWalletRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WALLET_REFRESH_EVENT));
}

'use client';

import { useWalletContext } from '@/context/wallet-provider';

export function useWallet() {
  return useWalletContext();
}

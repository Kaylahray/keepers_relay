'use client';

import { ccc } from '@ckb-ccc/connector-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { WALLET_REFRESH_EVENT } from '@/lib/wallet-refresh';

type WalletStore = {
  connect: ReturnType<typeof ccc.useCcc>['open'];
  disconnect: ReturnType<typeof ccc.useCcc>['disconnect'];
  wallet: ReturnType<typeof ccc.useCcc>['wallet'];
  signer: ReturnType<typeof ccc.useSigner>;
  address: string;
  balance: string;
  formattedAddress: string;
  isConnected: boolean;
  isReady: boolean;
  refreshWallet: () => Promise<void>;
};

const WalletContext = createContext<WalletStore | null>(null);

/** CCC connector modal + address/balance refresh. */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { open, disconnect, wallet } = ccc.useCcc();
  const signer = ccc.useSigner();
  const [address, setAddress] = useState('');
  const [balance, setBalance] = useState('');
  const [isReady, setIsReady] = useState(false);

  const refreshWallet = useCallback(async () => {
    if (!signer) {
      setAddress('');
      setBalance('');
      setIsReady(true);
      return;
    }

    try {
      const addr = await signer.getRecommendedAddress();
      setAddress(addr);
      const capacity = await signer.getBalance();
      setBalance(ccc.fixedPointToString(capacity));
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : String(error);
      if (message.includes('connection closed')) return;
      console.error('Failed to fetch wallet data:', error);
    } finally {
      setIsReady(true);
    }
  }, [signer]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshWallet();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refreshWallet]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      void refreshWallet();
    };
    window.addEventListener(WALLET_REFRESH_EVENT, handler);
    return () => window.removeEventListener(WALLET_REFRESH_EVENT, handler);
  }, [refreshWallet]);

  const formattedAddress = useMemo(() => {
    if (!address) return '';
    return `${address.slice(0, 8)}…${address.slice(-6)}`;
  }, [address]);

  const value: WalletStore = {
    connect: open,
    disconnect,
    wallet,
    signer,
    address,
    balance,
    formattedAddress,
    isConnected: !!wallet,
    isReady,
    refreshWallet,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletContext() {
  const value = useContext(WalletContext);
  if (!value) {
    throw new Error('useWallet must be used inside WalletProvider');
  }
  return value;
}

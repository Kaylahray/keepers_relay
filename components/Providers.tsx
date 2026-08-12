'use client';

import { useMemo, useState } from 'react';
import { Provider } from '@ckb-ccc/connector-react';
import { QueryClientProvider } from '@tanstack/react-query';
import { WalletProvider } from '@/context/wallet-provider';
import { getCkbClient } from '@/lib/ckb/client';
import { makeQueryClient } from '@/lib/queryClient';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());
  const defaultClient = useMemo(() => getCkbClient(), []);

  return (
    <Provider defaultClient={defaultClient}>
      <QueryClientProvider client={queryClient}>
        <WalletProvider>{children}</WalletProvider>
      </QueryClientProvider>
    </Provider>
  );
}

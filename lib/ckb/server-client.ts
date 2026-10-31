import { ccc } from '@ckb-ccc/core';

/** Server-only CKB client. */
export function getServerCkbClient(): ccc.Client {
  const network = process.env.NEXT_PUBLIC_CKB_NETWORK ?? 'testnet';
  const rpcUrl = process.env.NEXT_PUBLIC_CKB_RPC_URL;

  if (network === 'mainnet') {
    return rpcUrl
      ? new ccc.ClientPublicMainnet({ url: rpcUrl })
      : new ccc.ClientPublicMainnet();
  }

  return rpcUrl
    ? new ccc.ClientPublicTestnet({ url: rpcUrl })
    : new ccc.ClientPublicTestnet();
}

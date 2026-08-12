import { ccc } from '@ckb-ccc/connector-react';

/** Default to public testnet; override with NEXT_PUBLIC_CKB_NETWORK / RPC_URL later. */
export function getCkbClient(): ccc.Client {
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

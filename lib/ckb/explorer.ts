/** Nervos explorer links for confirming on-chain event transitions. */

export function ckbTxExplorerUrl(txHash: string): string {
  const network = process.env.NEXT_PUBLIC_CKB_NETWORK ?? 'testnet';
  const host =
    network === 'mainnet'
      ? 'https://explorer.nervos.org'
      : 'https://pudge.explorer.nervos.org';
  const hash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  return `${host}/transaction/${hash}`;
}

export function shortTxHash(txHash: string): string {
  const hash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  if (hash.length < 20) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

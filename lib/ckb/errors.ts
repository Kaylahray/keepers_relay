/** What to show for a failed chain request: raw node errors become plain words, anything already written for players stays. */
export function plainChainError(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : '';
  if (!text) return fallback;
  if (/Failed to fetch|fetch failed|NetworkError|timed? ?out/i.test(text)) {
    return 'Could not reach the chain. Check your connection and try again.';
  }
  const short = /Insufficient CKB, need ([\d.]+) extra CKB/i.exec(text);
  if (short) {
    const need = Math.ceil(Number(short[1]));
    return `Your wallet needs about ${need.toLocaleString('en-US')} more CKB for this. Nothing was spent. Add CKB to your wallet and try again.`;
  }
  if (/User (rejected|cancel)|Popup closed|cancel+ed by user/i.test(text)) {
    return 'You closed the wallet before approving. Nothing was spent.';
  }
  if (/Client request error|TransactionFailedToVerify|TransactionScriptError|Inputs\[\d+\]|error code -?\d+|Internal error/i.test(text)) {
    return 'The chain is still catching up, so it turned that down. Nothing was spent. Give it a few seconds and try again.';
  }
  return text;
}

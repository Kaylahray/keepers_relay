import { ckbTxExplorerUrl, shortTxHash } from '@/lib/ckb/explorer';
import type { CrownSeal } from '@/lib/crown/rooms';

/** Same idea as the old quiz tag: a link only when a real transaction exists. */
export function VerifiedSeal({ seal }: { seal: CrownSeal }) {
  if (!seal.txHash) {
    return (
      <p className="font-mono text-[10px] uppercase leading-relaxed opacity-70">
        {seal.label} · proof is local · no transaction yet
      </p>
    );
  }
  const payment = seal.label === 'Close';
  const word = payment ? 'Payment' : seal.label === 'Steal' ? 'Steal' : seal.label;
  return (
    <a
      href={ckbTxExplorerUrl(seal.txHash)}
      target="_blank"
      rel="noreferrer"
      className={`font-mono font-bold uppercase hover:underline ${payment ? 'text-sm text-[#e1bf47]' : 'text-[10px] text-[#99ee2d]'}`}
    >
      {word} on CKB · {shortTxHash(seal.txHash)} ↗
    </a>
  );
}

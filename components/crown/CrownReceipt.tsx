'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ckbWhole, type CrownRoom } from '@/lib/crown/rooms';

/**
 * The card you post after losing.
 *
 * A result anyone has to take on trust is a screenshot. A result with the transaction on it is
 * evidence — whoever you send it to can paste that hash into the checker and watch the whole
 * match replay from chain. That is the only reason this exists: to make the brag and the proof
 * the same object.
 */

function held(room: CrownRoom): string | null {
  if (room.openedAt == null || room.deadlineAt == null) return null;
  const ms = Math.max(0, room.deadlineAt - room.openedAt);
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return minutes > 0 ? `${minutes}m${seconds.toString().padStart(2, '0')}s` : `${seconds}s`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}…${hash.slice(-8)}`;
}

export function CrownReceipt({ room, youWon }: { room: CrownRoom; youWon: boolean }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const txHash = room.matchOutPoint?.txHash ?? null;
  if (!txHash) return null;

  const verifyPath = `/verify/${txHash}`;
  const verifyUrl = typeof window === 'undefined' ? verifyPath : `${window.location.origin}${verifyPath}`;
  const span = held(room);
  const rounds = Math.max(0, room.round - 1);
  const fileName = `crown-${txHash.slice(2, 10)}.png`;

  async function savePng() {
    if (!cardRef.current || busy) return;
    setBusy(true);
    try {
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#111111',
      });
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch {
      // The export is a nicety. Losing it should not break the page.
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 max-w-md">
      <div ref={cardRef} className="rounded-2xl bg-ink p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#99ee2d]">
          Crowns · settled
        </p>

        <p className="mt-3 font-poster text-2xl font-black uppercase leading-tight text-white">
          {youWon ? 'I held the crown' : rounds > 0 ? 'The crown was taken' : 'Nobody took the crown'}
        </p>

        <p className="mt-4 text-sm leading-relaxed text-white/70">
          {room.title}
          {span ? <> · the clock ran {span}</> : null}
          {rounds > 0 ? (
            <>
              {' '}
              · {rounds} {rounds === 1 ? 'crown' : 'crowns'} taken
            </>
          ) : null}
        </p>

        <div className="mt-5 flex items-end gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">Prize</p>
            <p className="font-poster text-3xl leading-none text-[#e1bf47]">
              {ckbWhole(room.potShannons)} CKB
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/40">Best score</p>
            <p className="font-mono text-sm text-white">{room.king ?? 'nobody yet'}</p>
          </div>
        </div>

        <p className="mt-5 border-t border-white/10 pt-4 font-mono text-[10px] leading-relaxed text-white/45">
          Nobody was asked to believe this. Replay it from the chain:
        </p>
        <p className="mt-1 break-all font-mono text-[10px] text-[#99ee2d]">{verifyUrl}</p>
        <p className="mt-2 break-all font-mono text-[9px] text-white/30">{shortHash(txHash)}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => void savePng()} disabled={busy}>
          {busy ? 'Rendering…' : 'Save card'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copyLink()}>
          {copied ? 'Copied' : 'Copy proof link'}
        </Button>
      </div>
    </div>
  );
}

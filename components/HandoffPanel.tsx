'use client';

import { useState } from 'react';
import { Hand, Loader2 } from 'lucide-react';
import { useSigner } from '@ckb-ccc/connector-react';
import {
  useAcceptHandoff,
  useDeclineHandoff,
  useHandoffsQuery,
  useRequestHandoff,
} from '@/hooks/useCommunity';
import { useNominateNextKeeper } from '@/hooks/useHome';
import { useWallet } from '@/hooks/useWallet';
import { useChainQuery } from '@/hooks/useChain';
import { chainCellConfigured } from '@/lib/registry/config';
import { handoffChainCell } from '@/lib/registry/chain-cell';

/** Members request the Cell; the holder accepts / declines / nominates next. */
export function HandoffPanel({
  journeyId,
  isHolder,
  canRequest,
}: {
  journeyId: string;
  isHolder: boolean;
  canRequest: boolean;
}) {
  const { address } = useWallet();
  const signer = useSigner();
  const chain = useChainQuery().data;
  const handoffs = useHandoffsQuery(journeyId);
  const request = useRequestHandoff();
  const accept = useAcceptHandoff();
  const decline = useDeclineHandoff();
  const nominate = useNominateNextKeeper();
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const pending = handoffs.data ?? [];
  const myPending = pending.find((r) => r.requesterAddress === address);
  const nominatedName = chain?.id === journeyId ? chain.nominatedNext?.name : null;

  return (
    <section className="rounded-2xl border border-white/15 bg-[#15121d] p-4 text-white">
      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
        <Hand className="h-3.5 w-3.5" />
        Who wants it next
      </p>

      {canRequest && !isHolder && (
        <div className="mt-3">
          {myPending ? (
            <p className="text-xs font-medium text-white/75">
              You asked to receive this Cell — waiting on the holder.
            </p>
          ) : (
            <>
              <label className="block text-xs font-medium text-white/80">
                Ask to hold next
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={120}
                  placeholder="Optional note"
                  className="mt-1 w-full rounded-lg border border-white/15 bg-white/5 px-2 py-2 text-sm font-medium text-white outline-none placeholder:text-white/35"
                />
              </label>
              <button
                type="button"
                disabled={!address || request.isPending}
                onClick={() =>
                  address &&
                  request.mutate({ address, journeyId, note: note.trim() || undefined })
                }
                className="arena-cta mt-2 rounded px-3 py-2 text-[10px] font-bold uppercase disabled:opacity-40"
              >
                {request.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Request this Cell'
                )}
              </button>
              {request.error && (
                <p className="mt-2 text-xs font-bold text-[#ff56f6]">{request.error.message}</p>
              )}
            </>
          )}
        </div>
      )}

      {isHolder && (
        <div className="mt-3 space-y-2">
          {nominatedName ? (
            <p className="rounded-lg border border-[#ff56f6]/40 bg-[#ff56f6]/15 px-2 py-1.5 text-xs font-medium">
              Soft promise: next up is <strong>{nominatedName}</strong>. They can draft a mark on
              home.
            </p>
          ) : null}
          {pending.length === 0 ? (
            <p className="text-xs font-medium text-white/55">
              No requests yet. Seal your mark first, then you can pass to a requester.
            </p>
          ) : (
            pending.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 p-2.5"
              >
                <div>
                  <p className="text-xs font-bold uppercase text-white">{item.requesterName}</p>
                  {item.note && (
                    <p className="mt-0.5 text-[11px] font-medium text-white/55">{item.note}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={nominate.isPending || !address}
                    onClick={() =>
                      address &&
                      nominate.mutate({
                        address,
                        journeyId,
                        nomineeAddress: item.requesterAddress,
                      })
                    }
                    className="rounded border border-[#e1bf47]/50 bg-[#e1bf47]/15 px-2 py-1 text-[9px] font-bold uppercase text-[#e1bf47]"
                  >
                    Promise next
                  </button>
                  <button
                    type="button"
                    disabled={accept.isPending || signing || !address}
                    onClick={() => {
                      if (!address) return;
                      void (async () => {
                        setSignError(null);
                        try {
                          if (
                            chain?.id === journeyId &&
                            chain.cellOutPoint &&
                            chainCellConfigured()
                          ) {
                            if (!signer) throw new Error('Connect your wallet to pass on-chain.');
                            setSigning(true);
                            const minted = await handoffChainCell(signer, {
                              liveOutPoint: chain.cellOutPoint,
                              recipient: item.requesterAddress,
                            });
                            accept.mutate({
                              address,
                              requestId: item.id,
                              cellOutPoint: minted.cellOutPoint,
                              txHash: minted.txHash,
                              expiresAt: minted.expiresAt,
                            });
                          } else {
                            accept.mutate({ address, requestId: item.id });
                          }
                        } catch (err) {
                          setSignError(err instanceof Error ? err.message : String(err));
                        } finally {
                          setSigning(false);
                        }
                      })();
                    }}
                    className="arena-cta rounded px-2 py-1 text-[9px] font-bold uppercase"
                  >
                    Pass to them
                  </button>
                  <button
                    type="button"
                    disabled={decline.isPending || !address}
                    onClick={() =>
                      address && decline.mutate({ address, requestId: item.id })
                    }
                    className="rounded border border-white/25 px-2 py-1 text-[9px] font-bold uppercase text-white/70"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
          {(accept.error || decline.error || nominate.error || signError) && (
            <p className="text-xs font-bold text-[#ff56f6]">
              {signError ??
                accept.error?.message ??
                decline.error?.message ??
                nominate.error?.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

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
import { useWallet } from '@/hooks/useWallet';
import { useChainQuery } from '@/hooks/useChain';
import { chainCellConfigured } from '@/lib/registry/config';
import { handoffChainCell, hexToBytes } from '@/lib/registry/chain-cell';
import { normalizeArtifactRoot, ZERO_ARTIFACT_ROOT } from '@/lib/artifact-commit';

/** Members request the Cell; the holder accepts / declines. */
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
  const [note, setNote] = useState('');
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const pending = handoffs.data ?? [];
  const myPending = pending.find((r) => r.requesterAddress === address);

  return (
    <section className="border-[3px] border-black bg-[#fff8e7] p-4 text-black">
      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
        <Hand className="h-3.5 w-3.5 stroke-[3]" />
        Community handoffs
      </p>

      {canRequest && !isHolder && (
        <div className="mt-3">
          {myPending ? (
            <p className="text-xs font-semibold">
              You asked to receive this Cell — waiting on the holder.
            </p>
          ) : (
            <>
              <label className="block text-xs font-semibold">
                Ask to hold next
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={120}
                  placeholder="Optional note"
                  className="mt-1 w-full border-2 border-black bg-white px-2 py-2 text-sm font-semibold"
                />
              </label>
              <button
                type="button"
                disabled={!address || request.isPending}
                onClick={() =>
                  address &&
                  request.mutate({ address, journeyId, note: note.trim() || undefined })
                }
                className="neo-button mt-2 bg-[#d6ff00] px-3 py-2 text-[10px] font-black uppercase disabled:opacity-40"
              >
                {request.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Request this Cell'
                )}
              </button>
              {request.error && (
                <p className="mt-2 text-xs font-bold text-red-800">{request.error.message}</p>
              )}
            </>
          )}
        </div>
      )}

      {isHolder && (
        <div className="mt-3 space-y-2">
          {pending.length === 0 ? (
            <p className="text-xs font-semibold text-black/70">
              No requests yet. Seal your mark first, then you can pass to a requester.
            </p>
          ) : (
            pending.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-2 border-black bg-white p-2.5"
              >
                <div>
                  <p className="text-xs font-black uppercase">{item.requesterName}</p>
                  {item.note && (
                    <p className="mt-0.5 text-[11px] font-semibold text-black/70">{item.note}</p>
                  )}
                </div>
                <div className="flex gap-1.5">
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
                            const pendingRoot = normalizeArtifactRoot(chain.artifactRoot);
                            const artifactRoot =
                              pendingRoot === ZERO_ARTIFACT_ROOT
                                ? undefined
                                : hexToBytes(pendingRoot);
                            const minted = await handoffChainCell(signer, {
                              liveOutPoint: chain.cellOutPoint,
                              recipient: item.requesterAddress,
                              creatorAddress: chain.creatorAddress,
                              mode: chain.mode,
                              artifactRoot,
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
                    className="border-2 border-black bg-[#d6ff00] px-2 py-1 text-[9px] font-black uppercase"
                  >
                    Pass to them
                  </button>
                  <button
                    type="button"
                    disabled={decline.isPending || !address}
                    onClick={() =>
                      address && decline.mutate({ address, requestId: item.id })
                    }
                    className="border-2 border-black px-2 py-1 text-[9px] font-black uppercase"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))
          )}
          {(accept.error || decline.error || signError) && (
            <p className="text-xs font-bold text-red-800">
              {signError ?? accept.error?.message ?? decline.error?.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

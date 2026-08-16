'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, WalletMinimal } from 'lucide-react';
import { useMyBuilder, useUpsertBuilder, useUsernameCheck } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { normalizeUsername } from '@/lib/rewards/milestones';
import { registryConfigured } from '@/lib/registry/config';
import { estimateUsernameCapacityCkb } from '@/lib/registry/capacity';

/** One on-chain action: claim @handle. Profile / pledge live in Studio later. */
export function JoinHandleForm({ nextHref = '/' }: { nextHref?: string }) {
  const router = useRouter();
  const { isConnected, address, formattedAddress, connect, isReady } = useWallet();
  const myBuilder = useMyBuilder();
  const upsert = useUpsertBuilder();
  const { claim, username: onChainUsername } = useUsername();

  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyHasHandle = Boolean(onChainUsername?.username || myBuilder.data?.builder?.onboarded);
  const check = useUsernameCheck(username);
  const normalized = normalizeUsername(username);
  const capacityHint =
    normalized.length >= 3 ? `~${estimateUsernameCapacityCkb(normalized).toFixed(2)} CKB` : null;
  const usernameOk = check.data?.available === true;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!address || busy || alreadyHasHandle) return;
    if (!usernameOk) return;
    if (!registryConfigured()) {
      setError('Couldn’t reach the username registry. Try again in a moment.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const handle = (await claim(normalized)).username;
      await upsert.mutateAsync({
        address,
        username: handle,
        displayName: handle,
      });
      router.push(nextHref);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Username claim failed.');
    } finally {
      setBusy(false);
    }
  }

  if (!isReady) {
    return (
      <p className="border-[3px] border-black bg-[#fff8e7] px-4 py-3 text-sm font-semibold">
        Checking wallet…
      </p>
    );
  }

  if (!isConnected) {
    return (
      <button
        type="button"
        onClick={() => connect()}
        className="neo-button flex w-full items-center justify-center gap-2 bg-[#d6ff00] px-4 py-3.5 text-sm font-black uppercase"
      >
        <WalletMinimal className="h-4 w-4 stroke-[3]" />
        Connect wallet first
      </button>
    );
  }

  if (alreadyHasHandle) {
    return (
      <div className="border-[3px] border-black bg-[#d6ff00] p-5">
        <p className="text-[10px] font-black uppercase tracking-wider">You’re in</p>
        <p className="mt-2 font-poster text-3xl uppercase leading-none">
          @{onChainUsername?.username || myBuilder.data?.builder?.username}
        </p>
        <p className="mt-3 text-sm font-semibold">Add a bio, avatar, and pledge in Studio anytime.</p>
        <button
          type="button"
          onClick={() => router.push(nextHref)}
          className="neo-button mt-4 bg-[#224cff] px-4 py-3 text-xs font-black uppercase text-[#fff8e7]"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <p className="font-mono text-[10px] font-bold text-black/60">{formattedAddress || address}</p>
      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-[0.16em]">On-chain username</span>
        <div className="relative mt-2">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm font-bold">
            @
          </span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            maxLength={32}
            placeholder="your_handle"
            className="w-full border-[3px] border-black bg-[#fff8e7] py-3 pl-8 pr-3 text-sm font-semibold outline-none focus:bg-white"
            required
            disabled={busy}
            autoComplete="off"
          />
        </div>
        {username.length >= 3 && check.data && (
          <p
            className={`mt-1 text-[10px] font-bold ${
              check.data.available ? 'text-green-800' : 'text-red-800'
            }`}
          >
            {check.data.available
              ? `@${check.data.username} is available${capacityHint ? ` · locks ${capacityHint}` : ''}`
              : check.data.reason}
          </p>
        )}
      </label>
      {error && (
        <p role="alert" className="text-sm font-bold text-red-800">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !usernameOk}
        className="neo-button flex w-full items-center justify-center gap-2 bg-[#224cff] px-4 py-3.5 text-sm font-black uppercase text-[#fff8e7] disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 stroke-[3]" />}
        {busy ? 'Waiting for wallet…' : 'Claim @handle (one signature)'}
      </button>
      <p className="text-[11px] font-semibold text-black/65">
        You’ll sign once. Profile text and images are optional later in Studio — a second cell, a
        second signature, only if you want them.
      </p>
    </form>
  );
}

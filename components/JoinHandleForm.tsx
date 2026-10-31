'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Fingerprint, X } from 'lucide-react';
import { Avatar } from '@/components/duel/Avatar';
import { Button } from '@/components/ui/Button';
import { Stepper } from '@/components/ui/kit';
import { useAuth } from '@/context/auth-provider';
import { useMyBuilder, useUpsertBuilder, useUsernameCheck } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { ART } from '@/lib/art';
import { normalizeUsername } from '@/lib/rewards/milestones';
import { registryConfigured } from '@/lib/registry/config';
import { estimateUsernameCapacityCkb } from '@/lib/registry/capacity';

/** Joining in three steps: connect (JoinID, no password), claim @handle in one on-chain action, then a picture. */
export function JoinHandleForm({ nextHref = '/' }: { nextHref?: string }) {
  const router = useRouter();
  const { isConnected, address, formattedAddress, isReady } = useWallet();
  const { ensureAuth, busy: authBusy } = useAuth();
  const myBuilder = useMyBuilder();
  const upsert = useUpsertBuilder();
  const { claim, username: onChainUsername } = useUsername();

  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claimed = onChainUsername?.username || (myBuilder.data?.builder?.onboarded ? myBuilder.data.builder.username : null) || null;
  const check = useUsernameCheck(username);
  const normalized = normalizeUsername(username);
  const capacityHint = normalized.length >= 3 ? `~${estimateUsernameCapacityCkb(normalized).toFixed(2)} CKB` : null;
  const usernameOk = check.data?.available === true;
  const step = !isConnected ? 0 : claimed ? 2 : 1;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!address || busy || claimed) return;
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

  return (
    <div className="mx-auto w-full max-w-lg">
      <Stepper steps={['Connect', 'Username', 'Picture']} current={step} tone="lime" />

      {!isReady ? (
        <p className="mt-8 text-center text-mute">Checking wallet…</p>
      ) : step === 0 ? (
        <div className="mt-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ART.hero} alt="Crowns players facing off" className="clip-panel aspect-[16/10] w-full object-cover" />
          <h1 className="mt-8 font-poster text-3xl font-black uppercase">Join Crowns</h1>
          <p className="mx-auto mt-3 max-w-sm text-mute">No password or seed phrase needed: JoyID uses your phone&apos;s fingerprint or face to sign you in.</p>
          <Button variant="pink" size="xl" block className="mt-8" disabled={authBusy} onClick={() => void ensureAuth().catch(() => undefined)}>
            <Fingerprint className="h-5 w-5" aria-hidden="true" /> {authBusy ? 'Opening your wallet…' : 'Connect with JoyID'}
          </Button>
        </div>
      ) : step === 1 ? (
        <form onSubmit={(e) => void submit(e)} className="mt-8">
          <h1 className="font-poster text-2xl font-black uppercase">Claim your username</h1>
          <p className="mt-2 text-mute">This is how other players find and challenge you.</p>
          <p className="mt-1 font-mono text-[11px] text-mute">{formattedAddress || address}</p>
          <label htmlFor="handle" className="sr-only">
            Username
          </label>
          <div className="relative mt-6">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-mute">@</span>
            <input
              id="handle"
              value={username}
              autoFocus
              autoComplete="off"
              maxLength={32}
              onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s/g, ''))}
              placeholder="your_handle"
              aria-describedby="handle-status"
              disabled={busy}
              className="h-16 w-full rounded-xl bg-ink-2 pl-10 pr-12 text-xl font-semibold text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-lime"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2">
              {username.length >= 3 && check.data ? (
                check.data.available ? <Check className="h-6 w-6 text-lime" aria-hidden="true" /> : <X className="h-6 w-6 text-danger" aria-hidden="true" />
              ) : null}
            </span>
          </div>
          <p id="handle-status" className="mt-2 min-h-5 text-sm" aria-live="polite">
            {username.length > 0 && username.length < 3 ? <span className="text-mute">At least 3 letters</span> : null}
            {username.length >= 3 && !check.data ? <span className="text-mute">Checking…</span> : null}
            {username.length >= 3 && check.data ? (
              check.data.available ? (
                <span className="text-lime">
                  @{check.data.username} is yours to take{capacityHint ? ` · locks ${capacityHint}, returned if you ever give it up` : ''}
                </span>
              ) : (
                <span className="text-danger">{check.data.reason}</span>
              )
            ) : null}
          </p>
          {error ? (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" block className="mt-8" disabled={busy || !usernameOk}>
            {busy ? 'Waiting for your wallet…' : `Claim @${normalized || 'handle'}`}
          </Button>
          <p className="mt-3 text-center text-xs text-mute">One signature. Your picture and bio are optional, later, from your profile.</p>
        </form>
      ) : (
        <div className="mt-8">
          <div className="flex items-center gap-4">
            <Avatar name={`@${claimed}`} tone="#99ee2d" size={80} />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-lime">You&apos;re in</p>
              <h1 className="font-poster text-2xl font-black uppercase">@{claimed}</h1>
              <p className="mt-1 text-sm text-mute">This drawn face is yours. Mint your own picture any time from your profile.</p>
            </div>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Button size="xl" block onClick={() => router.push(nextHref)}>
              Start playing
            </Button>
            <Button variant="ghost" size="xl" block href="/profile/edit">
              Pick a picture
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

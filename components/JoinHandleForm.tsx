'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Fingerprint, Loader2, X } from 'lucide-react';
import { EASE } from '@/components/crowns/motion';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/context/auth-provider';
import { useMyBuilder, useUpsertBuilder, useUsernameCheck } from '@/hooks/useBuilder';
import { useUsername } from '@/hooks/useUsername';
import { useWallet } from '@/hooks/useWallet';
import { IMG } from '@/lib/crowns/art';
import { normalizeUsername } from '@/lib/rewards/milestones';
import { registryConfigured } from '@/lib/registry/config';
import { estimateUsernameCapacityCkb } from '@/lib/registry/capacity';

type Status = 'empty' | 'short' | 'checking' | 'available' | 'taken';

function Label({ children }: { children: string }) {
  return <p className="font-display text-sm font-extrabold uppercase tracking-wider text-fog">{children}</p>;
}

function StatusIcon({ status }: { status: Status }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={status}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.15, ease: EASE }}
        className="grid h-10 w-10 shrink-0 place-items-center"
      >
        {status === 'available' ? (
          <span className="grid h-10 w-10 place-items-center rounded-full bg-lime text-ink">
            <Check className="h-6 w-6" strokeWidth={3.5} aria-hidden="true" />
          </span>
        ) : status === 'taken' ? (
          <span className="grid h-10 w-10 place-items-center rounded-full bg-pink text-ink">
            <X className="h-6 w-6" strokeWidth={3.5} aria-hidden="true" />
          </span>
        ) : status === 'checking' ? (
          <Loader2 className="h-7 w-7 animate-spin text-fog" aria-hidden="true" />
        ) : null}
      </motion.span>
    </AnimatePresence>
  );
}

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
  const status: Status = !username ? 'empty' : username.length < 3 ? 'short' : !check.data ? 'checking' : check.data.available ? 'available' : 'taken';

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
      setError(e instanceof Error ? e.message : 'That name couldn’t be saved.');
    } finally {
      setBusy(false);
    }
  }

  const kicker = step === 0 ? 'Join Crowns' : step === 1 ? 'Wallet connected' : 'You’re in';
  const title =
    step === 0 ? (
      <>
        Get on
        <br />
        the grid.
      </>
    ) : step === 1 ? (
      <>
        Pick your
        <br />
        race name.
      </>
    ) : (
      <>@{claimed}</>
    );

  return (
    <div className="relative isolate">
      <div className="absolute inset-x-0 top-0 -z-10 h-[360px] overflow-hidden sm:h-[460px] lg:inset-y-0 lg:left-auto lg:right-0 lg:h-auto lg:w-[52%]">
        <motion.img
          src={IMG.garage}
          alt=""
          initial={{ scale: 1.08, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="h-full w-full object-cover object-[55%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent lg:bg-gradient-to-r lg:from-ink lg:via-ink/30" />
      </div>

      <div className="mx-auto grid max-w-[1440px] px-5 pb-16 pt-[220px] sm:px-8 sm:pt-[300px] lg:min-h-[760px] lg:grid-cols-[minmax(0,620px)_1fr] lg:items-center lg:pt-16">
        <div className="min-w-0">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="font-display text-xl font-extrabold uppercase text-lime"
          >
            {kicker}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: 0.04 }}
            className={`mt-2 break-words font-display font-black leading-[0.85] ${step === 2 ? 'text-[56px] sm:text-[80px]' : 'text-[60px] uppercase sm:text-[88px]'}`}
          >
            {title}
          </motion.h1>

          {!isReady ? (
            <p className="mt-10 text-fog">Signing you in…</p>
          ) : step === 0 ? (
            <div className="mt-8">
              <p className="max-w-md text-lg text-chalk/85">No password or seed phrase. JoyID uses your phone&apos;s fingerprint or face to sign you in.</p>
              <Button size="xl" className="mt-8 w-full sm:w-auto" disabled={authBusy} onClick={() => void ensureAuth().catch(() => undefined)}>
                <Fingerprint className="h-6 w-6" aria-hidden="true" /> {authBusy ? 'Signing you in…' : 'Connect with JoyID'}
              </Button>
            </div>
          ) : step === 1 ? (
            <form onSubmit={(e) => void submit(e)}>
              <p className="mt-3 font-mono text-sm text-fog">{formattedAddress || address}</p>
              <div className="mt-8">
                <label htmlFor="handle" className="sr-only">
                  Race name
                </label>
                <div
                  className={`flex items-center gap-1 rounded-3xl border-2 bg-ink-2/90 px-5 backdrop-blur transition-colors duration-150 sm:px-6 ${
                    status === 'available' ? 'border-lime' : status === 'taken' ? 'border-pink' : 'border-line focus-within:border-chalk/50'
                  }`}
                >
                  <span className="font-display text-5xl font-black text-fog sm:text-6xl">@</span>
                  <input
                    id="handle"
                    value={username}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={32}
                    onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="yourname"
                    aria-describedby="handle-status"
                    disabled={busy}
                    className="h-20 min-w-0 flex-1 bg-transparent font-display text-5xl font-black text-chalk outline-none placeholder:text-ink-3 sm:h-24 sm:text-6xl"
                  />
                  <StatusIcon status={status} />
                </div>
                <p
                  id="handle-status"
                  aria-live="polite"
                  className={`mt-3 min-h-6 font-semibold ${status === 'available' ? 'text-lime' : status === 'taken' ? 'text-pink' : 'text-fog'}`}
                >
                  {status === 'empty'
                    ? 'At least 3 letters, numbers or _'
                    : status === 'short'
                      ? 'At least 3 letters'
                      : status === 'checking'
                        ? 'Checking…'
                        : status === 'available'
                          ? `@${check.data!.username} is yours if you want it.${capacityHint ? ` It locks ${capacityHint}, returned if you ever give it up.` : ''}`
                          : check.data!.reason}
                </p>
              </div>

              <div className="mt-8">
                <Label>On the leaderboard</Label>
                <motion.div layout className="mt-3 flex items-center gap-4 rounded-2xl border border-line bg-ink-2/90 px-4 py-3.5 backdrop-blur">
                  <span className="font-display text-2xl font-black text-fog">#–</span>
                  <Avatar name={`@${normalized || 'yourname'}`} size={44} src={null} />
                  <span className="min-w-0 flex-1 truncate font-display text-2xl font-extrabold">@{normalized || 'yourname'}</span>
                  <span className="font-display text-xl font-black text-fog">0 CKB</span>
                </motion.div>
              </div>

              {error ? (
                <p role="alert" className="mt-6 flex items-start gap-2 rounded-2xl bg-danger/10 p-4 text-danger">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="xl" className="mt-10 w-full sm:w-auto" disabled={busy || !usernameOk}>
                {busy ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> Confirm to sign in…
                  </>
                ) : (
                  'Pick your name'
                )}
              </Button>
              <p className="mt-4 text-sm text-fog">One signature. Add a picture and bio later from your profile. Your name stays.</p>
            </form>
          ) : (
            <div className="mt-8">
              <div className="flex items-center gap-4">
                <Avatar name={`@${claimed}`} size={80} src={null} />
                <p className="max-w-sm text-lg text-chalk/85">This face is yours for now. Create your own picture any time from your profile.</p>
              </div>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Button size="xl" onClick={() => router.push(nextHref)}>
                  Start racing
                </Button>
                <Button variant="ghost" size="xl" href="/profile/edit">
                  Pick a picture
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

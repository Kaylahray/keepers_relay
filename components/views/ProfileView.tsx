"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Gem, Pencil, WalletMinimal } from "lucide-react";
import { ago, CkbAmount } from "@/components/crowns/Board";
import { EASE } from "@/components/crowns/motion";
import { ArenaStage } from "@/components/ui/ArenaStage";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ChainLoader } from "@/components/ui/ChainLoader";
import { EmptyState } from "@/components/ui/kit";
import { TrophyCard } from "@/components/rally/TrophyCard";
import { getCkbClient } from "@/lib/ckb/client";
import { IMG, MAP_IMG } from "@/lib/crowns/art";
import { mapName } from "@/lib/rally/rules";
import type { RaceResult } from "@/lib/rally/stats";
import { findTrophies, realTrophies } from "@/lib/rally/trophy";
import { ccc } from "@ckb-ccc/connector-react";
import { CharacterAvatar } from "@/components/CharacterPicker";
import { builderKeys } from "@/hooks/useBuilder";
import { useUsername } from "@/hooks/useUsername";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/context/auth-provider";
import { loadAvatarSpore } from "@/hooks/usePublicProfile";
import { getBuilder } from "@/lib/api/keeperApi";
import {
  ckbWhole,
  NO_TALLY,
  useLockHashes,
  useRallyStats,
} from "@/hooks/useRallyStats";

function Label({ children, className = "" }: { children: string; className?: string }) {
  return (
    <p className={`font-display text-sm font-extrabold uppercase tracking-wider text-fog ${className}`}>
      {children}
    </p>
  );
}

/** One player's finished races: where, how many cars, and what they won or put in. */
function PlayerRaces({ races, me }: { races: RaceResult[]; me: string }) {
  return (
    <ul className="mt-4 divide-y divide-line border-y border-line">
      {races.map((race) => {
        const share = race.winners.find((winner) => winner.owner === me)?.share;
        const refunded = race.winners.length === 0;
        return (
          <li key={race.txHash}>
            <Link
              href={`/rally/${race.matchId}`}
              className="flex items-center gap-4 py-3.5 transition-colors duration-150 hover:text-lime"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={MAP_IMG[race.map]} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-xl font-extrabold leading-none">{mapName(race.map)}</p>
                <p className="mt-1 text-sm text-fog">
                  {race.players.length} cars · {ago(race.endedMs)}
                </p>
              </div>
              <span className={`font-display text-2xl font-black ${share ? "text-gold" : "text-fog"}`}>
                {share ? "Won" : refunded ? "Refund" : "Raced"}
              </span>
              <span
                className={`w-24 text-right font-display text-xl font-black ${share ? "text-lime" : "text-fog"}`}
              >
                {share ? `+${ckbWhole(share)}` : refunded || race.entry === "0" ? "±0" : `−${ckbWhole(race.entry)}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A player's profile: who they are, and the trophies they have won. `me` is the connected wallet. */
export function ProfileView({ address }: { address: string }) {
  const { isConnected, address: walletAddress, isReady } = useWallet();
  const { ensureAuth } = useAuth();
  const { username: onChainUsername } = useUsername();
  const [copied, setCopied] = useState(false);

  const wallet = walletAddress?.toLowerCase() ?? "";
  const target =
    address === "me" ? wallet : decodeURIComponent(address).toLowerCase();
  const isSelf = Boolean(wallet && target === wallet);

  const builder = useQuery({
    queryKey: builderKeys.one(target || "anon"),
    queryFn: () => getBuilder(target),
    enabled: Boolean(target),
    staleTime: 5_000,
  });
  const profile = builder.data?.builder ?? null;
  const stats = useRallyStats();
  const lockHashes = useLockHashes(target ? [target] : []);
  const lockHash = lockHashes.data?.[target] ?? null;
  const tally = (lockHash && stats.data?.players[lockHash]) || NO_TALLY;
  // Trophy Spores in this wallet, kept only when the race they name paid this wallet as winner.
  const trophySpores = useQuery({
    queryKey: ["trophies", target],
    enabled: Boolean(target),
    queryFn: async () =>
      findTrophies(
        getCkbClient(),
        (await ccc.Address.fromString(target, getCkbClient())).script,
      ),
  });
  const trophies =
    lockHash && stats.data
      ? realTrophies(trophySpores.data ?? [], stats.data.races, lockHash)
      : [];
  const myRaces = lockHash
    ? (stats.data?.races ?? []).filter((race) =>
        race.players.includes(lockHash),
      )
    : [];
  const avatar = useQuery({
    queryKey: ["avatar-spore", profile?.avatarSporeId],
    enabled: Boolean(profile?.avatarSporeId),
    queryFn: () => loadAvatarSpore(profile!.avatarSporeId!),
  });

  if (!isReady) {
    return (
      <ArenaStage>
        <ChainLoader title="Loading the profile…" />
      </ArenaStage>
    );
  }

  if (address === "me" && !isConnected) {
    return (
      <ArenaStage>
        <EmptyState
          title="Connect to view"
          body="Your profile and picture are tied to your account."
          action={
            <Button
              variant="lime"
              size="lg"
              onClick={() => void ensureAuth().catch(() => undefined)}
            >
              <WalletMinimal className="h-4 w-4" />
              Sign in
            </Button>
          }
        />
      </ArenaStage>
    );
  }

  const handle =
    profile?.username || (isSelf ? onChainUsername?.username : null) || null;
  const displayName =
    profile?.displayName ||
    (handle ? `@${handle}` : null) ||
    (isSelf ? "You" : `${target.slice(0, 10)}…`);
  // The banner is the track they've raced most, or the harbour.
  const counts = [0, 0, 0];
  for (const race of myRaces) counts[race.map] = (counts[race.map] ?? 0) + 1;
  const home = myRaces.length ? counts.indexOf(Math.max(...counts)) : 0;
  const loading = stats.isLoading || lockHashes.isLoading;

  return (
    <ArenaStage>
      <section>
        <div className="relative h-40 overflow-hidden rounded-3xl sm:h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MAP_IMG[home]} alt="" className="h-full w-full object-cover object-[center_70%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
        </div>
        <div className="relative -mt-14 flex flex-col gap-5 px-1 sm:-mt-20 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-ink bg-ink-3"
            >
              {avatar.data?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar.data.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : profile?.characterId ? (
                <div className="flex h-full items-center justify-center">
                  <CharacterAvatar characterId={profile.characterId} size="lg" />
                </div>
              ) : (
                <Avatar
                  name={handle ? `@${handle}` : displayName}
                  tone="#99ee2d"
                  size={120}
                  src={profile?.avatarSporeId && avatar.isPending ? undefined : null}
                />
              )}
            </motion.div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-5xl font-black leading-none sm:text-7xl">
                {displayName}
              </h1>
              {profile?.displayName && handle ? (
                <p className="mt-1 font-display text-xl font-extrabold text-fog">@{handle}</p>
              ) : null}
              {profile?.headline ? (
                <p className="mt-2 text-lg text-chalk/85">{profile.headline}</p>
              ) : isSelf ? (
                <p className="mt-2 text-fog">
                  {handle ? "Add a bio in Edit profile." : "No @name yet."}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(target);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-ink-2 px-3 py-1.5 font-mono text-sm text-fog transition-colors duration-150 hover:text-chalk"
              >
                {target.slice(0, 7)}…{target.slice(-4)}
                {copied ? (
                  <Check className="h-4 w-4 text-lime" aria-label="Copied" />
                ) : (
                  <Copy className="h-4 w-4" aria-label="Copy address" />
                )}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 sm:self-end">
            {isSelf ? (
              <>
                {!handle ? (
                  <Button href="/join?next=/profile" variant="pink">
                    Pick your @name
                  </Button>
                ) : null}
                <Button href="/profile/edit" variant="ghost">
                  <Pencil className="h-4 w-4" /> Edit profile
                </Button>
              </>
            ) : (
              <Button href="/rally" variant="lime">
                Host a race
              </Button>
            )}
          </div>
        </div>
      </section>

      <section
        aria-label="Stats"
        className="mt-10 grid grid-cols-3 gap-3 sm:grid-cols-[1.6fr_1fr_1fr_1fr]"
      >
        <div className="col-span-3 rounded-3xl bg-gold p-5 text-ink sm:col-span-1 sm:p-6">
          <Label className="!text-ink/70">CKB won</Label>
          <p className="mt-1 font-display text-6xl font-black leading-none">
            {loading ? "…" : <CkbAmount value={ckbWhole(tally.won)} />}
          </p>
        </div>
        {[
          { label: "Wins", value: tally.wins },
          { label: "Races", value: tally.played },
          { label: "Shards", value: tally.shards, pink: true },
        ].map((tile) => (
          <div key={tile.label} className="rounded-3xl border border-line bg-ink-2 p-4 sm:p-6">
            <Label>{tile.label}</Label>
            <p
              className={`mt-1 flex items-center gap-1.5 font-display text-4xl font-black leading-none ${tile.pink ? "text-pink" : ""}`}
            >
              {tile.pink ? <Gem className="h-6 w-6" aria-hidden="true" /> : null}
              {loading ? "…" : tile.value.toLocaleString("en-US")}
            </p>
          </div>
        ))}
      </section>
      {stats.isError ? (
        <p className="mt-3 text-danger">Stats could not load. Refresh to try again.</p>
      ) : null}

      <section className="mt-14" aria-labelledby="trophies">
        <div className="flex items-baseline justify-between">
          <h2 id="trophies" className="font-display text-4xl font-black uppercase">
            Trophies
          </h2>
          {trophies.length > 0 ? (
            <span className="text-fog">
              {trophies.length} {trophies.length === 1 ? "crown" : "crowns"}
            </span>
          ) : null}
        </div>
        {trophySpores.isLoading || stats.isLoading ? (
          <ChainLoader compact title="Loading trophies…" />
        ) : trophies.length > 0 ? (
          <ul className="-mx-5 mt-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {trophies.map((trophy, i) => (
              <motion.li
                key={trophy.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.25, ease: EASE, delay: i * 0.05 }}
                className="w-[70%] shrink-0 snap-start sm:w-auto"
              >
                <TrophyCard
                  trophy={trophy}
                  matchId={
                    stats.data?.races.find(
                      (race) =>
                        race.txHash.toLowerCase() ===
                        trophy.finishTx.toLowerCase(),
                    )?.matchId
                  }
                />
              </motion.li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-14 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={IMG.trophy} alt="" className="h-24 w-24 rounded-full object-cover opacity-40 grayscale" />
            <p className="mt-4 font-display text-3xl font-black uppercase">No trophies yet</p>
            <p className="mt-2 max-w-md text-fog">
              {isSelf
                ? "Win a race, then collect its trophy from the results. It’s yours, and it shows up here."
                : "Wins show up here as gold crowns."}
            </p>
            {isSelf ? (
              <Button href="/rally" className="mt-6">
                Find a race
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-14" aria-labelledby="races">
        <h2 id="races" className="font-display text-4xl font-black uppercase">
          Recent races
        </h2>
        {stats.isLoading ? (
          <ChainLoader compact title="Loading races…" />
        ) : myRaces.length === 0 || !lockHash ? (
          <p className="mt-4 text-fog">
            {isSelf ? "No finished races yet. Host one or join one." : "No finished races yet."}
          </p>
        ) : (
          <PlayerRaces races={myRaces.slice(0, 20)} me={lockHash} />
        )}
      </section>
    </ArenaStage>
  );
}

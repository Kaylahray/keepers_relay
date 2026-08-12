'use client';

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { ArrowUpRight, Lock, Scroll } from 'lucide-react';
import { useChainQuery } from '@/hooks/useChain';
import { useKeeperEcosystem } from '@/hooks/useKeeperEcosystem';
import { PageShell } from '@/components/PageShell';
import { LineageList } from '@/components/LineageList';

export function ChainDetailView({ chainId }: { chainId: string }) {
  const { data: chain, isLoading } = useChainQuery();
  const { artifact, queue } = useKeeperEcosystem();

  if (isLoading || !chain) {
    return (
      <PageShell eyebrow="Chain record" title="Loading chain" backHref="/" backLabel="Home">
        <div className="h-64 animate-pulse border-[3px] border-black bg-[#ff4cbd]" />
      </PageShell>
    );
  }

  if (chain.id !== chainId) {
    return (
      <PageShell
        eyebrow="Chain record"
        title="Unknown chain"
        intro="That chain isn’t here."
        backHref="/"
        backLabel="Home"
      >
        <Link
          href={`/chains/${chain.id}`}
          className="neo-button inline-block bg-[#224cff] px-4 py-3 text-sm font-black uppercase text-[#fff8e7]"
        >
          Open {chain.id}
        </Link>
      </PageShell>
    );
  }

  const dead = chain.status === 'dead';
  const current = chain.owners[chain.owners.length - 1];
  const handoffs = [...chain.owners].filter((owner) => owner.passedAt).reverse();

  return (
    <PageShell
      eyebrow="Permanent chain record"
      title={dead ? 'A locked archive' : 'A living chain'}
      intro={
        dead
          ? 'This Cell ran out of time. Nothing can move it again — what remains is the full public record of everyone who kept it alive.'
          : 'Every handoff on this Chain Cell, oldest at the bottom. The current Keeper is still on the clock.'
      }
      backHref="/"
      backLabel="Home"
    >
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Vital label="Chain id" value={chain.id} mono bg="#fff8e7" />
        <Vital label="Keepers" value={String(chain.owners.length)} bg="#d6ff00" />
        <Vital label="Window" value={`${chain.windowHours}H`} bg="#ffe454" />
        <Vital
          label="Status"
          value={dead ? 'DEAD' : 'ALIVE'}
          bg={dead ? '#777777' : '#ff4cbd'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="neo-card bg-[#fff8e7] p-5">
          <div className="flex items-baseline justify-between border-b-[3px] border-black pb-3">
            <h2 className="font-poster text-3xl uppercase leading-none">Full lineage</h2>
            <span className="font-mono text-[10px] font-bold">NEWEST FIRST</span>
          </div>
          <div className="mt-2">
            <LineageList owners={chain.owners} dead={dead} />
          </div>
        </section>

        <div className="space-y-6">
          <section className="neo-card bg-black p-5 text-[#fff8e7]">
            <h2 className="font-poster text-2xl uppercase leading-none text-[#d6ff00]">
              Handoff history
            </h2>
            <p className="mt-2 text-xs font-bold uppercase tracking-wider">
              Each row consumed one Cell and created its successor.
            </p>
            <ul className="mt-4 space-y-2">
              {handoffs.length === 0 && (
                <li className="border-2 border-[#fff8e7] p-3 text-xs font-bold">
                  No handoffs yet. The genesis Keeper still holds it.
                </li>
              )}
              {handoffs.map((owner) => (
                <li
                  key={owner.id}
                  className="flex items-center justify-between gap-3 border-2 border-[#fff8e7] p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black uppercase">{owner.name} passed it on</p>
                    <code className="font-mono text-[10px] text-[#d6ff00]">{owner.cellHash}</code>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] font-bold">
                    {owner.passedAt
                      ? formatDistanceToNow(new Date(owner.passedAt), { addSuffix: true })
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
            {chain.genesisTxHash ? (
              <a
                href={`https://pudge.explorer.nervos.org/transaction/${chain.lastTxHash ?? chain.genesisTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block border-t-2 border-[#fff8e7] pt-3 font-mono text-[10px] font-bold text-[#d6ff00]"
              >
                View on explorer
              </a>
            ) : null}
          </section>

          <section className="neo-card bg-[#ffe454] p-5">
            <div className="flex items-center gap-2">
              <Scroll className="h-4 w-4 stroke-[3]" />
              <span className="text-[10px] font-black uppercase tracking-[0.16em]">
                Cultural record
              </span>
            </div>
            <h2 className="mt-2 font-poster text-2xl uppercase leading-none">
              {artifact.data?.title ?? 'The living artifact'}
            </h2>
            <p className="mt-2 text-sm font-semibold">
              {artifact.data?.entries.length ?? 0} permanent marks left by past Keepers.
            </p>
            <Link
              href={`/artifact/${chain.id}`}
              className="neo-button mt-4 inline-flex items-center gap-1.5 bg-[#224cff] px-3.5 py-2.5 text-xs font-black uppercase text-[#fff8e7]"
            >
              Read the archive
              <ArrowUpRight className="h-3.5 w-3.5 stroke-[3]" />
            </Link>
          </section>

          <section className="neo-card bg-[#ff4cbd] p-5">
            <h2 className="font-poster text-2xl uppercase leading-none">Waiting to carry it</h2>
            <p className="mt-2 text-sm font-semibold">
              {queue.data?.length ?? 0} people have pledged to keep this chain alive.
            </p>
            {dead ? (
              <p className="mt-3 flex items-center gap-2 text-xs font-black uppercase">
                <Lock className="h-4 w-4 stroke-[3]" />
                The queue closed when the Cell locked.
              </p>
            ) : (
              <p className="mt-3 text-xs font-bold">
                The Keeper — currently {current?.name} — decides who gets it next.
              </p>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}

function Vital({
  label,
  value,
  bg,
  mono,
}: {
  label: string;
  value: string;
  bg: string;
  mono?: boolean;
}) {
  return (
    <div className="neo-card-soft p-3" style={{ backgroundColor: bg }}>
      <p className={mono ? 'truncate font-mono text-sm font-bold' : 'font-poster text-3xl leading-none'}>
        {value}
      </p>
      <p className="mt-2 text-[10px] font-black uppercase tracking-wider">{label}</p>
    </div>
  );
}

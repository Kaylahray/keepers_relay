'use client';

import React, { useState } from 'react';
import { ArrowUpRight, HeartHandshake, Loader2, Send, UsersRound } from 'lucide-react';
import type { QueueEntry } from '@/types/keeper';

interface KeeperQueueProps {
  entries: QueueEntry[];
  isKeeper: boolean;
  joining: boolean;
  endorsing: boolean;
  error: string | null;
  onJoin: (input: { name: string; pledge: string }) => void;
  onEndorse: (entry: QueueEntry) => void;
}

export function KeeperQueue({
  entries,
  isKeeper,
  joining,
  endorsing,
  error,
  onJoin,
  onEndorse,
}: KeeperQueueProps) {
  const [name, setName] = useState('');
  const [pledge, setPledge] = useState('');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !pledge.trim() || joining) return;
    onJoin({ name, pledge });
    setName('');
    setPledge('');
  }

  return (
    <section aria-labelledby="queue-title" className="neo-card bg-[#fff8e7] p-5 text-black">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 stroke-[3]" />
            <span className="text-[10px] font-black uppercase tracking-[0.16em]">
              Handoff casting
            </span>
          </div>
          <h2 id="queue-title" className="mt-2 font-poster text-3xl uppercase leading-[.9]">
            Who gets
            <br />
            the baton?
          </h2>
          <p className="mt-3 text-sm font-semibold leading-relaxed">
            Make a promise that makes the Keeper want to pick you.
          </p>
        </div>
        <span className="border-2 border-black bg-[#d6ff00] px-2 py-1 font-mono text-[10px] font-bold">
          {entries.length} READY
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {entries.map((entry, index) => (
          <article
            key={entry.id}
            className={`border-[3px] border-black p-3.5 ${index === 0 ? 'bg-[#ff4cbd]' : 'bg-[#ffe454]'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-black">
                  #{String(index + 1).padStart(2, '0')} · {entry.endorsements} SIGNALS
                </p>
                <h3 className="mt-1 text-base font-black uppercase">{entry.name}</h3>
                <p className="mt-1 text-sm font-semibold leading-relaxed">“{entry.pledge}”</p>
              </div>
              {isKeeper && (
                <button
                  type="button"
                  onClick={() => onEndorse(entry)}
                  disabled={endorsing}
                  className="neo-button flex shrink-0 items-center gap-1 bg-black px-2.5 py-2 text-xs font-black text-[#fff8e7] disabled:opacity-40"
                >
                  <HeartHandshake className="h-3.5 w-3.5" />
                  <span className="sr-only">Choose {entry.name} as next Keeper</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <form onSubmit={submit} className="mt-5 border-t-[3px] border-black pt-5">
        <p className="text-[10px] font-black uppercase tracking-[0.16em]">Put your name in the ring</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[0.55fr_1fr]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={24}
            placeholder="Your name"
            aria-label="Your name"
            className="border-[3px] border-black bg-white px-3 py-2.5 text-sm font-semibold text-black outline-none placeholder:text-black/35"
          />
          <input
            value={pledge}
            onChange={(event) => setPledge(event.target.value)}
            maxLength={120}
            placeholder="Your promise to the chain"
            aria-label="Your promise to the chain"
            className="border-[3px] border-black bg-white px-3 py-2.5 text-sm font-semibold text-black outline-none placeholder:text-black/35"
          />
        </div>
        <button
          type="submit"
          disabled={!name.trim() || !pledge.trim() || joining}
          className="neo-button mt-3 flex items-center gap-1.5 bg-[#224cff] px-3 py-2 text-xs font-black text-[#fff8e7] disabled:opacity-40"
        >
          {joining ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5 stroke-[3]" />
          )}
          {joining ? 'JOINING…' : 'JOIN THE QUEUE'}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-xs font-bold text-red-700">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

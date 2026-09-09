'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Home, Loader2, MapPin, Search, X } from 'lucide-react';
import type { ChainMode } from '@/types/chain';
import { detectPlaceLabel } from '@/lib/location';

export type PassMember = {
  address: string;
  displayName: string;
  username: string;
};

interface PassChainDialogProps {
  open: boolean;
  fromName: string;
  initialRecipient?: string;
  isPending: boolean;
  error: string | null;
  mode: ChainMode;
  creatorName: string;
  creatureName: string;
  canPass: boolean;
  members?: PassMember[];
  excludeAddress?: string | null;
  onClose: () => void;
  onSubmit: (recipient: string, city: string) => void;
  onNeedMark?: () => void;
}

export function PassChainDialog({
  open,
  fromName,
  initialRecipient = '',
  isPending,
  error,
  mode,
  creatorName,
  creatureName,
  canPass,
  members = [],
  excludeAddress,
  onClose,
  onSubmit,
  onNeedMark,
}: PassChainDialogProps) {
  const [value, setValue] = useState('');
  const [city, setCity] = useState('');
  const [locating, setLocating] = useState(false);
  const [openList, setOpenList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitGuardRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;

    setValue(initialRecipient);
    setCity('');
    setOpenList(false);

    if (!canPass) {
      onNeedMark?.();
      onClose();
      return undefined;
    }

    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isPending, onClose]);

  const q = value.trim().toLowerCase().replace(/^@/, '');
  const { filtered, passableCount } = useMemo(() => {
    const exclude = excludeAddress?.toLowerCase();
    const passable = members.filter(
      (m) => !exclude || m.address.toLowerCase() !== exclude,
    );
    const matches = passable.filter((m) => {
      if (!q) return true;
      return (
        m.username.toLowerCase().includes(q) ||
        m.displayName.toLowerCase().includes(q) ||
        m.address.toLowerCase().includes(q)
      );
    });
    return { filtered: matches.slice(0, 50), passableCount: passable.length };
  }, [members, q, excludeAddress]);

  function pickMember(member: PassMember) {
    setValue(member.username ? `@${member.username}` : member.address);
    setOpenList(false);
  }

  useEffect(() => {
    if (!isPending) submitGuardRef.current = false;
  }, [isPending]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPass || !value.trim() || isPending || submitGuardRef.current) return;
    submitGuardRef.current = true;
    onSubmit(value, city);
  }

  if (!open || !canPass) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div
          className="absolute inset-0 bg-[#0c0c12]/85 backdrop-blur-sm"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(168,85,247,0.22), transparent 55%)',
          }}
          onClick={() => !isPending && onClose()}
          aria-hidden="true"
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pass-title"
          className="relative w-full max-w-md border border-white/15 bg-[#121018] p-6 text-white shadow-[0_0_60px_rgba(168,85,247,0.2)]"
          initial={{ scale: 0.96, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.98, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="absolute right-3 top-3 border border-white/20 bg-black/40 p-1.5 text-white/70 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#99ee2d]">
            The handoff
          </p>
          <h2 id="pass-title" className="mt-2 font-poster text-3xl uppercase leading-[0.9] sm:text-4xl">
            Pass {creatureName}
          </h2>
          <p className="mt-3 text-sm font-light leading-relaxed text-white/60">
            <span className="font-bold text-white">{fromName}</span>&rsquo;s Cell is consumed. A
            new Cell mints for the next Keeper. The deadline extends by one full window.
          </p>
          {mode === 'return_home' && (
            <p className="mt-3 flex items-start gap-2 border border-[#e1bf47]/40 bg-[#e1bf47]/10 p-2.5 text-xs text-white/80">
              <Home className="mt-0.5 h-4 w-4 shrink-0 text-[#e1bf47]" />
              Return-home: only new holders — or send it back to{' '}
              <strong className="text-white">{creatorName}</strong> to seal the journey.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-5 border-t border-white/10 pt-5">
            <label
              htmlFor="recipient"
              className="text-[10px] font-bold uppercase tracking-wider text-white/45"
            >
              Next Keeper
            </label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                id="recipient"
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setOpenList(true);
                }}
                onFocus={() => setOpenList(true)}
                placeholder={
                  members.length > 0
                    ? 'Search room members, @handle, or ckt…'
                    : mode === 'return_home'
                      ? `@handle, ckt…, or ${creatorName}`
                      : '@alice or ckt1…'
                }
                maxLength={100}
                disabled={isPending}
                autoComplete="off"
                className="w-full border border-white/15 bg-black/50 py-3 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#99ee2d] disabled:opacity-50"
              />
              {openList && filtered.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto border border-white/15 bg-[#16141c] shadow-xl">
                  {filtered.map((member) => (
                    <li key={member.address}>
                      <button
                        type="button"
                        onClick={() => pickMember(member)}
                        className="flex w-full flex-col items-start border-b border-white/5 px-3 py-2.5 text-left last:border-b-0 hover:bg-[#99ee2d]/15"
                      >
                        <span className="text-xs font-bold uppercase text-white">
                          {member.username ? `@${member.username}` : member.displayName}
                        </span>
                        <span className="font-mono text-[10px] text-white/45">
                          {member.displayName}
                          {member.username ? ` · ${member.address.slice(0, 12)}…` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-1.5 text-[10px] text-white/45">
              {passableCount > 0
                ? `${filtered.length} of ${passableCount} in this room. Outside — paste @handle or ckt.`
                : 'No one else in this room yet. Paste any @handle or ckt address.'}
            </p>

            <label
              htmlFor="city"
              className="mt-4 block text-[10px] font-bold uppercase tracking-wider text-white/45"
            >
              City stamp (optional)
            </label>
            <input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Where is the Cell right now?"
              maxLength={40}
              disabled={isPending}
              className="mt-2 w-full border border-white/15 bg-black/50 px-3 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#99ee2d] disabled:opacity-50"
            />
            <button
              type="button"
              disabled={isPending || locating}
              onClick={() => {
                setLocating(true);
                void detectPlaceLabel()
                  .then((label) => {
                    if (label) setCity(label);
                  })
                  .finally(() => setLocating(false));
              }}
              className="mt-2 inline-flex items-center gap-1.5 border border-white/20 bg-black/40 px-2.5 py-1.5 text-[10px] font-bold uppercase text-white/80 disabled:opacity-40"
            >
              {locating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <MapPin className="h-3 w-3" />
              )}
              Use my location
            </button>

            {error && (
              <p role="alert" className="mt-3 text-sm font-bold text-[#99ee2d]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!value.trim() || isPending}
              className="arena-cta mt-5 flex w-full items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold uppercase disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Passing…
                </>
              ) : (
                <>
                  Keep it alive <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

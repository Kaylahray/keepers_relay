'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Home, Loader2, MapPin, X } from 'lucide-react';
import type { ChainMode } from '@/types/chain';
import { detectPlaceLabel } from '@/lib/location';

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
  contributionHint?: string | null;
  onClose: () => void;
  onSubmit: (recipient: string, city: string) => void;
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
  contributionHint,
  onClose,
  onSubmit,
}: PassChainDialogProps) {
  const [value, setValue] = useState('');
  const [city, setCity] = useState('');
  const [locating, setLocating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialRecipient);
      setCity('');
      const id = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [open, initialRecipient]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, isPending, onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPass || !value.trim() || isPending) return;
    onSubmit(value, city);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => !isPending && onClose()}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pass-title"
            className="relative w-full max-w-md border-[4px] border-black bg-[#ffe454] p-6 text-black shadow-[10px_10px_0_#ff4cbd]"
            initial={{ scale: 0.92, rotate: -2, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 23 }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              aria-label="Close"
              className="absolute right-3 top-3 border-2 border-black bg-[#fff8e7] p-1 text-black disabled:opacity-40"
            >
              <X className="h-5 w-5 stroke-[3]" />
            </button>
            <p className="text-[10px] font-black uppercase tracking-[.18em]">The real handoff</p>
            <h2 id="pass-title" className="mt-2 font-poster text-4xl uppercase leading-[.85]">
              Pass {creatureName}.
            </h2>
            <p className="mt-4 text-sm font-semibold leading-relaxed">
              <span className="font-black">{fromName}</span>&rsquo;s Cell gets consumed. A new Cell
              mints for the next Keeper. The clock starts over.
            </p>
            {mode === 'return_home' && (
              <p className="mt-3 flex items-start gap-2 border-2 border-black bg-[#fff8e7] p-2.5 text-xs font-semibold">
                <Home className="mt-0.5 h-4 w-4 shrink-0 stroke-[3]" />
                Return-home: only new holders — or send it back to{' '}
                <strong>{creatorName}</strong> to seal the journey.
              </p>
            )}
            {!canPass && (
              <p className="mt-3 border-2 border-black bg-[#ff4cbd] p-2.5 text-xs font-bold">
                {contributionHint ??
                  'Leave your mark first.'}
              </p>
            )}
            <form onSubmit={handleSubmit} className="mt-5 border-t-[3px] border-black pt-5">
              <label
                htmlFor="recipient"
                className="text-[10px] font-black uppercase tracking-[.16em]"
              >
                Next Keeper (@handle or ckt address)
              </label>
              <input
                id="recipient"
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={
                  mode === 'return_home'
                    ? `@handle, ckt address, or ${creatorName}`
                    : '@alice or ckt1…'
                }
                maxLength={100}
                disabled={isPending || !canPass}
                className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-3 text-black outline-none placeholder:text-black/35 focus:bg-white disabled:opacity-50"
              />
              <label
                htmlFor="city"
                className="mt-4 block text-[10px] font-black uppercase tracking-[.16em]"
              >
                City stamp (optional)
              </label>
              <input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Where is the Cell right now?"
                maxLength={40}
                disabled={isPending || !canPass}
                className="mt-2 w-full border-[3px] border-black bg-[#fff8e7] px-3 py-3 text-black outline-none placeholder:text-black/35 focus:bg-white disabled:opacity-50"
              />
              <button
                type="button"
                disabled={isPending || !canPass || locating}
                onClick={() => {
                  setLocating(true);
                  void detectPlaceLabel()
                    .then((label) => {
                      if (label) setCity(label);
                    })
                    .finally(() => setLocating(false));
                }}
                className="mt-2 inline-flex items-center gap-1.5 border-2 border-black bg-white px-2.5 py-1.5 text-[10px] font-black uppercase disabled:opacity-40"
              >
                {locating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <MapPin className="h-3 w-3 stroke-[3]" />
                )}
                Use my location
              </button>
              {error && (
                <p role="alert" className="mt-2 text-sm font-bold text-red-800">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={!canPass || !value.trim() || isPending}
                className="neo-button mt-5 flex w-full items-center justify-center gap-2 bg-[#224cff] px-4 py-3.5 text-sm font-black uppercase text-[#fff8e7] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    PASSING…
                  </>
                ) : (
                  <>
                    KEEP IT ALIVE <ArrowRight className="h-4 w-4 stroke-[3]" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

'use client';

import Link from 'next/link';
import { ArrowUpRight, Award, Flame, ShieldCheck } from 'lucide-react';
import { CharacterAvatar } from '@/components/CharacterPicker';
import type { PassportProfile } from '@/types/keeper';

interface PassportCardProps {
  profile: PassportProfile;
  characterId?: string | null;
}

export function PassportCard({ profile, characterId }: PassportCardProps) {
  return (
    <aside aria-label="Your contribution passport" className="neo-card bg-[#ff4cbd] p-5 text-black">
      <div className="flex items-center justify-between border-b-[3px] border-black pb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 stroke-[3]" />
          <span className="text-[10px] font-black uppercase tracking-[0.16em]">
            Your proof passport
          </span>
        </div>
        <Link
          href="/profile/me"
          className="flex items-center gap-1 border-2 border-black bg-[#fff8e7] px-2 py-1 text-[10px] font-black uppercase"
        >
          Open
          <ArrowUpRight className="h-3 w-3 stroke-[3]" />
        </Link>
      </div>

      {(characterId || profile.characterId) && (
        <div className="mt-4 flex items-center gap-3">
          <CharacterAvatar characterId={characterId ?? profile.characterId} size="md" />
          <div>
            <p className="font-poster text-2xl uppercase leading-none">{profile.displayName}</p>
            <p className="mt-1 font-mono text-[10px] font-bold text-black/60">
              {profile.address.slice(0, 10)}…
            </p>
          </div>
        </div>
      )}

      <h3 className="mt-5 font-poster text-4xl uppercase leading-[.86]">
        Show up.
        <br />
        Stack proof.
      </h3>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="border-[3px] border-black bg-[#ffe454] p-3">
          <div className="flex items-center gap-1.5">
            <Flame className="h-5 w-5 stroke-[3]" />
            <span className="font-mono text-2xl font-bold">{profile.relayStreak}</span>
          </div>
          <p className="mt-2 text-[10px] font-black uppercase tracking-wider">Relay streak</p>
        </div>
        <div className="border-[3px] border-black bg-[#d6ff00] p-3">
          <div className="flex items-center gap-1.5">
            <Award className="h-5 w-5 stroke-[3]" />
            <span className="font-mono text-2xl font-bold">{profile.contributionXp}</span>
          </div>
          <p className="mt-2 text-[10px] font-black uppercase tracking-wider">XP earned</p>
        </div>
      </div>
      <div className="mt-4 border-[3px] border-black bg-[#fff8e7] p-3">
        <p className="text-[10px] font-black uppercase tracking-wider">Proof collected</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {profile.badgeLabels.map((badge) => (
            <span
              key={badge}
              className="border-2 border-black bg-[#224cff] px-2 py-1 text-[10px] font-black text-[#fff8e7]"
            >
              {badge}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-xs font-bold leading-relaxed">
        Rewards are receipts for helping CKB move—not a shortcut to holding the Cell.
      </p>
    </aside>
  );
}

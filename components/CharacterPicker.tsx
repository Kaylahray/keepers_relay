'use client';

import { motion } from 'framer-motion';
import {
  CHARACTERS,
  characterPortraitUrl,
  getCharacter,
  type Character,
  type CharacterId,
} from '@/lib/characters';

interface CharacterAvatarProps {
  characterId: CharacterId | string | null | undefined;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-28 w-28',
  xl: 'h-40 w-40',
};

export function CharacterAvatar({ characterId, size = 'md', className = '' }: CharacterAvatarProps) {
  const character = getCharacter(characterId);
  if (!character) {
    return (
      <div
        className={`${SIZES[size]} rounded-xl border border-white/15 bg-white/10 ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/20 ${SIZES[size]} ${className}`}
      style={{ backgroundColor: character.fill }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={characterPortraitUrl(character, size === 'xl' || size === 'lg' ? 320 : 160)}
        alt=""
        className="h-full w-full object-contain object-bottom"
      />
    </div>
  );
}

interface CharacterPickerProps {
  value: CharacterId | null;
  onChange: (id: CharacterId) => void;
}

export function CharacterPicker({ value, onChange }: CharacterPickerProps) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      role="listbox"
      aria-label="Choose your character"
    >
      {CHARACTERS.map((character) => (
        <CharacterCard
          key={character.id}
          character={character}
          selected={value === character.id}
          onSelect={() => onChange(character.id)}
        />
      ))}
    </div>
  );
}

function CharacterCard({
  character,
  selected,
  onSelect,
}: {
  character: Character;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      className={`overflow-hidden rounded-2xl border p-2 text-left transition ${
        selected
          ? 'border-[#ff56f6] bg-[#ff56f6]/15 shadow-[0_0_28px_rgba(255,86,246,0.35)]'
          : 'border-white/10 bg-white/5 hover:border-white/25'
      }`}
    >
      <div
        className="relative aspect-square overflow-hidden rounded-xl"
        style={{ backgroundColor: character.fill }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={characterPortraitUrl(character, 256)}
          alt={character.name}
          className="h-full w-full object-contain object-bottom"
        />
        {selected && (
          <span className="absolute bottom-1 left-1 rounded-md bg-[#ff56f6] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
            Selected
          </span>
        )}
      </div>
      <p className="mt-2 font-poster text-lg uppercase leading-none text-white">{character.name}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#ff56f6]">
        {character.title}
      </p>
      <p className="mt-1 text-[10px] font-medium leading-snug text-white/55">{character.tagline}</p>
    </motion.button>
  );
}

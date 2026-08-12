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
        className={`${SIZES[size]} border-[3px] border-black bg-[#777777] ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden border-[3px] border-black ${SIZES[size]} ${className}`}
      style={{ backgroundColor: character.fill, boxShadow: `4px 4px 0 ${character.accent}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={characterPortraitUrl(character, size === 'xl' || size === 'lg' ? 320 : 160)}
        alt=""
        className="h-full w-full object-cover"
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="listbox" aria-label="Choose your character">
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
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className={`border-[3px] border-black p-2 text-left ${
        selected ? 'bg-[#d6ff00] shadow-[6px_6px_0_#101010]' : 'bg-[#fff8e7] shadow-[4px_4px_0_#101010]'
      }`}
    >
      <div
        className="relative aspect-square overflow-hidden border-[3px] border-black"
        style={{ backgroundColor: character.fill }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={characterPortraitUrl(character, 256)}
          alt={character.name}
          className="h-full w-full object-cover"
        />
        {selected && (
          <span className="absolute bottom-1 left-1 border-2 border-black bg-[#ff4cbd] px-1.5 py-0.5 text-[9px] font-black uppercase">
            Selected
          </span>
        )}
      </div>
      <p className="mt-2 font-poster text-lg uppercase leading-none">{character.name}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wider" style={{ color: character.accent === '#fff8e7' ? '#101010' : undefined }}>
        {character.title}
      </p>
      <p className="mt-1 text-[10px] font-semibold leading-snug text-black/70">{character.tagline}</p>
    </motion.button>
  );
}

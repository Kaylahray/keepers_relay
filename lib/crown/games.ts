import { ccc } from '@ckb-ccc/core';
import { depthsConfigured, suddenDeathDepths, suddenDeathGame, type ScriptConfig } from '@/lib/registry/config';
import { GAME_RULES, LAP_WINDOW_MS, MIN_LEFT_MS, type GameRules } from '@/lib/sudden-death/codec';
import * as crownRun from '@/lib/game/crown-run';
import * as depths from '@/lib/game/depths';
import type { GameId } from '@/lib/crown/rooms';

/** What the crown flow needs to know about a game: its rules, its pacing, and how its picks read. */
export type CrownGame = {
  id: GameId;
  /** What one locked part of a run is called. */
  lap: 'lap' | 'floor';
  /** The verb on the play button. */
  play: 'Drive' | 'Explore';
  /** The rules the match cell carries. They must equal the game script's own. */
  rules: GameRules;
  timing: { LOCK_MARGIN_MS: number; LAP_NEEDS_MS: number; RUN_NEEDS_MS: number; ENTRY_NEEDS_MS: number; PICK_SECONDS: number };
  /** How many pick bytes a clean lap ends with, by its index from zero. */
  picksDue(lap: number): number;
  /** The upgrades or relics the run holds after these laps. */
  owned(tapes: Uint8Array[]): number;
  unusedPicks(tapes: Uint8Array[]): string | null;
  script: ScriptConfig;
};

const CROWN_GAMES: Record<GameId, CrownGame> = {
  'crown-run': {
    id: 'crown-run',
    lap: 'lap',
    play: 'Drive',
    rules: GAME_RULES,
    timing: crownRun.CROWN_RUN,
    picksDue: crownRun.picksDue,
    owned: (tapes) => crownRun.runState(tapes).owned,
    unusedPicks: crownRun.unusedPicks,
    script: suddenDeathGame,
  },
  depths: {
    id: 'depths',
    lap: 'floor',
    play: 'Explore',
    rules: { laps: depths.DEPTHS.FLOORS, lapWindowMs: LAP_WINDOW_MS, minLeftMs: MIN_LEFT_MS },
    timing: depths.DEPTHS,
    picksDue: depths.picksDue,
    owned: (tapes) => depths.runState(tapes).owned,
    unusedPicks: depths.unusedPicks,
    script: suddenDeathDepths,
  },
};

export function crownGame(id: GameId): CrownGame {
  return CROWN_GAMES[id] ?? CROWN_GAMES['crown-run'];
}

/** Games a host can open a crown with on this deployment. */
export function playableGames(): GameId[] {
  return depthsConfigured() ? ['crown-run', 'depths'] : ['crown-run'];
}

/** Data hash of a game's script, as the match cell records it. */
export function gameHash(id: GameId): Uint8Array {
  return ccc.bytesFrom(crownGame(id).script.codeHash);
}

/** The game a match cell names, or null for one this app does not know. */
export function gameOfHash(hex: string): GameId | null {
  const wanted = hex.toLowerCase();
  const found = Object.values(CROWN_GAMES).find((game) => game.script.codeHash.length > 2 && game.script.codeHash.toLowerCase() === wanted);
  return found?.id ?? null;
}

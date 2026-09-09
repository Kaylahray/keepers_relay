/**
 * Commit helpers for Event / Turn cells.
 * Questions never go on-chain — only hashes.
 * Uses the same CKB blake2b personalization as Chain Cell (`ccc.hashCkb`).
 */

import { ccc } from '@ckb-ccc/connector-react';

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function hashCkb(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return new Uint8Array(ccc.bytesFrom(ccc.hashCkb(joined)));
}

function toHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Bind topics + difficulty into Event.topicsHash (full 32; cell stores prefix). */
export function hashTopics(topics: string[], difficulty: string): Uint8Array {
  return hashCkb(enc(topics.join('|').toLowerCase()), enc('|'), enc(difficulty));
}

/** Host rules blob → Event.rulesHash. */
export function hashRules(rulesJson: string): Uint8Array {
  return hashCkb(enc(rulesJson));
}

/**
 * question_commit = hash(prompt || salt || eventId || round)
 * Store full hash off-chain; Turn Cell keeps first 16 bytes.
 */
export function hashQuestionCommit(input: {
  prompt: string;
  salt: string;
  eventIdHex: string;
  round: number;
}): Uint8Array {
  const eventId = input.eventIdHex.replace(/^0x/, '');
  return hashCkb(
    enc(input.prompt),
    enc('|'),
    enc(input.salt),
    enc('|'),
    enc(eventId),
    enc('|'),
    enc(String(input.round)),
  );
}

export function commitPrefix16(full: Uint8Array): Uint8Array {
  return full.subarray(0, 16);
}

export function commitToHex(full: Uint8Array): string {
  return toHex(full);
}

import { Chain, Owner, TROPHY_GOAL } from '@/types/chain';

/**
 * Mock CKB-style backend engine.
 *
 * On CKB the collectible is a single Cell — only one owner exists and only one
 * transaction can spend it. Every transfer consumes the old cell and creates a
 * new one (new owner + new expiry). We model that here in memory so React Query
 * has a realistic async source to talk to.
 */

const SEED_NAMES = ['Alice', 'Bob', 'Charlie', 'David', 'Emma'];
const WINDOW_HOURS = 24;

function hours(n: number): number {
  return n * 60 * 60 * 1000;
}

function randomHash(): string {
  const chars = '0123456789abcdef';
  let out = '0x';
  for (let i = 0; i < 8; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function makeOwner(name: string, receivedAt: number, passedAt: number | null): Owner {
  return {
    id: `cell_${receivedAt.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    receivedAt: new Date(receivedAt).toISOString(),
    passedAt: passedAt === null ? null : new Date(passedAt).toISOString(),
    cellHash: randomHash(),
  };
}

function seedChain(): Chain {
  const now = Date.now();
  // Build the classic Alice -> Emma lineage, roughly one pass every ~20h.
  const step = hours(20);
  const owners: Owner[] = SEED_NAMES.map((name, i) => {
    const receivedAt = now - step * (SEED_NAMES.length - 1 - i);
    const isCurrent = i === SEED_NAMES.length - 1;
    const passedAt = isCurrent ? null : receivedAt + step;
    return makeOwner(name, receivedAt, passedAt);
  });

  // Emma currently holds it, with ~8h left on the clock to build tension.
  const expiresAt = now + hours(8);

  return {
    id: 'chain_genesis_0001',
    status: 'alive',
    owners,
    expiresAt: new Date(expiresAt).toISOString(),
    windowHours: WINDOW_HOURS,
    trophyGoal: TROPHY_GOAL,
    diedAt: null,
  };
}

let chain: Chain = seedChain();

function clone(c: Chain): Chain {
  return JSON.parse(JSON.stringify(c));
}

function delay<T>(value: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Apply the "did the clock run out?" rule lazily whenever the chain is read. */
function reconcileExpiry(): void {
  if (chain.status === 'dead') return;
  if (Date.now() > new Date(chain.expiresAt).getTime()) {
    chain.status = 'dead';
    chain.diedAt = chain.expiresAt;
  }
}

export async function getChain(): Promise<Chain> {
  reconcileExpiry();
  return delay(clone(chain), 350);
}

export class PassChainError extends Error {}

export async function passChain(recipient: string): Promise<Chain> {
  reconcileExpiry();

  const name = recipient.trim();
  if (!name) throw new PassChainError('A recipient name is required.');
  if (name.length > 24) throw new PassChainError('Keep the name under 24 characters.');

  if (chain.status === 'dead') {
    throw new PassChainError('This chain is dead. The cell is permanently locked.');
  }

  const now = Date.now();
  const current = chain.owners[chain.owners.length - 1];

  // Consume old cell: stamp the current holder as having passed it on.
  current.passedAt = new Date(now).toISOString();

  // Create new cell: new owner + fresh expiry window.
  const newExpiry = now + hours(chain.windowHours);
  chain.owners = [...chain.owners, makeOwner(name, now, null)];
  chain.expiresAt = new Date(newExpiry).toISOString();

  return delay(clone(chain), 650);
}

/** Reset the whole experiment back to the seeded genesis chain. */
export async function resetChain(): Promise<Chain> {
  chain = seedChain();
  return delay(clone(chain), 400);
}

/**
 * Testing/demo helper: force the clock to nearly-zero so the death state can be
 * observed without waiting hours.
 */
export async function fastForwardToEdge(): Promise<Chain> {
  reconcileExpiry();
  if (chain.status === 'alive') {
    chain.expiresAt = new Date(Date.now() + 10 * 1000).toISOString();
  }
  return delay(clone(chain), 250);
}

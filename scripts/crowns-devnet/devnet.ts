/**
 * Shared bits for the local devnet harness. OffCKB's devnet (`offckb node`) funds a fixed set of
 * accounts in its genesis block; these are its well-known test keys, printed by `offckb accounts`,
 * and worthless anywhere but that local chain.
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const HERE = __dirname;
export const RPC_URL = process.env.DEVNET_RPC_URL ?? 'http://127.0.0.1:8114';
export const ENV_FILE = join(HERE, '.env.devnet');

export const DEVNET_KEYS = [
  '0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6',
  '0x9f315d5a9618a39fdc487c7a67a8581d40b045bd7a42d83648ca80ef3b2cb4a1',
  '0x59ddda57ba06d6e9c5fa9040bdb98b4b098c2fce6520d39f51bc5e825364697a',
] as const;

export function devnetClient(): ccc.Client {
  const scripts = JSON.parse(readFileSync(join(HERE, 'devnet-scripts.json'), 'utf8'));
  return new ccc.ClientPublicTestnet({ url: RPC_URL, scripts });
}

export function signerFor(client: ccc.Client, index: number): ccc.SignerCkbPrivateKey {
  return new ccc.SignerCkbPrivateKey(client, DEVNET_KEYS[index]!);
}

export async function waitCommitted(client: ccc.Client, txHash: string, label: string, timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    const tx = await client.getTransaction(txHash);
    if (tx?.status === 'committed') return;
    if (tx?.status === 'rejected') throw new Error(`${label} was rejected: ${tx.reason ?? 'no reason given'}`);
    if (Date.now() - started > timeoutMs) throw new Error(`${label} did not commit within ${timeoutMs / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/** Loads `.env.devnet` into process.env. Call before importing anything that reads config. */
export function loadDevnetEnv(): void {
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1]!] = match[2]!;
  }
}

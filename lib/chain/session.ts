import { ccc } from '@ckb-ccc/core';
import { REGISTRY_FEE_RATE } from '@/lib/registry/config';

/** A throwaway key the player's browser signs with, so a race needs no wallet popup after the stake. */
export type SessionKey = { secret: ccc.Hex; lock: ccc.Script };

export async function newSessionKey(client: ccc.Client): Promise<SessionKey> {
  const secret = ccc.hexFrom(crypto.getRandomValues(new Uint8Array(32)));
  const signer = new ccc.SignerCkbPrivateKey(client, secret);
  return { secret, lock: (await signer.getRecommendedAddressObj()).script };
}

/** The lock hash a session key's secret stands for: what a match or seat cell records as its key. */
export async function sessionKeyHash(client: ccc.Client, secret: ccc.Hex): Promise<ccc.Hex> {
  return (await new ccc.SignerCkbPrivateKey(client, secret).getRecommendedAddressObj()).script.hash();
}

/** The session key's live key cell, if any. */
async function keyCellOf(signer: ccc.SignerCkbPrivateKey): Promise<ccc.Cell | null> {
  const lock = (await signer.getRecommendedAddressObj()).script;
  for await (const cell of signer.client.findCellsOnChain({ script: lock, scriptType: 'lock', scriptSearchMode: 'exact' }, 'desc', 1)) {
    return cell;
  }
  return null;
}

/** Sends a session key's key cell back to its owner, signed by the session key. Null when there is none. */
export async function returnKeyCell(client: ccc.Client, session: ccc.Hex, owner: ccc.Script): Promise<string | null> {
  const signer = new ccc.SignerCkbPrivateKey(client, session);
  const key = await keyCellOf(signer);
  if (!key) return null;
  const tx = ccc.Transaction.from({
    inputs: [ccc.CellInput.from({ previousOutput: key.outPoint, since: 0 })],
    outputs: [ccc.CellOutput.from({ capacity: key.cellOutput.capacity, lock: owner })],
    outputsData: ['0x'],
  });
  await tx.completeFeeChangeToOutput(signer, 0, REGISTRY_FEE_RATE);
  return signer.sendTransaction(tx);
}

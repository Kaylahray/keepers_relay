/**
 * Frees the capacity of code cells you no longer need, back to the deployer as plain CKB.
 * Destroying a type-id code cell ends that script: every cell that runs it can never be spent
 * again. Only list cells nothing live depends on.
 *
 *   # Plan only (default). No key needed.
 *   DEPLOYER_ADDRESS=ckt1... pnpm exec tsx scripts/crowns-testnet/reclaim.ts 0xTX:0 0xTX:0
 *
 *   # Print the ckb-cli commands that send it, signed from your ckb-cli keystore (preferred).
 *   DEPLOYER_ADDRESS=ckt1... pnpm exec tsx scripts/crowns-testnet/reclaim.ts --ckb-cli 0xTX:0 ...
 *
 *   # Or send directly. Cells .env.local still names are refused unless --allow-in-use is given.
 *   DEPLOYER_PRIVATE_KEY=0x... pnpm exec tsx scripts/crowns-testnet/reclaim.ts --send [--allow-in-use] 0xTX:0 ...
 */
import { ccc } from '@ckb-ccc/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SEND = process.argv.includes('--send');
const CKB_CLI = process.argv.includes('--ckb-cli');
/** A reclaim is a few inputs and one output; 0.01 CKB is far above the node's minimum rate. */
const CKB_CLI_FEE = 1_000_000n;
const ALLOW_IN_USE = process.argv.includes('--allow-in-use');
const TARGETS = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const KEEP = new Set([
  // The proxy lock is shared by v1 and v2. Destroying it would freeze every Crowns cell.
  '0xa5ef4970ba0a4446b9cd8abb3b650cdfb68bcdf5052966e41384900a8a5ad274:0',
]);

function envNames(): Map<string, string> {
  const names = new Map<string, string>();
  const env = readFileSync(join(__dirname, '../../.env.local'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = /^NEXT_PUBLIC_([A-Z0-9_]+)_TX_HASH=(0x[0-9a-fA-F]{64})/.exec(line.trim());
    if (match) names.set(match[2]!.toLowerCase(), match[1]!);
  }
  return names;
}

async function main() {
  if (TARGETS.length === 0) throw new Error('Name the cells to reclaim as txHash:index.');
  const client = new ccc.ClientPublicTestnet({ url: process.env.CKB_RPC_URL ?? 'https://testnet.ckb.dev' });
  const key = process.env.DEPLOYER_PRIVATE_KEY?.trim();
  const signer = key ? new ccc.SignerCkbPrivateKey(client, key) : null;
  if (SEND && !signer) throw new Error('--send needs DEPLOYER_PRIVATE_KEY.');
  const address = signer
    ? await signer.getRecommendedAddressObj()
    : await ccc.Address.fromString(process.env.DEPLOYER_ADDRESS ?? '', client);
  const names = envNames();

  const inputs: ccc.Cell[] = [];
  let total = 0n;
  for (const target of TARGETS) {
    const [txHash, index] = target.split(':');
    const label = `${txHash}:${index}`;
    if (KEEP.has(label.toLowerCase())) throw new Error(`${label} is the shared proxy lock. It stays.`);
    const cell = await client.getCellLive({ txHash: txHash!, index: Number(index ?? 0) }, true);
    if (!cell) throw new Error(`${label} is not live.`);
    if (cell.cellOutput.lock.hash() !== address.script.hash()) throw new Error(`${label} is not locked by ${address.toString()}.`);
    const inUse = names.get(txHash!.toLowerCase());
    if (inUse && !ALLOW_IN_USE) throw new Error(`${label} is ${inUse} in .env.local. Pass --allow-in-use if you mean it.`);
    inputs.push(cell);
    total += cell.cellOutput.capacity;
    console.log(`${ccc.fixedPointToString(cell.cellOutput.capacity).padStart(12)} CKB  ${label}  ${inUse ?? 'not in .env.local'}`);
  }
  console.log(`\nReturns about ${ccc.fixedPointToString(total)} CKB to ${address.toString()}`);
  if (CKB_CLI) {
    // The same transaction, for ckb-cli: the key stays in its keystore and you type the password.
    const payout = ccc.fixedPointToString(total - CKB_CLI_FEE);
    const file = '/tmp/crowns-reclaim.json';
    const lines = [
      `export CKB_CLI_HOME=/mnt/c/Users/chiom/.ckb-cli`,
      `CLI="$HOME/ckb-cli/target/release/ckb-cli --url ${client.url}"`,
      `rm -f ${file}`,
      `$CLI tx init --tx-file ${file}`,
      ...inputs.map((cell) => `$CLI tx add-input --tx-hash ${cell.outPoint.txHash} --index ${Number(cell.outPoint.index)} --tx-file ${file}`),
      `$CLI tx add-output --to-sighash-address ${address.toString()} --capacity ${payout} --tx-file ${file}`,
      `$CLI tx info --tx-file ${file}`,
      `$CLI tx sign-inputs --from-account ${ccc.hexFrom(address.script.args)} --add-signatures --tx-file ${file}`,
      `$CLI tx send --tx-file ${file}`,
    ];
    console.log(`\nckb-cli commands (run in WSL; the fee is ${ccc.fixedPointToString(CKB_CLI_FEE)} CKB):\n`);
    console.log(lines.join('\n'));
    return;
  }
  if (!SEND) {
    console.log('Plan only: nothing sent. Add --send to destroy these cells, or --ckb-cli to print ckb-cli commands.');
    return;
  }

  const tx = ccc.Transaction.from({
    inputs: inputs.map((cell) => ({ previousOutput: cell.outPoint })),
    outputs: [{ lock: address.script }],
    outputsData: ['0x'],
  });
  // Every input is the deployer's own, so the one output takes everything minus the fee.
  await tx.completeFeeChangeToOutput(signer!, 0, 1000);
  const txHash = await signer!.sendTransaction(tx);
  console.log(`Sent ${txHash}. Wait for it to commit before deploying.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

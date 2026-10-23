"use client";

import { ccc } from "@ckb-ccc/connector-react";
import { encodeUsername } from "./encoding";

// ─────────────────────────────────────────────────────────────────────
// Cell capacity helpers.
//
// On CKB, a cell's minimum capacity (in CKB) equals the number of bytes
// it occupies on chain:
//
//   minBytes =  8                     // capacity field
//             + lock.occupiedSize     // 33 + lock.args.byteLength
//             + type.occupiedSize     // 33 + type.args.byteLength (or 0)
//             + outputData.byteLength
//
// 1 byte of cell storage costs 1 CKB = 1e8 shannons.
//
// `Transaction.from({ outputs, outputsData })` will auto-compute the
// capacity for any output whose `capacity` field is `0n`, so we just
// pass `capacity: 0n` everywhere on chain. These helpers exist for the
// UI: estimating how much CKB a profile will cost BEFORE the user
// signs a transaction.
// ─────────────────────────────────────────────────────────────────────

export const SHANNONS_PER_CKB = BigInt(100_000_000);

// Real cell-output overhead used by the chain. We don't have the lock
// script byte length without a connected wallet, so the UI uses an
// approximation that matches secp256k1 / JoyID-style locks. Real txs
// always use the actual signer lock so this estimate is only ever a
// hint for the cost meter.
const CAPACITY_FIELD_BYTES = 8;
const SCRIPT_HEADER_BYTES = 33; // 32 codeHash + 1 hashType
const APPROX_LOCK_ARGS_BYTES = 21; // secp256k1 / JoyID typical
const APPROX_LOCK_BYTES = SCRIPT_HEADER_BYTES + APPROX_LOCK_ARGS_BYTES; // 54

// Our type script always uses the ckb-js-vm code hash + 35-byte args
// (0x0000 + bytecode codeHash + hashType byte).
const TYPE_ARGS_BYTES = 2 + 32 + 1; // 35
const REGISTRY_TYPE_BYTES = SCRIPT_HEADER_BYTES + TYPE_ARGS_BYTES; // 68

/**
 * Estimate the minimum capacity (in CKB) for a username cell with the
 * given handle.
 */
export function estimateUsernameCapacityCkb(username: string): number {
  const dataBytes = encodeUsername(username).length;
  return CAPACITY_FIELD_BYTES + APPROX_LOCK_BYTES + REGISTRY_TYPE_BYTES + dataBytes;
}

/**
 * Compute the exact minimum capacity (in shannons) for a real cell, using
 * the user's actual lock script. This is what the on-chain tx pays.
 */
export function computeMinCellCapacity(
  lock: ccc.Script,
  type: ccc.Script,
  outputData: Uint8Array,
): bigint {
  const cellOutput = ccc.CellOutput.from({
    capacity: ccc.numFrom(0),
    lock,
    type,
  });
  const occupied = BigInt(cellOutput.occupiedSize) + BigInt(outputData.length);
  return occupied * SHANNONS_PER_CKB;
}

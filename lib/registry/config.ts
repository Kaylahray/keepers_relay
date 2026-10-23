export type CkbNetwork = "devnet" | "testnet" | "mainnet";

export type ScriptConfig = {
  codeHash: string;
  hashType: "type" | "data" | "data1" | "data2";
  args: string;
  outPoint: { txHash: string; index: string };
  depType: "code" | "depGroup";
};

// IMPORTANT: Next.js / Turbopack only inlines `process.env.NEXT_PUBLIC_*`
// for the browser bundle when accessed via static property syntax. Dynamic
// access like `process.env[key]` resolves to `undefined` client-side.
function pick(value: string | undefined, fallback = ""): string {
  return (value ?? fallback).trim();
}

const rawNetwork = pick(process.env.NEXT_PUBLIC_CKB_NETWORK, "devnet");
export const network: CkbNetwork =
  rawNetwork === "mainnet" || rawNetwork === "testnet" ? rawNetwork : "devnet";

export const rpcUrl = pick(
  process.env.NEXT_PUBLIC_CKB_RPC_URL,
  network === "devnet"
    ? "http://127.0.0.1:8114"
    : network === "testnet"
      ? "https://testnet.ckb.dev"
      : "https://mainnet.ckb.dev",
);

function asHashType(
  value: string | undefined,
): "type" | "data" | "data1" | "data2" {
  return value === "data" || value === "data1" || value === "data2"
    ? value
    : "type";
}

function asDepType(value: string | undefined): "code" | "depGroup" {
  return value === "depGroup" ? "depGroup" : "code";
}

export const usernameType: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_USERNAME_TYPE_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_USERNAME_TYPE_HASH_TYPE),
  args: pick(process.env.NEXT_PUBLIC_USERNAME_TYPE_ARGS),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_USERNAME_BYTECODE_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_USERNAME_BYTECODE_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_USERNAME_BYTECODE_DEP_TYPE),
};

export const profileType: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_PROFILE_TYPE_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_PROFILE_TYPE_HASH_TYPE),
  args: pick(process.env.NEXT_PUBLIC_PROFILE_TYPE_ARGS),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_PROFILE_BYTECODE_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_PROFILE_BYTECODE_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_PROFILE_BYTECODE_DEP_TYPE),
};

export const ckbJsVm: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_CKB_JS_VM_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_CKB_JS_VM_HASH_TYPE),
  args: "0x",
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_CKB_JS_VM_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_CKB_JS_VM_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_CKB_JS_VM_DEP_TYPE),
};

/** Sudden Death match type. Empty until the Pudge deploy fills these env vars. */
export const suddenDeathMatchType: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_SD_MATCH_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_SD_MATCH_HASH_TYPE),
  args: pick(process.env.NEXT_PUBLIC_SD_MATCH_ARGS, "0x"),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_SD_MATCH_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_SD_MATCH_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_SD_MATCH_DEP_TYPE),
};

export const suddenDeathBidType: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_SD_BID_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_SD_BID_HASH_TYPE),
  args: pick(process.env.NEXT_PUBLIC_SD_BID_ARGS, "0x"),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_SD_BID_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_SD_BID_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_SD_BID_DEP_TYPE),
};

/** Input Type Proxy Lock. data1 code hash of our deployed copy of the public binary. */
export const suddenDeathProxyLock: ScriptConfig = {
  codeHash: "0x5123908965c711b0ffd8aec642f1ede329649bda1ebdca6bd24124d3796f768a",
  hashType: "data1",
  args: "0x",
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_SD_PROXY_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_SD_PROXY_INDEX, "0x0"),
  },
  depType: "code",
};

export const suddenDeathTreasuryLock: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_SD_TREASURY_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_SD_TREASURY_HASH_TYPE),
  args: pick(process.env.NEXT_PUBLIC_SD_TREASURY_ARGS, "0x"),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_SD_TREASURY_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_SD_TREASURY_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_SD_TREASURY_DEP_TYPE),
};

/**
 * The game script match-type spawns to score a run. It is never a lock or type script, so it
 * only needs a code cell: `codeHash` is the data hash of that cell, which is also what the match
 * cell records as its game.
 */
export const suddenDeathGame: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_SD_GAME_CODE_HASH),
  hashType: "data2",
  args: "0x",
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_SD_GAME_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_SD_GAME_INDEX, "0x0"),
  },
  depType: "code",
};

export function registryConfigured(): boolean {
  return (
    usernameType.codeHash.length > 2 &&
    usernameType.args.length > 2 &&
    usernameType.outPoint.txHash.length > 2 &&
    profileType.codeHash.length > 2 &&
    profileType.args.length > 2 &&
    profileType.outPoint.txHash.length > 2 &&
    ckbJsVm.codeHash.length > 2 &&
    ckbJsVm.outPoint.txHash.length > 2
  );
}

export function assertRegistryConfigured(): void {
  if (registryConfigured()) return;
  throw new Error(
    "Missing registry env vars — copy `.env.local.example` to `.env.local` with all NEXT_PUBLIC_USERNAME_*, NEXT_PUBLIC_PROFILE_*, and NEXT_PUBLIC_CKB_JS_VM_* entries filled (from deployment/scripts.json after offckb deploy).",
  );
}

export function suddenDeathConfigured(): boolean {
  return (
    suddenDeathMatchType.codeHash.length > 2 &&
    suddenDeathMatchType.outPoint.txHash.length > 2 &&
    suddenDeathBidType.codeHash.length > 2 &&
    suddenDeathBidType.outPoint.txHash.length > 2 &&
    suddenDeathTreasuryLock.codeHash.length > 2 &&
    suddenDeathTreasuryLock.outPoint.txHash.length > 2 &&
    suddenDeathProxyLock.outPoint.txHash.length > 2 &&
    suddenDeathGame.codeHash.length > 2 &&
    suddenDeathGame.outPoint.txHash.length > 2
  );
}

export function assertSuddenDeathConfigured(): void {
  if (suddenDeathConfigured()) return;
  throw new Error(
    "Missing Sudden Death env — set NEXT_PUBLIC_SD_MATCH_*, NEXT_PUBLIC_SD_BID_*, NEXT_PUBLIC_SD_TREASURY_* and NEXT_PUBLIC_SD_GAME_* after the v2 deploy.",
  );
}

// CKB tx fee estimation (shannons per kB) — passed to `completeFeeBy`.
// This is unrelated to locked cell capacity; it only pays miners.
export const REGISTRY_FEE_RATE = BigInt(2000);

export const USERNAME_RULES = {
  minLength: 3,
  maxLength: 32,
  pattern: /^[a-z0-9_]+$/,
  hint: "3–32 chars · lowercase letters, numbers, underscore",
} as const;

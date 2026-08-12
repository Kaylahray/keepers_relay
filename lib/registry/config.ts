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

export const sudtType: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_SUDT_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_SUDT_HASH_TYPE),
  // Simple UDT requires owner lock hash (32 bytes) in type args.
  args: pick(process.env.NEXT_PUBLIC_SUDT_OWNER_LOCK_HASH),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_SUDT_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_SUDT_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_SUDT_DEP_TYPE),
};

export const rewardClaimType: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_REWARD_CLAIM_TYPE_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_REWARD_CLAIM_TYPE_HASH_TYPE),
  args: pick(process.env.NEXT_PUBLIC_REWARD_CLAIM_TYPE_ARGS),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_REWARD_CLAIM_BYTECODE_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_REWARD_CLAIM_BYTECODE_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_REWARD_CLAIM_BYTECODE_DEP_TYPE),
};

export const rewardTreasuryLock: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_REWARD_TREASURY_LOCK_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_REWARD_TREASURY_LOCK_HASH_TYPE),
  // Args must be the full script hash of `rewardClaimType`.
  args: pick(process.env.NEXT_PUBLIC_REWARD_TREASURY_LOCK_ARGS),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_REWARD_TREASURY_BYTECODE_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_REWARD_TREASURY_BYTECODE_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_REWARD_TREASURY_BYTECODE_DEP_TYPE),
};

export const chainCellType: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_CHAIN_CELL_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_CHAIN_CELL_HASH_TYPE),
  args: pick(process.env.NEXT_PUBLIC_CHAIN_CELL_ARGS, "0x"),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_CHAIN_CELL_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_CHAIN_CELL_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_CHAIN_CELL_DEP_TYPE),
};

export function chainCellConfigured(): boolean {
  return (
    chainCellType.codeHash.length > 2 &&
    chainCellType.outPoint.txHash.length > 2
  );
}

export function assertChainCellConfigured(): void {
  if (chainCellConfigured()) return;
  throw new Error(
    "Missing Chain Cell env — set NEXT_PUBLIC_CHAIN_CELL_* in `.env.local` from scripts/chain-cell/deployment/scripts.json.",
  );
}

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

export function sudtConfigured(): boolean {
  return (
    sudtType.codeHash.length > 2 &&
    sudtType.args.length > 2 &&
    sudtType.outPoint.txHash.length > 2
  );
}

export function rewardClaimsConfigured(): boolean {
  return (
    sudtConfigured() &&
    rewardClaimType.codeHash.length > 2 &&
    rewardClaimType.outPoint.txHash.length > 2 &&
    rewardTreasuryLock.codeHash.length > 2 &&
    rewardTreasuryLock.args.length > 2 &&
    rewardTreasuryLock.outPoint.txHash.length > 2
  );
}

export function assertRegistryConfigured(): void {
  if (registryConfigured()) return;
  throw new Error(
    "Missing registry env vars — copy `.env.local.example` to `.env.local` with all NEXT_PUBLIC_USERNAME_*, NEXT_PUBLIC_PROFILE_*, and NEXT_PUBLIC_CKB_JS_VM_* entries filled (from deployment/scripts.json after offckb deploy).",
  );
}

export function assertSudtConfigured(): void {
  if (sudtConfigured()) return;
  throw new Error(
    "Missing sUDT env vars — set NEXT_PUBLIC_SUDT_* in `.env.local` from deployed sUDT script metadata.",
  );
}

export function assertRewardClaimsConfigured(): void {
  if (rewardClaimsConfigured()) return;
  throw new Error(
    "Missing reward claim env vars — set NEXT_PUBLIC_REWARD_CLAIM_* and NEXT_PUBLIC_REWARD_TREASURY_* from deployed reward contracts.",
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

export const PROFILE_RULES = {
  nameMaxLength: 64,
  bioMaxLength: 280,
  headlineMaxLength: 80,
  maxSkills: 12,
} as const;

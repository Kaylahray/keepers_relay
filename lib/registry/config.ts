export type CkbNetwork = "devnet" | "testnet" | "mainnet";

export type ScriptConfig = {
  codeHash: string;
  hashType: "type" | "data" | "data1" | "data2";
  args: string;
  outPoint: { txHash: string; index: string };
  depType: "code" | "depGroup";
};

// IMPORTANT: Next.js / Turbopack only inlines `process.env.NEXT_PUBLIC_*` for the browser bundle when accessed via static property syntax.
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

/** The match script: holds a race's entries and pays whoever the game it names says won. */
export const liveMatch: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_SD_LIVE_CODE_HASH),
  hashType: asHashType(process.env.NEXT_PUBLIC_SD_LIVE_HASH_TYPE),
  args: pick(process.env.NEXT_PUBLIC_SD_LIVE_ARGS, "0x"),
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_SD_LIVE_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_SD_LIVE_INDEX, "0x0"),
  },
  depType: asDepType(process.env.NEXT_PUBLIC_SD_LIVE_DEP_TYPE),
};

/** Crown Rally, the live race game live-match spawns to judge a race. A code cell found by its data hash. */
export const rallyGame: ScriptConfig = {
  codeHash: pick(process.env.NEXT_PUBLIC_SD_RALLY_CODE_HASH),
  hashType: "data2",
  args: "0x",
  outPoint: {
    txHash: pick(process.env.NEXT_PUBLIC_SD_RALLY_TX_HASH),
    index: pick(process.env.NEXT_PUBLIC_SD_RALLY_INDEX, "0x0"),
  },
  depType: "code",
};

/** The relay that passes rally moves between phones: where it listens, and the lock it signs finishes with. */
export const rallyRelay = {
  url: pick(process.env.NEXT_PUBLIC_RALLY_RELAY_URL).replace(/\/+$/, ""),
  lockHash: pick(process.env.NEXT_PUBLIC_RALLY_RELAY_LOCK_HASH),
};

export function rallyConfigured(): boolean {
  return liveMatch.codeHash.length > 2 && liveMatch.outPoint.txHash.length > 2 && suddenDeathProxyLock.outPoint.txHash.length > 2 && rallyGame.codeHash.length > 2 && rallyGame.outPoint.txHash.length > 2 && rallyRelay.url.length > 0 && rallyRelay.lockHash.length > 2;
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

export function assertRegistryConfigured(): void {
  if (registryConfigured()) return;
  throw new Error(
    "Missing registry env vars — copy `.env.local.example` to `.env.local` with all NEXT_PUBLIC_USERNAME_*, NEXT_PUBLIC_PROFILE_*, and NEXT_PUBLIC_CKB_JS_VM_* entries filled (from deployment/scripts.json after offckb deploy).",
  );
}

// CKB tx fee estimation (shannons per kB) — passed to `completeFeeBy`.
/** Shannons per KB. High enough to beat a crowded pool, so a stake lands before the lobby fills: about 0.001 CKB per KB. */
export const REGISTRY_FEE_RATE = BigInt(100_000);

export const USERNAME_RULES = {
  minLength: 3,
  maxLength: 32,
  pattern: /^[a-z0-9_]+$/,
  hint: "3–32 chars · lowercase letters, numbers, underscore",
} as const;

# Deploy Event Engine v3 (yourself)

## Which wallet is the deployer?

From `ckb-cli account list` in your Downloads folder:

| # | Role | lock_arg | Testnet address |
|---|------|----------|-----------------|
| **2** | **Event / Chain deployer** (used for chain-cell + our Event scripts) | `0x51f46ec3662029b87cb65b058e72dc6a81b3e683` | `ckt1qzda0…chpye3e` |
| **0** | Funding wallet (`exported-key`) | `0x72f72b0cafd31de5072b10e84fc6c9d7d7596db7` | `ckt1qzda0…mr32ug` |
| **1** | Empty | `0xd8b74059…` | — |

Key file for account **#2**:  
`Downloads\ckb-cli_v2.0.0_…\exported-key-payer`

`deployment.toml` lock `args` **must** match the wallet that pays for the deploy.

---

## Why the old reward treasury feels “lost”

Reward claim/treasury were deployed with a **different** lock:

```text
args = 0x8e42b1999f265a0078503c4acec4d5e134534297
```

That is **not** account #0 or #2 above. If you no longer have that keystore, you **cannot** upgrade those code cells or top up that treasury as owner. Fix: **redeploy** reward-claim + reward-treasury with a lock you control (e.g. `0x51f46e…`), then update `.env.local`.

---

## ckb-cli vs offckb

| | **ckb-cli** | **offckb** |
|--|-------------|------------|
| What | Official wallet + deploy tool against any RPC (Pudge, mainnet, local) | Local **devnet** helper (node + faucet + deploy UX) |
| Best for | Real **testnet/mainnet** deploys | Fast local iteration |
| Needs | Funded testnet address | `offckb node` running locally |

We used **ckb-cli** because you already deploy to **Pudge testnet** (same as chain-cell).  
**offckb** is fine for practice; for Keepers Relay on Pudge, stick with **ckb-cli**.

---

## What to deploy (v3)

Binaries in `scripts/event-engine/build/release/`:

1. `event-type` (~63 KB → ~64k CKB capacity)
2. `participant-type` (~45k CKB)
3. `event-treasury-lock` (~47k CKB)
4. `reward-claim-type` (~44k CKB) — event settlement claims (separate from Spore PROOF rewards)

Optional later (old rewards package):

5. `reward-claim-type` + `reward-treasury-lock` from `ckb-claim-treasury-protocol` if you want PROOF badges again

**Rough free CKB needed:** ~200k+ for all four Event scripts (plus fees). Check:

```powershell
ckb-cli --url https://testnet.ckb.dev wallet get-capacity --address YOUR_DEPLOYER_ADDRESS
```

Faucet if short: https://faucet.nervos.org/

---

## One-time setup

```powershell
$cli = "$env:USERPROFILE\Downloads\ckb-cli_v2.0.0_x86_64-pc-windows-msvc\ckb-cli_v2.0.0_x86_64-pc-windows-msvc\ckb-cli.exe"
$url = "https://testnet.ckb.dev"
$pkey = "$env:USERPROFILE\Downloads\ckb-cli_v2.0.0_x86_64-pc-windows-msvc\ckb-cli_v2.0.0_x86_64-pc-windows-msvc\exported-key-payer"
$from = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2373hvxe3q9xu8edjmqk889hr2sxe7dqchpye3e"
$base = "c:\Users\chiom\Desktop\spore\keepers_relay\keepers_relay\scripts\event-engine"
```

Build (WSL):

```bash
cd /mnt/c/Users/chiom/Desktop/spore/keepers_relay/keepers_relay/scripts/event-engine
make build
```

---

## Deploy one script (repeat ×4)

Replace `NAME` with: `event-type` | `participant-type` | `event-treasury-lock` | `reward-claim-type`

### 1) Create folders + `deployment.toml`

```toml
[[cells]]
name = "NAME"
enable_type_id = true

  [cells.location]
  file = "C:/Users/chiom/Desktop/spore/keepers_relay/keepers_relay/scripts/event-engine/build/release/NAME"

[lock]
code_hash = "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
args = "0x51f46ec3662029b87cb65b058e72dc6a81b3e683"
hash_type = "type"
```

Path: `deployment/testnet/NAME/deployment.toml`  
Also create `deployment/testnet/NAME/migrations/`

### 2) gen → sign → apply

```powershell
& $cli --url $url deploy gen-txs `
  --from-address $from `
  --fee-rate 2000 `
  --deployment-config "$base\deployment\testnet\NAME\deployment.toml" `
  --info-file "$base\deployment\testnet\NAME\info.json" `
  --migration-dir "$base\deployment\testnet\NAME\migrations"

& $cli --url $url deploy sign-txs --local-only `
  --info-file "$base\deployment\testnet\NAME\info.json" `
  --privkey-path $pkey --add-signatures

& $cli --url $url deploy apply-txs `
  --info-file "$base\deployment\testnet\NAME\info.json" `
  --migration-dir "$base\deployment\testnet\NAME\migrations"
```

Wait until the tx is **committed** before the next script (avoids RBF / capacity fights).

### 3) Copy into env

From `info.json` → `new_recipe.cell_recipes[0]`:

- `type_id` → `NEXT_PUBLIC_*_CODE_HASH`
- `tx_hash` → `NEXT_PUBLIC_*_TX_HASH`
- `hash_type=type`, `index=0x0`, `dep_type=code`

Suggested env names:

```text
NEXT_PUBLIC_EVENT_CELL_*          ← event-type
NEXT_PUBLIC_PARTICIPANT_CELL_*    ← participant-type
NEXT_PUBLIC_EVENT_TREASURY_*      ← event-treasury-lock
NEXT_PUBLIC_EVENT_REWARD_CLAIM_*  ← reward-claim-type (event pot claims)
```

---

## Redeploy old PROOF reward scripts (optional)

```bash
cd ckb-claim-treasury-protocol/reward-contracts
make build
```

Use the **same** `args = 0x51f46e…` lock as above, then update `NEXT_PUBLIC_REWARD_*` in `.env.local`.

---

## After all code hashes are live

1. Restart `pnpm dev`
2. Wire TS layouts / tx builders to v3 (2576-byte Event + participant + treasury)
3. Only then put real testnet CKB into event treasuries

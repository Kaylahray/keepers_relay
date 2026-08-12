# Chain Cell type script (Rust)

Native CKB type script for Keepers Relay living Cells — same stack as
`ckb-claim-treasury-protocol/reward-contracts` (`ckb-std` + `ckb-testtool`).

```text
keepers_relay/keepers_relay/
  app/ …                         ← Next.js product
  scripts/
    chain-cell/                  ← this workspace (Rust)
      contracts/chain-cell-type/
      tests/
      deployment/
```

The earlier TypeScript (`ckb-js-vm`) scaffold was removed in favour of Rust to
match the claim treasury / reward scripts.

## Rules (v1)

| Path | Group | Checks |
|------|--------|--------|
| Genesis | 0→1 | alive, `owner_count≥1`, `window≥60s`, 116-byte data |
| Handoff | 1→1 | input alive; `owner_count+1`; same chain_id/mode/window; expiry advances ≈ one window (±2 min); lock changes if status stays alive |
| Return home (final) | 1→1 | same as handoff, but output `status=returned` (finished journey back to creator) |
| Burn | 1→0 | allowed |
| Cardinality | — | never 2+ cells in the type group |

**Modes** (field in cell data; product rules mostly enforced in the app today):

- `open` (0) — anyone can receive; chain stays alive until it dies or burns.
- `return_home` (1) — unique holders only (except creator), then last pass sets `status=returned` and lock = creator. Script enforces mode stickiness + returned status; unique-holder checks are still app-layer.

## Build & test

Needs: Rust toolchain, `riscv64imac-unknown-none-elf` target, clang 16+ (same as reward-contracts).

```bash
cd scripts/chain-cell
make prepare
make build
make test
```

On Windows, use Git Bash / WSL for `make` (same as your reward-contracts flow).

### RISC-V atomics (rustc ≥1.95)

CKB-VM has no real atomics. Older templates used `-C target-feature=…,-a`.
On rustc 1.95+ / LLVM 22 that breaks compiling `bytes` with:

`rustc-LLVM ERROR: Cannot select AtomicLoadAdd`

Official fix ([Nervos Talk](https://talk.nervos.org/t/compilation-errors-encountered-when-upgrading-rust-on-chain-script-to-ckb-std-v1-1/10389), [ckb-std README](https://github.com/nervosnetwork/ckb-std#upgrading-issues)):

- keep `ckb-std >= 1.1`
- Makefile: drop `,-a`, add `-C passes=lower-atomic`

## Deploy

Testnet (2026-08-11): [tx `0x32d24cfd…8488`](https://pudge.explorer.nervos.org/transaction/0x32d24cfd90b996e46e8ee01ac3ddf10d0b2c4b86f95ce29e7d939c09979c8488)

- `code_hash` (type-id): `0xbb7ab79a409b728c4444bb229291f516776744b9eb313d2d0477ba759a9079f9`
- `hash_type`: `type`
- cell dep: that tx, index `0`, `dep_type: code`

Env: `NEXT_PUBLIC_CHAIN_CELL_*` in `.env.local`.

Launch mints a genesis Cell; Pass / accept-handoff spends it and creates the successor (recipient = `@username` or `ckt` address). Demo streaks without `cellOutPoint` still use the store only.

## Later

- Indexer as source of truth for live Cell state
- Header / `since` expiry on-script

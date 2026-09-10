# Keepers Relay Event Engine — CKB scripts (v3)

Build layout: ckb-std + RISC-V + clang (`make prepare && make build`).

| Contract | Binary | Role |
|----------|--------|------|
| `event-type` | `event-type` | Event state machine + roster + clock |
| `participant-type` | `participant-type` | One entry proof per player |
| `event-treasury-lock` | `event-treasury-lock` | Pot = real CKB |
| `reward-claim-type` | `reward-claim-type` | Settlement claim tickets |

`protocol-common` is a shared `rlib` (not deployed).

See `PROTOCOL_DECISIONS.md`, `DEPLOY.md`, `TRANSACTION_CASES.md`.

## Build

```bash
cd scripts/event-engine
make prepare
make build
```

On Windows: WSL / Git Bash.

## Deploy

```bash
ckb-cli --url https://testnet.ckb.dev deploy gen-txs ...
```

Fill `deployment/scripts.json` after deploy → `NEXT_PUBLIC_EVENT_*` env.

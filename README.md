# Crowns

Crowns is a live 3D car race on Nervos CKB. Up to five players put in the same entry, race three laps at once, and the winner takes the pot. The chain decides who won. Before any CKB moves, the match script replays the whole race from the players' signed moves and pays only the real winner.

## How a race works

1. **Host.** The host picks a track (Harbour Loop, Switchback Hill or Old Town), the seats (2 to 5) and the entry (10, 25, 50 or 100 CKB), then puts their entry in. This opens a match cell on chain.
2. **Join.** Anyone with the link takes a seat by putting in the same entry. Each seat is its own cell, so players join without touching each other's cells. The lobby runs for 2 minutes, or until every seat is taken.
3. **Race.** A 5-second countdown, then 3 laps. Each phone drives its own car and signs its moves with a session key, so there are no wallet prompts while racing. Pick up items on the road (Ram, Slick, Jolt, Barricade, Crown Rush), use boost pads, and collect shards.
4. **Finish.** When the race ends, the relay sends the finish transaction. The match script runs the race game, which replays every car's moves and returns the places. The first car over the line takes every entry. Cars that cross on the same tick split it.
5. **Trophy.** The winner can claim a trophy, minted as a Spore NFT, and it shows on their profile.

If nobody joins, the host's entry goes back. If something breaks, every seat and the match cell can be taken back by their owners once the match times out, so no CKB is ever stuck.

**Practice** is free, runs against two bots on the same rules, and puts nothing on chain.

## Why a relay

The chain judges the race, but it can't run it live. The relay (`rally-relay/server.mts`) runs each lobby, keeps the race clock, passes each car's moves between the players in real time, and sends the finish at the end. It never decides who wins: the chain replays the record and pays only a winner whose own key signed their moves. With no winner, the relay can only send every entry back.

## On-chain scripts

Written in Rust for CKB-VM, in `scripts/sudden-death/contracts/` ("Sudden Death" is the internal name).

| Script | Purpose |
| --- | --- |
| `live-match` | The match: holds the host's entry and every seat, and pays whoever the race game says won. Works with any game that keeps the game ABI. |
| `rally` | The race game. `live-match` spawns it and asks it to judge the race record. |
| `rally-core` | The race rules, shared by the chain, the browser and the relay (compiled to WebAssembly in `rally-wasm/`). |
| `game-api` | The game ABI between `live-match` and a game, over ckb-script-ipc. |
| `common` | Shared helpers. |

All game math uses integers, so the browser, the relay and the chain always get the same result. Other pieces: the Input Type Proxy Lock, the username and profile registries (ckb-js-vm), Spore for profile pictures and trophies, and JoyID or any CCC wallet.

## Project structure

| Path | Contents |
| --- | --- |
| `app/` | Pages (`/`, `/rally`, `/rally/[id]`, `/rally/practice`, `/players`, `/leaderboard`, `/profile`, `/join`) and API routes |
| `components/rally/` | The race: lobby, 3D screen, HUD, results, trophies |
| `components/crowns/`, `components/views/`, `components/ui/` | Pages, boards and shared UI |
| `lib/rally/` | Race rules loader, chain transactions, relay protocol, 3D scene, sound |
| `lib/registry/` | Usernames, profiles and script configuration |
| `lib/server/`, `lib/db/` | Database access (Neon Postgres) and sign-in |
| `hooks/`, `context/` | Wallet, sign-in, profile and stats hooks |
| `rally-relay/` | The relay server and its Dockerfile |
| `public/games/rally.wasm` | The race rules for the browser and relay |
| `scripts/sudden-death/` | On-chain scripts, tests and deployment |
| `scripts/crowns-devnet/` | Local devnet deploy and end-to-end race test |
| `scripts/crowns-testnet/` | Testnet tools: env values, cell inventory, reclaim |

## Running locally

```bash
cp .env.local.example .env.local
pnpm install
pnpm dev
```

In `.env.local`, set `DATABASE_URL` (Neon, pooled connection), `AUTH_SECRET` (a long random string) and `RALLY_RELAY_KEY` (a private key only the relay uses). The other values already point at the testnet scripts.

Then start the relay in a second terminal:

```bash
pnpm relay --whoami   # prints the relay's lock hash and the address to fund (61 CKB or more)
pnpm relay            # runs it on port 8787
```

Set `NEXT_PUBLIC_RALLY_RELAY_URL=http://localhost:8787` and `NEXT_PUBLIC_RALLY_RELAY_LOCK_HASH` to what `--whoami` printed.

## Deploying

**The site** goes on Vercel. Add every `NEXT_PUBLIC_*` value, `DATABASE_URL` and `AUTH_SECRET`. Never put `RALLY_RELAY_KEY` on Vercel.

**The relay** needs a server that stays on, such as Render, Railway or Fly. Build it with `rally-relay/Dockerfile` from the repo root, with the health check on `/health`. Give it `RALLY_RELAY_KEY` plus the `NEXT_PUBLIC_CKB_*`, `NEXT_PUBLIC_SD_LIVE_*`, `NEXT_PUBLIC_SD_RALLY_*` and `NEXT_PUBLIC_SD_PROXY_*` values. Then set `NEXT_PUBLIC_RALLY_RELAY_URL` on Vercel to the relay's address and redeploy the site.

`NEXT_PUBLIC_` values are built into the app, so redeploy after changing them.

## Testing

```bash
# On-chain script tests (Rust; use WSL on Windows)
cd scripts/sudden-death && cargo test -p tests --release

# A full race on a local devnet: real relay, bot drivers
offckb node
pnpm exec tsx scripts/crowns-devnet/deploy.ts
pnpm exec tsx scripts/crowns-devnet/rally-e2e.ts
```

## Deploying the scripts

Build with `make build` in `scripts/sudden-death`, then deploy with `ckb-cli deploy` from `scripts/sudden-death/deployment/testnet/rally/` (the steps are at the top of its `deployment.toml`). Afterwards, print the new env values:

```bash
pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts
```

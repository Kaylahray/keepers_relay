# Crowns

Crowns is a set of skill games on Nervos CKB. Players stake CKB, and the chain decides who wins. Stakes are held in cells controlled by on-chain scripts. Before any CKB is paid out, the scripts replay the game from the recorded moves and pay only the real winner.

## Games

**Crowns** are king-of-the-hill games for many players. A host opens a crown with an entry fee and a clock. Players drive 5 laps of the lane runner. A higher score takes the crown, adds the entry to the pot and shortens the clock. The player holding the crown when the clock runs out wins the pot.

**Duels** are one-on-one games. Both players lock the same stake and play one of two games:

- **Artillery**: players take turns firing over a tower. Each shot sets an angle and power, and the wind changes every turn.
- **Lane race**: both players drive the same 5 laps.

The winner takes both stakes. In a draw, each player gets their stake back.

## How a crown works

1. **Open.** The host sets the entry fee, the clock and a title, then starts the crown. This creates a match cell and a treasury cell. A 3-minute entry window lets players join before play begins.
2. **Practise.** Practice runs are free and use the same rules as the chain.
3. **Enter.** The player pays the entry fee. The app creates a temporary session key, so laps can be sent without a wallet prompt each time.
4. **Drive.** Each lap's road comes from the block in which the previous lap was saved, so no one can see a lap in advance. Each lap must be saved within 3 minutes.
5. **Take the crown.** A finished run that beats the current score takes the crown. The match script replays every lap and accepts only a higher score. The clock starts at 10 minutes, halves every two takeovers, and never drops below 72 seconds.
6. **Close.** After the deadline, anyone can close the crown without a signature. The pot goes to the last player who took the crown in time. Unused entries are refunded.

## How a duel works

1. **Challenge.** The challenger picks the game, the opponent (or leaves it open to anyone) and the stake. Artillery also has a turn timer: Classic, or Pressure, where each turn is 5 seconds shorter, down to a minimum of 30 seconds.
2. **Accept.** The opponent locks the same stake. The block that includes this step sets the battlefield.
3. **Play.** Moves are signed with a session key, so there are no wallet prompts during play. If a player misses a turn, anyone can skip it.
4. **Finish.** The game ends when a tank is destroyed, after 30 turns, or when race time runs out. Anyone can then send the payout. The duel script replays the full game and pays the winner.

Any game can be checked at `/verify`. Paste a transaction hash and the page replays the game from the chain, in the browser.

## On-chain scripts

The scripts are written in Rust for CKB-VM v2 and live in `scripts/sudden-death/contracts/`. "Sudden Death" is the internal name used in the code.

| Script | Purpose |
| --- | --- |
| `match-type` | Crown match cell: open, take the crown, close |
| `treasury-lock` | Holds the crown pot and pays the winner at close |
| `bid-type` | A player's entry: proof of work, saved laps, refund |
| `duel-type` | Duels: open, cancel, accept, shot, skip, race result, finish |
| `lane-runner` | Replays a lane runner run and returns the score |
| `artillery` | Replays a duel's shots and returns the result |
| `game-core` | Lane runner rules, shared by the chain and the browser (WebAssembly) |
| `artillery-core` | Artillery rules, mirrored in `lib/duel/artillery.ts` and tested for matching results |
| `common` | Shared cell layouts, clock rules and helpers |

The scripts that hold money do not contain game rules. They run the game script and read its result, so the rules exist in one place. All game math uses integers, so the browser and the chain always get the same result.

Other components: the Input Type Proxy Lock, the username and profile registries (ckb-js-vm), Spore for profile pictures, and JoyID or any CCC-supported wallet.

### Pudge testnet deployment (v5)

Deployed with `ckb-cli deploy` from `scripts/sudden-death/deployment/testnet-v5/crowns/`. All cell references are in `.env.local.example`.

| Script | Type ID |
| --- | --- |
| match-type | `0x3e1240fd9efbb38e72466449301ef2a96f5554ca4cd9a0a0ff16623290a01d34` |
| bid-type | `0x5c41a20b5b4361448b8fd3fde00dfbd4464d0f1d7abb66e7b8729cbce61671ac` |
| treasury-lock | `0x7dab4b0d44d7ab6b2df6befa902ac4268f5c8c4e29a8bc90eb52a90711b99241` |
| duel-type | `0x726d6e4b30737e5caade98ee78f25fcfd7d495ea76971861768c4e267e20b0d1` |

Crowns from earlier deployments (v1, v2, v4) can still be checked at `/verify`.

## Project structure

| Path | Contents |
| --- | --- |
| `app/` | Pages and API routes |
| `components/ui/` | Shared UI components |
| `components/crown/`, `components/duel/` | Crown and duel screens, including the artillery game |
| `components/game/` | Lane runner game and run playback |
| `lib/crown/`, `lib/duel/` | Building and reading crown and duel transactions |
| `lib/game/` | Lane runner WebAssembly loader |
| `lib/sudden-death/` | Cell layouts, seeds and the replay check used by `/verify` |
| `lib/registry/` | Usernames, profiles and script configuration |
| `lib/server/`, `lib/db/` | Database access (Neon Postgres): crowns, players, sign-in |
| `hooks/`, `context/` | Wallet, sign-in and profile hooks |
| `scripts/sudden-death/` | On-chain scripts, tests and deployments |
| `scripts/crowns-devnet/` | Local devnet deployment and end-to-end tests |
| `scripts/crowns-testnet/` | Testnet tools: config check, inventory, reclaim, stats backfill |

## Running locally

```bash
cp .env.local.example .env.local
pnpm install
pnpm dev
```

Set `DATABASE_URL` (Neon, pooled connection) and `AUTH_SECRET` (a long random string) in `.env.local`. The other values already point to the Pudge testnet v5 scripts. The database stores crown lobbies and player data. Games and duels are read from the chain.

Players sign in by signing a message with their wallet. The server checks the signature and sets a session cookie that lasts seven days.

## Testing

```bash
# On-chain script tests (Rust; use WSL on Windows)
cd scripts/sudden-death && cargo test -p tests --release

# End-to-end tests on a local devnet
offckb node
pnpm exec tsx scripts/crowns-devnet/deploy.ts
pnpm exec tsx scripts/crowns-devnet/e2e.ts        # a full crown
pnpm exec tsx scripts/crowns-devnet/duel-e2e.ts   # duels: artillery, race, skips, payout
```

## Deploying the scripts

From `scripts/sudden-death/deployment/testnet-v5/crowns/`, run `ckb-cli deploy gen-txs`, then `sign-txs`, then `apply-txs`. A new migrations folder creates new cells. An existing one upgrades them and keeps their type IDs.

After deploying:

```bash
# Print the environment values for the deployment
pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts

# Check the app configuration against the chain
pnpm exec tsx scripts/crowns-testnet/check-config.ts

# Rebuild player stats from the chain
pnpm exec tsx --env-file=.env.local scripts/crowns-testnet/backfill-steals.ts
```

`NEXT_PUBLIC_` values are built into the app, so redeploy the site after changing them.

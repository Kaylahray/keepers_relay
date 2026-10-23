# Crowns

A live skill game on CKB. A host opens a crown with an entry fee and a clock. Players run a short
arcade game in the browser, and a run that beats the standing score takes the crown. Each steal
adds the entry fee to the pot and cuts the clock. Whoever holds the crown when the clock runs out
takes the whole pot.

Runs are not taken on trust. The match script replays the run on chain before the crown moves, so
the score that wins is the score the chain computed.

## How a match works

1. **Open.** The host picks a game, a clock and an entry fee, shares the lobby link, then starts
   the clock. That writes the match cell: game, fee, pot, king, score to beat and deadline.
2. **Play.** Players run the game as often as they like. It costs nothing until a run beats the
   score to beat. Each player gets their own course, seeded from the match and their lock.
3. **Steal.** The player locks one entry (a bid cell) and sends the run. The match script spawns
   the game script, replays the recorded inputs, and accepts only a higher score from a new king.
   The pot grows by the fee and the clock shrinks: 10 minutes first, halving every two rounds,
   down to a 72 second floor.
4. **Close.** After the deadline anyone can close the match. The king gets the pot. Unused entries
   can be refunded an hour after the deadline.

## On-chain scripts

All in `scripts/sudden-death/` (Rust, CKB-VM v2).

| Script | Role |
| --- | --- |
| `match-type` | The match cell: open, steal (with the replay) and close rules |
| `bid-type` | Entry cells: one per steal, refundable after the deadline |
| `treasury-lock` | Holds the pot until the match closes |
| `lane-runner` | The game. Reads a seed and an input tape, writes the score |
| `game-core` | The lane runner rules, shared by the chain script and the browser (wasm) |

Games plug in through one small interface. The match script spawns the game script by data hash,
with the seed and the input tape as its argument, and reads back a `u64` score. A new game is a new
script that follows that interface; the match script does not change.

Also used: the Input Type Proxy Lock, the username and profile registries (ckb-js-vm), Spore for
avatars, and JoyID or any CCC wallet to sign in.

### Pudge testnet

| Cell | Reference |
| --- | --- |
| Deploy transaction | `0xc9f1f7a3da0aaed8b6f0a0c98614b7c75756db89c938cb7c1f1e5447070301d4` |
| match-type (type id) | `0xbb388fcce8ceef841e98a614f49281032fd66ae57f20aecbc6167ad766b0813f` |
| bid-type (type id) | `0xa76ff5305f3b76692a3fe513a2ee5407164f21344d2d0c8eb93288be3051c78b` |
| treasury-lock (type id) | `0x9e94bb5a49f906bc36bf8059cd8719f16e4f90aad6b76e6aa9ed55cb78c1be75` |
| lane-runner (data hash) | `0xffac03926858495fb6481b1ef64d9a801db214eacb1847ab8e30cc63a35830f2` |

## Repository layout

| Path | What |
| --- | --- |
| `app/`, `components/`, `hooks/`, `context/` | Next.js app: lobby, play screen, host desk, watch, verify, profiles |
| `lib/crown/` | Crowns on the client: rooms, chain transactions, the shared clock |
| `lib/game/`, `components/game/` | The lane runner in the browser, on the same rules as the chain |
| `lib/sudden-death/` | Cell layouts, seeds and run witnesses, and the replay check used by `/verify` |
| `lib/server/` | API storage on Neon Postgres: lobbies, seats, profiles, steal history, sign-in |
| `scripts/sudden-death/` | On-chain scripts, their tests, and the wasm build of the game |
| `scripts/crowns-devnet/` | Local devnet deploy and an end-to-end match |
| `scripts/crowns-testnet/` | Testnet config, inventory, reclaim and steal-history tools |

## Run it

```bash
cp .env.local.example .env.local
pnpm install
pnpm dev
```

Set `DATABASE_URL` (Neon, pooled) and `AUTH_SECRET` (any long random string) in `.env.local`. The
example already points at the Pudge testnet scripts above. Leave the `NEXT_PUBLIC_SD_GAME_*` values
empty to play in practice mode with nothing on chain.

Sign-in is a message signature: the server checks that the key that signed owns the address, then
sets a seven-day session cookie.

## Test it

```bash
# On-chain scripts, including every rejection path (Rust; WSL on Windows)
cd scripts/sudden-death && cargo test -p tests --release

# A whole match on a local devnet, through the app's own chain code
offckb node
pnpm exec tsx scripts/crowns-devnet/deploy.ts
pnpm exec tsx scripts/crowns-devnet/e2e.ts
```

## Deploy the scripts

The testnet scripts are deployed with `ckb-cli deploy` from `scripts/sudden-death/deployment/testnet-v2/crowns/`:
`gen-txs`, then `sign-txs`, then `apply-txs`. A new migrations folder deploys new cells; an
existing one upgrades them in place, keeping their type ids. Then:

```bash
# Print the env values for the new deployment
pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts

# Check the app config against the chain
pnpm exec tsx scripts/crowns-testnet/check-config.ts

# Fill player stats from the chain (also runs on the first profile view)
pnpm exec tsx --env-file=.env.local scripts/crowns-testnet/backfill-steals.ts
```

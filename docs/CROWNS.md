# Keepers Relay — Crowns

Crowns is the live game: a shrinking clock and a growing pot, with a crown that moves to whoever posts the best score. Players run a short arcade game (the lane runner) in the browser. A run that beats the standing score can be submitted, and the match script **replays the run on chain** before it lets the crown move. Nobody signs a steal, and nobody — host, server, or this site — can decide who wins.

Version 2 (2026-10) replaced the four-option quiz. The quiz let the host win their own match (they knew every answer), let anyone copy an answer proof out of the mempool, and shipped a default bank whose salts were public. See "Why v2" at the end.

## One match, from lobby to payout

1. The host opens a crown on **Host** (`/create`): the game, a title, the length and the entry fee. This saves the lobby on the server. No transaction yet.
2. The host presses **Start the clock**, their only game signature. It creates the match cell and the treasury cell. The match cell records the deadline, the fee, the game (the data hash of the game script), the treasury and bid scripts, a king score of 0, and an empty king. The deadline carries a 3-minute pad that the screens show as an entry window (`lib/crown/phase.ts`).
3. Every player gets their own course for this match: `seed = blake2b("crowns/run-seed/v1" ‖ match id ‖ their lock hash)`. Practice is free and unlimited.
4. To play for the pot a player locks an entry: a bid cell holding the fee plus 0.1 CKB of fee reserve. It is the player's only game signature. The bid locks to itself (Input Type Proxy Lock with args = its own type hash), so bid-type alone decides how it is spent. It records `refund_after = deadline + 1 hour`.
5. A run that beats the crown is submitted as a steal: the match cell, the treasury and the bid in, a run witness (`version ‖ tape`, where the tape is `tick u16 ‖ lane u8` events) in the match cell's `input_type`. `match-type` spawns the game script (CKB-VM v2 `spawn`), which replays the tape on the stealer's course and returns the score. The steal is valid only if that score beats the stored king score and is the score written back, the new king is a different lock, the pot grows by exactly the fee, and the deadline is exactly `shrunk_deadline(old, round)`: 10 minutes off at round 1, halving every two rounds, never under 72 seconds.
6. One steal can confirm per match cell. If two land together, one wins; the other player's run is still theirs and can be resubmitted if it still beats the new crown.
7. **Close the crown** spends the match cell and the treasury once the chain's median time passes the deadline. Anyone may send it. The king receives the pot, the host the rest, and every entry included goes back to its owner. An entry left out can be returned by anyone after its `refund_after`, to its owner only.

The deadline is enforced only as "not before": CKB scripts cannot say "not after". After the clock hits zero the match is in overtime until a close lands, and a better run can still take the crown. Median time lags the wall clock by a couple of minutes, so a close lands a little after zero.

A full two-minute run costs about 1.44M cycles to verify, under 0.05% of a block. The browser runs the same Rust rules compiled to wasm (`scripts/sudden-death/game-wasm`, served from `public/games/lane-runner.wasm`), so the score a player sees is the score the chain computes.

### Testing it locally

`offckb node` starts a devnet. `pnpm exec tsx scripts/crowns-devnet/deploy.ts` deploys the five code cells and writes `scripts/crowns-devnet/.env.devnet`. `pnpm exec tsx scripts/crowns-devnet/e2e.ts` then plays a whole match through `lib/crown/chain.ts` with three devnet accounts and checks the chain after every step. The script tests (`cargo test -p tests` in `scripts/sudden-death`) cover every rejection path with its exact error code.

### Why v2

- The host sealed the bank, so the host knew every answer and could win their own match from a second wallet.
- An answer proof sat in the steal witness and named nobody, so a mempool watcher could copy it into their own steal.
- The built-in floor bank used fixed salts published in the source, so anyone could compute every proof.
- Questions had to be answered in order and the bank capped the rounds, so early steals were donations and the last question decided everything.
- An AI answers trivia in under a second.

A score that the chain replays on a course bound to the player fixes the first four. Bots can still play a deterministic game, as they can any game; the chain proves a run is legal, not that a person played it.

## Frontend

The app is Next.js in `keepers_relay/keepers_relay`. Wallet connection is JoyID through CCC. The header treats the wallet as connected when JoyID has restored (`isConnected`). The server login cookie is a separate signature used for profile and communities.

| Route | What it is |
| --- | --- |
| `/` | Home. |
| `/play` | Crown list. **Play the floor** seals the built-in bank and publishes a lobby. |
| `/play/{id}` | The lobby, then the live question. Invite link, seats, green pulse, **Start the clock**, **Lock your entry**, answers. |
| `/create` | Host bank. Clock, questions, seal. |
| `/host/{id}` | Host desk. Closing fee. The lobby itself is on `/play/{id}`. |
| `/watch/{id}` | Watch view of a crown. |
| `/profile` | The connected wallet’s builder profile. |
| `/communities` | Clubs. Separate from the match. |

Main crown files:

- `components/crown/OpenCrownView.tsx` — write and seal a bank.
- `components/crown/CrownsLobby.tsx` — the list and Play the floor.
- `components/crown/CrownLobby.tsx` — seats, invite, host start.
- `components/crown/CrownPlayView.tsx` — the live question, lock, answer, errors.
- `components/crown/useCrown.ts` — loads the shared crown and keeps this browser’s secrets and bid.
- `lib/crown/rooms.ts` — the crown record, local save, kickoff, steal bookkeeping.
- `lib/crown/chain.ts` — the four CKB transactions.
- `lib/crown/remote.ts` — calls the crown API.
- `lib/sudden-death/codec.ts` — Merkle root, steal proof, match-cell bytes. The same layout the script uses.

This browser keeps a copy of crowns in `localStorage` under `keepers-crowns`. The server copy is what other browsers join. The browser that sealed the bank keeps the real salts. Every other browser receives questions with the correct index forced to 0 and the salt zeroed, plus `answersOnServer: true`. Those browsers ask `POST /api/crowns/{id}/proof` when a player picks an option. The server returns a proof only when the choice matches the vault.

JoyID approval is the phone’s passkey: Face ID, Touch ID, fingerprint, or the device PIN. It appears for **Start the clock** and for **Lock your entry**. A steal does not ask again.

### The four transactions the UI builds

**Start the clock** (`openMatch`). Host signs. Outputs are the match cell and the treasury. The match lock is the proxy, with args equal to the match type hash. Match type args are 64 bytes: a type id, then the host lock hash. The deadline written into the cell is the moment the button is pressed, plus 12 seconds, plus 3 minutes. The 3 minutes is spare time so the JoyID prompt does not eat the clock before the question appears. It is not a separate “lock your entry” timer. After the host approves, every browser counts down whatever is left of that one deadline.

**Lock your entry** (`lockBid`). Player signs. The bid type args are 64 bytes: match type hash, then the player’s lock hash. Bid data is version byte `1` plus the player’s full lock script. Capacity is the cell’s occupied size, plus the entry fee, plus 0.1 CKB (`MAX_TX_FEE`, 10,000,000 shannons) reserved for the later steal fee. The live match cell is a dependency. If that cell has not confirmed yet, the app tells the player to wait. A bid signed against an outpoint that a steal has already consumed must be approved again. The message is: “The match moved on. Approve once more to enter.”

**Steal** (`stealCrown`). No player signature and no host signature. Inputs are the match cell (`since` 0, so it does not look at the deadline), the treasury, and the player’s bid. The witness on input 0 is the Merkle proof. The match cell comes back with round + 1, pot + fee, deadline + bonus, and the bid owner as king. The treasury grows by the entry fee. The owner is paid the bid capacity minus the entry fee minus the 0.1 CKB reserve. The app will not build this until the match transaction it is spending has confirmed.

**Close the crown** (`closeCrown`). The keeper wallet pays the fee. The match and treasury inputs use an absolute timestamp `since` of the deadline in seconds. The script rejects the close until median time has reached that second. The king is paid the pot. The host is paid the match capacity plus whatever of the treasury is not the pot. If king and host are the same lock, that lock must receive the combined total. Bids for this match are included so their owners are refunded. A bid omitted here cannot be recovered later.

## Backend

The server is the same Next.js app. Neon Postgres is the shared database, reached with `DATABASE_URL`. Crown routes call `respond()`, which also makes sure the social tables exist.

### Crown API

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/crowns` | Public list. No salts, no correct answers. |
| `POST` | `/api/crowns` | Save a newly sealed crown, including the secret vault. |
| `PUT` | `/api/crowns` | Update live fields: round, king, pot, deadline, outpoints, feed. |
| `GET` | `/api/crowns/{id}` | Public room plus seats. |
| `POST` | `/api/crowns/{id}` | Join or heartbeat. Optional bid outpoint. `clearBid` drops a spent bid. |
| `POST` | `/api/crowns/{id}/proof` | Body is `{ questionIndex, choice }`. Returns a steal-proof hex only if that choice is the vault’s correct index. |

Table: `keepers_crowns` (`id` text primary key, `payload` jsonb, `updated_at`). The payload holds the full room, the host address, and the seats. `GET` always runs the room through `publicRoom` before it leaves the server. A sync whose salts are all zeros does not replace the vault questions, so a player’s browser cannot wipe the answer key. The first browser to set `hostAddress` keeps it.

A seat is `{ address, displayName, joinedAt, lastSeenAt, bidOutPoint }`. The lobby shows a green pulse when `lastSeenAt` is within 20 seconds. Joining does not create a CKB cell.

The proof endpoint is the only way a phone that did not seal the bank can steal. The server compares the choice to the vault and builds the proof with the same `stealProof` function the host browser uses. It does not submit the transaction. The player’s browser does.

### What else the server stores

These are the social and profile product, not the match:

- `keepers_builders`, `keepers_communities`, `keepers_community_members` — profiles and clubs.
- `keepers_app_snapshots` — older snapshot blob.
- `/api/auth/challenge`, `/api/auth/verify`, `/api/auth/session` — a wallet signature for the server session.
- `/api/builders`, `/api/communities`, `/api/passport`, `/api/home` — profile and club reads.
- `/api/rewards/*` — badge and reward issuance. Separate from the crown pot.

`relay_events` and the tables next to it belong to the parked event product. Crowns do not use them.

## Contracts

Rust scripts in `keepers_relay/keepers_relay/scripts/sudden-death`. They are `no_std`, built for RISC-V (`riscv64imac-unknown-none-elf`) from WSL. Tests live in `scripts/sudden-death/tests`.

Three game scripts, plus a copy of the Input Type Proxy Lock that we deploy ourselves. The official third-party outpoint is not the cell dep. The proxy code hash is fixed in the game scripts:

`0x5123908965c711b0ffd8aec642f1ede329649bda1ebdca6bd24124d3796f768a`

Hash type is data1, which is byte `2`. Args are exactly 32 bytes. On a match cell and on a bid cell those args are the match type hash. The proxy is what lets a steal spend the cell without the host’s or the player’s signature, while still requiring the type script to agree.

### Match type

Args: 64 bytes. Bytes 0–32 are the type id. Bytes 32–64 are the host lock hash.

Cell data is 158 bytes:

| Offset | Bytes | Field |
| --- | --- | --- |
| 0 | 1 | version `1` |
| 1 | 1 | status, `0` live |
| 2 | 4 | round, starts at `1` |
| 6 | 8 | deadline, milliseconds |
| 14 | 8 | entry fee, shannons |
| 22 | 8 | pot, shannons |
| 30 | 32 | king lock hash, zeros until the first steal |
| 62 | 32 | Merkle root |
| 94 | 32 | treasury lock hash |
| 126 | 32 | bid type code hash |

Modes:

- **Create** `(0 inputs, 1 output)` in the type group. Type id must match. Round 1, pot 0, king empty, root not empty, fee and deadline not zero, treasury present, bid code hash present, proxy lock on the output.
- **Steal** `(1 input, 1 output)`. Root, fee, treasury hash, and bid code hash stay the same. Round increases by 1. Pot increases by the fee. Deadline decreases by `shrink_ms(round)`, never below 1000 ms. Capacity of the match cell does not change. Exactly one bid of this match is an input, and none are outputs. The new king is that bid’s owner. The treasury output is larger by the fee. The Merkle proof is the input-type witness. `since` on the steal is 0.
- **Settle** `(1 input, 0 outputs)`. The match cell is consumed. `since` must be an absolute timestamp in seconds, at least `deadline_ms / 1000`. The treasury must be an input and must not be an output. The treasury script checks the payments.

The leaf hash is blake2b of: leaf tag, match id, question index, hash of the question text, correct index, option count, and salt. The root is a binary Merkle tree. Banks must be 2, 4, 8, 16, 32, or 64 questions. The script allows a proof path of at most 6.

### Bid type

Args: 64 bytes. Bytes 0–32 are the match type hash. Bytes 32–64 are the owner lock hash.

Data: version `1`, then the owner’s full molecule script. The blake2b of that script must equal the owner half of the args.

- **Create.** Owner is not zero. Proxy lock. The live match cell is a cell dep, not an input. Capacity is at least occupied size + entry fee + 0.1 CKB.
- **Steal consume.** The match cell is both an input and an output. This owner’s bid inputs are spent. The owner must receive at least bid capacity − entry fee − 0.1 CKB. The pot is not paid here.
- **Refund consume.** The match cell is an input and not an output, so this is cleanup. The owner is paid the sum of their bid capacities. If the owner is the king, the pot is added. If the owner is the host, the host share is added. If the owner is both, both are added. The check is per owner, so one transaction can pay every owner who is included.

### Treasury lock

Args: the 32-byte match type hash. The cell holds the pot as capacity.

- **Create** with the match. Pot in the match data is 0. The match data names this lock.
- **Steal.** Pot and capacity both grow by exactly the entry fee.
- **Close.** Match is an input and not an output. The same `since` rule as settle. Then `claim`:
  - Empty king: the host must receive match capacity + treasury capacity, and the pot must be 0.
  - King is the host: that one lock must receive match capacity + treasury capacity.
  - King is someone else: the king receives at least the pot, and the host receives match capacity + treasury capacity − pot.

The treasury binary on testnet was left in place. Match and bid were upgraded in place by type id, so their code hashes did not change. The proxy was deployed as our own code cell.

### Error codes

Shared by the three scripts. A failing script returns one of these:

| Code | Name | Meaning |
| --- | --- | --- |
| -1 | `ERR_LEN` | Bad args or data length |
| -2 | `ERR_MODE` | Not create, steal, or settle |
| -3 | `ERR_POT` | Capacity or pot does not add up |
| -4 | `ERR_ROUND` | Round did not advance by one |
| -5 | `ERR_CLOCK` | Deadline missing or the shrink is wrong |
| -6 | `ERR_KING` | King or owner hash wrong |
| -7 | `ERR_PROOF` | Merkle proof does not match the root |
| -8 | `ERR_BID` | Bid missing, extra, or not tied to this match |
| -9 | `ERR_TREASURY` | Treasury missing or not this match |
| -10 | `ERR_SINCE` | Close attempted before the deadline |
| -11 | `ERR_IMMUTABLE` | Root, fee, treasury, or bid code changed on a steal |

## Who signs, and when

| Action | Who signs | On chain |
| --- | --- | --- |
| Seal the bank | Nobody | Nothing. Lobby row in Neon. |
| Join the lobby | Nobody | Nothing. Seat row in the same payload. |
| Start the clock | Host, once | Match cell + treasury cell |
| Lock your entry | That player, once per bid | Bid cell |
| Correct answer | Nobody | Steal: match, treasury, and that bid |
| Close the crown | Keeper fee only | Match and treasury consumed, pot paid |

The server can delay a transaction by withholding a proof. It cannot invent a winner. A wrong option gets `{ ok: false }` and no proof. A right option still has to be accepted by the script.

## Clock, in one place

- The host does not pick the duration.
- The cell’s opening deadline is 12 seconds plus 3 minutes from the click on **Start the clock**. The 3 minutes exist so JoyID can finish before the deadline is already past.
- Every player shares that deadline. Locking an entry does not start a personal clock.
- A steal cuts time off the deadline in the cell. It does not reset a private timer, and it never gives time back.
- The bar at zero means the prediction has run out. Steals are still valid. Close is not, until median time passes the deadline.
- `since` on a steal is 0. `since` on a close is `0x4000_0000_0000_0000` plus the deadline in seconds.

## Reading a cell that a steal may have spent

Every screen in a match agrees because every screen reads the same match cell. That only works
if the read can tell a live cell from a dead one.

CCC’s `client.getCell(outPoint)` **cannot**. It resolves an out point from the transaction that
created it and caches the result, so a match cell a steal has already spent answers with the round
it was written in, forever. Code that asks “is the match still here?” with `getCell` gets a
permanent yes, never falls through to the type-script search, and pins the whole lobby to round 1.

Use `readLiveCell` in `lib/ckb/live-cell.ts`. It calls `get_live_cell`, skips the cache, and
returns `null` for a cell that has died. The match cell, the treasury and a bid all change hands
on a steal, so all three are read that way — on the server in `loadMatchCell`, in the browser in
`locateMatch` and `liveCell`.

The identity that survives a steal is the **match type script** (`matchId` + host lock hash), not
the out point. When the stored point is dead, find the live cell by that type and carry on.

## What this document leaves alone

Username, profile, and community scripts are a different product on the same site. Reward badges are a different product. The parked event engine in `spore/parked-event-engine` is the old invite-and-wait flow this lobby was brought back from. Crowns do not call it.

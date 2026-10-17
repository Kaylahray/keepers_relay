# Keepers Relay — Crowns

Crowns is the live game. A host writes a bank of four-option questions. Players sit in a lobby, lock an entry fee, and race. The first confirmed correct answer becomes king and grows the pot. The chain decides the winner. The server never signs “correct.”

The old event product lives in `spore/parked-event-engine`. It is parked, not deleted. The live app nav is Home, Crowns, Host, Profile.

There is one game. Lyric lines are the same four-option bank with a lyric skin. They use the same lobby, the same match cell, and the same scripts.

## One match, from lobby to payout

1. The host writes questions on **Host** (`/create`). Each question has four options, one correct index, and a secret salt. Sealing computes a Merkle root from that bank. Sealing does not send a CKB transaction. Question text never goes on chain.
2. Sealing saves the crown on the server and opens the lobby at `/play/{id}`. Anyone with that link can sit. A seat is a server record, not a bid.
3. The host presses **Start the clock**. That is the host’s only game signature. It creates two cells: the match cell and the treasury cell. The match cell stores the Merkle root, the entry fee, the deadline, and an empty king.
4. Each player presses **Lock your entry**. That is the player’s only game signature. It creates a bid cell locked to that player, holding the entry fee plus a fee reserve. A bid cannot exist before the match cell, because the bid script requires the live match cell as a dependency.
5. Players answer the same question. A correct pick asks the server for a Merkle proof. The steal transaction spends the match cell, the treasury, and that player’s bid. Nobody signs the steal. The script checks the proof against the root already stored in the match cell.
6. One steal can confirm. The match cell is one cell, and a cell can be spent once. If several players answer correctly together, the first steal that lands becomes king. The others keep their bids and can answer the next question.
7. Each steal adds the entry fee to the pot, writes the winner’s lock hash as king, and adds bonus time to the deadline. Round 1 adds 10 seconds. The bonus then halves every two rounds, with a floor of 1.2 seconds.
8. **Close the crown** spends the match cell and the treasury after the chain clock has passed the deadline. The king receives the pot. The host receives the rest. If the host is also the king, one payment must cover both. A bid left out of that transaction stays frozen.

The screen clock is a prediction. The deadline inside the match cell is what the chain enforces, and only as “not before.” The bar hitting zero does not stop steals. Closing is rejected until CKB’s median time passes the deadline. Median time lags wall clock by minutes.

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
- **Steal** `(1 input, 1 output)`. Root, fee, treasury hash, and bid code hash stay the same. Round increases by 1. Pot increases by the fee. Deadline increases by `bonus_ms(round)`. Capacity of the match cell does not change. Exactly one bid of this match is an input, and none are outputs. The new king is that bid’s owner. The treasury output is larger by the fee. The Merkle proof is the input-type witness. `since` on the steal is 0.
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
| -5 | `ERR_CLOCK` | Deadline missing or bonus wrong |
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
- A steal adds bonus time to the deadline in the cell. It does not reset a private timer.
- The bar at zero means the prediction has run out. Steals are still valid. Close is not, until median time passes the deadline.
- `since` on a steal is 0. `since` on a close is `0x4000_0000_0000_0000` plus the deadline in seconds.

## What this document leaves alone

Username, profile, and community scripts are a different product on the same site. Reward badges are a different product. The parked event engine in `spore/parked-event-engine` is the old invite-and-wait flow this lobby was brought back from. Crowns do not call it.

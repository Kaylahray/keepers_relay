# Keepers Relay

One document for the product, CKB protocol, implementation status, and deploy continue-point.

## What it is

Keepers Relay is a **transaction-driven multiplayer event game** on Nervos CKB.

Players enter an event, take turns answering challenges, grow a pot, race a clock, and settle rewards on-chain.

Questions are the **first challenge format**, not the whole platform.

### Core loop

```text
Enter → Move → Challenge → Result → Pot grows → Clock resets/shrinks
  → Next player → … → Clock expires → Winner → Reward
```

### Product model

Not six separate games. One event engine with stacked rules:

| Rule | Options |
|------|---------|
| Prize | Growing pot (+ optional sponsorship) |
| Win | Highest score / last standing |
| Time | Fixed reset / shrinking clock |
| Scoring | Accuracy (+ optional speed bonus) |
| Challenge | Questions (MVP) |
| Question source | AI assist or manual |

### Navigation (MVP)

Home · Events · Communities · Create · Profile

Community = room. Only the community owner creates events inside a community.

---

## On-chain vs off-chain

**On-chain (CKB Cells)** — identity, money, authoritative state:

- Event Cell (lifecycle + turn baton + roster)
- Participant Entry Cell (paid join proof)
- Event Treasury (real CKB pot)
- Reward Claim Cells (settlement tickets)

**Off-chain** — UX and content:

- Question text / AI generation / editing
- Lobby presence, notifications, profiles
- Live countdown display
- Analytics

Principle: put **state, ownership, value, and commitments** on CKB. Keep high-frequency UX off-chain.

---

## Protocol (v3)

Four scripts (Pudge testnet):

| Script | Role |
|--------|------|
| `event-type` | State machine, roster (≤64), shrinking clock, turn fields |
| `participant-type` | One entry cell per player/event |
| `event-treasury-lock` | Spendable pot = economic truth |
| `reward-claim-type` | Winner claim tickets at settlement |

### Lifecycle

```text
REGISTRATION → READY → LIVE → PAUSED → FINISHED → SETTLED
```

### Join invariant (target)

A seat is on-chain confirmed only when:

```text
Participant Cell exists
+ Event roster contains player
+ Treasury received entry fee
```

### Pot invariant

```text
DB pot     = projection
Event.pot  = protocol accounting
Treasury   = source of truth (spendable capacity)
```

### Time

- Frontend countdown = display only
- Backend deadline = operational authority for live UX
- CKB timeout (`since` vs deadline) = settlement-level authority

### Auth MVP

Event Cell lock = **host/controller**.

| Actor | Today |
|-------|--------|
| Host | Can mint Event + treasury; can complete full on-chain join |
| Other players | Can join lobby in the app; on-chain seat still pending |

This is intentional MVP auth, not a UI bug. Next work: player-paid seat that settles without treating every turn as a wallet popup (relayer / multi-sign / lock redesign).

Deployed code hashes and out points live in:

- `scripts/event-engine/deployment/scripts.json`
- `.env.local` / Vercel env (`NEXT_PUBLIC_EVENT_*`, `NEXT_PUBLIC_PARTICIPANT_*`, …)

Engineering notes (keep thin):

- `scripts/event-engine/TRANSACTION_CASES.md` — required tx tests
- `scripts/event-engine/DEPLOY_YOURSELF.md` — ckb-cli deploy steps

---

## App architecture (current)

```text
Next.js UI
    ↓
API routes + domain (lib/relay, events-store)
    ↓
Neon Postgres (communities / snapshots / social)
    +
CKB (wallet txs via CCC — create / host join)
```

- **DB:** Neon + Drizzle / `@neondatabase/serverless`. **Not Prisma.** Sufficient for now.
- **Events store:** still largely in-memory for lobby/live; Neon is required on Vercel for shared social/community data.
- **No Redis / relayer required** for this redeploy.

---

## Implementation status

### Done

- One multiplayer event product model + rules wizard
- Event Engine v3 contracts built and deployed on Pudge
- Join/claim code-hash fix redeployed (type ID unchanged)
- TS layouts + `mintCreateEvent` / `joinEventOnChain`
- Create Event → publish on-chain (host)
- Host Join on-chain
- Lobby join for other players (pending on-chain seat)

### Not done yet

- Independent paid on-chain join for non-host players
- Persist full event lifecycle in Neon
- Turn / timeout / settle txs wired end-to-end in UI
- Production relayer
- Full TRANSACTION_CASES matrix on chain

---

## Vercel continue-point

1. Copy **all** keys from local `.env.local` into Vercel → Settings → Environment Variables (Production).
2. Root directory = Next app folder if monorepo.
3. Redeploy.
4. Smoke: connect wallet (testnet) → create event on-chain → host join → open Pudge explorer links.

Do **not** use the old draft names (`EVENT_TYPE_CODE_HASH`, `CKB_RPC_URL`). Use the `NEXT_PUBLIC_*` names in `.env.local`.

---

## Week 17 in one line

Feedback forced one clear game loop; we designed CKB Cells around that loop, deployed the protocol on Pudge, and wired host create/join — with multiplayer paid seats still controller-led as the honest next gap.

Week 17 report (CKB Builder Dev Log):  
`CKBuilder/ckbuilder-dev-log/theory/week_17/week_17.md`

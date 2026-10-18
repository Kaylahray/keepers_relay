# Crowns — working context

A standalone brief: what this is, what runs where, what changed in this session, what is left,
and the invariants not to break. Written to be pasted into a fresh assistant with no prior context.

Last updated 2026-10-18.

---

## 1. What the project is

A live, synchronous, multiplayer quiz on CKB where **the operator cannot decide who wins.**

- A host writes a bank of four-option questions. Sealing computes a **Merkle root** over the bank
  and stores only that root on chain. Question text never goes on chain.
- Players lock an **entry fee** (a bid cell), then race to answer.
- A correct answer builds a **steal** transaction that spends the match cell, the treasury, and
  that player's bid. **Nobody signs it** — all three cells use the Input Type Proxy Lock with args
  equal to the match type hash, so authority collapses onto the type script. A Merkle proof in the
  input-type witness is the entire authorisation.
- Each steal **removes** time from the deadline: 10 min at round 1, halving every 2 rounds, floor
  72 s. Enforced in script, so no client can soften it. The pot grows while the clock bleeds.
- Settlement is gated by `since` against median time, so the host cannot close early.

The deep design doc is `docs/CROWNS.md`. It is now accurate about the clock; it was not before
(it described a *bonus* clock that adds time — the scripts have always subtracted).

---

## 2. Infrastructure — what runs where

| Layer | What | Notes |
| --- | --- | --- |
| **Frontend + API** | Next.js 16 App Router, React 19, Tailwind v4 | One deployment serves both the UI and `/api/*`. Deployed on Vercel. |
| **Shared state** | **Neon Postgres** via `DATABASE_URL` | Table `keepers_crowns` (`id`, `payload` jsonb, `updated_at`) holds the whole room plus seats. Table `keepers_crown_attempts` enforces one answer per wallet per question. Tables are created **lazily** by `ensureCrownTables()` on first successful write — if `DATABASE_URL` is unset they never exist. |
| **Chain** | **CKB Pudge testnet**, `https://testnet.ckb.dev` | Read via CCC (`@ckb-ccc/core`), both server-side (`lib/ckb/server-client.ts`) and in-browser (`lib/ckb/client.ts`). |
| **Scripts** | 3 Rust `no_std` scripts, `riscv64imac-unknown-none-elf` | `match-type`, `bid-type`, `treasury-lock`, plus our own deployed copy of the Input Type Proxy Lock. Built from **WSL**; there is no Rust toolchain on the Windows side. |
| **Wallet** | **JoyID** passkeys through CCC connector | Players sign exactly twice: "Start the clock" (host) and "Lock your entry" (player). Steals need no signature. |
| **Server session** | Signed cookie, `AUTH_SECRET` | Separate from the wallet connection. `requireSession()` gates all crown writes. |
| **AI drafting** | Anthropic API, `claude-opus-5-5` | Optional. Server-side only, `ANTHROPIC_API_KEY`. |
| **Local state** | `localStorage` key `keepers-crowns` | Every browser keeps a copy. **The browser that sealed the bank keeps the real salts**; all others get `correct: 0` and zeroed salts plus `answersOnServer: true`, and must ask the server for proofs. |

### Deployed script cells (verified live on 2026-10-18 via `get_live_cell`)

| Script | Code hash | Live outpoint |
| --- | --- | --- |
| match-type | `0x1b24a657634dd36d359105c4ce15c13b545f48996864d06108dfb48d68979339` | `0x1d3a4c203be50d4696a2cb27eb1e3deccc870a09a6a4b669ca0438526e77bacf:0` |
| bid-type | `0xb606f3d04a87755db7813d25ffaa4f09dde7434ba6f464fac9029882c9a6d686` | `0x5969cca2b37900952691f09971fc6bcb24de851ac283047bf5e835d1be484cbf:0` |
| treasury-lock | `0xe515e1501f08956760250336861be49f7dc2aff79065ae9b3c17db4d45f9abdf` | `0x5124504dfde8cf137d8fb93029a5f998001aae8205f57b7d33f6c79abf5dd771:0` |
| proxy-lock (data1) | `0x5123908965c711b0ffd8aec642f1ede329649bda1ebdca6bd24124d3796f768a` | `0xa5ef4970ba0a4446b9cd8abb3b650cdfb68bcdf5052966e41384900a8a5ad274:0` |

> **Trap:** `scripts/sudden-death/deployment/testnet/*/info.json` is **stale** for match-type and
> bid-type — its outpoints are already spent. Always take outpoints from the newest file in each
> `migrations/` directory. Configuring from `info.json` makes every transaction fail to resolve
> its cell dep, which looks like a script bug but is not.

---

## 3. The bug this session started with

**Symptom:** a player answers correctly; their screen advances to the next question and the clock
drops 10 minutes. Everyone else — including the host — stays on question 1 with the clock
unchanged, forever.

**Root cause:** CCC's `client.getCell(outPoint)` has **no liveness check**. It resolves the
outpoint from the transaction that *created* it and caches the result:

```js
async getCell(e){ let n=OutPoint.from(e), r=await this.cache.getCell(n); if(r)return r;
  let i=await this.getTransaction(n.txHash); let a=i.transaction.getOutput(n.index); ... }
```

So a match cell that a steal had already spent kept answering with the round it was written in.

The chain of consequences:

1. The server's `loadMatchCell()` tried the stored outpoint with `getCell` first. It **always hit**,
   so the `findCells`-by-type fallback — the only correct path — was unreachable dead code.
2. `refreshFromChain` decoded round 1, the original deadline and an empty king, returned
   `seen: 'match'`, and `readPublicCrown` **wrote that stale decode back into the vault** on every
   poll from every client.
3. `syncCrown` only accepted a new match outpoint from the **host**, so a player's steal could
   never move the room forward.
4. Client-side, `locateMatch` had the same bug, so `moved` was never detected and the intended
   `MatchMovedError` ("approve once more") never fired — players got raw RPC errors instead.

`cursor` is not independent state: the server derives it as `round - 1`. Pinning `round` at 1
pinned every screen to question 1.

**Secondary finding:** the −10 minutes is *correct* and intended. `shrink_ms` in
`contracts/common/src/lib.rs` and `shrinkMs` in `lib/sudden-death/codec.ts` are byte-identical.
`docs/CROWNS.md` was wrong, and has been fixed.

---

## 4. What changed — modified files

| File | Change |
| --- | --- |
| `lib/server/crowns-store.ts` | `loadMatchCell` uses `readLiveCell`; type-script search now reachable. Monotonic guard: a decoded round lower than stored is treated as a stale read. `syncCrown` accepts a **seated player's verified** match outpoint (identity fields stay host-only). Off-chain rooms sync their clock through the server. Added a **1 s chain-read cache with in-flight dedup** (`refreshCached`) so N players cost one RPC. `readPublicCrown` only writes the vault when the chain actually moved (`sameLiveState`) — it used to write on every poll from every client. |
| `lib/crown/chain.ts` | `locateMatch` and `liveCell` use `readLiveCell`; the convoluted tx-status dance is gone and `MatchMovedError` now fires correctly. `closeCrown`'s bid fallback is live-checked. |
| `components/crown/useCrown.ts` | `ahead()` rewritten: the chain is the clock, with one bounded exception — the player whose steal is in the mempool holds their view for ≤90 s (`stealPendingAt`), then rejoins everyone. Poll pauses when the tab is hidden and backs off to 8 s when not live. `round` added to change detection. |
| `components/crown/BleedingClock.tsx` | `useNow` uses the shared clock, not `Date.now()`. |
| `lib/crown/remote.ts` | `fetchCrown` records server time for skew correction. |
| `app/api/crowns/[id]/route.ts` | GET returns `now: Date.now()`. |
| `lib/crown/rooms.ts` | Added `stealPendingAt`; set in `applySteal`, cleared in `kickoff`/`sealCrown`. |
| `components/crown/CrownPlayView.tsx` | Off-chain steals now push to the server (previously silent). `king: 'You'` leak fixed. Deadline comparisons use the shared clock. Progress bar scales to the **full match length** so each steal visibly lops a chunk off (it was scaled to the shrinking span, which cancelled the effect out). Verify link + receipt on settled crowns. |
| `components/crown/CrownsLobby.tsx` | Poll 3 s → 15 s, pauses when hidden. **"Only on this device"** marker for crowns the server does not have, plus an explanatory banner. |
| `components/crown/CrownWatchView.tsx` | "Check this crown yourself" link. |
| `components/crown/CrownDeskView.tsx` | CKBFS reveal panel (gated to settled crowns and a configured deployment). |
| `components/crown/OpenCrownView.tsx` | AI drafting panel on the Bank step. |
| `app/how-it-works/page.tsx` | "Do not take our word for it" section linking the verifier. |
| `lib/registry/config.ts` | `ckbfsType` + `ckbfsConfigured()`. |
| `lib/sudden-death/bank.ts` | Floor bank `durationMs` → 25 min. It was 2 hours against 4 questions that only burn 22.5 min, so the headline mechanic never bit in the demo. |
| `docs/CROWNS.md` | Clock description corrected (bonus → shrink) + a new section on why `getCell` must never be used for liveness. |
| `package.json` | Added `@anthropic-ai/sdk`, `zod`. |

## 5. What changed — new files

| File | Lines | Purpose |
| --- | --- | --- |
| `lib/ckb/live-cell.ts` | 25 | `readLiveCell` → `get_live_cell`, cache-skipping, returns null for dead cells. **The fix for the original bug.** |
| `lib/crown/clock.ts` | 33 | Shared wall clock. Folds server time from each poll so a device with a skewed clock doesn't count down a different match. |
| `lib/sudden-death/verify.ts` | 325 | Independent replay engine. Walks a match back to its open transaction and re-checks every script rule client-side. |
| `components/crown/VerifyView.tsx` | 236 | The verifier UI. |
| `app/verify/page.tsx`, `app/verify/[tx]/page.tsx` | 21 | Routes. |
| `components/crown/CrownReceipt.tsx` | 133 | Share card for a settled crown, with the verify URL printed on it. PNG export + copy link. |
| `app/api/bank/route.ts` | 121 | AI question drafting. `claude-opus-5-5`, zod structured outputs, server-side re-validation of every question. |
| `lib/ckbfs/codec.ts` | 107 | CKBFS: Adler-32, `CKBFSData` molecule table, `"CKBFS" ‖ 0x00 ‖ content` witness. |
| `lib/ckbfs/reveal.ts` | 199 | Reveal payload, `publishReveal` transaction, `revealMatchesRoot` verification. |
| `.env.local.example` | — | Every variable, with live-verified script values. **Gitignored** (`.env*`) — `git add -f` to commit. |
| `docs/proposals/*.md` | — | Technical forum thread, Spark application, DAO proposal. |

### The verifier, specifically

`/verify` takes any transaction hash from a match. It finds the match cell that transaction
touches (as an output for open/steal, as an input for the close), recovers the match id and host
lock hash from the 64-byte type args, finds the live tip if the match is still running, then walks
backwards — every steal spends the previous match cell as input 0, so the history is a straight
chain needing no indexer.

For each steal it independently re-derives: the **Merkle path** (decode the witness proof, rebuild
the leaf, walk the siblings, compare to the committed root), **round +1**, **pot +fee**, the
**exact clock cut** via `shrunk_deadline`, and that root/fee/treasury/bid-code never changed.

It reads the chain directly from the browser. No request touches the app's own server.

---

## 6. What is left to do

### Blocking — nothing works without this
- **Set `DATABASE_URL` locally.** There is no `.env.local` in the checkout and no other copy of the
  project on the machine. If it lives in Vercel: `npx vercel link && npx vercel env pull .env.local`.
  Until then crowns exist only in `localStorage` and none of the sync work is observable.
- Set `AUTH_SECRET`. Optionally `ANTHROPIC_API_KEY` for drafting.
- Verify which Neon branch the deployment writes to before concluding the DB is empty.

### Script work (Rust, requires WSL)
- **Bid timeout refund.** Today `consume()` requires the match cell to be an input. After a close
  consumes it, any bid left out of that transaction can **never** be spent — the owner's capacity is
  frozen permanently. Needs a fourth mode: no match cell in inputs, gated by `since`, paying the
  owner back. Open design call: **relative timelock** (no data change, recommended) vs **storing the
  deadline in bid data at create time** (precise, but changes the bid format and strands in-flight
  bids on redeploy). Not written yet.
- **Deploy CKBFS.** The protocol thread publishes working code but **no code hash**. Build and
  deploy the type script from `code-monad/ckbfs`, then fill `NEXT_PUBLIC_CKBFS_*`. The whole TS
  layer is written and inert until then. Canonical repo is ambiguous (`code-monad/ckbfs` vs
  `nervape/ckbfs`) — resolve this first.

### Product
- Polling → **Server-Sent Events**. The 2 s room poll is load-bearing (it *is* the shared clock) but
  push would be correct. Currently mitigated, not solved.
- Host-sponsored entry for first-time players, so onboarding doesn't require acquiring CKB.
- Scheduled "Crown Hour" — appointment play beats always-on empty lobbies.

### Ecosystem / grant
- Get listed in `Nervos-Community-Catalyst/CKBuilder-projects` (open an issue with demo, repo,
  screenshots; share in the CKBuilders Telegram). **Not listed yet.**
- Post `docs/proposals/technical-thread.md` to CKB Development & Technical Discussion.
- Apply to **Spark** (`docs/proposals/spark-application.md`) — $1,000–$2,000, 1–2 months, via the
  Spark channel in the Nervos Discord developer area.
- Later: Community Fund DAO (`docs/proposals/dao-proposal.md`) for mainnet + audit.
- Collaborations to pursue: **Vellum** (`did:ckb` Claim Cells — Crowns as a claim issuer),
  **CKB IDL** descriptors, **Fiber** for sub-second race ordering.

---

## 7. Known limitations — state these, don't hide them

1. **The server can stall, though it cannot lie.** A browser that didn't seal the bank asks the API
   for a Merkle proof. The server can't invent a winner — the script still has to accept it — but it
   can delay one player and not another, and in a race that picks a winner. The CKBFS reveal is the
   intended fix.
2. **The race resolves at block granularity.** Two players 200 ms apart are separated by mempool
   ordering, not reflexes. This is the weakest claim the project makes.
3. **Frozen bids** — see above.
4. **Scripts are unaudited.** Four in-place revisions and tests, no third-party review.
5. **Reveal is not enforced.** Nothing compels a host to ever publish salts.
6. Six pre-existing `react-hooks` lint errors in `CrownPlayView.tsx` (`set-state-in-effect`,
   `purity`). Real React 19 smells, not behavioural bugs. Untouched.

---

## 8. Running it

```bash
cp .env.local.example .env.local   # fill DATABASE_URL + AUTH_SECRET
pnpm install
pnpm dev
```

Next reads env only at boot — **restart after editing `.env.local`.**

Verification used throughout this session: `npx tsc --noEmit` and `npx next build`. Both pass.

---

## 9. Invariants — do not break these

- **Never use `client.getCell` to ask whether a cell is live.** Use `readLiveCell`. This caused the
  original bug and will cause it again.
- **The chain is the clock.** No browser keeps its own time against a live match cell. The single
  exception is the bounded `stealPendingAt` window in `useCrown.ts`.
- **`cursor` is derived, not stored.** It is `round - 1`. Never set it independently.
- **The server must never be able to decide a winner.** Any feature that puts the server, or a
  model, in the adjudication path destroys the entire premise. AI drafts questions; the host edits
  and seals; the Merkle root commits what the human approved.
- **Banks must be a power of two** (2–64). The Merkle path is log2(n) and the script caps it at 6.
- **Salts must be fresh per question.** Reusing one lets the same leaf be recognised across matches.
- **Take deployment outpoints from `migrations/`, never `info.json`.**

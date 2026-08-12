# Week 14 - Keepers Relay

## TL;DR
This week I moved Keepers Relay from a single mock-page vibe toward a real multi-page app with wallet-connected identity and on-chain profile surfaces.

## What I Shipped
- Added/expanded multi-page product views (live chain, builders, relays, relay detail, studio, profiles).
- Kept the Chain Letter core loop live in UI (countdown, pass flow, lineage, dead-state handling).
- Wired wallet connection with CCC provider flow.
- Added on-chain username claim/read flow.
- Added on-chain profile create/update flow.
- Added Spore avatar mint/melt flow.
- Added public profile and on-chain endorsement flow.
- Preserved React Query cache/mutation patterns across app and APIs.

## Build + Release Readiness
- Production build status: PASS (`pnpm build`)
- Blocking type/build issues fixed this week: 1
- Known release caveat: chain/relay/queue gameplay state is still in-memory server store and not yet indexer/database backed.

## What Works Right Now
- Wallet connect/disconnect and wallet identity display.
- Builder roster and public profile pages.
- Relay hub and relay detail flow with proof/review states.
- Studio for avatar/profile management.
- On-chain username/profile/endorsement integrations (when env vars are configured).

## What Is Still Mock or Incomplete
- Real Chain Cell transaction handoff path.
- Chain Cell type script enforcement.
- Indexer-backed chain lineage source of truth.
- Persistent DB for queue/artifact/relay attempts.
- Notification + moderation + abuse prevention pipeline.

## Deployment Checklist (Vercel)
- [ ] Confirm branch is up to date and build passes locally.
- [ ] Commit Week 14 checkpoint.
- [ ] Push to remote branch.
- [ ] Create/import Vercel project for `keepers_relay/keepers_relay`.
- [ ] Set required `NEXT_PUBLIC_*` env vars in Vercel.
- [ ] Trigger deploy and verify routes.
- [ ] Smoke test wallet, profile, relay, and /u pages.

## Notes for Next Week
1. Replace in-memory chain store with persistent read/write service.
2. Implement real handoff transaction lifecycle.
3. Add indexer confirmations and explorer links.
4. Add operational safeguards (rate limits, moderation hooks, retries).

## Personal Reflection
The big progress this week is that the app feels like a real product surface now, not just a single-screen prototype. The next real milestone is making Chain Cell handoff truly on-chain and durable.

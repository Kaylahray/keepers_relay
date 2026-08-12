# Chain Letter — Week 14 Master Backlog

**Purpose:** This document is the complete continuation plan after Week 13. It separates what already works in the prototype, what each current interaction actually does, every known product/technical gap, and the recommended sequence for building the real CKB application.

**Current status:** A working, single-page React prototype with React Query, mocked CKB-style state transitions, an evolving artifact, Relay rewards, a handoff queue, and a contribution Passport. It is **not yet wallet-connected, persisted, indexed, verified, or deployed to CKB**.

---

## 1. Current Product State

### What exists today

- One live Chain Letter Cell.
- One current Keeper.
- A 24-hour modeled handoff window.
- A live countdown with alive, warning, critical, and dead states.
- A visible owner lineage.
- A CKB-style simulated handoff: consume old Cell → create successor Cell → new owner → new deadline.
- A permanent dead-chain state.
- A Living Artifact where the Keeper can add a message, rule, or meme line.
- A Relay Board with ecosystem missions and prototype rewards.
- A Handoff Queue where people make a pledge to carry the Cell next.
- A Contribution Passport with streak, XP, and proof badges.
- A bright neo-brutalist visual identity and original app artwork.

### What does **not** exist yet

- Real wallet identity.
- Real CKB Cells or transactions.
- Smart contract / Type Script.
- CKB RPC or Indexer connection.
- Database or persistent social data.
- Dedicated pages or navigation.
- Real Relay instructions, verification, or partner integrations.
- Notification system.
- User profiles, chain discovery, moderation, analytics, or deployment infrastructure.

---

## 2. Current Interaction Matrix

This section answers: **what happens when a user clicks something today, and what should happen later?**

| Current surface | Current prototype behavior | Production behavior needed | Priority |
| --- | --- | --- | --- |
| **Pass the Baton** | Opens a modal; submitting a name changes in-memory Chain state and resets the timer. | Review transaction, show capacity/fee, request wallet signature, broadcast, confirm with indexer, then update Chain. | P0 |
| **Demo: Make It Urgent** | Reduces the timer to 10 seconds. | Remove from public production UI; retain only in a protected development environment. | P0 cleanup |
| **Start Another** after death | Resets the entire demo to seeded Alice → Emma state. | Show archive details and direct to discover/create a different test chain. Never reset a real dead Cell. | P0 |
| **Cell hash** | Display-only text. | Link to CKB Explorer or supported chain explorer. | P1 |
| **Message / Meme / Rule** selectors | Select the type for an Artifact entry. | Keep this behavior; add media support, content hash, signature attribution, and moderation. | P2 |
| **Seal It** | Adds an Emma-authored entry in memory; grants +100 XP. | Store content, upload optional media, create a content hash, require Keeper wallet authorization, commit hash in a handoff-related state transition or companion record. | P1 |
| **Feature** Artifact entry | Changes the featured entry in memory. | Persist selection, attribute it to Keeper, add moderation safeguards. | P2 |
| **Set Live** on a Relay | Changes the active Relay in memory. | Keeper-authorized Relay selection with versioned Relay definitions and audit trail. | P2 |
| **Do Relay** | Immediately marks the Relay complete, adds XP/badge, and increases participant count. No new page or proof required. | Navigate to `/relays/:id`; show instructions, partner action, proof collection, verification, claim, and completion receipt. | P1 |
| **Claimed** Relay state | Disabled after the mock completion. | Show verified proof, timestamp, transaction/attestation reference, and completion history. | P2 |
| **Join the Queue** | Adds a pledge to a local in-memory list. | Require wallet identity, persist pledge, apply rate limits/moderation, allow withdrawal/editing, and notify the Keeper. | P1 |
| **Choose as next Keeper** | Marks a candidate endorsed and opens the transfer modal with their name filled in. | Show a nominee review step, confirm their wallet/lock hash, then build the actual handoff transaction. | P1 |
| **Passport** | Display-only card for mock XP, streak, and badges. | Link to `/profile/:address` with full activity, proof history, settings, and reputation. | P2 |
| **Header** | Brand, chain ID, and Keeper count only. | Add navigation, wallet connection, active network state, profile menu, notifications, and share control. | P1 |
| **Lineage entries** | Read-only list. | Link each owner and transaction to a profile/explorer view; paginate long lineages. | P2 |

---

## 3. Missing Pages and Navigation

The current prototype intentionally has one page (`ChainLetter`). This was useful for validating the core loop, but the product needs a real information architecture.

### P1 — Required for testnet alpha

#### `/` — Live Chain Home

Current dashboard, focused on one live Chain Cell:

- Live timer.
- Current Keeper.
- Handoff action.
- Compact lineage.
- Active Relay preview.
- Follow/share entry points.

#### `/chains/:chainId` — Chain Detail

Shareable permalink for a specific Chain:

- Full lineage and transaction history.
- Full Living Artifact.
- Current and past Relays.
- Current queue.
- Archive state when dead.
- CKB explorer links.

#### `/relays` — Relay Hub

Discovery surface for active, upcoming, and completed missions:

- Active relay.
- Eligibility.
- Expected proof.
- Reward.
- Partner attribution.
- Completion status.

#### `/relays/:relayId` — Relay Detail and Proof Flow

This is what **Do Relay** should open:

1. Explain the mission and why it matters to CKB.
2. Link to the relevant partner/app/resource.
3. Describe exactly what counts as completion.
4. Collect proof: wallet transaction, signed partner attestation, URL, upload, or manual review.
5. Verify proof.
6. Show reward and claim status.
7. Return the user to their Passport with a completion receipt.

#### `/profile/:address` — Profile and Passport

- Wallet-derived identity.
- Display name and optional bio.
- Streak, XP, badges, and verified Relay history.
- Past Keeper roles.
- Artifact contributions.
- Queue pledge state.
- Notification preferences for the owner viewing their own profile.

### P2 — Needed for a public mainnet experience

#### `/discover`

- Search Chains by Chain ID or Keeper.
- Browse alive, critical, dead, long-running, and trophy Chains.
- Filters for category, creation date, length, and Relay type.

#### `/artifact/:chainId`

- Full Artifact archive.
- Visual timeline of every mark.
- Media and content provenance.
- Shareable cultural archive after chain death.

#### `/notifications`

- Deadline alerts.
- Queue updates.
- Relay activity.
- Handoff nominations.
- Milestones.
- Notification preferences.

#### `/how-it-works`

- Explain Cells, Keeper responsibilities, deadlines, Relays, and permanent death.
- New-user onboarding before they enter a live Chain.

### P3 — Network expansion

#### `/leaderboard`

- Longest living Chains.
- Most completed Relays.
- Most helpful Keepers.
- Trophy Relics.

#### `/partners`

- Relay partner directory.
- Partner mission performance.
- Ecosystem discovery.

#### `/admin`

- Moderation queue.
- Relay management.
- Partner management.
- System health.

---

## 4. Core Product Flows Still Needed

### A. Wallet and identity flow — P0

The hardcoded demo identities (`Emma` and `You`) must be replaced with a connected CKB wallet.

Required work:

- Detect supported CKB wallets.
- Connect/disconnect wallet UI.
- Select account and derive lock script / address.
- Sign a nonce-based message to create a session.
- Create and edit profile information.
- Handle wallet switch, disconnect, unsupported wallet, and wrong network states.
- Confirm that the active Chain Cell lock matches the connected Keeper before enabling Keeper controls.

### B. Real handoff flow — P0

The existing modal needs to become a multi-step transaction experience.

```text
Choose next Keeper
      ↓
Review deadline, capacity, and fee
      ↓
Build and simulate transaction
      ↓
Wallet signature required
      ↓
Broadcasting
      ↓
Waiting for CKB confirmation
      ↓
Confirmed: successor Cell is live
```

Required states:

- Draft.
- Insufficient remaining time warning.
- Insufficient capacity.
- Wallet rejected signature.
- RPC failure.
- Broadcast success but pending confirmation.
- Indexer delay.
- Confirmed.
- Failed with retry guidance.

### C. Real Relay flow — P1

A Relay must become a real task, not an instant XP button.

Each Relay needs:

- Partner.
- Mission intent.
- Instructions.
- Eligibility.
- Start/end time.
- Completion proof type.
- Verification status.
- Reward definition.
- Anti-abuse policy.
- Completion receipt.

Possible proof models:

| Relay type | Proof approach |
| --- | --- |
| Learn | Short quiz, signed completion attestation, or manual review |
| Explore a CKB app | Wallet activity, partner callback, signed attestation |
| Create an object | Transaction hash / indexer verification |
| Community contribution | Submitted link/media + moderator approval |
| Event attendance | QR code, signed event credential, or manual check-in |

### D. Artifact flow — P1/P2

The current text-only artifact needs a durable provenance model.

Required work:

- Persist entries by Chain ID.
- Attribute each entry to a wallet address.
- Store entry type, content, timestamp, signature, and content hash.
- Add optional media uploads in a later phase.
- Upload media to IPFS or another durable content layer.
- Commit content hash or Merkle root to CKB state/witness data.
- Allow report/hide actions.
- Preserve the permanent archive after a Chain dies.

### E. Queue and nomination flow — P1

Required work:

- Wallet-linked queue entries.
- Entry edit/withdraw capability.
- Candidate uniqueness by wallet address, not display name.
- Queue rate limiting.
- Candidate profile preview.
- Notify candidates when endorsed.
- Keeper nominee review screen before a handoff.
- Prevent a nominee from receiving the Cell if their wallet cannot receive/authorize it.

### F. Follow and notification flow — P1/P2

People need a reason to return before they own the Cell.

Required actions:

- Follow/unfollow a Chain.
- Subscribe to urgent deadline alerts.
- Subscribe to Relay activity.
- Subscribe to queue nomination updates.
- Configure channels and quiet hours.

Suggested alerts:

- Keeper: 6 hours, 1 hour, and 30 minutes remaining.
- Followers: 30 minutes remaining.
- Queue member: Keeper opened/endorsed a candidate.
- Relay participant: a new Relay is live.
- Everyone following: Chain survived / Chain died / milestone reached.

---

## 5. CKB and Smart-Contract Backlog

These items are **blocking** before the chain can be real.

### P0 — Chain Cell Type Script

Build a Rust CKB Type Script that enforces:

- Correct current Keeper authorization.
- Deadline validation.
- Exactly one valid successor Chain Cell before expiry.
- New Keeper lock update.
- New expiry update.
- Owner count increment.
- Capacity preservation requirements.
- Protection against unauthorized reset.
- Protection against duplicate successor Cells.
- No valid live transition once the Chain is dead.

### P0 — Transaction layer

- Choose and integrate Lumos or current supported CKB transaction tooling.
- Collect Cell dependencies.
- Calculate required capacity and transaction fee.
- Build handoff transaction.
- Simulate before requesting signature.
- Request wallet signature.
- Broadcast to a CKB RPC endpoint.
- Poll transaction state.
- Wait for indexer confirmation.
- Generate explorer links.

### P0 — Testnet validation

- Deploy Type Script to testnet.
- Create genesis Chain Cell.
- Test normal handoff.
- Test deadline boundary behavior.
- Test expired transfer rejection.
- Test invalid successor rejection.
- Test wallet failure and transaction replacement scenarios.
- Run a small real-user testnet relay.

### P1 — On-chain/off-chain state design

Recommended compact Chain Cell state:

```text
chain_id
current_keeper_lock_hash
expires_at
handoff_window_seconds
owner_count
lineage_root
artifact_root
active_relay_id
status
```

Recommended off-chain state:

- Full profile data.
- Queue pledges.
- Full Artifact content/media.
- Relay definitions.
- Relay proof records.
- Passport XP and badges.
- Notification preferences.
- Moderation records.

Recommended commitments:

- Artifact content hashes or Merkle root.
- Lineage root.
- Versioned active Relay reference.

### P2 — Security and audit

- Unit tests for all script paths.
- Property tests for timing and successor rules.
- Transaction fuzzing.
- Independent smart-contract audit.
- External security review of wallet and backend flows.
- Bug bounty program before major mainnet scale.

---

## 6. Backend and Persistence Backlog

### P0 — Essential services

| Need | Recommended first implementation |
| --- | --- |
| Application API | TypeScript service using Hono, Fastify, or NestJS |
| Database | PostgreSQL |
| Authentication | Wallet signature verification + session cookies/tokens |
| CKB data | Hosted RPC plus CKB Indexer / custom indexing worker |
| Background tasks | Redis + BullMQ or equivalent |
| Object/media storage | IPFS-compatible storage plus CDN/object storage |

### P0 — Database entities

- Users / wallet addresses.
- Profiles.
- Chains.
- Indexed Chain Cell states.
- Handoffs / transaction history.
- Artifact entries.
- Queue pledges.
- Relay definitions and versions.
- Relay attempts and proofs.
- Passport XP / badges / streak history.
- Chain follows.
- Notifications and preferences.
- Reports and moderation decisions.

### P1 — Backend product services

- Relay verification service.
- Partner webhook/API integration service.
- Notification scheduler.
- Indexer synchronization worker.
- Content moderation queue.
- Rate-limit and anti-spam service.
- Analytics event ingestion.

### P2 — Scale and resilience

- Read replicas / caching strategy.
- Indexer monitoring and repair jobs.
- Data backup and restore plan.
- Idempotent job processing.
- Webhook replay protection.
- Data retention rules.

---

## 7. Trust, Safety, and Moderation Backlog

The app contains user-generated artifact content, queue pledges, rewards, and deadline pressure. Safety must be designed in before a public launch.

### P1 — Minimum safeguards

- Wallet identity for high-impact actions.
- Rate limits for queue pledges, artifact posts, and Relay claims.
- Content report action.
- Manual moderation review queue.
- Hide/remove policy for abusive content.
- Basic profanity and spam filter.
- Clear terms of use and privacy policy.
- Clear wording that XP and badges are contribution proof, not financial returns.

### P2 — Advanced safeguards

- Reputation thresholds for sensitive actions.
- Anti-sybil checks for rewards.
- CAPTCHA or proof-of-work for non-wallet / low-reputation entry points.
- Link scanning for malicious Relay submissions.
- Moderator roles and audit logs.
- Appeals workflow.
- Community guidelines.

---

## 8. Analytics, Quality, and Operations Backlog

### P1 — Product analytics

Measure:

- Chain survival rate.
- Median time remaining at handoff.
- Number of active followers per Chain.
- Relay completion rate.
- Queue pledge-to-selection conversion.
- Artifact contribution rate.
- User funnel: discover → follow → Relay → queue → Keeper.
- Return rate after holding the Cell.

### P1 — Observability

- Error monitoring (for example, Sentry).
- Frontend performance monitoring.
- API and RPC latency monitoring.
- CKB Indexer lag monitoring.
- Failed transaction alerts.
- Notification delivery monitoring.

### P1 — Automated tests

- Component and hook unit tests.
- API service tests.
- React Query mutation tests.
- End-to-end tests for key flows:
  - wallet connect;
  - Relay start/proof/claim;
  - queue pledge;
  - nominee endorsement;
  - handoff confirmation;
  - chain death;
  - artifact contribution.

### P2 — CKB tests

- Script unit tests.
- Property tests for deadline boundaries.
- Invalid transaction tests.
- Testnet integration suite.
- Concurrent handoff attempts.
- Load testing for high-viewer deadline events.

### P1 — Deployment

- Development, staging, and production environments.
- CI/CD pipeline.
- Secrets management.
- Managed PostgreSQL and Redis.
- Hosted CKB RPC endpoints with fallback.
- Hosted indexer or dedicated indexer environment.
- CDN for images/media.
- Rollback plan.
- Database backups and disaster recovery procedure.

---

## 9. Accessibility and Responsive UX Gaps

The prototype follows basic semantic and keyboard patterns in several places, but a production pass is still needed.

### P1 requirements

- Test every screen using keyboard-only navigation.
- Add focus trapping and focus restoration for all dialogs.
- Ensure status/timer changes are announced appropriately without becoming noisy.
- Test all colors and urgency states for contrast compliance.
- Provide non-color-only status indicators.
- Test at small mobile widths and mobile wallets.
- Support reduced-motion preferences throughout.
- Add accessible labels for icon-only controls.
- Add empty states, loading skeletons, offline states, and retry controls to all newly added pages.

---

## 10. Recommended Build Sequence

### Phase A — Week 14: Product foundation and real navigation

**Goal:** Stop treating the prototype as one page; make all visible actions lead to understandable destinations.

- Add React Router.
- Create Chain Detail, Relay Hub, Relay Detail, Profile/Passport, How It Works, and Artifact Archive pages.
- Change **Do Relay** from instant completion to Relay Detail navigation.
- Create mocked Relay proof states: start, instructions, submit proof, pending review, verified, claimed.
- Add header navigation and placeholder wallet CTA.
- Add click-through explorer and profile destinations using mocked IDs.
- Preserve React Query mock services while organizing them per route.

**Week 14 result:** a complete navigable prototype where every major CTA has a meaningful destination, even before real CKB integration.

### Phase B — Testnet alpha: real Chain Cell handoffs

**Goal:** Make one Chain real on CKB testnet.

- Wallet integration.
- Wallet-based profile identity.
- Chain Cell Type Script.
- Transaction builder and wallet signing.
- RPC + Indexer integration.
- Testnet genesis Chain Cell.
- True handoff confirmation states.
- Explorer links.
- Minimal PostgreSQL-backed profiles, queue, and artifact text.

### Phase C — Testnet beta: verified social loop

**Goal:** Make participation meaningful and resistant to easy abuse.

- Persistent Passport.
- Persistent Artifact and Queue.
- First verified Relay partner workflow.
- Manual Relay review option.
- Deadline notifications.
- Basic moderation/reporting.
- Follow controls.

### Phase D — Mainnet v1

**Goal:** Secure public launch.

- Smart-contract audit.
- Mainnet deploy.
- Chain discovery.
- Profiles and notifications.
- Monitoring, analytics, legal/policy work.
- Production support and incident procedures.

### Phase E — Network expansion

**Goal:** Turn one Chain Letter into a wider CKB cultural network.

- Multiple themed Chains.
- Creator / builder / event Chain templates.
- Partner portal.
- Media artifacts.
- Trophy Relics.
- Reputation portability.
- Leaderboards and ecosystem discovery.

---

## 11. Explicit Scope Decisions

### Do first

- Real navigation and Relay Detail flow.
- Wallet identity.
- Real testnet handoff.
- Chain Cell script.
- Indexer-backed Chain state.
- Persistent artifact and queue data.
- Basic Relay verification.
- Deadline notifications.

### Do later

- Multiple Chains.
- Video artifacts.
- Public leaderboards.
- Partner marketplace.
- Rich comments/reactions.
- Advanced reputation systems.
- Complex token economics.

### Avoid for the first launch

- Financial reward promises.
- Pay-to-win ownership.
- Arbitrary user-created official Relays.
- Unmoderated media uploads.
- Mainnet launch before script audit and testnet validation.

---

## 12. Definition of Done for the First Real Version

The first real version is ready for a controlled testnet community when:

- A user can connect a supported CKB wallet.
- A wallet-derived identity replaces hardcoded Keeper names.
- A real testnet Chain Cell exists.
- Only the real current Keeper can initiate a valid transfer.
- A handoff consumes the existing Cell and creates one confirmed successor Cell.
- An expired Cell cannot be transferred.
- The app reads Chain status from an indexer rather than memory.
- Artifact entries, queue pledges, and Passport data persist after refresh.
- At least one Relay has a real instruction and proof/verification flow.
- The Keeper receives deadline reminders.
- The app has basic moderation and error monitoring.
- The handoff, death, and Relay flows have end-to-end test coverage.

---

## Closing note

The current project has validated the most important product concept: **a CKB Cell can become a social object with a deadline, a lineage, a cultural record, and a reason for both Keepers and non-Keepers to return.**

Week 14 should focus on turning that strong one-page demo into a coherent, navigable product model before connecting the final surfaces to real CKB wallet and transaction infrastructure.

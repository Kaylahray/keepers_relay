# Chain Letter — Product & Technical Brief

## One-line pitch

**Chain Letter is a living CKB collectible that can only survive if every holder passes it on before time runs out.**

It combines the emotional pull of a streak with the scarcity of an on-chain object: one Cell, one owner, one countdown. Every successful handoff grows its lineage, its community-made artifact, and its proof of contribution. If a Keeper misses the deadline, the Cell locks permanently and the chain becomes an immutable archive.

---

## The problem

Most NFT experiences are transactional: mint, trade, list, repeat. They struggle to give people a reason to return, collaborate, or learn about the underlying ecosystem.

CKB has a different primitive worth showcasing: a Cell can represent a unique, stateful object with unambiguous ownership. Chain Letter turns that primitive into a social game:

- One person is responsible at a time.
- The deadline creates a real emotional stake.
- Every handoff becomes visible history.
- The community has something to rally around before the chain dies.
- Long-lived chains become culturally valuable because they required coordinated care.

---

## Product thesis

A great streak does not only reward attendance. It creates **responsibility, identity, and a fear of letting other people down**.

Chain Letter turns the current owner into a temporary **Keeper**. The Keeper has a short-lived privilege set, while everyone else has meaningful ways to participate and build toward becoming a future Keeper.

> A Cell can hold more than value. It can hold a promise.

---

## Core user loop

1. A user discovers a live Chain Letter and sees its countdown.
2. They follow the chain, complete its active CKB Relay, react to its artifact, or join the handoff queue.
3. The current Keeper adds one permanent mark to the shared artifact and chooses a community Relay.
4. Before time expires, the Keeper selects the next person and passes the Cell.
5. The Cell is consumed, a replacement Cell is created for the new owner, and a fresh deadline begins.
6. The lineage grows. Contribution proof and community energy accumulate.
7. If the deadline expires, the Cell becomes permanently locked and the full chain becomes an archive.

---

## Current front-end experience

The current build is a polished React demo with an in-memory mock backend. It demonstrates product behavior, UI states, React Query patterns, and the future CKB transaction model; it does **not** yet connect to a wallet, CKB node, indexer, or deployed contract.

### Live Cell dashboard

- A single visualized Cell with urgency states: **alive, getting late, critical, dead**.
- Live countdown to the current Keeper’s deadline.
- Current Keeper identity, Cell hash, pass window, chain length, and progress toward a 500-Keeper trophy.
- Animated lineage of every prior owner, ordered newest-first.
- A permanent `Chain Dead` lock state when the deadline passes.
- Demo control to fast-forward the deadline for testing the death flow.

### Pass-the-Cell flow

- A focused handoff modal for naming the next Keeper.
- Validates recipient names and blocks transfer after death.
- Models the CKB lifecycle clearly:
  - consume the current Cell;
  - mark the former owner as passed;
  - create a new Cell for the recipient;
  - reset the expiry time.
- Updates the visible lineage and cached chain state after a successful transfer.

### Keeper Pass layer

The current Keeper has short-lived social privileges that make holding the Cell meaningful:

#### 1. Living Artifact

- The Keeper can add one permanent entry: a message, rule, or meme line.
- Entries become part of the chain’s evolving cultural record.
- The Keeper can feature one community mark.
- The artifact creates a reason to revisit chains even for people who never hold the Cell.

#### 2. CKB Relay Board

- The Keeper selects the active community mission.
- Example missions include learning a CKB concept, exploring a digital object, or sharing a useful ecosystem resource.
- Anyone can complete a Relay and receive contribution XP and a proof badge.
- The Relay layer turns attention into useful ecosystem discovery rather than empty engagement.

#### 3. Handoff Queue

- Community members can submit a short pledge explaining how they will care for the Cell.
- The Keeper can endorse a candidate.
- Endorsing a candidate opens the actual Cell-transfer flow with that person preselected.
- This makes ownership a social nomination ritual, not simply a trade.

#### 4. Contribution Passport

- A personal proof surface for Relay streak, contribution XP, and earned badges.
- Rewards are positioned as receipts for useful participation, not financial speculation.
- The Passport can eventually become portable CKB-native reputation.

---

## Visual direction

The interface uses a bright neo-brutalist poster system rather than a standard crypto dashboard:

- Acid-lime canvas, cobalt blue, hot pink, yellow, orange, cream, and black.
- Thick black borders, square corners, offset shadows, and oversized display type.
- Original generated visual art for the Keeper, Relay, and evolving meme relic surfaces.
- High contrast and clearly differentiated urgency colors.
- Framer Motion is used for meaningful movement: Cell urgency, countdown state changes, transfer feedback, and modal transitions.

The intention is to make a Chain Letter feel like a living internet artifact—part game, part communal zine, part on-chain trophy.

---

## Why CKB is a strong fit

### The Cell model maps cleanly to the product

A Chain Letter should have one unambiguous current holder. CKB’s Cell model naturally supports that:

| Product requirement | CKB primitive |
| --- | --- |
| Only one current Keeper | One live Cell can be spent by one valid transaction |
| Handoff changes ownership | Consume old Cell, create new Cell with new lock owner |
| Deadline enforcement | Type script validates the expiry and permitted transition |
| Permanent death | No valid replacement Cell can be created after expiry |
| Immutable lineage | Each transaction can reference lineage data or emitted events |
| Evolving artifact state | Cell data / companion Cells can reference the latest artifact state |

### Proposed on-chain state

The primary Chain Cell can contain or commit to:

```text
chain_id
current_keeper_lock_hash
expires_at
handoff_window_seconds
generation / owner_count
lineage_root
artifact_root
active_relay_id
status: alive | dead
```

A real implementation should avoid placing large social content directly in Cell data. Instead:

- Keep compact state and cryptographic commitments on-chain.
- Store rich artifact text/media and Relay content off-chain (for example, IPFS / RGB++ compatible storage / application database).
- Commit content hashes or Merkle roots to the relevant Cell or transaction witness.
- Use an indexer to reconstruct the public activity feed and lineage efficiently.

### Handoff transaction concept

A handoff transaction should:

1. Consume the active Chain Cell.
2. Validate that the transaction is submitted before `expires_at`.
3. Validate the current Keeper’s authorization.
4. Create exactly one successor Chain Cell.
5. Set the successor’s lock to the new Keeper.
6. Set a new expiry timestamp.
7. Increment generation / owner count.
8. Commit the next lineage and artifact references.
9. Preserve enough capacity for the successor Cell.

If time has passed, the type script should reject a live successor transition. The locked/dead Cell remains visible as a historical artifact.

---

## Recommended production architecture

### Front end

| Concern | Recommendation |
| --- | --- |
| Application | React + TypeScript |
| Server state | TanStack Query / React Query |
| Routing | React Router |
| UI and animation | Tailwind CSS + Framer Motion + Lucide icons |
| Form handling | React Hook Form + Zod |
| Wallet interaction | CKB wallet adapter/provider chosen with the wallet ecosystem |
| Transaction composition | Lumos or the current supported CKB SDK stack |
| Error monitoring | Sentry or equivalent |
| Product analytics | PostHog, Amplitude, or privacy-respecting equivalent |

### CKB / blockchain layer

| Concern | Recommendation |
| --- | --- |
| Cell collection and transaction assembly | Lumos / official current CKB SDK tooling |
| Node access | Hosted CKB RPC provider initially; redundant RPC endpoints for production |
| Indexing | CKB Indexer or hosted indexer; custom indexer for social/feed projections |
| Smart contract | CKB Script in Rust, with a tested Type Script for the Chain Cell transition rules |
| Testing | Unit tests, property tests for expiry rules, integration tests on testnet, transaction simulation before signing |
| Event indexing | Index consumed/created Chain Cells and transaction metadata into a read model |

### Off-chain product services

| Concern | Recommendation |
| --- | --- |
| Application API | TypeScript service (for example, Hono, Fastify, or NestJS) |
| Database | PostgreSQL for profiles, queue entries, Relay metadata, moderation, and indexed read models |
| Cache / queues | Redis plus a job queue for notifications, index syncing, and moderation workflows |
| Media and artifact content | IPFS / decentralized storage for permanent media; object storage/CDN for optimized delivery |
| Authentication | Wallet signature-based sign-in (SIWE-style pattern adapted to CKB) |
| Notifications | Web push, email, and optionally Telegram / Discord integrations |
| Search and discovery | PostgreSQL search initially; dedicated search only after product-market fit |

---

## Wallet and identity integration

Wallet connection should be introduced only when the transaction and identity flows are ready. The current demo identity (“Emma”) should be replaced by a wallet-derived profile.

### Target wallet flow

1. User clicks **Connect wallet**.
2. The app detects compatible CKB wallets.
3. User selects an account / lock script.
4. The app asks the wallet to sign a short, nonce-based message for session authentication.
5. The profile service maps the signed lock hash to a display name, contribution Passport, and queue eligibility.
6. When a user becomes Keeper, the application confirms the live Chain Cell lock matches their connected account.
7. The app builds a handoff transaction, simulates it, and sends it to the wallet for signing.
8. After broadcast and indexer confirmation, React Query invalidates the Chain, lineage, artifact, and Passport queries.

### Important UX rules

- Never imply that a transaction is final before indexer confirmation.
- Clearly distinguish: `draft` → `wallet approval needed` → `broadcast` → `confirming` → `confirmed` → `failed`.
- Show network fees and required capacity before signing.
- Keep the current Keeper’s deadline visible during transaction creation.
- Warn when remaining time is too low to safely complete a handoff.
- Offer a copyable transaction link / explorer link after broadcast.

---

## Data model split: on-chain vs off-chain

| Data | Recommended home | Why |
| --- | --- |
| Current owner lock hash | On-chain | Ownership and authorization must be trustless |
| Expiry and handoff window | On-chain | Death rule must be enforceable |
| Chain generation / owner count | On-chain or indexable transition | Needed for trophy logic and integrity |
| Lineage transaction references | On-chain / indexed | Provides auditable provenance |
| Artifact content hash | On-chain | Makes the cultural record verifiable |
| Full artifact text and images | Decentralized storage + database read model | Keeps transactions compact and performant |
| Relay definitions | Off-chain, versioned and signed | Allows curation and partner updates |
| Relay completion proof | Hybrid | Off-chain verification with optional on-chain attestation |
| Queue pledges / reactions | Off-chain | Social interaction needs moderation and low fees |
| Passport XP and badges | Off-chain first, on-chain attestation for milestones | Better iteration speed without losing verifiability |

---

## Safety, fairness, and anti-spam requirements

The streak mechanic is powerful only if it feels fair and safe.

### Smart-contract safety

- Independent audit before mainnet launch.
- Explicit handling of exact deadline boundaries.
- Enforce exactly one valid successor Cell for a live transfer.
- Prevent duplicate successor Cells or unauthorized state resets.
- Test malicious transaction variants and replay attempts.
- Define an emergency policy before launch; do not add privileged override keys casually.

### Product safety

- Rate-limit queue pledges, Relay completions, and reactions.
- Require wallet signature / reputation threshold before high-impact actions.
- Add report, hide, and moderation workflows for user-generated artifact content.
- Curate Relay partners; do not allow arbitrary links to become official missions.
- Avoid pay-to-win ownership mechanics.
- Do not make XP or badges resemble investment returns, yield, or guaranteed financial rewards.

### Timing and reliability

- Use server time and on-chain time assumptions consistently; client clocks are only presentation aids.
- Alert the Keeper before expiry at several configurable milestones.
- Do not promise a successful pass when network congestion or wallet signing may prevent completion.
- Consider a minimum safe-handoff threshold, where the app warns or restricts starting a complex handoff too close to expiry.

---

## Notifications that create healthy urgency

Notification design can make Chain Letter return-worthy without becoming spammy:

- **Keeper:** “You have 6 hours to keep the Cell alive.”
- **Keeper:** “Your endorsed candidate is ready for the handoff.”
- **Followers:** “The Chain has 30 minutes left—will it survive?”
- **Relay participants:** “A new CKB Relay is live. Keep your streak.”
- **Queue members:** “The Keeper opened the handoff window.”
- **Chain death:** “The Cell locked after 47 Keepers. Its archive is now permanent.”
- **Milestones:** “This Chain reached 25 / 100 / 500 successful handoffs.”

Users must be able to opt into only the channels they value.

---

## Metrics to validate the product

### Core health

- Chain survival rate by handoff window.
- Median time remaining at successful handoff.
- Number of completed handoffs per chain.
- Percentage of chains reaching 10, 25, 100, and 500 Keepers.
- Percentage of new Keepers who return after passing the Cell.

### Community health

- Relay completion rate.
- Relay streak retention.
- Queue pledge-to-selection conversion.
- Artifact contribution rate per active chain.
- Number of unique contributors who later become Keepers.

### Ecosystem health

- Traffic and verified actions sent to partner CKB applications.
- New wallet connections attributable to a Relay.
- Partner Relay completion and repeat participation.
- Percentage of Passport holders engaging with more than one ecosystem project.

Avoid optimizing only for transfer volume. A chain that is cared for, culturally memorable, and helpful to the ecosystem is more valuable than one that moves rapidly with no real participation.

---

## Recommended roadmap

### Phase 1 — Prototype validation

- Ship the current demo publicly with clear “test experience” labeling.
- Collect qualitative feedback on urgency, artifact creation, and queue pledges.
- Test 24-hour and 7-day chain windows.
- Recruit a small group of CKB communities and creators for curated Relays.
- Validate whether people return for streaks, social selection, and the artifact.

### Phase 2 — Testnet Keeper Pass

- Add wallet connection and signature-based profiles.
- Deploy the first audited testnet Chain Cell script.
- Build transaction composition, wallet signing, and indexer confirmation states.
- Create a basic API, PostgreSQL read model, media storage, and notification service.
- Launch curated Relay partnerships with manual moderation.

### Phase 3 — Mainnet launch

- Complete security review and load testing.
- Deploy a mainnet version with conservative capacity and timing rules.
- Add explorer links, verified on-chain lineage, and permanent artifact commitments.
- Introduce public chain discovery, follow controls, and notification preferences.
- Make Trophy Relics visible as high-status CKB cultural archives.

### Phase 4 — Network expansion

- Multiple themed Chains: creator chains, local community chains, builder chains, event chains.
- Partner-sponsored Relays and verified ecosystem credentials.
- Portable Passport reputation and milestone attestations.
- Community tools for chain hosts, moderators, and Relay partners.

---

## What is complete today vs. what remains

### Complete in the current front-end demo

- Live Chain Cell presentation and countdown.
- Alive / warning / critical / dead visual states.
- Mock CKB-style Cell handoff flow.
- Owner lineage and milestone progress.
- Keeper artifact, community featuring, active Relay selection, Relay completion, queue pledges, endorsement, and contribution Passport.
- React Query data fetching, mutation state, caching, loading, and error surfaces.
- Responsive bright neo-brutalist visual system with original art assets.

### Required before a production launch

- Wallet provider and signed user identity.
- CKB transaction assembly, signing, simulation, broadcasting, and confirmation handling.
- Audited Chain Cell type script and testnet deployment.
- Indexer and durable database-backed read model.
- Persistent media / artifact storage and content commitments.
- Real Relay verification and partner onboarding process.
- Notification service.
- Content moderation, rate limiting, abuse prevention, analytics, monitoring, and incident response.
- Legal and policy review appropriate to launch regions and reward mechanics.

---

## Closing narrative

Chain Letter is not trying to make every CKB interaction feel like finance. It gives the ecosystem a social object worth caring about.

The Cell is scarce. The deadline is real. The handoff is public. The artifact is permanent. The Keeper gets a brief moment of authorship, while everyone else can build standing by helping the chain and the broader CKB community move forward.

**Keep it alive. Leave a mark. Pass it on.**

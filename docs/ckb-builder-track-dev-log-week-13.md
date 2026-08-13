# CKB Builder Track Dev Log (Week 13)

- Name: Chioma Christopher

- Week Ending: 27-07-2026

## What I Built

This week I moved from protocol research and product architecture into application design and frontend implementation.

I began building **Chain Letter**, a CKB-native social collectible where one unique Cell must be passed from one Keeper to another before a deadline expires.

If the current Keeper does not pass it in time:

**The Chain dies.**

The Cell becomes permanently locked and can never move again.

The project is designed around a simple idea:

> A Cell can hold more than value. It can hold a promise.

Chain Letter combines the mechanics of streaks, public responsibility, collectibles, community participation and CKB’s Cell model.

The current build is a functional React prototype. It models the intended CKB flow using typed mock data and React Query, while the wallet, transaction, indexer and on-chain script layers are planned for the next stage.

My goals this week were to:

- Define the Chain Letter product loop

- Translate the CKB Cell model into a user-facing experience

- Build the live Chain dashboard

- Model the timed handoff flow

- Create meaningful Keeper-only privileges

- Add community participation beyond ownership

- Build CKB Relay and reward mechanics

- Design a visual identity that feels culturally distinct from a normal crypto dashboard

- Document the future CKB, wallet and backend stack needed to take the prototype to production

---

## The Chain Letter Idea

Chain Letter is one unique on-chain collectible.

Only one person can hold it at a time.

That person becomes the current **Keeper**.

The Keeper has a fixed time window, currently modeled as 24 hours, to pass the Cell to someone else.

The ownership chain looks like this:

```text
Alice
  ↓
Bob
  ↓
Charlie
  ↓
David
  ↓
Emma
```

Each successful handoff records the former Keeper and creates a new deadline for the next person.

If Emma fails to pass the Cell before the timer ends:

```text
Chain Dead

Cell locked forever
```

This creates a social streak mechanic similar to:

- Snapchat streaks

- Duolingo streaks

- “Don’t break the chain” habits

- Community relay games

- Internet chain-letter culture

The difference is that the streak is represented by a scarce CKB object with a visible, auditable ownership history.

A long chain becomes valuable because hundreds of people successfully coordinated to keep it alive.

---

## Why I Chose the CKB Cell Model

The product maps naturally to CKB because the Chain Letter is literally one Cell.

The Cell model gives the experience a clear ownership rule:

- One Cell exists

- One live owner controls it

- One valid transaction can consume it

- One successor Cell is created for the next Keeper

A successful handoff conceptually works like this:

```text
Consume current Chain Cell
          ↓
Validate current Keeper + deadline
          ↓
Create successor Chain Cell
          ↓
Assign new Keeper lock
          ↓
Set new expiry time
          ↓
Record next generation of the chain
```

This is cleaner than trying to coordinate a shared mutable object across multiple users.

The Chain Cell becomes the source of truth for:

- Current Keeper

- Expiry timestamp

- Handoff window

- Chain generation / owner count

- Lineage commitment

- Artifact commitment

- Active Relay reference

- Alive or dead status

---

## What I Implemented This Week

### 1. Live Chain Cell Experience

I built the main Chain Letter dashboard around the live Cell.

It includes:

- A single animated Cell visual

- Current Keeper display

- Cell hash display

- Live countdown timer

- Chain urgency states

- Owner count

- Trophy progress toward 500 Keepers

- Full Keeper lineage

- Permanent dead-chain state

The timer has four visual states:

### Alive

The Keeper still has meaningful time remaining.

### Getting Late

The urgency begins to increase.

### Critical

The app makes it clear the Chain could break soon.

### Dead

The deadline has expired and the Cell is locked.

The UI is designed to make time visible and emotionally meaningful rather than hiding the most important state in a small notification.

---

## 2. CKB-Style Handoff Flow

I built a transfer modal that models the intended CKB transaction lifecycle.

The current Keeper can:

1. Open the handoff flow.

2. Choose or enter the next Keeper.

3. Confirm the handoff.

4. Create the next chain generation.

In the prototype, this flow updates mocked chain state.

The production version will instead:

1. Build a CKB transaction.

2. Consume the current Chain Cell.

3. Create a successor Chain Cell.

4. Change the lock script to the next Keeper.

5. Reset the expiry timestamp.

6. Commit the new lineage state.

7. Ask the connected CKB wallet to sign.

8. Broadcast the transaction.

9. Wait for indexer confirmation.

The current application already uses React Query mutations and cached query updates so the frontend is structured around this future asynchronous transaction model.

---

## 3. Keeper Pass Privileges

I spent time thinking about why someone would want to hold the Chain Letter beyond simply avoiding a broken streak.

The answer became the **Keeper Pass**.

Holding the Cell gives a person a temporary role, not just an NFT.

The Keeper has three important privileges.

### Living Artifact Privilege

The Keeper can add one permanent entry to the chain’s shared artifact.

They can leave:

- A message

- A rule

- A meme line

- A short cultural contribution for the next Keeper

Every entry becomes part of the Chain Letter’s evolving history.

Over time, the Cell becomes a community-made internet artifact rather than a static collectible.

The Keeper can also feature a community mark so the object reflects both ownership and participation.

### Relay Selection Privilege

The Keeper can select the active **CKB Relay**.

A Relay is a small action that helps the ecosystem, such as:

- Learning why Cells can represent ownership and state

- Exploring a CKB digital object

- Discovering a CKB creator or application

- Sharing a useful CKB tool or resource

- Completing a community onboarding action

Only the live Keeper can choose which Relay is active.

This makes holding the Cell an editorial and community-curation role.

### Next Keeper Nomination Privilege

The Keeper can see community members who have joined the handoff queue and pledged how they will care for the Cell.

They can endorse a candidate, which opens the real handoff flow with that person preselected.

This turns the transfer into a ritual of social trust instead of a simple name input.

---

## 4. Community Participation Beyond Ownership

A major product question was:

What do people do if they do not currently hold the NFT?

I did not want the app to become a passive spectator experience.

The current prototype gives non-Keepers several ways to participate:

### Complete the Active Relay

Any user can complete the current CKB Relay.

This gives them a reason to return and pushes useful discovery into the CKB ecosystem.

### Build a Contribution Passport

Users can collect:

- Relay streaks

- Contribution XP

- Proof badges

- Cultural contribution records

The Passport is designed as a reputation and participation layer.

It is not meant to be a financial promise or a pay-to-win shortcut to ownership.

### Join the Handoff Queue

A user can add their name and make a pledge to the next Keeper.

Examples include:

- “I will onboard someone new to CKB before I pass it.”

- “I will turn the next note into a comic panel.”

- “I will bring the Cell to my local CKB community.”

This creates a reason to care about the Chain before ownership is received.

### Follow the Artifact and Lineage

Even people who never hold the Cell can return to see:

- Whether the Chain survived

- What the next Keeper added

- Which Relay is live

- Who was selected next

- How the meme relic evolves over time

---

## 5. CKB Relay and Reward System

I implemented a first version of the Relay Board.

The Relay system is intended to make Chain Letter useful for the broader CKB ecosystem rather than only creating internal engagement.

Each Relay contains:

- A partner or ecosystem surface

- A mission title

- A short description

- A category such as Learn, Explore or Create

- A contribution XP reward

- A proof badge label

- A participation count

The current example Relays include:

- Decode one Cell

- Visit a digital object

- Ship a signal

The user can complete a Relay, receive XP and add proof to their Passport.

In later versions, Relay completion should be verified through partner integrations, signed attestations, transaction evidence or other anti-abuse mechanisms.

---

## 6. Contribution Passport

I created a Passport surface to make community contribution visible.

The Passport currently displays:

- Relay streak

- Contribution XP

- Earned proof badges

- Supporting product copy explaining that contribution comes before ownership

This can later become a portable CKB-native reputation system.

The immediate purpose is to answer an important retention question:

> Why should I return if I do not own the Cell today?

The answer is that users can keep a streak, earn proof, make a pledge, support the cultural artifact and build a visible history of helping the ecosystem.

---

## 7. React Query Architecture

I structured the frontend with React Query so the application already behaves like a real asynchronous product rather than a static UI.

The prototype includes:

- Query keys for Chain state

- Query keys for Keeper ecosystem state

- Typed queries for the Chain, artifact, Relay Board, handoff queue and Passport

- Mutations for passing the Chain

- Mutations for publishing artifact entries

- Mutations for featuring a community mark

- Mutations for setting the active Relay

- Mutations for completing a Relay

- Mutations for joining the handoff queue

- Mutations for endorsing a next Keeper

- Cache updates after successful actions

- Loading, pending and error states

This is important because the production app will need to coordinate multiple asynchronous sources:

- Wallet signing

- CKB RPC responses

- Transaction broadcast

- Indexer confirmation

- Off-chain artifact storage

- Notification delivery

- Partner Relay verification

The current query and mutation structure gives the frontend a good foundation for that work.

---

## 8. Visual Design Direction

I redesigned the app into a bright neo-brutalist visual system.

I wanted Chain Letter to feel like a collectible community poster wall, not a conventional dark crypto dashboard.

The design uses:

- Acid lime

- Cobalt blue

- Hot pink

- Bright yellow

- Orange

- Cream

- Black

The visual system includes:

- Thick black borders

- Hard square corners

- Offset black shadows

- Oversized poster-style typography

- High contrast urgency states

- Original generated artwork

- Bold reward cards

- Image-led Keeper, Relay and artifact surfaces

I added original image assets for:

- The Keeper Pass hero

- The CKB Relay Board

- The Living Meme Relic

This direction helps the product feel more culturally memorable and shareable.

---

## Current Technical Stack

### Frontend

- React

- TypeScript

- Tailwind CSS

- TanStack Query / React Query

- Framer Motion

- Lucide React icons

- date-fns

### Current Application Layers

```text
React Components
      ↓
Hooks
      ↓
React Query
      ↓
Mock API / in-memory product state
      ↓
Typed Chain and Keeper models
```

### Important Current Files

```text
pages/ChainLetter.tsx
  Main product page and Chain dashboard

api/chainApi.ts
  Mock CKB-style Chain Cell lifecycle

api/keeperApi.ts
  Mock artifact, Relay, queue and Passport services

hooks/useChain.ts
  Chain queries and transfer mutations

hooks/useKeeperEcosystem.ts
  Community queries and mutations

types/chain.ts
  Chain Cell, owner and status models

types/keeper.ts
  Artifact, Relay, queue and Passport models
```

---

## Current CKB Model vs Production CKB Model

### What Exists Now

The current app models the intended CKB behavior in memory.

It correctly represents the product logic:

- One active Chain Cell

- One current Keeper

- One expiry time

- One next owner after handoff

- Permanent dead state after expiry

- Historical lineage

However, it is not connected to a real CKB network yet.

### What Must Be Built Next

The production version needs:

- CKB wallet connection

- Wallet-based user identity

- CKB transaction construction

- Transaction signing

- Transaction broadcasting

- RPC integration

- CKB indexer integration

- An audited Chain Cell type script

- Testnet deployment

- Durable database-backed read models

- Decentralized or persistent artifact storage

- Notification infrastructure

---

## Proposed On-Chain Chain Cell State

The future Chain Cell should contain or commit to compact state such as:

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

The full social content should not be placed directly inside the Cell.

Instead:

- Rich text, images and Relay data can be stored off-chain.

- Artifact content should receive a content hash.

- The hash or a Merkle root should be committed to the Chain Cell or transaction witness.

- An indexer should reconstruct the public lineage, artifact history and activity feed.

This keeps the on-chain state compact while making the cultural record verifiable.

---

## Wallet Integration Plan

The next major frontend integration will be wallet connection.

The expected flow is:

1. User clicks Connect Wallet.

2. The app detects compatible CKB wallets.

3. User selects an account.

4. The wallet signs a nonce-based login message.

5. The app maps the user’s lock hash to a profile and Passport.

6. The app checks whether the connected wallet controls the active Chain Cell.

7. The Keeper initiates a handoff.

8. The app builds and simulates a transaction.

9. The wallet signs the transaction.

10. The transaction broadcasts.

11. The app waits for indexer confirmation.

12. Chain, lineage, artifact and Passport queries refresh.

The UI must clearly distinguish these states:

```text
Draft
  ↓
Wallet approval required
  ↓
Broadcasting
  ↓
Confirming on CKB
  ↓
Confirmed
```

This is especially important because the Chain countdown creates real urgency.

The application should never imply a handoff is complete until it has been confirmed by the network and indexer.

---

## Security and Fairness Considerations

The Chain Letter mechanic only works if people trust that the timer and ownership rules are fair.

### Smart Contract Requirements

The Chain Cell type script should:

- Validate the current Keeper authorization.

- Validate the deadline.

- Require exactly one valid successor Cell before expiry.

- Prevent unauthorized state resets.

- Prevent duplicate successor Cells.

- Prevent a live transfer after the Chain has died.

- Preserve the required Chain state transitions.

The script should be independently audited before mainnet launch.

### Product Requirements

The social layer will need:

- Wallet signature-based identity

- Rate limits

- Abuse prevention

- Content reporting

- Moderation tools

- Curated Relay partners

- Queue spam controls

- Anti-sybil mechanisms for reward claims

- Clear reward language that avoids financial promises

The product should reward useful participation without becoming a speculative or pay-to-win game.

---

## Main Lessons From This Week

### CKB Architecture Can Become a Product Mechanic

The Cell model is not only an implementation detail.

It can directly shape a product experience.

One Cell, one owner and one valid successor transaction naturally creates the Chain Letter’s sense of responsibility.

### Scarcity Alone Is Not Enough

The Cell becomes more interesting when the holder has a temporary role.

The Keeper Pass adds authorship, mission selection and social nomination to the ownership experience.

### Non-Holders Need a Reason to Return

The Artifact, Relay Board, Queue and Passport solve the spectator problem.

People can contribute, build proof and become visible before they own the Cell.

### CKB Ecosystem Value Must Be Intentional

The Relay layer is important because it directs participation toward useful discovery, learning and creation in the CKB ecosystem.

This gives the product a purpose beyond engagement for engagement’s sake.

### Frontend State Design Matters Before Wallet Integration

Even though the current backend is mocked, using typed APIs, queries and mutations now gives the project a clear path toward real network interactions later.

---

## Key Concepts Applied This Week

- CKB Cells

- Cell consumption and creation

- Lock scripts and ownership

- Time-based state transitions

- Expiry validation

- Permanent lock / dead state

- Chain lineage

- Community-owned cultural artifacts

- Keeper roles

- Wallet-based identity planning

- React Query

- Query invalidation and cache updates

- Async mutation states

- Contribution reputation

- Relay mechanics

- CKB ecosystem onboarding

- Neo-brutalist product design

---

# Protocol decisions — v3

## 1. Community is application state, not an MVP CKB object

Community membership is kept in the application database for now. Events created under a community carry a `community_id` commitment in Event data. A future Community Type Script can be added once there is a real reason to settle community membership/permissions on chain.

## 2. Participant Entry Cell is the membership primitive

The Event Cell is not just a counter. It also holds a fixed 64-slot roster. Each participant entry is a separate, non-transferable proof cell locked to the participant's normal lock.

The fixed roster is what gives the protocol global uniqueness for a player within an event: the Event Type Script rejects a second copy of the same player lock hash in another slot.

## 3. Treasury is the money source of truth

`Event.pot_amount` is derived from the spendable capacity of the unique Event Treasury Cell. This avoids the earlier bug where a numeric pot could grow without real CKB entering the treasury.

## 4. Entry fee accounting

A join must atomically produce:

- one new Participant Entry Cell,
- one new roster slot,
- at least one entry-fee increase in treasury spendable capacity.

Additional treasury growth in the same transaction is permitted for sponsorship.

## 5. Clock

The chain stores the current turn's start and deadline. It does not store every countdown tick.

For turn number `n`:

```text
turn_duration = max(min_turn_secs, base_turn_secs - n * shrink_step_secs)
```

The script requires `deadline = start + turn_duration`.

Timeout uses transaction `since` with absolute timestamp metric, so the expired-player transition can be submitted by a relayer without waiting for the player to click a button.

## 6. Settlement

The Event Cell reaches `FINISHED`, then one settlement transaction changes it to `SETTLED`, consumes the Treasury Cell, and creates the winner Reward Claim cells.

The Treasury Lock requires claim amounts to sum exactly to the final spendable pot and limits the number of claims to `winners_n`.

## 7. History

The Event Cell is never burned. `SETTLED` is terminal. Participant entries and reward claims are separately burnable/claimable, but the Event state remains an on-chain historical anchor.

## 8. Fixed roster sizing

The Event Cell reserves 64 participant slots. The deployment UI should cap `max_players` at 64. This fixed roster is deliberately simple and auditable for the first version; a Merkle-commitment roster can replace it later if large events are required.

# Deployment and transaction order

## 1. Toolchain

Use a current Rust toolchain compatible with the CKB script templates and the deployed network. The contracts target the RISC-V CKB script environment and use `ckb-std 1.1.0`.

The current CKB release line is 0.209.x and current networks use CKB2023. citeturn256505search2turn254733search0

Because CKB contracts execute in CKB-VM, the final binaries must be built for the CKB RISC-V target; do not deploy ordinary host binaries. CKB's `ckb-std` README also notes that recent versions need atomic lowering flags for RISC-V builds. citeturn419319search0

## 2. Build

Example commands:

```bash
rustup target add riscv64imac-unknown-none-elf

export RUSTFLAGS="-C passes=lower-atomic"

cargo build --release --target riscv64imac-unknown-none-elf \
  -p keepers-relay-event-type \
  -p keepers-relay-participant-type \
  -p keepers-relay-event-treasury-lock \
  -p keepers-relay-reward-claim-type
```

The output ELF/contract artifacts will be under:

```text
target/riscv64imac-unknown-none-elf/release/
```

## 3. Deploy code cells

For each contract:

1. Create a normal CKB transaction that creates an output cell containing the binary as data.
2. Pay enough capacity for the binary cell.
3. Record each code cell out point.
4. Compute each contract's code hash from the deployed data cell.

Store these values in a deployment manifest. Never hard-code mainnet addresses until the exact binary has been built and hashed.

## 4. Event Type ID

Do **not** implement Type ID by manually assuming output index 0. Use CKB's standard Type ID rule/helper. `ckb-std` exposes `check_type_id`, and the helper derives the Type ID from the first input and the actual output position of the Type ID cell. citeturn476529view0turn254733search2

For an Event Cell, set:

```text
Event Type Script args = 32-byte Type ID
Event data event_id      = same 32-byte Type ID
```

That makes the Event Cell's script hash unique to that event.

## 5. Create one event

The create transaction should create exactly:

```text
Output A: Event Cell
Output B: Event Treasury Cell
```

Event Cell lock:

```text
controller_lock_hash
```

Treasury Cell lock args:

```text
[event_type_script_hash || event_id]
```

The Event Cell stores:

- immutable community/event identity
- creator/controller locks
- treasury lock hash
- participant code hash
- reward claim code hash
- game rules/question-set commitments
- participant roster slots
- initial/shrinking/minimum turn duration
- current pot

## 6. Join transaction

One paid join is:

```text
Input(s): player's normal CKB cells + Event Cell + Treasury Cell
Outputs: updated Event Cell + updated Treasury Cell + Participant Entry Cell
```

The Participant Entry Cell is locked by the player's normal lock and its type args are:

```text
[event_type_script_hash || event_id || player_lock_hash]
```

Its data stores the entry fee, joined time, nonce, and roster slot.

The three scripts cross-check the same transaction:

```text
Event Type
  └─ exactly one empty roster slot becomes this player's lock hash
  └─ player_count increases by 1
  └─ treasury spendable pot increases by at least entry_fee

Participant Type
  └─ Event is REGISTRATION -> REGISTRATION
  └─ the same roster slot is opened
  └─ player_lock_hash == output lock hash
  └─ entry_fee == Event.entry_fee
  └─ treasury pot increases by at least entry_fee

Treasury Lock
  └─ exactly one treasury cell continues
  └─ spendable treasury capacity cannot decrease
```

That gives you a real on-chain membership primitive, not just a counter.

## 7. Start the game

Move:

```text
REGISTRATION -> READY
READY -> LIVE
```

The first LIVE output must have:

```text
turn_number = 0
turn_state = PENDING
current_holder = registered player
turn_started_ms = non-zero
turn_deadline_ms = turn_started_ms + initial_duration
```

The duration is derived from the event configuration:

```text
max(min_turn_secs,
    base_turn_secs - (shrink_step_secs * turn_number))
```

No per-second transaction is required.

## 8. Answer a turn

Normal answer:

```text
PENDING -> ANSWERED
```

Timeout:

```text
PENDING -> TIMED_OUT
```

Timeout transactions must carry an absolute timestamp `since` using the timestamp metric. CKB's `since` field is a transaction input precondition; absolute timestamp is one of the supported modes. citeturn607238search0

The contract compares the encoded timestamp threshold to the stored deadline.

## 9. Advance the baton

After ANSWERED or TIMED_OUT:

```text
turn_number += 1
previous_holder = old current_holder
current_holder = next registered player
turn_state = PENDING
selected_index = -1
turn_started_ms = new start
turn_deadline_ms = derived shrinking deadline
```

The next holder does not need a manual "Pass" button. The server/relayer can submit the transition once the prior action is recorded or a timeout has become valid.

## 10. Finish and settle

Finish:

```text
LIVE/PAUSED -> FINISHED
```

At FINISHED:

- result_hash is non-zero
- winner_count is 1..winners_n
- final_pot_amount remains zero until settlement
- the Event Cell is frozen after FINISHED

Settlement:

```text
FINISHED -> SETTLED
```

The settlement transaction consumes the treasury and creates reward claim cells.

Each reward claim:

```text
type args = [event_type_script_hash || event_id]
data = [recipient_lock_hash, amount, event_id, nonce]
lock = recipient_lock_hash
```

The treasury lock requires:

```text
sum(all claim amounts) == treasury spendable pot
```

and no treasury cell remains.

## 11. Claim

A winner spends their reward claim cell normally. The Reward Claim Type Script allows a one-time burn only when the settled Event Cell is supplied as a cell dependency. The recipient lock still controls who can actually spend the claim cell.

## 12. What is intentionally NOT on chain

Do not create CKB transactions for:

- every second of a countdown
- chat/presence
- UI state
- profile edits
- AI generation
- raw question text
- notifications

Instead, commit the important content with `question_set_hash` and `rules_hash`, and keep the application experience off-chain.

## Protocol references

CKB separates lock authorization from type-script state validation; locks control whether an input can be spent, while type scripts validate the state transition. citeturn419319search5turn419319search8

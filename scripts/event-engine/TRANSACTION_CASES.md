# Required transaction-level tests

These are the minimum cases to run on a CKB devnet before testnet deployment.

## Event create

- valid event + treasury
- wrong Type ID
- duplicate Event output
- zero max players
- max players > 64
- min players > max players
- winners_n = 0
- invalid shrinking clock values
- missing treasury
- non-controller Event lock

## Participant entry

- valid join
- wrong event id
- wrong event type hash
- wrong participant lock
- wrong slot
- occupied slot
- duplicate player already in roster
- wrong entry fee
- treasury does not increase enough
- join after registration closes
- participant transfer attempt
- participant rewrite attempt

## Gameplay

- READY without min players
- first LIVE turn
- wrong first holder
- wrong deadline
- wrong shrinking duration
- ANSWERED with changed holder
- ANSWERED with changed action commit
- invalid selected answer
- TIMED_OUT before deadline
- TIMED_OUT with non-timestamp since
- TIMED_OUT with since below deadline
- next turn without prior ANSWERED/TIMED_OUT
- next turn using an unregistered holder
- pause/resume mutating turn state
- finish from PENDING
- finish with zero winners
- finish with too many winners

## Treasury

- treasury creation with zero spendable pot
- sponsorship/top-up
- treasury decrease before finish
- treasury split into multiple cells
- treasury settlement without Event SETTLED
- settlement with missing claims
- settlement with wrong claim type
- settlement with duplicate recipient
- settlement where claim sum < pot
- settlement where claim sum > pot

## Claims

- valid claim creation only in settlement tx
- duplicate claims in one event
- claim to wrong lock
- claim with zero amount
- claim rewrite
- claim transfer
- claim burn without settled Event dependency
- claim double burn

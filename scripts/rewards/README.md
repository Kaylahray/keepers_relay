# Reward treasury (PROOF sUDT)

Keepers uses the same **claim ticket + treasury lock** flow as Spore ID and
`ckb-claim-treasury-protocol/reward-contracts`.

## Deploy (testnet)

```bash
cd ../../../ckb-claim-treasury-protocol/reward-contracts
make prepare && make build && make test
# deploy reward-claim-type and reward-treasury-lock to testnet (offckb / your flow)
```

Copy deployed metadata into `.env.local`:

- `NEXT_PUBLIC_SUDT_*` — your PROOF token type script
- `NEXT_PUBLIC_REWARD_CLAIM_*` — claim ticket type script
- `NEXT_PUBLIC_REWARD_TREASURY_*` — treasury lock (args = claim type script hash)
- `REWARD_AUTO_ISSUER_PRIVATE_KEY` — server wallet that mints claim Cells (fund with CKB)

## Runtime flow

1. User earns a milestone in-app (`username_claimed`, `profile_completed`, …).
2. Client calls `POST /api/rewards/auto-issue` → server mints a **claim Cell** to their lock.
3. Passport shows open tickets → user clicks **Claim PROOF**.
4. Wallet tx spends claim Cell + treasury sUDT → user receives PROOF.

Soft PROOF in the app store still works when treasury env is unset.

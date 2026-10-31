# Crowns v5 + Duels on Pudge: deploy runbook

v5 does two jobs.

**Crowns, per-lap clock.** Each lap gets its own 3-minute window. The window opens at the block the lap's road came from. A steal names the entry's block in `header_deps`, so the chain can check that the run was on time.

**Duels.** `duel-type` holds two stakes in escrow, for an artillery duel or a lane race. It has a Classic or Pressure turn clock. `artillery` is the game it replays to judge a duel; v5 adds the stone tower in the middle of the field.

The match and bid layouts changed, so v5 deploys **new** cells with new type ids, as v4 did. The lane-runner game is byte-for-byte v4's, so v5 reuses v4's cell.

Cost: about 302,000 CKB of storage (match 70,064 B, bid 61,800 B, treasury 53,400 B, duel 75,424 B, artillery 40,912 B). The deploy account has about 73,000 CKB free, so step 1 frees more first.

## 0. Check

- `pnpm exec tsx scripts/crowns-testnet/open-crowns.ts` should print `No open crowns.` (checked 2026-10-30).
- No live cell uses the v2 or v4 match, bid or treasury scripts (checked 2026-10-30: 0 of each).
- WSL: `make build && cargo test -p tests` in `scripts/sudden-death`: 145 pass. Devnet: `duel-e2e.ts` 19/19.

## 1. Retire the old code cells (gives back 389,193 CKB)

These seven code cells belong to versions nothing uses any more: all four v2 cells, plus v4's match, bid and treasury. **v4's lane-runner (`0xb068…c8db:3`) stays: v5 uses it.** Spending a type-id cell with no output of that type simply ends it. The CKB goes back to the deploy account.

```bash
cd /mnt/c/Users/chiom/Desktop/spore/keepers_relay/keepers_relay/scripts/sudden-death/deployment/testnet-v5/crowns
export CKB_CLI_HOME=/mnt/c/Users/chiom/.ckb-cli
cli="$HOME/ckb-cli/target/release/ckb-cli --url https://testnet.ckb.dev"
from=ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvu2rela8ce3j70u76uq3js967a3n07wlgf65e4e
v2=0xc9f1f7a3da0aaed8b6f0a0c98614b7c75756db89c938cb7c1f1e5447070301d4
v4=0xb068b72a89e8d758c69569a1eda11c997570039c6f23226011ab64e1df55c8db

$cli tx init --tx-file retire.json
for i in 0 1 2 3; do $cli tx add-input --tx-hash $v2 --index $i --tx-file retire.json; done
for i in 0 1 2;   do $cli tx add-input --tx-hash $v4 --index $i --tx-file retire.json; done
$cli tx add-output --to-sighash-address $from --capacity 389192.99 --tx-file retire.json
$cli tx info --tx-file retire.json
$cli tx sign-inputs --from-account $from --tx-file retire.json --add-signatures
$cli tx send --tx-file retire.json
```

`tx info` should show 7 inputs (389,193 CKB), 1 output (389,192.99 CKB) and a 0.01 CKB fee. Wait for it to commit, then check: `$cli wallet get-capacity --address $from` still shows about 500,000 in total, now nearly all of it free.

## 2. Deploy v5 with ckb-cli (same folder)

```bash
$cli deploy gen-txs --from-address $from --fee-rate 2000 \
  --deployment-config deployment.toml --migration-dir migrations --info-file info.json
$cli deploy sign-txs --from-account $from --info-file info.json --add-signatures
$cli deploy apply-txs --migration-dir migrations --info-file info.json
```

## 3. Point the app at v5 (localhost first)

```bash
pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts
```

It prints the `NEXT_PUBLIC_SD_*` block, now with the `NEXT_PUBLIC_SD_DUEL_*` and `NEXT_PUBLIC_SD_ARTILLERY_*` lines. Put it in `.env.local`, then restart the dev server. Vercel stays on v4 until you decide to switch it.

## 4. Check it live

1. **Crowns:** open a crown with two wallets, enter, play and seal laps, and steal. Then let it close by itself.
2. **Artillery duel:** wallet A challenges wallet B (in another browser), and B accepts. Fire shots from both sides. Play until a tank is destroyed or time runs out, then collect. Try a Pressure duel too.
3. **Lane race:** challenge, accept, race 5 laps on each side, hand in both runs, collect.
4. Paste a finish transaction into `/verify`.

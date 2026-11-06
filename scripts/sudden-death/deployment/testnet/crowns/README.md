# Crowns and Duels on Pudge testnet

What is deployed now is in `migrations/` (the newest file). The app reads the same values from `.env.local`.

| Cell | Kind | What it does |
| --- | --- | --- |
| `match-type` | type id | Checks every crown move: open, steal, close |
| `bid-type` | type id | Entries and the laps sealed on them |
| `treasury-lock` | type id | Holds the pot until the close |
| `duel-type` | type id | Duel stakes and turns |
| `artillery` | data hash | The duel game, replayed to judge a duel |
| `crown-run` | data hash | The crown game: replays laps and sets the lap window and clock floor |

`bid-type`, `treasury-lock` and `duel-type` point at copies of their deployed code in `build/onchain/`: a rebuild only moves panic line numbers in them, so ckb-cli leaves them alone. Point them back at `build/release/` when one of them really changes.

The proxy lock that key cells use is in `../proxy-lock/`.

## Upgrade (WSL, this folder)

Build first: `make build` in `scripts/sudden-death`, and the tests must pass.

```bash
cd /mnt/c/Users/chiom/Desktop/spore/keepers_relay/keepers_relay/scripts/sudden-death/deployment/testnet/crowns
export CKB_CLI_HOME=/mnt/c/Users/chiom/.ckb-cli
cli="$HOME/ckb-cli/target/release/ckb-cli --url https://testnet.ckb.dev"
from=ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvu2rela8ce3j70u76uq3js967a3n07wlgf65e4e

$cli deploy gen-txs --from-address $from --fee-rate 2000 \
  --deployment-config deployment.toml --migration-dir migrations --info-file info.json
$cli deploy sign-txs --from-account $from --info-file info.json --add-signatures
$cli deploy apply-txs --migration-dir migrations --info-file info.json
```

`gen-txs` lists each cell as Changed or Unchanged. Type-id scripts keep their type id. A changed game cell replaces the old one, so crowns opened on the old game can still close and refund, but nobody can steal in them.

## Then point the app at it

```bash
pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts
pnpm exec tsx scripts/crowns-testnet/check-config.ts
```

Copy the changed lines into `.env.local` and Vercel, then redeploy the site. `info.json` can be deleted once the transaction has landed.

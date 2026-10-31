# Crowns v4 on Pudge: deploy runbook

v4 does two jobs.

**Deadlines.** Each steal and close lists the match cell's block in `header_deps`. A steal counts only if it lands by its land-by time: the deadline that was running when it was sent, or the end of the player's run window, whichever comes first. The close needs no signature: the fee and an optional 1 CKB closer's reward come out of the host's share.

**Bots.**
- **Laps.** A run is 5 laps. Lap 1 is seeded by the block the entry lands in, each later lap by the block where the lap before it was sealed. A lap is sealed into the entry cell with a throwaway session key the browser holds, so there is no wallet popup.
- **Run window.** The grab must land within 10 minutes of the entry block.
- **Proof of work.** Locking an entry needs proof of work, 16 bits by default.
- **Reactive road.** The road reacts to the player's lane, so a run can't be planned from the seed alone.

The match cell grows from 166 to 215 bytes, the entry gains a nonce, and the game itself changed. So v4 deploys **new** cells, the game included, with new type ids. It is not an upgrade of v2.

## 1. Close every v2 crown first

The app can only play and close one version at a time. While the live site still runs v2:

1. Open each live crown on the site and press **End the game and pay the winner** once its clock has run out.
2. Check with `pnpm exec tsx scripts/crowns-testnet/open-crowns.ts`. It should print `No open crowns.`

Entries left out of a close stay safe. Their owners can take them back after the refund time.

## 2. Build and test (WSL)

```bash
cd /mnt/c/Users/chiom/Desktop/spore/keepers_relay/keepers_relay/scripts/sudden-death
make build
cargo test -p tests
```

All 89 tests must pass. Rebuild the browser game and check it scores exactly like the chain:

```bash
cd game-wasm && cargo build --release --target wasm32-unknown-unknown && cd ..
cp game-wasm/target/wasm32-unknown-unknown/release/crowns_game_wasm.wasm ../../public/games/lane-runner.wasm
node game-wasm/compare.mjs ../../public/games/lane-runner.wasm
```

Then run the end-to-end check on a local devnet (`offckb node` in another terminal, then from the app root):

```bash
pnpm exec tsx scripts/crowns-devnet/deploy.ts
pnpm exec tsx scripts/crowns-devnet/e2e.ts
```

## 3. Deploy with ckb-cli (WSL)

This step uses the same ckb-cli account as v2. Run it from this folder, so `migrations/` lands here and not in the v2 folder:

```bash
cd /mnt/c/Users/chiom/Desktop/spore/keepers_relay/keepers_relay/scripts/sudden-death/deployment/testnet-v4/crowns
from=ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqvu2rela8ce3j70u76uq3js967a3n07wlgf65e4e
~/ckb-cli/target/release/ckb-cli --url https://testnet.ckb.dev deploy gen-txs \
  --from-address $from --fee-rate 2000 \
  --deployment-config deployment.toml --migration-dir migrations --info-file info.json
~/ckb-cli/target/release/ckb-cli --url https://testnet.ckb.dev deploy sign-txs \
  --from-account $from --info-file info.json --add-signatures
~/ckb-cli/target/release/ckb-cli --url https://testnet.ckb.dev deploy apply-txs \
  --migration-dir migrations --info-file info.json
```

## 4. Point the app at v4

```bash
pnpm exec tsx scripts/crowns-testnet/env-from-migration.ts
```

It prints the `NEXT_PUBLIC_SD_*` block. Put it in `.env.local` and in Vercel's production env, then redeploy. `pnpm exec tsx scripts/crowns-testnet/check-config.ts` confirms each code cell is live.

## 5. Check it live

1. Open a crown with two wallets.
2. On each: practise, then **Pay to enter**. The phone proves work for a second or two, then lap 1 appears. Play it, seal it (a stamp, no popup), wait at the pit stop for the next lap, and repeat.
3. Grab the crown with one. After the clock runs out, leave the page open. It should close by itself with no wallet popup.
4. Paste the close transaction into `/verify`. Each steal shows **landed in time**, and **Prize went to** names the winner.

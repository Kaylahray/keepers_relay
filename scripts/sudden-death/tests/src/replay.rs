//! A look-ahead bot for the on-chain tests: long, legal runs of Crown Run, on the rules the script checks.

use crowns_crown_run_core::{picks_due, Run, COMBO, FORTUNE, LANES, LAP_TICKS, MAGNET, SAFE};

/// Ticks survived holding `lane` for up to `horizon` ticks, then coins picked up on the way.
fn holds(run: &Run, lane: u8, horizon: u32) -> (u32, u32) {
    let mut probe = run.clone();
    probe.step(Some(lane));
    let start = probe.tick();
    while !probe.over() && probe.tick() - start < horizon {
        probe.step(None);
    }
    let outcome = probe.outcome();
    let alive = if outcome.crashed { probe.tick() - start } else { horizon + 1 };
    (alive, outcome.coins)
}

/// The lane the bot heads for next: the one it survives longest in, then the one with more coins.
fn bot_lane(run: &Run, horizon: u32) -> u8 {
    let mut best = run.target();
    let mut best_key = (0, 0, 0);
    for lane in 0..LANES {
        let (alive, coins) = holds(run, lane, horizon);
        let key = (alive, coins, (lane == run.target()) as u32);
        if key > best_key {
            best_key = key;
            best = lane;
        }
    }
    best
}

/// The bot playing a run on the safe road: lap k is played on `seeds[k]`. Returns each lap's moves and picks.
pub(crate) fn bot_laps(seeds: &[u64], horizon: u32) -> Vec<Vec<u8>> {
    let upgrades = [MAGNET, FORTUNE, COMBO];
    let mut run = Run::new(seeds[0]);
    let mut laps = Vec::new();
    for (k, seed) in seeds.iter().enumerate() {
        if k > 0 {
            run.reseed(*seed);
        }
        let mut moves = Vec::new();
        let end = (k as u32 + 1) * LAP_TICKS;
        while !run.over() && run.tick() < end {
            let best = bot_lane(&run, horizon);
            let input = if best != run.target() {
                moves.extend_from_slice(&(run.tick() as u16).to_le_bytes());
                moves.push(best);
                Some(best)
            } else {
                None
            };
            run.step(input);
        }
        if run.crashed() {
            laps.push(moves);
            break;
        }
        match picks_due(k) {
            2 => {
                run.choose(Some(upgrades[k]), SAFE).expect("legal picks");
                moves.extend_from_slice(&[upgrades[k], SAFE]);
            }
            1 => {
                run.choose(None, SAFE).expect("legal picks");
                moves.push(SAFE);
            }
            _ => {}
        }
        laps.push(moves);
    }
    laps
}

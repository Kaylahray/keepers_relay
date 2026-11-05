//! Crown Run's rules on their own, off chain: picks, replay, road fairness, and a balance report.
//! Run the report with `cargo test -p tests crown_run_balance -- --nocapture`.

use crowns_crown_run_core::{
    picks_due, replay_encoded, replay_laps, Lap, Run, RunError, COMBO, DANGER, EVENT_LEN, FORTUNE, LANES, LAPS, LAP_TICKS, MAGNET, MAX_TICKS,
    OVERDRIVE, SAFE, SHIELD, VIEW_DEPTH,
};

const SEEDS: [u64; 5] = [11, 22, 33, 44, 55];
/// A two-lane crossing needs this many ticks once the car only has to clear the blocks.
const CROSSING_TICKS: i32 = 14;

type Picks = [(Option<u8>, u8); 4];

const ALL_SAFE: Picks = [(Some(SHIELD), SAFE), (Some(MAGNET), SAFE), (Some(FORTUNE), SAFE), (None, SAFE)];

fn survives(run: &Run, lane: u8, horizon: u32) -> (u32, u64) {
    let mut probe = run.clone();
    probe.step(Some(lane));
    let start = probe.tick();
    let mut lap_end = start + horizon;
    if lap_end / LAP_TICKS != start / LAP_TICKS {
        lap_end = (start / LAP_TICKS + 1) * LAP_TICKS;
    }
    while !probe.over() && probe.tick() < lap_end {
        probe.step(None);
    }
    (if probe.crashed() { probe.tick() - start } else { horizon + 1 }, probe.outcome().score)
}

/// A look-ahead player. `horizon` sets how far it can think ahead, so a small one plays worse.
fn best_lane(run: &Run, horizon: u32) -> u8 {
    let mut best = run.target();
    let mut best_key = (0, 0, 0);
    for lane in 0..LANES {
        let (alive, score) = survives(run, lane, horizon);
        let key = (alive, score, (lane == run.target()) as u32);
        if key > best_key {
            best_key = key;
            best = lane;
        }
    }
    best
}

/// Plays a run lap by lap. Returns each lap's bytes and the live outcome.
fn play(seeds: &[u64], picks: &Picks, horizon: u32) -> (Vec<Vec<u8>>, Run) {
    play_with(seeds, picks, horizon, 1)
}

/// `react` is how often the player looks up, in ticks. A person takes about 8 to 12.
fn play_with(seeds: &[u64], picks: &Picks, horizon: u32, react: u32) -> (Vec<Vec<u8>>, Run) {
    let mut run = Run::new(seeds[0]);
    let mut laps = Vec::new();
    for (k, seed) in seeds.iter().enumerate() {
        if k > 0 {
            run.reseed(*seed);
        }
        let mut moves = Vec::new();
        let end = (k as u32 + 1) * LAP_TICKS;
        while !run.over() && run.tick() < end {
            let lane = if run.tick() % react == 0 { best_lane(&run, horizon) } else { run.target() };
            let input = if lane != run.target() {
                moves.extend_from_slice(&(run.tick() as u16).to_le_bytes());
                moves.push(lane);
                Some(lane)
            } else {
                None
            };
            run.step(input);
        }
        if run.crashed() {
            laps.push(moves);
            break;
        }
        if picks_due(k) > 0 {
            let (upgrade, road) = picks[k];
            run.choose(upgrade, road).expect("legal picks");
            if let Some(upgrade) = upgrade {
                moves.push(upgrade);
            }
            moves.push(road);
        }
        laps.push(moves);
    }
    (laps, run)
}

fn laps_of<'a>(seeds: &[u64], laps: &'a [Vec<u8>]) -> Vec<Lap<'a>> {
    seeds.iter().zip(laps).map(|(seed, moves)| Lap { seed: *seed, moves }).collect()
}

fn mix(seed: u64, k: u64) -> u64 {
    (seed ^ (k + 1).wrapping_mul(0x9E37_79B9_7F4A_7C15)).wrapping_mul(0xBF58_476D_1CE4_E5B9) | 1
}

fn seeds_for(seed: u64) -> [u64; LAPS] {
    let mut out = [0; LAPS];
    for (k, slot) in out.iter_mut().enumerate() {
        *slot = mix(seed, k as u64);
    }
    out
}

#[test]
fn a_replay_matches_live_play_with_every_upgrade_and_road() {
    let picks: Picks = [(Some(OVERDRIVE), DANGER), (Some(COMBO), DANGER), (Some(MAGNET), SAFE), (None, DANGER)];
    let (laps, live) = play(&SEEDS, &picks, 60);
    let outcome = replay_laps(&laps_of(&SEEDS[..laps.len()], &laps)).expect("legal run");
    assert_eq!(outcome, live.outcome());
    let mut raw = vec![laps.len() as u8];
    for (seed, moves) in SEEDS.iter().zip(&laps) {
        raw.extend_from_slice(&seed.to_le_bytes());
        raw.extend_from_slice(&(moves.len() as u16).to_le_bytes());
        raw.extend_from_slice(moves);
    }
    assert_eq!(replay_encoded(&raw).unwrap(), outcome);
}

fn clean_lap_one() -> Vec<u8> {
    let (laps, run) = play(&SEEDS[..1], &ALL_SAFE, 60);
    assert!(!run.crashed());
    laps[0].clone()
}

#[test]
fn a_clean_lap_without_its_picks_is_rejected() {
    let mut lap = clean_lap_one();
    lap.truncate(lap.len() - 2);
    assert_eq!(replay_laps(&[Lap { seed: 11, moves: &lap }]), Err(RunError::Picks));
}

#[test]
fn unknown_picks_are_rejected() {
    let mut lap = clean_lap_one();
    let road = lap.len() - 1;
    lap[road] = 2;
    assert_eq!(replay_laps(&[Lap { seed: 11, moves: &lap }]), Err(RunError::Picks));
    lap[road] = SAFE;
    lap[road - 1] = 5;
    assert_eq!(replay_laps(&[Lap { seed: 11, moves: &lap }]), Err(RunError::Picks));
}

#[test]
fn the_same_upgrade_twice_is_rejected() {
    let (laps, _) = play(&SEEDS[..2], &ALL_SAFE, 60);
    let mut second = laps[1].clone();
    let at = second.len() - 2;
    second[at] = SHIELD;
    let run = [Lap { seed: SEEDS[0], moves: &laps[0] }, Lap { seed: SEEDS[1], moves: &second }];
    assert_eq!(replay_laps(&run), Err(RunError::Picks));
}

#[test]
fn a_lap_after_a_crash_is_rejected() {
    // Holding the middle lane crashes quickly, on lap one with no Shield.
    assert!(replay_laps(&[Lap { seed: 11, moves: &[] }]).unwrap().crashed);
    assert_eq!(replay_laps(&[Lap { seed: 11, moves: &[] }, Lap { seed: 22, moves: &[] }]), Err(RunError::Picks));
    // A crashed lap has no picks.
    assert_eq!(replay_laps(&[Lap { seed: 11, moves: &[SHIELD, SAFE] }]), Err(RunError::Picks));
}

#[test]
fn a_run_ending_after_any_locked_lap_keeps_its_unused_picks_legal() {
    let (laps, _) = play(&SEEDS[..2], &ALL_SAFE, 60);
    assert!(replay_laps(&laps_of(&SEEDS[..2], &laps)).is_ok());
    assert_eq!(replay_laps(&[]), Err(RunError::Laps));
}

#[test]
fn malformed_moves_are_rejected() {
    assert_eq!(replay_laps(&[Lap { seed: 1, moves: &[0] }]), Err(RunError::Length));
    assert_eq!(replay_laps(&[Lap { seed: 1, moves: &[5, 0, 1, 5, 0, 2] }]), Err(RunError::Order));
    assert_eq!(replay_laps(&[Lap { seed: 1, moves: &[5, 0, 3] }]), Err(RunError::Lane));
    let late = (LAP_TICKS as u16).to_le_bytes();
    assert_eq!(replay_laps(&[Lap { seed: 1, moves: &[late[0], late[1], 0] }]), Err(RunError::Late));
}

#[test]
fn a_shield_takes_one_hit_then_the_next_one_ends_the_run() {
    // Lap one on the bot, then hold still: the same seeds and moves, with and without a Shield.
    let (laps, _) = play(&SEEDS[..1], &ALL_SAFE, 60);
    let shielded = replay_laps(&[Lap { seed: 11, moves: &laps[0] }, Lap { seed: 22, moves: &[] }]).unwrap();
    let mut other = laps[0].clone();
    let upgrade = other.len() - 2;
    other[upgrade] = MAGNET;
    let bare = replay_laps(&[Lap { seed: 11, moves: &other }, Lap { seed: 22, moves: &[] }]).unwrap();
    assert!(bare.crashed && shielded.crashed, "holding still for a lap crashes both");
    assert!(shielded.ticks > bare.ticks, "the Shield carried the car past the first hit");
}

#[test]
fn the_danger_bonus_is_paid_only_for_a_finished_lap() {
    let picks: Picks = [(Some(SHIELD), DANGER), (Some(MAGNET), SAFE), (Some(FORTUNE), SAFE), (None, SAFE)];
    let (mut finished, mut crashed) = (0, 0);
    for seed in 1..40u64 {
        let seeds = seeds_for(seed);
        let (laps, _) = play(&seeds[..1], &picks, 60);
        let mut run = Run::new(seeds[0]);
        let mut cursor = 0;
        while run.tick() < LAP_TICKS && !run.over() {
            let at = cursor * EVENT_LEN;
            let events = laps[0].len() - laps[0].len() % EVENT_LEN;
            let mut input = None;
            if at < events && u16::from_le_bytes([laps[0][at], laps[0][at + 1]]) as u32 == run.tick() {
                input = Some(laps[0][at + 2]);
                cursor += 1;
            }
            run.step(input);
        }
        if run.crashed() {
            continue;
        }
        run.choose(Some(SHIELD), DANGER).unwrap();
        run.reseed(seeds[1]);
        // One tick short of the lap's end there is no bonus; the step that finishes it adds exactly 700 on top of the move.
        while run.tick() < LAP_TICKS * 2 - 1 && !run.over() {
            let lane = best_lane(&run, 60);
            run.step(Some(lane));
        }
        if run.crashed() {
            crashed += 1;
            continue;
        }
        let before = run.outcome().score;
        let mut plain = run.clone();
        run.step(None);
        if run.crashed() {
            crashed += 1;
            continue;
        }
        plain.reseed(seeds[1]);
        let gained = run.outcome().score - before;
        assert!(gained >= 700 && gained < 800, "the finish paid {gained}");
        finished += 1;
    }
    assert!(finished > 0, "some danger laps finish ({crashed} crashed)");
}

/// Every row is checked as it appears, on every road and with Overdrive: enough time after the row
/// in front to reach any lane, and enough warning after a moving block slides.
#[test]
fn from_any_position_the_next_row_can_be_reached() {
    let mut min_gap = i32::MAX;
    let mut min_warning = i32::MAX;
    let mut movers = 0;
    let combos: [Picks; 4] = [
        ALL_SAFE,
        [(Some(OVERDRIVE), SAFE), (Some(SHIELD), SAFE), (Some(FORTUNE), SAFE), (None, SAFE)],
        [(Some(SHIELD), DANGER), (Some(MAGNET), DANGER), (Some(FORTUNE), DANGER), (None, DANGER)],
        [(Some(OVERDRIVE), DANGER), (Some(SHIELD), DANGER), (Some(MAGNET), DANGER), (None, DANGER)],
    ];
    for seed in 0..1_000u64 {
        for picks in &combos {
            let seeds = seeds_for(seed + 1);
            let mut run = Run::new(seeds[0]);
            // Picks apply on schedule even for a car that survives only because nothing is checked: the
            // road is what's measured, and each lane is tried in turn so the road keeps stirring.
            let mut shield_free = run.clone();
            let _ = &mut shield_free;
            for k in 0..LAPS {
                if k > 0 {
                    run.reseed(seeds[k]);
                }
                let end = (k as u32 + 1) * LAP_TICKS;
                while !run.over() && run.tick() < end {
                    let lane = best_lane(&run, 60);
                    run.step(Some(lane));
                    let speed = run.road_speed().max(1);
                    for pair in run.rows().windows(2) {
                        min_gap = min_gap.min((pair[1].y - pair[0].y) / speed);
                    }
                    if let Some(far) = run.rows().iter().filter(|row| row.shift != 0).last() {
                        movers += 1;
                        min_warning = min_warning.min(4_000 / speed);
                        let _ = far;
                    }
                    if let Some(last) = run.rows().last() {
                        assert!(last.y <= VIEW_DEPTH + speed);
                    }
                }
                if run.crashed() {
                    break;
                }
                if k < 4 {
                    let (upgrade, road) = picks[k];
                    run.choose(upgrade, road).expect("legal picks");
                }
            }
        }
    }
    println!("closest rows {min_gap} ticks, moving block warning {min_warning} ticks, {movers} moving block samples");
    assert!(movers > 0, "moving blocks appear");
    assert!(min_gap >= CROSSING_TICKS, "rows {min_gap} ticks apart can't always be crossed");
    assert!(min_warning >= 6, "a moving block slid with {min_warning} ticks left to dodge it");
}

#[test]
fn moving_blocks_leave_their_coin_lane_open() {
    for seed in 1..200u64 {
        let seeds = seeds_for(seed);
        let mut run = Run::new(seeds[0]);
        run.reseed(seeds[0]);
        while !run.over() && run.tick() < LAP_TICKS {
            let lane = best_lane(&run, 45);
            run.step(Some(lane));
            for row in run.rows() {
                assert_ne!(row.blocked & 0b111, 0b111, "a row never blocks all three lanes");
                if row.coin != 0 {
                    assert_eq!(row.blocked & (1 << (row.coin - 1)), 0);
                    assert_ne!(row.shift, row.coin);
                }
            }
        }
    }
}

struct Tally {
    runs: u32,
    score: u64,
    crashes: u32,
    laps: u32,
}

fn tally(picks: &Picks, horizon: u32, react: u32, count: u64) -> Tally {
    let mut out = Tally { runs: 0, score: 0, crashes: 0, laps: 0 };
    for seed in 1..=count {
        let seeds = seeds_for(seed);
        let (laps, run) = play_with(&seeds, picks, horizon, react);
        out.runs += 1;
        out.score += run.outcome().score;
        out.crashes += run.crashed() as u32;
        out.laps += laps.len() as u32;
    }
    out
}

/// The balance report. It prints how each build does for a strong player and a weaker one, and only
/// checks the road isn't impossible: the numbers are for reading, not passing.
#[test]
fn crown_run_balance() {
    let builds: [(&str, Picks); 8] = [
        ("safe, shield magnet fortune", ALL_SAFE),
        ("danger, shield magnet fortune", [(Some(SHIELD), DANGER), (Some(MAGNET), DANGER), (Some(FORTUNE), DANGER), (None, DANGER)]),
        ("safe, overdrive shield fortune", [(Some(OVERDRIVE), SAFE), (Some(SHIELD), SAFE), (Some(FORTUNE), SAFE), (None, SAFE)]),
        ("danger, overdrive shield fortune", [(Some(OVERDRIVE), DANGER), (Some(SHIELD), DANGER), (Some(FORTUNE), DANGER), (None, DANGER)]),
        ("safe, combo magnet fortune", [(Some(COMBO), SAFE), (Some(MAGNET), SAFE), (Some(FORTUNE), SAFE), (None, SAFE)]),
        ("danger, combo magnet fortune", [(Some(COMBO), DANGER), (Some(MAGNET), DANGER), (Some(FORTUNE), DANGER), (None, DANGER)]),
        ("late danger, shield magnet fortune", [(Some(SHIELD), SAFE), (Some(MAGNET), SAFE), (Some(FORTUNE), DANGER), (None, DANGER)]),
        ("early danger, shield magnet fortune", [(Some(SHIELD), DANGER), (Some(MAGNET), DANGER), (Some(FORTUNE), SAFE), (None, SAFE)]),
    ];
    for (label, horizon, react) in [("sees far, reacts instantly", 60u32, 1u32), ("sees 1.5 s, reacts in 0.3 s", 45, 9), ("sees 1 s, reacts in 0.4 s", 30, 12)] {
        println!("\n{label}");
        for (name, picks) in &builds {
            let t = tally(picks, horizon, react, 60);
            println!(
                "{name:38} avg {:6}  crash {:3}%  avg laps {:.1}",
                t.score / t.runs as u64,
                t.crashes * 100 / t.runs,
                t.laps as f64 / t.runs as f64
            );
        }
    }

    let mut scores: Vec<u64> = (1..=200u64)
        .map(|seed| play(&seeds_for(seed), &ALL_SAFE, 60).1.outcome().score)
        .collect();
    scores.sort_unstable();
    println!("\nsame build across 200 roads: low {} median {} high {}", scores[0], scores[100], scores[199]);
    assert!(scores[100] > 1_000);
    let _ = MAX_TICKS;
}

/// One lap by a player with the given sight and reactions, from where `run` stands.
fn drive_lap(run: &mut Run, end: u32, horizon: u32, react: u32) {
    while !run.over() && run.tick() < end {
        let lane = if run.tick() % react == 0 { best_lane(run, horizon) } else { run.target() };
        let input = (lane != run.target()).then_some(lane);
        run.step(input);
    }
}

/// How much a modified browser gains by retrying each lap and locking its best try. The one-try
/// limit lives only in the app, so this is the number to know. It reports and does not judge.
#[test]
fn crown_run_retry_advantage() {
    let picks: Picks = [(Some(SHIELD), DANGER), (Some(MAGNET), DANGER), (Some(FORTUNE), DANGER), (None, DANGER)];
    println!();
    for tries in [1u32, 2, 5, 25, 100] {
        let (mut total, mut crashes) = (0u64, 0u32);
        for seed in 1..=60u64 {
            let seeds = seeds_for(seed);
            let mut run = Run::new(seeds[0]);
            for k in 0..LAPS {
                if k > 0 {
                    run.reseed(seeds[k]);
                }
                let end = (k as u32 + 1) * LAP_TICKS;
                let mut best: Option<Run> = None;
                for t in 0..tries {
                    let mut attempt = run.clone();
                    drive_lap(&mut attempt, end, 30 + t % 16, 9 + t % 5);
                    let better = match &best {
                        None => true,
                        Some(b) => (!attempt.crashed(), attempt.outcome().score) > (!b.crashed(), b.outcome().score),
                    };
                    if better {
                        best = Some(attempt);
                    }
                }
                run = best.unwrap();
                if run.crashed() {
                    break;
                }
                if k < 4 {
                    let (upgrade, road) = picks[k];
                    run.choose(upgrade, road).unwrap();
                }
            }
            total += run.outcome().score;
            crashes += run.crashed() as u32;
        }
        println!("{tries:3} tries a lap: avg {:6}  crash {:3}%", total / 60, crashes * 100 / 60);
    }
}

/// Prints runs for `scripts/local/compare-crown-run.mjs`, which replays them on the browser's wasm.
#[test]
fn crown_run_fixtures() {
    let builds: [Picks; 3] = [
        ALL_SAFE,
        [(Some(OVERDRIVE), DANGER), (Some(COMBO), DANGER), (Some(MAGNET), SAFE), (None, DANGER)],
        [(Some(FORTUNE), DANGER), (Some(SHIELD), SAFE), (Some(COMBO), DANGER), (None, SAFE)],
    ];
    for seed in 1..=30u64 {
        let seeds = seeds_for(seed);
        let (laps, run) = play_with(&seeds, &builds[seed as usize % 3], 40, 1 + (seed as u32 % 10));
        let mut raw = vec![laps.len() as u8];
        for (seed, moves) in seeds.iter().zip(&laps) {
            raw.extend_from_slice(&seed.to_le_bytes());
            raw.extend_from_slice(&(moves.len() as u16).to_le_bytes());
            raw.extend_from_slice(moves);
        }
        let outcome = replay_encoded(&raw).unwrap();
        assert_eq!(outcome, run.outcome());
        let hex: String = raw.iter().map(|byte| format!("{byte:02x}")).collect();
        println!("FIXTURE {} {hex}", outcome.score);
    }
}

const LOOK_EVERY: u32 = 6;

/// A lane to steer for now, holding it until the next look, such that some later choices live for
/// `ticks` more. None means no choice survives.
fn safe_lane(run: &Run, ticks: u32, budget: &mut u32) -> Option<u8> {
    let current = run.target();
    [current, (current + 1) % LANES, (current + 2) % LANES].into_iter().find(|lane| {
        if *budget == 0 {
            return true;
        }
        *budget -= 1;
        let mut probe = run.clone();
        probe.step(Some(*lane));
        for _ in 1..LOOK_EVERY.min(ticks) {
            probe.step(None);
        }
        !probe.crashed() && (ticks <= LOOK_EVERY || probe.over() || safe_lane(&probe, ticks - LOOK_EVERY, budget).is_some())
    })
}

/// The real fairness check: a player who searches every option must finish every road, on the
/// hardest picks, without a Shield. A crash here would be a road nobody could have survived.
#[test]
fn a_careful_player_finishes_every_road() {
    let hardest: [Picks; 3] = [
        [(Some(OVERDRIVE), DANGER), (Some(MAGNET), DANGER), (Some(FORTUNE), DANGER), (None, DANGER)],
        [(Some(MAGNET), DANGER), (Some(FORTUNE), DANGER), (Some(COMBO), DANGER), (None, DANGER)],
        [(Some(MAGNET), SAFE), (Some(OVERDRIVE), SAFE), (Some(FORTUNE), SAFE), (None, SAFE)],
    ];
    let (mut runs, mut crashes, mut low) = (0, 0, u64::MAX);
    for seed in 1..=300u64 {
        let picks = &hardest[seed as usize % 3];
        let seeds = seeds_for(seed);
        let mut run = Run::new(seeds[0]);
        for k in 0..LAPS {
            if k > 0 {
                run.reseed(seeds[k]);
            }
            let end = (k as u32 + 1) * LAP_TICKS;
            while !run.over() && run.tick() < end {
                let mut budget = 4_000;
                let lane = safe_lane(&run, 60, &mut budget);
                let chosen = lane.unwrap_or(run.target());
                run.step(Some(chosen));
                for _ in 1..LOOK_EVERY {
                    run.step(None);
                }
            }
            if run.crashed() {
                println!("seed {seed} crashed at tick {} on lap {}", run.tick(), k + 1);
                crashes += 1;
                break;
            }
            if k < 4 {
                let (upgrade, road) = picks[k];
                run.choose(upgrade, road).unwrap();
            }
        }
        runs += 1;
        low = low.min(run.outcome().score);
    }
    println!("{runs} runs, {crashes} crashes, lowest score {low}");
    assert_eq!(crashes, 0, "{crashes} of {runs} roads were not survived");
}

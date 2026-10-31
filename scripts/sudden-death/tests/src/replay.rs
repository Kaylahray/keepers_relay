//! The lane runner's rules on their own, off chain: determinism, tape validation, and the fixtures
//! `game-wasm/compare.mjs` uses to check the browser build scores exactly what the chain scores.
//! The on-chain checks (spawned game, cycles, copied runs) are the steal tests in `tests.rs`.

use crowns_game_core::{replay, replay_encoded, replay_laps, Lap, Run, TapeError, LANES, LAP_TICKS, MAX_TICKS, VIEW_DEPTH};
use std::path::PathBuf;

const BOT_HORIZON: u32 = 45;

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

/// A look-ahead bot. It plays the same rules the script checks, which is the point: a long, legal
/// tape for measuring the worst case, and a plain demonstration that a script proves a run is legal,
/// not that a human played it.
pub(crate) fn bot_tape(seed: u64, horizon: u32) -> Vec<u8> {
    let mut run = Run::new(seed);
    let mut tape = Vec::new();
    while !run.over() {
        let best = bot_lane(&run, horizon);
        let input = if best != run.target() {
            tape.extend_from_slice(&(run.tick() as u16).to_le_bytes());
            tape.push(best);
            Some(best)
        } else {
            None
        };
        run.step(input);
    }
    tape
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

/// The bot playing a lapped run: lap k is played on `seeds[k]`. Returns each lap's tape.
pub(crate) fn bot_laps(seeds: &[u64], horizon: u32) -> Vec<Vec<u8>> {
    let mut run = Run::new(seeds[0]);
    let mut tapes = vec![Vec::new(); seeds.len()];
    let end = seeds.len() as u32 * LAP_TICKS;
    while !run.over() && run.tick() < end {
        let k = (run.tick() / LAP_TICKS) as usize;
        if k > 0 && run.tick() == k as u32 * LAP_TICKS {
            run.reseed(seeds[k]);
        }
        let best = bot_lane(&run, horizon);
        let input = if best != run.target() {
            tapes[k].extend_from_slice(&(run.tick() as u16).to_le_bytes());
            tapes[k].push(best);
            Some(best)
        } else {
            None
        };
        run.step(input);
    }
    tapes
}

/// Game ABI v2 bytes for a lapped run.
pub(crate) fn encode_laps(seeds: &[u64], tapes: &[Vec<u8>]) -> Vec<u8> {
    let mut raw = vec![seeds.len() as u8];
    for (seed, tape) in seeds.iter().zip(tapes) {
        raw.extend_from_slice(&seed.to_le_bytes());
        raw.extend_from_slice(&(tape.len() as u16).to_le_bytes());
        raw.extend_from_slice(tape);
    }
    raw
}

fn laps_of<'a>(seeds: &[u64], tapes: &'a [Vec<u8>]) -> Vec<Lap<'a>> {
    seeds.iter().zip(tapes).map(|(seed, tape)| Lap { seed: *seed, tape }).collect()
}

/// A clumsy player: changes lane on a fixed rhythm whatever is coming.
fn rhythm_tape(every: u32) -> Vec<u8> {
    let mut tape = Vec::new();
    let mut tick = every;
    let mut lane = 0u8;
    while tick < MAX_TICKS {
        tape.extend_from_slice(&(tick as u16).to_le_bytes());
        tape.push(lane);
        lane = (lane + 2) % LANES;
        tick += every;
    }
    tape
}

#[test]
fn replay_matches_live_play() {
    let seed = 0x1234_5678_9abc_def0;
    let tape = bot_tape(seed, BOT_HORIZON);
    let mut live = Run::new(seed);
    let mut cursor = 0;
    while !live.over() {
        let mut input = None;
        if cursor < tape.len() && u16::from_le_bytes([tape[cursor], tape[cursor + 1]]) as u32 == live.tick() {
            input = Some(tape[cursor + 2]);
            cursor += 3;
        }
        live.step(input);
    }
    assert_eq!(replay(seed, &tape).unwrap(), live.outcome());
}

#[test]
fn malformed_tapes_are_rejected() {
    assert_eq!(replay(1, &[0, 0]), Err(TapeError::Length));
    assert_eq!(replay(1, &[5, 0, 1, 5, 0, 2]), Err(TapeError::Order));
    assert_eq!(replay(1, &[5, 0, 3]), Err(TapeError::Lane));
    let late = (MAX_TICKS as u16).to_le_bytes();
    assert_eq!(replay(1, &[late[0], late[1], 0]), Err(TapeError::Late));
}

#[test]
fn the_same_tape_on_another_course_scores_differently() {
    let tape = bot_tape(42, BOT_HORIZON);
    assert_ne!(replay(42, &tape).unwrap().score, replay(43, &tape).unwrap().score);
}

#[test]
fn write_wasm_fixtures() {
    let seeds: [u64; 6] = [1, 7, 42, 0xdead_beef, 0x1234_5678_9abc_def0, u64::MAX];
    let mut cases: Vec<(u64, Vec<u8>)> = seeds.iter().map(|&seed| (seed, bot_tape(seed, BOT_HORIZON))).collect();
    cases.push((42, Vec::new()));
    cases.push((42, rhythm_tape(20)));

    let fixtures: Vec<String> = cases
        .iter()
        .map(|(seed, tape)| {
            let outcome = replay(*seed, tape).expect("legal tape");
            format!(
                "{{\"seed\":\"{seed}\",\"tape\":\"{}\",\"score\":\"{}\",\"ticks\":{}}}",
                tape.iter().map(|b| format!("{b:02x}")).collect::<String>(),
                outcome.score,
                outcome.ticks
            )
        })
        .collect();
    let mut fixtures = fixtures;
    for seeds in [&LAP_SEEDS[..], &LAP_SEEDS[..3], &[7, 70, 700, 7_000, 70_000][..]] {
        let tapes = bot_laps(seeds, BOT_HORIZON);
        let raw = encode_laps(seeds, &tapes);
        let outcome = replay_encoded(&raw).expect("legal laps");
        fixtures.push(format!(
            "{{\"laps\":\"{}\",\"score\":\"{}\"}}",
            raw.iter().map(|b| format!("{b:02x}")).collect::<String>(),
            outcome.score
        ));
    }
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../game-wasm/fixtures.json");
    std::fs::write(&path, format!("[\n{}\n]\n", fixtures.join(",\n"))).expect("write fixtures");
}

/// Rows after the bot rides until tick 100, the player switches to `lane`, and the run goes on to
/// `tick`. Only rows nearer than `within` are returned.
fn rows_after(seed: u64, lane: u8, tick: u32, within: i32) -> Vec<(i32, u8, u8)> {
    let mut run = Run::new(seed);
    while run.tick() < 100 && !run.over() {
        let next = bot_lane(&run, BOT_HORIZON);
        run.step(Some(next));
    }
    assert!(!run.over(), "the bot survives to the split");
    run.step(Some(lane));
    while run.tick() < tick && !run.over() {
        run.step(None);
    }
    run.rows().iter().filter(|row| row.y < within).map(|row| (row.y, row.blocked, row.coin)).collect()
}

#[test]
fn the_road_ahead_depends_on_the_lane_the_player_chose() {
    let seed = 0x0bad_5eed;
    // Rows already on screen when the player chooses are the same whatever they chose.
    let on_screen = VIEW_DEPTH - 1_000;
    assert_eq!(rows_after(seed, 0, 102, on_screen), rows_after(seed, 2, 102, on_screen));
    // Rows that appear on the horizon after the choice differ, so the road splits.
    assert_ne!(rows_after(seed, 0, 400, i32::MAX), rows_after(seed, 2, 400, i32::MAX));
}

const LAP_SEEDS: [u64; 5] = [11, 22, 33, 44, 55];

#[test]
fn a_lapped_run_replays_to_the_score_it_was_played_for() {
    let tapes = bot_laps(&LAP_SEEDS, BOT_HORIZON);
    let outcome = replay_laps(&laps_of(&LAP_SEEDS, &tapes)).expect("legal laps");
    assert!(!outcome.crashed, "the bot survives all five laps");
    assert_eq!(outcome.ticks, MAX_TICKS);
    assert_eq!(replay_encoded(&encode_laps(&LAP_SEEDS, &tapes)).unwrap(), outcome);
}

#[test]
fn later_laps_follow_their_own_seed() {
    let tapes = bot_laps(&LAP_SEEDS, BOT_HORIZON);
    let mut other = LAP_SEEDS;
    other[3] = 4_444;
    // The same moves on a different fourth-lap road score something else.
    let original = replay_laps(&laps_of(&LAP_SEEDS, &tapes)).unwrap();
    let moved = replay_laps(&laps_of(&other, &tapes)).unwrap();
    assert_ne!(original, moved);
}

#[test]
fn a_move_outside_its_lap_is_rejected() {
    let mut tapes = bot_laps(&LAP_SEEDS[..2], BOT_HORIZON);
    // A second-lap move filed under the first lap.
    let late = (LAP_TICKS as u16).to_le_bytes();
    tapes[0].extend_from_slice(&[late[0], late[1], 0]);
    assert_eq!(replay_laps(&laps_of(&LAP_SEEDS[..2], &tapes)), Err(TapeError::Late));
}

#[test]
fn a_partial_run_ends_after_its_last_sealed_lap() {
    let tapes = bot_laps(&LAP_SEEDS[..2], BOT_HORIZON);
    let outcome = replay_laps(&laps_of(&LAP_SEEDS[..2], &tapes)).unwrap();
    assert_eq!(outcome.ticks, 2 * LAP_TICKS);
    assert_eq!(replay_laps(&[]), Err(TapeError::Laps));
    assert_eq!(replay_encoded(&[6]), Err(TapeError::Laps));
}

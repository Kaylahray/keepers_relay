//! The lane runner's rules on their own, off chain: determinism, tape validation, and the fixtures
//! `game-wasm/compare.mjs` uses to check the browser build scores exactly what the chain scores.
//! The on-chain checks (spawned game, cycles, copied runs) are the steal tests in `tests.rs`.

use crowns_game_core::{replay, Run, TapeError, LANES, MAX_TICKS};
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
        let mut best = run.target();
        let mut best_key = (0, 0, 0);
        for lane in 0..LANES {
            let (alive, coins) = holds(&run, lane, horizon);
            let key = (alive, coins, (lane == run.target()) as u32);
            if key > best_key {
                best_key = key;
                best = lane;
            }
        }
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
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("../game-wasm/fixtures.json");
    std::fs::write(&path, format!("[\n{}\n]\n", fixtures.join(",\n"))).expect("write fixtures");
}

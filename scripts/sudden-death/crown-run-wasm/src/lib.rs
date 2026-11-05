//! Thin C ABI over `crowns-crown-run-core` for the browser. No wasm-bindgen: one live run per
//! instance, plus a buffer for replays. Seeds cross as two u32 halves to avoid BigInt plumbing.

use crowns_crown_run_core::{replay_encoded, Run, EVENT_LEN, LAPS, MAX_EVENTS, MAX_PICK_BYTES, UPGRADES};
use std::cell::RefCell;

thread_local! {
    static RUN: RefCell<Run> = RefCell::new(Run::new(0));
    // Room for a whole run in game ABI v2: a count byte, then a seed and length per lap, then moves and picks.
    static BUFFER: RefCell<Vec<u8>> = RefCell::new(vec![0; 1 + LAPS * 10 + MAX_EVENTS * EVENT_LEN + MAX_PICK_BYTES]);
}

fn seed(hi: u32, lo: u32) -> u64 {
    ((hi as u64) << 32) | lo as u64
}

#[no_mangle]
pub extern "C" fn run_new(hi: u32, lo: u32) {
    RUN.with(|run| *run.borrow_mut() = Run::new(seed(hi, lo)));
}

/// `lane` 0..=2 sets the target this tick; anything else means no input.
#[no_mangle]
pub extern "C" fn run_step(lane: u32) {
    let input = if lane < 3 { Some(lane as u8) } else { None };
    RUN.with(|run| run.borrow_mut().step(input));
}

/// Starts the next lap's random numbers; everything else carries over.
#[no_mangle]
pub extern "C" fn run_reseed(hi: u32, lo: u32) {
    RUN.with(|run| run.borrow_mut().reseed(seed(hi, lo)));
}

/// Applies a clean lap's picks. `upgrade` of 255 means none. Returns 1 if they were legal.
#[no_mangle]
pub extern "C" fn run_choose(upgrade: u32, road: u32) -> u32 {
    let pick = if upgrade < UPGRADES as u32 { Some(upgrade as u8) } else { None };
    RUN.with(|run| run.borrow_mut().choose(pick, road as u8).is_ok() as u32)
}

#[no_mangle]
pub extern "C" fn run_over() -> u32 {
    RUN.with(|run| run.borrow().over() as u32)
}

#[no_mangle]
pub extern "C" fn run_crashed() -> u32 {
    RUN.with(|run| run.borrow().crashed() as u32)
}

#[no_mangle]
pub extern "C" fn run_tick() -> u32 {
    RUN.with(|run| run.borrow().tick())
}

/// The lane the player is heading for, 0 to 2.
#[no_mangle]
pub extern "C" fn run_target() -> u32 {
    RUN.with(|run| run.borrow().target() as u32)
}

#[no_mangle]
pub extern "C" fn run_x() -> i32 {
    RUN.with(|run| run.borrow().x())
}

#[no_mangle]
pub extern "C" fn run_speed() -> i32 {
    RUN.with(|run| run.borrow().road_speed())
}

#[no_mangle]
pub extern "C" fn run_score() -> f64 {
    RUN.with(|run| run.borrow().outcome().score as f64)
}

#[no_mangle]
pub extern "C" fn run_coins() -> u32 {
    RUN.with(|run| run.borrow().outcome().coins)
}

/// Bit `n` set: upgrade `n` is owned.
#[no_mangle]
pub extern "C" fn run_owned() -> u32 {
    RUN.with(|run| run.borrow().owned() as u32)
}

#[no_mangle]
pub extern "C" fn run_road() -> u32 {
    RUN.with(|run| run.borrow().road() as u32)
}

#[no_mangle]
pub extern "C" fn run_shield_ready() -> u32 {
    RUN.with(|run| run.borrow().shield_ready() as u32)
}

#[no_mangle]
pub extern "C" fn run_streak() -> u32 {
    RUN.with(|run| run.borrow().streak())
}

#[no_mangle]
pub extern "C" fn run_row_count() -> u32 {
    RUN.with(|run| run.borrow().rows().len() as u32)
}

/// Packs a row as `y << 12 | shift << 8 | coin << 4 | blocked`.
#[no_mangle]
pub extern "C" fn run_row(i: u32) -> i32 {
    RUN.with(|run| {
        let run = run.borrow();
        let row = run.rows()[i as usize];
        (row.y << 12) | ((row.shift as i32) << 8) | ((row.coin as i32) << 4) | row.blocked as i32
    })
}

#[no_mangle]
pub extern "C" fn buffer_ptr() -> *mut u8 {
    BUFFER.with(|buffer| buffer.borrow_mut().as_mut_ptr())
}

/// Score of the first `len` buffer bytes read as a run in game ABI v2, or -1 for an illegal run.
#[no_mangle]
pub extern "C" fn replay_run(len: u32) -> f64 {
    BUFFER.with(|buffer| {
        let buffer = buffer.borrow();
        let len = (len as usize).min(buffer.len());
        match replay_encoded(&buffer[..len]) {
            Ok(outcome) => outcome.score as f64,
            Err(_) => -1.0,
        }
    })
}

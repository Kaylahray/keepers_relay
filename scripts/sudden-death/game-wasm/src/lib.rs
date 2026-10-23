//! Thin C ABI over `crowns-game-core` for the browser. No wasm-bindgen: one live run per instance,
//! plus a tape buffer for `replay`. Seeds cross as two u32 halves to avoid BigInt plumbing.

use crowns_game_core::{replay as replay_tape, Run, MAX_EVENTS, EVENT_LEN};
use std::cell::RefCell;

thread_local! {
    static RUN: RefCell<Run> = RefCell::new(Run::new(0));
    static TAPE: RefCell<Vec<u8>> = RefCell::new(vec![0; MAX_EVENTS * EVENT_LEN]);
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

#[no_mangle]
pub extern "C" fn run_over() -> u32 {
    RUN.with(|run| run.borrow().over() as u32)
}

#[no_mangle]
pub extern "C" fn run_tick() -> u32 {
    RUN.with(|run| run.borrow().tick())
}

#[no_mangle]
pub extern "C" fn run_x() -> i32 {
    RUN.with(|run| run.borrow().x())
}

#[no_mangle]
pub extern "C" fn run_score() -> f64 {
    RUN.with(|run| run.borrow().outcome().score as f64)
}

#[no_mangle]
pub extern "C" fn run_row_count() -> u32 {
    RUN.with(|run| run.borrow().rows().len() as u32)
}

/// Packs a row as `y << 8 | coin << 4 | blocked`.
#[no_mangle]
pub extern "C" fn run_row(i: u32) -> i32 {
    RUN.with(|run| {
        let run = run.borrow();
        let row = run.rows()[i as usize];
        (row.y << 8) | ((row.coin as i32) << 4) | row.blocked as i32
    })
}

#[no_mangle]
pub extern "C" fn tape_ptr() -> *mut u8 {
    TAPE.with(|tape| tape.borrow_mut().as_mut_ptr())
}

/// Score of the first `len` tape bytes from the seed, or -1 for an illegal tape.
#[no_mangle]
pub extern "C" fn replay(hi: u32, lo: u32, len: u32) -> f64 {
    TAPE.with(|tape| {
        let tape = tape.borrow();
        let len = (len as usize).min(tape.len());
        match replay_tape(seed(hi, lo), &tape[..len]) {
            Ok(outcome) => outcome.score as f64,
            Err(_) => -1.0,
        }
    })
}

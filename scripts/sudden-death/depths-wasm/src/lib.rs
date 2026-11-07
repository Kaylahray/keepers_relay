//! Thin C ABI over `crowns-depths-core` for the browser. No wasm-bindgen: one live run per
//! instance, plus a buffer for replays. Seeds cross as two u32 halves to avoid BigInt plumbing.

use crowns_depths_core::{replay_encoded, Depths, EVENT_LEN, FLOORS, LEFT, MAX_EVENTS, PICK_LEN};
use std::cell::RefCell;

thread_local! {
    static RUN: RefCell<Depths> = RefCell::new(Depths::new(0));
    // Room for a whole run in game ABI v2: a count byte, then a seed and length per floor, then moves and picks.
    static BUFFER: RefCell<Vec<u8>> = RefCell::new(vec![0; 1 + FLOORS * (10 + MAX_EVENTS * EVENT_LEN + PICK_LEN)]);
}

fn seed(hi: u32, lo: u32) -> u64 {
    ((hi as u64) << 32) | lo as u64
}

fn dir(value: u32) -> Option<u8> {
    if value <= LEFT as u32 { Some(value as u8) } else { None }
}

#[no_mangle]
pub extern "C" fn dn_new(hi: u32, lo: u32) {
    RUN.with(|run| *run.borrow_mut() = Depths::new(seed(hi, lo)));
}

/// Goes down to the next floor; everything the player carries comes along.
#[no_mangle]
pub extern "C" fn dn_descend(hi: u32, lo: u32) {
    RUN.with(|run| run.borrow_mut().descend(seed(hi, lo)));
}

/// One tick. `value` 0..=3 is a step this tick; anything else means none. Returns 1 if it was legal.
#[no_mangle]
pub extern "C" fn dn_step(value: u32) -> u32 {
    RUN.with(|run| run.borrow_mut().step(dir(value)) as u32)
}

#[no_mangle]
pub extern "C" fn dn_step_ok(value: u32) -> u32 {
    RUN.with(|run| dir(value).is_some_and(|d| run.borrow().step_ok(d)) as u32)
}

/// Applies a cleared floor's picks. Returns 1 if they were legal.
#[no_mangle]
pub extern "C" fn dn_choose(relic: u32, stairs: u32) -> u32 {
    RUN.with(|run| run.borrow_mut().choose(relic as u8, stairs as u8).is_ok() as u32)
}

#[no_mangle]
pub extern "C" fn dn_floor_over() -> u32 {
    RUN.with(|run| run.borrow().floor_over() as u32)
}

#[no_mangle]
pub extern "C" fn dn_cleared() -> u32 {
    RUN.with(|run| run.borrow().cleared() as u32)
}

#[no_mangle]
pub extern "C" fn dn_fallen() -> u32 {
    RUN.with(|run| run.borrow().fallen() as u32)
}

#[no_mangle]
pub extern "C" fn dn_tick() -> u32 {
    RUN.with(|run| run.borrow().tick())
}

#[no_mangle]
pub extern "C" fn dn_torch() -> u32 {
    RUN.with(|run| run.borrow().torch())
}

#[no_mangle]
pub extern "C" fn dn_x() -> i32 {
    RUN.with(|run| run.borrow().x())
}

#[no_mangle]
pub extern "C" fn dn_y() -> i32 {
    RUN.with(|run| run.borrow().y())
}

#[no_mangle]
pub extern "C" fn dn_hp() -> i32 {
    RUN.with(|run| run.borrow().hp())
}

#[no_mangle]
pub extern "C" fn dn_max_hp() -> i32 {
    RUN.with(|run| run.borrow().max_hp())
}

#[no_mangle]
pub extern "C" fn dn_score() -> f64 {
    RUN.with(|run| run.borrow().outcome().score as f64)
}

#[no_mangle]
pub extern "C" fn dn_gold() -> u32 {
    RUN.with(|run| run.borrow().outcome().gold)
}

#[no_mangle]
pub extern "C" fn dn_slain() -> u32 {
    RUN.with(|run| run.borrow().outcome().slain)
}

#[no_mangle]
pub extern "C" fn dn_floor() -> u32 {
    RUN.with(|run| run.borrow().floor() as u32)
}

#[no_mangle]
pub extern "C" fn dn_stairs() -> u32 {
    RUN.with(|run| run.borrow().stairs_kind() as u32)
}

/// Bit `n` set: relic `n` is owned.
#[no_mangle]
pub extern "C" fn dn_owned() -> u32 {
    RUN.with(|run| run.borrow().owned() as u32)
}

#[no_mangle]
pub extern "C" fn dn_has_key() -> u32 {
    RUN.with(|run| run.borrow().has_key() as u32)
}

/// 1 while a hit just landed and the player can't be hit again yet.
#[no_mangle]
pub extern "C" fn dn_guarded() -> u32 {
    RUN.with(|run| run.borrow().guarded() as u32)
}

/// Bit `n` set: the player has walked into room `n`.
#[no_mangle]
pub extern "C" fn dn_seen() -> u32 {
    RUN.with(|run| {
        let run = run.borrow();
        (0..9).filter(|room| run.seen(*room)).fold(0, |bits, room| bits | 1 << room)
    })
}

/// A map tile packed as `item << 4 | tile`.
#[no_mangle]
pub extern "C" fn dn_cell(x: i32, y: i32) -> u32 {
    RUN.with(|run| {
        let run = run.borrow();
        ((run.item(x, y) as u32) << 4) | run.tile(x, y) as u32
    })
}

#[no_mangle]
pub extern "C" fn dn_monster_count(room: u32) -> u32 {
    RUN.with(|run| run.borrow().monsters(room as usize).len() as u32)
}

/// A room's monster packed as `hp << 24 | placed << 20 | kind << 16 | y << 8 | x`.
#[no_mangle]
pub extern "C" fn dn_monster(room: u32, slot: u32) -> u32 {
    RUN.with(|run| {
        let run = run.borrow();
        let monsters = run.monsters(room as usize);
        match monsters.get(slot as usize) {
            Some(m) => ((m.hp.max(0) as u32) << 24) | ((m.placed as u32) << 20) | ((m.kind as u32) << 16) | ((m.y as u32) << 8) | m.x as u32,
            None => 0,
        }
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
